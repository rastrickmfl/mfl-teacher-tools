/* =====================================================================
   Slideshow Viewer — Splat (v1.50, 2026-10-16; look v1.65.1, 2026-10-18)
   Tools → Splat (and the teacher screen's Tools menu). A pop-up over the
   slide area. One chunk of a sentence builder sits in the middle of the
   screen; around it, bubbles drift slowly and bounce off the edges, the
   middle card and each other. One bubble is the chunk in the other
   language; the rest are other items from the same column (same group
   first) and red herrings from other columns. The pupil at the front taps
   the right bubble: it turns into a green splat (a wrong one, a red splat).

   Top bar toggle: Middle English / French (Spanish). Switches at once; the
   bubbles show the other language.

   Set-up (start screen):
     Players   1 player · 2 players (two names picked from the lesson's
               class list; absent pupils greyed out but can be picked).
     Rounds    5 / 10 / 15.
     Speed     Slow / Medium / Fast (also the ⚡ button while playing).
     Builder   Choose a sentence builder (gallery, lesson's year first) or
               Last time (lesson.spLast). Every item in every column is used.
   Rounds: one chunk each, no repeats in a game. 8 bubbles: the answer, up to
   4 from the same column (same group first), the rest from other columns.
   Bubbles that would read the same as another (either language) are left out.

   1 player: right → green splat, the others pop, Next (→ / clicker).
             Wrong → red splat that fades; the round carries on.
   2 players: right → green splat, bubbles freeze, others pop; after 3 s
             "Who got it?" [A] [B] [No one] → point → next round.
             Wrong → red splat, bubbles freeze; after 3 s "Who pressed it?"
             [A] [B] [No one]: the other player gets the point; the splat
             fades and the round carries on.
   End: 2 players → winner (or draw) with one-tap Game Winner Achievement
   Point (category found by name); 1 player → All done. Play again (same
   builder and players, new chunks) / New game.

   Dual screen: set-up on the teacher screen (rpc 'spSetup', no time limit;
   'spSetupEnd' cancels), as Hungry Translations; the panel shows Getting
   ready…. The teacher screen's copy outlines the right bubble (REP_CSS).
   Moving bubbles are positioned from script (style transform), so the
   mirror sends them at up to ~30 a second.

   Memory: kept for the lesson (× keeps it; opening again offers Resume /
   Start again). Saved: lesson.spLast = { loc, title, lang, mode, rounds, speed, at }.
   Uses SVSentence.choose / list, SVClasses, SVPoints. Loaded after hungry.js.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, toast } = C;
const H = () => window.SVHost;
const uid = () => Math.random().toString(36).slice(2, 10);

const ROUNDS = [5, 10, 15];
const SPEEDS = { slow:{ label:'Slow', v:38 }, med:{ label:'Medium', v:62 }, fast:{ label:'Fast', v:95 } }; // px/s at 800px field height
const SPEED_KEYS = ['slow', 'med', 'fast'];
const N_BUBBLES = 8, N_SAME = 4;
const ASK_DELAY = 3000;          // 2 players: the pop-up waits this long after a splat
const P_COL = ['#5AA9FF', '#FF9F43'];   // player colours (as Game of Chance)
// bubble colours (v1.65.1): rich candy tones, each ≥ 3.2:1 with white text; no pure green or red (those mean right / wrong)
const B_COL = ['#D9467A', '#D9731A', '#9B4DCA', '#6D5BD0', '#2F7FD8', '#1C8FA8', '#C0399F', '#B7791F', '#C2557E'];
const N_STAINS = 14;             // background stains kept per game (oldest go first)
const OK_COL = '#22B566', BAD_COL = '#E5484D';

const IC = iconMap({
  tool: 'splat', hand: 'hand', hist: 'history', x: 'x',
  left: 'chevron-left', right: 'chevron-right', reset: 'rotate-ccw', new: 'plus',
  bolt: 'zap', star: 'star', trophy: 'trophy', check: 'check',
  user: 'user', users: 'users',
});
const icon = (n, cls) => `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- words ---------------- */
const LANGS = () => (window.SBCore && SBCore.LANGS) || { fr:{ name:'French', short:'FR' }, es:{ name:'Spanish', short:'ES' } };
const lname = l => (LANGS()[l] || { name:'French' }).name;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/[\s,.;:]+$/, '');
const norm = s => clean(s).toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, '').replace(/\s+/g, ' ').trim();
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Every usable item: { tl, en, c (column), g (group) }; the same words only once.
function poolOf(doc){
  const out = [], seen = new Set();
  (doc && doc.cols || []).forEach((col, c) => (col.groups || []).forEach((grp, g) => (grp || []).forEach(it => {
    const tl = clean(it.tl), en = clean(it.en);
    if(!tl || !en) return;
    const k = norm(tl); if(!k || seen.has(k)) return;
    seen.add(k); out.push({ tl, en, c, g });
  })));
  return out;
}
// The bubbles for one round: the answer + same column (same group first) + other columns.
function optionsFor(pool, ans){
  const used = new Set([norm(ans.tl), norm(ans.en)]);
  const ok = it => !used.has(norm(it.tl)) && !used.has(norm(it.en));
  const take = (list, n, out) => { for(const it of shuffle(list.slice())){ if(out.length >= n) break; if(ok(it)){ out.push(it); used.add(norm(it.tl)); used.add(norm(it.en)); } } };
  const same = [];
  take(pool.filter(it => it !== ans && it.c === ans.c && it.g === ans.g), N_SAME, same);
  take(pool.filter(it => it !== ans && it.c === ans.c && it.g !== ans.g), N_SAME, same);
  const other = [];
  take(pool.filter(it => it.c !== ans.c), N_BUBBLES - 1 - same.length, other);
  const opts = same.concat(other);
  if(opts.length < N_BUBBLES - 1) take(pool.filter(it => it !== ans), N_BUBBLES - 1, opts);
  return shuffle([{ it:ans, ok:true }].concat(opts.map(it => ({ it, ok:false }))));
}

/* ---------------- splat shape (made once per splat, so a repaint looks the same) ---------------- */
function splatShape(){
  const N = 13, pts = [];
  for(let i = 0; i < N; i++){
    const a = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
    const r = (i % 3 === 0 ? 44 : 34) + Math.random() * 8;
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = '';
  for(let i = 0; i < N; i++){
    const p = pts[i], q = pts[(i + 1) % N], m = mid(p, q);
    // pull the in-between point towards the centre: lobes with dips between them
    const k = 0.62 + Math.random() * 0.12, c = [50 + (m[0] - 50) * k, 50 + (m[1] - 50) * k];
    if(!i){ const s = mid(pts[N - 1], p); d += `M${s[0].toFixed(1)} ${s[1].toFixed(1)}`; }
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
    d += `Q${(c[0] * 0.5 + q[0] * 0.5).toFixed(1)} ${(c[1] * 0.5 + q[1] * 0.5).toFixed(1)} ${mid(q, c).map(v => v.toFixed(1)).join(' ')}`;
  }
  d += 'Z';
  let drops = '';
  for(let i = 0; i < 6; i++){
    const a = Math.random() * Math.PI * 2, r = 47 + Math.random() * 6, s = 1.8 + Math.random() * 3.2;
    drops += `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${s.toFixed(1)}"/>`;
  }
  return drops + `<path d="${d}"/>`;
}
function splatSVG(color){
  return `<svg class="sp-svg" viewBox="-5 -5 110 110" aria-hidden="true"><g fill="${color}">${splatShape()}</g><ellipse cx="38" cy="36" rx="12" ry="7" fill="#fff" opacity=".22" transform="rotate(-30 38 36)"/></svg>`;
}
/* background stains (v1.65.1): each splat leaves a soft mark in its bubble's colour for the rest of the game.
   Kept as { x, y (0–1 of the field), s (size, × field height), r (deg), col, g (shape) } in gm.stains. */
function stainHTML(st, fresh){
  return `<svg class="sp-st${fresh ? ' new' : ''}" viewBox="-5 -5 110 110" aria-hidden="true" style="left:${(st.x * 100).toFixed(2)}%;top:${(st.y * 100).toFixed(2)}%;width:calc(var(--fh,600px) * ${st.s.toFixed(3)});--r:${st.r}deg"><g fill="${st.col}">${st.g}</g></svg>`;
}
function addStain(gm, b, r){
  if(!RT || !RT.W) return;
  const st = { x:b.x / RT.W, y:b.y / RT.H, s:(2 * r * (1.7 + Math.random() * 0.5)) / RT.H, r:Math.round(Math.random() * 360), col:b.col, g:splatShape() };
  gm.stains = (gm.stains || []).concat(st).slice(-N_STAINS);
  const layer = $('.sp-stains', RT.field); if(!layer) return;
  layer.insertAdjacentHTML('beforeend', stainHTML(st, true));
  while(layer.children.length > N_STAINS) layer.firstElementChild.remove();
}
// droplets that fly out of a fresh splat (gone after the animation; not kept)
function sprayHTML(color){
  let h = '';
  for(let i = 0; i < 10; i++){
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5, d = 55 + Math.random() * 45, z = 6 + Math.random() * 7;
    h += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}%;--dy:${(Math.sin(a) * d).toFixed(0)}%;--z:${z.toFixed(1)}%;--dl:${(Math.random() * 60).toFixed(0)}ms"></i>`;
  }
  return `<span class="sp-spray" style="--sc:${color}">${h}</span>`;
}

