# Tasks

## Active Task

**ID:** market-priced-in-indicator  
**Title:** Modular Market Priced-In Indicator (engines + badge)  
**Created:** 2026-11-02  
**Status:** REFLECT complete → next `/archive` (commit/push still pending)  
**Complexity:** Level 3 (Feature)

### Goal

Replace the mock-weighted event heuristic with a **decoupled priced-in calculation module** (macro + earnings engines), a strict `PricedInAssessment` contract, hardened unit tests, and an upgraded `PricedInBadge` (tooltip breakdown + new visual thresholds). Mount in asset overview surfaces without global state.

### Status checklist

- [x] VAN complete
- [x] PLAN complete
- [x] Creative (skipped — decisions locked in PLAN)
- [x] BUILD phases 0–4
- [x] REFLECT — `memory-bank/reflection/reflection-market-priced-in-indicator.md`
- [ ] ARCHIVE / commit-push

---

## PLAN (Level 3) — 2026-11-02

### Architectural principles

1. **Pure engines, dumb UI** — all math in a side-effect-free module; components only render `PricedInAssessment | null`.
2. **No global state** — callers pass symbol + inputs (or fixture resolver); badge is presentational.
3. **Migrate in place** — keep mount sites; swap scoring path; thin adapters so confluence/earnings/valuation keep working.
4. **Fixture inputs until vendors** — engines accept real numbers; mock ATM/rates fixtures stay deterministic (same as today).
5. **Morning Desk** — research copy; unpriced = **info blue** (not AI purple); green/amber only for priced-in categories.

### Locked decisions

| Topic | Decision |
|---|---|
| Module path | **`frontend/lib/pricedInEngine.ts`** — pure engines + `PricedInAssessment`. |
| Facade | Keep **`frontend/lib/pricedIn.ts`** as thin re-exports + fixture resolvers + legacy aliases during migrate; deprecate old weighted `scorePricedInPercentage` (remove or private). |
| Backend Python | **Not in v1** — no API required for calc; valuation growth block unchanged. |
| Thresholds | **`score ≥ 80` → fully**; **`40 ≤ score < 80` → partially**; **`score < 40` → unpriced**. (Locks ambiguous “>80” / “40–80” to inclusive 80 = fully.) |
| Status enum | `'fully' \| 'partially' \| 'unpriced'` per spec (`PricedInAssessment.status`). |
| Legacy levels | Adapter: `fully→full`, `partially→partial`, `unpriced→none` only if a call site still needs old names; prefer updating call sites to new enum. |
| Earnings normalize | `score = clamp(round(priced_in_ratio * 100), 0, 100)` so ratio `1.0` ⇒ 100% (implied ≈ hist ⇒ fully). |
| Macro score | `score = clamp(round(probability * 100), 0, 100)` with `probability = clamp((implied_rate - current_rate) / step_size, 0, 1)`. |
| Hist move ≤ 0 | Engine returns **`null`** (unavailable) — never Infinity/NaN. |
| Missing call or put | Engine returns **`null`**. |
| S0 ≤ 0 | Engine returns **`null`**. |
| step_size ≤ 0 (macro) | Engine returns **`null`**. |
| Unpriced color | **Info blue** via extended `signalToneBadgeClass("info")` — not violet/purple. |
| Badge chrome | CSS hover/focus **popover** on the badge (no new dep); mirror density of existing pills. Native `title` only as progressive enhancement fallback optional — prefer visible popover content for primary driver. |
| Creative mode | **Skip** — C1/C2 locked above. |
| Header mount | **`TickerDrawer`** overview header (chip row under name) + **valuation-technicals** page header next to title. |

### Target types (engine module)

```ts
export interface PricedInAssessment {
  symbol: string;
  eventType: "macro" | "earnings" | "valuation";
  score: number; // 0–100
  status: "fully" | "partially" | "unpriced";
  metrics: {
    impliedMovePct?: number;
    historicalMovePct?: number;
    pricedInRatio?: number;
    eventProbability?: number;
    consensusDeviation?: number;
  };
  summary: string; // primary driver one-liner for tooltip
}

export type MacroPricedInInput = {
  symbol: string;
  currentRate: number;
  impliedRate: number; // from front-month future / meeting-implied
  stepSize: number;
  meetingDate?: string;
};

export type EarningsPricedInInput = {
  symbol: string;
  spot: number; // S0
  atmCall: number;
  atmPut: number;
  historicalAvgMovePct: number; // percent points, e.g. 4.2 = 4.2%
  eventDate?: string;
};
```

`eventType: "valuation"` reserved for optional adapter from growth-gap later — **not required in BUILD v1 engines**.

### Engine API (sketch)

- `assessMacroPricedIn(input): PricedInAssessment | null`
- `assessEarningsPricedIn(input): PricedInAssessment | null`
- `statusFromScore(score): PricedInAssessment["status"]`
- `normalizeRatioToScore(ratio): number` — shared clamp helper
- Fixture helpers (facade): `resolveEarningsPricedIn(symbol, eventDate)` → builds mock ATM/hist → `assessEarningsPricedIn`
- Fixture helpers: `resolveMacroPricedIn(symbol, meetingDate)` optional for drawer demo chip

