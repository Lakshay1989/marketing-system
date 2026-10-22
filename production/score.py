#!/usr/bin/env python3
"""Original soundtrack generator (numpy). Usage: python3 production/score.py --spec reel.json out.wav. No licensed audio is used."""
import numpy as np, wave, sys
sr=44100
def hz(m): return 440*2**((m-69)/12)
class Mix:
    def __init__(s,dur,seed): s.n=int(dur*sr); s.L=np.zeros(s.n); s.R=np.zeros(s.n); s.rng=np.random.default_rng(seed); s.dur=dur
    def put(s,sig,t,pan=0.0,g=1.0):
        a=int(t*sr)
        if a<0 or a>=s.n: return
        e=min(s.n,a+len(sig)); seg=sig[:e-a]*g; s.L[a:e]+=seg*(1-max(0,pan)); s.R[a:e]+=seg*(1+min(0,pan))
def tt(d): return np.arange(int(d*sr))/sr
def kick(m,a=1.0,deep=1.0):
    t=tt(.34); f=40*deep+110*np.exp(-t*30); ph=2*np.pi*np.cumsum(f)/sr; return a*np.sin(ph)*np.exp(-t*9)
def snare(m,a=1.0,soft=False):
    t=tt(.2); x=m.rng.standard_normal(len(t))*np.exp(-t*(30 if soft else 22)); tone=np.sin(2*np.pi*190*t)*np.exp(-t*32); return a*(.55*x+.5*tone)
def clap(m,a=1.0):
    t=tt(.16); x=m.rng.standard_normal(len(t)); return a*x*np.exp(-t*30)*(1+.8*np.sin(t*2*np.pi*70)**2)*.55
def hat(m,a=1.0,o=False):
    t=tt(.12 if o else .045); x=np.diff(m.rng.standard_normal(len(t)+1)); return a*x*np.exp(-t*(28 if o else 90))*.7
def sub(f,d,a=1.0):
    t=tt(d); return a*np.sin(2*np.pi*f*t)*np.minimum(1,t/.01)*np.exp(-t*2.4)
def pluck(f,d=.5,a=.25,bright=1.0):
    t=tt(d); x=np.sin(2*np.pi*f*t)+.4*bright*np.sin(2*np.pi*2*f*t)*np.exp(-t*10)+.15*bright*np.sin(2*np.pi*3*f*t)*np.exp(-t*16); return a*np.exp(-t*6)*x*np.minimum(1,t*500)
def bell(f,d=1.2,a=.2):
    t=tt(d); x=np.sin(2*np.pi*f*t)+.5*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*5)+.25*np.sin(2*np.pi*f*5.4*t)*np.exp(-t*9); return a*np.exp(-t*2.5)*x*np.minimum(1,t*300)
def rhodes(f,d=1.0,a=.16):
    t=tt(d); x=np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*f*2*t)*np.exp(-t*4)+.1*np.sin(2*np.pi*f*4*t)*np.exp(-t*9); trem=1+.08*np.sin(2*np.pi*5*t); return a*np.exp(-t*2.2)*x*trem*np.minimum(1,t*200)
def pad(fs,d,a=.12):
    t=tt(d); x=sum(np.sin(2*np.pi*f*t)+.5*np.sin(2*np.pi*f*1.004*t)+.3*np.sin(2*np.pi*f*.996*t) for f in fs)/len(fs); return a*x*np.minimum(1,t/.4)*np.minimum(1,(d-t)/.8)
def boom(m,d=1.4,a=1.0):
    t=tt(d); f=36+80*np.exp(-t*9); ph=2*np.pi*np.cumsum(f)/sr; return a*(np.sin(ph)*np.exp(-t*2.6)+.35*m.rng.standard_normal(len(t))*np.exp(-t*7))
def whoosh(m,d=.5,a=.45):
    t=tt(d); x=m.rng.standard_normal(len(t)); k=t/d; sw=np.sin(2*np.pi*np.cumsum(300+3500*k**2)/sr); return a*(.6*x+.5*sw*x)*k**1.6
def riser(m,d,a=.35):
    t=tt(d); k=t/d; x=m.rng.standard_normal(len(t))*k**2; tone=np.sin(2*np.pi*np.cumsum(200+1800*k**2)/sr)*k**2; return a*(.5*x+.4*tone)
def crackle(m,d,a=.05):
    x=m.rng.standard_normal(int(d*sr))*(m.rng.random(int(d*sr))>.9993)*3; return a*x
def tick(a=.35):
    t=tt(.03); return a*np.sin(2*np.pi*2400*t)*np.exp(-t*140)
def sweep_down(m,d=.5,a=.3):
    t=tt(d); x=m.rng.standard_normal(len(t)); k=1-t/d; return a*x*k**1.4*np.sin(2*np.pi*np.cumsum(3000*k**2+200)/sr)
