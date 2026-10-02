"""Python twin of extension/lib/data.js.

Billing rules and Chinese public-holiday calendar for the DeepSeek API.

Source of truth: https://api-docs.deepseek.com/quick_start/pricing/
    "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday,
     excluding Chinese public holidays. All other hours are off-peak, including
     weekends and Chinese public holidays in full."
"""

# Peak windows as (start, end) minutes since UTC midnight, end exclusive.
PEAK_WINDOWS = ((1 * 60, 4 * 60), (6 * 60, 10 * 60))

# Every window edge, used when searching for the next rate change.
WINDOW_EDGES = (60, 240, 360, 600)

# Holidays are whole calendar days in Beijing time (UTC+8).
BEIJING_UTC_OFFSET_MINUTES = 8 * 60

# Peak rates are exactly twice off-peak rates.
PEAK_MULTIPLIER = 2

# 2026: 国办发明电〔2025〕7号
#   https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
# Only *holiday* days are listed; make-up workdays (调休) that fall on a weekend
# stay off-peak because the weekend itself is what the rule keys off.
# 2027: the State Council notice is not published yet (expected early Nov 2026).
BUNDLED_HOLIDAYS = {
    2026: (
        "2026-01-01", "2026-01-02", "2026-01-03",                                          # New Year
        "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",              # Spring Festival
        "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
        "2026-04-04", "2026-04-05", "2026-04-06",                                          # Qingming
        "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",              # Labour Day
        "2026-06-19", "2026-06-20", "2026-06-21",                                          # Dragon Boat
        "2026-09-25", "2026-09-26", "2026-09-27",                                          # Mid-Autumn
        "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",              # National Day
        "2026-10-06", "2026-10-07",
    ),
    2027: (),
}

CHINA_HOLIDAYS_KNOWN_THROUGH = "2026-12-31"

PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing/"
REFERENCE_URL = "https://seekpeak.dev/"

MODELS = (
    {
        "id": "deepseek-flash",
        "name": "deepseek-flash",
        "cache_hit": {"peak": 0.006, "off_peak": 0.003},
        "cache_miss": {"peak": 0.3, "off_peak": 0.15},
        "output": {"peak": 1.2, "off_peak": 0.6},
    },
    {
        "id": "deepseek-v4-pro",
        "name": "deepseek-v4-pro",
        "cache_hit": {"peak": 0.044, "off_peak": 0.022},
        "cache_miss": {"peak": 1.32, "off_peak": 0.66},
        "output": {"peak": 3.96, "off_peak": 1.98},
    },
)
