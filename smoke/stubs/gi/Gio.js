import { MockRegistry } from '../common.js';

export const AppLaunchContext = class {};

export const SettingsBindFlags = {
    DEFAULT: 0,
    GET: 1,
    SET: 2,
    NO_SENSITIVITY: 4,
};

export const FileCreateFlags = { REPLACE_DESTINATION: 1 };
export const FileCopyFlags = { OVERWRITE: 1 };

export class Cancellable {}

export class File {
    static new_tmp(template) {
        return [{ _path: `/tmp/${template}` }, null];
    }

    static new_for_uri(uri) {
        return new File(uri);
    }

    constructor(uri = '') {
        this.uri = uri;
    }

    copy_async(..._args) {}
    copy_finish() {}
    load_contents() {
        return [true, new Uint8Array()];
    }
    replace_contents_async(..._args) {}
    replace_contents_finish() {}
}

export const AppInfo = {
    launch_default_for_uri(uri) {
        globalThis.__openedUris = globalThis.__openedUris ?? [];
        globalThis.__openedUris.push(uri);
    },
};


export class Settings {
    constructor(schemaId) {
        if (!schemaId)
            throw new TypeError('Settings needs a schema id');
        this.schemaId = schemaId;
        this._values = new Map(Object.entries(globalThis.__initialSettings ?? {}));
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

    emit(signal) {
        for (const entry of this._connections ?? []) {
            if (entry.signal === signal)
                entry.callback(this, signal.replace('changed::', ''));
        }
    }

    _get(key) {
        if (!(key in (globalThis.__defaults ?? {})))
            throw new Error(`unknown settings key: ${key} (the schema would reject this)`);
        return this._values.has(key) ? this._values.get(key) : globalThis.__defaults[key];
    }

    get_boolean(key) {
        return Boolean(this._get(key));
    }

    get_string(key) {
        return String(this._get(key));
    }

    get_int(key) {
        return Number(this._get(key));
    }

    set_string(key, value) {
        if (!(key in (globalThis.__defaults ?? {})))
            throw new Error(`unknown settings key: ${key}`);
        this._values.set(key, value);
        this.emit(`changed::${key}`);
    }

    set_boolean(key, value) {
        this._values.set(key, value);
        this.emit(`changed::${key}`);
    }

    bind(key, object, property, flags) {
        if (!(key in (globalThis.__defaults ?? {})))
            throw new Error(`unknown settings key: ${key}`);
        if (!(property in object))
            throw new Error(`${object.constructor.name} has no property ${property} to bind`);
        this._bindings = this._bindings ?? [];
        this._bindings.push({ key, object, property, flags });
        if (object[property] !== this._get(key))
            object[property] = this._get(key);
        return undefined;
    }
}

export default { Settings, SettingsBindFlags, AppLaunchContext, File, AppInfo };
