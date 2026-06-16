"""Cron expression validation for watchlist schedules."""

from apscheduler.triggers.cron import CronTrigger


_STANDARD_CRON_WEEKDAY_NAMES = {
    "sun": 0,
    "mon": 1,
    "tue": 2,
    "wed": 3,
    "thu": 4,
    "fri": 5,
    "sat": 6,
}
_WEEKDAY_NAME_BY_STANDARD_NUMBER = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
    7: "sun",
}


def normalize_schedule_cron(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _parse_weekday_value(value: str) -> int:
    normalized = value.lower()
    if normalized in _STANDARD_CRON_WEEKDAY_NAMES:
        return _STANDARD_CRON_WEEKDAY_NAMES[normalized]
    try:
        number = int(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid day-of-week value: {value!r}") from exc
    if number not in _WEEKDAY_NAME_BY_STANDARD_NUMBER:
        raise ValueError(f"Invalid day-of-week value: {value!r}")
    return number


def _expand_weekday_atom(atom: str) -> list[int]:
    base, separator, step_text = atom.partition("/")
    step = 1
    if separator:
        try:
            step = int(step_text)
        except ValueError as exc:
            raise ValueError(f"Invalid day-of-week step: {atom!r}") from exc
        if step < 1:
            raise ValueError(f"Invalid day-of-week step: {atom!r}")

    if base == "*":
        return list(range(0, 7, step))

    if "-" in base:
        start_text, end_text = base.split("-", 1)
        start = _parse_weekday_value(start_text)
        end = _parse_weekday_value(end_text)
        if start == 7:
            start = 0
        if end == 7:
            end = 6
        if start > end:
            raise ValueError(f"Invalid day-of-week range: {atom!r}")
        return list(range(start, end + 1, step))

    return [_parse_weekday_value(base)]


def _normalize_day_of_week_for_apscheduler(day_of_week: str) -> str:
    """Convert standard crontab DOW numbering (Sun=0/7) to APScheduler names.

    APScheduler's numeric weekday fields use Mon=0, which differs from the
    crontab strings emitted by the watchlist UI and accepted by users.
    """
    normalized = day_of_week.strip().lower()
    if normalized == "*":
        return normalized

    weekdays: list[int] = []
    for atom in normalized.split(","):
        atom = atom.strip()
        if not atom:
            raise ValueError(f"Invalid day-of-week expression: {day_of_week!r}")
        weekdays.extend(_expand_weekday_atom(atom))

    if set(weekdays) == set(range(7)):
        return "*"

    return ",".join(
        _WEEKDAY_NAME_BY_STANDARD_NUMBER[weekday]
        for weekday in sorted(set(weekdays), key=lambda value: value % 7)
    )


def _normalize_cron_for_apscheduler(cron: str) -> str:
    fields = cron.split()
    if len(fields) != 5:
        return cron
    minute, hour, day, month, day_of_week = fields
    return " ".join(
        [minute, hour, day, month, _normalize_day_of_week_for_apscheduler(day_of_week)]
    )


def parse_cron_trigger(cron: str) -> CronTrigger:
    normalized = normalize_schedule_cron(cron)
    if normalized is None:
        raise ValueError("Cron expression is required")
    try:
        return CronTrigger.from_crontab(_normalize_cron_for_apscheduler(normalized))
    except Exception as exc:
        raise ValueError(f"Invalid cron expression: {normalized!r}") from exc
