import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openfigi_api_key: str | None = None
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Corporate proxy support
    http_proxy: str | None = None      # e.g. http://user:pass@proxy.company:8080
    https_proxy: str | None = None     # e.g. http://user:pass@proxy.company:8080
    no_proxy: str | None = None        # e.g. localhost,127.0.0.1,.company.internal

    # Optional custom corporate CA bundle
    ca_bundle_path: str | None = None  # e.g. /etc/ssl/certs/corp-ca.pem

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Apply proxy settings to process environment so libraries (requests, yfinance, httpx, etc.)
# automatically honor them without manual wiring everywhere.

def _export_proxy_env() -> None:
    mappings: list[tuple[str, str | None]] = [
        ("HTTP_PROXY", settings.http_proxy),
        ("HTTPS_PROXY", settings.https_proxy),
        ("NO_PROXY", settings.no_proxy),
    ]
    for key, value in mappings:
        if value:
            os.environ[key] = value
            # also set lowercase variants used by some tooling
            os.environ[key.lower()] = value


def _export_ca_env() -> None:
    if settings.ca_bundle_path:
        # requests honors REQUESTS_CA_BUNDLE; OpenSSL honors SSL_CERT_FILE in many cases
        os.environ["REQUESTS_CA_BUNDLE"] = settings.ca_bundle_path
        os.environ.setdefault("SSL_CERT_FILE", settings.ca_bundle_path)


_export_proxy_env()
_export_ca_env()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)