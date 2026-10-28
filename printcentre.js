/* =====================================================================
   Slideshow Viewer — Printing Centre (v1.40)
   Loaded after print.js. Uses window.SVCore and SVPrint._ (page building).
   Dashboard top bar → Printing (badge: today's jobs not yet ticked Printed).

   One screen for a day's Printer Stack (defaults to today):
     - Day tabs for the week (‹ › for other weeks), each with how many are still to print.
     - On today: "Not printed from earlier days", with Move to today.
     - The stack: lesson items (added from the editor's print preview / ⋯ → Print LSA pack…,
       saved on the lesson as before) and files dropped here, in period order.
     - Right-hand pane: the selected item's options and print preview.
     - Print stack / Print unticked: one document, one dialog (single-sided).
       Print booklets: A5 booklet items only, as their own job (double-sided, flip on short edge).

   Dropped files (PDF, Word .docx, PowerPoint .pptx) are copied into Lessons/ as
   'Print - <date> - <name>' and saved in viewer-data.json:
     data.printJobs = [{ id, day, added, printed, from?,
       file:{ path, name, size, type:'pdf'|'docx'|'pptx' },
       lesson:null | { id, period, label, start },    // "Which lesson is it for?" (optional)
       n, auto,                                        // copies (pupils for 2×2 / single slide); auto: still the default
       pages,                                          // pages / slides in the file
       skip:[i],                                       // pages (PDF/Word) or slides (LSA pack) left out
       layout:1|2|'booklet',                           // PDF / Word: pages per sheet, or A5 booklet
       fmt:'2x2'|'single'|'lsa', slides:[i], hidden:[i], code }]  // PowerPoint only
   Cleared with Clear previous weeks (app.js), like lesson decks.
   Word documents are laid out by docx-preview (vendor/docx-preview.min.js). It reads the
   page breaks Word saved in the file; pages it can't place are split here by paragraph.
   The layout can differ from Word (text boxes, shapes), so the pane warns about it.
   ===================================================================== */
