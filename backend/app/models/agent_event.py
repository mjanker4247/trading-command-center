import uuid, enum
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.base import Base

class EventType(str, enum.Enum):
    started = "started"
    token = "token"
    completed = "completed"
    error = "error"

class AgentEvent(Base):
    __tablename__ = "agent_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"), index=True)
    agent_name: Mapped[str] = mapped_column(String)
    event_type: Mapped[EventType] = mapped_column(SAEnum(EventType))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    sequence: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
