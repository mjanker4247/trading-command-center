import pytest
from app.services.trading_agent_runner import _build_llm


@pytest.mark.asyncio
async def test_build_llm_returns_none_for_cloud_providers():
    assert await _build_llm("openai", "gpt-4o") is None
    assert await _build_llm("anthropic", "claude-3") is None
    assert await _build_llm("google", "gemini-pro") is None


@pytest.mark.asyncio
async def test_build_llm_returns_none_when_ollama_not_configured():
    result = await _build_llm("ollama", "llama3")
    assert result is None


@pytest.mark.asyncio
async def test_build_llm_returns_none_when_vllm_not_configured():
    result = await _build_llm("vllm", "mistral-7b")
    assert result is None
