import Gio from 'gi://Gio';

export class ExtensionPreferences {
    constructor(metadata) {
        this.metadata = metadata ?? { uuid: 'deepseek-peak@akuma.dev' };
    }

    getSettings() {
        return new Gio.Settings('org.gnome.shell.extensions.deepseek-peak');
    }
}

export default { ExtensionPreferences };
