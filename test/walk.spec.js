import test from 'node:test';
import assert from 'node:assert/strict';
import sites from '../src/data/sites.js';
import { prepareSite, scanWindow, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { missionStars, guessStars } from '../src/experience/walk.js';

const scan = (id, ms = Date.UTC(2026, 10, 16, 22)) => scanWindow(prepareSite(sites.find((s) => s.id === id), null, DEFAULT_CONFIG), ms, 30, DEFAULT_CONFIG);

test('Beginner stars: the sunny ridge earns stars, a shadowed crater floor and the far side earn none', () => {
  assert.ok(missionStars(scan('ridge')).stars >= 2);
  assert.equal(missionStars(scan('shackleton')).stars, 0);
  assert.equal(missionStars(scan('ce4')).stars, 0);
});

test('Beginner sunny-spot guess is scored against the best spot on the map', () => {
  assert.equal(guessStars(0.84, 0.84), 3);
  assert.equal(guessStars(0.5, 0.84), 2);
  assert.equal(guessStars(0.2, 0.84), 1);
  assert.equal(guessStars(0, 0.84), 0);
});
