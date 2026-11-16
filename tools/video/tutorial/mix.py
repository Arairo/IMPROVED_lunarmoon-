import json, wave, numpy as np, soundfile as sf
SR=44100
voice=json.load(open('voice.json')); cues=json.load(open('cues.json'))
w=wave.open('music.wav'); m=np.frombuffer(w.readframes(w.getnframes()),np.int16).reshape(-1,2).astype(np.float64)/32768
N=len(m); vo=np.zeros(N)
for vid,t in voice.items():
    s,sr=sf.read(f'{vid}.wav')
    if s.ndim>1: s=s.mean(1)
    # resample 24k -> 44.1k (linear)
    x=np.interp(np.arange(int(len(s)*SR/sr))*sr/SR, np.arange(len(s)), s)
    i=int(t*SR); vo[i:i+len(x)]+=x[:max(0,N-i)]
vo=vo/np.max(np.abs(vo))*0.7
# duck envelope from voice activity
def movavg(x,k):
    c=np.cumsum(np.concatenate([[0],x])); y=(c[k:]-c[:-k])/k
    pad=len(x)-len(y); return np.concatenate([np.full(pad//2,y[0]),y,np.full(pad-pad//2,y[-1])])
act=movavg((np.abs(vo)>0.02).astype(float), int(0.25*SR))
act=np.clip(act*4,0,1)
env=movavg(act,int(0.35*SR))
gain=0.55-0.42*np.clip(env,0,1)
out=m*gain[:,None]+vo[:,None]
out=out/np.max(np.abs(out))*0.93
sf.write('mix.wav',out,SR)
print('ok', N/SR)
