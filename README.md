# Project Catalyst — AI-Powered Talent Scouting & Engagement Agent

An enterprise AI recruitment platform that automates top-of-funnel tech recruitment with AI-parsed job descriptions, semantic CV matching, and voice-based behavioral interviews.

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js    │────▶│   FastAPI    │────▶│  PostgreSQL  │
│   Frontend   │     │   Backend    │     │   (SQLAlchemy)│
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
| Redis | 6379 | Rolling context cache |
| RabbitMQ | 5672/15672 | Message queue / Management UI |
| Qdrant | 6333 | Vector similarity search |

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy (async), asyncpg
- **Frontend:** Next.js 14, React 18, Tailwind CSS, SWR
- **AI:** Groq (llama3-70b, llama3-8b, whisper-large-v3)
- **Vector:** Sentence-Transformers, Qdrant
- **Infrastructure:** Docker, PostgreSQL, Redis, RabbitMQ
