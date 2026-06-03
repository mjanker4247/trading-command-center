from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal, Protocol, runtime_checkable

import pandas as pd

from elliott_wave.models.fib import FibLevels
from elliott_wave.models.instrument import Instrument
from elliott_wave.models.pivot import Pivot
from elliott_wave.models.selection import ToolSelection
from elliott_wave.models.signal import TradeRegion
from elliott_wave.models.wave import ElliottScenario

if TYPE_CHECKING:
    pass


class AnalysisStage(str, Enum):
    SWING = "swing"
    ELLIOTT = "elliott"
    FIBONACCI = "fibonacci"
    SIGNAL = "signal"
    CHART = "chart"


@dataclass
class AnalysisContext:
    """Mutable context passed through the engine pipeline."""

    instrument: Instrument | None = None
    ohlcv: pd.DataFrame | None = None
    selected_tools: ToolSelection = field(default_factory=ToolSelection)
    zigzag_threshold: float = 0.06
    zigzag_price_mode: Literal["close", "high_low"] = "close"

    pivots: list[Pivot] = field(default_factory=list)
    scenarios: list[ElliottScenario] = field(default_factory=list)
    fib_levels: list[FibLevels] = field(default_factory=list)
    trade_regions: list[TradeRegion] = field(default_factory=list)
    overlays: list[Any] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    invalidations: list[str] = field(default_factory=list)


@dataclass
class EngineResult:
    """Standardised result returned by every engine."""

    status: str  # "ok", "skipped", "error"
    artifacts: dict[str, Any] = field(default_factory=dict)
    overlays: list[Any] = field(default_factory=list)
    summary_items: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    debug_info: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class AnalysisEngine(Protocol):
    name: str
    stage: AnalysisStage

    def run(self, context: AnalysisContext) -> EngineResult:
        ...
