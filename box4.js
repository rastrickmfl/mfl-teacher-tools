/* =====================================================================
   Slideshow Viewer — Box of Four
   Loaded after names.js. Uses window.SVHost, window.SVIsland and
   window.SVClasses (class lists, absences).

   A 2×2 grid of pupils for the lesson. Tap an empty box → class list →
   that pupil fills the box. Filled boxes are locked until all four are
   full; after that, tapping a box replaces its name. Clear all empties it.
   The same pupil can be in more than one box.

   Pick winner (end of lesson): the filled boxes light up in turn, slowing
   down, and stop on one. Each filled box has the same chance (an absent
   pupil, or a pupil in two boxes, is not treated differently).

   Three ways to show it:
     big     centre pop-up (Tools → Box of Four, or the island icon)
     float   small movable box over the slide (Shrink on the pop-up)
     closed  just the 2×2 icon in the island

   Saved in viewer-data.json:
     box4     { [lesson id]: { date, ids:[pid|null ×4] } }   for this lesson only;
              dropped after 14 days. The island icon shows once a lesson
              has a record (the tool was opened, or Random Name sent a name).
     box4Pos  { x, y }   where the small box sits (fractions of the screen)
   Random Name's "To box" puts the chosen pupil in the next empty box.
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const C = ()=> window.SVClasses;
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));

const IC = iconMap({
  grid: 'layout-grid', plus: 'plus', x: 'x', back: 'chevron-left',
  trash: 'trash-2', check: 'check', shrink: 'minimize-2', expand: 'maximize-2',
  up: 'chevron-up', trophy: 'trophy', grip: 'grip-vertical',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- data ---------------- */
function D(){
  const h = H(); const d = h && h.data; if(!d) return null;
  if(!d.box4 || typeof d.box4!=='object' || Array.isArray(d.box4)) d.box4 = {};
  return d;
}
const save = ()=> H().save();
const lesson = ()=> H() && H().lesson;
const pad2 = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const used = l => !!(l && D() && D().box4[l.id]);
function slots(l){
  const d = D();
  let r = d.box4[l.id];
  if(!r || !Array.isArray(r.ids)){ r = d.box4[l.id] = { date:l.date || iso(new Date()), ids:[null, null, null, null] }; save(); }
  while(r.ids.length < 4) r.ids.push(null);
  return r.ids;
}
// What each box shows: pupils who've since left the class list count as empty.
function live(l, cls){
  const on = new Set(C().active(cls).map(p=>p.id));
  return slots(l).slice(0, 4).map(id=> id && on.has(id) ? id : null);
}
function setSlot(l, i, pid){ slots(l)[i] = pid; save(); }
function clearAll(l){ const s = slots(l); for(let i=0; i<4; i++) s[i] = null; save(); }
// Old records (and the old per-class ones, which have no date) are dropped.
function prune(){
  const d = D(); if(!d) return;
  const cut = new Date(); cut.setDate(cut.getDate() - 14);
  const c = iso(cut); let changed = false;
  for(const [k, r] of Object.entries(d.box4)) if(!r || !r.date || r.date < c){ delete d.box4[k]; changed = true; }
  if(changed) save();
}
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }

/* ---------------- big pop-up ---------------- */
let big = null; // { back, card, view:'grid'|'pick'|'choose', idx, ret:'float'|null, flash:{txt,ok}, flashT, arm, armT, hit, drawing, win }

function openBig(view, idx, ret){
  const l = lesson();
  if(!l){ H().toast('Open a lesson to use Box of Four.'); return; }
  if(window.SVPoints) window.SVPoints.close();
  hideFloat();
  if(!big){
    const back = el('div', 'ap-back b4-back'), card = el('div', 'ap b4');
    back.appendChild(card); document.body.appendChild(back);
    back.addEventListener('pointerdown', e=>{ if(e.target===back && !big.drawing) closeBig(big.ret==='float'); });
    card.addEventListener('click', onBigClick);
    big = { back, card };
  }
  if(big.drawing) return;
  clearTimeout(big.flashT); clearTimeout(big.armT);
  Object.assign(big, { view:view || 'grid', idx:idx==null ? null : idx, ret:ret || null, flash:null, arm:false, hit:null, win:null });
  if(C().classFor(l)) slots(l); // marks the tool as in use this lesson
  paintBig(); paintIsland();
}
function closeBig(toFloat){
  if(big){ clearTimeout(big.flashT); clearTimeout(big.armT); big.drawing = false; big.back.remove(); big = null; }
  if(toFloat) showFloat();
  paintIsland();
}

