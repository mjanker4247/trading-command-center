import pandas as pd

from elliott_wave.adapters.marketdata.provider_base import MarketDataProvider
from elliott_wave.services.data_provider import DataProvider


class YFinanceAdapter(MarketDataProvider):
    """Adapter wrapping DataProvider for use in contexts that expect MarketDataProvider."""

    def __init__(self) -> None:
        self._provider = DataProvider()

    def get_history(self, symbol: str, period: str, interval: str) -> pd.DataFrame:
        return self._provider.get_history(symbol, period=period, interval=interval)
