"""Runs a thesis cross-reference analysis against the user's portfolio."""
import asyncio
import json
import re
import uuid

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.portfolio import Portfolio, PortfolioSnapshot
from app.models.portfolio_thesis_crossref import PortfolioThesisCrossRef
from app.models.user import User
from app.services.portfolio_insight_runner import (
    _call_llm,
    _fetch_sector,
    _get_api_key,
    _serialize_investor_profile,
)

_FINNHUB_CONCURRENCY = asyncio.Semaphore(5)

THESIS_PROMPT_TEMPLATE = """You are a portfolio analyst. A user has pasted an investment thesis below. Analyze how well their current portfolio aligns with this thesis.

PORTFOLIO DATA:
Portfolio name: {portfolio_name}
Total market value: {total_value}
Holdings:
{holdings_text}

Sector breakdown:
{sector_text}
{profile_block}
INVESTMENT THESIS (user-provided):
{thesis_text}

Respond ONLY with valid JSON matching this exact schema (no markdown, no explanation):
{{
  "alignment_score": <integer 1-10, where 10 = perfectly aligned>,
  "thesis_summary": <1-2 sentence summary of the thesis you extracted>,
  "aligned_positions": [
    {{"ticker": "<string>", "reason": "<1 sentence why this position aligns>"}}
  ],
  "misaligned_positions": [
    {{"ticker": "<string>", "reason": "<1 sentence why this position conflicts>"}}
  ],
  "missing_exposure": ["<sector or asset class the thesis favors that the portfolio lacks>"],
  "excess_exposure": ["<sector or asset class the thesis disfavors that the portfolio has too much of>"],
  "recommendations": [
    {{"action": "<TRIM|EXIT|CONSIDER|HOLD>", "ticker": "<string>", "rationale": "<1 sentence>"}}
  ],
  "summary": "<2-3 paragraph narrative of overall alignment>"
}}

Rules:
- Respect the investor's anti-portfolio rules — never recommend adding excluded sectors/assets in the recommendations field
- Tailor alignment score and recommendations to the investor's stated risk tolerance, time horizon, and investment style when provided"""


def _format_money(amount: float | None, currency: str | None) -> str:
    if amount is None:
        return "N/A"
    code = (currency or "USD").upper()
    return f"{code} {amount:,.2f}"


def _format_holdings_for_thesis(enriched: list[dict]) -> str:
    rows = []
    for h in enriched:
        price_str = _format_money(h["current_price"], h.get("quote_currency"))
        value_str = _format_money(h["market_value"], h.get("quote_currency"))
        weight_str = f"{h['weight_pct']:.1f}%" if h["weight_pct"] is not None else "N/A"
        rows.append(
            f"  - {h['ticker']} | sector: {h['sector']} | "
            f"price: {price_str} | value: {value_str} | weight: {weight_str}"
        )
    return "\n".join(rows) if rows else "  (no holdings)"


def _format_sectors_for_thesis(enriched: list[dict], total_market_value: float) -> str:
    sector_totals: dict[str, float] = {}
    for h in enriched:
        if h.get("include_in_totals") and h["market_value"] and total_market_value > 0:
            sector_totals[h["sector"]] = sector_totals.get(h["sector"], 0.0) + h["market_value"]
    lines = []
    for sector, val in sorted(sector_totals.items(), key=lambda x: x[1], reverse=True):
        pct = val / total_market_value * 100
        lines.append(f"  - {sector}: {pct:.1f}%")
    return "\n".join(lines) if lines else "  (unknown)"


