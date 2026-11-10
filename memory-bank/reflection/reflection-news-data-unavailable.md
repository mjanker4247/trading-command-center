# Reflection: news-data-unavailable

**Date:** 2026-11-10 (Europe/Berlin)  
**Complexity:** Level 1 (Quick Bug Fix)  
**Status:** BUILD + PR complete ([#86](https://github.com/mjanker4247/trading-command-center/pull/86))

## Summary

Run News / TradingAgents `get_news` returned `DATA_UNAVAILABLE` because AgentFloor locked **yfinance 1.7.0**, whose `Ticker.get_news()` hits a Yahoo endpoint Yahoo retired. Raising the AgentFloor floor to **≥1.8.0** (lock → 1.8.0) restores the GraphQL quote-news feed. This was a dependency pin bug, not a missing Finnhub key and not portfolio News-panel entitlement handling.

## Solution

| Change | Detail |
|---|---|
| `backend/pyproject.toml` | `yfinance>=1.8.0` + comment citing TradingAgents#1663 |
| `backend/uv.lock` | Resolved `yfinance==1.8.0` |
| `backend/tests/test_news_yfinance_floor.py` | Floor assert, happy-path mock, `yf_retry`→`VendorUnavailableError` doc, router `DATA_UNAVAILABLE` when all vendors fail |

Live smoke: `Ticker("AAPL").get_news(count=5)` → 5 articles; `get_news_yfinance` has no `DATA_UNAVAILABLE`.

## What went well

- Grepping the sentinel string first correctly redirected away from Finnhub portfolio news into the vendored TradingAgents router.
- Upstream issue #1663 / PR #1671 confirmed root cause and fix version without inventing keys or rewriting vendor news logic.
- Minimal AgentFloor-side pin (no submodule rewrite) unblocked news while upstream floor PR remains open.
- Focused tests document both the happy path and the failure-mode contract.

## Challenges

- Initial scope mentioned Finnhub / portfolio News; the user-facing error string lives in the **run** news tool path — easy to mis-attribute without a full stack grep.
- `get_news_yfinance` Search fallback only runs on empty feed, not on raise — so 1.7.0 looked like “all vendors down” even though Search still worked.

## Lessons learned

1. Vendor sentinel strings (`DATA_UNAVAILABLE`) often mean “every configured vendor failed,” not “symbol has no news” — distinguish from `NO_DATA_AVAILABLE` and from Finnhub `*_unavailable_reason`.
2. Path deps can satisfy a loose floor (`>=1.7.0`) while the lock stays on a broken point release; AgentFloor should pin its own tighter floor when a transitive break hits production paths.
3. Live one-call smoke after lock refresh is cheap proof for data-vendor pins.

## Process / technical follow-ups

- When TradingAgents#1671 merges, bump `vendor/TradingAgents` so the submodule floor matches AgentFloor.
- Optional resilience (upstream #1649/#1656): run Search fallback when quote `get_news` raises, not only when empty.
- Archive this task after PR merge (`/archive`).

## Next steps

**`/archive`** once reflection is filed and PR lifecycle allows archival.
