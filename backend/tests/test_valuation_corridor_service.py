"""Unit tests for valuation corridor assembly (mocked I/O)."""

from unittest.mock import AsyncMock, patch

import pandas as pd
import pytest

from app.services.valuation_corridor_service import (
    clear_valuation_cache,
    get_valuation_corridor,
)

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_valuation_cache()
    yield
    clear_valuation_cache()


@pytest.mark.asyncio
async def test_get_valuation_corridor_builds_eps_fair_series():
    fundamentals = {
        "source": "yfinance",
        "eps": {
            "2019-09-30": 3.0,
            "2020-09-30": 3.5,
            "2021-09-30": 4.0,
            "2022-09-30": 5.0,
            "2023-09-30": 6.0,
        },
        "ocfps": {},
        "fcfps": {},
        "salesps": {},
        "estimates": {"source": "yfinance", "forward_eps": [], "growth": 0.08},
        "info": {"currency": "USD", "currentPrice": 180.0, "trailingPE": 30.0},
    }
    # Daily closes around each fiscal year-end
    idx = pd.to_datetime(
        ["2019-09-30", "2020-09-30", "2021-09-30", "2022-09-30", "2023-09-30", "2024-01-02"]
    )
    history = pd.DataFrame(
        {"Close": [90.0, 105.0, 120.0, 150.0, 180.0, 182.0]},
        index=idx,
    )

    with (
        patch(
            "app.services.valuation_corridor_service._sync_fetch_fundamentals",
            return_value=fundamentals,
        ),
        patch(
            "app.services.valuation_corridor_service.fetch_history_period",
            new=AsyncMock(return_value=history),
        ),
    ):
        payload = await get_valuation_corridor("AAPL", lookback=3)

    assert payload is not None
    assert payload["ticker"] == "AAPL"
    assert payload["source"] == "yfinance"
    assert payload["summary"]["price"] == pytest.approx(180.0)
    assert payload["corridors"]["eps"]["median_multiple"] is not None
    assert len(payload["series"]["fair_eps"]) >= 3
    assert payload["pricedIn"]["growth"]["consensusCagr"] == pytest.approx(0.08)


@pytest.mark.asyncio
async def test_get_valuation_corridor_returns_none_when_too_short():
    fundamentals = {
        "source": "yfinance",
        "eps": {"2022-12-31": 1.0, "2023-12-31": 2.0},
        "ocfps": {},
        "fcfps": {},
        "salesps": {},
        "estimates": {"source": "none", "forward_eps": [], "growth": None},
        "info": {},
    }
    history = pd.DataFrame(
        {"Close": [10.0, 12.0]},
        index=pd.to_datetime(["2022-12-31", "2023-12-31"]),
    )
    with (
        patch(
            "app.services.valuation_corridor_service._sync_fetch_fundamentals",
            return_value=fundamentals,
        ),
        patch(
            "app.services.valuation_corridor_service.fetch_history_period",
            new=AsyncMock(return_value=history),
        ),
    ):
        payload = await get_valuation_corridor("ZZZZ", lookback=5)

    assert payload is None
