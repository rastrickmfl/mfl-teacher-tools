/* =====================================================================
   Slideshow Viewer — dual screen (v1.28)
   Classroom PC set to Extend: the PC monitor (teacher, mouse + keyboard) and
   the interactive panel (pupils, touch + stylus).

   With Dual screen on (Settings, per computer: localStorage 'sv_dual'),
   Present opens a second window, the PUPIL WINDOW (index.html?screen=pupil),
   on the panel. It runs the normal presenter and OWNS the lesson: slide,
   reveals, ink, blur, tools. The window Present was pressed in becomes the
   TEACHER CONSOLE: a live replica of the whole panel (top bar, island, slide,
   sidebar, every tool pop-up and floating box, all clickable), the next step,
   PowerPoint notes + the teacher's own notes, a thumbnail strip, Check slides,
   a tool bar, clock and minutes left. The console never changes the lesson
   itself; it sends commands to the pupil window.

   Saving: only one window writes viewer-data.json. The pupil window decides
   when to save and posts its data to the console, which writes it (the
   console already has the folder permission; a file:// pop-up may not).
   The console reads deck files for the pupil window too ('rpc').
   If the console is closed, the pupil window takes over the folder itself
   (one tap to reconnect if Edge asks). If the pupil window is closed, the
   console goes back to single-screen presenting on the same slide.

   The replica (phase 2): the pupil window serialises everything on its
   screen except the slide itself (the stage's .stage-scale, ink canvas,
   videos) and posts it as 'mirror' whenever it changes (at most ~30 times a
   second). Every element carries data-svm="<id>". The console morphs that
   HTML into an iframe the size of the panel, scaled down, with its own copy
   of the slide and ink drawn underneath (where the pupil's stage is). A
   pointer on the replica is sent back as 'ptr' { id, x, y } and the pupil
   window replays it as pointer events + a click on the same element, so
   every tool works from the desk without tool-specific code. Exceptions
   handled on the console: the Clock (set privately: tools.js sends its
   actions to the pupil window) and Who's in? (a private copy of the register).

   Messages (window.postMessage, '*' because file:// pages have no origin),
   all tagged { 'sv-dual':1, type }:
     pupil → console: hello (until init), ping, state, ink, live, save, mirror,
                      rpc { id, op, args }, bye, sbPickEnd, ujSetupEnd (v1.47; rpc 'ujSetup' = Sentence Unjumble set-up on the console),
                     htSetupEnd (v1.48; rpc 'htSetup' = Hungry Translations set-up on the console),
                    spSetupEnd (v1.50; rpc 'spSetup' = Splat set-up on the console),
                    bxSetupEnd (v1.51; rpc 'bxSetup' = Noughts & Crosses / Connect 4 set-up)
     (v1.43) rpc 'sbPick' (no time limit): Mindreader's Teacher's Choice; the console shows
     the builder (SVSentence.pickOnConsole) and answers { mode, keys } or null. 'sbPickEnd'
     closes that picker when the pupil window cancels. A tap replayed from the replica runs
     with SVDual.fromDesk true (Reveal answer then marks the answer on the console only).
     console → pupil: init { data, planner, open }, resync, data, cmd, rpcResult, bye
     cmd: open, idle, key, go, slide, reveal, ptr, tool, clock, absent, note, hides, print, feed
   Editing on the console (v1.28): the sidebar copy's Edit opens the editor on
   the PC monitor; the panel keeps presenting. The console doesn't save while
   it's open (SVCore.saveHold): each changed slide is sent as 'hides'
   { id, mode, i, cfg } (and My notes as 'note'); the pupil window stores it,
   saves, and redraws its slide if that's the one showing (reveals and pen kept).
   Loaded after app.js (uses window.SVCore) and before the tools.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, icon, toast } = C;
const KEY = 'sv_dual', TAG = 'sv-dual';
const post = (w, msg, transfer)=>{ try{ if(!w || w.closed) return false; w.postMessage(Object.assign({ [TAG]:1 }, msg), '*', transfer || []); return true; }catch(e){ console.warn('dual: post failed', e); return false; } };
const pad2 = n => String(n).padStart(2,'0');
const hhmm = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const FWD = ['ArrowRight','PageDown',' ','Enter','ArrowDown'], BACK = ['ArrowLeft','PageUp','Backspace','ArrowUp'];

// Tool icons not in app.js's set.
const LIC = iconMap({
  star: 'star', shuffle: 'shuffle', grid4: 'layout-grid', vs: 'swords',
  bob: 'user-round', dice: 'dices', ghost: 'ghost', cane: 'candy-cane', sb: 'brick-wall', unjumble: 'shuffle',
  bomb: 'bomb', lock: 'lock', check: 'check', splat: 'splat',
  noughts: 'tic-tac-toe', connect4: 'connect-four', hungry: 'dinosaur',
});
const ic = (n, cls) => LIC[n] ? `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${LIC[n]}</svg>` : icon(n);

/* ---------------- the setting (this computer only) ---------------- */
function wanted(){ try{ return localStorage.getItem(KEY)==='1'; }catch(e){ return false; } }
async function setWanted(on){
  try{ localStorage.setItem(KEY, on ? '1' : '0'); }catch(e){}
  if(on && !C.PUPIL){
    // Ask for window placement now (Edge shows its prompt once), so Present can put the pupil window on the panel.
    const n = await screenCount();
    if(n===1) toast("Only one screen found. Set Windows to Extend (Win + P) so the panel is a second screen.", true);
  }
}
async function screenCount(){
  try{ if(window.getScreenDetails){ const d = await window.getScreenDetails(); return d.screens.length; } }catch(e){}
  return window.screen && window.screen.isExtended ? 2 : 0; // 0 = can't tell
}
function settingsRow(){
  const on = wanted();
  return `<div class="row"><div class="grow"><div class="t">Dual screen (this computer)</div><div class="d">${on
    ? 'Present opens the slides on the second screen (the panel) and turns this screen into the teacher console. Windows must be set to Extend.'
    : 'Present shows the slides on this screen only. Turn on for a classroom PC with a panel set to Extend.'}</div></div><span class="seg"><button data-a="dual" data-v="1" class="${on?'on':''}">On</button><button data-a="dual" data-v="0" class="${!on?'on':''}">Off</button></span></div>`;
}

/* =====================================================================
   CONSOLE side (the window Present was pressed in)
   ===================================================================== */
const K = { win:null, ready:false, poll:null, pending:null, state:null, strokes:[], cons:null, adopting:false, placeHint:false,
  mirror:null, absent:[], noteEdits:new Map() };
const alive = ()=>!!(K.win && !K.win.closed);

function present(id){
  const l = C.data.lessons[id]; if(!l || !l.mode) return;
  if(alive() && K.ready){
    post(K.win, { type:'cmd', cmd:'open', id, pos:0 });
    openConsole(id);
    return;
  }
  // Open the window inside the click (pop-up blocker), then move it to the panel.
  let w = null;
  try{ w = window.open('index.html?screen=pupil' + (C.TEST || window.SV_DEMO ? '&test' : ''), 'svpupil', `popup,width=1280,height=720,left=${(screen.availLeft || 0) + 60},top=${(screen.availTop || 0) + 60}`); }catch(e){}
  if(!w){
    toast("Edge blocked the pupil window, so this is single screen. Allow pop-ups for this page (icon at the right of the address bar).", true);
    C.goFullscreen(); C.openPresenter(id);
    return;
  }
  attach(w);
  K.pending = { id, pos:0 };
  placeWindow(w);
  openConsole(id);
}
function attach(w){
  K.win = w; K.ready = false; K.state = null; K.mirror = null;
  clearInterval(K.poll);
  K.poll = setInterval(()=>{ if(K.win && K.win.closed) pupilGone(); }, 700);
}
// Window Management API: put the window on the screen that isn't this one.
async function placeWindow(w){
  K.placeHint = false;
  let target = null;
  try{
    if(window.getScreenDetails){
      const d = await window.getScreenDetails();
      const others = d.screens.filter(s=>s!==d.currentScreen);
      target = others.find(s=>!s.isPrimary) || others[0] || null;
    }
  }catch(e){}
  if(!target){ K.placeHint = true; renderStatus(); return; }
  try{ w.moveTo(target.availLeft, target.availTop); w.resizeTo(target.availWidth, target.availHeight); }
  catch(e){ K.placeHint = true; renderStatus(); }
}
function pupilGone(){
  clearInterval(K.poll); K.poll = null;
  const st = K.state, wasConsole = C.view.name==='console' && K.cons;
  K.win = null; K.ready = false; K.state = null; K.mirror = null;
  closeRegister();
  if(window.SVSentence && SVSentence.cancelPick) SVSentence.cancelPick(); // Teacher's Choice picker: nobody to answer
  if(window.SVTools && SVTools.open) SVTools.closeBox(); // a private Clock box: its actions had nowhere to go
  if(wasConsole){
    closeConsole();
    toast('Pupil screen closed. Presenting on this screen.');
    presentHere(st);
  } else if(ED.E){
    // Editing on this screen: keep the editor open, save here from now on; Resume presents here.
    const E = ED.E;
    edFlush(); edStop();
    C.saveSoon(200);
    E.resume = ()=>presentHere(st);
    toast('Pupil screen closed. Your edits are saved here; Resume Presentation presents on this screen.', true);
  } else if(C.view.name==='dash') C.renderDashboard();
}
// Single-screen presenting from where the pupil window was.
function presentHere(st){
  const pos = st && st.view==='present' ? st.pos : 0, id = st && st.id || (K.lastId);
  C.openPresenter(id, pos).then(()=>{
    const P = C.view.name==='present' ? C.view.P : null;
    if(!P || !st || st.view!=='present' || P.l.id!==st.id) return;
    const i = P.order[P.pos];
    if(i===st.i){ P.revealed.set(i, new Set(st.f || [])); C.applyVisibility(P); C.buildOverlay(P); }
    if(st.blur) C.setBlur(P, true);
  });
}
function closePupil(){ if(alive()) K.win.close(); }
// v1.76 Refresh on the panel: the pupil window has sent its data ('save', just before 'refresh').
// Write it to the folder, then reload both windows. After the reload the pupil window says hello,
// gets init (no lesson) and reopens its lesson from its own refresh note (app.js takeRefresh).
async function refreshBoth(){
  if(K.refreshing) return; K.refreshing = true;
  C.showLoading('Refreshing…');
  try{ await K.adoptP; }catch(e){}
  send('reload');
  location.reload();
}

// Dashboard banner while a pupil window is open.
function banner(){
  if(C.PUPIL || !alive()) return '';
  return `<div class="banner dual-banner"><span class="grow">${icon('monitor')} The pupil screen is open on the panel. Present carries on using it.</span><button class="btn sm" data-dual="close">Close pupil screen</button></div>`;
}
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-dual]'); if(!b) return;
  if(b.dataset.dual==='close'){ closePupil(); }
});

// After the console saves (its own changes, e.g. a deck added on the dashboard,
// or a reload of changes synced from another computer), the pupil window gets
// the same data so it never saves an older copy.
function saved(){
  if(C.PUPIL){ return; }
  if(!alive() || !K.ready || K.adopting) return;
  post(K.win, { type:'data', data:C.data });
}
async function adoptFromPupil(d, base){
  if(ED.E) edFlush(); // send anything typed since the last change before this window's copy is replaced
  K.adopting = true;
  try{ await C.adopt(d, true, base); } // merged with other computers' saves against the pupil window's starting copy
  catch(e){ console.error(e); }
  finally{ K.adopting = false; }
  reapplyNoteEdits();
  reapplyHides();
  if(ED.E){
    const E = ED.E, l = C.data.lessons[E.l.id];
    if(l){ E.l = l; ED.snap = edSnap(l, E.mode); }
  }
  if(window.SVTools && SVTools.dataChanged) SVTools.dataChanged();
  const V = K.cons;
  if(V){
    const l = C.data.lessons[V.id]; if(!l) return;
    V.l = l; [V.mp, V.np, V.cp].forEach(p=>{ if(p) p.l = l; });
    const sig = hidesSig(l, V.mode);
    if(sig!==V.sig){ V.sig = sig; buildStrip(); V.shown = {}; renderAll(); }
    syncMyNote();
  }
  if(R) paintRegister();
}
const hidesSig = (l, mode)=>{ try{ return JSON.stringify([l.hides[mode] || {}, (l.slides && l.slides[mode]) || null]); }catch(e){ return ''; } };

