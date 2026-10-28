/* Waypoints library (Settings → Waypoints). Spec: claude/waypoints-spec.md (2026-10-24).
   One PNG per language, year and half-term:
     Waypoints/<French|Spanish>/Year N/<half-term>/Waypoint.png
   on the viewer's OneDrive folder. Imported, replaced and deleted here; never edited.
   Deleted files move to Waypoints/.Bin/ and can be put back with Undo.
   Classic script (no modules). Needs sb-core.js first. Exposes window.SBWaypoints. */
(function(){
'use strict';
const C = window.SBCore;
const { YEARS, TERMS, LANGS, Store, currentTerm, esc } = C;
const WP_DIR = 'Waypoints', BIN = '.Bin', FILE = 'Waypoint.png';
const LANG_KEYS = Object.keys(LANGS);

let el = null;            // the Settings section container while mounted
let lang = 'fr', year = 7;
let busy = false;
let undo = null;          // { name, l, y, t, term } for the last delete, until changed
const urls = new Map();   // 'fr|7|1 - Autumn 1' -> object URL of the picture (thumbnails)

// Dialog state
let dlg = null, pick = null, previewUrl = null;

const cleanTerm = t => t.replace(/^\d - /, '');
const keyOf = (l, y, t) => `${l}|${y}|${t}`;
// app.js runs inside its own function, so its icon() and toast() are reached through window.SVCore (as library.js does).
const ic = n => (window.SVCore && SVCore.icon) ? SVCore.icon(n) : '';
const say = (msg, err) => { if(window.SVCore && SVCore.toast) SVCore.toast(msg, err); else console.log('[Waypoints]', msg); };

/* ---------- folder access ---------- */
function ready(){ return !!(Store.dir && Store.state === 'ok'); }
async function wpRoot(create){ return Store.dir.getDirectoryHandle(WP_DIR, { create }); }
async function slotDir(l, y, t, create){
  const r = await wpRoot(create);
  const ld = await r.getDirectoryHandle(LANGS[l].name, { create });
  const yd = await ld.getDirectoryHandle('Year ' + y, { create });
  return yd.getDirectoryHandle(t, { create });
}
async function slotFile(l, y, t){
  try{ return await (await slotDir(l, y, t, false)).getFileHandle(FILE); }catch(e){ return null; }
}
// The Waypoint for a language, year and half-term as a File, or null. For lesson insertion later.
async function getWaypoint(l, y, t){ const fh = await slotFile(l, y, t); return fh ? fh.getFile() : null; }

async function writePng(l, y, t, blob){
  const d = await slotDir(l, y, t, true);
  const fh = await d.getFileHandle(FILE, { create:true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
}

// Moves a slot's picture into .Bin so it can be restored. Returns the bin record, or null if the slot was empty.
async function removeToBin(l, y, t){
  const fh = await slotFile(l, y, t);
  if(!fh) return null;
  const blob = await fh.getFile();
  const bin = await (await wpRoot(true)).getDirectoryHandle(BIN, { create:true });
  const name = `${Date.now()}-${l}-${y}-${t.replace(/[^0-9A-Za-z]+/g, '_')}.png`;
  const bf = await bin.getFileHandle(name, { create:true });
  const w = await bf.createWritable(); await w.write(blob); await w.close();
  await (await slotDir(l, y, t, false)).removeEntry(FILE);
  return { name, l, y, t };
}
async function restoreFromBin(u){
  const bin = await (await wpRoot(true)).getDirectoryHandle(BIN, { create:true });
  const blob = await (await bin.getFileHandle(u.name)).getFile();
  await writePng(u.l, u.y, u.t, blob);
  await bin.removeEntry(u.name);
}

/* ---------- pictures ---------- */
// Clipboard pictures can come in any image type; convert them to PNG.
async function toPng(blob){
  if(!blob || !blob.size) throw new Error('No picture was found on the clipboard.');
  if(blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d').drawImage(bmp, 0, 0);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not convert the picture to PNG.')), 'image/png'));
}
function isPng(file){ return file.type === 'image/png' || /\.png$/i.test(file.name); }

async function thumbFor(l, y, t){
  const k = keyOf(l, y, t);
  if(urls.has(k)) return urls.get(k);
  const f = await getWaypoint(l, y, t);
  const u = f ? URL.createObjectURL(f) : null;
  urls.set(k, u);
  return u;
}
function forget(l, y, t){
  const k = keyOf(l, y, t), u = urls.get(k);
  if(u) URL.revokeObjectURL(u);
  urls.delete(k);
}

/* ---------- Settings section ---------- */
function card(c){
  const body = c.url
    ? `<img src="${c.url}" alt="Waypoint for ${esc(cleanTerm(c.t))}">`
    : `<div class="wp-empty">No Waypoint yet</div>`;
  const acts = c.url
    ? `<button class="btn sm" data-a="replace" data-t="${esc(c.t)}">Replace</button><button class="btn sm" data-a="delete" data-t="${esc(c.t)}">Delete</button>`
    : `<button class="btn sm primary" data-a="import-slot" data-t="${esc(c.t)}">Import</button>`;
  return `<div class="wp-card"><div class="wp-thumb">${body}</div><div class="wp-foot"><b>${esc(cleanTerm(c.t))}</b><span>${acts}</span></div></div>`;
}

// Any error while drawing shows on the page (with the message) instead of leaving it blank.
async function draw(){
  try{ await drawInner(); }
  catch(err){
    console.error(err);
    if(el) el.innerHTML = `<div class="set-head"><h2>Waypoints</h2></div>
      <div class="set-card"><div class="row"><div class="grow"><div class="t">Waypoints couldn't load</div><div class="d">${esc(String(err && err.message || err))}</div></div><button class="btn sm" data-a="retry">Try again</button></div></div>`;
  }
}
async function drawInner(){
  const host = el;
  if(!host) return;
  // Like the Sentence Builder library: read the saved folder handle first (the builder does this when it mounts).
  if(!ready() && Store.state !== 'unsupported'){
    try{ await Store.restore(); }catch(e){ console.error(e); }
    if(host !== el) return;
  }
  if(!ready()){
    const reconnect = Store.state === 'prompt'
      ? `<button class="btn primary" data-a="reconnect">Reconnect the folder</button>`
      : '';
    const msg = Store.state === 'unsupported'
      ? 'This browser can\'t open the OneDrive folder. Use Edge or Chrome.'
      : Store.state === 'prompt'
        ? 'The data folder needs permission again. Press Reconnect; the Waypoints are still in it.'
        : 'Connect the Slideshow Viewer data folder in General first. Waypoints are stored in it.';
    host.innerHTML = `<div class="set-head"><h2>Waypoints</h2>${reconnect}</div>
      <div class="set-card"><div class="row"><div class="grow"><div class="d">${msg}</div></div></div></div>`;
    return;
  }
  const cards = [];
  for(const t of TERMS) cards.push({ t, url: await thumbFor(lang, year, t) });
  if(host !== el) return; // the section was closed while loading
  const undoBar = undo
    ? `<div class="wp-undo"><span>Deleted the ${esc(LANGS[undo.l].name)} Year ${undo.y} ${esc(cleanTerm(undo.t))} Waypoint.</span><button class="btn sm" data-a="undo">Undo</button></div>`
    : '';
  host.innerHTML = `
    <div class="set-head"><h2>Waypoints</h2><button class="btn primary" data-a="import">${ic('image')}Import</button></div>
    <p class="set-intro">Learning maps, one per half-term, made outside the app. Import each one as a PNG. It is kept in the Waypoints folder on OneDrive and is not edited here.</p>
    ${undoBar}
    <div class="set-card wp-nav">
      <span class="seg">${LANG_KEYS.map(k => `<button data-a="lang" data-v="${k}" class="${k === lang ? 'on' : ''}">${LANGS[k].name}</button>`).join('')}</span>
      <span class="seg">${YEARS.map(y => `<button data-a="year" data-v="${y}" class="${y === year ? 'on' : ''}">Year ${y}</button>`).join('')}</span>
    </div>
    <div class="wp-grid">${cards.map(card).join('')}</div>`;
}

async function run(fn){
  if(busy) return;
  busy = true;
  try{ await fn(); }
  catch(err){ console.error(err); say('Waypoints: ' + (err.message || 'something went wrong'), true); }
  finally{ busy = false; }
}

async function doDelete(t){
  await run(async () => {
    const u = await removeToBin(lang, year, t);
    forget(lang, year, t);
    undo = u;
    await draw();
  });
}
async function doUndo(){
  if(!undo) return;
  const u = undo; undo = null;
  await run(async () => {
    await restoreFromBin(u);
    forget(u.l, u.y, u.t);
    await draw();
  });
}

async function onClick(e){
  const b = e.target.closest('[data-a]');
  if(!b || !el || !el.contains(b)) return;
  const a = b.dataset.a, t = b.dataset.t;
  if(a === 'lang'){ lang = b.dataset.v; undo = null; return draw(); }
  if(a === 'year'){ year = Number(b.dataset.v); undo = null; return draw(); }
  if(a === 'import') return openDialog({});
  if(a === 'import-slot') return openDialog({ t });
  if(a === 'replace') return openDialog({ t, replace:true });
  if(a === 'delete') return doDelete(t);
  if(a === 'undo') return doUndo();
  if(a === 'reconnect'){ try{ await Store.reconnect(); }catch(err){ console.error(err); } return draw(); }
  if(a === 'retry') return draw();
}

/* ---------- import dialog ---------- */
function q(s){ return dlg.querySelector(`[data-f="${s}"]`); }

// Async steps (slot check, paste) can finish after the dialog was closed or reopened; they only touch the dialog they started in.
function setMsg(text){ if(dlg) q('msg').textContent = text || ''; }
async function checkSlot(){
  if(!dlg) return;
  const mine = dlg, l = q('l').value, y = Number(q('y').value), t = q('t').value;
  const has = !!(await slotFile(l, y, t));
  if(dlg === mine) setMsg(has ? 'This replaces the Waypoint already in that slot.' : '');
}
function setPick(blob){
  if(!dlg) return;
  pick = blob;
  if(previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  q('preview').innerHTML = `<img src="${previewUrl}" alt="Waypoint to import">`;
  q('save').disabled = false;
  setMsg('');
}
/* Pasting. PowerPoint puts several formats on the clipboard; some entries say "image/…" but aren't files
   (getAsFile() gives null), so only real image files are used, and each candidate is tried until one opens. */
const NO_PIC = 'There is no picture on the clipboard. In PowerPoint, right-click the slide (or the picture) and Copy, then paste here. Or use Choose PNG file.';
// Image files in a paste event. Must be read during the event: the clipboard data is emptied once the handler awaits.
function pastedFiles(dt){
  const out = [];
  if(!dt) return out;
  for(const f of (dt.files || [])) if(f && f.size && /^image\//.test(f.type)) out.push(f);
  for(const i of (dt.items || [])){
    if(i.kind !== 'file' || !/^image\//.test(i.type)) continue;
    const f = i.getAsFile();
    if(f && f.size && !out.includes(f)) out.push(f);
  }
  return out;
}
// Image blobs from the async clipboard API (the Paste button; also Ctrl+V when the event has no files).
async function clipboardImages(){
  const out = [];
  if(!(navigator.clipboard && navigator.clipboard.read)) return out;
  for(const it of await navigator.clipboard.read()){
    // PNG first: it's what PowerPoint's slide copy decodes best.
    const types = it.types.filter(t => /^image\//.test(t)).sort((a, b) => (b === 'image/png') - (a === 'image/png'));
    for(const t of types){ try{ const b = await it.getType(t); if(b && b.size) out.push(b); }catch(e){ /* that format wasn't readable */ } }
  }
  return out;
}
// Uses the first candidate that converts to PNG (only if the same dialog is still open).
async function pickFirst(cands){
  const mine = dlg;
  for(const b of cands){
    let png;
    try{ png = await toPng(b); }catch(e){ console.warn('Waypoints: clipboard format skipped', b && b.type, e); continue; }
    if(dlg === mine) setPick(png);
    return;
  }
  if(dlg === mine) setMsg(cands.length ? 'The picture on the clipboard couldn\'t be opened. Save it as PNG and use Choose PNG file.' : NO_PIC);
}
async function pasteFromClipboard(){
  let cands;
  try{ cands = await clipboardImages(); }
  catch(err){ console.warn(err); return setMsg('The browser wouldn\'t read the clipboard. Press Ctrl+V in this window instead.'); }
  await pickFirst(cands);
}
function onPaste(e){
  if(!dlg) return;
  const files = pastedFiles(e.clipboardData); // read now, before any await
  e.preventDefault();
  (async () => {
    let cands = files;
    if(!cands.length){ try{ cands = await clipboardImages(); }catch(err){ console.warn(err); cands = []; } }
    await pickFirst(cands);
  })();
}
function onKey(e){ if(e.key === 'Escape') closeDialog(); }

function openDialog(o){
  closeDialog();
  const termSel = o.t || termNow();
  dlg = document.createElement('div');
  dlg.className = 'wp-back';
  dlg.innerHTML = `<div class="wp-dlg" role="dialog" aria-modal="true" aria-labelledby="wp-h">
    <h2 id="wp-h">${o.replace ? 'Replace a Waypoint' : 'Import a Waypoint'}</h2>
    <p class="set-intro">Copy the slide or picture in PowerPoint, then paste it here (Ctrl+V or the button). Or choose a PNG file. Only PNG pictures.</p>
    <div class="wp-form">
      <label>Language<select data-f="l">${LANG_KEYS.map(k => `<option value="${k}" ${k === lang ? 'selected' : ''}>${LANGS[k].name}</option>`).join('')}</select></label>
      <label>Year<select data-f="y">${YEARS.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>Year ${y}</option>`).join('')}</select></label>
      <label>Half-term<select data-f="t">${TERMS.map(t => `<option value="${esc(t)}" ${t === termSel ? 'selected' : ''}>${esc(cleanTerm(t))}</option>`).join('')}</select></label>
    </div>
    <div class="wp-pick">
      <button class="btn" data-f="paste">Paste from clipboard</button>
      <label class="btn">Choose PNG file…<input type="file" accept="image/png,.png" hidden data-f="file"></label>
    </div>
    <div class="wp-preview" data-f="preview"><span class="d">Nothing chosen yet.</span></div>
    <div class="wp-msg" data-f="msg" aria-live="polite"></div>
    <div class="wp-actions">
      <button class="btn" data-f="cancel">Cancel</button>
      <button class="btn primary" data-f="save" disabled>${o.replace ? 'Replace Waypoint' : 'Save Waypoint'}</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  document.addEventListener('paste', onPaste);
  document.addEventListener('keydown', onKey);

  dlg.addEventListener('click', e => {
    if(e.target === dlg) return closeDialog(); // click on the dim background
    const b = e.target.closest('[data-f]');
    if(!b) return;
    if(b.dataset.f === 'cancel') return closeDialog();
    if(b.dataset.f === 'paste') return pasteFromClipboard();
    if(b.dataset.f === 'save') return savePick();
  });
  dlg.addEventListener('change', e => {
    if(e.target.dataset.f === 'file'){
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      if(!isPng(f)) return setMsg('That isn\'t a PNG file. Save the picture as PNG and try again.');
      setPick(f);
    }
    if(['l', 'y', 't'].includes(e.target.dataset.f)) checkSlot();
  });
  checkSlot();
}

async function savePick(){
  if(!pick) return;
  const l = q('l').value, y = Number(q('y').value), t = q('t').value;
  await run(async () => {
    await writePng(l, y, t, pick);
    forget(l, y, t);
    lang = l; year = y; undo = null;
    closeDialog();
    await draw();
    say('Waypoint saved.');
  });
}

function closeDialog(){
  if(!dlg) return;
  dlg.remove(); dlg = null;
  document.removeEventListener('paste', onPaste);
  document.removeEventListener('keydown', onKey);
  if(previewUrl){ URL.revokeObjectURL(previewUrl); previewUrl = null; }
  pick = null;
}

/* ---------- mount / unmount (called from Settings) ---------- */
function mount(container){
  unmount();
  el = container;
  el.addEventListener('click', onClick);
  draw();
}
function unmount(){
  closeDialog();
  if(el){ el.removeEventListener('click', onClick); el = null; }
  for(const u of urls.values()) if(u) URL.revokeObjectURL(u);
  urls.clear();
  undo = null;
}

/* ---------- half-term from the date (same months as the Library's default folder) ---------- */
function termNow(d){
  d = d || new Date();
  const m = d.getMonth(), day = d.getDate();
  const i = (m===8 || m===9) ? 0 : (m===10 || m===11) ? 1 : (m===0 || m===1) ? 2 : (m===2 || (m===3 && day<15)) ? 3 : (m===3 || m===4) ? 4 : 5;
  return TERMS[i];
}

/* ---------- picker: used by the editor's Insert Waypoint ----------
   choose({ auto, year, onPick }). auto: this term's Waypoint for `year` (language asked each time).
   Manual: any language, year and half-term. onPick(blob, { l, y, t }) runs once a Waypoint is chosen. */
// What to say when the data folder can't be used. Store is shared with the app, so this is the app's state.
function folderProblem(){
  if(Store.state === 'unsupported') return "This browser can't open the data folder. Use Edge or Chrome.";
  if(Store.state === 'prompt') return 'The data folder needs permission again. Press Reconnect in Settings → General.';
  return 'No data folder is chosen yet. Choose one in Settings → General.';
}
function choose(o){
  // The browser forgets the folder permission when the page is reloaded: ask for it again right here (this click allows it) rather than sending you to Settings.
  if(!ready() && Store.state === 'prompt'){
    Store.reconnect().then(() => { if(ready()) choose(o); else say(folderProblem(), true); }).catch(() => say(folderProblem(), true));
    return;
  }
  if(!ready()){ say(folderProblem(), true); return; }
  closeDialog();
  const yearKnown = YEARS.includes(o.year) ? o.year : null;
  const termAuto = termNow();
  let auto = !!o.auto, blob = null;

  dlg = document.createElement('div');
  dlg.className = 'wp-back';
  dlg.innerHTML = `<div class="wp-dlg" role="dialog" aria-modal="true" aria-labelledby="wp-h2">
    <h2 id="wp-h2">Insert a Waypoint</h2>
    <div class="wp-pick">
      <span class="seg"><button data-f="mode" data-v="auto">This term's</button><button data-f="mode" data-v="manual">Choose</button></span>
    </div>
    <p class="set-intro" data-f="hint"></p>
    <div class="wp-form">
      <label>Language<select data-f="l">${LANG_KEYS.map(k => `<option value="${k}">${LANGS[k].name}</option>`).join('')}</select></label>
      <label data-f="ylab">Year<select data-f="y">${YEARS.map(y => `<option value="${y}" ${y === (yearKnown || 7) ? 'selected' : ''}>Year ${y}</option>`).join('')}</select></label>
      <label data-f="tlab">Half-term<select data-f="t">${TERMS.map(t => `<option value="${esc(t)}">${esc(cleanTerm(t))}</option>`).join('')}</select></label>
    </div>
    <div class="wp-preview" data-f="preview"><span class="d">Choose a language to see its Waypoint.</span></div>
    <div class="wp-msg" data-f="msg" aria-live="polite"></div>
    <div class="wp-actions">
      <button class="btn" data-f="cancel">Cancel</button>
      <button class="btn primary" data-f="ok" disabled>Insert Waypoint</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  document.addEventListener('keydown', onKey);
  const pick = f => dlg.querySelector(`[data-f="${f}"]`);
  const note = t => { pick('msg').textContent = t || ''; };

  function sync(){
    dlg.querySelectorAll('[data-f=mode]').forEach(b => b.classList.toggle('on', (b.dataset.v === 'auto') === auto));
    pick('tlab').style.display = auto ? 'none' : '';
    pick('ylab').style.display = auto && yearKnown ? 'none' : '';
    pick('hint').textContent = auto
      ? `This term's Waypoint (${cleanTerm(termAuto)})${yearKnown ? ' for Year ' + yearKnown : ''}. Pick the language.`
      : 'Choose the language, year and half-term.';
    if(auto){ pick('t').value = termAuto; if(yearKnown) pick('y').value = String(yearKnown); }
    refresh();
  }
  async function refresh(){
    const l = pick('l').value, y = auto && yearKnown ? yearKnown : Number(pick('y').value), t = auto ? termAuto : pick('t').value;
    blob = await getWaypoint(l, y, t);
    if(previewUrl){ URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if(blob){
      previewUrl = URL.createObjectURL(blob);
      pick('preview').innerHTML = `<img src="${previewUrl}" alt="Waypoint preview">`;
      pick('ok').disabled = false;
      note('');
    } else {
      pick('preview').innerHTML = `<span class="d">No Waypoint yet.</span>`;
      pick('ok').disabled = true;
      note(`No ${LANGS[l].name} Waypoint for Year ${y}, ${cleanTerm(t)} yet.` + (auto ? ' Choose one instead, or add it in Settings → Waypoints.' : ' Add it in Settings → Waypoints.'));
    }
  }

  dlg.addEventListener('click', e => {
    if(e.target === dlg) return closeDialog();
    const b = e.target.closest('[data-f]'); if(!b) return;
    const f = b.dataset.f;
    if(f === 'cancel') return closeDialog();
    if(f === 'mode'){ auto = b.dataset.v === 'auto'; return sync(); }
    if(f === 'ok' && blob){
      const l = pick('l').value, y = auto && yearKnown ? yearKnown : Number(pick('y').value), t = auto ? termAuto : pick('t').value;
      const done = o.onPick, picked = blob;
      closeDialog();
      if(done) done(picked, { l, y, t });
    }
  });
  dlg.addEventListener('change', e => { if(['l', 'y', 't'].includes(e.target.dataset.f)) refresh(); });
  sync();
}

/* ---------- Create: put the Waypoint on the template's marker slide ----------
   fillTemplate(pptx, png) -> a new pptx Blob with 'INSERT WAYPOINT HERE' replaced by the picture (fit, centred),
   or null if the deck has no marker slide. Uses JSZip (vendor/jszip.min.js). */
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function imageDims(blob){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { res({ w: im.naturalWidth || 1600, h: im.naturalHeight || 900 }); URL.revokeObjectURL(u); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read the Waypoint picture.')); };
    im.src = u;
  });
}
async function fillTemplate(pptx, png){
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  let target = null, xml = null;
  for(const n of slides){
    const s = await zip.file(n).async('string');
    if(/INSERT WAYPOINT HERE/i.test(s)){ target = n; xml = s; break; }
  }
  if(!target) return null;

  const pres = await zip.file('ppt/presentation.xml').async('string');
  const sz = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(pres);
  const cx = sz ? +sz[1] : 12192000, cy = sz ? +sz[2] : 6858000;
  const dims = await imageDims(png);
  const k = Math.min(cx / dims.w, cy / dims.h);
  const w = Math.round(dims.w * k), h = Math.round(dims.h * k);

  const mediaName = 'waypoint-' + Date.now() + '.png';
  zip.file('ppt/media/' + mediaName, png);

  const relPath = target.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
  const relsOld = zip.file(relPath) ? await zip.file(relPath).async('string') : null;
  const rid = 'rIdWp' + Date.now();
  const relsNew = relsOld
    ? relsOld.replace('</Relationships>', `<Relationship Id="${rid}" Type="${NS_R}/image" Target="../media/${mediaName}"/></Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${rid}" Type="${NS_R}/image" Target="../media/${mediaName}"/></Relationships>`;
  zip.file(relPath, relsNew);

  let ct = await zip.file('[Content_Types].xml').async('string');
  if(!/Extension="png"/i.test(ct)) ct = ct.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>');
  zip.file('[Content_Types].xml', ct);

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('The template slide could not be read.');
  const tree = doc.getElementsByTagNameNS(NS_P, 'spTree')[0];
  if(!tree) throw new Error('The template slide has no shape tree.');
  for(const c of [...tree.children]){
    if(['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(c.localName)) tree.removeChild(c);
  }
  const picXml = `<p:pic xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><p:nvPicPr><p:cNvPr id="200" name="Waypoint"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((cx - w) / 2)}" y="${Math.round((cy - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const picDoc = new DOMParser().parseFromString(picXml, 'application/xml');
  tree.appendChild(doc.importNode(picDoc.documentElement, true));
  zip.file(target, new XMLSerializer().serializeToString(doc));

  return zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression:'DEFLATE' });
}

/* ---------- styles (injected once) ---------- */
const STYLE = `
.wp-nav{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 12px;margin-top:12px}
.wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px}
.wp-card{border:1px solid var(--border-strong,rgba(0,0,0,.14));border-radius:8px;background:var(--surface,#fff);color:var(--text,#111);overflow:hidden}
.wp-thumb{aspect-ratio:16/9;background:var(--sunken,#f3f3f5);display:flex;align-items:center;justify-content:center}
.wp-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.wp-empty{color:var(--text-2,#6b6b74);font-size:14px}
.wp-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;flex-wrap:wrap;color:var(--text,#111)}
.wp-foot span{display:flex;gap:6px}
.wp-undo{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;margin-top:10px;border-radius:8px;background:var(--sunken,#fff7e0);border:1px solid var(--border-strong,#e8c96b);color:var(--text,#111)}
.wp-back{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:2000;padding:16px}
.wp-dlg{background:var(--surface,#fff);color:var(--text,#111);border-radius:12px;max-width:520px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);max-height:90vh;overflow:auto}
.wp-dlg h2{margin:0 0 6px}
.wp-dlg .set-intro{color:var(--text-2,#444)}
.wp-form{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
.wp-form label{display:flex;flex-direction:column;gap:4px;font-size:13px}
.wp-form select{padding:6px;border-radius:6px;border:1px solid var(--border-strong,#bbb);font:inherit;background:var(--surface,#fff);color:var(--text,#111)}
.wp-pick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.wp-preview{min-height:120px;border:1px dashed var(--border-strong,#aaa);border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--sunken,#f7f7f9);padding:8px}
.wp-preview img{max-width:100%;max-height:260px;object-fit:contain}
.wp-msg{min-height:20px;font-size:13px;margin:8px 0;color:#8a4b00}
.wp-actions{display:flex;justify-content:flex-end;gap:8px}
.cr-wp-row{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0}
@media (max-width:560px){ .wp-form{grid-template-columns:1fr} }
`;
function injectStyle(){
  if(document.getElementById('wp-css')) return;
  const s = document.createElement('style');
  s.id = 'wp-css'; s.textContent = STYLE;
  document.head.appendChild(s);
}
injectStyle();

window.SBWaypoints = { mount, unmount, getWaypoint, choose, fillTemplate, termNow, cleanTerm };
})();
