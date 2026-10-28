/* =====================================================================
   Slideshow Viewer — Beat the Teacher and Bob Up
   Loaded after box4.js. Uses window.SVHost, window.SVIsland and
   window.SVClasses (for the number of pupils marked in).

   Both are pill-shaped score boxes over the slide, one circle each side.
     Beat the Teacher   ( 4 )  ← the teacher
                              8B/Fr2 →  ( 3 )
                        Tap a circle to add a point.
     Bob Up             ( 4 )  Player [ 7 ]  ( 3 )
                        Tap the middle to roll. Circles are Team A (left) and Team B (right).

   Move: drag the pill. Dropping it on a side target (each side has all three,
   at the 2nd, 3rd and 4th fifths of the screen, top to bottom):
     Edit   centres the pill and enlarges it: − / + under each circle to correct
            points, the number of numbers for Bob Up, and Done to finish
     Save   closes it but keeps the scores; open it again from Tools
     Red X  clears this game's scores and closes it

   Scores are kept in memory for the lesson. Leaving the presenter clears them.
   The keyboard and clicker keep changing slides while the boxes are up.

   Saved in viewer-data.json:
     tallyPos     { btt:{x,y}, bob:{x,y} }   where each box sits (fractions of the screen)
     bobMax       the last "how many numbers" used (offered next time if there's no class list)
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const C = ()=> window.SVClasses;
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }

const IC = iconMap({
  x: 'x', up: 'chevron-up', plus: 'plus', minus: 'minus',
  left: 'chevron-left', right: 'chevron-right', hash: 'hash',
  dice: 'dices', vs: 'swords', bob: 'user-round',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- data ---------------- */
const D = ()=> { const h = H(); return h && h.data; };
const save = ()=> H().save();
const lesson = ()=> H() && H().lesson;
const MAXN = 16, MINN = 2;

// In memory for the current lesson only.
let S = fresh();
function fresh(){ return { lid:null, btt:{ t:0, c:0 }, bob:{ a:0, b:0, max:null, num:null } }; }
function forLesson(){
  const l = lesson(); if(!l) return null;
  if(S.lid!==l.id){ S = fresh(); S.lid = l.id; }
  return S;
}
const teacher = ()=> 'Teacher';   // always the red player
// The class code of this lesson's class (e.g. 8B/Fr2): always the blue player.
function className(){
  const l = lesson();
  return (l && ((C() && C().classFor(l)) || l.label)) || 'Class';
}
function presentCount(){
  const l = lesson(); if(!l || !C()) return 0;
  const cls = C().classFor(l); if(!cls) return 0;
  const ab = C().absentSet(l.id);
  return C().active(cls).filter(p=>!ab.has(p.id)).length;
}
function defaultMax(){
  const n = presentCount();
  if(n) return clamp(Math.ceil(n / 2), MINN, MAXN);
  const m = D() && Number(D().bobMax);
  return m >= MINN && m <= MAXN ? m : 12;
}

/* ---------------- shared floating pill ---------------- */
// One per tool: { key, el, mode:'float'|'closed', editing, setup, ... }
const B = {
  btt: { key:'btt', title:'Beat the Teacher', ic:'vs', mode:'closed', paint:paintBtt, click:clickBtt, island:islandBtt },
  bob: { key:'bob', title:'Bob Up', ic:'bob', mode:'closed', paint:paintBob, click:clickBob, island:islandBob },
};

