"""Unit tests for Tauric stream_run → AgentFloor live event mapping."""

import pytest
from langchain_core.messages import AIMessage

from app.services.tauric_live_progress import LiveProgressTracker

pytestmark = [pytest.mark.unit]


def test_tracker_starts_selected_analysts_and_completes_on_reports():
    events: list[dict] = []
    tracker = LiveProgressTracker(["market", "news"], events.append)
    tracker.on_run_start()

    assert {"type": "started", "agent": "market_analyst"} in events
    assert {"type": "started", "agent": "news_analyst"} in events
    assert not any(e.get("agent") == "social_analyst" for e in events)

    tracker.on_chunk({"market_report": "Buy the dip on RSI."})
    assert any(
        e["type"] == "completed" and e["agent"] == "market_analyst" and "RSI" in e["summary"]
        for e in events
    )
    # Bull/bear not yet — news still pending
    assert not any(e.get("agent") == "bull_researcher" for e in events)

    tracker.on_chunk({
        "market_report": "Buy the dip on RSI.",
        "news_report": "Product launch next week.",
    })
    assert any(e["type"] == "started" and e["agent"] == "bull_researcher" for e in events)
    assert any(e["type"] == "started" and e["agent"] == "bear_researcher" for e in events)


def test_tracker_pipeline_through_portfolio_manager():
    events: list[dict] = []
    tracker = LiveProgressTracker(["market"], events.append)
    tracker.on_run_start()
    tracker.on_chunk({"market_report": "done"})
    tracker.on_chunk({
        "market_report": "done",
        "investment_debate_state": {
            "bull_history": "bull case",
            "bear_history": "bear case",
        },
    })
    tracker.on_chunk({
        "market_report": "done",
        "investment_plan": "RM: overweight",
        "trader_investment_plan": "**Entry Price**: 10",
        "risk_debate_state": {
            "aggressive_history": "agg",
            "conservative_history": "con",
            "neutral_history": "neu",
        },
        "final_trade_decision": "**Rating**: Overweight",
    })

    agents_completed = {e["agent"] for e in events if e["type"] == "completed"}
    assert "research_manager" in agents_completed
    assert "trader" in agents_completed
    assert "risk_judge" in agents_completed
    assert "aggressive_analyst" in agents_completed


def test_tracker_emits_ai_message_tokens():
    events: list[dict] = []
    tracker = LiveProgressTracker(["market"], events.append)
    tracker.on_run_start()
    tracker.on_messages([AIMessage(content="Analyst draft with enough characters.", id="m1")])
    tokens = [e for e in events if e["type"] == "token"]
    assert len(tokens) == 1
    assert "Analyst draft" in tokens[0]["token"]
    # Duplicate id ignored
    tracker.on_messages([AIMessage(content="Analyst draft with enough characters.", id="m1")])
    assert len([e for e in events if e["type"] == "token"]) == 1


def test_tracker_ignores_unknown_analyst_keys():
    events: list[dict] = []
    tracker = LiveProgressTracker(["market", "technical", "bogus"], events.append)
    tracker.on_run_start()
    assert [e["agent"] for e in events if e["type"] == "started"] == ["market_analyst"]
