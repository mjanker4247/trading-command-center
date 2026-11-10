from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

from app.schemas.news import StandardizedArticle
from app.services.finnhub_client import (
    FinnhubCapability,
    FinnhubError,
    FinnhubReason,
    fetch_json,
    should_cache_error,
)
from app.services.news.base import BaseNewsProvider

_news_cache: dict[str, tuple[list[StandardizedArticle], float, FinnhubError | None]] = {}
_NEWS_TTL = 3600


def clear_news_cache() -> None:
    _news_cache.clear()


async def fetch_finnhub_news(
    ticker: str,
    api_key: str,
    days: int,
) -> tuple[list[StandardizedArticle], FinnhubError | None]:
    cache_key = f"{ticker}:{days}"
    now = time.time()
    if cache_key in _news_cache:
        data, expiry, cached_error = _news_cache[cache_key]
        if now < expiry:
            return data, cached_error

    today = date.today()
    from_date = today - timedelta(days=days)
    raw, error = await fetch_json(
        "/company-news",
        api_key,
        FinnhubCapability.COMPANY_NEWS,
        params={"symbol": ticker, "from": from_date, "to": today},
    )
    if error:
        if not should_cache_error(error):
            return [], error
        _news_cache[cache_key] = ([], now + 120, error)
        return [], error

    articles: list[StandardizedArticle] = []
    for item in raw if isinstance(raw, list) else []:
        headline = item.get("headline") or ""
        if not headline:
            continue
        ts = item.get("datetime")
        published_at = None
        if isinstance(ts, (int, float)) and ts:
            published_at = datetime.fromtimestamp(ts, tz=timezone.utc)
        articles.append(
            StandardizedArticle(
                title=headline,
                content=(item.get("summary") or "")[:300],
                source=item.get("source") or "",
                url=item.get("url") or "",
                published_at=published_at,
                ticker=ticker,
                provider_id="finnhub",
                image=item.get("image") or None,
            )
        )
    _news_cache[cache_key] = (articles, now + _NEWS_TTL, None)
    return articles, None


def articles_to_legacy_dicts(articles: list[StandardizedArticle]) -> list[dict]:
    out: list[dict] = []
    for article in articles:
        out.append(
            {
                "ticker": article.ticker or "",
                "datetime": int(article.published_at.timestamp()) if article.published_at else 0,
                "headline": article.title,
                "summary": (article.content or "")[:300],
                "url": article.url,
                "source": article.source,
                "image": article.image or "",
                "provider_id": article.provider_id,
            }
        )
    return out


class FinnhubNewsProvider(BaseNewsProvider):
    def __init__(
        self,
        *,
        api_key: str | None,
        display_name: str = "Finnhub",
        is_enabled: bool = True,
        priority: int = 10,
        article_limit: int = 20,
        last_error: FinnhubError | None = None,
    ):
        self.provider_id = "finnhub"
        self.display_name = display_name
        self.is_enabled = is_enabled
        self.priority = priority
        self.article_limit = article_limit
        self._api_key = api_key
        self.last_error = last_error

    async def fetch_news(
        self,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        limit: int,
    ) -> list[StandardizedArticle]:
        if not self._api_key:
            self.last_error = FinnhubError(
                capability=FinnhubCapability.COMPANY_NEWS,
                reason=FinnhubReason.NO_KEY,
                message="Finnhub API key is not configured",
            )
            return []
        days = max(1, (end_date.date() - start_date.date()).days or 1)
        articles, error = await fetch_finnhub_news(ticker, self._api_key, days)
        self.last_error = error
        return articles[:limit]

    async def validate_credentials(self) -> tuple[bool, str]:
        if not self._api_key:
            return False, "Finnhub API key is not configured"
        articles, error = await fetch_finnhub_news("AAPL", self._api_key, 3)
        if error:
            return False, error.message or error.reason.value
        return True, f"OK ({len(articles)} sample articles)"
