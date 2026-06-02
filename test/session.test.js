import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/core/Session.js';

test('new session starts UNTRUSTED (trust earned, not gifted)', () => {
  // Regression: trust used to start at 1.0, so wiping storage farmed a discount.
  const s = new Session({});
  assert.equal(s.trust, 0.0);
});

test('clear() resets trust to 0, not 1', () => {
  const s = new Session({});
  s.trust = 0.8;
  s.clear();
  assert.equal(s.trust, 0.0);
});

test('isValid rejects stale / malformed stored sessions', () => {
  const s = new Session({ sessionDuration: 1000 });
  assert.equal(s.isValid(null), false);
  assert.equal(s.isValid({ id: 'x' }), false); // no createdAt
  assert.equal(s.isValid({ id: 'x', createdAt: Date.now() }), true);
  assert.equal(s.isValid({ id: 'x', createdAt: Date.now() - 5000 }), false); // expired
});

test('trust is bounded [0,1]', () => {
  const s = new Session({});
  s.increaseTrust(5);
  assert.ok(s.trust <= 1.0);
  s.decreaseTrust(5);
  assert.ok(s.trust >= 0);
});
