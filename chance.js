/* =====================================================================
   Slideshow Viewer — Game of Chance (v1.29.2; Halloween mode v1.64; Christmas mode v1.65)
   Loaded after mission.js. Uses window.SVHost, window.SVIsland.

   Two teams (Team A ← / Team B →, sides of the room). A 4×4 grid of 16
   numbered cards. The game holds a pool of these 16:
     11 points cards   4 × +1, 4 × +2, 3 × +3
      1 Bankrupt       the team loses all its points
      1 Swap           the two teams swap scores
      1 Halve          the team's points halved, rounded down
      1 Steal 1        one point from the other team
      1 Double         the team's points × 2
   Nothing sits behind a number: the face is drawn at random from the pool
   at the moment the card is tapped, and only then put into the page. So
   the mix over a game is always the same 16; only the order is random.
   The teacher taps the team that's picking, then a card. The card flips,
   the result is announced over the grid and the scores change. When all
   16 are turned, the winner is shown; New game goes back to the start.
   Until a team has won its first point it never gets Bankrupt, Swap, Halve,
   Steal or ×2: the draw is from the pool's points cards only (if none are left,
   it gets +1 and one special card leaves the pool unseen). After that, a
   team on 0 can get anything.

   Two kinds of game, chosen on the start screen:
     quick   questions asked out loud. Big pop-up over the slide area, which
             can shrink to a small floating box (scores + mini grid; tapping
             a card there flips it in the big view, then shrinks back) and
             to a live score in the island.
     plan    a question set (Settings → Game of Chance questions). Fills the
             slide area. Next question → the question, big; the teacher taps
             who's answering, then Reveal answer / Wrong – pass to the other
             team (once) / Correct – reveal your fate (back to the grid with
             that team picking). Questions are shuffled each game and start
             again when they run out. On the dual-screen teacher console the
             answer shows straight away (.gc-priv, made visible by dual.js
             REP_CSS); the panel only shows it after Reveal answer.
   Sizes: big (pop-up) → float (quick only) → min (island readout) → closed.

   The game is in memory for the lesson (like Bob Up): leaving the lesson
   clears it; a trip to the editor and back keeps it.

   Saved in viewer-data.json:
     gcSets   [{ id, name, qs:[{ q, a }], updated }]   question sets
     gcPos    { x, y }   where the small box sits (fractions of the screen)
     lesson.gcSet        the lesson's default question set (Lesson settings)

   Card looks come from the theme (PLAIN, HALLOWEEN, CHRISTMAS; TH() picks), so
   seasonal versions can swap the backs, icons, words and scenery. Both seasonal
   modes add 5 sweet explosions: see the comment above seasonOn().
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
const uid = ()=> Math.random().toString(36).slice(2, 9);
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
function shuffle(arr){ for(let i=arr.length-1; i>0; i--){ const j = Math.floor(rand() * (i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

const IC = iconMap({
  dice: 'dices', x: 'x', up: 'chevron-up', plus: 'plus',
  minus: 'minus', left: 'chevron-left', right: 'chevron-right', back: 'chevron-left',
  shrink: 'minimize-2', expand: 'maximize-2', reset: 'rotate-ccw', grip: 'grip-vertical',
  check: 'check', eye: 'eye', pass: 'skip-forward', next: 'arrow-right',
  q: 'circle-help', trophy: 'trophy', bank: 'landmark', swap: 'arrow-left-right',
  halve: 'divide', steal: 'hand-coins', double: 'copy-plus', list: 'list', edit: 'pencil',
  trash: 'trash-2', ghost: 'ghost', cane: 'candy-cane',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- theme (seasonal versions swap this) ---------------- */
const PLAIN = {
  id:'plain',
  back:n => `<span class="gc-bn">${n}</span>`,
  face(c){
    switch(c.k){
      case 'pts':    return { cls:'gk-pts', ic:null, big:'+' + c.v, small:c.v===1 ? 'point' : 'points' };
      case 'bank':   return { cls:'gk-bank', ic:'bank', big:'Bankrupt', small:'lose all your points' };
      case 'swap':   return { cls:'gk-swap', ic:'swap', big:'Swap', small:'swap scores' };
      case 'halve':  return { cls:'gk-halve', ic:'halve', big:'Halve', small:'points halved, rounded down' };
      case 'steal':  return { cls:'gk-steal', ic:'steal', big:'Steal 1', small:'from the other team' };
      case 'double': return { cls:'gk-double', ic:'double', big:'×2', small:'double your points' };
    }
    return { cls:'', ic:'q', big:'?', small:'' };
  },
};

/* Seasonal modes (Settings → General → Games → Seasonal theme:
   data.settings.season = 'halloween' | 'christmas'; v1.64 files with
   settings.halloween = true read as Halloween). Same cards and odds.
   Halloween (v1.64) "Trick or Treat!": pumpkin card backs, purple night with
     bats and cobwebs, "Trick!" over Bankrupt, Swap and Halve, "Treat!" over the rest.
   Christmas (v1.65) "Christmas Cracker": cracker card backs, snowy night with
     fairy lights and trees, "Bah humbug!" over Bankrupt, Swap and Halve, "Ho ho ho!"
     over the rest; a sweet card snaps like a cracker (BANG!) before the sweets.
   In both, 5 of the 16 cards hide a sweet explosion: the pupil who picked it
   wins a sweet. Like the faces, nothing is behind a number: when a card is
   turned it gets a sweet with chance (sweets left ÷ cards left), so a full game
   always has exactly 5, anywhere in the grid. A game keeps the mode it started
   with (g.ss); the switch counts from the next game. */
function seasonOn(){
  const d = H() && H().data, s = d && d.settings; if(!s) return null;
  const v = s.season || (s.halloween ? 'halloween' : null);
  return v==='halloween' || v==='christmas' ? v : null;
}
const hwOn = ()=> seasonOn()==='halloween';
const SWEETS = 5;
const PUMPKIN = `<svg class="gc-pk" viewBox="0 0 120 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path d="M56 18c-1-7 1-12 7-15l5 4c-5 2-6 6-6 11z" fill="#4E7A2A"/>
  <path d="M64 12q12-8 19 1" stroke="#4E7A2A" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="33" cy="59" rx="27" ry="35" fill="#D9620F"/><ellipse cx="87" cy="59" rx="27" ry="35" fill="#D9620F"/>
  <ellipse cx="47" cy="58" rx="25" ry="39" fill="#EE7A1C"/><ellipse cx="73" cy="58" rx="25" ry="39" fill="#EE7A1C"/>
  <ellipse cx="60" cy="57" rx="20" ry="40" fill="#FF922E"/>
  <path d="M50 26q-7 31 0 62M70 26q7 31 0 62" stroke="#C9560A" stroke-width="2" fill="none" opacity=".55"/>
  <path d="M27 36q-6 10-4 22" stroke="#FFC27A" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
</svg>`;
const CANDY = `<svg class="gc-candy" viewBox="0 0 48 24" aria-hidden="true"><path d="M14 12 2 3v18zM34 12l12-9v18z" fill="#FF8CC6"/><ellipse cx="24" cy="12" rx="12" ry="9" fill="#FF4FA3"/><path d="M18 5q-3 7 0 14M24 3q-3 9 0 18M30 5q-3 7 0 14" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/></svg>`;
// Christmas card back: a cracker, the number on its middle. Halves (torn in the middle) for the snap.
const CK_END = `<path d="M4 16 34 30v20L4 64l5-8-5-8 5-8-5-8 5-8z" fill="#B3121B"/><path d="M4 16 34 30v4L6 22z" fill="#fff" opacity=".18"/>
  <rect x="32" y="33" width="14" height="14" fill="#8E0D14"/><rect x="35" y="31" width="5" height="18" rx="1.5" fill="#FFD23F"/>`;
