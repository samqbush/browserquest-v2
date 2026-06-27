// Transport integration smoke (Phase 1): exercises the REAL server/js/ws.js
// adapter end-to-end against a real `ws` client, replacing the false confidence
// of a local encode/decode reference impl. Verifies the wire contract the
// unmodified BrowserQuest client depends on:
//   - send(messageArray)  -> JSON text on the wire
//   - send(batch [[..],[..]]) -> preserved [[..],[..]] framing
//   - sendUTF8("go"/"timeout") -> RAW string sentinels (not JSON-quoted)
//   - inbound valid JSON   -> listen_callback(parsed)
//   - inbound invalid JSON -> connection closed (not thrown)
//   - GET /status          -> status_callback output
//   - connection removed from the server registry on close
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ws.js Connection.close() references a global `log`.
globalThis.log = { info() {}, debug() {}, error() {}, warn() {} };

const WS = require(path.join(ROOT, 'server/js/ws.js'));

let server;
let port;
let serverConn; // the server-side Connection wrapper for the active client

function waitListening(srv) {
  return new Promise((resolve) => {
    if (srv._httpServer.listening) resolve();
    else srv._httpServer.once('listening', resolve);
  });
}

function connectClient() {
  return new Promise((resolve, reject) => {
    serverConn = null;
    server.onConnect((conn) => {
      serverConn = conn;
    });
    const client = new WebSocket('ws://127.0.0.1:' + port);
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });
}

// Wait until the server-side wrapper for the just-opened client exists.
function waitServerConn() {
  return new Promise((resolve) => {
    const tick = () => (serverConn ? resolve(serverConn) : setImmediate(tick));
    tick();
  });
}

function nextMessage(client) {
  return new Promise((resolve) => {
    client.once('message', (data) => resolve(data.toString('utf8')));
  });
}

beforeAll(async () => {
  server = new WS.MultiVersionWebsocketServer(0); // ephemeral port
  await waitListening(server);
  port = server._httpServer.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('ws.js adapter: outbound framing', () => {
  it('send(messageArray) serializes to JSON text', async () => {
    const client = await connectClient();
    await waitServerConn();
    const received = nextMessage(client);
    serverConn.send([4, 7, 10, 20]);
    expect(await received).toBe('[4,7,10,20]');
    client.close();
  });

  it('send(batch) preserves the [[...],[...]] shape', async () => {
    const client = await connectClient();
    await waitServerConn();
    const received = nextMessage(client);
    serverConn.send([
      [4, 7, 10, 20],
      [11, 7, 'hi'],
    ]);
    expect(await received).toBe('[[4,7,10,20],[11,7,"hi"]]');
    client.close();
  });

  it('sendUTF8 sends raw string sentinels (not JSON-quoted)', async () => {
    const client = await connectClient();
    await waitServerConn();
    const go = nextMessage(client);
    serverConn.sendUTF8('go');
    expect(await go).toBe('go');
    client.close();
  });
});

describe('ws.js adapter: inbound handling', () => {
  it('parses valid JSON into a message array for listen_callback', async () => {
    const client = await connectClient();
    const conn = await waitServerConn();
    const got = new Promise((resolve) => conn.listen(resolve));
    client.send('[4,10,20]');
    expect(await got).toEqual([4, 10, 20]);
    client.close();
  });

  it('closes the connection on invalid JSON (does not throw)', async () => {
    const client = await connectClient();
    const conn = await waitServerConn();
    conn.listen(() => {});
    const closed = new Promise((resolve) => client.once('close', resolve));
    client.send('not valid json{');
    await closed; // server closed us
    expect(true).toBe(true);
  });
});

describe('ws.js adapter: server surface', () => {
  it('serves GET /status via the status_callback', async () => {
    server.onRequestStatus(() => JSON.stringify([1, 2, 3]));
    const body = await new Promise((resolve, reject) => {
      http
        .get('http://127.0.0.1:' + port + '/status', (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    expect(body).toBe('[1,2,3]');
  });

  it('removes a connection from the registry on close', async () => {
    const client = await connectClient();
    const conn = await waitServerConn();
    expect(server.getConnection(conn.id)).toBe(conn);
    const gone = new Promise((resolve) => conn.onClose(resolve));
    client.close();
    await gone;
    // removeConnection runs in the same 'close' handler after close_callback.
    await new Promise((r) => setImmediate(r));
    expect(server.getConnection(conn.id)).toBeUndefined();
  });
});