Earnings formula (locked):

```
implied_move_pct = ((atmCall + atmPut) * 0.85) / spot * 100  // percent points
priced_in_ratio = implied_move_pct / historicalAvgMovePct
score = clamp(round(priced_in_ratio * 100), 0, 100)
```

Macro formula (locked):

```
probability = clamp((impliedRate - currentRate) / stepSize, 0, 1)
score = clamp(round(probability * 100), 0, 100)
```

Summary examples:

- Earnings: `Implied move: ±6.4% vs. Hist. median: ±4.2%`
- Macro: `Implied hike probability: 72% (step 25 bp)`

### Component plan

| Piece | Change |
|---|---|
| `pricedInEngine.ts` | **New** — types + engines + status helper |
| `pricedIn.ts` | Slim to fixtures + `resolve*` + re-exports; delete weighted mock scorer |
| `pricedInEngine.test.ts` / update `pricedIn.test.ts` | Boundary + null guards |
| `PricedInBadge.tsx` | Accept `PricedInAssessment \| null`; tones success / warning / **info**; popover with `summary` + key metrics |
| `uiClasses.ts` | Add `"info"` to `signalToneBadgeClass` |
| `EarningsPanel` | Use new resolve + badge |
| `PricedInConfirmation` | Same |
| `PricedInExpectationPanel` | Event card from earnings assessment |
| `TickerDrawer` | Badge in header chip row (earnings fixture by next earnings date if on snapshot, else neutral) |
| Valuation page header | Optional compact badge beside ticker when assessment available |

### Phased implementation

#### Phase 0 — Engine + tests (TDD gate)

- Add `pricedInEngine.ts` with types, clamp helpers, `assessMacroPricedIn`, `assessEarningsPricedIn`, `statusFromScore`.
- Tests:
  - score 0 and 100 boundaries (macro + earnings)
  - `historicalAvgMovePct === 0` → null
  - missing call or put → null
  - S0 ≤ 0 → null
  - step_size ≤ 0 → null
  - threshold edges: 39→unpriced, 40→partially, 79→partially, 80→fully
- **Exit:** `npx tsx --test lib/pricedInEngine.test.ts` all green.

#### Phase 1 — Facade migrate + badge

- Rewrite `pricedIn.ts` fixtures to feed earnings engine (deterministic mock ATM/S0/hist from hash).
- Update `PricedInBadge` + `signalToneBadgeClass("info")`.
- Update unit tests for facade resolve still deterministic.
- **Exit:** badge renders fully/partially/unpriced; null → `—` neutral; hover shows summary.

#### Phase 2 — Consumer swap

- Point EarningsPanel, PricedInConfirmation, PricedInExpectationPanel at new types/resolve.
- Remove dead legacy fields (ivPercentile-weighted path) from UI detail rows **or** map engine metrics into simplified rows (implied / hist / ratio only).
- **Exit:** `tsc --noEmit` clean; no imports of removed APIs.

#### Phase 3 — Header mounts

- `TickerDrawer` header: `PricedInBadge` when snapshot has `next_earnings` date (use existing snapshot field if present) else neutral.
- Valuation page header: same badge using page `eventDate`.
- **Exit:** visible on drawer + valuation without global store.

#### Phase 4 — Harden

- Research disclaimer one-liner in popover footer.
- Quick check labels match spec strings (“Fully Priced-In”, etc.).
- Memory Bank progress + short CLAUDE note if public API surface changed.
- **Exit:** acceptance checklist below.

### Testing strategy

| Case | Expected |
|---|---|
| Macro: implied=current | score 0, unpriced |
| Macro: implied=current+step | score 100, fully |
| Macro: halfway step | score 50, partially |
| Macro: step_size 0 | null |
| Earnings: ratio 0 | score 0 |
| Earnings: ratio 1.0 | score 100 |
| Earnings: ratio 0.5 | score 50 |
| Earnings: hist 0 | null |
| Earnings: put missing | null |
| Threshold 80 | fully |
| Threshold 39.9 rounded | follow integer score after round |

### Challenges & mitigations

| Challenge | Mitigation |
|---|---|
| Breaking `PricedInStatus` consumers | Single facade migrate in Phase 1–2; grep for old type names |
| Mock ATM unrelated to real options | Document `source`-like note in summary footer “fixture inputs”; same honesty as today |
| DESIGN purple temptation for unpriced | Locked info-blue |
| Drawer without earnings date | Neutral badge — no fake score |

### BUILD readiness

- [x] Requirements + locks documented
- [x] No blocking creative phase
- [ ] Phase 0 engine tests green before UI polish

### BUILD notes — 2026-11-02

Implemented Phases 0–4. Key files: `pricedInEngine.ts`, slim `pricedIn.ts`, upgraded `PricedInBadge`, mounts on TickerDrawer + valuation header. Tests: 19 passed.

### Next Mode

**`/archive`** after commit/push (feature still uncommitted on working tree).
