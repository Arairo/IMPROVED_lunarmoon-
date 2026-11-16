import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
d = json.load(open('/tmp/claude-0/tut/script.json'))
k = Kokoro('/tmp/claude-0/tts/kokoro-v1.0.int8.onnx', '/tmp/claude-0/tts/voices-v1.0.bin')
out = []
for line in d['lines']:
    s, sr = k.create(line['text'], voice=d['voice'], speed=1.0, lang='en-us')
    sf.write(f"/tmp/claude-0/tut/{line['id']}.wav", s, sr)
    out.append({'id': line['id'], 'text': line['text'], 'dur': round(len(s) / sr, 3), 'sr': sr})
    print(line['id'], round(len(s)/sr,2), flush=True)
json.dump(out, open('/tmp/claude-0/tut/lines.json', 'w'), indent=1)
