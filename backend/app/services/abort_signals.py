"""Cross-process abort + job-id keys in Redis.

Used by JOB_BACKEND=procrastinate (and optionally memory) so any API replica
can signal a worker to stop a run. Keys are best-effort; missing Redis must
not crash abort/start paths when the bus is memory-only.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_ABORT_PREFIX = "af:abort:"
_JOB_PREFIX = "af:job:"
_client: Any = None


def abort_key(run_id: str) -> str:
    return f"{_ABORT_PREFIX}{run_id}"


def job_key(run_id: str) -> str:
    return f"{_JOB_PREFIX}{run_id}"


async def _client_or_none():
    """Return a shared async Redis client, or None if Redis is unavailable."""
    global _client
    if _client is not None:
        return _client
    try:
        from redis.asyncio import from_url

        client = from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        _client = client
        return _client
    except Exception:
        logger.warning("Redis unavailable for abort/job keys (url=%s)", settings.redis_url)
        return None


async def request_abort(run_id: str) -> None:
    """Mark a run for cooperative abort. TTL covers long TradingAgents runs."""
    client = await _client_or_none()
    if client is None:
        return
    ttl = max(settings.run_timeout_seconds + 300, 600)
    try:
        await client.set(abort_key(run_id), "1", ex=ttl)
    except Exception:
        logger.exception("Failed to set abort key for run %s", run_id)


async def is_aborted(run_id: str) -> bool:
    client = await _client_or_none()
    if client is None:
        return False
    try:
        return bool(await client.exists(abort_key(run_id)))
    except Exception:
        logger.exception("Failed to read abort key for run %s", run_id)
        return False


async def clear_abort(run_id: str) -> None:
    client = await _client_or_none()
    if client is None:
        return
    try:
        await client.delete(abort_key(run_id))
    except Exception:
        logger.exception("Failed to clear abort key for run %s", run_id)


async def store_job_id(run_id: str, job_id: int | str) -> None:
    client = await _client_or_none()
    if client is None:
        return
    ttl = max(settings.run_timeout_seconds + 300, 600)
    try:
        await client.set(job_key(run_id), str(job_id), ex=ttl)
    except Exception:
        logger.exception("Failed to store job id for run %s", run_id)


async def pop_job_id(run_id: str) -> int | None:
    client = await _client_or_none()
    if client is None:
        return None
    try:
        raw = await client.getdel(job_key(run_id))
        if raw is None:
            # redis < 6.2 fallback
            raw = await client.get(job_key(run_id))
            if raw is not None:
                await client.delete(job_key(run_id))
        return int(raw) if raw is not None else None
    except Exception:
        logger.exception("Failed to read job id for run %s", run_id)
        return None
