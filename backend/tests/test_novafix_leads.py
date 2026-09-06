import ast
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, text

from app.models import Base, Customer, Task
from app.models.lead import Lead
from app.services import operations
from tests.conftest import login
from tests.test_operations import BOOKING

NOW = datetime(2026, 9, 6, 0, 30, 22, 123456, tzinfo=UTC)
MINIMAL = {
    "name": "Attic repair",
    "source": "thumbtack",
    "service_requested": "Drywall",
    "city": "Westmont",
    "state": "IL",
    "zip_code": "60559",
    "job_summary": "Repair ceiling",
}


@pytest.fixture
def api(client, db, users, monkeypatch):
    Base.metadata.create_all(db.get_bind())
    monkeypatch.setattr(operations.settings, "BUSINESS_TIMEZONE", "America/Chicago")
    monkeypatch.setattr(operations, "utcnow", lambda: NOW)
    monkeypatch.setattr("app.routers.leads.refresh_coordinates", lambda task: None)
    login(client, users["dispatcher"].email, "worker-password")
    return client


def create(api, **extra):
    response = api.post("/api/v1/leads", json={**MINIMAL, "source_lead_id": "TT-123", **extra})
    assert response.status_code == 201, response.text
    return response.json()


def post(api, lead, action, payload):
    response = api.post(f"/api/v1/leads/{lead['id']}/{action}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def utc(value):
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


@pytest.mark.parametrize(
    "reference",
    [
        {"phone": "123"},
        {"source_lead_id": "TT-1"},
        {"source_url": "https://www.thumbtack.com/lead/123"},
    ],
)
def test_minimal_lead_and_alternative_references(api, db, reference):
    response = api.post("/api/v1/leads", json={**MINIMAL, **reference})
    assert response.status_code == 201, response.text
    lead = response.json()
    assert lead["stage"] == "new" and utc(lead["received_at"]) == NOW
    assert lead["created_at"] and lead["quote_type"] == "not_quoted"
    assert db.scalars(select(Customer)).all() == []
    assert db.scalars(select(Task)).unique().all() == []
    assert lead["phone"] == reference.get("phone")


@pytest.mark.parametrize(
    "payload",
    [
        {**MINIMAL, "city": ""},
        {**MINIMAL, "job_summary": "  "},
        {**MINIMAL, "phone": "1", "service_requested": ""},
        {"name": "Test", "source": "phone", "phone": "1"},
        {**MINIMAL, "source_url": "javascript:alert(1)"},
        {**MINIMAL, "source_url": "file:///secret"},
    ],
)
def test_invalid_fast_create_rejected(api, payload):
    assert api.post("/api/v1/leads", json=payload).status_code == 422


@pytest.mark.parametrize("method", ["call", "text", "thumbtack_message", "email", "other"])
def test_contact_methods_and_exact_times(api, monkeypatch, method):
    lead = create(api)
    one = post(api, lead, "contact", {"outcome": "answered", "method": method})
    assert one["stage"] == "contacting" and one["qualified_at"] is None
    assert one["last_contact_method"] == method and one["latest_contact_outcome"] == "answered"
    assert one["contact_attempts"] == 1
    later = NOW + timedelta(hours=1)
    monkeypatch.setattr(operations, "utcnow", lambda: later)
    two = post(api, lead, "contact", {"outcome": "no_answer", "method": "call"})
    assert utc(two["first_contacted_at"]) == NOW and utc(two["last_contacted_at"]) == later
    assert two["contact_attempts"] == 2
    history = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert [e["event_type"] for e in history] == ["received", "assigned", "answered", "no_answer"]
    assert f"Method: {method}" in history[2]["note"]


@pytest.mark.parametrize("outcome", ["not_interested", "price_shopping", "price_too_high", "other"])
def test_business_outcomes_are_not_contact_results(api, outcome):
    lead = create(api)
    assert (
        api.post(f"/api/v1/leads/{lead['id']}/contact", json={"outcome": outcome}).status_code
        == 422
    )


def test_explicit_qualification_once_and_original_request_preserved(api, monkeypatch):
    lead = create(api, original_request="Fell through attic. Need mud and tape.")
    first = post(api, lead, "qualify", {"note": "Scope and location confirmed"})
    assert first["stage"] == "qualified" and utc(first["qualified_at"]) == NOW
    monkeypatch.setattr(operations, "utcnow", lambda: NOW + timedelta(days=1))
    again = post(api, lead, "qualify", {})
    assert again["qualified_at"] == first["qualified_at"]
    edited = api.patch(
        f"/api/v1/leads/{lead['id']}",
        json={"service_requested": "Ceiling repair", "notes": "Updated scope"},
    )
    assert edited.status_code == 200
    assert edited.json()["original_request"] == lead["original_request"]
    assert [
        e["event_type"] for e in api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    ].count("qualified") == 1


def test_next_action_independent_followup_and_server_attention(api):
    lead = create(api)
    changed = post(api, lead, "next-action", {"next_action": "waiting_for_decision"})
    assert changed["next_action"] == "waiting_for_decision" and changed["next_follow_up_at"] is None
    followed = post(api, lead, "follow-up", {"next_follow_up_at": "2026-09-05T21:00"})
    assert utc(followed["next_follow_up_at"]) == datetime(2026, 9, 6, 2, tzinfo=UTC)
    assert followed["follow_up_state"] == "due_today"
    overdue = post(api, lead, "follow-up", {"next_follow_up_at": "2026-09-05T09:00"})
    assert overdue["follow_up_state"] == "overdue"
    cleared = post(api, lead, "follow-up", {"next_follow_up_at": None})
    assert cleared["next_action"] == "waiting_for_decision" and cleared["follow_up_state"] == "none"
    assert (
        api.get("/api/v1/leads", params={"next_action": "waiting_for_decision"}).json()["total"]
        == 1
    )
    events = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert [e["event_type"] for e in events] == [
        "received",
        "assigned",
        "next_action_changed",
        "follow_up_scheduled",
        "follow_up_scheduled",
        "follow_up_cleared",
    ]
    assert all(utc(e["timestamp"]) == NOW for e in events)


def test_lost_structured_reason_timestamp_and_note(api):
    lead = create(api)
    assert (
        api.post(f"/api/v1/leads/{lead['id']}/lost", json={"reason": "Too expensive"}).status_code
        == 422
    )
    assert (
        api.post(f"/api/v1/leads/{lead['id']}/lost", json={"note": "No reason"}).status_code == 422
    )
    post(api, lead, "follow-up", {"next_follow_up_at": "2026-09-08T09:00"})
    lost = post(api, lead, "lost", {"reason": "price_too_high", "note": "Budget below quote"})
    assert lost["stage"] == "lost" and lost["lost_reason"] == "price_too_high"
    assert lost["lost_note"] == "Budget below quote" and utc(lost["lost_at"]) == NOW
    assert lost["next_action"] == "no_action" and lost["next_follow_up_at"] is None
    assert api.get("/api/v1/leads", params={"attention": "needs_follow_up"}).json()["total"] == 0


def test_quotes_decimal_exclusive_and_do_not_set_task_price(api, db):
    lead = create(
        api,
        lead_cost="27.35",
        source_url="https://example.com/leads/1",
        city="Naperville",
        zip_code="60564",
    )
    first = post(
        api,
        lead,
        "quote",
        {"quote_type": "fixed", "quoted_fixed_price": "450.25", "materials_included": True},
    )
    assert first["quoted_fixed_price"] == "450.25" and first["quoted_min"] is None
    assert utc(first["quote_sent_at"]) == NOW
    record = db.get(Lead, uuid.UUID(lead["id"]))
    assert record.lead_cost == Decimal("27.35") and isinstance(record.quoted_fixed_price, Decimal)
    second = post(
        api,
        lead,
        "quote",
        {
            "quote_type": "range",
            "quoted_min": "450.25",
            "quoted_max": "650.50",
            "materials_included": False,
        },
    )
    assert second["quoted_fixed_price"] is None and second["quoted_min"] == "450.25"
    assert second["materials_included"] is False
    edited = api.patch(f"/api/v1/leads/{lead['id']}", json={"refund_status": "requested"})
    assert edited.status_code == 200 and edited.json()["refund_status"] == "requested"
    booked = post(
        api,
        lead,
        "book",
        {
            **BOOKING,
            "title": "Agreed drywall job",
            "street_address": "1 Main St",
            "city": "Naperville",
            "zip": "60564",
            "scheduled_date": "2026-09-08",
            "time_window_start": "09:00",
            "time_window_end": "11:00",
        },
    )
    task = db.get(Task, uuid.UUID(booked["converted_task_id"]))
    customer = db.get(Customer, task.customer_id)
    assert task.labor_price == Decimal("0.00") and task.street_address == "1 Main St"
    assert task.time_window_start.isoformat() == "09:00:00"
    assert customer.phone == "" and customer.full_name == MINIMAL["name"]
    assert booked["source_lead_id"] == "TT-123" and booked["source"] == "thumbtack"
    history = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert len([e for e in history if e["event_type"] == "quote_recorded"]) == 2
    assert (
        api.post(
            f"/api/v1/leads/{lead['id']}/quote",
            json={"quote_type": "fixed", "quoted_fixed_price": "1"},
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"quote_type": "fixed"},
        {"quote_type": "fixed", "quoted_fixed_price": "-1"},
        {"quote_type": "fixed", "quoted_fixed_price": "1.001"},
        {"quote_type": "fixed", "quoted_fixed_price": "NaN"},
        {"quote_type": "fixed", "quoted_fixed_price": "100", "quoted_min": "50"},
        {"quote_type": "range", "quoted_min": "200", "quoted_max": "100"},
        {"quote_type": "range", "quoted_min": "-1", "quoted_max": "100"},
        {
            "quote_type": "range",
            "quoted_min": "10",
            "quoted_max": "100",
            "quoted_fixed_price": "40",
        },
        {"quote_type": "range", "quoted_min": "10"},
    ],
)
def test_invalid_quotes(api, payload):
    lead = create(api)
    assert api.post(f"/api/v1/leads/{lead['id']}/quote", json=payload).status_code == 422


