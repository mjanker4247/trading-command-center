"""ETF look-through via yfinance FundsData (top holdings + sector weights).

Builds a constituent mapping matrix M for concentration constraints:
  EffectiveWeight = M @ w_tradable  ≤ max_concentration

Optimization still runs on tradable assets (ETFs + direct stocks). Look-through
only supplies M and post-hoc exposure reports — Yahoo top holdings are typically
~10 names per ETF, not the full book.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_CACHE_TTL = 21600  # 6 hours
# ticker -> (payload | None, expiry)
_cache: dict[str, tuple[Optional[dict], float]] = {}


def _sync_fetch_fund(ticker: str) -> Optional[dict]:
    """Return fund look-through payload or None if not an ETF/mutual fund."""
    import yfinance as yf

    try:
        fd = yf.Ticker(ticker).funds_data
        quote = (fd.quote_type() or "").upper()
        if quote not in {"ETF", "MUTUALFUND", "MUTUAL FUND"}:
            return None

        holdings: list[dict] = []
        top = fd.top_holdings
        if top is not None and not top.empty:
            for symbol, row in top.iterrows():
                pct = row.get("Holding Percent")
                if pct is None:
                    continue
                try:
                    weight = float(pct)
                except (TypeError, ValueError):
                    continue
                if weight <= 0:
                    continue
                holdings.append(
                    {
                        "symbol": str(symbol).upper(),
                        "name": str(row.get("Name") or symbol),
                        "weight": round(weight, 6),
                    }
                )

        sectors_raw = fd.sector_weightings or {}
        sectors = {
            str(k): round(float(v), 6)
            for k, v in sectors_raw.items()
            if v is not None and float(v) > 0
        }

        if not holdings and not sectors:
            return None

        return {
            "ticker": ticker,
            "quote_type": quote,
            "top_holdings": holdings,
            "sector_weightings": sectors,
        }
    except Exception:
        logger.debug("ETF look-through fetch failed for %s", ticker, exc_info=True)
        return None


async def fetch_etf_lookthrough(ticker: str) -> Optional[dict]:
    now = time.time()
    cached = _cache.get(ticker)
    if cached and cached[1] > now:
        return cached[0]

    payload = await asyncio.to_thread(_sync_fetch_fund, ticker)
    _cache[ticker] = (payload, now + (_CACHE_TTL if payload else 300))
    return payload


async def fetch_funds_for_tickers(tickers: list[str]) -> dict[str, dict]:
    results = await asyncio.gather(*[fetch_etf_lookthrough(t) for t in tickers])
    out: dict[str, dict] = {}
    for t, payload in zip(tickers, results):
        if payload:
            out[t] = payload
    return out


def aggregate_lookthrough(
    portfolio_weights: dict[str, float],
    fund_data: dict[str, dict],
) -> tuple[list[dict], list[dict]]:
    """Map ETF portfolio weights → net constituent / sector exposures.

    Non-ETF (or failed) tickers contribute 100% to themselves as a single leg
    so stock holdings still appear in the breakdown.
    """
    constituents: dict[str, dict] = {}
    sectors: dict[str, float] = {}

    for ticker, port_w in portfolio_weights.items():
        if port_w <= 0:
            continue
        fund = fund_data.get(ticker)
        if fund and fund.get("top_holdings"):
            for h in fund["top_holdings"]:
                sym = str(h["symbol"]).upper()
                contrib = port_w * float(h["weight"])
                entry = constituents.setdefault(
                    sym, {"symbol": sym, "name": h.get("name") or sym, "weight": 0.0}
                )
                entry["weight"] += contrib
            for sector, sw in (fund.get("sector_weightings") or {}).items():
                sectors[sector] = sectors.get(sector, 0.0) + port_w * float(sw)
        else:
            # Direct equity / unknown: treat as 100% self
            sym = ticker.upper()
            entry = constituents.setdefault(
                sym, {"symbol": sym, "name": ticker, "weight": 0.0}
            )
            entry["weight"] += port_w

    const_rows = sorted(
        (
            {
                "symbol": v["symbol"],
                "name": v["name"],
                "weight": round(v["weight"], 6),
            }
            for v in constituents.values()
            if v["weight"] > 1e-6
        ),
        key=lambda r: -r["weight"],
    )
    sector_rows = sorted(
        (
            {"sector": k, "weight": round(v, 6)}
            for k, v in sectors.items()
            if v > 1e-6
        ),
        key=lambda r: -r["weight"],
    )
    return const_rows, sector_rows


def build_lookthrough_matrix(
    asset_tickers: list[str],
    fund_data: dict[str, dict],
) -> tuple[np.ndarray, list[str], dict]:
    """Build constituent mapping matrix M (n_constituents × n_assets).

    Columns follow ``asset_tickers`` order (must match EfficientFrontier weight order).
    - Direct stock / unknown asset i: identity column (1.0 on its own symbol row).
    - ETF asset i: column = Yahoo top-holding weights (typically sum < 1).

    Returns (M, constituent_symbols, meta) where meta includes etf_tickers and
    per-asset look-through coverage (sum of known constituent weights in that column).
    """
    assets = list(asset_tickers)
    n = len(assets)
    if n == 0:
        return np.zeros((0, 0)), [], {"etf_tickers": [], "column_coverage": {}}

    # Collect all constituent symbols that appear
    symbols: set[str] = set()
    etf_tickers: list[str] = []
    for t in assets:
        fund = fund_data.get(t)
        if fund and fund.get("top_holdings"):
            etf_tickers.append(t)
            for h in fund["top_holdings"]:
                symbols.add(str(h["symbol"]).upper())
        else:
            symbols.add(t.upper())

    const_list = sorted(symbols)
    row_index = {s: i for i, s in enumerate(const_list)}
    m = len(const_list)
    M = np.zeros((m, n), dtype=float)
    column_coverage: dict[str, float] = {}

    for j, t in enumerate(assets):
        fund = fund_data.get(t)
        if fund and fund.get("top_holdings"):
            cov = 0.0
            for h in fund["top_holdings"]:
                sym = str(h["symbol"]).upper()
                w = float(h["weight"])
                M[row_index[sym], j] += w
                cov += w
            column_coverage[t] = round(cov, 6)
        else:
            M[row_index[t.upper()], j] = 1.0
            column_coverage[t] = 1.0

    meta = {
        "etf_tickers": sorted(etf_tickers),
        "column_coverage": column_coverage,
        "n_constituents": m,
        "n_assets": n,
    }
    return M, const_list, meta


def effective_weights_from_matrix(
    M: np.ndarray,
    constituent_symbols: list[str],
    asset_weights: dict[str, float],
    asset_tickers: list[str],
) -> list[dict]:
    """Compute effective look-through weights w_eff = M @ w for a weight vector."""
    w = np.array([float(asset_weights.get(t, 0.0)) for t in asset_tickers], dtype=float)
    if M.size == 0 or w.size == 0:
        return []
    eff = M @ w
    rows = [
        {
            "symbol": constituent_symbols[i],
            "name": constituent_symbols[i],
            "weight": round(float(eff[i]), 6),
        }
        for i in range(len(constituent_symbols))
        if eff[i] > 1e-8
    ]
    rows.sort(key=lambda r: -r["weight"])
    return rows


def build_lookthrough_delta(
    current_weights: dict[str, float],
    target_weights: dict[str, float],
    fund_data: dict[str, dict],
    *,
    top_n: int = 15,
    concentration_limit: Optional[float] = None,
) -> dict:
    cur_c, cur_s = aggregate_lookthrough(current_weights, fund_data)
    tgt_c, tgt_s = aggregate_lookthrough(target_weights, fund_data)

    cur_c_map = {r["symbol"]: r for r in cur_c}
    tgt_c_map = {r["symbol"]: r for r in tgt_c}
    symbols = set(cur_c_map) | set(tgt_c_map)
    const_delta = []
    for sym in symbols:
        c = cur_c_map.get(sym, {"symbol": sym, "name": sym, "weight": 0.0})
        t = tgt_c_map.get(sym, {"symbol": sym, "name": c["name"], "weight": 0.0})
        tw = float(t["weight"])
        row = {
            "symbol": sym,
            "name": t.get("name") or c.get("name") or sym,
            "current_weight": round(float(c["weight"]), 6),
            "target_weight": round(tw, 6),
            "delta_weight": round(tw - float(c["weight"]), 6),
        }
        if concentration_limit is not None and concentration_limit > 0:
            row["at_limit"] = tw >= concentration_limit - 1e-6
        const_delta.append(row)
    const_delta.sort(key=lambda r: -abs(r["delta_weight"]))

    cur_s_map = {r["sector"]: r["weight"] for r in cur_s}
    tgt_s_map = {r["sector"]: r["weight"] for r in tgt_s}
    sectors = set(cur_s_map) | set(tgt_s_map)
    sector_delta = []
    for sector in sectors:
        cw = cur_s_map.get(sector, 0.0)
        tw = tgt_s_map.get(sector, 0.0)
        sector_delta.append(
            {
                "sector": sector,
                "current_weight": round(cw, 6),
                "target_weight": round(tw, 6),
                "delta_weight": round(tw - cw, 6),
            }
        )
    sector_delta.sort(key=lambda r: -abs(r["delta_weight"]))

    etf_tickers = sorted(t for t, f in fund_data.items() if f)
    note = (
        "Look-through uses Yahoo Finance top holdings (typically ~10 names per ETF), "
        "not the full constituent book. Optimization trades ETFs/stocks as wholes; "
        "when enabled, a max effective-weight constraint uses this mapping to limit "
        "single-stock cluster risk."
        if etf_tickers
        else "No ETF/mutual-fund look-through data available for this portfolio."
    )
    if concentration_limit is not None and concentration_limit > 0:
        note += f" Concentration limit: {concentration_limit:.0%} effective weight per underlying."

    return {
        "etf_tickers": etf_tickers,
        "note": note,
        "constituents": const_delta[:top_n],
        "sectors": sector_delta,
        "concentration_limit": concentration_limit,
    }


def clear_lookthrough_cache() -> None:
    _cache.clear()
