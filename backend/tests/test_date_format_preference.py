import pytest
from httpx import AsyncClient, ASGITransport
from main import app


async def _token(client, email="date-format@test.com"):
    await client.post("/auth/register", json={"email": email, "password": "password1", "name": "Date Format"})
    r = await client.post("/auth/login", json={"email": email, "password": "password1"})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_me_includes_date_format_default():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client)
        r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["date_format"] == "iso"


@pytest.mark.asyncio
async def test_update_date_format():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "date-format2@test.com")
        headers = {"Authorization": f"Bearer {token}"}
        r = await client.patch(
            "/auth/me",
            headers=headers,
            json={"date_format": "eu"},
        )
        assert r.status_code == 200

        me = await client.get("/auth/me", headers=headers)
        assert me.json()["date_format"] == "eu"


@pytest.mark.asyncio
async def test_update_date_format_rejects_unknown():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "date-format3@test.com")
        r = await client.patch(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"date_format": "dd-mm-yy"},
        )
        assert r.status_code == 422
