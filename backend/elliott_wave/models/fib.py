from pydantic import BaseModel


class FibLevels(BaseModel):
    anchor_a: float
    anchor_b: float
    levels: dict[str, float]
    kind: str