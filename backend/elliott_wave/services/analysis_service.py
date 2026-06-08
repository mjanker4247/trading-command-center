from typing import Literal

import pandas as pd

from elliott_wave.models.pivot import Pivot
from elliott_wave.models.result import AnalysisResult
from elliott_wave.models.selection import AnalysisProfile, ToolSelection
from elliott_wave.services.analysis_orchestrator import AnalysisOrchestrator


class AnalysisService:
    """Facade that delegates to AnalysisOrchestrator while preserving the legacy API."""

    def __init__(self) -> None:
        self._orchestrator = AnalysisOrchestrator()

    def analyze(
        self,
        symbol: str | None,
        isin: str | None,
        period: str = "2y",
        interval: str = "1d",
        zigzag_threshold: float = 0.06,
        zigzag_price_mode: Literal["close", "high_low"] = "close",
        tools: ToolSelection | None = None,
        profile: AnalysisProfile | None = None,
    ) -> tuple[pd.DataFrame, list[Pivot], AnalysisResult]:
        df, context, result = self._orchestrator.analyze(
            symbol=symbol,
            isin=isin,
            period=period,
            interval=interval,
            zigzag_threshold=zigzag_threshold,
            zigzag_price_mode=zigzag_price_mode,
            tools=tools,
            profile=profile,
        )
        return df, context.pivots, result
