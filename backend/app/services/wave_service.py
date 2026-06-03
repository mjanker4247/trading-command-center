"""Elliott Wave + Fibonacci analysis via vendored elliott_wave package."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from elliott_wave.models.chart_payload import AnalyzeResponse
from elliott_wave.models.selection import AnalysisProfile
from elliott_wave.services.analysis_orchestrator import AnalysisOrchestrator
from elliott_wave.services.chart_payload_service import ChartPayloadService

logger = logging.getLogger(__name__)

_CACHE_TTL = 14400  # 4 hours
_analyze_cache: dict[str, tuple[dict[str, Any], float]] = {}
_sem = asyncio.Semaphore(5)

_orchestrator = AnalysisOrchestrator()
_chart_payload_service = ChartPayloadService()

DEFAULT_PERIOD = "2y"
DEFAULT_INTERVAL = "1d"
DEFAULT_PROFILE: AnalysisProfile = "full_confluence"


def _cache_key(
    symbol: str,
    period: str,
    interval: str,
    profile: str,
) -> str:
    return f"{symbol.upper()}:{period}:{interval}:{profile}"


def _run_analyze_sync(
    symbol: str,
    *,
    period: str = DEFAULT_PERIOD,
    interval: str = DEFAULT_INTERVAL,
    profile: AnalysisProfile = DEFAULT_PROFILE,
) -> dict[str, Any]:
    df, context, result = _orchestrator.analyze(
        symbol=symbol.upper(),
        period=period,  # type: ignore[arg-type]
        interval=interval,  # type: ignore[arg-type]
        profile=profile,
    )
    chart = _chart_payload_service.build(df, context, result)
    response = AnalyzeResponse(
        instrument=result.instrument,
        top_scenarios=result.top_scenarios,
        trade_regions=result.trade_regions,
        overview=result.overview,
        chart=chart,
    )
    return response.model_dump(mode="json")


def _to_summary(payload: dict[str, Any], ticker: str) -> dict[str, Any]:
    overview = payload.get("overview") or {}
    top_scenarios = payload.get("top_scenarios") or []
    trade_regions = payload.get("trade_regions") or []
    top = top_scenarios[0] if top_scenarios else None
    region = trade_regions[0] if trade_regions else overview.get("trade_region")

    return {
        "ticker": ticker.upper(),
        "top_scenario": overview.get("top_scenario"),
        "top_direction": overview.get("top_direction"),
        "pattern": top.get("pattern") if top else None,
        "trend": top.get("trend") if top else None,
        "scenario_score": top.get("score") if top else None,
        "invalidation_level": top.get("invalidation_level") if top else None,
        "confidence": region.get("confidence") if region else None,
        "zone_low": region.get("zone_low") if region else None,
        "zone_high": region.get("zone_high") if region else None,
        "warnings": overview.get("warnings") or [],
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


async def analyze_wave(
    ticker: str,
    *,
    period: str = DEFAULT_PERIOD,
    interval: str = DEFAULT_INTERVAL,
    profile: AnalysisProfile = DEFAULT_PROFILE,
    use_cache: bool = True,
) -> Optional[dict[str, Any]]:
    """Full analysis payload (chart, scenarios, trade regions). Returns None on failure."""
    symbol = ticker.upper()
    key = _cache_key(symbol, period, interval, profile)

    if use_cache:
        cached = _analyze_cache.get(key)
        if cached and cached[1] > time.time():
            return cached[0]

    async with _sem:
        if use_cache:
            cached = _analyze_cache.get(key)
            if cached and cached[1] > time.time():
                return cached[0]

        try:
            payload = await asyncio.to_thread(
                _run_analyze_sync,
                symbol,
                period=period,
                interval=interval,
                profile=profile,
            )
        except Exception as exc:
            logger.warning("wave analysis failed for %s: %s", symbol, exc)
            return None

        if use_cache:
            _analyze_cache[key] = (payload, time.time() + _CACHE_TTL)
        return payload


async def get_wave_summary(
    ticker: str,
    *,
    period: str = DEFAULT_PERIOD,
    interval: str = DEFAULT_INTERVAL,
    profile: AnalysisProfile = DEFAULT_PROFILE,
) -> Optional[dict[str, Any]]:
    payload = await analyze_wave(
        ticker,
        period=period,
        interval=interval,
        profile=profile,
    )
    if payload is None:
        return None
    return _to_summary(payload, ticker.upper())


async def get_wave_summaries_for_portfolio(
    tickers: list[str],
    *,
    period: str = DEFAULT_PERIOD,
    interval: str = DEFAULT_INTERVAL,
    profile: AnalysisProfile = DEFAULT_PROFILE,
) -> dict[str, dict[str, Any]]:
    results = await asyncio.gather(
        *[
            get_wave_summary(t, period=period, interval=interval, profile=profile)
            for t in tickers
        ]
    )
    return {
        t.upper(): r
        for t, r in zip(tickers, results)
        if r is not None
    }
