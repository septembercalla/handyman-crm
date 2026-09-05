"""Private object-storage abstraction for sensitive worker documents."""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from re import fullmatch
from typing import BinaryIO, Protocol, cast
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings


class PrivateObjectStorage(Protocol):
    def put(self, key: str, source: BinaryIO) -> None: ...

    def open(self, key: str) -> BinaryIO: ...

    def delete(self, key: str) -> None: ...


class LocalPrivateStorage:
    """Local development backend; files are never mounted by FastAPI."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        candidate = (self.root / key).resolve()
        if candidate == self.root or self.root not in candidate.parents:
            raise ValueError("Invalid storage key")
        return candidate

    def put(self, key: str, source: BinaryIO) -> None:
        destination = self._path(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()


class StorageError(RuntimeError):
    """Storage operation failed; the message is safe to return to API clients."""


class R2PrivateStorage:
    """Private R2 objects accessed only through the authenticated backend."""

    def __init__(
        self, *, bucket: str, endpoint: str, access_key_id: str, secret_access_key: str
    ) -> None:
        required = {
            "R2_BUCKET_NAME": bucket,
            "R2_ENDPOINT": endpoint,
            "R2_ACCESS_KEY_ID": access_key_id,
            "R2_SECRET_ACCESS_KEY": secret_access_key,
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise RuntimeError("R2 storage configuration missing: " + ", ".join(missing))
        try:
            url = urlsplit(endpoint)
            port = url.port  # Also validate malformed port values before boto3.
            valid_endpoint = (
                url.scheme == "https"
                and bool(url.hostname)
                and url.username is None
                and url.password is None
                and not url.query
                and not url.fragment
                and url.path in {"", "/"}
                and (port is None or port == 443)
            )
        except ValueError:
            valid_endpoint = False
        if not valid_endpoint:
            raise RuntimeError("R2_ENDPOINT must be an HTTPS S3 endpoint without a bucket path")
        if not fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
            raise RuntimeError(
                "R2_BUCKET_NAME must contain 3-63 lowercase letters, digits or hyphens, "
                "starting and ending with a letter or digit"
            )

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=30,
                retries={"mode": "standard", "total_max_attempts": 3},
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    @staticmethod
    def _missing_object(exc: ClientError) -> bool:
        # NoSuchBucket, authentication and service errors must preserve DB records.
        return exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "NotFound", "404"}

    def put(self, key: str, source: BinaryIO) -> None:
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=source)
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(
                "Could not upload document to private storage. Please retry."
            ) from exc

    def open(self, key: str) -> BinaryIO:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if self._missing_object(exc):
                raise FileNotFoundError("Stored document file not found") from exc
            raise StorageError(
                "Could not read document from private storage. Please retry."
            ) from exc
        except BotoCoreError as exc:
            raise StorageError(
                "Could not read document from private storage. Please retry."
            ) from exc
        return cast(BinaryIO, response["Body"])

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if self._missing_object(exc):
                return
            raise StorageError(
                "Could not delete document from private storage. Please retry."
            ) from exc
        except BotoCoreError as exc:
            raise StorageError(
                "Could not delete document from private storage. Please retry."
            ) from exc


@lru_cache
def get_private_storage() -> PrivateObjectStorage:
    backend = settings.FILE_STORAGE_BACKEND.strip().lower()
    if backend == "r2":
        return R2PrivateStorage(
            bucket=settings.R2_BUCKET_NAME,
            endpoint=settings.R2_ENDPOINT,
            access_key_id=settings.R2_ACCESS_KEY_ID,
            secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        )
    if backend != "local":
        raise RuntimeError(f"Unsupported FILE_STORAGE_BACKEND={settings.FILE_STORAGE_BACKEND!r}")
    if settings.is_production:
        raise RuntimeError(
            "Local document storage is disabled in production; configure a private "
            "object-storage provider before enabling uploads"
        )
    return LocalPrivateStorage(settings.FILE_STORAGE_LOCAL_PATH)


def iter_file(file_handle: BinaryIO) -> Iterator[bytes]:
    try:
        while chunk := file_handle.read(1024 * 1024):
            yield chunk
    finally:
        file_handle.close()
