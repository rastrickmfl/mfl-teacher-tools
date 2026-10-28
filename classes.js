/* =====================================================================
   Slideshow Viewer — class lists and Achievement Points
   Loaded after tools.js. Uses window.SVHost (app.js) and window.SVIsland.

   Saved in viewer-data.json:
     classes    { [class label]: { pupils:[{ id, first, last, removed }] } }
                The label is the timetable label (e.g. "8A/Fr1"). Only the first
                name and the start of the surname (normally one letter) are kept.
     apCats     [{ id, name, color, gone }]   gone = deleted (kept for history)
     points     [{ id, cls, pid, cat, at (ms), lid }]   one entry per point
     apLessons  { [lesson id]: { date, period, label, title, start, end } }
     apLogged   { [lesson id]: { at (ms), n, ids } }   ticked "Logged" in the
                Achievement point review; ids (v1.77) = the lesson's points when ticked
                (n = how many), so points added later show as "N new since logged"
                (unlogged again). Ticks from before 1.77 compare the count only.
     absent     { [lesson id]: { date, ids:[pid] } }   marked in the lesson
                (Random Name → Who's in?); shared by all tools. Kept 14 days.
   Kept apart from data.lessons, so clearing old decks never removes points.

   In a lesson: Tools → Achievement Points, or tap ★ in the island.
   End of lesson (green tick at the bottom of the presenter sidebar, or by
   itself at the lesson's timetabled end time while it's being presented):
   points per pupil, then Continue to next lesson / Back to dashboard.
   Settings → Classes & achievement points (v1.41: was a Classes button and its own page).
   Dashboard: Achievement Points button → the review page (today).
   Dashboard: each day's Achievement point review bar (amber after the day's
   last class-code lesson while anything is unlogged) and a red alert for
   earlier days still to log; the review page itself (view 'apreview').
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad2 = n => String(n).padStart(2,'0');
const uid = ()=> Math.random().toString(36).slice(2,9);
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const toMin = t => { if(!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function niceDate(s){ const [y,m,d] = s.split('-').map(Number); const x = new Date(y, m-1, d); return `${DAY[x.getDay()]} ${d} ${MON[m-1]}`; }
const hhmm = at => { const d = new Date(at); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const collator = new Intl.Collator('en-GB', { sensitivity:'base', numeric:true });

const IC = iconMap({
  star: 'star', x: 'x', check: 'check', back: 'chevron-left',
  list: 'list', trash: 'trash-2', plus: 'plus', up: 'chevron-up',
  down: 'chevron-down', undo: 'undo-2', download: 'download', paste: 'clipboard',
  swap: 'arrow-left-right', done: 'circle-check', next: 'chevron-right', fwd: 'chevron-right',
  alert: 'circle-alert', clip: 'clipboard-check', home: 'house',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- data ---------------- */
const CAT_COLORS = ['#F5B700','#2F5BEA','#1E9E5A','#D93A2B','#8B5CF6','#0E9F9A','#E0458B','#F07A1A','#6B7280','#4F7A28'];
const DEFAULT_CATS = ['Excellent Pronunciation','Excellent Recall','Using Academic Language','Productive in Lesson','Independent Study','Game Winner','Excellent Pair-Work','Role Model']
  .map((name, i)=>({ id:'c' + (i+1), name, color:CAT_COLORS[i] }));

function D(){
  const h = H(); const d = h && h.data; if(!d) return null;
  if(!d.classes || typeof d.classes!=='object' || Array.isArray(d.classes)) d.classes = {};
  if(!Array.isArray(d.apCats)) d.apCats = DEFAULT_CATS.map(c=>Object.assign({}, c));
  if(!Array.isArray(d.points)) d.points = [];
  if(!d.apLessons || typeof d.apLessons!=='object') d.apLessons = {};
  if(!d.absent || typeof d.absent!=='object' || Array.isArray(d.absent)) d.absent = {};
  if(!d.apLogged || typeof d.apLogged!=='object' || Array.isArray(d.apLogged)) d.apLogged = {};
  return d;
}
// Absences, per lesson.
function absentSet(lid){ const d = D(), r = d && d.absent[lid]; return new Set(r ? r.ids : []); }
function setAbsent(l, pid, on){
  const d = D(); if(!d || !l) return;
  const r = d.absent[l.id] || (d.absent[l.id] = { date:l.date || '', ids:[] });
  const s = new Set(r.ids); if(on) s.add(pid); else s.delete(pid);
  r.ids = [...s]; if(!r.ids.length) delete d.absent[l.id];
  save();
  if(ap) paint();
  window.dispatchEvent(new CustomEvent('sv:absent', { detail:{ lid:l.id } }));
}
function pruneAbsent(){
  const d = D(); if(!d) return;
  const cut = new Date(); cut.setDate(cut.getDate() - 14);
  const c = iso(cut); let changed = false;
  for(const [k, r] of Object.entries(d.absent)) if(!r || !r.date || r.date < c){ delete d.absent[k]; changed = true; }
  if(changed) save();
}
const save = ()=> H().save();
const cats = ()=> D().apCats.filter(c=>!c.gone);
const catOf = id => D().apCats.find(c=>c.id===id) || { id, name:'(deleted category)', color:'#6B7280' };
// Form time (v1.66, agreed 2026-10-20): only these categories can be awarded in a form session.
// Other lessons keep every category. Existing points under any category stay in the record.
const FORM_CATS = ['Reading Culture', 'Contribution to PSHE', 'Contribution to Worldly Wise', 'Contribution to Standards', 'Other'];
const isFormLesson = l => /^Form\b/.test((l && l.label) || '');
// Form-only categories are hidden everywhere else.
const catsFor = l => isFormLesson(l) ? cats().filter(c=>FORM_CATS.includes(c.name)) : cats().filter(c=>!FORM_CATS.includes(c.name));
function classRec(cls){ const d = D(); return d.classes[cls] || null; }
const active = cls => ((classRec(cls) || {}).pupils || []).filter(p=>!p.removed);

// Academic year runs from 1 September.
function yearStartOf(s){ const y = Number(s.slice(0,4)), m = Number(s.slice(5,7)); return `${m>=9 ? y : y-1}-09-01`; }
const curYearStart = ()=> yearStartOf(iso(new Date()));
const yearLabel = start => { const y = Number(start.slice(0,4)); return `${y}–${String(y+1).slice(2)}`; };
const awardDate = a => ((D().apLessons[a.lid] || {}).date) || String(a.lid || '').split('|')[0] || iso(new Date(a.at));
const thisYear = a => awardDate(a) >= curYearStart();

// Display names: first name, plus the surname start only when two pupils in
// the class share a first name. includeRemoved: count pupils who've left (history).
function nameMap(cls, includeRemoved){
  const all = ((classRec(cls) || {}).pupils || []);
  const pool = includeRemoved ? all : all.filter(p=>!p.removed);
  const n = new Map();
  for(const p of pool){ const k = p.first.toLowerCase(); n.set(k, (n.get(k) || 0) + 1); }
  const m = new Map();
  for(const p of all){ const dup = (n.get(p.first.toLowerCase()) || 0) > 1; m.set(p.id, dup && p.last ? `${p.first} ${p.last}.` : p.first); }
  return m;
}
const sortPupils = (list, names) => list.slice().sort((a,b)=>collator.compare(names.get(a.id), names.get(b.id)));

// The class list a lesson uses: one chosen for it, else the class named by its timetable label.
function classFor(l){
  if(!l) return null;
  if(l.classKey && classRec(l.classKey)) return l.classKey;
  return classRec(l.label) && active(l.label).length ? l.label : null;
}
function lessonPoints(lid){ return D().points.filter(a=>a.lid===lid); }

// Classes to show: the timetable's, plus any with a list that are no longer on it.
function allClasses(){
  const s = new Set(H().classLabels());
  for(const [k, c] of Object.entries(D().classes)) if(c.pupils && c.pupils.length) s.add(k);
  return [...s].sort(classSort);
}
function classSort(a, b){
  const fa = /^Form\b/.test(a), fb = /^Form\b/.test(b);
  if(fa!==fb) return fa ? 1 : -1;
  return collator.compare(a, b);
}

