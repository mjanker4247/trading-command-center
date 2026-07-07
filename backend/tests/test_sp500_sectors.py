from app.services.sp500_sectors import normalize_sector, SECTOR_LEADERS, SP500_SECTOR_WEIGHTS


def test_normalize_sector_maps_yfinance_labels():
    assert normalize_sector("Financial Services") == "Financials"
    assert normalize_sector("Consumer Cyclical") == "Consumer Discretionary"
    assert normalize_sector("Consumer Defensive") == "Consumer Staples"
    assert normalize_sector("Basic Materials") == "Materials"


def test_normalize_sector_passthrough_gics_names():
    assert normalize_sector("Technology") == "Technology"
    assert normalize_sector("Healthcare") == "Healthcare"


def test_normalized_sectors_have_sp500_weights_and_leaders():
    for alias, canonical in [
        ("Financial Services", "Financials"),
        ("Consumer Cyclical", "Consumer Discretionary"),
    ]:
        assert normalize_sector(alias) == canonical
        assert canonical in SP500_SECTOR_WEIGHTS
        assert canonical in SECTOR_LEADERS
