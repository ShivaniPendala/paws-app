"""GCP and Vertex AI configuration helpers.

This module centralizes initialization for Vertex AI / Google GenAI and
common configuration values used by the backend services.
"""
from typing import Any, Dict
import os
import logging

logger = logging.getLogger("paws.config")

# Prefer environment variables for credentials and project scoping.
PROJECT_ID = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
VERTEX_API_KEY = os.environ.get("GOOGLE_API_KEY")
FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "incidents")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET")


def get_maps_api_key() -> str:
    """Read the browser-restricted Maps key from the runtime environment.
    Checks GOOGLE_API_KEY first, then falls back to GOOGLE_MAPS_API_KEY.
    """
    return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY", "")


def vertex_init() -> Dict[str, Any]:
    """Return a minimal configuration object for Vertex/GenAI SDK usage.

    The real SDK initialization is performed in the service modules. Keeping
    this helper simplifies testing and centralizes environment reads.
    """
    cfg = {
        "project": PROJECT_ID,
        "api_key": VERTEX_API_KEY,
        "response_mime_type": "application/json",
    }
    logger.debug("Vertex init config prepared")
    return cfg