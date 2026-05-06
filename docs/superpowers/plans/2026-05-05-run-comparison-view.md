# Run Comparison View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/runs/compare?a=<id>&b=<id>` page that displays two completed runs side-by-side with verdict, prices, analyst reports, and debate highlights.

**Architecture:** Minimal backend change (one new `GET /runs/compare` endpoint in the existing runs router). Frontend: new `compare` page with a `ComparisonPanel` component rendering columns for run A and run B.

**Tech Stack:** FastAPI, SQLAlchemy 2, Next.js 14 App Router, TanStack Query v5, Tailwind CSS

---

### Task 1: Backend — compare endpoint

**Files:**
- Modify: `backend/app/routers/runs.py`

- [ ] **Step 1: Add CompareResponse schema** (inline in runs.py, after `ReportResponse`)

```python
class RunWithReport(BaseModel):
    run: RunResponse
    report: ReportResponse | None

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Add GET /runs/compare endpoint** (before the WebSocket endpoint)

```python
@router.get("/runs/compare")
async def compare_runs(
    a: UUID = Query(...),
    b: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    async def load(run_id: UUID) -> RunWithReport:
        result = await db.execute(
            select(Run).where(Run.id == run_id).options(selectinload(Run.report))
        )
        run = result.scalar_one_or_none()
        if not run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Run {run_id} not found")
        report_result = await db.execute(select(Report).where(Report.run_id == run_id))
        report = report_result.scalar_one_or_none()
        return RunWithReport(run=_run_to_response(run), report=report)

    run_a, run_b = await asyncio.gather(load(a), load(b))
    return {"a": run_a, "b": run_b}
```

Also add `import asyncio` at the top of the file if not already present.

- [ ] **Step 3: Run backend tests**

```bash
cd /Users/saketnayak/Developer/trading-command-center/backend
python -m pytest tests/test_runs.py -v
```
Expected: all existing tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add backend/app/routers/runs.py
git commit -m "feat: add GET /runs/compare endpoint for side-by-side run comparison"
```

---

### Task 2: Frontend types and API

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add CompareResult type** to `frontend/lib/types.ts`

```typescript
export interface RunWithReport {
  run: Run;
  report: Report | null;
}

export interface CompareResult {
  a: RunWithReport;
  b: RunWithReport;
}
```

- [ ] **Step 2: Add compareRuns API function** to `frontend/lib/api.ts`

```typescript
export async function compareRuns(a: string, b: string): Promise<CompareResult> {
  const r = await fetchWithAuth(`/runs/compare?a=${a}&b=${b}`);
  if (!r.ok) throw new Error("Failed to fetch comparison");
  return r.json();
}
```

Also add `CompareResult, RunWithReport` to the import from `./types`.

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
git commit -m "feat: add CompareResult type and compareRuns API function"
```

---

### Task 3: ComparisonPanel component

**Files:**
- Create: `frontend/components/runs/ComparisonPanel.tsx`

- [ ] **Step 1: Write ComparisonPanel**

```tsx
"use client";
import type { RunWithReport } from "@/lib/types";

const VERDICT_COLOR: Record<string, string> = {
  buy: "text-green-400",
  sell: "text-red-400",
  hold: "text-amber-400",
};

function AnalystSection({ label, content }: { label: string; content: string | undefined }) {
  if (!content?.trim()) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed line-clamp-6">{content.trim()}</p>
    </div>
  );
}

