# Elixir / Ash Refactor Analysis & Plan

**Date:** 2026-07-30  
**Scope:** AgentFloor (FastAPI + Next.js → possible Phoenix/Ash + LiveView)  
**Verdict:** A full rewrite is **not worth it**. A **hybrid** — Ash/Phoenix for the application core + Python workers for analysis — is worth considering **only if** you need multi-node reliability, Oban-quality jobs, or are consolidating ops around the BEAM. Otherwise stay on the current stack and harden the Python process model.

---

## 1. Current system (facts)

| Layer | Stack | Approx size |
|---|---|---|
| Backend API + services | FastAPI, SQLAlchemy 2 async, APScheduler, httpx | ~12k LOC `app/` + ~2.3k Elliott Wave |
| Quant / agent runtime | TradingAgents, pandas/numpy, pykalman, hmmlearn, yfinance | Hard Python dependency |
| Frontend | Next.js 16 App Router, NextAuth, TanStack Query, Plotly | ~22k LOC, ~15 routes |
| Data | PostgreSQL, 17 tables, 27 Alembic revisions | Single-team appliance tenancy |
| Real-time | In-process WebSocket manager + asyncio tasks | Single-node sticky |

Product shape: self-hosted morning research desk (portfolio → briefing → deep runs → watchlist). Research-only; no order execution.

---

## 2. Is a full Elixir rewrite worth it?

### Short answer: **No.**

A greenfield port of ~43k LOC (backend + frontend) plus TradingAgents/Elliott Wave/Kalman/HMM would:

- **Not** improve the product’s differentiating value (multi-agent LLM research, quant overlays).
- Force a long dual-stack period or a risky big-bang cutover.
- Reimplement Plotly charts, PDF export, dense holdings UX, and CSV importers with little user-visible gain.
- Still leave TradingAgents (LangGraph/LangChain, sync `propagate`, monkey-patches) in Python — so you never escape Python ops.

### When a **partial** Ash move *is* worth it

Pursue Ash/Phoenix for the **application shell** if one or more of these become real priorities:

1. **Horizontal scale / multi-worker** — today’s `job_manager`, WS map, and TTL caches are process-local; abort and live streams break across workers.
2. **Reliable background jobs** — Oban (persistent, retryable, observable) vs in-memory `asyncio.Task` + APScheduler.
3. **Team skill / ops consolidation** — you already run or prefer BEAM services and want one auth/policy/job story.
4. **LiveView consolidation** — collapse NextAuth + nginx `/api`/`/ws` split into one Phoenix endpoint and replace polling with PubSub.

If none of those are pressing, invest in the current stack: Redis/DB-backed job queue, sticky sessions or external WS, shared cache, thinner `portfolio.py` router. Same reliability goals, far less rewrite risk.

---

## 3. Subsystem fit scores

Score: **1** = keep Python / Next as-is · **3** = hybrid boundary · **5** = strong Ash/Phoenix candidate

| Subsystem | Score | Rationale |
|---|---|---|
| Auth, users, invites, roles | **5** | AshAuthentication + Ash policies map cleanly; simplifies NextAuth dual-token |
| Portfolios, holdings, snapshots, CSV | **5** | Classic Ash resources; LiveView forms/tables |
| Watchlist + cron schedules | **5** | Oban cron / Quantum instead of APScheduler reload |
| Delivery settings (email/webhook/Telegram) | **5** | Config + Oban delivery workers |
| App settings, API keys (encrypted), admin backup | **4** | Cloak for keys; policies for admin-only writes |
| Runs metadata, reports, outcomes, agent_events | **5** | Persistence + policies; Channels for live stream |
| Portfolio insights / chat / thesis (LLM HTTP) | **4** | Orchestration in Elixir; HTTP to providers stays easy |
| Finnhub / market / ticker metadata REST | **4** | httpx → Req; caching via Cachex or DB TTL |
| Job orchestration (start/abort/batch) | **5** | Oban + PubSub is a genuine upgrade over process memory |
| Live run UI (WS token stream) | **5** | Phoenix Channels / LiveView stream |
| TradingAgents graph execution | **1** | Stay Python; call via internal HTTP/gRPC/queue |
| Elliott Wave package | **1** | ~2.3k LOC + Plotly payloads; keep Python |
| Kalman / Markov (HMM) | **1–2** | scipy/pykalman/hmmlearn; thin Python sidecar |
| Wave Plotly frontend | **2** | LiveView JS hook or keep React island |
| HoldingsTable / InsightsDashboard UX | **3** | Possible in LiveView; high interaction cost |
| Client PDF / cron builder / CSV importer UI | **2** | Prefer hooks or server-side PDF; don’t port 1:1 |

**Bottom line:** ~60–70% of *application* surface area is Ash-friendly; ~100% of *differentiating analysis* is not.

---

## 4. Recommended target architecture (hybrid)

