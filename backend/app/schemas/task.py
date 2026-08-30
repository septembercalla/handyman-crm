import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TaskCategory, TaskPriority, TaskStatus
from app.schemas.customer import CustomerOut
from app.schemas.handyman import HandymanOut


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category: TaskCategory = TaskCategory.general
    description: str = ""
    priority: TaskPriority = TaskPriority.normal

    street_address: str = ""
    city: str = ""
    state: str = Field(default="", max_length=2)
    zip: str = ""

    scheduled_date: date | None = None
    time_window_start: time | None = None
    time_window_end: time | None = None
    estimated_duration_min: int | None = Field(default=None, ge=0)

    internal_notes: str = ""


class TaskCreate(TaskBase):
    #: leave empty and the backend assigns the next T-#### (SPEC §3)
    task_number: str | None = None
    customer_id: uuid.UUID
    handyman_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    task_number: str | None = None
    customer_id: uuid.UUID | None = None
    handyman_id: uuid.UUID | None = None

    title: str | None = Field(default=None, min_length=1, max_length=255)
    category: TaskCategory | None = None
    description: str | None = None
    priority: TaskPriority | None = None

    street_address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip: str | None = None

    scheduled_date: date | None = None
    time_window_start: time | None = None
    time_window_end: time | None = None
    estimated_duration_min: int | None = Field(default=None, ge=0)

    internal_notes: str | None = None


class TaskOut(TaskBase):
    """Task with its relations expanded — what GET /tasks and /tasks/{id} return."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_number: str
    customer_id: uuid.UUID
    handyman_id: uuid.UUID | None
    status: TaskStatus

    latitude: float | None
    longitude: float | None

    price: float | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    customer: CustomerOut | None
    handyman: HandymanOut | None


class TaskStatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    from_status: TaskStatus | None
    to_status: TaskStatus
    changed_by: uuid.UUID | None
    changed_by_name: str
    changed_at: datetime


class AssignRequest(BaseModel):
    handyman_id: uuid.UUID | None = None


class SetStatusRequest(BaseModel):
    status: TaskStatus
