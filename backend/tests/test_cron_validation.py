import pytest

from app.utils.cron_validation import (
    _normalize_cron_for_apscheduler,
    normalize_schedule_cron,
    parse_cron_trigger,
)


@pytest.mark.unit
def test_normalize_schedule_cron_strips_and_nulls_empty():
    assert normalize_schedule_cron(" 0 9 * * * ") == "0 9 * * *"
    assert normalize_schedule_cron("") is None
    assert normalize_schedule_cron("   ") is None
    assert normalize_schedule_cron(None) is None


@pytest.mark.unit
def test_parse_cron_trigger_accepts_valid_expression():
    trigger = parse_cron_trigger("0 9 * * 1-5")
    assert trigger is not None


@pytest.mark.unit
def test_normalize_cron_translates_standard_weekday_numbers():
    assert _normalize_cron_for_apscheduler("0 9 * * 1-5") == "0 9 * * mon,tue,wed,thu,fri"
    assert _normalize_cron_for_apscheduler("0 9 * * 0") == "0 9 * * sun"
    assert _normalize_cron_for_apscheduler("0 9 * * 7") == "0 9 * * sun"


@pytest.mark.unit
def test_parse_cron_trigger_uses_standard_cron_weekday_semantics():
    trigger = parse_cron_trigger("0 9 * * 1-5")
    fire_weekdays = [trigger.next().weekday() for _ in range(5)]
    assert 5 not in fire_weekdays  # Saturday must not be included in Mon-Fri schedules.
    assert all(day < 5 for day in fire_weekdays)


@pytest.mark.unit
def test_parse_cron_trigger_treats_zero_as_sunday():
    trigger = parse_cron_trigger("0 9 * * 0")
    assert trigger.next().weekday() == 6


@pytest.mark.unit
def test_parse_cron_trigger_rejects_invalid_expression():
    with pytest.raises(ValueError, match="Invalid cron expression"):
        parse_cron_trigger("not a cron")


@pytest.mark.unit
def test_build_watchlist_schedule_specs_skips_invalid_rows():
    from types import SimpleNamespace
    from app.services.scheduler import _build_watchlist_schedule_specs

    items = [
        SimpleNamespace(
            id="good",
            ticker="AAPL",
            schedule_cron="0 9 * * 1-5",
        ),
        SimpleNamespace(
            id="bad",
            ticker="BAD",
            schedule_cron="invalid cron",
        ),
    ]
    specs = _build_watchlist_schedule_specs(items)
    assert len(specs) == 1
    assert specs[0].item_id == "good"