/* ---------------- class list ---------------- */
function pupilsOf(l){
  const SC = window.SVClasses; if(!SC || !l) return [];
  const cls = SC.classFor(l); if(!cls) return [];
  const names = SC.nameMap(cls), ab = SC.absentSet(l.id);
  return SC.active(cls).map(p => ({ id:p.id, name:names.get(p.id) || p.first, abs:ab.has(p.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity:'base' }));
}
const winnerCat = () => { const P = window.SVPoints; const cs = P && P.cats ? P.cats() : []; return cs.find(c => /game\s*winner/i.test(c.name)) || null; };

/* ---------------- state (memory, per lesson) ---------------- */
// G = { lid, view:'start'|'names'|'wait'|'play'|'resume', S (set-up), game, size, arm, tok, mid:'en'|'tl', speed }
// game = { doc, loc, title, lang, pool, queue, mode, rounds, players:[{ pid, name }]|null, scores:[a, b], r, cur, fin, awarded }
// cur = { ans, bubbles:[{ id, it, ok, st:''|'ok'|'bad'|'gone', col, sp, x, y, vx, vy }], ph:'play'|'okwait'|'ask-ok'|'done'|'badwait'|'ask-bad', bad (bubble id), W, H }
let G = null;
const lesson = () => H() && H().lesson;
const lessonYear = l => l && C.yearOf ? C.yearOf(l.label) : null;
const teacherLinked = () => !!(window.SVDual && SVDual.teacherLinked);
function lastOf(l){ const u = l && l.spLast; return u && u.loc ? u : null; }
function newSetup(l, last){
  return { step:'start', mode:(last && last.mode === 2) ? 2 : 1, rounds:(last && ROUNDS.includes(last.rounds)) ? last.rounds : 10,
    speed:(last && SPEEDS[last.speed]) ? last.speed : 'med', pick:null, sel:[], pupils:pupilsOf(l), last, year:lessonYear(l) };
}
function game(){
  const l = lesson(); if(!l) return null;
  if(!G || G.lid !== l.id){
    const last = lastOf(l);
    G = { lid:l.id, view:'start', S:newSetup(l, last), game:null, size:'closed', arm:false, tok:null, mid:'en', speed:(last && SPEEDS[last.speed]) ? last.speed : 'med' };
  }
  return G;
}

/* ---------------- big view ---------------- */
let big = null; // { back, card, armT, tm }
let RT = null;  // run time: { field, mid, W, H, f, els:Map(id → { el, r }), raf, t }
function open(){
  const l = lesson();
  if(!l){ toast('Open a lesson to use Splat.'); return; }
  if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); return; }
  const g = game();
  if(g.game && (g.view === 'play' || g.view === 'resume')){ g.view = 'resume'; showBig(); return; }
  newGame();
}
function newGame(){
  const g = game(); if(!g) return;
  g.arm = false;
  stopTimers();
  const l = lesson();
  g.S = newSetup(l, lastOf(l));
  if(teacherLinked()){ g.view = 'wait'; showBig(); askTeacher(g); return; }
  g.view = 'start'; showBig();
}
function showBig(){
  const g = game(); if(!g) return;
  if(window.SVPoints && SVPoints.close) SVPoints.close();
  g.size = 'big';
  if(!big){
    const back = el('div', 'ap-back gc-back sp-back'), card = el('div', 'ap sp');
    back.appendChild(card); document.body.appendChild(back);
    card.addEventListener('click', onClick);
    card.addEventListener('pointerdown', onDown);
    big = { back, card };
  }
  fit(); paint();
}
function stopTimers(){ if(big){ clearTimeout(big.armT); } if(G && G.game && G.game.cur){ clearTimeout(G.game.cur.tm); } stopLoop(); }
function closeBig(){
  if(!big) return;
  stopTimers();
  big.back.remove(); big = null; RT = null;
}
// × : keep the game for the lesson (a set-up in progress is cancelled; a waiting pop-up comes straight up next time).
function hide(){
  const g = G;
  if(g && g.view === 'wait') cancelWait(g, true);
  if(g){
    const cur = g.game && g.game.cur;
    if(cur && cur.ph === 'okwait') cur.ph = g.game.mode === 2 ? 'ask-ok' : 'done';
    if(cur && cur.ph === 'badwait') cur.ph = 'ask-bad';
    g.size = 'closed'; g.view = g.game ? 'play' : 'start';
  }
  closeBig();
}
function fit(){
  if(!big) return;
  const host = $('.present:not(.preview) .stage-host'), c = big.card.style;
  if(host){ const r = host.getBoundingClientRect(); Object.assign(c, { left:r.left + 'px', top:r.top + 'px', width:r.width + 'px', height:r.height + 'px' }); }
  else Object.assign(c, { left:'2vw', top:'4vh', width:'96vw', height:'92vh' });
}
let rzT = 0;
window.addEventListener('resize', () => { if(!big) return; fit(); clearTimeout(rzT); rzT = setTimeout(() => { if(big && G && G.view === 'play') layout(); }, 120); });

/* ---------------- painting ---------------- */
function head(g){
  const gm = g.view === 'play' && g.game;
  const L = gm ? lname(gm.lang) : 'French';
  return `<div class="ap-head gc-head">
    <div class="ap-title">${icon('tool', 'ico sp-ic')}Splat</div>
    ${gm && gm.title ? `<span class="ap-chip sp-chip">${esc(gm.title)}</span>` : ''}
    <div class="grow"></div>
    ${gm ? `<span class="sp-tog"><span>Middle</span><span class="sp-seg"><button data-mid="en" class="${g.mid === 'en' ? 'on' : ''}">English</button><button data-mid="tl" class="${g.mid === 'tl' ? 'on' : ''}">${esc(L)}</button></span></span>
      <button class="clk-btn" data-b="speed" title="How fast the bubbles move (tap to change)">${icon('bolt')}${SPEEDS[g.speed].label}</button>
      <button class="clk-btn ${g.arm ? 'gc-arm' : ''}" data-b="new">${icon('new')}${g.arm ? 'Tap again for a new game' : 'New game'}</button>` : ''}
    <button class="tb-ic" data-b="close" title="${gm ? 'Close (kept for this lesson)' : 'Close'}">${icon('x')}</button>
  </div>`;
}
function paint(){
  if(!big) return;
  const g = game(); if(!g) return;
  stopLoop(); RT = null;
  const card = big.card;
  card.className = 'ap sp sp-v-' + g.view;
  if(g.view === 'wait'){ card.innerHTML = head(g) + waitHTML(); return; }
  if(g.view === 'resume' && g.game){ card.innerHTML = head(g) + resumeHTML(g); return; }
  if(g.view === 'start' || g.view === 'names' || !g.game){ card.innerHTML = head(g) + setupHTML(g.S, false); return; }
  card.innerHTML = head(g) + playHTML(g);
  layout();
}

