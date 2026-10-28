/* =====================================================================
   Slideshow Viewer — Random Name Selector
   Loaded after classes.js. Uses window.SVHost, window.SVIsland,
   window.SVClasses (class lists, absences) and window.SVPoints (awards).

   Picking (per lesson):
     - absent pupils are never picked
     - nobody is picked more than twice; once everyone present has had two
       goes, the counts reset and it carries on
     - never the same pupil twice in a row
     - pupils not yet picked are twice as likely as pupils picked once

   Saved in viewer-data.json:
     picks   { [lesson id]: { date, counts:{ [pid]: n }, last, cur } }
   Absences live in classes.js (data.absent), shared by all tools.
   Entries older than 14 days are dropped when a lesson is opened.

   In a lesson: Tools → Random Name, or the shuffle button on the rail
   (shown once a name has been picked). The name spins on a large reel in
   the centre, then settles into the island: [name] absent ×.
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const C = ()=> window.SVClasses;
const pad2 = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

const IC = iconMap({
  users: 'users', shuffle: 'shuffle', userx: 'user-x', star: 'star',
  x: 'x', check: 'check', back: 'chevron-left', grid: 'layout-grid',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- data ---------------- */
function D(){
  const h = H(); const d = h && h.data; if(!d) return null;
  if(!d.picks || typeof d.picks!=='object' || Array.isArray(d.picks)) d.picks = {};
  return d;
}
const save = ()=> H().save();
function rec(l){
  const d = D();
  return d.picks[l.id] || (d.picks[l.id] = { date:l.date || '', counts:{}, last:null, cur:null });
}
function prune(){
  const d = D(); if(!d) return;
  const cut = new Date(); cut.setDate(cut.getDate() - 14);
  const c = iso(cut);
  let changed = false;
  for(const [k, r] of Object.entries(d.picks)) if(!r || !r.date || r.date < c){ delete d.picks[k]; changed = true; }
  if(changed) save();
}
const present = (l, cls) => { const ab = C().absentSet(l.id); return C().active(cls).filter(p=>!ab.has(p.id)); };

function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }

// Chooses the next pupil (see the rules at the top). Returns null if nobody is in.
function choose(l, cls){
  const r = rec(l), all = present(l, cls);
  if(!all.length) return null;
  if(all.length===1) return all[0];
  const n = id => r.counts[id] || 0;
  let pool = all.filter(p=>n(p.id) < 2 && p.id!==r.last);
  if(!pool.length){ r.counts = {}; pool = all.filter(p=>p.id!==r.last); }
  const w = pool.map(p=>n(p.id) ? 1 : 2);
  let x = rand() * w.reduce((a,b)=>a+b, 0);
  for(let i=0; i<pool.length; i++){ x -= w[i]; if(x < 0) return pool[i]; }
  return pool[pool.length-1];
}
function commitPick(l, p){
  const r = rec(l);
  r.counts[p.id] = (r.counts[p.id] || 0) + 1;
  r.last = p.id; r.cur = p.id;
  save();
}
function current(l){
  if(!l || !D()) return null;
  const r = D().picks[l.id]; if(!r || !r.cur) return null;
  const cls = C().classFor(l); if(!cls) return null;
  const p = C().active(cls).find(x=>x.id===r.cur);
  return p ? { p, cls, name:C().nameMap(cls).get(p.id) } : null;
}

/* ---------------- the overlay ---------------- */
let ov = null; // { back, card, l, cls, mode, sheet, spinning, auto, collapseT, flash }
const ROW = ()=> Math.round(Math.min(150, window.innerHeight * 0.16));

function ensure(){
  if(ov) return;
  const back = el('div', 'ap-back rn-back'), card = el('div', 'ap rn');
  back.appendChild(card); document.body.appendChild(back);
  back.addEventListener('pointerdown', e=>{ if(e.target===back && !ov.spinning) collapse(); });
  card.addEventListener('pointerdown', ()=>{ if(ov){ ov.auto = false; clearTimeout(ov.collapseT); } });
  card.addEventListener('click', onClick);
  ov = { back, card, mode:null, sheet:false, spinning:false, auto:false, flash:'' };
}
function shut(){
  if(!ov) return;
  clearTimeout(ov.collapseT); clearTimeout(ov.flashT);
  ov.back.remove(); ov = null;
}

