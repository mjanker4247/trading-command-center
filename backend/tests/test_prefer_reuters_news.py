"""Unit tests for Reuters preference in portfolio news ranking."""

import pytest
from unittest.mock import AsyncMock

from app.routers.portfolio import _is_reuters_source, _prefer_reuters_articles


@pytest.mark.unit
@pytest.mark.parametrize(
    "source,expected",
    [
        ("Reuters", True),
        ("reuters", True),
        ("REUTERS", True),
        ("reuters.com", True),
        ("Yahoo", False),
        ("Bloomberg", False),
        ("", False),
        (None, False),
    ],
)
def test_is_reuters_source(source, expected):
    assert _is_reuters_source(source) is expected


@pytest.mark.unit
def test_prefer_reuters_articles_orders_reuters_first_then_recency():
    articles = [
        {"headline": "Old Reuters", "source": "Reuters", "datetime": 100},
        {"headline": "New Yahoo", "source": "Yahoo", "datetime": 300},
        {"headline": "New Reuters", "source": "reuters.com", "datetime": 200},
        {"headline": "Mid Yahoo", "source": "Yahoo", "datetime": 150},
    ]

    ranked = _prefer_reuters_articles(articles)

    assert [a["headline"] for a in ranked] == [
        "New Reuters",
        "Old Reuters",
        "New Yahoo",
        "Mid Yahoo",
    ]


@pytest.mark.unit
def test_prefer_reuters_survives_limit_slice():
    articles = [
        {"headline": "Yahoo hot", "source": "Yahoo", "datetime": 500},
        {"headline": "Reuters cool", "source": "Reuters", "datetime": 100},
        {"headline": "Bloomberg mid", "source": "Bloomberg", "datetime": 400},
    ]

    preferred = _prefer_reuters_articles(articles)
    limited = preferred[:2]

    assert limited[0]["headline"] == "Reuters cool"
    assert limited[1]["headline"] == "Yahoo hot"


@pytest.mark.asyncio
async def test_get_portfolio_news_applies_reuters_preference(monkeypatch):
    async def fake_fetch_news(ticker, api_key, days):
        return [
            {"ticker": ticker, "headline": "Yahoo late", "source": "Yahoo", "datetime": 300},
            {"ticker": ticker, "headline": "Reuters early", "source": "Reuters", "datetime": 100},
            {"ticker": ticker, "headline": "Bloomberg mid", "source": "Bloomberg", "datetime": 200},
        ], None

    from app.routers import portfolio as portfolio_router

    monkeypatch.setattr(portfolio_router, "_fetch_news", fake_fetch_news)
    monkeypatch.setattr(portfolio_router, "_get_finnhub_key", AsyncMock(return_value="test-key"))
    monkeypatch.setattr(portfolio_router, "_verify_portfolio_access", AsyncMock())

    class FakeHolding:
        ticker = "AAPL"

    class FakeSnapshot:
        holdings = [FakeHolding()]

    class FakeResult:
        def scalar_one_or_none(self):
            return FakeSnapshot()

    class FakeDb:
        async def execute(self, *_args, **_kwargs):
            return FakeResult()

    class FakeUser:
        id = "00000000-0000-0000-0000-000000000099"

    response = await portfolio_router.get_portfolio_news(
        portfolio_id="00000000-0000-0000-0000-000000000001",
        days=7,
        limit=2,
        db=FakeDb(),
        user=FakeUser(),
    )

    headlines = [a["headline"] for a in response["articles"]]
    assert headlines == ["Reuters early", "Yahoo late"]
    assert response["news_unavailable_reason"] is None