function RunColumn({ side, data }: { side: "A" | "B"; data: RunWithReport }) {
  const { run, report } = data;
  const raw = report?.raw_report as Record<string, unknown> | undefined;

  return (
    <div className="flex-1 min-w-0 bg-navy-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-slate-700 text-slate-300 text-xs font-bold px-2 py-0.5 rounded">Run {side}</span>
        <span className="text-xl font-bold text-white">{run.ticker}</span>
        <span className="text-sm text-slate-400">{run.analysis_date}</span>
      </div>

      {report ? (
        <div className={`text-2xl font-bold ${VERDICT_COLOR[report.verdict] ?? "text-slate-300"}`}>
          {report.verdict.toUpperCase()}
        </div>
      ) : (
        <div className="text-slate-500 text-sm">No report available</div>
      )}

      {report && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Entry", value: report.suggested_entry },
            { label: "Stop", value: report.suggested_stop },
            { label: "Target", value: report.suggested_target },
          ].map(({ label, value }) => (
            <div key={label} className="bg-navy-900 rounded-lg p-2">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-white">{value ? `$${value}` : "—"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 space-y-1">
        <p><span className="text-slate-400">Model:</span> {run.llm_provider} / {run.llm_model}</p>
        <p><span className="text-slate-400">Depth:</span> {run.depth}</p>
        <p><span className="text-slate-400">Analysts:</span> {run.analysts.join(", ")}</p>
      </div>

      {report && (
        <div className="border-t border-slate-700 pt-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Trader Decision</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed line-clamp-8">{report.trader_decision}</p>
        </div>
      )}

      {raw && run.analysts.map((analyst) => {
        const key = `${analyst}_report`;
        const content = raw[key] as string | undefined ?? raw[analyst] as string | undefined;
        return (
          <AnalystSection
            key={analyst}
            label={analyst.charAt(0).toUpperCase() + analyst.slice(1) + " Analyst"}
            content={content}
          />
        );
      })}
    </div>
  );
}

export function ComparisonPanel({ a, b }: { a: RunWithReport; b: RunWithReport }) {
  const verdictA = a.report?.verdict;
  const verdictB = b.report?.verdict;
  const agree = verdictA && verdictB && verdictA === verdictB;

  return (
    <div className="flex flex-col gap-4">
      {verdictA && verdictB && (
        <div className={`text-center text-sm px-4 py-2 rounded-lg border ${agree ? "border-green-700 bg-green-900/20 text-green-400" : "border-amber-700 bg-amber-900/20 text-amber-400"}`}>
          {agree
            ? `Both runs agree: ${verdictA.toUpperCase()}`
            : `Verdicts differ: Run A says ${verdictA.toUpperCase()}, Run B says ${verdictB.toUpperCase()}`}
        </div>
      )}
      <div className="flex gap-4 items-start">
        <RunColumn side="A" data={a} />
        <RunColumn side="B" data={b} />
      </div>
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
git add frontend/components/runs/ComparisonPanel.tsx
git commit -m "feat: add ComparisonPanel side-by-side run comparison component"
```

---

### Task 4: Compare page + compare button on run history

**Files:**
- Create: `frontend/app/runs/compare/page.tsx`
- Modify: `frontend/app/runs/[id]/page.tsx` (add "Compare" link)

- [ ] **Step 1: Write compare page**

```tsx
"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import { ComparisonPanel } from "@/components/runs/ComparisonPanel";
import { compareRuns } from "@/lib/api";

function CompareContent() {
  const params = useSearchParams();
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", a, b],
    queryFn: () => compareRuns(a, b),
    enabled: !!a && !!b,
  });

  if (!a || !b) {
    return (
      <div className="text-slate-400 text-sm">
        Provide two run IDs: <code>/runs/compare?a=&lt;id&gt;&b=&lt;id&gt;</code>
      </div>
    );
  }

  if (isLoading) return <div className="text-slate-400 text-sm">Loading comparison…</div>;
  if (error) return <div className="text-red-400 text-sm">Failed to load comparison.</div>;
  if (!data) return null;

  return <ComparisonPanel a={data.a} b={data.b} />;
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-navy-900">
      <TopNav />
      <main className="p-6 max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/runs" className="text-blue-400 hover:underline text-sm">
            ← Back to History
          </Link>
          <h1 className="text-lg font-semibold text-white">Run Comparison</h1>
        </div>
        <Suspense fallback={<div className="text-slate-400 text-sm">Loading…</div>}>
          <CompareContent />
        </Suspense>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add "Compare" link to run detail page** — Add a compare link to `frontend/app/runs/[id]/page.tsx` in the top action bar, after the Back link:

```tsx
{run && (
  <Link
    href={`/runs/compare?a=${id}&b=`}
    className="text-slate-400 hover:text-blue-400 text-sm"
  >
    Compare →
  </Link>
)}
```

Place it between the back link and `<DownloadMenu>`.

- [ ] **Step 3: Type-check and lint**

```bash
cd /Users/saketnayak/Developer/trading-command-center/frontend
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/saketnayak/Developer/trading-command-center
git add frontend/app/runs/compare/page.tsx frontend/app/runs/[id]/page.tsx
git commit -m "feat: add /runs/compare page and Compare link on run detail"
```
