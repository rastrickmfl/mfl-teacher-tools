/* =====================================================================
   Slideshow Viewer — print export
   Loaded after app.js. Uses window.SVCore (deck views, stage, saved data).
   Opened from the editor's top bar (Print) or the dashboard ⋯ menu
   (Print LSA pack…): SVPrint.open(lessonId, { slide, lsaOnly }).

   Formats (all printed with the browser's own dialog → printer or Save as PDF):
     2x2     A4 landscape, one slide four times, 5 mm side / 8 mm top-bottom margins,
             3 mm gap + cut marks,
             class code badge once, top right of the page.
     single  A4 landscape, one slide as large as fits, class code badge top right.
     lsa     A4 portrait, two slides per page with ruled lines under each.
             Slides hidden in PowerPoint are left out, plus any unticked here.
             Header on the first page: deck title, class, date, period.
   Print preview: tap an item's label to switch it on/off for printing.
     Defaults: cover boxes and Can-hide objects print; Hidden-at-start don't.
   Saved per lesson in viewer-data.json:
     l.print[mode].obj[slide][key] = true/false  (only where it differs from the default;
                                                  key 'o'+oid or 'c'+coverId)
     l.print[mode].skip = [slide indexes]       (unticked for the LSA pack)
     l.printCode = class code typed over the timetable's (only if changed)
   Pen annotations are never printed.

   Printer Stack (v1.30): a day's printing as one document.
     Print preview → "Add to <Day>'s Printer Stack" asks how many pupils (2x2 / single,
     pre-filled from the class list) or copies (LSA pack, default 1).
     Saved on the lesson, so the stack is the lesson's own day:
       l.stack = [{ id, fmt, mode, slide (2x2/single only), n, added, printed }]
       printed = time ticked by hand (v1.30.2: no longer set automatically after printing)
       n = pupils (2x2 → ceil(n/4) sheets, single → n sheets) or LSA pack copies.
     Items are recipes, not stored PDFs: the stack prints the deck's current state
     and print choices. Dashboard: bar under the day tabs → SVPrint.openStack(date).
     Print stack builds every item's pages (copies as repeated pages, in period order)
     into one document with mixed orientation (named @pages) → one print dialog.
     v1.40: it.day (optional) = the day the item was moved to in the Printing Centre
     (printcentre.js), which now holds the day's stack; openStack(date) opens it there.
   ===================================================================== */
(function(){
'use strict';
const C = ()=>window.SVCore;
const MM = 96/25.4; // CSS px per mm
const A4L = { w:297, h:210 }, A4P = { w:210, h:297 };
const FMT_NAMES = { '2x2':'2×2', single:'Single slide', lsa:'LSA pack' };
let S = null; // the open preview

/* ---------- saved print choices ---------- */
function itemsOf(l, mode, i){
  const cfg = C().hideCfg(l, mode, i), out = [];
  for(const [oid, st] of Object.entries(cfg.obj || {})) out.push({ key:'o'+oid, kind:st, oid, oids:C().revealOids(cfg, oid) }); // v1.63: oids = the whole group
  for(const cv of (cfg.covers || [])) out.push({ key:'c'+cv.id, kind:'cover', cover:cv });
  if(gapAct(l, mode, i)) out.push({ key:'ans', kind:'answers' }); // v1.49: Gap Fill answers (off by default)
  return out;
}
function gapAct(l, mode, i){
  const e = ((l.slides && l.slides[mode]) || []).find(x=>String(x.k)===String(i));
  return e && e.src && e.src.act && e.src.act.type==='gapfill' ? e.src.act : null;
}
const defaultOn = kind => kind!=='hide' && kind!=='answers';
function isOn(l, mode, i, it){
  const o = l.print && l.print[mode] && l.print[mode].obj && l.print[mode].obj[i];
  return o && typeof o[it.key]==='boolean' ? o[it.key] : defaultOn(it.kind);
}
function bucket(l, mode){
  if(!l.print || typeof l.print!=='object') l.print = {};
  const p = l.print[mode] = l.print[mode] || {};
  if(!p.obj || typeof p.obj!=='object') p.obj = {};
  if(!Array.isArray(p.skip)) p.skip = [];
  return p;
}
function tidy(l, mode){
  const p = l.print && l.print[mode]; if(!p) return;
  for(const k of Object.keys(p.obj || {})) if(!Object.keys(p.obj[k]).length) delete p.obj[k];
  if(p.obj && !Object.keys(p.obj).length) delete p.obj;
  if(p.skip && !p.skip.length) delete p.skip;
  if(!Object.keys(p).length) delete l.print[mode];
  if(!Object.keys(l.print).length) delete l.print;
}
function setOn(l, mode, i, it, on){
  const p = bucket(l, mode);
  const o = p.obj[i] = p.obj[i] || {};
  if(on===defaultOn(it.kind)) delete o[it.key]; else o[it.key] = on;
  tidy(l, mode); C().saveSoon();
}
function skipped(l, mode){ const p = l.print && l.print[mode]; return new Set((p && p.skip) || []); }
function setSkipped(l, mode, i, skip){
  const p = bucket(l, mode), s = new Set(p.skip);
  if(skip) s.add(i); else s.delete(i);
  p.skip = [...s].sort((a,b)=>String(a).localeCompare(String(b), 'en', { numeric:true }));
  tidy(l, mode); C().saveSoon();
}
function isExtra(l){ return /^x/.test(l.slotId || ''); }
function defaultCode(l){ return isExtra(l) ? '' : (l.label || ''); }
function classCode(l){ return typeof l.printCode==='string' ? l.printCode : defaultCode(l); }
function setCode(l, v){ v = String(v || '').slice(0, 40); if(v===defaultCode(l)) delete l.printCode; else l.printCode = v; C().saveSoon(); }
// Slides are named by key (app.js slideList): v.keys is the lesson's order, without deleted slides.
function lsaSlides(l, mode, v){ const sk = skipped(l, mode); return v.keys.filter(i=>!v.isHidden(i) && !sk.has(i)); }
const num = (l, mode, k)=>{ const n = C().slideNum(l, mode, k); return n==null ? '?' : n; };

/* ---------- rendering one slide into a box (mm) ---------- */
function fit(v, i, maxW, maxH){ const { w, h } = v.size(i); const k = Math.min(maxW/w, maxH/h); return { w:w*k, h:h*k }; }
async function pdfCanvas(v, i, pxW){
  const page = await (v.pdfPage ? v.pdfPage(i) : v.doc.getPage(i+1));
  const vp1 = page.getViewport({ scale:1 }), scale = pxW / vp1.width, vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext:c.getContext('2d'), viewport:vp }).promise;
  return c;
}
// ctx: { l, mode, v, hi (print quality), pdfCache: Map }
function slideBox(ctx, i, wMm, hMm){
  const { l, mode, v } = ctx, core = C();
  const box = core.el('div', 'pr-slide'); box.dataset.i = i;
  box.style.width = wMm + 'mm'; box.style.height = hMm + 'mm';
  const { w, h } = v.size(i), k = (wMm*MM) / w;
  const inner = core.el('div', 'pr-inner');
  inner.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:scale(${k});transform-origin:0 0`;
  let ready = Promise.resolve();
  if(v.type==='pdf'){
    const pxW = Math.round(wMm * (ctx.hi === 'quick' ? 150/25.4 : ctx.hi ? 250/25.4 : 2.4*MM)); // 'quick' = Save PDF (150 dpi)
    const key = i + '@' + pxW;
    if(!ctx.pdfCache.has(key)) ctx.pdfCache.set(key, pdfCanvas(v, i, pxW));
    const page = core.el('div'); page.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:#fff`;
    const c = document.createElement('canvas'); c.style.cssText = 'width:100%;height:100%;display:block'; page.appendChild(c);
    inner.appendChild(page);
    ready = ctx.pdfCache.get(key).then(src=>{ c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); }).catch(()=>{});
  } else {
    const r = v.render(i, { thumb:true, edits:Object.assign({}, core.editsOf(l, mode, i), { noTools:true }) }); // v1.68: tool icons don't print
    core.dropDeletedEl(r.el, l, mode, i);
    inner.appendChild(r.el);
  }
  for(const it of itemsOf(l, mode, i)){
    const on = isOn(l, mode, i, it);
    if(it.kind==='cover'){
      if(!on) continue;
      const cv = it.cover, d = core.el('div', 'cover');
      Object.assign(d.style, { left:cv.x+'px', top:cv.y+'px', width:cv.w+'px', height:cv.h+'px', background:cv.color || '#fff' });
      inner.appendChild(d);
    } else if(it.kind==='answers'){
      inner.querySelectorAll('.gf').forEach(x=>x.classList.toggle('gf-show', on));
    } else if(!on){
      for(const id of it.oids){ const e = inner.querySelector(`[data-oid="${CSS.escape(id)}"]`); if(e) e.classList.add('pptx-hidden'); }
    }
  }
  box.appendChild(inner);
  return { el:box, ready };
}