function open(key){
  if(!lesson()){ H().toast('Open a lesson to use ' + B[key].title + '.'); return; }
  forLesson();
  const t = B[key];
  if(key==='bob' && S.bob.max==null) t.setup = defaultMax();
  show(t);
}
function show(t){
  t.mode = 'float';
  if(!t.el){
    t.el = el('div', 'tl-float tl-' + t.key);
    document.body.appendChild(t.el);
    t.el.addEventListener('click', e=>onClick(t, e));
    t.el.addEventListener('pointerdown', e=>dragStart(t, e));
  }
  paint(t); place(t); paintIsland(t);
}
function hide(t, mode){
  clearTimeout(t.rollT); t.rolling = false; t.editing = false;
  if(t.el){ t.el.remove(); t.el = null; }
  t.mode = mode;
  paintIsland(t);
}
function paint(t){
  if(!t.el) return;
  t.el.classList.toggle('setup', t.setup!=null);
  t.el.classList.toggle('editing', !!t.editing);
  t.el.innerHTML = t.paint(t);
}
function onClick(t, e){
  if(t.justDragged){ t.justDragged = false; return; }   // the click that ends a drag is not a tap
  const b = e.target.closest('[data-a]'); if(!b || b.disabled || !t.el) return;
  t.click(t, b);
}

/* Move: drag the pill from anywhere except its buttons. Dropping it on a side
   target does what that target says. */
function dragStart(t, e){
  if(e.target.closest('button')) return;
  if(!t.el) return;
  e.preventDefault();
  const box = t.el, r = box.getBoundingClientRect();
  // Work from the unscaled box's centre so the pill still follows the pointer while it is enlarged.
  const w = box.offsetWidth, h = box.offsetHeight;
  const ox = e.clientX - (r.left + r.width/2 - w/2), oy = e.clientY - (r.top + r.height/2 - h/2);
  const sx = e.clientX, sy = e.clientY;
  let moved = false, zones = null;
  try{ box.setPointerCapture(e.pointerId); }catch(_){}
  const mv = ev=>{
    if(!moved){
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true; box.classList.add('drag'); zones = makeZones();
    }
    setPos(t, ev.clientX - ox, ev.clientY - oy);
    zones.forEach(z=>z.el.classList.toggle('hot', inside(z.el, ev.clientX, ev.clientY, 30)));
  };
  const up = ev=>{
    box.removeEventListener('pointermove', mv);
    box.removeEventListener('pointerup', up);
    box.removeEventListener('pointercancel', up);
    if(!moved) return;                                  // a tap: let the click run
    box.classList.remove('drag');
    const hit = zones.find(z=>inside(z.el, ev.clientX, ev.clientY, 30));
    zones.forEach(z=>z.el.remove());
    t.justDragged = true; setTimeout(()=>{ t.justDragged = false; }, 60);
    if(!hit){ savePos(t); return; }
    if(hit.kind==='edit'){ enterEdit(t); return; }
    if(hit.kind==='clear') clearScores(t);
    hide(t, 'closed');                                  // 'save' and 'clear' both close; scores stay unless cleared
  };
  box.addEventListener('pointermove', mv);
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
}
// Edit: centre the pill and enlarge it (CSS .editing), then show the − / + controls.
function enterEdit(t){
  t.editing = true; t.setup = null;
  paint(t);
  const w = t.el.offsetWidth, h = t.el.offsetHeight;
  setPos(t, (innerWidth - w) / 2, (innerHeight - h) / 2);
  savePos(t);
}
function makeZones(){
  // Each side has all three, at the 2nd, 3rd and 4th fifths of the screen (top to bottom).
  const out = [];
  for(const side of ['l', 'r']){
    out.push({ kind:'edit', el:mkZone(`tl-z tl-z-${side} tl-z-edit`, 'Edit') });
    out.push({ kind:'save', el:mkZone(`tl-z tl-z-${side} tl-z-save`, 'Save') });
    out.push({ kind:'clear', el:mkZone(`tl-z tl-z-${side} tl-z-clear`, icon('x')) });
  }
  return out;
}
function mkZone(cls, html){ const z = el('div', cls, html); document.body.appendChild(z); return z; }
function clearScores(t){
  const s = forLesson(); if(!s) return;
  if(t.key==='btt'){ s.btt.t = 0; s.btt.c = 0; }
  else { s.bob.a = 0; s.bob.b = 0; s.bob.num = null; }
  t.setup = null;
}
function savePos(t){
  if(!t.el) return;
  const d = D();
  if(!d.tallyPos || typeof d.tallyPos!=='object') d.tallyPos = {};
  d.tallyPos[t.key] = { x:parseFloat(t.el.style.left) / innerWidth, y:parseFloat(t.el.style.top) / innerHeight };
  save();
}
function inside(z, x, y, pad){
  const q = z.getBoundingClientRect();
  return x >= q.left - pad && x <= q.right + pad && y >= q.top - pad && y <= q.bottom + pad;
}
function setPos(t, x, y){
  if(!t.el) return;
  const w = t.el.offsetWidth, h = t.el.offsetHeight;
  t.el.style.left = clamp(x, 4, innerWidth - w - 4) + 'px';
  t.el.style.top = clamp(y, 4, innerHeight - h - 4) + 'px';
}
function place(t){
  if(!t.el) return;
  const p = D() && D().tallyPos && D().tallyPos[t.key];
  if(p && isFinite(p.x) && isFinite(p.y)) setPos(t, p.x * innerWidth, p.y * innerHeight);
  else {
    // First time: bottom corner of the slide, away from the rail. If the other pill is already up, sit beside it.
    const railLeft = !!$('.present.rail-left');
    const w = t.el.offsetWidth, h = t.el.offsetHeight, y = innerHeight - h - 24;
    const other = (t.key==='bob' ? B.btt : B.bob).el;
    let x = railLeft ? innerWidth - w - 24 : 88;
    if(other){ const o = other.getBoundingClientRect(); x = railLeft ? o.left - w - 16 : o.right + 16; }
    setPos(t, x, y);
  }
}
window.addEventListener('resize', ()=>{ place(B.btt); place(B.bob); });

