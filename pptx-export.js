/* =====================================================================
   Slideshow Viewer — Export to PowerPoint (v1.67, 2026-10-18)
   Spec: Project doc claude/pptx-export-spec.md. Decisions (the teacher, 2026-10-18):
   - Built from the ORIGINAL .pptx: the deck file is copied and its XML patched,
     so layouts, fonts, EMF pictures, transitions and anything the viewer can't
     draw stay exactly as they were.
   - PowerPoint decks only (a PDF-only lesson has nothing to export).
   - Reveals become click animations in the viewer's reveal order: Hidden at
     start = Appear on click, Can hide = Disappear on click, cover boxes =
     solid rectangles that Disappear on click. A group goes as one click.
     The deck's own animations are replaced by these (emphasis / motion path
     effects are dropped and counted in the report).
   - Pen annotations are left out.
   - My notes are added to the speaker notes (after any notes the deck had).
   - Slides hidden in PowerPoint stay hidden; slides hidden only in the viewer
     are left out; deleted slides are left out.
   - Date fields are written as fixed text (the lesson's date).
   - Hidden table cells can't be animated one by one in PowerPoint, so (v1.67.1)
     each gets a box in the cell's colour (the slide background for clear cells),
     inset inside the grid lines: Hidden at start = the box disappears on click,
     Can hide = the box appears on click.
   - Saved as "<deck name> - export <date>.pptx" in the Lessons folder (never
     touched by Clear previous weeks / tidyShared, which only remove a
     lesson's own deck and Shared - / Media - files).

   How (all in the browser, classic script, JSZip from vendor/):
   1. exportLesson(l): getDeck() for the lesson view, a fresh JSZip of the
      deck file (Pkg), then one output slide per kept slide-list entry:
      the deck's own slide (reused the first time, cloned for Duplicates),
      a slide from a Shared deck (importSlide: parts copied across, layout
      matched by name/type), or a new blank slide (activities, Slide Gallery).
   2. patchSlide(): deleted objects removed, moved/resized objects get new
      xfrm, edited text is rebuilt from the viewer's HTML (domParas), shape
      fill/outline, background colour, objects added in the editor (text
      boxes, shapes, lines, pictures, tables, copied objects), activity
      layers and cover boxes are written as DrawingML, then layer order and
      the p:timing click sequence.
   3. Text and copied objects are converted from the slide as the viewer
      draws it (rendered off-screen, Measurer), so sizes, colours and fonts
      match what's on screen. Copies and activities go through domShapes(),
      a general HTML/SVG → shapes converter (paths, pictures, boxes, text).
   4. Unused slides are removed, sldIdLst rebuilt, sections dropped, notes
      written, docProps/app.xml counts updated.
   Gives window.SVExport = { open(lessonId), exportLesson(l), _ }.
   ===================================================================== */
