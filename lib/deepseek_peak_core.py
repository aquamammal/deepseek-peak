"""Python twin of extension/lib/core.js.

Pure evaluation of DeepSeek's peak / off-peak billing windows.

    peak = (not weekend in Asia/Shanghai)
           and (not a Chinese public holiday in Asia/Shanghai)
           and (UTC time inside [01:00,04:00) or [06:00,10:00))
"""

from __future__ import annotations

import datetime as dt

from deepseek_peak_data import (
    BEIJING_UTC_OFFSET_MINUTES,
    BUNDLED_HOLIDAYS,
    CHINA_HOLIDAYS_KNOWN_THROUGH,
    PEAK_WINDOWS,
    WINDOW_EDGES,
)

MS_PER_MINUTE = 60 * 1000
MS_PER_DAY = 24 * 60 * MS_PER_MINUTE
LOOKAHEAD_DAYS = 400

WEEKEND = "weekend"
HOLIDAY = "holiday"
WINDOW = "window"

BEIJING = dt.timezone(dt.timedelta(minutes=BEIJING_UTC_OFFSET_MINUTES), "Asia/Shanghai")


def compile_holidays(mapping=None) -> frozenset[str]:
    """Build a lookup set from a { year: ["YYYY-MM-DD", ...] } mapping."""
    if mapping is None:
        mapping = BUNDLED_HOLIDAYS
    return frozenset(day for days in mapping.values() for day in days)


def beijing_parts(moment: dt.datetime) -> dict:
    shifted = moment.astimezone(BEIJING)
    return {
        "year": shifted.year,
        "month": shifted.month,
        "day": shifted.day,
        "weekday": (shifted.weekday() + 1) % 7,  # 0 = Sunday, like JS getUTCDay
        "date_key": shifted.strftime("%Y-%m-%d"),
    }


def is_weekend_in_beijing(moment: dt.datetime) -> bool:
    return beijing_parts(moment)["weekday"] in (0, 6)


def is_chinese_holiday(moment: dt.datetime, holidays: frozenset[str] | None = None) -> bool:
    if holidays is None:
        holidays = compile_holidays()
    return beijing_parts(moment)["date_key"] in holidays


def utc_minute_of_day(moment: dt.datetime) -> float:
    moment = moment.astimezone(dt.timezone.utc)
    return moment.hour * 60 + moment.minute + moment.second / 60


def is_peak(moment: dt.datetime, holidays: frozenset[str] | None = None) -> bool:
    if is_weekend_in_beijing(moment):
        return False
    if is_chinese_holiday(moment, holidays):
        return False
    minute = utc_minute_of_day(moment)
    return any(start <= minute < end for start, end in PEAK_WINDOWS)


def reason(moment: dt.datetime, holidays: frozenset[str] | None = None) -> str:
    if is_weekend_in_beijing(moment):
        return WEEKEND
    if is_chinese_holiday(moment, holidays):
        return HOLIDAY
    return WINDOW


def next_transition(moment: dt.datetime, holidays: frozenset[str] | None = None) -> dt.datetime | None:
    """First instant at which the verdict flips.

    Only UTC window edges can flip it: the weekend and holiday flags change
    exactly when a Beijing day starts (16:00 UTC, an even hour), so probing
    window edges is sufficient. The edge itself is the first instant of the new
    state, so re-evaluating there gives the right answer.
    """
    utc = moment.astimezone(dt.timezone.utc)
    current = is_peak(utc, holidays)
    midnight = utc.replace(hour=0, minute=0, second=0, microsecond=0)

    for day in range(LOOKAHEAD_DAYS + 1):
        day_start = midnight + dt.timedelta(days=day)
        for edge in WINDOW_EDGES:
            candidate = day_start + dt.timedelta(minutes=edge)
            if candidate <= utc:
                continue
            if is_peak(candidate, holidays) != current:
                return candidate
    return None


def peak_blocks_for_beijing_day(moment: dt.datetime, holidays: frozenset[str] | None = None):
    """Peak [start, end) instants that overlap the given Beijing calendar day."""
    parts = beijing_parts(moment)
    # Midnight of that Beijing day, as a real UTC instant.
    day_start = dt.datetime(
        parts["year"], parts["month"], parts["day"], tzinfo=BEIJING
    ).astimezone(dt.timezone.utc)
    day_end = day_start + dt.timedelta(milliseconds=MS_PER_DAY)

    # The windows are anchored to UTC midnight, not to the Beijing day.
    utc_midnight = moment.astimezone(dt.timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    blocks = []
    for start, end in PEAK_WINDOWS:
        start_at = max(day_start, utc_midnight + dt.timedelta(minutes=start))
        end_at = min(day_end, utc_midnight + dt.timedelta(minutes=end))
        if end_at <= start_at:
            continue
        if is_weekend_in_beijing(start_at) or is_chinese_holiday(start_at, holidays):
            continue
        blocks.append((start_at, end_at))
    return blocks


def is_off_peak_day(moment: dt.datetime, holidays: frozenset[str] | None = None) -> bool:
    return not peak_blocks_for_beijing_day(moment, holidays)


def is_holiday_data_stale(moment: dt.datetime) -> bool:
    return beijing_parts(moment)["date_key"] > CHINA_HOLIDAYS_KNOWN_THROUGH
