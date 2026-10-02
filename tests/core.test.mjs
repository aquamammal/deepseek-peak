// Run with:  node --test tests/core.test.mjs
//
// The vectors in vectors.json are shared with the Python suite in
// tests/test_deepseek_peak.py, so both implementations are pinned to the same
// expected answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    isPeak,
    reason,
    nextTransition,
    peakBlocksForBeijingDay,
    compileHolidays,
    isHolidayDataStale,
} from '../extension/lib/core.js';
import {
    evaluate,
    summarize,
    formatClock,
    formatDuration,
    panelLabel,
    todayBlocksText,
    windowTable,
} from '../extension/lib/format.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const holidays = compileHolidays();

// The fixture in tests/vectors.json is shared with the Python suite.
const VECTORS = JSON.parse(readFileSync(join(HERE, 'vectors.json'), 'utf8'));
const CASES = VECTORS.cases;
const TODAY_BLOCK_CASES = VECTORS.todayBlocks;

test('reference vectors', () => {
    for (const vector of CASES) {
        const at = new Date(vector.at);
        assert.equal(isPeak(at, holidays), vector.peak, `${vector.name}: isPeak`);
        assert.equal(reason(at, holidays), vector.reason, `${vector.name}: reason`);

        const next = nextTransition(at, holidays);
        if (vector.next === null) {
            assert.equal(next, null, `${vector.name}: nextTransition`);
        } else {
            assert.ok(next, `${vector.name}: expected a transition`);
            assert.equal(next.toISOString().replace('.000Z', 'Z'), vector.next,
                `${vector.name}: nextTransition`);
            assert.equal(isPeak(next, holidays), vector.nextPeak, `${vector.name}: nextPeak`);
        }
    }
});

test('today blocks rendered on local clocks', () => {
    for (const vector of TODAY_BLOCK_CASES) {
        const at = new Date(vector.at);
        const blocks = peakBlocksForBeijingDay(at, holidays).map(([start, end]) =>
            `${formatClock(start, vector.timeZone)}-${formatClock(end, vector.timeZone)}`);
        assert.deepEqual(blocks, vector.blocks, `${vector.name}: blocks`);

        const report = evaluate(at, { timeZone: vector.timeZone, holidays });
        assert.equal(report.nextTransitionPeak, vector.nextPeak, `${vector.name}: nextPeak`);
    }
});

test('the verdict is timezone independent', () => {
    const at = new Date('2026-09-10T12:00:00Z');
    const zones = ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'Europe/Berlin'];
    const peak = isPeak(at, holidays);
    for (const timeZone of zones) {
        const report = evaluate(at, { timeZone, holidays });
        assert.equal(report.peak, peak, `${timeZone}: peak`);
        assert.equal(report.nextTransition.toISOString(), nextTransition(at, holidays).toISOString(),
            `${timeZone}: next transition`);
    }
});

test('every transition lands exactly on a UTC window edge', () => {
    const edges = new Set([60, 240, 360, 600]);
    let at = new Date('2026-01-01T00:00:00Z');
    for (let step = 0; step < 800; step++) {
        const next = nextTransition(at, holidays);
        assert.ok(next, `no transition from ${at.toISOString()}`);
        const minutes = next.getUTCHours() * 60 + next.getUTCMinutes();
        assert.ok(edges.has(minutes), `${next.toISOString()} is not on a window edge`);
        assert.equal(next.getUTCSeconds(), 0);
        // Stepping to the transition itself must change the verdict.
        assert.notEqual(isPeak(next, holidays), isPeak(at, holidays));
        at = next;
    }
});

test('a Beijing day is never peak on a weekend or holiday', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    for (let day = 0; day < 365; day++) {
        const at = new Date(start.getTime() + day * 86400000);
        const blocks = peakBlocksForBeijingDay(at, holidays);
        const report = evaluate(at, { timeZone: 'UTC', holidays });
        if (report.beijingWeekend || report.beijingHoliday)
            assert.equal(blocks.length, 0, `${at.toISOString()} should be off-peak all day`);
    }
});

test('duration and label formatting', () => {
    assert.equal(formatDuration(0), '<1m');
    assert.equal(formatDuration(30 * 1000), '1m');
    assert.equal(formatDuration(60 * 1000), '1m');
    assert.equal(formatDuration(70 * 1000), '1m');
    assert.equal(formatDuration(90 * 1000), '2m');
    assert.equal(formatDuration(3 * 3600 * 1000 + 5 * 60 * 1000), '3h 05m');
    assert.equal(formatDuration(2 * 86400 * 1000 + 4 * 3600 * 1000), '2d 4h');
    assert.equal(formatDuration(-5), '<1m');

    assert.equal(formatClock(new Date('2026-09-10T21:00:00Z'), 'America/New_York'), '17:00');
    assert.equal(formatClock(new Date('2026-09-10T21:00:00Z'), 'America/New_York', true), '5:00 PM');
    assert.equal(formatClock(new Date('2026-09-10T00:30:00Z'), 'UTC', true), '12:30 AM');
    assert.equal(formatClock(new Date('2026-09-10T12:30:00Z'), 'UTC', true), '12:30 PM');
});

test('panel labels follow the mode', () => {
    const peakReport = evaluate(new Date('2026-09-10T02:00:00Z'), { timeZone: 'UTC', holidays });
    const offReport = evaluate(new Date('2026-09-10T12:00:00Z'), { timeZone: 'UTC', holidays });

    assert.equal(panelLabel(peakReport, 'words'), 'Peak');
    assert.equal(panelLabel(offReport, 'words'), 'Off-peak');
    assert.equal(panelLabel(peakReport, 'dot'), '\u25cf');
    assert.equal(panelLabel(offReport, 'dot'), '\u25cb');
    assert.equal(panelLabel(peakReport, 'none'), '');
    assert.equal(panelLabel(peakReport, 'time'), '\u25b2 04:00');
    assert.equal(panelLabel(offReport, 'time'), '\u25bd 01:00');
    assert.equal(panelLabel(peakReport, 'clock'), formatClock(peakReport.now, 'UTC'));
});

test('no peak day is announced for an off-peak day', () => {
    const report = evaluate(new Date('2026-10-05T02:00:00Z'), { timeZone: 'UTC', holidays });
    assert.equal(report.todayIsOffPeakAllDay, true);
    assert.match(todayBlocksText(report), /Off-peak all day/);
    assert.equal(report.reason, 'holiday');
});

test('summaries are one line and name the right state', () => {
    const peak = summarize(evaluate(new Date('2026-09-10T02:00:00Z'), { timeZone: 'UTC', holidays }));
    assert.match(peak, /^PEAK/);
    assert.doesNotMatch(peak, /\n/);

    const off = summarize(evaluate(new Date('2026-09-10T12:00:00Z'), { timeZone: 'UTC', holidays }));
    assert.match(off, /^OFF-PEAK/);
    assert.match(off, /next peak Fri 01:00/);
});

test('holiday data is flagged stale beyond the bundled range', () => {
    assert.equal(isHolidayDataStale(new Date('2026-12-31T12:00:00Z')), false);
    assert.equal(isHolidayDataStale(new Date('2027-01-01T00:00:00Z')), true);
});

test('2027 dates fall back to weekday rules with no holidays', () => {
    // 2027-01-01 is a Friday; with no bundled 2027 holidays the 01:00 UTC window
    // is still peak, which is exactly why the stale flag exists.
    const at = new Date('2027-01-01T02:00:00Z');
    const custom = compileHolidays({ 2027: ['2027-01-01'] });
    assert.equal(isPeak(at, holidays), true);
    assert.equal(isPeak(at, custom), false);
});
