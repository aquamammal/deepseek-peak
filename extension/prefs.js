// Preferences for DeepSeek Peak Hours.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { PRICING_URL, REFERENCE_URL, BUNDLED_HOLIDAYS } from './lib/data.js';

export default class DeepSeekPeakPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'DeepSeek Peak Hours',
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(page);

        /* ---------------------------------------------------------------- */
        const appearance = new Adw.PreferencesGroup({
            title: 'Top bar',
            description: 'What the indicator next to the clock shows.',
        });
        page.add(appearance);

        const modes = [
            ['words', 'Peak / Off-peak'],
            ['time', 'Next change time'],
            ['dot', 'Dot only'],
            ['clock', 'Local clock'],
            ['none', 'Nothing'],
        ];

        const modeRow = new Adw.ComboRow({
            title: 'Label',
            subtitle: 'Applies immediately, no reload needed.',
            model: Gtk.StringList.new(modes.map(([, label]) => label)),
        });
        const modeIndex = Math.max(0, modes.findIndex(([value]) =>
            value === settings.get_string('panel-mode')));
        modeRow.selected = modeIndex;
        modeRow.connect('notify::selected', () => {
            const [value] = modes[modeRow.selected] ?? modes[0];
            settings.set_string('panel-mode', value);
        });
        appearance.add(modeRow);

        const colourRow = new Adw.SwitchRow({
            title: 'Colour the label',
            subtitle: 'Green when off-peak, amber when peak.',
            active: settings.get_boolean('colourise'),
        });
        settings.bind('colourise', colourRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(colourRow);

        const hour12Row = new Adw.SwitchRow({
            title: '12-hour clock',
            subtitle: 'Use AM/PM in the menu and the "Next change time" label.',
            active: settings.get_boolean('hour12'),
        });
        settings.bind('hour12', hour12Row, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(hour12Row);

        /* ---------------------------------------------------------------- */
        const notifications = new Adw.PreferencesGroup({ title: 'Notifications' });
        page.add(notifications);

        const notifyRow = new Adw.SwitchRow({
            title: 'Notify when the rate changes',
            subtitle: 'A desktop notification at each peak / off-peak boundary.',
            active: settings.get_boolean('notify-on-change'),
        });
        settings.bind('notify-on-change', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        notifications.add(notifyRow);

        /* ---------------------------------------------------------------- */
        const holidays = new Adw.PreferencesGroup({
            title: 'Holiday calendar',
            description: 'Chinese public holidays are off-peak all day. ' +
                'Weekends in Beijing time are off-peak too.',
        });
        page.add(holidays);

        const years = Object.keys(BUNDLED_HOLIDAYS).sort();
        const bundled = years
            .map(year => `${year}: ${BUNDLED_HOLIDAYS[year].length} days`)
            .join('   \u00b7   ');
        holidays.add(new Adw.ActionRow({
            title: 'Bundled list',
            subtitle: bundled || 'Empty',
        }));

        const fetchRow = new Adw.SwitchRow({
            title: 'Refresh the holiday list daily',
            subtitle: 'Downloads a public list once a day so future years stay correct.',
            active: settings.get_boolean('auto-update-holidays'),
        });
        settings.bind('auto-update-holidays', fetchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        holidays.add(fetchRow);

        const fetchedAt = settings.get_string('holiday-overrides-fetched-at');
        const downloaded = settings.get_string('holiday-overrides')
            .split('\n').filter(Boolean).length;
        const statusRow = new Adw.ActionRow({
            title: 'Downloaded list',
            subtitle: downloaded > 0
                ? `${downloaded} dates${fetchedAt ? `, last refreshed ${fetchedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}`
                : 'Nothing downloaded yet, using the bundled list.',
        });
        const clearButton = new Gtk.Button({
            label: 'Clear',
            valign: Gtk.Align.CENTER,
            sensitive: downloaded > 0,
        });
        clearButton.connect('clicked', () => {
            settings.set_string('holiday-overrides', '');
            settings.set_string('holiday-overrides-fetched-at', '');
            statusRow.subtitle = 'Nothing downloaded yet, using the bundled list.';
            clearButton.sensitive = false;
        });
        statusRow.add_suffix(clearButton);
        holidays.add(statusRow);

        /* ---------------------------------------------------------------- */
        const about = new Adw.PreferencesGroup({ title: 'About' });
        page.add(about);

        about.add(new Adw.ActionRow({
            title: 'Rules',
            subtitle: 'Peak 01:00\u201304:00 and 06:00\u201310:00 UTC, Monday\u2013Friday, ' +
                'excluding Chinese public holidays. Everything else is off-peak.',
        }));

        const link = new Adw.ActionRow({
            title: 'DeepSeek pricing documentation',
            subtitle: PRICING_URL,
            activatable: true,
        });
        link.connect('activated', () => Gtk.show_uri(window, PRICING_URL, 0));
        about.add(link);

        const reference = new Adw.ActionRow({
            title: 'Rule reference',
            subtitle: REFERENCE_URL,
            activatable: true,
        });
        reference.connect('activated', () => Gtk.show_uri(window, REFERENCE_URL, 0));
        about.add(reference);
    }
}
