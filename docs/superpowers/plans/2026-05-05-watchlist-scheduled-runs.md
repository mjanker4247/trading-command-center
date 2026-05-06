# Watchlist + Scheduled Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can create a watchlist of tickers and schedule automated analyses (daily/weekly). APScheduler fires runs on schedule; a `/watchlist` frontend page manages the watchlist and shows scheduled run history.

**Architecture:** Three new models: `Watchlist`, `WatchlistItem`, `ScheduledRun`. APScheduler (AsyncScheduler) starts at app lifespan and fires `create_run()` jobs. Each `ScheduledRun` stores cron expression + last/next execution times. New router `/watchlist`. Frontend `/watchlist` page manages items and schedule config.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, APScheduler 4.x (`apscheduler[asyncio]`), Next.js 14, TanStack Query v5, Tailwind CSS

---

### Task 1: Models + migration

**Files:**
- Create: `backend/app/models/watchlist.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py` (add tables to TRUNCATE)
- Create: `backend/alembic/versions/<hash>_add_watchlist.py`

- [ ] **Step 1: Install APScheduler**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
pip install "apscheduler>=4.0.0a5"
```

Also add to `backend/pyproject.toml` under `[project] dependencies`:
```
"apscheduler>=4.0.0a5",
```

- [ ] **Step 2: Write watchlist models** at `backend/app/models/watchlist.py`

```python
import uuid, enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, UniqueConstraint, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Watchlist(Base):
    __tablename__ = "watchlists"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String, default="My Watchlist")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items = relationship("WatchlistItem", back_populates="watchlist", cascade="all, delete-orphan")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("watchlist_id", "ticker"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    watchlist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("watchlists.id"))
    ticker: Mapped[str] = mapped_column(String(16))
    llm_provider: Mapped[str] = mapped_column(String)
    llm_model: Mapped[str] = mapped_column(String)
    depth: Mapped[str] = mapped_column(String, default="standard")
    analysts: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    schedule_cron: Mapped[str | None] = mapped_column(String, nullable=True)  # e.g. "0 9 * * 1" = Mon 9am
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    watchlist = relationship("Watchlist", back_populates="items")
```

- [ ] **Step 3: Import models in __init__.py**

Append (or update the file):
```python
from app.models.outcome import RunOutcome  # noqa: F401
from app.models.watchlist import Watchlist, WatchlistItem  # noqa: F401
```

- [ ] **Step 4: Update conftest.py TRUNCATE**

Extend the TRUNCATE to include new tables:
```python
"TRUNCATE users, runs, agent_events, reports, api_keys, run_outcomes, watchlists, watchlist_items RESTART IDENTITY CASCADE"
```

- [ ] **Step 5: Generate migration**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic revision --autogenerate -m "add_watchlist"
```
Verify the generated file creates `watchlists` and `watchlist_items` tables.

- [ ] **Step 6: Apply migration**

```bash
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic upgrade head
```

- [ ] **Step 7: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/models/watchlist.py backend/app/models/__init__.py backend/tests/conftest.py backend/alembic/versions/ backend/pyproject.toml
git commit -m "feat: add Watchlist and WatchlistItem models for scheduled run tracking"
```

---

### Task 2: Watchlist router (CRUD)

**Files:**
- Create: `backend/app/routers/watchlist.py`
- Modify: `backend/main.py` (register router)

- [ ] **Step 1: Write watchlist router**

```python
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.watchlist import Watchlist, WatchlistItem
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter()


class WatchlistItemCreate(BaseModel):
    ticker: str
    llm_provider: str
    llm_model: str
    depth: str = "standard"
    analysts: list[str] = []
    schedule_cron: str | None = None


class WatchlistItemUpdate(BaseModel):
    schedule_cron: str | None = None
    enabled: bool | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    depth: str | None = None
    analysts: list[str] | None = None


class WatchlistItemResponse(BaseModel):
    id: UUID
    watchlist_id: UUID
    ticker: str
    llm_provider: str
    llm_model: str
    depth: str
    analysts: list[str]
    schedule_cron: str | None
    enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WatchlistResponse(BaseModel):
    id: UUID
    created_by: UUID
    name: str
    items: list[WatchlistItemResponse]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


