// Client/server lockstep contract. The protocol module is shared and the two
// sides deploy together, so the positions the client READS must match the
// positions the server WRITES. This test serializes real server messages
// (server/js/message.js) and decodes them with replicas of the client readers
// in client/js/gameclient.js, asserting the fields survive the round trip.
//
// gameclient.js is an AMD `define()` browser module that depends on a global
// `Class` and other browser modules, so it can't be required directly in Node.
// Each reader below mirrors gameclient.js exactly, with the source line cited.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { legacyRequire, cleanupLegacyGlobals } from './helpers/legacy.js';

let Messages;
let M;

beforeAll(() => {
  M = legacyRequire('shared/js/gametypes.js').Messages;
  Messages = legacyRequire('server/js/message.js');
});

afterAll(() => cleanupLegacyGlobals());

// --- Client reader replicas (client/js/gameclient.js) ---
const readWelcome = (d) => ({ id: d[1], name: d[2], x: d[3], y: d[4], hp: d[5] }); // :164-169
const readMove = (d) => ({ id: d[1], x: d[2], y: d[3] }); // :176-179
const readPopulation = (d) => ({ worldPlayers: d[1], totalPlayers: d[2] }); // :326-328
const readKill = (d) => ({ mobKind: d[1] }); // :335-336
const readChat = (d) => ({ id: d[1], text: d[2] }); // :275-277
const readDrop = (d) => ({ mobId: d[1], id: d[2], kind: d[3], players: d[4] }); // :293-301

describe('client decoder lockstep with server serialize', () => {
  it('WELCOME (player.js inline) decodes to the same fields', () => {
    const wire = [M.WELCOME, 7, 'hero', 10, 20, 200];
    expect(readWelcome(wire)).toEqual({ id: 7, name: 'hero', x: 10, y: 20, hp: 200 });
  });

  it('MOVE round-trips id/x/y', () => {
    const wire = new Messages.Move({ id: 7, x: 10, y: 20 }).serialize();
    expect(readMove(wire)).toEqual({ id: 7, x: 10, y: 20 });
  });

  it('POPULATION round-trips world/total', () => {
    const wire = new Messages.Population(3, 42).serialize();
    expect(readPopulation(wire)).toEqual({ worldPlayers: 3, totalPlayers: 42 });
  });

  it('KILL round-trips mob kind', () => {
    const wire = new Messages.Kill({ kind: 4 }).serialize();
    expect(readKill(wire)).toEqual({ mobKind: 4 });
  });

  it('CHAT round-trips player id and message body', () => {
    const wire = new Messages.Chat({ id: 7 }, 'hello').serialize();
    const decoded = readChat(wire);
    expect(decoded.id).toBe(7);
    expect(decoded.text).toBe('hello'); // client reads body at index 2
  });

  it('DROP round-trips mob id, item id, kind, players', () => {
    const mob = { id: 7, hatelist: [{ id: 1 }, { id: 2 }] };
    const item = { id: 99, kind: 25 };
    const wire = new Messages.Drop(mob, item).serialize();
    expect(readDrop(wire)).toEqual({ mobId: 7, id: 99, kind: 25, players: [1, 2] });
  });
});