// Tools → Random Name, the rail button, or "Pick again": spin straight away.
function open(){
  const l = H().lesson;
  if(!l){ H().toast('Open a lesson to pick a name.'); return; }
  if(window.SVPoints) window.SVPoints.close();
  ensure();
  ov.l = l; ov.sheet = false; ov.flash = '';
  spin();
}
// From the island: show the current name without spinning.
function show(sheet){
  const l = H().lesson; const c = current(l); if(!c) return;
  ensure();
  Object.assign(ov, { l, cls:c.cls, mode:'result', sheet:!!sheet, auto:false, flash:'' });
  paint();
}

function spin(){
  const l = ov.l;
  ov.cls = C().classFor(l);
  ov.sheet = false;
  if(!ov.cls){ ov.mode = 'choose'; paint(); return; }
  const p = choose(l, ov.cls);
  if(!p){ ov.mode = 'empty'; paint(); return; }
  commitPick(l, p);
  ov.mode = 'reel'; ov.spinning = true; ov.auto = true;
  clearTimeout(ov.collapseT);
  paint(p);
}

function headHTML(){
  const l = ov.l, cls = ov.cls;
  const inN = cls ? present(l, cls).length : 0, abN = cls ? C().active(cls).length - inN : 0;
  return `<div class="ap-head">
    <div class="ap-title">${icon('shuffle', 'ico rn-ic')}Random Name</div>
    ${cls ? `<span class="ap-chip">${esc(cls)}</span><span class="ap-total"><b>${inN}</b> in${abN ? ` · <b>${abN}</b> absent` : ''}</span>` : ''}
    <div class="grow"></div>
    ${cls && ov.mode!=='register' ? `<button class="clk-btn" data-n="register" ${ov.spinning ? 'disabled' : ''}>${icon('users')}Who's in?</button>` : ''}
    <button class="tb-ic" data-n="close" title="Close" ${ov.spinning ? 'disabled' : ''}>${icon('x')}</button>
  </div>`;
}

function paint(pick){
  if(!ov) return;
  const { card, mode } = ov;
  card.className = 'ap rn rn-' + mode;
  if(mode==='choose'){
    const list = C().allClasses().filter(k=>C().active(k).length);
    card.innerHTML = headHTML() + `<p class="ap-msg">${list.length ? `There's no class list for <b>${esc(ov.l.label || 'this lesson')}</b>. Which class is this?` : `No class lists yet. Add them on the dashboard: <b>Classes</b>.`}</p>
      <div class="ap-choices">${list.map(k=>`<button class="clk-btn" data-use="${esc(k)}">${esc(k)}<small>${C().active(k).length}</small></button>`).join('')}</div>`;
    return;
  }
  if(mode==='empty'){
    card.innerHTML = headHTML() + `<div class="rn-stage"><p class="ap-msg">Everyone is marked absent.</p></div>
      <div class="ap-foot"><div class="ap-sum"></div><button class="clk-btn primary lg" data-n="register">${icon('users')}Who's in?</button></div>`;
    return;
  }
  if(mode==='register'){ paintRegister(); return; }

  // reel / result
  const rh = ROW();
  const c = current(ov.l);
  const names = C().nameMap(ov.cls);
  let strip, stop;
  if(mode==='reel' && pick){
    const pool = present(ov.l, ov.cls).map(p=>names.get(p.id));
    const target = names.get(pick.id);
    const others = pool.filter(n=>n!==target);
    const any = ()=> others.length ? others[Math.floor(rand() * others.length)] : target;
    strip = [];
    const LEN = 30;
    for(let i=0; i<LEN; i++){
      let n = any();
      if(others.length > 1) for(let k=0; k<4 && n===strip[i-1]; k++) n = any();
      strip.push(n);
    }
    stop = LEN - 2; strip[stop] = target;
  } else {
    strip = [c ? c.name : '']; stop = 0;
  }
  card.innerHTML = headHTML() + `<div class="rn-stage">
      <div class="rn-window" style="--rh:${rh}px">
        <div class="rn-band"></div>
        <div class="rn-strip">${strip.map((n, i)=>`<div class="rn-row ${i===stop ? 'hit' : ''}">${esc(n)}</div>`).join('')}</div>
      </div>
    </div>
    <div class="ap-foot">${footHTML()}</div>
    ${ov.sheet ? sheetHTML() : ''}`;
  if(mode==='reel' && pick){
    const s = $('.rn-strip', card);
    const anim = s.animate([{ transform:'translateY(0)' }, { transform:`translateY(${-stop * rh}px)` }],
      { duration:2300, easing:'cubic-bezier(.12,.72,.18,1.02)', fill:'forwards' });
    anim.onfinish = ()=>{
      if(!ov || ov.mode!=='reel') return;
      ov.spinning = false; ov.mode = 'result';
      card.className = 'ap rn rn-result';
      // Swap in the result controls without redrawing the reel.
      const head = $('.ap-head', card); head.outerHTML = headHTML();
      $('.ap-foot', card).innerHTML = footHTML();
      if(ov.auto) ov.collapseT = setTimeout(()=>{ if(ov && ov.auto) collapse(); }, 4000);
    };
  }
}
function footHTML(){
  if(ov.mode==='reel') return `<div class="ap-sum"></div>`;
  const c = current(ov.l);
  return `<div class="ap-sum">${ov.flash ? `<span class="ap-flash">${icon('check')}${esc(ov.flash)}</span>` : ''}</div>
    ${c ? `<button class="clk-btn lg rn-award" data-n="award">${icon('star', 'ico rn-star')}Award</button>
    <button class="clk-btn lg" data-n="absent" title="Mark absent and pick someone else">${icon('userx')}Absent</button>
    ${window.SVBox4 && window.SVBox4.hasEmpty(ov.l) ? `<button class="clk-btn lg" data-n="box" title="Put this pupil in the next empty box">${icon('grid')}To box</button>` : ''}` : ''}
    <button class="clk-btn primary lg" data-n="again">${icon('shuffle')}Pick again</button>`;
}
function sheetHTML(){
  const c = current(ov.l); if(!c) return '';
  const cats = window.SVPoints ? window.SVPoints.catsFor(ov.l) : [];
  return `<div class="ap-sheet-back" data-n="sheet-close"><div class="ap-sheet rn-sheet">
    <div class="ap-head"><div class="ap-title">${icon('star', 'ico star')}${esc(c.name)}</div><div class="grow"></div><button class="tb-ic" data-n="sheet-close" title="Back">${icon('x')}</button></div>
    <div class="rn-cats">${cats.map(k=>`<button class="ap-cat" data-cat="${esc(k.id)}" style="--c:${esc(k.color)}"><i></i><span>${esc(k.name)}</span></button>`).join('')}</div>
  </div></div>`;
}