function headHTML(cls){
  return `<div class="ap-head">
    <div class="ap-title">${icon('grid', 'ico b4-ic')}Box of Four</div>
    ${cls ? `<span class="ap-chip">${esc(cls)}</span>` : ''}
    <div class="grow"></div>
    ${cls ? `<button class="clk-btn" data-b="shrink" title="Small box over the slide" ${big.drawing ? 'disabled' : ''}>${icon('shrink')}Shrink</button>` : ''}
    <button class="tb-ic" data-b="close" title="Close (icon stays in the top bar)" ${big.drawing ? 'disabled' : ''}>${icon('x')}</button>
  </div>`;
}
function paintBig(){
  if(!big) return;
  const l = lesson(), cls = C().classFor(l), card = big.card;
  if(!cls) big.view = 'choose';
  if(big.view==='choose'){
    const list = C().allClasses().filter(k=>C().active(k).length);
    card.className = 'ap b4 ap-choose';
    card.innerHTML = headHTML(null) + `<p class="ap-msg">${list.length ? `There's no class list for <b>${esc(l.label || 'this lesson')}</b>. Which class is this?` : `No class lists yet. Add them on the dashboard: <b>Classes</b>.`}</p>
      <div class="ap-choices">${list.map(k=>`<button class="clk-btn" data-use="${esc(k)}">${esc(k)}<small>${C().active(k).length}</small></button>`).join('')}</div>`;
    return;
  }
  if(big.view==='pick'){ paintPick(l, cls); return; }
  const ids = live(l, cls), names = C().nameMap(cls), ab = C().absentSet(l.id);
  const full = ids.every(Boolean), filled = ids.filter(Boolean).length;
  const win = big.win, wname = win!=null && ids[win] ? names.get(ids[win]) : '';
  card.className = 'ap b4';
  card.innerHTML = headHTML(cls) + `<div class="b4-grid ${big.drawing ? 'drawing' : ''} ${wname ? 'won' : ''}">${ids.map((id, i)=>`<button class="b4-cell ${id ? '' : 'empty'} ${id && !full ? 'locked' : ''} ${big.hit===i ? 'hit' : ''} ${id && ab.has(id) ? 'abs' : ''} ${wname && win===i ? 'win' : ''}" data-i="${i}">
        ${wname && win===i ? `<span class="b4-n b4-wl">${icon('trophy')}Winner</span>` : `<span class="b4-n">${i+1}</span>`}
        ${id ? `<span class="b4-nm">${esc(names.get(id))}</span>` : `<span class="b4-add">${icon('plus')}Choose</span>`}
      </button>`).join('')}</div>
    <div class="ap-foot">
      <div class="ap-sum">${big.drawing ? 'Picking a winner…'
        : wname ? `<span class="b4-won">${icon('trophy')}${esc(wname)} wins!</span>`
        : big.flash ? `<span class="ap-flash ${big.flash.ok ? '' : 'no'}">${big.flash.ok ? icon('check') : ''}${esc(big.flash.txt)}</span>`
        : full ? 'Tap a box to change its name.' : 'Tap an empty box to choose a pupil.'}</div>
      ${filled && !big.drawing ? `<button class="clk-btn lg ${big.arm ? 'b4-arm' : ''}" data-b="clear">${icon('trash')}${big.arm ? 'Tap again to clear' : 'Clear all'}</button>` : ''}
      ${filled >= 2 ? `<button class="clk-btn lg b4-draw" data-b="draw" ${big.drawing ? 'disabled' : ''}>${icon('trophy')}${wname ? 'Draw again' : 'Pick winner'}</button>` : ''}
    </div>`;
  big.hit = null;
}
function paintPick(l, cls){
  const names = C().nameMap(cls), ab = C().absentSet(l.id), ids = live(l, cls);
  const pupils = C().active(cls).slice().sort((a,b)=>names.get(a.id).localeCompare(names.get(b.id), 'en-GB', { sensitivity:'base' }));
  const fit = tileFit(pupils.length);
  const boxesOf = id => ids.map((x, i)=> x===id ? i+1 : 0).filter(Boolean);
  big.card.className = 'ap b4 b4-pick';
  big.card.innerHTML = `<div class="ap-head">
      <button class="tb-ic" data-b="back" title="Back">${icon('back')}</button>
      <div class="ap-title">Box ${big.idx+1}</div>
      <span class="ap-chip">${esc(cls)}</span>
      <div class="grow"></div>
      <button class="tb-ic" data-b="close" title="Close">${icon('x')}</button>
    </div>
    <div class="ap-pupils b4-list ${fit.big ? 'big' : ''}" style="--cols:${fit.cols};--rows:${Math.ceil(pupils.length / fit.cols)};--rmax:${fit.row}px;--cmax:${fit.col};--fs:${fit.fs}px">${pupils.map(p=>{
      const bx = boxesOf(p.id);
      return `<button class="ap-p ${ab.has(p.id) ? 'abs' : ''} ${ids[big.idx]===p.id ? 'on' : ''}" data-pid="${esc(p.id)}" ${ab.has(p.id) ? 'title="Marked absent"' : ''}><span class="nm">${esc(names.get(p.id))}</span>${bx.length ? `<span class="b4-tag">${bx.map(n=>`<i>${n}</i>`).join('')}</span>` : ''}</button>`;
    }).join('')}</div>`;
}
// Same sizes as the other class-list pop-ups.
function tileFit(n){
  if(n<=4)  return { cols:2, row:170, col:'320px', fs:32, big:true };
  if(n<=6)  return { cols:3, row:170, col:'300px', fs:30, big:true };
  if(n<=9)  return { cols:3, row:150, col:'300px', fs:28, big:true };
  if(n<=12) return { cols:4, row:130, col:'260px', fs:26, big:true };
  if(n<=16) return { cols:4, row:112, col:'1fr', fs:24, big:true };
  if(n<=20) return { cols:5, row:96, col:'1fr', fs:22, big:false };
  return { cols:5, row:76, col:'1fr', fs:20, big:false };
}
function setFlash(txt, ok){
  if(!big) return;
  big.flash = { txt, ok };
  paintBig();
  clearTimeout(big.flashT);
  big.flashT = setTimeout(()=>{ if(big){ big.flash = null; paintBig(); } }, 3000);
}

function onBigClick(e){
  if(!big || big.drawing) return;
  const b = e.target.closest('button'); if(!b || b.disabled) return;
  const l = lesson();
  if(b.dataset.b!=='draw') big.win = null;
  if(b.dataset.use){ l.classKey = b.dataset.use; save(); big.view = 'grid'; paintBig(); paintIsland(); return; }
  if(b.dataset.pid){ pick(b.dataset.pid); return; }
  if(b.dataset.i!=null){ tapCell(Number(b.dataset.i), 'big', b); return; }
  if(b.dataset.b!=='clear' && big.arm){ big.arm = false; clearTimeout(big.armT); }
  switch(b.dataset.b){
    case 'close': closeBig(false); break;
    case 'shrink': closeBig(true); break;
    case 'back': back(); break;
    case 'draw': draw(); break;
    case 'clear': {
      const cls = C().classFor(l); if(!cls) return;
      clearTimeout(big.armT);
      if(big.arm){ big.arm = false; clearAll(l); setFlash('All four boxes cleared', true); }
      else { big.arm = true; paintBig(); big.armT = setTimeout(()=>{ if(big && big.arm){ big.arm = false; paintBig(); } }, 3000); }
      break;
    }
  }
}
/* Pick winner: light the filled boxes in turn (clockwise: 1 2 4 3), slowing
   down, and stop on a box chosen up front with crypto randomness. Each
   filled box has the same chance every time. */
function draw(){
  const l = lesson(), cls = C().classFor(l); if(!cls || !big) return;
  const ids = live(l, cls);
  const order = [0, 1, 3, 2].filter(i=>ids[i]);
  if(order.length < 2) return;
  const target = order[Math.floor(rand() * order.length)];
  const start = Math.floor(rand() * order.length);
  // At least ~20 flashes, ending on the target.
  const laps = Math.ceil(20 / order.length);
  const steps = laps * order.length + ((order.indexOf(target) - start + order.length) % order.length);
  big.drawing = true; big.win = null; big.flash = null; big.arm = false; clearTimeout(big.flashT);
  paintBig();
  const run = big, cells = [...big.card.querySelectorAll('.b4-cell')];
  let k = 0;
  const step = ()=>{
    if(big!==run || !run.drawing) return;
    cells.forEach(c=>c.classList.remove('lit'));
    cells[order[(start + k) % order.length]].classList.add('lit');
    if(k >= steps){ setTimeout(()=>{ if(big===run && run.drawing){ run.drawing = false; run.win = target; paintBig(); } }, 450); return; }
    const t = k / steps;
    k++;
    setTimeout(step, 55 + 520 * t * t * t);
  };
  step();
}
function back(){
  if(!big) return;
  if(big.ret==='float'){ closeBig(true); return; }
  big.view = 'grid'; paintBig();
}

// A box was tapped (in the pop-up or the small box).
function tapCell(i, from, btn){
  const l = lesson(), cls = C().classFor(l);
  if(!cls){ openBig(); return; }
  const ids = live(l, cls);
  if(ids[i] && !ids.every(Boolean)){
    if(from==='big') setFlash('Fill all four boxes first, or use Clear all to start again.', false);
    else if(btn){ btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); }
    return;
  }
  if(from==='big'){ big.view = 'pick'; big.idx = i; big.flash = null; paintBig(); }
  else openBig('pick', i, 'float');
}
function pick(pid){
  const l = lesson(), cls = C().classFor(l); if(!cls || !big) return;
  const i = big.idx;
  setSlot(l, i, pid);
  const name = C().nameMap(cls).get(pid);
  if(big.ret==='float'){ closeBig(true); paintFloat(i); return; }
  big.view = 'grid'; big.hit = i;
  setFlash(`${name} → Box ${i+1}`, true);
}

/* ---------------- small floating box ---------------- */
let fl = null;

function showFloat(){
  const l = lesson(); if(!l || !C().classFor(l)) return;
  if(!fl){
    fl = el('div', 'b4-float');
    document.body.appendChild(fl);
    fl.addEventListener('click', onFloatClick);
    fl.addEventListener('pointerdown', dragStart);
  }
  paintFloat();
  place();
}
function hideFloat(){ if(fl){ fl.remove(); fl = null; } }
function paintFloat(hit){
  if(!fl) return;
  const l = lesson(), cls = C().classFor(l);
  if(!cls){ hideFloat(); return; }
  const ids = live(l, cls), names = C().nameMap(cls), ab = C().absentSet(l.id);
  fl.innerHTML = `<div class="b4f-head" data-drag>
      <span class="b4f-grip">${icon('grip')}</span><span class="b4f-t">Box of Four</span>
      <button class="b4f-b" data-f="big" title="Make bigger">${icon('expand')}</button>
      <button class="b4f-b" data-f="min" title="Shrink to the top bar">${icon('up')}</button>
    </div>
    <div class="b4f-grid">${ids.map((id, i)=>`<button class="b4f-cell ${id ? '' : 'empty'} ${hit===i ? 'hit' : ''} ${id && ab.has(id) ? 'abs' : ''}" data-i="${i}">${id ? esc(names.get(id)) : icon('plus')}</button>`).join('')}</div>`;
}
function onFloatClick(e){
  const b = e.target.closest('button'); if(!b || !fl) return;
  if(b.dataset.f==='big'){ openBig(); return; }
  if(b.dataset.f==='min'){ hideFloat(); paintIsland(); return; }
  if(b.dataset.i!=null) tapCell(Number(b.dataset.i), 'float', b);
}

// Drag by the title strip. Position is kept in viewer-data.json.
function dragStart(e){
  if(!e.target.closest('[data-drag]') || e.target.closest('button')) return;
  e.preventDefault();
  const r = fl.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  const box = fl;
  try{ box.setPointerCapture(e.pointerId); }catch(_){}
  box.classList.add('drag');
  const mv = ev=> setPos(ev.clientX - ox, ev.clientY - oy);
  const up = ()=>{
    box.removeEventListener('pointermove', mv);
    box.removeEventListener('pointerup', up);
    box.removeEventListener('pointercancel', up);
    box.classList.remove('drag');
    if(fl===box){ const q = box.getBoundingClientRect(); D().box4Pos = { x:q.left / innerWidth, y:q.top / innerHeight }; save(); }
  };
  box.addEventListener('pointermove', mv);
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
}
function setPos(x, y){
  if(!fl) return;
  const w = fl.offsetWidth, h = fl.offsetHeight;
  fl.style.left = clamp(x, 4, innerWidth - w - 4) + 'px';
  fl.style.top = clamp(y, 4, innerHeight - h - 4) + 'px';
}
function place(){
  if(!fl) return;
  const p = D().box4Pos;
  if(p && isFinite(p.x) && isFinite(p.y)) setPos(p.x * innerWidth, p.y * innerHeight);
  else {
    // First time: top corner of the slide, away from the rail.
    const railLeft = !!$('.present.rail-left');
    setPos(railLeft ? innerWidth - fl.offsetWidth - 24 : 88, 72);
  }
}
window.addEventListener('resize', place);

/* ---------------- island ---------------- */
function paintIsland(){
  const I = window.SVIsland, h = H(); if(!I || !h || !D()) return;
  const l = h.lesson;
  if(!l || !C().classFor(l) || !used(l)){ I.remove('box4'); return; }
  I.set('box4', `<span class="isl-read" data-b4 title="Box of Four">${icon('grid', 'ico b4-isl')}</span>`, 1);
}
document.addEventListener('pointerdown', e=>{
  const b = e.target.closest && e.target.closest('.island [data-b4]'); if(!b) return;
  e.preventDefault(); e.stopPropagation(); openBig();
}, true);

function refresh(hit){ if(big && !big.drawing) { if(hit!=null && big.view==='grid') big.hit = hit; paintBig(); } if(fl) paintFloat(hit); }

window.addEventListener('sv:present', ()=>{ closeBig(false); hideFloat(); prune(); paintIsland(); });
window.addEventListener('sv:leave', ()=>{ if(big){ big.back.remove(); big = null; } hideFloat(); if(window.SVIsland) window.SVIsland.remove('box4'); });
window.addEventListener('sv:absent', ()=> refresh());

/* ---------------- keys ---------------- */
// Only while the pop-up is open; the small box leaves the keyboard and clicker alone.
window.addEventListener('keydown', e=>{
  if(!big) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key==='F11') return;
  e.stopPropagation();
  const k = e.key;
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' ','Enter'].includes(k)) e.preventDefault();
  if(big.drawing) return;
  if(k==='Escape'){
    e.preventDefault();
    if(big.view==='pick') back();
    else closeBig(big.ret==='float');
  }
}, true);

/* ---------------- for Random Name ---------------- */
function hasEmpty(l){ const cls = C().classFor(l); return !!cls && (!used(l) || live(l, cls).some(x=>!x)); }
// Puts the pupil in the first empty box. Returns its index, or -1 if all four are full.
function sendNext(l, pid){
  const cls = C().classFor(l); if(!cls) return -1;
  const i = live(l, cls).findIndex(x=>!x); if(i < 0) return -1;
  setSlot(l, i, pid);
  refresh(i); paintIsland();
  return i;
}

window.SVBox4 = { open:()=>openBig(), close:()=>closeBig(false), hasEmpty, sendNext };
})();
