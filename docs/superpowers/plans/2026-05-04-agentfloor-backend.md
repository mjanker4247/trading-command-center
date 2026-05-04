# AgentFloor — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend for AgentFloor — auth, run management, TradingAgents integration with real-time WebSocket streaming, and PostgreSQL persistence.

**Architecture:** FastAPI app with async SQLAlchemy + PostgreSQL. TradingAgents runs in a thread pool via `asyncio.to_thread`; a sync LangChain callback bridges events into an `asyncio.Queue` that persists and broadcasts to WebSocket subscribers. API keys stored AES-256 encrypted. JWT auth with Google OAuth support.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 (async), asyncpg, Alembic, bcrypt, PyJWT, cryptography (Fernet), httpx (test client), pytest-asyncio, TradingAgents (GitHub install)

---

## File Map

```
backend/
├── pyproject.toml
├── main.py
├── .env.example
├── Dockerfile
├── alembic.ini
├── alembic/versions/
├── app/
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── models/
│   │   ├── user.py
│   │   ├── run.py
│   │   ├── agent_event.py
│   │   ├── report.py
│   │   └── api_key.py
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── run.py
│   │   ├── api_key.py
│   │   └── user.py
│   ├── services/
│   │   ├── encryption.py
│   │   ├── auth.py
│   │   ├── email.py
│   │   ├── websocket_manager.py
│   │   ├── job_manager.py
│   │   └── trading_agent_runner.py
│   └── routers/
│       ├── auth.py
│       ├── runs.py
│       ├── api_keys.py
│       └── users.py
└── tests/
    ├── conftest.py
    ├── test_auth.py
    ├── test_runs.py
    ├── test_encryption.py
    └── test_websocket_manager.py
```

---

### Task 1: Project scaffold

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/main.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "agentfloor-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.29",
    "alembic>=1.13",
    "pydantic-settings>=2.3",
    "bcrypt>=4.1",
    "PyJWT>=2.8",
    "cryptography>=42.0",
    "httpx>=0.27",
    "python-multipart>=0.0.9",
    "aiosmtplib>=3.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-httpx>=0.30",
]
```

- [ ] **Step 2: Create `backend/.env.example`**

```
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5432/agentfloor
JWT_SECRET=change-me-32-chars-minimum-secret
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@agentfloor.local
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 3: Create `backend/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, runs, api_keys, users

app = FastAPI(title="AgentFloor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(runs.router, tags=["runs"])
app.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
app.include_router(users.router, prefix="/users", tags=["users"])

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: backend project scaffold"
```

---

### Task 2: Config and database

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_config.py
def test_settings_loads():
    from app.config import settings
    assert settings.jwt_secret != ""
    assert len(settings.encryption_key) == 64  # 32 bytes hex
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && python -m pytest tests/test_config.py -v
```
Expected: `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 3: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://agentfloor:agentfloor@localhost:5432/agentfloor"
    jwt_secret: str = "dev-secret-change-in-production"
    encryption_key: str = "0" * 64
    google_client_id: str = ""
    google_client_secret: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@agentfloor.local"
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 4: Create `backend/app/database.py`**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(_async_url(settings.database_url), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 5: Run test — expect PASS**

```bash
python -m pytest tests/test_config.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/database.py tests/test_config.py
git commit -m "feat: config and async database engine"
```

---

### Task 3: SQLAlchemy models

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/run.py`
- Create: `backend/app/models/agent_event.py`
- Create: `backend/app/models/report.py`
- Create: `backend/app/models/api_key.py`

- [ ] **Step 1: Create `backend/app/models/user.py`**

```python
import uuid, enum
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.member)
    google_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Create `backend/app/models/run.py`**

```python
import uuid, enum
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Enum as SAEnum, DateTime, Date, ARRAY, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    aborted = "aborted"
    failed = "failed"

class RunVerdict(str, enum.Enum):
    buy = "buy"
    sell = "sell"
    hold = "hold"

class Run(Base):
    __tablename__ = "runs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    ticker: Mapped[str] = mapped_column(String(16))
    analysis_date: Mapped[date] = mapped_column(Date)
    llm_provider: Mapped[str] = mapped_column(String)
    llm_model: Mapped[str] = mapped_column(String)
    depth: Mapped[str] = mapped_column(String)  # quick|standard|deep
    analysts: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[RunStatus] = mapped_column(SAEnum(RunStatus), default=RunStatus.pending)
    verdict: Mapped[RunVerdict | None] = mapped_column(SAEnum(RunVerdict), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 3: Create `backend/app/models/agent_event.py`**

```python
import uuid, enum
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class EventType(str, enum.Enum):
    started = "started"
    token = "token"
    completed = "completed"
    error = "error"

