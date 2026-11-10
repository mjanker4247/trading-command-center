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

## Dependency refresh (VAN 2026-11-10)

- Frontend: caret bumps available (next 16.4.6, antd 6.7, lucide 1.70, query 5.107, zod 4.6.7, …); majors deferred pending PLAN (plotly 4, react-pdf 11, react-dropzone 20, react-plotly 4)
- Backend: lock near-current; small bumps (fastapi 0.162.2, yfinance 1.8, pandas 3.1.1, langchain-core 1.7.7); keep apscheduler 4.0.0a*
- Vendor TradingAgents: out of this task (see TCC-10)

## Gaps vs today

- Dep install not present in cloud env until BUILD (`npm install` / `uv sync`)
- Major frontend chart/PDF/upload libs may lag Latest by design until PLAN decides
