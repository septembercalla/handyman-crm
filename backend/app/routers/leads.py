import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.models import Customer, Task, TaskStatus, User, UserRole
from app.models.lead import Lead, LeadActivity
from app.schemas.common import Paginated
from app.schemas.lead import (
    ActivityOut,
    AssignmentInput,
    Attention,
    BookLeadInput,
    ContactInput,
    ContactOutcome,
    DispatcherOut,
    FollowUpInput,
    LeadCreate,
    LeadEconomics,
    LeadOut,
    LeadSource,
    LeadStage,
    LeadUpdate,
    LostInput,
    NextAction,
    NextActionInput,
    NoteInput,
    QuoteInput,
)
from app.services import operations
from app.services.financials import customer_total
from app.services.tasks import (
    assign_task,
    next_task_number,
    record_status_change,
    refresh_coordinates,
)

router = APIRouter(prefix="/leads", tags=["leads"])


def get_lead(db, lead_id, *, lock=False):
    stmt = select(Lead).where(Lead.id == lead_id)
    lead = db.scalar(stmt.with_for_update() if lock else stmt)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    return lead


def require_open(lead):
    if lead.stage in {"booked", "lost"}:
        raise HTTPException(409, "This lead is already booked or lost")


def event(db, lead, user, kind, now, note=""):
    db.flush()  # Multiple events in one action must each receive a distinct sequence.
    # Mutations hold the lead row lock, so event order is stable even for equal timestamps.
    sequence = (
        db.scalar(select(func.max(LeadActivity.sequence)).where(LeadActivity.lead_id == lead.id))
        or 0
    ) + 1
    lead.last_activity_at = now
    db.add(
        LeadActivity(
            lead_id=lead.id,
            sequence=sequence,
            event_type=kind,
            timestamp=now,
            user_id=user.id,
            user_name=user.full_name,
            note=note,
        )
    )


