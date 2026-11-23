"""Writes tut.html from tut.tpl.html + lines.json (narration timings) + script.json (chapters)."""
import json, sys
d = json.load(open('script.json')); L = json.load(open('lines.json'))
s = open('tut.tpl.html').read()
open('tut.html', 'w').write(s.replace('__LINES__', json.dumps(L)).replace('__CH__', json.dumps({l['id']: l['ch'] for l in d['lines']})).replace('__RECTS__', open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/v2/cap/rects.json').read()))
print('wrote tut.html')
