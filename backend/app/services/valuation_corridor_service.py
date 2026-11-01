"""Fair-value corridor assembly — yfinance-first history (C3), pure math via valuation_math."""

from __future__ import annotations

import asyncio
import logging
import math
import time
from typing import Any

import pandas as pd

from app.services.valuation_math import (
    align_daily_to_periods,
    fair_value_series,
    pick_lookback_years,
    trailing_median_multiple_series,
)
from app.services.yfinance_service import fetch_history_period

logger = logging.getLogger(__name__)

_CACHE_TTL = 6 * 3600
_cache: dict[str, tuple[dict[str, Any], float]] = {}

# yfinance statement row labels we try (first hit wins)
_EPS_KEYS = ("Diluted EPS", "Basic EPS", "DilutedEPS", "BasicEPS")
_OCF_KEYS = ("Operating Cash Flow", "OperatingCashFlow", "Total Cash From Operating Activities")
_FCF_KEYS = ("Free Cash Flow", "FreeCashFlow")
_SHARES_KEYS = (
    "Ordinary Shares Number",
    "Share Issued",
    "Diluted Average Shares",
    "Basic Average Shares",
)
_REVENUE_KEYS = ("Total Revenue", "Operating Revenue", "Revenue")


def _first_row(frame: pd.DataFrame | None, keys: tuple[str, ...]) -> pd.Series | None:
    if frame is None or frame.empty:
        return None
    for key in keys:
        if key in frame.index:
            return frame.loc[key]
    # case-insensitive fallback
    lower_map = {str(idx).lower(): idx for idx in frame.index}
    for key in keys:
        hit = lower_map.get(key.lower())
        if hit is not None:
            return frame.loc[hit]
    return None


def _series_to_period_map(series: pd.Series | None) -> dict[str, float]:
    if series is None:
        return {}
    out: dict[str, float] = {}
    for label, value in series.items():
        try:
            if isinstance(label, pd.Timestamp):
                period = label.strftime("%Y-%m-%d")
            else:
                period = str(label)[:10]
            num = float(value)
            if math.isfinite(num):
                out[period] = num
        except (TypeError, ValueError):
            continue
    return out


def _per_share_from_total(
    total: dict[str, float],
    shares: dict[str, float],
) -> dict[str, float]:
    out: dict[str, float] = {}
    for period, value in total.items():
        sh = shares.get(period)
        if sh is None or sh <= 0 or not math.isfinite(value):
            continue
        out[period] = value / sh
    return out


def _sync_fetch_fundamentals(ticker: str) -> dict[str, Any]:
    """Pull annual EPS / OCFPS / FCFPS / sales-per-share from yfinance statements."""
    import yfinance as yf

    t = yf.Ticker(ticker)
    income = getattr(t, "income_stmt", None)
    cashflow = getattr(t, "cashflow", None)
    balance = getattr(t, "balance_sheet", None)

    if not isinstance(income, pd.DataFrame):
        income = pd.DataFrame()
    if not isinstance(cashflow, pd.DataFrame):
        cashflow = pd.DataFrame()
    if not isinstance(balance, pd.DataFrame):
        balance = pd.DataFrame()

    eps = _series_to_period_map(_first_row(income, _EPS_KEYS))
    shares = _series_to_period_map(_first_row(balance, _SHARES_KEYS))
    if not shares:
        shares = _series_to_period_map(_first_row(income, _SHARES_KEYS))

    ocf_total = _series_to_period_map(_first_row(cashflow, _OCF_KEYS))
    fcf_total = _series_to_period_map(_first_row(cashflow, _FCF_KEYS))
    rev_total = _series_to_period_map(_first_row(income, _REVENUE_KEYS))

    ocfps = _per_share_from_total(ocf_total, shares) if ocf_total and shares else {}
    fcfps = _per_share_from_total(fcf_total, shares) if fcf_total and shares else {}
    salesps = _per_share_from_total(rev_total, shares) if rev_total and shares else {}

    info: dict[str, Any] = {}
    try:
        raw_info = t.info
        if isinstance(raw_info, dict):
            info = raw_info
    except Exception:
        logger.debug("yfinance info failed for %s", ticker)

    estimates: dict[str, Any] = {"source": "none", "forward_eps": [], "growth": None}
    try:
        # Best-effort: earnings growth + forward PE style fields from info
        if info.get("earningsGrowth") is not None:
            estimates["growth"] = float(info["earningsGrowth"])
            estimates["source"] = "yfinance"
        fwd = info.get("forwardEps")
        if fwd is not None and math.isfinite(float(fwd)):
            estimates["forward_eps"] = [{"period": "FY+1", "eps_avg": float(fwd)}]
            estimates["source"] = "yfinance"
    except (TypeError, ValueError):
        pass

    return {
        "source": "yfinance",
        "eps": eps,
        "ocfps": ocfps,
        "fcfps": fcfps,
        "salesps": salesps,
        "estimates": estimates,
        "info": {
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "dividendYield": info.get("dividendYield"),
            "currency": info.get("currency"),
            "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice"),
        },
    }


