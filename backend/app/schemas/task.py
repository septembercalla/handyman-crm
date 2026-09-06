import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import MaterialsPaidBy, TaskCategory, TaskPriority, TaskStatus
from app.schemas.customer import CustomerOut
from app.schemas.handyman import HandymanOut
from app.schemas.review import ReviewFields
from app.services.financials import (
    customer_total,
    labor_earnings,
    materials_reimbursement,
    total_handyman_payout,
)


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

    labor_price: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2
    )
    materials_cost: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2
    )
    materials_paid_by: MaterialsPaidBy = MaterialsPaidBy.company

    internal_notes: str = ""


class TaskCreate(TaskBase):
    #: leave empty and the backend assigns the next T-#### (SPEC §3)
    task_number: str | None = None
    customer_id: uuid.UUID
    handyman_id: uuid.UUID | None = None
    handyman_payout_percent: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )


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

    labor_price: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2
    )
    materials_cost: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2
    )
    materials_paid_by: MaterialsPaidBy = MaterialsPaidBy.company
    handyman_payout_percent: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )

    internal_notes: str | None = None


class TaskOut(TaskBase, ReviewFields):
    """Task with its relations expanded — what GET /tasks and /tasks/{id} return."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_number: str
    customer_id: uuid.UUID
    handyman_id: uuid.UUID | None
    status: TaskStatus

    latitude: float | None
    longitude: float | None

    handyman_payout_percent: Decimal | None
    customer_total: Decimal = Decimal("0.00")
    handyman_labor_earnings: Decimal | None = None
    materials_reimbursement: Decimal = Decimal("0.00")
    total_handyman_payout: Decimal | None = None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    customer: CustomerOut | None
    handyman: HandymanOut | None

    @model_validator(mode="after")
    def calculate_financials(self) -> "TaskOut":
        self.customer_total = customer_total(self.labor_price, self.materials_cost)
        self.handyman_labor_earnings = labor_earnings(
            self.labor_price, self.handyman_payout_percent
        )
        self.materials_reimbursement = materials_reimbursement(
            self.materials_cost, self.materials_paid_by
        )
        self.total_handyman_payout = total_handyman_payout(
            self.labor_price,
            self.materials_cost,
            self.materials_paid_by,
            self.handyman_payout_percent,
        )
        return self


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
