from pydantic import BaseModel, ConfigDict, field_validator
from datetime import date, datetime
from uuid import UUID

from app.utils.response_language import DEFAULT_RESPONSE_LANGUAGE, normalize_response_language


class RunCreateRequest(BaseModel):
    ticker: str
    analysis_date: date
    llm_provider: str
    llm_model: str
    depth: str  # quick|standard|deep
    analysts: list[str] = ["market", "social", "news", "fundamentals"]
    response_language: str = DEFAULT_RESPONSE_LANGUAGE
    label: str | None = None

    @field_validator('depth')
    @classmethod
    def validate_depth(cls, v: str) -> str:
        if v not in ('quick', 'standard', 'deep'):
            raise ValueError("depth must be one of: quick, standard, deep")
        return v

    @field_validator('response_language')
    @classmethod
    def validate_response_language(cls, v: str | None) -> str:
        return normalize_response_language(v)


class RunResponse(BaseModel):
    id: UUID
    ticker: str
    analysis_date: date
    llm_provider: str
    llm_model: str
    depth: str
    analysts: list[str]
    response_language: str
    label: str | None
    notes: str | None = None
    status: str
    verdict: str | None
    archived: bool
    created_by: UUID
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    suggested_entry: str | None = None
    suggested_stop: str | None = None
    suggested_target: str | None = None

    model_config = ConfigDict(from_attributes=True)
