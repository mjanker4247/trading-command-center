from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote

import httpx

from app.schemas.news import StandardizedArticle
from app.services.news.base import BaseNewsProvider


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        try:
            return parsedate_to_datetime(text)
        except (TypeError, ValueError, IndexError):
            pass
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    return None


def _dig(data: Any, path: str | None) -> Any:
    if not path:
        return data
    cur = data
    for part in path.split("."):
        if not part:
            continue
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _as_item_list(payload: Any, items_path: str | None) -> list[dict]:
    node = _dig(payload, items_path)
    if isinstance(node, list):
        return [x for x in node if isinstance(x, dict)]
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("articles", "items", "data", "results", "news"):
            maybe = payload.get(key)
            if isinstance(maybe, list):
                return [x for x in maybe if isinstance(x, dict)]
    return []


def _map_rest_item(item: dict, *, ticker: str, provider_id: str) -> StandardizedArticle | None:
    title = item.get("title") or item.get("headline") or item.get("name") or ""
    if not title:
        return None
    content = item.get("content") or item.get("summary") or item.get("description") or ""
    url = item.get("url") or item.get("link") or ""
    source = item.get("source") or item.get("publisher") or provider_id
    if isinstance(source, dict):
        source = source.get("name") or provider_id
    published = (
        item.get("published_at")
        or item.get("publishedAt")
        or item.get("datetime")
        or item.get("pubDate")
        or item.get("date")
    )
    image = item.get("image") or item.get("image_url") or item.get("urlToImage")
    return StandardizedArticle(
        title=str(title),
        content=str(content)[:300],
        source=str(source),
        url=str(url),
        published_at=_parse_datetime(published),
        ticker=ticker,
        provider_id=provider_id,
        image=str(image) if image else None,
    )


def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _parse_rss(xml_text: str, *, ticker: str, provider_id: str, limit: int) -> list[StandardizedArticle]:
    root = ET.fromstring(xml_text)
    items = [el for el in root.iter() if _local(el.tag).lower() == "item"]
    if not items:
        items = [el for el in root.iter() if _local(el.tag).lower() == "entry"]

    articles: list[StandardizedArticle] = []
    for item in items:
        fields: dict[str, str] = {}
        link_href = ""
        for child in list(item):
            name = _local(child.tag).lower()
            if name == "link":
                link_href = (child.get("href") or (child.text or "")).strip() or link_href
            elif name in {"title", "description", "summary", "content", "pubdate", "published", "updated", "source"}:
                fields[name] = (child.text or "").strip()
        title = fields.get("title") or ""
        if not title:
            continue
        published = _parse_datetime(
            fields.get("pubdate") or fields.get("published") or fields.get("updated")
        )
        content = fields.get("description") or fields.get("summary") or fields.get("content") or ""
        articles.append(
            StandardizedArticle(
                title=title,
                content=content[:300],
                source=fields.get("source") or provider_id,
                url=link_href,
                published_at=published,
                ticker=ticker,
                provider_id=provider_id,
            )
        )
        if len(articles) >= limit:
            break
    return articles


class CustomNewsProvider(BaseNewsProvider):
    def __init__(
        self,
        *,
        provider_id: str,
        display_name: str,
        kind: str,
        endpoint_url: str,
        is_enabled: bool = True,
        priority: int = 100,
        article_limit: int = 20,
        auth_token: str | None = None,
        auth_header_name: str | None = "Authorization",
        items_path: str | None = None,
    ):
        self.provider_id = provider_id
        self.display_name = display_name
        self.kind = kind
        self.is_enabled = is_enabled
        self.priority = priority
        self.article_limit = article_limit
        self.endpoint_url = endpoint_url
        self._auth_token = auth_token
        self._auth_header_name = auth_header_name or "Authorization"
        self._items_path = items_path
        self.last_error_message: str | None = None

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "AgentFloorNews/1.0", "Accept": "*/*"}
        if self._auth_token:
            value = self._auth_token
            if self._auth_header_name.lower() == "authorization" and not value.lower().startswith(
                ("bearer ", "basic ", "token ")
            ):
                value = f"Bearer {value}"
            headers[self._auth_header_name] = value
        return headers

    def _filled_url(self, ticker: str) -> str:
        return (
            self.endpoint_url.replace("{ticker}", quote(ticker))
            .replace("{symbol}", quote(ticker))
            .replace("{TICKER}", quote(ticker.upper()))
        )

    async def fetch_news(
        self,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        limit: int,
    ) -> list[StandardizedArticle]:
        url = self._filled_url(ticker)
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                response = await client.get(url, headers=self._headers())
            if response.status_code >= 400:
                self.last_error_message = f"HTTP {response.status_code}"
                return []
            if self.kind == "rss":
                return _parse_rss(
                    response.text,
                    ticker=ticker,
                    provider_id=self.provider_id,
                    limit=limit,
                )
            payload = response.json()
            items = _as_item_list(payload, self._items_path)
            articles: list[StandardizedArticle] = []
            for item in items:
                mapped = _map_rest_item(item, ticker=ticker, provider_id=self.provider_id)
                if mapped:
                    articles.append(mapped)
                if len(articles) >= limit:
                    break
            return articles
        except Exception as exc:  # noqa: BLE001 — provider isolation
            self.last_error_message = str(exc)
            return []

    async def validate_credentials(self) -> tuple[bool, str]:
        articles = await self.fetch_news(
            "AAPL",
            datetime.now(timezone.utc),
            datetime.now(timezone.utc),
            min(3, self.article_limit),
        )
        if self.last_error_message:
            return False, self.last_error_message
        if not articles:
            return False, "No articles returned from endpoint"
        return True, f"OK ({len(articles)} sample articles)"
