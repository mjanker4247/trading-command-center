from datetime import datetime

from pydantic import BaseModel


class Pivot(BaseModel):
    time: datetime
    price: float
    kind: str
    index: int