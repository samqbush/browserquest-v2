// Transport codec contract (the test the ws.js rewrite in Phase 1 must satisfy).
//
// Phase 1 replaces server/js/ws.js (dual-stack Worlize + miksago) with the
// maintained `ws` library. The current ws.js cannot be loaded in test today
// because it requires `websocket-server`, which was unpublished from npm in
// 2014. So this file encodes the *wire codec contract* the current code
// implements, derived directly from ws.js, as an executable spec:
//
//   - send(message):  data = JSON.stringify(message); sendUTF8(data)
//       (ws.js:237-244 Worlize, ws.js:281-288 miksago; useBison === false at
//        ws.js:12, BISON is out of scope for this baseline)
//   - receive(text):  listen_callback(JSON.parse(text))
//       (ws.js:215-216 / 268)
//   - invalid JSON inbound: the connection is closed, not thrown
//       (ws.js:217-223 -> close("Received message was not valid JSON."))
//
// Batches are sent as-is: worldserver.processQueues() calls
// connection.send(outgoingQueue) where the queue is an array of message arrays
// (ws.js callers, worldserver.js:318), i.e. a [[...],[...]] shape.
//
// Phase 1 acceptance: point `encode`/`decode` below at the real new adapter and
// keep every assertion green.
import { describe, it, expect } from 'vitest';

// Reference implementation mirroring ws.js exactly (useBison === false).
function encode(message) {
  return JSON.stringify(message);
}

function decode(text) {
  return JSON.parse(text);
}

describe('transport codec: outbound send()', () => {
  it('serializes a single message array to JSON text', () => {
    expect(encode([4, 7, 10, 20])).toBe('[4,7,10,20]');
  });

  it('preserves the batch [[...],[...]] shape', () => {
    const batch = [
      [4, 7, 10, 20],
      [11, 7, 'hi'],
    ];
    expect(encode(batch)).toBe('[[4,7,10,20],[11,7,"hi"]]');
  });

  it('round-trips arbitrary message arrays', () => {
    const messages = [
      [0, 'hero', 21, 60],
      [1, 7, 'hero', 10, 20, 200],
      [17, 3, 42],
    ];
    for (const msg of messages) {
      expect(decode(encode(msg))).toEqual(msg);
    }
  });
});

describe('transport codec: inbound receive()', () => {
  it('parses valid JSON text into a message array', () => {
    expect(decode('[4,10,20]')).toEqual([4, 10, 20]);
  });

  it('parses a batch of message arrays', () => {
    expect(decode('[[4,10,20],[11,"hi"]]')).toEqual([
      [4, 10, 20],
      [11, 'hi'],
    ]);
  });

  it('throws SyntaxError on invalid JSON (ws.js closes the connection)', () => {
    // ws.js catches this SyntaxError and calls close(...) rather than crashing.
    // The new adapter must detect the same failure and close the connection.
    let closed = false;
    function receive(text) {
      try {
        return decode(text);
      } catch (e) {
        if (e instanceof SyntaxError) {
          closed = true;
          return undefined;
        }
        throw e;
      }
    }

    const result = receive('not valid json{');
    expect(result).toBeUndefined();
    expect(closed).toBe(true);
  });
});
