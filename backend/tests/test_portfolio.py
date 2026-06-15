import uuid
import pytest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from httpx import AsyncClient, ASGITransport
from app.services.portfolio_parser import parse_portfolio_csv

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


@pytest.mark.unit
def test_moomoo_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    assert broker == "moomoo"
    assert len(holdings) == 2  # $USD row skipped
    aapl = next(h for h in holdings if h.ticker == "AAPL")
    assert aapl.shares == 50.0
    assert aapl.avg_cost == pytest.approx(162.40)


@pytest.mark.unit
def test_moomoo_skips_cash_rows():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    tickers = [h.ticker for h in holdings]
    assert "$USD" not in tickers


@pytest.mark.unit
def test_fidelity_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("fidelity_positions.csv"))
    assert broker == "fidelity"
    assert len(holdings) == 2
    msft = next(h for h in holdings if h.ticker == "MSFT")
    assert msft.shares == 30.0
    assert msft.avg_cost == pytest.approx(295.00)


@pytest.mark.unit
def test_schwab_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("schwab_positions.csv"))
    assert broker == "schwab"
    assert len(holdings) == 2
    tsla = next(h for h in holdings if h.ticker == "TSLA")
    assert tsla.shares == 15.0
    assert tsla.avg_cost == pytest.approx(3300.0 / 15.0)


@pytest.mark.unit
def test_generic_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("generic_positions.csv"))
    assert broker == "generic"
    assert len(holdings) == 3
    nvda = next(h for h in holdings if h.ticker == "NVDA")
    assert nvda.avg_cost == pytest.approx(410.0)


@pytest.mark.unit
def test_duplicate_ticker_last_row_wins():
    csv_bytes = b"ticker,shares,avg_cost\nAAPL,50,162.40\nAAPL,75,155.00\n"
    _, holdings = parse_portfolio_csv(csv_bytes)
    assert len(holdings) == 1
    assert holdings[0].shares == 75.0


@pytest.mark.unit
def test_unknown_format_raises_422():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"foo,bar\n1,2\n")
    assert exc.value.status_code == 422


@pytest.mark.unit
def test_empty_file_raises_400():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"ticker,shares,avg_cost\n")
    assert exc.value.status_code == 400


@pytest.mark.unit
@pytest.mark.asyncio
async def test_stock_price_falls_back_to_yfinance_when_finnhub_quote_fails(httpx_mock, monkeypatch):
    from app.routers import portfolio as portfolio_router

    portfolio_router._price_cache.clear()
    httpx_mock.add_response(
        url="https://finnhub.io/api/v1/quote?symbol=AAPL&token=blocked-finnhub",
        status_code=403,
        json={"error": "You don't have access to this resource."},
    )
    fallback = AsyncMock(return_value=199.5)
    monkeypatch.setattr(portfolio_router._yf, "fetch_price", fallback)

    price = await portfolio_router._fetch_price("AAPL", "blocked-finnhub")

    assert price == pytest.approx(199.5)
    fallback.assert_awaited_once_with("AAPL")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_discover_clears_in_flight_when_no_candidates(monkeypatch):
    from app.routers import market as market_router
    from app.routers import portfolio as portfolio_router

    class FakeResult:
        def __init__(self, *, scalar=None, rows=None):
            self._scalar = scalar
            self._rows = rows or []

        def scalar_one_or_none(self):
            return self._scalar

        def scalars(self):
            return self

        def all(self):
            return self._rows

    class FakeDb:
        def __init__(self):
            self._results = [
                FakeResult(scalar=SimpleNamespace(encrypted_key="encrypted")),
                FakeResult(rows=[]),
            ]

        async def execute(self, _statement):
            return self._results.pop(0)

    portfolio_id = uuid.uuid4()
    cache_key = str(portfolio_id)
    portfolio_router._discover_cache.clear()
    portfolio_router._discover_in_flight.clear()
    market_router._quote_cache.clear()
    monkeypatch.setattr(market_router, "_trending_cache", ([], 0.0))
    monkeypatch.setattr(portfolio_router, "decrypt_key", lambda _encrypted: "api-key")
    monkeypatch.setattr(
        portfolio_router,
        "_get_latest_snapshot",
        AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4())),
    )
    monkeypatch.setattr(portfolio_router, "get_sector_gaps", AsyncMock(return_value=[]))
    call_llm = AsyncMock()
    monkeypatch.setattr(
        "app.services.portfolio_insight_runner._call_llm",
        call_llm,
    )

    response = await portfolio_router.discover_stocks(
        portfolio_id,
        {"llm_provider": "openai", "llm_model": "gpt-4o-mini"},
        FakeDb(),
        SimpleNamespace(id=uuid.uuid4()),
    )

    assert response == {"recommendations": [], "cached": False}
    assert cache_key not in portfolio_router._discover_in_flight
    call_llm.assert_not_awaited()


@pytest.mark.unit
def test_truly_empty_file_raises_400():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_sector_gaps_returns_empty_without_finnhub_key():
    """With no Finnhub key, sector-gaps returns an empty list."""
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        email = f"sg_{uuid.uuid4().hex[:8]}@test.com"
        await client.post("/auth/register", json={"email": email, "password": "password1", "name": "T"})
        r = await client.post("/auth/login", json={"email": email, "password": "password1"})
        token = r.json()["access_token"]

        rp = await client.post("/portfolio", json={"name": "Test"}, headers={"Authorization": f"Bearer {token}"})
        portfolio_id = rp.json()["id"]

        r = await client.get(
            f"/portfolio/{portfolio_id}/sector-gaps",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json() == []
