import time
from types import SimpleNamespace
from uuid import UUID
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

import app.routers.portfolio as portfolio_module


@pytest.fixture(autouse=True)
def clear_discover_state():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    yield
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_authorizes_before_returning_cached_result():
    portfolio_id = UUID("11111111-1111-1111-1111-111111111111")
    user = SimpleNamespace(id=UUID("22222222-2222-2222-2222-222222222222"))
    cached = [{"ticker": "SECRET", "tag": "Gap Fill", "sector": "Technology", "reason": "private"}]
    expiry = time.time() + 60
    portfolio_module._discover_cache[f"{portfolio_id}:openai:gpt-4o-mini:en-US"] = (cached, expiry)
    portfolio_module._discover_cache[f"{user.id}:{portfolio_id}:openai:gpt-4o-mini:en-US"] = (cached, expiry)

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await portfolio_module.discover_stocks(
                portfolio_id,
                body=portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                db=SimpleNamespace(),
                user=user,
            )

    assert exc_info.value.status_code == 404


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_clears_in_flight_after_candidate_pipeline_error():
    portfolio_id = UUID("33333333-3333-3333-3333-333333333333")
    user = SimpleNamespace(id=UUID("44444444-4444-4444-4444-444444444444"))
    snapshot = SimpleNamespace(id=UUID("55555555-5555-5555-5555-555555555555"))
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: []),
            )
        )
    )

    with (
        patch.object(portfolio_module, "_get_latest_snapshot", new=AsyncMock(return_value=snapshot)),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
        patch.object(portfolio_module, "get_sector_gaps", new=AsyncMock(side_effect=RuntimeError("sector timeout"))),
    ):
        with pytest.raises(RuntimeError, match="sector timeout"):
            await portfolio_module.discover_stocks(
                portfolio_id,
                body=portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                db=db,
                user=user,
            )

    assert portfolio_module._discover_in_flight == set()
