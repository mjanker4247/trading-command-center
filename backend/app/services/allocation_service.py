"""Portfolio allocation via PyPortfolioOpt (mean-variance + Black-Litterman)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal, Optional

import numpy as np
import pandas as pd

from app.services.yfinance_service import fetch_history

logger = logging.getLogger(__name__)

Objective = Literal["sharpe", "volatility", "black_litterman"]

_CACHE_TTL = 14400  # 4 hours
_MAX_UNIVERSE = 40
_MIN_HISTORY_DAYS = 60
_BUY_VIEW = 0.05
_SELL_VIEW = -0.05

# portfolio_id|param_hash -> (result, expiry)
_cache: dict[str, tuple[dict, float]] = {}


@dataclass(frozen=True)
class HoldingInput:
    ticker: str
    shares: float
    current_price: Optional[float]


class AllocationError(ValueError):
    """Raised when allocation inputs or optimization fail in a user-facing way."""


def _param_hash(
    holdings: list[HoldingInput],
    objective: str,
    min_pos: float,
    max_pos: float,
    use_verdict_views: bool,
    verdicts: dict[str, str],
    lookback_days: int,
) -> str:
    payload = {
        "holdings": [(h.ticker, round(h.shares, 6), round(h.current_price or 0, 4)) for h in holdings],
        "objective": objective,
        "min_pos": min_pos,
        "max_pos": max_pos,
        "use_verdict_views": use_verdict_views,
        "verdicts": sorted(verdicts.items()),
        "lookback_days": lookback_days,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


def _weights_from_holdings(holdings: list[HoldingInput]) -> tuple[dict[str, float], float, list[str]]:
    """Return current weight fractions, NAV, and skipped tickers (no price)."""
    values: dict[str, float] = {}
    skipped: list[str] = []
    for h in holdings:
        if h.current_price is None or h.current_price <= 0 or h.shares <= 0:
            skipped.append(h.ticker)
            continue
        values[h.ticker] = h.shares * h.current_price
    nav = sum(values.values())
    if nav <= 0:
        return {}, 0.0, skipped
    weights = {t: v / nav for t, v in values.items()}
    return weights, nav, skipped


def _build_views(tickers: list[str], verdicts: dict[str, str]) -> dict[str, float]:
    views: dict[str, float] = {}
    for t in tickers:
        verdict = (verdicts.get(t) or "").lower()
        if verdict == "buy":
            views[t] = _BUY_VIEW
        elif verdict == "sell":
            views[t] = _SELL_VIEW
    return views


def _feasible_bounds(n_assets: int, min_pos: float, max_pos: float) -> tuple[float, float]:
    """Relax position caps just enough so sum(weights)=1 is feasible."""
    if n_assets < 1:
        raise AllocationError("Need at least one asset to optimize")
    lo = min_pos
    hi = max_pos
    if lo * n_assets > 1.0 + 1e-9:
        raise AllocationError(
            f"min_pos={lo} is too high for {n_assets} holdings "
            f"(need min_pos ≤ {1.0 / n_assets:.4f})"
        )
    if hi * n_assets < 1.0 - 1e-9:
        # Auto-relax: otherwise SLSQP is infeasible (common with tight max on large books)
        hi = round(min(1.0, 1.0 / n_assets + 1e-6), 6)
        logger.info("Relaxed max_pos to %s for %s assets so weights can sum to 1", hi, n_assets)
    if lo > hi:
        raise AllocationError("min_pos must be ≤ max_pos after feasibility adjustment")
    return lo, hi


def _optimize_sync(
    prices: pd.DataFrame,
    latest_prices: dict[str, float],
    current_shares: dict[str, float],
    current_weights: dict[str, float],
    nav: float,
    objective: Objective,
    min_pos: float,
    max_pos: float,
    views: dict[str, float],
) -> dict:
    from pypfopt import BlackLittermanModel, EfficientFrontier, expected_returns, risk_models
    from pypfopt.discrete_allocation import DiscreteAllocation

    mu = expected_returns.mean_historical_return(prices)
    S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
    tickers = list(prices.columns)
    lo, hi = _feasible_bounds(len(tickers), min_pos, max_pos)

    if objective == "black_litterman":
        # PyPortfolioOpt requires absolute_views (or P/Q). Empty dict = equilibrium prior only.
        # Omitting absolute_views raises: "Q must be an array or dataframe".
        bl = BlackLittermanModel(
            cov_matrix=S,
            pi="equal",
            absolute_views=views,  # may be {}
            omega="default",
        )
        posterior = bl.bl_returns()
        ef = EfficientFrontier(posterior, S, weight_bounds=(lo, hi))
        ef.max_sharpe()
    else:
        ef = EfficientFrontier(mu, S, weight_bounds=(lo, hi))
        if objective == "volatility":
            ef.min_volatility()
        else:
            ef.max_sharpe()

    cleaned = ef.clean_weights()
    ret, vol, sharpe = ef.portfolio_performance(verbose=False)

    target_weights = {t: float(cleaned.get(t, 0.0)) for t in tickers}
    # Include holdings that got zero weight
    for t in current_weights:
        target_weights.setdefault(t, 0.0)

    suggested_shares: dict[str, float] = {}
    leftover = 0.0
    try:
        price_series = pd.Series(latest_prices, dtype=float)
        da = DiscreteAllocation(cleaned, price_series, total_portfolio_value=nav)
        alloc, leftover = da.lp_portfolio()
        suggested_shares = {t: float(alloc.get(t, 0)) for t in tickers}
        for t in current_shares:
            suggested_shares.setdefault(t, 0.0)
    except Exception:
        logger.debug("DiscreteAllocation failed; falling back to continuous share targets", exc_info=True)
        for t, w in target_weights.items():
            px = latest_prices.get(t)
            if px and px > 0:
                suggested_shares[t] = round(nav * w / px, 4)
            else:
                suggested_shares[t] = 0.0

    rows = []
    for t in sorted(set(current_weights) | set(target_weights)):
        cur_w = current_weights.get(t, 0.0)
        tgt_w = target_weights.get(t, 0.0)
        cur_sh = current_shares.get(t, 0.0)
        sug_sh = suggested_shares.get(t, 0.0)
        rows.append(
            {
                "ticker": t,
                "current_weight": round(cur_w, 6),
                "target_weight": round(tgt_w, 6),
                "delta_weight": round(tgt_w - cur_w, 6),
                "current_shares": round(cur_sh, 6),
                "suggested_shares": round(sug_sh, 6),
                "share_delta": round(sug_sh - cur_sh, 6),
                "current_price": latest_prices.get(t),
            }
        )

    return {
        "objective": objective,
        "nav": round(nav, 2),
        "expected_return": round(float(ret), 6),
        "volatility": round(float(vol), 6),
        "sharpe": round(float(sharpe), 4),
        "leftover_cash": round(float(leftover), 2),
        "views_applied": sorted(views.keys()),
        "holdings": rows,
    }


async def _load_price_history(
    tickers: list[str],
    lookback_days: int,
) -> tuple[pd.DataFrame, list[str]]:
    end = date.today()
    start = end - timedelta(days=lookback_days)
    frames: dict[str, pd.Series] = {}
    skipped: list[str] = []

    async def _one(ticker: str) -> None:
        try:
            df = await fetch_history(
                ticker,
                start=start.isoformat(),
                end=end.isoformat(),
                interval="1d",
                auto_adjust=True,
            )
            if df is None or df.empty or "Close" not in df.columns:
                skipped.append(ticker)
                return
            close = df["Close"].dropna()
            if len(close) < _MIN_HISTORY_DAYS:
                skipped.append(ticker)
                return
            frames[ticker] = close
        except Exception:
            logger.debug("history fetch failed for %s", ticker, exc_info=True)
            skipped.append(ticker)

    await asyncio.gather(*[_one(t) for t in tickers])
    if len(frames) < 2:
        return pd.DataFrame(), skipped

    prices = pd.DataFrame(frames).dropna(how="any")
    if len(prices) < _MIN_HISTORY_DAYS or prices.shape[1] < 2:
        return pd.DataFrame(), skipped + [t for t in frames if t not in prices.columns]
    return prices, skipped


async def optimize_holdings(
    holdings: list[HoldingInput],
    *,
    objective: Objective = "sharpe",
    min_pos: float = 0.0,
    max_pos: float = 0.4,
    use_verdict_views: bool = False,
    verdicts: Optional[dict[str, str]] = None,
    lookback_days: int = 730,
    cache_key: Optional[str] = None,
) -> dict:
    """Optimize allocation for a list of holdings. Returns a JSON-ready dict."""
    if objective not in ("sharpe", "volatility", "black_litterman"):
        raise AllocationError("objective must be sharpe, volatility, or black_litterman")
    if not np.isfinite(min_pos) or not np.isfinite(max_pos) or min_pos < 0 or max_pos > 1 or min_pos > max_pos:
        raise AllocationError("min_pos/max_pos must satisfy 0 ≤ min_pos ≤ max_pos ≤ 1")
    if lookback_days < 90 or lookback_days > 3650:
        raise AllocationError("lookback_days must be between 90 and 3650")

    verdicts = verdicts or {}
    current_weights, nav, price_skipped = _weights_from_holdings(holdings)
    if len(current_weights) < 2:
        raise AllocationError("Need at least 2 holdings with valid prices to optimize")
    if len(current_weights) > _MAX_UNIVERSE:
        raise AllocationError(f"Universe capped at {_MAX_UNIVERSE} priced holdings")

    tickers = list(current_weights.keys())
    shares_map = {h.ticker: h.shares for h in holdings if h.ticker in current_weights}
    latest = {h.ticker: float(h.current_price) for h in holdings if h.ticker in current_weights}

    full_key = cache_key or _param_hash(
        holdings, objective, min_pos, max_pos, use_verdict_views, verdicts, lookback_days
    )
    cached = _cache.get(full_key)
    if cached and cached[1] > time.time():
        return cached[0]

    prices, hist_skipped = await _load_price_history(tickers, lookback_days)
    usable = [t for t in tickers if t in prices.columns]
    if len(usable) < 2:
        raise AllocationError("Insufficient overlapping price history for optimization")

    # Restrict to tickers with history
    prices = prices[usable]
    current_weights = {t: current_weights[t] for t in usable}
    # Re-normalize after drops
    total_w = sum(current_weights.values())
    current_weights = {t: w / total_w for t, w in current_weights.items()}
    shares_map = {t: shares_map[t] for t in usable}
    latest = {t: latest[t] for t in usable}
    nav = sum(shares_map[t] * latest[t] for t in usable)

    views: dict[str, float] = {}
    if objective == "black_litterman" and use_verdict_views:
        views = _build_views(usable, verdicts)

    try:
        result = await asyncio.to_thread(
            _optimize_sync,
            prices,
            latest,
            shares_map,
            current_weights,
            nav,
            objective,
            min_pos,
            max_pos,
            views,
        )
    except AllocationError:
        raise
    except Exception as exc:
        logger.warning("allocation optimize failed: %s", exc, exc_info=True)
        raise AllocationError(f"Optimization failed: {exc}") from exc

    skipped = sorted(set(price_skipped) | set(hist_skipped) | (set(tickers) - set(usable)))
    result["skipped"] = skipped
    result["lookback_days"] = lookback_days
    result["min_pos"] = min_pos
    result["max_pos"] = max_pos
    result["use_verdict_views"] = use_verdict_views and objective == "black_litterman"

    _cache[full_key] = (result, time.time() + _CACHE_TTL)
    return result


def clear_allocation_cache() -> None:
    _cache.clear()
