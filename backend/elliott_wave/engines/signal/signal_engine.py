from elliott_wave.engines.base import AnalysisContext, AnalysisStage, EngineResult
from elliott_wave.models.overlay import HorizontalLevelOverlay, ZoneOverlay
from elliott_wave.services.fibonacci_engine import FibonacciEngine
from elliott_wave.services.signal_engine import SignalEngine as _SignalEngine


class SignalGeneratorEngine:
    name = "signal"
    stage = AnalysisStage.SIGNAL

    def __init__(self) -> None:
        self._engine = _SignalEngine(fib_engine=FibonacciEngine())

    def run(self, context: AnalysisContext) -> EngineResult:
        if not context.scenarios:
            return EngineResult(
                status="skipped",
                warnings=["No scenarios for signal generation"],
            )

        trade_regions = self._engine.generate(context.scenarios)
        context.trade_regions = trade_regions

        overlays: list = []
        for region in trade_regions:
            overlays.append(
                ZoneOverlay(
                    y0=region.zone_low,
                    y1=region.zone_high,
                    direction=region.direction,
                    label=f"{region.direction} zone",
                )
            )
            overlays.append(
                HorizontalLevelOverlay(
                    price=region.stop_level,
                    label="Stop",
                    style="dashed",
                    color_hint="stop",
                )
            )
            for i, target in enumerate(region.target_levels, 1):
                overlays.append(
                    HorizontalLevelOverlay(
                        price=target,
                        label=f"T{i}",
                        style="dashed",
                        color_hint="target",
                    )
                )

        context.overlays.extend(overlays)

        return EngineResult(
            status="ok",
            artifacts={"region_count": len(trade_regions)},
            overlays=overlays,
            summary_items=[f"Generated {len(trade_regions)} trade regions"],
        )
