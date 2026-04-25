"""
FastAPI application entry point.
- CORS configuration
- Lifespan hooks (DB init, Redis, Vector service)
- Router mounting
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, close_db
from services.redis_service import get_redis, close_redis
from services.vector_service import init_vector_service
from routers import jobs, applications, interview
from schemas import HealthResponse

# ── Logging ──────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)-25s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    logger.info("🚀 Starting Project Catalyst API...")

    # Initialize database tables
    await init_db()

    # Initialize Redis connection
    await get_redis()

    # Initialize vector service (model + Qdrant)
    try:
        await init_vector_service()
    except Exception as e:
        logger.warning("⚠️ Vector service init failed (Qdrant may not be running): %s", e)

    logger.info("✅ All services initialized")

    yield

    # Shutdown
    logger.info("🛑 Shutting down...")
    await close_redis()
    await close_db()
    logger.info("👋 Shutdown complete")


# ── App ──────────────────────────────────────────
app = FastAPI(
    title="Project Catalyst API",
    description="AI-Powered Talent Scouting & Engagement Agent",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(interview.router, prefix="/api/interview", tags=["Interview"])


# ── Health Check ─────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse()


@app.get("/")
async def root():
    return {
        "service": "Project Catalyst API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
