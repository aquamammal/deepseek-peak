// Pure evaluation of DeepSeek's peak / off-peak billing windows.
//
// The verdict is always computed on UTC. The local timezone only changes which
// clock the user reads, never the answer.
//
//   peak = (not weekend in Asia/Shanghai)
//          and (not a Chinese public holiday in Asia/Shanghai)
//          and (UTC time inside [01:00,04:00) or [06:00,10:00))

import {
    PEAK_WINDOWS,
    WINDOW_EDGES,
    BEIJING_UTC_OFFSET_MINUTES,
    BUNDLED_HOLIDAYS,
    CHINA_HOLIDAYS_KNOWN_THROUGH,
} from './data.js';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const LOOKAHEAD_DAYS = 400;

export const REASON = Object.freeze({
    WEEKEND: 'weekend',
    HOLIDAY: 'holiday',
    WINDOW: 'window',
});

/** Build fast lookup sets from a { year: [ "YYYY-MM-DD", ... ] } map. */
export function compileHolidays(map = BUNDLED_HOLIDAYS) {
    const dates = new Set();
    for (const list of Object.values(map)) {
        for (const day of list)
            dates.add(day);
    }
    return dates;
}

export function beijingParts(date) {
    const shifted = new Date(date.getTime() + BEIJING_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    return {
        year,
        month,
        day,
        weekday: shifted.getUTCDay(), // 0 = Sunday
        dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    };
}

export function isWeekendInBeijing(date) {
    const { weekday } = beijingParts(date);
    return weekday === 0 || weekday === 6;
}

export function isChineseHoliday(date, holidays = compileHolidays()) {
    return holidays.has(beijingParts(date).dateKey);
}

/** Minutes since UTC midnight, including fractional seconds. */
export function utcMinuteOfDay(date) {
    return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
}

export function isPeak(date, holidays = compileHolidays()) {
    if (isWeekendInBeijing(date))
        return false;
    if (isChineseHoliday(date, holidays))
        return false;
    const minute = utcMinuteOfDay(date);
    return PEAK_WINDOWS.some(([start, end]) => minute >= start && minute < end);
}

export function reason(date, holidays = compileHolidays()) {
    if (isWeekendInBeijing(date))
        return REASON.WEEKEND;
    if (isChineseHoliday(date, holidays))
        return REASON.HOLIDAY;
    return REASON.WINDOW;
}

/**
 * Find the instant at which the current verdict flips.
 *
 * Only UTC window edges can flip the verdict: the weekend flag changes exactly
 * when a Beijing day starts (16:00 UTC, i.e. an even hour) and the holiday flag
 * likewise, so probing window edges is sufficient. For each candidate edge we
 * re-evaluate at the edge itself, which is the first instant of the new state.
 */
export function nextTransition(date, holidays = compileHolidays()) {
    const current = isPeak(date, holidays);
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const nowMs = date.getTime();

    for (let day = 0; day <= LOOKAHEAD_DAYS; day++) {
        const dayStart = midnight + day * MS_PER_DAY;
        for (const edge of WINDOW_EDGES) {
            const candidateMs = dayStart + edge * MS_PER_MINUTE;
            if (candidateMs <= nowMs)
                continue;
            const candidate = new Date(candidateMs);
            if (isPeak(candidate, holidays) !== current)
                return candidate;
        }
    }
    return null;
}

/**
 * Peak blocks that overlap a given Beijing calendar day.
 * The rate can only be peak on a non-weekend, non-holiday Beijing weekday, so
 * an empty result means "off-peak all day".
 */
export function peakBlocksForBeijingDay(date, holidays = compileHolidays()) {
    const { year, month, day } = beijingParts(date);
    // Midnight of that Beijing day, as a real UTC instant.
    const beijingDayStartUtc =
        Date.UTC(year, month - 1, day) - BEIJING_UTC_OFFSET_MINUTES * MS_PER_MINUTE;
    const dayEndUtc = beijingDayStartUtc + MS_PER_DAY;
    const blocks = [];

    for (const [start, end] of PEAK_WINDOWS) {
        // The windows are anchored to UTC midnight, not to the Beijing day.
        const startMs = Math.max(beijingDayStartUtc, dayStart(date) + start * MS_PER_MINUTE);
        const endMs = Math.min(dayEndUtc, dayStart(date) + end * MS_PER_MINUTE);
        if (endMs <= startMs)
            continue;
        const probe = new Date(startMs);
        if (isWeekendInBeijing(probe) || isChineseHoliday(probe, holidays))
            continue;
        blocks.push([probe, new Date(endMs)]);
    }
    return blocks;
}

/** UTC midnight of the UTC day containing `date`. */
function dayStart(date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** True when a Beijing calendar day carries no peak billing at all. */
export function isOffPeakDay(date, holidays = compileHolidays()) {
    return peakBlocksForBeijingDay(date, holidays).length === 0;
}

export function isHolidayDataStale(date) {
    const { dateKey } = beijingParts(date);
    return dateKey > CHINA_HOLIDAYS_KNOWN_THROUGH;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}
