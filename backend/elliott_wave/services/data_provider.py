import pandas as pd
import yfinance as yf

class DataProvider:
    REQUIRED_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]

    def get_history(self, symbol: str, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)

        if df.empty:
            raise ValueError(f"No market data returned for symbol: {symbol}")

        missing = [c for c in self.REQUIRED_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        df = df[self.REQUIRED_COLUMNS].copy()
        df = df.dropna()
        df.index = pd.to_datetime(df.index)
        return df