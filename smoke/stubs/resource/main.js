import St from 'gi://St';
import { MockRegistry } from '../common.js';

export const panel = (() => {
    const rightBox = new St.BoxLayout({ name: 'rightBox' });
    const centerBox = new St.BoxLayout({ name: 'centerBox' });
    const leftBox = new St.BoxLayout({ name: 'leftBox' });

    // The clock, as GNOME Shell's dateMenu indicator contributes it.
    const clockContainer = new St.Widget({ name: 'dateMenu-container' });
    centerBox.add_child(clockContainer);

    const statusArea = {
        dateMenu: { container: clockContainer },
    };

    return {
        _rightBox: rightBox,
        _centerBox: centerBox,
        _leftBox: leftBox,
        statusArea,
        addToStatusArea(uuid, indicator, position, boxPosition = 'right') {
            const box = boxPosition === 'center' ? centerBox
                : boxPosition === 'left' ? leftBox : rightBox;
            box.add_child(indicator.container);
            indicator._panelPosition = position;
            return indicator.container;
        },
    };
})();

export function notify(title, body) {
    MockRegistry.notifications.push({ title, body });
}

export function openPreferences() {
    MockRegistry.openedPreferences = (MockRegistry.openedPreferences ?? 0) + 1;
}

export function _resetPanel() {
    for (const box of [panel._leftBox, panel._centerBox, panel._rightBox]) {
        for (const child of [...box.get_children()])
            box.remove_child(child);
    }
    const clockContainer = new St.Widget({ name: 'dateMenu-container' });
    panel._centerBox.add_child(clockContainer);
    panel.statusArea.dateMenu = { container: clockContainer };
}

export default { panel, notify, openPreferences };