/* Register: who's in today. Tap a name to mark them absent (or back in). */
function tileFit(n){
  if(n<=4)  return { cols:2, row:170, col:'320px', fs:32, big:true };
  if(n<=6)  return { cols:3, row:170, col:'300px', fs:30, big:true };
  if(n<=9)  return { cols:3, row:150, col:'300px', fs:28, big:true };
  if(n<=12) return { cols:4, row:130, col:'260px', fs:26, big:true };
  if(n<=16) return { cols:4, row:112, col:'1fr', fs:24, big:true };
  if(n<=20) return { cols:5, row:96, col:'1fr', fs:22, big:false };
  return { cols:5, row:76, col:'1fr', fs:20, big:false };
}
function paintRegister(){
  const { card, l, cls } = ov;
  const names = C().nameMap(cls);
  const pupils = C().active(cls).slice().sort((a,b)=>names.get(a.id).localeCompare(names.get(b.id), 'en-GB', { sensitivity:'base' }));
  const ab = C().absentSet(l.id);
  const fit = tileFit(pupils.length);
  card.innerHTML = headHTML() + `<div class="ap-pupils rn-reg ${fit.big ? 'big' : ''}" style="--cols:${fit.cols};--rows:${Math.ceil(pupils.length / fit.cols)};--rmax:${fit.row}px;--cmax:${fit.col};--fs:${fit.fs}px">${pupils.map(p=>`<button class="ap-p ${ab.has(p.id) ? 'abs' : ''}" data-pid="${esc(p.id)}"><span class="nm">${esc(names.get(p.id))}</span>${ab.has(p.id) ? '<span class="rn-abs">Absent</span>' : ''}</button>`).join('')}</div>
    <div class="ap-foot"><div class="ap-sum">Tap a name to mark them absent. Absent pupils are never picked and are greyed out in Achievement Points.</div>
    <button class="clk-btn primary lg" data-n="reg-done">${icon('check')}Done</button></div>`;
}
function registerDone(){
  if(current(ov.l)){ ov.mode = 'result'; ov.auto = false; paint(); }
  else spin();
}

