// Headless smoke test for extension.js.
//
//     node smoke/run.mjs
//
// Loads the real extension module against the GJS stubs in smoke/stubs, then
// checks the things that are easy to get wrong and impossible to see from the
// logic tests: the panel placement, the label, settings wiring, the refresh
// timer, notifications, and that disable() leaves nothing behind.

import assert from 'node:assert/strict';

import { MockRegistry } from './stubs/common.js';
import * as Main from './stubs/resource/main.js';
import * as St from './stubs/gi/St.js';

const RealDate = Date;
let frozen = '2026-09-10T02:00:00Z';

class FrozenDate extends RealDate {
    constructor(...args) {
        if (args.length === 0)
            super(frozen);
        else
            super(...args);
    }

    static now() {
        return new RealDate(frozen).getTime();
    }
}

// Date.UTC() and friends must survive the subclassing above.
Object.assign(FrozenDate, RealDate);

globalThis.Date = FrozenDate;

// GJS exposes the Clutter stage as a global; the extension reads it to hook
// theme changes.
globalThis.stage = { name: 'stage' };

// The smoke test is only meaningful on a fixed clock, so run it with TZ=UTC
// (see smoke/README.md). Fail loudly rather than assert locale-dependent text.
const RESOLVED_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (RESOLVED_ZONE !== 'UTC') {
    console.error(`smoke/run.mjs must run with TZ=UTC, but the zone resolved to ${RESOLVED_ZONE}.`);
    console.error('Run it as:  TZ=UTC node --import ./smoke/register.mjs smoke/run.mjs');
    process.exit(1);
}

// Mirrors extension/schemas/...gschema.xml; an unknown key throws in Gio.Settings.
globalThis.__defaults = {
    'panel-mode': 'words',
    'hour12': false,
    'colourise': true,
    'notify-on-change': true,
    'auto-update-holidays': false,
    'holiday-feed-url': '',
    'holiday-overrides': '',
    'holiday-overrides-fetched-at': '',
};
globalThis.__initialSettings = {};

const checks = [];
function check(name, fn) {
    try {
        fn();
        checks.push({ name, ok: true });
    } catch (error) {
        checks.push({ name, ok: false, error });
    }
}

function setNow(iso) {
    frozen = iso;
}

/** Menu texts, ignoring the separator rows, which have no label. */
function menuTexts(indicator) {
    return indicator.menu.items
        .map(item => item.label?.text)
        .filter(text => typeof text === 'string');
}

function findItem(indicator, predicate) {
    return indicator.menu.items.find(item =>
        typeof item.label?.text === 'string' && predicate(item.label.text));
}

function freshSettings(overrides = {}) {
    globalThis.__initialSettings = { ...overrides };
}

const { default: DeepSeekPeakExtension } = await import('../extension/extension.js');

// ---------------------------------------------------------------------------
// enable(): sits in the centre box, right before the clock
// ---------------------------------------------------------------------------
MockRegistry.reset();
Main._resetPanel();
freshSettings();

const extension = new DeepSeekPeakExtension({ uuid: 'deepseek-peak@akuma.dev' });
extension.enable();

const indicator = extension._indicator;
const clockContainer = Main.panel.statusArea.dateMenu.container;

check('extension registers through GObject.registerClass', () => {
    assert.ok(MockRegistry.registeredClasses?.includes('DeepSeekPeakIndicator'),
        'DeepSeekPeakIndicator was never registered');
});

check('the indicator lives in the centre box', () => {
    assert.equal(indicator.container.get_parent(), Main.panel._centerBox);
});

check('the indicator sits immediately before the clock', () => {
    const children = Main.panel._centerBox.get_children();
    const ours = children.indexOf(indicator.container);
    const clock = children.indexOf(clockContainer);
    assert.equal(ours, clock - 1, `siblings were ${children.map(c => c.name).join(', ')}`);
});

