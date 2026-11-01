# System Patterns — Valuation & Technicals

## Patterns to reuse

- **Ticker subpage:** mirror `app/(app)/wave/[ticker]/page.tsx` (auth layout, breadcrumb, Query by ticker).
- **Signal strip:** `ConfluenceStrip` composes `*Confirmation` with `variant="compact"` — keep tabular; deep-link out for charts.
- **Vendor + cache:** yfinance-first for multi-year fundamentals; Finnhub for spot metrics/calendar; TTL cache + premium-empty graceful; `source` on each series block.
- **Compute on server:** same as regime/kalman/wave — FE renders only.
- **Charts:** `recharts` = valuation corridors; `lightweight-charts` = OHLC technicals; Plotly = wave only.
- **Research copy:** Morning Desk; valuation bands use soft success/danger + “Below/Above fair” — never Buy/Sell; event vs growth priced-in stay separate cards.

## Anti-patterns for this feature

- Do not add a `/research` hub in v1.
- Do not put Plotly corridor charts on the run page.
- Do not persist forecast slider state in DB for v1.
- Do not merge event-vol % with growth-implied CAGR into one score.
- Do not assume free Finnhub has historical statements / forward estimates.
