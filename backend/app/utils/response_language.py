DEFAULT_RESPONSE_LANGUAGE = "en-US"

SUPPORTED_RESPONSE_LANGUAGES = (
    "en-US",
    "zh-TW",
    "zh-CN",
    "ja-JP",
    "ko-KR",
    "de-DE",
)


def normalize_response_language(value: str | None) -> str:
    """Return a TradingAgents-supported response language tag."""
    if value is None or not value.strip():
        return DEFAULT_RESPONSE_LANGUAGE

    language = value.strip()
    if language not in SUPPORTED_RESPONSE_LANGUAGES:
        supported = ", ".join(SUPPORTED_RESPONSE_LANGUAGES)
        raise ValueError(f"response_language must be one of: {supported}")

    return language
