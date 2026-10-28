/* =====================================================================
   Slideshow Viewer — Sentence Unjumble tool (v1.47, 2026-10-16; v1.47.1 long sentences always fit)
   Tools → Sentence Unjumble (and the console's Tools menu). The live, no-prep
   version of the Activities slide (activities.js): a pop-up over the slide
   area in the Game of Chance style, one sentence at a time.

   Setting up (start screen):
     Choose sentences   pick a builder (Sentence Builder gallery), then the
                        activities picker: a colour per sentence, tap the items.
     Random sentences   the same picker filled at random. In tool mode the
                        picker has: Sentences 1–5, Group (Any / each group of
                        the split columns; a sentence never mixes groups),
                        column titles tap to leave a column out (shorter
                        sentences), Random sentences (all again) and a dice on
                        each sentence to re-roll just that one. Items can still
                        be tapped to change a sentence by hand.
     Last time in this lesson   Use again (new jumble) or Edit (picker, filled).
   Dual screen: the panel shows "Getting ready…" and the whole set-up runs on
   the teacher screen (rpc 'ujSetup', no time limit, like Mindreader's
   Teacher's Choice). Cancel on either screen ends it ('ujSetupEnd').
   Single screen: the set-up is on the board.

   Playing: one sentence, big. Drag a block (touch, stylus, mouse), or tap a
   block then tap where it goes. Check (right: green, capital and full stop
   back, locked; wrong: shakes red). Reveal / Put back. Shuffle (this
   sentence). Previous / Next and numbered dots (green solved, gold
   revealed). English on / off. When every sentence is solved or revealed:
   "All done" with Play again (new jumble) and New sentences. Clicker →
   reveals the sentence, then moves on; ← puts it back, then goes back.
   On the teacher screen the answer shows under the blocks (.ujt-priv, made
   visible in the replica by REP_CSS).

   Memory: the game is kept for the lesson (closing with × keeps it; Tools →
   Sentence Unjumble goes back to it). Saved: lesson.ujLast = { meta, rows, at }
   (the last set started in that lesson). Uses SVAct.picker / SVAct._ and
   SVSentence.choose / list. Loaded after activities.js.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, toast } = C;
const H = () => window.SVHost;
const A = () => window.SVAct;
const uid = () => Math.random().toString(36).slice(2, 10);

const IC = iconMap({
  tool: 'blocks', dice: 'dices', hand: 'hand', hist: 'history',
  x: 'x', left: 'chevron-left', right: 'chevron-right', check: 'check',
  eye: 'eye', undo: 'undo-2', shuffle: 'shuffle', reset: 'rotate-ccw',
  trophy: 'trophy', en: 'languages', new: 'plus',
});
const icon = (n, cls) => `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- state (memory, per lesson) ---------------- */
// G = { lid, view:'start'|'wait'|'play', size:'big'|'closed', set:{ rows, meta } | null, i, st:[{ order, flag:''|'s'|'r' }],
//       back:[order|null], en, fin, arm, tok }
let G = null;
const lesson = () => H() && H().lesson;
function game(){
  const l = lesson(); if(!l) return null;
  if(!G || G.lid !== l.id) G = { lid:l.id, view:'start', size:'closed', set:null, i:0, st:[], back:[], en:false, fin:false, arm:false, tok:null };
  return G;
}
const lessonYear = l => l && C.yearOf ? C.yearOf(l.label) : null;
const teacherLinked = () => !!(window.SVDual && SVDual.teacherLinked);
function lastOf(l){
  const u = l && l.ujLast;
  return u && Array.isArray(u.rows) && u.rows.length && u.meta ? u : null;
}
const keepRow = r => ({ tl:r.tl, en:r.en, lead:r.lead, cap:r.cap, end:r.end, src:r.src });
const ident = n => [...Array(n).keys()];

