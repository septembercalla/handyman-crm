import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.conftest import login


def test_dispatcher_cannot_access_user_management(
    client: TestClient, users: dict[str, User]
) -> None:
    login(client, users["dispatcher"].email, "worker-password")

    assert client.get("/api/v1/users").status_code == 403
    response = client.post(
        "/api/v1/users",
        json={
            "email": "intruder@example.com",
            "full_name": "Intruder",
            "password": "long-enough-password",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator access required"


def test_admin_can_create_edit_disable_and_delete_dispatcher(
    client: TestClient, db: Session, users: dict[str, User]
) -> None:
    login(client, users["admin"].email, "admin-password")

    created = client.post(
        "/api/v1/users",
        json={
            "email": "NEW.Dispatcher@example.com",
            "full_name": "New Dispatcher",
            "password": "initial-password",
        },
    )
    assert created.status_code == 201, created.text
    created_user = created.json()
    assert created_user["email"] == "new.dispatcher@example.com"
    assert created_user["role"] == "dispatcher"

    updated = client.patch(
        f"/api/v1/users/{created_user['id']}",
        json={
            "full_name": "Renamed Dispatcher",
            "email": "renamed@example.com",
            "password": "updated-password",
            "is_active": False,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["full_name"] == "Renamed Dispatcher"
    assert updated.json()["is_active"] is False

    disabled_login = TestClient(client.app).post(
        "/api/v1/auth/login",
        json={"email": "renamed@example.com", "password": "updated-password"},
    )
    assert disabled_login.status_code == 403
    assert disabled_login.json()["detail"] == "User is disabled"

    assert (
        client.patch(
            f"/api/v1/users/{created_user['id']}", json={"is_active": True}
        ).status_code
        == 200
    )
    deleted = client.delete(f"/api/v1/users/{created_user['id']}")
    assert deleted.status_code == 204
    assert db.get(User, uuid.UUID(created_user["id"])) is None


def test_admin_account_cannot_be_disabled_or_deleted(
    client: TestClient, users: dict[str, User]
) -> None:
    admin = users["admin"]
    login(client, admin.email, "admin-password")

    disabled = client.patch(f"/api/v1/users/{admin.id}", json={"is_active": False})
    assert disabled.status_code == 400
    assert "cannot be disabled" in disabled.json()["detail"]

    deleted = client.delete(f"/api/v1/users/{admin.id}")
    assert deleted.status_code == 400
    assert "cannot be deleted" in deleted.json()["detail"]


def test_user_can_change_own_password(client: TestClient, users: dict[str, User]) -> None:
    dispatcher = users["dispatcher"]
    login(client, dispatcher.email, "worker-password")

    wrong = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "new-worker-password"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Current password is incorrect"

    changed = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "worker-password",
            "new_password": "new-worker-password",
        },
    )
    assert changed.status_code == 204

    fresh_client = TestClient(client.app)
    login(fresh_client, dispatcher.email, "new-worker-password")


def test_admin_password_reset_revokes_existing_dispatcher_session(
    client: TestClient, users: dict[str, User]
) -> None:
    dispatcher = users["dispatcher"]
    dispatcher_client = TestClient(client.app)
    login(dispatcher_client, dispatcher.email, "worker-password")

    login(client, users["admin"].email, "admin-password")
    reset = client.patch(
        f"/api/v1/users/{dispatcher.id}",
        json={"password": "replacement-password"},
    )
    assert reset.status_code == 200

    assert dispatcher_client.get("/api/v1/auth/me").status_code == 401
