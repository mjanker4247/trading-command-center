import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import app.routers.portfolio as portfolio_module
import app.services.portfolio_insight_runner as insight_runner

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


def _discover_body() -> portfolio_module.DiscoverRequest:
    return portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")


async def test_discover_checks_portfolio_access_before_cache_hit(monkeypatch):
    portfolio_id = uuid.uuid4()
    user_id = uuid.uuid4()
    db = object()

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_module._discover_cache[
        f"{portfolio_id}:openai:gpt-4o-mini:en-US"
    ] = ([{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "cached"}], time.time() + 60)

    access_check = AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found"))
    monkeypatch.setattr(portfolio_module, "_get_latest_snapshot", access_check)
    monkeypatch.setattr(insight_runner, "_get_api_key", AsyncMock(return_value="sk-test"))

    with pytest.raises(HTTPException) as exc:
        await portfolio_module.discover_stocks(
            portfolio_id,
            _discover_body(),
            db=db,
            user=SimpleNamespace(id=user_id),
        )

    assert exc.value.status_code == 404
    access_check.assert_awaited_once_with(portfolio_id, user_id, db)


async def test_discover_clears_in_flight_after_pre_llm_failure(monkeypatch):
    class HoldingsResult:
        def scalars(self):
            return self

        def all(self):
            return []

    portfolio_id = uuid.uuid4()
    user_id = uuid.uuid4()
    cache_key = f"{user_id}:{portfolio_id}:openai:gpt-4o-mini:en-US"
    db = SimpleNamespace(execute=AsyncMock(return_value=HoldingsResult()))

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    monkeypatch.setattr(
        portfolio_module,
        "_get_latest_snapshot",
        AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4())),
    )
    monkeypatch.setattr(
        portfolio_module,
        "get_sector_gaps",
        AsyncMock(side_effect=RuntimeError("sector fetch failed")),
    )
    monkeypatch.setattr(insight_runner, "_get_api_key", AsyncMock(return_value="sk-test"))

    with pytest.raises(RuntimeError, match="sector fetch failed"):
        await portfolio_module.discover_stocks(
            portfolio_id,
            _discover_body(),
            db=db,
            user=SimpleNamespace(id=user_id),
        )

    assert cache_key not in portfolio_module._discover_in_flight
