import re
from textblob import TextBlob

def extract_nlp_signals(question: str, answer: str) -> dict:
    """
    Extracts NLP features from the candidate's answer to feed into the interest scoring LLM.
    Provides deterministic signals to ground the LLM's evaluation.
    """
    signals = {}
    
    # Handle empty/missing
    if not answer or len(answer.strip()) < 2:
        return {
            "sentiment_polarity": 0,
            "response_length_words": 0,
            "depth_score": 0,
            "asked_questions": 0,
            "is_repetitive": False,
        }

    # 1. Sentiment Analysis
    try:
        blob = TextBlob(answer)
        signals["sentiment_polarity"] = round(blob.sentiment.polarity, 2)  # -1.0 to 1.0
        signals["sentiment_subjectivity"] = round(blob.sentiment.subjectivity, 2)
    except Exception:
        signals["sentiment_polarity"] = 0.0
        signals["sentiment_subjectivity"] = 0.0

    # 2. Response Depth
    words = len(answer.split())
    signals["response_length_words"] = words
    # Expect ~40-50 words for a good 30s response. Cap at 100%.
    signals["depth_score"] = min(100, int((words / 45) * 100))

    # 3. Explicit Mentions: Salary
    # Matches: 40L, 40LPA, 50k, 50,000, 50 thousand
    salary_pattern = r'\b(\d+(?:,\d+)?(?:k|l|lpa|lakh|thousand|million)?)\b'
    salary_match = re.search(salary_pattern, answer.lower())
    signals["salary_mentioned"] = bool(salary_match)
    
    # 4. Explicit Mentions: Availability/Notice Period
    # Matches: 2 weeks, 1 month, immediate
    notice_pattern = r'\b(\d+\s*(?:week|month|day)s?|immediate(?:ly)?|asap)\b'
    notice_match = re.search(notice_pattern, answer.lower())
    signals["availability_mentioned"] = bool(notice_match)

    # 5. Counter-Questions
    # Asking questions back is a strong interest signal
    signals["asked_questions"] = answer.count('?')

    # 6. Repetition/Gaming Detection (basic)
    # Penalize if they just say "I am very interested" over and over
    lower_ans = answer.lower()
    is_gaming = lower_ans.count("very interested") > 2 or lower_ans.count("excited") > 3
    signals["is_repetitive"] = is_gaming

    return signals
