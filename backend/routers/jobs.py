"""
Jobs router — JD upload, AI parsing, and Quality Guardrails.
Supports both PDF uploads (via PyMuPDF) and raw text submission.
"""

import logging
import os
import tempfile
import uuid
from typing import List

import fitz  # PyMuPDF
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Job
from schemas import (
    JDAnalysisSchema,
    JDQualityAlert,
    JobCreateRequest,
    JobResponse,
)
from services.groq_service import parse_job_description
from services.vector_service import store_jd_skills

logger = logging.getLogger(__name__)
router = APIRouter()


# ═══════════════════════════════════════════════════
# JD Quality Validation Guardrail
# ═══════════════════════════════════════════════════

def validate_jd_quality(parsed: JDAnalysisSchema) -> List[str]:
    """
    Validate parsed JD for quality. Returns list of issues.
    Empty list means JD passes quality checks.
    """
    issues = []

    if parsed.salary_range is None:
        issues.append("Salary range is missing from the job description.")

    if len(parsed.must_have_skills) < 3:
        issues.append(
            f"Only {len(parsed.must_have_skills)} must-have skills found. "
            "At least 3 are required for a quality job posting."
        )

    if parsed.years_of_experience == 0:
        issues.append("Years of experience requirement is not specified.")

    if not parsed.job_title or len(parsed.job_title.strip()) < 3:
        issues.append("Job title is missing or too vague.")

    return issues


# ═══════════════════════════════════════════════════
# PDF Text Extraction
# ═══════════════════════════════════════════════════

def extract_text_from_pdf(file_path: str) -> str:
    """Extract all text from a PDF file using PyMuPDF."""
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text.strip()


# ═══════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════

@router.post("/upload-pdf", response_model=JobResponse, status_code=201)
async def upload_jd_pdf(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a JD as PDF. Extracts text, parses with AI, validates quality."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Save uploaded file temporarily
    temp_path = os.path.join(tempfile.gettempdir(), f"jd_{uuid.uuid4().hex}.pdf")
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        # Extract text from PDF
        raw_text = extract_text_from_pdf(temp_path)
        if not raw_text or len(raw_text) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract sufficient text from the PDF. Please ensure the PDF contains readable text.",
            )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    # Parse with Groq AI
    parsed = await parse_job_description(raw_text)

    # Validate JD quality (Guardrail)
    issues = validate_jd_quality(parsed)
    if issues:
        alert = JDQualityAlert(
            issues=issues,
            parsed_data=parsed,
        )
        raise HTTPException(status_code=400, detail=alert.model_dump())

    # Store JD skills in Qdrant for vector matching
    all_skills = parsed.must_have_skills + parsed.nice_to_have_skills
    try:
        job_id = uuid.uuid4()
        await store_jd_skills(str(job_id), all_skills)
    except Exception as e:
        logger.warning("Failed to store JD skills in Qdrant: %s", e)
        job_id = uuid.uuid4()

    # Save to database
    job = Job(
        id=job_id,
        title=parsed.job_title,
        raw_text=raw_text,
        parsed_params=parsed.model_dump(),
        must_haves=parsed.must_have_skills,
        status="active",
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    logger.info("✅ Job created: %s (%s)", job.title, job.id)
    return job


@router.post("/upload-text", response_model=JobResponse, status_code=201)
async def upload_jd_text(
    request: JobCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit a JD as raw text. Parses with AI and validates quality."""
    # Parse with Groq AI
    parsed = await parse_job_description(request.raw_text)

    # Validate JD quality (Guardrail)
    issues = validate_jd_quality(parsed)
    if issues:
        alert = JDQualityAlert(
            issues=issues,
            parsed_data=parsed,
        )
        raise HTTPException(status_code=400, detail=alert.model_dump())

    # Store JD skills in Qdrant
    job_id = uuid.uuid4()
    all_skills = parsed.must_have_skills + parsed.nice_to_have_skills
    try:
        await store_jd_skills(str(job_id), all_skills)
    except Exception as e:
        logger.warning("Failed to store JD skills in Qdrant: %s", e)

    # Save to database
    job = Job(
        id=job_id,
        title=parsed.job_title,
        raw_text=request.raw_text,
        parsed_params=parsed.model_dump(),
        must_haves=parsed.must_have_skills,
        status="active",
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    logger.info("✅ Job created: %s (%s)", job.title, job.id)
    return job


@router.get("/", response_model=List[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """List all active jobs."""
    result = await db.execute(
        select(Job).where(Job.is_deleted == False).order_by(Job.created_at.desc())  # noqa: E712
    )
    jobs = result.scalars().all()
    return jobs


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single job by ID."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.is_deleted == False)  # noqa: E712
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/{job_id}/candidates")
async def get_job_candidates(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get all candidates who applied to a specific job, with scores."""
    from models import Application, Candidate

    result = await db.execute(
        select(Application)
        .where(Application.job_id == job_id, Application.is_deleted == False)  # noqa: E712
        .order_by(Application.match_score.desc())
    )
    applications = result.scalars().all()

    candidates = []
    for app in applications:
        candidate = app.candidate
        candidates.append({
            "application_id": str(app.id),
            "candidate_id": str(candidate.id),
            "candidate_name": candidate.name,
            "candidate_email": candidate.email,
            "match_score": app.match_score,
            "final_interest_score": round(app.final_interest_score, 1),
            "status": app.status,
            "applied_at": app.created_at.isoformat(),
            "cv_skills": candidate.cv_parsed_json.get("tech_stack", []) if candidate.cv_parsed_json else [],
        })

    return candidates
