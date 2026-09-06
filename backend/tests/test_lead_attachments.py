import io
import uuid
from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import Base, Lead, LeadActivity, LeadAttachment
from app.routers import lead_attachments as routes
from app.services import operations
from app.services.storage import StorageError
from tests.conftest import login
from tests.test_operations import BOOKING, PAYLOAD

NOW = datetime(2026, 9, 6, 15, 42, 12, 123456, tzinfo=UTC)
JPG = b"\xff\xd8\xff" + b"test photo"
PNG = b"\x89PNG\r\n\x1a\n" + b"test photo"
WEBP = b"RIFF" + b"\x10\x00\x00\x00" + b"WEBPVP8 " + b"test photo"


class FakeStorage:
    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.streams = []
        self.put_error = None
        self.delete_error = None
        self.open_error = None

    def put(self, key, source):
        if self.put_error:
            raise self.put_error
        self.objects[key] = source.read()

    def open(self, key):
        if self.open_error:
            raise self.open_error
        if key not in self.objects:
            raise FileNotFoundError()
        stream = io.BytesIO(self.objects[key])
        self.streams.append(stream)
        return stream

    def delete(self, key):
        self.deleted.append(key)
        if self.delete_error:
            raise self.delete_error
        self.objects.pop(key, None)


@pytest.fixture
def photos(client, db, users, monkeypatch):
    db.connection().exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(db.get_bind())
    storage = FakeStorage()
    monkeypatch.setattr(routes, "get_private_storage", lambda: storage)
    monkeypatch.setattr(operations, "utcnow", lambda: NOW)
    monkeypatch.setattr("app.routers.leads.refresh_coordinates", lambda task: None)
    # Explicitly prohibit Cloudflare/network requests, even if a test misses the fake.
    monkeypatch.setattr(
        "botocore.httpsession.URLLib3Session.send",
        Mock(side_effect=AssertionError("Network forbidden")),
    )
    login(client, users["dispatcher"].email, "worker-password")
    response = client.post("/api/v1/leads", json=PAYLOAD)
    assert response.status_code == 201
    lead_id = response.json()["id"]
    return client, storage, lead_id, f"/api/v1/leads/{lead_id}/attachments"


def upload(client, path, name="wall.jpg", body=JPG, mime="image/jpeg", **kwargs):
    return client.post(path, files={"file": (name, body, mime)}, **kwargs)


@pytest.mark.parametrize(
    "name,body,mime",
    [
        ("wall.jpg", JPG, "image/jpeg"),
        ("wall.jpeg", JPG, "image/jpeg"),
        ("wall.png", PNG, "image/png"),
        ("wall.webp", WEBP, "image/webp"),
    ],
)
def test_upload_metadata_list_activity(photos, db, users, name, body, mime):
    client, storage, lead_id, path = photos
    response = upload(
        client,
        path,
        name,
        body,
        mime,
        data={"uploaded_by_id": str(uuid.uuid4()), "uploaded_at": "2000-01-01"},
    )
    assert response.status_code == 201, response.text
    photo = response.json()
    assert "storage_key" not in photo
    assert photo["file_name"] == name and photo["size_bytes"] == len(body)
    assert photo["mime_type"] == mime
    assert photo["uploaded_by_id"] == str(users["dispatcher"].id)
    assert photo["uploaded_by_name"] == users["dispatcher"].full_name
    assert datetime.fromisoformat(photo["uploaded_at"]).replace(tzinfo=UTC) == NOW
    row = db.get(LeadAttachment, uuid.UUID(photo["id"]))
    assert row.storage_key.startswith(f"leads/{lead_id}/")
    uuid.UUID(row.storage_key.rsplit("/", 1)[1].split(".")[0])
    assert storage.objects[row.storage_key] == body
    listed = client.get(path).json()
    assert len(listed) == 1
    assert datetime.fromisoformat(listed[0]["uploaded_at"]).replace(tzinfo=UTC) == NOW
    assert {k: v for k, v in listed[0].items() if k != "uploaded_at"} == {
        k: v for k, v in photo.items() if k != "uploaded_at"
    }
    events = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    assert events[-1]["event_type"] == "photo_uploaded"
    assert name in events[-1]["note"] and events[-1]["user_id"] == photo["uploaded_by_id"]
    assert datetime.fromisoformat(events[-1]["timestamp"]).replace(tzinfo=UTC) == NOW


