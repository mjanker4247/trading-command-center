# Creative: Valuation & Technicals

**Task:** valuation-technicals-subview  
**Date:** 2026-11-01 (Europe/Berlin)  
**Phases:** C1 Architecture · C3 Data · C2 UI/UX · C4 UI/UX

---

## 📌 CREATIVE PHASE START: C1 — Corridor chart library

### 1️⃣ PROBLEM

Fair-value corridor needs multi-series charting: price + 1–3 fair lines + undervaluation/overvaluation bands + dashed FY estimate extensions + HTML tooltips. OHLC technicals already locked to `lightweight-charts`. Plotly stays on `/wave/[ticker]` only.

**Requirements:** React/Next 16 friendly; band fills; dashed forecast; theme via CSS tokens; acceptable bundle; dispose-safe.

**Constraints:** YAGNI; no second Plotly surface; corridor ≠ candlestick (different lib OK).

### 2️⃣ OPTIONS

- **A: `recharts`** — ComposedChart + Line + Area; declarative React.
- **B: `echarts-for-react`** — Canvas; markArea / multi-axis power.
- **C: Plotly again** — Reuse existing dep for corridors too.

### 3️⃣ ANALYSIS

| Criterion | A recharts | B echarts | C Plotly |
|---|---|---|---|
| Bundle / weight | ⭐⭐⭐⭐ | ⭐⭐ | ⭐ (already paid) |
| Band + dashed FY | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| React idioms / theming | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Morning Desk fit | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ (wave already heavy) |
| Learning / YAGNI | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

**Insights:** Corridor is a time-series line/area problem, not OHLC — recharts is enough. ECharts wins only if we need markArea gymnastics; v1 does not. Reusing Plotly couples valuation to wave’s Plotly surface and fights DESIGN tonal control.

### 4️⃣ DECISION

**Selected: Option A — `recharts`**

**Rationale:** Smallest new surface for bands + lines; CSS-variable colors; keeps Plotly isolated to Elliott; pairs cleanly with locked `lightweight-charts` for technicals.

### 5️⃣ IMPLEMENTATION NOTES

- Dep: `recharts` (React 19–compatible current major at install time).
- Component: `FairValueCorridorChart` → `ResponsiveContainer` + `ComposedChart`.
- Price = solid `Line` (ink); fair series = `Line` strokes (slate / info-blue for active metric); band = stacked `Area` with success-soft / danger-soft fills (see C2).
- FY estimates = same series with `strokeDasharray`, optional separate keys post–last actual.
- Tooltip: custom content using Geist Mono tabular nums; no buy/sell verbs.
- PoC gate: mock payload with price + 3 fair lines + one band before live API wiring.

**VERIFICATION:** [x] Problem [x] Options [x] Decision [x] Impl notes

---

📌 CREATIVE PHASE END: C1

---

## 📌 CREATIVE PHASE START: C3 — Data vendor matrix

### 1️⃣ PROBLEM

Corridor math needs multi-year EPS / OCF/share / FCF/share / revenue/share + daily closes + FY+1..3 estimates. AgentFloor already uses Finnhub (entitlement-aware) and yfinance (regime/kalman/wave). Free Finnhub does **not** include standardized historical statements or forward EPS/revenue estimate history (All-In-One only).

**Requirements:** Works for liquid US tickers without Finnhub All-In-One; graceful empty; no look-ahead; cacheable; testable pure math.

**Constraints:** Research-only; reuse `fetch_json` / premium reasons; crypto → empty valuation.

### 2️⃣ OPTIONS

- **A: Finnhub-primary history** — financials + estimates from Finnhub; yfinance prices only.
- **B: yfinance-primary history** — statements + estimates from yfinance; Finnhub for quote/metrics/earnings calendar when entitled.
- **C: Dual-path merge** — try Finnhub financials/estimates; on premium/empty fall back to yfinance; always yfinance (or Finnhub candle) for closes.

### 3️⃣ ANALYSIS

| Criterion | A FH-primary | B YF-primary | C Dual-path |
|---|---|---|---|
| Works on free/common keys | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Estimate quality | ⭐⭐⭐⭐ (paid) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Code complexity | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Matches existing patterns | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Empty/premium UX | ⭐⭐ (often empty) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Insights:** PLAN’s “Finnhub primary” must be **narrowed**: Finnhub stays primary for *spot metrics & calendar*; **historical corridor inputs are yfinance-first**. Dual-path keeps a paid-Finnhub upgrade path without blocking v1.

