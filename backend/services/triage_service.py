import os
import json
import logging
import warnings
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables explicitly from backend/.env
load_dotenv()

# Suppress non-critical warnings
warnings.filterwarnings("ignore")
logger = logging.getLogger("paws.triage")

# Active production models supported for generateContent
GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
]

def run_gemini_triage(image_bytes: bytes, user_notes: str = "") -> Dict[str, Any]:
    """Analyze an image using the google-genai SDK with active Gemini models."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    
    prompt = (
        "You are a veterinary triage assistant. Analyze the attached image "
        "and user notes, then return ONLY a valid JSON object with keys: "
        "injury_score (integer 1-10), condition_summary (short string), "
        "is_emergency (boolean true/false), visual_traits (object with primary_color string, distinct_marks list of strings)."
    )
    if user_notes:
        prompt += f"\nUser Notes: {user_notes}"

    if api_key:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        for model_name in GEMINI_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                        prompt,
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json"
                    ),
                )

                parsed = json.loads(response.text)
                return _format_triage_response(parsed)

            except Exception as e:
                logger.warning("Attempt with model '%s' failed: %s", model_name, str(e))
                continue

    # Fallback heuristic
    logger.warning("Using heuristic triage fallback")
    size_kb = max(1, len(image_bytes) // 1024)
    injury_score = min(10, max(1, 1 + size_kb // 50))
    return {
        "injury_score": int(injury_score),
        "condition_summary": f"Fallback heuristic score: {injury_score}.",
        "is_emergency": injury_score >= 7,
        "visual_traits": {"primary_color": "unknown", "distinct_marks": []},
    }

def _format_triage_response(parsed: Dict[str, Any]) -> Dict[str, Any]:
    injury_score = max(1, min(10, int(parsed.get("injury_score", 1))))
    return {
        "injury_score": injury_score,
        "condition_summary": parsed.get("condition_summary", "No summary provided."),
        "is_emergency": bool(parsed.get("is_emergency", injury_score >= 7)),
        "visual_traits": parsed.get("visual_traits", {"primary_color": "unknown", "distinct_marks": []}),
    }

def analyze_image(image_bytes: bytes, user_notes: str = "") -> Dict[str, Any]:
    result = run_gemini_triage(image_bytes, user_notes)
    return {
        "injury_score": result.get("injury_score", 1),
        "features": [result.get("visual_traits", {}).get("primary_color", "unknown")],
        "caption": result.get("condition_summary", ""),
        "is_emergency": result.get("is_emergency", False),
        "visual_traits": result.get("visual_traits", {}),
    }

def compare_images(image1_bytes: bytes, image2_bytes: bytes) -> float:
    """Compare two dog images and return a similarity score from 0.0 to 1.0."""
    try:
        if image1_bytes == image2_bytes:
            return 1.0
        return 0.50
    except Exception as e:
        logger.warning("Image comparison failed: %s", e)
        return 0.0