/* set-up screens (the board when single screen; the teacher screen's dialog when dual) */
function seg(attr, opts, cur){ return `<span class="sp-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</span>`; }
function setupHTML(S, consoleSide){
  if(S.step === 'names') return namesHTML(S, consoleSide);
  const last = S.last;
  const when = last && last.at ? new Date(last.at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
  return `<div class="sp-set">
      <div class="sp-sr"><span>Players</span>${seg('mode', [[1, icon('user') + '1 player'], [2, icon('users') + '2 players']], S.mode)}</div>
      <div class="sp-sr"><span>Rounds</span>${seg('rounds', ROUNDS.map(n => [n, n]), S.rounds)}</div>
      <div class="sp-sr"><span>Speed</span>${seg('speed', SPEED_KEYS.map(k => [k, SPEEDS[k].label]), S.speed)}</div>
    </div>
    <div class="sp-start">
      <button class="gc-opt sp-opt" data-k="choose">
        <span class="gc-opt-t">${icon('hand')}Choose a sentence builder</span>
        <span class="gc-opt-d">Every word in the builder is used. One chunk sits in the middle; pupils splat the bubble that matches it.</span>
      </button>
      ${last ? `<button class="gc-opt sp-opt" data-k="again">
        <span class="gc-opt-t">${icon('hist')}Last time</span>
        <span class="gc-opt-d"><b>${esc(last.title || 'Sentence builder')}</b>${when ? '<br>' + esc(when) : ''}</span>
      </button>` : ''}
    </div>
    <div class="ap-foot gc-foot"><div class="ap-sum">${S.mode === 2 ? 'Next: choose the two players.' : 'One pupil at the front splats the right bubble.'}${consoleSide ? ' Pupils see “Getting ready…” until you start.' : ''}</div>
    ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}</div>`;
}
function namesHTML(S, consoleSide){
  const n = S.pupils.length;
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const who = i => { const p = S.pupils.find(x => x.id === S.sel[i]); return p ? `<b style="color:${P_COL[i]}">${esc(p.name)}</b>` : `<i>Player ${i + 1}</i>`; };
  return `<div class="sp-nh">Who's playing? <span>Tap two names.</span></div>
    <div class="sp-names" style="--cols:${cols}">${S.pupils.map(p => {
      const k = S.sel.indexOf(p.id);
      return `<button class="ap-p sp-p ${p.abs ? 'abs' : ''} ${k >= 0 ? 'sel s' + k : ''}" data-pp="${esc(p.id)}"><span class="nm">${esc(p.name)}</span>${k >= 0 ? `<span class="sp-pn">${k + 1}</span>` : ''}</button>`;
    }).join('')}</div>
    <div class="ap-foot gc-foot">
      <button class="clk-btn lg" data-k="back">${icon('left')}Back</button>
      <div class="ap-sum sp-vs">${who(0)} vs ${who(1)}</div>
      ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}
      <button class="clk-btn lg gc-go sp-gob" data-k="go" ${S.sel.length === 2 ? '' : 'disabled'}>Start${icon('right')}</button>
    </div>`;
}
function resumeHTML(g){
  const gm = g.game;
  return `<div class="sp-start sp-res">
    <button class="gc-opt sp-opt" data-b="resume">
      <span class="gc-opt-t">${icon('right')}Resume</span>
      <span class="gc-opt-d">Carry on from round ${Math.min(gm.r + 1, gm.queue.length)} of ${gm.queue.length}${gm.title ? ' · <b>' + esc(gm.title) + '</b>' : ''}${gm.players ? `<br>${esc(gm.players[0].name)} ${gm.scores[0]} – ${gm.scores[1]} ${esc(gm.players[1].name)}` : ''}.</span>
    </button>
    <button class="gc-opt sp-opt" data-b="restart">
      <span class="gc-opt-t">${icon('reset')}Start again</span>
      <span class="gc-opt-d">Back to the beginning: players, rounds, speed and the sentence builder.</span>
    </button>
  </div>
  <div class="ap-foot gc-foot"><div class="ap-sum">This lesson already has a game of Splat.</div></div>`;
}
function waitHTML(){
  return `<div class="sp-wait"><div class="sp-wblob">${splatSVG('#9B4DCA')}</div>
    <div class="sp-wsay">Getting ready<i>.</i><i>.</i><i>.</i></div>
    <div class="sp-wsub">Your teacher is setting up the game.</div>
    <button class="clk-btn" data-b="waitcancel">Cancel</button></div>`;
}

/* playing */
function playHTML(g){
  const gm = g.game, cur = gm.cur, L = lname(gm.lang);
  const midTxt = cur ? (g.mid === 'en' ? cur.ans.en : cur.ans.tl) : '';
  const find = g.mid === 'en' ? L : 'English';
  const pill = i => gm.players ? `<div class="sp-pl s${i}" style="--pc:${P_COL[i]}"><span class="nm">${esc(gm.players[i].name)}</span><b>${gm.scores[i]}</b></div>` : '';
  const done = cur && cur.ph === 'done';
  return `<div class="sp-main">
      <div class="sp-field">
        <div class="sp-stains">${(gm.stains || []).map(st => stainHTML(st, false)).join('')}</div>
        ${cur ? `<div class="sp-mid"><small>Splat the ${esc(find)}</small><div class="sp-mt">${esc(midTxt)}</div></div>` : ''}
        <div class="sp-bs"></div>
        ${askHTML(g)}
        ${gm.fin ? finHTML(g) : ''}
      </div>
    </div>
    <div class="ap-foot gc-foot sp-foot">
      ${pill(0)}
      <div class="grow"></div>
      <div class="sp-round">Round <b>${Math.min(gm.r + 1, gm.queue.length)}</b> of ${gm.queue.length}</div>
      ${!gm.players ? `<button class="clk-btn lg gc-go sp-next ${done ? '' : 'hid'}" data-b="next">${gm.r + 1 >= gm.queue.length ? 'Finish' : 'Next'}${icon('right')}</button>` : ''}
      <div class="grow"></div>
      ${pill(1)}
    </div>`;
}
function askHTML(g){
  const gm = g.game, cur = gm.cur;
  if(!cur || !gm.players || (cur.ph !== 'ask-ok' && cur.ph !== 'ask-bad')) return '';
  const ok = cur.ph === 'ask-ok';
  return `<div class="sp-ask"><div class="sp-ask-c ${ok ? 'ok' : 'bad'}">
    <div class="sp-ask-t">${ok ? 'Who got it?' : 'Who pressed it?'}</div>
    <div class="sp-ask-s">${ok ? 'They get the point.' : 'The other player gets the point.'}</div>
    <div class="sp-ask-b">${gm.players.map((p, i) => `<button class="sp-pb" style="--pc:${P_COL[i]}" data-who="${i}">${esc(p.name)}</button>`).join('')}</div>
    <button class="clk-btn" data-who="-1">No one</button>
  </div></div>`;
}
function finHTML(g){
  const gm = g.game;
  let t, s = '', award = '';
  if(gm.players){
    const [a, b] = gm.scores, cat = winnerCat(), can = !!(cat && window.SVPoints && SVPoints.award && gm.players.every(p => p.pid));
    const draw = a === b, w = a > b ? 0 : 1;
    t = draw ? 'It\'s a draw!' : `${esc(gm.players[w].name)} wins!`;
    s = `<span style="color:${P_COL[0]}">${esc(gm.players[0].name)} ${a}</span> – <span style="color:${P_COL[1]}">${b} ${esc(gm.players[1].name)}</span>`;
    if(can) award = gm.awarded
      ? `<div class="sp-awd">${icon('check')}${esc(cat.name)} awarded</div>`
      : `<button class="clk-btn lg sp-awb" data-b="award">${icon('star')}${draw ? 'Award both' : 'Award'} ${esc(cat.name)}</button>`;
  } else { t = 'All done!'; s = `${gm.queue.length} rounds`; }
  return `<div class="sp-fin"><div class="sp-fin-c">
    <div class="sp-fin-i">${icon('trophy', 'ico sp-tro')}</div>
    <div class="sp-fin-t">${t}</div>
    <div class="sp-fin-s">${s}</div>
    ${award}
    <div class="sp-fin-b"><button class="clk-btn lg" data-b="again">${icon('reset')}Play again</button><button class="clk-btn lg gc-go" data-b="new2">${icon('new')}New game</button></div>
  </div></div>`;
}

/* ---------------- layout + movement ---------------- */
// Bubble size for a text at font size f: the smallest circle that holds it on a few lines.
function sizeFor(meas, text, f){
  meas.style.fontSize = f + 'px';
  meas.textContent = text;
  let D = f * 4.6; // even one short word gets a bubble big enough to hit
  for(let k = 0; k < 40; k++){
    meas.style.width = (D * 0.8) + 'px';
    if(meas.scrollWidth <= D * 0.8 + 1 && meas.offsetHeight <= D * 0.64) return D;
    D += f * 0.3;
  }
  return D;
}
function layout(){
  if(!big) return;
  const g = game(); if(!g || g.view !== 'play' || !g.game) return;
  const gm = g.game, cur = gm.cur;
  const field = $('.sp-field', big.card), bs = $('.sp-bs', big.card); if(!field || !bs) return;
  stopLoop();
  const W = field.clientWidth, Hh = field.clientHeight;
  field.style.setProperty('--fh', Hh + 'px'); // stains are sized from the field height
  RT = { field, W, H:Hh, els:new Map(), raf:0, t:0 };
  if(!cur) return;
  // middle card: big, but no more than about half the width
  const mid = $('.sp-mid', field), mt = $('.sp-mt', mid);
  let mf = Math.max(22, Math.min(100, Hh * 0.1));
  mid.style.maxWidth = (W * 0.46) + 'px';
  for(let k = 0; k < 20 && mf > 18; k++){
    mt.style.fontSize = mf + 'px';
    if(mid.offsetHeight <= Hh * 0.3 && mt.scrollWidth <= mt.clientWidth + 1) break;
    mf *= 0.92;
  }
  const mr = mid.getBoundingClientRect(), fr = field.getBoundingClientRect();
  RT.mid = { l:mr.left - fr.left, t:mr.top - fr.top, r:mr.right - fr.left, b:mr.bottom - fr.top };
  // bubble sizes: shrink the text until they all fit comfortably round the middle
  const meas = el('div', 'sp-meas'); field.appendChild(meas);
  const live = cur.bubbles.filter(b => b.st !== 'gone' && b.st !== 'pop'); // popped ones have gone for good
  const txt = b => g.mid === 'en' ? b.it.tl : b.it.en;
  const freeA = W * Hh - (RT.mid.r - RT.mid.l) * (RT.mid.b - RT.mid.t);
  let f = Math.max(16, Math.min(46, Hh * 0.05)), sizes;
  for(let k = 0; k < 14; k++){
    sizes = live.map(b => sizeFor(meas, txt(b), f));
    const area = sizes.reduce((s, D) => s + Math.PI * D * D / 4, 0), maxD = Math.max(...sizes);
    if(area <= freeA * 0.42 && maxD <= Hh * 0.36) break;
    f *= 0.92;
  }
  meas.remove();
  RT.f = f;
  // place: keep where they were (scaled to a new field size), else find a free spot
  const sx = cur.W ? W / cur.W : 1, sy = cur.H ? Hh / cur.H : 1;
  const sp = SPEEDS[g.speed].v * (Hh / 800);
  const placed = [];
  live.forEach((b, i) => {
    const r = sizes[i] / 2;
    if(b.x != null){ b.x *= sx; b.y *= sy; }
    else {
      let best = null;
      for(let k = 0; k < 400; k++){
        const x = r + Math.random() * (W - 2 * r), y = r + Math.random() * (Hh - 2 * r);
        if(hitsMid(x, y, r + 10)) continue;
        if(placed.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 8)) continue;
        best = { x, y }; break;
      }
      if(!best){ // crowded: anywhere off the middle card
        for(let k = 0; k < 200 && !best; k++){ const x = r + Math.random() * (W - 2 * r), y = r + Math.random() * (Hh - 2 * r); if(!hitsMid(x, y, r)) best = { x, y }; }
        best = best || { x:r, y:r };
      }
      b.x = best.x; b.y = best.y;
      const a = Math.random() * Math.PI * 2; b.vx = Math.cos(a); b.vy = Math.sin(a); b.k = 0.8 + Math.random() * 0.4;
    }
    placed.push({ x:b.x, y:b.y, r });
    const e = el('div', 'sp-b' + (b.ok ? ' sp-ans' : '') + (b.st === 'ok' ? ' ok' : b.st === 'bad' ? ' bad' : '') + (b.fade ? ' fade' : '') + (b.fresh ? ' in' : ''));
    e.dataset.bid = b.id;
    e.style.cssText = `width:${2 * r}px;height:${2 * r}px;--f:${f}px;--c:${b.col}`;
    e.innerHTML = `<div class="sp-bi"></div>${b.sp || ''}<span class="sp-bt">${esc(txt(b))}</span>${b.st === 'ok' ? `<i class="sp-mk">${icon('check')}</i>` : b.st === 'bad' ? `<i class="sp-mk">${icon('x')}</i>` : ''}`;
    bs.appendChild(e);
    RT.els.set(b.id, { el:e, r, b });
    b.fresh = false;
  });
  cur.W = W; cur.H = Hh; RT.sp = sp;
  draw();
  if(cur.ph === 'play') startLoop();
}
function hitsMid(x, y, r){ const m = RT.mid; if(!m) return false; const cx = Math.max(m.l, Math.min(x, m.r)), cy = Math.max(m.t, Math.min(y, m.b)); return Math.hypot(x - cx, y - cy) < r; }
function draw(){ if(!RT) return; for(const { el:e, r, b } of RT.els.values()) e.style.transform = `translate(${(b.x - r).toFixed(1)}px,${(b.y - r).toFixed(1)}px)`; }
function startLoop(){ if(!RT || RT.raf) return; RT.t = performance.now(); RT.raf = requestAnimationFrame(step); }
function stopLoop(){ if(RT && RT.raf){ cancelAnimationFrame(RT.raf); RT.raf = 0; } }
function step(now){
  if(!RT){ return; }
  RT.raf = 0;
  const g = G, cur = g && g.game && g.game.cur;
  if(!big || !cur || cur.ph !== 'play'){ return; }
  const dt = Math.min(0.05, (now - RT.t) / 1000); RT.t = now;
  const { W, H:Hh, mid:m } = RT;
  const movers = [...RT.els.values()].filter(o => !o.b.st);
  for(const o of movers){
    const b = o.b, v = RT.sp * b.k;
    b.x += b.vx * v * dt; b.y += b.vy * v * dt;
    // walls
    if(b.x < o.r){ b.x = o.r; b.vx = Math.abs(b.vx); } else if(b.x > W - o.r){ b.x = W - o.r; b.vx = -Math.abs(b.vx); }
    if(b.y < o.r){ b.y = o.r; b.vy = Math.abs(b.vy); } else if(b.y > Hh - o.r){ b.y = Hh - o.r; b.vy = -Math.abs(b.vy); }
    // middle card
    if(m){
      const cx = Math.max(m.l, Math.min(b.x, m.r)), cy = Math.max(m.t, Math.min(b.y, m.b));
      let dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if(d < o.r){
        if(d < 0.01){ // centre inside the card: push out the nearest side
          const opts = [[b.x - m.l, -1, 0], [m.r - b.x, 1, 0], [b.y - m.t, 0, -1], [m.b - b.y, 0, 1]].sort((p, q) => p[0] - q[0]);
          dx = opts[0][1]; dy = opts[0][2]; d = 1;
          b.x = dx < 0 ? m.l - o.r : dx > 0 ? m.r + o.r : b.x; b.y = dy < 0 ? m.t - o.r : dy > 0 ? m.b + o.r : b.y;
        } else { const nx = dx / d, ny = dy / d; b.x = cx + nx * o.r; b.y = cy + ny * o.r; dx = nx; dy = ny; }
        const dot = b.vx * dx + b.vy * dy;
        if(dot < 0){ b.vx -= 2 * dot * dx; b.vy -= 2 * dot * dy; }
      }
    }
  }
  // each other (equal weights: swap the speed along the line between them)
  for(let i = 0; i < movers.length; i++) for(let j = i + 1; j < movers.length; j++){
    const A = movers[i], B = movers[j], a = A.b, b = B.b;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = A.r + B.r;
    if(d >= min || d < 0.01) continue;
    const nx = dx / d, ny = dy / d, push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
    if(va - vb > 0){ a.vx += (vb - va) * nx; a.vy += (vb - va) * ny; b.vx += (va - vb) * nx; b.vy += (va - vb) * ny; }
  }
  // keep each bubble's own steady speed (directions only change)
  for(const o of movers){ const b = o.b, s = Math.hypot(b.vx, b.vy) || 1; b.vx /= s; b.vy /= s; }
  draw();
  RT.raf = requestAnimationFrame(step);
}

