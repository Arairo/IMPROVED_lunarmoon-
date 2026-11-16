"""Music bed for the promo, synthesised from scratch (no samples, no licences).
Cinematic ambient intro -> impact at the title -> warm pop-ambient groove -> resolve.
Usage: python3 music.py cues.json out.wav
"""
import json, sys, wave
import numpy as np

SR = 44100
cues = json.load(open(sys.argv[1]))
D = cues['duration']
N = int(SR * D)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

def env(n, a, d_end, rel=0.3):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    tail = np.clip((n / SR - t) / rel, 0, 1)
    return e * tail

def pad(notes, dur, a=1.2, gain=0.08):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in notes:
        f = midi(m)
        for det in (-0.07, 0.0, 0.06):
            ph = rng.uniform(0, 6.28)
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + ph) * 0.6
            s += np.sin(2 * np.pi * 2 * f * (1 + det / 100) * t + ph) * 0.18
            s += np.sin(2 * np.pi * 3 * f * t + ph) * 0.06
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.2 * t)
    return s * env(n, a, dur, rel=min(1.5, dur * 0.4)) * lfo * gain / len(notes)

def pluck(m, dur=0.5, gain=0.12):
    n = int(dur * SR); t = np.arange(n) / SR; f = midi(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return s * np.exp(-t * 7) * np.minimum(1, t / 0.004) * gain

def kick(gain=0.5):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * gain

def hat(gain=0.05):
    n = int(0.06 * SR); t = np.arange(n) / SR
    s = rng.standard_normal(n); s = np.diff(np.concatenate([[0], s]))  # brighten
    return s * np.exp(-t * 70) * gain

def boom(gain=0.8):
    n = int(3.0 * SR); t = np.arange(n) / SR
    f = 34 + 60 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    nz = rng.standard_normal(n) * np.exp(-t * 9) * 0.25
    return (s + lowpass(nz, 0.05)) * gain

def lowpass(x, a):
    y = np.zeros_like(x); acc = 0.0
    # one-pole, vectorised in chunks via cumulative filter approximation
    for i in range(len(x)):
        acc += a * (x[i] - acc); y[i] = acc
    return y

def whoosh(dur=0.9, gain=0.18, rise=True):
    n = int(dur * SR); t = np.arange(n) / SR
    s = rng.standard_normal(n)
    # band-ish filter with sweeping one-pole (cheap: blend of two smoothings)
    k = (t / dur) if rise else (1 - t / dur)
    sm = np.convolve(s, np.ones(24) / 24, mode='same')
    s = sm * (0.3 + 0.7 * k) + (s - sm) * 0.25 * k
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return s * e * gain

def riser(dur=2.5, gain=0.12):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 200 * (1 + 6 * (t / dur) ** 2)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + rng.standard_normal(n) * 0.5
    s = np.convolve(s, np.ones(8) / 8, mode='same')
    return s * (t / dur) ** 2.2 * gain

def shimmer(start, dur, base=81, gain=0.03):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in (base, base + 7, base + 12):
        s += np.sin(2 * np.pi * midi(m) * t + rng.uniform(0, 6)) * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(0.1, 0.3) * t))
    add(s * env(n, 2.0, dur, 2.0) * gain, start, pan=0.0)

# ---- Arrangement ----
bpm = 96.0; beat = 60 / bpm; bar = 4 * beat
T_TITLE = cues['title']           # impact
T_GROOVE = cues['groove']         # drums in
T_END = cues['end']               # final hit
# Intro: dark ambient on A minor (add9), slow swell
add(pad([45, 52, 57, 59, 64], T_TITLE + 0.3, a=3.0, gain=0.22), 0.0)
shimmer(1.0, T_TITLE + 1.0)
add(riser(min(3.0, T_TITLE - 0.5)), T_TITLE - min(3.0, T_TITLE - 0.5))
add(boom(0.75), T_TITLE)
# Progression from the title on: Am - F - C - G
prog = [(45, [57, 60, 64, 71]), (41, [57, 60, 65, 69]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
t = T_TITLE; k = 0
while t < T_END:
    root, ch = prog[k % 4]
    d = min(bar, T_END - t)
    add(pad(ch, d + 0.6, a=0.25, gain=0.17), t, pan=-0.1)
    # sub bass
    n = int(d * SR); tt = np.arange(n) / SR
    add(np.sin(2 * np.pi * midi(root - 12) * tt) * env(n, 0.02, d, 0.2) * 0.12, t)
    # pluck arpeggio (8ths) once the groove starts, softer before
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 12]
    for j in range(8):
        tj = t + j * beat / 2
        if tj >= T_END: break
        g = 0.11 if tj >= T_GROOVE else 0.05
        add(pluck(arp[j], 0.6, g), tj, pan=0.35 if j % 2 else -0.35)
    if t >= T_GROOVE - 1e-6:
        for j in range(4):
            tb = t + j * beat
            if tb >= T_END: break
            if j in (0, 2): add(kick(0.42), tb)
            add(hat(0.035), tb + beat / 2, pan=0.2)
    t += bar; k += 1
# Transitions
for tc in cues['whoosh']:
    add(whoosh(0.8, 0.14), tc - 0.55, pan=rng.uniform(-0.4, 0.4))
# Ending: final hit and a long Am(add9) -> C resolve
add(boom(0.6), T_END)
add(pad([48, 55, 60, 64, 67, 74], D - T_END, a=0.05, gain=0.24), T_END)
shimmer(T_END, D - T_END, base=84, gain=0.025)

# ---- Space: cheap stereo reverb (FFT convolution with decaying noise) ----
def reverb(x, secs=2.4, mix=0.28, seed=1):
    r = np.random.default_rng(seed)
    n = int(secs * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 3.0 / secs * 2.3)
    ir = np.convolve(ir, np.ones(6) / 6, mode='same')
    ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return x * (1 - mix) + y * mix
L = reverb(L, seed=1); R = reverb(R, seed=2)

# master: gentle fade in/out, soft clip, normalise to -1 dBFS
fade = np.minimum(1, t_all / 0.5) * np.clip((D - t_all) / 2.0, 0, 1)
L *= fade; R *= fade
mx = max(np.max(np.abs(L)), np.max(np.abs(R)))
L = np.tanh(L / mx * 1.3) / np.tanh(1.3) * 0.89
R = np.tanh(R / mx * 1.3) / np.tanh(1.3) * 0.89
out = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', sys.argv[2], D, 's')
