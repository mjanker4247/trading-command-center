import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from main import app


async def _admin_token(client):
    await client.post("/auth/register", json={"email": "keys@test.com", "password": "password1", "name": "Keys"})
    r = await client.post("/auth/login", json={"email": "keys@test.com", "password": "password1"})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_upsert_ollama_url_marks_valid_when_server_responds(httpx_mock):
    httpx_mock.add_response(url="http://localhost:11434/api/tags", status_code=200, json={"models": []})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "ollama", "key": "http://localhost:11434"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_ollama_url_marks_invalid_when_server_down(httpx_mock):
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:11435/api/tags")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "ollama", "key": "http://localhost:11435"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_upsert_vllm_url_marks_valid_when_server_responds(httpx_mock):
    httpx_mock.add_response(url="http://localhost:8080/health", status_code=200)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "vllm", "key": "http://localhost:8080"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_vllm_url_marks_invalid_when_server_down(httpx_mock):
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:8081/health")
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:8081/v1/models")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "vllm", "key": "http://localhost:8081"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_upsert_litellm_url_marks_valid_when_server_responds(httpx_mock):
    httpx_mock.add_response(url="http://localhost:4000/health", status_code=200)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "litellm", "key": "http://localhost:4000"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_litellm_url_can_validate_via_models_fallback(httpx_mock):
    httpx_mock.add_response(url="http://localhost:4000/health", status_code=404)
    httpx_mock.add_response(url="http://localhost:4000/v1/models", status_code=200, json={"data": []})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "litellm", "key": "http://localhost:4000"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_litellm_url_marks_invalid_when_server_down(httpx_mock):
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:4001/health")
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:4001/v1/models")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "litellm", "key": "http://localhost:4001"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_upsert_finnhub_key_accepts_authorized_empty_quote(httpx_mock):
    httpx_mock.add_response(
        url="https://finnhub.io/api/v1/quote?symbol=AAPL&token=valid-finnhub",
        status_code=200,
        json={"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0},
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        with patch(
            "app.routers.api_keys.probe_capabilities",
            new=AsyncMock(return_value={"quote": {"ok": True}}),
        ):
            r = await client.post(
                "/api-keys",
                json={"provider": "finnhub", "key": "valid-finnhub"},
                headers={"Authorization": f"Bearer {token}"},
            )

    assert r.status_code == 200
    assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_fred_key_marks_valid_when_series_returns(httpx_mock):
    httpx_mock.add_response(
        url="https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=fred-valid&file_type=json",
        status_code=200,
        json={"seriess": [{"id": "GDP"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "fred", "key": "fred-valid"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["is_valid"] is True
    assert r.json()["provider"] == "fred"


@pytest.mark.asyncio
async def test_upsert_fred_key_marks_invalid_on_error_code(httpx_mock):
    httpx_mock.add_response(
        url="https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=bad-key&file_type=json",
        status_code=200,
        json={"error_code": 400, "error_message": "Bad Request.  The API key is invalid."},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "fred", "key": "bad-key"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_upsert_sec_edgar_user_agent_accepts_nonempty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "sec_edgar", "key": "AgentFloor Dev dev@example.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["is_valid"] is True
    assert r.json()["provider"] == "sec_edgar"


@pytest.mark.asyncio
async def test_upsert_alpha_vantage_key_marks_valid(httpx_mock):
    httpx_mock.add_response(
        url="https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=av-valid",
        status_code=200,
        json={"Global Quote": {"01. symbol": "IBM"}},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "alpha_vantage", "key": "av-valid"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["is_valid"] is True