/* ---------- pages ---------- */
function page(orient){ const p = C().el('div', 'pr-page ' + orient); return p; }
function place(e, x, y){ e.style.left = x + 'mm'; e.style.top = y + 'mm'; return e; }
function badge(code){ const b = C().el('div', 'pr-badge'); b.textContent = code; return b; }
function line(cls, x, y, len){ const d = C().el('div', 'pr-cut ' + cls); place(d, x, y); d.style[cls==='v' ? 'height' : 'width'] = len + 'mm'; return d; }
// Returns { pages:[el], ready:Promise }
function build(fmt, ctx){
  const { l, v } = ctx, code = classCode(l), readies = [], pages = [];
  if(fmt==='2x2'){
    const i = ctx.slide, p = page('landscape');
    // v1.25.1 margins: 5 mm at the sides, 8 mm top/bottom, 3 mm gap between slides (1.5 mm each side of the centre lines).
    const qw = A4L.w/2, qh = A4L.h/2, SX = 5, SY = 8, G = 1.5;
    const aw = qw-SX-G, ah = qh-SY-G;
    const s = fit(v, i, aw, ah);
    for(const [c, r] of [[0,0],[1,0],[0,1],[1,1]]){
      const ax = c ? qw+G : SX, ay = r ? qh+G : SY;
      const b = slideBox(ctx, i, s.w, s.h); readies.push(b.ready);
      p.appendChild(place(b.el, ax + (aw-s.w)/2, ay + (ah-s.h)/2));
    }
    // Cut marks on the centre lines: at the page edges and a cross in the middle.
    p.append(line('v', qw, 0, 6), line('v', qw, A4L.h-6, 6), line('h', 0, qh, 6), line('h', A4L.w-6, qh, 6),
             line('v', qw, qh-3, 6), line('h', qw-3, qh, 6));
    if(code) p.appendChild(badge(code));
    pages.push(p);
  } else if(fmt==='single'){
    const i = ctx.slide, p = page('landscape'), M = 10;
    const s = fit(v, i, A4L.w-2*M, A4L.h-2*M);
    const b = slideBox(ctx, i, s.w, s.h); readies.push(b.ready);
    p.appendChild(place(b.el, (A4L.w-s.w)/2, (A4L.h-s.h)/2));
    if(code) p.appendChild(badge(code));
    pages.push(p);
  } else {
    const list = lsaSlides(l, ctx.mode, v);
    const M = 12, HEAD = 15, GAP = 7, SL_GAP = 4, LINE = 8, MIN_LINES = 30;
    const cw = A4P.w - 2*M;
    const slotH1 = (A4P.h - 2*M - HEAD - GAP)/2; // first page has the header: size every slide from it
    for(let n=0; n<list.length; n+=2){
      const p = page('portrait'), first = n===0;
      const top = M + (first ? HEAD : 0);
      const slotH = (A4P.h - M - top - GAP)/2;
      if(first){
        const hd = C().el('div', 'pr-head'); place(hd, M, M); hd.style.width = cw + 'mm';
        const d = new Date(l.date + 'T00:00:00');
        const when = isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
        const per = l.period && !['Extra','—'].includes(l.period) ? l.period : '';
        hd.innerHTML = `<div class="t"></div><div class="m"></div>`;
        // Deck copies are named "<date> <period> <class> - <file>", so drop that prefix from the title.
        hd.querySelector('.t').textContent = (l.title || '').trim() || C().lessonTitle(l).replace(/^\d{4}-\d{2}-\d{2} .*? - /, '');
        hd.querySelector('.m').textContent = [code, when, per].filter(Boolean).join(' · ');
        p.appendChild(hd);
      }
      for(let k=0; k<2 && n+k<list.length; k++){
        const i = list[n+k], y0 = top + k*(slotH + GAP);
        const s = fit(v, i, cw, slotH1 - SL_GAP - MIN_LINES);
        const b = slideBox(ctx, i, s.w, s.h); readies.push(b.ready);
        p.appendChild(place(b.el, M + (cw - s.w)/2, y0));
        // Ruled lines from under the slide to the bottom of the slot.
        for(let y = y0 + s.h + SL_GAP + LINE; y <= y0 + slotH + 0.01; y += LINE) p.appendChild(line('h rule', M, y, cw));
      }
      pages.push(p);
    }
  }
  return { pages, ready:Promise.all(readies) };
}
async function settle(root){
  if(window.PPTX) PPTX.fitText(root);
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map(im=>im.complete && im.naturalWidth ? null : (im.decode ? im.decode().catch(()=>{}) : null)));
  if(document.fonts && document.fonts.ready) await document.fonts.ready;
}

