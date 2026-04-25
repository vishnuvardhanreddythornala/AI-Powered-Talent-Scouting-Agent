"""
RabbitMQ consumer worker for background Interest Score calculation.
Listens to 'interest_scoring' queue, fetches Q&A from DB,
calls Groq llama3-70b for evaluation, updates DB.
"""

import asyncio
import json
import logging
import os
import sys
import time

import pika
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings
from database import async_session_factory, engine
from models import Application, Interview, InterviewQnA, Base
from services.groq_service import evaluate_interest_score

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)-25s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("interest_scorer")

settings = get_settings()


async def init_worker_db():
    """Initialize DB tables for the worker process."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ Worker DB initialized")


async def process_scoring_task(qna_id: str) -> None:
    """
    Process a single interest scoring task:
    1. Fetch the Q&A record from DB
    2. Call Groq llama3-70b for interest evaluation
    3. Update the QnA record with the score
    4. Recalculate and update the application's final_interest_score average
    """
    async with async_session_factory() as session:
        try:
            # Fetch the QnA record
            result = await session.execute(
                select(InterviewQnA).where(InterviewQnA.id == qna_id)
            )
            qna = result.scalar_one_or_none()

            if not qna:
                logger.error("QnA record not found: %s", qna_id)
                return

            if not qna.candidate_answer:
                logger.warning("QnA %s has no answer, skipping", qna_id)
                return

            if qna.interest_score is not None:
                logger.info("QnA %s already scored, skipping", qna_id)
                return

            # Get the job title for context
            result = await session.execute(
                select(Interview).where(Interview.id == qna.interview_id)
            )
            interview = result.scalar_one_or_none()
            if not interview:
                logger.error("Interview not found for QnA %s", qna_id)
                return

            result = await session.execute(
                select(Application).where(Application.id == interview.application_id)
            )
            application = result.scalar_one_or_none()
            if not application:
                logger.error("Application not found for interview %s", interview.id)
                return

            job_title = "the position"
            if application.job:
                job_title = application.job.title

            # Call Groq for interest score evaluation
            evaluation = await evaluate_interest_score(
                question=qna.ai_question,
                answer=qna.candidate_answer,
                job_title=job_title,
            )

            # Update QnA record
            qna.interest_score = evaluation.interest_score
            qna.score_reasoning = evaluation.reasoning
            await session.flush()

            logger.info(
                "✅ Scored QnA %s: %d/100 — %s",
                qna_id, evaluation.interest_score, evaluation.reasoning[:60],
            )

            # Recalculate application's final_interest_score (average of all scored QnAs)
            result = await session.execute(
                select(func.avg(InterviewQnA.interest_score))
                .join(Interview, InterviewQnA.interview_id == Interview.id)
                .where(
                    Interview.application_id == application.id,
                    InterviewQnA.interest_score.isnot(None),
                )
            )
            avg_score = result.scalar()

            if avg_score is not None:
                application.final_interest_score = round(float(avg_score), 1)
                await session.flush()
                logger.info(
                    "📊 Updated application %s final_interest_score: %.1f",
                    application.id, application.final_interest_score,
                )

            await session.commit()

        except Exception as e:
            logger.error("Error processing QnA %s: %s", qna_id, e, exc_info=True)
            await session.rollback()


def on_message(ch, method, properties, body):
    """Callback for each RabbitMQ message."""
    try:
        payload = json.loads(body)
        qna_id = payload.get("qna_id")
        if not qna_id:
            logger.error("Message missing qna_id: %s", body)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        logger.info("📥 Received scoring task for QnA: %s", qna_id)

        # Run the async processing in the event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(process_scoring_task(qna_id))
        else:
            loop.run_until_complete(process_scoring_task(qna_id))

        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        logger.error("Error handling message: %s", e, exc_info=True)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)


def start_consumer():
    """Start the RabbitMQ consumer with retry logic."""
    logger.info("🐰 Starting Interest Scorer Worker...")

    # Initialize DB
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init_worker_db())

    max_retries = 30
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            credentials = pika.PlainCredentials(
                settings.RABBITMQ_USER, settings.RABBITMQ_PASSWORD
            )
            params = pika.ConnectionParameters(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )

            connection = pika.BlockingConnection(params)
            channel = connection.channel()

            channel.queue_declare(queue="interest_scoring", durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(
                queue="interest_scoring",
                on_message_callback=on_message,
            )

            logger.info("✅ Connected to RabbitMQ. Waiting for scoring tasks...")
            channel.start_consuming()

        except pika.exceptions.AMQPConnectionError as e:
            logger.warning(
                "RabbitMQ connection failed (attempt %d/%d): %s",
                attempt + 1, max_retries, e,
            )
            time.sleep(retry_delay)
        except KeyboardInterrupt:
            logger.info("Worker stopped by user")
            break
        except Exception as e:
            logger.error("Unexpected error: %s", e, exc_info=True)
            time.sleep(retry_delay)

    logger.info("👋 Worker shutdown")


if __name__ == "__main__":
    start_consumer()
