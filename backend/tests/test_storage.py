import io
import uuid
from unittest.mock import Mock

import boto3
import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from botocore.response import StreamingBody
from botocore.stub import Stubber
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Customer, Handyman, HandymanDocument, Task, TaskStatusHistory, User
from app.services import storage as storage_module
from app.services.storage import LocalPrivateStorage, R2PrivateStorage, StorageError, iter_file
from tests.conftest import login

ENDPOINT = "https://test-account.r2.cloudflarestorage.com"
BUCKET = "private-documents"
KEY = "handymen/test/document.pdf"
PDF = b"%PDF-1.7\nprivate"


def client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "private provider details"}}, "S3")


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch):
    storage_module.get_private_storage.cache_clear()
    for name, value in {
        "ENV": "production",
        "FILE_STORAGE_BACKEND": "r2",
        "R2_BUCKET_NAME": BUCKET,
        "R2_ENDPOINT": ENDPOINT,
        "R2_ACCESS_KEY_ID": "test-access-key",
        "R2_SECRET_ACCESS_KEY": "test-secret-key",
    }.items():
        monkeypatch.setattr(settings, name, value)
    # Even if a stub expectation is missed, these tests must never use the network.
    monkeypatch.setattr(
        "botocore.httpsession.URLLib3Session.send",
        Mock(side_effect=AssertionError("Unexpected network request")),
    )
    yield
    storage_module.get_private_storage.cache_clear()


