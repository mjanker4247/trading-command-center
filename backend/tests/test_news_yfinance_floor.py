"""Guard the yfinance floor that keeps TradingAgents get_news off DATA_UNAVAILABLE.

yfinance 1.7.0's Ticker.get_news() hits a retired Yahoo /xhr/ncp endpoint and
raises YFDataException. TradingAgents wraps that as VendorUnavailableError before
the Search.news fallback can run, so route_to_vendor returns DATA_UNAVAILABLE
for every symbol (TauricResearch/TradingAgents#1663). yfinance >=1.8.0 restores
the GraphQL quote-news feed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from importlib.metadata import version

import pytest
from packaging.version import Version

pytestmark = pytest.mark.unit


def test_installed_yfinance_meets_news_floor():
    assert Version(version("yfinance")) >= Version("1.8.0")


def test_get_news_yfinance_returns_articles_when_quote_feed_works(monkeypatch):
    from tradingagents.dataflows.vendors.yahoo import news as ynews

    pub = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    feed = [
        {
            "id": "1",
            "content": {
                "title": "Acme ships product",
                "summary": "Details",
                "provider": {"displayName": "TestWire"},
                "canonicalUrl": {"url": "https://example.com/a"},
                "pubDate": pub,
            },
        }
    ]

    class FakeTicker:
        def __init__(self, symbol):
            self.symbol = symbol

        def get_news(self, count=20, tab="news"):
            return feed

    monkeypatch.setattr(ynews.yf, "Ticker", FakeTicker)
    # Avoid real network if Search were somehow invoked.
    monkeypatch.setattr(ynews, "_search_news", lambda *_a, **_k: ([], False))

    today = datetime.now(UTC).date()
    start = (today - timedelta(days=7)).isoformat()
    end = today.isoformat()
    out = ynews.get_news_yfinance("AAPL", start, end)

    assert "DATA_UNAVAILABLE" not in out
    assert "Acme ships product" in out
    assert "AAPL" in out


def test_yf_retry_maps_quote_feed_exception_to_vendor_unavailable():
    """Documents the 1.7.0 failure mode: exception → VendorUnavailable, no Search fallback."""
    from tradingagents.dataflows.errors import VendorUnavailableError
    from tradingagents.dataflows.vendors.yahoo.common import yf_retry

    def boom():
        raise RuntimeError("*** YAHOO! FINANCE IS CURRENTLY DOWN! ***")

    with pytest.raises(VendorUnavailableError, match="request failed"):
        yf_retry(boom, max_retries=0)


def test_route_to_vendor_surfaces_data_unavailable_when_all_news_vendors_fail(monkeypatch):
    from tradingagents.dataflows import router
    from tradingagents.dataflows.errors import VendorUnavailableError

    def fail_news(*_a, **_k):
        raise VendorUnavailableError("Yahoo Finance request failed: YFDataException")

    monkeypatch.setitem(
        router.VENDOR_METHODS,
        "get_news",
        {"yfinance": fail_news},
    )
    monkeypatch.setattr(
        router,
        "get_vendor",
        lambda category, method=None: "yfinance",
    )

    out = router.route_to_vendor("get_news", "AAPL", "2026-11-01", "2026-11-10")
    assert out.startswith("DATA_UNAVAILABLE:")
    assert "get_news" in out
