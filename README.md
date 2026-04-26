# Project Catalyst — AI-Powered Talent Scouting & Engagement Agent

An enterprise AI recruitment platform that automates top-of-funnel tech recruitment with AI-parsed job descriptions, **semantic CV matching via vector embeddings**, and voice-based behavioral interest screening.

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js    │────▶│   FastAPI    │────▶│  PostgreSQL  │
│   Frontend   │     │   Backend    │     │  (SQLAlchemy) │
└──────────────┘     └─────┬───────┘     └──────────────┘
                           │
                    ┌──────┼──────┐
                    ▼      ▼      ▼
               ┌───────┐ ┌────┐ ┌───────┐
               │ Groq  │ │Redis│ │Qdrant │
               │  API  │ │    │ │Vector │
               └───────┘ └────┘ └───────┘
                    │
                    ▼
               ┌──────────┐     ┌──────────┐
               │ RabbitMQ │────▶│  Worker  │
               │  Queue   │     │ (Scorer) │
               └──────────┘     └──────────┘
```

## How It Works

### Match Score (Semantic — Computed Once at CV Upload)
1. JD skills are embedded via **Sentence-Transformers (all-MiniLM-L6-v2)** and stored in **Qdrant** as vectors.
2. When a candidate uploads their CV, their extracted skills are embedded with the same model.
3. **Cosine similarity** is computed between the CV vector and the stored JD vector in Qdrant.
4. This produces the **Match Score (0-100)** — a true semantic similarity score, not keyword matching.
5. Falls back to keyword matching if Qdrant is unavailable.

### Interest Score (Dynamic — Computed Asynchronously Per Question)
1. Candidates participate in a **voice-enabled screening conversation** (30s prep → 30s speak).
2. Audio is transcribed via **Groq Whisper** and each Q&A is published to **RabbitMQ**.
3. A background worker scores each answer for genuine interest using **Groq LLaMA-3.3-70B**.
4. The **Interest Score** is the rolling average of all per-question scores.

### XAI (Explainability)
The recruiter dashboard shows a **"Why This Candidate?"** panel with:
- ✅ Matched skills (JD requirement found in CV)
- ❌ Missing skills (JD requirement not found in CV)
- Skill coverage percentage
- AI reasoning trace for interest scoring

## Quick Start

### Docker (Recommended)
```bash
docker-compose up --build
```

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Worker:**
```bash
cd backend
python -m worker.interest_scorer
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | Next.js React UI |
| Backend API | 8000 | FastAPI REST API |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Rolling context cache for interview state |
| RabbitMQ | 5672/15672 | Async interest scoring queue |
| Qdrant | 6333 | Vector similarity search for match scoring |

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy (async), asyncpg
- **Frontend:** Next.js 14, React 18, Tailwind CSS, SWR
- **AI Inference:** Groq (LLaMA-3.3-70B, LLaMA-3.1-8B, Whisper-Large-V3)
- **Semantic Matching:** Sentence-Transformers (all-MiniLM-L6-v2), Qdrant Vector DB
- **Message Queue:** RabbitMQ + Pika
- **Cache:** Redis (rolling window interview context)
- **Infrastructure:** Docker Compose, PostgreSQL

## Environment Variables

Copy `.env.example` to `backend/.env` and set your `GROQ_API_KEY`.
Copy `.env.local.example` or create `frontend/.env.local` with `NEXT_PUBLIC_API_URL`.
