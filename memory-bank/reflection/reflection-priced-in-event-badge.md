# Level 2 Enhancement Reflection: Priced-in event badge

## Enhancement Summary

Added a compact priced-in pill on the portfolio Earnings table: `PricedInStatus` model + deterministic mock in `lib/pricedIn.ts`, presentational `PricedInBadge`, and a new table column with hover metrics and a mock/research footnote. No backend and no TickerDrawer (deferred per PLAN).

## What Went Well

- PLAN locked mount point (EarningsPanel column), tones (`signalToneBadgeClass`), and thresholds (70/40) before BUILD — no design thrash.
- Clear calc vs render split: mock/resolve stay in `pricedIn.ts`; badge only maps level → tone + `title`.
- Reused WaveBadge sizing and existing tone helper — fits Morning Desk without new tokens or deps.
- Focused proof: `npx tsx --test lib/pricedIn.test.ts` → 6 passed; deterministic mock avoids flaky UI.

## Challenges Encountered

- DESIGN.md reserves green/yellow for verdicts & P&L; user asked green/yellow/gray for priced-in.
- No live IV/skew/consensus API — risk of users treating mock % as market truth.
- Dense earnings table already crowded (EPS/rev columns).

## Solutions Applied

- Mapped levels to success / warning / neutral with copy framed as “event pricing,” not buy/sell; footnote + tooltip disclaimer.
- Explicit `source: "mock"` and “(mock)” in tooltip / keyFactor; panel footnote.
- Compact cell shows `NN%` only; long labels and metrics live in `title`.

## Key Technical Insights

- Stable mock via FNV-style hash of `TICKER|date` is enough for demos and visual QA without a server.
- Keeping types next to logic in `pricedIn.ts` (not bloating `lib/types.ts`) made the seam obvious for a future live provider behind `resolvePricedInForEarningsEvent`.
- Native `title` is enough for v1 dense tables; InfoPopover would add click/focus complexity for little gain.

## Process Insights

- Level 2 + skip `/creative` was correct once color mapping was decided in PLAN.
- Deferring TickerDrawer kept the diff to four frontend files and one panel touch.
- Memory Bank VAN exploration (EarningsPanel vs drawer) paid off — avoided wiring HoldingsTable portfolio-wide.

## Action Items for Future Work

- Optional: mount same badge in `TickerDrawer` Next Earnings once mock UX is validated.
- Optional: replace mock with backend (options IV crush, implied move vs historical, etc.) keeping `PricedInStatus` shape.
- Commit + push feature files when ready (`pricedIn*`, `PricedInBadge`, `EarningsPanel`).
- Consider accessible tooltip beyond native `title` if mobile users need the metrics.

## Time Estimation Accuracy

- Estimated BUILD: 45–90 min
- Actual BUILD: ~15–25 min
- Variance: under — scope stayed on plan; patterns already in repo
