/* =====================================================================
   Slideshow Viewer — Sentence Builder in the slide editor (v1.62, 2026-10-18)

   1. Ribbon tab "Sentence Builder" (PowerPoint versions). The slide area is
      covered by a sentence builder (chosen from the Sentence Builder gallery;
      the lesson remembers the last one, l.sbLast). Click chunks to pick them
      (any number, any columns), then Copy French / Spanish or Copy English on
      the ribbon. Picks stay after a copy (so both languages can be copied);
      the next click starts a new set. Back to editor (or Esc / another tab).
      Text: one chunk = as written; one chunk per column = a sentence in column
      order (capital, full stop, grammar rules, as the Translation activity);
      two or more chunks from one column = one chunk per line, as written.
   2. Sentence clipboard: every copy goes on the lesson's clipboard (l.sbClip,
      saved and synced, oldest first). A panel to the right of the slide shows
      it once it has something; it folds to a thin bar. Clicking a sentence puts
      it in at the cursor when typing in a text box or table cell, otherwise in
      a new Arial 24 text box (stacked under the last one it made on that slide).
      Used sentences get a tick and stay; the next unused one is marked "Next".
      Copies also go on the computer's clipboard, so Ctrl+V works too.
   3. Insert → Sentence Builder: choose a builder, then a 16:9 preview with the
      builder editor's versions (Both languages, French only, English only,
      French + lines, Gaps) and Show phonetics (French only). Gaps: start from
      the builder's saved gaps; clicking words changes this picture only (the
      builder file isn't changed). Insert = a 1920 × 1080 picture filling the slide.

   Uses SVCore (app.js) incl. SVCore.edHooks, SBCore (sb-core.js), SVSentence
   (sb-present.js, the gallery) and SVAct._ (activities.js, sentence joining).
   Classic script (no modules: the pages are opened from the OneDrive folder).
   ===================================================================== */
