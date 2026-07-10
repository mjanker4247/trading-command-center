import json
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch, AsyncMock
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from main import app
from app.database import AsyncSessionLocal
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.encryption import encrypt_key
from app.services.llm_selection import pick_llm_for_user

FIXTURES_DIR = Path(__file__).parent / "fixtures"

MOCK_RECOMMENDATIONS = json.dumps([
    {"ticker": "XYZ", "tag": "Trending", "sector": "", "reason": "Strong momentum today."},
])


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


@contextmanager
def _market_patches():
    import app.routers.market as market_module

    with (
        patch.object(market_module, "_get_trending_tickers", new=AsyncMock(return_value=["XYZ"])),
        patch.object(market_module, "get_big_mover_tickers", new=AsyncMock(return_value=[])),
    ):
        yield


@pytest.mark.asyncio
async def test_pick_llm_for_user_prefers_user_default():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "discover-default@test.com")
        headers = {"Authorization": f"Bearer {token}"}
        await client.patch(
            "/auth/me",
            headers=headers,
            json={"default_llm_provider": "anthropic", "default_llm_model": "claude-sonnet-4-6"},
        )

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == "discover-default@test.com"))).scalar_one()
        db.add(ApiKey(provider="openai", encrypted_key=encrypt_key("sk-openai"), is_valid=True, created_by=user.id))
        db.add(ApiKey(provider="anthropic", encrypted_key=encrypt_key("sk-anthropic"), is_valid=True, created_by=user.id))
        await db.commit()

        picked = await pick_llm_for_user(db, user)
        assert picked == ("anthropic", "claude-sonnet-4-6")


@pytest.mark.asyncio
async def test_discover_rejects_unknown_provider():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-badprov@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        r = await c.post(
            f"/portfolio/{portfolio_id}/discover",
            json={"llm_provider": "cohere", "llm_model": "command-r"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_discover_uses_request_llm_provider():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-prov@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        captured: list[tuple[str, str]] = []

        async def _capture(provider, model, api_key, prompt):
            captured.append((provider, model))
            return MOCK_RECOMMENDATIONS

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(side_effect=_capture)),
            _market_patches(),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={"llm_provider": "groq", "llm_model": "llama-3.3-70b-versatile"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        assert captured
        assert captured[0] == ("groq", "llama-3.3-70b-versatile")


@pytest.mark.asyncio
async def test_discover_passes_response_language_to_prompt():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-lang@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        captured_prompts: list[str] = []

        async def _capture(provider, model, api_key, prompt):
            captured_prompts.append(prompt)
            return MOCK_RECOMMENDATIONS

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(side_effect=_capture)),
            _market_patches(),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={
                    "llm_provider": "openai",
                    "llm_model": "gpt-4o-mini",
                    "response_language": "ja-JP",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        assert captured_prompts
        assert "Japanese" in captured_prompts[0]


@pytest.mark.asyncio
async def test_discover_fetches_api_key_for_requested_provider():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-vllm-key@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        requested_providers: list[str] = []

        async def _get_key(provider, db):
            requested_providers.append(provider)
            return "http://localhost:8080"

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(side_effect=_get_key)),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(return_value=MOCK_RECOMMENDATIONS)),
            _market_patches(),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={"llm_provider": "vllm", "llm_model": "meta-llama/Llama-3.1-8B-Instruct"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        assert requested_providers == ["vllm"]


@pytest.mark.asyncio
async def test_discover_fetches_trending_when_cache_cold():
    import app.routers.market as market_module

    market_module._trending_cache = ([], 0.0)
    trending_called = {"n": 0}

    async def _trending(client):
        trending_called["n"] += 1
        return ["XYZ"]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-cold@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(return_value=MOCK_RECOMMENDATIONS)),
            patch.object(market_module, "_get_trending_tickers", new=AsyncMock(side_effect=_trending)),
            patch.object(market_module, "get_big_mover_tickers", new=AsyncMock(return_value=[])),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={"llm_provider": "openai", "llm_model": "gpt-4o-mini"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        assert trending_called["n"] == 1
        assert r.json()["recommendations"][0]["ticker"] == "XYZ"


@pytest.mark.asyncio
async def test_discover_force_refresh_bypasses_cache():
    import app.routers.portfolio as portfolio_module

    portfolio_module._discover_cache.clear()
    llm_calls = {"n": 0}

    async def _llm(*_a, **_k):
        llm_calls["n"] += 1
        return MOCK_RECOMMENDATIONS

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-refresh@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        body = {"llm_provider": "openai", "llm_model": "gpt-4o-mini"}
        headers = {"Authorization": f"Bearer {token}"}

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(side_effect=_llm)),
            _market_patches(),
        ):
            r1 = await c.post(f"/portfolio/{portfolio_id}/discover", json=body, headers=headers)
            r2 = await c.post(f"/portfolio/{portfolio_id}/discover", json=body, headers=headers)
            r3 = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={**body, "force_refresh": True},
                headers=headers,
            )

        assert r1.status_code == 200
        assert r1.json()["cached"] is False
        assert r2.status_code == 200
        assert r2.json()["cached"] is True
        assert r3.status_code == 200
        assert r3.json()["cached"] is False
        assert llm_calls["n"] == 2


