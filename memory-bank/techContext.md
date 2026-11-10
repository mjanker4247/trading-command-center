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

## npm deprecation mitigations (TCC-15 / 2026-11-10)

- **eslint:** direct `devDependency` raised to `^10.14.0` (v9 EOL / npm-deprecated). Flat config + `eslint-config-next@16.4.6` retained. Expect ERESOLVE peer overrides from `eslint-plugin-react` / `import` / `jsx-a11y` (peer ranges still ≤9); lint still exits 0.
- **`@plotly/mapbox-gl@1.13.4`:** unavoidable **transitive** of `plotly.js@3.7.0` (Wave candlestick charts via `react-plotly.js`). Only published version of the fork; plotly.js **v4** drops it for `maplibre-gl`. Intentionally **not** bumped here — chart major deferred; document pin until a dedicated plotly 4 task.

## Gaps vs today

- Major frontend chart/PDF/upload libs may lag Latest by design (plotly.js 4 still deferred)
- Residual install warn: `@plotly/mapbox-gl@1.13.4` until plotly.js 4