/* ---------------- big view ---------------- */
let big = null; // { back, card, armT, finT }
function open(){
  const l = lesson();
  if(!l){ toast('Open a lesson to use Sentence Unjumble.'); return; }
  if(!A() || !A().picker){ toast('The Activities files aren\'t loaded.'); return; }
  const g = game();
  if(g.set && g.view === 'play'){ showBig(); return; }
  newSet();
}
function newSet(){
  const g = game(); if(!g) return;
  g.arm = false; g.fin = false;
  if(teacherLinked()){ g.view = 'wait'; showBig(); askTeacher(g); return; }
  g.view = 'start'; showBig();
}
function showBig(){
  const g = game(); if(!g) return;
  if(window.SVPoints && SVPoints.close) SVPoints.close();
  g.size = 'big';
  if(!big){
    const back = el('div', 'ap-back gc-back ujt-back'), card = el('div', 'ap ujt');
    back.appendChild(card); document.body.appendChild(back);
    card.addEventListener('click', onClick);
    wireDrag(card);
    big = { back, card };
  }
  fit(); paint();
}
function closeBig(){
  if(!big) return;
  clearTimeout(big.armT); clearTimeout(big.finT);
  big.back.remove(); big = null;
}
// × : keep the game for the lesson (a set-up in progress is cancelled).
function hide(){
  const g = G;
  if(g && g.view === 'wait') cancelWait(g, true);
  if(g){ g.size = 'closed'; if(!g.set) g.view = 'start'; else g.view = 'play'; }
  closeBig();
}
function fit(){
  if(!big) return;
  const host = $('.present:not(.preview) .stage-host'), c = big.card.style;
  if(host){ const r = host.getBoundingClientRect(); Object.assign(c, { left:r.left + 'px', top:r.top + 'px', width:r.width + 'px', height:r.height + 'px' }); }
  else Object.assign(c, { left:'2vw', top:'4vh', width:'96vw', height:'92vh' });
}
window.addEventListener('resize', () => { if(big){ fit(); fitBlocks(); } });

function head(g){
  const playing = g.view === 'play' && g.set;
  return `<div class="ap-head gc-head">
    <div class="ap-title">${icon('tool', 'ico ujt-ic')}Sentence Unjumble</div>
    ${playing && g.set.meta && g.set.meta.sb ? `<span class="ap-chip ujt-chip">${esc(g.set.meta.sb.title || '')}</span>` : ''}
    ${playing && g.set.meta && g.set.meta.q && g.set.meta.q.tl ? `<span class="ujt-qh">${esc(g.set.meta.q.tl)}</span>` : ''}
    <div class="grow"></div>
    ${playing ? `<button class="clk-btn ujt-tog ${g.en ? 'on' : ''}" data-b="en" title="Show the English for each sentence">${icon('en')}English</button>
      <button class="clk-btn ${g.arm ? 'gc-arm' : ''}" data-b="new">${icon('new')}${g.arm ? 'Tap again for new sentences' : 'New sentences'}</button>` : ''}
    <button class="tb-ic" data-b="close" title="${playing ? 'Close (kept for this lesson)' : 'Close'}">${icon('x')}</button>
  </div>`;
}
function paint(){
  if(!big) return;
  const g = game(); if(!g) return;
  const card = big.card;
  card.className = 'ap ujt ujt-v-' + g.view;
  if(g.view === 'wait'){ card.innerHTML = head(g) + waitHTML(); return; }
  if(g.view === 'start' || !g.set){ card.innerHTML = head(g) + startHTML(lastOf(lesson()), false); return; }
  card.innerHTML = head(g) + playHTML(g);
  fitBlocks();
}

