/* =====================================================================
   PPTX renderer — Slideshow Viewer
   Reads a .pptx (via JSZip) and builds each slide as positioned HTML/SVG.
   Units: 1 slide px = 1 pt (12700 EMU), so a 16:9 deck is 960 x 540 and
   font sizes in pt map straight to px. The viewer scales the slide with a
   CSS transform.
   Supported: theme colours/fonts, master + layout inheritance, backgrounds,
   text (levels, bullets, numbering, autofit), preset + custom shapes,
   lines/connectors, pictures (crop), groups, tables (approx. default
   style), SmartArt (via its saved drawing), OLE fallback pictures,
   embedded + online (YouTube) video, slide number fields.
   Not supported (use the PDF fallback): charts, WordArt effects, shadows/
   3D, EMF/WMF images, text columns, vertical text.
   Every top-level object on a slide gets data-oid = its shape id, which is
   what the editor's hide/show settings and the deck's animations refer to.
   ===================================================================== */
(function(){
'use strict';
const EMU = 12700;
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/* ---------- small XML helpers (match by localName, ignore prefixes) ---------- */
function kids(el, name){ if(!el) return []; const out=[]; for(const c of el.children) if(!name || c.localName===name) out.push(c); return out; }
function kid(el, name){ if(!el) return null; for(const c of el.children) if(c.localName===name) return c; return null; }
function path(el, ...names){ for(const n of names){ el = kid(el, n); if(!el) return null; } return el; }
function desc(el, name){ return el ? (el.getElementsByTagNameNS('*', name)[0] || null) : null; }
function descAll(el, name){ return el ? [...el.getElementsByTagNameNS('*', name)] : []; }
function attr(el, n, d){ if(!el) return d; const v = el.getAttribute(n); return v==null ? d : v; }
function num(el, n, d){ const v = attr(el, n, null); return v==null || v==='' ? d : Number(v); }
function rAttr(el, n){ if(!el) return null; return el.getAttributeNS(R_NS, n) || el.getAttribute('r:'+n) || null; }
function bool(el, n, d){ const v = attr(el, n, null); if(v==null) return d; return v==='1' || v==='true'; }
function parseXML(text){ return new DOMParser().parseFromString(text, 'application/xml'); }

function dirOf(p){ const i = p.lastIndexOf('/'); return i<0 ? '' : p.slice(0, i); }
function resolvePath(base, target){
  if(target.startsWith('/')) return target.slice(1);
  const parts = (dirOf(base) ? dirOf(base).split('/') : []);
  for(const seg of target.split('/')){
    if(seg==='..') parts.pop(); else if(seg && seg!=='.') parts.push(seg);
  }
  return parts.join('/');
}

/* ---------- colours ---------- */
const PRST_COLORS = { black:'000000', white:'FFFFFF', red:'FF0000', green:'008000', blue:'0000FF', yellow:'FFFF00', cyan:'00FFFF', magenta:'FF00FF', gray:'808080', grey:'808080', darkGray:'A9A9A9', lightGray:'D3D3D3', orange:'FFA500', purple:'800080', navy:'000080', maroon:'800000', olive:'808000', teal:'008080', silver:'C0C0C0', lime:'00FF00', darkBlue:'00008B', darkRed:'8B0000', darkGreen:'006400' };
function hex(h){ h = (h||'000000').replace('#',''); if(h.length===3) h = h.split('').map(c=>c+c).join(''); const n = parseInt(h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255, a:1 }; }
function rgb2hsl(c){ const r=c.r/255,g=c.g/255,b=c.b/255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0,s=0; const l=(mx+mn)/2; if(mx!==mn){ const d=mx-mn; s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn); if(mx===r) h=(g-b)/d+(g<b?6:0); else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h/=6; } return {h,s,l}; }
function hsl2rgb(h,s,l,a){ let r,g,b; if(s===0){ r=g=b=l; } else { const f=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }; const q = l<0.5 ? l*(1+s) : l+s-l*s; const p = 2*l-q; r=f(p,q,h+1/3); g=f(p,q,h); b=f(p,q,h-1/3); } return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255), a }; }
const clamp01 = v => Math.max(0, Math.min(1, v));
function applyMods(c, el){
  for(const m of el.children){
    const v = num(m, 'val', 0) / 100000;
    switch(m.localName){
      case 'alpha': c.a = v; break;
      case 'alphaMod': c.a = clamp01(c.a * v); break;
      case 'lumMod': { const h = rgb2hsl(c); c = hsl2rgb(h.h, h.s, clamp01(h.l * v), c.a); break; }
      case 'lumOff': { const h = rgb2hsl(c); c = hsl2rgb(h.h, h.s, clamp01(h.l + v), c.a); break; }
      case 'satMod': { const h = rgb2hsl(c); c = hsl2rgb(h.h, clamp01(h.s * v), h.l, c.a); break; }
      case 'tint': c = { r:Math.round(c.r + (255-c.r)*(1-v)), g:Math.round(c.g + (255-c.g)*(1-v)), b:Math.round(c.b + (255-c.b)*(1-v)), a:c.a }; break;
      case 'shade': c = { r:Math.round(c.r*v), g:Math.round(c.g*v), b:Math.round(c.b*v), a:c.a }; break;
    }
  }
  return c;
}
const COLOR_TAGS = new Set(['srgbClr','schemeClr','sysClr','prstClr','scrgbClr','hslClr']);
function colorFrom(el, ctx){
  if(!el) return null;
  for(const c of el.children){
    if(!COLOR_TAGS.has(c.localName)) continue;
    let base;
    switch(c.localName){
      case 'srgbClr': base = hex(attr(c,'val')); break;
      case 'sysClr': base = hex(attr(c,'lastClr') || (attr(c,'val')==='window' ? 'FFFFFF' : '000000')); break;
      case 'prstClr': base = hex(PRST_COLORS[attr(c,'val')] || '000000'); break;
      case 'scrgbClr': base = { r:Math.round(num(c,'r',0)/100000*255), g:Math.round(num(c,'g',0)/100000*255), b:Math.round(num(c,'b',0)/100000*255), a:1 }; break;
      case 'hslClr': base = hsl2rgb(num(c,'hue',0)/21600000, num(c,'sat',0)/100000, num(c,'lum',0)/100000, 1); break;
      case 'schemeClr': base = schemeColor(attr(c,'val'), ctx); break;
    }
    return applyMods({ ...base }, c);
  }
  return null;
}
function schemeColor(name, ctx){
  if(name==='phClr') return ctx.phClr ? { ...ctx.phClr } : { r:0,g:0,b:0,a:1 };
  const mapped = (ctx.clrMap && ctx.clrMap[name]) || name;
  const c = ctx.theme.colors[mapped] || ctx.theme.colors[name];
  return c ? { ...c } : { r:0,g:0,b:0,a:1 };
}
function css(c){ if(!c) return 'transparent'; return c.a>=1 ? `rgb(${c.r},${c.g},${c.b})` : `rgba(${c.r},${c.g},${c.b},${+c.a.toFixed(3)})`; }

/* ---------- fills & lines ---------- */
const FILL_TAGS = new Set(['noFill','solidFill','gradFill','blipFill','pattFill','grpFill']);
function fillFromEl(f, ctx){
  if(!f) return null;
  switch(f.localName){
    case 'noFill': return { type:'none' };
    case 'solidFill': { const c = colorFrom(f, ctx); return c ? { type:'solid', color:c } : null; }
    case 'gradFill': {
      const stops = kids(path(f,'gsLst'),'gs').map(gs=>({ pos:num(gs,'pos',0)/1000, color:colorFrom(gs, ctx) })).filter(s=>s.color).sort((a,b)=>a.pos-b.pos);
      if(!stops.length) return null;
      const lin = kid(f,'lin');
      return { type:'grad', stops, angle: lin ? num(lin,'ang',0)/60000 : 90, radial: !!kid(f,'path') };
    }
    case 'blipFill': { const url = ctx.media(rAttr(kid(f,'blip'),'embed'), ctx.part); return url ? { type:'img', url, tile: !!kid(f,'tile') } : null; }
    case 'pattFill': { const c = colorFrom(kid(f,'fgClr'), ctx); return c ? { type:'solid', color:c } : null; }
    case 'grpFill': return ctx.grpFill || null;
  }
  return null;
}
function fillFromProps(props, ctx){
  if(!props) return null;
  for(const c of props.children) if(FILL_TAGS.has(c.localName)) return fillFromEl(c, ctx);
  return null;
}
function styleRefFill(styleEl, ctx){
  const fr = kid(styleEl,'fillRef'); if(!fr) return null;
  const idx = num(fr,'idx',0); if(idx===0) return { type:'none' };
  const phClr = colorFrom(fr, ctx);
  const lst = idx>=1001 ? ctx.theme.bgFills : ctx.theme.fills;
  const f = lst[(idx>=1001 ? idx-1001 : idx-1)];
  return f ? fillFromEl(f, { ...ctx, phClr }) : (phClr ? { type:'solid', color:phClr } : null);
}
function lineFrom(spPr, styleEl, ctx){
  const ln = kid(spPr,'ln');
  let base = null;
  const lr = kid(styleEl,'lnRef');
  if(lr && num(lr,'idx',0)>0){
    const phClr = colorFrom(lr, ctx);
    const tl = ctx.theme.lines[num(lr,'idx',1)-1];
    base = { w: tl ? num(tl,'w',9525)/EMU : 0.75, color: phClr, dash: tl ? attr(kid(tl,'prstDash'),'val',null) : null };
    if(tl){ const f = fillFromProps(tl, { ...ctx, phClr }); if(f && f.type==='solid') base.color = f.color; if(f && f.type==='none') base = null; }
  }
  if(!ln) return base && base.color ? base : null;
  const f = fillFromProps(ln, ctx);
  if(f && f.type==='none') return null;
  const out = base ? { ...base } : { w:0.75, color:null };
  if(ln.hasAttribute('w')) out.w = num(ln,'w',9525)/EMU;
  if(f && f.type==='solid') out.color = f.color;
  else if(f && f.type==='grad') out.color = f.stops[0].color;
  const d = attr(kid(ln,'prstDash'),'val',null); if(d) out.dash = d;
  const he = kid(ln,'headEnd'), te = kid(ln,'tailEnd');
  if(he && attr(he,'type','none')!=='none') out.head = attr(he,'type');
  if(te && attr(te,'type','none')!=='none') out.tail = attr(te,'type');
  return out.color ? out : null;
}
function fillToCss(f){
  if(!f || f.type==='none') return '';
  if(f.type==='solid') return css(f.color);
  if(f.type==='grad'){
    const st = f.stops.map(s=>`${css(s.color)} ${s.pos}%`).join(', ');
    return f.radial ? `radial-gradient(circle, ${st})` : `linear-gradient(${f.angle+90}deg, ${st})`;
  }
  if(f.type==='img') return f.tile ? `url("${f.url}")` : `url("${f.url}") center / 100% 100% no-repeat`;
  return '';
}