class AgentEvent(Base):
    __tablename__ = "agent_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"), index=True)
    agent_name: Mapped[str] = mapped_column(String)
    event_type: Mapped[EventType] = mapped_column(SAEnum(EventType))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    sequence: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Create `backend/app/models/report.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.run import RunVerdict

class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("run_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"), unique=True)
    trader_decision: Mapped[str] = mapped_column(String)
    verdict: Mapped[RunVerdict] = mapped_column(SAEnum(RunVerdict))
    suggested_entry: Mapped[str | None] = mapped_column(String, nullable=True)
    suggested_stop: Mapped[str | None] = mapped_column(String, nullable=True)
    suggested_target: Mapped[str | None] = mapped_column(String, nullable=True)
    risk_assessment: Mapped[str] = mapped_column(String, default="")
    raw_report: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 5: Create `backend/app/models/api_key.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String, unique=True, index=True)
    encrypted_key: Mapped[str] = mapped_column(String)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/
git commit -m "feat: SQLAlchemy models for all 5 tables"
```

---

### Task 4: Alembic migrations

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_initial.py`

- [ ] **Step 1: Initialize Alembic**

```bash
cd backend && alembic init alembic
```

- [ ] **Step 2: Edit `backend/alembic/env.py` — replace the `target_metadata` block**

```python
# At top of env.py, replace the metadata import section with:
from app.database import Base
from app.models import user, run, agent_event, report, api_key  # noqa: F401 — registers models
from app.config import settings

target_metadata = Base.metadata

# In run_migrations_online(), replace connectable setup with:
connectable = create_engine(
    settings.database_url,  # sync URL for Alembic
)
```

- [ ] **Step 3: Generate initial migration**

```bash
alembic revision --autogenerate -m "initial schema"
```

Expected output: `Generating .../alembic/versions/xxxx_initial_schema.py`

- [ ] **Step 4: Apply migration (requires running Postgres)**

Start Postgres via Docker:
```bash
docker run -d --name agentfloor-db \
  -e POSTGRES_USER=agentfloor \
  -e POSTGRES_PASSWORD=agentfloor \
  -e POSTGRES_DB=agentfloor \
  -p 5432:5432 postgres:16
```

Apply:
```bash
alembic upgrade head
```
Expected: `Running upgrade -> xxxx, initial schema`

- [ ] **Step 5: Commit**

```bash
git add alembic/ alembic.ini
git commit -m "feat: Alembic initial migration — all 5 tables"
```

---

### Task 5: Encryption service

**Files:**
- Create: `backend/app/services/encryption.py`
- Test: `backend/tests/test_encryption.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_encryption.py
from app.services.encryption import encrypt_key, decrypt_key

def test_round_trip():
    original = "sk-proj-abc123"
    assert decrypt_key(encrypt_key(original)) == original

def test_different_ciphertext_each_time():
    key = "sk-proj-abc123"
    assert encrypt_key(key) != encrypt_key(key)  # Fernet uses random IV
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_encryption.py -v
```

- [ ] **Step 3: Create `backend/app/services/encryption.py`**

```python
import base64
from cryptography.fernet import Fernet
from app.config import settings

def _fernet() -> Fernet:
    raw = bytes.fromhex(settings.encryption_key)
    return Fernet(base64.urlsafe_b64encode(raw))

def encrypt_key(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()

def decrypt_key(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
```

- [ ] **Step 4: Run — expect PASS**

```bash
python -m pytest tests/test_encryption.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/encryption.py backend/tests/test_encryption.py
git commit -m "feat: AES-256 (Fernet) encryption service for API keys"
```

---

### Task 6: Auth service (JWT + bcrypt)

