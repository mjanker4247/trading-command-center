from elliott_wave.engines.base import AnalysisEngine, AnalysisStage


class EngineRegistry:
    """Registry of analysis engines indexed by name."""

    def __init__(self) -> None:
        self._engines: dict[str, AnalysisEngine] = {}

    def register(self, engine: AnalysisEngine) -> None:
        self._engines[engine.name] = engine

    def get(self, name: str) -> AnalysisEngine | None:
        return self._engines.get(name)

    def get_by_stage(self, stage: AnalysisStage) -> list[AnalysisEngine]:
        return [e for e in self._engines.values() if e.stage == stage]

    def names(self) -> list[str]:
        return list(self._engines.keys())
