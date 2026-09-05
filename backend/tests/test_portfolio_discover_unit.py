from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch

import app.routers.portfolio as portfolio_module


@pytest.mark.asyncio
@pytest.mark.unit
async def test_discover_authorizes_before_cached_response():
    portfolio_id = uuid4()
    body = portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")
    user = SimpleNamespace(id=uuid4())

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_module._discover_cache[
        f"{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    ] = ([{"ticker": "LEAK"}], 9_999_999_999)

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
        ) as get_latest_snapshot,
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")) as get_api_key,
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_module.discover_stocks(portfolio_id, body, db=object(), user=user)

    assert exc.value.status_code == 404
    get_latest_snapshot.assert_awaited_once()
    get_api_key.assert_not_awaited()


class _FakeScalarResult:
    def scalars(self):
        return self

    def all(self):
        return [SimpleNamespace(ticker="AAPL")]


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _FakeScalarResult()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_discover_cleans_in_flight_marker_after_pre_llm_failure():
    portfolio_id = uuid4()
    body = portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")
    user = SimpleNamespace(id=uuid4())

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    with (
        patch.object(
            portfolio_module,
            "_get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
        patch.object(portfolio_module, "get_sector_gaps", new=AsyncMock(side_effect=RuntimeError("sector boom"))),
    ):
        with pytest.raises(RuntimeError, match="sector boom"):
            await portfolio_module.discover_stocks(portfolio_id, body, db=_FakeDb(), user=user)

    assert portfolio_module._discover_in_flight == set()
