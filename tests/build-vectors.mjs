// The shared fixture: tests/vectors.json
//
// Both the JavaScript suite (tests/core.test.mjs) and the Python suite
// (tests/test_deepseek_peak.py) read that file, so the two implementations
// cannot drift apart silently.
//
// This script only exists to regenerate it:
//
//     node tests/build-vectors.mjs
//
// `at` is always a UTC instant. `next` is the instant at which the verdict
// flips, or null when none is found inside the lookahead.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export const CASES = [
    {
        name: 'mid peak window on a Beijing Friday',
        at: '2026-09-11T02:30:00Z', // Fri 10:30 Beijing
        peak: true,
        reason: 'window',
        next: '2026-09-11T04:00:00Z',
        nextPeak: false,
    },
    {
        name: 'between the two peak windows',
        at: '2026-09-11T04:30:00Z',
        peak: false,
        reason: 'window',
        next: '2026-09-11T06:00:00Z',
        nextPeak: true,
    },
    {
        name: 'the second window ends and the rate drops',
        at: '2026-09-11T09:59:00Z', // Fri 17:59 Beijing
        peak: true,
        reason: 'window',
        next: '2026-09-11T10:00:00Z',
        nextPeak: false,
    },
    {
        name: 'Saturday in Beijing is off-peak even inside a UTC window',
        at: '2026-09-12T02:00:00Z', // Sat 10:00 Beijing
        peak: false,
        reason: 'weekend',
        next: '2026-09-14T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'Sunday in Beijing, well after the last window edge of the UTC day',
        at: '2026-09-13T11:00:00Z',
        peak: false,
        reason: 'weekend',
        next: '2026-09-14T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'Monday 00:30 UTC is still off-peak; the Beijing week has begun',
        at: '2026-09-14T00:30:00Z', // Mon 08:30 Beijing
        peak: false,
        reason: 'window',
        next: '2026-09-14T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'inside the first window on a Friday morning',
        at: '2026-09-11T09:00:00Z',
        peak: true,
        reason: 'window',
        next: '2026-09-11T10:00:00Z',
        nextPeak: false,
    },
    {
        name: 'Chinese public holiday: National Day 2026',
        at: '2026-10-05T02:00:00Z', // Mon, but 2026-10-05 is a holiday
        peak: false,
        reason: 'holiday',
        next: '2026-10-08T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'the day the National Day holiday ends is an ordinary peak day',
        at: '2026-10-08T02:00:00Z', // Thu 10:00 Beijing
        peak: true,
        reason: 'window',
        next: '2026-10-08T04:00:00Z',
        nextPeak: false,
    },
    {
        name: 'Spring Festival 2026 swallows a whole week',
        at: '2026-02-18T07:00:00Z', // Wed, inside 02-15..02-23
        peak: false,
        reason: 'holiday',
        next: '2026-02-24T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'a weekend that is also a listed holiday reports the weekend',
        at: '2026-10-03T02:00:00Z', // Sat in Beijing, also a National Day holiday
        peak: false,
        reason: 'weekend',
        next: '2026-10-08T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'New Year 2026 falls on a Thursday',
        at: '2026-01-01T02:00:00Z', // Thu 10:00 Beijing
        peak: false,
        reason: 'holiday',
        next: '2026-01-05T01:00:00Z',
        nextPeak: true,
    },
    {
        name: 'a US DST spring-forward weekend stays a plain Beijing weekend',
        at: '2027-03-13T02:00:00Z', // Sat 10:00 Beijing (2027 holidays unpublished)
        peak: false,
        reason: 'weekend',
        next: '2027-03-15T01:00:00Z',
        nextPeak: true,
    },
];

// (at, local timezone) -> how today's peak blocks read on that local clock.
export const TODAY_BLOCK_CASES = [
    {
        name: 'New York, 2026-10-02 sits inside the Beijing National Day holiday',
        at: '2026-10-02T19:14:00Z',
        timeZone: 'America/New_York',
        blocks: [],
        nextPeak: true,
    },
    {
        name: 'New York sees the peak day start the evening before (EDT, UTC-4)',
        at: '2026-09-10T12:00:00Z',
        timeZone: 'America/New_York',
        blocks: ['21:00-00:00', '02:00-06:00'],
        nextPeak: true,
    },
    {
        name: 'Kolkata (UTC+5:30) shifts both windows later',
        at: '2026-09-10T12:00:00Z',
        timeZone: 'Asia/Kolkata',
        blocks: ['06:30-09:30', '11:30-15:30'],
        nextPeak: true,
    },
    {
        name: 'Auckland (UTC+12) pushes both windows into the afternoon',
        at: '2026-09-10T12:00:00Z',
        timeZone: 'Pacific/Auckland',
        blocks: ['13:00-16:00', '18:00-22:00'],
        nextPeak: true,
    },
    {
        name: 'UTC, with the windows unmoved',
        at: '2026-09-10T12:00:00Z',
        timeZone: 'UTC',
        blocks: ['01:00-04:00', '06:00-10:00'],
        nextPeak: true,
    },
];

const target = join(HERE, 'vectors.json');
writeFileSync(target, `${JSON.stringify({ cases: CASES, todayBlocks: TODAY_BLOCK_CASES }, null, 2)}\n`);
console.log(`wrote ${CASES.length} verdict vectors and ${TODAY_BLOCK_CASES.length} clock vectors to ${target}`);
