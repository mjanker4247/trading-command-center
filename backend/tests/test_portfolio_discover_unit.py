import time
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_module
from app.utils.response_language import DEFAULT_RESPONSE_LANGUAGE


pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


class _EmptyHoldingResult:
    def scalars(self):
        return self

    def all(self):
        return []


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _EmptyHoldingResult()


async def test_discover_authorizes_before_returning_cached_result():
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    cached_recommendations = [{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "cached"}]
    old_shared_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{DEFAULT_RESPONSE_LANGUAGE}"

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_module._discover_cache[old_shared_cache_key] = (cached_recommendations, time.time() + 60)

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
        ) as latest_snapshot,
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_module.discover_stocks(
                portfolio_id,
                portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                _FakeDb(),
                user,
            )

    assert exc.value.status_code == 404
    latest_snapshot.assert_awaited_once()


async def test_discover_clears_in_flight_marker_after_pre_llm_failure():
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    cache_key = f"{user.id}:{portfolio_id}:openai:gpt-4o-mini:{DEFAULT_RESPONSE_LANGUAGE}"

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
        patch.object(portfolio_module, "get_sector_gaps", new=AsyncMock(return_value=[])),
        patch.object(portfolio_module, "get_finnhub_key", new=AsyncMock(return_value=None)),
        patch("app.routers.market._get_trending_tickers", new=AsyncMock(side_effect=RuntimeError("market down"))),
    ):
        with pytest.raises(RuntimeError, match="market down"):
            await portfolio_module.discover_stocks(
                portfolio_id,
                portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                _FakeDb(),
                user,
            )

    assert cache_key not in portfolio_module._discover_in_flight
    assert not portfolio_module._discover_in_flight
