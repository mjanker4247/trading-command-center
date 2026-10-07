"""Fetch and persist cloud LLM provider model catalogs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.models.llm_provider_catalog import LlmProviderCatalog
from app.services.encryption import decrypt_key
from app.utils.llm_providers import (
    DEFAULT_LLM_MODELS,
    PROVIDER_MODEL_CATALOG,
    catalog_with_default_first,
)

# When a live catalog exceeds this size, pickers use the curated visible subset.
VISIBLE_MODEL_THRESHOLD = 20

CLOUD_CATALOG_PROVIDERS: frozenset[str] = frozenset(
    {"openai", "anthropic", "google", "groq", "ionos"}
)

_OPENAI_COMPAT_MODELS_URL: dict[str, str] = {
    "openai": "https://api.openai.com/v1/models",
    "ionos": "https://openai.inference.de-txl.ionos.com/v1/models",
    "groq": "https://api.groq.com/openai/v1/models",
}


class CatalogError(Exception):
    """Raised when a provider catalog cannot be fetched or updated."""


def selection_required(catalog: list[str]) -> bool:
    return len(catalog) > VISIBLE_MODEL_THRESHOLD


def resolve_picker_models(row: LlmProviderCatalog | None, provider: str) -> list[str]:
    """Models shown in run/watchlist/portfolio LLM pickers."""
    if row is None:
        return list(PROVIDER_MODEL_CATALOG.get(provider, [DEFAULT_LLM_MODELS[provider]]))

    catalog = [m for m in (row.catalog_models or []) if isinstance(m, str) and m.strip()]
    if not catalog:
        return list(PROVIDER_MODEL_CATALOG.get(provider, [DEFAULT_LLM_MODELS[provider]]))

    if row.visible_models is not None:
        visible = [m for m in row.visible_models if isinstance(m, str) and m in catalog]
        if visible:
            return catalog_with_default_first(provider, visible)

    if selection_required(catalog) and provider in PROVIDER_MODEL_CATALOG:
        # Large catalog without a curated subset — fall back to seed list ∩ live catalog.
        seed = PROVIDER_MODEL_CATALOG[provider]
        intersected = [m for m in seed if m in catalog]
        if intersected:
            return catalog_with_default_first(provider, intersected)

    return catalog_with_default_first(provider, catalog)


def catalog_payload(row: LlmProviderCatalog | None, provider: str) -> dict[str, Any]:
    if row is None:
        seed = list(PROVIDER_MODEL_CATALOG.get(provider, [DEFAULT_LLM_MODELS[provider]]))
        return {
            "provider": provider,
            "catalog": seed,
            "visible": seed,
            "refreshed_at": None,
            "selection_required": selection_required(seed),
            "default_model": DEFAULT_LLM_MODELS[provider],
            "source": "seed",
        }

    catalog = [m for m in (row.catalog_models or []) if isinstance(m, str)]
    visible = resolve_picker_models(row, provider)
    return {
        "provider": provider,
        "catalog": catalog,
        "visible": visible,
        "refreshed_at": row.refreshed_at.isoformat() if row.refreshed_at else None,
        "selection_required": selection_required(catalog),
        "default_model": DEFAULT_LLM_MODELS[provider],
        "source": "live",
    }


def _parse_openai_compatible(payload: dict[str, Any]) -> list[str]:
    return sorted({m["id"] for m in payload.get("data", []) if isinstance(m, dict) and "id" in m})


def _parse_anthropic(payload: dict[str, Any]) -> list[str]:
    return sorted({m["id"] for m in payload.get("data", []) if isinstance(m, dict) and "id" in m})


def _parse_google(payload: dict[str, Any]) -> list[str]:
    models: list[str] = []
    for m in payload.get("models", []):
        if not isinstance(m, dict):
            continue
        name = m.get("name")
        if not isinstance(name, str):
            continue
        # API returns "models/gemini-2.5-flash"; callers expect bare ids.
        model_id = name.removeprefix("models/")
        methods = m.get("supportedGenerationMethods") or []
        if methods and "generateContent" not in methods:
            continue
        models.append(model_id)
    return sorted(set(models))


async def fetch_cloud_models(provider: str, api_key: str, client: httpx.AsyncClient) -> list[str]:
    if provider not in CLOUD_CATALOG_PROVIDERS:
        raise CatalogError(f"Provider '{provider}' does not support live model catalogs")

    if provider in _OPENAI_COMPAT_MODELS_URL:
        response = await client.get(
            _OPENAI_COMPAT_MODELS_URL[provider],
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        response.raise_for_status()
        return _parse_openai_compatible(response.json())

    if provider == "anthropic":
        response = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            timeout=15,
        )
        response.raise_for_status()
        return _parse_anthropic(response.json())

    if provider == "google":
        response = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key},
            timeout=15,
        )
        response.raise_for_status()
        return _parse_google(response.json())

    raise CatalogError(f"No catalog fetcher for provider '{provider}'")


def _seed_visible_after_refresh(
    provider: str,
    catalog: list[str],
    previous_visible: list[str] | None,
) -> list[str] | None:
    """Return visible subset to store, or None when the full catalog is small enough."""
    if not selection_required(catalog):
        return None

    catalog_set = set(catalog)
    if previous_visible:
        kept = [m for m in previous_visible if m in catalog_set]
        if kept:
            return catalog_with_default_first(provider, kept)

    seed = PROVIDER_MODEL_CATALOG.get(provider, [])
    intersected = [m for m in seed if m in catalog_set]
    if intersected:
        return catalog_with_default_first(provider, intersected)

    default = DEFAULT_LLM_MODELS[provider]
    if default in catalog_set:
        return [default]
    return catalog[:VISIBLE_MODEL_THRESHOLD]


async def get_catalog_row(db: AsyncSession, provider: str) -> LlmProviderCatalog | None:
    return (
        await db.execute(select(LlmProviderCatalog).where(LlmProviderCatalog.provider == provider))
    ).scalar_one_or_none()


async def refresh_provider_catalog(db: AsyncSession, provider: str) -> dict[str, Any]:
    if provider not in CLOUD_CATALOG_PROVIDERS:
        raise CatalogError(f"Provider '{provider}' does not support live model catalogs")

    key_row = (
        await db.execute(select(ApiKey).where(ApiKey.provider == provider))
    ).scalar_one_or_none()
    if not key_row:
        raise CatalogError(f"No API key configured for '{provider}'")

    api_key = decrypt_key(key_row.encrypted_key)
    try:
        async with httpx.AsyncClient() as client:
            models = await fetch_cloud_models(provider, api_key, client)
    except httpx.HTTPError as exc:
        raise CatalogError(f"Could not reach {provider} models API: {exc}") from exc

    if not models:
        raise CatalogError(f"{provider} returned an empty model list")

    row = await get_catalog_row(db, provider)
    previous_visible = list(row.visible_models) if row and row.visible_models is not None else None
    visible = _seed_visible_after_refresh(provider, models, previous_visible)
    now = datetime.now(timezone.utc)

    if row is None:
        row = LlmProviderCatalog(
            provider=provider,
            catalog_models=models,
            visible_models=visible,
            refreshed_at=now,
        )
        db.add(row)
    else:
        row.catalog_models = models
        row.visible_models = visible
        row.refreshed_at = now

    await db.commit()
    await db.refresh(row)
    return catalog_payload(row, provider)


async def update_visible_models(
    db: AsyncSession,
    provider: str,
    models: list[str],
) -> dict[str, Any]:
    if provider not in CLOUD_CATALOG_PROVIDERS:
        raise CatalogError(f"Provider '{provider}' does not support live model catalogs")

    row = await get_catalog_row(db, provider)
    if row is None or not row.catalog_models:
        raise CatalogError(f"No catalog for '{provider}'. Refresh models first.")

    catalog_set = set(row.catalog_models)
    cleaned = [m.strip() for m in models if isinstance(m, str) and m.strip()]
    if not cleaned:
        raise CatalogError("Select at least one model")

    unknown = [m for m in cleaned if m not in catalog_set]
    if unknown:
        raise CatalogError(f"Models not in catalog: {', '.join(unknown[:5])}")

    # Deduplicate while preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for model in cleaned:
        if model not in seen:
            seen.add(model)
            ordered.append(model)

    if not selection_required(list(row.catalog_models)) and set(ordered) == catalog_set:
        row.visible_models = None
    else:
        row.visible_models = catalog_with_default_first(provider, ordered)

    await db.commit()
    await db.refresh(row)
    return catalog_payload(row, provider)
