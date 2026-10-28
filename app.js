/* =====================================================================
   Slideshow Viewer — app
   Opened straight from the OneDrive folder (file://), so: classic scripts,
   no workers/modules/fetch. Data lives in the folder you pick on first run:
     viewer-data.json   which deck is in which lesson, hides, annotations
     Lessons/           copies of the decks you dropped in
   Timetable comes from the MFL Planner (its synced .json file, or the
   planner's own browser data on this PC as a fallback).
   ===================================================================== */
(function(){
'use strict';
const APP_VERSION = '1.108';
const TEST = /[?&]test\b/.test(location.search);
// Dual screen: the pupil window (on the panel) is this same page opened with ?screen=pupil by the console (dual.js).
const PUPIL = /[?&]screen=pupil\b/.test(location.search);

/* ---------------- utilities ---------------- */
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = ()=> Math.random().toString(36).slice(2,9);
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const pad2 = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
function mondayOf(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = x.getDay(); x.setDate(x.getDate() + (wd===0 ? -6 : 1-wd)); return x; }
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKS_AHEAD = 4; // dashboard: this week plus this many weeks ahead
const toMin = t => { if(!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
// Today's date written out for the top bar: "lundi, douze octobre" / "lunes, doce de octubre".
const DATE_WORDS = {
  fr:{ days:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
       months:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
       nums:['','premier','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf','vingt','vingt et un','vingt-deux','vingt-trois','vingt-quatre','vingt-cinq','vingt-six','vingt-sept','vingt-huit','vingt-neuf','trente','trente et un'],
       fmt:(d,n,m)=>`${d}, ${n} ${m}` },
  es:{ days:['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
       months:['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
       nums:['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve','treinta','treinta y uno'],
       fmt:(d,n,m)=>`${d}, ${n} de ${m}` },
  // Form time (Form 8/10 etc.): "Monday 1st September"
  en:{ days:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
       months:['January','February','March','April','May','June','July','August','September','October','November','December'],
       nums:['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th','16th','17th','18th','19th','20th','21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th','31st'],
       fmt:(d,n,m)=>`${d} ${n} ${m}` },
};
function dateWords(date, lang){ const L = DATE_WORDS[lang] || DATE_WORDS.fr; return L.fmt(L.days[date.getDay()], L.nums[date.getDate()], L.months[date.getMonth()]); }
const deckStem = name => String(name || '').replace(/\.(pptx|pdf)$/i, '');
function lessonTitle(l){ return (l.title || '').trim() || deckStem((l.files.pptx || l.files.pdf || {}).name); }
function today(){ const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function defaultDate(){ const t = today(); const wd = t.getDay(); return wd===6 ? addDays(t,2) : wd===0 ? addDays(t,1) : t; }
// Furthest week the dashboard shows: WEEKS_AHEAD after the current school week (at the weekend, after the coming one).
function lastDashMonday(){ return addDays(mondayOf(defaultDate()), 7*WEEKS_AHEAD); }

const IC = iconMap({
  layers: 'layers', bookmarkPlus: 'bookmark-plus',
  shape_rect: 'square', shape_roundRect: 'rectangle-horizontal', shape_ellipse: 'circle', shape_triangle: 'triangle',
  shape_diamond: 'diamond', shape_star5: 'star', shape_rightArrow: 'arrow-right', shape_speech: 'message-square',
  shape_tick: 'check', shape_cross: 'x', shape_line: 'slash', shape_arrow: 'move-up-right',
  distH: 'align-horizontal-distribute-center', distV: 'align-vertical-distribute-center', star: 'star', gallery: 'layout-grid',
  table: 'table', selRow: 'rows-3', selCol: 'columns-3', vT: 'align-vertical-justify-start',
  head: 'heading', vM: 'align-vertical-justify-center', vB: 'align-vertical-justify-end', cal: 'calendar',
  qa: 'message-circle-question-mark', tag: 'tag', rowA: 'arrow-up-from-line', rowB: 'arrow-down-to-line',
  colL: 'arrow-left-to-line', colR: 'arrow-right-to-line', rowX: 'trash-2', colX: 'trash-2',
  search: 'search', print: 'printer', left: 'chevron-left', right: 'chevron-right',
  pointer: 'mouse-pointer-2', pen: 'pencil-line', home: 'house', grid: 'layout-grid',
  max: 'maximize', zoomOut: 'zoom-out', eye: 'eye', eyeOff: 'eye-off',
  eraser: 'eraser', marker: 'brush', hl: 'highlighter', undo: 'undo-2',
  trash: 'trash-2', users: 'users', settings: 'settings', upload: 'upload',
  activity: 'puzzle', play: 'play', edit: 'pencil', x: 'x', sb: 'brick-wall',
  ext: 'external-link', more: 'ellipsis-vertical', plus: 'plus', dice: 'dices',
  bulb: 'lightbulb', box: 'square', text: 'type', reset: 'rotate-ccw',
  blur: 'eye-off', tools: 'wrench', clock: 'clock', monitor: 'monitor',
  order: 'list-ordered', done: 'circle-check', copy: 'copy', dupl: 'copy-plus', shapes: 'shapes',
  image: 'image', frame: 'image-plus', frameEmpty: 'image-minus', frameMove: 'hand', slides: 'presentation', redo: 'redo-2', up: 'chevron-up',
  down: 'chevron-down', minus: 'minus', paste: 'clipboard', front: 'bring-to-front',
  back: 'send-to-back', fwd: 'move-up', bwd: 'move-down', aL: 'align-start-vertical',
  aC: 'align-center-vertical', aR: 'align-end-vertical', aT: 'align-start-horizontal', aM: 'align-center-horizontal',
  aB: 'align-end-horizontal', wide: 'rectangle-horizontal', square: 'square', alignL: 'align-left',
  alignC: 'align-center', alignR: 'align-right', group: 'group', ungroup: 'ungroup',
  merge: 'table-cells-merge', unmerge: 'table-cells-split',
  crop: 'crop', moon: 'moon', sun: 'sun', theme: 'palette', tick: 'check', note: 'file-text', lists: 'list', // v1.87 ribbon: Done, My notes, Lists ▾
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

let toastTimer = null;
function toast(msg, isErr){ let t = $('.toast'); if(!t){ t = el('div','toast'); document.body.appendChild(t); } t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.remove(), isErr ? 6000 : 2800); }
function showLoading(msg){ hideLoading(); const l = el('div','loading', esc(msg || 'Loading…')); l.id = 'loading'; document.body.appendChild(l); }
function hideLoading(){ const l = $('#loading'); if(l) l.remove(); }
function closeMenus(){ $$('.menu').forEach(m=>m.remove()); }
// pt (v1.53): { x, y } to open at the pointer (right-click menus) instead of under anchor.
function openMenu(anchor, items, pt){
  closeMenus();
  const m = el('div','menu');
  m.addEventListener('mousedown', e=>{ if(e.target.type !== 'range') e.preventDefault(); }); // keep the text cursor (Insert → Date while typing); sliders need their drag
  for(const it of items){
    if(it==='-'){ m.appendChild(el('hr')); continue; }
    if(it.node){ m.appendChild(it.node); continue; }
    if(it.head){ m.appendChild(el('div', 'menu-h', esc(it.head))); continue; } // v1.87: a header line (strip menu: "3 slides")
    const sc = /^(.*?)\s{3,}(\S.*)$/.exec(it.label); // "Duplicate slide   Ctrl+D": the shortcut goes on the right
    const b = el('button', it.danger ? 'danger' : '', sc ? `<span>${esc(sc[1])}</span><kbd>${esc(sc[2])}</kbd>` : esc(it.label));
    if(it.dis){ b.disabled = true; if(it.title) b.title = it.title; }
    b.onclick = (e)=>{ e.stopPropagation(); closeMenus(); it.run(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  if(pt){
    m.style.left = Math.max(8, Math.min(pt.x, innerWidth - mw - 8)) + 'px';
    m.style.top = Math.max(8, pt.y + mh > innerHeight - 8 ? pt.y - mh : pt.y) + 'px';
    return;
  }
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  m.style.top = (r.bottom + 4 + mh > innerHeight ? r.top - mh - 4 : r.bottom + 4) + 'px';
}
document.addEventListener('pointerdown', e=>{ if(!e.target.closest('.menu')) closeMenus(); }, true);
function modal(html, onMount){
  const back = el('div','modal-back');
  const m = el('div','modal', html);
  back.appendChild(m);
  back.addEventListener('pointerdown', e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
  const close = ()=>back.remove();
  if(onMount) onMount(m, close);
  return close;
}
function confirmBox(title, text, okLabel, danger){
  return new Promise(res=>{
    modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn ${danger?'danger':'primary'}" data-a="ok">${esc(okLabel||'OK')}</button></div>`, (m, close)=>{
      m.querySelector('[data-a=no]').onclick = ()=>{ close(); res(false); };
      m.querySelector('[data-a=ok]').onclick = ()=>{ close(); res(true); };
    });
  });
}

/* ---------------- handle store (IndexedDB) ---------------- */
function idb(){ return new Promise((res,rej)=>{ const r = indexedDB.open('slideshow_viewer_fs', 1); r.onupgradeneeded = ()=>r.result.createObjectStore('h'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); }); }
async function hGet(k){ try{ const db = await idb(); return await new Promise(res=>{ const q = db.transaction('h').objectStore('h').get(k); q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>res(null); }); }catch(e){ return null; } }
async function hSet(k, v){ try{ const db = await idb(); await new Promise((res,rej)=>{ const tx = db.transaction('h','readwrite'); tx.objectStore('h').put(v, k); tx.oncomplete = res; tx.onerror = ()=>rej(tx.error); }); }catch(e){} }

/* ---------------- storage: the picked OneDrive folder ---------------- */
const DATA_FILE = 'viewer-data.json', LESSONS_DIR = 'Lessons';
const isLibPath = p => String(p || '').startsWith('Lesson Library/'); // library.js
/* The data folder is held in one place: SBCore.Store (sb-core.js, loaded before this file). The editor, Waypoints and the
   Sentence Builders all read that same handle and permission state (2026-10-26), so one of them can't say "not connected"
   while another is connected. */
const FsStore = {
  get dir(){ return window.SBCore ? SBCore.Store.dir : null; },
  get name(){ return this.dir ? this.dir.name : ''; },
  supported: typeof window.showDirectoryPicker === 'function',
  async restore(){ await SBCore.Store.restore(); return SBCore.Store.state; },
  async reconnect(){ await SBCore.Store.reconnect(); return SBCore.Store.state === 'ok'; },
  async pick(){ await SBCore.Store.pick(); },
  /* Several computers (v1.52, sync.js). base: viewer-data.json's text as this window last read or
     wrote it (minus points); seen: its file time then. Points: Sync/Points/points-<dev>.json. */
  base:null, seen:0, lastText:null, dev:null, absorbed:[],
  pt:{ ready:false, foreign:new Set(), dead:new Set(), myDeleted:new Set(), loaded:new Set(), sig:'', lastText:null },
  async device(){
    if(this.dev) return this.dev;
    let id = await hGet('deviceId');
    if(!id){ try{ id = localStorage.getItem('sv_device_id'); }catch(e){} }
    if(!id || !/^[a-z0-9]{4,20}$/.test(id)) id = SVSync.newId();
    await hSet('deviceId', id); try{ localStorage.setItem('sv_device_id', id); }catch(e){}
    return (this.dev = id);
  },
  async syncDir(sub){ const s = await this.dir.getDirectoryHandle('Sync', { create:true }); return s.getDirectoryHandle(sub, { create:true }); },
  async myPointsName(){ return 'points-' + await this.device() + '.json'; },
  // Every computer's points file: all awards, minus any a computer has deleted.
  async readPoints(extra){
    const dir = await this.syncDir('Points'), mineName = await this.myPointsName();
    const all = new Map(), dead = new Set(), foreign = new Set(), sig = [];
    let mine = null;
    for await (const [name, h] of dir.entries()){
      if(h.kind!=='file' || !/^points-.+\.json$/i.test(name)) continue;
      const f = await h.getFile(); sig.push(name + ':' + f.lastModified);
      let j; try{ j = JSON.parse(await f.text()); }catch(e){ continue; }
      const isMine = name===mineName;
      if(isMine) mine = j;
      for(const id of (j && j.deleted) || []) dead.add(id);
      for(const p of (j && j.points) || []) if(p && p.id){ if(!all.has(p.id)) all.set(p.id, p); if(!isMine) foreign.add(p.id); }
    }
    for(const p of extra || []) if(p && p.id && !all.has(p.id)) all.set(p.id, p); // the old shared list, conflict copies
    const P = this.pt;
    P.myDeleted = new Set((mine && mine.deleted) || []);
    P.dead = dead; P.foreign = foreign; P.sig = sig.sort().join('|'); P.ready = true;
    P.lastText = mine ? JSON.stringify({ dev:this.dev, points:mine.points || [], deleted:mine.deleted || [] }) : null;
    const pts = [...all.values()].filter(p=>!dead.has(p.id)).sort((a,b)=>(a.at || 0) - (b.at || 0));
    P.loaded = new Set(pts.map(p=>p.id));
    return pts;
  },
  async pointsSig(){
    const dir = await this.syncDir('Points'), sig = [];
    for await (const [name, h] of dir.entries()) if(h.kind==='file' && /^points-.+\.json$/i.test(name)) sig.push(name + ':' + (await h.getFile()).lastModified);
    return sig.sort().join('|');
  },
  async writePoints(points){
    const P = this.pt;
    if(!P.ready){ P.ready = true; P.loaded = new Set(points.map(p=>p.id)); } // pupil window on its own: nothing deleted yet
    const now = new Set(points.map(p=>p.id));
    for(const id of P.loaded) if(!now.has(id)) P.myDeleted.add(id);
    for(const id of now) P.myDeleted.delete(id);
    P.loaded = now;
    const text = JSON.stringify({ dev:await this.device(), points:points.filter(p=>!P.foreign.has(p.id)), deleted:[...P.myDeleted] });
    if(text===P.lastText) return;
    const fh = await (await this.syncDir('Points')).getFileHandle(await this.myPointsName(), { create:true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
    P.lastText = text;
    P.sig = await this.pointsSig();
  },
  // OneDrive's conflict copies of viewer-data.json, beside it.
  async conflictCopies(){
    const out = [];
    for await (const [name, h] of this.dir.entries()) if(h.kind==='file' && name!==DATA_FILE && /^viewer-data.+\.json$/i.test(name)) out.push([name, h]);
    return out;
  },
  async readData(){
    let main = null, mtime = 0, text = '';
    try{ const f = await (await this.dir.getFileHandle(DATA_FILE)).getFile(); text = await f.text(); main = text.trim() ? JSON.parse(text) : null; mtime = f.lastModified; }
    catch(e){ if(e.name!=='NotFoundError') throw e; }
    this.base = main ? SVSync.mainText(main) : null; this.seen = mtime; this.lastText = this.base;
    // Conflict copies: merged in (adding only what's missing), then moved to Sync/Conflict copies.
    const extra = main && Array.isArray(main.points) ? main.points.slice() : [];
    this.absorbed = [];
    try{
      for(const [name, h] of await this.conflictCopies()){
        let c = null; const f = await h.getFile();
        try{ c = JSON.parse(await f.text()); }catch(e){}
        if(c && main){
          const n = SVSync.absorb(main, c, iso(mondayOf(today())));
          const before = new Set(extra.map(p=>p.id));
          let np = 0; for(const p of Array.isArray(c.points) ? c.points : []) if(p && p.id && !before.has(p.id)){ extra.push(p); np++; }
          this.absorbed.push({ name, n, np });
        }
        const dest = await (await this.syncDir('Conflict copies')).getFileHandle(name.replace(/\.json$/i, '') + ' ' + iso(new Date(f.lastModified)) + ' ' + f.lastModified + '.json', { create:true });
        const w = await dest.createWritable(); await w.write(await f.text()); await w.close();
        await this.dir.removeEntry(name);
      }
    }catch(e){ console.error('Conflict copies', e); }
    if(main){
      const legacy = Array.isArray(main.points) && main.points.length > 0;
      main.points = await this.readPoints(extra); // a computer's deletions win over the old shared list
      if(this.absorbed.length || legacy) this.lastText = null; // write back soon (app.js afterRead): merged copies in, old points list out
    }
    return { data:main, mtime };
  },
  // Has another computer saved since this window last read or wrote?
  async changed(){
    try{
      if((await this.mtime())!==this.seen) return true;
      if((await this.pointsSig())!==this.pt.sig) return true;
      return (await this.conflictCopies()).length > 0;
    }catch(e){ return false; }
  },
  async mtime(){ try{ return (await (await this.dir.getFileHandle(DATA_FILE)).getFile()).lastModified; }catch(e){ return 0; } },
  /* Write obj (in-memory data). If the file changed on disk since this window's base, merge first
     (in place on obj). baseOverride: the pupil window's own base (dual screen). */
  merged:0,
  async writeData(obj, baseOverride){
    const fh = await this.dir.getFileHandle(DATA_FILE, { create:true });
    let f = await fh.getFile();
    const base = baseOverride!=null ? baseOverride : this.base;
    if(base && (baseOverride!=null || f.lastModified!==this.seen)){
      const t = await f.text();
      if(t.trim()){
        try{
          const theirs = JSON.parse(t);
          if(SVSync.mainText(theirs)!==base) this.merged += SVSync.merge3(obj, JSON.parse(base), theirs);
          // Points an older copy of the app put in the shared file.
          if(Array.isArray(theirs.points) && Array.isArray(obj.points)){
            const have = new Set(obj.points.map(p=>p.id)), P = this.pt;
            for(const p of theirs.points) if(p && p.id && !have.has(p.id) && !P.loaded.has(p.id) && !P.dead.has(p.id) && !P.myDeleted.has(p.id)){ obj.points.push(p); this.merged++; }
          }
        }catch(e){ console.error('Merge', e); }
      }
    }
    if(Array.isArray(obj.points)) await this.writePoints(obj.points);
    const text = SVSync.mainText(obj);
    if(text===this.lastText && f.lastModified===this.seen) return f.lastModified; // nothing new: leave the file (and OneDrive) alone
    const w = await fh.createWritable(); await w.write(text); await w.close();
    f = await fh.getFile();
    this.seen = f.lastModified; this.base = text; this.lastText = text;
    return f.lastModified;
  },
  async lessons(){ return this.dir.getDirectoryHandle(LESSONS_DIR, { create:true }); },
  async exists(name){ try{ await (await this.lessons()).getFileHandle(name); return true; }catch(e){ return false; } },
  async writeDeck(name, file){ const fh = await (await this.lessons()).getFileHandle(name, { create:true }); const w = await fh.createWritable(); await w.write(file); await w.close(); return LESSONS_DIR + '/' + name; },
  // Lesson Library masters (library.js) are read from their own folder; deleteDeck never touches them.
  async readDeck(p){
    if(isLibPath(p)){ let d = this.dir; const parts = p.split('/'), name = parts.pop(); for(const s of parts) d = await d.getDirectoryHandle(s); return (await d.getFileHandle(name)).getFile(); }
    return (await (await this.lessons()).getFileHandle(p.split('/').pop())).getFile();
  },
  async deleteDeck(p){ if(isLibPath(p)) return; try{ await (await this.lessons()).removeEntry(p.split('/').pop()); }catch(e){} },
  async list(){ const out = []; for await (const name of (await this.lessons()).keys()) out.push(name); return out; },
};
// In-memory store used by ?test (automated checks only).
const MemStore = {
  name:'(test)', files:new Map(), dataText:null, supported:true,
  async restore(){ return 'ok'; }, async reconnect(){ return true; }, async pick(){},
  async readData(){ return { data: this.dataText ? JSON.parse(this.dataText) : null, mtime:1 }; },
  async mtime(){ return 1; },
  async writeData(o){ this.dataText = JSON.stringify(o); return 1; },
  async exists(n){ return this.files.has(n); },
  async writeDeck(n, f){ this.files.set(n, f); return LESSONS_DIR + '/' + n; },
  async readDeck(p){ const f = this.files.get(p.split('/').pop()); if(!f) throw new Error('Deck file not found'); return f; },
  async deleteDeck(p){ this.files.delete(p.split('/').pop()); },
  async list(){ return [...this.files.keys()]; },
};
// Pupil window (dual screen): data comes from the console and saves go back to it,
// so only one window ever writes viewer-data.json (dual.js does the messaging).
// If the console is closed, dual.js switches these over to the folder itself.
const LinkStore = {
  get name(){ return SVDual.link.name; }, supported:true,
  restore(){ return SVDual.link.restore(); }, reconnect(){ return SVDual.link.reconnect(); }, pick(){ return SVDual.link.pick(); },
  readData(){ return SVDual.link.readData(); }, mtime(){ return SVDual.link.mtime(); }, writeData(o){ return SVDual.link.writeData(o); },
  exists(n){ return SVDual.link.exists(n); }, writeDeck(n, f){ return SVDual.link.writeDeck(n, f); },
  readDeck(p){ return SVDual.link.readDeck(p); }, deleteDeck(p){ return SVDual.link.deleteDeck(p); },
};
const store = PUPIL ? LinkStore : TEST ? MemStore : FsStore;

/* ---------------- planner timetable ---------------- */
const PLANNER_KEY = 'mfl_planner_v1';
// The typed-in timetable's day: five periods and Form. P2 and Form each have two possible times (the choice is made once, for every day).
const TT_ROWS = [
  { key:'p1', name:'P1', period:1, times:[['08:55','09:55']] },
  { key:'p2', name:'P2', period:2, times:[['09:55','10:55'], ['10:10','11:10']] },
  { key:'p3', name:'P3', period:3, times:[['11:10','12:10']] },
  { key:'form', name:'Form', form:true, times:[['12:10','12:50'], ['12:50','13:30']] },
  { key:'p4', name:'P4', period:4, times:[['13:30','14:30']] },
  { key:'p5', name:'P5', period:5, times:[['14:30','15:30']] },
];
// Which time a row runs at (0 = first option, 1 = second): P2 is chosen for each day (tt.p2Time[day]; a plain number from an earlier version applies to every day), Form once for all days (tt.formTime).
function ttChoice(tt, row, day){
  const v = tt ? tt[row.key + 'Time'] : 0;
  return row.times.length > 1 && (v && typeof v==='object' ? v[day] : v)===1 ? 1 : 0;
}
// P2 and Form start at one of two times, set by the class's year group: 7, 9 and 11 take the second time (P2 10:10, Form 12:50); 8 and 10 take the first (P2 09:55, Form 12:10).
// A code that doesn't start with a year group (after any "Form ") has no rule, so the choice made in the editor is used.
const NON_CLASS = { p:'PPA', f:'PPA', l:'L&M' }; // one letter typed in a lesson box fills in this (see classLabels: neither is a class)
function ttRule(code){
  const y = /^(?:Form\s+)?(\d{1,2})/i.exec(String(code || '').trim());
  const n = y ? Number(y[1]) : 0;
  return [7, 9, 11].includes(n) ? 1 : [8, 10].includes(n) ? 0 : null;
}
const ttTimes = (tt, row, day, code)=>{ const r = row.times.length > 1 ? ttRule(code) : null; return row.times[r==null ? ttChoice(tt, row, day) : r]; };
const Planner = {
  handle:null, data:null, source:null, fileName:'', needsPerm:false, error:'',
  valid(d){ return d && Array.isArray(d.slots); },
  async restore(){
    if(TEST){ if(window.__testPlanner){ this.data = window.__testPlanner; this.source = 'file'; } return; }
    this.handle = await hGet('plannerFile');
    if(this.handle){
      this.fileName = this.handle.name;
      try{
        if((await this.handle.queryPermission({ mode:'read' }))==='granted'){ await this.readFile(); if(this.data) return; }
        else this.needsPerm = true;
      }catch(e){ this.needsPerm = true; }
    }
    this.readLocal();
  },
  async readFile(){
    try{
      const d = JSON.parse(await (await this.handle.getFile()).text());
      if(this.valid(d)){ this.data = d; this.source = 'file'; this.needsPerm = false; this.error = ''; }
      else this.error = `${this.fileName} doesn't look like planner data.`;
    }catch(e){ this.error = `Couldn't read ${this.fileName}.`; }
  },
  readLocal(){ try{ const d = JSON.parse(localStorage.getItem(PLANNER_KEY) || 'null'); if(this.valid(d) && !this.data){ this.data = d; this.source = 'local'; } }catch(e){} },
  async link(){
    const [h] = await window.showOpenFilePicker({ id:'planner-data', types:[{ description:'Planner data (.json)', accept:{ 'application/json':['.json'] } }] });
    this.handle = h; this.fileName = h.name;
    await this.readFile();
    if(this.source==='file' && this.data){ await hSet('plannerFile', h); return true; }
    return false;
  },
  async regrant(){ if(!this.handle) return; if((await this.handle.requestPermission({ mode:'read' }))==='granted') await this.readFile(); },
  // The typed-in timetable (data.timetable, saved in viewer-data.json): five periods a day, Monday to Friday.
  // A class code in a box makes a lesson slot. Used instead of any planner file once it has a code in it.
  applyManual(tt){
    const slots = [];
    if(tt && tt.grid) for(let day = 1; day <= 5; day++){
      let col = tt.grid[day] || [];
      if(col.length===5) col = [col[0], col[1], col[2], '', col[3], col[4]]; // saved before Form was added
      TT_ROWS.forEach((row, i)=>{
        let code = String(col[i] || '').trim();
        if(!code) return;
        if(row.form && !/^Form\b/.test(code)) code = 'Form ' + code; // "8F" → "Form 8F", so it is treated as a form session
        const [start, end] = ttTimes(tt, row, day, code);
        slots.push(row.form ? { id:`d${day}form`, day, start, end, label:code } : { id:`d${day}p${row.period}`, day, period:row.period, start, end, label:code });
      });
    }
    if(slots.length){ this.data = { slots, holidays:[] }; this.source = 'manual'; this.needsPerm = false; this.error = ''; }
    else if(this.source==='manual'){ this.data = null; this.source = null; }
  },
  slotsFor(d){ const wd = d.getDay(); return (this.data ? this.data.slots : []).filter(s=>s.day===wd).sort((a,b)=>toMin(a.start)-toMin(b.start)); },
  holiday(d){ const s = iso(d); return ((this.data && this.data.holidays) || []).find(h=>s>=h.start && s<=h.end) || null; },
};
const isBreakLike = l => l==='Break' || l==='Lunch';
const isForm = l => /^Form\b/.test(l || '');
function slotKind(label){ if(isBreakLike(label)) return 'slim'; if(isForm(label) || /^(L&M|PPA)\b/.test(label)) return 'muted'; return 'lesson'; }
function periodLabel(slot, slots){
  const teaching = slots.filter(s=>!isBreakLike(s.label) && !isForm(s.label));
  if(slot.period && !isBreakLike(slot.label) && !isForm(slot.label)) return 'P' + slot.period; // typed-in timetable: a free period keeps its number
  const i = teaching.findIndex(s=>s.id===slot.id);
  if(i>=0) return 'P' + (i+1);
  return isForm(slot.label) ? 'Form' : slot.label;
}

/* ---------------- typed-in timetable ---------------- */
// Settings → Timetable (and the dashboard's "Set up timetable"): a Monday–Friday, five-period grid of class codes.
// Every code becomes a lesson slot (Planner.applyManual) and, through classLabels(), a class in Settings → Classes,
// where pupil names can be pasted in.
function openTimetable(){
  const tt = data.timetable || {};
  const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
  const old = (tt.grid && (tt.grid[1] || []).length===5); // saved before Form was added: P4 and P5 sit one row lower
  const value = (day, i)=>{ const col = (tt.grid || {})[day] || []; return col[old && i>=3 ? i-1 : i] || ''; };
  const timeText = t=>`${t[0]}–${t[1]}`;
  const head = row=>{
    const nm = `<span class="tt-name">${row.name}</span>`;
    if(row.times.length===1) return `<th scope="row">${nm}<span class="tt-times">${timeText(row.times[0])}</span></th>`;
    return `<th scope="row">${nm}<span class="tt-times">by year group</span></th>`;
  };
  // P2 and Form: the time follows from the class code's year group (ttRule) and is shown under the box. Only a code without a year group gets a choice.
  const timePick = (row, d)=>{
    if(row.times.length===1) return '';
    const cur = ttChoice(tt, row, d);
    return `<span class="tt-auto" hidden></span><select class="tt-pick" data-pk="${row.key}" data-pd="${d}" aria-label="${DAYS[d-1]} ${row.name} time" hidden>${row.times.map((t, k)=>`<option value="${k}" ${k===cur ? 'selected' : ''}>${timeText(t)}</option>`).join('')}</select>`;
  };
  const rows = TT_ROWS.map((row, i)=>`<tr>${head(row)}${[1,2,3,4,5].map(d=>`<td><input type="text" maxlength="24" data-d="${d}" data-r="${i}" value="${esc(value(d, i))}" autocomplete="off" aria-label="${DAYS[d-1]} ${row.name}"><span class="tt-ghost" aria-hidden="true"></span>${timePick(row, d)}</td>`).join('')}</tr>`).join('');
  modal(`<h2>Your timetable</h2>
    <p>Type a class code in each lesson, like <b>8A/Fr1</b>, and leave free periods empty. Every code gets a class list in Settings → Classes.</p>
    <div class="tt-wrap"><table class="tt-grid"><thead><tr><th></th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Save timetable</button></div>`, (m, close)=>{
    m.classList.add('tt-modal');
    // Under each P2 / Form box: the time its year group gives, or (no year group in the code) a choice of the two.
    const showTimes = cell=>{
      const inp = cell.querySelector('input[type=text]'), auto = cell.querySelector('.tt-auto'), sel = cell.querySelector('select.tt-pick');
      if(!auto || !sel) return;
      const row = TT_ROWS[Number(inp.dataset.r)], code = inp.value.trim(), r = ttRule(code);
      auto.hidden = !code || r==null; sel.hidden = !code || r!=null;
      if(r!=null) auto.textContent = timeText(row.times[r]);
    };
    // Suggestion: while typing, a class code already used elsewhere in the table that starts with what's typed is shown in grey after it
    // (lessons and Form are suggested separately; the most-used code first). Tab or → fills it in; typing anything else just carries on.
    const suggest = inp=>{
      const typed = inp.value; if(!typed.trim()) return '';
      const form = TT_ROWS[Number(inp.dataset.r)].form, count = new Map();
      m.querySelectorAll('input[type=text]').forEach(o=>{ const v = o.value.trim(); if(o!==inp && v && !/^(PPA|L&M)$/i.test(v) && TT_ROWS[Number(o.dataset.r)].form===form) count.set(v, (count.get(v) || 0) + 1); });
      let best = '';
      for(const [v, n] of count) if(v.length > typed.length && v.toLowerCase().startsWith(typed.toLowerCase()) && (!best || n > count.get(best) || (n===count.get(best) && v < best))) best = v;
      return best;
    };
    const paintGhost = (inp, on)=>{
      const g = inp.nextElementSibling, s = on ? suggest(inp) : '';
      inp.dataset.sug = s;
      g.innerHTML = s ? `<i>${esc(inp.value)}</i>${esc(s.slice(inp.value.length))}` : '';
    };
    m.addEventListener('focusin', e=>{ if(e.target.matches('input[type=text]')) paintGhost(e.target, true); });
    m.addEventListener('focusout', e=>{ if(e.target.matches('input[type=text]')) paintGhost(e.target, false); });
    m.addEventListener('keydown', e=>{
      const inp = e.target;
      if(!inp.matches('input[type=text]') || !inp.dataset.sug) return;
      const atEnd = inp.selectionStart===inp.value.length && inp.selectionEnd===inp.value.length;
      if((e.key==='Tab' && !e.shiftKey) || (e.key==='ArrowRight' && atEnd)){
        e.preventDefault();
        inp.value = inp.dataset.sug;
        inp.dispatchEvent(new Event('input', { bubbles:true }));
      }
    });
    // A form typed in Monday's box is copied to Tuesday–Friday, unless a later day already has something or has been typed in by hand.
    const formRow = TT_ROWS.findIndex(r=>r.form), formBox = d=>m.querySelector(`[data-d="${d}"][data-r="${formRow}"]`);
    const handTyped = new Set([2, 3, 4, 5].filter(d=>formBox(d).value.trim()));
    // Colour: a class code is tinted in its year group's colours, as on the dashboard (7–11; not the Form row, and no tint without a year group).
    const colourise = ()=>{
      m.querySelectorAll('input[type=text]').forEach(i=>{
        const y = /^(\d{1,2})/.exec(i.value.trim()), n = y ? Number(y[1]) : 0;
        if(TT_ROWS[Number(i.dataset.r)].form || !YEAR_PILL[n]) i.removeAttribute('data-y'); else i.dataset.y = n;
      });
    };
    m.querySelectorAll('td').forEach(showTimes);
    colourise();
    m.addEventListener('input', e=>{
      const inp = e.target; if(!inp.matches('input[type=text]')) return;
      // A lesson box: P or F fills in PPA, L fills in L&M. These are not classes (no class list), but they show on the dashboard.
      const short = TT_ROWS[Number(inp.dataset.r)].form ? null : NON_CLASS[inp.value.toLowerCase()];
      if(short && inp.value.length===1 && e.inputType!=='deleteContentBackward') inp.value = short;
      if(inp.dataset.r===String(formRow)){
        const d = Number(inp.dataset.d);
        if(d===1){ for(const x of [2, 3, 4, 5]) if(!handTyped.has(x)){ formBox(x).value = inp.value; showTimes(formBox(x).closest('td')); } }
        else handTyped.add(d);
      }
      showTimes(inp.closest('td'));
      colourise(); paintGhost(inp, true);
    });
    const first = m.querySelector('input[type=text]'); if(first) first.focus();
    m.querySelector('[data-a=no]').onclick = close;
    m.querySelector('[data-a=ok]').onclick = ()=>{
      const grid = {};
      for(let d = 1; d <= 5; d++) grid[d] = TT_ROWS.map((row, i)=>m.querySelector(`[data-d="${d}"][data-r="${i}"]`).value.trim());
      // Kept for a code with no year group: its chosen time. (A year group's rule needs no saved choice.)
      const choice = key=>{ const o = {}; for(let d = 1; d <= 5; d++) o[d] = Number(m.querySelector(`[data-pk="${key}"][data-pd="${d}"]`).value) || 0; return o; };
      data.timetable = { grid, p2Time:choice('p2'), formTime:choice('form') };
      Planner.applyManual(data.timetable);
      saveSoon(); close();
      const n = new Set(Planner.data ? Planner.data.slots.map(s=>s.label) : []).size;
      toast(n ? `Timetable saved: ${n} class${n>1 ? 'es' : ''}. Add names in Settings → Classes.` : 'Timetable cleared');
      if(view.name==='settings') renderSettings(); else if(view.name==='dash') renderDashboard();
    };
  });
}

/* ---------------- persisted data ---------------- */
let data = null;
let saveTimer = null, saveStatus = 'saved';
// v1.77: saves run one at a time (saveChain); saveBusy counts the ones queued or writing.
let saveChain = Promise.resolve(), saveBusy = 0;
let pupilBase = null; // pupil window (dual screen): the copy it was given, for merging its saves
function normalise(d){
  d = d && typeof d==='object' ? d : {};
  d.version = 1;
  d.lessons = d.lessons || {};
  d.extras = d.extras || {};
  d.settings = Object.assign({ rail:'right', showTimeLeft:true, clockMode:0 }, d.settings || {});
  d.ideas = Array.isArray(d.ideas) ? d.ideas.filter(i=>i && typeof i.short==='string').map(i=>({ id:i.id || 'i' + uid(), short:i.short, detail:typeof i.detail==='string' ? i.detail : '' })) : []; // kept so old saved ideas aren't lost (no longer shown)
  d.templates = normTemplates(d.templates); // Slide / Object Gallery (v1.33)
  seedInon(d.templates); // v1.92: the built-in IN&ON templates
  d.alarms = Array.isArray(d.alarms) ? d.alarms.filter(a=>a && typeof a.at==='number') : []; // clock tool (tools.js)
  // Printing Centre (printcentre.js, v1.40): files dropped into a day's Printer Stack. Each is a copy in Lessons/ ('Print - …').
  d.printJobs = Array.isArray(d.printJobs) ? d.printJobs.filter(j=>j && j.id && /^\d{4}-\d{2}-\d{2}$/.test(j.day || '') && j.file && j.file.path && ['pdf','docx','pptx'].includes(j.file.type) && Number(j.n)>0) : [];
  for(const l of Object.values(d.lessons)){
    if(typeof l.title!=='string') l.title = '';
    if(l.lang!=='es') l.lang = 'fr';
    l.files = l.files || {}; l.hides = l.hides || {}; l.ink = l.ink || {}; l.slideCount = l.slideCount || {};
    l.myNotes = l.myNotes && typeof l.myNotes==='object' ? l.myNotes : {}; // teacher's own notes per slide (editor / console), never written to the deck
    for(const m of ['pptx','pdf']){ l.hides[m] = l.hides[m] || {}; l.ink[m] = l.ink[m] || {}; l.myNotes[m] = l.myNotes[m] || {}; }
    if(!l.mode || !l.files[l.mode]) l.mode = l.files.pptx ? 'pptx' : l.files.pdf ? 'pdf' : null;
    if(l.ratio!=null && !RATIOS[l.ratio]) delete l.ratio; // Design → Slide size (PowerPoint)
    if(l.theme!=null && !['7','8','9','10','11','A','orig'].includes(l.theme)) delete l.theme; // v1.91: Design → Themes (see themeKey)
    // v1.62 (sb-editor.js): the lesson's sentence clipboard [{ id, t, l:'fr'|'es'|'en', u? }] and the builder used last { year, term, name }.
    if(l.sbClip!=null){ l.sbClip = Array.isArray(l.sbClip) ? l.sbClip.filter(x=>x && x.id && typeof x.t==='string') : []; if(!l.sbClip.length) delete l.sbClip; }
    if(l.sbLast!=null && !(l.sbLast && typeof l.sbLast.name==='string')) delete l.sbLast;
    // Slide order from the editor (v1.31): [{ k, src?, hid?, del? }] per mode; see slideList().
    if(l.slides!=null){
      const out = {};
      for(const m of ['pptx','pdf']){
        const s = l.slides && l.slides[m];
        if(!Array.isArray(s) || !l.files[m]) continue;
        const seen = new Set();
        const list = s.filter(e=>e && (typeof e.k==='number' || typeof e.k==='string') && !seen.has(e.k) && seen.add(e.k));
        if(list.length) out[m] = list;
      }
      if(Object.keys(out).length) l.slides = out; else l.slides = undefined;
    }
    // Printer Stack (print.js): [{ id, fmt, mode, slide, n, added, printed }]
    if(l.stack!=null){
      l.stack = Array.isArray(l.stack) ? l.stack.filter(it=>it && ['2x2','single','lsa'].includes(it.fmt) && (it.mode==='pptx' || it.mode==='pdf') && Number(it.n)>0) : [];
      if(!l.stack.length) delete l.stack;
    }
  }
  linkSeries(d); // v1.79: Tuesday Form shares one master
  return d;
}
/* v1.79 (agreed 24 Oct 2026): every Tuesday Form lesson (slot s13) from 20 Oct shares one master: the deck,
   its hides and reveals, slide order and slide count. Stored once as data.series.s13; each such lesson reads and
   writes it through accessors, so the editor code is unchanged. Pen marks, My notes, title and last slide stay per
   lesson. Lessons before `from` (13 Oct) keep their own state. */
const SERIES = []; // no built-in shared series in version 1; each entry would be { key, slotId, weekday, from:'YYYY-MM-DD' }
const SERIES_SHARED = ['files', 'mode', 'hides', 'slides', 'slideCount'];
function seriesFor(l){
  if(!l || !l.date || !l.slotId) return null;
  return SERIES.find(s => s.slotId===l.slotId && l.date>=s.from && new Date(l.date + 'T12:00:00').getDay()===s.weekday) || null;
}
// Points a lesson's shared fields at its series record (d.series). Safe to call again: already-linked fields are left alone.
function linkOne(l, d){
  const sp = seriesFor(l), M = sp && d && d.series && d.series[sp.key];
  if(!M) return;
  for(const k of SERIES_SHARED){
    const cur = Object.getOwnPropertyDescriptor(l, k);
    if(cur && cur.get) continue;
    Object.defineProperty(l, k, { enumerable:true, configurable:true,
      get(){ return M[k]; },
      set(v){ if(v===undefined) delete M[k]; else M[k] = v; } });
  }
}
// Creates the series record from the earliest member if it's missing, then links every member.
function linkSeries(d){
  d.series = d.series && typeof d.series==='object' ? d.series : {};
  for(const sp of SERIES){
    const members = Object.values(d.lessons).filter(l=>seriesFor(l)===sp).sort((a,b)=>a.date<b.date ? -1 : a.date>b.date ? 1 : 0);
    if(!d.series[sp.key]){
      const f = members[0] || {};
      d.series[sp.key] = { hides:f.hides || { pptx:{}, pdf:{} }, slides:f.slides, files:f.files || {}, mode:f.mode || null, slideCount:f.slideCount || {} };
    }
    for(const l of members) linkOne(l, d);
  }
}
// dual.js: while the teacher console's editor is open, its changes go to the pupil window (which saves) instead.
let saveHold = null;
function saveSoon(delay){ if(saveHold){ saveHold(); return; } saveStatus = 'saving'; updatePill(); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, delay==null ? 600 : delay); }
// base: the pupil window's starting copy, when the pupil window is the one saving (dual.js).
// v1.77: queued behind any save already writing, so two never write viewer-data.json at the same time.
function saveNow(base){
  clearTimeout(saveTimer); saveTimer = null;
  saveBusy++;
  const run = saveChain.then(()=>writeNow(base)).finally(()=>{ saveBusy--; });
  saveChain = run.catch(()=>{});
  return run;
}
async function writeNow(base){
  try{
    await store.writeData(data, base); saveStatus = 'saved';
    if(window.SVDual) SVDual.saved();
    if(store===FsStore && FsStore.merged){ FsStore.merged = 0; if(view.name==='dash') renderDashboard(); }
  }
  catch(e){ console.error(e); saveStatus = 'error'; if(view.name!=='dash') toast("Couldn't save to the OneDrive folder — go Home and reconnect.", true); }
  updatePill();
}
// v1.77: closing or reloading Edge with a save still to happen (pen marks save 1.2 s after the pen lifts):
// start it now and ask Edge to check first. Not the pupil window while it's linked (it hands its data
// to the teacher screen on pagehide, dual.js), and not the Refresh button (it saves before reloading).
window.addEventListener('beforeunload', e=>{
  if(!data || TEST || (PUPIL && !(window.SVDual && SVDual.detached))) return;
  if(!saveTimer && !saveBusy) return;
  if(saveTimer) saveNow();
  e.preventDefault(); e.returnValue = '';
});
function updatePill(){
  for(const p of $$('.status-pill')) pillOne(p); // v1.85: the Printing Centre and Library pages have their own header
}
function pillOne(p){
  p.className = 'status-pill ' + saveStatus;
  // v1.41: just the dot (green saved, amber saving); the error state keeps its words because it needs a click.
  const msg = saveStatus==='saving' ? 'Saving…' : saveStatus==='error' ? 'Not saved — click to reconnect' : 'Saved to ' + store.name;
  p.title = msg;
  p.innerHTML = `<span class="dot"></span>${saveStatus==='error' ? esc(msg) : saveStatus==='saving' ? 'Saving…' : 'Saved'}`; // v1.85: the word as well
}
/* ---------- several computers (v1.52, sync.js) ----------
   Changes saved on another computer are picked up between lessons only: on the dashboard (when
   the window comes back into view, gets focus, or every 45 s), and just before a lesson opens.
   While presenting nothing is reloaded; saves still merge rather than overwrite (FsStore.writeData). */
const BETWEEN = new Set(['dash', 'settings', 'apreview', 'printcentre', 'library']);
let syncing = null;
function syncIn(){
  if(syncing) return syncing;
  syncing = (async ()=>{
    try{
      if(!data || store!==FsStore || !FsStore.dir) return false;
      if(saveTimer) await saveNow();
      await saveChain; // v1.77: a save still writing finishes first
      if(!(await FsStore.changed())) return false;
      if(document.querySelector('#loading')) return false; // v1.77: something started meanwhile (adding a deck…): next time
      const r = await store.readData(); if(!r.data) return false;
      data = normalise(r.data);
      undoKeep.clear(); // v1.53: Undo mustn't put back settings from before another computer's changes
      afterRead();
      if(window.SVDual) SVDual.saved();
      return true;
    }catch(e){ console.error('Sync', e); return false; }
    finally{ syncing = null; }
  })();
  return syncing;
}
// After a read: tell about merged conflict copies; write back if the read changed anything.
function afterRead(){
  if(store!==FsStore) return;
  const a = FsStore.absorbed || []; FsStore.absorbed = [];
  const n = a.reduce((s, x)=>s + x.n + x.np, 0);
  if(a.length) toast(n ? `Merged ${n} item${n>1 ? 's' : ''} from a copy OneDrive made when two computers saved at once. The copy is in Sync › Conflict copies.` : 'OneDrive made a spare copy when two computers saved at once; nothing was missing. It is in Sync › Conflict copies.');
  if(FsStore.lastText===null) saveSoon(300);
}
// v1.77: not while something is in progress (#loading: adding a deck, duplicating, Library copies…), so
// another computer's changes can't replace the data under it and lose what it adds.
const busyBetween = ()=>!!document.querySelector('.modal-back, #loading');
async function refreshBetween(){
  if(!data || !BETWEEN.has(view.name) || busyBetween()) return;
  const was = view.name;
  let ch = await syncIn();
  if(Planner.source==='file'){ const before = JSON.stringify(Planner.data); await Planner.readFile(); if(JSON.stringify(Planner.data)!==before) ch = true; }
  if(!ch || view.name!==was || busyBetween()) return;
  if(view.name==='apreview' || (view.name==='settings' && setSec==='classes')){ if(window.SVClasses) window.SVClasses.refresh(); }
  else if(view.name==='settings'){ if(setSec!=='sb' && setSec!=='wp') renderSettings(); }
  else if(view.name==='printcentre'){ if(window.SVPrintCentre) SVPrintCentre.refresh(true); }
  else if(view.name==='library'){ if(window.SVLibrary && SVLibrary.renderFull) SVLibrary.renderFull(); }
  else renderDashboard();
}
document.addEventListener('visibilitychange', ()=>{
  if(!data) return;
  if(document.visibilityState==='hidden'){ if(saveTimer) saveNow(); return; }
  refreshBetween();
});
window.addEventListener('focus', ()=>refreshBetween());
setInterval(()=>{ if(document.visibilityState==='visible' && view.name==='dash') refreshBetween(); }, 45000);
/* v1.77: the dashboard redraws itself when a bell passes (Now / Next card, the current period) or the
   day changes (it moves on to the new day if it was showing the old one). Not while something is open
   or being typed (a pop-up, a menu, renaming a deck). view.tsig is set only by renderDashboard. */
function dashTimeSig(){
  const t = today(), n = new Date(), nowM = n.getHours()*60 + n.getMinutes();
  let k = 0;
  if(Planner.data) for(const s of Planner.slotsFor(t)){ if(s.start && toMin(s.start)<=nowM) k++; if(s.end && toMin(s.end)<=nowM) k++; }
  return iso(t) + '|' + k;
}
setInterval(()=>{
  if(!data || view.name!=='dash' || view.tsig==null || document.visibilityState!=='visible') return;
  if(busyBetween() || document.querySelector('.menu, .name-input, .dr.drag-over')) return;
  if(dashTimeSig()===view.tsig) return;
  if(iso(selDate)===view.tday) selDate = defaultDate(); // was on "today": follow the new day
  renderDashboard();
}, 20000);

function lessonId(dateIso, slotId){ return dateIso + '|' + slotId; }
function ensureLesson(meta){
  let l = data.lessons[meta.id];
  if(!l) l = data.lessons[meta.id] = { id:meta.id, date:meta.date, slotId:meta.slotId, files:{}, mode:null, hides:{ pptx:{}, pdf:{} }, ink:{ pptx:{}, pdf:{} }, myNotes:{ pptx:{}, pdf:{} }, slideCount:{}, lastSlide:0, title:'', lang:'fr' };
  linkOne(l, data); // v1.79
  l.label = meta.label; l.start = meta.start || ''; l.end = meta.end || ''; l.period = meta.period || '';
  return l;
}
// Editor changes to a slide's content (moved/resized objects, edited text, added text boxes).
function editsOf(l, mode, i){ return editsFrom(l && l.hides[mode] && l.hides[mode][i], l); }
// c: one slide's saved settings (or a Slide Gallery template's); l: the lesson it's shown in (for the date field).
function editsFrom(c, l){ const fields = lessonFields(l); return c ? { geo:c.geo || {}, crop:c.crop || {}, text:c.text || {}, added:c.added || [], style:c.style || {}, z:c.z || null, bg:c.bg || null, media:mediaUrl, fields } : { geo:{}, text:{}, added:[], style:{}, media:mediaUrl, fields }; }
// Auto-fill fields (Insert → Date): <span data-field="date"> in any text shows the lesson's date in its language.
// date: in words, as on the presenter's top bar (lundi, douze octobre). dateNum: with the number (lundi 12 octobre / lunes 12 de octubre).
function lessonFields(l){
  if(!l || !l.date) return null;
  try{
    const d = fromIso(l.date), L = DATE_WORDS[l.lang] || DATE_WORDS.fr, n = d.getDate();
    const num = l.lang==='es' ? `${L.days[d.getDay()]} ${n} de ${L.months[d.getMonth()]}` : `${L.days[d.getDay()]} ${n===1 ? '1er' : n} ${L.months[d.getMonth()]}`;
    return { date:dateWords(d, l.lang), dateNum:num };
  }catch(e){ return null; }
}
/* Slide size (Design tab): lesson.ratio = '16:9' | '4:3' (PowerPoint only; absent = the deck's own).
   Each slide keeps its content at the same size, centred; the frame (and background) widens or narrows by
   2·dx. Everything the editor saves (moved objects, added objects, cover boxes, pen marks) is in the
   lesson's frame, so changing the size shifts them by the change in dx (shiftForRatio). */
const RATIOS = { '16:9':16/9, '4:3':4/3 };
function frameW(size, ratio){ const r = RATIOS[ratio]; return r ? Math.round(size.h * r * 100) / 100 : size.w; }
function ratioDx(size, ratio){ return (frameW(size, ratio) - size.w) / 2; }
function liveObjCount(c){ return Object.values((c && c.obj) || {}).filter(v=>v!=='del').length; }
function hideCount(l, mode){ let n = 0; for(const c of Object.values(l.hides[mode] || {})) n += liveObjCount(c) + (c.covers || []).length; return n; }
// Deleted objects ('del' in hides) are removed from the rendered slide everywhere.
function deletedIds(l, mode, i){ const o = ((l && l.hides[mode] && l.hides[mode][i]) || {}).obj || {}; return Object.keys(o).filter(k=>o[k]==='del'); }
function dropDeletedEl(root, l, mode, i){ for(const oid of deletedIds(l, mode, i)){ const e = root.querySelector(`[data-oid="${CSS.escape(oid)}"]`); if(e) e.remove(); } }
function dropDeleted(stage, l, mode, i){
  const gone = new Set(deletedIds(l, mode, i)); if(!gone.size) return;
  dropDeletedEl(stage.slideEl, l, mode, i);
  stage.objects = (stage.objects || []).filter(o=>!gone.has(o.oid) && !(o.table && gone.has(o.table)));
}
// Own notes: plain text per lesson, mode and slide index (data.lessons[id].myNotes[mode][i]).
function myNote(l, mode, i){ return (l && l.myNotes && l.myNotes[mode] && l.myNotes[mode][i]) || ''; }
function setMyNote(l, mode, i, text){
  if(!l) return;
  if(!l.myNotes) l.myNotes = {};
  if(!l.myNotes[mode]) l.myNotes[mode] = {};
  text = String(text || '').slice(0, 5000);
  if(text.trim()) l.myNotes[mode][i] = text; else delete l.myNotes[mode][i];
}
function inkCount(l, mode){ return Object.values(l.ink[mode] || {}).filter(a=>a && a.length).length; }
/* v1.78 (agreed 20 Oct 2026): pen marks are kept for 7 days after the lesson's date, then deleted, so
   viewer-data.json doesn't grow all year (they were ~75% of it). Only the pen marks: reveals, edits,
   My notes and the deck stay. Not Library masters, not whiteboards (data.whiteboards). Run by the
   dashboard; never by the pupil window (its saves merge the deletion in from the console's). */
const INK_DAYS = 7;
function pruneOldInk(){
  if(!data || PUPIL) return 0;
  const cut = iso(addDays(today(), -INK_DAYS)); let n = 0;
  for(const l of Object.values(data.lessons)){
    if(l.lib || !l.date || l.date > cut || !l.ink) continue;
    for(const m of ['pptx','pdf']) if(l.ink[m] && Object.keys(l.ink[m]).length){ l.ink[m] = {}; n++; }
  }
  return n;
}

/* ---------------- slide list (editor: rearrange, hide, delete, add slides) ----------------
   lesson.slides[mode] = [{ k, src?, hid?, del? }] in presenting order. Absent = the deck's own order.
   k is the slide's key for everything saved per slide (hides, ink, myNotes, print choices, Printer
   Stack). The deck's own slides keep their index as key (a number), so data from before 1.31 fits
   unchanged. Slides added in the editor get a string key 's…'.
   src (added slides only):
     { i }          another copy of the deck's own slide i (Duplicate)
     { f, i }       slide i of another .pptx kept in the Lessons folder ('Shared - …', from Import
                    slides or a paste from another lesson). Never deleted with a lesson.
     { blank:true } an empty slide in the deck's style
     { blank:true, f } an empty slide in the style of another deck in the Lessons folder (from the Slide Gallery, v1.33)
   hid: true / false overrides PowerPoint's own "hidden slide" flag. del: deleted (kept so it can be restored).
   None of this changes the deck file. */
const skey = k => typeof k==='string' && /^\d+$/.test(k) ? Number(k) : k;
const SHARED_PREFIX = 'Shared - ', MEDIA_PREFIX = 'Media - ';
function slideList(l, mode, n){
  const s = l && l.slides && l.slides[mode];
  if(Array.isArray(s) && s.length) return s;
  return [...Array(n || 0).keys()].map(k=>({ k }));
}
// Make the list real (so it can be changed). v: the lesson's LessonView.
function ownList(l, mode, v){
  if(!l.slides) l.slides = {};
  if(!Array.isArray(l.slides[mode]) || !l.slides[mode].length) l.slides[mode] = slideList(l, mode, v.base.count).map(e=>({ ...e }));
  return l.slides[mode];
}
function newSlideKey(l){ let k; do k = 's' + uid(); while(Object.values(l.hides).some(h=>h && h[k]) || ['pptx','pdf'].some(m=>slideList(l, m, 0).some(e=>e.k===k))); return k; }
// Pictures pasted into the editor live in the Lessons folder as 'Media - ….png'; this maps their paths to blob URLs.
const mediaUrls = new Map();
function mediaUrl(p){ return p ? (mediaUrls.get(p) || null) : null; }
async function loadMedia(paths){
  for(const p of paths){
    if(!p || mediaUrls.has(p)) continue;
    try{ const f = await store.readDeck(p); mediaUrls.set(p, URL.createObjectURL(f)); }catch(e){ console.warn('Missing picture', p); }
  }
}
function mediaIn(l, mode){
  const out = new Set();
  for(const c of Object.values((l.hides && l.hides[mode]) || {})) for(const a of ((c && c.added) || [])){
    if(a.pic) out.add(a.pic);
    if(a.art) for(const m of a.art.matchAll(/data-media="([^"]+)"/g)) out.add(m[1]);
  }
  return [...out];
}
/* A lesson's slides as one view, in the lesson's order. Same calls as PptxView / PdfView, but
   every slide is named by its key (see above), and keys lists the slides that aren't deleted. */
class LessonView {
  constructor(l, mode, base){ this.id = l.id; this.l0 = l; this.mode = mode; this.base = base; this.type = base.type; this.extra = new Map(); }
  get l(){ return (data && data.lessons[this.id]) || this.l0; }
  get deck(){ return this.base.deck; }
  get doc(){ return this.base.doc; }
  ok(e){
    if(!e) return false;
    const s = e.src;
    if(!s) return typeof e.k==='number' && e.k < this.base.count;
    if(s.blank || s.f) return this.type==='pptx';
    return s.i >= 0 && s.i < this.base.count;
  }
  all(){ return slideList(this.l, this.mode, this.base.count).filter(e=>this.ok(e)); }
  get keys(){ return this.all().filter(e=>!e.del).map(e=>e.k); }
  get count(){ return this.keys.length; }
  ent(k){ k = skey(k); return this.all().find(e=>e.k===k) || null; }
  has(k){ const e = this.ent(k); return !!e && !e.del; }
  pos(k){ return this.keys.indexOf(skey(k)); }
  src(k){
    const e = this.ent(k);
    if(!e) return { v:this.base, i: typeof k==='number' ? k : 0 };
    const s = e.src;
    if(!s) return { v:this.base, i:e.k };
    if(s.blank) return { v:(s.f && this.extra.get(s.f)) || this.base, i:-1, blank:true, act:s.act || null };
    if(s.f){ const x = this.extra.get(s.f); return x ? { v:x, i:s.i } : { v:null, i:s.i, missing:s.f }; }
    return { v:this.base, i:s.i };
  }
  isHidden(k){ const e = this.ent(k); if(e && e.hid!=null) return !!e.hid; if(e && e.src) return false; return this.base.isHidden(e ? e.k : k); }
  rawSize(k){ const s = this.src(k); return s.v ? s.v.size(s.blank ? 0 : s.i) : this.base.size(); }
  get ratio(){ return this.type==='pptx' ? (this.l.ratio || null) : null; }
  size(k){ const z = this.rawSize(k); return { w:frameW(z, this.ratio), h:z.h }; }
  dx(k, ratio){ return ratioDx(this.rawSize(k), ratio===undefined ? this.ratio : ratio); }
  render(k, opts){
    const s = this.src(k);
    opts = Object.assign({}, opts || {}, { num: this.pos(k) + 1 || undefined });
    if(this.ratio) opts.frameW = this.size(k).w;
    if(s.blank){
      const r = s.v.deck.renderBlank(opts);
      // Activity slides (activities.js): the activity is drawn on top of the blank slide.
      if(s.act && window.SVAct){ const z = this.rawSize(k); SVAct.paint(r.el, s.act, z.w, z.h, this.dx(k)); }
      return r;
    }
    if(!s.v){
      const { w, h } = this.size(k);
      const e = el('div', 'pptx-slide sv-missing', `<div>This slide's file (${esc((s.missing || '').split('/').pop())}) isn't in the Lessons folder.</div>`);
      e.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:#fff`;
      return { el:e, objects:[] };
    }
    return s.v.render(s.i, opts);
  }
  anims(k){ const s = this.src(k); return s.v && !s.blank ? s.v.anims(s.i) : new Map(); }
  objectIds(k){ const s = this.src(k); return s.v && !s.blank ? s.v.objectIds(s.i) : []; }
  notes(k){ const s = this.src(k); return s.v && !s.blank ? s.v.notes(s.i) : Promise.resolve([]); }
  pdfPage(k){ const s = this.src(k); return this.base.doc.getPage(s.i + 1); }
  // Where a slide's content comes from, as a file path + index (for copying to another lesson).
  origin(k){
    const e = this.ent(k); if(!e) return null;
    const own = this.l.files[this.mode] && this.l.files[this.mode].path;
    if(!e.src) return { f:own, i:e.k };
    if(e.src.blank) return Object.assign({ blank:true, look: e.src.f || own }, e.src.act ? { act:JSON.parse(JSON.stringify(e.src.act)) } : {}); // look: whose style it's in (kept by the Slide Gallery); act: an activity slide
    if(e.src.f) return { f:e.src.f, i:e.src.i };
    return { f:own, i:e.src.i };
  }
  // Load any other decks and pictures the lesson now uses (after an import or a paste).
  async sync(){
    for(const e of slideList(this.l, this.mode, this.base.count)){
      const f = e.src && e.src.f; if(!f || this.extra.has(f)) continue;
      try{ this.extra.set(f, await loadDeckFile(f, 'pptx', themeKey(this.l))); }catch(err){ console.warn('Missing shared deck', f, err); }
    }
    await loadMedia(mediaIn(this.l, this.mode));
    return this;
  }
  // v1.91: load the decks again in the lesson's current theme (Design → Themes).
  async reload(){
    const f = this.l.files[this.mode];
    this.base = await loadDeckFile(f.path, this.mode, themeKey(this.l)); this.extra.clear();
    return this.sync();
  }
}

/* ---------------- deck views (pptx / pdf behind one interface) ---------------- */
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
class PptxView {
  static async load(buf){ const v = new PptxView(); v.type = 'pptx'; v.deck = await PPTX.Deck.load(buf); if(!v.deck.slides.length) throw new Error('no slides found'); return v; }
  get count(){ return this.deck.slides.length; }
  size(){ return { w:this.deck.width, h:this.deck.height }; }
  isHidden(i){ return this.deck.slides[i].hidden; }
  render(i, opts){ return this.deck.render(i, opts); }
  anims(i){ return this.deck.animations(i); }
  objectIds(i){ return this.deck.objectIds(i); }
  notes(i){ return this.deck.notes(i); }
}
class PdfView {
  static async load(buf){
    const v = new PdfView(); v.type = 'pdf';
    v.doc = await pdfjsLib.getDocument({ data:new Uint8Array(buf), isEvalSupported:false }).promise;
    v.sizes = [];
    for(let i=1;i<=v.doc.numPages;i++){ const vp = (await v.doc.getPage(i)).getViewport({ scale:1 }); v.sizes.push({ w:vp.width, h:vp.height }); }
    return v;
  }
  get count(){ return this.doc.numPages; }
  size(i){ return this.sizes[i || 0]; }
  isHidden(){ return false; }
  render(i, opts={}){
    const { w, h } = this.sizes[i];
    const e = el('div','pdf-page'); e.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:#fff`;
    const c = document.createElement('canvas'); e.appendChild(c);
    const px = opts.pixelWidth || 1600, scale = px / w;
    c.width = Math.round(w*scale); c.height = Math.round(h*scale);
    this.doc.getPage(i+1).then(p=>p.render({ canvasContext:c.getContext('2d'), viewport:p.getViewport({ scale }) }).promise).catch(()=>{});
    return { el:e, objects:[] };
  }
  anims(){ return new Map(); }
  objectIds(){ return []; }
  async notes(){ return []; }
}
/* v1.91 Design → Themes. A lesson's colours: l.theme = '7' … '11' (that year's colours), 'A' (gold, not year-specific) or 'orig'
   (the deck as it was imported); absent = its own year (class code, else the Library folder it came from), else gold.
   The file in the Lessons / Library folder is never changed: the deck is recoloured (year-colours.js) when it is opened, and kept
   in deckCache under 'path|theme'. deckCache.delete(path) drops every themed copy of that file too. */
class DeckCache extends Map{
  delete(k){ for(const x of [...this.keys()]) if(typeof x==='string' && x.startsWith(k + '|')) super.delete(x); return super.delete(k); }
}
const deckCache = new DeckCache();
const THEME_KEYS = ['7','8','9','10','11','A','orig'];
// Decks are shown as imported. A year group's colours are applied only when the teacher picks them in the editor's Design tab.
function themeAuto(l){ return 'orig'; }
const themeKey = l=>l && THEME_KEYS.includes(l.theme) ? l.theme : themeAuto(l);
const THEME_NAMES = { '7':'Year 7 (green)', '8':'Year 8 (teal)', '9':'Year 9 (burgundy)', '10':'Year 10 (purple)', '11':'Year 11 (grey)', A:'Gold (not year-specific)', orig:'As imported' };
const themePalette = key=>!window.YearColours || key==='orig' ? null : key==='A' ? YearColours.PALETTES.gold : YearColours.PALETTES['Year ' + key] || null;
// The deck file as the lesson shows it (the export uses this too).
async function themedFile(lesson, file){ const pal = themePalette(themeKey(lesson)); return pal ? YearColours.recolourDeck(file, pal, true) : file; }
function loadDeckFile(p, mode, key){
  const pal = mode==='pptx' && key ? themePalette(key) : null, ck = pal ? p + '|' + key : p;
  if(!deckCache.has(ck)){
    deckCache.set(ck, (async()=>{
      let file = await store.readDeck(p);
      if(pal) file = await YearColours.recolourDeck(file, pal, true);
      const buf = await file.arrayBuffer();
      return mode==='pptx' ? PptxView.load(buf) : PdfView.load(buf);
    })().catch(e=>{ deckCache.delete(ck); throw e; }));
  }
  return deckCache.get(ck);
}
// The lesson's slides (LessonView) for mode, with any other decks and pictures it uses loaded.
async function getDeck(lesson, mode){
  const f = lesson.files[mode];
  if(!f) throw new Error('No ' + mode.toUpperCase() + ' attached');
  const base = await loadDeckFile(f.path, mode, themeKey(lesson));
  return new LessonView(lesson, mode, base).sync();
}
function bigPixelWidth(){ return Math.min(3200, Math.max(1600, Math.round(screen.width * (devicePixelRatio || 1)))); }
function thumbEl(view, i, width, l, mode){
  const { w, h } = view.size(i);
  const k = width / w;
  const box = el('div','thumb-box'); box.style.cssText = `position:relative;width:${width}px;height:${Math.round(h*k)}px;overflow:hidden;background:#fff`;
  const inner = el('div'); inner.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:scale(${k});transform-origin:0 0;pointer-events:none`;
  const slide = view.render(i, { thumb:true, pixelWidth: Math.round(width*2), edits: l ? editsOf(l, mode, i) : null }).el;
  if(l) dropDeletedEl(slide, l, mode, i);
  inner.appendChild(slide);
  box.appendChild(inner);
  return box;
}
function mountThumb(holder, view, i, width, l, mode){ const t = thumbEl(view, i, width, l, mode); holder.appendChild(t); PPTX.fitText(t); return t; }
// Animations in the deck -> starting hide settings. Entrance = hidden at start; exit = shown, can hide.
function animHides(view, i){
  const ids = new Set(view.objectIds(i));
  const obj = {};
  for(const [id, cls] of view.anims(i)) if(ids.has(id)) obj[id] = cls==='entr' ? 'hide' : 'toggle';
  return obj;
}
function applyAnimations(lesson, view){
  const out = {};
  const keys = view.keys || [...Array(view.count).keys()];
  for(const i of keys){ const obj = animHides(view, i); if(Object.keys(obj).length) out[i] = { obj, covers:[] }; }
  lesson.hides.pptx = out;
}

/* ---------------- slide stage (fits a slide into a host) ---------------- */
/* Zoom: z is on top of the fit-to-screen scale (1 = whole slide, up to ZOOM_MAX).
   Pinch with two fingers (or Ctrl + mouse wheel / trackpad pinch) to zoom; two
   fingers drag to pan. Mouse wheel pans while zoomed. opts.onePan() = true lets
   one finger / the mouse drag the slide around too (presenter, arrow tool).
   opts.onGesture() runs when a pinch starts, so the page can drop a half-drawn
   stroke or half-done drag. Showing a different slide resets the zoom.
   onfit: the scale (k) changed, rebuild anything placed with k.
   onmove: only the position changed (pan). */
const ZOOM_MAX = 4;
class Stage {
  constructor(host, opts={}){
    this.host = host; host.classList.add('stage-host');
    this.frame = el('div','stage-frame'); this.scale = el('div','stage-scale');
    this.ui = el('div','stage-ui');
    this.frame.append(this.scale, this.ui); host.appendChild(this.frame);
    this.pill = el('button','zoom-pill'); this.pill.hidden = true; this.pill.title = 'Back to the whole slide';
    this.pill.onclick = e=>{ e.stopPropagation(); this.resetZoom(); };
    host.appendChild(this.pill);
    this.k = 1; this.base = 1; this.z = 1; this.ox = 0; this.oy = 0;
    this.onfit = null; this.onmove = null; this.opts = opts;
    this.ro = new ResizeObserver(()=>this.fit()); this.ro.observe(host);
    this.gestures();
  }
  show(view, i, edits){
    const key = i;
    if(key!==this._key){ this._key = key; this.z = 1; }
    const { w, h } = view.size(i); this.W = w; this.H = h;
    this.scale.innerHTML = ''; this.scale.style.width = w + 'px'; this.scale.style.height = h + 'px';
    const r = view.render(i, { pixelWidth: bigPixelWidth(), edits });
    this.slideEl = r.el; this.objects = r.objects;
    this.scale.appendChild(r.el);
    if(window.PPTX) PPTX.fitText(r.el);
    this.fit(true);
    return r;
  }
  fit(force){
    if(!this.W) return;
    const W = this.host.clientWidth, H = this.host.clientHeight; if(!W || !H) return;
    const base = Math.min(W/this.W, H/this.H);
    if(!force && Math.abs(base - this.base) < 1e-4 && this._W===W && this._H===H) return;
    // Keep the same point in the middle of the screen when the window changes size.
    const cx = this._W ? (this._W/2 - this.ox)/this.k : this.W/2, cy = this._H ? (this._H/2 - this.oy)/this.k : this.H/2;
    this.base = base; this._W = W; this._H = H;
    const k = base*this.z;
    this.ox = W/2 - cx*k; this.oy = H/2 - cy*k;
    this.apply(k, true);
  }
  // Keep the slide covering the screen: no gap at an edge while zoomed; centred where it fits.
  clamp(k){
    const W = this._W, H = this._H, fw = this.W*k, fh = this.H*k;
    this.ox = fw <= W ? (W - fw)/2 : Math.min(0, Math.max(W - fw, this.ox));
    this.oy = fh <= H ? (H - fh)/2 : Math.min(0, Math.max(H - fh, this.oy));
  }
  apply(k, now){
    const scaled = Math.abs(k - this.k) > 1e-6 || now;
    this.k = k; this.clamp(k);
    const fw = this.W*k, fh = this.H*k;
    Object.assign(this.frame.style, { width:fw+'px', height:fh+'px', left:this.ox+'px', top:this.oy+'px' });
    this.scale.style.transform = `scale(${k})`;
    this.frame.style.setProperty('--k', k);
    const zoomed = this.z > 1.001;
    this.host.classList.toggle('zoomed', zoomed);
    this.pill.hidden = !zoomed;
    if(zoomed) this.pill.innerHTML = `${icon('zoomOut')}<span>${Math.round(this.z*100)}%</span>`;
    if(scaled){
      // During a pinch, rebuild overlays once per frame at most.
      if(now){ cancelAnimationFrame(this._raf); this._raf = null; this._fitDue = false; if(this.onfit) this.onfit(); }
      else { this._fitDue = true; this.queue(); }
    } else { this._moveDue = true; this.queue(); }
  }
  queue(){
    if(this._raf) return;
    this._raf = requestAnimationFrame(()=>{
      this._raf = null;
      if(this._fitDue){ this._fitDue = this._moveDue = false; if(this.onfit) this.onfit(); }
      else if(this._moveDue){ this._moveDue = false; if(this.onmove) this.onmove(); }
    });
  }
  // The part of the slide that's on screen, in frame pixels.
  visible(){
    const W = this._W || 0, H = this._H || 0, fw = this.W*this.k, fh = this.H*this.k;
    const x = Math.max(0, -this.ox), y = Math.max(0, -this.oy);
    return { x, y, w:Math.max(0, Math.min(fw, W - this.ox) - x), h:Math.max(0, Math.min(fh, H - this.oy) - y) };
  }
  zoomAt(z, clientX, clientY){
    if(!this.W) return;
    z = Math.min(ZOOM_MAX, Math.max(1, z));
    const r = this.host.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top;
    const sx = (px - this.ox)/this.k, sy = (py - this.oy)/this.k;
    this.z = z; const k = this.base*z;
    this.ox = px - sx*k; this.oy = py - sy*k;
    this.apply(k);
  }
  panBy(dx, dy){ if(this.z <= 1.001) return; this.ox += dx; this.oy += dy; this.apply(this.k); }
  resetZoom(){ if(this.z===1) return; this.z = 1; this.apply(this.base, true); }
  gestures(){
    const host = this.host, touches = new Map(); // touch pointers down on the stage: id -> {x, y}
    let pinch = null;          // { d, mx, my } last distance and midpoint
    let pan = null;            // one-finger / mouse pan: { id, x, y, live }
    const owned = new Set();   // pointers taken over by a gesture: hidden from the page until lifted
    let noClickUntil = 0, penDown = null;
    const swallow = e=>{ e.stopPropagation(); if(e.cancelable) e.preventDefault(); };
    const inHost = e=>host.isConnected && host.contains(e.target);
    const reset = ()=>{ touches.clear(); owned.clear(); pinch = null; pan = null; penDown = null; };
    const lost = ()=>{ if(document.visibilityState==='hidden' || !document.hasFocus()) reset(); };
    const two = ()=>{ const [a, b] = [...touches.values()]; return { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, mx:(a.x + b.x)/2, my:(a.y + b.y)/2 }; };
    const down = e=>{
      if(!inHost(e)) return;
      if(e.pointerType==='pen') penDown = e.pointerId;
      // Palm rejection: no pinch while the stylus is writing, and big contacts (a palm) don't count as fingers.
      if(e.pointerType==='touch' && (penDown!=null || e.width > 60 || e.height > 60)) return;
      // v1.75: the only finger on the board (isPrimary) means none are really down. Clear any whose
      // lift was missed, so a ghost finger can't turn the next single touch into a pinch.
      if(e.pointerType==='touch' && e.isPrimary) reset();
      if(e.pointerType==='touch'){
        touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if(touches.size===2){
          // Second finger: this is a pinch. Take both fingers off whatever the first one started.
          for(const id of touches.keys()) owned.add(id);
          if(pan){ owned.add(pan.id); pan = null; }
          pinch = two();
          if(this.opts.onGesture) this.opts.onGesture();
          swallow(e); return;
        }
        if(touches.size > 2){ owned.add(e.pointerId); swallow(e); return; }
      }
      if(owned.size) return;
      // One finger / mouse: may become a pan once it moves (not on the zoom pill or a playing video).
      if(this.z > 1.001 && this.opts.onePan && this.opts.onePan() && (e.pointerType==='touch' || e.button===0)
        && !e.target.closest('.zoom-pill, video, iframe, .video-pop')) pan = { id:e.pointerId, x:e.clientX, y:e.clientY, live:false };
    };
    const move = e=>{
      if(touches.has(e.pointerId)) touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
      if(pinch && touches.size>=2 && owned.has(e.pointerId)){
        const n = two();
        this.zoomAt(this.z * n.d/pinch.d, n.mx, n.my);
        this.panBy(n.mx - pinch.mx, n.my - pinch.my);
        pinch = n; swallow(e); return;
      }
      if(pan && e.pointerId===pan.id){
        if(!pan.live && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 8) return;
        if(!pan.live){ pan.live = true; owned.add(pan.id); }
        this.panBy(e.clientX - pan.x, e.clientY - pan.y);
        pan.x = e.clientX; pan.y = e.clientY; swallow(e); return;
      }
      // A finger left over from a pinch: keeps panning where one-finger pan is allowed.
      if(owned.has(e.pointerId)){
        const t = touches.get(e.pointerId);
        if(t && touches.size===1 && this.opts.onePan && this.opts.onePan()){
          if(t.px!=null) this.panBy(e.clientX - t.px, e.clientY - t.py);
          t.px = e.clientX; t.py = e.clientY;
        }
        swallow(e);
      }
    };
    const up = e=>{
      if(e.pointerId===penDown) penDown = null;
      touches.delete(e.pointerId);
      if(touches.size < 2 && pinch){
        pinch = null; noClickUntil = Date.now() + 350;
        if(this.z < 1.05) this.resetZoom();
        for(const t of touches.values()){ t.px = null; }
      }
      if(pan && e.pointerId===pan.id){ if(pan.live) noClickUntil = Date.now() + 350; pan = null; }
      if(owned.delete(e.pointerId)) swallow(e);
    };
    const click = e=>{ if(inHost(e) && Date.now() < noClickUntil && !e.target.closest('.zoom-pill')) swallow(e); };
    const wheel = e=>{
      if(!this.W) return;
      if(e.ctrlKey){ e.preventDefault(); this.zoomAt(this.z * Math.exp(-e.deltaY*0.0025), e.clientX, e.clientY); return; }
      if(this.z > 1.001){ e.preventDefault(); this.panBy(-e.deltaX, -e.deltaY); }
    };
    // Window, capture phase: runs before the pen, the editor's drags, etc.
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    host.addEventListener('wheel', wheel, { passive:false });
    this._unlisten = ()=>{
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
    };
  }
  destroy(){ this.ro.disconnect(); if(this._unlisten) this._unlisten(); cancelAnimationFrame(this._raf); }
}

/* ---------------- ink (pen annotations) ---------------- */
/* v1.61: two canvases. The highlighter has its own, under the pen's, blended with multiply
   (styles.css .stage-ink-hl): like a real highlighter, writing under it stays crisp and pen
   ink stays on top. Each canvas keeps its finished strokes on an off-screen copy, so while
   drawing only the stroke in progress is repainted (it used to redraw every stroke on the
   slide each frame). The pen canvas asks Edge for low-latency drawing, and Edge's predicted
   pointer positions are drawn just ahead of the pen for one frame (never saved).
   Each of these can be turned off in Settings → Beta (BETA, beta()); the choices are read when a lesson opens. */
const PALM_MS = 3000; // touches ignored for this long after the stylus was last on the board
class Ink {
  constructor(stage, onChange){
    this.stage = stage; this.onChange = onChange; this.strokes = [];
    this.h = el('canvas','stage-ink stage-ink-hl'); stage.frame.insertBefore(this.h, stage.ui); // highlighter
    this.c = el('canvas','stage-ink'); stage.frame.insertBefore(this.c, stage.ui);             // pen + marker; takes the pointer
    // Settings → Beta, as they were when the lesson opened.
    const o = this.opt = { fast:beta('fast'), lowlat:beta('lowlat'), hl:beta('hlblend'), eraser:beta('eraser'), nocursor:beta('nocursor') };
    if(!o.hl) this.h.style.display = 'none'; // Beta off: highlighter drawn see-through on the pen canvas, as before
    this.ctx = this.c.getContext('2d', o.lowlat ? { desynchronized:true } : undefined);
    this.hctx = this.h.getContext('2d');
    this.off = { pen:document.createElement('canvas'), hl:document.createElement('canvas') };
    const d = penDefault(); this.tool = { kind:'pen', color:d.color, w:d.w };
    this.enabled = false; this.active = null; this.cur = null; this.pred = null; this.lastE = null; this.penAt = 0;
    this.c.style.pointerEvents = 'none';
    this.c.addEventListener('pointerdown', e=>this.down(e));
    this.c.addEventListener('pointermove', e=>this.move(e));
    this.c.addEventListener('pointerup', e=>this.up(e));
    this.c.addEventListener('pointercancel', e=>this.up(e));
    // v1.75: if the browser drops the pointer without a pointerup (focus moves to a tool box, the pupil
    // window or another app; the board misses the lift), end the stroke anyway. Before, this.active stayed
    // set and every later touch was ignored until the page was refreshed.
    this.c.addEventListener('lostpointercapture', e=>this.up(e));
    const drop = ()=>{
      if(!this.c.isConnected){ window.removeEventListener('blur', drop); document.removeEventListener('visibilitychange', drop); return; }
      if(document.visibilityState==='hidden' || !document.hasFocus()) this.release();
    };
    window.addEventListener('blur', drop);
    document.addEventListener('visibilitychange', drop);
  }
  // End whatever stroke is in progress as if the pointer had lifted (kept, not thrown away).
  release(){ if(this.active!=null) this.up({ pointerId:this.active }); }
  // No cursor while a pen / highlighter / eraser is in hand: only the line shows (the console never draws).
  setEnabled(v){ if(!v) this.release(); this.enabled = v; this.c.style.pointerEvents = v ? 'auto' : 'none'; this.c.style.cursor = v ? (this.opt.nocursor ? 'none' : 'crosshair') : ''; }
  load(strokes){ this.strokes = strokes; this.resize(); }
  // The canvases only cover the part of the slide that's on screen, so zooming in
  // doesn't need giant canvases. vis = that part, in frame pixels.
  resize(){
    const dpr = devicePixelRatio || 1, v = this.stage.visible();
    this.vis = v;
    const cw = Math.max(1, Math.round(v.w*dpr)), ch = Math.max(1, Math.round(v.h*dpr));
    for(const cv of [this.c, this.h, this.off.pen, this.off.hl]){
      if(cv.style) Object.assign(cv.style, { left:v.x+'px', top:v.y+'px', width:v.w+'px', height:v.h+'px' });
      if(cv.width!==cw || cv.height!==ch){ cv.width = cw; cv.height = ch; }
    }
    this.redraw();
  }
  // A pinch started: drop the stroke being drawn.
  cancel(){
    if(this.active==null) return;
    try{ this.c.releasePointerCapture(this.active); }catch(_){}
    this.active = null; this.cur = null; this.pred = null;
    if(this.erasing){ this.erasing = false; this.onChange(); }
    this.redraw();
  }
  layer(s){ return s.kind==='hl' && this.opt.hl ? 'hl' : 'pen'; }
  // Repaint after the stroke in progress changed: just that stroke, or (Beta 'fast' off) everything.
  paint(L){ if(this.opt.fast) this.show(L); else this.redraw(); }
  // Slide units → this canvas's pixels.
  xf(ctx){ const dpr = devicePixelRatio || 1, k = this.stage.k * dpr, v = this.vis || { x:0, y:0 }; ctx.setTransform(k,0,0,k,-v.x*dpr,-v.y*dpr); }
  // Everything again: rebuild both off-screen copies from this.strokes, then show them.
  redraw(){
    for(const L of ['hl','pen']){
      const cv = this.off[L], o = cv.getContext('2d');
      o.setTransform(1,0,0,1,0,0); o.clearRect(0,0,cv.width,cv.height);
      this.xf(o);
      for(const s of this.strokes) if(this.layer(s)===L) this.draw(o, s);
    }
    this.show('hl'); this.show('pen');
  }
  // One canvas on screen: its finished strokes (copied from off-screen) plus the stroke in progress if it's on this layer.
  show(L){
    const cv = L==='hl' ? this.h : this.c, ctx = L==='hl' ? this.hctx : this.ctx;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); ctx.globalAlpha = 1;
    ctx.drawImage(this.off[L], 0, 0);
    if(this.cur && this.layer(this.cur)===L){ this.xf(ctx); this.draw(ctx, this.cur, this.pred); }
  }
  // The stroke in progress changed (the console's copy of the panel's): repaint just that.
  live(cur){ this.cur = cur || null; this.pred = null; if(this.opt.fast){ this.show('hl'); this.show('pen'); } else this.redraw(); }
  // Highlighter strokes are drawn solid; their canvas's opacity and multiply blend make them see-through,
  // so overlapping highlighter strokes don't go darker. (Beta 'hlblend' off: 38% on the pen canvas, as before.)
  draw(ctx, s, extra){
    const p = extra && extra.length ? s.pts.concat(extra) : s.pts;
    ctx.globalAlpha = s.kind==='hl' && !this.opt.hl ? 0.38 : 1;
    ctx.strokeStyle = ctx.fillStyle = s.color; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if(p.length <= 2){ ctx.beginPath(); ctx.arc(p[0], p[1], s.w/2, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; return; }
    // v1.79: straight through every recorded point. The midpoint smoothing (quadratic curves) rounded off
    // corners and small details, so handwriting didn't come out as written. Points arrive at the pen's own
    // rate (getCoalescedEvents), so the segments are too short to look angular.
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for(let j=2;j<p.length;j+=2) ctx.lineTo(p[j], p[j+1]);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  pt(e){ const r = this.stage.frame.getBoundingClientRect(); const k = this.stage.k; return [ Math.round((e.clientX-r.left)/k*10)/10, Math.round((e.clientY-r.top)/k*10)/10 ]; }
  down(e){
    if(!this.enabled) return;
    if(e.pointerType==='pen') this.penAt = Date.now();
    // Palm rejection: touches are ignored while the stylus is in use (until 3 seconds after it was last on the board).
    if(e.pointerType==='touch' && this.penAt && Date.now() - this.penAt < PALM_MS) return;
    if(this.active!=null){
      // A stroke is still marked as in progress. If no other pointer can really be down (the same pointer
      // again, a mouse / stylus, or the only finger on the board), its lift was lost: finish it and carry on.
      if(e.pointerId===this.active || e.pointerType!=='touch' || e.isPrimary) this.release();
      else return; // a second finger during a finger stroke
    }
    e.preventDefault();
    this.active = e.pointerId;
    try{ this.c.setPointerCapture(e.pointerId); }catch(_){}
    const p = this.pt(e);
    if(this.tool.kind==='eraser'){ this.erasing = false; this.lastE = p; if(this.erase(p)) this.redraw(); return; }
    // Widths are fixed relative to the unzoomed slide: zoomed in, the stroke is finer on the slide.
    const k = this.tool.kind, sw = k==='hl' ? 22 : k==='marker' ? MARKER_W : this.tool.w;
    this.cur = { kind:k, color:k==='marker' ? MARKER_COLOR : this.tool.color, w:Math.round(sw/this.stage.z*100)/100, pts:p };
    this.pred = null;
    this.paint(this.layer(this.cur));
    if(this.onLive) this.onLive();
  }
  move(e){
    if(e.pointerType==='pen') this.penAt = Date.now();
    if(e.pointerId!==this.active) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if(this.tool.kind==='eraser'){
      // Steps of at most the eraser's radius between samples, so a quick swipe can't jump over a stroke
      // (Beta 'eraser' off: only where the samples are, as before).
      const step = this.opt.eraser ? 10/this.stage.z : Infinity;
      let hit = false; // v1.77: repaint once for the whole move, not once per stroke erased
      for(const ev of (evs.length ? evs : [e])){
        const p = this.pt(ev), a = this.lastE || p, d = Math.hypot(p[0]-a[0], p[1]-a[1]), n = Math.max(1, Math.ceil(d/step));
        for(let j=1;j<=n;j++) if(this.erase([a[0] + (p[0]-a[0])*j/n, a[1] + (p[1]-a[1])*j/n])) hit = true;
        this.lastE = p;
      }
      if(hit) this.redraw();
      return;
    }
    if(!this.cur) return;
    for(const ev of (evs.length ? evs : [e])){
      const p = this.pt(ev);
      const a = this.cur.pts, lx = a[a.length-2], ly = a[a.length-1];
      if(Math.hypot(p[0]-lx, p[1]-ly) >= 0.8/this.stage.z) a.push(p[0], p[1]);
    }
    // Where Edge expects the pen to be next: drawn for this frame only, so the line keeps up with the nib.
    this.pred = null;
    if(this.opt.lowlat && e.getPredictedEvents){
      const pe = e.getPredictedEvents();
      if(pe && pe.length){ const q = []; for(const ev of pe){ const p = this.pt(ev); q.push(p[0], p[1]); } this.pred = q; }
    }
    // pointermove already arrives once per frame, so paint straight away rather than waiting a frame.
    this.paint(this.layer(this.cur));
    if(this.onLive) this.onLive();
  }
  up(e){
    if(e.pointerType==='pen') this.penAt = Date.now();
    if(e.pointerId!==this.active) return;
    this.active = null; this.lastE = null;
    let changed = false;
    if(this.cur){
      // Add the finished stroke to its layer's off-screen copy (no full redraw).
      const s = this.cur, L = this.layer(s), o = this.off[L].getContext('2d');
      this.strokes.push(s); this.cur = null; this.pred = null;
      if(this.opt.fast){ this.xf(o); this.draw(o, s); this.show(L); } else this.redraw();
      changed = true;
    }
    if(this.erasing){ this.erasing = false; changed = true; }
    if(changed) this.onChange();
  }
  // Whole strokes: any stroke whose line (not just its points) passes within the eraser's reach.
  // True if anything went (the caller repaints).
  erase([x,y]){
    const r = 14/this.stage.z;
    const before = this.strokes.length;
    for(let j=this.strokes.length-1;j>=0;j--){
      const s = this.strokes[j], p = s.pts, lim = r + s.w/2;
      if(Ink.near(p, x, y, lim, this.opt.eraser)) this.strokes.splice(j,1);
    }
    if(this.strokes.length!==before){ this.erasing = true; return true; }
    return false;
  }
  static near(p, x, y, lim, lines){
    if(p.length <= 2 || !lines){ for(let q=0;q<p.length;q+=2) if(Math.hypot(p[q]-x, p[q+1]-y) < lim) return true; return false; }
    for(let q=0;q<p.length-2;q+=2){
      const ax = p[q], ay = p[q+1], dx = p[q+2]-ax, dy = p[q+3]-ay, l2 = dx*dx + dy*dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x-ax)*dx + (y-ay)*dy)/l2)) : 0;
      if(Math.hypot(ax + t*dx - x, ay + t*dy - y) < lim) return true;
    }
    return false;
  }
  undo(){ if(this.strokes.pop()){ this.redraw(); this.onChange(); } }
  clear(){ if(this.strokes.length){ this.strokes.length = 0; this.redraw(); this.onChange(); } }
}

/* =====================================================================
   Views
   ===================================================================== */
let view = { name:'boot' };
let selDate = defaultDate();
const app = $('#app');
function leaveFullscreen(){ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }
window.addEventListener('dragover', e=>e.preventDefault());
window.addEventListener('drop', e=>e.preventDefault());

/* ---------- setup / reconnect ---------- */
function renderSplash(kind){
  view = { name:'splash' };
  document.body.classList.remove('presenting');
  if(kind==='unsupported'){
    app.innerHTML = `<div class="splash"><div class="splash-card"><h1>Open this in Edge</h1><p>This browser can't save to your OneDrive folder. Open <span class="path">index.html</span> in Microsoft Edge or Google Chrome.</p></div></div>`;
    return;
  }
  const reconnect = kind==='reconnect';
  app.innerHTML = `<div class="splash"><div class="splash-card">
    <h1>${reconnect ? 'Welcome back' : 'Slideshow Viewer'}</h1>
    ${reconnect
      ? `<p>Edge needs your permission again to open <span class="path">${esc(store.name)}</span>. It forgets this when the browser is closed.</p>`
      : `<p>Choose a folder on this computer to keep your data in. Lesson decks, hide settings and annotations are saved there. If the folder is in OneDrive or similar, your other computers can use the same data.</p>`}
    <div class="actions">
      <button class="btn primary lg" data-a="go">${reconnect ? 'Reconnect' : 'Choose folder'}</button>
      ${reconnect ? '<button class="btn ghost" data-a="pick">Use a different folder</button>' : ''}
    </div>
    <div class="note">Tip: when Edge asks, choose “Allow on every visit” if it's offered, so you skip this step next time.</div>
  </div></div>`;
  const go = async (pick)=>{
    try{
      if(pick) await store.pick();
      else if(!(await store.reconnect())) return;
      if(Planner.needsPerm) { try{ await Planner.regrant(); }catch(e){} }
      await loadAndGo();
    }catch(e){ if(e.name!=='AbortError') toast("Couldn't open that folder: " + e.message, true); }
  };
  app.querySelector('[data-a=go]').onclick = ()=>go(!reconnect);
  const p = app.querySelector('[data-a=pick]'); if(p) p.onclick = ()=>go(true);
}
async function loadAndGo(){
  showLoading('Opening…');
  try{
    if(window.SVStarter && store.dir){ try{ await SVStarter.seed(store.dir); }catch(e){ console.warn(e); } } // starter Sentence Builders and Waypoints
    const r = await store.readData();
    data = normalise(r.data);
    Planner.applyManual(data.timetable);
    if(!r.data) await saveNow(); else afterRead();
  } finally { hideLoading(); }
  renderDashboard();
  await resumeRefresh(); // v1.76: just refreshed from the presenter
}

/* ---------- dashboard ---------- */
const fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = '.pptx,.pdf'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
let fileTarget = null;
fileInput.onchange = ()=>{ const f = fileInput.files[0]; fileInput.value = ''; if(f && fileTarget) attachFile(f, fileTarget); };
function chooseFile(meta, accept){ fileTarget = meta; fileInput.accept = accept || '.pptx,.pdf'; fileInput.click(); }

function dayRows(d){
  const ds = iso(d);
  const slots = Planner.slotsFor(d);
  const rows = [];
  for(const s of slots){
    const kind = slotKind(s.label);
    const per = periodLabel(s, slots);
    const meta = { id:lessonId(ds, s.id), date:ds, slotId:s.id, label:s.label, start:s.start, end:s.end, period:per };
    if(seriesFor(meta)) ensureLesson(meta); // v1.79: a Tuesday Form lesson shows its shared deck even before it has a record
    rows.push({ kind, meta });
  }
  const known = new Set(rows.map(r=>r.meta.id));
  for(const x of (data.extras[ds] || [])){ const id = lessonId(ds, x.id); known.add(id); rows.push({ kind:'lesson', extra:true, meta:{ id, date:ds, slotId:x.id, label:x.label, start:'', end:'', period:'Extra' } }); }
  // Lessons whose timetable slot has gone (timetable edited) — still show them.
  for(const l of Object.values(data.lessons)) if(l.date===ds && !known.has(l.id)) rows.push({ kind:'lesson', orphan:true, meta:{ id:l.id, date:ds, slotId:l.slotId, label:l.label || 'Lesson', start:l.start, end:l.end, period:l.period || '—' } });
  return rows;
}
function deckCountFor(d){ const ds = iso(d); return Object.values(data.lessons).filter(l=>l.date===ds && l.mode).length; }

/* v1.84 dashboard redesign (2026-10-24, spec: dashboard-redesign-spec.md).
   One line per lesson: period + time, class code pill (the Planner's year colours), title, Edit / Present / ⋯.
   A preview panel on the right shows the selected lesson's slides (click a row to pick it). */
// The Planner's year colours (MFL Planner app.js, YEAR_PILL): pale tint behind, dark ink of the same hue.
const YEAR_PILL = { 7:'y7', 8:'y8', 9:'y9', 10:'y10', 11:'y11' };
function pillHTML(label, extra){
  const raw = String(label || '');
  const shared = /\(Shared\)/i.test(raw);
  const text = raw.replace(/\s*\(Shared\)\s*/i, ' ').replace(/[()]/g, '').replace(/\s+/g, ' ').trim() || 'Lesson';
  const y = extra ? null : yearOf(raw);
  const cls = 'pill ' + ((y!=null && YEAR_PILL[y]) || 'yn') + (shared ? ' shared' : '');
  return `<span class="${cls}" title="${esc(text + (shared ? ' · shared class' : ''))}">${esc(text)}</span>`;
}
// The row being previewed ({ id, pos }); kept while the dashboard redraws, dropped when its day isn't shown.
let preview = null;
// The lesson whose Present button is filled: the one on now, else the next one today with a deck.
function primaryRowId(rows){
  if(iso(selDate)!==iso(today())) return null;
  const nowM = new Date().getHours()*60 + new Date().getMinutes();
  const cand = rows.filter(r=>r.kind!=='slim' && r.meta.start && data.lessons[r.meta.id] && data.lessons[r.meta.id].mode);
  const cur = cand.find(r=>toMin(r.meta.start)<=nowM && nowM<toMin(r.meta.end));
  const nxt = cand.find(r=>toMin(r.meta.start)>nowM);
  return (cur || nxt || {}).meta ? (cur || nxt).meta.id : null;
}
function libOpen(){ return !!(window.SVLibrary && SVLibrary.isOpen && SVLibrary.isOpen()); }

/* ---------- v1.85 visual refresh (2026-10-24, spec: claude/visual-refresh-spec.md) ----------
   One header on every page (dashboard, Library, Printing Centre, Points, Settings): the app's name, labelled
   buttons with the same icons as before (badges as before), the save status and New lesson. Under it, the
   day strip (each day with a status line) on the left and the week arrows on the right.
   Clicks on [data-nav] are routed here (capture phase), whichever page or overlay drew the header. */
function appHeader(active){
  const canLib = !!(window.SVLibrary && SVLibrary.canCreate());
  const pcN = window.SVPrintCentre && SVPrintCentre.todayCount ? SVPrintCentre.todayCount() : 0;
  const ap = window.SVPoints && SVPoints.apStatus ? SVPoints.apStatus() : { n:0, urgent:false };
  const badge = (n, cls)=>n ? `<span class="hn-badge${cls ? ' ' + cls : ''}">${n > 99 ? '99+' : n}</span>` : '';
  const item = (k, label, ic, opt)=>{ opt = opt || {}; const on = k===active;
    return `<button class="hn${on ? ' on' : ''}${opt.cls ? ' ' + opt.cls : ''}" data-nav="${k}"${on ? ' aria-current="page"' : ''} title="${esc(opt.tip || label)}">${ic}<span>${label}</span>${opt.badge || ''}</button>`; };
  const apTip = !ap.n ? 'Achievement Points: all logged' : `Achievement Points: ${ap.n} lesson${ap.n>1 ? 's' : ''} not logged${ap.urgent ? ', some overdue' : ''}`;
  return `<header class="apphead">
    <h1 class="ah-name">Slideshow Viewer</h1>
    <nav class="ah-nav" aria-label="Pages">
      ${item('dash', 'Today', lucideSvg('calendar', 'ico'), { tip:'Your lessons' })}
      ${canLib ? item('library', 'Library', lucideSvg('book-open', 'ico'), { tip:'Lesson Library' }) : ''}
      ${window.SVPrintCentre ? item('printing', 'Printing', icon('print'), { badge:badge(pcN), tip:pcN ? `Printing Centre: ${pcN} not printed yet today` : 'Printing Centre' }) : ''}
      ${window.SVPoints ? item('points', 'Points', icon('star'), { badge:badge(ap.n, ap.urgent ? 'urgent' : ''), cls:ap.urgent ? 'urgent' : '', tip:apTip }) : ''}
      ${item('settings', 'Settings', icon('settings'))}
    </nav>
    <span class="grow"></span>
    <span class="status-pill"></span>
    <button class="icon-btn ah-theme" data-theme-toggle aria-pressed="${SVTheme.now()==='dark'}" title="${SVTheme.now()==='dark' ? 'Switch to light mode' : 'Switch to dark mode'}" aria-label="Light or dark mode">${icon(SVTheme.now()==='dark' ? 'sun' : 'moon')}</button>
    ${canLib ? `<button class="btn primary ah-new" data-nav="create" title="Create a lesson from the template">${icon('plus')}New lesson</button>` : ''}
  </header>`;
}
// days: [{ ds, label, sub, tone:'warn'|'ok'|'', off, tip, dot }]; attr(ds): the button's data attributes.
function dayStrip(days, selIso, attr){
  const tIso = iso(today());
  return `<div class="dstrip" role="group" aria-label="Days">${days.map(d=>`<button class="dsd${d.ds===selIso ? ' on' : ''}${d.ds===tIso ? ' today' : ''}${d.off ? ' off' : ''}" ${attr(d.ds)}${d.ds===tIso ? ' aria-current="date"' : ''}${d.tip ? ` title="${esc(d.tip)}"` : ''}><b>${esc(d.label)}${d.ds===tIso ? '<i>Today</i>' : ''}</b><small class="${d.tone || ''}">${esc(d.sub || '')}</small>${d.dot ? '<span class="dot" aria-hidden="true"></span>' : ''}</button>`).join('')}</div>`;
}
function weekNav(label, prevAttr, nextAttr, prevOff, nextOff){
  return `<div class="wnav"><button class="icon-btn" ${prevAttr}${prevOff ? ' disabled' : ''} title="Previous week" aria-label="Previous week">${icon('left')}</button><span class="wnav-l">${esc(label)}</span><button class="icon-btn" ${nextAttr}${nextOff ? ' disabled' : ''} title="Next week" aria-label="Next week">${icon('right')}</button></div>`;
}
const dayShort = d=>`${DAY_NAMES[d.getDay()].slice(0,3)} ${d.getDate()}`;
function navTo(k){
  if(!data || PUPIL) return;
  if(window.SVPrintCentre && SVPrintCentre.state && k!=='printing') SVPrintCentre.close(true);
  if(window.SVLibrary && SVLibrary.fullOpen && SVLibrary.fullOpen() && k!=='library') SVLibrary.closeFull(true);
  if(k==='dash'){ view = { name:'dash' }; return renderDashboard(); }
  if(k==='library'){ if(window.SVLibrary) SVLibrary.openFull(); return; }
  if(k==='printing'){ if(window.SVPrintCentre) SVPrintCentre.open(); return; }
  if(k==='points'){ if(window.SVPoints) SVPoints.openDay(); return; }
  if(k==='settings') return openSettings();
  if(k==='create'){ if(window.SVLibrary) SVLibrary.openCreate(null); }
}
document.addEventListener('click', e=>{
  const tg = e.target.closest && e.target.closest('[data-theme-toggle]');
  if(tg){ SVTheme.set(SVTheme.now()==='dark' ? 'light' : 'dark'); return; }
  const b = e.target.closest && e.target.closest('[data-nav]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  navTo(b.dataset.nav);
}, true);

function renderDashboard(){
  if(PUPIL && window.SVDual && SVDual.idleInstead()) return;
  if(pruneOldInk()) saveSoon(); // v1.78: pen marks older than 7 days
  view = { name:'dash', tsig:dashTimeSig(), tday:iso(defaultDate()) };
  document.body.classList.remove('presenting');
  leaveFullscreen();
  const t = today(), tIso = iso(t);
  const thisMon = mondayOf(t), lastMon = lastDashMonday();
  const mon = mondayOf(selDate);
  const days = [0,1,2,3,4].map(n=>addDays(mon, n));
  const wkAhead = Math.round((mon - thisMon) / (7*864e5));
  const wkLabel = (wkAhead===0 ? 'This week' : wkAhead===1 ? 'Next week' : wkAhead>1 ? `In ${wkAhead} weeks` : 'Week of') + ` · ${mon.getDate()} ${MON_NAMES[mon.getMonth()]}`;
  const banners = [];
  if(!Planner.data){
    if(Planner.needsPerm) banners.push(`<div class="banner"><span class="grow">Edge needs permission to read your planner timetable (<b>${esc(Planner.fileName)}</b>).</span><button class="btn sm primary" data-a="planner-regrant">Allow</button></div>`);
    else banners.push(`<div class="banner"><span class="grow">Type in your class codes to show your timetable here.</span><button class="btn sm primary" data-a="planner-link">Set up timetable</button></div>`);
  } else if(Planner.needsPerm){
    banners.push(`<div class="banner"><span class="grow">Using this PC's copy of your planner timetable. Allow access to <b>${esc(Planner.fileName)}</b> for the synced version.</span><button class="btn sm" data-a="planner-regrant">Allow</button></div>`);
  }
  if(window.SVDual){ const b = SVDual.banner(); if(b) banners.push(b); }
  const hol = Planner.holiday(selDate);
  const rows = hol ? [] : dayRows(selDate);
  const curRowId = (()=>{ if(iso(selDate)!==tIso) return null; const nowM = new Date().getHours()*60 + new Date().getMinutes(); const r = rows.find(r=>r.meta.start && toMin(r.meta.start)<=nowM && nowM<toMin(r.meta.end)); return r ? r.meta.id : null; })();
  const primId = primaryRowId(rows);
  // Keep the preview only while its lesson is on the day shown and still has a deck.
  if(preview && !rows.some(r=>r.meta.id===preview.id && data.lessons[r.meta.id] && data.lessons[r.meta.id].mode)) preview = null;
  const showPv = !libOpen();
  // v1.85: the preview starts on the lesson on now (or next), else the day's first lesson with a deck.
  if(!preview){
    const cand = rows.filter(r=>r.kind!=='slim' && data.lessons[r.meta.id] && data.lessons[r.meta.id].mode);
    const pick = (primId && cand.find(r=>r.meta.id===primId)) || cand[0];
    if(pick) preview = { id:pick.meta.id, pos:0 };
  }
  const dayInfo = d=>{
    const ds = iso(d), h = Planner.holiday(d);
    const apn = window.SVPoints && SVPoints.unloggedCount ? SVPoints.unloggedCount(ds) : 0; // lessons with achievement points not logged (classes.js)
    if(h) return { ds, label:dayShort(d), sub:h.label, off:true, tip:h.label };
    const ls = Planner.slotsFor(d).filter(s=>slotKind(s.label)==='lesson');
    const missing = ls.filter(s=>{ const l = data.lessons[lessonId(ds, s.id)]; return !(l && l.mode); }).length;
    const warn = missing && ds>=tIso;
    const sub = !Planner.data ? '' : !ls.length ? 'No lessons' : warn ? `${missing} deck${missing>1 ? 's' : ''} missing` : `${ls.length} lesson${ls.length>1 ? 's' : ''}`;
    return { ds, label:dayShort(d), sub, tone:warn ? 'warn' : '', dot:apn>0, tip:apn ? `${apn} lesson${apn>1?'s':''} with achievement points to log` : '' };
  };

  app.innerHTML = `${appHeader('dash')}<div class="dash">
    ${banners.join('')}
    <nav class="weekbar" aria-label="Week and day">
      ${dayStrip(days.map(dayInfo), iso(selDate), ds=>`data-a="day" data-d="${ds}"`)}
      <span class="wb-r">${weekNav(wkLabel, 'data-a="wk-prev"', 'data-a="wk-next"', +mon<=+thisMon, +mon>=+lastMon)}${window.SVLibrary && SVLibrary.canCreate() ? `<button class="btn lb-quick${libOpen() ? ' on' : ''}" data-a="library" aria-pressed="${libOpen()}" title="Show the Library beside your lessons, to drag decks onto them">${lucideSvg('book-open', 'ico')}${libOpen() ? 'Hide library' : 'Quick library'}</button>` : ''}</span>
    </nav>
    <div class="dash-cols${showPv ? '' : ' no-pv'}">
      <div class="dash-list">
        ${hol ? `<div class="empty">No school: ${esc(hol.label)}</div>` : ''}
        <div class="periods">${rows.map(r=>rowHTML(r, curRowId, primId)).join('')}</div>
        ${!hol && !rows.length && Planner.data ? '<div class="empty">Nothing timetabled.</div>' : ''}
        ${hol ? '' : `<button class="btn ghost add-extra" data-a="add-extra">${icon('plus')}Add an extra presentation</button>`}
      </div>
      ${showPv ? `<aside class="dpv" aria-label="Slide preview"></aside>` : ''}
    </div>
  </div>`;
  updatePill();
  drawPreview();
  if(window.SVLibrary) SVLibrary.mountPanel(); // Lesson Library side panel (library.js)
}
function rowHTML(r, curRowId, primId){
  const m = r.meta, l = data.lessons[m.id];
  const time = m.start ? `${esc(m.start)}–${esc(m.end)}` : '';
  if(r.kind==='slim') return `<div class="dgap"><span class="dgap-n">${esc(m.label)}</span><span class="dgap-t">${time}</span><span class="rule"></span></div>`;
  const metaAttr = esc(JSON.stringify(m));
  const has = !!(l && l.mode);
  const cls = ['dr', r.kind==='muted' ? 'muted' : '', m.id===curRowId ? 'now' : '', has && preview && preview.id===m.id ? 'sel' : '', has ? '' : 'nodeck'].filter(Boolean).join(' ');
  const when = `<span class="pn">${esc(m.period)}</span>${time ? `<span class="tm">${time}</span>` : ''}`;
  const whenHTML = has ? `<button class="dr-when" data-a="pv-pick" data-id="${esc(m.id)}" aria-label="Preview ${esc(m.period + ' ' + m.label)}">${when}</button>` : `<span class="dr-when">${when}</span>`;
  const sc = has ? (l.slideCount && l.slideCount[l.mode]) || 0 : 0, hc = has ? hideCount(l, l.mode) : 0;
  const sub = has ? [sc ? `${sc} slide${sc>1 ? 's' : ''}` : '', hc ? `${hc} reveal${hc>1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : '';
  const note = r.orphan ? '<small>No longer on your timetable</small>' : sub ? `<small>${m.id===curRowId ? 'Now · ' : ''}${sub}</small>` : '';
  const title = has
    ? `<button class="ttl" data-a="rename" data-id="${esc(m.id)}" title="Tap to rename">${esc(lessonTitle(l))}</button>${note}${window.SVLibrary && SVLibrary.pullBadge ? SVLibrary.pullBadge(l) : ''}` // v1.86: Master updated → Pull changes
    : `<span class="dr-none">${r.kind==='muted' ? 'No deck' : 'No deck yet'}</span>${note}`;
  const delX = r.extra ? `<button class="ib" data-a="del-extra" data-meta="${metaAttr}" title="Remove this slot" aria-label="Remove this slot">${icon('x')}</button>` : '';
  const acts = has
    ? `<button class="ib" data-a="edit" data-id="${esc(m.id)}" title="Edit hides and reveals" aria-label="Edit">${icon('edit')}</button><button class="pb${m.id===primId ? ' primary' : ''}" data-a="present" data-id="${esc(m.id)}" title="Present">${icon('play')}<span>Present</span></button><button class="ib" data-a="more" data-meta="${metaAttr}" title="More" aria-label="More">${icon('more')}</button>${delX}`
    : r.kind==='muted' ? `<button class="dr-addlink" data-a="add-menu" data-meta="${metaAttr}" title="Add a deck to this slot">Add a deck</button>${delX}`
    : `<button class="btn dr-add" data-a="add-menu" data-meta="${metaAttr}" title="Add a deck to this lesson">${icon('plus')}Add a deck</button>${delX}`;
  return `<div class="${cls}" data-drop="${metaAttr}"${has ? ` data-sel="${esc(m.id)}"` : ''}>${whenHTML}<span class="dr-pc">${pillHTML(m.label, r.extra)}</span><span class="dr-t">${title}</span><span class="dr-acts">${acts}</span></div>`;
}
// The preview panel: the picked lesson's slides in presenting order (hidden slides skipped), with its hides.
let pvToken = 0;
function drawPreview(){
  const box = $('.dpv'); if(!box) return;
  const l = preview && data.lessons[preview.id];
  if(!l || !l.mode){
    box.innerHTML = `<div class="dpv-empty">Select a lesson to preview</div>`;
    return;
  }
  const time = l.start ? `${esc(l.start)}–${esc(l.end)}` : '';
  box.innerHTML = `<div class="dpv-head">${pillHTML(l.label, !!(data.extras[l.date] || []).find(x=>lessonId(l.date, x.id)===l.id))}<span class="dpv-title">${esc(lessonTitle(l))}</span><span class="dpv-when">${esc([l.period, time].filter(Boolean).join(' · '))}</span></div>
    <div class="dpv-stage" aria-live="polite"></div>
    <div class="dpv-strip" aria-label="Slides"></div>
    <div class="dpv-nav"><button class="icon-btn" data-a="pv-prev" aria-label="Previous slide" disabled>${icon('left')}</button><span class="dpv-n">…</span><button class="icon-btn" data-a="pv-next" aria-label="Next slide" disabled>${icon('right')}</button>
      <span class="grow"></span><button class="btn" data-a="edit" data-id="${esc(l.id)}" title="Edit hides and reveals">${icon('edit')}Edit</button><button class="btn primary" data-a="present" data-id="${esc(l.id)}">${icon('play')}Present</button></div>`;
  showPreviewSlide();
}
async function showPreviewSlide(){
  const box = $('.dpv'); if(!box || !preview) return;
  const l = data.lessons[preview.id]; if(!l || !l.mode) return;
  const tok = ++pvToken;
  const stage = box.querySelector('.dpv-stage');
  try{
    const v = await getDeck(l, l.mode);
    if(tok!==pvToken || !stage.isConnected) return;
    const order = presentOrder(v);
    preview.pos = Math.max(0, Math.min(preview.pos || 0, order.length - 1));
    const k = order[preview.pos];
    const { w, h } = v.size(k);
    const width = Math.max(120, Math.floor(stage.clientWidth));
    stage.style.height = Math.round(width * h / w) + 'px';
    stage.innerHTML = '';
    mountThumb(stage, v, k, width, l, l.mode);
    stage.setAttribute('aria-label', `Slide ${preview.pos + 1} of ${order.length}`);
    box.querySelector('.dpv-n').textContent = `${preview.pos + 1} / ${order.length}`;
    box.querySelector('[data-a=pv-prev]').disabled = preview.pos<=0;
    box.querySelector('[data-a=pv-next]').disabled = preview.pos>=order.length - 1;
    drawPreviewStrip(box, v, order, l);
  }catch(e){
    if(tok!==pvToken || !stage.isConnected) return;
    stage.innerHTML = `<div class="dpv-err">Couldn't open this deck: ${esc(e.message)}</div>`;
  }
}
// v1.85: a row of up to 6 slide thumbnails under the preview (the slide shown and its neighbours); click one to show it.
const pvThumbs = new Map();
function drawPreviewStrip(box, v, order, l){
  const strip = box.querySelector('.dpv-strip'); if(!strip) return;
  const N = Math.min(6, order.length);
  if(N<2){ strip.innerHTML = ''; strip.hidden = true; return; }
  strip.hidden = false;
  const start = Math.max(0, Math.min(preview.pos - 2, order.length - N));
  const gap = 8, w = Math.max(40, Math.floor((strip.clientWidth - gap*5) / 6));
  if(pvThumbs.size > 120) pvThumbs.clear();
  strip.innerHTML = '';
  for(let i = start; i < start + N; i++){
    const b = el('button', 'dpv-th' + (i===preview.pos ? ' on' : ''));
    b.dataset.a = 'pv-go'; b.dataset.p = i; b.title = `Slide ${i + 1}`; b.style.width = w + 'px';
    const ck = `${l.id}|${l.mode}|${order[i]}|${w}`;
    let t = pvThumbs.get(ck);
    if(!t){ t = thumbEl(v, order[i], w, l, l.mode); pvThumbs.set(ck, t); b.appendChild(t); PPTX.fitText(t); }
    else b.appendChild(t);
    strip.appendChild(b);
  }
}
function pickPreview(id){
  if(!data.lessons[id] || !data.lessons[id].mode) return;
  if(preview && preview.id===id) return;
  preview = { id, pos:0 };
  $$('.dr.sel').forEach(r=>r.classList.remove('sel'));
  const row = $(`.dr[data-sel="${CSS.escape(id)}"]`); if(row) row.classList.add('sel');
  drawPreview();
}
// Redraw the preview at the new width when the window is resized.
let pvResize = null;
window.addEventListener('resize', ()=>{ clearTimeout(pvResize); pvResize = setTimeout(()=>{ if(view.name==='dash' && preview && $('.dpv')) showPreviewSlide(); }, 150); });
function addMenu(anchor, meta){
  const items = [];
  if(window.SVLibrary && SVLibrary.canCreate()){
    items.push({ label:'New from template', run:()=>SVLibrary.openCreate(meta) });
    items.push({ label:'Copy from Lesson Library', run:()=>SVLibrary.openChoose(meta) });
  }
  items.push({ label:'Choose a PowerPoint or PDF…', run:()=>chooseFile(meta) });
  openMenu(anchor, items);
}

app.addEventListener('click', async e=>{
  if(view.name!=='dash') return;
  const b = e.target.closest('[data-a]');
  if(!b){ // v1.84: a click on a lesson row's empty space previews it
    const row = e.target.closest('.dr[data-sel]');
    if(row && !e.target.closest('input, .menu')) pickPreview(row.dataset.sel);
    return;
  }
  const a = b.dataset.a;
  const meta = b.dataset.meta ? JSON.parse(b.dataset.meta) : null;
  switch(a){
    case 'day': selDate = fromIso(b.dataset.d); renderDashboard(); break;
    case 'wk-prev': selDate = addDays(mondayOf(selDate), -7); renderDashboard(); break;
    case 'wk-next': selDate = addDays(mondayOf(selDate), 7); renderDashboard(); break;
    case 'choose': chooseFile(meta); break;
    case 'create': if(window.SVLibrary) SVLibrary.openCreate(meta); break; // library.js
    case 'library': if(window.SVLibrary) SVLibrary.toggle(); break;
    case 'lib-choose': if(window.SVLibrary) SVLibrary.openChoose(meta); break;
    case 'lib-pull': if(window.SVLibrary) SVLibrary.openPull(b.dataset.id); break; // v1.86
    case 'present': if(window.SVDual && SVDual.wanted()) SVDual.present(b.dataset.id); else { goFullscreen(); openPresenter(b.dataset.id); } break;
    case 'edit': openEditor(b.dataset.id); break;
    case 'mode': { const l = data.lessons[b.dataset.id]; l.mode = b.dataset.mode; l.lastSlide = 0; saveSoon(); renderDashboard(); break; }
    case 'more': moreMenu(b, meta); break;
    case 'add-menu': addMenu(b, meta); break;
    case 'pv-pick': pickPreview(b.dataset.id); break;
    case 'pv-prev': if(preview){ preview.pos = Math.max(0, (preview.pos || 0) - 1); showPreviewSlide(); } break;
    case 'pv-next': if(preview){ preview.pos = (preview.pos || 0) + 1; showPreviewSlide(); } break;
    case 'pv-go': if(preview){ preview.pos = Number(b.dataset.p) || 0; showPreviewSlide(); } break;
    case 'rename': renameInline(b, data.lessons[b.dataset.id]); break;
    case 'settings': openSettings(); break;
    case 'planner-link': openTimetable(); break;
    case 'planner-regrant': try{ await Planner.regrant(); }catch(err){} renderDashboard(); break;
    case 'stack': if(window.SVPrint) SVPrint.openStack(b.dataset.d); break;
    case 'printing': if(window.SVPrintCentre) SVPrintCentre.open(); break; // Printing Centre (printcentre.js)
    case 'ap-review': if(window.SVPoints) SVPoints.openDay(b.dataset.d); break;
    case 'add-extra': addExtra(); break;
    case 'del-extra': {
      const ds = meta.date; const l = data.lessons[meta.id];
      if(l && l.mode && !(await confirmBox('Remove this slot?', 'Its deck and annotations will be deleted.', 'Remove', true))) return;
      if(l) await removeLesson(l);
      data.extras[ds] = (data.extras[ds] || []).filter(x=>x.id!==meta.slotId);
      if(!data.extras[ds].length) delete data.extras[ds];
      saveSoon(); renderDashboard(); break;
    }
  }
});
app.addEventListener('click', e=>{ if(e.target.closest('.status-pill.error')) renderSplash('reconnect'); });
app.addEventListener('dragover', e=>{
  const row = e.target.closest('[data-drop]'); if(!row || view.name!=='dash') return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  $$('.dr.drag-over').forEach(r=>{ if(r!==row) r.classList.remove('drag-over'); });
  row.classList.add('drag-over');
});
app.addEventListener('dragleave', e=>{ const row = e.target.closest('[data-drop]'); if(row && !row.contains(e.relatedTarget)) row.classList.remove('drag-over'); });
app.addEventListener('drop', e=>{
  const row = e.target.closest('[data-drop]'); if(!row || view.name!=='dash') return;
  e.preventDefault(); row.classList.remove('drag-over');
  const lib = window.SVLibrary && e.dataTransfer.getData(SVLibrary.DRAG_TYPE); // a deck dragged from the Lesson Library panel
  if(lib){ SVLibrary.dropOnSlot(lib, JSON.parse(row.dataset.drop)); return; }
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) attachFile(f, JSON.parse(row.dataset.drop));
});

function safeName(s){ return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150); }
async function uniqueName(base){
  const dot = base.lastIndexOf('.'); const stem = base.slice(0, dot), ext = base.slice(dot);
  let n = base, k = 2;
  while(await store.exists(n)) n = `${stem} (${k++})${ext}`;
  return n;
}
async function attachFile(file, meta){
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = ext==='pptx' ? 'pptx' : ext==='pdf' ? 'pdf' : null;
  if(!type){ toast(ext==='ppt' ? "Old .ppt files can't be read. Open it in PowerPoint and Save As .pptx." : 'Drop a .pptx or .pdf file.', true); return; }
  showLoading('Adding ' + file.name + '…');
  try{
    const buf = await file.arrayBuffer();
    const v = type==='pptx' ? await PptxView.load(buf) : await PdfView.load(buf);
    const l = ensureLesson(meta);
    const old = l.files[type];
    const name = await uniqueName(safeName(`${meta.date} ${meta.period} ${meta.label} - ${file.name}`));
    const p = await store.writeDeck(name, file);
    if(old && old.path!==p){ await store.deleteDeck(old.path); deckCache.delete(old.path); }
    l.files[type] = { path:p, name:file.name, size:file.size, added:Date.now() };
    l.mode = type; l.lastSlide = 0;
    l.hides[type] = {}; l.ink[type] = {}; l.slideCount[type] = v.count;
    if(l.slides){ delete l.slides[type]; if(!Object.keys(l.slides).length) l.slides = undefined; } // the old deck's slide order
    if(type==='pptx'){ delete l.ratio; delete l.theme; }
    if(Array.isArray(l.stack)){ l.stack = l.stack.filter(it=>it.mode!==type); if(!l.stack.length) delete l.stack; } // Printer Stack items for the old deck
    if(l.myNotes) l.myNotes[type] = {};
    if(type==='pptx') applyAnimations(l, v);
    deckCache.set(p, Promise.resolve(v));
    await saveNow();
    renderDashboard();
    const hc = hideCount(l, type);
    toast(`Added to ${meta.label}` + (hc ? ` · ${hc} animated item${hc>1?'s':''} set to reveal` : ''));
  }catch(e){
    console.error(e);
    toast(`Couldn't add ${file.name}: ${e.message}`, true);
  }finally{ hideLoading(); }
}
async function removeLesson(l){
  if(seriesFor(l)){ toast('This deck is shared by every Tuesday Form lesson, so it stays. Replace it to change it.', true); return; } // v1.79: deleting it would remove it for all Tuesdays
  for(const m of ['pptx','pdf']) if(l.files[m]){ await store.deleteDeck(l.files[m].path); deckCache.delete(l.files[m].path); }
  delete data.lessons[l.id];
}
function moreMenu(anchor, meta){
  const l = data.lessons[meta.id]; if(!l) return;
  const items = [];
  // v1.84: Rename and the PowerPoint/PDF switch moved here from the row.
  const tb = anchor.closest('.dr') && anchor.closest('.dr').querySelector('.ttl');
  if(tb) items.push({ label:'Rename', run:()=>renameInline(tb, l) });
  if(l.files.pptx && l.files.pdf) items.push({ label: l.mode==='pptx' ? 'Show the PDF version' : 'Show the PowerPoint version', run:()=>{ l.mode = l.mode==='pptx' ? 'pdf' : 'pptx'; l.lastSlide = 0; saveSoon(); if(preview && preview.id===l.id) preview.pos = 0; renderDashboard(); } });
  items.push({ label:'Lesson settings…', run:()=>lessonSettings(l) });
  if(yearOf(l.label)!=null) items.push({ label:'Duplicate slideshow to another class…', run:()=>openDuplicate(l) });
  items.push('-');
  items.push({ label: l.files.pptx ? 'Replace PowerPoint…' : 'Add PowerPoint…', run:()=>chooseFile(meta, '.pptx') });
  items.push({ label: l.files.pdf ? 'Replace PDF version…' : 'Add PDF version (exact look)…', run:()=>chooseFile(meta, '.pdf') });
  if(l.mode==='pptx' && l.files.pptx) items.push({ label:'Reset hides to the deck’s animations', run:async()=>{ const v = await getDeck(l,'pptx'); applyAnimations(l, v); saveSoon(); renderDashboard(); toast('Hides reset'); } });
  if(window.SVPrint) items.push({ label:'Print LSA pack…', run:()=>SVPrint.open(l.id, { lsaOnly:true }) });
  if(window.SVExport && l.files.pptx && !PUPIL) items.push({ label:'Export to PowerPoint…', run:()=>SVExport.open(l.id) }); // v1.67 (pptx-export.js)
  if(window.SVLibrary) for(const it of SVLibrary.lessonMenu(l, meta)) items.push(it); // Save to / Replace from the Lesson Library
  if(inkCount(l, l.mode)) items.push({ label:'Clear all annotations', run:async()=>{ if(await confirmBox('Clear annotations?', 'Removes pen marks from every slide of this deck.', 'Clear', true)){ l.ink[l.mode] = {}; saveSoon(); renderDashboard(); } } });
  items.push('-');
  if(!seriesFor(l)) items.push({ label:'Remove from this lesson', danger:true, run:async()=>{ if(await confirmBox('Remove deck?', `The copy in the Lessons folder, its hides and annotations will be deleted. Your original file isn't touched.`, 'Remove', true)){ await removeLesson(l); await saveNow(); renderDashboard(); } } });
  openMenu(anchor, items);
}
/* ---------- duplicate a lesson's slideshow to other lessons in the same year ---------- */
// Year group from the class label: "9B/Fr2" → 9, "11C/Fr1" → 11. Form, L&M, PPA and extras have none.
function yearOf(label){ const m = /^(\d{1,2})[A-Za-z]/.exec(String(label || '').trim()); return m ? Number(m[1]) : null; }
// The next timetabled lessons after `src` in the same year (any language, the same class included),
// up to the last day the dashboard reaches. Holidays are skipped.
function dupTargets(src, max){
  const yr = yearOf(src.label); if(yr==null) return [];
  const out = [], end = addDays(lastDashMonday(), 4);
  const srcStart = src.start ? toMin(src.start) : -1;
  let d = fromIso(src.date); if(d < today()) d = today();
  for(; d <= end && out.length < max; d = addDays(d, 1)){
    const wd = d.getDay(); if(wd===0 || wd===6 || Planner.holiday(d)) continue;
    const ds = iso(d), slots = Planner.slotsFor(d);
    for(const s of slots){
      if(slotKind(s.label)!=='lesson' || yearOf(s.label)!==yr) continue;
      const id = lessonId(ds, s.id); if(id===src.id) continue;
      if(ds===src.date && srcStart>=0 && toMin(s.start)<=srcStart) continue;
      out.push({ id, date:ds, slotId:s.id, label:s.label, start:s.start, end:s.end, period:periodLabel(s, slots) });
      if(out.length >= max) break;
    }
  }
  return out;
}
function dupDeckName(l){ return (l.title || '').trim() || deckStem((l.files[l.mode] || l.files.pptx || l.files.pdf || {}).name); }
function dupWhen(t){ const d = fromIso(t.date); return `${DAY_NAMES[d.getDay()].slice(0,3)} ${d.getDate()} ${MON_NAMES[d.getMonth()]} ${t.period}`; }
function openDuplicate(src){
  const yr = yearOf(src.label), targets = dupTargets(src, 8), picked = new Set();
  const rows = targets.map(t=>{
    const o = data.lessons[t.id], has = !!(o && o.mode), d = fromIso(t.date);
    return `<label class="dup-row${has ? ' has' : ''}" data-id="${esc(t.id)}"><input type="checkbox">
      <span class="dup-when"><b>${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MON_NAMES[d.getMonth()]}</b><span>${esc(t.period)} · ${esc(t.start)}–${esc(t.end)}</span></span>
      <span class="dup-cls"><b>${esc(t.label)}</b><span>${has ? 'Has: ' + esc(dupDeckName(o)) : 'No deck yet'}</span></span></label>`;
  }).join('');
  modal(`<h2>Duplicate to another class</h2><p><b>${esc(dupDeckName(src))}</b> · the next Year ${yr} lessons. Copies the deck with its hides, cover boxes, edits, notes, title and print choices. Pen marks aren't copied.</p>
    ${targets.length ? `<div class="dup-list">${rows}</div>` : `<p class="dup-none">No more Year ${yr} lessons on your timetable in the next ${WEEKS_AHEAD} weeks.</p>`}
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok" disabled>Duplicate</button></div>`, (m, close)=>{
    const ok = m.querySelector('[data-a=ok]');
    const sync = ()=>{ ok.disabled = !picked.size; ok.textContent = picked.size>1 ? `Duplicate to ${picked.size} lessons` : 'Duplicate'; };
    const mark = (r, on)=>{ r.querySelector('input').checked = on; r.classList.toggle('on', on); if(on) picked.add(r.dataset.id); else picked.delete(r.dataset.id); sync(); };
    $$('.dup-row', m).forEach(r=>{
      const cb = r.querySelector('input');
      cb.onchange = async ()=>{
        if(!cb.checked){ mark(r, false); return; }
        if(r.classList.contains('has')){
          cb.checked = false;
          const o = data.lessons[r.dataset.id], t = targets.find(x=>x.id===r.dataset.id);
          if(!(await confirmBox('Replace deck?', `${t.label} (${dupWhen(t)}) already has “${dupDeckName(o)}”. Duplicating replaces it, with its hides, notes and pen marks.`, 'Replace', true))) return;
        }
        mark(r, true);
      };
    });
    m.querySelector('[data-a=no]').onclick = close;
    ok.onclick = async ()=>{ const list = targets.filter(t=>picked.has(t.id)); close(); await duplicateLesson(src, list); };
  });
}
// Copies the deck file(s) into Lessons/ under each target's name and carries the prep across.
// Not copied: pen marks, last slide, the print class code (the target's comes from the timetable).
async function duplicateLesson(src, targets){
  if(!targets.length) return;
  const clone = o=>JSON.parse(JSON.stringify(o || {}));
  showLoading(`Duplicating to ${targets.length} lesson${targets.length>1 ? 's' : ''}…`);
  let done = 0;
  try{
    const files = {};
    for(const m of ['pptx','pdf']) if(src.files[m]) files[m] = await store.readDeck(src.files[m].path);
    for(const t of targets){
      const l = ensureLesson(t);
      for(const m of ['pptx','pdf']) if(l.files[m]){ await store.deleteDeck(l.files[m].path); deckCache.delete(l.files[m].path); }
      l.files = {};
      for(const m of Object.keys(files)){
        const name = await uniqueName(safeName(`${t.date} ${t.period} ${t.label} - ${src.files[m].name}`));
        const p = await store.writeDeck(name, files[m]);
        l.files[m] = { path:p, name:src.files[m].name, size:src.files[m].size, added:Date.now() };
      }
      l.mode = src.mode; l.lastSlide = 0;
      l.title = src.title || ''; l.lang = src.lang;
      if(src.gcSet) l.gcSet = src.gcSet; else delete l.gcSet;
      l.hides = clone(src.hides); l.myNotes = clone(src.myNotes); l.slideCount = clone(src.slideCount);
      if(src.slides) l.slides = clone(src.slides); else l.slides = undefined; // slide order; shared slides and pictures stay shared
      if(src.ratio) l.ratio = src.ratio; else delete l.ratio;
      if(src.theme) l.theme = src.theme; else delete l.theme;
      l.ink = { pptx:{}, pdf:{} };
      if(src.print) l.print = clone(src.print); else delete l.print;
      delete l.printCode;
      delete l.stack; // the target's Printer Stack items were for its old deck
      done++;
    }
    toast(targets.length===1 ? `Duplicated to ${targets[0].label} · ${dupWhen(targets[0])}` : `Duplicated to ${targets.length} lessons`);
  }catch(e){
    console.error(e);
    toast(`Couldn't duplicate${done ? ` (${done} of ${targets.length} done)` : ''}: ${e.message}`, true);
  }finally{ hideLoading(); }
  data = normalise(data);
  await saveNow(); renderDashboard();
}
// Tap the deck name on the dashboard to set the lesson title. Blank = deck's name.
function renameInline(btn, l){
  if(!l) return;
  const inp = el('input', 'name-input'); inp.type = 'text'; inp.maxLength = 80;
  inp.value = (l.title || '').trim() || deckStem((l.files.pptx || l.files.pdf || {}).name);
  btn.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  // Update the card in place (no full redraw), so a tap on another button still lands.
  const finish = save=>{
    if(done) return; done = true;
    const f = l.files.pptx || l.files.pdf || {}, stem = deckStem(f.name);
    if(save){
      const v = inp.value.trim(), t = v===stem ? '' : v;
      if(t!==(l.title || '')){ l.title = t; saveSoon(); }
    }
    const nb = el('button', 'ttl', esc(l.title || stem)); // v1.84 dashboard row title
    nb.dataset.a = 'rename'; nb.dataset.id = l.id; nb.title = 'Tap to rename';
    if(inp.isConnected) inp.replaceWith(nb);
    if(preview && preview.id===l.id){ const pt = $('.dpv .dpv-title'); if(pt) pt.textContent = l.title || stem; }
  };
  inp.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); finish(true); } else if(e.key==='Escape') finish(false); };
  inp.onblur = ()=>finish(true);
}
function lessonSettings(l){
  let lang = l.lang;
  modal(`<h2>Lesson settings</h2><p>${esc(l.period ? l.period + ' · ' : '')}${esc(l.label || '')}</p>
    <div class="row"><div class="grow"><div class="t">Title</div><div class="d">Shown in the top bar while presenting. Leave blank to use the deck's name.</div></div></div>
    <input type="text" maxlength="80" aria-label="Title" placeholder="${esc(deckStem((l.files.pptx || l.files.pdf || {}).name))}" value="${esc(l.title || '')}">
    <div class="row" style="margin-top:14px"><div class="grow"><div class="t">Date language</div><div class="d">${esc(dateWords(today(), 'fr'))} / ${esc(dateWords(today(), 'es'))}</div></div><span class="seg"><button data-lang="fr">Français</button><button data-lang="es">Español</button></span></div>
    ${window.SVChance ? `<div class="row"><div class="grow"><div class="t">Question set</div><div class="d">Picked already when Game of Chance, Noughts &amp; Crosses or Connect 4 starts in this lesson</div></div></div><select data-gc aria-label="Question set">${SVChance.setOptions(l.gcSet)}</select>` : ''}
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Save</button></div>`, (m, close)=>{
    const inp = m.querySelector('input');
    const sync = ()=>$$('[data-lang]', m).forEach(b=>b.classList.toggle('on', b.dataset.lang===lang));
    $$('[data-lang]', m).forEach(b=>b.onclick = ()=>{ lang = b.dataset.lang; sync(); });
    sync();
    const ok = ()=>{
      l.title = inp.value.trim(); l.lang = lang;
      const gs = m.querySelector('select[data-gc]'); if(gs){ if(gs.value) l.gcSet = gs.value; else delete l.gcSet; }
      saveSoon(); close(); renderDashboard();
    };
    m.querySelector('[data-a=ok]').onclick = ok; m.querySelector('[data-a=no]').onclick = close;
    inp.onkeydown = e=>{ if(e.key==='Enter') ok(); };
    inp.focus();
  });
}
function addExtra(){
  modal(`<h2>Extra presentation</h2><p>For anything not on your timetable — cover, assembly, form time slides.</p><input type="text" aria-label="Name of the extra presentation" placeholder="e.g. Cover 10A/Fr1…" maxlength="60"><div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Add</button></div>`, (m, close)=>{
    const inp = m.querySelector('input'); inp.focus();
    const ok = ()=>{ const label = inp.value.trim() || 'Extra'; const ds = iso(selDate); (data.extras[ds] = data.extras[ds] || []).push({ id:'x' + uid(), label }); saveSoon(); close(); renderDashboard(); };
    m.querySelector('[data-a=ok]').onclick = ok; m.querySelector('[data-a=no]').onclick = close;
    inp.onkeydown = e=>{ if(e.key==='Enter') ok(); };
  });
}
/* Settings page (v1.41; was a pop-up). view 'settings'. Left menu: General, Classes & achievement
   points (classes.js draws into the page), Question sets (chance.js; also used by games.js), Sentence builders (builder.js, mounted here). */
let setSec = 'general';
/* Settings → Beta (v1.61): new changes that can be turned off one at a time, to go back to how
   they worked before. data.settings.beta[key] === true is on; anything else (or missing) is off.
   Saved in viewer-data.json, so they follow you to every computer. Read when a lesson opens. */
const BETA = [
  ['fine', 'Fine pen size', 'Adds a Fine size (thinner than Thin) and makes it the pen\'s starting size.', 'Thin, Medium and Thick; the pen starts on Thin.'],
  ['nocursor', 'No cursor while drawing', 'No pointer on the slide while the pen, highlighter or eraser is in hand. The teacher screen still shows the mouse.', 'A crosshair.'],
  ['fast', 'Faster drawing', 'Only the line being drawn is repainted as the pen moves, not every line on the slide; the teacher screen is sent only the new part of the line.', 'Every line on the slide is repainted each time the pen moves (slower on busy slides).'],
  ['lowlat', 'Low-latency ink', 'Edge\'s low-latency drawing, and the line is drawn slightly ahead of the pen to where Edge expects it to go next.', 'Normal drawing. Turn this off if the line tears, flickers or flicks out at the tip.'],
  ['hlblend', 'Highlighter blend', 'Highlighter goes under the pen ink like a real highlighter: writing under it stays crisp and overlapping strokes don\'t get darker. It barely shows on dark backgrounds.', 'See-through (38%) on top of everything, including pen ink.'],
  ['eraser', 'Eraser catches fast swipes', 'The eraser checks the whole of each line and fills in quick swipes, so it doesn\'t skip strokes.', 'Only erases where the eraser and the line\'s recorded points meet, so a fast swipe can miss.'],
];
function beta(k){ const b = data && data.settings && data.settings.beta; return !!(b && b[k]===true); }
const SET_SECS = [
  ['general', 'General', 'settings'],
  ['classes', 'Classes & achievement points', 'users'],
  ['gcsets', 'Question sets', 'dice'],
  ['sb', 'Sentence builders', 'sb'],
  ['wp', 'Waypoints', 'image'],
  ['beta', 'Beta', 'pen'],
];
function openSettings(sec, opt){
  if(!data) return;
  if(sec && SET_SECS.some(s=>s[0]===sec)) setSec = sec;
  document.body.classList.remove('presenting');
  view = { name:'settings' };
  renderSettings(opt);
  window.scrollTo({ top:0 });
}
function renderSettings(opt){
  if(view.name!=='settings') return;
  if(window.SBBuilder) SBBuilder.unmount(); // the builder is rebuilt below if its section is open
  if(window.SBWaypoints) SBWaypoints.unmount(); // likewise the Waypoints library
  app.innerHTML = `${appHeader('settings')}<div class="dash set-page">
    <div class="set-layout">
      <nav class="set-nav">${SET_SECS.map(([k, label, ic])=>`<button class="set-item ${k===setSec ? 'on' : ''}" data-s="sec" data-v="${k}">${icon(ic)}<span>${esc(label)}</span></button>`).join('')}
        <div class="set-ver">Version ${APP_VERSION}</div></nav>
      <section class="set-main"></section>
    </div>
  </div>`;
  updatePill();
  const main = $('.set-main', app);
  if(setSec==='classes'){ if(window.SVClasses && SVClasses.mountIn) SVClasses.mountIn(main, opt && opt.cls); else main.innerHTML = '<div class="empty">Classes aren\'t available.</div>'; }
  else if(setSec==='sb'){ if(window.SBBuilder) SBBuilder.mount(main, { onHome: () => goHome() }); else main.innerHTML = '<div class="empty">Sentence builders aren\'t available.</div>'; }
  else if(setSec==='wp'){ if(window.SBWaypoints) SBWaypoints.mount(main); else main.innerHTML = '<div class="empty">Waypoints aren\'t available.</div>'; }
  else main.innerHTML = setSecHTML();
}
// Whiteboard spacing (v1.74): data.settings.wbLines / wbGrid = 'narrow' | 'normal' | 'wide'. whiteboard.js reads them.
function wbSeg(k){
  const cur = data.settings[k] || 'normal', ev = k==='wbLines' ? 'wb-lines' : 'wb-grid';
  return [['narrow','Narrow'],['normal','Normal'],['wide','Wide']].map(([v,l])=>`<button data-s="${ev}" data-v="${v}" class="${cur===v?'on':''}">${l}</button>`).join('');
}
function setSecHTML(){
  if(setSec==='gcsets'){
    const n = (data.gcSets || []).length;
    return `<div class="set-head"><h2>Question sets</h2><button class="btn primary" data-s="gc-add">${icon('plus')}New set</button></div>
      <p class="set-intro">Questions for Game of Chance ("With questions"), Noughts &amp; Crosses and Connect 4 ("Question set"). A set can be used with any class; pick one when you start a game, or set a lesson's default in its Lesson settings (⋯ menu).${n ? '' : ' No question sets yet.'}</p>
      <div class="set-card">${window.SVChance && SVChance.setsRows ? SVChance.setsRows() : ''}</div>`;
  }
  if(setSec==='beta'){
    const rows = BETA.map(([k, t, on, off])=>`<div class="row"><div class="grow"><div class="t">${esc(t)}</div><div class="d">${esc(on)}</div><div class="d"><b>Off:</b> ${esc(off)}</div></div><span class="seg"><button data-s="beta" data-k="${k}" data-v="1" class="${beta(k)?'on':''}">On</button><button data-s="beta" data-k="${k}" data-v="0" class="${!beta(k)?'on':''}">Off</button></span></div>`).join('');
    return `<div class="set-head"><h2>Beta</h2><button class="btn sm" data-s="beta-all">All on</button></div>
      <p class="set-intro">New pen changes (version 1.61). They're off by default; turn any of them on to try it. Changes apply the next time you open a lesson, on every computer (they're saved in viewer-data.json).</p>
      <div class="set-card">${rows}</div>`;
  }
  const src = Planner.source==='manual' ? `${new Set(Planner.data.slots.map(s=>s.label)).size} class codes typed in` : 'Not set up yet';
  return `<div class="set-head"><h2>General</h2></div>
    <div class="set-card">
      <div class="row"><div class="grow"><div class="t">Data folder</div><div class="d">${esc(store.name)} — viewer-data.json and the Lessons folder</div></div><button class="btn sm" data-s="folder">Change…</button></div>
      <div class="row"><div class="grow"><div class="t">Timetable</div><div class="d">${esc(src)}</div></div><button class="btn sm" data-s="planner">${Planner.source==='manual' ? 'Edit…' : 'Set up…'}</button></div>
    </div>
    <h3 class="set-sub">Appearance</h3>
    <div class="set-card">
      <div class="row"><div class="grow"><div class="t">Light or dark</div><div class="d">Applies to the whole app, including the lesson editor. Saved on this computer only.</div></div><span class="seg">${[['light','Light'],['dark','Dark'],['auto','Match my computer']].map(([v,l])=>`<button data-s="theme" data-v="${v}" class="${SVTheme.pref()===v?'on':''}">${l}</button>`).join('')}</span></div>
    </div>
    <h3 class="set-sub">Presenting</h3>
    <div class="set-card">
      <div class="row"><div class="grow"><div class="t">Time left in lesson</div><div class="d">Shown on the right of the top bar while presenting, from your timetable</div></div><span class="seg"><button data-s="timeleft" data-v="1" class="${data.settings.showTimeLeft?'on':''}">Show</button><button data-s="timeleft" data-v="0" class="${!data.settings.showTimeLeft?'on':''}">Hide</button></span></div>
      ${window.SVDual ? SVDual.settingsRow() : ''}
      <div class="row"><div class="grow"><div class="t">Sidebar position</div><div class="d">Which side of the slide the buttons sit on</div></div><span class="seg"><button data-s="rail" data-v="left" class="${data.settings.rail==='left'?'on':''}">Left</button><button data-s="rail" data-v="right" class="${data.settings.rail!=='left'?'on':''}">Right</button></span></div>
      <div class="row"><div class="grow"><div class="t">Whiteboard lines</div><div class="d">Space between the lines of a lined whiteboard</div></div><span class="seg">${wbSeg('wbLines')}</span></div>
      <div class="row"><div class="grow"><div class="t">Whiteboard grid</div><div class="d">Size of the squares on a grid whiteboard</div></div><span class="seg">${wbSeg('wbGrid')}</span></div>
    </div>
    <h3 class="set-sub">Games</h3>
    <div class="set-card">
      <div class="row"><div class="grow"><div class="t">Seasonal theme</div><div class="d">Dresses up Game of Chance. <b>Halloween</b> (Trick or Treat!): pumpkin cards, bats and cobwebs, Trick! / Treat! on the cards. <b>Christmas</b> (Christmas Cracker): cracker cards, snow and fairy lights, Ho ho ho! / Bah humbug! on the cards. In both, 5 of the 16 cards burst with sweets (whoever picks one wins a sweet). Same points cards and odds. Starts with the next game.</div></div><span class="seg">${(ss => [['off','Off'],['halloween','Halloween'],['christmas','Christmas']].map(([v,l])=>`<button data-s="season" data-v="${v}" class="${ss===v?'on':''}">${l}</button>`).join(''))(data.settings.season || (data.settings.halloween ? 'halloween' : 'off'))}</span></div>
    </div>`;
}
app.addEventListener('click', async e=>{
  if(view.name!=='settings') return;
  const b = e.target.closest('[data-s], [data-a="dual"]'); if(!b || !b.closest('.set-page')) return;
  const s = b.dataset.s || b.dataset.a;
  const row = b.closest('[data-id]');
  switch(s){
    case 'home': renderDashboard(); break;
    case 'sec': setSec = b.dataset.v; renderSettings(); window.scrollTo({ top:0 }); break;
    case 'theme': SVTheme.set(b.dataset.v); renderSettings(); break;
    case 'rail': data.settings.rail = b.dataset.v; saveSoon(); renderSettings(); break;
    case 'wb-lines': data.settings.wbLines = b.dataset.v; saveSoon(); renderSettings(); break;
    case 'wb-grid': data.settings.wbGrid = b.dataset.v; saveSoon(); renderSettings(); break;
    case 'timeleft': data.settings.showTimeLeft = b.dataset.v==='1'; saveSoon(); renderSettings(); break;
    case 'season': data.settings.season = b.dataset.v; delete data.settings.halloween; saveSoon(); renderSettings(); break;
    case 'beta': data.settings.beta = Object.assign({}, data.settings.beta, { [b.dataset.k]: b.dataset.v==='1' }); saveSoon(); renderSettings(); break;
    case 'beta-all': data.settings.beta = Object.fromEntries(BETA.map(r=>[r[0], true])); saveSoon(); renderSettings(); break;
    case 'dual': await SVDual.setWanted(b.dataset.v==='1'); renderSettings(); break;
    case 'planner': openTimetable(); break;
    case 'folder': try{ await store.pick(); await loadAndGo(); }catch(err){ if(err.name!=='AbortError') toast(err.message, true); } break;
    case 'gc-add': if(window.SVChance) SVChance.editSet(null, ()=>renderSettings()); break;
    case 'gc-edit': if(window.SVChance && row) SVChance.editSet(row.dataset.id, ()=>renderSettings()); break;
    case 'gc-del': if(window.SVChance && row) SVChance.deleteSet(row.dataset.id, ()=>renderSettings()); break;
  }
});
function goFullscreen(){ const d = document.documentElement; if(!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(()=>{}); }

/* ---------- presenter ---------- */
// Pen colours (3 per palette row) and highlighter colours (made see-through by .stage-ink-hl in styles.css).
const COLORS = ['#D93A2B','#111114','#FFFFFF','#2F5BEA','#0FA3B1','#1E9E5A','#7BC043','#F5B700','#F07818','#E8489A','#7A3FC8','#8B5A2B','#7A7A85','#0B2A6F','#9E1B32'];
const HL_COLORS = ['#FFE500','#3BE36B','#2EE6D0','#3FC4FF','#B57BFF','#FF5FB0','#FF9A1F','#FF4A4A','#C8FF3A'];
// v1.61: Fine (2) added and made the default (Settings → Beta 'fine'; off: Thin, Medium, Thick, starting on Thin).
const SIZES = [2, 3, 6, 12], SIZE_NAMES = ['Fine', 'Thin', 'Medium', 'Thick'];
function penSizes(){ return beta('fine') ? SIZES : SIZES.slice(1); }
function penDefault(){ return { kind:'pen', color:'#D93A2B', w:penSizes()[0] }; }
// Defaults each time a lesson opens: fine red pen, yellow highlighter.
const HL_DEFAULT = '#FFE500';
// Permanent marker: always black, opaque, thicker than the thickest pen. Screen px, like SIZES.
const MARKER_W = 32, MARKER_COLOR = '#000000';
// Presenter's view of a slide's settings: deleted objects are left out (they're
// removed from the slide itself by dropDeleted).
// The slides shown when presenting: not deleted, not hidden (plus `also`, e.g. the editor's slide in Preview).
// If every slide is hidden, all of them.
function presentOrder(v, also){
  const keys = v.keys;
  const o = keys.filter(k=>!v.isHidden(k) || k===also);
  return o.length ? o : keys;
}
// The slide list changed while presenting (edited on the teacher console): keep showing the same slide.
function refreshOrder(P){
  const cur = P.order[P.pos];
  P.order = presentOrder(P.v);
  if(!P.order.length) return;
  const at = P.order.indexOf(cur);
  P.pos = at>=0 ? at : Math.min(P.pos, P.order.length - 1);
  showSlide(P);
}
function hideCfg(l, mode, i){
  const c = l.hides[mode][i]; if(!c) return { obj:{}, covers:[] };
  const all = c.obj || {}, obj = {};
  for(const [k, v] of Object.entries(all)) if(v!=='del' && !(k.includes('.') && all[k.split('.')[0]]==='del')) obj[k] = v; // table cells (n<id>.r.c) go with their table
  // v1.63: a group reveals as one item, through its first member (the lead); the others' own settings don't count.
  const groups = liveGroups(c);
  for(const g of groups) for(const id of g.oids.slice(1)) delete obj[id];
  for(const a of (c.added || [])) if(a.table && PPTX.hasSpans(a.table)) for(const id of coveredCellIds(a)) delete obj[id]; // v1.70: merged cells
  return { obj, covers:c.covers || [], btn:c.btn || {}, order:c.order || null, groups };
}
/* ---------- groups (v1.63) ----------
   cfg.groups = [{ id, oids }]: objects on a slide that select, move and resize together, and reveal as one
   item. oids[0] is the lead: its reveal setting (cfg.obj), button position (cfg.btn) and place in the reveal
   order ('o'+lead) are the group's. Deleted members don't count; a group needs two members left. */
function liveGroups(c){
  const all = (c && c.obj) || {};
  return ((c && c.groups) || []).map(g=>({ id:g.id, oids:g.oids.filter(id=>all[id]!=='del') })).filter(g=>g.oids.length > 1);
}
// Everything that shows / hides with oid's reveal: the whole group when oid leads one, else just oid.
function revealOids(cfg, oid){ const g = (cfg.groups || []).find(g=>g.oids[0]===oid); return g ? g.oids.filter(id=>!cfg.obj || cfg.obj[id]!=='del') : [oid]; }
function unionRect(list){
  list = list.filter(Boolean); if(!list.length) return null;
  const x1 = Math.min(...list.map(r=>r.x)), y1 = Math.min(...list.map(r=>r.y)), x2 = Math.max(...list.map(r=>r.x + r.w)), y2 = Math.max(...list.map(r=>r.y + r.h));
  return { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
}
// objBox for several objects together (a group's visible content).
function objBoxAll(P, oids){ return oids.length===1 ? objBox(P, oids[0]) : unionRect(oids.map(id=>objBox(P, id))); }
// The box round a reveal item's objects ('o'+oid: the whole group when it leads one), from the stage's objects.
function itemRect(stage, cfg, key){
  if(key[0]==='c') return (cfg.covers || []).find(c=>'c'+c.id===key) || null;
  const ids = revealOids(cfg, key.slice(1));
  return unionRect(ids.map(id=>(stage.objects || []).find(o=>o.oid===id)));
}
function ytId(url){ const m = /(?:embed\/|v=|youtu\.be\/|shorts\/)([\w-]{11})/.exec(url || ''); return m ? m[1] : null; }

// resume: coming back from the editor (tools keep their state).
async function openPresenter(id, startPos, resume){
  if(!resume && !PUPIL) await syncIn(); // the latest from other computers before the lesson starts
  const l = data.lessons[id]; if(!l || !l.mode) return;
  showLoading('Opening ' + (l.label || 'lesson') + '…');
  let v;
  try{ v = await getDeck(l, l.mode); }
  catch(e){ hideLoading(); leaveFullscreen(); toast("Couldn't open the deck: " + e.message, true); return; }
  hideLoading();
  const order = presentOrder(v);
  if(!order.length){ leaveFullscreen(); toast('Every slide in this deck has been deleted. Open Edit to bring some back.', true); return; }
  const P = { l, mode:l.mode, v, order, pos: Math.min(startPos || 0, order.length-1), tool:'arrow', revealed:new Map(), palette:false, pen:penDefault(), hlColor:HL_DEFAULT };
  view = { name:'present', P };
  document.body.classList.add('presenting');
  app.innerHTML = `<div class="present ${data.settings.rail==='left' ? 'rail-left' : ''}">
    <div class="pbar">
      <div class="pbar-l"><span class="pbar-date"></span><span class="pbar-dot" aria-hidden="true"></span><span class="pbar-title" data-p="title" title="Tap to rename"></span></div>
      <div class="island"><div class="island-in"><span class="island-widgets"></span><button class="island-clock" data-p="clock" title="Clock: tap to change"></button></div></div>
    </div>
    <div class="present-main">
    <div class="stage-host" id="pstage"></div>
    <div class="rail no-end">
      <button class="rail-btn small" data-p="home" title="Back to lessons" aria-label="Back to lessons">${icon('home')}</button>
      <button class="rail-btn small" data-p="edit" title="Edit this slide" aria-label="Edit this slide">${icon('edit')}</button>
      <button class="rail-btn small" data-p="fs" title="Full screen" aria-label="Full screen">${icon('max')}</button>
      <button class="rail-btn small" data-p="blur" title="Blur the slide" aria-label="Blur the slide">${icon('blur')}</button>
      <button class="rail-btn small" data-p="refresh" title="${REFRESH_TIP}" aria-label="${REFRESH_TIP}">${icon('reset')}</button>
      <div class="spacer"></div>
      <button class="rail-btn" data-p="pen" title="Pen (tap again for colours and thickness, a third time to put it down)" aria-label="Pen (tap again for colours and thickness, a third time to put it down)">${icon('pen')}</button>
      <button class="rail-btn" data-p="hl" title="Highlighter (tap again for colours, a third time to put it down)" aria-label="Highlighter (tap again for colours, a third time to put it down)">${icon('hl')}</button>
      <button class="rail-btn" data-p="eraser" title="Eraser (goes back after 15 s)" aria-label="Eraser (goes back after 15 s)">${icon('eraser')}</button>
      <div class="rail-gap"></div>
      <button class="rail-btn" data-p="prev" title="Previous slide" aria-label="Previous slide">${icon('left')}</button>
      <button class="rail-btn" data-p="next" title="Next slide" aria-label="Next slide">${icon('right')}</button>
      <div class="rail-gap"></div>
      <div class="tools-slot" id="tools-slot"><button class="rail-btn tools" data-p="tools" title="Classroom tools" aria-label="Classroom tools">${icon('tools')}</button></div>
      <button class="rail-btn end" data-p="end" title="End of lesson" aria-label="End of lesson">${icon('done')}</button>
    </div>
    <div class="palette" hidden></div>
    </div>
  </div>`;
  const root = $('.present');
  startBar(P);
  // Zoom: two fingers always; one finger / mouse also pans with the arrow tool.
  P.stage = new Stage($('#pstage'), { onePan:()=>P.tool==='arrow', onGesture:()=>P.ink.cancel() });
  // v1.77: P.order, not the order the lesson opened with: the console's editor can change the slide list mid-lesson (refreshOrder).
  P.ink = new Ink(P.stage, ()=>{ const i = P.order[P.pos]; P.l.ink[P.mode][i] = P.ink.strokes.slice(); if(!P.ink.strokes.length) delete P.l.ink[P.mode][i]; saveSoon(1200); dualNotify('ink'); });
  P.ink.onLive = ()=>dualNotify('live');
  P.stage.onfit = ()=>{ P.ink.resize(); buildOverlay(P); placeRail(P); placeTopBar(P); };
  P.stage.onmove = ()=>P.ink.resize();
  // Quick eraser: each touch on the slide restarts its 15-second timeout.
  P.ink.c.addEventListener('pointerdown', ()=>{ if(P.tool==='eraser') armEraser(P); });
  root.addEventListener('click', e=>{ const b = e.target.closest('[data-p]'); if(b) presenterAction(P, b.dataset.p, b); });
  buildPalette(P);
  setTool(P, 'arrow');
  showSlide(P);
  window.dispatchEvent(new CustomEvent('sv:present', { detail:{ lesson:l, resume:!!resume } }));
  dualNotify('open');
}
// Pupil window: tell the console something changed (dual.js batches these). Ignored elsewhere.
function dualNotify(kind){ if(PUPIL && window.SVDual) SVDual.notify(kind); }
function presenterAction(P, a, b){
  switch(a){
    case 'home': exitPresenter(P); break;
    case 'edit': { const id = P.l.id, pos = P.pos, slide = P.order[P.pos]; exitPresenter(P, true); openEditor(id, { slide, back:pos }); break; }
    case 'prev': go(P, -1); break;
    case 'next': go(P, 1); break;
    case 'pen': case 'hl': inkTap(P, a); break;
    case 'eraser': if(P.tool==='eraser') setTool(P, P.eraseBack || 'arrow'); else setTool(P, 'eraser'); break;
    case 'title': editTitle(P); break;
    case 'blur': setBlur(P, !P.blur); break;
    case 'refresh': armRefresh(P, b); break;
    case 'clock': cycleClock(P); break;
    case 'tools': if(window.SVTools) window.SVTools.openBox(); break;
    case 'fs': if(document.fullscreenElement) leaveFullscreen(); else goFullscreen(); break;
    case 'end': if(window.SVPoints && window.SVPoints.showEnd) window.SVPoints.showEnd(P.l); break;
  }
}
/* ---------- top bar: date + title on the left, island on the right ----------
   Fixed height, so the slide never resizes. Only the island changes width,
   growing leftwards: [ tool readouts | min left | clock ].
   Classroom tools put live readouts in the island with
     SVIsland.set('timer', '<b>04:59</b>')   and   SVIsland.remove('timer')   */
const islandWidgets = new Map(), islandOrder = new Map();
window.SVIsland = {
  // order: lower numbers sit further left; time-left always sits next to the clock.
  set(key, html, order){ islandWidgets.set(key, html); if(order!=null) islandOrder.set(key, order); renderIsland(); },
  remove(key){ islandOrder.delete(key); if(islandWidgets.delete(key)) renderIsland(); },
};
// from: the island's width before a change made outside this function (e.g. the clock format).
function renderIsland(from){
  const isl = $('.island'), w = $('.island-widgets'); if(!isl || !w) return;
  const ord = k => islandOrder.has(k) ? islandOrder.get(k) : 50;
  const keys = [...islandWidgets.keys()].filter(k=>k!=='_tl').sort((a,b)=>ord(a) - ord(b));
  if(islandWidgets.has('_tl')) keys.push('_tl');
  // Reuse each readout's element, so a readout that ticks every second
  // doesn't replay its fade-in; only new readouts fade in.
  if(from==null) from = isl.getBoundingClientRect().width;
  const have = new Map([...w.children].map(c=>[c.dataset.k, c]));
  for(const [k, c] of have) if(!keys.includes(k)) c.remove();
  keys.forEach((k, i)=>{
    let c = have.get(k);
    const html = islandWidgets.get(k);
    if(!c){ c = el('span','island-w'); c.dataset.k = k; }
    if(c._h!==html){ c.innerHTML = html; c._h = html; }
    if(w.children[i]!==c) w.insertBefore(c, w.children[i] || null);
  });
  isl.style.width = '';
  const to = isl.getBoundingClientRect().width;
  if(Math.abs(to - from) < 1) return;
  // Animate between the two widths, then go back to auto so text changes never clip.
  isl.style.width = from + 'px'; void isl.offsetWidth;
  isl.style.width = to + 'px';
  clearTimeout(isl._t); isl._t = setTimeout(()=>{ isl.style.width = ''; }, 420);
}
function timeLeft(l){
  if(!data.settings.showTimeLeft || !l.start || !l.end || l.date!==iso(today())) return null;
  const n = new Date(), now = n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds();
  const s = toMin(l.start)*60, e = toMin(l.end)*60;
  if(now < s || now >= e) return null;
  return Math.ceil((e - now)/60);
}
function tickBar(P){
  const n = new Date();
  const c = $('.island-clock'); if(!c) return;
  drawClock(c, n);
  const d = $('.pbar-date'), t = $('.pbar-title');
  const ds = dateWords(n, isForm(P.l.label) ? 'en' : P.l.lang); if(d.textContent!==ds) d.textContent = ds;
  const ts = lessonTitle(P.l); if(!t.querySelector('input') && t.textContent!==ts) t.textContent = ts;
  const rail = $('.present > .present-main > .rail'); if(rail) rail.classList.toggle('no-end', !endDue(P.l, n));
  const m = timeLeft(P.l);
  if(m==null) islandWidgets.delete('_tl');
  else islandWidgets.set('_tl', `<span class="tl${m<=5 ? ' warn' : ''}">${m} min left</span>`);
  renderIsland();
}
/* Clock in the island: tap to cycle  0 = HH:MM  ->  1 = HH:MM:SS  ->  2 = clock icon  ->  0.
   Saved as data.settings.clockMode, so it stays as left across lessons. */
function drawClock(c, n){
  const m = data.settings.clockMode || 0;
  if(m===2){ if(c._m!==2){ c.innerHTML = icon('clock'); c._m = 2; } c.classList.add('as-icon'); return; }
  const t = `${pad2(n.getHours())}:${pad2(n.getMinutes())}` + (m===1 ? `:${pad2(n.getSeconds())}` : '');
  c.classList.remove('as-icon');
  if(c._m!==m || c.textContent!==t){ c.textContent = t; c._m = m; }
}
function cycleClock(P){
  const isl = $('.island'), c = $('.island-clock'); if(!isl || !c) return;
  const from = isl.getBoundingClientRect().width;
  data.settings.clockMode = ((data.settings.clockMode || 0) + 1) % 3; saveSoon();
  drawClock(c, new Date());
  renderIsland(from);
}
function startBar(P){
  stopBar(P);
  const loop = ()=>{ tickBar(P); P.barTimer = setTimeout(loop, 1005 - Date.now()%1000); };
  loop();
  renderIsland();
}
// Tool readouts stay in the map (a timer keeps running across lessons); only time-left is per lesson.
function stopBar(P){ clearTimeout(P.barTimer); P.barTimer = null; islandWidgets.delete('_tl'); islandOrder.delete('_tl'); }
// quiet: don't redraw the dashboard (going to the editor or straight to another lesson).
// keep: tools keep their state (editor round trip); defaults to quiet.
function exitPresenter(P, quiet, keep){
  if(keep==null) keep = !!quiet;
  P.l.lastSlide = P.pos; saveSoon(300);
  clearTimeout(P.eraseTimer);
  stopBar(P);
  P.stage.destroy();
  view = { name:'dash' };
  window.dispatchEvent(new CustomEvent('sv:leave', { detail:{ lesson:P.l, keep:!!keep } }));
  dualNotify('leave');
  if(!quiet) renderDashboard();
}
function go(P, d){
  const n = P.pos + d;
  if(n<0 || n>=P.order.length) return;
  P.pos = n; showSlide(P);
}
/* Tools: 'arrow' (nothing selected), 'pen', 'hl' (highlighter) or 'eraser' (goes back to whichever
   was in use before, 15 seconds after it was last touched).
   Pen / highlighter: tap 1 picks it up, tap 2 opens its options, tap 3 puts it down (arrow). */
const ERASER_MS = 15000;
function inkTap(P, t){
  if(P.tool!==t) setTool(P, t);
  else if(!P.palette){ P.palette = true; syncPalette(P); }
  else setTool(P, 'arrow');
}
// Copy the chosen pen / highlighter style onto the ink tool.
function applyInk(P){
  const k = P.ink.tool;
  if(P.tool==='pen') Object.assign(k, P.pen);
  else if(P.tool==='hl'){ k.kind = 'hl'; k.color = P.hlColor; }
}
function setTool(P, t){
  if(t==='eraser'){
    if(P.tool!=='eraser') P.eraseBack = P.tool;
    P.ink.tool.kind = 'eraser';
    armEraser(P);
  } else clearTimeout(P.eraseTimer);
  P.tool = t; P.palette = false;
  applyInk(P);
  P.ink.setEnabled(t!=='arrow');
  $$('.rail-btn[data-p=pen], .rail-btn[data-p=hl], .rail-btn[data-p=eraser]').forEach(b=>b.classList.toggle('on', b.dataset.p===t));
  syncPalette(P);
}
function armEraser(P){
  clearTimeout(P.eraseTimer);
  P.eraseTimer = setTimeout(()=>{ if(view.P===P && P.tool==='eraser') setTool(P, P.eraseBack || 'arrow'); }, ERASER_MS);
}
/* Blur: only the slide (and its pen marks) is blurred; the bars, island and tool boxes stay clear.
   Reveal/video buttons are hidden while it's on. Stays on across slide changes until toggled off. */
function setBlur(P, on){
  P.blur = on;
  P.stage.frame.classList.toggle('blurred', on);
  const b = $('.rail-btn[data-p=blur]'); if(b) b.classList.toggle('on', on);
  dualNotify('blur');
}
/* ---------- Refresh (v1.76) ----------
   When something stops working mid-lesson (e.g. the pen), reload the whole app and come back on the
   same slide with the same reveals (every slide visited this lesson). Pen marks are saved first, so
   they come back from the data. Tools, timers, blur and zoom start afresh.
   Tap once to arm (the button turns red for 3 s), tap again to refresh.
   The note goes in sessionStorage: this window only, and it survives the reload. Picked up by
   loadAndGo (single screen, or after the Reconnect splash) or by dual.js's init (pupil window).
   Dual screen: the pupil window keeps the note, sends its data to the console, and the console
   saves it and reloads both windows (SVDual.refresh). */
const REFRESH_KEY = 'sv_refresh', REFRESH_TIP = 'Refresh: restart the app on this slide (tap twice)';
function armRefresh(P, b){
  if(P.refreshT){ clearTimeout(P.refreshT); P.refreshT = null; b.classList.remove('armed'); refreshApp(P); return; }
  b.classList.add('armed'); b.title = 'Tap again to refresh';
  P.refreshT = setTimeout(()=>{ P.refreshT = null; b.classList.remove('armed'); b.title = REFRESH_TIP; }, 3000);
}
async function refreshApp(P){
  const note = { at:Date.now(), id:P.l.id, mode:P.mode, pos:P.pos, i:P.order[P.pos], fs:!!document.fullscreenElement,
    revealed:[...P.revealed].map(([k, f])=>[k, [...f]]) };
  try{ sessionStorage.setItem(REFRESH_KEY, JSON.stringify(note)); }catch(e){}
  P.l.lastSlide = P.pos;
  showLoading('Refreshing…');
  if(PUPIL && window.SVDual && SVDual.refresh && SVDual.refresh()) return; // the console saves, then reloads both windows
  await saveNow();
  if(saveStatus==='error'){
    hideLoading();
    if(!(await confirmBox("Couldn't save", "Pen marks since the last save would be lost. Refresh anyway?", 'Refresh', true))){
      try{ sessionStorage.removeItem(REFRESH_KEY); }catch(e){}
      return;
    }
  }
  location.reload();
}
// The note left by refreshApp, if this window was just refreshed (read once).
function takeRefresh(){
  let n = null;
  try{ n = JSON.parse(sessionStorage.getItem(REFRESH_KEY) || 'null'); sessionStorage.removeItem(REFRESH_KEY); }catch(e){}
  return n && Date.now() - n.at < 15*60*1000 && data && data.lessons[n.id] ? n : null; // 15 min: time to tap Reconnect
}
// Back on the slide and reveals in the note.
function applyRefresh(P, n){
  if(!P || !n || P.l.id!==n.id || P.mode!==n.mode) return;
  const at = P.order.indexOf(n.i);
  if(at>=0) P.pos = at;
  P.revealed = new Map((n.revealed || []).map(([k, f])=>[k, new Set(f)]));
  showSlide(P);
}
async function resumeRefresh(){
  const n = takeRefresh(); if(!n) return;
  await openPresenter(n.id, n.pos);
  if(view.name!=='present') return;
  applyRefresh(view.P, n);
  if(n.fs) askFullscreen();
}
// Edge only goes full screen after a tap, so a reload loses it: one tap anywhere puts it back.
function askFullscreen(){
  if(document.fullscreenElement || $('.dual-fs')) return;
  const o = el('div','dual-fs', `<div class="dual-fs-card">${icon('max')}<b>Tap to go full screen</b></div>`);
  o.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); o.remove(); goFullscreen(); }, true);
  document.body.appendChild(o);
}
/* Centre the rail's buttons in the black strip between the slide's edge and the screen's edge.
   Uses the slide's unzoomed size, so zooming doesn't move the buttons. */
// Date/title start at the left edge of where a 16:9 slide sits, so the bar stays put whatever the deck's ratio.
function placeTopBar(P){
  const bar = $('.pbar'), st = P.stage; if(!bar || !st.host) return;
  const h = st.host.getBoundingClientRect(); if(!h.width || !h.height) return;
  const fw = Math.min(h.width, h.height*16/9);
  const left = Math.max(12, Math.round(h.left + (h.width - fw)/2));
  bar.style.paddingLeft = left + 'px';
}
function placeRail(P){
  const rail = $('.rail'), st = P.stage; if(!rail || !st.W || !st._W) return;
  const h = st.host.getBoundingClientRect(), r = rail.getBoundingClientRect();
  const sw = st.W*st.base, sl = h.left + (h.width - sw)/2, sr = sl + sw;
  const left = !!$('.present.rail-left');
  const mid = left ? sl/2 : (sr + innerWidth)/2;
  const dx = Math.round(mid - (r.left + r.width/2));
  rail.style.setProperty('--rail-dx', dx + 'px');
  const pal = $('.palette'); if(pal && !pal.hidden) syncPalette(P);
}
// One palette element: the pen's options or the highlighter's colours, beside the button tapped.
function syncPalette(P){
  const pal = $('.palette'); if(!pal) return;
  const want = P.palette && (P.tool==='pen' || P.tool==='hl') ? P.tool : null;
  if(want && pal.dataset.kind!==want) fillPalette(pal, want);
  pal.hidden = !want;
  if(!want) return;
  placePalette(pal, want);
  if(want==='pen'){
    const t = P.pen, pen = t.kind==='pen';
    $$('.swatch', pal).forEach(s=>s.classList.toggle('on', pen && s.dataset.c===t.color));
    $$('[data-size]', pal).forEach(s=>s.classList.toggle('on', pen && Number(s.dataset.size)===t.w));
    $$('[data-kind=marker]', pal).forEach(s=>s.classList.toggle('on', !pen));
  } else $$('.swatch', pal).forEach(s=>s.classList.toggle('on', s.dataset.hl===P.hlColor));
}
// Centred on the pen or highlighter button, kept on screen.
function placePalette(pal, which){
  const main = $('.present-main'), btn = $(`.present .rail-btn[data-p=${which}]`);
  if(!main || !btn) return;
  const m = main.getBoundingClientRect(), a = btn.getBoundingClientRect();
  const ph = pal.offsetHeight, mid = (a.top + a.bottom)/2 - m.top;
  pal.style.top = Math.max(8, Math.min(m.height - ph - 8, mid - ph/2)) + 'px';
  pal.style.transform = 'none';
  if($('.present.rail-left')){ pal.style.left = (a.right - m.left + 10) + 'px'; pal.style.right = 'auto'; }
  else { pal.style.right = (m.right - a.left + 10) + 'px'; pal.style.left = 'auto'; }
}
const swatchStyle = c => `background:${c}${c==='#FFFFFF' ? ';box-shadow:inset 0 0 0 1px #888' : c==='#111114' ? ';box-shadow:inset 0 0 0 2px #55555F' : ''}`;
function fillPalette(pal, which){
  const rows = [], three = (a, f) => { for(let j=0;j<a.length;j+=3) rows.push(`<div class="row">${a.slice(j,j+3).map(f).join('')}</div>`); };
  if(which==='pen'){
    three(COLORS, c=>`<button class="swatch" data-c="${c}" style="${swatchStyle(c)}" title="Colour"></button>`);
    rows.push(`<div class="row">${penSizes().map(w=>`<button class="pal-btn" data-size="${w}" title="${SIZE_NAMES[SIZES.indexOf(w)]}"><span class="dotsz" style="width:${w+4}px;height:${w+4}px"></span></button>`).join('')}</div>`); // one row (four with Fine)
    rows.push(`<div class="row"><button class="pal-btn" data-kind="marker" title="Permanent marker (black out)" aria-label="Permanent marker (black out)">${icon('marker')}</button><button class="pal-btn" data-tool="undo" title="Undo" aria-label="Undo">${icon('undo')}</button><button class="pal-btn" data-tool="clear" title="Clear this slide (tap twice)" aria-label="Clear this slide (tap twice)">${icon('trash')}</button></div>`);
  } else three(HL_COLORS, c=>`<button class="swatch" data-hl="${c}" style="background:${c}" title="Highlighter colour"></button>`);
  pal.innerHTML = rows.join('');
  pal.dataset.kind = which;
}
// Picking a style closes the palette and keeps the pen / highlighter in hand; undo and clear leave it open.
function buildPalette(P){
  const pal = $('.palette');
  pal.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    const t = P.pen;
    if(b.dataset.c){ t.color = b.dataset.c; t.kind = 'pen'; P.palette = false; }
    else if(b.dataset.size){ t.w = Number(b.dataset.size); t.kind = 'pen'; P.palette = false; }
    else if(b.dataset.kind==='marker'){ t.kind = t.kind==='marker' ? 'pen' : 'marker'; P.palette = false; }
    else if(b.dataset.hl){ P.hlColor = b.dataset.hl; P.palette = false; }
    else if(b.dataset.tool==='undo') P.ink.undo();
    else if(b.dataset.tool==='clear'){
      if(b.classList.contains('warn')){ P.ink.clear(); b.classList.remove('warn'); }
      else { b.classList.add('warn'); setTimeout(()=>b.classList.remove('warn'), 2500); return; }
    }
    applyInk(P);
    syncPalette(P);
  });
}
// End of lesson shows from 5 minutes before the timetabled end (and after it). Lessons with
// no timetabled time, or shown on another day, always have it. (Same rule as the console's.)
function endDue(l, n){
  if(!l || !l.start || !l.end || l.date!==iso(n)) return true;
  const now = n.getHours()*60 + n.getMinutes() + n.getSeconds()/60;
  return now >= toMin(l.end) - 5;
}
// Tap the lesson title in the top bar to rename it. Empty (or the file's name) goes back to the file's name.
function editTitle(P){
  const t = $('.pbar-title'); if(!t || t.querySelector('input')) return;
  const stem = deckStem((P.l.files.pptx || P.l.files.pdf || {}).name);
  const inp = el('input', 'pbar-title-in'); inp.type = 'text'; inp.maxLength = 80;
  inp.value = lessonTitle(P.l); inp.placeholder = stem;
  t.textContent = ''; t.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok=>{
    if(done) return; done = true;
    if(ok){ const v = inp.value.trim(), nv = v===stem ? '' : v; if(nv!==(P.l.title || '')){ P.l.title = nv; saveSoon(); } }
    t.textContent = lessonTitle(P.l);
  };
  inp.onkeydown = e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); finish(true); } else if(e.key==='Escape'){ e.preventDefault(); finish(false); } };
  inp.onblur = ()=>finish(true);
}
function showSlide(P){
  const i = P.order[P.pos];
  P.stage.show(P.v, i, editsOf(P.l, P.mode, i));
  dropDeleted(P.stage, P.l, P.mode, i);
  if(P.ink) P.ink.load((P.l.ink[P.mode][i] || []).slice());
  applyVisibility(P);
  buildOverlay(P);
  const c = $('.counter'); if(c) c.textContent = `${P.pos+1} / ${P.order.length}`;
  const pb = $('[data-p=prev]'), nb = $('[data-p=next]');
  if(pb) pb.disabled = P.pos===0; if(nb) nb.disabled = P.pos===P.order.length-1;
  if(!P.preview && !P.mirror) P.l.lastSlide = P.pos;
}
function flipped(P, i){ if(!P.revealed.has(i)) P.revealed.set(i, new Set()); return P.revealed.get(i); }
function applyVisibility(P){
  const i = P.order[P.pos], cfg = hideCfg(P.l, P.mode, i), f = flipped(P, i);
  for(const [oid, st] of Object.entries(cfg.obj || {})){
    const shown = st==='hide' ? f.has('o'+oid) : !f.has('o'+oid);
    for(const id of revealOids(cfg, oid)){ // v1.63: a group's lead shows / hides all of it
      const e = P.stage.slideEl.querySelector(`[data-oid="${CSS.escape(id)}"]`); if(e) e.classList.toggle('pptx-hidden', !shown);
    }
  }
  if(!P.mirror && view.P===P) dualNotify('reveal');
  $$('.cover', P.stage.scale).forEach(c=>c.remove());
  for(const cv of (cfg.covers || [])){
    if(f.has('c'+cv.id)) continue;
    const d = el('div','cover'); Object.assign(d.style, { left:cv.x+'px', top:cv.y+'px', width:cv.w+'px', height:cv.h+'px', background:cv.color || '#fff' });
    P.stage.scale.appendChild(d);
  }
  if(window.SVAct) SVAct.sync(P); // activity slides: the rows as they are now (their state is in the reveal set)
}
// Where an object's visible content is (slide units). For a plain text box
// that's the text itself, not the whole (often much wider) box.
function objBox(P, oid){
  const e = P.stage.slideEl.querySelector(`[data-oid="${CSS.escape(oid)}"]`);
  const o = (P.stage.objects || []).find(o=>o.oid===oid);
  if(!e || !o) return null;
  const full = { x:o.x, y:o.y, w:Math.max(o.w, 1), h:Math.max(o.h, 1) };
  if(e.querySelector(':scope > svg, img, .pptx-tbl, canvas')) return full;
  const spans = [...e.querySelectorAll('.pptx-tx span')].filter(s=>s.textContent.trim());
  if(!spans.length) return full;
  const sr = P.stage.scale.getBoundingClientRect(), k = P.stage.k;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for(const s of spans) for(const r of s.getClientRects()){ x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom); }
  if(!isFinite(x1)) return full;
  return { x:(x1-sr.left)/k, y:(y1-sr.top)/k, w:(x2-x1)/k, h:(y2-y1)/k };
}
// Reveal / hide button position, in slide units. key: 'o'+oid or 'c'+cover id.
// Default: reveal (hidden at start, cover box) in the middle of the content;
// hide (can hide) just off the content's top-left. cfg.btn[key] = {dx,dy}, set by
// dragging the preview in the editor, is an offset from the object's / box's
// top-left, so the button follows the object when it is moved.
function btnAnchor(stage, cfg, key){ return itemRect(stage, cfg, key); }
function btnPos(stage, cfg, key, isHide){
  const a = btnAnchor(stage, cfg, key); if(!a) return null;
  const off = cfg.btn && cfg.btn[key];
  if(off) return { x:a.x + off.dx, y:a.y + off.dy };
  const box = key[0]==='c' ? a : objBoxAll({ stage }, revealOids(cfg, key.slice(1))); if(!box) return null;
  const k = stage.k;
  return isHide ? { x:box.x - 8/k, y:box.y + 14/k } : { x:box.x + box.w/2, y:box.y + box.h/2 };
}
function buildOverlay(P){
  const ui = P.stage.ui; ui.innerHTML = '';
  const k = P.stage.k, i = P.order[P.pos], cfg = hideCfg(P.l, P.mode, i), f = flipped(P, i);
  const W = P.stage.W*k, H = P.stage.H*k;
  // One-shot buttons: each item gets one button, which disappears once used
  // (keyboard/clicker back undoes it).
  // Hidden at start / cover box: reveal button in the middle of where the content will appear.
  // Shown, can hide: hide button just off the object's top-left corner.
  // A position set in the editor (cfg.btn) overrides these: see btnPos().
  const mk = (key, isHide)=>{
    if(f.has(key)) return; // already used
    const p = btnPos(P.stage, cfg, key, isHide); if(!p) return;
    const b = el('button', 'reveal-btn', icon(isHide ? 'eyeOff' : 'eye'));
    b.title = isHide ? 'Hide' : 'Reveal';
    b.onclick = (e)=>{ e.stopPropagation(); if(P.onReveal){ P.onReveal(key); return; } f.add(key); applyVisibility(P); buildOverlay(P); };
    b.style.left = Math.min(W-22, Math.max(22, p.x*k))+'px'; b.style.top = Math.min(H-22, Math.max(22, p.y*k))+'px';
    ui.appendChild(b);
  };
  for(const [oid, st] of Object.entries(cfg.obj || {})) mk('o'+oid, st==='toggle');
  for(const cv of (cfg.covers || [])) mk('c'+cv.id, false);
  // Tool icons (v1.68): a tap starts the tool (SVTools.launchIcon). Not part of the reveal sequence, so no reveal button.
  for(const o of (P.stage.objects || [])){
    if(o.kind!=='tool' || !o.tool) continue;
    const t = el('button', 'tool-tap');
    Object.assign(t.style, { left:(o.x*k)+'px', top:(o.y*k)+'px', width:(o.w*k)+'px', height:(o.h*k)+'px' });
    t.title = o.name || 'Tool';
    t.onclick = e=>{ e.stopPropagation(); if(!P.mirror && window.SVTools) SVTools.launchIcon(o.tool); };
    ui.appendChild(t);
    // The tile too: a tap from the teacher screen (dual screen) is replayed onto the tile, not onto this button.
    const tile = P.stage.slideEl.querySelector(`[data-oid="${CSS.escape(o.oid)}"]`);
    if(tile){
      tile.toolSpec = o.tool;
      if(!tile.dataset.toolTap){ tile.dataset.toolTap = '1'; tile.addEventListener('click', e=>{ e.stopPropagation(); if(!P.mirror && window.SVTools && tile.toolSpec) SVTools.launchIcon(tile.toolSpec); }); }
    }
  }
  // Video controls (not on the console's copies of the slide)
  if(P.mirror) return;
  const sr = P.stage.scale.getBoundingClientRect();
  for(const ve of $$('[data-video]', P.stage.slideEl)){
    const info = JSON.parse(ve.dataset.video);
    const r = ve.getBoundingClientRect();
    const box = { x:(r.left-sr.left), y:(r.top-sr.top), w:r.width, h:r.height }; // already in screen px
    if(!ve.querySelector('video,iframe')){
      const play = el('button','video-play', `<span class="circle">${icon('play')}</span>`);
      Object.assign(play.style, { left:box.x+'px', top:box.y+'px', width:box.w+'px', height:box.h+'px' });
      play.title = 'Play video';
      play.onclick = (e)=>{ e.stopPropagation(); startVideo(ve, info); buildOverlay(P); };
      ui.appendChild(play);
    }
    if(info.kind==='online'){
      const pop = el('button','video-pop', icon('ext') + 'Open in window');
      pop.style.left = (box.x + 8) + 'px'; pop.style.top = (box.y + 8) + 'px';
      pop.onclick = (e)=>{ e.stopPropagation(); const id = ytId(info.url); window.open(id ? `https://www.youtube.com/watch?v=${id}` : info.url, 'svvideo', 'popup,width=1280,height=760'); };
      ui.appendChild(pop);
    }
  }
}
function startVideo(ve, info){
  if(info.kind==='file'){
    const vid = document.createElement('video'); vid.src = info.url; vid.controls = true; vid.autoplay = true;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;object-fit:contain';
    ve.appendChild(vid);
  } else {
    // Online video is not embedded in version 1: open the link in its own window instead.
    const id = ytId(info.url);
    window.open(id ? `https://www.youtube.com/watch?v=${id}` : info.url, 'svvideo', 'popup,width=1280,height=760');
  }
}
function openGrid(P){
  const ov = el('div','grid-overlay');
  ov.innerHTML = `<button class="rail-btn close" title="Close" aria-label="Close">${icon('x')}</button><div class="grid"></div>`;
  const g = $('.grid', ov);
  P.order.forEach((i, pos)=>{
    const c = el('button','cell' + (pos===P.pos ? ' on' : ''));
    const th = el('div','th'); c.appendChild(th); g.appendChild(c); mountThumb(th, P.v, i, 220, P.l, P.mode);
    c.appendChild(el('span', null, String(pos+1)));
    c.onclick = ()=>{ ov.remove(); P.pos = pos; showSlide(P); };
  });
  $('.close', ov).onclick = ()=>ov.remove();
  document.body.appendChild(ov);
}
// Keyboard / clicker: step through this slide's hidden items first (PowerPoint
// animation order, then slide order, then cover boxes), then change slide.
// The on-screen arrows in the sidebar only ever change slide.
function revealSeq(P, i){ return seqFor(P.v, hideCfg(P.l, P.mode, i), i); }
/* The order the clicker reveals a slide's items in: 'o'+oid / 'c'+cover id.
   Default: PowerPoint animation order, then the deck's other objects, then added objects, then cover boxes;
   a table's cells column by column, top to bottom (v1.53). cfg.order (v1.53, Set reveal order / Earlier / Later)
   puts the items it lists first, in its order; anything it doesn't list follows in the default order. */
function seqFor(v, cfg, i){
  const objs = Object.keys(cfg.obj || {});
  let order = [];
  if(v.type==='pptx' && v.deck){
    const anim = [...v.anims(i).keys()];
    const ids = v.objectIds(i);
    order = anim.filter(id=>objs.includes(id)).concat(ids.filter(id=>objs.includes(id) && !anim.includes(id)));
  }
  order = cellsByColumn(order.concat(objs.filter(id=>!order.includes(id))));
  const def = order.map(id=>'o'+id).concat((cfg.covers || []).map(c=>'c'+c.id));
  if(!Array.isArray(cfg.order) || !cfg.order.length) return def;
  const have = new Set(def), saved = cfg.order.filter(key=>have.has(key)), set = new Set(saved);
  return saved.concat(def.filter(key=>!set.has(key)));
}
// Table cells (n<id>.<row>.<col>) of the same table together, where the first of them was, column by column.
function cellsByColumn(ids){
  const re = /^(n[^.]+)\.(\d+)\.(\d+)$/, groups = new Map();
  for(const id of ids){ const m = re.exec(id); if(m){ if(!groups.has(m[1])) groups.set(m[1], []); groups.get(m[1]).push([id, Number(m[2]), Number(m[3])]); } }
  if(!groups.size) return ids;
  const out = [], done = new Set();
  for(const id of ids){
    const m = re.exec(id);
    if(!m){ out.push(id); continue; }
    if(done.has(m[1])) continue;
    done.add(m[1]);
    out.push(...groups.get(m[1]).sort((a, b)=>a[2] - b[2] || a[1] - b[1]).map(x=>x[0]));
  }
  return out;
}
function step(P, d){
  const i = P.order[P.pos], seq = revealSeq(P, i), f = flipped(P, i);
  if(d > 0){
    const next = seq.find(k=>!f.has(k));
    if(next){ f.add(next); applyVisibility(P); buildOverlay(P); return; }
    if(window.SVAct && SVAct.step(P, 1)) return; // activity slide: reveal the next row
    go(P, 1);
  } else {
    if(window.SVAct && SVAct.step(P, -1)) return;
    const done = [...f].filter(k=>seq.includes(k));
    if(done.length){ f.delete(done[done.length-1]); applyVisibility(P); buildOverlay(P); return; }
    go(P, -1);
  }
}
document.addEventListener('keydown', e=>{
  if(view.name!=='present') return;
  if(e.target.closest && e.target.closest('input,textarea')) return;
  const P = view.P;
  if(['ArrowRight','PageDown',' ','Enter','ArrowDown'].includes(e.key)){ e.preventDefault(); step(P, 1); }
  else if(['ArrowLeft','PageUp','Backspace','ArrowUp'].includes(e.key)){ e.preventDefault(); step(P, -1); }
  else if(e.key==='Home'){ P.pos = 0; showSlide(P); }
  else if(e.key==='End'){ P.pos = P.order.length-1; showSlide(P); }
});

/* ---------- preview (from the editor) ----------
   The slides as they'll be presented, with only the basics: change slide
   (◀ ▶, counter grid, keyboard/clicker stepping through reveals), reveal/hide
   buttons and videos. No pen, blur, tools or top bar readouts. Nothing is
   saved (no pen marks, no lastSlide) and sv:present / sv:leave aren't fired,
   so classroom tools carry on untouched. Opens on the editor's slide. */
function openPreview(E){
  if(E.editing) finishTextEdit(E);
  const v = E.v;
  // Same slides as presenting (hidden ones skipped), plus the editor's slide if it's a hidden one.
  const order = presentOrder(v, E.i);
  const P = { preview:true, l:E.l, mode:E.mode, v, order, pos:Math.max(0, order.indexOf(E.i)), revealed:new Map() };
  view = { name:'preview', P, E };
  const root = el('div', 'present preview' + (data.settings.rail==='left' ? ' rail-left' : ''));
  root.innerHTML = `
    <div class="pv-bar"><span class="pv-tag">${icon('play')}Preview</span><span class="pv-title">${esc(lessonTitle(E.l))}</span></div>
    <div class="present-main">
    <div class="stage-host" id="pvstage"></div>
    <div class="rail">
      <button class="rail-btn small" data-p="close" title="Back to editing (Esc)" aria-label="Back to editing (Esc)">${icon('x')}</button>
      <div class="spacer"></div>
      <button class="rail-btn" data-p="prev" title="Previous slide" aria-label="Previous slide">${icon('left')}</button>
      <button class="rail-btn" data-p="next" title="Next slide" aria-label="Next slide">${icon('right')}</button>
      <div class="rail-gap"></div>
      <button class="counter" data-p="grid" title="All slides"></button>
      <div class="rail-gap"></div>
    </div>
    </div>`;
  document.body.appendChild(root);
  P.root = root;
  P.stage = new Stage($('#pvstage', root), { onePan:()=>true });
  P.stage.onfit = ()=>{ buildOverlay(P); placeRail(P); placePreviewBar(P); };
  root.addEventListener('click', e=>{
    const b = e.target.closest('[data-p]'); if(!b) return;
    const a = b.dataset.p;
    if(a==='close') closePreview(P);
    else if(a==='prev') go(P, -1);
    else if(a==='next') go(P, 1);
    else if(a==='grid') openGrid(P);
  });
  showSlide(P);
}
function closePreview(P){
  if(view.name!=='preview' || view.P!==P) return;
  $$('.grid-overlay').forEach(g=>g.remove());
  P.stage.destroy();
  P.root.remove(); // also stops any video playing on the slide
  view = { name:'edit', E:view.E };
}
// Title lines up with the left edge of a 16:9 slide, as in the presenter's top bar.
function placePreviewBar(P){
  const bar = $('.pv-bar', P.root), st = P.stage; if(!bar || !st.host) return;
  const h = st.host.getBoundingClientRect(); if(!h.width || !h.height) return;
  const fw = Math.min(h.width, h.height*16/9);
  bar.style.paddingLeft = Math.max(12, Math.round(h.left + (h.width - fw)/2)) + 'px';
}
document.addEventListener('keydown', e=>{
  if(view.name!=='preview') return;
  if(e.target.closest && e.target.closest('input,textarea')) return;
  const P = view.P;
  if(e.key==='Escape'){ e.preventDefault(); if($('.grid-overlay')) $$('.grid-overlay').forEach(g=>g.remove()); else closePreview(P); }
  else if(['ArrowRight','PageDown',' ','Enter','ArrowDown'].includes(e.key)){ e.preventDefault(); step(P, 1); }
  else if(['ArrowLeft','PageUp','Backspace','ArrowUp'].includes(e.key)){ e.preventDefault(); step(P, -1); }
  else if(e.key==='Home'){ P.pos = 0; showSlide(P); }
  else if(e.key==='End'){ P.pos = P.order.length-1; showSlide(P); }
});

/* ---------- editor (hide/reveal, delete, move/resize, text) ---------- */
// Everything the editor changes is stored per slide in lesson.hides[mode][i]:
//   obj: { oid: 'hide' | 'toggle' | 'del' }   covers: [{id,x,y,w,h,color}]
//   geo: { oid: {x,y,w,h} }   text: { oid: html }   added: [{id,x,y,w,h,html}]  (data-oid "n<id>")
//   btn: { 'o'+oid | 'c'+coverId: {dx,dy} }  moved reveal/hide button (offset from the object's top-left)
// None of it is written back to the deck file.
// v1.87 (spec §8, §10): cover quick colours. 'match' = the slide's own background colour, the default for new boxes.
const COVER_COLORS = ['match','#A6A6A6','#FFC000','#00B0F0','#000000'];
// The colour of the slide's background right now: Design → Background if set, else what the slide is drawn with (white if it has no plain colour).
function slideBgColour(E){
  const c = cfgOf(E); if(c.bg && /^#[0-9a-f]{6}$/i.test(c.bg)) return c.bg.toUpperCase();
  const root = E.stage && E.stage.slideEl;
  return (root && rgbHex(getComputedStyle(root).backgroundColor) || '#FFFFFF').toUpperCase();
}
// The colour a cover box gets: the chosen quick colour, or the slide's background when 'match' (or nothing) is chosen.
const coverColourFor = (E, col)=>!col || col==='match' ? slideBgColour(E) : col;
// A cover swatch for the ribbon: 'match' shows the slide's colour with a dashed ring.
const coverDot = (E, col, act, on, tip)=>{ const m = col==='match', c = m ? slideBgColour(E) : col;
  return `<button class="rb-dot sm${m ? ' match' : ''}${on ? ' on' : ''}" data-r="${act}" data-v="${col}" style="--c:${c}" data-tip="${m ? 'Match slide background' : tip}" aria-label="${m ? 'Match slide background' : tip + ' ' + col}"></button>`; };
// One shared palette for every colour control (spec §10, provisional): Standard, PowerPoint's ten, black / greys / white / tints, Y7–Y11.
const STD_COLOUR = '#FFF2CC';
const PPT_COLS = ['#C00000','#FF0000','#FFC000','#FFFF00','#92D050','#00B050','#00B0F0','#0070C0','#002060','#7030A0'];
const GREY_COLS = ['#000000','#404040','#7F7F7F','#A6A6A6','#D9D9D9','#FFFFFF','#FFE699','#E2EFDA','#DDEBF7','#FCE4E4'];
// v1.88: the school palette. One grade per year group, plus Amber for anything that isn't tied to a year: [key, name, dark, middle, light].
// Dark = headers, shape outlines, strong accents; middle = shape fill, icons; light = slide backgrounds and soft tints; text on a middle fill is light.
const THEME_COLS = [['7','Year 7 green','#5F7F24','#A8CC52','#F1F7E2'], ['8','Year 8 teal','#07515F','#086F84','#E3F2F5'], ['9','Year 9 burgundy','#78134F','#7A2D52','#F3EDEF'],
  ['10','Year 10 purple','#402347','#61366B','#F0EAF3'], ['11','Year 11 grey','#333333','#404040','#EEEEEE'], ['A','General amber','#8C6516','#D5A12E','#FBF1D8']];
const YEAR_COLS = THEME_COLS.map(t=>[t[0], t[2], t[4], t[1]]); // [key, dark (ink), light (soft), name]: the ribbon's quick swatches
// The lesson's grade: its year group's row, else Amber.
// v1.91: follows the lesson's theme (Design → Themes); 'as imported' falls back to its year.
const themeGrade = E=>{ const k = themeKey(E.l), t = THEME_COLS.find(t=>t[0]===(k==='orig' ? String(yearOf(E.l.label)) : k)) || THEME_COLS[5]; return { d:t[2], m:t[3], l:t[4], k:t[0] }; };
// Saved colours and the last colours used for text, kept on this computer.
const colStore = {
  get(k){ try{ const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a.filter(c=>/^#[0-9a-f]{6}$/i.test(c)) : []; }catch(e){ return []; } },
  put(k, a){ try{ localStorage.setItem(k, JSON.stringify(a)); }catch(e){} },
  push(k, c, max){ c = String(c || '').toUpperCase(); if(!/^#[0-9A-F]{6}$/.test(c)) return; const a = this.get(k).map(x=>x.toUpperCase()).filter(x=>x!==c); a.unshift(c); this.put(k, a.slice(0, max)); },
};
const OBJ_STATES = [['hide','Hidden at start'], ['toggle','Can hide'], ['', 'Normal']];
const TEXT_COLORS = ['#000000','#FFFFFF','#D93A2B','#2F5BEA','#1E9E5A'];
const FONT_STEPS = [8,9,10,10.5,11,12,14,16,18,20,24,28,32,36,40,44,48,54,60,66,72,80,88,96,120,144];
const HANDLES = ['nw','n','ne','e','se','s','sw','w'];
// opts.slide: slide to open on. opts.back: presenter position to return to on Done
// (set when the editor was opened from presentation mode).
// opts.resume: dual-screen console only. Done becomes Resume Presentation and calls resume(E).
// v1.53: each lesson's last editor (lesson id | mode → E), so Undo history survives leaving and coming back.
// Cleared when another computer's changes are read in (syncIn, SVCore.adopt), so Undo can't put back older settings.
const undoKeep = new Map();
async function openEditor(id, opts){
  opts = opts || {};
  const l = data.lessons[id]; if(!l || !l.mode) return;
  showLoading('Opening editor…');
  let v;
  try{ v = await getDeck(l, l.mode); } catch(e){ hideLoading(); toast("Couldn't open the deck: " + e.message, true); if(opts.resume) opts.resume(null); else if(opts.back!=null) openPresenter(id, opts.back, true); return; }
  hideLoading();
  const back = opts.back!=null ? opts.back : null, resume = typeof opts.resume==='function' ? opts.resume : null;
  // opts.slide is a slide key (see slideList). Every slide deleted: open on the first, with deleted slides showing.
  let start = opts.slide!=null && v.has(opts.slide) ? skey(opts.slide) : v.keys[0], showDelSlides = false;
  if(start==null){ start = v.all()[0].k; showDelSlides = true; }
  const E = { l, mode:l.mode, v, i:start, back, resume, onShow:null, sel:null, selCover:null, showDel:false, undo:[], redo:[], editing:null, lastTap:null, co:null,
    selS:new Set([start]), anchorS:start, focus:'slide', multi:false, showDelSlides, thumbs:new Map(), tab:'insert', lastTab:'insert', drawCover:false,
    selO:new Set(), selOi:null, cell:null, cellMode:false, orderMode:null };
  // v1.53: Undo / Redo carry on from the last time this lesson was in the editor (while the app stays open).
  const uk = l.id + '|' + l.mode, prevE = undoKeep.get(uk);
  if(prevE){ E.undo = prevE.undo; E.redo = prevE.redo; }
  undoKeep.set(uk, E);
  view = { name:'edit', E };
  document.body.classList.remove('presenting');
  dualNotify('edit');
  // v1.87: the year group sets the editor's accent colour (see .editor[data-yr] in styles.css). No year in the class label → "Form".
  const yr = edYear(l), lessonName = lessonTitle(l);
  app.innerHTML = `<div class="editor" data-yr="${yr}" data-theme="${edThemeNow()}">
    <div class="ed-top">
      <div class="ed-tl">
        ${resume ? `<button class="ed-done" data-e="done" data-tip="Back to the teacher console (the pupil screen hasn't stopped)">${icon('play')}Resume Presentation</button>`
          : `<button class="ed-done" data-e="done" data-tip="${back!=null ? 'Back to presenting' : 'Back to lessons'}">${icon('tick')}${back!=null ? 'Back to presenting' : 'Done'}</button>`}
        <span class="ed-yr">${yr==='none' ? 'Form' : 'Y' + yr}</span>
        <span class="ed-name" title="${esc(lessonName)}">${esc(lessonName)}</span>
      </div>
      <div class="ed-tabs" id="ed-tabs"></div>
      <div class="ed-tr">
        ${resume ? '<span class="ed-live" id="ed-live"></span>' : ''}
        <button class="ed-tx" data-e="actedit" hidden>${icon('edit')}Edit activity</button>
        <button class="ed-ib" data-e="undo" data-tip="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button>
        <button class="ed-ib" data-e="redo" data-tip="Redo (Ctrl+Y)" aria-label="Redo">${icon('redo')}</button>
        <span class="ed-div" aria-hidden="true"></span>
        <button class="ed-ib" data-e="theme" data-tip="Light or dark: choose how the editor looks" aria-label="Light or dark">${icon(edThemeNow()==='dark' ? 'moon' : 'sun')}</button>
        <button class="ed-ib" data-e="notes" data-tip="My notes: show or hide the PowerPoint notes and your own notes for this slide" aria-label="My notes">${icon('note')}</button>
        ${l.lib ? '' : `<button class="ed-ib" data-e="print" data-tip="Print: this slide (2×2 or single) or the LSA pack" aria-label="Print">${icon('print')}</button>`}
        <button class="ed-ib pv" data-e="preview" data-tip="Preview: see the slides as they'll be presented (reveals and videos only)" aria-label="Preview">${icon('play')}</button>
      </div>
    </div>
    <div class="ribbon" id="ed-rb"></div>
    <div class="ed-main"><div class="ed-thumbs"></div><div class="ed-col"><div class="ed-stage"><div id="estage"></div></div>
      <div class="ed-status" id="ed-hint"></div>
      <button class="ed-nbar" data-e="notes" title="Show or hide the PowerPoint notes and My notes for this slide"><span class="ed-narr">▸</span>Notes</button>
      <div class="ed-notes">
        <div class="ed-ncol"><div class="ed-nlab">PowerPoint notes <span class="ed-nslide"></span></div><div class="ed-ppt"></div></div>
        <div class="ed-ncol"><div class="ed-nlab">My notes <span class="ed-nsub">shown under the PowerPoint notes on the teacher screen; never saved into the deck</span><button class="ed-symb" data-e="symnote" title="Accents and symbols">Àé</button></div><textarea class="ed-my" aria-label="My notes" placeholder="Your own notes for this slide…"></textarea></div>
      </div>
    </div></div>
  </div>`;
  $('.editor').classList.add('no-notes'); // v1.53: notes start minimised every time
  wireTips($('.editor'));
  $('#estage').addEventListener('contextmenu', ev=>objContext(E, ev)); // v1.53: right-click menu
  const ta = $('.ed-my');
  ta.addEventListener('input', ()=>{ setMyNote(E.l, E.mode, E.notesI, ta.value); saveSoon(); });
  // Zoom: two fingers only (one finger moves objects / draws cover boxes).
  // A pinch drops any half-done drag by redrawing the slide.
  E.stage = new Stage($('#estage'), { onGesture:()=>{ if(!E.editing) showEdit(E); } });
  E.stage.onfit = E.stage.onmove = ()=>buildEditOverlay(E);
  // Which side the keyboard (Delete, Ctrl+C / V, arrows) works on: the slide strip or the slide.
  $('.ed-col').addEventListener('pointerdown', ()=>{ if(E.focus!=='slide'){ E.focus = 'slide'; markStrip(E); } }, true);
  $('.ed-stage').addEventListener('pointerdown', e=>greyClick(E, e));
  wireStrip(E);
  wireRibbon(E);
  if(window.SVSbEd) SVSbEd.mount(E); // v1.75: Sentence Builder tab view + sentence clipboard panel
  buildStrip(E);
  $('.editor').addEventListener('click', e=>{
    const b = e.target.closest('[data-e]'); if(!b) return;
    const a = b.dataset.e;
    if(a==='done' && E.tplEdit){ tplLeave(E, ()=>b.click()); return; } // v1.92: a template is being edited
    if(a==='done' && E.resume){ if(E.editing) finishTextEdit(E); E.stage.destroy(); E.resume(E); return; }
    if(a==='done'){ E.stage.destroy(); saveSoon(200); if(E.back!=null) openPresenter(E.l.id, E.back, true); else if(E.l.lib && window.SVLibrary) SVLibrary.backFromEditor(E.l); else renderDashboard(); }
    if(a==='actedit' && window.SVAct){ if(E.editing) finishTextEdit(E); const act = SVAct.curAct(E); if(act) (act.type==='translate' ? SVAct.editText : SVAct.editSentences)(E); }
    if(a==='theme') edThemeMenu(b);
    if(a==='undo') undoEdit(E);
    if(a==='redo') redoEdit(E);
    if(a==='preview') openPreview(E);
    if(a==='print' && window.SVPrint){ if(E.editing) finishTextEdit(E); SVPrint.open(E.l.id, { slide:E.i }); }
    if(a==='notes'){ const hide = !$('.editor').classList.contains('no-notes'); $('.editor').classList.toggle('no-notes', hide); $('.ed-narr').textContent = hide ? '▸' : '▾'; E.stage.fit && E.stage.fit(); }
    if(a==='symnote') symbolPalette(b, txt=>insertIntoField($('.ed-my'), txt));
  });
  showEdit(E);
}
// v1.87: dark tooltips for the title bar and ribbon buttons (data-tip). A fixed chip, so the ribbon's scrolling can't clip it.
// "Name (Ctrl+D)" and "Name: description" show the name on top and the rest in grey underneath.
// v1.87: evens out the left and right padding of buttons that have an icon followed by words or a ▾. Icons carry different amounts of
// empty space inside their own box (a "+" or "x" has more than a rectangle), so the left padding is adjusted by what is actually seen.
function opticalPad(root){
  const btns = [...root.querySelectorAll('.rb-b, .ed-sb')].filter(b=>{ const i = b.firstElementChild; return b.offsetWidth && i && i.matches('svg.ico') && b.querySelector(':scope > .rb-dd, :scope > span:not(.rb-sw)'); });
  for(const b of btns) b.style.paddingLeft = '';
  for(const b of btns){
    const br = b.getBoundingClientRect(), ico = b.firstElementChild;
    let l = Infinity; for(const n of ico.children){ const r = n.getBoundingClientRect(); if(r.width || r.height) l = Math.min(l, r.left); }
    const last = [...b.children].filter(c=>c.matches('.rb-dd, span:not(.rb-sw), em:not(.rb-badge)')).pop(); if(!last || l===Infinity) continue;
    let right = last.getBoundingClientRect().right;
    if(last.matches('span')){ const rg = document.createRange(); rg.selectNodeContents(last); right = rg.getBoundingClientRect().right; }
    const d = (l - br.left) - (br.right - right);
    if(Math.abs(d) > 0.8) b.style.paddingLeft = Math.max(2, parseFloat(getComputedStyle(b).paddingLeft) - d) + 'px';
  }
}
function wireTips(root){
  let tip = null, timer = 0, cur = null;
  const hide = ()=>{ clearTimeout(timer); cur = null; if(tip){ tip.remove(); tip = null; } };
  root.addEventListener('mouseover', e=>{
    const b = e.target.closest('[data-tip]');
    if(b===cur) return;
    hide();
    if(!b || b.disabled && !b.dataset.tip) return;
    cur = b;
    timer = setTimeout(()=>{
      if(!b.isConnected) return;
      const s = b.dataset.tip, a = s.indexOf(': '), p = s.indexOf(' (');
      const cut = a < 0 ? p : p < 0 ? a : Math.min(a, p);
      let name = s, desc = '';
      if(cut > 0){ name = s.slice(0, cut); desc = s.slice(cut + (s[cut]===':' ? 2 : 2)).replace(/\)$/, ''); }
      tip = el('div', 'sv-tip', `<b>${esc(name)}</b>${desc ? `<span>${esc(desc)}</span>` : ''}`);
      document.body.appendChild(tip);
      const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width/2 - w/2));
      const y = r.bottom + 8 + h > innerHeight ? r.top - h - 8 : r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }, 350);
  });
  root.addEventListener('mouseleave', hide);
  root.addEventListener('pointerdown', hide, true);
  root.addEventListener('scroll', hide, true);
}
// v1.87: light / dark for the editor only. 'light', 'dark' or 'auto' (match the computer), kept on this computer.
const edThemePref = ()=>{ try{ const t = localStorage.getItem('sv_editor_theme'); return t==='light' || t==='dark' ? t : 'auto'; }catch(e){ return 'auto'; } };
const edThemeNow = ()=>{ const t = edThemePref(); return t==='auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t; };
function edThemeApply(){
  SVTheme.apply(); // v1.89: one light / dark choice for the whole app
  const ed = document.querySelector('.editor'); if(!ed) return;
  const t = edThemeNow(); ed.dataset.theme = t;
  const b = ed.querySelector('[data-e=theme]'); if(b) b.innerHTML = icon(t==='dark' ? 'moon' : 'sun');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', edThemeApply);
function edThemeMenu(anchor){
  const cur = edThemePref(), set = v=>{ try{ localStorage.setItem('sv_editor_theme', v); }catch(e){} edThemeApply(); };
  openMenu(anchor, [{ head:'Editor look' }, ...[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match my computer']].map(([v, label])=>({ label:(cur===v ? '✓ ' : '  ') + label, run:()=>set(v) }))]);
}
// v1.87: menus, popovers, dialogs and tooltips are added to the page body, outside .editor: give them the editor's year and light / dark so they match (ribbon.css).
new MutationObserver(ms=>{
  const ed = document.querySelector('.editor'); if(!ed) return;
  for(const mu of ms) for(const n of mu.addedNodes) if(n.nodeType===1 && (n.classList.contains('menu') || n.classList.contains('modal-back') || n.classList.contains('sv-tip'))){ n.dataset.yr = ed.dataset.yr; n.dataset.theme = ed.dataset.theme; }
}).observe(document.body, { childList:true });
function cfgOf(E){
  let c = E.l.hides[E.mode][E.i]; if(!c){ c = {}; }
  c.obj = c.obj || {}; c.covers = c.covers || []; c.geo = c.geo || {}; c.text = c.text || {}; c.added = c.added || []; c.btn = c.btn || {}; c.style = c.style || {}; c.groups = c.groups || []; c.crop = c.crop || {};
  return c;
}
function commitCfg(E, c){
  tidyGroupStates(c); // v1.63
  tidyCellSpans(c); // v1.70
  for(const k of ['geo','text','btn','style','crop']) if(!Object.keys(c[k] || {}).length) delete c[k];
  if(c.added && !c.added.length) delete c.added;
  if(c.z && !c.z.length) delete c.z;
  if(!c.bg) delete c.bg;
  // v1.63: groups keep only members that are still there (deleted ones drop out) and need two of them.
  if(c.groups){ c.groups = c.groups.map(g=>({ id:g.id, oids:g.oids.filter(id=>c.obj[id]!=='del' && (id[0]!=='n' || (c.added || []).some(a=>'n'+a.id===id))) })).filter(g=>g.oids.length > 1); if(!c.groups.length) delete c.groups; }
  // v1.53: reveal order keeps only items that still reveal (Hidden at start / Can hide, cover boxes).
  if(c.order){
    c.order = c.order.filter(key=>key[0]==='c' ? c.covers.some(x=>'c' + x.id===key) : ['hide','toggle'].includes(c.obj[key.slice(1)]));
    if(!c.order.length) delete c.order;
  }
  const empty = !Object.keys(c.obj).length && !c.covers.length && !c.geo && !c.text && !c.added && !c.style && !c.crop && !c.z && !c.bg && !c.order && !c.groups;
  if(empty) delete E.l.hides[E.mode][E.i]; else E.l.hides[E.mode][E.i] = c;
  saveSoon();
}
// Every editor change goes through here so it can be undone.
// opts.coalesce: a key; repeats of the same key within 1.5s share one undo step (arrow-key nudges).
// opts.merge: part of the step before it (Set reveal order: one undo step for the whole order).
function change(E, fn, opts={}){
  const now = Date.now();
  const merge = (opts.merge && E.undo.length) || (opts.coalesce && E.co && E.co.key===opts.coalesce && now - E.co.t < 1500);
  if(!merge){
    const cur = E.l.hides[E.mode][E.i];
    E.undo.push({ i:E.i, cfg: cur ? JSON.parse(JSON.stringify(cur)) : null });
    if(E.undo.length > 200) E.undo.shift();
  }
  E.redo = [];
  E.co = opts.coalesce ? { key:opts.coalesce, t:now } : null;
  const c = cfgOf(E); fn(c); commitCfg(E, c);
  refreshEdThumb(E, E.i);
  showEdit(E);
}
// Undo / redo: each step is a slide's settings ({ i, cfg }) or, for slide-strip changes, the slide list with
// every slide's settings and notes ({ slides }). Undoing a step puts the current state on the redo stack.
function snapLike(E, s){
  if(s.slides!=null) return { slides:slideSnap(E), i:E.i, sel:[...E.selS] };
  const cur = E.l.hides[E.mode][s.i];
  return { i:s.i, cfg: cur ? JSON.parse(JSON.stringify(cur)) : null };
}
function applySnap(E, s){
  E.co = null; E.orderMode = null; E.cellMode = false;
  if(s.slides!=null){
    const o = JSON.parse(s.slides);
    if(o.s) E.l.slides = o.s; else E.l.slides = undefined;
    E.l.hides[E.mode] = o.h || {}; E.l.myNotes[E.mode] = o.n || {};
    saveSoon();
    E.i = s.i; E.selS = new Set(s.sel); E.sel = null; E.selCover = null;
    E.thumbs.clear();
    afterSlides(E);
    return;
  }
  if(s.cfg) E.l.hides[E.mode][s.i] = JSON.parse(JSON.stringify(s.cfg)); else delete E.l.hides[E.mode][s.i];
  saveSoon();
  if(E.i!==s.i){ E.sel = null; E.selCover = null; }
  E.i = s.i;
  if(!E.v.ent(E.i)) E.i = E.v.keys[0];
  E.selS = new Set([E.i]);
  refreshEdThumb(E, s.i);
  markStrip(E);
  showEdit(E);
}
function undoEdit(E){
  // v1.52.1: a new box left empty is taken away when typing finishes; that counts as this Undo.
  if(E.editing && finishTextEdit(E)==='dropped') return;
  const s = E.undo.pop(); if(!s){ toast('Nothing to undo'); return; }
  E.redo.push(snapLike(E, s));
  applySnap(E, s);
}
function redoEdit(E){
  if(E.editing) finishTextEdit(E);
  const s = E.redo.pop(); if(!s){ toast('Nothing to redo'); return; }
  E.undo.push(snapLike(E, s));
  applySnap(E, s);
}
function refreshEdThumb(E, i){
  E.thumbs.delete(i);
  const th = $(`.ed-thumb[data-k="${CSS.escape(String(i))}"] .th`); if(!th) return;
  const old = $('.thumb-box', th); if(old) old.remove();
  th.prepend(edThumb(E, i));
}
// The strip's thumbnails are kept per slide key, so rebuilding the strip (after a move) doesn't redraw them all.
function edThumb(E, k){
  let t = E.thumbs.get(k);
  if(!t){ t = thumbEl(E.v, k, 140, E.l, E.mode); E.thumbs.set(k, t); }
  if(!t.isConnected) requestAnimationFrame(()=>{ if(t.isConnected) PPTX.fitText(t); });
  return t;
}
function showEdit(E){
  E.stage.show(E.v, E.i, editsOf(E.l, E.mode, E.i));
  if(E.onShow) E.onShow(E);
  const delHere = deletedIds(E.l, E.mode, E.i);
  if(E.showDel){
    for(const oid of delHere){ const e = E.stage.slideEl.querySelector(`[data-oid="${CSS.escape(oid)}"]`); if(e) e.classList.add('ed-deleted'); }
  } else dropDeleted(E.stage, E.l, E.mode, E.i);
  markStrip(E);
  paintEdNotes(E);
  buildEditOverlay(E);
}
/* Notes under the editor's slide: the deck's own notes (read-only) and the teacher's own notes
   (data.lessons[id].myNotes), shown under the PowerPoint notes on the dual-screen teacher console. */
function paintEdNotes(E){
  const ta = $('.ed-my'); if(!ta) return;
  if(E.notesI===E.i) return; // same slide: leave the box alone while typing
  E.notesI = E.i;
  ta.value = myNote(E.l, E.mode, E.i);
  const p = E.v.pos(E.i);
  $('.ed-nslide').textContent = p>=0 ? '· slide ' + (p + 1) : '· deleted slide';
  const box = $('.ed-ppt'), tok = E.noteTok = (E.noteTok || 0) + 1;
  box.innerHTML = '';
  Promise.resolve(E.v.notes(E.i)).catch(()=>[]).then(paras=>{
    if(E.noteTok!==tok || !box.isConnected) return;
    paras = paras || [];
    box.innerHTML = paras.some(p=>p.text.trim())
      ? paras.map(p=>`<p style="margin-left:${(p.lvl || 0)*16}px">${p.text.trim() ? esc(p.text).replace(/\n/g, '<br>') : '&nbsp;'}</p>`).join('')
      : `<span class="ed-none">${E.v.type==='pdf' ? 'PDF versions have no PowerPoint notes.' : 'No notes in the PowerPoint for this slide.'}</span>`;
  });
}

/* ---------- slide strip: select, rearrange, hide, delete, duplicate, add, copy / paste ----------
   Tap a slide to show it. Ctrl/Shift-click (or Select more on the menu) picks several.
   Drag to move (mouse: straight away; touch: hold, then drag). Right-click or long-press: the menu. */
function buildStrip(E){
  const box = $('.ed-thumbs'); if(!box) return;
  const top = box.scrollTop;
  box.innerHTML = '';
  const v = E.v, all = v.all(), delN = all.filter(e=>e.del).length, pptx = E.mode==='pptx';
  const head = el('div', 'ed-shead');
  // v1.87: strip header in ribbon style: + ▾ (new slide, import, paste, galleries) · "N selected ×" when several are picked · bin with a count badge.
  head.innerHTML = `<button class="ed-sb" data-s="add" data-tip="New slide: new blank, duplicate, paste, import or the Slide Gallery" aria-label="New slide, import or paste">${icon('plus')}<i class="rb-dd" aria-hidden="true">▾</i></button>`
    + `<div class="ed-spick"${E.selS.size>1 || E.multi ? '' : ' hidden'}><span>${E.selS.size} selected</span><button data-s="menu" data-tip="Actions for the selected slides" aria-label="Actions for the selected slides">${icon('more')}</button><button data-s="unpick" data-tip="Clear the selection" aria-label="Clear the selection">${icon('x')}</button></div>`
    + (delN ? `<button class="ed-sb ed-sbin${E.showDelSlides ? ' on' : ''}" data-s="showdel" data-tip="Deleted slides: show them so you can restore them" aria-label="Deleted slides" aria-pressed="${E.showDelSlides ? 'true' : 'false'}">${icon('trash')}<em class="rb-badge">${delN}</em></button>` : '');
  box.appendChild(head);
  let n = 0;
  for(const e of all){
    if(e.del && !E.showDelSlides) continue;
    const k = e.k, hid = !e.del && v.isHidden(k);
    if(!e.del) n++;
    const b = el('button', 'ed-thumb' + (hid ? ' skip' : '') + (e.del ? ' gone' : ''));
    b.dataset.k = String(k);
    b.innerHTML = `<span class="n">${e.del ? '' : n}</span>`;
    const th = el('div','th'); b.appendChild(th);
    if(hid) th.appendChild(el('span', 'ed-ttag', icon('eyeOff') + 'Hidden'));
    if(e.del) th.appendChild(el('span', 'ed-ttag del', icon('trash') + 'Deleted'));
    b.title = e.del ? 'Deleted slide: right-click or long-press to restore it' : hid ? 'Hidden slide: skipped when presenting' : '';
    th.prepend(edThumb(E, k));
    box.appendChild(b);
  }
  box.scrollTop = top;
  opticalPad(head);
  fitStripThumbs(box);
  markStrip(E);
}
// v1.69: strip thumbnails are drawn 140px wide; scale them (CSS zoom, --thz) to the width the strip really has,
// so its scrollbar no longer cuts off their right-hand side.
function fitStripThumbs(box){
  if(!box) return;
  if(!box._ro && window.ResizeObserver){ box._ro = new ResizeObserver(()=>fitStripThumbs(box)); box._ro.observe(box); }
  const th = box.querySelector('.ed-thumb .th'); if(!th || !th.clientWidth) return;
  const z = Math.min(1.5, th.clientWidth / 140).toFixed(3);
  if(box.style.getPropertyValue('--thz')!==z) box.style.setProperty('--thz', z);
}
function markStrip(E){
  const box = $('.ed-thumbs'); if(!box) return;
  box.classList.toggle('focus', E.focus==='slides');
  $$('.ed-thumb', box).forEach(b=>{
    const k = skey(b.dataset.k);
    b.classList.toggle('on', k===E.i);
    b.classList.toggle('picked', E.selS.has(k) && (E.selS.size > 1 || E.multi));
  });
  const pick = $('.ed-spick', box);
  if(pick){ pick.hidden = !(E.selS.size > 1 || E.multi); $('span', pick).textContent = `${E.selS.size} selected`; }
  const on = $('.ed-thumb.on', box); if(on && !E.dragging) on.scrollIntoView({ block:'nearest' });
  if(E.stage && E.stage.slideEl) renderRibbon(E);
}
// The selected slides in strip order (just the current slide if nothing else is picked).
function selKeys(E){ const ks = E.v.all().map(e=>e.k).filter(k=>E.selS.has(k)); return ks.length ? ks : [E.i]; }
function shownKeys(E){ return E.v.all().filter(e=>!e.del || E.showDelSlides).map(e=>e.k); }
function pickSlide(E, k, mods){
  mods = mods || {};
  if(E.editing) finishTextEdit(E);
  E.focus = 'slides';
  if(mods.shift && E.anchorS!=null){
    const ks = shownKeys(E), a = ks.indexOf(E.anchorS), b = ks.indexOf(k);
    if(a>=0 && b>=0) E.selS = new Set(ks.slice(Math.min(a, b), Math.max(a, b) + 1));
  } else if(mods.ctrl || E.multi){
    if(E.selS.has(k) && E.selS.size > 1){ E.selS.delete(k); if(E.i===k) k = [...E.selS][0]; }
    else E.selS.add(k);
    E.anchorS = k;
  } else { E.selS = new Set([k]); E.anchorS = k; }
  // v1.52.1: picking from the strip lets go of anything selected on the slide (as PowerPoint), so the keyboard
  // never works on the strip while an object still looks selected.
  let had = E.sel || E.selCover || E.selO.size || E.cell;
  E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; clearMulti(E); E.cellMode = false;
  if(E.orderMode){ E.orderMode = null; had = true; }
  if(E.i!==k){ E.i = k; showEdit(E); }
  else if(had){ markStrip(E); buildEditOverlay(E); }
  else markStrip(E);
}
function wireStrip(E){
  const box = $('.ed-thumbs');
  let g = null;
  const end = ()=>{ if(!g) return; clearTimeout(g.t); if(g.b) g.b.classList.remove('armed'); if(g.drag) endSlideDrag(E, g, false); g = null; };
  box.addEventListener('pointerdown', ev=>{
    if(ev.button > 0) return;
    const hb = ev.target.closest('[data-s]');
    if(hb){ ev.preventDefault(); stripHeadAction(E, hb); return; }
    const b = ev.target.closest('.ed-thumb'); if(!b) return;
    end();
    g = { b, k:skey(b.dataset.k), id:ev.pointerId, x:ev.clientX, y:ev.clientY, touch:ev.pointerType!=='mouse', armed:false, drag:null,
      mods:{ ctrl:ev.ctrlKey || ev.metaKey, shift:ev.shiftKey } };
    if(g.touch) g.t = setTimeout(()=>{ if(!g || g.drag) return; g.armed = true; b.classList.add('armed'); try{ navigator.vibrate && navigator.vibrate(15); }catch(e){} }, 450);
  });
  // Once a touch is holding a slide, the strip mustn't scroll under the finger.
  box.addEventListener('touchmove', ev=>{ if(g && (g.armed || g.drag)) ev.preventDefault(); }, { passive:false });
  box.addEventListener('pointermove', ev=>{
    if(!g || ev.pointerId!==g.id) return;
    const d = Math.hypot(ev.clientX - g.x, ev.clientY - g.y);
    if(!g.drag){
      if(g.touch && !g.armed){ if(d > 8) end(); return; } // a scroll
      if(d < 6) return;
      const e = E.v.ent(g.k); if(!e || e.del) return;
      startSlideDrag(E, g, box);
    }
    moveSlideDrag(E, g, ev, box);
  });
  box.addEventListener('pointerup', ev=>{
    if(!g || ev.pointerId!==g.id) return;
    const was = g; clearTimeout(was.t); was.b.classList.remove('armed'); g = null;
    if(was.drag){ endSlideDrag(E, was, true); return; }
    if(was.armed){ if(!E.selS.has(was.k)) pickSlide(E, was.k); slideMenu(E, was.b); return; }
    pickSlide(E, was.k, was.mods);
  });
  box.addEventListener('pointercancel', end);
  box.addEventListener('contextmenu', ev=>{
    ev.preventDefault();
    if(ev.pointerType==='touch' || ev.pointerType==='pen') return; // long-press is handled above
    const b = ev.target.closest('.ed-thumb'); if(!b) return;
    const k = skey(b.dataset.k);
    if(!E.selS.has(k)) pickSlide(E, k); else { E.focus = 'slides'; markStrip(E); }
    slideMenu(E, b, ev);
  });
}
function stripHeadAction(E, b){
  const a = b.dataset.s;
  if(a==='add') addSlideMenu(E, b);
  if(a==='showdel'){ E.showDelSlides = !E.showDelSlides; if(!E.showDelSlides && E.v.ent(E.i) && E.v.ent(E.i).del){ E.i = E.v.keys[0]; E.selS = new Set([E.i]); } buildStrip(E); showEdit(E); }
  if(a==='menu') slideMenu(E, b);
  if(a==='unpick'){ E.multi = false; E.selS = new Set([E.i]); markStrip(E); }
}
function startSlideDrag(E, g, box){
  if(!E.selS.has(g.k)) pickSlide(E, g.k);
  const keys = selKeys(E).filter(k=>{ const e = E.v.ent(k); return e && !e.del; });
  const ghost = el('div', 'ed-ghost');
  const t = g.b.querySelector('.thumb-box'); if(t){ const c = t.cloneNode(true); ghost.appendChild(c); }
  if(keys.length > 1) ghost.appendChild(el('span', 'ed-gcount', String(keys.length)));
  document.body.appendChild(ghost);
  const ind = el('div', 'ed-drop'); box.appendChild(ind);
  try{ box.setPointerCapture(g.id); }catch(e){}
  g.drag = { keys, ghost, ind, before:undefined };
  E.dragging = true;
  $$('.ed-thumb', box).forEach(b=>b.classList.toggle('moving', keys.includes(skey(b.dataset.k))));
}
function moveSlideDrag(E, g, ev, box){
  const d = g.drag; if(!d) return;
  d.ghost.style.left = (ev.clientX + 12) + 'px'; d.ghost.style.top = (ev.clientY - 20) + 'px';
  const br = box.getBoundingClientRect();
  // Scroll the strip when dragging near its top or bottom.
  if(ev.clientY < br.top + 50) box.scrollTop -= 14; else if(ev.clientY > br.bottom - 50) box.scrollTop += 14;
  const thumbs = $$('.ed-thumb', box);
  let before = null, ref = null;
  for(const b of thumbs){ const r = b.getBoundingClientRect(); if(ev.clientY < r.top + r.height/2){ before = skey(b.dataset.k); ref = b; break; } }
  d.before = before;
  const last = thumbs[thumbs.length - 1];
  const y = ref ? ref.offsetTop - 6 : (last ? last.offsetTop + last.offsetHeight + 4 : 0);
  d.ind.style.top = y + 'px';
}
function endSlideDrag(E, g, drop){
  const d = g.drag; if(!d) return;
  d.ghost.remove(); d.ind.remove(); E.dragging = false;
  $$('.ed-thumb.moving').forEach(b=>b.classList.remove('moving'));
  if(!drop || d.before===undefined) return;
  moveSlidesTo(E, d.keys, d.before);
}
// Move keys (in their order) to just before slide `before` (null = the end).
function moveSlidesTo(E, keys, before){
  const ks = new Set(keys);
  const cur = E.v.all().map(e=>e.k);
  const rest = cur.filter(k=>!ks.has(k));
  while(before!=null && ks.has(before)){ const i = cur.indexOf(before); before = i>=0 && i < cur.length-1 ? cur[i+1] : null; }
  const at = before==null ? rest.length : rest.indexOf(before);
  const next = rest.slice(0, at).concat(keys, rest.slice(at));
  if(next.join('\n')===cur.join('\n')) return;
  slideOp(E, list=>{
    const byK = new Map(list.map(e=>[e.k, e]));
    const extra = list.filter(e=>!next.includes(e.k)); // entries the view skips (shouldn't happen) stay at the end
    list.splice(0, list.length, ...next.map(k=>byK.get(k)).filter(Boolean), ...extra);
  });
}
function slideSnap(E){ const l = E.l; return JSON.stringify({ s:l.slides || null, h:l.hides[E.mode] || {}, n:l.myNotes[E.mode] || {} }); }
// Every change to the slide list goes through here (one undo step each). fn(list) changes the list in place.
function slideOp(E, fn){
  if(E.editing) finishTextEdit(E);
  E.undo.push({ slides:slideSnap(E), i:E.i, sel:[...E.selS] });
  if(E.undo.length > 200) E.undo.shift();
  E.redo = [];
  E.co = null;
  const list = ownList(E.l, E.mode, E.v);
  const r = fn(list);
  tidyList(E.l, E.mode, E.v.base.count);
  saveSoon();
  afterSlides(E);
  return r;
}
// Back to "no list" when it's the deck's own order with nothing changed.
function tidyList(l, mode, n){
  const s = l.slides && l.slides[mode]; if(!s) return;
  const plain = s.length===n && s.every((e, i)=>e.k===i && !e.src && e.hid==null && !e.del && Object.keys(e).length===1);
  if(plain){ delete l.slides[mode]; if(!Object.keys(l.slides).length) l.slides = undefined; }
}
function afterSlides(E){
  const e = E.v.ent(E.i);
  if(!e || (e.del && !E.showDelSlides)){
    const keys = E.v.keys;
    E.i = keys.length ? keys[0] : (E.v.all()[0] || {}).k;
    E.sel = null; E.selCover = null;
  }
  E.selS = new Set([...E.selS].filter(k=>E.v.ent(k) && (E.showDelSlides || !E.v.ent(k).del)));
  if(!E.selS.size) E.selS.add(E.i);
  buildStrip(E);
  showEdit(E);
  dualNotify('slides');
}
function copySlideData(l, mode, from, to){
  const c = l.hides[mode][from]; if(c) l.hides[mode][to] = JSON.parse(JSON.stringify(c));
  const n = myNote(l, mode, from); if(n) setMyNote(l, mode, to, n);
}
function liveSel(E){ return selKeys(E).filter(k=>{ const e = E.v.ent(k); return e && !e.del; }); }
function dupSlides(E){
  const ks = liveSel(E); if(!ks.length) return;
  slideOp(E, list=>{
    const made = [];
    const ins = ks.map(k=>{
      const e = list.find(x=>x.k===k), nk = newSlideKey(E.l);
      const ne = { k:nk, src: e.src ? JSON.parse(JSON.stringify(e.src)) : { i:e.k } };
      if(E.v.isHidden(k)) ne.hid = true;
      copySlideData(E.l, E.mode, k, nk); made.push(nk);
      return ne;
    });
    const at = list.findIndex(x=>x.k===ks[ks.length - 1]);
    list.splice(at + 1, 0, ...ins);
    E.i = made[0]; E.selS = new Set(made); E.anchorS = made[0]; E.sel = null; E.selCover = null;
  });
  toast(ks.length > 1 ? `${ks.length} slides duplicated` : 'Slide duplicated');
}
function insertSlides(E, entries, after){
  slideOp(E, list=>{
    let at = list.findIndex(x=>x.k===(after!==undefined ? after : E.i));
    at = at < 0 ? list.length : at + 1;
    list.splice(at, 0, ...entries);
    const ks = entries.map(e=>e.k);
    E.i = ks[0]; E.selS = new Set(ks); E.anchorS = ks[0]; E.sel = null; E.selCover = null;
  });
}
function blankSlide(E){
  if(E.mode!=='pptx') return;
  const k = newSlideKey(E.l);
  insertSlides(E, [{ k, src:{ blank:true } }]);
  // v1.88: a new blank slide starts on the lesson's light colour (Design → Background → Deck's own puts the deck's back).
  const hides = E.l.hides[E.mode];
  // The default layout (from the Year 9 Test deck's template slide): a bold 36 title in the lesson's dark colour and a 24 body text box beneath it.
  const W = E.v.base.size().w + 2*(E.v.dx(k) || 0), Hh = E.v.base.size().h, g = themeGrade(E);
  const box = (text, o)=>({ id:uid(), x:14, y:o.y, w:Math.round((W - 28)*10)/10, h:o.h,
    html:window.PPTX.newTextHtml('Arial', o.fmt).replace('>​</span>', '>​' + esc(text) + '</span>') });
  const added = [ box('Insert title here', { y:14, h:52, fmt:{ size:36, bold:true, color:g.d } }), box('Insert main body text here', { y:66, h:Math.round((Hh - 78)*10)/10, fmt:{ size:24 } }) ];
  hides[k] = Object.assign(hides[k] || { obj:{}, covers:[] }, { bg:g.l, added });
  E.thumbs.clear(); saveSoon(); buildStrip(E); showEdit(E);
}
function hideSlides(E, on){
  const ks = liveSel(E); if(!ks.length) return;
  if(on==null) on = !ks.every(k=>E.v.isHidden(k));
  slideOp(E, list=>{
    for(const k of ks){
      const e = list.find(x=>x.k===k); if(!e) continue;
      const def = e.src ? false : E.v.base.isHidden(e.k);
      if(on===def) delete e.hid; else e.hid = on;
    }
  });
  toast(on ? (ks.length > 1 ? `${ks.length} slides hidden: skipped when presenting` : 'Slide hidden: skipped when presenting') : (ks.length > 1 ? `${ks.length} slides shown again` : 'Slide shown again'));
}
function deleteSlides(E){
  const ks = liveSel(E); if(!ks.length) return;
  const live = E.v.keys;
  if(live.length - ks.length < 1){ toast('A lesson needs at least one slide.', true); return; }
  // Next slide to show: the first one after the deleted ones, else the one before.
  const lastAt = live.indexOf(ks[ks.length - 1]), firstAt = live.indexOf(ks[0]);
  const next = live.slice(lastAt + 1).find(k=>!ks.includes(k)) ?? live.slice(0, firstAt).reverse().find(k=>!ks.includes(k));
  slideOp(E, list=>{
    for(const k of ks){ const e = list.find(x=>x.k===k); if(e) e.del = true; }
    if(!E.showDelSlides){ E.i = next; E.selS = new Set([next]); E.anchorS = next; E.sel = null; E.selCover = null; }
  });
  toast((ks.length > 1 ? `${ks.length} slides deleted` : 'Slide deleted') + ' · Undo or Ctrl+Z to bring it back');
}
function restoreSlides(E){
  const ks = selKeys(E).filter(k=>{ const e = E.v.ent(k); return e && e.del; }); if(!ks.length) return;
  slideOp(E, list=>{ for(const k of ks){ const e = list.find(x=>x.k===k); if(e) delete e.del; } });
  toast(ks.length > 1 ? `${ks.length} slides restored` : 'Slide restored');
}
function nudgeSlides(E, d){
  const ks = liveSel(E); if(!ks.length) return;
  const live = E.v.keys;
  if(d < 0){ const i = live.indexOf(ks[0]); if(i <= 0) return; moveSlidesTo(E, ks, live[i - 1]); }
  else { const i = live.indexOf(ks[ks.length - 1]); if(i < 0 || i >= live.length - 1) return; moveSlidesTo(E, ks, i + 2 < live.length ? live[i + 2] : null); }
}
function slideMenu(E, anchor){
  const ks = selKeys(E), ents = ks.map(k=>E.v.ent(k)).filter(Boolean), n = ks.length, what = n > 1 ? `${n} slides` : 'slide';
  const pptx = E.mode==='pptx', clip = readClip();
  if(ents.some(e=>e.del)){ openMenu(anchor, [{ label:`Restore ${what}`, run:()=>restoreSlides(E) }]); return; }
  const allHid = ks.every(k=>E.v.isHidden(k));
  const items = [
    { head: n > 1 ? `${n} slides` : 'Slide' },
    { label:`Duplicate ${what}   Ctrl+D`, run:()=>dupSlides(E) },
    { label:`Copy ${what}   Ctrl+C`, run:()=>copySlides(E) },
  ];
  if(clip && clip.kind==='slides') items.push({ label:`Paste ${clip.items.length > 1 ? clip.items.length + ' slides' : 'slide'} after`, run:()=>pasteSlides(E, clip) });
  items.push('-',
    { label: allHid ? `Show ${what} when presenting` : `Hide ${what} (skip when presenting)`, run:()=>hideSlides(E, !allHid) },
    { label:'Move up   Ctrl+↑', run:()=>nudgeSlides(E, -1) },
    { label:'Move down   Ctrl+↓', run:()=>nudgeSlides(E, 1) });
  if(pptx) items.push({ label:'New blank slide after', run:()=>blankSlide(E) }, { label:`Save ${what} to Slide Gallery…`, run:()=>saveSlidesToGallery(E) });
  items.push({ label: E.multi ? 'Stop selecting more' : 'Select more slides…', run:()=>{ E.multi = !E.multi; if(!E.multi) E.selS = new Set([E.i]); markStrip(E); if(E.multi) toast('Tap slides to add or remove them'); } });
  items.push('-', { label:`Delete ${what}   Del`, danger:true, run:()=>deleteSlides(E) });
  openMenu(anchor, items);
}
function addSlideMenu(E, anchor){
  const pptx = E.mode==='pptx', clip = readClip();
  const items = [];
  if(pptx) items.push({ label:'New blank slide', run:()=>blankSlide(E) });
  items.push({ label:'Duplicate this slide', run:()=>{ E.selS = new Set([E.i]); dupSlides(E); } });
  if(clip && clip.kind==='slides') items.push({ label:`Paste ${clip.items.length > 1 ? clip.items.length + ' copied slides' : 'copied slide'}`, run:()=>pasteSlides(E, clip) });
  if(pptx){
    items.push('-', { label:'Import slides from a PowerPoint…', run:()=>importSlides(E) });
    items.push({ label:'Paste from another program', run:()=>pasteFromSystem(E, 'slides') });
    items.push('-', { label:'Open Slide Gallery', run:()=>toggleGallery(E, 'slides') });
    items.push({ label:'Save this slide to the Slide Gallery…', run:()=>{ E.selS = E.selS.size ? E.selS : new Set([E.i]); saveSlidesToGallery(E); } });
  }
  openMenu(anchor, items);
}

/* ---------- copy / paste between lessons (in-app clipboard) ----------
   Copying puts the slides (or objects) in localStorage 'sv_clip', so they can be pasted into any
   lesson's editor on this computer, and a marker line on the system clipboard. On paste, the
   marker means "use the app's copy"; anything else on the clipboard (a picture, text) is pasted
   from the other program instead. */
const CLIP_KEY = 'sv_clip';
function readClip(){ try{ const c = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); return c && Array.isArray(c.items) && c.items.length ? c : null; }catch(e){ return null; } }
function writeClip(c, ev){
  c.id = uid(); c.t = Date.now();
  try{ localStorage.setItem(CLIP_KEY, JSON.stringify(c)); }catch(e){ toast("Couldn't copy: too big to keep.", true); return false; }
  const mark = `[Slideshow Viewer ${c.kind} #${c.id}]`;
  if(ev && ev.clipboardData){ ev.clipboardData.setData('text/plain', mark); ev.preventDefault(); }
  else { try{ navigator.clipboard.writeText(mark).catch(()=>{}); }catch(e){} }
  return true;
}
function clipMarker(text){ const m = /^\[Slideshow Viewer (slides|objects) #(\w+)\]$/.exec(String(text || '').trim()); return m ? m[2] : null; }
function copySlides(E, ev){
  const ks = liveSel(E); if(!ks.length) return;
  const items = ks.map(k=>({
    from: E.v.origin(k), hid: E.v.isHidden(k) || undefined, dx: E.v.dx(k) || undefined,
    cfg: E.l.hides[E.mode][k] ? JSON.parse(JSON.stringify(E.l.hides[E.mode][k])) : null,
    note: myNote(E.l, E.mode, k) || undefined,
  }));
  if(writeClip({ kind:'slides', mode:E.mode, lesson:E.l.id, items }, ev)){ toast(ks.length > 1 ? `${ks.length} slides copied` : 'Slide copied'); renderRibbon(E); }
}
// A copy of another lesson's deck, kept in the Lessons folder for its slides ('Shared - <deck name>').
// Never deleted with a lesson.
async function shareDeck(p){
  const name = p.split('/').pop();
  if(name.startsWith(SHARED_PREFIX)) return p;
  const file = await store.readDeck(p);
  const plain = name.replace(/^\d{4}-\d{2}-\d{2} \S+ .+? - /, '');
  let n = safeName(SHARED_PREFIX + plain), k = 2;
  const dot = n.lastIndexOf('.'), stem = n.slice(0, dot), ext = n.slice(dot);
  while(await store.exists(n)){
    try{ const f = await store.readDeck(LESSONS_DIR + '/' + n); if(f.size===file.size) return LESSONS_DIR + '/' + n; }catch(e){}
    n = `${stem} (${k++})${ext}`;
  }
  const out = await store.writeDeck(n, file);
  return out;
}
// opts.before: put them before this slide key (null = at the end; leave out = after the current slide).
// opts.keepLook: blank slides keep the style of the deck they came from (Slide Gallery). opts.msg: the toast.
async function pasteSlides(E, clip, opts){
  opts = opts || {};
  if(!clip || clip.kind!=='slides') return;
  const own = E.l.files[E.mode] && E.l.files[E.mode].path;
  if(E.mode!=='pptx' && clip.items.some(it=>!it.from || it.from.blank || it.from.f!==own)){ toast('Only slides from this PDF can be pasted into a PDF version.', true); return; }
  if(E.mode==='pptx' && clip.mode==='pdf'){ toast("Slides from a PDF version can't be pasted into a PowerPoint.", true); return; }
  showLoading('Pasting…');
  const entries = [];
  try{
    const shared = new Map();
    for(const it of clip.items){
      const f = it.from; if(!f) continue;
      const e = { k:newSlideKey(E.l) };
      if(f.blank && opts.keepLook && f.look && f.look!==own){
        if(!shared.has(f.look)){ const p = await shareDeck(f.look); shared.set(f.look, p); E.v.extra.set(p, await loadDeckFile(p, 'pptx', themeKey(E.l))); }
        e.src = { blank:true, f:shared.get(f.look) };
      }
      else if(f.blank) e.src = { blank:true };
      else if(f.f===own) e.src = { i:f.i };
      else {
        if(!shared.has(f.f)){ const p = await shareDeck(f.f); shared.set(f.f, p); E.v.extra.set(p, await loadDeckFile(p, 'pptx', themeKey(E.l))); }
        e.src = { f:shared.get(f.f), i:f.i };
      }
      if(f.act && e.src && e.src.blank) e.src.act = JSON.parse(JSON.stringify(f.act)); // an activity slide (activities.js)
      if(it.hid) e.hid = true;
      entries.push({ e, it });
    }
    await E.v.sync();
  }catch(err){ hideLoading(); console.error(err); toast("Couldn't paste: the copied slides' deck isn't in the Lessons folder any more.", true); return; }
  hideLoading();
  if(!entries.length) return;
  slideOp(E, list=>{
    let at;
    if('before' in opts){ at = opts.before==null ? -1 : list.findIndex(x=>x.k===opts.before); if(at < 0) at = list.length; }
    else { at = list.findIndex(x=>x.k===E.i); at = at < 0 ? list.length : at + 1; }
    list.splice(at, 0, ...entries.map(x=>x.e));
    for(const { e, it } of entries){
      if(it.cfg){ E.l.hides[E.mode][e.k] = JSON.parse(JSON.stringify(it.cfg)); const d = E.v.dx(e.k) - (it.dx || 0); if(Math.abs(d) > 0.01) shiftSlideData(E.l.hides[E.mode][e.k], null, d); } // slide sizes differ
      if(it.note) setMyNote(E.l, E.mode, e.k, it.note);
    }
    const ks = entries.map(x=>x.e.k);
    E.i = ks[0]; E.selS = new Set(ks); E.anchorS = ks[0]; E.sel = null; E.selCover = null;
  });
  toast(opts.msg || (entries.length > 1 ? `${entries.length} slides pasted` : 'Slide pasted'));
}
function objEl(E, oid){ return E.stage.slideEl.querySelector(`[data-oid="${CSS.escape(oid)}"]`); }
function hasText(E, oid){ const e = objEl(E, oid); return !!(e && e.querySelector(':scope > .pptx-tx')); }
function deleteSel(E){
  const oid = E.sel; if(!oid) return;
  if(!E.showDel) E.sel = null;
  change(E, c=>{ groupsDrop(c, [oid]); c.obj[oid] = 'del'; });
  toast('Object deleted · Undo or Ctrl+Z to bring it back');
}

/* Drag to move or resize. rect is in slide units; kind is 'move' or a handle (n, ne, e, …).
   lock: corner handles keep the proportions. live(r) while dragging; done(r) at the end (null = it was a tap).
   skip (v1.53): the keys being dragged (oids, 'c'+cover id), left out of the snap targets. Alt turns snapping off. */
function dragRect(E, e, rect, kind, lock, live, done, skip){
  e.preventDefault(); e.stopPropagation();
  const k = E.stage.k, sx = e.clientX, sy = e.clientY, tgt = e.currentTarget;
  let moved = false, targets = null;
  try{ tgt.setPointerCapture(e.pointerId); }catch(_){}
  const MIN = 8;
  const calc = (ev)=>{
    const corner = (lock || ev.ctrlKey || ev.metaKey) && kind.length===2; // Ctrl while dragging a corner keeps the proportions
    const dx = (ev.clientX - sx)/k, dy = (ev.clientY - sy)/k;
    let { x, y, w, h } = rect;
    let lines = [];
    if(kind==='move'){
      x = rect.x + dx; y = rect.y + dy;
      if(!ev.altKey){ targets = targets || snapTargets(E, skip); const s = snapMove(x, y, w, h, targets, k); x = s.x; y = s.y; lines = s.lines; }
      // Keep at least a little of the object on the slide so it can't get lost.
      const W = E.stage.W, H = E.stage.H, keep = 20;
      x = Math.min(W - keep, Math.max(keep - rect.w, x)); y = Math.min(H - keep, Math.max(keep - rect.h, y));
    }
    else {
      if(kind.includes('e')) w = rect.w + dx;
      if(kind.includes('s')) h = rect.h + dy;
      if(kind.includes('w')) w = rect.w - dx;
      if(kind.includes('n')) h = rect.h - dy;
      // Snap the edges being dragged (not when a corner keeps the proportions).
      if(!corner && !ev.altKey){
        targets = targets || snapTargets(E, skip);
        const T = SNAP_PX/k;
        if(kind.includes('e')){ const p = nearest(rect.x + w, targets.xs, T); if(p!=null){ w = p - rect.x; lines.push(['v', p]); } }
        if(kind.includes('w')){ const p = nearest(rect.x + rect.w - w, targets.xs, T); if(p!=null){ w = rect.x + rect.w - p; lines.push(['v', p]); } }
        if(kind.includes('s')){ const p = nearest(rect.y + h, targets.ys, T); if(p!=null){ h = p - rect.y; lines.push(['h', p]); } }
        if(kind.includes('n')){ const p = nearest(rect.y + rect.h - h, targets.ys, T); if(p!=null){ h = rect.y + rect.h - p; lines.push(['h', p]); } }
      }
      w = Math.max(MIN, w); h = Math.max(MIN, h);
      if(corner && rect.w > 0 && rect.h > 0){
        const ar = rect.w / rect.h;
        if(w / rect.w > h / rect.h) h = w / ar; else w = h * ar;
      }
      if(kind.includes('w')) x = rect.x + rect.w - w;
      if(kind.includes('n')) y = rect.y + rect.h - h;
    }
    showGuides(E, lines);
    const r1 = v=>Math.round(v*10)/10;
    return { x:r1(x), y:r1(y), w:r1(w), h:r1(h) };
  };
  const mv = ev=>{ if(!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; moved = true; live(calc(ev)); };
  const up = ev=>{
    tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up);
    const r = moved && ev.type==='pointerup' ? calc(ev) : null;
    showGuides(E, []);
    done(r);
  };
  tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
}
/* ---------- snap guides (v1.53) ----------
   While dragging, edges and centres snap to the slide's edges and centre lines and to the other objects' and
   cover boxes' edges and centres, within SNAP_PX screen pixels. A thin line shows what it snapped to. */
const SNAP_PX = 6;
function snapTargets(E, skip){
  const st = E.stage, c = cfgOf(E), xs = [0, st.W/2, st.W], ys = [0, st.H/2, st.H];
  const add = r=>{ xs.push(r.x, r.x + r.w/2, r.x + r.w); ys.push(r.y, r.y + r.h/2, r.y + r.h); };
  for(const o of (st.objects || [])) if(!o.cell && c.obj[o.oid]!=='del' && !(skip && skip.has(o.oid))) add(o);
  for(const cv of c.covers) if(!(skip && skip.has('c' + cv.id))) add(cv);
  return { xs, ys };
}
function nearest(v, list, T){ let best = null, d = T; for(const p of list){ const n = Math.abs(p - v); if(n <= d){ d = n; best = p; } } return best; }
// Move snapping: whichever of the left edge / centre / right edge (top / middle / bottom) is nearest a target.
function snapMove(x, y, w, h, t, k){
  const T = SNAP_PX/k, lines = [];
  let bx = null, by = null;
  for(const off of [0, w/2, w]){ const p = nearest(x + off, t.xs, T); if(p!=null && (bx==null || Math.abs(p - x - off) < Math.abs(bx.d))) bx = { d:p - x - off, p }; }
  for(const off of [0, h/2, h]){ const p = nearest(y + off, t.ys, T); if(p!=null && (by==null || Math.abs(p - y - off) < Math.abs(by.d))) by = { d:p - y - off, p }; }
  if(bx){ x += bx.d; lines.push(['v', bx.p]); }
  if(by){ y += by.d; lines.push(['h', by.p]); }
  return { x, y, lines };
}
function showGuides(E, lines){
  const st = E.stage, k = st.k;
  $$('.ed-guide', st.ui).forEach(g=>g.remove());
  for(const [dir, p] of lines){
    const g = el('div', 'ed-guide ' + dir);
    if(dir==='v') Object.assign(g.style, { left:(p*k) + 'px', top:'0px', height:(st.H*k) + 'px' });
    else Object.assign(g.style, { top:(p*k) + 'px', left:'0px', width:(st.W*k) + 'px' });
    st.ui.appendChild(g);
  }
}
function placeBox(d, r, k){ Object.assign(d.style, { left:(r.x*k)+'px', top:(r.y*k)+'px', width:(Math.max(r.w, 6)*k)+'px', height:(Math.max(r.h, 6)*k)+'px' }); }
function addHandles(d, onDown){
  for(const hd of HANDLES){
    const hEl = el('div', 'ed-h ' + hd); hEl.dataset.h = hd;
    hEl.addEventListener('pointerdown', e=>onDown(e, hd));
    d.appendChild(hEl);
  }
}

function buildEditOverlay(E){
  const st = E.stage, ui = st.ui, k = st.k; ui.innerHTML = '';
  // v1.52.1: something selected (or being typed in) on the slide moves the keyboard to the slide, so Delete
  // after Insert → Shape / Picture etc. deletes the new object, not the slide picked in the strip.
  if(E.focus==='slides' && (E.sel || E.selCover || E.selO.size || E.editing)){ E.focus = 'slide'; const sb = $('.ed-thumbs'); if(sb) sb.classList.remove('focus'); }
  if(E.orderMode && (E.orderMode.i!==E.i || E.editing)) E.orderMode = null;
  if(E.cellMode){ const t = E.sel && (st.objects || []).find(o=>o.oid===E.sel); if(!t || t.kind!=='table' || E.editing || isMulti(E)) E.cellMode = false; }
  if(E.crop){ const t = E.sel===E.crop && (st.objects || []).find(o=>o.oid===E.sel); if(!t || E.editing || isMulti(E) || !canCrop(E, t)) E.crop = null; } // v1.80
  if(E.adjust){ const t = E.sel===E.adjust && (st.objects || []).find(o=>o.oid===E.sel); if(!t || t.kind!=='frame' || E.editing || isMulti(E) || !frameOf(E, t.oid) || !frameOf(E, t.oid).pic) E.adjust = null; } // v1.73
  const edEl = $('.editor'); if(edEl) edEl.classList.toggle('cell-mode', !!E.cellMode);
  renderRibbon(E);
  edHint(E);
  if(E.editing){ editFrame(E); return; }
  const c = cfgOf(E);
  // v1.63: grouped objects show their group's reveal setting (its lead's).
  const groups = edGroups(E, c), leadOf = new Map();
  for(const g of groups) for(const id of g.oids) leadOf.set(id, g.oids[0]);
  const eff = id=>c.obj[id]==='del' ? 'del' : c.obj[leadOf.get(id) || id] || '';
  // Fade hidden-at-start objects so you can see they're hidden but still find them.
  for(const o of (st.objects || [])){ const e = objEl(E, o.oid); if(e) e.classList.toggle('ed-faded', eff(o.oid)==='hide'); }
  // Several objects selected (Ctrl / Shift-click or a box dragged on the empty slide): E.selO, on slide E.selOi.
  pruneMulti(E, c);
  if(E.cell && (!E.sel || !E.cell.startsWith(E.sel + '.') || !(st.objects || []).some(o=>o.oid===E.cell))) E.cell = null;
  if(!E.cell) E.cellSel = null;
  else if(E.cellSel){ E.cellSel = new Set([...E.cellSel].filter(id=>id.startsWith(E.sel + '.') && (st.objects || []).some(o=>o.oid===id))); E.cellSel.add(E.cell); if(E.cellSel.size < 2) E.cellSel = null; }
  // v1.53: Set reveal order: only the items that reveal can be clicked.
  if(E.orderMode){ orderOverlay(E, c); return; }
  const multi = E.selO.size > 1;
  // Tapping the empty slide clears the selection; dragging on it selects everything inside the box.
  const bg = el('div','ed-bg'); ui.appendChild(bg);
  bg.addEventListener('pointerdown', e=>marquee(E, e, bg));
  const labels = { hide:'Hidden at start', toggle:'Can hide', del:'Deleted' };
  for(const o of (st.objects || [])){
    if(o.cell) continue; // table cells: see tableOverlay()
    const s = eff(o.oid), isSel = E.sel===o.oid || (multi && E.selO.has(o.oid));
    const g = s!=='del' ? groups.find(g=>g.oids.includes(o.oid)) : null;
    const isLine = o.kind==='line';
    const d = el('div','ed-obj' + (s ? ' ' + s : '') + (isSel ? ' sel' : '') + (isLine ? ' line' : ''));
    d.dataset.oid = o.oid;
    const r0 = { x:o.x, y:o.y, w:o.w, h:o.h };
    // A line can be 0 high (or wide): give it something to tap.
    const hit = r=>{ if(!isLine) return r; const m = 14/k, x = { ...r }; if(x.w < m){ d._ox = (m - x.w)/2; x.x -= d._ox; x.w = m; } else d._ox = 0; if(x.h < m){ d._oy = (m - x.h)/2; x.y -= d._oy; x.h = m; } else d._oy = 0; return x; };
    placeBox(d, hit(r0), k);
    if(s && (!g || g.oids[0]===o.oid)) d.innerHTML = `<span class="lab">${labels[s]}${g ? ' (group)' : ''}</span>`; // a group: one label, on its lead
    d.title = o.name;
    const slideObj = objEl(E, o.oid);
    const isPic = !!(slideObj && (slideObj.classList.contains('pptx-pic') || slideObj.querySelector(':scope > .pptx-pic, :scope > img')));
    // Live preview: move the overlay and the object itself.
    const live = r=>{ placeBox(d, hit(r), k); if(slideObj) Object.assign(slideObj.style, { left:r.x+'px', top:r.y+'px', width:r.w+'px', height:r.h+'px' }); $$('.ed-btn, .ed-link, .ed-end, .ed-ord', ui).forEach(x=>x.remove()); };
    const commit = r=>{ E.sel = o.oid; E.selCover = null; change(E, c=>{ c.geo[o.oid] = r; if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a) Object.assign(a, r); delete c.geo[o.oid]; } }); };
    const skip = new Set([o.oid]);
    if(E.crop===o.oid && slideObj){ cropOverlay(E, o, slideObj, k); continue; } // v1.80: crop mode
    if(E.adjust===o.oid){ frameAdjustBox(E, d, o, slideObj, k); ui.appendChild(d); continue; } // v1.73: Move picture
    d.addEventListener('pointerdown', e=>{
      if(e.button > 0 || E.drawCover || E.drawText) return;
      const tapX = e.clientX, tapY = e.clientY;
      // v1.53: Select cells is on: clicks pick / unpick cells and a drag picks every cell it crosses (no typing, no moving).
      if(o.kind==='table' && isSel && !multi && E.cellMode){ cellDrag(E, o, e); return; }
      if((e.ctrlKey || e.metaKey || e.shiftKey) && o.kind==='table' && isSel && !multi){
        // Selected table: Shift-click picks a block of cells from the last one picked, Ctrl-click adds / removes a cell.
        const cid = cellAt(E, o, tapX, tapY);
        if(cid){ e.preventDefault(); e.stopPropagation(); cellPick(E, o.oid, cid, e.shiftKey ? 'range' : 'toggle'); return; }
      }
      if((e.ctrlKey || e.metaKey || e.shiftKey) && s!=='del'){ e.preventDefault(); e.stopPropagation(); toggleMulti(E, o.oid); return; }
      const dblTap = ()=>{ const now = Date.now(), dbl = E.lastTap && E.lastTap.oid===o.oid && now - E.lastTap.t < 450; E.lastTap = { oid:o.oid, t:now }; return dbl; };
      if(multi && E.selO.has(o.oid)){
        groupDrag(E, e, null, ()=>{
          // A tap: double-click types; on a selected group, a second click selects just this member (v1.63).
          if(dblTap() && hasText(E, o.oid)){ E.lastTap = null; startTextEdit(E, o.oid); return; }
          const sg = selGroup(E), qw = qaWhole(E);
          if((sg && sg.oids.includes(o.oid)) || (qw && qaIdOf(c, o.oid)===qw)){ clearMulti(E); E.sel = o.oid; E.selCover = null; buildEditOverlay(E); }
        });
        return;
      }
      // A Q&A box selects (and drags) the whole Q&A, unless one box of it is already selected on its own.
      const qid = qaIdOf(c, o.oid), qo = qid && qaOids(c, qid);
      if(qo && qo.length > 1 && s!=='del' && !(E.sel && !multi && qo.includes(E.sel))){
        const list = (st.objects || []).filter(x=>qo.includes(x.oid));
        const pick = ()=>{ E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; E.selO = new Set(qo); E.selOi = E.i; };
        groupDrag(E, e, list, ()=>{ dblTap(); pick(); buildEditOverlay(E); }, pick);
        return;
      }
      // v1.63: a grouped object selects (and drags) its whole group, unless one of the group is already selected on its own.
      if(g && !(E.sel && !multi && g.oids.includes(E.sel))){
        const list = (st.objects || []).filter(x=>g.oids.includes(x.oid));
        const pick = ()=>{ E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; E.selO = new Set(g.oids); E.selOi = E.i; };
        groupDrag(E, e, list, ()=>{ dblTap(); pick(); buildEditOverlay(E); }, pick);
        return;
      }
      clearMulti(E);
      if(s==='del'){ E.sel = o.oid; E.selCover = null; buildEditOverlay(E); return; }
      const wasSel = isSel;
      dragRect(E, e, r0, 'move', false, live, r=>{
        if(r) return commit(r);
        // A tap: select / deselect; a second tap on a text object opens it for editing.
        const now = Date.now(), dbl = E.lastTap && E.lastTap.oid===o.oid && now - E.lastTap.t < 450;
        E.lastTap = { oid:o.oid, t:now };
        if(o.kind==='table'){ tableTap(E, o, tapX, tapY); return; }
        if(dbl && o.kind==='frame' && s!=='del'){ E.lastTap = null; E.sel = o.oid; E.selCover = null; frameDblTap(E, o.oid); return; } // v1.73
        if(dbl && hasText(E, o.oid)){ E.lastTap = null; startTextEdit(E, o.oid); return; }
        E.sel = wasSel && !dbl ? null : o.oid; E.selCover = null; buildEditOverlay(E);
      }, skip);
    });
    if(isSel && multi) d.classList.add('multi');
    else if(isSel && s!=='del' && !E.cellMode){
      if(isLine){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a) lineHandles(E, d, o, a); }
      else addHandles(d, (e, hd)=>dragRect(E, e, r0, hd, isPic, live, r=>{ if(r){ fitTextHeight(E, o, r); commit(r); } }, skip)); // v1.63: text boxes grow to fit rewrapped text
    }
    ui.appendChild(d);
  }
  // Cover boxes sit above everything; tap one to select it (Object tab), drag to move.
  for(const cv of c.covers){
    const isSel = E.selCover===cv.id;
    const d = el('div','ed-cover' + (isSel ? ' sel' : ''));
    d.dataset.cover = cv.id;
    const r0 = { x:cv.x, y:cv.y, w:cv.w, h:cv.h };
    placeBox(d, r0, k);
    d.style.background = cv.color;
    d.style.opacity = '.85';
    d.innerHTML = '<span class="lab">Cover box</span>';
    const live = r=>{ placeBox(d, r, k); $$('.ed-btn, .ed-link, .ed-ord', ui).forEach(x=>x.remove()); };
    const commit = r=>{ E.selCover = cv.id; E.sel = null; change(E, c=>{ const x = c.covers.find(x=>x.id===cv.id); if(x) Object.assign(x, { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.w), h:Math.round(r.h) }); }); };
    const skip = new Set(['c' + cv.id]);
    d.addEventListener('pointerdown', e=>{
      if(e.button > 0 || E.drawCover || E.drawText) return;
      clearMulti(E);
      dragRect(E, e, r0, 'move', false, live, r=>{ if(r) commit(r); else { E.selCover = cv.id; E.sel = null; buildEditOverlay(E); } }, skip);
    });
    if(isSel) addHandles(d, (e, hd)=>dragRect(E, e, r0, hd, false, live, r=>{ if(r) commit(r); }, skip));
    ui.appendChild(d);
  }
  // v1.63: several selected: one box with handles round them all. A member selected on its own: its group's outline.
  if(multi) selBox(E);
  const eg = !multi && E.sel && leadOf.has(E.sel) ? groups.find(g=>g.oids.includes(E.sel)) : null;
  if(eg){ const gb = el('div', 'ed-grpbox'); placeBox(gb, unionRect(eg.oids.map(id=>stageRect(E, id))), k); ui.appendChild(gb); }
  const so = E.sel && (st.objects || []).find(o=>o.oid===E.sel);
  if(so && so.kind==='table' && c.obj[so.oid]!=='del') tableOverlay(E, c, so);
  // The reveal button preview: for a grouped object (or a selected group), the group's, round the whole group.
  const sg = selGroup(E), rk = so && !E.cell && c.obj[so.oid]!=='del' ? leadOf.get(so.oid) || so.oid : sg ? sg.oids[0] : null;
  if(rk){
    const s = c.obj[rk];
    if(s==='hide' || s==='toggle') btnPreview(E, c, 'o'+rk, s==='toggle', itemRect(st, c, 'o'+rk));
  }
  const sc = E.selCover && c.covers.find(x=>x.id===E.selCover);
  if(sc) btnPreview(E, c, 'c'+sc.id, false, sc);
  orderBadges(E, c);
  // Insert → Cover box / Text box / Header: drag to draw one (a tap puts a standard-size one there). Esc cancels.
  if(E.drawCover || E.drawText){
    const draw = el('div','ed-draw'); ui.appendChild(draw);
    let start = null, draft = null;
    const at = e=>{ const r = st.frame.getBoundingClientRect(); return [(e.clientX-r.left)/k, (e.clientY-r.top)/k]; };
    draw.addEventListener('pointerdown', e=>{
      if(e.button > 0) return;
      start = at(e);
      draft = el('div','ed-draft'); ui.appendChild(draft);
      draw.setPointerCapture(e.pointerId);
    });
    draw.addEventListener('pointermove', e=>{
      if(!start) return;
      const p = at(e);
      const x = Math.min(p[0], start[0]), y = Math.min(p[1], start[1]), w = Math.abs(p[0]-start[0]), h = Math.abs(p[1]-start[1]);
      Object.assign(draft.style, { left:(x*k)+'px', top:(y*k)+'px', width:(w*k)+'px', height:(h*k)+'px' });
      draft._r = { x, y, w, h };
    });
    const end = ev=>{
      if(!start) return;
      let r = draft && draft._r; if(draft) draft.remove();
      const p0 = start; start = null;
      if(ev.type==='pointercancel'){ return; }
      if(E.drawText){ const kind = E.drawText; E.drawText = null; addTextAt(E, kind, r && r.w*k > 10 ? r : null, p0); return; }
      if(!(r && r.w*k > 10 && r.h*k > 10)){ const w = st.W*0.3, h = st.H*0.18; r = { x:Math.max(0, Math.min(st.W - w, p0[0] - w/2)), y:Math.max(0, Math.min(st.H - h, p0[1] - h/2)), w, h }; }
      // v1.38.1: the tool stays on for the next box; Insert → Done, Esc, the ribbon button or the grey area ends it.
      const id = uid(); E.lastCover = id; E.selCover = null; E.sel = null;
      change(E, c=>{ c.covers.push({ id, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.w), h:Math.round(r.h), color:coverColourFor(E, E.coverCol) }); });
    };
    draw.addEventListener('pointerup', end); draw.addEventListener('pointercancel', end);
  }
}
/* ---------- several objects selected (v1.33) ----------
   E.selO: the oids (2 or more) on slide E.selOi; E.sel / E.selCover are then null. A single selection
   (E.sel or E.selCover being set anywhere) always wins over it. Table cells and cover boxes aren't included. */
function pruneMulti(E, c){
  if(!E.selO.size) return;
  if(E.selOi!==E.i || E.sel || E.selCover || E.editing){ E.selO.clear(); return; }
  const have = new Set((E.stage.objects || []).filter(o=>!o.cell && c.obj[o.oid]!=='del').map(o=>o.oid));
  for(const id of [...E.selO]) if(!have.has(id)) E.selO.delete(id);
  if(E.selO.size===1){ E.sel = [...E.selO][0]; E.selO.clear(); }
}
function clearMulti(E){ E.selO.clear(); }
function isMulti(E){ return E.selO.size > 1 && E.selOi===E.i && !E.editing; }
function multiObjs(E){ return isMulti(E) ? (E.stage.objects || []).filter(o=>E.selO.has(o.oid)) : []; }
// The selected objects: several, or the single one.
function selOids(E){ if(isMulti(E)) return multiObjs(E).map(o=>o.oid); return E.sel ? [E.sel] : []; }
function setMultiSel(E, oids){
  oids = [...new Set(oids)];
  E.selCover = null; E.cell = null;
  if(oids.length > 1){ E.sel = null; E.selO = new Set(oids); E.selOi = E.i; }
  else { E.selO.clear(); E.sel = oids[0] || null; }
  buildEditOverlay(E);
}
function toggleMulti(E, oid){
  const cur = isMulti(E) ? new Set(E.selO) : new Set(E.sel ? [E.sel] : []);
  // v1.63: a grouped object adds / removes its whole group.
  const ids = withGroups(E, [oid]);
  if(ids.every(id=>cur.has(id))) ids.forEach(id=>cur.delete(id)); else ids.forEach(id=>cur.add(id));
  setMultiSel(E, [...cur]);
}
// Move / resize an object in the slide's settings (r in slide units).
function moveObj(c, o, r){
  if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a){ a.x = r.x; a.y = r.y; if(r.w!=null){ a.w = r.w; a.h = r.h; } } delete c.geo[o.oid]; }
  else c.geo[o.oid] = { x:r.x, y:r.y, w:r.w!=null ? r.w : o.w, h:r.h!=null ? r.h : o.h };
}
function bounds(list){
  const x1 = Math.min(...list.map(o=>o.x)), y1 = Math.min(...list.map(o=>o.y)), x2 = Math.max(...list.map(o=>o.x + o.w)), y2 = Math.max(...list.map(o=>o.y + o.h));
  return { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
}
// Drag any of the selected objects: they all move together.
// v1.63: list (default: the selected objects), onTap() for a tap without moving, before() just before the move is saved.
function groupDrag(E, e, list, onTap, before){
  list = list || multiObjs(E); if(!list.length) return;
  const bb = bounds(list), k = E.stage.k, ui = E.stage.ui;
  const els = list.map(o=>({ o, el:objEl(E, o.oid), box:ui.querySelector(`.ed-obj[data-oid="${CSS.escape(o.oid)}"]`) }));
  dragRect(E, e, bb, 'move', false, r=>{
    const dx = r.x - bb.x, dy = r.y - bb.y;
    $$('.ed-ord, .ed-btn, .ed-link, .ed-selbox, .ed-grpbox', ui).forEach(x=>x.remove());
    for(const { o, el:x, box } of els){
      if(x){ x.style.left = (o.x + dx) + 'px'; x.style.top = (o.y + dy) + 'px'; }
      if(box){ box.style.left = ((o.x + dx)*k - (box._ox || 0)*k) + 'px'; box.style.top = ((o.y + dy)*k - (box._oy || 0)*k) + 'px'; }
    }
  }, r=>{
    if(!r){ if(onTap) onTap(); return; }
    const r1 = v=>Math.round(v*10)/10, dx = r.x - bb.x, dy = r.y - bb.y;
    if(before) before();
    change(E, c=>{ for(const o of list) moveObj(c, o, { x:r1(o.x + dx), y:r1(o.y + dy), w:o.w, h:o.h }); });
  }, new Set(list.map(o=>o.oid)));
}
// Drag on the empty slide: a box; everything wholly inside it is selected (Ctrl / Shift adds to the selection).
function marquee(E, e, bg){
  if(e.button > 0 || E.drawCover || E.drawText) return;
  const st = E.stage, k = st.k, fr = st.frame.getBoundingClientRect();
  const at = ev=>({ x:(ev.clientX - fr.left)/k, y:(ev.clientY - fr.top)/k });
  const p0 = at(e), sx = e.clientX, sy = e.clientY, add = e.ctrlKey || e.metaKey || e.shiftKey;
  let box = null, r = null;
  try{ bg.setPointerCapture(e.pointerId); }catch(_){}
  const mv = ev=>{
    if(!box && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if(!box){ box = el('div', 'ed-marq'); st.ui.appendChild(box); $$('.ed-bar, .ed-btn, .ed-link', st.ui).forEach(x=>x.remove()); }
    const p = at(ev);
    r = { x:Math.min(p.x, p0.x), y:Math.min(p.y, p0.y), w:Math.abs(p.x - p0.x), h:Math.abs(p.y - p0.y) };
    placeBox(box, r, k);
  };
  const up = ev=>{
    bg.removeEventListener('pointermove', mv); bg.removeEventListener('pointerup', up); bg.removeEventListener('pointercancel', up);
    if(box) box.remove();
    if(!box){ if(E.sel || E.selCover || E.selO.size || E.cell){ E.sel = null; E.selCover = null; E.cell = null; clearMulti(E); buildEditOverlay(E); } return; }
    if(ev.type!=='pointerup' || !r) return;
    const c = cfgOf(E);
    let inside = (st.objects || []).filter(o=>!o.cell && c.obj[o.oid]!=='del' && o.x >= r.x - 0.5 && o.y >= r.y - 0.5 && o.x + o.w <= r.x + r.w + 0.5 && o.y + o.h <= r.y + r.h + 0.5).map(o=>o.oid);
    // v1.63: a group is picked only when the box goes round all of it (as PowerPoint).
    const gs = edGroups(E, c), ins = new Set(inside);
    inside = inside.filter(id=>{ const g = gs.find(g=>g.oids.includes(id)); return !g || g.oids.every(x=>ins.has(x)); });
    setMultiSel(E, add ? withGroups(E, selOids(E), c).concat(inside) : inside);
  };
  bg.addEventListener('pointermove', mv); bg.addEventListener('pointerup', up); bg.addEventListener('pointercancel', up);
}
function deleteMulti(E){
  const ids = multiObjs(E).map(o=>o.oid); if(!ids.length) return;
  clearMulti(E);
  change(E, c=>{ groupsDrop(c, ids); for(const id of ids) c.obj[id] = 'del'; });
  toast(`${ids.length} objects deleted · Undo or Ctrl+Z to bring them back`);
}
function setMultiState(E, v){
  // v1.63: per reveal item: a group's setting goes on its lead, the other members have none.
  const units = selUnits(E).filter(u=>!isToolIcon(E, u.lead));
  change(E, c=>{ for(const u of units){ for(const id of u.oids) if(id!==u.lead && c.obj[id]!=='del') delete c.obj[id]; if(v) c.obj[u.lead] = v; else delete c.obj[u.lead]; } });
}
// Align / distribute the selected objects against each other.
function alignMulti(E, how){
  const list = multiObjs(E); if(list.length < 2) return;
  const bb = bounds(list), r1 = v=>Math.round(v*10)/10;
  const pos = new Map(list.map(o=>[o.oid, { x:o.x, y:o.y }]));
  if(how==='dh' || how==='dv'){
    const h = how==='dh', s = [...list].sort((a,b)=>h ? a.x - b.x : a.y - b.y);
    const total = s.reduce((n, o)=>n + (h ? o.w : o.h), 0), gap = ((h ? bb.w : bb.h) - total) / (s.length - 1);
    let at = h ? bb.x : bb.y;
    for(const o of s){ pos.get(o.oid)[h ? 'x' : 'y'] = at; at += (h ? o.w : o.h) + gap; }
  } else for(const o of list){
    const p = pos.get(o.oid);
    if(how==='l') p.x = bb.x; if(how==='c') p.x = bb.x + (bb.w - o.w)/2; if(how==='r') p.x = bb.x + bb.w - o.w;
    if(how==='t') p.y = bb.y; if(how==='m') p.y = bb.y + (bb.h - o.h)/2; if(how==='b') p.y = bb.y + bb.h - o.h;
  }
  change(E, c=>{ for(const o of list){ const p = pos.get(o.oid); moveObj(c, o, { x:r1(p.x), y:r1(p.y), w:o.w, h:o.h }); } });
}
/* Scatter: the selected objects (a group counts as one) are shuffled into random places across the whole slide, keeping
   clear of each other and of everything not selected (a title box stays clear): each takes the emptiest room it can find,
   so the space is used up evenly. Press again for a new shuffle. */
function scatterMulti(E){
  const list = multiObjs(E); if(list.length < 2) return;
  const byId = new Map(list.map(o=>[o.oid, o]));
  const units = selUnits(E).map(u=>{ const os = u.oids.map(id=>byId.get(id)).filter(Boolean); return { os, b:bounds(os) }; }).filter(u=>u.os.length);
  const n = units.length; if(n < 2) return;
  const W = E.stage.W, H = E.stage.H, m = 16, ax = m, ay = m, w = W - 2*m, h = H - 2*m, c0 = cfgOf(E);
  // Everything on the slide that isn't selected (bar a big background picture) stays where it is and is kept clear of.
  const fixed = (E.stage.objects || []).filter(o=>!o.cell && !E.selO.has(o.oid) && c0.obj[o.oid]!=='del' && o.w*o.h < W*H*0.5).map(o=>({ x:o.x, y:o.y, w:o.w, h:o.h }));
  // Biggest first; each takes the free spot (of 60 random tries) that is furthest from everything already there, so the gaps even out.
  // If something can't be placed the whole try starts again; after several, the gap between objects is made smaller.
  const order = [...units].sort((a, b)=>b.b.w*b.b.h - a.b.w*a.b.h), gapTo = (p, q)=>Math.hypot(Math.max(0, p.x - q.x - q.w, q.x - p.x - p.w), Math.max(0, p.y - q.y - q.h, q.y - p.y - p.h));
  let spots = null;
  for(const gap of [10, 4, 0]){
    if(spots) break;
    if(order.some(u=>u.b.w > w || u.b.h > h)) break;
    const overlap = (p, q)=>p.x < q.x + q.w + gap && q.x < p.x + p.w + gap && p.y < q.y + q.h + gap && q.y < p.y + p.h + gap;
    for(let t = 0; t < 15 && !spots; t++){
      const placed = [...fixed], got = new Map();
      for(const u of order){
        let pick = null;
        for(let c = 0; c < 60; c++){
          const r = { x:ax + Math.random()*(w - u.b.w), y:ay + Math.random()*(h - u.b.h), w:u.b.w, h:u.b.h };
          if(placed.some(q=>overlap(r, q))) continue;
          const s = placed.length ? Math.min(...placed.map(q=>gapTo(r, q))) : 0;
          if(!pick || s > pick.s) pick = { r, s };
        }
        if(!pick){ got.clear(); break; }
        placed.push(pick.r); got.set(u, pick.r);
      }
      if(got.size===n) spots = got;
    }
  }
  if(!spots){ toast('There is not room to scatter these without touching: make some smaller or select fewer'); return; }
  const r1 = v=>Math.round(v*10)/10, pos = new Map();
  for(const [u, r] of spots){ const dx = r.x - u.b.x, dy = r.y - u.b.y; for(const o of u.os) pos.set(o.oid, { x:r1(o.x + dx), y:r1(o.y + dy) }); }
  change(E, c=>{ for(const o of list){ const p = pos.get(o.oid); if(p) moveObj(c, o, { x:p.x, y:p.y, w:o.w, h:o.h }); } });
}
/* ---------- groups in the editor (v1.63) ----------
   As PowerPoint: Group (Selection tab / right-click) joins the selected objects. Clicking a member selects the
   whole group (drag moves it, the handles round it resize it all); clicking it again selects just that member
   (format it, move it on its own); double-click types. Esc goes back up to the group. A group reveals as one
   item (see liveGroups). Several objects selected without grouping also get the handles round them. */
// The slide's groups, with only the members on the slide now.
function edGroups(E, c){
  c = c || cfgOf(E);
  const have = new Set((E.stage.objects || []).filter(o=>!o.cell).map(o=>o.oid));
  return liveGroups(c).map(g=>({ id:g.id, oids:g.oids.filter(id=>have.has(id)) })).filter(g=>g.oids.length > 1);
}
function groupOf(E, oid, c){ return oid ? edGroups(E, c).find(g=>g.oids.includes(oid)) || null : null; }
// oids, with every group any of them is in added in full.
function withGroups(E, oids, c){
  const gs = edGroups(E, c), out = [];
  for(const id of oids){ const g = gs.find(g=>g.oids.includes(id)); for(const x of (g ? g.oids : [id])) if(!out.includes(x)) out.push(x); }
  return out;
}
// The selection is exactly one group: that group.
function selGroup(E){
  if(!isMulti(E)) return null;
  const g = groupOf(E, [...E.selO][0]);
  return g && g.oids.length===E.selO.size && g.oids.every(id=>E.selO.has(id)) ? g : null;
}
// One member selected on its own (clicked again inside its group): that group.
function enteredGroup(E){ return !isMulti(E) && E.sel && !E.cell && !E.editing ? groupOf(E, E.sel) : null; }
// The selection as reveal items: one per group (its lead) or ungrouped object.
function selUnits(E, c){
  const gs = edGroups(E, c), out = [], seen = new Set();
  for(const id of selOids(E)){
    const g = gs.find(g=>g.oids.includes(id)), lead = g ? g.oids[0] : id;
    if(!seen.has(lead)){ seen.add(lead); out.push({ lead, oids:g ? g.oids : [id], g }); }
  }
  return out;
}
// The object whose reveal setting oid follows: its group's lead, or itself.
function revealLead(E, oid, c){ const g = groupOf(E, oid, c); return g ? g.oids[0] : oid; }
// Before deleting ids: take them out of their groups; a group losing its lead hands its reveal to the next member.
function groupsDrop(c, ids){
  if(!c.groups || !c.groups.length) return;
  const drop = new Set(ids);
  for(const g of c.groups){
    const rest = g.oids.filter(id=>!drop.has(id) && c.obj[id]!=='del');
    if(drop.has(g.oids[0]) && rest.length) moveLead(c, g.oids[0], rest[0], 0, 0);
    g.oids = rest;
  }
  c.groups = c.groups.filter(g=>g.oids.length > 1);
}
// The group's reveal setting, button position and reveal order place move from one member to another.
// (dx, dy): how far the button's anchor moves (its offset is kept from the anchor's top-left).
function moveLead(c, from, to, dx, dy){
  if(from===to) return;
  const st = c.obj[from];
  if(st==='hide' || st==='toggle'){ c.obj[to] = st; delete c.obj[from]; }
  const b = c.btn && c.btn['o' + from];
  if(b){ c.btn['o' + to] = { dx:Math.round((b.dx - dx)*10)/10, dy:Math.round((b.dy - dy)*10)/10 }; delete c.btn['o' + from]; }
  if(c.order) c.order = c.order.map(k=>k==='o' + from ? 'o' + to : k);
}
// A group's reveal setting lives on its lead only (after Use animations or an older paste, a member may have one).
function tidyGroupStates(c){
  for(const g of (c.groups || [])){
    const live = g.oids.filter(id=>c.obj[id]!=='del'); if(live.length < 2) continue;
    const lead = live[0], has = id=>c.obj[id]==='hide' || c.obj[id]==='toggle';
    if(!has(lead)){ const m = live.find(has); if(m) c.obj[lead] = c.obj[m]; }
    for(const id of live.slice(1)) if(has(id)){ delete c.obj[id]; delete c.btn['o' + id]; }
    if(c.order) c.order = c.order.filter(k=>!live.slice(1).some(id=>k==='o' + id));
  }
}
function stageRect(E, oid){ const o = (E.stage.objects || []).find(o=>o.oid===oid); return o ? { x:o.x, y:o.y, w:o.w, h:o.h } : null; }
function groupSel(E){
  if(E.editing) finishTextEdit(E);
  const c0 = cfgOf(E), units = selUnits(E, c0);
  if(units.length < 2){ toast('Select two or more objects (Ctrl-click or drag a box round them) to group them.'); return; }
  // The lead is whichever the clicker reaches first, so the group keeps that place in the reveal order.
  const seq = edSeq(E);
  let lead = null, best = Infinity;
  for(const u of units){ const i = seq.indexOf('o' + u.lead); if(i >= 0 && i < best){ best = i; lead = u.lead; } }
  const layer = PPTX.layerOrder(E.v.objectIds(E.i).concat((c0.added || []).map(a=>'n' + a.id)), c0.z || []);
  const all = units.flatMap(u=>u.oids).sort((a, b)=>layer.indexOf(a) - layer.indexOf(b));
  if(!lead) lead = all[0];
  const members = [lead, ...all.filter(id=>id!==lead)];
  const mixed = new Set(units.map(u=>c0.obj[u.lead] || '')).size > 1;
  const lr = itemRect(E.stage, c0, 'o' + lead), gr = unionRect(members.map(id=>stageRect(E, id)));
  E.sel = null; E.selCover = null; E.cell = null; E.selO = new Set(members); E.selOi = E.i;
  change(E, c=>{
    const b = c.btn['o' + lead];
    if(b && lr && gr) c.btn['o' + lead] = { dx:Math.round((b.dx + lr.x - gr.x)*10)/10, dy:Math.round((b.dy + lr.y - gr.y)*10)/10 };
    // Groups that were selected join the new one (one level of grouping, as far as the clicker is concerned).
    c.groups = c.groups.filter(g=>!g.oids.some(id=>members.includes(id)));
    for(const id of members.slice(1)) if(c.obj[id]==='hide' || c.obj[id]==='toggle'){ delete c.obj[id]; delete c.btn['o' + id]; }
    if(c.order) c.order = c.order.filter(k=>!members.slice(1).some(id=>k==='o' + id));
    c.groups.push({ id:uid(), oids:members });
    // Layers: the members together, just under where the top one was.
    const order = PPTX.layerOrder(E.v.objectIds(E.i).concat((c.added || []).map(a=>'n' + a.id)), c.z || []);
    const top = Math.max(...members.map(id=>order.indexOf(id)));
    const rest = order.filter(id=>!members.includes(id)), at = order.slice(0, top + 1).filter(id=>!members.includes(id)).length;
    rest.splice(at, 0, ...all);
    c.z = rest;
  });
  toast(mixed ? 'Grouped. It reveals as one item, with the setting of the one that revealed first.' : 'Grouped');
}
function ungroupSel(E){
  if(E.editing) finishTextEdit(E);
  const c0 = cfgOf(E);
  const eg = enteredGroup(E), gs = eg ? [eg] : selUnits(E, c0).filter(u=>u.g).map(u=>u.g);
  if(!gs.length) return;
  const ids = gs.flatMap(g=>g.oids);
  const rects = gs.map(g=>({ g, gr:unionRect(g.oids.map(id=>stageRect(E, id))), lr:stageRect(E, g.oids[0]) }));
  E.sel = null; E.selCover = null; E.cell = null; E.selO = new Set(ids); E.selOi = E.i;
  change(E, c=>{
    for(const { g, gr, lr } of rects){
      c.groups = c.groups.filter(x=>x.id!==g.id);
      const lead = g.oids[0], st = c.obj[lead];
      const b = c.btn['o' + lead];
      if(b && gr && lr) c.btn['o' + lead] = { dx:Math.round((b.dx + gr.x - lr.x)*10)/10, dy:Math.round((b.dy + gr.y - lr.y)*10)/10 };
      // Each object keeps the group's setting (so answers stay hidden) and now reveals on its own click.
      if(st==='hide' || st==='toggle'){
        for(const id of g.oids) c.obj[id] = st;
        if(c.order){ const i = c.order.indexOf('o' + lead); if(i >= 0) c.order.splice(i, 1, ...g.oids.map(id=>'o' + id)); }
      }
    }
  });
  const rev = gs.some(g=>['hide','toggle'].includes(c0.obj[g.oids[0]]));
  toast(rev ? 'Ungrouped: each object now reveals on its own click' : 'Ungrouped');
}
// Box with handles round several selected objects (grouped or not): resizing it scales them all together.
function selBox(E){
  const st = E.stage, ui = st.ui, k = st.k, list = multiObjs(E); if(list.length < 2) return;
  const bb = bounds(list);
  const d = el('div', 'ed-selbox' + (selGroup(E) ? ' grp' : ''));
  placeBox(d, bb, k);
  addHandles(d, (e, hd)=>groupResize(E, e, hd, list, bb));
  ui.appendChild(d);
}
/* Resize several objects as one block: each keeps its place and size relative to the others. Text isn't
   stretched: it keeps its font size and rewraps to the new width, and a text box grows taller if its text
   no longer fits (as PowerPoint). Corner handles keep the proportions; side handles stretch one way. */
function groupResize(E, e, hd, list, bb){
  const st = E.stage, ui = st.ui, k = st.k;
  const items = list.map(o=>({ o, el:objEl(E, o.oid), box:ui.querySelector(`.ed-obj[data-oid="${CSS.escape(o.oid)}"]`) }));
  const sb = ui.querySelector('.ed-selbox');
  const fit = r=>{
    const sx = bb.w > 0.5 ? r.w / bb.w : 1, sy = bb.h > 0.5 ? r.h / bb.h : 1, r1 = v=>Math.round(v*10)/10;
    return items.map(it=>({ ...it, r:{ x:r1(r.x + (it.o.x - bb.x)*sx), y:r1(r.y + (it.o.y - bb.y)*sy), w:r1(Math.max(1, it.o.w*sx)), h:r1(it.o.h*sy) } }));
  };
  dragRect(E, e, bb, hd, true, r=>{
    $$('.ed-btn, .ed-link, .ed-ord, .lab', ui).forEach(x=>x.remove());
    if(sb) placeBox(sb, r, k);
    for(const { el:x, box, r:q } of fit(r)){
      if(x) Object.assign(x.style, { left:q.x+'px', top:q.y+'px', width:q.w+'px', height:q.h+'px' });
      if(box) placeBox(box, q, k);
    }
  }, r=>{
    if(!r){ buildEditOverlay(E); return; }
    const out = fit(r); // the objects are at their new size now, so text boxes can be measured
    for(const it of out) fitTextHeight(E, it.o, it.r);
    change(E, c=>{ for(const it of out) moveObj(c, it.o, it.r); });
  }, new Set(list.map(o=>o.oid)));
}
// An added text box whose text doesn't fit after resizing grows taller to fit it (never shorter).
// r: its new box (slide units); the object must already be drawn at that width.
// v1.94: a.fh ("fit height") boxes (the EfL+ / Support / Aide boxes of the IN&ON templates) are as tall as their text: they grow AND shrink as it changes.
function contentH(tx){ const b = tx.style.bottom; tx.style.bottom = 'auto'; const h = Math.ceil(tx.offsetHeight); tx.style.bottom = b; return h; }
const fitAdded = (E, oid)=>{ const a = oid && oid[0]==='n' ? ((cfgOf(E).added || []).find(a=>'n' + a.id===oid)) : null; return a && a.fh ? a : null; };
function fitTextHeight(E, o, r){
  if(o.added && fitAdded(E, o.oid)){ const e = objEl(E, o.oid), tx = e && e.querySelector(':scope > .pptx-tx'); if(tx) r.h = Math.max(16, contentH(tx)); return; }
  if(!o.added || o.kind!=='text') return;
  const e = objEl(E, o.oid), tx = e && e.querySelector(':scope > .pptx-tx'); if(!tx) return;
  const need = Math.ceil(tx.scrollHeight);
  if(need > r.h) r.h = need;
}
/* ---------- reveal order (v1.53) ----------
   Numbered badges show the order the clicker reveals the slide's items in (seqFor). Earlier / Later move the
   selected item one place; Set reveal order (E.orderMode) lets you click the items in the order you want.
   Saved as cfg.order (see seqFor). */
function edSeq(E){ return seqFor(E.v, hideCfg(E.l, E.mode, E.i), E.i); }
// Slide units box of a reveal item ('o'+oid or 'c'+cover id), or null.
function revealRect(E, c, key){
  if(key[0]==='c'){ const cv = c.covers.find(x=>'c' + x.id===key); return cv ? { x:cv.x, y:cv.y, w:cv.w, h:cv.h } : null; }
  if(revealOids(c, key.slice(1)).length > 1) return itemRect(E.stage, c, key); // v1.63: a group's lead: the whole group
  const o = (E.stage.objects || []).find(o=>o.oid===key.slice(1)); if(!o) return null;
  const m = 14/E.stage.k;
  return { x:o.w < m ? o.x - (m - o.w)/2 : o.x, y:o.h < m ? o.y - (m - o.h)/2 : o.y, w:Math.max(o.w, m), h:Math.max(o.h, m) };
}
function orderBadges(E, c, seq){
  const st = E.stage, k = st.k, done = E.orderMode ? new Set(E.orderMode.done) : null;
  seq = seq || edSeq(E);
  seq.forEach((key, n)=>{
    const r = revealRect(E, c, key); if(!r) return;
    const s = key[0]==='c' ? 'cv' : c.obj[key.slice(1)]==='toggle' ? 'tg' : 'hd';
    const b = el('div', 'ed-ord ' + s + (done && done.has(key) ? ' done' : ''), String(n + 1));
    b.style.left = Math.max(0, Math.min(st.W*k - 22, r.x*k - 9)) + 'px';
    b.style.top = Math.max(0, Math.min(st.H*k - 22, r.y*k - 9)) + 'px';
    b.title = (s==='cv' ? 'Cover box' : s==='tg' ? 'Can hide' : 'Hidden at start') + `: step ${n + 1} of ${seq.length} on the clicker`;
    st.ui.appendChild(b);
  });
}
// The one item Earlier / Later moves: the selected object, cover box or single picked cell.
function selRevealKey(E){
  if(E.selCover) return 'c' + E.selCover;
  if(isMulti(E)){ const g = selGroup(E); return g ? 'o' + g.oids[0] : null; } // v1.63: a group: its lead
  if(!E.sel) return null;
  if(E.editing && cellTable(E.editing.oid)) return 'o' + E.editing.oid;
  if(E.cell){ const cs = selCells(E); return cs.length===1 ? 'o' + cs[0] : null; }
  return 'o' + revealLead(E, E.sel);
}
function revealPos(E){ const key = selRevealKey(E); return key ? edSeq(E).indexOf(key) : -1; }
function moveReveal(E, d){
  if(E.editing) finishTextEdit(E);
  const key = selRevealKey(E), seq = edSeq(E), i = key ? seq.indexOf(key) : -1;
  if(i < 0){ toast('Set it to Hidden at start or Can hide first.'); return; }
  const j = i + d;
  if(j < 0 || j >= seq.length){ toast(d < 0 ? 'Already revealed first' : 'Already revealed last'); return; }
  seq.splice(i, 1); seq.splice(j, 0, key);
  change(E, c=>{ c.order = seq; });
}
function startOrderMode(E){
  if(E.editing) finishTextEdit(E);
  const n = edSeq(E).length;
  if(n < 2){ toast(n ? 'Only one item reveals on this slide.' : 'Nothing reveals on this slide yet: set items to Hidden at start or Can hide first.'); return; }
  E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; clearMulti(E);
  E.drawCover = false; E.drawText = null; E.cellMode = false;
  E.orderMode = { i:E.i, done:[] };
  buildEditOverlay(E);
}
function endOrderMode(E){ if(!E.orderMode) return; E.orderMode = null; buildEditOverlay(E); }
function orderOverlay(E, c){
  const st = E.stage, ui = st.ui, k = st.k, seq = edSeq(E);
  const bg = el('div','ed-bg ed-ordbg'); ui.appendChild(bg);
  // Smaller items on top, so a cell or a box over a bigger item can still be clicked.
  const items = seq.map(key=>({ key, r:revealRect(E, c, key) })).filter(x=>x.r).sort((a, b)=>b.r.w*b.r.h - a.r.w*a.r.h);
  for(const { key, r } of items){
    const h = el('div', 'ed-ordhit' + (E.orderMode.done.includes(key) ? ' done' : ''));
    placeBox(h, r, k);
    h.addEventListener('pointerdown', e=>{ if(e.button > 0) return; e.preventDefault(); e.stopPropagation(); orderPick(E, key); });
    ui.appendChild(h);
  }
  orderBadges(E, c, seq);
}
function orderPick(E, key){
  const M = E.orderMode; if(!M || M.done.includes(key)) return;
  const first = !M.done.length;
  M.done.push(key);
  const rest = edSeq(E).filter(x=>!M.done.includes(x));
  change(E, c=>{ c.order = M.done.concat(rest); }, { merge:!first });
  if(rest.length <= 1){ E.orderMode = null; buildEditOverlay(E); toast('Reveal order set'); }
}
// Ribbon while Set reveal order is on.
function rbOrderMode(E){
  const M = E.orderMode, n = edSeq(E).length;
  return rbGroup('Set reveal order', rbNote(`Click the items in the order the clicker should reveal them. ${M.done.length} of ${n} done.`))
    + rbGroup('', rbCol(rbBtn('orderdone', 'done', 'Done', { cls:'primary', title:'Finish (Esc). Items not clicked keep their order after the ones you clicked.' })
      + rbBtn('orderagain', 'reset', 'Start again', { dis:!M.done.length, title:'Click them again from the first' })))
    + rbGroup('', rbBtn('orderdefault', 'undo', 'Default order', { big:true, title:'Back to the order from the PowerPoint (animations first, cover boxes last)' }));
}

/* ---------- Select cells (v1.53) ----------
   E.cellMode, with a table selected: a click picks / unpicks a cell (no typing), a drag picks every cell it
   crosses. Then Object → Reveal ▾ (or right-click) sets them all. Off with the button again, Esc or the grey area. */
function toggleCellMode(E){
  if(E.editing) finishTextEdit(E);
  const t = E.sel && (E.stage.objects || []).find(o=>o.oid===E.sel);
  if(!t || t.kind!=='table'){ toast('Select a table first.'); return; }
  E.cellMode = !E.cellMode;
  // v1.53.1: starting Select cells clears any picked cells, so the first click picks the first cell.
  if(E.cellMode){ E.cell = null; E.cellSel = null; }
  buildEditOverlay(E);
}
function cellDrag(E, o, e){
  e.preventDefault(); e.stopPropagation();
  const st = E.stage, k = st.k, tgt = e.currentTarget;
  const start = cellAt(E, o, e.clientX, e.clientY); if(!start) return;
  try{ tgt.setPointerCapture(e.pointerId); }catch(_){}
  const base = new Set(selCells(E)), cells = (st.objects || []).filter(q=>q.cell && q.table===o.oid), ta = tableOf(cfgOf(E), o.oid);
  let block = null;
  const blockTo = cid=>ta ? rangeCells(ta, o.oid, start, cid) : [cid]; // v1.70: merged cells count whole
  const paint = ids=>{
    $$('.ed-cell.tmp', st.ui).forEach(x=>x.remove());
    for(const q of cells) if(ids.has(q.oid) && !base.has(q.oid)){ const m = el('div', 'ed-cell tmp'); placeBox(m, q, k); st.ui.appendChild(m); }
  };
  const mv = ev=>{
    const cid = cellAt(E, o, ev.clientX, ev.clientY); if(!cid) return;
    if(!block && cid===start) return;
    block = blockTo(cid);
    paint(new Set(block));
  };
  const up = ev=>{
    tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up);
    if(ev.type!=='pointerup'){ buildEditOverlay(E); return; }
    const set = new Set(base);
    if(block) for(const id of block) set.add(id);       // a drag adds every cell it crossed
    else if(set.has(start)) set.delete(start); else set.add(start); // a click picks / unpicks one
    const list = cells.map(q=>q.oid).filter(id=>set.has(id));
    E.cell = list.length ? (set.has(start) ? start : list[0]) : null;
    E.cellSel = list.length > 1 ? new Set(list) : null;
    buildEditOverlay(E);
  };
  tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
}

/* ---------- Reveal ▾ (Object tab) and the right-click menu (v1.53) ---------- */
const STATE_LABEL = { hide:'Hidden at start', toggle:'Can hide', '':'Normal' };
// What a reveal setting applies to right now: { kind:'obj'|'cells'|'multi'|'cover', state ('' / 'hide' / 'toggle', null = mixed), n }.
// v1.68: tool icons are not part of the reveal sequence (no Reveal ▾, never hidden or revealed).
function isToolIcon(E, oid){ const o = (E.stage.objects || []).find(o=>o.oid===oid); return !!(o && o.kind==='tool'); }
function revealTarget(E){
  const c = cfgOf(E);
  if(E.selCover) return { kind:'cover', n:1 };
  if(E.sel && !E.cell && isToolIcon(E, E.sel)) return null;
  if(isMulti(E)){ const us = selUnits(E, c).filter(u=>!isToolIcon(E, u.lead)), st = new Set(us.map(u=>c.obj[u.lead] || '')); return { kind:'multi', state: st.size===1 ? [...st][0] : null, n:us.length, grp:!!selGroup(E) }; }
  if(E.editing && cellTable(E.editing.oid)) return { kind:'cells', state:c.obj[E.editing.oid] || '', n:1 };
  if(E.sel && E.cell){ const cs = selCells(E), st = new Set(cs.map(id=>c.obj[id] || '')); return { kind:'cells', state: st.size===1 ? [...st][0] : null, n:cs.length }; }
  if(E.sel) return { kind:'obj', state:c.obj[revealLead(E, E.sel, c)] || '', n:1, grp:!!groupOf(E, E.sel, c) };
  return null;
}
function setRevealState(E, v){
  const t = revealTarget(E); if(!t) return;
  if(t.kind==='multi') setMultiState(E, v);
  else if(t.kind==='cells') setCellState(E, v);
  else if(t.kind==='obj'){ if(E.editing) finishTextEdit(E); setObjState(E, v); }
}
// The reveal items for a menu: the three states (ticked), then the order and the button position.
function revealItems(E){
  const t = revealTarget(E); if(!t) return [];
  const c = cfgOf(E), items = [];
  if(t.kind!=='cover'){
    const what = t.kind==='cells' && t.n > 1 ? ` (${t.n} cells)` : t.grp && (t.kind==='obj' || t.n===1) ? ' (group)' : t.kind==='multi' ? ` (${t.n} items)` : '';
    for(const [v, lab] of OBJ_STATES) items.push({ label:(t.state===v ? '✓ ' : '  ') + lab + (t.state===v ? '' : what), run:()=>setRevealState(E, v) });
    items.push('-');
  }
  const pos = revealPos(E), n = edSeq(E).length;
  items.push({ label:'Reveal earlier' + (pos >= 0 ? `  (now ${pos + 1} of ${n})` : ''), dis:pos <= 0, run:()=>moveReveal(E, -1) });
  items.push({ label:'Reveal later', dis:pos < 0 || pos >= n - 1, run:()=>moveReveal(E, 1) });
  items.push({ label:'Set reveal order for this slide…', dis:n < 2, run:()=>startOrderMode(E) });
  const key = selRevealKey(E);
  if(key && (t.kind==='cover' || ((t.kind!=='multi' || t.grp) && (t.state==='hide' || t.state==='toggle'))))
    items.push({ label:'Reset reveal button position', dis:!c.btn[key[0]==='c' ? key : 'o' + key.slice(1)], run:()=>{ change(E, c=>{ delete c.btn[key]; }); } });
  return items;
}
// Right-click on the slide: select what's under the pointer, then its menu.
function objContext(E, ev){
  if(E.editing && E.editing.tx.contains(ev.target)) return; // the browser's own menu (spelling, paste) while typing
  ev.preventDefault();
  if(E.orderMode || E.drawCover || E.drawText || E.v.ent(E.i) && E.v.ent(E.i).del) return;
  if(E.editing) finishTextEdit(E);
  const pt = { x:ev.clientX, y:ev.clientY };
  const cvEl = ev.target.closest('.ed-cover'), oEl = !cvEl && ev.target.closest('.ed-obj');
  const c = cfgOf(E);
  if(cvEl){ if(E.selCover!==cvEl.dataset.cover){ clearMulti(E); E.sel = null; E.cell = null; E.selCover = cvEl.dataset.cover; buildEditOverlay(E); } }
  else if(oEl){
    const oid = oEl.dataset.oid, o = (E.stage.objects || []).find(x=>x.oid===oid);
    const g = c.obj[oid]!=='del' && groupOf(E, oid, c);
    // v1.63: a grouped object: its group, unless the object (or another of the group) is selected on its own.
    if(g && !(isMulti(E) && E.selO.has(oid)) && !(E.sel && g.oids.includes(E.sel))){ E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; E.selO = new Set(g.oids); E.selOi = E.i; buildEditOverlay(E); }
    else if(!(isMulti(E) && E.selO.has(oid))){
      clearMulti(E); E.selCover = null;
      const cid = o && o.kind==='table' ? cellAt(E, o, ev.clientX, ev.clientY) : null;
      if(cid){ if(!(E.sel===oid && selCells(E).includes(cid))){ E.sel = oid; E.cell = cid; E.cellSel = null; } }
      else { E.sel = oid; E.cell = null; E.cellSel = null; }
      buildEditOverlay(E);
    }
  } else {
    if(E.sel || E.selCover || E.selO.size){ E.sel = null; E.selCover = null; E.cell = null; clearMulti(E); buildEditOverlay(E); }
    return openMenu(null, slideContextItems(E, c), pt);
  }
  openMenu(null, objContextItems(E, c), pt);
}
function slideContextItems(E, c){
  const clip = readClip(), items = [];
  if(clip && clip.kind==='objects' && E.mode==='pptx') items.push({ label:`Paste ${clip.items.length > 1 ? clip.items.length + ' objects' : 'object'}   Ctrl+V`, run:()=>pasteObjects(E, clip) });
  items.push({ label:'Select all   Ctrl+A', run:()=>setMultiSel(E, (E.stage.objects || []).filter(o=>!o.cell && c.obj[o.oid]!=='del').map(o=>o.oid)) });
  items.push({ label:'Set reveal order for this slide…', dis:edSeq(E).length < 2, run:()=>startOrderMode(E) });
  return items;
}
function objContextItems(E, c){
  const clip = readClip(), canPaste = clip && clip.kind==='objects' && E.mode==='pptx', pptx = E.mode==='pptx';
  const paste = canPaste ? [{ label:'Paste   Ctrl+V', run:()=>pasteObjects(E, clip) }] : [];
  if(E.selCover) return [...revealItems(E), '-', { label:'Duplicate   Ctrl+D', run:()=>dupCover(E) }, '-', { label:'Delete   Del', danger:true, run:()=>deleteCover(E) }];
  const layers = [{ label:'Bring forward', run:()=>arrange(E, 'fwd') }, { label:'Bring to front', run:()=>arrange(E, 'front') },
    { label:'Send backward', run:()=>arrange(E, 'bwd') }, { label:'Send to back', run:()=>arrange(E, 'back') }];
  if(isMulti(E)){
    const n = E.selO.size, units = selUnits(E, c), sg = selGroup(E);
    // v1.63: Group / Ungroup
    const grp = [...(units.length > 1 ? [{ label:'Group', run:()=>groupSel(E) }] : []), ...(units.some(u=>u.g) ? [{ label:'Ungroup', run:()=>ungroupSel(E) }] : [])];
    return [...revealItems(E), '-', ...grp, ...(grp.length ? ['-'] : []), { label:'Copy   Ctrl+C', run:()=>copyObjects(E, null) }, ...paste, { label:'Duplicate   Ctrl+D', run:()=>dupObject(E) },
      '-', ...layers, ...(pptx ? ['-', { label:'Save to Object Gallery…', run:()=>saveObjectsToGallery(E) }] : []), '-', { label:sg ? 'Delete group   Del' : `Delete ${n} objects   Del`, danger:true, run:()=>deleteMulti(E) }];
  }
  const o = selObj(E); if(!o) return [];
  if(c.obj[o.oid]==='del') return [{ label:'Restore', run:()=>change(E, c=>{ delete c.obj[o.oid]; }) }];
  const items = o.kind==='tool' ? [{ label:'Change tool icon…', run:()=>openToolIconPicker(E, o) }, '-'] : [...revealItems(E), '-']; // v1.68
  const eg = !E.cell && groupOf(E, o.oid, c);
  if(eg) items.push({ label:'Select the whole group   Esc', run:()=>setMultiSel(E, eg.oids) }, { label:'Ungroup', run:()=>ungroupSel(E) }, '-'); // v1.63
  if(o.kind==='table' && E.cell){
    const n = selCells(E).length;
    if(n===1) items.push({ label:'Type in this cell', run:()=>startTextEdit(E, E.cell) });
    items.push({ label: n > 1 ? `Empty these ${n} cells` : 'Empty this cell', run:()=>clearCells(E) });
    { const ta = tableOf(c, o.oid); // v1.70
      if(n > 1) items.push({ label:'Merge cells', dis:!!mergeCheck(E).err, run:()=>mergeCells(E) });
      if(ta && pickedMerged(E, ta).length) items.push({ label:'Unmerge', run:()=>unmergeCells(E) }); }
    { const nr = cellLines(E, true).length, nc = cellLines(E, false).length;
      items.push({ label:`Delete ${nr > 1 ? nr + ' rows' : 'row'}`, danger:true, run:()=>deleteCellLines(E, true) }, { label:`Delete ${nc > 1 ? nc + ' columns' : 'column'}`, danger:true, run:()=>deleteCellLines(E, false) }); }
    items.push({ label: E.cellMode ? 'Stop selecting cells' : 'Select cells…', run:()=>toggleCellMode(E) }, '-');
  }
  else if(o.kind==='table') items.push({ label: E.cellMode ? 'Stop selecting cells' : 'Select cells…', run:()=>toggleCellMode(E) }, '-');
  else if(o.kind==='frame'){ const fa = frameOf(E, o.oid); // v1.73
    items.push({ label: fa && fa.pic ? 'Replace picture…' : 'Add picture…', run:()=>pickFramePicture(E, o.oid) });
    if(fa && fa.pic) items.push({ label:'Move picture', run:()=>startFrameAdjust(E, o.oid) }, { label:'Empty frame', run:()=>emptyFrame(E, o.oid) });
    items.push('-'); }
  else if(hasText(E, o.oid)) items.push({ label:'Edit text', run:()=>startTextEdit(E, o.oid) }, '-');
  if(canCrop(E, o)){ items.push({ label:'Crop picture', run:()=>startCrop(E, o.oid) }); if(hasCrop(E, o)) items.push({ label:'Reset crop', run:()=>resetCrop(E, o) }); items.push('-'); } // v1.80
  if(pptx) items.push({ label:'Copy   Ctrl+C', run:()=>copyObjects(E, null) }, ...paste, { label:'Duplicate   Ctrl+D', run:()=>dupObject(E) }, '-');
  items.push(...layers);
  if(pptx) items.push('-', { label:'Save to Object Gallery…', run:()=>saveObjectsToGallery(E) });
  items.push('-', { label: o.kind==='table' ? 'Delete table' : 'Delete   Del', danger:true, run:()=>{ E.cell = null; E.cellSel = null; deleteSel(E); } });
  return items;
}
/* ---------- tables (Insert → Table, v1.33) ----------
   An added object with a.table (see PPTX renderTable). Each cell is its own object for hiding /
   revealing: oid "n<id>.<row>.<col>", its state in cfg.obj like any object. E.cell = the selected cell
   (its table is E.sel). Tap a selected table to pick a cell; double-tap a cell (or Enter) to type. */
const cellTable = oid=>{ const m = /^(n[^.]+)\.\d+\.\d+$/.exec(oid || ''); return m ? m[1] : null; };
const cellRC = oid=>{ const p = String(oid).split('.'); return [Number(p[1]), Number(p[2])]; };
function tCell(a, oid){ const [r, c] = cellRC(oid); const row = a.table.cells[r] || (a.table.cells[r] = []); return row[c] || (row[c] = {}); }
function tableOf(c, oid){ return (c.added || []).find(a=>'n'+a.id===oid && a.table) || null; }
function cellAt(E, o, cx, cy){
  const fr = E.stage.frame.getBoundingClientRect(), k = E.stage.k;
  const x = (cx - fr.left)/k, y = (cy - fr.top)/k;
  const hit = (E.stage.objects || []).find(q=>q.cell && q.table===o.oid && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
  return hit ? hit.oid : null;
}
// v1.34: a tap on a cell puts the cursor in it (typing straight away); drag the table to move it.
// Esc while typing leaves the cell picked; Esc again selects the whole table.
function tableTap(E, o, cx, cy){
  const cid = cellAt(E, o, cx, cy);
  E.selCover = null; clearMulti(E); E.lastTap = null;
  E.sel = o.oid; E.cellSel = null;
  if(cid){ E.cell = cid; startTextEdit(E, cid, false, [cx, cy]); return; }
  E.cell = null; buildEditOverlay(E);
}
// The table cell under a screen point on this slide (oid), or null.
function cellAtPoint(E, cx, cy){
  const st = E.stage; if(!st || !st.frame) return null;
  const fr = st.frame.getBoundingClientRect(), x = (cx - fr.left)/st.k, y = (cy - fr.top)/st.k, c = cfgOf(E);
  const hit = (st.objects || []).find(q=>q.cell && c.obj[q.table]!=='del' && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
  return hit ? hit.oid : null;
}
/* Several cells (v1.34): E.cell is the cell picked last (the anchor), E.cellSel all the picked cells when there's more than one.
   Font, alignment, fill and reveal settings on the Table tab apply to all of them (font and alignment: every cell when none is picked). */
function selCells(E){ if(!E.cell) return []; return E.cellSel && E.cellSel.size > 1 ? [...E.cellSel] : [E.cell]; }
// v1.70: the cells that are drawn, in reading order (a merged cell once, by its top-left cell; covered cells left out).
function tableCellIds(a, toid){ return PPTX.tableGeo(a).map(g=>cellId(toid, g.r, g.c)); }
/* ---------- merged cells (v1.70) ----------
   A merged cell is its top-left cell with rs / cs (rows / columns covered, PPTX.tableSpans). The cells it covers
   aren't drawn, picked or revealed, and hold nothing. Merge joins the cells' text in reading order (as PowerPoint)
   and keeps the reveal setting of the cell the clicker reached first (as Group, v1.63). Unmerge gives the grid back:
   the text stays in the top-left cell, the others come back empty with its fill. */
const cellId = (toid, r, c)=>toid + '.' + r + '.' + c;
function cellBlock(a, id){ const [r, c] = cellRC(id), s = ((PPTX.tableSpans(a.table).span[r] || [])[c]) || [1, 1]; return { r, c, rs:s[0], cs:s[1] }; }
function coveredCellIds(a){ const toid = 'n' + a.id, out = []; PPTX.tableSpans(a.table).span.forEach((row, r)=>row.forEach((s, c)=>{ if(!s) out.push(cellId(toid, r, c)); })); return out; }
// Covered cells keep no reveal setting, button place or reveal-order entry.
function tidyCellSpans(c){
  for(const a of (c.added || [])){
    if(!a.table || !PPTX.hasSpans(a.table)) continue;
    const gone = new Set(coveredCellIds(a));
    for(const id of gone){ delete c.obj[id]; if(c.btn) delete c.btn['o' + id]; }
    if(c.order) c.order = c.order.filter(k=>!gone.has(k.slice(1)));
  }
}
// Every drawn cell in rows r0..r1, columns c0..c1, after widening the block until no merged cell sticks out of it.
function blockCells(a, toid, r0, c0, r1, c1){
  let R0 = Math.min(r0, r1), R1 = Math.max(r0, r1), C0 = Math.min(c0, c1), C1 = Math.max(c0, c1);
  const geo = PPTX.tableGeo(a);
  for(let moved = true; moved;){
    moved = false;
    for(const g of geo){
      const gr = g.r + g.rs - 1, gc = g.c + g.cs - 1;
      if(g.r > R1 || gr < R0 || g.c > C1 || gc < C0) continue;
      if(g.r < R0){ R0 = g.r; moved = true; } if(gr > R1){ R1 = gr; moved = true; }
      if(g.c < C0){ C0 = g.c; moved = true; } if(gc > C1){ C1 = gc; moved = true; }
    }
  }
  return geo.filter(g=>g.r >= R0 && g.r <= R1 && g.c >= C0 && g.c <= C1).map(g=>cellId(toid, g.r, g.c));
}
// The block from one cell to another (Shift-click, Shift+arrow, dragging in Select cells).
function rangeCells(a, toid, idA, idB){
  const p = cellBlock(a, idA), q = cellBlock(a, idB);
  return blockCells(a, toid, Math.min(p.r, q.r), Math.min(p.c, q.c), Math.max(p.r + p.rs, q.r + q.rs) - 1, Math.max(p.c + p.cs, q.c + q.cs) - 1);
}
// The drawn cell next to id in a direction (dr, dc), or null at the edge of the table.
function cellNext(a, toid, id, dr, dc){
  const b = cellBlock(a, id), own = PPTX.tableSpans(a.table).own;
  const r = dr > 0 ? b.r + b.rs : dr < 0 ? b.r - 1 : b.r, c = dc > 0 ? b.c + b.cs : dc < 0 ? b.c - 1 : b.c;
  const o = (own[r] || [])[c]; return o ? cellId(toid, o[0], o[1]) : null;
}
// Merge needs two or more picked cells that make a rectangle (merged cells inside it count whole).
function mergeCheck(E){
  const toid = E.sel, a = tableOf(cfgOf(E), toid); if(!a) return { err:'Select a table first.' };
  const ids = selCells(E); if(ids.length < 2) return { err:'Pick two or more cells next to each other (drag across them in Select cells, or Shift-click), then Merge.' };
  const bs = ids.map(id=>cellBlock(a, id));
  const r0 = Math.min(...bs.map(b=>b.r)), c0 = Math.min(...bs.map(b=>b.c)), r1 = Math.max(...bs.map(b=>b.r + b.rs - 1)), c1 = Math.max(...bs.map(b=>b.c + b.cs - 1));
  const all = blockCells(a, toid, r0, c0, r1, c1), set = new Set(ids);
  if(all.length!==set.size || all.some(id=>!set.has(id))) return { err:'The picked cells need to make a rectangle. Shift-click or drag to pick a block.' };
  return { a, toid, ids:all, r0, c0, rs:r1 - r0 + 1, cs:c1 - c0 + 1 };
}
function mergeCells(E){
  if(E.editing) finishTextEdit(E);
  const m = mergeCheck(E); if(m.err){ toast(m.err, true); return; }
  const { a, toid, ids, r0, c0, rs, cs } = m, lead = cellId(toid, r0, c0), c0f = cfgOf(E);
  // Text: the paragraphs with text in them, cell by cell in reading order.
  const paras = [];
  for(const id of ids){
    const d = cellDoc(E, a, id), ps = [...d.querySelectorAll('.pptx-p')].filter(p=>p.textContent.replace(/\u200b/g, '').trim());
    if(ps.length) paras.push(...ps.map(p=>p.outerHTML)); else if(d.textContent.replace(/\u200b/g, '').trim()) paras.push(d.innerHTML);
  }
  // Reveal: the setting of the picked cell the clicker reaches first.
  const has = id=>c0f.obj[id]==='hide' || c0f.obj[id]==='toggle', seq = edSeq(E);
  let first = null, best = Infinity;
  for(const id of ids) if(has(id)){ const i = seq.indexOf('o' + id), k = i < 0 ? 1e9 : i; if(k < best){ best = k; first = id; } }
  const mixed = new Set(ids.map(id=>has(id) ? c0f.obj[id] : '')).size > 1;
  const fr = first && stageRect(E, first), lr = stageRect(E, lead);
  E.cell = lead; E.cellSel = null; E.cellEnd = null; E.cellMode = false;
  change(E, c=>{
    const ta = tableOf(c, toid); if(!ta) return;
    const keep = first ? c.obj[first] : null, b = first && c.btn && c.btn['o' + first];
    for(const id of ids){ delete c.obj[id]; if(c.btn) delete c.btn['o' + id]; }
    if(keep){ c.obj[lead] = keep; if(b && fr && lr) c.btn['o' + lead] = { dx:Math.round((b.dx + fr.x - lr.x)*10)/10, dy:Math.round((b.dy + fr.y - lr.y)*10)/10 }; }
    if(c.order){
      const out = [];
      for(const k of c.order.map(k=>first && k==='o' + first ? 'o' + lead : k)) if(!out.includes(k) && !(k[0]==='o' && ids.includes(k.slice(1)) && k!=='o' + lead)) out.push(k);
      c.order = out;
    }
    for(const id of ids) if(id!==lead){ const x = tCell(ta, id); for(const k of Object.keys(x)) delete x[k]; }
    const L = tCell(ta, lead);
    if(paras.length) L.html = paras.join('');
    if(rs > 1) L.rs = rs; else delete L.rs;
    if(cs > 1) L.cs = cs; else delete L.cs;
  });
  toast(mixed ? 'Merged. It reveals as one cell, with the setting of the cell that revealed first.' : 'Cells merged');
}
// The picked merged cells (every merged cell in the table when none is picked).
function pickedMerged(E, a){ return (E.cell ? selCells(E) : tableCellIds(a, E.sel)).filter(id=>{ const b = cellBlock(a, id); return b.rs > 1 || b.cs > 1; }); }
function unmergeCells(E){
  if(E.editing) finishTextEdit(E);
  const toid = E.sel, a0 = tableOf(cfgOf(E), toid); if(!a0) return;
  const blocks = pickedMerged(E, a0).map(id=>cellBlock(a0, id));
  if(!blocks.length){ toast('Pick a merged cell first.', true); return; }
  const back = [];
  for(const b of blocks) for(let r = b.r; r < b.r + b.rs; r++) for(let c = b.c; c < b.c + b.cs; c++) back.push(cellId(toid, r, c));
  E.cell = back[0]; E.cellSel = back.length > 1 ? new Set(back) : null; E.cellEnd = null;
  change(E, c=>{
    const a = tableOf(c, toid); if(!a) return;
    for(const b of blocks){
      const L = tCell(a, cellId(toid, b.r, b.c)); delete L.rs; delete L.cs;
      for(let r = b.r; r < b.r + b.rs; r++) for(let cc = b.c; cc < b.c + b.cs; cc++){
        if(r===b.r && cc===b.c) continue;
        const x = tCell(a, cellId(toid, r, cc)); for(const k of Object.keys(x)) delete x[k];
        if(L.fill) x.fill = L.fill; if(L.va) x.va = L.va;
      }
    }
  });
  toast(blocks.length > 1 ? `${blocks.length} merged cells split back into their cells` : 'Cell unmerged');
}
// Before rows (rows=true) or columns in `gone` are taken out: merged cells lose those rows / columns. One whose
// top-left row / column goes moves to the first one left, with its text, fill, reveal setting and place in the order.
function spansBeforeDrop(c, a, toid, gone, rows){
  for(const g of PPTX.tableGeo(a)){
    const n = rows ? g.rs : g.cs; if(n < 2) continue;
    const start = rows ? g.r : g.c, keep = [];
    for(let i = start; i < start + n; i++) if(!gone.has(i)) keep.push(i);
    if(!keep.length || keep.length===n) continue;
    const from = cellId(toid, g.r, g.c), to = rows ? cellId(toid, keep[0], g.c) : cellId(toid, g.r, keep[0]);
    if(to!==from){
      const src = tCell(a, from), dst = tCell(a, to);
      for(const k of Object.keys(dst)) delete dst[k];
      Object.assign(dst, src); for(const k of Object.keys(src)) delete src[k];
      if(c.obj[from]!=null){ c.obj[to] = c.obj[from]; delete c.obj[from]; }
      if(c.btn && c.btn['o' + from]){ c.btn['o' + to] = c.btn['o' + from]; delete c.btn['o' + from]; }
      if(c.order) c.order = c.order.map(k=>k==='o' + from ? 'o' + to : k);
    }
    const cl = tCell(a, to), key = rows ? 'rs' : 'cs';
    if(keep.length > 1) cl[key] = keep.length; else delete cl[key];
  }
}
// Header-row text (white bold) or plain (black) for one cell's html, worked on a detached copy.
function headCellHtml(a, html, on){
  const d = document.createElement('div'); d.innerHTML = html || PPTX.cellTextHtml('Arial', a.table.tx);
  unfitText(d);
  for(const sp of cellSpans(d)){ sp.style.color = on ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'; sp.style.fontWeight = on ? '700' : '400'; }
  refitDetached(d); return d.innerHTML;
}
/* ---------- moving between cells (v1.70) ----------
   Not typing, a cell picked: arrow keys pick the next cell, Shift+arrow picks a block, Tab / Shift+Tab types in the
   next / previous cell. The whole table selected: an arrow key or Tab picks the first cell (tables don't move with
   the arrow keys; drag them). Typing in a cell: Tab / Shift+Tab go to the next / previous cell with its text
   selected (as PowerPoint), Tab in the last cell adds a row; arrow keys at the edge of the text go to the next cell. */
function typeInCell(E, id, where){
  if(E.editing) finishTextEdit(E);
  E.cellSel = null; E.cellEnd = null;
  startTextEdit(E, id);
  if(!E.editing || E.editing.oid!==id) return;
  const tx = E.editing.tx, sel = getSelection(), r = document.createRange();
  const texts = []; const w = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT); for(let n; (n = w.nextNode());) if(n.nodeValue.replace(/\u200b/g, '').length) texts.push(n);
  if(where==='all' && texts.length){ r.setStart(texts[0], 0); const last = texts[texts.length - 1]; r.setEnd(last, last.nodeValue.length); }
  else if(where==='start' && texts.length) r.setStart(texts[0], 0);
  else if(texts.length){ const last = texts[texts.length - 1]; r.setStart(last, last.nodeValue.length); }
  else { const sp = tx.querySelector('span:not(.pptx-bu)'); r.selectNodeContents(sp || tx); r.collapse(false); }
  sel.removeAllRanges(); sel.addRange(r); E.editing.range = r.cloneRange();
}
function tabCell(E, toid, cur, back){
  if(E.editing) finishTextEdit(E);
  const a = tableOf(cfgOf(E), toid); if(!a) return;
  const ids = tableCellIds(a, toid), i = ids.indexOf(cur);
  if(back){ if(i > 0) typeInCell(E, ids[i - 1], 'all'); else if(i===0) typeInCell(E, cur, 'all'); return; }
  if(i >= 0 && i < ids.length - 1){ typeInCell(E, ids[i + 1], 'all'); return; }
  // The last cell: a new row underneath, then type in its first cell.
  const nr = a.table.rows.length;
  E.sel = toid; E.cell = ids[ids.length - 1]; E.cellSel = null;
  tableOp(E, 'rowbelow');
  const a2 = tableOf(cfgOf(E), toid);
  if(a2 && a2.table.rows.length > nr) typeInCell(E, cellId(toid, nr, 0), 'end');
}
// Not typing: arrow keys / Tab with a table selected.
function cellKey(E, a, e){
  const toid = E.sel, ids = tableCellIds(a, toid);
  if(e.key==='Tab'){ if(E.cell) tabCell(E, toid, E.cell, e.shiftKey); else typeInCell(E, ids[e.shiftKey ? ids.length - 1 : 0], 'all'); return; }
  const d = { ArrowLeft:[0, -1], ArrowRight:[0, 1], ArrowUp:[-1, 0], ArrowDown:[1, 0] }[e.key]; if(!d) return;
  if(!E.cell){ E.cell = ids[0]; E.cellSel = null; E.cellEnd = null; buildEditOverlay(E); return; }
  if(e.shiftKey){
    const end = E.cellEnd && selCells(E).includes(E.cellEnd) ? E.cellEnd : E.cell;
    const nx = cellNext(a, toid, end, d[0], d[1]); if(nx) cellPick(E, toid, nx, 'range');
    return;
  }
  const nx = cellNext(a, toid, E.cell, d[0], d[1]); if(!nx) return;
  E.cell = nx; E.cellSel = null; E.cellEnd = null; buildEditOverlay(E);
}
// Is the caret at the edge of the text, in the direction of the arrow key? (Empty cells: always.)
function caretAtEdge(tx, key){
  const sel = getSelection(); if(!sel.rangeCount) return true;
  const r = sel.getRangeAt(0); if(!r.collapsed) return false;
  const clean = s=>s.replace(/\u200b/g, '');
  if(!clean(tx.textContent).trim()) return true;
  const before = document.createRange(); before.selectNodeContents(tx); before.setEnd(r.startContainer, r.startOffset);
  const after = document.createRange(); after.selectNodeContents(tx); after.setStart(r.endContainer, r.endOffset);
  const atStart = !clean(before.toString()).length, atEnd = !clean(after.toString()).length;
  if(key==='ArrowLeft') return atStart;
  if(key==='ArrowRight') return atEnd;
  // Up / Down: on the first / last line.
  const ps = [...tx.querySelectorAll('.pptx-p')], rects = r.getClientRects(), cr = rects.length ? rects[0] : null;
  if(!cr || !ps.length || !cr.height) return key==='ArrowUp' ? atStart : atEnd;
  const top = ps[0].getBoundingClientRect().top, bottom = ps[ps.length - 1].getBoundingClientRect().bottom;
  return key==='ArrowUp' ? cr.top - top < cr.height*0.6 : bottom - cr.bottom < cr.height*0.6;
}
// Typing in a cell: Tab, Shift+Tab and arrow keys at the edge of the text. True when the key was used.
function cellEditKey(E, e){
  const id = E.editing.oid, toid = cellTable(id), a = toid && tableOf(cfgOf(E), toid); if(!a) return false;
  if(e.key==='Tab'){ e.preventDefault(); tabCell(E, toid, id, e.shiftKey); return true; }
  if(e.shiftKey) return false; // Shift+arrows select text
  const d = { ArrowLeft:[0, -1], ArrowRight:[0, 1], ArrowUp:[-1, 0], ArrowDown:[1, 0] }[e.key]; if(!d) return false;
  if(!caretAtEdge(E.editing.tx, e.key)) return false;
  const nx = cellNext(a, toid, id, d[0], d[1]); if(!nx) return false;
  e.preventDefault();
  E.sel = toid; typeInCell(E, nx, d[0] > 0 || d[1] > 0 ? 'start' : 'end');
  return true;
}
function cellTargets(E, a){ const s = selCells(E); return s.length ? s : tableCellIds(a, E.sel); }
function cellPick(E, toid, cid, how){
  const a = tableOf(cfgOf(E), toid); if(!a) return;
  if(E.editing) finishTextEdit(E);
  E.cellEnd = how==='range' ? cid : null; // v1.70: the moving end for Shift+arrow
  if(how==='range' && E.cell){
    const ids = rangeCells(a, toid, E.cell, cid); // v1.70: merged cells count whole
    E.cellSel = ids.length > 1 ? new Set(ids) : null;
  } else if(how==='toggle' && E.cell){
    const set = new Set(selCells(E));
    if(set.has(cid)){ if(set.size > 1){ set.delete(cid); if(E.cell===cid) E.cell = [...set][0]; } }
    else { set.add(cid); E.cell = cid; }
    E.cellSel = set.size > 1 ? set : null;
  } else { E.cell = cid; E.cellSel = null; }
  E.sel = toid;
  buildEditOverlay(E);
}
// Table tab → Select: every cell, or the row / column of the picked cell.
function selectCells(E, which){
  const toid = E.sel, a = tableOf(cfgOf(E), toid); if(!a) return;
  if(E.editing) finishTextEdit(E);
  const [cr, cc] = E.cell ? cellRC(E.cell) : [0, 0];
  const ids = PPTX.tableGeo(a).filter(g=>which==='all' || (which==='row' ? g.r <= cr && cr < g.r + g.rs : g.c <= cc && cc < g.c + g.cs)).map(g=>cellId(toid, g.r, g.c)); // v1.70: merged cells in that row / column
  E.cell = E.cell && ids.includes(E.cell) ? E.cell : ids[0];
  E.cellSel = ids.length > 1 ? new Set(ids) : null;
  buildEditOverlay(E);
}
// A cell's text as a detached element (its saved html, or what's drawn), at its real sizes (not autofit-shrunk).
function cellDoc(E, a, id){
  const d = document.createElement('div');
  const [r, c] = cellRC(id), saved = ((a.table.cells[r] || [])[c] || {}).html;
  if(saved) d.innerHTML = saved;
  else { const e = objEl(E, id), tx = e && e.querySelector(':scope > .pptx-tx'); d.innerHTML = tx ? tx.innerHTML : PPTX.cellTextHtml('Arial', a.table.tx); }
  unfitText(d);
  return d;
}
const cellSpans = d=>[...d.querySelectorAll('span:not(.pptx-bu)')];
// Keep each paragraph's size / line height in step with its largest text (refitParas, for text not on screen).
function refitDetached(d){
  for(const sp of d.querySelectorAll('span')){ const fs = parseFloat(sp.style.fontSize); if(fs) sp.dataset.fs = fs; }
  for(const p of d.querySelectorAll('.pptx-p')){
    const sizes = [...p.querySelectorAll('span:not(.pptx-bu)')].map(x=>parseFloat(x.style.fontSize)).filter(n=>n > 0);
    if(!sizes.length) continue;
    const fs = Math.max(...sizes), old = Number(p.dataset.fs) || parseFloat(p.style.fontSize) || fs;
    if(Math.abs(fs - old) < 0.01 && p.dataset.fs) continue;
    const kk = fs/old, lh = (Number(p.dataset.lh) || old*1.2)*kk;
    p.dataset.fs = fs; p.dataset.lh = +lh.toFixed(2); p.dataset.top = (Number(p.dataset.top) || 0)*kk;
    p.style.fontSize = fs + 'px'; p.style.lineHeight = p.dataset.lh + 'px';
    if(p.style.top) p.style.top = p.dataset.top + 'px';
  }
}
// Change the text of the picked cells (every cell when none is picked) in one undo step. fn(doc, id) edits a detached copy.
function editCells(E, fn, extra){
  if(E.editing) finishTextEdit(E);
  const toid = E.sel, a0 = tableOf(cfgOf(E), toid); if(!a0) return;
  const out = cellTargets(E, a0).map(id=>{ const d = cellDoc(E, a0, id); fn(d, id); refitDetached(d); return [id, d.innerHTML]; });
  change(E, c=>{ const a = tableOf(c, toid); if(!a) return; for(const [id, html] of out) tCell(a, id).html = html; if(extra) extra(a); });
}
function cellsInfo(E){ const a = tableOf(cfgOf(E), E.sel); return a ? (textInfo(E, cellTargets(E, a)[0]) || {}) : {}; }
function cellsFont(E, f){ if(!f) return; const ff = `"${f}", "Segoe UI", Arial, sans-serif`; editCells(E, d=>{ for(const x of d.querySelectorAll('span:not(.pptx-bu), .pptx-p')) x.style.fontFamily = ff; }); }
function cellsSize(E, dir){
  const cur = cellsInfo(E).size || 24;
  // v1.78: each run steps from its own size (was: all set to one step above the first cell's size).
  editCells(E, d=>{ for(const sp of cellSpans(d)) sp.style.fontSize = stepFontSize(parseFloat(sp.style.fontSize) || cur, dir) + 'px'; });
}
// v1.71: a style on a cell's text (inline style, or the tag it was made with).
function spanHasStyle(sp, k){
  if(k==='b') return sp.style.fontWeight ? parseInt(sp.style.fontWeight, 10) >= 600 : !!sp.closest('b,strong');
  if(k==='i') return sp.style.fontStyle ? sp.style.fontStyle === 'italic' : !!sp.closest('i,em');
  return sp.style.textDecoration ? sp.style.textDecoration.includes('underline') : !!sp.closest('u');
}
// v1.71: Ctrl+B / I / U on picked cells, as PowerPoint: removes the style when every picked cell already has it, otherwise adds it to all.
function cellsStyle(E, k){
  const a = tableOf(cfgOf(E), E.sel); if(!a) return;
  const allHave = cellTargets(E, a).every(id=>{ const sps = cellSpans(cellDoc(E, a, id)); return sps.length > 0 && sps.every(sp=>spanHasStyle(sp, k)); });
  const on = !allHave;
  editCells(E, d=>{
    for(const t of [...d.querySelectorAll(k==='b' ? 'b,strong' : k==='i' ? 'i,em' : 'u')]) t.replaceWith(...t.childNodes);
    for(const sp of cellSpans(d)){
      if(k==='b') sp.style.fontWeight = on ? '700' : '400';
      if(k==='i') sp.style.fontStyle = on ? 'italic' : 'normal';
      if(k==='u') sp.style.textDecoration = on ? 'underline' : 'none';
    }
  });
}
// v1.87: text colour from the ribbon (popover or quick swatch); the last colours used are offered beside the current one.
function applyTextColour(E, color){
  colStore.push('sv_recent_text', color, 6);
  withText(E, ()=>fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, color); }));
}
function applyCellColour(E, color){ colStore.push('sv_recent_text', color, 6); cellsColor(E, color); }
// The Colour group for text (spec §8): the current colour, the 2 last used, then ▾ for More colours.
function rbTextColourGroup(cur, act, moreAct){
  const recent = colStore.get('sv_recent_text').filter(c=>c.toLowerCase()!==cur.toLowerCase()).slice(0, 2);
  return rbGroup('Colour', rbBtn(act, null, '', { cls:'ic', v:cur, pre:`<span class="rb-tcol" style="border-bottom-color:${cur}">A</span>`, title:'Text colour: apply the current colour again' })
    + recent.map(c=>rbQuick(act, c, 'Last used ' + c)).join('')
    + rbBtn(moreAct, null, '', { cls:'ic', pre:'', dd:true, title:'More colours' }));
}
// A small colour dot inside a pill: act / value as for rbBtn. value 'none' = the red-slash swatch, 'deck' = the deck's own.
function rbQuick(act, value, label, on){
  const cls = value==='none' ? ' none' : value==='deck' ? ' deck' : '';
  return `<button class="rb-dot sm${cls}${on ? ' on' : ''}" data-r="${act}" data-v="${value}" style="--c:${value==='none' || value==='deck' ? '#fff' : value}" data-tip="${esc(label)}" aria-label="${esc(label)}"${on !== undefined ? ` aria-pressed="${on ? 'true' : 'false'}"` : ''}></button>`;
}
function cellsColor(E, col){ editCells(E, d=>{ for(const t of [...d.querySelectorAll('font[color]')]) t.removeAttribute('color'); for(const sp of cellSpans(d)) sp.style.color = col; }); }
function cellsAlign(E, v){ editCells(E, d=>{ for(const p of d.querySelectorAll('.pptx-p')) p.style.textAlign = v; }); }
function cellsVAlign(E, v){
  if(E.editing) finishTextEdit(E);
  const toid = E.sel, a0 = tableOf(cfgOf(E), toid); if(!a0) return;
  const ids = cellTargets(E, a0);
  change(E, c=>{ const a = tableOf(c, toid); if(!a) return; for(const id of ids){ const cl = tCell(a, id); if(v==='m' && !a.table.va) delete cl.va; else cl.va = v; } });
}
// Delete / Backspace with cells picked: empty them (their formatting stays), rather than deleting the table.
function clearCells(E){
  editCells(E, d=>{
    const p = d.querySelector('.pptx-p'), sp = p && p.querySelector('span:not(.pptx-bu)');
    if(!p || !sp){ d.innerHTML = ''; return; }
    const p2 = p.cloneNode(false), s2 = sp.cloneNode(false); s2.textContent = '​'; p2.appendChild(s2); d.replaceChildren(p2);
  });
}
/* Table styles (v1.34). Applying one clears cell fills; the black top row also makes its text white and bold
   (and taking it away puts that text back to black). */
const TT_BLACK = '#000000', TT_LW = 2;
const TABLE_TEMPLATES = [
  { id:'grid', name:'Borders', title:'No fill, medium black border' },
  { id:'plain', name:'No borders', title:'No fill, no border' },
  { id:'head', name:'Black top row', title:'Top row black with white text, medium black border' },
];
function tableTemplate(a){
  if(a.fill!=='transparent' || a.table.cells.some(row=>row.some(cl=>cl && cl.fill))) return '';
  if(a.line==='none') return a.table.head ? '' : 'plain';
  if(a.line!==TT_BLACK || a.lw!==TT_LW || a.dash) return '';
  return a.table.head===TT_BLACK ? 'head' : !a.table.head ? 'grid' : '';
}
function ttPreview(id){
  const grid = id==='plain' ? 'stroke="#9aa0aa" stroke-width=".8" stroke-dasharray="2 1.5"' : 'stroke="#111" stroke-width="1.4"';
  return `<svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">${id==='head' ? '<rect x="1" y="1" width="32" height="7.33" fill="#111"/>' : ''}`
    + `<g fill="none" ${grid}><rect x="1" y="1" width="32" height="22"/><path d="M11.67 1v22M22.33 1v22M1 8.33h32M1 15.67h32"/></g></svg>`;
}
// Row-0 text for a header (white bold) or a plain row (black).
function headRowHtml(E, a, toid, r, on){
  return a.table.cols.map((_, j)=>{ const d = cellDoc(E, a, toid + '.' + r + '.' + j); for(const sp of cellSpans(d)){ sp.style.color = on ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'; sp.style.fontWeight = on ? '700' : '400'; } refitDetached(d); return d.innerHTML; });
}
function applyTableTemplate(E, id){
  if(E.editing) finishTextEdit(E);
  const toid = E.sel, a0 = tableOf(cfgOf(E), toid); if(!a0) return;
  const head = id==='head', redo = head || !!a0.table.head;
  const html = redo ? headRowHtml(E, a0, toid, 0, head) : null;
  change(E, c=>{
    const a = tableOf(c, toid); if(!a) return;
    a.fill = 'transparent'; delete a.dash;
    if(id==='plain') a.line = 'none'; else { a.line = TT_BLACK; a.lw = TT_LW; }
    if(head) a.table.head = TT_BLACK; else delete a.table.head;
    for(const row of a.table.cells) for(const cl of row) if(cl) delete cl.fill;
    if(html) html.forEach((h, j)=>{ tCell(a, toid + '.0.' + j).html = h; });
  });
}
// Selected table: the selected cell, cells set to reveal, and handles on the inside borders to resize rows / columns.
function tableOverlay(E, c, o){
  const st = E.stage, ui = st.ui, k = st.k, a = tableOf(c, o.oid); if(!a) return;
  const cells = (st.objects || []).filter(q=>q.cell && q.table===o.oid);
  for(const q of cells){
    const s = c.obj[q.oid];
    if(s){ const m = el('div', 'ed-cellmark ' + s, `<span>${s==='hide' ? 'Hidden' : 'Can hide'}</span>`); placeBox(m, q, k); ui.appendChild(m); }
  }
  const picked = new Set(selCells(E));
  for(const q of cells) if(picked.has(q.oid)){ const m = el('div', 'ed-cell'); placeBox(m, q, k); ui.appendChild(m); }
  const sc = picked.size===1 && !E.cellMode && cells.find(q=>q.oid===E.cell);
  if(sc){ const s = c.obj[sc.oid]; if(s==='hide' || s==='toggle') btnPreview(E, c, 'o'+sc.oid, s==='toggle', sc); }
  // Border handles (not while a cell is picked, so a tap on a cell isn't taken by a handle).
  const t = a.table, cw = t.cols.map(v=>v/t.cols.reduce((n, x)=>n + x, 0)), rh = t.rows.map(v=>v/t.rows.reduce((n, x)=>n + x, 0));
  // v1.70: lo / hi = the stretch of the line the handle covers (fractions along it), so it never sits over a merged cell.
  const handle = (vert, i, pos, lo0 = 0, hi0 = 1)=>{
    const hd = el('div', 'ed-tb-h ' + (vert ? 'col' : 'row'));
    const place = p=>{ if(vert) Object.assign(hd.style, { left:((a.x + p*a.w)*k - 5) + 'px', top:((a.y + lo0*a.h)*k) + 'px', height:((hi0 - lo0)*a.h*k) + 'px' }); else Object.assign(hd.style, { top:((a.y + p*a.h)*k - 5) + 'px', left:((a.x + lo0*a.w)*k) + 'px', width:((hi0 - lo0)*a.w*k) + 'px' }); };
    place(pos);
    hd.title = vert ? 'Drag to change the column widths' : 'Drag to change the row heights';
    hd.addEventListener('pointerdown', e=>{
      if(e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      const f = vert ? cw : rh, lo = pos - f[i], hi = pos + f[i+1], min = 0.04, sx = vert ? e.clientX : e.clientY;
      let p = pos;
      try{ hd.setPointerCapture(e.pointerId); }catch(_){}
      hd.classList.add('drag');
      const mv = ev=>{ p = Math.min(hi - min, Math.max(lo + min, pos + ((vert ? ev.clientX : ev.clientY) - sx)/k/(vert ? a.w : a.h))); place(p); };
      const up = ev=>{
        hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
        hd.classList.remove('drag');
        if(ev.type!=='pointerup' || Math.abs(p - pos) < 0.002) return;
        const r3 = v=>Math.round(v*10000)/10000;
        change(E, c=>{ const x = tableOf(c, o.oid); if(!x) return; const nf = f.slice(); nf[i] = r3(p - lo); nf[i+1] = r3(hi - p); x.table[vert ? 'cols' : 'rows'] = nf; });
      };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
    ui.appendChild(hd);
  };
  if(!E.cell && !E.cellMode){
    // v1.70: a handle for each stretch of a line between merged cells (none where a merged cell covers the line).
    const own = PPTX.tableSpans(t).own, same = (p, q)=>p[0]===q[0] && p[1]===q[1];
    const cx = [0], ry = [0]; for(const v of cw) cx.push(cx[cx.length - 1] + v); for(const v of rh) ry.push(ry[ry.length - 1] + v);
    const runs = (n, open, edges, put)=>{ let st = -1; for(let j = 0; j <= n; j++){ const o = j < n && open(j); if(o && st < 0) st = j; if(!o && st >= 0){ put(edges[st], edges[j]); st = -1; } } };
    for(let i = 0; i < cw.length - 1; i++) runs(rh.length, r=>!same(own[r][i], own[r][i + 1]), ry, (lo, hi)=>handle(true, i, cx[i + 1], lo, hi));
    for(let i = 0; i < rh.length - 1; i++) runs(cw.length, c=>!same(own[i][c], own[i + 1][c]), cx, (lo, hi)=>handle(false, i, ry[i + 1], lo, hi));
  }
}
// Insert → Table: pick the size on a grid.
function tablePicker(E, anchor){
  closeMenus();
  const R = 10, C = 8;
  const m = el('div', 'menu ed-tpick');
  m.innerHTML = `<div class="ed-cpop-t">Table <span class="ed-tpick-n">3 × 3</span></div><div class="ed-tpick-g" style="grid-template-columns:repeat(${C}, 22px)">`
    + Array.from({ length:R*C }, (_, i)=>`<button data-r="${Math.floor(i/C) + 1}" data-c="${i%C + 1}"></button>`).join('') + '</div>';
  const mark = (r, c)=>{ $$('button', m).forEach(b=>b.classList.toggle('on', Number(b.dataset.r) <= r && Number(b.dataset.c) <= c)); $('.ed-tpick-n', m).textContent = `${r} row${r>1?'s':''} × ${c} column${c>1?'s':''}`; };
  m.addEventListener('pointerover', e=>{ const b = e.target.closest('button[data-r]'); if(b) mark(Number(b.dataset.r), Number(b.dataset.c)); });
  m.addEventListener('pointerdown', e=>e.stopPropagation());
  m.onclick = e=>{ const b = e.target.closest('button[data-r]'); if(!b) return; e.stopPropagation(); closeMenus(); addTable(E, Number(b.dataset.r), Number(b.dataset.c)); };
  document.body.appendChild(m);
  mark(3, 3);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
}
function addTable(E, rows, cols){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const W = E.stage.W, H = E.stage.H;
  const w = Math.round(Math.min(W*0.85, cols*190)), h = Math.round(Math.min(H*0.8, rows*48));
  // v1.34: no fill, medium black border; Arial 24, middle left.
  const a = { id:uid(), x:Math.round((W - w)/2), y:Math.round((H - h)/2), w, h, fill:'transparent', line:TT_BLACK, lw:TT_LW,
    table:{ cols:Array(cols).fill(1), rows:Array(rows).fill(1), cells:Array.from({ length:rows }, ()=>Array.from({ length:cols }, ()=>({}))), tx:{ font:'Arial', size:24, align:'left' } } };
  clearMulti(E); E.sel = 'n' + a.id; E.cell = null; E.cellSel = null; E.selCover = null;
  change(E, c=>{ c.added.push(a); });
  E.tab = 'table'; renderRibbon(E);
}
// Move the saved cell states (and reveal-button positions) when rows / columns are added or taken away.
// map(r, c) → [r, c] or null (the cell has gone).
function remapCells(c, toid, map){
  const pre = toid + '.';
  for(const key of ['obj','btn']){
    const src = c[key] || {}, moved = {};
    for(const k of Object.keys(src)){
      const raw = key==='btn' ? (k[0]==='o' ? k.slice(1) : null) : k;
      if(!raw || !raw.startsWith(pre)) continue;
      const [r, cc] = cellRC(raw), to = map(r, cc);
      if(to) moved[(key==='btn' ? 'o' : '') + pre + to[0] + '.' + to[1]] = src[k];
      delete src[k];
    }
    Object.assign(src, moved);
  }
  // v1.53: the reveal order follows the cells too.
  if(c.order) c.order = c.order.map(key=>{
    if(key[0]!=='o' || !key.slice(1).startsWith(pre)) return key;
    const [r, cc] = cellRC(key.slice(1)), to = map(r, cc);
    return to ? 'o' + pre + to[0] + '.' + to[1] : null;
  }).filter(Boolean);
}
function tableOp(E, how){
  const toid = E.sel, c0 = cfgOf(E), a0 = tableOf(c0, toid); if(!a0) return;
  // v1.70: deleting goes through deleteCellLines (it knows about merged cells).
  if(how==='delrow' || how==='delcol'){ if(!E.cell){ const ids = tableCellIds(a0, toid); E.cell = ids[ids.length - 1]; E.cellSel = null; } deleteCellLines(E, how==='delrow'); return; }
  const [cr, cc] = E.cell ? cellRC(E.cell) : [a0.table.rows.length - 1, a0.table.cols.length - 1];
  const blk = E.cell ? cellBlock(a0, E.cell) : { rs:1, cs:1 }; // v1.70: below / right of a merged cell = after its whole block
  const nc = a0.table.cols.length;
  if(how==='rowabove' && cr===0 && a0.table.head){ toast('Added below the top row: the top row stays the header'); how = 'rowbelow'; }
  let cell = E.cell;
  E.cellSel = null;
  change(E, c=>{
    const a = tableOf(c, toid), t = a.table;
    const fr = f=>f.map(v=>v/f.reduce((n, x)=>n + x, 0));
    if(how==='rowabove' || how==='rowbelow'){
      const at = how==='rowabove' ? cr : cr + blk.rs, rh = fr(t.rows), add = rh[cr];
      // v1.70: a merged cell the new row goes through gets one row taller.
      t.cells.forEach((row, r)=>(row || []).forEach(cl=>{ if(cl && cl.rs > 1 && r < at && r + cl.rs > at) cl.rs++; }));
      t.rows = rh.map(v=>v*a.h); t.rows.splice(at, 0, add*a.h);
      a.h = Math.round(a.h*(1 + add)); t.rows = fr(t.rows).map(v=>Math.round(v*10000)/10000);
      t.cells.splice(at, 0, Array.from({ length:nc }, (_, j)=>{ const src = (t.cells[cr] || [])[j] || {}, n = {}; if(src.fill) n.fill = src.fill; if(src.va) n.va = src.va; return n; }));
      remapCells(c, toid, (r, x)=>[r >= at ? r + 1 : r, x]);
      if(cell) cell = toid + '.' + (how==='rowabove' ? cr + 1 : cr) + '.' + cc;
    }
    if(how==='colleft' || how==='colright'){
      const at = how==='colleft' ? cc : cc + blk.cs, cw = fr(t.cols);
      t.cells.forEach(row=>(row || []).forEach((cl, j)=>{ if(cl && cl.cs > 1 && j < at && j + cl.cs > at) cl.cs++; })); // v1.70
      cw.splice(at, 0, cw[cc]); t.cols = fr(cw).map(v=>Math.round(v*10000)/10000);
      for(const row of t.cells){ const src = row[cc] || {}, n = {}; if(src.fill) n.fill = src.fill; if(src.va) n.va = src.va; row.splice(at, 0, n); }
      remapCells(c, toid, (r, x)=>[r, x >= at ? x + 1 : x]);
      if(cell) cell = toid + '.' + cr + '.' + (how==='colleft' ? cc + 1 : cc);
    }
    E.cell = cell;
  });
}
/* v1.53.2: delete every row (rows=true) or column that has a picked cell, in one undo step.
   Deleting the header row of a table with a header makes the first row left the header (as tableOp). */
function cellLines(E, rows){
  const a = tableOf(cfgOf(E), E.sel), out = new Set();
  for(const id of selCells(E)){ // v1.70: every row / column a merged cell covers
    const b = a ? cellBlock(a, id) : { r:cellRC(id)[0], c:cellRC(id)[1], rs:1, cs:1 }, s = rows ? b.r : b.c, n = rows ? b.rs : b.cs;
    for(let i = s; i < s + n; i++) out.add(i);
  }
  return [...out].sort((x, y)=>x - y);
}
function deleteCellLines(E, rows){
  const toid = E.sel, a0 = tableOf(cfgOf(E), toid); if(!a0) return;
  const idx = cellLines(E, rows); if(!idx.length){ toast('Pick a cell first.', true); return; }
  const n = rows ? a0.table.rows.length : a0.table.cols.length, what = rows ? 'row' : 'column';
  if(idx.length >= n){ toast(`That's every ${what}. Delete the table instead (right-click → Delete table).`, true); return; }
  if(E.editing) finishTextEdit(E);
  const gone = new Set(idx), keep = [...Array(n).keys()].filter(i=>!gone.has(i)), to = new Map(keep.map((i, j)=>[i, j]));
  const newHead = rows && a0.table.head && gone.has(0);
  E.cell = null; E.cellSel = null; E.cellMode = false;
  change(E, c=>{
    const a = tableOf(c, toid); if(!a) return;
    const t = a.table, fr = f=>f.map(v=>v/f.reduce((s, x)=>s + x, 0)), r4 = v=>Math.round(v*10000)/10000;
    spansBeforeDrop(c, a, toid, gone, rows); // v1.70
    if(rows){
      const rh = fr(t.rows), lost = idx.reduce((s, i)=>s + rh[i], 0);
      t.rows = fr(rh.filter((_, i)=>!gone.has(i))).map(r4); a.h = Math.max(20, Math.round(a.h*(1 - lost)));
      t.cells = t.cells.filter((_, i)=>!gone.has(i));
      // The first row left becomes the header: white bold text (v1.70: worked out after merged cells have moved).
      if(newHead){ const row = t.cells[0] || (t.cells[0] = []); for(let j = 0; j < t.cols.length; j++){ const cl = row[j] || (row[j] = {}); cl.html = headCellHtml(a, cl.html, true); delete cl.fill; } }
      remapCells(c, toid, (r, x)=>to.has(r) ? [to.get(r), x] : null);
    } else {
      t.cols = fr(fr(t.cols).filter((_, i)=>!gone.has(i))).map(r4);
      for(const row of t.cells) for(let k = idx.length - 1; k >= 0; k--) row.splice(idx[k], 1);
      remapCells(c, toid, (r, x)=>to.has(x) ? [r, to.get(x)] : null);
    }
  });
  toast(`${idx.length} ${what}${idx.length > 1 ? 's' : ''} deleted · Undo or Ctrl+Z to bring ${idx.length > 1 ? 'them' : 'it'} back`);
}
function fillCells(E, scope, color){
  const toid = E.sel; if(!tableOf(cfgOf(E), toid)) return;
  const [cr, cc] = E.cell ? cellRC(E.cell) : [-1, -1], picked = new Set(selCells(E));
  change(E, c=>{
    const a = tableOf(c, toid);
    if(scope==='all'){ for(const row of a.table.cells) for(const cl of (row || [])) if(cl) delete cl.fill; a.fill = color==='none' ? 'transparent' : color; return; }
    for(const g of PPTX.tableGeo(a)){ // v1.70: drawn cells; a merged cell is in every row / column it covers
      const id = cellId(toid, g.r, g.c);
      const hit = scope==='cell' ? picked.has(id) : scope==='row' ? g.r <= cr && cr < g.r + g.rs : g.c <= cc && cc < g.c + g.cs;
      if(!hit) continue;
      const cl = tCell(a, id);
      if(color==='none') cl.fill = 'transparent'; else if(color) cl.fill = color; else delete cl.fill;
    }
  });
}
function setCellState(E, v){
  const ids = E.cell ? selCells(E) : E.editing && cellTable(E.editing.oid) ? [E.editing.oid] : []; if(!ids.length) return;
  if(E.editing) finishTextEdit(E);
  change(E, c=>{ for(const id of ids){ if(v) c.obj[id] = v; else delete c.obj[id]; } });
}
/* Table tab (v1.34): picking cells, rows and columns, and the table's look. The picked cells' reveal setting is on
   the Reveal tab and their font / alignment / fill on the Format tab, as for any other object. */
function rbTable(E){
  const toid = E.sel, c = cfgOf(E), a = tableOf(c, toid); if(!a) return rbNote('Select the table.');
  const cell = E.cell, tpl = tableTemplate(a);
  // v1.87 (spec §8): Cells · Rows & columns · Style ▾ · All-cells fill and Borders. Merge is on the Cells tab only.
  return rbGroup('Cells', rbI('cellmode', 'selRow', E.cellMode ? 'Done selecting: finish picking cells' : 'Select cells: click cells to pick them, or drag across several', { on:!!E.cellMode })
      + rbSep + rbI('csel', 'table', 'All cells: pick every cell (or Shift-click / Ctrl-click cells on the slide)', { v:'all' })
      + rbI('csel', 'selRow', 'Row: pick the whole row of the picked cell', { v:'row', dis:!cell }) + rbI('csel', 'selCol', 'Column: pick the whole column of the picked cell', { v:'col', dis:!cell }))
    + rbGroup('Rows & columns', rbI('tins', 'plus', 'Insert: add a row or column next to the picked cell', { dd:true })
      + rbI('tdel', 'trash', cell ? 'Delete: delete the picked cell’s row or column' : 'Delete: pick a cell first', { dd:true, dis:!cell, cls:'ic danger' }))
    + rbGroup('Style', rbBtn('ttplmenu', null, TABLE_TEMPLATES.find(t=>t.id===tpl)?.name || 'Style ▾', { dd:true, title:'Table style: ' + (TABLE_TEMPLATES.find(t=>t.id===tpl)?.title || 'choose how the table looks') })
      + rbSep + rbBtn('tfillall', null, '', { cls:'ic', pre:rbSw(a.fill || '#fff'), dd:true, title:'All cells fill: fill every cell (clears cell fills)' })
      + rbBtn('line', null, '', { cls:'ic', pre:rbSw(a.line==='none' ? 'none' : a.line || PPTX.TABLE_DEFAULT.line, true), dd:true, title:'Borders: colour, thickness and style' }));
}
const rbSw = (v, ring)=>`<span class="ed-sw${ring ? ' ring' : ''}${!v || v==='none' || v==='transparent' ? ' none' : ''}" style="--c:${v && v!=='none' && v!=='transparent' ? v : '#fff'}"></span>`;
// Format tab for a table: font and alignment of the picked cells (all cells when none is picked).
function rbCellFormat(E, a){
  const n = selCells(E).length, anchor = cellTargets(E, a)[0], ti = textInfo(E, anchor) || {};
  const [ar, ac] = cellRC(anchor), acl = (a.table.cells[ar] || [])[ac] || {}, va = acl.va || a.table.va || 'm';
  const ap = (objEl(E, anchor) || document.body).querySelector('.pptx-p'), ha = ap ? ap.style.textAlign || 'left' : '';
  const fonts = [...new Set([ti.font, 'Arial', ...slideFonts(E), ...RB_FONTS].filter(Boolean))];
  const scope = n > 1 ? `${n} cells` : n ? 'this cell' : 'all cells';
  const fw = Math.max(96, Math.min(230, 44 + (ti.font || 'Arial').length * 8));
  return rbGroup(`Font (${scope})`, `<select class="rb-font" data-r="cfont" data-tip="Font" aria-label="Font" style="width:${fw}px">${fonts.map(f=>`<option${f===ti.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`)
    + rbGroup('Size', rbI('csize', 'minus', 'Smaller', { v:-1 }) + `<span class="rb-fs" title="Font size (pt)">${ti.size || ''}</span>` + rbI('csize', 'plus', 'Bigger', { v:1 }))
    + rbGroup('Format', rbBtn('cstyle', null, '', { v:'b', cls:'ic tb', pre:'<b>B</b>', on:ti.b, title:'Bold' }) + rbBtn('cstyle', null, '', { v:'i', cls:'ic tb', pre:'<i>I</i>', on:ti.i, title:'Italic' }) + rbBtn('cstyle', null, '', { v:'u', cls:'ic tb', pre:'<u>U</u>', on:ti.u, title:'Underline' }))
    + rbTextColourGroup(ti.color || '#000000', 'ccolorq', 'ccolor')
    + rbGroup('Align', rbI('chalmenu', ha==='center' ? 'alignC' : ha==='right' ? 'alignR' : 'alignL', 'Align across: left, centre or right', { dd:true })
      + rbI('cvalmenu', va==='t' ? 'vT' : va==='b' ? 'vB' : 'vM', 'Align down: top, middle or bottom of the cell', { dd:true }));
}
function rbCellFill(E, a){
  const n = selCells(E).length;
  return rbGroup('Fill', rbBtn('cfill', null, '', { cls:'ic', pre:rbSw(tCell(a, E.cell).fill || (a.fill==='transparent' ? 'none' : a.fill) || '#fff'), dd:true, title:n > 1 ? 'Cells fill: fill the picked cells' : 'Cell fill' })
      + rbBtn('rfill', null, '', { cls:'ic', pre:rbSw('#fff'), dd:true, title:'Row fill: fill the whole row' }) + rbBtn('kfill', null, '', { cls:'ic', pre:rbSw('#fff'), dd:true, title:'Column fill: fill the whole column' })
      + (n===1 ? rbSep + rbI('ctype', 'text', 'Type in it: edit this cell’s text (or double-tap it, or Enter)') : ''))
    + rbSpacer + rbGroup('Cells', rbI('tmerge', 'merge', 'Merge: join the picked cells into one (pick a block of cells first)', { dis:!!mergeCheck(E).err })
      + rbI('tsplit', 'unmerge', 'Unmerge: split the picked merged cell back into its cells', { dis:!(E.cell && pickedMerged(E, a).length) }));
}
// Faint, draggable copy of the presenter's reveal / hide button for the selected
// item. Dragging it saves its position (cfg.btn) as an offset from the item's
// top-left. A dashed line joins it to the item when it sits outside it.
function btnPreview(E, c, key, isHide, rect){
  const st = E.stage, ui = st.ui, k = st.k;
  const p = btnPos(st, c, key, isHide); if(!p) return;
  const R = 22/k; // keep the whole button on the slide, as in the presenter
  const clampP = q=>({ x:Math.min(st.W - R, Math.max(R, q.x)), y:Math.min(st.H - R, Math.max(R, q.y)) });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'ed-link');
  svg.setAttribute('width', st.W*k); svg.setAttribute('height', st.H*k);
  const ln = document.createElementNS(NS, 'line'); svg.appendChild(ln); ui.appendChild(svg);
  const b = el('button', 'reveal-btn ed-btn', icon(isHide ? 'eyeOff' : 'eye'));
  b.title = 'Drag to move where this button appears when presenting';
  const draw = q=>{
    b.style.left = q.x*k + 'px'; b.style.top = q.y*k + 'px';
    // Nearest point on the item's outline; no line when the button is over the item.
    const nx = Math.min(rect.x + rect.w, Math.max(rect.x, q.x)), ny = Math.min(rect.y + rect.h, Math.max(rect.y, q.y));
    const far = Math.hypot(q.x - nx, q.y - ny)*k > 24;
    svg.style.display = far ? '' : 'none';
    ln.setAttribute('x1', q.x*k); ln.setAttribute('y1', q.y*k); ln.setAttribute('x2', nx*k); ln.setAttribute('y2', ny*k);
  };
  let q = clampP(p); draw(q);
  b.addEventListener('pointerdown', e=>{
    if(e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, q0 = q; let moved = false;
    b.setPointerCapture(e.pointerId); b.classList.add('drag');
    const mv = ev=>{
      if(!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true; q = clampP({ x:q0.x + (ev.clientX - sx)/k, y:q0.y + (ev.clientY - sy)/k }); draw(q);
    };
    const up = ev=>{
      b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
      b.classList.remove('drag');
      if(!moved || ev.type!=='pointerup') return;
      const r1 = v=>Math.round(v*10)/10;
      change(E, c=>{ c.btn[key] = { dx:r1(q.x - rect.x), dy:r1(q.y - rect.y) }; });
    };
    b.addEventListener('pointermove', mv); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
  b.onclick = e=>e.stopPropagation();
  ui.appendChild(b);
}
// Status line under the slide: what a tap / drag does right now.
function edHint(E){
  const h = $('#ed-hint'); if(!h) return;
  const gone = !!(E.v.ent(E.i) && E.v.ent(E.i).del);
  h.textContent = gone ? 'This slide is deleted. Right-click it in the strip and Restore, or Slides → Restore.'
    : E.crop ? 'Crop: drag the edges of the picture. Esc or Done cropping when finished.'
    : E.adjust ? 'Move picture: drag the picture to choose which part shows in the frame. Esc or Done when finished.'
    : E.orderMode ? 'Set reveal order: click the items in the order the clicker should reveal them. Esc or Done when finished.'
    : E.drawCover ? 'Drag on the slide to draw cover boxes, or click to place one. The tool stays on: Reveal → Done (or Esc, or the grey area) when finished.'
    : E.drawText ? `Drag on the slide to draw the ${E.drawText==='head' ? 'header' : 'text box'} (its width), or click to place it, then type. Esc cancels.`
    : E.editing && cellTable(E.editing.oid) ? 'Typing in a cell. Tab / Shift+Tab: next / previous cell (Tab in the last cell adds a row). Arrow keys at the edge of the text move to the next cell. Esc to finish.'
    : E.editing ? 'Typing. Click outside the box or press Esc to finish. Font, size and accents are on the Object tab.'
    : E.cellMode ? 'Select cells: click cells to pick or unpick them, or drag across several. Then set their reveal on the Reveal tab. Esc or Done selecting when finished.'
    : qaWhole(E) ? 'Q&A selected: drag to move it, the handles round it to resize it all (text keeps its size). Click one box again to select just that one; double-click text to type. The Q&A settings tab sets the questions, size and divider.'
    : selGroup(E) ? 'Group selected: drag to move it, the handles round it to resize it all (text keeps its size). Click one object again to select just that one; double-click text to type. Right-click for more.'
    : isMulti(E) ? `${E.selO.size} objects selected: drag one to move them all, the handles round them to resize them together, arrow keys to nudge. Ctrl / Shift-click adds or removes one. Selection → Group keeps them together.`
    : enteredGroup(E) ? 'One object in a group: format it, or drag to move just this one. Click another of the group to switch; Esc selects the whole group.'
    : E.cell && selCells(E).length > 1 ? `${selCells(E).length} cells picked: the Reveal tab and the formatting apply to all of them; Table → Merge joins them. Delete empties them. Esc goes back to the whole table.`
    : E.cell ? 'Cell picked: the Reveal tab sets it up, click it (or Enter / Tab) to type. Arrow keys pick the next cell, Shift+arrow picks a block. Esc goes back to the whole table.'
    : E.sel && tableOf(cfgOf(E), E.sel) ? 'Table selected: drag to move it, handles to resize, drag the inside lines for row / column sizes. Click a cell to type; arrow keys or Tab pick a cell. Right-click for more.'
    : E.sel || E.selCover ? 'Drag to move (it snaps to the slide and other objects; hold Alt to stop it), handles to resize, arrow keys to nudge. Right-click for more.'
    : E.mode==='pptx' ? 'Click an object to select it, double-click text to edit, right-click for more. Drag on an empty part of the slide (or Ctrl-click) to select several.'
    : 'PDF version: Reveal → Cover box to hide part of a slide.';
}
function endCoverDraw(E){ E.drawCover = false; E.lastCover = null; buildEditOverlay(E); }
// v1.38.1: a click on the grey area round the slide finishes typing, clears any selection and switches off a draw tool.
function greyClick(E, e){
  if(e.button > 0 || e.target.closest('.stage-frame, .zoom-pill')) return;
  if(E.editing) finishTextEdit(E);
  const had = E.sel || E.selCover || E.selO.size || E.cell || E.drawCover || E.drawText || E.orderMode || E.cellMode;
  E.sel = null; E.selCover = null; E.cell = null; E.cellSel = null; clearMulti(E);
  E.drawCover = false; E.drawText = null; E.lastCover = null; E.orderMode = null; E.cellMode = false;
  if(had) buildEditOverlay(E);
  // A drag that starts in the grey area draws the same selection box as one on the slide (it can reach across the slide).
  marquee(E, e, e.currentTarget);
}
function setObjState(E, v){ if(!E.sel || isToolIcon(E, E.sel)) return; const oid = revealLead(E, E.sel); change(E, c=>{ if(v) c.obj[oid] = v; else delete c.obj[oid]; }); } // v1.63: a member sets its group's
function setCoverColor(E, col){ const id = E.selCover; if(!id) return; change(E, c=>{ const x = c.covers.find(x=>x.id===id); if(x) x.color = col; }); }
function deleteCover(E){ const id = E.selCover; if(!id) return; E.selCover = null; change(E, c=>{ c.covers = c.covers.filter(x=>x.id!==id); delete c.btn['c'+id]; }); }
function dupCover(E){
  const id = E.selCover; if(!id) return;
  const nid = uid();
  change(E, c=>{ const x = c.covers.find(x=>x.id===id); if(x) c.covers.push({ ...x, id:nid, x:x.x + 16, y:x.y + 16 }); });
  E.selCover = nid; buildEditOverlay(E);
}
const OBJ_DEFAULTS = { shape:{ fill:'#4472C4', line:'#2F528F', lw:1.5 }, line:{ line:'#111114', lw:4 }, table:{ fill:'#FFFFFF', line:'#3A3A40', lw:1.5 } };
function pickFill(E, o, anchor){
  const c = cfgOf(E), sty = objStyle(c, o);
  colourPop(anchor, { title:'Fill', none:true, cur:sty.fill }, p=>{ if(p.color) setObjStyle(E, o, { fill:p.color }); });
}
function pickLine(E, o, anchor){
  const c = cfgOf(E), sty = objStyle(c, o), isLine = o.kind==='line', D = OBJ_DEFAULTS[o.kind] || {};
  const lw = sty.lw!=null ? sty.lw : D.lw;
  // Objects with no outline of their own get a black 2pt one when a colour or thickness is first picked.
  const fresh = (sty.line==null || sty.line==='none') && sty.lw==null && !D.line;
  colourPop(anchor, { title: isLine ? 'Colour' : 'Outline', none:!isLine, cur:sty.line, widths:true, lw, dash: o.kind==='pic' || o.kind==='frame' ? null : (sty.dash || 'solid'),
    arrow: isLine ? ((c.added.find(a=>'n'+a.id===o.oid) || {}).shape) : null }, p=>{
    if(p.color) setObjStyle(E, o, p.color==='none' ? { line:'none' } : fresh ? { line:p.color, lw:2 } : { line:p.color });
    if(p.lw) setObjStyle(E, o, fresh || sty.line==='none' ? { lw:p.lw, line:sty.line && sty.line!=='none' ? sty.line : '#111114' } : { lw:p.lw });
    if(p.dash) setObjStyle(E, o, Object.assign({ dash:p.dash==='solid' ? (o.added ? null : 'solid') : p.dash }, fresh || sty.line==='none' ? { line:'#111114', lw:lw || 2 } : {}));
    if(p.shape) setObjStyle(E, o, { shape:p.shape });
  });
}
/* ---------- text editing ---------- */
/* Insert → Text box (Arial 24) / Header (Arial 36 bold), v1.34: the button arms a draw mode (E.drawText); drag on the
   slide to set the box's place and width, or tap for a standard-size box at that point. Typing starts straight away. */
const TEXT_KINDS = { text:{ size:24, bold:false, w:0.5 }, head:{ size:36, bold:true, w:0.8 } };
function textKindHtml(kind, color){
  const k = TEXT_KINDS[kind] || TEXT_KINDS.text, html = PPTX.newTextHtml('Arial', { size:k.size, color });
  return k.bold ? html.replace('<span style="', '<span style="font-weight:700;') : html;
}
function addTextAt(E, kind, r, pt){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const W = E.stage.W, H = E.stage.H, k = TEXT_KINDS[kind] || TEXT_KINDS.text, line = Math.ceil(k.size*1.2 + 8);
  let x, y, w, h;
  if(r){ x = r.x; y = r.y; w = Math.max(40, r.w); h = Math.max(line, r.h); }
  else { w = W*k.w; h = line; x = pt ? pt[0] - w/2 : (W - w)/2; y = pt ? pt[1] - h/2 : H*0.42; }
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  const a = { id:uid(), x:Math.round(x), y:Math.round(y), w:Math.round(w), h:Math.round(h), html:textKindHtml(kind, kind==='head' ? themeGrade(E).d : undefined) }; // v1.88: Headers take the lesson's dark colour
  clearMulti(E); E.sel = 'n' + a.id; E.cell = null; E.cellSel = null; E.selCover = null;
  change(E, c=>{ c.added.push(a); });
  startTextEdit(E, 'n' + a.id, true);
}
function armText(E, kind){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  E.drawText = E.drawText===kind ? null : kind; E.drawCover = false; E.lastCover = null;
  E.sel = null; E.selCover = null; E.cell = null; clearMulti(E);
  buildEditOverlay(E);
}
// Insert → Date: into the text being typed (at the cursor), or as a new text box at the top of the slide.
const fieldHtml = (name, txt)=>`<span data-field="${name}" contenteditable="false" class="sv-field">${esc(txt)}</span>`;
function dateMenu(E, anchor){
  const f = lessonFields(E.l) || { date:'date', dateNum:'date' };
  openMenu(anchor, [{ label:f.date + '  (in words)', run:()=>addDateField(E, 'date') }, { label:f.dateNum, run:()=>addDateField(E, 'dateNum') }]);
}
function addDateField(E, name){
  if(E.mode!=='pptx') return;
  const f = lessonFields(E.l), txt = f ? f[name] : 'date';
  if(E.editing){
    E.editing.tx.focus();
    const r = editRange(E); if(!r) return;
    document.execCommand('insertHTML', false, fieldHtml(name, txt) + '​');
    return;
  }
  const W = E.stage.W;
  const html = PPTX.newTextHtml('Arial', { size:24 }).replace('>​</span>', '>' + fieldHtml(name, txt) + '</span>');
  const a = { id:uid(), x:Math.round(W*0.04), y:Math.round(E.stage.H*0.03), w:Math.round(W*0.5), h:48, html };
  clearMulti(E); E.sel = 'n' + a.id; E.cell = null; E.selCover = null;
  change(E, c=>{ c.added.push(a); });
  toast('Date added: it always shows the date of the lesson it’s in');
}
/* ---------- Q&A (Insert → Q&A) ----------
   A title (the Header style), then numbered questions (circled numbers) with an answer box beside each, hidden at start.
   Every box is an ordinary added text box tagged a.qa (the set's id), a.qr ('h' title / 'q' / 'a') and a.qi (row). Clicking one
   selects the whole set (move, resize with the handles); click again for just that box. The Q&A settings tab (qaCurrent) sets the
   number of questions, the text size, the divider between questions and answers, font and colours; qaRelayout lays the rows out again
   from the set's left edge, top and width, with each row as tall as its tallest box. */
const QA_ANS = 'rgb(30, 158, 90)', QA_GAP = 20, QA_VGAP = 8, QA_TITLE = 'Answer the following questions', QA_MAX = 20;
const qaIdOf = (c, oid)=>{ if(!oid || oid[0]!=='n') return null; const a = (c.added || []).find(a=>'n' + a.id===oid); return a && a.qa || null; };
const qaBoxesOf = (c, id)=>(c.added || []).filter(a=>a.qa===id && c.obj['n' + a.id]!=='del');
const qaOids = (c, id)=>qaBoxesOf(c, id).map(a=>'n' + a.id);
// The Q&A set the selection is in (or the one being typed in), else null.
function qaCurrent(E){
  const c = cfgOf(E);
  if(E.editing) return qaIdOf(c, E.editing.oid);
  if(isMulti(E)){ for(const id of E.selO){ const q = qaIdOf(c, id); if(q) return q; } return null; }
  return qaIdOf(c, E.sel);
}
// The set's id when the whole set is selected (and nothing else).
function qaWhole(E){
  if(!isMulti(E)) return null;
  const c = cfgOf(E), q = qaCurrent(E); if(!q) return null;
  const ids = qaOids(c, q);
  return ids.length===E.selO.size && ids.every(id=>E.selO.has(id)) ? q : null;
}
// Question html: one paragraph with a circled-number marker; data-start makes renumberLists keep its number.
function qaQHtml(size, i){
  const t = document.createElement('div');
  t.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;color:rgb(0, 0, 0)'; // on the page while the marker is sized, so it gets px sizes
  t.innerHTML = PPTX.newTextHtml('Arial', { size });
  const d = t.firstElementChild; d.dataset.start = i + 1; setListLine(d, 'cnum', 0);
  document.body.appendChild(t); renumberLists(t);
  const html = t.innerHTML; t.remove();
  return html;
}
const qaAHtml = size=>PPTX.newTextHtml('Arial', { size, color:QA_ANS }).replace('>​</span>', '>Answer</span>');
// Height a box's text needs at width w (as the box is drawn now).
function textHeightAt(E, oid, w){
  const e = objEl(E, oid), tx = e && e.querySelector(':scope > .pptx-tx'); if(!tx) return null;
  const m = tx.cloneNode(true);
  Object.assign(m.style, { position:'absolute', inset:'auto', left:'0', top:'0', visibility:'hidden', pointerEvents:'none', width:w + 'px', height:'auto', overflow:'visible' });
  m.removeAttribute('contenteditable');
  e.appendChild(m); unfitText(m);
  const h = Math.ceil(m.offsetHeight); m.remove();
  return h;
}
function insertQA(E){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const W = E.stage.W, H = E.stage.H, id = uid(), n = 10;
  const x = Math.round(W*0.06), y0 = Math.round(H*0.05), w = Math.round(W*0.88);
  const headH = Math.ceil(TEXT_KINDS.head.size*1.2 + 8), top = y0 + headH + 14;
  const size = Math.max(14, Math.min(24, Math.floor(((H - 20 - top)/n - QA_VGAP - 8)/1.2))); // 24 where it fits, smaller to keep ten rows on the slide
  const line = Math.ceil(size*1.2 + 8), qw = Math.round((w - QA_GAP)/2), aw = w - QA_GAP - qw;
  const boxes = [{ id:uid(), x, y:y0, w, h:headH, html:textKindHtml('head', themeGrade(E).d).replace('>​</span>', '>' + QA_TITLE + '</span>'), qa:id, qr:'h' }];
  for(let i = 0; i < n; i++){
    const y = top + i*(line + QA_VGAP);
    boxes.push({ id:uid(), x, y, w:qw, h:line, html:qaQHtml(size, i), qa:id, qr:'q', qi:i });
    boxes.push({ id:uid(), x:x + qw + QA_GAP, y, w:aw, h:line, html:qaAHtml(size), qa:id, qr:'a', qi:i });
  }
  clearMulti(E); E.sel = null; E.cell = null; E.cellSel = null; E.selCover = null; E.drawText = null; E.drawCover = false;
  change(E, c=>{ for(const a of boxes){ c.added.push(a); if(a.qr==='a') c.obj['n' + a.id] = 'hide'; } });
  setMultiSel(E, boxes.map(a=>'n' + a.id));
  toast('Q&A added: drag it to move it, use the handles to resize it, and the Q&A settings tab for the rest');
}
// Lay the set's rows out again: same left edge, top and width; questions get `split` of the width (default: as now).
function qaRelayout(E, id, o={}){
  const c0 = cfgOf(E), boxes = qaBoxesOf(c0, id); if(!boxes.length) return;
  const bb = unionRect(boxes), hd = boxes.find(a=>a.qr==='h'), qOf = new Map(), aOf = new Map();
  for(const a of boxes){ if(a.qr==='q') qOf.set(a.qi, a); else if(a.qr==='a') aOf.set(a.qi, a); }
  const idx = [...new Set([...qOf.keys(), ...aOf.keys()])].sort((a, b)=>a - b);
  const q0 = qOf.get(idx[0]), a0 = aOf.get(idx[0]);
  const split = o.split!=null ? o.split : q0 && a0 ? q0.w/(q0.w + a0.w) : 0.5;
  const qw = Math.round((bb.w - QA_GAP)*split), aw = Math.round(bb.w - QA_GAP - qw);
  const hOf = (a, w)=>Math.max(8, textHeightAt(E, 'n' + a.id, w) || a.h);
  const out = []; let y = bb.y;
  if(hd){ const h = hOf(hd, bb.w); out.push([hd, { x:bb.x, y, w:bb.w, h }]); y += h + 14; }
  for(const i of idx){
    const q = qOf.get(i), a = aOf.get(i), rh = Math.max(q ? hOf(q, qw) : 0, a ? hOf(a, aw) : 0);
    if(q) out.push([q, { x:bb.x, y, w:qw, h:rh }]);
    if(a) out.push([a, { x:bb.x + qw + QA_GAP, y, w:aw, h:rh }]);
    y += rh + QA_VGAP;
  }
  change(E, c=>{ for(const [a, r] of out){ const t = c.added.find(t=>t.id===a.id); if(t) Object.assign(t, r); } }, { merge:!!o.merge });
}
// Runs fn on every box of the set with one of these roles (all its text selected), then lays the rows out again: one undo step.
function qaText(E, id, roles, fn){
  const c = cfgOf(E), oids = qaBoxesOf(c, id).filter(a=>roles.includes(a.qr)).map(a=>'n' + a.id);
  massText(E, fn, { oids, keep:true });
  qaRelayout(E, id, { merge:true });
}
function qaSetSize(E, px){
  const tx = E.editing.tx;
  for(const sp of tx.querySelectorAll('span:not(.pptx-bu)')){ sp.style.fontSize = px + 'px'; sp.dataset.fs = px; }
  refitParas(tx);
  if(tx.querySelector('[data-list]')) renumberLists(tx);
}
function qaFirst(c, id, role){ return qaBoxesOf(c, id).filter(a=>a.qr===role).sort((a, b)=>a.qi - b.qi)[0] || null; }
function qaTextSize(E, id, dir){
  const q = qaFirst(cfgOf(E), id, 'q'), cur = q && (textInfo(E, 'n' + q.id) || {}).size || 24, next = stepFontSize(cur, dir);
  qaText(E, id, ['q', 'a'], ()=>qaSetSize(E, next));
}
function qaToggle(E, id, cmd){
  const c = cfgOf(E), key = { bold:'b', italic:'i', underline:'u' }[cmd];
  const on = !qaBoxesOf(c, id).filter(a=>a.qr!=='h').every(a=>(textInfo(E, 'n' + a.id) || {})[key]);
  qaText(E, id, ['q', 'a'], ()=>fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); if(document.queryCommandState(cmd) !== on) document.execCommand(cmd); }));
}
function qaCount(E, id, d){
  const c0 = cfgOf(E), qs = qaBoxesOf(c0, id).filter(a=>a.qr==='q').sort((a, b)=>a.qi - b.qi), n = qs.length + d;
  if(n < 1 || n > QA_MAX){ toast(n < 1 ? 'A Q&A needs at least one question' : `A Q&A can have up to ${QA_MAX} questions`); return; }
  const whole = !!qaWhole(E), last = qs[qs.length - 1], next = last.qi + 1;
  if(d > 0){
    const size = (textInfo(E, 'n' + last.id) || {}).size || 24, a0 = qaFirst(c0, id, 'a'), line = Math.ceil(size*1.2 + 8);
    const q = { id:uid(), x:last.x, y:last.y + last.h + QA_VGAP, w:last.w, h:line, html:qaQHtml(size, next), qa:id, qr:'q', qi:next };
    const a = { id:uid(), x:a0 ? a0.x : last.x + last.w + QA_GAP, y:q.y, w:a0 ? a0.w : last.w, h:line, html:qaAHtml(size), qa:id, qr:'a', qi:next };
    change(E, c=>{ c.added.push(q, a); c.obj['n' + a.id] = 'hide'; });
  } else {
    const gone = new Set(qaBoxesOf(c0, id).filter(a=>a.qi===last.qi).map(a=>a.id));
    change(E, c=>{ c.added = c.added.filter(a=>!gone.has(a.id)); for(const g of gone){ delete c.obj['n' + g]; delete c.btn['on' + g]; } });
  }
  qaRelayout(E, id, { merge:true });
  if(whole) setMultiSel(E, qaOids(cfgOf(E), id));
}
function rbQA(E){
  const id = qaCurrent(E); if(!id) return rbNote('Select a Q&A object.');
  const c = cfgOf(E), q0 = qaFirst(c, id, 'q'), a0 = qaFirst(c, id, 'a'), n = qaBoxesOf(c, id).filter(a=>a.qr==='q').length;
  const tq = q0 && textInfo(E, 'n' + q0.id) || {}, ta = a0 && textInfo(E, 'n' + a0.id) || {};
  const all = qaBoxesOf(c, id).map(a=>textInfo(E, 'n' + a.id) || {}).filter((t, i)=>qaBoxesOf(c, id)[i].qr!=='h');
  const pct = q0 && a0 ? Math.round(q0.w/(q0.w + a0.w)*100) : 50;
  const fonts = [...new Set([tq.font, ...slideFonts(E), ...RB_FONTS].filter(Boolean))], fw = Math.max(96, Math.min(230, 44 + (tq.font || 'Arial').length * 8));
  const col = (t, ch)=>`<span class="rb-tcol" style="border-bottom-color:${t.color || '#000000'}">${ch}</span>`;
  return rbGroup('Questions', rbI('qaless', 'minus', 'Take off the last question', { dis:n <= 1 }) + `<span class="rb-fs" title="Number of questions">${n}</span>` + rbI('qamore', 'plus', 'Add a question', { dis:n >= QA_MAX }))
    + rbGroup('Size', rbI('qasmaller', 'minus', 'Smaller text: questions and answers') + `<span class="rb-fs" title="Font size (pt)">${tq.size || ''}</span>` + rbI('qabigger', 'plus', 'Bigger text: questions and answers'))
    + rbGroup('Divider', `<input type="range" class="rb-qasplit" data-r="qasplit" min="15" max="85" step="5" value="${pct}" aria-label="Questions' share of the width" data-tip="Divider: drag to give the questions more or less of the width" style="width:110px"><span class="rb-fs" title="Questions | answers">${pct}% | ${100 - pct}%</span>`)
    + rbGroup('Font', `<select class="rb-font" data-r="qafont" data-tip="Font: the whole Q&A" aria-label="Font" style="width:${fw}px">${fonts.map(f=>`<option${f===tq.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`)
    + rbGroup('Format', rbBtn('qabold', null, '', { cls:'ic tb', pre:'<b>B</b>', on:all.every(t=>t.b), title:'Bold: questions and answers' }) + rbBtn('qaitalic', null, '', { cls:'ic tb', pre:'<i>I</i>', on:all.every(t=>t.i), title:'Italic: questions and answers' }) + rbBtn('qaunderline', null, '', { cls:'ic tb', pre:'<u>U</u>', on:all.every(t=>t.u), title:'Underline: questions and answers' }))
    + rbGroup('Colour', rbBtn('qaqcol', null, '', { cls:'ic', pre:col(tq, 'Q'), dd:true, title:'Question text colour' }) + rbBtn('qaacol', null, '', { cls:'ic', pre:col(ta, 'A'), dd:true, title:'Answer text colour' }))
    + rbGroup('Rows', rbBtn('qatidy', null, 'Tidy', { title:'Tidy: line the rows up again, each as tall as its text needs' }))
    + rbSpacer + rbGroup('Q&A', rbI('qadel', 'trash', 'Delete the whole Q&A', { cls:'ic danger' }));
}
// Undo the autofit shrink while editing, so sizes shown are the real ones.
function unfitText(tx){
  for(const sp of tx.querySelectorAll('span:not(.lst-m)')) if(sp.dataset.fs) sp.style.fontSize = sp.dataset.fs + 'px';
  for(const d of tx.querySelectorAll('.pptx-p')){ if(!d.dataset.lh) continue; d.style.fontSize = d.dataset.fs + 'px'; d.style.lineHeight = d.dataset.lh + 'px'; if(d.style.top) d.style.top = d.dataset.top + 'px'; }
}
// A paragraph's line height is fixed in px from its largest text; keep it in step after size changes.
function refitParas(tx){
  for(const d of tx.querySelectorAll('.pptx-p')){
    const all = [...d.querySelectorAll('span:not(.pptx-bu)')];
    // v1.78: only spans holding text themselves (not wrappers round other spans, which can carry an old size).
    const withText = all.filter(s=>[...s.childNodes].some(c=>c.nodeType===3 && c.textContent.replace(/​/g,'').length));
    const sizes = (withText.length ? withText : all).map(s=>parseFloat(getComputedStyle(s).fontSize)).filter(n=>n>0);
    if(!sizes.length) continue;
    const fs = Math.max(...sizes), old = Number(d.dataset.fs) || fs;
    if(Math.abs(fs - old) < 0.01) continue;
    const kk = fs / old;
    d.dataset.fs = fs; d.dataset.lh = (Number(d.dataset.lh) || fs*1.2) * kk; d.dataset.top = (Number(d.dataset.top) || 0) * kk;
    d.style.fontSize = fs + 'px'; d.style.lineHeight = d.dataset.lh + 'px';
    if(d.style.top) d.style.top = d.dataset.top + 'px';
  }
}
function startTextEdit(E, oid, isNew, pt){
  const e = objEl(E, oid); const tx = e && e.querySelector(':scope > .pptx-tx'); if(!tx) return;
  const cellT = cellTable(oid);
  E.sel = cellT || oid; E.cell = cellT ? oid : null; E.selCover = null;
  unfitText(tx);
  e.classList.remove('ed-faded', 'pptx-hidden');
  e.classList.add('ed-editing');
  for(const b of tx.querySelectorAll('.pptx-bu')) b.contentEditable = 'false';
  if(tx.querySelector('[data-list]')) renumberLists(tx); // puts every marker's look back (also on lists saved before the font-size fix)
  const orig = tx.innerHTML;
  tx.contentEditable = 'true'; tx.spellcheck = true; tx.lang = boxLang(E, oid); // browser spell check, in the box's language
  // Colours used on this slide, offered beside the standard ones.
  // Skips near-duplicates (e.g. #0D0D0D next to black).
  const seen = TEXT_COLORS.map(c=>c.toLowerCase());
  const near = (a, b)=>{ const d = i=>Math.abs(parseInt(a.substr(i,2),16) - parseInt(b.substr(i,2),16)); return d(1) + d(3) + d(5) < 60; };
  const slideCols = [];
  for(const sp of E.stage.slideEl.querySelectorAll('.pptx-tx span')){
    const c = rgbHex(getComputedStyle(sp).color);
    if(c && !seen.some(x=>near(x, c))){ seen.push(c); slideCols.push(c); if(slideCols.length>=5) break; }
  }
  E.editing = { oid, el:e, tx, orig, isNew:!!isNew, cols:slideCols, range:null };
  buildEditOverlay(E);
  tx.focus();
  const r = document.createRange();
  if(isNew) r.selectNodeContents(tx); else { r.selectNodeContents(tx); r.collapse(false); }
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  // Tapped into the text: put the cursor where the tap was.
  if(pt && document.caretRangeFromPoint){ const cr = document.caretRangeFromPoint(pt[0], pt[1]); if(cr && tx.contains(cr.startContainer)){ sel.removeAllRanges(); sel.addRange(cr); } }
  E.editing.range = sel.getRangeAt(0).cloneRange();
}
function rgbHex(s){ const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s || ''); if(!m || (m[4]!=null && Number(m[4])===0)) return null; return '#' + [m[1],m[2],m[3]].map(n=>Number(n).toString(16).padStart(2,'0')).join(''); }
function finishTextEdit(E){
  const ed = E.editing; if(!ed) return;
  E.editing = null;
  const { tx, oid } = ed;
  tx.removeAttribute('contenteditable'); tx.removeAttribute('spellcheck');
  for(const b of tx.querySelectorAll('.pptx-bu')) b.removeAttribute('contenteditable');
  // Record each span's real size so autofit can shrink from it.
  for(const sp of tx.querySelectorAll('span:not(.lst-m)')){ const fs = parseFloat(sp.style.fontSize); if(fs) sp.dataset.fs = fs; } // not list markers: theirs is in em, and autofit would turn it into px
  const html = tx.innerHTML;
  const empty = !tx.textContent.replace(/​/g,'').trim();
  // A new box left empty isn't kept: take back the step that added it (not put on Redo).
  if(ed.isNew && empty){
    const s = E.undo[E.undo.length - 1];
    E.sel = null;
    if(s && s.cfg!==undefined && s.i===E.i){ E.undo.pop(); applySnap(E, s); }
    else change(E, c=>{ c.added = c.added.filter(a=>'n' + a.id!==oid); });
    return 'dropped';
  }
  if(html===ed.orig){ showEdit(E); return; }
  const cellT = cellTable(oid);
  if(cellT){ change(E, c=>{ const a = c.added.find(a=>'n'+a.id===cellT); const cl = a && tCell(a, oid); if(cl) cl.html = html; }); return; }
  const added = oid[0]==='n';
  const fh = added && !!fitAdded(E, oid); // v1.94: a fit-height box takes its text's height (taller or shorter)
  const grow = added ? (fh ? contentH(tx) : tx.scrollHeight) : 0;
  change(E, c=>{
    if(added){ const a = c.added.find(a=>'n'+a.id===oid); if(a){ a.html = html; delete a.plain; if(a.fh) a.h = Math.max(16, Math.ceil(grow)); else if(!a.shape && a.art==null) a.h = Math.max(a.h, Math.ceil(grow)); } }
    else c.text[oid] = html;
  });
  const qid = added ? qaIdOf(cfgOf(E), oid) : null;
  if(qid) qaRelayout(E, qid, { merge:true }); // a Q&A row grows with its text
}
function editRange(E){
  const ed = E.editing, sel = getSelection();
  if(sel.rangeCount && ed.tx.contains(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0);
  if(ed.range){ sel.removeAllRanges(); sel.addRange(ed.range); return ed.range; }
  return null;
}
// Run a formatting change on the selection, or on all the text if nothing is selected.
function fmt(E, fn, wholeIfEmpty=true){
  const ed = E.editing; if(!ed) return;
  ed.tx.focus();
  let r = editRange(E); const sel = getSelection();
  let collapsed = !r || r.collapsed;
  if(collapsed && wholeIfEmpty){ r = document.createRange(); r.selectNodeContents(ed.tx); sel.removeAllRanges(); sel.addRange(r); }
  fn(sel.rangeCount ? sel.getRangeAt(0) : r);
  refitParas(ed.tx);
  if(collapsed && wholeIfEmpty){ const c = sel.getRangeAt(0); c.collapse(false); sel.removeAllRanges(); sel.addRange(c); }
  if(sel.rangeCount) ed.range = sel.getRangeAt(0).cloneRange();
  updateTextBar(E);
}
function curFontSize(E){
  const r = editRange(E); let n = r ? r.startContainer : E.editing.tx;
  if(n.nodeType===3) n = n.parentElement;
  if(n===E.editing.tx){ const sp = E.editing.tx.querySelector('span:not(.pptx-bu)'); if(sp) n = sp; }
  return Math.round(parseFloat(getComputedStyle(n).fontSize) * 2) / 2;
}
// v1.78: one step up / down the size list from a given size.
function stepFontSize(cur, dir){
  return dir > 0 ? (FONT_STEPS.find(s=>s > cur + 0.01) || cur + 12) : ([...FONT_STEPS].reverse().find(s=>s < cur - 0.01) || Math.max(4, cur - 1));
}
/* v1.78: Smaller / Bigger. Each selected piece of text steps from its OWN size (as PowerPoint), blank lines included,
   bullets follow their line, and the same text stays selected so the buttons can be pressed again.
   Nothing selected: the whole box. Replaces execCommand('fontSize'), which dropped the end of the selection after one
   press and set everything to one step above wherever the selection started (e.g. a small blank line → 10.5pt). */
function setFontSize(E, dir){
  const ed = E.editing; if(!ed) return;
  const tx = ed.tx; tx.focus();
  const sel = getSelection(), r0 = editRange(E);
  const caret = r0 && r0.collapsed ? [r0.startContainer, r0.startOffset] : null;
  const r = document.createRange();
  if(!r0 || r0.collapsed) r.selectNodeContents(tx);
  else { r.setStart(r0.startContainer, r0.startOffset); r.setEnd(r0.endContainer, r0.endOffset); }
  // Split the text at the selection's ends, so only the selected part changes.
  let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
  if(ec.nodeType===3 && eo > 0 && eo < ec.length) ec.splitText(eo);
  if(sc.nodeType===3 && so > 0 && so < sc.length){ const t = sc.splitText(so); if(ec===sc){ ec = t; eo -= so; } sc = t; so = 0; }
  r.setStart(sc, so); r.setEnd(ec, eo);
  const inBu = n=>n.parentElement && n.parentElement.closest('.pptx-bu');
  const nodes = [], w = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
  for(let n; (n = w.nextNode());){
    if(inBu(n) || !r.intersectsNode(n)) continue;
    if(n===ec && eo===0 && n.length) continue;          // selection ends just before this text
    if(n===sc && so >= n.length && n.length) continue;  // selection starts just after it
    nodes.push(n);
  }
  if(!nodes.length) return;
  // Read every size before changing any.
  const jobs = nodes.map(n=>{ const cur = Math.round(parseFloat(getComputedStyle(n.parentElement).fontSize) * 2) / 2; return { n, cur, next:stepFontSize(cur, dir) }; });
  const firstInPara = new Map();
  for(const j of jobs){
    let sp = j.n.parentElement;
    if(!(sp.localName==='span' && sp.childNodes.length===1)){ sp = document.createElement('span'); j.n.parentNode.insertBefore(sp, j.n); sp.appendChild(j.n); }
    sp.style.fontSize = j.next + 'px'; sp.dataset.fs = j.next;
    const p = sp.closest('.pptx-p'); if(p && !firstInPara.has(p)) firstInPara.set(p, j);
  }
  // Bullets follow their line's first text, when that text was changed.
  for(const [p, j] of firstInPara){
    const pw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let first = null;
    for(let n; (n = pw.nextNode());) if(!inBu(n)){ first = n; break; }
    if(first!==j.n || !j.cur) continue;
    for(const b of p.querySelectorAll(':scope > .pptx-bu')){
      const bs = parseFloat(getComputedStyle(b).fontSize); if(!bs) continue;
      const v = Math.round(bs * j.next / j.cur * 100) / 100; b.style.fontSize = v + 'px'; b.dataset.fs = v;
    }
  }
  refitParas(tx);
  if(tx.querySelector('[data-list]')) renumberLists(tx); // list markers (circled ones especially) follow the new text size
  const nr = document.createRange();
  if(caret && tx.contains(caret[0])){ const c = caret[0]; nr.setStart(c, Math.min(caret[1], c.nodeType===3 ? c.length : c.childNodes.length)); nr.collapse(true); }
  else { const a = nodes[0], z = nodes[nodes.length - 1]; nr.setStart(a, 0); nr.setEnd(z, z.length); }
  sel.removeAllRanges(); sel.addRange(nr); ed.range = nr.cloneRange();
  updateTextBar(E);
}
function setAlign(E, a){
  fmt(E, (r)=>{
    const tx = E.editing.tx;
    let paras = [...tx.querySelectorAll('.pptx-p')].filter(p=>r.intersectsNode(p));
    if(!paras.length){ let n = r.startContainer; if(n.nodeType===3) n = n.parentElement; const p = n.closest && n.closest('.pptx-p'); if(p) paras = [p]; }
    for(const p of paras) p.style.textAlign = a;
  }, false);
}
// Line spacing (Object tab → Paragraph → Spacing ▾): a multiple of single spacing (1.2 × the paragraph's largest size).
// Saved on each paragraph as data-ls; data-lh (px) is kept in step, so the viewer, autofit, export and print use it as they do PowerPoint's spacing.
const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
function paraSize(p){
  const s = [...p.querySelectorAll('span:not(.pptx-bu)')].map(x=>parseFloat(x.style.fontSize)).filter(n=>n>0);
  return s.length ? Math.max(...s) : (parseFloat(p.style.fontSize) || Number(p.dataset.fs) || 24);
}
function setParaSpacing(p, m){
  const fs = paraSize(p), lh = +(m * 1.2 * fs).toFixed(2);
  p.dataset.ls = m; p.dataset.fs = fs; p.dataset.lh = lh;
  p.style.fontSize = fs + 'px'; p.style.lineHeight = lh + 'px';
}
// Paragraphs of the text being typed that the selection touches (all of them when nothing is selected), as setAlign.
function setLineSpacing(E, m){
  fmt(E, (r)=>{
    const tx = E.editing.tx;
    let paras = [...tx.querySelectorAll('.pptx-p')].filter(p=>r.intersectsNode(p));
    if(!paras.length){ let n = r.startContainer; if(n.nodeType===3) n = n.parentElement; const p = n.closest && n.closest('.pptx-p'); if(p) paras = [p]; }
    for(const p of paras) setParaSpacing(p, m);
  }, false);
}
function cellsSpacing(E, m){ editCells(E, d=>{ for(const p of d.querySelectorAll('.pptx-p')) setParaSpacing(p, m); }); }
function applyLineSpacing(E, m){ if(E.cell && cellTable(E.cell)) cellsSpacing(E, m); else withText(E, ()=>setLineSpacing(E, m)); }
// Spacing shown in the slider: the first paragraph's (1 when it has none, or it is a cell).
function currentLineSpacing(E){
  const e = !E.editing && E.sel ? objEl(E, E.sel) : null;
  const tx = E.editing ? E.editing.tx : e && e.querySelector(':scope > .pptx-tx');
  const p = tx && tx.querySelector('.pptx-p[data-ls]');
  return p ? Number(p.dataset.ls) : 1;
}
// Starts an editing session for the preview (as withText does, but it stays open until the slider is let go).
function previewStart(E){
  if(E.editing) return true;
  const o = selObj(E), oid = o && o.oid; if(!oid || !hasText(E, oid)) return false;
  startTextEdit(E, oid); if(!E.editing) return false;
  const r = document.createRange(); r.selectNodeContents(E.editing.tx);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); E.editing.range = r.cloneRange();
  return true;
}
// Slider inside the Spacing menu. Text boxes preview as the slider moves; the session ends on release, so the change is one undo step. Table cells update on release.
function spacingSliderNode(E){
  const cur = Math.min(3, Math.max(0.5, currentLineSpacing(E)));
  const w = el('div', 'ed-lsp');
  w.innerHTML = `<div class="ed-lsp-l">Line spacing <output>${cur.toFixed(2)}</output></div><input type="range" aria-label="Line spacing" min="0.5" max="3" step="0.05" value="${cur}">`;
  const out = w.querySelector('output'), inp = w.querySelector('input');
  const inCell = ()=>!!(E.cell && cellTable(E.cell));
  inp.addEventListener('input', ()=>{
    const v = Number(inp.value); out.textContent = v.toFixed(2);
    if(!inCell() && previewStart(E)) setLineSpacing(E, v);
  });
  inp.addEventListener('change', ()=>{
    const v = Number(inp.value);
    if(inCell()) cellsSpacing(E, v);
    else { if(previewStart(E)) setLineSpacing(E, v); finishTextEdit(E); }
  });
  return w;
}
function lineSpacingItems(E){
  return [...LINE_SPACINGS.map(m=>({ label: m.toFixed(m === 1.15 ? 2 : 1), run:()=>applyLineSpacing(E, m) })), '-', { node: spacingSliderNode(E) }];
}
// Auto spacing: spreads the text to fill the box's height. Several paragraphs: the gaps between them grow (their margins), so lines stay tight.
// One paragraph: its line spacing grows instead. Several paragraphs start again from their original gaps on each press.
function autoSpace(E){
  if(E.cell && cellTable(E.cell)){ toast('Auto spacing works in text boxes'); return; }
  withText(E, ()=>{
    const tx = E.editing && E.editing.tx; if(!tx) return;
    const cs = getComputedStyle(tx), avail = tx.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const paras = [...tx.querySelectorAll('.pptx-p')].filter(p=>!(p.parentElement && p.parentElement.closest('.pptx-p')));
    if(!paras.length || !(avail > 0)){ toast('This box has no text to space'); return; }
    // Original gap of each paragraph, kept so a second press starts from the same place.
    const base = p=>{ if(p.dataset.mt == null) p.dataset.mt = parseFloat(p.style.marginTop) || 0; return Number(p.dataset.mt); };
    for(const p of paras) p.style.marginTop = base(p) + 'px';
    if(paras.length > 1){
      const total = paras.reduce((s, p)=>s + p.offsetHeight + base(p), 0), slack = avail - total;
      if(slack <= 0){ toast('The text already fills the box'); return; }
      const gap = slack / (paras.length - 1);
      paras.slice(1).forEach(p=>{ p.style.marginTop = (base(p) + gap) + 'px'; });
    } else {
      const p = paras[0], content = p.offsetHeight, ls = Number(p.dataset.ls) || 1;
      if(!(content > 0) || avail <= content){ toast('The text already fills the box'); return; }
      const m = Math.min(3, ls * avail / content);
      setParaSpacing(p, m);
    }
  });
}
// v1.72: lists in text boxes, Headers and table cells (Object tab, only while typing). A list line is a block with
// data-list (bul / num / let) and data-lvl (0-2). Its marker is a non-editable span (pptx-bu lst-m) so it stays out of
// font sizing and typing; the marker text is part of the saved HTML, so presenting, print and the viewers show it.
// Table cells are single level (Tab moves between cells there).
const LIST_NUM_STYLES = { num:['dec','alpha','roman'], let:['upper','alpha','roman'], cnum:['dec','dec','dec'], clet:['upper','upper','upper'] };
// v1.88: circled numbers / letters: the marker is a filled circle (the marker colour) with the number or letter in it.
// Per-line marker settings: data-mc (colour), data-mb ('1' bold / '0' not; circled ones are bold unless '0'), data-ms (circle size, × the text size).
const isCirc = kind=>kind==='cnum' || kind==='clet';
const CIRC_SIZE = 0.95, CIRC_GAP = 0.3, CIRC_MIN = 0.7, CIRC_MAX = 2.1;
const circSize = d=>Math.max(CIRC_MIN, Math.min(CIRC_MAX, Number(d.dataset.ms) || CIRC_SIZE));
const listHang = d=>isCirc(d.dataset.list) ? circSize(d) + CIRC_GAP : 1.2; // width of the marker column, in em
const BUL_MARKS = ['•','◦','▪'];
const LIST_INDENT_EM = 2; // per level, plus the 1.2em marker width
function listNum(style, n){
  if(style==='dec') return String(n);
  if(style==='roman'){
    const m = [[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]; let s = '', k = n;
    for(const [v,t] of m){ while(k>=v){ s += t; k -= v; } }
    return s;
  }
  const ch = String.fromCharCode(96 + ((n - 1) % 26) + 1);
  return style==='upper' ? ch.toUpperCase() : ch;
}
function listMarker(kind, lvl, n){ return kind==='bul' ? BUL_MARKS[lvl] : listNum(LIST_NUM_STYLES[kind][lvl], n) + (isCirc(kind) ? '' : '.'); }
function setListLine(d, kind, lvl){
  d.dataset.list = kind; d.dataset.lvl = lvl;
  const hang = listHang(d);
  d.style.paddingLeft = (lvl * LIST_INDENT_EM + hang) + 'em';
  d.style.textIndent = '-' + hang + 'em';
}
function clearListLine(d){
  delete d.dataset.list; delete d.dataset.lvl; delete d.dataset.mc; delete d.dataset.mb; delete d.dataset.ms;
  d.style.paddingLeft = ''; d.style.textIndent = '';
  for(const m of d.querySelectorAll(':scope > .lst-m')) m.remove();
}
// The marker's look (inline, so it's the same wherever the saved HTML is shown): the line's own marker colour, else the colour of its
// text (not the box's own colour, which can be white); bold if asked; circled ones are a filled circle sized from the text.
function styleMarker(d, m, kind){
  let col = d.dataset.mc || '', base = 0;
  if(d.isConnected){
    const t = [...d.children].find(x=>!x.classList.contains('pptx-bu') && x.textContent.replace(/​/g,'').trim()) || [...d.children].find(x=>!x.classList.contains('pptx-bu')) || d; // an empty line: its (empty) run's colour, not what the line inherits
    const cs = getComputedStyle(t);
    if(!col) col = cs.color;
    base = parseFloat(cs.fontSize) || 0; // the line's own text size (px): the line box itself can be a different size from its text
  }
  m.style.cssText = '';
  const circ = isCirc(kind);
  if(circ){ m.dataset.circ = '1'; } else delete m.dataset.circ;
  const bold = d.dataset.mb==='1' || (circ && d.dataset.mb!=='0');
  if(bold) m.style.fontWeight = '700';
  if(!circ){ if(col) m.style.color = col; return; }
  const S = circSize(d);
  // Sizes follow the text's px size (em of the line when it isn't on screen), so every item's circle matches its own text.
  const u = v=>base > 0 ? (Math.round(v * base * 100) / 100) + 'px' : v + 'em';
  if(base > 0){ const hang = S + CIRC_GAP; d.style.paddingLeft = u((Number(d.dataset.lvl) || 0) * LIST_INDENT_EM + hang); d.style.textIndent = '-' + u(hang); }
  const rgb = /^#([0-9a-f]{6})$/i.exec(col) ? [1, 3, 5].map(i=>parseInt(col.substr(i, 2), 16)) : (/(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(col) || [0, 0, 0, 0]).slice(1).map(Number);
  const dark = (0.299*rgb[0] + 0.587*rgb[1] + 0.114*rgb[2]) < 150;
  Object.assign(m.style, { display:'inline-flex', alignItems:'center', justifyContent:'center', boxSizing:'border-box', width:u(S), height:u(S), borderRadius:'50%', flex:'none',
    background:col || '#333', color:dark ? '#fff' : '#111', fontSize:u(0.62 * S), lineHeight:'1', paddingTop:u(0.05 * S), verticalAlign:'middle', position:'relative', top:u(-0.1), marginRight:u(CIRC_GAP), textIndent:'0' }); // 'middle' centres on the x-height; the lift puts the circle's middle on the capitals' middle
}
// Markers and numbering for every list line in the box, in order. A line that isn't a list restarts the count.
function renumberLists(tx){
  let st = [];
  for(const d of [...tx.children]){
    if(!d.dataset.list){ st = []; continue; }
    const kind = d.dataset.list, lvl = Number(d.dataset.lvl) || 0;
    st.length = lvl + 1;
    const cur = st[lvl];
    const n = cur && cur.kind===kind ? cur.n + 1 : Number(d.dataset.start) || 1; // data-start: a list that carries on from another box (the Q&A questions)
    st[lvl] = { kind, n };
    let m = d.querySelector(':scope > .lst-m');
    if(!m){ m = document.createElement('span'); m.className = 'pptx-bu lst-m'; m.contentEditable = 'false'; d.prepend(m); }
    m.textContent = listMarker(kind, lvl, n);
    styleMarker(d, m, kind);
  }
}
// Bare text and line breaks at the top of the box become blocks, so each line can take a list.
function blockLines(tx){
  let run = null;
  const flush = ()=>{
    if(!run) return;
    const d = document.createElement('div'); tx.insertBefore(d, run[0]);
    for(const n of run) d.appendChild(n);
    if(!d.textContent.replace(/​/g,'') && !d.querySelector('img')) d.appendChild(document.createElement('br'));
    run = null;
  };
  for(const n of [...tx.childNodes]){
    if(n.nodeName==='BR'){
      if(run) flush();
      else if(n.nextSibling){ const d = document.createElement('div'); d.appendChild(document.createElement('br')); tx.insertBefore(d, n); }
      n.remove(); continue;
    }
    if(n.nodeType===1 && /^(DIV|P)$/.test(n.nodeName)){ flush(); continue; }
    if(n.nodeType===3 && !run && !n.textContent.trim()) continue;
    (run = run || []).push(n);
  }
  flush();
}
// Runs fn on the lines the selection touches (or the caret's line), then renumbers and keeps the selection.
function pickedLines(E, fn){
  const ed = E.editing; if(!ed) return;
  const tx = ed.tx; tx.focus();
  const r = editRange(E); if(!r) return;
  const collapsed = r.collapsed;
  const up = n=>{ while(n && n.parentNode!==tx) n = n.parentNode; return n || null; };
  const a = up(r.startContainer), b = up(r.endContainer);
  blockLines(tx);
  let lo = up(a) || up(b), hi = up(b) || lo;
  if(!lo){ lo = hi = tx.lastElementChild; }
  if(!lo) return;
  if(lo.compareDocumentPosition(hi) & Node.DOCUMENT_POSITION_PRECEDING) [lo, hi] = [hi, lo];
  const lines = [];
  for(let d = lo; d; d = d.nextElementSibling){ lines.push(d); if(d===hi) break; }
  fn(lines);
  renumberLists(tx);
  const sel = getSelection(), nr = document.createRange();
  nr.selectNodeContents(hi); if(collapsed) nr.collapse(false);
  sel.removeAllRanges(); sel.addRange(nr);
  ed.range = nr.cloneRange();
  updateTextBar(E);
}
function listLineAtCaret(tx){
  const sel = getSelection(); if(!sel.rangeCount || !tx.contains(sel.anchorNode)) return null;
  const n = sel.anchorNode.nodeType===3 ? sel.anchorNode.parentElement : sel.anchorNode;
  const d = n && n.closest ? n.closest('[data-list]') : null;
  return d && d.parentNode===tx ? d : null;
}
// Bullets / numbers / letters: every picked line gets it, or all of them lose it if they already have it.
function setList(E, kind){
  pickedLines(E, lines=>{
    const allOn = lines.every(d=>d.dataset.list===kind);
    for(const d of lines){
      if(allOn) clearListLine(d);
      else setListLine(d, kind, d.dataset.list ? (Number(d.dataset.lvl) || 0) : 0);
    }
  });
}
// Marker colour / bold / circle size for the picked list lines: patch = { mc, mb, ms }, a null value clears it.
function setListMarker(E, patch){
  pickedLines(E, lines=>{
    for(const d of lines){
      if(!d.dataset.list) continue;
      for(const [k, v] of Object.entries(patch)){ if(v==null) delete d.dataset[k]; else d.dataset[k] = v; }
      if('ms' in patch) setListLine(d, d.dataset.list, Number(d.dataset.lvl) || 0);
    }
  });
}
// The list drop-down's extra rows: marker colour, bold and (circled lists) the circle size with − / +.
function listMarkerItems(E, anchor){
  const d = listLineAtCaret(E.editing.tx); if(!d) return [];
  const circ = isCirc(d.dataset.list), bold = d.dataset.mb==='1' || (circ && d.dataset.mb!=='0');
  const items = ['-',
    { label:'Marker colour…', run:()=>colourPop(anchor, { title:'Marker colour', scope:'list', cur:d.dataset.mc || '', deck:true }, p=>{ if(p.color) setListMarker(E, { mc:p.color==='deck' ? null : p.color }); }) },
    { label:(bold ? '✓ ' : '') + 'Bold marker', run:()=>setListMarker(E, { mb:bold ? '0' : '1' }) }];
  if(circ){
    const row = el('div', 'menu-size');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 12px';
    row.innerHTML = '<span style="flex:1">Circle size</span><button type="button" data-d="-1" aria-label="Smaller circle" style="width:34px;min-height:30px;justify-content:center">−</button><b style="min-width:44px;text-align:center"></b><button type="button" data-d="1" aria-label="Larger circle" style="width:34px;min-height:30px;justify-content:center">+</button>';
    const val = row.querySelector('b'), show = ()=>{ val.textContent = Math.round(circSize(d) * 100) + '%'; };
    show();
    row.addEventListener('click', e=>{
      const b = e.target.closest('button[data-d]'); if(!b) return;
      e.stopPropagation();
      const v = Math.round(Math.max(CIRC_MIN, Math.min(CIRC_MAX, circSize(d) + Number(b.dataset.d) * 0.1)) * 10) / 10;
      setListMarker(E, { ms:String(v) }); show();
    });
    items.push({ node:row });
  }
  return items;
}
function listLevel(E, delta){
  pickedLines(E, lines=>{
    for(const d of lines){
      if(!d.dataset.list) continue;
      setListLine(d, d.dataset.list, Math.max(0, Math.min(2, (Number(d.dataset.lvl) || 0) + delta)));
    }
  });
}
// Enter in a list line starts the next item (or, on an empty item, ends the list). Splits the line at the caret.
function listEnter(E){
  const tx = E.editing.tx, d = listLineAtCaret(tx), sel = getSelection();
  if(!d) return;
  const probe = d.cloneNode(true); probe.querySelector(':scope > .lst-m')?.remove();
  if(!probe.textContent.replace(/​/g,'').trim() && !probe.querySelector('img')){ clearListLine(d); renumberLists(tx); return; }
  const r = sel.getRangeAt(0);
  const tail = document.createRange();
  tail.setStart(r.endContainer, r.endOffset); tail.setEnd(d, d.childNodes.length);
  const frag = tail.extractContents();
  const nd = document.createElement('div');
  for(const k of ['mc', 'mb', 'ms']) if(d.dataset[k]) nd.dataset[k] = d.dataset[k]; // the next item keeps the marker's colour, bold and size
  setListLine(nd, d.dataset.list, Number(d.dataset.lvl) || 0);
  const m = document.createElement('span'); m.className = 'pptx-bu lst-m'; m.contentEditable = 'false';
  const z = document.createTextNode('​');
  nd.append(m, z, frag);
  d.after(nd);
  renumberLists(tx);
  const cr = document.createRange(); cr.setStart(z, 1); cr.collapse(true);
  sel.removeAllRanges(); sel.addRange(cr); E.editing.range = cr.cloneRange();
}
// v1.53: while typing, an outline round the box (round the whole table for a cell). The formatting is on the Object tab.
function editFrame(E){
  const ed = E.editing, st = E.stage;
  const o = (st.objects || []).find(o=>o.oid===(cellTable(ed.oid) || ed.oid)) || { x:0, y:0, w:st.W, h:20 };
  const frame = el('div','ed-editframe'); placeBox(frame, { ...o, h:editBoxH(E, o) }, st.k); st.ui.appendChild(frame);
  updateTextBar(E);
}
// While typing, a new text box grows taller with its text (as finishTextEdit saves it), so the outline follows.
// Returns the box height in slide units. Never shorter than the box's saved height.
function editBoxH(E, o){
  const ed = E.editing;
  if(o && ed.oid[0]==='n' && !cellTable(ed.oid) && fitAdded(E, ed.oid)) return Math.max(16, contentH(ed.tx)); // v1.94: fit-height boxes follow their text both ways
  if(!o || o.kind!=='text' || ed.oid[0]!=='n' || cellTable(ed.oid)) return o ? o.h : 20;
  return Math.max(o.h, Math.ceil(ed.tx.scrollHeight));
}
function growEditBox(E){
  const ed = E.editing, st = E.stage; if(!ed) return;
  const o = (st.objects || []).find(o=>o.oid===ed.oid); if(!o) return;
  const h = editBoxH(E, o);
  if(ed.h === h) return;
  ed.h = h;
  if(ed.el) ed.el.style.height = h + 'px';
  const fa = fitAdded(E, ed.oid); // the shape's outline and fill follow too
  if(fa && ed.el){ const svg = ed.el.querySelector(':scope > svg'); if(svg) svg.replaceWith(PPTX.addedSvg(fa.shape || 'rect', o.w, h, fa.fill || 'none', fa.line || 'none', fa.lw != null ? fa.lw : 1.5, false, false, fa.dash, fa.r)); }
  const fr = st.ui.querySelector('.ed-editframe'); if(fr) placeBox(fr, { ...o, h }, st.k);
}
document.addEventListener('input', e=>{
  if(view.name!=='edit' || !view.E.editing || !view.E.editing.tx.contains(e.target)) return;
  growEditBox(view.E);
});
function openSymbols(E, anchor){
  symbolPalette(anchor, ch=>{ if(!E.editing) return; E.editing.tx.focus(); const r = editRange(E); if(!r) return; document.execCommand('insertText', false, ch); const sel = getSelection(); if(sel.rangeCount) E.editing.range = sel.getRangeAt(0).cloneRange(); });
}
function updateTextBar(E){
  if(!E.editing) return;
  const bar = $('.ed-tbar');
  if(bar) for(const t of ['bold','italic','underline']){ const b = $(`[data-t="${t}"]`, bar); try{ b.classList.toggle('on', document.queryCommandState(t)); }catch(_){} }
  renderRibbon(E);
}
document.addEventListener('selectionchange', ()=>{
  if(view.name!=='edit' || !view.E.editing) return;
  const E = view.E, sel = getSelection();
  if(sel.rangeCount && E.editing.tx.contains(sel.getRangeAt(0).commonAncestorContainer)){ E.editing.range = sel.getRangeAt(0).cloneRange(); updateTextBar(E); }
});
// Tapping anywhere outside the text box and its bar finishes editing.
document.addEventListener('pointerdown', e=>{
  if(view.name!=='edit' || !view.E.editing) return;
  // Undo / Redo finish the typing themselves (so Undo knows when it took away an empty new box).
  if(e.target.closest('.ed-tbar, .ribbon, .ed-tabs, .menu, .ed-sbclip, [data-e=undo], [data-e=redo]') || view.E.editing.tx.contains(e.target)) return;
  const E = view.E, was = cellTable(E.editing.oid) ? E.editing.oid : null;
  const onSlide = e.button===0 && !!(e.target.closest && e.target.closest('.ed-stage')); // checked first: finishing redraws the slide
  finishTextEdit(E);
  // Into a table cell on the slide: start typing there (Shift / Ctrl-click from a cell picks cells instead).
  const cid = onSlide && !E.drawCover && !E.drawText ? cellAtPoint(E, e.clientX, e.clientY) : null;
  if(!cid) return;
  e.preventDefault(); e.stopPropagation();
  const toid = cellTable(cid);
  if((e.shiftKey || e.ctrlKey || e.metaKey) && was && cellTable(was)===toid){ E.sel = toid; E.cell = was; E.cellSel = null; cellPick(E, toid, cid, e.shiftKey ? 'range' : 'toggle'); return; }
  E.sel = toid; E.cell = cid; E.cellSel = null; clearMulti(E); E.selCover = null;
  startTextEdit(E, cid, false, [e.clientX, e.clientY]);
}, true);
// v1.71: a drag that starts in the cell being typed in selects text (as before) until it reaches another cell
// of the same table; from then on it picks cells from the typing cell to the pointer (as PowerPoint).
let tblDrag = null, tblDragClick = false;
document.addEventListener('pointerdown', e=>{
  tblDrag = null; tblDragClick = false;
  if(view.name!=='edit' || !view.E.editing || e.button!==0) return;
  const E = view.E, cid = E.editing.oid, toid = cellTable(cid);
  if(!toid || !E.editing.tx.contains(e.target)) return;
  tblDrag = { E, toid, cid, x:e.clientX, y:e.clientY, picking:false };
}, true);
document.addEventListener('pointermove', e=>{
  const d = tblDrag; if(!d || !e.buttons) return;
  const cid = cellAtPoint(d.E, e.clientX, e.clientY);
  if(!cid || cellTable(cid) !== d.toid) return;
  if(!d.picking){
    if(cid === d.cid || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.picking = true;
    finishTextEdit(d.E);
    d.E.sel = d.toid; d.E.cell = d.cid; d.E.cellSel = null; d.E.selCover = null;
  }
  cellPick(d.E, d.toid, cid, 'range');
}, true);
document.addEventListener('pointerup', ()=>{ if(tblDrag && tblDrag.picking) tblDragClick = true; tblDrag = null; }, true);
document.addEventListener('click', e=>{ if(tblDragClick){ tblDragClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
// Paste as plain text, so formatting from elsewhere doesn't come along.
document.addEventListener('paste', e=>{
  if(view.name!=='edit' || !view.E.editing || !view.E.editing.tx.contains(e.target)) return;
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
});

document.addEventListener('keydown', e=>{
  if(view.name!=='edit') return;
  const E = view.E;
  if(E.tab==='sb' && !E.editing){ if(window.SVSbEd && !(e.target.closest && e.target.closest('input,textarea'))) SVSbEd.keydown(E, e); return; } // v1.75: the builder covers the slide
  if(E.editing){
    if(e.key==='Escape'){ e.preventDefault(); finishTextEdit(E); }
    else if((e.ctrlKey || e.metaKey) && ['b','i','u'].includes(e.key.toLowerCase())){ e.preventDefault(); const t = { b:'bold', i:'italic', u:'underline' }[e.key.toLowerCase()]; fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); document.execCommand(t); }); }
    else if(e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && listLineAtCaret(E.editing.tx)){ e.preventDefault(); listEnter(E); } // v1.72
    else if(e.key==='Tab' && !cellTable(E.editing.oid) && !e.ctrlKey && !e.metaKey && !e.altKey && listLineAtCaret(E.editing.tx)){ e.preventDefault(); listLevel(E, e.shiftKey ? -1 : 1); } // v1.72: Tab indents a list (not in cells)
    else if(cellTable(E.editing.oid) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key==='Tab' || e.key.startsWith('Arrow'))) cellEditKey(E, e); // v1.70
    return; // everything else is typing
  }
  if(e.target.closest && e.target.closest('input,textarea')) return;
  if((e.ctrlKey || e.metaKey) && (e.key==='y' || e.key==='Y' || ((e.key==='z' || e.key==='Z') && e.shiftKey))){ e.preventDefault(); redoEdit(E); return; }
  if((e.ctrlKey || e.metaKey) && (e.key==='z' || e.key==='Z')){ e.preventDefault(); undoEdit(E); return; }
  // v1.71: Ctrl+B / I / U with cells picked (not typing) changes all of them.
  if((e.ctrlKey || e.metaKey) && !e.altKey && ['b','i','u'].includes(e.key.toLowerCase()) && E.cell && cellTable(E.cell) && !$('.modal-back')){ e.preventDefault(); cellsStyle(E, e.key.toLowerCase()); return; }
  if($('.modal-back')) return;
  if(e.key==='Escape' && E.orderMode){ endOrderMode(E); return; }
  if(E.orderMode) return; // Set reveal order: only clicks
  if(e.key==='Escape' && E.cellMode){ E.cellMode = false; buildEditOverlay(E); return; }
  if(e.key==='Escape' && E.adjust){ E.adjust = null; buildEditOverlay(E); return; } // v1.73
  if(e.key==='Escape' && E.crop){ E.crop = null; buildEditOverlay(E); return; } // v1.80
  const mod = e.ctrlKey || e.metaKey;
  if(mod && (e.key==='d' || e.key==='D')){ e.preventDefault(); if(E.focus==='slides') dupSlides(E); else if((E.sel || isMulti(E)) && E.mode==='pptx') dupObject(E); else if(E.selCover) dupCover(E); return; }
  // Slide strip: Delete, ↑ ↓ (Shift to select more), Ctrl+↑ ↓ to move, Ctrl+A, Esc.
  if(E.focus==='slides'){
    if(e.key==='Delete' || e.key==='Backspace'){ e.preventDefault(); const en = E.v.ent(E.i); if(en && en.del) restoreSlides(E); else deleteSlides(E); return; }
    if(e.key==='ArrowUp' || e.key==='ArrowDown'){
      e.preventDefault();
      const up = e.key==='ArrowUp';
      if(mod){ nudgeSlides(E, up ? -1 : 1); return; }
      const ks = shownKeys(E), at = ks.indexOf(E.i), nk = ks[at + (up ? -1 : 1)];
      if(nk!=null){ if(e.shiftKey) pickSlide(E, nk, { shift:true }); else pickSlide(E, nk); }
      return;
    }
    if(mod && (e.key==='a' || e.key==='A')){ e.preventDefault(); E.selS = new Set(E.v.keys); markStrip(E); return; }
    if(e.key==='Escape' && (E.selS.size > 1 || E.multi)){ E.multi = false; E.selS = new Set([E.i]); markStrip(E); return; }
    return;
  }
  const c = cfgOf(E);
  if(mod && (e.key==='a' || e.key==='A')){ e.preventDefault(); setMultiSel(E, (E.stage.objects || []).filter(o=>!o.cell && c.obj[o.oid]!=='del').map(o=>o.oid)); return; }
  // Arrow keys nudge the selected object(s) or cover box (Shift = bigger steps).
  const dir = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[e.key];
  // v1.70: in a table made in the editor, the arrow keys and Tab move between cells (the table itself moves by dragging).
  const tblA = !isMulti(E) && E.sel && c.obj[E.sel]!=='del' ? tableOf(c, E.sel) : null;
  if(tblA && (dir || e.key==='Tab') && !mod && !e.altKey){ e.preventDefault(); cellKey(E, tblA, e); return; }
  if(dir){
    const step = e.shiftKey ? 10 : 1;
    if(isMulti(E)){
      e.preventDefault();
      const list = multiObjs(E);
      change(E, c=>{ for(const o of list) moveObj(c, o, { x:o.x + dir[0]*step, y:o.y + dir[1]*step, w:o.w, h:o.h }); }, { coalesce:'nudge:multi' });
    } else if(E.sel && c.obj[E.sel]!=='del'){
      const o = (E.stage.objects || []).find(o=>o.oid===E.sel); if(!o) return;
      e.preventDefault();
      const r = { x:o.x + dir[0]*step, y:o.y + dir[1]*step, w:o.w, h:o.h };
      change(E, c=>{ if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a){ a.x = r.x; a.y = r.y; } } else c.geo[o.oid] = r; }, { coalesce:'nudge:' + o.oid });
    } else if(E.selCover){
      e.preventDefault();
      change(E, c=>{ const x = c.covers.find(x=>x.id===E.selCover); if(x){ x.x += dir[0]*step; x.y += dir[1]*step; } }, { coalesce:'nudge:' + E.selCover });
    }
    return;
  }
  if(e.key==='Delete' || e.key==='Backspace'){
    if(isMulti(E)){ e.preventDefault(); deleteMulti(E); }
    else if(E.cell && E.sel && c.obj[E.sel]!=='del'){ e.preventDefault(); clearCells(E); }
    else if(E.sel && c.obj[E.sel]!=='del'){ e.preventDefault(); deleteSel(E); }
    else if(E.selCover){ e.preventDefault(); deleteCover(E); }
  }
  else if(e.key==='Escape' && (E.drawCover || E.drawText)){ E.drawCover = false; E.drawText = null; E.lastCover = null; buildEditOverlay(E); }
  else if(e.key==='Escape' && enteredGroup(E)){ setMultiSel(E, enteredGroup(E).oids); } // v1.63: back up to the whole group
  else if(e.key==='Escape' && !isMulti(E) && !E.cell && E.sel && qaIdOf(c, E.sel) && qaOids(c, qaIdOf(c, E.sel)).length > 1){ setMultiSel(E, qaOids(c, qaIdOf(c, E.sel))); } // back up to the whole Q&A
  else if(e.key==='Escape' && (E.sel || E.selCover || E.selO.size || E.cell)){ if(E.cell){ E.cell = null; } else { E.sel = null; E.selCover = null; clearMulti(E); } buildEditOverlay(E); }
  else if(e.key==='Enter' && E.cell){ e.preventDefault(); startTextEdit(E, E.cell); }
  else if(e.key==='Enter' && E.sel && hasText(E, E.sel)){ e.preventDefault(); startTextEdit(E, E.sel); }
});

/* ---------- shapes, pictures, fill / outline ---------- */
const FILL_COLORS = ['#FFFFFF','#111114','#7F7F7F','#D93A2B','#F28C28','#F5B700','#1E9E5A','#2F5BEA','#4472C4','#7B3FB5','#FFE58A','#EAF0FE','#DFF3E6','#FDE2DF'];
const LINE_WIDTHS = [1, 2, 4, 6, 10];
const SHAPE_ORDER = ['rect','roundRect','ellipse','triangle','diamond','star5','rightArrow','speech','tick','cross','line','arrow'];
function shapeIcon(kind){ return icon('shape_' + kind, 'ico shape-ic'); }
const SHAPE_QUICK = ['rect','roundRect','ellipse','line','arrow']; // v1.87: these five are buttons on Insert; More shapes ▾ has the rest
function shapeMenu(E, anchor){
  closeMenus();
  const m = el('div', 'menu ed-shapes');
  m.innerHTML = `<div class="ed-shapes-g">${SHAPE_ORDER.filter(k=>!SHAPE_QUICK.includes(k)).map(k=>`<button data-shape="${k}" title="${esc(PPTX.SHAPES[k].name)}">${shapeIcon(k)}</button>`).join('')}</div>`;
  m.onclick = e=>{ const b = e.target.closest('[data-shape]'); if(!b) return; closeMenus(); addShape(E, b.dataset.shape); };
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
}
function addShape(E, kind){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const W = E.stage.W, H = E.stage.H;
  const line = kind==='line' || kind==='arrow';
  const sq = ['star5','tick','cross','ellipse'].includes(kind);
  const w = Math.round(line ? W*0.3 : sq ? H*0.26 : W*0.24), h = Math.round(line ? 0 : sq ? H*0.26 : H*0.22);
  const a = { id:uid(), x:Math.round((W - w)/2), y:Math.round((H - h)/2), w, h, shape:kind };
  // v1.88: the lesson's colours: middle fill, dark 2pt outline, light bold text (lines and arrows: the dark colour).
  const g = themeGrade(E);
  if(line) a.line = g.d; else { a.fill = g.m; a.line = g.d; a.lw = 2; a.tcol = g.l; a.tbold = true; }
  selectNew(E, 'n' + a.id);
  change(E, c=>{ c.added.push(a); });
  toast(line ? 'Drag the ends to place it' : 'Double-tap the shape to type in it');
}
/* ---------- tool icons (v1.68, Insert → Tool icon) ----------
   An added object with a.tool = { id, icon (Lucide name), col, secs? }. Tapping it while presenting starts the tool
   (SVTools.launchIcon, tools.js); the Clock starts a countdown of secs. It lives in this lesson only. */
function addToolIcon(E, spec){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const W = E.stage.W, H = E.stage.H, s = Math.round(H*0.14);
  const a = { id:uid(), x:Math.round((W - s)/2), y:Math.round((H - s)/2), w:s, h:s, tool:spec };
  selectNew(E, 'n' + a.id);
  change(E, c=>{ c.added.push(a); });
  toast('Drag it where you want it. Tap it while presenting to start the tool.');
}
// Picker for a new tool icon (o null) or for changing one (o = the selected tool icon).
function openToolIconPicker(E, o){
  if(E.mode!=='pptx'){ toast('Tool icons can only go into the PowerPoint version.', true); return; }
  const SV = window.SVTools; if(!SV || !SV.toolChoices) return;
  const choices = SV.toolChoices(), cur = o && o.tool ? o.tool : null;
  const st = { id: cur ? cur.id : choices[0].id, icon: cur ? cur.icon : null, min: 2, sec: 0 };
  if(cur && cur.secs){ st.min = Math.floor(cur.secs / 60); st.sec = cur.secs % 60; }
  const pick = ()=> choices.find(c=>c.id===st.id) || choices[0];
  if(!st.icon || (cur && cur.id!==st.id)) st.icon = pick().icon;
  const names = Object.keys(LUCIDE).sort();
  const secsOf = m=>{ const mn = Math.max(0, Math.min(180, parseInt(m.querySelector('[data-f=min]').value, 10) || 0)), sc = Math.max(0, Math.min(59, parseInt(m.querySelector('[data-f=sec]').value, 10) || 0)); return mn*60 + sc; };
  const paint = (m, parts)=>{
    if(!parts || parts.tools) m.querySelector('.ti-tools').innerHTML = choices.map(c=>`<button class="ti-tool${c.id===st.id ? ' on' : ''}" data-t="${c.id}"><span class="ti-sw" style="--c:${c.col}">${lucideSvg(c.icon)}</span>${esc(c.label)}</button>`).join('');
    if(!parts || parts.icons){
      const q = (m.querySelector('[data-f=q]').value || '').trim().toLowerCase();
      m.querySelector('.ti-icons').innerHTML = names.filter(n=>!q || n.includes(q.replace(/\s+/g, '-'))).map(n=>`<button class="ti-icon${n===st.icon ? ' on' : ''}" data-i="${n}" title="${n}">${lucideSvg(n)}</button>`).join('');
    }
    const pv = m.querySelector('.ti-preview'); pv.innerHTML = lucideSvg(st.icon); pv.style.setProperty('--c', pick().col);
    m.querySelector('.clock-sec').style.display = st.id==='clock' ? '' : 'none';
    m.querySelector('[data-a=ok]').disabled = st.id==='clock' && secsOf(m) <= 0;
  };
  modal(`<h2>${cur ? 'Change tool icon' : 'Insert tool icon'}</h2>
      <div class="ti-sec"><h4>Starts</h4><div class="ti-tools"></div></div>
      <div class="ti-sec clock-sec"><h4>Clock time</h4><div class="ti-clock"><input type="number" aria-label="Minutes" min="0" max="180" data-f="min" value="${st.min}"> min <input type="number" aria-label="Seconds" min="0" max="59" data-f="sec" value="${st.sec}"> sec</div></div>
      <div class="ti-sec"><h4>Icon</h4><div class="ti-preview"></div><input class="ti-search" data-f="q" aria-label="Search icons" placeholder="Search icons…" type="search"><div class="ti-icons"></div></div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${cur ? 'Save' : 'Place on slide'}</button></div>`,
    (m, shut)=>{
      paint(m);
      m.addEventListener('click', e=>{
        const t = e.target.closest('[data-t],[data-i]'); if(t){
          if(t.dataset.t){ st.id = t.dataset.t; st.icon = pick().icon; paint(m, { tools:true, icons:true }); }
          else { st.icon = t.dataset.i; paint(m, { icons:true }); }
          return;
        }
        if(e.target.closest('[data-a=no]')) return shut();
        if(e.target.closest('[data-a=ok]') && !e.target.closest('[disabled]')){
          const spec = { id:st.id, icon:st.icon, col:pick().col };
          if(st.id==='clock') spec.secs = secsOf(m);
          shut();
          if(o) change(E, c=>{ const a = c.added.find(a=>'n'+a.id===o.oid); if(a) a.tool = spec; });
          else addToolIcon(E, spec);
        }
      });
      m.addEventListener('input', e=>{
        if(e.target.dataset.f==='q') paint(m, { icons:true });
        else paint(m, {});
      });
    });
}
function pickPicture(E){
  if(E.mode!=='pptx') return;
  const inp = el('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml';
  // v1.52.1: always onto this slide (a picture pasted or dropped on the strip still makes a new slide).
  inp.onchange = ()=>{ const f = inp.files && inp.files[0]; if(f) addPicture(E, f, false); };
  inp.click();
}
const IMG_EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp', 'image/bmp':'bmp', 'image/svg+xml':'svg' };
// Saves a picture into the Lessons folder ('Media - ….png'), so it syncs like the decks. Returns its path.
async function savePicture(blob){
  const ext = IMG_EXT[blob.type] || 'png';
  const name = await uniqueName(MEDIA_PREFIX + new Date().toISOString().slice(0, 10) + ' ' + uid() + '.' + ext);
  const p = await store.writeDeck(name, blob);
  mediaUrls.set(p, URL.createObjectURL(blob));
  return p;
}
function imageSize(url){ return new Promise(res=>{ const im = new Image(); im.onload = ()=>res({ w:im.naturalWidth || 400, h:im.naturalHeight || 300 }); im.onerror = ()=>res({ w:400, h:300 }); im.src = url; }); }
// newSlide: a new slide after this one with the picture filling it (pasted slides, or a picture pasted on the strip).
// opts.fill (v1.62, Insert → Sentence Builder): as big as fits the slide, in the middle.
async function addPicture(E, blob, newSlide, opts){
  if(E.mode!=='pptx'){ toast('Pictures can only be added to the PowerPoint version.', true); return; }
  if(E.editing) finishTextEdit(E);
  let p;
  try{ showLoading('Adding picture…'); p = await savePicture(blob); }
  catch(e){ console.error(e); toast("Couldn't save the picture in the Lessons folder.", true); return; }
  finally{ hideLoading(); }
  const sz = await imageSize(mediaUrl(p));
  const W = E.stage.W, H = E.stage.H;
  const k = newSlide || (opts && opts.fill) ? Math.min(W/sz.w, H/sz.h) : Math.min(W*0.6/sz.w, H*0.6/sz.h, 1.5);
  const w = Math.round(sz.w*k), h = Math.round(sz.h*k);
  const a = { id:uid(), x:Math.round((W - w)/2), y:Math.round((H - h)/2), w, h, pic:p };
  if(newSlide){
    const nk = newSlideKey(E.l);
    slideOp(E, list=>{
      let at = list.findIndex(x=>x.k===E.i); at = at < 0 ? list.length : at + 1;
      list.splice(at, 0, { k:nk, src:{ blank:true } });
      E.l.hides[E.mode][nk] = { obj:{}, covers:[], added:[a] };
      E.i = nk; E.selS = new Set([nk]); E.anchorS = nk; E.sel = null; E.selCover = null;
    });
    if(!(opts && opts.quiet)) toast('Pasted as a new slide (a picture). To keep slides editable, use + Slide → Import slides from a PowerPoint.');
  } else {
    selectNew(E, 'n' + a.id);
    change(E, c=>{ c.added.push(a); });
  }
}
/* ---------- Waypoints (2026-10-24; spec claude/waypoints-spec.md; library in waypoints.js) ----------
   Insert → Waypoint ▾: "This term's Waypoint" (year from the lesson's Library folder, else asked) or "Choose". The picture
   fills the current slide if it has the 'INSERT WAYPOINT HERE' marker (the marker text is removed), otherwise it goes on
   a new slide after the current one. Only the current slide is checked for the marker. */
const WP_MARKER = /INSERT WAYPOINT HERE/i;
// Object ids of the marker text on the current slide (outermost matches only).
function markerOids(E){
  const root = E.stage && E.stage.frame; if(!root) return [];
  const hits = [...root.querySelectorAll('[data-oid]')].filter(n => WP_MARKER.test(n.textContent));
  return hits.filter(n => !hits.some(m => m !== n && n.contains(m))).map(n => n.dataset.oid);
}
function openWaypointMenu(E, anchor){
  if(E.mode!=='pptx'){ toast('Waypoints can only be added to the PowerPoint version.', true); return; }
  if(!window.SBWaypoints){ toast("Waypoints aren't available.", true); return; }
  const m = /^Year (\d+)\//.exec((E.l && E.l.fromLib) || ''), year = m ? Number(m[1]) : null;
  const done = (blob)=>insertWaypoint(E, blob);
  openMenu(anchor, [
    { label: year ? `This term's Waypoint for Year ${year}…` : "This term's Waypoint (year to choose)…", run:()=>SBWaypoints.choose({ auto:true, year, onPick:done }) },
    { label:'Choose a Waypoint…', run:()=>SBWaypoints.choose({ auto:false, year, onPick:done }) }
  ]);
}
async function insertWaypoint(E, blob){
  if(E.editing) finishTextEdit(E);
  const marker = markerOids(E);
  if(marker.length){
    await addPicture(E, blob, false, { fill:true, quiet:true });
    change(E, c=>{ for(const id of marker) c.obj[id] = 'del'; }); // the marker text goes
  } else {
    await addPicture(E, blob, true, { fill:true, quiet:true });
  }
}
/* ---------- picture frames (v1.73, Insert → Picture frame) ----------
   An added object { id, x, y, w, h, frame:{ fx?, fy? }, pic? } (pptx-render.js renderFrame). Empty: a dashed placeholder in the
   editor only. Drop a picture file on it, paste with it selected, double-click it or Object tab → Add picture to fill it; the
   picture fills the frame (crop to fill). Move picture (or double-click a filled frame): drag to choose which part shows.
   Pictures are saved like other pictures ('Media - …' in Lessons); big photos are scaled down first (FRAME_MAX px).
   Duplicates and copies keep the picture; the Slide Gallery and Object Gallery save frames empty (emptyFrames). */
const FRAME_MAX = 2000;
function frameOf(E, oid){ const c = cfgOf(E); return ((c && c.added) || []).find(a=>'n' + a.id===oid && a.frame) || null; }
function addFrame(E){
  if(E.mode!=='pptx'){ toast('Picture frames can only be added to the PowerPoint version.', true); return; }
  if(E.editing) finishTextEdit(E);
  const W = E.stage.W, H = E.stage.H;
  const w = Math.round(Math.min(W*0.4, H*0.6*4/3)), h = Math.round(w*3/4);
  const a = { id:uid(), x:Math.round((W - w)/2), y:Math.round((H - h)/2), w, h, frame:{} };
  selectNew(E, 'n' + a.id);
  change(E, c=>{ c.added.push(a); });
}
// The top picture frame under a point on screen (oid), or null.
function frameAt(E, cx, cy){
  const st = E.stage; if(!st || !st.frame) return null;
  const fr = st.frame.getBoundingClientRect(), x = (cx - fr.left)/st.k, y = (cy - fr.top)/st.k, c = cfgOf(E);
  const hit = (st.objects || []).filter(o=>o.kind==='frame' && c.obj[o.oid]!=='del' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
  return hit.length ? hit[hit.length - 1].oid : null;
}
// Big photos are scaled down (longest side FRAME_MAX px) so OneDrive and the data stay small. GIF / SVG are kept as they are.
async function shrinkPicture(blob){
  if(!/^image\/(png|jpeg|webp|bmp)$/.test(blob.type)) return blob;
  let bmp; try{ bmp = await createImageBitmap(blob); }catch(e){ return blob; }
  const big = Math.max(bmp.width, bmp.height);
  if(big <= FRAME_MAX){ bmp.close && bmp.close(); return blob; }
  const k = FRAME_MAX/big, cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width*k); cv.height = Math.round(bmp.height*k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close && bmp.close();
  const type = blob.type==='image/png' ? 'image/png' : 'image/jpeg';
  const out = await new Promise(res=>cv.toBlob(res, type, 0.9));
  return out || blob;
}
async function fillFrame(E, oid, blob){
  if(E.mode!=='pptx') return;
  if(E.editing) finishTextEdit(E);
  let p;
  try{ showLoading('Adding picture…'); p = await savePicture(await shrinkPicture(blob)); }
  catch(e){ console.error(e); toast("Couldn't save the picture in the Lessons folder.", true); return; }
  finally{ hideLoading(); }
  selectNew(E, oid);
  change(E, c=>{ const a = c.added.find(a=>'n' + a.id===oid); if(a){ a.pic = p; a.frame = {}; } });
}
function pickFramePicture(E, oid){
  const inp = el('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml';
  // In the page while the chooser is open (a detached input sometimes doesn't open it from a double-click).
  inp.hidden = true; $$('input.frame-pick').forEach(x=>x.remove()); inp.className = 'frame-pick'; document.body.appendChild(inp);
  inp.onchange = ()=>{ const f = inp.files && inp.files[0]; inp.remove(); if(f) fillFrame(E, oid, f); };
  inp.click();
}
function emptyFrame(E, oid){
  if(E.adjust===oid) E.adjust = null;
  change(E, c=>{ const a = c.added.find(a=>'n' + a.id===oid); if(a){ delete a.pic; a.frame = {}; } });
}
function frameDblTap(E, oid){ const a = frameOf(E, oid); if(a && a.pic) startFrameAdjust(E, oid); else { buildEditOverlay(E); setTimeout(()=>pickFramePicture(E, oid), 0); } } // after the tap's own events, or the chooser sometimes doesn't open
function startFrameAdjust(E, oid){
  const a = frameOf(E, oid); if(!a || !a.pic) return;
  if(E.editing) finishTextEdit(E);
  clearMulti(E); E.sel = oid; E.selCover = null; E.adjust = oid;
  buildEditOverlay(E);
}
// Move picture: dragging inside the frame slides the picture; one undo step per drag.
function frameAdjustBox(E, d, o, slideObj, k){
  d.classList.add('sel', 'adjust');
  d.innerHTML = '<span class="lab">Drag to move the picture</span>';
  const img = slideObj && slideObj.querySelector(':scope > img');
  d.addEventListener('pointerdown', e=>{
    if(e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const a = frameOf(E, o.oid); if(!a || !a.pic || !img || !img.naturalWidth) return;
    // v1.80: with a crop, the cropped part is what the frame shows (its size is nw × nh, less the crop).
    const cr = PPTX.cropOf((a.frame || {}).crop), fw = cr ? 1 - cr.l - cr.r : 1, fh = cr ? 1 - cr.t - cr.b : 1;
    const nw = cr ? cr.nw : img.naturalWidth, nh = cr ? cr.nh : img.naturalHeight, rw = nw*fw, rh = nh*fh;
    const s = Math.max(a.w/rw, a.h/rh), ox = rw*s - a.w, oy = rh*s - a.h;
    const f0 = PPTX.frameFocus(a), x0 = e.clientX, y0 = e.clientY, cl = v=>Math.max(0, Math.min(1, v));
    let fx = f0.fx, fy = f0.fy;
    try{ d.setPointerCapture(e.pointerId); }catch(err){}
    const mv = ev=>{
      if(ox > 0.5) fx = cl(f0.fx - (ev.clientX - x0)/k/ox);
      if(oy > 0.5) fy = cl(f0.fy - (ev.clientY - y0)/k/oy);
      if(cr) Object.assign(img.style, PPTX.frameImgStyle(a.w, a.h, { ...cr, nw, nh }, { fx, fy })); else img.style.objectPosition = `${fx*100}% ${fy*100}%`;
    };
    const up = ()=>{
      d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up);
      if(Math.abs(fx - f0.fx) < 0.001 && Math.abs(fy - f0.fy) < 0.001) return;
      const r3 = v=>Math.round(v*1000)/1000;
      change(E, c=>{ const x = c.added.find(x=>'n' + x.id===o.oid); if(x) x.frame = { ...x.frame, fx:r3(fx), fy:r3(fy) }; });
    };
    d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
  });
}
/* Crop (v1.80). Pictures added in the editor (a.crop), pictures from the deck (c.crop[oid]: the deck file is not changed;
   base = the box before the first crop, for Reset crop) and picture frames with a picture (a.frame.crop, with nw / nh, the
   picture's size). A crop is { l, t, r, b } as fractions of the whole picture. Crop mode: the whole picture shows faded
   and the edge handles drag the crop. One undo step per drag. Move picture (frames) works on the cropped part. */
function canCrop(E, o){
  if(!o || o.cell || o.kind==='tool') return false;
  if(o.kind==='frame'){ const fa = frameOf(E, o.oid); return !!(fa && fa.pic); }
  if(o.kind!=='pic') return false;
  const se = objEl(E, o.oid); return !!(se && se.querySelector(':scope > img'));
}
function hasCrop(E, o){
  if(!o) return false;
  if(o.kind==='frame'){ const fa = frameOf(E, o.oid); return !!(fa && fa.frame && fa.frame.crop); }
  if(o.added){ const a = cfgOf(E).added.find(a=>'n'+a.id===o.oid); return !!(a && a.crop); }
  return !!cfgOf(E).crop[o.oid];
}
// The crop now showing (for a deck picture: PowerPoint's own crop when the editor has none).
function cropNow(E, o){
  if(o.kind==='frame'){ const fa = frameOf(E, o.oid); return PPTX.cropOf(fa && fa.frame && fa.frame.crop); }
  if(o.added){ const a = cfgOf(E).added.find(a=>'n'+a.id===o.oid); return PPTX.cropOf(a && a.crop); }
  const se = objEl(E, o.oid); let cc = null;
  try{ cc = se && se.dataset.crop ? JSON.parse(se.dataset.crop) : null; }catch(e){}
  return PPTX.cropOf(cc);
}
function cropNat(E, o){
  if(o.kind!=='frame') return null;
  const fa = frameOf(E, o.oid), cr = fa && fa.frame && fa.frame.crop;
  if(cr && cr.nw) return { w:cr.nw, h:cr.nh };
  return E.cropNat || null;
}
function startCrop(E, oid){
  const o = (E.stage.objects || []).find(x=>x.oid===oid);
  if(!canCrop(E, o)) return;
  if(E.editing) finishTextEdit(E);
  if(o.kind==='frame'){
    const se = objEl(E, oid), img = se && se.querySelector(':scope > img');
    const fa = frameOf(E, oid), cr = fa && fa.frame && fa.frame.crop;
    E.cropNat = cr && cr.nw ? { w:cr.nw, h:cr.nh } : (img && img.naturalWidth ? { w:img.naturalWidth, h:img.naturalHeight } : null);
    if(!E.cropNat){ toast('The picture is still loading. Try again in a moment.', true); return; }
  }
  clearMulti(E); E.sel = oid; E.selCover = null; E.cell = null; E.adjust = null; E.crop = oid; buildEditOverlay(E);
}
function endCrop(E){ E.crop = null; buildEditOverlay(E); }
function resetCrop(E, o){
  if(E.crop===o.oid) E.crop = null;
  change(E, c=>{
    c.crop = c.crop || {};
    if(o.kind==='frame'){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a && a.frame) delete a.frame.crop; }
    else if(o.added){
      // Back to the whole picture at the same scale: the box grows back to the full picture.
      const a = c.added.find(a=>'n'+a.id===o.oid);
      if(a && a.crop){ const cc = PPTX.cropOf(a.crop); if(cc){ const Uw = a.w/(1 - cc.l - cc.r), Uh = a.h/(1 - cc.t - cc.b); a.x -= cc.l*Uw; a.y -= cc.t*Uh; a.w = Uw; a.h = Uh; } delete a.crop; }
    }
    else { const pc = c.crop[o.oid]; delete c.crop[o.oid]; if(pc && pc.base) c.geo[o.oid] = { ...pc.base }; }
  });
}
// Crop mode overlay: the whole picture faded behind the crop box, which has handles on its edges.
function cropOverlay(E, o, slideObj, k){
  const ui = E.stage.ui, frame = o.kind==='frame', a = frame ? frameOf(E, o.oid) : null;
  const img = slideObj.querySelector(':scope > img'); if(!img) return;
  const cur = cropNow(E, o) || { l:0, t:0, r:0, b:0 };
  const nat = cropNat(E, o);
  // The whole picture on the slide. A frame: the picture fitted inside the frame. A stretched picture: its box grows with the crop.
  let full;
  if(frame){
    const s = Math.min(a.w/nat.w, a.h/nat.h), w = nat.w*s, h = nat.h*s;
    full = { x:a.x + (a.w - w)/2, y:a.y + (a.h - h)/2, w, h };
  } else {
    const fw = 1 - cur.l - cur.r, fh = 1 - cur.t - cur.b, Uw = o.w/fw, Uh = o.h/fh;
    full = { x:o.x - cur.l*Uw, y:o.y - cur.t*Uh, w:Uw, h:Uh };
  }
  const ghost = el('div', 'ed-crop-ghost'); placeBox(ghost, full, k);
  const gi = el('img'); gi.src = img.getAttribute('src') || img.src; gi.draggable = false; ghost.appendChild(gi); ui.appendChild(ghost);
  const d = el('div', 'ed-obj sel crop'); d.dataset.oid = o.oid; d.title = o.name;
  const clamp = v=>Math.max(0, Math.min(1, v));
  const fracsOf = R=>({ l:clamp((R.x - full.x)/full.w), t:clamp((R.y - full.y)/full.h), r:clamp((full.x + full.w - R.x - R.w)/full.w), b:clamp((full.y + full.h - R.y - R.h)/full.h) });
  let R = { x:full.x + cur.l*full.w, y:full.y + cur.t*full.h, w:full.w*(1 - cur.l - cur.r), h:full.h*(1 - cur.t - cur.b) };
  const paint = ()=>{
    placeBox(d, R, k);
    const F = fracsOf(R);
    if(frame) Object.assign(img.style, PPTX.frameImgStyle(a.w, a.h, { ...F, nw:nat.w, nh:nat.h }, PPTX.frameFocus(a)));
    else { Object.assign(slideObj.style, { left:R.x+'px', top:R.y+'px', width:R.w+'px', height:R.h+'px' }); Object.assign(img.style, PPTX.stretchImgStyle(R.w, R.h, F)); }
  };
  const minPx = 8;
  const HANDLES = [['tl',0,0,'nwse-resize'],['t',.5,0,'ns-resize'],['tr',1,0,'nesw-resize'],['r',1,.5,'ew-resize'],['br',1,1,'nwse-resize'],['b',.5,1,'ns-resize'],['bl',0,1,'nesw-resize'],['l',0,.5,'ew-resize']];
  for(const [key, px, py, cursor] of HANDLES){
    const hd = el('div', 'ed-crop-h');
    hd.dataset.h = key; hd.style.left = (px*100) + '%'; hd.style.top = (py*100) + '%'; hd.style.cursor = cursor;
    hd.addEventListener('pointerdown', e=>{
      if(e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX, y0 = e.clientY, R0 = { ...R }, start = fracsOf(R0);
      // A deck picture's box before its first crop (kept for Reset crop).
      const prev = frame || o.added ? null : cfgOf(E).crop[o.oid];
      const base = (prev && prev.base) || { x:o.x, y:o.y, w:o.w, h:o.h };
      try{ hd.setPointerCapture(e.pointerId); }catch(err){}
      const mv = ev=>{
        const dx = (ev.clientX - x0)/k, dy = (ev.clientY - y0)/k;
        let x1 = R0.x, y1 = R0.y, x2 = R0.x + R0.w, y2 = R0.y + R0.h;
        if(key.includes('l')) x1 += dx;
        if(key.includes('r')) x2 += dx;
        if(key.includes('t')) y1 += dy;
        if(key.includes('b')) y2 += dy;
        x1 = Math.max(full.x, Math.min(x1, x2 - minPx)); x2 = Math.min(full.x + full.w, Math.max(x2, x1 + minPx));
        y1 = Math.max(full.y, Math.min(y1, y2 - minPx)); y2 = Math.min(full.y + full.h, Math.max(y2, y1 + minPx));
        R = { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
        paint();
      };
      const up = ()=>{
        hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
        const F = fracsOf(R), r3 = v=>Math.round(v*1000)/1000;
        const cc = { l:r3(F.l), t:r3(F.t), r:r3(F.r), b:r3(F.b) };
        const same = Math.abs(cc.l-start.l) < 0.001 && Math.abs(cc.t-start.t) < 0.001 && Math.abs(cc.r-start.r) < 0.001 && Math.abs(cc.b-start.b) < 0.001;
        if(same){ showEdit(E); return; } // the slide was moved live: redraw it from the data
        change(E, c=>{
          c.crop = c.crop || {};
          if(frame){ const x = c.added.find(x=>'n'+x.id===o.oid); if(x){ x.frame = x.frame || {}; x.frame.crop = { ...cc, nw:nat.w, nh:nat.h }; } }
          else if(o.added){ const x = c.added.find(x=>'n'+x.id===o.oid); if(x){ x.crop = cc; x.x = R.x; x.y = R.y; x.w = R.w; x.h = R.h; } }
          else { c.crop[o.oid] = { ...cc, base }; c.geo[o.oid] = { x:R.x, y:R.y, w:R.w, h:R.h }; }
        });
      };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
    d.appendChild(hd);
  }
  paint();
  ui.appendChild(d);
}
function rbCropGroup(E, o){
  if(!canCrop(E, o)) return '';
  const on = E.crop===o.oid;
  return rbGroup('Crop', rbI('cropmode', 'crop', on ? 'Done cropping: finish cropping (Esc)' : 'Crop: drag the edges of the picture to crop it', { on })
    + rbI('cropreset', 'undo', 'Reset crop: show the whole picture again', { dis:!hasCrop(E, o) }));
}
function rbFrameGroup(E, o){
  const a = frameOf(E, o.oid), full = !!(a && a.pic);
  return rbGroup('Frame', rbI('framepic', 'image', full ? 'Replace picture: put a different picture in this frame' : 'Add picture: choose one for this frame (or drop / paste one onto it)')
    + rbI('frameadj', 'frameMove', E.adjust===o.oid ? 'Done moving: finish moving the picture' : 'Move picture: drag it to choose which part shows in the frame (or double-click the frame)', { on:E.adjust===o.oid, dis:!full })
    + rbI('frameempty', 'frameEmpty', 'Empty frame: take the picture out; the frame stays', { dis:!full }));
}
// Gallery copies keep their frames but not the pictures in them. items: [{ a }] (changed in place).
function emptyFrames(items){ for(const it of items || []){ const a = it && it.a; if(a && a.frame){ delete a.pic; a.frame = {}; } } }
// v1.52.1: a newly added object is the only thing selected (no cover box, cells or several objects left selected
// alongside it) and any draw tool is put down.
function selectNew(E, oid){
  clearMulti(E); E.sel = oid; E.selCover = null; E.cell = null; E.cellSel = null;
  E.drawCover = false; E.drawText = null; E.lastCover = null;
}
function addPastedText(E, text){
  if(E.mode!=='pptx'){ toast('Text can only be added to the PowerPoint version.', true); return; }
  text = String(text).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
  if(!text) return;
  const W = E.stage.W, H = E.stage.H;
  const lines = text.split('\n').reduce((n, t)=>n + Math.max(1, Math.ceil(t.length / 42)), 0);
  const h = Math.min(H*0.8, Math.round(lines*33.6 + 8)), w = Math.round(W*0.6);
  const a = { id:uid(), x:Math.round((W - w)/2), y:Math.round(Math.max(10, (H - h)/2)), w, h, plain:text };
  selectNew(E, 'n' + a.id);
  change(E, c=>{ c.added.push(a); });
}
// Fill / outline for the selected object. PowerPoint shapes keep it in cfg.style[oid]; added objects on the object itself.
function objStyle(c, o){
  if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid) || {}; return { fill:a.fill, line:a.line, lw:a.lw }; }
  return c.style[o.oid] || {};
}
// Spell-check language per text box: 'fr' | 'es' | 'en'. Default = the lesson's language.
// PowerPoint objects keep it in cfg.style[oid].lang; added boxes on the object (a.lang).
const BOX_LANG_NEXT = { fr:'es', es:'en', en:'fr' }, BOX_LANG_LABEL = { fr:'FR', es:'ES', en:'EN' };
function boxLang(E, oid){
  const c = cfgOf(E), lesson = (E.l && E.l.lang) || 'fr';
  let v = null;
  if(oid && oid[0]==='n'){ const a = c.added.find(a=>'n'+a.id===oid); v = a && a.lang; }
  else v = c.style[oid] && c.style[oid].lang;
  return v || lesson;
}
function patchStyle(c, o, patch){
  if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a) for(const [k, v] of Object.entries(patch)){ if(v==null) delete a[k]; else a[k] = v; } }
  else { const s = Object.assign({}, c.style[o.oid] || {}); for(const [k, v] of Object.entries(patch)){ if(v==null) delete s[k]; else s[k] = v; } if(Object.keys(s).length) c.style[o.oid] = s; else delete c.style[o.oid]; }
}
function setObjStyle(E, o, patch){ change(E, c=>patchStyle(c, o, patch)); }
/* ---------- mass editing (several objects selected) ----------
   Text boxes: font, size, text colour, fill, outline, Autofit. Shapes: fill, outline. Each button works on the selected
   objects it applies to and is one undo step. */
const MASS_NO_STYLE = new Set(['pic', 'frame', 'table', 'tool']);
function isTextBox(E, o){ return !o.cell && o.kind!=='table' && hasText(E, o.oid); } // text boxes and shapes with text in them
function massTextBoxes(E){ return multiObjs(E).filter(o=>isTextBox(E, o)); }
function massStyled(E){ return multiObjs(E).filter(o=>{ if(o.cell || MASS_NO_STYLE.has(o.kind)) return false; const k = objCaps(E, o); return k.fill || k.line; }); }
// Runs fn on each selected text box with all its text selected (as the single-box ribbon does), then saves every box in one step.
// o.oids: these boxes instead of the selected ones; o.keep: leave the selection as it was.
function massText(E, fn, o={}){
  const oids = o.oids || massTextBoxes(E).map(o=>o.oid); if(!oids.length) return;
  const keep = o.keep ? { sel:E.sel, selO:new Set(E.selO), selOi:E.selOi } : null;
  const done = [];
  for(const oid of oids){
    startTextEdit(E, oid); const ed = E.editing; if(!ed) continue;
    const r = document.createRange(); r.selectNodeContents(ed.tx);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ed.range = r.cloneRange();
    fn();
    E.editing = null;
    const tx = ed.tx;
    tx.removeAttribute('contenteditable'); tx.removeAttribute('spellcheck');
    for(const b of tx.querySelectorAll('.pptx-bu')) b.removeAttribute('contenteditable');
    for(const sp of tx.querySelectorAll('span:not(.lst-m)')){ const fs = parseFloat(sp.style.fontSize); if(fs) sp.dataset.fs = fs; }
    done.push({ oid, html:tx.innerHTML, grow:oid[0]==='n' ? tx.scrollHeight : 0 });
  }
  getSelection().removeAllRanges();
  E.cell = null; E.selCover = null;
  if(keep){ E.sel = keep.sel; E.selO = keep.selO; E.selOi = keep.selOi; } else { E.sel = null; E.selO = new Set(oids); E.selOi = E.i; }
  change(E, c=>{
    for(const d of done){
      if(d.oid[0]==='n'){ const a = c.added.find(a=>'n'+a.id===d.oid); if(a){ a.html = d.html; delete a.plain; if(!a.shape && a.art==null) a.h = Math.max(a.h, Math.ceil(d.grow)); } }
      else c.text[d.oid] = d.html;
    }
  });
}
function massFill(E, list, fill){ change(E, c=>{ for(const o of list) if(objCaps(E, o).fill) patchStyle(c, o, { fill }); }); }
// The outline change one pick (colour, thickness or style) makes to one object: as pickLine, which gives a bare object a black 2pt line first.
function linePatch(c, o, p){
  const sty = objStyle(c, o), D = OBJ_DEFAULTS[o.kind] || {}, lw = sty.lw!=null ? sty.lw : D.lw;
  const fresh = (sty.line==null || sty.line==='none') && sty.lw==null && !D.line, bare = fresh || sty.line==='none';
  if(p.color) return p.color==='none' ? { line:'none' } : fresh ? { line:p.color, lw:2 } : { line:p.color };
  if(p.lw) return bare ? { lw:p.lw, line:sty.line && sty.line!=='none' ? sty.line : '#111114' } : { lw:p.lw };
  if(p.dash) return Object.assign({ dash:p.dash==='solid' ? (o.added ? null : 'solid') : p.dash }, bare ? { line:'#111114', lw:lw || 2 } : {});
  return {};
}
function massLine(E, list, anchor){
  const lines = list.filter(o=>objCaps(E, o).line); if(!lines.length) return;
  const c = cfgOf(E), sty = objStyle(c, lines[0]), D = OBJ_DEFAULTS[lines[0].kind] || {};
  colourPop(anchor, { title:'Outline', scope:`${lines.length} objects`, none:true, cur:sty.line, widths:true, lw:sty.lw!=null ? sty.lw : D.lw, dash:sty.dash || 'solid' }, p=>{
    change(E, c=>{ for(const o of lines) patchStyle(c, o, linePatch(c, o, p)); });
  });
}
// Autofit: the box takes the size of its text. One line grows or shrinks to the text's width (as far as the slide's edge, then it wraps); the box keeps its left, centre or right edge to match the text's alignment.
function textFitSize(E, o, maxW){
  const e = objEl(E, o.oid), tx = e && e.querySelector(':scope > .pptx-tx'); if(!tx || !tx.textContent.replace(/​/g,'').trim()) return null; // an empty box or shape is left as it is
  const m = tx.cloneNode(true);
  Object.assign(m.style, { position:'absolute', inset:'auto', left:'0', top:'0', visibility:'hidden', pointerEvents:'none', width:'max-content', height:'auto', maxWidth:'none', whiteSpace:'pre', overflow:'visible' });
  m.removeAttribute('contenteditable');
  e.appendChild(m); unfitText(m);
  let w = Math.ceil(m.offsetWidth) + 1;
  if(w > maxW){ w = Math.floor(maxW); m.style.width = w + 'px'; m.style.whiteSpace = 'pre-wrap'; }
  const h = Math.ceil(m.offsetHeight), al = (m.querySelector('.pptx-p') || {}).style && m.querySelector('.pptx-p').style.textAlign;
  m.remove();
  return { w:Math.max(24, w), h:Math.max(16, h), al };
}
function autofitBoxes(E){
  const one = selObj(E), list = isMulti(E) ? massTextBoxes(E) : one && isTextBox(E, one) ? [one] : [];
  if(!list.length){ toast('Autofit works on text boxes and shapes with text'); return; }
  const W = E.stage.W, jobs = [];
  for(const o of list){
    const s = textFitSize(E, o, Math.max(24, W - o.x)); if(!s) continue;
    let x = s.al==='center' ? o.x + (o.w - s.w)/2 : s.al==='right' ? o.x + o.w - s.w : o.x;
    x = Math.max(0, Math.min(Math.max(0, W - s.w), x));
    jobs.push({ o, r:{ x:Math.round(x*10)/10, y:o.y, w:s.w, h:s.h } });
  }
  if(!jobs.length) return;
  change(E, c=>{ for(const j of jobs) moveObj(c, j.o, j.r); });
}
function rbMassText(E, tb){
  const tis = tb.map(o=>textInfo(E, o.oid) || {}), ti = tis[0];
  const fonts = [...new Set([ti.font, ...slideFonts(E), ...RB_FONTS].filter(Boolean))], fw = Math.max(96, Math.min(230, 44 + (ti.font || 'Arial').length * 8));
  const same = tis.every(t=>t.size===ti.size);
  return rbGroup('Font', `<select class="rb-font" data-r="mfont" data-tip="Font: every text box" aria-label="Font" style="width:${fw}px">${fonts.map(f=>`<option${f===ti.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`)
    + rbGroup('Size', rbI('msmaller', 'minus', 'Smaller: every text box') + `<span class="rb-fs" title="Font size (pt)">${same ? ti.size || '' : '–'}</span>` + rbI('mbigger', 'plus', 'Bigger: every text box'))
    + rbGroup('Format', rbBtn('mbold', null, '', { cls:'ic tb', pre:'<b>B</b>', on:tis.every(t=>t.b), title:'Bold: every text box' }) + rbBtn('mitalic', null, '', { cls:'ic tb', pre:'<i>I</i>', on:tis.every(t=>t.i), title:'Italic: every text box' }) + rbBtn('munderline', null, '', { cls:'ic tb', pre:'<u>U</u>', on:tis.every(t=>t.u), title:'Underline: every text box' }))
    + rbTextColourGroup(ti.color || '#000000', 'mtcolorq', 'mtcolor');
}
// Bold / italic / underline on every text box: off if they all have it already, otherwise on for all (a box that has it is left alone).
function massToggle(E, cmd){
  const tis = massTextBoxes(E).map(o=>textInfo(E, o.oid) || {}), key = { bold:'b', italic:'i', underline:'u' }[cmd];
  const on = !tis.every(t=>t[key]);
  massText(E, ()=>fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); if(document.queryCommandState(cmd) !== on) document.execCommand(cmd); }));
}
function rbMassStyle(E, st){
  const c = cfgOf(E), sty = objStyle(c, st[0]), D = OBJ_DEFAULTS[st[0].kind] || {}, fill = sty.fill || D.fill || '', line = sty.line || D.line || '';
  const sw = (v, ring)=>`<span class="ed-sw${ring ? ' ring' : ''}${!v || v==='none' ? ' none' : ''}" style="--c:${v && v!=='none' ? v : '#fff'}"></span>`;
  return (st.some(o=>objCaps(E, o).fill) ? rbGroup('Fill', rbQuick('mfillq', 'none', 'No fill', !fill || fill==='none') + YEAR_COLS.map(y=>rbQuick('mfillq', y[1], `${y[3]}: dark`, fill.toLowerCase()===y[1].toLowerCase())).join('')
      + rbQuick('mfillq', STD_COLOUR, 'Standard ' + STD_COLOUR, fill.toLowerCase()===STD_COLOUR.toLowerCase()) + rbBtn('mfill', null, '', { cls:'ic', pre:sw(fill), dd:true, title:'More colours: fill colour' })) : '')
    + rbGroup('Outline', rbBtn('mline', null, '', { cls:'ic', pre:sw(line, true), dd:true, title:'Outline: colour, thickness and style' }));
}
function colourPop(anchor, opts, onPick){
  closeMenus();
  // v1.87 (spec §10): "More colours". Header · Standard · Standard colours · Year colours · Saved colours · picker, hue and HEX.
  // opts: title, scope (shown after the title), cur, none (No fill), deck (Deck's own), widths / dash / arrow (line extras).
  const m = el('div', 'menu ed-cpop ed-cpop2');
  const cur = (opts.cur || '').toLowerCase();
  const dot = (c, label)=>`<button data-c="${c}" style="--c:${c}" class="${cur===c.toLowerCase() ? 'on' : ''}" title="${label || c}" aria-label="${label || c}"></button>`;
  const saved = colStore.get('sv_saved_cols');
  const hex0 = /^#[0-9a-f]{6}$/i.test(opts.cur || '') ? opts.cur : STD_COLOUR;
  m.innerHTML = `<div class="ed-cp-h"><b>${esc(opts.title)}</b>${opts.scope ? `<span>· ${esc(opts.scope)}</span>` : ''}<button data-close aria-label="Close">${icon('x')}</button></div>`
    + `<div class="ed-cp-top">${opts.none ? `<button data-c="none" class="ed-cp-wide${cur==='none' ? ' on' : ''}"><i class="ed-cp-sw none"></i>No fill</button>` : ''}`
    + `${opts.deck ? `<button data-c="deck" class="ed-cp-wide${cur==='' ? ' on' : ''}"><i class="ed-cp-sw deck"></i>Deck’s own</button>` : ''}`
    + `<button data-c="${STD_COLOUR}" class="ed-cp-wide${cur===STD_COLOUR.toLowerCase() ? ' on' : ''}"><i class="ed-cp-sw" style="--c:${STD_COLOUR}"></i>Standard</button></div>`
    + `<div class="ed-cp-l">Standard colours</div><div class="ed-cp-g">${[...PPT_COLS, ...GREY_COLS].map(c=>dot(c)).join('')}</div>`
    + `<div class="ed-cp-l">Theme colours</div><div class="ed-cp-t">${THEME_COLS.map((t, i)=>`<span>${i + 1}</span>${dot(t[2], `${t[1]}: dark ${t[2]}`)}${dot(t[3], `${t[1]}: middle ${t[3]}`)}${dot(t[4], `${t[1]}: light ${t[4]}`)}`).join('')}</div>`
    + `<div class="ed-cp-l">Saved colours</div><div class="ed-cp-g ed-cp-saved">${saved.map(c=>dot(c)).join('')}<button data-save class="ed-cp-add" title="Save the colour in the picker" aria-label="Save current colour">${icon('plus')}</button></div>`
    + (opts.widths ? `<div class="ed-cp-l">Thickness</div><div class="ed-cpop-w">${LINE_WIDTHS.map(w=>`<button data-w="${w}" class="${Number(opts.lw)===w ? 'on' : ''}" title="${w} pt"><span style="height:${Math.max(1, w*0.8)}px"></span></button>`).join('')}</div>` : '')
    + (opts.dash ? `<div class="ed-cp-l">Style</div><div class="ed-cpop-w">${[['solid','Solid'],['dash','Dashed'],['dot','Dotted']].map(([v, t])=>`<button data-dash="${v}" class="${opts.dash===v ? 'on' : ''}">${t}</button>`).join('')}</div>` : '')
    + (opts.arrow ? `<div class="ed-cp-l">End</div><div class="ed-cpop-w"><button data-arrow="line" class="${opts.arrow==='line' ? 'on' : ''}">Line</button><button data-arrow="arrow" class="${opts.arrow==='arrow' ? 'on' : ''}">Arrow →</button></div>` : '')
    + `<div class="ed-cp-l">Pick a colour</div><div class="ed-cp-sv" tabindex="-1"><i></i></div><input type="range" class="ed-cp-hue" min="0" max="360" value="0" aria-label="Hue">`
    + `<div class="ed-cp-val"><select aria-label="Colour format"><option>HEX</option><option>RGB</option></select><input type="text" class="ed-cp-in" spellcheck="false" aria-label="Colour value"><i class="ed-cp-sw ed-cp-prev"></i><button data-apply class="ed-cp-use">Use</button></div>`;
  // The picker: hue (0–360), saturation and value (0–1) <-> hex.
  const st = { h:0, s:0, v:1 };
  const toHex = ()=>{ const { h, s, v } = st, f = n=>{ const k = (n + h/60) % 6; return v - v*s*Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(x=>Math.round(x*255).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const fromHex = hx=>{ const r = parseInt(hx.substr(1, 2), 16)/255, g = parseInt(hx.substr(3, 2), 16)/255, b = parseInt(hx.substr(5, 2), 16)/255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if(d){ h = mx===r ? ((g - b)/d) % 6 : mx===g ? (b - r)/d + 2 : (r - g)/d + 4; h = (h*60 + 360) % 360; }
    st.h = Math.round(h); st.s = mx ? d/mx : 0; st.v = mx; };
  const sv = m.querySelector('.ed-cp-sv'), hue = m.querySelector('.ed-cp-hue'), inp = m.querySelector('.ed-cp-in'), fmtSel = m.querySelector('select'), prev = m.querySelector('.ed-cp-prev');
  const paint = (skipText)=>{
    sv.style.setProperty('--hue', st.h); sv.firstChild.style.left = (st.s*100) + '%'; sv.firstChild.style.top = ((1 - st.v)*100) + '%'; hue.value = st.h;
    const hx = toHex(); prev.style.setProperty('--c', hx);
    if(!skipText){ inp.value = fmtSel.value==='RGB' ? [1, 3, 5].map(i=>parseInt(hx.substr(i, 2), 16)).join(', ') : hx; }
  };
  const parse = ()=>{ const t = inp.value.trim(); let hx = null;
    if(fmtSel.value==='RGB'){ const p = t.split(/[\s,]+/).map(Number); if(p.length===3 && p.every(n=>n >= 0 && n <= 255)) hx = '#' + p.map(n=>Math.round(n).toString(16).padStart(2, '0')).join(''); }
    else { const x = t.replace(/^#/, ''); if(/^[0-9a-f]{6}$/i.test(x)) hx = '#' + x; else if(/^[0-9a-f]{3}$/i.test(x)) hx = '#' + x.split('').map(ch=>ch + ch).join(''); }
    return hx ? hx.toUpperCase() : null; };
  fromHex(hex0); paint();
  const svMove = e=>{ const r = sv.getBoundingClientRect(); st.s = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width)); st.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top)/r.height)); paint(); };
  sv.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); try{ sv.setPointerCapture(e.pointerId); }catch(_){} svMove(e); sv.onpointermove = svMove; });
  sv.addEventListener('pointerup', ()=>{ sv.onpointermove = null; });
  hue.addEventListener('input', ()=>{ st.h = Number(hue.value); paint(); });
  fmtSel.addEventListener('change', ()=>paint());
  inp.addEventListener('input', ()=>{ const hx = parse(); if(hx){ fromHex(hx); paint(true); } });
  const use = ()=>{ const hx = parse() || toHex(); closeMenus(); onPick({ color:hx }); };
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); use(); } e.stopPropagation(); });
  // Keep the text selection (text colour while typing); the text field and the list still need their own clicks.
  m.addEventListener('pointerdown', e=>{ e.stopPropagation(); if(!e.target.closest('input,select')) e.preventDefault(); });
  m.addEventListener('mousedown', e=>{ if(!e.target.closest('input,select')) e.preventDefault(); });
  m.onclick = e=>{
    const b = e.target.closest('button'); if(!b) return;
    e.stopPropagation();
    if(b.hasAttribute('data-close')){ closeMenus(); return; }
    if(b.hasAttribute('data-save')){ colStore.push('sv_saved_cols', toHex(), 12); b.closest('.ed-cp-saved').insertAdjacentHTML('afterbegin', dot(toHex())); return; }
    if(b.hasAttribute('data-apply')){ use(); return; }
    closeMenus();
    if(b.dataset.c) onPick({ color:b.dataset.c });
    else if(b.dataset.w) onPick({ lw:Number(b.dataset.w) });
    else if(b.dataset.arrow) onPick({ shape:b.dataset.arrow });
    else if(b.dataset.dash) onPick({ dash:b.dataset.dash });
  };
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  const top = r.bottom + 6 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 6) : r.bottom + 6;
  m.style.top = top + 'px';
  m.style.maxHeight = (innerHeight - top - 8) + 'px';
}
// Which formatting an object can take.
function objCaps(E, o){
  const k = o.kind || '';
  const e = objEl(E, o.oid);
  const svgShape = !!(e && e.querySelector(':scope > svg, :scope > .pptx-art > svg'));
  if(k==='line') return { fill:false, line:true, arrow:true };
  if(k==='table') return { fill:true, line:true };
  if(k==='pic' || k==='frame') return { fill:false, line:true };
  if(k==='shape' || k==='text') return { fill:true, line:true };
  if(k==='copy') return { fill:svgShape, line:svgShape };
  if(k==='sp') return { fill:true, line:true };
  return { fill:false, line:false };
}
// Line / arrow: the two ends (slide units). Drawn from top-left to bottom-right, then flipped.
function lineEnds(a){
  const x1 = a.flipH ? a.x + a.w : a.x, y1 = a.flipV ? a.y + a.h : a.y;
  const x2 = a.flipH ? a.x : a.x + a.w, y2 = a.flipV ? a.y : a.y + a.h;
  return [[x1, y1], [x2, y2]];
}
function fromEnds(p1, p2){
  const r1 = v=>Math.round(v*10)/10;
  return { x:r1(Math.min(p1[0], p2[0])), y:r1(Math.min(p1[1], p2[1])), w:r1(Math.abs(p2[0] - p1[0])), h:r1(Math.abs(p2[1] - p1[1])), flipH:p1[0] > p2[0], flipV:p1[1] > p2[1] };
}
function lineHandles(E, d, o, a){
  const k = E.stage.k, ends = lineEnds(a);
  ends.forEach((pt, n)=>{
    const hEl = el('div', 'ed-h ed-end');
    Object.assign(hEl.style, { left:(pt[0] - o.x + (d._ox || 0))*k + 'px', top:(pt[1] - o.y + (d._oy || 0))*k + 'px' });
    hEl.addEventListener('pointerdown', e=>{
      e.preventDefault(); e.stopPropagation();
      try{ hEl.setPointerCapture(e.pointerId); }catch(_){}
      const fr = E.stage.frame.getBoundingClientRect();
      let moved = false, last = null;
      const mv = ev=>{
        moved = true;
        let p = [(ev.clientX - fr.left)/k, (ev.clientY - fr.top)/k];
        const other = ends[1 - n];
        // Shift: keep it straight (horizontal, vertical or 45°).
        if(ev.shiftKey){ const dx = p[0] - other[0], dy = p[1] - other[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI/4)) * Math.PI/4, len = Math.hypot(dx, dy); p = [other[0] + Math.cos(ang)*len, other[1] + Math.sin(ang)*len]; }
        last = n===0 ? fromEnds(p, other) : fromEnds(other, p);
        const se = objEl(E, o.oid);
        if(se){ se.innerHTML = ''; Object.assign(se.style, { left:last.x+'px', top:last.y+'px', width:last.w+'px', height:last.h+'px' }); se.appendChild(PPTX.addedSvg(a.shape, last.w, last.h, 'none', a.line || '#111114', a.lw!=null ? a.lw : 4, last.flipH, last.flipV)); }
        $$('.ed-bar', E.stage.ui).forEach(x=>x.remove());
        Object.assign(hEl.style, { left:(p[0] - o.x + (d._ox || 0))*k + 'px', top:(p[1] - o.y + (d._oy || 0))*k + 'px' });
      };
      const up = ()=>{
        hEl.removeEventListener('pointermove', mv); hEl.removeEventListener('pointerup', up); hEl.removeEventListener('pointercancel', up);
        if(moved && last) change(E, c=>{ const x = c.added.find(x=>'n'+x.id===o.oid); if(x) Object.assign(x, last); if(!x.flipH) delete x.flipH; if(!x.flipV) delete x.flipV; });
      };
      hEl.addEventListener('pointermove', mv); hEl.addEventListener('pointerup', up); hEl.addEventListener('pointercancel', up);
    });
    d.appendChild(hEl);
  });
}

/* ---------- accents and symbols (text boxes, My notes, Game of Chance questions) ---------- */
const SYMBOLS = [
  ['Français', ['é','è','ê','ë','à','â','ç','î','ï','ô','û','ù','ü','œ','æ','«','»']],
  ['Español', ['á','é','í','ó','ú','ñ','ü','¿','¡']],
  ['Other', ['€','£','–','…','‘','’','“','”','°','×']],
];
const upper = ch => ({ '«':'«', '»':'»', '¿':'¿', '¡':'¡' }[ch] || ch.toUpperCase());
let symCaps = false;
// insert(text) is called for each tap; the palette stays open until tapped outside (or ×).
function symbolPalette(anchor, insert){
  const had = $('.sym-pop'); closeMenus(); if(had && had._anchor===anchor) return;
  const m = el('div', 'menu sym-pop'); m._anchor = anchor;
  const paint = ()=>{
    m.innerHTML = `<div class="sym-head"><button class="sym-caps${symCaps ? ' on' : ''}" data-caps title="Capitals">⇧ ${symCaps ? 'ABC' : 'abc'}</button><button class="sym-x" data-close title="Close" aria-label="Close">${icon('x')}</button></div>`
      + SYMBOLS.map(([name, chars])=>`<div class="sym-lab">${name}</div><div class="sym-row">${chars.map(c=>`<button data-ch="${esc(c)}">${esc(symCaps && /\p{Ll}/u.test(c) ? upper(c) : c)}</button>`).join('')}</div>`).join('');
  };
  paint();
  // Keep the cursor where it is in the text being typed.
  for(const ev of ['pointerdown','mousedown']) m.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); });
  m.onclick = e=>{
    e.stopPropagation();
    const b = e.target.closest('button'); if(!b) return;
    if(b.dataset.close!=null){ m.remove(); return; }
    if(b.dataset.caps!=null){ symCaps = !symCaps; paint(); return; }
    if(b.dataset.ch) insert(b.textContent);
  };
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (r.bottom + 6 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 6) : r.bottom + 6) + 'px';
}
function insertIntoField(f, txt){
  if(!f) return;
  f.focus();
  const s = f.selectionStart!=null ? f.selectionStart : f.value.length, e = f.selectionEnd!=null ? f.selectionEnd : s;
  f.setRangeText(txt, s, e, 'end');
  f.dispatchEvent(new Event('input', { bubbles:true }));
}

/* ---------- import slides from another PowerPoint ---------- */
// Imported decks use Arial: every text run, the theme's heading and body fonts, the default text style and charts
// (23 Oct 2026). The copy kept in Lessons is changed; the original file is not. Bullet and symbol fonts stay,
// since Wingdings and similar carry the bullet glyphs.
const IMPORT_FONT = '<a:latin typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/>';
async function arialDeck(file){
  if(typeof JSZip==='undefined') return file;
  try{
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const part = /^(ppt\/presentation|ppt\/(slides|slideLayouts|slideMasters|notesSlides|notesMasters|handoutMasters|theme|charts)\/[^/]+)\.xml$/;
    let changed = 0;
    for(const name of Object.keys(zip.files)){
      if(!part.test(name)) continue;
      const xml = await zip.file(name).async('string');
      const out = xml.replace(/<a:latin\b[^>]*?(?:\/>|>\s*<\/a:latin>)/g, ()=>{ changed++; return IMPORT_FONT; });
      if(out!==xml) zip.file(name, out);
    }
    if(!changed) return file;
    return new File([await zip.generateAsync({ type:'blob', compression:'DEFLATE' })], file.name, { type:file.type });
  }catch(e){ console.error(e); toast("Couldn't set the fonts to Arial. Imported as it is.", true); return file; }
}
function importSlides(E, file){
  if(E.mode!=='pptx') return;
  if(file) return importDialog(E, file);
  const inp = el('input'); inp.type = 'file'; inp.accept = '.pptx';
  inp.onchange = ()=>{ const f = inp.files && inp.files[0]; if(f) importDialog(E, f); };
  inp.click();
}
async function importDialog(E, file){
  if(!/\.pptx$/i.test(file.name)){ toast(/\.ppt$/i.test(file.name) ? "Old .ppt files can't be read. Open it in PowerPoint and Save As .pptx." : 'Choose a .pptx file.', true); return; }
  showLoading('Opening ' + file.name + '…');
  let v;
  try{ file = await arialDeck(file); v = await PptxView.load(await file.arrayBuffer()); }
  catch(e){ hideLoading(); toast(`Couldn't open ${file.name}: ${e.message}`, true); return; }
  hideLoading();
  const picked = new Set();
  modal(`<h2>Import slides</h2><p><b>${esc(file.name)}</b> · tap the slides to bring in. They're added after slide ${E.v.pos(E.i) + 1}, fully editable, and their animations become reveals.</p>
    <div class="imp-bar"><button class="btn sm" data-a="all">Select all</button><button class="btn sm" data-a="none">Clear</button></div>
    <div class="imp-grid"></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok" disabled>Import</button></div>`, (m, close)=>{
    m.classList.add('imp-modal');
    const grid = m.querySelector('.imp-grid'), ok = m.querySelector('[data-a=ok]');
    const sync = ()=>{ ok.disabled = !picked.size; ok.textContent = picked.size ? `Import ${picked.size} slide${picked.size>1 ? 's' : ''}` : 'Import'; $$('.imp-cell', grid).forEach(c=>c.classList.toggle('on', picked.has(Number(c.dataset.i)))); };
    const cells = [];
    for(let i=0;i<v.count;i++){
      const c = el('button', 'imp-cell' + (v.isHidden(i) ? ' hid' : '')); c.dataset.i = i;
      c.innerHTML = `<div class="th"></div><span>${i+1}${v.isHidden(i) ? ' · hidden' : ''}</span><span class="tick">${icon('done')}</span>`;
      c.onclick = ()=>{ if(picked.has(i)) picked.delete(i); else picked.add(i); sync(); };
      grid.appendChild(c); cells.push([c.querySelector('.th'), i]);
    }
    // Thumbnails a few at a time so the dialog opens straight away.
    const pump = ()=>{ if(!grid.isConnected) return; for(let n=0; n<3 && cells.length; n++){ const [th, i] = cells.shift(); mountThumb(th, v, i, 180); } if(cells.length) requestAnimationFrame(pump); };
    pump();
    m.querySelector('[data-a=all]').onclick = ()=>{ for(let i=0;i<v.count;i++) picked.add(i); sync(); };
    m.querySelector('[data-a=none]').onclick = ()=>{ picked.clear(); sync(); };
    m.querySelector('[data-a=no]').onclick = close;
    ok.onclick = async ()=>{ const list = [...picked].sort((a,b)=>a-b); close(); await doImport(E, file, v, list); };
    sync();
  });
}
// Keeps a copy of the file in the Lessons folder (shared by every lesson that imports from it).
async function shareFile(file){
  let n = safeName(SHARED_PREFIX + file.name.replace(/^\d{4}-\d{2}-\d{2} \S+ .+? - /, '')), k = 2;
  const dot = n.lastIndexOf('.'), stem = n.slice(0, dot), ext = n.slice(dot);
  while(await store.exists(n)){
    try{ const f = await store.readDeck(LESSONS_DIR + '/' + n); if(f.size===file.size) return LESSONS_DIR + '/' + n; }catch(e){}
    n = `${stem} (${k++})${ext}`;
  }
  return store.writeDeck(n, file);
}
async function doImport(E, file, v, list){
  if(!list.length) return;
  showLoading('Importing…');
  let p;
  try{ p = await shareFile(file); }
  catch(e){ hideLoading(); console.error(e); toast("Couldn't copy the file into the Lessons folder.", true); return; }
  hideLoading();
  deckCache.set(p, Promise.resolve(v));
  E.v.extra.set(p, await loadDeckFile(p, 'pptx', themeKey(E.l))); // v1.91: in the lesson's theme
  const entries = list.map(i=>({ k:newSlideKey(E.l), src:{ f:p, i } }));
  let reveals = 0;
  insertSlides(E, entries);
  // Their animations become reveals, as when a deck is added (part of the same undo step).
  entries.forEach((e, n)=>{ const obj = animHides(v, list[n]); const c = Object.keys(obj).length; if(c){ reveals += c; E.l.hides[E.mode][e.k] = { obj, covers:[] }; } });
  if(reveals){ E.thumbs.clear(); buildStrip(E); showEdit(E); saveSoon(); }
  toast(`${list.length} slide${list.length>1 ? 's' : ''} imported` + (reveals ? ` · ${reveals} animated item${reveals>1 ? 's' : ''} set to reveal` : ''));
}

/* ---------- copy / paste objects, paste from other programs ---------- */
let clipPending = null;
// Copy the selected object. PowerPoint objects are copied as they look (pictures saved to the Lessons folder).
function copyObjects(E, ev){
  if(E.mode!=='pptx') return;
  const id = uid(), mark = `[Slideshow Viewer objects #${id}]`;
  const p = objectItems(E, selOids(E)); if(!p) return;
  if(ev && ev.clipboardData){ ev.clipboardData.setData('text/plain', mark); ev.preventDefault(); }
  else { try{ navigator.clipboard.writeText(mark).catch(()=>{}); }catch(e){} }
  clipPending = p.then(items=>{
    const clip = { kind:'objects', mode:E.mode, lesson:E.l.id, slide:E.i, items, id, t:Date.now() };
    try{ localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); }catch(e){ toast("Couldn't copy: too big to keep.", true); }
  }).catch(e=>{ console.error(e); toast("Couldn't copy that object.", true); }).finally(()=>{ clipPending = null; });
  toast('Copied');
}
// The objects oids as copies that can go on any slide: [{ a, state?, btn? }] (a = an added object; see renderAdded).
// Returns a promise (pictures are saved as files first), or null if there's nothing to copy.
function objectItems(E, oids){
  const st = E.stage, c = cfgOf(E);
  const list = oids.map(id=>(st.objects || []).find(o=>o.oid===id)).filter(o=>o && !o.cell && c.obj[o.oid]!=='del');
  if(!list.length) return null;
  // v1.63: groups copied whole stay groups (it.g: the group, the lead first).
  const ids = new Set(list.map(o=>o.oid)), gs = edGroups(E, c).filter(g=>g.oids.every(id=>ids.has(id)));
  const ordered = [];
  for(const o of list){ if(ordered.includes(o)) continue; const g = gs.find(g=>g.oids.includes(o.oid)); if(g) for(const id of g.oids) ordered.push(list.find(x=>x.oid===id)); else ordered.push(o); }
  list.splice(0, list.length, ...ordered);
  return (async()=>{
    const out = [];
    for(const o of list){
      const a = o.added ? JSON.parse(JSON.stringify(c.added.find(a=>'n'+a.id===o.oid))) : await snapshotObject(E, o);
      const it = { a };
      const g = gs.find(g=>g.oids.includes(o.oid)); if(g) it.g = g.id;
      const state = c.obj[o.oid]; if(state && state!=='del') it.state = state;
      if(c.btn['o'+o.oid]) it.btn = { ...c.btn['o'+o.oid] };
      if(a.table){ const cells = {}; for(const [k, v] of Object.entries(c.obj)) if(k.startsWith(o.oid + '.') && v!=='del') cells[k.slice(o.oid.length)] = v; if(Object.keys(cells).length) it.cells = cells; }
      out.push(it);
    }
    return out;
  })();
}
async function snapshotObject(E, o){
  const e = objEl(E, o.oid);
  const cl = e.cloneNode(true);
  const tx = cl.querySelector(':scope > .pptx-tx');
  let html = null, txCss = null, fit = null;
  if(tx){
    const live = e.querySelector(':scope > .pptx-tx');
    if(live) unfitText(tx); // copy at the real text size
    html = tx.innerHTML; txCss = tx.getAttribute('style'); fit = tx.dataset.autofit || null;
    tx.remove();
  }
  // Pictures: blob URLs only last while the page is open, so save them as files.
  for(const im of cl.querySelectorAll('img, image')){
    const src = im.getAttribute('src') || im.getAttribute('href') || '';
    if(!src.startsWith('blob:')) continue;
    try{ const blob = await (await fetch(src)).blob(); const p = await savePicture(blob.type ? blob : new Blob([blob], { type:'image/png' })); im.removeAttribute('src'); im.removeAttribute('href'); im.setAttribute('data-media', p); }catch(err){ im.remove(); }
  }
  cl.querySelectorAll('[data-video]').forEach(v=>v.removeAttribute('data-video'));
  const rot = /rotate\((-?[\d.]+)deg\)/.exec(e.style.transform || '');
  const a = { id:uid(), x:o.x, y:o.y, w:o.w, h:o.h, art:cl.innerHTML };
  if(rot) a.rot = Number(rot[1]);
  if(html!=null){ a.html = html; a.tx = { css:txCss }; if(fit) a.tx.fit = fit; }
  if(cl.classList.contains('pptx-pic')) a.artPic = true;
  return a;
}
async function pasteObjects(E, clip){
  if(clipPending) await clipPending;
  clip = readClip() || clip;
  if(!clip || clip.kind!=='objects') return;
  if(E.mode!=='pptx'){ toast('Objects can only be pasted into the PowerPoint version.', true); return; }
  if(E.editing) finishTextEdit(E);
  await loadMedia(clip.items.flatMap(it=>[it.a.pic, ...[...String(it.a.art || '').matchAll(/data-media="([^"]+)"/g)].map(m=>m[1])]).filter(Boolean));
  const same = clip.lesson===E.l.id && skey(clip.slide)===E.i;
  placeItems(E, clip.items, same ? { dx:16, dy:16 } : null);
  // Paste again = another step down and to the right.
  if(same) try{ const cc = JSON.parse(localStorage.getItem(CLIP_KEY)); cc.items.forEach(it=>{ it.a.x += 16; it.a.y += 16; }); localStorage.setItem(CLIP_KEY, JSON.stringify(cc)); }catch(e){}
}
// Put copied objects (or an Object Gallery template) on the current slide, selected. at: { dx, dy } shift.
function placeItems(E, items, at){
  const made = [], newGroups = new Map();
  change(E, c=>{
    for(const it of items){
      const a = JSON.parse(JSON.stringify(it.a)); a.id = uid();
      if(at){ a.x = Math.round((a.x + at.dx)*10)/10; a.y = Math.round((a.y + at.dy)*10)/10; }
      c.added.push(a); const oid = 'n' + a.id; made.push(oid);
      if(it.state) c.obj[oid] = it.state;
      if(it.btn) c.btn['o' + oid] = { ...it.btn };
      if(it.cells) for(const [k, v] of Object.entries(it.cells)) c.obj[oid + k] = v;
      if(it.g){ const g = newGroups.get(it.g) || []; g.push(oid); newGroups.set(it.g, g); } // v1.63: lead first (objectItems' order)
    }
    for(const oids of newGroups.values()) if(oids.length > 1) c.groups.push({ id:uid(), oids });
    E.cell = null; E.selCover = null;
    if(made.length > 1){ E.sel = null; E.selO = new Set(made); E.selOi = E.i; } else { E.sel = made[0]; E.selO.clear(); }
  });
  return made;
}
// v1.52.1: straight onto the slide, a little down and to the right; the clipboard (Ctrl+C) is left alone.
// The copy is selected, so Ctrl+D again steps on from it.
function dupObject(E){
  if(E.mode!=='pptx') return;
  const p = objectItems(E, selOids(E)); if(!p) return;
  const k = E.i;
  p.then(async items=>{
    if(view.E!==E || E.i!==k) return; // moved to another slide (or left the editor) while pictures were saved
    await loadMedia(itemsMedia(items));
    if(E.editing) finishTextEdit(E);
    placeItems(E, items, { dx:16, dy:16 });
  }).catch(e=>{ console.error(e); toast("Couldn't duplicate that object.", true); });
}
function htmlText(html){
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));
  d.querySelectorAll('p, div, li, tr, h1, h2, h3, h4').forEach(b=>b.append('\n'));
  return (d.body.textContent || '').replace(/ /g, ' ');
}
// A paste in the editor (not while typing in a text box). where: 'slides' = into the strip.
async function pasteData(E, dt){
  const text = dt.getData('text/plain') || '';
  const id = clipMarker(text);
  if(id){
    if(clipPending) await clipPending;
    const c = readClip();
    if(c && c.id===id){ if(c.kind==='slides') return pasteSlides(E, c); return pasteObjects(E, c); }
  }
  const files = [...(dt.files || [])];
  const deck = files.find(f=>/\.pptx?$/i.test(f.name));
  if(deck) return importSlides(E, deck);
  const img = files.find(f=>/^image\//.test(f.type)) || [...(dt.items || [])].filter(i=>i.kind==='file' && /^image\//.test(i.type)).map(i=>i.getAsFile()).find(Boolean);
  const plain = text.trim() ? text : (dt.getData('text/html') ? htmlText(dt.getData('text/html')) : '');
  // v1.73: a picture pasted with a picture frame selected goes into the frame.
  if(img && E.focus!=='slides' && E.sel && !isMulti(E) && frameOf(E, E.sel)) return fillFrame(E, E.sel, img);
  if(E.focus==='slides'){ if(img) return addPicture(E, img, true); if(plain.trim()){ await blankWithText(E, plain); return; } }
  if(plain.trim() && !(img && !text.trim())) return addPastedText(E, plain);
  if(img) return addPicture(E, img, false);
  toast('Nothing to paste.');
}
async function blankWithText(E, text){
  if(E.mode!=='pptx') return;
  blankSlide(E);
  addPastedText(E, text);
}
// "Paste" from a menu (no keyboard): read the system clipboard, if Edge allows it.
async function pasteFromSystem(E, where){
  if(where==='slides') E.focus = 'slides';
  let items;
  try{ items = await navigator.clipboard.read(); }
  catch(e){ toast('Press Ctrl+V to paste (Edge didn’t allow reading the clipboard from a button).', true); return; }
  const dt = new DataTransfer();
  for(const it of items){
    for(const t of it.types){
      const b = await it.getType(t);
      if(t.startsWith('image/')) dt.items.add(new File([b], 'pasted.' + (IMG_EXT[t] || 'png'), { type:t }));
      else if(t==='text/plain' || t==='text/html') dt.items.add(await b.text(), t);
    }
  }
  pasteData(E, dt);
}
document.addEventListener('copy', e=>{
  if(view.name!=='edit') return;
  const E = view.E;
  if(E.editing || E.tab==='sb' || (e.target.closest && e.target.closest('input,textarea'))) return;
  if(E.focus==='slides') copySlides(E, e);
  else if(E.sel || isMulti(E)) copyObjects(E, e);
});
document.addEventListener('paste', e=>{
  if(view.name!=='edit') return;
  const E = view.E;
  if(E.editing || E.tab==='sb' || (e.target.closest && e.target.closest('input,textarea,[contenteditable=true]'))) return;
  if($('.modal-back')) return;
  e.preventDefault();
  pasteData(E, e.clipboardData);
});
// Drop a .pptx onto the editor to import slides from it, or a picture to add it.
document.addEventListener('dragover', e=>{ if(view.name==='edit' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('drop', e=>{
  if(view.name!=='edit') return;
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if(!f) return;
  e.preventDefault();
  const E = view.E, onStrip = !!(e.target.closest && e.target.closest('.ed-thumbs'));
  if(/\.pptx?$/i.test(f.name)) importSlides(E, f);
  else if(/^image\//.test(f.type)){ const fr = onStrip ? null : frameAt(E, e.clientX, e.clientY); if(fr) fillFrame(E, fr, f); else addPicture(E, f, onStrip); } // v1.73: onto a picture frame fills it
  else toast('Drop a .pptx (to import slides) or a picture.', true);
});

/* ---------- Slide Gallery and Object Gallery (v1.33) ----------
   data.templates = { slides:[…], objects:[…], tags:[custom tags] }, newest first by t.
   slide:  { id, name, tags, t, from:{ f, i } | { blank:true, look }, dx, cfg, note? }
           f / look: a 'Shared - …' copy of the deck in Lessons; cfg: the slide's editor settings (hides[mode][k]).
   object: { id, name, tags, t, items:[{ a, state?, btn?, cells? }], bb:{ x,y,w,h } }
           a: an added object (renderAdded; copies of PowerPoint objects as 'copy' with pictures as 'Media - …' files).
   Saving copies everything a template needs, so it works in any lesson and nothing points back at the lesson
   it came from. */
const TAGS = ['IN&ON', 'Independent Study', 'Plenary', 'Game'];
function normTemplates(t){
  t = t && typeof t==='object' ? t : {};
  const ok = x=>x && typeof x.id==='string' && Array.isArray(x.tags);
  const fix = x=>{ x.name = typeof x.name==='string' ? x.name : ''; x.tags = x.tags.filter(g=>typeof g==='string' && g.trim()); x.t = Number(x.t) || 0; return x; };
  return {
    slides:(Array.isArray(t.slides) ? t.slides : []).filter(x=>ok(x) && x.from && (x.from.f || x.from.blank)).map(fix),
    objects:(Array.isArray(t.objects) ? t.objects : []).filter(x=>ok(x) && Array.isArray(x.items) && x.items.length && x.bb).map(fix),
    tags:[...new Set((Array.isArray(t.tags) ? t.tags : []).filter(g=>typeof g==='string' && g.trim() && !TAGS.includes(g)))],
    gone:(Array.isArray(t.gone) ? t.gone : []).filter(g=>typeof g==='string'), // v1.92: built-in templates (key) you deleted, so they aren't added back
  };
}
/* v1.92: the built-in IN&ON templates (inon-templates.js) are added to the Slide Gallery when the data loads. One you have edited
   (x.edited), deleted (templates.gone) or that is already at this version is left alone; an older one is replaced.
   The first, plain copies (v1.91 data: no key) are removed. */
function seedInon(T){
  const list = window.INON_TEMPLATES; if(!Array.isArray(list)) return;
  const old = new Set(window.INON_OLD_NAMES || []), now = Date.now();
  T.slides = T.slides.filter(x=>!(old.has(x.name) && !x.key));
  list.forEach((s, i)=>{
    if(T.gone.includes(s.key)) return;
    const have = T.slides.find(x=>x.key===s.key);
    if(have && (have.edited || (have.ver || 0) >= s.ver)) return;
    const copy = JSON.parse(JSON.stringify(s));
    if(have){ copy.id = have.id; copy.t = have.t; T.slides.splice(T.slides.indexOf(have), 1); }
    else { copy.id = 't' + uid(); copy.t = now - i*1000; }
    T.slides.push(copy);
  });
}
function itemsMedia(items){
  const out = [];
  for(const it of items || []){ const a = (it && it.a) || {}; if(a.pic) out.push(a.pic); if(a.art) for(const m of String(a.art).matchAll(/data-media="([^"]+)"/g)) out.push(m[1]); }
  return out;
}
const cfgMedia = c=>itemsMedia(((c && c.added) || []).map(a=>({ a })));
// Files the Slide / Object Gallery depend on. Unused since Clear previous weeks was retired (v1.74); kept for
// whatever tidy-up replaces it, which must never delete these.
function templateFiles(){
  const out = new Set(), T = data.templates || { slides:[], objects:[] };
  for(const x of T.slides){ if(x.from.f) out.add(x.from.f); if(x.from.look) out.add(x.from.look); for(const p of cfgMedia(x.cfg)) out.add(p); }
  for(const x of T.objects) for(const p of itemsMedia(x.items)) out.add(p);
  return [...out];
}
const allTags = ()=>[...TAGS, ...data.templates.tags];
// First line of text on a slide (for a template's starting name).
function slideTitleText(E, k){
  const th = E.thumbs.get(k) || (k===E.i ? E.stage.slideEl : null) || thumbEl(E.v, k, 140, E.l, E.mode);
  return firstText(th);
}
function firstText(root){
  for(const tx of (root ? root.querySelectorAll('.pptx-tx') : [])){ const t = tx.textContent.replace(/[​\s]+/g, ' ').trim(); if(t) return t.slice(0, 60); }
  return '';
}
// Name and tags (saving, or "Name and tags…" on a saved one). Resolves { name, tags } or null.
function saveDialog(o){
  return new Promise(res=>{
    const sel = new Set(o.tags || []), custom = [];
    const title = o.edit ? 'Name and tags' : o.kind==='slide' ? (o.n > 1 ? `Save ${o.n} slides to the Slide Gallery` : 'Save to the Slide Gallery') : `Save ${o.n > 1 ? o.n + ' objects' : 'to the Object Gallery'}${o.n > 1 ? ' to the Object Gallery' : ''}`;
    const nameHelp = o.kind==='slide' && o.n > 1 && !o.edit ? 'Each slide gets this name and a number. Leave it empty to use each slide’s own title.' : 'So you can find it again (search looks at names and tags).';
    let done = false;
    const close = modal(`<h2>${esc(title)}</h2>
      <div class="row"><div class="grow"><div class="t">Name</div><div class="d">${esc(nameHelp)}</div></div></div>
      <input type="text" class="gal-name" aria-label="Name" maxlength="80" value="${esc(o.name || '')}">
      <div class="row" style="margin-top:14px"><div class="grow"><div class="t">Tags</div><div class="d">Pick at least one. Custom adds a tag of your own.</div></div></div>
      <div class="gal-tagpick"></div>
      <div class="gal-newtag" hidden><input type="text" maxlength="30" aria-label="New tag" placeholder="New tag, e.g. Speaking…"><button class="btn sm primary" data-a="addtag">Add</button></div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${o.edit ? 'Save' : 'Save to gallery'}</button></div>`, (m, close)=>{
      const pick = $('.gal-tagpick', m), nt = $('.gal-newtag', m), ni = $('input', nt), name = $('.gal-name', m);
      const draw = ()=>{
        pick.innerHTML = [...allTags(), ...custom].map(g=>`<button class="gal-chip${sel.has(g) ? ' on' : ''}" data-tag="${esc(g)}">${esc(g)}</button>`).join('')
          + `<button class="gal-chip add" data-a="custom">${icon('plus')}Custom</button>`;
      };
      draw();
      pick.onclick = e=>{
        const b = e.target.closest('button'); if(!b) return;
        if(b.dataset.a==='custom'){ nt.hidden = false; ni.focus(); return; }
        const g = b.dataset.tag; if(sel.has(g)) sel.delete(g); else sel.add(g); draw();
      };
      const addTag = ()=>{
        const g = ni.value.replace(/\s+/g, ' ').trim(); if(!g) return;
        const have = [...allTags(), ...custom].find(x=>x.toLowerCase()===g.toLowerCase());
        if(have) sel.add(have); else { custom.push(g); sel.add(g); }
        ni.value = ''; nt.hidden = true; draw();
      };
      $('[data-a=addtag]', m).onclick = addTag;
      ni.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); addTag(); } };
      const ok = ()=>{
        if(ni.value.trim()) addTag();
        if(!sel.size){ toast('Pick at least one tag', true); return; }
        for(const g of custom) if(sel.has(g) && !allTags().includes(g)) data.templates.tags.push(g);
        done = true; close(); res({ name:name.value.replace(/\s+/g, ' ').trim(), tags:allTags().filter(g=>sel.has(g)) });
      };
      $('[data-a=ok]', m).onclick = ok;
      $('[data-a=no]', m).onclick = ()=>{ done = true; close(); res(null); };
      name.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); ok(); } };
      name.focus(); name.select();
    });
    // Closed by tapping outside.
    const back = $$('.modal-back').pop();
    if(back) new MutationObserver((_, ob)=>{ if(!back.isConnected){ ob.disconnect(); if(!done) res(null); } }).observe(document.body, { childList:true });
  });
}
async function saveSlidesToGallery(E){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx'){ toast('Only PowerPoint slides can go in the Slide Gallery.', true); return; }
  const ks = liveSel(E); if(!ks.length) return;
  const res = await saveDialog({ kind:'slide', n:ks.length, name: ks.length===1 ? slideTitleText(E, ks[0]) : '' }); if(!res) return;
  showLoading('Saving to the Slide Gallery…');
  try{
    const shared = new Map(), share = async p=>{ if(!p) return null; if(!shared.has(p)) shared.set(p, await shareDeck(p)); return shared.get(p); };
    const t = Date.now(), made = [];
    for(const [j, k] of ks.entries()){
      const o = E.v.origin(k); if(!o) continue;
      const from = o.blank ? Object.assign({ blank:true, look:await share(o.look) }, o.act ? { act:o.act } : {}) : { f:await share(o.f), i:o.i };
      const cfg = E.l.hides[E.mode][k] ? JSON.parse(JSON.stringify(E.l.hides[E.mode][k])) : null;
      if(cfg) emptyFrames((cfg.added || []).map(a=>({ a }))); // v1.73: templates keep their frames, empty
      const name = ks.length===1 ? res.name : res.name ? `${res.name} (${j + 1})` : slideTitleText(E, k);
      const x = { id:'t' + uid(), name, tags:res.tags.slice(), t:t - j, from, dx:E.v.dx(k) || 0, cfg };
      const note = myNote(E.l, E.mode, k); if(note) x.note = note;
      made.push(x);
    }
    data.templates.slides.unshift(...made);
    await saveNow();
    hideLoading();
    toast(made.length > 1 ? `${made.length} slides saved to the Slide Gallery` : 'Saved to the Slide Gallery');
    if(E.gal){ E.gal.kind = 'slides'; renderGallery(E); }
  }catch(err){ hideLoading(); console.error(err); toast("Couldn't save to the gallery: " + err.message, true); }
}
async function saveObjectsToGallery(E){
  if(E.editing) finishTextEdit(E);
  if(E.mode!=='pptx') return;
  const oids = selOids(E), list = oids.map(id=>(E.stage.objects || []).find(o=>o.oid===id)).filter(Boolean);
  if(!list.length) return;
  if(list.some(o=>o.kind==='tool')){ toast("Tool icons stay in this lesson, so they can't go in the Object Gallery.", true); return; } // v1.68
  let name0 = ''; for(const o of list){ name0 = firstText(objEl(E, o.oid)); if(name0) break; }
  if(!name0) name0 = list.length > 1 ? '' : selName(E, list[0]);
  const res = await saveDialog({ kind:'object', n:list.length, name:name0 }); if(!res) return;
  showLoading('Saving to the Object Gallery…');
  try{
    const p = objectItems(E, oids); if(!p) throw new Error('nothing to save');
    const items = await p;
    emptyFrames(items); // v1.73
    const bb = bounds(list), r1 = v=>Math.round(v*10)/10;
    data.templates.objects.unshift({ id:'t' + uid(), name:res.name, tags:res.tags, t:Date.now(), items, bb:{ x:r1(bb.x), y:r1(bb.y), w:r1(bb.w), h:r1(bb.h) } });
    await saveNow();
    hideLoading();
    toast('Saved to the Object Gallery');
    if(E.gal){ E.gal.kind = 'objects'; renderGallery(E); }
  }catch(err){ hideLoading(); console.error(err); toast("Couldn't save to the gallery: " + err.message, true); }
}
/* ---------- fill-in templates, answer slides, year colours and the template editor (v1.92) ----------
   x.fill (see inon-fill.js): adding the slide asks for the questions and answers first, then fills the slide's { } slots and
   adds a matching answer slide after it. x.themed: its colours become the lesson's year-group colours. */
const slideFrom = x=>x.from.blank ? Object.assign({ blank:true, look:x.from.look }, x.from.act ? { act:x.from.act } : {}) : { f:x.from.f, i:x.from.i };
// The slide's cfg for a gallery card: slots filled with example text, in this lesson's colours.
function galCfg(E, x){
  let c = x.cfg;
  if(x.fill && window.INON) c = INON.prep(x, INON.sample(x), { lang:E.l.lang }).make(false);
  if(x.themed && window.INON) c = INON.theme(c, themeGrade(E));
  return c;
}
/* ---------- Retrieval grid: three blocks of phrases from Sentence Builders (v1.106) ----------
   Block 1 (last lesson): the builder this lesson used last (l.sbLast), else one from its year and half-term.
   Block 2 (last topic): a builder from the previous half-term (Autumn 1 looks back to last year's Summer 2; an empty term is skipped).
   Block 3 (last year): one of the previous year's builders. Builders are matched on the lesson's language; each block takes 3 items. */
const SB_TERMS = ['1 - Autumn 1', '2 - Autumn 2', '3 - Spring 1', '4 - Spring 2', '5 - Summer 1', '6 - Summer 2'];
const termIdxOf = iso=>{ const d = iso ? new Date(iso + 'T12:00:00') : new Date(); return { 9:0, 10:0, 11:1, 12:1, 1:2, 2:2, 3:3, 4:4, 5:4, 6:5, 7:5, 8:0 }[d.getMonth() + 1]; };
const rndPick = (a, n)=>a.map(v=>[Math.random(), v]).sort((p, q)=>p[0] - q[0]).slice(0, n).map(p=>p[1]);
const sbTitle = b=>(b.doc && (b.doc.title || (b.doc.q && (b.doc.q.en || b.doc.q.tl)))) || (b.loc && b.loc.name) || 'Sentence Builder';
const sbWhere = b=>`Year ${b.loc.year}, ${String(b.loc.term || '').replace(/^\d - /, '')}`;
async function retrievalPools(E){
  const K = window.SBCore, list = await SVSentence.list();
  const lang = (K && K.langOf ? K.langOf(E.l.label) : '') || E.l.lang || 'fr';
  const ok = list.filter(b=>b.doc.lang===lang && b.loc && b.loc.year && b.loc.term && INON.builderItems(b.doc).length);
  return { ok, year:yearOf(E.l.label) || null, ti:termIdxOf(E.l.date), at:(y, t)=>ok.filter(b=>b.loc.year===y && b.loc.term===SB_TERMS[t]) };
}
// Block k's builder and three of its items: { b, items } or null when there is nothing to draw from. avoid: builders already used by other blocks.
function rollSource(E, P, k, avoid, usedTl){
  let pool = [];
  if(k===0){
    const last = E.l.sbLast, lb = last && P.ok.find(b=>b.loc.year===last.year && b.loc.term===last.term && b.loc.name===last.name);
    pool = lb ? [lb] : [];
    for(let t = P.ti; t >= 0 && !pool.length && P.year; t--) pool = P.at(P.year, t); // this half-term, then back through this year
  } else if(k===1){
    for(let s = 1; s <= 6 && !pool.length && P.year; s++){ let t = P.ti - s, y = P.year; if(t < 0){ t += 6; y -= 1; } pool = P.at(y, t); }
  } else if(P.year){
    pool = P.ok.filter(b=>b.loc.year===P.year - 1);
  }
  const fresh = pool.filter(b=>!avoid.includes(b)), b = rndPick(fresh.length ? fresh : pool, 1)[0];
  if(!b) return null;
  const all = INON.builderItems(b.doc), unseen = all.filter(it=>!(usedTl && usedTl.has(it.tl))); // keep clear of phrases the other blocks already have
  return { b, items:rndPick(unseen.length >= 3 ? unseen : all, 3) };
}
const fillMemo = new Map(); // template id -> { rows, answer }: what was typed last time (this session)
// The form for a fill-in template: one row per item, a live preview of the slide (and its answer slide), and Sentence Builder items.
// Resolves { rows, answer } or null.
function fillDialog(E, x){
  return new Promise(res=>{
    const f = x.fill, F = INON.formats[f.fmt], heads = INON.cols(x).map(h=>E.l.lang==='es' ? h.replace('French', 'Spanish') : h), max = f.fmt==='topic' ? 1 : (f.max || 10), nc = heads.length, hasAns = f.answer!==false;
    const prev = fillMemo.get(x.id) || { rows:[], answer:true };
    const blank = ()=>Array.from({ length:nc }, ()=>'');
    let grid = Array.from({ length:max }, (_, i)=>(prev.rows[i] || blank()).concat(blank()).slice(0, nc));
    let done = false, tab = 'q', flip = !!prev.flip; // flip (Word bank): pupils see the English and translate into the target language
    const lower = x.name.replace(/^IN&ON - /, '');
    const close = modal(`<h2>${esc(lower)}</h2>
      <p class="fill-label">${esc(f.label || '')}</p>
      <div class="fill-body">
        <div class="fill-left">
          <div class="fill-tools">
            ${f.auto && window.SVSentence ? `<button class="btn sm primary" data-a="auto" title="Last lesson from this lesson's Sentence Builder, last topic from last half-term's, last year from one of last year's">${icon('brick-wall')}Fill from Sentence Builders</button>` : ''}
            ${INON.canBuilder(x) && !f.auto && window.SVSentence ? `<button class="btn sm" data-a="sb" title="Choose items from a Sentence Builder">${icon('brick-wall')}Sentence Builder…</button>` : ''}
            ${f.dir ? `<label class="fill-dir">Pupils translate <select data-a="dir"><option value="">${E.l.lang==='es' ? 'Spanish' : 'French'} → English</option><option value="1">English → ${E.l.lang==='es' ? 'Spanish' : 'French'}</option></select></label>` : ''}
            ${f.fmt==='topic' ? '' : '<button class="btn sm" data-a="list" title="Paste a list: one per line, or copied from a spreadsheet">Paste a list…</button><button class="btn sm" data-a="clear">Clear</button>'}
          </div>
          <div class="fill-grid" style="--nc:${nc}"></div>
          <div class="fill-count" aria-live="polite"></div>
        </div>
        <div class="fill-right">
          <div class="fill-tabs"><button data-t="q" class="on">Slide</button>${hasAns ? '<button data-t="a">Answer slide</button>' : ''}</div>
          <div class="fill-prev"><div class="fill-scale"></div></div>
        </div>
      </div>
      ${hasAns ? `<label class="fill-ans"><input type="checkbox"${prev.answer ? ' checked' : ''}> Also add the answer slide after it</label>` : ''}
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Add slide</button></div>`, (m, closeM)=>{
      m.classList.add('fill-modal');
      const gridEl = $('.fill-grid', m), cnt = $('.fill-count', m), cb = $('.fill-ans input', m), ok = $('[data-a=ok]', m), scale = $('.fill-scale', m), pv = $('.fill-prev', m);
      gridEl.innerHTML = '<div></div>' + heads.map(h=>`<div class="fg-h">${esc(h)}</div>`).join('') + grid.map((r, i)=>
        (f.groupSize && i % f.groupSize===0 ? `<div class="fg-g"><span>${esc((f.groups || [])[i / f.groupSize] || '')}</span><span class="fg-src" data-b="${i / f.groupSize}"></span>${f.auto ? `<button class="btn sm" data-a="reroll" data-b="${i / f.groupSize}" title="Pick different words from the same Sentence Builder">↻ New words</button><button class="btn sm" data-a="blockpick" data-b="${i / f.groupSize}" title="Choose these from a Sentence Builder yourself">Choose…</button>` : ''}</div>` : '') + // a label above each block of rows (Translation grid: last lesson / topic / year)
        `<div class="fg-n">${i + 1}</div>` + r.map((v, c)=>`<input type="text" data-r="${i}" data-c="${c}" value="${esc(v)}" aria-label="${esc(heads[c])} ${i + 1}" spellcheck="false">`).join('')).join('');
      if(f.fmt==='topic') gridEl.classList.add('one');
      const inputs = ()=>$$('input[data-r]', gridEl);
      const syncRows = ()=>{ for(const inp of inputs()) grid[+inp.dataset.r][+inp.dataset.c] = inp.value; };
      const paintGrid = ()=>{ for(const inp of inputs()) inp.value = grid[+inp.dataset.r][+inp.dataset.c] || ''; };
      let t = 0;
      const upd = ()=>{
        clearTimeout(t);
        const P = INON.parseRows(f.fmt, grid, max);
        const bits = [f.fmt==='topic' ? (P.items.length ? 'topic ready' : 'type a topic') : `${P.items.length} of ${max} filled`];
        if(P.over) bits.push(`${P.over} extra won't fit`);
        if(P.extraCat) bits.push(`${P.extraCat} word${P.extraCat > 1 ? 's are' : ' is'} in a 4th category and left out`);
        if(P.bad && f.fmt!=='list') bits.push(`${P.bad} ${P.bad > 1 ? 'rows need' : 'row needs'} an answer`);
        if(f.fmt==='cats' && P.cats.length) bits.push(`categories: ${P.cats.join(', ')}`);
        cnt.textContent = bits.join(' · ');
        cnt.classList.toggle('warn', !!(P.over || P.extraCat || (P.bad && f.fmt!=='list')));
        ok.textContent = cb && cb.checked ? 'Add slide and answers' : 'Add slide';
        t = setTimeout(paintPrev, 120);
      };
      // The preview: this slide with the typed rows (or the template's example text if nothing is typed yet), in this lesson's colours.
      const paintPrev = ()=>{
        if(!scale.isConnected) return;
        const typed = INON.parseRows(f.fmt, grid, max).items.length > 0;
        const { make } = INON.prep(x, typed ? grid : INON.sample(x), { lang:E.l.lang, flip });
        let cfg = INON.theme(make(tab==='a'), themeGrade(E));
        scale.innerHTML = '';
        scale.style.background = cfg.bg || themeGrade(E).l;
        for(const a of cfg.added || []) scale.appendChild(PPTX.renderAdded(a, { media:mediaUrl }, { minor:'Arial' }));
        PPTX.fitText(scale);
        pv.classList.toggle('sample', !typed);
      };
      const fit = ()=>{ const k = pv.clientWidth / 960; scale.style.transform = `scale(${k})`; pv.style.height = Math.round(540*k) + 'px'; };
      new ResizeObserver(fit).observe(pv); fit();
      // Retrieval grid: rows 3k to 3k + 2 are block k (last lesson / last topic / last year).
      const per = f.groupSize || 3, srcB = [null, null, null];
      const setBlock = (k, R)=>{ for(let j = 0; j < per; j++) grid[k*per + j] = (R[j] || blank()).concat(blank()).slice(0, nc); paintGrid(); upd(); };
      const setSrc = (k, b, note)=>{ srcB[k] = b || null; const s = $(`.fg-src[data-b="${k}"]`, m); if(s) s.textContent = b ? `${sbTitle(b)} · ${sbWhere(b)}` : (note || ''); };
      let pools = null;
      const getPools = async ()=>{ if(!pools) pools = await retrievalPools(E); return pools; };
      const roll = async k=>{
        const P = await getPools(), used = new Set(grid.filter((r, i)=>Math.floor(i / per)!==k).map(r=>r[0]).filter(Boolean)), r = rollSource(E, P, k, srcB.filter((b, i)=>b && i!==k), used);
        if(!r){ setSrc(k, null, k===2 && (P.year || 0) <= 7 ? 'no earlier year' : 'no Sentence Builders found for this'); return false; }
        setBlock(k, r.items.map(it=>[it.tl, it.en])); setSrc(k, r.b); return true;
      };
      const rollBlock = async k=>{ try{ await roll(k); }catch(err){ toast("Couldn't read the Sentence Builders: " + err.message, true); } };
      const autoFill = async btn=>{
        const was = btn.textContent; btn.disabled = true; btn.textContent = 'Looking…';
        try{ pools = null; let n = 0; for(const k of [0, 1, 2]) if(await roll(k)) n++; toast(n===3 ? 'Filled from your Sentence Builders: use New words or Choose… to change a block' : `Filled ${n} of 3 blocks: no Sentence Builders were found for the rest`, n < 3); }
        catch(err){ toast("Couldn't read the Sentence Builders: " + err.message, true); }
        btn.disabled = false; btn.textContent = was;
      };
      const dirSel = $('[data-a=dir]', m);
      if(dirSel){ dirSel.value = flip ? '1' : ''; dirSel.onchange = ()=>{ flip = !!dirSel.value; paintPrev(); }; }
      gridEl.addEventListener('input', ()=>{ syncRows(); upd(); });
      gridEl.addEventListener('keydown', e=>{
        if(e.key!=='Enter' || e.ctrlKey || e.metaKey) return;
        e.preventDefault(); const r = +e.target.dataset.r, c = +e.target.dataset.c;
        const nx = $(`input[data-r="${r + 1}"][data-c="${c}"]`, gridEl) || $(`input[data-r="0"][data-c="${(c + 1) % nc}"]`, gridEl); if(nx){ nx.focus(); nx.select(); }
      });
      // Pasting several lines (or cells from a spreadsheet) fills down from the box you pasted into.
      gridEl.addEventListener('paste', e=>{
        const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
        if(!/[\n\t]/.test(text.trim())) return;
        e.preventDefault(); syncRows();
        const r0 = +e.target.dataset.r, c0 = +e.target.dataset.c, R = INON.rows(f.fmt, text);
        R.forEach((row, i)=>{ if(r0 + i < max) row.forEach((v, j)=>{ if(c0 + j < nc) grid[r0 + i][c0 + j] = v; }); });
        paintGrid(); upd();
      });
      m.addEventListener('click', e=>{
        const b = e.target.closest('[data-a],[data-t]'); if(!b) return;
        if(b.dataset.t){ tab = b.dataset.t; $$('.fill-tabs button', m).forEach(n=>n.classList.toggle('on', n===b)); paintPrev(); return; }
        const a = b.dataset.a;
        if(a==='clear'){ grid = Array.from({ length:max }, blank); paintGrid(); upd(); }
        else if(a==='list') pasteList(f, max, nc, blank, R=>{ grid = Array.from({ length:max }, (_, i)=>(R[i] || blank()).concat(blank()).slice(0, nc)); paintGrid(); upd(); });
        else if(a==='auto') autoFill(b);
        else if(a==='reroll') rollBlock(+b.dataset.b);
        else if(a==='blockpick') pickFromBuilder(E, x, per, R=>setBlock(+b.dataset.b, R), bt=>setSrc(+b.dataset.b, bt));
        else if(a==='sb') pickFromBuilder(E, x, max, R=>{ grid = Array.from({ length:max }, (_, i)=>(R[i] || blank()).concat(blank()).slice(0, nc)); paintGrid(); upd(); });
      });
      const go = ()=>{ syncRows(); done = true; fillMemo.set(x.id, { rows:grid.map(r=>r.slice()), answer:!cb || cb.checked, flip }); closeM(); res({ rows:grid.map(r=>r.slice()), answer:!!cb && cb.checked, flip }); };
      ok.onclick = go;
      $('[data-a=no]', m).onclick = ()=>{ done = true; closeM(); res(null); };
      if(cb) cb.onchange = upd;
      m.addEventListener('keydown', e=>{ if(e.key==='Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); go(); } });
      upd(); paintPrev();
      setTimeout(()=>{ const first = inputs()[0]; if(first){ first.focus(); first.select(); } }, 0);
    });
    const back = $$('.modal-back').pop();
    if(back) new MutationObserver((_, ob)=>{ if(!back.isConnected){ ob.disconnect(); if(!done) res(null); } }).observe(document.body, { childList:true }); // closed by tapping outside
  });
}
// "Paste a list…": a plain text box for lines typed as `question = answer` (or copied from a spreadsheet).
function pasteList(f, max, nc, blank, then){
  const F = INON.formats[f.fmt];
  modal(`<h2>Paste a list</h2><p class="fill-label">One per line: <b>${esc(F.help)}</b>. Lines copied from a spreadsheet work too.</p>
    <textarea class="fill-ta" rows="10" spellcheck="false" aria-label="List" placeholder="${esc(F.example)}"></textarea>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Use this list</button></div>`, (m, close)=>{
    const ta = $('.fill-ta', m);
    $('[data-a=no]', m).onclick = close;
    $('[data-a=ok]', m).onclick = ()=>{ const R = INON.rows(f.fmt, ta.value); close(); then(R.slice(0, max)); };
    setTimeout(()=>ta.focus(), 0);
  });
}
// Choose a Sentence Builder, then (if it has several columns) a column, then which of its items to use. Calls then(rows) with the form rows.
function pickFromBuilder(E, x, max, then, onBuilder){
  const K = window.SBCore;
  SVSentence.choose({ year:yearOf(E.l.label) || undefined, lang:K && K.langOf ? K.langOf(E.l.label) : '', onPick:b=>{
    const cols = INON.builderColumns(b.doc);
    const items = cols.flatMap((c, ci)=>c.items.map(it=>Object.assign({ ci }, it)));
    if(!items.length){ toast('That Sentence Builder has no items with both languages.', true); return; }
    const tlFirst = x.fill.dir || x.fill.src!=='en', many = cols.filter(c=>c.items.length).length > 1;
    const first = x.fill.column && many ? String(cols.findIndex(c=>c.items.length)) : ''; // the Word bank starts on the builder's first column
    modal(`<h2>${esc(b.doc && b.doc.title ? b.doc.title : 'Sentence Builder')}</h2>
      <p class="fill-label">Tick the items to use (up to ${max}).${x.fill.fmt==='options' ? ' The other ticked items become the wrong answers.' : ''}</p>
      <div class="fill-tools">${many ? `<label class="fill-dir">Column <select class="fill-col"><option value="">All columns (${items.length})</option>${cols.map((c, i)=>c.items.length ? `<option value="${i}">${esc(c.title)} (${c.items.length})</option>` : '').join('')}</select></label>` : ''}
        <button class="btn sm" data-a="all">All</button><button class="btn sm" data-a="none">None</button>
        <button class="btn sm" data-a="rand">Pick ${Math.min(max, items.length)} at random</button><span class="fill-sel"></span></div>
      <div class="fill-items">${items.map((it, i)=>`<label data-col="${it.ci}"><input type="checkbox" data-i="${i}"><span>${esc(tlFirst ? it.tl : it.en)}</span><em>${esc(tlFirst ? it.en : it.tl)}</em></label>`).join('')}</div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Use these</button></div>`, (m, close)=>{
      const labels = $$('.fill-items label', m), boxes = $$('input[data-i]', m), sel = $('.fill-sel', m), colSel = $('.fill-col', m);
      const shown = ()=>labels.filter(l=>!l.hidden).map(l=>$('input', l));
      const count = ()=>{ const n = boxes.filter(b=>b.checked).length; sel.textContent = `${n} ticked` + (n > max ? ` · only the first ${max} are used` : ''); sel.classList.toggle('warn', n > max); };
      const filter = ()=>{ for(const l of labels){ l.hidden = !!colSel && colSel.value!=='' && l.dataset.col!==colSel.value; if(l.hidden) $('input', l).checked = false; } count(); };
      boxes.forEach(b=>b.onchange = count);
      if(colSel){ colSel.value = first; colSel.onchange = filter; filter(); }
      m.addEventListener('click', e=>{
        const a = e.target.closest('[data-a]'); if(!a) return;
        if(a.dataset.a==='all') shown().forEach((b, i)=>b.checked = i < max);
        else if(a.dataset.a==='none') boxes.forEach(b=>b.checked = false);
        else if(a.dataset.a==='rand'){ boxes.forEach(b=>b.checked = false); const v = shown(); v.map((_, i)=>i).sort(()=>Math.random() - 0.5).slice(0, max).forEach(i=>v[i].checked = true); }
        count();
      });
      $('[data-a=no]', m).onclick = close;
      $('[data-a=ok]', m).onclick = ()=>{
        const chosen = boxes.map((b, i)=>b.checked ? items[i] : null).filter(Boolean).slice(0, max);
        if(!chosen.length){ toast('Tick at least one item.', true); return; }
        close(); if(onBuilder) onBuilder(b); then(INON.rowsFromBuilder(x, chosen));
      };
      count();
    });
  }, onCancel:()=>{} });
}async function insertSlideTemplate(E, x, before){
  if(E.mode!=='pptx'){ toast('Gallery slides can only go into the PowerPoint version.', true); return; }
  let cfgs = [x.cfg || null], msg = `Added “${x.name || 'slide'}”`;
  if(x.fill && window.INON){
    const r = await fillDialog(E, x); if(!r) return;
    const { make } = INON.prep(x, r.rows, { lang:E.l.lang, flip:r.flip });
    cfgs = [make(false)];
    if(r.answer){ cfgs.push(make(true)); msg = `Added “${(x.name || 'slide').replace(/^IN&ON - /, '')}” and its answer slide`; }
  }
  if(x.themed && window.INON){ const g = themeGrade(E); cfgs = cfgs.map(c=>INON.theme(c, g)); }
  await loadMedia(cfgMedia(x.cfg));
  const clip = { kind:'slides', mode:'pptx', items:cfgs.map((c, j)=>({ from:slideFrom(x), dx:x.dx || 0, cfg:c, note:j===0 ? x.note : undefined })) };
  const opts = { keepLook:true, msg };
  if(before!==undefined) opts.before = before;
  await pasteSlides(E, clip, opts);
}
// Edit a gallery slide: it is added to this lesson as a working slide (slots and colours as the template has them), a bar
// at the top offers Save template / Cancel, and Save puts the slide back into the gallery. Done asks first.
const tplById = id=>data.templates.slides.find(x=>x.id===id);
async function editTemplate(E, x){
  if(E.mode!=='pptx'){ toast('Gallery slides can only be edited in the PowerPoint version.', true); return; }
  if(E.tplEdit){ toast('Save or cancel the template you are editing first.', true); return; }
  if(E.editing) finishTextEdit(E);
  const had = new Set(E.v.all().map(e=>e.k)), prev = E.i;
  await loadMedia(cfgMedia(x.cfg));
  await pasteSlides(E, { kind:'slides', mode:'pptx', items:[{ from:slideFrom(x), dx:x.dx || 0, cfg:x.cfg || null, note:x.note }] }, { keepLook:true, msg:`Editing “${x.name || 'template'}”` });
  const made = E.v.all().find(e=>!had.has(e.k)); if(!made) return;
  E.tplEdit = { id:x.id, k:made.k, prev };
  closeGallery(E);
  showTplBar(E);
}
function showTplBar(E){
  const old = $('.ed-tplbar'); if(old) old.remove();
  const te = E.tplEdit; if(!te) return;
  const x = tplById(te.id), col = $('.ed-col'); if(!x || !col) return;
  const bar = el('div', 'ed-tplbar', `<span class="tb-t">${icon('edit')} Editing template <b>${esc((x.name || 'Untitled').replace(/^IN&ON - /, ''))}</b></span>
    <span class="tb-h">${x.fill ? 'Words in { } are filled in when the template is used.' : 'Change the slide, then save.'}</span><span class="tb-sp"></span>
    ${x.fill ? '<button class="btn sm" data-t="slots">Slots…</button>' : ''}<button class="btn sm" data-t="cancel">Cancel</button><button class="btn sm primary" data-t="save">Save template</button>`);
  col.insertBefore(bar, $('.ed-stage', col));
  bar.onclick = e=>{
    const b = e.target.closest('[data-t]'); if(!b) return;
    if(b.dataset.t==='save') tplEditSave(E);
    else if(b.dataset.t==='cancel') tplEditCancel(E);
    else if(b.dataset.t==='slots') slotsHelp(x);
  };
}
function slotsHelp(x){
  const L = INON.legend(x.fill.fmt);
  modal(`<h2>Slots for this template</h2><p class="fill-label">Type these where the typed text should go. They show in the gallery with example text.</p>
    <table class="fill-slots">${L.map(r=>`<tr><td><code>${esc(r[0])}</code></td><td>${esc(r[1])}</td></tr>`).join('')}</table>
    <div class="foot"><button class="btn primary" data-a="ok">Close</button></div>`, (m, close)=>{ $('[data-a=ok]', m).onclick = close; });
}
// Take the working slide out of the lesson (and go back to the slide that was open).
function tplDrop(E){
  const te = E.tplEdit; E.tplEdit = null;
  const bar = $('.ed-tplbar'); if(bar) bar.remove();
  if(!te || !E.v.ent(te.k)) return;
  slideOp(E, list=>{
    const i = list.findIndex(e=>e.k===te.k); if(i >= 0) list.splice(i, 1);
    delete E.l.hides[E.mode][te.k]; if(E.l.myNotes && E.l.myNotes[E.mode]) delete E.l.myNotes[E.mode][te.k];
    const back = E.v.ent(te.prev) && !E.v.ent(te.prev).del ? te.prev : (E.v.keys.find(k=>k!==te.k) ?? te.prev);
    E.i = back; E.selS = new Set([back]); E.anchorS = back; E.sel = null; E.selCover = null;
  });
}
function tplEditCancel(E){ tplDrop(E); toast('Template left as it was'); }
function tplEditSave(E){
  const te = E.tplEdit, x = te && tplById(te.id);
  if(!te) return;
  if(E.editing) finishTextEdit(E);
  if(!x){ toast('That template is no longer in the gallery.', true); tplDrop(E); return; }
  const ent = E.v.ent(te.k); if(!ent || ent.del){ toast('The slide being edited was deleted: nothing saved.', true); E.tplEdit = null; const b = $('.ed-tplbar'); if(b) b.remove(); return; }
  const cfg = E.l.hides[E.mode][te.k] ? JSON.parse(JSON.stringify(E.l.hides[E.mode][te.k])) : { obj:{}, covers:[] };
  emptyFrames((cfg.added || []).map(a=>({ a }))); // as Save to Slide Gallery does
  x.cfg = cfg; x.dx = E.v.dx(te.k) || 0; x.edited = true; x.v = (x.v || 0) + 1;
  const note = myNote(E.l, E.mode, te.k); if(note) x.note = note; else delete x.note;
  galThumbs.clear();
  tplDrop(E);
  saveSoon();
  toast(`Template “${(x.name || 'slide').replace(/^IN&ON - /, '')}” saved`);
}
// Done while a template is being edited.
function tplLeave(E, then){
  modal(`<h2>Save the template?</h2><p>You are editing the template “${esc(((tplById(E.tplEdit.id) || {}).name || 'slide').replace(/^IN&ON - /, ''))}”.</p>
    <div class="foot"><button class="btn" data-a="stay">Keep editing</button><button class="btn danger" data-a="drop">Discard changes</button><button class="btn primary" data-a="save">Save template</button></div>`, (m, close)=>{
    $('[data-a=stay]', m).onclick = close;
    $('[data-a=drop]', m).onclick = ()=>{ close(); tplEditCancel(E); if(then) then(); };
    $('[data-a=save]', m).onclick = ()=>{ close(); tplEditSave(E); if(then && !E.tplEdit) then(); };
  });
}
async function insertObjectTemplate(E, x, pt){
  if(E.mode!=='pptx'){ toast('Gallery objects can only go into the PowerPoint version.', true); return; }
  if(E.editing) finishTextEdit(E);
  if(E.v.ent(E.i) && E.v.ent(E.i).del){ toast('This slide is deleted. Pick another slide first.', true); return; }
  await loadMedia(itemsMedia(x.items));
  const W = E.stage.W, H = E.stage.H, bb = x.bb;
  let dx = pt ? pt.x - (bb.x + bb.w/2) : 0, dy = pt ? pt.y - (bb.y + bb.h/2) : 0;
  dx = Math.min(Math.max(bb.x + dx, 0), Math.max(0, W - bb.w)) - bb.x; // keep it on the slide
  dy = Math.min(Math.max(bb.y + dy, 0), Math.max(0, H - bb.h)) - bb.y;
  E.focus = 'slide'; markStrip(E);
  placeItems(E, x.items, { dx, dy });
  toast(`Added “${x.name || 'objects'}”`);
}
/* The gallery panel (right of the slide): Slides / Objects, search, tag filter, newest first by day.
   Tap a card to add it (slides after the current one, objects where they were). Drag a slide card onto the
   slide strip (or the slide), or an object card onto the slide; on touch, hold the card first. */
const galThumbs = new Map();
function toggleGallery(E, kind){
  if(E.gal && (!kind || E.gal.kind===kind)){ closeGallery(E); return; }
  E.gal = { kind: kind || 'slides', tag:(E.gal && E.gal.tag) || '', q:'' };
  if(!$('.gal')) $('.ed-main').appendChild(el('div', 'gal'));
  renderGallery(E);
  renderRibbon(E);
}
function closeGallery(E){ const g = $('.gal'); if(g) g.remove(); E.gal = null; renderRibbon(E); }
function dayLabel(t){
  const d = new Date(t), d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()), days = Math.round((today() - d0)/864e5);
  if(days===0) return 'Today'; if(days===1) return 'Yesterday';
  return `${DAY_NAMES[d.getDay()].slice(0,3)} ${d.getDate()} ${MON_NAMES[d.getMonth()]}${d.getFullYear()!==today().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
function galList(E){
  const G = E.gal, T = data.templates, all = G.kind==='slides' ? T.slides : T.objects;
  const q = G.q.trim().toLowerCase();
  return all.filter(x=>(!G.tag || x.tags.includes(G.tag)) && (!q || (x.name + ' ' + x.tags.join(' ')).toLowerCase().includes(q))).sort((a, b)=>b.t - a.t);
}
function renderGallery(E){
  const g = $('.gal'); if(!g || !E.gal) return;
  const G = E.gal, T = data.templates, all = G.kind==='slides' ? T.slides : T.objects;
  const used = new Set(all.flatMap(x=>x.tags));
  if(G.tag && !used.has(G.tag)) G.tag = '';
  const tags = allTags().filter(t=>used.has(t));
  g.innerHTML = `<div class="gal-head"><span class="seg gal-seg"><button data-g="slides" class="${G.kind==='slides' ? 'on' : ''}">Slides <span>${T.slides.length}</span></button><button data-g="objects" class="${G.kind==='objects' ? 'on' : ''}">Objects <span>${T.objects.length}</span></button></span>
      <button class="gal-x" data-g="close" title="Close the gallery" aria-label="Close the gallery">${icon('x')}</button></div>
    <label class="gal-search">${icon('search')}<input type="search" aria-label="Search names and tags" placeholder="Search names and tags…" value="${esc(G.q)}"></label>
    ${tags.length ? `<div class="gal-chips"><button class="gal-chip${!G.tag ? ' on' : ''}" data-tag="">All</button>${tags.map(t=>`<button class="gal-chip${G.tag===t ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="gal-list"></div>
    <div class="gal-tip">${G.kind==='slides' ? 'Tap to add after this slide, or drag onto the slide strip.' : 'Tap to add, or drag onto the slide.'} On touch, hold before dragging.</div>`;
  g.onclick = e=>{
    const b = e.target.closest('[data-g],[data-tag]'); if(!b || b.closest('.gal-card')) return;
    if(b.dataset.g==='close'){ closeGallery(E); return; }
    if(b.dataset.g){ G.kind = b.dataset.g; renderGallery(E); renderRibbon(E); return; }
    if(b.dataset.tag!=null){ G.tag = b.dataset.tag; renderGallery(E); }
  };
  const si = $('.gal-search input', g);
  si.oninput = ()=>{ G.q = si.value; renderGalList(E); };
  renderGalList(E);
}
function renderGalList(E){
  const box = $('.gal-list'); if(!box) return;
  const G = E.gal, list = galList(E), all = (G.kind==='slides' ? data.templates.slides : data.templates.objects).length;
  box.innerHTML = '';
  if(!list.length){
    box.innerHTML = `<div class="gal-empty">${all ? 'Nothing matches.' : G.kind==='slides'
      ? `No slides saved yet.<br>Pick a slide in the strip, then <b>Slides → Save to Slide Gallery</b> (or right-click the slide).`
      : `No objects saved yet.<br>Select one or more objects (drag a box round them), then <b>Save to Object Gallery</b>.`}</div>`;
    return;
  }
  let day = null;
  for(const x of list){
    const d = dayLabel(x.t);
    if(d!==day){ day = d; box.appendChild(el('div', 'gal-day', esc(d))); }
    const c = el('div', 'gal-card');
    c.dataset.id = x.id;
    c.innerHTML = `<div class="gal-th"></div><div class="gal-meta"><div class="gal-nm">${esc(x.name || (G.kind==='slides' ? 'Untitled slide' : 'Untitled'))}</div>`
      + `<div class="gal-tg">${x.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div></div><button class="gal-more" title="Name, tags, delete" aria-label="Name, tags, delete">${icon('more')}</button>`;
    box.appendChild(c);
    galThumb(E, G.kind, x).then(t=>{ const th = $('.gal-th', c); if(th && t){ th.innerHTML = ''; th.appendChild(t); PPTX.fitText(t); } });
  }
  wireGalList(E, box);
}
// A template's picture for its card (cached; redrawn per lesson because of the date field).
async function galThumb(E, kind, x){
  const key = x.id + '|' + E.l.id + '|' + (x.v || 0) + '|' + (x.themed ? themeKey(E.l) : '');
  if(galThumbs.has(key)) return galThumbs.get(key);
  const W = 252, MAXH = 150;
  const box = el('div', 'thumb-box');
  try{
    if(kind==='slides'){
      const p = x.from.f || x.from.look;
      const v = p ? await loadDeckFile(p, 'pptx', themeKey(E.l)) : (E.v.base);
      const cfg = galCfg(E, x); // v1.92: fill-in slots show example text; themed templates show this lesson's colours
      await loadMedia(cfgMedia(cfg));
      const z = v.size(), k = W / z.w;
      box.style.cssText = `position:relative;width:${W}px;height:${Math.round(z.h*k)}px;overflow:hidden;background:#fff`;
      const inner = el('div'); inner.style.cssText = `position:absolute;left:0;top:0;width:${z.w}px;height:${z.h}px;transform:scale(${k});transform-origin:0 0;pointer-events:none`;
      const opts = { thumb:true, pixelWidth:W*2, edits:editsFrom(cfg, E.l) };
      const r = x.from.blank ? v.deck.renderBlank(opts) : v.render(Math.min(x.from.i, v.count - 1), opts);
      if(x.from.blank && x.from.act && window.SVAct) SVAct.paint(r.el, x.from.act, z.w, z.h, 0);
      for(const [oid, st] of Object.entries((cfg && cfg.obj) || {})) if(st==='del'){ const e = r.el.querySelector(`[data-oid="${CSS.escape(oid)}"]`); if(e) e.remove(); }
      inner.appendChild(r.el); box.appendChild(inner);
    } else {
      await loadMedia(itemsMedia(x.items));
      const bb = x.bb, pad = 6, k = Math.min((W - pad*2) / Math.max(bb.w, 1), (MAXH - pad*2) / Math.max(bb.h, 1), 1.5);
      box.style.cssText = `position:relative;width:${W}px;height:${Math.round(Math.min(MAXH, bb.h*k + pad*2))}px;overflow:hidden;background:var(--sunken)`;
      const inner = el('div'); inner.style.cssText = `position:absolute;left:${(W - bb.w*k)/2}px;top:${pad}px;width:${bb.w}px;height:${bb.h}px;transform:scale(${k});transform-origin:0 0;pointer-events:none`;
      const fields = lessonFields(E.l);
      for(const it of x.items){
        const a = Object.assign({}, it.a, { x:it.a.x - bb.x, y:it.a.y - bb.y });
        const e = PPTX.renderAdded(a, { media:mediaUrl }, { minor:'Segoe UI' });
        if(fields) for(const f of e.querySelectorAll('[data-field]')){ const v = fields[f.dataset.field]; if(v!=null) f.textContent = v; }
        inner.appendChild(e);
      }
      box.appendChild(inner);
    }
  }catch(err){
    console.warn('Gallery thumbnail', err);
    box.style.cssText = `position:relative;width:${W}px;height:80px;background:var(--sunken)`;
    box.innerHTML = `<div class="gal-miss">This template's file isn't in the Lessons folder.</div>`;
  }
  galThumbs.set(key, box);
  return box;
}
function galMenu(E, x, anchor){
  const kind = E.gal.kind, list = kind==='slides' ? data.templates.slides : data.templates.objects;
  openMenu(anchor, [
    { label: kind==='slides' ? 'Add after this slide' : 'Add to this slide', run:()=>kind==='slides' ? insertSlideTemplate(E, x) : insertObjectTemplate(E, x, null) },
    ...(kind==='slides' ? [{ label:'Edit template…', run:()=>editTemplate(E, x) }] : []),
    { label:'Name and tags…', run:async ()=>{ const r = await saveDialog({ kind, edit:true, name:x.name, tags:x.tags }); if(!r) return; x.name = r.name; x.tags = r.tags; saveSoon(); renderGallery(E); } },
    '-',
    { label:'Delete from the gallery', danger:true, run:async ()=>{
      if(!(await confirmBox('Delete from the gallery?', `“${x.name || 'Untitled'}” will be taken out of the gallery. Lessons it was added to keep their copy.`, 'Delete', true))) return;
      if(x.key && !data.templates.gone.includes(x.key)) data.templates.gone.push(x.key); // a built-in one stays deleted
      const i = list.indexOf(x); if(i >= 0) list.splice(i, 1);
      saveSoon(); renderGallery(E);
    } },
  ]);
}
function wireGalList(E, box){
  if(box._wired) return; box._wired = true;
  let g = null;
  const find = id=>(E.gal.kind==='slides' ? data.templates.slides : data.templates.objects).find(x=>x.id===id);
  const end = ()=>{ if(!g) return; clearTimeout(g.t); g.c.classList.remove('armed'); if(g.drag) galDragEnd(E, g, false); g = null; };
  box.addEventListener('pointerdown', ev=>{
    if(ev.button > 0) return;
    const c = ev.target.closest('.gal-card'); if(!c) return;
    const x = find(c.dataset.id); if(!x) return;
    if(ev.target.closest('.gal-more')){ ev.preventDefault(); galMenu(E, x, ev.target.closest('.gal-more')); return; }
    end();
    g = { c, x, kind:E.gal.kind, id:ev.pointerId, sx:ev.clientX, sy:ev.clientY, touch:ev.pointerType!=='mouse', armed:false, drag:null };
    try{ box.setPointerCapture(ev.pointerId); }catch(e){} // keep getting moves once the pointer leaves the panel
    if(g.touch) g.t = setTimeout(()=>{ if(!g || g.drag) return; g.armed = true; c.classList.add('armed'); try{ navigator.vibrate && navigator.vibrate(15); }catch(e){} }, 350);
  });
  box.addEventListener('touchmove', ev=>{ if(g && (g.armed || g.drag)) ev.preventDefault(); }, { passive:false });
  box.addEventListener('pointermove', ev=>{
    if(!g || ev.pointerId!==g.id) return;
    const d = Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy);
    if(!g.drag){
      if(g.touch && !g.armed){ if(d > 8) end(); return; } // a scroll
      if(d < 6) return;
      galDragStart(E, g, box);
    }
    galDragMove(E, g, ev);
  });
  box.addEventListener('pointerup', ev=>{
    if(!g || ev.pointerId!==g.id) return;
    const was = g; clearTimeout(was.t); was.c.classList.remove('armed'); g = null;
    if(was.drag){ galDragEnd(E, was, true); return; }
    if(was.kind==='slides') insertSlideTemplate(E, was.x); else insertObjectTemplate(E, was.x, null);
  });
  box.addEventListener('pointercancel', end);
  box.addEventListener('contextmenu', ev=>{ const c = ev.target.closest('.gal-card'); if(!c) return; ev.preventDefault(); if(ev.pointerType==='touch' || ev.pointerType==='pen') return; const x = find(c.dataset.id); if(x) galMenu(E, x, c); });
}
function galDragStart(E, g, box){
  const ghost = el('div', 'ed-ghost gal-ghost');
  const t = g.c.querySelector('.thumb-box'); if(t) ghost.appendChild(t.cloneNode(true));
  document.body.appendChild(ghost);
  try{ box.setPointerCapture(g.id); }catch(e){}
  g.drag = { ghost, ind:null, target:null, before:undefined, pt:null };
  E.dragging = true;
}
function galDragMove(E, g, ev){
  const d = g.drag; if(!d) return;
  d.ghost.style.left = (ev.clientX + 12) + 'px'; d.ghost.style.top = (ev.clientY - 20) + 'px';
  const under = document.elementFromPoint(ev.clientX, ev.clientY);
  const strip = under && under.closest('.ed-thumbs'), col = under && under.closest('.ed-col');
  const fr = E.stage.frame.getBoundingClientRect();
  const onSlide = ev.clientX >= fr.left && ev.clientX <= fr.right && ev.clientY >= fr.top && ev.clientY <= fr.bottom && !!col;
  if(d.ind && !(g.kind==='slides' && strip)){ d.ind.remove(); d.ind = null; }
  d.target = null;
  if(g.kind==='slides' && strip){
    const sbox = $('.ed-thumbs'), thumbs = $$('.ed-thumb', sbox), br = sbox.getBoundingClientRect();
    if(ev.clientY < br.top + 50) sbox.scrollTop -= 14; else if(ev.clientY > br.bottom - 50) sbox.scrollTop += 14;
    let before = null, ref = null;
    for(const b of thumbs){ const r = b.getBoundingClientRect(); if(ev.clientY < r.top + r.height/2){ before = skey(b.dataset.k); ref = b; break; } }
    if(!d.ind){ d.ind = el('div', 'ed-drop'); sbox.appendChild(d.ind); }
    const last = thumbs[thumbs.length - 1];
    d.ind.style.top = (ref ? ref.offsetTop - 6 : (last ? last.offsetTop + last.offsetHeight + 4 : 0)) + 'px';
    d.target = 'strip'; d.before = before;
  } else if(g.kind==='slides' && col){ d.target = 'after'; }
  else if(g.kind==='objects' && onSlide){ d.target = 'slide'; d.pt = { x:(ev.clientX - fr.left)/E.stage.k, y:(ev.clientY - fr.top)/E.stage.k }; }
  $('.ed-col').classList.toggle('gal-over', d.target==='after' || d.target==='slide');
}
function galDragEnd(E, g, drop){
  const d = g.drag; if(!d) return;
  d.ghost.remove(); if(d.ind) d.ind.remove(); E.dragging = false;
  const col = $('.ed-col'); if(col) col.classList.remove('gal-over');
  if(!drop || !d.target) return;
  if(d.target==='strip') insertSlideTemplate(E, g.x, d.before);
  else if(d.target==='after') insertSlideTemplate(E, g.x);
  else if(d.target==='slide') insertObjectTemplate(E, g.x, d.pt);
}

/* ---------- ribbon (tabs above the slide) ----------
   Slides, Insert and Design are always there. Reveal and Format appear while an object or cover box is
   selected: selecting something opens Reveal; typing in a text box opens Format. With nothing selected
   the ribbon goes back to the last of Slides / Insert / Design that was open. */
const RB_FONTS = ['Arial','Arial Rounded MT Bold','Calibri','Century Gothic','Comic Sans MS','Segoe UI','Tahoma','Times New Roman','Verdana'];
const RB_FIXED = ['insert','design','reveal','sb']; // sb (v1.62): Sentence Builder tab (sb-editor.js). v1.87: the Slides tab is gone (its commands are in the slide strip); Reveal is a tab of its own
function rbBtn(act, ic, label, o={}){
  return `<button class="rb-b${o.on ? ' on' : ''}${o.big ? ' big' : ''}${o.cls ? ' ' + o.cls : ''}" data-r="${act}"${o.v!=null ? ` data-v="${esc(o.v)}"` : ''}${o.dis ? ' disabled' : ''} data-tip="${esc(o.title || label)}" aria-label="${esc(label ? label.replace(/ ▾$/, '') : o.title || '')}"${o.on !== undefined ? ` aria-pressed="${o.on ? 'true' : 'false'}"` : ''}>${ic ? icon(ic) : ''}${o.pre || ''}${label ? `<span>${esc(label.replace(/ ▾$/, ''))}</span>${/ ▾$/.test(label) ? '<i class="rb-dd" aria-hidden="true">▾</i>' : ''}` : ''}${o.dd ? '<i class="rb-dd" aria-hidden="true">▾</i>' : ''}${o.badge ? `<em class="rb-badge">${esc(o.badge)}</em>` : ''}</button>`;
}
const rbI = (act, ic, title, o={})=>rbBtn(act, ic, '', Object.assign({ title, cls:'ic' }, o));
const rbGroup = (label, inner, cls)=>`<div class="rb-g${cls ? ' ' + cls : ''}" role="group" aria-label="${esc(label)}"><div class="rb-gl" aria-hidden="true">${esc(label)}</div><div class="rb-gb">${inner}</div></div>`; // v1.87: the group name shows above its pill again
const rbCol = inner=>`<div class="rb-col">${inner}</div>`;
const rbSep = '<span class="rb-sep" aria-hidden="true"></span>'; // v1.87: divider inside a pill
const rbSpacer = '<span class="rb-spacer" aria-hidden="true"></span>'; // pushes the next group to the right-hand end
// v1.87: the Arrange and Object groups every object tab ends with (spec §8). edited: show Reset; gallery: Save to Object Gallery.
const rbArrange = (alignOnly)=>rbGroup('Arrange', (alignOnly ? '' : rbI('layermenu', 'front', 'Layer order: bring forward / to the front, send backward / to the back', { dd:true })) + rbI('alignmenu', 'aC', 'Align on slide: line it up with the edges or middle of the slide', { dd:true }));
const rbObjGroup = (E, o={})=>rbSpacer + rbGroup('Object', (o.gallery ? rbI('saveobj', 'star', o.galleryTip || 'Save to Object Gallery: keep a copy to drop into any lesson') + rbSep : '')
  + rbI('dup', 'dupl', 'Duplicate (Ctrl+D)') + (o.edited ? rbI('revert', 'reset', 'Reset: put back the position, size, text and colours from the PowerPoint') : '') + rbI(o.delAct || 'del', 'trash', o.delTip || 'Delete (Del key)', { cls:'ic danger' }));
const rbNote = t=>`<div class="rb-note">${esc(t)}</div>`;
function selObj(E){ const id = E.editing ? E.editing.oid : E.sel; return id ? (E.stage.objects || []).find(o=>o.oid===id) || null : null; }
function selCoverBox(E){ return E.selCover ? (cfgOf(E).covers || []).find(x=>x.id===E.selCover) || null : null; }
const KIND_NAMES = { sp:'Shape', pic:'Picture', grpSp:'Group', graphicFrame:'Table', cxnSp:'Line', text:'Text box', pic2:'Picture', copy:'Copied object' };
function selName(E, o, cv){
  if(cv) return 'Cover box';
  if(!o) return '';
  if(o.cell) return 'Table cell';
  if(o.added) return o.kind==='table' ? 'Table' : o.kind==='pic' ? 'Picture' : o.kind==='text' ? 'Text box' : o.kind==='copy' ? 'Copied object' : o.name;
  if(o.kind==='sp' && hasText(E, o.oid) && !(objEl(E, o.oid) || {}).querySelector?.(':scope > svg')) return 'Text box';
  return KIND_NAMES[o.kind] || 'Object';
}
// Update the ribbon panel in place where the markup matches, instead of re-creating every control. Re-created
// controls (the font select and B / I / U) showed a haze on each text-box click. Events are delegated on the host,
// so keeping the same elements is safe.
function morphRibbon(host, html){
  const tpl = document.createElement('div'); tpl.innerHTML = html;
  const oldRoot = host.firstElementChild, newRoot = tpl.firstElementChild;
  if(!oldRoot || !newRoot || oldRoot.nodeName!==newRoot.nodeName){ host.innerHTML = html; return; }
  morphNode(oldRoot, newRoot);
}
function morphNode(oldN, newN){
  for(const a of [...oldN.attributes]) if(!newN.hasAttribute(a.name)) oldN.removeAttribute(a.name);
  for(const a of [...newN.attributes]) if(oldN.getAttribute(a.name)!==a.value) oldN.setAttribute(a.name, a.value);
  const nc = [...newN.childNodes];
  nc.forEach((n, i)=>{
    const o = oldN.childNodes[i];
    if(!o) oldN.appendChild(n);
    else if(o.nodeType!==n.nodeType || o.nodeName!==n.nodeName) oldN.replaceChild(n, o);
    else if(n.nodeType===3){ if(o.nodeValue!==n.nodeValue) o.nodeValue = n.nodeValue; }
    else if(n.nodeType===1) morphNode(o, n);
  });
  while(oldN.childNodes.length > nc.length) oldN.removeChild(oldN.lastChild);
  if(oldN.localName==='select' && oldN.selectedIndex!==newN.selectedIndex) oldN.selectedIndex = newN.selectedIndex; // a select's shown value is set by the markup, not by the attribute alone
}
function renderRibbon(E){
  const host = $('#ed-rb'); if(!host) return;
  const multi = isMulti(E);
  const o = multi ? null : selObj(E), cv = o || multi ? null : selCoverBox(E);
  const tbl = !!(o && (o.kind==='table' || o.cell));
  const ctx = !!(o || cv || multi);
  const key = E.editing ? 'e:' + E.editing.oid : multi ? 'm:' + [...E.selO].sort().join(',') : o ? 'o:' + o.oid : cv ? 'c:' + cv.id : '';
  // v1.53: selecting anything opens the Object tab (reveal and formatting together). A table stays on the Table tab
  // while you work in the same table.
  if(key!==E.rbKey){
    const base = id=>cellTable(id) || id;
    const was = E.rbKey ? base(E.rbKey.slice(2)) : '', now = key ? base(key.slice(2)) : '';
    if(RB_FIXED.includes(E.tab) && E.tab!=='sb') E.lastTab = E.tab;
    // v1.87: on the Reveal tab, clicking objects stays there (set one, click the next); elsewhere selecting opens the context tab.
    if(multi){ if(E.tab!=='reveal') E.tab = 'multi'; }
    else if(key && E.tab!=='reveal' && !(tbl && E.tab==='table' && now===was)) E.tab = 'object';
    if(!E.editing && E.tab!=='reveal' && qaCurrent(E)) E.tab = 'qa'; // a Q&A box or the whole Q&A: its settings tab
    E.rbKey = key;
  }
  const qaId = ctx ? qaCurrent(E) : null;
  if(E.tab==='qa' && !qaId) E.tab = multi ? 'multi' : ctx ? 'object' : E.lastTab || 'insert';
  const gone = !!(E.v.ent(E.i) && E.v.ent(E.i).del);
  const actCur = window.SVAct && !gone ? SVAct.curAct(E) : null;
  if(E.tab==='act' && !actCur) E.tab = ctx ? 'object' : E.lastTab || 'insert';
  if(!ctx && !RB_FIXED.includes(E.tab) && !(E.tab==='act' && actCur)) E.tab = E.lastTab || 'insert';
  if(E.tab==='sb' && (E.mode!=='pptx' || !window.SVSbEd)) E.tab = 'insert';
  if(ctx && !multi && E.tab==='multi') E.tab = 'object';
  if(ctx && multi && ['object','table'].includes(E.tab)) E.tab = 'multi';
  if(!tbl && E.tab==='table') E.tab = ctx ? 'object' : E.lastTab || 'insert';
  // The Reveal tab's dot: the selected object has a reveal setting and Reveal isn't the open tab.
  const rt = ctx && E.tab!=='reveal' ? revealTarget(E) : null;
  const revDot = !!(rt && (rt.kind==='cover' || rt.state==='hide' || rt.state==='toggle'));
  const tab = (id, name, cls)=>`<button class="rb-tab${E.tab===id ? ' on' : ''}${cls ? ' ' + cls : ''}" data-tab="${id}">${name}${id==='reveal' && revDot ? '<i class="rb-rdot" role="img" aria-label="The selected object has a reveal setting"></i>' : ''}</button>`;
  const panels = { insert:rbInsert, design:rbDesign, reveal:rbReveal, object:rbObject, multi:rbMulti, qa:rbQA, table:rbTable, act:rbActivity, sb:E=>SVSbEd.ribbon(E) };
  const panel = E.orderMode ? rbOrderMode(E) : gone && E.tab!=='sb' ? rbGone(E) : panels[E.tab](E, o, cv);
  const actName = actCur ? (actCur.type==='sbcols' ? 'Builder columns' : actCur.type==='gapfill' ? 'Gap fill' : actCur.type==='translate' ? 'Translation' : 'Sentence unjumble') : '';
  const tabsHtml = `<div class="rb-tabs"><span class="rb-fixed">${tab('insert','Insert')}${tab('design','Design')}${tab('reveal','Reveal')}${E.mode==='pptx' && window.SVSbEd ? tab('sb','Sentence Builder') : ''}</span>`
    + (multi ? `<span class="rb-ctx"><span class="rb-ctxl">${qaWhole(E) ? 'Q&amp;A' : selGroup(E) ? `Group of ${E.selO.size}` : `${E.selO.size} objects`}</span>${tab('multi', selGroup(E) ? 'Group' : 'Selection','x')}${qaId ? tab('qa', 'Q&amp;A settings', 'x') : ''}</span>`
      : ctx ? `<span class="rb-ctx"><span class="rb-ctxl">${esc(E.cell && !E.editing ? (selCells(E).length > 1 ? selCells(E).length + ' cells' : 'Table cell') : selName(E, o, cv) + (o && !o.cell && groupOf(E, o.oid) ? ' in group' : ''))}</span>${tab('object','Object','x')}${tbl ? tab('table','Table','x') : ''}${qaId ? tab('qa', 'Q&amp;A settings', 'x') : ''}</span>` : '')
    + (actCur ? `<span class="rb-ctx"><span class="rb-ctxl">Activity</span>${tab('act', actName, 'x')}</span>` : '')
    + `</div>`;
  // v1.63: the tab strip sits in the top bar (#ed-tabs); the panel stays under it (#ed-rb).
  const tabsHost = $('#ed-tabs');
  if(tabsHost && tabsHost._html!==tabsHtml){ tabsHost.innerHTML = tabsHtml; tabsHost._html = tabsHtml; }
  const html = `<div class="rb-panel${E.orderMode ? ' order' : ''}">${panel}</div>`;
  if(host._html!==html){ morphRibbon(host, html); host._html = html; }
  // v1.87: when the panel is wider than the window, the big labelled buttons drop to icon + ▾ (their tooltips keep the names).
  const pn = host.firstElementChild;
  if(pn){ pn.classList.remove('compact'); if(pn.scrollWidth > pn.clientWidth) pn.classList.add('compact'); opticalPad(pn); }
  const ab = $('[data-e=actedit]');
  if(ab){ // v1.48.3: top-bar Edit activity (Translation → Edit text, Unjumble → Edit sentences)
    const act = window.SVAct && SVAct.curAct(E), gone = !!(E.v.ent(E.i) && E.v.ent(E.i).del);
    ab.hidden = !act || gone;
    if(act) ab.title = act.type==='translate' ? 'Edit the sentences on this Translation slide: type in both languages, change directions, add or take out sentences'
      : act.type==='sbcols' ? 'Read the sentence builder again (new respellings, corrections): updates every column slide of this set'
      : act.type==='gapfill' ? 'Edit the text, gaps and word bank of this Gap Fill (all three slides)' : 'Edit the sentences on this Sentence unjumble (both slides)';
  }
  const ub = $('[data-e=undo]'); if(ub) ub.disabled = !E.undo.length;
  const rb = $('[data-e=redo]'); if(rb) rb.disabled = !E.redo.length;
  if(window.SVSbEd) SVSbEd.sync(E); // v1.75: the Sentence Builder tab covers the slide; the sentence clipboard panel
}
// v1.87: the Slides tab is gone: every slide command is in the slide strip (+ ▾ menu, right-click / long-press menu, bin).
// A deleted slide on show: the ribbon offers Restore.
function rbGone(E){
  return rbGroup('This slide is deleted', rbBtn('restoreslide', 'undo', 'Restore', { title:'Bring this deleted slide back' }));
}
// The Activity context tab (Gap fill / Translation / Sentence unjumble slides).
function rbActivity(E){
  const act = window.SVAct && SVAct.curAct(E); if(!act) return '';
  return act.type==='sbcols'
    ? rbGroup('Sounds', rbBtn('actsounds', 'eye', 'Sounds to show', { big:true, title:'Pick the words whose respelling shows from the start (the rest appear when tapped; the arrow keys never reveal them)' }))
      + rbGroup('Builder columns', rbBtn('actedit', 'edit', 'Refresh from builder', { big:true, title:'Read the sentence builder again (new respellings, corrections): updates every column slide of this set' }))
    : act.type==='gapfill'
    ? rbGroup('Gap fill', rbCol(rbBtn('actedit', 'edit', 'Edit gap fill', { title:'Change the text, the gaps or the decoy words (all three slides)' })
      + rbBtn('actjumble', 'reset', 'Shuffle word bank', { title:'Put the word bank in a new order (all three slides; print shows this order)' })))
    : act.type==='translate'
    ? rbGroup('Translation', rbCol(rbBtn('actedit', 'edit', 'Edit sentences', { title:'Pick the sentences from the sentence builder again (an older answers slide updates too)' })
      + rbBtn('acttext', 'text', 'Edit text', { title:'Type your own words in the target language and the English, change directions, add or take out sentences' })))
    : rbGroup('Sentences', rbBtn('actedit', 'edit', 'Edit sentences', { big:true, title:'Change the sentences (updates both unjumble slides)' }))
      + rbGroup('Text', rbBtn('acttext', 'text', 'Edit text', { big:true, title:'Type your own words (extra words too), change words by hand, add or take out sentences (both slides)' }))
      + rbGroup('Jumble', rbBtn('actjumble', 'reset', 'New jumble', { big:true, title:'Jumble the blocks again (both slides; print shows this order)' }))
      + rbGroup('Chunks', rbI('actfewer', 'minus', 'Fewer, longer chunks: joins the shortest neighbours in every sentence (both slides)', { dis:!act.rows.some(r=>r.tl.length > 2) }) + `<span class="rb-fs" title="Most chunks in any sentence">${Math.max(...act.rows.map(r=>r.tl.length))}</span>` + rbI('actmore', 'plus', 'More, shorter chunks: splits the longest chunk in every sentence (both slides)', { dis:!act.rows.some(r=>r.tl.some(t=>/\s/.test(t.trim()))) }))
      + rbGroup('Size', rbI('actsmaller', 'minus', 'Smaller text in the sentences (both slides)', { dis:(act.fs || 1) <= 0.5 }) + `<span class="rb-fs" title="Size of the text in the sentences">${Math.round((act.fs || 1)*100)}%</span>` + rbI('actbigger', 'plus', 'Bigger text in the sentences: long ones go onto more lines (both slides)', { dis:(act.fs || 1) >= 2 }));
}
// The Reveal tab (v1.87, spec §7). Nothing selected: Cover box · Order · Deleted · (spacer) · Start over.
// Something selected: its own groups first (state, Step, Button), a divider, then the slide groups.
function rbReveal(E, o, cv){
  const pptx = E.mode==='pptx', n = edSeq(E).length, drawing = !!E.drawCover;
  const delObj = deletedIds(E.l, E.mode, E.i).length;
  let out = '';
  const t = drawing ? null : revealTarget(E);
  if(t){
    const c = cfgOf(E), pos = revealPos(E), key = selRevealKey(E);
    const lab = t.kind==='cover' ? 'Cover box' : t.kind==='multi' ? (t.grp ? 'Group' : `${t.n} items`) : t.kind==='cells' ? (t.n > 1 ? `${t.n} cells` : 'Table cell') : selName(E, o, cv);
    if(t.kind!=='cover') out += rbGroup(lab, OBJ_STATES.map(([v, l])=>rbBtn('revstate', null, l, { v, on:t.state===v, title:v==='hide' ? 'Hidden until the clicker reveals it' : v==='toggle' ? 'Revealed by the clicker, and can be hidden again' : 'Always showing' })).join(''), 'rb-seg');
    const stepOn = pos >= 0;
    out += rbGroup('Step', rbI('revstep', 'left', 'Reveal earlier', { v:-1, dis:!stepOn || pos <= 0 })
      + `<span class="rb-fs rb-step">${stepOn ? `${pos + 1} of ${n}` : '–'}</span>`
      + rbI('revstep', 'right', 'Reveal later', { v:1, dis:!stepOn || pos >= n - 1 }));
    out += rbGroup('Button', rbI('revbtn', 'reset', 'Reset reveal button position', { dis:!(stepOn && key && c.btn[key]) }));
    out += '<span class="rb-vdiv" aria-hidden="true"></span>';
  }
  out += rbCoverGroup(E)
    + rbGroup('Order', rbBtn('ordermode', 'order', `${n} reveal${n===1 ? '' : 's'} ▾`, { dis:drawing || n < 2, title:'Set reveal order: click the items in the order the clicker should reveal them' }));
  if(pptx) out += rbGroup('Deleted', rbI('showdel', 'trash', `Show deleted objects${delObj ? ' (' + delObj + ')' : ''}`, { on:E.showDel, dis:drawing, badge:delObj || '' }));
  out += '<span class="rb-spacer" aria-hidden="true"></span>'
    + rbGroup('Start over', (pptx ? rbBtn('useanim', 'reset', 'Use animations', { dis:drawing, title:"Use animations: replaces this slide's reveals with the PowerPoint's animations" }) : '')
      + rbBtn('clearrev', 'x', 'Clear reveals', { dis:drawing, title:'Clear reveals: remove hide settings and cover boxes from this slide (edits and deletions stay)' }), 'rb-danger');
  return out;
}
// Object tab, tables only: the Select cells toggle (picked cells are then set on the Reveal tab, or formatted here).
function rbCellsGroup(E, o){
  if(!(o && (o.kind==='table' || o.cell))) return '';
  return rbGroup('Cells', rbBtn('cellmode', 'selRow', E.cellMode ? 'Done selecting' : 'Select cells', { big:true, on:!!E.cellMode, title:'Click cells to pick them, or drag across several; then set their reveal on the Reveal tab' }));
}
function rbInsert(E){
  if(E.mode!=='pptx') return rbNote('PDF versions: only cover boxes can be added (Reveal tab). Add the PowerPoint version to insert text, shapes and pictures.');
  // v1.69: Header / Text box / Q&A / Date sit under Text ▾ and the shapes under Shapes ▾, so the tab fits easily.
  // v1.87: Cover box moved to the Reveal tab; Slide Gallery, Save to Slide Gallery and Import slides live here (and in the strip's + ▾).
  // v1.87 (spec §5): Text · Table · Shapes · Media · Components, every button icon-only with a tooltip.
  const dt = E.drawText;
  const shp = (k, tip)=>rbI('shape', 'shape_' + k, tip, { v:k });
  return rbGroup('Text', rbI('addtext', 'text', 'Text box: drag on the slide to draw one, or click to place one (Arial 24)', { v:'text', on:dt==='text' })
      + rbI('addtext', 'head', 'Header: a title for the slide (Arial 36 bold)', { v:'head', on:dt==='head' })
      + rbI('qa', 'qa', 'Q&A: ten questions with the answers hidden')
      + rbI('date', 'cal', 'Date: the lesson date, in the words you choose'))
    + rbGroup('Table', rbI('table', 'table', 'Table: rows and columns, each cell can be hidden until revealed', { dd:true }))
    + rbGroup('Shapes', shp('rect', 'Rectangle') + shp('roundRect', 'Rounded rectangle') + shp('ellipse', 'Oval') + shp('line', 'Line: drag the ends to place it') + shp('arrow', 'Arrow: drag the ends to place it')
      + rbSep + rbI('shapemenu', 'shapes', 'More shapes: triangle, diamond, star, block arrow, speech bubble, tick, cross', { dd:true }))
    + rbGroup('Media', rbI('addpic', 'image', 'Picture: add one from a file (or paste with Ctrl+V, or drag one in)')
      + rbI('framenew', 'frame', 'Picture frame: an empty frame to drop or paste a picture into later (for templates)'))
    + rbGroup('Components', rbI('gallery', 'layers', 'Object Gallery: saved objects, tap or drag onto the slide', { v:'objects', on:!!(E.gal && E.gal.kind==='objects') })
      + rbI('activity', 'activity', 'Live objects: add an activity slide (Sentence unjumble, Translation, Gap fill)', { dd:true })
      + (window.SVSbEd ? rbI('sbinsert', 'sb', 'Sentence Builder: add a sentence builder as a 16:9 picture. Choose the version (both languages, one language, gaps…) first') : '')
      + rbSep
      + rbI('gallery', 'gallery', 'Slide Gallery: saved slides, tap or drag one in', { v:'slides', on:!!(E.gal && E.gal.kind==='slides') })
      + rbI('import', 'upload', 'Import slides: bring in slides from another PowerPoint, fully editable')
      + (window.SBWaypoints ? rbSep + rbI('wpinsert', 'image', "Waypoint: insert this term's Waypoint for the lesson's year, or choose one", { dd:true }) : '')
      + rbI('toolnew', 'tools', 'Tool icon: a shortcut on the slide that starts a tool when tapped while presenting (the Clock with a set time)'));
}
// Reveal tab → Cover box. While the tool is on (v1.53, was a floating bar): the colour for the next boxes
// (it recolours the one just drawn too) and Done.
function rbCoverGroup(E){
  const cur = (E.coverCol || 'match').toLowerCase();
  return rbGroup('Cover', rbBtn('cover', 'box', 'Cover box', { big:true, on:E.drawCover, title:'Drag on the slide to draw boxes that hide part of it until revealed. The tool stays on until Done.' })
    + (E.drawCover ? COVER_COLORS.map(col=>coverDot(E, col, 'drawcol', cur===col.toLowerCase(), 'Colour for the next boxes (and the one just drawn)')).join('')
      + rbBtn('coverdone', 'done', 'Done', { cls:'primary', title:'Done: stop drawing cover boxes (Esc)' }) : ''));
}
function deckRatio(E){ const z = E.v.base.size(), r = z.w / z.h; return Math.abs(r - 16/9) < 0.02 ? '16:9' : Math.abs(r - 4/3) < 0.02 ? '4:3' : null; }
function rbDesign(E){
  if(E.mode!=='pptx') return rbNote('Slide size and background are for the PowerPoint version.');
  const nat = deckRatio(E), cur = E.v.ratio || nat;
  const sw = (cfgOf(E).bg) || '';
  const lab = r=>r; // v1.87: just the ratio next to the icon; the words are in the tooltip
  const tk = themeKey(E.l), tn = THEME_NAMES[tk] || '';
  return rbGroup('Themes', rbBtn('theme', 'theme', tn.replace(/ \(.*$/, ''), { big:true, dd:true, title:`Themes: the colours this lesson uses (${tn}). Pick a year group, gold, or the deck as it was imported.` }))
    + rbGroup('Slide size', ['16:9','4:3'].map(r=>rbBtn('ratio', r==='16:9' ? 'wide' : 'square', lab(r), { big:true, v:r, on:cur===r, title:(r==='16:9' ? 'Widescreen 16:9' : 'Standard 4:3') + ': ' + (r===nat ? `the deck's own size` : `content keeps its size, centred; the background ${r==='16:9' ? 'widens to fill the sides' : 'is narrowed (content at the sides may be cut off)'}`) + (nat ? ` (the deck is ${nat}${E.v.ratio ? '; move things round to fit the new size' : ''})` : '') })).join(''))
    // Quick backgrounds (spec §6, §10): Deck's own · Standard · White · Y7–Y11 muted, then ▾ for More colours.
    + rbGroup('Background', rbQuick('bgq', 'deck', "Deck's own background", !sw) + rbQuick('bgq', STD_COLOUR, 'Standard ' + STD_COLOUR, sw.toLowerCase()===STD_COLOUR.toLowerCase()) + rbQuick('bgq', '#FFFFFF', 'White', sw.toLowerCase()==='#ffffff')
      + YEAR_COLS.map(y=>rbQuick('bgq', y[2], `${y[3]}: light`, sw.toLowerCase()===y[2].toLowerCase())).join('')
      + rbBtn('bg', null, '', { cls:'ic', pre:`<span class="rb-sw${sw ? '' : ' deck'}" style="--c:${sw || '#fff'}"></span>`, dd:true, title:"More colours: this slide's background colour (selected slides, if several)" }))
    + rbGroup('Apply', rbBtn('bgall', 'copy', 'Apply to all slides', { title:"Give every slide this slide's background" }) + rbBtn('bgreset', 'reset', 'Reset all', { title:"Every slide back to the deck's own background" }));
}
function rbMulti(E){
  const list = multiObjs(E), c = cfgOf(E), n = list.length;
  const units = selUnits(E, c), sg = selGroup(E), anyG = units.some(u=>u.g);
  const tb = list.filter(o=>isTextBox(E, o)), st = massStyled(E); // mass editing: text boxes take text, fill, outline and Autofit; shapes fill and outline
  const mass = (tb.length ? rbMassText(E, tb) : '') + (st.length ? rbMassStyle(E, st) : '')
    + (tb.length ? rbGroup('Box', rbBtn('autofit', null, 'Autofit', { title:'Autofit: resize each text box to fit its text' })) : '');
  // v1.87 (spec §8): Group · Arrange · Align · Space out · Objects. Copy is gone (Ctrl+C or right-click does it).
  return mass + rbGroup('Group', rbI('group', 'group', 'Group: join them so they select, move, resize and reveal as one', { dis:units.length < 2 })
      + rbI('ungroup', 'ungroup', 'Ungroup: separate the group back into its objects', { dis:!anyG }))
    + rbGroup('Arrange', rbI('layermenu', 'front', 'Layer order: bring forward / to the front, send backward / to the back', { dd:true }))
    + rbGroup('Align', rbI('malign', 'aL', 'Align left edges', { v:'l' }) + rbI('malign', 'aC', 'Align centres', { v:'c' }) + rbI('malign', 'aR', 'Align right edges', { v:'r' })
      + rbSep + rbI('malign', 'aT', 'Align tops', { v:'t' }) + rbI('malign', 'aM', 'Align middles', { v:'m' }) + rbI('malign', 'aB', 'Align bottoms', { v:'b' }))
    + rbGroup('Space out', rbI('malign', 'distH', 'Space out across', { v:'dh', dis:n < 3 }) + rbI('malign', 'distV', 'Space out down', { v:'dv', dis:n < 3 })
      + rbSep + rbBtn('mscatter', null, 'Scatter', { title:'Scatter: shuffle the objects into random, evenly spread places across the slide, clear of anything not selected (press again for a new shuffle)' }))
    + rbSpacer + rbGroup('Objects', rbI('saveobj', 'star', 'Save to Object Gallery: keep these objects together as a template, to drop into any lesson') + rbSep
      + rbI('dup', 'dupl', 'Duplicate (Ctrl+D)') + rbI('mdel', 'trash', `Delete the ${n} objects (Del key)`, { cls:'ic danger' }));
}
// v1.53: the Object tab: Reveal ▾ first (and Select cells for a table), then the formatting.
function rbObject(E, o, cv){
  if(!cv && o && !o.cell && cfgOf(E).obj[o.oid]==='del') return rbGroup('Deleted', rbBtn('restore', 'undo', 'Restore', { big:true }));
  // v1.68: a tool icon has no reveal settings: Change tool, Duplicate, Delete.
  if(!cv && o && o.kind==='tool') return rbGroup('Tool icon', rbI('toolicon', 'tools', 'Change the tool, its icon or the Clock time'))
    + rbObjGroup(E);
  return rbCellsGroup(E, o) + (o && !cv ? rbCropGroup(E, o) : '') + rbFormat(E, o, cv); // v1.87: Reveal ▾ moved to the Reveal tab
}
// Size, font and B / I / U of the text being typed (or the selected box's first text).
function textInfo(E, oid){
  let n = null;
  if(E.editing){ const sel = getSelection(); n = sel.rangeCount && E.editing.tx.contains(sel.anchorNode) ? sel.anchorNode : E.editing.tx; }
  else { const e = objEl(E, oid); n = e && e.querySelector(':scope > .pptx-tx'); }
  if(!n) return null;
  if(n.nodeType===3) n = n.parentElement;
  if(n.classList && n.classList.contains('pptx-tx') || (n.classList && n.classList.contains('pptx-p'))){ const sp = [...n.querySelectorAll('span:not(.pptx-bu)')].find(s=>s.textContent.replace(/​/g,'').trim()) || n.querySelector('span:not(.pptx-bu)'); if(sp) n = sp; }
  const cs = getComputedStyle(n);
  let size = parseFloat(n.dataset && n.dataset.fs) || parseFloat(cs.fontSize);
  if(E.editing) size = parseFloat(cs.fontSize);
  let u = false; for(let x = n; x && x!==document.body && !(x.classList && x.classList.contains('pptx-tx')); x = x.parentElement) if(/underline/.test(getComputedStyle(x).textDecorationLine)){ u = true; break; }
  let hl = ''; for(let x = n; x && x!==document.body && !(x.classList && x.classList.contains('pptx-tx')); x = x.parentElement){ const bg = x.style && x.style.backgroundColor; if(bg && bg!=='transparent'){ hl = rgbHex(bg) || bg; break; } }
  return { size:Math.round(size*2)/2, font:(cs.fontFamily.split(',')[0] || '').replace(/["']/g,'').trim(), b:Number(cs.fontWeight) >= 600, i:cs.fontStyle==='italic', u, hl, color:rgbHex(cs.color) || '#000000' };
}
// Highlighter for typed text: [colour, name]. The first is what the button itself applies.
const HILITE_COLS = [['#fff200', 'Yellow'], ['#7CFC00', 'Green'], ['#00e5ff', 'Blue'], ['#ff7ad9', 'Pink'], ['#ffb347', 'Orange']];
// Paints the selected text with colour, or takes the highlight off (colour null). Selection needed: the whole box has no "selected text".
function applyHighlight(E, colour){
  if(!E.editing){ toast('Double-click the box and select some text first'); return; }
  withText(E, ()=>fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, colour || 'transparent'); }));
}
// Font and Paragraph groups for a text object (oid), or a table cell.
function rbTextGroups(E, oid){
  const ti = textInfo(E, oid) || {};
  const fonts = [...new Set([ti.font, ...slideFonts(E), ...RB_FONTS].filter(Boolean))];
  // v1.87 (spec §8): Font · Size · Format · Colour · Align ▾ · Spacing · Lists ▾, each its own pill.
  const ap = (objEl(E, oid) || document.body).querySelector('.pptx-p'), ha = ap ? ap.style.textAlign || 'left' : 'left';
  const fw = Math.max(96, Math.min(230, 44 + (ti.font || 'Arial').length * 8)); // the pill is sized to the font name
  return rbGroup('Font', `<select class="rb-font" data-r="font" data-tip="Font" aria-label="Font" style="width:${fw}px">${fonts.map(f=>`<option${f===ti.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`)
    + rbGroup('Size', rbI('smaller', 'minus', 'Smaller') + `<span class="rb-fs" title="Font size (pt)">${ti.size || ''}</span>` + rbI('bigger', 'plus', 'Bigger'))
    + rbGroup('Format', rbBtn('bold', null, '', { cls:'ic tb', pre:'<b>B</b>', on:ti.b, title:'Bold (Ctrl+B)' }) + rbBtn('italic', null, '', { cls:'ic tb', pre:'<i>I</i>', on:ti.i, title:'Italic (Ctrl+I)' }) + rbBtn('underline', null, '', { cls:'ic tb', pre:'<u>U</u>', on:ti.u, title:'Underline (Ctrl+U)' })
      + rbBtn('hilite', null, '', { cls:'ic tb', on:!!ti.hl, pre:`<span class="rb-tcol" style="border-bottom-color:${HILITE_COLS[0][0]};background:${HILITE_COLS[0][0]}55">ab</span>`, title:'Highlight the selected text: pick a colour' })
      + rbSep + rbBtn('sym', null, '', { cls:'ic ed-symb', pre:'Àé', title:'Accents and symbols' }))
    + rbTextColourGroup(ti.color || '#000000', 'tcolorq', 'tcolor')
    + rbGroup('Align', rbI('talignmenu', ha==='center' ? 'alignC' : ha==='right' ? 'alignR' : 'alignL', 'Align: left, centre or right', { dd:true }))
    + rbGroup('Spacing', rbBtn('lspace', null, 'Line spacing ▾', { title:'Line spacing for the picked paragraphs' }) + rbBtn('autospace', null, 'Auto spacing', { title:'Auto spacing: spread the text evenly to fill the box (text boxes)' }))
    + rbGroup('Lists', rbI('listmenu', 'lists', E.editing ? 'Lists: bullets, numbering and indent' : 'Lists: double-click the box to type in it first', { dd:true, dis:!E.editing }));
}
function rbCellText(E, o){ return hasText(E, o.oid) ? rbTextGroups(E, o.oid) : ''; }
function rbFormat(E, o, cv){
  if(cv) return rbGroup('Colour', COVER_COLORS.map(col=>coverDot(E, col, 'covercol', (cv.color || '').toLowerCase()===coverColourFor(E, col).toLowerCase(), 'Box colour')).join('') + rbBtn('covermore', null, '', { cls:'ic', pre:`<span class="ed-sw" style="--c:${cv.color || '#fff'}"></span>`, dd:true, title:'More colours: any box colour' }))
    + rbArrange(true) + rbObjGroup(E);
  const c = cfgOf(E);
  if(o.cell){ const ta = tableOf(c, cellTable(o.oid)); return (rbCellText(E, o) || rbNote('Double-tap the cell to type in it.')) + (ta ? rbGroup('Cell', rbI('cval', 'vT', 'Top of the cell', { v:'t' }) + rbI('cval', 'vM', 'Middle of the cell', { v:'m' }) + rbI('cval', 'vB', 'Bottom of the cell', { v:'b' })) : ''); }
  const tbl = o.kind==='table' && o.added ? tableOf(c, o.oid) : null;
  // Table with cells picked: just the cells' formatting (Esc goes back to the whole table for Arrange etc.).
  if(tbl && E.cell) return rbCellFormat(E, tbl) + rbCellFill(E, tbl);
  const caps = tbl ? {} : objCaps(E, o), text = !tbl && hasText(E, o.oid);
  const edited = !o.added && (c.geo[o.oid] || c.text[o.oid] != null || c.style[o.oid]);
  let out = tbl ? rbCellFormat(E, tbl) : '';
  // v1.87: a shape that has text only shows the text controls while you type in it (double-click); the FR language button is gone.
  if(text && (selName(E, o)==='Text box' || E.editing)) out += rbTextGroups(E, o.oid);
  if(text && selName(E, o)==='Text box') out += rbGroup('Box', rbBtn('autofit', null, 'Autofit', { title:'Autofit: resize the box to fit its text' }));
  if(o.kind==='frame') out += rbFrameGroup(E, o); // v1.73
  if((caps.fill || caps.line) && selName(E, o)!=='Text box'){ // §8: a text box has no Fill / Outline
    const sty = objStyle(c, o), D = OBJ_DEFAULTS[o.kind] || {};
    const fill = sty.fill || D.fill || '', line = sty.line || D.line || '';
    const sw = (v, ring)=>`<span class="ed-sw${ring ? ' ring' : ''}${!v || v==='none' ? ' none' : ''}" style="--c:${v && v!=='none' ? v : '#fff'}"></span>`;
    // Quick fills (spec §10): No fill · Y7–Y11 dark · Standard, then ▾ for More colours.
    if(caps.fill) out += rbGroup('Fill', rbQuick('fillq', 'none', 'No fill', !fill || fill==='none') + YEAR_COLS.map(y=>rbQuick('fillq', y[1], `${y[3]}: dark`, fill.toLowerCase()===y[1].toLowerCase())).join('')
      + rbQuick('fillq', STD_COLOUR, 'Standard ' + STD_COLOUR, fill.toLowerCase()===STD_COLOUR.toLowerCase()) + rbBtn('fill', null, '', { cls:'ic', pre:sw(fill), dd:true, title:'More colours: fill colour' }));
    if(caps.line) out += rbGroup('Outline', rbBtn('line', null, '', { cls:'ic', pre:sw(line, true), dd:true, title:o.kind==='line' ? 'Outline: colour, thickness and style of the line' : 'Outline: colour, thickness and style' }));
  }
  out += rbArrange() + rbObjGroup(E, { gallery:E.mode==='pptx', edited });
  return out;
}
function slideFonts(E){
  const out = new Set();
  for(const sp of E.stage.slideEl.querySelectorAll('.pptx-tx span')){ const f = (getComputedStyle(sp).fontFamily.split(',')[0] || '').replace(/["']/g,'').trim(); if(f) out.add(f); if(out.size >= 6) break; }
  return [...out];
}
function pickTab(E, t){
  if(t.dataset.tab==='sb' && E.tab!=='sb' && window.SVSbEd) SVSbEd.enter(E);
  E.tab = t.dataset.tab; if(RB_FIXED.includes(E.tab) && E.tab!=='sb') E.lastTab = E.tab; renderRibbon(E);
}
function wireRibbon(E){
  const host = $('#ed-rb');
  const tabsHost = $('#ed-tabs');
  // Buttons don't take the focus, so text being typed keeps its selection.
  for(const ev of ['pointerdown','mousedown']){
    host.addEventListener(ev, e=>{ if(e.target.closest('button')) e.preventDefault(); });
    if(tabsHost) tabsHost.addEventListener(ev, e=>{ if(e.target.closest('button')) e.preventDefault(); });
  }
  if(tabsHost) tabsHost.addEventListener('click', e=>{ const t = e.target.closest('[data-tab]'); if(t) pickTab(E, t); });
  host.addEventListener('click', e=>{
    const t = e.target.closest('[data-tab]');
    if(t){ pickTab(E, t); return; }
    const b = e.target.closest('[data-r]'); if(!b || b.disabled || b.localName==='select' || b.localName==='input') return;
    ribbonAction(E, b.dataset.r, b.dataset.v, b);
  });
  host.addEventListener('change', e=>{
    if(e.target.matches('select[data-r=font]')) withText(E, ()=>setFont(E, e.target.value));
    if(e.target.matches('select[data-r=cfont]')) cellsFont(E, e.target.value);
    if(e.target.matches('select[data-r=mfont]')){ const f = e.target.value; massText(E, ()=>setFont(E, f)); }
    if(e.target.matches('select[data-r=qafont]')){ const f = e.target.value, q = qaCurrent(E); if(q) qaText(E, q, ['h', 'q', 'a'], ()=>setFont(E, f)); }
    if(e.target.matches('input[data-r=qasplit]')){ const q = qaCurrent(E); if(q) qaRelayout(E, q, { split:Number(e.target.value)/100 }); }
  });
  host.addEventListener('input', e=>{
    if(e.target.matches('input[data-r=qasplit]')){ const v = Number(e.target.value), s = e.target.nextElementSibling; if(s) s.textContent = `${v}% | ${100 - v}%`; } // the shown split follows the slider; the slide changes on release
  });
}
// Text formatting from the ribbon: on the text being typed, or (box selected, not typing) on all its text.
function withText(E, fn){
  if(E.editing){ fn(); return; }
  const o = selObj(E), oid = E.cell || (o && o.oid); if(!oid || !hasText(E, oid)) return;
  startTextEdit(E, oid);
  if(!E.editing) return;
  const r = document.createRange(); r.selectNodeContents(E.editing.tx);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); E.editing.range = r.cloneRange();
  fn();
  finishTextEdit(E);
}
function setFont(E, f){
  if(!f) return;
  fmt(E, r=>{
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontName', false, f);
    // Runs already carry their own font: set it on every run (and paragraph) inside the selection too.
    const ff = `"${f}", "Segoe UI", Arial, sans-serif`;
    const sel = getSelection(), rr = sel.rangeCount ? sel.getRangeAt(0) : r;
    for(const el2 of E.editing.tx.querySelectorAll('span:not(.pptx-bu), .pptx-p')){
      const sr = document.createRange(); sr.selectNodeContents(el2);
      if(rr.compareBoundaryPoints(Range.START_TO_START, sr) <= 0 && rr.compareBoundaryPoints(Range.END_TO_END, sr) >= 0) el2.style.fontFamily = ff;
    }
  });
}
const TEXT_ACTS = new Set(['bold','italic','underline','hilite','smaller','bigger','tcolor','talign','lspace','autospace','sym','date','textmenu','list','lvl','tcolorq','talignmenu','listmenu','revstate','revstep','revbtn']); // list / lvl (v1.72); revstate / revstep / revbtn (v1.87, Reveal tab: they handle typing themselves) // textmenu (v1.69): Text ▾ → Lesson date can go in at the cursor
function ribbonAction(E, a, v, b){
  if(/^sb(insert|choose|copy|clear|pic|back)$/.test(a) && window.SVSbEd){ SVSbEd.action(E, a, v, b); return; } // v1.62 (sb-editor.js)
  if(E.editing && !TEXT_ACTS.has(a)) finishTextEdit(E);
  const c = cfgOf(E), o = selObj(E), cv = o ? null : selCoverBox(E);
  switch(a){
    // Slides
    case 'newslide': blankSlide(E); break;
    case 'dupslide': dupSlides(E); break;
    case 'hideslide': hideSlides(E); break;
    case 'delslide': deleteSlides(E); break;
    case 'restoreslide': E.selS = new Set([E.i]); restoreSlides(E); break;
    case 'up': nudgeSlides(E, -1); break;
    case 'down': nudgeSlides(E, 1); break;
    case 'copyslide': copySlides(E); break;
    case 'pasteslide': pasteSlides(E, readClip()); break;
    case 'import': importSlides(E); break;
    case 'pastesys': pasteFromSystem(E, 'slides'); break;
    // Activities (activities.js)
    case 'activity': if(window.SVAct) SVAct.activityMenu(E, b); break;
    case 'actedit': if(window.SVAct) SVAct.editSentences(E); break;
    case 'actjumble': if(window.SVAct) SVAct.newJumble(E); break;
    case 'actsounds': if(window.SVCols) SVCols.pick(E); break;
    case 'acttext': if(window.SVAct) SVAct.editText(E); break;
    case 'actfewer': if(window.SVAct) SVAct.chunkCount(E, -1); break;
    case 'actmore': if(window.SVAct) SVAct.chunkCount(E, 1); break;
    case 'actsmaller': if(window.SVAct) SVAct.textSize(E, -1); break;
    case 'actbigger': if(window.SVAct) SVAct.textSize(E, 1); break;
    case 'useanim': change(E, c=>{ const obj = animHides(E.v, E.i); for(const [k, s] of Object.entries(c.obj)) if(s==='del' || (k[0]==='n' && s)) obj[k] = s; c.obj = obj; }); break;
    case 'clearrev': change(E, c=>{ const obj = {}; for(const [k, s] of Object.entries(c.obj)) if(s==='del') obj[k] = 'del'; c.obj = obj; c.covers = []; c.btn = {}; }); E.selCover = null; break;
    case 'showdel': E.showDel = !E.showDel; if(!E.showDel && E.sel && c.obj[E.sel]==='del') E.sel = null; showEdit(E); break;
    // Insert
    case 'addtext': armText(E, v || 'text'); renderRibbon(E); break;
    case 'textmenu': openMenu(b, [ // v1.69
      { label:'Header (Arial 36 bold)', run:()=>{ armText(E, 'head'); renderRibbon(E); } },
      { label:'Text box (Arial 24)', run:()=>{ armText(E, 'text'); renderRibbon(E); } },
      '-',
      { label:'Q&A (ten questions, answers hidden)', run:()=>{ if(E.editing) finishTextEdit(E); insertQA(E); } },
      { label:"Lesson date…", run:()=>dateMenu(E, $('[data-r=textmenu]') || b) }]); break;
    case 'shapemenu': shapeMenu(E, b); break;
    case 'date': dateMenu(E, b); break;
    case 'qa': insertQA(E); break;
    case 'shape': addShape(E, v); break;
    case 'toolnew': openToolIconPicker(E, null); break;
    case 'toolicon': if(o && o.kind==='tool') openToolIconPicker(E, o); break;
    case 'addpic': pickPicture(E); break;
    case 'wpinsert': openWaypointMenu(E, b); break; // 2026-10-24
    case 'framenew': addFrame(E); break; // v1.73
    case 'framepic': if(o && o.kind==='frame') pickFramePicture(E, o.oid); break;
    case 'frameadj': if(o && o.kind==='frame'){ if(E.adjust===o.oid){ E.adjust = null; buildEditOverlay(E); } else startFrameAdjust(E, o.oid); } break;
    case 'frameempty': if(o && o.kind==='frame') emptyFrame(E, o.oid); break;
    case 'cropmode': if(o && canCrop(E, o)){ if(E.crop===o.oid) endCrop(E); else startCrop(E, o.oid); } break; // v1.80
    case 'cropreset': if(o && hasCrop(E, o)) resetCrop(E, o); break;
    case 'cover': E.drawCover = !E.drawCover; E.lastCover = null; E.drawText = null; E.sel = null; E.selCover = null; E.cell = null; clearMulti(E); E.tab = E.lastTab = 'reveal'; buildEditOverlay(E); break;
    case 'revstate': setRevealState(E, v); break; // v1.87 Reveal tab
    case 'revstep': moveReveal(E, Number(v)); break;
    case 'revbtn': { const key = selRevealKey(E); if(key) change(E, c=>{ delete c.btn[key]; }); break; }
    // Design
    case 'ratio': setRatio(E, v); break;
    case 'theme': themeMenu(E, b); break;
    case 'bg': colourPop(b, { title:'Background', scope:'this slide', cur:c.bg || '', deck:true },p=>{ if(p.color) setBg(E, p.color==='deck' ? null : p.color, false); }); break;
    case 'bgall': setBg(E, c.bg || null, true); toast(c.bg ? 'Every slide has this background' : "Every slide has the deck's own background"); break;
    case 'bgreset': setBg(E, null, true); break;
    // Reveal
    case 'state': setObjState(E, v); break;
    case 'btnreset': change(E, c=>{ delete c.btn[cv ? 'c' + cv.id : 'o' + (o && o.oid)]; }); break;
    case 'restore': if(o) change(E, c=>{ delete c.obj[o.oid]; }); break;
    // Format: text
    case 'bold': case 'italic': case 'underline': withText(E, ()=>fmt(E, ()=>{ document.execCommand('styleWithCSS', false, true); document.execCommand(a); })); break;
    case 'hilite': {
      const cur = ((textInfo(E, E.editing && E.editing.oid) || {}).hl || '').toLowerCase();
      const grid = el('div'); grid.style.cssText = 'display:flex;gap:8px;padding:6px 8px';
      for(const [col, name] of [...HILITE_COLS, [null, 'No highlight']]){
        const d = el('button'); d.title = d.ariaLabel = name;
        d.style.cssText = `width:24px;height:24px;border-radius:50%;padding:0;cursor:pointer;border:2px solid ${col && col.toLowerCase()===cur ? 'var(--ink, #222)' : 'rgba(0,0,0,.25)'};background:${col || 'linear-gradient(135deg,#fff 45%,#d33 45%,#d33 55%,#fff 55%)'}`;
        d.onclick = ev=>{ ev.stopPropagation(); closeMenus(); applyHighlight(E, col); };
        grid.appendChild(d);
      }
      openMenu(b, [{ head:'Highlight' }, { node:grid }]); break;
    }
    case 'list': if(E.editing) setList(E, v); break; // v1.72
    case 'lvl': if(E.editing) listLevel(E, Number(v)); break; // v1.72
    case 'smaller': withText(E, ()=>setFontSize(E, -1)); break;
    case 'bigger': withText(E, ()=>setFontSize(E, 1)); break;
    case 'talign': withText(E, ()=>setAlign(E, v)); break;
    case 'lspace': openMenu(b, lineSpacingItems(E)); break;
    case 'talignmenu': openMenu(b, [['left', 'Align left'], ['center', 'Centre'], ['right', 'Align right']].map(([x, label])=>({ label, run:()=>withText(E, ()=>setAlign(E, x)) }))); break; // v1.87
    case 'listmenu': if(E.editing){ const oid = E.editing.oid; openMenu(b, [{ label:'Bullets', run:()=>setList(E, 'bul') }, { label:'Numbered list', run:()=>setList(E, 'num') }, { label:'Lettered list', run:()=>setList(E, 'let') },
      { label:'Circled numbers', run:()=>setList(E, 'cnum') }, { label:'Circled letters', run:()=>setList(E, 'clet') }, ...listMarkerItems(E, b),
      ...(cellTable(oid) ? [] : ['-', { label:'More indented   Tab', run:()=>listLevel(E, 1) }, { label:'Less indented   Shift+Tab', run:()=>listLevel(E, -1) }])]); } break;
    case 'autospace': autoSpace(E); break;
    case 'tcolor': {
      colourPop(b, { title:'Text colour', scope:'text', cur:'' }, p=>{ if(p.color) applyTextColour(E, p.color); });
      break;
    }
    case 'sym': if(E.editing) openSymbols(E, b); else if(o && hasText(E, o.oid)){ startTextEdit(E, o.oid); openSymbols(E, b); } break;
    // Format: shape, arrange, align, object
    case 'fill': if(o) pickFill(E, o, b); break;
    case 'line': if(o) pickLine(E, o, b); break;
    case 'covercol': setCoverColor(E, coverColourFor(E, v)); break;
    case 'covermore': if(cv) colourPop(b, { title:'Box colour', cur:cv.color, custom:true }, p=>{ if(p.color && p.color!=='none') setCoverColor(E, p.color); }); break;
    case 'arrange': arrange(E, v); break;
    case 'oalign': alignObj(E, v); break;
    case 'dup': if(cv) dupCover(E); else dupObject(E); break;
    // Selection (several objects)
    case 'mstate': setMultiState(E, v); break;
    case 'malign': alignMulti(E, v); break;
    case 'mcopy': copyObjects(E, null); break;
    case 'mbold': massToggle(E, 'bold'); break;
    case 'mitalic': massToggle(E, 'italic'); break;
    case 'munderline': massToggle(E, 'underline'); break;
    case 'mscatter': scatterMulti(E); break;
    // Q&A settings tab
    case 'qamore': case 'qaless': { const q = qaCurrent(E); if(q) qaCount(E, q, a==='qamore' ? 1 : -1); break; }
    case 'qasmaller': case 'qabigger': { const q = qaCurrent(E); if(q) qaTextSize(E, q, a==='qabigger' ? 1 : -1); break; }
    case 'qabold': case 'qaitalic': case 'qaunderline': { const q = qaCurrent(E); if(q) qaToggle(E, q, a.slice(2)); break; }
    case 'qaqcol': case 'qaacol': {
      const q = qaCurrent(E), role = a==='qaqcol' ? 'q' : 'a'; if(!q) break;
      colourPop(b, { title:role==='q' ? 'Question colour' : 'Answer colour', cur:'' }, p=>{ if(p.color && p.color!=='none') qaText(E, q, [role], ()=>{ applyTextColour(E, p.color); const tx = E.editing.tx; if(tx.querySelector('[data-list]')) renumberLists(tx); }); });
      break;
    }
    case 'qatidy': { const q = qaCurrent(E); if(q) qaRelayout(E, q); break; }
    case 'qadel': { const q = qaCurrent(E); if(!q) break; E.sel = null; clearMulti(E);
      change(E, c=>{ const gone = qaBoxesOf(c, q).map(a=>a.id); c.added = c.added.filter(a=>a.qa!==q); for(const g of gone){ delete c.obj['n' + g]; delete c.btn['on' + g]; } }); toast('Q&A deleted · Undo or Ctrl+Z to bring it back'); break; }
    case 'qafont': case 'qasplit': break; // handled on change
    case 'mfont': break; // the font list (handled on change)
    case 'msmaller': massText(E, ()=>setFontSize(E, -1)); break;
    case 'mbigger': massText(E, ()=>setFontSize(E, 1)); break;
    case 'mtcolorq': massText(E, ()=>applyTextColour(E, v)); break;
    case 'mtcolor': colourPop(b, { title:'Text colour', scope:'text boxes', cur:'' }, p=>{ if(p.color) massText(E, ()=>applyTextColour(E, p.color)); }); break;
    case 'mfillq': massFill(E, massStyled(E), v); break;
    case 'mfill': colourPop(b, { title:'Fill', scope:`${massStyled(E).length} objects`, none:true, cur:objStyle(c, massStyled(E)[0]).fill }, p=>{ if(p.color) massFill(E, massStyled(E), p.color); }); break;
    case 'mline': massLine(E, massStyled(E), b); break;
    case 'autofit': autofitBoxes(E); break;
    case 'mdel': deleteMulti(E); break;
    case 'group': groupSel(E); break; // v1.63
    case 'ungroup': ungroupSel(E); break;
    // Galleries
    case 'saveslide': saveSlidesToGallery(E); break;
    case 'saveobj': saveObjectsToGallery(E); break;
    case 'gallery': toggleGallery(E, v); break;
    // Table
    case 'table': tablePicker(E, b); break;
    case 'tbl': tableOp(E, v); break;
    case 'cstate': setCellState(E, v); break;
    case 'ctype': if(E.cell) startTextEdit(E, E.cell); break;
    case 'ttpl': applyTableTemplate(E, v); break;
    case 'ttplmenu': openMenu(b, TABLE_TEMPLATES.map(t=>({ label:t.name, run:()=>applyTableTemplate(E, t.id) }))); break; // v1.87: Style ▾
    case 'chalmenu': openMenu(b, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([x, label])=>({ label, run:()=>cellsAlign(E, x) }))); break;
    case 'cvalmenu': openMenu(b, [['t', 'Top'], ['m', 'Middle'], ['b', 'Bottom']].map(([x, label])=>({ label, run:()=>cellsVAlign(E, x) }))); break;
    case 'tmerge': mergeCells(E); break; // v1.70
    case 'tsplit': unmergeCells(E); break;
    case 'tins': { const at = E.cell ? '' : ' (at the end)';
      openMenu(b, [{ label:'Row above', dis:!E.cell, run:()=>tableOp(E, 'rowabove') }, { label:'Row below' + at, run:()=>tableOp(E, 'rowbelow') }, '-',
        { label:'Column left', dis:!E.cell, run:()=>tableOp(E, 'colleft') }, { label:'Column right' + at, run:()=>tableOp(E, 'colright') }]); break; }
    case 'tdel': { const nr = cellLines(E, true).length, nc = cellLines(E, false).length; // v1.53.2: every row / column with a picked cell
      openMenu(b, [{ label:`Delete ${nr > 1 ? nr + ' rows' : 'row'}`, danger:true, run:()=>deleteCellLines(E, true) }, { label:`Delete ${nc > 1 ? nc + ' columns' : 'column'}`, danger:true, run:()=>deleteCellLines(E, false) }]); break; }
    case 'cbtnreset': if(E.cell){ const id = E.cell; change(E, c=>{ delete c.btn['o' + id]; }); } break;
    // v1.53: Object tab, Set reveal order, Select cells, cover tool
    case 'revmenu': openMenu(b, revealItems(E)); break;
    case 'cellmode': toggleCellMode(E); break;
    case 'ordermode': startOrderMode(E); break;
    case 'orderdone': endOrderMode(E); break;
    case 'orderagain': if(E.orderMode){ E.orderMode.done = []; buildEditOverlay(E); } break;
    case 'orderdefault': { const merge = !!(E.orderMode && E.orderMode.done.length); E.orderMode = null; change(E, c=>{ delete c.order; }, { merge }); toast('Back to the default reveal order'); break; }
    case 'layermenu': openMenu(b, [{ label:'Bring forward', run:()=>arrange(E, 'fwd') }, { label:'Bring to front', run:()=>arrange(E, 'front') }, '-', { label:'Send backward', run:()=>arrange(E, 'bwd') }, { label:'Send to back', run:()=>arrange(E, 'back') }]); break;
    case 'alignmenu': openMenu(b, [['l','Align left'],['c','Centre across'],['r','Align right'],'-',['t','Align top'],['m','Middle'],['b','Align bottom']].map(x=>x==='-' ? x : { label:x[1] + ' (on the slide)', run:()=>alignObj(E, x[0]) })); break;
    case 'drawcol': {
      E.coverCol = v; const id = E.lastCover, col = coverColourFor(E, v);
      if(id && cfgOf(E).covers.some(x=>x.id===id)) change(E, c=>{ const x = c.covers.find(x=>x.id===id); if(x) x.color = col; });
      else buildEditOverlay(E);
      break;
    }
    case 'coverdone': endCoverDraw(E); break;
    case 'arrmenu': openMenu(b, v==='up' ? [{ label:'Bring forward', run:()=>arrange(E, 'fwd') }, { label:'Bring to front', run:()=>arrange(E, 'front') }] : [{ label:'Send backward', run:()=>arrange(E, 'bwd') }, { label:'Send to back', run:()=>arrange(E, 'back') }]); break;
    case 'csel': selectCells(E, v); break;
    case 'csize': cellsSize(E, Number(v)); break;
    case 'cstyle': cellsStyle(E, v); break;
    case 'ccolor': colourPop(b, { title:'Text colour', scope:'cells', cur:'' }, p=>{ if(p.color && p.color!=='none') applyCellColour(E, p.color); }); break;
    // v1.87 quick swatches (spec §10)
    case 'tcolorq': applyTextColour(E, v); break;
    case 'ccolorq': applyCellColour(E, v); break;
    case 'fillq': if(o) setObjStyle(E, o, { fill:v }); break;
    case 'bgq': setBg(E, v==='deck' ? null : v, false); break;
    case 'chal': cellsAlign(E, v); break;
    case 'cval': cellsVAlign(E, v); break;
    case 'cfill': case 'rfill': case 'kfill': case 'tfillall': {
      const scope = { cfill:'cell', rfill:'row', kfill:'col', tfillall:'all' }[a];
      colourPop(b, { title: scope==='all' ? 'Every cell' : scope==='cell' ? 'Cell fill' : scope==='row' ? 'Row fill' : 'Column fill', none:true, custom:true }, p=>{ if(p.color) fillCells(E, scope, p.color); });
      break;
    }
    case 'revert': if(o) change(E, c=>{ if(c.crop) delete c.crop[o.oid]; delete c.geo[o.oid]; delete c.text[o.oid]; delete c.style[o.oid]; }); break;
    case 'boxlang': if(o) setObjStyle(E, o, { lang: BOX_LANG_NEXT[boxLang(E, o.oid)] || 'fr' }); break;
    case 'del': if(cv) deleteCover(E); else deleteSel(E); break;
  }
}
// Layer order (Format → Arrange): saved as cfg.z, bottom to top.
// v1.63: several objects (a group) move as a block, keeping their order among themselves.
function arrange(E, how){
  const o = selObj(E), ids = isMulti(E) ? multiObjs(E).map(x=>x.oid) : o ? [o.oid] : []; if(!ids.length) return;
  const c = cfgOf(E);
  const order = PPTX.layerOrder(E.v.objectIds(E.i).concat((c.added || []).map(a=>'n' + a.id)), c.z || []);
  const block = order.filter(id=>ids.includes(id)); if(!block.length) return;
  const rest = order.filter(id=>!ids.includes(id));
  const first = order.indexOf(block[0]), last = order.indexOf(block[block.length - 1]);
  let at;
  if(how==='front') at = rest.length;
  else if(how==='back') at = 0;
  else if(how==='fwd'){ const above = order.slice(last + 1).find(id=>!ids.includes(id)); at = above==null ? rest.length : rest.indexOf(above) + 1; }
  else { const below = order.slice(0, first).reverse().find(id=>!ids.includes(id)); at = below==null ? 0 : rest.indexOf(below); }
  rest.splice(at, 0, ...block);
  if(rest.join('|')===order.join('|')){ toast(how==='fwd' || how==='front' ? 'Already at the front' : 'Already at the back'); return; }
  change(E, c=>{ c.z = rest; });
}
// Format → Align on slide: against the slide's edges / middle.
function alignObj(E, how){
  const W = E.stage.W, H = E.stage.H, r1 = v=>Math.round(v*10)/10;
  const place = r=>{ if(how==='l') r.x = 0; if(how==='c') r.x = (W - r.w)/2; if(how==='r') r.x = W - r.w; if(how==='t') r.y = 0; if(how==='m') r.y = (H - r.h)/2; if(how==='b') r.y = H - r.h; r.x = r1(r.x); r.y = r1(r.y); return r; };
  const cv = selCoverBox(E), o = cv ? null : selObj(E);
  if(cv){ const r = place({ x:cv.x, y:cv.y, w:cv.w, h:cv.h }); change(E, c=>{ const x = c.covers.find(x=>x.id===cv.id); if(x){ x.x = Math.round(r.x); x.y = Math.round(r.y); } }); return; }
  if(!o) return;
  const r = place({ x:o.x, y:o.y, w:o.w, h:o.h });
  change(E, c=>{ if(o.added){ const a = c.added.find(a=>'n'+a.id===o.oid); if(a){ a.x = r.x; a.y = r.y; } } else c.geo[o.oid] = r; });
}
// Design → Slide size. Moves what the editor saved (and pen marks) with the content.
function shiftSlideData(c, ink, d){
  if(c){
    for(const g of Object.values(c.geo || {})) g.x = Math.round((g.x + d)*10)/10;
    for(const a of (c.added || [])) a.x = Math.round((a.x + d)*10)/10;
    for(const cv of (c.covers || [])) cv.x = Math.round(cv.x + d);
  }
  if(Array.isArray(ink)) for(const s of ink) if(s && Array.isArray(s.pts)) for(let j=0;j<s.pts.length;j+=2) s.pts[j] = Math.round((s.pts[j] + d)*10)/10;
}
async function setRatio(E, ratio){
  if(E.mode!=='pptx') return;
  if(E.resume){ toast('Change the slide size before the lesson, not from the teacher console.', true); return; }
  const nat = deckRatio(E), cur = E.v.ratio || null;
  const target = ratio===nat ? null : ratio;
  if(target===cur) return;
  // v1.53: Undo can't take this back, and it clears the Undo history, so check first.
  if(!(await confirmBox('Change the slide size?', `Every slide becomes ${ratio}. Content stays the same size, centred, so you may need to move things to fit. This clears Undo for this lesson; to go back, choose the other size.`, 'Change size'))) return;
  const l = E.l, mode = E.mode;
  for(const e of E.v.all()){
    const z = E.v.rawSize(e.k), d = ratioDx(z, target) - ratioDx(z, cur);
    if(Math.abs(d) > 0.01) shiftSlideData(l.hides[mode][e.k], l.ink[mode][e.k], d);
  }
  if(target) l.ratio = target; else delete l.ratio;
  E.undo = []; E.redo = []; E.thumbs.clear(); E.sel = null; E.selCover = null;
  saveSoon();
  buildStrip(E); showEdit(E);
  toast(target ? `Slides are now ${target}. Content stays the same size; move things to fit.` : "Back to the deck's own size");
}
// Design → Themes (v1.91): the colours this lesson uses. The deck file isn't changed; it is recoloured as it opens (see themeKey).
function themeMenu(E, b){
  const cur = themeKey(E.l), auto = themeAuto(E.l);
  const cols = k=>{ const t = THEME_COLS.find(t=>t[0]===k); return t ? [t[2], t[3], t[4]] : ['#FFF2CC', '#4472C4', '#FF0000']; };
  const row = (k, name, note)=>{
    const n = el('button', 'th-opt' + (k===cur ? ' on' : ''), `<span class="th-sw">${cols(k).map(c=>`<i style="background:${c}"></i>`).join('')}</span><span class="th-n">${esc(name)}${note ? `<small>${esc(note)}</small>` : ''}</span>${k===cur ? icon('done') : ''}`);
    n.onclick = e=>{ e.stopPropagation(); closeMenus(); setTheme(E, k); };
    return { node:n };
  };
  openMenu(b, [{ head:'Colours for this lesson' }, ...['7','8','9','10','11'].map(k=>row(k, THEME_NAMES[k].replace(/ \(.*$/, ''), k===String(yearOf(E.l.label)) ? "this lesson's year" : '')),
    row('A', 'Gold', 'not year-specific'), '-', row('orig', 'Default', 'as imported')]);
}
// Slides you added in the editor keep their colours as saved; switch the ones that were the old theme's dark / middle / light.
function themeSwap(l, mode, from, to){
  const f = THEME_COLS.find(t=>t[0]===from), t = THEME_COLS.find(t=>t[0]===to);
  if(!f || !t || !l.hides[mode]) return;
  let s = JSON.stringify(l.hides[mode]), n = 0;
  // v1.92: the soft tint themed templates use (between light and middle) swaps too.
  const pairs = [[2, 2], [3, 3], [4, 4]].map(([i, j])=>[f[i], t[j]]);
  if(window.INON) pairs.push([INON.tintOf({ m:f[3], l:f[4] }), INON.tintOf({ m:t[3], l:t[4] })]);
  if(window.INON){ const A = INON.answerSet(f[0]), B = INON.answerSet(t[0]); if(A!==B) for(const p of ['fill', 'ink', 'line']) pairs.push([A[p], B[p]]); } // Year 7's answers are red, the others' green
  for(const [a, b] of pairs){
    const rgb = [1,3,5].map(j=>parseInt(a.slice(j, j+2), 16));
    s = s.replace(new RegExp(a, 'gi'), ()=>{ n++; return b; });
    s = s.replace(new RegExp(`rgb\\(\\s*${rgb[0]}\\s*,\\s*${rgb[1]}\\s*,\\s*${rgb[2]}\\s*\\)`, 'gi'), ()=>{ n++; return b; });
  }
  if(n) l.hides[mode] = JSON.parse(s);
}
// The year group the editor takes its accent from: the lesson's theme (Design → Themes, else its year folder), else the class label ("9B/Fr2" → 9), else 'none'.
function edYear(l){
  const k = themeKey(l), y = yearOf(l.label);
  return ['7', '8', '9', '10', '11'].includes(k) ? k : y>=7 && y<=11 ? String(y) : 'none';
}
// After a theme change: the editor's accent, the year chip and the menus follow.
function syncEdYear(E){
  const ed = $('.editor'); if(!ed) return;
  const yr = edYear(E.l); ed.dataset.yr = yr;
  const chip = $('.ed-yr', ed); if(chip) chip.textContent = yr==='none' ? 'Form' : 'Y' + yr;
}
async function setTheme(E, key){
  if(E.mode!=='pptx') return;
  if(E.resume){ toast('Change the theme before the lesson, not from the teacher console.', true); return; }
  const l = E.l, oldKey = themeKey(l), had = l.theme;
  if(key===themeAuto(l)) delete l.theme; else l.theme = key;
  syncEdYear(E);
  if(themeKey(l)===oldKey){ saveSoon(); renderRibbon(E); return; }
  showLoading('Applying the theme…');
  const was = JSON.stringify(l.hides[E.mode]);
  try{
    themeSwap(l, E.mode, oldKey, key);
    await E.v.reload();
    // Activity slides (Sentence unjumble, Gap fill, Translation) keep their year group on the activity itself: move them to the new colours too.
    const y = yearOf(l.label), yr = ['7','8','9','10','11'].includes(key) ? key : key==='orig' && y>=7 && y<=11 ? String(y) : 'none';
    for(const m of ['pptx', 'pdf']) for(const e of ((l.slides && l.slides[m]) || [])) if(e.src && e.src.act && 'yr' in e.src.act) e.src.act.yr = yr;
  }catch(e){
    console.error(e); hideLoading();
    if(had) l.theme = had; else delete l.theme; l.hides[E.mode] = JSON.parse(was); syncEdYear(E);
    toast("Couldn't change the theme: " + e.message, true); return;
  }
  hideLoading();
  E.undo = []; E.redo = []; E.thumbs.clear(); E.sel = null; E.selCover = null;
  saveSoon();
  buildStrip(E); showEdit(E);
  toast(key==='orig' ? 'Back to the deck as it was imported' : `Theme: ${THEME_NAMES[key].replace(/ \(.*$/, '')} colours`);
}
// Design → Background: a colour for this slide (or the selected slides), or every slide (all).
function setBg(E, color, all){
  const keys = all ? E.v.all().map(e=>e.k) : liveSel(E);
  if(!all && keys.length===1 && keys[0]===E.i){ change(E, c=>{ if(color) c.bg = color; else delete c.bg; }); return; }
  slideOp(E, ()=>{
    const h = E.l.hides[E.mode];
    for(const k of keys){
      if(color) h[k] = Object.assign(h[k] || { obj:{}, covers:[] }, { bg:color });
      else if(h[k]){ delete h[k].bg; const x = h[k]; if(!Object.keys(x.obj || {}).length && !(x.covers || []).length && !x.geo && !x.text && !x.added && !x.style && !x.z && !x.btn && !x.groups) delete h[k]; }
    }
    E.thumbs.clear();
  });
}

/* ---------------- boot ---------------- */
async function boot(){
  if(PUPIL){
    if(document.readyState==='loading') await new Promise(r=>document.addEventListener('DOMContentLoaded', r, { once:true }));
    return window.SVDual.bootPupil();
  }
  if(!store.supported){ renderSplash('unsupported'); return; }
  const st = await store.restore();
  await Planner.restore();
  if(st==='none') renderSplash('setup');
  else if(st==='prompt') renderSplash('reconnect');
  else await loadAndGo();
}
/* ---------- End of lesson (pop-up is in classes.js) ----------
   The next lesson on the same day as l: the first later timetabled slot (not
   Break/Lunch; L&M and PPA only if they have a deck). Returns its meta plus
   deck:true/false, or null if l is the last lesson of the day. */
function nextLessonAfter(l){
  if(!l || !l.date || !Planner.data) return null;
  const d = fromIso(l.date);
  if(Planner.holiday(d)) return null;
  const n = new Date();
  const ref = l.start ? toMin(l.start) : (l.date===iso(today()) ? n.getHours()*60 + n.getMinutes() : -1);
  const cand = [];
  for(const r of dayRows(d)){
    const m = r.meta;
    if(!m.start || r.kind==='slim' || m.id===l.id || toMin(m.start) <= ref) continue;
    const nl = data.lessons[m.id], deck = !!(nl && nl.mode);
    if(!deck && r.kind==='muted' && !isForm(m.label)) continue;
    cand.push(Object.assign({}, m, { deck }));
  }
  cand.sort((a,b)=>toMin(a.start) - toMin(b.start));
  return cand[0] || null;
}
// Leave the lesson being presented and open meta's deck (full screen stays on).
async function continueTo(meta){
  if(view.name!=='present' || !view.P) return;
  const l = ensureLesson(meta);
  if(!l.mode) return goHome(meta.date);
  selDate = fromIso(meta.date);
  exitPresenter(view.P, true, false);
  await openPresenter(l.id, 0);
  if(view.name!=='present') renderDashboard();
}
function goHome(dateIso){
  if(dateIso) selDate = fromIso(dateIso);
  if(view.name==='present' && view.P) exitPresenter(view.P); else renderDashboard();
}

// For tools.js: the saved data (alarms live in data.alarms) and a save trigger.
// For tools.js / classes.js.
window.SVHost = {
  get data(){ return data; },
  save(){ if(data) saveSoon(); },
  saveNow(){ return data ? saveNow() : Promise.resolve(); },
  // The lesson being presented, or null.
  get lesson(){ return view.name==='present' && view.P ? view.P.l : null; },
  lessonTitle,
  // Class names from the planner timetable: every slot except Break, Lunch, L&M and PPA (Form included).
  classLabels(){
    const out = new Set();
    for(const s of ((Planner.data && Planner.data.slots) || [])) if(s.label && !isBreakLike(s.label) && !/^(L&M|PPA)\b/.test(s.label)) out.add(s.label);
    return [...out];
  },
  setView(name){ document.body.classList.remove('presenting'); view = { name }; },
  get viewName(){ return view.name; },
  // Achievement point review (classes.js): a day's timetable rows (any date; holidays give none) and the
  // date the dashboard is showing. Row: { kind:'lesson'|'muted'|'slim', extra, orphan, form, meta:{ id, date, label, start, end, period } }.
  dayRows(dateIso){ const d = fromIso(dateIso); return Planner.holiday(d) ? [] : dayRows(d).map(r=>Object.assign({ form:isForm(r.meta.label) }, r)); },
  get hasTimetable(){ return !!Planner.data; },
  get selDate(){ return iso(selDate); },
  home(){ renderDashboard(); },
  appHeader, dayStrip, weekNav, dayShort, updatePill, // v1.85 shared header
  openSettings, // Settings page (v1.41): openSettings('classes', { cls })
  nextLessonAfter, continueTo, goHome,
  modal, confirmBox, toast, icon,
  // Accents palette for a text field (Game of Chance questions).
  symbols(anchor, field){ symbolPalette(anchor, t=>insertIntoField(field, t)); },
};
// For dual.js: the presenter's insides, so the console can draw the same slides
// and the pupil window can obey the console's commands.
window.SVCore = {
  get data(){ return data; }, get view(){ return view; }, set view(v){ view = v; }, get selDate(){ return selDate; },
  myNote, setMyNote,
  // Replace the data (pupil: from the console; console: the pupil's latest). save: write it to the folder now.
  adopt(d, save, base){ data = normalise(d); undoKeep.clear(); if(!save) pupilBase = SVSync.mainText(data); if(save) return saveNow(base); },
  get pupilBase(){ return pupilBase; }, pupilSent(d){ pupilBase = SVSync.mainText(d); }, syncIn,
  setPlanner(p){ if(p && Planner.valid(p)){ Planner.data = p; Planner.source = 'file'; Planner.needsPerm = false; } },
  get planner(){ return Planner.data; },
  setDate(s){ selDate = fromIso(s); },
  PUPIL, TEST, FsStore, store, Planner, APP_VERSION,
  $, $$, el, esc, icon, toast, modal, iso, today, dateWords, lessonTitle, timeLeft, drawClock, deckStem,
  getDeck, themedFile, presentOrder, refreshOrder, skey, Stage, Ink, beta, mountThumb, editsOf, dropDeleted, dropDeletedEl, objBox, objBoxAll, revealOids, itemRect, hideCfg, flipped, applyVisibility, buildOverlay, revealSeq,
  seqFor, // v1.67: pptx-export.js (the click order for a slide's reveals)
  openPresenter, exitPresenter, showSlide, step, go, setBlur, takeRefresh, applyRefresh, renderDashboard, loadAndGo, renderSplash, saveNow, saveSoon,
  goFullscreen, leaveFullscreen,
  // library.js (Create, Lesson Library)
  dayRows, attachFile, safeName, yearOf, themeKey, fromIso, lastDashMonday, defaultDate, PRINT_PREFIX:'Print - ', confirmBox, showLoading, hideLoading, addDays, mondayOf, DAY_NAMES, MON_NAMES,
  ensureLesson, applyAnimations, deckCache, uniqueName, openMenu, closeMenus, hideCount, LESSONS_DIR, isLibPath,
  get saving(){ return !!saveTimer || saveBusy > 0; },
  appHeader, dayStrip, weekNav, dayShort, updatePill, thumbEl, pillHTML, // v1.85
  // A slide's number in the lesson's order (1 = first), without opening the deck; null if deleted or gone.
  slideNum(l, mode, k){
    k = skey(k);
    const s = l && l.slides && l.slides[mode];
    if(!Array.isArray(s) || !s.length){ const n = l && l.slideCount && l.slideCount[mode]; return typeof k==='number' && (!n || k < n) ? k + 1 : null; }
    const live = s.filter(e=>!e.del), i = live.findIndex(e=>e.k===k);
    return i>=0 ? i + 1 : null;
  },
  openEditor, newSlideKey, slideOp, // activities.js
  symbolPalette, insertIntoField, // gapfill.js (v1.49)
  // sb-editor.js (v1.62): Sentence Builder tab, sentence clipboard, Insert → Sentence Builder
  edHooks:{ addPicture, finishTextEdit, editRange, renderRibbon, selectNew, change, clearMulti, buildEditOverlay },
  set saveHold(f){ saveHold = typeof f==='function' ? f : null; },
};
window.__sv = { get data(){ return data; }, attachFile, openPresenter, openEditor, renderDashboard, store, Planner, setDate:(s)=>{ selDate = fromIso(s); } };
boot().catch(e=>{ console.error(e); app.innerHTML = `<div class="splash"><div class="splash-card"><h1>Something went wrong</h1><p>${esc(e.message)}</p></div></div>`; });
})();
