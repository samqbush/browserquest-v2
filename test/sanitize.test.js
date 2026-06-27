// Chat / name sanitization (Phase 1: sanitizer -> xss swap).
//
// The server sanitizes player names and chat via Utils.sanitize
// (server/js/utils.js). The client renders these through jQuery `.html()`
// (client/js/bubble.js:43), so the output must be inert: any HTML tag markup
// must be escaped to entities (or its body dropped), never returned in a form a
// browser would parse as live markup.
import { describe, it, expect } from 'vitest';
import { legacyRequire, installLogStub } from './helpers/legacy.js';

const restoreLog = installLogStub();
const Utils = legacyRequire('server/js/utils.js');
restoreLog();

describe('Utils.sanitize neutralizes XSS payloads', () => {
  const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<b onmouseover=alert(1)>x</b>',
    '<a href="javascript:alert(1)">link</a>',
    '<svg/onload=alert(1)>',
    '"><script>alert(document.cookie)</script>',
    '<iframe src="javascript:alert(1)"></iframe>',
  ];

  for (const payload of xssPayloads) {
    it(`renders ${JSON.stringify(payload)} inert (no live tags)`, () => {
      const out = Utils.sanitize(payload);
      // No un-escaped opening tag may survive (the XSS-critical character).
      expect(out).not.toMatch(/<[a-zA-Z!/]/);
      // The literal <script> opener must not pass through verbatim.
      expect(out.toLowerCase()).not.toContain('<script');
    });
  }

  it('drops the body of <script> tags', () => {
    expect(Utils.sanitize('<script>alert(1)</script>hi')).toBe('hi');
  });

  it('escapes (does not execute) inline markup', () => {
    expect(Utils.sanitize('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('preserves legitimate text that merely contains angle brackets', () => {
    expect(Utils.sanitize('Bob & Alice <3')).toBe('Bob & Alice &lt;3');
    expect(Utils.sanitize('a < b and c > d')).toBe('a &lt; b and c &gt; d');
  });

  it('leaves plain text untouched', () => {
    expect(Utils.sanitize('HelloWorld42')).toBe('HelloWorld42');
  });
});
