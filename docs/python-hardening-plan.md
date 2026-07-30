# Python Hardening Plan

**Status:** in progress (Phase 0–1 implemented on `cursor/python-hardening-plan-6bf5`)  
**Decision:** Stay on FastAPI + Next.js. Skip Elixir/Ash.  
**Goals:** Extract an analysis worker, add a durable job queue (Oban-equivalent), fan out WebSocket events via Redis so multi-instance abort and live streams work.

Related context: [`docs/elixir-ash-refactor-plan.md`](elixir-ash-refactor-plan.md) (rejected full rewrite; this is the recommended default path).

---

## 1. Problem (today)

| Component | Path | Failure mode |
|---|---|---|
| Job map | `app/services/job_manager.py` | `_running_tasks` is process-local. `abort_run` only cancels if the run lives in *this* process. Second uvicorn worker / restart = orphaned work or silent abort miss. |
| Live stream | `app/services/websocket_manager.py` | Connections held in-memory. Worker A emitting events never reaches WS clients on API process B. |
| Run execution | `app/services/trading_agent_runner.py` | Calls `ws_manager.broadcast` directly; tightly coupled to the HTTP process. |
| Insights / delivery | `portfolio.py`, `scheduler.py` | `asyncio.create_task(generate_portfolio_insight…)` — lost on restart; no retry. |
| Boot lifespan | `main.py` | Marks all `pending`/`running` runs **failed** on startup — correct for in-memory tasks, wrong once jobs are durable. |
| Scheduler | `app/services/scheduler.py` | APScheduler in the API process; calls `start_run` / `create_task` in-process. |
| Infra | `docker-compose*.yml` | No Redis. Single `backend` service does HTTP + jobs + WS + cron. |

Frontend contract stays stable: REST + `ws://…/ws/runs/{id}?token=…` with the existing event payload shape (`started` / `token` / `completed` / `error` / `run_completed` / `run_aborted`).

---

## 2. Target architecture

```
                    ┌─────────────┐
   Browser ──WS───► │  nginx      │
   Browser ──HTTP─► │             │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     ┌─────────────────┐       ┌─────────────────┐
     │  api (N replicas)│       │  worker (M)     │
     │  FastAPI HTTP/WS │       │  job worker     │
     │  WS ↔ Redis sub  │       │  execute_run    │
     │  enqueue jobs    │       │  insights/etc   │
     │  APScheduler*    │       │  publish events │
     └────────┬─────────┘       └────────┬────────┘
              │                          │
              └──────────┬───────────────┘
                         ▼
              ┌─────────────────────┐
              │  Redis              │
              │  • job queues       │
              │  • pub/sub channels │
              │  • abort signals    │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  PostgreSQL         │
              │  runs, events, …   │
              └─────────────────────┘
```

\* One designated scheduler owner (API with `SCHEDULER_ENABLED=true`, or a tiny `scheduler` service). Other API replicas disable cron to avoid duplicate fires.

**Ownership**

| Concern | Owner |
|---|---|
| Auth, CRUD, Finnhub request-path, WS accept | `api` |
| TradingAgents `execute_run`, portfolio insights, delivery, outcome backfill (optional) | `worker` |
| Watchlist cron + daily insights trigger | single scheduler process (enqueue only) |
| Event fanout | Redis pub/sub; every `api` instance relays to local sockets |

Wave / regime / kalman stay **request-path on `api`** initially (already `asyncio.to_thread` + in-process TTL). Move to worker only if CPU contention shows up — YAGNI until then.

---

## 3. Technology choices

### 3.1 Job queue → **Procrastinate** (Postgres; Oban-like)

> **Note (implementation):** ARQ and taskiq-redis pin `redis<6`, but `tradingagents` requires `redis>=7.4`. Do **not** add ARQ. Use a Postgres-backed queue instead so Redis stays free for pub/sub + abort signals only.

