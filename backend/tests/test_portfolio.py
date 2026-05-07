import pytest
from pathlib import Path
from app.services.portfolio_parser import parse_portfolio_csv

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_moomoo_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    assert broker == "moomoo"
    assert len(holdings) == 2  # $USD row skipped
    aapl = next(h for h in holdings if h.ticker == "AAPL")
    assert aapl.shares == 50.0
    assert aapl.avg_cost == pytest.approx(162.40)


def test_moomoo_skips_cash_rows():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    tickers = [h.ticker for h in holdings]
    assert "$USD" not in tickers


def test_fidelity_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("fidelity_positions.csv"))
    assert broker == "fidelity"
    assert len(holdings) == 2
    msft = next(h for h in holdings if h.ticker == "MSFT")
    assert msft.shares == 30.0
    assert msft.avg_cost == pytest.approx(295.00)


def test_schwab_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("schwab_positions.csv"))
    assert broker == "schwab"
    assert len(holdings) == 2
    tsla = next(h for h in holdings if h.ticker == "TSLA")
    assert tsla.shares == 15.0
    assert tsla.avg_cost == pytest.approx(3300.0 / 15.0)


def test_generic_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("generic_positions.csv"))
    assert broker == "generic"
    assert len(holdings) == 3
    nvda = next(h for h in holdings if h.ticker == "NVDA")
    assert nvda.avg_cost == pytest.approx(410.0)


def test_duplicate_ticker_last_row_wins():
    csv_bytes = b"ticker,shares,avg_cost\nAAPL,50,162.40\nAAPL,75,155.00\n"
    _, holdings = parse_portfolio_csv(csv_bytes)
    assert len(holdings) == 1
    assert holdings[0].shares == 75.0


def test_unknown_format_raises_422():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"foo,bar\n1,2\n")
    assert exc.value.status_code == 422


def test_empty_file_raises_400():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"ticker,shares,avg_cost\n")
    assert exc.value.status_code == 400


def test_truly_empty_file_raises_400():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"")
    assert exc.value.status_code == 400