def test_local_storage_still_works(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ENV", "development")
    monkeypatch.setattr(settings, "FILE_STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "FILE_STORAGE_LOCAL_PATH", str(tmp_path))
    backend = storage_module.get_private_storage()
    assert isinstance(backend, LocalPrivateStorage)
    backend.put(KEY, io.BytesIO(PDF))
    body = backend.open(KEY)
    assert b"".join(iter_file(body)) == PDF
    assert body.closed
    backend.delete(KEY)
    backend.delete(KEY)
    with pytest.raises(FileNotFoundError):
        backend.open(KEY)
    with pytest.raises(ValueError):
        backend.put("../outside", io.BytesIO(PDF))


def test_local_storage_remains_forbidden_in_production(monkeypatch):
    monkeypatch.setattr(settings, "FILE_STORAGE_BACKEND", "local")
    with pytest.raises(RuntimeError, match="disabled in production"):
        storage_module.get_private_storage()


def test_unknown_backend(monkeypatch):
    monkeypatch.setattr(settings, "FILE_STORAGE_BACKEND", "unsupported")
    with pytest.raises(RuntimeError, match="Unsupported FILE_STORAGE_BACKEND"):
        storage_module.get_private_storage()


@pytest.mark.parametrize(
    "name",
    [
        "R2_BUCKET_NAME",
        "R2_ENDPOINT",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    ],
)
@pytest.mark.parametrize("value", ["", "   "])
def test_missing_configuration_is_rejected_before_client_creation(monkeypatch, name, value):
    factory = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", factory)
    monkeypatch.setattr(settings, name, value)
    with pytest.raises(RuntimeError, match=name):
        storage_module.get_private_storage()
    factory.assert_not_called()


@pytest.mark.parametrize(
    "endpoint",
    [
        "invalid",
        "http://example.com",
        "https://example.com/bucket",
        "https://user:password@example.com",
        "https://example.com?key=secret",
    ],
)
def test_invalid_endpoint_configuration(monkeypatch, endpoint):
    factory = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", factory)
    monkeypatch.setattr(settings, "R2_ENDPOINT", endpoint)
    with pytest.raises(RuntimeError, match="R2_ENDPOINT"):
        storage_module.get_private_storage()
    factory.assert_not_called()


def test_r2_client_configuration(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", factory)
    backend = storage_module.get_private_storage()
    assert isinstance(backend, R2PrivateStorage)
    assert storage_module.get_private_storage() is backend
    args, kwargs = factory.call_args
    assert args == ("s3",)
    assert kwargs["endpoint_url"] == ENDPOINT
    assert kwargs["region_name"] == "auto"
    assert kwargs["aws_access_key_id"] == "test-access-key"
    assert kwargs["aws_secret_access_key"] == "test-secret-key"
    assert kwargs["config"].signature_version == "s3v4"


@pytest.mark.parametrize("bucket", ["ab", "BadBucket", "bucket/path", "-bucket", "x" * 64])
def test_invalid_bucket_configuration(monkeypatch, bucket):
    factory = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", factory)
    monkeypatch.setattr(settings, "R2_BUCKET_NAME", bucket)
    with pytest.raises(RuntimeError, match="R2_BUCKET_NAME"):
        storage_module.get_private_storage()
    factory.assert_not_called()


def test_r2_operations_match_s3_api(monkeypatch):
    s3 = boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        region_name="auto",
        aws_access_key_id="test-access-key",
        aws_secret_access_key="test-secret-key",
    )
    monkeypatch.setattr(storage_module.boto3, "client", lambda *args, **kwargs: s3)
    backend = storage_module.get_private_storage()
    source = io.BytesIO(PDF)
    raw_body = io.BytesIO(PDF)
    body = StreamingBody(raw_body, len(PDF))
    with Stubber(s3) as stub:
        # Exact request shape: no public ACLs or URL generation.
        stub.add_response("put_object", {}, {"Bucket": BUCKET, "Key": KEY, "Body": source})
        stub.add_response("get_object", {"Body": body}, {"Bucket": BUCKET, "Key": KEY})
        stub.add_response("delete_object", {}, {"Bucket": BUCKET, "Key": KEY})
        backend.put(KEY, source)
        opened = backend.open(KEY)
        assert b"".join(iter_file(opened)) == PDF
        assert raw_body.closed
        backend.delete(KEY)
        stub.assert_no_pending_responses()


@pytest.mark.parametrize("code", ["NoSuchKey", "NotFound", "404"])
def test_missing_object_read_and_idempotent_delete(monkeypatch, code):
    s3 = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", lambda *args, **kwargs: s3)
    backend = storage_module.get_private_storage()
    s3.get_object.side_effect = client_error(code)
    s3.delete_object.side_effect = client_error(code)
    with pytest.raises(FileNotFoundError):
        backend.open(KEY)
    backend.delete(KEY)
    s3.delete_object.assert_called_once_with(Bucket=BUCKET, Key=KEY)


@pytest.mark.parametrize("operation", ["put", "open", "delete"])
@pytest.mark.parametrize(
    "failure",
    [
        client_error("AccessDenied"),
        client_error("NoSuchBucket"),
        client_error("InternalError"),
        EndpointConnectionError(endpoint_url=ENDPOINT),
    ],
)
def test_real_storage_failures_are_not_swallowed(monkeypatch, operation, failure):
    s3 = Mock()
    monkeypatch.setattr(storage_module.boto3, "client", lambda *args, **kwargs: s3)
    backend = storage_module.get_private_storage()
    method = {"put": "put_object", "open": "get_object", "delete": "delete_object"}[operation]
    getattr(s3, method).side_effect = failure
    with pytest.raises(StorageError) as caught:
        getattr(backend, operation)(KEY, io.BytesIO(PDF)) if operation == "put" else getattr(
            backend, operation
        )(KEY)
    assert "private provider details" not in str(caught.value)


@pytest.fixture
def document_api(client: TestClient, db: Session, users: dict[str, User], monkeypatch):
    # Production auth cookies are Secure; use HTTPS inside the test transport.
    client.base_url = "https://testserver"
    db.connection().exec_driver_sql("PRAGMA foreign_keys=ON")
    for model in (Customer, Handyman, HandymanDocument, Task, TaskStatusHistory):
        model.__table__.create(db.get_bind(), checkfirst=True)
    objects = {}
    s3 = Mock()

    def put_object(*, Bucket, Key, Body):
        assert Bucket == BUCKET
        objects[Key] = Body.read()
        return {}

    def get_object(*, Bucket, Key):
        assert Bucket == BUCKET
        if Key not in objects:
            raise client_error("NoSuchKey")
        return {"Body": io.BytesIO(objects[Key])}

    def delete_object(*, Bucket, Key):
        assert Bucket == BUCKET
        objects.pop(Key, None)
        return {}

    s3.put_object.side_effect = put_object
    s3.get_object.side_effect = get_object
    s3.delete_object.side_effect = delete_object
    monkeypatch.setattr(storage_module.boto3, "client", lambda *args, **kwargs: s3)
    handyman = Handyman(full_name="R2 Worker")
    db.add(handyman)
    db.commit()
    login(client, users["admin"].email, "admin-password")
    return f"/api/v1/handymen/{handyman.id}", objects, s3


def upload(client, base, name="document.pdf", content=PDF, mime="application/pdf"):
    response = client.post(
        f"{base}/documents",
        data={"document_type": "contract"},
        files={"file": (name, content, mime)},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.parametrize(
    "name,content,mime",
    [
        ("file.pdf", PDF, "application/pdf"),
        ("file.jpg", b"\xff\xd8\xfftest", "image/jpeg"),
        ("file.jpeg", b"\xff\xd8\xfftest", "image/jpeg"),
        ("file.png", b"\x89PNG\r\n\x1a\ntest", "image/png"),
    ],
)
def test_existing_upload_view_download_delete_api(document_api, client, db, name, content, mime):
    base, objects, s3 = document_api
    doc_id = upload(client, base, name, content, mime)
    record = db.get(HandymanDocument, uuid.UUID(doc_id))
    assert list(objects) == [record.storage_key]
    for suffix, disposition in [("", "inline"), ("?download=true", "attachment")]:
        response = client.get(f"{base}/documents/{doc_id}/content{suffix}")
        assert response.status_code == 200
        assert response.content == content
        assert response.headers["content-disposition"].startswith(disposition)
        assert response.headers["cache-control"] == "private, no-store"
        assert "location" not in response.headers
    assert client.delete(f"{base}/documents/{doc_id}").status_code == 204
    assert not objects
    assert db.get(HandymanDocument, uuid.UUID(doc_id)) is None
    s3.delete_object.assert_called_once_with(Bucket=BUCKET, Key=record.storage_key)


@pytest.mark.parametrize(
    "name,content,mime",
    [
        ("file.pdf", b"bad", "application/pdf"),
        ("file.jpg", b"bad", "image/jpeg"),
        ("file.png", PDF, "image/png"),
        ("file.exe", PDF, "application/pdf"),
        ("file.pdf", PDF, "image/png"),
    ],
)
def test_upload_validation_precedes_r2(document_api, client, name, content, mime):
    base, objects, s3 = document_api
    response = client.post(
        f"{base}/documents",
        data={"document_type": "other"},
        files={"file": (name, content, mime)},
    )
    assert response.status_code == 415
    assert not objects
    s3.put_object.assert_not_called()


@pytest.mark.parametrize("target", ["document", "handyman"])
@pytest.mark.parametrize(
    "failure",
    [
        client_error("AccessDenied"),
        client_error("NoSuchBucket"),
        client_error("InternalError"),
        EndpointConnectionError(endpoint_url=ENDPOINT),
    ],
)
def test_failed_delete_preserves_database(document_api, client, db, target, failure):
    base, objects, s3 = document_api
    doc_id = upload(client, base)
    s3.delete_object.side_effect = failure
    path = base if target == "handyman" else f"{base}/documents/{doc_id}"
    response = client.delete(path)
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Could not delete document from private storage. Please retry."
    }
    db.expire_all()
    assert db.get(HandymanDocument, uuid.UUID(doc_id)) is not None
    assert db.get(Handyman, uuid.UUID(base.rsplit("/", 1)[1])) is not None
    assert len(objects) == 1


@pytest.mark.parametrize("target", ["document", "handyman"])
def test_missing_r2_object_allows_database_cleanup(document_api, client, db, target):
    base, objects, s3 = document_api
    doc_id = upload(client, base)
    objects.clear()
    assert client.get(f"{base}/documents/{doc_id}/content").status_code == 404
    s3.delete_object.side_effect = client_error("NoSuchKey")
    path = base if target == "handyman" else f"{base}/documents/{doc_id}"
    assert client.delete(path).status_code == 204
    db.expire_all()
    assert db.get(HandymanDocument, uuid.UUID(doc_id)) is None


def test_handyman_delete_removes_all_r2_documents(document_api, client, db):
    base, objects, s3 = document_api
    upload(client, base)
    upload(client, base)
    keys = set(objects)
    assert len(keys) == 2
    assert client.delete(base).status_code == 204
    assert not objects
    assert {call.kwargs["Key"] for call in s3.delete_object.call_args_list} == keys
    assert db.scalars(select(HandymanDocument)).all() == []
    assert db.scalars(select(Handyman)).all() == []


def test_r2_admin_permissions_remain_enforced(document_api, client, users):
    base, objects, s3 = document_api
    doc_id = upload(client, base)
    login(client, users["dispatcher"].email, "worker-password")
    assert client.get(f"{base}/documents").status_code == 403
    assert client.get(f"{base}/documents/{doc_id}/content").status_code == 403
    assert client.get(f"{base}/documents/{doc_id}/content?download=true").status_code == 403
    assert client.delete(f"{base}/documents/{doc_id}").status_code == 403
    assert client.delete(base).status_code == 403
    response = client.post(
        f"{base}/documents",
        data={"document_type": "contract"},
        files={"file": ("file.pdf", PDF, "application/pdf")},
    )
    assert response.status_code == 403
    assert len(objects) == 1
    s3.delete_object.assert_not_called()


def test_partial_handyman_delete_failure_keeps_records_and_allows_retry(document_api, client, db):
    base, objects, s3 = document_api
    upload(client, base)
    upload(client, base)
    delete_object = s3.delete_object.side_effect

    def fail_second_delete(**kwargs):
        if s3.delete_object.call_count == 2:
            raise EndpointConnectionError(endpoint_url=ENDPOINT)
        return delete_object(**kwargs)

    s3.delete_object.side_effect = fail_second_delete
    assert client.delete(base).status_code == 503
    assert len(objects) == 1
    assert len(db.scalars(select(HandymanDocument)).all()) == 2
    assert len(db.scalars(select(Handyman)).all()) == 1
    s3.delete_object.side_effect = delete_object
    assert client.delete(base).status_code == 204
    assert not objects
    assert db.scalars(select(HandymanDocument)).all() == []


def test_upload_service_error_does_not_create_document_record(document_api, client, db):
    base, objects, s3 = document_api
    s3.put_object.side_effect = client_error("AccessDenied")
    response = client.post(
        f"{base}/documents",
        data={"document_type": "contract"},
        files={"file": ("file.pdf", PDF, "application/pdf")},
    )
    assert response.status_code == 503
    assert db.scalars(select(HandymanDocument)).all() == []
    assert not objects


def test_read_service_error_returns_503_instead_of_404(document_api, client):
    base, objects, s3 = document_api
    doc_id = upload(client, base)
    s3.get_object.side_effect = client_error("AccessDenied")
    response = client.get(f"{base}/documents/{doc_id}/content")
    assert response.status_code == 503
    assert "private provider details" not in response.text
    assert len(objects) == 1
