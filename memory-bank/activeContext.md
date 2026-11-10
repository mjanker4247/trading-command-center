# Active Context

## Focus

**news-data-unavailable** — fix TradingAgents news `DATA_UNAVAILABLE` caused by locked yfinance 1.7.0.

## Mode

VAN complete → BUILD (Level 1).

## Key facts

- Sentinel from `vendor/TradingAgents/.../router.py`, not Finnhub portfolio news.
- Fix: pin `yfinance>=1.8.0` in AgentFloor backend + lock refresh.
- Upstream #1663 / #1671 confirm 1.8.0 restores `Ticker.get_news()`.
