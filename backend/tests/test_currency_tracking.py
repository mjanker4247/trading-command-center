import pytest
from unittest.mock import AsyncMock

from app.schemas.money import PriceQuote
from app.utils.quote_currency import quote_currency_from_ticker


@pytest.mark.unit
def test_quote_currency_from_crypto_ticker_suffix():
    assert quote_currency_from_ticker("BTC-USD") == "USD"
    assert quote_currency_from_ticker("ETH-EUR") == "EUR"


@pytest.mark.unit
def test_quote_currency_from_stock_ticker_is_none():
    assert quote_currency_from_ticker("AAPL") is None


@pytest.mark.unit
def test_price_quote_normalizes_currency():
    quote = PriceQuote(amount=100.0, currency="usd")
    assert quote.currency_code == "USD"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_resolve_quote_currency_crypto_suffix():
    from app.services.quote_currency_service import resolve_quote_currency

    assert await resolve_quote_currency("BTC-USD") == "USD"
    assert await resolve_quote_currency("ETH-EUR") == "EUR"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_crypto_finnhub_fallback_does_not_mislabel_non_usd_pairs(monkeypatch):
    from app.services import crypto_data_service as crypto

    crypto._price_cache.clear()
    calls: list[str] = []

    async def _fake_finnhub_price(symbol: str, finnhub_key: str, now: float) -> float:
        calls.append(symbol)
        return 100.0

    monkeypatch.setattr(crypto, "_coingecko_id", AsyncMock(return_value=None))
    monkeypatch.setattr(crypto, "_finnhub_price", _fake_finnhub_price)

    quotes = await crypto.fetch_prices_batch(["ETH-EUR", "BTC-USD"], finnhub_key="finnhub-key")

    assert quotes["ETH-EUR"] is None
    assert quotes["BTC-USD"] == PriceQuote(amount=100.0, currency="USD")
    assert calls == ["BTC"]