/* ---------------- game ---------------- */
function startGame(r){
  const g = game(); if(!g || !r || !r.doc) return;
  const pool = poolOf(r.doc);
  if(pool.length < 4){ toast('This sentence builder has too few words for Splat.', true); return; }
  const rounds = ROUNDS.includes(+r.rounds) ? +r.rounds : 10;
  if(SPEEDS[r.speed]) g.speed = r.speed;
  const title = window.SBCore && SBCore.displayTitle ? SBCore.displayTitle(r.doc) : (r.doc.title || '');
  g.game = { doc:r.doc, loc:r.loc || null, title, lang:r.doc.lang || 'fr', pool, rounds, mode:r.players ? 2 : 1,
    players:r.players || null, scores:[0, 0], queue:[], r:0, cur:null, fin:false, awarded:false, stains:[] };
  dealQueue(g.game);
  g.view = 'play'; g.arm = false;
  const l = lesson();
  if(l){ l.spLast = { loc:r.loc || null, title, lang:g.game.lang, mode:g.game.mode, rounds, speed:g.speed, at:Date.now() }; H().save(); }
  newRound(g);
  showBig();
}
function dealQueue(gm){
  gm.queue = shuffle(gm.pool.slice()).slice(0, Math.min(gm.rounds, gm.pool.length));
  if(gm.queue.length < gm.rounds) toast(`This builder has ${gm.pool.length} chunks, so ${gm.queue.length} rounds.`);
}
function newRound(g){
  const gm = g.game; clearTimeout(gm.cur && gm.cur.tm);
  const ans = gm.queue[gm.r];
  if(!ans){ gm.cur = null; return; }
  const cols = shuffle(B_COL.slice());
  gm.cur = { ans, ph:'play', bubbles:optionsFor(gm.pool, ans).map((o, i) => ({ id:uid(), it:o.it, ok:o.ok, st:'', col:cols[i % cols.length], sp:'', x:null, y:null, vx:0, vy:0, k:1, fresh:true })), W:0, H:0 };
}
function playAgain(){
  const g = game(); if(!g || !g.game) return;
  const gm = g.game; clearTimeout(gm.cur && gm.cur.tm);
  Object.assign(gm, { scores:[0, 0], r:0, fin:false, awarded:false, stains:[] });
  dealQueue(gm); newRound(g); paint();
}
function nextRound(){
  const g = game(), gm = g && g.game; if(!gm) return;
  clearTimeout(gm.cur && gm.cur.tm);
  if(gm.r + 1 >= gm.queue.length){ gm.cur && (gm.cur.ph = 'done'); gm.fin = true; paint(); return; }
  gm.r++; newRound(g); paint();
}
// A tap on a bubble.
function splat(id){
  const g = game(), gm = g && g.game, cur = gm && gm.cur;
  if(!cur || cur.ph !== 'play' || gm.fin) return;
  const b = cur.bubbles.find(x => x.id === id); if(!b || b.st) return;
  if(b.ok){
    b.st = 'ok'; b.sp = splatSVG(OK_COL);
    cur.ph = 'okwait';
    setBubble(b);
    stopLoop();
    // the others pop
    cur.bubbles.filter(x => !x.st).forEach((x, k) => { x.st = 'pop'; setTimeout(() => { const o = RT && RT.els.get(x.id); if(o) o.el.classList.add('pop'); }, 350 + k * 70); });
    cur.tm = setTimeout(() => {
      if(!G || G.game !== gm || gm.cur !== cur || cur.ph !== 'okwait') return;
      cur.ph = gm.players ? 'ask-ok' : 'done';
      if(gm.players) paint(); else { const n = big && $('.sp-next', big.card); if(n) n.classList.remove('hid'); }
    }, gm.players ? ASK_DELAY : 900);
  } else {
    b.st = 'bad'; b.sp = splatSVG(BAD_COL);
    setBubble(b);
    if(gm.players){
      cur.ph = 'badwait'; cur.bad = b.id; stopLoop();
      cur.tm = setTimeout(() => { if(G && G.game === gm && gm.cur === cur && cur.ph === 'badwait'){ cur.ph = 'ask-bad'; paint(); } }, ASK_DELAY);
    } else fadeOut(b, 1300);
  }
}
function setBubble(b){
  const o = RT && RT.els.get(b.id); if(!o) return;
  const e = o.el;
  e.classList.add(b.st);
  e.insertAdjacentHTML('beforeend', `<i class="sp-mk">${icon(b.st === 'ok' ? 'check' : 'x')}</i>`);
  e.querySelector('.sp-bi').insertAdjacentHTML('afterend', b.sp);
  e.insertAdjacentHTML('beforeend', sprayHTML(b.st === 'ok' ? OK_COL : BAD_COL));
  const sp = e.querySelector('.sp-spray'); setTimeout(() => sp && sp.remove(), 900);
  const gm = G && G.game; if(gm) addStain(gm, b, o.r);
}
function fadeOut(b, after){
  setTimeout(() => {
    const o = RT && RT.els.get(b.id); if(o) o.el.classList.add('fade');
    b.fade = true;
    setTimeout(() => { b.st = 'gone'; const o2 = RT && RT.els.get(b.id); if(o2){ o2.el.remove(); RT.els.delete(b.id); } }, 650);
  }, after);
}
// Who got it / who pressed it. i = player index, -1 = no one.
function answer(i){
  const g = game(), gm = g && g.game, cur = gm && gm.cur; if(!cur) return;
  if(cur.ph === 'ask-ok'){
    if(i >= 0) gm.scores[i]++;
    cur.ph = 'done';
    nextRound();
  } else if(cur.ph === 'ask-bad'){
    if(i >= 0) gm.scores[1 - i]++;
    cur.ph = 'play';
    const b = cur.bubbles.find(x => x.id === cur.bad);
    paint();
    if(b) fadeOut(b, 200);
  }
}
function award(){
  const g = game(), gm = g && g.game; if(!gm || !gm.players || gm.awarded) return;
  const cat = winnerCat(), l = lesson(); if(!cat || !l) return;
  const [a, b] = gm.scores, who = a === b ? [0, 1] : [a > b ? 0 : 1];
  let n = 0;
  for(const w of who) if(SVPoints.award(l, gm.players[w].pid, cat.id)) n++;
  if(n){ gm.awarded = true; toast(`${cat.name}: ${who.map(w => gm.players[w].name).join(' and ')}`); }
  else toast('Couldn\'t award the point (no class list for this lesson?).', true);
  paint();
}