**Files:**
- Create: `backend/app/services/auth.py`
- Test: `backend/tests/test_auth_service.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_auth_service.py
from app.services.auth import hash_password, verify_password, create_access_token, decode_access_token
import uuid

def test_password_round_trip():
    pw = "hunter2"
    assert verify_password(pw, hash_password(pw))

def test_wrong_password_fails():
    assert not verify_password("wrong", hash_password("right"))

def test_jwt_round_trip():
    uid = str(uuid.uuid4())
    token = create_access_token(uid, "admin")
    payload = decode_access_token(token)
    assert payload["sub"] == uid
    assert payload["role"] == "admin"
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_auth_service.py -v
```

- [ ] **Step 3: Create `backend/app/services/auth.py`**

```python
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from app.config import settings

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(user_id: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "role": role, "exp": exp}, settings.jwt_secret, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
```

- [ ] **Step 4: Run — expect PASS**

```bash
python -m pytest tests/test_auth_service.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth.py backend/tests/test_auth_service.py
git commit -m "feat: JWT + bcrypt auth service"
```

---

### Task 7: Email service

**Files:**
- Create: `backend/app/services/email.py`

- [ ] **Step 1: Create `backend/app/services/email.py`**

```python
import aiosmtplib
from email.message import EmailMessage
from app.config import settings

async def send_invite_email(to: str, invite_url: str) -> None:
    if not settings.smtp_host:
        print(f"[email stub] Invite URL for {to}: {invite_url}")
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = "You're invited to AgentFloor"
    msg.set_content(f"Click to join AgentFloor:\n{invite_url}\n\nThis link expires in 48 hours.")
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=True,
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/email.py
git commit -m "feat: async email service for invite links"
```

---

### Task 8: WebSocket manager

**Files:**
- Create: `backend/app/services/websocket_manager.py`
- Test: `backend/tests/test_websocket_manager.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_websocket_manager.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.websocket_manager import WebSocketManager

@pytest.mark.asyncio
async def test_broadcast_sends_to_all_subscribers():
    manager = WebSocketManager()
    ws1, ws2 = AsyncMock(), AsyncMock()
    ws1.accept, ws2.accept = AsyncMock(), AsyncMock()
    await manager.connect("run-1", ws1)
    await manager.connect("run-1", ws2)
    await manager.broadcast("run-1", {"type": "token"})
    ws1.send_json.assert_awaited_once_with({"type": "token"})
    ws2.send_json.assert_awaited_once_with({"type": "token"})

@pytest.mark.asyncio
async def test_broadcast_ignores_dead_connections():
    manager = WebSocketManager()
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.send_json.side_effect = Exception("disconnected")
    await manager.connect("run-2", ws)
    await manager.broadcast("run-2", {"type": "token"})  # should not raise
    assert len(manager._connections["run-2"]) == 0
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_websocket_manager.py -v
```

- [ ] **Step 3: Create `backend/app/services/websocket_manager.py`**

```python
from collections import defaultdict
from fastapi import WebSocket

class WebSocketManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, run_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[run_id].append(ws)

    def disconnect(self, run_id: str, ws: WebSocket) -> None:
        try:
            self._connections[run_id].remove(ws)
        except ValueError:
            pass

    async def broadcast(self, run_id: str, data: dict) -> None:
        dead = []
        for ws in list(self._connections[run_id]):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(run_id, ws)

ws_manager = WebSocketManager()
```

- [ ] **Step 4: Run — expect PASS**

```bash
python -m pytest tests/test_websocket_manager.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/websocket_manager.py backend/tests/test_websocket_manager.py
git commit -m "feat: per-run WebSocket broadcast manager"
```

---

### Task 9: Job manager

**Files:**
- Create: `backend/app/services/job_manager.py`

- [ ] **Step 1: Create `backend/app/services/job_manager.py`**

```python
import asyncio

_running_tasks: dict[str, asyncio.Task] = {}

async def start_run(run_id: str, config: dict) -> None:
    from app.services.trading_agent_runner import execute_run
    task = asyncio.create_task(execute_run(run_id, config))
    _running_tasks[run_id] = task
    task.add_done_callback(lambda _: _running_tasks.pop(run_id, None))

def abort_run(run_id: str) -> bool:
    task = _running_tasks.get(run_id)
    if task and not task.done():
        task.cancel()
        return True
    return False

def is_running(run_id: str) -> bool:
    return run_id in _running_tasks
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/job_manager.py
git commit -m "feat: asyncio job manager for run lifecycle"
```

