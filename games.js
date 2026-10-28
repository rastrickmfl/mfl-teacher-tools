/* =====================================================================
   Slideshow Viewer — Board games engine (v1.51, 2026-10-16)
   Shared by Noughts & Crosses (noughts.js) and Connect 4 (connect4.js).
   Each game registers a board ("adapter") with SVBoardGames.register();
   this file does everything else, in the Game of Chance style:

   Set-up (start screen; on the teacher screen when dual screen is linked)
     Players   Team A v Team B (sides of the room) · 1 v 1 (two names from
               the lesson's class list; absent pupils greyed out). 1 v 1 has
               Winner stays on: after a match the loser is swapped for a new
               random name.
     Game      the board's own options (N&C: Best of 1/3/5; C4: board size).
     Questions Quick game (asked out loud) · Sentence builder (single chunks,
               pupils see English / French / Mixed; answer hidden until
               Reveal) · Question set (Settings → Question sets, shared with
               Game of Chance).
   Turns
     The side whose turn it is answers. Correct → they place a piece.
     Wrong → passed once to the other side; right → they place instead.
     The turn then goes to the side that didn't place (no one placed → the
     other side). Undo takes back the last placement.
     N&C with questions puts a question in every square: the side picks a
     square, answers its question, and claims it if right. A square nobody
     answered gets a fresh question.
   Quick game can Shrink to a small floating box and to a score in the
   island, so the slide stays in view. Question games fill the slide area.
   Unrevealed answers are .gc-priv (shown on the teacher screen only).
   End: the winner (draws don't count: play again). 1 v 1: one-tap Game
   Winner Achievement Point, Next challenger (winner stays on).

   Memory: kept for the lesson (× keeps it). Saved in viewer-data.json:
     lesson.bxLast = { ox:{…}, c4:{…} }  last set-up per game (and builder)
   Dual screen: rpc 'bxSetup' { game, … } → result, 'bxSetupEnd' cancels.
   Loaded after splat.js. Uses SVSentence, SVClasses, SVPoints, SVIsland.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, toast } = C;
const H = () => window.SVHost;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const other = s => s === 'a' ? 'b' : 'a';
const COL = { a:'#5AA9FF', b:'#FF9F43' }; // as Game of Chance

const IC = iconMap({
  x: 'x', up: 'chevron-up', left: 'chevron-left', right: 'chevron-right',
  back: 'chevron-left', fwd: 'arrow-right', shrink: 'minimize-2', expand: 'maximize-2',
  reset: 'rotate-ccw', undo: 'undo-2', grip: 'grip-vertical', check: 'check',
  eye: 'eye', pass: 'skip-forward', next: 'arrow-right', q: 'circle-help',
  trophy: 'trophy', list: 'list', mic: 'mic', sb: 'blocks',
  hist: 'history', user: 'user', users: 'users', star: 'star',
  swap: 'arrow-left-right', crown: 'crown',
});
const icon = (n, cls) => `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || n}</svg>`;

/* ---------------- adapters ---------------- */
const AD = {};
function register(a){
  AD[a.id] = a;
  if(a.CSS) document.head.appendChild(Object.assign(document.createElement('style'), { id:'bx-css-' + a.id, textContent:a.CSS }));
}

/* ---------------- question sources ---------------- */
const LANGS = () => (window.SBCore && SBCore.LANGS) || { fr:{ name:'French' }, es:{ name:'Spanish' } };
const lname = l => (LANGS()[l] || { name:'French' }).name;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/[\s,.;:]+$/, '');
const norm = s => clean(s).toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, '').replace(/\s+/g, ' ').trim();
// Every usable chunk of a builder: { tl, en }, the same words only once (as Splat).
function poolOf(doc){
  const out = [], seen = new Set();
  (doc && doc.cols || []).forEach(col => (col.groups || []).forEach(grp => (grp || []).forEach(it => {
    const tl = clean(it.tl), en = clean(it.en);
    if(!tl || !en) return;
    const k = norm(tl); if(!k || seen.has(k)) return;
    seen.add(k); out.push({ tl, en });
  })));
  return out;
}
function D(){
  const h = H(); const d = h && h.data; if(!d) return null;
  if(!Array.isArray(d.gcSets)) d.gcSets = [];
  return d;
}
const sets = () => ((D() && D().gcSets) || []).filter(s => s && Array.isArray(s.qs) && s.qs.length);
const setById = id => sets().find(s => s.id === id) || null;

