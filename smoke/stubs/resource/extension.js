import Gio from 'gi://Gio';

export function gettext(text) {
    return text;
}

export class Extension {
    constructor(metadata) {
        this.metadata = metadata ?? { uuid: 'deepseek-peak@akuma.dev' };
        this.uuid = this.metadata.uuid;
    }

    getSettings() {
        return new Gio.Settings('org.gnome.shell.extensions.deepseek-peak');
    }

    openPreferences() {
        this._openedPreferences = (this._openedPreferences ?? 0) + 1;
    }
}

export default { Extension, gettext };
