from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.conftest import login


def test_no_public_registration_and_admin_role_cannot_be_created_via_api(
    client: TestClient, users: dict[str, User]
) -> None:
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": "public@example.com", "password": "public-password"},
        ).status_code
        == 404
    )

    login(client, users["admin"].email, "admin-password")
    attempted_admin = client.post(
        "/api/v1/users",
        json={
            "email": "another-admin@example.com",
            "full_name": "Another Admin",
            "password": "temporary-password",
            "role": "admin",
        },
    )
    assert attempted_admin.status_code == 422


def test_first_login_requires_new_password_and_blocks_work_api(
    client: TestClient, users: dict[str, User]
) -> None:
    login(client, users["admin"].email, "admin-password")
    created = client.post(
        "/api/v1/users",
        json={
            "email": "first-login@example.com",
            "full_name": "First Login",
            "password": "temporary-password",
        },
    ).json()

    dispatcher_client = TestClient(client.app)
    login(dispatcher_client, created["email"], "temporary-password")
    assert dispatcher_client.get("/api/v1/auth/me").json()["must_change_password"] is True

    blocked = dispatcher_client.get("/api/v1/tasks")
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Password change required"

    same_password = dispatcher_client.post(
        "/api/v1/auth/complete-first-login",
        json={"new_password": "temporary-password"},
    )
    assert same_password.status_code == 400

    completed = dispatcher_client.post(
        "/api/v1/auth/complete-first-login",
        json={"new_password": "private-new-password"},
    )
    assert completed.status_code == 200
    assert completed.json()["must_change_password"] is False

    fresh_client = TestClient(client.app)
    login(fresh_client, created["email"], "private-new-password")


def test_disable_and_delete_revoke_existing_sessions(
    client: TestClient, users: dict[str, User]
) -> None:
    dispatcher = users["dispatcher"]
    dispatcher_client = TestClient(client.app)
    login(dispatcher_client, dispatcher.email, "worker-password")

    login(client, users["admin"].email, "admin-password")
    disabled = client.patch(
        f"/api/v1/users/{dispatcher.id}", json={"is_active": False}
    )
    assert disabled.status_code == 200
    assert dispatcher_client.get("/api/v1/auth/me").status_code == 401

    client.patch(f"/api/v1/users/{dispatcher.id}", json={"is_active": True})
    login(dispatcher_client, dispatcher.email, "worker-password")
    assert client.delete(f"/api/v1/users/{dispatcher.id}").status_code == 204
    assert dispatcher_client.get("/api/v1/auth/me").status_code == 401


def test_login_records_last_login_and_remember_controls_cookie_lifetime(
    client: TestClient, db: Session, users: dict[str, User]
) -> None:
    dispatcher = users["dispatcher"]
    response = client.post(
        "/api/v1/auth/login",
        json={"email": dispatcher.email, "password": "worker-password", "remember": False},
    )
    assert response.status_code == 200
    assert response.json()["user"]["last_login_at"] is not None
    assert "Max-Age" not in response.headers["set-cookie"]

    db.refresh(dispatcher)
    assert dispatcher.last_login_at is not None

    remembered = TestClient(client.app).post(
        "/api/v1/auth/login",
        json={"email": dispatcher.email, "password": "worker-password", "remember": True},
    )
    assert "Max-Age" in remembered.headers["set-cookie"]
