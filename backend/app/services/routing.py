"""Planned drive estimates for consecutive jobs using Google Routes API v2."""

import logging
import math
from dataclasses import dataclass
from datetime import time

import httpx

logger = logging.getLogger(__name__)

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


@dataclass(frozen=True)
class RouteEstimate:
    duration_minutes: int
    distance_meters: int
    encoded_polyline: str | None


def parse_duration_seconds(value: str) -> float:
    if not value.endswith("s"):
        raise ValueError("Routes API duration must end with 's'")
    return float(value[:-1])


def available_minutes(previous_end: time | None, next_start: time | None) -> int | None:
    if previous_end is None or next_start is None:
        return None
    previous = previous_end.hour * 60 + previous_end.minute
    following = next_start.hour * 60 + next_start.minute
    return following - previous


def compute_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    api_key: str,
) -> RouteEstimate | None:
    """Return a road-based planned drive estimate; failures stay non-fatal."""
    if not api_key:
        return None

    body = {
        "origin": {
            "location": {
                "latLng": {"latitude": origin[0], "longitude": origin[1]}
            }
        },
        "destination": {
            "location": {
                "latLng": {"latitude": destination[0], "longitude": destination[1]}
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
        "polylineQuality": "OVERVIEW",
    }
    try:
        response = httpx.post(
            ROUTES_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": (
                    "routes.duration,routes.distanceMeters,"
                    "routes.polyline.encodedPolyline"
                ),
            },
            json=body,
            timeout=8.0,
        )
        response.raise_for_status()
        route = (response.json().get("routes") or [None])[0]
        if not route:
            return None
        seconds = parse_duration_seconds(route["duration"])
        return RouteEstimate(
            duration_minutes=max(1, math.ceil(seconds / 60)),
            distance_meters=int(route.get("distanceMeters", 0)),
            encoded_polyline=route.get("polyline", {}).get("encodedPolyline"),
        )
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        logger.warning("Routes API request failed: %s", exc)
        return None
