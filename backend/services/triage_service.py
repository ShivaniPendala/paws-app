import os
import json
import base64
import logging
import warnings
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()
warnings.filterwarnings("ignore")
logger = logging.getLogger("paws.triage")

GEMINI_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
]

def run_ai_triage(image_bytes: bytes, user_notes: str = "") -> Dict[str, Any]:
    """Analyze image using Gemini first; fallback to OpenAI if rate-limited or unavailable."""
    
    prompt = (
        "You are a veterinary triage assistant. Analyze the attached image "
        "and user notes, then return ONLY a valid JSON object with keys: "
        "injury_score (integer 1-10), condition_summary (short string), "
        "is_emergency (boolean true/false), visual_traits (object with primary_color string, distinct_marks list of strings)."
    )
    if user_notes:
        prompt += f"\nUser Notes: {user_notes}"

    # 1. TRY GEMINI FIRST
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=gemini_key)

            for model_name in GEMINI_MODELS:
                try:
                    logger.info(f"Attempting AI triage with Gemini ({model_name})...")
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                            prompt,
                        ],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.2
                        ),
                    )
                    parsed = json.loads(response.text)
                    return _format_triage_response(parsed)
                except Exception as e:
                    if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                        logger.warning(f"Gemini rate limit hit on {model_name}. Trying OpenAI fallback...")
                        break # Break inner loop to try OpenAI fallback
                    logger.error("Gemini attempt with '%s' failed: %s", model_name, str(e))
        except Exception as e:
            logger.error(f"Gemini client initialization failed: {e}")

    # 2. FALLBACK TO OPENAI (ChatGPT Vision) IF GEMINI FAILS / RATE LIMITED
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        try:
            logger.info("Attempting fallback triage with OpenAI (gpt-4o-mini)...")
            from openai import OpenAI
            openai_client = OpenAI(api_key=openai_key)

            # Convert image bytes to base64 data URL for OpenAI
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            image_url = f"data:image/jpeg;base64,{base64_image}"

            completion = openai_client.chat.completions.create(
                model="gpt-4o-mini", # Lightweight, fast, and supports JSON mode
                messages=[
                    {
                        "role": "system",
                        "content": "You are a veterinary triage assistant. You must respond strictly with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}}
                        ]
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.2
            )

            parsed = json.loads(completion.choices[0].message.content)
            return _format_triage_response(parsed)

        except Exception as e:
            logger.error(f"OpenAI fallback failed: {e}")

    # 3. FINAL LOCAL HEURISTIC FALLBACK
    logger.warning("All AI providers failed or exhausted quota. Using local heuristic fallback.")
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
    result = run_ai_triage(image_bytes, user_notes)
    return {
        "injury_score": result.get("injury_score", 1),
        "features": [result.get("visual_traits", {}).get("primary_color", "unknown")],
        "caption": result.get("condition_summary", ""),
        "is_emergency": result.get("is_emergency", False),
        "visual_traits": result.get("visual_traits", {}),
    }

def compare_images(image1_bytes: bytes, image2_bytes: bytes) -> float:
    try:
        if image1_bytes == image2_bytes:
            return 1.0
        return 0.50
    except Exception as e:
        logger.warning("Image comparison failed: %s", e)
        return 0.0