/* ---------------- input ---------------- */
// Bubbles react on pointerdown (quick on a touch panel); the click that follows is ignored.
function onDown(e){
  const t = e.target.closest && e.target.closest('.sp-b'); if(!t) return;
  e.preventDefault();
  splat(t.dataset.bid);
}
function onClick(e){
  const g = game(); if(!g || !big) return;
  if(e.target.closest('.sp-b')) { const t = e.target.closest('.sp-b'); splat(t.dataset.bid); return; } // replayed clicks (teacher screen)
  const t = e.target.closest('button'); if(!t || t.disabled) return;
  const a = t.dataset.b;
  if(a !== 'new' && g.arm){ g.arm = false; clearTimeout(big.armT); }
  if(t.dataset.mid){ if(g.mid !== t.dataset.mid){ g.mid = t.dataset.mid; paint(); } return; }
  if(t.dataset.who != null){ answer(+t.dataset.who); return; }
  if(g.view === 'start' || g.view === 'names'){ setupClick(g.S, t, false, { repaint:paint, hideCard:() => { if(big) big.back.style.display = 'none'; }, showCard:() => { if(big) big.back.style.display = ''; }, done:r => startGame(r), cancel:hide }); return; }
  switch(a){
    case 'close': hide(); return;
    case 'waitcancel': cancelWait(g, true); return;
    case 'resume': g.view = 'play'; resumeCur(g); paint(); return;
    case 'restart': newGame(); return;
    case 'speed': {
      g.speed = SPEED_KEYS[(SPEED_KEYS.indexOf(g.speed) + 1) % SPEED_KEYS.length];
      const l = lesson(); if(l && l.spLast){ l.spLast.speed = g.speed; H().save(); }
      const btn = t; btn.innerHTML = icon('bolt') + SPEEDS[g.speed].label;
      if(RT) RT.sp = SPEEDS[g.speed].v * (RT.H / 800);
      return;
    }
    case 'new':
      clearTimeout(big.armT);
      if(g.arm){ g.arm = false; newGame(); }
      else { g.arm = true; paint(); big.armT = setTimeout(() => { const h = game(); if(h && h.arm){ h.arm = false; paint(); } }, 3000); }
      return;
    case 'new2': newGame(); return;
    case 'again': playAgain(); return;
    case 'next': nextRound(); return;
    case 'award': award(); return;
  }
}
// Reopened mid-round: a splat that was waiting goes straight to its pop-up.
function resumeCur(g){
  const cur = g.game && g.game.cur; if(!cur) return;
  if(cur.ph === 'okwait') cur.ph = g.game.players ? 'ask-ok' : 'done';
  if(cur.ph === 'badwait') cur.ph = 'ask-bad';
}