| Option | Verdict |
|---|---|
| **Procrastinate** | **Choose.** Postgres job queue (retries, defer, cron-friendly). Closest Oban analogue; no Redis version conflict. |
| Thin custom Redis list worker | Acceptable fallback if Procrastinate feels heavy; use redis-py 7 directly. |
| ARQ / taskiq-redis | **Reject** — incompatible with TradingAgents' Redis 7 pin. |
| Celery | Reject — sync-first, heavy for this app. |

**Long runs:** set job timeout / `lock` ≥ `settings.run_timeout_seconds` (default 3600) + buffer. Keep cooperative cancel via Redis abort flag (below), not only worker kill.

**Queues (names / queues in Procrastinate)**

| Queue | Jobs | Concurrency notes |
|---|---|---|
| `runs` | `execute_trading_run` | Cloud: parallel workers OK. Local providers (`ollama`/`vllm`/`litellm`): dedicated queue `runs_local` with concurrency 1 (preserve today’s serial batch behavior). |
| `insights` | `generate_portfolio_insight_job` | One in-flight per portfolio still enforced in DB (existing 409 / status guard). |
| `delivery` | `deliver_insight_job` | After insight completes. |
| `maintenance` (optional later) | outcome price fetch, cache warm | |

### 3.2 WebSocket fanout → **Redis Pub/Sub**

- Channel: `af:run:{run_id}` (JSON event payloads identical to today’s WS messages).
- `api` lifespan: subscribe pattern `af:run:*` (or per-connection subscribe on connect — pattern is simpler for N runs).
- Worker **never** holds WebSockets; it only `PUBLISH`es.
- Optional later: Redis Streams if you need replay for late subscribers; Pub/Sub matches current “live only” UX.

### 3.3 Abort → Redis key + cooperative cancel

```
SET af:abort:{run_id} 1 EX <timeout+skew>
```

Worker loop (already draining queues in `execute_run`) checks the key periodically / between phases and raises `CancelledError` / sets `aborted`.  
`DELETE /runs/{id}` on any API replica sets the key and (best-effort) cancels the Procrastinate job id stored on the run or in Redis `af:job:{run_id}`.

Do **not** rely on in-process `task.cancel()` alone.

### 3.4 Redis client

- `redis.asyncio` (redis-py 7.x, already pulled by TradingAgents) for pub/sub + abort keys.
- Job durability lives in Postgres via Procrastinate (Phase 2); Redis is not the job broker.

---

## 4. Phased delivery

### Phase 0 — Infra & settings (no behavior change)

1. Add `redis:7-alpine` to `docker-compose.dev.yml` / `prod.yml` with healthcheck.
2. Add `REDIS_URL` to `app/config.py` (default `redis://localhost:6379/0`) and `.env.example`.
3. Add deps: `redis` (explicit; TradingAgents already needs 7.x). Job library (`procrastinate`) lands in Phase 2 — **not ARQ** (Redis pin conflict).
4. Document: single-node still works; Redis required for multi-replica event fanout.

**Exit:** compose up includes healthy Redis; backend still uses in-memory jobs (feature flag off).

### Phase 1 — Redis WS fanout (keeps in-process execution)

**Why first:** unlocks correct live UI once workers exist; low risk; API-compatible.

1. Introduce `app/services/event_bus.py`:
   - `publish_run_event(run_id, payload: dict)`
   - `subscribe_run_events(handler)` used from lifespan
2. Change `trading_agent_runner` to publish via event bus instead of calling `ws_manager` directly.
3. `WebSocketManager` remains the **local** socket registry; a Redis subscriber task forwards into `ws_manager.broadcast`.
4. Feature flag `EVENT_BUS_BACKEND=memory|redis` (default `memory` for unit tests without Redis; `redis` in compose).

**Tests**

- Unit: memory bus round-trip.
- Integration (Redis): publish from a fake “other process” → connected TestClient WS receives event.

**Exit:** Live page unchanged for single process; two API processes both receive events when one executes a run (manual or integration check).

### Phase 2 — Durable run queue + worker process

