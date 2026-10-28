/* =====================================================================
   Slideshow Viewer — Sentence Builder, column by column (v1.92, 2026-10-25)
   An activity slide (see activities.js): Insert → Slides → Activity ▾ → Sentence builder columns.
   For the first time pupils meet a builder (Vocab Flooding, modelling): sound-symbol correspondence.

   Making it: pick a sentence builder. One slide is inserted for each column (columns joined in the
   builder stay together on one slide). The slide's title is the column's title. English is never shown.
   Layout: the column's phrases fill the slide, as big as will fit; a long column is split into 2 or 3
   side-by-side lists only when that makes the text clearly bigger (reading order: down the first list, then the next).
   Presenting: the words the teacher picked ("Sounds to show") have their respelling showing from the start.
     Tap any word to show its respelling under it (tap again to hide it): Show sounds / Hide sounds top right.
     The clicker / arrow keys never reveal a respelling: they just move to the next slide.
     Room for the respelling is always kept, so nothing moves when one appears.
     State: 'sp|<n>' in the slide's reveal set = word n tapped (resets when the lesson is left; the dual-screen console sees it).
   Editing: Activity tab → Sounds to show (a dialog: tap the words, slide by slide), and Refresh from builder
     (re-reads the builder: new respellings, corrections; every slide of the set updates together, same gid).

   act = { type:'sbcols', v:1, lay:2, gid, yr, lang, u:<unit number>, title,
           blocks:[ { title, items:[ { tl, marks:[tl marks], phon:[{ s, e, p }] } ] } ],
           pre:[word numbers whose respelling shows from the start, in reading order from 0],
           sb:{ year, term, name, title } }
   Loaded after activities.js. Uses SVCore, SVAct, SBCore, SVSentence.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore, A = window.SVAct, K = window.SBCore;
if(!C || !A || !K) return;
const { $, el, esc, toast } = C;
const LAY = { rows:0.125, btnTop:0.03 }; // same as the other activities (activities.js LAY2)
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const IC = iconMap({ eye:'eye', eyeOff:'eye-off' });
const ico = (n, cls) => `<svg class="${cls || 'sva-i'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const isSC = act => !!act && act.type === 'sbcols';

/* ================= data: builder → slides ================= */
// One entry per slide: columns joined in the builder (joinNext) share a slide. Only what the slide needs is kept,
// so it shows even if the builder file moves; "Refresh from builder" re-reads it.
function unitsFrom(doc){
  return K.unitsOf(doc).map(u => {
    const blocks = u.map(ci => {
      const col = doc.cols[ci], items = [];
      col.groups.forEach(g => g.forEach(it => {
        if(!String(it.tl || '').trim()) return;
        items.push({ tl:it.tl, marks:(it.marks || []).filter(m => m.lang === 'tl').map(m => ({ lang:'tl', s:m.s, e:m.e, c:m.c })),
          phon:(it.phon || []).filter(p => p && String(p.p || '').trim()).map(p => ({ s:p.s, e:p.e, p:p.p })) });
      }));
      return { title:col.title || '', items };
    }).filter(b => b.items.length);
    return { title:blocks.map(b => b.title).filter(Boolean).join(' + '), blocks };
  }).filter(u => u.blocks.length);
}

