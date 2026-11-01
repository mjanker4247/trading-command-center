# TASK ARCHIVE: Priced-in visual indicator for upcoming market events

## METADATA

| Field | Value |
|---|---|
| Task ID | `priced-in-event-badge` |
| Complexity | Level 2 (Simple Enhancement) |
| Created | 2026-11-01 |
| Completed | 2026-11-01 |
| Workflow | VAN → PLAN → BUILD → REFLECT → ARCHIVE |

## SUMMARY

Added a compact priced-in badge to the portfolio Earnings table. Deterministic mock calc lives in `lib/pricedIn.ts`; `PricedInBadge` only renders. Hover tooltip shows IV percentile, consensus target distance, and options skew. Explicit mock/research disclaimers. No backend API and no TickerDrawer mount (deferred).

## REQUIREMENTS

1. Compact pill with % / level semantics (full / partial / none)
2. Color via existing `signalToneBadgeClass` (success / warning / neutral)
3. Tooltip with underlying metrics
4. TypeScript model + calc/mock separated from render
5. Minimal EarningsPanel integration; neutral fallback when missing
6. No trade-signal framing

## IMPLEMENTATION

- Thresholds: ≥70 full, ≥40 partial, else none
- Mock keyed by `TICKER|date` hash for stable UI
- Earnings column after Days Away + panel footnote
- Shipped in commit `190cb00`

### Key files

- `frontend/lib/pricedIn.ts`
- `frontend/lib/pricedIn.test.ts`
- `frontend/components/portfolio/PricedInBadge.tsx`
- `frontend/components/portfolio/EarningsPanel.tsx`

## TESTING

- `npx tsx --test lib/pricedIn.test.ts` → **6 passed**
- Lint clean on touched files

## LESSONS LEARNED

- Lock tone mapping in PLAN against DESIGN.md verdict-color rules to skip `/creative`
- Keep provider swap behind `resolvePricedInForEarningsEvent` for later live data
- Defer secondary mounts (TickerDrawer) until mock UX is validated

## DEFERRED / OPTIONAL

- `TickerDrawer` Next Earnings badge
- Live options/consensus backend behind same status shape
- Richer accessible tooltip than native `title` (mobile)

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-priced-in-event-badge.md`
- Commit: `190cb00`
