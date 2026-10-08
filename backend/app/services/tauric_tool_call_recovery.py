"""Recover tool calls that OpenAI-compatible models dump as JSON prose.

Some hosted Llama / OpenAI-compatible endpoints (e.g. IONOS) accept ``tools``
in the request but return the intended calls as fenced JSON in ``content``
instead of structured ``tool_calls``. Tauric's ``take_turn`` then treats the
prose as the final analyst report and the ToolNode never runs — news (and
sometimes market) reports end up as empty tables with unexecuted ``get_news``
stubs.

This patch rewrites those textual calls into LangChain ``tool_calls`` so the
existing analyst subgraph can execute them.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_PATCHED = False

# Fenced ```json ... ``` blocks or bare JSON objects with type/function shape.
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
_BARE_FUNCTION_RE = re.compile(
    r"\{\s*\"type\"\s*:\s*\"function\"\s*,\s*\"name\"\s*:\s*\"[^\"]+\".*?\}",
    re.DOTALL,
)


def _parse_function_payload(obj: Any) -> tuple[str, dict[str, Any]] | None:
    """Return (name, args) from an OpenAI-style function object, or None."""
    if not isinstance(obj, dict):
        return None
    name = obj.get("name")
    if not name or not isinstance(name, str):
        # {"type":"function","function":{"name":"...","arguments":...}}
        inner = obj.get("function")
        if isinstance(inner, dict):
            name = inner.get("name")
            args = inner.get("arguments", inner.get("parameters", {}))
        else:
            return None
    else:
        args = obj.get("parameters", obj.get("arguments", {}))

    if not isinstance(name, str) or not name.strip():
        return None
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            args = {}
    if not isinstance(args, dict):
        args = {}
    return name.strip(), args


def extract_textual_tool_calls(
    content: str,
    *,
    allowed_names: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Parse function-call JSON embedded in model prose into LangChain tool_calls."""
    if not content or not content.strip():
        return []

    blobs: list[str] = []
    blobs.extend(_JSON_FENCE_RE.findall(content))
    if not blobs:
        blobs.extend(_BARE_FUNCTION_RE.findall(content))

    recovered: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for blob in blobs:
        try:
            payload = json.loads(blob)
        except json.JSONDecodeError:
            continue
        # Single object or a list of calls.
        candidates = payload if isinstance(payload, list) else [payload]
        for item in candidates:
            parsed = _parse_function_payload(item)
            if not parsed:
                continue
            name, args = parsed
            if allowed_names is not None and name not in allowed_names:
                continue
            dedupe_key = (name, json.dumps(args, sort_keys=True, default=str))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            recovered.append({
                "name": name,
                "args": args,
                "id": f"recovered_{uuid.uuid4().hex[:10]}",
                "type": "tool_call",
            })
    return recovered


def looks_like_unexecuted_tool_report(content: str | None) -> bool:
    """True when a stored analyst report is mostly textual tool-call stubs."""
    if not content or not content.strip():
        return False
    calls = extract_textual_tool_calls(content)
    if not calls:
        return False
    # Strip fences; little substantive prose left → stub report.
    stripped = _JSON_FENCE_RE.sub("", content)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return len(stripped) < 400 or ("get_" in content and "| ---" in content)


def recover_aimessage_tool_calls(result: Any, tools: list[Any]) -> Any:
    """Attach recovered tool_calls onto an AIMessage when the provider omitted them."""
    existing = getattr(result, "tool_calls", None) or []
    if existing:
        return result

    content = result.content if isinstance(getattr(result, "content", None), str) else ""
    allowed = {getattr(t, "name", None) for t in tools}
    allowed.discard(None)
    recovered = extract_textual_tool_calls(content, allowed_names=allowed)  # type: ignore[arg-type]
    if not recovered:
        return result

    from langchain_core.messages import AIMessage

    logger.info(
        "Recovered %d textual tool call(s) from model content: %s",
        len(recovered),
        ", ".join(c["name"] for c in recovered),
    )
    return AIMessage(
        content="",
        tool_calls=recovered,
        id=getattr(result, "id", None),
        additional_kwargs=getattr(result, "additional_kwargs", {}) or {},
        response_metadata=getattr(result, "response_metadata", {}) or {},
    )


def apply_tool_call_recovery_patch() -> None:
    """Idempotent monkey-patch of Tauric ``take_turn`` for textual tool recovery."""
    global _PATCHED
    if _PATCHED:
        return

    from langchain_core.messages import HumanMessage
    from tradingagents.agents.analysts import turn as turn_mod

    original = turn_mod.take_turn
    wrap_up = turn_mod.WRAP_UP

    def take_turn(prompt, llm, tools, messages):  # noqa: ANN001
        if messages and isinstance(messages[-1], HumanMessage) and messages[-1].content == wrap_up:
            # Wrap-up must not invent tool calls from example JSON in the draft.
            return original(prompt, llm, tools, messages)

        result = (prompt | llm.bind_tools(tools)).invoke(messages)
        result = recover_aimessage_tool_calls(result, list(tools))
        return result, "" if result.tool_calls else result.content

    turn_mod.take_turn = take_turn
    _PATCHED = True
    logger.info("Applied Tauric take_turn textual tool-call recovery patch")
