"""
Create the primary administrator account.

`app.seed` fills a database with demo fixtures and refuses to run in production.
This script does the one thing a fresh production database actually needs: a user
you can sign in with. Nothing else is written.

    uv run python -m app.create_admin --email you@example.com --password '...'

Credentials can also come from ADMIN_EMAIL / ADMIN_PASSWORD, which is what you
want on Railway:

    railway run python -m app.create_admin
"""

import argparse
import os
import sys

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models import User, UserRole

MIN_PASSWORD_LENGTH = 8


def create_admin(email: str, password: str, full_name: str, reset: bool) -> int:
    email = email.strip().lower()
    if not email or "@" not in email:
        print("A valid --email is required", file=sys.stderr)
        return 1
    if len(password) < MIN_PASSWORD_LENGTH:
        print(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters", file=sys.stderr
        )
        return 1
    if len(password) > 72:
        print("Password must be at most 72 characters", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        existing = db.execute(
            select(User).where(func.lower(User.email) == email)
        ).scalar_one_or_none()

        if existing and not reset:
            print(f"User {email} already exists — pass --reset-password to change it")
            return 0

        if existing:
            existing.password_hash = hash_password(password)
            existing.is_active = True
            existing.role = UserRole.admin
            existing.auth_version += 1
            db.commit()
            print(f"Password updated for {email}")
            return 0

        db.add(
            User(
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=UserRole.admin,
                is_active=True,
            )
        )
        db.commit()
        print(f"Created admin {email}")
        return 0
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the primary administrator account")
    parser.add_argument("--email", default=os.getenv("ADMIN_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("ADMIN_PASSWORD", ""))
    parser.add_argument("--name", default=os.getenv("ADMIN_NAME", "CRM Administrator"))
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="update the password if the user already exists",
    )
    args = parser.parse_args()

    if not args.password:
        print(
            "Set --password or ADMIN_PASSWORD. Nothing was written.", file=sys.stderr
        )
        raise SystemExit(1)

    raise SystemExit(
        create_admin(args.email, args.password, args.name, args.reset_password)
    )


if __name__ == "__main__":
    main()