def test_repeat_customer_can_have_multiple_leads(api, db):
    customer = Customer(full_name="Repeat customer")
    db.add(customer)
    db.commit()
    task_ids = []
    for n in range(2):
        lead = create(api, source_lead_id=f"TT-{n}")
        booked = post(
            api, lead, "book", {**BOOKING, "title": f"Job {n}", "customer_id": str(customer.id)}
        )
        task_ids.append(booked["converted_task_id"])
        assert booked["converted_customer_id"] == str(customer.id)
    assert len(set(task_ids)) == 2 and len(db.scalars(select(Customer)).all()) == 1
    assert api.get("/api/v1/leads", params={"customer_id": str(customer.id)}).json()["total"] == 2


def test_patch_reference_and_money_validation(api):
    lead = create(api)
    path = f"/api/v1/leads/{lead['id']}"
    assert api.patch(path, json={"source_lead_id": None}).status_code == 200
    result = api.patch(
        path,
        json={
            "source_lead_id": None,
            "phone": "555",
            "lead_cost": "0.01",
            "refund_status": "approved",
        },
    )
    assert result.status_code == 200 and result.json()["lead_cost"] == "0.01"
    assert api.patch(path, json={"lead_cost": "-1"}).status_code == 422
    assert api.patch(path, json={"refund_status": "fake"}).status_code == 422