/* start screen (the board when single screen; the teacher screen's dialog when dual) */
function startHTML(last, consoleSide){
  const when = last && last.at ? new Date(last.at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
  return `<div class="ujt-start ${last ? 'three' : ''}">
    <button class="gc-opt ujt-opt" data-k="pick">
      <span class="gc-opt-t">${icon('hand')}Choose sentences</span>
      <span class="gc-opt-d">Pick a sentence builder, then tap the words for each sentence (1 to 5), as for the slide activity.</span>
    </button>
    <button class="gc-opt ujt-opt" data-k="rand">
      <span class="gc-opt-t">${icon('dice')}Random sentences</span>
      <span class="gc-opt-d">Pick a builder and the sentences are made for you. Choose how many, which columns and which group, and re-roll any you don't like.</span>
    </button>
    ${last ? `<div class="gc-opt ujt-opt ujt-last">
      <span class="gc-opt-t">${icon('hist')}Last time</span>
      <span class="gc-opt-d"><b>${esc((last.meta.sb && last.meta.sb.title) || 'Sentence builder')}</b><br>${last.rows.length} sentence${last.rows.length === 1 ? '' : 's'}${when ? ' · ' + esc(when) : ''}</span>
      <span class="ujt-lb"><button class="clk-btn gc-go" data-k="again">${icon('reset')}Use again</button><button class="clk-btn" data-k="edit">Edit</button></span>
    </div>` : ''}
  </div>
  <div class="ap-foot gc-foot"><div class="ap-sum">${consoleSide ? 'Pupils see “Getting ready…” until you start.' : 'Each sentence is jumbled into at least 5 blocks. No capital at the start or full stop at the end until it’s solved.'}</div>
  ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}</div>`;
}
function waitHTML(){
  const tiles = [3.2, 2.2, 4, 2.6, 3].map((w, i) => `<span class="ujt-wt" style="--w:${w}em;--d:${(i * 0.18).toFixed(2)}s"></span>`).join('');
  return `<div class="ujt-wait"><div class="ujt-wtiles">${tiles}</div>
    <div class="ujt-wsay">Getting ready<i>.</i><i>.</i><i>.</i></div>
    <div class="ujt-wsub">Your teacher is choosing the sentences.</div>
    <button class="clk-btn" data-b="waitcancel">Cancel</button></div>`;
}

/* playing */
function rowState(g, i){ return g.st[i]; }
function blockText(row, i, whole){ return A()._.blockText(row, i, whole); }
function playHTML(g){
  const rows = g.set.rows, n = rows.length, row = rows[g.i], st = rowState(g, g.i), whole = st.flag === 's' || st.flag === 'r';
  const q = g.set.meta && g.set.meta.q && g.set.meta.q.tl;
  const answer = ident(row.tl.length).map(k => blockText(row, k, true)).join(' ');
  const dots = n > 1 ? `<div class="ujt-dots">${rows.map((r, k) => { const s = g.st[k];
    return `<button class="ujt-dot ${k === g.i ? 'cur' : ''} ${s.flag === 's' ? 'ok' : s.flag === 'r' ? 'rev' : ''}" data-go="${k}" title="Sentence ${k + 1}">${s.flag === 's' ? icon('check') : k + 1}</button>`; }).join('')}</div>` : '';
  const done = st.flag === 's', rev = st.flag === 'r';
  const solvedN = g.st.filter(s => s.flag === 's').length, revN = g.st.filter(s => s.flag === 'r').length;
  return `${dots}<div class="ujt-main">
      ${q ? `<div class="ujt-q">${esc(q)}</div>` : ''}
      <div class="ujt-stage ${done ? 'ok' : rev ? 'rev' : ''}">
        ${g.en ? `<div class="ujt-en">${esc(row.en)}</div>` : ''}
        <div class="ujt-bl">${st.order.map(k => `<div class="ujt-b" data-i="${k}">${esc(blockText(row, k, whole))}</div>`).join('')}</div>
        <div class="ujt-priv">${esc(answer)}</div>
      </div>
      ${g.fin ? `<div class="ujt-fin" data-b="finx"><div class="ujt-fin-c">${icon('trophy', 'ico ujt-fin-i')}
        <div class="ujt-fin-t">All ${n === 1 ? 'done' : n + ' done'}!</div>
        <div class="ujt-fin-s">${solvedN} solved${revN ? ` · ${revN} revealed` : ''}</div>
        <div class="ujt-fin-b"><button class="clk-btn lg" data-b="again">${icon('reset')}Play again</button><button class="clk-btn lg gc-go" data-b="new2">${icon('new')}New sentences</button></div>
        <div class="ujt-fin-x">Tap anywhere else to look back at the sentences</div></div></div>` : ''}
    </div>
    <div class="ap-foot gc-foot ujt-foot">
      <button class="clk-btn lg" data-b="prev" ${g.i > 0 ? '' : 'disabled'}>${icon('left')}Previous</button>
      <div class="grow"></div>
      <button class="clk-btn lg" data-b="shuffle" ${done || rev ? 'disabled' : ''}>${icon('shuffle')}Shuffle</button>
      ${done ? '' : `<button class="clk-btn lg ujt-rv ${rev ? 'on' : ''}" data-b="reveal">${icon(rev ? 'undo' : 'eye')}${rev ? 'Put back' : 'Reveal'}</button>`}
      ${done ? `<span class="ujt-okmsg">${icon('check')}Correct!</span>` : `<button class="clk-btn lg gc-go" data-b="check" ${rev ? 'disabled' : ''}>${icon('check')}Check</button>`}
      <div class="grow"></div>
      <button class="clk-btn lg" data-b="next" ${g.i < n - 1 ? '' : 'disabled'}>Next${icon('right')}</button>
    </div>`;
}
// v1.47.1: the biggest text that fits the whole sentence (and the English, if on) inside the stage, on any
// number of lines. Order of give: the English shrinks with the blocks (70% of their size, 14–42px); the question
// moves up into the header when space is tight; one block wider than the stage may wrap inside its box (only if
// that gives text at least a quarter bigger than keeping every block on one line); below 14px the whole sentence
// is scaled down to fit, so nothing is ever cut off.
const FIT = { max:120, min:14, tight:44, enK:0.7, enMin:14, enMax:42, wrapGain:1.25 };
function fitBlocks(){
  if(!big) return;
  const card = big.card, st = $('.ujt-stage', card), bl = st && $('.ujt-bl', st); if(!bl || !bl.children.length) return;
  const en = $('.ujt-en', st);
  const run = () => {
    bl.style.transform = '';
    const cs = getComputedStyle(st);
    const W = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const Hh = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
    const gap = en ? parseFloat(cs.rowGap) || 18 : 0;
    const set = f => { bl.style.fontSize = f + 'px'; if(en) en.style.fontSize = Math.max(FIT.enMin, Math.min(FIT.enMax, f * FIT.enK)) + 'px'; };
    const fits = f => {
      set(f);
      if([...bl.children].some(b => b.offsetWidth > W + 1 || b.scrollWidth > b.clientWidth + 1)) return false; // max-width hides overflow from offsetWidth
      return (en ? en.offsetHeight + gap : 0) + bl.offsetHeight <= Hh;
    };
    const best = () => {
      let lo = FIT.min, hi = Math.max(FIT.min, Math.min(FIT.max, Hh * 0.45));
      if(fits(hi)) return hi;
      if(!fits(lo)) return 0;
      for(let k = 0; k < 16; k++){ const m = (lo + hi) / 2; if(fits(m)) lo = m; else hi = m; }
      return Math.floor(lo);
    };
    bl.classList.add('nw'); const f1 = best();
    bl.classList.remove('nw'); const f2 = best();
    // Wrapping inside a block only when it really helps (or nothing fits otherwise).
    const wrap = f2 && (!f1 || f2 >= f1 * FIT.wrapGain);
    bl.classList.toggle('nw', !wrap);
    const f = wrap ? f2 : f1;
    if(f){ set(f); return f; }
    // Still too big at the smallest size: scale the whole sentence down to fit.
    set(FIT.min);
    const k = Math.min(1, W / Math.max(1, bl.scrollWidth), (Hh - (en ? en.offsetHeight + gap : 0)) / Math.max(1, bl.offsetHeight));
    bl.style.transform = `scale(${Math.max(0.15, k).toFixed(3)})`;
    return FIT.min * k;
  };
  card.classList.remove('tight');
  const f = run();
  // Tight: the question goes up into the header to give the sentence more room.
  if(f < FIT.tight && $('.ujt-q', card)){ card.classList.add('tight'); run(); }
}

function startSet(r){
  const g = game(); if(!g || !r || !r.rows || !r.rows.length) return;
  const J = A()._.jumble;
  const rows = r.rows.map(x => Object.assign(keepRow(x), { jum:J(x.tl) }));
  Object.assign(g, { set:{ rows, meta:r.meta || {} }, i:0, st:rows.map(x => ({ order:x.jum.slice(), flag:'' })), back:rows.map(() => null), view:'play', fin:false, arm:false });
  const l = lesson();
  if(l){ l.ujLast = { meta:r.meta || {}, rows:rows.map(keepRow), at:Date.now() }; H().save(); }
  showBig();
}
function playAgain(){
  const g = game(); if(!g || !g.set) return;
  const J = A()._.jumble;
  g.set.rows.forEach(x => { x.jum = J(x.tl); });
  Object.assign(g, { i:0, st:g.set.rows.map(x => ({ order:x.jum.slice(), flag:'' })), back:g.set.rows.map(() => null), fin:false });
  paint();
}
function check(){
  const g = game(), row = g.set.rows[g.i], st = rowState(g, g.i);
  if(st.flag) return;
  if(A()._.solved(row, st.order)){
    st.order = ident(row.tl.length); st.flag = 's';
    paint(); maybeFinish();
    return;
  }
  const s = big && $('.ujt-stage', big.card); if(!s) return;
  s.classList.remove('no'); void s.offsetWidth; s.classList.add('no');
  setTimeout(() => s.classList.remove('no'), 950);
}
function reveal(on){
  const g = game(), row = g.set.rows[g.i], st = rowState(g, g.i);
  if(on == null) on = st.flag !== 'r';
  if(on && !st.flag){ g.back[g.i] = st.order.slice(); st.order = ident(row.tl.length); st.flag = 'r'; paint(); maybeFinish(); return true; }
  if(!on && st.flag === 'r'){ st.order = g.back[g.i] || row.jum.slice(); g.back[g.i] = null; st.flag = ''; g.fin = false; paint(); return true; }
  return false;
}
function shuffleCur(){
  const g = game(), row = g.set.rows[g.i], st = rowState(g, g.i);
  if(st.flag) return;
  st.order = A()._.jumble(row.tl); paint();
}
function go(k){ const g = game(); if(!g.set || k < 0 || k >= g.set.rows.length) return; g.i = k; g.fin = false; paint(); }
// Every sentence solved or revealed: the "All done" card, after a moment.
function maybeFinish(){
  const g = game();
  if(!g.st.every(s => s.flag)) return;
  if(big){ clearTimeout(big.finT); big.finT = setTimeout(() => { const h = game(); if(h && h.set && h.st.every(s => s.flag) && !h.fin){ h.fin = true; paint(); } }, 1100); }
}

function onClick(e){
  const g = game(); if(!g || !big) return;
  const t = e.target.closest('button, [data-b="finx"]'); if(!t || t.disabled) return;
  const a = t.dataset.b, k = t.dataset.k;
  if(a !== 'new' && g.arm){ g.arm = false; clearTimeout(big.armT); }
  if(k){ startChoice(k); return; }
  if(t.dataset.go != null){ go(+t.dataset.go); return; }
  switch(a){
    case 'close': hide(); return;
    case 'waitcancel': cancelWait(g, true); return;
    case 'en': g.en = !g.en; paint(); return;
    case 'new':
      clearTimeout(big.armT);
      if(g.arm){ g.arm = false; newSet(); }
      else { g.arm = true; paint(); big.armT = setTimeout(() => { const h = game(); if(h && h.arm){ h.arm = false; paint(); } }, 3000); }
      return;
    case 'new2': newSet(); return;
    case 'again': playAgain(); return;
    case 'finx': g.fin = false; paint(); return;
    case 'prev': go(g.i - 1); return;
    case 'next': go(g.i + 1); return;
    case 'check': check(); return;
    case 'reveal': reveal(); return;
    case 'shuffle': shuffleCur(); return;
  }
}

/* dragging / tap-to-place (same rules as the slide version) */
function wireDrag(card){
  let d = null; // { b, bl, pid, x, y, gx, gy, live }
  const SEL = '.ujt-b';
  const local = (bl, cx, cy) => { const r = bl.getBoundingClientRect(), s = r.width / (bl.offsetWidth || 1); return { x:(cx - r.left) / s, y:(cy - r.top) / s }; };
  const clearSel = () => { $$('.ujt-b.sel', card).forEach(x => x.classList.remove('sel')); card._sel = null; };
  const order = bl => [...bl.querySelectorAll(SEL)].map(b => +b.dataset.i);
  const store = bl => { const g = game(); if(!g || !g.set) return; const st = rowState(g, g.i); if(st.flag) return; st.order = order(bl); };
  card.addEventListener('pointerdown', e => {
    if(e.button > 0) return;
    const b = e.target.closest(SEL); if(!b) return;
    const stg = b.closest('.ujt-stage'); if(!stg || stg.classList.contains('ok') || stg.classList.contains('rev')) return;
    const bl = b.parentNode, p = local(bl, e.clientX, e.clientY);
    d = { b, bl, pid:e.pointerId, x:e.clientX, y:e.clientY, gx:p.x - b.offsetLeft, gy:p.y - b.offsetTop, live:false };
    try{ b.setPointerCapture(e.pointerId); }catch(_){}
  });
  card.addEventListener('pointermove', e => {
    if(!d || e.pointerId !== d.pid) return;
    if(!d.live){ if(Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return; d.live = true; clearSel(); d.b.classList.add('ujt-drag'); }
    e.preventDefault();
    const p = local(d.bl, e.clientX, e.clientY), b = d.b, X = A()._;
    const idx = X.dropIndex(d.bl, b, p.x, p.y, SEL);
    if(idx >= 0) X.moveBlock(d.bl, b, idx, SEL);
    b.style.transform = `translate(${p.x - d.gx - b.offsetLeft}px,${p.y - d.gy - b.offsetTop}px)`;
  });
  const up = e => {
    if(!d || e.pointerId !== d.pid) return;
    const t = d; d = null;
    if(t.live){
      t.b.classList.remove('ujt-drag'); t.b.classList.add('ujt-drop'); t.b.style.transform = '';
      setTimeout(() => t.b.classList.remove('ujt-drop'), 220);
      store(t.bl); return;
    }
    if(e.type !== 'pointerup') return;
    const s = card._sel;
    if(s && s === t.b){ clearSel(); return; }
    if(s && s.parentNode === t.bl){ A()._.moveBlock(t.bl, s, [...t.bl.querySelectorAll(SEL)].indexOf(t.b), SEL); clearSel(); store(t.bl); return; }
    clearSel(); t.b.classList.add('sel'); card._sel = t.b;
  };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}

/* ---------------- set-up: the choices ---------------- */
// kind: 'pick' | 'rand' | 'again' | 'edit'. done(result | null): null = back to the start screen.
function runChoice(kind, year, last, done){
  const P = A().picker;
  const picker = (x, rows, random) => {
    P.open({ tool:true, random, year, label:'Start', onCancel:() => done(null), onDone:(rows2, meta) => done({ rows:rows2, meta }) });
    P.setBuilder(x, rows);
  };
  const choose = random => {
    if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); done(null); return; }
    SVSentence.choose({ year, onPick:x => picker(x, null, random), onCancel:() => done(null) });
  };
  if(kind === 'again' && last){ done({ rows:last.rows, meta:last.meta }); return; }
  if(kind === 'edit' && last){
    findBuilder(last.meta).then(x => {
      if(x) picker(x, last.rows, false);
      else { toast(`“${(last.meta.sb && last.meta.sb.title) || 'The builder'}” isn't in the Sentence Builders folder any more: choose one`, true); choose(false); }
    }).catch(e => { toast("Couldn't read the Sentence Builders folder: " + e.message, true); done(null); });
    return;
  }
  choose(kind === 'rand');
}
async function findBuilder(meta){
  const list = await SVSentence.list(), sb = (meta && meta.sb) || {};
  return list.find(x => x.loc.year === sb.year && x.loc.term === sb.term && x.loc.name === sb.name)
    || list.find(x => window.SBCore.displayTitle(x.doc) === sb.title && x.doc.lang === meta.lang) || null;
}
// Single screen: the start screen is in the pop-up.
function startChoice(k){
  const g = game(); if(!g) return;
  const l = lesson(), last = lastOf(l);
  runChoice(k, lessonYear(l), last, r => { if(r) startSet(r); });
}

