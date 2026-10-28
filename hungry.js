/* =====================================================================
   Slideshow Viewer — Hungry Translations (v1.48, 2026-10-16; v1.48.1 dinosaur, Resume / Start again)
   Tools → Hungry Translations (and the console's Tools menu). A pop-up over
   the slide area, one sentence at a time, in English or the target
   language. Press Eat it! and a hungry cartoon dinosaur (original drawing)
   eats the sentence from left to right, line by line, over 10 /
   20 / 30 seconds. When it has gone, pupils write the translation from
   memory; Reveal shows the answer with the sentence back above it.

   Setting up (start screen):
     Pupils see    English (they write French/Spanish) · French/Spanish (they
                   write English) · As on the slides (each sentence's own
                   direction, for Translation slides).
     Time to eat   10 / 20 / 30 s (20 to start with).
     Sources       From this lesson (each Translation activity in the lesson,
                   activities.js) · Choose sentences (builder + the
                   activities picker in translation mode, 1–5, typed words
                   allowed) · Random sentences (the same picker filled at
                   random) · Last time (lesson.htLast).
   Dual screen: the panel shows "Getting ready…" and the set-up runs on the
   teacher screen (rpc 'htSetup', no time limit; 'htSetupEnd' cancels), as
   Sentence Unjumble does. The teacher screen also shows the answer under
   the sentence the whole time (.ht-priv, made visible in the replica).

   Playing: Eat it! → eating (Skip ends it) → "Pens ready!" → Reveal → Next.
   Eat again re-runs the sentence. Clicker / keys: → Eat it!, Reveal, next
   sentence, then "All eaten!"; ← hides the answer, brings the sentence
   back, then the previous sentence. Dots: gold = revealed.
   The eating is CSS only (one cover and one walking dinosaur per line, each
   with its own delay from inline custom properties) so the dual-screen
   replica plays the same animation without frame-by-frame updates. A
   repaint mid-eat (resize) restarts the animations with negative delays.

   Memory: kept for the lesson (× keeps it; Tools → Hungry Translations then
   offers Resume or Start again, the whole set-up from the beginning). Saved: lesson.htLast = { meta, rows, show, secs, at }.
   Uses SVAct.picker / SVAct.translations, SVSentence.choose / list.
   Loaded after activities.js.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, toast } = C;
const H = () => window.SVHost;
const A = () => window.SVAct;
const uid = () => Math.random().toString(36).slice(2, 10);
const SECS = [10, 20, 30];

const IC = iconMap({
  tool: 'dinosaur', dice: 'dices', hand: 'hand', hist: 'history',
  slides: 'presentation', x: 'x', left: 'chevron-left', right: 'chevron-right',
  eye: 'eye', eyeOff: 'eye-off', eat: 'utensils', skip: 'skip-forward',
  reset: 'rotate-ccw', trophy: 'trophy', new: 'plus', pen: 'pencil-line',
  timer: 'timer',
});
const icon = (n, cls) => `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- the hungry dinosaur (original drawing, faces right; mouth at 84% across, 50% down) ---------------- */
const MAN_W = 100, MAN_H = 120, MOUTH_X = 0.84, MOUTH_Y = 0.5;
function manSVG(extra){
  return `<svg class="ht-man ${extra || ''}" viewBox="0 0 ${MAN_W} ${MAN_H}" aria-hidden="true">
    <path d="M26 80Q10 84 1 98q12-2 26-6z" fill="#5DBB63" stroke="#2E7D32" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M23 70l3-10 6 7zM31 63l5-10 5 8zM41 59l6-9 4 9zM51 59l6-8 3 9z" fill="#FF9F43" stroke="#D9731A" stroke-width="1.2" stroke-linejoin="round"/>
    <g class="ht-legs"><g class="ht-l1"><rect x="34" y="96" width="11" height="16" rx="5" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.6"/><ellipse cx="41" cy="113" rx="8" ry="4" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.6"/></g>
      <g class="ht-l2"><rect x="52" y="96" width="11" height="16" rx="5" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.6"/><ellipse cx="59" cy="113" rx="8" ry="4" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.6"/></g></g>
    <ellipse cx="46" cy="82" rx="26" ry="23" fill="#5DBB63" stroke="#2E7D32" stroke-width="1.8"/>
    <ellipse cx="55" cy="88" rx="14" ry="15" fill="#D4EDA8"/>
    <path d="M57 86q2-4 5-6M57 92h7M58 98q3 1 6 0" stroke="#B5D98A" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M66 76q8 1 10 6" stroke="#2E7D32" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M66 76q8 1 10 6" stroke="#5DBB63" stroke-width="3" stroke-linecap="round" fill="none"/>
    <g class="ht-jaw"><ellipse cx="74" cy="60" rx="13" ry="6.5" fill="#7A1F2B"/><ellipse cx="74" cy="63" rx="6" ry="2.4" fill="#E0566A"/>
      <path d="M57 57h31q5 1 3 6-6 9-25 8-10-1-9-14z" fill="#5DBB63" stroke="#2E7D32" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M64 58l2 3.5 2-3.5M74 58l2 3.5 2-3.5M83 58l2 3.5 2-3.5" fill="#fff" stroke="#fff" stroke-width="1"/></g>
    <path d="M43 52q-3-30 23-31 26-1 29 22 1 13-9 14H58q-12 0-15-5z" fill="#5DBB63" stroke="#2E7D32" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M53 25l4-8 4 7zM62 22l5-8 3 8z" fill="#FF9F43" stroke="#D9731A" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M60 55l2.5 4 2.5-4M70 55l2.5 4 2.5-4M80 55l2.5 4 2.5-4" fill="#fff" stroke="#fff" stroke-width="1"/>
    <ellipse cx="62" cy="46" rx="5" ry="3" fill="#F28B9B" opacity=".55"/>
    <g class="ht-eye"><circle cx="70" cy="35" r="7" fill="#fff" stroke="#2E7D32" stroke-width="1.4"/><circle cx="72.5" cy="35.5" r="3.8" fill="#1d1d1f"/><circle cx="74" cy="34" r="1.3" fill="#fff"/></g>
    <ellipse cx="89" cy="40" rx="1.6" ry="1.1" fill="#2E7D32"/>
  </svg>`;
}

