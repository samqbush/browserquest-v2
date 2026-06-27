// Phase 4 persistence contract. The same round-trip behavior is asserted for
// BOTH the in-memory store and the SQLite store (run on an in-memory database),
// plus the SessionRegistry fencing that prevents a stale session from rolling
// back a newer one's saved state.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { legacyRequire, installLogStub } from './helpers/legacy.js';

let PlayerStore;
let restoreLog;

beforeAll(() => {
  restoreLog = installLogStub();
  PlayerStore = legacyRequire('server/js/playerstore.js');
});

afterAll(() => {
  restoreLog();
});

const sampleState = () => ({
  name: 'hero',
  armor: 21,
  weapon: 60,
  x: 10,
  y: 20,
  orientation: 2,
  checkpointId: 5,
});

// Run the identical contract against each store implementation.
const stores = [
  ['InMemoryPlayerStore', () => new PlayerStore.InMemoryPlayerStore()],
  ['SqlitePlayerStore(:memory:)', () => new PlayerStore.SqlitePlayerStore(':memory:')],
];

for (const [label, make] of stores) {
  describe(`${label} round-trips player state`, () => {
    let store;
    beforeAll(() => {
      store = make();
    });
    afterAll(() => store.close());

    it('returns null for an unknown token', () => {
      expect(store.load('does-not-exist')).toBeNull();
    });

    it('saves then loads the same fields', () => {
      store.save('tok-1', sampleState());
      const row = store.load('tok-1');
      expect(row).toMatchObject(sampleState());
    });

    it('overwrites on re-save and bumps the version', () => {
      const v1 = store.save('tok-2', sampleState());
      const v2 = store.save('tok-2', { ...sampleState(), name: 'updated', x: 99 });
      expect(v2).toBeGreaterThan(v1);
      const row = store.load('tok-2');
      expect(row.name).toBe('updated');
      expect(row.x).toBe(99);
    });

    it('persists a null checkpointId without error', () => {
      store.save('tok-3', { ...sampleState(), checkpointId: null });
      expect(store.load('tok-3').checkpointId).toBeNull();
    });
  });
}

describe('mintToken', () => {
  it('produces unique, non-empty string tokens', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const t = PlayerStore.mintToken();
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });
});

describe('SessionRegistry fencing', () => {
  it('acquire returns a fresh sessionId and the previous holder', () => {
    const reg = new PlayerStore.SessionRegistry();
    const a = {};
    const b = {};

    const first = reg.acquire('tok', a);
    expect(first.previous).toBeNull();
    expect(reg.isCurrent('tok', first.sessionId)).toBe(true);

    const second = reg.acquire('tok', b);
    expect(second.previous).toBe(a);
    expect(second.sessionId).not.toBe(first.sessionId);

    // The old session is no longer current; only the newest one is.
    expect(reg.isCurrent('tok', first.sessionId)).toBe(false);
    expect(reg.isCurrent('tok', second.sessionId)).toBe(true);
  });

  it('release only evicts when the session still owns the token', () => {
    const reg = new PlayerStore.SessionRegistry();
    const first = reg.acquire('tok', {});
    const second = reg.acquire('tok', {});

    // A superseded session releasing must NOT evict the newer holder.
    reg.release('tok', first.sessionId);
    expect(reg.isCurrent('tok', second.sessionId)).toBe(true);

    // The current session releasing clears it.
    reg.release('tok', second.sessionId);
    expect(reg.isCurrent('tok', second.sessionId)).toBe(false);
  });
});
