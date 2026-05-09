import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, func, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.base import Base


class InsightStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class InsightTrigger(str, enum.Enum):
    scheduled = "scheduled"
    manual = "manual"


class InsightStance(str, enum.Enum):
    bullish = "bullish"
    bearish = "bearish"
    neutral = "neutral"
    mixed = "mixed"


class PortfolioInsight(Base):
    __tablename__ = "portfolio_insights"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[InsightStatus] = mapped_column(SAEnum(InsightStatus), default=InsightStatus.pending)
    trigger: Mapped[InsightTrigger] = mapped_column(SAEnum(InsightTrigger), default=InsightTrigger.manual)
    llm_provider: Mapped[str] = mapped_column(String)
    llm_model: Mapped[str] = mapped_column(String)

    # Populated after completion
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overall_stance: Mapped[InsightStance | None] = mapped_column(SAEnum(InsightStance), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    risk_alerts: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    sector_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    strengths: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    weaknesses: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    holdings_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    portfolio = relationship("Portfolio", back_populates="insights")
