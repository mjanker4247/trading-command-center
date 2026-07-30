from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_JWT = "dev-secret-change-in-production"
_INSECURE_ENC = "0" * 64


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://agentfloor:agentfloor@localhost:5432/agentfloor"
    jwt_secret: str = _INSECURE_JWT
    encryption_key: str = _INSECURE_ENC
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@agentfloor.local"
    frontend_url: str = "http://localhost:3000"
    run_timeout_seconds: int = 3600
    trim_gain_threshold_pct: float = 30.0
    trim_peg_threshold: float = 3.0
    trim_concentration_threshold_pct: float = 15.0
    trim_regime_signal_weak_threshold: float = -0.1
    logo_cache_dir: str = "data/logos"
    # Phase 0/1 hardening: Redis + event bus (default memory keeps unit tests Redis-free)
    redis_url: str = "redis://localhost:6379/0"
    event_bus_backend: Literal["memory", "redis"] = "memory"
    # Phase 2+: job queue backend (memory = in-process asyncio tasks)
    job_backend: Literal["memory", "procrastinate"] = "memory"
    scheduler_enabled: bool = True

    @field_validator("event_bus_backend", "job_backend", mode="before")
    @classmethod
    def normalize_backend_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        if self.jwt_secret == _INSECURE_JWT:
            raise ValueError(
                "JWT_SECRET is set to the insecure default. "
                "Generate a secret with: openssl rand -hex 32"
            )
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters.")
        if self.encryption_key == _INSECURE_ENC:
            raise ValueError(
                "ENCRYPTION_KEY is set to the insecure default. "
                "Generate one with: openssl rand -hex 32"
            )
        try:
            decoded = bytes.fromhex(self.encryption_key)
        except ValueError:
            raise ValueError("ENCRYPTION_KEY must be a valid hex string.")
        if len(decoded) != 32:
            raise ValueError("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).")
        return self


settings = Settings()
