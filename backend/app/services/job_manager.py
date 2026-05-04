import asyncio

_running_tasks: dict[str, asyncio.Task] = {}


async def start_run(run_id: str, config: dict) -> None:
    from app.services.trading_agent_runner import execute_run
    task = asyncio.create_task(execute_run(run_id, config))
    _running_tasks[run_id] = task
    task.add_done_callback(lambda _: _running_tasks.pop(run_id, None))


def abort_run(run_id: str) -> bool:
    task = _running_tasks.get(run_id)
    if task and not task.done():
        task.cancel()
        return True
    return False


def is_running(run_id: str) -> bool:
    return run_id in _running_tasks
