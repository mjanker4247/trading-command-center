from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from app.schemas.news import StandardizedArticle


class BaseNewsProvider(ABC):
    provider_id: str
    display_name: str
    is_enabled: bool
    priority: int = 100
    article_limit: int = 20

    @abstractmethod
    async def fetch_news(
        self,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        limit: int,
    ) -> list[StandardizedArticle]:
        raise NotImplementedError

    @abstractmethod
    async def validate_credentials(self) -> tuple[bool, str]:
        raise NotImplementedError