```
┌─────────────────────────────────────────────────────────┐
│  Phoenix + Ash (+ optional LiveView)                    │
│  Auth · Portfolio · Watchlist · Runs CRUD · Settings    │
│  Oban jobs · PubSub · Channels (live run / insights)    │
│  Finnhub/LLM REST · SMTP/webhook delivery               │
└───────────────┬─────────────────────┬───────────────────┘
                │ internal API        │ job enqueue
                ▼                     ▼
┌───────────────────────┐   ┌─────────────────────────────┐
│  Python Analysis API  │   │  Python Run Worker          │
│  /wave /regime /kalman│   │  TradingAgents.propagate    │
│  yfinance adapters    │   │  event stream → Phoenix     │
└───────────────────────┘   └─────────────────────────────┘
                │
                ▼
           PostgreSQL (shared schema or Ash-owned + analysis cache tables)
```

**Ownership rule:** Elixir owns identity, tenancy, CRUD, scheduling triggers, delivery, and run *lifecycle*. Python owns numeric engines and the TradingAgents graph. Never reimplement HMM/Elliott/LangGraph in Elixir.

---

## 5. What *not* to rewrite

1. **TradingAgents integration** (`trading_agent_runner.py`, grounding patches) — vendor sync graph; wrap it.
2. **`elliott_wave/`** — self-contained; expose HTTP already mirrored by `wave_service.py`.
3. **`kalman_service.py` / `markov_service.py`** — keep as Python endpoints; Elixir caches summaries if needed.
4. **Full Next.js → LiveView** in one shot — Plotly, PDF, holdings density, and antd cron UI are high-friction. Prefer API-compatible Phoenix first, LiveView later per domain.
5. **Alembic → Ash migrations big-bang** without a freeze window — prefer Ash reading existing schema (`base` resources) then incremental Ash migrations.

---

## 6. Phased plan (if pursuing hybrid)

### Phase 0 — Decide (gates)

Stop unless at least one gate is true:

- [ ] Need multi-instance backend or durable job retries
- [ ] Team commits to Elixir/Ash as primary app platform
- [ ] Willing to run Python as a long-lived sidecar indefinitely

Deliverable: written go/no-go with owner and success metrics (e.g. “abort works across 2 nodes”, “insight jobs retry on crash”).

### Phase 1 — Python analysis extraction (works even if Ash is cancelled)

Extract a narrow **Analysis Worker** from the current backend so the boundary exists before any Elixir work:

| Endpoint (internal) | Source today |
|---|---|
| `POST /internal/runs/execute` | `trading_agent_runner.execute_run` (stream events via callback URL or Redis/NATS) |
| `GET /internal/wave/{ticker}` | `wave_service` |
| `POST /internal/wave/{ticker}/analyze` | full chart payload |
| `GET /internal/regime/{ticker}` | `markov_service` |
| `GET /internal/kalman/{ticker}` | `kalman_service` |

Keep FastAPI as the public API temporarily; call the worker over localhost. This alone improves deploy isolation and is reusable by Ash later.

**Success:** Public API behavior unchanged; worker restart doesn’t take down HTTP CRUD.

### Phase 2 — Ash core (read-path + auth)

New Phoenix app; Ash resources mirroring existing tables (start with `AshPostgres` on current schema):

**First resources:** `User`, `ApiKey`, `AppSettings`, `Portfolio`, `PortfolioSnapshot`, `PortfolioHolding`, `Watchlist`, `WatchlistItem`, `InvestorProfile`.

- AshAuthentication (password + invite tokens) matching current JWT claims or Phoenix session.
- Policies: admin vs member; portfolio ownership; **team-shared runs** (current behavior — document explicitly).
- Cloak for encrypted provider keys.
- Dual-run: nginx routes a subset of `/api` to Phoenix; rest stays FastAPI.

**Success:** Login + portfolio holdings list/edit parity for one happy path; existing Next frontend pointed at Phoenix for those routes.

### Phase 3 — Jobs & runs lifecycle

- Ash resources: `Run`, `Report`, `AgentEvent`, `RunOutcome`, `PortfolioInsight`, delivery settings, thesis crossrefs.
- Oban: watchlist cron, daily morning insights, insight generation, outcome price fetch.
- Replace in-process `job_manager` with: Ash inserts `Run` → Oban job → Python worker → events posted back → `Phoenix.PubSub` / Channel.
- Abort = Oban cancel + worker cooperative cancel (define protocol).

**Success:** Start/abort run from UI; live page receives events via Channel; scheduler survives process restart.

### Phase 4 — Retire FastAPI public surface

Move remaining routers (market, tickers, admin backup, portfolio fan-out) to Ash/Phoenix. FastAPI container becomes **analysis-only**. Shrink nginx: `/api` + `/ws` → Phoenix; optional `/analysis` internal network only.

### Phase 5 — UI strategy (optional, separate decision)

| Approach | When |
|---|---|
| **A. Keep Next.js** | Lowest risk; Ash is JSON API + Channels only |
| **B. LiveView island-by-island** | Start with auth, settings, watchlist; keep Plotly/PDF as JS hooks |
| **C. Full LiveView** | Only after A/B prove UX parity on holdings + insights |

