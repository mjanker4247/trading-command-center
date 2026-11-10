from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.schemas.news import StandardizedArticle
from app.services.news.base import BaseNewsProvider
from app.services.news.finnhub import FinnhubNewsProvider
from app.services.news.ranking import dedupe_articles, rank_articles
from app.services.finnhub_client import FinnhubError, FinnhubReason, aggregate_unavailable_reason


async def fetch_for_tickers(
    providers: list[BaseNewsProvider],
    tickers: list[str],
    *,
    days: int = 7,
    limit: int = 40,
) -> tuple[list[StandardizedArticle], str | None]:
    if not providers or not tickers:
        return [], None

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    priority_by_provider = {p.provider_id: p.priority for p in providers}

    async def _one(provider: BaseNewsProvider, ticker: str) -> list[StandardizedArticle]:
        try:
            return await provider.fetch_news(ticker, start, end, provider.article_limit)
        except Exception:  # noqa: BLE001
            return []

    tasks = [_one(provider, ticker) for provider in providers for ticker in tickers]
    results = await asyncio.gather(*tasks)
    articles: list[StandardizedArticle] = []
    for batch in results:
        articles.extend(batch)

    ranked = rank_articles(dedupe_articles(articles), priority_by_provider=priority_by_provider)

    errors: list[FinnhubError | None] = []
    for provider in providers:
        if isinstance(provider, FinnhubNewsProvider):
            errors.append(provider.last_error)

    # If Finnhub is enabled without a key and nothing else returned articles, surface no_key.
    finnhub_providers = [p for p in providers if isinstance(p, FinnhubNewsProvider)]
    if (
        not ranked
        and finnhub_providers
        and all(p.last_error and p.last_error.reason == FinnhubReason.NO_KEY for p in finnhub_providers)
        and all(isinstance(p, FinnhubNewsProvider) for p in providers)
    ):
        return [], FinnhubReason.NO_KEY.value

    reason = aggregate_unavailable_reason(errors) if not ranked else None
    return ranked[:limit], reason
