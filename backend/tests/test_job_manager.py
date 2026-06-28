import asyncio

import pytest

from app.services import job_manager

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


@pytest.fixture(autouse=True)
def reset_job_manager_state():
    job_manager._running_tasks.clear()
    job_manager._serial_task_run_ids.clear()
    job_manager._serial_task_active_run_id.clear()
    job_manager._serial_aborted_run_ids.clear()
    job_manager._serial_stop_tasks.clear()
    yield
    for task in set(job_manager._running_tasks.values()):
        task.cancel()
    job_manager._running_tasks.clear()
    job_manager._serial_task_run_ids.clear()
    job_manager._serial_task_active_run_id.clear()
    job_manager._serial_aborted_run_ids.clear()
    job_manager._serial_stop_tasks.clear()


async def test_aborting_pending_serial_run_does_not_cancel_active_run(monkeypatch):
    import app.services.trading_agent_runner as runner

    active_started = asyncio.Event()
    release_active = asyncio.Event()
    started: list[str] = []
    aborted: list[list[str]] = []

    async def fake_execute_run(run_id, config):
        started.append(run_id)
        if run_id == "active":
            active_started.set()
            await release_active.wait()

    async def fake_mark_runs_aborted(run_ids):
        aborted.append(run_ids)

    monkeypatch.setattr(runner, "execute_run", fake_execute_run)
    monkeypatch.setattr(job_manager, "_mark_runs_aborted", fake_mark_runs_aborted)

    await job_manager.start_runs_batch([
        ("active", {"llm_provider": "ollama"}),
        ("pending", {"llm_provider": "ollama"}),
    ])
    coordinator = job_manager._running_tasks["active"]
    await asyncio.wait_for(active_started.wait(), timeout=1)

    assert job_manager.abort_run("pending") is True
    await asyncio.sleep(0)
    release_active.set()
    await asyncio.wait_for(coordinator, timeout=1)

    assert started == ["active"]
    assert aborted == [["pending"]]


async def test_aborting_active_serial_run_aborts_remaining_runs(monkeypatch):
    import app.services.trading_agent_runner as runner

    active_started = asyncio.Event()
    started: list[str] = []
    aborted: list[list[str]] = []

    async def fake_execute_run(run_id, config):
        started.append(run_id)
        if run_id == "active":
            active_started.set()
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                return

    async def fake_mark_runs_aborted(run_ids):
        aborted.append(run_ids)

    monkeypatch.setattr(runner, "execute_run", fake_execute_run)
    monkeypatch.setattr(job_manager, "_mark_runs_aborted", fake_mark_runs_aborted)

    await job_manager.start_runs_batch([
        ("active", {"llm_provider": "ollama"}),
        ("pending", {"llm_provider": "ollama"}),
    ])
    coordinator = job_manager._running_tasks["active"]
    await asyncio.wait_for(active_started.wait(), timeout=1)

    assert job_manager.abort_run("active") is True
    await asyncio.wait_for(coordinator, timeout=1)

    assert started == ["active"]
    assert aborted == [["pending"]]