async function handleRpc(m){
  let res, err = null, transfer = [];
  try{
    const s = C.store;
    if(m.op==='readDeck'){ const f = await s.readDeck(m.args[0]); res = await f.arrayBuffer(); transfer = [res]; }
    else if(m.op==='exists' || m.op==='writeDeck' || m.op==='deleteDeck') res = await s[m.op](...m.args);
    else if(m.op==='sbList') res = window.SBCore ? await SBCore.listBuilders(C.FsStore.dir) : []; // Sentence Builder gallery (sb-present.js)
    else if(m.op==='sbRules') res = window.SBGrammar ? await SBGrammar.readFrom(C.FsStore.dir) : null; // grammar-rules.json (sb-grammar.js, v1.58)
    else if(m.op==='sbPick') res = window.SVSentence && SVSentence.pickOnConsole ? await SVSentence.pickOnConsole(m.args[0]) : null; // Mindreader: Teacher's Choice
    else if(m.op==='ujSetup') res = window.SVUnjumble ? await SVUnjumble.setupOnConsole(m.args[0]) : null; // Sentence Unjumble tool: set up here (v1.47)
    else if(m.op==='htSetup') res = window.SVHungry ? await SVHungry.setupOnConsole(m.args[0]) : null; // Hungry Translations: set up here (v1.48)
    else if(m.op==='spSetup') res = window.SVSplat ? await SVSplat.setupOnConsole(m.args[0]) : null; // Splat: set up here (v1.50)
    else if(m.op==='bxSetup') res = window.SVBoardGames ? await SVBoardGames.setupOnConsole(m.args[0]) : null; // Noughts & Crosses / Connect 4 (v1.51)
    else throw new Error('Unknown request ' + m.op);
  }catch(e){ err = (e && e.message) || String(e); }
  post(K.win, { type:'rpcResult', id:m.id, res, err }, transfer);
}

function consoleMsg(e){
  const m = e.data;
  if(e.source!==K.win){
    // A pupil window this page didn't open: this console was reloaded. Take it back.
    if((m.type==='ping' || m.type==='hello') && wanted() && C.data && !alive()){ attach(e.source); }
    else return;
  }
  switch(m.type){
    case 'hello':
      K.ready = true;
      post(K.win, { type:'init', data:C.data, planner:C.planner, open:K.pending || null });
      K.pending = null; renderStatus();
      break;
    case 'ping': if(!K.ready){ K.ready = true; post(K.win, { type:'resync' }); renderStatus(); } break;
    case 'state': onState(m.state); break;
    case 'ink': if(K.state && m.i===K.state.i && m.id===K.state.id){ K.strokes = m.strokes || []; K.live = null; paintInk(); } break;
    case 'live': if(K.state && m.i===K.state.i && m.id===K.state.id) onLive(m); break;
    case 'mirror': K.mirror = m.m; queueMirror(); break;
    case 'save': K.adoptP = adoptFromPupil(m.data, m.base); break;
    case 'refresh': refreshBoth(); break;
    case 'rpc': handleRpc(m); break;
    case 'bye': if(m.state) K.state = m.state; break; // the poll notices the window has gone
    case 'sbPickEnd': if(window.SVSentence && SVSentence.cancelPick) SVSentence.cancelPick(); break;
    case 'ujSetupEnd': if(window.SVUnjumble) SVUnjumble.cancelSetup(); break;
    case 'htSetupEnd': if(window.SVHungry) SVHungry.cancelSetup(); break;
    case 'spSetupEnd': if(window.SVSplat) SVSplat.cancelSetup(); break;
    case 'bxSetupEnd': if(window.SVBoardGames) SVBoardGames.cancelSetup(); break;
  }
}

/* ---------------- console view ---------------- */
function onState(st){
  if(!st) return;
  K.state = st;
  if(st.clock && window.SVTools && SVTools.setRemote) SVTools.setRemote(st.clock);
  if(Array.isArray(st.absent)){ K.absent = st.absent; if(R && !R.busy) paintRegister(); }
  if(st.view==='present'){ K.strokes = st.strokes || []; K.lastId = st.id; }
  renderStatus();
  const vn = C.view.name;
  if(st.view==='idle'){
    closeRegister();
    if(vn==='console'){ closeConsole(); if(st.date) C.setDate(st.date); C.renderDashboard(); }
    return;
  }
  if(ED.E){ markLive(); return; } // editing on this screen: just keep the Live badge right
  if(vn==='dash'){ if(st.id) openConsole(st.id); return; }
  if(vn!=='console') return; // busy elsewhere (e.g. Classes page): leave it
  const V = K.cons; if(!V) return;
  if(st.id && (st.id!==V.id || (st.mode && st.mode!==V.mode))){ openConsole(st.id); return; }
  V.root.classList.toggle('pupil-editing', st.view==='edit');
  if(st.view==='present' && V.v) renderAll();
}

// The console's Tools button opens this menu on the PC monitor only (pupils just see the tool appear).
const MENU = [
  ['names', 'Random Name', 'shuffle'], ['points', 'Achievement Points', 'star'], ['register', "Who's in?", 'users'],
  ['clock', 'Clock', 'clock'], ['box4', 'Box of Four', 'grid4'], ['btt', 'Beat the Teacher', 'vs'], ['bob', 'Bob Up', 'bob'],
  ['chance', 'Game of Chance', 'dice'], ['sb', 'Sentence Builder', 'sb'],
  ['unjumble', 'Sentence Unjumble', 'unjumble'], ['hungry', 'Hungry Translations', 'hungry'],
  ['splat', 'Splat', 'splat'], ['noughts', 'Noughts & Crosses', 'noughts'], ['connect4', 'Connect 4', 'connect4'],
];
const MENU_TIPS = { register:"Who's in? (only on this screen)", clock:'Timer, stopwatch, alarms (set on this screen; the countdown shows on the panel)' };

async function openConsole(id){
  closeConsole();
  const l = C.data.lessons[id]; if(!l || !l.mode) return;
  K.lastId = id;
  window.SVHost.setView('console');
  C.leaveFullscreen();
  const V = K.cons = { id, l, mode:l.mode, v:null, check:null, shown:{}, noteTok:0, stages:[] };
  const app = $('#app');
  app.innerHTML = `<div class="console">
    <div class="cn-bar">
      <button class="cn-btn" data-c="home" title="Back to lessons (the pupil screen shows the date and time)">${icon('home')}Home</button>
      <div class="cn-title"><b>${esc(C.lessonTitle(l))}</b><span>${esc([l.period, l.label, l.start && l.end ? l.start + '–' + l.end : ''].filter(Boolean).join(' · '))}</span></div>
      <span class="cn-status" id="cn-status"></span>
      <button class="cn-btn" data-c="check" title="Look through the slides with the answers showing, without changing the pupil screen">${icon('eye')}Check slides</button>
      <button class="cn-btn" data-c="close" title="Close the pupil window and present on this screen">${icon('x')}Close pupil screen</button>
      <div class="cn-mi" hidden></div>
      <div class="cn-island"><div class="island-in"><span class="island-widgets cn-isl-w"></span><b class="cn-time"></b><span class="cn-until" hidden></span></div></div>
    </div>
    <div class="cn-main">
      <section class="cn-big">
        <div class="cn-head"><span class="cn-lab" id="cn-biglab">Pupil screen</span><span class="cn-badges"></span><span class="grow"></span><span class="cn-count" id="cn-bigcount"></span></div>
        <div class="cn-live${C.data.settings.rail==='left' ? ' rail-left' : ''}">
          <div class="cn-slot" id="cn-bigslot"><div class="cn-stage" id="cn-check" hidden></div></div>
          <div class="cn-rail no-end"></div>
        </div>
        <div class="cn-ctrl live">
          <button class="cn-btn" data-c="back" title="Back one step (← / PageUp)">${icon('left')}Back</button>
          <span class="cn-hint">Click anything on the pupil screen above to use it · Clicker, → / PageDown / Space: next step · ← / PageUp: back</span>
          <button class="cn-btn primary" data-c="fwd" title="Next step (→ / PageDown / Space)">Next${icon('right')}</button>
        </div>
        <div class="cn-ctrl check">
          <button class="cn-btn" data-c="cprev" title="Previous slide (←)">${icon('left')}</button>
          <button class="cn-btn" data-c="cnext" title="Next slide (→)">${icon('right')}</button>
          <span class="grow"></span>
          <button class="cn-btn primary" data-c="cshow">${icon('monitor')}Show this slide on pupil screen</button>
          <button class="cn-btn" data-c="cresume" title="Esc">${icon('play')}Resume controlling pupil screen</button>
        </div>
        <div class="cn-editing">${icon('edit')}<b>Editing on the pupil screen</b><span>This console carries on when you tap Back to presenting.</span></div>
      </section>
      <aside class="cn-side">
        <section class="cn-next">
          <div class="cn-head"><span class="cn-lab" id="cn-sidelab">Next</span><span class="grow"></span><span class="cn-count" id="cn-nextlab"></span></div>
          <div class="cn-slot small" id="cn-sideslot"><div class="cn-stage" id="cn-next"></div><div class="cn-end" hidden>End of the slides</div></div>
        </section>
        <section class="cn-notes">
          <div class="cn-head"><span class="cn-lab">Notes</span><span class="grow"></span><span class="cn-count" id="cn-notelab"></span></div>
          <div class="cn-notes-body">
            <div class="cn-ppt"></div>
            <div class="cn-my"><div class="cn-my-lab">My notes <span class="cn-my-st"></span></div>
              <textarea class="cn-my-ta" rows="2" placeholder="Type your own notes for this slide. Saved with the lesson, never in the PowerPoint."></textarea></div>
          </div>
        </section>
      </aside>
      <div class="cn-rep"><div class="cn-rep-box"><div class="cn-rep-stage" id="cn-mirror"></div></div></div>
    </div>
    <div class="cn-strip"></div>
  </div>`;
  V.root = $('.console');
  V.root.addEventListener('click', e=>{
    const b = e.target.closest('[data-c]'); if(b) return consoleAction(b.dataset.c);
    const t = e.target.closest('[data-t]'); if(t) toolAction(t.dataset.t);
  });
  V.railHost = $('.cn-rail', V.root); V.islHost = $('.cn-isl-w', V.root); V.miHost = $('.cn-mi', V.root);
  [V.railHost, V.islHost, V.miHost].forEach(wireCopy);
  const ta = $('.cn-my-ta', V.root);
  ta.addEventListener('input', ()=>{ autoGrow(ta); myNoteInput(ta.value); });
  renderStatus();
  startClock();
  buildReplica();
  let v;
  try{ v = await C.getDeck(l, l.mode); }
  catch(e){ if(K.cons===V) $('.cn-ppt').innerHTML = `<div class="cn-empty">Couldn't open the deck here: ${esc(e.message)}</div>`; return; }
  if(K.cons!==V) return;
  V.v = v;
  const order = C.presentOrder(v);
  V.order = order;
  V.sig = hidesSig(l, V.mode);
  // The panel's slide under the replica: drawn here, view only. Reveal buttons, tools etc. are in the replica.
  V.mp = { mirror:true, l, mode:V.mode, v, order, pos:0, revealed:new Map() };
  V.mp.stage = stage($('#cn-mirror'));
  V.ink = new C.Ink(V.mp.stage, ()=>{});
  V.mp.stage.onfit = ()=>{ V.ink.resize(); syncZoom(); };
  V.mp.stage.onmove = ()=>V.ink.resize();
  V.np = { mirror:true, l, mode:V.mode, v, order, pos:0, revealed:new Map() };
  V.np.stage = stage($('#cn-next'));
  V.np.stage.onfit = ()=>markNext();
  buildStrip();
  renderAll();
  applyMirror();
}
function stage(host){ const s = new C.Stage(host, { onePan:()=>false }); K.cons.stages.push(s); return s; }
function closeConsole(){
  const V = K.cons; if(!V) return;
  clearTimeout(V.clockT); closeMenu();
  clearTimeout(V.noteT); flushMyNote(V);
  V.stages.forEach(s=>{ try{ s.destroy(); }catch(e){} });
  if(V.ro) V.ro.disconnect();
  if(V.rep && V.rep.win) try{ V.rep.win.removeEventListener('keydown', V.rep.onKey, true); }catch(e){}
  K.cons = null;
}
// The state used before the pupil window has reported (just opened): slide 1, nothing revealed.
function curState(){
  const V = K.cons, st = K.state;
  if(st && st.view==='present' && st.id===V.id && Array.isArray(st.order)) return st;
  const i = V.order[0];
  return { view:'present', id:V.id, mode:V.mode, order:V.order, pos:0, i, f:[], blur:false, provisional:true };
}

