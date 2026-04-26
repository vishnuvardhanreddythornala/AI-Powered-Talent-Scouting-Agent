# TalentScope - AI-Powered Talent Scouting Agent

## SECTION 1 — PROJECT OVERVIEW
TalentScope is a full-stack, AI-driven recruitment platform designed to automate the initial stages of talent scouting and candidate screening. It addresses the challenge of manually reviewing hundreds of resumes and conducting initial phone screens by utilizing advanced Language Models (LLMs) and vector-based semantic matching. It serves two distinct user roles: recruiters (who upload job descriptions and review AI-scored candidate profiles) and candidates (who apply for jobs and participate in autonomous, voice-enabled AI interviews).

The platform delivers an end-to-end automated pipeline: parsing Job Descriptions (JDs), processing candidate CVs (PDFs), calculating semantic match scores using Vector Embeddings, generating a tailored set of interview questions (a "blueprint"), conducting an interactive voice-based screening interview using Whisper for transcription and LLaMA-3.1 for low-latency question generation, and finally evaluating the candidate's genuine interest and role alignment using a background scoring worker powered by LLaMA-3.3.

**Executive Summary:** TalentScope is architected as a modern, containerized application utilizing FastAPI for the backend and Next.js 14 for the frontend. By leveraging Groq's high-speed inference for LLaMA-3 models, Qdrant for vector search, RabbitMQ for asynchronous task processing, and PostgreSQL for structured data persistence, the platform ensures rapid, accurate, and scalable candidate evaluation. The system enforces strict Guardrails to ensure JD quality and prevents AI hallucination or prompt injection during the evaluation phase.

**System Boundaries:** TalentScope owns job management, candidate profiles, interview orchestration, and scoring logic. It strictly delegates external capabilities: advanced NLP inference is delegated to Groq (LLaMA-3 / Whisper), vector storage and similarity search to Qdrant, asynchronous task queuing to RabbitMQ, and fast, ephemeral state management (like rolling context during interviews) to Redis.

---

## SECTION 2 — ARCHITECTURE DOCUMENT (HLD)
The TalentScope backend is built as a modular FastAPI monolith, supported by specialized infrastructure services.

**Why this Architecture?** A modular monolith with asynchronous workers was chosen to balance development speed with scalability. FastAPI provides high-performance asynchronous request handling. The separation of the main API server from the `interest_scorer` worker via RabbitMQ ensures that long-running evaluation tasks do not block the main event loop, keeping the API responsive for real-time interview interactions.

**Communication Patterns:**
1. **Synchronous (REST/HTTP):** Frontend to Backend communication. E.g., CV uploads, fetching job lists, and real-time audio submissions during the interview.
2. **Asynchronous (RabbitMQ):** Used for non-blocking workflows. When an interview answer is submitted, the API publishes a message to the `interest_scoring` queue. The background worker consumes this to perform heavy LLM evaluations.
3. **LLM Inference (Groq API):** The backend communicates with Groq over HTTPS for text generation (LLaMA-3) and audio transcription (Whisper).

**Data Storage Strategy:**
1. **PostgreSQL:** Acts as the primary source of truth for structured relational data (Jobs, Candidates, Applications, Interviews, and QnAs).
2. **Qdrant:** A dedicated Vector Database used for Semantic Skill Matching. It stores JD skill embeddings and performs cosine similarity searches against candidate skills.
3. **Redis:** Used for ephemeral state management, specifically maintaining the rolling conversation context during active interviews to ensure low-latency responses without constantly querying the relational database.

**Scoring & Evaluation Pipeline:**
1. **Semantic Match Score (0-100):** Calculated at the time of application. Candidate CV skills and JD Must-Have skills are embedded using `all-MiniLM-L6-v2`. Qdrant computes the cosine similarity.
2. **Interest Score (0-100):** Calculated asynchronously after each interview question. A hybrid approach is used: deterministic NLP signals (sentiment, length, mentions of salary/notice period) are extracted via `TextBlob` and Regex, and then fed into a strict prompt for LLaMA-3.3 to evaluate genuine interest.

