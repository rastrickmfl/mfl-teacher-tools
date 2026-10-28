/* =====================================================================
   Slideshow Viewer — Mission Impossible
   Loaded after tally.js. Uses window.SVHost (lesson, toast).

   Tools → Mission Impossible:
     1. A big 3, 2, 1 over the screen.
     2. "Mission Impossible.mp3" starts. The top bar's date, title and island
        are replaced by a fuse running from the left edge of the slide to a
        bomb at the right. The lit end creeps along the fuse, timed to the
        song, and reaches the bomb at BOOM_AT seconds. The bomb ticks (faster
        near the end) and shows the time left.
     3. At BOOM_AT the bomb explodes: flash, shake, fireball, debris and
        smoke over the whole screen, which then clears (~5 s). The top bar
        comes back; the song's own tail fades out underneath.
   Click / drag on the fuse: jump the lit end there (fast forward or rewind;
   the song seeks to match). Dragging previews; the song jumps on release.
   Defuse: the fuse goes out, the music fades, "Mission accomplished".
   ×: stops at once.
   The slide stays fully usable throughout. Going Home or to another lesson
   stops it; a trip to the editor and back doesn't.
   Nothing is saved.
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }
const H = ()=> window.SVHost;
const toast = m => { const h = H(); if(h && h.toast) h.toast(m); };

const SONG = 'Mission%20Impossible.mp3';
const BOOM_AT = 120;      // seconds into the song (the music's final hit)
const COUNT_MS = 3000;    // 3, 2, 1
const BOOM_MS = 4800;     // explosion until the top bar comes back
const DEFUSE_MS = 3200;   // "Mission accomplished" until the top bar comes back

const IC = iconMap({
  x: 'x', cut: 'scissors',
});
const icon = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const rnd = (a, b)=> a + Math.random() * (b - a);
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s/60) + ':' + String(s % 60).padStart(2, '0'); };
let FONT = null;
const font = ()=> FONT || (FONT = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif');

/* ---------------- state ---------------- */
// M: { phase:'count'|'run'|'defused'|'boom', audio, startAt, fail, t0, t, p, ... }
let M = null;
let tail = null;   // the song still fading out after the explosion

function start(){
  const h = H();
  if(!h || !h.lesson){ toast('Open a lesson to use Mission Impossible.'); return; }
  if(M){ toast('Mission Impossible is already running.'); return; }
  stopTail();
  const audio = new Audio(SONG);
  audio.preload = 'auto';
  try{ audio.load(); }catch(e){}
  M = { phase:'count', audio, startAt:performance.now(), last:performance.now(), fail:false, t0:0, t:0, p:0, sparks:[], wisps:[], geo:null };
  audio.addEventListener('error', ()=>{ if(M && M.audio===audio) noMusic(); });
  mount();
  M.count = el('div', 'mi-count'); document.body.appendChild(M.count);
  M.shown = 0;
  M.raf = requestAnimationFrame(loop);
}
function noMusic(){
  if(!M || M.fail) return;
  M.fail = true;
  M.t0 = performance.now() - (M.audio.currentTime || 0) * 1000;
  if(M.phase==='run' || M.phase==='count') toast("Couldn't play Mission Impossible.mp3, so the bomb is running without music.");
}
// Seconds into the mission, from the song itself (so the fuse stays in step with the music).
function songTime(){
  if(M.fail) return (performance.now() - M.t0) / 1000;
  return M.audio.currentTime || 0;
}
function go(){
  M.phase = 'run';
  if(M.count){ M.count.remove(); M.count = null; }
  M.t0 = performance.now();
  try{
    const p = M.audio.play();
    if(p && p.catch){ const a = M.audio; p.catch(()=>{ if(M && M.audio===a) noMusic(); }); }
  }catch(e){ noMusic(); }
  paintBtns();
}

