"""Durable job worker entrypoint (Procrastinate).

Usage (compose):
  python -m app.worker
"""
from __future__ import annotations

import asyncio
import logging
import os

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("app.worker")


async def _main() -> None:
    # Ensure job backend is procrastinate for this process even if env forgot.
    os.environ.setdefault("JOB_BACKEND", "procrastinate")

    from app.services import job_queue

    queues = ["runs", "runs_local", "insights", "delivery"]
    await job_queue.open_app()
    try:
        logger.info("Worker listening on queues=%s", queues)
        await job_queue.app.run_worker_async(
            queues=queues,
            install_signal_handlers=True,
        )
    finally:
        await job_queue.close_app()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
