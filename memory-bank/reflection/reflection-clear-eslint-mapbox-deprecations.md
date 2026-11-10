# Level 2 Enhancement Reflection: clear-eslint-mapbox-deprecations

## Enhancement Summary

Cleared the npm deprecation for direct `eslint@9.39.5` (ESLint v9 EOL) by bumping the frontend to `eslint@^10.14.0`, while documenting `@plotly/mapbox-gl@1.13.4` as an unavoidable transitive of `plotly.js@3.7.0` (plotly.js 4 deferred to protect WavePanel). Shipped on [`cursor/clear-eslint-mapbox-deprecations-40b1`](https://github.com/mjanker4247/trading-command-center/pull/90); **merged** to `main` as `ed7464e` (2026-11-10). No application/chart code changes.

## What Went Well

- Root-cause split (direct vs transitive) made the smallest-safe-change policy obvious: upgrade eslint; document mapbox.
- Re-evaluating the previously deferred eslint 10 major was justified once npm marked v9 EOL — flat config + Node 22 + `eslint-config-next@16.4.6` (`peer: eslint >= 9`) made the bump low-friction.
- Verification matrix held: `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build` (Next 16.4.6) all green before PR.
- CI on #90 (backend + frontend) went green; merge completed cleanly after a short wait.
- Retrospective `/plan` against shipped #90 confirmed zero policy drift — useful when BUILD raced ahead of formal PLAN docs.

## Challenges Encountered

- eslint 10 install surfaces **ERESOLVE peer overrides** because `eslint-plugin-react` / `import` / `jsx-a11y` still advertise peers ≤9 (Next docs acknowledge this lag).
- `@plotly/mapbox-gl` cannot be cleared without a **plotly.js 4** chart major; documenting the pin leaves a residual install warn by design.
- PLAN was initially done inline during VAN/BUILD; a follow-up retrospective PLAN pass was needed to satisfy Memory Bank workflow formality.
- Cloud env lacked `node_modules` at start — full `npm install` required before smoke.

## Solutions Applied

- Kept Next ESLint stack (`eslint-config-next` + existing `eslint.config.mjs`); did not replace plugins just to silence peers.
- Recorded the mapbox pin in `memory-bank/techContext.md` and PR #90 body so reviewers see the residual is intentional.
- Wrote Level 2 PLAN retrospectively into `tasks.md` after BUILD, then merged when CI finished.
- Used CI subscription wait before merge rather than force-merging on pending checks.

## Key Technical Insights

- npm deprecation of an entire major line (eslint `<10`) is a stronger trigger to adopt a deferred major than “Latest available” alone.
- Full `plotly.js` 3.x still ships `@plotly/mapbox-gl` even when the app only uses candlestick — bundle shape, not usage, drives the warn.
- `eslint-config-next@16.4+` is enough for eslint 10 functionally; peer ranges on nested plugins lag and are noise under npm’s override behavior.
- Waiting for terminal CI before merge kept TCC-15’s merge story clean (no red/green flip drama).

## Process Insights

- Level 2 VAN → PLAN → BUILD → REFLECT fits deprecation work; CREATIVE correctly skipped (binary upgrade vs document).
- When BUILD lands before a formal PLAN write-up, a **retrospective PLAN** against shipped artifacts is enough — do not reopen scope.
- Separate Memory Bank status commits (#91) after merge are fine for post-merge bookkeeping without touching the already-merged code PR.

## Action Items for Future Work

- Track a dedicated follow-up for **plotly.js 4 + react-plotly.js 4** to clear `@plotly/mapbox-gl` (WavePanel candlestick regression smoke required).
- Revisit eslint plugin peer noise when upstream plugins advertise eslint 10; no action until then.
- Prefer “EOL/deprecated on npm” as an explicit PLAN criterion for un-deferring majors previously parked in dep-refresh tasks.
- Run `/archive` next to close TCC-15 Memory Bank lifecycle.

## Time Estimation Accuracy

- Estimated: single BUILD pass (bump → verify → PR); no calendar estimate per cloud guidance
- Actual: one session for BUILD + PR #90; short CI wait then merge; PLAN/reflect docs followed
- Variance: low — policy matched ship; no chart or lint-config rework
- Reason: smallest-safe-change rule and prior plotly-4 deferral kept scope tight

## Next Steps

- `/archive` — write `memory-bank/archive/archive-clear-eslint-mapbox-deprecations.md`, clear active task
- Merge or fold docs PR [#91](https://github.com/mjanker4247/trading-command-center/pull/91) (Memory Bank merge/reflect status)
- Optional: queue plotly.js 4 task separately from TCC-15
