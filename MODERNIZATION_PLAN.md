# BrowserQuest — Modernization Plan

> Forward-looking action set. The audited current-state evidence lives in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md); this document cites it rather than
> restating it. Decisions that need business/stakeholder input are flagged
> `[DECISION NEEDED]`.

## 1. Executive summary

BrowserQuest is a 2012 HTML5 multiplayer game demo frozen at commit `af32d24`
([ARCHITECTURE.md → identity](./ARCHITECTURE.md#local-checkout-identity)). It
runs on an ancient Node.js baseline (v0.4.7) with several abandoned npm packages,
a jQuery/RequireJS browser client, a custom dual-stack WebSocket layer that
exists only for obsolete 2012 browser protocol drafts, and **no persistence, no
auth, no tests, and no CI**. The good news: the *architecture* is sound — an
in-memory instanced-world game loop with zone-based interest management is still
a perfectly reasonable design for a game of this scale. The work is therefore
overwhelmingly **upgrade-and-swap, not rewrite**: modernize the runtime and
toolchain, replace dead dependencies with maintained equivalents, collapse the
dual WebSocket stack to one standard library, and add the safety net (tests, CI,
optional persistence) the demo never had. Scope is realistically 6 phases; a
working game is reachable after Phase 2.

## 2. Current state assessment

Pulled from [`ARCHITECTURE.md`](./ARCHITECTURE.md). Key facts driving this plan:

- **Runtime:** Node.js originally v0.4.7 (`server/README.md:4`) — many major
  versions past EOL.
- **Server deps:** `underscore`, `log`, `bison`, `websocket`, `websocket-server`,
  `sanitizer`, `memcache` (`package.json:5-13`). Several are abandoned (see §3).
- **Two WebSocket stacks** bridged for hybi-08+ *and* hixie-75/76 drafts
  (`server/js/ws.js:90-180`) — obsolete accidental complexity.
- **No database**; all game state in-memory per world (`worldserver.js:33-43`).
  Population metrics optionally in memcached (`metrics.js`).
- **Client:** jQuery + RequireJS AMD + Canvas, built via vendored `r.js` +
  UglifyJS (`bin/build.sh`, `client/js/build.js`).
- **No tests, no lint, no CI, no auth, no `package.json` scripts**
  (`package.json:1-14`) — confirmed by absence.
- **Lockstep protocol** via `shared/js/gametypes.js` — client+server must deploy
  together.

Pain points, ranked: (1) EOL runtime + abandoned deps = security/installability
risk; (2) dual WebSocket stack = maintenance burden with zero modern value;
(3) no automated tests/CI = every change is high-risk; (4) no persistence caps
the product as a throwaway demo; (5) client build relies on a 344 KB vendored
optimizer and brittle name-based file pruning (`bin/build.sh:19`).

## 3. Target architecture

**Guiding principle: the cheapest migration is the one you don't do.** This
codebase's bones are fine. We upgrade in place wherever possible, swap dead
libraries for drop-ins, and reserve rewrites for the dual WebSocket stack (which
has no upgrade path because one of its two libraries is dead and the reason for
its existence is gone).

### Recommended target stack

| Layer | Today | Target | Framework level |
|-------|-------|--------|-----------------|
| Runtime | Node v0.4.7 | Node 22 LTS | ⬆️ Upgrade |
| Module system (server) | CommonJS + global leakage | CommonJS on Node 22 (keep), lint globals away | ⬆️ Upgrade |
| WebSocket | `websocket` + `websocket-server` dual stack | single `ws` library | 🔁 Rewrite (the layer) |
| Wire codec | JSON + `bison` | JSON (keep); drop `bison` | 🗑️ Remove / 🔀 |
| Utility | `underscore` | `lodash` or native ES (incremental) | 🔀 Swap |
| Logging | `log` (abandoned) | `pino` | 🔀 Swap |
| Sanitization | `sanitizer` (abandoned) | `dompurify` (isomorphic) or `xss` | 🔀 Swap |
| Metrics store | `memcache` (abandoned) | `prom-client` /metrics endpoint, or Redis | 🔀 Swap / 🔄 |
| Client loader | RequireJS AMD + `r.js` | Vite (ES modules + bundling) | 🔀 Swap toolchain |
| Client DOM | jQuery | Keep initially; trim later | ✅ Keep (phase out opportunistically) |
| Rendering | Canvas 2D | Keep (still modern, adequate) | ✅ Keep |
| Pathfinding | `astar.js` | Keep | ✅ Keep |
| Tests | none | Vitest/Jest + Playwright smoke | (new) |
| CI | none | GitHub Actions | (new) |
| Persistence | none | **`[DECISION NEEDED]`** optional Redis/Postgres | 🔄 Wrap (new, optional) |

### What stays vs. what goes

- ✅ **Keep as-is:** Canvas renderer, A* pathfinder, the instanced-world +
  zone-group interest-management design (`worldserver.js`), the shared
  `gametypes.js` protocol module, the game-loop tick model.
- ⬆️ **Upgrade in place:** Node runtime (0.4 → 22), CommonJS server modules,
  client UI logic (kept, run through a modern bundler).
- 🔀 **Swap dependency:** `log`→`pino`, `sanitizer`→`dompurify`/`xss`,
  `memcache`→`prom-client`/Redis, `underscore`→`lodash`/native (incremental),
  RequireJS/`r.js`→Vite.
- 🔄 **Wrap/adapt:** metrics behind a small interface so memcached can be
  replaced without touching call sites; optional persistence behind a
  `PlayerStore` interface.
- 🔁 **Rewrite (justified):** the `ws.js` dual-stack layer → a single thin
  adapter over the `ws` package.
- 🗑️ **Remove:** the miksago/hixie legacy WebSocket path, the `bison` binary
  codec (unused by default, `useBison=false`, `server/js/ws.js:12`), the vendored
  `bin/r.js` once Vite lands, and the brittle name-based prune in `build.sh:19`.

### ADRs

#### ADR: Upgrade Node.js 0.4.7 → 22 LTS in place
- **Context:** Node 0.4.7 (`server/README.md:4`) is ~13 years past EOL; modern
  npm can't even install the old dep tree reliably.
- **Decision:** Upgrade in place (framework level 1). The server uses plain
  CommonJS, `setInterval`, `http`, and callbacks — all still supported. No
  rewrite warranted.
- **Alternatives considered:** Rewrite in Deno/Bun (rejected — gratuitous churn,
  no requirement justifies it); TypeScript rewrite (deferred — optional, can be
  incremental later).
- **Consequences:** Some abandoned deps won't run on Node 22 and force the swaps
  below; this is the forcing function for the whole plan.

#### ADR: Collapse the dual WebSocket stack to a single `ws` library
- **Context:** `ws.js:90-180` bridges Worlize WebSocket-Node and miksago
  node-websocket-server to support hybi-08+ and hixie-75/76 drafts. Every browser
  shipping in the last decade speaks RFC 6455. `websocket-server` (miksago) is
  abandoned.
- **Decision:** Rewrite *this layer only* (framework level 4 — justified: one
  library is dead, the reason for the abstraction is gone) onto the maintained
  `ws` package, preserving the existing `Server`/`Connection` interface
  (`ws.js:20-86`) so callers in `main.js`/`worldserver.js` are untouched.
- **Alternatives considered:** Keep both stacks (rejected — dead dep, security
  surface); Socket.IO (rejected — heavier, changes the wire protocol the client
  already implements).
- **Consequences:** Drops legacy-browser support nobody uses; simplifies the
  single most complex server subsystem.

#### ADR: Replace RequireJS/r.js with Vite
- **Context:** Client uses AMD + a 344 KB vendored `r.js` optimizer and a
  name-based file prune (`bin/build.sh:19`, `client/js/build.js`). Slow, brittle,
  unmaintained pattern.
- **Decision:** Swap the toolchain (level 2) to Vite, converting AMD `define(...)`
  modules to ES modules mechanically. Keep jQuery and all game logic.
- **Alternatives considered:** esbuild/Rollup directly (viable, more config);
  keep RequireJS (rejected — dev experience + maintenance).
- **Consequences:** Faster builds, HMR dev server, dead-simple deploy artifact;
  one-time mechanical module conversion cost.

#### ADR: Introduce optional persistence behind a `PlayerStore` interface  `[DECISION NEEDED]`
- **Context:** No persistence today (`worldserver.js:33-43`); progress is lost on
  disconnect. Whether to add it depends on whether this remains a demo or becomes
  a real game.
- **Decision:** Define a `PlayerStore` interface (wrap/adapt, level 3) with an
  in-memory default (preserves current behavior) and an optional Redis/Postgres
  implementation. Ship the interface even if the only impl is in-memory.
- **Alternatives considered:** Hard-wire a DB (rejected — over-scoping a demo);
  do nothing (rejected — leaves the biggest product limitation unaddressed).
- **Consequences:** Keeps the demo path zero-dependency while making real
  persistence a drop-in; needs a stakeholder decision on product direction.

## 4. Per-feature migration analysis

### F1. WebSocket transport (`server/js/ws.js`)
- **Current:** Dual-stack bridge over two libraries, JSON/BISON codec
  (ARCHITECTURE.md deep-dive 2).
- **Strategy:** Strangler Fig — keep `Server`/`Connection` interface, swap
  internals to `ws`, delete legacy path.
- **Coupling:** `main.js` (`onConnect`), all outgoing sends via `message.js`.
  Interface preserved → callers unchanged.
- **Effort:** **M.**
- **Risk:** Handshake/edge-case differences; client reconnection. Mitigate with a
  protocol smoke test (connect→HELLO→WELCOME).
- **Acceptance:** Existing client connects unmodified and completes
  spawn/move/chat against the new layer.

### F2. World simulation (`server/js/worldserver.js`)
- **Current:** In-memory instanced worlds + zone groups + tick loop
  (ARCHITECTURE.md deep-dive 1).
- **Strategy:** Leave in place. Only touch for runtime-compat fixes and `log`/`_`
  swaps.
- **Coupling:** Everything. That's why we don't rewrite it.
- **Effort:** **S** (compat only).
- **Risk:** Low; behavior preserved.
- **Acceptance:** Game loop tick + interest management behave identically (golden
  message-trace test).

### F3. Dependency swaps (`log`, `sanitizer`, `underscore`, `memcache`, `bison`)
- **Current:** Abandoned/unnecessary packages (`package.json:5-13`).
- **Strategy:** Swap (drop-in where possible). `underscore`→`lodash` is near
  drop-in; `_` call sites are broad so do it incrementally.
- **Coupling:** `log` is a global (`main.js:28-37`); `_` used widely;
  `sanitizer` in chat path (`format.js`/`player.js`); `memcache` only in
  `metrics.js`.
- **Effort:** **M** (`underscore`/global `log` are the wide ones; rest are S).
- **Risk:** Sanitizer behavior differences (XSS); `log` API shape. Mitigate with
  a chat-sanitization unit test and a thin logging shim.
- **Acceptance:** No abandoned deps remain; chat is provably sanitized; metrics
  endpoint still reports population.

### F4. Client build & module system (`bin/build.sh`, `client/js/build.js`, AMD)
- **Current:** RequireJS AMD + vendored `r.js` + name-based prune.
- **Strategy:** Swap toolchain to Vite; mechanically convert `define()`→ESM.
- **Coupling:** Every client module; `index.html` `data-main` entry
  (`index.html:356`).
- **Effort:** **L** (many modules, but mechanical).
- **Risk:** Module load order / circular deps surfacing under ESM. Mitigate
  module-by-module with the dev server.
- **Acceptance:** `vite build` produces a deployable `dist/`; game runs identically
  in browser.

### F5. Metrics/population (`server/js/metrics.js`)
- **Current:** Optional memcached counters across `game_servers`.
- **Strategy:** Wrap behind a `Metrics` interface; default impl exposes a
  Prometheus `/metrics` endpoint; Redis optional for multi-host aggregation.
- **Coupling:** `main.js` population poll (`main.js:15-26,68-95`).
- **Effort:** **S.**
- **Risk:** Low (optional subsystem, already behind `metrics_enabled`).
- **Acceptance:** `/status` unchanged; `/metrics` scrapeable; multi-host count
  works if Redis configured.

### F6. Persistence (new, optional)  `[DECISION NEEDED]`
- **Current:** None.
- **Strategy:** New `PlayerStore` interface, in-memory default + optional
  Redis/Postgres.
- **Coupling:** `player.js` load/save points; `worldserver.js` enter/leave.
- **Effort:** **L** (if real DB chosen), **S** (interface + in-memory only).
- **Risk:** Schema/data-migration only if a DB is adopted; none for in-memory.
- **Acceptance:** Player name/achievements/inventory survive reconnect when a
  persistent store is configured.

## 5. Phased implementation plan

Ordering: infrastructure & safety net first, then the runtime/transport upgrade
(prove the pattern on the riskiest piece early), then toolchain, then optional
product features. **A playable game on a modern stack is reached at the end of
Phase 2.**

> **Phase gating (applies to every phase):** A phase is **not complete** until
> its **Verification & exit criteria** pass. Each phase below carries a
> Definition of Done that must be (a) objectively verifiable (runnable commands
> / green CI, not a subjective judgement) and (b) actually executed and
> recorded before starting the next phase. No phase ships without its tests
> green. The authoritative signal is a green CI run on the phase's branch/PR.
> Do not advance to phase N+1 until phase N's exit criteria are demonstrably
> met.

---

## Phase 0: Safety net & baseline (T-shirt size: M) — ✅ COMPLETE

**Goal:** Make change safe before changing anything.
**Prerequisites:** None.
**Duration estimate:** 1-2 sprints.
**Status:** Complete. Verified on Node v25.8.2; CI targets Node 22. See
[`BASELINE.md`](./BASELINE.md).

### Tasks
| ID | Task | Component | Blocked by | Status |
|----|------|-----------|------------|--------|
| 0.1 | Add `package.json` scripts (`start`, `build`, `test`, `lint`, `format`) | root | — | ✅ |
| 0.2 | Add ESLint + Prettier; declare/curb implicit globals (`log`, `Types`, `Class`) — lenient (warn-only) on legacy | server+client | — | ✅ |
| 0.3 | Add protocol contract tests (Vitest): golden codes, all `message.js` serialize shapes, inbound `format.check()`, transport codec spec, client/server lockstep | test | — | ✅ |
| 0.4 | Add GitHub Actions CI (`npm ci`, lint, test) on Node 22 | `.github/workflows` | 0.1-0.3, 0.5 | ✅ |
| 0.5 | Resolve legacy-dep install strategy, pin deps + lockfile, record baseline | root | — | ✅ |

### Risks & Mitigations
- **Risk:** Old deps won't install on a modern machine to capture the baseline. →
  **Resolved:** `">0"` means `>=1.0.0` in npm semver, so the legacy manifest
  cannot install (`sanitizer` max is 0.1.3; `websocket-server` was unpublished
  in 2014). Pinned `underscore` as a real dep; moved the abandoned,
  Phase-1-doomed deps to `optionalDependencies` (failures tolerated). Golden
  expectations are derived from `message.js`/`gametypes.js`, not a live server.
- **Note:** Because `ws.js` requires the unpublished `websocket-server`, it
  cannot load yet; its wire contract is captured as an executable spec
  (`test/transport-contract.test.js`) that the Phase 1 `ws` adapter must satisfy.

### Verification & exit criteria (Definition of Done) — ✅ met
- [x] `npm ci` installs cleanly (legacy optional-dep failures tolerated).
- [x] `npm run lint` passes (0 errors; legacy warnings only).
- [x] `npm test` passes (42 tests / 5 files) against current source.
- [x] A hard-coded golden protocol fixture + transport codec spec exist and pass.
- [x] GitHub Actions CI runs `npm ci → lint → test` on Node 22 for every push/PR.
- [x] `package-lock.json` committed; baseline recorded in `BASELINE.md`.
- [x] **Net proven to fail:** a deliberate protocol mutation turns `npm test` red.
- [x] Purely additive — no game logic / `ws.js` / dependency behavior changed.

---

## Phase 1: Runtime upgrade & transport rewrite (T-shirt size: L) — ✅ COMPLETE

**Goal:** Run on Node 22 LTS with a single modern WebSocket library.
**Prerequisites:** Phase 0 (need the golden trace to prove parity).
**Duration estimate:** 2-3 sprints.

### Tasks
| ID | Task | Component | Blocked by |
|----|------|-----------|------------|
| 1.1 | Bump engines to Node 22; fix syntax/runtime breakages | server | 0.4 |
| 1.2 | Swap `log`→`pino` behind a thin logging shim | server | 1.1 |
| 1.3 | Rewrite `ws.js` internals onto `ws`, preserving `Server`/`Connection` interface | `server/js/ws.js` | 1.1 |
| 1.4 | Delete miksago/hixie legacy path + `bison` codec | `server/js/ws.js` | 1.3 |
| 1.5 | Swap `sanitizer`→`dompurify`/`xss` with a chat unit test | `format.js`/`player.js` | 1.1 |
| 1.6 | Run golden-trace test against the upgraded server | test | 1.3-1.5 |

### Risks & Mitigations
- **Risk:** `ws` handshake/edge differences break the unmodified client. →
  **Mitigation:** Interface-preserving rewrite + golden trace + manual smoke.
- **Risk:** Sanitizer swap changes escaping behavior. → **Mitigation:** unit
  tests over known XSS payloads in chat.

### Verification & exit criteria (Definition of Done)
- [x] Server boots on Node 22; `/status` responds.
- [x] Unmodified client completes spawn/move/chat/combat.
- [x] No abandoned server deps remain except those slated for Phase 3.

---

## Phase 2: Client toolchain modernization (T-shirt size: L) — ✅ COMPLETE

**Goal:** Build the client with Vite; drop RequireJS/`r.js`.
**Prerequisites:** Phase 1 (stable server to play against).
**Duration estimate:** 2-3 sprints.
**Status:** ✅ Complete (branch `phase-2`). All AMD `define()` modules converted to
full ESM, RequireJS/`r.js`/`build.sh` removed, client built with Vite, Playwright
smoke test green in CI alongside the existing Vitest suite.

### Tasks
| ID | Task | Component | Blocked by | Status |
|----|------|-----------|------------|--------|
| 2.1 | Introduce Vite; serve `index.html` in dev | client | — | ✅ |
| 2.2 | Mechanically convert AMD `define()` modules → ESM | `client/js/**` | 2.1 | ✅ |
| 2.3 | Replace `bin/build.sh` + `build.js` with `vite build`→`dist/` | build | 2.2 | ✅ |
| 2.4 | Remove vendored `bin/r.js` and name-based prune | bin | 2.3 | ✅ |
| 2.5 | Add a Playwright smoke test (load page → start game → see canvas) | test | 2.3 | ✅ |

### Risks & Mitigations
- **Risk:** Hidden circular deps surface under ESM. → **Mitigation:** convert
  module-by-module against the Vite dev server. *(Verified: `madge --circular client/js`
  reports no cycles across 50 modules.)*
- **Risk:** `mapworker.js` Web Worker import path changes. → **Mitigation:** use
  Vite's `?worker` import; smoke-test desktop map load. *(Implemented via
  `new Worker(new URL('./mapworker.js', import.meta.url), { type: 'module' })` in
  `map.js`, importing `world_client.json`.)*
- **Note:** ESM strict mode surfaced several latent sloppy-mode AMD bugs (implicit
  globals from `;`-instead-of-`,` var chains, `arguments.callee`, read-only
  `ImageData.data` assignment, jQuery 3 `.attr('value')` vs `.val()`, a prod-only
  dispatcher `JSON.parse` crash). All fixed; `eslint` `no-undef: error` on the ESM
  client is the permanent static gate.

### Verification & exit criteria (Definition of Done)
- [x] `vite build` emits a self-contained `client/dist/` (no RequireJS/`r.js`), with
      all static assets copied and no failed asset requests against a live server.
- [x] Playwright smoke test passes headless in CI (asserts no console/page errors,
      WebSocket connects, body reaches "started", background+entities canvases render
      non-transparent pixels).
- [x] Game is visually and functionally identical in browser.
- [x] Existing Vitest server/shared suite (60 tests) stays green; `npm run lint` passes.

---

## Phase 3: Utility & metrics cleanup (T-shirt size: M) — ✅ COMPLETE

**Goal:** Remove remaining legacy deps; modern observability.
**Prerequisites:** Phase 1.
**Duration estimate:** 1-2 sprints.

**Decisions (confirmed during implementation):**
- **`underscore` → native ES, no new dependency.** All ~50 server and ~75
  client call sites were trivially native; each was classified as
  array / object-map / array-like / context-bound before converting (the
  object-vs-array `_.each` distinction was the main hazard).
- **Single-host metrics only.** Dropped `memcache`; added a `prom-client`
  `/metrics` endpoint. Redis multi-host aggregation (original task 3.4) is
  **dropped, not deferred** — population totals now derive locally from the
  in-process worlds. `/metrics` is scrapeable by default, independent of the
  `metrics_enabled` flag (which still only gates in-game population sharing).

### Tasks
| ID | Task | Component | Blocked by | Status |
|----|------|-----------|------------|--------|
| 3.1 | Replace `underscore` with native ES (server + client + shared) | server+client+shared | 1.1 | ✅ |
| 3.2 | Rewrite `Metrics` onto `prom-client` (per-instance registry) | `metrics.js` | 1.1 | ✅ |
| 3.3 | Add `prom-client` `/metrics` endpoint (async, 500 on error) | server | 3.2 | ✅ |
| 3.4 | ~~Optional Redis impl for multi-host counts~~ (dropped); drop `memcache` | server | 3.2 | ✅ (dropped Redis) |

### Risks & Mitigations
- **Risk:** `_` semantics differ subtly (e.g., `_.min`/`_.detect` in
  `main.js:50-57`). → **Mitigation:** swap call-site by call-site with tests.

### Verification & exit criteria (Definition of Done)
- [x] No `underscore`/`memcache` in `package.json` (`prom-client` added; lockfile updated).
- [x] No `require`/`import` of `underscore` or `memcache` remains in source.
- [x] `npm run lint` (0 errors) and `npm run madge` (no new cycles) pass.
- [x] `npm test` green incl. new `test/metrics.test.js` (two-instance registry
      isolation, parseable Prometheus output, exact `/status` body unchanged).
- [x] `npm run test:e2e` (Playwright smoke) green — game plays identically.
- [x] `/metrics` scrapeable by default; async handler returns `500` on registry error.

---

## Phase 4: Optional persistence (T-shirt size: L) — ✅ COMPLETE

**Goal:** Make player progress survive reconnects.
**Prerequisites:** Phase 1; stakeholder decision on product direction.
**Duration estimate:** 2-4 sprints (only if greenlit).

### Decisions made (resolving the `[DECISION NEEDED]` flags)
- **Product direction:** persistence added as an **opt-in** feature; the game
  stays a demo by default (`persistence_enabled: false`).
- **Backend:** SQLite via `better-sqlite3` (file-based, zero-infra; WAL +
  `busy_timeout`, prepared statements). In-memory store available as a test
  double / `driver: "memory"` dev mode — **not** the disabled default.
- **Identity:** server-issued **anonymous opaque bearer token**
  (`crypto.randomUUID`), stored client-side in `localStorage`, presented on
  reconnect. No accounts/auth (documented demo-grade trust model).
- **Persisted state:** `name`, equipped `armor`/`weapon`, position, orientation,
  last checkpoint id. **Achievements/inventory were descoped** — achievements
  remain client-side (`client/js/storage.js`) and there is no server inventory
  beyond equipped gear.

### Tasks
| ID | Task | Component | Status |
|----|------|-----------|--------|
| 4.1 | `PlayerStore` interface + in-memory default + `SessionRegistry` | `server/js/playerstore.js` | ✅ |
| 4.2 | Load on HELLO / save on exit, gear, checkpoint, teleport, debounced move | `player.js`/`worldserver.js` | ✅ |
| 4.3 | SQLite store (`better-sqlite3`, WAL); no migration needed (fresh store) | `server/js/playerstore.js` | ✅ |
| 4.4 | Dual-run behind `persistence_enabled` flag (default off) | `main.js`/`config.json` | ✅ |

### Protocol / identity (append-only, lockstep-safe)
- HELLO accepts an **optional** 4th string token (relaxed unconditionally in
  `format.js`); WELCOME **appends** `orientation, armor, weapon, token` only when
  persistence is on, so the flag-off path is byte-for-byte unchanged.
- Concurrency fenced by a process-wide token→session registry: a duplicate-token
  login supersedes the older session, and a superseded session's save is ignored
  (no stale rollback). Persisted data is validated as untrusted on load.

### Risks & Mitigations
- **Risk:** Persistence introduces cheating/identity needs (no auth today). →
  **Mitigation:** opaque tokens are bearer credentials (documented), anonymous
  play remains the default, tokens are never logged raw.

### Verification & exit criteria (Definition of Done)
- [x] With a store configured, name/gear/position/checkpoint persist across
      reconnect; default (flag-off) in-memory path unchanged.
- [x] `npm run lint` (0 errors) and `npm test` green (incl.
      `test/playerstore.test.js`, `test/persistence-reconnect.test.js`,
      relaxed `test/format-check.test.js`); `npm run test:e2e` + contract tests
      green. Verified live: token issued on first connect restores name/gear/
      position on reconnect; flag-off server still accepts a token-carrying
      HELLO and returns the original 6-field WELCOME.

---

## Phase 5: Optional TypeScript & DX polish (T-shirt size: M) — ✅ COMPLETE

**Goal:** Type the protocol and core modules incrementally.
**Prerequisites:** Phases 1-2.
**Duration estimate:** 1-3 sprints, opportunistic.
**Status:** Complete. Protocol surface type-checked end to end via JSDoc +
`checkJs` + a hand-authored ambient `.d.ts`; `npm run typecheck` is a required
CI gate. Verified on TypeScript 5.9.

### Decisions made (resolving the §7 `[DECISION NEEDED]` flag)
- **Strategy:** **JSDoc + `checkJs` + ambient `.d.ts`** — NOT a `.ts`
  conversion. No file renames, no runtime/build changes; `tsc --noEmit` is a
  pure static gate, so the shipped JS bytes are byte-for-byte unchanged. This
  respects the dual-runtime constraint of `shared/js/gametypes.js` (CommonJS on
  disk for the Node server + Vitest, rewritten to ESM in-memory by the Vite
  plugin for the client) and the "cheapest migration" principle.
- **Scope:** **Protocol surface only** — `shared/js/gametypes.js`,
  `server/js/message.js`, `server/js/format.js`. This satisfies the DoD with the
  smallest, cleanest gate and minimal legacy-error noise. Typing
  `worldserver.js`/`player.js` (original task 5.3) was **descoped** to keep the
  gate green and noise-free; it can be picked up opportunistically later.
- **Type source of truth:** a colocated `shared/js/gametypes.d.ts` (literal
  message/entity/orientation codes + helper signatures, `export = Types` /
  `export as namespace Types`) is auto-discovered for both the server `require`
  and the client `import` — one declaration consumed by both sides (task 5.2).
- **Legacy globals:** `types/legacy-globals.d.ts` declares the leaked
  `Class`/`FormatChecker`/`log` globals; `server/js/lib/class.d.ts` shadows the
  un-typeable John-Resig shim so `tsc` doesn't descend into it. CommonJS globals
  come from `@types/node`.
- **Strictness:** pragmatic legacy baseline (`strict:false` +
  `strictNullChecks:true`), not full `strict`, to avoid `this`/global noise on
  the 2012 inheritance pattern. Proven green locally before the CI gate landed.

### Tasks
| ID | Task | Component | Status |
|----|------|-----------|--------|
| 5.1 | Add TS + `allowJs`/`checkJs`; type `shared/gametypes.js` first (protocol) via ambient `.d.ts` | shared | ✅ |
| 5.2 | Shared protocol types (`gametypes.d.ts`) consumed by both client & server | shared | ✅ |
| 5.3 | Type `worldserver.js`/`player.js` incrementally | server | ⏭️ Descoped (protocol-only scope) |

### Verification & exit criteria (Definition of Done)
- [x] Protocol is type-checked end to end (`gametypes.js` + `message.js` +
      `format.js` against `gametypes.d.ts`); `npm run typecheck` passes with no
      emit. Negative test confirmed the gate fails on a bogus protocol code.
- [x] `npm run lint` (0 errors), `npm test` (86 tests incl.
      `test/transport-contract.test.js`, `test/protocol-codes.test.js`), and
      `npm run madge` green; `npm run test:e2e` green — confirms the
      comment-only changes did not alter the wire protocol. Runtime JS
      unchanged (no `.ts` files, no build-output change).

---

## 6. Migration safety net

- **Feature flags:** transport library, BISON removal, metrics backend, and
  persistence each behind a flag/config so old and new coexist during cutover
  (mirrors today's `useBison`/`metrics_enabled` pattern,
  `server/js/ws.js:12`, `server/config.json:7`).
- **Data migration:** only relevant in Phase 4. Use a dual-write/backfill period
  between in-memory and the persistent `PlayerStore`; ship in-memory default
  first so no migration is needed to keep playing.
- **Rollback plan:** every phase is independently deployable and
  interface-preserving (esp. `ws.js` `Server`/`Connection`), so rollback = deploy
  the previous server/client pair. Keep client+server lockstep because the
  protocol module is shared (ARCHITECTURE.md Part 2).
- **Testing strategy:** Phase 0 establishes the golden protocol trace + lint/CI;
  Phase 1 adds chat-sanitization and transport-parity tests; Phase 2 adds a
  Playwright browser smoke test. No phase ships without its tests green.
- **Observability:** `/status` stays as the contract health check throughout;
  Phase 3 adds Prometheus `/metrics` (player counts, tick duration, connection
  churn) so the new stack can be proven to match the old behaviorally.

## 7. Open questions / decisions needed

- ✅ **RESOLVED (Phase 4)** **Product direction:** persistence shipped as an
  opt-in feature (`persistence_enabled`, default off); stays a demo by default.
- ✅ **RESOLVED (Phase 4)** **Persistence backend:** SQLite (`better-sqlite3`,
  file-based, zero-infra) — chosen over Redis/Postgres for the single-host demo.
- ✅ **RESOLVED (Phase 4)** **Accounts/auth:** anonymous opaque bearer tokens
  (no real accounts); anonymous play remains the default.
- ✅ **RESOLVED (Phase 5)** **TypeScript:** adopt types via **JSDoc + `checkJs`
  + ambient `.d.ts`** (no `.ts` conversion, no runtime/build change), scoped to
  the protocol surface. `npm run typecheck` is a required CI gate.
- `[DECISION NEEDED]` **Multi-host topology:** is the `game_servers` memcached
  fan-out (`metrics.js:31,40`) still a target, or is single-host sufficient? This
  decides whether Phase 3.4 (Redis) is needed. (The Phase 4 SQLite store and
  in-process session registry assume single-host; multi-host would need a shared
  store + registry.)
- **Map tooling** (`tools/maps`, OSX/Python/`lxml`): out of scope for the core
  modernization, but flagged — it's slow and brittle
  (`tools/maps/README.md:3`). Modernize only if active map editing is required.
