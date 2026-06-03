from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from elliott_wave.models.selection import AnalysisProfile, ToolSelection

VALID_PERIODS = Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
VALID_INTERVALS = Literal["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]
ZIGZAG_PRICE_MODES = Literal["close", "high_low"]


class MarketDataRequest(BaseModel):
    symbol: str | None = None
    isin: str | None = None
    period: VALID_PERIODS = "2y"
    interval: VALID_INTERVALS = "1d"
    zigzag_threshold: float = Field(default=0.06, gt=0, le=1.0)
    zigzag_price_mode: ZIGZAG_PRICE_MODES = "close"
    tools: ToolSelection = Field(default_factory=ToolSelection)
    profile: AnalysisProfile | None = None