@pytest.mark.asyncio
async def test_discover_falls_back_when_llm_returns_empty_array():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-llm-empty@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(return_value="[]")),
            _market_patches(),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={"llm_provider": "openai", "llm_model": "gpt-4o-mini"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["candidate_count"] > 0
        assert len(data["recommendations"]) >= 4
        assert all(r["ticker"] and r["tag"] for r in data["recommendations"])


@pytest.mark.asyncio
async def test_discover_returns_empty_reason_when_no_candidates():
    import app.routers.market as market_module
    import app.routers.portfolio as portfolio_module

    portfolio_module._discover_cache.clear()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-empty@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch.object(market_module, "_get_trending_tickers", new=AsyncMock(return_value=[])),
            patch.object(market_module, "get_big_mover_tickers", new=AsyncMock(return_value=[])),
            patch.object(market_module, "MARKET_UNIVERSE", ["AAPL", "NVDA", "TSLA"]),
            patch("app.routers.portfolio.get_sector_gaps", new=AsyncMock(return_value=[])),
        ):
            r = await c.post(
                f"/portfolio/{portfolio_id}/discover",
                json={"llm_provider": "openai", "llm_model": "gpt-4o-mini"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["recommendations"] == []
        assert data["empty_reason"] == "no_candidates"
        assert data["candidate_count"] == 0


@pytest.mark.asyncio
async def test_discover_clears_in_flight_when_market_fetch_fails():
    import app.routers.market as market_module
    import app.routers.portfolio as portfolio_module

    portfolio_module._discover_cache.clear()
    portfolio_module._discover_in_flight.clear()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token = await _register_and_token(c, "discover-market-fails@test.com")
        portfolio_id = await _create_portfolio_with_holding(c, token)
        body = {"llm_provider": "openai", "llm_model": "gpt-4o-mini"}
        headers = {"Authorization": f"Bearer {token}"}

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch.object(market_module, "_get_trending_tickers", new=AsyncMock(side_effect=RuntimeError("market down"))),
            patch.object(market_module, "get_big_mover_tickers", new=AsyncMock(return_value=[])),
        ):
            with pytest.raises(RuntimeError, match="market down"):
                await c.post(f"/portfolio/{portfolio_id}/discover", json=body, headers=headers)

        cache_key = f"{portfolio_id}:openai:gpt-4o-mini:en-US"
        assert cache_key not in portfolio_module._discover_in_flight

        with (
            patch("app.services.portfolio_insight_runner._get_api_key", new=AsyncMock(return_value="sk-test")),
            patch("app.services.portfolio_insight_runner._call_llm", new=AsyncMock(return_value=MOCK_RECOMMENDATIONS)),
            _market_patches(),
        ):
            r = await c.post(f"/portfolio/{portfolio_id}/discover", json=body, headers=headers)

        assert r.status_code == 200
        data = r.json()
        assert data["cached"] is False
        assert data["recommendations"][0]["ticker"] == "XYZ"