/* set-up clicks (shared by the board and the teacher screen) */
// cb = { repaint, hideCard, showCard, done(result), cancel }
function setupClick(S, t, consoleSide, cb){
  if(t.dataset.mode){ S.mode = +t.dataset.mode; cb.repaint(); return; }
  if(t.dataset.rounds){ S.rounds = +t.dataset.rounds; cb.repaint(); return; }
  if(t.dataset.speed){ S.speed = t.dataset.speed; cb.repaint(); return; }
  if(t.dataset.pp){
    const id = t.dataset.pp, k = S.sel.indexOf(id);
    if(k >= 0) S.sel.splice(k, 1); else if(S.sel.length < 2) S.sel.push(id); else S.sel[1] = id;
    cb.repaint(); return;
  }
  const k = t.dataset.k, b = t.dataset.b;
  if(b === 'close' || k === 'cancel'){ cb.cancel(); return; }
  if(k === 'back'){ S.step = 'start'; S.sel = []; cb.repaint(); return; }
  if(k === 'go'){ if(S.sel.length === 2) cb.done(resultOf(S)); return; }
  const picked = x => {
    cb.showCard();
    if(poolOf(x.doc).length < 4){ toast('This sentence builder has too few words for Splat.', true); return; }
    S.pick = x;
    if(S.mode === 2){
      if(!S.pupils.length){ toast('No class list for this lesson: playing as Player 1 and Player 2.'); cb.done(resultOf(S)); return; }
      S.step = 'names'; S.sel = []; cb.repaint(); return;
    }
    cb.done(resultOf(S));
  };
  const choose = () => { cb.hideCard(); SVSentence.choose({ year:S.year, onPick:picked, onCancel:() => cb.showCard() }); };
  if(k === 'choose'){ choose(); return; }
  if(k === 'again' && S.last){
    findBuilder(S.last).then(x => {
      if(x) picked(x);
      else { toast(`“${S.last.title || 'The builder'}” isn't in the Sentence Builders folder any more: choose one`, true); choose(); }
    }).catch(e => toast("Couldn't read the Sentence Builders folder: " + e.message, true));
  }
}
function resultOf(S){
  let players = null;
  if(S.mode === 2){
    players = S.sel.length === 2 ? S.sel.map(id => { const p = S.pupils.find(x => x.id === id); return { pid:id, name:p ? p.name : '?' }; })
      : [{ pid:null, name:'Player 1' }, { pid:null, name:'Player 2' }];
  }
  return { doc:S.pick.doc, loc:S.pick.loc, rounds:S.rounds, speed:S.speed, players };
}
async function findBuilder(last){
  const list = await SVSentence.list(), loc = last.loc || {};
  return list.find(x => x.loc.year === loc.year && x.loc.term === loc.term && x.loc.name === loc.name)
    || list.find(x => window.SBCore.displayTitle(x.doc) === last.title && x.doc.lang === last.lang) || null;
}

