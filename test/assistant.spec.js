import test from 'node:test';
import assert from 'node:assert/strict';
import sites from '../src/data/sites.js';
import { parseRequest, findCoords, findDate, findSites } from '../src/experience/assistantParse.js';

const NOW = Date.UTC(2026, 10, 16, 22);
const ask = (q) => parseRequest(q, sites, NOW);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

test('Ask Lumi finds sites by name and nickname', () => {
  assert.deepEqual(findSites('take me to Apollo 11', sites).map((s) => s.id), ['a11']);
  assert.deepEqual(findSites('compare ridge and IM-2', sites).map((s) => s.id), ['ridge', 'im2']);
  assert.deepEqual(findSites("what about Chang'e 4?", sites).map((s) => s.id), ['ce4']);
  assert.deepEqual(findSites('shackleton crater floor vs connecting ridge', sites).map((s) => s.id), ['shackleton', 'ridge']);
  const r = ask('take me to Apollo 11');
  assert.equal(r.type, 'goto');
  assert.equal(r.site.id, 'a11');
});

test('Ask Lumi reads coordinates and dates', () => {
  assert.deepEqual(findCoords('go to -89.45, -137.3'), { lat: -89.45, lon: -137.3 });
  assert.deepEqual(findCoords('89.45S 137.3W'), { lat: -89.45, lon: -137.3 });
  assert.equal(findCoords('move 2 3'), null);
  assert.equal(iso(findDate('1 March 2027', NOW)), '2027-03-01');
  assert.equal(iso(findDate('in March 2027', NOW)), '2027-03-01');
  assert.equal(iso(findDate('2027-06-01', NOW)), '2027-06-01');
  assert.equal(iso(findDate('in 2027', NOW)), '2027-01-01');
  assert.equal(findDate('tomorrow', NOW), NOW + 86400000);
  assert.equal(findDate('no date here', NOW), null);
});

test('Ask Lumi understands planning requests', () => {
  let r = ask('best date at the ridge in 2027 for 7 days');
  assert.equal(r.type, 'bestDate');
  assert.equal(r.site.id, 'ridge');
  assert.equal(iso(r.from), '2027-01-01');
  assert.equal(r.minDays, 7);

  r = ask('when should we land?');
  assert.equal(r.type, 'bestDate');
  assert.equal(r.minDays, 3);

  r = ask('compare ridge and IM-2');
  assert.equal(r.type, 'compare');
  assert.deepEqual(r.sites.map((s) => s.id), ['ridge', 'im2']);
  assert.equal(ask('compare with 3 months later').slip, true);

  assert.deepEqual(ask('move 2 km north'), { type: 'nudge', km: 2, dir: 'N' });
  assert.equal(ask('what if 500 km east').km, 50, 'nudges are capped at 50 km');
  assert.deepEqual(ask('3 days later'), { type: 'shiftDays', days: 3 });
  assert.equal(ask('best spot').type, 'bestSpot');
  assert.equal(ask('best flown site').flown, true);
});

test('Ask Lumi answers status, explanations and app commands', () => {
  assert.deepEqual(ask('is it GO?'), { type: 'status', focus: 'all' });
  assert.equal(ask('will I have power').focus, 'power');
  assert.equal(ask('can I talk to Earth?').focus, 'earth');
  assert.deepEqual(ask('when is sunset'), { type: 'when', what: 'sunset' });
  assert.deepEqual(ask('what is libration'), { type: 'explain', term: 'libration' });
  assert.equal(ask('why is Earth hidden?').term, 'earthhidden');
  assert.equal(ask('what is the DSN').term, 'dsn');
  assert.deepEqual(ask('show me the earthrise'), { type: 'look', body: 'earth' });
  assert.deepEqual(ask('dark mode'), { type: 'theme', value: 'dark' });
  assert.equal(ask('start the tour').type, 'tour');
  assert.equal(ask('open terrain 3d').type, 'terrain');
  assert.deepEqual(ask('pause'), { type: 'play', on: false });
  assert.equal(ask('help').type, 'help');
  assert.deepEqual(ask('hello'), { type: 'small', kind: 'hello' });
  assert.equal(ask('blah blah').type, 'unknown');
});

test('Ask Lumi handles small talk, flow steps and more questions', () => {
  assert.equal(ask('thanks!').kind, 'thanks');
  assert.equal(ask('who are you').kind, 'who');
  assert.equal(ask('are you chatgpt?').kind, 'who');
  assert.equal(ask('tell me a joke').kind, 'joke');
  assert.equal(ask('what is this app').kind, 'app');
  assert.equal(ask('bye').kind, 'bye');
  assert.equal(ask('hello what is libration').term, 'libration', 'a greeting with a question answers the question');
  assert.deepEqual(ask('step 3'), { type: 'step', step: 2 });
  assert.deepEqual(ask('open the report step'), { type: 'step', step: 4 });
  assert.equal(ask('print the report').type, 'report');
  assert.equal(ask('copy link').type, 'copyLink');
  assert.equal(ask('how far is the moon').term, 'distance');
  assert.equal(ask('how long is a lunar day').term, 'lunarday');
  assert.equal(ask('is there water on the moon').term, 'water');
  assert.equal(ask('what does go with care mean').term, 'verdict');
  assert.equal(ask('will I have power').focus, 'power', 'status questions still work');
});
