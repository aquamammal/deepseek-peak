// Teaches Node to resolve GJS's gi:// and resource:// imports to the stubs in
// smoke/stubs, so extension.js can be loaded outside a GNOME session.
//
//     TZ=UTC node --import ./smoke/register.mjs smoke/run.mjs

import { registerHooks } from 'node:module';

const STUBS = new URL('./stubs/', import.meta.url);

registerHooks({
    resolve(specifier, context, next) {
        if (specifier.startsWith('gi://')) {
            return {
                url: new URL(`./gi/${specifier.slice(5)}.js`, STUBS).href,
                shortCircuit: true,
            };
        }

        if (specifier.startsWith('resource://')) {
            // The prefs entry point lives in another directory but exports the
            // same ExtensionPreferences base class the shell provides.
            if (specifier.includes('/extensions/prefs.js'))
                return { url: new URL('./resource/prefs-extension.js', STUBS).href, shortCircuit: true };

            const name = specifier.split('/').pop().replace(/\.js$/, '');
            return { url: new URL(`./resource/${name}.js`, STUBS).href, shortCircuit: true };
        }

        return next(specifier, context);
    },
});
