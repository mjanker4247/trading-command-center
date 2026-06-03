from enum import Enum

from pydantic import BaseModel


class AnalysisProfile(str, Enum):
    FULL_CONFLUENCE = "full_confluence"
    ELLIOTT_FOCUSED = "elliott_focused"
    FIB_ONLY = "fib_only"
    SWING_ONLY = "swing_only"


class ToolSelection(BaseModel):
    swing: bool = True
    elliott: bool = True
    fibonacci: bool = True
    signal: bool = True
    chart: bool = True

    @classmethod
    def from_profile(cls, profile: AnalysisProfile) -> "ToolSelection":
        if profile == AnalysisProfile.SWING_ONLY:
            return cls(swing=True, elliott=False, fibonacci=False, signal=False, chart=True)
        if profile == AnalysisProfile.FIB_ONLY:
            return cls(swing=True, elliott=False, fibonacci=True, signal=False, chart=True)
        if profile == AnalysisProfile.ELLIOTT_FOCUSED:
            return cls(swing=True, elliott=True, fibonacci=True, signal=True, chart=True)
        return cls()
