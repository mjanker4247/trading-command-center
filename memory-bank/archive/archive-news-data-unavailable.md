# TASK ARCHIVE: Fix news DATA_UNAVAILABLE

## METADATA

| Field | Value |
|---|---|
| Task ID | `news-data-unavailable` |
| Complexity | Level 1 (Quick Bug Fix) |
| Created | 2026-11-10 |
| Completed | 2026-11-10 (Europe/Berlin) |
| Workflow | VAN → BUILD → REFLECT → ARCHIVE (PLAN N/A) |
| PR | https://github.com/mjanker4247/trading-command-center/pull/86 |
| Branch | `cursor/fix-news-data-unavailable-c36c` |

## SUMMARY

TradingAgents run news (`get_news`) returned `DATA_UNAVAILABLE` because AgentFloor locked **yfinance 1.7.0**, which calls a retired Yahoo news endpoint. Raised AgentFloor’s floor to **yfinance ≥ 1.8.0** (lock → 1.8.0) and added focused regression tests. Not a Finnhub / portfolio News-panel config issue.

## REQUIREMENTS

1. Trace News UI → API → vendors; identify when `DATA_UNAVAILABLE` is returned
2. Distinguish config/ops vs app bugs
3. Minimal fix if in app/deps; focused tests
4. Open PR for code fix; no invented API keys

## IMPLEMENTATION

- `backend/pyproject.toml` — `yfinance>=1.8.0` (+ #1663 comment)
- `backend/uv.lock` — `yfinance==1.8.0`
- `backend/tests/test_news_yfinance_floor.py` — floor + routing regression coverage
- Vendor submodule left at TradingAgents `v0.7.1` / `c454491` (upstream floor PR #1671 still open)

## TESTING

- `pytest tests/test_news_yfinance_floor.py` — **4 passed**
- Live smoke under 1.8.0: `Ticker("AAPL").get_news(count=5)` → 5 articles; `get_news_yfinance` has no `DATA_UNAVAILABLE`

## LESSONS LEARNED

- Grep the sentinel first — it lives in TradingAgents’ router, not Finnhub UI copy
- AgentFloor should tighten transitive vendor floors when a locked point release breaks a production path
- Search fallback in `get_news_yfinance` does not run when `get_news` raises (only when empty)

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-news-data-unavailable.md`
- Upstream: TauricResearch/TradingAgents#1663, PR #1671
- Internal: Project store `internal/tcc-11-news-data-unavailable.md`
