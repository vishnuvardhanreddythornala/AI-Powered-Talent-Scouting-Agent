"""
Vector service using Sentence-Transformers + Qdrant for Match Score calculation.
Converts JD skills and CV skills into vectors and computes cosine similarity.
"""

import logging
import numpy as np
from typing import List
from sentence_transformers import SentenceTransformer, util
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from config import get_settings
import uuid
import asyncio

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Globals (initialized lazily) ─────────────────
_model: SentenceTransformer = None
_qdrant: QdrantClient = None

JD_COLLECTION = "jd_skills"
VECTOR_DIM = 384  # all-MiniLM-L6-v2 output dimension


def _get_model() -> SentenceTransformer:
    """Lazy-load the sentence transformer model."""
    global _model
    if _model is None:
        logger.info("Loading SentenceTransformer model: all-MiniLM-L6-v2")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("✅ Model loaded successfully")
    return _model


def _get_qdrant() -> QdrantClient:
    """Lazy-load Qdrant client."""
    global _qdrant
    if _qdrant is None:
        logger.info("Connecting to Qdrant at %s:%s", settings.QDRANT_HOST, settings.QDRANT_PORT)
        _qdrant = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        logger.info("✅ Qdrant client connected")
    return _qdrant


async def init_vector_service():
    """Initialize the vector service (model + Qdrant collection)."""
    _get_model()
    qdrant = _get_qdrant()

    # Ensure the JD skills collection exists
    collections = qdrant.get_collections().collections
    collection_names = [c.name for c in collections]

    if JD_COLLECTION not in collection_names:
        qdrant.create_collection(
            collection_name=JD_COLLECTION,
            vectors_config=VectorParams(
                size=VECTOR_DIM,
                distance=Distance.COSINE,
            ),
        )
        logger.info("✅ Created Qdrant collection: %s", JD_COLLECTION)
    else:
        logger.info("Qdrant collection '%s' already exists", JD_COLLECTION)


def encode_skills(skills: List[str]) -> np.ndarray:
    """Encode a list of skills into a single averaged embedding vector."""
    model = _get_model()
    if not skills:
        return np.zeros(VECTOR_DIM)

    # Encode each skill individually, then average
    embeddings = model.encode(skills, normalize_embeddings=True)
    avg_embedding = np.mean(embeddings, axis=0)
    # Re-normalize the average
    norm = np.linalg.norm(avg_embedding)
    if norm > 0:
        avg_embedding = avg_embedding / norm
    return avg_embedding


def get_missing_skills_semantically(jd_must_haves: List[str], cv_skills: List[str], threshold: float = 0.45) -> List[str]:
    """Find missing skills using semantic cosine similarity instead of exact string match."""
    if not jd_must_haves:
        return []
    if not cv_skills:
        return jd_must_haves

    model = _get_model()
    # Encode both lists into tensors
    req_embeddings = model.encode(jd_must_haves, convert_to_tensor=True)
    cv_embeddings = model.encode(cv_skills, convert_to_tensor=True)
    
    # Compute cosine similarities. Shape: (len(jd_must_haves), len(cv_skills))
    cosine_scores = util.cos_sim(req_embeddings, cv_embeddings)
    
    missing = []
    for i, req in enumerate(jd_must_haves):
        # max similarity for this requirement against any CV skill
        max_score = cosine_scores[i].max().item()
        if max_score < threshold:
            missing.append(req)
            
    return missing


async def store_jd_skills(job_id: str, skills: List[str]) -> None:
    """Store JD skill embeddings in Qdrant for later matching."""
    qdrant = _get_qdrant()
    embedding = await asyncio.to_thread(encode_skills, skills)

    point = PointStruct(
        id=str(uuid.uuid5(uuid.NAMESPACE_DNS, str(job_id))),
        vector=embedding.tolist(),
        payload={"job_id": str(job_id), "skills": skills},
    )

    qdrant.upsert(
        collection_name=JD_COLLECTION,
        points=[point],
    )
    logger.info("Stored JD skills vector for job %s (%d skills)", job_id, len(skills))


async def calculate_match_score(job_id: str, cv_skills: List[str]) -> int:
    """
    Calculate cosine similarity match score (0-100) between
    CV skills and stored JD skills.
    """
    qdrant = _get_qdrant()

    # Encode CV skills
    cv_embedding = await asyncio.to_thread(encode_skills, cv_skills)

    if np.all(cv_embedding == 0):
        logger.warning("CV skills empty, returning 0 match score")
        return 0

    # Search Qdrant for the JD's stored vector
    results = qdrant.search(
        collection_name=JD_COLLECTION,
        query_vector=cv_embedding.tolist(),
        query_filter=None,
        limit=10,
    )

    # Find the result matching our job_id
    target_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(job_id)))
    for result in results:
        if result.id == target_id:
            # Qdrant cosine similarity is already 0-1
            raw_score = result.score
            match_score = int(round(raw_score * 100))
            match_score = max(0, min(100, match_score))
            logger.info("Match score for job %s: %d (raw=%.4f)", job_id, match_score, raw_score)
            return match_score

    # Fallback: compute directly if Qdrant search didn't find exact match
    jd_point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(job_id)))
    try:
        points = qdrant.retrieve(
            collection_name=JD_COLLECTION,
            ids=[jd_point_id],
            with_vectors=True,
        )
        if points:
            jd_vector = np.array(points[0].vector)
            similarity = float(np.dot(cv_embedding, jd_vector))
            match_score = int(round(similarity * 100))
            match_score = max(0, min(100, match_score))
            logger.info("Match score (direct): %d", match_score)
            return match_score
    except Exception as e:
        logger.error("Error retrieving JD vector: %s", e)

    logger.warning("Could not find JD vector for job %s, returning 0", job_id)
    return 0
