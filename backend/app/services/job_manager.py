import asyncio
from datetime import datetime, timezone
from uuid import UUID

from app.services.llm_provider_registry import LOCAL_PROVIDER_IDS

_running_tasks: dict[str, asyncio.Task] = {}
_serial_task_run_ids: dict[asyncio.Task, set[str]] = {}
_serial_task_active_run_id: dict[asyncio.Task, str] = {}
_serial_aborted_run_ids: set[str] = set()
_serial_stop_tasks: set[asyncio.Task] = set()


async def start_run(run_id: str, config: dict) -> None:
    from app.services.trading_agent_runner import execute_run
    task = asyncio.create_task(execute_run(run_id, config))
    _running_tasks[run_id] = task
    task.add_done_callback(lambda _: _running_tasks.pop(run_id, None))


async def _mark_runs_aborted(run_ids: list[str]) -> None:
    if not run_ids:
        return

    from sqlalchemy import update

    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus

    ids = [UUID(run_id) for run_id in run_ids]
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Run)
            .where(
                Run.id.in_(ids),
                Run.status.in_([RunStatus.pending, RunStatus.running]),
            )
            .values(status=RunStatus.aborted, completed_at=datetime.now(timezone.utc))
        )
        await db.commit()


async def _abort_serial_runs(run_ids: list[str]) -> None:
    unfinished = [run_id for run_id in run_ids if run_id in _running_tasks]
    if not unfinished:
        return
    await _mark_runs_aborted(unfinished)
    for run_id in unfinished:
        _running_tasks.pop(run_id, None)
        _serial_aborted_run_ids.discard(run_id)


async def _serial_coordinator(items: list[tuple[str, dict]]) -> None:
    """Execute a list of runs one at a time, stopping the batch on cancellation."""
    from app.services.trading_agent_runner import execute_run
    coordinator = asyncio.current_task()
    try:
        for idx, (run_id, config) in enumerate(items):
            if run_id in _serial_aborted_run_ids:
                _running_tasks.pop(run_id, None)
                _serial_aborted_run_ids.discard(run_id)
                continue
            if coordinator:
                _serial_task_active_run_id[coordinator] = run_id
            try:
                await execute_run(run_id, config)
            except asyncio.CancelledError:
                remaining = [pending_id for pending_id, _ in items[idx:]]
                await _abort_serial_runs(remaining)
                raise
            except Exception:
                pass  # execute_run sets its own failed/aborted status
            finally:
                if coordinator:
                    _serial_task_active_run_id.pop(coordinator, None)
                _running_tasks.pop(run_id, None)
            if coordinator in _serial_stop_tasks or (coordinator and coordinator.cancelling()):
                remaining = [pending_id for pending_id, _ in items[idx + 1:]]
                await _abort_serial_runs(remaining)
                break
    finally:
        # On cancellation (or normal finish) clean up any not-yet-started entries.
        for run_id, _ in items:
            _running_tasks.pop(run_id, None)
            _serial_aborted_run_ids.discard(run_id)
        if coordinator:
            _serial_task_run_ids.pop(coordinator, None)
            _serial_task_active_run_id.pop(coordinator, None)
            _serial_stop_tasks.discard(coordinator)


async def start_runs_batch(items: list[tuple[str, dict]]) -> None:
    """Start a batch of runs.

    Local providers (Ollama, vLLM, LiteLLM) run serially so they don't exhaust
    limited local resources.  Cloud providers run in parallel as before.
    """
    if not items:
        return
    provider = items[0][1].get("llm_provider", "")
    if provider in LOCAL_PROVIDER_IDS:
        coordinator = asyncio.create_task(_serial_coordinator(items))
        _serial_task_run_ids[coordinator] = {run_id for run_id, _ in items}
        for run_id, _ in items:
            _running_tasks[run_id] = coordinator
    else:
        for run_id, config in items:
            await start_run(run_id, config)


def abort_run(run_id: str) -> bool:
    task = _running_tasks.get(run_id)
    if task and not task.done():
        if task in _serial_task_run_ids:
            active_run_id = _serial_task_active_run_id.get(task)
            if active_run_id == run_id:
                _serial_stop_tasks.add(task)
                task.cancel()
            else:
                _serial_aborted_run_ids.add(run_id)
                _running_tasks.pop(run_id, None)
                asyncio.create_task(_mark_runs_aborted([run_id]))
            return True
        task.cancel()
        return True
    return False


def is_running(run_id: str) -> bool:
    return run_id in _running_tasks
