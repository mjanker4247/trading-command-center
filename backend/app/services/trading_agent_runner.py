import asyncio
import os
from queue import Queue as SyncQueue
from datetime import datetime, timezone

from app.services.tauric_live_progress import LiveProgressTracker
from app.services.tauric_run_adapter import (
    build_ta_config,
    extract_decision_text,
    extract_risk_assessment,
    map_rating_to_verdict,
    parse_prices_from_state,
    resolve_provider_runtime,
    state_to_raw_report,
)

# Serializes env-var patching so concurrent local-inference runs don't race on os.environ.
_env_fallback_lock = asyncio.Lock()


async def _get_stored_key(provider: str) -> str | None:
    """Return the decrypted stored API key for any provider, or None."""
    keys = await _get_stored_keys([provider])
    return keys.get(provider)


async def _get_stored_keys(providers: list[str]) -> dict[str, str]:
    """Return decrypted keys for the given provider ids (missing/undecryptable omitted)."""
    if not providers:
        return {}
    from app.database import AsyncSessionLocal
    from app.models.api_key import ApiKey
    from app.services.encryption import decrypt_key
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(ApiKey).where(ApiKey.provider.in_(providers)))
        ).scalars().all()
    out: dict[str, str] = {}
    for row in rows:
        plain = decrypt_key(row.encrypted_key)
        if plain:
            out[row.provider] = plain
    return out


async def _data_vendor_env_patch() -> dict[str, str]:
    """Build env vars for TradingAgents data vendors from Settings-stored keys."""
    from app.utils.data_providers import DATA_PROVIDER_ENV

    stored = await _get_stored_keys(list(DATA_PROVIDER_ENV))
    return {
        env_var: stored[provider]
        for provider, env_var in DATA_PROVIDER_ENV.items()
        if provider in stored
    }


def _run_graph_streaming(
    graph,
    *,
    ticker: str,
    analysis_date: str,
    asset_type: str,
    emit,
) -> tuple[dict, str]:
    """Run Tauric ``stream_run`` and emit AgentFloor live events from state chunks.

    Mirrors TradingAgents CLI live path: create_run_state → stream_run →
    record_decision. Callbacks alone do not surface LangGraph node progress
    for nested analyst subgraphs, so pipeline WS events come from state deltas.
    """
    from tradingagents.agents.rating import run_rating

    tracker = LiveProgressTracker(list(graph.selected_analysts), emit)
    tracker.on_run_start()

    init_state = graph.create_run_state(ticker, analysis_date, asset_type)
    args = graph.propagator.get_graph_args()
    final_state: dict = {}

    for messages, chunk in graph.stream_run(graph.checkpoint_input(init_state), **args):
        if messages:
            tracker.on_messages(messages)
        if chunk is not None:
            tracker.on_chunk(chunk if isinstance(chunk, dict) else None)
            if isinstance(chunk, dict):
                final_state.update(chunk)

    graph.record_decision(ticker, analysis_date, final_state)
    graph.clear_checkpoint_on_success(ticker, analysis_date, asset_type)
    return final_state, run_rating(final_state)


