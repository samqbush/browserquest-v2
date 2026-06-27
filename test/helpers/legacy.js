// Harness for loading the legacy 2012 CommonJS modules from ESM test files.
//
// The legacy code leaks implicit globals: shared/js/gametypes.js assigns a
// global `Types`, server/js/lib/class.js assigns a global `Class`, and several
// modules read a global `log`. We expose a loader plus explicit setup/cleanup
// so tests don't pollute each other through those globals.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Require a module from the repo root by relative path, e.g.
// legacyRequire('server/js/message.js').
export function legacyRequire(relPath) {
  return require(path.join(ROOT, relPath));
}

// Install a no-op global `log` (server/js/format.js calls log.error on unknown
// message types). Returns a restore function.
export function installLogStub() {
  const previous = globalThis.log;
  globalThis.log = {
    info() {},
    debug() {},
    error() {},
    warn() {},
  };
  return function restore() {
    if (previous === undefined) {
      delete globalThis.log;
    } else {
      globalThis.log = previous;
    }
  };
}

// Remove globals leaked by the legacy modules so suites stay isolated.
export function cleanupLegacyGlobals() {
  delete globalThis.Types;
  delete globalThis.Class;
  delete globalThis.FormatChecker;
}
