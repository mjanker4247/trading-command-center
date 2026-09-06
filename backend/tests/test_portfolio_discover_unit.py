import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_router


pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeDb:
    async def execute(self, _statement):
        return _FakeScalarResult([SimpleNamespace(ticker="AAPL")])


def _discover_body() -> portfolio_router.DiscoverRequest:
    return portfolio_router.DiscoverRequest(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        response_language="en-US",
    )


def _cache_keys(user_id, portfolio_id):
    config_key = f"{portfolio_id}:openai:gpt-4o-mini:en-US"
    scoped_key = f"{user_id}:{config_key}"
    return config_key, scoped_key


async def test_discover_authorizes_before_returning_cached_result():
    portfolio_router._discover_cache.clear()
    portfolio_router._discover_in_flight.clear()
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4(), preferred_currency="USD")
    cached = [{"ticker": "XYZ", "tag": "Trending", "sector": "", "reason": "cached"}]
    for key in _cache_keys(user.id, portfolio_id):
        portfolio_router._discover_cache[key] = (cached, time.time() + 60)
    get_api_key = AsyncMock(return_value="sk-test")

    with (
        patch.object(
            portfolio_router,
            "_get_latest_snapshot",
            new=AsyncMock(
                side_effect=HTTPException(status_code=404, detail="Portfolio not found")
            ),
        ),
        patch("app.services.portfolio_insight_runner._get_api_key", new=get_api_key),
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_router.discover_stocks(
                portfolio_id, _discover_body(), _FakeDb(), user
            )

    assert exc.value.status_code == 404
    get_api_key.assert_not_awaited()


async def test_discover_clears_in_flight_when_candidate_fetch_fails():
    portfolio_router._discover_cache.clear()
    portfolio_router._discover_in_flight.clear()
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4(), preferred_currency="USD")
    _legacy_key, cache_key = _cache_keys(user.id, portfolio_id)

    with (
        patch.object(
            portfolio_router,
            "_get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch(
            "app.services.portfolio_insight_runner._get_api_key",
            new=AsyncMock(return_value="sk-test"),
        ),
        patch.object(
            portfolio_router,
            "get_sector_gaps",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ),
    ):
        with pytest.raises(RuntimeError, match="boom"):
            await portfolio_router.discover_stocks(
                portfolio_id, _discover_body(), _FakeDb(), user
            )

    assert cache_key not in portfolio_router._discover_in_flight
    assert portfolio_router._discover_in_flight == set()


async def test_discover_reports_contention_for_uncached_in_flight_request():
    portfolio_router._discover_cache.clear()
    portfolio_router._discover_in_flight.clear()
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4(), preferred_currency="USD")
    _legacy_key, cache_key = _cache_keys(user.id, portfolio_id)
    portfolio_router._discover_in_flight.add(cache_key)

    with (
        patch.object(
            portfolio_router,
            "_get_latest_snapshot",
            new=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        ),
        patch(
            "app.services.portfolio_insight_runner._get_api_key",
            new=AsyncMock(return_value="sk-test"),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await portfolio_router.discover_stocks(
                portfolio_id, _discover_body(), _FakeDb(), user
            )

    assert exc.value.status_code == 409
    portfolio_router._discover_in_flight.clear()
