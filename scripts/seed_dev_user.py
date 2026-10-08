#!/usr/bin/env python3
"""Create or reset the local development admin user (idempotent).

Default credentials (local/dev only — never use in production):

  Email:    dev@example.com
  Password: devpassword
  Role:     admin

Override with DEV_USER_EMAIL / DEV_USER_PASSWORD / DEV_USER_NAME.
Requires DATABASE_URL (or defaults to local docker-compose.dev.yml Postgres).
"""

from __future__ import annotations

import asyncio
import os
import sys

DEFAULT_DATABASE_URL = "postgresql://agentfloor:agentfloor@localhost:5433/agentfloor"
DEFAULT_EMAIL = "dev@example.com"
DEFAULT_PASSWORD = "devpassword"
DEFAULT_NAME = "Local Dev Admin"


def _async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def main() -> int:
    # Ensure backend package imports resolve when run from repo root.
    backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
    sys.path.insert(0, os.path.abspath(backend_dir))

    os.environ.setdefault("DATABASE_URL", DEFAULT_DATABASE_URL)

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.models.user import User, UserRole
    from app.services.auth import hash_password

    email = os.environ.get("DEV_USER_EMAIL", DEFAULT_EMAIL).strip().lower()
    password = os.environ.get("DEV_USER_PASSWORD", DEFAULT_PASSWORD)
    name = os.environ.get("DEV_USER_NAME", DEFAULT_NAME)

    if len(password) < 8:
        print("DEV_USER_PASSWORD must be at least 8 characters", file=sys.stderr)
        return 1

    engine = create_async_engine(_async_url(os.environ["DATABASE_URL"]))
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        row = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if row is None:
            db.add(
                User(
                    email=email,
                    hashed_password=hash_password(password),
                    name=name,
                    role=UserRole.admin,
                )
            )
            action = "created"
        else:
            row.hashed_password = hash_password(password)
            row.name = name
            row.role = UserRole.admin
            db.add(row)
            action = "updated"
        await db.commit()

    await engine.dispose()
    print(f"Dev user {action}: {email} (admin)")
    print("Password: (value of DEV_USER_PASSWORD or default 'devpassword')")
    print("Login at http://localhost:3000/login")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
