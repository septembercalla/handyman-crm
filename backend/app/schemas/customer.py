import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = ""
    email: str = ""
    street_address: str = ""
    city: str = ""
    state: str = Field(default="", max_length=2)
    zip: str = ""
    notes: str = ""


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    email: str | None = None
    street_address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip: str | None = None
    notes: str | None = None


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
