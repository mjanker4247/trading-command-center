# Tasks

## Active Task

**ID:** news-data-unavailable  
**Title:** Fix news DATA_UNAVAILABLE (yfinance 1.7.0 get_news break)  
**Created:** 2026-11-10  
**Status:** BUILD complete — awaiting PR  
**Complexity:** Level 1 (Quick Bug Fix)

### Goal

Find why AgentFloor/TradingAgents news returns `DATA_UNAVAILABLE`, fix root cause in app/deps if possible, verify with tests.

### Root cause (VAN)

- Literal string `DATA_UNAVAILABLE` is **not** in AgentFloor app code.
- It is emitted by vendored TradingAgents `tradingagents/dataflows/router.py::vendor_unavailable` when every configured news vendor fails.
- Default `news_data` vendor is **yfinance** (`get_news_yfinance` → `Ticker.get_news()`).
- Locked `yfinance==1.7.0` (`backend/uv.lock`) calls a Yahoo endpoint Yahoo retired; raises `YFDataException: *** YAHOO! FINANCE IS CURRENTLY DOWN! ***`.
- `yf_retry` turns that into `VendorUnavailableError` **before** the Yahoo Search fallback runs (fallback only on empty feed).
- Upstream: TauricResearch/TradingAgents#1663; fix floor PR #1671 (`yfinance>=1.8.0`, open/unmerged).
- Portfolio Finnhub News panel uses separate reason codes (`no_finnhub_key`, `premium_required`, …) — **not** this sentinel.

### Distinction

| Path | Symptom | Cause class |
|---|---|---|
| Run News analyst / `get_news` tool | `DATA_UNAVAILABLE: no configured vendor could serve get_news…` | **Bug/dep pin** — yfinance 1.7.0 |
| Portfolio News tab | `news_unavailable_reason` + UI message | Config/entitlement (Finnhub key/plan) |

### Fix plan (Level 1)

1. Raise AgentFloor `backend/pyproject.toml` floor: `yfinance>=1.8.0`.
2. Refresh `backend/uv.lock` so resolved yfinance is ≥1.8.0.
3. Focused test: assert resolved/installed floor + news path does not surface `DATA_UNAVAILABLE` when Yahoo feed returns articles (mocked).
4. Do **not** invent API keys; no Finnhub/AV config changes.

### Status checklist

- [x] VAN complete — complexity Level 1
- [x] BUILD — bump + lock + tests + live smoke
- [x] PR opened
- [x] Memory Bank progress updated

### BUILD results

- `backend/pyproject.toml`: `yfinance>=1.8.0`
- `backend/uv.lock`: resolved `yfinance==1.8.0`
- `backend/tests/test_news_yfinance_floor.py`: 4 passed
- Live Yahoo `get_news` / `get_news_yfinance("AAPL", …)` OK (no `DATA_UNAVAILABLE`)

### Next Mode

Open PR → optional `/reflect`.
