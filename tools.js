/* =====================================================================
   Slideshow Viewer — classroom tools
   Loaded after app.js. Uses:
     window.SVHost   { data, save() }   the app's saved data (alarms live in data.alarms)
     window.SVIsland { set(key, html), remove(key) }   readouts in the top-bar island
   Opened from the Tools button on the presenter rail: SVTools.openBox().

   Clock tool
     Timer      one at a time, in memory (carries across lessons, not reloads)
     Stopwatch  one at a time, in memory
     Alarms     any number, saved in viewer-data.json as { id, at (ms), title }
   When a timer ends or an alarm goes off a pop-up shows until it's dismissed
   (no sound in version 1). Works on the dashboard too.
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad2 = n => String(n).padStart(2,'0');
const uid = ()=> Math.random().toString(36).slice(2,9);
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const host = ()=> window.SVHost || null;

const IC = iconMap({
  clock: 'clock', timer: 'timer', stopwatch: 'timer', alarm: 'alarm-clock',
  pause: 'pause', play: 'play', trash: 'trash-2', x: 'x',
  back: 'chevron-left', up: 'chevron-up', down: 'chevron-down', plus: 'plus',
  reset: 'rotate-ccw', star: 'star', users: 'users',
  blur: 'blend', bksp: 'delete', shift: 'arrow-big-up',
  grid: 'layout-grid', vs: 'swords', bob: 'user-round', dice: 'dices', ghost: 'ghost', cane: 'candy-cane',
  sb: 'brick-wall', hungry: 'dinosaur', unjumble: 'shuffle', splat: 'splat',
  noughts: 'tic-tac-toe', connect4: 'connect-four', bomb: 'bomb', board: 'presentation',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- state ---------------- */
const T = { timer:null, sw:null };
// timer: { total (ms), endAt (ms, when running), left (ms, when paused), paused }
// sw:    { startAt (ms, when running), acc (ms), running }
function timerLeft(){ const t = T.timer; if(!t) return 0; return t.paused ? t.left : Math.max(0, t.endAt - Date.now()); }
function swElapsed(){ const s = T.sw; if(!s) return 0; return s.acc + (s.running ? Date.now() - s.startAt : 0); }
function alarms(){ const h = host(); if(!h || !h.data) return null; if(!Array.isArray(h.data.alarms)) h.data.alarms = []; return h.data.alarms; }
function saveAlarms(){ const h = host(); if(h) h.save(); }

