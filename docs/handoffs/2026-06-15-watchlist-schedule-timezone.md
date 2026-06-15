# Handoff: Watchlist schedule timezone (`feat/watchlist-schedule-timezone`)

**Branch:** `feat/watchlist-schedule-timezone`  
**Remote:** `origin/feat/watchlist-schedule-timezone`  
**Base commit:** `c3e0ba5` — `feat: add timezone-aware watchlist scheduling`  
**Status:** Feature implemented end-to-end; follow-ups below before merge.

---

## Goal

Let each watchlist item run on a cron schedule in a **specific IANA timezone** (not server UTC). Users should see when the next run fires, edit schedules inline, and trust that invalid cron/timezone pairs are rejected at the API.

---

## What shipped

### Backend

| Area | Change |
|------|--------|
| **Model** | `WatchlistItem.schedule_timezone` (`String(64)`, default `UTC`) |
| **Migration** | `backend/alembic/versions/h8i9j0k1l2m3_add_schedule_timezone_to_watchlist_items.py` |
| **Validation** | `backend/app/utils/cron_validation.py` — normalize cron, validate IANA tz, build `CronTrigger` |
| **Router** | Create/update validate cron+tz; PATCH uses `exclude_unset`; 422 on bad combos |
| **Scheduler** | `_reload_jobs()` registers APScheduler jobs with per-item timezone; invalid DB rows skipped with warning; `_sync_next_run_times()` writes `next_run_at`; skip fire if prior run still `pending`/`running` |
| **Diagnostics** | `GET /watchlist/scheduler/jobs` returns `running`, `state`, job list with ISO `next_fire_time` |

### Frontend

| Area | Change |
|------|--------|
| **Add form** | Sends `schedule_timezone` = browser tz (`Intl.DateTimeFormat`) |
| **Table** | `CronLabel` shows human label + timezone + `next_run_at` |
| **Inline edit** | Calendar icon opens expandable `ScheduleBuilder` row; saves via PATCH |
| **Status bar** | Polls `getSchedulerJobs()` every 60s — running/stopped + job count |
| **API** | `getSchedulerJobs()`, `updateWatchlistItem` surfaces backend `detail` on 422 |

### Tests

- `backend/tests/test_cron_validation.py` — unit tests for validation helpers + `_build_watchlist_schedule_specs`
- `backend/tests/test_watchlist_scheduler.py` — API 422/201 paths for cron create/patch (scheduler mocked)

---

## Key files

```
backend/app/utils/cron_validation.py          # shared validation
backend/app/services/scheduler.py           # job registration + fire logic
backend/app/routers/watchlist.py            # API contracts
backend/app/models/watchlist.py             # schedule_timezone column
frontend/app/(app)/watchlist/page.tsx       # ScheduleBuilder, CronLabel, edit UX
frontend/lib/api.ts                         # getSchedulerJobs, error detail
frontend/lib/types.ts                       # schedule_timezone, SchedulerJobsResponse
```

---

## How to verify locally

```bash
# DB (if not already up)
docker compose -f docker-compose.dev.yml up db

# Apply migration
cd backend
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic upgrade head

# Tests
python -m pytest tests/test_cron_validation.py tests/test_watchlist_scheduler.py -q

# Full stack
cd .. && docker compose -f docker-compose.dev.yml up --build
# or backend: python -m uvicorn main:app --reload
#    frontend: npm run dev
```

**Manual checks**

1. Add watchlist item with weekday schedule → `schedule_timezone` matches browser tz in network response.
2. Edit schedule inline → PATCH succeeds; scheduler job count updates (status bar).
3. PATCH invalid cron → UI shows backend error message (not generic "Failed to update").
4. `GET /watchlist/scheduler/jobs` (authenticated) → `running: true`, `wl_<uuid>` jobs with `next_fire_time`.
5. After `reload_jobs()`, item `next_run_at` populated on `GET /watchlist`.

---

## Architecture notes

```mermaid
sequenceDiagram
  participant UI as Watchlist UI
  participant API as watchlist router
  participant DB as PostgreSQL
  participant SCH as scheduler.py
  participant APS as APScheduler

  UI->>API: POST/PATCH item (cron, timezone)
  API->>API: parse_cron_trigger(cron, tz)
  API->>DB: persist
  API->>SCH: reload_jobs()
  SCH->>DB: load enabled items with cron
  SCH->>APS: add_schedule(trigger=tz-aware CronTrigger)
  SCH->>DB: sync next_run_at from APS schedules
  APS-->>SCH: fire _fire_watchlist_item(item_id)
  SCH->>DB: create Run, start_run (skip if prior pending/running)
```