function renderAll(){
  const V = K.cons; if(!V || !V.v) return;
  const st = curState();
  if(!st.provisional) V.order = st.order;
  const i = st.order[st.pos];
  // The panel's slide
  const mp = V.mp; mp.order = st.order; mp.pos = st.pos;
  mp.revealed = new Map([[i, new Set(st.f || [])]]);
  if(V.shown.mirror!==i){
    mp.stage.show(V.v, i, C.editsOf(V.l, V.mode, i)); C.dropDeleted(mp.stage, V.l, V.mode, i); V.shown.mirror = i;
    if(st.provisional) K.strokes = (V.l.ink[V.mode][i] || []).slice();
    K.live = null;
    syncZoom();
  }
  C.applyVisibility(mp);
  mp.stage.ui.innerHTML = '';
  mp.stage.frame.classList.toggle('blurred', !!st.blur);
  paintInk(null);
  const badges = $('.cn-badges', V.root);
  if(badges) badges.innerHTML = st.blur ? `<span class="cn-badge">${icon('blur')}Blurred</span>` : '';
  if(V.check==null){ $('#cn-bigcount').textContent = `Slide ${st.pos + 1} of ${st.order.length}`; showNotes(i, `Slide ${st.pos + 1}`); }
  else $('#cn-biglab').textContent = `Checking slide ${V.check + 1} of ${V.order.length} · pupils see slide ${st.pos + 1}`;
  renderNext(st);
  markStrip();
}
// All the strokes again (plus the one in progress, if any).
function paintInk(){
  const V = K.cons; if(!V || !V.ink) return;
  V.ink.strokes = K.strokes || [];
  V.ink.cur = K.live || null;
  V.ink.redraw();
}
// v1.61: the stroke being drawn on the panel arrives in pieces: the whole stroke first (from 0),
// then only the points added since (from = how many it already had). Only that stroke is repainted.
function onLive(m){
  if(!m.from) K.live = { kind:m.cur.kind, color:m.cur.color, w:m.cur.w, pts:m.cur.pts.slice() };
  else if(K.live && K.live.pts.length===m.from) K.live.pts.push(...m.cur.pts);
  else return; // out of step (shouldn't happen): the stroke shows in full when it's finished
  const V = K.cons; if(V && V.ink) V.ink.live(K.live);
}
// Next: the slide with its next hidden item showing (outlined), or the next slide once everything is shown.
function renderNext(st){
  const V = K.cons, np = V.np;
  if(V.check!=null) return; // the side panel shows the live copy while checking
  const i = st.order[st.pos], f = new Set(st.f || []);
  const seq = C.revealSeq(V.mp, i), left = seq.filter(k=>!f.has(k));
  const end = $('.cn-end', V.root), host = $('#cn-next');
  let ni, set, label;
  V.nextKey = null;
  if(left.length){ ni = i; set = new Set(f); set.add(left[0]); V.nextKey = left[0]; label = `${left.length} reveal${left.length>1 ? 's' : ''} left`; $('#cn-sidelab').textContent = 'Next step'; }
  else if(st.pos < st.order.length - 1){ ni = st.order[st.pos + 1]; set = new Set(); label = `Slide ${st.pos + 2} of ${st.order.length}`; $('#cn-sidelab').textContent = 'Next slide'; }
  else { end.hidden = false; host.style.visibility = 'hidden'; $('#cn-sidelab').textContent = 'Next'; $('#cn-nextlab').textContent = ''; V.shown.next = null; return; }
  end.hidden = true; host.style.visibility = '';
  $('#cn-nextlab').textContent = label;
  np.order = st.order; np.pos = st.order.indexOf(ni);
  if(V.shown.next!==ni){ np.stage.show(V.v, ni, C.editsOf(V.l, V.mode, ni)); C.dropDeleted(np.stage, V.l, V.mode, ni); V.shown.next = ni; }
  np.revealed = new Map([[ni, set]]);
  C.applyVisibility(np);
  markNext();
}
// Dashed outline round the item the next click changes.
function markNext(){
  const V = K.cons; if(!V || !V.np || !V.np.stage.scale) return;
  $$('.cn-mark', V.np.stage.scale).forEach(m=>m.remove());
  const key = V.nextKey; if(!key) return;
  // v1.63: itemRect: a group's whole box
  const r = C.itemRect(V.np.stage, C.hideCfg(V.l, V.mode, V.np.order[V.np.pos]), key);
  if(!r) return;
  const m = el('div','cn-mark'); Object.assign(m.style, { left:r.x+'px', top:r.y+'px', width:Math.max(r.w, 4)+'px', height:Math.max(r.h, 4)+'px' });
  V.np.stage.scale.appendChild(m);
}

/* ---------------- notes: PowerPoint's + the teacher's own ---------------- */
async function showNotes(i, label){
  const V = K.cons; if(!V || !V.v) return;
  $('#cn-notelab').textContent = label || '';
  if(V.noteI!==i){ flushMyNote(V); V.noteI = i; syncMyNote(true); }
  if(V.pptI===i) return;
  V.pptI = i;
  const tok = ++V.noteTok;
  let paras = [];
  try{ paras = await V.v.notes(i); }catch(e){}
  if(!K.cons || tok!==V.noteTok) return;
  const box = $('.cn-ppt', V.root);
  box.innerHTML = paras.some(p=>p.text.trim())
    ? paras.map(p=>`<p style="margin-left:${(p.lvl || 0)*20}px">${p.text.trim() ? esc(p.text).replace(/\n/g, '<br>') : '&nbsp;'}</p>`).join('')
    : `<div class="cn-empty">${V.v.type==='pdf' ? 'No PowerPoint notes in the PDF version.' : 'No PowerPoint notes on this slide.'}</div>`;
  $('.cn-notes-body', V.root).scrollTop = 0;
}
const noteKey = (id, mode, i)=> id + '\n' + mode + '\n' + i;
// Fill the My notes box for the slide shown (leaves it alone while it's being typed in, unless force).
function syncMyNote(force){
  const V = K.cons; if(!V || V.noteI==null) return;
  const ta = $('.cn-my-ta', V.root); if(!ta) return;
  if(!force && document.activeElement===ta) return;
  const t = C.myNote(V.l, V.mode, V.noteI);
  if(ta.value!==t) ta.value = t;
  autoGrow(ta);
}
function autoGrow(ta){ ta.style.height = 'auto'; ta.style.height = Math.min(320, Math.max(52, ta.scrollHeight + 2)) + 'px'; }
// Typing: kept in this window's copy at once, sent to the pupil window (which owns the data) shortly after.
function myNoteInput(text){
  const V = K.cons; if(!V || V.noteI==null) return;
  const k = noteKey(V.id, V.mode, V.noteI);
  K.noteEdits.set(k, { id:V.id, mode:V.mode, i:V.noteI, text });
  C.setMyNote(V.l, V.mode, V.noteI, text);
  const s = $('.cn-my-st', V.root); if(s) s.textContent = '· saving…';
  clearTimeout(V.noteT); V.noteT = setTimeout(()=>flushMyNote(V), 500);
}
function flushMyNote(V){
  if(!V) return;
  clearTimeout(V.noteT); V.noteT = null;
  for(const n of K.noteEdits.values()) if(!n.sent){ send('note', { id:n.id, mode:n.mode, i:n.i, text:n.text }); n.sent = true; }
}
// The pupil's data has come back: drop edits it now has; keep the rest on top (it may be a save from before them).
function reapplyNoteEdits(){
  for(const [k, n] of K.noteEdits){
    const l = C.data.lessons[n.id]; if(!l){ K.noteEdits.delete(k); continue; }
    const have = C.myNote(l, n.mode, n.i), want = n.text.trim() ? n.text.slice(0, 5000) : '';
    if(have===want){ if(n.sent) K.noteEdits.delete(k); }
    else C.setMyNote(l, n.mode, n.i, n.text);
  }
  const V = K.cons, s = V && $('.cn-my-st', V.root);
  if(s) s.textContent = K.noteEdits.size ? '· saving…' : '';
}

