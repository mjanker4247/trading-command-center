# TASK ARCHIVE: clear-eslint-mapbox-deprecations

## METADATA

| Field | Value |
|---|---|
| Task ID | `clear-eslint-mapbox-deprecations` (TCC-15) |
| Complexity | Level 2 (Simple Enhancement) |
| Created | 2026-11-10 |
| Completed | 2026-11-10 |
| Workflow | VAN → PLAN → BUILD → REFLECT → ARCHIVE |
| Branch | `cursor/clear-eslint-mapbox-deprecations-40b1` |
| PR | [#90](https://github.com/mjanker4247/trading-command-center/pull/90) **MERGED** `ed7464e` |
| Docs PR | [#91](https://github.com/mjanker4247/trading-command-center/pull/91) (Memory Bank post-merge bookkeeping) |

## SUMMARY

Cleared npm deprecation for direct `eslint@9.39.5` (ESLint v9 EOL) by bumping frontend to `eslint@^10.14.0`. Documented `@plotly/mapbox-gl@1.13.4` as an unavoidable transitive of `plotly.js@3.7.0`; plotly.js 4 deferred to protect WavePanel. No application or chart code changes.

## REQUIREMENTS

1. Find why packages are pulled (direct vs transitive)
2. Clear or mitigate deprecations with smallest safe change
3. Keep Next/React/plotly charts working; lint/tsc/build smoke
4. Open a PR if code/lock changes; else report upstream-only

## IMPLEMENTATION

- **eslint (direct):** `^9.39.5` → `^10.14.0`; kept `eslint-config-next@16.4.6` + existing flat `eslint.config.mjs`
- **mapbox (transitive):** documented pin in `memory-bank/techContext.md`; no plotly major
- PLAN locked upgrade-vs-document policy; CREATIVE skipped; retrospective PLAN confirmed ship match
- Commits on feature branch: `ff2c2a2` (eslint bump), `fbd1509` / `e0170ce` (Memory Bank); merge `ed7464e`

### Key files modified

- `frontend/package.json`
- `frontend/package-lock.json`
- `memory-bank/tasks.md`, `activeContext.md`, `progress.md`, `techContext.md`
- `memory-bank/reflection/reflection-clear-eslint-mapbox-deprecations.md`
- `memory-bank/archive/archive-clear-eslint-mapbox-deprecations.md` (this file)

## TESTING

- `npm install` — eslint 9 deprecate warn cleared; residual `@plotly/mapbox-gl` warn expected
- `npm run lint` — 0 errors (37 pre-existing warnings)
- `npx tsc --noEmit` — pass
- `npm run build` — Next 16.4.6 pass
- CI on #90 — backend + frontend green before merge

## LESSONS LEARNED

- npm EOL deprecation is a strong signal to un-defer a parked major (eslint 10)
- Full plotly.js 3.x still pulls `@plotly/mapbox-gl` even for candlestick-only usage
- Accept eslint plugin peer ERESOLVE noise until upstream peers include 10
- Retrospective PLAN is enough when BUILD lands first; wait for CI before merge

## DEFERRED / OPTIONAL

- Dedicated task: plotly.js 4 + react-plotly.js 4 to clear `@plotly/mapbox-gl`
- Revisit eslint plugin peer warnings when plugins advertise eslint 10

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-clear-eslint-mapbox-deprecations.md`
- PR: https://github.com/mjanker4247/trading-command-center/pull/90
- Prior: `archive-update-dependencies.md` (deferred eslint 10 / plotly 4); `archive-fix-node22-ebadengine.md` (Node 22 engines)
