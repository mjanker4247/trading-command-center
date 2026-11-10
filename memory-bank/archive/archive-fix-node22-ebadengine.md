# TASK ARCHIVE: Fix npm EBADENGINE (Node 22)

## METADATA

| Field | Value |
|---|---|
| Task ID | `fix-node22-ebadengine` |
| Complexity | Level 1 (Quick Bug Fix) |
| Created | 2026-11-10 |
| Completed | 2026-11-10 (Europe/Berlin) |
| Workflow | VAN → mini-PLAN → BUILD → REFLECT → ARCHIVE |

## SUMMARY

Raised the frontend Node runtime from **20** to **22** so Docker/`npm ci` no longer emits `EBADENGINE` for `@mapbox/jsonlint-lines-primitives@2.0.3` (requires `node: '>= 22'`, pulled in via plotly/mapbox-gl). Merged [PR #88](https://github.com/mjanker4247/trading-command-center/pull/88) → `main` `b49ef69`.

## REQUIREMENTS

1. Eliminate Node engine mismatch warning during frontend image/`npm ci` builds
2. Keep Docker, CI, and local docs aligned on the new floor
3. Do not fight the transitive with overrides or downgrades

## IMPLEMENTATION

| File | Change |
|---|---|
| `frontend/Dockerfile` | `node:20-alpine` → `node:22-alpine` (builder + runner) |
| `.github/workflows/test.yml` | frontend `node-version: 20` → `22` |
| `frontend/package.json` | `"engines": { "node": ">=22" }` |
| `docs/local-development.md` | Node 20+ → Node 22+ |

- Branch: `cursor/fix-node22-ebadengine-3558` @ `e727869`
- Merge commit: `b49ef69`

## TESTING

- Lock confirmed `@mapbox/jsonlint-lines-primitives@2.0.3` engines `>= 22`
- Local Node 24 `npm ci --ignore-scripts` — no EBADENGINE
- PR CI: backend SUCCESS, frontend SUCCESS before merge
- Docker Node 20 reproduction skipped (daemon unavailable in agent env)

## LESSONS LEARNED

- After frontend lock refreshes, scan new lock entries for `engines.node` above the CI/Docker pin
- Prefer raising Node LTS (22) over package overrides
- Declare `package.json` `engines` when the floor moves

## DEFERRED / OPTIONAL

- Sweep README/install scripts for leftover “Node 20” wording
- On next `npm` lock bump: automated engines-floor check vs Dockerfile/CI

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-fix-node22-ebadengine.md`
- PR: https://github.com/mjanker4247/trading-command-center/pull/88
- Internal: Project store `internal/fix-node22-ebadengine.md`
