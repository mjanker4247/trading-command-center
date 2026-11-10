# Tasks

## Active Task

**ID:** news-data-unavailable  
**Title:** Fix news DATA_UNAVAILABLE (yfinance 1.7.0 get_news break)  
**Created:** 2026-11-10  
**Status:** REFLECT complete → next `/archive`  
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

### PLAN (Level 1 — skipped by complexity)

PLAN mode map applies to Levels 2–4 only. Level 1 workflow is **VAN → BUILD → REFLECT**.
Invoked `/plan` after BUILD: record the mini-plan already used (no creative phase, no tech POC).

| Step | Action | Status |
|---|---|---|
| 1 | Pin `backend/pyproject.toml` → `yfinance>=1.8.0` | Done |
| 2 | Refresh `backend/uv.lock` → `yfinance==1.8.0` | Done |
| 3 | Add focused tests (`test_news_yfinance_floor.py`) | Done |
| 4 | No API keys; no Finnhub/AV config changes | Done |
| Creative | None | N/A |
| Tech validation | Existing stack; live smoke under 1.8.0 | Done |

**Out of scope:** Portfolio Finnhub News panel entitlement reasons; vendoring upstream TradingAgents#1671 (still open).

### Status checklist

- [x] VAN complete — complexity Level 1
- [x] PLAN — N/A for Level 1 (mini-plan recorded retrospectively)
- [x] BUILD — bump + lock + tests + live smoke
- [x] PR opened — https://github.com/mjanker4247/trading-command-center/pull/86
- [x] Memory Bank progress updated
- [x] REFLECT — `memory-bank/reflection/reflection-news-data-unavailable.md`
- [ ] ARCHIVE

### BUILD results

- `backend/pyproject.toml`: `yfinance>=1.8.0`
- `backend/uv.lock`: resolved `yfinance==1.8.0`
- `backend/tests/test_news_yfinance_floor.py`: 4 passed
- Live Yahoo `get_news` / `get_news_yfinance("AAPL", …)` OK (no `DATA_UNAVAILABLE`)

### Next Mode

**`/archive`**
