from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.deps import get_db
from app.core.security import hash_password
from app.main import app
from app.models import User, UserRole


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    def override_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def users(db: Session) -> dict[str, User]:
    admin = User(
        email="dispatcher@handyman.crm",
        full_name="CRM Administrator",
        password_hash=hash_password("admin-password"),
        role=UserRole.admin,
        is_active=True,
    )
    dispatcher = User(
        email="worker@example.com",
        full_name="Working Dispatcher",
        password_hash=hash_password("worker-password"),
        role=UserRole.dispatcher,
        is_active=True,
    )
    db.add_all([admin, dispatcher])
    db.commit()
    return {"admin": admin, "dispatcher": dispatcher}


def login(client: TestClient, email: str, password: str) -> None:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