/* ---------------- class list ---------------- */
function pupilsOf(l){
  const SC = window.SVClasses; if(!SC || !l) return [];
  const cls = SC.classFor(l); if(!cls) return [];
  const names = SC.nameMap(cls), ab = SC.absentSet(l.id);
  return SC.active(cls).map(p => ({ id:p.id, name:names.get(p.id) || p.first, abs:ab.has(p.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity:'base' }));
}
const winnerCat = () => { const P = window.SVPoints; const cs = P && P.cats ? P.cats() : []; return cs.find(c => /game\s*winner/i.test(c.name)) || null; };

/* ---------------- state (memory, per lesson, per game) ----------------
   g  = { id, lid, view:'start'|'wait'|'play'|'resume', S, gm, res, hist, size, arm, tok, retFloat, flash, busy }
   gm = (JSON-able, so Undo can snapshot it)
        { src:'quick'|'sb'|'set', dir:'en'|'tl'|'mix', title, lang, setName,
          team, players:{ a:{ name, pid }, b:{…} }, stays, opt, need,
          wins:{a,b}, correct:{a,b}, gameNo, start, turn, ans, passed, placer,
          ph:'turn'|'ask'|'place'|'end'|'over', view:'board'|'question',
          x (current question), shown, sq (square, N&C), qo:{ order, i, laps },
          board (the adapter's), result:{ winner, draw }, awarded, played:[pid], streak }
   res = { pool (sb chunks) | qs (set questions) } — not in gm (too big to snapshot). */
const GS = {};
const lesson = () => H() && H().lesson;
const lessonYear = l => l && C.yearOf ? C.yearOf(l.label) : null;
const teacherLinked = () => !!(window.SVDual && SVDual.teacherLinked);
function lastOf(l, id){ const u = l && l.bxLast && l.bxLast[id]; return u && typeof u === 'object' ? u : null; }
function game(id){
  const l = lesson(); if(!l || !AD[id]) return null;
  let g = GS[id];
  if(!g || g.lid !== l.id) g = GS[id] = { id, lid:l.id, view:'start', S:null, gm:null, res:null, hist:[], size:'closed', arm:false, tok:null, retFloat:false, flash:null, busy:false };
  return g;
}
let CUR = null; // id of the game in the big view
const cur = () => CUR ? game(CUR) : null;

function newSetup(id, l){
  const a = AD[id], last = lastOf(l, id);
  const def = l && l.gcSet && setById(l.gcSet);
  let src = last && ['quick', 'sb', 'set'].includes(last.src) ? last.src : (def ? 'set' : 'quick');
  let setId = last && last.setId && setById(last.setId) ? last.setId : (def ? def.id : null);
  if(src === 'set' && !setId){ const s = sets()[0]; if(s) setId = s.id; else src = 'quick'; }
  return { step:'start', game:id, team:last ? last.team !== false : true, stays:!!(last && last.stays), src, setId,
    dir:last && ['en', 'tl', 'mix'].includes(last.dir) ? last.dir : 'en', pick:null,
    last:last && last.loc ? last : null, opt:a.optDefaults(last && last.opt), sel:[], pupils:pupilsOf(l), year:lessonYear(l) };
}

/* ---------------- big view ---------------- */
let big = null; // { back, card, armT, flashT, busyT }
function open(id){
  const l = lesson();
  if(!l){ toast(`Open a lesson to use ${AD[id] ? AD[id].name : 'this game'}.`); return; }
  if(CUR && CUR !== id){ const o = cur(); closeBig(); hideFloat(); if(o && o.gm){ o.size = 'min'; } paintIsland(CUR); }
  const g = game(id); if(!g) return;
  CUR = id;
  if(g.gm){ g.view = 'resume'; showBig(); return; }
  newGame(id);
}
function newGame(id){
  const g = game(id); if(!g) return;
  CUR = id;
  g.arm = false; g.gm = null; g.res = null; g.hist = [];
  const l = lesson();
  g.S = newSetup(id, l);
  paintIsland(id);
  if(teacherLinked()){ g.view = 'wait'; showBig(); askTeacher(g); return; }
  g.view = 'start'; showBig();
}
function showBig(){
  const g = cur(); if(!g) return;
  if(window.SVPoints && SVPoints.close) SVPoints.close();
  hideFloat();
  g.size = 'big';
  if(!big){
    const back = el('div', 'ap-back gc-back bx-back'), card = el('div', 'ap gc bx');
    back.appendChild(card); document.body.appendChild(back);
    card.addEventListener('click', onClick);
    big = { back, card };
  }
  fit(); paint(); paintIsland(g.id);
}
function closeBig(){
  if(!big) return;
  clearTimeout(big.armT);
  big.back.remove(); big = null;
}
function fit(){
  if(!big) return;
  const host = $('.present:not(.preview) .stage-host'), c = big.card.style;
  if(host){ const r = host.getBoundingClientRect(); Object.assign(c, { left:r.left + 'px', top:r.top + 'px', width:r.width + 'px', height:r.height + 'px' }); }
  else Object.assign(c, { left:'2vw', top:'4vh', width:'96vw', height:'92vh' });
}
window.addEventListener('resize', () => { fit(); placeFloat(); });
// × : keep the game for the lesson (a set-up in progress is dropped).
function hide(){
  const g = cur();
  if(g && g.view === 'wait') cancelWait(g, true);
  if(g){ finishBusy(g); g.view = g.gm ? 'play' : 'start'; g.size = g.gm ? 'min' : 'closed'; g.retFloat = false; }
  closeBig(); hideFloat();
  if(g) paintIsland(g.id);
}
function toFloat(){ const g = cur(); if(!g || !g.gm || g.gm.src !== 'quick') return; closeBig(); g.size = 'float'; showFloat(); paintIsland(g.id); }

/* ---------------- words ---------------- */
const sideName = (gm, s) => gm.team ? (s === 'a' ? 'Team A' : 'Team B') : (gm.players[s] ? gm.players[s].name : (s === 'a' ? 'Player 1' : 'Player 2'));
const sideLabel = (gm, s) => gm.team
  ? (s === 'a' ? `${icon('left', 'ico gc-arr')}Team A` : `Team B${icon('right', 'ico gc-arr')}`)
  : esc(sideName(gm, s));
const sideB = (gm, s) => `<b class="gc-c${s}">${esc(sideName(gm, s))}</b>`;
function qFit(t){ const n = String(t || '').length; return n <= 30 ? 'xl' : n <= 70 ? 'l' : n <= 140 ? 'm' : 's'; }
// A question's words now (sb chunks follow the "pupils see" toggle).
function qText(g, x){
  if(!x) return null;
  if(x.k === 'sb'){
    const it = g.res && g.res.pool && g.res.pool[x.it]; if(!it) return null;
    const d = g.gm.dir === 'mix' ? x.d : g.gm.dir;
    const L = lname(g.gm.lang);
    return d === 'en' ? { q:it.en, a:it.tl, label:`Translate into ${L}` } : { q:it.tl, a:it.en, label:'Translate into English' };
  }
  return { q:x.q, a:x.a || '', label:'' };
}
// The next question from the pool (shuffled; starts again when it runs out).
function drawQ(g){
  const gm = g.gm, n = gm.src === 'sb' ? (g.res.pool || []).length : (g.res.qs || []).length;
  if(!n) return null;
  const qo = gm.qo;
  if(!qo.order || qo.order.length !== n){ qo.order = shuffle([...Array(n).keys()]); qo.i = -1; }
  qo.i++;
  if(qo.i >= qo.order.length){
    const last = qo.order[qo.order.length - 1];
    qo.order = shuffle([...Array(n).keys()]);
    if(n > 1 && qo.order[0] === last) [qo.order[0], qo.order[1]] = [qo.order[1], qo.order[0]];
    qo.i = 0; qo.laps++;
  }
  const j = qo.order[qo.i];
  if(gm.src === 'sb') return { k:'sb', it:j, d:rand() < 0.5 ? 'en' : 'tl' };
  const s = g.res.qs[j]; return { k:'set', q:s.q, a:s.a || '' };
}

/* ---------------- the api a board gets ---------------- */
function api(g){
  return {
    g, gm:g.gm, COL, icon, esc, sideName:s => sideName(g.gm, s), qText:x => qText(g, x), drawQ:() => drawQ(g),
    // A placement is over: res = { winner:'a'|'b', cells } | { draw:true } | null (game carries on).
    placed:(res, hold) => placed(g, res, hold),
    snapshot:() => snapshot(g),
    flash:(t, ok) => flash(t, ok),
    paint:() => paint(),
    busy:ms => setBusy(g, ms),
  };
}

/* ---------------- painting ---------------- */
function head(g){
  const a = AD[g.id], gm = g.view === 'play' && g.gm;
  const src = gm ? (gm.src === 'quick' ? 'Quick game' : gm.src === 'sb' ? (gm.title || 'Sentence builder') : (gm.setName || 'Questions')) : '';
  return `<div class="ap-head gc-head">
    <div class="ap-title">${icon(a.icon, 'ico gc-ic bx-ic')}${esc(a.name)}</div>
    ${gm ? `<span class="ap-chip bx-chip">${esc(src)}</span>` : ''}
    <div class="grow"></div>
    ${gm && gm.src === 'sb' ? `<span class="bx-tog"><span>Pupils see</span>${seg('dir', [['en', 'English'], ['tl', esc(lname(gm.lang))], ['mix', 'Mixed']], gm.dir)}</span>` : ''}
    ${gm ? `<button class="clk-btn ${g.arm ? 'gc-arm' : ''}" data-b="new" ${g.busy ? 'disabled' : ''}>${icon('reset')}${g.arm ? 'Tap again for a new game' : 'New game'}</button>` : ''}
    ${gm && gm.src === 'quick' ? `<button class="clk-btn" data-b="shrink" title="Small box over the slide" ${g.busy ? 'disabled' : ''}>${icon('shrink')}Shrink</button>` : ''}
    <button class="tb-ic" data-b="close" title="${gm ? 'Hide (kept for this lesson)' : 'Close'}">${icon('x')}</button>
  </div>`;
}
function paint(){
  if(!big) return;
  const g = cur(); if(!g) return;
  const card = big.card;
  card.className = `ap gc bx bx-${g.id} bx-v-${g.view}`;
  if(g.view === 'wait'){ card.innerHTML = head(g) + waitHTML(g); return; }
  if(g.view === 'resume' && g.gm){ card.innerHTML = head(g) + resumeHTML(g); return; }
  if(g.view !== 'play' || !g.gm){ card.innerHTML = head(g) + setupHTML(g.S, false); return; }
  const gm = g.gm, A = api(g);
  const midIn = gm.view === 'question' && (gm.ph === 'ask') ? questionHTML(g) : AD[g.id].boardHTML(gm, A);
  card.innerHTML = head(g) + `<div class="gc-body bx-body">
      ${teamHTML(g, 'a')}
      <div class="gc-mid bx-mid">${midIn}${endHTML(g)}</div>
      ${teamHTML(g, 'b')}
    </div>
    <div class="ap-foot gc-foot bx-foot">${footHTML(g)}</div>`;
  if(AD[g.id].afterPaint) AD[g.id].afterPaint(card, gm, A);
}
function seg(attr, opts, curv){ return `<span class="bx-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${String(curv) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</span>`; }

function teamHTML(g, s){
  const gm = g.gm, a = AD[g.id], st = a.stat(gm, s);
  const live = gm.ph === 'turn' || gm.ph === 'ask' || gm.ph === 'place';
  const on = live && (gm.ph === 'place' ? gm.placer === s : gm.ans === s);
  const sub = !live ? '&nbsp;' : gm.ph === 'place' ? (gm.placer === s ? a.placeWord(gm) : '&nbsp;')
    : gm.ans === s ? (gm.ph === 'ask' || gm.src === 'quick' ? (gm.passed ? 'Steal!' : 'Answering') : gm.sq == null && a.squares && a.squares(gm) ? 'Pick a square' : 'Your turn') : '&nbsp;';
  const lead = st.n > a.stat(gm, other(s)).n;
  return `<div class="gc-team gc-t${s} bx-team ${on ? 'sel' : ''} ${lead ? 'lead' : ''}">
    <div class="gc-tbtn bx-tcol">
      <span class="gc-tname bx-tname">${sideLabel(gm, s)}</span>
      <span class="bx-piece">${a.pieceHTML(s)}</span>
      <span class="gc-score" data-score="${s}">${st.n}</span>
      <span class="bx-stl">${esc(st.sub)}</span>
      <span class="gc-tsub">${sub}</span>
    </div>
    ${a.sideHTML ? a.sideHTML(gm, s, api(g)) : ''}
  </div>`;
}

function questionHTML(g){
  const gm = g.gm, t = qText(g, gm.x);
  if(!t) return `<div class="gc-q"><p class="gc-none">This question has gone. Tap Wrong to move on.</p></div>`;
  const qo = gm.qo;
  return `<div class="gc-q bx-q">
    <div class="gc-qtop">
      <span class="gc-qn">${icon('q')}${gm.sq != null ? `Square ${gm.sq + 1}` : `Question ${qo.i + 1}${qo.laps ? ' · round ' + (qo.laps + 1) : ''}`}${t.label ? ` · <span class="bx-ql">${esc(t.label)}</span>` : ''}</span>
      <span class="bx-who" style="--c:${COL[gm.ans]}">${gm.passed ? 'Steal: ' : ''}${esc(sideName(gm, gm.ans))}</span>
    </div>
    <div class="gc-qtext gc-f${qFit(t.q)}">${esc(t.q)}</div>
    ${t.a ? (gm.shown
      ? `<div class="gc-ans gc-f${qFit(t.a)}">${esc(t.a)}</div>`
      : `<div class="gc-ans hid"><span>Answer hidden</span><span class="gc-priv">Answer: ${esc(t.a)}</span></div>`)
      : `<div class="gc-ans hid"><span>No answer saved for this question</span></div>`}
    ${g.flash ? `<div class="gc-qflash">${esc(g.flash.txt)}</div>` : ''}
  </div>`;
}

function endHTML(g){
  const gm = g.gm;
  if(gm.ph !== 'end' && gm.ph !== 'over') return '';
  const r = gm.result || {};
  if(gm.ph === 'end'){
    const many = gm.need > 1;
    const t = r.draw ? 'It’s a draw!' : `${esc(sideName(gm, r.winner))} wins${many ? ' the game' : ''}!`;
    return `<div class="gc-win bx-win"><div class="gc-win-in" style="--fc:${r.draw ? '#9A9AA6' : COL[r.winner]}">
      ${r.draw ? '' : icon('trophy', 'ico gc-wic')}
      <div class="gc-win-t">${t}</div>
      ${many || r.draw ? `<div class="gc-win-s"><span class="gc-ca">${gm.wins.a}</span> – <span class="gc-cb">${gm.wins.b}</span></div>` : ''}
      <div class="bx-win-n">${r.draw ? 'Draws don’t count: play again.' : `First to ${gm.need} wins.`}</div>
      <div class="gc-win-b"><button class="clk-btn lg gc-go" data-b="nextgame">${icon('next')}Next game</button></div>
    </div></div>`;
  }
  // series (or single match) over
  const w = r.winner, cat = winnerCat();
  const can = !gm.team && cat && window.SVPoints && SVPoints.award && gm.players[w] && gm.players[w].pid;
  const award = can ? (gm.awarded
    ? `<div class="sp-awd bx-awd">${icon('check')}${esc(cat.name)} awarded</div>`
    : `<button class="clk-btn lg bx-awb" data-b="award">${icon('star')}Award ${esc(cat.name)}</button>`) : '';
  const streak = !gm.team && gm.stays && gm.streak && gm.streak.n > 1 && gm.streak.s === w ? `<div class="bx-streak">${icon('crown')}${gm.streak.n} in a row</div>` : '';
  const canNext = !gm.team && gm.stays && g.S && g.S.pupils && g.S.pupils.length > 2;
  return `<div class="gc-win bx-win"><div class="gc-win-in" style="--fc:${COL[w]}">
    ${icon('trophy', 'ico gc-wic')}
    <div class="gc-win-t">${esc(sideName(gm, w))} wins!</div>
    ${gm.need > 1 ? `<div class="gc-win-s"><span class="gc-ca">${gm.wins.a}</span> – <span class="gc-cb">${gm.wins.b}</span></div>` : ''}
    ${streak}
    ${award}
    <div class="gc-win-b">
      ${canNext ? `<button class="clk-btn lg gc-go" data-b="challenger">${icon('swap')}Next challenger</button>` : ''}
      <button class="clk-btn lg ${canNext ? '' : 'gc-go'}" data-b="again">${icon('reset')}Play again</button>
      <button class="clk-btn lg" data-b="new2">${icon('reset')}New game</button>
    </div>
  </div></div>`;
}

function footHTML(g){
  const gm = g.gm, a = AD[g.id], s = gm.ans;
  const undo = g.hist.length && (gm.ph === 'turn' || gm.ph === 'ask' || gm.ph === 'place') ? `<button class="clk-btn lg" data-b="undo" title="Take back the last move" ${g.busy ? 'disabled' : ''}>${icon('undo')}Undo</button>` : '';
  const msg = t => `<div class="ap-sum">${g.flash && gm.view !== 'question' ? `<span class="ap-flash ${g.flash.ok ? '' : 'no'}">${esc(g.flash.txt)}</span>` : t}</div>`;
  const wrongBtn = gm.passed
    ? `<button class="clk-btn lg gc-wrong" data-b="wrong">${icon('x')}Wrong – no one</button>`
    : `<button class="clk-btn lg gc-wrong" data-b="wrong">${icon('pass')}Wrong – pass to ${esc(sideName(gm, other(gm.turn)))}</button>`;
  if(gm.ph === 'end' || gm.ph === 'over') return msg(gm.ph === 'over' ? 'Game over.' : '');
  if(g.busy) return msg('');
  if(gm.ph === 'place') return undo + msg(a.placeHint(gm, sideB(gm, gm.placer)));
  if(gm.src === 'quick'){
    return undo + msg(`${sideB(gm, s)}${gm.passed ? ': steal it!' : ': answer the question'}`) + wrongBtn
      + `<button class="clk-btn lg gc-go" data-b="correct">${icon('check')}Correct – ${a.placeVerb(gm)}</button>`;
  }
  if(gm.ph === 'turn'){
    if(a.squares && a.squares(gm)) return undo + msg(`${sideB(gm, s)}: pick a square`);
    return undo + msg(`${sideB(gm, s)}’s turn`) + `<button class="clk-btn lg gc-go" data-b="nextq">${icon('next')}Next question</button>`;
  }
  // ask
  const t = qText(g, gm.x);
  const back = gm.view === 'question'
    ? (gm.sq != null ? (gm.passed ? '' : `<button class="clk-btn lg" data-b="unpick">${icon('back')}Other square</button>`) : `<button class="clk-btn lg" data-b="board">${icon('back')}Board</button>`)
    : `<button class="clk-btn lg" data-b="toq">${icon('q')}Back to question</button>`;
  return undo + back + `<div class="grow"></div>`
    + (t && t.a ? `<button class="clk-btn lg gc-reveal" data-b="reveal" ${gm.shown ? 'disabled' : ''}>${icon('eye')}Reveal</button>` : '')
    + wrongBtn
    + `<button class="clk-btn lg gc-go" data-b="correct">${icon('check')}Correct – ${a.placeVerb(gm)}</button>`;
}

/* set-up (the board when single screen; the teacher screen's dialog when dual) */
function setupHTML(S, consoleSide){
  if(S.step === 'names') return namesHTML(S, consoleSide);
  const a = AD[S.game], list = sets(), l = lesson();
  const def = l && l.gcSet;
  const L = S.pick ? lname(S.pick.doc.lang) : S.last && S.last.lang ? lname(S.last.lang) : 'French';
  const ready = S.src === 'quick' || (S.src === 'sb' && (S.pick || S.last)) || (S.src === 'set' && setById(S.setId));
  const when = S.last && S.last.at ? new Date(S.last.at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
  const sbTitle = S.pick ? (window.SBCore && SBCore.displayTitle ? SBCore.displayTitle(S.pick.doc) : S.pick.doc.title) : null;
  return `<div class="bx-set">
      <div class="bx-sr"><span>Players</span>${seg('team', [[1, icon('users') + 'Team A v Team B'], [0, icon('user') + '1 v 1']], S.team ? 1 : 0)}</div>
      ${S.team ? '' : `<div class="bx-sr"><span>Winner stays on</span>${seg('stays', [[0, 'Off'], [1, 'On']], S.stays ? 1 : 0)}</div>`}
      ${a.optRows(S, seg)}
    </div>
    <div class="gc-start bx-start">
      <button class="gc-opt bx-opt ${S.src === 'quick' ? 'on' : ''}" data-src="quick">
        <span class="gc-opt-t">${icon('mic')}Quick game</span>
        <span class="gc-opt-d">Ask the questions out loud. A right answer lets them ${esc(a.placeVerb())}. Shrinks so the slide stays in view.</span>
      </button>
      <div class="gc-opt gc-opt-q bx-opt ${S.src === 'sb' ? 'on' : ''}">
        <button class="gc-opt-head" data-src="sb">
          <span class="gc-opt-t">${icon('sb')}Sentence builder</span>
          <span class="gc-opt-d">${a.sbDesc || 'Chunks from a builder to translate, with the answer hidden until you reveal it.'}</span>
        </button>
        <div class="bx-sbrow"><span>Pupils see</span>${seg('dir', [['en', 'English'], ['tl', esc(L)], ['mix', 'Mixed']], S.dir)}</div>
        <div class="bx-sbpick">
          ${sbTitle ? `<span class="bx-sbt">${icon('check')}${esc(sbTitle)}</span><button class="gc-set bx-sbb" data-k="choose">Change</button>`
            : `<button class="gc-set bx-sbb on2" data-k="choose"><span class="nm">${icon('sb')} Choose a builder</span></button>
               ${S.last ? `<button class="gc-set bx-sbb ${S.src === 'sb' && !S.pick ? 'on' : ''}" data-k="lastsb"><span class="nm">${icon('hist')} ${esc(S.last.title || 'Last time')}</span><small>Last time${when ? ' · ' + esc(when) : ''}</small></button>` : ''}`}
        </div>
      </div>
      <div class="gc-opt gc-opt-q bx-opt ${S.src === 'set' ? 'on' : ''}">
        <button class="gc-opt-head" data-src="set" ${list.length ? '' : 'disabled'}>
          <span class="gc-opt-t">${icon('list')}Question set</span>
          <span class="gc-opt-d">Questions on the screen, answer hidden until you reveal it.</span>
        </button>
        ${list.length ? `<div class="gc-sets">${list.map(s => `<button class="gc-set ${S.src === 'set' && S.setId === s.id ? 'on' : ''}" data-set="${esc(s.id)}"><span class="nm">${esc(s.name)}</span><small>${s.qs.length} question${s.qs.length === 1 ? '' : 's'}${s.id === def ? ' · this lesson' : ''}</small></button>`).join('')}</div>`
          : `<p class="gc-none">No question sets yet. Add them on the dashboard: <b>Settings → Question sets</b>.</p>`}
      </div>
    </div>
    <div class="ap-foot gc-foot">
      <div class="ap-sum gc-rules">${esc(a.rules(S.opt, S.src))}${consoleSide ? ' Pupils see “Getting ready…” until you start.' : ''}</div>
      ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}
      <button class="clk-btn lg gc-go bx-go" data-k="go" ${ready ? '' : 'disabled'}>${S.team ? icon('check') + 'Start' : 'Choose players' + icon('fwd')}</button>
    </div>`;
}
function namesHTML(S, consoleSide){
  const n = S.pupils.length;
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const who = i => { const p = S.pupils.find(x => x.id === S.sel[i]); return p ? `<b style="color:${COL[i ? 'b' : 'a']}">${esc(p.name)}</b>` : `<i>Player ${i + 1}</i>`; };
  return `<div class="bx-nh">Who's playing? <span>Tap two names${S.stays ? ' (or Random)' : ''}.</span></div>
    <div class="bx-names" style="--cols:${cols}">${S.pupils.map(p => {
      const k = S.sel.indexOf(p.id);
      return `<button class="ap-p bx-p ${p.abs ? 'abs' : ''} ${k >= 0 ? 'sel s' + k : ''}" data-pp="${esc(p.id)}"><span class="nm">${esc(p.name)}</span>${k >= 0 ? `<span class="bx-pn">${k + 1}</span>` : ''}</button>`;
    }).join('')}</div>
    <div class="ap-foot gc-foot">
      <button class="clk-btn lg" data-k="back">${icon('back')}Back</button>
      <button class="clk-btn lg" data-k="randp" title="Two names at random (absent pupils left out)">${icon('swap')}Random</button>
      <div class="ap-sum bx-vs">${who(0)} v ${who(1)}</div>
      ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}
      <button class="clk-btn lg gc-go bx-go" data-k="go" ${S.sel.length === 2 ? '' : 'disabled'}>${icon('check')}Start</button>
    </div>`;
}
function resumeHTML(g){
  const gm = g.gm;
  return `<div class="gc-start bx-res">
    <button class="gc-opt" data-b="resume">
      <span class="gc-opt-t">${icon('fwd')}Resume</span>
      <span class="gc-opt-d">${esc(sideName(gm, 'a'))} v ${esc(sideName(gm, 'b'))}${gm.need > 1 ? ` · ${gm.wins.a} – ${gm.wins.b}` : ''}<br>Carry on where you were.</span>
    </button>
    <button class="gc-opt" data-b="restart">
      <span class="gc-opt-t">${icon('reset')}Start again</span>
      <span class="gc-opt-d">Back to the set-up: players, game and questions.</span>
    </button>
  </div>
  <div class="ap-foot gc-foot"><div class="ap-sum">This lesson already has a game of ${esc(AD[g.id].name)}.</div></div>`;
}
function waitHTML(g){
  return `<div class="bx-wait">${AD[g.id].waitHTML ? AD[g.id].waitHTML() : ''}
    <div class="bx-wsay">Getting ready<i>.</i><i>.</i><i>.</i></div>
    <div class="bx-wsub">Your teacher is setting up the game.</div>
    <button class="clk-btn" data-b="waitcancel">Cancel</button></div>`;
}

/* ---------------- flash / busy ---------------- */
let flashT = 0;
function flash(txt, ok, ms){
  const g = cur(); if(!g) return;
  g.flash = { txt, ok }; paint(); paintFloat();
  clearTimeout(flashT);
  flashT = setTimeout(() => { const h = cur(); if(h && h.flash){ h.flash = null; paint(); paintFloat(); } }, ms || 2400);
}
let busyT = 0, busyFn = null;
function setBusy(g, ms, then){
  g.busy = true; clearTimeout(busyT); busyFn = then || null;
  busyT = setTimeout(() => finishBusy(g), ms);
}
function finishBusy(g){
  if(!g || !g.busy) return;
  clearTimeout(busyT); g.busy = false;
  const f = busyFn; busyFn = null;
  if(f) f(); else { paint(); paintFloat(); }
}

/* ---------------- starting a game ---------------- */
// r = { game, team, stays, src, setId, dir, doc, loc, opt, players:{a,b}|null }
function startGame(r){
  const id = r && r.game, a = AD[id], g = id && game(id); if(!g) return;
  const res = {}; let title = '', lang = 'fr', setName = '';
  if(r.src === 'sb'){
    if(!r.doc){ toast('Choose a sentence builder first.', true); return; }
    res.pool = poolOf(r.doc);
    if(res.pool.length < 3){ toast('This sentence builder has too few chunks.', true); return; }
    title = window.SBCore && SBCore.displayTitle ? SBCore.displayTitle(r.doc) : (r.doc.title || '');
    lang = r.doc.lang || 'fr';
  } else if(r.src === 'set'){
    const s = setById(r.setId);
    if(!s){ toast('That question set has no questions yet.', true); return; }
    res.qs = s.qs.map(x => ({ q:x.q, a:x.a || '' })); setName = s.name;
  }
  const players = r.team ? { a:null, b:null } : (r.players || { a:{ name:'Player 1', pid:null }, b:{ name:'Player 2', pid:null } });
  g.res = res; g.hist = [];
  g.gm = { src:r.src, dir:r.dir || 'en', title, lang, setName, setId:r.src === 'set' ? r.setId : null,
    team:!!r.team, players, stays:!r.team && !!r.stays, opt:r.opt || a.optDefaults(), need:1,
    wins:{ a:0, b:0 }, correct:{ a:0, b:0 }, gameNo:1, start:'a', turn:'a', ans:'a', passed:false, placer:null,
    ph:'turn', view:'board', x:null, shown:false, sq:null, qo:{ order:null, i:-1, laps:0 },
    board:null, result:null, awarded:false, played:players.a && players.a.pid ? [players.a.pid, players.b.pid] : [], streak:null };
  g.gm.need = a.need ? a.need(g.gm.opt) : 1;
  a.newBoard(g.gm, api(g));
  g.view = 'play'; g.arm = false; g.flash = null;
  const l = lesson();
  if(l){
    if(!l.bxLast || typeof l.bxLast !== 'object') l.bxLast = {};
    const prev = l.bxLast[id] || {};
    l.bxLast[id] = { team:!!r.team, stays:!!r.stays, src:r.src, setId:r.setId || prev.setId || null, dir:r.dir || 'en', opt:g.gm.opt,
      loc:r.src === 'sb' ? (r.loc || null) : prev.loc || null, title:r.src === 'sb' ? title : prev.title || '', lang:r.src === 'sb' ? lang : prev.lang || 'fr', at:r.src === 'sb' ? Date.now() : prev.at || null };
    H().save();
  }
  CUR = id;
  startTurn(g, 'a');
  showBig();
}
function newMatch(g, start){
  const gm = g.gm;
  gm.result = null; gm.placer = null; gm.x = null; gm.sq = null; gm.shown = false; gm.passed = false;
  g.hist = [];
  AD[g.id].newBoard(gm, api(g));
  startTurn(g, start);
}
function startTurn(g, s){
  const gm = g.gm;
  Object.assign(gm, { turn:s, ans:s, passed:false, placer:null, x:null, shown:false, sq:null, ph:'turn', view:'board' });
}

/* ---------------- turns ---------------- */
function snapshot(g){ g.hist.push(JSON.stringify(g.gm)); if(g.hist.length > 30) g.hist.shift(); }
function undo(){
  const g = cur(); if(!g || !g.hist.length || g.busy) return;
  g.gm = JSON.parse(g.hist.pop());
  if(g.gm.ph === 'place' && g.gm.board) g.gm.board.lastT = 0;
  flash('Move taken back', true);
  paintIsland(g.id);
}
function nextQ(g){
  const gm = g.gm, x = drawQ(g);
  if(!x){ flash('No questions to ask.', false); return; }
  gm.x = x; gm.shown = false; gm.ph = 'ask'; gm.view = 'question';
  paint();
}
// A square chosen (N&C with questions): its question comes up.
function pickSquare(g, i, x){
  const gm = g.gm; if(gm.ph !== 'turn') return;
  gm.sq = i; gm.x = x; gm.shown = false; gm.ph = 'ask'; gm.view = 'question';
  paint();
}
function correct(g){
  const gm = g.gm, a = AD[g.id];
  if(!(gm.ph === 'ask' || (gm.ph === 'turn' && gm.src === 'quick'))) return;
  snapshot(g);
  gm.correct[gm.ans]++;
  gm.placer = gm.ans;
  if(gm.sq != null && a.placeSquare){ gm.view = 'board'; a.placeSquare(gm, gm.sq, gm.placer, api(g)); return; }
  gm.ph = 'place'; gm.view = 'board';
  if(a.onPlace) a.onPlace(gm, api(g));
  if(g.size === 'float'){ g.retFloat = true; showBig(); return; }
  paint(); paintIsland(g.id);
}
function wrong(g){
  const gm = g.gm;
  if(!(gm.ph === 'ask' || (gm.ph === 'turn' && gm.src === 'quick'))) return;
  if(!gm.passed){
    gm.passed = true; gm.ans = other(gm.turn);
    flash(`Over to ${sideName(gm, gm.ans)}`, true, 2000);
    return;
  }
  // No one got it: a square's question is replaced; the turn moves on.
  if(gm.sq != null && AD[g.id].refreshSquare) AD[g.id].refreshSquare(gm, gm.sq, api(g));
  endTurn(g, null);
  flash('No one got it', false);
}
function endTurn(g, placer){
  const gm = g.gm;
  startTurn(g, placer ? other(placer) : other(gm.turn));
}
// After a placement (the board decides the result).
function placed(g, res, hold){
  const gm = g.gm, placer = gm.placer;
  if(res && (res.winner || res.draw)){
    gm.result = res;
    if(res.winner) gm.wins[res.winner]++;
    gm.ph = 'hold'; gm.placer = null;
    const over = res.winner && gm.wins[res.winner] >= gm.need;
    if(g.size === 'float') g.retFloat = false;
    setBusy(g, hold || 1600, () => {
      gm.ph = over ? 'over' : 'end';
      if(over && !gm.team && gm.stays){
        const pid = gm.players[res.winner] && gm.players[res.winner].pid;
        gm.streak = gm.streak && gm.streak.pid === pid && gm.streak.s === res.winner ? { pid, s:res.winner, n:gm.streak.n + 1 } : { pid, s:res.winner, n:1 };
      }
      if(g.size !== 'big') showBig(); else { paint(); }
      paintIsland(g.id);
    });
    paint(); paintFloat(); paintIsland(g.id);
    return;
  }
  endTurn(g, placer);
  g.flash = null;
  if(g.retFloat){
    g.retFloat = false;
    setBusy(g, 900, () => toFloat());
  }
  paint(); paintFloat(); paintIsland(g.id);
}
function nextGame(g){
  const gm = g.gm; gm.gameNo++;
  gm.start = other(gm.start);
  newMatch(g, gm.start);
  paint(); paintIsland(g.id);
}
function playAgain(g){
  const gm = g.gm;
  Object.assign(gm, { wins:{ a:0, b:0 }, correct:{ a:0, b:0 }, gameNo:1, start:'a', awarded:false, streak:gm.streak });
  newMatch(g, 'a');
  paint(); paintIsland(g.id);
}
// Winner stays on: the loser is swapped for a random pupil (present, not played yet if possible).
function challenger(g){
  const gm = g.gm, r = gm.result; if(!r || !r.winner) return;
  const lose = other(r.winner), pupils = (g.S && g.S.pupils) || [];
  const inNow = [gm.players.a && gm.players.a.pid, gm.players.b && gm.players.b.pid];
  let pool = pupils.filter(p => !p.abs && !inNow.includes(p.id) && !gm.played.includes(p.id));
  if(!pool.length){ gm.played = inNow.filter(Boolean); pool = pupils.filter(p => !p.abs && !inNow.includes(p.id)); }
  if(!pool.length) pool = pupils.filter(p => !inNow.includes(p.id));
  if(!pool.length){ toast('No one else on the class list.'); return; }
  const p = pool[Math.floor(rand() * pool.length)];
  gm.players[lose] = { name:p.name, pid:p.id };
  gm.played.push(p.id);
  Object.assign(gm, { wins:{ a:0, b:0 }, correct:{ a:0, b:0 }, gameNo:1, awarded:false });
  gm.start = lose; // the challenger goes first
  newMatch(g, lose);
  paint(); paintIsland(g.id);
  flash(`${p.name} takes on ${sideName(gm, r.winner)}`, true);
}
function award(g){
  const gm = g.gm; if(!gm || gm.team || gm.awarded || !gm.result || !gm.result.winner) return;
  const cat = winnerCat(), l = lesson(), p = gm.players[gm.result.winner]; if(!cat || !l || !p || !p.pid) return;
  if(SVPoints.award(l, p.pid, cat.id)){ gm.awarded = true; toast(`${cat.name}: ${p.name}`); }
  else toast('Couldn\'t award the point (no class list for this lesson?).', true);
  paint();
}

/* ---------------- clicks ---------------- */
function onClick(e){
  const g = cur(); if(!g || !big) return;
  const t = e.target.closest('button, [data-cell], [data-col], [data-coin]'); if(!t || t.disabled) return;
  const b = t.dataset.b;
  if(b !== 'new' && g.arm){ g.arm = false; clearTimeout(big.armT); }
  if(g.view === 'start'){ setupClick(g.S, t, false, { repaint:paint, hideCard:() => { if(big) big.back.style.display = 'none'; }, showCard:() => { if(big) big.back.style.display = ''; }, done:r => startGame(r), cancel:hide }); return; }
  if(t.dataset.dir && g.gm){ g.gm.dir = t.dataset.dir; const l = lesson(); if(l && l.bxLast && l.bxLast[g.id]){ l.bxLast[g.id].dir = g.gm.dir; H().save(); } paint(); return; }
  switch(b){
    case 'close': hide(); return;
    case 'shrink': toFloat(); return;
    case 'waitcancel': cancelWait(g, true); return;
    case 'resume': g.view = 'play'; paint(); return;
    case 'restart': newGame(g.id); return;
    case 'new':
      clearTimeout(big.armT);
      if(g.arm){ g.arm = false; newGame(g.id); }
      else { g.arm = true; paint(); big.armT = setTimeout(() => { const h = cur(); if(h && h.arm){ h.arm = false; paint(); } }, 3000); }
      return;
    case 'new2': newGame(g.id); return;
  }
  const gm = g.gm; if(!gm || g.view !== 'play' || g.busy) return;
  switch(b){
    case 'undo': undo(); return;
    case 'nextq': if(gm.ph === 'turn') nextQ(g); return;
    case 'board': gm.view = 'board'; paint(); return;
    case 'toq': gm.view = 'question'; paint(); return;
    case 'unpick': if(gm.ph === 'ask' && gm.sq != null && !gm.passed){ gm.sq = null; gm.x = null; gm.ph = 'turn'; gm.view = 'board'; paint(); } return;
    case 'reveal': gm.shown = true; paint(); return;
    case 'correct': correct(g); return;
    case 'wrong': wrong(g); return;
    case 'nextgame': if(gm.ph === 'end') nextGame(g); return;
    case 'again': playAgain(g); return;
    case 'challenger': challenger(g); return;
    case 'award': award(g); return;
  }
  // The board's own taps (a square, a column, a power-up).
  AD[g.id].click(t, gm, Object.assign(api(g), { pickSquare:(i, x) => pickSquare(g, i, x) }));
}

/* set-up clicks (shared by the board and the teacher screen) */
// cb = { repaint, hideCard, showCard, done(result), cancel }
function setupClick(S, t, consoleSide, cb){
  const a = AD[S.game];
  if(t.dataset.team != null){ S.team = t.dataset.team === '1'; cb.repaint(); return; }
  if(t.dataset.stays != null){ S.stays = t.dataset.stays === '1'; cb.repaint(); return; }
  if(t.dataset.dir){ S.dir = t.dataset.dir; if(S.src !== 'sb') S.src = 'sb'; cb.repaint(); return; }
  if(t.dataset.src){ S.src = t.dataset.src; if(S.src === 'set' && !setById(S.setId)){ const s = sets()[0]; S.setId = s ? s.id : null; } cb.repaint(); return; }
  if(t.dataset.set){ S.src = 'set'; S.setId = t.dataset.set; cb.repaint(); return; }
  if(t.dataset.pp){
    const id = t.dataset.pp, k = S.sel.indexOf(id);
    if(k >= 0) S.sel.splice(k, 1); else if(S.sel.length < 2) S.sel.push(id); else S.sel[1] = id;
    cb.repaint(); return;
  }
  if(a.optClick(S, t)){ cb.repaint(); return; }
  const k = t.dataset.k, b = t.dataset.b;
  if(b === 'close' || k === 'cancel'){ cb.cancel(); return; }
  if(k === 'back'){ S.step = 'start'; S.sel = []; cb.repaint(); return; }
  if(k === 'randp'){
    let pool = S.pupils.filter(p => !p.abs); if(pool.length < 2) pool = S.pupils.slice();
    S.sel = shuffle(pool.map(p => p.id)).slice(0, 2); cb.repaint(); return;
  }
  if(k === 'choose'){
    cb.hideCard();
    SVSentence.choose({ year:S.year, onPick:x => { cb.showCard(); if(poolOf(x.doc).length < 3){ toast('This sentence builder has too few chunks.', true); return; } S.pick = x; S.src = 'sb'; cb.repaint(); }, onCancel:() => cb.showCard() });
    return;
  }
  if(k === 'lastsb'){ S.src = 'sb'; cb.repaint(); return; }
  if(k === 'go'){
    if(S.step === 'names'){ if(S.sel.length === 2) finish(); return; }
    if(S.src === 'sb' && !S.pick){
      if(!S.last){ toast('Choose a sentence builder first.', true); return; }
      findBuilder(S.last).then(x => {
        if(x){ S.pick = x; next(); }
        else { toast(`“${S.last.title || 'The builder'}” isn't in the Sentence Builders folder any more: choose one`, true); S.last = null; cb.repaint(); }
      }).catch(e => toast("Couldn't read the Sentence Builders folder: " + e.message, true));
      return;
    }
    next();
  }
  function next(){
    if(!S.team){
      if(!S.pupils.length){ toast('No class list for this lesson: playing as Player 1 and Player 2.'); finish(); return; }
      S.step = 'names'; S.sel = []; cb.repaint(); return;
    }
    finish();
  }
  function finish(){ cb.done(resultOf(S)); }
}
function resultOf(S){
  let players = null;
  if(!S.team){
    const pick = id => { const p = S.pupils.find(x => x.id === id); return { name:p ? p.name : '?', pid:id }; };
    players = S.sel.length === 2 ? { a:pick(S.sel[0]), b:pick(S.sel[1]) } : { a:{ name:'Player 1', pid:null }, b:{ name:'Player 2', pid:null } };
  }
  return { game:S.game, team:S.team, stays:S.stays, src:S.src, setId:S.setId, dir:S.dir, opt:S.opt,
    doc:S.src === 'sb' && S.pick ? S.pick.doc : null, loc:S.src === 'sb' && S.pick ? S.pick.loc : null, players };
}
async function findBuilder(last){
  const list = await SVSentence.list(), loc = last.loc || {};
  return list.find(x => x.loc.year === loc.year && x.loc.term === loc.term && x.loc.name === loc.name)
    || list.find(x => window.SBCore.displayTitle(x.doc) === last.title && x.doc.lang === last.lang) || null;
}

/* ---------------- small floating box (quick game) ---------------- */
let fl = null;
function showFloat(){
  if(!fl){
    fl = el('div', 'gc-float bx-float');
    document.body.appendChild(fl);
    fl.addEventListener('click', onFloatClick);
    fl.addEventListener('pointerdown', dragStart);
  }
  paintFloat(); placeFloat();
}
function hideFloat(){ if(fl){ fl.remove(); fl = null; } }
function paintFloat(){
  if(!fl) return;
  const g = cur(); if(!g || !g.gm || g.size !== 'float'){ hideFloat(); return; }
  const gm = g.gm, a = AD[g.id], s = gm.ans;
  const st = x => a.stat(gm, x);
  fl.innerHTML = `<div class="gcf-head" data-drag>
      <span class="b4f-grip">${icon('grip')}</span><span class="b4f-t">${icon(a.icon, 'ico gc-ic bx-ic')}${esc(a.name)}</span>
      <button class="b4f-b" data-f="big" title="Make bigger">${icon('expand')}</button>
      <button class="b4f-b" data-f="min" title="Shrink to the top bar">${icon('up')}</button>
    </div>
    <div class="bxf-body">
      <div class="bxf-mini">${a.miniHTML(gm)}</div>
      <div class="bxf-side">
        <div class="bxf-sc"><span class="gc-ca">${esc(shortName(gm, 'a'))} <b>${st('a').n}</b></span><span class="gc-cb"><b>${st('b').n}</b> ${esc(shortName(gm, 'b'))}</span></div>
        <div class="bxf-turn" style="--c:${COL[s]}">${gm.ph === 'turn' ? `${esc(sideName(gm, s))}${gm.passed ? ': steal!' : ''}` : g.busy ? '…' : 'Tap ⤢'}</div>
        ${gm.ph === 'turn' && !g.busy ? `<div class="bxf-btns"><button class="bxf-b no" data-f="wrong" title="${gm.passed ? 'Wrong – no one' : 'Wrong – pass'}">${icon(gm.passed ? 'x' : 'pass')}</button><button class="bxf-b ok" data-f="correct" title="Correct">${icon('check')}</button></div>` : ''}
      </div>
    </div>
    ${g.flash ? `<div class="gcf-msg">${esc(g.flash.txt)}</div>` : ''}`;
}
const shortName = (gm, s) => gm.team ? (s === 'a' ? 'A' : 'B') : sideName(gm, s).split(' ')[0];
function onFloatClick(e){
  const b = e.target.closest('button'); if(!b || b.disabled || !fl) return;
  const g = cur(); if(!g || !g.gm) return;
  const f = b.dataset.f;
  if(f === 'big'){ showBig(); return; }
  if(f === 'min'){ g.size = 'min'; hideFloat(); paintIsland(g.id); return; }
  if(f === 'correct'){ correct(g); return; }
  if(f === 'wrong'){ wrong(g); paintFloat(); return; }
}
function dragStart(e){
  if(!e.target.closest('[data-drag]') || e.target.closest('button')) return;
  e.preventDefault();
  const box = fl, r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  try{ box.setPointerCapture(e.pointerId); }catch(_){}
  box.classList.add('drag');
  const mv = ev => setPos(ev.clientX - ox, ev.clientY - oy);
  const up = () => {
    box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up);
    box.classList.remove('drag');
    if(fl === box && D()){ const q = box.getBoundingClientRect(); D().bxPos = { x:q.left / innerWidth, y:q.top / innerHeight }; H().save(); }
  };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
function setPos(x, y){
  if(!fl) return;
  fl.style.left = clamp(x, 4, innerWidth - fl.offsetWidth - 4) + 'px';
  fl.style.top = clamp(y, 4, innerHeight - fl.offsetHeight - 4) + 'px';
}
function placeFloat(){
  if(!fl) return;
  const p = D() && D().bxPos;
  if(p && isFinite(p.x) && isFinite(p.y)) setPos(p.x * innerWidth, p.y * innerHeight);
  else { const railLeft = !!$('.present.rail-left'); setPos(railLeft ? innerWidth - fl.offsetWidth - 24 : 88, innerHeight - fl.offsetHeight - 24); }
}

/* ---------------- island ---------------- */
function paintIsland(id){
  const I = window.SVIsland; if(!I || !id) return;
  const g = GS[id], l = lesson(), key = 'bx-' + id;
  if(!g || !l || g.lid !== l.id || !g.gm || g.size !== 'min'){ I.remove(key); return; }
  const gm = g.gm, a = AD[id], na = a.stat(gm, 'a').n, nb = a.stat(gm, 'b').n;
  I.set(key, `<span class="isl-read tl-isl" data-bx="${id}" title="${esc(a.name)}">${icon(a.icon, 'ico tl-iic bx-iic')}<span class="tl-in ${na > nb ? 'lead' : ''}">${gm.team ? icon('left', 'ico tl-iarr') + 'A' : esc(shortName(gm, 'a'))}</span><b class="tl-is">${na}</b><span class="tl-dash">–</span><b class="tl-is">${nb}</b><span class="tl-in ${nb > na ? 'lead' : ''}">${gm.team ? 'B' + icon('right', 'ico tl-iarr') : esc(shortName(gm, 'b'))}</span></span><button class="isl-b" data-bxx="${id}" title="Close (the game is kept for this lesson)">${icon('x')}</button>`, 4);
}
document.addEventListener('pointerdown', e => {
  const x = e.target.closest && e.target.closest('.island [data-bxx]');
  if(x){ e.preventDefault(); e.stopPropagation(); const g = game(x.dataset.bxx); if(g) g.size = 'closed'; paintIsland(x.dataset.bxx); return; }
  const r = e.target.closest && e.target.closest('.island [data-bx]'); if(!r) return;
  e.preventDefault(); e.stopPropagation();
  const id = r.dataset.bx, g = game(id); if(!g) return;
  if(CUR && CUR !== id){ const o = cur(); closeBig(); hideFloat(); if(o && o.gm) o.size = 'min'; paintIsland(CUR); }
  CUR = id; g.view = 'play';
  if(g.gm && g.gm.src === 'quick' && g.gm.ph !== 'end' && g.gm.ph !== 'over'){ g.size = 'float'; showFloat(); paintIsland(id); }
  else showBig();
}, true);

/* ---------------- dual screen ---------------- */
async function askTeacher(g){
  const tok = g.tok = uid(), S = g.S;
  let r;
  try{ r = await SVDual.link.bxSetup({ game:g.id, year:S.year, last:S.last, pupils:S.pupils, team:S.team, stays:S.stays, src:S.src, setId:S.setId, dir:S.dir, opt:S.opt }); }
  catch(e){ if(GS[g.id] === g && g.tok === tok){ g.tok = null; toast((e && e.message) || 'The teacher screen did not answer.'); afterWait(g); } return; }
  if(GS[g.id] !== g || g.tok !== tok) return;
  g.tok = null;
  if(r && r.game === g.id){ startGame(r); }
  else afterWait(g);
}
function afterWait(g){ if(g.gm){ g.view = 'play'; paint(); } else { g.view = 'start'; g.size = 'closed'; if(CUR === g.id) closeBig(); } }
function cancelWait(g, tell){
  if(!g || g.view !== 'wait') return;
  g.tok = null;
  if(tell && window.SVDual && SVDual.link && SVDual.link.bxSetupEnd) SVDual.link.bxSetupEnd();
  afterWait(g);
}
// Teacher console: rpc 'bxSetup' { game, year, last, pupils, team, stays, src, setId, dir, opt } → result or null.
let CS = null; // { back, card, res, S }
function setupOnConsole(req){
  cancelSetup();
  req = req || {};
  const a = AD[req.game];
  if(!a) return Promise.resolve(null);
  return new Promise(res => {
    const back = el('div', 'ap-back bx-cback'), card = el('div', 'ap gc bx bx-c');
    back.appendChild(card); document.body.appendChild(back);
    const S = { step:'start', game:req.game, team:req.team !== false, stays:!!req.stays, src:['quick', 'sb', 'set'].includes(req.src) ? req.src : 'quick',
      setId:req.setId || null, dir:['en', 'tl', 'mix'].includes(req.dir) ? req.dir : 'en', pick:null, last:req.last && req.last.loc ? req.last : null,
      opt:a.optDefaults(req.opt), sel:[], pupils:Array.isArray(req.pupils) ? req.pupils : [], year:req.year };
    if(S.src === 'set' && !setById(S.setId)){ const s = sets()[0]; S.setId = s ? s.id : null; if(!s) S.src = 'quick'; }
    CS = { back, card, res, S };
    const paintC = () => {
      if(!CS) return;
      card.innerHTML = `<div class="ap-head gc-head"><div class="ap-title">${icon(a.icon, 'ico gc-ic bx-ic')}${esc(a.name)}</div><span class="ap-chip">Set up on this screen</span><div class="grow"></div>
        <button class="tb-ic" data-k="cancel" title="Cancel">${icon('x')}</button></div>` + setupHTML(S, true);
    };
    paintC();
    card.addEventListener('click', e => {
      if(!CS) return;
      const t = e.target.closest('button'); if(!t || t.disabled) return;
      setupClick(S, t, true, { repaint:paintC, hideCard:() => { if(CS) CS.back.style.display = 'none'; }, showCard:() => { if(CS) CS.back.style.display = ''; }, done:r => finishSetup(r), cancel:() => finishSetup(null) });
    });
  });
}
function finishSetup(v){
  if(!CS) return;
  const s = CS; CS = null;
  s.back.remove();
  s.res(v || null);
}
function cancelSetup(){
  if(!CS) return;
  if(window.SVSentence && SVSentence.open_ && !SVSentence.state) SVSentence.close();
  finishSetup(null);
}

/* ---------------- keys ---------------- */
const FWD = ['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'], BACK = ['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'];
const overlayOpen = () => !!document.querySelector('.sbp-back');
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
  const k = e.key;
  if([...FWD, ...BACK, 'Home', 'End'].includes(k)) e.preventDefault();
  const g = cur(); if(!g) return;
  if(k === 'Escape'){ e.preventDefault(); if(g.busy){ finishBusy(g); return; } hide(); return; }
  if(g.view === 'resume' && g.gm){ if(FWD.includes(k)){ g.view = 'play'; paint(); } return; }
  const gm = g.gm; if(g.view !== 'play' || !gm || g.busy) return;
  // Clicker: next question → reveal; at the end of a game, next game.
  if(FWD.includes(k)){
    if(gm.ph === 'end'){ nextGame(g); return; }
    if(gm.ph === 'turn' && gm.src !== 'quick' && !(AD[g.id].squares && AD[g.id].squares(gm))){ nextQ(g); return; }
    if(gm.ph === 'ask' && gm.view === 'question' && !gm.shown){ const t = qText(g, gm.x); if(t && t.a){ gm.shown = true; paint(); } return; }
  }
  if(BACK.includes(k) && gm.ph === 'ask' && gm.shown){ gm.shown = false; paint(); }
}, true);