def test_stale_with_future_followup_waits_until_business_due_day(api, db, monkeypatch):
    lead = create(api)
    post(api, lead, "contact", {"outcome": "answered"})
    post(api, lead, "follow-up", {"next_follow_up_at": "2026-09-10T09:00"})
    row = db.get(Lead, uuid.UUID(lead["id"]))
    row.last_activity_at = NOW - timedelta(days=3)
    db.commit()
    assert api.get("/api/v1/leads", params={"attention": "needs_follow_up"}).json()["total"] == 0
    assert api.get("/api/v1/operations").json()["needs_follow_up"] == 0
    monkeypatch.setattr(operations, "utcnow", lambda: datetime(2026, 9, 10, 5, tzinfo=UTC))
    assert api.get("/api/v1/leads", params={"attention": "needs_follow_up"}).json()["total"] == 1
    monkeypatch.setattr(operations, "utcnow", lambda: datetime(2026, 9, 10, 15, tzinfo=UTC))
    assert api.get("/api/v1/leads", params={"attention": "needs_follow_up"}).json()["total"] == 1


def test_new_migration_mapping_preserves_legacy_rows_and_activity():
    path = Path(__file__).parents[1] / "alembic/versions/c7e4f9a2b602_novafix_lead_workflow.py"
    tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    upgrade = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
    )
    statements = [
        ast.literal_eval(node.args[0])
        for node in ast.walk(upgrade)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "execute"
    ]
    assert 'down_revision = "b6d3e8f2a901"' in path.read_text(encoding="utf-8-sig")
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE leads (id INTEGER, stage TEXT, notes TEXT, "
                "latest_contact_outcome TEXT, external_reference TEXT, source_lead_id TEXT, "
                "lost_note TEXT, lost_reason TEXT, next_action TEXT)"
            )
        )
        conn.execute(text("CREATE TABLE lead_activities (id INTEGER, note TEXT)"))
        conn.execute(text("INSERT INTO lead_activities VALUES (1, 'original contact event')"))
        for n, stage in enumerate(["new", "attempted", "contacted", "booked", "lost"]):
            conn.execute(
                text(
                    "INSERT INTO leads (id, stage, notes, latest_contact_outcome, "
                    "external_reference, lost_reason) "
                    "VALUES (:n, :stage, :notes, :outcome, :reference, :reason)"
                ),
                {
                    "n": n,
                    "stage": stage,
                    "notes": "Keep",
                    "outcome": "price_shopping" if n == 2 else "no_answer",
                    "reference": "OLD-ID",
                    "reason": "Original free text" if stage == "lost" else None,
                },
            )
        for statement in statements:
            conn.execute(
                text(statement)
            )  # Only data mapping SQL on disposable tables; no Alembic run.
        assert conn.execute(text("SELECT stage FROM leads ORDER BY id")).scalars().all() == [
            "new",
            "contacting",
            "qualified",
            "booked",
            "lost",
        ]
        assert conn.scalar(text("SELECT COUNT(*) FROM leads")) == 5
        assert conn.scalar(text("SELECT note FROM lead_activities")) == "original contact event"
        assert conn.scalar(text("SELECT source_lead_id FROM leads WHERE id=0")) == "OLD-ID"
        assert conn.scalar(text("SELECT latest_contact_outcome FROM leads WHERE id=2")) is None
        assert "price_shopping" in conn.scalar(text("SELECT notes FROM leads WHERE id=2"))
        assert conn.execute(text("SELECT lost_reason, lost_note FROM leads WHERE id=4")).one() == (
            "other",
            "Original free text",
        )
    engine.dispose()