/* ---------- geometry ---------- */
function adjVals(prstGeom){
  const out = {};
  for(const gd of kids(kid(prstGeom,'avLst'),'gd')){ const m = /val\s+(-?\d+)/.exec(attr(gd,'fmla','')); if(m) out[attr(gd,'name')] = Number(m[1]); }
  return out;
}
function poly(pts){ return 'M' + pts.map(p=>p[0].toFixed(2)+','+p[1].toFixed(2)).join(' L') + ' Z'; }
function ellipsePath(w,h){ const rx=w/2, ry=h/2; return `M0,${ry} A${rx},${ry} 0 1 1 ${w},${ry} A${rx},${ry} 0 1 1 0,${ry} Z`; }
function roundRectPath(w,h,r){ r = Math.max(0, Math.min(r, w/2, h/2)); return `M${r},0 H${w-r} A${r},${r} 0 0 1 ${w},${r} V${h-r} A${r},${r} 0 0 1 ${w-r},${h} H${r} A${r},${r} 0 0 1 0,${h-r} V${r} A${r},${r} 0 0 1 ${r},0 Z`; }
function starPath(w,h,n,inner){ const pts=[]; for(let i=0;i<n*2;i++){ const a = -Math.PI/2 + i*Math.PI/n; const r = i%2 ? inner : 1; pts.push([w/2 + Math.cos(a)*w/2*r, h/2 + Math.sin(a)*h/2*r]); } return poly(pts); }
function presetPath(prst, w, h, av){
  const ss = Math.min(w,h);
  const A = (k,d)=> (av[k]!=null ? av[k] : d)/100000;
  switch(prst){
    case 'rect': case 'flowChartProcess': case 'textBox': case 'wedgeRectCallout': return `M0,0 H${w} V${h} H0 Z`;
    case 'roundRect': case 'flowChartAlternateProcess': case 'wedgeRoundRectCallout': return roundRectPath(w,h,ss*A('adj',16667));
    case 'flowChartTerminator': return roundRectPath(w,h,Math.min(w,h)/2);
    case 'ellipse': case 'flowChartConnector': case 'wedgeEllipseCallout': case 'cloud': case 'cloudCallout': return ellipsePath(w,h);
    case 'triangle': case 'flowChartExtract': { const x = w*A('adj',50000); return poly([[x,0],[w,h],[0,h]]); }
    case 'rtTriangle': return poly([[0,0],[0,h],[w,h]]);
    case 'diamond': case 'flowChartDecision': return poly([[w/2,0],[w,h/2],[w/2,h],[0,h/2]]);
    case 'parallelogram': case 'flowChartInputOutput': { const x = ss*A('adj',25000); return poly([[x,0],[w,0],[w-x,h],[0,h]]); }
    case 'trapezoid': { const x = ss*A('adj',25000); return poly([[x,0],[w-x,0],[w,h],[0,h]]); }
    case 'hexagon': { const x = ss*A('adj',25000); return poly([[x,0],[w-x,0],[w,h/2],[w-x,h],[x,h],[0,h/2]]); }
    case 'octagon': { const x = ss*A('adj',29289); return poly([[x,0],[w-x,0],[w,x],[w,h-x],[w-x,h],[x,h],[0,h-x],[0,x]]); }
    case 'pentagon': return poly([[w/2,0],[w,h*0.38],[w*0.81,h],[w*0.19,h],[0,h*0.38]]);
    case 'homePlate': { const x = w - ss*A('adj',50000); return poly([[0,0],[x,0],[w,h/2],[x,h],[0,h]]); }
    case 'chevron': { const x = ss*A('adj',50000); return poly([[0,0],[w-x,0],[w,h/2],[w-x,h],[0,h],[x,h/2]]); }
    case 'snip1Rect': { const x = ss*A('adj',16667); return poly([[0,0],[w-x,0],[w,x],[w,h],[0,h]]); }
    case 'plus': case 'flowChartOr': { const x = ss*A('adj',25000); return poly([[x,0],[w-x,0],[w-x,x],[w,x],[w,h-x],[w-x,h-x],[w-x,h],[x,h],[x,h-x],[0,h-x],[0,x],[x,x]]); }
    case 'rightArrow': { const sh = h*A('adj1',50000), hd = ss*A('adj2',50000); const y1=(h-sh)/2, y2=y1+sh, x=w-hd; return poly([[0,y1],[x,y1],[x,0],[w,h/2],[x,h],[x,y2],[0,y2]]); }
    case 'leftArrow': { const sh = h*A('adj1',50000), hd = ss*A('adj2',50000); const y1=(h-sh)/2, y2=y1+sh; return poly([[w,y1],[hd,y1],[hd,0],[0,h/2],[hd,h],[hd,y2],[w,y2]]); }
    case 'upArrow': { const sw = w*A('adj1',50000), hd = ss*A('adj2',50000); const x1=(w-sw)/2, x2=x1+sw; return poly([[x1,h],[x1,hd],[0,hd],[w/2,0],[w,hd],[x2,hd],[x2,h]]); }
    case 'downArrow': { const sw = w*A('adj1',50000), hd = ss*A('adj2',50000); const x1=(w-sw)/2, x2=x1+sw, y=h-hd; return poly([[x1,0],[x2,0],[x2,y],[w,y],[w/2,h],[0,y],[x1,y]]); }
    case 'leftRightArrow': { const sh = h*A('adj1',50000), hd = ss*A('adj2',50000); const y1=(h-sh)/2, y2=y1+sh; return poly([[0,h/2],[hd,0],[hd,y1],[w-hd,y1],[w-hd,0],[w,h/2],[w-hd,h],[w-hd,y2],[hd,y2],[hd,h]]); }
    case 'star5': return starPath(w,h,5,0.382);
    case 'star4': return starPath(w,h,4,0.25);
    case 'star6': return starPath(w,h,6,0.5);
    case 'heart': return `M${w/2},${h*0.25} C${w*0.5},${-h*0.1} ${-w*0.1},${h*0.05} ${w*0.05},${h*0.4} C${w*0.15},${h*0.65} ${w*0.45},${h*0.85} ${w/2},${h} C${w*0.55},${h*0.85} ${w*0.85},${h*0.65} ${w*0.95},${h*0.4} C${w*1.1},${h*0.05} ${w*0.5},${-h*0.1} ${w/2},${h*0.25} Z`;
    case 'line': case 'straightConnector1': case 'bentConnector2': case 'bentConnector3': case 'curvedConnector3': return `M0,0 L${w},${h}`;
    case 'frame': { const t = ss*A('adj1',12500); return `M0,0 H${w} V${h} H0 Z M${t},${t} V${h-t} H${w-t} V${t} Z`; }
    case 'donut': { const t = ss*A('adj',25000); return ellipsePath(w,h) + ` M${t},${h/2} A${w/2-t},${h/2-t} 0 1 0 ${w-t},${h/2} A${w/2-t},${h/2-t} 0 1 0 ${t},${h/2} Z`; }
    default: return `M0,0 H${w} V${h} H0 Z`;
  }
}
function custPath(custGeom, w, h){
  let d = '';
  for(const p of kids(kid(custGeom,'pathLst'),'path')){
    const pw = num(p,'w',0) || w*EMU, ph = num(p,'h',0) || h*EMU;
    const sx = w/pw, sy = h/ph;
    let cx = 0, cy = 0;
    const pt = el => [ (Number(attr(el,'x',0))||0)*sx, (Number(attr(el,'y',0))||0)*sy ];
    for(const c of p.children){
      const pts = kids(c,'pt').map(pt);
      switch(c.localName){
        case 'moveTo': [cx,cy] = pts[0]; d += `M${cx},${cy} `; break;
        case 'lnTo': [cx,cy] = pts[0]; d += `L${cx},${cy} `; break;
        case 'cubicBezTo': d += `C${pts.map(q=>q.join(',')).join(' ')} `; [cx,cy] = pts[2]; break;
        case 'quadBezTo': d += `Q${pts.map(q=>q.join(',')).join(' ')} `; [cx,cy] = pts[1]; break;
        case 'arcTo': {
          const wR = num(c,'wR',0)*sx, hR = num(c,'hR',0)*sy;
          const st = num(c,'stAng',0)/60000*Math.PI/180, sw = num(c,'swAng',0)/60000*Math.PI/180;
          const ox = cx - wR*Math.cos(st), oy = cy - hR*Math.sin(st);
          const seg = (a0, a1)=>{ const ex = ox + wR*Math.cos(a1), ey = oy + hR*Math.sin(a1); d += `A${wR},${hR} 0 ${Math.abs(a1-a0)>Math.PI?1:0} ${a1>a0?1:0} ${ex},${ey} `; cx=ex; cy=ey; };
          if(Math.abs(sw) >= Math.PI*1.999){ seg(st, st+sw/2); seg(st+sw/2, st+sw); } else seg(st, st+sw);
          break;
        }
        case 'close': d += 'Z '; break;
      }
    }
  }
  return d || `M0,0 H${w} V${h} H0 Z`;
}

/* ---------- theme ---------- */
function parseTheme(doc){
  const t = { colors:{}, major:'Calibri Light', minor:'Calibri', fills:[], lines:[], bgFills:[] };
  if(!doc) return t;
  const cs = desc(doc.documentElement,'clrScheme');
  for(const c of kids(cs)){
    const s = kid(c,'srgbClr'), y = kid(c,'sysClr');
    t.colors[c.localName] = s ? hex(attr(s,'val')) : y ? hex(attr(y,'lastClr') || '000000') : hex('000000');
  }
  const fs = desc(doc.documentElement,'fontScheme');
  if(fs){
    const mj = attr(path(fs,'majorFont','latin'),'typeface',''); if(mj) t.major = mj;
    const mn = attr(path(fs,'minorFont','latin'),'typeface',''); if(mn) t.minor = mn;
  }
  const fmt = desc(doc.documentElement,'fmtScheme');
  if(fmt){
    t.fills = kids(kid(fmt,'fillStyleLst'));
    t.lines = kids(kid(fmt,'lnStyleLst'));
    t.bgFills = kids(kid(fmt,'bgFillStyleLst'));
  }
  return t;
}

/* ---------- text style merging ---------- */
function fontName(tf, ctx){
  if(!tf) return null;
  if(tf.startsWith('+mj')) return ctx.theme.major;
  if(tf.startsWith('+mn')) return ctx.theme.minor;
  return tf;
}
function mergeRPr(r, el, ctx){
  if(!el) return r;
  if(el.hasAttribute('sz')) r.sz = num(el,'sz',1800)/100;
  if(el.hasAttribute('b')) r.b = bool(el,'b',false);
  if(el.hasAttribute('i')) r.i = bool(el,'i',false);
  if(el.hasAttribute('u')) r.u = attr(el,'u') !== 'none';
  if(el.hasAttribute('strike')) r.strike = attr(el,'strike') !== 'noStrike';
  if(el.hasAttribute('baseline')) r.baseline = num(el,'baseline',0)/1000;
  if(el.hasAttribute('cap')) r.cap = attr(el,'cap');
  if(el.hasAttribute('spc')) r.spc = num(el,'spc',0)/100;
  for(const c of el.children){
    switch(c.localName){
      case 'solidFill': { const col = colorFrom(c, ctx); if(col) r.color = col; break; }
      case 'gradFill': { const f = fillFromEl(c, ctx); if(f) r.color = f.stops[0].color; break; }
      case 'noFill': r.color = { r:0,g:0,b:0,a:0 }; break;
      case 'latin': { const f = fontName(attr(c,'typeface',''), ctx); if(f) r.font = f; break; }
      case 'highlight': { const col = colorFrom(c, ctx); if(col) r.hl = col; break; }
      case 'ln': { // text outline
        const f = fillFromProps(c, ctx);
        r.outline = f && f.type==='solid' ? { w: num(c,'w',9525)/EMU, color: f.color } : null;
        break;
      }
      case 'hlinkClick': r.link = true; break;
    }
  }
  return r;
}
function spacingVal(el){ if(!el) return null; const p = kid(el,'spcPct'), s = kid(el,'spcPts'); if(p) return { pct: num(p,'val',100000)/100000 }; if(s) return { pts: num(s,'val',0)/100 }; return null; }
function mergePPr(p, el, ctx){
  if(!el) return p;
  if(el.hasAttribute('algn')) p.algn = attr(el,'algn');
  if(el.hasAttribute('marL')) p.marL = num(el,'marL',0)/EMU;
  if(el.hasAttribute('indent')) p.indent = num(el,'indent',0)/EMU;
  for(const c of el.children){
    switch(c.localName){
      case 'lnSpc': p.lnSpc = spacingVal(c); break;
      case 'spcBef': p.spcBef = spacingVal(c); break;
      case 'spcAft': p.spcAft = spacingVal(c); break;
      case 'buNone': p.bu = { type:'none' }; break;
      case 'buChar': p.bu = { ...(p.bu||{}), type:'char', char: attr(c,'char','•') }; break;
      case 'buAutoNum': p.bu = { ...(p.bu||{}), type:'num', scheme: attr(c,'type','arabicPeriod'), start: num(c,'startAt',1) }; break;
      case 'buBlip': p.bu = { ...(p.bu||{}), type:'char', char:'•' }; break;
      case 'buFont': p.buFont = fontName(attr(c,'typeface',''), ctx); break;
      case 'buFontTx': p.buFont = null; break;
      case 'buClr': p.buClr = colorFrom(c, ctx); break;
      case 'buClrTx': p.buClr = null; break;
      case 'buSzPct': p.buSz = num(c,'val',100000)/100000; break;
      case 'buSzTx': p.buSz = null; break;
      case 'defRPr': p.r = mergeRPr({ ...(p.r||{}) }, c, ctx); break;
    }
  }
  return p;
}
function levelProps(chain, lvl, ctx){
  let p = { r:{} };
  for(const lst of chain){
    if(!lst) continue;
    p = mergePPr(p, kid(lst,'defPPr'), ctx);
    p = mergePPr(p, kid(lst,`lvl${lvl+1}pPr`), ctx);
  }
  return p;
}
function romanize(n){ const m=[[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]; let s=''; for(const [v,t] of m) while(n>=v){ s+=t; n-=v; } return s; }
function alpha(n){ let s=''; while(n>0){ n--; s = String.fromCharCode(97 + n%26) + s; n = Math.floor(n/26); } return s; }
function autoNum(scheme, n){
  let core;
  if(/^alphaLc/.test(scheme)) core = alpha(n);
  else if(/^alphaUc/.test(scheme)) core = alpha(n).toUpperCase();
  else if(/^romanLc/.test(scheme)) core = romanize(n);
  else if(/^romanUc/.test(scheme)) core = romanize(n).toUpperCase();
  else core = String(n);
  if(/ParenBoth$/.test(scheme)) return `(${core})`;
  if(/ParenR$/.test(scheme)) return `${core})`;
  if(/Plain$/.test(scheme)) return core;
  return core + '.';
}

/* ---------- element factory ---------- */
function h(tag, cls, style){ const e = document.createElement(tag); if(cls) e.className = cls; if(style) Object.assign(e.style, style); return e; }
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs){ const e = document.createElementNS(SVGNS, tag); if(attrs) for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }
let uid = 0;

