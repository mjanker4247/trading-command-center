"""Portfolio allocation via PyPortfolioOpt (mean-variance + Black-Litterman).

Optimizes **tradable** assets (direct stocks + whole ETFs). Optional look-through
concentration: build mapping matrix M from Yahoo ETF top holdings and constrain
  M @ w ≤ max_concentration
so no underlying name exceeds the limit via direct + ETF exposure (cluster risk).
"""
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
# Share delta below this (absolute) is treated as HOLD for action badges.
_HOLD_SHARE_EPS = 0.5
# Default max effective weight per underlying when look-through concentration is on.
_DEFAULT_MAX_CONCENTRATION = 0.10

# portfolio_id|param_hash -> (result, expiry)
_cache: dict[str, tuple[dict, float]] = {}


def _action_for_share_delta(share_delta: float) -> str:
    if share_delta >= _HOLD_SHARE_EPS:
        return "BUY"
    if share_delta <= -_HOLD_SHARE_EPS:
        return "SELL"
    return "HOLD"


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
    max_concentration: Optional[float],
) -> str:
    payload = {
        "holdings": [(h.ticker, round(h.shares, 6), round(h.current_price or 0, 4)) for h in holdings],
        "objective": objective,
        "min_pos": min_pos,
        "max_pos": max_pos,
        "use_verdict_views": use_verdict_views,
        "verdicts": sorted(verdicts.items()),
        "lookback_days": lookback_days,
        "max_concentration": max_concentration,
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
        hi = round(min(1.0, 1.0 / n_assets + 1e-6), 6)
        logger.info("Relaxed max_pos to %s for %s assets so weights can sum to 1", hi, n_assets)
    if lo > hi:
        raise AllocationError("min_pos must be ≤ max_pos after feasibility adjustment")
    return lo, hi


def _renorm(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        return {}
    return {t: w / total for t, w in weights.items()}


def _add_lookthrough_concentration(
    ef,
    M: np.ndarray,
    max_concentration: float,
) -> None:
    """Inject CVXPY constraint: M @ w <= max_concentration (per underlying)."""
    if M.size == 0 or max_concentration <= 0:
        return
    M_c = np.asarray(M, dtype=float)
    lim = float(max_concentration)
    # Vector inequality — DCP-compliant linear constraint on ef weights.
    ef.add_constraint(lambda w: M_c @ w <= lim)


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
    *,
    lookthrough_M: Optional[np.ndarray] = None,
    max_concentration: Optional[float] = None,
) -> dict:
    from pypfopt import BlackLittermanModel, EfficientFrontier, expected_returns, risk_models
    from pypfopt.discrete_allocation import DiscreteAllocation

    mu = expected_returns.mean_historical_return(prices)
    S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
    tickers = list(prices.columns)
    lo, hi = _feasible_bounds(len(tickers), min_pos, max_pos)
    # Look-through caps underlyings via M @ w, which often forces direct stocks
    # near 0. ETF sleeves then need room to sum to 1 — bump max_pos just enough.
    if lookthrough_M is not None and max_concentration and max_concentration > 0:
        hi = max(hi, min(1.0, 1.0 - float(max_concentration)))

    def _solve(ef: "EfficientFrontier") -> None:
        if lookthrough_M is not None and max_concentration and max_concentration > 0:
            if lookthrough_M.shape[1] != len(tickers):
                raise AllocationError(
                    f"Look-through matrix columns ({lookthrough_M.shape[1]}) "
                    f"≠ tradable assets ({len(tickers)})"
                )
            _add_lookthrough_concentration(ef, lookthrough_M, max_concentration)
        if objective == "volatility":
            ef.min_volatility()
        else:
            # max_sharpe for both sharpe and black_litterman (BL uses posterior mu)
            ef.max_sharpe()

    if objective == "black_litterman":
        bl = BlackLittermanModel(
            cov_matrix=S,
            pi="equal",
            absolute_views=views,  # may be {}
            omega="default",
        )
        posterior = bl.bl_returns()
        ef = EfficientFrontier(posterior, S, weight_bounds=(lo, hi))
    else:
        ef = EfficientFrontier(mu, S, weight_bounds=(lo, hi))

    try:
        _solve(ef)
    except Exception as exc:
        msg = str(exc).lower()
        if max_concentration and ("infeasible" in msg or "solver" in msg or "optimal" in msg):
            raise AllocationError(
                f"Optimization infeasible with look-through concentration "
                f"max_concentration={max_concentration:.0%}. Relax the limit or "
                f"reduce overlapping ETF exposure."
            ) from exc
        raise

    cleaned = ef.clean_weights()
    ret, vol, sharpe = ef.portfolio_performance(verbose=False)

    target_weights = {t: float(cleaned.get(t, 0.0)) for t in tickers}
    for t in current_weights:
        target_weights.setdefault(t, 0.0)

    suggested_shares: dict[str, float] = {}
    leftover = 0.0
    discrete_method = "continuous_fallback"
    try:
        positive = {t: w for t, w in cleaned.items() if w and w > 0}
        price_series = pd.Series(
            {t: latest_prices[t] for t in positive if t in latest_prices and latest_prices[t] > 0},
            dtype=float,
        )
        da = DiscreteAllocation(positive, price_series, total_portfolio_value=nav)
        try:
            alloc, leftover = da.lp_portfolio()
            discrete_method = "lp"
        except Exception:
            alloc, leftover = da.greedy_portfolio()
            discrete_method = "greedy"
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
        tgt_sh = suggested_shares.get(t, 0.0)
        px = latest_prices.get(t)
        cur_val = round(cur_sh * px, 2) if px else None
        tgt_val = round(tgt_sh * px, 2) if px else None
        share_delta = round(tgt_sh - cur_sh, 6)
        delta_w = round(tgt_w - cur_w, 6)
        delta_value = (
            round((tgt_val - cur_val), 2)
            if cur_val is not None and tgt_val is not None
            else None
        )
        rows.append(
            {
                "ticker": t,
                "current_price": px,
                "current_shares": round(cur_sh, 6),
                "current_value": cur_val,
                "current_weight": round(cur_w, 6),
                "target_shares": round(tgt_sh, 6),
                "target_value": tgt_val,
                "target_weight": round(tgt_w, 6),
                "delta_weight": delta_w,
                "delta_value": delta_value,
                "share_delta": share_delta,
                "suggested_shares": round(tgt_sh, 6),
                "action": _action_for_share_delta(share_delta),
            }
        )

    orders = sorted(
        [r for r in rows if r["action"] != "HOLD"],
        key=lambda r: (-abs(r["delta_value"] or 0), r["ticker"]),
    )

    return {
        "objective": objective,
        "nav": round(nav, 2),
        "expected_return": round(float(ret), 6),
        "volatility": round(float(vol), 6),
        "sharpe": round(float(sharpe), 4),
        "leftover_cash": round(float(leftover), 2),
        "discrete_method": discrete_method,
        "views_applied": sorted(views.keys()),
        "holdings": rows,
        "orders": orders,
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
    max_concentration: Optional[float] = _DEFAULT_MAX_CONCENTRATION,
    cache_key: Optional[str] = None,
) -> dict:
    """Optimize allocation for tradable holdings. Returns a JSON-ready dict.

    ``max_concentration``: max effective look-through weight per underlying
    (direct + inside ETFs). ``None`` or ``<= 0`` disables the constraint.
    """
    if objective not in ("sharpe", "volatility", "black_litterman"):
        raise AllocationError("objective must be sharpe, volatility, or black_litterman")
    if not np.isfinite(min_pos) or not np.isfinite(max_pos) or min_pos < 0 or max_pos > 1 or min_pos > max_pos:
        raise AllocationError("min_pos/max_pos must satisfy 0 ≤ min_pos ≤ max_pos ≤ 1")
    if lookback_days < 90 or lookback_days > 3650:
        raise AllocationError("lookback_days must be between 90 and 3650")
    if max_concentration is not None and (
        not np.isfinite(max_concentration) or max_concentration > 1
    ):
        raise AllocationError("max_concentration must be None or in (0, 1]")

    conc = None if max_concentration is None or max_concentration <= 0 else float(max_concentration)

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
        holdings,
        objective,
        min_pos,
        max_pos,
        use_verdict_views,
        verdicts,
        lookback_days,
        conc,
    )
    cached = _cache.get(full_key)
    if cached and cached[1] > time.time():
        return cached[0]

    prices, hist_skipped = await _load_price_history(tickers, lookback_days)
    usable = [t for t in tickers if t in prices.columns]
    if len(usable) < 2:
        raise AllocationError("Insufficient overlapping price history for optimization")

    # Keep column order stable for M ↔ w alignment
    prices = prices[usable]
    current_weights = _renorm({t: current_weights[t] for t in usable})
    shares_map = {t: shares_map[t] for t in usable}
    latest = {t: latest[t] for t in usable}
    nav = sum(shares_map[t] * latest[t] for t in usable)

    views: dict[str, float] = {}
    use_verdict_views_effective = use_verdict_views and objective == "black_litterman"
    if use_verdict_views_effective:
        views = _build_views(usable, verdicts)

    from app.services.etf_lookthrough import (
        build_lookthrough_delta,
        build_lookthrough_matrix,
        fetch_funds_for_tickers,
    )

    fund_data = await fetch_funds_for_tickers(usable)
    lookthrough_M: Optional[np.ndarray] = None
    matrix_meta: dict = {}
    if conc is not None and fund_data:
        lookthrough_M, _const_syms, matrix_meta = build_lookthrough_matrix(usable, fund_data)
        if lookthrough_M.size == 0:
            lookthrough_M = None

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
            lookthrough_M=lookthrough_M,
            max_concentration=conc if lookthrough_M is not None else None,
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
    result["use_verdict_views"] = bool(use_verdict_views_effective)
    result["mode"] = "tradable"
    result["max_concentration"] = conc
    result["lookthrough_concentration"] = bool(conc is not None and lookthrough_M is not None)

    tgt_w = {r["ticker"]: r["target_weight"] for r in result["holdings"]}
    try:
        result["lookthrough"] = build_lookthrough_delta(
            current_weights,
            tgt_w,
            fund_data,
            concentration_limit=conc,
        )
    except Exception:
        logger.debug("ETF look-through skipped", exc_info=True)
        result["lookthrough"] = {
            "etf_tickers": sorted(fund_data.keys()),
            "note": "Look-through unavailable.",
            "constituents": [],
            "sectors": [],
            "concentration_limit": conc,
        }

    etfs = matrix_meta.get("etf_tickers") or sorted(fund_data.keys())
    if result["lookthrough_concentration"]:
        result["note"] = (
            f"Look-through concentration active: each underlying ≤ {conc:.0%} effective weight "
            f"(direct + ETF top holdings). Trades remain in ETF/stock units. "
            f"ETFs mapped: {', '.join(etfs) if etfs else 'none'}."
        )
    else:
        result["note"] = (
            "Look-through concentration off — optimized on tradable assets only; "
            "exposure panel is reporting-only."
            if not fund_data
            else None
        )

    _cache[full_key] = (result, time.time() + _CACHE_TTL)
    return result


def clear_allocation_cache() -> None:
    _cache.clear()
