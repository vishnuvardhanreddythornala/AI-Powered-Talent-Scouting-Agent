"""
SQLAlchemy ORM models for Project Catalyst.
Every table has: created_at, updated_at, is_deleted (soft-delete).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


def gen_uuid():
    return uuid.uuid4()


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    title = Column(String(500), nullable=False)
    raw_text = Column(Text, nullable=False)
    parsed_params = Column(JSONB, nullable=True)
    must_haves = Column(JSONB, nullable=True)
    status = Column(String(50), default="draft")  # draft | active | closed
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relationships
    applications = relationship("Application", back_populates="job", lazy="selectin")


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name = Column(String(300), nullable=False)
    email = Column(String(300), nullable=False, unique=True)
    cv_parsed_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relationships
    applications = relationship("Application", back_populates="candidate", lazy="selectin")


class Application(Base):
    __tablename__ = "applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.id"), nullable=False)
    match_score = Column(Integer, default=0)
    final_interest_score = Column(Float, default=0.0)
    status = Column(String(50), default="applied")  # applied | interviewing | scored | rejected
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relationships
    job = relationship("Job", back_populates="applications", lazy="selectin")
    candidate = relationship("Candidate", back_populates="applications", lazy="selectin")
    interviews = relationship("Interview", back_populates="application", lazy="selectin")


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    application_id = Column(UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False)
    start_time = Column(DateTime(timezone=True), default=utcnow)
    total_allocated_questions = Column(Integer, default=8)
    questions_completed = Column(Integer, default=0)
    status = Column(String(50), default="in_progress")  # in_progress | completed
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relationships
    application = relationship("Application", back_populates="interviews", lazy="selectin")
    qna_items = relationship("InterviewQnA", back_populates="interview", lazy="selectin",
                              order_by="InterviewQnA.q_number")


class InterviewQnA(Base):
    __tablename__ = "interview_qna"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    interview_id = Column(UUID(as_uuid=True), ForeignKey("interviews.id"), nullable=False)
    q_number = Column(Integer, nullable=False)
    ai_question = Column(Text, nullable=False)
    candidate_answer = Column(Text, nullable=True)
    interest_score = Column(Integer, nullable=True)
    score_reasoning = Column(Text, nullable=True)
    signals = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relationships
    interview = relationship("Interview", back_populates="qna_items", lazy="selectin")
