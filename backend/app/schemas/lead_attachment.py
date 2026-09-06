import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LeadAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lead_id: uuid.UUID
    file_name: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    uploaded_by_id: uuid.UUID | None
    uploaded_by_name: str