### 4️⃣ DECISION

**Selected: Option C — Dual-path, yfinance-first for corridor history**

| Data | Primary | Fallback | Cache TTL |
|---|---|---|---|
| Daily closes | yfinance (regime pattern) | Finnhub candle if entitled | 6–24h |
| Annual EPS / OCF / FCF / sales per share | yfinance financials | Finnhub standardized financials if entitled | 24h |
| FY+1..3 estimates | yfinance analyst estimates | Finnhub `/stock/eps-estimate` etc. if entitled | 12–24h |
| Summary bar (P/E, yield, …) | Finnhub `/stock/metric` | yfinance `info` | 6h |
| Next earnings | Finnhub calendar (existing) | — | existing |

Flag each series block with `source: "yfinance" | "finnhub" | "none"` so UI can show “estimates unavailable” without fake consensus.

### 5️⃣ IMPLEMENTATION NOTES

- Service: `valuation_corridor_service.py` — adapters `fetch_fundamentals_history`, `fetch_estimates`, `fetch_closes`; pure `build_corridor(history, prices, lookback)`.
- Per-share: prefer vendor per-share fields; else `line_item / diluted_shares` with NaN guard.
- Insufficient history (<3Y for 3Y median): omit that lookback; return `insufficient_history` flags per metric.
- Crypto / non-equity: 200/empty with reason `unsupported_asset`.
- Do not invent mock fundamentals in production path; mock only FE storybook/PoC.

**VERIFICATION:** [x] Problem [x] Options [x] Decision [x] Impl notes

---

📌 CREATIVE PHASE END: C3

---

## 📌 CREATIVE PHASE START: C2 — Corridor visual language

### 1️⃣ PROBLEM

Aktienfinder-style corridors use green “cheap” / red “expensive” bands. DESIGN.md **Verdict-Only Rule**: green/red/yellow for verdicts & P&L only — not decoration. Need bands that read as valuation geometry without looking like buy/sell chips.

**Requirements:** Metric toggles (EPS / OCF / FCF; Sales optional v1.1); lookback 3Y/5Y/10Y; clear “below/above fair”; dark+light; Geist Mono numbers.

**Constraints:** No gamified heatmaps; no purple (not AI); tonal layering; soft radius panels.

### 2️⃣ OPTIONS

- **A: Verdict green/red bands** — success/danger soft fills, same as P&L.
- **B: Slate/info-only bands** — muted fills; distance as % text only.
- **C: Soft valuation bands + explicit labels** — success-soft / danger-soft fills **only** for undervaluation/overvaluation geometry, always paired with “Below fair value” / “Above fair value” (never Buy/Sell); selected fair line in action/info blue.

### 3️⃣ ANALYSIS

| Criterion | A | B | C |
|---|---|---|---|
| Instant readability | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| DESIGN Verdict-Only | ⭐⭐ (risk) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Aktienfinder familiarity | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ |
| Morning Desk calm | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**Insights:** Pure slate bands are too timid for the product ask. Raw green=buy mapping violates DESIGN. Soft fills + valuation vocabulary is the compromise: color encodes *price vs fair*, copy forbids trade advice.

### 4️⃣ DECISION

**Selected: Option C — Soft valuation bands + explicit labels**

### 5️⃣ IMPLEMENTATION NOTES

- **Bands:** `success-soft` when price &lt; active fair; `danger-soft` when price &gt; active fair; opacity ~0.35; no solid success/danger strokes on bands.
- **Lines:** price = `--af-fg`; inactive fair = `--af-subtle`; active fair = `--af-info` / action-blue; estimate dashes = `--af-muted`.
- **Chrome:** metric segmented control (EPS | OCF | FCF); lookback select; caption under chart: “Fair value from median multiples — research estimate, not a trade signal.”
- **Summary delta:** “−12% vs EPS fair” in data mono; color success/danger only on the % (valuation distance ≈ P&L-like financial delta — allowed), never “BUY”.
- **Empty:** single muted empty state, no fake corridor.

