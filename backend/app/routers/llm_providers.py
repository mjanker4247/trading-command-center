import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.encryption import decrypt_key
from app.services.llm_provider_registry import list_local_models
from app.services.cloud_model_catalog import (
    CLOUD_CATALOG_PROVIDERS,
    CatalogError,
    catalog_payload,
    get_catalog_row,
    refresh_provider_catalog,
    resolve_picker_models,
    update_visible_models,
)
from app.dependencies import get_current_user, require_admin
from app.utils.llm_providers import (
    DEFAULT_LLM_DEPTH,
    DEFAULT_LLM_MODELS,
    DEFAULT_LLM_PROVIDER,
    LOCAL_LLM_PROVIDERS,
    normalize_llm_provider,
)

router = APIRouter()


class LlmProviderDefaultsResponse(BaseModel):
    default_provider: str
    default_depth: str
    default_models: dict[str, str]


class ProviderCatalogResponse(BaseModel):
    provider: str
    catalog: list[str]
    visible: list[str]
    refreshed_at: str | None
    selection_required: bool
    default_model: str
    source: str


class VisibleModelsUpdate(BaseModel):
    models: list[str] = Field(min_length=1)


@router.get("/defaults", response_model=LlmProviderDefaultsResponse)
async def get_provider_defaults(
    _user: User = Depends(get_current_user),
) -> LlmProviderDefaultsResponse:
    return LlmProviderDefaultsResponse(
        default_provider=DEFAULT_LLM_PROVIDER,
        default_depth=DEFAULT_LLM_DEPTH,
        default_models=dict(DEFAULT_LLM_MODELS),
    )


@router.get("/{provider}/models/catalog", response_model=ProviderCatalogResponse)
async def get_provider_catalog(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        provider = normalize_llm_provider(provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    if provider not in CLOUD_CATALOG_PROVIDERS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Provider '{provider}' does not support a persisted model catalog",
        )

    row = await get_catalog_row(db, provider)
    return ProviderCatalogResponse(**catalog_payload(row, provider))


@router.post("/{provider}/models/refresh", response_model=ProviderCatalogResponse)
async def refresh_models(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        provider = normalize_llm_provider(provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    try:
        payload = await refresh_provider_catalog(db, provider)
    except CatalogError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "No API key" in detail else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(code, detail) from exc

    return ProviderCatalogResponse(**payload)


@router.put("/{provider}/models/visible", response_model=ProviderCatalogResponse)
async def put_visible_models(
    provider: str,
    body: VisibleModelsUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        provider = normalize_llm_provider(provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    try:
        payload = await update_visible_models(db, provider, body.models)
    except CatalogError as exc:
        detail = str(exc)
        code = status.HTTP_400_BAD_REQUEST
        if "Refresh models first" in detail:
            code = status.HTTP_404_NOT_FOUND
        raise HTTPException(code, detail) from exc

    return ProviderCatalogResponse(**payload)


@router.get("/{provider}/models", response_model=list[str])
async def list_models(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    try:
        provider = normalize_llm_provider(provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    if provider in CLOUD_CATALOG_PROVIDERS:
        row = await get_catalog_row(db, provider)
        return resolve_picker_models(row, provider)

    if provider not in LOCAL_LLM_PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown provider '{provider}'")

    row = (await db.execute(select(ApiKey).where(ApiKey.provider == provider))).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No URL configured for local provider '{provider}'")

    base_url = decrypt_key(row.encrypted_key).rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            return await list_local_models(provider, base_url, client)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not reach {provider} server: {exc}")
