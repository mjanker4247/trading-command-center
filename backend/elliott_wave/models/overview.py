from __future__ import annotations

from pydantic import BaseModel

from elliott_wave.models.signal import TradeRegion


class ToolOutcome(BaseModel):
    tool_name: str
    enabled: bool
    status: str
    headline: str
    confidence: float | None = None
    details: list[str] = []


class AnalysisOverview(BaseModel):
    active_tools: list[str]
    top_scenario: str | None = None
    top_direction: str | None = None
    trade_region: TradeRegion | None = None
    tool_outcomes: list[ToolOutcome] = []
    warnings: list[str] = []
