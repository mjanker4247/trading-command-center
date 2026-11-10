# Tasks

## Current Task

**clear-eslint-mapbox-deprecations** (TCC-15) — Clear npm deprecation warnings for `eslint@9.39.5` and `@plotly/mapbox-gl@1.13.4`.

## Complexity

**Level 2 (Simple Enhancement)** — VAN → PLAN → BUILD → REFLECT

| Factor | Assessment |
|---|---|
| Scope | Frontend `package.json` / lock + Memory Bank docs |
| Risk | Medium for eslint 10 peer noise; low for mapbox (document-only) |
| Effort | One major bump (eslint), verify lint/tsc/build; document plotly pin |
| Creative | Not required — options are upgrade vs document |

## Status

- [x] Task definition (VAN)
- [x] Implementation plan (PLAN)
- [x] Execution (BUILD) — eslint → 10.14.0; mapbox documented; lint 0 errors / tsc / build pass
- [ ] Documentation / reflection

## Root Cause (VAN)

### `eslint@9.39.5` — **direct** `devDependency`

- Declared as `"eslint": "^9.39.5"` in `frontend/package.json`.
- npm deprecated message: *"This version is no longer supported"* — ESLint v9 line reached **EOL 2026-08-06**; only v10.x is Current ([version support](https://eslint.org/version-support/)).
- Already on flat config (`eslint.config.mjs` + `eslint-config-next` / core-web-vitals + typescript).
- `eslint-config-next@16.4.6` peers `eslint: '>=9.0.0'` (includes 10). Bundled plugins (`eslint-plugin-react` / `import` / `jsx-a11y`) still advertise peers ≤9; npm may warn but config runs on eslint 10 (Next docs note this).

### `@plotly/mapbox-gl@1.13.4` — **transitive** via `plotly.js@3.7.0`

- Locked under `node_modules/plotly.js` → `"@plotly/mapbox-gl": "1.13.4"`.
- Deprecated Aug 2026: *"plotly.js v4 uses MapLibre"* — only one published version of `@plotly/mapbox-gl` (`1.13.4`).
- App usage (`AnalysisChart` / `buildChartFigure`) is **candlestick + overlays only**; no mapbox traces. Full `plotly.js` 3.x still pulls the deprecated fork.
- Clearing the warn requires **plotly.js ^4** (drops `@plotly/mapbox-gl`, keeps `maplibre-gl`). Previously deferred in `update-dependencies`.

## PLAN Decisions

1. **eslint:** Bump direct dep to `^10.14.0` (latest 10.x). Keep `eslint-config-next` and existing flat config. Do **not** replace the Next ESLint stack. Accept possible peer warnings from lagged plugins.
2. **mapbox / plotly:** **Do not** bump plotly.js to 4 in this task (chart major risk; WavePanel constraint). Document unavoidable transitive pin while on plotly.js 3.x; note plotly.js 4 as the clear path.
3. **Verification:** `npm install` → capture deprecation warnings → `npm run lint` → `npx tsc --noEmit` → `npm run build`.
4. **PR:** Open if lock/`package.json`/docs change.

## BUILD Checklist

- [x] Branch `cursor/clear-eslint-mapbox-deprecations-40b1`
- [x] Raise `eslint` to `^10.14.0`; regenerate lock
- [x] Confirm `eslint@9` deprecation gone; `@plotly/mapbox-gl` still present/documented
- [x] Update `memory-bank/techContext.md` + progress/activeContext
- [x] lint / tsc / build smoke
- [ ] Commit, push, open PR

## Completed (recent)

- [x] **fix-node22-ebadengine** (2026-11-10) — Level 1 — [archive](archive/archive-fix-node22-ebadengine.md) — [PR #88](https://github.com/mjanker4247/trading-command-center/pull/88)
- [x] **update-dependencies** (2026-11-10) — Level 2 — [archive](archive/archive-update-dependencies.md) — [PR #87](https://github.com/mjanker4247/trading-command-center/pull/87)
- [x] **news-data-unavailable** (2026-11-10) — Level 1 — [archive](archive/archive-news-data-unavailable.md) — [PR #86](https://github.com/mjanker4247/trading-command-center/pull/86)
- [x] **market-priced-in-indicator** — Level 3 — [archive](archive/archive-market-priced-in-indicator.md)

## Requirements

1. Find why packages are pulled (direct vs transitive)
2. Clear or mitigate deprecations with smallest safe change
3. Keep Next/React/plotly charts working; lint/tsc/build smoke
4. Open PR if code/lock changes; else report upstream-only
