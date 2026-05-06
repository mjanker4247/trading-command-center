# Price Target Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface entry price, stop-loss, and price target for each research run alongside the verdict, on both the results detail page and the run history table.

**Architecture:** A `_extract_prices` helper regex-parses `trader_decision` text at run completion and persists values into the already-existing `suggested_entry / suggested_stop / suggested_target` columns on `Report`. The runs router joins `Report` via a SQLAlchemy relationship and includes the three price fields in `RunResponse`, making them available to both the detail view and the history table with no extra API calls.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2 async, Pydantic v2, pytest-asyncio, Next.js 14 App Router, TypeScript, Tailwind CSS

---

## File Map

| File | Role |
|------|------|
| `backend/app/services/trading_agent_runner.py` | Add `_extract_prices`; call it before writing `Report` |
| `backend/app/models/run.py` | Add `report` SQLAlchemy relationship |
| `backend/app/schemas/run.py` | Add 3 optional price fields to `RunResponse` |
| `backend/app/routers/runs.py` | Add `_run_to_response` helper; update `list_runs` and `get_run` to use `selectinload` |
| `backend/tests/test_trading_agent_runner.py` | Tests for `_extract_prices` |
| `backend/tests/test_runs.py` | Test that GET /runs and GET /runs/{id} return price fields |
| `frontend/lib/types.ts` | Add 3 optional price fields to `Run` interface |
| `frontend/components/runs/TraderDecision.tsx` | Add Price Levels row below verdict badge |
| `frontend/components/runs/RunTable.tsx` | Add Prices column after Verdict |

---

## Task 1: Add and test `_extract_prices`

**Files:**
- Modify: `backend/app/services/trading_agent_runner.py`
- Modify: `backend/tests/test_trading_agent_runner.py`

- [ ] **Step 1.1: Write failing tests for `_extract_prices`**

Add to `backend/tests/test_trading_agent_runner.py`:

```python
from app.services.trading_agent_runner import _extract_prices


def test_extract_prices_full_match():
    text = (
        "Recommendation: Entry: $150.00, Stop Loss: $140.00, Target: $175.00. "
        "This is a strong buy signal."
    )
    entry, stop, target = _extract_prices(text)
    assert entry == "150.00"
    assert stop == "140.00"
    assert target == "175.00"


def test_extract_prices_partial_match():
    text = "Buy AAPL. Entry: $150. No stop defined. No target given."
    entry, stop, target = _extract_prices(text)
    assert entry == "150"
    assert stop is None
    assert target is None


def test_extract_prices_no_match():
    text = "This stock looks attractive based on fundamentals."
    entry, stop, target = _extract_prices(text)
    assert entry is None
    assert stop is None
    assert target is None


def test_extract_prices_case_insensitive():
    text = "ENTRY: $200. STOP LOSS: $185. TAKE PROFIT: $230."
    entry, stop, target = _extract_prices(text)
    assert entry == "200"
    assert stop == "185"
    assert target == "230"


def test_extract_prices_alternative_phrasings():
    text = "Buy at: $95.50. Stop at: $88.00. Price target: $110.00."
    entry, stop, target = _extract_prices(text)
    assert entry == "95.50"
    assert stop == "88.00"
    assert target == "110.00"


def test_extract_prices_comma_formatted():
    text = "Entry Price: $1,500.00. Stop Loss: $1,400.00. Profit Target: $1,750.00."
    entry, stop, target = _extract_prices(text)
    assert entry == "1,500.00"
    assert stop == "1,400.00"
    assert target == "1,750.00"
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd backend
python -m pytest tests/test_trading_agent_runner.py::test_extract_prices_full_match -v
```

Expected: `FAILED` — `ImportError: cannot import name '_extract_prices'`

> **Note:** The existing `test_build_llm_*` tests in this file import `_build_llm`, which no longer exists in the runner. They will error with `ImportError`. This is a pre-existing issue — skip them with `-k test_extract_prices` if needed: `python -m pytest tests/test_trading_agent_runner.py -k test_extract_prices -v`