**Frontend Architecture:** Next.js 14 utilizing the App Router. The frontend leverages React Server Components where appropriate and Client Components for interactive elements like the microphone recording interface. Tailwind CSS is used for styling.

---

## SECTION 3 — TECH STACK REFERENCE

| Technology | Role in TalentScope |
|---|---|
| Python 3.11 | Core backend language |
| FastAPI | Core application framework |
| Next.js 14 | Frontend React framework |
| TypeScript | Frontend language |
| PostgreSQL 15 | Relational datastore (Jobs, Candidates, Interviews) |
| SQLAlchemy (Async) | ORM for database interactions |
| Redis 7 | Ephemeral state (Interview rolling context) |
| RabbitMQ 3 | Message broker for background tasks |
| Qdrant | Vector database for semantic similarity matching |
| Groq API | High-speed LLM inference provider |
| LLaMA-3.3-70b-Versatile | Heavy model: JD/CV Parsing, Evaluation, Blueprint generation |
| LLaMA-3.1-8b-Instant | Fast model: Real-time interview question generation |
| Whisper-large-v3 | Audio transcription (Speech-to-Text) |
| Sentence-Transformers | Local embedding model (`all-MiniLM-L6-v2`) for skill matching |
| TextBlob / Regex | Deterministic NLP signal extraction |
| PyMuPDF (fitz) | PDF text extraction (CVs and JDs) |
| Docker & Docker Compose | Containerization and orchestration |
| Nginx | Production reverse proxy and SSL termination |

---

## SECTION 4 — SERVICE REFERENCE & ROUTERS

### 4.1 Jobs Router (`/api/jobs`)
* **Purpose:** Handles Job Description uploads, parsing, and quality validation.
* **Key Endpoints:**
  * `POST /upload-pdf` - Upload JD as PDF.
  * `POST /upload-text` - Submit JD as raw text.
  * `GET /` - List all active jobs.
  * `GET /{job_id}/candidates` - Get ranked list of candidates for a job.
* **Key Logic:** Extracts text, calls `parse_job_description` (Groq), runs `validate_jd_quality` guardrails (enforcing salary, skills, title, experience), and stores embeddings in Qdrant via `store_jd_skills`.

### 4.2 Applications Router (`/api/applications`)
* **Purpose:** Handles candidate applications, CV parsing, and match score calculation.
* **Key Endpoints:**
  * `POST /apply` - Candidate applies by uploading a CV.
  * `GET /{application_id}/interview` - Gets current interview state.
* **Key Logic:** Extracts CV text via PyMuPDF, calls `extract_cv` (Groq), calculates `match_score` using `vector_service.calculate_match_score`, generates the `InterviewBlueprint`, creates DB records, and stores initial context in Redis.

### 4.3 Interview Router (`/api/interview`)
* **Purpose:** Manages the real-time AI screening interview.
* **Key Endpoints:**
  * `POST /{interview_id}/submit-audio` - Receives candidate audio answer.
* **Key Logic:** Uploads audio to temp file, calls Whisper for transcription, retrieves rolling context from Redis, calls `generate_next_question` (using the fast LLaMA-8b model), updates DB, updates Redis context, and publishes the answered question ID to RabbitMQ (`interest_scoring` queue) for background evaluation.

### 4.4 Background Worker (`interest_scorer.py`)
* **Purpose:** Asynchronous RabbitMQ consumer for heavy evaluation tasks.
* **Key Logic:** Listens to `interest_scoring` queue. For each task, fetches QnA, uses `extract_nlp_signals` for deterministic metrics, calls `evaluate_interest_score` (LLaMA-3.3-70b), updates the QnA record, recalculates the Application's average `final_interest_score`, and updates Application status if complete.

### 4.5 Vector Service (`vector_service.py`)
* **Purpose:** Manages embeddings and semantic matching.
* **Key Logic:** Lazy-loads `all-MiniLM-L6-v2` locally via `SentenceTransformer`. Connects to Qdrant. `encode_skills` averages individual skill embeddings into a single normalized vector. `calculate_match_score` performs cosine similarity in Qdrant. `get_missing_skills_semantically` identifies skill gaps.

---

