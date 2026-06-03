from datetime import datetime
from typing import Literal

import pandas as pd

from elliott_wave.models.pivot import Pivot

PriceMode = Literal["close", "high_low"]


def _to_naive_utc(ts: pd.Timestamp) -> datetime:
    """Strip timezone from a pandas Timestamp, converting to UTC first if tz-aware."""
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts.to_pydatetime()


class SwingDetector:
    def zigzag(
        self,
        data: pd.Series | pd.DataFrame,
        threshold: float = 0.06,
        price_mode: PriceMode = "close",
    ) -> list[Pivot]:
        if isinstance(data, pd.DataFrame):
            if data.empty:
                return []
            if price_mode == "high_low":
                return self._zigzag_high_low(data, threshold)
            close = data["Close"]
        else:
            if data.empty:
                return []
            close = data

        if price_mode == "high_low":
            raise ValueError("high_low price mode requires an OHLCV DataFrame")

        return self._zigzag_close(close, threshold)

    def _zigzag_close(self, close: pd.Series, threshold: float) -> list[Pivot]:
        prices = close.astype(float).reset_index()
        time_col = prices.columns[0]
        price_col = prices.columns[1]

        pivots: list[Pivot] = []

        last_pivot_idx = 0
        last_pivot_price = float(prices.loc[0, price_col])
        candidate_idx = 0
        candidate_price = last_pivot_price
        trend: str | None = None

        for i in range(1, len(prices)):
            price = float(prices.loc[i, price_col])

            if trend is None:
                up_move = (price - last_pivot_price) / last_pivot_price
                down_move = (last_pivot_price - price) / last_pivot_price

                if up_move >= threshold:
                    trend = "up"
                    candidate_idx = i
                    candidate_price = price
                elif down_move >= threshold:
                    trend = "down"
                    candidate_idx = i
                    candidate_price = price
                continue

            if trend == "up":
                if price >= candidate_price:
                    candidate_idx = i
                    candidate_price = price
                elif (candidate_price - price) / candidate_price >= threshold:
                    if not pivots:
                        pivots.append(
                            Pivot(
                                time=_to_naive_utc(prices.loc[last_pivot_idx, time_col]),
                                price=last_pivot_price,
                                kind="low",
                                index=last_pivot_idx,
                            )
                        )
                    pivots.append(
                        Pivot(
                            time=_to_naive_utc(prices.loc[candidate_idx, time_col]),
                            price=candidate_price,
                            kind="high",
                            index=candidate_idx,
                        )
                    )
                    last_pivot_idx = candidate_idx
                    last_pivot_price = candidate_price
                    candidate_idx = i
                    candidate_price = price
                    trend = "down"

            elif trend == "down":
                if price <= candidate_price:
                    candidate_idx = i
                    candidate_price = price
                elif (price - candidate_price) / candidate_price >= threshold:
                    if not pivots:
                        pivots.append(
                            Pivot(
                                time=_to_naive_utc(prices.loc[last_pivot_idx, time_col]),
                                price=last_pivot_price,
                                kind="high",
                                index=last_pivot_idx,
                            )
                        )
                    pivots.append(
                        Pivot(
                            time=_to_naive_utc(prices.loc[candidate_idx, time_col]),
                            price=candidate_price,
                            kind="low",
                            index=candidate_idx,
                        )
                    )
                    last_pivot_idx = candidate_idx
                    last_pivot_price = candidate_price
                    candidate_idx = i
                    candidate_price = price
                    trend = "up"

        if trend == "up":
            pivots.append(
                Pivot(
                    time=_to_naive_utc(prices.loc[candidate_idx, time_col]),
                    price=candidate_price,
                    kind="high",
                    index=candidate_idx,
                )
            )
        elif trend == "down":
            pivots.append(
                Pivot(
                    time=_to_naive_utc(prices.loc[candidate_idx, time_col]),
                    price=candidate_price,
                    kind="low",
                    index=candidate_idx,
                )
            )

        return self._deduplicate_and_validate(pivots)

    def _zigzag_high_low(self, ohlcv: pd.DataFrame, threshold: float) -> list[Pivot]:
        frame = ohlcv[["High", "Low"]].astype(float).reset_index()
        time_col = frame.columns[0]

        pivots: list[Pivot] = []

        last_pivot_idx = 0
        last_pivot_price = float(frame.loc[0, "Low"])
        candidate_idx = 0
        candidate_price = float(frame.loc[0, "High"])
        trend: str | None = None

        for i in range(1, len(frame)):
            bar_high = float(frame.loc[i, "High"])
            bar_low = float(frame.loc[i, "Low"])

            if trend is None:
                up_move = (bar_high - last_pivot_price) / last_pivot_price
                down_move = (last_pivot_price - bar_low) / last_pivot_price

                if up_move >= threshold:
                    trend = "up"
                    candidate_idx = i
                    candidate_price = bar_high
                elif down_move >= threshold:
                    trend = "down"
                    candidate_idx = i
                    candidate_price = bar_low
                continue

            if trend == "up":
                if bar_high >= candidate_price:
                    candidate_idx = i
                    candidate_price = bar_high
                elif (candidate_price - bar_low) / candidate_price >= threshold:
                    if not pivots:
                        pivots.append(
                            Pivot(
                                time=_to_naive_utc(frame.loc[last_pivot_idx, time_col]),
                                price=last_pivot_price,
                                kind="low",
                                index=last_pivot_idx,
                            )
                        )
                    pivots.append(
                        Pivot(
                            time=_to_naive_utc(frame.loc[candidate_idx, time_col]),
                            price=candidate_price,
                            kind="high",
                            index=candidate_idx,
                        )
                    )
                    last_pivot_idx = candidate_idx
                    last_pivot_price = candidate_price
                    candidate_idx = i
                    candidate_price = bar_low
                    trend = "down"

            elif trend == "down":
                if bar_low <= candidate_price:
                    candidate_idx = i
                    candidate_price = bar_low
                elif (bar_high - candidate_price) / candidate_price >= threshold:
                    if not pivots:
                        pivots.append(
                            Pivot(
                                time=_to_naive_utc(frame.loc[last_pivot_idx, time_col]),
                                price=last_pivot_price,
                                kind="high",
                                index=last_pivot_idx,
                            )
                        )
                    pivots.append(
                        Pivot(
                            time=_to_naive_utc(frame.loc[candidate_idx, time_col]),
                            price=candidate_price,
                            kind="low",
                            index=candidate_idx,
                        )
                    )
                    last_pivot_idx = candidate_idx
                    last_pivot_price = candidate_price
                    candidate_idx = i
                    candidate_price = bar_high
                    trend = "up"

        if trend == "up":
            pivots.append(
                Pivot(
                    time=_to_naive_utc(frame.loc[candidate_idx, time_col]),
                    price=candidate_price,
                    kind="high",
                    index=candidate_idx,
                )
            )
        elif trend == "down":
            pivots.append(
                Pivot(
                    time=_to_naive_utc(frame.loc[candidate_idx, time_col]),
                    price=candidate_price,
                    kind="low",
                    index=candidate_idx,
                )
            )

        return self._deduplicate_and_validate(pivots)

    def _deduplicate_and_validate(self, pivots: list[Pivot]) -> list[Pivot]:
        if not pivots:
            return []

        cleaned = [pivots[0]]
        for pivot in pivots[1:]:
            prev = cleaned[-1]
            if pivot.kind == prev.kind:
                if pivot.kind == "high" and pivot.price > prev.price:
                    cleaned[-1] = pivot
                elif pivot.kind == "low" and pivot.price < prev.price:
                    cleaned[-1] = pivot
            else:
                cleaned.append(pivot)
        return cleaned