1. **Job API wrapper** — replace guts of `job_manager.py`:
   - `start_run` → defer Procrastinate job; store job id in Redis `af:job:{run_id}` (or nullable `runs.job_id` column if you prefer DB visibility).
   - `abort_run` → set abort key + cancel/abort Procrastinate job when supported.
   - `start_runs_batch` → enqueue to `runs` or `runs_local` based on provider (same split as today).
   - Keep function signatures so routers/scheduler call sites stay thin.
2. **Worker entrypoint** — e.g. `python -m app.worker` / `procrastinate worker`.
3. **Docker** — new `worker` service: same image as backend, different command; `depends_on: redis, db`. Scale with `docker compose up --scale worker=2`.
4. **Lifespan change** — stop blanket-failing all `pending`/`running` on API boot.
   - On API boot: do nothing to in-flight rows (worker owns them), **or** only fail runs with no matching job / stale heartbeat.
   - On worker boot: reclaim or fail jobs older than timeout with no heartbeat (define once).
5. **Heartbeat (minimal)** — worker sets `af:running:{run_id}` with TTL 60s and refreshes while `execute_run` runs; API abort/UI can show liveness; stale keys → mark failed via maintenance job.
6. **Scheduler** — `_fire_watchlist_item` keeps creating `Run` rows then calls `start_run` (now enqueue). `_fire_daily_portfolio_insights` enqueues insight jobs instead of `create_task`.

**Call sites to switch (already central)**

- `app/routers/runs.py` — create / abort / bulk abort  
- `app/routers/watchlist.py` — manual run  
- `app/routers/portfolio.py` — batch analyze  
- `app/services/scheduler.py` — scheduled run + daily insights  

**Tests**

- `job_manager` enqueue/abort with fake Procrastinate or redis mock.
- Integration: enqueue → worker executes mocked `execute_run` → status `completed`.
- Abort: enqueue long mock job → abort from “other” client → status `aborted`.
- Update scheduler tests that patch `start_run`.

**Exit:** Creating a run works with API and worker as separate containers; abort works against a run executing on the worker; API restart does not kill the worker’s run.

### Phase 3 — Insights, delivery, and other fire-and-forget

1. Replace `asyncio.create_task(generate_portfolio_insight…)` in `portfolio.py` and `scheduler.py` with enqueue on `insights`.
2. Replace `create_task(deliver_insight_if_configured…)` with `delivery` queue.
3. Preserve DB concurrency guard (one `pending`/`running` insight per portfolio).
4. Retries: transient LLM/network errors → Procrastinate retry with backoff; mark `failed` after max tries (align with current failure persistence).

**Exit:** Kill worker mid-insight → job retries or fails cleanly in DB; no silent loss.

### Phase 4 — Scheduler ownership & multi-api

1. Env `SCHEDULER_ENABLED` (default true for single-node compose; false on extra API replicas).
2. Optionally split `scheduler` service (same image, command that only runs APScheduler + enqueue). Prefer env flag first (fewer services).
3. Document Traefik/compose: sticky sessions **not** required for WS after Phase 1.

**Exit:** Two API replicas + one worker + Redis; watchlist cron fires once; WS works regardless of which API accepted the socket.

### Phase 5 — Optional follow-ups (not blocking)

| Item | When |
|---|---|
| Move wave/regime/kalman to worker | API CPU saturation |
| Redis cache for Finnhub/regime TTL maps | Multi-api cache stampedes |
| `runs.job_id` / admin “queue depth” diagnostics | Ops pain |
| Outcome backfill as queued job | Reliability of `outcome_service` |
| Split backend image (slim `api` without TradingAgents) | Image size / deploy speed — only after worker boundary is stable |

---

## 5. Module sketch (new / changed)

