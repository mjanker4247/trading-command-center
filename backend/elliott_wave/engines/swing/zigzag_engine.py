from elliott_wave.engines.base import AnalysisContext, AnalysisStage, EngineResult
from elliott_wave.models.overlay import PivotOverlay
from elliott_wave.services.swing_detector import SwingDetector


class ZigZagEngine:
    name = "zigzag"
    stage = AnalysisStage.SWING

    def __init__(self) -> None:
        self._detector = SwingDetector()

    def run(self, context: AnalysisContext) -> EngineResult:
        if context.ohlcv is None or context.ohlcv.empty:
            return EngineResult(
                status="error",
                warnings=["No OHLCV data available for swing detection"],
            )

        pivots = self._detector.zigzag(
            context.ohlcv,
            threshold=context.zigzag_threshold,
            price_mode=context.zigzag_price_mode,
        )
        context.pivots = pivots

        overlay = PivotOverlay(
            times=[p.time for p in pivots],
            prices=[p.price for p in pivots],
            labels=[p.kind[0].upper() for p in pivots],
        )
        context.overlays.append(overlay)

        return EngineResult(
            status="ok",
            artifacts={"pivot_count": len(pivots)},
            overlays=[overlay],
            summary_items=[f"Detected {len(pivots)} ZigZag pivots"],
        )
