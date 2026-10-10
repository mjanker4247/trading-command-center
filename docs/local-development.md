# Local development

How to run AgentFloor against a local Postgres and log in with a known admin account.

## Prerequisites

- Docker (for Postgres): `docker compose -f docker-compose.dev.yml up db -d`
- Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 20+
- Git submodules (TradingAgents): `git submodule update --init --recursive`

## Start the stack

```bash
# From the monorepo root
./scripts/dev-stack.sh start
```

This migrates the DB, seeds the local admin user, then starts:

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend  | http://localhost:8000 |
| Postgres | `localhost:5433` (user/db/password: `agentfloor`) |

Useful commands:

```bash
./scripts/dev-stack.sh status
./scripts/dev-stack.sh seed-user   # recreate/reset the local admin
./scripts/dev-stack.sh stop
```

## Login (local / development)

Open **http://localhost:3000/login** and sign in with:

| Field    | Value |
|----------|-------|
| Email    | `dev@example.com` |
| Password | `devpassword` |
| Role     | `admin` |

These credentials are created by `scripts/seed_dev_user.py` (also invoked by `./scripts/dev-stack.sh seed-user` and `start`). The script is **idempotent**: re-running resets the password and ensures the user is an admin.

Override defaults if needed:

```bash
DEV_USER_EMAIL=me@example.com DEV_USER_PASSWORD='your-secret' ./scripts/dev-stack.sh seed-user
```

> **Do not use these credentials in production.** They are for local development and automated checks only. Production installs register the first user as admin (no invite) via `/register`.

## First-user registration (empty database)

If the `users` table is empty and you prefer not to seed:

1. Open http://localhost:3000/register
2. Create any account — the first user automatically becomes `admin`
3. Later users need an invite from **Settings → Team**

## Choosing an LLM (tool calling)

Market and news analysts need models that return structured `tool_calls`. Social sentiment does not. Full guidance: **[llm-tool-calling.md](./llm-tool-calling.md)**. The same summary appears in the UI behind the circular **(i)** next to **LLM Model**.

## Manual backend / frontend

```bash
# Terminal 1 — Postgres
docker compose -f docker-compose.dev.yml up db

# Terminal 2 — API
cd backend
uv sync --group dev --extra markov-hmm
# pyportfolioopt (portfolio Allocation tab) is a core backend dep — included by uv sync
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor \
  uv run alembic upgrade head
../scripts/dev-stack.sh seed-user
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor \
  uv run python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Terminal 3 — UI
cd frontend
npm install
npm run dev
```
