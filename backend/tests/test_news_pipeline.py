"""Unit tests for pluggable news ranking, custom parsers, and aggregation."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.schemas.news import StandardizedArticle
from app.services.news.custom import CustomNewsProvider, _parse_rss
from app.services.news.ranking import dedupe_articles, is_reuters_source, rank_articles


@pytest.mark.unit
@pytest.mark.parametrize(
    "source,expected",
    [
        ("Reuters", True),
        ("reuters.com", True),
        ("Yahoo", False),
        (None, False),
    ],
)
def test_is_reuters_source(source, expected):
    assert is_reuters_source(source) is expected


@pytest.mark.unit
def test_rank_prefers_priority_then_reuters_then_recency():
    articles = [
        StandardizedArticle(
            title="Old Reuters",
            source="Reuters",
            provider_id="finnhub",
            published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
        StandardizedArticle(
            title="New custom",
            source="Wire",
            provider_id="custom_a",
            published_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        ),
        StandardizedArticle(
            title="New Reuters",
            source="reuters.com",
            provider_id="finnhub",
            published_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        ),
    ]
    ranked = rank_articles(
        articles,
        priority_by_provider={"finnhub": 10, "custom_a": 100},
    )
    assert [a.title for a in ranked] == ["New Reuters", "Old Reuters", "New custom"]


@pytest.mark.unit
def test_dedupe_by_url_and_title():
    articles = [
        StandardizedArticle(title="Same", url="https://x.test/a", provider_id="a"),
        StandardizedArticle(title="Same", url="https://x.test/a/", provider_id="b"),
        StandardizedArticle(title="Same Title", url="https://x.test/b", provider_id="c"),
        StandardizedArticle(title="same title", url="https://x.test/c", provider_id="d"),
    ]
    out = dedupe_articles(articles)
    assert len(out) == 2
    assert out[0].url.endswith("/a")
    assert out[1].provider_id == "c"


@pytest.mark.unit
def test_parse_rss_items():
    xml = """<?xml version="1.0"?>
    <rss><channel>
      <item>
        <title>Hello</title>
        <link>https://example.com/1</link>
        <description>Body</description>
        <pubDate>Mon, 10 Nov 2025 12:00:00 GMT</pubDate>
        <source>Wire</source>
      </item>
    </channel></rss>
    """
    articles = _parse_rss(xml, ticker="AAPL", provider_id="custom_rss", limit=5)
    assert len(articles) == 1
    assert articles[0].title == "Hello"
    assert articles[0].url == "https://example.com/1"
    assert articles[0].source == "Wire"


@pytest.mark.asyncio
async def test_custom_rest_provider_maps_articles(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com/news?symbol=AAPL",
        json={
            "articles": [
                {
                    "headline": "Rest Hit",
                    "summary": "Summary",
                    "url": "https://example.com/a",
                    "source": "CustomWire",
                    "datetime": 1_700_000_000,
                }
            ]
        },
    )
    provider = CustomNewsProvider(
        provider_id="custom_rest",
        display_name="Custom",
        kind="rest",
        endpoint_url="https://example.com/news?symbol={ticker}",
        items_path="articles",
    )
    articles = await provider.fetch_news(
        "AAPL",
        datetime.now(timezone.utc),
        datetime.now(timezone.utc),
        10,
    )
    assert len(articles) == 1
    assert articles[0].title == "Rest Hit"
    assert articles[0].provider_id == "custom_rest"


@pytest.mark.asyncio
async def test_get_portfolio_news_uses_aggregator(monkeypatch):
    from app.routers import portfolio as portfolio_router
    from app.services.news.finnhub import FinnhubNewsProvider

    class FakeFinnhub(FinnhubNewsProvider):
        async def fetch_news(self, ticker, start_date, end_date, limit):
            return [
                StandardizedArticle(
                    title="Yahoo late",
                    source="Yahoo",
                    provider_id="finnhub",
                    ticker=ticker,
                    published_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
                ),
                StandardizedArticle(
                    title="Reuters early",
                    source="Reuters",
                    provider_id="finnhub",
                    ticker=ticker,
                    published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
            ]

    async def fake_build_providers(db, enabled_only=True):
        return [FakeFinnhub(api_key="test-key")]

    monkeypatch.setattr(portfolio_router, "build_providers", fake_build_providers)
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
    assert response["articles"][0]["provider_id"] == "finnhub"