(function(){
'use strict';
const C = () => window.SVCore, K = () => window.SBCore, Hk = () => window.SVCore.edHooks;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const ic = (n, cls) => window.lucideSvg(n, cls || 'ico');
const uid = () => Math.random().toString(36).slice(2, 10);
const toast = (m, bad) => C().toast(m, bad);
const $ = (s, r) => (r || document).querySelector(s);
const LANG = code => (K() && K().LANGS[code]) || { name:'French', short:'FR' };
const FOLD_KEY = 'sv-sbclip-fold';
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
const MAX_CLIP = 60;

/* ---------------- state ---------------- */
// E.sbx = { x: { doc, loc } the builder showing, picks: Set 'c-g-i', done: picks already copied, ro }
function st(E){ return E.sbx || (E.sbx = { x:null, picks:new Set(), done:false, ro:null, busy:false }); }
function itemAt(doc, c, g, i){ const col = doc.cols[c]; return col && col.groups[g] && col.groups[g][i] || null; }
const lessonYear = E => { const k = C().themeKey ? C().themeKey(E.l) : null; return ['7', '8', '9', '10', '11'].includes(k) ? Number(k) : C().yearOf ? C().yearOf(E.l.label) : null; }; // the theme's year (Design → Themes, or the year folder), else the label's
const pptx = E => E.mode === 'pptx';

/* ---------------- the Sentence Builder tab ---------------- */
// Called by app.js when the tab is clicked, before the ribbon is drawn: nothing on the slide stays selected.
function enter(E){
  const h = Hk();
  if(E.editing) h.finishTextEdit(E);
  E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; E.drawCover = false; E.drawText = null; E.lastCover = null;
  E.orderMode = null; E.cellMode = false; h.clearMulti(E);
  h.buildEditOverlay(E);
}
// Called at the end of every ribbon draw: shows or hides the builder over the slide, and redraws the clipboard.
function sync(E){
  const view = $('.ed-sbview'); if(!view) return;
  const on = E.tab === 'sb';
  if(on && view.hidden){
    view.hidden = false; $('.ed-col').classList.add('sb-on');
    const s = st(E);
    if(s.x) paintView(E); else firstBuilder(E);
  } else if(!on && !view.hidden){
    view.hidden = true; $('.ed-col').classList.remove('sb-on');
  }
  paintClip(E);
}
function back(E){
  if(E.tab !== 'sb') return;
  E.tab = E.lastTab && E.lastTab !== 'sb' ? E.lastTab : 'slides';
  Hk().renderRibbon(E);
}
// First time in this lesson: the builder used last (l.sbLast), else the gallery.
async function firstBuilder(E){
  const s = st(E), last = E.l.sbLast;
  paintView(E);
  if(last && window.SVSentence && SVSentence.list){
    s.busy = true; paintView(E);
    let x = null;
    try{ const list = await SVSentence.list(); x = list.find(b => b.loc.year === last.year && b.loc.term === last.term && b.loc.name === last.name) || null; }
    catch(e){ console.warn(e); }
    s.busy = false;
    if(x){ setBuilder(E, x); return; }
    paintView(E);
  }
  if(E.tab === 'sb') choose(E);
}
function choose(E, then){
  if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); return; }
  SVSentence.choose({ year:lessonYear(E), lang:K().langOf ? K().langOf(E.l.label) : '', onPick:x => { setBuilder(E, x); if(then) then(x); }, onCancel:() => {} });
}
function setBuilder(E, x){
  const s = st(E);
  s.x = { doc:x.doc, loc:x.loc }; s.picks = new Set(); s.done = false;
  const loc = { year:x.loc.year, term:x.loc.term, name:x.loc.name };
  if(JSON.stringify(E.l.sbLast || null) !== JSON.stringify(loc)){ E.l.sbLast = loc; C().saveSoon(); }
  if(E.tab === 'sb'){ paintView(E); Hk().renderRibbon(E); }
}
function paintView(E){
  const view = $('.ed-sbview'); if(!view || view.hidden) return;
  const s = st(E), k = K();
  if(!s.x){
    view.innerHTML = `<div class="sbv-empty">${s.busy ? '<p>Opening the last sentence builder…</p>'
      : `${ic('brick-wall', 'sbv-big')}<p>Choose a sentence builder. Click chunks to pick them, then copy them in French or English.</p><button class="btn primary" data-sbv="choose">Choose a sentence builder</button>`}</div>`;
    return;
  }
  const d = s.x.doc, fit = k.fitPaper(d, k.PAPERS.slide, { say:false }); k.clearMeasure();
  view.innerHTML = `<div class="sbv-sheet"><div class="sbv-scale">${k.sheetHTML(d, k.PAPERS.slide, fit.L, 'both', { fill:true, say:false })}</div></div><div class="sbv-foot"></div>`;
  if(s.ro) s.ro.disconnect();
  s.ro = new ResizeObserver(() => scaleView()); s.ro.observe($('.sbv-sheet', view));
  scaleView(); paintPicks(E);
}
function scaleView(){
  const host = $('.ed-sbview .sbv-sheet'), sc = $('.ed-sbview .sbv-scale'); if(!host || !sc) return;
  const k = K(), W = k.PAPERS.slide.w * k.MM, H = k.PAPERS.slide.h * k.MM, pad = 16;
  const z = Math.max(0.1, Math.min((host.clientWidth - pad*2) / W, (host.clientHeight - pad*2) / H));
  sc.style.transform = `scale(${z})`; sc.style.left = Math.round((host.clientWidth - W*z) / 2) + 'px'; sc.style.top = Math.round((host.clientHeight - H*z) / 2) + 'px';
}
function picked(E){
  const s = st(E), d = s.x.doc;
  return [...s.picks].map(key => key.split('-').map(Number)).filter(([c, g, i]) => itemAt(d, c, g, i)).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}
// The text Copy puts on the clipboard (see the top of the file).
function copyText(E, lang){
  const d = st(E).x.doc, p = picked(E), items = p.map(([c, g, i]) => itemAt(d, c, g, i));
  const raw = it => String((lang === 'en' ? it.en : it.tl) || '').replace(/\s+/g, ' ').trim();
  if(!items.length) return '';
  const per = new Map(); p.forEach(([c]) => per.set(c, (per.get(c) || 0) + 1));
  if(items.length === 1 || [...per.values()].some(n => n > 1)) return items.map(raw).filter(Boolean).join('\n');
  const A = window.SVAct && SVAct._;
  if(!A) return items.map(raw).filter(Boolean).join(' ');
  return lang === 'en' ? A.makeTRow(items, p, 'tl', d.lang).en : A.tlSentence(items, d.lang);
}
function paintPicks(E){
  const view = $('.ed-sbview'), s = st(E); if(!view || !s.x) return;
  view.querySelectorAll('.sb-it').forEach(e => {
    const on = s.picks.has(`${e.dataset.c}-${e.dataset.g}-${e.dataset.i}`);
    e.classList.toggle('sbv-pk', on); e.classList.toggle('sbv-done', on && s.done);
  });
  const foot = $('.sbv-foot', view); if(!foot) return;
  const L = LANG(s.x.doc.lang);
  foot.innerHTML = s.picks.size
    ? `<div class="sbv-prev"><span class="sbv-tag">${L.short}</span><span>${esc(copyText(E, 'tl')).replace(/\n/g, '<br>')}</span></div><div class="sbv-prev"><span class="sbv-tag en">EN</span><span>${esc(copyText(E, 'en')).replace(/\n/g, '<br>')}</span></div>`
      + (s.done ? `<div class="sbv-hint">Copied. Click a chunk to start the next one.</div>` : '')
    : `<div class="sbv-hint">Click chunks to pick them (any columns). Then <b>Copy ${esc(L.name)}</b> or <b>Copy English</b> on the ribbon. One per column makes a sentence; two from one column go on separate lines.</div>`;
}
function onViewClick(E, e){
  const b = e.target.closest('[data-sbv]');
  if(b){ if(b.dataset.sbv === 'choose') choose(E); return; }
  const it = e.target.closest('.sb-it'), s = st(E); if(!it || !s.x) return;
  const key = `${it.dataset.c}-${it.dataset.g}-${it.dataset.i}`;
  if(s.done){ s.picks.clear(); s.done = false; }
  if(s.picks.has(key)) s.picks.delete(key); else s.picks.add(key);
  paintPicks(E); Hk().renderRibbon(E);
}
async function doCopy(E, lang){
  const s = st(E); if(!s.x) return;
  const t = copyText(E, lang);
  if(!t){ toast('Pick some chunks first.'); return; }
  const list = clipList(E, true);
  list.push({ id:uid(), t, l:lang === 'en' ? 'en' : s.x.doc.lang });
  if(list.length > MAX_CLIP) list.splice(0, list.length - MAX_CLIP);
  C().saveSoon();
  s.done = true;
  try{ await navigator.clipboard.writeText(t); }catch(err){ /* the panel still has it */ }
  paintPicks(E); paintClip(E, true); Hk().renderRibbon(E);
  toast(`Copied (${lang === 'en' ? 'English' : LANG(s.x.doc.lang).name}). It's on the sentence clipboard: click it there to put it on a slide.`);
}

