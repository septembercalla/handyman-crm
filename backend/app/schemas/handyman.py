import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import HandymanStatus, TaskCategory


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


class HandymanOut(HandymanBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