function onClick(e){
  if(!ov) return;
  const t = e.target;
  const b = t.closest('button, [data-n]'); if(!b) return;
  if(b.disabled) return;
  if(b.dataset.use){ ov.l.classKey = b.dataset.use; save(); spin(); return; }
  if(b.dataset.pid && ov.mode==='register'){
    const id = b.dataset.pid;
    C().setAbsent(ov.l, id, !C().absentSet(ov.l.id).has(id));
    paint(); return;
  }
  if(b.dataset.cat){ award(b.dataset.cat); return; }
  if(ov.spinning) return;
  switch(b.dataset.n){
    case 'close': collapse(); break;
    case 'register': ov.mode = 'register'; ov.sheet = false; paint(); break;
    case 'reg-done': registerDone(); break;
    case 'again': ov.flash = ''; spin(); break;
    case 'absent': absentAgain(); break;
    case 'award': ov.sheet = true; paint(); break;
    case 'box': toBox(); break;
    case 'sheet-close': if(b.classList.contains('tb-ic') || t===b){ ov.sheet = false; paint(); } break;
  }
}
function award(catId){
  const c = current(ov.l); if(!c || !window.SVPoints) return;
  const cat = window.SVPoints.award(ov.l, c.p.id, catId);
  if(!cat) return;
  ov.sheet = false; ov.flash = `${cat.name} → ${c.name}`;
  paint();
  // Settle back into the island shortly afterwards (unless the teacher carries on).
  ov.auto = true; clearTimeout(ov.collapseT);
  ov.collapseT = setTimeout(()=>{ if(ov && ov.auto) collapse(); }, 1500);
}
// Box of Four: the chosen pupil goes into the next empty box.
function toBox(){
  const c = current(ov.l); if(!c || !window.SVBox4) return;
  const i = window.SVBox4.sendNext(ov.l, c.p.id);
  if(i < 0) return;
  ov.flash = `${c.name} → Box ${i+1}`;
  paint();
  ov.auto = true; clearTimeout(ov.collapseT);
  ov.collapseT = setTimeout(()=>{ if(ov && ov.auto) collapse(); }, 1500);
}
function absentAgain(){
  const l = H().lesson, c = current(l); if(!c) return;
  C().setAbsent(l, c.p.id, true);
  // They didn't get a go, so it doesn't count towards their two.
  const r = rec(l); if(r.counts[c.p.id]) r.counts[c.p.id]--;
  r.cur = null; save();
  if(!ov){ ensure(); ov.l = l; }
  ov.flash = '';
  spin();
}
function clearCur(){
  const l = H().lesson; if(!l || !D()) return;
  const r = D().picks[l.id]; if(r){ r.cur = null; save(); }
  shut(); paintIsland();
}

