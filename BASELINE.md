# Phase 0 Baseline

Known-good baseline captured at the end of Phase 0 (safety net) of the
[modernization plan](./MODERNIZATION_PLAN.md). This records the toolchain state,
the legacy-dependency strategy, and how to verify the net.

## Environment

| | |
|---|---|
| Captured on | Node `v25.8.2`, npm `11.11.1` |
| CI target | Node 22 LTS (`.github/workflows/ci.yml`) |
| Original runtime | Node 0.4.7 (`server/README.md`) — ~13 years past EOL |

## Verified commands

| Command | Result |
|---------|--------|
| `npm ci` | OK — 145 packages, optional legacy deps tolerated |
| `npm run lint` | OK — 0 errors, ~246 legacy warnings (lenient gate) |
| `npm test` | OK — 42 tests across 5 files |
| `npm run format:check` | OK — new/tooling files only (legacy tree ignored) |

CI (`.github/workflows/ci.yml`) runs `npm ci → npm run lint → npm test` on
Node 22 for every push and pull request.

## Legacy dependency strategy (the key Phase 0 decision)

The original `package.json` used `">0"` ranges. In npm semver `>0` means
`>=1.0.0`, so the manifest **cannot install on the modern registry**:

- `sanitizer` — newest published version is `0.1.3`, so `>0` matched nothing and
  aborted the entire install.
- `websocket-server` (miksago) — **unpublished from npm in 2014** (404).

Resolution for Phase 0 (record the baseline without changing runtime behavior):

- **`underscore` `1.13.7`** — a real `dependency`; required (transitively) by the
  protocol tests and the server. Verified to provide the functions the code uses
  (`pluck`, `all`, `detect`, `isNumber`, `min`, `each`).
- **`log`, `bison`, `websocket`, `sanitizer`, `memcache`** — pinned exact in
  **`optionalDependencies`**. They are all slated for replacement/removal in
  Phase 1/3 (`log`→pino, `sanitizer`→dompurify/xss, `bison` removed,
  `websocket`/dual-stack→`ws`, `memcache`→prom-client/Redis). Marking them
  optional keeps install green if any becomes unavailable.
- **`websocket-server`** — omitted entirely (unpublished). The miksago/hixie
  legacy path that requires it is deleted in Phase 1.

**Consequence:** `server/js/ws.js` cannot be loaded today (it `require`s the
unpublished `websocket-server`). The transport wire contract is therefore
captured as an executable spec in `test/transport-contract.test.js`, derived
directly from `ws.js`, which the Phase 1 `ws` adapter must satisfy. Full server
boot (`npm start`) is **not** expected to work until Phase 1 — it is a Phase 1
validation step, not a Phase 0 gate.

## The safety net (what protects Phase 1)

| Test file | Guards |
|-----------|--------|
| `test/protocol-codes.test.js` | Hard-coded golden message-code map vs `gametypes.js` |
| `test/message-serialize.test.js` | Every `message.js` serialize() shape + inline WELCOME |
| `test/format-check.test.js` | Inbound `format.check()` accept/reject cases |
| `test/transport-contract.test.js` | Wire codec contract (JSON encode/decode, batch, invalid-JSON→close) — the Phase 1 `ws` spec |
| `test/client-decoder.test.js` | Client/server positional lockstep (`gameclient.js` readers vs server serialize) |

### Proving the net can fail

A safety net only counts if it catches regressions. To validate, deliberately
break one thing — e.g. change a code in `shared/js/gametypes.js`, or make the
codec double-stringify in `test/transport-contract.test.js` — and confirm
`npm test` goes red, then revert. This demonstrates the net catches the Phase 1
class of regressions (protocol drift + transport encoding changes).

## Phase 0 was purely additive

No game logic, `ws.js`, or dependency *behavior* was changed. Only added:
`package.json` scripts + pinned deps, `eslint.config.js`, `.prettierrc.json` /
`.prettierignore`, `vitest.config.js`, `test/**`, `.github/workflows/ci.yml`,
and this note.