/* ---------- printing ---------- */
function fileName(){
  const { l, fmt } = S;
  const per = l.period && !['Extra','—'].includes(l.period) ? l.period : '';
  const tag = fmt==='2x2' ? '2x2' : fmt==='single' ? 'Slide' + num(l, S.mode, S.slide) : 'LSA-pack';
  return [classCode(l), l.date, per, tag].filter(Boolean).join('_').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
}
function newPrintRoot(){
  const old = document.getElementById('pr-print'); if(old) old.remove();
  const root = C().el('div'); root.id = 'pr-print';
  document.body.appendChild(root);
  return root;
}
// Shared by Print and Print stack: page CSS + file name, print dialog, then tidy up.
async function runPrint(root, title, pageCss, done){
  const st = document.createElement('style'); st.id = 'pr-page-style';
  st.textContent = pageCss;
  document.head.appendChild(st);
  const oldTitle = document.title; document.title = title;
  document.body.classList.add('sv-printing');
  let fin = false;
  const cleanup = ()=>{
    if(fin) return; fin = true;
    window.removeEventListener('afterprint', cleanup);
    document.body.classList.remove('sv-printing'); document.title = oldTitle; st.remove(); root.remove();
    if(done) done();
  };
  window.addEventListener('afterprint', cleanup);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(window.__svPrintHold){ window.__svPrintCleanup = cleanup; return; } // automated checks: inspect, then call cleanup
  window.print();
  setTimeout(cleanup, 500);
}
async function doPrint(){
  if(!S || S.busy) return;
  const btn = S.root.querySelector('[data-pr=print]');
  S.busy = true; btn.disabled = true; btn.lastChild.textContent = 'Preparing…';
  const root = newPrintRoot();
  const ctx = { l:S.l, mode:S.mode, v:S.v, slide:S.slide, hi:true, pdfCache:new Map() };
  const b = build(S.fmt, ctx);
  root.append(...b.pages);
  try{ await b.ready; await settle(root); }catch(e){ console.warn(e); }
  await runPrint(root, fileName(), `@page{ size:A4 ${S.fmt==='lsa' ? 'portrait' : 'landscape'}; margin:0; }`, ()=>{
    if(S){ S.busy = false; btn.disabled = false; btn.lastChild.textContent = 'Print'; syncPrintBtn(); }
  });
}

/* ---------- preview screen ---------- */
function fmtPref(){ try{ const f = localStorage.getItem('sv_printfmt'); return f==='single' ? 'single' : '2x2'; }catch(e){ return '2x2'; } }
function setFmtPref(f){ try{ if(f!=='lsa') localStorage.setItem('sv_printfmt', f); }catch(e){} }

