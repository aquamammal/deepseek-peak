// Minimal stand-ins for the GNOME Shell runtime, so extension.js can be
// exercised headlessly by smoke/run.mjs.
//
// These exist only to catch API misuse and lifecycle leaks (timers, signal
// handlers, children left behind). They are not a shell, and they verify
// nothing about how the panel actually looks.

export class GObjectBase {
    // GJS classes never define a JavaScript constructor; initialisation goes
    // through _init(), so the stubs do the same and chain with super._init().
    // Real St constructors accept a property bag or positional values, so the
    // stubs tolerate both.
    _init(...params) {
        this._inited = true;
        Object.assign(this, ...params);
        this._children = this._children ?? [];
    }

    set_style(style) {
        this.style = style;
    }

    set_text(text) {
        if (typeof text === 'string')
            this.text = text;
    }

    connect(signal, callback) {
        MockRegistry.connections.push({ target: this, signal, callback });
        this._connections = this._connections ?? [];
        const id = this._connections.length + 1;
        this._connections.push({ id, signal, callback });
        return id;
    }

    disconnect(id) {
        this._connections = (this._connections ?? []).filter(entry => entry.id !== id);
    }

    /** Delivers a signal to everything connected, like GObject's emit(). */
    emit(signal) {
        for (const entry of this._connections ?? []) {
            if (entry.signal === signal)
                entry.callback(this, signal);
        }
    }

    connectObject(signal, callback) {
        return this.connect(signal, callback);
    }

    disconnectObject() {}

    destroy() {
        this.destroyed = true;
        for (const child of this._children ?? [])
            child.destroy?.();
    }

    get_parent() {
        return this._parent ?? null;
    }

    get_children() {
        return [...(this._children ?? [])];
    }

    add_child(child) {
        this._children = this._children ?? [];
        if (child._parent)
            child._parent.remove_child(child);
        this._children.push(child);
        child._parent = this;
    }

    insert_child_below(child, sibling) {
        this.add_child(child);
        const index = this._children.indexOf(sibling);
        if (index >= 0) {
            this._children.splice(this._children.indexOf(child), 1);
            this._children.splice(index, 0, child);
        }
    }

    set_child_below_sibling(child, sibling) {
        const index = this._children?.indexOf(sibling) ?? -1;
        if (index >= 0) {
            this._children.splice(this._children.indexOf(child), 1);
            this._children.splice(index, 0, child);
        }
    }

    remove_child(child) {
        const index = (this._children ?? []).indexOf(child);
        if (index >= 0) {
            this._children.splice(index, 1);
            child._parent = null;
        }
    }
}

export const MockRegistry = {
    connections: [],
    timers: new Map(),
    nextTimerId: 1,
    notifications: [],
    loggedErrors: [],
    openedUris: [],

    reset() {
        this.connections = [];
        this.timers = new Map();
        this.nextTimerId = 1;
        this.notifications = [];
        this.loggedErrors = [];
        this.openedUris = [];
    },

    addTimeout(seconds, callback) {
        const priority = seconds; // so tests can find the 30s refresh timer
        const id = this.nextTimerId++;
        this.timers.set(id, { seconds, priority, callback });
        return id;
    },

    fire(seconds) {
        let fired = 0;
        for (const [id, timer] of [...this.timers]) {
            if (timer.seconds !== seconds)
                continue;
            fired++;
            const result = timer.callback();
            if (result === false)
                this.timers.delete(id);
        }
        return fired;
    },
};

export default { MockRegistry, GObjectBase };
