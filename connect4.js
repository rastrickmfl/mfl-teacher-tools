/* =====================================================================
   Slideshow Viewer — Connect 4 (v1.51, 2026-10-16)
   Tools → Connect 4. The board for games.js (SVBoardGames), which does the
   set-up, players, questions and turns.
   Team A / player 1 has blue coins, Team B / player 2 orange.
   Board: Standard 7 × 6 or Small 6 × 5. Four in a row wins (across, up,
   down or diagonal). A right answer → tap a column to drop a coin.
   Power-ups (set-up: On / Off) turn up at random, at most once each per side
   per game: at the start of a game each side gets a secret "on correct answer
   number k" for each one (k from 2 to 11; 9 on the small board, never the
   same k for both), so in a short game they may never appear. Earned on a
   correct answer, announced with a pop-up, and only for that turn:
     Bonus coin  applied at once: drop two coins this turn (if the first makes
                 four, it's won).
     Destroy     armed at once: tap one of the other side's coins (or skip it
                 in the side panel; skipped = gone), then drop your own. Coins
                 above it fall. If that makes four for one side, that side
                 wins; for both, the side using it wins. Held back to a later
                 correct answer if the other side has no coins yet.
   board = { W, H, cols:[[side…] bottom-up ×W], last:{ c, i }, lastT, win:[[c,i]…],
             pu:{ a:{ bonus, destroy }, b:{…} } ('wait'|'live'|'used'|'lost'),
             tr:{ a:{ bonus, destroy }, b } (the correct answer each turns up on),
             bonusNow, ann:{ ks, s, t } (pop-up), owe, dropped, arm:'destroy'|null,
             fall:{ c, from, t }, boom:{ c, i, s, t } }
   ===================================================================== */
