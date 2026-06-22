"""Monetary values with explicit currency — no FX conversion."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PriceQuote:
    amount: float
    currency: str

    @property
    def currency_code(self) -> str:
        return self.currency.upper()
