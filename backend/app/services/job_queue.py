"""Procrastinate app + trading-run tasks (Postgres-backed durable queue)."""
from __future__ import annotations

import logging

import procrastinate

from app.config import settings

logger = logging.getLogger(__name__)


def _psycopg_conninfo() -> str:
    """Convert SQLAlchemy URL to a psycopg conninfo string."""
    url = settings.database_url
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url.removeprefix("postgresql+asyncpg://")
    if url.startswith("postgres+asyncpg://"):
        return "postgresql://" + url.removeprefix("postgres+asyncpg://")
    return url


app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(conninfo=_psycopg_conninfo()),
    import_paths=[],
)


@app.task(name="app.execute_trading_run", queue="runs", pass_context=True)
async def execute_trading_run(context: procrastinate.JobContext, run_id: str, config: dict) -> None:
    await _run_trading_job(context, run_id, config)


@app.task(
    name="app.execute_trading_run_local",
    queue="runs_local",
    pass_context=True,
    lock="local_llm",
)
async def execute_trading_run_local(
    context: procrastinate.JobContext, run_id: str, config: dict
) -> None:
    """Serialised via lock=local_llm so Ollama/vLLM/LiteLLM are not overloaded."""
    await _run_trading_job(context, run_id, config)


async def _run_trading_job(context: procrastinate.JobContext, run_id: str, config: dict) -> None:
    from procrastinate.exceptions import JobAborted

    from app.services.abort_signals import clear_abort, is_aborted
    from app.services.trading_agent_runner import execute_run

    if context.should_abort() or await is_aborted(run_id):
        await clear_abort(run_id)
        raise JobAborted()

    async def abort_check() -> bool:
        return context.should_abort() or await is_aborted(run_id)

    try:
        await execute_run(run_id, config, abort_check=abort_check)
    finally:
        await clear_abort(run_id)

    if context.should_abort() or await is_aborted(run_id):
        raise JobAborted()


async def open_app() -> None:
    """Open the connector and ensure Procrastinate schema exists."""
    await app.open_async()
    await app.schema_manager.apply_schema_async()
    logger.info("Procrastinate app open (schema applied)")


async def close_app() -> None:
    await app.close_async()
