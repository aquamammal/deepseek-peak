// Prints the JavaScript verdicts for every shared vector as JSON on stdout.
//
//     node tests/dump-verdicts.mjs
//
// The Python suite runs this to prove both implementations agree. Keeping it
// separate from core.test.mjs means the test runner's own output can never
// pollute the JSON.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isPeak, reason, nextTransition, compileHolidays } from '../extension/lib/core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(HERE, 'vectors.json'), 'utf8'));
const holidays = compileHolidays();

const verdicts = cases.map(vector => {
    const at = new Date(vector.at);
    const next = nextTransition(at, holidays);
    return {
        at: vector.at,
        peak: isPeak(at, holidays),
        reason: reason(at, holidays),
        // Second precision only, so Python's isoformat() matches exactly.
        next: next ? next.toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
        nextPeak: next ? isPeak(next, holidays) : null,
    };
});

process.stdout.write(`${JSON.stringify(verdicts, null, 2)}\n`);
