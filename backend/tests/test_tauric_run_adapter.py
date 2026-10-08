"""Unit tests for the TauricResearch ↔ AgentFloor run adapter."""

import pytest

from app.models.run import RunVerdict
from app.services.tauric_run_adapter import (
    alias_agent_node,
    build_ta_config,
    extract_decision_text,
    extract_risk_assessment,
    map_provider,
    map_rating_to_verdict,
    output_language_for,
    parse_prices_from_state,
    state_to_raw_report,
)

pytestmark = [pytest.mark.unit]


@pytest.mark.parametrize(
    ("rating", "expected"),
    [
        ("Buy", RunVerdict.buy),
        ("buy", RunVerdict.buy),
        ("Overweight", RunVerdict.buy),
        ("Sell", RunVerdict.sell),
        ("Underweight", RunVerdict.sell),
        ("Hold", RunVerdict.hold),
        ("REVIEW", RunVerdict.hold),
        ("", RunVerdict.hold),
        (None, RunVerdict.hold),
    ],
)
def test_map_rating_to_verdict(rating, expected):
    assert map_rating_to_verdict(rating) == expected


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        ("openai", "openai"),
        ("google", "google"),
        ("groq", "groq"),
        ("ollama", "ollama"),
        ("vllm", "openai_compatible"),
        ("litellm", "openai_compatible"),
        ("anthropic", "anthropic"),
    ],
)
def test_map_provider(provider, expected):
    assert map_provider(provider) == expected


def test_map_provider_ionos_matches_installed_tradingagents():
    from tradingagents.llm_clients.openai_client import is_openai_compatible

    expected = "ionos" if is_openai_compatible("ionos") else "openai_compatible"
    assert map_provider("ionos") == expected


def test_build_ta_config_ionos_uses_openai_compatible_when_needed():
    from tradingagents.llm_clients.openai_client import is_openai_compatible

    from app.services.tauric_run_adapter import IONOS_OPENAI_BASE_URL, resolve_provider_runtime

    runtime = resolve_provider_runtime("ionos", "key")
    cfg = build_ta_config(
        provider="ionos",
        model="openai/gpt-oss-120b",
        depth="quick",
        response_language="en-US",
        backend_url=runtime.backend_url,
        ta_provider=runtime.ta_provider,
    )
    if is_openai_compatible("ionos"):
        assert cfg["llm_provider"] == "ionos"
        assert cfg.get("backend_url") in (None, cfg.get("backend_url"))
    else:
        assert cfg["llm_provider"] == "openai_compatible"
        assert cfg["backend_url"] == IONOS_OPENAI_BASE_URL
    assert cfg["deep_think_llm"] == "openai/gpt-oss-120b"
    assert cfg["quick_think_llm"] == "openai/gpt-oss-120b"


@pytest.mark.parametrize(
    ("tag", "expected"),
    [
        ("en-US", "English"),
        ("de-DE", "German"),
        ("zh-CN", "Simplified Chinese"),
        (None, "English"),
    ],
)
def test_output_language_for(tag, expected):
    assert output_language_for(tag) == expected


def test_parse_prices_from_state():
    state = {
        "trader_investment_plan": (
            "**Action**: Buy\n\n"
            "**Entry Price**: 189.5\n\n"
            "**Stop Loss**: 172.0\n\n"
            "**Position Sizing**: 5%\n"
        ),
        "final_trade_decision": (
            "**Rating**: Buy\n\n"
            "**Price Target**: 210.0\n"
        ),
    }
    entry, stop, target = parse_prices_from_state(state)
    assert entry == "189.5"
    assert stop == "172"
    assert target == "210"


def test_parse_prices_skips_not_provided():
    state = {
        "trader_investment_plan": "**Entry Price**: not provided\n**Stop Loss**: n/a\n",
        "final_trade_decision": "**Price Target**: not provided\n",
    }
    entry, stop, target = parse_prices_from_state(state)
    assert entry is None
    assert stop is None
    assert target is None


def test_parse_prices_european_and_german_prose():
    """MU-style: DE decimal comma on structured lines + Zielkurs only in prose."""
    state = {
        "trader_investment_plan": (
            "**Entry Price**: 1088,00 $\n"
            "**Stop Loss**: 1050,00 $\n"
        ),
        "final_trade_decision": (
            "Der Zielkurs von 1150,00 $ erscheint realistisch.\n"
            "**Price Target**: not provided\n"
        ),
    }
    entry, stop, target = parse_prices_from_state(state)
    assert entry == "1088"
    assert stop == "1050"
    assert target == "1150"


def test_parse_prices_german_structured_labels():
    state = {
        "trader_investment_plan": (
            "**Einstiegskurs**: 1.088,50 $\n"
            "**Stopp-Verlust**: 1.050,00 $\n"
        ),
        "final_trade_decision": "**Kursziel**: 1.150,25 $\n",
    }
    entry, stop, target = parse_prices_from_state(state)
    assert entry == "1088.5"
    assert stop == "1050"
    assert target == "1150.25"


def test_normalize_price_locales():
    from app.services.tauric_run_adapter import _normalize_price

    assert _normalize_price("1,088.00") == "1088"
    assert _normalize_price("$210.50") == "210.5"
    assert _normalize_price("nicht angegeben") is None
    assert _normalize_price("n/a") is None


def test_extract_decision_text_prefers_final():
    state = {
        "final_trade_decision": "PM decision markdown",
        "trader_investment_plan": "trader plan",
    }
    assert extract_decision_text(state) == "PM decision markdown"


def test_extract_risk_assessment_uses_final_or_histories():
    assert "Rating" in extract_risk_assessment({
        "final_trade_decision": "**Rating**: Hold",
    })
    text = extract_risk_assessment({
        "final_trade_decision": "",
        "risk_debate_state": {
            "aggressive_history": "go big",
            "conservative_history": "go small",
        },
    })
    assert "go big" in text and "go small" in text


def test_state_to_raw_report_is_json_safe():
    raw = state_to_raw_report({
        "market_report": "ok",
        "messages": [object()],
    })
    assert raw["market_report"] == "ok"
    assert "messages" in raw


def test_alias_agent_node():
    assert alias_agent_node("Sentiment Analyst") == "social_analyst"
    assert alias_agent_node("Portfolio Manager") == "risk_judge"
    assert alias_agent_node("Market Analyst") == "market_analyst"


def test_build_ta_config_sets_provider_and_depth():
    cfg = build_ta_config(
        provider="google",
        model="gemini-2.5-flash",
        depth="deep",
        response_language="de-DE",
        data_dir="/tmp/ta-test",
    )
    assert cfg["llm_provider"] == "google"
    assert cfg["deep_think_llm"] == "gemini-2.5-flash"
    assert cfg["quick_think_llm"] == "gemini-2.5-flash"
    assert cfg["max_debate_rounds"] == 3
    assert cfg["output_language"] == "German"
    assert cfg["results_dir"] == "/tmp/ta-test/logs"
    assert cfg["memory_log_path"] == "/tmp/ta-test/memory/trading_memory.md"