/* shared piece: a circle, with − / + under it while editing */
function side(t, k, score, other){
  return `<div class="tl-side" data-side="${k}">
      <button class="tl-circ ${score > other ? 'lead' : ''}" data-side="${k}" data-score="${k}" data-a="inc" data-k="${k}" title="Add a point">${score}</button>
      ${t.editing ? `<div class="tl-adj">
        <button class="tl-adjb" data-a="dec" data-k="${k}" title="Take a point off" ${score ? '' : 'disabled'}>${icon('minus')}</button>
        <button class="tl-adjb plus" data-a="inc" data-k="${k}" title="Add a point">${icon('plus')}</button>
      </div>` : ''}
    </div>`;
}

/* ---------------- Beat the Teacher ---------------- */
function paintBtt(t){
  const s = forLesson(); if(!s) return '';
  return `<div class="tl-pill">${side(t, 't', s.btt.t, s.btt.c)}
    <div class="tl-mid">
      <div class="tl-line"><span class="tl-name">← ${esc(teacher())}</span></div>
      <div class="tl-line"><span class="tl-name">${esc(className())} →</span></div>
      ${t.editing ? `<button class="tl-done" data-a="done">Done</button>` : ''}
    </div>
    ${side(t, 'c', s.btt.c, s.btt.t)}</div>`;
}
function clickBtt(t, b){
  const s = forLesson(); if(!s) return;
  const k = b.dataset.k;
  switch(b.dataset.a){
    case 'done': t.editing = false; paint(t); place(t); savePos(t); return;
    case 'inc': s.btt[k]++; break;
    case 'dec': s.btt[k] = Math.max(0, s.btt[k] - 1); break;
    default: return;
  }
  paint(t); paintIsland(t);
  if(b.dataset.a==='inc') bump(t, t.el.querySelector(`[data-score="${k}"]`));
}
function islandBtt(){
  const s = forLesson(); if(!s) return '';
  const lead = s.btt.t===s.btt.c ? '' : s.btt.t > s.btt.c ? 't' : 'c';
  return `<span class="isl-read tl-isl" data-tl="btt" title="Beat the Teacher">${icon('vs', 'ico tl-iic')}<span class="tl-in ${lead==='t' ? 'lead' : ''}">${esc(teacher())}</span><b class="tl-is">${s.btt.t}</b><span class="tl-dash">–</span><b class="tl-is">${s.btt.c}</b><span class="tl-in ${lead==='c' ? 'lead' : ''}">${esc(className())}</span></span><button class="isl-b" data-tlx="btt" title="Close (scores are kept for this lesson)">${icon('x')}</button>`;
}

