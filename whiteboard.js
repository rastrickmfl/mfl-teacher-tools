/* =====================================================================
   Slideshow Viewer — Whiteboard (v1.74, 2026-10-19)
   A blank board for the pupil screen, opened from Tools (presentation icon) while
   presenting. It covers the slide and the sidebar; the top bar (island) stays, and
   Home goes back to the slide.

   One long page per year group: data.whiteboards[year] = { bg, items }, saved in
   viewer-data.json. Every item has an id, so sync.js can merge two computers' edits.
   Items: { id, t:'s' pen stroke (c, w, p:[x,y,…]) | 'l' line (x1,y1,x2,y2) |
            'r' rectangle (x1,y1,x2,y2) | 'b' mindmap bubble (x,y,bw,bh,s) }.
   Items are never changed in place (edits make a new object), so undo can keep the
   old arrays.

   Coordinates ("world"): CSS px at 100% zoom, origin at the page's top-left. The
   page is as wide as the panel when the board opens and grows downwards without limit.
   View: screen = world * z + (tx, ty).

   Loaded after tools.js. Uses window.SVHost (data, save, lesson, confirmBox).
   .wb-root is left out of the teacher console's copy of the screen (dual.js SKIP_CLS).
   ===================================================================== */
(function(){
'use strict';

const $ = (s, r=document)=>r.querySelector(s);
const uid = ()=> Math.random().toString(36).slice(2,9);
const host = ()=> window.SVHost || null;

const IC = iconMap({ home:'house', pen:'pencil-line', eraser:'eraser', line:'minus', rect:'square', bubble:'circle', undo:'undo-2', clear:'trash-2', reset:'maximize' });
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

// Same colours and thicknesses as the presenter's pen (app.js).
const COLORS = ['#D93A2B','#111114','#FFFFFF','#2F5BEA','#0FA3B1','#1E9E5A','#7BC043','#F5B700','#F07818','#E8489A','#7A3FC8','#8B5A2B','#7A7A85','#0B2A6F','#9E1B32'];
const SIZES = [2, 3, 6, 12], SIZE_NAMES = ['Fine', 'Thin', 'Medium', 'Thick'];
const DRAW_TOOLS = new Set(['pen', 'line', 'rect', 'bubble']);
const GAP = { narrow:32, normal:44, wide:56 };      // line / grid spacing, world px (Settings → General → Presenting)
const BG_NAMES = { plain:'Plain', lined:'Lined', grid:'Grid' };
const ZMIN = 0.5, ZMAX = 4;
const BUBBLE_H = 64, BUBBLE_MIN_W = 160, BUBBLE_FONT = 28, BUBBLE_INK = '#111114';
const ERASE_PX = 16, UNDO_MAX = 200;
const measureCtx = document.createElement('canvas').getContext('2d');

let W = null;   // the open board

/* ---------------- which board ---------------- */
// Year group from the lesson's class label ("9A/Fr1" → "9"), as the Library does. Others share 'other'.
function yearKey(l){ const m = /^\s*(\d{1,2})[A-Za-z]/.exec(String((l && l.label) || '')); return m ? m[1] : 'other'; }
function loadBoard(key){
  const d = host() && host().data, ws = d && d.whiteboards, b = ws && ws[key];
  return { bg: b && BG_NAMES[b.bg] ? b.bg : 'plain', items: b && Array.isArray(b.items) ? b.items : [] };
}
function saveBoard(){
  if(!W || !host()) return;
  const d = host().data; if(!d) return;
  if(!d.whiteboards) d.whiteboards = {};
  d.whiteboards[W.key] = { bg:W.bg, items:W.items };
  host().save();
}
function gapFor(kind){
  const s = host() && host().data && host().data.settings;
  return GAP[(s && (kind==='grid' ? s.wbGrid : s.wbLines))] || GAP.normal;
}

/* ---------------- geometry ---------------- */
const BOX = new WeakMap();   // item → [x0, y0, x1, y1], for items that are saved (not the stroke in progress)
function boxOf(it){
  let b = BOX.get(it); if(b) return b;
  b = calcBox(it); BOX.set(it, b); return b;
}
function calcBox(it){
  if(it.t==='s'){
    let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
    for(let i=0;i<it.p.length;i+=2){ const x=it.p[i], y=it.p[i+1]; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    return [x0, y0, x1, y1];
  }
  if(it.t==='l' || it.t==='r') return [Math.min(it.x1,it.x2), Math.min(it.y1,it.y2), Math.max(it.x1,it.x2), Math.max(it.y1,it.y2)];
  return [it.x, it.y, it.x + it.bw, it.y + it.bh];   // bubble
}
function contentBottom(){
  let m = 0;
  for(const it of W.items){ const b = boxOf(it); if(b[3] > m) m = b[3]; }
  if(W.cur){ const b = calcBox(W.cur); if(b[3] > m) m = b[3]; }
  return m;
}
function distSeg(px, py, ax, ay, bx, by){
  const dx = bx-ax, dy = by-ay, l2 = dx*dx + dy*dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy)/l2)) : 0;
  return Math.hypot(ax + t*dx - px, ay + t*dy - py);
}
// Whole items: a stroke, line or box edge within reach of the eraser; a bubble anywhere in its outline.
function hitItem(it, x, y, r){
  const lim = r + (it.w || 0)/2;
  if(it.t==='s'){
    const p = it.p;
    if(p.length <= 2) return Math.hypot(p[0]-x, p[1]-y) < lim;
    for(let q=0; q<p.length-2; q+=2) if(distSeg(x, y, p[q], p[q+1], p[q+2], p[q+3]) < lim) return true;
    return false;
  }
  if(it.t==='l') return distSeg(x, y, it.x1, it.y1, it.x2, it.y2) < lim;
  if(it.t==='r'){
    const [x0, y0, x1, y1] = calcBox(it);
    return distSeg(x,y,x0,y0,x1,y0) < lim || distSeg(x,y,x1,y0,x1,y1) < lim || distSeg(x,y,x1,y1,x0,y1) < lim || distSeg(x,y,x0,y1,x0,y0) < lim;
  }
  return x >= it.x - r && x <= it.x + it.bw + r && y >= it.y - r && y <= it.y + it.bh + r;
}
function bubbleAt(x, y){
  for(let i=W.items.length-1; i>=0; i--){
    const it = W.items[i]; if(it.t!=='b') continue;
    if(x >= it.x-4 && x <= it.x+it.bw+4 && y >= it.y-4 && y <= it.y+it.bh+4) return it;
  }
  return null;
}
function measure(s){ measureCtx.font = `${BUBBLE_FONT}px Arial, sans-serif`; return measureCtx.measureText(s).width; }

