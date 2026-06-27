// Phase 3: prom-client-backed metrics. Verifies the single-host Metrics class
// exposes parseable Prometheus text reflecting local world player counts, that
// two instances can coexist in one process (per-instance registry — no
// "metric already registered" collision on a shared global registry), and that
// the ws.js HTTP server serves the output at GET /metrics.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ws.js / metrics-adjacent code references a global `log`.
globalThis.log = { info() {}, debug() {}, error() {}, warn() {} };

const Metrics = require(path.join(ROOT, 'server/js/metrics.js'));
const WS = require(path.join(ROOT, 'server/js/ws.js'));

function fakeWorlds(counts) {
  return counts.map((c, i) => ({ id: 'world' + (i + 1), playerCount: c }));
}

describe('Metrics (prom-client)', () => {
  it('constructs two instances in one process without registry collision', () => {
    const a = new Metrics({});
    const b = new Metrics({});
    expect(a.isReady).toBe(true);
    expect(b.isReady).toBe(true);
    expect(a.registry).not.toBe(b.registry);
  });

  it('ready() fires the callback synchronously', () => {
    const m = new Metrics({});
    let called = false;
    m.ready(() => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('getTotalPlayers sums local world player counts', () => {
    const m = new Metrics({});
    expect(m.getTotalPlayers(fakeWorlds([3, 5, 0]))).toBe(8);
  });

  it('exposes parseable Prometheus text reflecting world counts', async () => {
    const m = new Metrics({});
    m.updatePlayerCounters(fakeWorlds([2, 4]));
    const text = await m.getMetrics();

    expect(text).toContain('bq_players_total 6');
    expect(text).toContain('bq_worlds_total 2');
    expect(text).toContain('bq_world_players{world="world1"} 2');
    expect(text).toContain('bq_world_players{world="world2"} 4');
    // HELP/TYPE lines present => valid exposition format.
    expect(text).toMatch(/# TYPE bq_players_total gauge/);
  });

  it('updatePlayerCounters calls back with the local total', () => {
    const m = new Metrics({});
    let total;
    m.updatePlayerCounters(fakeWorlds([1, 1, 1]), (t) => {
      total = t;
    });
    expect(total).toBe(3);
  });

  it('getContentType returns the prom-client exposition content type', () => {
    const m = new Metrics({});
    expect(m.getContentType()).toMatch(/text\/plain/);
  });
});

describe('ws.js GET /metrics', () => {
  let server;
  let port;

  beforeAll(async () => {
    server = new WS.MultiVersionWebsocketServer(0);
    await new Promise((resolve) => {
      if (server._httpServer.listening) resolve();
      else server._httpServer.once('listening', resolve);
    });
    port = server._httpServer.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function get(p) {
    return new Promise((resolve, reject) => {
      http
        .get('http://127.0.0.1:' + port + p, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        })
        .on('error', reject);
    });
  }

  it('serves prom-client output via onRequestMetrics with the right content type', async () => {
    const m = new Metrics({});
    m.updatePlayerCounters(fakeWorlds([7]));
    server.onRequestMetrics(() => m.getMetrics(), m.getContentType());

    const res = await get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toContain('bq_players_total 7');
  });

  it('returns 404 when no metrics callback is registered', async () => {
    const bare = new WS.MultiVersionWebsocketServer(0);
    await new Promise((resolve) => {
      if (bare._httpServer.listening) resolve();
      else bare._httpServer.once('listening', resolve);
    });
    const barePort = bare._httpServer.address().port;
    const res = await new Promise((resolve, reject) => {
      http
        .get('http://127.0.0.1:' + barePort + '/metrics', (r) => {
          r.on('data', () => {});
          r.on('end', () => resolve({ status: r.statusCode }));
        })
        .on('error', reject);
    });
    expect(res.status).toBe(404);
    await new Promise((resolve) => bare.close(resolve));
  });
});
