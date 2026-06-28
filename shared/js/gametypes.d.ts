// Ambient type declarations for the shared wire protocol (shared/js/gametypes.js).
//
// This is the single source of truth for the protocol's TYPES. The runtime
// values live in gametypes.js (which stays CommonJS on disk for the Node server
// and Vitest, and is rewritten to ESM in-memory by the Vite plugin for the
// client). Because this file is colocated with the same basename, TypeScript
// auto-discovers it for BOTH:
//   - server:  require("../../shared/js/gametypes")
//   - client:  import Types from 'shared/js/gametypes.js'   (via esModuleInterop)
//
// Message/Entity/Orientation codes are declared as LITERAL values so the type
// surface cannot silently drift from the on-the-wire numbers.

declare namespace Types {
  interface Messages {
    readonly HELLO: 0;
    readonly WELCOME: 1;
    readonly SPAWN: 2;
    readonly DESPAWN: 3;
    readonly MOVE: 4;
    readonly LOOTMOVE: 5;
    readonly AGGRO: 6;
    readonly ATTACK: 7;
    readonly HIT: 8;
    readonly HURT: 9;
    readonly HEALTH: 10;
    readonly CHAT: 11;
    readonly LOOT: 12;
    readonly EQUIP: 13;
    readonly DROP: 14;
    readonly TELEPORT: 15;
    readonly DAMAGE: 16;
    readonly POPULATION: 17;
    readonly KILL: 18;
    readonly LIST: 19;
    readonly WHO: 20;
    readonly ZONE: 21;
    readonly DESTROY: 22;
    readonly HP: 23;
    readonly BLINK: 24;
    readonly OPEN: 25;
    readonly CHECK: 26;
  }

  interface Entities {
    readonly WARRIOR: 1;

    // Mobs
    readonly RAT: 2;
    readonly SKELETON: 3;
    readonly GOBLIN: 4;
    readonly OGRE: 5;
    readonly SPECTRE: 6;
    readonly CRAB: 7;
    readonly BAT: 8;
    readonly WIZARD: 9;
    readonly EYE: 10;
    readonly SNAKE: 11;
    readonly SKELETON2: 12;
    readonly BOSS: 13;
    readonly DEATHKNIGHT: 14;

    // Armors
    readonly FIREFOX: 20;
    readonly CLOTHARMOR: 21;
    readonly LEATHERARMOR: 22;
    readonly MAILARMOR: 23;
    readonly PLATEARMOR: 24;
    readonly REDARMOR: 25;
    readonly GOLDENARMOR: 26;

    // Objects
    readonly FLASK: 35;
    readonly BURGER: 36;
    readonly CHEST: 37;
    readonly FIREPOTION: 38;
    readonly CAKE: 39;

    // NPCs
    readonly GUARD: 40;
    readonly KING: 41;
    readonly OCTOCAT: 42;
    readonly VILLAGEGIRL: 43;
    readonly VILLAGER: 44;
    readonly PRIEST: 45;
    readonly SCIENTIST: 46;
    readonly AGENT: 47;
    readonly RICK: 48;
    readonly NYAN: 49;
    readonly SORCERER: 50;
    readonly BEACHNPC: 51;
    readonly FORESTNPC: 52;
    readonly DESERTNPC: 53;
    readonly LAVANPC: 54;
    readonly CODER: 55;

    // Weapons
    readonly SWORD1: 60;
    readonly SWORD2: 61;
    readonly REDSWORD: 62;
    readonly GOLDENSWORD: 63;
    readonly MORNINGSTAR: 64;
    readonly AXE: 65;
    readonly BLUESWORD: 66;
  }

  interface Orientations {
    readonly UP: 1;
    readonly DOWN: 2;
    readonly LEFT: 3;
    readonly RIGHT: 4;
  }

  /** Iteration callback used by the `forEach*` helpers. */
  type KindCallback = (kind: number, kindName: string) => void;

  /** The shape of the exported `Types` object (constants + helper functions). */
  interface Static {
    readonly Messages: Messages;
    readonly Entities: Entities;
    readonly Orientations: Orientations;

    rankedWeapons: number[];
    rankedArmors: number[];

    getWeaponRank(weaponKind: number): number;
    getArmorRank(armorKind: number): number;

    isPlayer(kind: number): boolean;
    isMob(kind: number): boolean;
    isNpc(kind: number): boolean;
    isCharacter(kind: number): boolean;
    isArmor(kind: number): boolean;
    isWeapon(kind: number): boolean;
    isObject(kind: number): boolean;
    isChest(kind: number): boolean;
    isItem(kind: number): boolean;
    isHealingItem(kind: number): boolean;
    isExpendableItem(kind: number): boolean;

    // Runtime can fall through and return undefined for unknown kinds.
    getKindFromString(kind: string): number | undefined;
    getKindAsString(kind: number): string | undefined;
    getOrientationAsString(orientation: number): string | undefined;

    getMessageTypeAsString(type: number): string;
    getRandomItemKind(item?: unknown): number;

    forEachKind(callback: KindCallback): void;
    forEachArmor(callback: KindCallback): void;
    forEachArmorKind(callback: KindCallback): void;
    forEachMobOrNpcKind(callback: KindCallback): void;
  }
}

declare const Types: Types.Static;

export = Types;
export as namespace Types;
