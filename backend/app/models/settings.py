from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.base import Base


class AppSettings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    observation_covariance: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.1")
    transition_covariance: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.01")
    processing_mode: Mapped[str] = mapped_column(String(16), nullable=False, server_default="causal")
    enable_kalman_filter: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enable_elliott_wave: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enable_markov_regime: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enable_portfolio_optimizer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    smtp_host: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, server_default="25")
    smtp_user: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    smtp_from: Mapped[str] = mapped_column(String(255), nullable=False, server_default="noreply@agentfloor.local")
    smtp_start_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_at = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
