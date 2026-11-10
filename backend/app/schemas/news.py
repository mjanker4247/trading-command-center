from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StandardizedArticle(BaseModel):
    title: str
    content: str = ""
    source: str = ""
    url: str = ""
    published_at: datetime | None = None
    ticker: str | None = None
    provider_id: str
    image: str | None = None
    sentiment_hint: str | None = None


class NewsProviderConfigOut(BaseModel):
    id: UUID
    provider_id: str
    display_name: str
    kind: Literal["builtin", "rest", "rss"]
    is_enabled: bool
    priority: int
    article_limit: int
    endpoint_url: str | None = None
    api_key_provider: str | None = None
    auth_header_name: str | None = None
    masked_api_key: str | None = None
    has_api_key: bool = False
    ui_visible: bool = True
    extra: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class NewsProviderUpdateItem(BaseModel):
    provider_id: str
    is_enabled: bool | None = None
    priority: int | None = None
    article_limit: int | None = Field(default=None, ge=1, le=100)


class NewsProviderBulkUpdateRequest(BaseModel):
    providers: list[NewsProviderUpdateItem]


class NewsProviderTestRequest(BaseModel):
    provider_id: str


class NewsProviderTestResponse(BaseModel):
    ok: bool
    message: str


class CustomNewsProviderRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=128)
    kind: Literal["rest", "rss"]
    endpoint_url: str = Field(min_length=1, max_length=1024)
    auth_token: str | None = None
    auth_header_name: str | None = Field(default="Authorization", max_length=64)
    article_limit: int = Field(default=20, ge=1, le=100)
    priority: int = Field(default=100, ge=0, le=1000)
    is_enabled: bool = True
    # REST: dotted path to list, e.g. "articles" or "" for root array
    items_path: str | None = None