/* ---------------- dual screen ---------------- */
// Pupil window: wait while the teacher screen sets it up.
async function askTeacher(g){
  const tok = g.tok = uid(), l = lesson();
  let r;
  try{ r = await SVDual.link.ujSetup({ year:lessonYear(l), last:lastOf(l) }); }
  catch(e){ if(G === g && g.tok === tok){ g.tok = null; toast((e && e.message) || 'The teacher screen did not answer.'); afterWait(g); } return; }
  if(G !== g || g.tok !== tok) return;
  g.tok = null;
  if(r && r.rows && r.rows.length) startSet(r); else afterWait(g);
}
function afterWait(g){ if(g.set){ g.view = 'play'; paint(); } else { g.view = 'start'; g.size = 'closed'; closeBig(); } }
function cancelWait(g, tell){
  if(!g || g.view !== 'wait') return;
  g.tok = null;
  if(tell && window.SVDual && SVDual.link && SVDual.link.ujSetupEnd) SVDual.link.ujSetupEnd();
  afterWait(g);
}
// Teacher console: rpc 'ujSetup' { year, last } → { rows, meta } or null.
let CS = null; // { back, card, res, req }
function setupOnConsole(req){
  cancelSetup();
  return new Promise(res => {
    const back = el('div', 'ap-back ujt-cback'), card = el('div', 'ap ujt ujt-c');
    back.appendChild(card); document.body.appendChild(back);
    CS = { back, card, res, req: req || {} };
    card.innerHTML = `<div class="ap-head gc-head"><div class="ap-title">${icon('tool', 'ico ujt-ic')}Sentence Unjumble</div><span class="ap-chip">Set up on this screen</span><div class="grow"></div>
      <button class="tb-ic" data-k="cancel" title="Cancel">${icon('x')}</button></div>` + startHTML(lastOf({ ujLast:CS.req.last }), true);
    card.addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if(!b || !CS) return;
      const k = b.dataset.k;
      if(k === 'cancel') return finishSetup(null);
      CS.back.style.display = 'none';
      runChoice(k, CS.req.year, lastOf({ ujLast:CS.req.last }), r => { if(!CS) return; if(r) finishSetup(r); else CS.back.style.display = ''; });
    });
  });
}
function finishSetup(v){
  if(!CS) return;
  const s = CS; CS = null;
  s.back.remove();
  if(A() && A().picker && A().picker.open_) A().picker.close();
  s.res(v ? { rows:v.rows.map(keepRow), meta:v.meta } : null);
}
function cancelSetup(){
  if(!CS) return;
  if(window.SVSentence && SVSentence.open_ && !SVSentence.state) SVSentence.close();
  finishSetup(null);
}

