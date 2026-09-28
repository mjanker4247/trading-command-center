from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_module
from app.routers.portfolio import DiscoverRequest, discover_stocks
from app.utils.response_language import DEFAULT_RESPONSE_LANGUAGE

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


async def test_discover_checks_portfolio_owner_before_cache_or_provider_lookup(monkeypatch):
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    old_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{DEFAULT_RESPONSE_LANGUAGE}"
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_module._discover_cache[old_cache_key] = (
        [{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "cached"}],
        9_999_999_999,
    )

    get_key = AsyncMock(return_value="sk-test")
    monkeypatch.setattr(
        "app.services.portfolio_insight_runner._get_api_key",
        get_key,
    )
    monkeypatch.setattr(
        portfolio_module,
        "_get_latest_snapshot",
        AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
    )

    with pytest.raises(HTTPException) as exc:
        await discover_stocks(
            portfolio_id,
            DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
            db=object(),
            user=user,
        )

    assert exc.value.status_code == 404
    get_key.assert_not_called()
