import ast
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models import Base, Customer, Task, TaskNumberCounter, TaskStatus
from app.services import operations
from app.services.tasks import next_task_number
from tests.conftest import login
from tests.test_operations import BOOKING, create


@pytest.fixture
def dispatcher(client, db, users, monkeypatch):
    Base.metadata.create_all(db.get_bind())
    monkeypatch.setattr(operations.settings, "BUSINESS_TIMEZONE", "America/Chicago")
    monkeypatch.setattr("app.routers.leads.refresh_coordinates", lambda task: None)
    monkeypatch.setattr("app.routers.tasks.refresh_coordinates", lambda task: None)
    login(client, users["dispatcher"].email, "worker-password")
    return client


def test_partial_lead_patch_preserves_omitted_fields(dispatcher):
    lead = create(dispatcher)
    path = f"/api/v1/leads/{lead['id']}"
    updated = dispatcher.patch(path, json={"notes": "Second note"})
    assert updated.status_code == 200, updated.text
    for field in ("phone", "email", "address", "source", "name"):
        assert updated.json()[field] == lead[field]
    assert updated.json()["notes"] == "Second note"
    cleared = dispatcher.patch(path, json={"email": None})
    assert cleared.status_code == 200 and cleared.json()["email"] is None
    assert cleared.json()["phone"] == lead["phone"]
    before = dispatcher.get(f"{path}/activities").json()
    assert dispatcher.patch(path, json={}).status_code == 200
    assert dispatcher.patch(path, json={"notes": "Second note"}).status_code == 200
    assert dispatcher.get(f"{path}/activities").json() == before


@pytest.mark.parametrize("field", ["source", "name", "notes"])
def test_patch_rejects_explicit_null_for_nonnullable_columns(dispatcher, field):
    lead = create(dispatcher)
    assert dispatcher.patch(f"/api/v1/leads/{lead['id']}", json={field: None}).status_code == 422


def test_both_creation_flows_share_counter_and_preserve_custom_numbers(dispatcher, db):
    customer = Customer(full_name="Existing")
    db.add(customer)
    db.commit()
    payload = {"title": "Ordinary task", "customer_id": str(customer.id)}
    first = dispatcher.post("/api/v1/tasks", json=payload)
    assert first.status_code == 201, first.text
    assert first.json()["task_number"] == "T-1001"
    lead = create(dispatcher)
    booked = dispatcher.post(
        f"/api/v1/leads/{lead['id']}/book", json={**BOOKING, "title": "Lead task"}
    )
    assert booked.status_code == 200, booked.text
    task = dispatcher.get(f"/api/v1/tasks/{booked.json()['converted_task_id']}").json()
    assert task["task_number"] == "T-1002"
    custom = dispatcher.post("/api/v1/tasks", json={**payload, "task_number": "T-2000"})
    assert custom.status_code == 201, custom.text
    assert dispatcher.post("/api/v1/tasks", json=payload).json()["task_number"] == "T-2001"


def test_parallel_allocations_and_task_inserts_are_unique(tmp_path):
    # Separate connections + simultaneous transactions exercise UPDATE RETURNING locks.
    # SQLite is the repository test backend; PostgreSQL itself is not provisioned here.
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'concurrency.db'}", connect_args={"timeout": 30}
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        customer = Customer(full_name="Concurrent")
        db.add_all([customer, TaskNumberCounter(id=1, last_value=1050)])
        db.flush()
        customer_id = customer.id
        db.add(Task(task_number="T-1050", title="Legacy", customer_id=customer_id))
        db.commit()
    barrier = Barrier(8)

    def create_one(_):
        with Session(engine) as db:
            barrier.wait(timeout=20)
            number = next_task_number(db)
            db.add(Task(task_number=number, title="Concurrent", customer_id=customer_id))
            db.commit()
            return number

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            numbers = list(pool.map(create_one, range(8)))
        assert set(numbers) == {f"T-{n}" for n in range(1051, 1059)}
        with Session(engine) as db:
            assert len(db.scalars(select(Task)).unique().all()) == 9
            assert db.get(TaskNumberCounter, 1).last_value == 1058
    finally:
        engine.dispose()


