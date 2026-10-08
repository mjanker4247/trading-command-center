"""Map TauricResearch ``stream_run`` state chunks → AgentFloor live WS events.

Mirrors the CLI live path in TradingAgents (`update_analyst_statuses` /
analysis_driver), adapted to AgentFloor's ``started`` / ``completed`` /
``token`` event contract used by PipelinePanel + AgentFeed.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

# AgentFloor analyst keys → (state report field, pipeline agent id)
ANALYST_REPORT_FIELDS: dict[str, tuple[str, str]] = {
    "market": ("market_report", "market_analyst"),
    "social": ("sentiment_report", "social_analyst"),
    "news": ("news_report", "news_analyst"),
    "fundamentals": ("fundamentals_report", "fundamentals_analyst"),
}

EmitFn = Callable[[dict[str, Any]], None]


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _summary(text: str, limit: int = 500) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


class LiveProgressTracker:
    """Stateful emitter: one ``started`` / ``completed`` per pipeline agent."""

    def __init__(self, selected_analysts: list[str], emit: EmitFn):
        self.selected = [a for a in selected_analysts if a in ANALYST_REPORT_FIELDS]
        self.emit = emit
        self._started: set[str] = set()
        self._done: set[str] = set()
        self._seen_msg_ids: set[Any] = set()

    def on_run_start(self) -> None:
        # Analysts run in parallel — mark all selected as started up front.
        for key in self.selected:
            self._start(ANALYST_REPORT_FIELDS[key][1])

    def on_messages(self, messages: list[Any]) -> None:
        """Optional feed lines from LangChain messages (AI / tool text)."""
        from langchain_core.messages import AIMessage, ToolMessage

        for message in messages or []:
            msg_id = getattr(message, "id", None)
            if msg_id is not None:
                if msg_id in self._seen_msg_ids:
                    continue
                self._seen_msg_ids.add(msg_id)

            content = getattr(message, "content", None)
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(str(item.get("text") or ""))
                    elif isinstance(item, str):
                        parts.append(item)
                content = " ".join(parts)
            text = _text(content)
            if not text or len(text) < 8:
                continue

            if isinstance(message, ToolMessage):
                agent = self._active_agent() or "market_analyst"
                self.emit({"type": "token", "agent": agent, "token": _summary(f"[tool] {text}", 240)})
            elif isinstance(message, AIMessage):
                agent = self._active_agent() or "market_analyst"
                self.emit({"type": "token", "agent": agent, "token": _summary(text, 320)})

    def on_chunk(self, chunk: dict[str, Any] | None) -> None:
        if not isinstance(chunk, dict):
            return

        all_filed = True
        for key in self.selected:
            field, agent = ANALYST_REPORT_FIELDS[key]
            report = _text(chunk.get(field))
            if report:
                self._complete(agent, report)
            elif agent not in self._done:
                all_filed = False

        if all_filed and self.selected:
            self._start("bull_researcher")
            self._start("bear_researcher")

        debate = chunk.get("investment_debate_state")
        if isinstance(debate, dict):
            bull = _text(debate.get("bull_history"))
            bear = _text(debate.get("bear_history"))
            if bull:
                self._complete("bull_researcher", bull)
            if bear:
                self._complete("bear_researcher", bear)

        plan = _text(chunk.get("investment_plan"))
        if plan:
            self._start("research_manager")
            self._complete("research_manager", plan)
            self._start("trader")

        trader = _text(chunk.get("trader_investment_plan"))
        if trader:
            self._complete("trader", trader)
            self._start("aggressive_analyst")
            self._start("conservative_analyst")
            self._start("neutral_analyst")

        risk = chunk.get("risk_debate_state")
        if isinstance(risk, dict):
            for hist_key, agent in (
                ("aggressive_history", "aggressive_analyst"),
                ("conservative_history", "conservative_analyst"),
                ("neutral_history", "neutral_analyst"),
            ):
                hist = _text(risk.get(hist_key))
                if hist:
                    self._start(agent)

        final = _text(chunk.get("final_trade_decision"))
        if final:
            for agent in (
                "aggressive_analyst",
                "conservative_analyst",
                "neutral_analyst",
            ):
                self._start(agent)
                if agent not in self._done:
                    risk = chunk.get("risk_debate_state") if isinstance(chunk.get("risk_debate_state"), dict) else {}
                    hist_map = {
                        "aggressive_analyst": "aggressive_history",
                        "conservative_analyst": "conservative_history",
                        "neutral_analyst": "neutral_history",
                    }
                    self._complete(agent, _text(risk.get(hist_map[agent])) or final)
            self._start("risk_judge")
            self._complete("risk_judge", final)

    def _active_agent(self) -> str | None:
        # Prefer an in-progress (started but not done) agent for feed attribution.
        for agent in reversed(list(self._started)):
            if agent not in self._done:
                return agent
        return None

    def _start(self, agent: str) -> None:
        if agent in self._started:
            return
        self._started.add(agent)
        self.emit({"type": "started", "agent": agent})

    def _complete(self, agent: str, summary: str = "") -> None:
        if agent in self._done:
            return
        self._started.add(agent)
        self._done.add(agent)
        self.emit({
            "type": "completed",
            "agent": agent,
            "summary": _summary(summary) if summary else "",
        })
