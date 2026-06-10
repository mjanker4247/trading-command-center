"""Kalman trend estimation on yfinance price data."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import datetime, timezone
from typing import Literal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_kalman_cache: dict[str, tuple[dict | None, float]] = {}
_CACHE_TTL = 14400  # 4 hours
_fetch_sem = asyncio.Semaphore(10)

_VALID_INTERVALS = {"1d", "5d", "1wk", "1mo", "3mo"}
_TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-=]{0,14}$")


class KalmanDataError(ValueError):
    """Raised when Kalman inputs or downloaded market data are unusable."""


def _validate_ticker(ticker: str) -> str:
    normalized = ticker.strip().upper()
    if not _TICKER_RE.match(normalized):
        raise KalmanDataError("Ticker must be 1-15 market symbol characters")
    return normalized


def _validate_date(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None
    try:
        pd.Timestamp(value)
    except Exception as exc:
        raise KalmanDataError(f"{field_name} must be a valid date") from exc
    return value


def _as_matrix(value: object, shape: tuple[int, int], name: str) -> np.ndarray:
    matrix = np.asarray(value, dtype=float)
    if matrix.shape != shape:
        raise KalmanDataError(f"{name} must have shape {shape}")
    if not np.isfinite(matrix).all():
        raise KalmanDataError(f"{name} must contain only finite numbers")
    return matrix


def download_price_data(
    ticker: str = "SPY",
    start: str = "2015-01-01",
    end: str | None = None,
    interval: str = "1d",
) -> pd.DataFrame:
    """Download historical OHLCV data from yfinance for Kalman analysis."""
    symbol = _validate_ticker(ticker)
    _validate_date(start, "start")
    _validate_date(end, "end")
    if interval not in _VALID_INTERVALS:
        raise KalmanDataError(f"interval must be one of {sorted(_VALID_INTERVALS)}")

    try:
        import yfinance as yf

        data = yf.download(
            symbol,
            start=start,
            end=end,
            interval=interval,
            auto_adjust=False,
            progress=False,
            threads=False,
        )
    except Exception as exc:
        raise KalmanDataError(f"Failed to download price data for {symbol}") from exc

    if data is None or data.empty:
        raise KalmanDataError(f"No price data available for {symbol}")

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)
    return data


def prepare_price_series(data: pd.DataFrame) -> pd.Series:
    """Clean OHLCV data and extract adjusted close, falling back to close."""
    if data.empty:
        raise KalmanDataError("Price data is empty")

    column = "Adj Close" if "Adj Close" in data.columns else "Close"
    if column not in data.columns:
        raise KalmanDataError("Price data must include Adj Close or Close")

    price = pd.to_numeric(data[column], errors="coerce")
    price = price.replace([np.inf, -np.inf], np.nan).dropna()
    price = price[price > 0]
    price.name = "price"

    if len(price) < 20:
        raise KalmanDataError("At least 20 valid price observations are required")
    return price


def apply_kalman_filter(
    price: pd.Series,
    transition_matrix: object | None = None,
    observation_matrix: object | None = None,
    transition_covariance: object | None = None,
    observation_covariance: object | None = None,
    initial_state_mean: object | None = None,
    initial_state_covariance: object | None = None,
) -> pd.DataFrame:
    """Apply a 2-state Kalman model and return price, smoothed level, and trend."""
    clean_price = pd.to_numeric(price, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    clean_price = clean_price[clean_price > 0]
    if len(clean_price) < 20:
        raise KalmanDataError("At least 20 valid price observations are required")

    transition = _as_matrix(
        transition_matrix if transition_matrix is not None else [[1.0, 1.0], [0.0, 1.0]],
        (2, 2),
        "transition_matrix",
    )
    observation = _as_matrix(
        observation_matrix if observation_matrix is not None else [[1.0, 0.0]],
        (1, 2),
        "observation_matrix",
    )
    transition_cov = _as_matrix(
        transition_covariance if transition_covariance is not None else [[0.01, 0.0], [0.0, 0.001]],
        (2, 2),
        "transition_covariance",
    )
    observation_cov = _as_matrix(
        observation_covariance if observation_covariance is not None else [[1.0]],
        (1, 1),
        "observation_covariance",
    )
    state_mean = np.asarray(
        initial_state_mean if initial_state_mean is not None else [float(clean_price.iloc[0]), 0.0],
        dtype=float,
    )
    if state_mean.shape != (2,) or not np.isfinite(state_mean).all():
        raise KalmanDataError("initial_state_mean must have shape (2,)")
    state_cov = _as_matrix(
        initial_state_covariance if initial_state_covariance is not None else np.eye(2),
        (2, 2),
        "initial_state_covariance",
    )

    from pykalman import KalmanFilter

    kf = KalmanFilter(
        transition_matrices=transition,
        observation_matrices=observation,
        transition_covariance=transition_cov,
        observation_covariance=observation_cov,
        initial_state_mean=state_mean,
        initial_state_covariance=state_cov,
    )

    observations = clean_price.to_numpy(dtype=float).reshape(-1, 1)
    smoothed_state, _ = kf.smooth(observations)
    filtered_state, _ = kf.filter(observations)

    return pd.DataFrame(
        {
            "price": clean_price,
            "kalman_price": smoothed_state[:, 0],
            "kalman_trend": smoothed_state[:, 1],
            "filtered_price": filtered_state[:, 0],
            "filtered_trend": filtered_state[:, 1],
        },
        index=clean_price.index,
    )


def plot_kalman_result(result: pd.DataFrame) -> dict:
    """Format a Kalman result frame as a compact chart payload for the UI."""
    tail = result.tail(160)
    return {
        "dates": [idx.date().isoformat() if hasattr(idx, "date") else str(idx) for idx in tail.index],
        "price": [round(float(v), 4) for v in tail["price"]],
        "kalman_price": [round(float(v), 4) for v in tail["kalman_price"]],
        "kalman_trend": [round(float(v), 6) for v in tail["kalman_trend"]],
    }


def _compute_signal(filtered_trend: float, price: float) -> float:
    """Scale the causal trend estimate into a bounded -1..1 signal."""
    if price <= 0:
        return 0.0
    return round(float(np.tanh((filtered_trend / price) * 100.0)), 4)


def _compute_kalman(
    ticker: str,
    start: str = "2015-01-01",
    end: str | None = None,
    interval: str = "1d",
) -> dict | None:
    """Synchronous computation; run via asyncio.to_thread."""
    symbol = _validate_ticker(ticker)
    try:
        data = download_price_data(symbol, start=start, end=end, interval=interval)
        price = prepare_price_series(data)
        result = apply_kalman_filter(price)

        latest = result.iloc[-1]
        signal = _compute_signal(float(latest["filtered_trend"]), float(latest["price"]))
        trend_direction: Literal["up", "down", "flat"]
        if signal >= 0.05:
            trend_direction = "up"
        elif signal <= -0.05:
            trend_direction = "down"
        else:
            trend_direction = "flat"

        return {
            "ticker": symbol,
            "start": start,
            "end": end,
            "interval": interval,
            "latest_price": round(float(latest["price"]), 4),
            "kalman_price": round(float(latest["kalman_price"]), 4),
            "kalman_trend": round(float(latest["kalman_trend"]), 6),
            "filtered_trend": round(float(latest["filtered_trend"]), 6),
            "signal": signal,
            "trend_direction": trend_direction,
            "observations": int(len(result)),
            "chart": plot_kalman_result(result),
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        logger.exception("kalman: computation failed for %s", symbol)
        return None


async def get_kalman(
    ticker: str,
    start: str = "2015-01-01",
    end: str | None = None,
    interval: str = "1d",
) -> dict | None:
    """Return Kalman trend analysis for a ticker, from cache or freshly computed."""
    symbol = _validate_ticker(ticker)
    _validate_date(start, "start")
    _validate_date(end, "end")
    if interval not in _VALID_INTERVALS:
        raise KalmanDataError(f"interval must be one of {sorted(_VALID_INTERVALS)}")
    cache_key = f"{symbol}:{start}:{end or ''}:{interval}"
    now = time.time()
    if cache_key in _kalman_cache:
        result, expiry = _kalman_cache[cache_key]
        if now < expiry:
            return result

    async with _fetch_sem:
        result = await asyncio.to_thread(_compute_kalman, symbol, start, end, interval)

    ttl = _CACHE_TTL if result is not None else 300
    _kalman_cache[cache_key] = (result, now + ttl)
    return result


async def get_kalman_for_portfolio(tickers: list[str]) -> dict[str, dict]:
    """Return Kalman trend analysis for all tickers concurrently, dropping failures."""
    normalized = [_validate_ticker(t) for t in tickers]
    results = await asyncio.gather(*[get_kalman(t) for t in normalized])
    return {t: r for t, r in zip(normalized, results) if r is not None}
