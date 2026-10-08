"""Map AgentFloor run config ↔ TauricResearch TradingAgents 0.6 API.

Preserves AgentFloor's 3-tier verdict / Report fields while the package returns
a 5-tier rating string and markdown state dict.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.llm_provider_registry import (
    is_openai_compatible_local_provider,
    openai_compatible_base_url,
)
from app.utils.response_language import RESPONSE_LANGUAGE_LABELS, normalize_response_language

# AgentFloor depth → Tauric debate / recursion knobs.
DEPTH_PARAMS: dict[str, dict[str, int]] = {
    "quick": {"max_debate_rounds": 1, "max_risk_discuss_rounds": 1, "max_recur_limit": 75},
    "standard": {"max_debate_rounds": 2, "max_risk_discuss_rounds": 2, "max_recur_limit": 150},
    "deep": {"max_debate_rounds": 3, "max_risk_discuss_rounds": 3, "max_recur_limit": 200},
}

# Tauric Title-Case node names → AgentFloor pipeline keys (PipelinePanel contract).
NODE_NAME_ALIASES: dict[str, str] = {
    "sentiment_analyst": "social_analyst",
    "portfolio_manager": "risk_judge",
}

# Hosted OpenAI-compatible endpoint used when the vendored package has no native
# ``ionos`` registry entry (upstream Tauric 0.6); forks that register ``ionos``
# keep the native provider + IONOS_API_KEY path.
IONOS_OPENAI_BASE_URL = "https://openai.inference.de-txl.ionos.com/v1"

_CLOUD_KEY_ENV: dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "groq": "GROQ_API_KEY",
    "ionos": "IONOS_API_KEY",
}

# Structured markdown labels (EN + DE) as rendered by Tauric schemas / free-form LLMs.
_PRICE_LABEL_PATTERNS: dict[str, str] = {
    "entry": (
        r"(?:entry(?:\s+price)?|entry\s+level|einstiegs(?:preis)?|kaufpreis|"
        r"einstieg(?:skurs)?)"
    ),
    "stop": (
        r"(?:stop[\s_-]?loss|stop\s*preis|stopp(?:[-\s]?verlust|preis)?|"
        r"verlustbegrenzung)"
    ),
    "target": (
        r"(?:price\s+target|target\s+price|target|zielkurs|kursziel|preisziel)"
    ),
}

# **Label**: value  (Tauric render_trader_proposal / render_pm_decision)
_STRUCTURED_PRICE_RE = re.compile(
    r"\*\*\s*(?P<label>[^*]+?)\s*\*\*\s*:\s*(?P<value>[^\n*]+)",
    re.IGNORECASE,
)

# Prose: "Zielkurs von 1150,00 $", "stop loss at 1050", "Entry: 1088.00"
_PROSE_PRICE_RES: dict[str, re.Pattern[str]] = {
    key: re.compile(
        rf"(?P<label>{pat})\s*(?:von|of|at|bei|=|:)?\s*"
        rf"(?P<value>\$?\s*[\d][\d.,\s]*\d|\d[\d.,]*)\s*(?:\$|usd|eur|€)?",
        re.IGNORECASE,
    )
    for key, pat in _PRICE_LABEL_PATTERNS.items()
}

_NULLISH_PRICE = frozenset({
    "", "none", "null", "n/a", "na", "not provided", "nicht angegeben",
    "k.a.", "k. a.", "-", "—",
})


def _tradingagents_knows_openai_compatible(provider: str) -> bool:
    """True when the installed tradingagents package registers ``provider``."""
    try:
        from tradingagents.llm_clients.openai_client import is_openai_compatible

        return is_openai_compatible(provider)
    except Exception:
        return False


def map_provider(agentfloor_provider: str) -> str:
    """Map AgentFloor provider id to a Tauric ``llm_provider`` value."""
    provider = (agentfloor_provider or "openai").lower()
    if provider in {"vllm", "litellm"}:
        return "openai_compatible"
    # Upstream vendored TradingAgents 0.6 has no ``ionos`` registry entry;
    # route through the generic OpenAI-compatible client with IONOS base URL.
    if provider == "ionos" and not _tradingagents_knows_openai_compatible("ionos"):
        return "openai_compatible"
    if provider == "google":
        return "google"
    return provider


@dataclass(frozen=True)
class ProviderRuntime:
    """Tauric provider id, optional base URL, and env vars for one run."""

    ta_provider: str
    backend_url: str | None
    env_patch: dict[str, str]


def resolve_provider_runtime(
    agentfloor_provider: str,
    stored_key: str | None,
) -> ProviderRuntime:
    """Wire AgentFloor provider + stored secret into Tauric config/env."""
    af = (agentfloor_provider or "openai").lower()
    ta = map_provider(af)
    backend_url: str | None = None
    env_patch: dict[str, str] = {}

    if af == "ionos" and ta == "openai_compatible":
        backend_url = IONOS_OPENAI_BASE_URL
        if stored_key:
            env_patch["OPENAI_COMPATIBLE_API_KEY"] = stored_key
    elif af == "ollama":
        if stored_key:
            env_patch["OLLAMA_BASE_URL"] = stored_key.rstrip("/")
    elif is_openai_compatible_local_provider(af):
        if stored_key:
            backend_url = openai_compatible_base_url(stored_key)
            env_patch["OPENAI_COMPATIBLE_API_KEY"] = af
    elif af in _CLOUD_KEY_ENV and stored_key:
        env_patch[_CLOUD_KEY_ENV[af]] = stored_key

    return ProviderRuntime(ta_provider=ta, backend_url=backend_url, env_patch=env_patch)


def output_language_for(response_language: str | None) -> str:
    """Convert AgentFloor BCP-47 tags to Tauric ``output_language`` labels."""
    tag = normalize_response_language(response_language)
    label = RESPONSE_LANGUAGE_LABELS[tag]
    # Labels like "English (US)" → Tauric expects a plain language name.
    return label.split("(")[0].strip() or "English"


def build_ta_config(
    *,
    provider: str,
    model: str,
    depth: str,
    response_language: str | None,
    backend_url: str | None = None,
    data_dir: str | None = None,
    ta_provider: str | None = None,
) -> dict[str, Any]:
    """Build a Tauric ``DEFAULT_CONFIG``-based dict for one run.

    ``provider`` is the AgentFloor id; ``ta_provider`` overrides the mapped
    Tauric ``llm_provider`` when already resolved via ``resolve_provider_runtime``.
    """
    from tradingagents.default_config import DEFAULT_CONFIG

    cfg = DEFAULT_CONFIG.copy()
    resolved_provider = ta_provider or map_provider(provider)
    depth_params = DEPTH_PARAMS.get(depth, DEPTH_PARAMS["standard"])

    cfg["llm_provider"] = resolved_provider
    cfg["deep_think_llm"] = model
    cfg["quick_think_llm"] = model
    cfg["output_language"] = output_language_for(response_language)
    cfg.update(depth_params)
    cfg["checkpoint_enabled"] = False

    if backend_url:
        cfg["backend_url"] = backend_url

    # Isolate multi-tenant side effects under a dedicated tree when configured.
    if data_dir:
        root = Path(data_dir)
        cfg["results_dir"] = str(root / "logs")
        cfg["data_cache_dir"] = str(root / "cache")
        cfg["memory_log_path"] = str(root / "memory" / "trading_memory.md")
    elif os.environ.get("TRADINGAGENTS_RESULTS_DIR"):
        # Env overlay already applied by DEFAULT_CONFIG; keep explicit paths in sync.
        cfg["results_dir"] = os.environ["TRADINGAGENTS_RESULTS_DIR"]
        if os.environ.get("TRADINGAGENTS_CACHE_DIR"):
            cfg["data_cache_dir"] = os.environ["TRADINGAGENTS_CACHE_DIR"]
        if os.environ.get("TRADINGAGENTS_MEMORY_LOG_PATH"):
            cfg["memory_log_path"] = os.environ["TRADINGAGENTS_MEMORY_LOG_PATH"]

    return cfg


def map_rating_to_verdict(rating: str | None):
    """Map Tauric 5-tier rating (+ REVIEW) onto AgentFloor buy/sell/hold."""
    from app.models.run import RunVerdict

    text = str(rating or "").strip().lower()
    if text in {"buy", "overweight", "b"}:
        return RunVerdict.buy
    if text in {"sell", "underweight", "s"}:
        return RunVerdict.sell
    return RunVerdict.hold


def _classify_price_label(label: str) -> str | None:
    """Map a free-form label to entry/stop/target, or None if unrelated."""
    cleaned = re.sub(r"[\s_*]+", " ", (label or "").strip().lower())
    cleaned = cleaned.strip(" :.-")
    for key, pat in _PRICE_LABEL_PATTERNS.items():
        if re.fullmatch(pat, cleaned, flags=re.IGNORECASE):
            return key
    return None


def _normalize_price(value: Any) -> str | None:
    """Normalize a price fragment to a plain decimal string (e.g. ``1088.00``).

    Handles EN/DE thousand separators, trailing currency symbols, and rejects
    nullish placeholders. Returns None when no parseable absolute price remains.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    # Drop surrounding markdown emphasis / list junk.
    text = text.strip("*_`\"' \t")
    lower = text.lower()
    if lower in _NULLISH_PRICE or lower.startswith("not provided"):
        return None

    # Keep the first number-like token; ignore trailing prose on the same line.
    match = re.search(
        r"(?<![A-Za-z])([+-]?\d[\d.,\s]*\d|\d)(?:\s*(?:\$|€|usd|eur|gbp|chf))?",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    raw = match.group(1).replace(" ", "").replace("\u00a0", "")

    # Distinguish 1.088,00 (DE) vs 1,088.00 (EN) vs 1088,00 vs 1088.00.
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            # 1.088,00 → thousands=. decimal=,
            raw = raw.replace(".", "").replace(",", ".")
        else:
            # 1,088.00 → thousands=, decimal=.
            raw = raw.replace(",", "")
    elif "," in raw:
        left, _, right = raw.partition(",")
        if len(right) in {1, 2} and right.isdigit():
            raw = f"{left.replace('.', '')}.{right}"  # 1088,00 or 1.088,00
        else:
            raw = raw.replace(",", "")  # 1,088 thousands
    elif raw.count(".") > 1:
        # 1.088.500 unlikely for a quote; strip thousand dots, keep last as decimal
        parts = raw.split(".")
        if len(parts[-1]) in {1, 2} and parts[-1].isdigit():
            raw = "".join(parts[:-1]) + "." + parts[-1]
        else:
            raw = raw.replace(".", "")

    try:
        number = float(raw)
    except ValueError:
        return None
    if not (number > 0) or number != number:  # reject non-positive / NaN
        return None

    # Prefer compact representation without trailing .0 noise when whole.
    if number == int(number) and abs(number) < 1e12:
        return str(int(number))
    return f"{number:.4f}".rstrip("0").rstrip(".")


def _parse_markdown_prices(text: str) -> dict[str, str | None]:
    """Pull entry/stop/target from structured markdown, then prose fallbacks."""
    found: dict[str, str | None] = {"entry": None, "stop": None, "target": None}
    if not text:
        return found

    for match in _STRUCTURED_PRICE_RE.finditer(text):
        key = _classify_price_label(match.group("label"))
        if key and not found[key]:
            found[key] = _normalize_price(match.group("value"))

    for key, pattern in _PROSE_PRICE_RES.items():
        if found[key]:
            continue
        match = pattern.search(text)
        if match:
            found[key] = _normalize_price(match.group("value"))

    return found


def parse_prices_from_state(state: dict) -> tuple[str | None, str | None, str | None]:
    """Extract entry/stop/target from trader + PM markdown in the state dict.

    Preference: trader structured entry/stop, PM structured target, then the
    other document, then German/English prose mentions (Zielkurs, Stopp-Verlust).
    """
    trader = str(state.get("trader_investment_plan") or "")
    final = str(state.get("final_trade_decision") or "")
    from_trader = _parse_markdown_prices(trader)
    from_final = _parse_markdown_prices(final)
    # Also scan concatenated prose once so a target only mentioned in the PM
    # executive summary is still found when the dedicated **Price Target** line
    # is missing (common with non-English free-form PM output).
    from_both = _parse_markdown_prices(f"{trader}\n{final}")
    return (
        from_trader["entry"] or from_final["entry"] or from_both["entry"],
        from_trader["stop"] or from_final["stop"] or from_both["stop"],
        from_final["target"] or from_trader["target"] or from_both["target"],
    )


def extract_decision_text(state: dict) -> str:
    """Prefer PM final decision markdown; fall back to trader plan."""
    final = str(state.get("final_trade_decision") or "").strip()
    if final:
        return final
    return str(state.get("trader_investment_plan") or "").strip()


def extract_risk_assessment(state: dict) -> str:
    """Build risk text from PM decision or risk-debate histories."""
    final = str(state.get("final_trade_decision") or "").strip()
    if final:
        return final

    rds = state.get("risk_debate_state") or {}
    if not isinstance(rds, dict):
        return ""
    parts = []
    for key in (
        "history",
        "aggressive_history",
        "conservative_history",
        "neutral_history",
    ):
        chunk = str(rds.get(key) or "").strip()
        if chunk:
            parts.append(chunk)
    return "\n\n".join(parts)


def state_to_raw_report(state: dict) -> dict:
    """Persist a JSON-safe copy of the LangGraph state as Report.raw_report."""
    if not isinstance(state, dict):
        return {}
    try:
        return json.loads(json.dumps(state, default=str))
    except (TypeError, ValueError):
        # Drop non-serializable blobs (e.g. raw message objects) if dump fails.
        safe = {k: v for k, v in state.items() if k != "messages"}
        try:
            return json.loads(json.dumps(safe, default=str))
        except (TypeError, ValueError):
            return {}


def alias_agent_node(name: str) -> str:
    """Normalize Tauric callback node names to AgentFloor pipeline keys."""
    normalized = (name or "").lower().replace(" ", "_")
    return NODE_NAME_ALIASES.get(normalized, normalized)
