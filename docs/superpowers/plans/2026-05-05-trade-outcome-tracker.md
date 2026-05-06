# Trade Outcome Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each completed run, track whether the trade recommendation was correct by fetching the stock's closing price at analysis_date+7, +14, +30, and +90 days via Alpha Vantage. Display outcome cards on the run detail page and a performance accuracy dashboard at `/runs/performance`.

**Architecture:** New `RunOutcome` model (one-to-one with `Run`). Lazy price population: the `GET /runs/{id}/outcome` endpoint checks which checkpoint dates have passed, fetches missing prices from Alpha Vantage, persists them, and returns the current state. No scheduler needed for Phase 1. Frontend `OutcomeCard` component shows price movement vs entry price with green/red indicators.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, httpx, Alpha Vantage TIME_SERIES_DAILY API, Next.js 14, TanStack Query v5, Tailwind CSS

---

### Task 1: RunOutcome model + migration

**Files:**
- Create: `backend/app/models/outcome.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py` (add run_outcomes to TRUNCATE)
- Create: `backend/alembic/versions/<hash>_add_run_outcomes.py`

- [ ] **Step 1: Write the RunOutcome model** at `backend/app/models/outcome.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class RunOutcome(Base):
    __tablename__ = "run_outcomes"
    __table_args__ = (UniqueConstraint("run_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"))
    ticker: Mapped[str] = mapped_column(String(16))
    verdict: Mapped[str] = mapped_column(String)
    analysis_date: Mapped[str] = mapped_column(String)  # YYYY-MM-DD string
    price_at_analysis: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_7d: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_14d: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_30d: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_90d: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Import RunOutcome in models __init__.py**

The file is currently empty (1 line). Add:

```python
from app.models.outcome import RunOutcome  # noqa: F401
```

- [ ] **Step 3: Update conftest.py TRUNCATE**

Change:
```python
"TRUNCATE users, runs, agent_events, reports, api_keys RESTART IDENTITY CASCADE"
```
To:
```python
"TRUNCATE users, runs, agent_events, reports, api_keys, run_outcomes RESTART IDENTITY CASCADE"
```

- [ ] **Step 4: Generate Alembic migration**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic revision --autogenerate -m "add_run_outcomes"
```
Then verify the generated file creates the `run_outcomes` table with all columns.

- [ ] **Step 5: Apply migration**

```bash
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic upgrade head
```
Expected: "Running upgrade … -> <rev>, add_run_outcomes"

- [ ] **Step 6: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/models/outcome.py backend/app/models/__init__.py backend/tests/conftest.py backend/alembic/versions/
git commit -m "feat: add RunOutcome model and migration for trade outcome tracking"
```

---

### Task 2: Outcome service (Alpha Vantage price fetching)

**Files:**
- Create: `backend/app/services/outcome_service.py`

- [ ] **Step 1: Write outcome_service.py**

```python
from datetime import date, timedelta
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.api_key import ApiKey
from app.models.outcome import RunOutcome
from app.models.report import Report
from app.models.run import Run
from app.services.encryption import decrypt_key

CHECKPOINTS = [0, 7, 14, 30, 90]  # days offset from analysis_date


async def _get_alpha_vantage_key(db: AsyncSession) -> Optional[str]:
    result = await db.execute(select(ApiKey).where(ApiKey.provider == "alpha_vantage"))
    key_row = result.scalar_one_or_none()
    if not key_row or not key_row.is_valid:
        return None
    return decrypt_key(key_row.encrypted_key)


