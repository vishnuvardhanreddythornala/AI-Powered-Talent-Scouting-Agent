"""
Groq API service wrappers.
- llama3-70b-8192: JD parsing, CV extraction, interview blueprint, interest scoring
- llama3-8b-8192: Real-time question generation (low latency)
- whisper-large-v3: Audio transcription
"""

import asyncio
import json
import logging
import os
import re
from typing import Optional
import groq
from groq import AsyncGroq
from config import get_settings
from schemas import (
    JDAnalysisSchema,
    CVExtractionSchema,
    InterviewBlueprintSchema,
    InterestScoreEvaluationSchema,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Groq Client ──────────────────────────────────
# Disable auto-retries (we handle retries manually with backoff for 429s)
# No global timeout — each call sets its own appropriate timeout
client = AsyncGroq(api_key=settings.GROQ_API_KEY, max_retries=0)

HEAVY_MODEL = "llama-3.3-70b-versatile"
FAST_MODEL = "llama-3.1-8b-instant"
WHISPER_MODEL = "whisper-large-v3"


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code fences."""
    # Try to find JSON in code fences first
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in text
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            return json.loads(brace_match.group(0))
        raise ValueError(f"Could not extract JSON from LLM response: {text[:200]}")


# ═══════════════════════════════════════════════════
# JD Parsing (llama-3.3-70b-versatile)
# ═══════════════════════════════════════════════════

async def parse_job_description(raw_text: str) -> JDAnalysisSchema:
    """Parse unstructured JD text into structured JSON parameters."""
    system_prompt = """You are a precise Job Description parser for a recruitment platform.
Extract the following fields from the given job description text and return ONLY valid JSON:

{
    "job_title": "string - the exact job title",
    "salary_range": "string or null - salary range if mentioned, null if not found",
    "must_have_skills": ["array of strings - mandatory/required skills"],
    "nice_to_have_skills": ["array of strings - preferred/bonus skills"],
    "years_of_experience": integer - required years, 0 if not specified,
    "location": "string or null - job location if mentioned",
    "job_type": "string or null - Full-time, Part-time, Contract, etc."
}

RULES:
- Extract ONLY information explicitly stated in the JD.
- Do NOT invent or assume skills not mentioned.
- If salary is not mentioned, set salary_range to null.
- Separate must-have skills from nice-to-have skills carefully.
- Return ONLY the JSON object, no explanations."""

    logger.info("Parsing JD with %s", HEAVY_MODEL)

    # Try heavy model first, fall back to fast model on rate limit
    for model in [HEAVY_MODEL, FAST_MODEL]:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Parse this Job Description:\n\n{raw_text}"},
                ],
                temperature=0.1,
                max_tokens=2000,
                timeout=30.0,
            )
            raw_output = response.choices[0].message.content
            parsed = _extract_json(raw_output)
            result = JDAnalysisSchema(**parsed)
            logger.info("JD parsed with %s: title=%s, skills=%d", model, result.job_title, len(result.must_have_skills))
            return result
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and model == HEAVY_MODEL:
                logger.warning("Heavy model rate-limited for JD parsing, falling back to %s", FAST_MODEL)
                continue
            raise


# ═══════════════════════════════════════════════════
# CV Extraction (llama-3.3-70b-versatile)
# ═══════════════════════════════════════════════════

async def extract_cv(cv_text: str) -> CVExtractionSchema:
    """Extract structured candidate info from CV text."""
    system_prompt = """You are a precise CV/Resume parser for a recruitment platform.
Extract the following fields from the given CV text and return ONLY valid JSON:

{
    "candidate_name": "string - full name of the candidate",
    "candidate_email": "string - email address",
    "total_years_experience": integer - total years of professional experience,
    "tech_stack": ["array of strings - all technical skills, tools, languages, frameworks"],
    "recent_projects_summary": "string - brief 2-3 sentence summary of recent notable projects"
}

RULES:
- Extract ONLY information explicitly stated in the CV.
- If email is not found, use "not_provided@unknown.com".
- List every technical skill, programming language, framework, and tool mentioned.
- Return ONLY the JSON object, no explanations."""

    logger.info("Extracting CV with %s", HEAVY_MODEL)

    # Try heavy model first, fall back to fast model on rate limit
    for model in [HEAVY_MODEL, FAST_MODEL]:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Parse this CV/Resume:\n\n{cv_text}"},
                ],
                temperature=0.1,
                max_tokens=2000,
                timeout=30.0,
            )
            raw_output = response.choices[0].message.content
            parsed = _extract_json(raw_output)
            result = CVExtractionSchema(**parsed)
            logger.info("CV parsed with %s: name=%s, skills=%d", model, result.candidate_name, len(result.tech_stack))
            return result
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and model == HEAVY_MODEL:
                logger.warning("Heavy model rate-limited for CV extraction, falling back to %s", FAST_MODEL)
                continue
            raise


# ═══════════════════════════════════════════════════
# Screening Blueprint (llama-3.3-70b-versatile)
# ═══════════════════════════════════════════════════

async def generate_interview_blueprint(
    cv_summary: str,
    jd_summary: str,
    job_title: str,
) -> InterviewBlueprintSchema:
    """Generate the screening blueprint with a warm recruiter opening question."""
    system_prompt = f"""You are a friendly, professional AI Talent Scout reaching out to a candidate about a {job_title} opportunity.
Based on the candidate's CV and the Job Description, generate a warm, conversational opening question to start an interest screening conversation.

Job Title: {job_title}

Return ONLY valid JSON:
{{
    "total_questions": 5,
    "first_question": "string"
}}

RULES:
- total_questions MUST always be 5.
- The first question MUST be a warm recruiter-style opener (under 25 words).
- Reference something specific from the candidate's CV to show you've done your homework.
- Good examples:
  * 'Hi! I noticed your work on [project]. Are you currently open to exploring new opportunities?'
  * 'Your experience with [tech] caught our eye for this role. What's motivating your career search right now?'
- BAD examples (DO NOT use these):
  * 'Tell me about a time when you faced a challenge...' (too interview-like)
  * 'Describe your experience with distributed systems...' (too technical)
- This is a recruiter screening, NOT a technical interview. Keep it casual and friendly.
- Return ONLY the JSON object."""

    logger.info("Generating screening blueprint with %s", HEAVY_MODEL)

    # Try heavy model first, fall back to fast model on rate limit
    for model in [HEAVY_MODEL, FAST_MODEL]:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"CV Summary:\n{cv_summary}\n\nJD Summary:\n{jd_summary}",
                    },
                ],
                temperature=0.4,
                max_tokens=1000,
                timeout=30.0,
            )
            raw_output = response.choices[0].message.content
            parsed = _extract_json(raw_output)
            result = InterviewBlueprintSchema(**parsed)
            logger.info("Screening blueprint generated with %s: %d questions planned", model, result.total_questions)
            return result
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and model == HEAVY_MODEL:
                logger.warning("Heavy model rate-limited for blueprint, falling back to %s", FAST_MODEL)
                continue
            raise


# ═══════════════════════════════════════════════════
# Next Screening Question (llama-3.1-8b-instant — low latency)
# ═══════════════════════════════════════════════════

async def generate_next_question(
    job_title: str,
    cv_summary: str,
    jd_summary: str,
    current_q: int,
    total_q: int,
    recent_context: list[dict],
    last_answer: str,
) -> str:
    """Generate the next recruiter screening question."""
    # Build context from full Q&A history
    context_text = ""
    for item in recent_context:
        context_text += f"Q: {item.get('question', '')}\nA: {item.get('answer', '')}\n\n"

    # Define the question flow — each question targets a specific interest signal
    question_themes = {
        2: "MOTIVATION & JOB SEARCH STATUS — Ask about their current job search activity and what's motivating them to consider new opportunities.",
        3: "ROLE ALIGNMENT & CAREER GOALS — Ask if this specific role and domain align with their career direction. Reference something from the JD.",
        4: "SALARY, LOCATION & LOGISTICS — Ask about salary expectations, location preferences, or notice period. Keep it natural and non-intrusive.",
        5: "RELEVANT EXPERIENCE & ENTHUSIASM — Ask them to briefly share a recent project or experience that relates to this role. Keep it conversational, not a deep technical dive.",
    }
    theme = question_themes.get(current_q, "CLOSING — Ask if they have any questions or concerns about the role.")

    system_prompt = f"""You are a friendly, professional AI Talent Scout having a screening conversation with a candidate for {job_title}.

Candidate profile: {cv_summary}
Job requirements: {jd_summary}

You are on question {current_q} of {total_q}.

THIS QUESTION'S FOCUS: {theme}

Generate EXACTLY ONE short, natural question (under 25 words, max 2 sentences).

RULES:
- You are a RECRUITER, not a technical interviewer. Keep it warm and conversational.
- Reference specific details from the candidate's CV or the JD to personalize.
- DO NOT ask deep technical questions, system design, or STAR-method behavioral questions.
- DO NOT ask the candidate to write code or solve problems.
- Respond naturally to their previous answer before asking the next question. A brief acknowledgment like 'That's great to hear!' or 'Thanks for sharing that.' is fine.
- If the user goes off-topic, reply: 'Let\'s stay focused on exploring this opportunity together.' then ask your question.
- Output ONLY the question text, nothing else.

Good examples:
- 'That sounds exciting! What salary range are you targeting for your next role?'
- 'Great background! Are you open to working from Hyderabad, or do you prefer fully remote?'
- 'Thanks! How soon would you be able to join if this role is a good fit?'
- 'Interesting work! What specifically about this {job_title} role caught your attention?'

BAD examples (DO NOT use):
- 'Describe a time when you had to debug a distributed system...' (too technical)
- 'Walk me through your approach to system design...' (interview question)
- 'Using the STAR method, tell me about a challenge...' (STAR method)"""

    user_content = f"Candidate's last response: {last_answer}\n\nGenerate the next screening question."
    if context_text:
        user_content = f"Conversation so far:\n{context_text}\n\n{user_content}"

    logger.info("Generating screening Q%d/%d with %s", current_q, total_q, FAST_MODEL)

    fallback_questions = [
        "Thanks for sharing! What's motivating you to explore new opportunities right now?",
        "That's helpful! What salary range are you looking for in your next role?",
        "Great to know! How soon would you be able to join if this turns out to be a good fit?",
        "Appreciate that! What specifically about this role interests you the most?",
        "Thanks! Is there anything about this opportunity you'd like to know more about?"
    ]

    # Retry up to 2 times with backoff for rate-limit (429) errors
    for attempt in range(3):
        try:
            response = await client.chat.completions.create(
                model=FAST_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.5,
                max_tokens=300,
                timeout=20.0,
            )
            question = response.choices[0].message.content.strip()
            logger.info("Generated screening Q%d: %s...", current_q, question[:80])
            return question
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and attempt < 2:
                wait = (attempt + 1) * 8
                logger.warning("Rate-limited on Q generation (attempt %d), waiting %ds...", attempt + 1, wait)
                await asyncio.sleep(wait)
            else:
                logger.error("Groq generation failed (attempt %d): %s", attempt + 1, e)
                break

    question = fallback_questions[current_q % len(fallback_questions)]
    logger.info("Using fallback screening Q%d: %s...", current_q, question[:80])
    return question


# ═══════════════════════════════════════════════════
# Interest Score Evaluation (llama-3.3-70b-versatile — background worker)
# ═══════════════════════════════════════════════════

from services.nlp_service import extract_nlp_signals

async def evaluate_interest_score(
    question: str,
    answer: str,
    job_title: str,
) -> InterestScoreEvaluationSchema:
    """Evaluate a single Q&A pair for genuine candidate interest in the role using hybrid NLP + LLM approach."""
    
    # 0. Prompt Injection Guardrail
    def sanitize_input(text: str) -> str:
        if not text:
            return ""
        # Strip common instruction-override patterns
        patterns = [
            r'(?i)ignore\s+(?:all\s+)?(?:previous\s+)?instructions',
            r'(?i)system\s*:',
            r'(?i)you\s+are\s+(?:now\s+)?a\s+',
            r'(?i)new\s+rule:',
            r'(?i)forget\s+(?:everything\s+)?you\s+(?:know|were\s+told)'
        ]
        sanitized = text
        for p in patterns:
            sanitized = re.sub(p, '[REDACTED]', sanitized)
        return sanitized

    safe_answer = sanitize_input(answer)

    # 1. Extract deterministic NLP signals
    signals = extract_nlp_signals(question, safe_answer)
    
    # 2. Feed signals into LLM prompt
    system_prompt = f"""You are an expert recruitment analyst evaluating a candidate's genuine interest
in a {job_title} position during a recruiter screening conversation.

We have pre-extracted the following NLP signals from the candidate's answer:
- Sentiment Polarity: {signals['sentiment_polarity']} (-1.0 to 1.0)
- Response Length: {signals['response_length_words']} words
- Salary Mentioned: {signals['salary_mentioned']}
- Availability Mentioned: {signals['availability_mentioned']}
- Asked Questions Back: {signals['asked_questions']}
- Highly Repetitive/Spam: {signals['is_repetitive']}

Analyze the candidate's response incorporating these signals for:
1. Openness to new opportunities (actively looking vs. just browsing)
2. Role & domain alignment (does this role match their career goals?)
3. Salary expectation alignment (if mentioned)
4. Notice period / availability (if mentioned)
5. Enthusiasm & engagement quality (positive tone, detailed responses)

Return ONLY valid JSON:
{{
    "interest_score": integer (0-100),
    "reasoning": "string - max 2 sentences explaining the score with recruiter-friendly language",
    "signals": {json.dumps(signals)}
}}

Scoring guide:
- Penalize heavily if 'Highly Repetitive/Spam' is true (score < 30).
- Reward depth and positive sentiment.
- 0-20: Not interested, disengaged, hostile, or completely misaligned
- 21-40: Passive interest, vague responses, significant misalignment
- 41-60: Moderate interest, some alignment but has concerns or reservations
- 61-80: Strong interest, good alignment on most factors, engaged and positive
- 81-100: Highly enthusiastic, perfect alignment, actively seeking this type of role"""

    logger.info("Evaluating interest score with %s", HEAVY_MODEL)

    # Try Heavy model first, then immediately fall back to Fast model on rate limit
    for model in [HEAVY_MODEL, FAST_MODEL]:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Recruiter's Question: {question}\n\nCandidate's Response: {safe_answer}\n\nEvaluate this candidate's interest level.",
                    },
                ],
                temperature=0.2,
                max_tokens=300,
                timeout=30.0,
            )
            raw_output = response.choices[0].message.content
            parsed = _extract_json(raw_output)
            result = InterestScoreEvaluationSchema(**parsed)
            logger.info("Interest score (model=%s): %d - %s", model, result.interest_score, result.reasoning[:60])
            return result
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and model == HEAVY_MODEL:
                logger.warning("Heavy model rate-limited for scoring, falling back to %s", FAST_MODEL)
                continue
            logger.error("Groq evaluation failed on model %s: %s", model, e)

    # Fallback: return None to signal scoring failure — worker will skip this QnA in averaging
    logger.warning("All interest score models failed. Returning None to avoid corrupting average.")
    return None


# ═══════════════════════════════════════════════════
# Match Score Accuracy Evaluation
# ═══════════════════════════════════════════════════

async def evaluate_match_score(jd_must_haves: list[str], cv_skills: list[str], cv_text: str = "") -> int:
    """
    Evaluate a strict match score (0-100) between JD must-haves and CV skills.
    Calculates coverage using the same logic as the UI for perfect alignment.
    """
    if not jd_must_haves:
        return 100

    def normalize(s: str) -> str:
        # replace non-alphanumeric, +, # with space
        s = re.sub(r'[^a-z0-9+#]', ' ', s.lower())
        s = re.sub(r'\s+', ' ', s).strip()
        return f" {s} "

    def is_match(s: str, c: str) -> bool:
        jd_norm = normalize(s)
        cv_norm = normalize(c)
        jd_trim = cv_norm.strip()
        cv_trim = jd_norm.strip()
        if not jd_trim or not cv_trim:
            return False
        return f" {jd_trim} " in jd_norm or f" {cv_trim} " in cv_norm

    cv_text_norm = normalize(cv_text) if cv_text else ""
    matches = []
    
    for s in jd_must_haves:
        # 1. Check against parsed skills array
        if any(is_match(s, c) for c in cv_skills):
            matches.append(s)
            continue
            
        # 2. Check against raw CV text
        if cv_text_norm:
            s_trim = normalize(s).strip()
            if s_trim and f" {s_trim} " in cv_text_norm:
                matches.append(s)
    
    return int(round((len(matches) / len(jd_must_haves)) * 100))

# ═══════════════════════════════════════════════════
# Whisper Audio Transcription
# ═══════════════════════════════════════════════════

async def transcribe_audio(file_path: str, mime_type: str = "audio/webm") -> str:
    """Transcribe audio file using Groq Whisper with retry for all transient errors."""
    file_size = os.path.getsize(file_path)
    logger.info("Transcribing audio: %s (type=%s, size=%d bytes / %.1f KB)", file_path, mime_type, file_size, file_size/1024)

    with open(file_path, "rb") as audio_file:
        file_bytes = audio_file.read()
        
    if not file_bytes or len(file_bytes) < 1000:
        logger.warning("Audio file is empty or too small (%d bytes, only headers)!", len(file_bytes) if file_bytes else 0)
        return "[No audible response detected]"

    # Retry up to 2 times with backoff for ANY transient error
    last_error = None
    for attempt in range(3):
        try:
            response = await client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=(os.path.basename(file_path), file_bytes, mime_type),
                response_format="text",
                timeout=120.0,  # 2 minutes for large audio uploads
            )
            transcript = response.strip() if isinstance(response, str) else response.text.strip()
            logger.info("Transcription complete (%d chars, attempt %d): '%s'", len(transcript), attempt + 1, transcript[:100])
            return transcript
        except Exception as e:
            last_error = e
            err_str = str(e)
            # Log the FULL error details
            logger.error(
                "Whisper FAILED (attempt %d/3, file=%d bytes, mime=%s): [%s] %s",
                attempt + 1, len(file_bytes), mime_type, type(e).__name__, err_str[:300]
            )
            
            # Check if it's a permanent error (e.g., invalid file format)
            is_permanent = "invalid" in err_str.lower() and "media" in err_str.lower()
            if is_permanent:
                logger.error("Permanent error — file is not a valid audio format, not retrying")
                break
            
            # For ALL other errors (rate limits, timeouts, server errors), retry with backoff
            if attempt < 2:
                wait = (attempt + 1) * 12  # 12s, 24s
                logger.info("Retrying Whisper in %ds...", wait)
                await asyncio.sleep(wait)

    logger.error("All Whisper attempts failed. Last error: %s", last_error)
    return "(Audio transcription temporarily unavailable. Please proceed with the next question naturally.)"

