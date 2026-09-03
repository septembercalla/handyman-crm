import mimetypes
import uuid
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.config import settings
from app.core.deps import AdminUser, DbSession
from app.models import Handyman, HandymanDocument, HandymanDocumentType
from app.schemas import HandymanDocumentOut
from app.services.storage import PrivateObjectStorage, get_private_storage, iter_file

router = APIRouter(prefix="/handymen", tags=["handyman documents"])

ALLOWED_FORMATS = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
}


def _storage() -> PrivateObjectStorage:
    try:
        return get_private_storage()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Private document storage is not configured",
        ) from exc


Storage = Annotated[PrivateObjectStorage, Depends(_storage)]


def _handyman_or_404(db: DbSession, handyman_id: uuid.UUID) -> Handyman:
    handyman = db.get(Handyman, handyman_id)
    if not handyman:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Handyman not found",
        )
    return handyman


def _document_or_404(
    db: DbSession,
    handyman_id: uuid.UUID,
    document_id: uuid.UUID,
) -> HandymanDocument:
    document = db.get(HandymanDocument, document_id)
    if not document or document.handyman_id != handyman_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return document


@router.get("/{handyman_id}/documents", response_model=list[HandymanDocumentOut])
def list_documents(
    handyman_id: uuid.UUID,
    db: DbSession,
    _: AdminUser,
) -> list[HandymanDocument]:
    _handyman_or_404(db, handyman_id)
    return list(
        db.execute(
            select(HandymanDocument)
            .where(HandymanDocument.handyman_id == handyman_id)
            .order_by(HandymanDocument.uploaded_at.desc())
        )
        .scalars()
        .all()
    )


@router.post(
    "/{handyman_id}/documents",
    response_model=HandymanDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_document(
    handyman_id: uuid.UUID,
    db: DbSession,
    user: AdminUser,
    storage: Storage,
    document_type: Annotated[HandymanDocumentType, Form()],
    file: Annotated[UploadFile, File()],
    notes: Annotated[str, Form(max_length=2000)] = "",
) -> HandymanDocument:
    _handyman_or_404(db, handyman_id)
    original_name = Path((file.filename or "document").replace("\\", "/")).name[:255]
    extension = Path(original_name).suffix.lower()
    detected_mime = mimetypes.guess_type(original_name)[0]
    mime_type = file.content_type or detected_mime or "application/octet-stream"
    expected_format = ALLOWED_FORMATS.get(extension)
    if expected_format is None or mime_type != expected_format[0]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF, JPG, JPEG and PNG documents are supported",
        )

    header = file.file.read(8)
    file.file.seek(0)
    if not header.startswith(expected_format[1]):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The file contents do not match its document format",
        )

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    max_bytes = settings.FILE_STORAGE_MAX_MB * 1024 * 1024
    if size <= 0:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")
    if size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.FILE_STORAGE_MAX_MB} MB limit",
        )

    storage_key = f"handymen/{handyman_id}/{uuid.uuid4()}{extension}"
    storage.put(storage_key, file.file)
    document = HandymanDocument(
        handyman_id=handyman_id,
        file_name=original_name,
        document_type=document_type,
        storage_key=storage_key,
        mime_type=mime_type,
        file_size=size,
        uploaded_by=user.id,
        notes=notes.strip(),
    )
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception:
        storage.delete(storage_key)
        raise
    return document


@router.get("/{handyman_id}/documents/{document_id}/content")
def document_content(
    handyman_id: uuid.UUID,
    document_id: uuid.UUID,
    db: DbSession,
    _: AdminUser,
    storage: Storage,
    download: Annotated[bool, Query()] = False,
) -> StreamingResponse:
    document = _document_or_404(db, handyman_id, document_id)
    try:
        source = storage.open(document.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored document file not found",
        ) from exc
    disposition = "attachment" if download else "inline"
    encoded_name = quote(document.file_name)
    return StreamingResponse(
        iter_file(source),
        media_type=document.mime_type,
        headers={
            "Content-Disposition": (
                f"{disposition}; filename*=UTF-8''{encoded_name}"
            ),
            "Content-Length": str(document.file_size),
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/{handyman_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    handyman_id: uuid.UUID,
    document_id: uuid.UUID,
    db: DbSession,
    _: AdminUser,
    storage: Storage,
) -> None:
    document = _document_or_404(db, handyman_id, document_id)
    storage.delete(document.storage_key)
    db.delete(document)
    db.commit()
