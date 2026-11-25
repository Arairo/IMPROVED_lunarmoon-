// No inline <script> in the HTML pages: the strict Content-Security-Policy planned for
// other hosts (docs/hosting/_headers.example, script-src 'self') would block it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const page of ['index.html', 'planner.html']) {
  test(`${page} has no inline scripts`, () => {
    const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attrs, body]) => !/\bsrc=/.test(attrs) && body.trim());
    assert.equal(inline.length, 0, `inline <script> in ${page}: ${inline.map((m) => m[0].slice(0, 60)).join(' | ')}`);
  });
}
