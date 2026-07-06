BrowserQuest
============

BrowserQuest is a HTML5/JavaScript multiplayer game experiment — a top-down,
tile-based world rendered on `<canvas>`, with many players connecting over
WebSockets to instanced game worlds running on a Node.js server.

> **Modernized fork.** Originally a 2012 Mozilla tech demo, this `v2` codebase has
> been brought up to a maintainable Node 22 stack (Phases 0–5 complete). The
> game's architecture was deliberately **preserved** — this was an
> *upgrade-and-swap, not a rewrite*, and the net result is *less* code.


Before → After
--------------

| | Before (2012) | After (`v2`) |
|---|---|---|
| **Node.js runtime** | v0.4.7 (well past EOL) | Node 22 LTS |
| **WebSocket layer** | Two bridged stacks (`websocket` + `websocket-server`) | Single maintained `ws` library |
| **Client build** | RequireJS AMD + vendored `r.js` optimizer | Vite (ES modules + bundling) |
| **Tests** | None | Vitest unit/integration + Playwright E2E smoke |
| **CI** | None | GitHub Actions: lint → typecheck → test → madge, + build + E2E |
| **Lint / format** | None | ESLint + Prettier |
| **Type safety** | None | Protocol surface type-checked (`tsc --noEmit` gate) |
| **Persistence** | None (in-memory only) | Opt-in SQLite player store (default off) |
| **Metrics** | Abandoned `memcache` | Prometheus `/metrics` (`prom-client`) |
| **Dependencies** | Unpinned, 5 of 7 abandoned | Pinned + lockfile, all maintained |

See **[BEFORE_AFTER.md](BEFORE_AFTER.md)** for the full side-by-side and
**[ARCHITECTURE.md](ARCHITECTURE.md)** for the audited architecture.


What deliberately stayed the same
---------------------------------

The bones were sound, so modern equivalents replaced unmaintained machinery
without changing how the game works:

* Canvas 2D renderer
* A* pathfinding (`astar.js`)
* Instanced-world + zone-group interest-management design (`worldserver.js`)
* The shared `gametypes.js` lockstep protocol
* The game-loop tick model


Quick start
-----------

Install dependencies with `npm install`, then:

```
npm start            # run game/WebSocket server (port 8000)
npm run dev          # Vite client dev server (port 5173)
npm run build        # build client → client/dist/
npm test             # Vitest unit/integration suite
npm run test:e2e     # Playwright smoke test (builds client + boots server)
```

See **[client/README.md](client/README.md)** and
**[server/README.md](server/README.md)** for details.


Documentation
-------------

* **[BEFORE_AFTER.md](BEFORE_AFTER.md)** — before/after of the modernization
* **[ARCHITECTURE.md](ARCHITECTURE.md)** — audited current architecture
* **[MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md)** — phase-by-phase roadmap
* **[BASELINE.md](BASELINE.md)** — known-good toolchain baseline
* **[client/README.md](client/README.md)** / **[server/README.md](server/README.md)** — client & server specifics


License
-------

Code is licensed under MPL 2.0. Content is licensed under CC-BY-SA 3.0.
See the LICENSE file for details.


Credits
-------
Created by [Little Workshop](http://www.littleworkshop.fr):

* Franck Lecollinet - [@whatthefranck](http://twitter.com/whatthefranck)
* Guillaume Lecollinet - [@glecollinet](http://twitter.com/glecollinet)