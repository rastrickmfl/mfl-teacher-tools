/* Sentence Builders — editor (v0.6, 2026-10-20: new editor layout; respellings made here, shown only in the presenter)
   A separate page from the Slideshow Viewer. Uses the viewer's folder (same IndexedDB handle), and saves
   one file per builder: Sentence Builders/Year N/<half-term>/<Title>.sb.json
   Spec: project doc claude/sentence-builder-editor-spec.md
   Shared parts (house style, model, renderer, auto-fit, folder) are in sb-core.js (window.SBCore). */
(function(){
'use strict';

const { TIERS, hasTier, termShort, filterBuilders, byTitle, filterRows, applyFilter, emptyText } = window.SBCore;
const { VERSION, SB_DIR, BIN_DIR, YEARS, TERMS, LANGS, MM, PT, PAPERS, SIZES, GMAX, EN_RATIO, VERSIONS, COLOURS, SHEET_CSS, esc, clone, uid, fileSafe, lname, currentTerm, newDoc, newCol, newItem, normalise, groupCount, itemCount, displayTitle, marksToArr, richText, chunk, measure, fits, sheetHTML, fitPaper, layoutFor, shiftPhon, phonFind, Store } = window.SBCore;

/* ================= small helpers ================= */
const $ = (s, el) => (el || root || document).querySelector(s);
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };
function toast(msg, action){
  const old = $('.sb-toast'); if(old) old.remove();
  const t = document.createElement('div'); t.className = 'sb-toast';
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '');
  (root || document.body).appendChild(t);
  if(action) t.querySelector('button').onclick = () => { t.remove(); action.fn(); };
  setTimeout(() => t.remove(), action ? 8000 : 3500);
}
function closeMenus(){ (root || document).querySelectorAll('.sb-menu').forEach(m => m.remove()); }
function menu(x, y, items){
  closeMenus();
  const m = document.createElement('div'); m.className = 'sb-menu';
  items.forEach(it => { const b = document.createElement('button'); b.textContent = it.label; b.onclick = e => { e.stopPropagation(); closeMenus(); it.fn(); }; m.appendChild(b); });
  (root || document.body).appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('click', closeMenus, { once:true }), 0);
}
function modal(html, onReady){
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="sb-modal">${html}</div>`;
  (root || document.body).appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('mousedown', e => { if(e.target === bg) close(); });
  onReady(bg.firstChild, close);
  return close;
}

function arrToMarks(a, lang){ const out = []; let i = 0; while(i < a.length){ if(a[i]){ const c = a[i], s = i; while(i < a.length && a[i] === c) i++; out.push({ lang, s, e:i, c }); } else i++; } return out; }
function setMarks(item, lang, arr){ item.marks = (item.marks || []).filter(m => m.lang !== lang).concat(arrToMarks(arr, lang)); }
// Keep colour marks lined up when the text is edited (shift marks after the change; drop the changed part).
function editText(item, lang, nv){
  const ov = item[lang]; if(ov === nv) return;
  const oa = marksToArr(item.marks, lang, ov.length);
  let p = 0; while(p < ov.length && p < nv.length && ov[p] === nv[p]) p++;
  let s = 0; while(s < ov.length - p && s < nv.length - p && ov[ov.length - 1 - s] === nv[nv.length - 1 - s]) s++;
  const na = oa.slice(0, p).concat(new Array(nv.length - p - s).fill(''), oa.slice(ov.length - s));
  if(lang === 'tl' && item.phon) item.phon = shiftPhon(item.phon, p, ov.length - s, nv.length - s);
  item[lang] = nv; setMarks(item, lang, na);
}

/* ================= paste parsing ================= */
// Splits Excel-style tab text into rows of cells, honouring quoted cells (Excel quotes cells that contain line breaks).
function parseTSV(text){
  const rows = []; let row = [], cell = '', i = 0, q = false;
  text = text.replace(/\r\n?/g, '\n');
  while(i < text.length){
    const ch = text[i];
    if(q){ if(ch === '"'){ if(text[i+1] === '"'){ cell += '"'; i += 2; continue; } q = false; i++; continue; } cell += ch; i++; continue; }
    if(ch === '"' && cell === ''){ q = true; i++; continue; }
    if(ch === '\t'){ row.push(cell); cell = ''; i++; continue; }
    if(ch === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if(cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.replace(/\n+/g, ' / ').replace(/\s+/g, ' ').trim()));
}
const SEP = /\s+[–—=|]\s+|\s+-\s+/;
// One column's worth of text → groups of items. Accepts: two Excel columns, "TL – EN" lines, or alternating lines.
// A blank line starts a new group.
function parseColumn(text){
  const rows = parseTSV(text);
  const blocks = []; let cur = [];
  rows.forEach(r => { const cells = r.filter((c, i) => i < 2 || c); if(cells.every(c => !c)){ if(cur.length){ blocks.push(cur); cur = []; } } else cur.push(cells); });
  if(cur.length) blocks.push(cur);
  const anyTab = rows.some(r => r.length > 1 && r[1]);
  const anySep = rows.some(r => r.length === 1 && SEP.test(r[0]));
  return blocks.map(b => {
    if(anyTab) return b.map(c => newItem(c[0] || '', c[1] || ''));
    if(anySep) return b.map(c => { const m = (c[0] || '').split(SEP); return newItem(m[0].trim(), m.slice(1).join(' - ').trim()); });
    const out = []; for(let i = 0; i < b.length; i += 2) out.push(newItem(b[i][0], b[i+1] ? b[i+1][0] : '')); return out;
  });
}
// A whole builder from Excel: columns side by side as pairs (TL | EN | TL | EN …). An empty pair starts a new group in that column.
function parseWhole(text, titlesInFirstRow){
  const rows = parseTSV(text); if(!rows.length) return [];
  const width = Math.max(...rows.map(r => r.length)), pairs = Math.ceil(width / 2), cols = [];
  for(let p = 0; p < pairs; p++){
    const col = newCol(''); let r0 = 0;
    if(titlesInFirstRow){ col.title = [rows[0][p*2], rows[0][p*2+1]].filter(Boolean).join(' '); r0 = 1; }
    const groups = []; let g = [];
    for(let r = r0; r < rows.length; r++){
      const tl = rows[r][p*2] || '', en = rows[r][p*2+1] || '';
      if(!tl && !en){ if(g.length){ groups.push(g); g = []; } } else g.push(newItem(tl, en));
    }
    if(g.length) groups.push(g);
    col.groups = groups.length ? groups : [[]];
    if(col.title || itemCount(col)) cols.push(col);
  }
  return cols;
}


/* ================= app state ================= */
// session: counts editor openings, so a save that finishes after the editor closed doesn't write into the next one.
// renamePending: the title box was left, so the file takes the new title. forceNext: overwrite a changed file (after the user chose so).
const S = { view:'home', list:[], filter:{ q:'', lang:'', year:null, term:'', tier:'' }, nav:{ lang:null, year:null, tier:'', term:null }, doc:null, loc:null, tab:'columns', wizard:false, setupOpen:false, open:0, version:'both', mode:'edit', zoom:'page', side:true, focus:null, lay:null, saveState:'', dirty:false, session:0, renamePending:false, forceNext:false, conflict:null };
const hasPhon = d => d.cols.some(c => c.groups.some(g => g.some(it => it.phon && it.phon.length)));
// The builder draws into one host element (root). It's mounted into Settings (app.js) or into #app on builder.html.
let root = null;
const live = () => !!(root && root.isConnected);
// Set by mount(el, { onHome }) in Settings: opens the dashboard from the editor's header.
let dashHome = null;
// While the editor is open inside Settings, the Settings side menu is hidden (builder.css / styles.css: .sb-editing).
const navHidden = on => { const l = root && root.closest('.set-layout'); if(l) l.classList.toggle('sb-editing', !!on); };
const app = () => root;
// Lucide icons come from the viewer's icons.js; builder.html has none, so it falls back to plain text.
const ico = (name, fallback) => (window.lucideSvg ? window.lucideSvg(name) : fallback);

/* ================= home ================= */
async function showHome(){
  preview.cancel && preview.cancel();
  if(S.doc && S.dirty) await saveNow();
  S.view = 'home'; S.doc = null; S.loc = null; S.mode = 'edit'; S.conflict = null; S.session++; closeRespPop();
  if(Store.state === 'ok'){ try{ S.list = await Store.list(); }catch(e){ console.error(e); S.list = []; toast('Couldn\'t read the Sentence Builders folder.'); } }
  renderHome();
}
function renderHome(){
  if(!live()) return; // an async load finished after the builder was unmounted
  navHidden(false);
  const st = Store.state;
  let body = '';
  if(st !== 'ok'){
    const msg = st === 'unsupported' ? 'This page needs Microsoft Edge (or Chrome) to save to your data folder.'
      : st === 'prompt' ? 'Edge needs your permission again to use your data folder.'
      : 'Choose your data folder (the same one the viewer uses). Sentence builders are saved in its <b>Sentence Builders</b> folder.';
    body = `<div class="connect"><h2>Connect your folder</h2><p>${msg}</p><div class="btnrow">
      ${st === 'prompt' ? '<button class="sb-primary" data-a="reconnect">Reconnect</button>' : ''}
      ${st !== 'unsupported' ? `<button ${st === 'prompt' ? '' : 'class="sb-primary"'} data-a="pick">Choose folder</button>` : ''}
      <button data-a="try">Try it without saving</button></div></div>`;
  } else {
    body = `<div class="home-tools"><input type="text" id="h-q" placeholder="Search everything" value="${esc(S.filter.q)}"></div>`;
    if(!S.list.length) body += `<div class="sb-msg">No sentence builders yet. <br><br><button class="sb-primary" data-a="new">New sentence builder</button></div>`;
    else if(S.filter.q.trim()) body += searchResults();
    else body += navColumns();
  }
  app().innerHTML = `<div class="top"><h1>Sentence builders</h1><span class="sb-grow"></span>
    ${st === 'ok' ? `<button class="sb-ghost sb-icon" data-a="refresh" title="Refresh">${ico('rotate-cw', '↻')}</button><button class="sb-primary" data-a="new">${ico('plus', '')}New sentence builder</button>` : ''}</div>
    <p class="sb-intro">One builder makes the printed sheet for pupils' books and the picture for slides. They're saved in the Sentence Builders folder, which the Tools box in a lesson reads.</p><div class="home">${body}</div>`;
  const a = app();
  a.onclick = async e => {
    const more = e.target.closest('[data-more]');
    if(more){ e.stopPropagation(); const x = S.list[+more.dataset.more], r = more.getBoundingClientRect(); const other = x.doc.lang === 'fr' ? 'es' : 'fr';
      return menu(r.left, r.bottom + 4, [
        { label:'Open', fn:() => openDoc(x) },
        { label:'Rename or move…', fn:() => openDoc(x, true) },
        ...(x.loc.year == null ? [] : [{ label:'Move to Uncategorised', fn:() => moveTo(x, true) }]),
        { label:'Duplicate', fn:() => duplicate(x.doc, false) },
        { label:`Make a ${LANGS[other].name} version`, fn:() => duplicate(x.doc, true) },
        { label:'Delete', fn:() => del(x) },
      ]); }
    const nb = e.target.closest('[data-bnav]'); if(nb){ navigate(nb.dataset.bnav, nb.dataset.val); return renderHome(); }
    const card = e.target.closest('[data-open]'); if(card) return openDoc(S.list[+card.dataset.open]);
    const act = e.target.closest('[data-a]'); if(!act) return;
    const k = act.dataset.a;
    try{
      if(k === 'pick'){ await Store.pick(); showHome(); }
      else if(k === 'reconnect'){ await Store.reconnect(); showHome(); }
      else if(k === 'try'){ openEditor(newDoc(), null); }
      else if(k === 'refresh'){ showHome(); }
      else if(k === 'new'){ openEditor(newDoc(), null); }
    }catch(err){ if(err.name !== 'AbortError') toast(err.message); }
  };
  const hq = $('#h-q'); if(hq) hq.oninput = () => { S.filter.q = hq.value; const pos = hq.selectionStart; renderHome(); const n = $('#h-q'); n.focus(); n.setSelectionRange(pos, pos); };
}
/* ---- home: Finder-style columns (2026-10-21) ----
   Language (Uncategorised · French · Spanish) → Year → Tier (Years 10–11 only) → Half-term → builders.
   Each click fills the next column. Search replaces the columns with one list. Single click opens a builder. */
const isUncat = x => x.loc.year == null;
const navItem = (attr, val, label, n, on, extra) => `<button type="button" class="col-item${on ? ' on' : ''}${n ? '' : ' empty'}" data-bnav="${attr}" data-val="${esc(String(val))}"><span class="col-l">${esc(label)}${extra || ''}</span><span class="col-n">${n}</span></button>`;
const navCol = (title, items) => `<div class="col"><div class="col-h">${esc(title)}</div>${items.join('')}</div>`;
function buildCard(x){
  const k = S.list.indexOf(x), d = x.doc;
  return `<div class="sb-li" data-open="${k}"><div class="sb-li-main"><div class="t">${esc(displayTitle(d))}</div><div class="m"><span class="lang ${d.lang}">${LANGS[d.lang].short}</span>${hasTier(x.loc.year) && d.tier ? `<span class="tier">${TIERS[d.tier]}</span>` : ''}${d.cols.length} columns · ${new Date(x.mtime).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</div></div><button class="sb-ghost sb-icon" data-more="${k}" title="More">${ico('ellipsis-vertical', '⋯')}</button></div>`;
}
function listCol(rows, title){
  const sorted = rows.slice().sort(byTitle);
  return `<div class="col col-list"><div class="col-h">${esc(title)} · ${sorted.length}</div>${sorted.length ? `<div class="sb-list">${sorted.map(buildCard).join('')}</div>` : '<div class="col-empty">No builders here yet.</div>'}</div>`;
}
function navColumns(){
  const n = S.nav, L = S.list, now = currentTerm(), cols = [];
  const langN = k => L.filter(x => k === 'uncat' ? isUncat(x) : !isUncat(x) && x.doc.lang === k).length;
  cols.push(navCol('Language', [['uncat', 'Uncategorised'], ['fr', 'French'], ['es', 'Spanish']].map(([k, l]) => navItem('lang', k, l, langN(k), n.lang === k))));
  if(n.lang === 'uncat') cols.push(listCol(L.filter(isUncat), 'Uncategorised'));
  else if(n.lang){
    const inLang = L.filter(x => !isUncat(x) && x.doc.lang === n.lang);
    cols.push(navCol('Year', YEARS.map(y => navItem('year', y, 'Year ' + y, inLang.filter(x => x.loc.year === y).length, n.year === y))));
    if(n.year){
      const inYear = inLang.filter(x => x.loc.year === n.year);
      if(hasTier(n.year)) cols.push(navCol('Tier', [navItem('tier', '', 'Both tiers', inYear.length, !n.tier)].concat(Object.entries(TIERS).map(([k, l]) => navItem('tier', k, l, inYear.filter(x => !x.doc.tier || x.doc.tier === k).length, n.tier === k)))));
      const inTier = inYear.filter(x => !n.tier || !x.doc.tier || x.doc.tier === n.tier);
      cols.push(navCol('Half-term', TERMS.map(t => navItem('term', t, termShort(t), inTier.filter(x => x.loc.term === t).length, n.term === t, t === now ? '<b class="now">now</b>' : ''))));
      if(n.term) cols.push(listCol(inTier.filter(x => x.loc.term === n.term), termShort(n.term)));
    }
  }
  return `<div class="cols">${cols.join('')}</div>`;
}
function searchResults(){
  const hits = filterBuilders(S.list, { q:S.filter.q, lang:'', year:null, term:'', tier:'' });
  return hits.length ? `<div class="sb-results"><div class="col-h">Matching · ${hits.length}</div><div class="sb-list">${hits.sort(byTitle).map(buildCard).join('')}</div></div>` : `<div class="sb-msg">Nothing matches.</div>`;
}
// A click in the columns: picking a language or year clears the levels below it.
function navigate(attr, val){
  const n = S.nav;
  if(attr === 'lang'){ n.lang = val; n.year = null; n.tier = ''; n.term = null; }
  else if(attr === 'year'){ n.year = +val; n.tier = ''; n.term = null; }
  else if(attr === 'tier') n.tier = val;
  else if(attr === 'term') n.term = val;
}
// Moves a builder to Uncategorised (or back is done from Set up). Keeps its name unless one clashes.
async function moveTo(x, uncat){
  try{
    const d = clone(x.doc); d.uncat = uncat;
    await Store.save(d, x.loc);
    await showHome(); toast(`Moved “${displayTitle(d)}” to Uncategorised`);
  }catch(e){ toast(e.name === 'Conflict' ? 'That builder changed on another computer. Open it to see the other version.' : 'Couldn\'t move it: ' + e.message); }
}
// Reads a builder's file again from the folder, so the editor never opens an out-of-date copy from the list.
// An Uncategorised builder (no year folder) is marked doc.uncat, so saving keeps it there until Set up files it.
async function readFresh(loc){
  const dir = await Store.folder(loc.year, loc.term, false);
  const f = await (await dir.getFileHandle(loc.name)).getFile();
  const doc = normalise(JSON.parse(await f.text())); doc.uncat = loc.year == null;
  return { doc, loc: Object.assign({}, loc, { mtime: f.lastModified }) };
}
// setup: open with the Set up fields showing (Rename or move…).
async function openDoc(x, setup){
  try{ const r = await readFresh(x.loc); openEditor(r.doc, r.loc); if(setup){ S.setupOpen = true; renderEditor(); } }
  catch(e){ toast(e.name === 'NotFoundError' ? 'That builder was moved or deleted on another computer.' : 'Couldn\'t open it: ' + e.message); showHome(); }
}
// Toast with Undo: puts the columns back as they were before a change.
function undoable(msg, before){
  const d = S.doc;
  toast(msg, { label:'Undo', fn:() => { if(S.doc !== d) return; d.cols = before; S.open = -1; changed(true); } });
}
// Dashboard button (Settings only): save any changes, leave the builder, then open the viewer's dashboard.
async function goDash(){
  if(S.dirty) await saveNow();
  const go = dashHome; unmount(); if(go) go();
}
async function duplicate(src, otherLang){
  const d = normalise(clone(src));
  if(otherLang){
    const from = lname(d); d.lang = d.lang === 'fr' ? 'es' : 'fr'; const to = lname(d);
    d.q.tl = ''; d.cols.forEach(c => c.groups.forEach(g => g.forEach(it => { it.tl = ''; it.say = ''; delete it.phon; it.marks = it.marks.filter(m => m.lang !== 'tl'); })));
    d.title = new RegExp(from, 'i').test(d.title) ? d.title.replace(new RegExp(from, 'ig'), to) : displayTitle(src) + ` (${to})`;
  } else d.title = displayTitle(src) + ' (copy)';
  try{ const loc = await Store.save(d, null); openEditor(d, loc); if(otherLang) toast(`${lname(d)} version made: English kept, ${lname(d)} boxes are empty.`); }catch(e){ toast('Couldn\'t save: ' + e.message); }
}
async function del(x){
  try{
    const bin = await Store.toBin(x.loc); await showHome();
    toast(`Deleted “${displayTitle(x.doc)}”`, { label:'Undo', fn:async () => { await Store.fromBin(bin, x.loc); showHome(); } });
  }catch(e){ toast('Couldn\'t delete: ' + e.message); }
}

/* ================= editor ================= */
/* v0.6 layout (2026-10-20):
   - Header: back, title, a summary of the builder (year · half-term · language), save state, ⋯ (Duplicate / other language) and Export ▾.
   - Sidebar: a NEW builder gets numbered steps (Set up → Columns → Layout, with Back / Next). A saved builder gets two tabs,
     Content (the Set up details as a one-line summary with Edit, then the columns) and Layout. Opens on Content.
   - Preview: version buttons, Fit page / Fit width, hide panel; then "Click on the page to:" Edit | Colour | Gaps | Respellings,
     and the fit chip (paper · size, amber / red when it doesn't fit A5 or doesn't fit at all). Click the chip for Layout.
   - Edit mode: clicking an item or column title on the page opens it in the sidebar; the box being typed in is outlined on the page.
   - Respellings are no longer printed or in the slide image. They're made here (Respellings mode: click a chunk) and shown in the
     lesson presenter's pop-out. */
const WIDE_SIDE = () => { try{ return localStorage.getItem('sb-side') !== 'off'; }catch(e){ return true; } };
const TABS_WIZ = [['setup', 'Set up'], ['columns', 'Columns'], ['layout', 'Layout']];
const TABS_SAVED = [['columns', 'Content'], ['layout', 'Layout']];
const MODES = [['edit', 'Edit'], ['colour', 'Colour'], ['gaps', 'Gaps'], ['resp', 'Respellings']];
function openEditor(doc, loc){
  S.view = 'edit'; S.doc = normalise(doc); S.loc = loc; S.open = 0; S.dirty = false;
  // A new builder walks through the steps; a saved one opens on Content, ready to export (Export is in the header).
  S.wizard = !loc; S.tab = loc ? 'columns' : 'setup'; S.setupOpen = false;
  S.mode = 'edit'; S.version = S.version === 'gaps' ? 'both' : S.version; S.focus = null; S.side = WIDE_SIDE(); S.zoom = S.zoom || 'page';
  S.session++; S.conflict = null; S.renamePending = false; closeRespPop();
  S.saveState = loc ? 'Saved' : (Store.state === 'ok' ? '' : 'Not connected: changes aren\'t saved');
  renderEditor();
}
const summaryText = d => d.uncat ? `Uncategorised · ${lname(d)}` : `Year ${d.year} · ${termShort(d.term)} · ${lname(d)}${hasTier(d.year) && d.tier ? ' · ' + TIERS[d.tier] : ''}`;
function renderEditor(){
  if(!live()) return;
  navHidden(true);
  const d = S.doc;
  app().innerHTML = `<div class="top"><button class="sb-ghost" data-a="home">${ico('chevron-left', '← ')}All builders</button>${dashHome ? `<button class="sb-ghost" data-a="dash">${ico('house', '⌂')}Dashboard</button>` : ''}<h1 id="ed-title">${esc(displayTitle(d))}</h1>
    <span class="ed-sum" id="ed-sum">${esc(summaryText(d))}</span>
    <span class="sb-grow"></span><span class="save-state" id="save-state"></span>
    <button class="sb-ghost sb-icon" data-a="more" title="Duplicate or make a ${d.lang === 'fr' ? 'Spanish' : 'French'} version">${ico('ellipsis-vertical', '⋯')}</button>
    <button class="sb-primary" data-a="export" id="exp-btn">${ico('download', '')}<span id="exp-lbl">Export</span> ▾</button></div>${conflictBanner()}
    <div class="ed${S.side ? '' : ' no-side'}" id="ed"><div class="side" id="side"></div>
    <div class="pv"><div class="sb-pv-bar">
        <button class="sb-ghost sb-small pv-side" data-a="side" title="${S.side ? 'Hide the panel for a bigger page' : 'Show the panel'}">${S.side ? '⇤ Hide panel' : '⇥ Show panel'}</button>
        <div class="sb-seg" id="ver">${Object.keys(VERSIONS).map(v => `<button data-v="${v}" class="${S.version === v ? 'on' : ''}">${esc(VERSIONS[v].replace('@', lname(d)))}</button>`).join('')}</div>
        <span class="sb-grow"></span>
        <div class="sb-seg" id="zoom"><button data-z="page" class="${S.zoom === 'page' ? 'on' : ''}" title="Whole page">Fit page</button><button data-z="width" class="${S.zoom === 'width' ? 'on' : ''}" title="Page as wide as the panel; scroll down">Fit width</button></div></div>
      <div class="sb-pv-bar sb-pv-bar2"><span class="pv-lbl">Click on the page to:</span><div class="sb-seg" id="mode">${MODES.map(([k, l]) => `<button data-m="${k}" class="${S.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="sb-grow"></span><button class="fitchip" id="fitchip" data-a="fitchip" title="Paper and text size. Click for Layout."></button></div>
      <div class="pv-hint" id="pv-hint"></div>
      <div class="pv-stage" id="stage"></div></div></div>`;
  updateSaveState();
  renderSide();
  preview.flush();
  bindEditor();
}
function renderSide(){
  const side = $('#side'); if(!side) return;
  const tabs = S.wizard ? TABS_WIZ : TABS_SAVED, idx = tabs.findIndex(t => t[0] === S.tab);
  side.innerHTML = `<div class="steps">${tabs.map(([k, l], i) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${S.wizard ? `<b>${i+1}</b>` : ''}${l}</button>`).join('')}</div>
    <div class="pane" id="pane"></div>
    ${S.wizard ? `<div class="pane-foot"><button data-a="prev" ${idx <= 0 ? 'disabled' : ''}>Back</button>${idx < tabs.length - 1 ? '<button class="sb-primary" data-a="next">Next</button>' : '<button class="sb-primary" data-a="finish">Finish</button>'}</div>` : ''}`;
  renderPane();
}
function setTab(t){ S.tab = t; renderSide(); }
function setMode(m){
  S.mode = m; closeRespPop(); clearFmtBar();
  if(m === 'gaps') S.version = 'gaps';
  else if(S.version === 'gaps') S.version = 'both';
  if(m === 'resp' && S.version === 'en') S.version = 'both';
  (root || document).querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  (root || document).querySelectorAll('#ver button').forEach(b => b.classList.toggle('on', b.dataset.v === S.version));
  preview();
}
function bindEditor(){
  $('#stage').onclick = onStageClick;
  app().onclick = e => {
    const cb = e.target.closest('[data-c]'); if(cb && S.conflict && cb.closest('.conflict')) return resolveConflict(cb.dataset.c);
    const tb = e.target.closest('[data-tab]'); if(tb) return setTab(tb.dataset.tab);
    const v = e.target.closest('#ver [data-v]'); if(v){
      S.version = v.dataset.v;
      if(S.version === 'gaps') return setMode('gaps');
      if(S.mode === 'gaps') return setMode('edit');
      if(S.mode === 'resp' && S.version === 'en') return setMode('edit');
      (root || document).querySelectorAll('#ver button').forEach(b => b.classList.toggle('on', b === v)); return preview(); }
    const m = e.target.closest('#mode [data-m]'); if(m) return setMode(m.dataset.m);
    const z = e.target.closest('#zoom [data-z]'); if(z){ S.zoom = z.dataset.z; (root || document).querySelectorAll('#zoom button').forEach(b => b.classList.toggle('on', b === z)); return drawPreview(); }
    const a = e.target.closest('.top [data-a], .pane-foot [data-a], .sb-pv-bar [data-a]'); if(!a) return;
    const k = a.dataset.a, tabs = S.wizard ? TABS_WIZ : TABS_SAVED, idx = tabs.findIndex(t => t[0] === S.tab);
    if(k === 'home') return showHome();
    if(k === 'dash') return goDash();
    if(k === 'export') return exportMenu(a);
    if(k === 'more') return moreMenu(a);
    if(k === 'side') return toggleSide();
    if(k === 'fitchip'){ if(!S.side) toggleSide(); return setTab('layout'); }
    if(k === 'prev' && idx > 0) return setTab(tabs[idx - 1][0]);
    if(k === 'next'){ if(S.tab === 'columns' && !S.doc.cols.length) return toast('Add some columns first.'); return setTab(tabs[idx + 1][0]); }
    if(k === 'finish'){ S.wizard = false; S.tab = 'columns'; renderSide(); return toast(Store.state === 'ok' ? 'Saved. Print, copy the slide image or download it all from Export at the top.' : 'Done. Connect your folder to save it.'); }
  };
}
function toggleSide(){
  S.side = !S.side; try{ localStorage.setItem('sb-side', S.side ? 'on' : 'off'); }catch(e){}
  const ed = $('#ed'); if(ed) ed.classList.toggle('no-side', !S.side);
  const b = $('.sb-pv-bar [data-a="side"]'); if(b){ b.textContent = S.side ? '⇤ Hide panel' : '⇥ Show panel'; b.title = S.side ? 'Hide the panel for a bigger page' : 'Show the panel'; }
  drawPreview();
}
// Click on the page, by mode.
function onStageClick(e){
  const d = S.doc;
  if(S.mode === 'colour') return; // handled on mouseup (select text)
  const th = e.target.closest('.sb-h[data-c]'), it = e.target.closest('.sb-it');
  if(S.mode === 'gaps'){
    if(th){ const c = d.cols[+th.dataset.c]; if(!c) return; const all = c.groups.every(g => g.every(x => x.gap));
      c.groups.forEach(g => g.forEach(x => { if(all) delete x.gap; else x.gap = true; })); return gapsChanged(); }
    if(!it) return;
    const item = d.cols[+it.dataset.c].groups[+it.dataset.g][+it.dataset.i]; if(item.gap) delete item.gap; else item.gap = true;
    return gapsChanged();
  }
  if(S.mode === 'resp'){ if(it) openRespPop(+it.dataset.c, +it.dataset.g, +it.dataset.i, it); return; }
  // Edit: open what was clicked in the sidebar.
  if(!th && !it && !e.target.closest('.sb-q')) return;
  if(!S.side) toggleSide();
  if(e.target.closest('.sb-q') && !th && !it){
    if(S.wizard) setTab('setup'); else { S.setupOpen = true; setTab('columns'); }
    return focusSel(`[data-setup] [data-k="${e.target.closest('.qen') ? 'q.en' : 'q.tl'}"]`);
  }
  const ci = +(th || it).dataset.c; if(!d.cols[ci]) return;
  S.open = ci; setTab('columns');
  if(th) return focusSel(`[data-col="${ci}"] [data-k="title"]`);
  focusItem(ci, +it.dataset.g, +it.dataset.i, e.target.closest('.en') ? 'en' : 'tl');
}
// The box being typed in, outlined on the page.
function markFocus(){
  const st = $('#stage'); if(!st) return;
  st.querySelectorAll('.sb-focus').forEach(x => x.classList.remove('sb-focus'));
  const f = S.focus; if(!f) return;
  const sel = f.i != null ? `.sb-it[data-c="${f.c}"][data-g="${f.g}"][data-i="${f.i}"]` : `.sb-h[data-c="${f.c}"]`;
  const el = st.querySelector(sel); if(!el) return;
  el.classList.add('sb-focus');
  // Fit width: keep it in view.
  if(S.zoom === 'width'){ const r = el.getBoundingClientRect(), sr = st.getBoundingClientRect(); if(r.top < sr.top || r.bottom > sr.bottom) st.scrollTop += r.top - sr.top - sr.height / 3; }
}
function gapsChanged(){ S.dirty = true; drawPreview(); autosave(); }
function changed(structural){
  S.dirty = true; $('#ed-title').textContent = displayTitle(S.doc);
  const sum = $('#ed-sum'); if(sum) sum.textContent = summaryText(S.doc);
  if(structural) renderPane();
  preview(); autosave();
}

/* ---------- header menus ---------- */
function popMenu(anchor, html, onPick){
  closeMenus();
  const m = document.createElement('div'); m.className = 'sb-menu sb-menu-rich'; m.innerHTML = html;
  (root || document.body).appendChild(m);
  const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.right - mr.width, innerWidth - mr.width - 8)) + 'px'; m.style.top = (r.bottom + 4) + 'px';
  m.onclick = e => { const b = e.target.closest('[data-x]'); if(!b) return; e.stopPropagation(); closeMenus(); onPick(b.dataset.x); };
  setTimeout(() => document.addEventListener('click', closeMenus, { once:true }), 0);
}
function exportMenu(btn){
  const d = S.doc, L = S.lay, pl = L ? L.paper.label : '', v = VERSIONS[S.version].replace('@', lname(d));
  const it = (k, t, s) => `<button data-x="${k}">${t}<small>${s}</small></button>`;
  popMenu(btn, `<div class="sb-menu-h">Version on the page: <b>${esc(v)}</b></div>`
    + it('print', 'Print or save as PDF', `${pl === 'A5' ? 'Two A5 copies on each A4 sheet, with a cut line' : pl === 'A4 folded' ? 'A4 landscape, with fold marks' : 'A4 landscape'}. In Edge, Margins: None, Scale: 100.`)
    + it('png', 'Copy image for slides', '16:9, laid out for the slide. Paste it into PowerPoint.')
    + it('pngdl', 'Download image for slides', 'The same picture as a .png file.')
    + `<div class="sb-menu-sep"></div>`
    + it('zip', 'Download all (.zip)', `PDF + editable PowerPoint: 16:9 full, English only, ${esc(lname(d))} only; A4 full; A5 two to a page (when it fits).`),
    k => { if(k === 'print') printSheet(); if(k === 'png') slideImage(false); if(k === 'pngdl') slideImage(true); if(k === 'zip') downloadAll(); });
}
function moreMenu(btn){
  const d = S.doc, other = d.lang === 'fr' ? 'Spanish' : 'French';
  popMenu(btn, `<button data-x="dup">Duplicate<small>Same language, for a variation.</small></button><button data-x="other">Make a ${other} version<small>Keeps the English and the layout; the ${other} boxes start empty.</small></button>`,
    k => { if(Store.state !== 'ok') return toast('Connect your folder first.'); duplicate(d, k === 'other'); });
}

/* ---------- sidebar panes ---------- */
function renderPane(){
  const p = $('#pane'); if(!p) return; const d = S.doc;
  if(S.tab === 'setup') p.innerHTML = paneSetup(d, true);
  if(S.tab === 'columns') p.innerHTML = (S.wizard ? '' : setupCard(d)) + paneColumns(d);
  if(S.tab === 'layout') p.innerHTML = paneLayout(d);
  bindPane(p);
}
// Short guidance under an ⓘ. Open while a new builder is being made, closed after that.
const help = (html, label) => `<details class="sb-help"${S.wizard ? ' open' : ''}><summary>ⓘ ${label || 'How this works'}</summary><div>${html}</div></details>`;
function setupCard(d){
  if(S.setupOpen) return `<div class="setup-open">${paneSetup(d, false)}<button data-a="setupdone" class="sb-small">Done</button></div>`;
  const where = !S.loc ? 'Not saved yet' : S.loc.year == null ? 'Saved in Sentence Builders › Uncategorised' : `Saved in Sentence Builders › Year ${S.loc.year} › ${termShort(S.loc.term)}`;
  return `<div class="setup-card"><div class="setup-main"><div class="setup-q"><b>${esc(d.q.tl) || '<span class="sb-muted">No question</span>'}</b> ${esc(d.q.en)}</div>
    <div class="sb-small sb-muted">${esc(summaryText(d))} · ${esc(where)}</div></div><button class="sb-small" data-a="setupedit">Edit</button></div>`;
}
function paneSetup(d, full){
  return `<div data-setup>${full ? help('The question goes in the black bar across the top. The file name is used in the list of builders and for the exported files.') : ''}
  <div class="sb-row"><label class="f"><span>Language</span><select data-k="lang">${Object.keys(LANGS).map(k => `<option value="${k}"${d.lang === k ? ' selected' : ''}>${LANGS[k].name}</option>`).join('')}</select></label>
  <label class="f"><span>Year</span><select data-k="year"><option value="uncat"${d.uncat ? ' selected' : ''}>Uncategorised</option>${YEARS.map(y => `<option${!d.uncat && d.year === y ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>
  <div class="sb-row"><label class="f"><span>Half-term</span><select data-k="term"${d.uncat ? ' disabled' : ''}>${TERMS.map(t => `<option${d.term === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
  ${hasTier(d.year) ? `<label class="f"><span>Tier</span><select data-k="tier">${[['', 'Both tiers']].concat(Object.entries(TIERS)).map(([k, l]) => `<option value="${k}"${d.tier === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
  <label class="f"><span>Question in ${lname(d)}</span><input type="text" data-k="q.tl" value="${esc(d.q.tl)}" placeholder="${d.lang === 'fr' ? 'Quelles matières aimes-tu ?' : '¿Qué asignaturas te gustan?'}"></label>
  <label class="f"><span>Question in English</span><input type="text" data-k="q.en" value="${esc(d.q.en)}" placeholder="What subjects do you like?"></label>
  <label class="f"><span>File name (leave empty to use the English question)</span><input type="text" data-k="title" value="${esc(d.title)}" placeholder="${esc(displayTitle(Object.assign({}, d, { title:'' })))}"></label></div>`;
}
function paneColumns(d){
  let h = help(`Paste from Excel (${lname(d)} and English side by side), or type. <b>A blank line starts a new group</b>, e.g. positive and negative opinions. Groups line up across columns; a column with one group spans them all. Click anything on the page to jump to it here.`)
    + `<div class="btnrow" style="margin-bottom:12px"><button data-a="pasteall">Paste the whole builder from Excel…</button>${d.cols.length ? '' : '<button data-a="addn">Start with 4 empty columns</button>'}</div>`;
  const G = groupCount(d);
  d.cols.forEach((c, ci) => {
    const open = S.open === ci, n = itemCount(c);
    const warn = c.groups.length > 1 && c.groups.length !== G ? `${c.groups.length} groups (others have ${G})` : '';
    const noEn = c.groups.some(g => g.some(it => it.tl && !it.en)), noTl = c.groups.some(g => g.some(it => it.en && !it.tl));
    const flag = warn || noEn || noTl ? ' <span class="flag" title="Check this column">!</span>' : '';
    h += `<div class="box${open ? ' open' : ''}" data-col="${ci}"><div class="box-h" data-a="toggle"><span class="n">${ci+1}. ${esc(c.title) || '<span class="sb-muted">No title</span>'}${flag}</span>
      <span class="c">${n} item${n === 1 ? '' : 's'}${c.groups.length > 1 ? ` · ${c.groups.length} groups` : ''}</span>
      <button class="sb-ghost" data-a="up" title="Move left" ${ci === 0 ? 'disabled' : ''}>←</button><button class="sb-ghost" data-a="down" title="Move right" ${ci === d.cols.length - 1 ? 'disabled' : ''}>→</button><button class="sb-ghost" data-a="delcol" title="Delete column">✕</button></div>`;
    if(open){
      h += `<div class="box-b"><label class="f" style="margin-top:10px"><span>Column title</span><input type="text" data-k="title" value="${esc(c.title)}" placeholder="e.g. Opinion phrase"></label>
        <div class="items"><span class="sb-hd">${lname(d)}</span><span class="sb-hd">English</span><span></span>`;
      c.groups.forEach((g, gi) => {
        if(c.groups.length > 1) h += `<div class="gsep">Group ${gi+1}${gi > 0 ? `<button data-a="mergeg" data-g="${gi}" title="Join with the group above">Join with group ${gi}</button>` : ''}</div>`;
        g.forEach((it, ii) => { h += `<input type="text" class="tl" data-g="${gi}" data-i="${ii}" data-l="tl" value="${esc(it.tl)}"><input type="text" data-g="${gi}" data-i="${ii}" data-l="en" value="${esc(it.en)}"><button class="x" data-a="delit" data-g="${gi}" data-i="${ii}" title="Remove">✕</button>`; });
        h += `<div style="grid-column:1/-1"><button class="sb-ghost sb-small" data-a="addit" data-g="${gi}">+ Item${c.groups.length > 1 ? ` in group ${gi+1}` : ''}</button></div>`;
      });
      h += `</div><div class="btnrow"><button data-a="addg">+ New group</button><button data-a="pastecol">Paste from Excel…</button></div>`;
      if(warn) h += `<div class="warnline">${warn}</div>`;
      if(noEn) h += `<div class="warnline">Some items have no English.</div>`;
      if(noTl) h += `<div class="warnline">Some items have no ${lname(d)}.</div>`;
      h += `</div>`;
    }
    h += `</div>`;
  });
  h += `<button data-a="addcol">+ Add column</button>`;
  return h;
}
function paneLayout(d){
  const L = S.lay;
  let fit = '';
  if(L){
    const ppr = L.paper, f = L.L.font;
    const clamp = L.asked && L.asked !== f ? ` (${L.asked}pt is ${L.asked < f ? 'below the minimum' : 'above the maximum'} for ${ppr.label})` : '';
    if(!L.ok) fit = `<div class="fit sb-bad">Doesn't fit ${ppr.label} at ${f}pt: about ${Math.ceil(Math.max(L.over, L.overW || 0))} mm too ${L.over > 0 ? 'tall' : 'wide'}. ${L.fixed && f > ppr.min ? 'Pick a smaller text size or Auto.' : 'Take some items out, or split it into two builders.'}${clamp}</div>`;
    else if(L.why === 'a5-too-small') fit = `<div class="fit sb-warn">Too much for A5 at ${L.fixed ? (L.asked || f) : 11}pt, so it's on <b>A4 folded</b> (${f}pt): glue one half in and fold the other half out.${L.fixed ? ' A smaller text size or Auto may fit A5.' : ''}${clamp}</div>`;
    else if(clamp) fit = `<div class="fit">${ppr.label} · ${f}pt${clamp}</div>`;
  }
  const capNote = d.paper === 'auto' ? (d.year <= 9 ? '14pt' : '16pt') : `${(PAPERS[d.paper] || PAPERS.A4).auto}pt`;
  const pp = (k, t) => `<button data-paper="${k}" class="${d.paper === k ? 'on' : ''}">${t}</button>`;
  let h = fit + `<div class="sec" style="margin-top:0">Paper</div><div class="sb-seg">${pp('auto','Auto')}${pp('A5','A5')}${pp('A4','A4')}${pp('A4fold','A4 folded')}</div>
    ${help('Auto: Years 7–9 get A5 if it fits, otherwise A4 folded. Years 10–11 get A4.', 'Paper')}
    <div class="sec">Text size</div>
    <select id="size" style="width:auto"><option value="auto"${d.size === 'auto' ? ' selected' : ''}>Auto: largest that fits, up to ${capNote}</option>${SIZES.map(n => `<option value="${n}"${d.size === n ? ' selected' : ''}>${n}pt${n === 11 ? ' (A5 only)' : ''}</option>`).join('')}</select>
    ${help(`Auto stops at ${capNote} so builders with only a few words don't come out much bigger than the rest. Pick a size to fix it, e.g. to match a set of builders. The minimum (11pt A5, 12pt A4) always applies. English and column titles are 85% of that size (never below the minimum); the question bar matches.`, 'Text size')}
    <div class="sec">Columns</div>
    ${help('Columns narrow automatically to fit. <b>Width</b>: set one by hand (✕ goes back to auto). <b>Join</b> puts one title over this column and the next, with no line between them.', 'Columns')}
    <div class="lay"><span class="sb-hd">Column</span><span class="sb-hd">Sub-columns</span><span class="sb-hd">Width</span><span class="sb-hd">Join</span>`;
  d.cols.forEach((c, ci) => {
    const used = L ? L.L.subs[ci] : 1, curW = L && L.L.widths ? Math.round(L.L.widths[ci]) : null;
    const join = ci < d.cols.length - 1 ? `<button class="sb-small jbtn${c.joinNext ? ' on' : ''}" data-join="${ci}" title="${c.joinNext ? 'Joined with the next column. Click to separate.' : 'Share one title with the next column'}">${c.joinNext ? 'Joined' : 'Join'}</button>` : '<span></span>';
    const joined = ci > 0 && d.cols[ci-1].joinNext;
    h += `<span class="lay-n" title="${esc(c.title)}">${joined ? '↳ ' : ''}${esc(c.title) || `Column ${ci+1}`}</span>
      <select data-sub="${ci}"><option value="auto"${c.sub === 'auto' ? ' selected' : ''}>Auto (${used})</option>${[1,2,3].map(n => `<option value="${n}"${String(c.sub) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <span class="wcell">${c.width ? `<input type="range" min="6" max="60" value="${c.width}" data-w="${ci}"><button class="sb-ghost sb-small" data-wauto="${ci}" title="Back to auto">${c.width}% ✕</button>` : `<button class="sb-small" data-wset="${ci}" title="Set this column's width by hand">Auto${curW ? ` ${curW}%` : ''}</button>`}</span>${join}`;
  });
  return h + `</div>`;
}

function focusSel(sel){ const el = $('#pane ' + sel); if(el){ el.focus(); el.scrollIntoView({ block:'center' }); } }
function focusItem(ci, g, i, l){ focusSel(`[data-col="${ci}"] input[data-g="${g}"][data-i="${i}"][data-l="${l}"]`); }

/* ---------- pane events ---------- */
function bindPane(p){
  const d = S.doc;
  const inSetup = t => !!t.closest('[data-setup]');
  p.oninput = e => {
    const t = e.target;
    if(inSetup(t) && t.dataset.k){ const k = t.dataset.k; if(k === 'q.tl') d.q.tl = t.value; else if(k === 'q.en') d.q.en = t.value; else if(k === 'title') d.title = t.value; return changed(false); }
    const box = t.closest('[data-col]');
    if(box){ const c = d.cols[+box.dataset.col];
      if(t.dataset.k === 'title'){ c.title = t.value; box.querySelector('.n').textContent = `${+box.dataset.col + 1}. ${t.value}`; return changed(false); }
      if(t.dataset.l){ editText(c.groups[+t.dataset.g][+t.dataset.i], t.dataset.l, t.value); return changed(false); }
    }
    if(t.dataset.w != null){ d.cols[+t.dataset.w].width = +t.value; t.nextElementSibling.textContent = t.value + '% ✕'; return changed(false); }
  };
  p.onchange = e => {
    const t = e.target;
    if(inSetup(t) && t.dataset.k){ const k = t.dataset.k;
      if(k === 'lang'){ d.lang = t.value; renderEditor(); return changed(false); }
      // Choosing Uncategorised parks the builder; choosing a year or half-term files it (the file moves on the next save).
      if(k === 'year'){ if(t.value === 'uncat'){ d.uncat = true; renderPane(); return changed(false); }
        const wasUncat = !!d.uncat, had = hasTier(d.year); d.uncat = false; d.year = +t.value;
        if(wasUncat || had !== hasTier(d.year)){ if(!hasTier(d.year)) d.tier = ''; renderPane(); return changed(false); } }
      if(k === 'term'){ d.term = t.value; if(d.uncat){ d.uncat = false; renderPane(); return changed(false); } }
      if(k === 'tier') d.tier = t.value;
      // The file takes its new name when the title box is left, not on every keystroke (each rename moves the file).
      if(k === 'title') S.renamePending = true;
      return changed(false); }
    if(t.closest('[data-col]') && t.dataset.l) return changed(true); // refresh counts / warnings after leaving a box
    if(t.id === 'size'){ d.size = t.value === 'auto' ? 'auto' : +t.value; return changed(false); }
    if(t.dataset.sub != null){ const v = t.value; d.cols[+t.dataset.sub].sub = v === 'auto' ? 'auto' : +v; return changed(false); }
  };
  // The box being typed in is outlined on the page.
  if(!p._focusBound){ p._focusBound = true;
    p.addEventListener('focusin', e => {
      const t = e.target, box = t.closest('[data-col]');
      S.focus = !box ? null : t.dataset.l ? { c:+box.dataset.col, g:+t.dataset.g, i:+t.dataset.i } : t.dataset.k === 'title' ? { c:+box.dataset.col } : null;
      markFocus();
    });
    p.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if(!a || !p.contains(a)){ S.focus = null; markFocus(); } }, 0));
  }
  p.onkeydown = e => {
    if(e.key !== 'Enter' || !e.target.dataset.l || !e.target.closest('[data-col]')) return;
    e.preventDefault();
    const t = e.target, box = t.closest('[data-col]'), ci = +box.dataset.col, g = +t.dataset.g, i = +t.dataset.i;
    if(t.dataset.l === 'tl') return focusItem(ci, g, i, 'en');
    d.cols[ci].groups[g].splice(i + 1, 0, newItem()); changed(true); focusItem(ci, g, i + 1, 'tl');
  };
  p.onpaste = e => {
    // Pasting several rows into an item box adds them all from that point.
    const t = e.target; if(!t.dataset.l || !t.closest('[data-col]')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text'); if(!/[\n\t]/.test(text.trim())) return;
    e.preventDefault();
    const ci = +t.closest('[data-col]').dataset.col, c = d.cols[ci], g = +t.dataset.g, i = +t.dataset.i;
    const groups = parseColumn(text); if(!groups.length) return;
    const before = clone(d.cols);
    const cur = c.groups[g]; const replaceCur = !cur[i].tl && !cur[i].en;
    const tail = cur.splice(i + (replaceCur ? 0 : 1));
    if(replaceCur) tail.shift();
    groups[0].forEach(it => cur.push(it));
    const extra = groups.slice(1);
    if(extra.length){ extra[extra.length - 1] = extra[extra.length - 1].concat(tail); c.groups.splice(g + 1, 0, ...extra); } else tail.forEach(it => cur.push(it));
    changed(true); undoable(`Added ${groups.reduce((n, x) => n + x.length, 0)} items${groups.length > 1 ? ` in ${groups.length} groups` : ''}.`, before);
  };
  p.onclick = e => {
    const paper = e.target.closest('[data-paper]'); if(paper){ d.paper = paper.dataset.paper; changed(false); return; }
    const jn = e.target.closest('[data-join]'); if(jn){ const ci = +jn.dataset.join; d.cols[ci].joinNext = !d.cols[ci].joinNext; changed(true); return; }
    const ws = e.target.closest('[data-wset]'); if(ws){ const ci = +ws.dataset.wset; const L = S.lay;
      const nat = L ? (measure(d, L.paper, Object.assign({}, L.L, { widths:null }), false).colW) : null;
      const tot = nat ? nat.reduce((a, b) => a + b, 0) : 1; d.cols[ci].width = nat ? Math.max(6, Math.min(60, Math.round(nat[ci] / tot * 100))) : 20; changed(true); return; }
    const wa = e.target.closest('[data-wauto]'); if(wa){ d.cols[+wa.dataset.wauto].width = null; changed(true); return; }
    const a = e.target.closest('[data-a]'); if(!a) return;
    const box = a.closest('[data-col]'), ci = box ? +box.dataset.col : -1, c = ci >= 0 ? d.cols[ci] : null;
    switch(a.dataset.a){
      case 'setupedit': S.setupOpen = true; renderPane(); return focusSel('[data-setup] [data-k="q.tl"]');
      case 'setupdone': S.setupOpen = false; return renderPane();
      case 'toggle': S.open = S.open === ci ? -1 : ci; renderPane(); if(S.open >= 0){ const b = $(`#pane [data-col="${ci}"]`); if(b) b.scrollIntoView({ block:'nearest' }); } return;
      case 'up': e.stopPropagation(); [d.cols[ci-1], d.cols[ci]] = [d.cols[ci], d.cols[ci-1]]; S.open = ci - 1; return changed(true);
      case 'down': e.stopPropagation(); [d.cols[ci+1], d.cols[ci]] = [d.cols[ci], d.cols[ci+1]]; S.open = ci + 1; return changed(true);
      case 'delcol': { e.stopPropagation(); const removed = d.cols.splice(ci, 1)[0]; changed(true);
        return toast(`Deleted column “${removed.title || ci + 1}”`, { label:'Undo', fn:() => { d.cols.splice(ci, 0, removed); S.open = ci; changed(true); } }); }
      case 'addcol': d.cols.push(newCol('')); S.open = d.cols.length - 1; changed(true); return focusSel(`[data-col="${S.open}"] [data-k="title"]`);
      case 'addn': for(let i = 0; i < 4; i++) d.cols.push(newCol('')); S.open = 0; changed(true); return focusSel('[data-col="0"] [data-k="title"]');
      case 'addit': { const g = +a.dataset.g; c.groups[g].push(newItem()); changed(true); return focusItem(ci, g, c.groups[g].length - 1, 'tl'); }
      case 'delit': { const g = +a.dataset.g, before = clone(d.cols); c.groups[g].splice(+a.dataset.i, 1); if(!c.groups[g].length && c.groups.length > 1) c.groups.splice(g, 1); changed(true); return undoable('Item removed.', before); }
      case 'addg': c.groups.push([newItem()]); changed(true); return focusItem(ci, c.groups.length - 1, 0, 'tl');
      case 'mergeg': { const g = +a.dataset.g; c.groups[g-1] = c.groups[g-1].concat(c.groups[g]); c.groups.splice(g, 1); return changed(true); }
      case 'pastecol': return pasteDialog(false, ci);
      case 'pasteall': return pasteDialog(true);
    }
  };
}

/* ---------- respellings (Respellings mode: click a chunk on the page) ---------- */
// They're shown in the lesson presenter (tap a chunk with Pronunciation on), never printed.
let RP = null; // { c, g, i, el }
const WORD_RE = /[\p{L}\p{M}’'-]+/gu;
function closeRespPop(){ if(RP){ RP.el.remove(); RP = null; const st = $('#stage'); if(st) st.querySelectorAll('.sb-rsel').forEach(x => x.classList.remove('sb-rsel')); } }
function openRespPop(c, g, i, itemEl){
  closeRespPop();
  const it = S.doc.cols[c].groups[g][i]; if(!it.tl.trim()) return toast(`That chunk has no ${lname(S.doc)}.`);
  const el = document.createElement('div'); el.className = 'resp-pop';
  RP = { c, g, i, el };
  root.appendChild(el); itemEl.classList.add('sb-rsel');
  paintRespPop(true);
  const r = itemEl.getBoundingClientRect(), pr = el.getBoundingClientRect();
  const below = r.bottom + 8 + pr.height < innerHeight;
  el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pr.width / 2, innerWidth - pr.width - 8)) + 'px';
  el.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - pr.height - 8)) + 'px';
  el.onmousedown = e => e.stopPropagation();
  el.onclick = e => {
    e.stopPropagation();
    const b = e.target.closest('[data-r]'); if(!b) return;
    const ent = it.phon || [];
    if(b.dataset.r === 'add'){ const s = +b.dataset.s, e2 = +b.dataset.e; const x = { s, e:e2, p:'', on:true }; it.phon = ent.concat(x).sort((a, z) => a.s - z.s); changed(false); paintRespPop(); return focusResp(it.phon.indexOf(x)); }
    if(b.dataset.r === 'del'){ ent.splice(+b.dataset.k, 1); if(!ent.length) delete it.phon; changed(false); return paintRespPop(); }
    if(b.dataset.r === 'typed'){ return addTyped(); }
    if(b.dataset.r === 'done') return closeRespPop();
  };
  el.oninput = e => { const t = e.target; if(t.dataset.k != null){ it.phon[+t.dataset.k].p = t.value; changed(false); } };
  el.onkeydown = e => {
    if(e.key === 'Escape'){ e.preventDefault(); return closeRespPop(); }
    if(e.key === 'Enter'){ e.preventDefault(); if(e.target.dataset.typed !== undefined) return addTyped(); return closeRespPop(); }
  };
  function addTyped(){
    const inp = el.querySelector('[data-typed]'), w = inp.value.trim(); if(!w) return;
    const r2 = phonFind(it.tl, w, it.phon); if(!r2) return toast(`“${w}” isn't in this chunk, or it already has a respelling.`);
    const x = { s:r2.s, e:r2.e, p:'', on:true }; it.phon = (it.phon || []).concat(x).sort((a, z) => a.s - z.s); changed(false); paintRespPop(); focusResp(it.phon.indexOf(x));
  }
  function focusResp(k){ const f = el.querySelector(`[data-k="${k}"]`); if(f) f.focus(); }
}
function paintRespPop(first){
  if(!RP) return;
  const it = S.doc.cols[RP.c].groups[RP.g][RP.i], ent = it.phon || [];
  const taken = (s, e) => ent.some(x => s < x.e && x.s < e);
  const words = [...it.tl.matchAll(WORD_RE)].map(m => ({ w:m[0], s:m.index, e:m.index + m[0].length })).filter(x => !taken(x.s, x.e));
  RP.el.innerHTML = `<div class="rp-h"><b>${esc(it.tl)}</b><span class="sb-muted"> ${esc(it.en)}</span></div>
    ${ent.length ? `<div class="rp-list">${ent.map((p, k) => `<label class="rp-row"><span class="rp-w">${esc(it.tl.slice(p.s, p.e))}</span><input type="text" data-k="${k}" value="${esc(p.p)}" placeholder="e.g. pran-TAHN"><button class="x" data-r="del" data-k="${k}" title="Remove">✕</button></label>`).join('')}</div>` : ''}
    ${words.length ? `<div class="rp-sub">Add a respelling for:</div><div class="rp-words">${words.map(x => `<button data-r="add" data-s="${x.s}" data-e="${x.e}">${esc(x.w)}</button>`).join('')}</div>` : ''}
    <div class="rp-typed"><input type="text" data-typed placeholder="or type part of the chunk, e.g. les amis"><button class="sb-small" data-r="typed">Add</button></div>
    <div class="rp-foot"><span class="sb-small sb-muted">English-style, stressed syllable in CAPITALS. Shown in the lesson presenter, not in print.</span><button class="sb-primary sb-small" data-r="done">Done</button></div>`;
  if(first && ent.length){ const f = RP.el.querySelector('[data-k="0"]'); if(f) setTimeout(() => f.focus(), 0); }
}
document.addEventListener('mousedown', e => { if(RP && live() && !RP.el.contains(e.target) && !e.target.closest('#stage .sb-it')) closeRespPop(); });
function pasteDialog(whole, ci){
  const d = S.doc;
  const intro = whole
    ? `<h2>Paste the whole builder</h2><p>In Excel, put each column as a pair: <b>${lname(d)} | English | ${lname(d)} | English</b>… Select it all, copy, and paste here. An empty row inside a column starts a new group.</p>`
    : `<h2>Paste column ${ci + 1}</h2><p>Two Excel columns (${lname(d)} | English), lines like <i>j'étudie – I study</i>, or ${lname(d)} and English on alternate lines. A blank line starts a new group. This replaces what's in the column.</p>`;
  modal(intro + `<textarea id="pd-t" placeholder="Paste here (Ctrl+V)"></textarea>
    ${whole ? `<label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:14px"><input type="checkbox" id="pd-h" checked> The first row has the column titles</label>` : ''}
    <div class="sb-muted sb-small" id="pd-s" style="margin-top:6px"></div>
    <div class="sb-foot"><button data-x>Cancel</button><button class="sb-primary" data-ok>${whole && d.cols.length ? 'Replace all columns' : 'Use this'}</button></div>`, (m, close) => {
    const ta = $('#pd-t', m), sum = $('#pd-s', m), hd = $('#pd-h', m);
    const parse = () => whole ? parseWhole(ta.value, hd && hd.checked) : parseColumn(ta.value);
    const show = () => { const r = parse();
      sum.textContent = !ta.value.trim() ? '' : whole ? `${r.length} columns: ` + r.map(c => `${c.title || 'untitled'} (${itemCount(c)}${c.groups.length > 1 ? `, ${c.groups.length} groups` : ''})`).join(' · ')
        : `${r.reduce((n, g) => n + g.length, 0)} items${r.length > 1 ? ` in ${r.length} groups` : ''}. First: ${r[0] && r[0][0] ? `${r[0][0].tl} → ${r[0][0].en || '(no English)'}` : ''}`; };
    ta.oninput = show; if(hd) hd.onchange = show;
    ta.onkeydown = e => { if(e.key === 'Tab'){ e.preventDefault(); ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end'); show(); } };
    $('[data-x]', m).onclick = close;
    $('[data-ok]', m).onclick = () => {
      const r = parse(); if(!ta.value.trim()) return close();
      if(whole && !r.length) return toast('No columns found.');
      const before = clone(d.cols);
      if(whole){ d.cols = r; S.open = 0; }
      else d.cols[ci].groups = r.length ? r : [[]];
      close(); changed(true);
      undoable(whole ? `Pasted ${r.length} column${r.length === 1 ? '' : 's'}.` : `Pasted into column ${ci + 1}.`, before);
    };
    setTimeout(() => ta.focus(), 0);
  });
}

/* ---------- preview ---------- */
const preview = debounce(() => { if(S.view !== 'edit' || !S.doc) return; S.lay = layoutFor(S.doc, false); drawPreview(); if(S.tab === 'layout' && !document.activeElement.matches('#pane input[type=range], #pane select')) renderPane(); }, 180);
const HINTS = {
  edit: 'Click anything on the page to edit it in the panel.',
  colour: 'Select letters or words on the page, then pick a colour. Only where it matters (gender, a tense, a key chunk); coloured English is also bold. <b>Silent</b> greys out letters you don\'t say (@ only).',
  gaps: 'Click a word to blank it; click a column title to blank the whole column.',
  resp: 'Click a chunk to add or change its respellings (underlined words have one). Shown in the lesson presenter only, not in print.',
};
function fitChip(){
  const c = $('#fitchip'), L = S.lay; if(!c || !L) return;
  const f = L.L.font, lab = L.paper.label;
  c.className = 'fitchip' + (!L.ok ? ' sb-bad' : L.why === 'a5-too-small' ? ' sb-warn' : '');
  c.textContent = !L.ok ? `Doesn't fit ${lab} · ${Math.ceil(Math.max(L.over, L.overW || 0))} mm over` : `${lab} · ${f}pt${L.fixed ? '' : ' (Auto)'}${L.why === 'a5-too-small' ? ' · too much for A5' : ''}`;
}
function drawPreview(){
  const stage = $('#stage'); if(!stage || !S.lay) return;
  const L = S.lay, paper = L.paper, m = S.mode;
  ['edit', 'colour', 'gaps', 'resp'].forEach(k => stage.classList.toggle('m-' + k, m === k));
  stage.classList.toggle('fmt', m === 'colour');
  stage.classList.toggle('zw', S.zoom === 'width');
  const W = paper.w * MM, H = paper.h * MM, pad = 24;
  stage.innerHTML = `<div class="pv-page" id="pv-page">${sheetHTML(S.doc, paper, L.L, S.version, { fill:true, hl:m === 'resp' })}${paper.key === 'A4fold' ? `<div class="fold-guide" style="left:${paper.w / 2 * MM}px"></div>` : ''}</div><div class="pv-spacer" id="pv-spacer"></div>`;
  const pg = $('#pv-page'), r = stage.getBoundingClientRect();
  const k = S.zoom === 'width' ? (r.width - pad*2 - 12) / W : Math.min((r.width - pad*2) / W, (r.height - pad*2) / H);
  pg.style.transform = `scale(${k})`; pg.style.left = Math.max(pad, (r.width - W*k) / 2) + 'px'; pg.style.top = pad + 'px';
  // Fit width: the scaled page is taller than the stage; the spacer gives the stage its scroll height.
  const sp = $('#pv-spacer'); sp.style.height = (H * k + pad * 2) + 'px'; sp.style.width = '1px';
  if(RP){ const el = stage.querySelector(`.sb-it[data-c="${RP.c}"][data-g="${RP.g}"][data-i="${RP.i}"]`); if(el) el.classList.add('sb-rsel'); }
  const nGaps = S.doc.cols.reduce((n, c) => n + c.groups.reduce((q, g) => q + g.filter(it => it.gap).length, 0), 0);
  const hint = $('#pv-hint'); if(hint) hint.innerHTML = HINTS[m].replace('@', esc(lname(S.doc))) + (m === 'gaps' ? ` <b>${nGaps} blanked.</b>` : '');
  fitChip(); markFocus();
}
window.addEventListener('resize', () => { if(!live()) return; fitHeight(); if(S.view === 'edit'){ closeRespPop(); drawPreview(); } });
document.addEventListener('keydown', e => { if(live() && e.key === 'Escape' && RP) closeRespPop(); });
function clearFmtBar(){ if(root) root.querySelectorAll('.fmtbar').forEach(b => b.remove()); }
/* ---------- colouring (select text on the page) ---------- */
document.addEventListener('mouseup', () => {
  if(!live()) return;
  clearFmtBar();
  if(S.view !== 'edit' || S.mode !== 'colour') return;
  setTimeout(() => {
    const sel = getSelection(); if(!sel.rangeCount || sel.isCollapsed) return;
    const el = n => (n.nodeType === 1 ? n : n.parentElement).closest('#stage .sb-it [data-l]');
    const a = el(sel.anchorNode), b = el(sel.focusNode); if(!a || a !== b) return toast('Select text inside one word or phrase.');
    const off = (node, o) => { const r = document.createRange(); r.setStart(a, 0); r.setEnd(node, o); return r.toString().length; };
    let s = off(sel.anchorNode, sel.anchorOffset), e = off(sel.focusNode, sel.focusOffset); if(s > e) [s, e] = [e, s];
    const it = a.closest('.sb-it'), item = S.doc.cols[+it.dataset.c].groups[+it.dataset.g][+it.dataset.i], lang = a.dataset.l;
    const rr = sel.getRangeAt(0).getBoundingClientRect();
    const bar = document.createElement('div'); bar.className = 'fmtbar';
    bar.innerHTML = Object.keys(COLOURS).filter(c => c !== 's' || lang === 'tl').map(c => `<button class="${c}" data-c="${c}">${COLOURS[c]}</button>`).join('') + `<button data-c="">Clear</button>`;
    bar.style.left = Math.max(8, rr.left) + 'px'; bar.style.top = Math.max(8, rr.top - 46) + 'px';
    bar.onmousedown = ev => ev.preventDefault();
    bar.onmouseup = ev => ev.stopPropagation();
    bar.onclick = ev => { const btn = ev.target.closest('[data-c]'); if(!btn) return;
      const arr = marksToArr(item.marks, lang, item[lang].length); for(let i = s; i < e; i++) arr[i] = btn.dataset.c; setMarks(item, lang, arr);
      bar.remove(); getSelection().removeAllRanges(); changed(false); };
    root.appendChild(bar);
  }, 0);
});

/* ---------- saving ---------- */
function updateSaveState(){ const el = $('#save-state'); if(!el) return; el.textContent = S.saveState; el.classList.toggle('sb-bad', /not|couldn/i.test(S.saveState)); }
// Saves run one after another, each from a snapshot taken when it was asked for. So a save that is still running
// when the editor is closed (or the Settings section changes) still finishes, and never writes into a later builder.
let chain = Promise.resolve();
function saveNow(){
  if(Store.state !== 'ok' || !S.doc || !S.dirty || S.conflict) return chain;
  const snap = clone(S.doc), loc = S.loc, session = S.session;
  const rename = S.renamePending, force = S.forceNext;
  S.renamePending = false; S.forceNext = false; S.dirty = false;
  if(session === S.session){ S.saveState = 'Saving…'; updateSaveState(); }
  chain = chain.then(async () => {
    try{
      const res = await Store.save(snap, loc, { rename, force });
      if(session === S.session){ S.loc = res; S.saveState = res.warn || 'Saved'; }
    }catch(e){
      if(e.name === 'Conflict') await keepCopy(snap, loc, session);
      else { console.error(e); if(session === S.session){ S.dirty = true; S.saveState = 'Couldn\'t save: ' + e.message; } }
    }
    if(session === S.session) updateSaveState();
  });
  return chain;
}
// The other computer's version is not overwritten. My version is saved as a copy in the same folder, then the
// editor asks what to do (see resolveConflict). If the editor has already closed, the copy is the record.
async function keepCopy(snap, loc, session){
  let copy = null;
  try{ copy = await Store.save(snap, null, { rename:true }); }catch(e){ console.error(e); }
  if(session !== S.session || !live()) return;
  if(!copy){ S.dirty = true; S.saveState = 'Couldn\'t save, and couldn\'t make a copy.'; return; }
  S.conflict = { loc, copy, snap }; S.dirty = true; S.saveState = 'Changed on another computer';
  renderEditor();
}
function conflictBanner(){
  const c = S.conflict; if(!c) return '';
  return `<div class="conflict"><span>This builder was changed or removed on another computer, so your changes weren't saved over it. They're in <b>${esc(c.copy.name)}</b>.</span>
    <button data-c="keep">Use the other version</button><button data-c="mine">Replace it with mine</button><button class="sb-primary" data-c="copy">Keep working on my copy</button></div>`;
}
async function resolveConflict(choice){
  const c = S.conflict; if(!c) return;
  S.conflict = null;
  try{
    if(choice === 'copy'){ S.loc = c.copy; S.dirty = true; renderEditor(); return saveNow(); }
    if(choice === 'mine'){ S.forceNext = true; S.dirty = true; renderEditor(); return saveNow(); }
    if(choice === 'keep'){ S.session++; const r = await readFresh(c.loc); openEditor(r.doc, r.loc); }
  }catch(e){ toast(e.name === 'NotFoundError' ? 'That builder is no longer in the folder. Your version is in the copy.' : 'Couldn\'t do that: ' + e.message); showHome(); }
}
const autosave = debounce(() => { if(Store.state !== 'ok'){ S.saveState = 'Not connected: changes aren\'t saved'; updateSaveState(); return; } S.saveState = 'Saving…'; updateSaveState(); saveNow(); }, 900);
window.addEventListener('beforeunload', e => { if(S.dirty && Store.state === 'ok'){ autosave.flush(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', e => { if(live() && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); autosave.flush(); } });

/* ---------- print ---------- */
function printSheet(){
  const d = S.doc, L = S.lay; if(!L) return;
  const paper = L.paper, sheet = sheetHTML(d, paper, L.L, S.version, { fill:true });
  let html = '', size;
  if(paper.key === 'A5'){
    // two A5 landscape copies on A4 portrait, dashed cut line between them
    size = 'A4 portrait';
    html = `<div class="sheet-print" style="width:210mm;height:296.5mm">${sheet}<div style="position:absolute;left:0;right:0;top:148.25mm;border-top:0.3mm dashed #888"></div><div style="position:absolute;left:0;top:148.5mm">${sheet}</div></div>`;
  } else {
    size = 'A4 landscape';
    const fold = paper.key === 'A4fold' ? `<div style="position:absolute;left:148.5mm;top:0;height:5mm;border-left:0.3mm solid #888"></div><div style="position:absolute;left:148.5mm;bottom:0;height:5mm;border-left:0.3mm solid #888"></div>` : '';
    html = `<div class="sheet-print" style="width:297mm;height:209.5mm">${sheet}${fold}</div>`;
  }
  pageStyle().textContent = `@page{size:${size};margin:0}`;
  printRoot().innerHTML = html;
  const prevTitle = document.title;
  document.title = `${fileSafe(displayTitle(d))} - ${VERSIONS[S.version].replace('@', lname(d))} - ${paper.label}`;
  // Print CSS (builder.css) only hides the viewer while this class is on the page.
  document.body.classList.add('sb-printing');
  setTimeout(() => { try{ window.print(); } finally{ document.body.classList.remove('sb-printing'); document.title = prevTitle; } }, 50);
}
// Print sheets and the @page size live outside the mounted host, so printing works from either page.
function printRoot(){ let r = document.getElementById('sb-print-root'); if(!r){ r = document.createElement('div'); r.id = 'sb-print-root'; r.className = 'sb-host'; document.body.appendChild(r); } return r; }
function pageStyle(){ let s = document.getElementById('sb-page-size'); if(!s){ s = document.createElement('style'); s.id = 'sb-page-size'; document.head.appendChild(s); } return s; }

/* ---------- slide image (16:9 PNG) ---------- */
async function slideImage(download){
  const d = S.doc, paper = PAPERS.slide, fit = fitPaper(d, paper, {});
  const W = paper.w * MM, H = paper.h * MM, OUT_W = 1920, OUT_H = 1080;
  const inner = sheetHTML(d, paper, fit.L, S.version, { fill:true });
  const xhtml = new XMLSerializer().serializeToString(Object.assign(document.createElement('div'), { innerHTML:inner }).firstChild);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${SHEET_CSS}</style>${xhtml.replace(/^<div xmlns="http:\/\/www.w3.org\/1999\/xhtml"/, '<div')}</div></foreignObject></svg>`;
  try{
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = OUT_W; cv.height = OUT_H;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, OUT_W, OUT_H); cx.drawImage(img, 0, 0, OUT_W, OUT_H);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const name = `${fileSafe(displayTitle(d))} - ${VERSIONS[S.version].replace('@', lname(d))}.png`;
    if(!download && navigator.clipboard && window.ClipboardItem){
      try{ await navigator.clipboard.write([new ClipboardItem({ 'image/png':blob })]); return toast('Copied. Paste it into your slide (Ctrl+V).' + (fit.ok ? '' : ' It\'s a squeeze on a slide at 12pt.')); }
      catch(e){ console.warn(e); toast('Edge wouldn\'t copy the picture, so it\'s been downloaded instead.'); }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }catch(e){ console.error(e); toast('Couldn\'t make the picture: ' + e.message); }
}

/* ---------- Download all (.zip): sb-export.js ---------- */
let zipBusy = false;
async function downloadAll(){
  if(zipBusy) return;
  if(!window.SBExport || !window.JSZip) return toast('Download all needs sb-export.js and vendor/jszip.min.js on this page.');
  // Progress shows on the header's Export button.
  zipBusy = true; const d = S.doc, btn = $('#exp-btn'), lbl = () => $('#exp-lbl');
  if(btn) btn.disabled = true;
  try{
    const r = await window.SBExport.downloadZip(d, (i, n) => { const l = lbl(); if(l) l.textContent = `Making ${i} of ${n}…`; });
    const P = r.plan, notes = [];
    if(!P.a5ok) notes.push('A5 left out: it doesn\'t fit A5 at 11pt');
    if(!P.a4ok) notes.push('A4 doesn\'t fit at 12pt, so it runs over');
    if(!P.slideok) notes.push('the 16:9 versions are cut off at 12pt');
    toast(`Downloaded ${r.files.length} files.` + (notes.length ? ' ' + notes.join('; ') + '.' : ''));
  }catch(e){ console.error(e); toast('Couldn\'t make the zip: ' + e.message); }
  finally{ zipBusy = false; const b2 = $('#exp-btn'), l = lbl(); if(b2) b2.disabled = false; if(l) l.textContent = 'Export'; }
}

/* ================= start ================= */
window.SB = { S, Store, hasPhon, drawPreview, preview, parseColumn, parseWhole, layoutFor, fitPaper, sheetHTML, openEditor, newDoc, normalise, PAPERS, SHEET_CSS, slideImage };
/* ================= mount / unmount ================= */
// Settings → Sentence builders calls mount(container) and unmount(); builder.html calls mount(#app) itself.
async function mount(el, opts){
  unmount();
  dashHome = (opts && opts.onHome) || null;
  root = document.createElement('div'); root.className = 'sb-host'; el.appendChild(root);
  fitHeight();
  S.view = 'home'; S.doc = null; S.loc = null; S.dirty = false;
  await Store.restore();
  await showHome();
}
// The editor fills the window below whatever sits above the builder (0 on builder.html, the Settings header in the viewer).
// 48px = the builder's header (36px + 12px margin); builder.html also has 16px of page padding above it.
function fitHeight(){ if(root) root.style.setProperty('--sb-top', (root.getBoundingClientRect().top + parseFloat(getComputedStyle(root).paddingTop || 0) + 48) + 'px'); }
function unmount(){
  if(!root) return;
  if(S.dirty) saveNow(); // queued from a snapshot, so it still finishes after the builder is removed
  navHidden(false);
  root.remove(); root = null;
  S.view = 'home'; S.doc = null; S.loc = null; S.dirty = false; S.conflict = null; S.session++;
}
window.SBBuilder = { mount, unmount, mounted: live };
if(document.body.dataset.sbStandalone !== undefined) mount(document.getElementById('app'));
})();
