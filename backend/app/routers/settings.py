"""System-wide application settings endpoints."""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User, UserRole
from app.services.settings_service import SettingsDataError, get_app_settings, update_app_settings
from app.services.smtp_settings_service import get_smtp_settings, update_smtp_settings

router = APIRouter()
logger = logging.getLogger(__name__)


class AppSettingsUpdate(BaseModel):
    observation_covariance: float = Field(ge=0.0001, le=10.0)
    transition_covariance: float = Field(ge=0.0001, le=1.0)
    processing_mode: Literal["causal", "historical"] = "causal"
    enable_kalman_filter: bool = True
    enable_elliott_wave: bool = True
    enable_markov_regime: bool = True
    enable_portfolio_optimizer: bool = True


class SmtpSettingsUpdate(BaseModel):
    host: str = ""
    port: int = Field(default=25, ge=1, le=65535)
    user: str = ""
    # Omit or empty = keep existing password; send clear_password=true to wipe.
    password: Optional[str] = None
    clear_password: bool = False
    from_address: str = "noreply@agentfloor.local"
    start_tls: bool = False


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        logger.warning(
            "settings update denied for user_id=%s email=%s role=%s",
            user.id,
            user.email,
            user.role.value if hasattr(user.role, "value") else user.role,
        )
        raise HTTPException(status_code=403, detail="Admin required")


@router.get("/settings")
async def get_current_app_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return system-wide settings for all authenticated users."""
    return await get_app_settings(db)


@router.put("/settings")
async def put_app_settings(
    body: AppSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update system-wide settings. Admin-only."""
    _require_admin(user)

    try:
        return await update_app_settings(
            db,
            observation_covariance=body.observation_covariance,
            transition_covariance=body.transition_covariance,
            processing_mode=body.processing_mode,
            enable_kalman_filter=body.enable_kalman_filter,
            enable_elliott_wave=body.enable_elliott_wave,
            enable_markov_regime=body.enable_markov_regime,
            enable_portfolio_optimizer=body.enable_portfolio_optimizer,
        )
    except SettingsDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/settings/smtp")
async def get_smtp(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return SMTP transport settings. Admin-only (password never returned)."""
    _require_admin(user)
    return await get_smtp_settings(db)


@router.put("/settings/smtp")
async def put_smtp(
    body: SmtpSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update SMTP transport settings. Admin-only."""
    _require_admin(user)
    try:
        return await update_smtp_settings(
            db,
            host=body.host,
            port=body.port,
            user=body.user,
            from_address=body.from_address,
            start_tls=body.start_tls,
            password=body.password,
            clear_password=body.clear_password,
        )
    except SettingsDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
