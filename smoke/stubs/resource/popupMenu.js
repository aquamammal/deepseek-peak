import St from 'gi://St';

export class PopupBaseMenuItem extends St.Bin {
    _init(params = {}) {
        // The real constructor accepts a property bag or a plain label string.
        const text = typeof params === 'string' ? params : params.text ?? '';
        this._connections = [];
        super._init(typeof params === 'string' ? {} : params);
        this.label = new St.Label({ text });
        this.visible = true;
    }

    connect(signal, callback) {
        this._connections.push({ signal, callback });
        return this._connections.length;
    }

    activate() {
        for (const entry of this._connections)
            entry.callback();
    }
}

export class PopupMenuItem extends PopupBaseMenuItem {}

export class PopupSeparatorMenuItem extends PopupBaseMenuItem {}

export class PopupMenu {
    constructor(sourceActor) {
        this.sourceActor = sourceActor;
        this._items = [];
    }

    addMenuItem(item) {
        if (!item)
            throw new TypeError('addMenuItem needs an item');
        this._items.push(item);
        return item;
    }

    get items() {
        return [...this._items];
    }
}

export default { PopupMenu, PopupMenuItem, PopupSeparatorMenuItem, PopupBaseMenuItem };
