"""Unit tests for trading_agent_runner / provider runtime wiring."""

import pytest

from app.services.tauric_run_adapter import (
    IONOS_OPENAI_BASE_URL,
    resolve_provider_runtime,
)

pytestmark = [pytest.mark.unit]


def test_resolve_provider_runtime_native_cloud_keys():
    assert resolve_provider_runtime("openai", "sk-test").env_patch == {
        "OPENAI_API_KEY": "sk-test",
    }
    assert resolve_provider_runtime("groq", "gsk-test").env_patch == {
        "GROQ_API_KEY": "gsk-test",
    }
    assert resolve_provider_runtime("google", "g-test").env_patch == {
        "GOOGLE_API_KEY": "g-test",
    }
    assert resolve_provider_runtime("anthropic", "a-test").env_patch == {
        "ANTHROPIC_API_KEY": "a-test",
    }


def test_resolve_provider_runtime_ionos_via_openai_compatible():
    """Vendored upstream has no native ionos — map to openai_compatible + IONOS URL."""
    from tradingagents.llm_clients.openai_client import is_openai_compatible

    runtime = resolve_provider_runtime("ionos", "ionos-test-key")
    if is_openai_compatible("ionos"):
        assert runtime.ta_provider == "ionos"
        assert runtime.env_patch == {"IONOS_API_KEY": "ionos-test-key"}
        assert runtime.backend_url is None
    else:
        assert runtime.ta_provider == "openai_compatible"
        assert runtime.backend_url == IONOS_OPENAI_BASE_URL
        assert runtime.env_patch == {"OPENAI_COMPATIBLE_API_KEY": "ionos-test-key"}


def test_resolve_provider_runtime_ollama_and_openai_compatible_local():
    ollama = resolve_provider_runtime("ollama", "http://localhost:11434/")
    assert ollama.ta_provider == "ollama"
    assert ollama.env_patch == {"OLLAMA_BASE_URL": "http://localhost:11434"}
    assert ollama.backend_url is None

    vllm = resolve_provider_runtime("vllm", "http://localhost:8080")
    assert vllm.ta_provider == "openai_compatible"
    assert vllm.backend_url == "http://localhost:8080/v1"
    assert vllm.env_patch == {"OPENAI_COMPATIBLE_API_KEY": "vllm"}

    litellm = resolve_provider_runtime("litellm", "http://localhost:4000")
    assert litellm.ta_provider == "openai_compatible"
    assert litellm.backend_url == "http://localhost:4000/v1"
    assert litellm.env_patch == {"OPENAI_COMPATIBLE_API_KEY": "litellm"}


def test_tradingagents_graph_accepts_ionos_runtime_wiring(monkeypatch):
    """Regression: IONOS runs must not raise Unsupported LLM provider at construct."""
    import os

    from tradingagents.graph.trading_graph import TradingAgentsGraph

    from app.services.tauric_run_adapter import build_ta_config, resolve_provider_runtime

    runtime = resolve_provider_runtime("ionos", "ionos-test-key")
    cfg = build_ta_config(
        provider="ionos",
        model="openai/gpt-oss-120b",
        depth="quick",
        response_language="en-US",
        backend_url=runtime.backend_url,
        ta_provider=runtime.ta_provider,
    )
    for key, value in runtime.env_patch.items():
        monkeypatch.setenv(key, value)

    # Construct only — do not call propagate (would hit the network).
    graph = TradingAgentsGraph(
        selected_analysts=["market"],
        config=cfg,
        callbacks=[],
    )
    assert graph is not None
    assert os.environ.get("OPENAI_COMPATIBLE_API_KEY") == "ionos-test-key" or os.environ.get(
        "IONOS_API_KEY"
    ) == "ionos-test-key"


def test_resolve_provider_runtime_empty_without_key():
    runtime = resolve_provider_runtime("openai", None)
    assert runtime.env_patch == {}
    assert resolve_provider_runtime("openai", "").env_patch == {}
