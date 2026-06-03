from pydantic import BaseModel


class TradeRegion(BaseModel):
    direction: str
    zone_low: float
    zone_high: float
    stop_level: float
    target_levels: list[float]
    rationale: list[str]
    confidence: float