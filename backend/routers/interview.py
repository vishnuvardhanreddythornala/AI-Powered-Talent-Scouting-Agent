"""
Interview router — Audio upload, Whisper transcription,
Redis rolling context, question generation, RabbitMQ publish.
"""

import asyncio
import json
import logging
import os
import tempfile
import uuid

import pika
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Application, Interview, InterviewQnA, Job
from schemas import AudioSubmissionResponse
from services.groq_service import generate_next_question, transcribe_audio
from services.redis_service import (
    get_interview_state,
    update_current_question,
    clear_interview_context,
)
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


def publish_to_rabbitmq(qna_id: str) -> None:
    """Publish a scoring task to RabbitMQ."""
    try:
        credentials = pika.PlainCredentials(
            settings.RABBITMQ_USER, settings.RABBITMQ_PASSWORD
        )
        params = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=credentials,
            connection_attempts=3,
            retry_delay=2,
        )
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.queue_declare(queue="interest_scoring", durable=True)
        channel.basic_publish(
            exchange="",
            routing_key="interest_scoring",
            body=json.dumps({"qna_id": qna_id}),
            properties=pika.BasicProperties(delivery_mode=2),
        )
        connection.close()
        logger.info("📤 Published scoring task for QnA %s", qna_id)
    except Exception as e:
        logger.error("Failed to publish to RabbitMQ: %s", e)


@router.post("/{interview_id}/submit-audio", response_model=AudioSubmissionResponse)
async def submit_audio(
    interview_id: uuid.UUID,
    audio: UploadFile = File(...),
    q_number: int = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive candidate audio blob, transcribe, save, generate next Q, publish to RabbitMQ.
    """
    # Validate interview exists
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.is_deleted == False,  # noqa: E712
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.status == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed")

    # Save audio to temp file
    ext = ".webm"
    if audio.content_type and "mp4" in audio.content_type:
        ext = ".mp4"
    elif audio.content_type and "ogg" in audio.content_type:
        ext = ".ogg"

    temp_path = os.path.join(
        tempfile.gettempdir(), f"audio_{uuid.uuid4().hex}{ext}"
    )
    try:
        content = await audio.read()
        logger.info(
            "📎 Audio upload Q%d: content_type=%s, size=%d bytes (%.1f KB)",
            q_number, audio.content_type, len(content), len(content)/1024
        )
        with open(temp_path, "wb") as f:
            f.write(content)

        try:
            # Transcribe with Whisper
            transcript = await transcribe_audio(temp_path, audio.content_type or "audio/webm")
        except Exception as e:
            logger.error("Audio transcription failed: %s", str(e), exc_info=True)
            raise HTTPException(status_code=500, detail="Audio transcription failed. Please try again.")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if not transcript or len(transcript.strip()) < 2:
        transcript = "[No audible response detected]"

    # Find the QnA record for this question
    result = await db.execute(
        select(InterviewQnA).where(
            InterviewQnA.interview_id == interview_id,
            InterviewQnA.q_number == q_number,
        )
    )
    qna = result.scalar_one_or_none()
    if not qna:
        raise HTTPException(status_code=404, detail=f"Question {q_number} not found")

    # Save transcript
    qna.candidate_answer = transcript
    await db.flush()

    # Update current question in Redis state
    try:
        await update_current_question(str(interview_id), q_number)
    except Exception as e:
        logger.warning("Redis context update failed: %s", e)

    # Update interview progress
    interview.questions_completed = q_number
    await db.flush()

    # Check if interview is complete
    is_complete = q_number >= interview.total_allocated_questions
    
    if is_complete:
        interview.status = "completed"
        await db.flush()
        try:
            await clear_interview_context(str(interview_id))
        except Exception:
            pass
        logger.info("✅ Interview %s completed", interview_id)

    # IMPORTANT: Commit the transaction BEFORE publishing to RabbitMQ.
    # The worker runs in a separate process and queries the DB independently.
    # If we publish before committing, the worker sees old status/answers.
    await db.commit()

    # Now publish to RabbitMQ for background interest scoring (non-blocking)
    try:
        await asyncio.to_thread(publish_to_rabbitmq, str(qna.id))
    except Exception as e:
        logger.warning("RabbitMQ publish failed: %s", e)

    next_question = None

    if not is_complete:
        # Generate next question
        # Get interview state from Redis
        state = await get_interview_state(str(interview_id))
        job_title = state["job_title"] if state else "the position"
        cv_summary = state["cv_summary"] if state else ""
        jd_summary = state.get("jd_summary", "") if state else ""

        # Get FULL context from database
        history_result = await db.execute(
            select(InterviewQnA)
            .where(InterviewQnA.interview_id == interview_id, InterviewQnA.candidate_answer.isnot(None))
            .order_by(InterviewQnA.q_number.asc())
        )
        history_items = history_result.scalars().all()
        recent = [{"question": item.ai_question, "answer": item.candidate_answer} for item in history_items]

        try:
            next_question = await generate_next_question(
                job_title=job_title,
                cv_summary=cv_summary,
                jd_summary=jd_summary,
                current_q=q_number + 1,
                total_q=interview.total_allocated_questions,
                recent_context=recent,
                last_answer=transcript,
            )
        except Exception as e:
            logger.error("Failed to generate next question: %s", str(e), exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to generate the next question. The AI service may be temporarily unavailable or rate-limited.")

        # Save next question to DB
        next_qna = InterviewQnA(
            interview_id=interview_id,
            q_number=q_number + 1,
            ai_question=next_question,
        )
        db.add(next_qna)
        await db.flush()
        await db.commit()

    return AudioSubmissionResponse(
        transcript=transcript,
        next_question=next_question,
        is_complete=is_complete,
        questions_completed=q_number,
        total_questions=interview.total_allocated_questions,
    )


@router.get("/{interview_id}/history")
async def get_interview_history(
    interview_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the full Q&A history for an interview."""
    result = await db.execute(
        select(InterviewQnA)
        .where(InterviewQnA.interview_id == interview_id)
        .order_by(InterviewQnA.q_number.asc())
    )
    qna_items = result.scalars().all()

    return [
        {
            "id": str(item.id),
            "q_number": item.q_number,
            "ai_question": item.ai_question,
            "candidate_answer": item.candidate_answer,
            "interest_score": item.interest_score,
            "score_reasoning": item.score_reasoning,
        }
        for item in qna_items
    ]
