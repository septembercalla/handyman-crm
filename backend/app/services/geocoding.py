import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def build_address(street_address: str, city: str, state: str, zip_code: str) -> str:
    tail = ", ".join(p for p in (city, state) if p)
    return ", ".join(p for p in (street_address, tail, zip_code) if p)


def geocode(
    street_address: str, city: str, state: str, zip_code: str
) -> tuple[float, float] | None:
    """
    Resolve an address to coordinates (SPEC §5).

    Returns None when there is no API key, the address is empty, or the lookup
    fails — the task is still saved, just without coordinates, and the UI shows
    a warning on the task record.
    """
    address = build_address(street_address, city, state, zip_code)
    if not settings.GOOGLE_MAPS_API_KEY or not address.strip():
        return None

    try:
        response = httpx.get(
            GEOCODE_URL,
            params={"address": address, "key": settings.GOOGLE_MAPS_API_KEY},
            timeout=6.0,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Geocoding request failed for %r: %s", address, exc)
        return None

    if payload.get("status") != "OK" or not payload.get("results"):
        logger.info("Geocoding returned %s for %r", payload.get("status"), address)
        return None

    location = payload["results"][0]["geometry"]["location"]
    return float(location["lat"]), float(location["lng"])
