DEFAULT_RESPONSE_LANGUAGE = "en-US"

SUPPORTED_RESPONSE_LANGUAGES = (
    "en-US",
    "zh-TW",
    "zh-CN",
    "ja-JP",
    "ko-KR",
    "de-DE",
)

RESPONSE_LANGUAGE_LABELS: dict[str, str] = {
    "en-US": "English (US)",
    "zh-TW": "Traditional Chinese",
    "zh-CN": "Simplified Chinese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "de-DE": "German",
}


def normalize_response_language(value: str | None) -> str:
    """Return a TradingAgents-supported response language tag."""
    if value is None or not value.strip():
        return DEFAULT_RESPONSE_LANGUAGE

    language = value.strip()
    if language not in SUPPORTED_RESPONSE_LANGUAGES:
        supported = ", ".join(SUPPORTED_RESPONSE_LANGUAGES)
        raise ValueError(f"response_language must be one of: {supported}")

    return language


def response_language_instruction(value: str | None, *, json_values: bool = False) -> str:
    """Prompt suffix instructing the LLM which language to use for user-facing text."""
    language = normalize_response_language(value)
    label = RESPONSE_LANGUAGE_LABELS[language]
    base = f"Language: Write all user-facing text in {label}."
    if json_values:
        return base + " Keep JSON keys and enum values in English; translate string field values only."
    return base + " Use plain conversational prose — no JSON unless explicitly requested."