async function open(id, opts){
  opts = opts || {};
  const core = C(), l = core.data.lessons[id];
  if(!l || !l.mode) return;
  let v;
  try{ v = await core.getDeck(l, l.mode); }
  catch(e){ core.toast("Couldn't open the deck: " + e.message, true); return; }
  close(true);
  const lsaOnly = !!opts.lsaOnly;
  const fmt = lsaOnly ? 'lsa' : (opts.format || fmtPref());
  const slide = opts.slide!=null && v.has(opts.slide) ? core.skey(opts.slide) : v.keys[0];
  const root = core.el('div', 'pr-wrap');
  root.innerHTML = `
    <div class="pr-top">
      <button class="btn" data-pr="back">${core.icon('left')}Back</button>
      <span class="pr-title">${lsaOnly ? 'Print LSA pack' : 'Print'}</span>
      ${lsaOnly ? '' : `<span class="seg pr-fmt">${['2x2','single','lsa'].map(f=>`<button data-pr="fmt" data-v="${f}">${FMT_NAMES[f]}</button>`).join('')}</span>`}
      <label class="pr-code">Class code <input type="text" maxlength="40" spellcheck="false"></label>
      <span class="pr-hint"></span>
      <span class="grow"></span>
      <button class="btn" data-pr="stack">${STACK_IC}<span></span></button>
      <button class="btn primary" data-pr="print">${core.icon('print')}<span>Print</span></button>
    </div>
    <div class="pr-main">
      <div class="pr-strip"></div>
      <div class="pr-centre"><div class="pr-stage" id="pr-stage"></div><div class="pr-legend"></div></div>
      <div class="pr-pages"><div class="pr-pages-in"></div></div>
    </div>`;
  document.body.appendChild(root);
  S = { l, mode:l.mode, v, fmt, slide, cur:slide, lsaOnly, root, prevView:core.view, pdfCache:new Map(), gen:0, onClose:opts.onClose || null };
  core.view = { name:'print' };
  const inp = root.querySelector('.pr-code input');
  inp.value = classCode(l);
  inp.placeholder = isExtra(l) ? 'e.g. 10A/Fr1' : '';
  let codeT = null;
  inp.addEventListener('input', ()=>{ setCode(l, inp.value.trim()); clearTimeout(codeT); codeT = setTimeout(renderPages, 250); });
  root.addEventListener('click', e=>{
    const b = e.target.closest('[data-pr]'); if(!b) return;
    const a = b.dataset.pr;
    if(a==='back') close();
    else if(a==='print') doPrint();
    else if(a==='stack') addToStack();
    else if(a==='fmt'){ S.fmt = b.dataset.v; setFmtPref(S.fmt); if(S.fmt!=='lsa') S.cur = S.slide; setup(); }
  });
  S.stage = new core.Stage(root.querySelector('#pr-stage'));
  S.stage.onfit = S.stage.onmove = ()=>drawToggles();
  setup();
}
function close(quiet){
  if(!S) return;
  const core = C(), after = S.onClose;
  try{ S.stage.destroy(); }catch(e){}
  S.root.remove();
  core.view = S.prevView;
  S = null;
  if(!quiet) core.saveSoon(200);
  if(after) try{ after(); }catch(e){ console.warn(e); } // e.g. the Printing Centre refreshes its list
}
// Format changed (or first open): strip, centre slide, pages.
function setup(){
  const core = C(), { root, l, mode, v } = S;
  root.classList.toggle('lsa', S.fmt==='lsa');
  core.$$('[data-pr=fmt]', root).forEach(b=>b.classList.toggle('on', b.dataset.v===S.fmt));
  if(S.fmt==='lsa'){
    const list = v.keys.filter(i=>!v.isHidden(i));
    if(!list.includes(S.cur)) S.cur = list[0] != null ? list[0] : 0;
    buildStrip();
  } else {
    S.cur = S.slide;
    root.querySelector('.pr-strip').innerHTML = '';
  }
  showCentre();
  renderPages();
}
function buildStrip(){
  const core = C(), { root, l, mode, v } = S;
  const strip = root.querySelector('.pr-strip'); strip.innerHTML = '';
  const sk = skipped(l, mode);
  const head = core.el('div', 'pr-strip-head'); strip.appendChild(head);
  v.keys.forEach((i, pos)=>{
    const hid = v.isHidden(i);
    const b = core.el('div', 'pr-th' + (hid ? ' hid' : '') + (sk.has(i) ? ' off' : '') + (i===S.cur ? ' on' : ''));
    b.dataset.i = i;
    b.innerHTML = `<span class="n">${pos+1}</span><div class="th"></div>`;
    const th = b.querySelector('.th');
    if(hid){ const t = core.el('span', 'pr-tag', 'Hidden slide'); th.appendChild(t); b.title = 'Hidden slide (skipped when presenting), so not in the LSA pack'; }
    else {
      const cb = core.el('button', 'pr-tick'); cb.title = 'Include in the LSA pack';
      cb.innerHTML = lucideSvg('check', 'ico');
      cb.onclick = e=>{ e.stopPropagation(); const now = !skipped(l, mode).has(i); setSkipped(l, mode, i, now); b.classList.toggle('off', now); stripHead(); renderPages(); };
      th.appendChild(cb);
      b.onclick = ()=>{ S.cur = i; core.$$('.pr-th', strip).forEach(x=>x.classList.toggle('on', core.skey(x.dataset.i)===i)); showCentre(); };
    }
    strip.appendChild(b);
    core.mountThumb(th, v, i, 132, l, mode);
  });
  stripHead();
}
function stripHead(){
  const { root, l, mode, v } = S, h = root.querySelector('.pr-strip-head'); if(!h) return;
  const n = lsaSlides(l, mode, v).length;
  h.textContent = `${n} slide${n===1?'':'s'} · ${Math.ceil(n/2)} page${Math.ceil(n/2)===1?'':'s'}`;
}
function showCentre(){
  const core = C(), { l, mode, v } = S, i = S.cur;
  S.stage.show(v, i, Object.assign({}, core.editsOf(l, mode, i), { noTools:true })); // v1.68: tool icons don't print
  core.dropDeleted(S.stage, l, mode, i);
  paintCentre();
}
// Not-printed objects show faintly; cover boxes show solid when printed, outlined when not.
function paintCentre(){
  const core = C(), { l, mode } = S, i = S.cur, st = S.stage;
  core.$$('.cover', st.scale).forEach(c=>c.remove());
  const items = itemsOf(l, mode, i);
  for(const it of items){
    const on = isOn(l, mode, i, it);
    if(it.kind==='cover'){
      const cv = it.cover, d = core.el('div', 'cover' + (on ? '' : ' pr-cover-off'));
      Object.assign(d.style, { left:cv.x+'px', top:cv.y+'px', width:cv.w+'px', height:cv.h+'px', background:on ? (cv.color || '#fff') : 'transparent' });
      st.scale.appendChild(d);
    } else if(it.kind==='answers'){
      st.slideEl.querySelectorAll('.gf').forEach(x=>x.classList.toggle('gf-show', on));
    } else {
      for(const id of it.oids){ const e = st.slideEl.querySelector(`[data-oid="${CSS.escape(id)}"]`); if(e) e.classList.toggle('pr-ghost', !on); }
    }
  }
  const leg = S.root.querySelector('.pr-legend');
  leg.textContent = items.length
    ? 'Tap a label to print or leave out that item. Your choices are saved for this slide.'
    : 'Nothing on this slide is hidden or covered, so it prints as it is.';
  const hint = S.root.querySelector('.pr-hint');
  hint.textContent = S.fmt==='lsa' ? 'Untick slides to leave them out. Hidden slides are skipped.' : `Slide ${num(S.l, S.mode, i)}`;
  drawToggles();
}
const KIND_LABEL = { hide:'Hidden at start', toggle:'Can hide', cover:'Cover box', answers:'Gap Fill answers' };
// Where a Gap Fill's text sits (gapfill.js area()), for its Answers pill.
function gapBox(v, i){ const z = v.rawSize ? v.rawSize(i) : v.size(i), dx = v.dx ? v.dx(i) : 0; const W = z.w + 2*dx; return { x:W*0.035, y:z.h*0.125, w:W*0.93, h:z.h*0.843 }; } // v1.88: the whole frame, as gapfill.js lays it out
function drawToggles(){
  if(!S) return;
  const core = C(), { l, mode } = S, i = S.cur, st = S.stage, ui = st.ui;
  ui.innerHTML = '';
  if(!st.slideEl) return;
  const k = st.k;
  for(const it of itemsOf(l, mode, i)){
    const r = it.kind==='cover' ? it.cover : it.kind==='answers' ? gapBox(S.v, i) : core.objBoxAll({ stage:st }, it.oids);
    if(!r) continue;
    const on = isOn(l, mode, i, it);
    const box = core.el('div', 'pr-box' + (on ? ' on' : ''));
    Object.assign(box.style, { left:(r.x*k)+'px', top:(r.y*k)+'px', width:Math.max(r.w*k, 8)+'px', height:Math.max(r.h*k, 8)+'px' });
    const b = core.el('button', 'pr-pill' + (on ? ' on' : ''));
    b.innerHTML = core.icon(on ? 'eye' : 'eyeOff') + `<span>${it.kind==='answers' ? (on ? 'Answers printed' : 'Answers not printed') : on ? 'Printed' : 'Not printed'}</span>`;
    b.title = KIND_LABEL[it.kind] + ' — tap to ' + (on ? 'leave it out' : 'print it');
    // Sits on the box's top edge, so it covers as little of the item as possible.
    b.style.left = Math.max(2, r.x*k + 6) + 'px'; b.style.top = Math.max(2, r.y*k - 12) + 'px';
    b.onclick = e=>{ e.stopPropagation(); setOn(l, mode, i, it, !on); paintCentre(); refreshSlide(i); };
    ui.append(box, b);
  }
}