const CK_TRIM = `<rect x="49" y="21" width="6" height="38" fill="#FFD23F"/><rect x="44" y="24" width="56" height="5" fill="#fff" opacity=".2"/>`;
const CRACKER = `<svg class="gc-ck" viewBox="2 12 196 56" preserveAspectRatio="none" aria-hidden="true">
  ${CK_END}<g transform="matrix(-1 0 0 1 200 0)">${CK_END}</g>
  <rect x="44" y="21" width="112" height="38" rx="5" fill="#D7262E"/>
  ${CK_TRIM}<g transform="matrix(-1 0 0 1 200 0)">${CK_TRIM}</g>
  <path d="M62 54l5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3" stroke="#FFD23F" stroke-width="1.6" fill="none" opacity=".8"/>
</svg>`;
const CK_HALF = `<svg viewBox="0 0 100 80" aria-hidden="true">${CK_END}
  <path d="M49 21H100l-5 4.75 5 4.75-5 4.75 5 4.75-5 4.75 5 4.75-5 4.75 5 4.75H49a5 5 0 0 1-5-5V26a5 5 0 0 1 5-5z" fill="#D7262E"/>${CK_TRIM}</svg>`;
const HALLOWEEN = {
  id:'halloween', cls:'gc-hw', name:'Trick or Treat!', ic:'ghost', icCls:'gc-ghost', chip:'Halloween', chipCls:'gc-hwchip',
  rule:`Halloween: ${SWEETS} cards hide a sweet explosion. Whoever picks one wins a sweet.`,
  sweetMsg:'Sweet explosion! Whoever picked it wins a sweet',
  back:n => `${PUMPKIN}<span class="gc-bn">${n}</span>`,
  face(c){
    const f = PLAIN.face(c), trick = c.k==='bank' || c.k==='swap' || c.k==='halve';
    if(!c.k) return f;
    return Object.assign(f, { tag:trick ? 'Trick!' : 'Treat!', cls:f.cls + (trick ? ' gk-trick' : ' gk-treat') });
  },
};
const CHRISTMAS = {
  id:'christmas', cls:'gc-xm', name:'Christmas Cracker', ic:'cane', icCls:'gc-cane', chip:'Christmas', chipCls:'gc-xmchip',
  rule:`Christmas: ${SWEETS} cards hide a cracker full of sweets. Whoever picks one wins a sweet.`,
  sweetMsg:'Cracker! Whoever picked it wins a sweet',
  back:n => `${CRACKER}<span class="gc-bn">${n}</span>`,
  face(c){
    const f = PLAIN.face(c), bad = c.k==='bank' || c.k==='swap' || c.k==='halve';
    if(!c.k) return f;
    return Object.assign(f, { tag:bad ? 'Bah humbug!' : 'Ho ho ho!', cls:f.cls + (bad ? ' gk-humbug' : ' gk-hoho') });
  },
};
Object.assign(PLAIN, { cls:'', name:'Game of Chance', ic:'dice', icCls:'' });
const THEMES = { halloween:HALLOWEEN, christmas:CHRISTMAS };
// The look for what's on screen: a game in progress keeps its own; the start screen follows the switch.
function themeOf(g){ return THEMES[g && g.started ? g.ss : seasonOn()] || PLAIN; }
const TH = ()=> themeOf(G);
// Seasonal modes rename the game ("Trick or Treat!" with Lucide's ghost, "Christmas Cracker" with its candy cane).
const gameIcon = (th, cls) => icon(th.ic, cls + (th.icCls ? ' ' + th.icCls : ''));

