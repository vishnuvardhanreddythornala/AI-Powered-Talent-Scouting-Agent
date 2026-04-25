"""
Redis service for rolling window conversation context.
Stores the last N Q&A pairs per interview to avoid passing full
chat history to the LLM (preventing token limit issues).
"""

import json
import logging
from typing import List, Dict, Optional
import redis.asyncio as aioredis
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Global Redis client ─────────────────────────
_redis: Optional[aioredis.Redis] = None

# Key prefix and TTL
KEY_PREFIX = "interview_context"
CONTEXT_TTL = 7200  # 2 hours


async def get_redis() -> aioredis.Redis:
    """Get or create the async Redis connection."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info("✅ Redis client connected to %s", settings.REDIS_URL)
    return _redis


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
        logger.info("🔌 Redis connection closed")


def _context_key(interview_id: str) -> str:
    """Generate the Redis key for an interview's rolling context."""
    return f"{KEY_PREFIX}:{interview_id}"


async def store_interview_state(
    interview_id: str,
    total_questions: int,
    job_title: str,
    cv_summary: str,
) -> None:
    """Store initial interview metadata in Redis."""
    r = await get_redis()
    state_key = f"{KEY_PREFIX}:state:{interview_id}"
    state = {
        "total_questions": total_questions,
        "job_title": job_title,
        "cv_summary": cv_summary,
        "current_q": 0,
    }
    await r.set(state_key, json.dumps(state), ex=CONTEXT_TTL)
    logger.info("Stored interview state for %s", interview_id)


async def get_interview_state(interview_id: str) -> Optional[Dict]:
    """Retrieve interview metadata from Redis."""
    r = await get_redis()
    state_key = f"{KEY_PREFIX}:state:{interview_id}"
    data = await r.get(state_key)
    if data:
        return json.loads(data)
    return None


async def update_current_question(interview_id: str, q_number: int) -> None:
    """Update the current question number in Redis state."""
    r = await get_redis()
    state_key = f"{KEY_PREFIX}:state:{interview_id}"
    data = await r.get(state_key)
    if data:
        state = json.loads(data)
        state["current_q"] = q_number
        await r.set(state_key, json.dumps(state), ex=CONTEXT_TTL)


async def push_qna_context(
    interview_id: str,
    question: str,
    answer: str,
) -> None:
    """Push a Q&A pair into the rolling window context list."""
    r = await get_redis()
    key = _context_key(interview_id)
    entry = json.dumps({"question": question, "answer": answer})

    # Push to list and trim to keep only last 4 entries (we fetch last 2 but keep buffer)
    await r.rpush(key, entry)
    await r.ltrim(key, -4, -1)
    await r.expire(key, CONTEXT_TTL)
    logger.debug("Pushed Q&A to context for interview %s", interview_id)


async def get_recent_context(
    interview_id: str,
    count: int = 2,
) -> List[Dict]:
    """Fetch the last N Q&A pairs from the rolling window."""
    r = await get_redis()
    key = _context_key(interview_id)

    # Get last `count` entries
    entries = await r.lrange(key, -count, -1)
    result = [json.loads(e) for e in entries]
    logger.debug("Fetched %d recent context entries for %s", len(result), interview_id)
    return result


async def clear_interview_context(interview_id: str) -> None:
    """Clear all Redis data for a completed interview."""
    r = await get_redis()
    key = _context_key(interview_id)
    state_key = f"{KEY_PREFIX}:state:{interview_id}"
    await r.delete(key, state_key)
    logger.info("Cleared Redis context for interview %s", interview_id)