def build(spec,seed=3):
    dur=spec['dur']; bpm=spec['bpm']; B=60/bpm; m=Mix(dur,seed); prog=spec['prog']
    def chord(t): return prog[int((t//(B*4))%len(prog))]
    for (t0,t1,typ) in spec['sections']:
        beats=int(round((t1-t0)/B))
        for i in range(beats):
            t=t0+i*B; root,tones=chord(t); r=hz(root)
            if typ=='calm':
                if i%4==0: m.put(pad([hz(x-12) for x in tones[:3]],B*4,.15),t)
                m.put(pluck(hz(tones[i%4]+12),B*.9,.2),t,pan=(.35 if i%2 else -.35))
                if i%4==0: m.put(sub(r,B*2,.4),t)
            elif typ=='pulse':
                m.put(kick(m,.8),t)
                m.put(hat(m,.4),t+B/2)
                if i%4==0: m.put(pad([hz(x-12) for x in tones[:3]],B*4,.12),t)
                m.put(pluck(hz(tones[i%4]+12),B*.6,.18),t,pan=.3)
            elif typ in ('groove','drive'):
                m.put(kick(m,1.0),t); m.put(hat(m,.55),t+B/2)
                if i%2==1: m.put(clap(m,.7),t)
                m.put(sub(r,B*.9,.55),t)
                m.put(pluck(hz(tones[(i*2)%4]+12),B*.5,.2),t+B/2,pan=.3); m.put(pluck(hz(tones[(i*2+1)%4]+12),B*.5,.17),t,pan=-.3)
                if typ=='drive':
                    for q in range(2): m.put(hat(m,.35),t+q*B/2+B/4)
                    m.put(hat(m,.5,True),t+B/2)
            elif typ=='half':
                if i%2==0: m.put(kick(m,.95),t)
                if i%4==2: m.put(snare(m,.7),t)
                m.put(hat(m,.4),t+B/2)
                m.put(sub(r,B*1.6,.5),t) if i%2==0 else None
                m.put(pluck(hz(tones[i%4]+12),B*.7,.2),t,pan=(-.3 if i%2 else .3))
            elif typ=='lofi':
                sw=B*.12 if i%2 else 0
                if i%4 in (0,2): m.put(kick(m,.7,1.1),t+sw)
                if i%4 in (1,3): m.put(snare(m,.35,True),t)
                m.put(hat(m,.3),t+B/2+B*.1)
                if i%4==0:
                    for k,x in enumerate(tones[:4]): m.put(rhodes(hz(x),B*3.6,.12),t+k*.01,pan=(-.3+k*.2))
                    m.put(sub(r,B*3,.45),t)
            elif typ=='bell':
                if i%2==0: m.put(bell(hz(tones[(i//2)%4]+12),B*2.4,.2),t,pan=(-.3 if i%4 else .3))
                if i%4==0: m.put(pad([hz(x-12) for x in tones[:3]],B*4,.14),t)
            elif typ=='stab':
                if i==0: m.put(pad([hz(x) for x in tones],B*4,.2),t)
                m.put(kick(m,.9),t); m.put(hat(m,.5),t+B/2)
                m.put(pluck(hz(tones[i%4]+12),B*.6,.25),t+B/2)
    for (t,g) in spec.get('impacts',[]): m.put(boom(m,1.3,g),t)
    for t in spec.get('whooshes',[]): m.put(whoosh(m,.45,.45),t-.45)
    for (t0,d) in spec.get('risers',[]): m.put(riser(m,d,.4),t0)
    for t in spec.get('ticks',[]): m.put(tick(),t)
    for t in spec.get('downs',[]): m.put(sweep_down(m,.5,.3),t)
    for (t0,t1,tm) in spec.get('rolls',[]):
        rt=t0; step=B/2
        while rt<t1: m.put(snare(m,.6),rt); rt+=step; step=max(.06,step*.72)
    if spec.get('crackle'): m.put(crackle(m,dur,.05),0)
    L=np.tanh(m.L*.9); R=np.tanh(m.R*.9); f=int(.7*sr); L[-f:]*=np.linspace(1,0,f); R[-f:]*=np.linspace(1,0,f)
    mx=max(abs(L).max(),abs(R).max()); st=np.stack([L,R],1)/mx*.92; return st
CH=lambda *a:a
C_MAJ=[(48,[60,64,67,72]),(43,[59,62,67,71]),(45,[57,60,64,69]),(41,[57,60,65,69])]   # C G Am F
D_MAJ=[(50,[62,66,69,74]),(45,[61,64,69,73]),(47,[59,62,66,71]),(43,[59,62,67,71])]   # D A Bm G
A_MIN=[(45,[57,60,64,69]),(41,[57,60,65,69]),(48,[60,64,67,72]),(43,[59,62,67,71])]   # Am F C G
F_MAJ=[(41,[57,60,65,69]),(46,[58,62,65,70]),(48,[60,64,67,72]),(45,[57,60,64,69])]   # F Bb C Am
E_MIN=[(40,[59,62,67,71]),(36,[60,64,67,72]),(43,[59,62,67,71]),(38,[57,62,66,69])]   # Em C G D
G_MAJ=[(43,[59,62,67,71]),(40,[59,62,67,71]),(36,[60,64,67,72]),(38,[57,62,66,69])]

PROGS={'C':C_MAJ,'D':D_MAJ,'A':A_MIN,'F':F_MAJ,'E':E_MIN,'G':G_MAJ}
def spec_from_reel(r):
    """r = {dur, bpm, key, sections:[[t0,t1,type]...]} -> score spec with impacts/whooshes/risers at section boundaries."""
    secs=[tuple(s) for s in r['sections']]
    starts=[s[0] for s in secs]
    return dict(dur=r['dur'],bpm=r['bpm'],prog=PROGS.get(r.get('key','C'),C_MAJ),sections=secs,impacts=[(t,.9 if i in (0,len(starts)-1) else .7) for i,t in enumerate(starts)],whooshes=[t for t in starts[1:]],risers=[(max(0,starts[2]-1.9),1.9)] if len(starts)>2 else [])
if __name__=='__main__':
    import json
    if len(sys.argv)==4 and sys.argv[1]=='--spec':
        r=json.load(open(sys.argv[2])); st=build(spec_from_reel(r),seed=r.get('seed',7))
        with wave.open(sys.argv[3],'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype(np.int16).tobytes())
        print('score',sys.argv[3])
    else: print('usage: score.py --spec reel.json out.wav')
