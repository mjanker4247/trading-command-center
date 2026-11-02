# Reflection: market-priced-in-indicator

**Date:** 2026-11-02 (Europe/Berlin)  
**Complexity:** Level 3 (Feature)  
**Status:** BUILD complete (uncommitted at reflect time)

## Summary

Replaced the mock IV-weighted priced-in heuristic with a decoupled pure engine module (`pricedInEngine.ts`) implementing the specified **macro** and **earnings** formulas, a strict `PricedInAssessment` contract, hardened unit tests (boundaries, div-by-zero, missing legs), and an upgraded `PricedInBadge` with hover/focus popover and info-blue unpriced state. Consumers (Earnings, Confluence, valuation expectation panel) and asset headers (TickerDrawer, valuation page) were migrated without global state.

## Plan vs delivered

| Plan item | Outcome |
|---|---|
| `pricedInEngine.ts` macro + earnings | Done |
| Thresholds ≥80 / ≥40 / unpriced | Done |
| Earnings `clamp(ratio×100)`; null on hist≤0 / missing leg | Done |
| Facade fixtures in `pricedIn.ts` | Done — old weighted scorer removed |
| Badge popover + info tone | Done via `signalToneBadgeClass("info")` |
| Mounts: drawer + valuation header | Done |
| Skip `/creative` | Done |
| No Python backend v1 | Done |
| Live options/rates feeds | Deferred (fixtures) — as planned |

## What went well

- **TDD gate first:** Engine tests locked formulas before UI churn; 12 engine + 7 facade tests (19 total) stayed green.
- **Thin migration:** Keeping a facade + `resolvePricedInForEarningsEvent` alias avoided a wide rename blast radius.
- **DESIGN discipline:** Unpriced → info blue (not violet) matched Morning Desk Two-Lane Rule without a creative phase.
- **Same honesty as before:** Fixture inputs remain labeled; engine math is live-path-ready.

## Challenges

- **Type cutover:** UI still used `percentage` / `level` / IV metric rows — required a focused rewrite of Confirmation + ExpectationPanel detail rows to engine metrics only.
- **Threshold ambiguity in original spec (“>80” vs “40–80”):** Locked inclusive ≥80 in PLAN; documented in reflection so future tweaks are intentional.
- **Macro step labeling:** Rate decimals → bp display is heuristic; fine for fixture summaries, revisit when live Fed futures land.

## Lessons learned

1. Pure calc modules with null-on-invalid-input beat “score 0” for missing data — badge neutral/`—` is clearer than a fake unpriced 0%.
2. When replacing a mock composite with a single-formula engine, update *copy* in EarningsPanel/confirmation in the same PR or users read stale methodology.
3. CSS group hover popovers are enough for dense tables; no need for InfoPopover unless keyboard trapping becomes a requirement.

## Process improvements

- Level 3 tasks that only need color/chrome locks can skip `/creative` when PLAN documents the design-system rationale (as done).
- Prefer writing engine tests from the PLAN test matrix verbatim before implementing — catches normalize/threshold mismatches early.

## Technical improvements (follow-ups)

- Wire live ATM quotes / hist move when a vendor is available; keep engine signatures unchanged.
- Optional macro chip in TickerDrawer when a policy calendar exists (engine already ready).
- `eventType: "valuation"` adapter from growth-gap still YAGNI.
- Consider portal-based popover if table overflow clips tooltips in EarningsPanel (not observed as blocking).

## Residual risk

- Work still **uncommitted** at reflect time — commit/push before archive if shipping.
- Fixture-driven scores will change vs the previous IV-weighted mock for the same ticker/date (expected).

## Next steps

1. Commit + push feature (on request).
2. `/archive` — archive this reflection + close task in Memory Bank.
