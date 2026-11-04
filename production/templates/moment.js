// "Moment" reel template: one real pet clip full screen, 2-3 big on-screen text beats (a relatable pet-parent line), then ONE product card.
// window.SPEC = { bpm, beats: [{ lines[] }], clip{file,start,dur,n,base}, product{slug,name,word}, tag, cta }.
// The product scene holds the clip's first frame so the end matches the start and the reel loops.
(function () {
  const S = window.SPEC, B = 60 / S.bpm, nb = S.beats.length, L = 4 * B, tClip = nb * L, dur = Math.round((tClip + 4 * B) * 100) / 100;
  const hits = [0]; for (let i = 1; i <= nb; i++) hits.push(+(i * L).toFixed(3)); hits.push(+(tClip + 2 * B).toFixed(3));
  const n = S.clip.n, period = Math.max(1, 2 * (n - 1));
  const frameAt = (t) => { const k = Math.floor(t * 30) % period; return k < n ? k : period - k; }; // ping-pong, so a short clip never jumps
  const imgs = Array.from({ length: n }, (_, i) => `<img class="cf" src="${S.clip.base}c${String(i + 1).padStart(3, '0')}.jpg" style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover;display:none">`).join('');
  const shade = `<div class="abs" style="left:0;right:0;top:0;height:900px;background:linear-gradient(180deg,rgba(12,47,42,.55),rgba(12,47,42,0))"></div><div class="abs" style="left:0;right:0;top:1000px;height:920px;background:linear-gradient(180deg,rgba(12,47,42,0),rgba(12,47,42,.6))"></div>`;
  window.REEL = { dur, hits, sections: [[0, L, 'pulse'], [L, tClip, 'drive'], [tClip, dur, 'stab']], coverAt: 0.9, shake: 4, grade: 'contrast(1.05) saturate(1.1)', build() {
    // 1) the clip, full screen, for the whole moment
    (function () {
      const el = mk(bg(C.deep) + imgs + shade), fr = [...el.querySelectorAll('.cf')];
      add(0, tClip, el, (lt) => { const k = frameAt(lt); fr.forEach((f, i) => { f.style.display = i === k ? 'block' : 'none'; }); });
    })();
    // 2) text beats: the first is the hook and sits high; later beats sit in the lower third, clear of Instagram's buttons
    S.beats.forEach((b, bi) => {
      const lines = b.lines.slice(0, 4), base = lines.length <= 1 ? 190 : lines.length === 2 ? 170 : 140; let top = bi === 0 ? 300 : 1060, html = '';
      lines.forEach((line, i) => { const sz = fitSize(line, base, 'arch'); html += T('arch', line, `left:60px;top:${top}px;font-size:${sz}px;color:${(i + bi) % 2 ? C.gold : C.cream};text-shadow:0 6px 30px rgba(0,0,0,.55)`); top += Math.round(sz * 1.05); });
      const el = mk(html), ws = [...el.querySelectorAll('.arch')].map((w) => splitChars(w));
      add(bi * L, (bi + 1) * L, el, (lt) => { ws.forEach((chs, i) => kin(chs, lt + 0.05, i * 0.12, 0.26, 0.02, 'drop')); }, bi === 0 ? undefined : 'wipeUp', 0.18);
    });
    // 3) one product, over the clip's first frame (loop point)
    (function () {
      const word = S.product.word, fs = Math.min(230, Math.round(960 / (word.length * 0.78)));
      const el = mk(bg(C.deep) + `<img src="${S.clip.base}c001.jpg" style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover;filter:blur(18px) brightness(.55)">`
        + T('arch', word, `left:0;right:0;top:230px;text-align:center;font-size:${fs}px;color:${C.cream};text-shadow:0 6px 30px rgba(0,0,0,.5)`) + pcard(S.product.slug, 190, 560, 700)
        + T('serif', S.product.name, `left:70px;top:1330px;font-size:${fitSize(S.product.name, 72, 'serif')}px;color:${C.cream}`) + T('arch', S.cta, `left:70px;top:1450px;font-size:56px;color:${C.gold}`));
      const c = el.querySelector('.pc');
      add(tClip, dur, el, (lt) => { const e = E.bounce(clamp(lt / 0.5)); c.style.transform = `translateY(${(1 - e) * -900}px) rotate(-3deg)`; }, 'circle', 0.25);
    })();
  } };
})();
