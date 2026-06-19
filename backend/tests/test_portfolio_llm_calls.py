import time
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import pytest

import app.routers.portfolio as portfolio_module
from app.routers.portfolio import DiscoverRequest, discover_stocks
from app.services.portfolio_insight_runner import _call_llm, _call_llm_chat


class _FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": "ok"}}]}


class _FakeAsyncClient:
    def __init__(self, *, timeout, captured):
        self.captured = captured
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json, headers):
        self.captured.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_vllm_single_turn_call_does_not_forward_api_key(monkeypatch):
    captured = []

    def _client_factory(*, timeout):
        return _FakeAsyncClient(timeout=timeout, captured=captured)

    monkeypatch.setattr("app.services.portfolio_insight_runner.httpx.AsyncClient", _client_factory)

    result = await _call_llm("vllm", "test-model", "sk-openai-secret", "hello")

    assert result == "ok"
    assert captured
    assert "Authorization" not in captured[0]["headers"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_vllm_chat_call_does_not_forward_api_key(monkeypatch):
    captured = []

    def _client_factory(*, timeout):
        return _FakeAsyncClient(timeout=timeout, captured=captured)

    monkeypatch.setattr("app.services.portfolio_insight_runner.httpx.AsyncClient", _client_factory)

    result = await _call_llm_chat(
        "vllm",
        "test-model",
        "sk-openai-secret",
        "system",
        [{"role": "user", "content": "hello"}],
    )

    assert result == "ok"
    assert captured
    assert "Authorization" not in captured[0]["headers"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_does_not_return_cache_before_portfolio_access_check():
    portfolio_id = uuid4()
    cache_key = f"{portfolio_id}:openai:gpt-4o-mini"
    portfolio_module._discover_cache[cache_key] = (
        [{"ticker": "LEAK", "tag": "Cached", "sector": "", "reason": "cached"}],
        time.time() + 1800,
    )
    portfolio_module._discover_in_flight.clear()

    try:
        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch.object(
                portfolio_module,
                "_get_latest_snapshot",
                new=AsyncMock(side_effect=HTTPException(status_code=404, detail="Portfolio not found")),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await discover_stocks(
                    portfolio_id,
                    DiscoverRequest(llm_provider="openai", llm_model="gpt-4o-mini"),
                    db=SimpleNamespace(),
                    user=SimpleNamespace(id=uuid4()),
                )

        assert exc_info.value.status_code == 404
    finally:
        portfolio_module._discover_cache.clear()
        portfolio_module._discover_in_flight.clear()
