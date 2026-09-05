from collections.abc import Generator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import app.routers.handymen as handyman_routes
import app.routers.payroll as payroll_routes
from app.config import settings
from app.models import (
    Customer,
    Handyman,
    MaterialsPaidBy,
    Task,
    TaskStatus,
    TaskStatusHistory,
    User,
)
from app.services.financials import (
    customer_total,
    labor_earnings,
    materials_reimbursement,
    total_handyman_payout,
)
from app.services.tasks import assign_task
from tests.conftest import login


@pytest.fixture
def payroll_tables(db: Session) -> Generator[None, None, None]:
    for table in (
        Customer.__table__,
        Handyman.__table__,
        Task.__table__,
        TaskStatusHistory.__table__,
    ):
        table.create(db.get_bind(), checkfirst=True)
    yield


@pytest.fixture(autouse=True)
def payroll_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "BUSINESS_TIMEZONE", "America/Chicago")


def add_customer(db: Session) -> Customer:
    customer = Customer(full_name="Payroll Customer")
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def add_handyman(
    db: Session,
    name: str,
    payout_percent: Decimal = Decimal("60.00"),
) -> Handyman:
    handyman = Handyman(
        full_name=name,
        default_payout_percent=payout_percent,
    )
    db.add(handyman)
    db.commit()
    db.refresh(handyman)
    return handyman


