const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file:///tmp/claude-0/v2/tut/tut.html'); const { caps, chs } = await p.evaluate(() => ({ caps: window.CAPS, chs: window.CHAPTERS }));
  const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
  fs.writeFileSync('tutorial-pro.vtt', 'WEBVTT\n\n' + caps.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(c.e)}\n${c.text}\n`).join('\n'));
  fs.writeFileSync('tutorial-pro.chapters.vtt', 'WEBVTT\n\n' + chs.map((c, i) => `${ts(Math.max(0, c.a))} --> ${ts(c.b)}\n${c.name}\n`).join('\n'));
  console.log(caps.length, 'captions', chs.length, 'chapters'); await b.close(); })();
