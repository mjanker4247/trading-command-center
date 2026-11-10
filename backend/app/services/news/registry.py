from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.models.news_provider import NewsProviderConfig
from app.services.encryption import decrypt_key
from app.services.news.base import BaseNewsProvider
from app.services.news.custom import CustomNewsProvider
from app.services.news.finnhub import FinnhubNewsProvider

BUILTIN_SEEDS: list[dict[str, Any]] = [
    {
        "provider_id": "finnhub",
        "display_name": "Finnhub",
        "kind": "builtin",
        "is_enabled": True,
        "priority": 10,
        "article_limit": 20,
        "api_key_provider": "finnhub",
        "extra": {"ui_visible": True},
    },
    {
        "provider_id": "yfinance",
        "display_name": "Yahoo Finance",
        "kind": "builtin",
        "is_enabled": False,
        "priority": 50,
        "article_limit": 20,
        "api_key_provider": None,
        "extra": {"ui_visible": False},
    },
    {
        "provider_id": "alpha_vantage",
        "display_name": "Alpha Vantage",
        "kind": "builtin",
        "is_enabled": False,
        "priority": 60,
        "article_limit": 20,
        "api_key_provider": "alpha_vantage",
        "extra": {"ui_visible": False},
    },
]

UI_VISIBLE_BUILTINS = {"finnhub"}


async def ensure_builtin_providers(db: AsyncSession) -> None:
    existing = {
        row.provider_id
        for row in (
            await db.execute(select(NewsProviderConfig.provider_id))
        ).scalars().all()
    }
    created = False
    for seed in BUILTIN_SEEDS:
        if seed["provider_id"] in existing:
            continue
        db.add(NewsProviderConfig(id=uuid.uuid4(), **seed))
        created = True
    if created:
        await db.commit()


async def list_provider_rows(db: AsyncSession) -> list[NewsProviderConfig]:
    await ensure_builtin_providers(db)
    result = await db.execute(
        select(NewsProviderConfig).order_by(
            NewsProviderConfig.priority.asc(),
            NewsProviderConfig.display_name.asc(),
        )
    )
    return list(result.scalars().all())


async def _load_key_map(db: AsyncSession) -> dict[str, str]:
    rows = (await db.execute(select(ApiKey))).scalars().all()
    out: dict[str, str] = {}
    for row in rows:
        plain = decrypt_key(row.encrypted_key)
        if plain:
            out[row.provider] = plain
    return out


def is_ui_visible(row: NewsProviderConfig) -> bool:
    extra = row.extra or {}
    if "ui_visible" in extra:
        return bool(extra["ui_visible"])
    if row.kind != "builtin":
        return True
    return row.provider_id in UI_VISIBLE_BUILTINS


async def build_providers(
    db: AsyncSession,
    *,
    enabled_only: bool = True,
) -> list[BaseNewsProvider]:
    rows = await list_provider_rows(db)
    keys = await _load_key_map(db)
    providers: list[BaseNewsProvider] = []

    for row in rows:
        if enabled_only and not row.is_enabled:
            continue
        if row.provider_id == "finnhub":
            providers.append(
                FinnhubNewsProvider(
                    api_key=keys.get(row.api_key_provider or "finnhub"),
                    display_name=row.display_name,
                    is_enabled=row.is_enabled,
                    priority=row.priority,
                    article_limit=row.article_limit,
                )
            )
            continue
        if row.kind in {"rest", "rss"} and row.endpoint_url:
            token = keys.get(row.api_key_provider) if row.api_key_provider else None
            items_path = (row.extra or {}).get("items_path")
            providers.append(
                CustomNewsProvider(
                    provider_id=row.provider_id,
                    display_name=row.display_name,
                    kind=row.kind,
                    endpoint_url=row.endpoint_url,
                    is_enabled=row.is_enabled,
                    priority=row.priority,
                    article_limit=row.article_limit,
                    auth_token=token,
                    auth_header_name=row.auth_header_name,
                    items_path=items_path,
                )
            )
            continue
        # yfinance / alpha_vantage seeded but not implemented in v1 portfolio path
    return providers