Do **not** block Phases 1–4 on LiveView.

### Phase 6 — Hardening

- Cachex (or Postgres) for former in-process TTL caches.
- Load test multi-node abort + WS fanout.
- Feature-flag cutover; delete FastAPI public routers; keep Python worker image in compose.
- Port critical pytest suites to ExUnit for Ash resources; keep Python tests for analysis worker.

---

## 7. Effort & risk (technical, not calendar)

| Workstream | Invasiveness | Main risks |
|---|---|---|
| Phase 1 Python extract | Medium — touch runner, wave/regime/kalman call sites | Event streaming protocol; env-var monkey-patch races |
| Phase 2 Ash CRUD/auth | High — new app, schema mapping, policy parity | Subtle authz drift (shared runs, global API keys) |
| Phase 3 Oban + Channels | High — redesign concurrency model | Abort semantics; duplicate runs; insight 409 guard |
| Phase 4 API cutover | Medium — many endpoints | Portfolio router is a god-module; easy to miss edge cases |
| Phase 5 LiveView | Very high if full | HoldingsTable / Plotly / PDF parity |

**Residual risk even when done well:** two runtimes in prod forever; TradingAgents upgrades still Python-side; team must know both stacks.

---

## 8. Ash resource sketch (Phase 2–3)

Illustrative only — mirror existing columns and relationships:

```
User
  has_one InvestorProfile
  has_one Watchlist → has_many WatchlistItem
  has_many Portfolio → has_many Snapshot → has_many Holding
                    → has_many PortfolioInsight
                    → has_one DeliverySettings

Run (team-readable; owner/admin mutable)
  has_one Report
  has_one RunOutcome
  has_many AgentEvent

ApiKey (global, admin write)
AppSettings (singleton, admin write)
TickerMetadata (global cache)
```

Policy notes (match today’s semantics, don’t “fix” tenancy during rewrite):

- Portfolios: owner-only.
- Runs list/stats: any authenticated user (team appliance).
- Run mutate/abort/delete: owner or admin.
- API keys / system settings: admin write, authenticated read where needed for execution.
- WS/Channel subscribe: today any auth user if run exists — decide whether to tighten.

---

## 9. Alternative: stay on Python (recommended default)

If gates in Phase 0 fail, do this instead of Ash:

1. Extract analysis worker anyway (Phase 1) — still valuable.
2. Replace `job_manager` with Redis/RQ, Dramatiq, Celery, or ARQ + persistent job rows.
3. Move WS to Redis pub/sub fanout (or sticky sessions documented).
4. Split `portfolio.py` into routers/services without changing stack.
5. Keep Next.js; fix polling → SSE/WS where painful.

You get most of the reliability upside Ash would buy, without a platform rewrite.

---

## 10. Decision matrix

| Goal | Prefer |
|---|---|
| Ship features on morning desk UX | **Stay Python + Next**; thin portfolio router |
| Multi-node jobs + Channels + Ash policies | **Hybrid Ash + Python worker** (Phases 0–4) |
| Single-language “pure Elixir” including quant | **Reject** — wrong tool for TradingAgents/HMM/Wave |
| LiveView-only UI | **Defer** until hybrid API is stable |

---

## 11. Recommendation

1. **Do not** rewrite AgentFloor wholesale in Elixir/Ash.
2. **Do** treat Python analysis (TradingAgents, wave, regime, kalman) as a permanent bounded context.
3. **Consider** Ash/Phoenix only for the application core **if** multi-node jobs/real-time and BEAM consolidation are explicit product goals — follow Phases 0→4, keep Next.js initially.
4. **Otherwise** invest in Phase 1 + a Python job queue; that is the highest leverage refactor relative to effort.

---

## Appendix A — Hotspots (reference)

| Path | Why it matters |
|---|---|
| `backend/app/routers/portfolio.py` | ~2k LOC god router — split before any port |
| `backend/app/services/trading_agent_runner.py` | Thread/queue/WS bridge — worker boundary |
| `backend/app/services/job_manager.py` | Process-local tasks — Oban/queue target |
| `backend/app/services/scheduler.py` | APScheduler — Oban cron target |
| `backend/elliott_wave/` | Stay Python |
| `frontend/lib/api.ts` + `types.ts` | Contract for dual-run cutover |
| `frontend/lib/websocket.ts` | Channel protocol replacement |
| `frontend/components/portfolio/HoldingsTable.tsx` | LiveView risk hotspot |

## Appendix B — Success metrics (hybrid)

- Abort of a run works with ≥2 Phoenix nodes and ≥2 Python workers.
- Watchlist cron and morning brief survive Phoenix restart (Oban persistence).
- Existing Next UI works against Phoenix for portfolio + runs without feature regression on authz.
- Analysis latency and TradingAgents behavior unchanged vs baseline.
- Single docker-compose path: `db`, `phoenix`, `analysis-worker`, `frontend` (optional), `nginx`.
