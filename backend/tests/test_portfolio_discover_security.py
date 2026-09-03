import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_module


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_authorizes_before_cached_return():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    body = portfolio_module.DiscoverRequest(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
    )
    cached = [{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "private"}]
    portfolio_module._discover_cache[
        f"{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    ] = (cached, time.time() + 60)
    portfolio_module._discover_cache[
        f"{user.id}:{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    ] = (cached, time.time() + 60)

    latest_snapshot = AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found"))
    with (
        patch.object(portfolio_module, "_get_latest_snapshot", new=latest_snapshot),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_module.discover_stocks(portfolio_id, body, object(), user)

    assert exc.value.status_code == 404
    latest_snapshot.assert_awaited_once()


class _HoldingsResult:
    def scalars(self):
        return self

    def all(self):
        return [SimpleNamespace(ticker="AAPL")]


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _HoldingsResult()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_clears_in_flight_when_candidate_pipeline_fails():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    body = portfolio_module.DiscoverRequest(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
    )

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
        patch.object(portfolio_module, "get_sector_gaps", new=AsyncMock(side_effect=RuntimeError("boom"))),
    ):
        with pytest.raises(RuntimeError):
            await portfolio_module.discover_stocks(portfolio_id, body, _FakeDb(), user)

    assert portfolio_module._discover_in_flight == set()
