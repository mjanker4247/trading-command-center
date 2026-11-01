# Tech Context

## Stack (AgentFloor)

- Frontend: Next.js App Router (`app/(app)/…`), TanStack Query, Tailwind v4, Plotly (wave only), SVG (Kalman)
- Backend: FastAPI, Finnhub (metrics/earnings/prices when entitled), yfinance (regime/kalman/wave + **valuation history**)

## Valuation & Technicals (decided)

- OHLC: TradingView `lightweight-charts` **^5.2.1** (install in BUILD)
- Corridor: **`recharts`** (C1) — ComposedChart lines + Area bands
- Stats: local median/CAGR utils
- Data (C3): yfinance-first annual fundamentals + estimates; Finnhub `/stock/metric` + calendar; optional Finnhub financials/estimates when entitled; per-block `source` flags
- API: `GET /tickers/{ticker}/valuation`

## Gaps vs today

- No historical corridor API yet
- Chart libs not installed yet (`recharts`, `lightweight-charts`)
- Confluence compact still embeds ChartQuickLook
- Priced-in confluence WIP uncommitted (Phase 0)
