// Shared motion-graphics library for the Kukur Reels. Each reel file defines REEL = {dur, hits, flashHits, grade, build()}.
const C={cream:'#fbf5ea',forest:'#14463f',deep:'#0c2f2a',terra:'#b5482a',orange:'#e8551f',gold:'#e9a23b',ink:'#1f2a2e',sand:'#f2e6cf',teal:'#1c6b62',blush:'#f4d9c6'};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)), lerp=(a,b,x)=>a+(b-a)*x;
const E={out2:x=>1-Math.pow(1-x,2),out3:x=>1-Math.pow(1-x,3),out5:x=>1-Math.pow(1-x,5),in3:x=>x*x*x,io3:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,io2:x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2,back:x=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)},bounce:x=>{const n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d)return n*(x-=1.5/d)*x+.75;if(x<2.5/d)return n*(x-=2.25/d)*x+.9375;return n*(x-=2.625/d)*x+.984375},elastic:x=>x===0?0:x===1?1:Math.pow(2,-10*x)*Math.sin((x*10-.75)*(2*Math.PI)/3)+1};
const world=document.getElementById('world'),flashEl=document.getElementById('flash'),grain=document.getElementById('grain');
const A='../assets/';
// real catalogue prices (₹) and names
const PR={'dog-rope-toy':['Dog Rope Toy',179],'dog-plush-squeaky-toy':['Plush Squeaky Toy',329],'dog-fetch-ball':['Dog Fetch Ball',199],'dog-tug-toy':['Dog Tug Toy',199],'dog-chew-toy':['Dog Chew Toy',199],'dog-puzzle-toy':['Puzzle Feeder Toy',719],'puppy-teether-toy':['Puppy Teether Toy',429],'cat-wand-toy':['Cat Wand Toy',259],'cat-plush-toy':['Cat Plush Toy',219],'cat-crinkle-balls':['Crinkle Ball Set',219],'cat-tunnel':['Pet Play Tunnel',599],'cat-scratcher':['Cat Scratcher',549],'cat-cosy-bed':['Cat Cosy Bed',1559],'dog-lounger-bed':['Dog Lounger Bed',1789],'dog-flat-mat':['Dog Flat Mat',859],'dog-blanket':['Dog Blanket',1989],'dog-snuffle-mat':['Dog Snuffle Mat',309],'dog-slow-feeder-bowl':['Slow-Feeder Bowl',739],'dog-feeding-bowl':['Dog Feeding Bowl',219],'cat-feeding-bowl':['Cat Feeding Bowl',329],'travel-bowl':['Foldable Travel Bowl',419],'pet-water-bottle':['Pet Water Bottle',409],'dog-everyday-collar':['Dog Everyday Collar',219],'dog-everyday-leash':['Dog Everyday Leash',339],'dog-everyday-harness':['Dog Everyday Harness',789],'dog-harness-leash-set':['Harness & Leash Set',489],'cat-collar':['Cat Collar',409],'cat-harness-leash-set':['Cat Harness & Leash Set',459],'dog-pin-brush':['Dog Pin Brush',589],'dog-slicker-brush':['Slicker-Style Brush',589],'dog-finishing-comb':['Dog Finishing Comb',379],'dog-grooming-wipes':['Grooming Wipes',319],'paw-towel':['Paw & Dry Towel',319],'dog-nail-clipper':['Dog Nail Clipper',489],'dog-waste-bags':['Dog Waste Bags',229],'dog-waste-bag-dispenser':['Waste Bag Dispenser',269],'cat-litter-scoop':['Cat Litter Scoop',99],'dog-raincoat':['Dog Raincoat',519],'dog-tshirt':['Dog T-Shirt',319],'dog-sweater':['Dog Winter Sweater',899],'dog-festive-bandana':['Festive Dog Bandana',109],'dog-festive-bow-tie':['Festive Dog Bow Tie',229],'pet-birthday-bandana':['Birthday Bandana',95],'cat-grooming-brush':['Cat Grooming Brush',599],'dog-training-pads':['Dog Training Pads',519]};
const inr=n=>'₹'+n.toLocaleString('en-IN');
const img=s=>'../products/'+s+'.webp';
const shots=[];
function mk(html,css){const d=document.createElement('div');d.className='shot';if(css)d.style.cssText=css;d.innerHTML=html;d.style.display='none';world.appendChild(d);return d}
function add(t0,t1,el,upd,rv,rvdur){shots.push({t0,t1,el,upd,reveal:rv,rvdur:rvdur||.28})}
function reveal(el,type,r){
  if(!type||r>=1){el.style.clipPath='none';el.style.transform=el.dataset.base||'';return}
  const q=E.out5(r);
  const m={circle:`circle(${q*150}% at 50% 62%)`,wipeL:`inset(0 ${(1-q)*100}% 0 0)`,wipeR:`inset(0 0 0 ${(1-q)*100}%)`,wipeUp:`inset(${(1-q)*100}% 0 0 0)`,wipeDown:`inset(0 0 ${(1-q)*100}% 0)`,
  diag:`polygon(0 0,${q*240}% 0,${q*240-140}% 100%,0 100%)`,iris:`inset(${(1-q)*46}% ${(1-q)*46}% ${(1-q)*46}% ${(1-q)*46}% round ${(1-q)*300}px)`,
  blinds:`polygon(${[...Array(8)].map((_,i)=>{const y0=i*12.5,y1=y0+12.5*q;return `0 ${y0}%,100% ${y0}%,100% ${y1}%,0 ${y1}%`}).join(',')})`};
  if(type==='whipL'){el.style.clipPath='none';el.style.transform=`translateX(${(1-q)*100}%)`;return}
  if(type==='whipR'){el.style.clipPath='none';el.style.transform=`translateX(${-(1-q)*100}%)`;return}
  if(type==='whipUp'){el.style.clipPath='none';el.style.transform=`translateY(${(1-q)*100}%)`;return}
  if(type==='zoomin'){el.style.clipPath='none';el.style.transform=`scale(${lerp(1.6,1,q)})`;el.style.opacity=q;return}
  el.style.clipPath=m[type]||'none';
}
function splitChars(el){const t=el.textContent;el.textContent='';const out=[];const ws=t.split(' ');ws.forEach((w,wi)=>{const wr=document.createElement('span');wr.style.cssText='display:inline-block;white-space:nowrap';[...w].forEach(c=>{const s=document.createElement('span');s.className='ch';s.textContent=c;wr.appendChild(s);out.push(s)});el.appendChild(wr);if(wi<ws.length-1)el.appendChild(document.createTextNode(' '))});return out}
function kin(chars,lt,t0=0,dur=.32,stg=.022,mode='up'){chars.forEach((s,i)=>{const p=clamp((lt-t0-i*stg)/dur);const e=E.out5(p);
  if(mode==='up')s.style.transform=`translateY(${(1-e)*115}%) rotate(${(1-e)*8}deg)`;
  else if(mode==='pop')s.style.transform=`scale(${E.back(p)})`;
  else if(mode==='drop')s.style.transform=`translateY(${-(1-E.bounce(p))*160}px)`;
  else if(mode==='fade')s.style.transform=`translateY(${(1-e)*30}px)`;
  s.style.opacity=p>0?(mode==='fade'?p:1):0})}