(function(){
'use strict';
const C = ()=>window.SVCore;
const P = ()=>window.SVPrint._;
const TYPE_NAME = { pdf:'PDF', docx:'Word', pptx:'PowerPoint' };
const LAYOUT_NAME = { 1:'1 page per sheet', 2:'2 pages per sheet', booklet:'A5 booklet' };
const M2 = 5, G2 = 3; // 2 per sheet / booklet: outer margin and gap (mm)
let W = null; // the open centre

/* ---------- dates ---------- */
const isoD = d => C().iso(d);
const todayIso = ()=>isoD(C().today());
function startDay(){ return isoD(C().defaultDate()); } // today, or Monday at the weekend
function shortDay(ds){ const d = C().fromIso(ds); return `${C().DAY_NAMES[d.getDay()].slice(0,3)} ${d.getDate()} ${C().MON_NAMES[d.getMonth()]}`; }

/* ---------- data ---------- */
function jobs(){ const d = C().data; if(!Array.isArray(d.printJobs)) d.printJobs = []; return d.printJobs; }
function jobById(id){ return jobs().find(j=>j.id===id) || null; }
// Everything on a day's stack, in period order (untagged files after the lessons).
function entries(ds){
  const out = P() && window.SVPrint ? SVPrint.stackItems(ds).map(({ l, it })=>({ kind:'lesson', key:'L' + it.id, l, it, start:l.start || '', added:it.added || 0 })) : [];
  for(const j of jobs()) if(j.day===ds) out.push({ kind:'file', key:'F' + j.id, j, start:(j.lesson && j.lesson.start) || '', added:j.added || 0 });
  return out.sort((a,b)=>(a.start || '99:99').localeCompare(b.start || '99:99') || a.added - b.added);
}
const rec = e => e.kind==='lesson' ? e.it : e.j;
const isDone = e => !!rec(e).printed;
function waiting(ds){ return entries(ds).filter(e=>!isDone(e)).length; }
// Unprinted items on days before ds.
function earlier(ds){
  const out = [];
  for(const x of SVPrint.allStackItems()) if(x.day < ds && !x.it.printed) out.push({ kind:'lesson', key:'L' + x.it.id, l:x.l, it:x.it, day:x.day, start:x.l.start || '', added:x.it.added || 0 });
  for(const j of jobs()) if(j.day < ds && !j.printed) out.push({ kind:'file', key:'F' + j.id, j, day:j.day, start:(j.lesson && j.lesson.start) || '', added:j.added || 0 });
  return out.sort((a,b)=>a.day.localeCompare(b.day) || (a.start || '99:99').localeCompare(b.start || '99:99') || a.added - b.added);
}
function moveTo(e, ds){
  if(e.kind==='lesson'){ if(ds===e.l.date) delete e.it.day; else e.it.day = ds; }
  else { if(!e.j.from) e.j.from = e.j.day; e.j.day = ds; if(e.j.from===ds) delete e.j.from; }
}
const movedFrom = e => e.kind==='lesson' ? (e.it.day && e.it.day!==e.l.date ? e.l.date : null) : (e.j.from || null);

/* ---------- class sizes / tags ---------- */
function tagSize(tag){
  const SC = window.SVClasses; if(!SC || !tag) return null;
  const l = C().data.lessons[tag.id] || { label:tag.label };
  const k = SC.classFor(l); return k ? SC.active(k).length || null : null;
}
function dayOptions(ds){
  const core = C(), d = core.fromIso(ds);
  return core.dayRows(d).filter(r=>r.kind!=='slim').map(r=>({ id:r.meta.id, period:r.meta.period, label:r.meta.label, start:r.meta.start || '' }));
}
function tagText(tag){ return tag ? [tag.period, tag.label].filter(Boolean).join(' · ') : ''; }
const isPupils = j => j.file.type==='pptx' && j.fmt!=='lsa';
// The default number: class size if a lesson is chosen, else 1 (an LSA pack: 1).
function defaultN(j){ if(j.file.type==='pptx' && j.fmt==='lsa') return 1; return tagSize(j.lesson) || 1; }

/* ---------- sheets ---------- */
function selPages(j){ const sk = new Set(j.skip || []); return [...Array(j.pages || 0).keys()].filter(i=>!sk.has(i)); }
function lsaCount(j){ const sk = new Set([...(j.skip || []), ...(j.hidden || [])]); return [...Array(j.pages || 0).keys()].filter(i=>!sk.has(i)).length; }
function pptSlides(j){ return (j.slides || []).filter(i=>i < (j.pages || 0)); }
// Sheets of A4 for one copy (PDF / Word) and in all.
function perCopy(j){
  const s = selPages(j).length;
  return j.layout===2 ? Math.ceil(s/2) : j.layout==='booklet' ? Math.ceil(s/4) : s;
}
function jobSheets(j){
  const n = Math.max(0, Math.floor(Number(j.n) || 0));
  if(j.file.type!=='pptx') return n * perCopy(j);
  if(j.fmt==='lsa') return n * Math.ceil(lsaCount(j)/2);
  return pptSlides(j).length * (j.fmt==='2x2' ? Math.ceil(n/4) : n);
}
function jobResult(j){
  const { plural } = P(), n = Math.max(0, Math.floor(Number(j.n) || 0)), sh = jobSheets(j);
  if(j.file.type==='pptx'){
    if(j.fmt==='lsa'){ const pg = Math.ceil(lsaCount(j)/2); return `${plural(n, 'copy', 'copies')} × ${plural(pg, 'page')} = ${plural(sh, 'sheet')}`; }
    const k = pptSlides(j).length;
    return (k>1 ? `${k} slides · ` : '') + plural(sh, 'sheet') + (j.fmt==='2x2' && n ? ` · ${k * Math.ceil(n/4) * 4} handouts` : '');
  }
  const pc = perCopy(j);
  return `${plural(n, 'copy', 'copies')} × ${plural(pc, 'sheet')} = ${plural(sh, 'sheet')}` + (j.layout==='booklet' ? ' (double-sided)' : '');
}
function jobWhat(j){
  if(j.file.type==='pptx'){
    if(j.fmt==='lsa') return 'LSA pack';
    const s = pptSlides(j);
    return `${P().FMT_NAMES[j.fmt]} · ${s.length===1 ? 'slide ' + (s[0] + 1) : s.length + ' slides'}`;
  }
  const s = selPages(j).length, all = j.pages || 0;
  return `${LAYOUT_NAME[j.layout] || LAYOUT_NAME[1]} · ${s===all ? P().plural(all, 'page') : `${s} of ${all} pages`}`;
}
function rangeText(list){ // [0,1,2,4] → "1–3, 5"
  const out = []; let a = null, b = null;
  for(const i of list){ if(a==null){ a = b = i; } else if(i===b+1) b = i; else { out.push(a===b ? `${a+1}` : `${a+1}–${b+1}`); a = b = i; } }
  if(a!=null) out.push(a===b ? `${a+1}` : `${a+1}–${b+1}`);
  return out.join(', ');
}

/* ---------- reading the files ---------- */
const srcs = new Map(); // job id → Promise<source>
function stem(n){ return String(n || '').replace(/\.[^.]+$/, ''); }
// A lesson-like object, so print.js can lay out a dropped PowerPoint (or a PDF page) like a lesson's deck.
function pseudo(j){
  const t = j.file.type==='pdf' ? 'pdf' : 'pptx';
  return { id:'pj|' + j.id, date:j.day, slotId:'pj', label:'', period:'', start:'', title:stem(j.file.name), lang:'fr',
    files:{ [t]:{ path:j.file.path, name:j.file.name } }, mode:t, hides:{ pptx:{}, pdf:{} }, ink:{ pptx:{}, pdf:{} }, myNotes:{ pptx:{}, pdf:{} },
    slideCount:{}, print:{ [t]:{ skip:[] } }, printCode:'' };
}
function syncPseudo(src, j){
  const l = src.l; if(!l) return;
  l.date = j.day; l.period = j.lesson ? j.lesson.period : ''; l.label = j.lesson ? j.lesson.label : '';
  l.printCode = typeof j.code==='string' ? j.code : (j.lesson ? j.lesson.label : '');
  l.print[l.mode].skip = (j.skip || []).slice();
}
function source(j){
  if(!srcs.has(j.id)){
    const p = (async()=>{
      const core = C();
      if(j.file.type==='docx') return docxSource(j);
      const l = pseudo(j), v = await core.getDeck(l, l.mode);
      const src = { type:j.file.type, l, v, count:v.base.count, size:i=>v.size(i), imgs:new Map() };
      src.box = (i, wMm, hMm, hi)=> j.file.type==='pdf' ? pdfBox(src, i, wMm, hMm, hi) : P().slideBox({ l, mode:l.mode, v, hi, pdfCache:new Map() }, i, wMm, hMm);
      return src;
    })();
    p.catch(()=>srcs.delete(j.id));
    srcs.set(j.id, p);
  }
  return srcs.get(j.id);
}
function dropSource(j){
  const p = srcs.get(j.id); srcs.delete(j.id);
  if(p) p.then(s=>{ if(s.host) s.host.remove(); for(const u of (s.imgs ? s.imgs.values() : [])) u.then(x=>URL.revokeObjectURL(x)).catch(()=>{}); }).catch(()=>{});
  C().deckCache.delete(j.file.path);
}
// PDF pages as pictures, drawn once per size and shared by every copy (repeated copies of a
// 250 dpi canvas would use a lot of memory).
function pdfImgUrl(src, i, px){
  const key = i + '@' + px;
  if(!src.imgs.has(key)) src.imgs.set(key, (async()=>{
    const page = await src.v.pdfPage(i);
    const vp1 = page.getViewport({ scale:1 }), vp = page.getViewport({ scale:px / vp1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext:g, viewport:vp }).promise;
    const blob = await new Promise(r=>c.toBlob(r, 'image/png'));
    return URL.createObjectURL(blob);
  })());
  return src.imgs.get(key);
}
function pdfBox(src, i, wMm, hMm, hi){
  const { MM } = P(), core = C();
  const box = core.el('div', 'pr-slide pc-doc'); box.style.width = wMm + 'mm'; box.style.height = hMm + 'mm';
  const im = document.createElement('img'); im.alt = ''; im.style.cssText = 'width:100%;height:100%;display:block';
  box.appendChild(im);
  const px = Math.round(wMm * (hi==='quick' ? 150/25.4 : hi ? 250/25.4 : 1.6*MM));
  const ready = pdfImgUrl(src, i, px).then(u=>{ im.src = u; return im.decode ? im.decode().catch(()=>{}) : null; }).catch(()=>{});
  return { el:box, ready };
}

/* Word: docx-preview renders each page as <section class="dx…">, using the page breaks Word saved.
   Sections still taller than the page are split between paragraphs; anything still too tall
   (e.g. a long table) is shrunk to fit and reported. */
async function docxSource(j){
  const core = C();
  if(!window.docx || typeof docx.renderAsync!=='function') throw new Error("the Word reader (vendor/docx-preview.min.js) isn't loaded");
  const buf = await (await core.store.readDeck(j.file.path)).arrayBuffer();
  let root = document.getElementById('pc-docx');
  if(!root){ root = core.el('div'); root.id = 'pc-docx'; document.body.appendChild(root); }
  const host = core.el('div'); root.appendChild(host);
  const cls = 'dx' + String(j.id).replace(/\W/g, '');
  try{
    await docx.renderAsync(buf, host, host, { className:cls, inWrapper:false, ignoreWidth:false, ignoreHeight:false, ignoreFonts:false,
      breakPages:true, ignoreLastRenderedPageBreak:false, experimental:true, trimXmlDeclaration:true, useBase64URL:true,
      renderHeaders:true, renderFooters:true, renderFootnotes:true, renderEndnotes:true, renderComments:false });
  }catch(e){ host.remove(); throw new Error("couldn't read the Word document (" + (e.message || e) + ')'); }
  if(document.fonts && document.fonts.ready) await document.fonts.ready;
  let secs = [...host.querySelectorAll(`section.${cls}`)];
  if(!secs.length){ host.remove(); throw new Error('no pages found in the Word document'); }
  const pages = [];
  for(const sec of secs){
    const h = pageH(sec);
    for(const s of splitSection(sec, h)) pages.push({ el:s, w:s.offsetWidth, h });
  }
  const over = new Set();
  pages.forEach((p, i)=>{ if(p.el.scrollHeight > p.h + 2) over.add(i); });
  const src = { type:'docx', host, cls, pages, over, count:pages.length, size:i=>({ w:pages[i].w, h:pages[i].h }) };
  src.box = (i, wMm, hMm)=>docxBox(src, i, wMm, hMm);
  return src;
}
function pageH(sec){ return cssPx(sec.style.minHeight) || cssPx(sec.style.height) || sec.offsetHeight; }
function cssPx(v){ // '841.9pt' → px
  const m = /^([\d.]+)(pt|px|mm|cm|in)?$/.exec(String(v || '').trim()); if(!m) return 0;
  const n = parseFloat(m[1]), u = m[2] || 'px';
  return u==='pt' ? n*96/72 : u==='mm' ? n*96/25.4 : u==='cm' ? n*96/2.54 : u==='in' ? n*96 : n;
}
function splitSection(sec, h){
  if(sec.scrollHeight <= h + 2) return [sec];
  const art = sec.querySelector(':scope > article'); if(!art) return [sec];
  const head = sec.querySelector(':scope > header'), foot = sec.querySelector(':scope > footer');
  const cs = getComputedStyle(sec);
  const avail = h - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0) - (head ? head.offsetHeight : 0) - (foot ? foot.offsetHeight : 0) - 4;
  const kids = [...art.children]; if(kids.length < 2) return [sec];
  const groups = []; let cur = [], top0 = null;
  const artTop = art.getBoundingClientRect().top;
  for(const k of kids){
    const r = k.getBoundingClientRect(), t = r.top - artTop, b = r.bottom - artTop + (parseFloat(getComputedStyle(k).marginBottom) || 0); // the article keeps the last paragraph's spacing
    if(top0==null) top0 = t;
    if(cur.length && b - top0 > avail){ groups.push(cur); cur = []; top0 = t; }
    cur.push(k);
  }
  if(cur.length) groups.push(cur);
  if(groups.length < 2) return [sec];
  const out = groups.map(g=>{
    const s = sec.cloneNode(false);
    if(head) s.appendChild(head.cloneNode(true));
    const a = art.cloneNode(false); for(const k of g) a.appendChild(k); s.appendChild(a);
    if(foot) s.appendChild(foot.cloneNode(true));
    return s;
  });
  sec.replaceWith(...out);
  return out;
}
function docxBox(src, i, wMm, hMm){
  const { MM } = P(), core = C(), pg = src.pages[i];
  const box = core.el('div', 'pr-slide pc-doc'); box.style.width = wMm + 'mm'; box.style.height = hMm + 'mm';
  const k = (wMm*MM) / pg.w;
  const c = pg.el.cloneNode(true);
  c.style.margin = '0'; c.style.boxShadow = 'none';
  const full = Math.max(pg.h, pg.el.scrollHeight);
  const inner = core.el('div');
  let kk = k, dx = 0;
  if(full > pg.h + 2){ kk = k * pg.h / full; dx = (pg.w*k - pg.w*kk) / 2; } // too tall even after splitting: shrink to fit
  c.style.height = full + 'px'; c.style.minHeight = full + 'px'; c.style.overflow = 'hidden';
  inner.style.cssText = `position:absolute;left:${dx}px;top:0;width:${pg.w}px;height:${full}px;transform:scale(${kk});transform-origin:0 0;background:#fff`;
  inner.appendChild(c);
  box.appendChild(inner);
  const imgs = [...c.querySelectorAll('img')];
  const ready = Promise.all(imgs.map(im=>im.complete ? null : (im.decode ? im.decode().catch(()=>{}) : null)));
  return { el:box, ready };
}

/* ---------- laying out a file's pages ---------- */
function fitIn(sz, w, h){ const k = Math.min(w/sz.w, h/sz.h); return { w:sz.w*k, h:sz.h*k }; }
// One copy of a job's pages: { pages:[el], ready }.
function buildJob(j, src, hi){
  const pr = P(), pages = [], readies = [];
  syncPseudo(src, j);
  if(j.file.type==='pptx'){
    const ctx = { l:src.l, mode:src.l.mode, v:src.v, hi, pdfCache:new Map() };
    if(j.fmt==='lsa'){ const b = pr.build('lsa', ctx); pages.push(...b.pages); readies.push(b.ready); }
    else for(const i of pptSlides(j)){ if(!src.v.has(i)) continue; const b = pr.build(j.fmt, Object.assign({}, ctx, { slide:i })); pages.push(...b.pages); readies.push(b.ready); }
    return { pages, ready:Promise.all(readies) };
  }
  const sel = selPages(j).filter(i=>i < src.count);
  const put = (p, i, x, y, w, h)=>{
    if(i==null) return;
    const s = fitIn(src.size(i), w, h), b = src.box(i, s.w, s.h, hi); readies.push(b.ready);
    p.appendChild(pr.place(b.el, x + (w - s.w)/2, y + (h - s.h)/2));
  };
  const { A4L, A4P } = pr;
  const landOf = i => { const z = src.size(i); return z.w > z.h; };
  if(j.layout===2){
    for(let n=0; n<sel.length; n+=2){
      const a = sel[n], b = sel[n+1];
      if(landOf(a)){ // landscape pages: one above the other on a portrait sheet
        const p = pr.page('portrait'), w = A4P.w - 2*M2, h = (A4P.h - 2*M2 - G2)/2;
        put(p, a, M2, M2, w, h); put(p, b, M2, M2 + h + G2, w, h); pages.push(p);
      } else {
        const p = pr.page('landscape'), w = (A4L.w - 2*M2 - G2)/2, h = A4L.h - 2*M2;
        put(p, a, M2, M2, w, h); put(p, b, M2 + w + G2, M2, w, h); pages.push(p);
      }
    }
  } else if(j.layout==='booklet'){
    // Saddle-stitched A5 booklet: pad to a multiple of 4; sheet s front = [last-2s | 2s], back = [2s+1 | last-1-2s].
    const L = sel.slice(); while(L.length % 4) L.push(null);
    const T = L.length, w = (A4L.w - 2*M2 - G2)/2, h = A4L.h - 2*M2;
    for(let s=0; s<T/4; s++){
      for(const [l, r] of [[T-1-2*s, 2*s], [2*s+1, T-2-2*s]]){
        const p = pr.page('landscape');
        put(p, L[l], M2, M2, w, h); put(p, L[r], M2 + w + G2, M2, w, h);
        p.append(pr.line('v', A4L.w/2, 0, 4), pr.line('v', A4L.w/2, A4L.h - 4, 4)); // fold marks
        pages.push(p);
      }
    }
  } else {
    for(const i of sel){
      const land = landOf(i), p = pr.page(land ? 'landscape' : 'portrait'), A = land ? A4L : A4P;
      put(p, i, 0, 0, A.w, A.h); pages.push(p);
    }
  }
  return { pages, ready:Promise.all(readies) };
}

/* ---------- the screen ---------- */
const PCT_IC = lucideSvg('printer', 'ico');
const UP_IC = lucideSvg('upload', 'ico');
const FILE_IC = lucideSvg('file-text', 'ico');
function topButton(){
  const n = waiting(todayIso());
  // v1.84: icon only with a green count badge (dashboard redesign).
  const tip = `Printing Centre${n ? `: ${n} job${n>1?'s':''} on today's Printer Stack not printed yet` : ''}`;
  return `<button class="dtb pc-top" data-a="printing" title="${tip}" aria-label="${tip}">${PCT_IC}${n ? `<span class="dtb-badge">${n}</span>` : ''}</button>`;
}

function open(ds){
  const core = C();
  if(W) close(true);
  ds = ds || startDay();
  const root = core.el('div', 'pc-wrap');
  root.innerHTML = `
    ${core.appHeader('printing')}
    <nav class="pc-bar weekbar" aria-label="Week and day"><div class="pc-days"></div><span class="grow"></span><div class="pc-wk"></div><button class="btn" data-pc="add">${UP_IC}Add files</button></nav>
    <div class="pc-main">
      <div class="pc-left"><div class="pc-list"></div></div>
      <div class="pc-pane"></div>
    </div>
    <div class="pc-foot"><span class="pc-total"></span><span class="grow"></span>
      <button class="btn" data-pc="booklets" hidden></button>
      <button class="btn" data-pc="save-pdf" title="Save the whole stack as a PDF (quick)"><span>Save PDF</span></button>
      <button class="btn" data-pc="print-all">${core.icon('print')}<span>Print stack</span></button>
      <button class="btn primary" data-pc="print-new" hidden></button></div>
    <div class="pc-dropcover"><div>${UP_IC}<b>Drop to add to the Printer Stack</b><span>PDF, Word (.docx) or PowerPoint (.pptx)</span></div></div>`;
  document.body.appendChild(root);
  const input = core.el('input'); input.type = 'file'; input.multiple = true; input.accept = '.pdf,.docx,.pptx'; input.hidden = true;
  input.onchange = ()=>{ const f = [...input.files]; input.value = ''; if(f.length) addFiles(f); };
  root.appendChild(input);
  W = { root, ds, mon:core.mondayOf(core.fromIso(ds)), sel:null, tab:'preview', gen:0, lsa:new Map(), input, prevView:core.view, rz:null };
  core.view = { name:'printcentre' };
  root.addEventListener('click', onClick);
  // Drag and drop files anywhere on the screen.
  let depth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  root.addEventListener('dragenter', e=>{ if(!hasFiles(e)) return; e.preventDefault(); depth++; root.classList.add('pc-dragging'); });
  root.addEventListener('dragover', e=>{ if(!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
  root.addEventListener('dragleave', e=>{ if(!hasFiles(e)) return; if(--depth <= 0){ depth = 0; root.classList.remove('pc-dragging'); } });
  root.addEventListener('drop', e=>{
    if(!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; root.classList.remove('pc-dragging');
    const f = [...(e.dataTransfer.files || [])]; if(f.length) addFiles(f);
  });
  render();
}
function close(quiet){
  if(!W) return;
  const core = C();
  clearTimeout(W.rz);
  W.root.remove();
  core.view = W.prevView && W.prevView.name!=='printcentre' ? W.prevView : { name:'dash' };
  W = null;
  if(!quiet){ core.saveSoon(200); if(core.view.name==='dash') core.renderDashboard(); }
}
function refresh(reload){
  if(!W) return;
  if(reload){ // data reloaded from the other computer: the jobs are new objects
    if(W.sel && W.sel[0]==='F' && !jobById(W.sel.slice(1))) W.sel = null;
  }
  render();
}

function onClick(e){
  const b = e.target.closest('[data-pc]'); if(!b || !W) return;
  const core = C(), a = b.dataset.pc;
  if(a==='back') close();
  else if(a==='wk'){ W.mon = core.addDays(W.mon, Number(b.dataset.d)); W.sel = null; render(); } // render() picks today, or the week's Monday
  else if(a==='day'){ W.ds = b.dataset.d; W.sel = null; render(); }
  else if(a==='add') W.input.click();
  else if(a==='save-pdf') savePdf(W.ds, b);
  else if(a==='print-all') printDay(W.ds, 'all', b);
  else if(a==='print-new') printDay(W.ds, 'new', b);
  else if(a==='booklets') printBooklets(W.ds, b);
}

function weekBounds(){
  const core = C(), thisMon = core.mondayOf(core.today());
  let minMon = thisMon;
  for(const x of SVPrint.allStackItems()) if(!x.it.printed){ const m = core.mondayOf(core.fromIso(x.day)); if(m < minMon) minMon = m; }
  for(const j of jobs()){ const m = core.mondayOf(core.fromIso(j.day)); if(m < minMon) minMon = m; }
  return { minMon, maxMon:core.lastDashMonday() };
}
function render(){
  if(!W) return;
  const core = C(), pr = P(), { root } = W;
  const { minMon, maxMon } = weekBounds();
  if(W.mon < minMon) W.mon = minMon; if(W.mon > maxMon) W.mon = maxMon;
  const tIso = todayIso();
  const days = [0,1,2,3,4].map(n=>core.addDays(W.mon, n));
  if(!days.some(d=>isoD(d)===W.ds)) W.ds = isoD(days.find(d=>isoD(d)===tIso) || days[0]);
  // v1.85: the shared day strip and week arrows (app.js dayStrip / weekNav).
  root.querySelector('.pc-days').innerHTML = core.dayStrip(days.map(d=>{
    const ds = isoD(d), all = entries(ds), w = all.filter(e=>!isDone(e)).length;
    return { ds, label:core.dayShort(d), sub:!all.length ? 'Nothing' : w ? `${w} to print` : 'All printed', tone:!all.length ? '' : w ? 'warn' : 'ok' };
  }), W.ds, ds=>`data-pc="day" data-d="${ds}"`);
  root.querySelector('.pc-wk').innerHTML = core.weekNav(`Week of ${W.mon.getDate()} ${core.MON_NAMES[W.mon.getMonth()]}`, 'data-pc="wk" data-d="-7"', 'data-pc="wk" data-d="7"', +W.mon <= +minMon, +W.mon >= +maxMon);
  core.updatePill();
  renderList();
  renderFoot();
  renderPane();
}

function renderList(){
  const core = C(), pr = P(), host = W.root.querySelector('.pc-list');
  const ds = W.ds, list = entries(ds), tIso = todayIso();
  host.innerHTML = '';
  // Earlier days (on today's tab only).
  if(ds===tIso){
    const old = earlier(ds);
    if(old.length){
      const box = core.el('div', 'pc-carry');
      box.innerHTML = `<div class="pc-carry-h"><b>Not printed from earlier days</b><span class="grow"></span><button class="btn sm" data-x="all">Move all to today</button></div>`;
      for(const e of old){
        const r = core.el('div', 'pc-carry-row');
        r.innerHTML = `<span class="pc-carry-d">${core.esc(shortDay(e.day))}</span><span class="pc-carry-w">${core.esc(rowTitle(e))}<small>${core.esc(rowDetail(e))}</small></span><button class="btn sm">Move to today</button>`;
        r.querySelector('button').onclick = ()=>{ moveTo(e, ds); core.saveSoon(); W.sel = e.key; render(); };
        box.appendChild(r);
      }
      box.querySelector('[data-x=all]').onclick = ()=>{ for(const e of old) moveTo(e, ds); core.saveSoon(); render(); };
      host.appendChild(box);
    }
  }
  const head = core.el('div', 'pc-list-h');
  const waitingN = list.filter(e=>!isDone(e)).length;
  head.innerHTML = `<div class="grow"><h2>${core.esc(pr.dayLong(ds))}</h2><span>${list.length ? pr.plural(list.length, 'item') + (waitingN!==list.length ? ` · ${waitingN ? waitingN + ' not printed yet' : 'all printed'}` : '') : 'Printer Stack'}</span></div>
    ${list.length ? `<label class="ps-all"><span>Mark all as printed</span><input type="checkbox"${!waitingN ? ' checked' : ''}></label>` : ''}`;
  const all = head.querySelector('.ps-all input');
  if(all){
    all.indeterminate = waitingN>0 && waitingN<list.length;
    all.onchange = ()=>{ const now = Date.now(); for(const e of entries(ds)){ const r = rec(e); r.printed = all.checked ? (r.printed || now) : null; } core.saveSoon(); render(); };
  }
  host.appendChild(head);
  if(!list.length){
    host.appendChild(core.el('div', 'pc-empty', `Nothing on ${core.esc(pr.dayName(ds))}'s stack yet. Drop files below, or from a lesson's editor open <b>Print</b> and tap <b>Add to ${core.esc(pr.dayName(ds))}'s Printer Stack</b> (also <b>⋯ → Print LSA pack…</b> on the dashboard).`));
  }
  if(list.length && (!W.sel || !list.some(e=>e.key===W.sel))) W.sel = list[0].key;
  // v1.85: a lesson's items one after another go under one heading (class, title, period).
  for(let i = 0; i < list.length; ){
    const e = list[i]; let j = i + 1;
    if(e.kind==='lesson') while(j < list.length && list[j].kind==='lesson' && list[j].l.id===e.l.id) j++;
    if(j - i > 1){
      const g = core.el('div', 'pc-grp');
      g.innerHTML = `<div class="pc-grp-h"><div class="ps-when"><b>${core.esc(e.l.period || '')}</b><small>${core.esc(e.l.start || '')}</small></div>${core.pillHTML(pr.classCode(e.l) || e.l.label || 'Extra')}<span class="pc-grp-t">${core.esc(C().lessonTitle(e.l))}</span><span class="pc-grp-n">${pr.plural(j - i, 'item')}</span></div>`;
      for(let k = i; k < j; k++) g.appendChild(rowEl(list[k], true));
      host.appendChild(g);
    } else host.appendChild(rowEl(e));
    i = j;
  }
  const drop = core.el('button', 'pc-drop');
  drop.dataset.pc = 'add';
  drop.innerHTML = `${UP_IC}<span><b>Drop PDFs, Word documents or PowerPoints here</b><small>or tap to choose files · added to ${core.esc(pr.dayName(ds))}'s stack</small></span>`;
  host.appendChild(drop);
  // LSA packs on lessons: count their pages (needs the deck).
  for(const e of list){
    if(e.kind!=='lesson' || e.it.fmt!=='lsa' || !e.l.files[e.it.mode]) continue;
    const k = e.l.id + '|' + e.it.mode; if(W.lsa.has(k)) continue;
    W.lsa.set(k, null);
    core.getDeck(e.l, e.it.mode).then(v=>{ W.lsa.set(k, Math.ceil(pr.lsaSlides(e.l, e.it.mode, v).length/2)); if(W && W.ds===ds){ renderList(); renderFoot(); } }).catch(()=>{});
  }
}
function rowTitle(e){
  const pr = P();
  if(e.kind==='lesson') return `${pr.classCode(e.l) || e.l.label || 'Extra'} · ${C().lessonTitle(e.l)}`;
  return `${e.j.lesson ? e.j.lesson.label + ' · ' : ''}${e.j.file.name}`;
}
function rowDetail(e){ return e.kind==='lesson' ? P().itemWhat(e.it, e.l) : `${TYPE_NAME[e.j.file.type]} · ${jobWhat(e.j)}`; }
function lsaPagesOf(e){ return W ? W.lsa.get(e.l.id + '|' + e.it.mode) : null; }
function rowEl(e, inGrp){
  const core = C(), pr = P(), r = rec(e);
  const row = core.el('div', 'ps-row pc-row' + (r.printed ? ' done' : '') + (e.key===W.sel ? ' sel' : '') + (inGrp ? ' in-grp' : ''));
  row.dataset.k = e.key;
  let when = '', problem = '', label = 'copies';
  if(e.kind==='lesson'){
    when = `<b>${core.esc(e.l.period || '')}</b><small>${core.esc(e.l.start || '')}</small>`;
    problem = !e.l.files[e.it.mode] ? 'Deck removed' : (e.it.fmt!=='lsa' && core.slideNum(e.l, e.it.mode, e.it.slide)==null) ? 'Slide no longer in the deck' : '';
    label = e.it.fmt==='lsa' ? 'copies' : 'pupils';
  } else {
    when = e.j.lesson ? `<b>${core.esc(e.j.lesson.period || '')}</b><small>${core.esc(e.j.lesson.start || '')}</small>` : `<span class="pc-ftype t-${e.j.file.type}">${FILE_IC}</span>`;
    label = isPupils(e.j) ? 'pupils' : 'copies';
  }
  const from = movedFrom(e);
  row.innerHTML = `<div class="ps-when">${inGrp ? '' : when}</div>
    <div class="ps-what"><div class="t">${core.esc(inGrp ? rowDetail(e) : rowTitle(e))}</div>
      <div class="d">${inGrp ? '' : core.esc(rowDetail(e))}${e.kind==='file' ? ` <span class="tag pc-t-${e.j.file.type}">${TYPE_NAME[e.j.file.type]}</span>` : ''}${from ? ` <span class="tag">From ${core.esc(shortDay(from))}</span>` : ''}${problem ? ` <span class="tag bad">${problem}</span>` : ''}</div>
      <div class="pc-res2"></div></div>
    <div class="ps-num">${pr.stepperHTML(r.n)}<small>${label}</small></div>
    <div class="ps-res"></div>
    <label class="ps-done" title="Tick once this has been printed. Print unticked leaves it out."><input type="checkbox"${r.printed ? ' checked' : ''}><span>Printed</span></label>
    <button class="icon-btn" data-x="del" title="Remove from the stack">${core.icon('x')}</button>`;
  const res = row.querySelector('.ps-res'), res2 = row.querySelector('.pc-res2'); // res2: under the name on narrow screens
  const showRes = ()=>{ res.textContent = res2.textContent = e.kind==='lesson' ? pr.resultText(e.it, lsaPagesOf(e)) : jobResult(e.j); };
  showRes();
  pr.wireStepper(row.querySelector('.ps-step'), n=>{
    if(!(n>0)) return;
    r.n = n; if(e.kind==='file') e.j.auto = false;
    core.saveSoon(); showRes(); renderFoot(); if(e.key===W.sel) syncPaneNum();
  });
  row.querySelector('.ps-done input').onchange = ev=>{ r.printed = ev.target.checked ? Date.now() : null; core.saveSoon(); render(); };
  row.querySelector('[data-x=del]').onclick = ev=>{ ev.stopPropagation(); removeEntry(e); };
  row.addEventListener('click', ev=>{
    if(ev.target.closest('input,button,label')) return;
    if(W.sel===e.key) return;
    W.sel = e.key; W.tab = 'preview';
    core.$$('.pc-row', W.root).forEach(x=>x.classList.toggle('sel', x.dataset.k===e.key));
    renderPane();
  });
  return row;
}
async function removeEntry(e){
  const core = C();
  if(e.kind==='lesson'){ P().removeStackItem(e.l, e.it.id); core.saveSoon(); render(); return; }
  const j = e.j;
  C().data.printJobs = jobs().filter(x=>x!==j);
  dropSource(j);
  if(W && W.sel===e.key) W.sel = null;
  render();
  try{ await core.store.deleteDeck(j.file.path); }catch(err){}
  core.saveSoon();
  core.toast(`Removed ${j.file.name} (your original file isn't touched)`);
}

function renderFoot(){
  if(!W) return;
  const core = C(), pr = P(), root = W.root, list = entries(W.ds);
  let sh = 0, unknown = false;
  for(const e of list){
    if(e.kind==='lesson'){ const s = pr.sheetsFor(e.it, e.it.fmt==='lsa' ? lsaPagesOf(e) : null); if(s==null) unknown = true; else sh += s; }
    else sh += jobSheets(e.j);
  }
  root.querySelector('.pc-total').textContent = list.length ? `${pr.plural(list.length, 'item')} · ${unknown ? 'counting…' : pr.plural(sh, 'sheet') + ' of A4'}` : '';
  const main = list.filter(e=>!(e.kind==='file' && e.j.layout==='booklet' && e.j.file.type!=='pptx'));
  const books = list.length - main.length;
  const wait = main.filter(e=>!isDone(e)).length, some = wait < main.length;
  const pb = root.querySelector('[data-pc=print-all]'), nb = root.querySelector('[data-pc=print-new]'), bb = root.querySelector('[data-pc=booklets]');
  pb.disabled = !main.length;
  const sp = root.querySelector('[data-pc=save-pdf]'); if(sp) sp.disabled = !main.length;
  pb.querySelector('span').textContent = some ? `Print all (${main.length})` : 'Print stack';
  pb.classList.toggle('primary', !some || !wait);
  nb.hidden = !(some && wait);
  nb.innerHTML = `${core.icon('print')}<span>Print unticked (${wait})</span>`;
  bb.hidden = !books;
  const bw = list.filter(e=>e.kind==='file' && e.j.layout==='booklet' && e.j.file.type!=='pptx' && !e.j.printed).length;
  bb.innerHTML = `${core.icon('print')}<span>Print booklets (${bw || books})</span>`;
  bb.title = 'A5 booklets print as their own job: choose double-sided, flip on short edge';
}

/* ---------- the right-hand pane ---------- */
function selected(){ if(!W || !W.sel) return null; return entries(W.ds).find(e=>e.key===W.sel) || null; }
function syncPaneNum(){
  const e = selected(); if(!e || e.kind!=='file') return;
  const inp = W.root.querySelector('.pc-pane .ps-step input'); if(inp && document.activeElement!==inp) inp.value = e.j.n;
  const o = W.root.querySelector('.pc-pane .pc-out'); if(o) o.textContent = jobResult(e.j);
}
function refreshRow(e){
  if(!W) return;
  const old = W.root.querySelector(`.pc-row[data-k="${CSS.escape(e.key)}"]`);
  if(old) old.replaceWith(rowEl(e));
  renderFoot();
}
function renderPane(){
  if(!W) return;
  const core = C(), pr = P(), pane = W.root.querySelector('.pc-pane');
  const e = selected();
  pane.innerHTML = '';
  W.gen++;
  if(!e){ pane.appendChild(core.el('div', 'pc-pane-empty', `${FILE_IC}<span>Choose an item to see its print preview.</span>`)); return; }
  if(e.kind==='lesson') return lessonPane(e, pane);
  filePane(e, pane);
}
function lessonPane(e, pane){
  const core = C(), pr = P(), { l, it } = e;
  const head = core.el('div', 'pc-ph');
  head.innerHTML = `<div class="grow"><div class="pc-pt">${core.esc(rowTitle(e))}</div><div class="pc-ps">${core.esc(pr.itemWhat(it, l))} · from the lesson's editor</div></div>
    <button class="btn sm" data-x="open">${core.icon('edit')}Print preview…</button>`;
  head.querySelector('[data-x=open]').onclick = ()=>{
    if(!l.files[it.mode]) return core.toast('The deck has been removed from this lesson.', true);
    SVPrint.open(l.id, { format:it.fmt, slide:it.fmt==='lsa' ? null : it.slide, onClose:()=>{ if(W){ W.lsa.clear(); render(); } } });
  };
  pane.appendChild(head);
  pane.appendChild(core.el('div', 'pc-note', 'Prints the lesson as it is now, with its print choices. To change which items or slides print, open the print preview.'));
  const pages = core.el('div', 'pc-pages'); pane.appendChild(pages);
  const gen = W.gen;
  if(!l.files[it.mode]){ pages.appendChild(core.el('div', 'pr-empty', 'The deck has been removed from this lesson.')); return; }
  core.getDeck(l, it.mode).then(v=>{
    if(!W || W.gen!==gen) return;
    if(it.fmt!=='lsa' && !v.has(it.slide)){ pages.appendChild(core.el('div', 'pr-empty', 'This slide is no longer in the deck.')); return; }
    const b = pr.build(it.fmt, { l, mode:it.mode, v, slide:it.slide, hi:false, pdfCache:new Map() });
    showPages(pages, b, gen);
  }).catch(err=>pages.appendChild(core.el('div', 'pr-empty', "Couldn't open the deck: " + core.esc(err.message))));
}
function showPages(host, b, gen, capFn){
  const core = C(), pr = P();
  const colW = Math.max(200, Math.min(host.clientWidth || 380, 560));
  if(!b.pages.length){ host.appendChild(core.el('div', 'pr-empty', 'Nothing ticked to print.')); return; }
  b.pages.forEach((p, n)=>{
    const land = p.classList.contains('landscape'), pw = (land ? pr.A4L.w : pr.A4P.w)*pr.MM, ph = (land ? pr.A4L.h : pr.A4P.h)*pr.MM;
    const sc = colW / pw;
    const hold = core.el('div', 'pr-hold'); hold.style.width = colW + 'px'; hold.style.height = (ph*sc) + 'px';
    p.style.transform = `scale(${sc})`; p.style.transformOrigin = '0 0';
    hold.appendChild(p);
    host.append(hold, core.el('div', 'pr-cap', capFn ? capFn(n, b.pages.length) : `Page ${n+1} of ${b.pages.length}`));
  });
  if(window.PPTX) PPTX.fitText(host);
}
function filePane(e, pane){
  const core = C(), pr = P(), j = e.j, t = j.file.type;
  const opts = dayOptions(j.day);
  const tagSel = `<select class="pc-sel" data-x="tag"><option value="">No lesson · just ${core.esc(pr.dayName(j.day))}</option>${opts.map(o=>`<option value="${core.esc(o.id)}"${j.lesson && j.lesson.id===o.id ? ' selected' : ''}>${core.esc([o.period, o.start, o.label].filter(Boolean).join(' · '))}</option>`).join('')}${j.lesson && !opts.some(o=>o.id===j.lesson.id) ? `<option value="${core.esc(j.lesson.id)}" selected>${core.esc(tagText(j.lesson))}</option>` : ''}</select>`;
  const fmtSeg = t==='pptx'
    ? `<span class="seg">${['2x2','single','lsa'].map(f=>`<button data-x="fmt" data-v="${f}" class="${j.fmt===f ? 'on' : ''}">${pr.FMT_NAMES[f]}</button>`).join('')}</span>`
    : `<span class="seg">${[1,2,'booklet'].map(f=>`<button data-x="layout" data-v="${f}" class="${String(j.layout)===String(f) ? 'on' : ''}">${LAYOUT_NAME[f]}</button>`).join('')}</span>`;
  const nCount = t==='pptx' ? (j.fmt==='lsa' ? lsaCount(j) : pptSlides(j).length) : selPages(j).length;
  const nAll = j.pages || 0;
  pane.innerHTML = `
    <div class="pc-ph"><span class="pc-ftype t-${t}">${FILE_IC}</span><div class="grow"><div class="pc-pt" title="${core.esc(j.file.name)}">${core.esc(j.file.name)}</div><div class="pc-ps">${TYPE_NAME[t]} · ${pr.plural(nAll, t==='pptx' ? 'slide' : 'page')} · added ${core.esc(shortDay(core.iso(new Date(j.added || Date.now()))))}</div></div></div>
    <div class="pc-form">
      <label>For</label><div>${tagSel}</div>
      ${t==='pptx' ? `<label>Class code</label><div><input class="pc-code" type="text" maxlength="40" spellcheck="false" placeholder="e.g. 10A/Fr1"></div>` : ''}
      <label>Format</label><div>${fmtSeg}</div>
      <label>${isPupils(j) ? 'Pupils' : 'Copies'}</label><div class="pc-numrow">${pr.stepperHTML(j.n)}<span class="pc-out"></span></div>
    </div>
    ${t==='docx' ? `<div class="pc-warn"><b>Word layout is approximate.</b> Check the preview: text boxes, shapes and page breaks can come out differently from Word. For an exact copy, in Word use <b>File → Save As → PDF</b> and drop the PDF here instead.<span class="pc-over"></span></div>` : ''}
    ${j.layout==='booklet' && t!=='pptx' ? `<div class="pc-warn info">A5 booklets print on their own (<b>Print booklets</b>), double-sided. In the print dialog choose <b>Print on both sides → Flip on short edge</b>, then fold the sheets in half.${selPages(j).length % 4 ? ` ${4 - selPages(j).length % 4} blank page${4 - selPages(j).length % 4 > 1 ? 's are' : ' is'} added at the end.` : ''}</div>` : ''}
    <div class="pc-tabs"><span class="seg"><button data-x="tab" data-v="preview" class="${W.tab==='preview' ? 'on' : ''}">Print preview</button><button data-x="tab" data-v="pages" class="${W.tab==='pages' ? 'on' : ''}">Choose ${t==='pptx' ? 'slides' : 'pages'} (${nCount} of ${nAll})</button></span></div>
    <div class="pc-pages"></div>`;
  const out = pane.querySelector('.pc-out'); out.textContent = jobResult(j);
  const st = pr.wireStepper(pane.querySelector('.ps-step'), n=>{ if(n>0){ j.n = n; j.auto = false; core.saveSoon(); out.textContent = jobResult(j); refreshRow(e); } });
  const code = pane.querySelector('.pc-code');
  if(code){
    code.value = typeof j.code==='string' ? j.code : (j.lesson ? j.lesson.label : '');
    let ct = null;
    code.addEventListener('input', ()=>{ j.code = code.value.trim(); core.saveSoon(); clearTimeout(ct); ct = setTimeout(()=>{ if(W && W.sel===e.key && W.tab==='preview') drawFilePages(e, pane.querySelector('.pc-pages')); }, 300); });
  }
  pane.querySelector('[data-x=tag]').onchange = ev=>{
    const id = ev.target.value, o = opts.find(x=>x.id===id) || (j.lesson && j.lesson.id===id ? j.lesson : null);
    j.lesson = o ? { id:o.id, period:o.period, label:o.label, start:o.start } : null;
    if(typeof j.code!=='string' || j.code==='' ) delete j.code;
    if(j.auto!==false) j.n = defaultN(j);
    core.saveSoon(); refreshRow(e); renderPane();
  };
  for(const b of pane.querySelectorAll('[data-x=fmt]')) b.onclick = ()=>{
    j.fmt = b.dataset.v; try{ localStorage.setItem('sv_pc_pptfmt', j.fmt); }catch(err){}
    if(j.auto!==false) j.n = defaultN(j);
    core.saveSoon(); refreshRow(e); renderPane();
  };
  for(const b of pane.querySelectorAll('[data-x=layout]')) b.onclick = ()=>{ j.layout = b.dataset.v==='booklet' ? 'booklet' : Number(b.dataset.v); core.saveSoon(); refreshRow(e); renderPane(); };
  for(const b of pane.querySelectorAll('[data-x=tab]')) b.onclick = ()=>{ W.tab = b.dataset.v; renderPane(); };
  const host = pane.querySelector('.pc-pages');
  if(W.tab==='pages') drawPicker(e, host); else drawFilePages(e, host);
}
function drawFilePages(e, host){
  const core = C(), j = e.j, gen = W.gen;
  host.innerHTML = '';
  const wait = core.el('div', 'pr-empty', 'Preparing the preview…'); host.appendChild(wait);
  source(j).then(src=>{
    if(!W || W.gen!==gen) return;
    wait.remove();
    if(j.pages!==src.count){ j.pages = src.count; core.saveSoon(); }
    if(src.over && src.over.size){ const o = W.root.querySelector('.pc-over'); if(o) o.textContent = ` Page${src.over.size>1?'s':''} ${rangeText([...src.over])} ${src.over.size>1?'are':'is'} too long for the page here, so ${src.over.size>1?'they are':'it is'} shrunk to fit.`; }
    const b = buildJob(j, src, false);
    const book = j.file.type!=='pptx' && j.layout==='booklet';
    showPages(host, b, gen, book ? (n, all)=>`Sheet ${Math.floor(n/2)+1} of ${all/2} · ${n%2 ? 'back' : 'front'}` : null);
  }).catch(err=>{ if(W && W.gen===gen){ wait.textContent = "Couldn't open the file: " + err.message; } });
}
// Tick the pages (PDF / Word) or slides (PowerPoint) to print.
function drawPicker(e, host){
  const core = C(), pr = P(), j = e.j, gen = W.gen, t = j.file.type;
  host.innerHTML = '';
  const bar = core.el('div', 'pc-pick-bar');
  const lsa = t==='pptx' && j.fmt==='lsa', single = t==='pptx' && !lsa;
  bar.innerHTML = single ? '<span>Tick the slides to print. Each one prints for every pupil.</span>' : `<span>Untick ${t==='pptx' ? 'slides' : 'pages'} to leave them out.</span><span class="grow"></span><button class="btn sm" data-x="all">All</button><button class="btn sm" data-x="none">None</button>`;
  host.appendChild(bar);
  const grid = core.el('div', 'pc-grid'); host.appendChild(grid);
  source(j).then(src=>{
    if(!W || W.gen!==gen) return;
    syncPseudo(src, j);
    const hidden = new Set(j.hidden || []);
    const isOn = i => single ? pptSlides(j).includes(i) : !(j.skip || []).includes(i);
    const set = (i, on)=>{
      if(single){ const s = new Set(j.slides || []); if(on) s.add(i); else s.delete(i); j.slides = [...s].sort((a,b)=>a-b); }
      else { const s = new Set(j.skip || []); if(on) s.delete(i); else s.add(i); j.skip = [...s].sort((a,b)=>a-b); }
      core.saveSoon(); refreshRow(e);
      const tb = W.root.querySelector('[data-x=tab][data-v=pages]'); if(tb) tb.textContent = `Choose ${t==='pptx' ? 'slides' : 'pages'} (${t==='pptx' ? (lsa ? lsaCount(j) : pptSlides(j).length) : selPages(j).length} of ${j.pages})`;
      const o = W.root.querySelector('.pc-pane .pc-out'); if(o) o.textContent = jobResult(j);
    };
    for(let i=0; i<src.count; i++){
      const hid = lsa && hidden.has(i);
      const c = core.el('div', 'pr-th pc-th' + (hid ? ' hid' : '') + (!hid && !isOn(i) ? ' off' : ''));
      c.innerHTML = `<span class="n">${i+1}</span><div class="th"></div>`;
      const th = c.querySelector('.th');
      if(hid){ th.appendChild(core.el('span', 'pr-tag', 'Hidden slide')); c.title = 'Hidden in PowerPoint, so not in the LSA pack'; }
      else {
        const cb = core.el('button', 'pr-tick'); cb.innerHTML = lucideSvg('check', 'ico');
        c.onclick = ()=>{ const now = !isOn(i); set(i, now); c.classList.toggle('off', !now); };
        th.appendChild(cb);
      }
      grid.appendChild(c);
      thumbInto(th, src, i, 150);
    }
    const allB = bar.querySelector('[data-x=all]'), noneB = bar.querySelector('[data-x=none]');
    if(allB) allB.onclick = ()=>{ j.skip = []; core.saveSoon(); refreshRow(e); renderPane(); };
    if(noneB) noneB.onclick = ()=>{ j.skip = [...Array(src.count).keys()]; core.saveSoon(); refreshRow(e); renderPane(); };
  }).catch(err=>{ if(W && W.gen===gen) grid.appendChild(core.el('div', 'pr-empty', "Couldn't open the file: " + core.esc(err.message))); });
}
function thumbInto(th, src, i, width){
  const core = C(), pr = P();
  if(src.type==='pptx'){ core.mountThumb(th, src.v, i, width, src.l, src.l.mode); return; }
  const sz = src.size(i), h = Math.round(width * sz.h / sz.w);
  const holder = core.el('div', 'thumb-box'); holder.style.cssText = `position:relative;width:${width}px;height:${h}px;overflow:hidden;background:#fff`;
  const b = src.box(i, width/pr.MM, h/pr.MM, false);
  b.el.style.left = '0'; b.el.style.top = '0'; b.el.style.outline = 'none';
  holder.appendChild(b.el);
  th.appendChild(holder);
}

/* ---------- adding files ---------- */
async function addFiles(files){
  const core = C(), pr = P(), ds = W ? W.ds : startDay();
  const ok = [], bad = [];
  for(const f of files){
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if(['pdf','docx','pptx'].includes(ext)) ok.push({ f, type:ext });
    else bad.push(ext==='doc' ? `${f.name}: old .doc files can't be read (in Word, Save As .docx or PDF)` : ext==='ppt' ? `${f.name}: old .ppt files can't be read (in PowerPoint, Save As .pptx)` : `${f.name}: not a PDF, Word or PowerPoint file`);
  }
  if(bad.length) core.toast(bad.join('; '), true);
  if(!ok.length) return;
  const ans = await askAdd(ok, ds); if(!ans) return;
  let fmtPref = '2x2'; try{ const v = localStorage.getItem('sv_pc_pptfmt'); if(['2x2','single','lsa'].includes(v)) fmtPref = v; }catch(e){}
  const added = [], failed = [];
  core.showLoading(`Adding ${pr.plural(ok.length, 'file')}…`);
  try{
    for(const { f, type } of ok){
      let path = null;
      try{
        const name = await core.uniqueName(core.safeName(`${core.PRINT_PREFIX}${ds} - ${f.name}`));
        path = await core.store.writeDeck(name, f);
        const j = { id:'j' + Math.random().toString(36).slice(2, 9), day:ds, added:Date.now(), printed:null,
          file:{ path, name:f.name, size:f.size, type }, lesson:ans.tag, n:1, auto:true, pages:0, skip:[], layout:1 };
        if(type==='pptx') j.fmt = fmtPref;
        const src = await source(j);
        j.pages = src.count;
        if(type==='pptx'){
          j.hidden = src.v.keys.filter(k=>src.v.isHidden(k));
          const first = src.v.keys.find(k=>!src.v.isHidden(k));
          j.slides = [first!=null ? first : 0];
        }
        if(ans.n!=null){ j.n = ans.n; j.auto = !ans.touched; if(type==='pptx' && j.fmt==='lsa' && !ans.touched) j.n = 1; }
        else j.n = defaultN(j);
        jobs().push(j); added.push(j);
      }catch(e){
        console.error(e);
        failed.push(`${f.name} (${e.message})`);
        if(path){ try{ await core.store.deleteDeck(path); }catch(err){} core.deckCache.delete(path); }
      }
    }
  }finally{ core.hideLoading(); }
  if(added.length){
    await core.saveNow();
    if(W){ W.ds = ds; W.mon = core.mondayOf(core.fromIso(ds)); W.sel = 'F' + added[added.length-1].id; W.tab = 'preview'; render(); }
    const word = added.some(j=>j.file.type==='docx');
    core.toast(`Added ${pr.plural(added.length, 'file')} to ${pr.dayName(ds)}'s Printer Stack` + (word ? ' · check the Word preview' : ''));
  }
  if(failed.length) setTimeout(()=>core.toast("Couldn't add " + failed.join('; '), true), added.length ? 2900 : 0);
}
// "Which lesson is it for?" and how many: { tag, n, touched } or null.
function askAdd(ok, ds){
  const core = C(), pr = P();
  const opts = dayOptions(ds);
  const pptOnly = ok.every(x=>x.type==='pptx'), anyPpt = ok.some(x=>x.type==='pptx');
  return new Promise(res=>{
    let done = false;
    const close = core.modal(`<h2>Add to ${core.esc(pr.dayName(ds))}'s Printer Stack</h2>
      <ul class="pc-files">${ok.map(x=>`<li><span class="pc-ftype t-${x.type}">${FILE_IC}</span>${core.esc(x.f.name)}</li>`).join('')}</ul>
      <div class="pc-ask"><label>Which lesson is it for?</label>
        <select class="pc-sel"><option value="">No lesson · just ${core.esc(pr.dayName(ds))}</option>${opts.map(o=>`<option value="${core.esc(o.id)}">${core.esc([o.period, o.start, o.label].filter(Boolean).join(' · '))}</option>`).join('')}</select></div>
      <div class="ps-ask"><span class="ps-q">${pptOnly ? 'How many pupils?' : anyPpt ? 'How many copies / pupils?' : 'How many copies?'}</span>${pr.stepperHTML(1)}</div>
      <div class="ps-src"></div>
      ${ok.some(x=>x.type==='docx') ? '<p class="ps-note">Word documents are laid out here, so check the preview. For an exact copy, save it as a PDF in Word and drop that instead.</p>' : ''}
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${pr.STACK_IC}Add to stack</button></div>`, (m, cl)=>{
      m.closest('.modal-back').classList.add('pc-back');
      const sel = m.querySelector('select'), src = m.querySelector('.ps-src');
      let touched = false;
      const st = pr.wireStepper(m.querySelector('.ps-step'), ()=>{ touched = true; });
      const tagOf = ()=>{ const o = opts.find(x=>x.id===sel.value); return o ? { id:o.id, period:o.period, label:o.label, start:o.start } : null; };
      const upd = ()=>{
        const tag = tagOf(), n = tagSize(tag);
        if(!touched) st.inp.value = n || 1;
        src.textContent = !tag ? 'Not for a particular lesson, so 1 to start with.' : n ? `From the ${tag.label} class list (${pr.plural(n, 'pupil')}).` : `No class list for ${tag.label}, so type the number.`;
      };
      sel.onchange = upd; upd();
      const finish = v=>{ if(done) return; done = true; cl(); res(v); };
      m.querySelector('[data-a=no]').onclick = ()=>finish(null);
      m.querySelector('[data-a=ok]').onclick = ()=>{ const n = st.val(); finish({ tag:tagOf(), n:n>0 ? n : 1, touched }); };
      st.inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); m.querySelector('[data-a=ok]').click(); } });
      // Closed by tapping outside / Esc: treated as Cancel.
      new MutationObserver((_, ob)=>{ if(!m.isConnected){ ob.disconnect(); if(!done){ done = true; res(null); } } }).observe(document.body, { childList:true });
      setTimeout(()=>sel.focus(), 30);
    });
  });
}

/* ---------- printing ---------- */
let busy = false;
let quickPdf = false; // true only while Save PDF builds the pages: lower-resolution pictures, same layout
async function collect(list, root){
  const core = C(), pr = P(), readies = [], skipped = [];
  const decks = new Map();
  let n = 0;
  for(const e of list){
    try{
      if(e.kind==='lesson'){
        const { l, it } = e;
        if(!l.files[it.mode]) throw new Error('deck removed');
        const dk = l.id + '|' + it.mode;
        if(!decks.has(dk)) decks.set(dk, { v:await core.getDeck(l, it.mode), pdfCache:new Map() });
        const { v, pdfCache } = decks.get(dk);
        if(it.fmt!=='lsa' && !v.has(it.slide)) throw new Error('slide no longer in the deck');
        if(it.fmt==='lsa' && !pr.lsaSlides(l, it.mode, v).length) throw new Error('no slides ticked');
        const ctx = { l, mode:it.mode, v, slide:it.slide, hi:quickPdf ? 'quick' : true, pdfCache };
        const copies = it.fmt==='2x2' ? Math.ceil(it.n/4) : Math.max(0, Math.floor(it.n));
        for(let c=0; c<copies; c++){ const b = pr.build(it.fmt, ctx); readies.push(b.ready); root.append(...b.pages); n += b.pages.length; }
      } else {
        const j = e.j, src = await source(j);
        if(j.pages!==src.count) j.pages = src.count;
        if(j.file.type==='pptx'){
          // Built afresh for every copy, like the lessons' items (a slide can hold canvases, which don't clone).
          syncPseudo(src, j);
          const ctx = { l:src.l, mode:src.l.mode, v:src.v, hi:quickPdf ? 'quick' : true, pdfCache:new Map() };
          if(j.fmt==='lsa'){
            if(!pr.lsaSlides(src.l, src.l.mode, src.v).length) throw new Error('no slides ticked');
            for(let c=0; c<Math.floor(j.n); c++){ const b = pr.build('lsa', ctx); readies.push(b.ready); root.append(...b.pages); n += b.pages.length; }
          } else {
            const list = pptSlides(j).filter(i=>src.v.has(i));
            if(!list.length) throw new Error('no slides ticked');
            const reps = j.fmt==='2x2' ? Math.ceil(j.n/4) : Math.floor(j.n);
            for(const i of list) for(let c=0; c<reps; c++){ const b = pr.build(j.fmt, Object.assign({}, ctx, { slide:i })); readies.push(b.ready); root.append(...b.pages); n += b.pages.length; }
          }
        } else {
          // PDF pages are shared pictures and Word pages plain HTML, so the copies are clones (once the first is ready).
          const one = buildJob(j, src, quickPdf ? 'quick' : true);
          if(!one.pages.length) throw new Error('no pages ticked');
          await one.ready;
          for(let c=0; c<Math.floor(j.n); c++) for(const p of one.pages){ root.appendChild(c ? p.cloneNode(true) : p); n++; }
        }
      }
    }catch(err){ skipped.push(`${rowTitle(e)} (${err.message})`); }
  }
  return { readies, skipped, n };
}
async function printDay(ds, mode, btn){
  if(busy) return;
  const core = C(), pr = P();
  const list = entries(ds).filter(e=>!(e.kind==='file' && e.j.layout==='booklet' && e.j.file.type!=='pptx')).filter(e=>mode!=='new' || !isDone(e));
  if(!list.length) return;
  await run(list, btn, `Printer-Stack_${ds}_${pr.dayName(ds)}`,
    `@page{ size:A4 landscape; margin:0; } @page svL{ size:A4 landscape; margin:0; } @page svP{ size:A4 portrait; margin:0; }
     #pr-print .pr-page.landscape{ page:svL; } #pr-print .pr-page.portrait{ page:svP; }`);
}
async function printBooklets(ds, btn){
  if(busy) return;
  const core = C(), pr = P();
  const books = entries(ds).filter(e=>e.kind==='file' && e.j.layout==='booklet' && e.j.file.type!=='pptx');
  const unp = books.filter(e=>!isDone(e));
  const list = unp.length ? unp : books;
  if(!list.length) return;
  const go = await core.confirmBox('Print booklets', `${pr.plural(list.length, 'booklet')} (${list.map(e=>e.j.file.name).join(', ')}). In the print dialog, open More settings and choose Print on both sides → Flip on short edge. Then fold each set of sheets in half.`, 'Print booklets');
  if(!go) return;
  await run(list, btn, `Booklets_${ds}_${pr.dayName(ds)}`, '@page{ size:A4 landscape; margin:0; }');
}
async function run(list, btn, title, css){
  const core = C(), pr = P();
  busy = true;
  const label = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
  const restore = ()=>{ busy = false; if(btn && btn.isConnected){ btn.disabled = false; btn.innerHTML = label; } if(W) renderFoot(); };
  const root = pr.newPrintRoot();
  let r;
  try{ r = await collect(list, root); }catch(e){ r = { readies:[], skipped:[e.message], n:0 }; }
  if(!r.n){ root.remove(); restore(); core.toast('Nothing could be printed: ' + r.skipped.join('; '), true); return; }
  try{ await Promise.all(r.readies); await pr.settle(root); }catch(e){ console.warn(e); }
  await pr.runPrint(root, title, css, ()=>{
    restore();
    if(W && W.root.isConnected){ const tip = W.root.querySelector('.pc-tip'); if(!tip){ const t = C().el('div', 'pc-tip', 'Did it print? Tick <b>Printed</b> on what came out (or <b>Mark all as printed</b>) so the next batch leaves it out.'); W.root.querySelector('.pc-foot').prepend(t); setTimeout(()=>t.remove(), 12000); } }
    if(r.skipped.length) core.toast('Left out: ' + r.skipped.join('; '), true);
  });
}

/* ---------- Save PDF (whole stack → one PDF file, no print dialog) ----------
   Same pages as Print stack. Each A4 page is drawn to a picture by letting the browser
   lay it out inside an SVG foreignObject (domCapture), so text boxes come out as they
   do in print. The pictures are gathered into a PDF with jsPDF (vendor/jspdf.umd.min.js,
   loaded the first time Save PDF is used). Named "Printer Stack DDMMYY.pdf" (the day's
   date). A second save on the same day gets the browser's own " (1)" suffix. If anything
   fails, nothing is saved and the toast says why; Print stack is unchanged. */
let pdfLibsPromise = null;
function loadPdfLibs(){
  if(!pdfLibsPromise){
    pdfLibsPromise = new Promise((resolve, reject)=>{
      if(window.jspdf && window.jspdf.jsPDF) return resolve();
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = ()=> (window.jspdf && window.jspdf.jsPDF) ? resolve() : reject(new Error('jsPDF did not load'));
      s.onerror = ()=> reject(new Error('Could not load vendor/jspdf.umd.min.js'));
      document.head.appendChild(s);
    }).catch(e=>{ pdfLibsPromise = null; throw e; });
  }
  return pdfLibsPromise;
}
// Draws a live element to a canvas. Computed styles are copied inline, canvases and
// pictures become data URLs, then the element is drawn by the browser inside an SVG.
async function domCapture(el, scale){
  const W = el.offsetWidth, H = el.offsetHeight;
  const clone = el.cloneNode(true);
  const live = [el, ...el.querySelectorAll('*')];
  const copy = [clone, ...clone.querySelectorAll('*')];
  const toData = url => fetch(url).then(r=>r.blob()).then(b=>new Promise((res, rej)=>{ const f = new FileReader(); f.onload = ()=>res(f.result); f.onerror = rej; f.readAsDataURL(b); }));
  for(let i = 0; i < live.length; i++){
    const lv = live[i]; let cp = copy[i];
    const cs = getComputedStyle(lv);
    let css = '';
    for(let k = 0; k < cs.length; k++){ const p = cs[k]; css += p + ':' + cs.getPropertyValue(p) + (cs.getPropertyPriority(p) ? ' !important' : '') + ';'; }
    if(lv.tagName === 'CANVAS'){
      const img = document.createElement('img'); img.src = lv.toDataURL('image/png'); img.width = lv.width; img.height = lv.height;
      cp.replaceWith(img); cp = img;
    } else if(lv.tagName === 'IMG'){
      const src = lv.currentSrc || lv.src;
      if(src && !src.startsWith('data:')) cp.setAttribute('src', await toData(src));
    }
    cp.setAttribute('style', css);
  }
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${html}</foreignObject></svg>`;
  const img = new Image();
  await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=>rej(new Error('a page would not draw')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
let pdfBusy = false;
async function savePdf(ds, btn){
  if(pdfBusy || busy) return;
  const core = C(), pr = P();
  const list = entries(ds).filter(e=>!(e.kind==='file' && e.j.layout==='booklet' && e.j.file.type!=='pptx'));
  if(!list.length) return;
  pdfBusy = true; busy = true;
  const label = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
  const restore = ()=>{ pdfBusy = false; busy = false; if(btn && btn.isConnected){ btn.disabled = false; btn.innerHTML = label; } if(W) renderFoot(); };
  const root = pr.newPrintRoot();
  let r;
  quickPdf = true;
  try{ r = await collect(list, root); }catch(e){ r = { readies:[], skipped:[e.message], n:0 }; }
  finally{ quickPdf = false; }
  if(!r.n){ root.remove(); restore(); core.toast('Nothing could be saved: ' + r.skipped.join('; '), true); return; }
  const d = ds.slice(8, 10) + ds.slice(5, 7) + ds.slice(2, 4); // DDMMYY
  const name = `Printer Stack ${d}.pdf`;
  try{
    await loadPdfLibs();
    await Promise.all(r.readies); await pr.settle(root);
    const pages = [...root.querySelectorAll('.pr-page')];
    const JsPDF = window.jspdf.jsPDF;
    let doc = null;
    for(let k = 0; k < pages.length; k++){
      if(btn) btn.textContent = `Saving ${k + 1} of ${pages.length}…`;
      const el = pages[k], land = el.classList.contains('landscape');
      const w = land ? 297 : 210, h = land ? 210 : 297;
      const canvas = await domCapture(el, 1.5);
      const img = canvas.toDataURL('image/jpeg', 0.9);
      if(!doc) doc = new JsPDF({ unit:'mm', format:'a4', orientation:land ? 'l' : 'p', compress:true });
      else doc.addPage('a4', land ? 'l' : 'p');
      doc.addImage(img, 'JPEG', 0, 0, w, h);
    }
    doc.save(name);
    core.toast(r.skipped.length ? `Saved ${name} · left out: ${r.skipped.join('; ')}` : `Saved ${name}`, !!r.skipped.length);
  }catch(e){
    console.warn(e);
    core.toast('Could not save the PDF (' + e.message + '). Print stack still works.', true);
  }finally{
    root.remove(); restore();
  }
}

/* ---------- keys / resize ---------- */
document.addEventListener('keydown', e=>{
  if(!W || (SVPrint.state)) return;
  if(document.querySelector('.modal-back')) return; // a pop-up handles its own keys (print.js closes .ps-back on Esc)
  if(e.target.closest && e.target.closest('input,textarea,select')){ if(e.key==='Escape') e.target.blur(); return; }
  if(e.key==='Escape'){ e.preventDefault(); close(); }
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape' || !W) return;
  const pop = document.querySelector('.modal-back.pc-back'); if(pop){ e.preventDefault(); e.stopPropagation(); pop.remove(); }
}, true);
window.addEventListener('resize', ()=>{ if(W){ clearTimeout(W.rz); W.rz = setTimeout(renderPane, 200); } });

window.SVPrintCentre = { open, close, refresh, topButton, todayCount:()=>waiting(todayIso()), entries, get state(){ return W; },
  _: { buildJob, source, jobSheets, jobResult, selPages } };
})();
