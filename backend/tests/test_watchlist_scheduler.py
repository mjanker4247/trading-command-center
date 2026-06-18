import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy import inspect

from app.routers.watchlist import _get_or_create_watchlist
from main import app


async def _register_and_login(client: AsyncClient) -> str:
    await client.post("/auth/register", json={
        "email": "scheduler@example.com",
        "password": "password123",
        "name": "Scheduler User",
    })
    login = await client.post("/auth/login", json={
        "email": "scheduler@example.com",
        "password": "password123",
    })
    return login.json()["access_token"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_or_create_watchlist_marks_new_items_loaded():
    user_id = uuid4()

    result = AsyncMock()
    result.scalar_one_or_none = lambda: None

    db = AsyncMock()
    db.execute.return_value = result
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    watchlist = await _get_or_create_watchlist(user_id, db)

    assert watchlist.created_by == user_id
    assert watchlist.items == []
    assert "items" not in inspect(watchlist).unloaded


@pytest.mark.asyncio
async def test_add_watchlist_item_rejects_invalid_cron():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.services.scheduler.reload_jobs", new=AsyncMock()):
            r = await client.post("/watchlist/items", headers=headers, json={
                "ticker": "AAPL",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-mini",
                "schedule_cron": "not-a-cron",
            })

        assert r.status_code == 422


@pytest.mark.asyncio
async def test_add_watchlist_item_normalizes_empty_cron_to_null():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.services.scheduler.reload_jobs", new=AsyncMock()) as reload_mock:
            r = await client.post("/watchlist/items", headers=headers, json={
                "ticker": "MSFT",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-mini",
                "schedule_cron": "   ",
            })

        assert r.status_code == 201
        assert r.json()["schedule_cron"] is None
        reload_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_patch_watchlist_item_validates_cron():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.services.scheduler.reload_jobs", new=AsyncMock()):
            created = await client.post("/watchlist/items", headers=headers, json={
                "ticker": "NVDA",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-mini",
                "schedule_cron": "0 9 * * 1-5",
            })
            item_id = created.json()["id"]

            bad = await client.patch(
                f"/watchlist/items/{item_id}",
                headers=headers,
                json={"schedule_cron": "bad cron"},
            )
            assert bad.status_code == 422

            with patch("app.services.scheduler.reload_jobs", new=AsyncMock()) as reload_mock:
                ok = await client.patch(
                    f"/watchlist/items/{item_id}",
                    headers=headers,
                    json={"schedule_cron": "30 8 * * 1-5"},
                )
                assert ok.status_code == 200
                assert ok.json()["schedule_cron"] == "30 8 * * 1-5"
                reload_mock.assert_awaited_once()
