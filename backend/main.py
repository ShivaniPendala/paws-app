from typing import Optional, List
import logging
import os
import uuid
import asyncio

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Depends, FastAPI, File, UploadFile, Form, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from .services import triage_service, spatial_service, firestore_service
    from . import config
except Exception:
    import services.triage_service as triage_service
    import services.spatial_service as spatial_service
    import services.firestore_service as firestore_service
    import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("paws.backend")

app = FastAPI(title="PAWS Backend - Predictive Animal Welfare System")

LOCAL_INCIDENTS = [
    {"id": "demo-1", "dog_id": "PAWS-A17C", "lat": 17.388, "lng": 78.49, "status": "OPEN", "injury_score": 9, "condition_summary": "Possible road trauma; hind leg appears compromised.", "is_emergency": True, "distance_km": 0.8},
    {"id": "demo-2", "dog_id": "PAWS-9D2K", "lat": 17.379, "lng": 78.481, "status": "DISPATCHED", "injury_score": 6, "condition_summary": "Limping reported near a market lane.", "is_emergency": False, "distance_km": 1.2},
    {"id": "demo-3", "dog_id": "PAWS-4F88", "lat": 17.391, "lng": 78.477, "status": "PENDING", "injury_score": 4, "condition_summary": "Minor skin irritation; monitoring requested.", "is_emergency": False, "distance_km": 2.1},
]
LOCAL_DOGS = [
    {"id": "dog-1", "name": "Mango", "tag": "PAWS-DOG-021", "territory": "Abids market", "vaccinated": True, "distance_km": 0.7, "lat": 17.385, "lng": 78.4867, "color": "#f59e0b"},
    {"id": "dog-2", "name": "Chai", "tag": "PAWS-DOG-044", "territory": "Tank Bund north", "vaccinated": False, "distance_km": 1.9, "lat": 17.379, "lng": 78.481, "color": "#64748b"},
    {"id": "dog-3", "name": "Biscuit", "tag": "PAWS-DOG-063", "territory": "Lakdi-ka-pul", "vaccinated": True, "distance_km": 2.6, "lat": 17.391, "lng": 78.477, "color": "#92400e"},
]


def _local_nearby(items, lat, lng, radius_km):
    return [item for item in items if spatial_service.is_within_radius(lat, lng, item["lat"], item["lng"], radius_km)]


def _trait_match_score(current_triage: dict, candidate: dict) -> float:
    """Use AI visual traits as a secondary match signal when images are unavailable."""
    previous = candidate.get("metadata", {}).get("triage", {})
    current_traits = current_triage.get("visual_traits", {})
    previous_traits = previous.get("visual_traits", {})
    current_color = current_traits.get("primary_color")
    previous_color = previous_traits.get("primary_color")
    current_marks = set(current_traits.get("distinct_marks", []))
    previous_marks = set(previous_traits.get("distinct_marks", []))
    score = 0.0
    if current_color and previous_color and current_color != "unknown" and current_color == previous_color:
        score += 0.35
    if current_marks and previous_marks:
        score += 0.65 * len(current_marks & previous_marks) / max(len(current_marks | previous_marks), 1)
    return min(score, 1.0)


def _load_local_env_file() -> None:
    """Load `backend/.env` into the process environment for local development."""
    try:
        from pathlib import Path
        env_path = Path(__file__).resolve().parent / ".env"
        if not env_path.exists():
            return
        with env_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
        logger.info("Loaded local env file: %s", env_path)
    except Exception:
        logger.exception("Failed to load backend/.env file")


def _initialize_firebase_admin() -> None:
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
        return
    firebase_admin.initialize_app()


async def _require_firebase_user(authorization: Optional[str] = Header(None, alias="Authorization")) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: missing Firebase bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid Firebase bearer token")

    try:
        _initialize_firebase_admin()
        claims = firebase_auth.verify_id_token(token)
    except Exception as exc:
        logger.warning("Firebase token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Unauthorized: invalid Firebase token") from exc

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized: missing user identity")
    return uid


