from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

import app.routers.portfolio as portfolio_module


pytestmark = pytest.mark.unit


class _HoldingResult:
    def scalars(self):
        return self

    def all(self):
        return []


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _HoldingResult()


@pytest.mark.asyncio
async def test_discover_authorizes_before_process_cache_lookup():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    old_global_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{portfolio_module.DEFAULT_RESPONSE_LANGUAGE}"
    portfolio_module._discover_cache[old_global_cache_key] = (
        [{"ticker": "LEAK", "tag": "Gap Fill", "sector": "Technology", "reason": "private context"}],
        9999999999.0,
    )

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")) as get_key,
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_module.discover_stocks(
                portfolio_id,
                portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                _FakeDb(),
                user,
            )

    assert exc.value.status_code == 404
    get_key.assert_not_awaited()


@pytest.mark.asyncio
async def test_discover_clears_in_flight_after_candidate_pipeline_error():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    snapshot = SimpleNamespace(id=uuid4())

    try:
        with (
            patch.object(portfolio_module, "_get_latest_snapshot", new=AsyncMock(return_value=snapshot)),
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch.object(
                portfolio_module,
                "get_sector_gaps",
                new=AsyncMock(side_effect=RuntimeError("sector boom")),
            ),
        ):
            with pytest.raises(RuntimeError, match="sector boom"):
                await portfolio_module.discover_stocks(
                    portfolio_id,
                    portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                    _FakeDb(),
                    user,
                )

        assert not any(str(portfolio_id) in key for key in portfolio_module._discover_in_flight)
    finally:
        portfolio_module._discover_in_flight.clear()