// A column (or two joined columns) with so many words that the text would come out small goes over more slides:
// in even parts (titled "Opinion (1/2)"), up to 4 slides. Joined columns are cut at the same place, so they stay side by side.
// Wd, H: the lesson's slide frame, as the slides will be laid out.
const MIN_FONT = 0.05; // smallest text, as a fraction of the slide's height, before a column is split
function slidesFrom(doc, Wd, H){
  const ok = bl => fitLayout({ blocks:bl }, Wd, H, 0).f >= H * MIN_FONT;
  const out = [];
  for(const u of unitsFrom(doc)){
    if(ok(u.blocks)){ out.push(u); continue; }
    // Part p of every joined column goes on slide p, so the columns stay side by side.
    const most = Math.max(...u.blocks.map(b => b.items.length));
    const part = (k, p) => u.blocks.map(b => ({ title:b.title, items:b.items.slice(p * Math.ceil(b.items.length / k), (p + 1) * Math.ceil(b.items.length / k)) })).filter(b => b.items.length);
    let n = 1;
    while(n < 4 && n < most && !ok(part(n, 0))) n++;
    for(let p = 0; p < n; p++) out.push({ title:u.title + (n > 1 ? ` (${p + 1}/${n})` : ''), blocks:part(n, p) });
  }
  return out;
}
function frameOf(E){
  const z = E.v.rawSize ? E.v.rawSize(E.i) : E.v.size(E.i), dx = E.v.dx ? (E.v.dx(E.i) || 0) : 0;
  return { w:z.w + 2*dx, h:z.h };
}

