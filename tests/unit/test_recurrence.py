"""Unit-тесты expand_series_dates — единый источник правил повторения."""
import pytest
from datetime import date, timedelta

from database.requests import expand_series_dates


# ─── Daily ────────────────────────────────────────────────────────

def test_daily_interval_1():
    """Каждый день, 5 дней подряд."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 5), range_start=date(2026, 1, 5), range_end=date(2026, 1, 9),
    )
    assert result == [date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7),
                      date(2026, 1, 8), date(2026, 1, 9)]


def test_daily_interval_2():
    """Через день."""
    result = expand_series_dates(
        freq='daily', interval_val=2, by_day=[], until=None,
        base_date=date(2026, 1, 1), range_start=date(2026, 1, 1), range_end=date(2026, 1, 10),
    )
    assert result == [date(2026, 1, 1), date(2026, 1, 3), date(2026, 1, 5),
                      date(2026, 1, 7), date(2026, 1, 9)]


def test_daily_base_in_past():
    """Базовая дата в прошлом — генерация начинается с range_start."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=date(2025, 12, 1), range_start=date(2026, 1, 5), range_end=date(2026, 1, 7),
    )
    assert result == [date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7)]


# ─── Weekly: один день ───────────────────────────────────────────

def test_weekly_single_day():
    """Каждую среду."""
    result = expand_series_dates(
        freq='weekly', interval_val=1, by_day=['wednesday'], until=None,
        base_date=date(2026, 1, 7),  # среда
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 28),
    )
    assert result == [date(2026, 1, 7), date(2026, 1, 14), date(2026, 1, 21), date(2026, 1, 28)]


# ─── Weekly: несколько дней ──────────────────────────────────────

def test_weekly_multiple_days():
    """Понедельник и пятница."""
    result = expand_series_dates(
        freq='weekly', interval_val=1, by_day=['monday', 'friday'], until=None,
        base_date=date(2026, 1, 5),  # понедельник
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 16),
    )
    assert result == [
        date(2026, 1, 5),   # пн
        date(2026, 1, 9),   # пт
        date(2026, 1, 12),  # пн
        date(2026, 1, 16),  # пт
    ]


def test_weekly_workdays():
    """Рабочие дни: пн-пт."""
    result = expand_series_dates(
        freq='weekly', interval_val=1,
        by_day=['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        until=None,
        base_date=date(2026, 1, 5),  # пн
        range_start=date(2026, 1, 5), range_end=date(2026, 1, 11),
    )
    assert result == [
        date(2026, 1, 5),   # пн
        date(2026, 1, 6),   # вт
        date(2026, 1, 7),   # ср
        date(2026, 1, 8),   # чт
        date(2026, 1, 9),   # пт
    ]


# ─── Weekly: interval 2 недели ──────────────────────────────────

def test_weekly_interval_2():
    """Каждые 2 недели, по вторникам."""
    result = expand_series_dates(
        freq='weekly', interval_val=2, by_day=['tuesday'], until=None,
        base_date=date(2026, 1, 6),  # вт
        range_start=date(2026, 1, 1), range_end=date(2026, 2, 3),
    )
    assert result == [date(2026, 1, 6), date(2026, 1, 20), date(2026, 2, 3)]


# ─── Weekly: без by_day (тот же день недели) ────────────────────

def test_weekly_no_by_day():
    """Без by_day — используется день недели base_date."""
    result = expand_series_dates(
        freq='weekly', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 8),  # четверг
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 29),
    )
    assert result == [date(2026, 1, 8), date(2026, 1, 15), date(2026, 1, 22), date(2026, 1, 29)]


# ─── Monthly ─────────────────────────────────────────────────────

def test_monthly_29th():
    """29-е каждого месяца."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 29),
        range_start=date(2026, 1, 1), range_end=date(2026, 6, 30),
    )
    assert result == [date(2026, 1, 29), date(2026, 2, 28), date(2026, 3, 29),
                      date(2026, 4, 29), date(2026, 5, 29), date(2026, 6, 29)]


def test_monthly_30th():
    """30-е каждого месяца — февраль = 28."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 30),
        range_start=date(2026, 1, 1), range_end=date(2026, 4, 30),
    )
    assert result == [date(2026, 1, 30), date(2026, 2, 28), date(2026, 3, 30), date(2026, 4, 30)]


def test_monthly_31st():
    """31-е — все месяцы сокращаются до последнего дня."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 31),
        range_start=date(2026, 1, 1), range_end=date(2026, 5, 31),
    )
    assert result == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31),
                      date(2026, 4, 30), date(2026, 5, 31)]


def test_february_leap_year():
    """Февраль високосного года — 29 дней."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2028, 1, 29),
        range_start=date(2028, 1, 1), range_end=date(2028, 5, 31),
    )
    assert date(2028, 2, 29) in result  # 2028 — високосный


