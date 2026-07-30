"""Unit tests for the run-event bus (memory backend + channel helpers)."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import event_bus
from app.services.event_bus import (
    _run_id_from_channel,
    publish_run_event,
    run_channel,
    start_event_subscriber,
    stop_event_subscriber,
)

pytestmark = [pytest.mark.unit]


def test_run_channel_helpers():
    assert run_channel("abc") == "af:run:abc"
    assert _run_id_from_channel("af:run:abc") == "abc"
    assert _run_id_from_channel("af:run:") is None
    assert _run_id_from_channel("other") is None


@pytest.mark.asyncio
async def test_memory_publish_broadcasts_to_ws_manager(monkeypatch):
    monkeypatch.setattr(event_bus.settings, "event_bus_backend", "memory")
    mock_broadcast = AsyncMock()
    with patch("app.services.websocket_manager.ws_manager.broadcast", mock_broadcast):
        await publish_run_event("run-1", {"type": "token", "token": "x"})
    mock_broadcast.assert_awaited_once_with("run-1", {"type": "token", "token": "x"})


@pytest.mark.asyncio
async def test_start_subscriber_noop_for_memory(monkeypatch):
    monkeypatch.setattr(event_bus.settings, "event_bus_backend", "memory")
    await start_event_subscriber()
    assert event_bus._subscriber_task is None
    await stop_event_subscriber()


@pytest.mark.asyncio
async def test_redis_publish_uses_channel(monkeypatch):
    monkeypatch.setattr(event_bus.settings, "event_bus_backend", "redis")
    monkeypatch.setattr(event_bus.settings, "redis_url", "redis://localhost:6379/0")

    mock_client = AsyncMock()
    mock_client.publish = AsyncMock(return_value=1)
    mock_client.aclose = AsyncMock()

    event_bus._publish_client = None
    try:
        with patch("redis.asyncio.from_url", return_value=mock_client):
            await publish_run_event("run-42", {"type": "started", "agent": "trader"})

        mock_client.publish.assert_awaited_once()
        channel, raw = mock_client.publish.await_args.args
        assert channel == "af:run:run-42"
        assert '"started"' in raw
    finally:
        event_bus._publish_client = None