---

### Task 10: TradingAgents runner

**Files:**
- Create: `backend/app/services/trading_agent_runner.py`

- [ ] **Step 1: Discover the TradingAgents API**

```bash
pip install "tradingagents @ git+https://github.com/TauricResearch/TradingAgents.git"
python -c "from tradingagents.graph.trading_graph import TradingAgentsGraph; import inspect; print(inspect.signature(TradingAgentsGraph.__init__)); ta = TradingAgentsGraph(); print([m for m in dir(ta) if not m.startswith('_')])"
```

Read the output and note:
- Exact constructor signature for `TradingAgentsGraph`
- The method name that runs the analysis (likely `propagate` or `run`)
- Whether it accepts a `callbacks` kwarg

If `callbacks` is not supported, check `tradingagents/graph/trading_graph.py` for how it calls LangGraph's `.invoke()` or `.stream()`, then patch via `RunnableConfig`:
```python
from langchain_core.runnables import RunnableConfig
config = RunnableConfig(callbacks=[emitter])
result = graph.propagate(ticker, date, config=config)
```

- [ ] **Step 2: Create `backend/app/services/trading_agent_runner.py`**

```python
import asyncio
from queue import Queue as SyncQueue
from datetime import datetime, timezone
from langchain_core.callbacks import BaseCallbackHandler

AGENT_NODES = {
    "fundamentals_analyst", "sentiment_analyst", "news_analyst",
    "technical_analyst", "bull_researcher", "bear_researcher",
    "trader", "risk_manager",
}

class _SyncEmitter(BaseCallbackHandler):
    """Sync LangChain callback that enqueues events into a thread-safe queue."""

    def __init__(self, queue: SyncQueue):
        self._q = queue
        self._current: str | None = None

    def on_chain_start(self, serialized, inputs, **kwargs):
        name = (kwargs.get("name") or "").lower().replace(" ", "_")
        if name in AGENT_NODES:
            self._current = name
            self._q.put_nowait({"type": "started", "agent": name})

    def on_llm_new_token(self, token: str, **kwargs):
        if self._current:
            self._q.put_nowait({"type": "token", "agent": self._current, "token": token})

    def on_chain_end(self, outputs, **kwargs):
        if self._current:
            summary = str(outputs)[:500] if outputs else ""
            self._q.put_nowait({"type": "completed", "agent": self._current, "summary": summary})
            self._current = None

    def on_chain_error(self, error, **kwargs):
        agent = self._current or ""
        self._q.put_nowait({"type": "error", "agent": agent, "message": str(error)})
        self._current = None


async def execute_run(run_id: str, config: dict) -> None:
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from langchain_core.runnables import RunnableConfig
    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus, RunVerdict
    from app.models.agent_event import AgentEvent, EventType
    from app.models.report import Report
    from app.services.websocket_manager import ws_manager

    sync_q: SyncQueue = SyncQueue()
    async_q: asyncio.Queue = asyncio.Queue()
    sequence = [0]

    async def _drain():
        while True:
            await asyncio.sleep(0.05)
            while not sync_q.empty():
                await async_q.put(sync_q.get_nowait())

    async def _process():
        while True:
            event = await async_q.get()
            if event is None:
                break
            sequence[0] += 1
            event["sequence"] = sequence[0]
            async with AsyncSessionLocal() as db:
                db.add(AgentEvent(
                    run_id=run_id,
                    agent_name=event.get("agent", ""),
                    event_type=EventType(event["type"]),
                    payload=event,
                    sequence=sequence[0],
                ))
                await db.commit()
            await ws_manager.broadcast(run_id, event)

    async def _set_status(status: RunStatus, verdict: RunVerdict | None = None):
        async with AsyncSessionLocal() as db:
            run = await db.get(Run, run_id)
            run.status = status
            if verdict:
                run.verdict = verdict
            if status == RunStatus.running:
                run.started_at = datetime.now(timezone.utc)
            elif status in (RunStatus.completed, RunStatus.aborted, RunStatus.failed):
                run.completed_at = datetime.now(timezone.utc)
            await db.commit()

    await _set_status(RunStatus.running)
    emitter = _SyncEmitter(sync_q)
    drain_task = asyncio.create_task(_drain())
    process_task = asyncio.create_task(_process())

    try:
        graph = TradingAgentsGraph()
        # NOTE: adjust constructor args based on Task 10 Step 1 discovery
        lc_config = RunnableConfig(callbacks=[emitter])
        result = await asyncio.to_thread(
            graph.propagate,
            config["ticker"],
            config["analysis_date"],
            config=lc_config,
        )
        await async_q.put(None)  # sentinel
        await process_task

        verdict = _parse_verdict(result)
        async with AsyncSessionLocal() as db:
            db.add(Report(
                run_id=run_id,
                trader_decision=str(result.get("trader_decision", "")),
                verdict=verdict,
                suggested_entry=result.get("suggested_entry"),
                suggested_stop=result.get("suggested_stop"),
                suggested_target=result.get("suggested_target"),
                risk_assessment=str(result.get("risk_assessment", "")),
                raw_report=result if isinstance(result, dict) else {},
            ))
            await db.commit()

        await _set_status(RunStatus.completed, verdict)
        await ws_manager.broadcast(run_id, {"type": "run_completed", "run_id": run_id})

    except asyncio.CancelledError:
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.aborted)
        await ws_manager.broadcast(run_id, {"type": "run_aborted", "run_id": run_id})

    except Exception as exc:
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.failed)
        await ws_manager.broadcast(run_id, {"type": "error", "message": str(exc)})

    finally:
        drain_task.cancel()


def _parse_verdict(result: dict) -> "RunVerdict":
    from app.models.run import RunVerdict
    raw = str(result.get("decision", result.get("action", "hold"))).lower()
    if "buy" in raw:
        return RunVerdict.buy
    if "sell" in raw:
        return RunVerdict.sell
    return RunVerdict.hold
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/trading_agent_runner.py
git commit -m "feat: TradingAgents runner with LangGraph callback bridge"
```

