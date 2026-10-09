"""AgentFloor data-vendor API keys stored in ``api_keys`` and injected into TradingAgents.

Finnhub stays AgentFloor-only (portfolio prices / outcomes) and is not listed here.
"""

from __future__ import annotations

# provider id in api_keys.provider → TradingAgents / process env var
DATA_PROVIDER_ENV: dict[str, str] = {
    "fred": "FRED_API_KEY",
    "alpha_vantage": "ALPHA_VANTAGE_API_KEY",
    "typesafe": "TYPESAFE_API_KEY",
    "sec_edgar": "SEC_EDGAR_USER_AGENT",
}

# Providers shown in Settings → Data Providers (plus finnhub, handled separately).
TRADINGAGENTS_DATA_PROVIDERS: frozenset[str] = frozenset(DATA_PROVIDER_ENV)
