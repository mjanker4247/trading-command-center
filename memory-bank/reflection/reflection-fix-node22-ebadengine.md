# Level 1 Reflection: fix-node22-ebadengine

## Summary

Fixed `npm warn EBADENGINE` for `@mapbox/jsonlint-lines-primitives@2.0.3` (requires Node ≥22) by bumping frontend Docker, CI, `package.json` engines, and local-dev docs from Node 20 → 22. Merged as [PR #88](https://github.com/mjanker4247/trading-command-center/pull/88) → `main` `b49ef69` (Europe/Berlin 2026-11-10 07:06).

## Solution

| Change | Detail |
|---|---|
| `frontend/Dockerfile` | `node:22-alpine` builder + runner |
| `.github/workflows/test.yml` | frontend `node-version: 22` |
| `frontend/package.json` | `"engines": { "node": ">=22" }` |
| `docs/local-development.md` | Node 22+ |

Did **not** pin-downgrade the mapbox transitive or enable `engine-strict` globally.

## What Went Well

- Root cause was obvious from the warn + lock `engines` field.
- Level 1 path (VAN → implement → mini-PLAN → merge) stayed small; no creative phase.
- Worktree from `origin/main` avoided clobbering local Memory Bank / lock WIP.
- CI went green (backend + frontend) before merge.

## Challenges

- Docker daemon unavailable in the agent environment — could not reproduce the warn inside `node:20-alpine`; relied on lock engines + CI Node 22 job.
- `ManagePullRequest` is bound to the TradingAgents workspace, so the TCC PR had to be opened with `gh`.

## Lessons Learned

- Plotly/mapbox-gl transitive engines can outpace the app’s Docker/CI Node pin; when bumping frontend deps (e.g. #87), re-check `engines` on new lock entries.
- Declare `package.json` `engines` when raising the floor so local and Docker stay aligned with CI.
- Prefer raising the runtime (Node 22 LTS) over fighting transitive `engines` with overrides.

## Action Items

- On next frontend lock refresh: scan lock for `engines.node` floors above the CI/Docker pin.
- Optional: document Node 22 in README/install scripts if they still imply Node 20.
- Next Memory Bank step: `/archive`.

## Time

- Estimate: ~15–30 min Level 1  
- Actual: ~one short session (implement + PR + CI wait + merge)  
- Variance: on target