/* ---------------- pasting names from an MIS export ---------------- */
function cap(w){
  if(!w) return w;
  // ALL CAPS (as some exports give surnames) → Title Case; anything else is left as typed.
  if(w===w.toUpperCase() && /\p{L}/u.test(w)) return w.toLowerCase().replace(/(^|[-' ])(\p{L})/gu, (m, a, b)=>a + b.toUpperCase());
  return w;
}
function cleanCell(s){ return String(s || '').replace(/ /g,' ').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\([^)]*\)/g, '').replace(/\s+/g,' ').trim(); }
const HEADERISH = /^(names?|surnames?|forenames?|first ?names?|last ?names?|pupils?|students?|legal|preferred)\b/i;
// "Smith, Amelia Jane" → Amelia / Smith.  "Amelia Smith" → Amelia / Smith.
function splitName(s){
  s = cleanCell(s); if(!s) return null;
  if(s.includes(',')){
    const i = s.indexOf(','); const sur = s.slice(0, i).trim(), rest = s.slice(i+1).trim();
    if(!rest) return null;
    return { first:cap(rest.split(' ')[0]), sur:cap(sur) };
  }
  const t = s.split(' ');
  return { first:cap(t[0]), sur: t.length>1 ? cap(t[t.length-1]) : '' };
}
function parseNames(text){
  const lines = String(text || '').split(/\r?\n/).map(l=>l.replace(/ /g,' ')).filter(l=>l.trim());
  if(!lines.length) return [];
  const out = [];
  if(lines.some(l=>l.includes('\t'))){
    // Columns copied from Excel / the MIS.
    const rows = lines.map(l=>l.split('\t').map(cleanCell));
    const head = rows[0].map(h=>h.toLowerCase());
    const isHead = head.some(h=>/forename|first|preferred|surname|last|family|legal|^name$|full name|pupil|student/.test(h));
    if(isHead){
      const find = re => head.findIndex(h=>re.test(h));
      const pi = find(/preferred/), fi = head.findIndex((h, i)=>i!==pi && /forename|first/.test(h));
      const si = find(/surname|last|family/);
      const ni = find(/^name$|full name|pupil|student/);
      for(const r of rows.slice(1)){
        const f = (pi>=0 && r[pi]) || (fi>=0 && r[fi]) || '';
        if(f) out.push({ first:cap(f.split(' ')[0]), sur:cap(si>=0 ? (r[si] || '') : '') });
        else if(ni>=0 && r[ni]){ const n = splitName(r[ni]); if(n) out.push(n); }
      }
    } else {
      // No header row: one cell is a whole name; two cells are taken as Surname | Forename (the usual MIS order).
      for(const r of rows){
        const t = r.filter(c=>c && !/^\d+$/.test(c) && !/^\d{1,2}[A-Z]/.test(c));
        if(!t.length) continue;
        if(t.length===1 || t[0].includes(',')){ const n = splitName(t[0]); if(n) out.push(n); }
        else out.push({ first:cap(t[1].split(' ')[0]), sur:cap(t[0]) });
      }
    }
  } else {
    for(const l of lines){
      const s = cleanCell(l);
      if(!s || (HEADERISH.test(s) && s.split(/[ ,]+/).every(w=>HEADERISH.test(w)))) continue;
      const n = splitName(s); if(n) out.push(n);
    }
  }
  return out.filter(n=>n && n.first && /\p{L}/u.test(n.first));
}
// Adds pupils to a class. Keeps the shortest start of the surname that tells
// pupils with the same first name apart (normally one letter). Pupils who'd
// left and are pasted again are brought back rather than added twice.
function addPupils(cls, rows){
  const d = D();
  const rec = d.classes[cls] = d.classes[cls] || { pupils:[] };
  const others = rec.pupils.map(p=>({ p, key:p.last || '' }));
  let added = 0, back = 0, same = 0;
  const fresh = [];
  for(const r of rows){
    const first = r.first.trim(), sur = (r.sur || '').trim();
    if(!first) continue;
    const match = rec.pupils.find(p=>p.first.toLowerCase()===first.toLowerCase() && (p.last || '').toLowerCase()===sur.slice(0, (p.last || '').length).toLowerCase() && (!!p.last===!!sur));
    if(match){ if(match.removed){ match.removed = false; back++; } else same++; continue; }
    fresh.push({ first, sur });
  }
  const pool = others.concat(fresh.map(f=>({ f, key:f.sur })));
  for(const f of fresh){
    let L = Math.min(1, f.sur.length);
    const clash = len => pool.some(o=>o.f!==f && (o.p ? o.p.first : o.f.first).toLowerCase()===f.first.toLowerCase() && o.key.slice(0, len).toLowerCase()===f.sur.slice(0, len).toLowerCase());
    while(L < f.sur.length && clash(L)) L++;
    rec.pupils.push({ id:uid(), first:f.first, last:f.sur.slice(0, L) });
    added++;
  }
  rec.pupils.sort((a,b)=>collator.compare(a.first, b.first) || collator.compare(a.last || '', b.last || ''));
  save();
  return { added, back, same };
}

/* =====================================================================
   In the lesson: the Achievement Points pop-up
   ===================================================================== */
let ap = null; // { back, card, l, cls, cat, sel:Set, sheet, flash }

function open(){
  if(!D()) return;
  const l = H().lesson;
  if(!l){ H().toast('Open a lesson to give achievement points.'); return; }
  closeReview();
  if(!ap){
    const back = el('div', 'ap-back'), card = el('div', 'ap');
    back.appendChild(card); document.body.appendChild(back);
    back.addEventListener('pointerdown', e=>{ if(e.target===back) close(); });
    card.addEventListener('click', onApClick);
    ap = { back, card };
  }
  Object.assign(ap, { l, cls:classFor(l), cat:null, sel:new Set(), sheet:null, flash:'', view:'pupils', prefix:'' });
  paint();
}
function close(){ if(!ap) return; ap.back.remove(); ap = null; paintIsland(); }

function filterPupils(cls, typed){
  const names = nameMap(cls);
  const all = sortPupils(active(cls), names);
  const shown = all.filter(p=>p.first.toLowerCase().startsWith(typed));
  return { names, all, shown };
}
// Letters that can come next after `typed` (anything else is greyed out).
function nextLetters(shown, typed){
  const set = new Set();
  for(const p of shown){ const c = p.first.toLowerCase()[typed.length]; if(c) set.add(c); }
  return set;
}
const KEY_ROWS = [['qwertyuiop', 1], ['asdfghjkl', 2], ['zxcvbnm', 2]];

function paint(){
  if(!ap) return;
  const { l, card } = ap;
  ap.cls = classFor(l);
  if(!ap.cls){ paintChooser(); return; }
  const pts = lessonPoints(l.id);
  const typed = (ap.prefix || '').toLowerCase();
  const { names, all, shown } = filterPupils(ap.cls, typed);
  const next = nextLetters(shown, typed);
  const count = new Map(); for(const a of pts) count.set(a.pid, (count.get(a.pid) || 0) + 1);
  const ab = absentSet(l.id);
  const picked = all.filter(p=>ap.sel.has(p.id));
  const reasons = ap.view === 'reasons';
  const cat = ap.cat ? catOf(ap.cat) : null;
  const fit = tileFit(shown.length);
  const who = picked.map(p=>names.get(p.id)).join(', ');
  card.className = 'ap';

  const chips = picked.length
    ? picked.map(p=>`<span class="ap-chip2">${esc(names.get(p.id))}<button data-unsel="${esc(p.id)}" title="Remove from selection">✕</button></span>`).join('')
    : '<span class="ap-none">Tap names on the right.</span>';

  const keys = KEY_ROWS.map(([row, start], ri) => [...row].map((c, i) =>
      `<button class="ap-key" data-ch="${c}" style="grid-column:${start + i};grid-row:${ri + 1}" ${next.has(c) ? '' : 'disabled'}>${c.toUpperCase()}</button>`).join('')).join('')
    + `<button class="ap-key ap-key-back" data-act="back" style="grid-row:4" ${typed ? '' : 'disabled'}>⌫ Back</button>`;

  const kbd = reasons ? '' : `<div class="ap-kbd">
        <div class="ap-show">${typed ? esc(typed.toUpperCase()) : '<span>Type a first letter</span>'}</div>
        <div class="ap-kbtns"><button class="clk-btn" data-act="back" ${typed ? '' : 'disabled'}>⌫ Back</button><button class="clk-btn" data-act="reset" ${typed ? '' : 'disabled'}>All names</button></div>
        <div class="ap-keys">${keys}</div>
      </div>`;

  const right = reasons
    ? `<p class="ap-msg2">${cat ? `<b style="color:${esc(cat.color)}">${esc(cat.name)}</b> → ${esc(who)}` : `Choose a reason for ${esc(who)}.`}</p>
       <div class="ap-cats ap-cats-grid">${catsFor(l).map(c=>`<button class="ap-cat ${ap.cat===c.id ? 'on' : ''}" data-cat="${esc(c.id)}" style="--c:${esc(c.color)}"><i></i><span>${esc(c.name)}</span></button>`).join('') || `<p class="ap-msg2">No categories for form time. Add ${FORM_CATS.map(esc).join(', ')} under Settings → Point categories.</p>`}</div>`
    : `<div class="ap-pupils ${fit.big ? 'big' : ''}" style="--cols:${fit.cols};--rows:${Math.ceil(shown.length / fit.cols)};--rmax:${fit.row}px;--cmax:${fit.col};--fs:${fit.fs}px">${shown.map(p=>{ const n = count.get(p.id) || 0; return `<button class="ap-p ${ap.sel.has(p.id) ? 'on' : ''} ${ab.has(p.id) ? 'abs' : ''}" data-pid="${esc(p.id)}" ${ab.has(p.id) ? 'title="Marked absent"' : ''}><span class="nm">${esc(names.get(p.id))}</span>${n ? `<span class="ap-badge" data-badge="${esc(p.id)}" title="See or remove points">${n}</span>` : ''}</button>`; }).join('')}</div>`
      + (shown.length ? '' : '<div class="ap-empty">No names start with that. Press ⌫ Back or All names.</div>');

  const sum = ap.flash ? `<span class="ap-flash">${icon('check')}${esc(ap.flash)}</span>`
    : reasons ? (cat ? `<b style="color:${esc(cat.color)}">${esc(cat.name)}</b> → ${esc(who)}` : 'Choose a reason.')
    : (picked.length ? `${picked.length} pupil${picked.length > 1 ? 's' : ''} selected` : 'No pupils selected');

  const foot = reasons
    ? `<button class="clk-btn" data-x="back">← Pupils</button>
       <button class="clk-btn ap-go" data-x="commit" ${cat && picked.length ? '' : 'disabled'} title="Give the points">${icon('check')}${picked.length > 1 ? `Award ${picked.length}` : 'Award'}</button>`
    : `${ap.cat || ap.sel.size || ap.prefix ? `<button class="clk-btn" data-x="clear">Clear</button>` : ''}
       <button class="clk-btn ap-go" data-x="assign" ${picked.length ? '' : 'disabled'} title="Choose a reason for these pupils">${icon('check')}Assign Achievement Point</button>`;

  card.innerHTML = `<div class="ap-head">
      <div class="ap-title">${icon('star', 'ico star')}Achievement Points</div>
      <span class="ap-chip">${esc(ap.cls)}</span>
      <span class="ap-total"><b>${pts.length}</b> this lesson</span>
      <div class="grow"></div>
      <button class="clk-btn" data-x="review">${icon('list')}Review</button>
      <button class="tb-ic" data-x="close" title="Close">${icon('x')}</button>
    </div>
    <div class="ap-body">
      <div class="ap-left">
        <div class="ap-sel"><p class="ap-lbl">Selected (${picked.length})</p><div class="ap-chips">${chips}</div></div>
        ${kbd}
      </div>
      <div class="ap-right">${right}</div>
    </div>
    <div class="ap-foot">
      <div class="ap-sum">${sum}</div>
      ${foot}
    </div>
    ${ap.sheet ? sheetHTML(ap.sheet, names) : ''}`;
}

// Smaller classes get bigger name tiles, centred in the space; 32 still fit without scrolling.
function tileFit(n){
  if(n<=4)  return { cols:2, row:170, col:'320px', fs:32, big:true };
  if(n<=6)  return { cols:3, row:170, col:'300px', fs:30, big:true };
  if(n<=9)  return { cols:3, row:150, col:'300px', fs:28, big:true };
  if(n<=12) return { cols:4, row:130, col:'260px', fs:26, big:true };
  if(n<=16) return { cols:4, row:112, col:'1fr', fs:24, big:true };
  if(n<=20) return { cols:5, row:96, col:'1fr', fs:22, big:false };
  return { cols:5, row:76, col:'1fr', fs:20, big:false };
}
// Extras (cover etc.) and classes without a list: pick which list to use.
function paintChooser(){
  const { l, card } = ap;
  const withList = allClasses().filter(k=>active(k).length);
  card.className = 'ap ap-choose';
  card.innerHTML = `<div class="ap-head"><div class="ap-title">${icon('star', 'ico star')}Achievement Points</div><div class="grow"></div><button class="tb-ic" data-x="close" title="Close">${icon('x')}</button></div>
    <p class="ap-msg">${withList.length ? `There's no class list for <b>${esc(l.label || 'this lesson')}</b>. Which class is this?` : `No class lists yet. Add them on the dashboard: <b>Classes</b>.`}</p>
    <div class="ap-choices">${withList.map(k=>`<button class="clk-btn" data-use="${esc(k)}">${esc(k)}<small>${active(k).length}</small></button>`).join('')}</div>`;
}
function sheetHTML(pid, names){
  const pts = lessonPoints(ap.l.id).filter(a=>a.pid===pid).sort((a,b)=>a.at - b.at);
  return `<div class="ap-sheet-back" data-x="sheet-close"><div class="ap-sheet">
    <div class="ap-head"><div class="ap-title">${esc(names.get(pid) || '')}</div><span class="ap-total"><b>${pts.length}</b> this lesson</span><div class="grow"></div><button class="tb-ic" data-x="sheet-close" title="Back">${icon('x')}</button></div>
    ${pts.length ? `<div class="ap-awards">${pts.map(a=>{ const c = catOf(a.cat); return `<div class="ap-aw"><i style="background:${esc(c.color)}"></i><span class="grow">${esc(c.name)}</span><span class="tm">${hhmm(a.at)}</span><button class="tb-ic sm" data-del="${esc(a.id)}" title="Remove this point">${icon('trash')}</button></div>`; }).join('')}</div>`
      : '<p class="ap-msg">No points this lesson.</p>'}
  </div></div>`;
}
function onApClick(e){
  if(!ap) return;
  const t = e.target;
  const badge = t.closest('[data-badge]');
  if(badge){ ap.sheet = badge.dataset.badge; ap.flash = ''; paint(); return; }
  const b = t.closest('button, [data-x]'); if(!b) return;
  if(b.dataset.x==='sheet-close' && (b.classList.contains('tb-ic') || t===b)){ ap.sheet = null; paint(); return; }
  if(b.dataset.del){ removePoint(b.dataset.del); paint(); return; }
  if(b.dataset.unsel){ ap.sel.delete(b.dataset.unsel); ap.flash = ''; paint(); return; }
  if(b.dataset.use){ ap.l.classKey = b.dataset.use; save(); paint(); paintIsland(); return; }
  if(b.dataset.ch){ pressKey(b.dataset.ch); return; }
  if(b.dataset.act==='back'){ backKey(); return; }
  if(b.dataset.act==='reset'){ ap.prefix = ''; paint(); return; }
  if(b.dataset.cat){ ap.cat = ap.cat===b.dataset.cat ? null : b.dataset.cat; ap.flash = ''; paint(); return; }
  if(b.dataset.pid){
    const id = b.dataset.pid;
    if(ap.sel.has(id)) ap.sel.delete(id); else ap.sel.add(id);
    ap.prefix = ''; ap.flash = ''; paint(); return;   // keyboard resets after a name is tapped
  }
  switch(b.dataset.x){
    case 'close': close(); break;
    case 'clear': ap.cat = null; ap.sel.clear(); ap.prefix = ''; ap.flash = ''; paint(); break;
    case 'assign': toReasons(); break;
    case 'back': ap.view = 'pupils'; ap.cat = null; ap.flash = ''; paint(); break;
    case 'commit': commit(); break;
    case 'review': { const l = ap.l; close(); showReview(l.id); break; }
  }
}
// Keyboard (letters, Back) works on the pupils step only.
function pressKey(ch){
  if(!ap || ap.view !== 'pupils' || !ap.cls) return;
  const typed = ap.prefix || '';
  if(typed.length >= 3) return;
  const { shown } = filterPupils(ap.cls, typed.toLowerCase());
  if(!nextLetters(shown, typed.toLowerCase()).has(ch)) return;
  ap.prefix = typed + ch; ap.flash = ''; paint();
}
function backKey(){
  if(!ap || ap.view !== 'pupils') return;
  ap.prefix = (ap.prefix || '').slice(0, -1); paint();
}
function toReasons(){
  if(!ap || !ap.sel.size) return;
  ap.view = 'reasons'; ap.cat = null; ap.flash = ''; paint();
}
function commit(){
  if(!ap || ap.view !== 'reasons' || !ap.cat || !ap.sel.size) return;
  const d = D(), l = ap.l, names = nameMap(ap.cls), now = Date.now();
  const ids = sortPupils(active(ap.cls).filter(p=>ap.sel.has(p.id)), names).map(p=>p.id);
  for(const pid of ids) d.points.push({ id:uid(), cls:ap.cls, pid, cat:ap.cat, at:now, lid:l.id });
  d.apLessons[l.id] = { date:l.date, period:l.period || '', label:l.label || '', title:H().lessonTitle(l), start:l.start || '', end:l.end || '' };
  save();
  const c = catOf(ap.cat);
  ap.flash = `${c.name}: ${ids.map(id=>names.get(id)).join(', ')}`;
  ap.cat = null; ap.sel.clear(); ap.prefix = ''; ap.view = 'pupils';
  paint(); paintIsland();
  clearTimeout(ap.flashT); ap.flashT = setTimeout(()=>{ if(ap && ap.flash){ ap.flash = ''; paint(); } }, 4000);
}

// One point to one pupil (Random Name → Award). Returns the category, or null.
function awardOne(l, pid, catId){
  if(!l || !D()) return null;
  if(!catsFor(l).some(c=>c.id===catId)) return null;   // not allowed for this lesson (form time)
  const cls = classFor(l); if(!cls) return null;
  const d = D();
  d.points.push({ id:uid(), cls, pid, cat:catId, at:Date.now(), lid:l.id });
  d.apLessons[l.id] = { date:l.date, period:l.period || '', label:l.label || '', title:H().lessonTitle(l), start:l.start || '', end:l.end || '' };
  save();
  if(ap) paint();
  paintIsland();
  return catOf(catId);
}
function removePoint(id){
  const d = D(), i = d.points.findIndex(a=>a.id===id); if(i<0) return;
  const lid = d.points[i].lid;
  d.points.splice(i, 1);
  if(!d.points.some(a=>a.lid===lid)){ delete d.apLessons[lid]; delete d.apLogged[lid]; }
  save(); paintIsland();
}

/* ---------------- island: ★ points this lesson ---------------- */
function paintIsland(){
  const I = window.SVIsland, h = H(); if(!I || !h || !D()) return;
  const l = h.lesson;
  if(!l || !classFor(l)){ I.remove('points'); return; }
  I.set('points', `<span class="isl-read" data-pts title="Achievement points">${icon('star', 'ico isl-star')}<span class="isl-t isl-n">${lessonPoints(l.id).length}</span></span>`, 0);
}
document.addEventListener('pointerdown', e=>{
  const b = e.target.closest && e.target.closest('.island [data-pts]'); if(!b) return;
  e.preventDefault(); e.stopPropagation(); open();
}, true);
window.addEventListener('sv:present', ()=>{ pruneAbsent(); paintIsland(); });
window.addEventListener('sv:leave', ()=>{ close(); if(window.SVIsland) window.SVIsland.remove('points'); });

/* =====================================================================
   Lesson review by category (from the AP pop-up)
   ===================================================================== */
// A lesson's points grouped by category, repeats shown once with a count.
function groupLesson(lid){
  const pts = lessonPoints(lid); if(!pts.length) return [];
  const byCat = new Map();
  for(const a of pts){ if(!byCat.has(a.cat)) byCat.set(a.cat, []); byCat.get(a.cat).push(a); }
  const order = D().apCats.map(c=>c.id);
  return [...byCat.entries()].sort((a,b)=>{ const x = order.indexOf(a[0]), y = order.indexOf(b[0]); return (x<0 ? 99 : x) - (y<0 ? 99 : y); }).map(([cat, list])=>{
    const per = new Map();
    for(const a of list){ const k = a.cls + '|' + a.pid; const v = per.get(k) || { cls:a.cls, pid:a.pid, n:0 }; v.n++; per.set(k, v); }
    const items = [...per.values()].map(v=>{
      const p = ((classRec(v.cls) || {}).pupils || []).find(p=>p.id===v.pid);
      return { name: p ? nameMap(v.cls, true).get(p.id) : '(pupil deleted)', n:v.n, left: !p || !!p.removed };
    }).sort((a,b)=>collator.compare(a.name, b.name));
    return { cat:catOf(cat), items, total:list.length };
  });
}
function groupsHTML(groups){
  if(!groups.length) return '<p class="ap-msg">No points given in this lesson.</p>';
  return groups.map(g=>`<div class="rv-g" style="--c:${esc(g.cat.color)}">
    <div class="rv-h"><i></i>${esc(g.cat.name)}<span>${g.total}</span></div>
    <div class="rv-names">${g.items.map(it=>`<span class="rv-n ${it.left ? 'left' : ''}" ${it.left ? 'title="No longer in this class"' : ''}>${esc(it.name)}${it.n>1 ? `<b>×${it.n}</b>` : ''}</span>`).join('')}</div>
  </div>`).join('');
}
function lessonLine(lid){
  const m = D().apLessons[lid] || {};
  return [m.label, m.period, m.title].filter(Boolean).map(esc).join(' · ');
}
let rv = null;
function showReview(lid, auto){
  closeReview();
  const back = el('div', 'ap-back rv-back'), card = el('div', 'ap rv');
  const total = lessonPoints(lid).length;
  card.innerHTML = `<div class="ap-head"><div class="ap-title">${icon('star', 'ico star')}${auto ? 'End of lesson' : 'Lesson review'}</div><span class="ap-total"><b>${total}</b> point${total===1 ? '' : 's'}</span><div class="grow"></div><button class="tb-ic" data-x="close" title="Close">${icon('x')}</button></div>
    <div class="rv-sub">${lessonLine(lid)}</div>
    <div class="rv-body">${groupsHTML(groupLesson(lid))}</div>
    <div class="ap-foot"><div class="ap-sum">Saved. Find it later on the dashboard under <b>Classes → History</b>.</div><button class="clk-btn primary" data-x="close">Done</button></div>`;
  back.appendChild(card); document.body.appendChild(back);
  back.addEventListener('pointerdown', e=>{ if(e.target===back) closeReview(); });
  card.addEventListener('click', e=>{ if(e.target.closest('[data-x=close]')) closeReview(); });
  rv = { back, lid };
}
function closeReview(){ if(rv){ rv.back.remove(); rv = null; } }

/* =====================================================================
   End of lesson: name cards for pupils with at least one point this lesson
   (most first), then Continue to next lesson (or Back to dashboard).
   ===================================================================== */
function pupilTotals(lid){
  const per = new Map();
  for(const a of lessonPoints(lid)){ const k = a.cls + '|' + a.pid; const v = per.get(k) || { cls:a.cls, pid:a.pid, n:0 }; v.n++; per.set(k, v); }
  return [...per.values()].map(v=>{
    const p = ((classRec(v.cls) || {}).pupils || []).find(p=>p.id===v.pid);
    return { name: p ? nameMap(v.cls, true).get(p.id) : '(pupil deleted)', n:v.n, left: !p || !!p.removed };
  }).sort((a,b)=>(b.n - a.n) || collator.compare(a.name, b.name));
}
let en = null;
const ended = new Set();   // lessons whose End of lesson has been shown (no auto pop-up after that)
function showEnd(l, auto){
  if(!l) return;
  closeEnd(); closeReview(); close();
  ended.add(l.id);
  const h = H();
  const rows = pupilTotals(l.id), total = rows.reduce((t, r)=>t + r.n, 0);
  const nx = h.nextLessonAfter ? h.nextLessonAfter(l) : null;
  const when = m => [m.period, m.label, m.start].filter(Boolean).map(esc).join(' · ');
  let go;
  if(nx && nx.deck) go = `<button class="clk-btn ap-go el-go" data-x="next">${icon('next')}<span class="el-go-t">Continue to next lesson<small>${when(nx)}</small></span></button>`;
  else if(nx) go = `<button class="clk-btn ap-go el-go" data-x="home">${icon('home')}<span class="el-go-t">Go to dashboard<small>${when(nx)}: no deck yet</small></span></button>`;
  else go = `<button class="clk-btn ap-go el-go" data-x="home">${icon('home')}<span class="el-go-t">Back to dashboard<small>Last lesson of the day</small></span></button>`;
  const line = [l.period, l.label, h.lessonTitle ? h.lessonTitle(l) : ''].filter(Boolean).map(esc).join(' · ');
  const back = el('div', 'ap-back el-back'), card = el('div', 'ap el');
  card.innerHTML = `<div class="ap-head"><div class="ap-title">${icon('done', 'ico el-tick')}End of lesson</div><span class="ap-total"><b>${total}</b> point${total===1 ? '' : 's'}${rows.length ? ` · <b>${rows.length}</b> pupil${rows.length===1 ? '' : 's'}` : ''}</span><div class="grow"></div><button class="tb-ic" data-x="close" title="Back to lesson">${icon('x')}</button></div>
    ${line ? `<div class="rv-sub">${line}</div>` : ''}
    <div class="el-body">${rows.length
      ? `<div class="el-grid">${rows.map(r=>`<div class="el-card ${r.left ? 'left' : ''}"><span class="nm">${esc(r.name)}</span><span class="ap-badge">${r.n}</span></div>`).join('')}</div>`
      : `<p class="ap-msg">${icon('star', 'ico star')}No achievement points this lesson.</p>`}</div>
    <div class="ap-foot"><button class="clk-btn" data-x="close">${icon('back')}Back to lesson</button><div class="grow"></div>${go}</div>`;
  back.appendChild(card); document.body.appendChild(back);
  back.addEventListener('pointerdown', e=>{ if(e.target===back) closeEnd(); });
  card.addEventListener('click', e=>{
    const b = e.target.closest('[data-x]'); if(!b) return;
    const x = b.dataset.x;
    if(x==='close') closeEnd();
    else if(x==='next'){ closeEnd(); h.continueTo(nx); }
    else if(x==='home'){ closeEnd(); h.goHome(l.date); }
  });
  en = { back, lid:l.id, auto:!!auto };
}
function closeEnd(){ if(en){ en.back.remove(); en = null; } }
window.addEventListener('sv:leave', ()=>closeEnd());

// At the timetabled end time of the lesson being presented, show End of lesson once
// (not if the button was already used for that lesson).
let lastMin = null;
setInterval(()=>{
  const d = D(); if(!d) return;
  const n = new Date(), nowM = n.getHours()*60 + n.getMinutes(), today = iso(n);
  if(lastMin==null || nowM < lastMin){ lastMin = nowM; return; }
  if(nowM===lastMin) return;
  const l = H().lesson;
  if(l && l.date===today && l.end && !ended.has(l.id)){
    const e = toMin(l.end);
    if(e > lastMin && e <= nowM) showEnd(l, true);
  }
  lastMin = nowM;
}, 1000);

// While a pop-up is open, keys stay with it (the clicker mustn't change slide behind it).
window.addEventListener('keydown', e=>{
  if(!ap && !rv && !en) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key==='F11') return;
  e.stopPropagation();
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' '].includes(e.key)) e.preventDefault();
  if(rv){ if(['Escape','Enter'].includes(e.key)){ e.preventDefault(); closeReview(); } return; }
  if(en){ if(e.key==='Escape'){ e.preventDefault(); closeEnd(); } return; }
  if(e.key==='Escape'){ e.preventDefault(); if(ap.sheet){ ap.sheet = null; paint(); } else if(ap.view==='reasons'){ ap.view = 'pupils'; ap.cat = null; paint(); } else close(); }
  else if(e.key==='Enter'){ e.preventDefault(); if(ap.view==='reasons') commit(); else toReasons(); }
  else if(/^[a-z]$/i.test(e.key)) pressKey(e.key.toLowerCase());
  else if(e.key==='Backspace') backKey();
}, true);

/* =====================================================================
   Dashboard page: Classes & achievement points
   ===================================================================== */
let pg = null; // { cls, tab:'pupils'|'history', sort:'name'|'points', lid, draft }
// v1.41: Classes lives in Settings (app.js draws the page, then calls mountIn with the section's box).
function openPage(cls){
  if(!D()) return;
  if(H().openSettings){ H().openSettings('classes', { cls }); return; }
}
function mountIn(host, cls){
  if(!D() || !host) return;
  const list = allClasses();
  pg = { cls: cls || (pg && pg.cls && list.includes(pg.cls) ? pg.cls : list[0] || null), tab:(pg && pg.tab) || 'pupils', sort:(pg && pg.sort) || 'name', lid:null, draft:'', host };
  render();
}
function refresh(){ if(H().viewName==='apreview' && rp) renderReview(); else if(pg && H().viewName==='settings' && H().openSettings) H().openSettings('classes', { cls:pg.cls }); }
function yearPoints(cls){ return D().points.filter(a=>a.cls===cls && thisYear(a)); }

function render(){
  if(!pg || !pg.host || !pg.host.isConnected) return;
  const app = pg.host;
  const d = D(), list = allClasses();
  if(pg.cls && !list.includes(pg.cls)) pg.cls = list[0] || null;
  const oldPts = d.points.filter(a=>!thisYear(a));
  const oldYears = [...new Set(oldPts.map(a=>yearStartOf(awardDate(a))))].sort();
  app.innerHTML = `<div class="cls-page cls-in-set">
    <div class="set-head">
      <h2>Classes &amp; achievement points</h2>
      <button class="btn" data-c="cats">Point categories</button>
      <button class="btn" data-c="csv" title="Every point this year, as a spreadsheet">${icon('download')}Export ${yearLabel(curYearStart())}</button>
    </div>
    ${oldPts.length ? `<div class="banner warn"><span class="grow">${oldPts.length} point${oldPts.length>1 ? 's' : ''} from ${oldYears.map(yearLabel).join(', ')} still stored. Download them, then clear them for the new year.</span><button class="btn sm" data-c="csv-old">${icon('download')}Download</button><button class="btn sm danger" data-c="clear-old">Clear</button></div>` : ''}
    ${!list.length ? `<div class="empty">No classes yet. Link your planner timetable on the dashboard and its classes appear here.</div>` : `
    <div class="cls-layout">
      <nav class="cls-list">${list.map(k=>{ const n = active(k).length, p = yearPoints(k).length; return `<button class="cls-item ${k===pg.cls ? 'on' : ''}" data-cls="${esc(k)}"><span class="cn">${esc(k)}</span><span class="cs">${n ? `${n} pupil${n>1 ? 's' : ''} · ${p} pt${p===1 ? '' : 's'}` : 'No list yet'}</span></button>`; }).join('')}</nav>
      <section class="cls-main">${pg.cls ? mainHTML() : ''}</section>
    </div>`}
  </div>`;
  const ta = $('.cls-paste textarea', app);
  if(ta){ ta.value = pg.draft || ''; ta.addEventListener('input', ()=>{ pg.draft = ta.value; }); }
}
function mainHTML(){
  const cls = pg.cls, rec = classRec(cls), hasAny = rec && rec.pupils && rec.pupils.length;
  const head = `<div class="cls-head"><h2>${esc(cls)}</h2>${hasAny ? `<span class="seg"><button data-c="tab" data-v="pupils" class="${pg.tab==='pupils' ? 'on' : ''}">Pupils</button><button data-c="tab" data-v="history" class="${pg.tab==='history' ? 'on' : ''}">History</button></span>` : ''}</div>`;
  if(!hasAny) return head + pasteHTML(true);
  return head + (pg.tab==='history' ? historyHTML() : pupilsHTML());
}
function pasteHTML(first){
  return `<div class="cls-paste">
    ${first ? `<ol class="cls-steps"><li>Type in the pupils' names, one pupil per line. Just use first names, or first name + initial if there is more than one pupil with the same name (e.g. Alex A, Alex B).</li><li>Paste the names from a spreadsheet. If surnames are included, they will automatically be removed and replaced with an initial if there is more than one pupil with the same name.</li></ol>` : ''}
    <textarea placeholder="Amelia&#10;Alex A&#10;Alex B&#10;…" spellcheck="false"></textarea>
    <div class="row-btns"><span class="note">Only the first name and the first letter of the surname are saved. The letter shows only when two pupils share a first name.</span><button class="btn primary" data-c="preview">Check names…</button></div>
  </div>`;
}
function pupilsHTML(){
  const cls = pg.cls, rec = classRec(cls);
  const names = nameMap(cls), namesAll = nameMap(cls, true);
  const pts = yearPoints(cls);
  const tot = new Map(), last = new Map(), byCat = new Map();
  for(const a of pts){ tot.set(a.pid, (tot.get(a.pid) || 0) + 1); const ad = awardDate(a); if(!last.has(a.pid) || ad > last.get(a.pid)) last.set(a.pid, ad); const m = byCat.get(a.pid) || new Map(); m.set(a.cat, (m.get(a.cat) || 0) + 1); byCat.set(a.pid, m); }
  let list = sortPupils(rec.pupils.filter(p=>!p.removed), names);
  if(pg.sort==='points') list.sort((a,b)=>(tot.get(b.id) || 0) - (tot.get(a.id) || 0) || collator.compare(names.get(a.id), names.get(b.id)));
  const gone = sortPupils(rec.pupils.filter(p=>p.removed), namesAll);
  return `<div class="cls-tools">
      <button class="btn" data-c="add">${icon('plus')}Add pupil</button>
      <button class="btn" data-c="paste-more">${icon('paste')}Paste more names</button>
      <div class="grow"></div>
      <span class="lbl">Sort</span><span class="seg"><button data-c="sort" data-v="name" class="${pg.sort==='name' ? 'on' : ''}">Name</button><button data-c="sort" data-v="points" class="${pg.sort==='points' ? 'on' : ''}">Points</button></span>
    </div>
    <div class="cls-table">
      <div class="cls-tr th"><span>Pupil</span><span>Points ${yearLabel(curYearStart())}</span><span>Last point</span><span></span></div>
      ${list.map(p=>{ const n = tot.get(p.id) || 0, cm = byCat.get(p.id); return `<div class="cls-tr">
        <span class="pn">${esc(names.get(p.id))}</span>
        <span class="pt"><b class="${n ? '' : 'z'}">${n}</b>${cm ? `<span class="dots">${[...cm.entries()].map(([c, k])=>{ const x = catOf(c); return `<i style="background:${esc(x.color)}" title="${esc(x.name)}: ${k}"></i>`.repeat(Math.min(k, 12)); }).join('')}</span>` : ''}</span>
        <span class="lp">${last.get(p.id) ? esc(niceDate(last.get(p.id))) : '—'}</span>
        <span><button class="icon-btn" data-c="remove" data-pid="${esc(p.id)}" title="Remove from class">${icon('trash')}</button></span>
      </div>`; }).join('')}
    </div>
    ${gone.length ? `<details class="cls-gone"><summary>No longer in this class (${gone.length})</summary>${gone.map(p=>`<div class="cls-tr gone"><span class="pn">${esc(namesAll.get(p.id))}</span><span class="pt"><b>${tot.get(p.id) || 0}</b></span><span></span><span><button class="btn sm" data-c="restore" data-pid="${esc(p.id)}">${icon('undo')}Restore</button></span></div>`).join('')}</details>` : ''}`;
}
function historyHTML(){
  const d = D(), cls = pg.cls;
  const pts = yearPoints(cls);
  if(pg.lid){
    const m = d.apLessons[pg.lid] || {};
    const groups = groupLesson(pg.lid);
    const n = lessonPoints(pg.lid).length;
    return `<div class="cls-tools"><button class="btn" data-c="lid-back">${icon('back')}All lessons</button></div>
      <div class="hist-detail"><div class="hd-h"><div><div class="hd-t">${esc(m.date ? niceDate(m.date) : '')}${m.period ? ' · ' + esc(m.period) : ''}</div><div class="hd-s">${esc(m.title || '')}</div></div><span class="tag accent">${n} point${n===1 ? '' : 's'}</span></div>
      <div class="rv-light">${groupsHTML(groups)}</div></div>`;
  }
  const by = new Map();
  for(const a of pts){ by.set(a.lid, (by.get(a.lid) || 0) + 1); }
  const lids = [...by.keys()].sort((a,b)=>{ const x = d.apLessons[a] || {}, y = d.apLessons[b] || {}; return (awardDate({ lid:b }) + (y.start || '')).localeCompare(awardDate({ lid:a }) + (x.start || '')); });
  if(!lids.length) return `<div class="empty">No points given to ${esc(cls)} yet this year.</div>`;
  return `<div class="hist-list">${lids.map(lid=>{ const m = d.apLessons[lid] || {}; const n = by.get(lid); return `<button class="hist-row" data-c="lid" data-lid="${esc(lid)}">
      <span class="hd">${esc(m.date ? niceDate(m.date) : awardDate({ lid }))}</span><span class="hp">${esc(m.period || '')}</span><span class="ht">${esc(m.title || '')}</span><span class="tag accent">${n} pt${n===1 ? '' : 's'}</span></button>`; }).join('')}</div>`;
}

document.addEventListener('click', async e=>{
  if(!pg || !$('.cls-page')) return;
  const b = e.target.closest('[data-c], [data-cls]'); if(!b || !b.closest('.cls-page')) return;
  if(b.dataset.cls){ pg.cls = b.dataset.cls; pg.tab = 'pupils'; pg.lid = null; pg.draft = ''; render(); return; }
  const h = H(), c = b.dataset.c;
  switch(c){
    case 'home': pg = null; h.home(); break;
    case 'tab': pg.tab = b.dataset.v; pg.lid = null; render(); break;
    case 'sort': pg.sort = b.dataset.v; render(); break;
    case 'lid': pg.lid = b.dataset.lid; render(); break;
    case 'lid-back': pg.lid = null; render(); break;
    case 'preview': previewNames(pg.cls, pg.draft); break;
    case 'paste-more': pasteModal(pg.cls); break;
    case 'add': addModal(pg.cls); break;
    case 'remove': {
      const p = classRec(pg.cls).pupils.find(p=>p.id===b.dataset.pid); if(!p) return;
      if(!(await h.confirmBox(`Remove ${nameMap(pg.cls).get(p.id)}?`, 'They come off the class list. Their points stay in the history, greyed out. You can restore them later.', 'Remove', true))) return;
      p.removed = true; save(); render(); break;
    }
    case 'restore': { const p = classRec(pg.cls).pupils.find(p=>p.id===b.dataset.pid); if(p){ p.removed = false; save(); render(); } break; }
    case 'cats': catsModal(); break;
    case 'csv': download(`Achievement points ${yearLabel(curYearStart())}.csv`, csv(D().points.filter(thisYear))); break;
    case 'csv-old': download(`Achievement points before ${yearLabel(curYearStart())}.csv`, csv(D().points.filter(a=>!thisYear(a)))); break;
    case 'clear-old': {
      const d = D(), old = d.points.filter(a=>!thisYear(a));
      if(!(await h.confirmBox('Clear last year’s points?', `Deletes ${old.length} point${old.length>1 ? 's' : ''} from before September ${curYearStart().slice(0,4)}. Download them first if you want a copy.`, 'Clear', true))) return;
      d.points = d.points.filter(thisYear);
      const keep = new Set(d.points.map(a=>a.lid));
      for(const lid of Object.keys(d.apLessons)) if(!keep.has(lid)) delete d.apLessons[lid];
      for(const lid of Object.keys(d.apLogged)) if(!keep.has(lid)) delete d.apLogged[lid];
      save(); render(); h.toast('Cleared'); break;
    }
  }
});

/* ---------------- name preview / add / paste modals ---------------- */
function previewNames(cls, text){
  const rows = parseNames(text);
  if(!rows.length){ H().toast('No names found. Paste one pupil per line.', true); return; }
  let swapped = false;
  H().modal(`<h2>Check names · ${esc(cls)}</h2><p><span data-n></span> pupils found. Fix anything that's wrong; only the first name and the surname's first letter are kept.</p>
    <div class="np-tools"><button class="btn sm" data-a="swap">${icon('swap')}Swap first name / surname</button></div>
    <div class="np-list"></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Add pupils</button></div>`, (m, closeM)=>{
    const listEl = m.querySelector('.np-list');
    const draw = ()=>{
      listEl.innerHTML = `<div class="np-r th"><span>First name</span><span>Surname</span><span></span></div>` + rows.map((r, i)=>`<div class="np-r"><input type="text" data-i="${i}" data-f="first" value="${esc(r.first)}"><input type="text" data-i="${i}" data-f="sur" value="${esc(r.sur)}"><button class="icon-btn" data-del="${i}" title="Leave out">${icon('x')}</button></div>`).join('');
      m.querySelector('[data-n]').textContent = rows.length;
    };
    draw();
    listEl.addEventListener('input', e=>{ const t = e.target; if(t.dataset.i!=null) rows[Number(t.dataset.i)][t.dataset.f] = t.value; });
    m.addEventListener('click', e=>{
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.del!=null){ rows.splice(Number(b.dataset.del), 1); draw(); return; }
      if(b.dataset.a==='swap'){ swapped = !swapped; for(const r of rows){ const f = r.first; r.first = (r.sur || '').split(' ')[0]; r.sur = f; } draw(); return; }
      if(b.dataset.a==='no'){ closeM(); return; }
      if(b.dataset.a==='ok'){
        const good = rows.map(r=>({ first:cap(r.first.trim().split(/\s+/)[0] || ''), sur:cap((r.sur || '').trim()) })).filter(r=>r.first);
        if(!good.length) return;
        const res = addPupils(cls, good);
        closeM(); pg.draft = ''; render();
        H().toast([res.added && `${res.added} added`, res.back && `${res.back} restored`, res.same && `${res.same} already on the list`].filter(Boolean).join(' · ') || 'No changes');
      }
    });
  });
}
function pasteModal(cls){
  H().modal(`<h2>Paste names · ${esc(cls)}</h2><p>New pupils are added to the list. Anyone already on it is skipped.</p><textarea class="np-ta" spellcheck="false" placeholder="Smith, Amelia"></textarea><div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Check names…</button></div>`, (m, closeM)=>{
    const ta = m.querySelector('textarea'); ta.focus();
    m.querySelector('[data-a=no]').onclick = closeM;
    m.querySelector('[data-a=ok]').onclick = ()=>{ const t = ta.value; closeM(); previewNames(cls, t); };
  });
}
function addModal(cls){
  H().modal(`<h2>Add pupil · ${esc(cls)}</h2><p>Only the first letter of the surname is kept.</p>
    <div class="np-r add"><input type="text" placeholder="First name" data-f="first"><input type="text" placeholder="Surname" data-f="sur"></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Add</button></div>`, (m, closeM)=>{
    const [f, s] = m.querySelectorAll('input'); f.focus();
    const ok = ()=>{
      const first = cap(f.value.trim().split(/\s+/)[0] || ''); if(!first){ f.focus(); return; }
      const res = addPupils(cls, [{ first, sur:cap(s.value.trim()) }]);
      closeM(); render(); H().toast(res.added ? `${first} added` : res.back ? `${first} restored` : `${first} is already on the list`);
    };
    m.querySelector('[data-a=ok]').onclick = ok; m.querySelector('[data-a=no]').onclick = closeM;
    [f, s].forEach(i=>i.onkeydown = e=>{ if(e.key==='Enter') ok(); });
  });
}
function catsModal(){
  const d = D();
  const work = d.apCats.filter(c=>!c.gone).map(c=>Object.assign({}, c));
  H().modal(`<h2>Point categories</h2><p>The order here is the order in the lesson. Removing a category keeps the points already given under it.</p><div class="cat-list"></div>
    <div class="np-tools"><button class="btn sm" data-a="add">${icon('plus')}Add category</button></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Save</button></div>`, (m, closeM)=>{
    const listEl = m.querySelector('.cat-list');
    const draw = ()=>{ listEl.innerHTML = work.map((c, i)=>`<div class="cat-r"><button class="cat-dot" data-col="${i}" style="background:${esc(c.color)}" title="Change colour"></button><input type="text" maxlength="40" data-i="${i}" value="${esc(c.name)}"><button class="icon-btn" data-mv="-1" data-i="${i}" ${i ? '' : 'disabled'} title="Move up">${icon('up')}</button><button class="icon-btn" data-mv="1" data-i="${i}" ${i<work.length-1 ? '' : 'disabled'} title="Move down">${icon('down')}</button><button class="icon-btn" data-rm="${i}" title="Remove">${icon('trash')}</button></div>`).join(''); };
    draw();
    listEl.addEventListener('input', e=>{ const t = e.target; if(t.dataset.i!=null) work[Number(t.dataset.i)].name = t.value; });
    m.addEventListener('click', e=>{
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.col!=null){ const c = work[Number(b.dataset.col)]; c.color = CAT_COLORS[(CAT_COLORS.indexOf(c.color) + 1) % CAT_COLORS.length]; draw(); return; }
      if(b.dataset.mv!=null){ const i = Number(b.dataset.i), j = i + Number(b.dataset.mv); [work[i], work[j]] = [work[j], work[i]]; draw(); return; }
      if(b.dataset.rm!=null){ work.splice(Number(b.dataset.rm), 1); draw(); return; }
      if(b.dataset.a==='add'){ const used = new Set(work.map(c=>c.color)); work.push({ id:'c' + uid(), name:'', color:CAT_COLORS.find(c=>!used.has(c)) || CAT_COLORS[work.length % CAT_COLORS.length] }); draw(); const ins = listEl.querySelectorAll('input'); ins[ins.length-1].focus(); return; }
      if(b.dataset.a==='no'){ closeM(); return; }
      if(b.dataset.a==='ok'){
        const keep = work.filter(c=>c.name.trim()).map(c=>Object.assign(c, { name:c.name.trim() }));
        if(!keep.length){ H().toast('Keep at least one category.', true); return; }
        const ids = new Set(keep.map(c=>c.id));
        // Removed categories stay (marked gone) if points use them, so history keeps their name.
        const used = new Set(d.points.map(a=>a.cat));
        const gone = d.apCats.filter(c=>!ids.has(c.id) && used.has(c.id)).map(c=>Object.assign(c, { gone:true }));
        d.apCats = keep.map(c=>{ delete c.gone; return c; }).concat(gone);
        save(); closeM(); render();
      }
    });
  });
}

/* ---------------- CSV ---------------- */
function csv(list){
  const d = D(), q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
  const rows = [['Date','Period','Class','Lesson','Pupil','Category','Time']];
  const sorted = list.slice().sort((a,b)=>awardDate(a).localeCompare(awardDate(b)) || a.at - b.at);
  const maps = new Map();
  for(const a of sorted){
    if(!maps.has(a.cls)) maps.set(a.cls, nameMap(a.cls, true));
    const m = d.apLessons[a.lid] || {};
    rows.push([awardDate(a), m.period || '', a.cls, m.title || '', maps.get(a.cls).get(a.pid) || '(pupil deleted)', catOf(a.cat).name, hhmm(a.at)]);
  }
  return '﻿' + rows.map(r=>r.map(q).join(',')).join('\r\n');
}
function download(name, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}


/* =====================================================================
   Achievement point review (v1.35)
   A lesson is "unlogged" when it has at least one point (class lesson, Form,
   extra or cover) and isn't ticked Logged, or got more points after the tick.
   Dashboard: dashBar(date) under the day tabs on every day (amber once the
   day's last class-code lesson has ended and something is unlogged; red for
   an earlier day), alertHTML() for earlier days (most recent first),
   unloggedCount(date) for the day tabs. Review page: openDay(date).
   ===================================================================== */
const todayIso = ()=> iso(new Date());
const nowMin = ()=>{ const n = new Date(); return n.getHours()*60 + n.getMinutes(); };
function longDate(s){ const [y,m,d] = s.split('-').map(Number); const x = new Date(y, m-1, d); return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][x.getDay()]} ${d} ${['January','February','March','April','May','June','July','August','September','October','November','December'][m-1]}`; }
const plural = (n, w)=> `${n} ${w}${n===1 ? '' : 's'}`;
// Points per lesson this academic year: Map lid → count; .ids: Map lid → [point ids].
function pointCounts(){
  const m = new Map(), ids = new Map();
  for(const a of D().points) if(thisYear(a)){ m.set(a.lid, (m.get(a.lid) || 0) + 1); if(!ids.has(a.lid)) ids.set(a.lid, []); ids.get(a.lid).push(a.id); }
  m.ids = ids;
  return m;
}
// 'none' (no points) | 'todo' | 'new' (points not there when ticked) | 'done'
// v1.77: a tick records the points' ids, so a point added after one was deleted still shows as new.
// Ticks from before 1.77 have only the count (n).
function logState(lid, n, ids){
  if(!n) return { st:'none', extra:0 };
  const r = D().apLogged[lid];
  if(!r) return { st:'todo', extra:0 };
  if(Array.isArray(r.ids) && ids){ const had = new Set(r.ids), extra = ids.filter(id=>!had.has(id)).length; return extra ? { st:'new', extra } : { st:'done', extra:0 }; }
  if(n > (r.n || 0)) return { st:'new', extra:n - (r.n || 0) };
  return { st:'done', extra:0 };
}
const isOpen = st => st==='todo' || st==='new';
// Every unlogged lesson this year: Map date → [lid], dates newest first.
function unloggedByDay(){
  const by = new Map();
  const counts = pointCounts();
  for(const [lid, n] of counts){
    if(!isOpen(logState(lid, n, counts.ids.get(lid)).st)) continue;
    const ds = awardDate({ lid });
    if(!by.has(ds)) by.set(ds, []);
    by.get(ds).push(lid);
  }
  return new Map([...by.entries()].sort((a,b)=>b[0].localeCompare(a[0])));
}
function unloggedCount(ds){ if(!D()) return 0; return (unloggedByDay().get(ds) || []).length; }

// A day's review list, in time order: every class-code lesson on the timetable, plus
// Form / extras / cover / lessons no longer on the timetable when they have points.
function dayEntries(ds){
  const d = D(), h = H(), counts = pointCounts();
  const out = [], seen = new Set();
  const titleOf = lid => { const m = d.apLessons[lid]; if(m && m.title) return m.title; const l = h.data.lessons[lid]; return l && l.mode && h.lessonTitle ? h.lessonTitle(l) : ''; };
  for(const r of h.dayRows(ds)){
    if(r.kind==='slim') continue;
    const m = r.meta, n = counts.get(m.id) || 0;
    const classCode = r.kind==='lesson' && !r.extra && !r.orphan;
    if(!classCode && !n) continue;
    seen.add(m.id);
    out.push({ lid:m.id, label:m.label, period:m.period, start:m.start || '', end:m.end || '', title:titleOf(m.id), n, classCode });
  }
  for(const [lid, n] of counts){
    if(seen.has(lid) || awardDate({ lid })!==ds) continue;
    const m = d.apLessons[lid] || {};
    out.push({ lid, label:m.label || 'Lesson', period:m.period || '', start:m.start || '', end:m.end || '', title:m.title || '', n, classCode:false });
  }
  const first = lid => Math.min(...d.points.filter(a=>a.lid===lid).map(a=>a.at), Infinity);
  out.sort((a,b)=> (a.start && b.start) ? toMin(a.start) - toMin(b.start) : a.start ? -1 : b.start ? 1 : first(a.lid) - first(b.lid));
  for(const e of out) Object.assign(e, logState(e.lid, e.n, counts.ids.get(e.lid)));
  return out;
}
// When the day's points are due for logging: after its last class-code lesson ends
// (no class-code lessons: after the last lesson with points). Earlier days are overdue.
function dueState(ds, entries){
  const t = todayIso();
  if(ds < t) return 'overdue';
  if(ds > t) return 'early';
  const ends = entries.filter(e=>e.classCode && e.end).map(e=>toMin(e.end));
  const pool = ends.length ? ends : entries.filter(e=>e.n && e.end).map(e=>toMin(e.end));
  if(!pool.length) return 'early';
  return nowMin() >= Math.max(...pool) ? 'due' : 'early';
}
function dashBar(ds){
  if(!D()) return '';
  const es = dayEntries(ds), withPts = es.filter(e=>e.n), todo = es.filter(e=>isOpen(e.st)).length;
  const pts = withPts.reduce((t, e)=>t + e.n, 0), due = dueState(ds, es);
  let cls = 'apr-bar', text, btn = 'btn sm';
  if(todo && due==='overdue'){ cls += ' overdue'; btn += ' apr-go'; text = `<b>Achievement points not logged</b> · ${plural(todo, 'lesson')} still to log`; }
  else if(todo && due==='due'){ cls += ' due'; btn += ' apr-go'; text = `<b>Log ${ds===todayIso() ? 'today’s' : 'the'} achievement points</b> · ${todo} of ${plural(withPts.length, 'lesson')} with points to log`; }
  else if(withPts.length && !todo){ cls += ' done'; text = `<b>Achievement points</b> · ${plural(pts, 'point')} in ${plural(withPts.length, 'lesson')} · all logged`; }
  else if(withPts.length){ text = `<b>Achievement points</b> · ${plural(pts, 'point')} in ${plural(withPts.length, 'lesson')} · ${todo} to log`; }
  else text = `<b>Achievement point review</b> · ${due==='early' ? 'No points yet' : 'No points given'}`;
  const ic = cls.includes('done') ? icon('done') : (todo && due!=='early') ? icon('alert') : icon('star');
  return `<div class="${cls}">${ic}<span class="grow">${text}</span><button class="${btn}" data-a="ap-review" data-d="${esc(ds)}">${todo && due!=='early' ? 'Review now' : 'Review'}</button></div>`;
}
// Earlier days with unlogged points, most recent first (dashboard, top).
function alertHTML(skipDs){
  if(!D()) return '';
  const t = todayIso();
  const days = [...unloggedByDay().entries()].filter(([ds])=>ds < t && ds!==skipDs);
  if(!days.length) return '';
  const total = days.reduce((n, [, l])=>n + l.length, 0);
  const SHOW = 5;
  const lineOf = lid => { const m = D().apLessons[lid] || {}; return [m.label, m.period].filter(Boolean).map(esc).join(' '); };
  const rows = days.slice(0, SHOW).map(([ds, lids])=>{
    const sorted = lids.slice().sort((a,b)=>toMin((D().apLessons[a] || {}).start) - toMin((D().apLessons[b] || {}).start));
    return `<div class="apr-ad"><span class="dd">${esc(niceDate(ds))}</span><span class="dl">${sorted.map(lineOf).join(' · ')}</span><button class="btn sm" data-a="ap-review" data-r="day" data-d="${esc(ds)}">Review</button></div>`;
  }).join('');
  return `<div class="apr-alert"><div class="apr-alert-h">${icon('alert')}<span class="grow"><b>Achievement points not logged</b> · ${plural(total, 'lesson')} on ${plural(days.length, 'earlier day')}. Log them on the school system, then tick them off.</span></div>
    <div class="apr-days">${rows}${days.length > SHOW ? `<div class="apr-more">+ ${plural(days.length - SHOW, 'more day')}</div>` : ''}</div></div>`;
}

let rp = null; // { ds, open:Set(lid) }
function openDay(ds){
  if(!D()) return;
  pg = null;
  H().setView('apreview');
  rp = { ds: ds || todayIso(), open:new Set() };
  renderReview();
  window.scrollTo({ top:0 });
}
function stepDay(ds, dir){
  const [y,m,d] = ds.split('-').map(Number); const x = new Date(y, m-1, d);
  do x.setDate(x.getDate() + dir); while(x.getDay()===0 || x.getDay()===6);
  return iso(x);
}
function renderReview(){
  const app = $('#app'); if(!app || !rp) return;
  const ds = rp.ds, es = dayEntries(ds), withPts = es.filter(e=>e.n);
  const todo = es.filter(e=>isOpen(e.st)).length, pts = withPts.reduce((t, e)=>t + e.n, 0);
  const canPrev = stepDay(ds, -1) >= curYearStart(), canNext = ds < todayIso();
  const others = alertHTML(ds);
  // v1.85: the week's days with their state, a summary, and lessons without points on one line.
  const h = H(), [yy, mm, dd] = ds.split('-').map(Number), cur = new Date(yy, mm - 1, dd);
  const mon = new Date(yy, mm - 1, dd - ((cur.getDay() + 6) % 7));
  const wk = [0,1,2,3,4].map(n=>new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + n));
  const tIso = todayIso(), ys = curYearStart();
  const info = d=>{
    const x = iso(d), lab = h.dayShort(d);
    if(x > tIso) return { ds:x, label:lab, sub:'' };
    if(x < ys) return { ds:x, label:lab, sub:'', off:false };
    const e2 = dayEntries(x), wp = e2.filter(e=>e.n), td = e2.filter(e=>isOpen(e.st)).length, p2 = wp.reduce((t, e)=>t + e.n, 0);
    if(!e2.length) return { ds:x, label:lab, sub:'No lessons' };
    if(!wp.length) return { ds:x, label:lab, sub:'No points' };
    return td ? { ds:x, label:lab, sub:`${td} to log`, tone:dueState(x, e2)==='early' ? '' : 'warn' } : { ds:x, label:lab, sub:`${p2} pt${p2===1 ? '' : 's'} · logged`, tone:'ok' };
  };
  const monIso = iso(mon), prevWk = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7)), nextWk = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7));
  const strip = h.dayStrip(wk.map(info), ds, x=>x > tIso ? 'data-r="day" data-d="' + x + '" disabled' : 'data-r="day" data-d="' + x + '"');
  const wnav = h.weekNav(`Week of ${mon.getDate()} ${MON[mon.getMonth()]}`, `data-r="wk" data-d="${prevWk}"`, `data-r="wk" data-d="${nextWk}"`, monIso <= ys, nextWk > tIso);
  const byCat = new Map(); const dayLids = new Set(withPts.map(e=>e.lid));
  for(const a of D().points) if(dayLids.has(a.lid)) byCat.set(a.cat, (byCat.get(a.cat) || 0) + 1);
  const catList = D().apCats.filter(c=>byCat.has(c.id)).map(c=>({ c, n:byCat.get(c.id) }));
  for(const [id, n] of byCat) if(!D().apCats.some(c=>c.id===id)) catList.push({ c:catOf(id), n });
  const summary = es.length ? `<div class="apr-sum2">
      <div class="apr-big">${pts}<small>point${pts===1 ? '' : 's'} on ${esc(niceDate(ds))}</small></div>
      <div class="apr-cats">${pts ? `<div class="apr-track">${catList.map(x=>`<i style="width:${(x.n/pts*100).toFixed(2)}%;background:${esc(x.c.color)}" title="${esc(x.c.name)}: ${x.n}"></i>`).join('')}</div>
        <div class="apr-lg">${catList.map(x=>`<span><i style="background:${esc(x.c.color)}"></i>${esc(x.c.name)} · ${x.n}</span>`).join('')}</div>` : `<div class="apr-lg">No points given${dueState(ds, es)==='early' ? ' yet' : ''}</div>`}</div>
      ${withPts.length ? (todo ? `<span class="apr-pill warn">${todo} to log</span>` : '<span class="apr-pill ok">All logged</span>') : ''}
    </div>` : '';
  const none = es.filter(e=>!e.n);
  const noneLine = withPts.length && none.length ? `<div class="apr-nonel">No points in ${none.map(e=>`<span class="apr-nl"><b>${esc(e.label)}</b>${e.period ? ' ' + esc(e.period) : ''}</span>`).join('')}</div>` : '';
  const rows = (withPts.length ? withPts : es).map(e=>{
    const has = e.n > 0, open = has && rp.open.has(e.lid);
    const status = !has ? `<span class="apr-none">No points</span>`
      : `<span class="apr-n">${plural(e.n, 'point')}</span>${e.st==='new' ? `<span class="tag bad">${e.extra} new since logged</span>` : ''}`;
    const tick = has ? `<label class="apr-log" title="Tick once these points are on the school system"><input type="checkbox" data-lid="${esc(e.lid)}"${e.st==='done' ? ' checked' : ''}><span>Logged</span></label>` : '<span class="apr-log-sp"></span>';
    return `<div class="apr-row st-${e.st}${open ? ' open' : ''}">
      <div class="apr-main"${has ? ` data-r="toggle" data-lid="${esc(e.lid)}"` : ''}>
        ${has ? `<button class="icon-btn apr-x" data-r="toggle" data-lid="${esc(e.lid)}" aria-expanded="${open}" title="${open ? 'Hide' : 'Show'} names">${icon(open ? 'up' : 'down')}</button>` : '<span class="apr-x-sp"></span>'}
        <span class="apr-when"><span class="pn">${esc(e.period || '')}</span><span class="tm">${e.start ? esc(e.start) + '–' + esc(e.end) : ''}</span></span>
        <span class="apr-what"><span class="cn">${esc(e.label)}</span>${e.title ? `<span class="ct">${esc(e.title)}</span>` : ''}</span>
        <span class="apr-st">${status}</span>
        ${tick}
      </div>
      ${open ? `<div class="apr-detail rv-light">${groupsHTML(groupLesson(e.lid))}</div>` : ''}
    </div>`;
  }).join('');
  const hol = !H().dayRows(ds).length && !es.length;
  app.innerHTML = `${h.appHeader('points')}<div class="dash apr-page">
    <nav class="weekbar" aria-label="Week and day">${strip}${wnav}</nav>
    ${others}
    ${es.length ? `${summary}
    <div class="apr-list">${rows}</div>${noneLine}`
    : `<div class="empty">${hol ? (H().hasTimetable ? 'No lessons on this day.' : 'Link your planner timetable on the dashboard to list the day’s lessons.') : 'Nothing timetabled.'}</div>`}
  </div>`;
  h.updatePill();
}
document.addEventListener('click', e=>{
  if(!rp || !$('.apr-page')) return;
  const b = e.target.closest('[data-r]'); if(!b || !b.closest('.apr-page')) return;
  if(e.target.closest('.apr-log')) return; // the tick box handles itself
  switch(b.dataset.r){
    case 'home': {
      // Back to the dashboard on the reviewed day if the dashboard can show it (this week onwards).
      const ds = rp.ds; rp = null;
      const n = new Date(), mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7));
      H().goHome(ds >= iso(mon) ? ds : null); break;
    }
    case 'prev': rp.ds = stepDay(rp.ds, -1); rp.open.clear(); renderReview(); break;
    case 'next': rp.ds = stepDay(rp.ds, 1); rp.open.clear(); renderReview(); break;
    case 'today': rp.ds = todayIso(); rp.open.clear(); renderReview(); break;
    case 'day': rp.ds = b.dataset.d; rp.open.clear(); renderReview(); window.scrollTo({ top:0 }); break;
    case 'wk': { const t = todayIso(), ys = curYearStart(); let x = b.dataset.d; if(x > t) x = t; if(x < ys) x = ys; const [y2, m2, d2] = x.split('-').map(Number), dt = new Date(y2, m2 - 1, d2); while(dt.getDay()===0 || dt.getDay()===6) dt.setDate(dt.getDate() + (dt.getDay()===6 ? 2 : 1)); rp.ds = iso(dt) > t ? t : iso(dt); rp.open.clear(); renderReview(); break; }
    case 'toggle': { const lid = b.dataset.lid; if(rp.open.has(lid)) rp.open.delete(lid); else rp.open.add(lid); renderReview(); break; }
  }
});
document.addEventListener('change', e=>{
  const cb = e.target.closest('.apr-page .apr-log input'); if(!cb || !rp) return;
  const lid = cb.dataset.lid, d = D();
  if(cb.checked){ const pts = lessonPoints(lid); d.apLogged[lid] = { at:Date.now(), n:pts.length, ids:pts.map(a=>a.id) }; }
  else delete d.apLogged[lid];
  save(); renderReview();
});
// The dashboard bar turns amber when the last class-code lesson ends: repaint it in place.
setInterval(()=>{
  const h = H(); if(!h || !D() || h.viewName!=='dash') return;
  const bar = $('.apr-bar'); if(!bar) return;
  const html = dashBar(h.selDate).trim();
  if(bar.outerHTML!==html) bar.outerHTML = html;
}, 20000);

