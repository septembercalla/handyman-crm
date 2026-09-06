import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import Base, Customer, Handyman, Task, TaskStatus
from app.models.lead import Lead
from app.services import operations
from app.services import tasks as task_services
from tests.conftest import login

NOW = datetime(2026, 9, 5, 15, 17, 23, 123456, tzinfo=UTC)
PAYLOAD = {
    "source": "thumbtack",
    "name": "New Inquiry",
    "phone": "+1 312 555 0100",
    "email": "inquiry@example.com",
    "address": "123 Michigan Ave",
    "notes": "Needs a quote",
    "service_requested": "Fix a faucet",
    "city": "Chicago",
    "state": "IL",
    "zip_code": "60601",
    "job_summary": "Repair faucet",
}


BOOKING = {
    "title": "Repair",
    "street_address": "123 Main St",
    "city": "Chicago",
    "state": "IL",
    "zip": "60601",
    "scheduled_date": "2026-09-06",
    "time_window_start": "09:00",
    "time_window_end": "11:00",
}


@pytest.fixture(autouse=True)
def operational_tables(db, monkeypatch):
    db.connection().exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(db.get_bind())
    monkeypatch.setattr(operations.settings, "BUSINESS_TIMEZONE", "America/Chicago")
    monkeypatch.setattr(operations, "utcnow", lambda: NOW)
    monkeypatch.setattr("app.routers.leads.refresh_coordinates", lambda task: None)


@pytest.fixture
def dispatcher(client, users):
    login(client, users["dispatcher"].email, "worker-password")
    return client