/* ---------------- state (memory, per lesson) ---------------- */
// G = { lid, view:'start'|'wait'|'play', size, set:{ rows:[{ tl, en, to }], meta }, i, ph:['ready'|'eat'|'gone'|'rev'],
//       t0, show:'en'|'tl'|'slide', secs, fin, arm, tok }
let G = null;
const lesson = () => H() && H().lesson;
function game(){
  const l = lesson(); if(!l) return null;
  if(!G || G.lid !== l.id){
    const last = lastOf(l);
    G = { lid:l.id, view:'start', size:'closed', set:null, i:0, ph:[], t0:0, show:(last && last.show) || 'en', secs:(last && SECS.includes(last.secs)) ? last.secs : 20, fin:false, arm:false, tok:null };
  }
  return G;
}
const lessonYear = l => l && C.yearOf ? C.yearOf(l.label) : null;
const teacherLinked = () => !!(window.SVDual && SVDual.teacherLinked);
function lastOf(l){
  const u = l && l.htLast;
  return u && Array.isArray(u.rows) && u.rows.length && u.meta ? u : null;
}
const keepRow = r => Object.assign({ tl:String(r.tl || ''), en:String(r.en || ''), to:r.to === 'en' ? 'en' : 'tl' }, Array.isArray(r.src) && r.src.length ? { src:r.src } : {}, r.ed ? { ed:true } : {});
const actsOf = l => (A() && A().translations ? A().translations(l) : []).map(a => ({ rows:a.rows.map(keepRow), meta:{ lang:a.lang, q:a.q || {}, sb:a.sb || {} } }));
const LANGS = () => (window.SBCore && SBCore.LANGS) || { fr:{ name:'French', short:'FR' }, es:{ name:'Spanish', short:'ES' } };
const lname = l => (LANGS()[l] || { name:'French' }).name;
// The language pupils write in for a row, with the "Pupils see" setting applied.
const toOf = (g, r) => g.show === 'en' ? 'tl' : g.show === 'tl' ? 'en' : r.to;
const promptOf = (g, r) => toOf(g, r) === 'en' ? r.tl : r.en;
const answerOf = (g, r) => toOf(g, r) === 'en' ? r.en : r.tl;

