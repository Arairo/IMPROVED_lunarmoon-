import test from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, deltaText, bothFraction, scoreOf } from '../src/ui/compareLab.js';

const fake = (lit, los, stats = {}) => ({ scan: { series: { lit, los }, stats: { litFraction: 0.5, earthCentreFraction: 0.5, dteFraction: 0.4, longestDarkH: 100, ...stats } } });

test('bothFraction counts samples with Sun and Earth up together', () => {
  assert.equal(bothFraction(fake([1, 1, 0, 1], [1, 0, 1, 1])), 0.5);
  assert.equal(bothFraction(fake([], [])), 0);
});

test('deltaText reports the size and direction of a change', () => {
  const pctM = METRICS.find((m) => m.key === 'litFraction');
  assert.deepEqual(deltaText(pctM, 0.72, 0.54), { txt: '+18 pts', good: true, zero: false });
  assert.equal(deltaText(pctM, 0.5, 0.5).zero, true);
  const night = METRICS.find((m) => m.key === 'longestDarkH');
  const d = deltaText(night, 72, 24);
  assert.equal(d.txt, '+2.0 d');
  assert.equal(d.good, false, 'a longer night is worse');
});

test('scoreOf ranks more Sun-and-Earth time first', () => {
  const a = fake([1, 1, 1, 1], [1, 1, 1, 0]);
  const b = fake([1, 1, 1, 1], [1, 0, 0, 0]);
  assert.ok(scoreOf(a) > scoreOf(b));
});
