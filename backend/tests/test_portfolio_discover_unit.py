from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import app.routers.portfolio as portfolio


pytestmark = [pytest.mark.unit]


@pytest.fixture(autouse=True)
def _clear_discover_state():
    portfolio._discover_cache.clear()
    portfolio._discover_in_flight.clear()
    yield
    portfolio._discover_cache.clear()
    portfolio._discover_in_flight.clear()


def _discover_body() -> portfolio.DiscoverRequest:
    return portfolio.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")


@pytest.mark.asyncio
async def test_discover_authorizes_before_cache_and_provider_lookup(monkeypatch):
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    body = _discover_body()
    cached = [{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "private"}]
    old_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    user_cache_key = f"{user.id}:{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    portfolio._discover_cache[old_cache_key] = (cached, 9999999999.0)
    portfolio._discover_cache[user_cache_key] = (cached, 9999999999.0)
    get_api_key = AsyncMock(return_value="sk-test")

    async def deny_access(*_args, **_kwargs):
        raise HTTPException(status_code=404, detail="Portfolio not found")

    monkeypatch.setattr(portfolio, "_get_latest_snapshot", deny_access)
    monkeypatch.setattr("app.services.portfolio_insight_runner._get_api_key", get_api_key)

    with pytest.raises(HTTPException) as exc:
        await portfolio.discover_stocks(portfolio_id, body=body, db=object(), user=user)

    assert exc.value.status_code == 404
    get_api_key.assert_not_awaited()


@pytest.mark.asyncio
async def test_discover_in_flight_marker_clears_after_pipeline_error(monkeypatch):
    portfolio_id = uuid4()
    snapshot_id = uuid4()
    user = SimpleNamespace(id=uuid4())

    class FakeScalars:
        def all(self):
            return [SimpleNamespace(ticker="AAPL")]

    class FakeResult:
        def scalars(self):
            return FakeScalars()

    class FakeDb:
        async def execute(self, *_args, **_kwargs):
            return FakeResult()

    async def latest_snapshot(*_args, **_kwargs):
        return SimpleNamespace(id=snapshot_id)

    async def fail_sector_pipeline(*_args, **_kwargs):
        raise RuntimeError("sector pipeline failed")

    monkeypatch.setattr(portfolio, "_get_latest_snapshot", latest_snapshot)
    monkeypatch.setattr(portfolio, "get_sector_gaps", fail_sector_pipeline)
    monkeypatch.setattr("app.services.portfolio_insight_runner._get_api_key", AsyncMock(return_value="sk-test"))

    with pytest.raises(RuntimeError, match="sector pipeline failed"):
        await portfolio.discover_stocks(
            portfolio_id,
            body=_discover_body(),
            db=FakeDb(),
            user=user,
        )

    assert portfolio._discover_in_flight == set()


@pytest.mark.asyncio
async def test_discover_force_refresh_respects_in_flight_marker(monkeypatch):
    portfolio_id = uuid4()
    user = SimpleNamespace(id=uuid4())
    body = portfolio.DiscoverRequest(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        force_refresh=True,
    )
    cache_key = f"{user.id}:{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    portfolio._discover_in_flight.add(cache_key)

    async def latest_snapshot(*_args, **_kwargs):
        return SimpleNamespace(id=uuid4())

    class FakeScalars:
        def all(self):
            return [SimpleNamespace(ticker="AAPL")]

    class FakeResult:
        def scalars(self):
            return FakeScalars()

    class FakeDb:
        async def execute(self, *_args, **_kwargs):
            return FakeResult()

    monkeypatch.setattr(portfolio, "_get_latest_snapshot", latest_snapshot)
    monkeypatch.setattr("app.services.portfolio_insight_runner._get_api_key", AsyncMock(return_value="sk-test"))

    with pytest.raises(HTTPException) as exc:
        await portfolio.discover_stocks(portfolio_id, body=body, db=FakeDb(), user=user)

    assert exc.value.status_code == 409
