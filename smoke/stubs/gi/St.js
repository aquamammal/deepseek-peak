// Stand-in for the St namespace.
//
// GJS actors are GObject classes: `new St.Widget({ ... })` calls `_init({ ... })`
// through GObject's construction plumbing. The helper below reproduces that, so
// extension and mock code can subclass these normally.

import { GObjectBase } from '../common.js';

function initCalling(klass) {
    return class extends klass {
        constructor(...args) {
            super();
            // Args only exist for direct instantiation (`new St.Bin({...})`).
            // Registered classes reach their own _init through GObject.registerClass.
            if (args.length > 0)
                this._init(...args);
        }
    };
}

class WidgetBase extends GObjectBase {}
class BinBase extends WidgetBase {}
class LabelBase extends WidgetBase {}

export const Widget = initCalling(WidgetBase);
export const Bin = initCalling(BinBase);
export const BoxLayout = initCalling(WidgetBase);

class LabelImpl extends LabelBase {
    _init(...params) {
        super._init(...params);
        this.text = this.text ?? '';
    }

    set_text(text) {
        this.text = text;
    }
}

export const Label = initCalling(LabelImpl);

export const ThemeContext = {
    _instances: [],
    get_for_stage(stage) {
        if (!stage)
            throw new TypeError('get_for_stage needs a stage');
        const context = {
            _connections: [],
            connect(signal, callback) {
                this._connections.push({ signal, callback });
                return this._connections.length;
            },
            disconnect(id) {
                this._connections = this._connections.filter((_, index) => index + 1 !== id);
            },
            emit(signal) {
                for (const entry of this._connections)
                    entry.callback();
            },
        };
        this._instances.push(context);
        return context;
    },
};

// Deliberately no `Align`: St 14 (GNOME 46) does not export one, and the stub
// must fail the same way the real namespace does.
export default { Widget, Bin, Label, BoxLayout, ThemeContext };
