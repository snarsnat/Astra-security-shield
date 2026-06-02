import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Detector } from '../src/core/Detector.js';

test('OOS score stays within the documented 0–4 range', async () => {
  const d = new Detector();
  const score = await d.getOOSScore();
  assert.equal(typeof score, 'number');
  assert.ok(score >= 0 && score <= 4, `score ${score} out of range`);
});

test('coefficient of variation: zero for constant, positive for varied', () => {
  const d = new Detector();
  assert.equal(d._coeffVar([100, 100, 100, 100]), 0);
  assert.ok(d._coeffVar([10, 200, 5, 300, 50]) > 0);
  assert.equal(d._coeffVar([]), 0);
});

test('feature vector exposes numeric behavioral features', () => {
  const d = new Detector();
  const fv = d.getFeatureVector();
  for (const k of ['clickCV', 'keystrokeCV', 'silenceAnomaly', 'headlessAnomaly', 'mouseCount']) {
    assert.ok(k in fv, `missing feature ${k}`);
    assert.equal(typeof fv[k], 'number');
  }
});

test('robotic uniform click timing scores higher than empty', () => {
  const d = new Detector();
  // Simulate perfectly uniform 50ms click intervals (bot-like)
  let t = 1_000_000;
  for (let i = 0; i < 12; i++) { d.recordClick({ target: 'btn', x: 1, y: 1, timestamp: t }); t += 50; }
  d.performAnalysis();
  assert.ok(d.scores.clickAnomaly > 0, 'uniform clicks should raise clickAnomaly');
});
