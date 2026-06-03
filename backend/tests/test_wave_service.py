"""Unit tests for wave service helpers (no yfinance)."""

from app.services.wave_service import _to_summary


def test_to_summary_extracts_overview_fields() -> None:
    payload = {
        "overview": {
            "top_scenario": "impulse/long",
            "top_direction": "long",
            "warnings": ["low data"],
            "trade_region": None,
        },
        "top_scenarios": [
            {
                "pattern": "impulse",
                "trend": "long",
                "score": 80.0,
                "invalidation_level": 140.5,
            }
        ],
        "trade_regions": [
            {
                "direction": "long",
                "zone_low": 170.0,
                "zone_high": 175.0,
                "confidence": 66.0,
            }
        ],
    }
    summary = _to_summary(payload, "aapl")
    assert summary["ticker"] == "AAPL"
    assert summary["top_scenario"] == "impulse/long"
    assert summary["top_direction"] == "long"
    assert summary["pattern"] == "impulse"
    assert summary["zone_low"] == 170.0
    assert summary["confidence"] == 66.0
    assert summary["warnings"] == ["low data"]
