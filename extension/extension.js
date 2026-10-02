// DeepSeek Peak Hours — a GNOME Shell top-bar indicator.
//
// Shows whether the DeepSeek API is billed at peak (2x) or off-peak rates right
// now, and when the rate next changes. The verdict is computed on UTC and
// displayed on the user's own clock, sitting next to the clock in the top bar.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    REASON,
    compileHolidays,
} from './lib/core.js';
import {
    evaluate,
    panelLabel,
    todayBlocksText,
    windowTable,
    formatClockWithDay,
    formatDuration,
    pricingRows,
    priceText,
    DEFAULT_TIMEZONE,
} from './lib/format.js';
import {
    BUNDLED_HOLIDAYS,
    PRICING_URL,
    PEAK_MULTIPLIER,
} from './lib/data.js';

const REFRESH_SECONDS = 30;
const HOLIDAY_FETCH_INTERVAL_SECONDS = 24 * 60 * 60;
const COLOUR = {
    offPeak: '#8ce08a',
    peak: '#ffbd5a',
};

const REASON_TEXT = {
    [REASON.WEEKEND]: 'weekend in Beijing (Sat/Sun)',
    [REASON.HOLIDAY]: 'Chinese public holiday',
    [REASON.WINDOW]: 'inside a UTC peak window on a Beijing weekday',
};

