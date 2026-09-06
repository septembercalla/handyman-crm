import logging
import uuid
from pathlib import PurePosixPath
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.lead_attachment import LeadAttachment
from app.routers.leads import event, get_lead
from app.schemas.lead_attachment import LeadAttachmentOut
from app.services import operations
from app.services.storage import StorageError, get_private_storage, iter_file

router = APIRouter(prefix="/leads/{lead_id}/attachments", tags=["lead photos"])
logger = logging.getLogger(__name__)
MAX_PHOTO_BYTES = 10 * 1024 * 1024
FORMATS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _storage():
    try:
        return get_private_storage()
    except RuntimeError as exc:
        raise HTTPException(503, "Private photo storage is not configured") from exc


def _photo(db, lead_id, attachment_id):
    photo = db.scalar(
        select(LeadAttachment).where(
            LeadAttachment.id == attachment_id, LeadAttachment.lead_id == lead_id
        )
    )
    if photo is None:
        raise HTTPException(404, "Photo not found")
    return photo


def _cleanup(storage, key):
    try:
        storage.delete(key)
    except Exception:
        # Cleanup is best effort; retain the original failure without exposing provider details.
        logger.warning("Could not clean up a failed Lead photo upload")


def _validate(file):
    name = PurePosixPath((file.filename or "").replace("\\", "/")).name
    name = "".join(c for c in name if ord(c) >= 32 and ord(c) != 127)
    if len(name) > 255:
        raise HTTPException(422, "Photo filename must be 255 characters or fewer")
    extension = PurePosixPath(name).suffix.lower()
    mime = FORMATS.get(extension)
    if mime is None or file.content_type != mime:
        raise HTTPException(415, "Only JPG, PNG and WEBP images are supported")
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size == 0:
        raise HTTPException(422, "The uploaded image is empty")
    if size > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image must be 10 MB or smaller")
    header = file.file.read(16)
    file.file.seek(0)
    valid = (
        mime == "image/jpeg"
        and header.startswith(b"\xff\xd8\xff")
        or mime == "image/png"
        and header.startswith(b"\x89PNG\r\n\x1a\n")
        or mime == "image/webp"
        and header[:4] == b"RIFF"
        and header[8:12] == b"WEBP"
        and header[12:16] in {b"VP8 ", b"VP8L", b"VP8X"}
    )
    if not valid:
        raise HTTPException(415, "The file contents do not match its image format")
    return name, extension, mime, size


@router.get("", response_model=list[LeadAttachmentOut])
def list_photos(lead_id: uuid.UUID, db: DbSession, _: CurrentUser):
    get_lead(db, lead_id)
    return db.scalars(
        select(LeadAttachment)
        .where(LeadAttachment.lead_id == lead_id)
        .order_by(LeadAttachment.uploaded_at, LeadAttachment.id)
    ).all()


@router.post("", response_model=LeadAttachmentOut, status_code=201)
def upload_photo(
    lead_id: uuid.UUID, db: DbSession, user: CurrentUser, file: Annotated[UploadFile, File()]
):
    lead = get_lead(db, lead_id, lock=True)
    name, extension, mime, size = _validate(file)
    storage = _storage()
    key = f"leads/{lead_id}/{uuid.uuid4()}{extension}"
    try:
        storage.put(key, file.file)
    except (StorageError, OSError) as exc:
        _cleanup(storage, key)
        raise HTTPException(
            503, "Could not upload photo to private storage. Please retry."
        ) from exc
    try:
        now = operations.utcnow()
        photo = LeadAttachment(
            lead_id=lead_id,
            file_name=name,
            storage_key=key,
            mime_type=mime,
            size_bytes=size,
            uploaded_at=now,
            uploaded_by_id=user.id,
            uploaded_by_name=user.full_name,
        )
        db.add(photo)
        event(db, lead, user, "photo_uploaded", now, f"Photo uploaded: {name}")
        db.flush()
        result = LeadAttachmentOut.model_validate(photo)
        db.commit()
    except Exception:
        db.rollback()
        _cleanup(storage, key)
        raise
    # No fallible refresh after commit: never remove an object already committed in metadata.
    return result


def _content(db, lead_id, attachment_id, download):
    photo = _photo(db, lead_id, attachment_id)
    try:
        source = _storage().open(photo.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Stored photo not found") from exc
    except (StorageError, OSError) as exc:
        raise HTTPException(
            503, "Could not read photo from private storage. Please retry."
        ) from exc
    disposition = "attachment" if download else "inline"
    encoded_name = quote(photo.file_name, safe="")
    return StreamingResponse(
        iter_file(source),
        media_type=photo.mime_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded_name}",
            "Content-Length": str(photo.size_bytes),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{attachment_id}/view")
def view_photo(lead_id: uuid.UUID, attachment_id: uuid.UUID, db: DbSession, _: CurrentUser):
    return _content(db, lead_id, attachment_id, False)


@router.get("/{attachment_id}/download")
def download_photo(lead_id: uuid.UUID, attachment_id: uuid.UUID, db: DbSession, _: CurrentUser):
    return _content(db, lead_id, attachment_id, True)


@router.delete("/{attachment_id}", status_code=204)
def delete_photo(lead_id: uuid.UUID, attachment_id: uuid.UUID, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    photo = _photo(db, lead_id, attachment_id)
    try:
        _storage().delete(photo.storage_key)
    except FileNotFoundError:
        pass  # A retry can finish metadata cleanup after an earlier partial delete.
    except (StorageError, OSError) as exc:
        raise HTTPException(
            503, "Could not delete photo from private storage. Please retry."
        ) from exc
    try:
        name = photo.file_name
        db.delete(photo)
        event(db, lead, user, "photo_deleted", operations.utcnow(), f"Photo deleted: {name}")
        db.commit()
    except Exception:
        db.rollback()
        raise
