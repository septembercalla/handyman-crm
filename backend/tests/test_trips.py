"""Synthetic weekly reports: completion dates, DST, isolation and access."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.models import MaterialsPaidBy, TaskStatus
from tests.conftest import login
from tests.test_payroll import (  # noqa: F401
    add_customer,
    add_handyman,
    add_task,
    payroll_tables,
    payroll_timezone,
)

pytestmark = pytest.mark.usefixtures("payroll_tables", "payroll_timezone")


def test_trip_completion_dates_schedule_and_financials(client, db, users):
    customer = add_customer(db)
    worker = add_handyman(db, "Synthetic Worker")
    other = add_handyman(db, "Other Worker")
    add_task(
        db,
        customer,
        worker,
        "COMPLETED",
        status=TaskStatus.done,
        completed_at=datetime(2026, 11, 2, 7, tzinfo=UTC),
        scheduled_date=date(2026, 10, 20),
        labor_price=Decimal("100.01"),
        materials_cost=Decimal("20.00"),
        materials_paid_by=MaterialsPaidBy.handyman,
        payout_percent=Decimal("60"),
    )
    add_task(
        db,
        customer,
        worker,
        "MISSING-PERCENT",
        status=TaskStatus.done,
        completed_at=datetime(2026, 11, 3, 18, tzinfo=UTC),
        labor_price=Decimal("200"),
    )
    add_task(
        db,
        customer,
        worker,
        "PLANNED",
        status=TaskStatus.assigned,
        scheduled_date=date(2026, 11, 4),
        labor_price=Decimal("900"),
        payout_percent=Decimal("60"),
    )
    add_task(
        db,
        customer,
        worker,
        "CANCELLED",
        status=TaskStatus.cancelled,
        scheduled_date=date(2026, 11, 5),
        labor_price=Decimal("500"),
    )
    add_task(db, customer, other, "PRIVATE", scheduled_date=date(2026, 11, 4))
    add_task(
        db,
        customer,
        worker,
        "OUTSIDE",
        status=TaskStatus.done,
        scheduled_date=date(2026, 11, 4),
        completed_at=datetime(2026, 11, 9, 6, tzinfo=UTC),
    )
    login(client, users["admin"].email, "admin-password")
    response = client.get(f"/api/v1/trips/{worker.id}?week_start=2026-11-05")
    assert response.status_code == 200, response.text
    report = response.json()
    assert (report["week_start"], report["week_end"]) == ("2026-11-02", "2026-11-08")
    assert len(report["days"]) == 7
    assert report["completed_jobs"] == 2
    assert report["scheduled_jobs"] == 1
    assert report["payout_not_set"] == 1
    assert Decimal(report["job_value"]) == Decimal("320.01")
    assert Decimal(report["labor_earnings"]) == Decimal("60.01")
    assert Decimal(report["total_payout"]) == Decimal("80.01")
    jobs = [job for day in report["days"] for job in day["jobs"]]
    assert {job["number"] for job in jobs} == {
        "COMPLETED",
        "MISSING-PERCENT",
        "PLANNED",
        "CANCELLED",
    }
    assert report["days"][0]["jobs"][0]["completed_date"] == "2026-11-02"
    assert next(job for job in jobs if job["number"] == "PLANNED")["labor_earnings"] is None


def test_trip_dst_fall_boundary_and_unknown_worker(client, db, users):
    customer = add_customer(db)
    worker = add_handyman(db, "DST Worker")
    for number, stamp in [
        ("BEFORE", datetime(2026, 10, 26, 4, 59, tzinfo=UTC)),
        ("START", datetime(2026, 10, 26, 5, tzinfo=UTC)),
        ("END", datetime(2026, 11, 2, 5, 59, tzinfo=UTC)),
        ("AFTER", datetime(2026, 11, 2, 6, tzinfo=UTC)),
    ]:
        add_task(
            db,
            customer,
            worker,
            number,
            status=TaskStatus.done,
            completed_at=stamp,
            payout_percent=Decimal("60"),
        )
    login(client, users["admin"].email, "admin-password")
    report = client.get(f"/api/v1/trips/{worker.id}?week_start=2026-10-26").json()
    assert {job["number"] for day in report["days"] for job in day["jobs"]} == {"START", "END"}
    assert client.get(f"/api/v1/trips/{uuid.uuid4()}").status_code == 404


def test_trip_requires_admin(client, users):
    assert client.get(f"/api/v1/trips/{uuid.uuid4()}").status_code == 401
    login(client, users["dispatcher"].email, "worker-password")
    assert client.get(f"/api/v1/trips/{uuid.uuid4()}").status_code == 403
