from elliott_wave.engines.base import AnalysisContext, AnalysisStage, EngineResult
from elliott_wave.models.overlay import HorizontalLevelOverlay
from elliott_wave.services.fibonacci_engine import FibonacciEngine as _FibEngine


class FibonacciLevelEngine:
    name = "fibonacci"
    stage = AnalysisStage.FIBONACCI

    def __init__(self) -> None:
        self._engine = _FibEngine()

    def run(self, context: AnalysisContext) -> EngineResult:
        if not context.scenarios:
            return EngineResult(
                status="skipped",
                warnings=["No Elliott scenarios for Fibonacci computation"],
            )

        fib_levels = []
        overlays: list = []

        for scenario in context.scenarios[:3]:
            if not scenario.legs:
                continue
            first_leg = scenario.legs[0]
            try:
                if scenario.trend == "bullish":
                    levels = self._engine.retracements(first_leg.start_price, first_leg.end_price)
                else:
                    levels = self._engine.retracements(first_leg.end_price, first_leg.start_price)
                fib_levels.append(levels)
                for label, price in levels.levels.items():
                    overlays.append(
                        HorizontalLevelOverlay(
                            price=price,
                            label=f"Fib {label}",
                            style="dotted",
                            color_hint="fib",
                        )
                    )
            except ValueError:
                pass

        context.fib_levels = fib_levels
        context.overlays.extend(overlays)

        return EngineResult(
            status="ok",
            artifacts={"fib_set_count": len(fib_levels)},
            overlays=overlays,
            summary_items=[f"Computed {len(fib_levels)} Fibonacci level sets"],
        )
