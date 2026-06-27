// Thin logging shim backing the legacy `log` package API with `pino`.
//
// The 2012 code used the (now abandoned) `log` module as:
//     var Log = require('log');
//     log = new Log(Log.INFO);   // global `log`
//     log.info(...) / log.debug(...) / log.error(...)
//
// This shim preserves that exact surface (a constructor taking a level, the
// static ERROR/WARNING/INFO/DEBUG level constants, and info/warn/error/debug
// methods) so call sites stay untouched, while delegating to pino under the hood.

var pino = require('pino');

// Map the legacy level constants onto pino level names.
var LEVELS = {
  ERROR: 'error',
  WARNING: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

function Log(level) {
  var pinoLevel = LEVELS[level] ? level.toLowerCase() : level || 'info';
  // Allow passing either a Log.* constant ("INFO") or a raw pino level ("info").
  if (LEVELS[level]) {
    pinoLevel = LEVELS[level];
  }
  this._logger = pino({
    level: pinoLevel,
    base: undefined, // drop pid/hostname noise; keep output lean
  });
}

Log.prototype.info = function (message) {
  this._logger.info(message);
};

Log.prototype.warn = function (message) {
  this._logger.warn(message);
};

Log.prototype.error = function (message) {
  this._logger.error(message);
};

Log.prototype.debug = function (message) {
  this._logger.debug(message);
};

// Legacy static level constants (the original `log` package exposed numeric
// constants; callers only ever reference them symbolically as `Log.INFO` etc.).
Log.ERROR = 'ERROR';
Log.WARNING = 'WARNING';
Log.INFO = 'INFO';
Log.DEBUG = 'DEBUG';

module.exports = Log;