// The night behind the Halloween game: moon, cobwebs, bats, graveyard. A layer under the pop-up
// (sized with it by fit()), made once, so repaints don't restart the bats. Shown with .on.
function cobweb(cls){
  const A = [0, 16, 33, 51, 70, 90].map(d=>d * Math.PI / 180), R = [34, 70, 108, 148, 190];
  const pt = (r, a)=> `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  let d = A.map(a=>`M0 0L${pt(200, a)}`).join('');
  for(const r of R){ d += `M${pt(r, A[0])}`; for(let i=1; i<A.length; i++) d += `Q${pt(r * .86, (A[i-1] + A[i]) / 2)} ${pt(r, A[i])}`; }
  return `<svg class="gc-web ${cls}" viewBox="0 0 200 200" aria-hidden="true"><path d="${d}"/></svg>`;
}
const BAT = `<svg viewBox="0 0 64 30" aria-hidden="true"><path d="M32 9l-2-4-1 5c-3 1-5 5-6 9-3-4-8-5-12-3 1-5-2-10-7-12 3 4 2 9-1 12 5-1 10 1 12 5 3-3 7-3 10-1 2 1 4 4 5 6 1-2 3-5 5-6 3-2 7-2 10 1 2-4 7-6 12-5-3-3-4-8-1-12-5 2-8 7-7 12-4-2-9-1-12 3-1-4-3-8-6-9l-1-5z"/></svg>`;
HALLOWEEN.deco = `<span class="gc-moon"></span>${cobweb('tl')}${cobweb('tr')}
  <span class="gc-bat b1">${BAT}</span><span class="gc-bat b2">${BAT}</span><span class="gc-bat b3">${BAT}</span>
  <svg class="gc-grave" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40V26q40-12 90-6t80 2 70-8 80 4 80-2V40z"/></svg>
  <svg class="gc-stones" viewBox="0 0 400 40" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><path d="M40 40V24q0-8 9-8t9 8v16zM76 40V28q0-6 7-6t7 6v12zM318 40V22h-6v-4h6v-6h4v6h6v4h-6v18zM346 40V26q0-8 10-8t10 8v14z"/></svg>`;

// The snowy night behind the Christmas game: fairy lights along the top, falling snow, trees, snow drifts.
CHRISTMAS.deco = (()=>{
  // Four swags of wire (quadratic curves, 0–100 across, 4→36 down in a 400×40 box), bulbs hanging off them.
  const COLS = ['#FF4B4B', '#FFD23F', '#3EDB7A', '#4FA8FF', '#FF8AD8'];
  let wire = '', bulbs = '', n = 0;
  for(let i=0; i<4; i++){
    wire += `M${i*100} 4Q${i*100+50} 36 ${i*100+100} 4`;
    for(const t of [.14, .32, .5, .68, .86]){
      const x = i*100 + 100*t, y = (1-t)*(1-t)*4 + 2*t*(1-t)*36 + t*t*4;
      bulbs += `<span class="gc-bulb" style="left:${(x/4).toFixed(2)}%;top:${(y/40*100).toFixed(1)}%;--c:${COLS[n % COLS.length]};--dl:${((n*0.37) % 1.6).toFixed(2)}s"></span>`;
      n++;
    }
  }
  let snow = '';
  for(let i=0; i<46; i++){
    snow += `<span class="gc-flake" style="left:${(rand()*100).toFixed(1)}%;--w:${(.35 + rand()*.75).toFixed(2)}cqmin;--t:${(9 + rand()*10).toFixed(1)}s;--dl:${(-rand()*19).toFixed(1)}s;--dx:${((rand()-.5)*8).toFixed(1)}cqw;opacity:${(.45 + rand()*.5).toFixed(2)}"></span>`;
  }
  const tree = cls => `<svg class="gc-tree ${cls}" viewBox="0 0 60 90" aria-hidden="true">
    <rect x="26" y="76" width="8" height="12" fill="#3B2414"/>
    <path d="M30 6 46 34H38L54 58H43L60 80H0L17 58H6L22 34H14z" fill="#0F4630"/>
    <path d="M30 6 38 20 33 18 30 22 27 18 22 20zM14 34h8l3 3 5-3 5 3 3-3h8l-4 4-5-2-7 3-7-3-5 2zM6 58h11l4 3 9-3 9 3 4-3h11l-5 5-8-2-11 4-11-4-8 2z" fill="#E9F2FB" opacity=".9"/>
  </svg>`;
  return `<span class="gc-glow"></span><div class="gc-snow">${snow}</div>
    ${tree('l')}${tree('r')}
    <svg class="gc-drift" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40V22q30-12 70-6t90 4 80-10 90 6 70-4V40z"/><path d="M0 40V30q50-8 110-2t120 0 170-6V40z"/></svg>
    <div class="gc-lights"><svg viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="${wire}"/></svg>${bulbs}</div>`;
})();

// Sweets bursting out of a card. A layer over the pop-up (outside the part paint() redraws).
// Plain CSS animations with numbers in custom properties, so the teacher screen's copy plays them too.
const SWEET_SVG = [
  c=>`<svg viewBox="0 0 48 24"><path d="M14 12 2 3v18zM34 12l12-9v18z" fill="${c}" opacity=".7"/><ellipse cx="24" cy="12" rx="12" ry="9" fill="${c}"/><path d="M18 5q-3 7 0 14M24 3q-3 9 0 18M30 5q-3 7 0 14" stroke="#fff" stroke-width="2" fill="none" opacity=".55"/></svg>`,
  c=>`<svg viewBox="0 0 24 40"><rect x="10.8" y="19" width="2.6" height="20" rx="1.3" fill="#F3E9D2"/><circle cx="12" cy="11" r="10" fill="${c}"/><path d="M12 11a2.5 2.5 0 1 1 2.5 2.5 5 5 0 1 1-5-5 7.5 7.5 0 1 1 7.5 7.5" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/></svg>`,
  ()=>`<svg viewBox="0 0 24 28"><path d="M12 2 15.3 9H8.7z" fill="#FFF8E7" stroke="#FFF8E7" stroke-width="2" stroke-linejoin="round"/><path d="M8.7 9h6.6l3.8 9H4.9z" fill="#FF8A1F"/><path d="M4.9 18h14.2L22 25q-10 3-20 0z" fill="#FFD23F"/></svg>`,
  c=>`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="8.5" cy="8.5" r="3" fill="#fff" opacity=".45"/></svg>`,
];
const SWEET_COL = ['#FF4FA3', '#7CFF6B', '#FFB020', '#B57BFF', '#4FD8FF', '#FF5A36', '#FFE14F'];
HALLOWEEN.sweets = SWEET_SVG; HALLOWEEN.sweetCol = SWEET_COL;
// Christmas: wrapped sweets, candy canes, chocolate coins, gumballs.
CHRISTMAS.sweets = [
  SWEET_SVG[0],
  ()=>`<svg viewBox="0 0 24 40"><path d="M8 38V13a6 6 0 0 1 12 0v4" stroke="#FFF8F0" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8 38V13a6 6 0 0 1 12 0v4" stroke="#E8333A" stroke-width="5" fill="none" stroke-dasharray="3 3.5"/></svg>`,
  ()=>`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#E8B830"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#A9781A" stroke-width="1.4"/><path d="M12 7.6l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="#A9781A"/></svg>`,
  SWEET_SVG[3],
];
CHRISTMAS.sweetCol = ['#E8333A', '#2FAE5F', '#FFD23F', '#F4F4F4', '#4FA8FF', '#B3121B'];
function burst(btn){
  if(!big) return;
  const th = TH(), xm = th===CHRISTMAS;
  const svgs = th.sweets || SWEET_SVG, cols = th.sweetCol || SWEET_COL;
  const r = btn.getBoundingClientRect(), hr = big.card.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2, S = Math.min(hr.width, hr.height);
  const layer = el('div', 'gc-burst' + (th.cls ? ' ' + th.cls : ''));
  let h = '';
  // Christmas: the cracker is pulled and snaps (BANG!), then the sweets fly out of the middle.
  if(xm) h += `<span class="gc-snap" style="left:${x}px;top:${y}px;--s:${Math.max(r.width * 1.1, S * .32).toFixed(0)}px"><span class="gc-snap-l">${CK_HALF}</span><span class="gc-snap-r">${CK_HALF}</span><b class="gc-bang">BANG!</b></span>`;
  const d0 = xm ? 260 : 0;
  h += `<span class="gc-boom" style="left:${x}px;top:${y}px;--s:${(S * .9).toFixed(0)}px;animation-delay:${d0}ms"></span>`;
  for(let i=0; i<54; i++){
    const a = rand() * Math.PI * 2, sp = S * (.18 + rand() * .42);
    const dx = Math.cos(a) * sp * 1.3, py = Math.sin(a) * sp * .7 - S * (.12 + rand() * .14), ey = py + S * (.55 + rand() * .45);
    const svg = svgs[Math.floor(rand() * svgs.length)](cols[Math.floor(rand() * cols.length)]);
    h += `<span class="gc-sweetp" style="left:${x}px;top:${y}px;--w:${(S * (.04 + rand() * .035)).toFixed(0)}px;--dx:${dx.toFixed(0)}px;--py:${py.toFixed(0)}px;--ey:${ey.toFixed(0)}px;--r:${((rand() - .5) * 1080).toFixed(0)}deg;--t:${(1700 + rand() * 600).toFixed(0)}ms;--dl:${(d0 + rand() * 90).toFixed(0)}ms">${svg}</span>`;
  }
  layer.innerHTML = h;
  big.back.appendChild(layer);
  setTimeout(()=>layer.remove(), 3000 + d0);
}
// The 16 cards (the pool cards are drawn from). Kept out of THEME: a seasonal theme changes looks, not odds.
function deck(){
  const out = [1,1,1,1,2,2,2,2,3,3,3].map(v=>({ k:'pts', v }));
  out.push({ k:'bank' }, { k:'swap' }, { k:'halve' }, { k:'steal' }, { k:'double' });
  return out;
}
// The 16 places on the grid. A place gets its card (k, v) only when it's turned.
const slots = ()=> Array.from({ length:16 }, ()=>({ open:false, by:null }));
// Take a card out of the pool for team t. A team that hasn't scored yet only draws points.
function draw(g, t){
  const pool = g.pool;
  const ok = g.scored && g.scored[t];
  const can = pool.map((x, j)=>j).filter(j=> ok || pool[j].k==='pts');
  if(!can.length){
    // Only specials left and this team can't have one: +1, and one special goes unseen so the pool still matches the grid.
    if(pool.length) pool.splice(Math.floor(rand() * pool.length), 1);
    return { k:'pts', v:1 };
  }
  const j = can[Math.floor(rand() * can.length)];
  return pool.splice(j, 1)[0];
}
const TEAM = { a:'Team A', b:'Team B' };
const other = t => t==='a' ? 'b' : 'a';

/* ---------------- data ---------------- */
function D(){
  const h = H(); const d = h && h.data; if(!d) return null;
  if(!Array.isArray(d.gcSets)) d.gcSets = [];
  d.gcSets = d.gcSets.filter(s=>s && typeof s.name==='string' && Array.isArray(s.qs));
  return d;
}
const save = ()=> H().save();
const lesson = ()=> H() && H().lesson;
const sets = ()=> (D() && D().gcSets) || [];
const setById = id => sets().find(s=>s.id===id) || null;

/* Paste: one question per line. "question = answer", or two columns
   (tab-separated, as copied from Excel or a Word table). A line without
   an answer is kept (Reveal answer is then hidden). */
function parseLines(text){
  const out = [];
  for(let line of String(text || '').split(/\r?\n/)){
    if(!line.trim()) continue;
    let q, a;
    const tab = line.indexOf('\t');
    if(tab >= 0){ q = line.slice(0, tab); a = line.slice(tab + 1).replace(/\t+/g, ' '); }
    else { const eq = line.indexOf('='); if(eq >= 0){ q = line.slice(0, eq); a = line.slice(eq + 1); } else { q = line; a = ''; } }
    q = q.replace(/\s+/g, ' ').trim(); a = a.replace(/\s+/g, ' ').trim();
    if(/^(question|questions|q)$/i.test(q) && /^(answer|answers|a)$/i.test(a)) continue; // header row
    if(q) out.push({ q:q.slice(0, 400), a:a.slice(0, 300) });
  }
  return out;
}
const linesOf = qs => qs.map(x=> x.a ? `${x.q} = ${x.a}` : x.q).join('\n');

