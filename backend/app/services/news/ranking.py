"""Shared ranking helpers for portfolio news aggregation."""

from __future__ import annotations

from app.schemas.news import StandardizedArticle


def is_reuters_source(source: str | None) -> bool:
    return "reuters" in (source or "").casefold()


def rank_articles(
    articles: list[StandardizedArticle],
    *,
    priority_by_provider: dict[str, int] | None = None,
) -> list[StandardizedArticle]:
    """Sort by provider priority (asc), Reuters prefer, then published_at desc."""
    priorities = priority_by_provider or {}

    def sort_key(article: StandardizedArticle):
        published_ts = article.published_at.timestamp() if article.published_at else 0.0
        return (
            priorities.get(article.provider_id, 100),
            0 if is_reuters_source(article.source) else 1,
            -published_ts,
        )

    return sorted(articles, key=sort_key)


def normalize_url(url: str | None) -> str:
    return (url or "").strip().casefold().rstrip("/")


def normalize_title(title: str | None) -> str:
    return " ".join((title or "").casefold().split())


def dedupe_articles(articles: list[StandardizedArticle]) -> list[StandardizedArticle]:
    """Drop duplicates by URL first, then by normalized title."""
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    out: list[StandardizedArticle] = []
    for article in articles:
        url_key = normalize_url(article.url)
        title_key = normalize_title(article.title)
        if url_key and url_key in seen_urls:
            continue
        if title_key and title_key in seen_titles:
            continue
        if url_key:
            seen_urls.add(url_key)
        if title_key:
            seen_titles.add(title_key)
        out.append(article)
    return out