function fmtClock(ms, ceil){
  let s = ceil ? Math.ceil(ms/1000) : Math.floor(ms/1000);
  const h = Math.floor(s/3600); s -= h*3600; const m = Math.floor(s/60); s -= m*60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
function untilText(ms){
  if(ms < 60000) return 'under 1 min';
  const m = Math.ceil(ms/60000);
  if(m < 60) return m + ' min';
  const h = Math.floor(m/60), r = m % 60;
  return h + ' h' + (r ? ' ' + r + ' min' : '');
}
const hhmm = at => { const d = new Date(at); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
function alarmAt(h, m){
  const n = new Date(), d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, 0, 0);
  if(d.getTime() <= n.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function isTomorrow(at){ const n = new Date(), d = new Date(at); return d.toDateString()!==n.toDateString(); }

/* ---------------- dual screen ----------------
   On the teacher console (dual screen), the Clock is set privately: the box opens on
   the console only, and every action is sent to the pupil window, which runs the real
   timer, stopwatch and alarms (SVDual.clock → remote() there). The console copies the
   pupil's timer/stopwatch back from its state reports (setRemote), so the box shows the
   right thing. Timer/stopwatch changes are also applied here straight away so the box
   responds at once; alarms change in the console's data without saving (the pupil
   window saves, and its data comes back). */
const remoteOn = ()=> !!(window.SVDual && window.SVDual.consoleLinked && window.SVDual.consoleLinked());
function viaPupil(op, args){ if(!remoteOn()) return false; window.SVDual.clock(op, args); return true; }

/* ---------------- timer / stopwatch actions ---------------- */
function startTimer(ms){ if(ms <= 0) return; viaPupil('startTimer', [ms]); T.timer = { total:ms, endAt:Date.now() + ms, left:ms, paused:false }; tick(); }
function toggleTimer(){
  const t = T.timer; if(!t) return;
  viaPupil('toggleTimer', []);
  if(t.paused){ t.endAt = Date.now() + t.left; t.paused = false; }
  else { t.left = Math.max(0, t.endAt - Date.now()); t.paused = true; }
  tick();
}
function addTimer(ms){ const t = T.timer; if(!t) return; viaPupil('addTimer', [ms]); if(t.paused) t.left += ms; else t.endAt += ms; t.total += ms; tick(); }
function clearTimer(){ viaPupil('clearTimer', []); T.timer = null; tick(); }
function startSw(){ viaPupil('startSw', []); T.sw = { startAt:Date.now(), acc:0, running:true }; tick(); }
function toggleSw(){
  const s = T.sw; if(!s){ startSw(); return; }
  viaPupil('toggleSw', []);
  if(s.running){ s.acc += Date.now() - s.startAt; s.running = false; }
  else { s.startAt = Date.now(); s.running = true; }
  tick();
}
function clearSw(){ viaPupil('clearSw', []); T.sw = null; tick(); }
function addAlarm(at, title){ const r = viaPupil('addAlarm', [at, title]); const a = alarms(); if(!a) return; a.push({ id:uid(), at, title:(title || '').trim().slice(0, 40) }); a.sort((x,y)=>x.at - y.at); if(!r) saveAlarms(); tick(); }
function removeAlarm(id){ const r = viaPupil('removeAlarm', [id]); const a = alarms(); if(!a) return; const i = a.findIndex(x=>x.id===id); if(i>=0){ a.splice(i,1); if(!r) saveAlarms(); } tick(); }

/* ---------------- island readouts ---------------- */
function islandTimer(){
  const t = T.timer, ms = timerLeft();
  const cls = t.paused ? 'paused' : ms <= 10000 ? 'red' : ms <= 60000 ? 'amber' : '';
  return `<span class="isl-read" data-open="timer">${icon('timer')}<span class="isl-t ${cls}">${fmtClock(ms, true)}</span></span>`
    + `<button class="isl-b" data-ta="timer-toggle" title="${t.paused ? 'Resume' : 'Pause'}">${icon(t.paused ? 'play' : 'pause')}</button>`
    + `<button class="isl-b" data-ta="timer-bin" title="Stop timer">${icon('trash')}</button>`;
}
function islandSw(){
  const s = T.sw;
  return `<span class="isl-read" data-open="stopwatch">${icon('stopwatch')}<span class="isl-t ${s.running ? '' : 'paused'}">${fmtClock(swElapsed())}</span></span>`
    + `<button class="isl-b" data-ta="sw-toggle" title="${s.running ? 'Pause' : 'Resume'}">${icon(s.running ? 'pause' : 'play')}</button>`
    + `<button class="isl-b" data-ta="sw-bin" title="Stop stopwatch">${icon('trash')}</button>`;
}
function islandAlarm(list){
  const a = list[0], more = list.length - 1;
  return `<span class="isl-read" data-open="alarm">${icon('alarm')}<span class="isl-a"><b>${untilText(a.at - Date.now())}</b> until <span class="isl-at">${esc(a.title || 'alarm')}</span></span>${more > 0 ? `<span class="isl-more">+${more}</span>` : ''}</span>`;
}
function paintIsland(){
  const I = window.SVIsland; if(!I) return;
  if(T.timer) I.set('timer', islandTimer(), 1); else I.remove('timer');
  if(T.sw) I.set('stopwatch', islandSw(), 2); else I.remove('stopwatch');
  const a = alarms();
  if(a && a.length) I.set('alarm', islandAlarm(a), 3); else I.remove('alarm');
}
// Island buttons act on pointerdown: the readout is redrawn every second, which
// can swallow a click that spans a redraw.
document.addEventListener('pointerdown', e=>{
  const b = e.target.closest && e.target.closest('.island [data-ta], .island [data-open]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const a = b.dataset.ta;
  if(a==='timer-toggle') toggleTimer();
  else if(a==='timer-bin') clearTimer();
  else if(a==='sw-toggle') toggleSw();
  else if(a==='sw-bin') clearSw();
  else if(b.dataset.open) openClock(b.dataset.open);
}, true);

/* ---------------- ticking, firing ---------------- */
let firstCheck = true;
const MISSED_MS = 10 * 60000; // alarms missed by more than this while the app was closed are dropped quietly
function tick(){
  if(T.timer && !T.timer.paused && Date.now() >= T.timer.endAt){
    const total = T.timer.total; T.timer = null;
    if(!remoteOn()) fire({ kind:'timer', total }); // console: the pupil window rings
  }
  // Dual screen: the pupil window runs the alarms, so they don't go off twice.
  const a = window.SVDual && SVDual.consoleLinked() ? null : alarms();
  if(a){
    const now = Date.now(), due = a.filter(x=>x.at <= now);
    if(due.length){
      for(const x of due) a.splice(a.indexOf(x), 1);
      saveAlarms();
      for(const x of due) if(!(firstCheck && now - x.at > MISSED_MS)) fire({ kind:'alarm', title:x.title, at:x.at });
    }
    firstCheck = false;
  }
  paintIsland();
  if(box) paintBoxLive();
}
setInterval(tick, 250);

/* ---------------- alert pop-up (sounds are left out of version 1) ---------------- */
const alerts = [];
function fire(item){ alerts.push(item); paintAlert(true); }
// The pop-in animation sits on .al-wrap, outside the scrolling .clk-alert, so the
// brief overshoot can't flash scrollbars. It only plays when a new alert fires,
// not when one of several is dismissed.
function paintAlert(pop){
  let back = $('.clk-alert-back');
  if(!alerts.length){ if(back) back.remove(); return; }
  if(!back){
    back = el('div','clk-alert-back');
    back.addEventListener('click', e=>{
      const b = e.target.closest('[data-al]'); if(!b) return;
      const i = Number(b.dataset.i), it = alerts[i]; if(!it) return;
      alerts.splice(i, 1);
      if(b.dataset.al==='restart') startTimer(it.total);
      paintAlert();
    });
    document.body.appendChild(back);
  }
  back.innerHTML = `<div class="al-wrap${pop ? ' pop' : ''}"><div class="clk-alert">${alerts.map((it, i)=>{
    const timer = it.kind==='timer';
    return `<div class="al-item">
      <div class="al-ico">${icon(timer ? 'timer' : 'alarm')}</div>
      <div class="al-t">${timer ? "Time's up" : esc(it.title || 'Alarm')}</div>
      <div class="al-s">${timer ? fmtClock(it.total, true) + ' timer' : 'Alarm · ' + hhmm(it.at)}</div>
      <div class="al-btns">${timer ? `<button class="clk-btn" data-al="restart" data-i="${i}">${icon('reset')}Restart ${fmtClock(it.total, true)}</button>` : ''}<button class="clk-btn primary" data-al="ok" data-i="${i}">Dismiss</button></div>
    </div>`;
  }).join('')}</div></div>`;
}

/* ---------------- scroll wheel (touch-friendly number picker) ---------------- */
// Native scrolling with snap, so a finger flick works like a phone's picker.
// A mouse can drag it too; the mouse wheel steps it; ▲ ▼ step by one (hold to repeat).
const WH = 64; // item height, px
function Wheel(max, value, onChange){
  const root = el('div','wheel');
  let items = '';
  for(let i=0;i<=max;i++) items += `<div class="wh-i" data-v="${i}">${pad2(i)}</div>`;
  root.innerHTML = `<button class="wh-step" data-d="-1" tabindex="-1">${icon('up')}</button>
    <div class="wh-frame"><div class="wh-view"><div class="wh-list">${items}</div></div></div>
    <button class="wh-step" data-d="1" tabindex="-1">${icon('down')}</button>`;
  const view = root.querySelector('.wh-view');
  let cur = value, settle = null, drag = null, lastType = '';
  const clamp = v => Math.max(0, Math.min(max, v));
  const read = ()=> clamp(Math.round(view.scrollTop / WH));
  const mark = v => { const on = view.querySelector('.wh-i.on'); if(on && on.dataset.v==String(v)) return; if(on) on.classList.remove('on'); const n = view.querySelector(`.wh-i[data-v="${v}"]`); if(n) n.classList.add('on'); };
  const set = (v, smooth)=>{ v = clamp(v); view.scrollTo({ top:v*WH, behavior: smooth ? 'smooth' : 'auto' }); mark(v); if(v!==cur){ cur = v; onChange && onChange(v); } };
  view.addEventListener('scroll', ()=>{
    const v = read(); mark(v);
    if(v!==cur){ cur = v; onChange && onChange(v); }
    clearTimeout(settle);
    if(!drag) settle = setTimeout(()=>{ if(Math.abs(view.scrollTop - v*WH) > 1) view.scrollTo({ top:v*WH, behavior:'smooth' }); }, 140);
  }, { passive:true });
  view.addEventListener('pointerdown', e=>{
    lastType = e.pointerType;
    if(e.pointerType!=='mouse') return;
    e.preventDefault();
    drag = { y:e.clientY, top:view.scrollTop, moved:false };
    view.setPointerCapture(e.pointerId); view.classList.add('dragging');
  });
  view.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dy = e.clientY - drag.y; if(Math.abs(dy) > 4) drag.moved = true;
    view.scrollTop = drag.top - dy;
  });
  const endDrag = e=>{
    if(!drag) return;
    const moved = drag.moved; drag = null; view.classList.remove('dragging');
    if(moved){ set(read(), true); return; }
    // A mouse click on a number picks it.
    const r = view.getBoundingClientRect();
    set(Math.floor((view.scrollTop + (e.clientY - r.top) - 2*WH) / WH), true);
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', ()=>{ if(drag){ drag = null; view.classList.remove('dragging'); set(read(), true); } });
  view.addEventListener('click', e=>{ if(lastType==='mouse') return; const i = e.target.closest('.wh-i'); if(i) set(Number(i.dataset.v), true); });
  // ▲ / ▼ — hold to repeat
  root.querySelectorAll('.wh-step').forEach(b=>{
    let rep = null;
    const stop = ()=>{ clearTimeout(rep); clearInterval(rep); rep = null; };
    b.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const d = Number(b.dataset.d);
      set(cur + d, true);
      stop(); rep = setTimeout(()=>{ rep = setInterval(()=>set(cur + d, false), 90); }, 420);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(t=>b.addEventListener(t, stop));
  });
  return {
    el: root,
    mount(){ view.scrollTop = cur * WH; mark(cur); },
    get value(){ return cur; },
    set(v, smooth){ set(v, smooth); },
  };
}

/* ---------------- on-screen keyboard ---------------- */
const KB_ROWS = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l',"'"],
  ['shift','z','x','c','v','b','n','m','-','bksp'],
  ['clear','space','.'],
];
function Keyboard(onKey){
  const root = el('div','kb');
  let shift = true; // first letter capital
  const paint = ()=>{
    root.innerHTML = KB_ROWS.map(r=>`<div class="kb-row">${r.map(k=>{
      if(k==='shift') return `<button class="kb-k wide ${shift ? 'on' : ''}" data-k="shift" title="Capital">${icon('shift')}</button>`;
      if(k==='bksp') return `<button class="kb-k wide" data-k="bksp" title="Delete">${icon('bksp')}</button>`;
      if(k==='space') return `<button class="kb-k space" data-k=" ">space</button>`;
      if(k==='clear') return `<button class="kb-k wide txt" data-k="clear">Clear</button>`;
      const c = shift && /[a-z]/.test(k) ? k.toUpperCase() : k;
      return `<button class="kb-k" data-k="${esc(c)}">${esc(c)}</button>`;
    }).join('')}</div>`).join('');
  };
  paint();
  // Keys act on pointerdown so fast typing on a touch panel isn't lost; holding Delete repeats.
  let rep = null;
  const stop = ()=>{ clearTimeout(rep); clearInterval(rep); rep = null; };
  root.addEventListener('pointerdown', e=>{
    const b = e.target.closest('.kb-k'); if(!b) return;
    e.preventDefault();
    const k = b.dataset.k;
    b.classList.add('down'); setTimeout(()=>b.classList.remove('down'), 120);
    if(k==='shift'){ shift = !shift; paint(); return; }
    onKey(k);
    if(k==='bksp'){ stop(); rep = setTimeout(()=>{ rep = setInterval(()=>onKey('bksp'), 80); }, 450); }
    if(shift && k.length===1 && /[A-Z]/.test(k)){ shift = false; paint(); }
  });
  ['pointerup','pointerleave','pointercancel'].forEach(t=>root.addEventListener(t, stop));
  return { el:root, setShift(v){ if(shift!==v){ shift = v; paint(); } } };
}

/* ---------------- the box: tools grid → Clock ---------------- */
// group: 'tool' | 'game'. col: tile colour class (see styles.css .tb-tile.c-*).
const TOOLS = [
  { id:'clock', label:'Clock', icon:'clock', group:'tool', col:'grey', ready:true },
  { id:'points', label:'Achievement Points', icon:'star', group:'tool', col:'yellow', ready:true },
  { id:'names', label:'Random Name', icon:'users', group:'tool', col:'green', ready:true },
  { id:'sb', label:'Sentence Builder', icon:'sb', group:'tool', col:'blue', ready:true },
  { id:'box4', label:'Box of Four', icon:'grid', group:'tool', col:'green', ready:true },
  { id:'whiteboard', label:'Whiteboard', icon:'board', group:'tool', col:'blue', ready:true },
  { id:'btt', label:'Beat the Teacher', icon:'vs', group:'game', col:'purple', ready:true },
  { id:'bob', label:'Bob Up', icon:'bob', group:'game', col:'purple', ready:true },
  { id:'chance', label:'Game of Chance', icon:'dice', group:'game', col:'purple', ready:true },
  { id:'unjumble', label:'Sentence Unjumble', icon:'unjumble', group:'game', col:'purple', ready:true },
  { id:'hungry', label:'Hungry Translations', icon:'hungry', group:'game', col:'purple', ready:true },
  { id:'splat', label:'Splat', icon:'splat', group:'game', col:'purple', ready:true },
  { id:'noughts', label:'Noughts & Crosses', icon:'noughts', group:'game', col:'purple', ready:true },
  { id:'connect4', label:'Connect 4', icon:'connect4', group:'game', col:'purple', ready:true },
];
// Tool icons (v1.68, slide shortcuts): the Lucide icon each tool starts with, and its tile colour.
const TOOL_ICON = { clock:'timer', points:'star', names:'users', sb:'brick-wall', box4:'layout-grid', mission:'bomb',
  btt:'swords', bob:'user-round', chance:'dices', unjumble:'shuffle', hungry:'dinosaur', splat:'splat', noughts:'tic-tac-toe', connect4:'connect-four', whiteboard:'presentation' };
const COL_HEX = { grey:'#6B7280', yellow:'#D99A00', green:'#1E9E5A', blue:'#2F5BEA', orange:'#E0701A', purple:'#7B3FB5' };
let box = null;    // { back, card, page:'grid'|'clock', tab, wheels, kb, title }
let lastTab = 'timer';
let timerSetting = { m:5, s:0 };

function openBox(){ ensureBox(); showGrid(); }
function openClock(tab){ ensureBox(); showClock(tab || lastTab); }
function closeBox(){ if(!box) return; box.back.remove(); box = null; }
function ensureBox(){
  if(box) return;
  const back = el('div','tb-back'), card = el('div','tb');
  back.appendChild(card);
  back.addEventListener('pointerdown', e=>{ if(e.target===back) closeBox(); });
  document.body.appendChild(back);
  box = { back, card, page:null };
  card.addEventListener('click', onBoxClick);
}
function showGrid(){
  box.page = 'grid';
  box.card.className = 'tb tb-grid';
  // Seasonal modes rename Game of Chance (chance.js): Trick or Treat! / Christmas Cracker.
  const look = t => t.id==='chance' && window.SVChance && SVChance.look ? SVChance.look() : null;
  const tile = t => { const lk = look(t); return `<button class="tb-tile c-${t.col}" data-tool="${t.id}" ${t.ready ? '' : 'disabled'}>${icon(lk ? lk.icon : t.icon)}<span>${esc(lk ? lk.name : t.label)}</span>${t.ready ? '' : '<em>Coming soon</em>'}</button>`; };
  // Fixed columns keep the popup width constant; extra tiles wrap onto a new row.
  const group = (label, g, cols) => {
    const items = TOOLS.filter(t=>t.group===g);
    return `<section class="tb-group"><h3 class="tb-glabel">${label}</h3><div class="tb-tiles" style="--cols:${cols}">${items.map(tile).join('')}</div></section>`;
  };
  box.card.innerHTML = `<div class="tb-head"><div class="tb-title">Tools</div><button class="tb-ic" data-b="close" title="Close">${icon('x')}</button></div>
    <div class="tb-groups">${group('Tools','tool',3)}${group('Games','game',4)}</div>`;
}
function showClock(tab){
  box.page = 'clock'; box.tab = tab; lastTab = tab;
  box.card.className = 'tb tb-clock';
  const dot = k => (k==='timer' && T.timer) || (k==='stopwatch' && T.sw) || (k==='alarm' && (alarms() || []).length) ? '<i class="tab-dot"></i>' : '';
  box.card.innerHTML = `<div class="tb-head">
      <button class="tb-ic" data-b="grid" title="All tools">${icon('back')}</button>
      <div class="tb-title">Clock</div>
      <div class="tb-tabs">${[['timer','Timer','timer'],['stopwatch','Stopwatch','stopwatch'],['alarm','Alarm','alarm']].map(([k,l,ic])=>`<button class="tb-tab ${k===tab ? 'on' : ''}" data-tab="${k}">${icon(ic)}${l}${dot(k)}</button>`).join('')}</div>
      <button class="tb-ic" data-b="close" title="Close">${icon('x')}</button>
    </div><div class="tb-body"></div>`;
  const body = box.card.querySelector('.tb-body');
  box.wheels = null; box.kb = null;
  if(tab==='timer') paintTimerTab(body);
  else if(tab==='stopwatch') paintSwTab(body);
  else paintAlarmTab(body);
}
function onBoxClick(e){
  const b = e.target.closest('button'); if(!b || !box) return;
  if(b.dataset.b==='close') return closeBox();
  if(b.dataset.b==='grid') return showGrid();
  if(b.dataset.tool==='clock') return showClock(lastTab);
  if(b.dataset.tool){ closeBox(); launchTool(b.dataset.tool); return; }
  if(b.dataset.tab) return showClock(b.dataset.tab);
  const a = b.dataset.a; if(!a) return;
  switch(a){
    case 'preset': startTimer(Number(b.dataset.ms)); closeBox(); break;
    case 'timer-start': { const ms = (box.wheels.m.value*60 + box.wheels.s.value) * 1000; if(ms > 0){ timerSetting = { m:box.wheels.m.value, s:box.wheels.s.value }; startTimer(ms); closeBox(); } break; }
    case 'timer-toggle': toggleTimer(); showClock('timer'); break;
    case 'timer-add': addTimer(60000); showClock('timer'); break;
    case 'timer-bin': clearTimer(); showClock('timer'); break;
    case 'sw-start': startSw(); closeBox(); break;
    case 'sw-toggle': toggleSw(); showClock('stopwatch'); break;
    case 'sw-bin': clearSw(); showClock('stopwatch'); break;
    case 'alarm-set': {
      const at = alarmAt(box.wheels.h.value, box.wheels.m.value);
      addAlarm(at, box.title); box.title = '';
      closeBox(); break;
    }
    case 'alarm-del': removeAlarm(b.dataset.id); showClock('alarm'); break;
  }
}
// Opens a tool other than the Clock (the Tools box and tool icons both use this).
function launchTool(id){
  switch(id){
    case 'points': if(window.SVPoints) window.SVPoints.open(); break;
    case 'names': if(window.SVNames) window.SVNames.open(); break;
    case 'box4': if(window.SVBox4) window.SVBox4.open(); break;
    case 'btt': if(window.SVTally) window.SVTally.openBtt(); break;
    case 'bob': if(window.SVTally) window.SVTally.openBob(); break;
    case 'mission': if(window.SVMission) window.SVMission.start(); break;
    case 'chance': if(window.SVChance) window.SVChance.open(); break;
    case 'sb': if(window.SVSentence) window.SVSentence.open(); break;
    case 'unjumble': if(window.SVUnjumble) window.SVUnjumble.open(); break;
    case 'hungry': if(window.SVHungry) window.SVHungry.open(); break;
    case 'splat': if(window.SVSplat) window.SVSplat.open(); break;
    case 'noughts': if(window.SVNoughts) window.SVNoughts.open(); break;
    case 'connect4': if(window.SVConnect4) window.SVConnect4.open(); break;
    case 'whiteboard': if(window.SVWhiteboard) window.SVWhiteboard.open(); break;
    case 'clock': openClock(); break;
  }
}
/* Tool icon tapped on a slide (v1.68). spec = { id, secs? }. A Clock with a time starts that countdown;
   if a timer is already running, asks first. Every other tool opens exactly as from the Tools box. */
function launchIcon(spec){
  if(!spec || !spec.id) return;
  closeBox();
  if(spec.id!=='clock'){ launchTool(spec.id); return; }
  const ms = Math.round((Number(spec.secs) || 0) * 1000);
  if(ms <= 0){ openClock(); return; }
  if(!T.timer){ startTimer(ms); return; }
  const h = host();
  const text = `A timer is running (${fmtClock(timerLeft(), true)} left). Replace it with ${fmtClock(ms)}?`;
  const ask = h && h.confirmBox ? h.confirmBox('Replace the timer?', text, 'Replace', false) : Promise.resolve(false);
  ask.then(ok=>{ if(ok) startTimer(ms); });
}
// The tools a tool icon can start, for the editor's picker.
function toolChoices(){
  return TOOLS.filter(t=>t.ready).map(t=>({ id:t.id, label:t.label, icon:TOOL_ICON[t.id] || 'circle', col:COL_HEX[t.col] || COL_HEX.blue }));
}
function mountWheels(){ requestAnimationFrame(()=>{ if(box && box.wheels) Object.values(box.wheels).forEach(w=>w.mount()); }); }

/* Timer tab */
const PRESETS = [[30,'30 s'],[60,'1 min'],[120,'2 min'],[180,'3 min'],[300,'5 min'],[600,'10 min']];
function paintTimerTab(body){
  if(T.timer){
    const t = T.timer;
    body.innerHTML = `<div class="clk-run">
      <div class="clk-big" data-live="timer"></div>
      <div class="clk-sub">${fmtClock(t.total, true)} timer${t.paused ? ' · paused' : ''}</div>
      <div class="clk-actions">
        <button class="clk-btn primary lg" data-a="timer-toggle">${icon(t.paused ? 'play' : 'pause')}${t.paused ? 'Resume' : 'Pause'}</button>
        <button class="clk-btn lg" data-a="timer-add">${icon('plus')}1 min</button>
        <button class="clk-btn lg danger" data-a="timer-bin">${icon('trash')}Stop</button>
      </div></div>`;
    paintBoxLive(); return;
  }
  body.innerHTML = `<div class="clk-set">
      <div class="wheels"><div class="wh-col"><div class="wh-lab">min</div><div data-w="m"></div></div><div class="wh-colon">:</div><div class="wh-col"><div class="wh-lab">sec</div><div data-w="s"></div></div></div>
      <div class="clk-side">
        <div class="clk-lab">Quick start</div>
        <div class="presets">${PRESETS.map(([s,l])=>`<button class="clk-btn" data-a="preset" data-ms="${s*1000}">${l}</button>`).join('')}</div>
        <button class="clk-btn primary xl" data-a="timer-start">${icon('play')}Start <span data-live="tset"></span></button>
      </div>
    </div>`;
  const upd = ()=>{ const s = $('[data-live=tset]', body); const ms = (box.wheels.m.value*60 + box.wheels.s.value)*1000; if(s) s.textContent = fmtClock(ms); $('[data-a=timer-start]', body).disabled = ms<=0; };
  box.wheels = { m:Wheel(99, timerSetting.m, upd), s:Wheel(59, timerSetting.s, upd) };
  $('[data-w=m]', body).replaceWith(box.wheels.m.el); $('[data-w=s]', body).replaceWith(box.wheels.s.el);
  upd(); mountWheels();
}
/* Stopwatch tab */
function paintSwTab(body){
  const s = T.sw;
  body.innerHTML = `<div class="clk-run">
    <div class="clk-big" data-live="sw"></div>
    <div class="clk-sub">${!s ? 'Shows in the top bar once started' : s.running ? 'Running' : 'Paused'}</div>
    <div class="clk-actions">${!s
      ? `<button class="clk-btn primary xl" data-a="sw-start">${icon('play')}Start</button>`
      : `<button class="clk-btn primary lg" data-a="sw-toggle">${icon(s.running ? 'pause' : 'play')}${s.running ? 'Pause' : 'Resume'}</button><button class="clk-btn lg danger" data-a="sw-bin">${icon('trash')}Reset</button>`}
    </div></div>`;
  paintBoxLive();
}
/* Alarm tab */
function paintAlarmTab(body){
  const n = new Date(Date.now() + 60000);
  let mm = Math.ceil(n.getMinutes()/5)*5, hh = n.getHours();
  if(mm===60){ mm = 0; hh = (hh+1) % 24; }
  if(box.title==null) box.title = '';
  const list = alarms() || [];
  body.innerHTML = `<div class="clk-alarm">
      <div class="al-left">
        <div class="wheels"><div class="wh-col"><div class="wh-lab">hour</div><div data-w="h"></div></div><div class="wh-colon">:</div><div class="wh-col"><div class="wh-lab">min</div><div data-w="m"></div></div></div>
        <div class="al-when" data-live="when"></div>
      </div>
      <div class="al-right">
        <div class="clk-lab">Title <span>(optional)</span></div>
        <div class="al-title" data-live="title"></div>
        <div data-kb></div>
        <button class="clk-btn primary xl" data-a="alarm-set">${icon('alarm')}Set alarm</button>
      </div>
    </div>
    ${list.length ? `<div class="al-list"><div class="clk-lab">Set alarms</div>${list.map(a=>`<div class="al-row"><b>${hhmm(a.at)}</b>${isTomorrow(a.at) ? '<span class="tag">tomorrow</span>' : ''}<span class="grow">${esc(a.title || 'Alarm')}</span><span class="al-in" data-live="in" data-at="${a.at}"></span><button class="tb-ic sm" data-a="alarm-del" data-id="${a.id}" title="Delete alarm">${icon('trash')}</button></div>`).join('')}</div>` : ''}`;
  const upd = ()=>{
    const at = alarmAt(box.wheels.h.value, box.wheels.m.value);
    const w = $('[data-live=when]', body); if(w) w.textContent = (isTomorrow(at) ? 'Tomorrow · ' : '') + 'in ' + untilText(at - Date.now());
  };
  if(box.keepHM){ hh = box.keepHM.h; mm = box.keepHM.m; box.keepHM = null; }
  box.wheels = { h:Wheel(23, hh, upd), m:Wheel(59, mm, upd) };
  $('[data-w=h]', body).replaceWith(box.wheels.h.el); $('[data-w=m]', body).replaceWith(box.wheels.m.el);
  box.kb = Keyboard(k=>typeKey(k));
  box.kb.setShift(!box.title.length);
  $('[data-kb]', body).replaceWith(box.kb.el);
  paintTitle(); upd(); mountWheels();
}
function typeKey(k){
  if(!box || box.tab!=='alarm') return;
  if(k==='bksp') box.title = box.title.slice(0, -1);
  else if(k==='clear') box.title = '';
  else if(box.title.length < 40) box.title += k;
  if(box.kb && !box.title.length) box.kb.setShift(true);
  paintTitle();
}
function paintTitle(){
  const t = box && $('[data-live=title]', box.card); if(!t) return;
  t.innerHTML = box.title ? `${esc(box.title)}<i class="caret"></i>` : `<span class="ph">e.g. Sam's music lesson</span><i class="caret"></i>`;
}
function paintBoxLive(){
  if(!box || box.page!=='clock') return;
  const c = box.card;
  const tl = $('[data-live=timer]', c);
  if(tl){ if(!T.timer){ showClock('timer'); return; } const ms = timerLeft(); tl.textContent = fmtClock(ms, true); tl.className = 'clk-big ' + (T.timer.paused ? 'paused' : ms <= 10000 ? 'red' : ms <= 60000 ? 'amber' : ''); }
  const sw = $('[data-live=sw]', c);
  if(sw){ const ms = swElapsed(); sw.innerHTML = `${fmtClock(ms)}<small>.${Math.floor(ms/100)%10}</small>`; sw.className = 'clk-big ' + (T.sw && !T.sw.running ? 'paused' : ''); }
  $$('[data-live=in]', c).forEach(s=>{ s.textContent = 'in ' + untilText(Number(s.dataset.at) - Date.now()); });
  const w = $('[data-live=when]', c);
  if(w && box.wheels && box.wheels.h){ const at = alarmAt(box.wheels.h.value, box.wheels.m.value); w.textContent = (isTomorrow(at) ? 'Tomorrow · ' : '') + 'in ' + untilText(at - Date.now()); }
}
// The stopwatch in the box shows tenths, so redraw it more often than the 250 ms tick.
(function loop(){ if(box && box.tab==='stopwatch' && T.sw && T.sw.running) paintBoxLive(); requestAnimationFrame(loop); })();

/* ---------------- keys ---------------- */
// While the box or a pop-up is open, keys go to it and never reach the presenter
// (so arrows / clicker don't change slide behind it).
window.addEventListener('keydown', e=>{
  if(alerts.length){
    if(['Enter',' ','Escape','PageDown','PageUp','ArrowRight','ArrowLeft'].includes(e.key)){ e.preventDefault(); e.stopPropagation(); alerts.shift(); paintAlert(); }
    return;
  }
  if(!box) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key==='F11') return;
  e.stopPropagation();
  if(e.key==='Escape'){ e.preventDefault(); closeBox(); return; }
  if(box.page==='clock' && box.tab==='alarm'){
    if(e.key==='Backspace'){ e.preventDefault(); typeKey('bksp'); }
    else if(e.key==='Enter'){ e.preventDefault(); const b = $('[data-a=alarm-set]', box.card); if(b) b.click(); }
    else if(e.key.length===1 && /[\w '\-.,!?&()/]/.test(e.key)){ e.preventDefault(); typeKey(e.key); }
    return;
  }
  if(box.page==='clock' && box.tab==='timer' && e.key==='Enter'){ const b = $('[data-a=timer-start]', box.card); if(b && !b.disabled){ e.preventDefault(); b.click(); } }
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' '].includes(e.key)) e.preventDefault();
}, true);

/* ---------------- dual screen hooks ---------------- */
// Pupil window: run an action sent from the console.
const REMOTE_OPS = { startTimer, toggleTimer, addTimer, clearTimer, startSw, toggleSw, clearSw, addAlarm, removeAlarm };
function remote(op, args){ const f = REMOTE_OPS[op]; if(f) f.apply(null, args || []); }
// Pupil window: what the console needs to show the Clock.
function snapshot(){ return { timer:T.timer ? Object.assign({}, T.timer) : null, sw:T.sw ? Object.assign({}, T.sw) : null }; }
const clockSig = ()=> JSON.stringify([!!T.timer, T.timer && T.timer.paused, T.timer && T.timer.total, !!T.sw, T.sw && T.sw.running]);
// Console: the pupil's timer/stopwatch, from its state reports.
function setRemote(c){
  if(!c) return;
  const before = clockSig();
  T.timer = c.timer ? Object.assign({}, c.timer) : null;
  T.sw = c.sw ? Object.assign({}, c.sw) : null;
  if(box && box.page==='clock' && box.tab!=='alarm' && clockSig()!==before) showClock(box.tab);
  tick();
}
// Console: the pupil's data came back (alarms may have changed). Keeps the wheels where they were.
let alarmSig = '';
function dataChanged(){
  const sig = JSON.stringify((alarms() || []).map(a=>a.id));
  if(sig===alarmSig) return; alarmSig = sig;
  if(box && box.page==='clock' && box.tab==='alarm'){
    if(box.wheels && box.wheels.h) box.keepHM = { h:box.wheels.h.value, m:box.wheels.m.value };
    showClock('alarm');
  }
}

window.SVTools = { openBox, openClock, closeBox, launchIcon, toolChoices, get state(){ return T; }, remote, snapshot, setRemote, dataChanged, get open(){ return !!box; } };
})();