def test_february_non_leap_year():
    """Февраль невисокосного года — 28 дней."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2027, 1, 29),
        range_start=date(2027, 1, 1), range_end=date(2027, 5, 31),
    )
    # 2027 — невисокосный, февраль = 28
    assert date(2027, 2, 28) in result
    assert all(d.day <= 28 or d.month != 2 for d in result)


# ─── Until ───────────────────────────────────────────────────────

def test_until_limits_generation():
    """Until обрезает генерацию."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[],
        until=date(2026, 1, 5),
        base_date=date(2026, 1, 1), range_start=date(2026, 1, 1), range_end=date(2026, 1, 10),
    )
    assert result == [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3),
                      date(2026, 1, 4), date(2026, 1, 5)]


# ─── Skip ────────────────────────────────────────────────────────

def test_skip_dates():
    """Skip убирает конкретные даты."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[],
        until=None,
        base_date=date(2026, 1, 1), range_start=date(2026, 1, 1), range_end=date(2026, 1, 5),
        skip_dates={date(2026, 1, 3)},
    )
    assert result == [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 4), date(2026, 1, 5)]


def test_skip_multiple_dates():
    """Skip нескольких дат."""
    result = expand_series_dates(
        freq='weekly', interval_val=1,
        by_day=['monday', 'wednesday', 'friday'],
        until=None,
        base_date=date(2026, 1, 5),
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 16),
        skip_dates={date(2026, 1, 7), date(2026, 1, 12)},
    )
    assert date(2026, 1, 7) not in result   # среда пропущена
    assert date(2026, 1, 12) not in result  # понедельник пропущена


# ─── Пересечение года ───────────────────────────────────────────

def test_cross_year():
    """Серия пересекает границу года."""
    result = expand_series_dates(
        freq='monthly', interval_val=1, by_day=[], until=None,
        base_date=date(2025, 11, 15),
        range_start=date(2025, 11, 1), range_end=date(2026, 2, 28),
    )
    assert result == [date(2025, 11, 15), date(2025, 12, 15),
                      date(2026, 1, 15), date(2026, 2, 15)]


# ─── Edge cases ──────────────────────────────────────────────────

def test_empty_when_base_after_end():
    """base_date после range_end — пустой результат."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 12, 1), range_start=date(2026, 1, 1), range_end=date(2026, 1, 5),
    )
    assert result == []


def test_empty_when_no_dates():
    """Отсутствие base_date — пустой результат."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=None, range_start=date(2026, 1, 1), range_end=date(2026, 1, 5),
    )
    assert result == []


def test_empty_when_no_range():
    """Отсутствие range — пустой результат."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 1), range_start=None, range_end=date(2026, 1, 5),
    )
    assert result == []


def test_unknown_freq_returns_empty():
    """Неизвестный freq не генерирует даты (только daily/weekly/monthly)."""
    result = expand_series_dates(
        freq='unknown', interval_val=1, by_day=['monday'], until=None,
        base_date=date(2026, 1, 5),
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 12),
    )
    assert result == []


def test_interval_1_as_default():
    """interval_val=None или 0 → interval=1."""
    result = expand_series_dates(
        freq='daily', interval_val=None, by_day=[], until=None,
        base_date=date(2026, 1, 1), range_start=date(2026, 1, 1), range_end=date(2026, 1, 3),
    )
    assert result == [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)]


def test_sorted_output():
    """Результат всегда отсортирован по возрастанию."""
    result = expand_series_dates(
        freq='weekly', interval_val=1,
        by_day=['friday', 'monday', 'wednesday'],
        until=None,
        base_date=date(2026, 1, 5),
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 31),
    )
    assert result == sorted(result)


def test_range_start_filters_before_base():
    """Даты до range_start не попадают в результат."""
    result = expand_series_dates(
        freq='daily', interval_val=1, by_day=[], until=None,
        base_date=date(2026, 1, 1), range_start=date(2026, 1, 5), range_end=date(2026, 1, 7),
    )
    assert result == [date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7)]


def test_weekly_by_day_short_names():
    """by_day принимает короткие имена (mon, tue)."""
    result = expand_series_dates(
        freq='weekly', interval_val=1, by_day=['mon', 'wed'], until=None,
        base_date=date(2026, 1, 5),
        range_start=date(2026, 1, 1), range_end=date(2026, 1, 14),
    )
    assert result == [date(2026, 1, 5), date(2026, 1, 7), date(2026, 1, 12), date(2026, 1, 14)]
