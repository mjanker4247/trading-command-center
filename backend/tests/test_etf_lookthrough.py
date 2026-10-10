"""Unit tests for ETF look-through aggregation and mapping matrix (no live Yahoo)."""
import numpy as np
import pytest

from app.services.etf_lookthrough import (
    aggregate_lookthrough,
    build_lookthrough_delta,
    build_lookthrough_matrix,
)


def test_aggregate_direct_equity_passthrough():
    const, sectors = aggregate_lookthrough(
        {"AAPL": 0.6, "MSFT": 0.4},
        {},
    )
    by_sym = {r["symbol"]: r["weight"] for r in const}
    assert by_sym["AAPL"] == 0.6
    assert by_sym["MSFT"] == 0.4
    assert sectors == []


def test_aggregate_etf_top_holdings():
    fund_data = {
        "SPY": {
            "top_holdings": [
                {"symbol": "AAPL", "name": "Apple", "weight": 0.07},
                {"symbol": "MSFT", "name": "Microsoft", "weight": 0.06},
            ],
            "sector_weightings": {"technology": 0.4, "healthcare": 0.12},
        }
    }
    const, sectors = aggregate_lookthrough({"SPY": 1.0}, fund_data)
    by_sym = {r["symbol"]: r["weight"] for r in const}
    assert abs(by_sym["AAPL"] - 0.07) < 1e-9
    assert abs(by_sym["MSFT"] - 0.06) < 1e-9
    by_sec = {r["sector"]: r["weight"] for r in sectors}
    assert abs(by_sec["technology"] - 0.4) < 1e-9


def test_build_lookthrough_matrix_identity_and_etf():
    fund_data = {
        "SPY": {
            "top_holdings": [
                {"symbol": "AAPL", "name": "Apple", "weight": 0.10},
                {"symbol": "MSFT", "name": "Microsoft", "weight": 0.08},
            ],
            "sector_weightings": {},
        }
    }
    assets = ["SPY", "AAPL"]
    M, symbols, meta = build_lookthrough_matrix(assets, fund_data)
    assert meta["etf_tickers"] == ["SPY"]
    assert M.shape[1] == 2
    spy_col = {symbols[i]: M[i, 0] for i in range(len(symbols))}
    assert spy_col["AAPL"] == pytest.approx(0.10)
    assert spy_col["MSFT"] == pytest.approx(0.08)
    aapl_col = {symbols[i]: M[i, 1] for i in range(len(symbols))}
    assert aapl_col["AAPL"] == pytest.approx(1.0)
    # Effective AAPL with w=[0.5, 0.5] = 0.5*0.10 + 0.5*1.0 = 0.55
    eff = M @ np.array([0.5, 0.5])
    assert eff[symbols.index("AAPL")] == pytest.approx(0.55)


def test_build_lookthrough_delta():
    fund_data = {
        "SPY": {
            "top_holdings": [{"symbol": "AAPL", "name": "Apple", "weight": 0.10}],
            "sector_weightings": {"technology": 0.5},
        }
    }
    out = build_lookthrough_delta(
        {"SPY": 0.5, "MSFT": 0.5},
        {"SPY": 0.8, "MSFT": 0.2},
        fund_data,
        concentration_limit=0.10,
    )
    assert "SPY" in out["etf_tickers"]
    aapl = next(r for r in out["constituents"] if r["symbol"] == "AAPL")
    assert abs(aapl["current_weight"] - 0.05) < 1e-9
    assert abs(aapl["target_weight"] - 0.08) < 1e-9
    assert abs(aapl["delta_weight"] - 0.03) < 1e-9
    assert out["concentration_limit"] == 0.10
