"""Python twin of extension/lib/format.js.

Turns a verdict into text for the terminal, with the same wording the GNOME
indicator uses in its menu.
"""

from __future__ import annotations

import datetime as dt
import math
import os
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from zoneinfo import available_timezones  # noqa: F401  (re-exported for callers)

from deepseek_peak_core import (
    HOLIDAY,
    WEEKEND,
    beijing_parts,
    compile_holidays,
    is_chinese_holiday,
    is_holiday_data_stale,
    is_off_peak_day,
    is_peak,
    is_weekend_in_beijing,
    next_transition,
    peak_blocks_for_beijing_day,
    reason,
)
from deepseek_peak_data import (
    CHINA_HOLIDAYS_KNOWN_THROUGH,
    MODELS,
    PEAK_MULTIPLIER,
    PEAK_WINDOWS,
    PRICING_URL,
    REFERENCE_URL,
)

WEEKDAYS = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

REASON_TEXT = {
    WEEKEND: "weekend in Beijing (Sat/Sun)",
    HOLIDAY: "Chinese public holiday",
    "window": "inside a UTC peak window on a Beijing weekday",
}


def detect_timezone() -> str:
    """Best-effort local IANA zone: TZ, then /etc/localtime, then UTC."""
    env = os.environ.get("TZ")
    if env:
        try:
            ZoneInfo(env)
            return env
        except (ZoneInfoNotFoundError, ValueError):
            pass

    try:
        link = os.path.realpath("/etc/localtime")
        marker = "/zoneinfo/"
        if marker in link:
            candidate = link.split(marker, 1)[1]
            ZoneInfo(candidate)
            return candidate
    except (OSError, ZoneInfoNotFoundError, ValueError):
        pass

    return "UTC"


def zone(name: str) -> dt.tzinfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return dt.timezone.utc


