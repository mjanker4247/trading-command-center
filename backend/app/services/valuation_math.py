"""Pure valuation corridor helpers — no I/O, no look-ahead in trailing medians."""

from __future__ import annotations

import math
from typing import Iterable, Sequence


def median(values: Sequence[float]) -> float | None:
    """Return median of finite values, or None if empty."""
    cleaned = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not cleaned:
        return None
    cleaned.sort()
    n = len(cleaned)
    mid = n // 2
    if n % 2:
        return cleaned[mid]
    return (cleaned[mid - 1] + cleaned[mid]) / 2.0


def cagr(start: float, end: float, years: float) -> float | None:
    """Compound annual growth rate as a fraction (0.08 = 8%)."""
    if years <= 0 or start is None or end is None:
        return None
    if not math.isfinite(start) or not math.isfinite(end) or start <= 0 or end <= 0:
        return None
    return (end / start) ** (1.0 / years) - 1.0


def multiple_at(price: float, per_share: float) -> float | None:
    """Price / per-share metric; None if non-positive or non-finite."""
    if not math.isfinite(price) or not math.isfinite(per_share) or per_share <= 0 or price <= 0:
        return None
    return price / per_share


def trailing_median_multiple_series(
    periods: Sequence[str],
    price_by_period: dict[str, float],
    metric_by_period: dict[str, float],
    lookback: int,
) -> dict[str, float | None]:
    """For each period (ascending), median P/metric over the last `lookback` periods.

    Uses only periods ≤ current index — no look-ahead.
    """
    if lookback < 1:
        raise ValueError("lookback must be >= 1")

    out: dict[str, float | None] = {}
    for i, period in enumerate(periods):
        # Window by period index (not only valid multiples) — no look-ahead.
        start_i = max(0, i + 1 - lookback)
        valid: list[float] = []
        for j in range(start_i, i + 1):
            p = periods[j]
            m = multiple_at(
                price_by_period.get(p, float("nan")),
                metric_by_period.get(p, float("nan")),
            )
            if m is not None:
                valid.append(m)
        out[period] = median(valid)
    return out


def fair_value_series(
    metric_by_period: dict[str, float],
    median_multiple_by_period: dict[str, float | None],
) -> dict[str, float | None]:
    """fair_t = metric_t × median_multiple_t."""
    out: dict[str, float | None] = {}
    for period, metric in metric_by_period.items():
        mult = median_multiple_by_period.get(period)
        if mult is None or not math.isfinite(metric):
            out[period] = None
            continue
        out[period] = float(metric) * float(mult)
    return out


def align_daily_to_periods(
    periods: Sequence[str],
    daily_closes: Sequence[tuple[str, float]],
) -> dict[str, float]:
    """Map each YYYY-MM-DD (or YYYY) period to the last daily close on or before that date.

    `daily_closes` must be ascending (date_iso, close). Periods may be year-end ISO dates.
    """
    if not daily_closes:
        return {}
    closes = list(daily_closes)
    out: dict[str, float] = {}
    j = 0
    last_close: float | None = None
    for period in periods:
        target = period[:10] if len(period) >= 10 else f"{period[:4]}-12-31"
        while j < len(closes) and closes[j][0] <= target:
            last_close = closes[j][1]
            j += 1
        if last_close is not None and math.isfinite(last_close):
            out[period] = float(last_close)
    return out


def pick_lookback_years(available_years: int, requested: Iterable[int] = (3, 5, 10, 15)) -> list[int]:
    """Return requested lookbacks that fit available annual history (≥ lookback points)."""
    return [n for n in requested if available_years >= n]
