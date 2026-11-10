# Level 2 Enhancement Reflection: update-dependencies

## Enhancement Summary

Refreshed AgentFloor frontend (npm) and backend (uv) locks to newest versions allowed by existing semver/constraint ranges on branch `cursor/update-dependencies-eeae` ([PR #87](https://github.com/mjanker4247/trading-command-center/pull/87)). Raised `package.json` floors for clarity, ran `uv lock --upgrade`, deferred intentional majors (plotly 4, react-pdf 11, react-dropzone 20, etc.), and left TradingAgents vendor pin, apscheduler 4.x alpha, pyportfolioopt 1.x, and the uuid override unchanged. No application code changes were required.

## What Went Well

- Locked **safe-only** policy in PLAN before BUILD prevented accidental major jumps while still landing useful minors/patches (next 16.4.6, antd 6.7.0, lucide 1.70.0, query 5.107.1, fastapi/sqlalchemy/yfinance bumps).
- Frontend verification matrix was decisive: lint (0 errors), `tsc --noEmit`, and `next build` all passed on 16.4.6 with no compatibility fixes.
- Backend unit gate held: after `uv sync`, `pytest -m unit` returned **191 passed**; `import main` succeeded once proper hex secrets were set.
- Critical pins survived upgrade: apscheduler `4.0.0a6`, pyportfolioopt `1.6.0`, uuid `14.0.3`, vendor gitlink `c454491` (v0.7.1).

## Challenges Encountered

- Cloud env lacked `uv`, `node_modules`, `.venv`, Docker, and Postgres — tooling bootstrap and incomplete full-suite pytest were friction points.
- `ENCRYPTION_KEY` must be 64 hex chars; a Fernet key string failed Settings validation and broke collection until corrected.
- `uv lock --upgrade` pulled transitive **google-genai 2.34 → 3.0** (major) even under “safe” direct constraints — easy to miss in a floor-only review.
- `npm outdated` without install reports everything as MISSING; PLAN needed lock-vs-semver maxSatisfying analysis instead.

## Solutions Applied

- Installed `uv` via pip, initialized submodule for path-dep resolve (no SHA change), and documented Postgres residual risk rather than inventing a DB.
- Used `openssl rand -hex 32` for both JWT and encryption secrets for smoke/import.
- Explicit major guards after npm install (`plotly.js` 3.x, `react-pdf` 10.x, etc.) plus lock greps for apscheduler/pyportfolioopt.
- Surveyed locks with Node `semver.maxSatisfying` against `npm view … versions` for accurate Wanted targets.

## Key Technical Insights

- Raising `package.json` floors to Wanted + regenerating the lock is clearer for reviewers than lock-only drift under old floors.
- “Within constraints” on uv is not “no majors in the tree”; review `uv lock --upgrade` output for transitive major lines (google-genai).
- APScheduler’s PyPI “latest” is still 3.x while the project intentionally tracks 4.0.0a* — never trust unfiltered “outdated” lists for that package.
- Settings validate at import time; any smoke that loads `main` needs non-default secrets even when tests later override `DATABASE_URL`.

## Process Insights

- Level 2 VAN → PLAN → BUILD fit well: the only design choice was bump policy, which PLAN locked without CREATIVE.
- Separating vendor TradingAgents work (TCC-10) from app lock refresh kept this PR reviewable and avoided blocked RC hunting.
- Memory Bank task docs belonging in the same PR matched prior project practice (`reflection-vendor-ta-0.7.1-integrate` post-note).

## Action Items for Future Work

- Add a short dep-refresh checklist: major guards + scan `uv lock` upgrade log for `vN → vN+1` transitive majors before merge.
- Prefer `pytest -m unit` as the default cloud verify when Docker/Postgres is unavailable; run full suite when `db` is up.
- Schedule a follow-up (separate task) if/when adopting deferred majors: plotly.js 4 + react-plotly.js 4, react-pdf 11, react-dropzone 20.
- Optionally pin or constrain `google-genai` if GenAI client majors prove noisy across TradingAgents upgrades.

## Time Estimation Accuracy

- Estimated BUILD: single linear pass (floors → locks → verify → PR); no calendar estimate per cloud guidance
- Actual BUILD: one session — frontend/backends locks + verify + PR #87 without code fixes
- Variance: low — PLAN targets matched landed versions; no surprise API breakages
- Reason: safe-only policy and prior TCC-2 hygiene kept the blast radius small

## Next Steps

- `/archive` after reflection is recorded (and when PR merge status is known/desired)
- Monitor PR #87 CI when checks appear
