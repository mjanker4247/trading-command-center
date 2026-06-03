from pydantic import BaseModel


class Instrument(BaseModel):
    symbol: str
    isin: str | None = None
    exchange: str | None = None
    currency: str | None = None
    asset_type: str | None = None