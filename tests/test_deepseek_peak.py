"""Python-side tests, plus a cross-check against the JavaScript implementation.

Run with:  python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lib"))

from deepseek_peak_core import (  # noqa: E402
    compile_holidays,
    is_chinese_holiday,
    is_holiday_data_stale,
    is_peak,
    is_weekend_in_beijing,
    next_transition,
    peak_blocks_for_beijing_day,
    reason,
)
from deepseek_peak_report import (  # noqa: E402
    as_json,
    evaluate,
    format_clock,
    format_duration,
    summarize,
    today_blocks_text,
    window_table,
)

VECTORS_PATH = os.path.join(ROOT, "tests", "vectors.json")


def load_vectors() -> dict:
    """Read the fixture that the JavaScript suite in tests/core.test.mjs uses."""
    with open(VECTORS_PATH, encoding="utf-8") as handle:
        return json.load(handle)


VECTORS = load_vectors()


def parse_utc(text: str) -> dt.datetime:
    return dt.datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(dt.timezone.utc)


class TestVerdicts(unittest.TestCase):
    def setUp(self):
        self.holidays = compile_holidays()

    def test_shared_vectors(self):
        for vector in VECTORS["cases"]:
            at = parse_utc(vector["at"])
            with self.subTest(vector["name"]):
                self.assertEqual(is_peak(at, self.holidays), vector["peak"])
                self.assertEqual(reason(at, self.holidays), vector["reason"])

                transition = next_transition(at, self.holidays)
                if vector["next"] is None:
                    self.assertIsNone(transition)
                else:
                    self.assertIsNotNone(transition)
                    self.assertEqual(transition.isoformat().replace("+00:00", "Z"),
                                     vector["next"])
                    self.assertEqual(is_peak(transition, self.holidays), vector["nextPeak"])

    def test_today_blocks(self):
        for vector in VECTORS["todayBlocks"]:
            at = parse_utc(vector["at"])
            rendered = [
                f"{format_clock(start, zone_of(vector['timeZone']))}"
                f"-{format_clock(end, zone_of(vector['timeZone']))}"
                for start, end in peak_blocks_for_beijing_day(at, self.holidays)
            ]
            with self.subTest(vector["name"]):
                self.assertEqual(rendered, vector["blocks"])

    def test_verdict_is_timezone_independent(self):
        at = parse_utc("2026-09-10T12:00:00Z")
        expected = next_transition(at, self.holidays)
        for name in ("UTC", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"):
            report = evaluate(at, timezone_name=name, holidays=self.holidays)
            self.assertEqual(report["peak"], is_peak(at, self.holidays))
            self.assertEqual(report["nextTransition"], expected)

    def test_transitions_land_on_window_edges(self):
        edges = {60, 240, 360, 600}
        at = parse_utc("2026-01-01T00:00:00Z")
        for _ in range(400):
            transition = next_transition(at, self.holidays)
            self.assertIsNotNone(transition)
            minutes = transition.hour * 60 + transition.minute
            self.assertIn(minutes, edges)
            self.assertEqual((transition.second, transition.microsecond), (0, 0))
            self.assertNotEqual(is_peak(transition, self.holidays), is_peak(at, self.holidays))
            at = transition


class TestFormatting(unittest.TestCase):
    def test_duration(self):
        self.assertEqual(format_duration(0), "<1m")
        self.assertEqual(format_duration(70_000), "1m")
        self.assertEqual(format_duration(90_000), "2m")
        self.assertEqual(format_duration(3 * 3600_000 + 5 * 60_000), "3h 05m")
        self.assertEqual(format_duration(2 * 86400_000 + 4 * 3600_000), "2d 4h")
        self.assertEqual(format_duration(-1), "<1m")

    def test_clock(self):
        moment = parse_utc("2026-09-10T21:00:00Z")
        self.assertEqual(format_clock(moment, zone_of("America/New_York")), "17:00")
        self.assertEqual(format_clock(moment, zone_of("America/New_York"), True), "5:00 PM")

    def test_summary_naming(self):
        peak = summarize(evaluate(parse_utc("2026-09-10T02:00:00Z"), timezone_name="UTC"))
        self.assertTrue(peak.startswith("PEAK"))
        self.assertNotIn("\n", peak)

        off = summarize(evaluate(parse_utc("2026-09-10T12:00:00Z"), timezone_name="UTC"))
        self.assertTrue(off.startswith("OFF-PEAK"))
        self.assertIn("next peak Fri 01:00", off)

    def test_window_table(self):
        rendered = window_table("UTC")
        self.assertIn("01:00", rendered)
        self.assertIn("06:00", rendered)
        rendered_ny = window_table("America/New_York")
        self.assertIn("21:00", rendered_ny)

    def test_holiday_day_is_off_peak_all_day(self):
        report = evaluate(parse_utc("2026-10-05T02:00:00Z"), timezone_name="UTC")
        self.assertTrue(report["todayIsOffPeakAllDay"])
        self.assertEqual(report["reason"], "holiday")
        self.assertIn("Off-peak all day", today_blocks_text(report))

    def test_json_round_trip(self):
        report = evaluate(parse_utc("2026-09-10T02:00:00Z"), timezone_name="America/New_York")
        payload = json.loads(json.dumps(as_json(report)))
        self.assertEqual(payload["status"], "peak")
        self.assertEqual(payload["multiplier"], 2)
        self.assertTrue(payload["nextTransition"]["at"].endswith("Z"))
        self.assertEqual(payload["tz"], "America/New_York")


class TestHolidayData(unittest.TestCase):
    def test_stale_flag(self):
        self.assertFalse(is_holiday_data_stale(parse_utc("2026-12-31T12:00:00Z")))
        self.assertTrue(is_holiday_data_stale(parse_utc("2027-01-01T00:00:00Z")))

    def test_2026_holidays_from_the_state_council_notice(self):
        # 国办发明电〔2025〕7号
        expected = {
            "2026-01-01", "2026-01-02", "2026-01-03",
            "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
            "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
            "2026-04-04", "2026-04-05", "2026-04-06",
            "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
            "2026-06-19", "2026-06-20", "2026-06-21",
            "2026-09-25", "2026-09-26", "2026-09-27",
            "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
            "2026-10-06", "2026-10-07",
        }
        self.assertEqual(set(compile_holidays()), expected)

    def test_make_up_workdays_are_still_off_peak(self):
        # 2026-02-28 (Sat) is a designated make-up workday, but the rule keys off
        # the Beijing weekend, so it stays off-peak.
        at = parse_utc("2026-02-28T02:00:00Z")
        self.assertTrue(is_weekend_in_beijing(at))
        self.assertFalse(is_peak(at, compile_holidays()))
        self.assertFalse(is_chinese_holiday(at, compile_holidays()))


class TestAgainstJavaScript(unittest.TestCase):
    """Both implementations must agree on every shared vector."""

    def test_javascript_matches(self):
        node = shutil.which("node")
        if node is None:
            self.skipTest("node is not installed")

        source = os.path.join(ROOT, "tests", "dump-verdicts.mjs")
        completed = subprocess.run(
            [node, source],
            capture_output=True, text=True, check=True, cwd=ROOT,
        )
        js = json.loads(completed.stdout)
        holidays = compile_holidays()

        self.assertEqual(len(js), len(VECTORS["cases"]))
        for entry in js:
            at = parse_utc(entry["at"])
            with self.subTest(entry["at"]):
                self.assertEqual(is_peak(at, holidays), entry["peak"])
                self.assertEqual(reason(at, holidays), entry["reason"])
                transition = next_transition(at, holidays)
                self.assertEqual(
                    None if transition is None else transition.isoformat().replace("+00:00", "Z"),
                    entry["next"],
                )
                self.assertEqual(
                    None if transition is None else is_peak(transition, holidays),
                    entry["nextPeak"],
                )


def zone_of(name: str) -> dt.tzinfo:
    from deepseek_peak_report import zone

    return zone(name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