async def _fetch_closing_price(symbol: str, target_date: date, api_key: str) -> Optional[float]:
    """Fetch closing price for symbol on target_date using TIME_SERIES_DAILY."""
    url = (
        f"https://www.alphavantage.co/query"
        f"?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=full&apikey={api_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        series = data.get("Time Series (Daily)", {})
        # Walk back up to 5 days to handle weekends/holidays
        for offset in range(5):
            key = str(target_date - timedelta(days=offset))
            if key in series:
                return float(series[key]["4. close"])
    except Exception:
        pass
    return None


async def get_or_create_outcome(run_id: str, db: AsyncSession) -> RunOutcome:
    """Return outcome for run_id, lazily populating any past checkpoints that are missing."""
    from uuid import UUID
    run_uuid = UUID(run_id)

    # Load run and report
    run_result = await db.execute(select(Run).where(Run.id == run_uuid))
    run = run_result.scalar_one_or_none()
    if not run:
        raise ValueError(f"Run {run_id} not found")

    report_result = await db.execute(select(Report).where(Report.run_id == run_uuid))
    report = report_result.scalar_one_or_none()

    # Get or create outcome row
    outcome_result = await db.execute(select(RunOutcome).where(RunOutcome.run_id == run_uuid))
    outcome = outcome_result.scalar_one_or_none()
    if not outcome:
        outcome = RunOutcome(
            run_id=run_uuid,
            ticker=run.ticker,
            verdict=report.verdict if report else "unknown",
            analysis_date=str(run.analysis_date),
        )
        db.add(outcome)
        await db.flush()

    today = date.today()
    analysis_date = run.analysis_date
    if not isinstance(analysis_date, date):
        from datetime import datetime as dt
        analysis_date = dt.strptime(str(analysis_date), "%Y-%m-%d").date()

    # Determine which checkpoints need fetching
    needs_fetch = []
    if outcome.price_at_analysis is None and analysis_date <= today:
        needs_fetch.append(0)
    if outcome.price_7d is None and analysis_date + timedelta(days=7) <= today:
        needs_fetch.append(7)
    if outcome.price_14d is None and analysis_date + timedelta(days=14) <= today:
        needs_fetch.append(14)
    if outcome.price_30d is None and analysis_date + timedelta(days=30) <= today:
        needs_fetch.append(30)
    if outcome.price_90d is None and analysis_date + timedelta(days=90) <= today:
        needs_fetch.append(90)

    if needs_fetch:
        api_key = await _get_alpha_vantage_key(db)
        if api_key:
            for days in needs_fetch:
                target = analysis_date + timedelta(days=days)
                price = await _fetch_closing_price(run.ticker, target, api_key)
                if days == 0:
                    outcome.price_at_analysis = price
                elif days == 7:
                    outcome.price_7d = price
                elif days == 14:
                    outcome.price_14d = price
                elif days == 30:
                    outcome.price_30d = price
                elif days == 90:
                    outcome.price_90d = price
        await db.commit()
        await db.refresh(outcome)

    return outcome
```

- [ ] **Step 2: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/services/outcome_service.py
git commit -m "feat: add outcome_service for lazy Alpha Vantage price fetching"
```

---

### Task 3: Backend outcome endpoint

**Files:**
- Modify: `backend/app/routers/runs.py`

- [ ] **Step 1: Add RunOutcomeResponse schema** (inline in runs.py, after ReportResponse)

```python
class RunOutcomeResponse(BaseModel):
    id: UUID
    run_id: UUID
    ticker: str
    verdict: str
    analysis_date: str
    price_at_analysis: float | None
    price_7d: float | None
    price_14d: float | None
    price_30d: float | None
    price_90d: float | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Add GET /runs/{run_id}/outcome endpoint** (after the /report endpoint)

```python
@router.get("/runs/{run_id}/outcome", response_model=RunOutcomeResponse)
async def get_run_outcome(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from app.services.outcome_service import get_or_create_outcome
    try:
        outcome = await get_or_create_outcome(str(run_id), db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    return outcome
```

- [ ] **Step 3: Add GET /runs/performance endpoint** (before /runs/{run_id})

```python
@router.get("/runs/performance")
async def get_performance_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from app.models.outcome import RunOutcome
    result = await db.execute(select(RunOutcome))
    outcomes = result.scalars().all()
    total = len(outcomes)
    if total == 0:
        return {"total": 0, "accuracy_7d": None, "accuracy_14d": None, "accuracy_30d": None, "accuracy_90d": None, "outcomes": []}

    def accuracy(days_attr: str) -> float | None:
        scored = [o for o in outcomes if o.price_at_analysis and getattr(o, days_attr)]
        if not scored:
            return None
        correct = sum(
            1 for o in scored
            if (o.verdict == "buy" and getattr(o, days_attr) > o.price_at_analysis)
            or (o.verdict == "sell" and getattr(o, days_attr) < o.price_at_analysis)
        )
        return round(correct / len(scored) * 100, 1)

    return {
        "total": total,
        "accuracy_7d": accuracy("price_7d"),
        "accuracy_14d": accuracy("price_14d"),
        "accuracy_30d": accuracy("price_30d"),
        "accuracy_90d": accuracy("price_90d"),
        "outcomes": [
            {
                "run_id": str(o.run_id),
                "ticker": o.ticker,
                "verdict": o.verdict,
                "analysis_date": o.analysis_date,
                "price_at_analysis": o.price_at_analysis,
                "price_7d": o.price_7d,
                "price_14d": o.price_14d,
                "price_30d": o.price_30d,
                "price_90d": o.price_90d,
            }
            for o in outcomes
        ],
    }
```

- [ ] **Step 4: Run backend tests**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
python -m pytest tests/ -v -k "not trading_agent"
```
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/routers/runs.py
git commit -m "feat: add GET /runs/{id}/outcome and GET /runs/performance endpoints"
```

---

### Task 4: Frontend OutcomeCard component

**Files:**
- Modify: `frontend/lib/types.ts` (add RunOutcome, PerformanceStats)
- Modify: `frontend/lib/api.ts` (add getRunOutcome, getPerformanceStats)
- Create: `frontend/components/runs/OutcomeCard.tsx`
- Modify: `frontend/app/runs/[id]/page.tsx` (add OutcomeCard)

- [ ] **Step 1: Add RunOutcome type** to `frontend/lib/types.ts`

```typescript
export interface RunOutcome {
  id: string;
  run_id: string;
  ticker: string;
  verdict: string;
  analysis_date: string;
  price_at_analysis: number | null;
  price_7d: number | null;
  price_14d: number | null;
  price_30d: number | null;
  price_90d: number | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceStats {
  total: number;
  accuracy_7d: number | null;
  accuracy_14d: number | null;
  accuracy_30d: number | null;
  accuracy_90d: number | null;
  outcomes: Array<{
    run_id: string;
    ticker: string;
    verdict: string;
    analysis_date: string;
    price_at_analysis: number | null;
    price_7d: number | null;
    price_14d: number | null;
    price_30d: number | null;
    price_90d: number | null;
  }>;
}
```

- [ ] **Step 2: Add API functions** to `frontend/lib/api.ts`

```typescript
export async function getRunOutcome(runId: string): Promise<RunOutcome> {
  const r = await fetchWithAuth(`/runs/${runId}/outcome`);
  if (!r.ok) throw new Error("Outcome not available");
  return r.json();
}

export async function getPerformanceStats(): Promise<PerformanceStats> {
  const r = await fetchWithAuth("/runs/performance");
  if (!r.ok) throw new Error("Failed to fetch performance stats");
  return r.json();
}
```

Also add `RunOutcome, PerformanceStats` to the import from `./types`.

- [ ] **Step 3: Write OutcomeCard component** at `frontend/components/runs/OutcomeCard.tsx`

```tsx
"use client";
import type { RunOutcome } from "@/lib/types";

function pct(base: number | null, target: number | null): string {
  if (!base || !target) return "—";
  const p = ((target - base) / base) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
}

function pctColor(base: number | null, target: number | null, verdict: string): string {
  if (!base || !target) return "text-slate-400";
  const up = target > base;
  const correct = (verdict === "buy" && up) || (verdict === "sell" && !up);
  return correct ? "text-green-400" : "text-red-400";
}

const CHECKPOINTS: Array<{ label: string; key: keyof RunOutcome }> = [
  { label: "Day 0", key: "price_at_analysis" },
  { label: "+7d", key: "price_7d" },
  { label: "+14d", key: "price_14d" },
  { label: "+30d", key: "price_30d" },
  { label: "+90d", key: "price_90d" },
];

export function OutcomeCard({ outcome }: { outcome: RunOutcome }) {
  const base = outcome.price_at_analysis;

  return (
    <div className="bg-navy-800 border border-slate-700 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
        Trade Outcome
      </h2>
      <div className="grid grid-cols-5 gap-3">
        {CHECKPOINTS.map(({ label, key }) => {
          const price = outcome[key] as number | null;
          return (
            <div key={label} className="flex flex-col items-center bg-navy-900 rounded-lg p-3 gap-1">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-sm font-semibold text-white">
                {price ? `$${price.toFixed(2)}` : "—"}
              </span>
              {key !== "price_at_analysis" && (
                <span className={`text-xs font-medium ${pctColor(base, price, outcome.verdict)}`}>
                  {pct(base, price)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Verdict was <span className="font-semibold text-slate-400">{outcome.verdict.toUpperCase()}</span>.
        Prices fetched from Alpha Vantage. Future dates show "—" until available.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Add OutcomeCard to run detail page** — in `frontend/app/runs/[id]/page.tsx`, add:

```tsx
import { OutcomeCard } from "@/components/runs/OutcomeCard";
import { getRunOutcome } from "@/lib/api";
import type { RunOutcome } from "@/lib/types";
```

And a query inside the component:
```tsx
const { data: outcome } = useQuery<RunOutcome>({
  queryKey: ["outcome", id],
  queryFn: () => getRunOutcome(id),
  enabled: run?.status === "completed",
  retry: false,
});
```

Then render it after `<TraderDecision>`:
```tsx
{outcome && <OutcomeCard outcome={outcome} />}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/saketnayak/Developer/trading-command-center/frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add frontend/lib/types.ts frontend/lib/api.ts frontend/components/runs/OutcomeCard.tsx frontend/app/runs/[id]/page.tsx
git commit -m "feat: add OutcomeCard component and outcome query to run detail page"
```

---

### Task 5: Performance dashboard page

**Files:**
- Create: `frontend/app/runs/performance/page.tsx`

- [ ] **Step 1: Write performance page**

```tsx
"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import { getPerformanceStats } from "@/lib/api";

function AccuracyBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500 text-sm">—</span>;
  const color = value >= 60 ? "text-green-400" : value >= 50 ? "text-amber-400" : "text-red-400";
  return <span className={`text-2xl font-bold ${color}`}>{value}%</span>;
}

export default function PerformancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["performance"],
    queryFn: getPerformanceStats,
  });

  return (
    <div className="min-h-screen bg-navy-900">
      <TopNav />
      <main className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/runs" className="text-blue-400 hover:underline text-sm">← Back to History</Link>
          <h1 className="text-lg font-semibold text-white">Trade Accuracy</h1>
        </div>

        {isLoading && <div className="text-slate-400 text-sm">Loading…</div>}

        {data && (
          <>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "7-day accuracy", value: data.accuracy_7d },
                { label: "14-day accuracy", value: data.accuracy_14d },
                { label: "30-day accuracy", value: data.accuracy_30d },
                { label: "90-day accuracy", value: data.accuracy_90d },
              ].map(({ label, value }) => (
                <div key={label} className="bg-navy-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                  <AccuracyBadge value={value} />
                  <p className="text-xs text-slate-500">{data.total} total runs</p>
                </div>
              ))}
            </div>

            <div className="bg-navy-800 border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-navy-900">
                  <tr>
                    {["Ticker", "Date", "Verdict", "Day 0", "+7d", "+14d", "+30d", "+90d"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.outcomes.map((o) => {
                    const base = o.price_at_analysis;
                    const pct = (v: number | null) => {
                      if (!base || !v) return "—";
                      const p = ((v - base) / base) * 100;
                      return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
                    };
                    const color = (v: number | null) => {
                      if (!base || !v) return "text-slate-400";
                      const up = v > base;
                      return (o.verdict === "buy" && up) || (o.verdict === "sell" && !up)
                        ? "text-green-400"
                        : "text-red-400";
                    };
                    return (
                      <tr key={o.run_id} className="border-t border-slate-800 hover:bg-navy-700/50">
                        <td className="px-4 py-3 font-semibold text-white">
                          <Link href={`/runs/${o.run_id}`} className="hover:text-blue-400">{o.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{o.analysis_date}</td>
                        <td className="px-4 py-3">
                          <span className={o.verdict === "buy" ? "text-green-400" : o.verdict === "sell" ? "text-red-400" : "text-amber-400"}>
                            {o.verdict.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{base ? `$${base.toFixed(2)}` : "—"}</td>
                        {[o.price_7d, o.price_14d, o.price_30d, o.price_90d].map((v, i) => (
                          <td key={i} className={`px-4 py-3 ${color(v)}`}>{pct(v)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.outcomes.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-8">
                  No outcome data yet. Complete runs and visit run detail pages to populate prices.
                </p>
              )}
            </div>
          </>
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
git add frontend/app/runs/performance/page.tsx
git commit -m "feat: add /runs/performance trade accuracy dashboard"
```
