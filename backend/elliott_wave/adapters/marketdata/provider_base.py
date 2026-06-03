from abc import ABC, abstractmethod

import pandas as pd


class MarketDataProvider(ABC):
    @abstractmethod
    def get_history(self, symbol: str, period: str, interval: str) -> pd.DataFrame:
        ...
