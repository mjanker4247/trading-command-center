# TASK ARCHIVE: Modular Market Priced-In Indicator

## METADATA

| Field | Value |
|---|---|
| Task ID | `market-priced-in-indicator` |
| Complexity | Level 3 (Feature) |
| Created | 2026-11-02 |
| Completed | 2026-11-02 |
| Workflow | VAN → PLAN → BUILD → REFLECT → ARCHIVE |
| Creative | Skipped (locks in PLAN) |
| Ship commit | `03ad9c9` |

## SUMMARY

Replaced the IV-weighted mock priced-in scorer with pure **macro** and **earnings** engines (`pricedInEngine.ts`), a `PricedInAssessment` contract, fixture facade, upgraded `PricedInBadge` (popover + info-blue unpriced), and mounts on Earnings, Confluence, TickerDrawer header, and valuation page header. Research-only; fixture inputs until live options/rates feeds.

## REQUIREMENTS (delivered)

1. Composite score 0–100 + categorical fully / partially / unpriced
2. Macro engine: `clamp((implied−current)/step, 0, 1)` → score
3. Earnings engine: `((call+put)×0.85)/S0` vs hist move → `clamp(ratio×100)`
4. Decoupled calc module + unit tests (0/100, hist≤0, missing legs)
5. Badge with tooltip/popover primary driver; tones green / amber / info-blue
6. Mount without global state; resilient null → neutral `—`
7. Existing design tokens (`signalToneBadgeClass` + `"info"`)

## IMPLEMENTATION

### Engines (`frontend/lib/pricedInEngine.ts`)

- Thresholds: **≥80 fully**, **≥40 partially**, else **unpriced**
- Null on invalid hist, missing option leg, S0≤0, step≤0
- Facade (`pricedIn.ts`): deterministic fixture ATM/rates → engines; legacy `resolvePricedInForEarningsEvent` alias

### UI

- `PricedInBadge` — hover/focus popover, disclaimer footer
- Consumers updated: EarningsPanel, PricedInConfirmation, PricedInExpectationPanel
- Headers: TickerDrawer chip row; valuation-technicals title row
- `uiClasses.signalToneBadgeClass("info")` for unpriced

### Docs

- `CLAUDE.md` priced-in note
- Reflection archived alongside this document

## TESTING

- `npx tsx --test lib/pricedInEngine.test.ts lib/pricedIn.test.ts` → **19 passed**
- `npx tsc --noEmit` → pass

## LESSONS LEARNED

- Engine-first TDD before UI migration reduces type churn
- Facade + alias softens breaking renames across mounts
- Info-blue (not violet) for unpriced respects Morning Desk AI-purple lane without `/creative`
- Prefer `null` over score 0 when inputs are missing

## DEFERRED

- Live ATM / hist move / Fed futures vendors (keep engine signatures)
- Macro chip when policy calendar exists
- `eventType: "valuation"` growth-gap adapter
- Portal popover if table overflow clips tooltips

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-market-priced-in-indicator.md`
- Prior related: `archive-priced-in-event-badge.md` (Level 2 mock badge), valuation dual cards in `4d90d1b`
- Commit: `03ad9c9`