def create(client, **changes):
    response = client.post("/api/v1/leads", json={**PAYLOAD, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def as_utc(value):
    result = datetime.fromisoformat(value) if isinstance(value, str) else value
    return result.replace(tzinfo=UTC) if result.tzinfo is None else result.astimezone(UTC)


def completed_task(db):
    customer = Customer(full_name="Review Customer")
    db.add(customer)
    db.flush()
    task = Task(
        task_number="T-REVIEW",
        customer_id=customer.id,
        title="Completed",
        status=TaskStatus.done,
        completed_at=NOW - timedelta(hours=1),
    )
    db.add(task)
    db.commit()
    return task


def test_received_and_contact_timestamps_are_server_owned(dispatcher, db, users, monkeypatch):
    lead = create(dispatcher)
    assert lead["stage"] == "new"
    assert as_utc(lead["received_at"]) == NOW
    assert lead["first_contacted_at"] is None
    first = NOW + timedelta(minutes=2)
    monkeypatch.setattr(operations, "utcnow", lambda: first)
    response = dispatcher.post(
        f"/api/v1/leads/{lead['id']}/contact",
        json={
            "outcome": "no_answer",
            "note": "First call",
            "next_follow_up_at": "2026-09-06T09:00:00",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["stage"] == "contacting"
    assert data["latest_contact_outcome"] == "no_answer"
    assert data["contact_attempts"] == 1
    assert as_utc(data["first_contacted_at"]) == first
    assert as_utc(data["next_follow_up_at"]) == datetime(2026, 9, 6, 14, tzinfo=UTC)
    second = first + timedelta(hours=2)
    monkeypatch.setattr(operations, "utcnow", lambda: second)
    response = dispatcher.post(f"/api/v1/leads/{lead['id']}/contact", json={"outcome": "voicemail"})
    data = response.json()
    assert data["contact_attempts"] == 2
    assert as_utc(data["first_contacted_at"]) == first
    assert as_utc(data["last_contacted_at"]) == second
    assert as_utc(data["received_at"]) == NOW
    assert data["next_follow_up_at"] is not None
    dispatcher.patch(f"/api/v1/leads/{lead['id']}", json={**PAYLOAD, "notes": "Updated notes"})
    db.expire_all()
    record = db.get(Lead, uuid.UUID(lead["id"]))
    assert as_utc(record.first_contacted_at) == first
    assert as_utc(record.last_contacted_at) == second
    history = dispatcher.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert [item["event_type"] for item in history] == [
        "received",
        "assigned",
        "no_answer",
        "follow_up_scheduled",
        "voicemail",
        "updated",
    ]
    assert all(item["user_id"] == str(users["dispatcher"].id) for item in history)
    assert as_utc(history[2]["timestamp"]) == first
    assert "2026-09-06 09:00:00 CDT (America/Chicago)" in history[2]["note"]


@pytest.mark.parametrize(
    "outcome,stage",
    [
        ("answered", "contacting"),
        ("texted", "contacting"),
        ("no_answer", "contacting"),
        ("voicemail", "contacting"),
        ("wrong_number", "contacting"),
        ("call_back_later", "contacting"),
    ],
)
def test_stage_and_contact_outcome_are_separate(dispatcher, outcome, stage):
    lead = create(dispatcher)
    response = dispatcher.post(f"/api/v1/leads/{lead['id']}/contact", json={"outcome": outcome})
    assert response.status_code == 200
    assert response.json()["stage"] == stage
    assert response.json()["latest_contact_outcome"] == outcome


def test_follow_up_and_lost_history(dispatcher):
    lead = create(dispatcher)
    base = f"/api/v1/leads/{lead['id']}"
    assert (
        dispatcher.post(
            f"{base}/follow-up", json={"next_follow_up_at": "2026-09-06T14:00:00Z"}
        ).status_code
        == 200
    )
    response = dispatcher.post(f"{base}/lost", json={"reason": "outside_service_area"})
    assert response.status_code == 200
    assert response.json()["next_follow_up_at"] is None
    assert response.json()["lost_reason"] == "outside_service_area"
    assert dispatcher.post(f"{base}/contact", json={"outcome": "answered"}).status_code == 409
    assert dispatcher.post(f"{base}/book", json={**BOOKING, "title": "No"}).status_code == 409
    assert [e["event_type"] for e in dispatcher.get(f"{base}/activities").json()] == [
        "received",
        "assigned",
        "follow_up_scheduled",
        "lost",
    ]


@pytest.mark.parametrize("existing", [False, True])
def test_booking_links_source_and_avoids_duplicates(dispatcher, db, existing):
    lead = create(dispatcher)
    payload = {
        **BOOKING,
        "title": "Faucet repair",
        "city": "Chicago",
        "scheduled_date": "2026-09-06",
    }
    if existing:
        customer = Customer(full_name="Matched customer", phone=PAYLOAD["phone"])
        db.add(customer)
        db.commit()
        payload["customer_id"] = str(customer.id)
    response = dispatcher.post(f"/api/v1/leads/{lead['id']}/book", json=payload)
    assert response.status_code == 200, response.text
    booked = response.json()
    assert booked["source"] == "thumbtack"
    assert booked["stage"] == "booked"
    assert as_utc(booked["booked_at"]) == NOW
    assert as_utc(booked["received_at"]) == NOW
    task = db.get(Task, uuid.UUID(booked["converted_task_id"]))
    assert str(task.customer_id) == booked["converted_customer_id"]
    if existing:
        assert task.customer_id == customer.id
        assert customer.full_name == "Matched customer"
    for _ in range(2):
        again = dispatcher.post(f"/api/v1/leads/{lead['id']}/book", json=payload)
        assert again.json()["converted_task_id"] == str(task.id)
    assert db.scalar(select(func.count()).select_from(Customer)) == 1
    assert db.scalar(select(func.count()).select_from(Task)) == 1
    assert "labor_price" not in booked and "handyman_payout_percent" not in booked
    assert dispatcher.get("/api/v1/leads", params={"task_id": str(task.id)}).json()["total"] == 1
    assert (
        dispatcher.get("/api/v1/leads", params={"customer_id": str(task.customer_id)}).json()[
            "total"
        ]
        == 1
    )
    history = dispatcher.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert len(history) == 3 and task.task_number in history[-1]["note"]


def test_activity_survives_task_and_customer_deletion(dispatcher, db):
    lead = create(dispatcher)
    base = f"/api/v1/leads/{lead['id']}"
    booked = dispatcher.post(f"{base}/book", json=BOOKING).json()
    before = dispatcher.get(f"{base}/activities").json()
    assert dispatcher.delete(f"/api/v1/tasks/{booked['converted_task_id']}").status_code == 204
    assert (
        dispatcher.delete(f"/api/v1/customers/{booked['converted_customer_id']}").status_code == 204
    )
    db.expire_all()
    assert dispatcher.get(f"{base}/activities").json() == before
    saved = dispatcher.get(base).json()
    assert saved["stage"] == "booked" and saved["source"] == "thumbtack"
    assert saved["converted_task_id"] is None and saved["converted_customer_id"] is None
    assert dispatcher.delete(base).status_code == 405
    assert (
        dispatcher.patch(f"{base}/activities/{before[0]['id']}", json={"note": "erase"}).status_code
        == 404
    )


def test_attention_queue_excludes_closed_leads_and_uses_business_dates(dispatcher, db):
    new = create(dispatcher, name="New")
    due = create(dispatcher, name="Due")
    future = create(dispatcher, name="Future")
    stale = create(dispatcher, name="Stale")
    for lead, timestamp in [(due, "2026-09-05T09:00:00"), (future, "2026-09-07T09:00:00")]:
        dispatcher.post(
            f"/api/v1/leads/{lead['id']}/contact",
            json={"outcome": "no_answer", "next_follow_up_at": timestamp},
        )
    dispatcher.post(f"/api/v1/leads/{stale['id']}/contact", json={"outcome": "answered"})
    record = db.get(Lead, uuid.UUID(stale["id"]))
    record.last_activity_at = NOW - timedelta(days=3)
    db.commit()

    def ids(attention):
        result = dispatcher.get("/api/v1/leads", params={"attention": attention})
        assert result.status_code == 200, result.text
        return {row["id"] for row in result.json()["items"]}

    assert ids("new") == {new["id"]}
    assert ids("due_today") == ids("overdue") == {due["id"]}
    assert ids("stale") == {stale["id"]}
    assert ids("needs_follow_up") == {new["id"], due["id"], stale["id"]}
    assert ids("no_answer") == {due["id"], future["id"]}
    dispatcher.post(f"/api/v1/leads/{due['id']}/lost", json={"reason": "project_postponed"})
    assert ids("overdue") == set()


def test_business_received_date_filter_and_search(dispatcher, db):
    lead = create(dispatcher)
    record = db.get(Lead, uuid.UUID(lead["id"]))
    record.received_at = datetime(2026, 9, 6, 2, tzinfo=UTC)  # Sep 5 Chicago
    db.commit()
    assert (
        dispatcher.get(
            "/api/v1/leads", params={"date_from": "2026-09-05", "date_to": "2026-09-05"}
        ).json()["total"]
        == 1
    )
    for search in ["inquiry", "312", "example.com", "michigan"]:
        assert dispatcher.get("/api/v1/leads", params={"search": search}).json()["total"] == 1
    assert dispatcher.get("/api/v1/leads", params={"source": "facebook"}).json()["total"] == 0


def test_exact_task_completion_and_review_timestamps(dispatcher, db, monkeypatch):
    task = completed_task(db)
    worker = Handyman(full_name="Worker")
    db.add(worker)
    task.status, task.completed_at = TaskStatus.assigned, None
    db.flush()
    task.handyman_id = worker.id
    db.commit()

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz)

    monkeypatch.setattr(task_services, "datetime", Clock)
    base = f"/api/v1/tasks/{task.id}"
    response = dispatcher.post(f"{base}/status", json={"status": "in_progress"})
    assert as_utc(response.json()["started_at"]) == NOW
    response = dispatcher.post(f"{base}/status", json={"status": "done"})
    assert as_utc(response.json()["completed_at"]) == NOW
    assert response.json()["review_status"] == "not_requested"
    assert response.json()["review_received_at"] is None
    request_time = NOW + timedelta(days=1)
    monkeypatch.setattr(operations, "utcnow", lambda: request_time)
    response = dispatcher.post(f"{base}/review", json={"status": "requested"})
    assert response.status_code == 200, response.text
    assert as_utc(response.json()["review_requested_at"]) == request_time
    received_time = NOW + timedelta(days=2)
    monkeypatch.setattr(operations, "utcnow", lambda: received_time)
    dispatcher.post(f"{base}/review", json={"status": "requested"})
    response = dispatcher.post(
        f"{base}/review", json={"status": "received", "rating": 5, "platform": "google"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["review_rating"] == 5
    assert response.json()["review_platform"] == "google"
    assert as_utc(response.json()["review_requested_at"]) == request_time
    assert as_utc(response.json()["review_received_at"]) == received_time
    assert as_utc(response.json()["completed_at"]) == NOW
    monkeypatch.setattr(operations, "utcnow", lambda: received_time + timedelta(hours=5))
    response = dispatcher.post(
        f"{base}/review", json={"status": "received", "rating": 4, "platform": "google"}
    )
    assert as_utc(response.json()["review_received_at"]) == received_time
    response = dispatcher.patch(base, json={"internal_notes": "Unrelated edit"})
    assert as_utc(response.json()["completed_at"]) == NOW
    assert as_utc(response.json()["review_requested_at"]) == request_time
    assert dispatcher.post(f"{base}/review", json={"status": "skipped"}).status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "received"},
        {"status": "received", "rating": 0, "platform": "google"},
        {"status": "received", "rating": 6, "platform": "google"},
        {"status": "requested", "review_requested_at": "2020-01-01T00:00:00Z"},
    ],
)
def test_invalid_reviews_are_rejected(dispatcher, db, payload):
    task = completed_task(db)
    assert dispatcher.post(f"/api/v1/tasks/{task.id}/review", json=payload).status_code == 422
    db.refresh(task)
    assert task.review_received_at is None


def test_operations_metrics_and_task_filters(dispatcher, db):
    create(dispatcher)
    lead = create(dispatcher, name="Booked")
    dispatcher.post(f"/api/v1/leads/{lead['id']}/book", json={**BOOKING, "title": "Job"})
    task = completed_task(db)
    data = dispatcher.get("/api/v1/operations").json()
    assert data["timezone"] == "America/Chicago"
    assert (
        data["new_leads"]
        == data["booked_this_week"]
        == data["completed_this_week"]
        == data["reviews_pending"]
        == 1
    )
    assert dispatcher.get("/api/v1/tasks", params={"review_pending": True}).json()["total"] == 1
    dispatcher.post(
        f"/api/v1/tasks/{task.id}/review",
        json={"status": "received", "rating": 5, "platform": "thumbtack"},
    )
    data = dispatcher.get("/api/v1/operations").json()
    assert data["reviews_pending"] == 0 and data["five_star_this_week"] == 1
    assert (
        dispatcher.get("/api/v1/tasks", params={"five_star_this_week": True}).json()["total"] == 1
    )


@pytest.mark.parametrize(
    "role,password", [("admin", "admin-password"), ("dispatcher", "worker-password")]
)
def test_permissions_and_financial_fields_not_exposed(client, users, role, password):
    assert client.get("/api/v1/leads").status_code == 401
    assert client.get("/api/v1/operations").status_code == 401
    login(client, users[role].email, password)
    lead = create(client)
    assert client.get(f"/api/v1/leads/{lead['id']}/activities").status_code == 200
    assert (
        client.post(
            f"/api/v1/leads/{lead['id']}/book",
            json={**BOOKING, "title": "Job", "labor_price": "500"},
        ).status_code
        == 422
    )
    assert (
        client.post("/api/v1/leads", json={**PAYLOAD, "received_at": "2000-01-01"}).status_code
        == 422
    )
    assert "payout" not in str(client.get("/api/v1/leads").json())


@pytest.mark.parametrize("value", [datetime(2026, 3, 8, 2, 30), datetime(2026, 11, 1, 1, 30)])
def test_dst_follow_up_requires_unambiguous_time(dispatcher, value):
    lead = create(dispatcher)
    response = dispatcher.post(
        f"/api/v1/leads/{lead['id']}/follow-up", json={"next_follow_up_at": value.isoformat()}
    )
    assert response.status_code == 422
    assert "daylight saving" in response.json()["detail"]
