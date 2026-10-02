// Billing rules and Chinese public-holiday calendar for the DeepSeek API.
//
// Source of truth: https://api-docs.deepseek.com/quick_start/pricing/
//   "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday,
//    excluding Chinese public holidays. All other hours are off-peak, including
//    weekends and Chinese public holidays in full."
//
// Weekends are evaluated in Beijing time (Asia/Shanghai), matching DeepSeek's
// own wording and the reference implementation at https://seekpeak.dev/.

// Peak windows, as [startHourUtc, endHourUtc) in whole minutes since UTC midnight.
export const PEAK_WINDOWS = Object.freeze([
    Object.freeze([1 * 60, 4 * 60]),   // 01:00 - 04:00 UTC
    Object.freeze([6 * 60, 10 * 60]),  // 06:00 - 10:00 UTC
]);

// All window edges, used when searching for the next rate change.
export const WINDOW_EDGES = Object.freeze([60, 240, 360, 600]);

// Holidays are whole calendar days in Beijing time (UTC+8).
export const BEIJING_UTC_OFFSET_MINUTES = 8 * 60;

// The multiplier applied to peak rates ("peak (2x)").
export const PEAK_MULTIPLIER = 2;

// Chinese public holidays, per State Council notices (国办发明电).
// Only *holiday* days are listed. Make-up workdays (调休) that fall on a weekend
// stay off-peak, because the rule keys off the weekend itself.
//
// 2026: 国办发明电〔2025〕7号  (https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)
// 2027: announcement not published yet as of 2026-10; see CHINA_HOLIDAYS_KNOWN_THROUGH.
export const BUNDLED_HOLIDAYS = Object.freeze({
    2026: Object.freeze([
        '2026-01-01', '2026-01-02', '2026-01-03',                                             // New Year
        '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',                  // Spring Festival
        '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
        '2026-04-04', '2026-04-05', '2026-04-06',                                              // Qingming
        '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',                  // Labour Day
        '2026-06-19', '2026-06-20', '2026-06-21',                                              // Dragon Boat
        '2026-09-25', '2026-09-26', '2026-09-27',                                              // Mid-Autumn
        '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',                  // National Day
        '2026-10-06', '2026-10-07',
    ]),
    2027: Object.freeze([]),
});

// Last calendar month for which the bundled holiday list is believed complete.
// After this date the indicator flags that holiday data may be stale.
export const CHINA_HOLIDAYS_KNOWN_THROUGH = '2026-12-31';

export const PRICING_URL = 'https://api-docs.deepseek.com/quick_start/pricing/';
export const REFERENCE_URL = 'https://seekpeak.dev/';

// Per 1M tokens, USD. Off-peak is exactly half of peak.
export const MODELS = Object.freeze([
    Object.freeze({
        id: 'deepseek-flash',
        name: 'deepseek-flash',
        cacheHit: Object.freeze({ peak: 0.006, offPeak: 0.003 }),
        cacheMiss: Object.freeze({ peak: 0.3, offPeak: 0.15 }),
        output: Object.freeze({ peak: 1.2, offPeak: 0.6 }),
    }),
    Object.freeze({
        id: 'deepseek-v4-pro',
        name: 'deepseek-v4-pro',
        cacheHit: Object.freeze({ peak: 0.044, offPeak: 0.022 }),
        cacheMiss: Object.freeze({ peak: 1.32, offPeak: 0.66 }),
        output: Object.freeze({ peak: 3.96, offPeak: 1.98 }),
    }),
]);
