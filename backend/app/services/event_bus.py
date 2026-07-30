"""Run-event fanout for live WebSocket clients.

Backends:
- memory: publish calls the local WebSocketManager (single-process default / tests)
- redis: PUBLISH to af:run:{run_id}; API lifespan subscriber relays to local sockets
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "af:run:"
PATTERN = f"{CHANNEL_PREFIX}*"

_subscriber_task: asyncio.Task | None = None
_redis_client: Any = None
_pubsub: Any = None
_publish_client: Any = None
_publish_lock = asyncio.Lock()


def run_channel(run_id: str) -> str:
    return f"{CHANNEL_PREFIX}{run_id}"


def _run_id_from_channel(channel: str) -> str | None:
    if not channel.startswith(CHANNEL_PREFIX):
        return None
    run_id = channel[len(CHANNEL_PREFIX) :]
    return run_id or None


async def publish_run_event(run_id: str, payload: dict) -> None:
    """Fan out a run event to live listeners (local WS and/or other API replicas)."""
    if settings.event_bus_backend == "redis":
        await _publish_redis(run_id, payload)
        return
    await _publish_memory(run_id, payload)


async def _publish_memory(run_id: str, payload: dict) -> None:
    from app.services.websocket_manager import ws_manager

    await ws_manager.broadcast(run_id, payload)


async def _get_publish_client():
    global _publish_client
    if _publish_client is not None:
        return _publish_client
    async with _publish_lock:
        if _publish_client is not None:
            return _publish_client
        from redis.asyncio import from_url

        _publish_client = from_url(settings.redis_url, decode_responses=True)
        return _publish_client


async def _publish_redis(run_id: str, payload: dict) -> None:
    try:
        client = await _get_publish_client()
        await client.publish(run_channel(run_id), json.dumps(payload))
    except Exception:
        logger.exception("Failed to publish run event to Redis for run %s", run_id)
        # Drop sticky client so the next publish reconnects after a Redis blip.
        global _publish_client
        stale = _publish_client
        _publish_client = None
        if stale is not None:
            try:
                await stale.aclose()
            except Exception:
                pass


async def _relay_to_local_sockets(run_id: str, payload: dict) -> None:
    from app.services.websocket_manager import ws_manager

    await ws_manager.broadcast(run_id, payload)


async def _redis_subscriber_loop() -> None:
    """psubscribe af:run:* and forward messages to this process's WebSocketManager."""
    global _redis_client, _pubsub
    from redis.asyncio import from_url

    _redis_client = from_url(settings.redis_url, decode_responses=True)
    _pubsub = _redis_client.pubsub()
    await _pubsub.psubscribe(PATTERN)
    logger.info("Event bus Redis subscriber started (%s)", PATTERN)
    try:
        while True:
            message = await _pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=1.0,
            )
            if message is None:
                await asyncio.sleep(0.01)
                continue
            if message.get("type") not in ("pmessage", "message"):
                continue
            channel = message.get("channel") or ""
            if isinstance(channel, bytes):
                channel = channel.decode()
            run_id = _run_id_from_channel(channel)
            if not run_id:
                continue
            data = message.get("data")
            try:
                payload = json.loads(data) if isinstance(data, str) else data
                if not isinstance(payload, dict):
                    continue
                await _relay_to_local_sockets(run_id, payload)
            except Exception:
                logger.exception("Failed to relay Redis run event for channel %s", channel)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Event bus Redis subscriber crashed")
    finally:
        try:
            if _pubsub is not None:
                await _pubsub.punsubscribe(PATTERN)
                await _pubsub.aclose()
        except Exception:
            logger.exception("Error closing Redis pubsub")
        try:
            if _redis_client is not None:
                await _redis_client.aclose()
        except Exception:
            logger.exception("Error closing Redis client")
        _pubsub = None
        _redis_client = None


async def start_event_subscriber() -> None:
    """Start the Redis→WS relay when EVENT_BUS_BACKEND=redis. No-op for memory."""
    global _subscriber_task
    if settings.event_bus_backend != "redis":
        return
    if _subscriber_task and not _subscriber_task.done():
        return
    # Warm publish client early so the first token does not pay connect latency.
    try:
        await _get_publish_client()
    except Exception:
        logger.exception("Failed to connect Redis publish client at startup")
    _subscriber_task = asyncio.create_task(
        _redis_subscriber_loop(),
        name="event-bus-redis-subscriber",
    )


async def stop_event_subscriber() -> None:
    global _subscriber_task, _publish_client
    task = _subscriber_task
    _subscriber_task = None
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    client = _publish_client
    _publish_client = None
    if client is not None:
        try:
            await client.aclose()
        except Exception:
            logger.exception("Error closing Redis publish client")


async def ping_redis() -> bool:
    """Return True if Redis responds to PING (used by /health when redis-backed)."""
    try:
        client = await _get_publish_client()
        return (await client.ping()) is True
    except Exception:
        return False
