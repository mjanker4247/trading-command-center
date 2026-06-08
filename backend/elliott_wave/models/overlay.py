from __future__ import annotations

from datetime import datetime
from typing import Literal, Union

from pydantic import BaseModel


class PivotOverlay(BaseModel):
    kind: Literal["pivot"] = "pivot"
    times: list[datetime]
    prices: list[float]
    labels: list[str]


class WaveLegOverlay(BaseModel):
    kind: Literal["wave_leg"] = "wave_leg"
    start_time: datetime
    end_time: datetime
    start_price: float
    end_price: float
    label: str
    scenario_label: str
    color_hint: str | None = None


class ZoneOverlay(BaseModel):
    kind: Literal["zone"] = "zone"
    y0: float
    y1: float
    direction: str
    label: str


class HorizontalLevelOverlay(BaseModel):
    kind: Literal["level"] = "level"
    price: float
    label: str
    style: Literal["solid", "dashed", "dotted"] = "dashed"
    color_hint: str | None = None


class AnnotationOverlay(BaseModel):
    kind: Literal["annotation"] = "annotation"
    time: datetime
    price: float
    text: str
    color_hint: str | None = None


ChartOverlay = Union[
    PivotOverlay,
    WaveLegOverlay,
    ZoneOverlay,
    HorizontalLevelOverlay,
    AnnotationOverlay,
]
