/* =====================================================================
   Slideshow Viewer — Gap Fill activity (v1.49, 2026-10-16)
   An activity slide (see activities.js): Insert → Slides → Activity ▾ → Gap fill.

   Making it (the creator, a full-screen dialog):
     Step 1 · Write. A text box for the sentences / paragraph. A sentence builder
       is optional: with one chosen, tapping a chunk in it puts that chunk into the
       text where the cursor is (spaced; a capital at the start of a sentence; a
       chunk from the builder's last column ends the sentence with a full stop).
       Typing your own words works as normal; Àé gives accents.
       Layout: Paragraph (line breaks as typed) or Numbered sentences.
     Step 2 · Choose gaps. Tap a word to make it a gap (tap again to undo). Drag
       across neighbouring words to make one gap for a phrase (within one
       sentence). Punctuation is never in a gap; l' / j' are separate words.
       Decoy words can be added to the word bank. A live preview of the three
       slides, with the text size it will be on the board.
     Insert 3 slides, all titled "Gap Fill" (an ordinary Header text box):
       1 the text with gaps (each gap as long as its word),
       2 the same + the word bank (answers + decoys, jumbled) at the bottom,
       3 the same with numbered bank words and small boxes for the number.
   Editing: top bar Edit activity, or Slides tab → Activity: Gap fill → Edit gap
     fill (the creator again, on step 2) / Shuffle word bank. All three slides
     update together (same gid).
   Presenting: tap a gap to show its answer (gold), tap again to hide it.
     Show all / Hide all top right. Clicker → shows the next gap, ← hides the
     last. Bank words are crossed off once every gap they fill is showing.
     On the numbers slide a shown gap reads "4 mange".
     State: 'ga|<gap>' in the slide's reveal set (resets when the lesson is left;
     the dual-screen console sees it).
   Print: the print preview has an Answers pill on a Gap Fill slide
     (Not printed by default; saved per slide in l.print[mode].obj[slide].ans).

   act = { type:'gapfill', v:1, lay:2, gid, ver:1|2|3, lang, fmt:'para'|'num',
           text, gaps:[[start, end]…] (character ranges in text, in order),
           decoys:[words], bank:[words in display order] (each answer once + decoys),
           sb:{ year, term, name, title } | null, q?:{ tl, en } }
   Loaded after activities.js. Uses SVCore, SVAct, SBCore, SVSentence.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore, A = window.SVAct;
if(!C || !A) return;
const { $, $$, el, esc, toast } = C;
const LAY = { size:28, y:0.022, rows:0.125, btnTop:0.03 }; // same as the other activities (activities.js LAY2)
const TITLE = 'Gap Fill';
const VER_NAMES = { 1:'Gaps', 2:'Word bank', 3:'Numbers' };
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
const shuffled = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const IC = iconMap({
  eye: 'eye', eyeOff: 'eye-off', sb: 'blocks', x: 'x',
  shuffle: 'shuffle', plus: 'plus', left: 'chevron-left', right: 'chevron-right',
});
const ico = (n, cls) => `<svg class="${cls || 'sva-i'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const isGF = act => !!act && act.type === 'gapfill';

/* ================= text → words, sentences ================= */
// Words a gap can be made of. l' / j' / qu' are words of their own (so "aime" in "j'aime" can be a gap);
// aujourd'hui stays whole. Hyphenated words stay whole.
const WORD = /aujourd['’]hui|[\p{L}\p{N}]+(?:[-‐][\p{L}\p{N}]+)*['’]?/giu;
function tokenize(text){
  const out = []; let m; WORD.lastIndex = 0;
  while((m = WORD.exec(text))) out.push({ s:m.index, e:m.index + m[0].length, w:m[0] });
  return out;
}
// Sentences (always, for joining words into one gap) or paragraphs. Ranges are trimmed.
function units(text, fmt){
  const out = []; let pos = 0;
  const push = (s, e, extra) => { while(s < e && /\s/.test(text[s])) s++; while(e > s && /\s/.test(text[e - 1])) e--; out.push(Object.assign({ s, e }, extra || {})); };
  for(const line of String(text).split('\n')){
    const a = pos, b = pos + line.length; pos = b + 1;
    if(fmt === 'para'){ push(a, b, { blank:!line.trim() }); continue; }
    const re = /[.!?…]+["”»)]*\s+(?=[¿¡"«(“]?[\p{Lu}\p{N}])/gu; let st = a, m;
    while((m = re.exec(line))){ const end = a + m.index + m[0].trimEnd().length; push(st, end); st = a + m.index + m[0].length; }
    push(st, b);
  }
  return fmt === 'para' ? trimBlank(out) : out.filter(u => u.e > u.s);
}
// Paragraph mode: no empty lines at the start or end, at most one in a row.
function trimBlank(us){
  const o = [];
  for(const u of us){ if(u.blank && (!o.length || o[o.length - 1].blank)) continue; o.push(u); }
  while(o.length && o[o.length - 1].blank) o.pop();
  return o;
}
const answerOf = (text, g) => text.slice(g[0], g[1]);
// Each answer once (in the order the gaps come), then the decoys.
function bankWords(text, gaps, decoys){
  const seen = new Set(), out = [];
  for(const g of gaps){ const w = answerOf(text, g); if(!seen.has(w)){ seen.add(w); out.push(w); } }
  for(const d of decoys || []){ const w = String(d).trim(); if(w && !seen.has(w)){ seen.add(w); out.push(w); } }
  return out;
}
// Keep the old order for words still there; new words go in at random places; never left in gap order.
function rebank(old, words){
  const keep = (old || []).filter(w => words.includes(w)), fresh = shuffled(words.filter(w => !keep.includes(w)));
  const out = keep.slice();
  for(const w of fresh) out.splice(Math.floor(rand() * (out.length + 1)), 0, w);
  return out;
}
function jumbleBank(words){
  if(words.length < 2) return words.slice();
  for(let t = 0; t < 30; t++){ const p = shuffled(words); if(p.some((w, i) => w !== words[i])) return p; }
  return words.slice().reverse();
}
// After the text has changed: each gap goes to the same words nearest where they were (dropped if gone).
function remap(oldText, newText, gaps){
  if(oldText === newText) return gaps.map(g => g.slice());
  const toks = tokenize(newText), starts = new Set(toks.map(t => t.s)), ends = new Set(toks.map(t => t.e));
  const out = [];
  for(const g of gaps){
    const ans = answerOf(oldText, g); if(!ans) continue;
    let best = -1, bd = Infinity, i = newText.indexOf(ans);
    while(i >= 0){
      const e = i + ans.length;
      if(starts.has(i) && ends.has(e) && !out.some(o => o[0] < e && i < o[1]) && Math.abs(i - g[0]) < bd){ best = i; bd = Math.abs(i - g[0]); }
      i = newText.indexOf(ans, i + 1);
    }
    if(best >= 0) out.push([best, best + ans.length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/* ================= drawing (slide units) ================= */
// One unit (paragraph / sentence) as HTML. A gap and anything stuck to it (punctuation, l') never wrap apart.
function unitHTML(act, u, gctx){
  const { text, gaps } = act, atoms = [];
  let p = u.s;
  const addText = t => { for(const part of t.split(/(\s+)/)) if(part) atoms.push(/^\s+$/.test(part) ? { sp:true } : { t:part }); };
  gaps.forEach((g, n) => {
    if(g[0] < u.s || g[1] > u.e) return;
    addText(text.slice(p, g[0])); atoms.push({ g:n }); p = g[1];
  });
  addText(text.slice(p, u.e));
  let h = '', grp = [];
  const flush = () => {
    if(!grp.length) return;
    const inner = grp.map(a => a.g != null ? gapHTML(act, a.g, gctx) : esc(a.t)).join('');
    h += grp.some(a => a.g != null) ? `<span class="gf-nw">${inner}</span>` : inner;
    grp = [];
  };
  for(const a of atoms){ if(a.sp){ flush(); h += ' '; } else grp.push(a); }
  flush();
  return h;
}
function gapHTML(act, n, gctx){
  const ans = answerOf(act.text, act.gaps[n]), on = gctx.shown && gctx.shown[n];
  // v1.88: while presenting, a hidden gap has a small eye (not drawn in print or thumbnails): tap it, or the gap, to show the answer.
  const eye = gctx.live && !on ? `<span class="gf-ey">${ico('eye', 'gf-eyi')}</span>` : '';
  if(act.ver === 3){
    const k = act.bank.indexOf(ans) + 1;
    return `<span class="gf-g gf-g3${on ? ' on' : ''}" data-g="${n}"><span class="gf-k">${k}</span><span class="gf-a">${esc(ans)}</span>${eye}</span>`;
  }
  return `<span class="gf-g${on ? ' on' : ''}" data-g="${n}"><span class="gf-a">${esc(ans)}</span>${eye}</span>`;
}
function textHTML(act, gctx){
  const us = units(act.text, act.fmt);
  if(act.fmt === 'num') return us.map((u, k) => `<div class="gf-r"><span class="gf-no">${k + 1}</span><div class="gf-s">${unitHTML(act, u, gctx)}</div></div>`).join('');
  return us.map(u => u.blank ? '<div class="gf-p gf-blank"></div>' : `<div class="gf-p">${unitHTML(act, u, gctx)}</div>`).join('');
}
function bankHTML(act, shown){
  const used = new Set();
  if(shown){
    for(const w of act.bank){
      const gs = act.gaps.map((g, n) => answerOf(act.text, g) === w ? n : -1).filter(n => n >= 0);
      if(gs.length && gs.every(n => shown[n])) used.add(w);
    }
  }
  return act.bank.map((w, k) => `<span class="gf-c${used.has(w) ? ' used' : ''}" data-w="${k}">${act.ver === 3 ? `<b class="gf-bn">${k + 1}</b>` : ''}${esc(w)}</span>`).join('');
}
function area(Wd, H, dx){ return { x:dx + Wd*0.035, y:H*LAY.rows, w:Wd*0.93, h:H*0.968 - H*LAY.rows }; }
function boxHTML(act, G, f, shown, measure, live){
  let h = `<div class="gf-box${measure ? ' gf-m' : ''}" style="left:${G.x}px;top:${G.y}px;width:${G.w}px;${measure ? '' : `height:${G.h}px;`}font-size:${f}px">`;
  h += `<div class="gf-tx"><div class="gf-in${act.fmt === 'num' ? ' gf-num' : ''}">${textHTML(act, { shown, live })}</div></div>`;
  if(act.ver > 1 && act.bank.length) h += `<div class="gf-bank">${bankHTML(act, shown)}</div>`;
  return h + `</div>`;
}
// The biggest text size that fits (measured in the page). The numbers slide is measured with every
// gap showing (they widen when shown), so showing answers never makes it overflow.
let MH = null;
const FIT = new Map();
function fitSize(act, Wd, H, dx){
  const G = area(Wd, H, dx);
  const key = JSON.stringify([act.ver, act.fmt, act.text, act.gaps, act.bank, Math.round(G.w), Math.round(G.h)]);
  if(FIT.has(key)) return FIT.get(key);
  if(!MH){ MH = el('div', 'sva gf gf-meas'); MH.setAttribute('aria-hidden', 'true'); }
  if(!MH.isConnected) document.body.appendChild(MH);
  MH.style.width = Wd + dx*2 + 'px'; MH.style.height = H + 'px';
  const all = act.gaps.map(() => true);
  const fits = f => {
    MH.innerHTML = boxHTML(act, G, f, act.ver === 3 ? all : null, true);
    const b = MH.firstChild; if(!b) return true;
    if(b.offsetHeight > G.h) return false;
    return [...b.querySelectorAll('.gf-in, .gf-bank')].every(x => x.scrollWidth <= x.clientWidth + 1);
  };
  let lo = H*0.016, hi = H*0.078;
  if(fits(hi)) lo = hi;
  else for(let k = 0; k < 16; k++){ const m = (lo + hi)/2; if(fits(m)) lo = m; else hi = m; }
  MH.innerHTML = '';
  if(FIT.size > 300) FIT.clear();
  FIT.set(key, lo);
  return lo;
}
function layerHTML(act, Wd, H, dx, shown, live){
  const f = fitSize(act, Wd, H, dx);
  let h = boxHTML(act, area(Wd, H, dx), f, shown, false, live);
  if(live && act.gaps.length){
    const bh = H*0.056, all = act.gaps.every((g, n) => shown && shown[n]);
    h += `<div class="sva-top" style="right:${dx + Wd*0.045}px;top:${H*LAY.btnTop}px;height:${bh}px;font-size:${bh*0.36}px">
      ${all ? `<button data-a="ghide" title="Hide every answer">${ico('eyeOff')}<span>Hide all</span></button>`
        : `<button data-a="gshow" title="Show every answer">${ico('eye')}<span>Show all</span></button>`}</div>`;
  }
  return h;
}
const okAct = act => isGF(act) && typeof act.text === 'string' && Array.isArray(act.gaps) && Array.isArray(act.bank);
// v1.88: the shown-answer colours follow the lesson's year group (dark / middle / light of the school palette); no year = amber.
const GF_YR = { '7':['#5F7F24', '#A8CC52', '#F1F7E2'], '8':['#07515F', '#086F84', '#E3F2F5'], '9':['#78134F', '#7A2D52', '#F3EDEF'], '10':['#402347', '#61366B', '#F0EAF3'], '11':['#333333', '#404040', '#EEEEEE'], none:['#8C6516', '#D5A12E', '#FBF1D8'] };
const yrVars = yr => { const c = GF_YR[String(yr)] || GF_YR.none; return `--gd:${c[0]};--gm:${c[1]};--gl:${c[2]}`; };
// Static drawing (editor, thumbnails, print). opts.answers: every gap filled in (print with answers).
function paint(root, act, Wd, H, dx, opts){
  if(!okAct(act)) return;
  const d = el('div', 'sva gf' + (opts && opts.answers ? ' gf-show' : ''));
  d.style.cssText = yrVars(act.yr);
  d.innerHTML = layerHTML(act, Wd, H, dx, null, false);
  root.appendChild(d);
}

/* ================= presenting ================= */
function shownOf(P, i, act){ const f = C.flipped(P, i); return act.gaps.map((g, n) => f.has('ga|' + n)); }
function setShown(P, i, n, on){ const f = C.flipped(P, i); if(on) f.add('ga|' + n); else f.delete('ga|' + n); }
function sync(P, i, act, old){
  if(!okAct(act)) return;
  const live = !P.mirror, shown = shownOf(P, i, act);
  const sig = 'G' + shown.map(Number).join('') + (live ? 'L' : '');
  if(old && old.dataset.sig === sig && old.isConnected) return;
  if(old && old._drag) return; // a word is being dragged: leave the slide alone
  const z0 = P.v.rawSize(i), dx0 = P.v.dx(i) || 0, z = { w:z0.w + 2*dx0, h:z0.h }, dx = 0; // v1.88: the whole slide frame
  const d = el('div', 'sva gf' + (live ? ' sva-live' : ''));
  d.style.cssText = yrVars(act.yr || (P.l && C.yearOf ? C.yearOf(P.l.label) : null)); // slides made before v1.88 take the lesson's year
  d.innerHTML = layerHTML(act, z.w, z.h, dx, shown, live);
  d.dataset.sig = sig;
  if(old) old.replaceWith(d); else P.stage.slideEl.appendChild(d);
  if(live) d.addEventListener('click', e => {
    const g = e.target.closest('.gf-g'), b = e.target.closest('button[data-a]');
    if(!g && !b) return;
    e.stopPropagation();
    const now = shownOf(P, i, act);
    if(g) setShown(P, i, +g.dataset.g, !now[+g.dataset.g]);
    else if(b.dataset.a === 'gshow') act.gaps.forEach((x, n) => setShown(P, i, n, true));
    else if(b.dataset.a === 'ghide') act.gaps.forEach((x, n) => setShown(P, i, n, false));
    C.applyVisibility(P); C.buildOverlay(P);
  });
  if(live && act.ver > 1) wireBank(P, i, act, d);
}
// v1.88: on the word bank and numbers slides, drag a word onto its gap: the right gap shows its answer, a wrong one shakes and the word goes back.
function wireBank(P, i, act, d){
  let g = null; // { c, pid, x, y, s, live, hot }
  const gapUnder = e => { const t = document.elementFromPoint(e.clientX, e.clientY), gap = t && t.closest && t.closest('.gf-g'); return gap && d.contains(gap) ? gap : null; };
  d.addEventListener('pointerdown', e => {
    if(e.button > 0) return;
    const c = e.target.closest('.gf-c'); if(!c || c.classList.contains('used')) return;
    e.stopPropagation();
    const bank = c.parentNode, r = bank.getBoundingClientRect(), s = r.width / (bank.offsetWidth || 1) || 1;
    g = { c, pid:e.pointerId, x:e.clientX, y:e.clientY, s, live:false, hot:null };
    try{ c.setPointerCapture(e.pointerId); }catch(_){}
  });
  d.addEventListener('pointermove', e => {
    if(!g || e.pointerId !== g.pid) return;
    if(!g.live){
      if(Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) return;
      g.live = true; d._drag = true; g.c.classList.remove('gf-back'); g.c.classList.add('gf-drag');
    }
    e.preventDefault();
    g.c.style.transform = `translate(${(e.clientX - g.x)/g.s}px,${(e.clientY - g.y)/g.s}px)`;
    const t = gapUnder(e);
    if(t !== g.hot){ if(g.hot) g.hot.classList.remove('gf-hot'); g.hot = t && !t.classList.contains('on') ? t : null; if(g.hot) g.hot.classList.add('gf-hot'); }
  });
  const up = e => {
    if(!g || e.pointerId !== g.pid) return;
    const t = g; g = null;
    if(!t.live) return;
    d._drag = false;
    const gap = e.type === 'pointerup' ? gapUnder(e) : null; // asked while the word still ignores the pointer, or it would be the thing found under it
    if(t.hot) t.hot.classList.remove('gf-hot');
    t.c.classList.remove('gf-drag');
    if(gap && !gap.classList.contains('on')){
      const n = +gap.dataset.g;
      if(answerOf(act.text, act.gaps[n]) === act.bank[+t.c.dataset.w]){
        setShown(P, i, n, true);
        C.applyVisibility(P); C.buildOverlay(P);
        return;
      }
      gap.classList.add('gf-bad'); setTimeout(() => gap.classList.remove('gf-bad'), 500);
      t.c.classList.add('gf-bad'); setTimeout(() => t.c.classList.remove('gf-bad'), 500);
    }
    t.c.classList.add('gf-back'); t.c.style.transform = '';
    setTimeout(() => t.c.classList.remove('gf-back'), 250);
  };
  d.addEventListener('pointerup', up);
  d.addEventListener('pointercancel', up);
}
function step(P, i, act, d){
  if(!okAct(act)) return false;
  const shown = shownOf(P, i, act);
  if(d > 0){ const n = shown.indexOf(false); if(n < 0) return false; setShown(P, i, n, true); }
  else { const n = shown.lastIndexOf(true); if(n < 0) return false; setShown(P, i, n, false); }
  C.applyVisibility(P); C.buildOverlay(P);
  return true;
}

/* ================= the creator (editor) ================= */
let G = null;
const LANGS = l => (window.SBCore && SBCore.LANGS[l]) || { name:'French', short:'FR' };
function itemAt(doc, c, g, i){ const col = doc.cols[c]; return col && col.groups[g] && col.groups[g][i] || null; }
// opts: { year, lang, size:{ w, h }, edit, act (to edit), x (builder, when editing), onDone(state) }
function openCreator(opts){
  closeCreator();
  const back = el('div', 'svap-back gfp-back');
  back.innerHTML = `<div class="svap gfp"><div class="svap-h">
      <div class="svap-t"><b>Gap Fill</b><span class="svap-sb"></span></div>
      <div class="gfp-steps"><button data-step="1"><b>1</b>Write</button><button data-step="2"><b>2</b>Choose gaps</button></div>
      <button class="svap-btn" data-a="cancel">Cancel</button>
      <button class="svap-btn go" data-a="go"></button>
    </div>
    <div class="svap-body"><div class="gfp-main"></div><div class="svap-side gfp-side"></div></div></div>`;
  document.body.appendChild(back);
  const a = opts.act;
  G = { back, opts, x:null, doc:null, step:a ? 2 : 1, text:a ? a.text : '', fmt:a ? a.fmt : 'para', gaps:a ? a.gaps.map(g => g.slice()) : [],
    decoys:a ? (a.decoys || []).slice() : [], bank:a ? a.bank.slice() : [], prevText:a ? a.text : '', caret:null, prev:1, drag:null };
  if(!a) G.caret = [0, 0];
  back.addEventListener('click', onClick);
  back.addEventListener('input', onInput);
  back.addEventListener('pointerdown', onDown);
  back.addEventListener('pointermove', onMove);
  back.addEventListener('pointerup', onUp);
  back.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', onKey, true);
  G.ro = new ResizeObserver(() => scaleSheet());
  if(opts.x) setBuilder(opts.x, true);
  paint2();
  return G;
}
function closeCreator(){ if(!G) return; G.ro.disconnect(); G.back.remove(); document.removeEventListener('keydown', onKey, true); G = null; }
function onKey(e){
  if(!G) return;
  const typing = e.target.closest && e.target.closest('input,textarea');
  if(!typing) e.stopPropagation();
  if(e.key === 'Escape' && !$('.sbp-back') && !$('.sym-pop')){ e.preventDefault(); if(typing) e.target.blur(); else closeCreator(); }
  if(e.key === 'Enter' && e.target.matches && e.target.matches('[data-in=decoy]')){ e.preventDefault(); addDecoy(); }
}
function setBuilder(x, quiet){
  G.x = x; G.doc = x ? x.doc : null;
  if(!quiet) paint2();
}
function chooseBuilder(){
  if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); return; }
  SVSentence.choose({ year:G.opts.year, onPick:x => { if(G){ setBuilder(x); toast('Tap a chunk to add it where the cursor is.'); } } });
}
function scaleSheet(){
  if(!G || !G.doc) return;
  const K = window.SBCore, host = $('.svap-sheet', G.back), sc = host && $('.svap-scale', host);
  if(!sc) return;
  const W = K.PAPERS.slide.w * K.MM, H = K.PAPERS.slide.h * K.MM, hw = host.clientWidth - 24, hh = host.clientHeight - 24;
  const k = Math.max(0.1, Math.min(hw / W, hh / H));
  sc.style.transform = `scale(${k})`; sc.style.left = Math.round((host.clientWidth - W*k)/2) + 'px'; sc.style.top = Math.round((host.clientHeight - H*k)/2) + 'px';
}
const lang = () => G.doc ? G.doc.lang : (G.opts.lang === 'es' ? 'es' : 'fr');
function curAct(ver){
  const words = bankWords(G.text, G.gaps, G.decoys);
  G.bank = rebank(G.bank, words);
  return { type:'gapfill', v:1, lay:2, ver, lang:lang(), fmt:G.fmt, text:G.text, gaps:G.gaps, decoys:G.decoys, bank:G.bank };
}
function goState(){
  if(G.step === 1) return { label:'Next: choose gaps', ok:!!G.text.trim(), why:'Type or tap in some text first' };
  return { label:G.opts.edit ? 'Save' : 'Insert 3 slides', ok:G.gaps.length > 0, why:'Tap at least one word to make a gap' };
}
function paint2(){
  if(!G) return;
  const b = G.back;
  $('.svap-sb', b).textContent = G.doc ? window.SBCore.displayTitle(G.doc) : 'No sentence builder';
  $$('[data-step]', b).forEach(x => x.classList.toggle('on', +x.dataset.step === G.step));
  b.classList.toggle('gfp-nosb', G.step === 1 && !G.doc);
  b.classList.toggle('gfp-s2', G.step === 2);
  const go = $('[data-a=go]', b), gs = goState();
  go.textContent = gs.label; go.disabled = !gs.ok; go.title = gs.ok ? '' : gs.why;
  if(G.step === 1) paintWrite(); else paintGaps();
}
// ---- step 1: write ----
function fmtSeg(){
  return `<div class="svap-tr"><span>Layout</span><span class="svap-seg"><button data-fmt="para" class="${G.fmt === 'para' ? 'on' : ''}">Paragraph</button><button data-fmt="num" class="${G.fmt === 'num' ? 'on' : ''}">Numbered sentences</button></span></div>`;
}
function paintWrite(){
  const main = $('.gfp-main', G.back), side = $('.gfp-side', G.back), K = window.SBCore;
  G.ro.disconnect();
  if(G.doc){
    main.innerHTML = `<div class="svap-sheet"><div class="svap-scale"></div></div>`;
    const fit = K.fitPaper(G.doc, K.PAPERS.slide, { say:false }); K.clearMeasure();
    $('.svap-scale', main).innerHTML = K.sheetHTML(G.doc, K.PAPERS.slide, fit.L, 'both', { fill:true, say:false });
    G.ro.observe($('.svap-sheet', main)); scaleSheet();
  } else main.innerHTML = '';
  const had = $('textarea[data-in=text]', side), sel = had ? [had.selectionStart, had.selectionEnd] : G.caret;
  side.innerHTML = `<div class="svap-tool">${fmtSeg()}
      <div class="svap-tr gfp-sbrow">${G.doc
        ? `<button class="svap-btn" data-a="builder">${ico('sb', 'svap-i')}Change builder</button><button class="svap-btn" data-a="nosb" title="Hide the builder and just type">${ico('x', 'svap-i')}No builder</button>`
        : `<button class="svap-btn" data-a="builder">${ico('sb', 'svap-i')}Add a sentence builder</button>`}</div>
      <p class="svap-help">${G.doc ? 'Tap a chunk in the builder to add it where the cursor is. ' : ''}Type your own words too. ${G.fmt === 'num' ? 'Each sentence gets its own numbered line.' : 'Line breaks stay as you type them.'}</p>
    </div>
    <div class="gfp-ta"><div class="gfp-tah"><span>Text</span><button class="svap-btn gfp-sym" data-a="sym" title="Accents and symbols">Àé</button><button class="svap-btn" data-a="clear" title="Clear the text">${ico('x', 'svap-i')}Clear</button></div>
      <textarea data-in="text" spellcheck="false" placeholder="${G.doc ? 'Tap chunks in the builder, or type…' : 'Type the sentences or paragraph…'}">${esc(G.text)}</textarea></div>`;
  const ta = $('textarea[data-in=text]', side);
  const keep = () => { G.caret = [ta.selectionStart, ta.selectionEnd]; };
  for(const ev of ['select', 'keyup', 'click', 'blur']) ta.addEventListener(ev, keep);
  if(sel){ try{ ta.setSelectionRange(sel[0], sel[1]); }catch(_){} }
}
// A builder chunk goes in at the cursor (or the end): spaced, a capital at the start of a sentence,
// a full stop after a chunk from the last column.
function addChunk(c, g, i){
  const it = itemAt(G.doc, c, g, i); if(!it) return;
  let t = String(it.tl || '').replace(/\s+/g, ' ').trim(); if(!t) return;
  const ta = $('textarea[data-in=text]', G.back);
  const [s, e] = G.caret || [G.text.length, G.text.length];
  let before = G.text.slice(0, s), after = G.text.slice(e);
  const start = !before.trim() || /[.!?…]["”»)]*\s*$/.test(before) || /\n\s*$/.test(before);
  // v1.58 grammar rules (Sentence Builders/grammar-rules.json): the text before the cursor and the new chunk
  // ('…il n’y a pas de ' + 'une église' → '…il n’y a pas ' + 'd’église').
  if(!start && window.SBGrammar && G.doc){
    const bt = before.replace(/\s+$/, ''), ws = before.slice(bt.length), line = bt.lastIndexOf('\n') + 1;
    const r = SBGrammar.pair(bt.slice(line), t, G.doc.lang, null, it);
    if(r.b !== t || r.a !== bt.slice(line)){ before = bt.slice(0, line) + r.a + (r.a ? (ws || ' ') : ''); t = r.b; }
  }
  t = start ? A._.capFirst(t) : (c === 0 ? lowFirstSafe(t) : t);
  const last = c === lastCol(G.doc);
  if(last && !/[.!?…]["”»)]*$/.test(t)) t += '.';
  if(before && !/[\s¿¡«(“'’-]$/.test(before)) t = ' ' + t;
  let tail = '';
  if(last && after.trim() === '') tail = G.fmt === 'num' ? '\n' : ' ';
  else if(after && !/^[\s,.;:!?…)»”]/.test(after)) tail = ' ';
  if(tail === ' ' && /^\s/.test(after)) tail = '';
  G.text = before + t + tail + after;
  const pos = (before + t + tail).length;
  G.caret = [pos, pos];
  if(ta){ ta.value = G.text; try{ ta.focus({ preventScroll:true }); ta.setSelectionRange(pos, pos); }catch(_){} }
  const go = $('[data-a=go]', G.back), gs = goState(); go.disabled = !gs.ok;
  const cell = $(`.sb-it[data-c="${c}"][data-g="${g}"][data-i="${i}"]`, G.back);
  if(cell){ cell.classList.remove('gfp-flash'); void cell.offsetWidth; cell.classList.add('gfp-flash'); }
}
function lastCol(doc){ let n = -1; doc.cols.forEach((col, c) => { if(col.groups.some(gr => gr.some(it => String(it.tl || '').trim()))) n = c; }); return n; }
function lowFirstSafe(t){
  const m = /^([^\p{L}]*)(\p{L})(\p{L}*)/u.exec(t); if(!m) return t;
  if(m[3] && m[3] === m[3].toUpperCase() && m[3] !== m[3].toLowerCase()) return t;
  return m[1] + m[2].toLowerCase() + t.slice(m[1].length + 1);
}
// ---- step 2: choose gaps ----
function selHTML(){
  const text = G.text, toks = tokenize(text);
  const startAt = new Map(G.gaps.map((g, n) => [g[0], n])), endAt = new Set(G.gaps.map(g => g[1]));
  let h = '', p = 0, open = false;
  toks.forEach((t, k) => {
    h += esc(text.slice(p, t.s));
    if(!open && startAt.has(t.s)){ h += `<span class="gfs-gap" data-gap="${startAt.get(t.s)}">`; open = true; }
    h += `<span class="gfs-t" data-t="${k}">${esc(t.w)}</span>`;
    if(open && endAt.has(t.e)){ h += '</span>'; open = false; }
    p = t.e;
  });
  if(open) h += '</span>';
  return h + esc(text.slice(p));
}
function previewHTML(){
  return `<div class="gfp-pv"><div class="gfp-pvh"><span>Preview</span><span class="svap-seg">${[1, 2, 3].map(v => `<button data-pv="${v}" class="${G.prev === v ? 'on' : ''}">${v} ${VER_NAMES[v]}</button>`).join('')}</span></div>
    <div class="gfp-pvbox"><div class="gfp-pvs"></div></div><div class="gfp-size"></div></div>`;
}
function paintGaps(){
  const main = $('.gfp-main', G.back), side = $('.gfp-side', G.back);
  G.ro.disconnect();
  main.innerHTML = `<div class="gfs"><p class="gfs-help">Tap a word to make it a gap; tap it again to take the gap off. Drag across words to make one gap for a phrase.</p><div class="gfs-text">${selHTML()}</div></div>`;
  const n = G.gaps.length;
  side.innerHTML = `<div class="svap-tool">${fmtSeg()}
      <div class="gfp-count">${n ? `<b>${n}</b> gap${n === 1 ? '' : 's'}` : 'No gaps yet'}${n ? `<button class="svap-btn" data-a="nogaps">Clear gaps</button>` : ''}</div></div>
    <div class="svap-tool"><div class="gfp-lab">Extra words for the word bank <span>(decoys, optional)</span></div>
      <div class="gfp-dec"><input data-in="decoy" type="text" spellcheck="false" placeholder="Type a word, then Add"><button class="svap-btn" data-a="sym2" title="Accents and symbols">Àé</button><button class="svap-btn" data-a="adddec">${ico('plus', 'svap-i')}Add</button></div>
      ${G.decoys.length ? `<div class="gfp-chips">${G.decoys.map((d, k) => `<span class="gfp-chip">${esc(d)}<button data-deldec="${k}" title="Take it out">${ico('x', 'svap-i')}</button></span>`).join('')}</div>` : ''}
      <div class="gfp-bankh"><span>Word bank order</span><button class="svap-btn" data-a="shuffle" ${n ? '' : 'disabled'}>${ico('shuffle', 'svap-i')}Shuffle</button></div>
    </div>${previewHTML()}`;
  paintPreview();
}
function paintPreview(){
  const box = $('.gfp-pvbox', G.back), host = $('.gfp-pvs', G.back); if(!box || !host) return;
  const z = G.opts.size || { w:960, h:540 };
  const act = curAct(G.prev);
  const W = box.clientWidth || 330, k = W / z.w;
  box.style.height = (z.h * k) + 'px';
  host.style.cssText = `width:${z.w}px;height:${z.h}px;transform:scale(${k});transform-origin:0 0`;
  host.innerHTML = `<div class="gfp-pvt">${TITLE}</div>`;
  if(act.gaps.length || act.text) paint(host, act, z.w, z.h, 0);
  // Smallest text size on the three slides, in points on the slide.
  const sz = [1, 2, 3].map(v => fitSize(curAct(v), z.w, z.h, 0));
  const pt = Math.round(Math.min(...sz) * 0.75 * 2) / 2;
  const el2 = $('.gfp-size', G.back);
  el2.textContent = `Text size on the board: about ${pt}pt${pt < 16 ? ' (small: a shorter text would be easier to read)' : ''}`;
  el2.classList.toggle('warn', pt < 16);
}
function addDecoy(){
  const inp = $('[data-in=decoy]', G.back); if(!inp) return;
  const w = inp.value.replace(/\s+/g, ' ').trim();
  if(!w) return;
  if(G.decoys.includes(w) || G.gaps.some(g => answerOf(G.text, g) === w)){ toast('That word is already in the word bank.'); inp.select(); return; }
  G.decoys.push(w); paint2();
  const i2 = $('[data-in=decoy]', G.back); if(i2) i2.focus();
}
// Drag across words: the range stays inside one sentence.
function tokAt(e){ const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest && t.closest('.gfs-t'); }
function sentOf(toks, k){ const us = units(G.text, 'num'); const t = toks[k]; return us.findIndex(u => t.s >= u.s && t.e <= u.e); }
function onDown(e){
  if(!G || G.step !== 2 || e.button > 0) return;
  const t = e.target.closest('.gfs-t'); if(!t) return;
  e.preventDefault();
  G.drag = { a:+t.dataset.t, b:+t.dataset.t, pid:e.pointerId, toks:tokenize(G.text) };
  G.drag.sent = sentOf(G.drag.toks, G.drag.a);
  try{ $('.gfs-text', G.back).setPointerCapture(e.pointerId); }catch(_){}
  markDrag();
}
function onMove(e){
  const d = G && G.drag; if(!d || e.pointerId !== d.pid) return;
  const t = tokAt(e); if(!t) return;
  const k = +t.dataset.t;
  if(k === d.b || sentOf(d.toks, k) !== d.sent) return;
  d.b = k; markDrag();
}
function markDrag(){
  const d = G.drag, lo = Math.min(d.a, d.b), hi = Math.max(d.a, d.b);
  $$('.gfs-t', G.back).forEach(x => { const k = +x.dataset.t; x.classList.toggle('drag', k >= lo && k <= hi && lo !== hi); });
}
function onUp(e){
  const d = G && G.drag; if(!d || e.pointerId !== d.pid) return;
  G.drag = null;
  if(e.type === 'pointercancel'){ paint2(); return; }
  const lo = Math.min(d.a, d.b), hi = Math.max(d.a, d.b), s = d.toks[lo].s, en = d.toks[hi].e;
  const hit = G.gaps.findIndex(g => g[0] < en && s < g[1]);
  if(lo === hi && hit >= 0) G.gaps.splice(hit, 1);
  else { G.gaps = G.gaps.filter(g => !(g[0] < en && s < g[1])); G.gaps.push([s, en]); G.gaps.sort((a, b) => a[0] - b[0]); }
  paint2();
}
function onInput(e){
  const t = e.target;
  if(t.matches('textarea[data-in=text]')){
    G.text = t.value; G.caret = [t.selectionStart, t.selectionEnd];
    const go = $('[data-a=go]', G.back), gs = goState(); go.disabled = !gs.ok; go.title = gs.ok ? '' : gs.why;
  }
}
function toStep(n){
  if(n === G.step) return;
  if(n === 2){
    if(!G.text.trim()){ toast('Type or tap in some text first.'); return; }
    G.text = G.text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    G.gaps = remap(G.prevText, G.text, G.gaps); G.prevText = G.text;
  } else G.prevText = G.text;
  G.step = n; paint2();
}
function onClick(e){
  if(!G) return;
  const it = e.target.closest('.sb-it');
  if(it && G.step === 1 && G.doc){ addChunk(+it.dataset.c, +it.dataset.g, +it.dataset.i); return; }
  const st = e.target.closest('[data-step]'); if(st){ toStep(+st.dataset.step); return; }
  const fm = e.target.closest('[data-fmt]'); if(fm){ G.fmt = fm.dataset.fmt; paint2(); return; }
  const pv = e.target.closest('[data-pv]'); if(pv){ G.prev = +pv.dataset.pv; $$('[data-pv]', G.back).forEach(x => x.classList.toggle('on', x === pv)); paintPreview(); return; }
  const dd = e.target.closest('[data-deldec]'); if(dd){ G.decoys.splice(+dd.dataset.deldec, 1); paint2(); return; }
  const b = e.target.closest('[data-a]'); if(!b || b.disabled) return;
  const a = b.dataset.a;
  if(a === 'cancel') closeCreator();
  else if(a === 'builder') chooseBuilder();
  else if(a === 'nosb') setBuilder(null);
  else if(a === 'clear'){ if(!G.text || b.dataset.arm === '1'){ G.text = ''; G.caret = [0, 0]; paint2(); } else { b.dataset.arm = '1'; b.lastChild.textContent = 'Tap again to clear'; setTimeout(() => { if(b.isConnected){ b.dataset.arm = ''; b.lastChild.textContent = 'Clear'; } }, 3000); } }
  else if(a === 'sym' || a === 'sym2'){
    const f = $(a === 'sym' ? 'textarea[data-in=text]' : '[data-in=decoy]', G.back);
    if(C.symbolPalette) C.symbolPalette(b, txt => { C.insertIntoField(f, txt); });
  }
  else if(a === 'adddec') addDecoy();
  else if(a === 'nogaps'){ G.gaps = []; paint2(); }
  else if(a === 'shuffle'){ G.bank = jumbleBank(rebank(G.bank, bankWords(G.text, G.gaps, G.decoys))); paintPreview(); toast('Word bank shuffled'); }
  else if(a === 'go'){
    if(G.step === 1){ toStep(2); return; }
    if(!G.gaps.length){ toast('Tap at least one word to make a gap.'); return; }
    const words = bankWords(G.text, G.gaps, G.decoys);
    // A brand-new bank never comes out in gap order.
    let bank = rebank(G.bank, words);
    if(bank.length > 1 && words.slice(0, bank.length).every((w, k) => w === bank[k])) bank = jumbleBank(bank);
    const x = G.x, K = window.SBCore;
    const out = { lang:lang(), fmt:G.fmt, text:G.text, gaps:G.gaps.map(g => g.slice()), decoys:G.decoys.slice(), bank,
      sb:x ? { year:x.loc.year, term:x.loc.term, name:x.loc.name, title:K.displayTitle(x.doc) } : null,
      q:x ? { tl:x.doc.q.tl, en:x.doc.q.en } : null };
    const done = G.opts.onDone;
    closeCreator();
    done(out);
  }
}

/* ================= editor hooks ================= */
function headerObj(E, dx){
  const W = E.v.base.size().w, Hh = E.v.base.size().h, line = Math.ceil(LAY.size*1.2 + 8);
  const html = window.PPTX.newTextHtml('Arial', { size:LAY.size }).replace('<span style="', '<span style="font-weight:700;').replace('>​</span>', '>' + TITLE + '</span>');
  return { id:uid(), x:Math.round((W + 2*dx)*0.045), y:Math.round(Hh*LAY.y), w:Math.round(W*0.55), h:line, html }; // v1.88: 4.5% of the whole frame, as the text box is laid out
}
const lessonYear = E => C.yearOf ? C.yearOf(E.l.label) : null;
function slideSize(E){ const z = E.v.size(E.i); return { w:z.w, h:z.h }; } // v1.88: the lesson's frame (16:9 when the lesson is shown 16:9)
function gidEntries(l, gid){
  const out = [];
  for(const m of ['pptx', 'pdf']) for(const e of ((l.slides && l.slides[m]) || [])) if(e.src && e.src.act && e.src.act.gid === gid) out.push(e);
  return out;
}
function insert(E){
  if(E.mode !== 'pptx'){ toast('Activities can only go into the PowerPoint version.', true); return; }
  const year = lessonYear(E);
  openCreator({ year, lang:E.l.lang, size:slideSize(E), onDone:st => {
    const gid = uid(), base = Object.assign({ type:'gapfill', v:1, lay:2, gid, yr:year }, st);
    const ks = [];
    while(ks.length < 3){ const k = C.newSlideKey(E.l); if(!ks.includes(k)) ks.push(k); }
    const ents = [1, 2, 3].map((ver, n) => ({ k:ks[n], src:{ blank:true, act:Object.assign(clone(base), { ver }) } }));
    C.slideOp(E, list => {
      let at = list.findIndex(e => e.k === E.i); at = at < 0 ? list.length : at + 1;
      list.splice(at, 0, ...ents);
      for(const e of ents) E.l.hides[E.mode][e.k] = { obj:{}, covers:[], added:[A.titleObj(E, E.v.dx(e.k) || 0, TITLE, year == null ? 'none' : year, 0.035)] };
      E.i = ents[0].k; E.selS = new Set(ents.map(e => e.k)); E.anchorS = ents[0].k; E.sel = null; E.selCover = null;
    });
    toast('Added: Gap Fill (gaps, word bank, numbers)');
  } });
  // The builder is optional: the gallery opens over the creator; closing it just leaves you typing.
  if(window.SVSentence && SVSentence.choose) SVSentence.choose({ year, onPick:x => { if(G) setBuilder(x); }, onCancel:() => { if(G && !G.doc) $('textarea[data-in=text]', G.back) && $('textarea[data-in=text]', G.back).focus(); } });
}
async function edit(E){
  const act = A.curAct(E); if(!isGF(act)) return;
  let x = null;
  if(act.sb && window.SVSentence){
    try{
      const list = await SVSentence.list(), sb = act.sb;
      x = list.find(y => y.loc.year === sb.year && y.loc.term === sb.term && y.loc.name === sb.name)
        || list.find(y => window.SBCore.displayTitle(y.doc) === sb.title && y.doc.lang === act.lang) || null;
    }catch(err){ x = null; }
  }
  openCreator({ year:lessonYear(E), lang:act.lang, size:slideSize(E), edit:true, act, x, onDone:st => {
    C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)){ const keepSb = !st.sb && e.src.act.sb; Object.assign(e.src.act, clone(st)); if(keepSb && !x) e.src.act.sb = keepSb; } });
    toast('Gap Fill saved (all three slides)');
  } });
}
function shuffleBank(E){
  const act = A.curAct(E); if(!isGF(act)) return;
  const bank = jumbleBank(act.bank);
  C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.bank = bank.slice(); });
  toast('Word bank shuffled (all three slides)');
}

/* ================= styles ================= */
const CSS = `
.gf .gf-box{position:absolute;display:flex;flex-direction:column;gap:.45em;color:#111114}
.gf .gf-box.gf-m{gap:.45em}
.gf-meas{position:absolute !important;left:-20000px !important;top:0 !important;visibility:hidden;pointer-events:none}
.gf .gf-tx{flex:1 1 auto;min-height:0;display:flex;align-items:center;border-radius:.45em;background:#f1f2f6;border:.07em solid #d3d6df;box-sizing:border-box;padding:.35em .7em;overflow:hidden}
.gf .gf-m .gf-tx{flex:none}
.gf .gf-in{width:100%;font-weight:700;line-height:1.75;overflow-wrap:normal}
.gf .gf-p{min-height:1.75em}
.gf .gf-p.gf-blank{min-height:.6em;height:.6em}
.gf .gf-r{display:flex;gap:.5em;align-items:flex-start}
.gf .gf-r+.gf-r{margin-top:.1em}
.gf .gf-no{flex:none;width:1.4em;height:1.4em;margin-top:.39em;font-size:.8em;line-height:1;border-radius:50%;background:#26262c;color:#fff;display:grid;place-items:center}
.gf .gf-s{flex:1;min-width:0}
.gf .gf-nw{white-space:nowrap}
.gf .gf-g{display:inline-block;line-height:1.2;padding:0 .3em;margin:0 .04em;min-width:1.6em;text-align:center;background:#fff;border-bottom:.1em solid #26262c;border-radius:.18em .18em 0 0;box-sizing:border-box;vertical-align:baseline}
.gf .gf-g .gf-a{color:transparent}
.gf .gf-g.on,.gf.gf-show .gf-g{background:var(--gl,#fbf1d8);border-bottom-color:var(--gm,#d5a12e)}
.gf .gf-g.on .gf-a,.gf.gf-show .gf-g .gf-a{color:var(--gd,#8c6516)}
.gf .gf-g3{min-width:0;width:1.9em;height:1.15em;padding:0;border:.08em solid #26262c;border-radius:.22em;vertical-align:-.22em}
.gf .gf-g3 .gf-k,.gf .gf-g3 .gf-a{display:none}
.gf .gf-g3.on,.gf.gf-show .gf-g3{width:auto;height:auto;padding:0 .3em 0 .12em;vertical-align:baseline;border-color:var(--gm,#d5a12e)}
.gf .gf-g3.on .gf-k,.gf .gf-g3.on .gf-a,.gf.gf-show .gf-g3 .gf-k,.gf.gf-show .gf-g3 .gf-a{display:inline}
.gf .gf-g3 .gf-k{display:none;background:#26262c;color:#fff;border-radius:.3em;padding:0 .28em;margin-right:.3em;font-size:.8em}
.gf .gf-g3.on .gf-k,.gf.gf-show .gf-g3 .gf-k{display:inline-block}
.gf .gf-bank{flex:none;display:flex;flex-wrap:wrap;justify-content:center;gap:.35em .45em;padding:.4em .5em;border-radius:.45em;border:.09em dashed #8a8f9e;background:#fff;font-size:.92em}
.gf .gf-c{display:inline-flex;align-items:center;gap:.3em;font-weight:700;padding:.12em .5em;border:.09em solid #2b2b33;border-radius:.32em;background:#fff;box-shadow:0 .08em 0 #2b2b33;white-space:nowrap;line-height:1.15}
.gf .gf-c.used{opacity:.35;text-decoration:line-through}
.gf .gf-bn{display:inline-grid;place-items:center;min-width:1.25em;height:1.25em;border-radius:50%;background:#26262c;color:#fff;font-size:.85em;line-height:1}
.gf .gf-g{position:relative}
.gf .gf-ey{position:absolute;left:0;right:0;top:0;bottom:0;display:grid;place-items:center;pointer-events:none}
.gf .gf-eyi{width:.6em;height:.6em;fill:none;stroke:#6b7080;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.8}
.gf.sva-live .gf-c{pointer-events:auto;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}
.gf .gf-c.gf-drag{position:relative;z-index:20;pointer-events:none;cursor:grabbing;box-shadow:0 .25em .5em rgba(0,0,0,.3)}
.gf .gf-c.gf-back{transition:transform .2s}
.gf .gf-g.gf-hot{background:var(--gl,#fbf1d8) !important;box-shadow:0 0 0 .1em var(--gm,#d5a12e)}
.gf .gf-bad{animation:gf-shake .4s}
.gf .gf-g.gf-bad{background:#ffd9d9 !important}
@keyframes gf-shake{0%,100%{transform:none}25%{transform:translateX(-.18em)}75%{transform:translateX(.18em)}}
.gf.sva-live .gf-g{pointer-events:auto;cursor:pointer}
.gf.sva-live .gf-g:not(.on):hover{background:color-mix(in srgb, var(--gl,#fbf1d8) 55%, #fff)}

.gfp .gfp-steps{display:flex;gap:4px;background:#25252a;border-radius:12px;padding:3px}
.gfp .gfp-steps button{height:34px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:#c9c9d1;font:inherit;font-size:14.5px;display:flex;align-items:center;gap:7px;cursor:pointer}
.gfp .gfp-steps button b{width:20px;height:20px;border-radius:50%;background:#3a3a42;display:grid;place-items:center;font-size:12px}
.gfp .gfp-steps button.on{background:#F5B700;color:#111;font-weight:600}
.gfp .gfp-steps button.on b{background:#111;color:#F5B700}
.gfp .gfp-main{flex:1;min-width:0;display:flex;background:#3a3a40;position:relative}
.gfp .gfp-main .svap-sheet{flex:1}
.gfp-nosb .gfp-main{display:none}
.gfp-nosb .gfp-side{flex:1;width:auto;max-width:900px;margin:0 auto}
.gfp .gfp-side{width:400px}
.gfp-s2 .gfp-side{width:380px}
.gfp .gfp-sbrow{gap:6px}
.gfp .gfp-ta{flex:1;min-height:260px;display:flex;flex-direction:column;gap:6px}
.gfp .gfp-tah{display:flex;align-items:center;gap:6px;color:#c9c9d1;font-size:14px}
.gfp .gfp-tah span{flex:1}
.gfp .gfp-tah .svap-btn{height:32px;font-size:13.5px}
.gfp textarea[data-in=text]{flex:1;width:100%;box-sizing:border-box;resize:none;border-radius:12px;border:1.5px solid #44444c;background:#141417;color:#fff;font:600 17px/1.55 Arial,sans-serif;padding:10px 12px}
.gfp-nosb textarea[data-in=text]{font-size:20px}
.gfp textarea:focus,.gfp input:focus{outline:none;border-color:#F5B700}
.gfp .sb-it.gfp-flash{animation:gfp-flash .5s}
@keyframes gfp-flash{0%{background:#F5B700}100%{background:transparent}}
.gfp .gfs{flex:1;overflow:auto;padding:22px 26px;background:#f4f5f8;color:#111114}
.gfp .gfs-help{margin:0 0 14px;color:#4a4a55;font-size:14px}
.gfp .gfs-text{white-space:pre-wrap;font:700 26px/2 Arial,sans-serif;touch-action:pan-y;-webkit-user-select:none;user-select:none}
.gfp .gfs-t{cursor:pointer;border-radius:5px;padding:0 1px;touch-action:none}
.gfp .gfs-t:hover{background:#e3e6ee}
.gfp .gfs-gap{background:#FFE94D;box-shadow:0 0 0 2px #d9a400;border-radius:5px}
.gfp .gfs-gap .gfs-t:hover{background:transparent}
.gfp .gfs-t.drag{background:#A9D8FF}
.gfp .gfp-count{display:flex;align-items:center;gap:10px;color:#c9c9d1;font-size:14.5px}
.gfp .gfp-count b{color:#F5B700;font-size:18px}
.gfp .gfp-count .svap-btn{margin-left:auto;height:32px;font-size:13.5px}
.gfp .gfp-lab{color:#c9c9d1;font-size:14px}
.gfp .gfp-lab span{color:#8d8d97}
.gfp .gfp-dec{display:flex;gap:6px}
.gfp .gfp-dec input{flex:1;min-width:0;height:38px;border-radius:9px;border:1.5px solid #44444c;background:#141417;color:#fff;font:600 15px Arial,sans-serif;padding:0 9px}
.gfp .gfp-dec .svap-btn{height:38px;padding:0 10px}
.gfp .gfp-chips{display:flex;flex-wrap:wrap;gap:5px}
.gfp .gfp-chip{display:inline-flex;align-items:center;gap:2px;background:#fff;color:#111;font:700 13.5px Arial,sans-serif;border-radius:7px;padding:2px 2px 2px 8px}
.gfp .gfp-chip button{width:24px;height:24px;border:0;background:transparent;color:#555;display:grid;place-items:center;cursor:pointer;border-radius:5px}
.gfp .gfp-chip button:hover{background:#eee}
.gfp .gfp-chip .svap-i{width:14px;height:14px}
.gfp .gfp-bankh{display:flex;align-items:center;gap:8px;color:#c9c9d1;font-size:14px}
.gfp .gfp-bankh span{flex:1}
.gfp .gfp-bankh .svap-btn{height:32px;font-size:13.5px}
.gfp .gfp-pv{display:flex;flex-direction:column;gap:8px}
.gfp .gfp-pvh{display:flex;flex-direction:column;gap:6px;color:#c9c9d1;font-size:14px}
.gfp .gfp-pvh .svap-seg button{font-size:13px;padding:0 8px}
.gfp .gfp-pvbox{position:relative;width:100%;overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4)}
.gfp .gfp-pvs{position:absolute;left:0;top:0;background:#fff;overflow:hidden}
.gfp .gfp-pvt{position:absolute;left:4.5%;top:2.2%;font:700 37px/1.2 Arial,sans-serif;color:#111}
.gfp .gfp-size{color:#a9a9b3;font-size:13px}
.gfp .gfp-size.warn{color:#ffb38a}
.gfp-s2 .svap-sb{display:none}
`;
A.CSS += CSS; // the dual-screen replica takes SVAct.CSS
const st = document.createElement('style'); st.id = 'sv-gapfill-css'; st.textContent = CSS; document.head.appendChild(st);

window.SVGap = { paint, sync, step, insert, edit, shuffleBank, isGF, CSS,
  _:{ tokenize, units, remap, bankWords, rebank, jumbleBank, fitSize, layerHTML, open:openCreator, get state(){ return G; } } };
})();
