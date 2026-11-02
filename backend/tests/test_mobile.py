"""Synthetic in-memory tests; no deployed database, real data or HTTP service."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.main import app
from app.models import Customer, Handyman, Task, TaskStatus, TaskStatusHistory, User, UserRole
from app.models.mobile_session import MobileSession


@pytest.fixture
def mobile_data(db, users, monkeypatch):
    from app.routers import tasks

    monkeypatch.setattr(tasks, "refresh_coordinates", lambda task: None)
    for table in [
        Customer.__table__,
        Handyman.__table__,
        Task.__table__,
        TaskStatusHistory.__table__,
        MobileSession.__table__,
    ]:
        table.create(db.get_bind(), checkfirst=True)
    customer = Customer(full_name="SYNTHETIC CUSTOMER", phone="3125550100")
    handyman = Handyman(full_name="Synthetic Technician", phone="3125550101")
    other = Handyman(full_name="Other Synthetic Technician")
    db.add_all([customer, handyman, other])
    db.flush()
    tech = User(
        full_name=handyman.full_name,
        email="tech@example.com",
        password_hash=hash_password("synthetic-password"),
        role=UserRole.technician,
        handyman_id=handyman.id,
        is_active=True,
    )
    second = User(
        full_name=other.full_name,
        email="other@example.com",
        password_hash=hash_password("synthetic-password"),
        role=UserRole.technician,
        handyman_id=other.id,
        is_active=True,
    )
    db.add_all([tech, second])
    db.commit()
    return {
        "customer": customer,
        "handyman": handyman,
        "other": other,
        "tech": tech,
        "second": second,
        **users,
    }


def session(client, email, password):
    response = client.post("/api/v1/mobile/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def headers(tokens):
    return {"Authorization": "Bearer " + tokens["access_token"]}


def task_fixture(client, data):
    dispatcher = session(client, "worker@example.com", "worker-password")
    response = client.post(
        "/api/v1/mobile/tasks",
        headers=headers(dispatcher),
        json={
            "customer_id": str(data["customer"].id),
            "title": "SYNTHETIC MOBILE TEST",
            "labor_price": "0.00",
            "materials_cost": "0.00",
            "scheduled_date": "2026-11-02",
        },
    )
    assert response.status_code == 201, response.text
    return dispatcher, response.json()


def test_dispatcher_to_second_device_to_web(client, db, mobile_data):
    dispatch, task = task_fixture(client, mobile_data)
    response = client.post(
        f"/api/v1/mobile/tasks/{task['id']}/assign",
        headers=headers(dispatch),
        json={
            "handyman_id": str(mobile_data["handyman"].id),
            "expected_revision": task["revision"],
        },
    )
    assert response.status_code == 200, response.text
    assigned = response.json()
    assert assigned["status"] == "assigned"
    assert assigned["revision"] > task["revision"]
    with TestClient(app) as phone:
        tech = session(phone, "tech@example.com", "synthetic-password")
        listing = phone.get("/api/v1/mobile/tasks", headers=headers(tech)).json()
        assert listing["total"] == 1
        assert listing["items"][0]["id"] == task["id"]
        assert "internal_notes" not in listing["items"][0]
        assert "handyman" not in listing["items"][0]
        updated = phone.post(
            f"/api/v1/mobile/tasks/{task['id']}/status",
            headers=headers(tech),
            json={"status": "in_progress", "expected_revision": assigned["revision"]},
        )
        assert updated.status_code == 200, updated.text
        stale = phone.post(
            f"/api/v1/mobile/tasks/{task['id']}/status",
            headers=headers(tech),
            json={"status": "done", "expected_revision": assigned["revision"]},
        )
        assert stale.status_code == 409
    web_login = client.post(
        "/api/v1/auth/login", json={"email": "worker@example.com", "password": "worker-password"}
    )
    assert web_login.status_code == 200
    web = client.get(f"/api/v1/tasks/{task['id']}")
    assert web.status_code == 200, web.text
    assert web.json()["status"] == "in_progress"
    events = db.scalars(
        select(TaskStatusHistory).where(TaskStatusHistory.task_id == uuid.UUID(task["id"]))
    ).all()
    assert len(events) == 3
    assert events[-1].changed_by == mobile_data["tech"].id


def test_cross_technician_and_office_route_boundaries(client, mobile_data):
    dispatch, task = task_fixture(client, mobile_data)
    client.post(
        f"/api/v1/mobile/tasks/{task['id']}/assign",
        headers=headers(dispatch),
        json={
            "handyman_id": str(mobile_data["handyman"].id),
            "expected_revision": task["revision"],
        },
    )
    other = session(client, "other@example.com", "synthetic-password")
    assert client.get("/api/v1/mobile/tasks", headers=headers(other)).json()["total"] == 0
    for path in [
        f"/api/v1/mobile/tasks/{task['id']}",
        f"/api/v1/mobile/tasks/{task['id']}/history",
    ]:
        assert client.get(path, headers=headers(other)).status_code == 404
    for path in [
        "/api/v1/tasks",
        "/api/v1/customers",
        "/api/v1/users",
        "/api/v1/payroll",
        "/api/v1/handymen",
        "/api/v1/leads",
        "/api/v1/mobile/team",
    ]:
        assert client.get(path, headers=headers(other)).status_code in {401, 403}
    assert (
        client.post(
            "/api/v1/mobile/tasks",
            headers=headers(other),
            json={"title": "Forbidden", "customer_id": str(mobile_data["customer"].id)},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "tech@example.com", "password": "synthetic-password"},
        ).status_code
        == 403
    )


def test_refresh_rotation_logout_and_disabled_user(client, db, mobile_data):
    original = session(client, "tech@example.com", "synthetic-password")
    rotated = client.post(
        "/api/v1/mobile/auth/refresh", json={"refresh_token": original["refresh_token"]}
    )
    assert rotated.status_code == 200
    assert (
        client.post(
            "/api/v1/mobile/auth/refresh", json={"refresh_token": original["refresh_token"]}
        ).status_code
        == 401
    )
    token = rotated.json()
    assert client.post("/api/v1/mobile/auth/logout", headers=headers(token)).status_code == 204
    assert client.get("/api/v1/mobile/me", headers=headers(token)).status_code == 401
    assert (
        client.post(
            "/api/v1/mobile/auth/refresh", json={"refresh_token": token["refresh_token"]}
        ).status_code
        == 401
    )
    fresh = session(client, "tech@example.com", "synthetic-password")
    mobile_data["tech"].is_active = False
    db.commit()
    assert client.get("/api/v1/mobile/me", headers=headers(fresh)).status_code == 401


def test_provisioning_is_admin_only_and_keeps_office_user_list(client, db, mobile_data):
    new_handyman = Handyman(full_name="Synthetic New Worker")
    db.add(new_handyman)
    db.commit()
    payload = {
        "handyman_id": str(new_handyman.id),
        "email": "new@example.com",
        "password": "synthetic-long-password",
    }
    dispatch = session(client, "worker@example.com", "worker-password")
    assert (
        client.post(
            "/api/v1/mobile/technicians", headers=headers(dispatch), json=payload
        ).status_code
        == 403
    )
    admin = session(client, "dispatcher@handyman.crm", "admin-password")
    created = client.post("/api/v1/mobile/technicians", headers=headers(admin), json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["handyman_id"] == str(new_handyman.id)
    assert "password" not in created.json()
    assert (
        client.post("/api/v1/mobile/technicians", headers=headers(admin), json=payload).status_code
        == 409
    )
    client.post(
        "/api/v1/auth/login",
        json={"email": "dispatcher@handyman.crm", "password": "admin-password"},
    )
    assert all(u["role"] != "technician" for u in client.get("/api/v1/users").json())


def test_web_write_invalidates_mobile_revision(client, db, mobile_data):
    dispatch, task = task_fixture(client, mobile_data)
    assign = client.post(
        f"/api/v1/mobile/tasks/{task['id']}/assign",
        headers=headers(dispatch),
        json={
            "handyman_id": str(mobile_data["handyman"].id),
            "expected_revision": task["revision"],
        },
    ).json()
    client.post(
        "/api/v1/auth/login", json={"email": "worker@example.com", "password": "worker-password"}
    )
    response = client.patch(
        f"/api/v1/tasks/{task['id']}", json={"description": "Changed at office"}
    )
    assert response.status_code == 200, response.text
    tech = session(client, "tech@example.com", "synthetic-password")
    stale = client.post(
        f"/api/v1/mobile/tasks/{task['id']}/status",
        headers=headers(tech),
        json={"status": "in_progress", "expected_revision": assign["revision"]},
    )
    assert stale.status_code == 409
    assert db.get(Task, uuid.UUID(task["id"])).status == TaskStatus.assigned
