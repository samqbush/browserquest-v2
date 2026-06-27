# Copilot Instructions — BrowserQuest

BrowserQuest is a tile-based, top-down HTML5/WebSocket MMORPG demo (originally
Mozilla, 2012) being **modernized in place**. Phases 0–2 are complete (Node 22
runtime, `ws` transport, Vite/ESM client). The architecture is intentionally
unchanged; work is upgrade-and-swap, not rewrite. See `MODERNIZATION_PLAN.md`
for the phase roadmap, `ARCHITECTURE.md` for the audited current state, and
`BASELINE.md` for the known-good toolchain baseline.

The only git remote is `origin` (`samqbush/browserquest-v2`). The original
Mozilla repo is **archived** — do not add it (or any other) as an `upstream`
remote.

## Commands

| Action | Command |
|--------|---------|
| Run game/WebSocket server | `npm start` (= `node server/js/main.js`, port 8000) |
| Run client dev server | `npm run dev` (Vite, port 5173) |
| Build client | `npm run build` → `client/dist/` |
| Unit tests (all) | `npm test` (Vitest) |
| Single test file | `npx vitest run test/sanitize.test.js` |
| Single test by name | `npx vitest run -t "<test name substring>"` |
| Watch tests | `npm run test:watch` |
| E2E smoke test | `npm run test:e2e` (Playwright; builds client + boots server) |
| Lint | `npm run lint` |
| Format / check | `npm run format` / `npm run format:check` |
| Circular-dep check | `npm run madge` (client only) |

CI (`.github/workflows/ci.yml`) runs lint → test → madge, plus a separate
build + E2E smoke job, on Node 22 for every push and PR.

These instruction commands must be updated if new long term commands are decided on.  This must be verified with the user during a planning session.

## Phases

- `MODERNIZATION_PLAN.md` should be updated with the current status once an exit criteria is met for a phase.  If a phase is pass/fail is unknown this should be reported to the user.
- When creating a phase plan, all sub decisions must be decided and documented in the plan so that the implementation can be done without further user input.

Each phase has its own exit criteria in the plan, but all phases share one gate: a phase is done only when its criteria are objectively verifiable (green CI / runnable commands, not judgement) and have actually been run and recorded. `npm run lint` and `npm test` must pass; if client/transport/protocol changed, `npm run test:e2e` must pass and the contract tests (`test/transport-contract.test.js`, `test/protocol-codes.test.js`) stay green. Green CI on the branch is the authoritative signal. Don't advance to the next phase until the current one's criteria are met.

## Branching & PRs

Each phase is developed on its own branch — never commit phase work directly to
the default branch (`v2`). Create a new branch at the start of a phase (e.g.
`phase-3-utility-metrics-cleanup`). Once the phase's exit criteria are met and
recorded (green lint/test, and E2E + contract tests when client/transport/
protocol changed), push the branch and open a PR to the default branch. Let CI
on the PR be the authoritative green signal before merging.
