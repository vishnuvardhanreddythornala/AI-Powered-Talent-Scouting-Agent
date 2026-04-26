from typing import List
from services.vector_service import get_missing_skills_semantically

def analyze_skill_gap(jd_must_haves: List[str], cv_skills: List[str]) -> dict:
    """
    For each missing must-have skill, estimate learning time and suggest resources.
    Returns a bridge learning plan.
    """
    if not jd_must_haves:
        return {"missing_skills": [], "gap_analysis": [], "hire_recommendation": "No strict requirements"}

    # Use semantic matching instead of naive string substring matching
    missing = get_missing_skills_semantically(jd_must_haves, cv_skills, threshold=0.45)
    
    # Simple heuristics (can be LLM-powered later, but this is fast and deterministic)
    learning_times = {
        "python": "2-4 weeks (if programming background)",
        "react": "3-6 weeks (if JavaScript knowledge)",
        "kubernetes": "2-3 months (requires Docker first)",
        "aws": "1-2 months (for basic cloud practitioner level)",
        "docker": "1-2 weeks",
        "sql": "2-3 weeks",
        "java": "1-2 months",
        "go": "3-4 weeks (if coming from C++/Java)",
        "machine learning": "3-6 months (steep learning curve)",
        "system design": "3-6 months",
        "typescript": "1-2 weeks (if JavaScript known)"
    }
    
    gap_analysis = []
    for skill in missing:
        skill_lower = skill.lower()
        # Find closest match or default
        time_estimate = "1-3 months"
        for key, val in learning_times.items():
            if key in skill_lower:
                time_estimate = val
                break
                
        gap_analysis.append({
            "skill": skill,
            "learning_time": time_estimate,
        })
    
    if len(missing) == 0:
        rec = "Perfect match on paper."
    elif len(missing) <= 2:
        rec = "Consider hiring if candidate can upskill in 1-3 months. Good bridge candidate."
    else:
        rec = "Major skill gap. Candidate would require significant ramp-up time."

    return {
        "missing_skills": missing,
        "gap_analysis": gap_analysis,
        "hire_recommendation": rec
    }
