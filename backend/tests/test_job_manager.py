"""Unit tests for abort signals and job_manager backends."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import abort_signals, job_manager

pytestmark = [pytest.mark.unit]


@pytest.mark.asyncio
async def test_request_abort_sets_redis_key(monkeypatch):
    mock_client = AsyncMock()
    mock_client.set = AsyncMock(return_value=True)

    async def fake_client():
        return mock_client

    monkeypatch.setattr(abort_signals, "_client_or_none", fake_client)
    await abort_signals.request_abort("run-1")
    mock_client.set.assert_awaited()
    assert mock_client.set.await_args.args[0] == "af:abort:run-1"


@pytest.mark.asyncio
async def test_is_aborted_true(monkeypatch):
    mock_client = AsyncMock()
    mock_client.exists = AsyncMock(return_value=1)

    async def fake_client():
        return mock_client

    monkeypatch.setattr(abort_signals, "_client_or_none", fake_client)
    assert await abort_signals.is_aborted("run-1") is True


@pytest.mark.asyncio
async def test_start_run_procrastinate_enqueues_cloud(monkeypatch):
    monkeypatch.setattr(job_manager.settings, "job_backend", "procrastinate")
    defer = AsyncMock(return_value=99)
    store = AsyncMock()
    mock_task = MagicMock()
    mock_task.defer_async = defer

    monkeypatch.setattr("app.services.job_queue.execute_trading_run", mock_task)
    monkeypatch.setattr(abort_signals, "store_job_id", store)

    await job_manager.start_run("r2", {"ticker": "AAPL", "llm_provider": "openai"})
    defer.assert_awaited_once()
    store.assert_awaited_once_with("r2", 99)


@pytest.mark.asyncio
async def test_start_run_procrastinate_uses_local_queue(monkeypatch):
    monkeypatch.setattr(job_manager.settings, "job_backend", "procrastinate")
    defer = AsyncMock(return_value=7)
    store = AsyncMock()
    mock_local = MagicMock()
    mock_local.defer_async = defer
    monkeypatch.setattr("app.services.job_queue.execute_trading_run_local", mock_local)
    monkeypatch.setattr(abort_signals, "store_job_id", store)

    await job_manager.start_run("r-local", {"ticker": "AAPL", "llm_provider": "ollama"})
    defer.assert_awaited_once()


@pytest.mark.asyncio
async def test_abort_run_signals_redis_and_cancels_job(monkeypatch):
    monkeypatch.setattr(job_manager.settings, "job_backend", "procrastinate")
    request = AsyncMock()
    pop = AsyncMock(return_value=42)
    cancel = AsyncMock(return_value=True)
    monkeypatch.setattr(abort_signals, "request_abort", request)
    monkeypatch.setattr(abort_signals, "pop_job_id", pop)

    mock_jm = MagicMock()
    mock_jm.cancel_job_by_id_async = cancel
    mock_app = MagicMock()
    mock_app.job_manager = mock_jm
    monkeypatch.setattr("app.services.job_queue.app", mock_app)

    assert await job_manager.abort_run("r3") is True
    request.assert_awaited_once_with("r3")
    cancel.assert_awaited_once_with(42, abort=True)