/* =====================================================================
   Deck
   ===================================================================== */
class Deck {
  static async load(data){
    const d = new Deck();
    await d._init(data);
    return d;
  }
  async _init(data){
    this.zip = await JSZip.loadAsync(data);
    this.xmlCache = new Map();
    this.relsCache = new Map();
    this.mediaCache = new Map();
    this.layoutInfo = new Map();
    const pres = await this.xml('ppt/presentation.xml');
    const sz = desc(pres.documentElement,'sldSz');
    this.width = num(sz,'cx',12192000)/EMU;
    this.height = num(sz,'cy',6858000)/EMU;
    this.defaultTextStyle = desc(pres.documentElement,'defaultTextStyle');
    const prels = await this.rels('ppt/presentation.xml');
    // Table styles (tableStyles.xml): id -> <a:tblStyle>
    this.tableStyles = new Map();
    const tsRel = Object.values(prels).find(r=>r.type.endsWith('/tableStyles'));
    const tsDoc = await this.xml(tsRel ? tsRel.target : 'ppt/tableStyles.xml');
    if(tsDoc) for(const st of kids(tsDoc.documentElement,'tblStyle')) this.tableStyles.set(attr(st,'styleId',''), st);
    this.slides = [];
    for(const id of kids(desc(pres.documentElement,'sldIdLst'),'sldId')){
      const rel = prels[rAttr(id,'id')];
      if(rel) this.slides.push({ path: rel.target, hidden:false });
    }
    // Pre-load every slide's XML + its layout/master/theme so rendering is synchronous.
    for(const sl of this.slides){
      const doc = await this.xml(sl.path);
      sl.doc = doc;
      sl.hidden = bool(doc.documentElement,'show',true) === false;
      sl.rels = await this.rels(sl.path);
      const lay = Object.values(sl.rels).find(r=>r.type.endsWith('/slideLayout'));
      sl.layout = lay ? await this.part(lay.target) : null;
      await this._preloadExtras(sl.doc, sl.rels, sl.path);
    }
    // The "Blank" layout, for empty slides added in the editor (renderBlank).
    try{
      const m = this.slides[0] && this.slides[0].layout && this.slides[0].layout.master;
      if(m) for(const r of Object.values(m.rels)){
        if(!r.type.endsWith('/slideLayout')) continue;
        const doc = await this.xml(r.target);
        if(doc && attr(doc.documentElement,'type','')==='blank'){ this.blankLayout = await this.part(r.target); break; }
      }
    }catch(e){ console.warn('PPTX: no blank layout', e); }
    // Media (images, video) into blob URLs.
    const mediaFiles = Object.keys(this.zip.files).filter(n=>/^ppt\/(media|embeddings)\//.test(n) && !this.zip.files[n].dir);
    for(const n of mediaFiles){
      const blob = await this.zip.file(n).async('blob');
      const ext = n.split('.').pop().toLowerCase();
      const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', bmp:'image/bmp', svg:'image/svg+xml', webp:'image/webp', mp4:'video/mp4', m4v:'video/mp4', mov:'video/quicktime', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4' }[ext] || 'application/octet-stream';
      let url = URL.createObjectURL(new Blob([blob], { type:mime }));
      let shown = ext;
      // EMF pictures (pasted tables, old clip art): convert to SVG so the browser can draw them.
      if(ext==='emf' && window.EMF){
        try{
          const svg = EMF.toSvg(await blob.arrayBuffer());
          if(svg){ URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' })); shown = 'svg'; }
        }catch(e){ console.warn('PPTX: could not convert EMF', n, e); }
      }
      this.mediaCache.set(n, { url, ext: shown, orig: ext });
    }
  }
  // Speaker notes for slide i (ppt/notesSlides/notesSlideN.xml, found through the
  // slide's rels): the notes placeholder's paragraphs as [{ text, lvl }]. [] if none.
  async notes(i){
    const sl = this.slides[i]; if(!sl) return [];
    if(sl.notesParas) return sl.notesParas;
    const out = [];
    const rel = Object.values(sl.rels || {}).find(r=>r.type.endsWith('/notesSlide'));
    const doc = rel ? await this.xml(rel.target) : null;
    for(const sp of descAll(doc && doc.documentElement, 'sp')){
      const ph = desc(sp, 'ph'); if(!ph || attr(ph,'type','')!=='body') continue;
      let auto = 0; // numbered lists (buAutoNum): "1. ", "2. "…
      for(const p of descAll(sp, 'p')){
        const an = desc(kid(p,'pPr'), 'buAutoNum');
        let text = an ? `${auto = auto ? auto + 1 : num(an,'startAt',1)}. ` : '';
        if(!an) auto = 0;
        for(const c of kids(p)){
          if(c.localName==='r' || c.localName==='fld') text += (desc(c,'t') || {}).textContent || '';
          else if(c.localName==='br') text += '\n';
        }
        out.push({ text, lvl:num(kid(p,'pPr'),'lvl',0) });
      }
    }
    while(out.length && !out[out.length-1].text.trim()) out.pop();
    sl.notesParas = out;
    return out;
  }
  async xml(p){
    if(this.xmlCache.has(p)) return this.xmlCache.get(p);
    const f = this.zip.file(p);
    const doc = f ? parseXML(await f.async('string')) : null;
    this.xmlCache.set(p, doc);
    return doc;
  }
  async rels(p){
    if(this.relsCache.has(p)) return this.relsCache.get(p);
    const rp = dirOf(p) + '/_rels/' + p.split('/').pop() + '.rels';
    const doc = await this.xml(rp);
    const out = {};
    if(doc) for(const r of kids(doc.documentElement,'Relationship')){
      const ext = attr(r,'TargetMode','')==='External';
      out[attr(r,'Id')] = { type: attr(r,'Type',''), external: ext, target: ext ? attr(r,'Target') : resolvePath(p, attr(r,'Target')) };
    }
    this.relsCache.set(p, out);
    return out;
  }
  // A layout or master "part" with its parent chain, theme and placeholder index.
  async part(p){
    if(this.layoutInfo.has(p)) return this.layoutInfo.get(p);
    const doc = await this.xml(p);
    const rels = await this.rels(p);
    const info = { path:p, doc, rels, ph:[] };
    this.layoutInfo.set(p, info);
    const root = doc.documentElement;
    if(root.localName==='sldLayout'){
      const m = Object.values(rels).find(r=>r.type.endsWith('/slideMaster'));
      info.master = m ? await this.part(m.target) : null;
      info.theme = info.master ? info.master.theme : parseTheme(null);
    } else {
      const t = Object.values(rels).find(r=>r.type.endsWith('/theme'));
      info.theme = parseTheme(t ? await this.xml(t.target) : null);
      const cm = desc(root,'clrMap');
      info.clrMap = {};
      if(cm) for(const a of cm.attributes) info.clrMap[a.name] = a.value;
      info.txStyles = desc(root,'txStyles');
    }
    for(const sp of descAll(path(root,'cSld','spTree'),'sp')){
      const ph = path(sp,'nvSpPr','nvPr','ph');
      if(ph) info.ph.push({ type: attr(ph,'type','body'), idx: attr(ph,'idx',null), sp });
    }
    await this._preloadExtras(doc, rels, p);
    return info;
  }
  // SmartArt drawings referenced from a part — load ahead of time.
  async _preloadExtras(doc, rels, p){
    for(const relIds of descAll(doc.documentElement,'relIds')){
      const dm = rels[rAttr(relIds,'dm')];
      if(!dm) continue;
      const dmDoc = await this.xml(dm.target);
      const ext = dmDoc && desc(dmDoc.documentElement,'dataModelExt');
      const drawRel = ext && rels[attr(ext,'relId')];
      if(drawRel){ const dd = await this.xml(drawRel.target); relIds._drawing = dd; relIds._drawingRels = await this.rels(drawRel.target); relIds._drawingPath = drawRel.target; }
    }
  }
  mediaUrl(rid, part){
    if(!rid) return null;
    const rel = part.rels[rid];
    if(!rel || rel.external) return null;
    const m = this.mediaCache.get(rel.target);
    if(!m) return null;
    if(['emf','wmf','tif','tiff'].includes(m.ext)) return null;
    return m.url;
  }
  mediaExt(rid, part){ const rel = part.rels[rid]; const m = rel && this.mediaCache.get(rel.target); return m ? (m.orig || m.ext) : null; }

  /* Animations: Map shapeId -> 'entr' | 'exit' (first animation that targets it). */
  animations(i){
    const out = new Map();
    const doc = this.slides[i].doc;
    const timing = desc(doc.documentElement,'timing');
    if(!timing) return out;
    for(const ctn of descAll(timing,'cTn')){
      const cls = attr(ctn,'presetClass',null);
      if(cls!=='entr' && cls!=='exit') continue;
      const tgt = desc(ctn,'spTgt'); if(!tgt) continue;
      const id = attr(tgt,'spid');
      if(!out.has(id)) out.set(id, cls);
    }
    return out;
  }

  /* Ids of the top-level objects on slide i (the units that can be hidden). */
  objectIds(i){
    const tree = path(this.slides[i].doc.documentElement,'cSld','spTree');
    const out = [];
    for(const n of kids(tree)){
      let node = n;
      if(node.localName==='AlternateContent'){ const fb = kid(node,'Fallback'), ch = kid(node,'Choice'); node = (fb && fb.firstElementChild) || (ch && ch.firstElementChild); if(!node) continue; }
      if(!['sp','cxnSp','pic','grpSp','graphicFrame'].includes(node.localName)) continue;
      const nv = desc(node,'cNvPr'); if(nv) out.push(attr(nv,'id',''));
    }
    return out;
  }

  /* Render slide i -> { el, objects:[{oid,name,x,y,w,h}] }.
     opts.thumb: no live video/iframes.
     opts.edits (from the viewer's editor, never written back to the file):
       geo:   { oid: {x,y,w,h} }  new position/size of a top-level object (slide px)
       text:  { oid: html }       replacement contents of a shape's text box (.pptx-tx)
       added: [{ id, x,y,w,h, html }]  new text boxes, data-oid "n<id>" */
  render(i, opts={}){ return this._render(this.slides[i], i, opts); }
  /* An empty slide in this deck's style: the master's background and decorations, through the
     deck's "Blank" layout if it has one (else the first slide's layout). For slides added in the editor. */
  renderBlank(opts={}){
    if(!this._blank){
      const doc = parseXML('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>');
      this._blank = { doc, rels:{}, path:'', layout: this.blankLayout || (this.slides[0] && this.slides[0].layout) || null, hidden:false };
    }
    return this._render(this._blank, -1, opts);
  }
  _render(sl, i, opts){
    const layout = sl.layout, master = layout && layout.master;
    const theme = master ? master.theme : parseTheme(null);
    let clrMap = { ...(master ? master.clrMap : {}) };
    const ovr = (doc)=>{ const o = desc(doc.documentElement,'overrideClrMapping'); if(o){ clrMap = {}; for(const a of o.attributes) clrMap[a.name] = a.value; } };
    if(layout) ovr(layout.doc);
    ovr(sl.doc);
    const deck = this;
    const baseCtx = { theme, clrMap, deck, slideIndex: opts.num!=null ? opts.num - 1 : i, layout, master, opts, media:(rid, part)=>deck.mediaUrl(rid, part) };

    // opts.frameW: the lesson's slide size (Design → Slide size) is wider or narrower than the deck:
    // the deck's content keeps its size and sits in the middle (this._dx), the background fills the width.
    const W = opts.frameW || this.width;
    this._dx = (W - this.width) / 2;
    const root = h('div','pptx-slide',{ position:'absolute', left:0, top:0, width:W+'px', height:this.height+'px', overflow:'hidden' });
    // Background: slide -> layout -> master.
    const bgCss = this._background(sl.doc, { ...baseCtx, part:{ rels:sl.rels, path:sl.path } })
      || (layout && this._background(layout.doc, { ...baseCtx, part:layout }))
      || (master && this._background(master.doc, { ...baseCtx, part:master }))
      || '#fff';
    root.style.background = (opts.edits && opts.edits.bg) || bgCss; // Design → Background

    const showMaster = (doc)=> attr(desc(doc.documentElement,'cSld') ? doc.documentElement : null,'showMasterSp','1') !== '0';
    const objects = [];
    // Master + layout decorative shapes (placeholders are templates, so skipped).
    if(master && (!layout || showMaster(layout.doc)) && showMaster(sl.doc))
      this._renderTree(path(master.doc.documentElement,'cSld','spTree'), { ...baseCtx, part:master, isTemplate:true }, root, null);
    if(layout && showMaster(sl.doc))
      this._renderTree(path(layout.doc.documentElement,'cSld','spTree'), { ...baseCtx, part:layout, isTemplate:true }, root, null);
    // Slide content.
    this._renderTree(path(sl.doc.documentElement,'cSld','spTree'), { ...baseCtx, part:{ rels:sl.rels, path:sl.path } }, root, objects);
    // Objects added in the viewer's editor: text boxes, shapes, pictures and copies of objects.
    for(const a of ((opts.edits && opts.edits.added) || [])){
      if(a.tool && opts.edits.noTools) continue; // printed / exported slides: tool icons are not content (v1.68)
      const el = renderAdded(a, opts.edits, theme);
      const addedTx = el.querySelector(':scope > .pptx-tx'); if(addedTx && a.lang) addedTx.lang = a.lang; // spell-check language (v1.79)
      root.appendChild(el);
      objects.push({ oid: el.dataset.oid, name: el.dataset.oname, x:a.x, y:a.y, w:a.w, h:a.h, added:true, kind:addedKind(a), tool: a.tool || null });
      // Table cells: each can be hidden / revealed on its own (data-oid "n<id>.<row>.<col>").
      if(a.table) for(const g of tableGeo(a)) objects.push({ oid:'n' + a.id + '.' + g.r + '.' + g.c, name:'Table cell', x:a.x + g.x, y:a.y + g.y, w:g.w, h:g.h, added:true, kind:'cell', cell:true, table:'n' + a.id, r:g.r, c:g.c });
    }
    // Auto-fill fields in text (Insert → Date): filled in for the lesson the slide is shown in.
    const fields = opts.edits && opts.edits.fields;
    if(fields) for(const f of root.querySelectorAll('[data-field]')){ const v = fields[f.dataset.field]; if(v!=null) f.textContent = v; }
    this._dx = 0;
    // Layer order from the editor (Bring to front / Send to back): edits.z = [oid, …] bottom to top.
    const z = opts.edits && opts.edits.z;
    if(Array.isArray(z) && z.length){
      const order = layerOrder(objects.map(o=>o.oid), z);
      const byId = new Map(objects.map(o=>[o.oid, o]));
      const els = new Map([...root.children].filter(e=>e.dataset.oid!=null).map(e=>[e.dataset.oid, e]));
      for(const id of order){ const e = els.get(id); if(e) root.appendChild(e); }
      objects.splice(0, objects.length, ...order.map(id=>byId.get(id)).filter(Boolean));
    }
    return { el: root, objects };
  }
  _background(doc, ctx){
    const bg = path(doc.documentElement,'cSld','bg');
    if(!bg) return null;
    const pr = kid(bg,'bgPr');
    if(pr){ const f = fillFromProps(pr, ctx); return f ? (fillToCss(f) || '#fff') : null; }
    const ref = kid(bg,'bgRef');
    if(ref){
      const idx = num(ref,'idx',0);
      const phClr = colorFrom(ref, ctx);
      const lst = idx>=1001 ? ctx.theme.bgFills : ctx.theme.fills;
      const f = lst[idx>=1001 ? idx-1001 : idx-1];
      const ff = f ? fillFromEl(f, { ...ctx, phClr }) : (phClr ? { type:'solid', color:phClr } : null);
      if(ff && ff.type==='img') return `url("${ff.url}") center / cover no-repeat`;
      return ff ? fillToCss(ff) : null;
    }
    return null;
  }
  _renderTree(tree, ctx, container, objects, frame){
    if(!tree) return;
    for(const node of tree.children){
      let n = node;
      if(n.localName==='AlternateContent'){
        const choice = kid(n,'Choice'), fb = kid(n,'Fallback');
        // Prefer the fallback (plain shapes/pictures) unless it is empty.
        n = (fb && fb.firstElementChild) || (choice && choice.firstElementChild);
        if(!n) continue;
      }
      let el = null;
      // Editor overrides apply to top-level slide objects only (objects != null).
      const edits = objects && ctx.opts && ctx.opts.edits;
      const eid = edits ? attr(desc(n,'cNvPr'),'id','') : null;
      // _map() uses this for the object's own position (the first _map call while rendering it).
      this._geoOv = edits && edits.geo && edits.geo[eid] || null;
      this._cropOv = edits && edits.crop && edits.crop[eid] || null; // v1.80
      const moved = !!this._geoOv; // a position from the editor is already in the lesson's slide size
      try{
        switch(n.localName){
          case 'sp': el = this._renderSp(n, ctx, frame); break;
          case 'cxnSp': el = this._renderSp(n, ctx, frame, true); break;
          case 'pic': el = this._renderPic(n, ctx, frame); break;
          case 'grpSp': el = this._renderGroup(n, ctx, frame); break;
          case 'graphicFrame': el = this._renderFrame(n, ctx, frame); break;
        }
      }catch(e){ console.warn('PPTX: could not render a shape', e); }
      this._geoOv = null;
      this._cropOv = null;
      if(!el) continue;
      if(!frame && this._dx && !moved) el.style.left = (parseFloat(el.style.left) + this._dx) + 'px';
      if(edits && edits.text && edits.text[eid] != null){
        const tx = el.querySelector(':scope > .pptx-tx');
        if(tx) tx.innerHTML = edits.text[eid];
      }
      // Fill / outline changed in the editor (shapes only).
      if(edits && edits.style && edits.style[eid] && n.localName==='sp') restyleShape(el, edits.style[eid]);
      // Spell-check language set in the editor (text boxes). Export reads it per run (pptx-export.js).
      const boxLg = edits && edits.style && edits.style[eid] && edits.style[eid].lang, boxTx = boxLg && el.querySelector(':scope > .pptx-tx');
      if(boxTx) boxTx.lang = boxLg;
      container.appendChild(el);
      if(objects){
        const nv = desc(n,'cNvPr');
        el.dataset.oid = attr(nv,'id','');
        el.dataset.oname = attr(nv,'name','');
        el.dataset.kind = n.localName;
        objects.push({ oid: el.dataset.oid, name: el.dataset.oname, x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height), kind:n.localName });
      }
    }
  }
  _xfrm(x){
    if(!x) return null;
    const off = kid(x,'off'), ext = kid(x,'ext');
    return { x:num(off,'x',0)/EMU, y:num(off,'y',0)/EMU, w:num(ext,'cx',0)/EMU, h:num(ext,'cy',0)/EMU, rot:num(x,'rot',0)/60000, flipH:bool(x,'flipH',false), flipV:bool(x,'flipV',false),
      chx: num(kid(x,'chOff'),'x',0)/EMU, chy: num(kid(x,'chOff'),'y',0)/EMU, chw: num(kid(x,'chExt'),'cx',0)/EMU, chh: num(kid(x,'chExt'),'cy',0)/EMU };
  }
  _map(r, frame){
    if(!frame && this._geoOv){ const o = this._geoOv; this._geoOv = null; return { ...r, x:o.x, y:o.y, w:o.w, h:o.h }; }
    if(!frame) return r;
    return { ...r, x:(r.x-frame.chx)*frame.sx, y:(r.y-frame.chy)*frame.sy, w:r.w*frame.sx, h:r.h*frame.sy };
  }
  _box(r, cls){
    const el = h('div', 'pptx-obj' + (cls ? ' '+cls : ''), { position:'absolute', left:r.x+'px', top:r.y+'px', width:Math.max(r.w,0)+'px', height:Math.max(r.h,0)+'px' });
    if(r.rot) el.style.transform = `rotate(${r.rot}deg)`;
    return el;
  }
  _findPh(info, type, idx){
    if(!info) return null;
    if(idx!=null){ const m = info.ph.find(p=>p.idx===idx); if(m) return m.sp; }
    const t = type || 'body';
    let m = info.ph.find(p=>p.type===t);
    if(!m && (t==='ctrTitle')) m = info.ph.find(p=>p.type==='title');
    if(!m && (t==='subTitle' || t==='obj' || t==='body')) m = info.ph.find(p=>p.type==='body');
    return m ? m.sp : null;
  }
  _renderSp(sp, ctx, frame, isConnector){
    const nv = kid(sp, isConnector ? 'nvCxnSpPr' : 'nvSpPr');
    const cNvPr = kid(nv,'cNvPr');
    if(bool(cNvPr,'hidden',false)) return null;
    const ph = path(nv,'nvPr','ph');
    if(ph && ctx.isTemplate) return null;
    const spPr = kid(sp,'spPr');
    const styleEl = kid(sp,'style');
    let layoutSp = null, masterSp = null;
    if(ph){
      const type = attr(ph,'type',null), idx = attr(ph,'idx',null);
      layoutSp = this._findPh(ctx.layout, type, idx);
      const ltype = layoutSp ? attr(path(layoutSp,'nvSpPr','nvPr','ph'),'type',null) : type;
      masterSp = this._findPh(ctx.master, ltype || type, null);
    }
    let x = this._xfrm(kid(spPr,'xfrm'));
    if(!x || (!x.w && !x.h)) x = this._xfrm(kid(kid(layoutSp,'spPr'),'xfrm')) || this._xfrm(kid(kid(masterSp,'spPr'),'xfrm'));
    if(!x) return null;
    const r = this._map(x, frame);
    const el = this._box(r);
    // Geometry
    const prstGeom = kid(spPr,'prstGeom'), custGeom = kid(spPr,'custGeom');
    let fill = fillFromProps(spPr, ctx);
    if(!fill && styleEl) fill = styleRefFill(styleEl, ctx);
    if(!fill && layoutSp) fill = fillFromProps(kid(layoutSp,'spPr'), { ...ctx, part:ctx.layout });
    let line = lineFrom(spPr, styleEl, ctx);
    if(!line && !kid(spPr,'ln') && layoutSp) line = lineFrom(kid(layoutSp,'spPr'), null, { ...ctx, part:ctx.layout });
    const prst = prstGeom ? attr(prstGeom,'prst','rect') : (custGeom ? 'cust' : 'rect');
    if(isConnector && !line) line = { w:0.75, color:schemeColor('tx1', ctx) };
    if((fill && fill.type!=='none') || line){
      const svg = this._geomSvg(prst, custGeom, prstGeom, r.w, r.h, fill, line, x.flipH, x.flipV, isConnector || prst==='line');
      el.appendChild(svg);
    }
    // Text
    const txBody = kid(sp,'txBody');
    if(txBody && descAll(txBody,'t').some(t=>t.textContent.length) || (txBody && descAll(txBody,'fld').length)){
      el.appendChild(this._renderText(txBody, ctx, { ph, layoutSp, masterSp, styleEl, w:r.w, h:r.h }));
    }
    return el;
  }
  _geomSvg(prst, custGeom, prstGeom, w, h, fill, line, flipH, flipV, isLine){
    const pad = line ? Math.max(line.w, 1) * 4 : 0;
    const svg = s('svg', { width: w + pad*2, height: h + pad*2, viewBox: `${-pad} ${-pad} ${w+pad*2} ${h+pad*2}` });
    svg.style.cssText = `position:absolute;left:${-pad}px;top:${-pad}px;overflow:visible;pointer-events:none`;
    const d = prst==='cust' ? custPath(custGeom, w, h) : presetPath(prst, w, h, adjVals(prstGeom));
    const g = s('g');
    if(flipH || flipV) g.setAttribute('transform', `translate(${flipH?w:0},${flipV?h:0}) scale(${flipH?-1:1},${flipV?-1:1})`);
    const p = s('path', { d, 'fill-rule':'evenodd' });
    if(!isLine && fill && fill.type!=='none'){
      if(fill.type==='solid') p.setAttribute('fill', css(fill.color));
      else if(fill.type==='grad' || fill.type==='img'){
        const id = 'g' + (++uid);
        const defs = s('defs');
        if(fill.type==='grad'){
          let gr;
          if(fill.radial) gr = s('radialGradient', { id });
          else { const a = fill.angle*Math.PI/180; gr = s('linearGradient', { id, x1: 0.5-Math.cos(a)/2, y1: 0.5-Math.sin(a)/2, x2: 0.5+Math.cos(a)/2, y2: 0.5+Math.sin(a)/2 }); }
          for(const st of fill.stops) gr.appendChild(s('stop', { offset: st.pos+'%', 'stop-color': `rgb(${st.color.r},${st.color.g},${st.color.b})`, 'stop-opacity': st.color.a }));
          defs.appendChild(gr);
        } else {
          const pat = s('pattern', { id, patternUnits:'userSpaceOnUse', width:w, height:h });
          pat.appendChild(s('image', { href: fill.url, width:w, height:h, preserveAspectRatio:'none' }));
          defs.appendChild(pat);
        }
        svg.appendChild(defs);
        p.setAttribute('fill', `url(#${id})`);
      }
    } else p.setAttribute('fill', 'none');
    if(line){
      p.setAttribute('stroke', css(line.color));
      p.setAttribute('stroke-width', Math.max(line.w, 0.5));
      const dash = { dash:[4,3], sysDash:[3,1], sysDot:[1,1], dot:[1,2], lgDash:[8,3], dashDot:[4,3,1,3], lgDashDot:[8,3,1,3], sysDashDot:[3,1,1,1] }[line.dash];
      if(dash) p.setAttribute('stroke-dasharray', dash.map(v=>v*Math.max(line.w,1)).join(' '));
      if(line.head || line.tail){
        const defs = s('defs');
        const mk = (id)=>{ const m = s('marker', { id, viewBox:'0 0 10 10', refX:'5', refY:'5', markerWidth:'4', markerHeight:'4', orient:'auto-start-reverse' }); m.appendChild(s('path', { d:'M0,0 L10,5 L0,10 z', fill: css(line.color) })); return m; };
        if(line.tail){ const id = 'm'+(++uid); defs.appendChild(mk(id)); p.setAttribute('marker-end', `url(#${id})`); }
        if(line.head){ const id = 'm'+(++uid); defs.appendChild(mk(id)); p.setAttribute('marker-start', `url(#${id})`); }
        svg.appendChild(defs);
      }
    } else p.setAttribute('stroke','none');
    g.appendChild(p);
    svg.appendChild(g);
    return svg;
  }
  _textChain(ctx, info){
    const { ph, layoutSp, masterSp } = info;
    const chain = [];
    if(ph && ctx.master && ctx.master.txStyles){
      const t = attr(ph,'type','body');
      const key = (t==='title' || t==='ctrTitle') ? 'titleStyle' : (['body','subTitle','obj'].includes(t) ? 'bodyStyle' : 'otherStyle');
      chain.push(kid(ctx.master.txStyles, key));
    } else chain.push(this.defaultTextStyle);
    chain.push('FONTREF');
    if(masterSp) chain.push(path(masterSp,'txBody','lstStyle'));
    if(layoutSp) chain.push(path(layoutSp,'txBody','lstStyle'));
    return chain;
  }
  _bodyPr(txBody, info){
    const out = { lIns:7.2, tIns:3.6, rIns:7.2, bIns:3.6, anchor:'t', wrap:true, fontScale:1, lnRed:0, anchorCtr:false };
    const apply = (bp)=>{
      if(!bp) return;
      for(const k of ['lIns','tIns','rIns','bIns']) if(bp.hasAttribute(k)) out[k] = num(bp,k,0)/EMU;
      if(bp.hasAttribute('anchor')) out.anchor = attr(bp,'anchor');
      if(bp.hasAttribute('anchorCtr')) out.anchorCtr = bool(bp,'anchorCtr',false);
      if(bp.hasAttribute('wrap')) out.wrap = attr(bp,'wrap')!=='none';
      const na = kid(bp,'normAutofit');
      if(na){ out.autofit = true; out.fontScale = num(na,'fontScale',100000)/100000; out.lnRed = num(na,'lnSpcReduction',0)/100000; }
    };
    if(info.masterSp) apply(path(info.masterSp,'txBody','bodyPr'));
    if(info.layoutSp) apply(path(info.layoutSp,'txBody','bodyPr'));
    apply(kid(txBody,'bodyPr'));
    return out;
  }
  _renderText(txBody, ctx, info){
    const bp = this._bodyPr(txBody, info);
    const box = h('div','pptx-tx', { position:'absolute', inset:'0', padding:`${bp.tIns}px ${bp.rIns}px ${bp.bIns}px ${bp.lIns}px`, display:'flex', flexDirection:'column',
      justifyContent: { t:'flex-start', ctr:'center', b:'flex-end' }[bp.anchor] || 'flex-start', whiteSpace: bp.wrap ? 'pre-wrap' : 'pre', overflowWrap:'break-word', boxSizing:'border-box' });
    if(!bp.wrap) box.style.alignItems = 'flex-start';
    if(bp.autofit && bp.fontScale===1) box.dataset.autofit = '1';
    const chain = this._textChain(ctx, info).map(c=> c==='FONTREF' ? null : c);
    // fontRef colour from the shape's style (sits between the base style and the placeholder styles)
    const fontRef = kid(info.styleEl,'fontRef');
    const fontRefColor = fontRef ? colorFrom(fontRef, ctx) : null;
    const own = kid(txBody,'lstStyle');
    const counters = {};
    const paras = kids(txBody,'p');
    paras.forEach((p, pi)=>{
      const pPr = kid(p,'pPr');
      const lvl = num(pPr,'lvl',0);
      // Table cells don't use the presentation's default text style: PowerPoint uses
      // 18pt plus the table style's font/colour/bold (info.table).
      const props = info.table ? { r:{ sz:18, ...info.table } } : levelProps([chain[0]], lvl, ctx);
      if(fontRefColor) props.r.color = fontRefColor;
      let pp = props;
      for(const lst of chain.slice(1).concat([own])){ if(!lst) continue; pp = mergePPr(pp, kid(lst,'defPPr'), ctx); pp = mergePPr(pp, kid(lst,`lvl${lvl+1}pPr`), ctx); }
      pp = mergePPr(pp, pPr, ctx);
      const div = h('div','pptx-p');
      const algn = { l:'left', ctr:'center', r:'right', just:'justify', dist:'justify' }[pp.algn || 'l'];
      div.style.textAlign = algn;
      const marL = pp.marL || 0, indent = pp.indent || 0;
      div.style.paddingLeft = marL + 'px';
      div.style.textIndent = indent + 'px';
      // Runs
      const runs = [];
      for(const c of p.children){
        if(c.localName==='r' || c.localName==='fld'){
          const rp = mergeRPr({ ...pp.r }, kid(c,'rPr'), ctx);
          let text = (kid(c,'t') || {}).textContent || '';
          if(c.localName==='fld' && /slidenum/i.test(attr(c,'type',''))) text = String(ctx.slideIndex + 1);
          runs.push({ text, rp });
        } else if(c.localName==='br'){
          runs.push({ br:true, rp: mergeRPr({ ...pp.r }, kid(c,'rPr'), ctx) });
        }
      }
      const endRp = mergeRPr({ ...pp.r }, kid(p,'endParaRPr'), ctx);
      const firstRp = (runs.find(r=>!r.br) || { rp:endRp }).rp;
      const baseSz = (firstRp.sz || 18) * bp.fontScale;
      const lineMul = 1.2;
      // The paragraph's own font size sets the minimum line height (CSS "strut"), so it
      // must match the text, or small text gets inherited tall lines.
      // PowerPoint sizes each line by its largest text, so use the paragraph's largest run.
      const lineSz = Math.max(...runs.filter(r=>!r.br && r.text).map(r=>(r.rp.sz || 18) * bp.fontScale), hasTextSz(runs) ? 0 : (endRp.sz || 18) * bp.fontScale);
      div.style.fontSize = lineSz + 'px';
      div.style.fontFamily = this._font(firstRp, ctx, info);
      // Line height in px. PowerPoint puts extra line spacing ABOVE each line; CSS
      // splits it above and below, so shift the text down by half the extra.
      let lineH;
      if(pp.lnSpc && pp.lnSpc.pct==null) lineH = pp.lnSpc.pts * bp.fontScale;
      else lineH = Math.max(0.5, (pp.lnSpc ? pp.lnSpc.pct : 1) - bp.lnRed) * lineMul * lineSz;
      div.style.lineHeight = lineH + 'px';
      const shift = (lineH - lineMul * lineSz) / 2;
      if(Math.abs(shift) > 0.1){ div.style.position = 'relative'; div.style.top = shift + 'px'; }
      div.dataset.lh = lineH; div.dataset.fs = lineSz; div.dataset.top = shift;
      const spc = (v)=> v ? (v.pts!=null ? v.pts : v.pct * baseSz * lineMul) : 0;
      if(pi>0 && pp.spcBef) div.style.marginTop = spc(pp.spcBef) + 'px';
      if(pp.spcAft) div.style.marginBottom = spc(pp.spcAft) + 'px';
      const hasText = runs.some(r=>r.text && r.text.length);
      // Bullet
      if(hasText && pp.bu && pp.bu.type!=='none'){
        const key = lvl;
        let label = pp.bu.char;
        if(pp.bu.type==='num'){
          counters[key] = (counters[key] != null ? counters[key] + 1 : (pp.bu.start || 1));
          label = autoNum(pp.bu.scheme, counters[key]);
        }
        const b = h('span','pptx-bu');
        b.textContent = label;
        b.style.display = 'inline-block';
        b.style.textIndent = '0';
        if(indent < 0) b.style.width = (-indent) + 'px'; else b.style.marginRight = '0.4em';
        b.style.fontSize = (baseSz * (pp.buSz || 1)) + 'px';
        b.style.color = css(pp.buClr || firstRp.color || schemeColor('tx1', ctx));
        b.style.fontFamily = pp.buFont ? `"${pp.buFont}"` : this._font(firstRp, ctx, info);
        if(firstRp.b) b.style.fontWeight = '700';
        div.appendChild(b);
      }
      if(pp.bu && pp.bu.type!=='num') delete counters[lvl];
      for(const k in counters) if(Number(k) > lvl) delete counters[k];
      if(!hasText && !runs.some(r=>r.br)){
        const sp = h('span'); sp.textContent = '​'; sp.style.fontSize = ((endRp.sz || 18) * bp.fontScale) + 'px';
        div.appendChild(sp);
      }
      for(const run of runs){
        if(run.br){ div.appendChild(document.createElement('br')); continue; }
        const sp = h('span');
        const rp = run.rp;
        sp.textContent = rp.cap==='all' ? run.text.toUpperCase() : run.text;
        if(rp.cap==='small') sp.style.fontVariant = 'small-caps';
        sp.style.fontSize = ((rp.sz || 18) * bp.fontScale * (rp.baseline ? 0.65 : 1)) + 'px';
        sp.style.fontFamily = this._font(rp, ctx, info);
        sp.style.color = css(rp.link ? (rp.color || schemeColor('hlink', ctx)) : (rp.color || schemeColor('tx1', ctx)));
        if(rp.b) sp.style.fontWeight = '700';
        if(rp.i) sp.style.fontStyle = 'italic';
        const deco = [rp.u || rp.link ? 'underline' : '', rp.strike ? 'line-through' : ''].filter(Boolean).join(' ');
        if(deco) sp.style.textDecoration = deco;
        if(rp.baseline) sp.style.verticalAlign = rp.baseline > 0 ? 'super' : 'sub';
        if(rp.hl) sp.style.background = css(rp.hl);
        if(rp.spc) sp.style.letterSpacing = rp.spc + 'px';
        if(rp.outline){ sp.style.webkitTextStroke = `${rp.outline.w * bp.fontScale}px ${css(rp.outline.color)}`; }
        div.appendChild(sp);
      }
      box.appendChild(div);
    });
    return box;
  }
  _font(rp, ctx, info){
    let f = rp.font;
    if(!f){
      const t = info.ph ? attr(info.ph,'type','body') : '';
      f = (t==='title' || t==='ctrTitle') ? ctx.theme.major : ctx.theme.minor;
    }
    return `"${f}", "Segoe UI", Arial, sans-serif`;
  }
  _renderPic(pic, ctx, frame){
    const cNvPr = path(pic,'nvPicPr','cNvPr');
    if(bool(cNvPr,'hidden',false)) return null;
    const nvPr = path(pic,'nvPicPr','nvPr');
    if(path(pic,'nvPicPr','nvPr','ph') && ctx.isTemplate) return null;
    const x = this._xfrm(path(pic,'spPr','xfrm'));
    if(!x) return null;
    const r = this._map(x, frame);
    const el = this._box(r, 'pptx-pic');
    el.style.overflow = 'hidden';
    const blipFill = kid(pic,'blipFill');
    const blip = kid(blipFill,'blip');
    const rid = rAttr(blip,'embed');
    const url = this.mediaUrl(rid, ctx.part);
    const prst = attr(path(pic,'spPr','prstGeom'),'prst','rect');
    if(prst==='ellipse') el.style.borderRadius = '50%';
    else if(prst==='roundRect') el.style.borderRadius = (Math.min(r.w,r.h)*0.16667)+'px';
    if(url){
      const img = h('img', null, { position:'absolute', display:'block', maxWidth:'none', userSelect:'none', pointerEvents:'none' });
      img.draggable = false;
      img.src = url;
      const sr = kid(blipFill,'srcRect');
      // v1.80: a crop made in the editor replaces PowerPoint's own crop (the deck file itself is not changed).
      const ZERO = { l:0, t:0, r:0, b:0 };
      const cc = this._cropOv ? (cropOf(this._cropOv) || ZERO) : (cropOf({ l:num(sr,'l',0)/100000, t:num(sr,'t',0)/100000, r:num(sr,'r',0)/100000, b:num(sr,'b',0)/100000 }) || ZERO);
      Object.assign(img.style, stretchImgStyle(r.w, r.h, cc));
      el.dataset.crop = JSON.stringify(cc);
      const amt = kid(blip,'alphaModFix'); if(amt) img.style.opacity = num(amt,'amt',100000)/100000;
      if(x.flipH || x.flipV) img.style.transform = `scale(${x.flipH?-1:1},${x.flipV?-1:1})`;
      el.appendChild(img);
    } else if(rid) {
      const ext = this.mediaExt(rid, ctx.part);
      el.classList.add('pptx-missing');
      el.title = `Image type .${ext||'?'} can't be shown in a browser — use the PDF version for this deck.`;
    }
    const ln = lineFrom(kid(pic,'spPr'), kid(pic,'style'), ctx);
    if(ln) el.style.boxShadow = `inset 0 0 0 ${ln.w}px ${css(ln.color)}`;
    // Video: online (YouTube etc.) or embedded file.
    const vf = kid(nvPr,'videoFile');
    if(vf){
      const link = ctx.part.rels[rAttr(vf,'link')];
      let video = null;
      if(link && link.external) video = { kind:'online', url: link.target };
      else {
        const media = desc(nvPr,'media');
        const mrid = rAttr(media,'embed') || rAttr(vf,'link');
        const mrel = ctx.part.rels[mrid];
        const m = mrel && this.mediaCache.get(mrel.target);
        if(m) video = { kind:'file', url:m.url };
      }
      if(video){ el.dataset.video = JSON.stringify(video); el.classList.add('pptx-video'); }
    }
    return el;
  }
  _renderGroup(g, ctx, frame){
    const cNvPr = path(g,'nvGrpSpPr','cNvPr');
    if(bool(cNvPr,'hidden',false)) return null;
    const x = this._xfrm(path(g,'grpSpPr','xfrm'));
    if(!x) return null;
    const r = this._map(x, frame);
    const el = this._box(r, 'pptx-grp');
    const inner = { chx:x.chx, chy:x.chy, sx: x.chw ? r.w/x.chw : 1, sy: x.chh ? r.h/x.chh : 1 };
    const grpFill = fillFromProps(kid(g,'grpSpPr'), ctx);
    this._renderTree(g, { ...ctx, grpFill }, el, null, inner);
    return el;
  }
  _renderFrame(gf, ctx, frame){
    const cNvPr = path(gf,'nvGraphicFramePr','cNvPr');
    if(bool(cNvPr,'hidden',false)) return null;
    if(path(gf,'nvGraphicFramePr','nvPr','ph') && ctx.isTemplate) return null;
    const x = this._xfrm(kid(gf,'xfrm'));
    if(!x) return null;
    const r = this._map(x, frame);
    const el = this._box(r, 'pptx-frame');
    const gd = path(gf,'graphic','graphicData');
    const uri = attr(gd,'uri','');
    if(/table$/.test(uri)) el.appendChild(this._renderTable(kid(gd,'tbl'), ctx, r));
    else if(/diagram$/.test(uri)){
      const relIds = kid(gd,'relIds');
      const dd = relIds && relIds._drawing;
      const tree = dd && desc(dd.documentElement,'spTree');
      if(tree) this._renderTree(tree, { ...ctx, part:{ rels:relIds._drawingRels, path:relIds._drawingPath } }, el, null, { chx:0, chy:0, sx:1, sy:1 });
      else el.classList.add('pptx-unsupported');
    } else if(/ole$/.test(uri)){
      const pic = desc(gd,'pic');
      if(pic){ const pel = this._renderPic(pic, ctx, null); if(pel){ pel.style.left='0px'; pel.style.top='0px'; pel.style.width='100%'; pel.style.height='100%'; pel.style.transform=''; el.appendChild(pel); } }
    } else {
      el.classList.add('pptx-unsupported');
      el.dataset.label = /chart/.test(uri) ? 'Chart — open the PDF version to see it' : 'Object not supported — use the PDF version';
    }
    return el;
  }
  _renderTable(tbl, ctx, r){
    const t = h('table','pptx-tbl', { borderCollapse:'collapse', tableLayout:'fixed', width:r.w+'px' });
    const tblPr = kid(tbl,'tblPr');
    const firstRow = bool(tblPr,'firstRow',false), bandRow = bool(tblPr,'bandRow',false);
    const cols = kids(kid(tbl,'tblGrid'),'gridCol').map(c=>num(c,'w',0)/EMU);
    const cg = h('colgroup');
    for(const w of cols){ const c = h('col'); c.style.width = w+'px'; cg.appendChild(c); }
    t.appendChild(cg);
    const accent = schemeColor('accent1', ctx);
    // The deck's own table style, if it's in tableStyles.xml.
    const styleId = (desc(tblPr,'tableStyleId') || {}).textContent || '';
    const tStyle = styleId ? this.tableStyles.get(styleId.trim()) : null;
    const flags = { firstRow, bandRow, lastRow:bool(tblPr,'lastRow',false), firstCol:bool(tblPr,'firstCol',false), lastCol:bool(tblPr,'lastCol',false), bandCol:bool(tblPr,'bandCol',false) };
    const nRows = kids(tbl,'tr').length, nCols = cols.length;
    // Style parts that apply to a cell, lowest priority first (PowerPoint's order).
    const partsFor = (ri, ci)=>{
      const out = ['wholeTbl'];
      const r0 = flags.firstRow ? 1 : 0, c0 = flags.firstCol ? 1 : 0;
      if(flags.bandCol) out.push((ci - c0) % 2 === 0 ? 'band1V' : 'band2V');
      if(flags.bandRow) out.push((ri - r0) % 2 === 0 ? 'band1H' : 'band2H');
      if(flags.lastCol && ci===nCols-1) out.push('lastCol');
      if(flags.firstCol && ci===0) out.push('firstCol');
      if(flags.lastRow && ri===nRows-1) out.push('lastRow');
      if(flags.firstRow && ri===0) out.push('firstRow');
      return out.map(n=>{ const el = kid(tStyle,n); return el ? Object.assign(el, { _part:n }) : null; }).filter(Boolean);
    };
    // One border from a style's <a:left>/<a:insideH>/...: {w,color}, 'none', or null (not set).
    const edgeLn = (el)=>{
      if(!el) return null;
      const ln = kid(el,'ln');
      if(ln){ const f = fillFromProps(ln, ctx); if(!f || f.type==='none') return 'none'; return f.type==='solid' ? { w:num(ln,'w',12700)/EMU, color:f.color } : null; }
      const lr = kid(el,'lnRef');
      if(lr){
        const idx = num(lr,'idx',0); if(!idx) return 'none';
        const phClr = colorFrom(lr, ctx), tl = ctx.theme.lines[idx-1];
        let color = phClr;
        if(tl){ const f = fillFromProps(tl, { ...ctx, phClr }); if(f && f.type==='solid') color = f.color; }
        return color ? { w: tl ? num(tl,'w',9525)/EMU : 0.75, color } : null;
      }
      return null;
    };
    // Borders a cell gets from the table style. Each style part (whole table, header row,
    // banded rows...) has outer edges (left/right/top/bottom) and inner lines (insideH/V).
    const ROW_PARTS = new Set(['firstRow','lastRow','band1H','band2H']), COL_PARTS = new Set(['firstCol','lastCol','band1V','band2V']);
    const styleBorders = (parts, ri, ci, rEnd, cEnd)=>{
      const b = {};
      for(const pt of parts){
        const bdr = path(pt,'tcStyle','tcBdr'); if(!bdr) continue;
        const rowP = ROW_PARTS.has(pt._part), colP = COL_PARTS.has(pt._part);
        const pick = {
          lnL: colP ? 'left'   : (ci===0 ? 'left' : 'insideV'),
          lnR: colP ? 'right'  : (cEnd===nCols-1 ? 'right' : 'insideV'),
          lnT: rowP ? 'top'    : (ri===0 ? 'top' : 'insideH'),
          lnB: rowP ? 'bottom' : (rEnd===nRows-1 ? 'bottom' : 'insideH'),
        };
        for(const k in pick){ const v = edgeLn(kid(bdr, pick[k])); if(v) b[k] = v; }
      }
      return b;
    };
    const styleText = (parts)=>{
      const r = { font: ctx.theme.minor };
      for(const pt of parts){
        const tx = kid(pt,'tcTxStyle'); if(!tx) continue;
        if(tx.hasAttribute('b')) r.b = attr(tx,'b')==='on';
        if(tx.hasAttribute('i')) r.i = attr(tx,'i')==='on';
        const fr = kid(tx,'fontRef');
        if(fr) r.font = attr(fr,'idx','minor')==='major' ? ctx.theme.major : ctx.theme.minor;
        const fl = path(tx,'font','latin'); if(fl){ const f = fontName(attr(fl,'typeface',''), ctx); if(f) r.font = f; }
        const col = colorFrom(tx, ctx) || (fr && colorFrom(fr, ctx)); if(col) r.color = col;
      }
      return r;
    };
    const styleFill = (parts)=>{
      let f = null;
      for(const pt of parts){
        const fe = path(pt,'tcStyle','fill'); if(fe){ const ff = fillFromProps(fe, ctx); if(ff) f = ff; }
        if(path(pt,'tcStyle','fillRef')){ const ff = styleRefFill(kid(pt,'tcStyle'), ctx); if(ff) f = ff; } // theme fill, e.g. black header row
      }
      return f;
    };
    const tint = (c, v)=>({ r:Math.round(c.r+(255-c.r)*(1-v)), g:Math.round(c.g+(255-c.g)*(1-v)), b:Math.round(c.b+(255-c.b)*(1-v)), a:1 });
    const hasStyle = !!desc(tblPr,'tableStyleId') || firstRow || bandRow;
    kids(tbl,'tr').forEach((tr, ri)=>{
      const row = h('tr'); row.style.height = (num(tr,'h',0)/EMU)+'px';
      let ci = -1;
      for(const tc of kids(tr,'tc')){
        ci++;
        if(bool(tc,'hMerge',false) || bool(tc,'vMerge',false)) continue;
        const parts = tStyle ? partsFor(ri, ci) : null;
        const td = h('td');
        const gs = num(tc,'gridSpan',1), rs = num(tc,'rowSpan',1);
        if(gs>1) td.colSpan = gs; if(rs>1) td.rowSpan = rs;
        const tcPr = kid(tc,'tcPr');
        const isHeader = firstRow && ri===0;
        let fill = fillFromProps(tcPr, ctx);
        if(!fill && parts) fill = styleFill(parts);
        else if(!fill && hasStyle){
          if(isHeader) fill = { type:'solid', color:accent };
          else fill = { type:'solid', color: tint(accent, bandRow && (ri - (firstRow?1:0)) % 2 === 0 ? 0.4 : 0.2) };
        }
        if(fill) td.style.background = fillToCss(fill);
        const pad = (k, d)=> num(tcPr, k, d)/EMU;
        // Borders: table style first, then the cell's own lines on top.
        const bd = parts ? styleBorders(parts, ri, ci, ri+rs-1, ci+gs-1) : {};
        for(const k of ['lnL','lnR','lnT','lnB']){
          const lnEl = kid(tcPr,k); if(!lnEl) continue;
          const f = fillFromProps(lnEl, ctx);
          if(!f || f.type==='none') bd[k] = 'none';
          else if(f.type==='solid') bd[k] = { w:num(lnEl,'w',12700)/EMU, color:f.color };
        }
        // PowerPoint centres cell borders on the grid line, so they don't make the row taller.
        // In the browser they add height, so take half of each off the cell's padding.
        const bw = (k)=> bd[k] && bd[k]!=='none' ? bd[k].w : 0;
        const padT = Math.max(0, pad('marT',45720) - bw('lnT')/2), padB = Math.max(0, pad('marB',45720) - bw('lnB')/2);
        Object.assign(td.style, { padding:`${padT}px ${pad('marR',91440)}px ${padB}px ${pad('marL',91440)}px`, verticalAlign: { t:'top', ctr:'middle', b:'bottom' }[attr(tcPr,'anchor','t')] || 'top', position:'relative' });
        const bords = { lnL:'borderLeft', lnR:'borderRight', lnT:'borderTop', lnB:'borderBottom' };
        let anyB = false;
        for(const k in bords){
          if(!bd[k]) continue;
          anyB = true;
          if(bd[k]!=='none') td.style[bords[k]] = `${bd[k].w}px solid ${css(bd[k].color)}`;
        }
        // No style definition in the file at all: PowerPoint's default style has white lines.
        if(!anyB && !tStyle && hasStyle) td.style.border = '1px solid #fff';
        const tx = kid(tc,'txBody');
        if(tx){
          // Text defaults: from the table style when we have it; otherwise the theme font,
          // with white bold header text (PowerPoint's default style).
          const tdef = parts ? styleText(parts) : { font: ctx.theme.minor, ...(isHeader && hasStyle ? { b:true, color:{ r:255,g:255,b:255,a:1 } } : {}) };
          const body = this._renderText(tx, { ...ctx }, { ph:null, layoutSp:null, masterSp:null, styleEl:null, w:0, h:0, table:tdef });
          body.style.position = 'static'; body.style.padding = '0';
          td.appendChild(body);
        }
        row.appendChild(td);
      }
      t.appendChild(row);
    });
    return t;
  }
}