(function(){
'use strict';
const BG = window.SVBoardGames;
if(!BG) return;
const { COL, esc, icon } = BG;
const SIZES = { std:{ W:7, H:6, label:'Standard 7 × 6' }, small:{ W:6, H:5, label:'Small 6 × 5' } };
const EARLIEST = 2;                        // power-ups never before this correct answer
const LATEST = { std:11, small:9 };        // …and never after this one (so a short game may have none)
const ANN_MS = 2200;
const NEW_MS = 900;
const other = s => s === 'a' ? 'b' : 'a';
const PU = {
  bonus:'<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><path d="M15 9v6M12 12h6"/>',
  destroy:'<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
  q:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};
const coinSVG = s => `<svg class="c4-pc" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="${COL[s]}"/><circle cx="20" cy="20" r="12.5" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2.5"/><ellipse cx="14" cy="12" rx="6" ry="3.5" fill="rgba(255,255,255,.35)" transform="rotate(-30 14 12)"/></svg>`;

// Every run of four or more for side s: the cells, or null.
function fours(b, s){
  const at = (c, r) => c >= 0 && c < b.W && r >= 0 && r < b.H ? b.cols[c][r] : undefined;
  const out = new Set();
  for(let c = 0; c < b.W; c++) for(let r = 0; r < b.H; r++){
    if(at(c, r) !== s) continue;
    for(const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]){
      if(at(c - dc, r - dr) === s) continue; // only from the start of a run
      const run = [];
      let x = c, y = r;
      while(at(x, y) === s){ run.push(x + ',' + y); x += dc; y += dr; }
      if(run.length >= 4) run.forEach(k => out.add(k));
    }
  }
  return out.size ? [...out].map(k => k.split(',').map(Number)) : null;
}
const full = b => b.cols.every(col => col.length >= b.H);
const coinsOf = (b, s) => b.cols.reduce((n, col) => n + col.filter(x => x === s).length, 0);
const puOn = gm => gm.opt.pu !== false;
function roll(size){
  const hi = LATEST[size] || LATEST.std, k = () => EARLIEST + Math.floor(Math.random() * (hi - EARLIEST + 1));
  const one = () => { const bonus = k(); let destroy = k(); while(destroy === bonus) destroy = k(); return { bonus, destroy }; };
  return { a:one(), b:one() };
}
// The turn is over: a Destroy that wasn't used has gone.
function endPu(b, s){ if(b.pu[s].destroy === 'live') b.pu[s].destroy = 'lost'; b.arm = null; b.bonusNow = false; b.ann = null; }

function drop(gm, c, api){
  const b = gm.board, s = gm.placer;
  if(b.cols[c].length >= b.H){ api.flash('That column is full', false); return; }
  b.cols[c].push(s);
  b.last = { c, i:b.cols[c].length - 1 }; b.lastT = Date.now(); b.fall = null; b.boom = null;
  b.dropped++; b.owe--;
  const w = fours(b, s);
  if(w){ b.win = w; endPu(b, s); api.placed({ winner:s, cells:w }, 1900); return; }
  if(full(b)){ endPu(b, s); api.placed({ draw:true }, 1400); return; }
  if(b.owe > 0){ api.paint(); return; }
  endPu(b, s);
  api.placed(null);
}
function destroy(gm, c, i, api){
  const b = gm.board, s = gm.placer, o = other(s);
  if(b.cols[c][i] !== o){ api.flash(`Tap one of ${api.sideName(o)}’s coins`, false); return; }
  b.cols[c].splice(i, 1);
  b.pu[s].destroy = 'used'; b.arm = null;
  const t = Date.now();
  b.boom = { c, i, s:o, t }; b.fall = { c, from:i, t }; b.last = null; b.ann = null;
  const wS = fours(b, s), wO = fours(b, o);
  if(wS || wO){ const w = wS ? s : o; b.win = wS || wO; endPu(b, s); api.placed({ winner:w, cells:b.win }, 2200); return; }
  api.flash('Boom! Now drop your coin', true);
}

BG.register({
  id:'c4', name:'Connect 4',
  icon:'<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="7.5" cy="9" r="1.8"/><circle cx="12" cy="9" r="1.8"/><circle cx="16.5" cy="9" r="1.8"/><circle cx="7.5" cy="15" r="1.8" class="f"/><circle cx="12" cy="15" r="1.8" class="f"/><circle cx="16.5" cy="15" r="1.8"/>',
  sbDesc:'Chunks to translate, with the answer hidden until you reveal it. Right answer: drop a coin.',
  optDefaults(o){ return { size:o && o.size === 'small' ? 'small' : 'std', pu:!(o && o.pu === false) }; },
  need(){ return 1; },
  optRows(S, seg){
    return `<div class="bx-sr"><span>Board</span>${seg('c4s', Object.entries(SIZES).map(([k, v]) => [k, v.label]), S.opt.size)}</div>
      <div class="bx-sr"><span>Power-ups</span>${seg('c4p', [[1, 'On'], [0, 'Off']], S.opt.pu ? 1 : 0)}</div>`;
  },
  optClick(S, t){
    if(t.dataset.c4s){ S.opt.size = t.dataset.c4s; return true; }
    if(t.dataset.c4p != null){ S.opt.pu = t.dataset.c4p === '1'; return true; }
    return false;
  },
  rules(opt){
    return 'Four in a row wins: across, up, down or diagonal.' + (opt.pu ? ' Power-ups turn up at random, once each per side (maybe not at all in a short game): Bonus coin (drop two) and Destroy (knock out one of theirs). Use it that turn or lose it.' : '');
  },
  placeVerb(){ return 'drop a coin'; },
  placeWord(gm){ return gm.board && gm.board.arm === 'destroy' ? 'Destroying' : 'Dropping'; },
  placeHint(gm, who){
    const b = gm.board, o = BG.esc(gm.team ? (gm.placer === 'a' ? 'Team B' : 'Team A') : gm.players[other(gm.placer)].name);
    if(b.arm === 'destroy') return `${who}: tap one of ${o}’s coins to destroy it (or skip it in the side panel)`;
    if(b.owe === 2) return `${who}: bonus coin! Drop two`;
    if(b.dropped > 0 && b.owe > 0) return `${who}: drop your bonus coin`;
    return `${who}: tap a column to drop your coin`;
  },
  pieceHTML(s){ return coinSVG(s); },
  stat(gm, s){ return { n:gm.correct[s], sub:'correct' }; },
  newBoard(gm){
    const z = SIZES[gm.opt.size] || SIZES.std;
    gm.board = { W:z.W, H:z.H, cols:Array.from({ length:z.W }, () => []), last:null, lastT:0, win:null,
      pu:{ a:{ bonus:'wait', destroy:'wait' }, b:{ bonus:'wait', destroy:'wait' } }, tr:roll(gm.opt.size),
      bonusNow:false, ann:null, owe:0, dropped:0, arm:null, fall:null, boom:null };
  },
  // A right answer: maybe a power-up turns up (once each per side per game, only for this turn).
  onPlace(gm){
    const b = gm.board, s = gm.placer;
    Object.assign(b, { owe:1, dropped:0, arm:null, fall:null, boom:null, bonusNow:false, ann:null });
    if(!puOn(gm)) return;
    const n = gm.correct[s], p = b.pu[s], t = b.tr[s], got = [];
    if(p.bonus === 'wait' && n >= t.bonus){ p.bonus = 'used'; b.bonusNow = true; b.owe = 2; got.push('bonus'); }
    if(p.destroy === 'wait' && n >= t.destroy && coinsOf(b, other(s))){ p.destroy = 'live'; b.arm = 'destroy'; got.push('destroy'); }
    if(got.length) b.ann = { ks:got, s, t:Date.now() };
  },
  sideHTML(gm, s){
    if(!puOn(gm)) return '';
    const b = gm.board, mine = gm.ph === 'place' && gm.placer === s;
    const chip = (k, label) => {
      const st = b.pu[s][k];
      let cls = st, sub, ic = PU[k], live = false;
      if(st === 'wait'){ sub = 'Not found yet'; ic = PU.q; }
      else if(st === 'lost') sub = 'Missed';
      else if(k === 'destroy' && st === 'live' && mine){ cls = 'armed'; sub = 'Tap here to skip it'; live = true; }
      else if(k === 'bonus' && st === 'used' && mine && b.bonusNow){ cls = 'now'; sub = b.owe > 0 ? `Drop ${b.owe} more` : 'Dropping'; }
      else sub = 'Used';
      return `<button class="c4-pu ${cls}" data-pu="${k}" data-s="${s}" ${live ? '' : 'disabled'}>
        <span class="c4-pui">${icon(ic)}</span><span class="c4-put"><b>${label}</b><small>${sub}</small></span></button>`;
    };
    return `<div class="c4-pus">${chip('bonus', 'Bonus coin')}${chip('destroy', 'Destroy')}</div>`;
  },
  click(t, gm, api){
    const b = gm.board;
    if(t.dataset.pu){
      // Skip a Destroy that has turned up: it's gone for this game.
      const s = t.dataset.s;
      if(t.dataset.pu === 'destroy' && gm.ph === 'place' && gm.placer === s && b.pu[s].destroy === 'live'){ b.pu[s].destroy = 'lost'; b.arm = null; api.flash('Destroy skipped', false); }
      return;
    }
    if(gm.ph !== 'place') return;
    if(t.dataset.coin && b.arm === 'destroy'){ const [c, i] = t.dataset.coin.split(':').map(Number); destroy(gm, c, i, api); return; }
    const col = t.dataset.col != null ? t : t.closest('[data-col]');
    if(!col) return;
    if(b.arm === 'destroy'){ api.flash('Tap one of their coins, or tap Destroy again to cancel', false); return; }
    drop(gm, +col.dataset.col, api);
  },
  boardHTML(gm){
    const b = gm.board, now = Date.now(), placing = gm.ph === 'place', des = placing && b.arm === 'destroy';
    const tint = placing ? COL[gm.placer] : gm.ph === 'turn' || gm.ph === 'ask' ? COL[gm.ans] : 'transparent';
    const win = new Set((b.win || []).map(([c, r]) => c + ',' + r));
    let cols = '';
    for(let c = 0; c < b.W; c++){
      const fullCol = b.cols[c].length >= b.H;
      let cells = '';
      for(let r = b.H - 1; r >= 0; r--){
        const s = b.cols[c][r];
        let coin = '';
        if(s){
          const isNew = b.last && b.last.c === c && b.last.i === r && now - b.lastT < NEW_MS;
          const fell = b.fall && b.fall.c === c && r >= b.fall.from && now - b.fall.t < NEW_MS;
          const hit = des && s !== gm.placer;
          coin = `<span class="c4-coin c4-${s} ${isNew ? 'drop' : ''} ${fell ? 'fall' : ''} ${win.has(c + ',' + r) ? 'win' : ''} ${hit ? 'hit' : ''}" ${isNew ? `style="--rows:${b.H - r}"` : ''} ${hit ? `data-coin="${c}:${r}"` : ''}></span>`;
        }
        const boom = b.boom && b.boom.c === c && b.boom.i === r && now - b.boom.t < NEW_MS ? `<span class="c4-coin c4-${b.boom.s} boom"></span>` : '';
        cells += `<span class="c4-cell">${coin}${boom}</span>`;
      }
      const can = placing && !des && !fullCol;
      cols += `<button class="c4-col ${can ? 'can' : ''}" data-col="${c}" ${placing && (can || des) ? '' : 'disabled'}>${cells}</button>`;
    }
    let ann = '';
    if(b.ann && now - b.ann.t < ANN_MS){
      const k = b.ann.ks, two = k.length > 1;
      ann = `<div class="c4-ann" style="--c:${COL[b.ann.s]};animation-delay:-${now - b.ann.t}ms"><div class="c4-ann-in" style="animation-delay:-${now - b.ann.t}ms">
        <div class="c4-ann-t">Power-up!</div>
        <div class="c4-ann-k">${k.map(x => icon(PU[x]) + (x === 'bonus' ? 'Bonus coin' : 'Destroy')).join('<span>+</span>')}</div>
        <div class="c4-ann-s">${esc(gm.team ? (b.ann.s === 'a' ? 'Team A' : 'Team B') : gm.players[b.ann.s].name)}: ${two ? 'destroy one of theirs, then drop two coins' : k[0] === 'bonus' ? 'drop two coins this turn' : 'knock out one of their coins now, or lose it'}</div>
      </div></div>`;
    }
    return `<div class="c4-wrap"><div class="c4 ${placing ? 'placing' : ''} ${des ? 'des' : ''}" style="--W:${b.W};--H:${b.H};--tint:${tint}">${cols}</div>${ann}</div>`;
  },
  miniHTML(gm){
    const b = gm.board;
    let h = '';
    for(let r = b.H - 1; r >= 0; r--) for(let c = 0; c < b.W; c++){ const s = b.cols[c][r]; h += `<span class="c4f-c ${s ? 'c4-' + s : ''}"></span>`; }
    return `<div class="c4f" style="--W:${b.W}">${h}</div>`;
  },
  waitHTML(){ return `<div class="c4-waitc">${coinSVG('a')}${coinSVG('b')}${coinSVG('a')}</div>`; },
  CSS:`
.c4-wrap{ flex:1; align-self:stretch; min-width:0; min-height:0; container-type:size; display:grid; place-items:center; }
.c4{ --g:min(1.2cqw, 1.4cqh); position:relative; width:min(100cqw, calc(100cqh * var(--W) / var(--H))); aspect-ratio:var(--W) / var(--H); display:grid; grid-template-columns:repeat(var(--W), 1fr); gap:0; padding:var(--g); border-radius:22px; background:linear-gradient(180deg, #2F5BEA, #2449C2); box-shadow:0 0 0 4px color-mix(in srgb, var(--tint) 65%, transparent), 0 14px 40px rgba(0,0,0,.45); transition:box-shadow .3s; box-sizing:border-box; overflow:hidden; }
.c4-col{ position:relative; min-width:0; min-height:0; padding:0; border:0; background:none; border-radius:14px; display:grid; grid-template-rows:repeat(var(--H), 1fr); cursor:default; touch-action:manipulation; font:inherit; color:inherit; }
.c4-col.can{ cursor:pointer; }
.c4.placing .c4-col.can:active, .c4.placing .c4-col.can:hover{ background:rgba(255,255,255,.12); }
.c4-cell{ position:relative; display:grid; place-items:center; min-height:0; }
.c4-cell::before{ content:''; position:absolute; inset:var(--g); border-radius:50%; background:#141417; box-shadow:inset 0 4px 8px rgba(0,0,0,.6); }
.c4-coin{ position:absolute; inset:var(--g); border-radius:50%; z-index:1; background:radial-gradient(circle at 34% 30%, rgba(255,255,255,.45) 0, rgba(255,255,255,0) 32%), radial-gradient(circle, var(--cc) 58%, color-mix(in srgb, var(--cc) 70%, #000) 100%); box-shadow:inset 0 0 0 calc(var(--g) * .9) rgba(0,0,0,.12), 0 2px 4px rgba(0,0,0,.3); }
.c4-a{ --cc:${COL.a}; } .c4-b{ --cc:${COL.b}; }
.c4-coin.drop{ animation:c4-drop calc(.22s + var(--rows) * .07s) cubic-bezier(.45,0,.9,.5) both, c4-bounce .25s calc(.22s + var(--rows) * .07s) ease-out; }
@keyframes c4-drop{ from{ transform:translateY(calc(var(--rows) * -100% - var(--rows) * 2 * var(--g))); } to{ transform:translateY(0); } }
@keyframes c4-bounce{ 0%,100%{ transform:translateY(0); } 40%{ transform:translateY(-12%); } }
.c4-coin.fall{ animation:c4-fall .35s .25s cubic-bezier(.45,0,.9,.5) both; }
@keyframes c4-fall{ from{ transform:translateY(calc(-100% - 2 * var(--g))); } to{ transform:translateY(0); } }
.c4-coin.boom{ z-index:2; animation:c4-boom .5s ease-out forwards; }
@keyframes c4-boom{ 0%{ transform:scale(1); opacity:1; filter:brightness(1); } 30%{ transform:scale(1.25); filter:brightness(2); } 100%{ transform:scale(1.8); opacity:0; } }
.c4-coin.win{ animation:c4-win .7s .3s ease-in-out 3; box-shadow:0 0 0 calc(var(--g) * .8) #F5B700, 0 0 24px #F5B700; }
@keyframes c4-win{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.12); } }
.c4.des .c4-coin.hit{ cursor:pointer; animation:c4-wob .8s ease-in-out infinite; box-shadow:0 0 0 calc(var(--g) * .8) #FF5A4E; }
@keyframes c4-wob{ 0%,100%{ transform:rotate(0); } 25%{ transform:rotate(-6deg) scale(1.04); } 75%{ transform:rotate(6deg) scale(1.04); } }
.c4-pus{ display:flex; flex-direction:column; gap:8px; flex:none; }
.c4-pu{ display:flex; align-items:center; gap:10px; min-height:58px; padding:6px 12px; border-radius:14px; border:2px solid transparent; background:var(--dark-2); color:var(--dark-text); font:inherit; text-align:left; cursor:default; touch-action:manipulation; }
.c4-pui{ flex:none; width:34px; height:34px; display:grid; place-items:center; border-radius:10px; background:var(--dark-3); }
.c4-pui .ico{ width:22px; height:22px; }
.c4-put{ display:flex; flex-direction:column; min-width:0; }
.c4-put b{ font:700 17px/1.15 var(--font); white-space:nowrap; }
.c4-put small{ font-size:13px; font-weight:600; color:var(--dark-text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.c4-pu.wait{ opacity:.6; }
.c4-pu.wait .c4-pui{ color:var(--dark-text-2); }
.c4-pu.now{ border-color:var(--c); background:color-mix(in srgb, var(--c) 22%, var(--dark-2)); animation:c4-glow 1.4s ease-in-out infinite; }
.c4-pu.now .c4-pui{ background:var(--c); color:#111114; }
@keyframes c4-glow{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb, var(--c) 0%, transparent); } 50%{ box-shadow:0 0 0 6px color-mix(in srgb, var(--c) 35%, transparent); } }
.c4-pu.armed{ cursor:pointer; background:color-mix(in srgb, #FF5A4E 30%, var(--dark-2)); border-color:#FF5A4E; animation:c4-glow 1.4s ease-in-out infinite; --c:#FF5A4E; }
.c4-pu.armed .c4-pui{ background:#FF5A4E; color:#111114; }
.c4-pu.armed:active{ filter:brightness(.85); }
.c4-pu.used, .c4-pu.lost{ opacity:.4; }
.c4-pu.used b, .c4-pu.lost b{ text-decoration:line-through; }
.c4-wrap{ position:relative; }
.c4-ann{ position:absolute; inset:0; z-index:4; display:grid; place-items:center; pointer-events:none; animation:c4-annf ${ANN_MS}ms ease forwards; }
@keyframes c4-annf{ 0%,72%{ opacity:1; } 100%{ opacity:0; visibility:hidden; } }
.c4-ann-in{ display:flex; flex-direction:column; align-items:center; gap:10px; padding:24px 48px 26px; border-radius:28px; background:var(--dark); border:4px solid var(--c); box-shadow:0 0 0 14px color-mix(in srgb, var(--c) 22%, transparent), 0 30px 80px rgba(0,0,0,.6); text-align:center; animation:gc-pop .55s cubic-bezier(.3,1.6,.5,1) both; max-width:90%; }
.c4-ann-t{ font:800 clamp(48px, 9vh, 96px)/1 var(--font); color:#F5B700; }
.c4-ann-k{ display:flex; align-items:center; gap:14px; font:800 clamp(30px, 5vh, 52px)/1.1 var(--font); color:var(--c); }
.c4-ann-k .ico{ width:1em; height:1em; stroke-width:2.4; margin-right:8px; }
.c4-ann-k span{ color:var(--dark-text-2); }
.c4-ann-s{ font:600 clamp(20px, 3vh, 30px)/1.25 var(--font); color:var(--dark-text); }
.c4-pu:disabled{ cursor:default; }
.c4-pc{ width:100%; height:100%; }
.c4f{ width:150px; display:grid; grid-template-columns:repeat(var(--W), 1fr); gap:3px; padding:5px; border-radius:10px; background:#2F5BEA; box-sizing:border-box; }
.c4f-c{ aspect-ratio:1; border-radius:50%; background:#141417; }
.c4f-c.c4-a{ background:${COL.a}; } .c4f-c.c4-b{ background:${COL.b}; }
.c4-waitc{ display:flex; gap:14px; width:clamp(180px, 26vh, 280px); }
.c4-waitc .c4-pc{ width:33%; height:auto; aspect-ratio:1; animation:c4-hop 1.2s ease-in-out infinite; }
.c4-waitc .c4-pc:nth-child(2){ animation-delay:.2s; } .c4-waitc .c4-pc:nth-child(3){ animation-delay:.4s; }
@keyframes c4-hop{ 0%,100%{ transform:translateY(0); } 40%{ transform:translateY(-30%); } }
`,
});

window.SVConnect4 = { open:() => BG.open('c4') };
})();