/* v1.84: the dashboard's Achievement Points button (replaces dashBar and the alertHTML card there).
   Badge = lessons with points not marked as logged (today and earlier). Green while they're all recent;
   red and urgent once any is from more than 2 school days ago (weekdays with a timetable, holidays skipped). */
function schoolDaysSince(ds){
  const h = H(); let n = 0;
  const [y, m, d] = ds.split('-').map(Number);
  const x = new Date(y, m - 1, d), end = new Date(); end.setHours(0, 0, 0, 0);
  for(x.setDate(x.getDate() + 1); x <= end && n < 99; x.setDate(x.getDate() + 1)){
    const wd = x.getDay(); if(wd===0 || wd===6) continue;
    if(h && h.hasTimetable && !h.dayRows(iso(x)).length) continue; // holiday / INSET
    n++;
  }
  return n;
}
function apStatus(){
  if(!D()) return { n:0, urgent:false, oldest:null };
  const t = todayIso(); let n = 0, urgent = false, oldest = null;
  for(const [ds, lids] of unloggedByDay()){
    if(ds > t) continue;
    n += lids.length; oldest = ds;
    if(!urgent && schoolDaysSince(ds) > 2) urgent = true;
  }
  return { n, urgent, oldest };
}
function topButton(){
  const s = apStatus();
  const tip = !s.n ? 'Achievement Points: all logged' : `Achievement Points: ${plural(s.n, 'lesson')} not logged${s.urgent ? ', some overdue' : ''}`;
  return `<button class="dtb ap-top${s.urgent ? ' urgent' : ''}" data-a="ap-review" title="${esc(tip)}" aria-label="${esc(tip)}">${icon('star')}${s.n ? `<span class="dtb-badge">${s.n > 99 ? '99+' : s.n}</span>` : ''}</button>`;
}
window.SVPoints = { open, close, showReview, showEnd, cats:()=>D() ? cats() : [], catsFor:l=>D() ? catsFor(l) : [], award:awardOne, dashBar, alertHTML:()=>alertHTML(), unloggedCount, openDay, topButton, apStatus };
window.SVClasses = { openPage, mountIn, refresh, parseNames, addPupils, classFor, nameMap, active, allClasses, absentSet, setAbsent };
})();