```
┌─────────────────────────────────────────┐
│ AAPL · Valuation & Charts               │
│ [EPS] [OCF] [FCF]     Lookback [5Y ▾]   │
│ ─────────────────────────────────────── │
│     ~~~price~~~                         │
│  ░░ below-fair soft ░░  --- fair EPS    │
│  ▒▒ above-fair soft ▒▒  - - FY est      │
│ Caption: research estimate…             │
└─────────────────────────────────────────┘
```

**VERIFICATION:** [x] Problem [x] Options [x] Decision [x] Impl notes

---

📌 CREATIVE PHASE END: C2

---

## 📌 CREATIVE PHASE START: C4 — Priced-in expectation matrix UX

### 1️⃣ PROBLEM

Two different “priced-in” concepts exist:

1. **Event vol** — existing mock heuristic (IV %ile, implied vs hist move, skew, consensus gap) in `pricedIn.ts` / confluence.
2. **Fundamental growth** — reverse-DCF / implied long-term growth vs street consensus (Aktienfinder expectation matrix).

Must not conflate them; keep mock vol until options API exists.

**Requirements:** Show both on valuation page; relate to confluence badge; research disclaimers; mobile-readable.

**Constraints:** No live options in v1; slider assumptions URL/state only; YAGNI on full DCF suite.

### 2️⃣ OPTIONS

- **A: Single merged %** — one score mixing vol + growth.
- **B: Dual cards side-by-side** — Event priced-in | Growth priced-in.
- **C: 2×2 expectation matrix** — rows = low/base/aggressive growth; cols = implied vs consensus; event vol as a separate strip above.

### 3️⃣ ANALYSIS

| Criterion | A merge | B dual cards | C matrix |
|---|---|---|---|
| Conceptual clarity | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Build cost | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Matches Aktienfinder | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Fits existing mock | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Insights:** Merging scores is misleading. Full 2×2 is Phase-creep for v1. Dual cards reuse confluence event card + add growth card; matrix can deepen later.

### 4️⃣ DECISION

**Selected: Option B — Dual cards (Event | Growth), with a slim “expectation ladder” inside Growth**

Not a full 2×2 grid in v1; Growth card shows three rows: **Implied by price** · **Consensus** · **Gap** (pp), plus optional terminal-multiple from forecast slider.

### 5️⃣ IMPLEMENTATION NOTES

- **Event card:** reuse `levelLabel` / metrics from `pricedIn.ts`; `source: "mock"` badge; same copy as `PRICED_IN_BACKGROUND` (collapsed).
- **Growth card:** backend `pricedIn.growth` — `{ impliedCagr, consensusCagr, gapPp, method: "reverse_multiple" }`; FE renders ladder + “Aggressive if implied ≫ consensus”.
- **Method (v1):** simplified reverse multiple — solve CAGR from spot → FY+N consensus EPS (or fair EPS) × terminal P/E (slider default = median P/E); document formula in service docstring + UI footnote.
- **Confluence:** keep event-only `PricedInConfirmation`; valuation page is where both appear; deep-link CTA can say “Valuation & priced-in →”.
- **No merge:** never average event % with growth gap into one number.

```
┌──────────────────┐  ┌──────────────────────┐
│ Event priced-in  │  │ Growth priced-in     │
│ 62% · Partial    │  │ Implied  8.4% CAGR   │
│ mock · IV/skew…  │  │ Consensus 5.1%       │
│                  │  │ Gap +3.3 pp (rich)   │
└──────────────────┘  └──────────────────────┘
```

**VERIFICATION:** [x] Problem [x] Options [x] Decision [x] Impl notes

---

📌 CREATIVE PHASE END: C4

---

## Decision summary (BUILD inputs)

| ID | Decision |
|---|---|
| C1 | **`recharts`** for fair-value corridor; `lightweight-charts` remains OHLC-only |
| C3 | **yfinance-first** corridor history; Finnhub for metrics/calendar + paid upgrade path; dual-path with `source` flags |
| C2 | **Soft success/danger bands** + “Below/Above fair value” labels; never Buy/Sell |
| C4 | **Dual cards** Event (mock vol) + Growth (implied vs consensus ladder); no merged score |

## Next

`/build` Phase 0 (commit priced-in WIP) → Phase 1 …
