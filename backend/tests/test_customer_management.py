import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Customer, Task
from tests.conftest import login


@pytest.fixture
def customer_tables(db: Session) -> Generator[None, None, None]:
    Customer.__table__.create(db.get_bind(), checkfirst=True)
    Task.__table__.create(db.get_bind(), checkfirst=True)
    yield


def customer_payload(name: str = "Morgan Customer") -> dict:
    return {
        "full_name": name,
        "phone": "+1 312 555 0188",
        "email": "morgan@example.com",
        "street_address": "233 S Wacker Dr",
        "city": "Chicago",
        "state": "IL",
        "zip": "60606",
        "notes": "Call before arrival",
    }


def test_dispatcher_can_edit_customer(
    client: TestClient,
    users: dict,
    customer_tables: None,
) -> None:
    login(client, users["dispatcher"].email, "worker-password")
    customer = client.post("/api/v1/customers", json=customer_payload()).json()

    updated = client.patch(
        f"/api/v1/customers/{customer['id']}",
        json={
            "full_name": "Morgan Updated",
            "phone": "+1 312 555 0199",
            "street_address": "201 E Randolph St",
            "notes": "Use the side entrance",
        },
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["full_name"] == "Morgan Updated"
    assert updated.json()["phone"] == "+1 312 555 0199"
    assert updated.json()["street_address"] == "201 E Randolph St"
    assert updated.json()["notes"] == "Use the side entrance"


def test_customer_without_task_history_can_be_deleted(
    client: TestClient,
    users: dict,
    customer_tables: None,
) -> None:
    login(client, users["dispatcher"].email, "worker-password")
    customer = client.post(
        "/api/v1/customers", json=customer_payload("Disposable Customer")
    ).json()

    deleted = client.delete(f"/api/v1/customers/{customer['id']}")

    assert deleted.status_code == 204, deleted.text
    assert client.get(f"/api/v1/customers/{customer['id']}").status_code == 404


def test_customer_with_task_history_cannot_be_deleted(
    client: TestClient,
    db: Session,
    users: dict,
    customer_tables: None,
) -> None:
    login(client, users["dispatcher"].email, "worker-password")
    customer = client.post(
        "/api/v1/customers", json=customer_payload("Historical Customer")
    ).json()
    db.add(
        Task(
            task_number="T-CUSTOMER-DELETE",
            customer_id=uuid.UUID(customer["id"]),
            title="Historical task",
        )
    )
    db.commit()

    blocked = client.delete(f"/api/v1/customers/{customer['id']}")

    assert blocked.status_code == 409, blocked.text
    assert "task history" in blocked.json()["detail"]
    assert client.get(f"/api/v1/customers/{customer['id']}").status_code == 200