@pytest.mark.parametrize(
    "field",
    [
        "title",
        "street_address",
        "city",
        "state",
        "zip",
        "scheduled_date",
        "time_window_start",
        "time_window_end",
    ],
)
@pytest.mark.parametrize("invalid", ["missing", "null", "blank"])
def test_booking_required_fields_fail_before_any_writes(api, db, field, invalid):
    from app.models import TaskNumberCounter

    lead = create(api, city="Chicago", zip_code="60601", address="Legacy address")
    payload = dict(BOOKING)
    if invalid == "missing":
        payload.pop(field)
    else:
        payload[field] = None if invalid == "null" else "   "
    counter = db.get(TaskNumberCounter, 1).last_value
    result = api.post(f"/api/v1/leads/{lead['id']}/book", json=payload)
    assert result.status_code == 422, result.text
    assert db.scalars(select(Customer)).all() == []
    assert db.scalars(select(Task)).unique().all() == []
    assert db.get(TaskNumberCounter, 1).last_value == counter
    unchanged = api.get(f"/api/v1/leads/{lead['id']}").json()
    assert unchanged["stage"] == "new" and unchanged["booked_at"] is None
    assert len(api.get(f"/api/v1/leads/{lead['id']}/activities").json()) == 2


@pytest.mark.parametrize("end", ["08:00", "09:00", "09:00:00Z"])
def test_booking_rejects_invalid_time_window_without_partial_data(api, db, end):
    lead = create(api)
    result = api.post(f"/api/v1/leads/{lead['id']}/book", json={**BOOKING, "time_window_end": end})
    assert result.status_code == 422
    assert db.scalars(select(Customer)).all() == []
    assert db.scalars(select(Task)).unique().all() == []


