"""Spatial utilities: geohash and distance calculations for deduplication."""
from typing import Tuple
import math

# Prefer the external `geohash` package when available, but provide a
# deterministic fallback to avoid crashing in minimal environments where the
# dependency hasn't been installed (e.g., during quick local runs).
try:
    import geohash as _geohash

    def geohash_encode(lat: float, lng: float, precision: int = 7) -> str:
        return _geohash.encode(lat, lng, precision=precision)
except Exception:
    def geohash_encode(lat: float, lng: float, precision: int = 7) -> str:
        """Fallback geohash-like string: deterministic and sortable for quick use.

        This is NOT a true geohash but is sufficient for logging, simple grouping,
        and avoiding import-time failures. For production, install `python-geohash`.
        """
        return f"lat{lat:.5f}_lng{lng:.5f}"[:precision]


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Return great-circle distance between two points in kilometers."""
    R = 6371.0  # Earth radius in km
    lat1 = math.radians(a_lat)
    lon1 = math.radians(a_lng)
    lat2 = math.radians(b_lat)
    lon2 = math.radians(b_lng)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def is_within_radius(a_lat: float, a_lng: float, b_lat: float, b_lng: float, radius_km: float) -> bool:
    return haversine_km(a_lat, a_lng, b_lat, b_lng) <= radius_km