check('peak is labelled and coloured while inside a window', () => {
    assert.equal(indicator.label.text, 'Peak');
    assert.match(indicator.label.style, /#ffbd5a/);
});

check('a refresh timer is scheduled', () => {
    assert.equal(MockRegistry.timers.size, 1, `${MockRegistry.timers.size} timers`);
    const [timer] = [...MockRegistry.timers.values()];
    assert.equal(timer.seconds, 30);
});

// ---------------------------------------------------------------------------
// Menu contents
// ---------------------------------------------------------------------------
check('menu reports the next rate change and the reason', () => {
    const texts = menuTexts(indicator);
    assert.ok(texts.some(text => text.startsWith('PEAK')), texts.join(' | '));
    assert.ok(texts.some(text => text.includes('Next rate change 04:00')), texts.join(' | '));
    assert.ok(texts.some(text => text.includes('Peak because: inside a UTC peak window')),
        texts.join(' | '));
    assert.ok(texts.some(text => text.startsWith('Peak today: 01:00')), texts.join(' | '));
    assert.ok(texts.some(text => text.startsWith('Daily peak windows: 01:00')),
        texts.join(' | '));
    assert.ok(texts.some(text => text.includes('deepseek-flash: in $0.30')), texts.join(' | '));
});

check('active menu items open the docs and the preferences', () => {
    const about = findItem(indicator, text => text.includes('DeepSeek pricing documentation'));
    const prefs = findItem(indicator, text => text === 'Settings');
    assert.ok(about && prefs,
        `menu is missing the actions; labels were ${JSON.stringify(menuTexts(indicator))}`);
    about.activate();
    prefs.activate();
    assert.ok(globalThis.__openedUris?.some(uri => uri.includes('api-docs.deepseek.com')),
        'pricing documentation was not opened');
    assert.equal(extension._openedPreferences, 1);
});

// ---------------------------------------------------------------------------
// Settings are live
// ---------------------------------------------------------------------------
check('changing panel-mode relabels without rebuilding', () => {
    const settings = indicator._settings;
    settings.set_string('panel-mode', 'time');
    assert.equal(indicator.label.text, '\u25b2 04:00'); // TZ=UTC, so the window edge reads as-is
    settings.set_string('panel-mode', 'dot');
    assert.equal(indicator.label.text, '\u25cf');
    settings.set_string('panel-mode', 'words');
    assert.equal(indicator.label.text, 'Peak');
});

check('turning colour off clears the inline style', () => {
    indicator._settings.set_boolean('colourise', false);
    assert.equal(indicator.label.style, null);
    indicator._settings.set_boolean('colourise', true);
    assert.match(indicator.label.style, /#ffbd5a/);
});

check('a downloaded holiday list changes the verdict', () => {
    // 2026-09-10 is not a bundled holiday; adding it must flip peak to off-peak.
    indicator._settings.set_string('holiday-overrides', '2026-09-10');
    assert.equal(indicator.label.text, 'Off-peak');
    assert.match(indicator.label.style, /#8ce08a/);
    indicator._settings.set_string('holiday-overrides', '');
    assert.equal(indicator.label.text, 'Peak');
});

// ---------------------------------------------------------------------------
// Refresh timer, transitions, notifications
// ---------------------------------------------------------------------------
check('the refresh timer re-evaluates on demand', () => {
    assert.equal(indicator._settings.get_string('panel-mode'), 'words',
        'an earlier check left panel-mode changed');
    setNow('2026-09-10T12:00:00Z'); // off-peak
    assert.equal(MockRegistry.fire(30), 1, 'the 30s timer did not fire');
    assert.equal(indicator.label.text, 'Off-peak');
    assert.match(indicator.label.style, /#8ce08a/);
});

check('the menu follows the new state', () => {
    const texts = menuTexts(indicator);
    assert.ok(texts.some(text => text.startsWith('OFF-PEAK')), texts.join(' | '));
    assert.ok(texts.some(text => text.includes('Next peak starts Fri 01:00')), texts.join(' | '));
    assert.ok(texts.some(text => text.includes('Off-peak because: inside a UTC peak window')),
        texts.join(' | '));
});

check('a rate change sends one notification', () => {
    MockRegistry.notifications = [];
    setNow('2026-09-10T01:30:00Z'); // peak again
    MockRegistry.fire(30);
    assert.equal(MockRegistry.notifications.length, 1);
    const [notification] = MockRegistry.notifications;
    assert.equal(notification.title, 'DeepSeek Peak Hours');
    assert.match(notification.body, /peak rates now/);
    assert.match(notification.body, /Off-peak resumes at/);
});

check('notifications can be turned off', () => {
    MockRegistry.notifications = [];
    indicator._settings.set_boolean('notify-on-change', false);
    setNow('2026-09-10T12:00:00Z'); // back to off-peak, so a change really did happen
    MockRegistry.fire(30);
    assert.equal(indicator.label.text, 'Off-peak', 'the state did not change');
    assert.equal(MockRegistry.notifications.length, 0, 'a notification was sent anyway');
    indicator._settings.set_boolean('notify-on-change', true);
});

check('the stale-holiday warning appears once the list runs out', () => {
    setNow('2027-01-04T02:00:00Z');
    MockRegistry.fire(30);
    const stale = indicator.menu.items.find(item =>
        item.visible && typeof item.label?.text === 'string' && item.label.text.startsWith('Holiday list ends'));
    assert.ok(stale, 'the stale flag was not surfaced');
    assert.match(stale.label.text, /2026-12-31/);
});

// ---------------------------------------------------------------------------
// disable(): nothing left running
// ---------------------------------------------------------------------------
check('disable() clears timers, handlers and the panel child', () => {
    const settingsConnections = indicator._settings._connections.length;
    assert.ok(settingsConnections > 0, 'expected settings handlers to be connected');
    extension.disable();
    assert.equal(MockRegistry.timers.size, 0, 'a timer survived disable()');
    assert.equal(indicator._settings._connections.length, 0, 'a settings handler survived disable()');
    assert.equal(MockRegistry.connections.filter(entry => entry.target === indicator).length, 0,
        'an indicator signal survived disable()');
    assert.ok(indicator.destroyed, 'the indicator was not destroyed');
});

// ---------------------------------------------------------------------------
// Theme changes must not throw
// ---------------------------------------------------------------------------
check('a shell style change re-applies the colour', () => {
    MockRegistry.reset();
    Main._resetPanel();
    freshSettings();
    setNow('2026-09-10T02:00:00Z');
    const second = new DeepSeekPeakExtension({ uuid: 'deepseek-peak@akuma.dev' });
    second.enable();
    const context = St.ThemeContext._instances.at(-1);
    second._indicator.label.set_style(null);
    context.emit('changed');
    assert.match(second._indicator.label.style, /#ffbd5a/);
    second.disable();
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let failed = 0;
for (const result of checks) {
    if (result.ok) {
        console.log(`  ok    ${result.name}`);
    } else {
        failed++;
        console.log(`  FAIL  ${result.name}`);
        console.log(`        ${result.error.message.split('\n').join('\n        ')}`);
    }
}

console.log(`\n${checks.length - failed}/${checks.length} smoke checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
