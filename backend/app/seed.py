"""
Demo data for local development: 1 dispatcher, 5 handymen, 14 customers, 32 tasks.

Mirrors the fixtures the frontend used before the backend existed, so switching
`NEXT_PUBLIC_API_URL` on gives you the same screens with the same content.

    uv run python -m app.seed          # fill an empty database
    uv run python -m app.seed --reset  # wipe local-development tables first
"""

import argparse
import sys
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import delete, select

from app.config import settings
from app.core.security import hash_password
from app.database import SessionLocal
from app.models import (
    Customer,
    Handyman,
    Task,
    TaskCategory,
    TaskPriority,
    TaskStatus,
    TaskStatusHistory,
    User,
    UserRole,
)

DEMO_EMAIL = "dispatcher@handyman.crm"
DEMO_PASSWORD = "demo"

HANDYMEN = [
    (
        "Marcus Webb",
        "+1 (615) 555-0142",
        "marcus.webb@example.com",
        ["plumbing", "appliance", "general"],
        65,
        "#1A6FE0",
        "active",
        "Certified for gas appliances. Does not work Sundays.",
    ),
    (
        "Tornike Kiladze",
        "+1 (615) 555-0198",
        "tornike.k@example.com",
        ["electrical", "hvac", "general"],
        72,
        "#1F8A4C",
        "active",
        "Licensed TN electrician. Takes urgent call-outs.",
    ),
    (
        "Dana Ruiz",
        "+1 (615) 555-0177",
        "dana.ruiz@example.com",
        ["carpentry", "painting", "general"],
        58,
        "#C77700",
        "active",
        "Owns finishing tools. Covers the south and east side.",
    ),
    (
        "Priya Nair",
        "+1 (615) 555-0163",
        "priya.nair@example.com",
        ["hvac", "appliance", "electrical"],
        70,
        "#7A3FBF",
        "active",
        "HVAC certified. Prefers morning time windows.",
    ),
    (
        "Eli Barton",
        "+1 (615) 555-0121",
        "eli.barton@example.com",
        ["general", "carpentry", "painting"],
        52,
        "#0E7C8C",
        "inactive",
        "On leave until September 15.",
    ),
]

# full_name, phone, email, street, city, state, zip, lat, lng
CUSTOMERS = [
    ("Helen Prescott", "+1 (615) 555-0301", "helen.p@example.com", "8400 Eastgate Blvd", "Mount Juliet", "TN", "37122", 36.2005, -86.5186),
    ("Ray Coleman", "+1 (615) 555-0302", "ray.coleman@example.com", "1604 Commerce St", "Nashville", "TN", "37203", 36.1583, -86.7908),
    ("Nadia Foster", "+1 (615) 555-0303", "nadia.f@example.com", "845 Belmont Blvd", "Nashville", "TN", "37212", 36.1338, -86.7902),
    ("Gordon Pike", "+1 (615) 555-0304", "gordon.pike@example.com", "2820 Plymouth Rd", "Brentwood", "TN", "37027", 36.0331, -86.7828),
    ("Sofia Marchetti", "+1 (615) 555-0305", "sofia.m@example.com", "1070 Versailles Rd", "Franklin", "TN", "37064", 35.9251, -86.8689),
    ("Wendell Cross", "+1 (615) 555-0306", "wendell.c@example.com", "9600 Telegraph Rd", "Hermitage", "TN", "37076", 36.1867, -86.6122),
    ("Bianca Ortiz", "+1 (615) 555-0307", "bianca.o@example.com", "6600 Dixie Hwy", "Madison", "TN", "37115", 36.2570, -86.7136),
    ("Curtis Hale", "+1 (615) 555-0308", "curtis.hale@example.com", "40445 Van Dyke Ave", "Antioch", "TN", "37013", 36.0595, -86.6722),
    ("Ingrid Salo", "+1 (615) 555-0309", "ingrid.salo@example.com", "312 Rosebank Ave", "Nashville", "TN", "37206", 36.1930, -86.7302),
    ("Terrence Boyd", "+1 (615) 555-0310", "terrence.b@example.com", "77 Charlotte Pike", "Nashville", "TN", "37209", 36.1553, -86.8408),
    ("Marisol Vega", "+1 (615) 555-0311", "marisol.v@example.com", "1215 Gallatin Pike S", "Madison", "TN", "37115", 36.2648, -86.7093),
    ("Owen Whitfield", "+1 (615) 555-0312", "owen.w@example.com", "530 Old Hickory Blvd", "Nashville", "TN", "37138", 36.2489, -86.6206),
    ("Ada Lindqvist", "+1 (615) 555-0313", "ada.l@example.com", "4402 Granny White Pike", "Nashville", "TN", "37204", 36.1063, -86.7929),
    ("Hugo Bennett", "+1 (615) 555-0314", "hugo.bennett@example.com", "990 Murfreesboro Pike", "Nashville", "TN", "37217", 36.1157, -86.6689),
]