/* ---------------- ribbon ---------------- */
function btn(act, icn, label, o){
  o = o || {};
  return `<button class="rb-b${o.big ? ' big' : ''}${o.cls ? ' ' + o.cls : ''}" data-r="${act}"${o.v != null ? ` data-v="${esc(o.v)}"` : ''}${o.dis ? ' disabled' : ''} data-tip="${esc(o.title || label)}" aria-label="${esc(o.aria || label)}">${icn ? ic(icn) : ''}<span>${esc(label)}</span></button>`;
}
// v1.87: same shape as the other tabs' groups (app.js rbGroup): the name above its pill, every pill the same height.
const group = (label, inner) => `<div class="rb-g" role="group" aria-label="${esc(label)}"><div class="rb-gl" aria-hidden="true">${esc(label)}</div><div class="rb-gb">${inner}</div></div>`;
function ribbon(E){
  const s = st(E), d = s.x && s.x.doc, L = LANG(d ? d.lang : 'fr'), n = s.x ? picked(E).length : 0;
  const title = d ? K().displayTitle(d) : 'None chosen';
  return group('Builder', btn('sbchoose', 'brick-wall', d ? 'Change builder' : 'Choose builder', { big:true, title:'Pick a sentence builder from the gallery' })
      + `<span class="sbr-name"><span class="sbr-t" data-tip="${esc(title + (d ? ': ' + d.q.tl : ''))}">${esc(title)}</span></span>`)
    + group(n ? `Copy · ${n} picked` : 'Copy', btn('sbcopy', null, L.name, { big:true, v:'tl', dis:!n, aria:'Copy ' + L.name, title:`Copy ${L.name}: the picked chunks in ${L.name}, onto the sentence clipboard` })
      + btn('sbcopy', null, 'English', { big:true, v:'en', dis:!n, aria:'Copy English', title:'Copy English: the picked chunks in English, onto the sentence clipboard' })
      + btn('sbclear', 'eraser', 'Clear picks', { dis:!n, title:'Unpick every chunk' }))
    + group('Picture', btn('sbpic', 'image', 'Insert as picture…', { big:true, dis:!d, title:'Put this builder on the slide as a 16:9 picture (choose the version first)' }))
    + group('Editor', btn('sbback', 'chevron-left', 'Back to editor', { big:true, cls:'sbr-back', title:'Back to the slide (Esc)' }));
}
function action(E, a, v){
  const s = st(E);
  if(a === 'sbinsert') return openInsert(E);
  if(a === 'sbchoose') return choose(E);
  if(a === 'sbcopy') return doCopy(E, v === 'en' ? 'en' : 'tl');
  if(a === 'sbclear'){ s.picks.clear(); s.done = false; paintPicks(E); Hk().renderRibbon(E); return; }
  if(a === 'sbpic'){ if(s.x) openInsert(E, s.x); return; }
  if(a === 'sbback') return back(E);
}
function keydown(E, e){
  if(e.key === 'Escape' && !$('.sbp-back') && !$('.sbi-back') && !$('.modal-back')){ e.preventDefault(); back(E); }
}

