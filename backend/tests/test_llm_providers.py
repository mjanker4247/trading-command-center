import pytest
from sqlalchemy import text
from httpx import AsyncClient, ASGITransport
from main import app
from app.database import engine
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.encryption import encrypt_key
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


@pytest.fixture(autouse=True)
async def clear_api_keys():
    """Truncate api_keys before and after each test so provider-not-configured assertions hold."""
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE api_keys RESTART IDENTITY CASCADE"))
    yield
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE api_keys RESTART IDENTITY CASCADE"))


async def _token(client, email="lp@test.com"):
    await client.post("/auth/register", json={"email": email, "password": "password1", "name": "LP"})
    r = await client.post("/auth/login", json={"email": email, "password": "password1"})
    return r.json()["access_token"]


async def _seed_api_key(provider: str, url: str):
    """Insert an api_key row directly, bypassing admin auth."""
    async with AsyncSession(engine) as session:
        result = await session.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        assert user is not None, "_seed_api_key: no user in DB — did you call _token() first?"
        session.add(ApiKey(provider=provider, encrypted_key=encrypt_key(url), is_valid=True, created_by=user.id))
        await session.commit()


@pytest.mark.asyncio
async def test_models_404_when_provider_not_configured():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client)
        r = await client.get("/llm-providers/ollama/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_models_400_for_unknown_provider():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp2@test.com")
        r = await client.get("/llm-providers/cohere/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_ollama_models_returns_list(httpx_mock):
    httpx_mock.add_response(
        url="http://localhost:11434/api/tags",
        status_code=200,
        json={"models": [{"name": "llama3:latest"}, {"name": "mistral:7b"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp3@test.com")
        await _seed_api_key("ollama", "http://localhost:11434")
        r = await client.get("/llm-providers/ollama/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert "llama3:latest" in r.json()
        assert "mistral:7b" in r.json()


@pytest.mark.asyncio
async def test_vllm_models_returns_list(httpx_mock):
    httpx_mock.add_response(
        url="http://localhost:8080/v1/models",
        status_code=200,
        json={"data": [{"id": "mistralai/Mistral-7B-v0.1"}, {"id": "meta-llama/Llama-2-7b"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp4@test.com")
        await _seed_api_key("vllm", "http://localhost:8080")
        r = await client.get("/llm-providers/vllm/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert "mistralai/Mistral-7B-v0.1" in r.json()


@pytest.mark.asyncio
async def test_litellm_models_returns_list(httpx_mock):
    httpx_mock.add_response(
        url="http://localhost:4000/v1/models",
        status_code=200,
        json={"data": [{"id": "gpt-4o-mini"}, {"id": "openai/gpt-4o"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "litellm-models@test.com")
        await _seed_api_key("litellm", "http://localhost:4000")
        r = await client.get("/llm-providers/litellm/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert "gpt-4o-mini" in r.json()


@pytest.mark.asyncio
async def test_cloud_models_returns_seed_catalog_without_refresh():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-seed@test.com")
        r = await client.get("/llm-providers/ionos/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        models = r.json()
        assert models[0] == "openai/gpt-oss-120b"
        assert "meta-llama/Llama-3.3-70B-Instruct" in models


@pytest.mark.asyncio
async def test_refresh_ionos_models_persists_catalog(httpx_mock):
    httpx_mock.add_response(
        url="https://openai.inference.de-txl.ionos.com/v1/models",
        status_code=200,
        json={
            "data": [
                {"id": "openai/gpt-oss-120b"},
                {"id": "meta-llama/Llama-3.3-70B-Instruct"},
                {"id": "extra/model-a"},
            ]
        },
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-refresh@test.com")
        await _seed_api_key("ionos", "ion_test_key")
        r = await client.post(
            "/llm-providers/ionos/models/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "live"
        assert "extra/model-a" in body["catalog"]
        assert body["selection_required"] is False

        listed = await client.get(
            "/llm-providers/ionos/models",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert listed.status_code == 200
        assert "extra/model-a" in listed.json()


@pytest.mark.asyncio
async def test_refresh_large_catalog_seeds_visible_subset(httpx_mock):
    models = [{"id": f"model-{i}"} for i in range(25)]
    models.append({"id": "gpt-5.5"})
    httpx_mock.add_response(
        url="https://api.openai.com/v1/models",
        status_code=200,
        json={"data": models},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-large@test.com")
        await _seed_api_key("openai", "sk-test")
        r = await client.post(
            "/llm-providers/openai/models/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["selection_required"] is True
        assert len(body["catalog"]) == 26
        assert len(body["visible"]) < len(body["catalog"])
        assert body["visible"][0] == "gpt-5.5"

        listed = await client.get(
            "/llm-providers/openai/models",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert listed.json() == body["visible"]


@pytest.mark.asyncio
async def test_put_visible_models(httpx_mock):
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        status_code=200,
        json={"data": [{"id": f"m{i}"} for i in range(25)] + [{"id": "llama-3.3-70b-versatile"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-visible@test.com")
        await _seed_api_key("groq", "gsk-test")
        await client.post(
            "/llm-providers/groq/models/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        r = await client.put(
            "/llm-providers/groq/models/visible",
            headers={"Authorization": f"Bearer {token}"},
            json={"models": ["m1", "m2", "llama-3.3-70b-versatile"]},
        )
        assert r.status_code == 200
        assert r.json()["visible"][0] == "llama-3.3-70b-versatile"
        assert set(r.json()["visible"]) == {"m1", "m2", "llama-3.3-70b-versatile"}


@pytest.mark.asyncio
async def test_refresh_requires_api_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-nokey@test.com")
        r = await client.post(
            "/llm-providers/ionos/models/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_provider_defaults_returns_system_models():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp-defaults@test.com")
        r = await client.get("/llm-providers/defaults", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        assert body["default_provider"] == "openai"
        assert body["default_depth"] == "standard"
        assert body["default_models"]["openai"] == "gpt-5.5"
        assert body["default_models"]["groq"] == "llama-3.3-70b-versatile"


@pytest.mark.asyncio
async def test_models_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/llm-providers/ollama/models")
        assert r.status_code in (401, 403)
