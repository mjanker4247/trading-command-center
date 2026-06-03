def ensure_positive(value: float, field_name: str) -> None:
    if value <= 0:
        raise ValueError(f"{field_name} must be positive")