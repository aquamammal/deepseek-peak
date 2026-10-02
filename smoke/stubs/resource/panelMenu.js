import St from 'gi://St';
import GObject from 'gi://GObject';
import PopupMenu from './popupMenu.js';

export class Button extends St.Bin {
    _init(menuAlignment = 0.5, nameText = '', dontCreateMenu = false) {
        super._init({});
        this.menuAlignment = menuAlignment;
        this.nameText = nameText;
        this.menu = dontCreateMenu ? null : new PopupMenu.PopupMenu(this);
        // GNOME Shell gives every panel indicator a container wrapper; the real
        // button's own children go inside it.
        this.container = new St.Bin({ name: `container-${nameText}` });
    }

    add_child(child) {
        this._children.push(child);
        child._parent = this;
    }
}

export default { Button };