/* ---------------- keys ---------------- */
const FWD = ['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'], BACK = ['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'];
const overlayOpen = () => (A() && A().picker && A().picker.open_) || !!document.querySelector('.sbp-back');
window.addEventListener('keydown', e => {
  if(CS && !overlayOpen()){
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); finishSetup(null); }
    return;
  }
  if(!big || overlayOpen()) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key === 'F11') return;
  if(e.target && e.target.closest && e.target.closest('.modal, input, textarea')) return;
  e.stopPropagation(); // the keyboard / clicker don't change slides underneath
  const g = game(); if(!g) return;
  const k = e.key;
  if([...FWD, ...BACK, 'Home', 'End'].includes(k)) e.preventDefault();
  if(k === 'Escape'){ e.preventDefault(); if(g.fin){ g.fin = false; paint(); } else hide(); return; }
  if(g.view !== 'play' || !g.set) return;
  if(FWD.includes(k)){
    if(g.fin) return;
    if(!rowState(g, g.i).flag){ reveal(true); return; }
    if(g.i < g.set.rows.length - 1) go(g.i + 1);
    else if(g.st.every(s => s.flag)){ g.fin = true; paint(); }
  } else if(BACK.includes(k)){
    if(g.fin){ g.fin = false; paint(); return; }
    if(rowState(g, g.i).flag === 'r'){ reveal(false); return; }
    if(g.i > 0) go(g.i - 1);
  }
}, true);

