/* Sentence Builders — Download all (.zip) (v1.0, 2026-10-20)
   One zip of ready-made files for a builder, from the editor's Export step (Settings → Sentence builders):
     16:9  Full SB · English only · <language> only     (PDF + PowerPoint each)
     A4    Full SB                                      (PDF + PowerPoint)
     A5    Full SB, two to an A4 page                   (PDF + PowerPoint; left out when the builder doesn't fit A5)
   PDFs are 300 dpi pictures of the sheet (made here, no print dialog). PowerPoints hold an editable PowerPoint table
   that copies the sheet: the table is built from the sheet as the browser lays it out (cell edges, text, colours,
   spacing), so it matches the PDF. Respellings are never included.
   Needs sb-core.js (window.SBCore) and vendor/jszip.min.js. Classic script. Exposes window.SBExport.
   Spec: project doc claude/sentence-builder-editor-spec.md (Exports). */
(function(){
'use strict';
const C = () => window.SBCore;
const DPI = 300;
const EMU_MM = 36000, EMU_PX = 9525; // 1 px (CSS, 96 dpi) = 9525 EMU
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

/* ================= drawing a sheet off screen ================= */
// The sheet is drawn at its real size (mm) in a hidden box, so it can be measured (PowerPoint) and pictured (PDF).
function stage(html){
  const h = document.createElement('div');
  h.className = 'sbx-stage';
  h.style.cssText = 'position:fixed;left:-40000px;top:0;pointer-events:none;contain:layout';
  h.innerHTML = html; document.body.appendChild(h);
  return h;
}

/* ================= PDF (300 dpi picture of each page) ================= */
// A page = { w, h } in mm, drawn by draw(ctx, pxPerMm). The sheet goes in through an SVG foreignObject, as for the slide image.
async function sheetImage(html, wmm, hmm, pxW, pxH){
  const { SHEET_CSS } = C();
  const el = Object.assign(document.createElement('div'), { innerHTML:html }).firstChild;
  const xhtml = new XMLSerializer().serializeToString(el).replace(/^<div xmlns="http:\/\/www.w3.org\/1999\/xhtml"/, '<div');
  const W = wmm * C().MM, H = hmm * C().MM;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${SHEET_CSS}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  return img;
}
async function pageJPEG(page){
  const k = DPI / 25.4, pxW = Math.round(page.w * k), pxH = Math.round(page.h * k);
  const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, pxW, pxH);
  await page.draw(cx, k);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  cv.width = cv.height = 0; // free the memory straight away (the 16:9 page is 4000 × 2250)
  return { bytes, pxW, pxH, wPt:page.w / 25.4 * 72, hPt:page.h / 25.4 * 72 };
}
// A small PDF writer: one JPEG per page, filling the page.
function makePDF(pages, title){
  const enc = s => { const b = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const parts = [], offs = []; let len = 0;
  const put = x => { const b = typeof x === 'string' ? enc(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
  const n = pages.length, kids = pages.map((_, i) => `${4 + i*3} 0 R`).join(' ');
  const ptitle = String(title || '').replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&');
  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  obj(3, () => put(`<< /Title (${ptitle}) /Producer (Slideshow Viewer - Sentence Builders) >>`));
  pages.forEach((p, i) => {
    const o = 4 + i*3, w = p.wPt.toFixed(2), h = p.hPt.toFixed(2);
    obj(o, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${o+2} 0 R >> >> /Contents ${o+1} 0 R >>`));
    const cs = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(o+1, () => put(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(o+2, () => { put(`<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`); put(p.bytes); put('\nendstream'); });
  });
  const total = 4 + n*3, xref = len;
  put(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let p = 0; parts.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}

/* ================= PowerPoint: the sheet as an editable table ================= */
const hex = rgb => { const m = String(rgb).match(/\d+(\.\d+)?/g) || ['0','0','0']; return m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const ptOf = px => Math.round(px * 0.75 * 2) / 2; // px → pt, to the half point
const shown = el => el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

// One paragraph from a line of the sheet (an item's language line, a column title, the question bar).
// Each text node becomes a run with its own colour, weight and size, as the browser draws it.
function paraOf(el, lang, spcBefPx){
  const runs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let maxPx = parseFloat(getComputedStyle(el).fontSize);
  for(let t = w.nextNode(); t; t = w.nextNode()){
    const p = t.parentElement; if(!shown(p)) continue;
    let s = t.data.replace(/ /g, ' ').replace(/\s+/g, ' ');
    if(!s.trim() && !runs.length) continue;
    const cs = getComputedStyle(p);
    if(p.classList.contains('qen') && t === p.firstChild) s = '  ' + s; // the question's English sits 0.4em after the target language
    const px = parseFloat(cs.fontSize); maxPx = Math.max(maxPx, px);
    runs.push({ s, b:(+cs.fontWeight || 400) >= 600, c:hex(cs.color), pt:ptOf(px), lang:p.closest('.en, .qen') ? 'en-GB' : lang });
  }
  // trim the paragraph's ends
  if(runs.length){ runs[0].s = runs[0].s.replace(/^ +/, ''); runs[runs.length-1].s = runs[runs.length-1].s.replace(/ +$/, ''); }
  const lh = parseFloat(getComputedStyle(el).lineHeight) || maxPx * 1.18;
  return { runs:runs.filter(r => r.s), lnPt:Math.round(Math.max(lh, maxPx * 1.18) * 0.75 * 100) / 100, befPt:Math.max(0, spcBefPx || 0) * 0.75, pt:ptOf(maxPx) };
}
// Reads the drawn sheet into rectangles (cells), each with fill, borders and paragraphs.
// A cell split into sub-columns becomes one rectangle per sub-column with no line between them.
function readSheet(page){
  const pr = page.getBoundingClientRect(), tlLang = page.dataset.lang || 'fr-FR';
  const rel = r => ({ l:r.left - pr.left, t:r.top - pr.top, r:r.right - pr.left, b:r.bottom - pr.top });
  const pad = (el, side) => parseFloat(getComputedStyle(el)['padding' + side]) || 0;
  const cells = [];
  page.querySelectorAll('table.sb th, table.sb td').forEach(td => {
    const R = rel(td.getBoundingClientRect()), cs = getComputedStyle(td);
    const fill = cs.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor) ? hex(cs.backgroundColor) : 'FFFFFF';
    // every edge has a line except between two joined columns (class join / join-r on the cells)
    const border = { L:!td.classList.contains('join-r'), R:!td.classList.contains('join'), T:true, B:true };
    if(td.tagName === 'TH'){
      cells.push({ R, fill, border, paras:[paraOf(td, tlLang, 0)], mar:{ l:pad(td, 'Left'), r:pad(td, 'Right'), t:pad(td, 'Top'), b:pad(td, 'Bottom') }, real:true });
      return;
    }
    const subs = [...td.querySelectorAll('.sb-sub')];
    const mt = pad(td, 'Top'), mb = pad(td, 'Bottom');
    if(!subs.length){ cells.push({ R, fill, border, paras:[], mar:{ l:pad(td, 'Left'), r:pad(td, 'Right'), t:mt, b:mb }, real:true }); return; }
    // split the cell at the middle of the gap between neighbouring sub-columns
    const sr = subs.map(s => rel(s.getBoundingClientRect()));
    const xs = [R.l].concat(sr.slice(1).map((r, i) => (sr[i].r + r.l) / 2), [R.r]);
    subs.forEach((s, i) => {
      const paras = []; let prevB = null;
      s.querySelectorAll('.sb-it').forEach(it => {
        const ir = it.getBoundingClientRect(); let first = true;
        [...it.children].filter(x => /\b(tl|en|say)\b/.test(x.className) && shown(x)).forEach(line => {
          paras.push(paraOf(line, line.classList.contains('en') ? 'en-GB' : tlLang, first && prevB != null ? ir.top - prevB : 0));
          first = false;
        });
        prevB = ir.bottom;
      });
      const cR = { l:xs[i], r:xs[i+1], t:R.t, b:R.b };
      // side margins: the space the text didn't use, so PowerPoint wraps at the same width the sheet did
      const room = Math.max(0, ((cR.r - cR.l) - (sr[i].r - sr[i].l)) / 2 - 1.5);
      const mar = { l:Math.min(room, pad(td, 'Left')), r:Math.min(room, pad(td, 'Right')), t:mt, b:mb };
      cells.push({ R:cR, fill, border:{ L:i === 0 ? border.L : false, R:i === subs.length - 1 ? border.R : false, T:true, B:true }, paras, mar, real:true });
    });
  });
  return { cells, w:pr.width, h:pr.height, table:rel(page.querySelector('table.sb').getBoundingClientRect()) };
}
// Rectangles → a PowerPoint table grid. Edges within 4 px of each other are one grid line.
function toGrid(sheet){
  const cluster = vals => { const v = [...vals].sort((a, b) => a - b), out = []; v.forEach(x => { if(out.length && x - out[out.length-1].last <= 4){ const c = out[out.length-1]; c.sum += x; c.n++; c.last = x; } else out.push({ sum:x, n:1, last:x }); }); return out.map(c => c.sum / c.n); };
  const xs = cluster(sheet.cells.flatMap(c => [c.R.l, c.R.r])), ys = cluster(sheet.cells.flatMap(c => [c.R.t, c.R.b]));
  const near = (arr, v) => arr.reduce((bi, x, i) => Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi, 0);
  const own = ys.slice(1).map(() => xs.slice(1).map(() => -1));
  sheet.cells.forEach((c, k) => {
    c.c0 = near(xs, c.R.l); c.c1 = near(xs, c.R.r); c.r0 = near(ys, c.R.t); c.r1 = near(ys, c.R.b);
    for(let r = c.r0; r < c.r1; r++) for(let q = c.c0; q < c.c1; q++) if(own[r][q] < 0) own[r][q] = k;
  });
  return { xs, ys, own };
}
const LN_ON = t => `<a:ln${t} w="10800" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln${t}>`;
const LN_OFF = t => `<a:ln${t} w="12700" cmpd="sng"><a:noFill/></a:ln${t}>`;
function runXML(r){
  return `<a:r><a:rPr lang="${r.lang}" sz="${Math.round(r.pt * 100)}" b="${r.b ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${r.c}"/></a:solidFill><a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t>${xesc(r.s)}</a:t></a:r>`;
}
function paraXML(p, fallbackPt){
  const pt = p ? p.pt : fallbackPt;
  const ppr = p ? `<a:pPr algn="ctr"><a:lnSpc><a:spcPts val="${Math.round(p.lnPt * 100)}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.min(158400, Math.round(p.befPt * 100))}"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>` : '<a:pPr algn="ctr"/>';
  return `<a:p>${ppr}${p ? p.runs.map(runXML).join('') : ''}<a:endParaRPr lang="en-GB" sz="${Math.round(pt * 100)}" dirty="0"><a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:endParaRPr></a:p>`;
}
// The table as a graphic frame at (ox, oy) EMU. id = shape id on the slide.
function tableXML(sheet, ox, oy, id, name){
  const g = toGrid(sheet), E = px => Math.round(px * EMU_PX);
  const colW = g.xs.slice(1).map((x, i) => E(x) - E(g.xs[i])), rowH = g.ys.slice(1).map((y, i) => E(y) - E(g.ys[i]));
  const basePt = Math.min(...sheet.cells.flatMap(c => c.paras.map(p => p.pt)).filter(Boolean), 12) || 12;
  let rows = '';
  for(let r = 0; r < rowH.length; r++){
    let tcs = '';
    for(let q = 0; q < colW.length; q++){
      const k = g.own[r][q], c = k >= 0 ? sheet.cells[k] : null;
      const head = c && r === c.r0 && q === c.c0;
      const at = !c ? '' : (head ? (c.c1 - c.c0 > 1 ? ` gridSpan="${c.c1 - c.c0}"` : '') + (c.r1 - c.r0 > 1 ? ` rowSpan="${c.r1 - c.r0}"` : '') : (q > c.c0 ? ' hMerge="1"' : '') + (r > c.r0 ? ' vMerge="1"' : ''));
      const body = head && c.paras.length ? c.paras.map(p => paraXML(p)).join('') : paraXML(null, basePt);
      // Borders: the merged cell's own edges, as drawn on the sheet. The first grid cell of a merged cell carries all four
      // (PowerPoint draws a merged cell with that cell's borders); the others carry the edges they sit on.
      const on = side => !c || c.border[side];
      const edge = (side, isOuter) => (isOuter && on(side) ? LN_ON(side) : LN_OFF(side));
      const ln = head ? edge('L', true) + edge('R', true) + edge('T', true) + edge('B', true)
        : edge('L', !c || q === c.c0) + edge('R', !c || q === c.c1 - 1) + edge('T', !c || r === c.r0) + edge('B', !c || r === c.r1 - 1);
      const m = c ? c.mar : { l:0, r:0, t:0, b:0 };
      tcs += `<a:tc${at}><a:txBody><a:bodyPr/><a:lstStyle/>${body}</a:txBody><a:tcPr marL="${E(m.l)}" marR="${E(m.r)}" marT="${E(m.t)}" marB="${E(m.b)}" anchor="ctr">${ln}<a:solidFill><a:srgbClr val="${c ? c.fill : 'FFFFFF'}"/></a:solidFill></a:tcPr></a:tc>`;
    }
    rows += `<a:tr h="${rowH[r]}">${tcs}</a:tr>`;
  }
  const x = ox + E(g.xs[0]), y = oy + E(g.ys[0]), cx = colW.reduce((a, b) => a + b, 0), cy = rowH.reduce((a, b) => a + b, 0);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${xesc(name)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr><a:tableStyleId>{2D5ABB26-0587-4C30-8999-92F81FD0307C}</a:tableStyleId></a:tblPr><a:tblGrid>${colW.map(w => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
function lineXML(id, name, x, y, cx, cy, dash){
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${xesc(name)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="10800"><a:solidFill><a:srgbClr val="888888"/></a:solidFill><a:prstDash val="${dash ? 'dash' : 'solid'}"/></a:ln></p:spPr></p:cxnSp>`;
}

/* ---------- PowerPoint package (one slide) ---------- */
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const rels = list => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r, i) => `<Relationship Id="rId${i+1}" Type="${r[0].startsWith('http') ? r[0] : REL + r[0]}" Target="${r[1]}"/>`).join('')}</Relationships>`;
const THEME = XML + `<a:theme xmlns:a="${NS_A}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
const TREE0 = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
const LVL = sz => `<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>`;
const MASTER = XML + `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${TREE0}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${LVL(4400)}</p:titleStyle><p:bodyStyle>${LVL(2800)}</p:bodyStyle><p:otherStyle>${LVL(1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;
const LAYOUT = XML + `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${TREE0}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
async function makePPTX(slideW, slideH, shapesXML, title){
  const z = new window.JSZip(), now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  z.file('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  z.file('_rels/.rels', rels([['officeDocument', 'ppt/presentation.xml'], ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['extended-properties', 'docProps/app.xml']]));
  z.file('docProps/core.xml', XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title)}</dc:title><dc:creator>Sentence Builders</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  z.file('docProps/app.xml', XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><Slides>1</Slides></Properties>`);
  z.file('ppt/presentation.xml', XML + `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${slideW}" cy="${slideH}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${LVL(1800)}</p:defaultTextStyle></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', rels([['slideMaster', 'slideMasters/slideMaster1.xml'], ['slide', 'slides/slide1.xml'], ['theme', 'theme/theme1.xml'], ['presProps', 'presProps.xml'], ['viewProps', 'viewProps.xml'], ['tableStyles', 'tableStyles.xml']]));
  z.file('ppt/presProps.xml', XML + `<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`);
  z.file('ppt/viewProps.xml', XML + `<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`);
  z.file('ppt/tableStyles.xml', XML + `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  z.file('ppt/theme/theme1.xml', THEME);
  z.file('ppt/slideMasters/slideMaster1.xml', MASTER);
  z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['slideLayout', '../slideLayouts/slideLayout1.xml'], ['theme', '../theme/theme1.xml']]));
  z.file('ppt/slideLayouts/slideLayout1.xml', LAYOUT);
  z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['slideMaster', '../slideMasters/slideMaster1.xml']]));
  z.file('ppt/slides/slide1.xml', XML + `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${TREE0}${shapesXML}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  z.file('ppt/slides/_rels/slide1.xml.rels', rels([['slideLayout', '../slideLayouts/slideLayout1.xml']]));
  return z.generateAsync({ type:'uint8array', compression:'DEFLATE', mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

/* ================= the zip ================= */
// Which sheets go in. A5 only when the builder fits A5 (at its own text size, or Auto); otherwise it's left out.
function plan(d){
  const { PAPERS, fitPaper, lname } = C();
  const size = d.size === 'auto' ? null : d.size;
  const slide = fitPaper(d, PAPERS.slide, { phon:false });
  const a4 = fitPaper(d, PAPERS.A4, { size });
  const a5 = fitPaper(d, PAPERS.A5, { size });
  const L = lname(d);
  const out = [
    { key:'16x9-full', name:'16x9 - Full SB', paper:PAPERS.slide, fit:slide, version:'both' },
    { key:'16x9-en',   name:'16x9 - English only', paper:PAPERS.slide, fit:slide, version:'en' },
    { key:'16x9-tl',   name:`16x9 - ${L} only`, paper:PAPERS.slide, fit:slide, version:'tl' },
    { key:'a4-full',   name:'A4 - Full SB', paper:PAPERS.A4, fit:a4, version:'both' },
  ];
  if(a5.ok) out.push({ key:'a5-full', name:'A5 (two to an A4 page) - Full SB', paper:PAPERS.A5, fit:a5, version:'both', twoUp:true });
  return { sheets:out, a5ok:a5.ok, a4ok:a4.ok, slideok:slide.ok, a4pt:a4.L.font, slidept:slide.L.font };
}
async function buildZip(d, onStep){
  const { sheetHTML, fileSafe, displayTitle } = C();
  if(!window.JSZip) throw new Error('the zip library (vendor/jszip.min.js) isn\'t loaded');
  const P = plan(d), base = fileSafe(displayTitle(d)), zip = new window.JSZip();
  const tlLang = d.lang === 'es' ? 'es-ES' : 'fr-FR';
  let n = 0; const total = P.sheets.length * 2;
  for(const s of P.sheets){
    const html = sheetHTML(d, s.paper, s.fit.L, s.version, { fill:true, phon:false });
    const fileBase = `${base} - ${s.name}`;
    // PDF
    onStep && onStep(++n, total, s.name + ' (PDF)');
    const sheetImg = await sheetImage(html, s.paper.w, s.paper.h, Math.round(s.paper.w / 25.4 * DPI), Math.round(s.paper.h / 25.4 * DPI));
    let page;
    if(s.twoUp){
      page = { w:210, h:297, draw:(cx, k) => {
        cx.drawImage(sheetImg, 0, 0, 210 * k, 148 * k);
        cx.drawImage(sheetImg, 0, 148.5 * k, 210 * k, 148 * k);
        cx.strokeStyle = '#888'; cx.lineWidth = 0.3 * k; cx.setLineDash([2 * k, 1.5 * k]);
        cx.beginPath(); cx.moveTo(0, 148.25 * k); cx.lineTo(210 * k, 148.25 * k); cx.stroke();
      } };
    } else page = { w:s.paper.w, h:s.paper.h, draw:(cx, k) => cx.drawImage(sheetImg, 0, 0, s.paper.w * k, s.paper.h * k) };
    zip.file(fileBase + '.pdf', makePDF([await pageJPEG(page)], fileBase));
    // PowerPoint
    onStep && onStep(++n, total, s.name + ' (PowerPoint)');
    const h = stage(html);
    try{
      const pg = h.querySelector('.sb-page'); pg.dataset.lang = tlLang;
      const sheet = readSheet(pg);
      let shapes, W, H;
      if(s.twoUp){
        W = 210 * EMU_MM; H = 297 * EMU_MM;
        shapes = tableXML(sheet, 0, 0, 2, 'Sentence builder (top)') + tableXML(sheet, 0, Math.round(148.5 * EMU_MM), 3, 'Sentence builder (bottom)') + lineXML(4, 'Cut line', 0, Math.round(148.25 * EMU_MM), W, 0, true);
      } else {
        // the 16:9 slide is exactly PowerPoint's widescreen size (338.67 × 190.5 mm)
        W = s.paper.key === 'slide' ? 12192000 : Math.round(s.paper.w * EMU_MM); H = s.paper.key === 'slide' ? 6858000 : Math.round(s.paper.h * EMU_MM);
        shapes = tableXML(sheet, 0, 0, 2, 'Sentence builder');
      }
      zip.file(fileBase + '.pptx', await makePPTX(W, H, shapes, fileBase));
    } finally { h.remove(); }
  }
  const blob = await zip.generateAsync({ type:'blob', compression:'STORE' }); // PDFs and .pptx are already compressed
  return { blob, name:`${base} - Sentence Builder.zip`, plan:P, files:Object.keys(zip.files) };
}
async function downloadZip(d, onStep){
  const r = await buildZip(d, onStep);
  const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return r;
}

window.SBExport = { plan, buildZip, downloadZip, makePDF, makePPTX, readSheet, tableXML };
})();