## SECTION 5 — DATA FLOW DOCUMENTATION

**Flow 1 — Job Creation & Validation:**
1. Recruiter uploads a JD PDF or pastes text in the Dashboard.
2. Frontend calls `POST /api/jobs/upload-pdf` or `/upload-text`.
3. Backend extracts text (PyMuPDF) and calls `groq_service.parse_job_description`.
4. LLM returns structured JSON (Title, Must-Haves, Salary, etc.).
5. Backend runs `validate_jd_quality`. If rules fail (e.g., no salary), HTTP 400 is returned with specific issues.
6. If valid, `vector_service.store_jd_skills` generates embeddings for Must-Have skills and stores them in Qdrant.
7. Job record is saved to PostgreSQL.

**Flow 2 — Candidate Application & Match Scoring:**
1. Candidate uploads CV PDF for a specific Job ID.
2. Frontend calls `POST /api/applications/apply`.
3. Backend extracts text and calls `groq_service.extract_cv`.
4. Semantic matching: `vector_service.calculate_match_score` encodes the candidate's skills and performs a vector search in Qdrant against the Job's embeddings to return a 0-100 score.
5. Backend calls `groq_service.generate_interview_blueprint` to plan 5 tailored questions, starting with a personalized opening based on the CV.
6. DB records (Candidate, Application, Interview, first QnA) are created.
7. Interview context is saved to Redis for fast access during the session.

**Flow 3 — Real-Time AI Interview Loop:**
1. Candidate views the first question and speaks their answer.
2. Frontend records audio (WebM) and calls `POST /api/interview/{id}/submit-audio`.
3. Backend uses `groq_service.transcribe_audio` (Whisper) to convert speech to text.
4. Backend retrieves conversation history from Redis.
5. Backend calls `groq_service.generate_next_question` using LLaMA-3.1-8b-Instant (fast model). The prompt uses predefined themes based on the question number (e.g., Motivation, Salary).
6. QnA records are updated in DB. New question is added to Redis context.
7. Backend publishes a message to RabbitMQ to evaluate the answer asynchronously.
8. Frontend receives the transcript and the next question, displaying it to the candidate.

**Flow 4 — Asynchronous Interest Scoring:**
1. `interest_scorer` worker consumes message from RabbitMQ.
2. Worker fetches QnA record from DB.
3. Worker calls `nlp_service.extract_nlp_signals` to get deterministic metrics (Sentiment Polarity, Length, Salary Mentions, Repetition Flags).
4. Worker calls `groq_service.evaluate_interest_score` (LLaMA-3.3-70b-Versatile), passing the answer and the extracted NLP signals. The LLM returns a JSON with the score and reasoning.
5. Worker updates the QnA record.
6. Worker recalculates the Application's `final_interest_score` (average of all answered QnAs).

---

## SECTION 6 — DATABASE SCHEMA REFERENCE

**PostgreSQL Tables:**
- `jobs`: `id` (UUID, PK), `title`, `raw_text`, `parsed_params` (JSONB), `must_haves` (JSONB), `status`.
- `candidates`: `id` (UUID, PK), `name`, `email` (UNIQUE), `cv_parsed_json` (JSONB).
- `applications`: `id` (UUID, PK), `job_id` (FK), `candidate_id` (FK), `match_score` (INT), `final_interest_score` (FLOAT), `status`.
- `interviews`: `id` (UUID, PK), `application_id` (FK), `total_allocated_questions` (INT), `questions_completed` (INT), `status`.
- `interview_qna`: `id` (UUID, PK), `interview_id` (FK), `q_number` (INT), `ai_question` (TEXT), `candidate_answer` (TEXT), `interest_score` (INT), `score_reasoning` (TEXT), `signals` (JSONB).

**Redis Keys:**
- `interview:context:{interview_id}`: Stores JSON list of recent QnA pairs to maintain conversation context without heavy DB queries.
- `interview:current_q:{interview_id}`: Stores the current question number.

**Qdrant Collections:**
- `jd_skills`: Stores vector embeddings of Job Requirements. Payload contains `job_id` and raw skills.

---