/* ---------------- lesson changes ---------------- */
function clearAll(){ if(G && G.view === 'wait') cancelWait(G, true); closeBig(); G = null; }
window.addEventListener('sv:present', e => {
  if(!(e.detail && e.detail.resume)){ clearAll(); return; }
  const g = game(); if(g && g.size === 'big' && g.set){ g.view = 'play'; showBig(); }
});
window.addEventListener('sv:leave', e => {
  if(!(e.detail && e.detail.keep)){ clearAll(); return; }
  if(G && G.view === 'wait'){ cancelWait(G, true); }
  if(big){ clearTimeout(big.finT); big.back.remove(); big = null; }
});

/* ---------------- styles ---------------- */
const CSS = `
.ujt-back{z-index:31}
.ap.ujt{position:absolute;border-radius:var(--stage-r);padding:14px 18px 14px}
.ap .ico.ujt-ic{color:#F5B700;width:28px;height:28px}
.ujt-chip{max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ujt-qh{display:none;min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dark-text-2);font:600 18px/1.2 var(--font)}
.ujt.tight .ujt-qh{display:block}
.ujt .ap-title{white-space:nowrap;flex:none}
.ujt.tight .ujt-q{display:none}
.ujt.tight .ujt-chip{max-width:26%}
.ujt .clk-btn.ujt-tog.on{background:color-mix(in srgb,var(--accent) 35%,var(--dark-2));box-shadow:inset 0 0 0 2px var(--accent)}
/* start */
.ujt-start{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch}
.ujt-start.three{grid-template-columns:1fr 1fr 1fr}
.ujt-opt{justify-content:center}
.ujt-opt:not(.ujt-last):active{border-color:var(--accent)}
.ujt-last{cursor:default;justify-content:center}
.ujt-last .gc-opt-d b{color:var(--dark-text)}
.ujt-last .clk-btn:not(.gc-go){background:var(--dark-3)}
.ujt-lb{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
/* teacher screen dialog */
.ujt-cback{z-index:100}
.ap.ujt.ujt-c{position:relative;border-radius:24px;width:min(1180px,94vw);height:min(560px,88vh)}
/* waiting (pupil screen) */
.ujt-wait{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center}
.ujt-wtiles{display:flex;gap:.5em;font-size:clamp(28px,5vh,56px)}
.ujt-wt{display:block;width:var(--w);height:1.4em;border-radius:.3em;background:#fff;box-shadow:0 .08em 0 #9EA3B5;animation:ujt-hop 1.6s var(--d) infinite ease-in-out}
@keyframes ujt-hop{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-.5em) rotate(-4deg)}60%{transform:translateY(0) rotate(3deg)}}
.ujt-wsay{font:700 clamp(30px,5vh,52px)/1.1 var(--font)}
.ujt-wsay i{font-style:normal;animation:ujt-dot 1.4s infinite}
.ujt-wsay i:nth-child(2){animation-delay:.2s}.ujt-wsay i:nth-child(3){animation-delay:.4s}
@keyframes ujt-dot{0%,60%,100%{opacity:.2}30%{opacity:1}}
.ujt-wsub{font-size:22px;color:var(--dark-text-2)}
/* playing */
.ujt-dots{display:flex;justify-content:center;gap:10px;margin:0 0 10px;flex:none}
.ujt-dot{width:48px;height:48px;border-radius:50%;border:3px solid transparent;background:var(--dark-2);color:var(--dark-text);font:700 20px/1 var(--font);display:grid;place-items:center;cursor:pointer;padding:0;touch-action:manipulation}
.ujt-dot .ico{width:24px;height:24px;stroke-width:3}
.ujt-dot.cur{border-color:#F5B700}
.ujt-dot.ok{background:var(--ok);color:#fff}
.ujt-dot.rev{background:#B98A00;color:#fff}
.ujt-main{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.ujt-q{flex:none;text-align:center;color:var(--dark-text-2);font:600 clamp(18px,2.6vh,26px)/1.2 var(--font);margin-bottom:10px}
.ujt-stage{flex:1;min-height:0;position:relative;border-radius:22px;background:var(--dark-2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px 32px;transition:background .3s,box-shadow .3s;overflow:hidden}
.ujt-stage.ok{background:color-mix(in srgb,var(--ok) 20%,var(--dark-2));box-shadow:inset 0 0 0 3px var(--ok)}
.ujt-stage.rev{background:color-mix(in srgb,#F5B700 14%,var(--dark-2));box-shadow:inset 0 0 0 3px #B98A00}
.ujt-stage.no{animation:ujt-shake .5s;box-shadow:inset 0 0 0 3px #FF6B6B}
@keyframes ujt-shake{0%,100%{transform:none}20%,60%{transform:translateX(-12px)}40%,80%{transform:translateX(12px)}}
.ujt-en{text-align:center;color:#C9D4FF;font:500 28px/1.25 var(--font);max-width:100%;flex:none}
.ujt-bl{position:relative;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:.35em .4em;max-width:100%;line-height:1.1;font-family:var(--font);font-size:48px;flex:none;transform-origin:50% 50%}
.ujt-b{position:relative;background:#fff;color:#111114;font-weight:700;padding:.2em .55em;border-radius:.28em;box-shadow:0 .08em 0 #9EA3B5,0 .2em .5em rgba(0,0,0,.25);white-space:normal;max-width:100%;box-sizing:border-box;text-align:center;touch-action:none;cursor:grab;transition:transform .18s ease;-webkit-user-select:none;user-select:none}
.ujt-b.sel{background:#FFE94D;box-shadow:0 0 0 .1em #F5B700,0 .08em 0 #9EA3B5}
.ujt-b.ujt-drag{transition:none;z-index:5;cursor:grabbing;background:#FFF6C2;box-shadow:0 .3em .8em rgba(0,0,0,.45)}
.ujt-b.ujt-drop{transition:transform .2s ease}
.ujt-stage.ok .ujt-b{background:#EFFFF0;color:#14532D;box-shadow:0 .08em 0 #2F8A1F;cursor:default}
.ujt-stage.rev .ujt-b{background:#FFF4D2;box-shadow:0 .08em 0 #B98A00;cursor:default}
.ujt-bl.nw .ujt-b{white-space:nowrap}
.ujt-stage.ok .ujt-b{animation:ujt-pop .55s cubic-bezier(.3,1.6,.5,1)}
@keyframes ujt-pop{0%{transform:scale(.94)}100%{transform:none}}
.ujt-priv{display:none;position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:92%;padding:6px 16px;border-radius:12px;background:#F5B700;color:#111114;font:700 22px/1.25 var(--font);text-align:center}
.ujt-stage.ok .ujt-priv,.ujt-stage.rev .ujt-priv{display:none !important}
.ujt-foot{flex-wrap:nowrap}
.ujt-foot .grow{flex:1}
.ujt .clk-btn.gc-go{background:var(--ok);color:#fff}
.ujt .clk-btn.gc-go:not(:disabled):active{background:#178049}
.ujt .clk-btn.gc-arm{background:var(--danger);color:#fff}
.ujt .clk-btn:disabled{opacity:.4;cursor:default}
.ujt .clk-btn.ujt-rv{background:#5B5B66;color:#fff}
.ujt .clk-btn.ujt-rv.on{background:#B98A00}
.ujt-okmsg{display:inline-flex;align-items:center;gap:8px;height:64px;padding:0 22px;color:#5FD38D;font:700 22px var(--font)}
.ujt-okmsg .ico{width:26px;height:26px;stroke-width:3}
.ujt-fin{position:absolute;inset:0;z-index:6;display:grid;place-items:center;background:rgba(10,10,14,.72);border-radius:22px;cursor:pointer;animation:ujt-in .3s ease}
@keyframes ujt-in{from{opacity:0}to{opacity:1}}
.ujt-fin-c{display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 40px;border-radius:24px;background:var(--dark-2);box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:default}
.ujt .ico.ujt-fin-i{width:84px;height:84px;color:#F5B700;stroke-width:1.6}
.ujt-fin-t{font:800 clamp(40px,7vh,72px)/1 var(--font)}
.ujt-fin-s{font-size:22px;color:var(--dark-text-2)}
.ujt-fin-b{display:flex;gap:12px;margin-top:8px}
.ujt-fin-x{font-size:15px;color:var(--dark-text-2)}
@media (prefers-reduced-motion: reduce){.ujt *{animation:none !important;transition:none !important}}
`;
// Teacher screen replica only (dual.js): the answer under the blocks.
const REP_CSS = `.ujt-priv{display:block !important}.ujt-stage.ok .ujt-priv,.ujt-stage.rev .ujt-priv{display:none !important}`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'ujt-css', textContent:CSS }));

window.SVUnjumble = { open, close:hide, CSS, REP_CSS, setupOnConsole, cancelSetup, get open_(){ return !!big; } };
})();