/* ---------------- dual screen ---------------- */
async function askTeacher(g){
  const tok = g.tok = uid(), S = g.S;
  let r;
  try{ r = await SVDual.link.spSetup({ year:S.year, last:S.last, pupils:S.pupils, mode:S.mode, rounds:S.rounds, speed:S.speed }); }
  catch(e){ if(G === g && g.tok === tok){ g.tok = null; toast((e && e.message) || 'The teacher screen did not answer.'); afterWait(g); } return; }
  if(G !== g || g.tok !== tok) return;
  g.tok = null;
  if(r && r.doc) startGame(r); else afterWait(g);
}
function afterWait(g){ if(g.game){ g.view = 'play'; paint(); } else { g.view = 'start'; g.size = 'closed'; closeBig(); } }
function cancelWait(g, tell){
  if(!g || g.view !== 'wait') return;
  g.tok = null;
  if(tell && window.SVDual && SVDual.link && SVDual.link.spSetupEnd) SVDual.link.spSetupEnd();
  afterWait(g);
}
// Teacher console: rpc 'spSetup' { year, last, pupils, mode, rounds, speed } → { doc, loc, rounds, speed, players } or null.
let CS = null; // { back, card, res, S }
function setupOnConsole(req){
  cancelSetup();
  return new Promise(res => {
    const back = el('div', 'ap-back sp-cback'), card = el('div', 'ap sp sp-c');
    back.appendChild(card); document.body.appendChild(back);
    req = req || {};
    const S = { step:'start', mode:req.mode === 2 ? 2 : 1, rounds:ROUNDS.includes(req.rounds) ? req.rounds : 10, speed:SPEEDS[req.speed] ? req.speed : 'med',
      pick:null, sel:[], pupils:Array.isArray(req.pupils) ? req.pupils : [], last:req.last && req.last.loc ? req.last : null, year:req.year };
    CS = { back, card, res, S };
    const paintC = () => {
      if(!CS) return;
      card.innerHTML = `<div class="ap-head gc-head"><div class="ap-title">${icon('tool', 'ico sp-ic')}Splat</div><span class="ap-chip">Set up on this screen</span><div class="grow"></div>
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
  const g = game(); if(!g) return;
  const k = e.key;
  if([...FWD, ...BACK, 'Home', 'End'].includes(k)) e.preventDefault();
  if(k === 'Escape'){ e.preventDefault(); hide(); return; }
  if(g.view === 'resume' && g.game){ if(FWD.includes(k)){ g.view = 'play'; resumeCur(g); paint(); } return; }
  if(g.view !== 'play' || !g.game) return;
  const gm = g.game, cur = gm.cur;
  if(FWD.includes(k) && !gm.fin && cur && cur.ph === 'done' && !gm.players) nextRound();
}, true);

/* ---------------- lesson changes ---------------- */
function clearAll(){ if(G && G.view === 'wait') cancelWait(G, true); closeBig(); G = null; }
window.addEventListener('sv:present', e => {
  if(!(e.detail && e.detail.resume)){ clearAll(); return; }
  const g = game(); if(g && g.size === 'big' && g.game){ g.view = 'play'; resumeCur(g); showBig(); }
});
window.addEventListener('sv:leave', e => {
  if(!(e.detail && e.detail.keep)){ clearAll(); return; }
  if(G && G.view === 'wait') cancelWait(G, true);
  if(G && G.game) resumeCur(G);
  if(big){ stopTimers(); big.back.remove(); big = null; RT = null; }
});

/* ---------------- styles ---------------- */
const CSS = `
.sp-back{z-index:31}
.ap.sp{position:absolute;border-radius:var(--stage-r);padding:14px 18px 14px}
.ap .ico.sp-ic{color:#B18CFF;width:28px;height:28px}
.sp .ap-title{white-space:nowrap;flex:none}
.sp-chip{max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-seg{display:flex;gap:6px;background:var(--dark-2);border-radius:14px;padding:5px}
.sp-seg button{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 16px;border-radius:10px;border:0;background:transparent;color:var(--dark-text);font:600 17px var(--font);cursor:pointer;touch-action:manipulation;white-space:nowrap}
.sp-seg button .ico{width:20px;height:20px}
.sp-seg button.on{background:#B18CFF;color:#111114}
.sp-tog{display:flex;align-items:center;gap:10px;font:600 16px var(--font);color:var(--dark-text-2)}
.sp .clk-btn.gc-go{background:var(--ok);color:#fff}
.sp .clk-btn.gc-go:not(:disabled):active{background:#178049}
.sp .clk-btn.gc-arm{background:var(--danger);color:#fff}
.sp .clk-btn:disabled{opacity:.4;cursor:default}
/* set-up */
.sp-set{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 14px;flex:none}
.sp-sr{display:flex;align-items:center;gap:12px}
.sp-sr>span:first-child{font:600 18px var(--font);color:var(--dark-text-2)}
.sp-start{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;align-items:stretch}
.sp-opt{justify-content:center;overflow:hidden}
.sp-opt:active{border-color:var(--accent)}
.sp-opt .gc-opt-t .ico{color:#B18CFF}
.sp-opt .gc-opt-d b{color:var(--dark-text)}
.sp-res{grid-template-columns:1fr 1fr}
.sp-res .sp-opt{align-items:flex-start}
.sp-nh{flex:none;font:700 26px/1.2 var(--font);margin:0 0 12px}
.sp-nh span{font-weight:500;font-size:18px;color:var(--dark-text-2);margin-left:10px}
.sp-names{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-auto-rows:minmax(48px,1fr);gap:8px;overflow:auto;padding:2px}
.sp-p{--fs:clamp(17px,2.6vh,26px);justify-content:center;text-align:center}
.sp-p.sel{border-width:3px}
.sp-p.s0{border-color:${P_COL[0]};background:color-mix(in srgb,${P_COL[0]} 26%,var(--dark-2))}
.sp-p.s1{border-color:${P_COL[1]};background:color-mix(in srgb,${P_COL[1]} 26%,var(--dark-2))}
.sp-p.abs.sel{opacity:.8}
.sp-pn{position:absolute;right:8px;top:6px;font:700 13px/1 var(--font);opacity:.8}
.sp-vs{text-align:center;font-size:22px}
.sp-vs i{font-style:normal;color:var(--dark-text-2)}
.sp-gob{min-width:180px}
.sp-cback{z-index:100}
.ap.sp.sp-c{position:relative;border-radius:24px;width:min(1240px,94vw);height:min(700px,90vh)}
/* waiting */
.sp-wait{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
.sp-wblob{width:clamp(110px,18vh,190px);aspect-ratio:1;animation:sp-wob 1.6s ease-in-out infinite}
.sp-wblob .sp-svg{width:100%;height:100%}
@keyframes sp-wob{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.08) rotate(8deg)}}
.sp-wsay{font:700 clamp(30px,5vh,52px)/1.1 var(--font)}
.sp-wsay i{font-style:normal;animation:sp-dot 1.4s infinite}
.sp-wsay i:nth-child(2){animation-delay:.2s}.sp-wsay i:nth-child(3){animation-delay:.4s}
@keyframes sp-dot{0%,60%,100%{opacity:.2}30%{opacity:1}}
.sp-wsub{font-size:22px;color:var(--dark-text-2)}
/* playing */
.sp-main{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.sp-field{flex:1;min-height:0;position:relative;border-radius:22px;overflow:hidden;touch-action:none;
  background:radial-gradient(circle at 12% 18%,rgba(155,77,202,.13) 0,rgba(155,77,202,0) 38%),radial-gradient(circle at 88% 84%,rgba(47,127,216,.12) 0,rgba(47,127,216,0) 40%),radial-gradient(circle at 86% 14%,rgba(217,70,122,.08) 0,rgba(217,70,122,0) 32%),radial-gradient(ellipse at 50% 45%,#272733 0,var(--dark-2) 72%)}
.sp-stains{position:absolute;inset:0;z-index:0;pointer-events:none}
.sp-st{position:absolute;aspect-ratio:1;height:auto;opacity:.17;transform:translate(-50%,-50%) rotate(var(--r));pointer-events:none}
.sp-st.new{animation:sp-stain 1.1s cubic-bezier(.2,1.2,.4,1) both}
@keyframes sp-stain{0%{transform:translate(-50%,-50%) rotate(var(--r)) scale(.25);opacity:0}30%{opacity:.5}100%{transform:translate(-50%,-50%) rotate(var(--r)) scale(1);opacity:.17}}
.sp-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1;background:linear-gradient(#fff,#F4F2FA);color:#111114;border-radius:26px;padding:.4em 1.1em .55em;text-align:center;box-shadow:0 0 0 7px rgba(255,255,255,.07),0 14px 44px rgba(0,0,0,.5);box-sizing:border-box}
.sp-mid small{display:block;font:700 clamp(13px,1.8vh,18px)/1.3 var(--font);letter-spacing:.08em;text-transform:uppercase;color:#7A7A86;margin-bottom:.15em}
.sp-mt{font:800 60px/1.15 var(--font);overflow-wrap:break-word}
.sp-bs{position:absolute;inset:0;z-index:2;pointer-events:none}
.sp-meas{position:absolute;left:-9999px;top:0;visibility:hidden;font:700 20px/1.12 var(--font);text-align:center;overflow-wrap:normal}
.sp-b{position:absolute;left:0;top:0;display:grid;place-items:center;pointer-events:auto;cursor:pointer;touch-action:none;will-change:transform;-webkit-tap-highlight-color:transparent}
.sp-b>*{grid-area:1/1}
.sp-bi{width:100%;height:100%;border-radius:50%;position:relative;
  background:radial-gradient(ellipse 42% 26% at 38% 20%,rgba(255,255,255,.6) 0,rgba(255,255,255,.12) 70%,rgba(255,255,255,0) 100%),radial-gradient(circle at 50% 36%,color-mix(in srgb,var(--c) 88%,#fff) 0,var(--c) 50%,color-mix(in srgb,var(--c) 74%,#000) 100%);
  box-shadow:0 10px 26px color-mix(in srgb,var(--c) 40%,transparent),0 3px 8px rgba(0,0,0,.35),inset 0 -7px 14px color-mix(in srgb,var(--c) 70%,#000),inset 0 0 0 2px rgba(255,255,255,.2)}
.sp-bi::after{content:'';position:absolute;right:20%;bottom:16%;width:14%;height:9%;border-radius:50%;background:rgba(255,255,255,.28);transform:rotate(-35deg)}
.sp-b.in .sp-bi,.sp-b.in .sp-bt{animation:sp-in .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes sp-in{0%{transform:scale(0)}100%{transform:scale(1)}}
.sp-bt{width:80%;text-align:center;color:#fff;font:700 var(--f)/1.12 var(--font);text-shadow:0 1px 2px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.25);overflow-wrap:normal;z-index:1;pointer-events:none}
.sp-svg{width:150%;height:150%;margin:-25%;pointer-events:none;animation:sp-hit .38s cubic-bezier(.2,1.7,.4,1) both}
@keyframes sp-hit{0%{transform:scale(.3) rotate(-20deg);opacity:.4}100%{transform:scale(1) rotate(0);opacity:1}}
.sp-b.ok,.sp-b.bad{z-index:3;cursor:default}
.sp-b.ok .sp-bi,.sp-b.bad .sp-bi{display:none}
.sp-b.ok .sp-svg,.sp-b.bad .sp-svg{filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}
.sp-b.ok .sp-bt,.sp-b.bad .sp-bt{animation:sp-txt .45s ease both}
@keyframes sp-txt{0%{transform:scale(1.3)}100%{transform:scale(1)}}
.sp-b.bad{z-index:1}
.sp-mk{position:absolute;right:-6%;top:-6%;width:34%;height:34%;max-width:56px;max-height:56px;min-width:30px;min-height:30px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:2;animation:sp-in .4s .15s cubic-bezier(.3,1.6,.5,1) both}
.sp-mk .ico{width:62%;height:62%;stroke-width:3.4}
.sp-b.ok .sp-mk{color:${OK_COL}} .sp-b.bad .sp-mk{color:${BAD_COL}}
.sp-b.pop{pointer-events:none}
.sp-b.pop::after{content:'';position:absolute;inset:8%;border-radius:50%;border:4px solid var(--c);animation:sp-ring .4s ease-out forwards}
@keyframes sp-ring{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.6);opacity:0}}
.sp-spray{position:absolute;inset:0;pointer-events:none;z-index:0}
.sp-spray i{position:absolute;left:50%;top:50%;width:var(--z);aspect-ratio:1;margin:calc(var(--z) / -2);border-radius:50%;background:var(--sc);opacity:0;animation:sp-drop .7s var(--dl) cubic-bezier(.15,.8,.3,1) both}
@keyframes sp-drop{0%{transform:translate(0,0) scale(1.4);opacity:1}70%{opacity:.9}100%{transform:translate(var(--dx),var(--dy)) scale(.5);opacity:0}}
.sp-b.pop .sp-bi,.sp-b.pop .sp-bt{animation:sp-pop .32s ease-in forwards}
@keyframes sp-pop{0%{transform:scale(1);opacity:1}60%{transform:scale(1.2);opacity:.7}100%{transform:scale(1.35);opacity:0}}
.sp-b.fade{transition:opacity .6s ease;opacity:0;pointer-events:none}
.sp-foot{flex-wrap:nowrap}
.sp-foot .grow{flex:1}
.sp-round{font:600 22px var(--font);color:var(--dark-text-2);white-space:nowrap}
.sp-round b{color:var(--dark-text);font-weight:800}
.sp-next{min-width:170px;margin-left:16px}
.sp-next.hid{visibility:hidden}
.sp-pl{display:flex;align-items:center;gap:14px;height:64px;padding:0 10px 0 20px;border-radius:16px;background:color-mix(in srgb,var(--pc) 22%,var(--dark-2));border:3px solid var(--pc);max-width:34%;min-width:0}
.sp-pl .nm{font:700 24px var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sp-pl b{flex:none;min-width:52px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--pc);color:#111114;font:800 30px/1 var(--font)}
.sp-ask{position:absolute;inset:0;z-index:6;display:grid;place-items:center;background:rgba(10,10,14,.55);animation:sp-fade .25s ease}
@keyframes sp-fade{from{opacity:0}to{opacity:1}}
.sp-ask-c{display:flex;flex-direction:column;align-items:center;gap:12px;padding:26px 36px 22px;border-radius:24px;background:var(--dark-2);box-shadow:0 20px 60px rgba(0,0,0,.5);border-top:6px solid ${OK_COL};animation:sp-in .35s cubic-bezier(.3,1.5,.5,1) both;max-width:90%}
.sp-ask-c.bad{border-top-color:${BAD_COL}}
.sp-ask-t{font:800 clamp(32px,5.5vh,52px)/1.1 var(--font)}
.sp-ask-s{font-size:20px;color:var(--dark-text-2);margin-top:-4px}
.sp-ask-b{display:flex;gap:16px;margin:8px 0 4px;flex-wrap:wrap;justify-content:center}
.sp-pb{min-width:240px;max-width:380px;height:84px;padding:0 26px;border-radius:18px;border:0;background:var(--pc);color:#111114;font:800 30px var(--font);cursor:pointer;touch-action:manipulation;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-pb:active{filter:brightness(.88)}
.sp-fin{position:absolute;inset:0;z-index:7;display:grid;place-items:center;background:rgba(10,10,14,.72);animation:sp-fade .3s ease}
.sp-fin-c{display:flex;flex-direction:column;align-items:center;gap:12px;padding:26px 44px;border-radius:24px;background:var(--dark-2);box-shadow:0 20px 60px rgba(0,0,0,.5);animation:sp-in .45s cubic-bezier(.3,1.5,.5,1) both;max-width:92%}
.sp .ico.sp-tro{width:clamp(60px,10vh,96px);height:clamp(60px,10vh,96px);color:#F5B700;stroke-width:1.6}
.sp-fin-t{font:800 clamp(38px,7vh,72px)/1.05 var(--font);text-align:center}
.sp-fin-s{font:700 26px var(--font);color:var(--dark-text-2)}
.sp-fin-b{display:flex;gap:12px;margin-top:6px}
.sp-fin-b .clk-btn:not(.gc-go){background:var(--dark-3)}
.sp .clk-btn.sp-awb{background:#F5B700;color:#111114}
.sp .clk-btn.sp-awb .ico{color:#111114}
.sp-awd{display:flex;align-items:center;gap:8px;font:700 20px var(--font);color:#F5B700}
.sp-awd .ico{width:24px;height:24px}
@media (prefers-reduced-motion: reduce){.sp-b *,.sp-wblob,.sp-ask-c,.sp-fin-c,.sp-st,.sp-b::after{animation:none !important}.sp-spray{display:none}}
`;
// Teacher screen replica only (dual.js): the right bubble outlined.
const REP_CSS = `.sp-b.sp-ans:not(.ok) .sp-bi{outline:5px dashed #F5B700;outline-offset:5px}`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'sp-css', textContent:CSS }));

window.SVSplat = { open, close:hide, CSS, REP_CSS, setupOnConsole, cancelSetup, get open_(){ return !!big; },
  _:{ poolOf, optionsFor, norm, clean } };
})();
