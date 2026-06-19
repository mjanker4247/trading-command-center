import pytest

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