def output(lead):
    data = LeadOut.model_validate(lead)
    data.follow_up_state = operations.follow_up_state(lead, operations.utcnow())
    owner = lead.assigned_dispatcher
    data.assigned_dispatcher_name = owner.full_name if owner else None
    task = lead.converted_task
    value = customer_total(task.labor_price, task.materials_cost) if task else None
    cost = lead.lead_cost
    data.economics = LeadEconomics(
        job_value=value,
        revenue_after_lead_cost=value - cost if value is not None and cost is not None else None,
        roas=(value / cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if value is not None and cost is not None and cost > 0
        else None,
        lost_result=-cost if lead.stage == "lost" and task is None and cost is not None else None,
    )
    return data


@router.get("/dispatchers", response_model=list[DispatcherOut])
def dispatchers(db: DbSession, _: CurrentUser):
    return db.scalars(
        select(User)
        .where(User.is_active.is_(True), User.role.in_([UserRole.admin, UserRole.dispatcher]))
        .order_by(User.full_name, User.id)
    ).all()


@router.get("", response_model=Paginated[LeadOut])
def list_leads(
    db: DbSession,
    _: CurrentUser,
    source: LeadSource | None = None,
    stage: LeadStage | None = None,
    outcome: ContactOutcome | None = None,
    next_action: NextAction | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    attention: Attention | None = None,
    search: str | None = None,
    customer_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    booked_this_week: bool = False,
    stale_hours: Annotated[int, Query(ge=1, le=8760)] = 48,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
):
    stmt = select(Lead)
    for column, value in (
        (Lead.source, source),
        (Lead.stage, stage),
        (Lead.latest_contact_outcome, outcome),
        (Lead.next_action, next_action),
        (Lead.converted_customer_id, customer_id),
        (Lead.converted_task_id, task_id),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    if date_from:
        stmt = stmt.where(Lead.received_at >= operations.business_midnight(date_from))
    if date_to:
        stmt = stmt.where(
            Lead.received_at < operations.business_midnight(date_to + timedelta(days=1))
        )
    now = operations.utcnow()
    if attention:
        stmt = stmt.where(operations.attention_condition(attention, now, stale_hours))
    if booked_this_week:
        _, _, start, end = operations.business_period(now)
        stmt = stmt.where(Lead.booked_at >= start, Lead.booked_at < end)
    if search:
        stmt = stmt.where(
            or_(
                *[
                    func.lower(column).like(f"%{search.lower()}%")
                    for column in (
                        Lead.name,
                        Lead.phone,
                        Lead.email,
                        Lead.address,
                        Lead.city,
                        Lead.zip_code,
                        Lead.source_lead_id,
                        Lead.service_requested,
                        Lead.job_summary,
                    )
                ]
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(
        stmt.order_by(Lead.received_at.desc(), Lead.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Paginated[LeadOut](
        items=[output(item) for item in items], total=total, page=page, page_size=page_size
    )


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(payload: LeadCreate, db: DbSession, user: CurrentUser):
    now = operations.utcnow()
    lead = Lead(
        **payload.model_dump(),
        received_at=now,
        last_activity_at=now,
        assigned_dispatcher_id=user.id,
        assigned_at=now,
    )
    db.add(lead)
    db.flush()
    event(db, lead, user, "received", now, f"Lead received from {lead.source}")
    event(db, lead, user, "assigned", now, f"Assigned to {user.full_name}")
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.get("/{lead_id}", response_model=LeadOut)
def detail(lead_id: uuid.UUID, db: DbSession, _: CurrentUser):
    return output(get_lead(db, lead_id))


@router.patch("/{lead_id}", response_model=LeadOut)
def edit(lead_id: uuid.UUID, payload: LeadUpdate, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    data = payload.model_dump(exclude_unset=True)
    if lead.booked_at and "source" in data and data["source"] != lead.source:
        raise HTTPException(409, "Source cannot change after booking")
    changed = [key for key, value in data.items() if getattr(lead, key) != value]
    if changed:
        for key in changed:
            setattr(lead, key, data[key])
        event(db, lead, user, "updated", operations.utcnow(), "Updated: " + ", ".join(changed))
        db.commit()
        db.refresh(lead)
    return output(lead)


@router.get("/{lead_id}/activities", response_model=list[ActivityOut])
def activities(lead_id: uuid.UUID, db: DbSession, _: CurrentUser):
    get_lead(db, lead_id)
    return db.scalars(
        select(LeadActivity).where(LeadActivity.lead_id == lead_id).order_by(LeadActivity.sequence)
    ).all()


@router.post("/{lead_id}/contact", response_model=LeadOut)
def contact(lead_id: uuid.UUID, payload: ContactInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    now = operations.utcnow()
    lead.first_contacted_at = lead.first_contacted_at or now
    lead.last_contacted_at = now
    lead.latest_contact_outcome = payload.outcome
    lead.last_contact_method = payload.method
    lead.contact_attempts += 1
    if lead.stage == "new":
        lead.stage = "contacting"
    if "next_follow_up_at" in payload.model_fields_set:
        lead.next_follow_up_at = operations.follow_up_utc(payload.next_follow_up_at)
    note = f"Method: {payload.method}. {payload.note}"
    if "next_follow_up_at" in payload.model_fields_set:
        note += f"; Follow-up: {operations.follow_up_label(lead.next_follow_up_at)}"
    event(db, lead, user, payload.outcome, now, note)
    if "next_follow_up_at" in payload.model_fields_set:
        event(
            db,
            lead,
            user,
            "follow_up_scheduled" if lead.next_follow_up_at else "follow_up_cleared",
            now,
            f"Follow-up: {operations.follow_up_label(lead.next_follow_up_at)}",
        )
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/follow-up", response_model=LeadOut)
def follow_up(lead_id: uuid.UUID, payload: FollowUpInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    lead.next_follow_up_at = operations.follow_up_utc(payload.next_follow_up_at)
    event(
        db,
        lead,
        user,
        "follow_up_scheduled" if lead.next_follow_up_at else "follow_up_cleared",
        operations.utcnow(),
        f"Follow-up: {operations.follow_up_label(lead.next_follow_up_at)}. {payload.note}",
    )
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/lost", response_model=LeadOut)
def lost(lead_id: uuid.UUID, payload: LostInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    now = operations.utcnow()
    lead.stage, lead.lost_reason, lead.next_follow_up_at = "lost", payload.reason, None
    lead.lost_at, lead.lost_note, lead.next_action = now, payload.note or None, "no_action"
    event(db, lead, user, "lost", now, f"{payload.reason}. {payload.note}")
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/book", response_model=LeadOut)
def book(lead_id: uuid.UUID, payload: BookLeadInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    if lead.booked_at:
        return output(lead)  # Repeated clicks cannot create duplicate customers/jobs.
    require_open(lead)
    customer = db.get(Customer, payload.customer_id) if payload.customer_id else None
    if payload.customer_id and customer is None:
        raise HTTPException(404, "Customer not found")
    if customer is None:
        customer = Customer(
            full_name=lead.name,
            phone=lead.phone or "",
            email=lead.email or "",
            street_address=payload.street_address,
            city=payload.city,
            state=payload.state,
            zip=payload.zip,
        )
        db.add(customer)
        db.flush()
    task = Task(
        task_number=next_task_number(db),
        customer_id=customer.id,
        created_by=user.id,
        title=payload.title,
        category=payload.category,
        description=lead.service_requested or "",
        street_address=payload.street_address,
        city=payload.city,
        state=payload.state,
        zip=payload.zip,
        scheduled_date=payload.scheduled_date,
        time_window_start=payload.time_window_start,
        time_window_end=payload.time_window_end,
    )
    db.add(task)
    db.flush()
    record_status_change(db, task, None, TaskStatus.new, user)
    if payload.handyman_id:
        assign_task(db, task, payload.handyman_id, user)
    refresh_coordinates(task)
    now = operations.utcnow()
    lead.stage, lead.booked_at, lead.next_follow_up_at = "booked", now, None
    lead.next_action = "no_action"
    lead.converted_customer_id, lead.converted_task_id = customer.id, task.id
    event(
        db,
        lead,
        user,
        "booked",
        now,
        f"Converted to Task {task.task_number}; "
        f"Customer {customer.full_name}; Source {lead.source}",
    )
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/next-action", response_model=LeadOut)
def next_action(lead_id: uuid.UUID, payload: NextActionInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    if lead.next_action != payload.next_action:
        previous = lead.next_action
        lead.next_action = payload.next_action
        event(
            db,
            lead,
            user,
            "next_action_changed",
            operations.utcnow(),
            f"{previous or 'none'} -> {payload.next_action or 'none'}. {payload.note}",
        )
        db.commit()
        db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/qualify", response_model=LeadOut)
def qualify(lead_id: uuid.UUID, payload: NoteInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    if lead.stage != "qualified":
        now = operations.utcnow()
        lead.stage = "qualified"
        lead.qualified_at = lead.qualified_at or now
        event(db, lead, user, "qualified", now, payload.note)
        db.commit()
        db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/quote", response_model=LeadOut)
def quote(lead_id: uuid.UUID, payload: QuoteInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    require_open(lead)
    for field, value in payload.model_dump(exclude={"note"}).items():
        setattr(lead, field, value)
    now = operations.utcnow()
    lead.quote_sent_at = now
    price = (
        str(payload.quoted_fixed_price)
        if payload.quote_type == "fixed"
        else f"{payload.quoted_min}–{payload.quoted_max}"
    )
    materials = {True: "included", False: "extra", None: "unspecified"}[payload.materials_included]
    event(
        db,
        lead,
        user,
        "quote_recorded",
        now,
        f"{payload.quote_type}: ${price}; materials {materials}. {payload.note}",
    )
    db.commit()
    db.refresh(lead)
    return output(lead)


@router.post("/{lead_id}/assign", response_model=LeadOut)
def assign(lead_id: uuid.UUID, payload: AssignmentInput, db: DbSession, user: CurrentUser):
    lead = get_lead(db, lead_id, lock=True)
    target = db.scalar(
        select(User).where(User.id == payload.assigned_dispatcher_id).with_for_update()
    )
    if (
        target is None
        or not target.is_active
        or target.role not in {UserRole.admin, UserRole.dispatcher}
    ):
        raise HTTPException(422, "Select an active dispatcher or administrator")
    if lead.assigned_dispatcher_id != target.id:
        previous = lead.assigned_dispatcher
        note = (
            f"Reassigned from {previous.full_name} to {target.full_name}"
            if previous
            else f"Assigned to {target.full_name}"
        )
        now = operations.utcnow()
        lead.assigned_dispatcher_id, lead.assigned_at = target.id, now
        event(db, lead, user, "reassigned" if previous else "assigned", now, note)
        db.commit()
        db.refresh(lead)
    return output(lead)