/* ---------- page previews (right-hand column) ---------- */
function renderPages(){
  if(!S) return;
  const core = C(), host = S.root.querySelector('.pr-pages-in');
  const gen = ++S.gen;
  host.innerHTML = '';
  const ctx = { l:S.l, mode:S.mode, v:S.v, slide:S.slide, hi:false, pdfCache:S.pdfCache };
  const b = build(S.fmt, ctx);
  const colW = Math.max(200, host.clientWidth || 340);
  if(!b.pages.length){ host.appendChild(core.el('div', 'pr-empty', 'No slides ticked.')); }
  b.pages.forEach((p, n)=>{
    const land = p.classList.contains('landscape'), pw = (land ? A4L.w : A4P.w)*MM, ph = (land ? A4L.h : A4P.h)*MM;
    const sc = colW / pw;
    const hold = core.el('div', 'pr-hold'); hold.style.width = colW + 'px'; hold.style.height = (ph*sc) + 'px';
    p.style.transform = `scale(${sc})`; p.style.transformOrigin = '0 0';
    hold.appendChild(p);
    const cap = core.el('div', 'pr-cap', `Page ${n+1} of ${b.pages.length}`);
    host.append(hold, cap);
  });
  if(window.PPTX) PPTX.fitText(host);
  syncPrintBtn();
  b.ready.then(()=>{ if(S && S.gen===gen) S.root.dataset.ready = gen; });
}
// One slide's print settings changed: redraw just its boxes on the pages.
function refreshSlide(i){
  if(!S) return;
  if(S.fmt!=='lsa'){ renderPages(); return; }
  const ctx = { l:S.l, mode:S.mode, v:S.v, hi:false, pdfCache:S.pdfCache };
  for(const old of C().$$(`.pr-pages-in .pr-slide[data-i="${i}"]`, S.root)){
    const b = slideBox(ctx, i, parseFloat(old.style.width), parseFloat(old.style.height));
    b.el.style.left = old.style.left; b.el.style.top = old.style.top;
    old.replaceWith(b.el);
    if(window.PPTX) PPTX.fitText(b.el);
  }
}
function syncPrintBtn(){
  if(!S) return;
  const btn = S.root.querySelector('[data-pr=print]');
  const empty = S.fmt==='lsa' && !lsaSlides(S.l, S.mode, S.v).length;
  if(!S.busy) btn.disabled = empty;
  const sb = S.root.querySelector('[data-pr=stack]');
  if(sb){
    const has = !!findItem(S.l, { fmt:S.fmt, mode:S.mode, slide:S.slide });
    sb.lastChild.textContent = `${has ? 'Update in' : 'Add to'} ${dayName(S.l.date)}'s Printer Stack`;
    sb.classList.toggle('ps-in', has);
    sb.disabled = empty;
  }
}

