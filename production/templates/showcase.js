// "Showcase" reel template. Fully data-driven: window.SPEC = { bpm, hookLines[], products[{slug,name,price,word}], petPhotos[], petWords[], tag, cta }.
// Built from the proven Kukur motion engine (lib.js): kinetic hook, bouncing product cards with real names and prices, pet burst, logo end card.
(function () {
  const S = window.SPEC, B = 60 / S.bpm, n = S.products.length, np = S.petPhotos.length;
  const t1 = 2 * B, t2 = t1 + n * 2 * B, t3 = t2 + np * B, dur = Math.round((t3 + 4 * B) * 100) / 100;
  const hits = [0, t1]; for (let i = 0; i < n; i++) hits.push(+(t1 + i * 2 * B).toFixed(3)); hits.push(+t2.toFixed(3), +t3.toFixed(3));
  const FOCAL = { 'golden.jpg': { fy: 10, za: 2.3, zb: 1.95 }, 'beagle.jpg': { fx: 42, fy: 20, za: 1.9, zb: 1.4 }, 'corgi.jpg': { fx: 62, fy: 58, za: 1.9, zb: 1.4 }, 'doodle.jpg': { fx: 60, fy: 35, za: 1.9, zb: 1.5 }, 'cat.jpg': { fx: 50, fy: 38, za: 1.8, zb: 1.5 }, 'dogcat.jpg': { fx: 25, fy: 40, za: 1.5, zb: 1.25 } };
  const PALETTE = [[C.forest, C.cream], [C.cream, C.terra], [C.gold, C.deep], [C.terra, C.cream], [C.teal, C.cream], [C.cream, C.forest], [C.deep, C.gold], [C.orange, C.cream]];
  const REVEALS = ['wipeUp', 'wipeR', 'circle', 'wipeL', 'diag', 'blinds', 'iris', 'wipeDown'];
  window.REEL = { dur, hits, sections: [[0, t1, 'pulse'], [t1, t2, 'drive'], [t2, t3, 'groove'], [t3, dur, 'stab']], coverAt: +(t1 + 0.8).toFixed(2), shake: 9, grade: 'contrast(1.07) saturate(1.12)', build() {
    // 1) hook: kinetic words on orange with the first product popping in
    (function () {
      const lines = S.hookLines.slice(0, 5); const base = lines.length <= 2 ? 330 : lines.length === 3 ? 270 : 200; let top = lines.length <= 3 ? 340 : 280; let html = bg(C.orange); const cols = [C.cream, C.deep, C.cream, C.deep, C.cream];
      lines.forEach((line, i) => { const sz = fitSize(line, base, 'arch'); html += T('arch', line, `left:60px;top:${top}px;font-size:${sz}px;color:${cols[i]}`); top += Math.round(sz * 1.04); });
      html += pcard(S.products[0].slug, 600, 1230, 400, 'transform:rotate(8deg)');
      const el = mk(html), ws = [...el.querySelectorAll('.arch')].map((w) => splitChars(w)), c = el.querySelector('.pc');
      add(0, t1, el, (lt) => { ws.forEach((chs, i) => kin(chs, lt, i * 0.22, 0.28, 0.02, 'drop')); c.style.transform = `rotate(8deg) scale(${E.elastic(clamp((lt - 0.6) / 0.8))})`; });
    })();
    // 2) products: one 2-beat card each, real name and price
    S.products.forEach((p, i) => {
      const t0 = t1 + i * 2 * B, [bgc, fg] = PALETTE[i % PALETTE.length], word = p.word;
      const el = mk(bg(bgc) + T('arch', word, `left:0;right:0;top:260px;text-align:center;font-size:${Math.min(300, Math.round(960 / (word.length * 0.78)))}px;color:${fg};opacity:.95`) + pcard(p.slug, 190, 600, 700)
        + T('serif', p.name, `left:70px;top:1330px;font-size:${fitSize(p.name, 70, 'serif')}px;color:${fg}`) + pill(p.price, 70, 1440, bgc === C.cream ? C.orange : C.cream, bgc === C.cream ? '#fff' : C.deep, 58) + T('arch', `0${i + 1}`, `right:60px;top:1450px;font-size:100px;color:${fg};opacity:.4`));
      const c = el.querySelector('.pc'), w = el.children[1], pl = el.querySelector('.pl');
      add(t0, t0 + 2 * B, el, (lt) => { const e = E.bounce(clamp(lt / 0.5)); c.style.transform = `translateY(${(1 - e) * -900}px) scale(${1 + Math.max(0, 0.18 * Math.sin(clamp((lt - 0.45) / 0.25) * Math.PI))},${1 - Math.max(0, 0.14 * Math.sin(clamp((lt - 0.45) / 0.25) * Math.PI))}) rotate(${(i % 2 ? -1 : 1) * 4}deg)`; w.style.transform = `scale(${lerp(1.15, 1, E.out3(clamp(lt / 0.3)))})`; pop(pl, lt, 0.45, 0.25); }, REVEALS[i % REVEALS.length], 0.2);
    });
    // 3) pet burst
    S.petPhotos.forEach((ph, i) => petShot(t2 + i * B, t2 + (i + 1) * B, A + ph, Object.assign({ word: S.petWords[i] || '', size: 280, font: 'arch', col: i % 2 ? C.gold : C.cream }, FOCAL[ph] || {})));
    // 4) end card
    endCard(t3, dur, { bg: C.cream, tag: S.tag, tgSize: 44, cta: S.cta, logoTop: 560 });
  } };
})();
