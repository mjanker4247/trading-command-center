from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.run import Run, RunStatus
from app.routers import auth, runs, api_keys, users, llm_providers, watchlist, portfolio, ticker, tickers, admin, market, investor_profile, regime, wave, kalman, settings as settings_router
from app.services.event_bus import start_event_subscriber, stop_event_subscriber
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # In-memory jobs die with the process; mark orphans failed.
    # When JOB_BACKEND=procrastinate, worker owns in-flight runs — skip blanket fail.
    if settings.job_backend == "memory":
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Run)
                .where(Run.status.in_([RunStatus.running, RunStatus.pending]))
                .values(status=RunStatus.failed, completed_at=datetime.now(timezone.utc))
            )
            await db.commit()
    elif settings.job_backend == "procrastinate":
        from app.services import job_queue

        await job_queue.open_app()
    await start_event_subscriber()
    if settings.scheduler_enabled:
        await start_scheduler()
    try:
        yield
    finally:
        await stop_scheduler()
        await stop_event_subscriber()
        if settings.job_backend == "procrastinate":
            from app.services import job_queue

            await job_queue.close_app()


app = FastAPI(title="AgentFloor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(runs.router, tags=["runs"])
app.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(llm_providers.router, prefix="/llm-providers", tags=["llm-providers"])
app.include_router(watchlist.router, tags=["watchlist"])
app.include_router(portfolio.router, tags=["portfolio"])
app.include_router(ticker.router, tags=["ticker"])
app.include_router(tickers.router, tags=["tickers"])
app.include_router(market.router, tags=["market"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(investor_profile.router, prefix="/investor-profile", tags=["investor-profile"])
app.include_router(regime.router, tags=["regime"])
app.include_router(wave.router, tags=["wave"])
app.include_router(kalman.router, tags=["kalman"])
app.include_router(settings_router.router, tags=["settings"])


@app.get("/health")
async def health():
    body: dict = {"status": "ok", "event_bus": settings.event_bus_backend, "job_backend": settings.job_backend}
    if settings.event_bus_backend == "redis" or settings.job_backend == "procrastinate":
        from app.services.event_bus import ping_redis

        body["redis"] = "ok" if await ping_redis() else "unavailable"
    return body
