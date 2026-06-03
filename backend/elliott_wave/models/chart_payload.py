from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from elliott_wave.models.instrument import Instrument
from elliott_wave.models.overlay import ChartOverlay
from elliott_wave.models.overview import AnalysisOverview
from elliott_wave.models.pivot import Pivot
from elliott_wave.models.signal import TradeRegion
from elliott_wave.models.wave import ElliottScenario


class OHLCVBar(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class ChartPayload(BaseModel):
    """Structured chart data for frontend rendering."""

    ohlcv: list[OHLCVBar]
    pivots: list[Pivot] = Field(default_factory=list)
    overlays: list[ChartOverlay] = Field(default_factory=list)
    scenarios: list[ElliottScenario] = Field(default_factory=list)
    trade_regions: list[TradeRegion] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    """Full analysis response including chart payload for the React UI."""

    instrument: Instrument
    top_scenarios: list[ElliottScenario]
    trade_regions: list[TradeRegion]
    overview: AnalysisOverview | None = None
    chart: ChartPayload
