import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.base import Base


class NewsProviderConfig(Base):
    __tablename__ = "news_provider_configs"
    __table_args__ = (UniqueConstraint("provider_id", name="uq_news_provider_configs_provider_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # builtin | rest | rss
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    article_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="20")
    endpoint_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    api_key_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auth_header_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
