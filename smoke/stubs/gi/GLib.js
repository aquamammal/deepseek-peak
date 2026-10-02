import { MockRegistry } from '../common.js';

export const PRIORITY_DEFAULT = 0;
export const SOURCE_CONTINUE = true;
export const SOURCE_REMOVE = false;

export function timeout_add_seconds(_priority, seconds, callback) {
    if (typeof callback !== 'function')
        throw new TypeError('timeout_add_seconds needs a callback');
    return MockRegistry.addTimeout(seconds, callback);
}

export function timeout_add(_priority, milliseconds, callback) {
    return MockRegistry.addTimeout(milliseconds / 1000, callback);
}

function sourceRemove(id) {
    MockRegistry.timers.delete(id);
}

export const Source = { remove: sourceRemove };

export function idle_add(callback) {
    return MockRegistry.addTimeout(0, callback);
}

export default {
    PRIORITY_DEFAULT,
    SOURCE_CONTINUE,
    SOURCE_REMOVE,
    timeout_add_seconds,
    timeout_add,
    Source,
    idle_add,
};
