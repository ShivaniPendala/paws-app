"""Firestore service: Firestore CRUD, timeline appends, image storage, and FCM alerts.

This module uses `firebase_admin` for Firestore and FCM and `google.cloud.storage`
for binary image storage. All credentials are read from the environment via
standard Google SDK mechanisms.
"""
from typing import Any, Dict, List, Optional
import logging
import os
import uuid
import base64

import firebase_admin
from firebase_admin import credentials, firestore, storage, messaging

try:
    # When running as part of the backend package
    from .spatial_service import is_within_radius, geohash_encode
except Exception:
    # When running `uvicorn main:app` from backend/, fall back to top-level import
    from spatial_service import is_within_radius, geohash_encode

logger = logging.getLogger("paws.firestore")

# Initialize Firebase app lazily
_app = None
_db = None
_bucket = None


def _init():
    global _app, _db, _bucket
    if _app is not None:
        return

    # Grab configuration from environment
    project_id = (
        os.environ.get("GCP_PROJECT") 
        or os.environ.get("GOOGLE_CLOUD_PROJECT") 
        or "project-p-507510"
    )
    bucket_name = os.environ.get("STORAGE_BUCKET", "project-p-507510.firebasestorage.app")

    options = {
        "projectId": project_id,
        "storageBucket": bucket_name,
    }

    # Use explicit JSON credentials if defined, otherwise fall back to ADC with options
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        _app = firebase_admin.initialize_app(cred, options)
    else:
        _app = firebase_admin.initialize_app(options=options)

    _db = firestore.client()
    _bucket = storage.bucket()
    logger.info("Initialized Firebase Admin SDK for project %s", project_id)


def get_active_incidents_nearby(lat: float, lng: float, radius_km: float = 1.0) -> List[Dict[str, Any]]:
    """Return list of active incident documents within `radius_km`.

    Each returned dict has keys: id, dog_id, lat, lng, photo_ref
    """
    _init()
    coll = _db.collection(os.environ.get("FIRESTORE_COLLECTION", "incidents"))
    # Broad query: limit to open cases
    docs = coll.where("status", "==", "OPEN").stream()
    results = []
    for d in docs:
        data = d.to_dict()
        doc_lat = data.get("lat")
        doc_lng = data.get("lng")
        if doc_lat is None or doc_lng is None:
            continue
        if is_within_radius(lat, lng, doc_lat, doc_lng, radius_km):
            results.append({"id": d.id, "dog_id": data.get("dog_id"), "lat": doc_lat, "lng": doc_lng, "photo_ref": data.get("photo_ref"), "metadata": data.get("metadata", {})})
    return results


def fetch_incident_image(doc_id: str) -> bytes:
    _init()
    coll = _db.collection(os.environ.get("FIRESTORE_COLLECTION", "incidents"))
    doc = coll.document(doc_id).get()
    if not doc.exists:
        return b""
    data = doc.to_dict()
    photo_ref = data.get("photo_ref")
    if not photo_ref:
        return b""
    blob = storage.bucket().blob(photo_ref)
    return blob.download_as_bytes()


def _upload_image(image_bytes: bytes, prefix: str = "images/") -> str:
    _init()
    name = f"{prefix}{uuid.uuid4().hex}.jpg"
    blob = storage.bucket().blob(name)
    blob.upload_from_string(image_bytes, content_type="image/jpeg")
    return name


def create_dog_profile(lat: float, lng: float, image_bytes: bytes, metadata: Optional[Dict[str, Any]] = None) -> str:
    _init()
    dog_id = f"PAWS-{uuid.uuid4().hex[:6].upper()}"
    photo_ref = _upload_image(image_bytes, prefix="dogs/")
    coll = _db.collection(os.environ.get("FIRESTORE_COLLECTION", "incidents"))
    doc = {
        "dog_id": dog_id,
        "lat": lat,
        "lng": lng,
        "photo_ref": photo_ref,
        "status": "OPEN",
        "metadata": metadata or {},
    }
    coll.add(doc)
    logger.info("Created new dog profile %s", dog_id)
    return dog_id


def append_timeline(doc_id: str, image_bytes: bytes, note: Optional[str] = None) -> None:
    _init()
    photo_ref = _upload_image(image_bytes, prefix="timeline/")
    coll = _db.collection(os.environ.get("FIRESTORE_COLLECTION", "incidents"))
    timeline_entry = {"photo_ref": photo_ref, "note": note}
    coll.document(doc_id).update({"timeline": firestore.ArrayUnion([timeline_entry])})


def update_location(doc_id: str, lat: float, lng: float) -> None:
    _init()
    coll = _db.collection(os.environ.get("FIRESTORE_COLLECTION", "incidents"))
    coll.document(doc_id).update({"lat": lat, "lng": lng})


def trigger_fcm_alerts(dog_id: str, lat: float, lng: float, triage: Dict[str, Any]) -> None:
    _init()
    # Placeholder: typically we'd query an NGO subscriptions collection and send
    # topic or device messages. For safety, keep this implementation minimal.
    title = f"PAWS Alert: {dog_id} needs help"
    body = f"Injury score {triage.get('injury_score')} reported near ({lat:.5f}, {lng:.5f})"
    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        topic="paws-alerts",
    )
    try:
        resp = messaging.send(message)
        logger.info("FCM alert sent: %s", resp)
    except Exception:
        logger.exception("Failed to send FCM alert")