async def run_thesis_crossref(
    portfolio_id: uuid.UUID,
    thesis_text: str,
    llm_provider: str,
    llm_model: str,
    db: AsyncSession,
) -> PortfolioThesisCrossRef:
    """Assemble portfolio context, call LLM, parse result, persist and return the crossref row."""
    portfolio = await db.get(Portfolio, portfolio_id)
    if not portfolio:
        raise ValueError("Portfolio not found")

    owner = await db.get(User, portfolio.user_id)
    pref_currency = (owner.preferred_currency if owner else "USD").upper()

    snap_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == portfolio_id)
        .options(selectinload(PortfolioSnapshot.holdings))
        .order_by(desc(PortfolioSnapshot.uploaded_at))
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    holdings = snapshot.holdings if snapshot else []
    tickers = [h.ticker for h in holdings]

    from app.models.investor_profile import InvestorProfile as InvestorProfileModel
    from app.routers.portfolio import _fetch_prices_bulk, _get_finnhub_key

    profile_result = await db.execute(
        select(InvestorProfileModel).where(InvestorProfileModel.user_id == portfolio.user_id)
    )
    investor_profile = profile_result.scalar_one_or_none()

    finnhub_key = await _get_finnhub_key(db)
    llm_api_key = await _get_api_key(llm_provider, db)

    if tickers:
        async def _bounded_sector(t: str) -> str:
            async with _FINNHUB_CONCURRENCY:
                return await _fetch_sector(t, finnhub_key)

        price_map, sectors = await asyncio.gather(
            _fetch_prices_bulk(tickers, finnhub_key, db),
            asyncio.gather(*[_bounded_sector(t) for t in tickers]),
        )
        sector_map: dict[str, str] = dict(zip(tickers, sectors))
    else:
        price_map = {}
        sector_map = {}

    total_market_value = 0.0
    enriched: list[dict] = []

    for h in holdings:
        quote = price_map.get(h.ticker)
        current_price = quote.amount if quote else None
        quote_ccy = quote.currency_code if quote else None
        market_value = h.shares * current_price if current_price is not None else None
        cost_ccy = (h.currency or "USD").upper()
        include_in_totals = (
            quote is not None
            and quote.currency_code == pref_currency
            and cost_ccy == quote.currency_code
        )
        if include_in_totals and market_value is not None:
            total_market_value += market_value

        enriched.append({
            "ticker": h.ticker,
            "sector": sector_map.get(h.ticker, "Unknown"),
            "shares": h.shares,
            "avg_cost": round(h.avg_cost, 2) if h.avg_cost else None,
            "current_price": round(current_price, 2) if current_price else None,
            "quote_currency": quote_ccy,
            "market_value": round(market_value, 2) if market_value else None,
            "weight_pct": None,
            "include_in_totals": include_in_totals,
        })

    for e in enriched:
        if e.get("include_in_totals") and e["market_value"] and total_market_value > 0:
            e["weight_pct"] = round(e["market_value"] / total_market_value * 100, 1)

    total_value_str = (
        _format_money(total_market_value, pref_currency)
        if total_market_value > 0
        else f"N/A (no holdings priced in {pref_currency})"
    )

    profile_block = ""
    if investor_profile:
        serialized = _serialize_investor_profile(investor_profile)
        if serialized:
            profile_block = f"\n{serialized}\n"

    prompt = THESIS_PROMPT_TEMPLATE.format(
        portfolio_name=portfolio.name,
        total_value=total_value_str,
        holdings_text=_format_holdings_for_thesis(enriched),
        sector_text=_format_sectors_for_thesis(enriched, total_market_value),
        profile_block=profile_block,
        thesis_text=thesis_text[:10000],
    )

    holdings_snapshot = {h["ticker"]: h for h in enriched}
    thesis_text_preview = thesis_text[:200]

    crossref = PortfolioThesisCrossRef(
        portfolio_id=portfolio_id,
        llm_provider=llm_provider,
        llm_model=llm_model,
        thesis_text=thesis_text,
        thesis_text_preview=thesis_text_preview,
        holdings_snapshot=holdings_snapshot,
    )
    db.add(crossref)

    try:
        raw = await _call_llm(llm_provider, llm_model, llm_api_key, prompt)
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in LLM response")
        parsed = json.loads(match.group(0))
        crossref.alignment_score = parsed.get("alignment_score")
        crossref.thesis_summary = parsed.get("thesis_summary")
        crossref.aligned_positions = parsed.get("aligned_positions")
        crossref.misaligned_positions = parsed.get("misaligned_positions")
        crossref.missing_exposure = parsed.get("missing_exposure")
        crossref.excess_exposure = parsed.get("excess_exposure")
        crossref.recommendations = parsed.get("recommendations")
        crossref.summary = parsed.get("summary")
    except Exception as exc:
        crossref.error = str(exc)

    await db.commit()
    await db.refresh(crossref)
    return crossref
