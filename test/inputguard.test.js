import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputGuard } from '../src/core/InputGuard.js';

const guard = new InputGuard({});

test('detects classic SQL injection', () => {
  assert.equal(guard.scan("'; DROP TABLE users;--").threat, true);
  assert.equal(guard.scan("' OR 1=1").threat, true);
  assert.equal(guard.scan("1' OR '1'='1").type, 'sqli');
});

test('detects NoSQL operator injection', () => {
  assert.equal(guard.scan('{"$gt": ""}').type, 'nosqli');     // quoted-key JSON payload
  assert.equal(guard.scan('{"$ne": null}').threat, true);
  assert.equal(guard.scan("$where: 'this.a == 1'").threat, true);
});

test('detects raw XSS', () => {
  assert.equal(guard.scan('<script>alert(1)</script>').type, 'xss');
  assert.equal(guard.scan('<img src=x onerror=alert(1)>').threat, true);
  assert.equal(guard.scan('javascript:alert(document.cookie)').threat, true);
});

test('detects URL-ENCODED XSS (the decode-bypass fix)', () => {
  // %3Cscript%3E ... — must be caught after decoding, was a bypass before
  assert.equal(guard.scan('%3Cscript%3Ealert(1)%3C/script%3E').type, 'xss');
  // double-encoded
  assert.equal(guard.scan('%253Cscript%253E').threat, true);
  // HTML entity encoded
  assert.equal(guard.scan('&#x3c;script&#x3e;').threat, true);
});

test('detects command injection + path traversal', () => {
  assert.equal(guard.scan('; cat /etc/passwd').threat, true);
  assert.equal(guard.scan('../../../../etc/passwd').threat, true);
});

test('passes clean input', () => {
  assert.equal(guard.scan('hello world').threat, false);
  assert.equal(guard.scan('user@example.com').threat, false);
  assert.equal(guard.scan('My order #1234 — thanks!').threat, false);
  assert.equal(guard.scan('').threat, false);
  assert.equal(guard.scan(null).threat, false);
});
