# BrowserQuest — Before & After

A side-by-side of the BrowserQuest modernization. The **Before** is the project
frozen at commit `af32d24` ("Update map exporter docs") — the last commit before
Phase 0. The **After** is the `v2` branch (commit `e62ad61`), with all five
modernization phases complete. The architecture was deliberately preserved; this
was an **upgrade-and-swap, not a rewrite**.

---

## TL;DR

| | Before (`af32d24`, 2012) | After (`v2`, 2026) |
|---|---|---|
| **Node.js runtime** | v0.4.7 (≈13 yrs past EOL) | Node 22 LTS |
| **WebSocket layer** | Two bridged stacks (`websocket` + `websocket-server`) for obsolete 2012 browser drafts | Single maintained `ws` library |
| **Client build** | RequireJS AMD + 344 KB vendored `r.js` + brittle name-based prune | Vite (ES modules + bundling) |
| **Tests** | None | ~76 unit/integration tests (Vitest) + Playwright E2E smoke |
| **CI** | None | GitHub Actions: lint → typecheck → test → madge, + build + E2E |
| **Lint / format** | None | ESLint + Prettier |
| **Type safety** | None | Protocol surface type-checked (`tsc --noEmit` gate) |
| **Persistence** | None (in-memory only) | Opt-in SQLite player store (default off) |
| **Metrics** | Abandoned `memcache` | Prometheus `/metrics` (`prom-client`) |
| **Abandoned deps** | `log`, `bison`, `websocket-server`, `sanitizer`, `memcache` | All removed/replaced |

**Net change:** 106 files changed, ~8,883 insertions, ~20,542 deletions — a
*smaller, simpler* codebase with a full safety net.

---

## Dependencies

### Before
```json
"dependencies": {
  "underscore": ">0",
  "log": ">0",
  "bison": ">0",
  "websocket": ">0",
  "websocket-server": ">0",
  "sanitizer": ">0",
  "memcache": ">0"
}
```
- Unpinned (`>0`), no lockfile.
- Five of seven packages were **abandoned** and won't install/run on modern Node.

### After
```json
"dependencies": {
  "better-sqlite3": "^12.11.1",
  "jquery": "^3.7.1",
  "pino": "^10.3.1",
  "prom-client": "^15.1.3",
  "ws": "^8.21.0",
  "xss": "^1.0.15"
}
```
- Pinned ranges + committed `package-lock.json`.
- Dev tooling added: ESLint, Prettier, Vite, Vitest, Playwright, TypeScript, madge.

| Concern | Before | After |
|---|---|---|
| Utility | `underscore` | Native ES (removed) |
| Logging | `log` (abandoned) | `pino` |
| Binary codec | `bison` (unused, `useBison=false`) | Removed |
| WebSocket | `websocket` + `websocket-server` | `ws` |
| Sanitization | `sanitizer` (abandoned) | `xss` |
| Metrics store | `memcache` (abandoned) | `prom-client` |

---

## Developer workflow

### Before
- No `package.json` scripts. No documented build/test/run commands beyond a shell
  script (`bin/build.sh`) and manual `node` invocation.
- No tests, no lint, no CI — every change was high-risk and unverifiable.

### After
```
npm start            # run game/WebSocket server (port 8000)
npm run dev          # Vite client dev server (port 5173)
npm run build        # build client → client/dist/
npm test             # Vitest unit/integration suite
npm run test:e2e     # Playwright smoke test (builds client + boots server)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (protocol surface)
npm run format       # Prettier
npm run madge        # circular-dependency check
```
- CI runs the full gate on Node 22 for every push and PR.

---

## What changed structurally

**Removed (dead weight):**
`bin/build.sh`, `bin/r.js` (vendored optimizer), `client/js/build.js`,
`client/js/lib/require-jquery.js`, `client/js/lib/underscore.min.js`,
`client/js/text.js`, AMD config dist files.

**Added (safety net & docs):**
`ARCHITECTURE.md`, `MODERNIZATION_PLAN.md`, `BASELINE.md`,
`.github/workflows/ci.yml`, ESLint/Prettier config, Vite/Vitest/Playwright
config, `tsconfig.json` + protocol `.d.ts` types, a full `test/` suite, and
`server/js/playerstore.js` (opt-in persistence).

**The WebSocket layer:** the most complex server subsystem dropped from a
294-line dual-stack bridge to a 237-line thin adapter over `ws` — while
preserving the existing `Server`/`Connection` interface, so callers were
untouched.

---

## What deliberately stayed the same

The bones were sound, so they were kept as-is:

- ✅ Canvas 2D renderer
- ✅ A* pathfinding (`astar.js`)
- ✅ Instanced-world + zone-group interest-management design (`worldserver.js`)
- ✅ The shared `gametypes.js` lockstep protocol
- ✅ The game-loop tick model
- ✅ jQuery on the client (run through a modern bundler)

This is why the change is mostly *deletions*: modern equivalents replaced
unmaintained machinery without altering how the game actually works.

---

## Phase-by-phase outcome

| Phase | Scope | Result |
|---|---|---|
| **0 — Safety net** | Scripts, ESLint/Prettier, protocol contract tests, CI, dep baseline | ✅ Complete |
| **1 — Runtime & transport** | Node 0.4.7 → 22; dual WebSocket stack → single `ws` | ✅ Complete |
| **2 — Client toolchain** | RequireJS/`r.js` → Vite; AMD → ESM; Playwright smoke test | ✅ Complete |
| **3 — Utility & metrics** | Drop `underscore`; `memcache` → `prom-client` `/metrics` | ✅ Complete |
| **4 — Optional persistence** | `PlayerStore` + SQLite (`better-sqlite3`), anonymous tokens, flag-gated (default off) | ✅ Complete |
| **5 — TypeScript & DX** | JSDoc + `checkJs` + ambient `.d.ts` on the protocol surface; `typecheck` CI gate | ✅ Complete |

Every phase was independently deployable and interface-preserving, with green
lint/test (and E2E + contract tests when client/transport/protocol changed) as
the authoritative completion signal.

---

## Bottom line

BrowserQuest went from a **2012 demo that modern tooling can't even install** —
EOL runtime, abandoned dependencies, no tests, no CI, no persistence — to a
**maintainable Node 22 codebase** with a single standard WebSocket library, a
modern client build, a full automated test/CI safety net, optional persistence,
and Prometheus metrics. All of it achieved **without rewriting the game**: the
architecture is unchanged, and the net result is *less* code.
