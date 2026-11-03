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

    from app.services.tauric_run_adapter import (
        build_ta_config,
        resolve_provider_runtime,
    )

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


@pytest.mark.asyncio
async def test_data_vendor_env_patch_maps_stored_keys(monkeypatch):
    from app.services import trading_agent_runner as runner

    async def fake_keys(providers: list[str]) -> dict[str, str]:
        assert set(providers) >= {"fred", "alpha_vantage", "typesafe", "sec_edgar"}
        return {
            "fred": "fred-secret",
            "alpha_vantage": "av-secret",
            "sec_edgar": "AgentFloor Dev contact@example.com",
        }

    monkeypatch.setattr(runner, "_get_stored_keys", fake_keys)
    patch = await runner._data_vendor_env_patch()
    assert patch == {
        "FRED_API_KEY": "fred-secret",
        "ALPHA_VANTAGE_API_KEY": "av-secret",
        "SEC_EDGAR_USER_AGENT": "AgentFloor Dev contact@example.com",
    }


def test_data_provider_env_catalog_matches_tradingagents():
    from app.utils.data_providers import DATA_PROVIDER_ENV

    assert DATA_PROVIDER_ENV["fred"] == "FRED_API_KEY"
    assert DATA_PROVIDER_ENV["alpha_vantage"] == "ALPHA_VANTAGE_API_KEY"
    assert DATA_PROVIDER_ENV["typesafe"] == "TYPESAFE_API_KEY"
    assert DATA_PROVIDER_ENV["sec_edgar"] == "SEC_EDGAR_USER_AGENT"


@pytest.mark.asyncio
async def test_process_env_patch_serializes_runs_without_env_patch(monkeypatch):
    import asyncio
    import os

    from app.services.trading_agent_runner import _run_with_process_env

    key = "AGENTFLOOR_TEST_RUN_SECRET"
    monkeypatch.delenv(key, raising=False)
    first_entered = asyncio.Event()
    release_first = asyncio.Event()
    second_entered = asyncio.Event()

    async def first_run():
        assert os.environ[key] == "secret-a"
        first_entered.set()
        await release_first.wait()
        assert os.environ[key] == "secret-a"
        return "first"

    async def second_run_without_patch():
        second_entered.set()
        assert os.environ.get(key) is None
        return "second"

    first_task = asyncio.create_task(_run_with_process_env({key: "secret-a"}, first_run))
    await first_entered.wait()

    second_task = asyncio.create_task(_run_with_process_env({}, second_run_without_patch))
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(second_entered.wait(), timeout=0.05)

    release_first.set()
    assert await first_task == "first"
    assert await second_task == "second"
    assert os.environ.get(key) is None


@pytest.mark.asyncio
async def test_process_env_patch_snapshots_previous_values_after_lock(monkeypatch):
    import asyncio
    import os

    from app.services.trading_agent_runner import _run_with_process_env

    key = "AGENTFLOOR_TEST_RUN_SECRET"
    monkeypatch.setenv(key, "base")
    first_entered = asyncio.Event()
    release_first = asyncio.Event()

    async def first_run():
        assert os.environ[key] == "secret-a"
        first_entered.set()
        await release_first.wait()
        return "first"

    async def second_run():
        assert os.environ[key] == "secret-b"
        return "second"

    first_task = asyncio.create_task(_run_with_process_env({key: "secret-a"}, first_run))
    await first_entered.wait()
    second_task = asyncio.create_task(_run_with_process_env({key: "secret-b"}, second_run))

    release_first.set()
    assert await first_task == "first"
    assert await second_task == "second"
    assert os.environ[key] == "base"