def test_number_and_partial_task_creation_rollback_together(dispatcher, db):
    import uuid

    lead = create(dispatcher)
    counter_before = db.get(TaskNumberCounter, 1).last_value
    # Failure occurs after customer/task flush, before the final commit.
    response = dispatcher.post(
        f"/api/v1/leads/{lead['id']}/book",
        json={**BOOKING, "title": "Fail", "handyman_id": str(uuid.uuid4())},
    )
    assert response.status_code == 404
    # Test dependency shares a Session; production get_db closes it on request exit.
    db.rollback()
    assert db.get(TaskNumberCounter, 1).last_value == counter_before
    assert db.scalars(select(Task)).unique().all() == []
    assert db.scalars(select(Customer)).all() == []
    unchanged = dispatcher.get(f"/api/v1/leads/{lead['id']}").json()
    assert unchanged["converted_task_id"] is None and unchanged["booked_at"] is None
    assert len(dispatcher.get(f"/api/v1/leads/{lead['id']}/activities").json()) == 2


def test_home_uses_chicago_day_at_utc_midnight(dispatcher, db, monkeypatch):
    monkeypatch.setattr(operations, "utcnow", lambda: datetime(2026, 9, 6, 0, 30, tzinfo=UTC))
    customer = Customer(full_name="Timezone")
    db.add(customer)
    db.flush()
    for number, completed in enumerate(
        [
            datetime(2026, 9, 5, 4, 59, tzinfo=UTC),  # Previous Chicago day
            datetime(2026, 9, 5, 5, 0, tzinfo=UTC),  # Start, included
            datetime(2026, 9, 6, 0, 15, tzinfo=UTC),  # Still September 5 Chicago
            datetime(2026, 9, 6, 5, 0, tzinfo=UTC),  # Next day, excluded
        ]
    ):
        db.add(
            Task(
                task_number=f"T-DAY-{number}",
                title="Boundary",
                customer_id=customer.id,
                status=TaskStatus.done,
                completed_at=completed,
                scheduled_date=completed.astimezone(operations.ZoneInfo("America/Chicago")).date(),
            )
        )
    db.commit()
    response = dispatcher.get("/api/v1/dashboard/stats")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["business_date"] == "2026-09-05"
    assert data["timezone"] == "America/Chicago"
    assert data["done_today"] == 2
    assert {task["task_number"] for task in data["today"]} == {"T-DAY-1", "T-DAY-2"}


def test_legacy_review_backfill_semantics_without_running_migration():
    path = (
        Path(__file__).parents[1] / "alembic/versions/b6d3e8f2a901_add_leads_and_review_tracking.py"
    )
    tree = ast.parse(path.read_text(encoding="utf-8"))
    upgrade = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
    )
    sql = [
        ast.literal_eval(node.args[0])
        for node in ast.walk(upgrade)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "execute"
    ]
    backfill = next(statement for statement in sql if statement.startswith("UPDATE tasks"))
    assert backfill == "UPDATE tasks SET review_status = 'skipped' WHERE status = 'done'"
    assert any(
        "INSERT INTO task_number_counter" in statement and "MAX(" in statement for statement in sql
    )
    engine = create_engine("sqlite+pysqlite://")
    # Execute only the extracted backfill on a disposable minimal table, not Alembic.
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT, "
                "completed_at TEXT, review_status TEXT DEFAULT 'not_requested')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO tasks (id, status, completed_at) VALUES "
                "(1, 'done', '2026-09-01T12:34:56Z'), (2, 'new', NULL)"
            )
        )
        conn.execute(text(backfill))
        conn.execute(text("INSERT INTO tasks (id, status) VALUES (3, 'new')"))
        assert conn.execute(text("SELECT id, review_status FROM tasks ORDER BY id")).all() == [
            (1, "skipped"),
            (2, "not_requested"),
            (3, "not_requested"),
        ]
        assert (
            conn.scalar(text("SELECT completed_at FROM tasks WHERE id=1")) == "2026-09-01T12:34:56Z"
        )
    engine.dispose()