async def _require_verified_ngo(authorization: Optional[str] = Header(None, alias="Authorization")) -> str:
    """Require a Firebase-admin-issued NGO verification claim for rescue actions."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: missing Firebase bearer token")
    try:
        _initialize_firebase_admin()
        claims = firebase_auth.verify_id_token(authorization.split(" ", 1)[1].strip())
    except Exception as exc:
        logger.warning("NGO token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Unauthorized: invalid Firebase token") from exc
    if claims.get("ngo_verified") is not True and claims.get("role") != "ngo":
        raise HTTPException(status_code=403, detail="NGO access requires administrator verification")
    return claims["uid"]


# Load local .env file immediately
_load_local_env_file()

# Production CORS configuration
origins = [
    "https://project-p-507510.web.app",
    "https://project-p-507510.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProcessResponse(BaseModel):
    status: str
    message: Optional[str] = None
    dog_id: Optional[str] = None
    candidate: Optional[dict] = None
    injury_score: Optional[int] = None
    condition_summary: Optional[str] = None
    is_emergency: Optional[bool] = None
    visual_traits: Optional[dict] = None


class CommunityDogPayload(BaseModel):
    name: str
    territory: str
    details: Optional[str] = None
    vaccinated: bool = False
    lat: float
    lng: float
    tag: Optional[str] = None


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    rescue_notes: Optional[str] = None


class MatchConfirmation(BaseModel):
    lat: float
    lng: float


@app.get("/api/config/maps")
async def get_maps_config():
    """Provide the Maps browser key without storing it in frontend source."""
    maps_api_key = config.get_maps_api_key() if hasattr(config, "get_maps_api_key") else os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not maps_api_key:
        raise HTTPException(status_code=503, detail="Google Maps is not configured")
    return {"api_key": maps_api_key}


@app.get("/api/incidents/nearby")
async def get_nearby_incidents(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(25.0, gt=0, le=100),
):
    """Return active incidents for the reporter and NGO map views with graceful fallback."""
    try:
        incidents = await asyncio.wait_for(
            asyncio.to_thread(firestore_service.get_active_incidents_nearby, lat, lng, radius_km),
            timeout=5,
        )
    except Exception as exc:
        logger.warning(f"Firestore query failed: {exc}. Returning local cache.")
        incidents = _local_nearby(LOCAL_INCIDENTS, lat, lng, radius_km)

    return {
        "incidents": [
            {
                "id": incident.get("id", "temp_id"),
                "dog_id": incident.get("dog_id"),
                "lat": incident.get("lat", lat),
                "lng": incident.get("lng", lng),
                "status": incident.get("status", "OPEN"),
                "injury_score": incident.get("injury_score", incident.get("metadata", {}).get("triage", {}).get("injury_score", 1)),
                "condition_summary": incident.get("condition_summary", incident.get("metadata", {}).get("triage", {}).get("caption", "Active animal welfare report")),
                "is_emergency": incident.get("is_emergency", False),
                "distance_km": incident.get("distance_km"),
            }
            for incident in incidents
            if isinstance(incident, dict)
        ]
    }


@app.get("/api/community-dogs")
async def get_community_dogs(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(3.0, gt=0, le=25),
):
    try:
        firestore_service._init()
        dogs = []
        for doc in firestore_service._db.collection("community_dogs").stream():
            data = doc.to_dict()
            if data.get("lat") is not None and data.get("lng") is not None and spatial_service.is_within_radius(lat, lng, data["lat"], data["lng"], radius_km):
                dogs.append({"id": doc.id, **data, "distance_km": round(spatial_service.haversine_km(lat, lng, data["lat"], data["lng"]), 1)})
    except Exception as exc:
        logger.warning(f"Community registry unavailable: {exc}. Returning local cache.")
        dogs = [
            {**dog, "distance_km": round(spatial_service.haversine_km(lat, lng, dog["lat"], dog["lng"]), 1)}
            for dog in _local_nearby(LOCAL_DOGS, lat, lng, radius_km)
        ]
    return {"dogs": dogs}


@app.post("/api/community-dogs")
async def create_community_dog(payload: CommunityDogPayload):
    dog = {"id": str(uuid.uuid4()), **payload.dict(), "tag": payload.tag or f"PAWS-DOG-{str(uuid.uuid4())[:3].upper()}"}
    try:
        firestore_service._init()
        firestore_service._db.collection("community_dogs").add(dog)
    except Exception as exc:
        logger.warning(f"Community dog save unavailable: {exc}. Keeping local record.")
        LOCAL_DOGS.insert(0, dog)
    return {"dog": dog}


@app.patch("/api/incidents/{incident_id}")
async def update_incident(incident_id: str, payload: IncidentUpdate, _ngo_uid: str = Depends(_require_verified_ngo)):
    changes = payload.dict(exclude_none=True)
    for incident in LOCAL_INCIDENTS:
        if incident["id"] == incident_id:
            incident.update(changes)
            return {"incident": incident}
    try:
        firestore_service._init()
        firestore_service._db.collection("incidents").document(incident_id).update(changes)
        return {"status": "updated"}
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Incident not found") from exc


@app.post("/api/incidents/{incident_id}/confirm-match")
async def confirm_match(incident_id: str, payload: MatchConfirmation):
    """Attach a confirmed sighting to the existing dog and update its location."""
    for incident in LOCAL_INCIDENTS:
        if incident["id"] == incident_id:
            incident.update({"lat": payload.lat, "lng": payload.lng, "last_seen_at": "now"})
            return {"status": "MATCH_CONFIRMED", "dog_id": incident.get("dog_id"), "incident": incident}
    try:
        firestore_service.update_location(incident_id, payload.lat, payload.lng)
        return {"status": "MATCH_CONFIRMED"}
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Matching incident not found") from exc


@app.post("/api/report/process", response_model=ProcessResponse)
async def process_report(
    image: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    is_bleeding: bool = Form(False),
    unable_to_move: bool = Form(False),
    in_traffic: bool = Form(False),
    user_notes: Optional[str] = Form(None),
    ignore_match: bool = Form(False),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Main ingest endpoint for reports with full exception isolation."""
    user_id = await _require_firebase_user(authorization)

    try:
        image_bytes = await image.read()
    except Exception as exc:
        logger.exception("Failed reading uploaded image")
        raise HTTPException(status_code=400, detail="Invalid image upload")

    # 1) Triage analysis
    try:
        triage = await asyncio.wait_for(
            asyncio.to_thread(triage_service.analyze_image, image_bytes, user_notes or ""),
            timeout=25,
        )
    except asyncio.TimeoutError:
        logger.warning("AI triage timed out; using local fallback result")
        triage = {
            "injury_score": 1,
            "caption": "AI analysis timed out. Manual assessment recommended.",
            "is_emergency": False,
            "visual_traits": {"primary_color": "unknown", "distinct_marks": []},
        }
    injury_score = int(triage.get("injury_score", 0))

    # 2) Spatial deduplication
    try:
        candidates = await asyncio.wait_for(
            asyncio.to_thread(firestore_service.get_active_incidents_nearby, lat, lng, 1.0),
            timeout=5,
        )
    except Exception as exc:
        logger.warning(f"Firestore query skipped due to billing or network error: {exc}")
        candidates = _local_nearby(LOCAL_INCIDENTS, lat, lng, 1.0)

    # 3) Process Candidate Comparison
    best_match = None
    best_confidence = 0.0
    if candidates and not ignore_match:
        for c in candidates:
            try:
                confidence = _trait_match_score(triage, c)
                try:
                    candidate_image = await asyncio.wait_for(
                        asyncio.to_thread(firestore_service.fetch_incident_image, c["id"]),
                        timeout=3,
                    )
                    confidence = max(confidence, triage_service.compare_images(image_bytes, candidate_image))
                except Exception as exc:
                    logger.info("Stored candidate image unavailable for %s: %s", c.get("id"), exc)
                if confidence > best_confidence:
                    best_confidence = confidence
                    best_match = c
            except Exception as exc:
                logger.warning(f"Candidate image comparison failed for {c.get('id')}: {exc}")
                continue

    if best_confidence >= 0.75 and best_match:
        return ProcessResponse(
            status="REQUIRE_HUMAN_CONFIRMATION",
            message="Possible match found",
            dog_id=best_match.get("dog_id"),
            candidate={"id": best_match.get("id"), "dog_id": best_match.get("dog_id"), "lat": best_match.get("lat"), "lng": best_match.get("lng"), "confidence": best_confidence, "photo_ref": best_match.get("photo_ref")},
            injury_score=injury_score,
            condition_summary=triage.get("caption", "No summary provided."),
            is_emergency=triage.get("is_emergency", injury_score >= 7),
            visual_traits=triage.get("visual_traits", {"features": triage.get("features", [])}),
        )

    # 4) Fallback profile creation
    try:
        dog_id = await asyncio.wait_for(
            asyncio.to_thread(
                firestore_service.create_dog_profile,
                lat,
                lng,
                image_bytes,
                {
                    "user_id": user_id,
                    "notes": user_notes,
                    "flags": {"is_bleeding": is_bleeding, "unable_to_move": unable_to_move, "in_traffic": in_traffic},
                    "triage": triage,
                },
            ),
            timeout=8,
        )
    except Exception as exc:
        logger.warning(f"Firestore profile creation failed: {exc}. Generating local session ID.")
        dog_id = f"local_dog_{int(os.times().system * 1000)}"
        LOCAL_INCIDENTS.insert(0, {
            "id": str(uuid.uuid4()),
            "dog_id": dog_id,
            "lat": lat,
            "lng": lng,
            "status": "OPEN",
            "injury_score": injury_score,
            "condition_summary": triage.get("caption", "AI triage complete"),
            "is_emergency": triage.get("is_emergency", injury_score >= 7),
            "distance_km": 0,
        })

    # Trigger alerts if emergency
    if injury_score >= 7:
        try:
            firestore_service.trigger_fcm_alerts(dog_id, lat, lng, triage)
        except Exception as exc:
            logger.warning(f"FCM Alert trigger skipped: {exc}")

    return ProcessResponse(
        status="CREATED",
        message="New dog profile created",
        dog_id=dog_id,
        injury_score=injury_score,
        condition_summary=triage.get("caption", "No summary provided."),
        is_emergency=triage.get("is_emergency", injury_score >= 7),
        visual_traits=triage.get("visual_traits", {"features": triage.get("features", [])}),
    )