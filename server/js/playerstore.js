// Optional player persistence (Phase 4).
//
// A PlayerStore persists the small slice of player state that should survive a
// reconnect: name, equipped armor/weapon, position, orientation, and last
// checkpoint id. It is keyed by an opaque, server-issued bearer token (no auth).
//
// Persistence is OFF by default: createStore() returns null unless
// `persistence_enabled` is set in the config, so the in-memory game behaves
// exactly as before. The InMemoryPlayerStore is a test double / dev-only mode,
// not the disabled default.
//
// Concurrency is fenced by the SessionRegistry (see below), not the store, so a
// stale session can never overwrite a newer one's saved state.

var crypto = require('crypto');

// Mint a cryptographically-random opaque token. The token is a bearer
// credential, so it must not be guessable.
function mintToken() {
    return crypto.randomUUID();
}

// In-memory store. Used as a test double and as an opt-in dev mode
// (`persistence.driver === "memory"`). State lives only for the process
// lifetime; it is intentionally NOT the disabled default.
var InMemoryPlayerStore = function() {
    this.rows = {};
};

InMemoryPlayerStore.prototype.load = function(token) {
    var row = this.rows[token];
    return row ? Object.assign({}, row) : null;
};

InMemoryPlayerStore.prototype.save = function(token, state) {
    var existing = this.rows[token];
    var version = (existing ? existing.version : 0) + 1;
    this.rows[token] = {
        token: token,
        name: state.name,
        armor: state.armor,
        weapon: state.weapon,
        x: state.x,
        y: state.y,
        orientation: state.orientation,
        checkpointId: (state.checkpointId === undefined ? null : state.checkpointId),
        version: version,
        updatedAt: Date.now()
    };
    return version;
};

InMemoryPlayerStore.prototype.close = function() {};

// SQLite-backed store (better-sqlite3). Synchronous, so callers must keep writes
// off the per-tick game loop (Player only saves on enter/exit/gear/checkpoint/
// teleport and debounced movement).
var SqlitePlayerStore = function(dbPath) {
    var Database = require('better-sqlite3');
    var fs = require('fs');
    var path = require('path');

    if (dbPath !== ':memory:') {
        var dir = path.dirname(dbPath);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(
        "CREATE TABLE IF NOT EXISTS players (" +
        "token TEXT PRIMARY KEY," +
        "name TEXT NOT NULL," +
        "armor INTEGER NOT NULL," +
        "weapon INTEGER NOT NULL," +
        "x INTEGER," +
        "y INTEGER," +
        "orientation INTEGER," +
        "checkpoint_id INTEGER," +
        "version INTEGER NOT NULL DEFAULT 0," +
        "updated_at INTEGER NOT NULL)"
    );

    this.loadStmt = this.db.prepare(
        "SELECT token, name, armor, weapon, x, y, orientation, " +
        "checkpoint_id AS checkpointId, version, updated_at AS updatedAt " +
        "FROM players WHERE token = ?"
    );
    this.saveStmt = this.db.prepare(
        "INSERT INTO players " +
        "(token, name, armor, weapon, x, y, orientation, checkpoint_id, version, updated_at) " +
        "VALUES (@token, @name, @armor, @weapon, @x, @y, @orientation, @checkpointId, @version, @updatedAt) " +
        "ON CONFLICT(token) DO UPDATE SET " +
        "name=@name, armor=@armor, weapon=@weapon, x=@x, y=@y, " +
        "orientation=@orientation, checkpoint_id=@checkpointId, " +
        "version=@version, updated_at=@updatedAt"
    );
};

SqlitePlayerStore.prototype.load = function(token) {
    var row = this.loadStmt.get(token);
    return row || null;
};

SqlitePlayerStore.prototype.save = function(token, state) {
    var existing = this.loadStmt.get(token);
    var version = (existing ? existing.version : 0) + 1;
    this.saveStmt.run({
        token: token,
        name: state.name,
        armor: state.armor,
        weapon: state.weapon,
        x: (typeof state.x === 'number' ? state.x : null),
        y: (typeof state.y === 'number' ? state.y : null),
        orientation: (typeof state.orientation === 'number' ? state.orientation : null),
        checkpointId: (state.checkpointId === undefined ? null : state.checkpointId),
        version: version,
        updatedAt: Date.now()
    });
    return version;
};

SqlitePlayerStore.prototype.close = function() {
    this.db.close();
};

// Process-wide token -> active session registry. Because a token is just a
// bearer key, the same token can connect twice (two tabs, or a fast reconnect
// before the old socket closes). The registry fences this: each login gets a
// fresh monotonic sessionId, the previous holder (if any) is returned so it can
// be superseded, and saves are only honored for the session that is still
// current for the token. This prevents a lingering old session from rolling
// back a newer session's progress.
var SessionRegistry = function() {
    this.sessions = {};
    this.counter = 0;
};

// Claim the token for `player`, returning the new sessionId and the previous
// holder (or null). The caller is responsible for superseding the previous one.
SessionRegistry.prototype.acquire = function(token, player) {
    this.counter += 1;
    var sessionId = this.counter;
    var previous = this.sessions[token] || null;
    this.sessions[token] = { sessionId: sessionId, player: player };
    return { sessionId: sessionId, previous: previous ? previous.player : null };
};

// True only if `sessionId` is still the current holder of `token`.
SessionRegistry.prototype.isCurrent = function(token, sessionId) {
    var s = this.sessions[token];
    return !!s && s.sessionId === sessionId;
};

// Release the token, but only if this session still owns it (so a superseded
// session's disconnect can't evict the newer holder).
SessionRegistry.prototype.release = function(token, sessionId) {
    var s = this.sessions[token];
    if (s && s.sessionId === sessionId) {
        delete this.sessions[token];
    }
};

// Build the configured store, or null when persistence is disabled.
function createStore(config) {
    if (!config || !config.persistence_enabled) {
        return null;
    }
    var p = config.persistence || {};
    var driver = p.driver || 'sqlite';

    if (driver === 'memory') {
        return new InMemoryPlayerStore();
    }
    if (driver === 'sqlite') {
        return new SqlitePlayerStore(p.db_path || './server/data/players.db');
    }
    throw new Error("Unknown persistence driver: " + driver);
}

module.exports = {
    mintToken: mintToken,
    InMemoryPlayerStore: InMemoryPlayerStore,
    SqlitePlayerStore: SqlitePlayerStore,
    SessionRegistry: SessionRegistry,
    createStore: createStore
};