/* ---------------- top bar takeover ---------------- */
function mount(){
  const bar = $('.pbar'); if(!bar || !M) return;
  let lay = $('.mi-layer', bar);
  if(!lay){
    lay = el('div', 'mi-layer', '<canvas class="mi-cv"></canvas><div class="mi-hit" title="Click or drag to jump along the fuse"></div><div class="mi-btns"></div>');
    bar.appendChild(lay);
    lay.addEventListener('click', onBtn);
    const hit = $('.mi-hit', lay);
    hit.addEventListener('pointerdown', seekDown);
    hit.addEventListener('pointermove', seekMove);
    hit.addEventListener('pointerup', seekUp);
    hit.addEventListener('pointercancel', seekCancel);
  }
  bar.classList.remove('mi-return');
  bar.classList.add('mi-on');
  M.bar = bar; M.layer = lay; M.cv = $('.mi-cv', lay); M.hit = $('.mi-hit', lay); M.btns = $('.mi-btns', lay); M.btnPhase = null; M.geo = null; M.scrub = null;
  paintBtns();
}
function unmount(fadeIn){
  const bar = $('.pbar'); if(!bar) return;
  const lay = $('.mi-layer', bar); if(lay) lay.remove();
  if(bar.classList.contains('mi-on') && fadeIn){
    bar.classList.add('mi-return');
    setTimeout(()=>bar.classList.remove('mi-return'), 700);
  }
  bar.classList.remove('mi-on');
}
function paintBtns(){
  if(!M || !M.btns || M.btnPhase===M.phase) return;
  M.btnPhase = M.phase;
  M.btns.innerHTML =
      (M.phase==='run' ? `<button class="mi-btn defuse" data-mi="defuse" title="Stop the bomb: the class beat it">${icon('cut')}Defuse</button>` : '')
    + (M.phase==='run' || M.phase==='count' ? `<button class="mi-btn x" data-mi="cancel" title="Stop Mission Impossible">${icon('x')}</button>` : '');
  M.geo = null;
  if(M.hit) M.hit.classList.toggle('on', M.phase==='run');
}
function onBtn(e){
  const b = e.target.closest('[data-mi]'); if(!b || !M) return;
  e.stopPropagation();
  if(b.dataset.mi==='cancel') cancel();
  else if(b.dataset.mi==='defuse') defuse();
}

/* ---------------- seeking along the fuse ---------------- */
// Seconds into the song for a pointer x over the fuse. Stops 1 s short of the
// bomb so a click near the end never sets it off by accident.
function timeAtX(e){
  if(!M || !M.geo || !M.cv) return null;
  const r = M.cv.getBoundingClientRect(), g = M.geo;
  const f = clamp((e.clientX - r.left - g.x0) / (g.xe - g.x0), 0, 1);
  return Math.min(f * BOOM_AT, BOOM_AT - 1);
}
function seekDown(e){
  if(!M || M.phase!=='run') return;
  const t = timeAtX(e); if(t==null) return;
  e.preventDefault(); e.stopPropagation();
  try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
  M.scrub = t; M.sparks.length = 0; M.wisps.length = 0;
}
function seekMove(e){
  if(!M || M.scrub==null) return;
  const t = timeAtX(e); if(t!=null) M.scrub = t;
}
function seekUp(e){
  if(!M || M.scrub==null) return;
  const t = timeAtX(e); if(t!=null) M.scrub = t;
  seekTo(M.scrub);
  M.scrub = null;
}
function seekCancel(){ if(M && M.scrub!=null){ seekTo(M.scrub); M.scrub = null; } }
function seekTo(t){
  if(!M || M.phase!=='run') return;
  if(M.fail) M.t0 = performance.now() - t * 1000;
  else { try{ M.audio.currentTime = t; }catch(_){ } }
  M.t = t; M.p = clamp(t / BOOM_AT, 0, 1);
  M.sparks.length = 0; M.wisps.length = 0;
}

/* ---------------- ending ---------------- */
function cancel(){
  if(!M) return;
  cancelAnimationFrame(M.raf);
  try{ M.audio.pause(); }catch(e){}
  if(M.count) M.count.remove();
  if(M.fx) M.fx.cv.remove();
  M = null;
  unmount(true);
}
function defuse(){
  if(!M || M.phase!=='run') return;
  M.phase = 'defused'; M.defAt = performance.now(); M.defT = songTime();
  M.sparks.length = 0;
  paintBtns();
}
function finish(){
  if(!M) return;
  cancelAnimationFrame(M.raf);
  if(M.phase==='boom' && !M.audio.paused && !M.audio.ended){ tail = M.audio; tail.addEventListener('ended', ()=>{ tail = null; }, { once:true }); }
  else { try{ M.audio.pause(); }catch(e){} }
  if(M.count) M.count.remove();
  if(M.fx) M.fx.cv.remove();
  M = null;
  unmount(true);
}
function stopTail(){ if(tail){ try{ tail.pause(); }catch(e){} tail = null; } }

