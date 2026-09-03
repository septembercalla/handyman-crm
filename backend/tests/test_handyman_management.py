import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import app.routers.handyman_documents as document_routes
import app.routers.handymen as handyman_routes
import app.services.tasks as task_services
from app.main import app
from app.models import (
    Customer,
    Handyman,
    HandymanDocument,
    Task,
    TaskStatusHistory,
    User,
)
from app.services.storage import LocalPrivateStorage
from tests.conftest import login


@pytest.fixture
def handyman_tables(db: Session) -> Generator[None, None, None]:
    bind = db.get_bind()
    for table in (
        Customer.__table__,
        Handyman.__table__,
        HandymanDocument.__table__,
        Task.__table__,
        TaskStatusHistory.__table__,
    ):
        table.create(bind, checkfirst=True)
    yield


def handyman_payload(name: str = "Taylor Worker") -> dict:
    return {
        "full_name": name,
        "phone": "+1 312 555 0102",
        "email": "taylor@example.com",
        "skills": ["general", "painting"],
        "status": "active",
        "color": "#1A6FE0",
        "notes": "Has a cargo van",
        "street_address": "233 S Wacker Dr",
        "city": "Chicago",
        "state": "IL",
        "zip": "60606",
    }


def test_create_and_update_handyman_geocodes_home_address(
    client: TestClient,
    users: dict[str, User],
    handyman_tables: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: (41.8789, -87.6359))
    login(client, users["dispatcher"].email, "worker-password")

    created = client.post("/api/v1/handymen", json=handyman_payload())
    assert created.status_code == 201, created.text
    profile = created.json()
    assert profile["street_address"] == "233 S Wacker Dr"
    assert profile["latitude"] == pytest.approx(41.8789)
    assert profile["longitude"] == pytest.approx(-87.6359)

    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: (41.8810, -87.6240))
    updated = client.patch(
        f"/api/v1/handymen/{profile['id']}",
        json={
            "full_name": "Taylor Updated",
            "status": "inactive",
            "street_address": "201 E Randolph St",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["full_name"] == "Taylor Updated"
    assert updated.json()["status"] == "inactive"
    assert updated.json()["latitude"] == pytest.approx(41.8810)


def test_delete_is_permanent_only_without_task_history(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    handyman_tables: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: None)
    monkeypatch.setattr(task_services, "geocode", lambda *args: None)
    login(client, users["dispatcher"].email, "worker-password")

    disposable = client.post(
        "/api/v1/handymen", json=handyman_payload("No History")
    ).json()
    deleted = client.delete(f"/api/v1/handymen/{disposable['id']}")
    assert deleted.status_code == 204, deleted.text
    assert db.get(Handyman, uuid.UUID(disposable["id"])) is None

    customer = Customer(full_name="Customer One")
    db.add(customer)
    db.commit()
    db.refresh(customer)

    historical = client.post(
        "/api/v1/handymen", json=handyman_payload("Has History")
    ).json()
    task = client.post(
        "/api/v1/tasks",
        json={
            "customer_id": str(customer.id),
            "handyman_id": historical["id"],
            "title": "Historical job",
        },
    )
    assert task.status_code == 201, task.text

    blocked = client.delete(f"/api/v1/handymen/{historical['id']}")
    assert blocked.status_code == 409
    assert "task history" in blocked.json()["detail"]

    inactive = client.patch(
        f"/api/v1/handymen/{historical['id']}", json={"status": "inactive"}
    )
    assert inactive.status_code == 200
    assert inactive.json()["status"] == "inactive"
    assert client.get(f"/api/v1/tasks/{task.json()['id']}").json()["handyman"][
        "full_name"
    ] == "Has History"


def test_inactive_handyman_cannot_receive_a_new_assignment(
    client: TestClient,
    db: Session,
    users: dict[str, User],
    handyman_tables: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: None)
    monkeypatch.setattr(task_services, "geocode", lambda *args: None)
    login(client, users["dispatcher"].email, "worker-password")
    customer = Customer(full_name="Customer One")
    db.add(customer)
    db.commit()
    db.refresh(customer)

    payload = handyman_payload("Inactive Worker")
    payload["status"] = "inactive"
    handyman = client.post("/api/v1/handymen", json=payload).json()
    response = client.post(
        "/api/v1/tasks",
        json={
            "customer_id": str(customer.id),
            "handyman_id": handyman["id"],
            "title": "Should be blocked",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Inactive handymen cannot receive new assignments"


def test_documents_are_private_and_admin_only(
    client: TestClient,
    users: dict[str, User],
    handyman_tables: None,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(handyman_routes, "geocode", lambda *args: None)
    storage = LocalPrivateStorage(tmp_path / "documents")
    app.dependency_overrides[document_routes._storage] = lambda: storage

    login(client, users["dispatcher"].email, "worker-password")
    handyman = client.post(
        "/api/v1/handymen", json=handyman_payload("Document Worker")
    ).json()
    assert client.get(f"/api/v1/handymen/{handyman['id']}/documents").status_code == 403
    forbidden_upload = client.post(
        f"/api/v1/handymen/{handyman['id']}/documents",
        data={"document_type": "contract", "notes": "Signed"},
        files={"file": ("contract.pdf", b"%PDF-1.7\nprivate", "application/pdf")},
    )
    assert forbidden_upload.status_code == 403

    login(client, users["admin"].email, "admin-password")
    spoofed = client.post(
        f"/api/v1/handymen/{handyman['id']}/documents",
        data={"document_type": "other"},
        files={"file": ("not-really.png", b"<script>bad</script>", "image/png")},
    )
    assert spoofed.status_code == 415

    uploaded = client.post(
        f"/api/v1/handymen/{handyman['id']}/documents",
        data={"document_type": "contract", "notes": "Signed"},
        files={"file": ("contract.pdf", b"%PDF-1.7\nprivate", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    metadata = uploaded.json()
    assert metadata["document_type"] == "contract"
    assert metadata["notes"] == "Signed"
    assert "storage_key" not in metadata

    listed = client.get(f"/api/v1/handymen/{handyman['id']}/documents")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [metadata["id"]]

    content_path = (
        f"/api/v1/handymen/{handyman['id']}/documents/{metadata['id']}/content"
    )
    content = client.get(content_path)
    assert content.status_code == 200
    assert content.content == b"%PDF-1.7\nprivate"
    assert content.headers["cache-control"] == "private, no-store"
    assert content.headers["content-disposition"].startswith("inline;")

    removed = client.delete(
        f"/api/v1/handymen/{handyman['id']}/documents/{metadata['id']}"
    )
    assert removed.status_code == 204
    assert client.get(content_path).status_code == 404
