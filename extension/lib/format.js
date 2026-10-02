// Turning a verdict into text the panel and menu can show.
//
// Everything user-facing that depends on a timezone lives here, so that the
// GNOME extension and the `deepseek-peak` CLI can share one implementation.

import {
    PEAK_WINDOWS,
    PEAK_MULTIPLIER,
    MODELS,
    PRICING_URL,
    REFERENCE_URL,
    CHINA_HOLIDAYS_KNOWN_THROUGH,
} from './data.js';
import {
    REASON,
    isPeak,
    reason,
    nextTransition,
    peakBlocksForBeijingDay,
    isOffPeakDay,
    isHolidayDataStale,
    isWeekendInBeijing,
    isChineseHoliday,
    compileHolidays,
} from './core.js';

const MS_PER_MINUTE = 60 * 1000;

export const DEFAULT_TIMEZONE =
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

/** Resolve the local UTC offset (minutes east of UTC) for a given instant. */
export function offsetMinutes(date, timeZone) {
    if (!timeZone || timeZone === 'UTC')
        return 0;
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        const parts = Object.fromEntries(
            formatter.formatToParts(date).map(part => [part.type, part.value])
        );
        const asUtc = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour) % 24,
            Number(parts.minute),
            Number(parts.second)
        );
        return Math.round((asUtc - date.getTime()) / MS_PER_MINUTE);
    } catch {
        return -date.getTimezoneOffset();
    }
}

function localParts(date, timeZone) {
    const offset = offsetMinutes(date, timeZone);
    const shifted = new Date(date.getTime() + offset * MS_PER_MINUTE);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        offset,
    };
}

export function localDateKey(date, timeZone) {
    const { year, month, day } = localParts(date, timeZone);
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function utcOffsetLabel(date, timeZone) {
    const offset = offsetMinutes(date, timeZone);
    const sign = offset < 0 ? '-' : '+';
    const abs = Math.abs(offset);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return minutes === 0
        ? `UTC${sign}${hours}`
        : `UTC${sign}${hours}:${pad2(minutes)}`;
}

/** "14:30" or "2:30 PM". */
export function formatClock(date, timeZone, hour12 = false) {
    const { hour, minute } = localParts(date, timeZone);
    if (!hour12)
        return `${pad2(hour)}:${pad2(minute)}`;
    const suffix = hour < 12 ? 'AM' : 'PM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${pad2(minute)} ${suffix}`;
}

/** "Sat 14:30" — weekday prefix included only when it is not the same local day. */
export function formatClockWithDay(date, timeZone, referenceDate, hour12 = false) {
    const clock = formatClock(date, timeZone, hour12);
    if (localDateKey(date, timeZone) === localDateKey(referenceDate, timeZone))
        return clock;
    return `${WEEKDAYS[localParts(date, timeZone).weekday]} ${clock}`;
}

export const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

/** Compact duration: "22m", "3h 05m", "2d 4h". */
export function formatDuration(ms) {
    if (ms < 0)
        ms = 0;
    const totalMinutes = Math.round(ms / MS_PER_MINUTE);
    if (totalMinutes < 1)
        return '<1m';
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0)
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0)
        return minutes > 0 ? `${hours}h ${pad2(minutes)}m` : `${hours}h`;
    return `${minutes}m`;
}

function describeReason(date, holidays) {
    const why = reason(date, holidays);
    if (why === REASON.WEEKEND)
        return 'weekend (Beijing time)';
    if (why === REASON.HOLIDAY)
        return 'Chinese public holiday';
    return 'UTC peak window';
}

/**
 * Full snapshot of the current billing state plus everything the UI wants.
 */