@pytest.mark.parametrize("stage", ["new", "contacting", "qualified"])
def test_real_booking_from_any_open_stage_without_handyman(api, db, stage):
    lead = create(api)
    if stage == "contacting":
        post(api, lead, "contact", {"outcome": "answered"})
    elif stage == "qualified":
        post(api, lead, "qualify", {})
    booked = post(api, lead, "book", BOOKING)
    again = post(api, lead, "book", BOOKING)
    assert again["converted_task_id"] == booked["converted_task_id"]
    task = db.get(Task, uuid.UUID(booked["converted_task_id"]))
    assert task.handyman_id is None
    for field in ["street_address", "city", "state", "zip"]:
        assert getattr(task, field) == BOOKING[field]
    assert task.scheduled_date.isoformat() == BOOKING["scheduled_date"]
    assert task.time_window_start.isoformat() == "09:00:00"
    assert task.time_window_end.isoformat() == "11:00:00"
    assert len(db.scalars(select(Customer)).all()) == 1
    assert len(db.scalars(select(Task)).unique().all()) == 1
    assert task.labor_price == Decimal("0.00")


@pytest.mark.parametrize(
    "stage,outcome,stale,due,expected",
    [
        ("new", None, False, None, True),
        ("contacting", "no_answer", False, None, True),
        ("qualified", "answered", True, None, True),
        ("contacting", "answered", False, "2026-09-05T18:00:00+00:00", True),
        ("qualified", "answered", True, "2026-09-06T03:00:00+00:00", True),
        ("qualified", "answered", True, "2026-09-06T14:00:00+00:00", False),
        ("booked", "no_answer", True, None, False),
        ("lost", "no_answer", True, None, False),
    ],
)
def test_attention_acceptance_at_utc_midnight(api, db, stage, outcome, stale, due, expected):
    lead = create(api)
    row = db.get(Lead, uuid.UUID(lead["id"]))
    row.stage = stage
    row.latest_contact_outcome = outcome
    row.first_contacted_at = None if stage == "new" else NOW
    row.last_activity_at = NOW - timedelta(days=3) if stale else NOW
    row.next_follow_up_at = datetime.fromisoformat(due) if due else None
    db.commit()
    result = api.get("/api/v1/leads", params={"attention": "needs_follow_up"}).json()
    assert result["total"] == int(expected)
    assert api.get("/api/v1/operations").json()["needs_follow_up"] == int(expected)