(function(){
'use strict';
const EMU = 12700; // 1 slide px = 1 pt
const NS = {
  a:'http://schemas.openxmlformats.org/drawingml/2006/main',
  p:'http://schemas.openxmlformats.org/presentationml/2006/main',
  r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  pr:'http://schemas.openxmlformats.org/package/2006/relationships',
  ct:'http://schemas.openxmlformats.org/package/2006/content-types',
};
const REL = t => 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + t;
const CT = {
  slide:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notes:'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  notesMaster:'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  theme:'application/vnd.openxmlformats-officedocument.theme+xml',
};
const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', bmp:'image/bmp', svg:'image/svg+xml', webp:'image/webp', emf:'image/x-emf', wmf:'image/x-wmf', tif:'image/tiff', tiff:'image/tiff' };
const XMLNS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const SVG_EXT = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
const SECTIONS_EXT = '{521415D9-36F7-43E2-AB2F-B90AF26B5E84}';

/* ---------- small XML helpers ---------- */
const parse = t => new DOMParser().parseFromString(t, 'application/xml');
const ser = d => { let s = new XMLSerializer().serializeToString(d); if(!s.startsWith('<?xml')) s = DECL + s; return s; };
const kids = (el, n) => el ? [...el.children].filter(c=>!n || c.localName===n) : [];
const kid = (el, n) => el ? ([...el.children].find(c=>c.localName===n) || null) : null;
const desc = (el, n) => el ? (el.getElementsByTagNameNS('*', n)[0] || null) : null;
const descAll = (el, n) => el ? [...el.getElementsByTagNameNS('*', n)] : [];
const rid = el => el.getAttributeNS(NS.r, 'id') || el.getAttribute('r:id');
function esc(s){ return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
const E = v => Math.round((Number(v) || 0) * EMU);
const EP = v => Math.max(0, E(v)); // non-negative EMU (sizes)
// Elements from an XML string, ready to insert into doc.
function frag(doc, xml){
  const d = parse(`<root ${XMLNS}>${xml}</root>`);
  if(d.getElementsByTagName('parsererror').length) throw new Error('Export: bad XML ' + xml.slice(0, 200));
  return [...d.documentElement.children].map(n=>doc.importNode(n, true));
}
function dirOf(p){ const i = p.lastIndexOf('/'); return i<0 ? '' : p.slice(0, i); }
function resolve(base, target){
  if(target.startsWith('/')) return target.slice(1);
  const out = dirOf(base).split('/').filter(Boolean);
  for(const s of target.split('/')){ if(s==='..') out.pop(); else if(s && s!=='.') out.push(s); }
  return out.join('/');
}
function relative(from, to){
  const a = dirOf(from).split('/').filter(Boolean), b = to.split('/');
  let i = 0; while(i < a.length && i < b.length - 1 && a[i]===b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}
const relsPath = p => (dirOf(p) ? dirOf(p) + '/' : '') + '_rels/' + p.split('/').pop() + '.rels';
const extOf = p => (p.split('.').pop() || '').toLowerCase();

/* ---------- colours ---------- */
let cctx = null;
// Any CSS colour → { hex:'RRGGBB', a:0..1 } or null (none / transparent).
function color(v){
  if(v==null) return null;
  v = String(v).trim();
  if(!v || v==='none' || v==='transparent') return null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if(!m){
    if(!cctx) cctx = document.createElement('canvas').getContext('2d');
    cctx.fillStyle = '#010203'; cctx.fillStyle = v;
    const n = cctx.fillStyle;
    if(n==='#010203' && v.toLowerCase()!=='#010203') return null;
    if(n[0]==='#') return { hex:n.slice(1).toUpperCase(), a:1 };
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(n);
    if(!m) return null;
  }
  let a = m[4]==null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
  if(!(a > 0.003)) return null;
  const h = x => Math.max(0, Math.min(255, Math.round(+x))).toString(16).padStart(2, '0');
  return { hex:(h(m[1]) + h(m[2]) + h(m[3])).toUpperCase(), a:Math.min(1, a) };
}
function clr(c, extraAlpha){
  const a = c.a * (extraAlpha==null ? 1 : extraAlpha);
  return `<a:srgbClr val="${c.hex}">${a < 0.999 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`;
}
function solid(v, alpha){ const c = color(v); return c ? `<a:solidFill>${clr(c, alpha)}</a:solidFill>` : '<a:noFill/>'; }
const DASH = { dash:'dash', dot:'sysDot' };
function lnXml(line, lw, dash, ends){
  const c = color(line);
  if(!c || !(lw > 0)) return '<a:ln><a:noFill/></a:ln>';
  return `<a:ln w="${E(lw)}"><a:solidFill>${clr(c)}</a:solidFill>${DASH[dash] ? `<a:prstDash val="${DASH[dash]}"/>` : ''}<a:round/>${ends || ''}</a:ln>`;
}
function xfrmXml(r, tag, extra){
  const rot = r.rot ? ((Math.round(r.rot * 60000) % 21600000) + 21600000) % 21600000 : 0;
  return `<${tag || 'a:xfrm'}${rot ? ` rot="${rot}"` : ''}${r.flipH ? ' flipH="1"' : ''}${r.flipV ? ' flipV="1"' : ''}><a:off x="${E(r.x)}" y="${E(r.y)}"/><a:ext cx="${EP(r.w)}" cy="${EP(r.h)}"/>${extra || ''}</${tag || 'a:xfrm'}>`;
}

/* ---------- the package ---------- */
class Pkg {
  constructor(zip){ this.zip = zip; this.relCache = new Map(); }
  async init(){
    this.ctDoc = parse(await this.zip.file('[Content_Types].xml').async('string'));
    const root = parse(await this.zip.file('_rels/.rels').async('string'));
    const off = kids(root.documentElement, 'Relationship').find(r=>r.getAttribute('Type').endsWith('/officeDocument'));
    this.presPath = off ? resolve('', off.getAttribute('Target')) : 'ppt/presentation.xml';
  }
  has(p){ return !!this.zip.file(p); }
  async text(p){ const f = this.zip.file(p); return f ? f.async('string') : null; }
  async xml(p){ const t = await this.text(p); return t==null ? null : parse(t); }
  put(p, doc){ this.zip.file(p, typeof doc==='string' ? doc : ser(doc)); }
  remove(p){ this.zip.remove(p); this.zip.remove(relsPath(p)); this.relCache.delete(p); this.removeOverride(p); }
  // Relationships of a part: { doc, list:[{ id, type, target (resolved), external, el }] }
  async rels(p){
    if(this.relCache.has(p)) return this.relCache.get(p);
    const t = await this.text(relsPath(p));
    const doc = parse(t || `<Relationships xmlns="${NS.pr}"/>`);
    const r = { doc, path:p, get list(){
      return kids(doc.documentElement, 'Relationship').map(el=>{ const ext = el.getAttribute('TargetMode')==='External'; return { id:el.getAttribute('Id'), type:el.getAttribute('Type'), target: ext ? el.getAttribute('Target') : resolve(p, el.getAttribute('Target')), external:ext, el }; });
    } };
    this.relCache.set(p, r);
    return r;
  }
  saveRels(r){ this.zip.file(relsPath(r.path), ser(r.doc)); }
  addRel(r, type, target, external){
    const ids = new Set(r.list.map(x=>x.id)); let n = 1; while(ids.has('rId' + n)) n++;
    const el = r.doc.createElementNS(NS.pr, 'Relationship');
    el.setAttribute('Id', 'rId' + n); el.setAttribute('Type', type);
    el.setAttribute('Target', external ? target : relative(r.path, target));
    if(external) el.setAttribute('TargetMode', 'External');
    r.doc.documentElement.appendChild(el);
    return 'rId' + n;
  }
  override(part, type){
    this.removeOverride(part);
    const el = this.ctDoc.createElementNS(NS.ct, 'Override');
    el.setAttribute('PartName', '/' + part); el.setAttribute('ContentType', type);
    this.ctDoc.documentElement.appendChild(el);
  }
  removeOverride(part){ for(const o of kids(this.ctDoc.documentElement, 'Override')) if(o.getAttribute('PartName').toLowerCase()==='/' + part.toLowerCase()) o.remove(); }
  ensureDefault(ext, type){
    ext = ext.toLowerCase();
    if(kids(this.ctDoc.documentElement, 'Default').some(d=>d.getAttribute('Extension').toLowerCase()===ext)) return;
    const el = this.ctDoc.createElementNS(NS.ct, 'Default');
    el.setAttribute('Extension', ext); el.setAttribute('ContentType', type);
    this.ctDoc.documentElement.insertBefore(el, this.ctDoc.documentElement.firstChild);
  }
  // A part name not in use yet: dir/stemN.ext
  unique(dir, stem, ext){
    let n = 1; const taken = p=>!!this.zip.file(p) || (this.reserved && this.reserved.has(p));
    while(taken(`${dir}/${stem}${n}.${ext}`)) n++;
    const p = `${dir}/${stem}${n}.${ext}`;
    (this.reserved = this.reserved || new Set()).add(p);
    return p;
  }
  // A picture file into ppt/media; returns its part path.
  addMedia(bytes, ext){
    ext = (ext || 'png').toLowerCase(); if(ext==='jpeg') ext = 'jpg';
    const p = this.unique('ppt/media', 'export', ext);
    this.zip.file(p, bytes);
    this.ensureDefault(ext, MIME[ext] || 'application/octet-stream');
    return p;
  }
  finish(){ this.zip.file('[Content_Types].xml', ser(this.ctDoc)); for(const r of this.relCache.values()) if(r.dirty) this.saveRels(r); }
}

/* ---------- report: what couldn't be exported exactly ---------- */
function newReport(){ return { slides:0, skippedHidden:0, cells:0, cellBoxes:0, acts:0, missingPics:0, missingSlides:0, droppedAnims:0, otherLook:0, notes:0, reveals:0, covers:0 }; }
function reportLines(R){
  const out = [];
  if(R.skippedHidden) out.push(`${R.skippedHidden} slide${R.skippedHidden>1 ? 's' : ''} hidden in the viewer ${R.skippedHidden>1 ? 'were' : 'was'} left out.`);
  if(R.cells) out.push(`${R.cells} hidden table cell${R.cells>1 ? 's are' : ' is'} shown: the table couldn't be found to cover ${R.cells>1 ? 'them' : 'it'}.`);
  if(R.acts) out.push(`${R.acts} activity slide${R.acts>1 ? 's are' : ' is'} exported as plain shapes in their starting layout (no dragging, checking or row reveals).`);
  if(R.droppedAnims) out.push(`${R.droppedAnims} PowerPoint animation${R.droppedAnims>1 ? 's' : ''} that the viewer doesn't use (emphasis, motion paths) ${R.droppedAnims>1 ? 'were' : 'was'} dropped.`);
  if(R.missingPics) out.push(`${R.missingPics} picture${R.missingPics>1 ? 's' : ''} couldn't be found in the Lessons folder and ${R.missingPics>1 ? 'were' : 'was'} left out.`);
  if(R.missingSlides) out.push(`${R.missingSlides} slide${R.missingSlides>1 ? 's' : ''} from a deck that's no longer in the Lessons folder ${R.missingSlides>1 ? 'are' : 'is'} exported blank.`);
  if(R.otherLook) out.push(`${R.otherLook} slide${R.otherLook>1 ? 's' : ''} from another deck use${R.otherLook>1 ? '' : 's'} this deck's layouts and colours.`);
  return out;
}

/* ---------- off-screen rendering (the slide as the viewer draws it) ---------- */
class Measurer {
  constructor(){
    this.host = document.createElement('div');
    this.host.className = 'svx-host';
    this.host.style.cssText = 'position:fixed;left:-60000px;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:-1;contain:layout style';
    document.body.appendChild(this.host);
  }
  mount(el, w, h){
    this.host.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px`;
    box.appendChild(el); this.host.appendChild(box);
    this.root = el;
    const r = el.getBoundingClientRect(); this.ox = r.left; this.oy = r.top;
  }
  rect(node){ const r = node.getBoundingClientRect(); return { x:r.left - this.ox, y:r.top - this.oy, w:r.width, h:r.height }; }
  obj(oid){ return this.root && this.root.querySelector(`[data-oid="${CSS.escape(oid)}"]`); }
  done(){ this.host.remove(); }
}

/* ---------- text: the viewer's HTML paragraphs → <a:p> ---------- */
const BLOCK = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'flow-root']);
const isBlock = el => BLOCK.has(getComputedStyle(el).display);
function firstFont(ff){ const f = String(ff || '').split(',')[0].trim().replace(/^["']|["']$/g, ''); return f || 'Arial'; }
const px = v => parseFloat(v) || 0;
function decoOf(el, stop){
  let u = false, s = false;
  for(let e = el; e && e!==stop.parentElement; e = e.parentElement){
    const d = getComputedStyle(e).textDecorationLine || '';
    if(d.includes('underline')) u = true; if(d.includes('line-through')) s = true;
    if(e===stop) break;
  }
  return { u, s };
}
function runProps(el, stop){
  const cs = getComputedStyle(el), d = decoOf(el, stop);
  const va = cs.verticalAlign;
  let sz = px(cs.fontSize);
  const base = va==='super' ? 30000 : va==='sub' ? -25000 : 0;
  if(base) sz = sz / 0.65;
  let hl = null;
  for(let e = el; e && e!==stop; e = e.parentElement){ const c = color(getComputedStyle(e).backgroundColor); if(c){ hl = c; break; } }
  const boxTx = el.closest ? el.closest('.pptx-tx') : null; // the text box's own language (set in the editor), if any
  return { sz:Math.max(1, Math.min(4000, Math.round(sz * 100) / 100)), b:(parseInt(cs.fontWeight, 10) || 400) >= 600, i:/italic|oblique/.test(cs.fontStyle), u:d.u, s:d.s,
    color:color(cs.color), font:firstFont(cs.fontFamily), base, hl, sw:px(cs.webkitTextStrokeWidth), sc: px(cs.webkitTextStrokeWidth) ? color(cs.webkitTextStrokeColor) : null, spc:px(cs.letterSpacing) || 0, cap: cs.fontVariantCaps==='small-caps' || cs.fontVariant==='small-caps', op:parseFloat(cs.opacity),
    lang: (boxTx && boxTx.lang) || null };
}
// Editor language code → PowerPoint language tag.
const BCP47 = { fr:'fr-FR', es:'es-ES', en:'en-GB' };
function rPrXml(p, tag){
  tag = tag || 'a:rPr';
  const at = [`lang="${(p.lang && BCP47[p.lang]) || LANG}"`];
  at.push(`sz="${Math.max(100, Math.round(p.sz * 100))}"`);
  if(p.b) at.push('b="1"'); if(p.i) at.push('i="1"');
  if(p.u) at.push('u="sng"'); if(p.s) at.push('strike="sngStrike"');
  if(p.cap) at.push('cap="small"');
  if(p.spc) at.push(`spc="${Math.round(p.spc * 100)}"`);
  if(p.base) at.push(`baseline="${p.base}"`);
  at.push('dirty="0"');
  const f = esc(p.font);
  return `<${tag} ${at.join(' ')}>${p.sw && p.sc ? `<a:ln w="${E(p.sw)}"><a:solidFill>${clr(p.sc)}</a:solidFill></a:ln>` : ''}${p.color ? `<a:solidFill>${clr(p.color)}</a:solidFill>` : ''}${p.hl ? `<a:highlight>${clr(p.hl)}</a:highlight>` : ''}<a:latin typeface="${f}"/><a:cs typeface="${f}"/></${tag}>`;
}
let LANG = 'en-GB';
const sameRun = (a, b) => JSON.stringify(Object.assign({}, a, { t:0 })) === JSON.stringify(Object.assign({}, b, { t:0 }));
// One paragraph element → <a:p>. opts.field: fill [data-field] spans (already filled when rendered).
function paraXml(pEl, stop, opts){
  opts = opts || {};
  const cs = getComputedStyle(pEl);
  const runs = []; let bullet = null, lastProps = null;
  const walk = node=>{
    for(const n of node.childNodes){
      if(n.nodeType===3){
        const t = n.nodeValue.replace(/\u200b/g, '').replace(/\r?\n/g, ' ');
        const el = n.parentElement, p = runProps(el, stop);
        lastProps = p;
        if(!t) continue;
        const prev = runs[runs.length - 1];
        if(prev && !prev.br && sameRun(prev.p, p)) prev.t += t; else runs.push({ t, p });
      } else if(n.nodeType===1){
        if(n.classList.contains('pptx-bu')){
          // v1.88: a circled number / letter (a filled circle in the viewer) goes to PowerPoint as a plain number / letter in the circle's colour.
          const bs = getComputedStyle(n), circ = n.dataset.circ==='1';
          bullet = { ch:n.textContent + (circ && !/[.)]$/.test(n.textContent) ? '.' : ''), font:firstFont(bs.fontFamily), color:color(circ ? bs.backgroundColor : bs.color), circ, w:circ ? px(bs.width) : 0 }; continue;
        }
        if(n.localName==='br'){ runs.push({ br:true, p:runProps(n.parentElement, stop) }); continue; }
        const st = getComputedStyle(n);
        if(st.display==='none' || st.visibility==='hidden') continue;
        walk(n);
      }
    }
  };
  walk(pEl);
  // A <br> at the very end of a block makes no extra line in HTML; in PowerPoint it would.
  if(runs.length && runs[runs.length - 1].br) runs.pop();
  // PowerPoint sizes a line by its largest text, as the viewer does (the paragraph's own font-size can be left over from before an edit).
  const sizes = runs.filter(r=>!r.br).map(r=>r.p.base ? r.p.sz * 0.65 : r.p.sz);
  const fs = sizes.length ? Math.max(...sizes) : (lastProps ? lastProps.sz : px(cs.fontSize) || 18);
  const algn = { left:'l', start:'l', center:'ctr', right:'r', end:'r', justify:'just' }[cs.textAlign] || 'l';
  const ppr = [];
  if(!opts.noAlign) ppr.push(`algn="${algn}"`);
  // When the box itself is the paragraph, its padding is already the text box inset.
  const marL = pEl===stop ? 0 : px(cs.paddingLeft), ind = px(cs.textIndent);
  if(marL || opts.zeroMargins) ppr.push(`marL="${E(marL)}"`);
  if(ind || opts.zeroMargins) ppr.push(`indent="${E(ind)}"`);
  let inner = '';
  const lh = cs.lineHeight;
  if(lh && lh!=='normal' && fs){
    const pct = Math.max(0.3, Math.min(5, px(lh) / (1.2 * fs)));
    inner += `<a:lnSpc><a:spcPct val="${Math.round(pct * 100000)}"/></a:lnSpc>`;
  }
  const mt = px(cs.marginTop), mb = px(cs.marginBottom);
  inner += `<a:spcBef><a:spcPts val="${Math.round(Math.max(0, mt) * 100)}"/></a:spcBef>`;
  inner += `<a:spcAft><a:spcPts val="${Math.round(Math.max(0, mb) * 100)}"/></a:spcAft>`;
  if(bullet && bullet.ch.trim()){
    const ch = bullet.ch.trim();
    const num = /^(\d+)([.)])$/.exec(ch), al = /^([a-z]+)([.)])$/.exec(ch), AL = /^([A-Z]+)([.)])$/.exec(ch);
    if(bullet.color) inner += `<a:buClr>${clr(bullet.color)}</a:buClr>`;
    // Circled numbers / letters: PowerPoint's own filled-circle numbering (1-20), or a circled-letter bullet character, sized like the viewer's circle.
    const circN = bullet.circ && num && +num[1] >= 1 && +num[1] <= 20 ? +num[1] : 0;
    const circL = bullet.circ && AL && AL[1].length===1 ? AL[1].charCodeAt(0) - 65 : -1;
    if(bullet.circ && (circN || circL >= 0) && fs && bullet.w){
      const pct = Math.max(25, Math.min(400, Math.round(bullet.w / fs / 0.95 * 100)));
      if(pct!==100) inner += `<a:buSzPct val="${pct * 1000}"/>`;
    }
    if(circN) inner += `<a:buFont typeface="Segoe UI Symbol"/><a:buAutoNum type="circleNumWdBlackPlain"${circN!==1 ? ` startAt="${circN}"` : ''}/>`;
    else if(circL >= 0) inner += `<a:buFont typeface="Segoe UI Symbol"/><a:buChar char="${String.fromCharCode(0x24B6 + circL)}"/>`;
    else if(num) inner += `<a:buFontTx/><a:buAutoNum type="arabic${num[2]==='.' ? 'Period' : 'ParenR'}"${num[1]!=='1' ? ` startAt="${num[1]}"` : ''}/>`;
    else if(al && /^[ivxlc]+$/.test(al[1]) && al[1].length>1) inner += `<a:buFontTx/><a:buAutoNum type="romanLc${al[2]==='.' ? 'Period' : 'ParenR'}"/>`;
    else if(al && al[1].length===1) inner += `<a:buFontTx/><a:buAutoNum type="alphaLc${al[2]==='.' ? 'Period' : 'ParenR'}"${al[1]!=='a' ? ` startAt="${al[1].charCodeAt(0) - 96}"` : ''}/>`;
    else if(AL && AL[1].length===1) inner += `<a:buFontTx/><a:buAutoNum type="alphaUc${AL[2]==='.' ? 'Period' : 'ParenR'}"${AL[1]!=='A' ? ` startAt="${AL[1].charCodeAt(0) - 64}"` : ''}/>`;
    else inner += `<a:buFont typeface="${esc(bullet.font)}"/><a:buChar char="${esc(ch.slice(0, 2))}"/>`;
  } else inner += '<a:buNone/>';
  let body = '';
  for(const r of runs){
    if(r.br){ body += `<a:br>${rPrXml(r.p)}</a:br>`; continue; }
    body += `<a:r>${rPrXml(r.p)}<a:t>${esc(r.t)}</a:t></a:r>`;
  }
  const endP = lastProps || { sz:fs, font:firstFont(cs.fontFamily), color:color(cs.color) };
  return `<a:p><a:pPr ${ppr.join(' ')}>${inner}</a:pPr>${body}${rPrXml(endP, 'a:endParaRPr')}</a:p>`;
}
// A text box element (.pptx-tx, or any element) → its paragraphs.
function domParas(box, opts){
  const blocks = [...box.children].filter(c=>!c.classList.contains('pptx-bu') && c.localName!=='svg' && isBlock(c) && getComputedStyle(c).display!=='none');
  if(!blocks.length) return [paraXml(box, box, opts)];
  return blocks.map(b=>paraXml(b, box, opts));
}
// <a:bodyPr> from the box's padding / alignment.
function bodyPrXml(box, opts){
  opts = opts || {};
  const cs = getComputedStyle(box);
  const jc = cs.justifyContent, ai = cs.alignItems;
  const flexCol = cs.display.includes('flex') && cs.flexDirection.startsWith('column');
  let anchor = 't';
  if(flexCol){ if(jc==='center') anchor = 'ctr'; else if(jc==='flex-end' || jc==='end') anchor = 'b'; }
  else if(cs.display.includes('flex')){ if(ai==='center') anchor = 'ctr'; else if(ai==='flex-end' || ai==='end') anchor = 'b'; }
  else if(cs.display.includes('grid') && (cs.alignContent==='center' || ai==='center')) anchor = 'ctr';
  if(opts.anchor) anchor = opts.anchor;
  const wrap = cs.whiteSpace==='pre' || cs.whiteSpace==='nowrap' ? 'none' : 'square';
  const fit = opts.fit ? '<a:normAutofit/>' : '<a:noAutofit/>';
  return `<a:bodyPr wrap="${wrap}" lIns="${E(px(cs.paddingLeft))}" tIns="${E(px(cs.paddingTop))}" rIns="${E(px(cs.paddingRight))}" bIns="${E(px(cs.paddingBottom))}" rtlCol="0" anchor="${anchor}">${fit}</a:bodyPr>`;
}
function txBodyXml(box, tag, opts){
  tag = tag || 'p:txBody';
  return `<${tag}>${bodyPrXml(box, opts)}<a:lstStyle/>${domParas(box, opts).join('')}</${tag}>`;
}

/* ---------- SVG geometry → custGeom ---------- */
// Parse an SVG path "d" into absolute M / L / C / Z commands (arcs and quadratics become cubics).
function pathCmds(d){
  const toks = String(d || '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  const out = []; let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const n = ()=>parseFloat(toks[i++]);
  const isNum = ()=>i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  while(i < toks.length){
    if(/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    else if(!cmd) { i++; continue; }
    const rel = cmd===cmd.toLowerCase(), C = cmd.toUpperCase();
    if(C==='Z'){ out.push(['Z']); x = sx; y = sy; lc = lq = null; continue; }
    if(!isNum()) continue;
    if(C==='M'){ let nx = n(), ny = n(); if(rel){ nx += x; ny += y; } x = sx = nx; y = sy = ny; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if(C==='L'){ let nx = n(), ny = n(); if(rel){ nx += x; ny += y; } x = nx; y = ny; out.push(['L', x, y]); lc = lq = null; continue; }
    if(C==='H'){ let nx = n(); if(rel) nx += x; x = nx; out.push(['L', x, y]); lc = lq = null; continue; }
    if(C==='V'){ let ny = n(); if(rel) ny += y; y = ny; out.push(['L', x, y]); lc = lq = null; continue; }
    if(C==='C' || C==='S'){
      let x1, y1;
      if(C==='C'){ x1 = n(); y1 = n(); if(rel){ x1 += x; y1 += y; } }
      else { x1 = lc ? 2*x - lc[0] : x; y1 = lc ? 2*y - lc[1] : y; }
      let x2 = n(), y2 = n(), ex = n(), ey = n();
      if(rel){ x2 += x; y2 += y; ex += x; ey += y; }
      out.push(['C', x1, y1, x2, y2, ex, ey]); lc = [x2, y2]; lq = null; x = ex; y = ey; continue;
    }
    if(C==='Q' || C==='T'){
      let qx, qy;
      if(C==='Q'){ qx = n(); qy = n(); if(rel){ qx += x; qy += y; } }
      else { qx = lq ? 2*x - lq[0] : x; qy = lq ? 2*y - lq[1] : y; }
      let ex = n(), ey = n(); if(rel){ ex += x; ey += y; }
      out.push(['C', x + 2/3*(qx - x), y + 2/3*(qy - y), ex + 2/3*(qx - ex), ey + 2/3*(qy - ey), ex, ey]);
      lq = [qx, qy]; lc = null; x = ex; y = ey; continue;
    }
    if(C==='A'){
      const rx = n(), ry = n(), rot = n(), la = n(), sw = n(); let ex = n(), ey = n();
      if(rel){ ex += x; ey += y; }
      for(const c of arcToCubics(x, y, rx, ry, rot, la, sw, ex, ey)) out.push(c);
      x = ex; y = ey; lc = lq = null; continue;
    }
    i++; // unknown
  }
  return out;
}
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2){
  if(rx===0 || ry===0 || (x1===x2 && y1===y2)) return [['L', x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (x1 - x2)/2, dy = (y1 - y2)/2;
  const x1p = cp*dx + sp*dy, y1p = -sp*dx + cp*dy;
  let l = x1p*x1p/(rx*rx) + y1p*y1p/(ry*ry);
  if(l > 1){ const s = Math.sqrt(l); rx *= s; ry *= s; }
  const sign = fa===fs ? -1 : 1;
  const num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p, den = rx*rx*y1p*y1p + ry*ry*x1p*x1p;
  const co = sign * Math.sqrt(Math.max(0, num/den));
  const cxp = co * rx*y1p/ry, cyp = co * -ry*x1p/rx;
  const cx = cp*cxp - sp*cyp + (x1 + x2)/2, cy = sp*cxp + cp*cyp + (y1 + y2)/2;
  const ang = (ux, uy, vx, vy)=>{ const a = Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy); return a; };
  let t1 = ang(1, 0, (x1p - cxp)/rx, (y1p - cyp)/ry);
  let dt = ang((x1p - cxp)/rx, (y1p - cyp)/ry, (-x1p - cxp)/rx, (-y1p - cyp)/ry);
  if(!fs && dt > 0) dt -= 2*Math.PI; else if(fs && dt < 0) dt += 2*Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI/2))), d = dt/segs, k = 4/3*Math.tan(d/4);
  const out = [];
  const pt = (t)=>[cx + rx*Math.cos(t)*cp - ry*Math.sin(t)*sp, cy + rx*Math.cos(t)*sp + ry*Math.sin(t)*cp];
  const dv = (t)=>[-rx*Math.sin(t)*cp - ry*Math.cos(t)*sp, -rx*Math.sin(t)*sp + ry*Math.cos(t)*cp];
  for(let s = 0; s < segs; s++){
    const a = t1 + s*d, b = a + d, p0 = pt(a), p3 = pt(b), d0 = dv(a), d3 = dv(b);
    out.push(['C', p0[0] + k*d0[0], p0[1] + k*d0[1], p3[0] - k*d3[0], p3[1] - k*d3[1], p3[0], p3[1]]);
  }
  return out;
}
// Path commands of any SVG shape element, in its own user units.
function shapeCmds(el){
  const g = n => parseFloat(el.getAttribute(n)) || 0;
  switch(el.localName){
    case 'path': return pathCmds(el.getAttribute('d'));
    case 'rect': {
      const x = g('x'), y = g('y'), w = g('width'), h = g('height');
      let rx = parseFloat(el.getAttribute('rx')), ry = parseFloat(el.getAttribute('ry'));
      if(isNaN(rx)) rx = isNaN(ry) ? 0 : ry; if(isNaN(ry)) ry = rx;
      rx = Math.min(rx, w/2); ry = Math.min(ry, h/2);
      if(!rx) return pathCmds(`M${x},${y} H${x+w} V${y+h} H${x} Z`);
      return pathCmds(`M${x+rx},${y} H${x+w-rx} A${rx},${ry} 0 0 1 ${x+w},${y+ry} V${y+h-ry} A${rx},${ry} 0 0 1 ${x+w-rx},${y+h} H${x+rx} A${rx},${ry} 0 0 1 ${x},${y+h-ry} V${y+ry} A${rx},${ry} 0 0 1 ${x+rx},${y} Z`);
    }
    case 'circle': { const cx = g('cx'), cy = g('cy'), r = g('r'); return pathCmds(`M${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} A${r},${r} 0 1 1 ${cx-r},${cy} Z`); }
    case 'ellipse': { const cx = g('cx'), cy = g('cy'), rx = g('rx'), ry = g('ry'); return pathCmds(`M${cx-rx},${cy} A${rx},${ry} 0 1 1 ${cx+rx},${cy} A${rx},${ry} 0 1 1 ${cx-rx},${cy} Z`); }
    case 'line': return [['M', g('x1'), g('y1')], ['L', g('x2'), g('y2')]];
    case 'polyline': case 'polygon': {
      const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      const out = []; for(let i = 0; i + 1 < v.length; i += 2) out.push([i ? 'L' : 'M', v[i], v[i+1]]);
      if(el.localName==='polygon') out.push(['Z']);
      return out;
    }
  }
  return [];
}
// Commands → slide coordinates through the element's screen matrix; then a custGeom relative to the box.
function geomFrom(cmds, el, M){
  const m = el.getScreenCTM(); if(!m) return null;
  const T = (x, y)=>[m.a*x + m.c*y + m.e - M.ox, m.b*x + m.d*y + m.f - M.oy];
  const pts = [], cm = [];
  for(const c of cmds){
    if(c[0]==='Z'){ cm.push(['Z']); continue; }
    const q = [];
    for(let i = 1; i < c.length; i += 2){ const p = T(c[i], c[i+1]); q.push(p); pts.push(p); }
    cm.push([c[0], q]);
  }
  if(!pts.length) return null;
  const x1 = Math.min(...pts.map(p=>p[0])), y1 = Math.min(...pts.map(p=>p[1])), x2 = Math.max(...pts.map(p=>p[0])), y2 = Math.max(...pts.map(p=>p[1]));
  const box = { x:x1, y:y1, w:Math.max(x2 - x1, 0.05), h:Math.max(y2 - y1, 0.05) };
  const scale = Math.sqrt(Math.abs(m.a*m.d - m.b*m.c)) || 1;
  return { box, cm, scale };
}
function custGeomXml(g, open){
  const W = EP(g.box.w) || 1, H = EP(g.box.h) || 1;
  const P = p => `<a:pt x="${Math.round((p[0] - g.box.x) * EMU)}" y="${Math.round((p[1] - g.box.y) * EMU)}"/>`;
  let s = '';
  for(const c of g.cm){
    if(c[0]==='Z') s += '<a:close/>';
    else if(c[0]==='M') s += `<a:moveTo>${P(c[1][0])}</a:moveTo>`;
    else if(c[0]==='L') s += `<a:lnTo>${P(c[1][0])}</a:lnTo>`;
    else if(c[0]==='C') s += `<a:cubicBezTo>${c[1].map(P).join('')}</a:cubicBezTo>`;
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${W}" h="${H}"${open ? ' fill="none"' : ''}>${s}</a:path></a:pathLst></a:custGeom>`;
}

/* ---------- builder for one slide's new shapes ---------- */
class Shapes {
  constructor(pkg, slidePath, rels, nextId, R){ this.pkg = pkg; this.path = slidePath; this.rels = rels; this.id = nextId; this.R = R; this.pics = new Map(); }
  nid(){ return this.id++; }
  // Picture bytes → relationship id (shared per URL on the slide). SVG gets a PNG fallback.
  async picRel(url, w, h){
    if(this.pics.has(url)) return this.pics.get(url);
    const p = (async()=>{
      const blob = await (await fetch(url)).blob();
      let type = blob.type || '';
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if(!type){ const head = new TextDecoder().decode(bytes.slice(0, 200)); if(/<svg/i.test(head)) type = 'image/svg+xml'; }
      if(type==='image/svg+xml'){
        const png = await rasterise(url, w, h);
        const pngP = this.pkg.addMedia(png, 'png'), svgP = this.pkg.addMedia(bytes, 'svg');
        this.rels.dirty = true;
        return { png:this.pkg.addRel(this.rels, REL('image'), pngP), svg:this.pkg.addRel(this.rels, REL('image'), svgP) };
      }
      const ext = { 'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/bmp':'bmp', 'image/webp':'png' }[type] || 'png';
      let data = bytes;
      if(type==='image/webp') data = await rasterise(url, w, h, true);
      const mp = this.pkg.addMedia(data, ext);
      this.rels.dirty = true;
      return { png:this.pkg.addRel(this.rels, REL('image'), mp) };
    })();
    this.pics.set(url, p);
    return p;
  }
  blipXml(r){ return `<a:blip r:embed="${r.png}">${r.svg ? `<a:extLst><a:ext uri="${SVG_EXT}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${r.svg}"/></a:ext></a:extLst>` : ''}</a:blip>`; }
  sp(o){
    // o: { id, name, box (xfrm r), geom (prst name | custGeom xml), fill, ln, tx (txBody xml), txBox }
    const geom = o.cust || `<a:prstGeom prst="${o.prst || 'rect'}"><a:avLst>${o.av || ''}</a:avLst></a:prstGeom>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${o.id}" name="${esc(o.name)}"/><p:cNvSpPr${o.txBox ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(o.box)}${geom}${o.fill || '<a:noFill/>'}${o.ln || '<a:ln><a:noFill/></a:ln>'}</p:spPr>${o.tx || ''}</p:sp>`;
  }
  async pic(id, name, url, box, crop, ln){
    const r = await this.picRel(url, box.w, box.h);
    const src = crop ? `<a:srcRect${['l','t','r','b'].map(k=>crop[k] ? ` ${k}="${Math.round(crop[k])}"` : '').join('')}/>` : '';
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill>${this.blipXml(r)}${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${ln || ''}</p:spPr></p:pic>`;
  }
  group(id, name, parts, box){
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrmXml(box, 'a:xfrm', `<a:chOff x="${E(box.x)}" y="${E(box.y)}"/><a:chExt cx="${EP(box.w)}" cy="${EP(box.h)}"/>`)}</p:grpSpPr>${parts.join('')}</p:grpSp>`;
  }
}
function rasterise(url, w, h, keepSize){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>{
      const k = keepSize ? 1 : Math.max(2, Math.min(4, 1600 / Math.max(w || 1, h || 1)));
      const cw = Math.max(1, Math.round((keepSize ? img.naturalWidth : (w || img.naturalWidth || 100) * k))), ch = Math.max(1, Math.round((keepSize ? img.naturalHeight : (h || img.naturalHeight || 100) * k)));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      c.toBlob(b=>b ? b.arrayBuffer().then(a=>res(new Uint8Array(a))) : rej(new Error('PNG failed')), 'image/png');
    };
    img.onerror = ()=>rej(new Error('Picture failed to load'));
    img.src = url;
  });
}
const unionBox = list => {
  list = list.filter(Boolean); if(!list.length) return null;
  const x1 = Math.min(...list.map(r=>r.x)), y1 = Math.min(...list.map(r=>r.y)), x2 = Math.max(...list.map(r=>r.x + r.w)), y2 = Math.max(...list.map(r=>r.y + r.h));
  return { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
};

/* ---------- general HTML / SVG → shapes (copied objects, activities) ---------- */
// Returns [{ xml, box }] in slide coordinates. root: the element to convert.
async function domShapes(root, M, S, opts){
  opts = opts || {};
  const out = [];
  const visible = el => { const cs = getComputedStyle(el); return cs.display!=='none' && cs.visibility!=='hidden' && parseFloat(cs.opacity) > 0.01; };
  const alphaOf = el => { let a = 1; for(let e = el; e && e!==root.parentElement; e = e.parentElement) a *= parseFloat(getComputedStyle(e).opacity) || 1; return a; };
  const svgPaint = (el, prop, svg)=>{
    const cs = getComputedStyle(el), v = cs[prop];
    if(!v || v==='none') return null;
    const u = /url\(["']?#([^"')]+)["']?\)/.exec(v);
    if(u){
      const g = svg.querySelector('#' + CSS.escape(u[1]));
      if(!g) return null;
      if(g.localName==='linearGradient' || g.localName==='radialGradient'){
        const stops = [...g.querySelectorAll('stop')].map(s=>({ pos:Math.max(0, Math.min(100, parseFloat(s.getAttribute('offset')) * (String(s.getAttribute('offset')).includes('%') ? 1 : 100) || 0)), c:color(s.getAttribute('stop-color') || getComputedStyle(s).stopColor), a:parseFloat(s.getAttribute('stop-opacity') || '1') }));
        const gs = stops.filter(s=>s.c).map(s=>`<a:gs pos="${Math.round(s.pos * 1000)}">${clr(s.c, s.a)}</a:gs>`).join('');
        if(!gs) return null;
        if(g.localName==='radialGradient') return { xml:`<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>` };
        const f = n => parseFloat(g.getAttribute(n));
        const x1 = isNaN(f('x1')) ? 0 : f('x1'), y1 = isNaN(f('y1')) ? 0 : f('y1'), x2 = isNaN(f('x2')) ? 1 : f('x2'), y2 = isNaN(f('y2')) ? 0 : f('y2');
        const ang = ((Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 360) % 360;
        return { xml:`<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${Math.round(ang * 60000)}" scaled="0"/></a:gradFill>` };
      }
      if(g.localName==='pattern'){ const im = g.querySelector('image'); const href = im && (im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href')); if(href) return { img:href }; }
      return null;
    }
    const c = color(v); if(!c) return null;
    const op = parseFloat(cs[prop==='fill' ? 'fillOpacity' : 'strokeOpacity']);
    return { xml:`<a:solidFill>${clr(c, (isNaN(op) ? 1 : op) * alphaOf(el))}</a:solidFill>` };
  };
  const svgShape = async (el, svg)=>{
    const cmds = shapeCmds(el); if(!cmds.length) return;
    const g = geomFrom(cmds, el, M); if(!g) return;
    const open = !cmds.some(c=>c[0]==='Z') && (el.localName==='path' || el.localName==='line' || el.localName==='polyline');
    let fill = open ? null : svgPaint(el, 'fill', svg);
    const stroke = svgPaint(el, 'stroke', svg);
    const sw = (parseFloat(getComputedStyle(el).strokeWidth) || 1) * g.scale;
    if(!fill && !stroke) return;
    let fillXml = '<a:noFill/>';
    if(fill && fill.xml) fillXml = fill.xml;
    else if(fill && fill.img){ try{ const r = await S.picRel(fill.img, g.box.w, g.box.h); fillXml = `<a:blipFill rotWithShape="1">${S.blipXml(r)}<a:stretch><a:fillRect/></a:stretch></a:blipFill>`; }catch(e){ S.R.missingPics++; } }
    const ends = (el.getAttribute('marker-start') ? '<a:headEnd type="triangle"/>' : '') + (el.getAttribute('marker-end') ? '<a:tailEnd type="triangle"/>' : '');
    const da = getComputedStyle(el).strokeDasharray;
    const dash = da && da!=='none' ? (parseFloat(da) <= sw * 1.5 ? 'dot' : 'dash') : null;
    const ln = stroke && stroke.xml ? `<a:ln w="${E(sw)}">${stroke.xml}${DASH[dash] ? `<a:prstDash val="${DASH[dash]}"/>` : ''}<a:round/>${ends}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
    out.push({ box:g.box, xml:S.sp({ id:S.nid(), name:'Shape', box:g.box, cust:custGeomXml(g, open), fill:fillXml, ln }) });
  };
  const imgEl = async (el, url)=>{
    if(!url){ S.R.missingPics++; return; }
    let r = M.rect(el);
    if(r.w < 0.5 || r.h < 0.5) return;
    // Cropped by a parent with overflow hidden (pictures with PowerPoint cropping).
    let clip = null;
    for(let e = el.parentElement; e && e!==root.parentElement; e = e.parentElement){ if(getComputedStyle(e).overflow!=='visible'){ clip = M.rect(e); break; } }
    let crop = null, box = r;
    if(clip){
      const x1 = Math.max(r.x, clip.x), y1 = Math.max(r.y, clip.y), x2 = Math.min(r.x + r.w, clip.x + clip.w), y2 = Math.min(r.y + r.h, clip.y + clip.h);
      if(x2 <= x1 || y2 <= y1) return;
      if(x1 > r.x + 0.5 || y1 > r.y + 0.5 || x2 < r.x + r.w - 0.5 || y2 < r.y + r.h - 0.5){
        crop = { l:(x1 - r.x)/r.w*100000, t:(y1 - r.y)/r.h*100000, r:(r.x + r.w - x2)/r.w*100000, b:(r.y + r.h - y2)/r.h*100000 };
        box = { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
      }
    }
    try{ out.push({ box, xml:await S.pic(S.nid(), 'Picture', url, box, crop) }); }catch(e){ console.warn('Export: picture', e); S.R.missingPics++; }
  };
  const boxShape = (el, tx)=>{
    const cs = getComputedStyle(el), r = M.rect(el);
    if(r.w < 0.3 || r.h < 0.3) return false;
    const bg = color(cs.backgroundColor);
    const bw = px(cs.borderTopWidth), bc = cs.borderTopStyle!=='none' && bw > 0 ? color(cs.borderTopColor) : null;
    if(!bg && !bc && !tx) return false;
    const rad = px(cs.borderTopLeftRadius);
    const prst = rad > 0.5 ? (rad >= Math.min(r.w, r.h)/2 - 0.5 && Math.abs(r.w - r.h) < 1 ? 'ellipse' : 'roundRect') : 'rect';
    const av = prst==='roundRect' ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(50000, rad / Math.min(r.w, r.h) * 100000))}"/>` : '';
    const a = alphaOf(el);
    out.push({ box:r, xml:S.sp({ id:S.nid(), name: tx ? 'Text' : 'Box', box:r, prst, av, txBox: !bg && !bc,
      fill: bg ? `<a:solidFill>${clr(bg, a)}</a:solidFill>` : '<a:noFill/>',
      ln: bc ? `<a:ln w="${E(bw)}"><a:solidFill>${clr(bc, a)}</a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>', tx:tx || '' }) });
    return true;
  };
  const hasText = el => /\S/.test((el.textContent || '').replace(/\u200b/g, ''));
  const inlineOnly = el => [...el.querySelectorAll('*')].every(c=>{ if(c.localName==='svg' || c.localName==='img' || c.closest('svg')) return false; const d = getComputedStyle(c).display; return d==='inline' || d==='none' || d==='contents' || c.localName==='br'; });
  const walk = async el=>{
    if(!(el instanceof Element) || !visible(el)) return;
    if(opts.skip && opts.skip(el)) return;
    if(el.localName==='svg'){
      for(const s of el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')){
        if(s.closest('defs, marker, pattern, clipPath, mask, symbol')) continue;
        if(!visible(s)) continue;
        await svgShape(s, el);
      }
      for(const im of el.querySelectorAll('image')){
        if(im.closest('defs, pattern')) continue;
        await imgEl(im, im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
      }
      return;
    }
    if(el.localName==='img'){ await imgEl(el, el.currentSrc || el.getAttribute('src')); return; }
    if(el.localName==='canvas'){ try{ const u = el.toDataURL('image/png'); await imgEl(el, u); }catch(e){} return; }
    if(el.localName==='video' || el.localName==='iframe' || el.localName==='button' || el.localName==='input' || el.localName==='textarea') return;
    if(el.classList.contains('pptx-tx')){
      if(hasText(el)){ const r = M.rect(el); out.push({ box:r, xml:S.sp({ id:S.nid(), name:'Text', box:r, txBox:true, tx:txBodyXml(el, 'p:txBody', { fit:!!el.dataset.autofit }) }) }); }
      return;
    }
    if(hasText(el) && inlineOnly(el)){
      boxShape(el, txBodyXml(el, 'p:txBody', { anchor: centredText(el) ? 'ctr' : null }));
      return;
    }
    boxShape(el, null);
    // Text sitting directly in a box that also holds blocks: a text box where the text is.
    for(const n of el.childNodes){
      if(n.nodeType!==3 || !/\S/.test(n.nodeValue.replace(/\u200b/g, ''))) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const b = rg.getBoundingClientRect(), r = { x:b.left - M.ox - 2, y:b.top - M.oy, w:b.width + 4, h:b.height };
      const p = runProps(el, el);
      const t = esc(n.nodeValue.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim());
      out.push({ box:r, xml:S.sp({ id:S.nid(), name:'Text', box:r, txBox:true, tx:`<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r>${rPrXml(p)}<a:t>${t}</a:t></a:r></a:p></p:txBody>` }) });
    }
    for(const c of el.children) await walk(c);
  };
  await walk(root);
  return out;
}
function centredText(el){
  const cs = getComputedStyle(el);
  if(cs.display.includes('flex') || cs.display.includes('grid')) return cs.alignItems==='center' || cs.alignContent==='center' || cs.justifyContent==='center';
  return cs.verticalAlign==='middle' || Math.abs(px(cs.lineHeight) - M_h(el)) < 2;
}
function M_h(el){ return el.getBoundingClientRect().height; }
/* ---------- objects added in the editor ---------- */
const PRESETS = { rect:'rect', roundRect:'roundRect', ellipse:'ellipse', triangle:'triangle', diamond:'diamond', star5:'star5', rightArrow:'rightArrow' };
const NAMES = { frame:'Picture', text:'Text box', shape:'Shape', line:'Line', pic:'Picture', table:'Table', copy:'Copied object' };
function addedKind(a){ return a.frame ? 'frame' : a.table ? 'table' : a.pic ? 'pic' : a.shape ? (PPTX.SHAPES[a.shape] && PPTX.SHAPES[a.shape].line ? 'line' : 'shape') : a.art!=null ? 'copy' : 'text'; }
const colOr = (v, d) => v==null || v==='' ? d : v;
// A picture's own size (for cropping a picture frame). The <img> may not have loaded yet.
function natSize(img, url){
  if(img && img.naturalWidth) return Promise.resolve({ w:img.naturalWidth, h:img.naturalHeight });
  return new Promise(res=>{ const im = new Image(); im.onload = ()=>res(im.naturalWidth ? { w:im.naturalWidth, h:im.naturalHeight } : null); im.onerror = ()=>res(null); im.src = url; });
}
async function addedXml(a, el, M, S, id){
  const kind = addedKind(a);
  const box = { x:a.x, y:a.y, w:Math.max(a.w, 0), h:Math.max(a.h, 0), rot:a.rot || 0 };
  const name = `${NAMES[kind]} ${id}`;
  const tx = el && el.querySelector(':scope > .pptx-tx');
  if(kind==='text'){
    const fill = a.fill && a.fill!=='none' ? solid(a.fill) : '<a:noFill/>';
    const ln = a.line && a.line!=='none' ? lnXml(a.line, a.lw!=null ? a.lw : 1.5, a.dash) : '<a:ln><a:noFill/></a:ln>';
    return S.sp({ id, name, box, txBox:true, fill, ln, tx: tx ? txBodyXml(tx, 'p:txBody', { fit:!!tx.dataset.autofit }) : '' });
  }
  if(kind==='shape'){
    const fill = solid(colOr(a.fill, '#4472C4')), ln = lnXml(colOr(a.line, '#2F528F'), a.lw!=null ? a.lw : 1.5, a.dash);
    const t = tx ? txBodyXml(tx, 'p:txBody', { anchor:'ctr' }) : '';
    let prst = PRESETS[a.shape], cust = null;
    if(a.shape==='speech') prst = 'wedgeRoundRectCallout';
    if(!prst){
      // Tick, cross: the viewer's own outline, measured unrotated (the rotation goes in the xfrm; flips are in the outline).
      const p = el && el.querySelector(':scope > svg path');
      let g = null;
      if(p){ const saved = el.style.transform; el.style.transform = 'none'; try{ g = geomFrom(shapeCmds(p), p, M); }finally{ el.style.transform = saved; } }
      if(g) cust = custGeomXml({ box:{ x:a.x, y:a.y, w:box.w, h:box.h }, cm:g.cm }, false);
      else prst = 'rect';
    } else { box.flipH = !!a.flipH; box.flipV = !!a.flipV; }
    return S.sp({ id, name, box, prst, cust, av: prst==='wedgeRoundRectCallout' ? '<a:gd name="adj1" fmla="val -28000"/><a:gd name="adj2" fmla="val 78000"/><a:gd name="adj3" fmla="val 16667"/>' : '', fill, ln, tx:t });
  }
  if(kind==='line'){
    const lw = a.lw!=null ? a.lw : 4;
    const ln = lnXml(colOr(a.line, '#111114'), lw, a.dash, a.shape==='arrow' ? '<a:tailEnd type="triangle"/>' : '');
    box.flipH = !!a.flipH; box.flipV = !!a.flipV;
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrmXml(box)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
  }
  if(kind==='pic'){
    const img = el && el.querySelector('img');
    const url = img && (img.currentSrc || img.getAttribute('src'));
    if(!url){ S.R.missingPics++; return null; }
    const ln = a.line && a.line!=='none' && a.lw ? lnXml(a.line, a.lw) : '';
    const cr = PPTX.cropOf(a.crop); // v1.80: the visible part of the picture
    return S.pic(id, name, url, box, cr ? { l:cr.l*100000, t:cr.t*100000, r:cr.r*100000, b:cr.b*100000 } : null, ln);
  }
  if(kind==='frame'){ // v1.73: a filled picture frame is a cropped picture (empty frames are skipped before this)
    const img = el && el.querySelector('img');
    const url = img && (img.currentSrc || img.getAttribute('src'));
    if(!url){ S.R.missingPics++; return null; }
    const nat = await natSize(img, url);
    let crop = null;
    if(nat && box.w > 0 && box.h > 0){
      // v1.80: the cropped part of the picture (a.frame.crop) is what fills the frame; without a crop, c0 is the whole picture.
      const c0 = PPTX.cropOf(a.frame && a.frame.crop) || { l:0, t:0, r:0, b:0 };
      const fw = 1 - c0.l - c0.r, fh = 1 - c0.t - c0.b, rw = nat.w*fw, rh = nat.h*fh;
      const f = PPTX.frameFocus(a), k = Math.max(box.w/rw, box.h/rh), dw = rw*k, dh = rh*k;
      const ox = Math.max(0, dw - box.w), oy = Math.max(0, dh - box.h);
      const x0 = c0.l + fw*ox*f.fx/dw, y0 = c0.t + fh*oy*f.fy/dh; // where the visible part starts, as a fraction of the whole picture
      const vw = fw*box.w/dw, vh = fh*box.h/dh;
      crop = { l:x0*100000, t:y0*100000, r:(1 - x0 - vw)*100000, b:(1 - y0 - vh)*100000 };
    }
    const ln = a.line && a.line!=='none' && a.lw ? lnXml(a.line, a.lw) : '';
    return S.pic(id, name, url, box, crop, ln);
  }
  if(kind==='table') return tableXml(a, el, S, id, name);
  // copy: convert what the viewer draws, unrotated, then rotate the group.
  if(!el) return null;
  const saved = el.style.transform; el.style.transform = 'none';
  let parts;
  try{ parts = await domShapes(el, M, S); }
  finally{ el.style.transform = saved; }
  if(!parts.length) return null;
  if(parts.length===1 && !a.rot){
    // Re-number the single shape to the object's id.
    return parts[0].xml.replace(/<p:cNvPr id="\d+"/, `<p:cNvPr id="${id}"`).replace(/name="(Shape|Text|Box|Picture)"/, `name="${esc(name)}"`);
  }
  const ub = { x:box.x, y:box.y, w:box.w, h:box.h, rot:box.rot };
  const inner = unionBox(parts.map(p=>p.box));
  return S.group(id, name, parts.map(p=>p.xml), Object.assign({}, inner, { rot:ub.rot }));
}
function tableXml(a, el, S, id, name){
  const t = a.table, norm = f => { const s = f.reduce((n, v)=>n + v, 0) || 1; return f.map(v=>v/s); };
  const cw = norm(t.cols), rh = norm(t.rows);
  const fill = colOr(a.fill, PPTX.TABLE_DEFAULT.fill), head = typeof t.head==='string' ? t.head : PPTX.HEAD_FILL;
  const line = colOr(a.line, PPTX.TABLE_DEFAULT.line), lw = a.lw!=null ? a.lw : PPTX.TABLE_DEFAULT.lw;
  const lnc = color(line);
  const edge = tag => lnc && lw > 0 ? `<${tag} w="${E(lw)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>${clr(lnc)}</a:solidFill><a:prstDash val="${({ dash:'dash', dot:'sysDot' })[a.dash] || 'solid'}"/><a:round/></${tag}>` : `<${tag} w="12700"><a:noFill/></${tag}>`;
  const AN = { t:'t', m:'ctr', b:'b' };
  // Merged cells (v1.70): gridSpan / rowSpan on the top-left cell; the cells it covers stay in the XML with hMerge / vMerge.
  const sp = PPTX.tableSpans(t);
  let rows = '';
  for(let r = 0; r < rh.length; r++){
    let cells = '';
    for(let c = 0; c < cw.length; c++){
      const o = sp.own[r][c], s = sp.span[r][c];
      if(!s){
        const oc = (t.cells[o[0]] || [])[o[1]] || {}, of = oc.fill || (t.head && o[0]===0 ? head : fill);
        cells += `<a:tc${c > o[1] ? ' hMerge="1"' : ''}${r > o[0] ? ' vMerge="1"' : ''}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-GB" dirty="0"/></a:p></a:txBody><a:tcPr marL="${E(7.2)}" marR="${E(7.2)}" marT="${E(3.6)}" marB="${E(3.6)}" anchor="${AN[oc.va || t.va] || 'ctr'}">${edge('a:lnL')}${edge('a:lnR')}${edge('a:lnT')}${edge('a:lnB')}${solid(of)}</a:tcPr></a:tc>`;
        continue;
      }
      const cell = (t.cells[r] || [])[c] || {};
      const cel = el && el.querySelector(`[data-oid="n${a.id}.${r}.${c}"] > .pptx-tx`);
      const paras = cel ? domParas(cel) : ['<a:p><a:endParaRPr lang="en-GB" dirty="0"/></a:p>'];
      const f = cell.fill || (t.head && r===0 ? head : fill);
      cells += `<a:tc${s[1] > 1 ? ` gridSpan="${s[1]}"` : ''}${s[0] > 1 ? ` rowSpan="${s[0]}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${paras.join('')}</a:txBody><a:tcPr marL="${E(7.2)}" marR="${E(7.2)}" marT="${E(3.6)}" marB="${E(3.6)}" anchor="${AN[cell.va || t.va] || 'ctr'}">${edge('a:lnL')}${edge('a:lnR')}${edge('a:lnT')}${edge('a:lnB')}${solid(f)}</a:tcPr></a:tc>`;
    }
    rows += `<a:tr h="${EP(rh[r] * a.h)}">${cells}</a:tr>`;
  }
  const grid = cw.map(f=>`<a:gridCol w="${EP(f * a.w)}"/>`).join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${xfrmXml({ x:a.x, y:a.y, w:a.w, h:a.h }, 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

/* ---------- click animations ---------- */
function timingXml(steps, nodeKind){
  // steps: [{ cls:'entr'|'exit', ids:[spid] }]
  let n = 2; const id = ()=>++n;
  const bld = [];
  const clicks = steps.map(st=>{
    const outer = id(), inner = id(); // cTn ids in document order, as PowerPoint writes them
    const effects = st.ids.map((spid, j)=>{
      const vis = st.cls==='entr' ? 'visible' : 'hidden';
      const kd = nodeKind(spid);
      if((kd==='sp' || kd==='graphicFrame') && !bld.some(b=>b.id===spid)) bld.push({ id:spid, kd });
      return `<p:par><p:cTn id="${id()}" presetID="1" presetClass="${st.cls}" presetSubtype="0" fill="hold" grpId="0" nodeType="${j===0 ? 'clickEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${id()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${vis}"/></p:to></p:set></p:childTnLst></p:cTn></p:par>`;
    }).join('');
    return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld.length ? `<p:bldLst>${bld.map(b=>b.kd==='sp' ? `<p:bldP spid="${b.id}" grpId="0" animBg="1"/>` : `<p:bldGraphic spid="${b.id}" grpId="0"><p:bldAsOne/></p:bldGraphic>`).join('')}</p:bldLst>` : ''}</p:timing>`;
}

/* ---------- slide parts ---------- */
const OBJ = new Set(['sp', 'cxnSp', 'pic', 'grpSp', 'graphicFrame', 'contentPart']);
// Top-level objects of spTree: [{ node (to move / remove), inner:[elements], id }]
function topObjects(tree){
  const out = [];
  for(const n of kids(tree)){
    let inner = [n];
    if(n.localName==='AlternateContent') inner = kids(n).map(c=>c.firstElementChild).filter(Boolean);
    if(!inner.length || !OBJ.has(inner[0].localName)) continue;
    const nv = desc(inner[0], 'cNvPr');
    out.push({ node:n, inner, id: nv ? nv.getAttribute('id') : null });
  }
  return out;
}
function maxShapeId(doc){ let m = 1; for(const e of descAll(doc.documentElement, 'cNvPr')) m = Math.max(m, parseInt(e.getAttribute('id'), 10) || 0); return m; }
function setXfrm(doc, node, g){
  const ln = node.localName;
  let x;
  if(ln==='graphicFrame'){ x = kid(node, 'xfrm'); if(!x){ x = frag(doc, '<p:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></p:xfrm>')[0]; node.insertBefore(x, kid(node, 'graphic')); } }
  else {
    const prName = ln==='grpSp' ? 'grpSpPr' : 'spPr';
    let pr = kid(node, prName);
    if(!pr){ pr = frag(doc, `<p:${prName}/>`)[0]; const nv = node.firstElementChild; node.insertBefore(pr, nv ? nv.nextSibling : null); }
    x = kid(pr, 'xfrm');
    if(!x){ if(ln==='grpSp') return; x = frag(doc, '<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>')[0]; pr.insertBefore(x, pr.firstChild); }
  }
  let off = kid(x, 'off'), ext = kid(x, 'ext');
  if(!off){ off = frag(doc, '<a:off x="0" y="0"/>')[0]; x.insertBefore(off, x.firstChild); }
  if(!ext){ ext = frag(doc, '<a:ext cx="0" cy="0"/>')[0]; x.insertBefore(ext, off.nextSibling); }
  off.setAttribute('x', E(g.x)); off.setAttribute('y', E(g.y));
  ext.setAttribute('cx', EP(g.w)); ext.setAttribute('cy', EP(g.h));
}
function shiftX(node, dx){
  const ln = node.localName;
  const x = ln==='graphicFrame' ? kid(node, 'xfrm') : kid(kid(node, ln==='grpSp' ? 'grpSpPr' : 'spPr'), 'xfrm');
  const off = kid(x, 'off'); if(off) off.setAttribute('x', (parseInt(off.getAttribute('x'), 10) || 0) + E(dx));
}
const FILLS = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']);
function restyle(doc, node, st){
  if(node.localName!=='sp') return;
  let pr = kid(node, 'spPr'); if(!pr) return;
  if(st.fill){
    for(const c of kids(pr)) if(FILLS.has(c.localName)) c.remove();
    const f = frag(doc, solid(st.fill))[0];
    const after = kid(pr, 'custGeom') || kid(pr, 'prstGeom') || kid(pr, 'xfrm');
    pr.insertBefore(f, after ? after.nextSibling : pr.firstChild);
    // A shape drawn by its style (p:style) with no geometry of its own still needs one for the fill.
    if(!kid(pr, 'custGeom') && !kid(pr, 'prstGeom')) pr.insertBefore(frag(doc, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>')[0], f);
  }
  if(st.line || st.lw!=null || st.dash!=null){
    let ln = kid(pr, 'ln');
    if(!ln){
      ln = frag(doc, '<a:ln/>')[0];
      let before = null; for(const c of kids(pr)) if(!['xfrm','custGeom','prstGeom'].includes(c.localName) && !FILLS.has(c.localName)){ before = c; break; }
      pr.insertBefore(ln, before);
    }
    if(st.lw!=null) ln.setAttribute('w', E(st.lw));
    if(st.line){
      for(const c of kids(ln)) if(FILLS.has(c.localName)) c.remove();
      const f = frag(doc, solid(st.line))[0];
      ln.insertBefore(f, ln.firstChild);
      if(st.line!=='none' && !ln.getAttribute('w')) ln.setAttribute('w', E(st.lw || 1.5));
    }
    if(st.dash!=null){
      for(const c of kids(ln)) if(c.localName==='prstDash' || c.localName==='custDash') c.remove();
      const d = frag(doc, `<a:prstDash val="${DASH[st.dash] || 'solid'}"/>`)[0];
      let after = null; for(const c of kids(ln)) if(FILLS.has(c.localName)) after = c;
      ln.insertBefore(d, after ? after.nextSibling : ln.firstChild);
    }
  }
}
function setText(doc, node, box){
  if(node.localName!=='sp') return;
  let tb = kid(node, 'txBody');
  if(!tb){ tb = frag(doc, '<p:txBody><a:bodyPr/><a:lstStyle/></p:txBody>')[0]; node.appendChild(tb); }
  for(const p of kids(tb, 'p')) p.remove();
  // Sizes come from the viewer, which already applied any shrink-on-overflow scale.
  const na = desc(kid(tb, 'bodyPr'), 'normAutofit'); if(na){ na.removeAttribute('fontScale'); na.removeAttribute('lnSpcReduction'); }
  if(!kid(tb, 'bodyPr')) tb.insertBefore(frag(doc, '<a:bodyPr/>')[0], tb.firstChild);
  if(!kid(tb, 'lstStyle')) tb.insertBefore(frag(doc, '<a:lstStyle/>')[0], kid(tb, 'bodyPr').nextSibling);
  for(const p of frag(doc, domParas(box, { zeroMargins:true }).join(''))) tb.appendChild(p);
}
function setBackground(doc, cSld, col){
  const old = kid(cSld, 'bg'); if(old) old.remove();
  const bg = frag(doc, `<p:bg><p:bgPr>${solid(col)}<a:effectLst/></p:bgPr></p:bg>`)[0];
  cSld.insertBefore(bg, cSld.firstChild);
}
// p:sld children order: cSld, clrMapOvr, transition, timing, extLst.
function putTiming(doc, xml){
  const root = doc.documentElement;
  for(const t of kids(root, 'timing')) t.remove();
  for(const ac of kids(root, 'AlternateContent')) if(desc(ac, 'timing') && !desc(ac, 'transition')) ac.remove();
  if(!xml) return;
  const t = frag(doc, xml)[0];
  const ext = kid(root, 'extLst');
  root.insertBefore(t, ext || null);
}
function notesParas(lines){
  return lines.map(t=>t ? `<a:p><a:r><a:rPr lang="${LANG}" dirty="0"/><a:t>${esc(t)}</a:t></a:r></a:p>` : `<a:p><a:endParaRPr lang="${LANG}" dirty="0"/></a:p>`).join('');
}
const NOTES_MASTER = `<p:notesMaster ${XMLNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:endParaRPr lang="en-GB"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;

/* ---------- the export ---------- */
async function exportLesson(l, onStep){
  const C = window.SVCore;
  if(!l.files || !l.files.pptx) throw new Error('This lesson has no PowerPoint version to export.');
  LANG = l.lang==='es' ? 'es-ES' : l.lang==='fr' ? 'fr-FR' : 'en-GB';
  const R = newReport();
  const v = await C.getDeck(l, 'pptx');
  const deck = v.base.deck;
  const file = await C.themedFile(l, await C.store.readDeck(l.files.pptx.path)); // v1.91: in the lesson's theme, like the screen
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const pkg = new Pkg(zip); await pkg.init();
  const pres = await pkg.xml(pkg.presPath), presRels = await pkg.rels(pkg.presPath);
  const ownPaths = deck.slides.map(s=>s.path);
  // Layouts of this deck: path → { name, type }
  const layouts = new Map();
  for(const r of presRels.list) if(r.type===REL('slideMaster')){
    for(const lr of (await pkg.rels(r.target)).list) if(lr.type===REL('slideLayout')){
      const d = await pkg.xml(lr.target); if(!d) continue;
      layouts.set(lr.target, { name:(desc(d.documentElement, 'cSld') || { getAttribute:()=>'' }).getAttribute('name') || '', type:d.documentElement.getAttribute('type') || '' });
    }
  }
  const firstLayout = (deck.slides[0] && deck.slides[0].layout && deck.slides[0].layout.path) || [...layouts.keys()][0];
  const blankLayout = (deck.blankLayout && deck.blankLayout.path) || firstLayout;
  // Slide size (Design → Slide size): the frame widens / narrows; deck content stays centred.
  const frameW = v.size(v.keys[0]).w, dx = v.ratio ? (frameW - deck.width) / 2 : 0;
  if(dx){
    const sz = kid(pres.documentElement, 'sldSz'); sz.setAttribute('cx', E(frameW)); sz.removeAttribute('type');
    for(const p of new Set([...layouts.keys(), ...presRels.list.filter(r=>r.type===REL('slideMaster')).map(r=>r.target)])){
      const d = await pkg.xml(p); const tree = desc(d && d.documentElement, 'spTree'); if(!tree) continue;
      for(const o of topObjects(tree)) for(const n of o.inner) shiftX(n, dx);
      pkg.put(p, d);
    }
  }
  const used = new Set(), out = [];
  const M = new Measurer();
  const entries = v.all().filter(e=>!e.del);
  try{
    let idx = 0;
    for(const e of entries){
      idx++; if(onStep) onStep(idx, entries.length);
      const k = e.k, hidNow = v.isHidden(k), ppHid = !e.src && !!(deck.slides[k] && deck.slides[k].hidden);
      if(hidNow && !ppHid){ R.skippedHidden++; continue; }
      const made = await makeSlide(pkg, e, v, used, ownPaths, layouts, blankLayout, R);
      await patchSlide(pkg, made, e, k, v, l, M, R, dx, hidNow);
      out.push(made);
    }
  } finally { M.done(); }
  if(!out.length) throw new Error('Every slide is hidden or deleted, so there is nothing to export.');
  // Remove the deck's slides that aren't used.
  for(const p of ownPaths) if(!used.has(p)){
    const sr = await pkg.rels(p);
    for(const r of sr.list) if(r.type===REL('notesSlide') && pkg.has(r.target)) pkg.remove(r.target);
    pkg.remove(p);
    for(const r of presRels.list) if(!r.external && r.target===p) r.el.remove();
  }
  await dropDangling(pkg);
  // Slide list in the lesson's order.
  const lst = kid(pres.documentElement, 'sldIdLst');
  const old = new Map(kids(lst, 'sldId').map(s=>{ const r = presRels.list.find(x=>x.id===rid(s)); return [r ? r.target : '', s]; }));
  let maxId = Math.max(255, ...kids(lst, 'sldId').map(s=>parseInt(s.getAttribute('id'), 10) || 0));
  while(lst.firstChild) lst.removeChild(lst.firstChild);
  for(const s of out){
    let el = s.reused && old.get(s.path);
    if(!el){
      const id = pkg.addRel(presRels, REL('slide'), s.path);
      el = pres.createElementNS(NS.p, 'p:sldId'); el.setAttribute('id', ++maxId); el.setAttributeNS(NS.r, 'r:id', id);
    }
    lst.appendChild(el);
  }
  presRels.dirty = true;
  // Sections and custom shows name slides that may have gone.
  for(const ex of descAll(pres.documentElement, 'ext')) if(ex.getAttribute('uri')===SECTIONS_EXT) ex.remove();
  const cs = kid(pres.documentElement, 'custShowLst'); if(cs) cs.remove();
  pkg.put(pkg.presPath, pres);
  await writeNotes(pkg, out, v, l, R, pres, presRels);
  pkg.put(pkg.presPath, pres);
  // docProps/app.xml counts (PowerPoint doesn't rely on them, but keep them right).
  const app = await pkg.text('docProps/app.xml');
  if(app){
    const hidden = out.filter(s=>s.hidden).length, notes = out.filter(s=>s.notes).length;
    pkg.put('docProps/app.xml', app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${out.length}</Slides>`).replace(/<Notes>\d+<\/Notes>/, `<Notes>${notes}</Notes>`).replace(/<HiddenSlides>\d+<\/HiddenSlides>/, `<HiddenSlides>${hidden}</HiddenSlides>`));
  }
  pkg.finish();
  await dropUnused(pkg);
  R.slides = out.length;
  const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{ level:6 }, mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  return { blob, report:R };
}

// Links (and outline view entries) that point at slides that were left out: removed, with their relationships.
async function dropDangling(pkg){
  for(const rp of Object.keys(pkg.zip.files)){
    if(!rp.endsWith('.rels') || rp==='_rels/.rels' || rp.endsWith('presentation.xml.rels')) continue;
    const part = rp.replace('_rels/', '').replace(/\.rels$/, '');
    if(!pkg.has(part) || !/\.xml$/.test(part)) continue;
    const r = await pkg.rels(part);
    const gone = r.list.filter(x=>!x.external && x.type===REL('slide') && !pkg.has(x.target));
    if(!gone.length) continue;
    const ids = new Set(gone.map(x=>x.id));
    const d = await pkg.xml(part);
    for(const el of [...descAll(d.documentElement, 'hlinkClick'), ...descAll(d.documentElement, 'hlinkHover'), ...descAll(d.documentElement, 'sld')]) if(ids.has(rid(el))) el.remove();
    pkg.put(part, d);
    for(const x of gone) x.el.remove();
    r.dirty = true;
  }
}
// Parts nothing points at any more (pictures only the left-out slides used, their ink, …) are removed:
// walk the relationships from the package root and drop what isn't reached.
async function dropUnused(pkg){
  const seen = new Set(), todo = [''];
  while(todo.length){
    const p = todo.pop();
    const f = pkg.zip.file(p ? relsPath(p) : '_rels/.rels'); if(!f) continue;
    const d = parse(await f.async('string'));
    for(const r of kids(d.documentElement, 'Relationship')){
      if(r.getAttribute('TargetMode')==='External') continue;
      const tgt = resolve(p, r.getAttribute('Target'));
      if(!seen.has(tgt) && pkg.has(tgt)){ seen.add(tgt); todo.push(tgt); }
    }
  }
  for(const name of Object.keys(pkg.zip.files)){
    if(pkg.zip.files[name].dir || name==='[Content_Types].xml' || name.endsWith('.rels') || seen.has(name)) continue;
    pkg.zip.remove(name); pkg.removeOverride(name);
  }
  for(const name of Object.keys(pkg.zip.files)) if(name.endsWith('.rels') && name!=='_rels/.rels'){
    const part = name.replace('_rels/', '').replace(/\.rels$/, '');
    if(!pkg.has(part)) pkg.zip.remove(name);
  }
  pkg.zip.file('[Content_Types].xml', ser(pkg.ctDoc));
}
async function cloneSlide(pkg, src, R){
  const p = pkg.unique('ppt/slides', 'slide', 'xml');
  pkg.put(p, await pkg.text(src));
  const sr = await pkg.rels(src), nr = await pkg.rels(p);
  for(const r of sr.list){ if(r.type===REL('notesSlide') || /\/comments$/.test(r.type)) continue; pkg.addRelWithId(nr, r); } // comments belong to one slide
  nr.dirty = true;
  pkg.override(p, CT.slide);
  return { path:p, reused:false };
}
Pkg.prototype.addRelWithId = function(r, x){
  const el = r.doc.createElementNS(NS.pr, 'Relationship');
  el.setAttribute('Id', x.id); el.setAttribute('Type', x.type);
  el.setAttribute('Target', x.external ? x.target : relative(r.path, x.target));
  if(x.external) el.setAttribute('TargetMode', 'External');
  r.doc.documentElement.appendChild(el);
};
// A slide from another deck (Shared - … in the Lessons folder): copies the slide and everything it uses
// except layouts (matched to this deck's by name, then type) and notes.
async function importSlide(pkg, srcDeck, i, layouts, firstLayout, R){
  const sz = srcDeck.zip, srcPath = srcDeck.slides[i].path;
  const srcCt = parse(await sz.file('[Content_Types].xml').async('string'));
  const ctOf = p => { const o = kids(srcCt.documentElement, 'Override').find(o=>o.getAttribute('PartName').toLowerCase()==='/' + p.toLowerCase()); if(o) return { over:o.getAttribute('ContentType') }; const d = kids(srcCt.documentElement, 'Default').find(d=>d.getAttribute('Extension').toLowerCase()===extOf(p)); return { def: d ? d.getAttribute('ContentType') : 'application/octet-stream' }; };
  const srcRels = async p => { const f = sz.file(relsPath(p)); if(!f) return []; const d = parse(await f.async('string')); return kids(d.documentElement, 'Relationship').map(el=>{ const ext = el.getAttribute('TargetMode')==='External'; return { id:el.getAttribute('Id'), type:el.getAttribute('Type'), target: ext ? el.getAttribute('Target') : resolve(p, el.getAttribute('Target')), external:ext }; }); };
  const memo = new Map();
  const SKIP = ['slideLayout', 'slideMaster', 'slide', 'notesSlide', 'notesMaster', 'theme', 'presentation'].map(REL);
  const copyPart = async p => {
    if(memo.has(p)) return memo.get(p);
    const f = sz.file(p); if(!f) return null;
    const name = p.split('/').pop(), stem = name.replace(/\d*\.[^.]+$/, '') || 'part', ext = extOf(p);
    const np = pkg.unique(dirOf(p), stem, ext);
    memo.set(p, np);
    pkg.zip.file(np, await f.async('uint8array'));
    const ct = ctOf(p); if(ct.over) pkg.override(np, ct.over); else pkg.ensureDefault(ext, ct.def);
    const rl = await srcRels(p);
    if(rl.length){
      const nr = await pkg.rels(np);
      for(const r of rl){
        if(r.external){ pkg.addRelWithId(nr, r); continue; }
        if(SKIP.includes(r.type)) continue;
        const t = await copyPart(r.target); if(t) pkg.addRelWithId(nr, { id:r.id, type:r.type, target:t });
      }
      nr.dirty = true;
    }
    return np;
  };
  const p = pkg.unique('ppt/slides', 'slide', 'xml');
  const doc = parse(await sz.file(srcPath).async('string'));
  const nr = await pkg.rels(p), dropped = new Set();
  for(const r of await srcRels(srcPath)){
    if(r.type===REL('slideLayout')){
      const ld = parse(await sz.file(r.target).async('string'));
      const name = (desc(ld.documentElement, 'cSld') || { getAttribute:()=>'' }).getAttribute('name') || '', type = ld.documentElement.getAttribute('type') || '';
      let target = [...layouts].find(([, x])=>x.name && x.name===name);
      if(!target) target = [...layouts].find(([, x])=>x.type && x.type===type);
      pkg.addRelWithId(nr, { id:r.id, type:r.type, target: target ? target[0] : firstLayout });
      continue;
    }
    if(r.type===REL('notesSlide') || /\/comments$/.test(r.type)) continue;
    if(r.external){ pkg.addRelWithId(nr, r); continue; }
    if(SKIP.includes(r.type)){ dropped.add(r.id); continue; }
    const t = await copyPart(r.target);
    if(t) pkg.addRelWithId(nr, { id:r.id, type:r.type, target:t }); else dropped.add(r.id);
  }
  // Links to slides of the other deck can't follow: drop them.
  for(const h of [...descAll(doc.documentElement, 'hlinkClick'), ...descAll(doc.documentElement, 'hlinkHover')]) if(dropped.has(rid(h))) h.remove();
  nr.dirty = true;
  pkg.put(p, doc);
  pkg.override(p, CT.slide);
  R.otherLook++;
  return { path:p, reused:false };
}
async function blankSlide(pkg, layout){
  const p = pkg.unique('ppt/slides', 'slide', 'xml');
  pkg.put(p, DECL + `<p:sld ${XMLNS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  const nr = await pkg.rels(p); pkg.addRel(nr, REL('slideLayout'), layout); nr.dirty = true;
  pkg.override(p, CT.slide);
  return { path:p, reused:false };
}
async function makeSlide(pkg, e, v, used, ownPaths, layouts, blankLayout, R){
  const s = e.src;
  if(!s){
    const p = ownPaths[e.k];
    if(!used.has(p)){ used.add(p); return { path:p, reused:true }; }
    return cloneSlide(pkg, p, R);
  }
  if(s.blank){ if(s.f && !s.act) R.otherLook++; return Object.assign(await blankSlide(pkg, blankLayout), { blank:true }); }
  if(s.f){
    const x = v.extra.get(s.f);
    if(!x || !x.deck.slides[s.i]){ R.missingSlides++; return Object.assign(await blankSlide(pkg, blankLayout), { blank:true, missing:true }); }
    return importSlide(pkg, x.deck, s.i, layouts, blankLayout, R);
  }
  return cloneSlide(pkg, ownPaths[s.i], R);
}

async function patchSlide(pkg, made, e, k, v, l, M, R, dx, hidden){
  const C = window.SVCore;
  const doc = await pkg.xml(made.path);
  const root = doc.documentElement, cSld = kid(root, 'cSld'), tree = kid(cSld, 'spTree');
  const raw = (l.hides.pptx || {})[k] || {};
  const obj = raw.obj || {}, geo = raw.geo || {}, text = raw.text || {}, style = raw.style || {};
  const rels = await pkg.rels(made.path);
  const S = new Shapes(pkg, made.path, rels, maxShapeId(doc) + 1, R);
  // The slide as the viewer draws it (edits applied), off-screen.
  const src = v.src(k), size = v.size(k);
  const edits = Object.assign({}, C.editsOf(l, 'pptx', k), { noTools:true }); // v1.68: tool icons are not exported
  let rendered, actLayer = [];
  if(src.blank && src.act && window.SVAct && src.v){
    const opts = { thumb:true, edits, num:v.pos(k) + 1 || undefined }; if(v.ratio) opts.frameW = size.w;
    rendered = src.v.deck.renderBlank(opts);
    const before = new Set(rendered.el.children);
    const z = v.rawSize(k);
    SVAct.paint(rendered.el, src.act, z.w, z.h, v.dx(k));
    actLayer = [...rendered.el.children].filter(c=>!before.has(c));
  } else if(src.v || !src.missing) rendered = v.render(k, { thumb:true, edits });
  if(rendered){ C.dropDeletedEl(rendered.el, l, 'pptx', k); M.mount(rendered.el, size.w, size.h); }
  // 1. Deck objects: delete, move / resize, text, fill / outline.
  const tops = topObjects(tree), byId = new Map(tops.map(o=>[o.id, o]));
  for(const o of tops){
    if(o.id && obj[o.id]==='del'){ o.node.remove(); byId.delete(o.id); continue; }
    const g = o.id && geo[o.id];
    for(const n of o.inner){
      if(g) setXfrm(doc, n, g);
      else if(dx) shiftX(n, dx);
      if(o.id && text[o.id]!=null && rendered){ const el = M.obj(o.id), box = el && el.querySelector(':scope > .pptx-tx'); if(box) setText(doc, n, box); }
      if(o.id && style[o.id]) restyle(doc, n, style[o.id]);
    }
  }
  if(raw.bg) setBackground(doc, cSld, raw.bg);
  // 2. Objects added in the editor.
  const idMap = new Map(), kinds = new Map();
  for(const o of byId.values()) kinds.set(o.id, o.inner[0].localName);
  const addedNodes = [];
  for(const a of (raw.added || [])){
    if(a.tool) continue; // v1.68: tool icons stay in the viewer
    if(a.frame && !a.pic) continue; // v1.73: empty picture frames are placeholders, not content
    const oid = 'n' + a.id; if(obj[oid]==='del') continue;
    const id = S.nid();
    let xml = null;
    try{ xml = await addedXml(a, rendered ? M.obj(oid) : null, M, S, id); }catch(err){ console.warn('Export: added object', a, err); }
    if(!xml) continue;
    const n = frag(doc, xml)[0]; tree.appendChild(n);
    idMap.set(oid, String(id)); kinds.set(String(id), n.localName); addedNodes.push({ oid, node:n });
  }
  // 3. Layer order (Bring to front / Send to back).
  if(Array.isArray(raw.z) && raw.z.length){
    const order = [...[...byId.values()].map(o=>({ oid:o.id, node:o.node })), ...addedNodes];
    const ids = order.map(o=>o.oid), have = new Set(ids), inZ = new Set(raw.z);
    const z = raw.z.filter(id=>have.has(id)).concat(ids.filter(id=>!inZ.has(id)));
    const map = new Map(order.map(o=>[o.oid, o.node]));
    const ext = kid(tree, 'extLst');
    for(const id of z){ const n = map.get(id); if(n) tree.insertBefore(n, ext); }
  }
  // 4. Activity slides: the activity as plain shapes, on top.
  if(actLayer.length){
    R.acts++;
    const ext = kid(tree, 'extLst');
    for(const el of actLayer){ for(const p of await domShapes(el, M, S)) tree.insertBefore(frag(doc, p.xml)[0], ext); }
  }
  // 5. Cover boxes, on top of everything.
  const coverIds = new Map();
  for(const c of (raw.covers || [])){
    const id = S.nid();
    const n = frag(doc, S.sp({ id, name:'Cover box ' + id, box:{ x:c.x, y:c.y, w:c.w, h:c.h }, fill:solid(c.color || '#FFFFFF'), ln:'<a:ln><a:noFill/></a:ln>' }))[0];
    tree.insertBefore(n, kid(tree, 'extLst'));
    coverIds.set('c' + c.id, String(id)); kinds.set(String(id), 'sp'); R.covers++;
  }
  // 6. Click sequence, in the viewer's reveal order.
  const oldTiming = desc(root, 'timing');
  if(oldTiming) for(const c of descAll(oldTiming, 'cTn')){ const pc = c.getAttribute('presetClass'); if(pc && pc!=='entr' && pc!=='exit') R.droppedAnims++; }
  const cfg = C.hideCfg(l, 'pptx', k);
  const seq = C.seqFor(v, cfg, k);
  const steps = [];
  // Cell cover boxes (v1.67.1): placed just above their table, so anything layered over the table stays on top.
  const slideBg = (()=>{ if(!rendered) return '#FFFFFF'; const cs = getComputedStyle(M.root); return cs.backgroundImage && cs.backgroundImage!=='none' ? '#FFFFFF' : (color(cs.backgroundColor) ? cs.backgroundColor : '#FFFFFF'); })();
  const lastCellBox = new Map();
  const cellBox = (key, state)=>{
    const m = /^(n[^.]+)\.(\d+)\.(\d+)$/.exec(key); if(!m) return null;
    const a = (raw.added || []).find(x=>'n' + x.id===m[1] && x.table);
    const node = a && (addedNodes.find(x=>x.oid===m[1]) || {}).node;
    if(!a || !node) return null;
    const r = +m[2], c = +m[3], g = PPTX.tableGeo(a).find(q=>q.r===r && q.c===c); if(!g) return null;
    const t = a.table, cell = (t.cells[r] || [])[c] || {};
    const line = colOr(a.line, PPTX.TABLE_DEFAULT.line), lw = a.lw!=null ? a.lw : PPTX.TABLE_DEFAULT.lw;
    const ins = color(line) && lw > 0 ? lw / 2 : 0; // keep the grid lines showing
    let fill = cell.fill || (t.head && r===0 ? (typeof t.head==='string' ? t.head : PPTX.HEAD_FILL) : colOr(a.fill, PPTX.TABLE_DEFAULT.fill));
    if(!color(fill) || color(fill).a < 0.999) fill = slideBg;
    const id = S.nid();
    const box = { x:a.x + g.x + ins, y:a.y + g.y + ins, w:Math.max(0, g.w - 2*ins), h:Math.max(0, g.h - 2*ins), rot:a.rot || 0 };
    const n = frag(doc, S.sp({ id, name:'Cell cover ' + id, box, fill:solid(fill), ln:'<a:ln><a:noFill/></a:ln>' }))[0];
    const after = lastCellBox.get(m[1]) || node;
    tree.insertBefore(n, after.nextSibling);
    lastCellBox.set(m[1], n);
    kinds.set(String(id), 'sp');
    return String(id);
  };
  for(const key of seq){
    if(key[0]==='c'){ const id = coverIds.get(key); if(id) steps.push({ cls:'exit', ids:[id] }); continue; }
    const oid = key.slice(1);
    if(oid.includes('.')){
      // A table cell: PowerPoint can't animate one cell, so a box in the cell's colour covers its text.
      // Hidden at start = the box is there at the start and disappears on click; Can hide = it appears on click.
      const state = cfg.obj[oid]; if(state!=='hide' && state!=='toggle') continue;
      const id = cellBox(oid, state);
      if(id){ steps.push({ cls: state==='hide' ? 'exit' : 'entr', ids:[id] }); R.reveals++; R.cellBoxes++; }
      else R.cells++;
      continue;
    }
    const state = cfg.obj[oid]; if(state!=='hide' && state!=='toggle') continue;
    const ids = C.revealOids(raw, oid).map(x=>idMap.get(x) || (byId.has(x) ? x : null)).filter(Boolean);
    if(!ids.length) continue;
    steps.push({ cls: state==='hide' ? 'entr' : 'exit', ids:[...new Set(ids)] });
    R.reveals++;
  }
  putTiming(doc, steps.length ? timingXml(steps, id=>kinds.get(String(id))) : null);
  // 7. Hidden in PowerPoint (kept) / shown.
  if(hidden) root.setAttribute('show', '0'); else root.removeAttribute('show');
  made.hidden = !!hidden;
  made.k = k;
  pkg.put(made.path, doc);
  if(rels.dirty) pkg.saveRels(rels);
}

async function writeNotes(pkg, out, v, l, R, pres, presRels){
  const C = window.SVCore;
  let master = (presRels.list.find(r=>r.type===REL('notesMaster')) || {}).target || null;
  const ensureMaster = async ()=>{
    if(master) return master;
    master = pkg.unique('ppt/notesMasters', 'notesMaster', 'xml');
    pkg.put(master, DECL + NOTES_MASTER);
    pkg.override(master, CT.notesMaster);
    const themeSrc = presRels.list.find(r=>r.type===REL('theme'));
    const th = pkg.unique('ppt/theme', 'theme', 'xml');
    pkg.zip.file(th, themeSrc ? await pkg.text(themeSrc.target) : await pkg.text('ppt/theme/theme1.xml'));
    pkg.override(th, CT.theme);
    const mr = await pkg.rels(master); pkg.addRel(mr, REL('theme'), th); mr.dirty = true;
    const id = pkg.addRel(presRels, REL('notesMaster'), master);
    let lst = kid(pres.documentElement, 'notesMasterIdLst');
    if(!lst){ lst = pres.createElementNS(NS.p, 'p:notesMasterIdLst'); const sm = kid(pres.documentElement, 'sldMasterIdLst'); pres.documentElement.insertBefore(lst, sm ? sm.nextSibling : pres.documentElement.firstChild); }
    const nm = pres.createElementNS(NS.p, 'p:notesMasterId'); nm.setAttributeNS(NS.r, 'r:id', id); lst.appendChild(nm);
    presRels.dirty = true;
    return master;
  };
  for(const s of out){
    const mine = String(C.myNote(l, 'pptx', s.k) || '').replace(/\r\n?/g, '\n');
    const sr = await pkg.rels(s.path);
    const own = sr.list.find(r=>r.type===REL('notesSlide') && pkg.has(r.target));
    if(own){
      s.notes = true;
      if(!mine.trim()) continue;
      const d = await pkg.xml(own.target);
      const body = descAll(d.documentElement, 'sp').find(sp=>{ const ph = desc(sp, 'ph'); return ph && (ph.getAttribute('type') || 'body')==='body'; });
      if(!body) continue;
      let tb = kid(body, 'txBody'); if(!tb){ tb = frag(d, '<p:txBody><a:bodyPr/><a:lstStyle/></p:txBody>')[0]; body.appendChild(tb); }
      const had = kids(tb, 'p').some(p=>/\S/.test(p.textContent));
      if(!had) for(const p of kids(tb, 'p')) p.remove();
      for(const p of frag(d, notesParas((had ? [''] : []).concat(mine.split('\n'))))) tb.appendChild(p);
      pkg.put(own.target, d); R.notes++;
      continue;
    }
    // A cloned / new slide: the notes it showed in the viewer plus My notes.
    let orig = [];
    try{ orig = (await v.notes(s.k)).map(p=>p.text); }catch(e){}
    while(orig.length && !orig[orig.length - 1].trim()) orig.pop();
    const lines = orig.concat(mine.trim() ? (orig.length ? [''] : []).concat(mine.split('\n')) : []);
    if(!lines.some(t=>t.trim())) continue;
    const m = await ensureMaster();
    const np = pkg.unique('ppt/notesSlides', 'notesSlide', 'xml');
    pkg.put(np, DECL + `<p:notes ${XMLNS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${notesParas(lines)}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
    pkg.override(np, CT.notes);
    const nr = await pkg.rels(np); pkg.addRel(nr, REL('notesMaster'), m); pkg.addRel(nr, REL('slide'), s.path); nr.dirty = true;
    pkg.addRel(sr, REL('notesSlide'), np); sr.dirty = true;
    s.notes = true; if(mine.trim()) R.notes++;
  }
}

/* ---------- UI: Dashboard ⋯ → Export to PowerPoint…, Library deck ⋯ ---------- */
function exportName(l){
  const C = window.SVCore;
  const stem = (l.title || '').trim() || C.deckStem((l.files.pptx || {}).name || 'Lesson');
  return C.safeName(`${stem} - export ${C.iso(C.today())}.pptx`);
}
let busy = false;
async function open(lessonId){
  const C = window.SVCore;
  const l = C.data && C.data.lessons[lessonId];
  if(!l) return;
  if(!l.files.pptx){ C.toast('Only PowerPoint decks can be exported. This lesson only has a PDF.', true); return; }
  if(busy) return; busy = true;
  C.showLoading('Exporting to PowerPoint…');
  try{
    const { blob, report } = await exportLesson(l, (i, n)=>C.showLoading(`Exporting to PowerPoint… slide ${i} of ${n}`));
    const name = await C.uniqueName(exportName(l));
    const path = await C.store.writeDeck(name, new File([blob], name, { type:blob.type }));
    C.hideLoading();
    done(path, name, blob, report);
  }catch(e){
    console.error(e); C.hideLoading();
    C.toast("Couldn't export: " + (e && e.message || e), true);
  }finally{ busy = false; }
}
function done(path, name, blob, R){
  const C = window.SVCore, e = C.esc;
  const lines = reportLines(R);
  const facts = [`${R.slides} slide${R.slides===1 ? '' : 's'}`, R.reveals ? `${R.reveals} click reveal${R.reveals===1 ? '' : 's'}` : '', R.covers ? `${R.covers} cover box${R.covers===1 ? '' : 'es'}` : '', R.cellBoxes ? `${R.cellBoxes} table cell${R.cellBoxes===1 ? '' : 's'} covered` : '', R.notes ? `My notes on ${R.notes} slide${R.notes===1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  C.modal(`<h2>Exported to PowerPoint</h2><p><b>${e(name)}</b> is in the Lessons folder.</p><p class="svx-facts">${e(facts)}</p>
    ${lines.length ? `<p>Changed on the way:</p><ul class="svx-notes">${lines.map(t=>`<li>${e(t)}</li>`).join('')}</ul>` : ''}
    <p class="svx-small">Reveals play on click in PowerPoint, in the viewer's order. Pen marks aren't included.</p>
    <div class="foot"><button class="btn" data-a="dl">Download a copy</button><button class="btn primary" data-a="ok">Done</button></div>`, (m, close)=>{
    m.querySelector('[data-a=ok]').onclick = close;
    m.querySelector('[data-a=dl]').onclick = ()=>{ const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u), 60000); };
  });
}

window.SVExport = { open, exportLesson, exportName, _:{ domShapes, domParas, pathCmds, color, Measurer, reportLines } };
})();
