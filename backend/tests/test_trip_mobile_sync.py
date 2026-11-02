"""A mobile completion must appear in the office weekly report."""

import uuid
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.models import Task
from tests.conftest import login
from tests.test_mobile import headers, mobile_data, session, task_fixture  # noqa: F401


def test_mobile_completion_flows_into_office_trip(client, db, users, request):
    data = request.getfixturevalue("mobile_data")
    dispatcher, created = task_fixture(client, data)
    task = db.get(Task, uuid.UUID(created["id"]))
    task.labor_price = Decimal("128.75")
    task.materials_cost = Decimal("10.00")
    db.commit()
    assigned = client.post(
        f"/api/v1/mobile/tasks/{task.id}/assign",
        headers=headers(dispatcher),
        json={"handyman_id": str(data["handyman"].id), "expected_revision": task.revision},
    )
    assert assigned.status_code == 200, assigned.text
    tech = session(client, data["tech"].email, "synthetic-password")
    latest = assigned.json()
    for status in ("in_progress", "done"):
        changed = client.post(
            f"/api/v1/mobile/tasks/{task.id}/status",
            headers=headers(tech),
            json={"status": status, "expected_revision": latest["revision"]},
        )
        assert changed.status_code == 200, changed.text
        latest = changed.json()
    login(client, users["admin"].email, "admin-password")
    completed_day = (
        datetime.fromisoformat(latest["completed_at"])
        .astimezone(ZoneInfo("America/Chicago"))
        .date()
    )
    response = client.get(f"/api/v1/trips/{data['handyman'].id}?week_start={completed_day}")
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["completed_jobs"] == 1
    assert Decimal(report["job_value"]) == Decimal("138.75")
    assert (
        Decimal(report["labor_earnings"]) == Decimal(latest["labor_earnings"]) == Decimal("77.25")
    )
    assert any(job["id"] == str(task.id) for day in report["days"] for job in day["jobs"])
