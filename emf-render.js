/* EMF -> SVG converter for the Slideshow Viewer.
   Covers the GDI records Office writes for pasted tables, text, shapes and bitmaps:
   text (with per-character spacing), pens, brushes, fonts, rectangles, ellipses,
   polygons/polylines/Béziers, paths, BitBlt/StretchDIBits bitmaps, clip rectangles,
   window/viewport mapping and world transforms. EMF+ records are skipped (Office
   always writes a GDI copy alongside them). Unknown records are ignored.
   Usage: EMF.toSvg(arrayBuffer) -> SVG markup string, or null if it isn't an EMF. */
(function(){
'use strict';

const STOCK = {
  0:{k:'brush', style:0, color:[255,255,255]}, 1:{k:'brush', style:0, color:[192,192,192]},
  2:{k:'brush', style:0, color:[128,128,128]}, 3:{k:'brush', style:0, color:[64,64,64]},
  4:{k:'brush', style:0, color:[0,0,0]},       5:{k:'brush', style:1, color:[0,0,0]},
  6:{k:'pen', style:0, width:0, color:[255,255,255]}, 7:{k:'pen', style:0, width:0, color:[0,0,0]},
  8:{k:'pen', style:5, width:0, color:[0,0,0]},
  10:{k:'font', h:-12, face:'Courier New'}, 11:{k:'font', h:-12, face:'Courier New'},
  12:{k:'font', h:-12, face:'Arial'}, 13:{k:'font', h:-16, face:'Arial', weight:700},
  14:{k:'font', h:-16, face:'Arial'}, 16:{k:'font', h:-16, face:'Courier New'}, 17:{k:'font', h:-11, face:'Segoe UI'},
  18:{k:'brush', style:0, color:[255,255,255]}, 19:{k:'pen', style:0, width:0, color:[0,0,0]},
};

const esc = (s)=> s.replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const rgb = (c)=> `rgb(${c[0]},${c[1]},${c[2]})`;
const f2 = (n)=> (Math.round(n*100)/100).toString();
const mul = (a, b)=> ({ // a then b (row-vector convention: p' = p·a·b)
  a: a.a*b.a + a.b*b.c, b: a.a*b.b + a.b*b.d,
  c: a.c*b.a + a.d*b.c, d: a.c*b.b + a.d*b.d,
  e: a.e*b.a + a.f*b.c + b.e, f: a.e*b.b + a.f*b.d + b.f });
const ID = { a:1, b:0, c:0, d:1, e:0, f:0 };

/* Decode a DIB (BITMAPINFO + bits) to a PNG/JPEG data URL. */
function dibToUrl(dv, offBmi, cbBmi, offBits, cbBits){
  if(!cbBmi || !cbBits) return null;
  const biSize = dv.getUint32(offBmi, true);
  let w, h, bpp, comp = 0, clrUsed = 0;
  if(biSize === 12){ w = dv.getUint16(offBmi+4, true); h = dv.getInt16(offBmi+6, true); bpp = dv.getUint16(offBmi+10, true); }
  else { w = dv.getInt32(offBmi+4, true); h = dv.getInt32(offBmi+8, true); bpp = dv.getUint16(offBmi+14, true); comp = dv.getUint32(offBmi+16, true); clrUsed = dv.getUint32(offBmi+32, true); }
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset + offBits, cbBits);
  if(comp === 4 || comp === 5){ // BI_JPEG / BI_PNG: bits are a complete file
    let s = ''; for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
    return `data:image/${comp===4?'jpeg':'png'};base64,${btoa(s)}`;
  }
  if(comp !== 0 && comp !== 3) return null; // RLE not supported
  const topDown = h < 0; h = Math.abs(h);
  if(!w || !h || w*h > 40e6) return null;
  // Colour table
  const palN = bpp <= 8 ? (clrUsed || (1 << bpp)) : 0;
  const palOff = offBmi + biSize + (comp === 3 && biSize === 40 ? 12 : 0);
  const pal = [];
  for(let i=0;i<palN;i++){ const o = palOff + i*(biSize===12?3:4); pal.push([dv.getUint8(o+2), dv.getUint8(o+1), dv.getUint8(o)]); }
  let masks = null;
  if(comp === 3){ const mo = biSize >= 52 ? offBmi+40 : offBmi+biSize; masks = [dv.getUint32(mo,true), dv.getUint32(mo+4,true), dv.getUint32(mo+8,true)]; }
  else if(bpp === 16) masks = [0x7C00, 0x03E0, 0x001F];
  const mshift = (m)=>{ let s=0; while(m && !(m & 1)){ m >>>= 1; s++; } let b=0; while(m & 1){ m >>>= 1; b++; } return [s, b]; };
  const ms = masks ? masks.map(mshift) : null;
  const stride = ((w * bpp + 31) >> 5) << 2;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); const img = cx.createImageData(w, h); const px = img.data;
  let anyAlpha = false;
  for(let y=0;y<h;y++){
    const row = topDown ? y : h-1-y;
    const ro = y * stride;
    if(ro + stride > bytes.length) break;
    for(let x=0;x<w;x++){
      let r, g, b, a = 255;
      if(bpp === 1){ const c = pal[(bytes[ro + (x>>3)] >> (7 - (x&7))) & 1] || [0,0,0]; [r,g,b] = c; }
      else if(bpp === 4){ const c = pal[(bytes[ro + (x>>1)] >> (x&1 ? 0 : 4)) & 15] || [0,0,0]; [r,g,b] = c; }
      else if(bpp === 8){ const c = pal[bytes[ro + x]] || [0,0,0]; [r,g,b] = c; }
      else if(bpp === 16){ const v = bytes[ro+x*2] | (bytes[ro+x*2+1] << 8); [r,g,b] = ms.map(([s,n], i)=> Math.round(((v & masks[i]) >>> s) * 255 / ((1<<n)-1))); }
      else if(bpp === 24){ b = bytes[ro+x*3]; g = bytes[ro+x*3+1]; r = bytes[ro+x*3+2]; }
      else if(bpp === 32){
        if(ms){ const v = (bytes[ro+x*4] | (bytes[ro+x*4+1]<<8) | (bytes[ro+x*4+2]<<16) | (bytes[ro+x*4+3]<<24)) >>> 0; [r,g,b] = ms.map(([s,n], i)=> Math.round(((v & masks[i]) >>> s) * 255 / ((2**n)-1))); }
        else { b = bytes[ro+x*4]; g = bytes[ro+x*4+1]; r = bytes[ro+x*4+2]; a = bytes[ro+x*4+3]; if(a) anyAlpha = true; }
      } else return null;
      const o = (row*w + x)*4; px[o]=r; px[o+1]=g; px[o+2]=b; px[o+3]=a;
    }
  }
  // 32-bit DIBs usually leave alpha at 0 meaning "opaque".
  if(bpp === 32 && !ms && !anyAlpha) for(let i=3;i<px.length;i+=4) px[i] = 255;
  cx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

function toSvg(buf){
  const dv = buf instanceof DataView ? buf : new DataView(buf);
  if(dv.byteLength < 88 || dv.getUint32(0, true) !== 1 || dv.getUint32(40, true) !== 0x464D4520) return null;
  const hdrSize = dv.getUint32(4, true);
  const i32 = (o)=> dv.getInt32(o, true), u32 = (o)=> dv.getUint32(o, true), i16 = (o)=> dv.getInt16(o, true);
  const rect = (o)=> [i32(o), i32(o+4), i32(o+8), i32(o+12)];
  const frame = rect(24); // 0.01 mm
  const bounds = rect(8);
  let devPerMmX = i32(72) / i32(80), devPerMmY = i32(76) / i32(84);
  if(hdrSize >= 108 && i32(100) > 0 && i32(104) > 0){ devPerMmX = i32(72) / (i32(100)/1000); devPerMmY = i32(76) / (i32(104)/1000); }
  let vb = [frame[0]/100*devPerMmX, frame[1]/100*devPerMmY, (frame[2]-frame[0])/100*devPerMmX, (frame[3]-frame[1])/100*devPerMmY];
  if(!(vb[2] > 0 && vb[3] > 0)) vb = [bounds[0], bounds[1], bounds[2]-bounds[0]+1, bounds[3]-bounds[1]+1];

  const objs = [];
  const out = [];
  const clips = [];
  let st = {
    mapMode: 1, wOrg:[0,0], wExt:[1,1], vOrg:[0,0], vExt:[1,1], world: { ...ID },
    pen: STOCK[7], brush: STOCK[0], font: STOCK[12],
    textColor:[0,0,0], bkColor:[255,255,255], bkMode:2, textAlign:0, polyFill:1,
    cur:[0,0], clip:null, clipId:null,
  };
  const stack = [];
  let path = null; // array of SVG path commands while a path bracket is open

  const pageM = ()=>{
    let sx = 1, sy = 1;
    if(st.mapMode === 7 || st.mapMode === 8){ sx = st.vExt[0] / (st.wExt[0] || 1); sy = st.vExt[1] / (st.wExt[1] || 1);
      if(st.mapMode === 7){ const s = Math.min(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx)*s; sy = Math.sign(sy)*s; } }
    else if(st.mapMode >= 2 && st.mapMode <= 6){
      const mm = { 2:0.1, 3:0.01, 4:0.254, 5:0.0254, 6:25.4/1440 }[st.mapMode];
      sx = mm * devPerMmX; sy = -mm * devPerMmY;
    }
    return { a:sx, b:0, c:0, d:sy, e: st.vOrg[0] - st.wOrg[0]*sx, f: st.vOrg[1] - st.wOrg[1]*sy };
  };
  let M = ID, MDirty = true;
  const mat = ()=>{ if(MDirty){ M = mul(st.world, pageM()); MDirty = false; } return M; };
  const P = (x, y)=>{ const m = mat(); return [x*m.a + y*m.c + m.e, x*m.b + y*m.d + m.f]; };
  const scl = ()=>{ const m = mat(); return Math.sqrt(Math.abs(m.a*m.d - m.b*m.c)) || 1; };
  const sclY = ()=>{ const m = mat(); return Math.hypot(m.c, m.d) || 1; };

  const clipAttr = ()=>{
    if(!st.clip) return '';
    if(!st.clipId){
      const [x0,y0,x1,y1] = st.clip;
      st.clipId = 'c' + clips.length;
      clips.push(`<clipPath id="${st.clipId}"><rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(Math.max(0,x1-x0))}" height="${f2(Math.max(0,y1-y0))}"/></clipPath>`);
    }
    return ` clip-path="url(#${st.clipId})"`;
  };
  const setClip = (r)=>{ st.clip = r; st.clipId = null; };
  const andClip = (r)=>{ const c = st.clip; setClip(c ? [Math.max(c[0],r[0]), Math.max(c[1],r[1]), Math.min(c[2],r[2]), Math.min(c[3],r[3])] : r); };
  const devRect = (l, t, r, b)=>{ const a = P(l, t), c = P(r, b); return [Math.min(a[0],c[0]), Math.min(a[1],c[1]), Math.max(a[0],c[0]), Math.max(a[1],c[1])]; };

  const fillAttr = (closed)=>{
    const b = st.brush;
    if(!closed || !b || b.style === 1) return 'fill="none"';
    let s = `fill="${rgb(b.color)}"`;
    if(b.style === 2) s += ' fill-opacity="0.35"';  // hatched: approximate
    if(st.polyFill === 2) s += ' fill-rule="nonzero"'; else s += ' fill-rule="evenodd"';
    return s;
  };
  const strokeAttr = ()=>{
    const p = st.pen;
    if(!p || (p.style & 0xF) === 5) return 'stroke="none"';
    // Width 0 = one device pixel; otherwise logical units.
    const w = p.width ? p.width * scl() : 1;
    let s = `stroke="${rgb(p.color)}" stroke-width="${f2(w)}"`;
    const ds = p.style & 0xF; const u = Math.max(1, w);
    if(ds === 1) s += ` stroke-dasharray="${f2(u*3)} ${f2(u)}"`;
    else if(ds === 2) s += ` stroke-dasharray="${f2(u)} ${f2(u)}"`;
    else if(ds === 3) s += ` stroke-dasharray="${f2(u*3)} ${f2(u)} ${f2(u)} ${f2(u)}"`;
    else if(ds === 4) s += ` stroke-dasharray="${f2(u*3)} ${f2(u)} ${f2(u)} ${f2(u)} ${f2(u)} ${f2(u)}"`;
    const cap = (p.style >> 8) & 0xF, join = (p.style >> 12) & 0xF;
    s += ` stroke-linecap="${cap===1?'square':cap===2?'butt':'round'}" stroke-linejoin="${join===1?'bevel':join===2?'miter':'round'}"`;
    return s;
  };
  const emit = (d, closed, doFill=true, doStroke=true)=>{
    if(path){ path.push(d); return; }
    out.push(`<path d="${d}" ${doFill ? fillAttr(closed) : 'fill="none"'} ${doStroke ? strokeAttr() : 'stroke="none"'}${clipAttr()}/>`);
  };
  const ptsD = (pts, close)=> 'M' + pts.map(p=>f2(p[0])+','+f2(p[1])).join(' L') + (close ? ' Z' : '');
  const readPts = (o, n, is16)=>{ const a = []; for(let i=0;i<n;i++) a.push(is16 ? P(i16(o+i*4), i16(o+i*4+2)) : P(i32(o+i*8), i32(o+i*8+4))); return a; };

  const text = (o, wide)=>{
    // EMR_EXTTEXTOUT: bounds(16) iGraphicsMode exScale eyScale, then EMRTEXT at o+36
    const t = o + 36;
    const rx = i32(t), ry = i32(t+4), n = u32(t+8), offS = u32(t+12), opts = u32(t+16);
    const rcl = rect(t+20), offDx = u32(t+36);
    if((opts & 0x2) && rcl[2] > rcl[0]){ // ETO_OPAQUE: fill background rectangle
      const r = devRect(rcl[0], rcl[1], rcl[2], rcl[3]);
      out.push(`<rect x="${f2(r[0])}" y="${f2(r[1])}" width="${f2(r[2]-r[0])}" height="${f2(r[3]-r[1])}" fill="${rgb(st.bkColor)}"${clipAttr()}/>`);
    }
    if(!n || (opts & 0x10)) return; // glyph indices can't be mapped back to characters
    let str = '';
    if(wide){ for(let i=0;i<n;i++) str += String.fromCharCode(dv.getUint16(o+offS+i*2, true)); }
    else { for(let i=0;i<n;i++) str += String.fromCharCode(dv.getUint8(o+offS+i)); }
    if(!str.trim()) return;
    const f = st.font || STOCK[12];
    const hLog = Math.abs(f.h || 12);
    const em = (f.h < 0 ? hLog : hLog * 0.87) * sclY();
    // Advances (logical units) for each character, if given.
    const pdy = !!(opts & 0x2000);
    let adv = null;
    if(offDx){ adv = []; for(let i=0;i<n;i++) adv.push(i32(o + offDx + i*4*(pdy?2:1))); }
    const ta = st.textAlign;
    let x = rx, y = ry;
    if(ta & 1){ x = st.cur[0]; y = st.cur[1]; }
    const total = adv ? adv.reduce((s,v)=>s+v, 0) : null;
    const hz = ta & 6;
    let anchor = 'start';
    if(adv){ if(hz === 2) x -= total; else if(hz === 6) x -= total/2; }
    else anchor = hz === 2 ? 'end' : hz === 6 ? 'middle' : 'start';
    if((ta & 1) && adv) st.cur = [x + (hz===2 ? 0 : total), y];
    // Baseline offset (device px) from the reference point.
    const vt = ta & 24;
    const dy = vt === 24 ? 0 : vt === 8 ? -0.212*em : 0.905*em;
    const escDeg = (f.esc || 0) / 10;
    const p0 = P(x, y);
    const m = mat();
    const sx = (m.a >= 0 ? 1 : -1);
    let xs;
    if(adv){ xs = []; let acc = 0; for(let i=0;i<n;i++){ const pp = P(x + acc, y); xs.push(f2(pp[0])); acc += adv[i]; } }
    const fam = `'${(f.face||'Arial').replace(/'/g,'')}', Arial, sans-serif`;
    const deco = [f.underline?'underline':'', f.strike?'line-through':''].filter(Boolean).join(' ');
    const rot = escDeg ? ` transform="rotate(${f2(-escDeg*sx)} ${f2(p0[0])} ${f2(p0[1])})"` : '';
    const yy = f2(p0[1] + dy);
    out.push(`<text x="${adv ? xs.join(' ') : f2(p0[0])}" y="${yy}" font-family="${esc_(fam)}" font-size="${f2(em)}"${f.weight>=600?' font-weight="bold"':''}${f.italic?' font-style="italic"':''}${deco?` text-decoration="${deco}"`:''}${anchor!=='start'?` text-anchor="${anchor}"`:''} fill="${rgb(st.textColor)}" xml:space="preserve"${rot}${clipAttr()}>${esc(str)}</text>`);
  };
  const esc_ = (s)=> s.replace(/"/g, '&quot;');

  const blt = (xD, yD, cxD, cyD, rop, offBmi, cbBmi, offBits, cbBits, o)=>{
    const r = devRect(xD, yD, xD + cxD, yD + cyD);
    if(!cbBmi){
      let fill = null;
      if(rop === 0x00F00021 || rop === 0x005A0049){ if(st.brush && st.brush.style !== 1) fill = rgb(st.brush.color); } // PATCOPY / PATINVERT(approx)
      else if(rop === 0x00000042) fill = 'rgb(0,0,0)';      // BLACKNESS
      else if(rop === 0x00FF0062) fill = 'rgb(255,255,255)'; // WHITENESS
      if(fill) out.push(`<rect x="${f2(r[0])}" y="${f2(r[1])}" width="${f2(r[2]-r[0])}" height="${f2(r[3]-r[1])}" fill="${fill}"${clipAttr()}/>`);
      return;
    }
    let url = null;
    try{ url = dibToUrl(dv, o + offBmi, cbBmi, o + offBits, cbBits); }catch(e){ url = null; }
    if(url) out.push(`<image x="${f2(r[0])}" y="${f2(r[1])}" width="${f2(r[2]-r[0])}" height="${f2(r[3]-r[1])}" preserveAspectRatio="none" href="${url}"${clipAttr()}/>`);
  };

  const arcPath = (l, t, r, b)=>{ const a = P(l, t), c = P(r, b); const cx = (a[0]+c[0])/2, cy = (a[1]+c[1])/2, rx = Math.abs(c[0]-a[0])/2, ry = Math.abs(c[1]-a[1])/2;
    return `M${f2(cx-rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx+rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx-rx)},${f2(cy)} Z`; };

  let o = 0, guard = 0;
  while(o + 8 <= dv.byteLength && guard++ < 2e6){
    const type = u32(o), size = u32(o+4);
    if(size < 8 || o + size > dv.byteLength) break;
    switch(type){
      case 14: o = dv.byteLength; continue; // EOF
      case 9: st.wExt = [i32(o+8), i32(o+12)]; MDirty = true; break;
      case 10: st.wOrg = [i32(o+8), i32(o+12)]; MDirty = true; break;
      case 11: st.vExt = [i32(o+8), i32(o+12)]; MDirty = true; break;
      case 12: st.vOrg = [i32(o+8), i32(o+12)]; MDirty = true; break;
      case 17: st.mapMode = u32(o+8); MDirty = true; break;
      case 35: case 36: {
        const x = { a:dv.getFloat32(o+8,true), b:dv.getFloat32(o+12,true), c:dv.getFloat32(o+16,true), d:dv.getFloat32(o+20,true), e:dv.getFloat32(o+24,true), f:dv.getFloat32(o+28,true) };
        if(type === 35) st.world = x;
        else { const mode = u32(o+32); st.world = mode === 1 ? { ...ID } : mode === 2 ? mul(x, st.world) : mode === 3 ? mul(st.world, x) : x; }
        MDirty = true; break;
      }
      case 33: stack.push({ ...st, wOrg:[...st.wOrg], wExt:[...st.wExt], vOrg:[...st.vOrg], vExt:[...st.vExt], world:{ ...st.world }, cur:[...st.cur] }); break;
      case 34: { let n = i32(o+8); if(n < 0){ let s = null; while(n++ < 0 && stack.length) s = stack.pop(); if(s) st = s; } MDirty = true; break; }
      case 38: objs[u32(o+8)] = { k:'pen', style:u32(o+12), width:i32(o+16), color:[dv.getUint8(o+24), dv.getUint8(o+25), dv.getUint8(o+26)] }; break;
      case 95: { const style = u32(o+28); objs[u32(o+8)] = { k:'pen', style, width:u32(o+32), geometric: !!(style & 0x10000), color:[dv.getUint8(o+40), dv.getUint8(o+41), dv.getUint8(o+42)] }; if(u32(o+36) === 1) objs[u32(o+8)].style = (style & ~0xF) | 5; break; }
      case 39: objs[u32(o+8)] = { k:'brush', style:u32(o+12), color:[dv.getUint8(o+16), dv.getUint8(o+17), dv.getUint8(o+18)] }; break;
      case 93: case 94: objs[u32(o+8)] = { k:'brush', style:0, color:[128,128,128] }; break; // pattern brushes: grey
      case 82: {
        const b = o + 12; let face = '';
        for(let i=0;i<32;i++){ const c = dv.getUint16(b+28+i*2, true); if(!c) break; face += String.fromCharCode(c); }
        objs[u32(o+8)] = { k:'font', h:i32(b), esc:i32(b+8), weight:i32(b+16), italic:dv.getUint8(b+20), underline:dv.getUint8(b+21), strike:dv.getUint8(b+22), face: face || 'Arial' };
        break;
      }
      case 37: { const ih = u32(o+8); const ob = (ih & 0x80000000) ? STOCK[ih & 0x7FFFFFFF] : objs[ih]; if(ob) st[ob.k] = ob; break; }
      case 40: objs[u32(o+8)] = undefined; break;
      case 24: st.textColor = [dv.getUint8(o+8), dv.getUint8(o+9), dv.getUint8(o+10)]; break;
      case 25: st.bkColor = [dv.getUint8(o+8), dv.getUint8(o+9), dv.getUint8(o+10)]; break;
      case 18: st.bkMode = u32(o+8); break;
      case 22: st.textAlign = u32(o+8); break;
      case 19: st.polyFill = u32(o+8); break;
      case 27: st.cur = [i32(o+8), i32(o+12)]; if(path) path.push('M' + P(...st.cur).map(f2).join(',')); break;
      case 54: { const a = P(...st.cur), b = [i32(o+8), i32(o+12)]; const bb = P(...b);
        if(path) path.push('L' + bb.map(f2).join(',')); else emit(`M${f2(a[0])},${f2(a[1])} L${f2(bb[0])},${f2(bb[1])}`, false);
        st.cur = b; break; }
      case 43: { const r = devRect(...rect(o+8)); emit(`M${f2(r[0])},${f2(r[1])} H${f2(r[2])} V${f2(r[3])} H${f2(r[0])} Z`, true); break; }
      case 44: { const [l,t,r,b] = rect(o+8); const rr = devRect(l,t,r,b); const rx = Math.abs(i32(o+24)*mat().a)/2, ry = Math.abs(i32(o+28)*mat().d)/2;
        out.push(`<rect x="${f2(rr[0])}" y="${f2(rr[1])}" width="${f2(rr[2]-rr[0])}" height="${f2(rr[3]-rr[1])}" rx="${f2(rx)}" ry="${f2(ry)}" ${fillAttr(true)} ${strokeAttr()}${clipAttr()}/>`); break; }
      case 42: emit(arcPath(...rect(o+8)), true); break;
      case 3: case 4: case 86: case 87: case 2: case 85: case 5: case 88: case 6: case 89: {
        const is16 = type >= 85; const n = u32(o+24); const pts = readPts(o+28, n, is16);
        const kind = { 3:'pg', 86:'pg', 4:'pl', 87:'pl', 2:'bz', 85:'bz', 5:'bzto', 88:'bzto', 6:'plto', 89:'plto' }[type];
        if(!pts.length) break;
        let d;
        if(kind === 'pg' || kind === 'pl') d = ptsD(pts, kind === 'pg');
        else if(kind === 'plto'){ const c = P(...st.cur); d = (path ? '' : `M${f2(c[0])},${f2(c[1])} `) + 'L' + pts.map(p=>f2(p[0])+','+f2(p[1])).join(' L'); }
        else {
          const start = kind === 'bz' ? pts.shift() : P(...st.cur);
          d = (kind === 'bz' || !path ? `M${f2(start[0])},${f2(start[1])} ` : '');
          for(let i=0;i+2<pts.length;i+=3) d += `C${pts.slice(i,i+3).map(p=>f2(p[0])+','+f2(p[1])).join(' ')} `;
        }
        if(kind === 'plto' || kind === 'bzto'){ const lp = is16 ? [i16(o+28+(n-1)*4), i16(o+30+(n-1)*4)] : [i32(o+28+(n-1)*8), i32(o+32+(n-1)*8)]; st.cur = lp; }
        emit(d, kind === 'pg');
        break;
      }
      case 7: case 8: case 90: case 91: { // PolyPolyline / PolyPolygon (32 and 16 bit)
        const is16 = type >= 90; const nPolys = u32(o+24); const cnt = []; for(let i=0;i<nPolys;i++) cnt.push(u32(o+32+i*4));
        let p = o + 32 + nPolys*4; let d = '';
        for(const c of cnt){ const pts = readPts(p, c, is16); p += c * (is16 ? 4 : 8); if(pts.length) d += ptsD(pts, type===8||type===91) + ' '; }
        if(d) emit(d, type===8||type===91);
        break;
      }
      case 59: path = []; break;          // BEGINPATH
      case 60: break;                      // ENDPATH (keep path for fill/stroke)
      case 61: if(path) path.push('Z'); break;
      case 62: case 63: case 64: {         // FILLPATH / STROKEANDFILLPATH / STROKEPATH
        const d = path ? path.join(' ') : ''; path = null;
        if(d) emit(d, type !== 64, type !== 64, type !== 62);
        break;
      }
      case 65: path = null; break;        // ABORTPATH
      case 67: path = null; break;        // SELECTCLIPPATH: not supported, drop the path
      case 30: andClip(devRect(...rect(o+8))); break; // INTERSECTCLIPRECT
      case 75: {                           // EXTSELECTCLIPRGN
        const cb = u32(o+8), mode = u32(o+12);
        if(mode === 5 && !cb){ setClip(null); break; }
        if(cb >= 32){ const rb = [i32(o+16+16), i32(o+16+20), i32(o+16+24), i32(o+16+28)];
          if(mode === 5) setClip(rb); else if(mode === 1) andClip(rb); }
        break;
      }
      case 84: text(o, true); break;
      case 83: text(o, false); break;
      case 76: blt(i32(o+24), i32(o+28), i32(o+32), i32(o+36), u32(o+40), u32(o+84), u32(o+88), u32(o+92), u32(o+96), o); break;
      case 77: blt(i32(o+24), i32(o+28), i32(o+32), i32(o+36), u32(o+40), u32(o+84), u32(o+88), u32(o+92), u32(o+96), o); break;
      case 81: blt(i32(o+24), i32(o+28), i32(o+72), i32(o+76), u32(o+68), u32(o+48), u32(o+52), u32(o+56), u32(o+60), o); break;
    }
    o += size;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f2).join(' ')}" preserveAspectRatio="none" width="${f2(vb[2])}" height="${f2(vb[3])}">`
    + (clips.length ? `<defs>${clips.join('')}</defs>` : '') + out.join('') + '</svg>';
}

window.EMF = { toSvg };
})();
