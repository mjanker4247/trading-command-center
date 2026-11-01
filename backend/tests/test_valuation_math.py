"""Unit tests for valuation corridor pure math."""

import pytest

from app.services.valuation_math import (
    align_daily_to_periods,
    cagr,
    fair_value_series,
    median,
    multiple_at,
    pick_lookback_years,
    trailing_median_multiple_series,
)

pytestmark = pytest.mark.unit


def test_median_odd_even_and_empty():
    assert median([]) is None
    assert median([3.0]) == pytest.approx(3.0)
    assert median([1.0, 3.0, 2.0]) == pytest.approx(2.0)
    assert median([1.0, 2.0, 3.0, 4.0]) == pytest.approx(2.5)


def test_cagr_basic_and_guards():
    assert cagr(100.0, 121.0, 2.0) == pytest.approx(0.1)
    assert cagr(100.0, 100.0, 5.0) == pytest.approx(0.0)
    assert cagr(0.0, 100.0, 5.0) is None
    assert cagr(100.0, 200.0, 0.0) is None


def test_multiple_at_rejects_non_positive():
    assert multiple_at(100.0, 5.0) == pytest.approx(20.0)
    assert multiple_at(100.0, 0.0) is None
    assert multiple_at(-10.0, 5.0) is None


def test_trailing_median_multiple_no_lookahead():
    periods = ["2019-12-31", "2020-12-31", "2021-12-31", "2022-12-31"]
    # Constant metric 1.0 → multiple == price
    metric = {p: 1.0 for p in periods}
    price = {
        "2019-12-31": 10.0,
        "2020-12-31": 20.0,
        "2021-12-31": 30.0,
        "2022-12-31": 40.0,
    }
    medians = trailing_median_multiple_series(periods, price, metric, lookback=2)
    # 2019: only 10 → 10
    assert medians["2019-12-31"] == pytest.approx(10.0)
    # 2020: median(10, 20) → 15
    assert medians["2020-12-31"] == pytest.approx(15.0)
    # 2021: median(20, 30) → 25 (2019 dropped)
    assert medians["2021-12-31"] == pytest.approx(25.0)
    # 2022: median(30, 40) → 35
    assert medians["2022-12-31"] == pytest.approx(35.0)


def test_fair_value_series():
    metric = {"2020": 2.0, "2021": 4.0}
    med = {"2020": 10.0, "2021": None}
    fair = fair_value_series(metric, med)
    assert fair["2020"] == pytest.approx(20.0)
    assert fair["2021"] is None


def test_align_daily_to_periods():
    daily = [
        ("2020-12-30", 99.0),
        ("2020-12-31", 100.0),
        ("2021-06-15", 110.0),
        ("2021-12-31", 120.0),
    ]
    aligned = align_daily_to_periods(["2020-12-31", "2021-12-31"], daily)
    assert aligned["2020-12-31"] == pytest.approx(100.0)
    assert aligned["2021-12-31"] == pytest.approx(120.0)


def test_pick_lookback_years():
    assert pick_lookback_years(4) == [3]
    assert pick_lookback_years(10) == [3, 5, 10]
    assert pick_lookback_years(2) == []