/* Default contents of a text box added in the editor: one empty paragraph, 28pt black. */
function newTextHtml(font, o){
  o = o || {};
  const f = `&quot;${font}&quot;, &quot;Segoe UI&quot;, Arial, sans-serif`;
  const fs = o.size || 28, lh = +(fs*1.2).toFixed(2), col = o.color || 'rgb(0, 0, 0)', al = o.align || 'left';
  return `<div class="pptx-p" style="text-align:${al};font-size:${fs}px;line-height:${lh}px;font-family:${f}" data-lh="${lh}" data-fs="${fs}" data-top="0"><span style="font-size:${fs}px;font-family:${f};color:${col}${o.bold ? ';font-weight:700' : ''}" data-fs="${fs}">​</span></div>`;
}
// Plain text (pasted) as paragraphs in the same format as newTextHtml.
function textToHtml(text, font, o){
  const one = newTextHtml(font, o);
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const escT = s => s.replace(/[&<>]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  return lines.map(t=>one.replace('>​</span>', '>' + (t ? escT(t) : '​') + '</span>')).join('');
}

/* ---------- objects added in the viewer's editor ----------
   { id, x,y,w,h, rot?,
     html?   paragraphs (text boxes, shapes, copied objects with text)
     shape?  one of SHAPES (text box when absent)
     fill?, line?  '#rrggbb' | 'none' (unset = the kind's default); lw? outline width (px)
     flipH?, flipV?  direction of a line / arrow (drawn top-left → bottom-right before flipping)
     pic?    picture: media path in the Lessons folder (edits.media(path) → URL)
     art?    copied PowerPoint object: its picture / shape layer as HTML (images as data-media="path")
     tx?     { css } a copied object's text box style }
   data-oid "n<id>". */
const SHAPES = {
  rect:{ name:'Rectangle' }, roundRect:{ name:'Rounded rectangle' }, ellipse:{ name:'Oval' }, triangle:{ name:'Triangle' },
  diamond:{ name:'Diamond' }, star5:{ name:'Star' }, rightArrow:{ name:'Block arrow' }, speech:{ name:'Speech bubble' },
  tick:{ name:'Tick' }, cross:{ name:'Cross' }, line:{ name:'Line', line:true }, arrow:{ name:'Arrow', line:true },
};
const SHAPE_DEFAULT = { fill:'#4472C4', line:'#2F528F', lw:1.5 };
const LINE_DEFAULT = { line:'#111114', lw:4 };
function addedKind(a){ return a.tool ? 'tool' : a.frame ? 'frame' : a.table ? 'table' : a.pic ? 'pic' : a.shape ? (SHAPES[a.shape] && SHAPES[a.shape].line ? 'line' : 'shape') : a.art!=null ? 'copy' : 'text'; }
/* Tool icon (v1.68, Insert → Tool icon): a coloured tile with a Lucide icon. a.tool = { id, icon (Lucide name), col, secs? }.
   Not in the reveal sequence; tapping it while presenting is handled by app.js (buildOverlay → SVTools.launchIcon). */
function renderToolIcon(a, el){
  const t = a.tool, short = Math.min(a.w, a.h), pad = Math.round(short*0.22);
  el.style.borderRadius = Math.round(short*0.2) + 'px';
  el.style.background = t.col || '#2F5BEA';
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,.25)';
  const markup = (window.LUCIDE && LUCIDE[t.icon]) || '';
  el.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="position:absolute;left:${pad}px;top:${pad}px;width:${Math.max(a.w - pad*2, 1)}px;height:${Math.max(a.h - pad*2, 1)}px;color:#fff;stroke:#fff;stroke-width:1.8;overflow:visible">${markup}</svg>`;
  el.dataset.oname = 'Tool icon';
  el.dataset.tool = t.id || '';
  return el;
}
/* Picture frame (v1.73, Insert → Picture frame): a placeholder a picture is dropped or pasted into.
   a.frame = { fx?, fy? } (which part of the picture shows when it's cropped: 0 = left / top, 1 = right / bottom; 0.5 when missing),
   a.pic = the picture (media path, as a picture's) once filled. The picture fills the frame (crop to fill).
   An empty frame draws a dashed placeholder that only the editor shows (styles.css .pptx-frame-ph); presenting and print show nothing. */
function frameFocus(a){ const f = a.frame || {}, n = v=>Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5; return { fx:n(f.fx), fy:n(f.fy) }; }
/* Crop (v1.80): { l, t, r, b } as fractions of the whole picture (0 = none). nw / nh (a frame's picture size) are kept.
   A stretched picture (added pictures, deck pictures) shows the part left after the crop, stretched to its box (PowerPoint's srcRect).
   A frame shows the cropped part, covering the frame and shifted by its focus. */
function cropOf(c){
  if(!c) return null;
  const n = v=>Number.isFinite(v) ? Math.max(0, Math.min(0.95, v)) : 0;
  let l = n(c.l), t = n(c.t), r = n(c.r), b = n(c.b);
  if(l + r > 0.95){ const s = 0.95/(l + r); l *= s; r *= s; }
  if(t + b > 0.95){ const s = 0.95/(t + b); t *= s; b *= s; }
  if(!l && !t && !r && !b) return null;
  return { l, t, r, b, nw:c.nw, nh:c.nh };
}
function stretchImgStyle(w, h, cr){
  const fw = 1 - cr.l - cr.r, fh = 1 - cr.t - cr.b;
  return { left:(-cr.l * w / fw) + 'px', top:(-cr.t * h / fh) + 'px', width:(w / fw) + 'px', height:(h / fh) + 'px' };
}
function frameImgStyle(w, h, cr, f){
  const rw = (1 - cr.l - cr.r) * cr.nw, rh = (1 - cr.t - cr.b) * cr.nh;
  const s = Math.max(w / rw, h / rh), ox = rw * s - w, oy = rh * s - h;
  return { left:(-(cr.l * cr.nw * s + f.fx * ox)) + 'px', top:(-(cr.t * cr.nh * s + f.fy * oy)) + 'px', width:(cr.nw * s) + 'px', height:(cr.nh * s) + 'px' };
}
function renderFrame(a, el, media){
  el.classList.add('pptx-frame'); el.style.overflow = 'hidden';
  el.dataset.oname = 'Picture frame';
  if(a.pic){
    const f = frameFocus(a), cr = cropOf(a.frame && a.frame.crop);
    const img = h('img', null, { position:'absolute', left:0, top:0, width:'100%', height:'100%', display:'block', maxWidth:'none', objectFit:'cover', objectPosition:`${f.fx*100}% ${f.fy*100}%`, userSelect:'none', pointerEvents:'none', ...(cr && cr.nw ? frameImgStyle(a.w, a.h, cr, f) : {}) });
    img.draggable = false; const u = media(a.pic); if(u) img.src = u; else img.dataset.media = a.pic;
    el.appendChild(img);
    if(a.line && a.line!=='none' && a.lw) el.style.boxShadow = `inset 0 0 0 ${a.lw}px ${a.line}`;
    return el;
  }
  el.dataset.empty = '1';
  const fs = Math.max(9, Math.min(22, Math.min(a.w, a.h)*0.09));
  const ic = Math.max(16, Math.min(64, Math.min(a.w, a.h)*0.28));
  const ph = h('div', 'pptx-frame-ph', { fontSize:fs + 'px' });
  ph.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${ic}px;height:${ic}px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round">${(window.LUCIDE && LUCIDE['image-plus']) || ''}</svg>`
    + (Math.min(a.w, a.h) >= 60 ? '<span>Drop or paste a picture</span>' : '');
  el.appendChild(ph);
  return el;
}
function addedPath(kind, w, h, r){
  switch(kind){
    case 'speech': { const r = Math.min(w, h)*0.15, bh = h*0.78, tx = w*0.22; // rounded body + tail at the bottom left
      return `M${r},0 H${w-r} A${r},${r} 0 0 1 ${w},${r} V${bh-r} A${r},${r} 0 0 1 ${w-r},${bh} H${tx+w*0.14} L${tx-w*0.04},${h} L${tx},${bh} H${r} A${r},${r} 0 0 1 0,${bh-r} V${r} A${r},${r} 0 0 1 ${r},0 Z`; }
    case 'tick': return poly([[0,h*0.55],[w*0.14,h*0.4],[w*0.38,h*0.64],[w*0.86,0],[w,h*0.14],[w*0.38,h]]);
    case 'cross': { const t = 0.16; return poly([[w*t,0],[w/2,h*(0.5-t)],[w*(1-t),0],[w,h*t],[w*(0.5+t),h/2],[w,h*(1-t)],[w*(1-t),h],[w/2,h*(0.5+t)],[w*t,h],[0,h*(1-t)],[w*(0.5-t),h/2],[0,h*t]]); }
    case 'line': case 'arrow': return `M0,0 L${w},${h}`;
    case 'rightArrow': return presetPath('rightArrow', w, h, { adj1:50000, adj2:50000 });
    default: return presetPath(kind, w, h, kind==='roundRect' && r!=null ? { adj:Math.round(Math.max(0, r)/Math.max(1, Math.min(w, h))*100000) } : {}); // r (v1.94): a fixed corner radius in px
  }
}
function colOr(v, d){ return v==null || v==='' ? d : v; }
// Bottom-to-top order: the editor's saved order (objects that still exist), then any it doesn't mention, in slide order.
function layerOrder(ids, z){ const have = new Set(ids), inZ = new Set(z); return z.filter(id=>have.has(id)).concat(ids.filter(id=>!inZ.has(id))); }
const DASHES = { dash:[4,3], dot:[1,2] };
function dashArray(dash, w){ const d = DASHES[dash]; return d ? d.map(v=>v*Math.max(w || 1, 1)).join(' ') : null; }
function addedSvg(kind, w, h, fill, line, lw, flipH, flipV, dash, r){
  const isLine = kind==='line' || kind==='arrow';
  const svg = s('svg', { width: Math.max(w, 1), height: Math.max(h, 1) });
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
  const g = s('g');
  if(flipH || flipV) g.setAttribute('transform', `translate(${flipH?w:0},${flipV?h:0}) scale(${flipH?-1:1},${flipV?-1:1})`);
  const p = s('path', { d: addedPath(kind, w, h, r), 'fill-rule':'evenodd', 'stroke-linejoin':'round', 'stroke-linecap': isLine ? 'round' : 'butt' });
  p.setAttribute('fill', isLine || fill==='none' ? 'none' : fill);
  if(line && line!=='none' && lw > 0){ p.setAttribute('stroke', line); p.setAttribute('stroke-width', lw); const da = dashArray(dash, lw); if(da) p.setAttribute('stroke-dasharray', da); } else p.setAttribute('stroke', 'none');
  if(kind==='arrow' && line && line!=='none'){
    const id = 'm' + (++uid), defs = s('defs');
    const m = s('marker', { id, viewBox:'0 0 10 10', refX:'6', refY:'5', markerWidth:'4', markerHeight:'4', orient:'auto-start-reverse' });
    m.appendChild(s('path', { d:'M0,0 L10,5 L0,10 z', fill: line }));
    defs.appendChild(m); svg.appendChild(defs);
    p.setAttribute('marker-end', `url(#${id})`);
  }
  g.appendChild(p); svg.appendChild(g);
  return svg;
}
/* ---------- tables (Insert → Table, v1.33) ----------
   a.table = { cols:[fractions], rows:[fractions], cells:[[{ html?, fill?, va?, rs?, cs? }]], head?, tx?, va? }
   head: true (navy, older tables) or a colour. tx: { font, size, align } for empty cells. va / cell.va: 't' | 'm' | 'b'.
   a.fill = fill for cells without their own; a.line / a.lw / a.dash = the grid lines. */
