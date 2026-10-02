import { GObjectBase, MockRegistry } from '../common.js';

// In GJS, `new Klass(args)` constructs the instance and then calls _init(args);
// GObject.registerClass is what provides that plumbing. The stub reproduces the
// observable contract, because extension code relies on it.
export function registerClass(klass, meta) {
    if (typeof klass !== 'function')
        throw new TypeError('registerClass expects a class');
    if (typeof klass.prototype._init !== 'function')
        throw new TypeError(`${meta?.GTypeName ?? klass.name} has no _init()`);
    if (!(klass.prototype instanceof GObjectBase))
        throw new TypeError(`${meta?.GTypeName ?? klass.name} does not extend a GObject base`);

    const name = meta?.GTypeName ?? klass.name;
    class Registered extends klass {
        constructor(...args) {
            super(...args);
            if (!this._inited)
                this._init?.(...args);
        }
    }
    Object.defineProperty(Registered, 'name', { value: name });

    MockRegistry.registeredClasses = MockRegistry.registeredClasses ?? [];
    MockRegistry.registeredClasses.push(name);
    return Registered;
}

export default { registerClass };
