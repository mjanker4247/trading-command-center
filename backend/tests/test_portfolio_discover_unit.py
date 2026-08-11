from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

import app.routers.portfolio as portfolio_module
from app.routers.portfolio import DiscoverRequest, discover_stocks


class _FakeScalars:
    def all(self):
        return []


class _FakeResult:
    def scalars(self):
        return _FakeScalars()


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _FakeResult()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_authorizes_before_shared_cache_lookup():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_id = uuid4()
    body = DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")
    old_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    portfolio_module._discover_cache[old_cache_key] = ([{"ticker": "LEAK"}], 9999999999.0)

    with (
        patch(
            "app.routers.portfolio._get_latest_snapshot",
            new=AsyncMock(side_effect=HTTPException(status_code=404)),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
    ):
        with pytest.raises(HTTPException) as exc:
            await discover_stocks(
                portfolio_id,
                body,
                _FakeDb(),
                SimpleNamespace(id=uuid4()),
            )

    assert exc.value.status_code == 404


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_cleans_in_flight_after_candidate_pipeline_error():
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    with (
        patch(
            "app.routers.portfolio._get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
        patch("app.routers.portfolio.get_sector_gaps", new=AsyncMock(side_effect=RuntimeError("boom"))),
    ):
        with pytest.raises(RuntimeError):
            await discover_stocks(
                uuid4(),
                DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                _FakeDb(),
                SimpleNamespace(id=uuid4()),
            )

    assert portfolio_module._discover_in_flight == set()