function slam(el,lt,t0=0,dur=.2,from=1.9){const p=clamp((lt-t0)/dur);el.style.opacity=p>0?1:0;el.style.transform=`scale(${lerp(from,1,E.out5(p))})`}
function pop(el,lt,t0=0,dur=.3){const p=clamp((lt-t0)/dur);el.style.opacity=p>0?1:0;el.style.transform=`scale(${E.back(p)})`}
function photo(src,fx=50,fy=50){return `<img class="ph" src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${fx}% ${fy}%;transform-origin:${fx}% ${fy}%">`}
function T(cls,html,css){return `<div class="abs ${cls}" style="${css}">${html}</div>`}
function pcard(slug,x,y,w,css=''){return `<div class="abs pc" style="left:${x}px;top:${y}px;width:${w}px;height:${w}px;border-radius:${Math.round(w*.07)}px;overflow:hidden;background:#fff;box-shadow:0 ${Math.round(w*.05)}px ${Math.round(w*.11)}px rgba(0,0,0,.28);${css}"><img src="${img(slug)}" style="width:100%;height:100%;object-fit:cover;display:block"></div>`}
function pill(txt,x,y,bg,fg,size=56,extra=''){return `<div class="abs pl" style="left:${x}px;top:${y}px;padding:${Math.round(size*.2)}px ${Math.round(size*.7)}px;border-radius:999px;background:${bg};color:${fg};font-weight:900;font-size:${size}px;${extra}">${txt}</div>`}
const darkGrad=`<div class="abs" style="inset:0;background:linear-gradient(to top,rgba(8,30,26,.92) 0%,rgba(8,30,26,.55) 30%,rgba(8,30,26,0) 58%)"></div><div class="abs" style="inset:0;background:linear-gradient(to bottom,rgba(8,30,26,.35),rgba(8,30,26,0) 22%)"></div>`;
const LOGO='../brand/logo.webp';
function logoPill(top,h){return `<div class="abs" style="left:0;right:0;top:${top}px;text-align:center"><span style="display:inline-block;background:#fbf5ea;border-radius:26px;padding:10px 22px"><img src="${LOGO}" style="height:${h}px;display:block"></span></div>`}
function bg(color){return `<div class="abs" style="inset:0;background:${color}"></div>`}
// standard end card: logo reveal + line + url
function endCard(t0,t1,opt={}){
  const bgc=opt.bg||C.cream, fg=opt.fg||C.forest;
  const el=mk(bg(bgc)+`<div class="abs" id="glow" style="left:-200px;top:520px;width:1480px;height:1480px;border-radius:50%;background:radial-gradient(circle,rgba(233,162,59,.28),rgba(233,162,59,0) 62%)"></div>
  <div class="abs" id="lg" style="left:70px;top:${opt.logoTop||620}px;width:940px;overflow:hidden"><img src="${LOGO}" style="width:940px;display:block"></div>
  <div class="abs" id="ln" style="left:240px;top:${(opt.logoTop||620)+345}px;width:600px;height:8px;background:${C.gold};border-radius:4px"></div>
  <div class="abs big" id="tg" style="left:0;right:0;top:${(opt.logoTop||620)+410}px;text-align:center;font-size:${opt.tgSize||50}px;letter-spacing:.09em;color:${fg}">${opt.tag||'EVERY TAIL TELLS A STORY.'}</div>
  <div class="abs big" id="cta" style="left:0;right:0;top:${(opt.logoTop||620)+560}px;text-align:center;font-size:${opt.ctaSize||96}px;color:${C.terra};letter-spacing:-.01em;text-transform:none">${opt.cta||'kukur.shop'}</div>
  <div class="abs" id="ph" style="left:0;right:0;top:${(opt.logoTop||620)+690}px;text-align:center;font-weight:700;font-size:34px;color:${fg};opacity:.85">WhatsApp +91 88607 55123</div>`);
  const lg=el.querySelector('#lg'),ln=el.querySelector('#ln'),tg=el.querySelector('#tg'),cta=el.querySelector('#cta'),ph=el.querySelector('#ph'),glow=el.querySelector('#glow');const ch=splitChars(tg);
  add(t0,t1,el,(lt)=>{const p=E.out5(clamp((lt-.1)/.55));lg.style.clipPath=`inset(0 ${(1-p)*50}% 0 ${(1-p)*50}%)`;lg.style.transform=`scale(${lerp(.9,1,E.out3(clamp(lt/1.4)))})`;ln.style.transform=`scaleX(${E.out5(clamp((lt-.45)/.5))})`;kin(ch,lt,.9,.26,.026);slam(cta,lt,1.5,.2,1.5);ph.style.opacity=.85*E.out3(clamp((lt-1.9)/.4));glow.style.transform=`scale(${lerp(.8,1.15,clamp(lt/3))})`},opt.reveal||'circle');
  return el;
}
const REELS={};
window.renderFrame=function(t,f){
  const R=window.REEL;
  for(const s of shots){const on=t>=s.t0&&t<s.t1;s.el.style.display=on?'block':'none';if(on){const lt=t-s.t0;s.upd(lt,lt/(s.t1-s.t0));reveal(s.el,s.reveal,clamp(lt/s.rvdur))}}
  let fl=0,sh=0;for(const h of (R.flashHits||R.hits||[])){const d=t-h;if(d>=0&&d<.14)fl=Math.max(fl,.45*(1-d/.14));if(d>=0&&d<.2)sh=Math.max(sh,(1-d/.2))}
  flashEl.style.opacity=fl;const a=sh*(R.shake??8);world.style.transform=`translate(${Math.sin(f*2.7)*a}px,${Math.cos(f*3.1)*a}px) scale(${1+sh*.011})`;
  grain.style.transform=`translate(${(f*37)%40}px,${(f*53)%40}px)`;
};
// ---- reusable shot builders ----
const FW={big:.66,arch:.78,bebas:.5,dm:.52,serif:.58};
function fitSize(word,size,font){const f=FW[font]||.66;return Math.min(size,Math.floor(980/(Math.max(1,word.length)*f)))}
function petShot(t0,t1,src,{fx=50,fy=30,za=1.9,zb=1.5,word='',size=210,col=C.cream,top=1180,font='big',rv,dx=0,shadow=true}={}){size=fitSize(word,size,font);
  const el=mk(photo(src,fx,fy)+darkGrad+(word?`<div class="abs ${font}" id="w" style="left:0;right:0;top:${top}px;text-align:center;font-size:${size}px;color:${col};${shadow?'text-shadow:0 8px 40px rgba(0,0,0,.45)':''}">${word}</div>`:''));
  const im=el.querySelector('.ph'),w=el.querySelector('#w');if(w)w.removeAttribute('id');
  add(t0,t1,el,(lt)=>{const p=clamp(lt/(t1-t0));im.style.transform=`translate(${lerp(0,dx,p)}px,0) scale(${lerp(za,zb,E.out3(p))})`;if(w)slam(w,lt,.02,.16,1.7)},rv);return el;
}
function macroShot(t0,t1,slug,{bgc=C.forest,fg=C.cream,word='',zoom=1.35,fx=50,fy=50,ang=-4,rv,top,size,font='big',card=1000,cy=560}={}){
  const sz=Math.min(size||330,fitSize(word,330,font));
  const el=mk(bg(bgc)+(word?`<div class="abs ${font}" id="w" style="left:0;right:0;top:${top??(330-Math.round(sz*.2))}px;text-align:center;font-size:${sz}px;color:${fg}">${word}</div>`:'')+`<div class="abs" id="c" style="left:${(1080-card)/2}px;top:${cy}px;width:${card}px;height:${card}px;border-radius:60px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.35)"><img src="${img(slug)}" style="width:100%;height:100%;object-fit:cover;transform-origin:${fx}% ${fy}%"></div>`);
  const w=el.querySelector('#w'),c=el.querySelector('#c'),im=c.querySelector('img');
  add(t0,t1,el,(lt)=>{const p=clamp(lt/(t1-t0));im.style.transform=`scale(${lerp(zoom*1.25,zoom,E.out3(p))})`;c.style.transform=`rotate(${ang*(1-E.out5(clamp(lt/.15)))}deg) scale(${lerp(.94,1,E.out5(clamp(lt/.15)))})`;if(w)slam(w,lt,0,.12,1.4)},rv);return el;
}
function framedShot(t0,t1,src,{bgc=C.cream,fx=50,fy=50,word='',sub='',fg=C.forest,font='serif',size=140,rv,x=60,y=200,w=960,h=1180,za=1.22}={}){
  const el=mk(bg(bgc)+`<div class="abs" id="fr" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:44px;overflow:hidden;box-shadow:0 30px 80px rgba(12,47,42,.35)">${photo(src,fx,fy)}</div>`+(sub?`<div class="abs big" id="bgw" style="left:-40px;top:${y+h-90}px;font-size:340px;color:${C.gold};opacity:.22">${sub}</div>`:'')+`<div class="abs ${font}" id="t" style="left:70px;right:70px;top:${y+h+30}px;font-size:${size}px;color:${fg}">${word}</div>`);
  const im=el.querySelector('.ph'),fr=el.querySelector('#fr'),bgw=el.querySelector('#bgw'),t=el.querySelector('#t');const ch=splitChars(t);
  add(t0,t1,el,(lt)=>{const p=clamp(lt/(t1-t0));im.style.transform=`scale(${lerp(za,1,E.out3(p))}) translateY(${lerp(30,-20,p)}px)`;fr.style.transform=`translateY(${lerp(18,-12,p)}px)`;if(bgw)bgw.style.transform=`translateX(${lerp(60,-120,p)}px)`;kin(ch,lt,.08,.3,.03)},rv);return el;
}