- [ ] **Step 1.3: Implement `_extract_prices` in the runner**

Add this function to `backend/app/services/trading_agent_runner.py` (place it just above `_parse_verdict`):

```python
import re


def _extract_prices(text: str) -> tuple[str | None, str | None, str | None]:
    """Regex-parse entry, stop-loss, and price target from free-form LLM text."""
    def _find(patterns: list[str]) -> str | None:
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1)
        return None

    entry = _find([
        r"entry\s+price\s*[:=]\s*\$?([\d,\.]+)",
        r"entry\s*[:=]\s*\$?([\d,\.]+)",
        r"buy\s+at\s*[:=]\s*\$?([\d,\.]+)",
    ])
    stop = _find([
        r"stop[\s-]*loss\s*[:=]\s*\$?([\d,\.]+)",
        r"stop\s+at\s*[:=]\s*\$?([\d,\.]+)",
        r"stop\s*[:=]\s*\$?([\d,\.]+)",
    ])
    target = _find([
        r"price\s+target\s*[:=]\s*\$?([\d,\.]+)",
        r"take[\s-]*profit\s*[:=]\s*\$?([\d,\.]+)",
        r"profit\s+target\s*[:=]\s*\$?([\d,\.]+)",
        r"target\s*[:=]\s*\$?([\d,\.]+)",
    ])
    return entry, stop, target
```

Note: `re` is already in the standard library — no new dependency. The `import re` line goes at the top of the file with other stdlib imports.

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
python -m pytest tests/test_trading_agent_runner.py -v
```

Expected: all `test_extract_prices_*` tests PASS (existing `test_build_llm_*` tests unaffected).

- [ ] **Step 1.5: Commit**

```bash
git add backend/app/services/trading_agent_runner.py backend/tests/test_trading_agent_runner.py
git commit -m "feat: add _extract_prices helper with tests"
```

---

## Task 2: Wire extraction into the runner

**Files:**
- Modify: `backend/app/services/trading_agent_runner.py`

- [ ] **Step 2.1: Update the Report creation block**

In `execute_run`, find this block (around line 188):

```python
        async with AsyncSessionLocal() as db:
            db.add(Report(
                run_id=run_id,
                trader_decision=str(getattr(final_state, "final_trade_decision", "")),
                verdict=verdict,
                suggested_entry=None,
                suggested_stop=None,
                suggested_target=None,
                risk_assessment="",
                raw_report=raw,
            ))
            await db.commit()
```

Replace with:

```python
        trader_decision = str(getattr(final_state, "final_trade_decision", ""))
        suggested_entry, suggested_stop, suggested_target = _extract_prices(trader_decision)

        async with AsyncSessionLocal() as db:
            db.add(Report(
                run_id=run_id,
                trader_decision=trader_decision,
                verdict=verdict,
                suggested_entry=suggested_entry,
                suggested_stop=suggested_stop,
                suggested_target=suggested_target,
                risk_assessment="",
                raw_report=raw,
            ))
            await db.commit()
```

- [ ] **Step 2.2: Run the full backend test suite**

```bash
python -m pytest -v
```

Expected: all existing tests PASS. (No new tests here — `_extract_prices` is already covered by Task 1.)

- [ ] **Step 2.3: Commit**

```bash
git add backend/app/services/trading_agent_runner.py
git commit -m "feat: populate price fields in Report at run completion"
```

---

## Task 3: ORM relationship + schema + router

**Files:**
- Modify: `backend/app/models/run.py`
- Modify: `backend/app/schemas/run.py`
- Modify: `backend/app/routers/runs.py`
- Modify: `backend/tests/test_runs.py`

- [ ] **Step 3.1: Write failing tests for the API response**

Add to `backend/tests/test_runs.py`:

```python
import uuid
import base64
import json
from datetime import date
from httpx import AsyncClient, ASGITransport
from main import app


