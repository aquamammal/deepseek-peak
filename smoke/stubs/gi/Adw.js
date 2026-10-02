// Stand-in for the Adw namespace, just enough for prefs.js to be exercised.

import { GObjectBase } from '../common.js';

class PrefsGroupBase extends GObjectBase {}

// Adw rows and groups are GObject classes, so `new Adw.X({...})` goes through
// _init exactly like the real widgets do.
function initCalling(klass) {
    return class extends klass {
        constructor(...args) {
            super();
            this._init(...args);
        }
    };
}

export class PreferencesGroupImpl extends PrefsGroupBase {
    _init(params = {}) {
        super._init(params);
        // The real widget has no such property; the tests use it to inspect the tree.
        this.rows = [];
    }

    add(row) {
        if (!row)
            throw new TypeError('PreferencesGroup.add() needs a row');
        this.rows.push(row);
    }
}

export const PreferencesGroup = initCalling(PreferencesGroupImpl);

export const PreferencesPage = initCalling(class extends PreferencesGroupImpl {});

export const ActionRow = initCalling(class extends GObjectBase {
    _init(params = {}) {
        super._init(params);
        this.suffixes = [];
    }

    add_suffix(widget) {
        if (!widget)
            throw new TypeError('add_suffix needs a widget');
        this.suffixes.push(widget);
    }
});

export const SwitchRow = initCalling(class extends GObjectBase {});

export const ComboRow = initCalling(class extends GObjectBase {
    _init(params = {}) {
        super._init(params);
        this._selected = params.selected ?? 0;
    }

    set selected(value) {
        const changed = this._selected !== value;
        this._selected = value;
        if (changed && typeof this.emit === 'function')
            this.emit('notify::selected');
    }

    get selected() {
        return this._selected;
    }
});

export default { PreferencesGroup, PreferencesPage, ActionRow, SwitchRow, ComboRow };
