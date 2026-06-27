// Phase 4 reconnect integration: drives the REAL server/js/player.js HELLO ->
// WELCOME handshake through an in-memory PlayerStore + SessionRegistry, proving
// that a token issued on first connect restores name/gear/position on reconnect,
// that the server's restored gear is authoritative (overriding what the client
// re-sends), and that a duplicate-token login supersedes the older session.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { legacyRequire, installLogStub, cleanupLegacyGlobals } from './helpers/legacy.js';

let Player;
let PlayerStore;
let Types;
let restoreLog;

const LEATHER = 22; // leatherarmor
const AXE = 65; // axe
const CLOTH = 21; // clotharmor
const SWORD = 60; // sword1

beforeAll(() => {
  restoreLog = installLogStub();
  // Load the legacy global chain in dependency order before player.js, which
  // extends the global `Character` and instantiates a global `FormatChecker`.
  legacyRequire('server/js/lib/class.js'); // global Class
  Types = legacyRequire('shared/js/gametypes.js'); // global Types
  legacyRequire('server/js/entity.js'); // global Entity
  legacyRequire('server/js/character.js'); // global Character
  legacyRequire('server/js/format.js'); // global FormatChecker
  Player = legacyRequire('server/js/player.js');
  PlayerStore = legacyRequire('server/js/playerstore.js');
});

afterAll(() => {
  restoreLog();
  cleanupLegacyGlobals();
});

// Minimal fake of the ws.js Connection: lets the test inject inbound messages
// and capture what the server sent.
function makeConnection(id) {
  let listenCb = null;
  let closeCb = null;
  return {
    id,
    sent: [],
    closed: false,
    listen(cb) { listenCb = cb; },
    onClose(cb) { closeCb = cb; },
    send(msg) { this.sent.push(msg); },
    sendUTF8() {},
    close() {
      if (this.closed) return;
      this.closed = true;
      if (closeCb) closeCb();
    },
    recv(msg) { listenCb(msg); },
  };
}

// Minimal fake WorldServer exposing only what Player touches during HELLO.
function makeServer(store, sessions) {
  return {
    store,
    sessions,
    map: { getCheckpoint: () => undefined },
    isValidPosition: () => true,
    added: [],
    addPlayer(p) { this.added.push(p); },
    enter_callback() {},
    handlePlayerVanish() {},
    pushRelevantEntityListTo() {},
  };
}

function lastWelcome(conn) {
  return conn.sent.filter((m) => Array.isArray(m) && m[0] === Types.Messages.WELCOME).pop();
}

function hello(name, armor, weapon, token) {
  const m = [Types.Messages.HELLO, name, armor, weapon];
  if (token) m.push(token);
  return m;
}

describe('player reconnect via PlayerStore', () => {
  it('issues a token on first connect and restores state on reconnect', () => {
    const store = new PlayerStore.InMemoryPlayerStore();
    const sessions = new PlayerStore.SessionRegistry();
    const server = makeServer(store, sessions);

    // --- First connect: no token, fresh spawn at (50,60). ---
    const c1 = makeConnection(101);
    const p1 = new Player(c1, server);
    p1.onRequestPosition(() => ({ x: 50, y: 60 }));
    c1.recv(hello('Reconnector', LEATHER, AXE));

    const w1 = lastWelcome(c1);
    expect(w1).toBeTruthy();
    const token = w1[9];
    expect(typeof token).toBe('string');
    expect(w1[2]).toBe('Reconnector');
    expect(w1[7]).toBe(LEATHER);
    expect(w1[8]).toBe(AXE);

    // Move to a new position (TELEPORT triggers a durable save), then disconnect
    // (which also saves).
    c1.recv([Types.Messages.TELEPORT, 70, 80]);
    c1.close();

    // --- Reconnect: same token, but the client re-sends DIFFERENT name/gear.
    // The server's persisted state must win. ---
    const c2 = makeConnection(102);
    const p2 = new Player(c2, server);
    p2.onRequestPosition(() => ({ x: 1, y: 1 }));
    c2.recv(hello('ImposterName', CLOTH, SWORD, token));

    const w2 = lastWelcome(c2);
    expect(w2[9]).toBe(token); // same token echoed
    expect(w2[2]).toBe('Reconnector'); // restored name (not "ImposterName")
    expect(w2[7]).toBe(LEATHER); // restored armor (not CLOTH)
    expect(w2[8]).toBe(AXE); // restored weapon (not SWORD)
    expect(w2[3]).toBe(70); // restored x
    expect(w2[4]).toBe(80); // restored y

    expect(p2.hasRestoredPosition).toBe(true);
  });

  it('supersedes an older session when the same token reconnects live', () => {
    const store = new PlayerStore.InMemoryPlayerStore();
    const sessions = new PlayerStore.SessionRegistry();
    const server = makeServer(store, sessions);

    const c1 = makeConnection(201);
    const p1 = new Player(c1, server);
    p1.onRequestPosition(() => ({ x: 5, y: 5 }));
    c1.recv(hello('Holder', LEATHER, AXE));
    const token = lastWelcome(c1)[9];

    // Same token connects again before the first session closed.
    const c2 = makeConnection(202);
    const p2 = new Player(c2, server);
    p2.onRequestPosition(() => ({ x: 5, y: 5 }));
    c2.recv(hello('Holder', LEATHER, AXE, token));

    // The first session must have been superseded (its connection closed).
    expect(p1.isSuperseded).toBe(true);
    expect(c1.closed).toBe(true);
    // The newer session owns the token.
    expect(sessions.isCurrent(token, p2.session)).toBe(true);
    expect(sessions.isCurrent(token, p1.session)).toBe(false);
  });

  it('does not let a superseded session overwrite newer saved state', () => {
    const store = new PlayerStore.InMemoryPlayerStore();
    const sessions = new PlayerStore.SessionRegistry();
    const server = makeServer(store, sessions);

    const c1 = makeConnection(301);
    const p1 = new Player(c1, server);
    p1.onRequestPosition(() => ({ x: 9, y: 9 }));
    c1.recv(hello('First', LEATHER, AXE));
    const token = lastWelcome(c1)[9];

    const c2 = makeConnection(302);
    const p2 = new Player(c2, server);
    p2.onRequestPosition(() => ({ x: 1, y: 1 }));
    c2.recv(hello('First', LEATHER, AXE, token));
    // Newer session saves a fresh position.
    c2.recv([Types.Messages.TELEPORT, 40, 40]);

    // The superseded first session disconnects last; its save must be ignored.
    p1.x = 99;
    p1.y = 99;
    c1.close();

    const row = store.load(token);
    expect(row.x).toBe(40);
    expect(row.y).toBe(40);
  });
});
