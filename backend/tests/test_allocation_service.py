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
    row = result["holdings"][0]
    assert "action" in row
    assert row["action"] in {"BUY", "SELL", "HOLD"}
    assert "current_value" in row and "target_value" in row and "delta_value" in row
    assert "orders" in result


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


def test_optimize_sync_lookthrough_concentration():
    """M @ w ≤ 0.10 — direct stock + ETF top holdings cannot exceed the cap."""
    prices, latest, shares, current_w, nav = _sample_prices(n_assets=3)
    # Realistic top-holding loads (not 50%): without the constraint, min-vol may
    # put a large weight on T2 (identity A). Cap forces T2 down.
    # Rows A,B · cols T0(ETF), T1(ETF), T2(stock A)
    M = np.array(
        [
            [0.08, 0.02, 1.0],
            [0.02, 0.08, 0.0],
        ],
        dtype=float,
    )
    result = _optimize_sync(
        prices,
        latest,
        shares,
        current_w,
        nav,
        "volatility",
        0.0,
        0.4,
        {},
        lookthrough_M=M,
        max_concentration=0.10,
    )
    tickers = list(prices.columns)
    w_vec = np.array(
        [{r["ticker"]: r["target_weight"] for r in result["holdings"]}.get(t, 0.0) for t in tickers]
    )
    assert float((M @ w_vec).max()) <= 0.10 + 1e-4
    # Direct stock column (identity) cannot exceed the look-through cap
    assert w_vec[2] <= 0.10 + 1e-4
    # ETF assets may still be >10% NAV — concentration is on underlyings only
    assert w_vec[0] + w_vec[1] >= 0.80 - 1e-3


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


@pytest.mark.asyncio
async def test_optimize_holdings_with_concentration(monkeypatch):
    prices, _latest, _shares, _cw, _nav = _sample_prices(n_assets=3)
    prices = prices.rename(columns={"T0": "SPY", "T1": "QQQ", "T2": "AAPL"})

    async def fake_funds(tickers):
        return {
            "SPY": {
                "ticker": "SPY",
                "quote_type": "ETF",
                "top_holdings": [
                    {"symbol": "AAPL", "name": "Apple", "weight": 0.07},
                    {"symbol": "MSFT", "name": "Microsoft", "weight": 0.06},
                ],
                "sector_weightings": {"technology": 0.4},
            },
            "QQQ": {
                "ticker": "QQQ",
                "quote_type": "ETF",
                "top_holdings": [
                    {"symbol": "AAPL", "name": "Apple", "weight": 0.09},
                    {"symbol": "NVDA", "name": "Nvidia", "weight": 0.08},
                ],
                "sector_weightings": {"technology": 0.5},
            },
        }

    async def fake_history(tickers, lookback_days):
        cols = [c for c in prices.columns if c in tickers]
        return prices[cols], []

    monkeypatch.setattr("app.services.etf_lookthrough.fetch_funds_for_tickers", fake_funds)
    monkeypatch.setattr("app.services.allocation_service._load_price_history", fake_history)

    result = await optimize_holdings(
        [
            HoldingInput("SPY", 10, 400.0),
            HoldingInput("QQQ", 5, 350.0),
            HoldingInput("AAPL", 2, 180.0),
        ],
        objective="volatility",
        max_concentration=0.10,
    )
    assert result["mode"] == "tradable"
    assert result["lookthrough_concentration"] is True
    assert result["max_concentration"] == pytest.approx(0.10)
    assert "SPY" in (result.get("lookthrough") or {}).get("etf_tickers", [])
    # Tradable tickers only in holdings
    tickers = {r["ticker"] for r in result["holdings"]}
    assert tickers == {"SPY", "QQQ", "AAPL"}
