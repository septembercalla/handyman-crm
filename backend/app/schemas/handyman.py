import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import HandymanDocumentType, HandymanStatus, TaskCategory


class HandymanBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = ""
    email: str = ""
    skills: list[TaskCategory] = Field(default_factory=list)
    #: exposed as a JSON number so it matches the TS type on the frontend
    hourly_rate: float | None = None
    color: str = "#1A6FE0"
    status: HandymanStatus = HandymanStatus.active
    notes: str = ""
    street_address: str = ""
    city: str = ""
    state: str = Field(default="", max_length=2)
    zip: str = ""


class HandymanCreate(HandymanBase):
    pass


class HandymanUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    email: str | None = None
    skills: list[TaskCategory] | None = None
    hourly_rate: float | None = None
    color: str | None = None
    status: HandymanStatus | None = None
    notes: str | None = None
    street_address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip: str | None = None


class HandymanOut(HandymanBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    latitude: float | None
    longitude: float | None
    created_at: datetime
    updated_at: datetime


class HandymanDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    handyman_id: uuid.UUID
    file_name: str
    document_type: HandymanDocumentType
    mime_type: str
    file_size: int
    uploaded_at: datetime
    uploaded_by: uuid.UUID | None
    notes: str