/* ---------- Printer Stack ---------- */
const STACK_IC = lucideSvg('layers', 'ico');
const dateOf = ds => new Date(ds + 'T00:00:00');
function dayName(ds){ const d = dateOf(ds); return isNaN(d) ? 'this day' : d.toLocaleDateString('en-GB', { weekday:'long' }); }
function dayLong(ds){ const d = dateOf(ds); return isNaN(d) ? ds : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' }); }
const plural = (n, w, ws) => `${n} ${n===1 ? w : (ws || w + 's')}`;
const stackKey = it => it.fmt + '|' + it.mode + (it.fmt==='lsa' ? '' : '|' + it.slide);
function findItem(l, it){ const k = stackKey(it); return (Array.isArray(l.stack) ? l.stack : []).find(x=>stackKey(x)===k) || null; }
function classSize(l){
  const SC = window.SVClasses; if(!SC) return null;
  const k = SC.classFor(l); return k ? { cls:k, n:SC.active(k).length } : null;
}
// Sheets of paper for one item. lsaPages: pages in one LSA pack (needs the deck).
function sheetsFor(it, lsaPages){
  const n = Math.max(0, Math.floor(Number(it.n) || 0));
  return it.fmt==='2x2' ? Math.ceil(n/4) : it.fmt==='single' ? n : lsaPages==null ? null : n * lsaPages;
}
function itemWhat(it, l){ return it.fmt==='lsa' ? 'LSA pack' : `${FMT_NAMES[it.fmt]} · slide ${l ? num(l, it.mode, it.slide) : (typeof it.slide==='number' ? it.slide + 1 : '?')}`; }
function resultText(it, lsaPages){
  const n = Math.max(0, Math.floor(Number(it.n) || 0)), sh = sheetsFor(it, lsaPages);
  if(it.fmt==='2x2') return `${plural(sh, 'sheet')} · ${n ? sh*4 + ' handouts' : ''}`.replace(/ · $/, '');
  if(it.fmt==='single') return plural(sh, 'sheet');
  return lsaPages==null ? plural(n, 'copy', 'copies') : `${plural(n, 'copy', 'copies')} × ${plural(lsaPages, 'page')} = ${plural(sh, 'sheet')}`;
}
function setStackItem(l, it){
  const list = Array.isArray(l.stack) ? l.stack : [], k = stackKey(it);
  const i = list.findIndex(x=>stackKey(x)===k);
  if(i>=0) list[i] = Object.assign(list[i], { n:it.n, printed:null }); else list.push(it);
  l.stack = list;
}
function removeStackItem(l, id){
  if(!Array.isArray(l.stack)) return;
  l.stack = l.stack.filter(x=>x.id!==id);
  if(!l.stack.length) delete l.stack;
}
// Every item on a day, in timetable order (then the order they were added).
// An item's day is its lesson's day, unless it was moved in the Printing Centre (it.day).
const itemDay = (l, it) => it.day || l.date;
function stackItems(ds){
  const out = [];
  for(const l of Object.values(C().data.lessons)){
    if(!Array.isArray(l.stack)) continue;
    for(const it of l.stack) if(itemDay(l, it)===ds) out.push({ l, it });
  }
  return out.sort((a,b)=>(a.l.start || '99:99').localeCompare(b.l.start || '99:99') || (a.it.added || 0) - (b.it.added || 0));
}
function stackCount(ds){ return stackItems(ds).length; }
// Every lesson item on any day: [{ l, it, day }] (Printing Centre: unprinted items from earlier days).
function allStackItems(){
  const out = [];
  for(const l of Object.values(C().data.lessons)) if(Array.isArray(l.stack)) for(const it of l.stack) out.push({ l, it, day:itemDay(l, it) });
  return out;
}
function refreshDash(){ const core = C(); if(core.view && core.view.name==='dash') core.renderDashboard(); else if(window.SVPrintCentre) SVPrintCentre.refresh(); }
// − [n] + control, used by the add dialog and the stack rows.
function stepperHTML(n){ return `<span class="ps-step"><button type="button" data-s="-1" aria-label="Fewer">−</button><input type="number" min="1" max="300" inputmode="numeric" value="${n==null || n==='' ? '' : Number(n)}"><button type="button" data-s="1" aria-label="More">+</button></span>`; }
function wireStepper(wrap, onChange){
  const inp = wrap.querySelector('input');
  const val = ()=>Math.min(300, Math.max(0, Math.floor(Number(inp.value) || 0)));
  wrap.querySelectorAll('[data-s]').forEach(b=>b.onclick = ()=>{ inp.value = Math.max(1, Math.min(300, val() + Number(b.dataset.s))); onChange(val()); });
  inp.addEventListener('input', ()=>onChange(val()));
  return { inp, val };
}

// Print preview → "Add to Monday's Printer Stack".
function addToStack(){
  if(!S) return;
  const core = C(), { l, fmt, mode, v } = S;
  const isLsa = fmt==='lsa';
  const base = { fmt, mode, slide:isLsa ? null : S.slide };
  const existing = findItem(l, base);
  const size = isLsa ? null : classSize(l);
  const lsaPages = isLsa ? Math.ceil(lsaSlides(l, mode, v).length/2) : null;
  const day = dayName(l.date), code = classCode(l) || l.label || 'Extra';
  const start = existing ? existing.n : isLsa ? 1 : (size ? size.n : '');
  const src = isLsa ? 'One copy per LSA.'
    : size ? `From the ${size.cls} class list (${plural(size.n, 'pupil')}).`
    : 'No class list for this lesson, so type the number.';
  core.modal(`<h2>Add to ${core.esc(day)}'s Printer Stack</h2>
    <p>${core.esc(code)} · ${core.esc(core.lessonTitle(l))} · ${core.esc(itemWhat(base, l))}</p>
    <div class="ps-ask"><span class="ps-q">${isLsa ? 'How many copies?' : 'How many pupils?'}</span>${stepperHTML(start)}</div>
    <div class="ps-src">${core.esc(src)}</div>
    <div class="ps-out"></div>
    ${existing ? `<p class="ps-note">Already in the stack for ${plural(existing.n, isLsa ? 'copy' : 'pupil', isLsa ? 'copies' : 'pupils')}. This replaces it.</p>` : ''}
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${STACK_IC}${existing ? 'Update stack' : 'Add to stack'}</button></div>`, (m, close)=>{
    m.closest('.modal-back').classList.add('ps-back');
    const out = m.querySelector('.ps-out'), ok = m.querySelector('[data-a=ok]');
    const show = n=>{ out.textContent = n>0 ? 'Prints ' + resultText({ fmt, n }, lsaPages) : ''; ok.disabled = !(n>0); };
    const st = wireStepper(m.querySelector('.ps-step'), show);
    show(st.val());
    const save = ()=>{
      const n = st.val(); if(!(n>0)) return;
      setStackItem(l, Object.assign({ id:'k' + Math.random().toString(36).slice(2, 9), n, added:Date.now(), printed:null }, base));
      core.saveSoon(); close(); syncPrintBtn();
      core.toast(`${existing ? 'Updated in' : 'Added to'} ${day}'s Printer Stack`);
    };
    ok.onclick = save;
    m.querySelector('[data-a=no]').onclick = close;
    st.inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } });
    setTimeout(()=>{ st.inp.focus(); st.inp.select(); }, 30);
  });
}

