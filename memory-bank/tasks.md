# Tasks

## Active Task

**ID:** update-dependencies  
**Title:** Update frontend and backend dependencies  
**Created:** 2026-11-10  
**Status:** REFLECT complete → next `/archive`  
**Complexity:** Level 2 (Enhancement)

### Goal

Refresh AgentFloor **frontend (npm)** and **backend (uv)** locks to newest versions allowed by existing semver/constraint ranges. Defer intentional majors. Do not touch TradingAgents vendor pin.

---

## PLAN (Level 2) — 2026-11-10

### Locked decisions

| Topic | Decision |
|---|---|
| Bump policy | **Safe-only:** newest version that satisfies current `package.json` carets / `pyproject.toml` constraints |
| Majors | **Defer:** `plotly.js@4`, `react-plotly.js@4`, `react-pdf@11`, `react-dropzone@20`, `eslint@10`, `typescript@7`, `@types/node@26` |
| Frontend floors | **Raise** direct dep floors in `package.json` to the resolved Wanted versions (clarity + reproducible installs), then regenerate `package-lock.json` |
| Backend | `uv lock --upgrade` (or equivalent sync that refreshes lock within constraints); **do not** loosen `pyportfolioopt<2` or `apscheduler>=4.0.0a5` |
| APScheduler | Stay on **4.x alpha** line already pinned; ignore PyPI “latest” 3.11.x |
| uuid override | **Keep** `overrides.uuid = 14.0.3` |
| Vendor TradingAgents | **Out of scope** (TCC-10 / TCC-7) |
| Code fixes | Only if upgrade breaks build/tests — minimal compile/runtime fixes (same spirit as TCC-2 `noload` fix). No refactors |
| Creative mode | **Skip** — no UX/design choices |
| Branch | `cursor/update-dependencies-eeae` off `main` |
| PR | One PR: lock + any necessary compatibility fixes only |

### Technology validation (gate)

| Check | Result |
|---|---|
| Stack selection | Existing — npm (Next 16) + uv (Python 3.12 FastAPI). No new frameworks |
| Tooling present | `node`/`npm` available; install `uv` in BUILD if missing |
| Configs | `frontend/package.json`, `package-lock.json`, `backend/pyproject.toml`, `uv.lock` present |
| Hello-world / new PoC | **N/A** — dependency refresh only |
| Build validation | Deferred to BUILD verification matrix below |

### Target bumps (from locks @ PLAN time)

**Frontend — within-caret (lock → Wanted):**

| Package | Lock now | Target |
|---|---|---|
| next | 16.4.3 | 16.4.6 |
| eslint-config-next | 16.4.3 | 16.4.6 |
| antd | 6.6.8 | 6.7.0 |
| lucide-react | 1.66.0 | 1.70.0 |
| @tanstack/react-query | 5.105.0 | 5.107.1 |
| zustand | 5.0.16 | 5.1.0 |
| tailwindcss | 4.3.3 | 4.3.5 |
| @tailwindcss/postcss | 4.3.3 | 4.3.5 |

Also refresh any other direct deps whose lock lags caret max when `npm update` / reinstall runs (e.g. react/react-dom if not already at maxSatisfying). Leave majors pinned by current ranges.

**Backend — expected via `uv lock --upgrade`:**

| Package | Lock now | PyPI (constraint-ok) |
|---|---|---|
| fastapi | 0.162.0 | 0.162.2 |
| sqlalchemy | 2.1.6 | 2.1.8 |
| langchain-core | 1.7.3 | 1.7.7 |
| langchain-openai | 1.7.3 | 1.7.4 |
| pandas | 3.1.0 | 3.1.1 |
| yfinance | 1.7.0 | 1.8.0 |
| ruff (dev) | 0.17.3 | 0.17.4 |

Transitive upgrades allowed if constraint-compatible. Init `vendor/TradingAgents` submodule only as needed for path-dep resolve — **do not change gitlink SHA**.

### Phased BUILD

#### Phase 0 — Branch + tooling

- `git fetch origin main`; branch `cursor/update-dependencies-eeae`
- Ensure `uv` installed; `git submodule update --init --recursive` if backend path-dep requires it
- **Exit:** clean branch, tooling ready

#### Phase 1 — Frontend bump

- Update `frontend/package.json` floors for target packages above (and any other direct deps still below caret max)
- `cd frontend && npm install` (regenerate lock)
- Confirm majors did **not** land (`plotly.js` stays 3.x, `react-pdf` 10.x, `react-dropzone` 15.x, `react-plotly.js` 2.x, `eslint` 9.x, `typescript` 6.x)
- Keep `overrides.uuid`
- **Exit:** lock reflects targets; `npm ls` no peer disasters that block install

#### Phase 2 — Backend bump

- `cd backend && uv lock --upgrade` (with `--extra markov-hmm` / `--group dev` as project convention requires)
- `uv sync --group dev --extra markov-hmm`
- Diff `uv.lock`; confirm apscheduler still 4.0.0a*; pyportfolioopt still 1.x; tradingagents still path source
- **Exit:** lock upgraded; sync succeeds

#### Phase 3 — Verify + fix breakages

Frontend:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Backend:

- Import smoke: `python -c "import main"` (or app entry) from synced venv
- `python -m pytest` (or focused suite if full DB unavailable — note residual risk)
- Prefer full pytest when Postgres from `docker-compose.dev.yml` is reachable

If failures are upgrade-caused: minimal code fixes only; document in PR.

#### Phase 4 — Ship

- Commit message clear (locks + any fixes)
- Push `cursor/update-dependencies-eeae`
- Open PR via ManagePullRequest → `main`
- Update Memory Bank progress

### Challenges & mitigations

| Challenge | Mitigation |
|---|---|
| SQLAlchemy 2.1.x deprecations (TCC-2 precedent) | Run tests; fix call sites minimally |
| yfinance 1.8 API drift | Smoke import + any existing yfinance tests; no speculative rewrites |
| lucide-react icon renames across minors | `tsc` / lint catch removed exports |
| antd 6.7 minor UI API | `tsc` + build; no visual redesign |
| Submodule empty → uv sync fails | `git submodule update --init` without SHA change |
| Full pytest needs Postgres | Start `docker compose -f docker-compose.dev.yml up db` or report blocker |

### BUILD notes — 2026-11-10

Phases 0–4 done on `cursor/update-dependencies-eeae`. Frontend lint/tsc/build green; backend unit tests 191 passed. Full pytest blocked (no Docker Postgres).

### Acceptance checklist

- [x] Frontend lock/package.json updated for safe targets; majors deferred
- [x] Backend uv.lock refreshed; apscheduler 4.a* + pyportfolioopt 1.x preserved
- [x] Vendor gitlink unchanged
- [x] Frontend lint + tsc + build pass
- [x] Backend sync + unit smoke/tests pass (full DB suite residual)
- [x] PR open on `cursor/update-dependencies-eeae`

### Status checklist

- [x] VAN
- [x] PLAN
- [x] BUILD phases 0–4
- [x] REFLECT — `memory-bank/reflection/reflection-update-dependencies.md`
- [ ] ARCHIVE

### Next Mode

**`/archive`**