async def _decode_user_id(token: str) -> str:
    """Extract user UUID from JWT payload without verifying signature."""
    payload_b64 = token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    return json.loads(base64.b64decode(payload_b64))["sub"]


@pytest.mark.asyncio
async def test_get_run_includes_price_levels():
    """GET /runs/{id} returns price fields populated from the associated Report."""
    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus, RunVerdict
    from app.models.report import Report

    run_id = uuid.uuid4()
    email = f"prices_{run_id.hex[:8]}@test.com"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/auth/register", json={"email": email, "password": "pw", "name": "T"})
        r = await client.post("/auth/login", json={"email": email, "password": "pw"})
        token = r.json()["access_token"]
        user_id = await _decode_user_id(token)

        async with AsyncSessionLocal() as db:
            db.add(Run(
                id=run_id,
                created_by=uuid.UUID(user_id),
                ticker="NVDA",
                analysis_date=date(2024, 6, 1),
                llm_provider="openai",
                llm_model="gpt-4o",
                depth="standard",
                analysts=["market"],
                status=RunStatus.completed,
                verdict=RunVerdict.buy,
            ))
            db.add(Report(
                run_id=run_id,
                trader_decision="Entry: $200. Stop Loss: $185. Target: $230.",
                verdict=RunVerdict.buy,
                suggested_entry="200",
                suggested_stop="185",
                suggested_target="230",
                risk_assessment="",
            ))
            await db.commit()

        r = await client.get(f"/runs/{run_id}", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["suggested_entry"] == "200"
        assert data["suggested_stop"] == "185"
        assert data["suggested_target"] == "230"


@pytest.mark.asyncio
async def test_list_runs_includes_price_levels():
    """GET /runs returns price fields in each run that has a completed Report."""
    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus, RunVerdict
    from app.models.report import Report

    run_id = uuid.uuid4()
    email = f"prices2_{run_id.hex[:8]}@test.com"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/auth/register", json={"email": email, "password": "pw", "name": "T"})
        r = await client.post("/auth/login", json={"email": email, "password": "pw"})
        token = r.json()["access_token"]
        user_id = await _decode_user_id(token)

        async with AsyncSessionLocal() as db:
            db.add(Run(
                id=run_id,
                created_by=uuid.UUID(user_id),
                ticker="TSLA",
                analysis_date=date(2024, 6, 1),
                llm_provider="openai",
                llm_model="gpt-4o",
                depth="standard",
                analysts=["market"],
                status=RunStatus.completed,
                verdict=RunVerdict.hold,
            ))
            db.add(Report(
                run_id=run_id,
                trader_decision="Entry: $150. Stop: $140. Target: $175.",
                verdict=RunVerdict.hold,
                suggested_entry="150",
                suggested_stop="140",
                suggested_target="175",
                risk_assessment="",
            ))
            await db.commit()

        r = await client.get("/runs", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        run_data = next((x for x in r.json() if x["id"] == str(run_id)), None)
        assert run_data is not None
        assert run_data["suggested_entry"] == "150"
        assert run_data["suggested_stop"] == "140"
        assert run_data["suggested_target"] == "175"
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_runs.py::test_get_run_includes_price_levels tests/test_runs.py::test_list_runs_includes_price_levels -v
```

Expected: `FAILED` — `KeyError: 'suggested_entry'` (field not in response yet).

- [ ] **Step 3.3: Add `report` relationship to the `Run` model**

In `backend/app/models/run.py`, update the import line and add the relationship:

```python
import uuid, enum
from datetime import datetime, date
from sqlalchemy import String, Enum as SAEnum, DateTime, Date, ARRAY, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
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
    depth: Mapped[str] = mapped_column(String)
    analysts: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[RunStatus] = mapped_column(SAEnum(RunStatus), default=RunStatus.pending)
    archived: Mapped[bool] = mapped_column(default=False)
    verdict: Mapped[RunVerdict | None] = mapped_column(SAEnum(RunVerdict), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    report = relationship("Report", uselist=False, lazy="noload")
```

The `lazy="noload"` means SQLAlchemy never implicitly loads this relationship — it must be explicitly loaded with `selectinload`. This is required for async SQLAlchemy to avoid greenlet errors.

- [ ] **Step 3.4: Add price fields to `RunResponse`**

In `backend/app/schemas/run.py`, add three optional fields:

```python
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from uuid import UUID


class RunCreateRequest(BaseModel):
    ticker: str
    analysis_date: date
    llm_provider: str
    llm_model: str
    depth: str
    analysts: list[str] = ["market", "social", "news", "fundamentals", "technical"]
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
    archived: bool
    created_by: UUID
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    suggested_entry: str | None = None
    suggested_stop: str | None = None
    suggested_target: str | None = None

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 3.5: Add `_run_to_response` helper and update router queries**

In `backend/app/routers/runs.py`, add `selectinload` to the SQLAlchemy import and add the helper function and update two endpoints:

```python
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.run import Run
from app.models.report import Report
from app.models.agent_event import AgentEvent
from app.schemas.run import RunCreateRequest, RunResponse
from app.services.websocket_manager import ws_manager
from app.services.job_manager import start_run, abort_run
from app.dependencies import get_current_user
from app.models.user import User


class ReportResponse(BaseModel):
    id: UUID
    run_id: UUID
    trader_decision: str
    verdict: str
    suggested_entry: str | None
    suggested_stop: str | None
    suggested_target: str | None
    risk_assessment: str
    raw_report: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


router = APIRouter()


def _run_to_response(run: Run) -> RunResponse:
    """Build RunResponse, merging price fields from the eagerly-loaded report."""
    base = RunResponse.model_validate(run)
    if run.report:
        return base.model_copy(update={
            "suggested_entry": run.report.suggested_entry,
            "suggested_stop": run.report.suggested_stop,
            "suggested_target": run.report.suggested_target,
        })
    return base


@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    ticker: str | None = Query(None),
    verdict: str | None = Query(None),
    user_id: UUID | None = Query(None),
    archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    q = select(Run).options(selectinload(Run.report)).order_by(Run.created_at.desc())
    q = q.where(Run.archived == archived)
    if ticker:
        q = q.where(Run.ticker.ilike(ticker))
    if verdict:
        q = q.where(Run.verdict == verdict)
    if user_id:
        q = q.where(Run.created_by == user_id)
    result = await db.execute(q)
    runs = result.scalars().all()
    return [_run_to_response(run) for run in runs]


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
    result = await db.execute(
        select(Run).where(Run.id == run_id).options(selectinload(Run.report))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return _run_to_response(run)


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def abort_run_endpoint(run_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if str(run.created_by) != str(user.id) and user.role.value != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    abort_run(str(run_id))


@router.post("/runs/{run_id}/archive", response_model=RunResponse)
async def archive_run(run_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if str(run.created_by) != str(user.id) and user.role.value != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    run.archived = not run.archived
    await db.commit()
    await db.refresh(run)
    return run


@router.delete("/runs/{run_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.agent_event import AgentEvent
    from app.models.report import Report
    from sqlalchemy import delete as sql_delete

    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if str(run.created_by) != str(user.id) and user.role.value != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    if run.status.value == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a running run — abort it first")
    await db.execute(sql_delete(AgentEvent).where(AgentEvent.run_id == run_id))
    await db.execute(sql_delete(Report).where(Report.run_id == run_id))
    await db.delete(run)
    await db.commit()


@router.get("/runs/{run_id}/report", response_model=ReportResponse)
async def get_report(run_id: UUID, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    result = await db.execute(select(Report).where(Report.run_id == run_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report


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
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, ws)
```

- [ ] **Step 3.6: Run all backend tests**

```bash
python -m pytest -v
```

Expected: all tests PASS, including the two new `test_*_price_levels` tests.

- [ ] **Step 3.7: Commit**

```bash
git add backend/app/models/run.py backend/app/schemas/run.py backend/app/routers/runs.py backend/tests/test_runs.py
git commit -m "feat: surface price fields from Report in RunResponse via selectinload"
```

---

## Task 4: Frontend — Update types

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 4.1: Add price fields to the `Run` interface**

In `frontend/lib/types.ts`, add three optional fields to the `Run` interface:

```typescript
export interface Run {
  id: string;
  ticker: string;
  analysis_date: string;
  llm_provider: string;
  llm_model: string;
  depth: "quick" | "standard" | "deep";
  analysts: string[];
  label: string | null;
  status: "pending" | "running" | "completed" | "aborted" | "failed";
  verdict: "buy" | "sell" | "hold" | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  suggested_entry: string | null;
  suggested_stop: string | null;
  suggested_target: string | null;
}
```

All other interfaces (`Report`, `AgentEventPayload`, etc.) are unchanged.

- [ ] **Step 4.2: Type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat: add price fields to Run TypeScript interface"
```

---

## Task 5: Frontend — TraderDecision price row

**Files:**
- Modify: `frontend/components/runs/TraderDecision.tsx`

- [ ] **Step 5.1: Add Price Levels section**

Replace the contents of `frontend/components/runs/TraderDecision.tsx` with:

```tsx
"use client";
import type { Run, Report } from "@/lib/types";
import { Markdown } from "@/components/ui/Markdown";

interface Props {
  run: Run | undefined;
  report: Report | undefined;
}

const verdictStyles: Record<string, string> = {
  buy: "bg-green-900 text-green-300 text-2xl font-bold px-6 py-3 rounded-lg",
  sell: "bg-red-900 text-red-300 text-2xl font-bold px-6 py-3 rounded-lg",
  hold: "bg-yellow-900 text-yellow-300 text-2xl font-bold px-6 py-3 rounded-lg",
};

interface PriceLevelProps {
  label: string;
  value: string | null | undefined;
}

function PriceLevel({ label, value }: PriceLevelProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-400 text-xs uppercase tracking-wider">{label}</span>
      <span className="text-slate-200 font-mono text-sm">{value ? `$${value}` : "—"}</span>
    </div>
  );
}

export function TraderDecision({ run, report }: Props) {
  const isTerminated = run?.status === "aborted" || run?.status === "failed";
  const hasPrices =
    report?.suggested_entry || report?.suggested_stop || report?.suggested_target;

  return (
    <div className="bg-navy-700 border border-slate-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-slate-200 text-lg font-semibold">
          {run?.ticker ?? "—"}
        </h2>
        {run?.analysis_date && (
          <span className="text-slate-500 text-sm">{run.analysis_date}</span>
        )}
      </div>

      {isTerminated && !report && (
        <p className="text-slate-500 text-sm">
          This run did not complete successfully.
        </p>
      )}

      {!report && !isTerminated && (
        <p className="text-slate-500 text-sm">Results not yet available.</p>
      )}

      {report && (
        <div className="flex flex-col gap-4">
          <div>
            <span className={verdictStyles[report.verdict] ?? verdictStyles.hold}>
              {report.verdict.toUpperCase()}
            </span>
          </div>

          {hasPrices && (
            <div className="flex gap-6 border-t border-slate-700 pt-4">
              <PriceLevel label="Entry" value={report.suggested_entry} />
              <div className="w-px bg-slate-700" />
              <PriceLevel label="Stop" value={report.suggested_stop} />
              <div className="w-px bg-slate-700" />
              <PriceLevel label="Target" value={report.suggested_target} />
            </div>
          )}

          {report.trader_decision && (
            <Markdown>{report.trader_decision}</Markdown>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/components/runs/TraderDecision.tsx
git commit -m "feat: display entry/stop/target price levels in TraderDecision card"
```

---

## Task 6: Frontend — RunTable Prices column

**Files:**
- Modify: `frontend/components/runs/RunTable.tsx`

- [ ] **Step 6.1: Add Prices column**

Replace the contents of `frontend/components/runs/RunTable.tsx` with:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { archiveRun, deleteRun } from "@/lib/api";
import type { Run } from "@/lib/types";

interface RunTableProps {
  runs: Run[];
  archived: boolean;
  onMutate: () => void;
}

const statusBadge: Record<Run["status"], string> = {
  pending: "bg-slate-700 text-slate-300",
  running: "bg-blue-900 text-blue-300",
  completed: "bg-green-900 text-green-300",
  aborted: "bg-yellow-900 text-yellow-300",
  failed: "bg-red-900 text-red-300",
};

const verdictBadge: Record<NonNullable<Run["verdict"]>, string> = {
  buy: "bg-green-900 text-green-300",
  sell: "bg-red-900 text-red-300",
  hold: "bg-yellow-900 text-yellow-300",
};

function PriceSummary({ run }: { run: Run }) {
  const { suggested_entry: entry, suggested_stop: stop, suggested_target: target } = run;
  if (!entry && !stop && !target) return <span className="text-slate-600">—</span>;

  const fmt = (v: string | null) => (v ? `$${v}` : "—");
  return (
    <span
      className="font-mono text-xs text-slate-300"
      title="Entry · Stop · Target"
    >
      {fmt(entry)} · {fmt(stop)} · {fmt(target)}
    </span>
  );
}

function RunRow({ run, archived, onMutate }: { run: Run; archived: boolean; onMutate: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => archiveRun(run.id),
    onSuccess: onMutate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRun(run.id),
    onSuccess: onMutate,
  });

  const isRunning = run.status === "running";

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/40">
      <td className="px-4 py-3 text-slate-200 font-mono">{run.ticker}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${statusBadge[run.status]}`}>
          {run.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
          )}
          {run.status}
        </span>
      </td>
      <td className="px-4 py-3">
        {run.verdict ? (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${verdictBadge[run.verdict]}`}>
            {run.verdict}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <PriceSummary run={run} />
      </td>
      <td className="px-4 py-3 text-slate-400 text-xs">{run.analysts.join(", ")}</td>
      <td className="px-4 py-3 text-slate-400 text-xs">
        {run.started_at ? new Date(run.started_at).toLocaleDateString() : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/runs/${run.id}`} className="text-blue-400 hover:underline text-xs">
            View
          </Link>
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending || isRunning}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isRunning ? "Cannot archive a running run" : archived ? "Unarchive" : "Archive"}
          >
            {archiveMutation.isPending ? "…" : archived ? "Unarchive" : "Archive"}
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
              >
                {deleteMutation.isPending ? "…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isRunning}
              className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
              title={isRunning ? "Abort the run before deleting" : "Delete permanently"}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function RunTable({ runs, archived, onMutate }: RunTableProps) {
  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-navy-700 text-slate-400 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-3">Ticker</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Verdict</th>
            <th className="text-left px-4 py-3">Prices</th>
            <th className="text-left px-4 py-3">Analysts</th>
            <th className="text-left px-4 py-3">Started</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-slate-500 px-4 py-8">
                {archived ? "No archived runs." : "No runs yet."}
              </td>
            </tr>
          ) : (
            runs.map((run) => (
              <RunRow key={run.id} run={run} archived={archived} onMutate={onMutate} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

Note: `colSpan` updated from `6` to `7` to match the new column count.

- [ ] **Step 6.2: Type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/components/runs/RunTable.tsx
git commit -m "feat: add Prices column (entry · stop · target) to run history table"
```

---

## Done

All six tasks complete. The feature is live:
- New runs: prices extracted at completion, stored in DB, returned in API, shown in UI.
- Existing runs without prices: price fields return `null`, UI renders `—` — no visual regression.
