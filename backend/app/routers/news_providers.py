from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.api_key import ApiKey
from app.models.news_provider import NewsProviderConfig
from app.models.user import User
from app.schemas.news import (
    CustomNewsProviderRequest,
    NewsProviderBulkUpdateRequest,
    NewsProviderConfigOut,
    NewsProviderTestRequest,
    NewsProviderTestResponse,
)
from app.services.encryption import decrypt_key, encrypt_key
from app.services.news.custom import CustomNewsProvider
from app.services.news.finnhub import FinnhubNewsProvider
from app.services.news.registry import (
    build_providers,
    is_ui_visible,
    list_provider_rows,
)

router = APIRouter()


def _mask(key: str) -> str:
    return key[:4] + "•" * (len(key) - 8) + key[-4:] if len(key) > 8 else "•" * len(key)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().casefold()).strip("_")
    return slug[:40] or "source"


async def _masked_for_row(db: AsyncSession, row: NewsProviderConfig) -> tuple[str | None, bool]:
    if not row.api_key_provider:
        return None, False
    key_row = (
        await db.execute(select(ApiKey).where(ApiKey.provider == row.api_key_provider))
    ).scalar_one_or_none()
    if not key_row:
        return None, False
    plain = decrypt_key(key_row.encrypted_key)
    if not plain:
        return None, True
    return _mask(plain), True


async def _to_out(db: AsyncSession, row: NewsProviderConfig) -> NewsProviderConfigOut:
    masked, has_key = await _masked_for_row(db, row)
    return NewsProviderConfigOut(
        id=row.id,
        provider_id=row.provider_id,
        display_name=row.display_name,
        kind=row.kind,  # type: ignore[arg-type]
        is_enabled=row.is_enabled,
        priority=row.priority,
        article_limit=row.article_limit,
        endpoint_url=row.endpoint_url,
        api_key_provider=row.api_key_provider,
        auth_header_name=row.auth_header_name,
        masked_api_key=masked,
        has_api_key=has_key,
        ui_visible=is_ui_visible(row),
        extra=row.extra,
    )


@router.get("", response_model=list[NewsProviderConfigOut])
async def list_news_providers(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = await list_provider_rows(db)
    visible = [row for row in rows if is_ui_visible(row)]
    return [await _to_out(db, row) for row in visible]


@router.put("", response_model=list[NewsProviderConfigOut])
async def update_news_providers(
    req: NewsProviderBulkUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = await list_provider_rows(db)
    by_id = {row.provider_id: row for row in rows}
    for item in req.providers:
        row = by_id.get(item.provider_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown provider {item.provider_id}")
        if item.is_enabled is not None:
            row.is_enabled = item.is_enabled
        if item.priority is not None:
            row.priority = item.priority
        if item.article_limit is not None:
            row.article_limit = item.article_limit
    await db.commit()
    rows = await list_provider_rows(db)
    visible = [row for row in rows if is_ui_visible(row)]
    return [await _to_out(db, row) for row in visible]


@router.post("/test", response_model=NewsProviderTestResponse)
async def test_news_provider(
    req: NewsProviderTestRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = await list_provider_rows(db)
    row = next((r for r in rows if r.provider_id == req.provider_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")

    providers = await build_providers(db, enabled_only=False)
    provider = next((p for p in providers if p.provider_id == req.provider_id), None)
    if provider is None and row.provider_id == "finnhub":
        # disabled finnhub still testable
        from app.services.finnhub_client import get_finnhub_key

        provider = FinnhubNewsProvider(api_key=await get_finnhub_key(db))
    if provider is None and row.kind in {"rest", "rss"} and row.endpoint_url:
        token = None
        if row.api_key_provider:
            key_row = (
                await db.execute(select(ApiKey).where(ApiKey.provider == row.api_key_provider))
            ).scalar_one_or_none()
            token = decrypt_key(key_row.encrypted_key) if key_row else None
        provider = CustomNewsProvider(
            provider_id=row.provider_id,
            display_name=row.display_name,
            kind=row.kind,
            endpoint_url=row.endpoint_url,
            auth_token=token,
            auth_header_name=row.auth_header_name,
            items_path=(row.extra or {}).get("items_path"),
            article_limit=row.article_limit,
        )
    if provider is None:
        return NewsProviderTestResponse(ok=False, message="Provider not available in v1")

    ok, message = await provider.validate_credentials()
    return NewsProviderTestResponse(ok=ok, message=message)


@router.post("/custom", response_model=NewsProviderConfigOut, status_code=status.HTTP_201_CREATED)
async def create_custom_news_provider(
    req: CustomNewsProviderRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    provider_uuid = uuid.uuid4()
    provider_id = f"custom_{_slugify(req.display_name)}_{provider_uuid.hex[:8]}"
    api_key_provider = None
    if req.auth_token:
        api_key_provider = f"news_custom_{provider_uuid.hex}"
        db.add(
            ApiKey(
                provider=api_key_provider,
                encrypted_key=encrypt_key(req.auth_token),
                is_valid=True,
                created_by=admin.id,
            )
        )

    row = NewsProviderConfig(
        id=provider_uuid,
        provider_id=provider_id,
        display_name=req.display_name.strip(),
        kind=req.kind,
        is_enabled=req.is_enabled,
        priority=req.priority,
        article_limit=req.article_limit,
        endpoint_url=req.endpoint_url.strip(),
        api_key_provider=api_key_provider,
        auth_header_name=req.auth_header_name if req.auth_token else None,
        extra={"ui_visible": True, "items_path": req.items_path},
        created_by=admin.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _to_out(db, row)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_news_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    row = (
        await db.execute(select(NewsProviderConfig).where(NewsProviderConfig.provider_id == provider_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")
    if row.kind == "builtin":
        raise HTTPException(status_code=400, detail="Builtin providers cannot be deleted")

    if row.api_key_provider and row.api_key_provider.startswith("news_custom_"):
        key_row = (
            await db.execute(select(ApiKey).where(ApiKey.provider == row.api_key_provider))
        ).scalar_one_or_none()
        if key_row:
            await db.delete(key_row)

    await db.delete(row)
    await db.commit()
