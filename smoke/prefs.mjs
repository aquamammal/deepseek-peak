// Headless check that prefs.js builds its window without touching a missing API.
//
//     TZ=UTC node --import ./smoke/register.mjs smoke/prefs.mjs

import assert from 'node:assert/strict';

globalThis.stage = { name: 'stage' };

globalThis.__defaults = {
    'panel-mode': 'words',
    'hour12': false,
    'colourise': true,
    'notify-on-change': true,
    'auto-update-holidays': true,
    'holiday-feed-url': 'https://example.invalid/config.json',
    'holiday-overrides': '2026-10-01\n2026-10-02',
    'holiday-overrides-fetched-at': '2026-10-01T00:00:00.000Z',
};
globalThis.__initialSettings = {};

const { default: DeepSeekPeakPreferences } = await import('../extension/prefs.js');

const prefs = new DeepSeekPeakPreferences({ uuid: 'deepseek-peak@akuma.dev' });

// getSettings() hands out a fresh instance each call, exactly like the shell, so
// remember the one fillPreferencesWindow actually used.
let settingsUsed = null;
const originalGetSettings = prefs.getSettings.bind(prefs);
prefs.getSettings = () => {
    settingsUsed = originalGetSettings();
    return settingsUsed;
};
const window = {
    pages: [],
    add(page) {
        this.pages.push(page);
    },
};

const checks = [];
const debug = [];
function check(name, fn) {
    try {
        fn();
        checks.push({ name, ok: true });
    } catch (error) {
        checks.push({ name, ok: false, error, stack: error.stack });
    }
}

check('fillPreferencesWindow builds one page full of groups', () => {
    prefs.fillPreferencesWindow(window);
    assert.equal(window.pages.length, 1);
    const page = window.pages[0];
    assert.equal(page.title, 'DeepSeek Peak Hours');
    assert.ok(page.rows.length >= 4, `only ${page.rows.length} groups`);
    const titles = page.rows.map(group => group.title);
    assert.deepEqual(titles, ['Top bar', 'Notifications', 'Holiday calendar', 'About']);
});

check('every group has rows and the mode combo is pre-selected', () => {
    const page = window.pages[0];
    const [appearance] = page.rows;
    assert.ok(appearance.rows.length >= 3, 'the Top bar group is missing rows');
    const [modeRow] = appearance.rows;
    assert.equal(modeRow.title, 'Label');
    assert.equal(modeRow.selected, 0, 'panel-mode "words" should select the first entry');
    assert.equal(modeRow.model.get_n_items(), 5);
});

check('settings.bind is used for the switches', () => {
    const settings = settingsUsed;
    assert.ok(settings, 'fillPreferencesWindow never asked for settings');
    const bound = (settings._bindings ?? []).map(entry => entry.key).sort();
    assert.deepEqual(bound, ['auto-update-holidays', 'colourise', 'hour12', 'notify-on-change']);
});

check('changing the combo writes panel-mode back to settings', () => {
    const page = window.pages[0];
    const [appearance] = page.rows;
    const [modeRow] = appearance.rows;
    modeRow.selected = 3; // 'clock'
    assert.equal(settingsUsed.get_string('panel-mode'), 'clock');
});

check('the documentation links open externally', () => {
    const page = window.pages[0];
    const [about] = page.rows.slice(-1);
    const links = about.rows.filter(row => row.activatable);
    assert.equal(links.length, 2, `expected 2 links, found ${links.length}`);
    globalThis.__openedUris = [];
    for (const link of links)
        link._connections.find(entry => entry.signal === 'activated').callback();
    assert.ok(globalThis.__openedUris.some(uri => uri.includes('api-docs.deepseek.com')));
    assert.ok(globalThis.__openedUris.some(uri => uri.includes('seekpeak.dev')));
});

let failed = 0;
for (const result of checks) {
    if (result.ok) {
        console.log(`  ok    ${result.name}`);
    } else {
        failed++;
        console.log(`  FAIL  ${result.name}`);
        console.log(`        ${result.error.message.split('\n').join('\n        ')}`);
        console.log(`        ${(result.stack ?? '').split('\n').slice(1, 4).join('\n        ')}`);
    }
}

console.log(`\n${checks.length - failed}/${checks.length} prefs checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
