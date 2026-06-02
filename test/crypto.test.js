import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64, decodeBase64, simpleHash, generateToken } from '../src/utils/crypto.js';

test('base64 round-trips UTF-8 incl. emoji (no deprecated escape/unescape)', () => {
  const inputs = ['hello', 'héllo wörld', 'Astra 🛡️ Shield', '日本語テスト', ''];
  for (const s of inputs) {
    assert.equal(decodeBase64(encodeBase64(s)), s);
  }
});

test('simpleHash is deterministic and varies by input', () => {
  assert.equal(simpleHash('abc'), simpleHash('abc'));
  assert.notEqual(simpleHash('abc'), simpleHash('abd'));
});

test('generateToken returns requested length, alphanumeric', () => {
  const t = generateToken(32);
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9]+$/);
  assert.notEqual(generateToken(16), generateToken(16)); // randomness
});