```
backend/app/
  config.py                 # + redis_url, event_bus_backend, scheduler_enabled, job settings
  worker.py                 # Procrastinate app + task functions
  services/
    job_manager.py          # enqueue/abort façade (keep public API)
    event_bus.py            # NEW memory|redis publish/subscribe
    websocket_manager.py    # local sockets only
    trading_agent_runner.py # publish via event_bus; poll abort key
    abort_signals.py        # NEW redis abort helpers
    scheduler.py            # enqueue only; honor SCHEDULER_ENABLED
```

Compose services: `db`, `redis`, `api` (rename from `backend` or keep name), `worker`, `frontend`, `nginx`.

---

## 6. Compatibility & non-goals

**Keep**

- Next.js frontend and NextAuth flow.
- WS URL and event JSON schema (`frontend/lib/websocket.ts`).
- TradingAgents in-process in the **worker** (still Python; still `asyncio.to_thread` + `_SyncEmitter`).
- APScheduler cron expressions / watchlist UX.
- Single-team authz semantics.

**Do not do in this plan**

- Elixir/Ash/LiveView.
- Rewriting Elliott Wave / Markov / Kalman.
- Requiring sticky WS sessions.
- Big-bang split of `portfolio.py` (optional cleanup; not required for hardening).
- Replacing in-process Finnhub caches in Phase 1–4 (Phase 5).

---

## 7. Rollout & risk

| Risk | Mitigation |
|---|---|
| Dual-write confusion during migration | Feature flag `JOB_BACKEND=memory|procrastinate`; default memory in tests; redis + procrastinate in compose |
| Lifespan fails durable jobs | Change fail-on-boot **in same PR** as worker cutover |
| Local LLM overload | Separate `runs_local` queue, `max_jobs=1` |
| Redis outage | Healthcheck; API `/health` can report redis; fail enqueue loudly (502/503) rather than silent `create_task` |
| Lost abort | Abort key TTL ≥ run timeout; runner checks key in drain/process loops |
| Duplicate scheduled insights | Keep DB in-flight guards; single scheduler owner |

**Success metrics**

1. Abort of a run executing on `worker` succeeds when requested via any `api` replica.  
2. Live run page receives token events with API and worker on different containers.  
3. API container restart mid-run does not mark the run failed while worker continues.  
4. Watchlist cron and morning insights enqueue durable jobs; worker crash mid-job retries or surfaces `failed`.  
5. Existing pytest suite green; new tests for bus + enqueue/abort path.

---

## 8. Suggested implementation order (PRs)

| PR | Scope |
|---|---|
| **A** | Redis compose + settings + deps; no behavior change |
| **B** | Event bus + runner publish + WS subscriber (`EVENT_BUS_BACKEND`) |
| **C** | Procrastinate worker + `job_manager` enqueue/abort + lifespan fix + `worker` service |
| **D** | Insights + delivery queues |
| **E** | `SCHEDULER_ENABLED` + multi-api compose notes / optional scale example |

Each PR should be shippable alone with flags defaulting to legacy behavior until the final compose switch.

---

## 9. Testing checklist

- [ ] Unit: event bus memory backend  
- [ ] Unit: abort signal set/clear  
- [ ] Unit: job_manager selects `runs` vs `runs_local`  
- [ ] Integration: Redis pub/sub → WS (TestClient)  
- [ ] Integration: Procrastinate worker completes mocked run  
- [ ] Integration: abort across “api” vs “worker” roles  
- [ ] Scheduler: still skips in-flight ticker; enqueues `start_run`  
- [ ] Regression: runs CRUD, watchlist manual run, portfolio batch  
- [ ] Manual: `docker compose up api worker redis db` — live page + abort  

---

## 10. Recommendation

Execute **Phases 0→4** on the current stack. Treat Redis (WS/abort) + Procrastinate (jobs) + worker as the Oban/Channels equivalent without a platform rewrite. Defer cache extraction and quant offload until metrics demand them.

Default compose after cutover:

```yaml
# conceptual
services:
  db: …
  redis: …
  api:      # uvicorn — SCHEDULER_ENABLED=true (one replica)
  worker:   # procrastinate worker (python -m app.worker)
  frontend: …
  nginx: …
```