def add_task(
    db: Session,
    customer: Customer,
    handyman: Handyman | None,
    task_number: str,
    *,
    status: TaskStatus = TaskStatus.new,
    completed_at: datetime | None = None,
    scheduled_date: date | None = None,
    labor_price: Decimal = Decimal("0.00"),
    materials_cost: Decimal = Decimal("0.00"),
    materials_paid_by: MaterialsPaidBy = MaterialsPaidBy.company,
    payout_percent: Decimal | None = None,
) -> Task:
    task = Task(
        task_number=task_number,
        customer_id=customer.id,
        handyman_id=handyman.id if handyman else None,
        title=f"Task {task_number}",
        status=status,
        completed_at=completed_at,
        scheduled_date=scheduled_date,
        labor_price=labor_price,
        materials_cost=materials_cost,
        materials_paid_by=materials_paid_by,
        handyman_payout_percent=payout_percent,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def test_new_handyman_defaults_to_sixty_percent(
    client: TestClient,
    users: dict[str, User],
    payroll_tables: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: None)
    login(client, users["dispatcher"].email, "worker-password")

    response = client.post("/api/v1/handymen", json={"full_name": "Default Worker"})

    assert response.status_code == 201, response.text
    assert Decimal(response.json()["default_payout_percent"]) == Decimal("60.00")


def test_assignment_copies_and_replaces_payout_snapshot(
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    first = add_handyman(db, "First Worker", Decimal("65.00"))
    second = add_handyman(db, "Second Worker", Decimal("70.00"))
    task = add_task(db, customer, None, "T-SNAPSHOT")

    assign_task(db, task, first.id, users["admin"])
    assert task.handyman_payout_percent == Decimal("65.00")

    first.default_payout_percent = Decimal("75.00")
    db.commit()
    db.refresh(task)
    assert task.handyman_payout_percent == Decimal("65.00")

    assign_task(db, task, second.id, users["admin"])
    assert task.handyman_payout_percent == Decimal("70.00")

    assign_task(db, task, None, users["admin"])
    assert task.handyman_payout_percent is None


def test_legacy_price_remains_separate_from_new_labor_price(
    db: Session,
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    task = Task(
        task_number="T-LEGACY-PRICE",
        customer_id=customer.id,
        title="Legacy price task",
        price=Decimal("486.42"),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    assert task.price == Decimal("486.42")
    assert task.labor_price == Decimal("0.00")


def test_financial_migration_does_not_rename_or_backfill_legacy_values() -> None:
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "a9f6c2d1e4b7_add_task_financials_and_payouts.py"
    ).read_text(encoding="utf-8")

    assert '"labor_price"' in migration
    assert "new_column_name" not in migration
    assert "UPDATE tasks" not in migration
    assert "SET handyman_payout_percent" not in migration


def test_financial_calculations_exclude_materials_from_percentage() -> None:
    labor = Decimal("400.00")
    materials = Decimal("100.00")
    percent = Decimal("65.00")

    assert customer_total(labor, materials) == Decimal("500.00")
    assert labor_earnings(labor, percent) == Decimal("260.00")
    assert materials_reimbursement(materials, MaterialsPaidBy.handyman) == Decimal(
        "100.00"
    )
    assert materials_reimbursement(materials, MaterialsPaidBy.company) == Decimal(
        "0.00"
    )
    assert materials_reimbursement(materials, MaterialsPaidBy.customer) == Decimal(
        "0.00"
    )
    assert total_handyman_payout(
        labor,
        materials,
        MaterialsPaidBy.handyman,
        percent,
    ) == Decimal("360.00")


def test_payroll_uses_completed_at_week_and_completed_status_only(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Weekly Worker", Decimal("65.00"))
    add_handyman(db, "No Completed Work")

    add_task(
        db,
        customer,
        handyman,
        "T-IN-WEEK-HANDYMAN-MATERIALS",
        status=TaskStatus.done,
        scheduled_date=date(2026, 8, 30),
        completed_at=datetime(2026, 9, 2, 14, 0, tzinfo=UTC),
        labor_price=Decimal("400.00"),
        materials_cost=Decimal("100.00"),
        materials_paid_by=MaterialsPaidBy.handyman,
        payout_percent=Decimal("65.00"),
    )
    add_task(
        db,
        customer,
        handyman,
        "T-IN-WEEK-COMPANY-MATERIALS",
        status=TaskStatus.done,
        completed_at=datetime(2026, 9, 3, 10, 0, tzinfo=UTC),
        labor_price=Decimal("200.00"),
        materials_cost=Decimal("50.00"),
        materials_paid_by=MaterialsPaidBy.company,
        payout_percent=Decimal("65.00"),
    )
    add_task(
        db,
        customer,
        handyman,
        "T-NOT-COMPLETED",
        status=TaskStatus.in_progress,
        completed_at=datetime(2026, 9, 4, 10, 0, tzinfo=UTC),
        labor_price=Decimal("999.00"),
        payout_percent=Decimal("65.00"),
    )
    add_task(
        db,
        customer,
        handyman,
        "T-OUTSIDE-WEEK",
        status=TaskStatus.done,
        completed_at=datetime(2026, 8, 30, 23, 59, tzinfo=UTC),
        labor_price=Decimal("999.00"),
        payout_percent=Decimal("65.00"),
    )

    login(client, users["admin"].email, "admin-password")
    response = client.get("/api/v1/payroll", params={"week_start": "2026-08-31"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["week_start"] == "2026-08-31"
    assert payload["week_end"] == "2026-09-06"
    assert len(payload["handymen"]) == 2

    weekly = next(
        item for item in payload["handymen"] if item["handyman_name"] == "Weekly Worker"
    )
    assert weekly["completed_jobs"] == 2
    assert Decimal(weekly["labor_revenue"]) == Decimal("600.00")
    assert Decimal(weekly["labor_earnings"]) == Decimal("390.00")
    assert Decimal(weekly["materials_reimbursement"]) == Decimal("100.00")
    assert Decimal(weekly["total_payout"]) == Decimal("490.00")
    assert {row["task_number"] for row in weekly["tasks"]} == {
        "T-IN-WEEK-HANDYMAN-MATERIALS",
        "T-IN-WEEK-COMPANY-MATERIALS",
    }


def test_legacy_assignment_stays_unresolved_until_admin_sets_payout(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Legacy Worker", Decimal("60.00"))
    task = add_task(
        db,
        customer,
        handyman,
        "T-LEGACY-UNRESOLVED",
        status=TaskStatus.done,
        completed_at=datetime(2026, 9, 2, 10, 0, tzinfo=UTC),
        labor_price=Decimal("400.00"),
        materials_cost=Decimal("100.00"),
        materials_paid_by=MaterialsPaidBy.handyman,
        payout_percent=None,
    )
    calculated = add_task(
        db,
        customer,
        handyman,
        "T-CALCULATED",
        status=TaskStatus.done,
        completed_at=datetime(2026, 9, 3, 10, 0, tzinfo=UTC),
        labor_price=Decimal("200.00"),
        materials_cost=Decimal("50.00"),
        materials_paid_by=MaterialsPaidBy.handyman,
        payout_percent=Decimal("60.00"),
    )

    login(client, users["dispatcher"].email, "worker-password")
    unrelated_edit = client.patch(
        f"/api/v1/tasks/{task.id}",
        json={"internal_notes": "Reviewed without changing assignment"},
    )
    assert unrelated_edit.status_code == 200, unrelated_edit.text
    assert unrelated_edit.json()["handyman_payout_percent"] is None
    db.refresh(task)
    assert task.handyman_payout_percent is None

    login(client, users["admin"].email, "admin-password")
    unresolved_response = client.get(
        "/api/v1/payroll", params={"week_start": "2026-08-31"}
    )
    assert unresolved_response.status_code == 200, unresolved_response.text
    weekly = next(
        item
        for item in unresolved_response.json()["handymen"]
        if item["handyman_id"] == str(handyman.id)
    )
    assert weekly["completed_jobs"] == 2
    assert weekly["calculated_jobs"] == 1
    assert weekly["payout_not_set"] == 1
    assert Decimal(weekly["labor_revenue"]) == Decimal("200.00")
    assert Decimal(weekly["labor_earnings"]) == Decimal("120.00")
    assert Decimal(weekly["materials_reimbursement"]) == Decimal("50.00")
    assert Decimal(weekly["total_payout"]) == Decimal("170.00")
    unresolved = next(
        row for row in weekly["tasks"] if row["task_number"] == task.task_number
    )
    assert unresolved["payout_percent"] is None
    assert unresolved["labor_earnings"] is None
    assert unresolved["materials_reimbursement"] is None
    assert unresolved["total_payout"] is None

    set_payout = client.patch(
        f"/api/v1/tasks/{task.id}",
        json={"handyman_payout_percent": "65.00"},
    )
    assert set_payout.status_code == 200, set_payout.text

    resolved_response = client.get(
        "/api/v1/payroll", params={"week_start": "2026-08-31"}
    )
    resolved_weekly = next(
        item
        for item in resolved_response.json()["handymen"]
        if item["handyman_id"] == str(handyman.id)
    )
    assert resolved_weekly["completed_jobs"] == 2
    assert resolved_weekly["calculated_jobs"] == 2
    assert resolved_weekly["payout_not_set"] == 0
    assert Decimal(resolved_weekly["labor_revenue"]) == Decimal("600.00")
    assert Decimal(resolved_weekly["labor_earnings"]) == Decimal("380.00")
    assert Decimal(resolved_weekly["materials_reimbursement"]) == Decimal("150.00")
    assert Decimal(resolved_weekly["total_payout"]) == Decimal("530.00")

    db.refresh(calculated)
    assert calculated.handyman_payout_percent == Decimal("60.00")


def test_explicitly_reassigning_legacy_task_snapshots_current_default(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Explicit Assignment Worker", Decimal("68.00"))
    task = add_task(
        db,
        customer,
        handyman,
        "T-EXPLICIT-ASSIGNMENT",
        payout_percent=None,
    )

    login(client, users["dispatcher"].email, "worker-password")
    response = client.post(
        f"/api/v1/tasks/{task.id}/assign",
        json={"handyman_id": str(handyman.id)},
    )

    assert response.status_code == 200, response.text
    assert Decimal(response.json()["handyman_payout_percent"]) == Decimal("68.00")


def test_payroll_and_payout_permissions_are_enforced(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Permission Worker", Decimal("60.00"))
    task = add_task(
        db,
        customer,
        handyman,
        "T-PERMISSIONS",
        payout_percent=Decimal("60.00"),
    )

    login(client, users["dispatcher"].email, "worker-password")
    assert client.get("/api/v1/payroll").status_code == 403
    allowed_financials = client.patch(
        f"/api/v1/tasks/{task.id}",
        json={
            "labor_price": "400.00",
            "materials_cost": "100.00",
            "materials_paid_by": "handyman",
        },
    )
    assert allowed_financials.status_code == 200, allowed_financials.text
    assert Decimal(allowed_financials.json()["customer_total"]) == Decimal("500.00")
    assert Decimal(allowed_financials.json()["handyman_payout_percent"]) == Decimal(
        "60.00"
    )
    forbidden = client.patch(
        f"/api/v1/tasks/{task.id}",
        json={"handyman_payout_percent": "72.00"},
    )
    assert forbidden.status_code == 403
    forbidden_default = client.patch(
        f"/api/v1/handymen/{handyman.id}",
        json={"default_payout_percent": "72.00"},
    )
    assert forbidden_default.status_code == 403

    login(client, users["admin"].email, "admin-password")
    allowed = client.patch(
        f"/api/v1/tasks/{task.id}",
        json={"handyman_payout_percent": "72.00"},
    )
    assert allowed.status_code == 200, allowed.text
    assert Decimal(allowed.json()["handyman_payout_percent"]) == Decimal("72.00")
    allowed_default = client.patch(
        f"/api/v1/handymen/{handyman.id}",
        json={"default_payout_percent": "75.00"},
    )
    assert allowed_default.status_code == 200, allowed_default.text
    assert Decimal(allowed_default.json()["default_payout_percent"]) == Decimal("75.00")
    db.refresh(task)
    assert task.handyman_payout_percent == Decimal("72.00")


def test_existing_task_defaults_to_zero_financials(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    payroll_tables: None,
) -> None:
    customer = add_customer(db)
    task = add_task(db, customer, None, "T-ZERO-FINANCIALS")
    login(client, users["dispatcher"].email, "worker-password")

    response = client.get(f"/api/v1/tasks/{task.id}")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert Decimal(payload["labor_price"]) == Decimal("0.00")
    assert Decimal(payload["materials_cost"]) == Decimal("0.00")
    assert Decimal(payload["customer_total"]) == Decimal("0.00")


@pytest.mark.parametrize("role,password", [
    ("dispatcher", "worker-password"), ("admin", "admin-password"),
])
@pytest.mark.parametrize("percent", ["75.00", "0.00"])
def test_repeated_assignment_preserves_existing_payout(
    client: TestClient, db: Session, users: dict[str, User], payroll_tables: None,
    role: str, password: str, percent: str,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Worker", Decimal("60.00"))
    task = add_task(
        db, customer, handyman, "T-REPEAT",
        status=TaskStatus.assigned, payout_percent=Decimal(percent),
    )
    login(client, users[role].email, password)
    for _ in range(2):
        response = client.post(
            f"/api/v1/tasks/{task.id}/assign", json={"handyman_id": str(handyman.id)},
        )
        assert response.status_code == 200, response.text
        assert Decimal(response.json()["handyman_payout_percent"]) == Decimal(percent)
    db.refresh(task)
    assert task.handyman_payout_percent == Decimal(percent)


@pytest.mark.parametrize("week,start,end", [
    ("2026-08-31", "2026-08-31T05:00:00+00:00", "2026-09-07T05:00:00+00:00"),
    ("2026-03-02", "2026-03-02T06:00:00+00:00", "2026-03-09T05:00:00+00:00"),
    ("2026-10-26", "2026-10-26T05:00:00+00:00", "2026-11-02T06:00:00+00:00"),
])
def test_payroll_local_week_boundaries_including_dst(
    client: TestClient, db: Session, users: dict[str, User], payroll_tables: None,
    week: str, start: str, end: str,
) -> None:
    customer = add_customer(db)
    handyman = add_handyman(db, "Boundary Worker")
    first = datetime.fromisoformat(start)
    following = datetime.fromisoformat(end)
    for number, completed_at in (
        ("BEFORE", first - timedelta(seconds=1)),
        ("START", first),
        ("SUNDAY", following - timedelta(seconds=1)),
        ("NEXT", following),
    ):
        add_task(
            db, customer, handyman, number, status=TaskStatus.done,
            completed_at=completed_at, labor_price=Decimal("100"),
            payout_percent=Decimal("60"),
        )
    login(client, users["admin"].email, "admin-password")
    response = client.get("/api/v1/payroll", params={"week_start": week})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["timezone"] == "America/Chicago"
    summary = payload["handymen"][0]
    assert summary["completed_jobs"] == 2
    assert Decimal(summary["total_payout"]) == Decimal("120")
    assert {row["task_number"]: row["completed_date"] for row in summary["tasks"]} == {
        "START": week,
        "SUNDAY": (date.fromisoformat(week) + timedelta(days=6)).isoformat(),
    }


def test_default_payroll_week_uses_business_date(
    client: TestClient, users: dict[str, User], payroll_tables: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            # Monday in UTC, still Sunday in Chicago.
            return datetime(2026, 9, 7, 2, tzinfo=UTC).astimezone(tz)

    monkeypatch.setattr(payroll_routes, "datetime", FrozenDateTime)
    login(client, users["admin"].email, "admin-password")
    response = client.get("/api/v1/payroll")
    assert response.status_code == 200, response.text
    assert response.json()["week_start"] == "2026-08-31"
