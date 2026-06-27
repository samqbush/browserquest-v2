// Golden protocol fixture: the wire message codes are a hard-coded contract.
// These literals are intentionally duplicated (NOT derived from gametypes.js) so
// that any accidental renumbering or reordering in shared/js/gametypes.js is
// caught here. The client and server deploy in lockstep against these exact
// numbers, so changing one without bumping the protocol is a breaking change.
import { describe, it, expect, afterEach } from 'vitest';
import { legacyRequire, cleanupLegacyGlobals } from './helpers/legacy.js';

const GOLDEN_MESSAGE_CODES = {
  HELLO: 0,
  WELCOME: 1,
  SPAWN: 2,
  DESPAWN: 3,
  MOVE: 4,
  LOOTMOVE: 5,
  AGGRO: 6,
  ATTACK: 7,
  HIT: 8,
  HURT: 9,
  HEALTH: 10,
  CHAT: 11,
  LOOT: 12,
  EQUIP: 13,
  DROP: 14,
  TELEPORT: 15,
  DAMAGE: 16,
  POPULATION: 17,
  KILL: 18,
  LIST: 19,
  WHO: 20,
  ZONE: 21,
  DESTROY: 22,
  HP: 23,
  BLINK: 24,
  OPEN: 25,
  CHECK: 26,
};

describe('protocol message codes (golden)', () => {
  afterEach(() => cleanupLegacyGlobals());

  it('matches the frozen golden map exactly', () => {
    const Types = legacyRequire('shared/js/gametypes.js');
    expect(Types.Messages).toEqual(GOLDEN_MESSAGE_CODES);
  });

  it('defines no extra or missing message types', () => {
    const Types = legacyRequire('shared/js/gametypes.js');
    expect(Object.keys(Types.Messages).sort()).toEqual(Object.keys(GOLDEN_MESSAGE_CODES).sort());
  });
});