/* ---------------- the sentence clipboard ---------------- */
function clipList(E, make){
  if(!Array.isArray(E.l.sbClip)){ if(!make) return []; E.l.sbClip = []; }
  return E.l.sbClip;
}
function paintClip(E, flash){
  const p = $('.ed-sbclip'); if(!p) return;
  const list = clipList(E), show = pptx(E) && (list.length > 0 || E.tab === 'sb');
  p.hidden = !show; if(!show){ p.innerHTML = ''; return; }
  const folded = lsGet(FOLD_KEY) === '1';
  p.classList.toggle('fold', folded);
  if(folded){
    p.innerHTML = `<button class="sbc-unfold" data-c="unfold" title="Show the sentence clipboard">${ic('chevron-left')}<span>Clipboard${list.length ? ' (' + list.length + ')' : ''}</span></button>`;
    return;
  }
  const next = list.find(x => !x.u);
  p.innerHTML = `<div class="sbc-head"><b title="Sentence clipboard: saved with this lesson">Clipboard</b>${list.length ? `<span class="sbc-n">${list.length}</span>` : ''}<span class="sbc-grow"></span>`
    + (list.length ? `<button class="sbc-hb" data-c="clear" title="Remove every sentence from this lesson's clipboard">Clear all</button>` : '')
    + `<button class="sbc-ib" data-c="fold" title="Fold the clipboard away">${ic('chevron-right')}</button></div>`
    + (list.length ? `<div class="sbc-list">${list.map(x => `<div class="sbc-it${x.u ? ' used' : ''}${x === next ? ' next' : ''}" data-id="${esc(x.id)}" title="${E.tab === 'sb' ? 'Back to the slide and put it there' : 'Put it on the slide (at the cursor if you are typing)'}">
        <span class="sbc-tag${x.l === 'en' ? ' en' : ''}">${x.l === 'en' ? 'EN' : esc(LANG(x.l).short)}</span><span class="sbc-t">${esc(x.t).replace(/\n/g, '<br>')}</span>
        ${x.u ? `<span class="sbc-tick" title="Used">${ic('check')}</span>` : x === next ? '<span class="sbc-next">Next</span>' : ''}
        <button class="sbc-x" data-x="${esc(x.id)}" title="Remove from the clipboard">${ic('x')}</button></div>`).join('')}</div>
      <p class="sbc-help">Click a sentence: it goes in at the cursor if you're typing in a box or table cell, otherwise in a new text box.</p>`
      : `<p class="sbc-help">Empty. Pick chunks in the builder and press Copy: they collect here in order, saved with this lesson.</p>`);
  if(flash){ const l = p.querySelector('.sbc-list'); if(l){ l.scrollTop = l.scrollHeight; const last = l.lastElementChild; if(last){ last.classList.add('flash'); setTimeout(() => last.classList.remove('flash'), 900); } } }
}
function onClipClick(E, e){
  const c = e.target.closest('[data-c]');
  if(c){
    const a = c.dataset.c;
    if(a === 'fold'){ lsSet(FOLD_KEY, '1'); paintClip(E); }
    else if(a === 'unfold'){ lsSet(FOLD_KEY, '0'); paintClip(E); }
    else if(a === 'clear'){
      const n = clipList(E).length;
      C().confirmBox('Clear the sentence clipboard?', `This removes all ${n} sentence${n === 1 ? '' : 's'} from this lesson's clipboard. Text already on slides stays.`, 'Clear all', true)
        .then(ok => { if(!ok) return; E.l.sbClip = []; C().saveSoon(); paintClip(E); });
    }
    return;
  }
  const x = e.target.closest('[data-x]');
  if(x){ const list = clipList(E), i = list.findIndex(it => it.id === x.dataset.x); if(i >= 0){ list.splice(i, 1); C().saveSoon(); paintClip(E); } return; }
  const row = e.target.closest('.sbc-it'); if(!row) return;
  const it = clipList(E).find(y => y.id === row.dataset.id); if(it) useEntry(E, it);
}
function useEntry(E, it){
  if(!pptx(E)){ toast('Text can only be added to the PowerPoint version.', true); return; }
  if(E.tab === 'sb') back(E);
  if(!(E.editing && atCursor(E, it.t))) newBox(E, it.t);
  it.u = 1; C().saveSoon(); paintClip(E);
}
// Typing in a text box or table cell: put the text in where the cursor is.
function atCursor(E, text){
  const ed = E.editing; if(!ed) return false;
  ed.tx.focus();
  const r = Hk().editRange(E); if(!r) return false;
  String(text).split('\n').forEach((ln, i) => { if(i) document.execCommand('insertLineBreak'); if(ln) document.execCommand('insertText', false, ln); });
  const sel = getSelection(); if(sel.rangeCount) ed.range = sel.getRangeAt(0).cloneRange();
  return true;
}
// A new Arial 24 text box, 60% of the slide wide: under the last one the clipboard made on this slide if there's room,
// otherwise in the middle.
function newBox(E, text){
  const h = Hk(), W = E.stage.W, H = E.stage.H, fs = 24, lh = fs * 1.2;
  const w = Math.round(W * 0.6), per = Math.max(10, Math.floor(w / (fs * 0.5)));
  const lines = String(text).split('\n').reduce((n, t) => n + Math.max(1, Math.ceil(t.length / per)), 0);
  const bh = Math.round(Math.min(H * 0.8, lines * lh + 8));
  const c = E.l.hides[E.mode][E.i], prev = c && (c.added || []).filter(a => a.sbc);
  let y = Math.round(Math.max(10, (H - bh) / 2)), x = Math.round((W - w) / 2);
  if(prev && prev.length){
    const last = prev.reduce((m, a) => (a.y + a.h > m.y + m.h ? a : m));
    if(last.y + last.h + 12 + bh <= H - 6){ y = last.y + last.h + 12; x = last.x; }
  }
  const a = { id:uid(), x, y, w, h:bh, html:window.PPTX.textToHtml(text, 'Arial', { size:fs }), sbc:1 };
  h.selectNew(E, 'n' + a.id);
  h.change(E, cfg => { cfg.added.push(a); });
}

