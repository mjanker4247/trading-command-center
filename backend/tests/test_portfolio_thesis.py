import json
import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from main import app
from app.schemas.money import PriceQuote

FIXTURES_DIR = Path(__file__).parent / "fixtures"

MOCK_LLM_RESPONSE = json.dumps({
    "alignment_score": 4,
    "thesis_summary": "Bearish on tech, bullish on commodities.",
    "aligned_positions": [],
    "misaligned_positions": [{"ticker": "NVDA", "reason": "Heavy tech — contradicts thesis"}],
    "missing_exposure": ["Commodities", "Energy"],
    "excess_exposure": ["Technology"],
    "recommendations": [{"action": "TRIM", "ticker": "NVDA", "rationale": "Reduce tech per thesis"}],
    "summary": "Your portfolio significantly misaligns with this bearish-tech thesis.",
})


async def _register_and_token(client: AsyncClient, email: str) -> str:
    r = await client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Test"})
    return r.json()["access_token"]


async def _create_portfolio_with_holding(client: AsyncClient, token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post("/portfolio", json={"name": "Test Portfolio"}, headers=headers)
    assert r.status_code == 200
    portfolio_id = r.json()["id"]
    with open(FIXTURES_DIR / "generic_positions.csv", "rb") as f:
        r2 = await client.post(
            f"/portfolio/{portfolio_id}/upload",
            files={"file": ("positions.csv", f, "text/csv")},
            headers=headers,
        )
    assert r2.status_code == 200
    return portfolio_id


@pytest.mark.asyncio
async def test_thesis_crossref_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(
            "/portfolio/00000000-0000-0000-0000-000000000001/thesis-crossref",
            json={"thesis_text": "x" * 60, "llm_provider": "openai", "llm_model": "gpt-4o-mini"},
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_thesis_crossref_validates_text_length():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "thesislen@example.com")
        r = await c.post("/portfolio", json={"name": "P"}, headers={"Authorization": f"Bearer {token}"})
        pid = r.json()["id"]
        r2 = await c.post(
            f"/portfolio/{pid}/thesis-crossref",
            json={"thesis_text": "too short", "llm_provider": "openai", "llm_model": "gpt-4o-mini"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 422


@pytest.mark.asyncio
async def test_thesis_crossref_happy_path():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "thesishappy@example.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        with patch(
            "app.services.portfolio_thesis_runner._call_llm",
            new=AsyncMock(return_value=MOCK_LLM_RESPONSE),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/thesis-crossref",
                json={
                    "thesis_text": "Bearish on technology sector due to rising interest rates. " * 5,
                    "llm_provider": "openai",
                    "llm_model": "gpt-4o-mini",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["alignment_score"] == 4
        assert data["thesis_summary"] == "Bearish on tech, bullish on commodities."
        assert len(data["misaligned_positions"]) == 1
        assert data["misaligned_positions"][0]["ticker"] == "NVDA"
        assert data["missing_exposure"] == ["Commodities", "Energy"]
        assert data["id"] is not None
        assert data["portfolio_id"] == portfolio_id


@pytest.mark.asyncio
async def test_list_thesis_crossrefs():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "thesislist@example.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.services.portfolio_thesis_runner._call_llm", new=AsyncMock(return_value=MOCK_LLM_RESPONSE)):
            await c.post(
                f"/portfolio/{portfolio_id}/thesis-crossref",
                json={"thesis_text": "Bearish on tech and rate-sensitive sectors. " * 4, "llm_provider": "openai", "llm_model": "gpt-4o-mini"},
                headers=headers,
            )

        r = await c.get(f"/portfolio/{portfolio_id}/thesis-crossrefs", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["alignment_score"] == 4


@pytest.mark.asyncio
async def test_delete_thesis_crossref():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "thesisdel@example.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.services.portfolio_thesis_runner._call_llm", new=AsyncMock(return_value=MOCK_LLM_RESPONSE)):
            r_create = await c.post(
                f"/portfolio/{portfolio_id}/thesis-crossref",
                json={"thesis_text": "Bullish on energy and commodities cycle. " * 4, "llm_provider": "openai", "llm_model": "gpt-4o-mini"},
                headers=headers,
            )
        crossref_id = r_create.json()["id"]

        r_del = await c.delete(f"/portfolio/{portfolio_id}/thesis-crossrefs/{crossref_id}", headers=headers)
        assert r_del.status_code == 204

        r_list = await c.get(f"/portfolio/{portfolio_id}/thesis-crossrefs", headers=headers)
        assert r_list.json() == []


@pytest.mark.asyncio
async def test_thesis_prompt_totals_exclude_non_preferred_currency_holdings():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "thesiscurrency@example.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        headers = {"Authorization": f"Bearer {token}"}
        add_response = await c.post(
            f"/portfolio/{portfolio_id}/holdings",
            json={"ticker": "SAP.DE", "shares": 10, "avg_cost": 100, "currency": "EUR"},
            headers=headers,
        )
        assert add_response.status_code == 201

        price_map = {
            "AAPL": PriceQuote(amount=200.0, currency="USD"),
            "NVDA": PriceQuote(amount=400.0, currency="USD"),
            "TSLA": PriceQuote(amount=220.0, currency="USD"),
            "SAP.DE": PriceQuote(amount=100.0, currency="EUR"),
        }
        sectors = {
            "AAPL": "Technology",
            "NVDA": "Semiconductors",
            "TSLA": "Automotive",
            "SAP.DE": "Software",
        }
        captured_prompt: list[str] = []

        async def _capture(provider, model, api_key, prompt):
            captured_prompt.append(prompt)
            return MOCK_LLM_RESPONSE

        with (
            patch("app.routers.portfolio._fetch_prices_bulk", new=AsyncMock(return_value=price_map)),
            patch(
                "app.services.portfolio_thesis_runner._fetch_sector",
                new=AsyncMock(side_effect=lambda ticker, key: sectors[ticker]),
            ),
            patch(
                "app.services.portfolio_thesis_runner._call_llm",
                new=AsyncMock(side_effect=_capture),
            ),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/thesis-crossref",
                json={
                    "thesis_text": "Bearish on technology sector due to rising interest rates. " * 5,
                    "llm_provider": "openai",
                    "llm_model": "gpt-4o-mini",
                },
                headers=headers,
            )

    assert r.status_code == 200
    assert len(captured_prompt) == 1
    prompt = captured_prompt[0]
    assert "Total market value: USD 21,300.00" in prompt
    assert "SAP.DE | sector: Software | price: EUR 100.00 | value: EUR 1,000.00 | weight: N/A" in prompt
    assert "\n  - Software:" not in prompt