export function evaluate(now = new Date(), options = {}) {
    const {
        timeZone = DEFAULT_TIMEZONE,
        holidays = compileHolidays(),
        hour12 = false,
    } = options;

    const peak = isPeak(now, holidays);
    const why = reason(now, holidays);
    const transition = nextTransition(now, holidays);
    const todayBlocks = peakBlocksForBeijingDay(now, holidays);

    return {
        now,
        timeZone,
        peak,
        status: peak ? 'peak' : 'off-peak',
        reason: why,
        reasonText: describeReason(now, holidays),
        multiplier: peak ? PEAK_MULTIPLIER : 1,
        nextTransition: transition,
        nextTransitionPeak: transition ? isPeak(transition, holidays) : null,
        msUntilTransition: transition ? transition.getTime() - now.getTime() : null,
        utcOffset: utcOffsetLabel(now, timeZone),
        beijingWeekend: isWeekendInBeijing(now),
        beijingHoliday: isChineseHoliday(now, holidays),
        todayIsOffPeakAllDay: isOffPeakDay(now, holidays),
        todayBlocks,
        holidayDataStale: isHolidayDataStale(now),
        holidaysKnownThrough: CHINA_HOLIDAYS_KNOWN_THROUGH,
    };
}

/** One-line human summary, as printed by the CLI. */
export function summarize(report, hour12 = false) {
    const { now, timeZone } = report;
    const head = report.peak
        ? `PEAK — billed at ${PEAK_MULTIPLIER}x until ${formatClock(report.nextTransition, timeZone, hour12)}`
        : `OFF-PEAK — ${PEAK_MULTIPLIER}x cheaper`;

    const tail = report.nextTransition
        ? report.nextTransitionPeak
            ? `next peak ${formatClockWithDay(report.nextTransition, timeZone, now, hour12)}` +
              ` (in ${formatDuration(report.msUntilTransition)})`
            : `next rate change ${formatClockWithDay(report.nextTransition, timeZone, now, hour12)}` +
              ` (in ${formatDuration(report.msUntilTransition)})`
        : 'no transition found';

    return `${head} · ${tail} · ${report.reasonText}`;
}

/** Short panel text. */
export function panelLabel(report, mode = 'words', hour12 = false) {
    const { timeZone, now } = report;
    switch (mode) {
    case 'dot':
        return report.peak ? '\u25CF' : '\u25CB';
    case 'time':
        if (!report.nextTransition)
            return report.peak ? 'Peak' : 'Off-peak';
        return report.peak
            ? `\u25B2 ${formatClock(report.nextTransition, timeZone, hour12)}`
            : `\u25BD ${formatClock(report.nextTransition, timeZone, hour12)}`;
    case 'clock':
        return formatClock(now, timeZone, hour12);
    case 'none':
        return '';
    case 'words':
    default:
        return report.peak ? 'Peak' : 'Off-peak';
    }
}

/** Peak blocks for today expressed on the user's own clock. */
export function todayBlocksText(report, hour12 = false) {
    const { timeZone } = report;
    if (report.todayBlocks.length === 0) {
        if (report.beijingWeekend)
            return 'Off-peak all day (weekend in Beijing)';
        if (report.beijingHoliday)
            return 'Off-peak all day (Chinese public holiday)';
        return 'Off-peak all day';
    }
    return report.todayBlocks
        .map(([start, end]) =>
            `${formatClock(start, timeZone, hour12)} \u2013 ${formatClock(end, timeZone, hour12)}`)
        .join(',  ');
}

/** The canonical UTC windows rendered in local time, for the menu footer. */
export function windowTable(timeZone, hour12 = false) {
    const reference = new Date();
    return PEAK_WINDOWS.map(([start, end]) => {
        const startDate = utcMinutesToDate(reference, start);
        const endDate = utcMinutesToDate(reference, end);
        return `${formatClock(startDate, timeZone, hour12)} \u2013 ${formatClock(endDate, timeZone, hour12)}`;
    }).join(',  ');
}

function utcMinutesToDate(reference, minutes) {
    return new Date(Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth(),
        reference.getUTCDate(),
        Math.floor(minutes / 60),
        minutes % 60
    ));
}

export function pricingRows() {
    return MODELS.map(model => ({
        id: model.id,
        name: model.name,
        cacheHit: model.cacheHit,
        cacheMiss: model.cacheMiss,
        output: model.output,
    }));
}

export function priceText(value) {
    if (value >= 1)
        return `$${value.toFixed(2)}`;
    return `$${value.toFixed(3)}`;
}

export { PRICING_URL, REFERENCE_URL, PEAK_MULTIPLIER };

function pad2(value) {
    return String(value).padStart(2, '0');
}