def utc_offset_label(moment: dt.datetime, tz: dt.tzinfo) -> str:
    offset = moment.astimezone(tz).utcoffset() or dt.timedelta(0)
    total_minutes = int(offset.total_seconds() // 60)
    sign = "-" if total_minutes < 0 else "+"
    total_minutes = abs(total_minutes)
    hours, minutes = divmod(total_minutes, 60)
    if minutes == 0:
        return f"UTC{sign}{hours}"
    return f"UTC{sign}{hours}:{minutes:02d}"


def format_clock(moment: dt.datetime, tz: dt.tzinfo, hour12: bool = False) -> str:
    local = moment.astimezone(tz)
    if not hour12:
        return local.strftime("%H:%M")
    return local.strftime("%I:%M %p").lstrip("0")


def format_clock_with_day(
    moment: dt.datetime, tz: dt.tzinfo, reference: dt.datetime, hour12: bool = False
) -> str:
    clock = format_clock(moment, tz, hour12)
    if moment.astimezone(tz).date() == reference.astimezone(tz).date():
        return clock
    weekday = WEEKDAYS[(moment.astimezone(tz).weekday() + 1) % 7]
    return f"{weekday} {clock}"


def format_duration(milliseconds: float) -> str:
    total_minutes = _round_half_up(max(0.0, milliseconds) / 60000)
    if total_minutes < 1:
        return "<1m"
    days, rest = divmod(total_minutes, 1440)
    hours, minutes = divmod(rest, 60)
    if days > 0:
        return f"{days}d {hours}h" if hours else f"{days}d"
    if hours > 0:
        return f"{hours}h {minutes:02d}m" if minutes else f"{hours}h"
    return f"{minutes}m"


def evaluate(
    now: dt.datetime | None = None,
    timezone_name: str | None = None,
    holidays: frozenset[str] | None = None,
) -> dict:
    """Full snapshot of the current billing state, mirroring format.js."""
    now = now or dt.datetime.now(dt.timezone.utc)
    now = now.astimezone(dt.timezone.utc)
    if holidays is None:
        holidays = compile_holidays()
    timezone_name = timezone_name or detect_timezone()
    tz = zone(timezone_name)

    peak = is_peak(now, holidays)
    transition = next_transition(now, holidays)

    return {
        "now": now,
        "timeZone": timezone_name,
        "peak": peak,
        "status": "peak" if peak else "off-peak",
        "reason": reason(now, holidays),
        "reasonText": REASON_TEXT[reason(now, holidays)],
        "multiplier": PEAK_MULTIPLIER if peak else 1,
        "nextTransition": transition,
        "nextTransitionPeak": is_peak(transition, holidays) if transition else None,
        "msUntilTransition": (
            (transition - now).total_seconds() * 1000 if transition else None
        ),
        "utcOffset": utc_offset_label(now, tz),
        "beijingWeekend": is_weekend_in_beijing(now),
        "beijingHoliday": is_chinese_holiday(now, holidays),
        "todayIsOffPeakAllDay": is_off_peak_day(now, holidays),
        "todayBlocks": peak_blocks_for_beijing_day(now, holidays),
        "holidayDataStale": is_holiday_data_stale(now),
        "holidaysKnownThrough": CHINA_HOLIDAYS_KNOWN_THROUGH,
    }


def summarize(report: dict, hour12: bool = False) -> str:
    tz = zone(report["timeZone"])
    now = report["now"]
    transition = report["nextTransition"]

    if report["peak"]:
        until = format_clock(transition, tz, hour12) if transition else "?"
        head = f"PEAK \u2014 billed at {PEAK_MULTIPLIER}\u00d7 until {until}"
    else:
        head = f"OFF-PEAK \u2014 {PEAK_MULTIPLIER}\u00d7 cheaper"

    if transition:
        when = format_clock_with_day(transition, tz, now, hour12)
        delta = format_duration(report["msUntilTransition"])
        label = "next peak" if report["nextTransitionPeak"] else "next rate change"
        tail = f"{label} {when} (in {delta})"
    else:
        tail = "no transition found"

    return f"{head} \u00b7 {tail} \u00b7 {report['reasonText']}"


def panel_label(report: dict, mode: str = "words", hour12: bool = False) -> str:
    tz = zone(report["timeZone"])
    if mode == "dot":
        return "\u25cf" if report["peak"] else "\u25cb"
    if mode == "time":
        if not report["nextTransition"]:
            return "Peak" if report["peak"] else "Off-peak"
        marker = "\u25b2" if report["peak"] else "\u25bd"
        return f"{marker} {format_clock(report['nextTransition'], tz, hour12)}"
    if mode == "clock":
        return format_clock(report["now"], tz, hour12)
    if mode == "none":
        return ""
    return "Peak" if report["peak"] else "Off-peak"


def today_blocks_text(report: dict, hour12: bool = False) -> str:
    tz = zone(report["timeZone"])
    if not report["todayBlocks"]:
        if report["beijingWeekend"]:
            return "Off-peak all day (weekend in Beijing)"
        if report["beijingHoliday"]:
            return "Off-peak all day (Chinese public holiday)"
        return "Off-peak all day"
    return ",  ".join(
        f"{format_clock(start, tz, hour12)} \u2013 {format_clock(end, tz, hour12)}"
        for start, end in report["todayBlocks"]
    )


def window_table(timezone_name: str, hour12: bool = False) -> str:
    tz = zone(timezone_name)
    reference = dt.datetime.now(dt.timezone.utc)
    midnight = reference.replace(hour=0, minute=0, second=0, microsecond=0)
    rendered = []
    for start, end in PEAK_WINDOWS:
        rendered.append(
            f"{format_clock(midnight + dt.timedelta(minutes=start), tz, hour12)}"
            f" \u2013 "
            f"{format_clock(midnight + dt.timedelta(minutes=end), tz, hour12)}"
        )
    return ",  ".join(rendered)


def price_text(value: float) -> str:
    return f"${value:.2f}" if value >= 1 else f"${value:.3f}"


def as_json(report: dict) -> dict:
    """JSON-serializable view of a report."""
    tz = zone(report["timeZone"])
    hour12 = False
    transition = report["nextTransition"]
    return {
        "utcTime": report["now"].isoformat().replace("+00:00", "Z"),
        "tz": report["timeZone"],
        "localTime": report["now"].astimezone(tz).isoformat(),
        "utcOffset": report["utcOffset"],
        "peak": report["peak"],
        "status": report["status"],
        "reason": report["reason"],
        "multiplier": report["multiplier"],
        "nextTransition": None if transition is None else {
            "at": transition.isoformat().replace("+00:00", "Z"),
            "local": format_clock_with_day(transition, tz, report["now"], hour12),
            "peak": report["nextTransitionPeak"],
            "inSeconds": _round_half_up(report["msUntilTransition"] / 1000),
        },
        "localPeakBlocksToday": [
            {
                "start": format_clock(start, tz, hour12),
                "end": format_clock(end, tz, hour12),
                "startUtc": start.isoformat().replace("+00:00", "Z"),
                "endUtc": end.isoformat().replace("+00:00", "Z"),
            }
            for start, end in report["todayBlocks"]
        ],
        "holidayDataStale": report["holidayDataStale"],
        "holidaysKnownThrough": report["holidaysKnownThrough"],
        "pricingUrl": PRICING_URL,
        "referenceUrl": REFERENCE_URL,
        "models": MODELS,
    }


def _round_half_up(value: float) -> int:
    """Match JavaScript's Math.round, which rounds .5 towards positive infinity."""
    return int(math.floor(value + 0.5))