---

### Task 11: FastAPI dependencies

**Files:**
- Create: `backend/app/dependencies.py`

- [ ] **Step 1: Create `backend/app/dependencies.py`**

```python
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.services.auth import decode_access_token
from app.models.user import User, UserRole
import jwt

bearer = HTTPBearer()

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user

async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin required")
    return user
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/dependencies.py
git commit -m "feat: FastAPI JWT auth dependencies"
```

---

### Task 12: Auth router

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/routers/auth.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Create `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel, EmailStr

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    invite_token: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class InviteRequest(BaseModel):
    email: EmailStr
```

- [ ] **Step 2: Write failing test**

```python
# tests/test_auth.py
import pytest
from httpx import AsyncClient, ASGITransport
from main import app

@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post("/auth/register", json={
            "email": "test@example.com", "password": "password123", "name": "Test User"
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

        r2 = await client.post("/auth/login", json={
            "email": "test@example.com", "password": "password123"
        })
        assert r2.status_code == 200
        assert "access_token" in r2.json()

@pytest.mark.asyncio
async def test_wrong_password_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/auth/register", json={
            "email": "test2@example.com", "password": "correct", "name": "Test"
        })
        r = await client.post("/auth/login", json={
            "email": "test2@example.com", "password": "wrong"
        })
        assert r.status_code == 401
```

- [ ] **Step 3: Create `backend/app/routers/auth.py`**

```python
import uuid, secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, InviteRequest
from app.services.auth import hash_password, verify_password, create_access_token
from app.services.email import send_invite_email
from app.dependencies import get_current_user, require_admin
from app.config import settings

router = APIRouter()

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    count_result = await db.execute(select(func.count()).select_from(User))
    is_first_user = count_result.scalar() == 0

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        name=req.name,
        role=UserRole.admin if is_first_user else UserRole.member,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id), user.role.value))

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return TokenResponse(access_token=create_access_token(str(user.id), user.role.value))

@router.post("/invite")
async def invite(req: InviteRequest, _admin: User = Depends(require_admin)):
    token = secrets.token_urlsafe(32)
    invite_url = f"{settings.frontend_url}/register?token={token}"
    await send_invite_email(req.email, invite_url)
    return {"message": f"Invite sent to {req.email}"}

@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": str(user.id), "email": user.email, "name": user.name, "role": user.role}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python -m pytest tests/test_auth.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/routers/auth.py backend/tests/test_auth.py
git commit -m "feat: auth routes — register, login, invite, /me"
```

