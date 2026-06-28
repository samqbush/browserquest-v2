// Ambient declarations for the 2012 codebase's leaked globals.
//
// The legacy server modules predate ESLint/TypeScript and rely on implicit
// globals that eslint.config.js already declares for `server/**`:
//   - `Class`  — John-Resig-style inheritance shim from server/js/lib/class.js,
//                installed as a global side effect when that module loads.
//   - `FormatChecker` — assigned as an implicit global inside server/js/format.js.
//   - `log`    — the process-wide logger (pino-backed) injected at startup.
//
// These are kept SEPARATE from the protocol declaration (gametypes.d.ts) so the
// protocol type surface stays clean. CommonJS globals (`require`, `module`,
// `exports`) come from @types/node via the tsconfig `"types": ["node"]`.

/**
 * John-Resig "Simple JavaScript Inheritance" base, installed as a global side
 * effect by server/js/lib/class.js. Typed as `any`: it is simultaneously a
 * constructor and a carrier of a chainable `.extend()`, which is not worth
 * modeling precisely for a legacy shim. `any` keeps the `Class.extend({...})`
 * call sites in format.js quiet without changing runtime.
 */
declare var Class: any;

/**
 * Inbound message-format validator class. Defined as an implicit global in
 * server/js/format.js; typed as `any` because it is the John-Resig `Class`
 * product (dynamic shape).
 */
declare var FormatChecker: any;

/** Process-wide logger (pino-backed adapter). */
declare var log: {
  info(...args: any[]): void;
  debug(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};
