BrowserQuest client documentation
=================================

The client is a browser game built from ES modules and bundled with
[Vite](https://vite.dev/). RequireJS, the vendored `r.js` optimizer, and the old
`bin/build.sh` toolchain have been removed (Phase 2 of the modernization plan).

All commands below are run from the **project root**.

Development
----------

Start the Phase-1 game/WebSocket server and the Vite dev server:

```
npm start          # game server on ws://localhost:8000
npm run dev        # Vite dev server (http://localhost:5173) with HMR
```

Open the dev URL in a browser. The dev server serves `client/index.html`; edits to
`client/js/**` hot-reload.

Configuration (WebSocket host/port)
-----------------------------------

The client reads its connection settings from Vite environment variables at build
time (see `client/js/config.js`). There is no committed machine-specific JSON file
anymore. Defaults: host `localhost`, port `8000`, dispatcher disabled.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_GAME_HOST` | `localhost` | WebSocket host the client connects to |
| `VITE_GAME_PORT` | `8000` | WebSocket port |
| `VITE_DISPATCHER` | `false` | `true` for Mozilla-style load-balancing dispatcher mode; the bundled Phase-1 server uses direct connect (`false`) |

Set them via a `.env` file at the repo root or inline, e.g.:

```
VITE_GAME_HOST=play.example.com VITE_GAME_PORT=443 npm run build:client
```

Production build
----------------

```
npm run build:client   # vite build → client/dist/
npm run preview        # serve the built client (http://localhost:4173)
```

`client/dist/` is a self-contained, deployable directory: hashed/bundled JS+CSS
plus all runtime static assets (`img/`, `audio/`, `maps/`, `sprites/`, `fonts/`)
and the classic pre-entry scripts (`detect.js`, `modernizr.js`,
`css3-mediaqueries.js`, `css/ie.css`) copied verbatim by the custom
`copyStaticAssets` plugin in `vite.config.js`. It has no dependency on any other
file/folder in the repository and can be renamed and deployed anywhere behind a
running game server.

> Note: music assets (`audio/music/`) are not shipped in this repository (licensed
> separately), so the browser logs a benign "could not be loaded" message for the
> background tracks. Sound effects under `audio/sounds/` are present.

Module system notes
-------------------

- Every app module under `client/js/**` is a native ES module with explicit
  `import`/`export`. The entry chain is `index.html` -> `js/home.js` -> `js/main.js`
  -> dynamic `import('./game.js')`.
- `detect.js`, `js/lib/modernizr.js`, and `js/lib/css3-mediaqueries.js` remain
  **classic global scripts** because inline checks in `index.html` reference
  `Detect`/`Modernizr` before the deferred module entry runs.
- `shared/js/gametypes.js` stays CommonJS (`require`/`module.exports`) to serve both
  the Node server and Vitest; the client consumes it via Vite's CJS->ESM interop.
- The map Web Worker (`js/mapworker.js`) is an ESM worker instantiated with
  `new Worker(new URL('./mapworker.js', import.meta.url), { type: 'module' })` and
  imports `maps/world_client.json`.
- ESM runs in strict mode. `eslint` is configured with `no-undef: error` on the
  client to statically catch any reintroduced implicit globals — run `npm run lint`.

Testing
-------

```
npm test           # Vitest server + shared-protocol suite
npm run test:e2e   # Playwright headless smoke test (builds dist/, boots server,
                   # asserts the game connects, starts, and renders)
npm run madge      # circular-dependency check on client/js
```