async def execute_run(run_id: str, config: dict) -> None:
    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus, RunVerdict
    from app.models.agent_event import AgentEvent, EventType
    from app.models.report import Report
    from app.services.websocket_manager import ws_manager
    from app.utils.asset_type import is_crypto as _is_crypto
    from app.utils.response_language import normalize_response_language
    from app.utils.tradingagents_analysts import normalize_analysts

    sync_q: SyncQueue = SyncQueue()
    async_q: asyncio.Queue = asyncio.Queue()
    sequence = [0]

    async def _drain():
        while True:
            await asyncio.sleep(0.05)
            while not sync_q.empty():
                await async_q.put(sync_q.get_nowait())

    async def _process():
        while True:
            event = await async_q.get()
            if event is None:
                break
            await ws_manager.broadcast(run_id, event)
            # Token events are streamed live; skip persisting them to avoid
            # thousands of rows per run. Full output lives in Report.raw_report.
            if event.get("type") == "token":
                continue
            sequence[0] += 1
            event["sequence"] = sequence[0]
            async with AsyncSessionLocal() as db:
                db.add(AgentEvent(
                    run_id=run_id,
                    agent_name=event.get("agent", ""),
                    event_type=EventType(event["type"]),
                    payload=event,
                    sequence=sequence[0],
                ))
                await db.commit()

    async def _set_status(status: RunStatus, verdict: RunVerdict | None = None):
        async with AsyncSessionLocal() as db:
            run = await db.get(Run, run_id)
            run.status = status
            if verdict:
                run.verdict = verdict
            if status == RunStatus.running:
                run.started_at = datetime.now(timezone.utc)
            elif status in (RunStatus.completed, RunStatus.aborted, RunStatus.failed):
                run.completed_at = datetime.now(timezone.utc)
            await db.commit()

    def _emit(event: dict) -> None:
        sync_q.put_nowait(event)

    await _set_status(RunStatus.running)
    drain_task = asyncio.create_task(_drain())
    process_task = asyncio.create_task(_process())

    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        # IONOS / Llama often emit tool calls as JSON prose; recover so ToolNode runs.
        from app.services.tauric_tool_call_recovery import apply_tool_call_recovery_patch

        apply_tool_call_recovery_patch()

        provider = config.get("llm_provider", "openai")
        model = config.get("llm_model", "")
        depth = config.get("depth", "standard")
        ticker = config.get("ticker", "")
        response_language = normalize_response_language(config.get("response_language"))
        analysts = normalize_analysts(
            config.get("analysts"),
            exclude_fundamentals=_is_crypto(ticker),
        )
        asset_type = "crypto" if _is_crypto(ticker) else "stock"

        stored_key = await _get_stored_key(provider)
        runtime = resolve_provider_runtime(provider, stored_key)

        ta_config = build_ta_config(
            provider=provider,
            model=model,
            depth=depth,
            response_language=response_language,
            backend_url=runtime.backend_url,
            ta_provider=runtime.ta_provider,
        )

        # LLM key from resolve_provider_runtime; data vendors from Settings (FRED, etc.).
        env_patch = {**runtime.env_patch, **await _data_vendor_env_patch()}
        needs_lock = bool(env_patch)
        prev_env: dict[str, str | None] = {k: os.environ.get(k) for k in env_patch}

        async with (_env_fallback_lock if needs_lock else asyncio.Lock()):
            for k, v in env_patch.items():
                os.environ[k] = v
            try:
                graph = TradingAgentsGraph(
                    selected_analysts=analysts,
                    config=ta_config,
                )
                from app.config import settings as _settings
                final_state, rating = await asyncio.wait_for(
                    asyncio.to_thread(
                        _run_graph_streaming,
                        graph,
                        ticker=ticker,
                        analysis_date=config["analysis_date"],
                        asset_type=asset_type,
                        emit=_emit,
                    ),
                    timeout=_settings.run_timeout_seconds,
                )
            finally:
                for k in env_patch:
                    prev = prev_env[k]
                    if prev is None:
                        os.environ.pop(k, None)
                    else:
                        os.environ[k] = prev

        await async_q.put(None)  # sentinel
        await process_task

        state = final_state if isinstance(final_state, dict) else {}
        verdict = map_rating_to_verdict(rating)
        raw = state_to_raw_report(state)
        trader_decision = extract_decision_text(state)
        suggested_entry, suggested_stop, suggested_target = parse_prices_from_state(state)

        async with AsyncSessionLocal() as db:
            from app.services.finnhub_client import get_finnhub_key
            from app.services.quote_currency_service import resolve_quote_currency

            finnhub_key = await get_finnhub_key(db)
            price_currency = await resolve_quote_currency(ticker, db, finnhub_key)
            db.add(Report(
                run_id=run_id,
                trader_decision=trader_decision,
                verdict=verdict,
                suggested_entry=suggested_entry,
                suggested_stop=suggested_stop,
                suggested_target=suggested_target,
                price_currency=price_currency,
                risk_assessment=extract_risk_assessment(state),
                raw_report=raw,
            ))
            await db.commit()

        await _set_status(RunStatus.completed, verdict)
        await ws_manager.broadcast(run_id, {"type": "run_completed", "run_id": run_id})

        # Fire-and-forget completion email; failure never affects run status
        try:
            from app.models.user import User
            from app.services.email import send_run_complete_email
            from app.config import settings as _cfg
            async with AsyncSessionLocal() as db:
                run_row = await db.get(Run, run_id)
                user_row = await db.get(User, run_row.created_by)
                if user_row and run_row.verdict:
                    await send_run_complete_email(
                        to=user_row.email,
                        ticker=run_row.ticker,
                        verdict=run_row.verdict.value,
                        run_id=run_id,
                        frontend_url=_cfg.frontend_url,
                    )
        except Exception:
            pass

    except asyncio.TimeoutError:
        import logging
        from app.config import settings as _cfg
        logging.getLogger(__name__).error("Run %s timed out after %ss", run_id, _cfg.run_timeout_seconds)
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.failed)
        await ws_manager.broadcast(run_id, {"type": "error", "message": f"Run timed out after {_cfg.run_timeout_seconds}s"})

    except asyncio.CancelledError:
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.aborted)
        await ws_manager.broadcast(run_id, {"type": "run_aborted", "run_id": run_id})

    except Exception as exc:
        import traceback, logging
        logging.getLogger(__name__).error("Run %s failed: %s", run_id, traceback.format_exc())
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.failed)
        await ws_manager.broadcast(run_id, {"type": "error", "message": str(exc)})

    finally:
        drain_task.cancel()
