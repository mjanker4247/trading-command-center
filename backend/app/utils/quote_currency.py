"""Resolve quote / listing currency from tickers and metadata."""

from __future__ import annotations

from typing import Optional

from app.utils.asset_type import is_crypto


def quote_currency_from_ticker(ticker: str) -> Optional[str]:
    """Return quote currency from crypto pair suffix (e.g. BTC-EUR → EUR)."""
    if is_crypto(ticker):
        parts = ticker.split("-")
        if len(parts) >= 2:
            return parts[-1].upper()
    return None