---

### Task 13: Runs router

**Files:**
- Create: `backend/app/schemas/run.py`
- Create: `backend/app/routers/runs.py`
- Test: `backend/tests/test_runs.py`

- [ ] **Step 1: Create `backend/app/schemas/run.py`**

```python
from pydantic import BaseModel
from datetime import date, datetime
from uuid import UUID

class RunCreateRequest(BaseModel):
    ticker: str
    analysis_date: date
    llm_provider: str
    llm_model: str
    depth: str  # quick|standard|deep
    analysts: list[str] = ["fundamentals", "sentiment", "news", "technical"]
    label: str | None = None

class RunResponse(BaseModel):
    id: UUID
    ticker: str
    analysis_date: date
    llm_provider: str
    llm_model: str
    depth: str
    analysts: list[str]
    label: str | None
    status: str
    verdict: str | None
    created_by: UUID
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Create `backend/app/routers/runs.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import get_db
from app.models.run import Run, RunStatus
from app.models.agent_event import AgentEvent
from app.schemas.run import RunCreateRequest, RunResponse
from app.services.websocket_manager import ws_manager
from app.services.job_manager import start_run, abort_run
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    ticker: str | None = Query(None),
    verdict: str | None = Query(None),
    user_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    q = select(Run).order_by(Run.created_at.desc())
    if ticker:
        q = q.where(Run.ticker.ilike(ticker))
    if verdict:
        q = q.where(Run.verdict == verdict)
    if user_id:
        q = q.where(Run.created_by == user_id)
    result = await db.execute(q)
    return result.scalars().all()

