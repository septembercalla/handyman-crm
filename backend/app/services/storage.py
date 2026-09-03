"""Private object-storage abstraction for sensitive worker documents."""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Protocol

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


@lru_cache
def get_private_storage() -> PrivateObjectStorage:
    backend = settings.FILE_STORAGE_BACKEND.strip().lower()
    if backend != "local":
        raise RuntimeError(
            f"Unsupported FILE_STORAGE_BACKEND={settings.FILE_STORAGE_BACKEND!r}"
        )
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