/* ---------------- Bob Up ---------------- */
function paintBob(t){
  const s = forLesson(); if(!s) return '';
  if(t.setup!=null){
    const n = presentCount();
    return `<div class="tl-setup">
      <div class="tl-q">How many numbers?</div>
      <div class="tl-step">
        <button class="tl-pmb" data-a="less" ${t.setup <= MINN ? 'disabled' : ''} title="Fewer">${icon('minus')}</button>
        <div class="tl-stepn">${t.setup}</div>
        <button class="tl-pmb plus" data-a="more" ${t.setup >= MAXN ? 'disabled' : ''} title="More">${icon('plus')}</button>
      </div>
      <div class="tl-hint">${n ? `${n} pupil${n===1 ? '' : 's'} in · numbers 1–${t.setup} in each team` : `Numbers 1–${t.setup} in each team`}</div>
      <div class="tl-foot">
        ${s.bob.max!=null ? `<button class="tl-btn" data-a="cancel">Cancel</button>` : ''}
        <button class="tl-btn go" data-a="start">${s.bob.max!=null ? 'Done' : 'Start'}</button>
      </div>
    </div>`;
  }
  const num = s.bob.num==null ? '?' : s.bob.num;
  const max = s.bob.max;
  const mid = t.editing
    ? `<div class="tl-line">Player <span class="tl-box ${s.bob.num==null ? 'none' : ''}" data-num>${num}</span></div>
       <div class="tl-line tl-sm">Numbers 1–
         <button class="tl-adjb" data-a="maxless" ${max <= MINN ? 'disabled' : ''} title="Fewer numbers">${icon('minus')}</button>
         <b class="tl-maxn">${max}</b>
         <button class="tl-adjb plus" data-a="maxmore" ${max >= MAXN ? 'disabled' : ''} title="More numbers">${icon('plus')}</button>
       </div>
       <button class="tl-done" data-a="done">Done</button>`
    : `<div class="tl-line">Player <span class="tl-box ${s.bob.num==null ? 'none' : ''} ${t.rolling ? 'rolling' : ''}" data-num>${num}</span></div>
       <div class="tl-range">Numbers 1–${max}</div>`;
  return `<div class="tl-pill">${side(t, 'a', s.bob.a, s.bob.b)}
    <div class="tl-mid" ${t.editing ? '' : 'data-a="roll" title="Tap to roll"'}>${mid}</div>
    ${side(t, 'b', s.bob.b, s.bob.a)}</div>`;
}
function clickBob(t, b){
  const s = forLesson(); if(!s) return;
  const k = b.dataset.k;
  switch(b.dataset.a){
    case 'less': t.setup = Math.max(MINN, t.setup - 1); paint(t); return;
    case 'more': t.setup = Math.min(MAXN, t.setup + 1); paint(t); return;
    case 'cancel': t.setup = null; paint(t); place(t); return;
    case 'start':
      s.bob.max = t.setup; t.setup = null;
      if(s.bob.num!=null && s.bob.num > s.bob.max) s.bob.num = null;
      D().bobMax = s.bob.max; save();
      paint(t); place(t); paintIsland(t); return;
    case 'maxless': case 'maxmore':
      s.bob.max = clamp(s.bob.max + (b.dataset.a==='maxmore' ? 1 : -1), MINN, MAXN);
      if(s.bob.num!=null && s.bob.num > s.bob.max) s.bob.num = null;
      D().bobMax = s.bob.max; save();
      paint(t); paintIsland(t); return;
    case 'done': t.editing = false; paint(t); place(t); savePos(t); return;
    case 'roll': roll(t); return;
    case 'dec': s.bob[k] = Math.max(0, s.bob[k] - 1); break;
    case 'inc': s.bob[k]++; break;
    default: return;
  }
  paint(t); paintIsland(t);
  if(b.dataset.a==='inc') bump(t, t.el.querySelector(`[data-score="${k}"]`));
}
/* Roll: flicker through numbers for about a second, slowing, then land on
   one chosen up front. Pure random: the same number can come up again. */