/* ================= drawing ================= */
// An item as inline "words": each is a unit with a line under it for its respelling (the line is always there, hidden, so showing it moves nothing).
// Words stuck together with no space between (j’ + aime) never wrap apart.
function atomsOf(it){
  const text = it.tl || '', arr = K.marksToArr(it.marks, 'tl', text.length);
  const run = (s, e) => { let o = '', i = s; while(i < e){ const c = arr[i]; let j = i; while(j < e && arr[j] === c) j++; const seg = esc(text.slice(i, j)); o += c ? `<span class="c-${c}">${seg}</span>` : seg; i = j; } return o; };
  const out = [];
  for(const sg of K.phonSegments(it)){
    const s = sg.s;
    if(sg.p){ out.push({ s, e:s + sg.t.length, h:run(s, s + sg.t.length), p:sg.p }); continue; }
    const re = /\S+/g; let m;
    while((m = re.exec(sg.t))) out.push({ s:s + m.index, e:s + m.index + m[0].length, h:run(s + m.index, s + m.index + m[0].length), p:'' });
  }
  return out;
}
function itemHTML(it, ctr){
  const at = atomsOf(it);
  let h = '', grp = '';
  const flush = () => { if(grp){ h += (h ? ' ' : '') + `<span class="sc-g">${grp}</span>`; grp = ''; } };
  at.forEach((a, k) => {
    if(k && /\s/.test(it.tl.slice(at[k - 1].e, a.s))) flush();
    grp += a.p ? `<span class="sc-w sc-r{ON${ctr.n}}" data-w="${ctr.n++}"><span class="sc-t">${a.h}</span><span class="sc-p">${esc(a.p)}</span></span>`
      : `<span class="sc-w"><span class="sc-t">${a.h}</span><span class="sc-p">&nbsp;</span></span>`;
  });
  flush();
  return `<div class="sc-it">${h}</div>`;
}
const respelled = act => act.blocks.reduce((n, b) => n + b.items.reduce((m, it) => m + atomsOf(it).filter(a => a.p).length, 0), 0);
// k = lists side by side in each block; shown = array of booleans by word number (null: none showing).
function boxHTML(act, G, f, k, shown, measure, live){
  const ctr = { n:0 };
  let h = `<div class="sc-box${measure ? ' sc-m' : ''}" style="left:${G.x}px;top:${G.y}px;width:${G.w}px;height:${G.h}px;font-size:${f}px;border-width:${(G.h * 0.006).toFixed(2)}px;border-radius:${(G.h * 0.035).toFixed(1)}px;padding:${(G.h * 0.012).toFixed(1)}px ${(G.w * 0.008).toFixed(1)}px">`; // the frame is sized from the slide, not the text, so every slide of a set has the same outline
  for(const b of act.blocks){
    const items = b.items, kk = Math.max(1, Math.min(k, items.length)), per = Math.ceil(items.length / kk);
    h += `<div class="sc-blk">`;
    for(let s = 0; s < kk; s++){
      const part = items.slice(s * per, (s + 1) * per);
      if(part.length) h += `<div class="sc-sub">${part.map(it => itemHTML(it, ctr)).join('')}</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  return h.replace(/\{ON(\d+)\}/g, (m, n) => shown && shown[+n] ? ' on' : '');
}
function area(Wd, H, dx){ return { x:dx + Wd*0.035, y:H*LAY.rows, w:Wd*0.93, h:H*0.968 - H*LAY.rows }; }
// The biggest text size that fits, trying 1, 2 and 3 lists per column: more lists only when the text gets clearly bigger (reading order stays simple).
let MH = null;
const FIT = new Map();
function fitLayout(act, Wd, H, dx){
  const G = area(Wd, H, dx);
  const key = JSON.stringify([act.blocks, Math.round(G.w), Math.round(G.h)]);
  if(FIT.has(key)) return FIT.get(key);
  if(!MH){ MH = el('div', 'sva sc sc-meas'); MH.setAttribute('aria-hidden', 'true'); }
  if(!MH.isConnected) document.body.appendChild(MH);
  MH.style.width = Wd + dx*2 + 'px'; MH.style.height = H + 'px';
  const fitsAt = (f, k) => {
    MH.innerHTML = boxHTML(act, G, f, k, null, true);
    return [...MH.querySelectorAll('.sc-sub')].every(x => x.scrollHeight <= x.clientHeight + 1 && x.scrollWidth <= x.clientWidth + 1);
  };
  const best = k => {
    let lo = H*0.02, hi = H*0.17;
    if(fitsAt(hi, k)) return hi;
    for(let n = 0; n < 16; n++){ const m = (lo + hi)/2; if(fitsAt(m, k)) lo = m; else hi = m; }
    return lo;
  };
  const most = Math.max(...act.blocks.map(b => b.items.length)), ks = act.blocks.length > 1 ? [1] : [1, 2, 3].filter(k => k <= Math.max(1, most));
  const res = ks.map(k => ({ k, f:best(k) })), top = Math.max(...res.map(r => r.f));
  const pick = res.find(r => r.f >= top / 1.3) || res[0];
  MH.innerHTML = '';
  if(FIT.size > 200) FIT.clear();
  FIT.set(key, pick);
  return pick;
}
function layerHTML(act, Wd, H, dx, shown, live){
  const { k, f } = fitLayout(act, Wd, H, dx);
  let h = boxHTML(act, area(Wd, H, dx), f, k, shown, false, live);
  const n = respelled(act);
  if(live && n){
    const bh = H*0.056, all = shown && shown.length === n && shown.every(Boolean);
    h += `<div class="sva-top" style="right:${dx + Wd*0.045}px;top:${H*LAY.btnTop}px;height:${bh}px;font-size:${bh*0.36}px">
      ${all ? `<button data-a="shide" title="Hide every respelling">${ico('eyeOff')}<span>Hide sounds</span></button>`
        : `<button data-a="sshow" title="Show every respelling">${ico('eye')}<span>Show sounds</span></button>`}</div>`;
  }
  return h;
}
const okAct = act => isSC(act) && Array.isArray(act.blocks) && act.blocks.length;
// The year group's colours (year-colours.js: dark / middle / light / fluorescent highlight; no year = gold): the panel is the light tint,
// respellings are in the dark colour, and a word whose respelling is showing is highlighted in the year's fluorescent colour.
const YR = { '7':['#5F7F24', '#A8CC52', '#F1F7E2', '#BFFF3F'], '8':['#07515F', '#086F84', '#E3F2F5', '#3FE0FF'], '9':['#78134F', '#7A2D52', '#F3EDEF', '#FF6FB0'], '10':['#402347', '#61366B', '#F0EAF3', '#C67BFF'], '11':['#333333', '#404040', '#EEEEEE', '#FFFF00'], none:['#8C6516', '#D5A12E', '#FBF1D8', '#FFD93A'] };
const yrVars = yr => { const c = YR[String(yr)] || YR.none; return `--gd:${c[0]};--gm:${c[1]};--gl:${c[2]};--gf:${c[3]}`; };
// The words whose respelling shows from the start (act.pre: word numbers the teacher picked, "Sounds to show").
const preOf = act => new Set(Array.isArray(act.pre) ? act.pre : []);
const preShown = act => { const pre = preOf(act); return Array.from({ length:respelled(act) }, (x, n) => pre.has(n)); };
// Static drawing (editor, thumbnails, print): only the picked respellings show.
function paint(root, act, Wd, H, dx){
  if(!okAct(act)) return;
  const d = el('div', 'sva sc');
  d.style.cssText = yrVars(act.yr);
  d.innerHTML = layerHTML(act, Wd, H, dx, preShown(act), false);
  root.appendChild(d);
}

/* ================= presenting ================= */
// State in the reveal set is 'sp|<n>' = word n has been tapped (flipped from how the slide starts: picked words start showing, the rest hidden).
function shownOf(P, i, act){ const f = C.flipped(P, i), pre = preOf(act); return Array.from({ length:respelled(act) }, (x, n) => pre.has(n) !== f.has('sp|' + n)); }
function setShown(P, i, act, n, on){ const f = C.flipped(P, i); if(on !== preOf(act).has(n)) f.add('sp|' + n); else f.delete('sp|' + n); }
function sync(P, i, act, old){
  if(!okAct(act)) return;
  const live = !P.mirror, shown = shownOf(P, i, act);
  const sig = 'S' + shown.map(Number).join('') + (live ? 'L' : '');
  if(old && old.dataset.sig === sig && old.isConnected) return;
  const z0 = P.v.rawSize(i), dx0 = P.v.dx(i) || 0, z = { w:z0.w + 2*dx0, h:z0.h };
  const d = el('div', 'sva sc' + (live ? ' sva-live' : ''));
  d.style.cssText = yrVars(P.l ? yrKey(P.l) : act.yr); // the lesson's theme as it is now
  d.innerHTML = layerHTML(act, z.w, z.h, 0, shown, live);
  d.dataset.sig = sig;
  if(old) old.replaceWith(d); else P.stage.slideEl.appendChild(d);
  if(live) d.addEventListener('click', e => {
    const w = e.target.closest('.sc-r'), b = e.target.closest('button[data-a]');
    if(!w && !b) return;
    e.stopPropagation();
    const now = shownOf(P, i, act);
    if(w) setShown(P, i, act, +w.dataset.w, !now[+w.dataset.w]);
    else if(b.dataset.a === 'sshow') now.forEach((x, n) => setShown(P, i, act, n, true));
    else if(b.dataset.a === 'shide') now.forEach((x, n) => setShown(P, i, act, n, false));
    C.applyVisibility(P); C.buildOverlay(P);
  });
}
// Clicker / arrow keys never reveal a respelling: they move on to the next slide as on any other slide.
function step(){ return false; }

/* ================= editor hooks ================= */
// The lesson's colours (Design → Themes; else its class code's year, else the Library folder it came from): '7' … '11', or 'none' for gold / as imported.
// The same rule as the theme change in app.js, so the slides always match the rest of the deck.
function lessonYear(E){ return yrKey(E.l); }
function yrKey(l){
  const k = C.themeKey ? C.themeKey(l) : null, y = C.yearOf ? C.yearOf(l && l.label) : null;
  return ['7', '8', '9', '10', '11'].includes(k) ? k : k === 'orig' && y >= 7 && y <= 11 ? String(y) : 'none';
}
function gidEntries(l, gid){
  const out = [];
  for(const m of ['pptx', 'pdf']) for(const e of ((l.slides && l.slides[m]) || [])) if(e.src && e.src.act && e.src.act.gid === gid) out.push(e);
  return out;
}
function insert(E){
  if(E.mode !== 'pptx'){ toast('Activities can only go into the PowerPoint version.', true); return; }
  if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.', true); return; }
  const year = lessonYear(E);
  SVSentence.choose({ year, onPick:x => {
    const fr = frameOf(E), units = slidesFrom(K.normalise(clone(x.doc)), fr.w, fr.h);
    if(!units.length){ toast('That sentence builder has no columns with words in.', true); return; }
    const gid = uid(), sb = { year:x.loc.year, term:x.loc.term, name:x.loc.name, title:K.displayTitle(x.doc) };
    const ks = [];
    while(ks.length < units.length){ const k = C.newSlideKey(E.l); if(!ks.includes(k)) ks.push(k); }
    const ents = units.map((u, n) => ({ k:ks[n], src:{ blank:true, act:{ type:'sbcols', v:1, lay:2, gid, yr:year, lang:x.doc.lang, u:n, title:u.title, blocks:u.blocks, sb } } }));
    C.slideOp(E, list => {
      let at = list.findIndex(e => e.k === E.i); at = at < 0 ? list.length : at + 1;
      list.splice(at, 0, ...ents);
      ents.forEach((e, n) => { E.l.hides[E.mode][e.k] = { obj:{}, covers:[], added:[A.titleObj(E, E.v.dx(e.k) || 0, units[n].title || ('Column ' + (n + 1)), year, 0.035)] }; });
      E.i = ents[0].k; E.selS = new Set(ents.map(e => e.k)); E.anchorS = ents[0].k; E.sel = null; E.selCover = null;
    });
    toast(`Added ${ents.length} slide${ents.length === 1 ? '' : 's'}: ${sb.title}, column by column`);
  } });
}
// The slide's title is an ordinary text box, in the year's dark colour from when it was made. Put it in the lesson's colour now:
// any of the year palette's dark colours in that box becomes the right one (a title you've coloured yourself is left alone).
function recolourTitle(l, e, yr){
  const act = e.src.act, dark = (YR[yr] || YR.none)[0], all = [...new Set(Object.values(YR).map(c => c[0]))];
  for(const m of ['pptx', 'pdf']){
    const h = l.hides && l.hides[m] && l.hides[m][e.k]; if(!h || !h.added) continue;
    for(const o of h.added){
      if(typeof o.html !== 'string' || !act.title || !o.html.includes(esc(act.title))) continue;
      let s = o.html;
      for(const c of all){
        const rgb = [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16));
        s = s.replace(new RegExp(c, 'gi'), dark).replace(new RegExp(`rgb\\(\\s*${rgb[0]}\\s*,\\s*${rgb[1]}\\s*,\\s*${rgb[2]}\\s*\\)`, 'gi'), dark);
      }
      o.html = s;
    }
  }
}
// Re-read the builder (new respellings, corrections) and update every slide of the set.
async function edit(E){
  const act = A.curAct(E); if(!isSC(act)) return;
  let x = null;
  try{
    const list = await SVSentence.list(), sb = act.sb || {};
    x = list.find(y => y.loc.year === sb.year && y.loc.term === sb.term && y.loc.name === sb.name)
      || list.find(y => K.displayTitle(y.doc) === sb.title && y.doc.lang === act.lang) || null;
  }catch(err){ toast("Couldn't read the Sentence Builders folder: " + err.message, true); return; }
  if(!x){ toast(`“${(act.sb && act.sb.title) || 'The builder'}” isn't in the Sentence Builders folder any more.`, true); return; }
  const fr = frameOf(E), units = slidesFrom(K.normalise(clone(x.doc)), fr.w, fr.h), set = gidEntries(E.l, act.gid);
  let n = 0;
  C.slideOp(E, () => { for(const e of set){ const u = units[e.src.act.u]; e.src.act.yr = yrKey(E.l); recolourTitle(E.l, e, e.src.act.yr); if(u){ e.src.act.blocks = clone(u.blocks); n++; } } });
  const moved = units.length !== set.length;
  toast(`Refreshed from the builder (${n} slide${n === 1 ? '' : 's'})` + (moved ? `. The builder now makes ${units.length} slides, not ${set.length}: titles and slide count are unchanged, so insert it again if you want them to match.` : ''), moved);
}

// "Sounds to show": pick, slide by slide, the words whose respelling is showing from the start. Every other word still reveals when tapped.
let PK = null;
function pick(E){
  const act = A.curAct(E); if(!isSC(act)) return;
  closePick();
  const seen = new Set(), slides = [];
  for(const e of ((E.l.slides && E.l.slides[E.mode]) || [])){
    const a = e.src && e.src.act; if(e.del || !a || a.gid !== act.gid || seen.has(a.u)) continue;
    seen.add(a.u); slides.push({ u:a.u, k:e.k, act:a, pre:new Set(preOf(a)) });
  }
  if(!slides.length) return;
  const fr = frameOf(E), back = el('div', 'svap-back scp-back');
  back.innerHTML = `<div class="svap scp"><div class="svap-h">
      <div class="svap-t"><b>Sounds to show</b><span class="scp-n"></span></div>
      <button class="svap-btn" data-a="prev" title="Previous slide">‹</button><button class="svap-btn" data-a="next" title="Next slide">›</button>
      <button class="svap-btn" data-a="all">All</button><button class="svap-btn" data-a="none">None</button>
      <button class="svap-btn" data-a="cancel">Cancel</button><button class="svap-btn go" data-a="go">Done</button></div>
    <div class="scp-help">Tap the words whose respelling should be showing from the start. Any word can still be tapped to show it while presenting; the arrow keys don’t reveal.</div>
    <div class="svap-body scp-body"><div class="scp-stage"><div class="scp-slide" style="width:${fr.w}px;height:${fr.h}px"></div></div></div></div>`;
  document.body.appendChild(back);
  PK = { back, slides, at:Math.max(0, slides.findIndex(s => s.k === E.i)), fr, E };
  back.addEventListener('click', onPickClick);
  PK.ro = new ResizeObserver(() => scalePick()); PK.ro.observe($('.scp-stage', back));
  document.addEventListener('keydown', onPickKey, true);
  drawPick();
}
function closePick(){ if(!PK) return; PK.ro.disconnect(); PK.back.remove(); document.removeEventListener('keydown', onPickKey, true); PK = null; }
function onPickKey(e){ if(!PK) return; e.stopPropagation(); if(e.key === 'Escape'){ e.preventDefault(); closePick(); } }
function scalePick(){
  if(!PK) return;
  const host = $('.scp-stage', PK.back), sl = $('.scp-slide', PK.back), z = Math.max(0.05, Math.min((host.clientWidth - 40) / PK.fr.w, (host.clientHeight - 40) / PK.fr.h));
  sl.style.transform = `scale(${z})`; sl.style.left = Math.round((host.clientWidth - PK.fr.w * z) / 2) + 'px'; sl.style.top = Math.round((host.clientHeight - PK.fr.h * z) / 2) + 'px';
}
function drawPick(){
  const s = PK.slides[PK.at], a = s.act;
  $('.scp-n', PK.back).textContent = `${a.title || 'Column'} · slide ${PK.at + 1} of ${PK.slides.length} · ${s.pre.size} of ${respelled(a)} showing`;
  const d = el('div', 'sva sc sc-edit'); d.style.cssText = yrVars(a.yr);
  d.innerHTML = layerHTML(a, PK.fr.w, PK.fr.h, 0, Array.from({ length:respelled(a) }, (x, n) => s.pre.has(n)), false);
  const sl = $('.scp-slide', PK.back); sl.innerHTML = ''; sl.appendChild(d);
  scalePick();
}
function onPickClick(e){
  if(!PK) return;
  const s = PK.slides[PK.at], w = e.target.closest('.sc-r');
  if(w){ const n = +w.dataset.w; if(s.pre.has(n)) s.pre.delete(n); else s.pre.add(n); drawPick(); return; }
  const b = e.target.closest('[data-a]'); if(!b) { if(e.target === PK.back) closePick(); return; }
  const a = b.dataset.a;
  if(a === 'cancel') closePick();
  else if(a === 'prev'){ PK.at = (PK.at + PK.slides.length - 1) % PK.slides.length; drawPick(); }
  else if(a === 'next'){ PK.at = (PK.at + 1) % PK.slides.length; drawPick(); }
  else if(a === 'all'){ s.pre = new Set(Array.from({ length:respelled(s.act) }, (x, n) => n)); drawPick(); }
  else if(a === 'none'){ s.pre = new Set(); drawPick(); }
  else if(a === 'go'){
    const E = PK.E, picks = new Map(PK.slides.map(x => [x.u, [...x.pre].sort((p, q) => p - q)])), gid = s.act.gid;
    closePick();
    C.slideOp(E, () => { for(const e of gidEntries(E.l, gid)) if(picks.has(e.src.act.u)) e.src.act.pre = picks.get(e.src.act.u).slice(); });
    toast('Sounds to show saved');
  }
}

/* ================= styles ================= */
const CSS = `
.sc .sc-box{position:absolute;display:flex;gap:.7em;color:#111114;background:var(--gl,#fbf1d8);border:.05em solid var(--gm,#d5a12e);border-radius:.4em;box-sizing:border-box;padding:.35em .6em}
.sc-meas{position:absolute !important;left:-20000px !important;top:0 !important;visibility:hidden;pointer-events:none}
.sc .sc-blk{flex:1 1 0;min-width:0;display:flex;gap:.7em}
.sc .sc-sub{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:space-around;gap:.35em;overflow:hidden}
.sc .sc-it{text-align:center;font-weight:700;line-height:1.1;text-wrap:balance}
.sc .sc-g{white-space:nowrap}
.sc .sc-w{display:inline-flex;flex-direction:column;align-items:center;vertical-align:top}
.sc .sc-p{font-size:.5em;font-weight:700;line-height:1.25;color:var(--gd,#8c6516);white-space:nowrap;visibility:hidden}
.sc .sc-w.on .sc-p{visibility:visible}
.sc .sc-w.on .sc-t{background:var(--gf,#ffd93a);border-radius:.15em}
.sc .c-r{color:#c00000}.sc .c-b{color:#0047b3}.sc .c-g{color:#00792a}.sc .c-p{color:#7030a0}.sc .c-s{color:#6b6b6b}
.sc.sva-live .sc-r{pointer-events:auto;cursor:pointer}
.sc.sva-live .sc-r:not(.on):hover .sc-t{background:color-mix(in srgb, var(--gf,#ffd93a) 35%, transparent);border-radius:.15em}
.sc.sva-live .sva-top,.sc.sva-live .sva-top button{pointer-events:auto}
.sc-edit .sc-p{visibility:visible;opacity:.4}
.sc-edit .sc-w.on .sc-p{opacity:1}
.sc-edit .sc-r{pointer-events:auto;cursor:pointer}
.sc-edit .sc-r:hover .sc-t{box-shadow:0 0 0 .06em #9aa0b4;border-radius:.15em}
.scp .scp-help{padding:8px 16px;color:#c9c9d1;font-size:14px;border-bottom:1px solid #2e2e34}
.scp .scp-body{background:#3a3a40}
.scp .scp-stage{flex:1;position:relative;min-width:0}
.scp .scp-slide{position:absolute;background:#fff;transform-origin:0 0;box-shadow:0 2px 14px rgba(0,0,0,.5);overflow:hidden}
`;
A.CSS += CSS; // the dual-screen replica takes SVAct.CSS
const st = document.createElement('style'); st.id = 'sv-sbcols-css'; st.textContent = CSS; document.head.appendChild(st);

window.SVCols = { paint, sync, step, insert, edit, pick, isSC, CSS, _:{ unitsFrom, slidesFrom, recolourTitle, atomsOf, fitLayout, layerHTML } };
})();