const DeepSeekPeakIndicator = GObject.registerClass(
class DeepSeekPeakIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'DeepSeek Peak Hours', false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._holidays = this._buildHolidays();
        this._report = null;
        this._timers = [];
        this._fetchInFlight = false;
        this._settingsHandlers = [];
        this._firstRefresh = true;

        // `label` is PanelMenu.Button's own property, which the panel styles.
        // GNOME 46 removed St.Align, and Clutter.ActorAlign has no MIDDLE: it is
        // FILL / START / CENTER / END. CENTER is what the shell's own panel uses.
        this.label = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER });
        this.add_child(this.label);

        this._buildMenu();

        this._settingsHandlers.push(
            this._settings.connect('changed::panel-mode', () => this._refresh()),
            this._settings.connect('changed::hour12', () => this._refresh()),
            this._settings.connect('changed::colourise', () => this._refresh()),
            this._settings.connect('changed::holiday-overrides', () => {
                this._holidays = this._buildHolidays();
                this._refresh();
            }),
            this._settings.connect('changed::auto-update-holidays', () => {
                if (this._settings.get_boolean('auto-update-holidays'))
                    this._fetchHolidays();
            })
        );

        this._refresh();
        this._firstRefresh = false;
        this._addTimer(REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });

        if (this._settings.get_boolean('auto-update-holidays')) {
            this._fetchHolidays();
            this._addTimer(HOLIDAY_FETCH_INTERVAL_SECONDS, () => {
                if (this._settings.get_boolean('auto-update-holidays'))
                    this._fetchHolidays();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    /** Ask the shell to put us immediately before the clock in the centre box. */
    placeNextToClock() {
        const clockContainer = Main.panel.statusArea?.dateMenu?.container;
        const parent = clockContainer?.get_parent();
        if (!parent)
            return false;
        if (this.container.get_parent() === parent)
            parent.set_child_below_sibling(this.container, clockContainer);
        else
            parent.insert_child_below(this.container, clockContainer);
        return true;
    }

    _addTimer(seconds, callback) {
        const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, callback);
        this._timers.push(id);
        return id;
    }

    _buildHolidays() {
        const map = {};
        for (const [year, dates] of Object.entries(BUNDLED_HOLIDAYS))
            map[year] = [...dates];

        const extra = this._settings.get_string('holiday-overrides')
            .split('\n').map(line => line.trim()).filter(Boolean);
        if (extra.length > 0)
            map.fetched = extra;

        return compileHolidays(map);
    }

    /** The shell restyles its panel when the theme or accent colour changes. */
    onShellStyleChanged() {
        this._applyLabel();
    }

    /* ------------------------------------------------------------------ */
    /* menu                                                               */
    /* ------------------------------------------------------------------ */

    _buildMenu() {
        this._headerItem = this._menuItem('');
        this._transitionItem = this._menuItem('');
        this._reasonItem = this._menuItem('');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._todayItem = this._menuItem('');
        this._windowsItem = this._menuItem('');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._priceItems = new Map();
        for (const model of pricingRows())
            this._priceItems.set(model.id, this._menuItem(''));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._staleItem = this._menuItem('');
        this._staleItem.visible = false;

        this._aboutItem = new PopupMenu.PopupMenuItem('DeepSeek pricing documentation');
        this._aboutItem.connect('activate', () => this._openUrl(PRICING_URL));
        this.menu.addMenuItem(this._aboutItem);

        this._settingsItem = new PopupMenu.PopupMenuItem('Settings');
        this._settingsItem.connect('activate', () => this._openPreferences());
        this.menu.addMenuItem(this._settingsItem);
    }

    _menuItem(text) {
        const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
        this.menu.addMenuItem(item);
        return item;
    }

    _openUrl(url) {
        try {
            Gio.AppInfo.launch_default_for_uri(url, null);
        } catch (error) {
            logError(error, `deepseek-peak: cannot open ${url}`);
        }
    }

    _openPreferences() {
        try {
            this._extension.openPreferences();
        } catch (error) {
            logError(error, 'deepseek-peak: cannot open preferences');
        }
    }

    /* ------------------------------------------------------------------ */
    /* state                                                              */
    /* ------------------------------------------------------------------ */

    _refresh() {
        let report;
        try {
            report = evaluate(new Date(), {
                timeZone: DEFAULT_TIMEZONE,
                holidays: this._holidays,
                hour12: this._settings.get_boolean('hour12'),
            });
        } catch (error) {
            logError(error, 'deepseek-peak: evaluation failed');
            this.label.text = 'DeepSeek ?';
            return;
        }

        const previous = this._report;
        this._report = report;

        this._applyLabel();
        this._updateMenu(report);

        if (!this._firstRefresh && previous && previous.peak !== report.peak &&
            this._settings.get_boolean('notify-on-change'))
            this._notify(report);
    }

    _applyLabel() {
        if (!this._report)
            return;
        const report = this._report;
        this.label.text = panelLabel(
            report,
            this._settings.get_string('panel-mode'),
            this._settings.get_boolean('hour12')
        );

        if (!this._settings.get_boolean('colourise')) {
            this.label.set_style(null);
            return;
        }
        this.label.set_style(`color: ${report.peak ? COLOUR.peak : COLOUR.offPeak};`);
    }

    _updateMenu(report) {
        const tz = report.timeZone;
        const hour12 = this._settings.get_boolean('hour12');

        this._headerItem.label.text = report.peak
            ? `PEAK \u2014 billed at ${PEAK_MULTIPLIER}\u00d7 right now`
            : 'OFF-PEAK \u2014 billed at half price right now';
        this._headerItem.label.set_style(
            `color: ${report.peak ? COLOUR.peak : COLOUR.offPeak};`
        );

        if (report.nextTransition) {
            const when = formatClockWithDay(report.nextTransition, tz, report.now, hour12);
            const inText = formatDuration(report.msUntilTransition);
            this._transitionItem.label.text = report.nextTransitionPeak
                ? `Next peak starts ${when} (in ${inText})`
                : `Next rate change ${when} (in ${inText})`;
        } else {
            this._transitionItem.label.text = 'No rate change found';
        }

        this._reasonItem.label.text = report.peak
            ? `Peak because: ${REASON_TEXT[report.reason]}`
            : `Off-peak because: ${REASON_TEXT[report.reason]}`;

        this._todayItem.label.text = `Peak today: ${todayBlocksText(report, hour12)}`;

        this._windowsItem.label.text =
            `Daily peak windows: ${windowTable(tz, hour12)} (${report.utcOffset})`;

        for (const model of pricingRows()) {
            const item = this._priceItems.get(model.id);
            if (!item)
                continue;
            const input = report.peak ? model.cacheMiss.peak : model.cacheMiss.offPeak;
            const output = report.peak ? model.output.peak : model.output.offPeak;
            item.label.text = `${model.name}: in ${priceText(input)} / out ${priceText(output)}` +
                ` per 1M (${report.peak ? 'peak' : 'off-peak'})`;
        }

        if (report.holidayDataStale) {
            this._staleItem.label.text =
                `Holiday list ends ${report.holidaysKnownThrough}: later days assume no holiday`;
            this._staleItem.visible = true;
        } else {
            this._staleItem.visible = false;
        }
    }

    _notify(report) {
        const hour12 = this._settings.get_boolean('hour12');
        const when = report.nextTransition
            ? formatClockWithDay(report.nextTransition, report.timeZone, report.now, hour12)
            : null;
        const body = report.peak
            ? `DeepSeek is billing at ${PEAK_MULTIPLIER}\u00d7 peak rates now.` +
              (when ? ` Off-peak resumes at ${when}.` : '')
            : 'DeepSeek is billing off-peak (half price) now.' +
              (when ? ` Peak rates resume at ${when}.` : '');
        Main.notify('DeepSeek Peak Hours', body);
    }

    /* ------------------------------------------------------------------ */
    /* holiday feed                                                       */
    /* ------------------------------------------------------------------ */

    _fetchHolidays() {
        if (this._fetchInFlight)
            return;
        const url = this._settings.get_string('holiday-feed-url');
        if (!url)
            return;

        let file;
        try {
            file = Gio.File.new_tmp('deepseek-peak-XXXXXX.json')[0];
        } catch (error) {
            logError(error, 'deepseek-peak: cannot create temp file');
            return;
        }

        this._fetchInFlight = true;
        const separator = url.includes('?') ? '&' : '?';
        const source = Gio.File.new_for_uri(`${url}${separator}_=${Math.floor(Date.now() / 1000)}`);

        source.copy_async(
            file,
            Gio.FileCopyFlags.OVERWRITE,
            GLib.PRIORITY_DEFAULT,
            null,
            null,
            (self, result) => {
                this._fetchInFlight = false;
                try {
                    self.copy_finish(result);
                } catch (error) {
                    // Offline, DNS failure, rate limited: the bundled list stands.
                    log(`deepseek-peak: holiday feed fetch failed (${error.message})`);
                    return;
                }
                this._ingestHolidayFeed(file);
            }
        );
    }

    _ingestHolidayFeed(file) {
        let contents;
        try {
            const [, bytes] = file.load_contents(null);
            contents = new TextDecoder().decode(bytes);
        } catch (error) {
            logError(error, 'deepseek-peak: cannot read holiday feed');
            return;
        }

        let dates;
        try {
            const payload = JSON.parse(contents);
            dates = payload?.chinaPublicHolidays?.dates ??
                payload?.holidays ??
                (Array.isArray(payload) ? payload : null);
        } catch (error) {
            log(`deepseek-peak: holiday feed was not JSON (${error.message})`);
            return;
        }
        if (!Array.isArray(dates))
            return;

        const clean = [...new Set(dates
            .map(value => String(value).trim())
            .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
        if (clean.length === 0)
            return;

        const known = this._settings.get_string('holiday-overrides')
            .split('\n').map(line => line.trim()).filter(Boolean).sort();
        const today = new Date().toISOString().slice(0, 10);
        const fetchedToday =
            this._settings.get_string('holiday-overrides-fetched-at').startsWith(today);
        if (fetchedToday && known.join() === clean.join())
            return;

        this._settings.set_string('holiday-overrides', clean.join('\n'));
        this._settings.set_string('holiday-overrides-fetched-at', new Date().toISOString());
    }

    destroy() {
        for (const id of this._timers)
            GLib.Source.remove(id);
        this._timers = [];

        for (const handler of this._settingsHandlers)
            this._settings.disconnect(handler);
        this._settingsHandlers = [];

        super.destroy();
    }
});

export default class DeepSeekPeakExtension extends Extension {
    enable() {
        this._indicator = new DeepSeekPeakIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'center');
        this._indicator.placeNextToClock();

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._styleId = themeContext.connect('changed', () => this._indicator?.onShellStyleChanged());
    }

    disable() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        if (this._styleId) {
            themeContext.disconnect(this._styleId);
            this._styleId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
    }
}
