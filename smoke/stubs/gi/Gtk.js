// Stand-in for the Gtk namespace, just enough for prefs.js to be exercised.

import { GObjectBase } from '../common.js';

function initCalling(klass) {
    return class extends klass {
        constructor(...args) {
            super();
            this._init(...args);
        }
    };
}

export const Align = { CENTER: 0, FILL: 1, START: 2, END: 3 };

class StringListImpl extends GObjectBase {
    static new(items = []) {
        return new StringList({ items: [...items] });
    }

    _init(params = {}) {
        this.items = params.items ?? [];
        super._init(params);
    }

    get_n_items() {
        return this.items.length;
    }

    get_string(index) {
        return this.items[index];
    }
}

export const StringList = initCalling(StringListImpl);

class ButtonImpl extends GObjectBase {
    _init(params = {}) {
        this._connections = [];
        super._init(params);
        this.label = params.label ?? '';
        this.sensitive = params.sensitive ?? true;
    }

    connect(signal, callback) {
        this._connections.push({ signal, callback });
        return this._connections.length;
    }
}

export const Button = initCalling(ButtonImpl);

export function show_uri(parent, uri, timestamp) {
    if (!uri)
        throw new TypeError('show_uri needs a uri');
    globalThis.__openedUris = globalThis.__openedUris ?? [];
    globalThis.__openedUris.push(uri);
    return true;
}

export default { Align, StringList, Button, show_uri };
