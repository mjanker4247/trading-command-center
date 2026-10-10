"""API tests for portfolio optimize endpoints and settings flag."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import AsyncSessionLocal
from app.models.portfolio import PortfolioHolding, PortfolioSnapshot
from main import app


async def _register_and_token(client: AsyncClient, email: str) -> str:
    r = await client.post(
        "/auth/register",
        json={"email": email, "password": "pass1234", "name": "Test"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _create_portfolio_with_holdings(
    client: AsyncClient, token: str, tickers: list[str]
) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post("/portfolio", json={"name": "Alloc Test"}, headers=headers)
    assert r.status_code == 200, r.text
    portfolio_id = r.json()["id"]

    async with AsyncSessionLocal() as db:
        snap = PortfolioSnapshot(
            portfolio_id=portfolio_id,
            row_count=len(tickers),
        )
        db.add(snap)
        await db.flush()
        for t in tickers:
            db.add(
                PortfolioHolding(
                    snapshot_id=snap.id,
                    ticker=t,
                    shares=10.0,
                    avg_cost=100.0,
                    currency="USD",
                )
            )
        await db.commit()
    return portfolio_id


@pytest.mark.asyncio
async def test_optimize_disabled_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "alloc_off@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.put(
            "/settings",
            json={
                "observation_covariance": 0.1,
                "transition_covariance": 0.01,
                "processing_mode": "causal",
                "enable_kalman_filter": True,
                "enable_elliott_wave": True,
                "enable_markov_regime": True,
                "enable_portfolio_optimizer": False,
            },
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["enable_portfolio_optimizer"] is False

        pid = await _create_portfolio_with_holdings(client, token, ["AAPL", "MSFT"])
        r2 = await client.get(f"/portfolio/{pid}/optimize", headers=headers)
        assert r2.status_code == 404
        assert "disabled" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_optimize_endpoint_returns_payload():
    fake_result = {
        "objective": "sharpe",
        "nav": 2000.0,
        "expected_return": 0.12,
        "volatility": 0.18,
        "sharpe": 0.67,
        "leftover_cash": 0.0,
        "views_applied": [],
        "holdings": [
            {
                "ticker": "AAPL",
                "current_weight": 0.5,
                "target_weight": 0.6,
                "delta_weight": 0.1,
                "current_shares": 10,
                "suggested_shares": 12,
                "share_delta": 2,
                "current_price": 100.0,
            },
            {
                "ticker": "MSFT",
                "current_weight": 0.5,
                "target_weight": 0.4,
                "delta_weight": -0.1,
                "current_shares": 10,
                "suggested_shares": 8,
                "share_delta": -2,
                "current_price": 100.0,
            },
        ],
        "skipped": [],
        "lookback_days": 730,
        "min_pos": 0.0,
        "max_pos": 1.0,
        "use_verdict_views": False,
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "alloc_ok@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        pid = await _create_portfolio_with_holdings(client, token, ["AAPL", "MSFT"])

        with patch(
            "app.routers.portfolio.optimize_holdings",
            new=AsyncMock(return_value=fake_result),
        ), patch(
            "app.routers.portfolio._fetch_prices_bulk",
            new=AsyncMock(
                return_value={
                    "AAPL": type("Q", (), {"amount": 100.0, "currency_code": "USD"})(),
                    "MSFT": type("Q", (), {"amount": 100.0, "currency_code": "USD"})(),
                }
            ),
        ):
            r = await client.post(
                f"/portfolio/{pid}/optimize",
                json={"objective": "sharpe", "min_pos": 0.0, "max_pos": 0.5},
                headers=headers,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["objective"] == "sharpe"
        assert len(body["holdings"]) == 2


@pytest.mark.asyncio
async def test_settings_include_optimizer_flag_default_true():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "alloc_settings@example.com")
        r = await client.get("/settings", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["enable_portfolio_optimizer"] is True
