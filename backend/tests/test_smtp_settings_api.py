import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.encryption import decrypt_key
from app.models.settings import AppSettings
from main import app


async def _register_and_token(client: AsyncClient, email: str) -> str:
    r = await client.post(
        "/auth/register",
        json={"email": email, "password": "pass1234", "name": "Test"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _set_user_role(email: str, role: UserRole) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.role = role
        await db.commit()


@pytest.mark.asyncio
async def test_smtp_settings_admin_crud_and_password_keep():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "smtp_admin@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        r0 = await client.get("/settings/smtp", headers=headers)
        assert r0.status_code == 200
        assert r0.json()["configured"] is False
        assert r0.json()["password_set"] is False

        r1 = await client.put(
            "/settings/smtp",
            json={
                "host": "smtp-relay",
                "port": 25,
                "user": "",
                "password": "secret-pass",
                "from_address": "noreply@ululuu.de",
                "start_tls": False,
            },
            headers=headers,
        )
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert body["configured"] is True
        assert body["host"] == "smtp-relay"
        assert body["port"] == 25
        assert body["from_address"] == "noreply@ululuu.de"
        assert body["start_tls"] is False
        assert body["password_set"] is True
        assert "password" not in body

        async with AsyncSessionLocal() as db:
            row = await db.get(AppSettings, 1)
            assert row is not None
            assert decrypt_key(row.smtp_password_encrypted) == "secret-pass"

        # Empty password keeps existing ciphertext
        r2 = await client.put(
            "/settings/smtp",
            json={
                "host": "smtp-relay",
                "port": 25,
                "user": "",
                "password": "",
                "from_address": "agentfloor@ululuu.de",
                "start_tls": False,
            },
            headers=headers,
        )
        assert r2.status_code == 200
        assert r2.json()["from_address"] == "agentfloor@ululuu.de"
        assert r2.json()["password_set"] is True

        async with AsyncSessionLocal() as db:
            row = await db.get(AppSettings, 1)
            assert decrypt_key(row.smtp_password_encrypted) == "secret-pass"

        r3 = await client.put(
            "/settings/smtp",
            json={
                "host": "smtp-relay",
                "port": 25,
                "user": "",
                "clear_password": True,
                "from_address": "agentfloor@ululuu.de",
                "start_tls": False,
            },
            headers=headers,
        )
        assert r3.status_code == 200
        assert r3.json()["password_set"] is False

        status = await client.get("/auth/smtp-status", headers=headers)
        assert status.status_code == 200
        assert status.json()["configured"] is True
        assert status.json()["from_address"] == "agentfloor@ululuu.de"


@pytest.mark.asyncio
async def test_smtp_settings_requires_admin():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client, "smtp_member@example.com")
        await _set_user_role("smtp_member@example.com", UserRole.member)
        headers = {"Authorization": f"Bearer {token}"}

        r_get = await client.get("/settings/smtp", headers=headers)
        assert r_get.status_code == 403

        r_put = await client.put(
            "/settings/smtp",
            json={"host": "smtp.example.com", "port": 587, "from_address": "a@b.c", "start_tls": True},
            headers=headers,
        )
        assert r_put.status_code == 403