/* ---------------- lesson changes ---------------- */
function clearAll(){
  for(const id of Object.keys(GS)){ const g = GS[id]; if(g && g.view === 'wait') cancelWait(g, true); if(window.SVIsland) SVIsland.remove('bx-' + id); }
  closeBig(); hideFloat();
  for(const id of Object.keys(GS)) delete GS[id];
  CUR = null;
}
window.addEventListener('sv:present', e => {
  if(!(e.detail && e.detail.resume)){ clearAll(); return; }
  const g = cur();
  if(g && g.gm){ if(g.size === 'float') showFloat(); else if(g.size === 'big'){ g.view = 'play'; showBig(); } }
  for(const id of Object.keys(GS)) paintIsland(id);
});
window.addEventListener('sv:leave', e => {
  if(!(e.detail && e.detail.keep)){ clearAll(); return; }
  const g = cur();
  if(g && g.view === 'wait') cancelWait(g, true);
  if(g) finishBusy(g);
  if(big){ big.back.remove(); big = null; }
  hideFloat();
});

/* ---------------- styles ---------------- */
const CSS = `
.bx .ico.bx-ic, .bx-float .ico.bx-ic{ color:#F5B700; }
.bx .ap-title{ white-space:nowrap; flex:none; }
.bx-chip{ max-width:28%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-seg{ display:flex; gap:6px; background:var(--dark-2); border-radius:14px; padding:5px; }
.bx-seg button{ display:inline-flex; align-items:center; gap:8px; height:46px; padding:0 16px; border-radius:10px; border:0; background:transparent; color:var(--dark-text); font:600 17px var(--font); cursor:pointer; touch-action:manipulation; white-space:nowrap; }
.bx-seg button .ico{ width:20px; height:20px; }
.bx-seg button.on{ background:var(--accent); color:#fff; }
.bx-tog{ display:flex; align-items:center; gap:10px; font:600 16px var(--font); color:var(--dark-text-2); }
.bx-tog .bx-seg button{ height:42px; padding:0 12px; }
/* set-up */
.bx-set{ display:flex; flex-wrap:wrap; gap:10px 28px; margin:0 0 14px; flex:none; }
.bx-sr{ display:flex; align-items:center; gap:12px; }
.bx-sr > span:first-child{ font:600 18px var(--font); color:var(--dark-text-2); }
.bx-start{ grid-template-columns:repeat(3, minmax(0,1fr)); align-items:stretch; }
.bx-opt{ min-height:0; overflow:hidden; }
.bx-sbrow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; font:600 16px var(--font); color:var(--dark-text-2); }
.bx-sbrow .bx-seg button{ height:40px; padding:0 12px; font-size:16px; }
.bx-sbpick{ display:flex; flex-direction:column; gap:8px; min-height:0; }
.bx-sbpick .gc-set .nm{ display:inline-flex; align-items:center; gap:8px; }
.bx-sbpick .gc-set .ico{ width:20px; height:20px; }
.bx-sbb.on2{ background:var(--accent); color:#fff; }
.bx-sbt{ display:flex; align-items:center; gap:8px; font:700 20px/1.25 var(--font); color:var(--dark-text); }
.bx-sbt .ico{ width:22px; height:22px; color:#5FD38D; flex:none; }
.bx-go{ min-width:200px; }
.bx-res{ grid-template-columns:1fr 1fr; }
.bx-nh{ flex:none; font:700 26px/1.2 var(--font); margin:0 0 12px; }
.bx-nh span{ font-weight:500; font-size:18px; color:var(--dark-text-2); margin-left:10px; }
.bx-names{ flex:1; min-height:0; display:grid; grid-template-columns:repeat(var(--cols), 1fr); grid-auto-rows:minmax(48px, 1fr); gap:8px; overflow:auto; padding:2px; }
.bx-p{ --fs:clamp(17px, 2.6vh, 26px); justify-content:center; text-align:center; }
.bx-p.sel{ border-width:3px; }
.bx-p.s0{ border-color:${COL.a}; background:color-mix(in srgb, ${COL.a} 26%, var(--dark-2)); }
.bx-p.s1{ border-color:${COL.b}; background:color-mix(in srgb, ${COL.b} 26%, var(--dark-2)); }
.bx-pn{ position:absolute; right:8px; top:6px; font:700 13px/1 var(--font); opacity:.8; }
.bx-vs{ text-align:center; font-size:22px; }
.bx-vs i{ font-style:normal; color:var(--dark-text-2); }
.bx-cback{ z-index:100; }
.ap.bx.bx-c{ position:relative; border-radius:24px; width:min(1240px, 94vw); height:min(720px, 90vh); }
.bx-wait{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; text-align:center; }
.bx-wsay{ font:700 clamp(30px, 5vh, 52px)/1.1 var(--font); }
.bx-wsay i{ font-style:normal; animation:bx-dot 1.4s infinite; }
.bx-wsay i:nth-child(2){ animation-delay:.2s; } .bx-wsay i:nth-child(3){ animation-delay:.4s; }
@keyframes bx-dot{ 0%,60%,100%{ opacity:.2; } 30%{ opacity:1; } }
.bx-wsub{ font-size:22px; color:var(--dark-text-2); }
/* playing */
.bx-tcol{ cursor:default; gap:6px; }
.bx-tname{ max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.bx-piece{ display:grid; place-items:center; width:clamp(36px, 6vh, 64px); height:clamp(36px, 6vh, 64px); }
.bx-piece svg{ width:100%; height:100%; }
.bx-tcol .gc-score{ font-size:clamp(52px, 10vh, 120px); }
.bx-stl{ font-size:15px; font-weight:600; color:var(--dark-text-2); margin-top:-6px; text-transform:uppercase; letter-spacing:.06em; }
.bx-team.sel .gc-tsub{ font-size:19px; }
.bx-mid{ align-items:center; justify-content:center; }
.bx-q{ align-self:stretch; }
.bx-ql{ color:var(--dark-text); }
.bx-who{ display:inline-flex; align-items:center; height:44px; padding:0 18px; border-radius:14px; background:var(--c); color:#111114; font:700 20px var(--font); max-width:50%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-win-n{ font-size:20px; color:var(--dark-text-2); }
.bx .clk-btn.bx-awb{ background:#F5B700; color:#111114; }
.bx .clk-btn.bx-awb .ico{ color:#111114; }
.bx-awd{ display:flex; align-items:center; gap:8px; font:700 20px var(--font); color:#F5B700; }
.bx-awd .ico{ width:24px; height:24px; }
.bx-streak{ display:flex; align-items:center; gap:8px; font:700 24px var(--font); color:#F5B700; }
.bx-streak .ico{ width:28px; height:28px; }
.bx-win .gc-win-b{ flex-wrap:wrap; justify-content:center; }
.bx-win .gc-win-b .clk-btn:not(.gc-go){ background:var(--dark-3); }
.bx-foot{ min-height:75px; box-sizing:border-box; }
.bx-foot .clk-btn.lg{ height:60px; }
/* floating box */
.bx-float{ width:400px; }
.bxf-body{ display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:stretch; }
.bxf-mini{ display:grid; place-items:center; }
.bxf-side{ display:flex; flex-direction:column; gap:8px; justify-content:center; min-width:0; }
.bxf-sc{ display:flex; justify-content:space-between; gap:8px; font:600 16px var(--font); }
.bxf-sc b{ font-size:26px; font-weight:800; }
.bxf-sc span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bxf-turn{ font:700 17px/1.2 var(--font); color:var(--c); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bxf-btns{ display:flex; gap:8px; }
.bxf-b{ flex:1; height:52px; border-radius:12px; border:0; display:grid; place-items:center; cursor:pointer; touch-action:manipulation; color:#fff; }
.bxf-b .ico{ width:26px; height:26px; stroke-width:2.6; }
.bxf-b.ok{ background:var(--ok); } .bxf-b.no{ background:color-mix(in srgb, var(--danger) 70%, var(--dark-2)); }
.bxf-b:active{ filter:brightness(.85); }
.island-w .isl-read > .ico.bx-iic{ color:#F5B700; }
body:not(.presenting) .bx-float, body:not(.presenting) .bx-back{ display:none; }
@media (prefers-reduced-motion: reduce){ .bx *{ animation:none !important; } }
`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'bx-css', textContent:CSS }));
// Extra styles for the teacher screen's copy: the boards add theirs.
const REP_CSS = '';

window.SVBoardGames = {
  register, open, close:hide, setupOnConsole, cancelSetup, COL, icon, esc,
  get CSS(){ return CSS + Object.values(AD).map(a => a.CSS || '').join(''); },
  get REP_CSS(){ return REP_CSS + Object.values(AD).map(a => a.REP_CSS || '').join(''); },
  get open_(){ return !!big; },
  _:{ poolOf, state:id => GS[id] },
};
})();
