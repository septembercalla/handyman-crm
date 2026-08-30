"""Safely identify and optionally remove only the fixtures created by ``app.seed``.

The default is a dry run. Applying the cleanup requires both ``--apply`` and an
exact confirmation phrase. User rows are deliberately outside this script's
scope, so the production administrator is never deleted or modified.

    uv run python -m app.cleanup_demo
    uv run python -m app.cleanup_demo --apply --confirm REMOVE_DEMO_FIXTURES
"""

import argparse

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import Customer, Handyman, Task
from app.seed import CUSTOMER_NOTES, CUSTOMERS, HANDYMEN, TASKS

CONFIRMATION = "REMOVE_DEMO_FIXTURES"


def _task_signature(task: Task) -> tuple:
    return (
        task.task_number,
        task.title,
        task.category.value,
        task.priority.value,
        task.description,
    )


def _customer_signature(customer: Customer) -> tuple:
    return (
        customer.full_name,
        customer.phone,
        customer.email,
        customer.street_address,
        customer.city,
        customer.state,
        customer.zip,
        customer.notes,
    )


def _handyman_signature(handyman: Handyman) -> tuple:
    return (
        handyman.full_name,
        handyman.phone,
        handyman.email,
        tuple(handyman.skills),
        int(handyman.hourly_rate) if handyman.hourly_rate is not None else None,
        handyman.color,
        handyman.status.value,
        handyman.notes,
    )


DEMO_TASKS = {
    (f"T-{1001 + index}", row[2], row[3], row[4], row[10])
    for index, row in enumerate(TASKS)
}
DEMO_CUSTOMERS = {
    (
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[5],
        row[6],
        CUSTOMER_NOTES[index % len(CUSTOMER_NOTES)],
    )
    for index, row in enumerate(CUSTOMERS)
}
DEMO_HANDYMEN = {
    (row[0], row[1], row[2], tuple(row[3]), row[4], row[5], row[6], row[7])
    for row in HANDYMEN
}


def cleanup(apply: bool) -> tuple[int, int, int]:
    db = SessionLocal()
    try:
        candidate_numbers = [signature[0] for signature in DEMO_TASKS]
        tasks = list(db.scalars(select(Task).where(Task.task_number.in_(candidate_numbers))))
        matched_tasks = [task for task in tasks if _task_signature(task) in DEMO_TASKS]
        matched_task_ids = [task.id for task in matched_tasks]

        candidate_customer_emails = [signature[2] for signature in DEMO_CUSTOMERS]
        customers = list(
            db.scalars(select(Customer).where(Customer.email.in_(candidate_customer_emails)))
        )
        matched_customers = [
            customer
            for customer in customers
            if _customer_signature(customer) in DEMO_CUSTOMERS
            and not db.execute(
                select(Task.id)
                .where(Task.customer_id == customer.id)
                .where(Task.id.not_in(matched_task_ids) if matched_task_ids else True)
                .limit(1)
            ).first()
        ]

        candidate_handyman_emails = [signature[2] for signature in DEMO_HANDYMEN]
        handymen = list(
            db.scalars(select(Handyman).where(Handyman.email.in_(candidate_handyman_emails)))
        )
        matched_handymen = [
            handyman
            for handyman in handymen
            if _handyman_signature(handyman) in DEMO_HANDYMEN
            and not db.execute(
                select(Task.id)
                .where(Task.handyman_id == handyman.id)
                .where(Task.id.not_in(matched_task_ids) if matched_task_ids else True)
                .limit(1)
            ).first()
        ]

        counts = (len(matched_tasks), len(matched_customers), len(matched_handymen))
        if apply:
            if matched_task_ids:
                db.execute(delete(Task).where(Task.id.in_(matched_task_ids)))
            if matched_customers:
                db.execute(
                    delete(Customer).where(
                        Customer.id.in_([item.id for item in matched_customers])
                    )
                )
            if matched_handymen:
                db.execute(
                    delete(Handyman).where(
                        Handyman.id.in_([item.id for item in matched_handymen])
                    )
                )
            db.commit()
        else:
            db.rollback()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run or remove exact app.seed fixtures")
    parser.add_argument("--apply", action="store_true", help="commit the fixture cleanup")
    parser.add_argument("--confirm", default="", help=f"required with --apply: {CONFIRMATION}")
    args = parser.parse_args()

    if args.apply and args.confirm != CONFIRMATION:
        parser.error(f"--apply requires --confirm {CONFIRMATION}")

    tasks, customers, handymen = cleanup(apply=args.apply)
    mode = "REMOVED" if args.apply else "DRY RUN — would remove"
    print(f"{mode}: {tasks} tasks, {customers} customers, {handymen} handymen")
    print("Users: 0 (user accounts are never touched by this command)")


if __name__ == "__main__":
    main()