# customer_idx, handyman_idx, title, category, priority, status,
# day_offset, start, end, duration_min, description
TASKS = [
    (0, 0, "Kitchen faucet is leaking", "plumbing", "normal", "in_progress", 0, "09:00", "11:00", 90, "Dripping from the base, water pooling in the cabinet."),
    (1, 1, "Living room outlets are dead", "electrical", "high", "in_progress", 0, "09:30", "12:00", 120, "Half the outlets died after a storm, the breaker will not hold."),
    (2, 2, "Replace interior door", "carpentry", "normal", "assigned", 0, "13:00", "16:00", 180, "Door and frame already bought, on site."),
    (3, 3, "AC is not cooling", "hvac", "urgent", "assigned", 0, "08:00", "10:00", 120, "Unit blows warm air, clicks on start-up."),
    (4, 0, "Install dishwasher", "appliance", "normal", "assigned", 0, "12:00", "15:00", 150, "Appliance on site, needs a water line tie-in."),
    (5, 1, "Replace hallway switches", "electrical", "low", "assigned", 0, "14:00", "15:30", 60, "Three single-pole switches."),
    (6, None, "Bathroom drain is clogged", "plumbing", "high", "new", 0, "16:00", "18:00", 60, "Water drains very slowly, smell from the drain."),
    (7, None, "Touch up walls after a leak", "painting", "low", "new", 0, None, None, 120, "Stain on the bedroom ceiling, about 20 sq ft."),
    (8, 0, "Washing machine is leaking", "appliance", "high", "assigned", 0, "16:00", "17:30", 90, "Puddle under the machine after the spin cycle."),
    (9, 0, "Inspect the water heater", "plumbing", "normal", "assigned", 0, "17:45", "19:00", 75, "Routine pre-season check."),
    (10, 1, "Stairway light is out", "electrical", "normal", "assigned", 0, "16:30", "17:30", 60, "Bulb was replaced, no change."),
    (11, 2, "Adjust cabinet hinges", "carpentry", "low", "assigned", 0, "17:00", "18:00", 60, "Cabinet doors hang crooked."),
    (12, 3, "Replace HVAC filters", "hvac", "normal", "assigned", 0, "11:00", "12:00", 60, "Filter set is with the customer."),
    (8, 2, "Assemble kitchen cabinets", "carpentry", "normal", "assigned", 1, "09:00", "17:00", 420, "Flat-packed, instructions included."),
    (9, 3, "HVAC maintenance", "hvac", "normal", "assigned", 1, "10:00", "12:00", 120, "Annual service, filter replacement."),
    (10, 0, "Toilet tank is running", "plumbing", "high", "assigned", 1, "13:00", "14:30", 90, "Water keeps trickling into the bowl."),
    (11, 1, "Hang living room chandelier", "electrical", "normal", "assigned", 1, "15:00", "16:30", 90, "Heavy fixture, needs a concrete anchor."),
    (12, None, "Front door sticks", "carpentry", "normal", "new", 1, "09:00", "11:00", 60, "Door catches the threshold, hinges have sagged."),
    (13, None, "Wall oven will not turn on", "appliance", "high", "new", 1, None, None, 90, "Panel lights up but there is no heat."),
    (0, 1, "Replace breaker in the panel", "electrical", "urgent", "assigned", 2, "08:30", "10:00", 90, "Breaker runs hot, smells of plastic."),
    (3, 2, "Paint the fence", "painting", "low", "assigned", 2, "09:00", "15:00", 300, "60 ft of sections, paint supplied by the customer."),
    (5, None, "Install bathroom faucet", "plumbing", "normal", "new", 2, None, None, 90, "New faucet already purchased."),
    (7, None, "Repair the gate", "general", "low", "new", 3, None, None, 120, "Gate has sagged, the latch will not close."),
    (9, 3, "Clean the AC condenser unit", "hvac", "normal", "assigned", 3, "11:00", "13:00", 120, "Second floor, a ladder is required."),
    (11, None, "Replace hallway laminate", "carpentry", "normal", "new", 4, None, None, 300, "130 sq ft, material arrives Thursday."),
    (13, None, "Inspection after water damage", "general", "high", "new", 4, None, None, 60, "Needs a scope assessment and an estimate."),
    (1, 0, "Replace supply hoses", "plumbing", "normal", "done", -1, "09:00", "10:00", 60, "The kitchen supply hose burst."),
    (4, 1, "Outlet for the washing machine", "electrical", "normal", "done", -1, "11:00", "13:00", 120, "Run a dedicated circuit from the panel."),
    (6, 2, "Repair kitchen cabinet", "carpentry", "low", "done", -1, "14:00", "16:00", 120, "Hinge tore out, the door face is crooked."),
    (8, 3, "Replace thermostat", "hvac", "normal", "done", -2, "09:00", "10:30", 90, "The old thermostat will not hold temperature."),
    (10, 0, "Clear the sink trap", "plumbing", "low", "done", -2, "13:00", "14:00", 60, "Sink was draining slowly."),
    (12, None, "Move a bedroom outlet", "electrical", "low", "cancelled", -2, None, None, 90, "Customer cancelled — postponing the remodel."),
]