// Dashboard: the bar under the day tabs (only when the day has something stacked).
function dashBar(ds){
  const items = stackItems(ds); if(!items.length) return '';
  const core = C(), waiting = items.filter(x=>!x.it.printed).length;
  const state = waiting===items.length ? '' : waiting ? ` · ${waiting} not printed yet` : ' · all printed';
  return `<div class="ps-bar">${STACK_IC}<span class="grow"><b>${core.esc(dayName(ds))}'s Printer Stack</b> · ${plural(items.length, 'item')}${state}</span><button class="btn sm primary" data-a="stack" data-d="${core.esc(ds)}">Open</button></div>`;
}

// Dashboard → the day's stack: change numbers, remove items, print it all as one document.
// v1.40: the Printing Centre (printcentre.js) replaces this pop-up when it's loaded.
function openStack(ds){
  if(window.SVPrintCentre) return SVPrintCentre.open(ds);
  const core = C();
  const pages = new Map(); // lesson id + mode → LSA pages (filled in as decks load)
  let close = null, M = null;
  const paint = ()=>{
    if(!M) return;
    const items = stackItems(ds), list = M.querySelector('.ps-list');
    list.innerHTML = '';
    if(!items.length){
      list.innerHTML = `<div class="ps-empty">Nothing in this stack yet. In a lesson's editor, open <b>Print</b>, choose a format and tap <b>Add to ${core.esc(dayName(ds))}'s Printer Stack</b>. For an LSA pack you can also use <b>⋯ → Print LSA pack…</b> on the dashboard.</div>`;
    }
    for(const { l, it } of items){
      const lp = it.fmt==='lsa' ? pages.get(l.id + '|' + it.mode) : null;
      const row = core.el('div', 'ps-row' + (it.printed ? ' done' : ''));
      const problem = !l.files[it.mode] ? 'Deck removed' : (it.fmt!=='lsa' && C().slideNum(l, it.mode, it.slide)==null) ? 'Slide no longer in the deck' : '';
      row.innerHTML = `<div class="ps-when"><b>${core.esc(l.period || '')}</b><small>${core.esc(l.start || '')}</small></div>
        <div class="ps-what"><div class="t">${core.esc(classCode(l) || l.label || 'Extra')} · ${core.esc(core.lessonTitle(l))}</div>
          <div class="d">${core.esc(itemWhat(it, l))}${problem ? ` <span class="tag bad">${problem}</span>` : ''}</div></div>
        <div class="ps-num">${stepperHTML(it.n)}<small>${it.fmt==='lsa' ? 'copies' : 'pupils'}</small></div>
        <div class="ps-res"></div>
        <label class="ps-done" title="Tick once this has been printed. Print unticked leaves it out."><input type="checkbox"${it.printed ? ' checked' : ''}><span>Printed</span></label>
        <button class="icon-btn" data-a="del" title="Remove from the stack">${core.icon('x')}</button>`;
      const res = row.querySelector('.ps-res');
      const showRes = ()=>{ res.textContent = resultText(it, lp); };
      showRes();
      wireStepper(row.querySelector('.ps-step'), n=>{ if(n>0){ it.n = n; core.saveSoon(); showRes(); total(); } });
      row.querySelector('.ps-done input').onchange = e=>{ it.printed = e.target.checked ? Date.now() : null; row.classList.toggle('done', !!it.printed); core.saveSoon(); total(); };
      row.querySelector('[data-a=del]').onclick = ()=>{ removeStackItem(l, it.id); core.saveSoon(); paint(); refreshDash(); };
      list.appendChild(row);
    }
    total();
  };
  const total = ()=>{
    const items = stackItems(ds);
    let sh = 0, unknown = false;
    for(const { l, it } of items){ const s = sheetsFor(it, it.fmt==='lsa' ? pages.get(l.id + '|' + it.mode) : null); if(s==null) unknown = true; else sh += s; }
    const waiting = items.filter(x=>!x.it.printed).length;
    M.querySelector('.ps-total').textContent = items.length ? `${plural(items.length, 'item')} · ${unknown ? 'counting…' : plural(sh, 'sheet') + ' of A4'}` : '';
    // None ticked: one button prints everything. Some ticked: Print unticked (the next batch) is the main button.
    const pb = M.querySelector('[data-a=print]'), nb = M.querySelector('[data-a=new]');
    const some = waiting < items.length;
    pb.disabled = !items.length;
    pb.querySelector('span').textContent = some ? `Print all (${items.length})` : 'Print stack';
    pb.classList.toggle('primary', !some || !waiting);
    nb.hidden = !(some && waiting);
    nb.innerHTML = `${core.icon('print')}<span>Print unticked (${waiting})</span>`;
    const all = M.querySelector('.ps-all');
    all.hidden = !items.length;
    const box = all.querySelector('input');
    box.checked = items.length > 0 && !waiting; box.indeterminate = some && waiting > 0;
  };
  close = core.modal(`<h2>${core.esc(dayLong(ds))} · Printer Stack</h2>
    <p>Everything here prints as one document, in period order. Choose a printer, or <b>Save as PDF</b> to print it somewhere else. Tick <b>Printed</b> on anything done, and <b>Print unticked</b> prints just the rest.</p>
    <div class="ps-tip" hidden>Did it print? Tick <b>Printed</b> (or <b>Mark all as printed</b>) so the next batch leaves these out.</div>
    <label class="ps-all" hidden><span>Mark all as printed</span><input type="checkbox"></label>
    <div class="ps-list"></div>
    <div class="foot"><span class="ps-total"></span><button class="btn" data-a="close">Close</button><button class="btn" data-a="print">${core.icon('print')}<span>Print stack</span></button><button class="btn primary" data-a="new" hidden></button></div>`, (m)=>{
    M = m;
    m.classList.add('ps-modal');
    m.closest('.modal-back').classList.add('ps-back');
    m.querySelector('[data-a=close]').onclick = ()=>{ close(); refreshDash(); };
    m.querySelector('[data-a=print]').onclick = ()=>printStack(ds, false, m);
    m.querySelector('[data-a=new]').onclick = ()=>printStack(ds, true, m);
    m.querySelector('.ps-all input').onchange = e=>{
      const now = Date.now();
      for(const { it } of stackItems(ds)) it.printed = e.target.checked ? (it.printed || now) : null;
      core.saveSoon(); paint();
    };
  });
  paint();
  // LSA packs: count their pages (needs the deck).
  for(const { l, it } of stackItems(ds)){
    if(it.fmt!=='lsa' || !l.files[it.mode]) continue;
    const k = l.id + '|' + it.mode; if(pages.has(k)) continue;
    pages.set(k, null);
    core.getDeck(l, it.mode).then(v=>{ pages.set(k, Math.ceil(lsaSlides(l, it.mode, v).length/2)); paint(); }).catch(()=>{});
  }
}