@pytest.mark.parametrize(
    "name,body,mime,status",
    [
        ("wall.pdf", b"%PDF-", "application/pdf", 415),
        ("wall.svg", b"<svg/>", "image/svg+xml", 415),
        ("wall.jpg", JPG, "image/png", 415),
        ("wall.jpg", b"<script>bad</script>", "image/jpeg", 415),
        ("wall.webp", b"RIFF0000AVI VP8 ", "image/webp", 415),
        ("wall.webp", b"RIFF0000WEBPbad!", "image/webp", 415),
        ("wall.jpg", b"", "image/jpeg", 422),
        ("wall.jpg", JPG + b"x" * (10 * 1024 * 1024), "image/jpeg", 413),
    ],
    ids=[
        "pdf",
        "svg",
        "wrong-mime",
        "bad-jpeg",
        "bad-webp-container",
        "bad-webp-chunk",
        "empty",
        "oversized",
    ],
)
def test_invalid_photo_has_no_metadata_or_activity(photos, db, name, body, mime, status):
    client, storage, lead_id, path = photos
    before = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    response = upload(client, path, name, body, mime)
    assert response.status_code == status
    assert storage.objects == {} and db.scalars(select(LeadAttachment)).all() == []
    assert client.get(f"/api/v1/leads/{lead_id}/activities").json() == before


def test_safe_filename_and_authenticated_streaming(photos, db):
    client, storage, _, path = photos
    result = upload(client, path, "../../wall name.jpg")
    assert result.status_code == 201
    photo = result.json()
    assert photo["file_name"] == "wall name.jpg"
    for suffix, disposition in [("view", "inline"), ("download", "attachment")]:
        response = client.get(f"{path}/{photo['id']}/{suffix}")
        assert response.status_code == 200 and response.content == JPG
        assert response.headers["content-type"] == "image/jpeg"
        assert (
            response.headers["content-disposition"]
            == f"{disposition}; filename*=UTF-8''wall%20name.jpg"
        )
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert storage.streams[-1].closed
    row = db.get(LeadAttachment, uuid.UUID(photo["id"]))
    assert "wall" not in row.storage_key
    storage.objects.clear()
    assert client.get(f"{path}/{photo['id']}/view").status_code == 404
    assert client.get(f"{path}/{photo['id']}/download").status_code == 404


@pytest.mark.parametrize("missing", [False, True])
def test_delete_activity_and_missing_object_cleanup(photos, db, missing):
    client, storage, lead_id, path = photos
    photo = upload(client, path).json()
    if missing:
        storage.objects.clear()
        storage.delete_error = FileNotFoundError()
    response = client.delete(f"{path}/{photo['id']}")
    assert response.status_code == 204
    assert db.scalars(select(LeadAttachment)).all() == []
    events = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    assert events[-1]["event_type"] == "photo_deleted"
    assert "wall.jpg" in events[-1]["note"]
    assert client.delete(f"{path}/{photo['id']}").status_code == 404
    assert client.get(f"/api/v1/leads/{lead_id}/activities").json() == events


def test_delete_storage_failure_preserves_metadata(photos, db):
    client, storage, lead_id, path = photos
    photo = upload(client, path).json()
    before = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    storage.delete_error = StorageError("secret provider detail")
    result = client.delete(f"{path}/{photo['id']}")
    assert result.status_code == 503 and "secret" not in result.text
    assert db.get(LeadAttachment, uuid.UUID(photo["id"])) is not None
    assert client.get(f"/api/v1/leads/{lead_id}/activities").json() == before
    assert len(storage.objects) == 1
    storage.delete_error = None
    assert client.delete(f"{path}/{photo['id']}").status_code == 204


@pytest.mark.parametrize("cleanup_fails", [False, True])
def test_upload_db_failure_attempts_cleanup(photos, db, monkeypatch, cleanup_fails):
    client, storage, lead_id, path = photos
    before = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    if cleanup_fails:
        storage.delete_error = StorageError("cleanup unavailable")
    with monkeypatch.context() as patch:
        patch.setattr(db, "commit", Mock(side_effect=RuntimeError("DB failed")))
        with pytest.raises(RuntimeError, match="DB failed"):
            upload(client, path)
    assert len(storage.deleted) == 1
    assert db.scalars(select(LeadAttachment)).all() == []
    assert client.get(f"/api/v1/leads/{lead_id}/activities").json() == before
    assert len(storage.objects) == int(cleanup_fails)


def test_delete_db_failure_can_be_retried(photos, db, monkeypatch):
    client, storage, lead_id, path = photos
    photo = upload(client, path).json()
    with monkeypatch.context() as patch:
        patch.setattr(db, "commit", Mock(side_effect=RuntimeError("DB failed")))
        with pytest.raises(RuntimeError):
            client.delete(f"{path}/{photo['id']}")
    assert storage.objects == {}
    assert db.get(LeadAttachment, uuid.UUID(photo["id"])) is not None
    storage.delete_error = FileNotFoundError()
    assert client.delete(f"{path}/{photo['id']}").status_code == 204
    events = client.get(f"/api/v1/leads/{lead_id}/activities").json()
    assert sum(e["event_type"] == "photo_deleted" for e in events) == 1


