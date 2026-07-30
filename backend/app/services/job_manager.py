"""Start / abort analysis runs — memory (in-process) or Procrastinate (durable)."""
from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.services.llm_provider_registry import LOCAL_PROVIDER_IDS

logger = logging.getLogger(__name__)

_running_tasks: dict[str, asyncio.Task] = {}


async def start_run(run_id: str, config: dict) -> None:
    if settings.job_backend == "procrastinate":
        await _enqueue_run(run_id, config)
        return

    from app.services.trading_agent_runner import execute_run

    task = asyncio.create_task(execute_run(run_id, config))
    _running_tasks[run_id] = task
    task.add_done_callback(lambda _: _running_tasks.pop(run_id, None))


async def _enqueue_run(run_id: str, config: dict) -> None:
    from app.services import abort_signals, job_queue

    provider = config.get("llm_provider", "")
    task = (
        job_queue.execute_trading_run_local
        if provider in LOCAL_PROVIDER_IDS
        else job_queue.execute_trading_run
    )
    job_id = await task.defer_async(run_id=run_id, config=config)
    await abort_signals.store_job_id(run_id, job_id)
    logger.info("Enqueued run %s as procrastinate job %s (provider=%s)", run_id, job_id, provider)


async def _serial_coordinator(items: list[tuple[str, dict]]) -> None:
    """Execute a list of runs one at a time, stopping the batch on cancellation."""
    from app.services.trading_agent_runner import execute_run

    try:
        for run_id, config in items:
            try:
                await execute_run(run_id, config)
            except Exception:
                pass  # execute_run sets its own failed/aborted status
            _running_tasks.pop(run_id, None)
    finally:
        for run_id, _ in items:
            _running_tasks.pop(run_id, None)


async def start_runs_batch(items: list[tuple[str, dict]]) -> None:
    """Start a batch of runs.

    Local providers (Ollama, vLLM, LiteLLM) run serially so they don't exhaust
    limited local resources.  Cloud providers run in parallel as before.
    """
    if not items:
        return

    if settings.job_backend == "procrastinate":
        # Local queue uses lock=local_llm for serialisation across workers.
        for run_id, config in items:
            await _enqueue_run(run_id, config)
        return

    provider = items[0][1].get("llm_provider", "")
    if provider in LOCAL_PROVIDER_IDS:
        coordinator = asyncio.create_task(_serial_coordinator(items))
        for run_id, _ in items:
            _running_tasks[run_id] = coordinator
    else:
        for run_id, config in items:
            await start_run(run_id, config)


async def abort_run(run_id: str) -> bool:
    """Request abort. Returns True if a local task was cancelled and/or a durable abort was signaled."""
    from app.services import abort_signals

    await abort_signals.request_abort(run_id)

    cancelled_local = False
    task = _running_tasks.get(run_id)
    if task and not task.done():
        task.cancel()
        cancelled_local = True

    cancelled_remote = False
    if settings.job_backend == "procrastinate":
        job_id = await abort_signals.pop_job_id(run_id)
        if job_id is not None:
            try:
                from app.services import job_queue

                cancelled_remote = await job_queue.app.job_manager.cancel_job_by_id_async(
                    job_id, abort=True
                )
            except Exception:
                logger.exception("Failed to cancel procrastinate job %s for run %s", job_id, run_id)

    return cancelled_local or cancelled_remote or True  # abort key alone still counts as signaled


def is_running(run_id: str) -> bool:
    return run_id in _running_tasks