/* ---------------- Insert → Sentence Builder (picture) ---------------- */
let D = null; // { E, x, doc (a copy: gaps clicked here stay here), version, phon, fit }
const hasPhon = d => d.cols.some(c => c.groups.some(g => g.some(it => it.phon && it.phon.length)));
const phonOn = () => !!(D && D.phon && D.version === 'tl' && hasPhon(D.doc));
function openInsert(E, x){
  if(!pptx(E)){ toast('Pictures can only be added to the PowerPoint version.', true); return; }
  if(E.editing) Hk().finishTextEdit(E);
  if(x) return showInsert(E, x);
  choose(E, xx => showInsert(E, xx));
}
function showInsert(E, x){
  closeInsert();
  const back = document.createElement('div'); back.className = 'sbi-back';
  back.innerHTML = `<div class="sbi"><div class="sbi-h"><div class="sbi-t"><b>Insert sentence builder</b><span class="sbi-name"></span></div>
      <button class="btn" data-i="change">${ic('brick-wall')}Change builder</button><button class="btn" data-i="cancel">Cancel</button>
      <button class="btn primary" data-i="insert">${ic('image')}Insert</button></div>
    <div class="sbi-bar"><div class="seg sbi-ver"></div><span class="sbi-grow"></span><label class="sbi-phon" hidden><input type="checkbox" data-i="phon"> Show phonetics</label><span class="sbi-info"></span></div>
    <div class="sbi-stage"><div class="sbi-scale"></div></div></div>`;
  document.body.appendChild(back);
  D = { E, back, x:null, doc:null, version:'both', phon:false, fit:null, fitPhon:null };
  back.addEventListener('click', onInsertClick);
  back.addEventListener('change', e => { if(e.target.matches('[data-i=phon]')){ D.phon = e.target.checked; drawInsert(); } });
  back.addEventListener('pointerdown', e => { if(e.target === back) closeInsert(); });
  D.ro = new ResizeObserver(() => scaleInsert()); D.ro.observe($('.sbi-stage', back));
  document.addEventListener('keydown', onInsertKey, true);
  setInsertBuilder(x);
}
function setInsertBuilder(x){
  D.x = x; D.doc = K().clone(x.doc); D.fit = null; D.fitPhon = null;
  $('.sbi-name', D.back).textContent = K().displayTitle(D.doc);
  const L = LANG(D.doc.lang).name;
  $('.sbi-ver', D.back).innerHTML = Object.keys(K().VERSIONS).map(v => `<button data-v="${v}">${esc(K().VERSIONS[v].replace('@', L))}</button>`).join('');
  $('.sbi-phon', D.back).hidden = !hasPhon(D.doc);
  drawInsert();
}
function layout(){
  const k = K(), p = phonOn();
  if(p){ if(!D.fitPhon){ D.fitPhon = k.fitPaper(D.doc, k.PAPERS.slide, { phon:true }); k.clearMeasure(); } return D.fitPhon; }
  if(!D.fit){ D.fit = k.fitPaper(D.doc, k.PAPERS.slide, { phon:false }); k.clearMeasure(); }
  return D.fit;
}
function drawInsert(){
  if(!D) return;
  const k = K(), fit = layout(), L = LANG(D.doc.lang).name;
  D.back.querySelectorAll('.sbi-ver button').forEach(b => b.classList.toggle('on', b.dataset.v === D.version));
  const ph = $('[data-i=phon]', D.back); ph.checked = D.phon; ph.disabled = D.version !== 'tl';
  $('.sbi-phon', D.back).title = D.version === 'tl' ? 'Show the respellings under the words' : `Respellings show on the ${L}-only version`;
  const stage = $('.sbi-stage', D.back);
  stage.classList.toggle('pick', D.version === 'gaps');
  $('.sbi-scale', D.back).innerHTML = k.sheetHTML(D.doc, k.PAPERS.slide, fit.L, D.version, { fill:true, phon:phonOn() });
  const nGaps = D.doc.cols.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.filter(it => it.gap).length, 0), 0);
  $('.sbi-info', D.back).textContent = `16:9 slide · ${fit.L.font}pt` + (fit.ok ? '' : ' · a squeeze at 12pt')
    + (D.version === 'gaps' ? ` · click words to blank them (${nGaps} blanked; this picture only)` : '');
  scaleInsert();
}
function scaleInsert(){
  if(!D) return;
  const k = K(), host = $('.sbi-stage', D.back), sc = $('.sbi-scale', D.back);
  const W = k.PAPERS.slide.w * k.MM, H = k.PAPERS.slide.h * k.MM, pad = 20;
  const z = Math.max(0.1, Math.min((host.clientWidth - pad*2) / W, (host.clientHeight - pad*2) / H));
  sc.style.transform = `scale(${z})`; sc.style.left = Math.round((host.clientWidth - W*z) / 2) + 'px'; sc.style.top = Math.round((host.clientHeight - H*z) / 2) + 'px';
}
function closeInsert(){
  if(!D) return;
  D.ro.disconnect(); D.back.remove(); document.removeEventListener('keydown', onInsertKey, true); D = null;
}
// The editor's keys (Delete, Ctrl+Z…) are kept away while the dialog is open.
function onInsertKey(e){
  if(!D) return;
  if($('.sbp-back')) return; // the gallery is on top
  e.stopPropagation();
  if(e.key === 'Escape'){ e.preventDefault(); closeInsert(); }
  else if(e.key === 'Enter'){ e.preventDefault(); doInsert(); }
}
function onInsertClick(e){
  if(!D) return;
  const v = e.target.closest('.sbi-ver [data-v]');
  if(v){ D.version = v.dataset.v; drawInsert(); return; }
  const b = e.target.closest('[data-i]');
  if(b && b.localName === 'button'){
    const a = b.dataset.i;
    if(a === 'cancel') closeInsert();
    else if(a === 'insert') doInsert();
    else if(a === 'change') choose(D.E, x => { if(D) setInsertBuilder(x); });
    return;
  }
  // Gaps: a word blanks / unblanks; a column title does the whole column.
  if(D.version !== 'gaps') return;
  const th = e.target.closest('.sbi-stage .sb-h[data-c]');
  if(th){
    const c = D.doc.cols[+th.dataset.c]; if(!c) return;
    const all = c.groups.every(g => g.every(it => it.gap));
    c.groups.forEach(g => g.forEach(it => { if(all) delete it.gap; else it.gap = true; }));
    return drawInsert();
  }
  const it = e.target.closest('.sbi-stage .sb-it'); if(!it) return;
  const item = itemAt(D.doc, +it.dataset.c, +it.dataset.g, +it.dataset.i); if(!item) return;
  if(item.gap) delete item.gap; else item.gap = true;
  drawInsert();
}
// The same picture as the builder editor's "Slide image" (1920 × 1080 PNG).
async function slidePng(doc, version, phon, fit){
  const k = K(), paper = k.PAPERS.slide, W = paper.w * k.MM, H = paper.h * k.MM, OW = 1920, OH = 1080;
  const inner = k.sheetHTML(doc, paper, fit.L, version, { fill:true, phon });
  const xhtml = new XMLSerializer().serializeToString(Object.assign(document.createElement('div'), { innerHTML:inner }).firstChild);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${k.SHEET_CSS}</style>${xhtml.replace(/^<div xmlns="http:\/\/www.w3.org\/1999\/xhtml"/, '<div')}</div></foreignObject></svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, OW, OH); cx.drawImage(img, 0, 0, OW, OH);
  return await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('No picture made')), 'image/png'));
}
async function doInsert(){
  if(!D || D.busy) return;
  D.busy = true;
  const E = D.E, fit = layout(), ver = D.version, label = K().VERSIONS[ver].replace('@', LANG(D.doc.lang).name);
  let blob;
  try{ blob = await slidePng(D.doc, ver, phonOn(), fit); }
  catch(e){ console.error(e); if(D) D.busy = false; toast('Couldn\'t make the picture: ' + e.message, true); return; }
  closeInsert();
  if(E.tab === 'sb') back(E);
  await Hk().addPicture(E, blob, false, { fill:true });
  toast(`Added the sentence builder (${label}) as a picture.` + (fit.ok ? '' : ' It\'s a squeeze on a slide at 12pt.'));
}