/* ---------------- thumbnail strip ---------------- */
function buildStrip(){
  const V = K.cons; if(!V || !V.v) return;
  const strip = $('.cn-strip', V.root); strip.innerHTML = '';
  const queue = [];
  V.order.forEach((i, pos)=>{
    const b = el('button','cn-th'); b.dataset.pos = pos; b.title = `Slide ${pos + 1}`;
    const th = el('div','th'); b.append(th, el('span','n', String(pos + 1)));
    b.onclick = ()=>stripClick(pos);
    strip.appendChild(b); queue.push([th, i]);
  });
  const tok = V.stripTok = (V.stripTok || 0) + 1;
  const pump = ()=>{
    if(K.cons!==V || V.stripTok!==tok) return;
    for(let n=0; n<3 && queue.length; n++){ const [th, i] = queue.shift(); C.mountThumb(th, V.v, i, 150, V.l, V.mode); }
    if(queue.length) requestAnimationFrame(pump);
  };
  pump();
  markStrip();
}
function markStrip(){
  const V = K.cons; if(!V) return;
  const st = curState();
  $$('.cn-th', V.root).forEach(b=>{
    const pos = Number(b.dataset.pos);
    b.classList.toggle('on', pos===st.pos);
    b.classList.toggle('chk', V.check===pos);
  });
  const cur = $(`.cn-th[data-pos="${V.check!=null ? V.check : st.pos}"]`, V.root);
  if(cur && cur!==V.stripCur){ V.stripCur = cur; cur.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' }); }
}
function stripClick(pos){
  const V = K.cons; if(!V) return;
  if(V.check!=null) return checkGo(pos);
  send('go', { pos });
}

/* ---------------- Check slides ---------------- */
// Browse any slide with every hidden item showing, without changing the panel.
// While it's open, the keyboard / clicker browse it; Resume (or Esc) hands them back.
// The replica of the panel moves to the small box on the right.
function setCheck(pos){
  const V = K.cons; if(!V || !V.v) return;
  const chk = $('#cn-check'), nxt = $('#cn-next');
  if(pos==null){
    V.check = null;
    V.root.classList.remove('checking');
    chk.hidden = true; nxt.hidden = false;
    $('#cn-biglab').textContent = 'Pupil screen';
    V.shown.next = null; V.stripCur = null;
    placeRep();
    renderAll();
    return;
  }
  const first = V.check==null;
  V.check = Math.max(0, Math.min(V.order.length - 1, pos));
  if(first){
    V.root.classList.add('checking');
    nxt.hidden = true; $('.cn-end', V.root).hidden = true;
    chk.hidden = false;
    $('#cn-sidelab').textContent = 'Pupil screen (live)'; $('#cn-nextlab').textContent = '';
    if(!V.cp){ V.cp = { mirror:true, l:V.l, mode:V.mode, v:V.v, order:V.order, pos:0, revealed:new Map() }; V.cp.stage = stage(chk); }
    placeRep();
  }
  const cp = V.cp, i = V.order[V.check];
  cp.l = V.l; cp.order = V.order; cp.pos = V.check;
  cp.stage.show(V.v, i, C.editsOf(V.l, V.mode, i)); C.dropDeleted(cp.stage, V.l, V.mode, i);
  // Everything that starts hidden is shown (Can hide items stay shown); cover boxes are lifted.
  const cfg = C.hideCfg(V.l, V.mode, i), all = new Set();
  for(const [oid, s] of Object.entries(cfg.obj || {})) if(s==='hide') all.add('o'+oid);
  for(const c of (cfg.covers || [])) all.add('c'+c.id);
  cp.revealed = new Map([[i, all]]);
  C.applyVisibility(cp);
  const st = curState();
  $('#cn-biglab').textContent = `Checking slide ${V.check + 1} of ${V.order.length} · pupils see slide ${st.pos + 1}`;
  $('#cn-bigcount').textContent = all.size ? `${all.size} hidden item${all.size>1 ? 's' : ''} shown` : '';
  showNotes(i, `Slide ${V.check + 1}`);
  markStrip();
}
function checkGo(pos){ setCheck(pos); }

/* ---------------- the replica of the panel ---------------- */
// An iframe the size of the pupil window, scaled to fit, with the pupil's screen
// (minus the slide) morphed into it. The slide and ink are drawn underneath by
// this window (#cn-mirror), placed where the pupil's stage is.
const REP_CSS = `
html,body{ background:transparent !important; overflow:hidden !important; }
.present, .present-main, .stage-host, .present .stage-host{ background:transparent !important; }
.stage-frame{ background:transparent !important; box-shadow:none !important; }
.stage-scale{ visibility:hidden !important; }
.dual-fs, .dual-reconnect, .zoom-pill{ display:none !important; }
.gc-priv{ display:block !important; margin-top:10px; padding:8px 18px; border-radius:12px; background:#F5B700; color:#111114; font:700 30px/1.25 var(--font); }
.mi-read{ position:absolute; left:0; top:0; bottom:0; right:200px; display:flex; align-items:center; gap:12px; padding-left:24px; font:600 26px/1 var(--font); color:#FFB45A; white-space:nowrap; }
*{ -webkit-user-select:none !important; user-select:none !important; }
`;
function buildReplica(){
  const V = K.cons; if(!V) return;
  const box = $('.cn-rep-box', V.root);
  const fr = el('iframe', 'cn-rep-frame'); fr.title = 'Pupil screen'; fr.setAttribute('tabindex', '-1');
  box.appendChild(fr);
  const d = fr.contentDocument, base = location.href.split('#')[0];
  d.open();
  d.write(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><base href="${esc(base)}"><link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="styles.css"><style>${REP_CSS}${window.SBCore ? SBCore.SHEET_CSS : ''}${window.SVSentence ? SVSentence.CSS + (SVSentence.REP_CSS || '') : ''}${window.SVAct ? SVAct.CSS : ''}${window.SVUnjumble ? SVUnjumble.CSS + SVUnjumble.REP_CSS : ''}${window.SVHungry ? SVHungry.CSS + SVHungry.REP_CSS : ''}${window.SVSplat ? SVSplat.CSS + SVSplat.REP_CSS : ''}${window.SVBoardGames ? SVBoardGames.CSS + SVBoardGames.REP_CSS : ''}</style></head><body></body></html>`);
  d.close();
  V.rep = { fr, doc:d, win:fr.contentWindow, box, root:$('.cn-rep', V.root), w:0, h:0, ptr:null };
  wireReplica(V);
  // Keep the replica over the big slot (or the small one while checking).
  V.ro = new ResizeObserver(()=>placeRep());
  V.ro.observe($('#cn-bigslot', V.root)); V.ro.observe($('#cn-sideslot', V.root));
  placeRep();
  send('feed'); // ask the pupil window for a full copy now
}
function placeRep(){
  const V = K.cons; if(!V || !V.rep) return;
  const R2 = V.rep, M = K.mirror;
  const target = $(V.check!=null ? '#cn-sideslot' : '#cn-bigslot', V.root);
  const main = $('.cn-main', V.root); if(!target || !main) return;
  const m = main.getBoundingClientRect(), r = target.getBoundingClientRect();
  Object.assign(R2.root.style, { left:(r.left - m.left)+'px', top:(r.top - m.top)+'px', width:r.width+'px', height:r.height+'px' });
  const pW = M ? M.w : 1920, pH = M ? M.h : 1080, h = M && M.host;
  // Cropped to the panel's slide area (no top bar or sidebar); the whole window when there's no slide (editing).
  const cx = h ? h.x : 0, cy = h ? h.y : 0, cw = h ? h.w : pW, ch = h ? h.h : pH;
  const s = Math.max(0.05, Math.min(r.width/cw, r.height/ch));
  const bw = cw*s, bh = ch*s;
  Object.assign(R2.box.style, { left:((r.width - bw)/2)+'px', top:((r.height - bh)/2)+'px', width:bw+'px', height:bh+'px' });
  R2.box.style.setProperty('--rs', s);
  Object.assign(R2.fr.style, { width:pW+'px', height:pH+'px', transform:`translate(${-cx*s}px, ${-cy*s}px) scale(${s})` });
  R2.s = s; R2.w = pW; R2.h = pH;
  const host = $('#cn-mirror', V.root);
  if(h) Object.assign(host.style, { left:0, top:0, width:bw+'px', height:bh+'px', visibility:'' });
  else Object.assign(host.style, { left:0, top:0, width:'100%', height:'100%', visibility:M ? 'hidden' : '' });
  R2.hostSig = h ? [h.x, h.y, h.w, h.h].join() : '';
}
// The pupil's slide zoom, copied onto the slide under the replica.
function syncZoom(){
  const V = K.cons; if(!V || !V.mp || !V.rep || V.zooming) return;
  const h = K.mirror && K.mirror.host, s = V.rep.s || 1, st = V.mp.stage;
  if(!st.W || !st._W) return;
  const z = h && h.z > 1.001 ? h.z : 1;
  V.zooming = true;
  try{
    if(z===1){ if(st.z!==1) st.resetZoom(); }
    else {
      const ox = h.ox*s, oy = h.oy*s;
      if(Math.abs(st.z - z) > 1e-3 || Math.abs(st.ox - ox) > 0.5 || Math.abs(st.oy - oy) > 0.5){ st.z = z; st.ox = ox; st.oy = oy; st.apply(st.base*z, true); V.ink.resize(); }
    }
  } finally { V.zooming = false; }
}
let mirrorRaf = 0;
function queueMirror(){ if(!mirrorRaf) mirrorRaf = requestAnimationFrame(()=>{ mirrorRaf = 0; applyMirror(); }); }
function applyMirror(){
  const V = K.cons, M = K.mirror; if(!V || !V.rep || !M) return;
  const R2 = V.rep, d = R2.doc; if(!d.body) return;
  const hs = M.host ? [M.host.x, M.host.y, M.host.w, M.host.h].join() : '';
  if(M.w!==R2.w || M.h!==R2.h || hs!==R2.hostSig) placeRep();
  if(d.body.className!==M.cls) d.body.className = M.cls;
  const t = d.createElement('template'); t.innerHTML = M.html;
  // The sidebar, the island's readouts and Mission Impossible's countdown live in the console itself.
  const tc = t.content;
  copyInto(V.railHost, tc.querySelector('.present:not(.preview) > .present-main > .rail'));
  copyInto(V.islHost, tc.querySelector('.present:not(.preview) .pbar .island-widgets'));
  const mi = tc.querySelector('.present .pbar .mi-layer');
  copyInto(V.miHost, mi); if(V.miHost) V.miHost.hidden = !mi;
  morphKids(d.body, tc);
  // Scroll positions the pupil has (a long class list, say)
  for(const e of d.querySelectorAll('[data-sv-st]')){ const v = Number(e.getAttribute('data-sv-st')); if(e._svst!==v){ e._svst = v; e.scrollTop = v; } }
  for(const e of d.querySelectorAll('[data-sv-st0]')){ if(e._svst){ e._svst = 0; e.scrollTop = 0; } }
  // Slide thumbnails (e.g. the panel's slide grid): drawn here, as the pupil's are left out.
  if(V.v) for(const tb of d.querySelectorAll('[data-sv-thumb]')){
    if(tb.querySelector('[data-sv-local]')) continue;
    const i = C.skey(tb.getAttribute('data-sv-thumb')), w = parseFloat(tb.style.width) || tb.clientWidth;
    if(!(i >= 0) || !w) continue;
    try{ const th = C.mountThumb(tb, V.v, i, w, V.l, V.mode); th.setAttribute('data-sv-local', ''); th.style.position = 'absolute'; th.style.left = th.style.top = '0'; }catch(e){}
  }
  syncZoom();
}
// Make par's children match src's (src's nodes are moved in where needed).
// Elements are matched by tag and data-svm, so an element the pupil still has
// keeps its CSS transitions and animations here.
function morphKids(par, src){
  const olds = [...par.childNodes].filter(n=>!(n.nodeType===1 && n.hasAttribute('data-sv-local')));
  const news = [...src.childNodes];
  for(let i=0; i<news.length; i++){
    const n = news[i], o = olds[i];
    if(!o){ par.appendChild(n); continue; }
    const same = o.nodeType===n.nodeType && (n.nodeType!==1 || (o.nodeName===n.nodeName && o.getAttribute('data-svm')===n.getAttribute('data-svm')));
    if(!same){ par.replaceChild(n, o); continue; }
    if(n.nodeType===1) morphEl(o, n);
    else if(o.nodeValue!==n.nodeValue) o.nodeValue = n.nodeValue;
  }
  for(let i=news.length; i<olds.length; i++) olds[i].remove();
}
function morphEl(o, n){
  for(const a of [...o.attributes]) if(!n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for(const a of n.attributes) if(o.getAttribute(a.name)!==a.value) o.setAttribute(a.name, a.value);
  morphKids(o, n);
}
// Pointer on the replica → the same element on the panel.
function wireReplica(V){
  const R2 = V.rep, d = R2.doc;
  const target = e=> e.target && e.target.closest ? e.target.closest('[data-svm]') : null;
  d.addEventListener('pointerdown', e=>{
    e.preventDefault(); // no focus or text selection here; the keyboard stays with the console
    if(e.button>0) return;
    const t = target(e); if(!t) return;
    if(intercept(t)) return;
    R2.ptr = { id:Number(t.getAttribute('data-svm')), x:e.clientX, y:e.clientY, moved:false, pid:e.pointerId };
    try{ e.target.setPointerCapture(e.pointerId); }catch(_){}
    send('ptr', { t:'down', id:R2.ptr.id, x:e.clientX, y:e.clientY });
  }, true);
  let mv = null;
  d.addEventListener('pointermove', e=>{
    const p = R2.ptr; if(!p || e.pointerId!==p.pid) return;
    if(!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
    if(!p.moved) return;
    mv = { x:e.clientX, y:e.clientY };
    if(!R2.mvRaf) R2.mvRaf = requestAnimationFrame(()=>{ R2.mvRaf = 0; if(mv && R2.ptr) send('ptr', { t:'move', x:mv.x, y:mv.y }); });
  }, true);
  const up = e=>{
    const p = R2.ptr; if(!p || e.pointerId!==p.pid) return;
    R2.ptr = null;
    send('ptr', { t:'up', x:e.clientX, y:e.clientY, click:!p.moved && e.type==='pointerup' });
  };
  d.addEventListener('pointerup', up, true);
  d.addEventListener('pointercancel', up, true);
  d.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); }, true);
  d.addEventListener('contextmenu', e=>e.preventDefault(), true);
  d.addEventListener('dragstart', e=>e.preventDefault(), true);
  // If the iframe does get the keyboard, hand keys to the console's handler.
  R2.onKey = e=>{ onConsoleKey(e); };
  R2.win.addEventListener('keydown', R2.onKey, true);
}
// One part of the panel copied into the console's own page (src is taken out of the mirror).
// The hosts are deliberately not .island / .rail: the tools' own document handlers match those
// selectors and would run the tool on this screen instead of sending the tap to the panel.
function copyInto(host, src){
  if(!host) return;
  if(!src){ if(host.firstChild) host.replaceChildren(); return; }
  src.remove();
  morphKids(host, src);
}
// Clicks on those copies go to the same element on the panel, as on the replica.
function wireCopy(host){
  if(!host) return;
  let p = null;
  host.addEventListener('pointerdown', e=>{
    if(e.button>0) return;
    const t = e.target.closest('[data-svm]'); if(!t || !host.contains(t)) return;
    e.preventDefault(); // no focus here; the keyboard stays with the console
    if(intercept(t)) return;
    p = { pid:e.pointerId, x:e.clientX, y:e.clientY, moved:false };
    try{ host.setPointerCapture(e.pointerId); }catch(_){}
    send('ptr', { t:'down', id:Number(t.getAttribute('data-svm')), x:0, y:0 });
  });
  host.addEventListener('pointermove', e=>{ if(p && e.pointerId===p.pid && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true; });
  const up = e=>{
    if(!p || e.pointerId!==p.pid) return;
    const click = !p.moved && e.type==='pointerup'; p = null;
    send('ptr', { t:'up', x:0, y:0, click });
  };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
}

/* ---------------- Tools menu (this screen only) ---------------- */
let MN = null; // { card, anchor }
function openMenu(anchor){
  if(MN){ closeMenu(); return; }
  const st = K.state;
  if(!st || st.view!=='present'){ toast(st && st.view==='edit' ? 'Finish editing on the pupil screen first.' : 'The pupil screen is still opening.'); return; }
  const card = el('div', 'cn-menu');
  card.innerHTML = `<div class="cn-menu-h">Tools<span>Only you see this menu</span></div>` +
    MENU.map(([k, lab, ico])=>{ if(k==='chance' && window.SVChance && SVChance.look){ const lk = SVChance.look(); lab = lk.name; ico = lk.icon; } return `<button class="cn-menu-i" data-m="${k}" title="${esc(MENU_TIPS[k] || lab)}">${ic(ico)}<span>${esc(lab)}</span>${k==='register' || k==='clock' ? `<i class="cn-priv" title="Opens on this screen only">${ic('lock')}</i>` : ''}</button>`; }).join('');
  document.body.appendChild(card);
  const a = anchor.getBoundingClientRect(), w = card.offsetWidth, hgt = card.offsetHeight;
  const left = C.data.settings.rail==='left';
  const x = left ? a.right + 12 : a.left - 12 - w;
  const y = Math.max(8, Math.min(innerHeight - hgt - 8, a.top + a.height/2 - hgt/2));
  Object.assign(card.style, { left:Math.max(8, x)+'px', top:y+'px' });
  card.addEventListener('click', e=>{ const b = e.target.closest('[data-m]'); if(!b) return; closeMenu(); toolAction(b.dataset.m); });
  const outside = e=>{ if(!card.contains(e.target)) closeMenu(); };
  setTimeout(()=>document.addEventListener('pointerdown', outside, true), 0);
  MN = { card, outside };
}
function closeMenu(){ if(!MN) return; document.removeEventListener('pointerdown', MN.outside, true); MN.card.remove(); MN = null; }
window.addEventListener('keydown', e=>{
  if(!MN || C.PUPIL) return;
  e.stopPropagation();
  if(e.key==='Escape'){ e.preventDefault(); closeMenu(); }
  else if(FWD.includes(e.key) || BACK.includes(e.key)) e.preventDefault();
}, true);
window.addEventListener('resize', ()=>closeMenu());

// Things on the replica (or the console's copies) handled here instead of on the panel. True = handled.
function intercept(t){
  // The sidebar copy: Tools opens the private menu; Home leaves the lesson on both screens.
  if(t.closest('.cn-rail [data-p=tools]')){ openMenu(t.closest('[data-p=tools]')); return true; }
  if(t.closest('.cn-rail [data-p=home]')){ consoleAction('home'); return true; }
  // Edit opens the editor on this screen; the panel carries on presenting.
  if(t.closest('.cn-rail [data-p=edit]')){ consoleEdit(); return true; }
  // The Clock is private: island readouts and the Tools box's Clock tile open it on this screen.
  const open = t.closest('.island [data-open], .cn-island [data-open]');
  if(open){ openClockHere(open.getAttribute('data-open')); return true; }
  if(t.closest('.tb-tile[data-tool=clock]')){ send('tool', { name:'closebox' }); openClockHere(); return true; }
  // Who's in? opened from this screen stays on this screen.
  if(t.closest('[data-n=register]')){ openRegister(); return true; }
  // Full screen can only be changed on the panel itself.
  if(t.closest('[data-p=fs]')){ toast('Tap full screen on the panel itself.'); return true; }
  // Renaming needs typing on the panel; from here, use the dashboard.
  if(t.closest('[data-p=title]')){ toast('Rename the lesson from the dashboard, or tap the title on the panel itself.'); return true; }
  return false;
}
function openClockHere(tab){ if(window.SVTools) SVTools.openClock(tab); }

/* ---------------- tools (from the menu) ---------------- */
function toolAction(k){
  const st = K.state;
  if(k==='clock') return openClockHere();
  if(!st || st.view!=='present'){ toast(st && st.view==='edit' ? 'Finish editing on the pupil screen first.' : 'The pupil screen is still opening.'); return; }
  if(k==='register') return openRegister();
  send('tool', { name:k });
}

/* ---------------- Who's in? (private: this screen only) ---------------- */
// The pupil window owns absences (data.absent, via SVClasses.setAbsent); its state
// reports carry the lesson's absent ids, and taps here are sent to it.
let R = null; // { back, card, l, cls, ab:Set }
function tileFit(n){
  if(n<=4)  return { cols:2, row:170, col:'320px', fs:32, big:true };
  if(n<=6)  return { cols:3, row:170, col:'300px', fs:30, big:true };
  if(n<=9)  return { cols:3, row:150, col:'300px', fs:28, big:true };
  if(n<=12) return { cols:4, row:130, col:'260px', fs:26, big:true };
  if(n<=16) return { cols:4, row:112, col:'1fr', fs:24, big:true };
  if(n<=20) return { cols:5, row:96, col:'1fr', fs:22, big:false };
  return { cols:5, row:76, col:'1fr', fs:20, big:false };
}
function openRegister(){
  const st = K.state;
  if(!st || st.view!=='present'){ toast('Open the lesson on the pupil screen first.'); return; }
  closeRegister();
  const back = el('div', 'ap-back cn-reg-back'), card = el('div', 'ap rn rn-register cn-reg');
  back.appendChild(card); document.body.appendChild(back);
  back.addEventListener('pointerdown', e=>{ if(e.target===back) closeRegister(); });
  card.addEventListener('click', onRegClick);
  R = { back, card, id:st.id };
  paintRegister();
}
function closeRegister(){ if(R){ R.back.remove(); R = null; } }
function paintRegister(){
  if(!R) return;
  const l = C.data.lessons[R.id], SC = window.SVClasses;
  const cls = l && SC ? SC.classFor(l) : null;
  const head = (inN, abN)=>`<div class="ap-head">
    <div class="ap-title">${ic('users')}Who's in?</div>
    ${cls ? `<span class="ap-chip">${esc(cls)}</span><span class="ap-total"><b>${inN}</b> in${abN ? ` · <b>${abN}</b> absent` : ''}</span>` : ''}
    <span class="cn-private">${ic('lock')}Only on this screen</span>
    <div class="grow"></div>
    <button class="tb-ic" data-r="close" title="Close (Esc)">${icon('x')}</button></div>`;
  if(!cls){
    R.card.innerHTML = head() + `<p class="ap-msg">There's no class list for <b>${esc((l && l.label) || 'this lesson')}</b> yet. If it's an extra or cover lesson, choose the class once on the panel (Random Name or Achievement Points asks).</p>`;
    return;
  }
  const names = SC.nameMap(cls);
  const pupils = SC.active(cls).slice().sort((a,b)=>names.get(a.id).localeCompare(names.get(b.id), 'en-GB', { sensitivity:'base' }));
  const ab = new Set(K.absent || []);
  const abN = pupils.filter(p=>ab.has(p.id)).length;
  const fit = tileFit(pupils.length);
  R.card.innerHTML = head(pupils.length - abN, abN) + `<div class="ap-pupils rn-reg ${fit.big ? 'big' : ''}" style="--cols:${fit.cols};--rows:${Math.ceil(pupils.length / fit.cols)};--rmax:${fit.row}px;--cmax:${fit.col};--fs:${fit.fs}px">${pupils.map(p=>`<button class="ap-p ${ab.has(p.id) ? 'abs' : ''}" data-pid="${esc(p.id)}"><span class="nm">${esc(names.get(p.id))}</span>${ab.has(p.id) ? '<span class="rn-abs">Absent</span>' : ''}</button>`).join('')}</div>
    <div class="ap-foot"><div class="ap-sum">Tap a name to mark them absent. Pupils don't see this. Absent pupils are never picked and are greyed out in Achievement Points.</div>
    <button class="clk-btn primary lg" data-r="close">${ic('check')}Done</button></div>`;
}
function onRegClick(e){
  const b = e.target.closest('button'); if(!b || !R) return;
  if(b.dataset.r==='close') return closeRegister();
  const pid = b.dataset.pid; if(!pid) return;
  const ab = new Set(K.absent || []), on = !ab.has(pid);
  if(on) ab.add(pid); else ab.delete(pid);
  K.absent = [...ab]; // shown straight away; the pupil's next state report confirms it
  send('absent', { id:R.id, pid, on });
  paintRegister();
}
window.addEventListener('keydown', e=>{
  if(!R || C.PUPIL) return;
  e.stopPropagation();
  if(e.key==='Escape' || e.key==='Enter'){ e.preventDefault(); closeRegister(); }
  else if(FWD.includes(e.key) || BACK.includes(e.key)) e.preventDefault();
}, true);

/* ---------------- editing on the teacher screen ---------------- */
// The editor runs here on this window's copy of the data. This window doesn't save while it's open:
// saveSoon() calls edSync() instead, which sends every slide that changed to the pupil window.
// The pupil window owns the data, saves, and redraws its slide if it's the one changed.
const ED = { E:null, snap:null, pend:new Map(), t:null };
function consoleEdit(){
  const V = K.cons, st = K.state; if(!V) return;
  if(!st || st.view!=='present'){ toast(st && st.view==='edit' ? 'Finish editing on the pupil screen first.' : 'The pupil screen is still opening.'); return; }
  if(V.check!=null) setCheck(null);
  closeMenu(); closeRegister();
  const id = st.id, slide = st.i;
  closeConsole();
  C.saveHold = edSync;
  C.openEditor(id, { slide, resume:edResume }).then(()=>{
    const v = C.view;
    if(v.name!=='edit' || !v.E || v.E.resume!==edResume) return; // couldn't open (edResume has run)
    ED.E = v.E; ED.snap = edSnap(v.E.l, v.E.mode);
    v.E.onShow = markLive;
    markLive();
  });
}
function edStop(){ clearTimeout(ED.t); ED.t = null; ED.E = null; ED.snap = null; C.saveHold = null; }
function edResume(){
  edFlush(); edStop();
  const st = K.state;
  if(alive() && st && st.view==='present' && st.id) openConsole(st.id);
  else if(alive() && st && st.view==='edit'){ toast('The pupil screen is in its own editor.'); C.renderDashboard(); }
  else C.renderDashboard();
}
// Each slide's edits (hides[mode][i]) and My notes, as text, to spot what changed.
function edSnap(l, mode){
  const h = {}, n = {};
  for(const [i, c] of Object.entries(l.hides[mode] || {})) h[i] = JSON.stringify(c);
  for(const i of Object.keys(l.myNotes[mode] || {})) n[i] = C.myNote(l, mode, C.skey(i));
  return { h, n, s:JSON.stringify((l.slides && l.slides[mode]) || null), p:JSON.stringify([l.print || null, l.printCode==null ? null : l.printCode, l.stack || null]) };
}
function edSync(){ clearTimeout(ED.t); ED.t = setTimeout(edFlush, 120); }
function edFlush(){
  clearTimeout(ED.t); ED.t = null;
  const E = ED.E; if(!E || !ED.snap) return;
  const l = E.l, mode = E.mode, was = ED.snap, now = edSnap(l, mode);
  for(const k of new Set([...Object.keys(was.h), ...Object.keys(now.h)])){
    if(was.h[k]===now.h[k]) continue;
    const i = C.skey(k), cfg = now.h[k]!=null ? JSON.parse(now.h[k]) : null;
    ED.pend.set(noteKey(l.id, mode, i), { id:l.id, mode, i, cfg });
    send('hides', { id:l.id, mode, i, cfg });
  }
  for(const k of new Set([...Object.keys(was.n), ...Object.keys(now.n)])){
    if((was.n[k] || '')===(now.n[k] || '')) continue;
    const i = C.skey(k), text = now.n[k] || '';
    K.noteEdits.set(noteKey(l.id, mode, i), { id:l.id, mode, i, text, sent:true });
    send('note', { id:l.id, mode, i, text });
  }
  // Slide order (rearranged, hidden, deleted, added slides): after the slides' edits, so new slides arrive with theirs.
  if(was.s!==now.s){
    const list = JSON.parse(now.s);
    ED.pend.set('slides\n' + l.id + '\n' + mode, { id:l.id, mode, slides:true, list });
    send('slides', { id:l.id, mode, list });
  }
  // Print choices made from the editor's Print (printed / not printed, class code).
  if(was.p!==now.p){
    const [print, printCode, stack] = JSON.parse(now.p);
    ED.pend.set('print\n' + l.id, { id:l.id, print, printCode, stack });
    send('print', { id:l.id, print, printCode, stack });
  }
  ED.snap = now;
}
// The pupil's data has come back: drop slide edits it now has; put back any it doesn't yet (a save from before them).
function reapplyHides(){
  for(const [k, p] of ED.pend){
    const l = C.data.lessons[p.id]; if(!l){ ED.pend.delete(k); continue; }
    if(p.slides){
      const have = JSON.stringify((l.slides && l.slides[p.mode]) || null), want = JSON.stringify(p.list || null);
      if(have===want) ED.pend.delete(k); else setSlides(l, p.mode, p.list);
      continue;
    }
    if(!p.mode){ // print choices
      const have = JSON.stringify([l.print || null, l.printCode==null ? null : l.printCode, l.stack || null]), want = JSON.stringify([p.print, p.printCode, p.stack || null]);
      if(have===want) ED.pend.delete(k);
      else setPrint(l, p.print, p.printCode, p.stack);
      continue;
    }
    if(!l.hides[p.mode]){ ED.pend.delete(k); continue; }
    const have = l.hides[p.mode][p.i] ? JSON.stringify(l.hides[p.mode][p.i]) : null, want = p.cfg ? JSON.stringify(p.cfg) : null;
    if(have===want) ED.pend.delete(k);
    else if(p.cfg) l.hides[p.mode][p.i] = JSON.parse(want);
    else delete l.hides[p.mode][p.i];
  }
}
function setSlides(l, mode, list){
  if(Array.isArray(list) && list.length){ if(!l.slides) l.slides = {}; l.slides[mode] = JSON.parse(JSON.stringify(list)); }
  else if(l.slides){ delete l.slides[mode]; if(!Object.keys(l.slides).length) delete l.slides; }
}
function setPrint(l, print, printCode, stack){
  if(print) l.print = JSON.parse(JSON.stringify(print)); else delete l.print;
  if(printCode!=null) l.printCode = printCode; else delete l.printCode;
  if(stack && stack.length) l.stack = JSON.parse(JSON.stringify(stack)); else delete l.stack; // Printer Stack (v1.30)
}
// The Live badge: which slide the pupils are looking at (changes to it show on the panel straight away).
function markLive(){
  const E = ED.E; if(!E) return;
  const st = K.state;
  const on = st && st.view==='present' && st.id===E.l.id && st.mode===E.mode ? st.i : null;
  $$('.ed-thumb').forEach(b=>b.classList.toggle('live', C.skey(b.dataset.k)===on));
  const t = $('#ed-live'); if(!t) return;
  t.classList.toggle('here', on!=null && on===E.i);
  const at = on==null ? -1 : E.v.pos(on);
  t.textContent = on==null ? 'Pupil screen isn\'t on this lesson'
    : on===E.i ? 'Live: changes show on the pupil screen'
    : at>=0 ? `Pupil screen is on slide ${at + 1}` : 'Pupil screen is on a slide you deleted';
}

/* ---------------- commands to the pupil window ---------------- */
function send(cmd, extra){ if(!alive()) return; post(K.win, Object.assign({ type:'cmd', cmd }, extra || {})); }
function consoleAction(a){
  const V = K.cons; if(!V) return;
  const st = K.state, editing = st && st.view==='edit';
  switch(a){
    case 'home': if(editing) return toast('Finish editing on the pupil screen first.'); send('idle'); closeRegister(); closeConsole(); C.renderDashboard(); break;
    case 'close': closePupil(); break;
    case 'check': if(V.check!=null) setCheck(null); else setCheck(curState().pos); break;
    case 'fwd': if(!editing) send('key', { key:'PageDown' }); break;
    case 'back': if(!editing) send('key', { key:'PageUp' }); break;
    case 'cprev': setCheck(V.check - 1); break;
    case 'cnext': setCheck(V.check + 1); break;
    case 'cshow': if(!editing){ send('slide', { i:V.order[V.check] }); setCheck(null); } break;
    case 'cresume': setCheck(null); break;
  }
}
function onConsoleKey(e){
  if(C.PUPIL || C.view.name!=='console' || !K.cons) return;
  if(e.target.closest && e.target.closest('input,textarea')) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const V = K.cons;
  if(V.check!=null){
    if(FWD.includes(e.key)){ e.preventDefault(); setCheck(V.check + 1); }
    else if(BACK.includes(e.key)){ e.preventDefault(); setCheck(V.check - 1); }
    else if(e.key==='Home'){ e.preventDefault(); setCheck(0); }
    else if(e.key==='End'){ e.preventDefault(); setCheck(V.order.length - 1); }
    else if(e.key==='Escape'){ e.preventDefault(); setCheck(null); }
    return;
  }
  if(K.state && K.state.view==='edit') return;
  // A text box is being typed in on the panel (e.g. renaming in Beat the Teacher): every key goes there.
  if(K.mirror && K.mirror.focus){
    if(e.key.length===1 || ['Backspace','Delete','Enter','Escape','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){ e.preventDefault(); send('key', { key:e.key }); }
    return;
  }
  if(FWD.includes(e.key) || BACK.includes(e.key) || e.key==='Home' || e.key==='End' || e.key==='Escape'){
    e.preventDefault();
    send('key', { key:e.key });
  }
}
document.addEventListener('keydown', onConsoleKey);

/* ---------------- top bar: status, clock ---------------- */
function renderStatus(){
  const s = $('#cn-status'); if(!s) return;
  const st = K.state;
  let cls = 'ok', txt = 'Pupil screen connected';
  if(!alive()){ cls = 'off'; txt = 'Pupil screen closed'; }
  else if(!K.ready){ cls = 'wait'; txt = 'Opening the pupil screen…'; }
  else if(K.placeHint){ cls = 'wait'; txt = 'Drag the pupil window onto the panel, then tap it'; }
  else if(st && !st.fs){ cls = 'wait'; txt = 'Tap the panel once to go full screen'; }
  if(K.placeHint && st && st.fs) K.placeHint = false;
  s.className = 'cn-status ' + cls;
  s.innerHTML = `<i></i>${esc(txt)}`;
}
// The console's island: always HH:MM:SS, then "12 min until Break" (the next timetabled slot today).
// Also shows the sidebar's End of lesson button only in the lesson's last 5 minutes.
function startClock(){
  const V = K.cons;
  const loop = ()=>{
    if(K.cons!==V) return;
    const n = new Date(), t = $('.cn-time', V.root), u = $('.cn-until', V.root);
    const ts = hhmmss(n); if(t && t.textContent!==ts) t.textContent = ts;
    if(u){
      const nx = nextSlot(n), txt = nx ? `${nx.min} min until ${nx.label}` : '';
      if(u.textContent!==txt) u.textContent = txt;
      u.hidden = !nx; u.classList.toggle('warn', !!nx && nx.min<=5);
    }
    if(V.railHost) V.railHost.classList.toggle('no-end', !endDue(V.l, n));
    V.clockT = setTimeout(loop, 1005 - Date.now()%1000);
  };
  loop();
}
const hhmmss = d => `${hhmm(d)}:${pad2(d.getSeconds())}`;
const toMin = t => { const [a, b] = String(t || '').split(':').map(Number); return a*60 + (b || 0); };
const nowMin = d => d.getHours()*60 + d.getMinutes() + d.getSeconds()/60;
// The next slot today that hasn't started (Break, Lunch, Form, a class code, PPA…), or the end of the day.
function nextSlot(n){
  const Pl = C.Planner; if(!Pl || !Pl.data) return null;
  const day = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if(Pl.holiday(day)) return null;
  const slots = Pl.slotsFor(day).filter(s=>s.start); if(!slots.length) return null;
  const now = nowMin(n);
  const nx = slots.find(s=>toMin(s.start) > now);
  if(nx) return { min:Math.ceil(toMin(nx.start) - now), label:/^Form\b/.test(nx.label || '') ? 'Form' : (nx.label || 'next period') };
  const last = Math.max(...slots.map(s=>s.end ? toMin(s.end) : 0));
  return last > now ? { min:Math.ceil(last - now), label:'end of day' } : null;
}
// End of lesson shows from 5 minutes before the timetabled end (and after it). Lessons with
// no timetabled time, or shown on another day, always have it.
function endDue(l, n){
  if(!l || !l.start || !l.end || l.date!==C.iso(n)) return true;
  return nowMin(n) >= toMin(l.end) - 5;
}

/* =====================================================================
   PUPIL side (index.html?screen=pupil on the panel)
   ===================================================================== */
const U = { linked:false, connected:false, inited:false, detached:false, fsOk:false, rpcs:new Map(), rid:0, sig:'', liveT:0, stT:null, idleT:null, ptr:null };
const opener = ()=>window.opener && !window.opener.closed ? window.opener : null;

async function bootPupil(){
  document.title = 'Pupil screen · Slideshow Viewer';
  document.body.classList.add('pupil-win');
  showIdle('Connecting to the teacher screen…');
  if(!opener()){ detach(); return; }
  U.linked = true;
  const hello = ()=>{ if(!U.inited && U.linked) post(opener(), { type:'hello' }); };
  hello(); U.helloT = setInterval(hello, 400);
  // Watch for the console closing; ping so a reloaded console can find this window again.
  let n = 0;
  U.pollT = setInterval(()=>{
    if(!U.linked) return;
    if(!opener()){ detach(); return; }
    if(U.inited && ++n % 3===0) post(opener(), { type:'ping' });
    sendState(); // safety net: picks up changes no hook reported (full screen, preview, timers…)
  }, 500);
  window.addEventListener('pagehide', ()=>{
    if(!U.linked || U.reloading) return; // Refresh: the data has already gone to the console
    if(C.saving || U.pendingSave){ postSave(C.data); }
    else if(C.view.name==='present' && C.view.P){ C.view.P.l.lastSlide = C.view.P.pos; postSave(C.data); }
    post(opener(), { type:'bye', state:stateNow() });
  });
  document.addEventListener('fullscreenchange', ()=>sendState());
  feedStart();
}
function pupilMsg(e){
  if(!U.linked || e.source!==window.opener) return;
  const m = e.data;
  switch(m.type){
    case 'init':
      if(U.inited) return;
      U.inited = U.connected = true; clearInterval(U.helloT);
      C.setPlanner(m.planner);
      C.adopt(m.data, false);
      if(m.open) openLesson(m.open.id, m.open.pos);
      else { const n = C.takeRefresh(); if(n) openLesson(n.id, n.pos).then(()=>{ if(C.view.name==='present') C.applyRefresh(C.view.P, n); }); else showIdle(); }
      askFullscreen();
      break;
    case 'resync':
      // The console was reloaded: it gets this window's data (the newest) and state.
      U.connected = true;
      if(C.data){ postSave(C.data); U.pendingSave = false; }
      U.sig = ''; sendState(); F.last = ''; feedDirty();
      break;
    case 'data':
      // The console saved something itself (only happens between lessons).
      if(C.view.name!=='present' && C.view.name!=='edit' && C.view.name!=='preview') C.adopt(m.data, false);
      break;
    case 'cmd': doCmd(m); break;
    case 'rpcResult': { const r = U.rpcs.get(m.id); if(r){ U.rpcs.delete(m.id); clearTimeout(r.t); if(m.err) r.rej(new Error(m.err)); else r.res(m.res); } break; }
    case 'bye':
      U.connected = false; // reloading or closing: the poll decides which
      // Requests without a time limit (Teacher's Choice) would never be answered by a reloaded console.
      for(const [id, r] of U.rpcs) if(!r.t){ U.rpcs.delete(id); r.rej(new Error('The teacher screen was reloaded. Try Teacher\'s Choice again.')); }
      break;
  }
}
function doCmd(m){
  const v = C.view, P = v.name==='present' ? v.P : null;
  switch(m.cmd){
    case 'open': openLesson(m.id, m.pos || 0); askFullscreen(); break;
    case 'reload': U.reloading = true; location.reload(); break; // v1.76 Refresh (refreshBoth)
    case 'idle':
      if(P) C.exitPresenter(P);
      else if(v.name==='edit' && v.E){ v.E.stage.destroy(); C.saveSoon(200); C.renderDashboard(); }
      else showIdle();
      break;
    // Keys go through the normal key handling, so an open tool or pop-up gets them first, as with a clicker.
    case 'key': pressKey(m.key, !!P); break;
    case 'go': if(P && m.pos>=0 && m.pos<P.order.length){ P.pos = m.pos; C.showSlide(P); } break;
    case 'slide': if(P){ const pos = P.order.indexOf(m.i); if(pos>=0){ P.pos = pos; C.showSlide(P); } } break;
    case 'reveal': if(P && P.l.id===m.id && P.order[P.pos]===m.i){ C.flipped(P, m.i).add(m.key); C.applyVisibility(P); C.buildOverlay(P); } break;
    case 'ptr': replayPtr(m); break;
    case 'tool': runTool(P, m.name); break;
    case 'clock': if(window.SVTools && SVTools.remote){ SVTools.remote(m.op, m.args); U.sig = ''; sendState(); } break;
    case 'absent': if(P && P.l.id===m.id && window.SVClasses){ SVClasses.setAbsent(P.l, m.pid, !!m.on); sendState(); } break;
    case 'note': { const l = C.data && C.data.lessons[m.id]; if(l){ C.setMyNote(l, m.mode, m.i, m.text); C.saveSoon(400); } break; }
    // A slide edited in the console's editor: store it; redraw the slide if it's showing (reveals and pen marks kept).
    case 'hides': {
      const l = C.data && C.data.lessons[m.id]; if(!l || !l.hides[m.mode]) break;
      if(m.cfg) l.hides[m.mode][m.i] = m.cfg; else delete l.hides[m.mode][m.i];
      C.saveSoon(400);
      if(P && P.l.id===m.id && P.mode===m.mode && P.order[P.pos]===m.i) P.v.sync().then(()=>{ if(C.view.P===P) C.showSlide(P); });
      break;
    }
    case 'print': { const l = C.data && C.data.lessons[m.id]; if(l){ setPrint(l, m.print, m.printCode, m.stack); C.saveSoon(400); } break; }
    // The slide list changed in the console's editor: keep presenting the same slide (any newly used decks load first).
    case 'slides': {
      const l = C.data && C.data.lessons[m.id]; if(!l) break;
      setSlides(l, m.mode, m.list);
      C.saveSoon(400);
      if(P && P.l.id===m.id && P.mode===m.mode) P.v.sync().then(()=>{ if(C.view.P===P) C.refreshOrder(P); });
      break;
    }
    case 'feed': F.last = ''; feedDirty(); break;
  }
}
// The console's tool bar.
function runTool(P, name){
  if(!P) return;
  const T = window.SVTools;
  if(name==='closebox'){ if(T) T.closeBox(); return; }
  if(T && T.open) T.closeBox(); // the Tools box would sit over the tool
  switch(name){
    case 'blur': C.setBlur(P, !P.blur); break;
    case 'names': if(window.SVNames) SVNames.open(); break;
    case 'points': if(window.SVPoints) SVPoints.open(); break;
    case 'box4': if(window.SVBox4) SVBox4.open(); break;
    case 'btt': if(window.SVTally) SVTally.openBtt(); break;
    case 'bob': if(window.SVTally) SVTally.openBob(); break;
    case 'mission': if(window.SVMission) SVMission.start(); break;
    case 'chance': if(window.SVChance) SVChance.open(); break;
    case 'sb': if(window.SVSentence) SVSentence.open(); break;
    case 'unjumble': if(window.SVUnjumble) SVUnjumble.open(); break;
    case 'hungry': if(window.SVHungry) SVHungry.open(); break;
    case 'splat': if(window.SVSplat) SVSplat.open(); break;
    case 'noughts': if(window.SVNoughts) SVNoughts.open(); break;
    case 'connect4': if(window.SVConnect4) SVConnect4.open(); break;
    case 'end': if(window.SVPoints && SVPoints.showEnd) SVPoints.showEnd(P.l); break;
  }
}
// A key from the console. While a text box here has focus (e.g. a name in Beat the Teacher), it's typed into it.
function pressKey(key, presenting){
  const a = document.activeElement;
  const typing = a && a.matches && a.matches('input:not([type=button]):not([type=checkbox]),textarea');
  if(typing && (key.length===1 || key==='Backspace' || key==='Delete')){
    const s = a.selectionStart==null ? a.value.length : a.selectionStart, e2 = a.selectionEnd==null ? s : a.selectionEnd;
    let v = a.value, c = s;
    if(key==='Backspace'){ if(s!==e2) v = v.slice(0, s) + v.slice(e2); else if(s>0){ v = v.slice(0, s-1) + v.slice(s); c = s - 1; } }
    else if(key==='Delete'){ v = s!==e2 ? v.slice(0, s) + v.slice(e2) : v.slice(0, s) + v.slice(s + 1); }
    else { if(a.maxLength>0 && v.length - (e2 - s) >= a.maxLength) return; v = v.slice(0, s) + key + v.slice(e2); c = s + 1; }
    a.value = v; try{ a.setSelectionRange(c, c); }catch(_){}
    a.dispatchEvent(new Event('input', { bubbles:true }));
    return;
  }
  if(!presenting && !typing) return;
  const t = typing ? a : document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles:true, cancelable:true }));
}
// A pointer from the replica, replayed on the same element here (pointerdown/move/up, then click).
function replayPtr(m){
  const fire = (t, type)=>{
    t.dispatchEvent(new PointerEvent(type, { bubbles:true, cancelable:true, composed:true, view:window, clientX:m.x, clientY:m.y,
      pointerId:9001, pointerType:'mouse', isPrimary:true, button:type==='pointermove' ? -1 : 0, buttons:type==='pointerup' ? 0 : 1 }));
  };
  if(m.t==='down'){
    const t = F.byId.get(m.id);
    U.ptr = t && t.isConnected ? t : null;
    if(U.ptr) fire(U.ptr, 'pointerdown');
    return;
  }
  const t = U.ptr; if(!t) return;
  if(m.t==='move'){ fire(t, 'pointermove'); return; }
  U.ptr = null;
  fire(t, 'pointerup');
  if(m.click && t.isConnected && !t.disabled && !(t.closest && t.closest('[disabled]'))){
    U.desk = true; // SVDual.fromDesk: this click came from the teacher screen
    try{ t.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, composed:true, view:window, clientX:m.x, clientY:m.y, button:0, detail:1 })); }
    finally{ U.desk = false; }
  }
}
async function openLesson(id, pos){
  const v = C.view;
  if(v.name==='present' && v.P){
    if(v.P.l.id===id){ v.P.pos = Math.max(0, Math.min(pos || 0, v.P.order.length - 1)); C.showSlide(v.P); return; }
    C.exitPresenter(v.P, true, false);
  } else if(v.name==='preview' || v.name==='edit'){
    const E = v.E; if(v.name==='preview' && v.P){ v.P.stage.destroy(); v.P.root.remove(); }
    if(E){ E.stage.destroy(); C.saveSoon(200); }
  }
  clearInterval(U.idleT);
  await C.openPresenter(id, pos || 0);
  if(C.view.name!=='present') showIdle();
}
// Between lessons: the date and time on black.
function showIdle(msg){
  window.SVHost.setView('idle');
  document.body.classList.add('presenting');
  const app = $('#app');
  app.innerHTML = `<div class="pupil-idle"><div class="pi-time"></div><div class="pi-date"></div>${msg ? `<div class="pi-msg">${esc(msg)}</div>` : ''}</div>`;
  const tick = ()=>{
    const t = $('.pi-time'), d = $('.pi-date'); if(!t){ clearInterval(U.idleT); return; }
    const n = new Date(); t.textContent = hhmm(n); d.textContent = C.dateWords(n, 'fr');
  };
  clearInterval(U.idleT); tick(); U.idleT = setInterval(tick, 1000);
  sendState();
}
function idleInstead(){ if(!C.PUPIL || !U.linked) return false; showIdle(); return true; }

// Edge only goes full screen after a tap in this window.
function askFullscreen(){
  if(document.fullscreenElement || $('.dual-fs')) return;
  const o = el('div','dual-fs', `<div class="dual-fs-card">${icon('max')}<b>Tap to go full screen</b></div>`);
  o.addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation();
    o.remove();
    const d = document.documentElement; if(d.requestFullscreen) d.requestFullscreen().catch(()=>{});
  }, true);
  document.body.appendChild(o);
}

/* ---------------- state reports ---------------- */
function stateNow(){
  const v = C.view, P = v.name==='present' ? v.P : null;
  const s = { view: P ? 'present' : (v.name==='edit' || v.name==='preview') ? 'edit' : 'idle', date: C.iso(C.selDate), fs: !!document.fullscreenElement };
  if(P){
    const i = P.order[P.pos];
    Object.assign(s, { id:P.l.id, mode:P.mode, order:P.order, pos:P.pos, i, f:[...C.flipped(P, i)], blur:!!P.blur });
    if(window.SVClasses) try{ s.absent = [...SVClasses.absentSet(P.l.id)]; }catch(e){}
  } else if(v.E) s.id = v.E.l.id;
  if(window.SVTools && SVTools.snapshot) s.clock = SVTools.snapshot();
  return s;
}
function sendState(){
  clearTimeout(U.stT); U.stT = null;
  if(!U.linked || !U.inited || !U.connected) return;
  const s = stateNow();
  const sig = JSON.stringify(s);
  if(sig===U.sig) return;
  U.sig = sig;
  const P = s.view==='present' ? C.view.P : null;
  if(P) s.strokes = P.ink ? P.ink.strokes : [];
  post(opener(), { type:'state', state:s });
}
// From app.js (dualNotify): 'open' 'leave' 'edit' 'reveal' 'blur' 'ink' 'live'
function notify(kind){
  if(!U.linked || !U.inited || !U.connected) return;
  const P = C.view.name==='present' ? C.view.P : null;
  if(kind==='live'){
    if(!P || !P.ink || !P.ink.cur) return;
    const now = Date.now(); if(now - U.liveT < 60) return; U.liveT = now;
    // v1.61: only the points added since the last message (the whole stroke when it's a new one).
    const cur = P.ink.cur;
    if(U.liveCur!==cur || !(C.beta && C.beta('fast'))){ U.liveCur = cur; U.liveN = 0; } // Beta 'fast' off: the whole stroke every time, as before
    const from = U.liveN; U.liveN = cur.pts.length;
    if(from && from===U.liveN) return;
    post(opener(), { type:'live', id:P.l.id, i:P.order[P.pos], from, cur: from ? { pts:cur.pts.slice(from) } : cur });
    return;
  }
  if(kind==='ink'){
    if(P) post(opener(), { type:'ink', id:P.l.id, i:P.order[P.pos], strokes:P.ink.strokes });
    return;
  }
  if(!U.stT) U.stT = setTimeout(sendState, 0);
}

/* ---------------- the mirror feed (pupil → console replica) ---------------- */
// Everything on this screen except the slide, as HTML, whenever it changes.
const F = { ids:new WeakMap(), byId:new Map(), n:0, last:'', raf:0, lastT:0, mo:null };
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const SKIP_TAG = new Set(['SCRIPT','STYLE','LINK','VIDEO','AUDIO','IFRAME','TEMPLATE','NOSCRIPT']);
const SKIP_CLS = ['dual-fs','dual-reconnect','stage-ink','mi-boom','zoom-pill','sb-measure','wb-root'];
function feedStart(){
  if(F.mo) return;
  F.mo = new MutationObserver(ms=>{
    for(const m of ms){
      const t = m.target.nodeType===1 ? m.target : m.target.parentNode;
      if(t && t.closest && (t.closest('.stage-scale') || t.matches('canvas.stage-ink'))) continue; // the slide itself
      feedDirty(); return;
    }
  });
  F.mo.observe(document.body, { subtree:true, childList:true, attributes:true, characterData:true });
  for(const t of ['scroll','input','focusin','focusout']) document.addEventListener(t, feedDirty, true);
  window.addEventListener('resize', feedDirty);
  setInterval(()=>{ if(window.SVMission && SVMission.running) feedDirty(); }, 250); // its readout has no DOM changes
}
function feedDirty(){ if(!F.raf) F.raf = requestAnimationFrame(feedFrame); }
const scripted = a => !(window.CSSAnimation && a instanceof CSSAnimation) && !(window.CSSTransition && a instanceof CSSTransition);
function feedFrame(){
  F.raf = 0;
  if(!U.linked || !U.inited || !U.connected) return;
  const now = performance.now();
  if(now - F.lastT < 33){ F.raf = requestAnimationFrame(feedFrame); return; } // ~30 a second at most
  F.lastT = now;
  // Animations run from script (the Random Name reel, the name flying to the island) change no
  // attributes, so while one runs, send every frame with its current position written in.
  // A finished one that holds its last frame (fill:'forwards', e.g. the reel stopped on the name)
  // is written in too, or the copy here snaps back to its start.
  const holds = a => a.playState==='finished' && a.effect && a.effect.getTiming && /forwards|both/.test(a.effect.getTiming().fill);
  const all = document.getAnimations ? document.getAnimations().filter(a=>scripted(a) && (a.playState==='running' || holds(a))) : [];
  const anims = all.filter(a=>a.playState==='running');
  F.animT = new Set(all.map(a=>a.effect && a.effect.target).filter(Boolean));
  let m;
  try{ m = serialise(); }catch(e){ console.warn('dual: mirror', e); return; }
  const sig = m.html + '|' + m.w + 'x' + m.h + '|' + m.cls + '|' + JSON.stringify(m.host) + '|' + m.focus;
  if(sig!==F.last){ F.last = sig; post(opener(), { type:'mirror', m }); }
  if(anims.length) feedDirty();
}
function idOf(e){ let id = F.ids.get(e); if(!id){ id = ++F.n; F.ids.set(e, id); } F.byId.set(id, e); return id; }
function serialise(){
  F.byId = new Map();
  let html = '';
  for(const c of document.body.childNodes) html += ser(c);
  const P = C.view.name==='present' ? C.view.P : null;
  let host = null;
  if(P && P.stage && P.stage.host && P.stage.host.isConnected){
    const r = P.stage.host.getBoundingClientRect(), st = P.stage;
    host = { x:Math.round(r.left*10)/10, y:Math.round(r.top*10)/10, w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10, z:Math.round(st.z*1000)/1000, ox:Math.round(st.ox), oy:Math.round(st.oy) };
  }
  const a = document.activeElement;
  const focus = a && a!==document.body && a.matches && a.matches('input,textarea') ? F.ids.get(a) || null : null;
  return { html, w:innerWidth, h:innerHeight, cls:document.body.className, host, focus };
}
function ser(e){
  if(e.nodeType===3) return esc(e.nodeValue);
  if(e.nodeType!==1) return '';
  const tag = e.tagName;
  if(SKIP_TAG.has(tag)) return '';
  const cl = e.classList;
  for(const c of SKIP_CLS) if(cl.contains(c)) return '';
  if(e instanceof SVGElement) return e.outerHTML;
  const id = idOf(e);
  if(cl.contains('mi-cv')){ const s = window.SVMission && SVMission.status ? SVMission.status() : null; return `<div class="mi-read" data-svm="${id}">${esc(s ? s.text : '')}</div>`; }
  let attrs = '', style = e.getAttribute('style') || '';
  for(const a of e.attributes){
    if(a.name==='style' || (a.name==='value' && tag==='INPUT')) continue;
    attrs += ` ${a.name}="${esc(a.value)}"`;
  }
  if(F.animT && F.animT.has(e)){ const cs = getComputedStyle(e); style += `;transform:${cs.transform};opacity:${cs.opacity}`; }
  if(style) attrs += ` style="${esc(style)}"`;
  attrs += ` data-svm="${id}"`;
  if(tag==='INPUT') attrs += ` value="${esc(e.value)}"`;
  if(e.scrollTop > 0) attrs += ` data-sv-st="${Math.round(e.scrollTop)}"`;
  else if(e.scrollHeight > e.clientHeight + 1 && e.clientHeight) attrs += ' data-sv-st0=""';
  if(tag==='CANVAS') return `<canvas${attrs}></canvas>`;
  if(cl.contains('stage-scale')) return `<div${attrs}></div>`; // the slide: the console draws its own
  if(cl.contains('thumb-box')){ const i = thumbIndex(e); return `<div${attrs}${i!=null ? ` data-sv-thumb="${i}"` : ''}></div>`; }
  const t = tag.toLowerCase();
  if(VOID.has(t)) return `<${t}${attrs}>`;
  let inner = '';
  if(tag==='TEXTAREA') inner = esc(e.value);
  else for(const c of e.childNodes) inner += ser(c);
  return `<${t}${attrs}>${inner}</${t}>`;
}
// A thumbnail in the slide grid: which slide it is (the console draws it).
function thumbIndex(e){
  const P = C.view.name==='present' ? C.view.P : null; if(!P) return null;
  const cell = e.closest('.grid-overlay .cell'); if(!cell) return null;
  const pos = [...cell.parentNode.children].indexOf(cell);
  return pos>=0 && pos<P.order.length ? P.order[pos] : null;
}

/* ---------------- storage for the pupil window (app.js LinkStore) ---------------- */
// Pupil → console save (v1.52): base is what this window last sent (or was given), so the console can
// merge in other computers' saves without undoing anything this window changed since.
function postSave(d){ post(opener(), { type:'save', base:C.pupilBase, data:d }); C.pupilSent(d); }
function rpc(op, args, ms = 30000){ // ms 0 = wait as long as it takes (the teacher choosing something)
  return new Promise((res, rej)=>{
    if(!U.connected) return rej(new Error('The teacher screen is not connected.'));
    const id = ++U.rid;
    const t = ms ? setTimeout(()=>{ U.rpcs.delete(id); rej(new Error('The teacher screen did not answer.')); }, ms) : 0;
    U.rpcs.set(id, { res, rej, t });
    post(opener(), { type:'rpc', id, op, args });
  });
}
const viaLink = ()=>U.linked;
const link = {
  get name(){ return viaLink() ? 'the teacher screen' : C.FsStore.name; },
  async restore(){ return viaLink() ? 'ok' : C.FsStore.restore(); },
  async reconnect(){ if(viaLink()) return true; const ok = await (C.FsStore.dir ? C.FsStore.reconnect() : C.FsStore.pick().then(()=>true)); U.fsOk = ok; return ok; },
  async pick(){ if(viaLink()) return; await C.FsStore.pick(); U.fsOk = true; },
  async readData(){ if(viaLink()) return { data:C.data, mtime:1 }; return C.FsStore.readData(); },
  async mtime(){ return viaLink() ? 1 : C.FsStore.mtime(); },
  async writeData(o){
    if(viaLink()){
      if(U.connected){ postSave(o); U.pendingSave = false; }
      else U.pendingSave = true; // sent when the console is back (resync)
      return 1;
    }
    if(U.fsOk) return C.FsStore.writeData(o, C.FsStore.base==null ? C.pupilBase : undefined); // first write on its own: merge against the copy it was given
    reconnectBar(); U.pendingSave = true;
    return 1; // kept in memory, written once the folder is reconnected
  },
  async readDeck(p){
    if(viaLink()){ const buf = await rpc('readDeck', [p]); return new Blob([buf]); }
    if(U.fsOk) return C.FsStore.readDeck(p);
    reconnectBar(); throw new Error('tap the bar at the bottom to reconnect to the OneDrive folder first');
  },
  async exists(n){ return viaLink() ? rpc('exists', [n]) : C.FsStore.exists(n); },
  async writeDeck(n, f){ return viaLink() ? rpc('writeDeck', [n, f]) : C.FsStore.writeDeck(n, f); },
  async deleteDeck(p){ return viaLink() ? rpc('deleteDeck', [p]) : C.FsStore.deleteDeck(p); },
  // Sentence builders (sb-present.js gallery): the console lists them when linked.
  async sbList(){
    if(viaLink()) return rpc('sbList', []);
    if(!U.fsOk){ reconnectBar(); throw new Error('tap the bar at the bottom to reconnect to the OneDrive folder first'); }
    return SBCore.listBuilders(C.FsStore.dir);
  },
  // Sentence builder grammar rules (sb-grammar.js, v1.58): the file's text, read by the console when linked.
  async sbRules(){
    if(viaLink()) return rpc('sbRules', []);
    return U.fsOk && window.SBGrammar ? SBGrammar.readFrom(C.FsStore.dir) : null;
  },
  // Mindreader Teacher's Choice: the teacher picks the sentence on the console.
  async sbPick(req){ return rpc('sbPick', [req], 0); },
  sbPickEnd(){ if(U.connected && opener()) post(opener(), { type:'sbPickEnd' }); },
  // Sentence Unjumble tool (v1.47): the teacher sets it up on the console.
  async ujSetup(req){ return rpc('ujSetup', [req], 0); },
  ujSetupEnd(){ if(U.connected && opener()) post(opener(), { type:'ujSetupEnd' }); },
  // Hungry Translations (v1.48): the same, for its set-up.
  async htSetup(req){ return rpc('htSetup', [req], 0); },
  htSetupEnd(){ if(U.connected && opener()) post(opener(), { type:'htSetupEnd' }); },
  // Splat (v1.50): the same, for its set-up.
  async spSetup(req){ return rpc('spSetup', [req], 0); },
  spSetupEnd(){ if(U.connected && opener()) post(opener(), { type:'spSetupEnd' }); },
  // Noughts & Crosses / Connect 4 (v1.51): the same, for their set-up.
  async bxSetup(req){ return rpc('bxSetup', [req], 0); },
  bxSetupEnd(){ if(U.connected && opener()) post(opener(), { type:'bxSetupEnd' }); },
};
function storeName(){ return link.name; }

// The console has gone: this window carries on by itself.
async function detach(){
  if(U.detached) return;
  U.detached = true; U.linked = false; U.connected = false;
  clearInterval(U.helloT); clearInterval(U.pollT);
  if(F.mo){ F.mo.disconnect(); }
  for(const r of U.rpcs.values()){ clearTimeout(r.t); r.rej(new Error('The teacher screen was closed.')); }
  U.rpcs.clear();
  let st = 'none';
  if(!C.TEST){ try{ st = await C.FsStore.restore(); }catch(e){ st = 'prompt'; } }
  U.fsOk = st==='ok' || C.TEST;
  if(!U.inited){
    // Never got going (opened on its own, or the console closed straight away): start as the normal app.
    clearInterval(U.idleT);
    document.title = 'Slideshow Viewer';
    try{ await C.Planner.restore(); }catch(e){}
    if(U.fsOk && !C.TEST) await C.loadAndGo();
    else if(C.TEST) C.renderDashboard();
    else C.renderSplash(st==='none' ? 'setup' : 'reconnect');
    return;
  }
  toast('Teacher screen closed. This screen carries on by itself.');
  if(!U.fsOk) reconnectBar();
  else if(U.pendingSave) C.saveNow();
  if(C.view.name==='idle') C.renderDashboard();
}
function reconnectBar(){
  if(U.fsOk || $('.dual-reconnect')) return;
  const b = el('button','dual-reconnect', `${icon('reset')}<span>Teacher screen closed. Tap here so changes keep saving to OneDrive.</span>`);
  b.onclick = async ()=>{
    try{ if(await link.reconnect()){ b.remove(); toast('Saving to ' + C.FsStore.name); await C.saveNow(); U.pendingSave = false; } }
    catch(e){ if(e.name!=='AbortError') toast("Couldn't reconnect: " + e.message, true); }
  };
  document.body.appendChild(b);
}

/* ---------------- shared ---------------- */
window.addEventListener('message', e=>{
  if(!e.data || e.data[TAG]!==1) return;
  if(C.PUPIL) pupilMsg(e); else consoleMsg(e);
});
window.addEventListener('pagehide', ()=>{ if(!C.PUPIL && alive()){ if(K.cons) flushMyNote(K.cons); post(K.win, { type:'bye' }); } });

window.SVDual = {
  // setting
  wanted, setWanted, settingsRow,
  // console
  present, banner, saved, closePupil,
  get open(){ return alive(); },
  // true while this window is the console of an open pupil window (tools.js sends Clock actions to the pupil window)
  consoleLinked(){ return !C.PUPIL && alive() && K.ready; },
  clock(op, args){ send('clock', { op, args }); },
  // pupil
  bootPupil, notify, idleInstead, link, storeName,
  get detached(){ return U.detached; },
  // v1.76 Refresh (app.js refreshApp), pupil window: hand the data to the console, which saves it and
  // reloads both windows. False when there's no console to ask (this window then saves and reloads itself).
  refresh(){
    if(!C.PUPIL || !U.linked || !U.connected || U.detached || !opener()) return false;
    postSave(C.data); U.pendingSave = false;
    post(opener(), { type:'refresh' });
    clearTimeout(U.refreshT);
    U.refreshT = setTimeout(()=>{ U.reloading = true; location.reload(); }, 8000); // the console didn't answer: reload this window anyway
    return true;
  },
  // pupil window with the teacher console connected (Mindreader's Teacher's Choice)
  get teacherLinked(){ return !!(C.PUPIL && U.linked && U.connected && !U.detached && opener()); },
  // true while a tap replayed from the console's replica is being handled
  get fromDesk(){ return !!U.desk; },
};
})();