// Close the overlay; the name flies up into its place in the island.
function collapse(){
  if(!ov) return;
  clearTimeout(ov.collapseT);
  const src = ov.mode==='result' && $('.rn-row.hit', ov.card);
  paintIsland();
  const tgt = $('.island [data-k=names] .isl-nm');
  if(!src || !tgt){ shut(); return; }
  const a = src.getBoundingClientRect(), b = tgt.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(src).fontSize);
  const fly = el('div', 'rn-fly', esc(src.textContent));
  Object.assign(fly.style, { left:a.left + 'px', top:a.top + 'px', width:a.width + 'px', height:a.height + 'px', fontSize:fs + 'px' });
  document.body.appendChild(fly);
  tgt.style.opacity = '0';
  const s = parseFloat(getComputedStyle(tgt).fontSize) / fs;
  const dx = (b.left + b.width/2) - (a.left + a.width/2), dy = (b.top + b.height/2) - (a.top + a.height/2);
  ov.back.classList.add('fading');
  ov.card.style.visibility = 'hidden';
  fly.animate([{ transform:'translate(0,0) scale(1)' }, { transform:`translate(${dx}px,${dy}px) scale(${s})` }],
    { duration:520, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards' }).onfinish = ()=>{
      tgt.style.opacity = ''; fly.remove();
    };
  const back = ov.back; ov = null;
  setTimeout(()=>back.remove(), 380);
}

/* ---------------- island + rail ---------------- */
function paintIsland(){
  const I = window.SVIsland, h = H(); if(!I || !h || !D()) return;
  const c = current(h.lesson);
  if(!c){ I.remove('names'); syncRail(false); return; }
  I.set('names', `<span class="isl-read" data-nm="open" title="Show the name">${icon('shuffle')}<span class="isl-nm">${esc(c.name)}</span></span>`
    + `<button class="isl-b" data-nm="absent" title="Absent: pick someone else">${icon('userx')}</button>`
    + `<button class="isl-b" data-nm="clear" title="Clear the name">${icon('x')}</button>`, -1);
  syncRail(true);
}
function syncRail(want){
  const slot = $('#tools-slot'); if(!slot) return;
  let b = slot.querySelector('[data-nm=rail]');
  if(want && !b){ b = el('button', 'rail-btn rn-rail', icon('shuffle')); b.dataset.nm = 'rail'; b.title = 'Pick another name'; slot.appendChild(b); }
  else if(!want && b) b.remove();
}
document.addEventListener('pointerdown', e=>{
  const b = e.target.closest && e.target.closest('.island [data-nm]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  switch(b.dataset.nm){
    case 'open': show(false); break;
    case 'award': show(true); break;
    case 'absent': absentAgain(); break;
    case 'clear': clearCur(); break;
  }
}, true);
document.addEventListener('click', e=>{
  const b = e.target.closest && e.target.closest('.rail [data-nm=rail]'); if(!b) return;
  if(ov && ov.spinning) return;
  open();
});
window.addEventListener('sv:present', ()=>{ prune(); paintIsland(); });
window.addEventListener('sv:leave', ()=>{ shut(); if(window.SVIsland) window.SVIsland.remove('names'); });
window.addEventListener('sv:absent', ()=>{ if(!ov) paintIsland(); });

/* ---------------- keys ---------------- */
// While the overlay is open, keys stay with it. Space / Enter / the clicker pick again.
window.addEventListener('keydown', e=>{
  if(!ov) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key==='F11') return;
  e.stopPropagation();
  const k = e.key;
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' ','Enter'].includes(k)) e.preventDefault();
  if(ov.spinning) return;
  ov.auto = false; clearTimeout(ov.collapseT);
  if(k==='Escape'){
    e.preventDefault();
    if(ov.sheet){ ov.sheet = false; paint(); }
    else if(ov.mode==='register') registerDone();
    else collapse();
    return;
  }
  if(ov.mode==='register'){ if(k==='Enter') registerDone(); return; }
  if(ov.sheet) return;
  if([' ','Enter','PageDown','ArrowRight'].includes(k) && (ov.mode==='result' || ov.mode==='empty' && k==='Enter')){ ov.flash = ''; spin(); }
}, true);

window.SVNames = { open, show, close:shut };
})();