/* ---------------- game state (memory, per lesson) ---------------- */
let G = null;
function fresh(lid){
  return { lid, started:false, mode:'quick', setId:null, cards:[], a:0, b:0, sel:null,
           view:'start', size:'closed', busy:false, ann:null, over:false, arm:false,
           pick:{ mode:'quick', setId:null }, q:null, retFloat:false, nudge:0 };
}
function game(){
  const l = lesson(); if(!l) return null;
  if(!G || G.lid!==l.id) G = fresh(l.id);
  return G;
}
function startGame(mode, setId){
  const g = game(); if(!g) return;
  const set = mode==='plan' ? setById(setId) : null;
  if(mode==='plan' && (!set || !set.qs.length)){ H().toast('That question set has no questions yet.', true); return; }
  const ss = seasonOn();
  Object.assign(g, { ss, sweets:ss ? SWEETS : 0, started:true, mode:set ? 'plan' : 'quick', setId:set ? set.id : null, cards:slots(), pool:shuffle(deck()), a:0, b:0, scored:{ a:false, b:false }, sel:null,
                     view:'board', busy:false, ann:null, over:false, arm:false, retFloat:false });
  g.pick = { mode:g.mode, setId:g.setId };
  g.q = set ? { order:shuffle(set.qs.map((_, i)=>i)), i:-1, team:null, passed:false, shown:false, done:true, flash:null, laps:0 } : null;
}

/* ---------------- big view ---------------- */
let big = null; // { back, card, annT, flashT, armT }

