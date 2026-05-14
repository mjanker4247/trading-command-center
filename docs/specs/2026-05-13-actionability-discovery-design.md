---
name: Actionability & Discovery
description: Phase 1 — wire existing AI outputs into one-click analysis launchers. Phase 2 — new Discover tab with portfolio gap analysis and AI-curated stock recommendations.
type: project
---

# Actionability & Discovery — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Audience:** Retail investors + developers/researchers (both equally)

---

## Overview

Two sequential phases that make AgentFloor useful every day, not just at setup:

- **Phase 1 (Approach A) — Close the Loop:** Wire every existing AI output into one-click analysis launchers. No new data pipelines. Pure wiring between features that already exist.
- **Phase 2 (Approach C) — Discover Tab:** A new portfolio tab that identifies sector gaps vs S&P 500 and surfaces AI-curated stock recommendations to fill them.

---

## Phase 1 — Close the Loop

### Goal

Every piece of AI output in the app becomes a launchpad to the next action. Users should never have to manually navigate to New Run after seeing a recommendation.

### Surface 1 — AI Briefing Action Items

**File:** `frontend/components/portfolio/InsightsDashboard.tsx`

Each action item card gains two inline buttons, right-aligned on the card header row:

- **⚡ Analyze** — navigates to `/runs/new?ticker={item.ticker}`. `item.ticker` already exists on every action item (visible at `InsightsDashboard.tsx:128`). A plain anchor link to `/runs/new?ticker=` already exists at line 130 — this change upgrades it to a styled button.
- **+ Watch** — renders the existing `WatchButton` component (defined at `HoldingsTable.tsx:121`) passing `ticker={item.ticker}`. Extract `WatchButton` to `components/portfolio/WatchButton.tsx` so it can be shared across surfaces.

`/runs/new` already reads the `ticker` query param on mount (`runs/new/page.tsx:13`) — no changes needed there.

### Surface 2 — Holdings Table Last Analysis Column

**File:** `frontend/components/portfolio/HoldingsTable.tsx`

Add a "Last Analysis" column between Unrealized P&L and the existing Actions column:

| State | Display |
|---|---|
| Recent (≤ 14 days) | Verdict badge + "Xd ago" + "↗" link to run |
| Stale (> 14 days) | Verdict badge + "Xd ago ⚠" in amber |
| Never analyzed | "Never analyzed" in muted text |

Row background is lightly tinted: green-tinted for BUY, red-tinted for SELL within the last 14 days. No tint for HOLD or stale.

The existing "⚡ Analyze" and "Watch" buttons in the Actions column remain unchanged.

**New backend endpoint:** `GET /runs/latest-by-ticker?tickers=AAPL,NVDA,...`

Returns `{ ticker: { run_id, verdict, completed_at } | null }` for each requested ticker. Looks up the most recent `Run` row per ticker where `status = 'completed'` and `user_id` matches the caller. Scoped to the requesting user.

Mount on the existing `runs.py` router.

### Surface 3 — Market Tab (Movers + Trending Cards)

**File:** `frontend/components/portfolio/TrendingPanel.tsx`

**Movers table rows:** Add an "Action" column (rightmost) with a single "⚡ Analyze" button per row.

**Trending Now cards:** Add a two-button row at the card footer — "⚡ Analyze" (full width, purple) and "+ Watch" (icon button, blue outline).

Both buttons behave identically to Surface 1: Analyze navigates to `/runs/new?ticker=` pre-filled; Watch renders the shared `WatchButton` component.

### Shared behavior — Analyze button

All "⚡ Analyze" buttons across all surfaces share one navigation helper:

```ts
// lib/analyze.ts
export function launchAnalysis(ticker: string, router: AppRouterInstance) {
  router.push(`/runs/new?ticker=${encodeURIComponent(ticker)}`);
}
```

`/runs/new` reads the `ticker` query param on mount and pre-fills the ticker input. LLM config defaults to the last run's provider/model stored in `localStorage` under `agentfloor.lastRunConfig`, falling back to the first available provider key from settings.

### Phase 1 data flow

```
User clicks ⚡ Analyze
  → launchAnalysis(ticker, router)
  → /runs/new?ticker=NVDA
  → RunForm reads ticker param, pre-fills field
  → User confirms and submits
  → POST /runs → existing run lifecycle
```

```
Holdings table mounts
  → GET /runs/latest-by-ticker?tickers=AAPL,NVDA,...
  → Last Analysis column renders per ticker
```

### Phase 1 — files to create/modify

| File | Change |
|---|---|
| `backend/app/routers/runs.py` | Add `GET /runs/latest-by-ticker` endpoint |
| `frontend/lib/analyze.ts` | New — shared `launchAnalysis` helper |
| `frontend/components/portfolio/WatchButton.tsx` | New — extract `WatchButton` from `HoldingsTable.tsx:121` for shared use |
| `frontend/components/portfolio/InsightsDashboard.tsx` | Upgrade existing `/runs/new` link to ⚡ Analyze button; add Watch button |
| `frontend/components/portfolio/HoldingsTable.tsx` | Add Last Analysis column |
| `frontend/components/portfolio/TrendingPanel.tsx` | Add Analyze + Watch to movers rows and trending cards |

