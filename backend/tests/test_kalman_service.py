import time
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from app.services.kalman_service import (
    KalmanDataError,
    _compute_signal,
    apply_kalman_filter,
    prepare_price_series,
)

pytestmark = pytest.mark.unit


def make_price_frame(values: list[float], column: str = "Adj Close") -> pd.DataFrame:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="B")
    return pd.DataFrame({column: values}, index=idx)


def test_prepare_price_series_prefers_adjusted_close():
    data = pd.DataFrame(
        {
            "Adj Close": [100.0, 101.0, None, np.inf, 102.0] + [103.0] * 17,
            "Close": [1.0] * 22,
        },
        index=pd.date_range("2020-01-01", periods=22, freq="B"),
    )

    price = prepare_price_series(data)

    assert price.name == "price"
    assert price.iloc[0] == pytest.approx(100.0)
    assert len(price) == 20


def test_prepare_price_series_falls_back_to_close():
    data = make_price_frame([100.0 + i for i in range(25)], column="Close")

    price = prepare_price_series(data)

    assert len(price) == 25
    assert price.iloc[-1] == pytest.approx(124.0)


def test_apply_kalman_filter_returns_required_columns():
    price = pd.Series(
        [100.0 + i * 0.5 for i in range(40)],
        index=pd.date_range("2020-01-01", periods=40, freq="B"),
        name="price",
    )

    result = apply_kalman_filter(price)

    assert list(result.columns) == [
        "price",
        "kalman_price",
        "kalman_trend",
        "filtered_price",
        "filtered_trend",
    ]
    assert len(result) == 40
    assert np.isfinite(result["kalman_price"]).all()
    assert np.isfinite(result["kalman_trend"]).all()


def test_apply_kalman_filter_rejects_bad_matrix_shape():
    price = pd.Series([100.0 + i for i in range(25)])

    with pytest.raises(KalmanDataError, match="transition_matrix"):
        apply_kalman_filter(price, transition_matrix=[[1.0]])


def test_apply_kalman_filter_rejects_insufficient_data():
    price = pd.Series([100.0 + i for i in range(10)])

    with pytest.raises(KalmanDataError, match="At least 20"):
        apply_kalman_filter(price)


def test_compute_signal_is_bounded():
    assert _compute_signal(10.0, 100.0) <= 1.0
    assert _compute_signal(-10.0, 100.0) >= -1.0
    assert _compute_signal(0.0, 100.0) == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_cache_hit_skips_recompute():
    from app.services import kalman_service

    fake_result = {"ticker": "TEST", "signal": 0.5, "trend_direction": "up"}
    kalman_service._kalman_cache["TEST:2015-01-01::1d"] = (fake_result, time.time() + 3600)

    result = await kalman_service.get_kalman("TEST")

    assert result == fake_result


@pytest.mark.asyncio
async def test_cache_miss_on_expired():
    from app.services import kalman_service

    fake_result = {"ticker": "TEST2", "signal": 0.5, "trend_direction": "up"}
    kalman_service._kalman_cache["TEST2:2015-01-01::1d"] = (fake_result, time.time() - 1)

    with patch("app.services.kalman_service._compute_kalman", return_value=None) as mock_compute:
        result = await kalman_service.get_kalman("TEST2")

    assert result is None
    mock_compute.assert_called_once_with("TEST2", "2015-01-01", None, "1d")
