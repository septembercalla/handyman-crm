from datetime import time

import httpx

from app.services.routing import ROUTES_URL, available_minutes, compute_route


class FakeResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {
            "routes": [
                {
                    "duration": "721s",
                    "distanceMeters": 5432,
                    "polyline": {"encodedPolyline": "encoded-route"},
                }
            ]
        }


def test_compute_route_uses_routes_v2_and_rounds_up(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(url: str, **kwargs) -> FakeResponse:
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    estimate = compute_route((41.88, -87.63), (41.91, -87.66), "server-key")

    assert estimate is not None
    assert estimate.duration_minutes == 13
    assert estimate.distance_meters == 5432
    assert estimate.encoded_polyline == "encoded-route"
    assert captured["url"] == ROUTES_URL
    assert captured["headers"]["X-Goog-Api-Key"] == "server-key"
    assert "routes.duration" in captured["headers"]["X-Goog-FieldMask"]
    assert captured["json"]["travelMode"] == "DRIVE"


def test_compute_route_failure_is_non_fatal(monkeypatch) -> None:
    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "post", fake_post)
    assert compute_route((1.0, 2.0), (3.0, 4.0), "server-key") is None
    assert compute_route((1.0, 2.0), (3.0, 4.0), "") is None


def test_available_minutes_handles_gaps_and_missing_times() -> None:
    assert available_minutes(time(9, 30), time(10, 15)) == 45
    assert available_minutes(time(11, 0), time(10, 45)) == -15
    assert available_minutes(None, time(10, 45)) is None
