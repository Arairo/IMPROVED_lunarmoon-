# Video pipeline (Professional tutorial, promo, 30-second cut)

All three videos (re-made 23 Nov 2026) are built from **real screen captures of the
production build**. An HTML "composition" animates them and is rendered frame by
frame, so every zoom and fade is smooth. The soundtrack is generated in code. Nothing
here is a one-off: when the app changes, re-run only the parts that changed.

| Video | File in `public/tutorial/` | Length | Size |
|---|---|---|---|
| Professional tutorial, 16 chapters, narrated | `pro-tutorial.mp4` (+ `pro-tutorial.vtt` captions, `pro-tutorial.chapters.vtt`) | 3:15 | 22.6 MiB |
| Promo, music only | `lunar-site-planner-promo.mp4` | 1:00 | 15.4 MiB |
| Social cut, music only | `lunar-site-planner-demo-30s.mp4` | 0:30 | 7.9 MiB |

Every file must stay **under 25 MiB**. Captions are burned in, and the tutorial's
are also in the .vtt file. Raw captures and frames never go in the repo.

The work directory is `/tmp/claude-0/v2` (`cap/`, `tut/`, `promo/`); copy these
scripts there. Serve the production build first:
`npm run build && npx vite preview --port 5180 --strictPort`.

| Step | Command | Re-run when |
|---|---|---|
| 1. Capture | `node capture.cjs all` (or `pro`, `later`, `phone`); `node capture-beginner.cjs` | the UI changed |
| 2. Narration | edit `tutorial/script.json` (`text` = captions, `say` = what the voice reads), then `python3 tts.py` → `lines.json` | a line changed |
| 3. Composition | `python3 build.py` (tutorial: `tut.tpl.html` + `lines.json` → `tut.html`); `promo/promo.html` (`#short` = 30-second cut) | scenes, zooms or titles changed |
| 4. Check frames | `node peek.cjs site@0.5 check@0.8 …` (scene@fraction, or seconds) | always, before step 5 |
| 5. Render | `node render.cjs 0 50` / `50 100` / … in parallel; promo: `node render.cjs`, `CUT=short node render.cjs` | after 1-3 |
| 6. Captions | `node vtt.cjs` → `tutorial-pro.vtt`, `tutorial-pro.chapters.vtt` | the narration changed |
| 7. Music + mix | `python3 promo/music.py cues.json music.wav`; tutorial: `python3 mix.py` (ducks under the voice) | the length changed |
| 8. Encode | see below | always |

```bash
# tutorial: two-pass to stay under 25 MiB
ffmpeg -framerate 30 -i frames/%05d.jpg -c:v libx264 -preset slow -b:v 860k -pass 1 -an -f mp4 /dev/null
ffmpeg -framerate 30 -i frames/%05d.jpg -i mix.wav -c:v libx264 -preset slow -b:v 860k -pass 2 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -shortest pro-tutorial.mp4
# promo and 30-second cut
ffmpeg -framerate 30 -i frames/%05d.jpg -i music.wav -c:v libx264 -preset slow -crf 22 -maxrate 3M -bufsize 6M -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -shortest lunar-site-planner-promo.mp4
```

The story follows one plan from start to finish. On the default date the
connecting ridge is NO GO (Earth hidden). "Find the next good date" then picks
18 Nov 2026, which is GO WITH CARE with a "Close to the line" warning. Captures
after the Date step must stay on that date: don't press Reset Date.

The Kokoro TTS model files (`kokoro-v1.0.int8.onnx`, `voices-v1.0.bin`) are not in
the repo. Run `pip install kokoro-onnx soundfile`, then download the files from the
kokoro-onnx releases into `/tmp/claude-0/tts/`. Every video carries an
"SI-assisted" label. Terrain 3D keeps its own interactive walkthrough
(`src/planner/ui/videoTutorial.js`, `lunar-site-planner-tutorial.mp4`).