function roll(t){
  const s = forLesson(); if(!s || !s.bob.max || t.rolling) return;
  const max = s.bob.max, target = 1 + Math.floor(rand() * max);
  t.rolling = true; paint(t);
  const steps = 14; let k = 0, shown = s.bob.num;
  const tick = ()=>{
    if(!t.el || !t.rolling) return;
    const n = t.el.querySelector('[data-num]');
    if(k >= steps){
      t.rolling = false; s.bob.num = target;
      paint(t); paintIsland(t);
      const m = t.el && t.el.querySelector('[data-num]'); if(m) m.classList.add('land');
      return;
    }
    let v; do { v = 1 + Math.floor(rand() * max); } while(max > 1 && v===shown);
    shown = v;
    if(n){ n.textContent = v; n.classList.remove('none'); }
    const p = k / steps; k++;
    t.rollT = setTimeout(tick, 40 + 180 * p * p);
  };
  tick();
}
function islandBob(){
  const s = forLesson(); if(!s) return '';
  return `<span class="isl-read tl-isl" data-tl="bob" title="Bob Up">${icon('bob', 'ico tl-iic bob')}<span class="tl-in ${s.bob.a > s.bob.b ? 'lead' : ''}">${icon('left', 'ico tl-iarr')}A</span><b class="tl-is">${s.bob.a}</b><span class="tl-dash">–</span><b class="tl-is">${s.bob.b}</b><span class="tl-in ${s.bob.b > s.bob.a ? 'lead' : ''}">B${icon('right', 'ico tl-iarr')}</span>${s.bob.num!=null ? `<span class="tl-inum">${s.bob.num}</span>` : ''}</span><button class="isl-b" data-tlx="bob" title="Close (scores are kept for this lesson)">${icon('x')}</button>`;
}

function bump(t, el){ if(!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

/* ---------------- island ---------------- */
function paintIsland(t){
  const I = window.SVIsland; if(!I) return;
  if(t.mode!=='min' || !lesson()){ I.remove('tl-' + t.key); return; }
  I.set('tl-' + t.key, t.island(t), t.key==='btt' ? 2 : 3);
}
document.addEventListener('pointerdown', e=>{
  const x = e.target.closest && e.target.closest('.island [data-tlx]');
  if(x){ e.preventDefault(); e.stopPropagation(); hide(B[x.dataset.tlx], 'closed'); return; }
  const r = e.target.closest && e.target.closest('.island [data-tl]'); if(!r) return;
  e.preventDefault(); e.stopPropagation();
  show(B[r.dataset.tl]);
}, true);

/* ---------------- lesson changes ---------------- */
function clearAll(){
  for(const t of Object.values(B)){ hide(t, 'closed'); t.setup = null; }
  S = fresh();
}
// A trip to the editor and back (keep / resume) leaves the scores alone; the
// boxes are hidden by CSS while not presenting.
window.addEventListener('sv:present', e=>{ if(!(e.detail && e.detail.resume)) clearAll(); });
window.addEventListener('sv:leave', e=>{ if(!(e.detail && e.detail.keep)) clearAll(); });

window.SVTally = {
  open,
  openBtt:()=>open('btt'),
  openBob:()=>open('bob'),
};
})();