def _sorted_periods(*maps: dict[str, float]) -> list[str]:
    keys: set[str] = set()
    for m in maps:
        keys.update(m.keys())
    return sorted(keys)


def _build_metric_corridor(
    periods: list[str],
    price_by_period: dict[str, float],
    metric_by_period: dict[str, float],
    lookback: int,
) -> dict[str, Any]:
    medians = trailing_median_multiple_series(periods, price_by_period, metric_by_period, lookback)
    fair = fair_value_series(metric_by_period, medians)
    latest_med = None
    for p in reversed(periods):
        if medians.get(p) is not None:
            latest_med = medians[p]
            break
    return {
        "lookback_years": lookback,
        "median_multiple": latest_med,
        "fair_by_period": fair,
        "multiple_by_period": medians,
        "points": [
            {
                "date": p,
                "metric": metric_by_period.get(p),
                "price": price_by_period.get(p),
                "fair": fair.get(p),
                "multiple": medians.get(p),
            }
            for p in periods
            if p in metric_by_period
        ],
    }


def _daily_close_pairs(frame: pd.DataFrame) -> list[tuple[str, float]]:
    if frame is None or frame.empty:
        return []
    col = "Adj Close" if "Adj Close" in frame.columns else "Close"
    if col not in frame.columns:
        return []
    pairs: list[tuple[str, float]] = []
    for idx, row in frame.iterrows():
        try:
            val = float(row[col])
            if not math.isfinite(val):
                continue
            if isinstance(idx, pd.Timestamp):
                day = idx.strftime("%Y-%m-%d")
            else:
                day = str(idx)[:10]
            pairs.append((day, val))
        except (TypeError, ValueError):
            continue
    pairs.sort(key=lambda x: x[0])
    return pairs


async def get_valuation_corridor(ticker: str, lookback: int = 5) -> dict[str, Any] | None:
    """Return corridor payload for ticker, or None if data insufficient."""
    symbol = ticker.strip().upper()
    if not symbol:
        return None

    cache_key = f"{symbol}:{lookback}"
    cached = _cache.get(cache_key)
    if cached and cached[1] > time.time():
        return cached[0]

    try:
        fundamentals = await asyncio.to_thread(_sync_fetch_fundamentals, symbol)
        history = await fetch_history_period(symbol, period="max", interval="1d", auto_adjust=True)
    except Exception:
        logger.exception("valuation corridor fetch failed for %s", symbol)
        return None

    daily = _daily_close_pairs(history)
    eps = fundamentals["eps"]
    ocfps = fundamentals["ocfps"]
    fcfps = fundamentals["fcfps"]
    periods = _sorted_periods(eps, ocfps, fcfps)
    if len(periods) < 3 or not daily:
        return None

    price_by_period = align_daily_to_periods(periods, daily)
    if len(price_by_period) < 3:
        return None

    available = len(periods)
    lookbacks = pick_lookback_years(available)
    if lookback not in lookbacks:
        lookback = lookbacks[-1] if lookbacks else min(3, available)

    corridors: dict[str, Any] = {}
    for name, metric_map in (("eps", eps), ("ocf", ocfps), ("fcf", fcfps)):
        if len(metric_map) < 3:
            corridors[name] = {"insufficient_history": True, "points": []}
            continue
        metric_periods = [p for p in periods if p in metric_map]
        corridors[name] = _build_metric_corridor(
            metric_periods, price_by_period, metric_map, lookback
        )

    latest_price = daily[-1][1] if daily else None
    info = fundamentals.get("info") or {}
    if info.get("currentPrice") is not None:
        try:
            latest_price = float(info["currentPrice"])
        except (TypeError, ValueError):
            pass

    payload: dict[str, Any] = {
        "ticker": symbol,
        "source": fundamentals["source"],
        "lookback_years": lookback,
        "available_lookbacks": lookbacks,
        "summary": {
            "price": latest_price,
            "currency": info.get("currency") or "USD",
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "dividend_yield": info.get("dividendYield"),
        },
        "series": {
            "price": [{"date": d, "value": v} for d, v in daily],
        },
        "corridors": corridors,
        "estimates": fundamentals["estimates"],
        "pricedIn": {
            "growth": {
                "impliedCagr": None,
                "consensusCagr": fundamentals["estimates"].get("growth"),
                "gapPp": None,
                "method": "reverse_multiple",
                "source": fundamentals["estimates"].get("source", "none"),
            }
        },
    }

    # Compact fair series for chart libs (annual fair points)
    for name in ("eps", "ocf", "fcf"):
        block = corridors.get(name) or {}
        fair_pts = [
            {"date": p["date"], "value": p["fair"]}
            for p in block.get("points") or []
            if p.get("fair") is not None
        ]
        payload["series"][f"fair_{name}"] = fair_pts

    _cache[cache_key] = (payload, time.time() + _CACHE_TTL)
    return payload


def clear_valuation_cache() -> None:
    """Test helper."""
    _cache.clear()
