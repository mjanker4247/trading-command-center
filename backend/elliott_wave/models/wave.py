from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class WaveLeg(BaseModel):
    label: str
    start_idx: int
    end_idx: int
    start_time: datetime
    end_time: datetime
    start_price: float
    end_price: float


class ElliottScenario(BaseModel):
    trend: str
    degree: str
    pattern: str
    legs: list[WaveLeg]
    score: float
    status: Literal["in_progress", "complete"] = "complete"
    invalidation_level: float | None = None
    notes: list[str] = []