## SECTION 7 — KNOWN DESIGN DECISIONS & ARCHITECTURAL RATIONALE

- **Semantic vs. Keyword Matching:** Replaced naive string inclusion with `sentence-transformers` (all-MiniLM-L6-v2) and Qdrant. This allows the system to recognize that a candidate with "MySQL" meets the requirement for "Relational Databases", which standard text matching fails at.
- **CPU-Optimized Embeddings:** The `sentence-transformers` library is explicitly configured to use the CPU version of PyTorch (`torch --index-url https://download.pytorch.org/whl/cpu`). This reduces the Docker image size by ~2GB and ensures compatibility on standard Azure VMs without requiring expensive GPUs.
- **Fast vs. Heavy LLM Models:** LLaMA-3.3-70b is used for parsing and evaluation because accuracy is paramount. However, during the real-time interview, LLaMA-3.1-8b is used for generating the next question to minimize latency and provide a snappy conversational experience for the candidate.
- **Hybrid Scoring (NLP + LLM):** Pure LLM scoring can be subjective. We extract deterministic signals first (e.g., TextBlob sentiment polarity, word count, regex matches for salary) and feed those into the LLM prompt. This "grounds" the LLM and forces it to justify its score based on concrete data, reducing hallucination.
- **Prompt Injection Guardrails:** The `sanitize_input` function strips common injection phrases (e.g., "ignore previous instructions") from candidate answers before sending them to the scoring LLM to prevent score manipulation.
- **Asynchronous Scoring:** Scoring answers takes several seconds. If done synchronously during the interview, the candidate would face awkward delays between questions. By offloading it to a RabbitMQ worker, the interview proceeds instantly.

---

## SECTION 8 — ERROR HANDLING & RESILIENCE

- **Groq Rate Limiting (429s):** Groq's API can be aggressive with rate limits. The `groq_service.py` implements a retry loop with exponential backoff (up to 3 attempts) for the fast model. If the heavy model is rate-limited during parsing, it automatically falls back to the fast model.
- **Fallback Interview Questions:** If the Groq API completely fails during question generation, a predefined list of fallback questions is used (e.g., "What salary range are you looking for?") based on the question number, ensuring the interview never crashes for the user.
- **Fallback Match Scoring:** If Qdrant is down or vector encoding fails, the system catches the exception and falls back to traditional LLM-based keyword matching.
- **RabbitMQ Retry:** If the `interest_scorer` worker fails to connect to RabbitMQ on startup, it retries continuously rather than crashing permanently.

---

## SECTION 9 — ENVIRONMENT & SECRETS REFERENCE

**Required `.env` Variables for Backend:**
| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Authentication for Groq LLM inference |
| `FRONTEND_URL` | Used for CORS configuration (e.g., `https://talentscope.centralindia.cloudapp.azure.com`) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL credentials |
| `DATABASE_URL` | Asyncpg connection string |
| `REDIS_HOST`, `REDIS_PORT` | Redis connection |
| `RABBITMQ_HOST`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | RabbitMQ broker connection |
| `QDRANT_HOST`, `QDRANT_PORT` | Vector DB connection |

**Required `.env.local` Variables for Frontend:**
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Points to backend API (e.g., `https://talentscope.centralindia.cloudapp.azure.com/api`) |

---

## SECTION 10 — DEPLOYMENT & PRODUCTION SETUP

**Infrastructure:** Deployed on an Azure Standard_D4s_v3 Virtual Machine (Ubuntu).
**Orchestration:** Managed via Docker Compose v2 (`docker compose up -d`).

**HTTPS and Reverse Proxy (Crucial for Audio):**
Modern browsers block microphone access and clipboard APIs on insecure origins (HTTP). For production, **Nginx** is configured as a reverse proxy with SSL termination using **Certbot/Let's Encrypt**.
- Nginx listens on port 443.
- Traffic to `/` is proxied to the Next.js container (port 3000).
- Traffic to `/api/` is proxied to the FastAPI container (port 8000).

**Build Optimization:** The `backend/Dockerfile` utilizes multi-stage builds and explicitly installs CPU-only PyTorch to minimize image footprint and speed up deployment on Azure.