---

## Phase 2 — Discover Tab

### Goal

Surface stocks the user doesn't already hold but should consider — based on portfolio sector gaps vs S&P 500 and what's trending in the market today.

### Tab placement

New "Discover 🔍" tab added after "Market ↑" in the portfolio tab bar. Accessible without a Finnhub key (recommendations degrade gracefully — gap analysis shows "no sector data" message; trending-based recs are hidden).

### Left panel — Sector Gap Analysis

Compares the user's portfolio sector weights against S&P 500 sector weights.

**Data sources:**
- User weights: derived from `GET /portfolio/{id}/fundamentals` → `sector` field in `FundamentalsData` (already cached 6h). Aggregate by sector across all holdings weighted by market value.
- S&P 500 weights: static lookup table in the backend (`services/sp500_sectors.py`) updated manually each quarter. Approximate weights are sufficient; no live data feed needed.

**Display:** Horizontal bar chart per sector showing "You vs S&P 500" with delta. Sectors underweight by > 5% are highlighted and seed the recommendations panel.

**New backend endpoint:** `GET /portfolio/{id}/sector-gaps`

Returns `{ sector: string, your_weight: float, sp500_weight: float, delta: float }[]` sorted by delta ascending (most underweight first). Reuses fundamentals data already cached.

### Right panel — AI Recommendations feed

A list of 5–8 tickers to consider, each with a reason and a tag:

- **Gap Fill** — ticker is in an underweight sector; sourced from a static curated list of sector leaders per GICS sector (e.g., UNH/JNJ for Healthcare, JPM/BAC for Financials).
- **Trending** — ticker appears in today's trending list and is not already held.
- **Mover** — ticker is a top gainer/loser today and is not already held.

**Filter chips** at the top: All / Gap fills / Trending / Movers.

Each card: ticker, tag badge, sector label, AI-generated reason sentence, Analyze + Watch buttons (from Phase 1).

**New backend endpoint:** `POST /portfolio/{id}/discover`

Request body: `{ llm_provider, llm_model }` (optional — if omitted, uses the same provider selection logic as `_fire_daily_portfolio_insights`).

Logic:
1. Fetch sector gaps (reuse `GET /portfolio/{id}/sector-gaps` logic).
2. Fetch today's trending list (reuse `/market/trending` cache).
3. Fetch today's movers (reuse `/market/movers` cache).
4. Exclude tickers already in the portfolio's latest snapshot.
5. Build a compact prompt: portfolio context (sector gaps, total value, top holdings) + candidate tickers from steps 2–4.
6. Call the LLM to rank and annotate candidates with one-sentence reasons.
7. Return `{ recommendations: [{ ticker, tag, sector, reason }] }`.

Response is cached in-process for 30 minutes per portfolio (recommendations don't need to refresh more often than that).

Concurrency guard: if a discover request is already running for this portfolio, return the cached result from the last completed call rather than queueing a second LLM call.

**Frontend polling:** none needed — the endpoint returns synchronously (LLM call is fast; prompt is compact). Frontend shows a spinner while the POST is in-flight. A "Refresh" button re-calls the endpoint and busts the cache.

### Phase 2 — files to create/modify

| File | Change |
|---|---|
| `backend/app/services/sp500_sectors.py` | New — static S&P 500 sector weights dict |
| `backend/app/routers/portfolio.py` | Add `GET /portfolio/{id}/sector-gaps` and `POST /portfolio/{id}/discover` |
| `frontend/lib/api.ts` | Add `getSectorGaps()` and `discoverStocks()` typed helpers |
| `frontend/components/portfolio/DiscoverPanel.tsx` | New — full Discover tab component (sector gap chart + recommendations feed) |
| `frontend/app/portfolio/page.tsx` | Add "Discover" tab entry |

---

## Error handling

| Scenario | Behavior |
|---|---|
| No Finnhub key | Sector gap chart shows "Add a Finnhub key in Settings to see sector analysis". Recommendations show trending/movers only (no gap fills). |
| No LLM key | Discover panel shows "Add an LLM provider key in Settings to generate recommendations". |
| LLM call fails | Return last cached recommendations with a "stale" badge. If no cache, show error inline. |
| Ticker not found in Finnhub | That ticker is skipped in sector aggregation; fundamentals field left null. |
| `latest-by-ticker` with no runs | Returns `null` per ticker — Holdings table renders "Never analyzed". |

---

## Out of scope

- Push/email notifications (Approach B — deferred)
- Options chain data
- Broker API integrations (live portfolio sync)
- Backtesting AI verdict performance beyond existing outcome tracker
- Crypto tickers in Discover (Finnhub sector data not available)
