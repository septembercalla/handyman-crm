import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import TaskCategory

LeadSource = Literal[
    "thumbtack", "google", "facebook", "tiktok", "website", "phone", "referral", "other"
]
LeadStage = Literal["new", "contacting", "qualified", "booked", "lost"]
ContactOutcome = Literal[
    "answered", "no_answer", "voicemail", "texted", "call_back_later", "wrong_number"
]
ContactMethod = Literal["call", "text", "thumbtack_message", "email", "other"]
NextAction = Literal[
    "call_customer",
    "send_text",
    "ask_for_photos",
    "send_estimate",
    "follow_up",
    "waiting_for_photos",
    "waiting_for_decision",
    "schedule_job",
    "no_action",
]
LostReason = Literal[
    "no_response",
    "price_too_high",
    "price_inquiry_only",
    "hired_someone_else",
    "not_interested",
    "project_postponed",
    "outside_service_area",
    "not_our_service",
    "licensed_trade_required",
    "job_below_minimum",
    "schedule_conflict",
    "duplicate_lead",
    "fake_bad_lead",
    "wrong_contact_info",
    "stopped_responding_after_estimate",
    "other",
]
RefundStatus = Literal["not_requested", "requested", "approved", "denied"]
PropertyType = Literal["home", "apartment_condo", "commercial", "other"]
QuoteType = Literal["not_quoted", "fixed", "range"]
Attention = Literal["new", "due_today", "overdue", "no_answer", "stale", "needs_follow_up"]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


class LeadFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    source: LeadSource | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)
    external_reference: str | None = Field(default=None, max_length=255)
    service_requested: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=10000)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Z]{2}$")
    property_type: PropertyType | None = None
    job_summary: str | None = Field(default=None, min_length=1, max_length=500)
    zip_code: str | None = Field(default=None, max_length=16)
    original_request: str | None = Field(default=None, max_length=10000)
    source_lead_id: str | None = Field(default=None, max_length=255)
    source_url: str | None = Field(default=None, max_length=2048)
    lead_cost: Money | None = None
    refund_status: RefundStatus | None = None

    @field_validator("state", mode="before")
    @classmethod
    def normalize_state(cls, value):
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("phone", "source_lead_id", "source_url", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("source_url")
    @classmethod
    def safe_source_url(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme not in {"https", "http"} or not parsed.hostname:
                raise ValueError("Source URL must be an http or https URL")
        return value


class LeadCreate(LeadFields):
    source: LeadSource
    name: str = Field(min_length=1, max_length=255)
    service_requested: str = Field(min_length=1, max_length=255)
    notes: str = Field(default="", max_length=10000)

    city: str = Field(min_length=1, max_length=128)
    state: str = Field(min_length=2, max_length=2, pattern=r"^[A-Z]{2}$")
    zip_code: str = Field(min_length=1, max_length=16)
    job_summary: str = Field(min_length=1, max_length=500)


class LeadUpdate(LeadFields):
    @model_validator(mode="after")
    def reject_null_required_columns(self):
        for field in {"source", "name", "service_requested", "notes"} & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class LeadEconomics(BaseModel):
    job_value: Decimal | None = None
    revenue_after_lead_cost: Decimal | None = None
    roas: Decimal | None = None
    lost_result: Decimal | None = None


class DispatcherOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str


class AssignmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assigned_dispatcher_id: uuid.UUID


class LeadOut(LeadFields):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    source: LeadSource
    name: str
    service_requested: str | None = None  # Legacy inquiries may not have a service yet.
    notes: str
    stage: LeadStage
    latest_contact_outcome: ContactOutcome | None
    last_contact_method: ContactMethod | None
    next_action: NextAction | None
    received_at: datetime
    first_contacted_at: datetime | None
    last_contacted_at: datetime | None
    next_follow_up_at: datetime | None
    booked_at: datetime | None
    qualified_at: datetime | None
    lost_at: datetime | None
    last_activity_at: datetime
    contact_attempts: int
    converted_customer_id: uuid.UUID | None
    converted_task_id: uuid.UUID | None
    lost_reason: LostReason | None
    lost_note: str | None
    quote_type: QuoteType
    quoted_min: Money | None
    quoted_max: Money | None
    quoted_fixed_price: Money | None
    materials_included: bool | None
    quote_sent_at: datetime | None
    assigned_dispatcher_id: uuid.UUID | None
    assigned_at: datetime | None
    assigned_dispatcher_name: str | None = None
    economics: LeadEconomics = Field(default_factory=LeadEconomics)
    follow_up_state: Literal["none", "scheduled", "due_today", "overdue"] = "none"
    created_at: datetime
    updated_at: datetime


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_type: str
    timestamp: datetime
    user_id: uuid.UUID | None
    user_name: str
    note: str


class NoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    note: str = Field(default="", max_length=2000)


class ContactInput(NoteInput):
    outcome: ContactOutcome
    method: ContactMethod = "call"
    next_follow_up_at: datetime | None = None


class FollowUpInput(NoteInput):
    next_follow_up_at: datetime | None


class NextActionInput(NoteInput):
    next_action: NextAction | None


class LostInput(NoteInput):
    reason: LostReason


class QuoteInput(NoteInput):
    quote_type: Literal["fixed", "range"]
    quoted_fixed_price: Money | None = None
    quoted_min: Money | None = None
    quoted_max: Money | None = None
    materials_included: bool | None = None

    @model_validator(mode="after")
    def validate_prices(self):
        if self.quote_type == "fixed":
            if (
                self.quoted_fixed_price is None
                or self.quoted_min is not None
                or self.quoted_max is not None
            ):
                raise ValueError("Fixed quote requires only a fixed price")
        elif (
            self.quoted_fixed_price is not None
            or self.quoted_min is None
            or self.quoted_max is None
        ):
            raise ValueError("Range quote requires min and max, without fixed price")
        elif self.quoted_min > self.quoted_max:
            raise ValueError("Quote minimum must not exceed maximum")
        return self


class BookLeadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    customer_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    category: TaskCategory = TaskCategory.general
    handyman_id: uuid.UUID | None = None
    scheduled_date: date
    time_window_start: time
    time_window_end: time
    street_address: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    state: str = Field(min_length=2, max_length=2)
    zip: str = Field(min_length=1, max_length=16)

    @field_validator("time_window_start", "time_window_end")
    @classmethod
    def business_wall_time(cls, value):
        if value.tzinfo is not None:
            raise ValueError("Use business local time without a timezone offset")
        return value

    @model_validator(mode="after")
    def ordered_schedule(self):
        if self.time_window_end <= self.time_window_start:
            raise ValueError("End time must be after start time")
        return self