const TABLE_DEFAULT = { fill:'#FFFFFF', line:'#3A3A40', lw:1.5 };
const HEAD_FILL = '#1F3A5F';
function norm(f){ const t = f.reduce((n, v)=>n + v, 0) || 1; return f.map(v=>v/t); }
/* Merged cells (v1.70): the top-left cell of a merged block carries rs / cs (the rows / columns it covers, when > 1).
   The cells it covers are empty and aren't drawn, picked or revealed. tableSpans(t) gives, for each grid position,
   own[r][c] = [r, c] of the cell drawn there (itself, or the merged cell covering it) and span[r][c] = [rs, cs] for
   cells that are drawn (null for covered ones). Overlapping or out-of-range spans are cut back to a single cell. */
function tableSpans(t){
  const R = t.rows.length, C = t.cols.length;
  const own = Array.from({ length:R }, (_, r)=>Array.from({ length:C }, (_, c)=>[r, c]));
  const span = Array.from({ length:R }, ()=>Array.from({ length:C }, ()=>[1, 1]));
  const taken = Array.from({ length:R }, ()=>Array(C).fill(false));
  for(let r = 0; r < R; r++) for(let c = 0; c < C; c++){
    if(taken[r][c]){ span[r][c] = null; continue; }
    const cl = (t.cells[r] || [])[c];
    let rs = Math.max(1, Math.min(Math.floor(cl && cl.rs || 1), R - r)), cs = Math.max(1, Math.min(Math.floor(cl && cl.cs || 1), C - c));
    for(let i = r; i < r + rs; i++) for(let j = c; j < c + cs; j++) if(taken[i][j]){ rs = 1; cs = 1; }
    span[r][c] = [rs, cs];
    for(let i = r; i < r + rs; i++) for(let j = c; j < c + cs; j++){ taken[i][j] = true; own[i][j] = [r, c]; }
  }
  return { own, span };
}
const hasSpans = t=>t.cells.some(row=>(row || []).some(cl=>cl && (cl.rs > 1 || cl.cs > 1)));
// Each drawn cell's place inside the table (px from its top-left); merged cells cover their whole block (rs / cs).
function tableGeo(a){
  const t = a.table, cw = norm(t.cols), rh = norm(t.rows), out = [], sp = tableSpans(t);
  const cx = [0], ry = [0];
  for(const v of cw) cx.push(cx[cx.length - 1] + v);
  for(const v of rh) ry.push(ry[ry.length - 1] + v);
  for(let r = 0; r < rh.length; r++) for(let c = 0; c < cw.length; c++){
    const s = sp.span[r][c]; if(!s) continue;
    out.push({ r, c, x:cx[c]*a.w, y:ry[r]*a.h, w:(cx[c + s[1]] - cx[c])*a.w, h:(ry[r + s[0]] - ry[r])*a.h, rs:s[0], cs:s[1] });
  }
  return out;
}
// Empty cell text: the table's own defaults (t.tx, v1.34: Arial 14 left), else the original 20pt centred theme font.
function cellTextHtml(font, tx){ return tx ? newTextHtml(tx.font || font, { size:tx.size || 14, align:tx.align || 'left' }) : newTextHtml(font, { size:20, align:'center' }); }
const VALIGN = { t:'flex-start', m:'center', b:'flex-end' };
function renderTable(a, el, theme){
  const t = a.table, fill = colOr(a.fill, TABLE_DEFAULT.fill), headFill = typeof t.head==='string' ? t.head : HEAD_FILL;
  for(const g of tableGeo(a)){
    const cell = (t.cells[g.r] || [])[g.c] || {};
    const d = h('div', 'pptx-cell', { position:'absolute', left:g.x+'px', top:g.y+'px', width:g.w+'px', height:g.h+'px', background: cell.fill || (t.head && g.r===0 ? headFill : fill) });
    const wrap = h('div', 'pptx-cellx', { position:'absolute', inset:'0' });
    wrap.dataset.oid = 'n' + a.id + '.' + g.r + '.' + g.c;
    const box = h('div','pptx-tx', { position:'absolute', inset:'0', padding:'3.6px 7.2px', display:'flex', flexDirection:'column', justifyContent:VALIGN[cell.va || t.va] || 'center', whiteSpace:'pre-wrap', overflowWrap:'break-word', boxSizing:'border-box', overflow:'hidden' });
    box.dataset.autofit = '1';
    box.innerHTML = cell.html || cellTextHtml(theme.minor, t.tx);
    wrap.appendChild(box); d.appendChild(wrap); el.appendChild(d);
  }
  // Grid lines on top.
  const line = colOr(a.line, TABLE_DEFAULT.line), lw = a.lw!=null ? a.lw : TABLE_DEFAULT.lw;
  if(line!=='none' && lw > 0){
    const svg = s('svg', { width:Math.max(a.w, 1), height:Math.max(a.h, 1) });
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    const da = dashArray(a.dash, lw);
    const add = (x1, y1, x2, y2)=>{ const l = s('line', { x1, y1, x2, y2, stroke:line, 'stroke-width':lw, 'stroke-linecap':'square' }); if(da) l.setAttribute('stroke-dasharray', da); svg.appendChild(l); };
    // Inside lines are drawn in runs, leaving out the parts inside a merged cell (v1.70).
    const cx = [0], ry = [0], own = tableSpans(t).own, R = t.rows.length, C = t.cols.length;
    for(const f of norm(t.cols)) cx.push(cx[cx.length - 1] + f);
    for(const f of norm(t.rows)) ry.push(ry[ry.length - 1] + f);
    const same = (p, q)=>p[0]===q[0] && p[1]===q[1];
    add(0, 0, 0, a.h); add(a.w, 0, a.w, a.h); add(0, 0, a.w, 0); add(0, a.h, a.w, a.h);
    for(let i = 1; i < C; i++){ let st = -1; for(let r = 0; r <= R; r++){ const open = r < R && !same(own[r][i - 1], own[r][i]); if(open && st < 0) st = r; if(!open && st >= 0){ add(cx[i]*a.w, ry[st]*a.h, cx[i]*a.w, ry[r]*a.h); st = -1; } } }
    for(let i = 1; i < R; i++){ let st = -1; for(let c = 0; c <= C; c++){ const open = c < C && !same(own[i - 1][c], own[i][c]); if(open && st < 0) st = c; if(!open && st >= 0){ add(cx[st]*a.w, ry[i]*a.h, cx[c]*a.w, ry[i]*a.h); st = -1; } } }
    el.appendChild(svg);
  }
  el.dataset.oname = 'Table';
  return el;
}
function renderAdded(a, edits, theme){
  const media = (edits && edits.media) || (()=>null);
  const kind = addedKind(a);
  const el = h('div', 'pptx-obj pptx-added', { position:'absolute', left:a.x+'px', top:a.y+'px', width:Math.max(a.w,0)+'px', height:Math.max(a.h,0)+'px' });
  if(a.rot) el.style.transform = `rotate(${a.rot}deg)`;
  el.dataset.oid = 'n' + a.id;
  el.dataset.kind = 'n-' + kind;
  if(kind==='table') return renderTable(a, el, theme);
  if(kind==='tool') return renderToolIcon(a, el);
  if(kind==='frame') return renderFrame(a, el, media);
  if(kind==='pic'){
    el.classList.add('pptx-pic'); el.style.overflow = 'hidden';
    const cr = cropOf(a.crop); // v1.80: crop of an added picture
    const img = h('img', null, { position:'absolute', left:0, top:0, display:'block', maxWidth:'none', userSelect:'none', pointerEvents:'none', ...(cr ? stretchImgStyle(a.w, a.h, cr) : { width:'100%', height:'100%' }) });
    img.draggable = false; const u = media(a.pic); if(u) img.src = u; else img.dataset.media = a.pic || '';
    el.appendChild(img);
    if(a.line && a.line!=='none' && a.lw) el.style.boxShadow = `inset 0 0 0 ${a.lw}px ${a.line}`; // pictures: solid outlines only
    el.dataset.oname = 'Picture';
    return el;
  }
  if(kind==='copy'){
    if(a.artPic){ el.classList.add('pptx-pic'); el.style.overflow = 'hidden'; }
    const art = h('div', 'pptx-art', { position:'absolute', inset:'0' });
    art.innerHTML = a.art || '';
    for(const im of art.querySelectorAll('[data-media]')){ const u = media(im.dataset.media); if(u){ if(im.localName==='image') im.setAttribute('href', u); else im.src = u; } }
    el.appendChild(art);
    if(a.fill || a.line){ const svg = art.querySelector(':scope > svg'); if(svg) restyleShape(el, a); }
    el.dataset.oname = 'Copied object';
  } else if(kind==='shape' || kind==='line'){
    const D = kind==='line' ? LINE_DEFAULT : SHAPE_DEFAULT;
    el.appendChild(addedSvg(a.shape, a.w, a.h, colOr(a.fill, D.fill || 'none'), colOr(a.line, D.line), a.lw!=null ? a.lw : D.lw, a.flipH, a.flipV, a.dash, a.r));
    el.dataset.oname = SHAPES[a.shape].name;
    if(kind==='line') return el;
  } else {
    // Text box: optional fill / outline as a rectangle behind the text.
    if((a.fill && a.fill!=='none') || (a.line && a.line!=='none')) el.appendChild(addedSvg('rect', a.w, a.h, colOr(a.fill, 'none'), colOr(a.line, 'none'), a.lw!=null ? a.lw : 1.5, false, false, a.dash));
    el.dataset.oname = 'Added text box';
  }
  if(kind==='copy' && a.html==null) return el;
  const shape = kind==='shape';
  const box = h('div','pptx-tx', { position:'absolute', inset:'0', padding: shape ? '3.6px 10px' : '3.6px 7.2px', display:'flex', flexDirection:'column', justifyContent: shape ? 'center' : 'flex-start', whiteSpace:'pre-wrap', overflowWrap:'break-word', boxSizing:'border-box' });
  if(a.tx && a.tx.css) box.style.cssText = a.tx.css;
  if(a.tx && a.tx.fit) box.dataset.autofit = a.tx.fit;
  box.innerHTML = a.html || (a.plain ? textToHtml(a.plain, theme.minor) : shape ? newTextHtml(theme.minor, { size:24, color:a.tcol || 'rgb(255, 255, 255)', bold:!!a.tbold, align:'center' }) /* v1.88: a.tcol / a.tbold: the lesson's light grade, bold, set when the shape is added */ : newTextHtml(theme.minor));
  el.appendChild(box);
  return el;
}
/* Fill / outline from the editor on a PowerPoint shape (or a copied one). st: { fill, line, lw }. */
function restyleShape(el, st){
  let svg = el.querySelector(':scope > svg, :scope > .pptx-art > svg');
  if(!svg){
    if(!(st.fill && st.fill!=='none') && !(st.line && st.line!=='none')) return;
    svg = addedSvg('rect', parseFloat(el.style.width) || 0, parseFloat(el.style.height) || 0, 'none', 'none', 0);
    el.insertBefore(svg, el.firstChild);
  }
  for(const p of svg.querySelectorAll(':scope > g > path, :scope > path')){
    if(st.fill) p.setAttribute('fill', st.fill);
    if(st.line){ p.setAttribute('stroke', st.line); if(st.line!=='none' && !(parseFloat(p.getAttribute('stroke-width')) > 0)) p.setAttribute('stroke-width', st.lw || 1.5); }
    if(st.lw!=null && st.line!=='none') p.setAttribute('stroke-width', st.lw);
    if(st.dash!=null){ const da = dashArray(st.dash, parseFloat(p.getAttribute('stroke-width')) || 1); if(da) p.setAttribute('stroke-dasharray', da); else p.removeAttribute('stroke-dasharray'); }
  }
}
/* Shrink-on-overflow text (normAutofit without a saved scale). Call after the slide is in the DOM. */
function hasTextSz(runs){ return runs.some(r=>!r.br && r.text); }
function fitText(root){
  for(const box of root.querySelectorAll('[data-autofit]')){
    if(box.scrollHeight <= box.clientHeight + 1) continue;
    const spans = [...box.querySelectorAll('span:not(.lst-m)')]; // list markers keep their own (em) size
    for(const sp of spans) if(!sp.dataset.fs) sp.dataset.fs = parseFloat(sp.style.fontSize) || 18;
    let lo = 0.25, hi = 1;
    const paras = [...box.querySelectorAll('.pptx-p')];
    const apply = k => {
      for(const sp of spans) sp.style.fontSize = (sp.dataset.fs * k) + 'px';
      for(const d of paras){ if(!d.dataset.lh) continue; d.style.fontSize = (d.dataset.fs * k) + 'px'; d.style.lineHeight = (d.dataset.lh * k) + 'px'; if(d.style.top) d.style.top = (d.dataset.top * k) + 'px'; }
    };
    for(let n=0;n<7;n++){ const mid = (lo+hi)/2; apply(mid); if(box.scrollHeight <= box.clientHeight + 1) lo = mid; else hi = mid; }
    apply(lo);
  }
}
window.PPTX = { Deck, fitText, SHAPES, frameFocus, cropOf, stretchImgStyle, frameImgStyle, addedSvg, newTextHtml, textToHtml, layerOrder, renderAdded, tableGeo, tableSpans, hasSpans, cellTextHtml, TABLE_DEFAULT, HEAD_FILL };
})();
