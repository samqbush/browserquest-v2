// Inbound (client -> server) validation contract: server/js/format.js decides
// which incoming messages are well-formed. Phase 1's new transport must keep
// feeding format.check() the same array shapes, so these cases lock the
// accepted/rejected inputs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { legacyRequire, installLogStub, cleanupLegacyGlobals } from './helpers/legacy.js';

let check;
let M;
let restoreLog;

beforeAll(() => {
  restoreLog = installLogStub();
  // format.js references a global `Class` (server/js/lib/class.js) without
  // requiring it, so it must be loaded first.
  legacyRequire('server/js/lib/class.js');
  M = legacyRequire('shared/js/gametypes.js').Messages;
  check = legacyRequire('server/js/format.js').check;
});

afterAll(() => {
  restoreLog();
  cleanupLegacyGlobals();
});

describe('format.check() accepts valid messages', () => {
  it('HELLO [name(s), armor(n), weapon(n)]', () => {
    expect(check([M.HELLO, 'hero', 21, 60])).toBe(true);
  });

  it('HELLO with optional reconnect token [name, armor, weapon, token(s)]', () => {
    expect(check([M.HELLO, 'hero', 21, 60, 'a1b2-token'])).toBe(true);
  });

  it('MOVE [x(n), y(n)]', () => {
    expect(check([M.MOVE, 10, 20])).toBe(true);
  });

  it('CHAT [message(s)]', () => {
    expect(check([M.CHAT, 'hi there'])).toBe(true);
  });

  it('ZONE [] (no params)', () => {
    expect(check([M.ZONE])).toBe(true);
  });

  it('WHO [id, id, ...] variable-length numbers', () => {
    expect(check([M.WHO, 1, 2, 3])).toBe(true);
  });
});

describe('format.check() rejects malformed messages', () => {
  it('MOVE with wrong arity', () => {
    expect(check([M.MOVE, 10])).toBe(false);
    expect(check([M.MOVE, 10, 20, 30])).toBe(false);
  });

  it('HELLO with wrong types', () => {
    expect(check([M.HELLO, 'hero', 'notNumber', 60])).toBe(false);
    expect(check([M.HELLO, 123, 21, 60])).toBe(false);
  });

  it('HELLO with a non-string token', () => {
    expect(check([M.HELLO, 'hero', 21, 60, 12345])).toBe(false);
  });

  it('HELLO with too many params (5+)', () => {
    expect(check([M.HELLO, 'hero', 21, 60, 'tok', 'extra'])).toBe(false);
  });

  it('HELLO with an over-long token', () => {
    expect(check([M.HELLO, 'hero', 21, 60, 'x'.repeat(65)])).toBe(false);
  });

  it('CHAT with a numeric body', () => {
    expect(check([M.CHAT, 123])).toBe(false);
  });

  it('WHO with no ids', () => {
    expect(check([M.WHO])).toBe(false);
  });

  it('unknown message type', () => {
    expect(check([9999])).toBe(false);
  });
});
