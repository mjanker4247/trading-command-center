from elliott_wave.engines.base import AnalysisContext, AnalysisStage, EngineResult
from elliott_wave.models.overlay import HorizontalLevelOverlay, WaveLegOverlay
from elliott_wave.services.elliott_engine import ElliottEngine as _ElliottEngine
from elliott_wave.services.fibonacci_engine import FibonacciEngine


class ElliottWaveEngine:
    name = "elliott"
    stage = AnalysisStage.ELLIOTT

    def __init__(self) -> None:
        self._engine = _ElliottEngine(fib_engine=FibonacciEngine())

    def run(self, context: AnalysisContext) -> EngineResult:
        if not context.pivots:
            return EngineResult(
                status="skipped",
                warnings=["No pivots available for Elliott analysis"],
            )

        scenarios = self._engine.analyze(context.pivots)
        context.scenarios = scenarios

        overlays: list = []
        for scenario in scenarios[:3]:
            s_label = f"{scenario.pattern}/{scenario.trend} ({scenario.score:.0f})"
            for leg in scenario.legs:
                overlays.append(
                    WaveLegOverlay(
                        start_time=leg.start_time,
                        end_time=leg.end_time,
                        start_price=leg.start_price,
                        end_price=leg.end_price,
                        label=leg.label,
                        scenario_label=s_label,
                    )
                )
            if scenario.invalidation_level is not None:
                overlays.append(
                    HorizontalLevelOverlay(
                        price=scenario.invalidation_level,
                        label=f"Invalidation ({scenario.trend})",
                        style="dashed",
                        color_hint="invalidation",
                    )
                )

        context.overlays.extend(overlays)

        top = scenarios[0] if scenarios else None
        return EngineResult(
            status="ok",
            artifacts={"scenario_count": len(scenarios)},
            overlays=overlays,
            summary_items=[
                f"Found {len(scenarios)} Elliott scenarios",
                *(
                    [f"Top: {top.pattern}/{top.trend} score={top.score}"]
                    if top
                    else ["No valid scenarios"]
                ),
            ],
        )
