from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.base import Base


class LlmProviderCatalog(Base):
    """Persisted cloud LLM model catalog (full list + optional visible subset)."""

    __tablename__ = "llm_provider_catalogs"

    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    catalog_models: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    # null = show entire catalog in pickers; non-null = curated subset
    visible_models: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    refreshed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