function open(){
  const l = lesson();
  if(!l){ H().toast('Open a lesson to use Game of Chance.'); return; }
  const g = game();
  if(!g.started){
    g.view = 'start';
    const def = l.gcSet && setById(l.gcSet);
    g.pick = def && def.qs.length ? { mode:'plan', setId:def.id } : { mode:'quick', setId:null };
  }
  showBig();
}
function showBig(){
  const g = game(); if(!g) return;
  if(window.SVPoints && window.SVPoints.close) window.SVPoints.close();
  hideFloat();
  g.size = 'big';
  if(!big){
    const back = el('div', 'ap-back gc-back'), deco = el('div', 'gc-deco'), card = el('div', 'ap gc');
    back.appendChild(deco); back.appendChild(card); document.body.appendChild(back);
    card.addEventListener('click', onClick);
    big = { back, card, deco };
  }
  fit(); paint(); paintIsland();
}
function closeBig(){
  if(!big) return;
  clearTimeout(big.annT); clearTimeout(big.flashT); clearTimeout(big.armT);
  big.back.remove(); big = null;
}
// The pop-up covers the slide area exactly, so the teacher console's copy (cropped to it) shows all of it.
function fit(){
  if(!big) return;
  const host = $('.present:not(.preview) .stage-host');
  const box = host ? (r=>({ left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px' }))(host.getBoundingClientRect())
    : { left:'2vw', top:'4vh', width:'96vw', height:'92vh' };
  Object.assign(big.card.style, box);
  Object.assign(big.deco.style, box);
}
window.addEventListener('resize', ()=>{ fit(); placeFloat(); });

function toMin(){ const g = game(); closeBig(); hideFloat(); if(g){ g.size = 'min'; g.retFloat = false; } paintIsland(); }
function toFloat(){ const g = game(); if(!g || g.mode!=='quick') return; closeBig(); g.size = 'float'; showFloat(); paintIsland(); }

function head(g){
  const set = g.mode==='plan' ? setById(g.setId) : null;
  const playing = g.started && g.view!=='start';
  return `<div class="ap-head gc-head">
    <div class="ap-title">${gameIcon(TH(), 'ico gc-ic')}${esc(TH().name)}</div>
    ${TH().chip ? `<span class="ap-chip ${TH().chipCls}">${TH().chip}</span>` : ''}
    ${playing ? `<span class="ap-chip">${set ? esc(set.name) : 'Quick game'}</span>` : ''}
    <div class="grow"></div>
    ${playing && !g.busy ? `<button class="clk-btn ${g.arm ? 'gc-arm' : ''}" data-b="new">${icon('reset')}${g.arm ? 'Tap again for a new game' : 'New game'}</button>` : ''}
    ${playing && g.mode==='quick' ? `<button class="clk-btn" data-b="shrink" title="Small box over the slide" ${g.busy ? 'disabled' : ''}>${icon('shrink')}Shrink</button>` : ''}
    <button class="tb-ic" data-b="min" title="${playing ? 'Hide (the score stays in the top bar)' : 'Close'}" ${g.busy ? 'disabled' : ''}>${icon('x')}</button>
  </div>`;
}
function paint(){
  if(!big) return;
  const g = game(); if(!g) return;
  const card = big.card;
  const th = TH();
  card.className = 'ap gc gc-v-' + (g.view==='start' || !g.started ? 'start' : g.view) + (th.cls ? ' ' + th.cls : '');
  // The scene behind is only rebuilt when the theme changes, so repaints don't restart its animations.
  if(big.decoId!==th.id){ big.deco.innerHTML = th.deco || ''; big.decoId = th.id; }
  big.deco.className = 'gc-deco' + (th.deco ? ' on ' + th.cls : '');
  if(g.view==='start' || !g.started){ card.innerHTML = head(g) + startHTML(g); return; }
  card.innerHTML = head(g) + `<div class="gc-body">
      ${teamHTML(g, 'a')}
      <div class="gc-mid">${g.view==='question' ? questionHTML(g) : gridHTML(g)}${g.ann ? annHTML(g) : ''}${g.over && !g.ann ? winHTML(g) : ''}</div>
      ${teamHTML(g, 'b')}
    </div>
    <div class="ap-foot gc-foot">${footHTML(g)}</div>`;
}

/* start screen */
function startHTML(g){
  const l = lesson(), def = l && l.gcSet;
  const list = sets().filter(s=>s.qs.length);
  const p = g.pick;
  return `<div class="gc-start">
    <button class="gc-opt ${p.mode==='quick' ? 'on' : ''}" data-mode="quick">
      <span class="gc-opt-t">${icon('dice')}Quick game</span>
      <span class="gc-opt-d">Ask the questions out loud. When a team gets one right, they pick a card. The game can shrink so the slide stays in view.</span>
    </button>
    <div class="gc-opt gc-opt-q ${p.mode==='plan' ? 'on' : ''}">
      <button class="gc-opt-head" data-mode="plan" ${list.length ? '' : 'disabled'}>
        <span class="gc-opt-t">${icon('list')}With questions</span>
        <span class="gc-opt-d">Questions from a set show on the screen, with the answer hidden until you reveal it.</span>
      </button>
      ${list.length ? `<div class="gc-sets">${list.map(s=>`<button class="gc-set ${p.mode==='plan' && p.setId===s.id ? 'on' : ''}" data-set="${esc(s.id)}"><span class="nm">${esc(s.name)}</span><small>${s.qs.length} question${s.qs.length===1 ? '' : 's'}${s.id===def ? ' · this lesson' : ''}</small></button>`).join('')}</div>`
        : `<p class="gc-none">No question sets yet. Add them on the dashboard: <b>Settings → Question sets</b>.</p>`}
    </div>
  </div>
  <div class="ap-foot gc-foot">
    <div class="ap-sum gc-rules">16 cards: 11 points (+1 to +3), Bankrupt, Swap, Halve, Steal 1 and ×2${TH().rule ? `<br><span class="gc-hwrule">${CANDY}${esc(TH().rule)}</span>` : ''}</div>
    <button class="clk-btn lg gc-go" data-b="start" ${p.mode==='plan' && !setById(p.setId) ? 'disabled' : ''}>${icon('check')}Start</button>
  </div>`;
}

/* team columns */
function teamHTML(g, t){
  const s = g[t], o = g[other(t)];
  const label = t==='a' ? `${icon('left', 'ico gc-arr')}${TEAM.a}` : `${TEAM.b}${icon('right', 'ico gc-arr')}`;
  const qTeam = g.view==='question' && g.q && g.q.team===t;
  const picking = g.view!=='question' && g.sel===t;
  return `<div class="gc-team gc-t${t} ${s > o ? 'lead' : ''} ${picking ? 'sel' : ''} ${qTeam ? 'sel' : ''}">
    <button class="gc-tbtn ${g.nudge && !g.sel && g.view==='board' ? 'nudge' : ''}" data-team="${t}" ${g.busy || g.over ? 'disabled' : ''}>
      <span class="gc-tname">${label}</span>
      <span class="gc-score" data-score="${t}">${s}</span>
      <span class="gc-tsub">${picking ? 'Picking a card' : qTeam ? 'Answering' : g.view==='board' && !g.over ? 'Tap to pick' : '&nbsp;'}</span>
    </button>
    <div class="gc-pm">
      <button class="tl-pmb" data-adj="-1" data-t="${t}" title="Take a point off" ${s && !g.busy ? '' : 'disabled'}>${icon('minus')}</button>
      <button class="tl-pmb gc-plus" data-adj="1" data-t="${t}" title="Add a point" ${g.busy ? 'disabled' : ''}>${icon('plus')}</button>
    </div>
  </div>`;
}

/* the grid */
// An unturned card has a blank face: what it will be isn't decided (or in the page) until it's tapped.
function faceHTML(c){
  if(!c.open || !c.k) return `<span class="gc-face"></span>`;
  const f = TH().face(c);
  return `<span class="gc-face ${f.cls} ${c.sweet ? 'gc-sweet' : ''}">${c.by ? `<i class="gc-by gc-by${c.by}">${c.by.toUpperCase()}</i>` : ''}${c.sweet ? `<i class="gc-sw" title="Sweet!">${CANDY}</i>` : ''}${f.tag ? `<em class="gc-tag">${esc(f.tag)}</em>` : ''}${f.ic ? icon(f.ic, 'ico gc-fic') : ''}<b>${esc(f.big)}</b><small>${esc(f.small)}</small></span>`;
}
function cardHTML(c, i, cls){
  return `<button class="${cls} ${c.open ? 'open' : ''}" data-i="${i}" ${c.open ? 'disabled' : ''}>
    <span class="gc-in">
      <span class="gc-back-face">${TH().back(i+1)}</span>
      ${faceHTML(c)}
    </span>
  </button>`;
}
function gridHTML(g){
  return `<div class="gc-grid ${g.busy ? 'busy' : ''}">${g.cards.map((c, i)=>cardHTML(c, i, 'gc-card')).join('')}</div>`;
}

/* question view (plan) */
function qFit(t){ const n = t.length; return n <= 30 ? 'xl' : n <= 70 ? 'l' : n <= 140 ? 'm' : 's'; }
function curQ(g){
  const set = setById(g.setId); if(!set || !g.q || g.q.i < 0) return null;
  return set.qs[g.q.order[g.q.i]] || null;
}
function questionHTML(g){
  const q = g.q, x = curQ(g);
  if(!x) return `<div class="gc-q"><p class="gc-none">This question set has gone. Start a new game.</p></div>`;
  const total = q.order.length, n = q.i + 1;
  return `<div class="gc-q">
    <div class="gc-qtop">
      <span class="gc-qn">${icon('q')}Question ${n} of ${total}${q.laps ? ' · round ' + (q.laps + 1) : ''}</span>
      <span class="gc-who">Answering:
        <button class="gc-whob gc-ta ${q.team==='a' ? 'on' : ''}" data-qteam="a">${icon('left', 'ico gc-arr')}${TEAM.a}</button>
        <button class="gc-whob gc-tb ${q.team==='b' ? 'on' : ''}" data-qteam="b">${TEAM.b}${icon('right', 'ico gc-arr')}</button>
      </span>
    </div>
    <div class="gc-qtext gc-f${qFit(x.q)}">${esc(x.q)}</div>
    ${x.a ? (q.shown
      ? `<div class="gc-ans gc-f${qFit(x.a)}">${esc(x.a)}</div>`
      : `<div class="gc-ans hid"><span>Answer hidden</span><span class="gc-priv">Answer: ${esc(x.a)}</span></div>`)
      : `<div class="gc-ans hid"><span>No answer saved for this question</span></div>`}
    ${q.flash ? `<div class="gc-qflash">${esc(q.flash)}</div>` : ''}
  </div>`;
}

/* result banner */
function annHTML(g){
  const a = g.ann, f = TH().face(a.card);
  return `<div class="gc-ann ${f.cls} gc-ann${a.team} ${a.card.sweet ? 'gc-ann-sw' : ''}" data-b="ann">
    <div class="gc-ann-in">
      <div class="gc-ann-team">${esc(TEAM[a.team])}</div>
      ${f.tag ? `<div class="gc-ann-tag">${esc(f.tag)}</div>` : ''}
      <div class="gc-ann-big">${f.ic ? icon(f.ic, 'ico gc-aic') : ''}${esc(f.big)}</div>
      <div class="gc-ann-txt">${esc(a.text)}</div>
      ${a.card.sweet ? `<div class="gc-ann-sweet">${CANDY}<span>${esc(TH().sweetMsg)}</span>${CANDY}</div>` : ''}
    </div>
  </div>`;
}
function winHTML(g){
  const draw = g.a===g.b, w = g.a > g.b ? 'a' : 'b';
  return `<div class="gc-win">
    <div class="gc-win-in">
      ${icon('trophy', 'ico gc-wic')}
      <div class="gc-win-t">${draw ? "It's a draw!" : `${esc(TEAM[w])} wins!`}</div>
      <div class="gc-win-s"><span class="gc-ca">${g.a}</span> – <span class="gc-cb">${g.b}</span></div>
      <div class="gc-win-b">
        <button class="clk-btn lg" data-b="min">${icon('x')}Close</button>
        <button class="clk-btn lg gc-go" data-b="restart">${icon('reset')}New game</button>
      </div>
    </div>
  </div>`;
}

function footHTML(g){
  const left = g.cards.filter(c=>!c.open).length;
  let msg;
  if(g.flash) msg = `<span class="ap-flash ${g.flash.ok ? '' : 'no'}">${esc(g.flash.txt)}</span>`;
  else if(g.over) msg = 'All the cards have been turned.';
  else if(g.view==='question') msg = '';
  else if(g.busy) msg = '';
  else if(g.sel) msg = `<b class="gc-c${g.sel}">${esc(TEAM[g.sel])}</b>: pick a card`;
  else msg = g.mode==='plan' ? 'Next question, or tap a team, then a card.' : 'Right answer? Tap the team, then a card.';
  const sw = g.ss ? `<span class="gc-left gc-swleft">${CANDY}${g.sweets} sweet${g.sweets===1 ? '' : 's'} left</span>` : '';
  const pre = `<div class="ap-sum">${msg}</div>${sw}<span class="gc-left">${left} card${left===1 ? '' : 's'} left</span>`;
  if(g.mode!=='plan' || g.over) return pre;
  const q = g.q;
  if(g.view==='question'){
    const x = curQ(g), t = q.team;
    return `<button class="clk-btn lg" data-b="board">${icon('back')}Board</button>
      <div class="grow"></div>
      <button class="clk-btn lg" data-b="nextq">${icon('next')}Next question</button>
      ${x && x.a ? `<button class="clk-btn lg gc-reveal" data-b="reveal" ${q.shown ? 'disabled' : ''}>${icon('eye')}Reveal answer</button>` : ''}
      <button class="clk-btn lg gc-wrong" data-b="pass" ${t && !q.passed ? '' : 'disabled'}>${icon('pass')}${t ? (q.passed ? 'Already passed' : `Wrong – pass to ${TEAM[other(t)]}`) : 'Wrong – pass'}</button>
      <button class="clk-btn lg gc-go" data-b="correct" ${t ? '' : 'disabled'}>${icon('check')}${t ? 'Correct – reveal your fate' : 'Tap who’s answering'}</button>`;
  }
  return pre + `${!q.done ? `<button class="clk-btn lg" data-b="backq" ${g.busy ? 'disabled' : ''}>${icon('q')}Back to question</button>` : ''}
    <button class="clk-btn lg gc-go" data-b="nextq" ${g.busy ? 'disabled' : ''}>${icon('next')}Next question</button>`;
}

function flash(txt, ok){
  const g = game(); if(!g) return;
  g.flash = { txt, ok }; paint();
  if(big){ clearTimeout(big.flashT); big.flashT = setTimeout(()=>{ const h = game(); if(h){ h.flash = null; paint(); } }, 2600); }
}
function qFlash(txt){
  const g = game(); if(!g || !g.q) return;
  g.q.flash = txt; paint();
  if(big){ clearTimeout(big.flashT); big.flashT = setTimeout(()=>{ const h = game(); if(h && h.q){ h.q.flash = null; paint(); } }, 2200); }
}
function bump(t){
  const s = (big && big.card.querySelector(`[data-score="${t}"]`));
  if(s){ s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
}

function onClick(e){
  const g = game(); if(!g || !big) return;
  const b = e.target.closest('button, [data-b="ann"]'); if(!b || b.disabled) return;
  const a = b.dataset.b;
  if(a!=='new' && g.arm){ g.arm = false; clearTimeout(big.armT); }
  if(b.dataset.mode){ g.pick.mode = b.dataset.mode; if(g.pick.mode==='plan' && !setById(g.pick.setId)){ const s = sets().find(x=>x.qs.length); g.pick.setId = s ? s.id : null; } paint(); return; }
  if(b.dataset.set){ g.pick = { mode:'plan', setId:b.dataset.set }; paint(); return; }
  if(b.dataset.team){ if(g.busy || g.over) return; g.sel = g.sel===b.dataset.team ? null : b.dataset.team; g.nudge = 0; paint(); paintFloat(); return; }
  if(b.dataset.adj){ const t = b.dataset.t; g[t] = Math.max(0, g[t] + Number(b.dataset.adj)); markScored(g); paint(); paintFloat(); paintIsland(); if(b.dataset.adj==='1') bump(t); return; }
  if(b.dataset.i!=null){ flip(Number(b.dataset.i)); return; }
  if(b.dataset.qteam){ g.q.team = b.dataset.qteam; paint(); return; }
  switch(a){
    case 'min': toMin(); return;
    case 'shrink': toFloat(); return;
    case 'start': startGame(g.pick.mode, g.pick.setId); fit(); paint(); paintIsland(); return;
    case 'restart': g.started = false; g.view = 'start'; g.over = false; paint(); paintIsland(); return;
    case 'new':
      clearTimeout(big.armT);
      if(g.arm){ g.arm = false; g.started = false; g.view = 'start'; g.over = false; g.ann = null; paint(); paintIsland(); }
      else { g.arm = true; paint(); big.armT = setTimeout(()=>{ const h = game(); if(h && h.arm){ h.arm = false; paint(); } }, 3000); }
      return;
    case 'ann': endAnn(); return;
    case 'nextq': nextQ(); return;
    case 'backq': g.view = 'question'; paint(); return;
    case 'board': g.view = 'board'; paint(); return;
    case 'reveal': g.q.shown = true; paint(); return;
    case 'pass': if(g.q.team && !g.q.passed){ g.q.team = other(g.q.team); g.q.passed = true; qFlash(`Over to ${TEAM[g.q.team]}`); } return;
    case 'correct': if(g.q.team){ g.sel = g.q.team; g.q.done = true; g.view = 'board'; paint(); paintFloat(); } return;
  }
}

function nextQ(){
  const g = game(); if(!g || !g.q) return;
  const set = setById(g.setId); if(!set || !set.qs.length){ flash('This question set has no questions.', false); return; }
  const q = g.q;
  let note = null;
  if(q.order.length!==set.qs.length) q.order = shuffle(set.qs.map((_, i)=>i)); // set edited mid-game
  q.i++;
  if(q.i >= q.order.length){
    // All used: shuffle again, avoiding the same question twice in a row.
    const last = q.order[q.order.length - 1];
    q.order = shuffle(set.qs.map((_, i)=>i));
    if(q.order.length > 1 && q.order[0]===last) [q.order[0], q.order[1]] = [q.order[1], q.order[0]];
    q.i = 0; q.laps++;
    note = 'All the questions have been used. Starting again.';
  }
  Object.assign(q, { team:null, passed:false, shown:false, done:false, flash:note });
  g.sel = null; g.view = 'question';
  paint();
  if(note && big){ clearTimeout(big.flashT); big.flashT = setTimeout(()=>{ const h = game(); if(h && h.q){ h.q.flash = null; paint(); } }, 3000); }
}

/* ---------------- turning a card ---------------- */
function outcome(g, t, c){
  const o = other(t), before = { a:g.a, b:g.b }, T = TEAM[t], O = TEAM[o];
  let text;
  switch(c.k){
    case 'pts': g[t] += c.v; text = `${T}: ${before[t]} → ${g[t]}`; break;
    case 'bank': g[t] = 0; text = before[t] ? `${T} loses all ${before[t]} point${before[t]===1 ? '' : 's'}` : `${T} had no points to lose`; break;
    case 'swap': g.a = before.b; g.b = before.a; text = before.a===before.b ? `Scores were level: still ${g.a} – ${g.b}` : `${T} now has ${g[t]}, ${O} has ${g[o]}`; break;
    case 'halve': { const n = Math.floor(before[t] / 2); g[t] = n; text = before[t] ? `${T}: ${before[t]} ÷ 2 = ${n}` : `${T}: 0 ÷ 2 is still 0`; break; }
    case 'steal':
      if(g[o] > 0){ g[o]--; g[t]++; text = `${T} takes a point from ${O}`; }
      else text = `${O} has no points to steal`;
      break;
    case 'double': g[t] *= 2; text = before[t] ? `${T}: ${before[t]} × 2 = ${g[t]}` : `${T}: 0 × 2 is still 0`; break;
  }
  return text;
}
function markScored(g){
  if(!g.scored) g.scored = { a:false, b:false };
  if(g.a > 0) g.scored.a = true;
  if(g.b > 0) g.scored.b = true;
}
function flip(i){
  const g = game(); if(!g || g.busy || g.over) return;
  const c = g.cards[i]; if(!c || c.open) return;
  if(!g.sel){
    g.nudge++;
    if(g.size==='float'){ paintFloat(); const f = fl && fl.querySelector('.gcf-teams'); if(f){ f.classList.remove('nope'); void f.offsetWidth; f.classList.add('nope'); } return; }
    flash('Tap the team that’s picking first', false);
    return;
  }
  if(g.size==='float'){ g.retFloat = true; showBig(); }
  if(!big) return;
  const t = g.sel;
  // The card is decided now, from what's left in the pool (draw() keeps specials
  // away from a team that hasn't scored yet). Its face only goes into the page here,
  // just before the flip, so nothing else can ever be seen.
  if(!Array.isArray(g.pool)) g.pool = [];
  Object.assign(c, draw(g, t));
  // Seasonal modes: a sweet with chance (sweets left ÷ cards left, this one included), so a full game has exactly SWEETS.
  c.sweet = false;
  if(g.ss && g.sweets > 0){ const left = g.cards.filter(x=>!x.open).length; if(rand() * left < g.sweets){ c.sweet = true; g.sweets--; } }
  g.busy = true; g.flash = null;
  c.open = true; c.by = t;
  const text = outcome(g, t, c);
  markScored(g);
  // Flip the card that's on screen (a repaint would skip the animation), then announce.
  const btn = big.card.querySelector(`.gc-card[data-i="${i}"]`);
  $$('.gc-card', big.card).forEach(x=>x.classList.add('dim'));
  if(btn){
    const face = btn.querySelector('.gc-face'); if(face) face.outerHTML = faceHTML(c);
    btn.classList.remove('dim'); btn.classList.add('flipping'); requestAnimationFrame(()=>requestAnimationFrame(()=>btn.classList.add('open')));
  }
  const run = big;
  if(c.sweet && btn) setTimeout(()=>{ if(big===run) burst(btn); }, 420); // as the face comes round
  clearTimeout(big.annT);
  big.annT = setTimeout(()=>{
    if(big!==run) return;
    g.ann = { team:t, card:c, text };
    g.sel = null;
    paint(); paintIsland();
    bump('a'); bump('b');
    big.annT = setTimeout(()=>{ if(big===run) endAnn(); }, c.sweet ? 5000 : c.k==='pts' ? 2600 : 3600);
  }, c.sweet ? 2300 : 900); // a sweet card: let the explosion play out over the board first
}
function endAnn(){
  const g = game(); if(!g || !g.ann) return;
  if(big) clearTimeout(big.annT);
  g.ann = null; g.busy = false;
  g.over = g.cards.every(c=>c.open);
  if(g.retFloat && !g.over){ g.retFloat = false; toFloat(); return; }
  g.retFloat = false;
  paint(); paintFloat(); paintIsland();
}

/* ---------------- small floating box (quick game) ---------------- */
let fl = null;
function showFloat(){
  if(!fl){
    fl = el('div', 'gc-float');
    document.body.appendChild(fl);
    fl.addEventListener('click', onFloatClick);
    fl.addEventListener('pointerdown', dragStart);
  }
  paintFloat(); placeFloat();
}
function hideFloat(){ if(fl){ fl.remove(); fl = null; } }
function paintFloat(){
  if(!fl) return;
  const g = game(); if(!g || !g.started){ hideFloat(); return; }
  const team = t => `<button class="gcf-team gc-t${t} ${g.sel===t ? 'sel' : ''} ${g[t] > g[other(t)] ? 'lead' : ''}" data-team="${t}" ${g.over ? 'disabled' : ''}>
      <span class="gcf-tn">${t==='a' ? icon('left', 'ico gc-arr') + 'A' : 'B' + icon('right', 'ico gc-arr')}</span><span class="gcf-s">${g[t]}</span></button>`;
  fl.classList.toggle('gc-hw', g.ss==='halloween'); fl.classList.toggle('gc-xm', g.ss==='christmas');
  fl.innerHTML = `<div class="gcf-head" data-drag>
      <span class="b4f-grip">${icon('grip')}</span><span class="b4f-t">${gameIcon(themeOf(g), 'ico gc-ic')}${esc(themeOf(g).name)}</span>
      <button class="b4f-b" data-f="big" title="Make bigger">${icon('expand')}</button>
      <button class="b4f-b" data-f="min" title="Shrink to the top bar">${icon('up')}</button>
    </div>
    <div class="gcf-body">
      <div class="gcf-teams">${team('a')}${team('b')}</div>
      <div class="gcf-grid">${g.cards.map((c, i)=>{ const f = TH().face(c); return `<button class="gcf-c ${c.open ? 'open ' + f.cls : ''} ${c.open && c.by ? 'by' + c.by : ''} ${c.open && c.sweet ? 'sw' : ''}" data-i="${i}" ${c.open || g.over ? 'disabled' : ''}>${c.open ? esc(f.big) : i+1}</button>`; }).join('')}</div>
    </div>
    <div class="gcf-msg">${g.over ? 'Game over: tap ⤢ to see the winner' : g.sel ? `<b class="gc-c${g.sel}">${TEAM[g.sel]}</b>: pick a card` : 'Tap a team, then a card'}</div>`;
}
function onFloatClick(e){
  const b = e.target.closest('button'); if(!b || b.disabled || !fl) return;
  const g = game(); if(!g) return;
  if(b.dataset.f==='big'){ showBig(); return; }
  if(b.dataset.f==='min'){ toMin(); return; }
  if(b.dataset.team){ g.sel = g.sel===b.dataset.team ? null : b.dataset.team; paintFloat(); return; }
  if(b.dataset.i!=null) flip(Number(b.dataset.i));
}
function dragStart(e){
  if(!e.target.closest('[data-drag]') || e.target.closest('button')) return;
  e.preventDefault();
  const box = fl, r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  try{ box.setPointerCapture(e.pointerId); }catch(_){}
  box.classList.add('drag');
  const mv = ev=> setPos(ev.clientX - ox, ev.clientY - oy);
  const up = ()=>{
    box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up);
    box.classList.remove('drag');
    if(fl===box){ const q = box.getBoundingClientRect(); D().gcPos = { x:q.left / innerWidth, y:q.top / innerHeight }; save(); }
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
  const p = D() && D().gcPos;
  if(p && isFinite(p.x) && isFinite(p.y)) setPos(p.x * innerWidth, p.y * innerHeight);
  else { const railLeft = !!$('.present.rail-left'); setPos(railLeft ? innerWidth - fl.offsetWidth - 24 : 88, innerHeight - fl.offsetHeight - 24); }
}

/* ---------------- island ---------------- */
function paintIsland(){
  const I = window.SVIsland; if(!I) return;
  const g = G, l = lesson();
  if(!g || !l || g.lid!==l.id || !g.started || g.size!=='min'){ I.remove('chance'); return; }
  I.set('chance', `<span class="isl-read tl-isl" data-gc title="${esc(themeOf(g).name)}">${gameIcon(themeOf(g), 'ico tl-iic gc-iic')}<span class="tl-in ${g.a > g.b ? 'lead' : ''}">${icon('left', 'ico tl-iarr')}A</span><b class="tl-is">${g.a}</b><span class="tl-dash">–</span><b class="tl-is">${g.b}</b><span class="tl-in ${g.b > g.a ? 'lead' : ''}">B${icon('right', 'ico tl-iarr')}</span></span><button class="isl-b" data-gcx title="Close (the game is kept for this lesson)">${icon('x')}</button>`, 4);
}
document.addEventListener('pointerdown', e=>{
  const x = e.target.closest && e.target.closest('.island [data-gcx]');
  if(x){ e.preventDefault(); e.stopPropagation(); const g = game(); if(g) g.size = 'closed'; paintIsland(); return; }
  const r = e.target.closest && e.target.closest('.island [data-gc]'); if(!r) return;
  e.preventDefault(); e.stopPropagation();
  showBig();
}, true);

/* ---------------- keys ---------------- */
// While the pop-up is open the keyboard and clicker don't change slides. The small box leaves them alone.
window.addEventListener('keydown', e=>{
  if(!big) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key==='F11') return;
  if(e.target && e.target.closest && e.target.closest('.modal')) return;
  e.stopPropagation();
  const k = e.key;
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' ','Enter','Home','End'].includes(k)) e.preventDefault();
  const g = game(); if(!g) return;
  if(k==='Escape'){
    e.preventDefault();
    if(g.ann){ endAnn(); return; }
    if(g.busy) return;
    if(g.view==='question'){ g.view = 'board'; paint(); return; }
    toMin();
  }
}, true);

/* ---------------- lesson changes ---------------- */
function clearAll(){ closeBig(); hideFloat(); G = null; if(window.SVIsland) window.SVIsland.remove('chance'); }
window.addEventListener('sv:present', e=>{
  if(!(e.detail && e.detail.resume)){ clearAll(); return; }
  // Back from the editor: put the game back as it was.
  const g = game();
  if(g && g.size==='float') showFloat(); else if(g && g.size==='big') showBig();
  paintIsland();
});
window.addEventListener('sv:leave', e=>{
  if(!(e.detail && e.detail.keep)){ clearAll(); return; }
  // To the editor: hide, keep the game.
  if(big){ clearTimeout(big.annT); const g = game(); if(g && g.ann){ g.ann = null; g.busy = false; g.over = g.cards.every(c=>c.open); g.retFloat = false; } big.back.remove(); big = null; }
  hideFloat();
});

/* ---------------- question sets (Settings → Question sets; also used by games.js) ---------------- */
function openSets(back){
  const h = H(), d = D(); if(!h || !d) return;
  const list = d.gcSets.length
    ? d.gcSets.map(s=>`<div class="row gc-setrow" data-id="${esc(s.id)}"><div class="grow" data-a="edit"><div class="t">${esc(s.name)}</div><div class="d">${s.qs.length} question${s.qs.length===1 ? '' : 's'}${s.qs.length ? ': ' + esc(s.qs.slice(0, 3).map(x=>x.q).join(' · ')) + (s.qs.length > 3 ? ' …' : '') : ''}</div></div><button class="icon-btn" data-a="edit" title="Edit">${icon('edit')}</button><button class="icon-btn" data-a="del" title="Delete">${icon('trash')}</button></div>`).join('')
    : `<div class="row"><div class="grow"><div class="d">No question sets yet. A set can be used with any class; pick one when you start the game, or set a lesson's default in its Lesson settings (⋯ menu).</div></div></div>`;
  h.modal(`<h2>Question sets</h2><p>Questions for Game of Chance, Noughts &amp; Crosses and Connect 4. Saved in viewer-data.json.</p>
    ${list}
    <div class="foot">${back ? `<button class="btn" data-a="back">Back to settings</button>` : `<button class="btn" data-a="close">Close</button>`}<button class="btn primary" data-a="add">${icon('plus')}New set</button></div>`, (m, close)=>{
    m.addEventListener('click', async e=>{
      const b = e.target.closest('[data-a]'); if(!b) return;
      const row = b.closest('[data-id]'), s = row && d.gcSets.find(x=>x.id===row.dataset.id);
      if(b.dataset.a==='back'){ close(); back(); }
      if(b.dataset.a==='close') close();
      if(b.dataset.a==='add'){ close(); editSet(null, back); }
      if(b.dataset.a==='edit' && s){ close(); editSet(s, back); }
      if(b.dataset.a==='del' && s){
        close();
        if(await h.confirmBox('Delete this question set?', `${s.name} (${s.qs.length} question${s.qs.length===1 ? '' : 's'})`, 'Delete', true)){
          d.gcSets = d.gcSets.filter(x=>x!==s);
          for(const l of Object.values(d.lessons || {})) if(l.gcSet===s.id) delete l.gcSet;
          save();
        }
        openSets(back);
      }
    });
  });
}
// Settings page (v1.41): the sets as rows, and edit / delete by id. back() redraws the page.
function setsRows(){
  const d = D(); if(!d) return '';
  return d.gcSets.map(s=>`<div class="row gc-setrow" data-id="${esc(s.id)}"><div class="grow" data-s="gc-edit"><div class="t">${esc(s.name)}</div><div class="d">${s.qs.length} question${s.qs.length===1 ? '' : 's'}${s.qs.length ? ': ' + esc(s.qs.slice(0, 3).map(x=>x.q).join(' · ')) + (s.qs.length > 3 ? ' …' : '') : ''}</div></div><button class="icon-btn" data-s="gc-edit" title="Edit">${icon('edit')}</button><button class="icon-btn" data-s="gc-del" title="Delete">${icon('trash')}</button></div>`).join('');
}
async function deleteSet(id, back){
  const h = H(), d = D(), s = d && d.gcSets.find(x=>x.id===id); if(!s) return;
  if(await h.confirmBox('Delete this question set?', `${s.name} (${s.qs.length} question${s.qs.length===1 ? '' : 's'})`, 'Delete', true)){
    d.gcSets = d.gcSets.filter(x=>x!==s);
    for(const l of Object.values(d.lessons || {})) if(l.gcSet===s.id) delete l.gcSet;
    save();
  }
  if(back) back();
}
function editSet(s, back){
  const h = H(), d = D();
  if(typeof s==='string') s = d.gcSets.find(x=>x.id===s) || null;
  h.modal(`<h2>${s ? 'Edit question set' : 'New question set'}</h2>
    <div class="row"><div class="grow"><div class="t">Name</div><div class="d">e.g. "Y9 Module 2: la nourriture"</div></div></div>
    <input type="text" maxlength="80" value="${esc(s ? s.name : '')}">
    <div class="row" style="margin-top:14px"><div class="grow"><div class="t">Questions</div><div class="d">One per line: <b>question = answer</b>. Two columns pasted from Excel or a Word table work too. Edit a line to change that question.</div></div><button class="btn sm ed-symb gc-sym" data-sym type="button" title="Accents and symbols">Àé</button></div>
    <textarea class="np-ta gc-qs-ta" spellcheck="false" placeholder="Comment dit-on « apple » ? = une pomme&#10;Translate: j'ai faim = I'm hungry">${esc(s ? linesOf(s.qs) : '')}</textarea>
    <div class="gc-count"></div>
    <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Save</button></div>`, (m, close)=>{
    const inp = m.querySelector('input'), ta = m.querySelector('textarea'), cnt = m.querySelector('.gc-count');
    const count = ()=>{
      const qs = parseLines(ta.value), no = qs.filter(x=>!x.a).length;
      cnt.innerHTML = qs.length ? `${qs.length} question${qs.length===1 ? '' : 's'}${no ? ` · <span class="gc-warn">${no} without an answer</span>` : ''}` : '';
    };
    ta.addEventListener('input', count); count();
    const sb = m.querySelector('[data-sym]'); if(sb && h.symbols) sb.onclick = ()=>h.symbols(sb, ta);
    const ok = ()=>{
      const name = inp.value.trim(), qs = parseLines(ta.value);
      if(!name){ inp.focus(); h.toast('Give the set a name first', true); return; }
      if(!qs.length){ ta.focus(); h.toast('Add at least one question', true); return; }
      if(s){ s.name = name; s.qs = qs; s.updated = Date.now(); }
      else d.gcSets.push({ id:'g' + uid(), name, qs, updated:Date.now() });
      d.gcSets.sort((x, y)=>x.name.localeCompare(y.name, 'en-GB', { numeric:true, sensitivity:'base' }));
      save(); close(); if(back) back(); else openSets();
    };
    m.querySelector('[data-a=ok]').onclick = ok;
    m.querySelector('[data-a=no]').onclick = ()=>{ close(); if(back) back(); else openSets(); };
    inp.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); ta.focus(); } };
    ta.onkeydown = e=>{ if(e.key==='Enter' && (e.ctrlKey || e.metaKey)) ok(); };
    (s ? ta : inp).focus();
  });
}
// For Lesson settings (app.js): the <select> options.
function setOptions(cur){
  return `<option value="">None (choose when starting)</option>` + sets().map(s=>`<option value="${esc(s.id)}" ${s.id===cur ? 'selected' : ''}>${esc(s.name)} (${s.qs.length})</option>`).join('');
}

window.SVChance = { open, close:toMin, halloween:hwOn, season:seasonOn,
  look:()=>{ const t = themeOf(null); return { name:t.name, icon:t.ic }; }, name:()=>themeOf(null).name, openSets, setsRows, editSet, deleteSet, setOptions, parseLines, get state(){ return G; } };
})();