/* ---------------- view ---------------- */
function clamp(){
  W.z = Math.min(ZMAX, Math.max(ZMIN, W.z));
  const z = W.z, page = W.pageW * z;
  // Width: the page is exactly the panel's width at 100%; zoomed in, it can be panned across but not past its edges.
  if(page <= W.vw) W.tx = (W.vw - page) / 2;
  else W.tx = Math.min(0, Math.max(W.vw - page, W.tx));
  // Height: no top limit; the top of the screen can go down to the lowest mark (or one screen if there are fewer).
  const topMax = Math.max(contentBottom(), W.vh / z);
  W.ty = Math.min(0, Math.max(-topMax * z, W.ty));
}
function zoomAt(sx, sy, nz){
  nz = Math.min(ZMAX, Math.max(ZMIN, nz));
  const wx = (sx - W.tx) / W.z, wy = (sy - W.ty) / W.z;
  W.z = nz; W.tx = sx - wx*nz; W.ty = sy - wy*nz;
  clamp(); schedule(); refreshBar();
}
function resetView(){ W.z = 1; W.tx = 0; W.ty = 0; clamp(); schedule(); refreshBar(); }
function sizeCanvas(){
  const r = W.root.getBoundingClientRect();
  W.vw = r.width; W.vh = r.height; W.dpr = window.devicePixelRatio || 1;
  W.cv.width = Math.max(1, Math.round(W.vw * W.dpr)); W.cv.height = Math.max(1, Math.round(W.vh * W.dpr));
  if(!W.pageW) W.pageW = W.vw;
  clamp(); schedule();
}
// v1.77: rounded to 0.1 px (as the slide pen does), so saved strokes are about half the size in viewer-data.json.
const r1 = v => Math.round(v * 10) / 10;
function toWorld(e){
  const r = W.cv.getBoundingClientRect();
  return { x:r1((e.clientX - r.left - W.tx) / W.z), y:r1((e.clientY - r.top - W.ty) / W.z) };
}
function canvasPt(e){ const r = W.cv.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top }; }

