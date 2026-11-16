# Video pipeline (promo + Professional tutorial)

Both videos are made from **real screen captures of the app**, animated by an
HTML "composition" that is rendered frame by frame (so every zoom and fade is
perfectly smooth), plus a soundtrack generated in code. Nothing here is a
one-off: after the app changes, re-run only the parts that changed.

Work directory: the scripts read and write `/tmp/claude-0/promo` and
`/tmp/claude-0/tut` (copy these folders there first). The app must be running:
`npx vite --port 5180 --strictPort`.

| Step | Promo | Tutorial | Re-run when |
|---|---|---|---|
| 1. Capture screens | `promo/capture.cjs`, `promo/capture2.cjs` | `tutorial/cap.cjs` | the UI on screen changed (≈5–10 min) |
| 2. Narration (Kokoro TTS) | — | `tutorial/script.json` → `tutorial/tts.py` → `lines.json` | a line of the script changed (only that line needs a new voice) |
| 3. Composition | `promo/comp.html` | `tutorial/tut.tpl.html` (+ `lines.json` → `tut.html`) | scenes, zooms or captions change |
| 4. Render frames | `promo/render.cjs` | `tutorial/render.cjs` (run 2–3 in parallel: `node render.cjs 0 40`, `40 80`, `80`) | after 1–3 (≈5–8 min) |
| 5. Music + mix | `promo/music.py promo/cues.json` | `music.py` + `tutorial/mix.py` (ducks under the voice) | the length changed |
| 6. Encode | ffmpeg (see below) | ffmpeg | always |

```bash
ffmpeg -framerate 30 -i frames/%05d.jpg -i mix.wav -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k -shortest out.mp4
```

`peek.cjs` renders single frames for quick checks; `montage.sh` tiles them.
The Kokoro model files (`kokoro-v1.0.int8.onnx`, `voices-v1.0.bin`) are not in
the repo; `pip install kokoro-onnx soundfile` and download them from the
kokoro-onnx releases. Both videos carry an "SI-assisted" label.