/* ---------------- set-up (called once the editor is drawn) ---------------- */
function mount(E){
  const col = $('.ed-col'), main = $('.ed-main'); if(!col || !main) return;
  const view = document.createElement('div'); view.className = 'ed-sbview'; view.hidden = true;
  view.addEventListener('click', e => onViewClick(E, e));
  col.appendChild(view);
  const p = document.createElement('aside'); p.className = 'ed-sbclip'; p.hidden = true;
  // Clicking the clipboard doesn't take the focus, so the text being typed keeps its cursor.
  for(const ev of ['pointerdown', 'mousedown']) p.addEventListener(ev, e => { if(e.target.closest('.sbc-it, button')) e.preventDefault(); });
  p.addEventListener('click', e => onClipClick(E, e));
  col.after(p);
  if(E.tab === 'sb') E.tab = 'slides';
  paintClip(E);
}

const CSS = `
.editor .ed-main, .editor .ed-main:has(> .gal){ grid-template-columns:190px minmax(0,1fr) auto auto; }
.editor .ed-main > .gal{ width:290px; }
.ed-col{ position:relative; }
.ed-sbview{ position:absolute; inset:0; z-index:30; background:#e9e9ee; display:flex; flex-direction:column; min-height:0; }
.ed-sbview .sbv-sheet{ flex:1; position:relative; overflow:hidden; min-height:0; }
.ed-sbview .sbv-scale{ position:absolute; left:0; top:0; transform-origin:0 0; box-shadow:0 2px 12px rgba(0,0,0,.14); }
.ed-sbview .sb-it{ cursor:pointer; border-radius:.28em; transition:background-color .12s, opacity .12s; }
.ed-sbview .sb-it:hover{ box-shadow:0 0 0 .14em #9aa0b4; }
.ed-sbview .sb-it.sbv-pk{ background:#FFE94D; box-shadow:0 0 0 .16em #C9A800; }
.ed-sbview .sb-it.sbv-pk.sbv-done{ background:#FFF6B8; box-shadow:0 0 0 .12em #E3CF6A; }
.ed-sbview .sbv-foot{ flex:none; background:var(--surface); border-top:1px solid var(--border); padding:8px 16px; display:flex; flex-direction:column; gap:4px; max-height:30%; overflow:auto; }
.ed-sbview .sbv-prev{ display:flex; gap:10px; align-items:baseline; font-size:var(--fs-md); }
.sbv-tag, .sbc-tag{ flex:none; font:700 11px var(--font); letter-spacing:.04em; color:#fff; background:var(--accent); border-radius:4px; padding:1px 5px; line-height:16px; }
.sbv-tag.en, .sbc-tag.en{ background:#5A5B66; }
.ed-sbview .sbv-hint{ font-size:var(--fs-sm); color:var(--text-2); }
.ed-sbview .sbv-empty{ margin:auto; max-width:420px; text-align:center; color:var(--text-2); display:flex; flex-direction:column; align-items:center; gap:10px; padding:24px; }
.ed-sbview .sbv-big{ width:40px; height:40px; stroke:var(--text-3); fill:none; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
.rb-col.sbr-name{ justify-content:center; max-width:190px; padding:0 4px; gap:2px; }
.sbr-name .sbr-t{ font:600 var(--fs-sm) var(--font); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sbr-name .sbr-q{ font-size:var(--fs-xs); color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ed-sbclip{ width:250px; display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--border); background:var(--surface); }
.ed-sbclip.fold{ width:32px; }
.sbc-unfold{ flex:1; border:0; background:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:8px; padding:10px 0; color:var(--text-2); font:600 var(--fs-xs) var(--font); letter-spacing:.04em; text-transform:uppercase; }
.sbc-unfold:hover{ background:var(--sunken); color:var(--text); }
.sbc-unfold span{ writing-mode:vertical-rl; }
.sbc-unfold .ico{ width:16px; height:16px; }
.sbc-head{ display:flex; align-items:center; gap:6px; padding:10px 8px 8px 12px; border-bottom:1px solid var(--border); font-size:var(--fs-sm); white-space:nowrap; }
.sbc-n{ font-size:var(--fs-xs); font-weight:600; color:var(--accent-ink); background:var(--accent-soft); border-radius:999px; padding:0 7px; line-height:18px; }
.sbc-grow{ flex:1; }
.sbc-hb{ border:0; background:none; cursor:pointer; font:500 var(--fs-xs) var(--font); color:var(--text-2); padding:4px 6px; border-radius:var(--r-sm); }
.sbc-hb:hover{ background:var(--sunken); color:var(--danger); }
.sbc-ib{ border:0; background:none; cursor:pointer; width:26px; height:26px; border-radius:var(--r-sm); display:grid; place-items:center; color:var(--text-2); padding:0; }
.sbc-ib:hover{ background:var(--sunken); }
.sbc-ib .ico{ width:16px; height:16px; }
.sbc-list{ flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:6px; min-height:0; }
.sbc-it{ position:relative; display:flex; gap:8px; align-items:flex-start; padding:8px 26px 8px 8px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface); color:var(--text); cursor:pointer; font-size:var(--fs-sm); line-height:1.35; }
.sbc-it:hover{ border-color:var(--accent); background:var(--accent-soft); }
.sbc-it.next{ border-color:var(--accent); box-shadow:inset 3px 0 0 var(--accent); }
.sbc-it.used .sbc-t{ color:var(--text-3); }
.sbc-it.used .sbc-tag{ opacity:.5; }
.sbc-it.flash{ animation:sbcFlash .9s ease-out; }
@keyframes sbcFlash{ from{ background:#FFE94D; } to{ background:var(--surface); } }
.sbc-t{ flex:1; min-width:0; overflow-wrap:anywhere; }
.sbc-tick{ position:absolute; right:6px; bottom:6px; color:var(--ok); }
.sbc-tick .ico{ width:14px; height:14px; stroke-width:3; }
.sbc-next{ position:absolute; right:6px; bottom:5px; font:700 10px var(--font); color:var(--accent-ink); text-transform:uppercase; letter-spacing:.04em; }
.sbc-x{ position:absolute; right:3px; top:3px; width:20px; height:20px; border:0; background:none; border-radius:4px; cursor:pointer; color:var(--text-3); display:grid; place-items:center; padding:0; opacity:0; }
.sbc-it:hover .sbc-x{ opacity:1; }
.sbc-x:hover{ background:var(--danger-soft); color:var(--danger); }
.sbc-x .ico{ width:13px; height:13px; }
.sbc-help{ flex:none; margin:0; padding:8px 12px 10px; font-size:var(--fs-xs); color:var(--text-3); border-top:1px solid var(--border); }
.sbc-list + .sbc-help{ }
.ed-sbclip > .sbc-help:only-of-type{ border-top:0; }
.sbi-back{ position:fixed; inset:0; z-index:75; background:rgba(17,17,20,.45); display:grid; place-items:center; padding:20px; }
.sbi{ width:min(1180px, 100%); height:min(760px, 100%); background:var(--surface); border-radius:var(--r-lg); box-shadow:var(--shadow-float); display:flex; flex-direction:column; overflow:hidden; }
.sbi-h{ display:flex; align-items:center; gap:8px; padding:14px 16px 10px; }
.sbi-t{ flex:1; min-width:0; display:flex; flex-direction:column; }
.sbi-t b{ font-size:var(--fs-lg); }
.sbi-name{ font-size:var(--fs-sm); color:var(--text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sbi-bar{ display:flex; align-items:center; gap:12px; padding:0 16px 10px; flex-wrap:wrap; border-bottom:1px solid var(--border); }
.sbi-ver{ display:inline-flex; border:1px solid var(--border-strong); border-radius:var(--r); overflow:hidden; }
.sbi-ver button{ border:0; background:var(--surface); padding:6px 12px; cursor:pointer; font:500 var(--fs-sm) var(--font); border-right:1px solid var(--border); }
.sbi-ver button:last-child{ border-right:0; }
.sbi-ver button.on{ background:var(--accent-soft); color:var(--accent-ink); }
.sbi-grow{ flex:1; }
.sbi-phon{ display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); cursor:pointer; }
.sbi-phon:has(input:disabled){ color:var(--text-3); cursor:default; }
.sbi-info{ font-size:var(--fs-xs); color:var(--text-3); }
.sbi-stage{ flex:1; position:relative; overflow:hidden; background:#e9e9ee; min-height:0; }
.sbi-scale{ position:absolute; left:0; top:0; transform-origin:0 0; box-shadow:0 2px 12px rgba(0,0,0,.14); }
.sbi-stage.pick .sb-it, .sbi-stage.pick .sb-h{ cursor:pointer; }
.sbi-stage.pick .sb-it:hover{ outline:2px dashed var(--accent); outline-offset:1px; }
.sbi-stage.pick .sb-it.gap{ background:#fff4c2; }
`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'sv-sbed-css', textContent:CSS }));

window.SVSbEd = { mount, enter, sync, back, ribbon, action, keydown, openInsert, paintClip,
  _:{ copyText, picked, setBuilder, st, useEntry, slidePng, get D(){ return D; } } };
})();