/* ---------------- painting ---------------- */
let raf = 0;
function schedule(){ if(!raf) raf = requestAnimationFrame(()=>{ raf = 0; paint(); }); }
function paint(){
  if(!W) return;
  const ctx = W.ctx, k = W.dpr, z = W.z, tx = W.tx, ty = W.ty;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W.cv.width, W.cv.height);
  ctx.setTransform(k*z, 0, 0, k*z, k*tx, k*ty);
  const x0 = -tx/z, y0 = -ty/z, x1 = x0 + W.vw/z, y1 = y0 + W.vh/z;
  drawBg(ctx, x0, y0, x1, y1);
  for(const it of W.items){
    const b = boxOf(it);
    if(b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;   // off screen
    drawItem(ctx, it, z);
  }
  if(W.cur) drawItem(ctx, W.cur, z);
}
function drawBg(ctx, x0, y0, x1, y1){
  if(W.bg==='plain') return;
  const g = gapFor(W.bg), pw = W.pageW;
  ctx.lineWidth = 1 / W.z;
  ctx.strokeStyle = W.bg==='lined' ? '#B9CFEA' : '#D6D9E0';
  ctx.beginPath();
  for(let k = Math.max(1, Math.floor(y0/g)); k*g <= y1; k++){ ctx.moveTo(0, k*g); ctx.lineTo(pw, k*g); }
  if(W.bg==='grid'){
    const ya = Math.max(0, y0), yb = Math.max(ya, y1);
    for(let x = 0; x <= pw + 0.01; x += g){ ctx.moveTo(x, ya); ctx.lineTo(x, yb); }
  }
  ctx.stroke();
}
function drawItem(ctx, it){
  ctx.strokeStyle = ctx.fillStyle = it.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if(it.t==='s'){
    ctx.lineWidth = it.w;
    const p = it.p;
    if(p.length <= 2){ ctx.beginPath(); ctx.arc(p[0], p[1], it.w/2, 0, Math.PI*2); ctx.fill(); return; }
    // v1.79: straight through every recorded point (no midpoint smoothing), as the slide pen does.
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for(let j=2; j<p.length; j+=2) ctx.lineTo(p[j], p[j+1]);
    ctx.stroke();
    return;
  }
  ctx.lineWidth = it.w;
  if(it.t==='l'){ ctx.beginPath(); ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); ctx.stroke(); return; }
  if(it.t==='r'){
    const [x0, y0, x1, y1] = calcBox(it);
    ctx.beginPath(); ctx.rect(x0, y0, x1-x0, y1-y0); ctx.stroke(); return;
  }
  // Bubble: a pill with the text centred in it.
  const x = it.x, y = it.y, w = it.bw, h = it.bh, r = h/2;
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = it.c; ctx.stroke();
  ctx.fillStyle = BUBBLE_INK; ctx.font = `${BUBBLE_FONT}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(it.s, x + w/2, y + h/2 + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

/* ---------------- undo, saving ---------------- */
// Pushes the given board state (default: the current one) so Undo can return to it.
function pushUndo(items){ W.undo.push(items || W.items); if(W.undo.length > UNDO_MAX) W.undo.shift(); refreshBar(); }
function undo(){
  if(!W || W.cur || W.erasing || !W.undo.length) return;
  W.items = W.undo.pop(); saveBoard(); schedule(); refreshBar();
}
async function clearBoard(){
  if(!W || !W.items.length) return;
  const h = host();
  const ok = h && h.confirmBox ? await h.confirmBox('Clear the board?', 'Clears everything on the Year ' + W.key + ' board. Undo brings it back.', 'Clear', true) : window.confirm('Clear the board?');
  if(!ok || !W) return;
  pushUndo(); W.items = []; saveBoard(); schedule();
}

/* ---------------- drawing ---------------- */
function startDraw(e){
  const p = toWorld(e), t = W.tool;
  if(W.edit) endEdit(true);
  if(t==='eraser'){ W.erasing = { snap:W.items }; W.erased = false; W.lastE = [p.x, p.y]; eraseAt(p.x, p.y); return; }
  if(t==='bubble'){
    const hit = bubbleAt(p.x, p.y);
    if(hit){ openEditor(hit, W.items, false); return; }
    const base = W.items;
    const it = { id:uid(), t:'b', c:W.color, w:W.size, x:p.x - BUBBLE_MIN_W/2, y:p.y - BUBBLE_H/2, bw:BUBBLE_MIN_W, bh:BUBBLE_H, s:'' };
    W.items = base.concat([it]);
    openEditor(it, base, true);
    schedule();
    return;
  }
  const base = { id:uid(), c:W.color, w:W.size };
  if(t==='pen') W.cur = Object.assign(base, { t:'s', p:[p.x, p.y] });
  else if(t==='line') W.cur = Object.assign(base, { t:'l', x1:p.x, y1:p.y, x2:p.x, y2:p.y });
  else W.cur = Object.assign(base, { t:'r', x1:p.x, y1:p.y, x2:p.x, y2:p.y });
  W.drawType = t;
  schedule();
}
function eraseAt(x, y){
  const r = ERASE_PX / W.z;
  const next = W.items.filter(it=>!hitItem(it, x, y, r));
  if(next.length !== W.items.length){ W.items = next; W.erased = true; schedule(); }
}
function commitCur(){
  const it = W.cur; W.cur = null; W.drawType = null;
  if(!it) return;
  if(it.t==='l' && Math.hypot(it.x2-it.x1, it.y2-it.y1) < 2) return;      // a tap, not a line
  if(it.t==='r' && Math.abs(it.x2-it.x1) < 2 && Math.abs(it.y2-it.y1) < 2) return;
  pushUndo();
  W.items = W.items.concat([it]);
  saveBoard(); schedule();
}
function cancelDraw(){
  if(W.erasing){ if(W.erased) W.items = W.erasing.snap; W.erasing = null; W.erased = false; }
  W.cur = null; W.drawType = null; W.drawId = null;
  schedule();
}

/* ---------------- bubble text ---------------- */
// W.edit = { id, inp, base (the board before this edit), isNew, orig (text when editing began) }
function openEditor(it, base, isNew){
  endEdit(true);
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'wb-edit'; inp.maxLength = 40; inp.value = it.s;
  inp.autocomplete = 'off'; inp.spellcheck = false; inp.lang = 'en-GB';
  W.root.appendChild(inp);
  W.edit = { id:it.id, inp, base, isNew, orig:it.s };
  placeEditor();
  inp.addEventListener('input', ()=>{ setBubbleText(W.edit.id, inp.value); placeEditor(); });
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); endEdit(true); }
    else if(e.key==='Escape'){ e.preventDefault(); endEdit(false); }
  });
  inp.addEventListener('blur', ()=>{ if(W && W.edit && W.edit.inp===inp) endEdit(true); });
  inp.focus();
}
function placeEditor(){
  const E = W && W.edit; if(!E) return;
  const b = W.items.find(x=>x.id===E.id); if(!b) return;
  const s = E.inp.style, z = W.z;
  s.left = (W.tx + b.x*z) + 'px'; s.top = (W.ty + b.y*z) + 'px';
  s.width = (b.bw*z) + 'px'; s.height = (b.bh*z) + 'px';
  s.fontSize = (BUBBLE_FONT*z) + 'px'; s.borderRadius = (b.bh*z/2) + 'px';
}
function setBubbleText(id, text){
  W.items = W.items.map(it=>{
    if(it.id!==id) return it;
    const bw = Math.max(BUBBLE_MIN_W, Math.ceil(measure(text)) + 48);
    return Object.assign({}, it, { s:text, bw, x:(it.x + it.bw/2) - bw/2 });   // grows both ways from its centre
  });
  schedule();
}
// keep: Enter / tapping away. Otherwise (Escape): the text goes back as it was.
function endEdit(keep){
  const E = W && W.edit; if(!E) return;
  W.edit = null;
  E.inp.remove();
  if(!keep){ W.items = E.base; schedule(); return; }          // Escape: back to how the board was
  const it = W.items.find(x=>x.id===E.id); if(!it) return;
  const text = it.s.trim();
  if(!text){                                                  // an empty bubble goes
    if(E.isNew) W.items = E.base;
    else { pushUndo(E.base); W.items = W.items.filter(x=>x.id!==E.id); saveBoard(); }
    schedule(); return;
  }
  if(text!==it.s) setBubbleText(E.id, text);
  if(E.isNew || text!==E.orig){ pushUndo(E.base); saveBoard(); }
  schedule();
}

/* ---------------- pointers: draw, pinch-zoom ---------------- */
const PALM_MS = 3000;
/* v1.75: pointers whose lift was never reported (focus moved away, the board missed it) used to stay in
   W.ptrs: drawing stopped (W.drawId stuck) or the next single touch became a pinch, until a refresh.
   A new pointer down shows which of them can't really still be down: if it's the only finger on the
   board (isPrimary), no other finger is; a mouse or stylus means the last one of that kind has lifted. */
function clearStale(e){
  for(const [id, P] of [...W.ptrs]){
    const stale = id===e.pointerId || (e.pointerType==='touch' ? (e.isPrimary && P.type==='touch') : P.type===e.pointerType);
    if(stale) onUp({ pointerId:id });
  }
}
// Focus left the page: treat every pointer as lifted (the stroke in progress is kept).
function dropAll(){
  if(!W || (document.visibilityState!=='hidden' && document.hasFocus())) return;
  for(const id of [...W.ptrs.keys()]) onUp({ pointerId:id });
  W.pinch = null;
}
window.addEventListener('blur', dropAll);
document.addEventListener('visibilitychange', dropAll);
function onDown(e){
  if(!W) return;
  if(e.pointerType==='mouse' && e.button!==0) return;
  clearStale(e);
  if(e.pointerType==='pen') W.penAt = Date.now();
  const palm = e.pointerType==='touch' && W.penAt && Date.now() - W.penAt < PALM_MS;
  // Palm rejection: a touch during a stylus stroke is ignored.
  if(palm && W.drawId!=null && W.drawId!==e.pointerId && W.drawKind==='pen') return;
  e.preventDefault();
  // Touches don't draw while the stylus is in use (until 3 seconds after it was last on the board); they can still pinch.
  W.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY, type:e.pointerType, draw:!palm });
  try{ W.cv.setPointerCapture(e.pointerId); }catch(_){}
  if(W.palOpen){ W.palOpen = false; refreshPal(); }
  const touches = [...W.ptrs.entries()].filter(([,P])=>P.type==='touch');
  if(touches.length>=2 && !W.pinch){ startPinch(touches.slice(0,2).map(([id])=>id)); return; }
  if(W.pinch) return;
  if(!W.ptrs.get(e.pointerId).draw || W.drawId!=null) return;
  W.drawId = e.pointerId; W.drawKind = e.pointerType;
  startDraw(e);
}
function onMove(e){
  if(!W) return;
  if(e.pointerType==='pen') W.penAt = Date.now();
  const P = W.ptrs.get(e.pointerId); if(!P) return;
  P.x = e.clientX; P.y = e.clientY;
  if(W.pinch){ movePinch(); return; }
  if(e.pointerId!==W.drawId) return;
  const p = toWorld(e);
  const c0 = W.cur;
  if(c0 && c0.t==='s' && !W.erasing){
    // v1.79: every position the pen reported since the last frame (getCoalescedEvents), not just the
    // last one, as the slide pen does. Before, only ~60 points a second were kept, so fast writing lost detail.
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for(const ev of (evs.length ? evs : [e])){
      const q = toWorld(ev), n = c0.p.length;
      if(Math.hypot(q.x-c0.p[n-2], q.y-c0.p[n-1]) >= 0.8/W.z) c0.p.push(q.x, q.y);
    }
    schedule();
    return;
  }
  if(W.erasing){
    const r = ERASE_PX / W.z, a = W.lastE;
    const n = Math.max(1, Math.ceil(Math.hypot(p.x-a[0], p.y-a[1]) / (r/2)));
    for(let j=1; j<=n; j++) eraseAt(a[0] + (p.x-a[0])*j/n, a[1] + (p.y-a[1])*j/n);
    W.lastE = [p.x, p.y];
    return;
  }
  const c = W.cur; if(!c) return;
  if(c.t==='s'){ const n = c.p.length; if(Math.hypot(p.x-c.p[n-2], p.y-c.p[n-1]) >= 0.8/W.z) c.p.push(p.x, p.y); }
  else { c.x2 = p.x; c.y2 = p.y; }
  schedule();
}
function onUp(e){
  if(!W) return;
  const existed = W.ptrs.delete(e.pointerId);
  if(W.pinch){
    if(W.pinch.ids.includes(e.pointerId)){
      W.pinch = null;
      for(const P of W.ptrs.values()) P.draw = false;     // a finger left on the board waits until it lifts
    }
    return;
  }
  if(!existed) return;
  if(e.pointerId===W.drawId){
    if(W.erasing){ if(W.erased){ pushUndo(W.erasing.snap); saveBoard(); } W.erasing = null; W.erased = false; schedule(); }
    else commitCur();
    W.drawId = null; W.drawKind = null;
  }
}
function startPinch(ids){
  if(W.cur || W.erasing) cancelDraw();
  W.drawId = null; W.drawKind = null;
  const a = W.ptrs.get(ids[0]), b = W.ptrs.get(ids[1]);
  const r = W.cv.getBoundingClientRect();
  W.pinch = { ids, d:Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)), z:W.z, tx:W.tx, ty:W.ty,
    cx:(a.x+b.x)/2 - r.left, cy:(a.y+b.y)/2 - r.top };
  for(const P of W.ptrs.values()) P.draw = false;
}
function movePinch(){
  const pn = W.pinch;
  const a = W.ptrs.get(pn.ids[0]), b = W.ptrs.get(pn.ids[1]); if(!a || !b) return;
  const r = W.cv.getBoundingClientRect();
  const cx = (a.x+b.x)/2 - r.left, cy = (a.y+b.y)/2 - r.top;
  const d = Math.hypot(a.x-b.x, a.y-b.y);
  const nz = Math.min(ZMAX, Math.max(ZMIN, pn.z * d / pn.d));
  const wx = (pn.cx - pn.tx) / pn.z, wy = (pn.cy - pn.ty) / pn.z;   // the world point under the start of the pinch
  W.z = nz; W.tx = cx - wx*nz; W.ty = cy - wy*nz;
  clamp(); schedule(); refreshBar();
}

/* ---------------- toolbar, palette ---------------- */
function barHTML(){
  const tb = (t, label)=>`<button class="wb-b" data-t="${t}" title="${label}">${icon(t)}<span>${label}</span></button>`;
  const ab = (a, label)=>`<button class="wb-b" data-wb="${a}" title="${label}">${icon(a)}<span>${label}</span></button>`;
  return ab('home','Home')
    + '<div class="wb-sep"></div>'
    + tb('pen','Pen') + tb('eraser','Erase') + tb('line','Line') + tb('rect','Box') + tb('bubble','Bubble')
    + '<div class="wb-sep"></div>'
    + ab('undo','Undo') + ab('clear','Clear')
    + '<div class="wb-sep"></div>'
    + `<button class="wb-b" data-wb="reset" title="Reset view">${icon('reset')}<span data-zl>100%</span></button>`;
}
function refreshBar(){
  if(!W) return;
  W.bar.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on', b.dataset.t===W.tool));
  const u = W.bar.querySelector('[data-wb=undo]'); if(u) u.disabled = !W.undo.length;
  const z = W.bar.querySelector('[data-zl]'); if(z) z.textContent = Math.round(W.z*100) + '%';
}
function palHTML(){
  return `<div class="wb-pal-h">Colour</div>
    <div class="wb-sws">${COLORS.map(c=>`<button class="wb-sw${c===W.color ? ' on' : ''}${c==='#FFFFFF' ? ' light' : ''}" data-wb="color" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
    <div class="wb-pal-h">Thickness</div>
    <div class="wb-sizes">${SIZES.map((s,i)=>`<button class="wb-sz${s===W.size ? ' on' : ''}" data-wb="size" data-s="${s}" title="${SIZE_NAMES[i]}"><span style="width:${s+4}px;height:${s+4}px"></span></button>`).join('')}</div>
    <div class="wb-pal-h">Background</div>
    <div class="wb-seg">${Object.keys(BG_NAMES).map(k=>`<button data-wb="bg" data-bg="${k}" class="${W.bg===k ? 'on' : ''}">${BG_NAMES[k]}</button>`).join('')}</div>`;
}
function refreshPal(){
  if(!W) return;
  const show = W.palOpen && DRAW_TOOLS.has(W.tool);
  W.pal.hidden = !show;
  if(!show) return;
  W.pal.innerHTML = palHTML();
  const btn = W.bar.querySelector(`[data-t="${W.tool}"]`);
  if(btn){
    const rr = W.root.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const h = W.pal.offsetHeight;
    W.pal.style.top = Math.max(8, Math.min(W.vh - h - 8, br.top - rr.top + br.height/2 - h/2)) + 'px';
  }
}
// Tool tapped: first tap picks it up; tapping it again opens its colour and thickness (drawing tools only).
function setTool(t){
  if(W.edit) endEdit(true);
  if(t===W.tool && DRAW_TOOLS.has(t)) W.palOpen = !W.palOpen;
  else { W.tool = t; W.palOpen = false; }
  refreshBar(); refreshPal();
}

/* ---------------- open / close ---------------- */
function open(){
  if(W) return;
  const l = host() && host().lesson;
  const key = yearKey(l);
  const board = loadBoard(key);
  const pb = $('.pbar'), top = pb ? Math.round(pb.getBoundingClientRect().bottom) : 0;
  const root = document.createElement('div');
  const leftRail = !!(host() && host().data && host().data.settings && host().data.settings.rail==='left');
  root.className = 'wb-root' + (leftRail ? ' wb-left' : '');
  root.style.top = top + 'px';
  root.innerHTML = `<canvas class="wb-cv"></canvas><div class="wb-bar"></div><div class="wb-pal" hidden></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.wb-cv');
  W = { key, root, cv, ctx:cv.getContext('2d'), bar:root.querySelector('.wb-bar'), pal:root.querySelector('.wb-pal'),
    bg:board.bg, items:board.items, undo:[], cur:null, drawType:null, erasing:null, erased:false, lastE:null,
    drawId:null, drawKind:null, ptrs:new Map(), pinch:null, penAt:0, edit:null,
    z:1, tx:0, ty:0, pageW:0, vw:0, vh:0, dpr:1,
    tool:'pen', color:COLORS[0], size:SIZES[0], palOpen:false };
  W.bar.innerHTML = barHTML();
  root.addEventListener('contextmenu', e=>e.preventDefault());
  root.addEventListener('click', onClick);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('lostpointercapture', onUp);
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const p = canvasPt(e);
    if(e.ctrlKey) zoomAt(p.x, p.y, W.z * Math.exp(-e.deltaY/600));
    else { W.tx -= e.deltaX; W.ty -= e.deltaY; clamp(); schedule(); }
  }, { passive:false });
  sizeCanvas();
  refreshBar();
  window.addEventListener('resize', sizeCanvas);
}
function close(){
  if(!W) return;
  if(W.edit) endEdit(true);
  window.removeEventListener('resize', sizeCanvas);
  W.root.remove();
  W = null;
}
function onClick(e){
  if(!W) return;
  const b = e.target.closest('[data-wb],[data-t]'); if(!b) return;
  if(b.dataset.t) return setTool(b.dataset.t);
  switch(b.dataset.wb){
    case 'home': close(); break;
    case 'undo': undo(); break;
    case 'clear': clearBoard(); break;
    case 'reset': resetView(); break;
    case 'color': W.color = b.dataset.c; refreshPal(); break;
    case 'size': W.size = Number(b.dataset.s); refreshPal(); break;
    case 'bg': W.bg = b.dataset.bg; saveBoard(); refreshPal(); schedule(); break;
  }
}
// Keys go to the board while it's open, so the arrows, Page Up/Down and the clicker never change the slide behind it.
// Typing in a bubble keeps its keys.
window.addEventListener('keydown', e=>{
  if(!W) return;
  if(e.target && e.target.tagName==='INPUT') return;
  if(e.ctrlKey && (e.key==='z' || e.key==='Z')){ e.preventDefault(); e.stopPropagation(); undo(); return; }
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); if(W.palOpen){ W.palOpen = false; refreshPal(); } return; }
  e.stopPropagation();
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown',' '].includes(e.key)) e.preventDefault();
}, true);
// Leaving the lesson closes the board.
window.addEventListener('sv:leave', ()=>close());

window.SVWhiteboard = { open, close, get isOpen(){ return !!W; } };
})();
