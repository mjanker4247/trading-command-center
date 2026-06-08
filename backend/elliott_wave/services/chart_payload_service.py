from __future__ import annotations

import pandas as pd

from elliott_wave.engines.base import AnalysisContext
from elliott_wave.models.chart_payload import ChartPayload, OHLCVBar
from elliott_wave.models.result import AnalysisResult


class ChartPayloadService:
    """Builds JSON-serializable chart payloads from analysis outputs."""

    def build(
        self,
        df: pd.DataFrame,
        context: AnalysisContext,
        result: AnalysisResult,
    ) -> ChartPayload:
        ohlcv = self._ohlcv_from_dataframe(df)
        pivots = context.pivots if context.pivots else []
        overlays = list(context.overlays) if context.overlays else []

        scenarios = result.top_scenarios
        trade_regions = result.trade_regions

        return ChartPayload(
            ohlcv=ohlcv,
            pivots=pivots,
            overlays=overlays,
            scenarios=scenarios,
            trade_regions=trade_regions,
        )

    @staticmethod
    def _ohlcv_from_dataframe(df: pd.DataFrame) -> list[OHLCVBar]:
        bars: list[OHLCVBar] = []
        has_volume = "Volume" in df.columns

        for ts, row in df.iterrows():
            time_val = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
            volume: float | None = None
            if has_volume and pd.notna(row["Volume"]):
                volume = float(row["Volume"])

            bars.append(
                OHLCVBar(
                    time=time_val,
                    open=float(row["Open"]),
                    high=float(row["High"]),
                    low=float(row["Low"]),
                    close=float(row["Close"]),
                    volume=volume,
                )
            )
        return bars