/* ---------------- big view ---------------- */
let big = null; // { back, card, armT, finT, eatT }
function open(){
  const l = lesson();
  if(!l){ toast('Open a lesson to use Hungry Translations.'); return; }
  if(!A() || !A().picker){ toast('The Activities files aren\'t loaded.'); return; }
  const g = game();
  // A game already running in this lesson: Resume it or Start again (the whole set-up from the beginning).
  if(g.set && (g.view === 'play' || g.view === 'resume')){ g.view = 'resume'; g.fin = false; showBig(); return; }
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
    const back = el('div', 'ap-back gc-back ht-back'), card = el('div', 'ap ht');
    back.appendChild(card); document.body.appendChild(back);
    card.addEventListener('click', onClick);
    big = { back, card };
  }
  fit(); paint();
}
function closeBig(){
  if(!big) return;
  clearTimeout(big.armT); clearTimeout(big.finT); clearTimeout(big.eatT);
  big.back.remove(); big = null;
}
// × : keep the game for the lesson (a set-up in progress is cancelled; a sentence being eaten is finished).
function hide(){
  const g = G;
  if(g && g.view === 'wait') cancelWait(g, true);
  if(g){
    if(g.set && g.ph[g.i] === 'eat') g.ph[g.i] = 'gone';
    g.size = 'closed'; g.view = g.set ? 'play' : 'start';
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
window.addEventListener('resize', () => { if(!big) return; fit(); clearTimeout(rzT); rzT = setTimeout(() => { if(big) layout(); }, 120); });

function head(g){
  const playing = g.view === 'play' && g.set;
  return `<div class="ap-head gc-head">
    <div class="ap-title">${icon('tool', 'ico ht-ic')}Hungry Translations</div>
    ${playing && g.set.meta && g.set.meta.sb && g.set.meta.sb.title ? `<span class="ap-chip ht-chip">${esc(g.set.meta.sb.title)}</span>` : ''}
    <div class="grow"></div>
    ${playing ? `<button class="clk-btn" data-b="secs" title="How long he takes to eat a sentence (tap to change)">${icon('timer')}${g.secs} s</button>
      <button class="clk-btn ${g.arm ? 'gc-arm' : ''}" data-b="new">${icon('new')}${g.arm ? 'Tap again for new sentences' : 'New sentences'}</button>` : ''}
    <button class="tb-ic" data-b="close" title="${playing ? 'Close (kept for this lesson)' : 'Close'}">${icon('x')}</button>
  </div>`;
}
function paint(){
  if(!big) return;
  const g = game(); if(!g) return;
  clearTimeout(big.eatT);
  const card = big.card;
  card.className = 'ap ht ht-v-' + g.view;
  if(g.view === 'wait'){ card.innerHTML = head(g) + waitHTML(); return; }
  if(g.view === 'resume' && g.set){ card.innerHTML = head(g) + resumeHTML(g); return; }
  if(g.view === 'start' || !g.set){ card.innerHTML = head(g) + startHTML({ last:lastOf(lesson()), acts:actsOf(lesson()), show:g.show, secs:g.secs }, false); return; }
  card.innerHTML = head(g) + playHTML(g);
  layout();
}

/* start screen (the board when single screen; the teacher screen's dialog when dual) */
function startHTML(o, consoleSide){
  const { last, acts, show, secs } = o;
  const when = last && last.at ? new Date(last.at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
  const seg = (attr, opts, cur) => `<span class="ht-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  const actList = acts.length ? acts.map((a, k) => `<button class="clk-btn ht-act" data-k="act" data-a="${k}">${icon('slides')}<span><b>${esc((a.meta.sb && a.meta.sb.title) || 'Translation')}</b> · ${a.rows.length} sentence${a.rows.length === 1 ? '' : 's'}</span></button>`).join('')
    : `<span class="gc-opt-d">No Translation slides in this lesson yet (editor: Insert → Activity ▾ → Translation).</span>`;
  return `<div class="ht-set">
      <div class="ht-sr"><span>Pupils see</span>${seg('show', [['en', 'English'], ['tl', 'French / Spanish'], ['slide', 'As on the slides']], show)}</div>
      <div class="ht-sr"><span>Time to eat</span>${seg('secs', SECS.map(s => [s, s + ' s']), secs)}</div>
    </div>
    <div class="ht-start">
    <div class="gc-opt ht-opt ht-acts ${acts.length ? '' : 'none'}">
      <span class="gc-opt-t">${icon('slides')}From this lesson</span>
      <div class="ht-al">${actList}</div>
    </div>
    <button class="gc-opt ht-opt" data-k="pick">
      <span class="gc-opt-t">${icon('hand')}Choose sentences</span>
      <span class="gc-opt-d">Pick a sentence builder, then tap the words for each sentence (1 to 5). You can type your own words too.</span>
    </button>
    <button class="gc-opt ht-opt" data-k="rand">
      <span class="gc-opt-t">${icon('dice')}Random sentences</span>
      <span class="gc-opt-d">Pick a builder and the sentences are made for you. Re-roll any you don't like.</span>
    </button>
    ${last ? `<div class="gc-opt ht-opt ht-last">
      <span class="gc-opt-t">${icon('hist')}Last time</span>
      <span class="gc-opt-d"><b>${esc((last.meta.sb && last.meta.sb.title) || 'Sentences')}</b><br>${last.rows.length} sentence${last.rows.length === 1 ? '' : 's'}${when ? ' · ' + esc(when) : ''}</span>
      <span class="ht-lb"><button class="clk-btn gc-go" data-k="again">${icon('reset')}Use again</button><button class="clk-btn" data-k="edit">Edit</button></span>
    </div>` : ''}
  </div>
  <div class="ap-foot gc-foot"><div class="ap-sum">${consoleSide ? 'Pupils see “Getting ready…” until you start.' : 'He eats the sentence from left to right. When it has gone, pupils write the translation.'}</div>
  ${consoleSide ? `<button class="clk-btn lg" data-k="cancel">Cancel</button>` : ''}</div>`;
}
function resumeHTML(g){
  const n = g.set.rows.length, done = g.ph.filter(x => x === 'rev').length, t = g.set.meta && g.set.meta.sb && g.set.meta.sb.title;
  return `<div class="ht-start ht-res">
    <button class="gc-opt ht-opt" data-b="resume">
      <span class="gc-opt-t">${icon('right')}Resume</span>
      <span class="gc-opt-d">Carry on from sentence ${g.i + 1} of ${n}${t ? ' · <b>' + esc(t) + '</b>' : ''}${done ? ` (${done} revealed)` : ''}.</span>
    </button>
    <button class="gc-opt ht-opt" data-b="restart">
      <span class="gc-opt-t">${icon('reset')}Start again</span>
      <span class="gc-opt-d">Back to the beginning: choose what pupils see, the time and the sentences again.</span>
    </button>
  </div>
  <div class="ap-foot gc-foot"><div class="ap-sum">This lesson already has a game of Hungry Translations.</div></div>`;
}
function waitHTML(){
  return `<div class="ht-wait">${manSVG('ht-wman')}
    <div class="ht-wsay">Getting ready<i>.</i><i>.</i><i>.</i></div>
    <div class="ht-wsub">Your teacher is choosing the sentences.</div>
    <button class="clk-btn" data-b="waitcancel">Cancel</button></div>`;
}

/* playing */
function playHTML(g){
  const rows = g.set.rows, n = rows.length, row = rows[g.i], ph = g.ph[g.i];
  const to = toOf(g, row), lang = (g.set.meta && g.set.meta.lang) || 'fr', L = lname(lang);
  const into = to === 'en' ? 'English' : L, short = (LANGS()[lang] || { short:'FR' }).short;
  const dots = n > 1 ? `<div class="ht-dots">${rows.map((r, k) => `<button class="ht-dot ${k === g.i ? 'cur' : ''} ${g.ph[k] === 'rev' ? 'rev' : ''}" data-go="${k}" title="Sentence ${k + 1}">${k + 1}</button>`).join('')}</div>` : '';
  const words = t => String(t || '').split(/\s+/).filter(Boolean).map(w => `<span class="ht-w">${esc(w)}</span>`).join(' ');
  const gone = ph === 'gone', rev = ph === 'rev';
  let area;
  if(rev) area = `<div class="ht-text ht-small">${words(promptOf(g, row))}</div><div class="ht-ans">${words(answerOf(g, row))}</div>`;
  else if(gone) area = `<div class="ht-write">${icon('pen', 'ico ht-pen')}<div class="ht-wt">Pens ready!</div><div class="ht-ws">Write it in ${esc(into)}.</div></div>
      <div class="ht-full">${manSVG('ht-rest')}<div class="ht-bub">${lang === 'es' ? '¡Ñam, ñam!' : 'Miam miam !'}</div></div>`;
  else area = `<div class="ht-text">${words(promptOf(g, row))}</div>`;
  return `${dots}<div class="ht-main">
      <div class="ht-stage ph-${ph}">
        <div class="ht-dir"><span class="ht-tag">${to === 'en' ? short + ' → EN' : 'EN → ' + short}</span>Translate into ${esc(into)}</div>
        <div class="ht-area">${area}</div>
        ${ph === 'eat' ? `<div class="ht-bar"><i style="animation-duration:${g.secs}s;animation-delay:${-Math.min(g.secs * 1000, Math.max(0, performance.now() - g.t0))}ms"></i></div>` : ''}
        <div class="ht-priv">${esc(promptOf(g, row))}<br><b>${esc(answerOf(g, row))}</b></div>
      </div>
      ${g.fin ? `<div class="ht-fin" data-b="finx"><div class="ht-fin-c">${manSVG('ht-fman')}
        <div class="ht-fin-t">All eaten!</div>
        <div class="ht-fin-s">${n} sentence${n === 1 ? '' : 's'} · Yum!</div>
        <div class="ht-fin-b"><button class="clk-btn lg" data-b="again">${icon('reset')}Play again</button><button class="clk-btn lg gc-go" data-b="new2">${icon('new')}New sentences</button></div>
        <div class="ht-fin-x">Tap anywhere else to look back at the sentences</div></div></div>` : ''}
    </div>
    <div class="ap-foot gc-foot ht-foot">
      <button class="clk-btn lg" data-b="prev" ${g.i > 0 ? '' : 'disabled'}>${icon('left')}Previous</button>
      <div class="grow"></div>
      ${ph === 'ready' ? `<button class="clk-btn lg gc-go ht-eatb" data-b="eat">${icon('eat')}Eat it!</button>`
        : ph === 'eat' ? `<button class="clk-btn lg" data-b="skip">${icon('skip')}Skip</button>`
        : `<button class="clk-btn lg" data-b="eat">${icon('reset')}Eat again</button>`}
      ${ph === 'ready' || ph === 'eat' ? '' : `<button class="clk-btn lg ht-rv ${rev ? 'on' : ''}" data-b="reveal">${icon(rev ? 'eyeOff' : 'eye')}${rev ? 'Hide answer' : 'Reveal'}</button>`}
      <div class="grow"></div>
      <button class="clk-btn lg" data-b="next" ${g.i < n - 1 ? '' : 'disabled'}>Next${icon('right')}</button>
    </div>`;
}

/* layout: text size, lines, and the eating */
const FIT = { max:110, min:18 };
function fitText(area, els, ratio){
  // ratio: font size of each element as a share of the main size f (the answer when revealed).
  const W = area.clientWidth, Hh = area.clientHeight;
  const set = f => els.forEach((e, k) => { e.style.fontSize = (f * ratio[k]) + 'px'; });
  const fits = f => {
    set(f);
    if(els.some(e => [...e.children].some(w => w.offsetWidth > W + 1))) return false;
    return els.reduce((s, e) => s + e.offsetHeight, 0) + (els.length - 1) * f * 0.35 <= Hh;
  };
  let lo = FIT.min, hi = Math.max(FIT.min, Math.min(FIT.max, Hh * 0.42));
  if(fits(hi)) lo = hi;
  else for(let k = 0; k < 16; k++){ const m = (lo + hi) / 2; if(fits(m)) lo = m; else hi = m; }
  set(Math.floor(lo));
  return Math.floor(lo);
}
// The words' lines inside the text box: { l, r, t, h } in the box's own pixels.
function linesOf(box){
  const lines = [];
  for(const w of box.querySelectorAll('.ht-w')){
    const t = w.offsetTop, L = lines.find(x => Math.abs(x.t - t) < w.offsetHeight * 0.5);
    const r = w.offsetLeft + w.offsetWidth;
    if(L){ L.l = Math.min(L.l, w.offsetLeft); L.r = Math.max(L.r, r); }
    else lines.push({ l:w.offsetLeft, r, t, h:w.offsetHeight });
  }
  return lines.sort((a, b) => a.t - b.t);
}
function layout(){
  if(!big) return;
  const g = game(); if(!g || g.view !== 'play' || !g.set) return;
  const area = $('.ht-area', big.card); if(!area) return;
  const ph = g.ph[g.i];
  if(ph === 'rev'){ fitText(area, [$('.ht-text', area), $('.ht-ans', area)], [0.5, 1]); return; }
  if(ph === 'gone') return;
  const box = $('.ht-text', area); if(!box) return;
  $$('.ht-layer', box).forEach(x => x.remove()); // a re-layout (resize) draws them again
  clearTimeout(big.eatT);
  // Room for the dinosaur's head above / below the line: text fits in the middle 70% of the height.
  const f = fitText(area, [box], [1]);
  const fit2 = () => box.offsetHeight + f * 1.2 > area.clientHeight;
  if(fit2()){ box.style.fontSize = Math.max(FIT.min, Math.floor(f * 0.85)) + 'px'; }
  const lines = linesOf(box);
  if(!lines.length) return;
  const lh = lines[0].h, mh = Math.max(56, lh * 1.75), mw = mh * MAN_W / MAN_H;
  const man = (ln, cls, style) => `<div class="ht-walk ${cls}" style="left:${ln.l - mw * MOUTH_X}px;top:${ln.t + ln.h / 2 - mh * MOUTH_Y}px;width:${mw}px;height:${mh}px;${style || ''}">${manSVG()}<i class="ht-cr c1"></i><i class="ht-cr c2"></i><i class="ht-cr c3"></i></div>`;
  let h = '';
  if(ph === 'ready') h = man(lines[0], 'ht-wait1');
  else if(ph === 'eat'){
    const D = g.secs * 1000, total = lines.reduce((s, x) => s + (x.r - x.l), 0) || 1, el0 = Math.max(0, performance.now() - g.t0);
    let cum = 0;
    for(const ln of lines){
      const w = ln.r - ln.l, d = D * w / total, del = D * cum / total - el0;
      cum += w;
      const t = `--d:${d.toFixed(0)}ms;--del:${del.toFixed(0)}ms`;
      h += `<div class="ht-cov" style="left:${ln.l - 4}px;top:${ln.t - 3}px;width:${w + 10}px;height:${ln.h + 6}px;${t}"></div>`;
      h += man(ln, 'ht-go', `${t};--x:${w}px`);
    }
    big.eatT = setTimeout(() => { const g2 = game(); if(g2 && g2 === g && g2.ph[g2.i] === 'eat'){ g2.ph[g2.i] = 'gone'; paint(); } }, Math.max(0, D - el0) + 60);
  }
  const layer = el('div', 'ht-layer'); layer.innerHTML = h;
  box.appendChild(layer);
}

function startSet(r){
  const g = game(); if(!g || !r || !r.rows || !r.rows.length) return;
  const rows = r.rows.map(keepRow);
  if(r.show) g.show = r.show;
  if(SECS.includes(+r.secs)) g.secs = +r.secs;
  Object.assign(g, { set:{ rows, meta:r.meta || {} }, i:0, ph:rows.map(() => 'ready'), view:'play', fin:false, arm:false });
  const l = lesson();
  if(l){ l.htLast = { meta:r.meta || {}, rows, show:g.show, secs:g.secs, at:Date.now() }; H().save(); }
  showBig();
}
function playAgain(){ const g = game(); if(!g || !g.set) return; Object.assign(g, { i:0, ph:g.set.rows.map(() => 'ready'), fin:false }); paint(); }
function eat(){ const g = game(); if(!g || !g.set) return; g.ph[g.i] = 'eat'; g.t0 = performance.now(); g.fin = false; paint(); }
function skip(){ const g = game(); if(g.ph[g.i] === 'eat'){ g.ph[g.i] = 'gone'; paint(); } }
function reveal(on){
  const g = game(), ph = g.ph[g.i];
  if(on == null) on = ph !== 'rev';
  if(on && (ph === 'gone' || ph === 'ready')){ g.ph[g.i] = 'rev'; paint(); return true; }
  if(!on && ph === 'rev'){ g.ph[g.i] = 'gone'; paint(); return true; }
  return false;
}
function go(k){ const g = game(); if(!g.set || k < 0 || k >= g.set.rows.length) return; if(g.ph[g.i] === 'eat') g.ph[g.i] = 'gone'; g.i = k; g.fin = false; paint(); }

function onClick(e){
  const g = game(); if(!g || !big) return;
  const t = e.target.closest('button, [data-b="finx"]'); if(!t || t.disabled) return;
  const a = t.dataset.b, k = t.dataset.k;
  if(a !== 'new' && g.arm){ g.arm = false; clearTimeout(big.armT); }
  if(t.dataset.show){ g.show = t.dataset.show; paint(); return; }
  if(t.dataset.secs){ g.secs = +t.dataset.secs; paint(); return; }
  if(k){ startChoice(k, t.dataset.a); return; }
  if(t.dataset.go != null){ go(+t.dataset.go); return; }
  switch(a){
    case 'close': hide(); return;
    case 'waitcancel': cancelWait(g, true); return;
    case 'resume': g.view = 'play'; paint(); return;
    case 'restart': newSet(); return;
    case 'secs': {
      g.secs = SECS[(SECS.indexOf(g.secs) + 1) % SECS.length];
      const l = lesson(); if(l && l.htLast){ l.htLast.secs = g.secs; H().save(); }
      if(g.ph[g.i] === 'eat') g.t0 = performance.now(); // start this one again at the new speed
      paint(); return;
    }
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
    case 'eat': eat(); return;
    case 'skip': skip(); return;
    case 'reveal': reveal(); return;
  }
}

/* ---------------- set-up: the choices ---------------- */
// kind: 'act' | 'pick' | 'rand' | 'again' | 'edit'. done(result | null): null = back to the start screen.
function runChoice(kind, o, done){
  const P = A().picker, year = o.year, last = o.last;
  const picker = (x, rows, random) => {
    P.open({ kind:'translate', tool:true, random, noDir:true, title:'Hungry Translations', year, label:'Start', onCancel:() => done(null), onDone:(rows2, meta) => done({ rows:rows2, meta }) });
    P.setBuilder(x, rows);
  };
  const choose = random => {
    if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); done(null); return; }
    SVSentence.choose({ year, onPick:x => picker(x, null, random), onCancel:() => done(null) });
  };
  if(kind === 'act'){ const a = (o.acts || [])[+o.idx]; done(a ? { rows:a.rows, meta:a.meta } : null); return; }
  if(kind === 'again' && last){ done({ rows:last.rows, meta:last.meta }); return; }
  if(kind === 'edit' && last){
    findBuilder(last.meta).then(x => {
      // Rows keep their builder picks; rows without any (typed, or from slides typed by hand) come in as typed words.
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
function startChoice(k, idx){
  const g = game(); if(!g) return;
  const l = lesson();
  runChoice(k, { year:lessonYear(l), last:lastOf(l), acts:actsOf(l), idx }, r => { if(r) startSet(Object.assign(r, { show:g.show, secs:g.secs })); });
}

/* ---------------- dual screen ---------------- */
async function askTeacher(g){
  const tok = g.tok = uid(), l = lesson();
  let r;
  try{ r = await SVDual.link.htSetup({ year:lessonYear(l), last:lastOf(l), acts:actsOf(l), show:g.show, secs:g.secs }); }
  catch(e){ if(G === g && g.tok === tok){ g.tok = null; toast((e && e.message) || 'The teacher screen did not answer.'); afterWait(g); } return; }
  if(G !== g || g.tok !== tok) return;
  g.tok = null;
  if(r && r.rows && r.rows.length) startSet(r); else afterWait(g);
}
function afterWait(g){ if(g.set){ g.view = 'play'; paint(); } else { g.view = 'start'; g.size = 'closed'; closeBig(); } }
function cancelWait(g, tell){
  if(!g || g.view !== 'wait') return;
  g.tok = null;
  if(tell && window.SVDual && SVDual.link && SVDual.link.htSetupEnd) SVDual.link.htSetupEnd();
  afterWait(g);
}
// Teacher console: rpc 'htSetup' { year, last, acts, show, secs } → { rows, meta, show, secs } or null.
let CS = null; // { back, card, res, req }
function setupOnConsole(req){
  cancelSetup();
  return new Promise(res => {
    const back = el('div', 'ap-back ht-cback'), card = el('div', 'ap ht ht-c');
    back.appendChild(card); document.body.appendChild(back);
    CS = { back, card, res, req:Object.assign({ acts:[], show:'en', secs:20 }, req || {}) };
    const paintC = () => {
      card.innerHTML = `<div class="ap-head gc-head"><div class="ap-title">${icon('tool', 'ico ht-ic')}Hungry Translations</div><span class="ap-chip">Set up on this screen</span><div class="grow"></div>
        <button class="tb-ic" data-k="cancel" title="Cancel">${icon('x')}</button></div>` + startHTML({ last:lastOf({ htLast:CS.req.last }), acts:CS.req.acts, show:CS.req.show, secs:CS.req.secs }, true);
    };
    paintC();
    card.addEventListener('click', e => {
      if(!CS) return;
      const sh = e.target.closest('[data-show]'), sc = e.target.closest('[data-secs]');
      if(sh){ CS.req.show = sh.dataset.show; paintC(); return; }
      if(sc){ CS.req.secs = +sc.dataset.secs; paintC(); return; }
      const b = e.target.closest('[data-k]'); if(!b) return;
      const k = b.dataset.k;
      if(k === 'cancel') return finishSetup(null);
      CS.back.style.display = 'none';
      const q = CS.req;
      runChoice(k, { year:q.year, last:lastOf({ htLast:q.last }), acts:q.acts, idx:b.dataset.a }, r => { if(!CS) return; if(r) finishSetup(r); else CS.back.style.display = ''; });
    });
  });
}
function finishSetup(v){
  if(!CS) return;
  const s = CS; CS = null;
  s.back.remove();
  if(A() && A().picker && A().picker.open_) A().picker.close();
  s.res(v ? { rows:v.rows.map(keepRow), meta:v.meta, show:s.req.show, secs:s.req.secs } : null);
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
  if(g.view === 'resume' && g.set){ if(FWD.includes(k)){ g.view = 'play'; paint(); } return; }
  if(g.view !== 'play' || !g.set) return;
  const ph = g.ph[g.i];
  if(FWD.includes(k)){
    if(g.fin) return;
    if(ph === 'ready') eat();
    else if(ph === 'gone') reveal(true);
    else if(ph === 'rev'){ if(g.i < g.set.rows.length - 1) go(g.i + 1); else { g.fin = true; paint(); } }
  } else if(BACK.includes(k)){
    if(g.fin){ g.fin = false; paint(); return; }
    if(ph === 'rev') reveal(false);
    else if(ph === 'gone' || ph === 'eat'){ g.ph[g.i] = 'ready'; paint(); }
    else if(g.i > 0) go(g.i - 1);
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
  if(G && G.set && G.ph[G.i] === 'eat') G.ph[G.i] = 'gone';
  if(big){ clearTimeout(big.finT); clearTimeout(big.eatT); big.back.remove(); big = null; }
});

/* ---------------- styles ---------------- */
const CSS = `
.ht-back{z-index:31}
.ap.ht{position:absolute;border-radius:var(--stage-r);padding:14px 18px 14px}
.ap .ico.ht-ic{color:#F5B700;width:28px;height:28px}
.ht-chip{max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ht .ap-title{white-space:nowrap;flex:none}
/* start */
.ht-set{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 14px;flex:none}
.ht-sr{display:flex;align-items:center;gap:12px}
.ht-sr>span:first-child{font:600 18px var(--font);color:var(--dark-text-2)}
.ht-seg{display:flex;gap:6px;background:var(--dark-2);border-radius:14px;padding:5px}
.ht-seg button{height:46px;padding:0 16px;border-radius:10px;border:0;background:transparent;color:var(--dark-text);font:600 17px var(--font);cursor:pointer;touch-action:manipulation;white-space:nowrap}
.ht-seg button.on{background:#F5B700;color:#111114}
.ht-start{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:stretch}
.ht-opt{justify-content:center;overflow:hidden}
.ht-opt:not(.ht-last):not(.ht-acts):active{border-color:var(--accent)}
.ht-acts,.ht-last{cursor:default}
.ht-acts.none{opacity:.75}
.ht-al{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto}
.ht .clk-btn.ht-act{justify-content:flex-start;height:auto;min-height:56px;padding:8px 14px;white-space:normal;text-align:left;font-weight:500;background:var(--dark-3);line-height:1.25}
.ht .clk-btn.ht-act b{font-weight:700}
.ht-last .gc-opt-d b{color:var(--dark-text)}
.ht-last .clk-btn:not(.gc-go){background:var(--dark-3)}
.ht-lb{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.ht-cback{z-index:100}
.ht-res{grid-template-columns:1fr 1fr}
.ht-res .ht-opt{align-items:flex-start}
.ht-res .gc-opt-d b{color:var(--dark-text)}
.ap.ht.ht-c{position:relative;border-radius:24px;width:min(1240px,94vw);height:min(640px,90vh)}
/* waiting */
.ht-wait{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
.ht-wman{width:clamp(110px,18vh,190px);height:auto;animation:ht-bob 1.2s ease-in-out infinite}
.ht-wsay{font:700 clamp(30px,5vh,52px)/1.1 var(--font)}
.ht-wsay i{font-style:normal;animation:ht-dot 1.4s infinite}
.ht-wsay i:nth-child(2){animation-delay:.2s}.ht-wsay i:nth-child(3){animation-delay:.4s}
@keyframes ht-dot{0%,60%,100%{opacity:.2}30%{opacity:1}}
.ht-wsub{font-size:22px;color:var(--dark-text-2)}
/* playing */
.ht-dots{display:flex;justify-content:center;gap:10px;margin:0 0 10px;flex:none}
.ht-dot{width:48px;height:48px;border-radius:50%;border:3px solid transparent;background:var(--dark-2);color:var(--dark-text);font:700 20px/1 var(--font);display:grid;place-items:center;cursor:pointer;padding:0;touch-action:manipulation}
.ht-dot.cur{border-color:#F5B700}
.ht-dot.rev{background:#B98A00;color:#fff}
.ht-main{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.ht-stage{--ht-bg:var(--dark-2);flex:1;min-height:0;position:relative;border-radius:22px;background:var(--ht-bg);display:flex;flex-direction:column;padding:16px clamp(70px,9%,180px) 22px;overflow:hidden}
.ht-dir{flex:none;align-self:center;display:flex;align-items:center;gap:12px;font:600 clamp(18px,2.6vh,26px)/1.2 var(--font);color:var(--dark-text-2);margin-bottom:6px}
.ht-tag{font:700 .8em/1 var(--font);padding:.35em .6em;border-radius:.5em;background:var(--dark-3);color:var(--dark-text);letter-spacing:.03em}
.ht-area{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
.ht-text{position:relative;max-width:100%;text-align:center;color:#fff;font:700 60px/1.4 var(--font);flex:none}
.ht-w{display:inline-block}
.ht-text.ht-small{color:var(--dark-text-2);font-weight:600;margin-bottom:.6em}
.ht-ans{max-width:100%;text-align:center;color:#F5B700;font:800 60px/1.25 var(--font);flex:none;animation:ht-pop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes ht-pop{0%{transform:scale(.9);opacity:0}100%{transform:none;opacity:1}}
.ht-layer{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.ht-cov{position:absolute;background:var(--ht-bg);transform-origin:0 50%;transform:scaleX(0);animation:ht-eat var(--d) linear var(--del) both}
@keyframes ht-eat{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.ht-walk{position:absolute;z-index:2}
.ht-walk .ht-man{width:100%;height:100%;display:block;overflow:visible}
.ht-wait1 .ht-man{animation:ht-bob 1.1s ease-in-out infinite}
.ht-wait1 .ht-jaw{animation:ht-lick 1.6s ease-in-out infinite}
.ht-go{opacity:0;animation:ht-walk var(--d) linear var(--del) both,ht-vis var(--d) linear var(--del) none}
@keyframes ht-walk{from{transform:translateX(0)}to{transform:translateX(var(--x))}}
@keyframes ht-vis{0%,100%{opacity:1}}
.ht-go .ht-man{animation:ht-bob .36s ease-in-out infinite}
.ht-go .ht-jaw{animation:ht-chomp .26s ease-in-out infinite}
.ht-go .ht-l1{animation:ht-step .36s ease-in-out infinite}
.ht-go .ht-l2{animation:ht-step .36s ease-in-out infinite reverse}
@keyframes ht-chomp{0%,100%{transform:rotate(0)}50%{transform:rotate(-13deg)}}
@keyframes ht-lick{0%,70%,100%{transform:none}80%{transform:rotate(-12deg)}}
@keyframes ht-step{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes ht-bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-4%) rotate(-2deg)}}
.ht-jaw{transform-box:view-box;transform-origin:57px 57px}
.ht-cr{display:none;position:absolute;left:${MOUTH_X * 100}%;top:${MOUTH_Y * 100 + 6}%;width:7px;height:7px;border-radius:50%;background:#E2AC5E}
.ht-go .ht-cr{display:block;animation:ht-crumb .7s ease-in infinite}
.ht-go .ht-cr.c2{animation-delay:.23s;width:5px;height:5px;background:#fff}
.ht-go .ht-cr.c3{animation-delay:.47s;width:6px;height:6px}
@keyframes ht-crumb{0%{transform:translate(0,0);opacity:1}100%{transform:translate(-26px,60px);opacity:0}}
.ht-bar{position:absolute;left:clamp(70px,9%,180px);right:clamp(70px,9%,180px);bottom:10px;height:8px;border-radius:4px;background:var(--dark-3);overflow:hidden}
.ht-bar i{position:absolute;inset:0;background:#F5B700;transform-origin:0 50%;animation:ht-left linear both}
@keyframes ht-left{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.ht-write{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;animation:ht-pop .5s cubic-bezier(.3,1.6,.5,1)}
.ht .ico.ht-pen{width:clamp(60px,11vh,110px);height:clamp(60px,11vh,110px);color:#F5B700;stroke-width:1.6}
.ht-wt{font:800 clamp(44px,9vh,96px)/1 var(--font);color:#fff}
.ht-ws{font:600 clamp(22px,3.6vh,40px)/1.2 var(--font);color:var(--dark-text-2)}
.ht-full{position:absolute;left:-2%;bottom:0;display:flex;align-items:flex-start;gap:6px}
.ht-rest{width:clamp(90px,17vh,170px);height:auto;animation:ht-bob 1.4s ease-in-out infinite}
.ht-bub{margin-top:6%;padding:.4em .8em;border-radius:1em 1em 1em .2em;background:#fff;color:#111114;font:700 clamp(18px,2.8vh,28px)/1.1 var(--font);white-space:nowrap}
.ht-priv{display:none;position:absolute;left:50%;bottom:24px;transform:translateX(-50%);max-width:92%;padding:6px 16px;border-radius:12px;background:#F5B700;color:#111114;font:500 20px/1.3 var(--font);text-align:center;z-index:5}
.ht-priv b{font-weight:800}
.ht-stage.ph-rev .ht-priv{display:none !important}
.ht-foot{flex-wrap:nowrap}
.ht-foot .grow{flex:1}
.ht .clk-btn.gc-go{background:var(--ok);color:#fff}
.ht .clk-btn.gc-go:not(:disabled):active{background:#178049}
.ht .clk-btn.gc-arm{background:var(--danger);color:#fff}
.ht .clk-btn:disabled{opacity:.4;cursor:default}
.ht .clk-btn.ht-rv{background:#5B5B66;color:#fff}
.ht .clk-btn.ht-rv.on{background:#B98A00}
.ht .clk-btn.ht-eatb{min-width:200px}
.ht-fin{position:absolute;inset:0;z-index:6;display:grid;place-items:center;background:rgba(10,10,14,.72);border-radius:22px;cursor:pointer;animation:ht-in .3s ease}
@keyframes ht-in{from{opacity:0}to{opacity:1}}
.ht-fin-c{display:flex;flex-direction:column;align-items:center;gap:12px;padding:26px 40px;border-radius:24px;background:var(--dark-2);box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:default}
.ht-fman{width:clamp(90px,15vh,150px);height:auto;animation:ht-bob 1.2s ease-in-out infinite}
.ht-fin-t{font:800 clamp(40px,7vh,72px)/1 var(--font)}
.ht-fin-s{font-size:22px;color:var(--dark-text-2)}
.ht-fin-b{display:flex;gap:12px;margin-top:6px}
.ht-fin-x{font-size:15px;color:var(--dark-text-2)}
@media (prefers-reduced-motion: reduce){.ht-man,.ht-man *,.ht-cr,.ht-ans,.ht-write{animation:none !important}}
`;
// Teacher screen replica only (dual.js): the sentence and its answer, all the time.
const REP_CSS = `.ht-priv{display:block !important}.ht-stage.ph-rev .ht-priv{display:none !important}`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'ht-css', textContent:CSS }));

window.SVHungry = { open, close:hide, CSS, REP_CSS, setupOnConsole, cancelSetup, manSVG, get open_(){ return !!big; } };
})();