async def _get_or_create_watchlist(user_id: UUID, db: AsyncSession) -> Watchlist:
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.created_by == user_id)
        .options(selectinload(Watchlist.items))
    )
    wl = result.scalar_one_or_none()
    if not wl:
        wl = Watchlist(created_by=user_id)
        db.add(wl)
        await db.commit()
        await db.refresh(wl)
        wl.items = []
    return wl


@router.get("/watchlist", response_model=WatchlistResponse)
async def get_watchlist(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _get_or_create_watchlist(user.id, db)


@router.post("/watchlist/items", response_model=WatchlistItemResponse, status_code=status.HTTP_201_CREATED)
async def add_watchlist_item(
    req: WatchlistItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    wl = await _get_or_create_watchlist(user.id, db)
    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.watchlist_id == wl.id,
            WatchlistItem.ticker == req.ticker.upper(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, f"{req.ticker.upper()} already in watchlist")
    item = WatchlistItem(
        watchlist_id=wl.id,
        ticker=req.ticker.upper(),
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        depth=req.depth,
        analysts=req.analysts,
        schedule_cron=req.schedule_cron,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/watchlist/items/{item_id}", response_model=WatchlistItemResponse)
async def update_watchlist_item(
    item_id: UUID,
    req: WatchlistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await db.get(WatchlistItem, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    wl = await db.get(Watchlist, item.watchlist_id)
    if str(wl.created_by) != str(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/watchlist/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watchlist_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await db.get(WatchlistItem, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    wl = await db.get(Watchlist, item.watchlist_id)
    if str(wl.created_by) != str(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    await db.delete(item)
    await db.commit()


@router.post("/watchlist/items/{item_id}/run", status_code=status.HTTP_201_CREATED)
async def trigger_watchlist_run(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually trigger an immediate run for a watchlist item."""
    from datetime import date
    item = await db.get(WatchlistItem, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    wl = await db.get(Watchlist, item.watchlist_id)
    if str(wl.created_by) != str(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")

    from app.models.run import Run
    from app.services.job_manager import start_run
    run = Run(
        created_by=user.id,
        ticker=item.ticker,
        analysis_date=date.today(),
        llm_provider=item.llm_provider,
        llm_model=item.llm_model,
        depth=item.depth,
        analysts=item.analysts,
        label=f"Watchlist: {item.ticker}",
    )
    db.add(run)
    item.last_run_at = datetime.now(timezone.utc)
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
    return {"run_id": str(run.id)}
```

- [ ] **Step 2: Register router in main.py**

In `backend/main.py`, add to imports:
```python
from app.routers import auth, runs, api_keys, users, llm_providers, watchlist
```

And add before the health endpoint:
```python
app.include_router(watchlist.router, tags=["watchlist"])
```

- [ ] **Step 3: Run backend tests**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
python -m pytest tests/ -v -k "not trading_agent"
```
Expected: all passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/routers/watchlist.py backend/main.py
git commit -m "feat: add /watchlist CRUD endpoints and manual run trigger"
```

---

### Task 3: APScheduler integration

**Files:**
- Create: `backend/app/services/scheduler.py`
- Modify: `backend/main.py` (start/stop scheduler in lifespan)

- [ ] **Step 1: Write scheduler service** at `backend/app/services/scheduler.py`

```python
"""Minimal APScheduler wrapper — fires scheduled watchlist runs."""
from datetime import date, datetime, timezone
from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models.watchlist import WatchlistItem, Watchlist
from app.models.run import Run
from app.services.job_manager import start_run

_scheduler: AsyncScheduler | None = None


async def _fire_watchlist_item(item_id: str) -> None:
    async with AsyncSessionLocal() as db:
        item = await db.get(WatchlistItem, item_id)
        if not item or not item.enabled:
            return
        wl = await db.get(Watchlist, item.watchlist_id)
        run = Run(
            created_by=wl.created_by,
            ticker=item.ticker,
            analysis_date=date.today(),
            llm_provider=item.llm_provider,
            llm_model=item.llm_model,
            depth=item.depth,
            analysts=item.analysts,
            label=f"Scheduled: {item.ticker}",
        )
        db.add(run)
        item.last_run_at = datetime.now(timezone.utc)
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


async def _reload_jobs(scheduler: AsyncScheduler) -> None:
    """Remove all watchlist jobs and re-add from DB."""
    for job in await scheduler.get_jobs():
        if job.id.startswith("wl_"):
            await scheduler.remove_job(job.id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WatchlistItem)
            .options(selectinload(WatchlistItem.watchlist))
            .where(WatchlistItem.enabled == True, WatchlistItem.schedule_cron.isnot(None))
        )
        items = result.scalars().all()
        for item in items:
            await scheduler.add_schedule(
                _fire_watchlist_item,
                CronTrigger.from_crontab(item.schedule_cron),
                id=f"wl_{item.id}",
                args=[str(item.id)],
                conflict_policy="replace",
            )


async def start_scheduler() -> AsyncScheduler:
    global _scheduler
    _scheduler = AsyncScheduler()
    await _scheduler.__aenter__()
    await _reload_jobs(_scheduler)
    return _scheduler


async def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        await _scheduler.__aexit__(None, None, None)
        _scheduler = None


async def reload_jobs() -> None:
    if _scheduler:
        await _reload_jobs(_scheduler)
```

- [ ] **Step 2: Wire scheduler into lifespan** in `backend/main.py`

Update the lifespan context manager:
```python
from app.services.scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Run)
            .where(Run.status == RunStatus.running)
            .values(status=RunStatus.failed, completed_at=datetime.now(timezone.utc))
        )
        await db.commit()
    scheduler = await start_scheduler()
    yield
    await stop_scheduler()
```

- [ ] **Step 3: Run backend (smoke test)**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
python -m uvicorn main:app --reload &
sleep 3
curl -s http://localhost:8000/health
kill %1
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/services/scheduler.py backend/main.py
git commit -m "feat: add APScheduler integration for watchlist scheduled runs"
```

---

### Task 4: Frontend watchlist types and API

**Files:**
- Modify: `frontend/lib/types.ts` (add Watchlist types)
- Modify: `frontend/lib/api.ts` (add watchlist functions)

- [ ] **Step 1: Add watchlist types** to `frontend/lib/types.ts`

```typescript
export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  ticker: string;
  llm_provider: string;
  llm_model: string;
  depth: string;
  analysts: string[];
  schedule_cron: string | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  added_at: string;
}

export interface Watchlist {
  id: string;
  created_by: string;
  name: string;
  items: WatchlistItem[];
  created_at: string;
}

export interface AddWatchlistItemRequest {
  ticker: string;
  llm_provider: string;
  llm_model: string;
  depth: string;
  analysts: string[];
  schedule_cron?: string | null;
}
```

- [ ] **Step 2: Add watchlist API functions** to `frontend/lib/api.ts`

```typescript
export async function getWatchlist(): Promise<Watchlist> {
  const r = await fetchWithAuth("/watchlist");
  if (!r.ok) throw new Error("Failed to fetch watchlist");
  return r.json();
}

export async function addWatchlistItem(req: AddWatchlistItemRequest): Promise<WatchlistItem> {
  const r = await fetchWithAuth("/watchlist/items", { method: "POST", body: JSON.stringify(req) });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail ?? "Failed to add ticker");
  }
  return r.json();
}

export async function updateWatchlistItem(
  itemId: string,
  req: Partial<Pick<WatchlistItem, "schedule_cron" | "enabled" | "llm_provider" | "llm_model" | "depth" | "analysts">>
): Promise<WatchlistItem> {
  const r = await fetchWithAuth(`/watchlist/items/${itemId}`, { method: "PATCH", body: JSON.stringify(req) });
  if (!r.ok) throw new Error("Failed to update item");
  return r.json();
}

export async function removeWatchlistItem(itemId: string): Promise<void> {
  await fetchWithAuth(`/watchlist/items/${itemId}`, { method: "DELETE" });
}

export async function triggerWatchlistRun(itemId: string): Promise<{ run_id: string }> {
  const r = await fetchWithAuth(`/watchlist/items/${itemId}/run`, { method: "POST" });
  if (!r.ok) throw new Error("Failed to trigger run");
  return r.json();
}
```

Also add `Watchlist, WatchlistItem, AddWatchlistItemRequest` to the import from `./types`.

- [ ] **Step 3: Type-check**

```bash
cd /Users/saketnayak/Developer/trading-command-center/frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: add watchlist types and API functions"
```

---

### Task 5: Watchlist page

**Files:**
- Create: `frontend/app/watchlist/page.tsx`

- [ ] **Step 1: Write watchlist page**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import {
  getWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
  updateWatchlistItem,
  triggerWatchlistRun,
} from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

const CRON_PRESETS = [
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Weekly Mon 9am", value: "0 9 * * 1" },
  { label: "Weekly Fri 4pm", value: "0 16 * * 5" },
  { label: "Manual only", value: null },
];

function CronLabel({ cron }: { cron: string | null }) {
  if (!cron) return <span className="text-slate-500 text-xs">Manual only</span>;
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  return <span className="text-slate-300 text-xs">{preset?.label ?? cron}</span>;
}

function ItemRow({
  item,
  onRemove,
  onToggle,
  onRunNow,
}: {
  item: WatchlistItem;
  onRemove: () => void;
  onToggle: () => void;
  onRunNow: () => void;
}) {
  return (
    <tr className="border-t border-slate-800 hover:bg-navy-700/40">
      <td className="px-4 py-3 font-semibold text-white">{item.ticker}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.llm_provider} / {item.llm_model}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.depth}</td>
      <td className="px-4 py-3"><CronLabel cron={item.schedule_cron} /></td>
      <td className="px-4 py-3 text-slate-500 text-xs">
        {item.last_run_at ? new Date(item.last_run_at).toLocaleDateString() : "Never"}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${item.enabled ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-500"}`}>
          {item.enabled ? "Active" : "Paused"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={onRunNow}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 border border-blue-800 rounded"
          >
            Run now
          </button>
          <button
            onClick={onToggle}
            className="text-xs text-slate-400 hover:text-slate-300 px-2 py-1 border border-slate-700 rounded"
          >
            {item.enabled ? "Pause" : "Resume"}
          </button>
          <button
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-900 rounded"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddItemForm({ onAdd }: { onAdd: (ticker: string, cron: string | null) => void }) {
  const [ticker, setTicker] = useState("");
  const [cron, setCron] = useState<string | null>(null);

  return (
    <div className="flex gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Ticker</label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          className="bg-navy-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-28 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Schedule</label>
        <select
          value={cron ?? "null"}
          onChange={(e) => setCron(e.target.value === "null" ? null : e.target.value)}
          className="bg-navy-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {CRON_PRESETS.map((p) => (
            <option key={p.label} value={p.value ?? "null"}>{p.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => { if (ticker) { onAdd(ticker, cron); setTicker(""); } }}
        disabled={!ticker}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        Add
      </button>
    </div>
  );
}

export default function WatchlistPage() {
  const qc = useQueryClient();
  const { data: watchlist, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
  });

  const addMutation = useMutation({
    mutationFn: ({ ticker, cron }: { ticker: string; cron: string | null }) =>
      addWatchlistItem({
        ticker,
        llm_provider: "openai",
        llm_model: "gpt-4o-mini",
        depth: "standard",
        analysts: ["market", "sentiment", "news", "fundamentals"],
        schedule_cron: cron,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const removeMutation = useMutation({
    mutationFn: removeWatchlistItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateWatchlistItem(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: triggerWatchlistRun,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      window.open(`/runs/${data.run_id}/live`, "_blank");
    },
  });

  return (
    <div className="min-h-screen bg-navy-900">
      <TopNav />
      <main className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/runs" className="text-blue-400 hover:underline text-sm">← Back to History</Link>
          <h1 className="text-lg font-semibold text-white">Watchlist</h1>
        </div>

        <div className="bg-navy-800 border border-slate-700 rounded-xl p-5">
          <AddItemForm
            onAdd={(ticker, cron) => addMutation.mutate({ ticker, cron })}
          />
          {addMutation.error && (
            <p className="text-red-400 text-sm mt-2">{String(addMutation.error)}</p>
          )}
        </div>

        {isLoading && <div className="text-slate-400 text-sm">Loading watchlist…</div>}

        {watchlist && (
          <div className="bg-navy-800 border border-slate-700 rounded-xl overflow-hidden">
            {watchlist.items.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-10">
                No tickers yet. Add a ticker above to start tracking.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-navy-900">
                  <tr>
                    {["Ticker", "Model", "Depth", "Schedule", "Last Run", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watchlist.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onRemove={() => removeMutation.mutate(item.id)}
                      onToggle={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
                      onRunNow={() => runNowMutation.mutate(item.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/saketnayak/Developer/trading-command-center/frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add frontend/app/watchlist/page.tsx
git commit -m "feat: add /watchlist page with ticker management and schedule config"
```
