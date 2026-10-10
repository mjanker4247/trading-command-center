"""Unit tests for allocation_service (no live Yahoo)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.allocation_service import (
    AllocationError,
    HoldingInput,
    _build_views,
    _optimize_sync,
    _weights_from_holdings,
    clear_allocation_cache,
    optimize_holdings,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_allocation_cache()
    yield
    clear_allocation_cache()


def test_weights_from_holdings():
    holdings = [
        HoldingInput("AAPL", 10, 100.0),
        HoldingInput("MSFT", 5, 200.0),
        HoldingInput("BAD", 1, None),
    ]
    weights, nav, skipped = _weights_from_holdings(holdings)
    assert nav == pytest.approx(2000.0)
    assert weights["AAPL"] == pytest.approx(0.5)
    assert weights["MSFT"] == pytest.approx(0.5)
    assert skipped == ["BAD"]


def test_build_views_from_verdicts():
    views = _build_views(["AAPL", "MSFT", "GOOG"], {"AAPL": "buy", "MSFT": "sell", "GOOG": "hold"})
    assert views == {"AAPL": 0.05, "MSFT": -0.05}


def _sample_prices(n_assets: int = 3, seed: int = 42) -> tuple[pd.DataFrame, dict, dict, dict, float]:
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2022-01-01", periods=252)
    cols = [f"T{i}" for i in range(n_assets)]
    rets = rng.normal(0.0005, 0.01, size=(len(idx), n_assets))
    prices = pd.DataFrame(100 * np.exp(np.cumsum(rets, axis=0)), index=idx, columns=cols)
    latest = {t: float(prices[t].iloc[-1]) for t in cols}
    shares = {t: 10.0 for t in cols}
    nav = sum(shares[t] * latest[t] for t in cols)
    current_w = {t: shares[t] * latest[t] / nav for t in cols}
    return prices, latest, shares, current_w, nav


def test_optimize_sync_sharpe():
    prices, latest, shares, current_w, nav = _sample_prices()
    result = _optimize_sync(prices, latest, shares, current_w, nav, "sharpe", 0.0, 0.4, {})
    assert result["objective"] == "sharpe"
    assert abs(sum(r["target_weight"] for r in result["holdings"]) - 1.0) < 0.02
    assert result["sharpe"] is not None


def test_optimize_sync_black_litterman_without_views():
    """Regression: omitting absolute_views crashes with 'Q must be an array or dataframe'."""
    prices, latest, shares, current_w, nav = _sample_prices()
    result = _optimize_sync(
        prices, latest, shares, current_w, nav, "black_litterman", 0.0, 0.4, {}
    )
    assert result["objective"] == "black_litterman"
    assert abs(sum(r["target_weight"] for r in result["holdings"]) - 1.0) < 0.02
    assert result["views_applied"] == []


def test_optimize_sync_black_litterman_with_views():
    prices, latest, shares, current_w, nav = _sample_prices()
    views = {"T0": 0.05, "T1": -0.05}
    result = _optimize_sync(
        prices, latest, shares, current_w, nav, "black_litterman", 0.0, 0.4, views
    )
    assert result["views_applied"] == ["T0", "T1"]
    assert abs(sum(r["target_weight"] for r in result["holdings"]) - 1.0) < 0.02


@pytest.mark.asyncio
async def test_optimize_holdings_rejects_small_universe():
    with pytest.raises(AllocationError, match="at least 2"):
        await optimize_holdings(
            [HoldingInput("AAPL", 1, 100.0)],
            objective="sharpe",
        )


@pytest.mark.asyncio
async def test_optimize_holdings_rejects_bad_bounds():
    with pytest.raises(AllocationError, match="min_pos"):
        await optimize_holdings(
            [
                HoldingInput("AAPL", 1, 100.0),
                HoldingInput("MSFT", 1, 100.0),
            ],
            min_pos=0.5,
            max_pos=0.2,
        )
