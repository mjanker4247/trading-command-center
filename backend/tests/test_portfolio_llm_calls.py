import pytest

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