@pytest.mark.parametrize(
    "reference", [{}, {"source_lead_id": "TT-100"}, {"source_url": "https://example.com/lead"}]
)
def test_capture_details_and_automatic_owner(api, users, reference):
    response = api.post(
        "/api/v1/leads",
        json={
            **MINIMAL,
            **reference,
            "state": "il",
            "property_type": "apartment_condo",
            "lead_cost": "22.99",
        },
    )
    assert response.status_code == 201, response.text
    lead = response.json()
    assert lead["phone"] is None
    for field in ["city", "zip_code", "job_summary"]:
        assert lead[field] == MINIMAL[field]
    assert lead["state"] == "IL" and lead["property_type"] == "apartment_condo"
    assert lead["lead_cost"] == "22.99"
    assert utc(lead["received_at"]) == utc(lead["assigned_at"]) == NOW
    assert lead["assigned_dispatcher_id"] == str(users["dispatcher"].id)
    assert lead["assigned_dispatcher_name"] == users["dispatcher"].full_name
    history = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert [e["event_type"] for e in history] == ["received", "assigned"]
    assert history[1]["user_id"] == str(users["dispatcher"].id)
    assert users["dispatcher"].full_name in history[1]["note"]


@pytest.mark.parametrize("field", ["city", "state", "zip_code", "job_summary"])
def test_new_capture_required_fields(api, field):
    for invalid in [None, "", "   "]:
        assert api.post("/api/v1/leads", json={**MINIMAL, field: invalid}).status_code == 422
    assert (
        api.post("/api/v1/leads", json={k: v for k, v in MINIMAL.items() if k != field}).status_code
        == 422
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("assigned_at", "2000-01-01T00:00:00Z"),
        ("assigned_dispatcher_id", str(uuid.uuid4())),
        ("received_at", "2000-01-01T00:00:00Z"),
        ("property_type", "castle"),
    ],
)
def test_capture_rejects_invented_assignment_and_property(api, field, value):
    assert api.post("/api/v1/leads", json={**MINIMAL, field: value}).status_code == 422


@pytest.mark.parametrize(
    "role,password", [("admin", "admin-password"), ("dispatcher", "worker-password")]
)
def test_reassignment_audits_actor_and_exact_time(api, users, monkeypatch, role, password):
    lead = create(api)
    login(api, users[role].email, password)
    later = NOW + timedelta(hours=1)
    monkeypatch.setattr(operations, "utcnow", lambda: later)
    before = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assigned = post(api, lead, "assign", {"assigned_dispatcher_id": str(users["admin"].id)})
    assert assigned["assigned_dispatcher_name"] == users["admin"].full_name
    assert utc(assigned["assigned_at"]) == later
    events = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert events[:-1] == before
    assert events[-1]["user_id"] == str(users[role].id)
    assert events[-1]["event_type"] == "reassigned"
    assert users["dispatcher"].full_name in events[-1]["note"]
    assert users["admin"].full_name in events[-1]["note"]
    monkeypatch.setattr(operations, "utcnow", lambda: later + timedelta(days=1))
    same = post(api, lead, "assign", {"assigned_dispatcher_id": str(users["admin"].id)})
    assert same["assigned_at"] == assigned["assigned_at"]
    assert api.get(f"/api/v1/leads/{lead['id']}/activities").json() == events


def test_dispatcher_options_and_invalid_assignment(api, db, users):
    from app.models import User, UserRole

    inactive = User(
        email="inactive@example.com",
        full_name="Inactive",
        password_hash="unused",
        role=UserRole.dispatcher,
        is_active=False,
    )
    db.add(inactive)
    db.commit()
    options = api.get("/api/v1/leads/dispatchers")
    assert options.status_code == 200
    assert {row["id"] for row in options.json()} == {str(u.id) for u in users.values()}
    assert all(set(row) == {"id", "full_name"} for row in options.json())
    lead = create(api)
    for target in [inactive.id, uuid.uuid4()]:
        result = api.post(
            f"/api/v1/leads/{lead['id']}/assign", json={"assigned_dispatcher_id": str(target)}
        )
        assert result.status_code == 422
    assert api.get(f"/api/v1/leads/{lead['id']}").json()["assigned_at"] == lead["assigned_at"]
    assert len(api.get(f"/api/v1/leads/{lead['id']}/activities").json()) == 2


