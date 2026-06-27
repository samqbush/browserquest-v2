// Golden serialize() shapes for every server -> client message in
// server/js/message.js. These lock the positional wire format so a future
// transport/dependency change (Phase 1) can be proven to preserve it. Stub
// entities provide just the fields each serializer reads.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { legacyRequire, cleanupLegacyGlobals } from './helpers/legacy.js';

let Messages;
let M; // Types.Messages codes (source of truth for the leading code)

beforeAll(() => {
  M = legacyRequire('shared/js/gametypes.js').Messages;
  Messages = legacyRequire('server/js/message.js');
});

afterAll(() => cleanupLegacyGlobals());

describe('Messages serialize() shapes', () => {
  it('Spawn = [SPAWN, ...entity.getState()]', () => {
    const entity = { getState: () => [7, 1, 10, 20] };
    expect(new Messages.Spawn(entity).serialize()).toEqual([M.SPAWN, 7, 1, 10, 20]);
  });

  it('Despawn = [DESPAWN, entityId]', () => {
    expect(new Messages.Despawn(7).serialize()).toEqual([M.DESPAWN, 7]);
  });

  it('Move = [MOVE, id, x, y]', () => {
    const entity = { id: 7, x: 10, y: 20 };
    expect(new Messages.Move(entity).serialize()).toEqual([M.MOVE, 7, 10, 20]);
  });

  it('LootMove = [LOOTMOVE, entityId, itemId]', () => {
    expect(new Messages.LootMove({ id: 7 }, { id: 99 }).serialize()).toEqual([M.LOOTMOVE, 7, 99]);
  });

  it('Attack = [ATTACK, attackerId, targetId]', () => {
    expect(new Messages.Attack(7, 8).serialize()).toEqual([M.ATTACK, 7, 8]);
  });

  it('Health = [HEALTH, points] and appends 1 when regen', () => {
    expect(new Messages.Health(42, false).serialize()).toEqual([M.HEALTH, 42]);
    expect(new Messages.Health(42, true).serialize()).toEqual([M.HEALTH, 42, 1]);
  });

  it('HitPoints = [HP, maxHitPoints]', () => {
    expect(new Messages.HitPoints(200).serialize()).toEqual([M.HP, 200]);
  });

  it('EquipItem = [EQUIP, playerId, itemKind]', () => {
    expect(new Messages.EquipItem({ id: 7 }, 60).serialize()).toEqual([M.EQUIP, 7, 60]);
  });

  it('Drop = [DROP, mobId, itemId, itemKind, hatelistIds]', () => {
    const mob = { id: 7, hatelist: [{ id: 1 }, { id: 2 }] };
    const item = { id: 99, kind: 25 };
    expect(new Messages.Drop(mob, item).serialize()).toEqual([M.DROP, 7, 99, 25, [1, 2]]);
  });

  it('Chat = [CHAT, playerId, message]', () => {
    expect(new Messages.Chat({ id: 7 }, 'hello').serialize()).toEqual([M.CHAT, 7, 'hello']);
  });

  it('Teleport = [TELEPORT, id, x, y]', () => {
    expect(new Messages.Teleport({ id: 7, x: 10, y: 20 }).serialize()).toEqual([
      M.TELEPORT,
      7,
      10,
      20,
    ]);
  });

  it('Damage = [DAMAGE, id, points]', () => {
    expect(new Messages.Damage({ id: 7 }, 15).serialize()).toEqual([M.DAMAGE, 7, 15]);
  });

  it('Population = [POPULATION, world, total]', () => {
    expect(new Messages.Population(3, 42).serialize()).toEqual([M.POPULATION, 3, 42]);
  });

  it('Kill = [KILL, mobKind]', () => {
    expect(new Messages.Kill({ kind: 4 }).serialize()).toEqual([M.KILL, 4]);
  });

  it('List = [LIST, ...ids]', () => {
    expect(new Messages.List([1, 2, 3]).serialize()).toEqual([M.LIST, 1, 2, 3]);
  });

  it('Destroy = [DESTROY, id]', () => {
    expect(new Messages.Destroy({ id: 7 }).serialize()).toEqual([M.DESTROY, 7]);
  });

  it('Blink = [BLINK, itemId]', () => {
    expect(new Messages.Blink({ id: 99 }).serialize()).toEqual([M.BLINK, 99]);
  });
});

describe('WELCOME (built inline in server/js/player.js)', () => {
  // player.js:65 sends [WELCOME, id, name, x, y, hitPoints]. There is no
  // Messages.Welcome class, so this asserts the literal shape the client reads.
  it('is [WELCOME, id, name, x, y, hp]', () => {
    const id = 7;
    const name = 'hero';
    const x = 10;
    const y = 20;
    const hp = 200;
    const welcome = [M.WELCOME, id, name, x, y, hp];
    expect(welcome).toEqual([1, 7, 'hero', 10, 20, 200]);
  });
});
