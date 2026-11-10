# Tasks

## Current Task

**clear-eslint-mapbox-deprecations** (TCC-15) — Clear npm deprecation warnings for `eslint@9.39.5` and `@plotly/mapbox-gl@1.13.4`.

## Complexity

**Level 2 (Simple Enhancement)** — VAN → PLAN → BUILD → REFLECT → ARCHIVE

| Factor | Assessment |
|---|---|
| Scope | Frontend `package.json` / lock + Memory Bank docs |
| Risk | Medium for eslint 10 peer noise; low for mapbox (document-only) |
| Effort | One major bump (eslint), verify lint/tsc/build; document plotly pin |
| Creative | **Not required** — binary policy (upgrade vs document), no UX/design |

## Status

- [x] Task definition (VAN)
- [x] Implementation plan (PLAN) — retrospective refresh 2026-11-10 confirms shipped policy
- [x] Execution (BUILD) — eslint → `^10.14.0`; mapbox documented; lint 0 errors / tsc / build pass
- [ ] Documentation / reflection (`/reflect`)
- [ ] Archive (after merge)

**PR:** [#90](https://github.com/mjanker4247/trading-command-center/pull/90) · MERGED `ed7464e` (2026-11-10)

---

## Level 2 PLAN (retrospective vs shipped)

### Enhancement

**Status:** BUILD complete / PLAN confirmed  
**Priority:** Medium (install-noise + EOL tooling)  
**Effort:** Small

### Requirements (satisfied)

1. Identify direct vs transitive pull for both deprecated packages — **done**
2. Smallest safe mitigation (upgrade or document) — **done**
3. Keep Next/React/plotly Wave charts working — **done** (no plotly code change)
4. lint / tsc / build smoke — **done**
5. Open PR if lock/code changes — **#90**

### Policy (locked & matched shipped)

| Decision | Policy | Shipped | Match |
|---|---|---|---|
| eslint | Bump direct dep to `^10.14.0`; keep `eslint-config-next` + flat `eslint.config.mjs`; do **not** replace Next ESLint stack | `frontend/package.json` has `"eslint": "^10.14.0"`; config unchanged | YES |
| mapbox | Document unavoidable transitive pin under `plotly.js@3.x`; **defer** plotly.js 4 | `techContext.md` documents pin; no plotly major | YES |
| Creative | Skip | Skipped | YES |
| Verify | install + lint + tsc + build | All green on BUILD | YES |

### Why eslint 10 was re-evaluated (was deferred in update-dependencies)

Prior dep refresh deferred eslint 10 as an intentional major. For TCC-15 the warn is no longer optional noise: npm marks `eslint@<10` deprecated because **v9 EOL 2026-08-06**. Node 22 + flat config + `eslint-config-next@16.4.6` (`peer: eslint >= 9`) make the bump the smallest clear path.

### Why plotly.js 4 stayed deferred

`@plotly/mapbox-gl@1.13.4` only clears on plotly.js **v4** (MapLibre-only). Wave usage is candlestick/overlays via `react-plotly.js` + full `plotly.js` 3.7.0 — no mapbox traces, but the full bundle still installs the fork. Chart major was previously deferred; TCC-15 constraint “do not break plotly WavePanel” → document-only is correct.

### Subtasks (BUILD — complete)

- [x] Branch `cursor/clear-eslint-mapbox-deprecations-40b1`
- [x] Raise `eslint` → `^10.14.0`; regenerate lock
- [x] Confirm eslint 9 deprecate warn gone; mapbox warn residual
- [x] Document pin in `memory-bank/techContext.md`
- [x] Smoke: lint / tsc / build
- [x] Push + PR #90
- [x] Retrospective PLAN refresh (this section)

### Residuals (accepted)

1. **`@plotly/mapbox-gl@1.13.4` npm deprecate** on every `npm install` until a dedicated plotly.js 4 (+ likely react-plotly.js 4) task
2. **ERESOLVE peer overrides** — `eslint-plugin-react` / `import` / `jsx-a11y` still advertise peers ≤9; lint exits 0; Next docs acknowledge this lag
3. Pre-existing lint **warnings** (37) unchanged — not in scope

### Technology validation

| Check | Result |
|---|---|
| Node engines | `>=22` — satisfies eslint 10 (`^20.19 \|\| ^22.13 \|\| >=24`) |
| Flat config | Already migrated — no eslintrc work |
| eslint-config-next | 16.4.6 peers include eslint 10 |
| plotly charts | Untouched; candlestick path only |

### Creative phases

**None.** No `/creative` — proceed (already proceeded) BUILD; next is reflect/archive.

### Next steps

1. **Human/coordinator:** review + **merge #90** when CI/policy OK  
2. **Agent:** run **`/reflect`** (insights + action items; can run now or post-merge)  
3. **`/archive`** after reflect + merge known  
4. **Follow-up (optional, separate task):** plotly.js 4 + react-plotly.js 4 to clear mapbox warn; optionally revisit when eslint plugins widen peers to 10

---

## Root Cause (VAN)

### `eslint@9.39.5` — **direct** `devDependency`

- Was `"eslint": "^9.39.5"`; now `"eslint": "^10.14.0"`.
- npm: *"This version is no longer supported"* — ESLint v9 EOL 2026-08-06 ([version support](https://eslint.org/version-support/)).

### `@plotly/mapbox-gl@1.13.4` — **transitive** via `plotly.js@3.7.0`

- Locked dependency of plotly.js 3.7.0; only published fork version.
- Deprecated Aug 2026 — plotly.js v4 uses MapLibre.

## Completed (recent)

- [x] **fix-node22-ebadengine** (2026-11-10) — Level 1 — [archive](archive/archive-fix-node22-ebadengine.md) — [PR #88](https://github.com/mjanker4247/trading-command-center/pull/88)
- [x] **update-dependencies** (2026-11-10) — Level 2 — [archive](archive/archive-update-dependencies.md) — [PR #87](https://github.com/mjanker4247/trading-command-center/pull/87)
- [x] **news-data-unavailable** (2026-11-10) — Level 1 — [archive](archive/archive-news-data-unavailable.md) — [PR #86](https://github.com/mjanker4247/trading-command-center/pull/86)
- [x] **market-priced-in-indicator** — Level 3 — [archive](archive/archive-market-priced-in-indicator.md)