@pytest.mark.parametrize(
    "cost,after,roas", [(None, None, None), ("0.00", "575.00", None), ("25.00", "550.00", "23.00")]
)
def test_economics_uses_live_task_customer_total(api, db, cost, after, roas):
    lead = create(api, lead_cost=cost)
    assert create(api)["economics"]["job_value"] is None
    booked = post(api, lead, "book", BOOKING)
    task = db.get(Task, uuid.UUID(booked["converted_task_id"]))
    task.labor_price = Decimal("500.00")
    task.materials_cost = Decimal("75.00")
    task.price = Decimal("9999.00")  # Obsolete price and quote must not become financial truth.
    db.commit()
    data = api.get(f"/api/v1/leads/{lead['id']}").json()["economics"]
    assert data == {
        "job_value": "575.00",
        "revenue_after_lead_cost": after,
        "roas": roas,
        "lost_result": None,
    }
    task.labor_price = Decimal("600.00")
    db.commit()
    assert api.get(f"/api/v1/leads/{lead['id']}").json()["economics"]["job_value"] == "675.00"


@pytest.mark.parametrize("cost,result", [(None, None), ("22.99", "-22.99"), ("0.00", "0.00")])
def test_lost_economics_without_task(api, cost, result):
    lead = create(api, lead_cost=cost)
    lost = post(api, lead, "lost", {"reason": "no_response"})
    assert lost["economics"]["lost_result"] == result
    assert lost["economics"]["roas"] is None
    assert lost["economics"]["job_value"] is None


def test_legacy_lead_with_missing_new_fields_is_readable(api, db):
    row = Lead(
        name="Legacy", source="phone", notes="", stage="new", received_at=NOW, last_activity_at=NOW
    )
    db.add(row)
    db.commit()
    result = api.get(f"/api/v1/leads/{row.id}")
    assert result.status_code == 200, result.text
    assert result.json()["assigned_dispatcher_id"] is None
    assert result.json()["job_summary"] is None
    updated = api.patch(f"/api/v1/leads/{row.id}", json={"notes": "Still editable"})
    assert updated.status_code == 200


def test_ownership_migration_is_additive_and_keeps_legacy_nulls():
    path = Path(__file__).parents[1] / "alembic/versions/d8f5a0b3c703_lead_details_and_ownership.py"
    source = path.read_text(encoding="utf-8")
    assert 'down_revision = "c7e4f9a2b602"' in source
    tree = ast.parse(source)
    upgrade = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
    )
    calls = [
        node
        for node in ast.walk(upgrade)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "op"
    ]
    assert [c.func.attr for c in calls].count("add_column") == 5
    assert {c.func.attr for c in calls} == {"add_column", "create_foreign_key", "create_index"}
    assert all(ast.literal_eval(c.args[0]) == "leads" for c in calls if c.func.attr == "add_column")
    assert 'ondelete="SET NULL"' in source


def test_deleted_owner_keeps_assignment_history(api, db, users):
    db.connection().exec_driver_sql("PRAGMA foreign_keys=ON")
    lead = create(api)
    history = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    login(api, users["admin"].email, "admin-password")
    owner_name = users["dispatcher"].full_name
    db.delete(users["dispatcher"])
    db.commit()
    db.expire_all()
    result = api.get(f"/api/v1/leads/{lead['id']}")
    assert result.status_code == 200, result.text
    assert result.json()["assigned_dispatcher_id"] is None
    after = api.get(f"/api/v1/leads/{lead['id']}/activities").json()
    assert after[1]["note"] == history[1]["note"]
    assert after[1]["user_name"] == owner_name
    assert after[1]["timestamp"] == history[1]["timestamp"]