def test_storage_upload_and_read_errors_are_safe(photos, db):
    client, storage, _, path = photos
    storage.put_error = StorageError("private endpoint")
    response = upload(client, path)
    assert response.status_code == 503 and "endpoint" not in response.text
    assert db.scalars(select(LeadAttachment)).all() == []
    storage.put_error = None
    photo = upload(client, path).json()
    storage.open_error = StorageError("private endpoint")
    assert client.get(f"{path}/{photo['id']}/view").status_code == 503


@pytest.mark.parametrize(
    "role,password", [("admin", "admin-password"), ("dispatcher", "worker-password")]
)
def test_permissions_and_booking_preserves_photos(photos, users, role, password):
    client, storage, lead_id, path = photos
    login(client, users[role].email, password)
    photo = upload(client, path).json()
    assert client.get(path).status_code == 200
    booked = client.post(f"/api/v1/leads/{lead_id}/book", json=BOOKING)
    assert booked.status_code == 200
    listed = client.get(path).json()
    assert len(listed) == 1
    assert datetime.fromisoformat(listed[0]["uploaded_at"]).replace(tzinfo=UTC) == NOW
    assert {k: v for k, v in listed[0].items() if k != "uploaded_at"} == {
        k: v for k, v in photo.items() if k != "uploaded_at"
    }
    assert client.get(f"{path}/{photo['id']}/view").content == JPG
    assert client.get(f"{path}/{photo['id']}/download").content == JPG
    assert len(storage.objects) == 1
    assert client.delete(f"{path}/{photo['id']}").status_code == 204


def test_unauthenticated_and_wrong_lead_requests(photos):
    client, storage, lead_id, path = photos
    assert client.get(path).json() == []  # Legacy/no photos.
    photo = upload(client, path).json()
    other_path = f"/api/v1/leads/{uuid.uuid4()}/attachments/{photo['id']}"
    assert client.get(other_path + "/view").status_code == 404
    assert client.delete(other_path).status_code == 404
    client.cookies.clear()
    assert client.get(path).status_code == 401
    assert upload(client, path).status_code == 401
    assert client.get(f"{path}/{photo['id']}/view").status_code == 401
    assert client.get(f"{path}/{photo['id']}/download").status_code == 401
    assert client.delete(f"{path}/{photo['id']}").status_code == 401
    assert len(storage.objects) == 1


def test_lead_cannot_cascade_delete_photos(photos, db):
    client, _, lead_id, path = photos
    upload(client, path)
    # Remove activity to isolate the attachment FK's own RESTRICT protection.
    db.query(LeadActivity).filter(LeadActivity.lead_id == uuid.UUID(lead_id)).delete()
    db.flush()
    db.delete(db.get(Lead, uuid.UUID(lead_id)))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()
    assert len(client.get(path).json()) == 1


def test_photo_user_snapshot_survives_user_deletion(photos, db, users):
    client, _, _, path = photos
    photo = upload(client, path).json()
    login(client, users["admin"].email, "admin-password")
    db.delete(users["dispatcher"])
    db.commit()
    db.expire_all()
    saved = client.get(path).json()[0]
    assert saved["uploaded_by_id"] is None
    assert saved["uploaded_by_name"] == photo["uploaded_by_name"]


def test_storage_not_configured_and_unknown_lead(photos, monkeypatch):
    client, storage, _, path = photos
    missing = f"/api/v1/leads/{uuid.uuid4()}/attachments"
    assert upload(client, missing).status_code == 404
    assert storage.objects == {}
    monkeypatch.setattr(
        routes, "get_private_storage", Mock(side_effect=RuntimeError("private config"))
    )
    response = upload(client, path)
    assert response.status_code == 503 and "config" not in response.json()["detail"].replace(
        "configured", ""
    )
    assert client.get(path).json() == []


def test_attachment_migration_matches_head_and_restricts_lead_deletion():
    import ast
    from pathlib import Path

    path = Path(__file__).parents[1] / "alembic/versions/e9a6b1c4d804_add_lead_attachments.py"
    source = path.read_text(encoding="utf-8")
    assert 'down_revision = "d8f5a0b3c703"' in source
    tree = ast.parse(source)
    upgrade = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "upgrade")
    calls = [
        n
        for n in ast.walk(upgrade)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == "op"
    ]
    assert [n.func.attr for n in calls] == ["create_table", "create_index"]
    assert 'ondelete="RESTRICT"' in source and 'ondelete="SET NULL"' in source