CUSTOMER_NOTES = [
    "Gate code 4417. Dog in the yard — call ahead.",
    "Water meter in the basement, key with the neighbour on the right.",
    "",
    "",
]


def _time(value: str | None) -> time | None:
    if not value:
        return None
    hour, minute = (int(p) for p in value.split(":"))
    return time(hour, minute)


def _history_chain(status: TaskStatus) -> list[TaskStatus]:
    chain = [TaskStatus.new]
    if status in {TaskStatus.assigned, TaskStatus.in_progress, TaskStatus.done}:
        chain.append(TaskStatus.assigned)
    if status in {TaskStatus.in_progress, TaskStatus.done}:
        chain.append(TaskStatus.in_progress)
    if status is TaskStatus.done:
        chain.append(TaskStatus.done)
    if status is TaskStatus.cancelled:
        chain.append(TaskStatus.cancelled)
    return chain


def reset(db) -> None:
    db.execute(delete(TaskStatusHistory))
    db.execute(delete(Task))
    db.execute(delete(Customer))
    db.execute(delete(Handyman))
    db.execute(delete(User))
    db.commit()


def run(do_reset: bool = False) -> None:
    db = SessionLocal()
    try:
        if do_reset:
            reset(db)
            print("tables cleared")

        if db.execute(select(Task.id).limit(1)).first():
            print("database already has tasks — nothing to do (use --reset to wipe)")
            return

        user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
        if not user:
            user = User(
                email=DEMO_EMAIL,
                password_hash=hash_password(DEMO_PASSWORD),
                full_name="CRM Administrator",
                role=UserRole.admin,
                is_active=True,
            )
            db.add(user)
            db.flush()

        handymen = []
        for name, phone, email, skills, rate, color, status_value, notes in HANDYMEN:
            handyman = Handyman(
                full_name=name,
                phone=phone,
                email=email,
                skills=skills,
                hourly_rate=rate,
                color=color,
                status=status_value,
                notes=notes,
            )
            db.add(handyman)
            handymen.append(handyman)

        customers = []
        geo: dict[int, tuple[float, float]] = {}
        for i, row in enumerate(CUSTOMERS):
            name, phone, email, street, city, state, zip_code, lat, lng = row
            customer = Customer(
                full_name=name,
                phone=phone,
                email=email,
                street_address=street,
                city=city,
                state=state,
                zip=zip_code,
                notes=CUSTOMER_NOTES[i % 4],
            )
            db.add(customer)
            customers.append(customer)
            geo[i] = (lat, lng)

        db.flush()

        today = date.today()
        now = datetime.now(UTC)

        for i, row in enumerate(TASKS):
            (
                customer_idx,
                handyman_idx,
                title,
                category,
                priority,
                status_value,
                day_offset,
                start,
                end,
                duration,
                description,
            ) = row

            customer = customers[customer_idx]
            lat, lng = geo[customer_idx]
            task_status = TaskStatus(status_value)
            created_at = now - timedelta(hours=(len(TASKS) - i) * 7)

            task = Task(
                task_number=f"T-{1001 + i}",
                customer_id=customer.id,
                handyman_id=handymen[handyman_idx].id if handyman_idx is not None else None,
                title=title,
                category=TaskCategory(category),
                description=description,
                priority=TaskPriority(priority),
                status=task_status,
                street_address=customer.street_address,
                city=customer.city,
                state=customer.state,
                zip=customer.zip,
                # small jitter so stops at the same customer do not overlap
                latitude=round(lat + ((i % 5) - 2) * 0.0015, 6),
                longitude=round(lng + ((i % 7) - 3) * 0.0015, 6),
                scheduled_date=today + timedelta(days=day_offset) if day_offset is not None else None,
                time_window_start=_time(start),
                time_window_end=_time(end),
                estimated_duration_min=duration,
                internal_notes="Customer asks for a call 30 minutes ahead." if i % 5 == 0 else "",
                created_by=user.id,
                created_at=created_at,
                updated_at=created_at,
                started_at=now - timedelta(hours=3)
                if task_status in {TaskStatus.in_progress, TaskStatus.done}
                else None,
                completed_at=now - timedelta(hours=1) if task_status is TaskStatus.done else None,
            )
            db.add(task)
            db.flush()

            chain = _history_chain(task_status)
            previous: TaskStatus | None = None
            for step, to_status in enumerate(chain):
                db.add(
                    TaskStatusHistory(
                        task_id=task.id,
                        from_status=previous,
                        to_status=to_status,
                        changed_by=user.id,
                        changed_at=created_at + timedelta(minutes=45 * step),
                    )
                )
                previous = to_status

        db.commit()
        print(
            f"seeded: 1 user, {len(handymen)} handymen, "
            f"{len(customers)} customers, {len(TASKS)} tasks"
        )
        print(f"login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Handyman CRM database with demo data")
    parser.add_argument("--reset", action="store_true", help="delete existing rows first")
    parser.add_argument(
        "--force", action="store_true", help="allow running when ENV looks like production"
    )
    args = parser.parse_args()

    if settings.is_production and args.reset:
        print(
            "Refusing --reset in production. Use app.cleanup_demo for a "
            "fixture-only dry run instead.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    if settings.is_production and not args.force:
        print(
            "ENV looks like production — refusing to seed demo data "
            "(pass --force if you really mean it).",
            file=sys.stderr,
        )
        raise SystemExit(1)

    run(do_reset=args.reset)


if __name__ == "__main__":
    main()