@router.post("/runs", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    req: RunCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    run = Run(
        created_by=user.id,
        ticker=req.ticker.upper(),
        analysis_date=req.analysis_date,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        depth=req.depth,
        analysts=req.analysts,
        label=req.label,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    await start_run(str(run.id), {
        "ticker": run.ticker,
        "analysis_date": str(run.analysis_date),
        "llm_provider": run.llm_provider,
        "llm_model": run.llm_model,
        "depth": run.depth,
        "analysts": run.analysts,
    })
    return run

@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run

@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def abort_run_endpoint(run_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if str(run.created_by) != str(user.id) and user.role.value != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    abort_run(str(run_id))

@router.get("/runs/{run_id}/events")
async def get_run_events(run_id: UUID, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    result = await db.execute(
        select(AgentEvent).where(AgentEvent.run_id == run_id).order_by(AgentEvent.sequence)
    )
    events = result.scalars().all()
    return [{"type": e.event_type, "agent": e.agent_name, "payload": e.payload, "sequence": e.sequence} for e in events]

@router.websocket("/ws/runs/{run_id}")
async def run_websocket(run_id: str, ws: WebSocket):
    await ws_manager.connect(run_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep alive — client sends pings
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, ws)
```

- [ ] **Step 3: Write failing test**

```python
# tests/test_runs.py
import pytest
from httpx import AsyncClient, ASGITransport
from main import app

async def _get_token(client, email="runs@test.com"):
    await client.post("/auth/register", json={"email": email, "password": "pw", "name": "Test"})
    r = await client.post("/auth/login", json={"email": email, "password": "pw"})
    return r.json()["access_token"]

@pytest.mark.asyncio
async def test_list_runs_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/runs")
        assert r.status_code == 403

@pytest.mark.asyncio
async def test_list_runs_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _get_token(client, "runs2@test.com")
        r = await client.get("/runs", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python -m pytest tests/test_runs.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/run.py backend/app/routers/runs.py backend/tests/test_runs.py
git commit -m "feat: runs CRUD routes and WebSocket endpoint"
```

---

### Task 14: API keys and users routers

**Files:**
- Create: `backend/app/schemas/api_key.py`
- Create: `backend/app/routers/api_keys.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/routers/users.py`

- [ ] **Step 1: Create `backend/app/schemas/api_key.py`**

```python
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class ApiKeyUpsertRequest(BaseModel):
    provider: str
    key: str  # plaintext — encrypted before storage

class ApiKeyResponse(BaseModel):
    provider: str
    is_valid: bool
    validated_at: datetime | None
    masked_key: str  # first 4 + last 4 chars

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Create `backend/app/routers/api_keys.py`**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import ApiKeyUpsertRequest, ApiKeyResponse
from app.services.encryption import encrypt_key, decrypt_key
from app.dependencies import require_admin

router = APIRouter()

def _mask(key: str) -> str:
    return key[:4] + "•" * (len(key) - 8) + key[-4:] if len(key) > 8 else "•" * len(key)

@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(ApiKey))
    keys = result.scalars().all()
    return [ApiKeyResponse(
        provider=k.provider,
        is_valid=k.is_valid,
        validated_at=k.validated_at,
        masked_key=_mask(decrypt_key(k.encrypted_key)),
    ) for k in keys]

@router.post("", response_model=ApiKeyResponse)
async def upsert_api_key(req: ApiKeyUpsertRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(ApiKey).where(ApiKey.provider == req.provider))
    existing = result.scalar_one_or_none()
    is_valid = await _validate_key(req.provider, req.key)
    if existing:
        existing.encrypted_key = encrypt_key(req.key)
        existing.is_valid = is_valid
        existing.validated_at = datetime.now(timezone.utc) if is_valid else None
    else:
        db.add(ApiKey(
            provider=req.provider,
            encrypted_key=encrypt_key(req.key),
            is_valid=is_valid,
            validated_at=datetime.now(timezone.utc) if is_valid else None,
            created_by=admin.id,
        ))
    await db.commit()
    return ApiKeyResponse(provider=req.provider, is_valid=is_valid, validated_at=datetime.now(timezone.utc) if is_valid else None, masked_key=_mask(req.key))

@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(provider: str, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    result = await db.execute(select(ApiKey).where(ApiKey.provider == provider))
    key = result.scalar_one_or_none()
    if key:
        await db.delete(key)
        await db.commit()

async def _validate_key(provider: str, key: str) -> bool:
    """Test call to validate the key. Returns True if valid."""
    try:
        if provider == "openai":
            import httpx
            async with httpx.AsyncClient() as client:
                r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=5)
                return r.status_code == 200
        if provider == "alpha_vantage":
            import httpx
            async with httpx.AsyncClient() as client:
                r = await client.get(f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey={key}", timeout=5)
                return "Time Series" in r.text or "Meta Data" in r.text
        return True  # unknown providers pass validation
    except Exception:
        return False
```

- [ ] **Step 3: Create `backend/app/schemas/user.py`**

```python
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdateRequest(BaseModel):
    role: str  # admin|member
```

- [ ] **Step 4: Create `backend/app/routers/users.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserResponse, UserUpdateRequest
from app.dependencies import require_admin

router = APIRouter()

@router.get("", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()

@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(user_id: UUID, req: UserUpdateRequest, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.role = UserRole(req.role)
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    if str(user_id) == str(admin.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")
    user = await db.get(User, user_id)
    if user:
        await db.delete(user)
        await db.commit()
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/ backend/app/routers/api_keys.py backend/app/routers/users.py
git commit -m "feat: API keys and user management routes"
```

---

### Task 15: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN pip install uv
COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Smoke-test the backend locally**

```bash
cd backend
cp .env.example .env
# edit .env with real DATABASE_URL pointing to the Docker postgres from Task 4
uvicorn main:app --reload
```

Visit `http://localhost:8000/health` — expect `{"status":"ok"}`
Visit `http://localhost:8000/docs` — expect OpenAPI UI with all routes visible

- [ ] **Step 3: Run full test suite**

```bash
python -m pytest tests/ -v
```
Expected: all tests PASS (auth, encryption, websocket_manager)

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: backend Dockerfile and smoke test"
```

---

**Phase 1 complete.** The backend API is fully functional. Test all endpoints with the OpenAPI UI at `/docs` before proceeding to the frontend.

---
