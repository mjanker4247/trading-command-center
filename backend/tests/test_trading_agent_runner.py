import os
from types import SimpleNamespace

import pytest

from app.services.trading_agent_runner import (
    _extract_trader_decision,
    _normalize_price,
    _parse_verdict,
)
from app.models.run import RunVerdict

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


@pytest.mark.parametrize(
    ("signal", "expected"),
    [
        ("BUY", RunVerdict.buy),
        ("buy", RunVerdict.buy),
        ("SELL", RunVerdict.sell),
        ("sell", RunVerdict.sell),
        ("HOLD", RunVerdict.hold),
        ("", RunVerdict.hold),
    ],
)
async def test_parse_verdict(signal, expected):
    rec = SimpleNamespace(signal=signal)
    assert _parse_verdict(rec) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (150.5, "150.5"),
        ("$142.00", "$142.00"),
        (None, None),
        ("n/a", None),
    ],
)
async def test_normalize_price(value, expected):
    assert _normalize_price(value) == expected


async def test_extract_trader_decision_prefers_recommendation_rationale():
    state = SimpleNamespace(final_trade_decision="legacy text")
    rec = SimpleNamespace(rationale="Structured rationale from Risk Judge.")
    assert _extract_trader_decision(state, rec) == "Structured rationale from Risk Judge."


async def test_extract_trader_decision_falls_back_to_state():
    state = SimpleNamespace(
        final_trade_recommendation=None,
        final_trade_decision="FINAL TRANSACTION PROPOSAL: **BUY**",
    )
    rec = SimpleNamespace(rationale="")
    assert "BUY" in _extract_trader_decision(state, rec)


# ── reasoning_effort guard (Groq / IONOS) ────────────────────────────────────

def _apply_reasoning_via_module(provider: str, effort: str, base_url: str | None) -> dict:
    """Call tradingagents._apply_reasoning with a controlled OPENAI_BASE_URL."""
    from app.services.tradingagents_grounding import apply_reasoning_effort_patch
    apply_reasoning_effort_patch()

    import tradingagents.llm as llm_module
    old = os.environ.get("OPENAI_BASE_URL")
    try:
        if base_url is None:
            os.environ.pop("OPENAI_BASE_URL", None)
        else:
            os.environ["OPENAI_BASE_URL"] = base_url
        kwargs: dict = {}
        llm_module._apply_reasoning(provider, effort, kwargs)
        return kwargs
    finally:
        if old is None:
            os.environ.pop("OPENAI_BASE_URL", None)
        else:
            os.environ["OPENAI_BASE_URL"] = old


async def test_groq_reasoning_effort_skipped():
    kwargs = _apply_reasoning_via_module("openai", "medium", "https://api.groq.com/openai/v1")
    assert "reasoning_effort" not in kwargs


async def test_ionos_reasoning_effort_skipped():
    kwargs = _apply_reasoning_via_module("openai", "medium", "https://openai.inference.de-txl.ionos.com/v1")
    assert "reasoning_effort" not in kwargs


async def test_native_openai_reasoning_effort_applied():
    kwargs = _apply_reasoning_via_module("openai", "medium", None)
    assert kwargs.get("reasoning_effort") == "medium"


async def test_native_openai_reasoning_effort_max_maps_to_xhigh():
    kwargs = _apply_reasoning_via_module("openai", "max", None)
    assert kwargs.get("reasoning_effort") == "xhigh"