/* ---------------- main loop ---------------- */
function loop(now){
  if(!M) return;
  now = performance.now();
  const dt = Math.min(0.05, (now - M.last) / 1000); M.last = now;

  if(M.phase==='count'){
    const e = now - M.startAt;
    if(e >= COUNT_MS) go();
    else {
      const n = 3 - Math.floor(e / 1000);
      if(n!==M.shown && M.count){ M.shown = n; M.count.innerHTML = `<span>${n}</span>`; }
    }
  }
  if(M.phase==='run' && M.scrub!=null){
    M.t = M.scrub;   // dragging along the fuse: preview only, the song jumps on release
    M.p = clamp(M.t / BOOM_AT, 0, 1);
  } else if(M.phase==='run'){
    M.t = songTime();
    M.p = clamp(M.t / BOOM_AT, 0, 1);
    if(M.t >= BOOM_AT) boom(now);
  }
  if(M.phase==='defused'){
    const e = now - M.defAt;
    try{ M.audio.volume = clamp(1 - e / 1500, 0, 1); }catch(_){}
    if(e >= DEFUSE_MS){ finish(); return; }
  }
  if(M.phase==='boom' && now - M.fx.t0 >= BOOM_MS){ finish(); return; }

  // The top bar is rebuilt after a trip to the editor: take it over again.
  if(M.phase!=='boom'){
    if(!M.bar || !M.bar.isConnected){ M.bar = null; if($('.pbar')) mount(); }
    if(M.bar) drawBar(now, dt);
  } else if(M.bar && M.bar.isConnected) clearBar();
  if(M.fx) drawBoom(now, dt);
  M.raf = requestAnimationFrame(loop);
}

/* ---------------- the fuse and the bomb (canvas over the top bar) ---------------- */
const R = 22;          // bomb radius
const SLOT = 176;      // room kept for Defuse and × on the right, so the bomb never moves
const CAP_ANG = -2.25; // where the fuse goes in (upper left of the bomb)
function geometry(W, barH){
  const x0 = parseFloat(M.bar.style.paddingLeft) || 20;
  const bx = W - 12 - SLOT - 20 - R, by = barH/2 + 2;
  const cx = bx + Math.cos(CAP_ANG) * (R + 3), cy = by + Math.sin(CAP_ANG) * (R + 3);
  const xe = cx + Math.cos(CAP_ANG) * 6, ye = cy + Math.sin(CAP_ANG) * 6;
  const mid = barH/2, pts = [];
  const blend = Math.min(140, (xe - x0) * 0.3);
  for(let x = x0; ; x += 4){
    if(x > xe) x = xe;
    const wave = mid + 5 * Math.sin((x - x0) / 34) + 2.5 * Math.sin((x - x0) / 13 + 1);
    const k = clamp((x - (xe - blend)) / blend, 0, 1), s = k*k*(3 - 2*k);
    pts.push([x, wave*(1 - s) + ye*s]);
    if(x===xe) break;
  }
  return { x0, xe, bx, by, cx, cy, pts, W, barH };
}
function yAt(g, x){
  const i = clamp(Math.floor((x - g.x0) / 4), 0, g.pts.length - 2);
  const a = g.pts[i], b = g.pts[i + 1];
  const f = b[0]===a[0] ? 0 : clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  return a[1] + (b[1] - a[1]) * f;
}
function sizeCanvas(cv){
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if(cv._w!==w || cv._h!==h || cv._d!==dpr){ cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); cv._w = w; cv._h = h; cv._d = dpr; return true; }
  return false;
}
function clearBar(){
  const cv = M.cv; if(!cv) return;
  const ctx = cv.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, cv.width, cv.height);
}
function path(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }

function drawBar(now, dt){
  const cv = M.cv; if(!cv) return;
  const resized = sizeCanvas(cv);
  const W = cv._w, barH = M.bar.clientHeight, Hc = cv._h;
  if(resized || !M.geo || M.geo.W!==W || M.geo.barH!==barH || M.geo.pl!==M.bar.style.paddingLeft){
    M.geo = geometry(W, barH); M.geo.pl = M.bar.style.paddingLeft;
    // Click/drag strip over the fuse, from its start to just short of the bomb.
    if(M.hit){ M.hit.style.left = Math.max(0, M.geo.x0 - 10) + 'px'; M.hit.style.width = (M.geo.xe - M.geo.x0 + 10) + 'px'; }
  }
  const g = M.geo, ctx = cv.getContext('2d');
  ctx.setTransform(cv._d, 0, 0, cv._d, 0, 0);
  ctx.clearRect(0, 0, W, Hc);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const lit = M.phase==='run';
  const p = M.phase==='count' ? 0 : M.phase==='defused' ? clamp(M.defT / BOOM_AT, 0, 1) : M.p;
  const sx = g.x0 + p * (g.xe - g.x0), sy = yAt(g, sx);

  // Burnt part: thin ash.
  if(sx > g.x0 + 1){
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, Hc); ctx.clip();
    ctx.strokeStyle = '#34343a'; ctx.lineWidth = 3; path(ctx, g.pts);
    ctx.restore();
  }
  // Unburnt part: braided cord.
  ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W, Hc); ctx.clip();
  ctx.strokeStyle = '#B48C55'; ctx.lineWidth = 6; path(ctx, g.pts);
  ctx.setLineDash([2.5, 4.5]); ctx.strokeStyle = '#6E5129'; path(ctx, g.pts);
  ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,236,200,.28)'; ctx.lineWidth = 1.5;
  ctx.translate(0, -1.2); path(ctx, g.pts);
  ctx.restore();

  // Glowing ember just behind the lit end.
  if(lit && sx > g.x0 + 2){
    ctx.save(); ctx.beginPath(); ctx.rect(Math.max(g.x0, sx - 34), 0, Math.min(34, sx - g.x0), Hc); ctx.clip();
    const gr = ctx.createLinearGradient(sx - 34, 0, sx, 0);
    gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(1, 'rgba(255,120,30,.95)');
    ctx.strokeStyle = gr; ctx.lineWidth = 4; path(ctx, g.pts);
    ctx.restore();
  }

  // Smoke wisps (from the lit end, or the snuffed end once defused).
  const wispRate = lit ? 14 : M.phase==='defused' && performance.now() - M.defAt < 1600 ? 22 : 0;
  for(let n = wispRate * dt + Math.random()*0; n > 0; n--) if(Math.random() < n) M.wisps.push({ x:sx, y:sy - 2, vx:rnd(-14, 6), vy:rnd(-34, -18), age:0, life:rnd(0.9, 1.6), r:rnd(2, 4) });
  for(let i = M.wisps.length - 1; i >= 0; i--){
    const w = M.wisps[i]; w.age += dt; if(w.age >= w.life){ M.wisps.splice(i, 1); continue; }
    w.x += w.vx*dt; w.y += w.vy*dt; w.vx += Math.sin(w.age*5 + w.r) * 12 * dt;
    const f = w.age / w.life;
    ctx.fillStyle = `rgba(170,170,178,${0.28 * (1 - f)})`;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r + f*10, 0, Math.PI*2); ctx.fill();
  }

  // Sparks.
  if(lit){
    const flick = 0.75 + Math.random()*0.5;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 18*flick);
    glow.addColorStop(0, 'rgba(255,250,220,1)'); glow.addColorStop(0.25, 'rgba(255,210,90,.85)');
    glow.addColorStop(0.6, 'rgba(255,120,20,.35)'); glow.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 18*flick, 0, Math.PI*2); ctx.fill();
    let n = dt * 260; while(n > 0){ if(Math.random() < n){ const a = rnd(0, Math.PI*2), v = rnd(50, 230); M.sparks.push({ x:sx, y:sy, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 60, age:0, life:rnd(0.18, 0.55) }); } n--; }
    ctx.lineWidth = 1.6;
    for(let i = M.sparks.length - 1; i >= 0; i--){
      const s = M.sparks[i]; s.age += dt; if(s.age >= s.life){ M.sparks.splice(i, 1); continue; }
      s.vy += 520*dt; s.x += s.vx*dt; s.y += s.vy*dt;
      const f = s.age / s.life, a = 1 - f;
      ctx.strokeStyle = f < 0.3 ? `rgba(255,250,215,${a})` : f < 0.6 ? `rgba(255,205,70,${a})` : `rgba(255,120,25,${a})`;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx*0.028, s.y - s.vy*0.028); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  drawBomb(ctx, g);

  if(M.phase==='defused'){
    const e = performance.now() - M.defAt;
    const a = clamp(e / 300, 0, 1) * clamp((DEFUSE_MS - e) / 400, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 28px ${font()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = (g.x0 + g.bx - R) / 2, ty = barH / 2;
    const tw = ctx.measureText('Mission accomplished').width + 40;
    ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillRect(tx - tw/2, ty - 22, tw, 44);
    ctx.fillStyle = '#5FD38D'; ctx.fillText('Mission accomplished', tx, ty + 1);
    ctx.restore();
  }
}

function drawBomb(ctx, g){
  const { bx, by } = g;
  let pulse = 0, rem = BOOM_AT;
  if(M.phase==='run'){
    rem = BOOM_AT - M.t;
    const iv = rem > 20 ? 1 : rem > 8 ? 0.5 : 0.25;
    pulse = Math.exp(-((M.t % iv) / iv) * 7);
  } else if(M.phase==='defused') rem = BOOM_AT - M.defT;
  const danger = M.phase==='run' && rem < 20 ? 1 - rem / 20 : 0;
  const sc = 1 + 0.07 * pulse * (M.phase==='run' ? 1 : 0);

  ctx.save();
  ctx.translate(bx, by); ctx.scale(sc, sc);
  if(danger > 0){
    const gl = ctx.createRadialGradient(0, 0, R*0.6, 0, 0, R*2.3);
    gl.addColorStop(0, `rgba(255,40,30,${0.55 * danger * (0.35 + 0.65*pulse)})`); gl.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R*2.3, 0, Math.PI*2); ctx.fill();
  }
  // Cap where the fuse goes in.
  ctx.save(); ctx.rotate(CAP_ANG + Math.PI/2);
  ctx.fillStyle = '#7d7d86'; ctx.strokeStyle = '#3c3c44'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(-6.5, -R - 6, 13, 9); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Body.
  const body = ctx.createRadialGradient(-R*0.38, -R*0.42, 1, 0, 0, R);
  body.addColorStop(0, '#74747d'); body.addColorStop(0.35, '#2a2a31'); body.addColorStop(1, '#060608');
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(-R*0.42, -R*0.48, R*0.22, R*0.12, -0.7, 0, Math.PI*2); ctx.fill();
  // Time left.
  const txt = fmt(rem);
  ctx.font = `700 13px ${font()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = M.phase==='defused' ? '#5FD38D' : '#FF5A4F';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
  ctx.fillText(txt, 0, 3);
  ctx.restore();
}

/* ---------------- the explosion (whole screen) ---------------- */
function sprite(stops){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col])=>gr.addColorStop(o, col));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return c;
}
let SPR = null;
function sprites(){
  if(SPR) return SPR;
  SPR = {
    white:  sprite([[0,'rgba(255,255,245,1)'],[0.4,'rgba(255,240,190,.75)'],[1,'rgba(255,220,150,0)']]),
    yellow: sprite([[0,'rgba(255,235,140,1)'],[0.45,'rgba(255,190,60,.7)'],[1,'rgba(255,150,30,0)']]),
    orange: sprite([[0,'rgba(255,150,40,.95)'],[0.5,'rgba(235,90,20,.6)'],[1,'rgba(200,50,10,0)']]),
    red:    sprite([[0,'rgba(190,45,15,.85)'],[0.5,'rgba(120,25,10,.5)'],[1,'rgba(60,10,5,0)']]),
    smoke:  sprite([[0,'rgba(78,76,78,1)'],[0.5,'rgba(70,68,70,.7)'],[1,'rgba(60,58,60,0)']]),
    smoke2: sprite([[0,'rgba(120,117,115,1)'],[0.5,'rgba(100,98,96,.65)'],[1,'rgba(90,88,86,0)']]),
  };
  return SPR;
}

function boom(now){
  M.phase = 'boom';
  paintBtns();
  M.sparks.length = 0; M.wisps.length = 0;
  const W = innerWidth, Hh = innerHeight;
  // Blast comes from the bomb (top right); fall back to the top-right corner.
  let ox = W - 60, oy = 30;
  if(M.bar && M.bar.isConnected && M.geo){ const r = M.bar.getBoundingClientRect(); ox = r.left + M.geo.bx; oy = r.top + M.geo.by; }
  const cv = el('canvas', 'mi-boom');
  document.body.appendChild(cv);
  const SCALE = 0.5;   // soft effects: half resolution keeps it smooth on classroom PCs
  cv.width = Math.round(W * SCALE); cv.height = Math.round(Hh * SCALE);
  const diag = Math.hypot(W, Hh);
  const base = Math.atan2(Hh/2 - oy, W/2 - ox);
  const dir = spread => Math.random() < 0.8 ? base + rnd(-spread, spread) : rnd(0, Math.PI*2);

  const fire = [], debris = [], embers = [], smoke = [];
  for(let i=0;i<150;i++){ const a = dir(1.25), v = 300 + Math.pow(Math.random(), 0.6) * 3300; fire.push({ x:ox, y:oy, vx:Math.cos(a)*v, vy:Math.sin(a)*v, r0:rnd(50, 150), age:-rnd(0, 0.12), life:rnd(0.8, 1.7) }); }
  for(let i=0;i<55;i++){ const a = dir(1.3), v = rnd(700, 2300); debris.push({ x:ox, y:oy, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 200, rot:rnd(0, 6), vr:rnd(-14, 14), s:rnd(5, 15), age:0, life:rnd(1.6, 2.6), c:Math.random() < 0.5 ? '#141416' : '#3a2a1e' }); }
  for(let i=0;i<140;i++){ const a = dir(1.5), v = rnd(200, 1700); embers.push({ x:ox, y:oy, vx:Math.cos(a)*v, vy:Math.sin(a)*v, r:rnd(1.6, 3.6), age:-rnd(0, 0.2), life:rnd(1.4, 3.2) }); }
  for(let i=0;i<46;i++){
    let x, y;
    if(i % 2){ const a = dir(1.2), d = rnd(0, diag); x = ox + Math.cos(a)*d; y = oy + Math.sin(a)*d; }
    else { x = rnd(-100, W + 100); y = rnd(-100, Hh + 100); }
    const d0 = Math.hypot(x - ox, y - oy);
    smoke.push({ x, y, vx:rnd(-30, 30), vy:rnd(-55, -15), r:rnd(170, 400), delay:0.08 + d0 / 2600, age:0, life:rnd(3.4, 4.5), dark:Math.random() < 0.55, rot:rnd(0, 6) });
  }
  M.fx = { cv, ctx:cv.getContext('2d'), t0:now, ox, oy, W, H:Hh, diag, SCALE, fire, debris, embers, smoke };

  const pr = $('.present');
  if(pr){ pr.classList.remove('mi-shake'); void pr.offsetWidth; pr.classList.add('mi-shake'); setTimeout(()=>pr.classList.remove('mi-shake'), 1000); }
}

function drawBoom(now, dt){
  const F = M.fx, ctx = F.ctx, S = SPR || sprites(), t = (now - F.t0) / 1000;
  ctx.setTransform(F.SCALE, 0, 0, F.SCALE, 0, 0);
  ctx.clearRect(0, 0, F.W, F.H);
  ctx.globalCompositeOperation = 'source-over';

  // Smoke (underneath the fire): builds over the whole screen, holds, then clears.
  for(const s of F.smoke){
    const a0 = t - s.delay; if(a0 < 0) continue;
    s.x += s.vx*dt; s.y += s.vy*dt;
    const inA = clamp(a0 / 0.35, 0, 1), outA = clamp((s.life - a0) / 1.8, 0, 1);
    const a = 0.82 * inA * outA; if(a <= 0) continue;
    const r = s.r * (0.6 + 0.4*inA + a0*0.08);
    ctx.globalAlpha = a;
    ctx.drawImage(s.dark ? S.smoke : S.smoke2, s.x - r, s.y - r, r*2, r*2);
  }

  // Fireball.
  for(const p of F.fire){
    p.age += dt; if(p.age < 0 || p.age >= p.life) continue;
    const k = Math.exp(-2.6*dt); p.vx *= k; p.vy *= k; p.vy -= 60*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
    const f = p.age / p.life, r = p.r0 * (0.5 + 2.1*f);
    let spr, lighter = true;
    if(f < 0.14) spr = S.white; else if(f < 0.34) spr = S.yellow; else if(f < 0.6) spr = S.orange; else { spr = S.red; lighter = false; }
    ctx.globalCompositeOperation = lighter ? 'lighter' : 'source-over';
    ctx.globalAlpha = Math.pow(1 - f, 1.1) * 0.9;
    ctx.drawImage(spr, p.x - r, p.y - r, r*2, r*2);
  }

  // Embers.
  ctx.globalCompositeOperation = 'lighter';
  for(const e of F.embers){
    e.age += dt; if(e.age < 0 || e.age >= e.life) continue;
    const k = Math.exp(-1.6*dt); e.vx *= k; e.vy *= k; e.vy += 160*dt;
    e.x += e.vx*dt; e.y += e.vy*dt;
    const f = e.age / e.life;
    ctx.globalAlpha = (1 - f) * (0.6 + 0.4*Math.random());
    ctx.fillStyle = f < 0.4 ? '#FFE9A0' : '#FF8A2A';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
  }

  // Debris.
  ctx.globalCompositeOperation = 'source-over';
  for(const d of F.debris){
    d.age += dt; if(d.age >= d.life) continue;
    d.vx *= Math.exp(-0.7*dt); d.vy += 1300*dt;
    d.x += d.vx*dt; d.y += d.vy*dt; d.rot += d.vr*dt;
    ctx.globalAlpha = clamp((d.life - d.age) / 0.5, 0, 1);
    ctx.fillStyle = d.c;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.beginPath(); ctx.moveTo(-d.s, -d.s*0.4); ctx.lineTo(d.s*0.7, -d.s*0.6); ctx.lineTo(d.s*0.3, d.s*0.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Shockwave ring.
  if(t < 0.7){
    const r = 60 + 3000 * t, a = 0.55 * (1 - t / 0.7);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a; ctx.strokeStyle = 'rgb(255,235,210)'; ctx.lineWidth = 50 * (1 - t / 0.7) + 4;
    ctx.beginPath(); ctx.arc(F.ox, F.oy, r, 0, Math.PI*2); ctx.stroke();
  }

  // Flash over everything.
  if(t < 0.6){
    const a = Math.pow(1 - t / 0.6, 2);
    const gr = ctx.createRadialGradient(F.ox, F.oy, 0, F.ox, F.oy, F.diag);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,240,215,1)'); gr.addColorStop(1, 'rgba(255,190,120,1)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.fillRect(0, 0, F.W, F.H);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* ---------------- lesson changes ---------------- */
// Home / another lesson: stop. Editor and back (keep / resume): carry on.
window.addEventListener('sv:leave', e=>{ if(!(e.detail && e.detail.keep)){ cancel(); stopTail(); } });
window.addEventListener('sv:present', e=>{ if(!(e.detail && e.detail.resume)){ cancel(); stopTail(); } });

// For the dual-screen console, which shows a plain readout instead of the fuse canvas.
function status(){
  if(!M) return null;
  const left = M.phase==='run' ? Math.max(0, BOOM_AT - M.t) : M.phase==='count' ? BOOM_AT : 0;
  return { phase:M.phase, left, text: M.phase==='count' ? 'Mission Impossible: starting…'
    : M.phase==='run' ? `Mission Impossible · ${fmt(left)} to go`
    : M.phase==='defused' ? 'Mission accomplished' : 'Boom!' };
}
window.SVMission = { start, cancel, defuse, status, get running(){ return !!M; } };
})();
