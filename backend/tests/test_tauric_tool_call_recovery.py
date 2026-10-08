"""Textual tool-call recovery for OpenAI-compatible models (IONOS / Llama)."""

from langchain_core.messages import AIMessage

from app.services.tauric_tool_call_recovery import (
    extract_textual_tool_calls,
    looks_like_unexecuted_tool_report,
    recover_aimessage_tool_calls,
)


MU_NEWS_STUB = """
Der aktuelle Stand der Welt kann durch die Analyse von Nachrichten ermittelt werden.

```json
{
    "type": "function",
    "name": "get_news",
    "parameters": {
        "start_date": "2026-10-01",
        "end_date": "2026-10-08"
    }
}
```

```json
{
    "type": "function",
    "name": "get_global_news",
    "parameters": {
        "curr_date": "2026-10-08",
        "look_back_days": "7",
        "limit": "10"
    }
}
```

| Kategorie | Beschreibung | Wert |
| --- | --- | --- |
| Nachrichten | Aktuelle Nachrichten über MU |  |
"""


def test_extract_mu_style_fenced_function_calls():
    calls = extract_textual_tool_calls(
        MU_NEWS_STUB,
        allowed_names={"get_news", "get_global_news", "get_macro_indicators"},
    )
    assert [c["name"] for c in calls] == ["get_news", "get_global_news"]
    assert calls[0]["args"]["start_date"] == "2026-10-01"
    assert calls[1]["args"]["curr_date"] == "2026-10-08"


def test_extract_ignores_unknown_tool_names():
    calls = extract_textual_tool_calls(
        MU_NEWS_STUB,
        allowed_names={"get_stock_data"},
    )
    assert calls == []


def test_recover_aimessage_attaches_tool_calls():
    class _Tool:
        def __init__(self, name: str):
            self.name = name

    msg = AIMessage(content=MU_NEWS_STUB)
    recovered = recover_aimessage_tool_calls(
        msg,
        [_Tool("get_news"), _Tool("get_global_news")],
    )
    assert recovered.tool_calls
    assert recovered.content == ""
    assert {c["name"] for c in recovered.tool_calls} == {"get_news", "get_global_news"}


def test_recover_preserves_existing_tool_calls():
    existing = [{
        "name": "get_news",
        "args": {"start_date": "2026-10-01", "end_date": "2026-10-08"},
        "id": "call_1",
        "type": "tool_call",
    }]
    msg = AIMessage(content="calling tools", tool_calls=existing)

    class _Tool:
        name = "get_news"

    recovered = recover_aimessage_tool_calls(msg, [_Tool()])
    assert recovered is msg
    assert recovered.tool_calls == existing


def test_looks_like_unexecuted_tool_report_mu():
    assert looks_like_unexecuted_tool_report(MU_NEWS_STUB) is True
    assert looks_like_unexecuted_tool_report(
        "**Overall Sentiment:** Mildly Bullish\nStockTwits is bullish."
    ) is False
