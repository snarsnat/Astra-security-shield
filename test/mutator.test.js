import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mutator } from '../src/mutation/Mutator.js';

test('seed is NOT derivable from the clock alone (per-install salt)', () => {
  // Two installs at the same instant must produce different seeds, because each
  // mixes a random per-install salt. (No localStorage in node → ephemeral salt.)
  const a = new Mutator({});
  const b = new Mutator({});
  assert.notEqual(a.generateSeed(), b.generateSeed());
});

test('appToken changes the seed', () => {
  const a = new Mutator({ appToken: 'tokenA' });
  const b = new Mutator({ appToken: 'tokenB' });
  assert.notEqual(a._secretSalt(), b._secretSalt());
});

test('shuffleWithSeed is deterministic for a fixed seed', () => {
  const m = new Mutator({});
  const arr = ['pulse', 'tilt', 'flick', 'breath'];
  assert.deepEqual(m.shuffleWithSeed([...arr], 12345), m.shuffleWithSeed([...arr], 12345));
});

test('different seeds generally produce different orderings', () => {
  const m = new Mutator({});
  const arr = ['pulse', 'tilt', 'flick', 'breath', 'rhythm'];
  const s1 = m.shuffleWithSeed([...arr], 1).join(',');
  const s2 = m.shuffleWithSeed([...arr], 999999).join(',');
  assert.notEqual(s1, s2);
});

test('mutate populates active challenges for every tier', () => {
  const m = new Mutator({});
  m.mutate();
  for (const tier of ['2', '3', '4']) {
    assert.ok(Array.isArray(m.activeChallenges[tier]));
    assert.ok(m.activeChallenges[tier].length > 0);
  }
});
