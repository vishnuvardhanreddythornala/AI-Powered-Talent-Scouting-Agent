"""
Applications router — CV upload, match score calculation, interview initialization.
"""

import logging
import os
import tempfile
import uuid
from typing import List

import fitz  # PyMuPDF
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Application, Candidate, Interview, InterviewQnA, Job
from schemas import ApplicationResponse, InterviewStateResponse
from services.groq_service import extract_cv, generate_interview_blueprint, evaluate_match_score
from services.vector_service import calculate_match_score as vector_match_score
from services.redis_service import store_interview_state

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/apply", status_code=201)
async def apply_to_job(
    job_id: str = Form(...),
    cv_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Candidate applies to a job by uploading a CV.
    1. Extract CV text (PDF)
    2. Parse CV with AI
    3. Calculate match score via vector similarity
    4. Generate interview blueprint
    5. Create application + interview records
    """
    # Validate job exists
    job_uuid = uuid.UUID(job_id)
    result = await db.execute(
        select(Job).where(Job.id == job_uuid, Job.is_deleted == False)  # noqa: E712
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Extract text from CV PDF
    if not cv_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF CVs are accepted.")

    temp_path = os.path.join(tempfile.gettempdir(), f"cv_{uuid.uuid4().hex}.pdf")
    try:
        content = await cv_file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        doc = fitz.open(temp_path)
        cv_text = ""
        for page in doc:
            cv_text += page.get_text()
        doc.close()

        if not cv_text or len(cv_text) < 30:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from CV. Ensure it's a readable PDF.",
            )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    # Parse CV with AI
    cv_parsed = await extract_cv(cv_text)
    
    cv_data = cv_parsed.model_dump()
    cv_data["raw_text"] = cv_text

    # Find or create candidate
    result = await db.execute(
        select(Candidate).where(Candidate.email == cv_parsed.candidate_email)
    )
    candidate = result.scalar_one_or_none()

    if candidate:
        candidate.name = cv_parsed.candidate_name
        candidate.cv_parsed_json = cv_data
    else:
        candidate = Candidate(
            name=cv_parsed.candidate_name,
            email=cv_parsed.candidate_email,
            cv_parsed_json=cv_data,
        )
        db.add(candidate)

    await db.flush()
    await db.refresh(candidate)

    # Check if already applied
    result = await db.execute(
        select(Application).where(
            Application.job_id == job_uuid,
            Application.candidate_id == candidate.id,
            Application.is_deleted == False,  # noqa: E712
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Candidate has already applied to this job.",
        )

    # Calculate match score using Semantic Vector Similarity (primary)
    # Falls back to keyword matching if Qdrant/Sentence-Transformers unavailable
    jd_skills = job.must_haves or []
    cv_skills = cv_parsed.tech_stack or []
    match_score = 0
    try:
        match_score = await vector_match_score(str(job_uuid), cv_skills)
        logger.info("Vector match score: %d (Qdrant + Sentence-Transformers)", match_score)
    except Exception as e:
        logger.warning("Vector match failed, falling back to keyword matching: %s", e)
        try:
            match_score = await evaluate_match_score(jd_skills, cv_skills, cv_text)
            logger.info("Keyword match score (fallback): %d", match_score)
        except Exception as e2:
            logger.error("All match score methods failed: %s", e2)
            match_score = 0

    # Generate interview blueprint
    cv_summary = cv_parsed.recent_projects_summary
    jd_summary = f"{job.title}. Required skills: {', '.join(jd_skills[:10])}"
    blueprint = await generate_interview_blueprint(cv_summary, jd_summary, job.title)

    # Create application
    application = Application(
        job_id=job_uuid,
        candidate_id=candidate.id,
        match_score=match_score,
        status="interviewing",
    )
    db.add(application)
    await db.flush()
    await db.refresh(application)

    # Create interview
    interview = Interview(
        application_id=application.id,
        total_allocated_questions=blueprint.total_questions,
        questions_completed=0,
        status="in_progress",
    )
    db.add(interview)
    await db.flush()
    await db.refresh(interview)

    # Save first question in QnA
    first_qna = InterviewQnA(
        interview_id=interview.id,
        q_number=1,
        ai_question=blueprint.first_question,
    )
    db.add(first_qna)
    await db.flush()

    # Store interview state in Redis for rolling window context
    try:
        await store_interview_state(
            interview_id=str(interview.id),
            total_questions=blueprint.total_questions,
            job_title=job.title,
            cv_summary=cv_summary,
            jd_summary=jd_summary,
        )
    except Exception as e:
        logger.warning("Failed to store interview state in Redis: %s", e)

    logger.info(
        "✅ Application created: candidate=%s, job=%s, match=%d, interview=%s",
        candidate.name, job.title, match_score, interview.id,
    )

    return {
        "application_id": str(application.id),
        "candidate_id": str(candidate.id),
        "candidate_name": candidate.name,
        "match_score": match_score,
        "interview_id": str(interview.id),
        "total_questions": blueprint.total_questions,
        "first_question": blueprint.first_question,
        "job_title": job.title,
    }


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get application details."""
    result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.is_deleted == False,  # noqa: E712
        )
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.get("/{application_id}/interview")
async def get_interview_state(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the current interview state for a candidate."""
    result = await db.execute(
        select(Interview).where(
            Interview.application_id == application_id,
            Interview.is_deleted == False,  # noqa: E712
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Get the application + job + candidate info
    result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = result.scalar_one_or_none()
    job = application.job
    candidate = application.candidate

    # Get the latest unanswered question
    result = await db.execute(
        select(InterviewQnA)
        .where(
            InterviewQnA.interview_id == interview.id,
            InterviewQnA.candidate_answer == None,  # noqa: E711
        )
        .order_by(InterviewQnA.q_number.asc())
        .limit(1)
    )
    current_qna = result.scalar_one_or_none()

    if not current_qna:
        # All questions answered
        return InterviewStateResponse(
            interview_id=interview.id,
            application_id=application.id,
            job_title=job.title,
            candidate_name=candidate.name,
            current_question="Interview complete! Thank you for your time.",
            current_q_number=interview.total_allocated_questions,
            total_questions=interview.total_allocated_questions,
            status="completed",
        )

    return InterviewStateResponse(
        interview_id=interview.id,
        application_id=application.id,
        job_title=job.title,
        candidate_name=candidate.name,
        current_question=current_qna.ai_question,
        current_q_number=current_qna.q_number,
        total_questions=interview.total_allocated_questions,
        status=interview.status,
    )
