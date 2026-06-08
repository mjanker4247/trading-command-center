from __future__ import annotations

from pydantic import BaseModel

from elliott_wave.models.instrument import Instrument
from elliott_wave.models.overview import AnalysisOverview
from elliott_wave.models.signal import TradeRegion
from elliott_wave.models.wave import ElliottScenario


class AnalysisResult(BaseModel):
    instrument: Instrument
    top_scenarios: list[ElliottScenario]
    trade_regions: list[TradeRegion]
    overview: AnalysisOverview | None = None
