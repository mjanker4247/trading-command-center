SUPPORTED_DATE_FORMATS = frozenset({"iso", "us", "us_long", "eu", "uk", "locale"})
DEFAULT_DATE_FORMAT = "iso"


def normalize_date_format(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in SUPPORTED_DATE_FORMATS:
        raise ValueError(f"Unsupported date format: {value}")
    return normalized
