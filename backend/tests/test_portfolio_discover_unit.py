import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_module
import app.services.portfolio_insight_runner as insight_runner


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_authorizes_before_cache_and_provider_key(monkeypatch):
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_id = uuid.uuid4()
    user = SimpleNamespace(id=uuid.uuid4())
    body = portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")

    old_shared_cache_key = f"{portfolio_id}:openai:gpt-4o-mini:{body.response_language}"
    portfolio_module._discover_cache[old_shared_cache_key] = (
        [{"ticker": "LEAK", "tag": "Trending", "sector": "", "reason": "cached"}],
        time.time() + portfolio_module._DISCOVER_TTL,
    )
    get_key = AsyncMock(return_value="sk-test")
    monkeypatch.setattr(insight_runner, "_get_api_key", get_key)
    monkeypatch.setattr(
        portfolio_module,
        "_get_latest_snapshot",
        AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
    )

    with pytest.raises(HTTPException) as exc:
        await portfolio_module.discover_stocks(portfolio_id, body, db=object(), user=user)

    assert exc.value.status_code == 404
    assert get_key.await_count == 0


class _EmptyHoldingsResult:
    def scalars(self):
        return self

    def all(self):
        return []


class _FakeDb:
    async def execute(self, *_args, **_kwargs):
        return _EmptyHoldingsResult()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_cleans_in_flight_after_pre_llm_failure(monkeypatch):
    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()
    portfolio_id = uuid.uuid4()
    user = SimpleNamespace(id=uuid.uuid4())
    body = portfolio_module.DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini")

    monkeypatch.setattr(
        portfolio_module,
        "_get_latest_snapshot",
        AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4())),
    )
    monkeypatch.setattr(insight_runner, "_get_api_key", AsyncMock(return_value="sk-test"))
    monkeypatch.setattr(
        portfolio_module,
        "get_sector_gaps",
        AsyncMock(side_effect=RuntimeError("sector fetch failed")),
    )

    with pytest.raises(RuntimeError):
        await portfolio_module.discover_stocks(portfolio_id, body, db=_FakeDb(), user=user)

    assert not portfolio_module._discover_in_flight
