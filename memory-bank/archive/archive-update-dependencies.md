# TASK ARCHIVE: update-dependencies

## METADATA

| Field | Value |
|---|---|
| Task ID | `update-dependencies` |
| Complexity | Level 2 (Simple Enhancement) |
| Created | 2026-11-10 |
| Completed | 2026-11-10 |
| Workflow | VAN → PLAN → BUILD → REFLECT → ARCHIVE |
| Branch | `cursor/update-dependencies-eeae` |
| PR | https://github.com/mjanker4247/trading-command-center/pull/87 (open at archive time) |

## SUMMARY

Refreshed AgentFloor **frontend (npm)** and **backend (uv)** dependency locks to newest versions allowed by existing semver/constraint ranges. Raised `package.json` floors for clarity, deferred intentional majors, preserved apscheduler 4.x alpha, pyportfolioopt 1.x, uuid override, and TradingAgents vendor pin. No application code changes required.

## REQUIREMENTS

1. Update outdated frontend and backend modules within safe ranges
2. Do not adopt deferred majors (plotly 4, react-pdf 11, react-dropzone 20, etc.)
3. Keep vendor TradingAgents gitlink unchanged (separate TCC-10 track)
4. Verify with lint/tsc/build and backend unit tests
5. Open a reviewable PR with lock + Memory Bank docs only

## IMPLEMENTATION

- PLAN locked safe-only bump policy; CREATIVE skipped
- Frontend: raised floors → `npm install` (next 16.4.6, antd 6.7.0, lucide-react 1.70.0, @tanstack/react-query 5.107.1, zustand 5.1.0, tailwindcss 4.3.5, …)
- Backend: `uv lock --upgrade` + `uv sync --group dev --extra markov-hmm` (fastapi 0.162.2, sqlalchemy 2.1.8, yfinance 1.8.0, pandas 3.1.1, langchain-* patches, ruff 0.17.4)
- Preserved: apscheduler `4.0.0a6`, pyportfolioopt `1.6.0`, uuid `14.0.3`, vendor `c454491` (v0.7.1)
- Commits: `cc6b96f` (locks), `edcd303` (reflection); archive commit follows on same branch

### Key files modified

- `frontend/package.json`
- `frontend/package-lock.json`
- `backend/uv.lock`
- `memory-bank/**` (tasks, activeContext, progress, techContext, productContext, reflection, archive)

## TESTING

- Frontend: `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build` (Next 16.4.6) — pass
- Backend: `import main` with hex secrets; `pytest -m unit` — **191 passed**
- Residual: full DB pytest not run (no Docker/Postgres in cloud env)
- Note: transitive `google-genai` 2.34 → 3.0 via uv upgrade; unit suite still green

## LESSONS LEARNED

- Safe-only policy + major guards keep dep PRs small and mergeable
- Scan `uv lock --upgrade` output for **transitive** majors even when direct deps stay within range
- Prefer lock-vs-`semver.maxSatisfying` surveys over `npm outdated` when `node_modules` is missing
- Use `pytest -m unit` as default cloud verify when Postgres is unavailable

## DEFERRED / OPTIONAL

- Major upgrades: plotly.js 4 + react-plotly.js 4, react-pdf 11, react-dropzone 20, eslint 10, typescript 7, @types/node 26
- Full pytest with `docker compose … up db`
- Optional pin/constraint on `google-genai` if GenAI client majors stay noisy

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-update-dependencies.md`
- PR: https://github.com/mjanker4247/trading-command-center/pull/87
- Prior related: TCC-2 (`3c9d65a` Upgrade app dependencies…); vendor pin archive `archive-vendor-ta-0.7.1-integrate.md`