let stackBusy = false;
async function printStack(ds, onlyNew, m){
  if(stackBusy) return;
  const core = C();
  const items = stackItems(ds).filter(x=>!onlyNew || !x.it.printed);
  if(!items.length) return;
  const btn = m && m.querySelector(onlyNew ? '[data-a=new]' : '[data-a=print]');
  const label = btn ? btn.innerHTML : '';
  stackBusy = true; if(btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
  const root = newPrintRoot(), readies = [], skipped = [], sent = [];
  const decks = new Map();
  for(const { l, it } of items){
    const name = `${classCode(l) || l.label || 'Extra'} ${itemWhat(it, l)}`;
    try{
      if(!l.files[it.mode]) throw new Error('deck removed');
      const dk = l.id + '|' + it.mode;
      if(!decks.has(dk)) decks.set(dk, { v:await core.getDeck(l, it.mode), pdfCache:new Map() });
      const { v, pdfCache } = decks.get(dk);
      if(it.fmt!=='lsa' && !v.has(it.slide)) throw new Error('slide no longer in the deck');
      if(it.fmt==='lsa' && !lsaSlides(l, it.mode, v).length) throw new Error('no slides ticked');
      const ctx = { l, mode:it.mode, v, slide:it.slide, hi:true, pdfCache };
      const copies = it.fmt==='2x2' ? Math.ceil(it.n/4) : Math.max(0, Math.floor(it.n));
      for(let c=0; c<copies; c++){ const b = build(it.fmt, ctx); readies.push(b.ready); root.append(...b.pages); }
      sent.push(it);
    }catch(e){ skipped.push(`${name} (${e.message})`); }
  }
  const restore = ()=>{ stackBusy = false; if(btn){ btn.disabled = false; btn.innerHTML = label; } };
  if(!sent.length){ root.remove(); restore(); core.toast('Nothing could be printed: ' + skipped.join('; '), true); return; }
  try{ await Promise.all(readies); await settle(root); }catch(e){ console.warn(e); }
  // Mixed orientation in one document: each page picks its own named @page.
  const css = `@page{ size:A4 landscape; margin:0; } @page svL{ size:A4 landscape; margin:0; } @page svP{ size:A4 portrait; margin:0; }
    #pr-print .pr-page.landscape{ page:svL; } #pr-print .pr-page.portrait{ page:svP; }`;
  const title = `Printer-Stack_${ds}_${dayName(ds)}`;
  // Printed ticks are only ever changed by hand (Edge can't tell us whether the dialog printed or was cancelled).
  await runPrint(root, title, css, ()=>{
    restore();
    if(m && m.isConnected){ const t = m.querySelector('.ps-tip'); if(t) t.hidden = false; }
    if(skipped.length) core.toast('Left out: ' + skipped.join('; '), true);
  });
}

document.addEventListener('keydown', e=>{
  // A pop-up over the preview (e.g. Add to stack): Esc closes it, nothing else reaches the preview.
  const pop = document.querySelector('.modal-back.ps-back');
  if(pop){ if(e.key==='Escape'){ e.preventDefault(); pop.remove(); refreshDash(); } return; }
  if(!S) return;
  if(e.target.closest && e.target.closest('input,textarea')){ if(e.key==='Escape') e.target.blur(); return; }
  if(e.key==='Escape'){ e.preventDefault(); close(); }
  else if((e.ctrlKey || e.metaKey) && (e.key==='p' || e.key==='P')){ e.preventDefault(); doPrint(); }
});
window.addEventListener('resize', ()=>{ if(S){ clearTimeout(S.rz); S.rz = setTimeout(renderPages, 200); } });

window.SVPrint = { open, close, doPrint, openStack, printStack, stackCount, stackItems, allStackItems, dashBar, get state(){ return S; },
  // For the Printing Centre (printcentre.js): page building and the stack's helpers.
  _: { build, settle, newPrintRoot, runPrint, slideBox, page, place, line, fit, lsaSlides, classCode, classSize, sheetsFor, resultText, itemWhat,
       stepperHTML, wireStepper, removeStackItem, dayName, dayLong, plural, num, STACK_IC, FMT_NAMES, A4L, A4P, MM } };
})();
