/* =====================================================================
   Slideshow Viewer — Noughts & Crosses (v1.51, 2026-10-16)
   Tools → Noughts & Crosses. The board for games.js (SVBoardGames), which
   does the set-up, players, questions and turns.
   Team A / player 1 is ✕ (blue), Team B / player 2 is ◯ (orange).
   Match: 1 game · Best of 3 · Best of 5 (first to 2 / 3 wins; draws don't
   count). The side that went second starts the next game.
   Quick game: a right answer → tap any empty square for the mark.
   With questions (sentence builder or question set): every empty square
   shows a question. The side picks a square, answers it, and claims it if
   right (or the other side steals it). A square nobody got gets a new one.
   board = { cells:[null|'a'|'b' ×9], qs:[question ×9]|null, last, lastT, line }
   ===================================================================== */
(function(){
'use strict';
const BG = window.SVBoardGames;
if(!BG) return;
const { COL, esc } = BG;
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const NEW_MS = 900;

const markSVG = (s, anim) => s === 'a'
  ? `<svg class="ox-m ox-x ${anim ? 'new' : ''}" viewBox="0 0 100 100" aria-hidden="true"><path d="M22 22 78 78" pathLength="1"/><path d="M78 22 22 78" pathLength="1"/></svg>`
  : `<svg class="ox-m ox-o ${anim ? 'new' : ''}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" pathLength="1"/></svg>`;
const sym = s => s === 'a' ? '✕' : '◯';
function winLine(cells){
  for(const L of LINES){ const [p, q, r] = L; if(cells[p] && cells[p] === cells[q] && cells[p] === cells[r]) return L; }
  return null;
}
const squares = gm => gm.src !== 'quick';
// Text size for a question in a square (container query units of the square).
function qClass(t){ const n = String(t || '').length; return n <= 12 ? 'q1' : n <= 24 ? 'q2' : n <= 45 ? 'q3' : n <= 90 ? 'q4' : 'q5'; }

function place(gm, i, s, api){
  const b = gm.board; if(b.cells[i]) return;
  b.cells[i] = s; b.last = i; b.lastT = Date.now();
  const L = winLine(b.cells);
  if(L){ b.line = L; api.placed({ winner:s, cells:L }); return; }
  if(b.cells.every(Boolean)){ api.placed({ draw:true }, 1400); return; }
  api.placed(null);
}

BG.register({
  id:'ox', name:'Noughts & Crosses',
  icon:'<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  sbDesc:'Every square gets a chunk to translate. Pick a square, translate it, claim it.',
  optDefaults(o){ return { bestOf:o && [1, 3, 5].includes(+o.bestOf) ? +o.bestOf : 3 }; },
  need(opt){ return Math.ceil((opt.bestOf || 1) / 2); },
  optRows(S, seg){ return `<div class="bx-sr"><span>Match</span>${seg('bo', [[1, '1 game'], [3, 'Best of 3'], [5, 'Best of 5']], S.opt.bestOf)}</div>`; },
  optClick(S, t){ if(t.dataset.bo){ S.opt.bestOf = +t.dataset.bo; return true; } return false; },
  rules(opt, src){
    return 'Three in a row wins. ' + (src === 'quick' ? 'A right answer places a mark.' : 'Every square has a question: pick one, answer it, claim it.')
      + (opt.bestOf > 1 ? ` Best of ${opt.bestOf}: draws don’t count.` : '');
  },
  squares,
  placeVerb(gm){ return gm ? (squares(gm) ? 'claim it' : 'place ' + sym(gm.ans)) : 'place a mark'; },
  placeWord(){ return 'Placing'; },
  placeHint(gm, who){ return `${who}: tap a square for ${sym(gm.placer)}`; },
  pieceHTML(s){ return markSVG(s, false); },
  stat(gm, s){ return gm.need > 1 ? { n:gm.wins[s], sub:gm.wins[s] === 1 ? 'game won' : 'games won' } : { n:gm.correct[s], sub:'correct' }; },
  newBoard(gm, api){
    gm.board = { cells:Array(9).fill(null), qs:null, last:-1, lastT:0, line:null };
    if(squares(gm)) gm.board.qs = Array.from({ length:9 }, () => api.drawQ());
  },
  refreshSquare(gm, i, api){ if(gm.board.qs) gm.board.qs[i] = api.drawQ(); },
  placeSquare(gm, i, s, api){ place(gm, i, s, api); },
  click(t, gm, api){
    if(t.dataset.cell == null) return;
    const i = +t.dataset.cell, b = gm.board; if(b.cells[i]) return;
    if(gm.ph === 'place'){ place(gm, i, gm.placer, api); return; }
    if(gm.ph === 'turn' && squares(gm)) api.pickSquare(i, b.qs[i]);
  },
  boardHTML(gm, api){
    const b = gm.board, sq = squares(gm), now = Date.now();
    const can = i => !b.cells[i] && (gm.ph === 'place' || (gm.ph === 'turn' && sq));
    const tint = gm.ph === 'place' ? COL[gm.placer] : gm.ph === 'turn' ? COL[gm.ans] : 'transparent';
    const cells = b.cells.map((c, i) => {
      let inner = '';
      if(c) inner = markSVG(c, i === b.last && now - b.lastT < NEW_MS);
      else if(sq && b.qs && b.qs[i]){ const t = api.qText(b.qs[i]); inner = `<span class="ox-n">${i + 1}</span><span class="ox-qt ${qClass(t && t.q)}">${esc(t ? t.q : '')}</span>`; }
      const win = b.line && b.line.includes(i);
      return `<button class="ox-cell ${c ? 'has' : ''} ${win ? 'win' : ''} ${can(i) ? 'can' : ''}" data-cell="${i}" ${can(i) ? '' : 'disabled'}>${inner}</button>`;
    }).join('');
    let line = '';
    if(b.line){
      const pos = i => [((i % 3) + 0.5) / 3 * 100, (Math.floor(i / 3) + 0.5) / 3 * 100];
      const [x1, y1] = pos(b.line[0]), [x2, y2] = pos(b.line[2]);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ex = dx / len * 11, ey = dy / len * 11;
      line = `<svg class="ox-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="${x1 - ex}" y1="${y1 - ey}" x2="${x2 + ex}" y2="${y2 + ey}" pathLength="1" stroke="${COL[b.cells[b.line[0]]]}"/></svg>`;
    }
    return `<div class="ox-wrap"><div class="ox ${sq ? 'sq' : ''} ${gm.ph === 'place' ? 'placing' : ''}" style="--tint:${tint}">${cells}${line}</div></div>`;
  },
  miniHTML(gm){
    const b = gm.board;
    return `<div class="oxf">${b.cells.map(c => `<span class="oxf-c">${c ? markSVG(c, false) : ''}</span>`).join('')}</div>`;
  },
  waitHTML(){ return `<div class="ox-wait">${markSVG('a', true)}${markSVG('b', true)}</div>`; },
  CSS:`
.ox-wrap{ flex:1; align-self:stretch; min-width:0; min-height:0; container-type:size; display:grid; place-items:center; }
.ox{ position:relative; width:min(100cqw, 100cqh); aspect-ratio:1; display:grid; grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(3, 1fr); gap:min(1.6cqw, 1.6cqh); padding:min(1.6cqw, 1.6cqh); border-radius:24px; background:var(--dark-3); box-shadow:0 0 0 4px color-mix(in srgb, var(--tint) 55%, transparent); transition:box-shadow .3s; box-sizing:border-box; }
.ox-cell{ position:relative; min-width:0; min-height:0; padding:0; border:0; border-radius:16px; background:var(--dark-2); color:var(--dark-text); font:inherit; display:grid; place-items:center; container-type:size; cursor:default; touch-action:manipulation; transition:background .2s; overflow:hidden; }
.ox-cell.can{ cursor:pointer; }
.ox-cell.can:active{ background:color-mix(in srgb, var(--tint) 30%, var(--dark-2)); }
.ox.placing .ox-cell.can{ background:color-mix(in srgb, var(--tint) 10%, var(--dark-2)); box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--tint) 45%, transparent); }
.ox.sq .ox-cell.can{ background:radial-gradient(circle at 30% 25%, #3B4290 0, #262A63 55%, #1B1E47 100%); box-shadow:inset 0 0 0 2px #4A52A8; }
.ox.sq .ox-cell.can:active{ filter:brightness(1.2); }
.ox-cell.win{ background:color-mix(in srgb, #F5B700 22%, var(--dark-2)); }
.ox-n{ position:absolute; left:7cqw; top:5cqh; font:700 10cqh/1 var(--font); color:rgba(255,255,255,.4); }
.ox-qt{ width:86%; max-height:78%; overflow:hidden; text-align:center; font-weight:700; line-height:1.15; color:#fff; overflow-wrap:break-word; hyphens:auto; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:6; }
.ox-qt.q1{ font-size:min(17cqw, 22cqh); } .ox-qt.q2{ font-size:min(12cqw, 15cqh); } .ox-qt.q3{ font-size:min(9.5cqw, 12cqh); }
.ox-qt.q4{ font-size:min(7.5cqw, 9.5cqh); } .ox-qt.q5{ font-size:min(6.2cqw, 8cqh); }
.ox-m{ width:78%; height:78%; fill:none; stroke-linecap:round; overflow:visible; }
.ox-x{ stroke:${COL.a}; stroke-width:13; }
.ox-o{ stroke:${COL.b}; stroke-width:12; }
.ox-m.new path, .ox-m.new circle{ stroke-dasharray:1; stroke-dashoffset:1; animation:ox-draw .32s ease-out forwards; }
.ox-m.new path:nth-child(2){ animation-delay:.22s; }
.ox-m.new circle{ animation-duration:.5s; }
@keyframes ox-draw{ to{ stroke-dashoffset:0; } }
.ox-cell.win .ox-m{ animation:ox-pulse .8s .3s 2; }
@keyframes ox-pulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.12); } }
.ox-line{ position:absolute; inset:min(1.6cqw, 1.6cqh); width:calc(100% - 2 * min(1.6cqw, 1.6cqh)); height:calc(100% - 2 * min(1.6cqw, 1.6cqh)); pointer-events:none; overflow:visible; }
.ox-line line{ stroke-width:3; stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1; animation:ox-draw .45s .25s ease-out forwards; filter:drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.oxf{ width:128px; height:128px; display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; padding:4px; border-radius:12px; background:var(--dark-3); box-sizing:border-box; }
.oxf-c{ border-radius:7px; background:var(--dark-2); display:grid; place-items:center; }
.oxf-c .ox-m{ width:80%; height:80%; }
.oxf .ox-x{ stroke-width:15; } .oxf .ox-o{ stroke-width:14; }
.ox-wait{ display:flex; gap:20px; width:clamp(160px, 24vh, 260px); }
.ox-wait .ox-m{ width:50%; height:auto; aspect-ratio:1; }
`,
});

window.SVNoughts = { open:() => BG.open('ox') };
})();
