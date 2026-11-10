"""System-wide SMTP settings (admin-managed; password Fernet-encrypted)."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import AppSettings
from app.services.encryption import decrypt_key, encrypt_key
from app.services.settings_service import SettingsDataError, get_app_settings

_APP_SETTINGS_ID = 1
_SMTP_PORT_MIN = 1
_SMTP_PORT_MAX = 65535


@dataclass(frozen=True)
class SmtpRuntime:
    host: str
    port: int
    user: str
    password: str
    from_address: str
    start_tls: bool

    @property
    def use_tls(self) -> bool:
        """Implicit TLS (SMTPS), typical for port 465."""
        return self.port == 465

    @property
    def effective_start_tls(self) -> bool:
        return bool(self.start_tls) and not self.use_tls


def _smtp_public_dict(row: AppSettings) -> dict:
    return {
        "configured": bool(row.smtp_host and row.smtp_host.strip()),
        "host": row.smtp_host or "",
        "port": row.smtp_port,
        "user": row.smtp_user or "",
        "password_set": bool(row.smtp_password_encrypted),
        "from_address": row.smtp_from or "",
        "start_tls": bool(row.smtp_start_tls),
    }


async def _ensure_settings_row(db: AsyncSession) -> AppSettings:
    await get_app_settings(db)
    row = await db.get(AppSettings, _APP_SETTINGS_ID)
    assert row is not None
    return row


async def get_smtp_settings(db: AsyncSession) -> dict:
    row = await _ensure_settings_row(db)
    return _smtp_public_dict(row)


async def get_smtp_runtime(db: AsyncSession) -> SmtpRuntime | None:
    row = await _ensure_settings_row(db)
    host = (row.smtp_host or "").strip()
    if not host:
        return None
    password = ""
    if row.smtp_password_encrypted:
        password = decrypt_key(row.smtp_password_encrypted) or ""
    return SmtpRuntime(
        host=host,
        port=int(row.smtp_port),
        user=(row.smtp_user or "").strip(),
        password=password,
        from_address=(row.smtp_from or "").strip() or "noreply@agentfloor.local",
        start_tls=bool(row.smtp_start_tls),
    )


async def update_smtp_settings(
    db: AsyncSession,
    *,
    host: str,
    port: int,
    user: str,
    from_address: str,
    start_tls: bool,
    password: str | None = None,
    clear_password: bool = False,
) -> dict:
    host_clean = (host or "").strip()
    user_clean = (user or "").strip()
    from_clean = (from_address or "").strip()
    port_int = int(port)
    if port_int < _SMTP_PORT_MIN or port_int > _SMTP_PORT_MAX:
        raise SettingsDataError(f"smtp_port must be between {_SMTP_PORT_MIN} and {_SMTP_PORT_MAX}")
    if host_clean and not from_clean:
        raise SettingsDataError("smtp_from is required when smtp_host is set")

    row = await _ensure_settings_row(db)
    row.smtp_host = host_clean
    row.smtp_port = port_int
    row.smtp_user = user_clean
    row.smtp_from = from_clean or "noreply@agentfloor.local"
    row.smtp_start_tls = bool(start_tls)

    if clear_password:
        row.smtp_password_encrypted = None
    elif password is not None and password != "":
        row.smtp_password_encrypted = encrypt_key(password)

    await db.commit()
    await db.refresh(row)
    return _smtp_public_dict(row)