- Cron format: **standard 5-field** (`minute hour dom month dow`), interpreted in `schedule_timezone`.
- `reload_jobs()` is called after every watchlist mutation (existing pattern).
- Invalid cron rows in DB do **not** break reload — they are logged and skipped.

---

## Known gaps / recommended follow-ups

Prioritize in this order:

### 1. Timezone picker (UI) — **high**

- Add form and inline edit use browser tz only; **no control to change timezone** after add.
- `ScheduleBuilder` displays timezone in preview but cannot edit it.
- **Task:** Add IANA timezone `<select>` (curated list or `Intl.supportedValuesOf('timeZone')` with fallback) to add form and inline edit drawer; persist via `schedule_timezone` on create/patch.

### 2. ScheduleBuilder does not hydrate from existing cron — **high**

- Opening edit always starts at defaults (`weekdays`, 9:00, Mon) regardless of stored cron.
- **Task:** Parse common patterns (`daily`, `weekdays`, `weekly`, `custom_days`) from `item.schedule_cron` into initial state, or show read-only current cron + builder for replacement.

### 3. User-visible invalid schedule state — **medium**

- Backend skips invalid cron at scheduler load (warning log only).
- **Task:** Surface on item row (badge/warning) when cron exists but job not registered; optional admin diagnostic on `GET /watchlist/scheduler/jobs` mapping item id → registered.

### 4. Scheduler integration tests — **medium**

- Current tests mock `reload_jobs`; no test that `_reload_jobs` registers correct timezone trigger or updates `next_run_at`.
- **Task:** Add focused test with test scheduler or mock `AsyncScheduler.add_schedule` asserting trigger timezone.

### 5. Migration on deploy — **required before prod**

- Run `alembic upgrade head` in deployment pipeline / startup if not automated.

### 6. Frontend error UX on add — **low**

- `addWatchlistItem` may still throw generic error on 422; mirror `updateWatchlistItem` detail parsing.

### 7. DST / edge cases — **low**

- Document that APScheduler + `zoneinfo` handle DST; add test with `America/New_York` spring forward if regressions suspected.

---

## Out of scope (do not expand unless asked)

- Changing daily portfolio insights timezone logic (already uses `PortfolioDeliverySettings.delivery_timezone`).
- Cron expressions beyond 5-field crontab (no seconds field).
- Per-user global default timezone setting in DB.

---

## Conventions to preserve

- Backend validation mandatory; client checks are UX only.
- Watchlist mutations → `reload_jobs()` so scheduler picks up changes without restart.
- Match existing patterns in `watchlist.py` router, Pydantic validators, TanStack Query invalidation (`watchlist` + `watchlist-scheduler` keys).
- Minimal diff; add focused tests for new service logic only.

---

## Suggested acceptance criteria for merge

- [ ] Migration applied in dev/staging
- [ ] `pytest tests/test_cron_validation.py tests/test_watchlist_scheduler.py` green
- [ ] User can pick timezone when adding/editing schedule
- [ ] Edit schedule opens with current cron reflected in builder (or clear equivalent UX)
- [ ] `next_run_at` visible and updates after schedule save
- [ ] No new lint/type warnings in touched files (`npm run lint`, `npx tsc --noEmit` on frontend)

---

## Commands for next agent

```bash
git fetch origin
git checkout feat/watchlist-schedule-timezone
git pull origin feat/watchlist-schedule-timezone

# Read this handoff
cat docs/handoffs/2026-06-15-watchlist-schedule-timezone.md

# Start with gap #1 (timezone picker) unless user redirects
```

---

## PR creation (when ready)

```bash
gh pr create --base main --head feat/watchlist-schedule-timezone \
  --title "feat: timezone-aware watchlist scheduling" \
  --body "$(cat <<'EOF'
## Summary
- Persist per-item schedule timezones and validate cron/timezone on write
- Register APScheduler jobs with timezone-aware triggers; sync next_run_at
- Watchlist UI: inline schedule edit, scheduler status bar, next-run display

## Test plan
- [ ] alembic upgrade head on fresh DB
- [ ] pytest cron + watchlist scheduler tests
- [ ] Add/edit schedule in UI with non-UTC timezone
- [ ] Confirm GET /watchlist/scheduler/jobs shows registered jobs

EOF
)"
```
