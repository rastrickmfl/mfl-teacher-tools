/* =====================================================================
   Slideshow Viewer — Activities (v1.49 Gap fill hooks → gapfill.js; v1.46.4, 2026-10-16: bigger text, rows wrap onto two lines; steadier dragging; smaller title; no stretch on drop; v1.47 picker tool mode + random sentences for Tools → Sentence Unjumble; v1.48 Translation activity + picker translation mode; v1.66 unjumble with your own words)
   Slide activities built from the Sentence Builder library. Unlike the
   classroom games (pop-ups from the Tools box), an activity IS a slide: it
   sits in the lesson's slide list, is edited in the editor, presented,
   printed and copied like any other slide.

   First activity: SENTENCE UNJUMBLE.
     Editor → Insert → Activity → Sentence unjumble (or Slides → Activity).
     1. Choose a sentence builder (the Sentence Builder gallery).
     2. The picker shows the builder with five colours. Pick a colour, tap
        one item per column (per group, where a column is split) to build
        that sentence; tap again to take it off. Columns can be skipped.
        The panel shows each sentence as the blocks pupils will get.
     3. Insert: two slides, both titled "Sentence Unjumble" (a normal Header
        text box): the five jumbled sentences, then the same with the
        English under each (easy to print one or the other).
   Blocks: one per builder item, at least 5 per sentence. A sentence with
   fewer items has its longest items split at a word gap ("behind the
   scenes"), never just after a little word such as le / de / que / et, so
   chunks stay readable. Giveaways removed: the first block starts lower
   case (¿ ¡ taken off) and the last loses its full stop / ? / !. They come
   back when a sentence is solved or revealed.
   The jumble is saved with the slides (so print and the slide show the
   same order); New jumble in the editor makes a fresh one.

   Presenting (live layer drawn into the slide itself, so pen marks go on
   top and the pen tool draws over it rather than moving blocks):
     drag a block along its row (touch, stylus or mouse), or tap a block then
     tap where it should go. Blocks never leave their own row.
     ✓ Check: right → the row turns green with its capital and full stop
       (locked); wrong → the row shakes red. Checked against the order picked
       in the builder (the builder's word order); other valid orders are the
       teacher's call.
     👁 Reveal: puts the row in order (gold); tap again to put it back.
     Top right: Shuffle (rows not solved yet) · Reset (back to the start).
     Keyboard / clicker forward reveals the next row, back hides it again;
     after the last row it moves on to the next slide.
   The rows' state is kept in the slide's reveal set (P.revealed, keys
   'ua|<row>|<order>|<flag>'), so the dual-screen console sees the same
   arrangement and nothing extra is saved: it resets when the lesson is left.

   Data: slide entry src = { blank:true, f?, act } with
     act = { type:'unjumble', v:1, gid, en:false|true, lang, q:{ tl, en },
             sb:{ year, term, name, title },
             rows:[{ tl:[chunks], en, lead, cap, end, jum:[order], src:[[c,g,i]] }] }
   gid ties the two slides together: editing the sentences updates both.

   Second activity: TRANSLATION (v1.48, 2026-10-16).
     Insert → Activity → Translation. Same builder + picker (1–5 sentences,
     "Translate into" French/Spanish or English for all, and a direction
     button on each sentence to change just that one). v1.48.3: inserts one
     slide titled "Translation" (was two: questions, then with answers;
     old answers slides still work and still update with their gid). Each
     row: number, direction tag (EN → FR), the sentence; revealing swaps the
     sentence for its answer in the same place and size (the size fits the
     longer of the two, so nothing moves). Top bar Edit activity → Edit text.
     Own words: the picker's pencil on a sentence (or Edit text on the
     ribbon) lets you type over the TL and the English; such a row is marked
     ed:true. Tapping builder words for a typed sentence asks first (tap
     again within 4 s) and then replaces the typed text.
     Presenting: 👁 per row shows / hides its answer; Show all / Hide all top
     right; clicker forward shows the next answer, back hides the last.
     State: 'ta|<row>' in the slide's reveal set.
     act = { type:'translate', v:1, lay:2, gid, ans:false|true, to:'tl'|'en', lang, q, sb,
             rows:[{ tl, en, to:'tl'|'en', src:[[c,g,i]], ed? }] }   to = the language pupils write in.
   Loaded after sb-present.js; uses SBCore, SVSentence, SVCore.
   ===================================================================== */
(function(){
'use strict';
const C = window.SVCore;
if(!C) return;
const { $, $$, el, esc, toast } = C;
const N_ROWS = 5, MIN_BLOCKS = 5, LONG_BLOCKS = 10; // LONG_BLOCKS: tool mode warns above this (v1.47.1)
// Picker colours: the presenter's four highlight colours plus pale pink.
const PICK = ['#FFE94D', '#A9D8FF', '#B5EBAA', '#FFC98A', '#F7B4D8'];
const PICK_NAMES = ['yellow', 'blue', 'green', 'orange', 'pink'];

const IC = iconMap({
  check: 'check', eye: 'eye', undo: 'undo-2', shuffle: 'shuffle',
  reset: 'rotate-ccw', x: 'x', sb: 'brick-wall', dice: 'dices',
  pen: 'pencil-line', swap: 'arrow-left-right', eyeOff: 'eye-off', plus: 'plus',
  left: 'chevron-left', right: 'chevron-right',
});
const LANG = l => (window.SBCore && SBCore.LANGS[l]) || { name:'French', short:'FR' };
const ico = (n, cls) => `<svg class="${cls || 'sva-i'}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));

/* ================= sentences → blocks ================= */
// Little words that belong with the word after them: a split never comes straight after one.
const GLUE = new Set(('le la les l un une des du de d au aux à a en et ou ni que qu qui ne n se s je j tu il elle on nous vous ils elles me m te t ce c ça mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs très plus moins trop si y '
  + 'el los las lo una unos unas del al con por para y o e u no yo mi mis tu tus su sus nuestro nuestra nuestros nuestras muy más menos tan me te nos os le les es está son hay').split(' '));
const bare = w => w.toLowerCase().replace(/[’']/g, ' ').trim().split(' ').pop().replace(/[^\p{L}]/gu, '');
const glued = w => { const b = bare(w); return GLUE.has(b) || /[’']$/.test(w); };
// Split one chunk in two at the best word gap: as even as possible, never after a little word.
function splitChunk(t){
  const w = t.split(/\s+/).filter(Boolean); if(w.length < 2) return null;
  let best = null;
  for(let i = 1; i < w.length; i++){
    const a = w.slice(0, i).join(' '), b = w.slice(i).join(' ');
    let cost = Math.abs(a.length - b.length);
    if(glued(w[i - 1])) cost += 1000;
    if(/^[,.;:!?)]/.test(w[i])) cost += 2000;
    if(!best || cost < best.cost) best = { cost, a, b };
  }
  return [best.a, best.b];
}
// Split the longest chunks until there are at least n (or no chunk can be split).
// v1.87: toBlocksO also says which chunk each block came from (o), so a block can be matched to its English phrase.
function toBlocksO(chunks, n){
  const out = chunks.map((t, o) => ({ t, o }));
  while(out.length < n){
    const order = out.map((x, i) => i).filter(i => out[i].t.trim().split(/\s+/).length > 1).sort((a, b) => out[b].t.length - out[a].t.length);
    let done = false;
    for(const i of order){ const s = splitChunk(out[i].t); if(s){ out.splice(i, 1, { t:s[0], o:out[i].o }, { t:s[1], o:out[i].o }); done = true; break; } }
    if(!done) break;
  }
  return out;
}
const toBlocks = (chunks, n) => toBlocksO(chunks, n).map(x => x.t);
const isUpper = ch => ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
function capFirst(t){ const m = /^([^\p{L}]*)(\p{L})/u.exec(t); return m ? m[1] + m[2].toUpperCase() + t.slice(m[0].length) : t; }
function lowFirst(t){
  const m = /^([^\p{L}]*)(\p{L})(\p{L}*)/u.exec(t); if(!m) return t;
  if(m[3] && m[3] === m[3].toUpperCase() && m[3] !== m[3].toLowerCase()) return t; // an acronym (EPS)
  return m[1] + m[2].toLowerCase() + t.slice(m[1].length + 1);
}
function enSentence(parts){
  let s = parts.map(t => t.trim()).filter(Boolean).join(' ').replace(/\s+([,.;:!?])/g, '$1');
  if(!s) return '';
  s = capFirst(s);
  if(!/[.!?…]["”»)]*$/.test(s)) s += '.';
  return s;
}
// items: the picked builder items in sentence order. Returns a row (see the top of the file).
// v1.58: items are joined through SBGrammar (Sentence Builders/grammar-rules.json) when lang is given.
const gramChunks = (items, lang) => (lang && window.SBGrammar) ? SBGrammar.chunks(items, lang) : items.map(it => String(it.tl || '').replace(/\s+/g, ' ').trim());
function makeRow(items, src, lang){
  const raw = gramChunks(items, lang), aligned = raw.length === items.length && raw.every(t => String(t).trim()); // one chunk per picked item?
  const tl = raw.filter(Boolean);
  if(!tl.length) return null;
  // Giveaways: ¿ / ¡ at the start, a capital first letter, the full stop at the end.
  let first = tl[0];
  const lm = /^[¿¡]+\s*/.exec(first), lead = lm ? lm[0].trim() : '';
  if(lm) first = first.slice(lm[0].length);
  const m0 = /\p{L}/u.exec(first), cap = !!(m0 && isUpper(m0[0]));
  tl[0] = lowFirst(first);
  let last = tl[tl.length - 1];
  const em = /\s*([.!?…]+)(["”»)]*)$/.exec(last);
  let end = '.';
  if(em){ end = em[1] + em[2]; last = last.slice(0, em.index); }
  tl[tl.length - 1] = last;
  const blocks = toBlocksO(tl.filter(t => t.trim()), MIN_BLOCKS), chunks = blocks.map(x => x.t);
  const row = { tl:chunks, en:enSentence(items.map(it => it.en || '')), lead, cap, end, jum:jumble(chunks), src };
  // v1.87: the English phrase of each picked item, with the blocks it matches (for the Attempt view). Only when each item gave one chunk.
  if(aligned && tl.length === items.length){
    const parts = items.map((it, k) => ({ t:String(it.en || '').replace(/\s+/g, ' ').trim(), b:chunks.map((c, j) => j).filter(j => blocks[j].o === k) })).filter(p => p.t && p.b.length);
    if(parts.length){
      parts[0].t = capFirst(parts[0].t);
      const last = parts[parts.length - 1]; if(!/[.!?…]["”»)]*$/.test(last.t)) last.t += '.';
      row.ep = parts;
    }
  }
  return row;
}
const rowText = (row, order) => order.map(i => row.tl[i]).join(' ');
const solved = (row, order) => rowText(row, order) === row.tl.join(' ');
// A starting order that isn't already right, with as few blocks in their own place as possible.
function jumble(chunks){
  const n = chunks.length, id = [...Array(n).keys()];
  if(n < 2) return id;
  let best = null;
  for(let t = 0; t < 60; t++){
    const p = id.slice();
    for(let i = n - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    if(chunks.map((c, i) => chunks[p[i]]).join(' ') === chunks.join(' ')) continue;
    const fixed = p.filter((v, i) => chunks[v] === chunks[i]).length;
    if(!best || fixed < best.fixed){ best = { p, fixed }; if(!fixed) break; }
  }
  return best ? best.p : id.slice().reverse();
}
// Text shown on a block: solved / revealed rows get the capital, ¿ ¡ and the full stop back.
function blockText(row, idx, whole){
  let t = row.tl[idx];
  if(whole && idx === 0){ if(row.cap) t = capFirst(t); if(row.lead) t = row.lead + t; }
  if(whole && idx === row.tl.length - 1) t += row.end || '';
  return t;
}

/* ---- translation rows (v1.48) ---- */
// The TL sentence as one line of text: items joined, a capital at the start, a full stop if it has no ending.
// (Spaces before ? ! : ; are left as written: French puts a space there.)
function tlSentence(items, lang){
  let s = gramChunks(items, lang).filter(Boolean).join(' ').replace(/\s+([,.])/g, '$1');
  if(!s) return '';
  s = capFirst(s);
  if(!/[.!?…]["”»)]*$/.test(s)) s += '.';
  return s;
}
// to: the language pupils write in ('tl' = translate the English into French/Spanish, 'en' = into English).
function makeTRow(items, src, to, lang){
  const row = { tl:tlSentence(items, lang), en:enSentence(items.map(it => it.en || '')), to:to === 'en' ? 'en' : 'tl', src };
  const pairs = tPairs(items, lang); if(pairs) row.pairs = pairs;
  return row;
}
// v1.88: the sentence as matching chunks (one per picked item) in both languages, so the answer can be revealed chunk by chunk
// (dragging along the question). The capital and the full stop are put on as in the whole sentences. Null if the items don't line up.
function tPairs(items, lang){
  const raw = gramChunks(items, lang);
  if(!items.length || raw.length !== items.length) return null;
  const tl = raw.map(t => String(t || '').replace(/\s+/g, ' ').trim()), en = items.map(it => String(it.en || '').replace(/\s+/g, ' ').trim());
  if(tl.some(t => !t) || en.some(t => !t)) return null;
  tl[0] = capFirst(tl[0]); en[0] = capFirst(en[0]);
  for(const a of [tl, en]) if(!/[.!?…]["”»)]*$/.test(a[a.length - 1])) a[a.length - 1] += '.';
  return tl.map((t, k) => ({ tl:t, en:en[k] }));
}
// A chunk of a row's pairs: what the pupils are asked, and the answer that replaces it.
const tChunkP = (row, p) => row.to === 'en' ? p.tl : p.en;
const tChunkA = (row, p) => row.to === 'en' ? p.en : p.tl;
const tGapBefore = txt => /^[,.;:!?)]/.test(txt) ? '' : ' ';
/* ---- unjumble with your own words (v1.50) ---- */
// The TL the teacher typed (and the English) as blocks, one per word. Giveaways as makeRow: ¿ ¡ off the start,
// a capital if there was one, the full stop kept for the end. own keeps the typed text for editing again.
function makeOwnRow(own, src){
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
  let s = clean(own.tl);
  if(!s) return null;
  const lm = /^[¿¡]+\s*/.exec(s), lead = lm ? lm[0].trim() : '';
  if(lm) s = s.slice(lm[0].length);
  const m0 = /\p{L}/u.exec(s), cap = !!(m0 && isUpper(m0[0]));
  s = lowFirst(s);
  let end = '.';
  const em = /\s*([.!?…]+)(["”»)]*)$/.exec(s);
  if(em){ end = em[1] + em[2]; s = s.slice(0, em.index); }
  const chunks = s.split(' ').filter(Boolean);
  if(!chunks.length) return null;
  return { tl:chunks, en:enSentence([clean(own.en)]), lead, cap, end, jum:jumble(chunks), src: src || [], own:{ tl:clean(own.tl), en:clean(own.en) } };
}
// A row's sentence as text for editing: the typed words, or the builder's words (giveaways put back).
function ownText(row){
  if(row.own) return { tl:row.own.tl, en:row.own.en };
  let s = row.tl.join(' ');
  if(row.cap) s = capFirst(s);
  return { tl:(row.lead || '') + s + (row.end || ''), en:row.en || '' };
}
const tPrompt = r => r.to === 'en' ? r.tl : r.en;
const tAnswer = r => r.to === 'en' ? r.en : r.tl;
const tTag = (r, lang) => r.to === 'en' ? `${LANG(lang).short} → EN` : `EN → ${LANG(lang).short}`;

/* ================= drawing (slide units) ================= */
let mctx = null;
function textW(t){
  if(!mctx){ mctx = document.createElement('canvas').getContext('2d'); }
  mctx.font = 'bold 100px Arial, "Liberation Sans", Helvetica, sans-serif';
  return mctx.measureText(t).width / 100;
}
const PADX = 0.5, BORD = 0.09, GAP = 0.42; // em
// Heights in em (font size f): a block line, the gap between two lines, the English line on the "with English" slide.
const PADY = 0.15, LINE_EM = 1.1 + PADY*2 + BORD*2, VGAP_EM = GAP*0.5, EN_EM = 0.82*1.15 + 0.18, MAX_LINES = 2;
// Lines a row needs if its blocks (widths in em) wrap in a width of B em (what flex-wrap does).
function linesFor(ws, B){
  let lines = 1, x = 0;
  for(const w of ws){ if(x && x + GAP + w > B){ lines++; x = w; } else x += (x ? GAP : 0) + w; }
  return lines;
}
// Geometry for a slide of content width Wd (deck width), height H, offset dx (wider lesson ratio).
// v1.46.1: one text size for all rows, as big as fits with each row on at most two lines.
function geom(act, Wd, H, dx){
  const n = Math.max(1, act.rows.length);
  const x0 = dx + Wd*0.035, x1 = dx + Wd*0.965, y0 = H*(act.lay >= 2 ? LAY2.rows : 0.165), y1 = H*0.968;
  const rowH = (y1 - y0) / n, gap = rowH*0.08, inner = rowH - gap;
  const numD = Math.min(inner*0.5, H*0.056);
  const trayX = x0 + numD + rowH*0.12, trayW = x1 - trayX;
  const btnD = Math.min((inner - 10)/2, H*0.062), ctlSpace = btnD + rowH*0.2;
  const widths = act.rows.map(r => r.tl.map(t => textW(t)*1.03 + PADX*2 + BORD*2));
  const fits = f => {
    const B = (trayW - ctlSpace - f*0.6 - 4) / f, room = act.en ? (inner - 4) / f - 0.4 : inner*0.94 / f;
    return widths.every(ws => {
      const L = linesFor(ws, B); if(L > MAX_LINES) return false;
      return L*LINE_EM + (L - 1)*VGAP_EM + (act.en ? EN_EM : 0) <= room;
    });
  };
  let lo = H*0.022, hi = inner*0.5;
  if(fits(hi)) lo = hi;
  else for(let k = 0; k < 24; k++){ const m = (lo + hi)/2; if(fits(m)) lo = m; else hi = m; }
  const f = lo;
  return { n, x0, x1, y0, y1, rowH, gap, inner, numD, trayX, trayW, btnD, ctlSpace, f };
}
function rowHTML(act, row, r, G, st, live){
  const order = st ? st.order : row.jum, whole = !!st && (st.flag === 's' || st.flag === 'r');
  const cls = 'sva-row' + (st && st.flag === 's' ? ' ok' : st && st.flag === 'r' ? ' rev' : '');
  const y = G.y0 + r*G.rowH + G.gap/2;
  let h = `<div class="${cls}" data-r="${r}" style="left:${G.x0}px;top:${y}px;width:${G.x1 - G.x0}px;height:${G.inner}px">`;
  h += `<div class="sva-num" style="width:${G.numD}px;height:${G.numD}px;font-size:${G.numD*0.55}px">${r + 1}</div>`;
  h += `<div class="sva-tray" style="left:${G.trayX - G.x0}px;width:${G.trayW}px;padding-right:${G.ctlSpace}px;font-size:${G.f}px">`;
  if(act.en) h += `<div class="sva-en">${esc(row.en)}</div>`;
  h += `<div class="sva-bl">` + order.map(i => `<div class="sva-b" data-i="${i}">${esc(blockText(row, i, whole))}</div>`).join('') + `</div>`;
  if(live){
    const d = G.btnD;
    const s = `width:${d}px;height:${d}px`;
    const done = st && st.flag === 's', rev = st && st.flag === 'r';
    h += `<div class="sva-ctl" style="right:${G.rowH*0.1}px;gap:${Math.max(4, G.inner - d*2 - 8)/2}px">`
      + (done ? '' : `<button class="sva-ck" data-a="check" style="${s}" title="Check">${ico('check')}</button>`)
      + (done ? '' : `<button class="sva-rv${rev ? ' on' : ''}" data-a="reveal" style="${s}" title="${rev ? 'Put it back' : 'Reveal'}">${ico(rev ? 'undo' : 'eye')}</button>`)
      + `</div>`;
  }
  return h + `</div></div>`;
}
/* ---- the v1.87 look (act.lay = 3): clean white slide, no title, blocks in the year group's pale colour, English in a box
   on the right (with-English slide), and an Attempt view: one sentence at a time. Older slides (lay 2 and below) are unchanged. ---- */
const YR3 = { '7':['#5F7F24', '#F1F7E2'], '8':['#07515F', '#E3F2F5'], '9':['#78134F', '#F3EDEF'], '10':['#402347', '#F0EAF3'], '11':['#333333', '#EEEEEE'], none:['#8C6516', '#FBF1D8'] }; // [dark, pale]: the school palette (v1.88)
const yrStyle3 = act => { const c = YR3[String(act.yr)] || YR3.none; return `--yr:${c[0]};--yrs:${c[1]}`; };
const PADX3 = 0.5, PADY3 = 0.24, LINE3 = 1.1 + PADY3*2, VGAP3 = GAP*0.65, TWO_LINES3 = 2*LINE3 + VGAP3;
// Largest size (binary search) for which ok(f) holds.
function biggest(lo, hi, ok){ if(ok(hi)) return hi; for(let k = 0; k < 24; k++){ const m = (lo + hi)/2; if(ok(m)) lo = m; else hi = m; } return lo; }
// Every row gets room for two lines (a long sentence can spill onto a second line, never a third), so the text size is the same
// whichever sentences are long, and five rows always fit.
function geom3(act, Wd, H, dx){
  const n = Math.max(1, act.rows.length);
  const x0 = dx + Wd*0.04, x1 = dx + Wd*0.96, y0 = H*0.105, y1 = H*0.955;
  const rowH = (y1 - y0) / n, gap = rowH*0.16, inner = rowH - gap;
  const numD = Math.min(inner*0.34, H*0.05), cx = x0 + numD + rowH*0.12, cw = x1 - cx;
  const frW = act.en ? cw*0.66 : cw, enX = act.en ? cx + frW + cw*0.025 : 0, enW = act.en ? cw - frW - cw*0.025 : 0;
  const widths = act.rows.map(r => r.tl.map(t => textW(t)*1.03 + PADX3*2));
  // v1.88: rows may take 2, 3 or 4 lines, whichever gives the biggest text that still fits the row (few sentences = tall rows = bigger text).
  const f0 = Math.max(...[2, 3, 4].map(L => biggest(H*0.02, inner*0.92/(L*LINE3 + (L - 1)*VGAP3), f => widths.every(ws => linesFor(ws, (frW - 4)/f) <= L))));
  const f = f0 * (act.fs || 1); // the Size buttons on the Activity tab: words wrap onto more lines when it's bigger
  const fe = act.en ? biggest(H*0.016, f0*0.92, e => act.rows.every(r => wrapCount(r.en, (enW - e*1.5)/e)*1.25 <= inner*0.9/e)) : 0;
  return { n, x0, x1, y0, y1, rowH, gap, inner, numD, cx, cw, frW, enX, enW, f, fe };
}
function blocksHTML(row, order, whole){ return order.map(i => `<div class="sva-b" data-i="${i}">${esc(blockText(row, i, whole))}</div>`).join(''); }
function rowHTML3(act, row, r, G, st){
  const order = st ? st.order : row.jum, whole = !!st && (st.flag === 's' || st.flag === 'r');
  const cls = 'sva-row' + (st && st.flag === 's' ? ' ok' : st && st.flag === 'r' ? ' rev' : '');
  const y = G.y0 + r*G.rowH + G.gap/2;
  return `<div class="${cls}" data-r="${r}" style="left:${G.x0}px;top:${y}px;width:${G.x1 - G.x0}px;height:${G.inner}px">`
    + `<div class="sva-num" style="width:${G.numD}px;height:${G.numD}px;font-size:${G.numD*0.55}px">${r + 1}</div>`
    + `<div class="sva-fr" style="left:${G.cx - G.x0}px;width:${G.frW}px;font-size:${G.f}px"><div class="sva-bl">${blocksHTML(row, order, whole)}</div></div>`
    + (act.en ? `<div class="sva-enbox" style="left:${G.enX - G.x0}px;width:${G.enW}px;font-size:${G.fe}px"><span>${esc(row.en)}</span></div>` : '')
    + `</div>`;
}
function layerHTML3(act, Wd, H, dx, states, live){
  const G = geom3(act, Wd, H, dx);
  const pb = H*0.055; // v1.88: the year group's pill title, top left
  let h = (act.ttl ? '' : `<div class="sva-pill" style="left:${G.x0}px;top:${H*0.025}px;height:${pb}px;font-size:${pb*0.42}px">Sentence Unjumble</div>`)
    + act.rows.map((row, r) => rowHTML3(act, row, r, G, states && states[r])).join('');
  if(live){
    const bh = H*0.055;
    h += `<div class="sva-top" style="right:${dx + Wd*0.05}px;top:${H*0.025}px;height:${bh}px;font-size:${bh*0.36}px"><button data-a="attempt" title="Go through the sentences one at a time, full screen">${ico('pen')}<span>Question by question</span></button></div>`;
  }
  return h;
}
// The English sentence as spans: a phrase turns bold and dark once the blocks it matches are in the right places.
function englishSpans(row, order, whole){
  const parts = row.ep && row.ep.length ? row.ep : [{ t:row.en, b:row.tl.map((x, j) => j) }];
  let h = '';
  parts.forEach((p, k) => {
    const on = whole || p.b.every(j => order[j] === j);
    h += (k && !/^[,.;:!?)]/.test(p.t) ? ' ' : '') + `<span class="sva-ep${on ? ' on' : ''}">${esc(p.t)}</span>`;
  });
  return h;
}
// The Attempt view: sentence r on its own, big, with the English underneath and arrows to move on.
function attemptHTML(act, Wd, H, dx, states, r, live){
  const row = act.rows[r], st = states && states[r], order = st ? st.order : row.jum;
  const flag = st ? st.flag : '', whole = flag === 's' || flag === 'r', n = act.rows.length;
  const x0 = dx + Wd*0.07, w = Wd*0.86, top = H*0.2, ah = H*0.34;
  const ws = row.tl.map(t => textW(t)*1.03 + PADX3*2);
  const f = biggest(H*0.02, ah*0.94/TWO_LINES3, f => linesFor(ws, (w - 6)/f) <= 2) * (act.fs || 1);
  const eTop = H*0.62, eh = H*0.22, fe = biggest(H*0.016, f*0.85, e => wrapCount(row.en, (w - e*3)/e)*1.3 <= eh*0.85/e);
  const cls = 'sva-row' + (flag === 's' ? ' ok' : flag === 'r' ? ' rev' : '');
  const bh = H*0.055;
  let h = `<div class="sva-att" style="left:${dx}px;width:${Wd}px">`
    + `<div class="sva-att-t" style="left:${x0}px;top:${H*0.03}px;height:${bh}px;font-size:${bh*0.4}px">Sentence ${r + 1} of ${n}</div>`
    + `<div class="sva-row ${cls.slice(8)}" data-r="${r}" style="left:${x0}px;top:${top}px;width:${w}px;height:${ah}px"><div class="sva-fr" style="left:0;width:100%;font-size:${f}px"><div class="sva-bl">${blocksHTML(row, order, whole)}</div></div></div>`
    + `<div class="sva-enbox big" style="left:${x0}px;top:${eTop}px;width:${w}px;height:${eh}px;font-size:${fe}px"><span>${englishSpans(row, order, whole)}</span></div>`;
  if(live){
    const d = bh;
    h += `<div class="sva-top" style="right:${dx + Wd*0.05}px;top:${H*0.03}px;height:${bh}px;font-size:${bh*0.36}px">`
      + `<button data-a="att-reveal" title="${flag === 'r' ? 'Put the blocks back' : 'Put this sentence in order'}">${ico(flag === 'r' ? 'undo' : 'eye')}<span>${flag === 'r' ? 'Hide answer' : 'Reveal'}</span></button>`
      + `<button data-a="att-back" title="Back to the slide">${ico('x')}<span>Back</span></button></div>`
      + `<div class="sva-navs" style="left:${x0}px;width:${w}px;top:${H*0.88}px;height:${bh}px;font-size:${bh*0.36}px">`
      + `<button data-a="att-prev"${r === 0 ? ' disabled' : ''} title="Previous sentence">${ico('left')}<span>Previous</span></button>`
      + `<button data-a="att-next" title="${r === n - 1 ? 'Back to the slide' : 'Next sentence'}"><span>${r === n - 1 ? 'Finish' : 'Next'}</span>${ico('right')}</button></div>`;
  }
  return h + `</div>`;
}
// The activity layer for a slide. states: per row { order, flag } (null = the saved jumble).
function layerHTML(act, Wd, H, dx, states, live){
  if(act.lay >= 3) return layerHTML3(act, Wd, H, dx, states, live);
  const G = geom(act, Wd, H, dx);
  let h = '';
  act.rows.forEach((row, r) => { h += rowHTML(act, row, r, G, states && states[r], live); });
  if(live){
    const L2 = act.lay >= 2, bh = H*(L2 ? 0.056 : 0.062), top = H*(L2 ? LAY2.btnTop : 0.055);
    h += `<div class="sva-top" style="right:${(dx + Wd*0.045)}px;top:${top}px;height:${bh}px;font-size:${bh*0.36}px">
      <button data-a="shuffle" title="Jumble the rows not solved yet">${ico('shuffle')}<span>Shuffle</span></button>
      <button data-a="reset" title="Back to the start">${ico('reset')}<span>Reset</span></button></div>`;
  }
  return h;
}
/* ---- translation slides (v1.48) ---- */
// Em sizes: prompt line height, answer size (of the prompt's), gap between them, the direction tag + its gap.
const T_LH = 1.2, T_ANS = 0.88, T_GAP = 0.22, T_TAG = 0.6*5.2 + 0.45, T_PAD = 0.6;
// Lines a text needs (bold Arial) wrapped in B em; 99 if one word alone is too wide.
function wrapCount(text, B){
  const words = String(text || '').split(/\s+/).filter(Boolean); if(!words.length) return 1;
  const sp = textW(' ');
  let lines = 1, x = 0;
  for(const w of words){
    const ww = textW(w); if(ww > B) return 99;
    if(x && x + sp + ww > B){ lines++; x = ww; } else x += (x ? sp : 0) + ww;
  }
  return lines;
}
// v1.88: lines a row with chunk pairs needs when each chunk takes the room of the longer of its question and answer (as the drag-to-reveal layout does).
function chunkLines(row, B){
  if(!row.pairs) return 0;
  const sp = textW(' ');
  let lines = 1, x = 0;
  for(const p of row.pairs){
    const w = Math.max(textW(p.tl), textW(p.en)); if(w > B) return 99;
    if(x && x + sp + w > B){ lines++; x = w; } else x += (x ? sp : 0) + w;
  }
  return lines;
}
// One text size for every row. v1.48.3: on the questions slide the answer replaces the question when revealed,
// so each row only needs room for the longer of the two (one block, same size). Old answers slides (act.ans)
// still lay the answer out under the question.
function tgeom(act, Wd, H, dx){
  const n = Math.max(1, act.rows.length);
  const x0 = dx + Wd*0.035, x1 = dx + Wd*0.965, y0 = H*LAY2.rows, y1 = H*0.968;
  const rowH = (y1 - y0) / n, gap = rowH*0.08, inner = rowH - gap;
  const numD = Math.min(inner*0.5, H*0.056);
  const trayX = x0 + numD + rowH*0.12, trayW = x1 - trayX;
  const btnD = Math.min(inner - 8, H*0.062), ctlSpace = btnD + Math.min(rowH*0.2, H*0.03);
  const fits = f => {
    const B = (trayW - ctlSpace) / f - T_PAD - T_TAG;
    if(B < 3) return false;
    const room = inner / f - 0.35;
    return act.rows.every(r => {
      if(!act.ans) return Math.max(wrapCount(tPrompt(r), B), wrapCount(tAnswer(r), B), chunkLines(r, B))*T_LH <= room;
      const lp = wrapCount(tPrompt(r), B), la = wrapCount(tAnswer(r), B / T_ANS);
      return lp*T_LH + T_GAP + la*T_ANS*T_LH <= room;
    });
  };
  let lo = H*0.018, hi = act.ans ? Math.min(inner*0.42, H*0.075) : Math.min(inner*0.55, H*0.1);
  if(fits(hi)) lo = hi;
  else for(let k = 0; k < 24; k++){ const m = (lo + hi)/2; if(fits(m)) lo = m; else hi = m; }
  return { n, x0, x1, y0, y1, rowH, gap, inner, numD, trayX, trayW, btnD, ctlSpace, f:lo };
}
// v1.88: the question as chunks, each with its answer laid over it (the longer of the two sets the size, so nothing moves): dragging
// along the question fades each chunk it passes over to its answer. cs: the chunks already showing their answer.
const wordsHTML = t => String(t).split(/(\s+)/).map(s => !s || /^\s+$/.test(s) ? s : `<span class="svt-w">${esc(s)}</span>`).join('');
function chunksHTML(row, cs){
  let h = '';
  row.pairs.forEach((p, k) => {
    const q = tChunkP(row, p), a = tChunkA(row, p);
    h += (k ? tGapBefore(q) : '') + `<span class="svt-ch${cs && cs.has(k) ? ' on' : ''}" data-k="${k}"><span class="svt-cp">${wordsHTML(q)}</span><span class="svt-ca">${wordsHTML(a)}</span></span>`;
  });
  return h;
}
function trowHTML(act, row, r, G, shown, live, cs){
  const y = G.y0 + r*G.rowH + G.gap/2, rev = !act.ans && shown;
  const byChunk = live && !act.ans && !rev && row.pairs;
  let h = `<div class="sva-row svt-row${rev ? ' rev' : ''}" data-r="${r}" style="left:${G.x0}px;top:${y}px;width:${G.x1 - G.x0}px;height:${G.inner}px">`;
  h += `<div class="sva-num" style="width:${G.numD}px;height:${G.numD}px;font-size:${G.numD*0.55}px">${r + 1}</div>`;
  h += `<div class="svt-tray" style="left:${G.trayX - G.x0}px;width:${G.trayW}px;padding-right:${G.ctlSpace}px;font-size:${G.f}px">`
    + `<span class="svt-tag ${row.to === 'en' ? 'en' : 'tl'}">${esc(tTag(row, act.lang))}</span>`
    + (byChunk ? `<div class="svt-txt svt-chs">${chunksHTML(row, cs)}</div></div>`
      : rev && row.pairs ? `<div class="svt-txt svt-chr">${chunksHTML(row, new Set(row.pairs.map((p, k) => k)))}</div></div>` // revealed by the eye / Show all: same chunks, so they can fade in word by word
      : `<div class="svt-txt"><div class="svt-p">${esc(tPrompt(row))}</div><div class="svt-a">${esc(tAnswer(row))}</div></div></div>`);
  if(live && !act.ans){
    const d = G.btnD;
    h += `<div class="sva-ctl" style="right:${Math.min(G.rowH*0.1, d*0.3)}px"><button class="sva-rv${rev ? ' on' : ''}" data-a="treveal" style="width:${d}px;height:${d}px" title="${rev ? 'Hide the answer' : 'Show the answer'}">${ico(rev ? 'eyeOff' : 'eye')}</button></div>`;
  }
  return h + `</div>`;
}
function tlayerHTML(act, Wd, H, dx, shown, live, chunks){
  const G = tgeom(act, Wd, H, dx);
  let h = '';
  act.rows.forEach((row, r) => { h += trowHTML(act, row, r, G, !!(shown && shown[r]), live, chunks && chunks[r]); });
  if(live && !act.ans){
    const bh = H*0.056, all = act.rows.every((x, r) => shown && shown[r]);
    h += `<div class="sva-top" style="right:${(dx + Wd*0.045)}px;top:${H*LAY2.btnTop}px;height:${bh}px;font-size:${bh*0.36}px">
      ${all ? `<button data-a="thideall" title="Hide every answer">${ico('eyeOff')}<span>Hide all</span></button>`
        : `<button data-a="tshowall" title="Show every answer">${ico('eye')}<span>Show all</span></button>`}</div>`;
  }
  return h;
}
const isT = act => act && act.type === 'translate';
const layerClass = act => isT(act) ? 'sva svt' + (act.ans ? ' svt-ans' : ' svt-one') + (act.yr ? ' svt-yr' : '') : 'sva' + (act.en ? ' sva-has-en' : '') + (act.lay >= 3 ? ' sva3' : '');

// Static drawing (editor, thumbnails, print, the console's copy before any change).
function paint(root, act, Wd, H, dx, opts){
  Wd += 2*(dx || 0); dx = 0; // v1.88: the activity is laid out on the whole slide frame (a 4:3 deck shown 16:9 has side margins: dx), not just the deck's own 4:3 width
  if(act && act.type === 'gapfill'){ if(window.SVGap) SVGap.paint(root, act, Wd, H, dx, opts); return; } // v1.49 (gapfill.js)
  if(act && act.type === 'sbcols'){ if(window.SVCols) SVCols.paint(root, act, Wd, H, dx); return; } // v1.92 (sbcols.js)
  if(!act || !act.rows) return;
  const d = el('div', layerClass(act));
  if((act.lay >= 3 && !isT(act)) || (isT(act) && act.yr)) d.style.cssText = yrStyle3(act);
  d.innerHTML = isT(act) ? tlayerHTML(act, Wd, H, dx, null, false) : layerHTML(act, Wd, H, dx, null, false);
  root.appendChild(d);
}

/* ================= presenting ================= */
// Row states live in the slide's reveal set as 'ua|<row>|<order>|<flag>' (flag '' | 's' solved | 'r' revealed).
function actOf(P, i){
  if(!P || !P.v || !P.v.ent) return null;
  const e = P.v.ent(i);
  return e && e.src && e.src.act && (e.src.act.rows || e.src.act.type === 'gapfill' || e.src.act.type === 'sbcols') ? e.src.act : null; // v1.49: gap fill has no rows (nor do the v1.92 builder column slides)
}
function readStates(P, i, act){
  const f = C.flipped(P, i), out = act.rows.map(() => null);
  for(const k of f){
    if(typeof k !== 'string' || !k.startsWith('ua|')) continue;
    const [, r, o, flag] = k.split('|'), ri = +r;
    if(!(ri >= 0 && ri < out.length)) continue;
    const order = o.split(',').map(Number);
    if(order.length !== act.rows[ri].tl.length || order.some(x => !(x >= 0 && x < order.length))) continue;
    out[ri] = { order, flag:flag || '', key:k };
  }
  return out;
}
function writeState(P, i, r, order, flag){
  const f = C.flipped(P, i);
  for(const k of [...f]) if(typeof k === 'string' && k.startsWith('ua|' + r + '|')) f.delete(k);
  if(order) f.add(`ua|${r}|${order.join(',')}|${flag || ''}`);
}
const curKey = P => P.order[P.pos];
// v1.88: the slide's whole frame (the deck's width plus the side margins of a wider lesson ratio); activities are laid out on all of it.
const frameOf = (P, i) => { const z = P.v.rawSize(i), dx = P.v.dx(i) || 0; return { w:z.w + 2*dx, h:z.h }; };
// Called from applyVisibility (every slide change and reveal change, presenter, preview and console copies).
function sync(P){
  if(!P || !P.stage || !P.stage.slideEl) return;
  const i = curKey(P), act = actOf(P, i);
  const old = P.stage.slideEl.querySelector('.sva');
  if(!act){ return; }
  if(act.type === 'gapfill'){ if(window.SVGap) SVGap.sync(P, i, act, old); return; }
  if(act.type === 'sbcols'){ if(window.SVCols) SVCols.sync(P, i, act, old); return; }
  if(isT(act)){ tsync(P, i, act, old); return; }
  const states = readStates(P, i, act);
  const live = !P.mirror, att = act.lay >= 3 ? attGet(P, i, act) : -1;
  const sig = JSON.stringify(states.map(s => s ? s.order.join(',') + s.flag : '')) + (live ? 'L' : '') + (att >= 0 ? 'A' + att : '');
  if(old && old.dataset.sig === sig && old.isConnected) return;
  if(old && old._drag) return; // mid-drag: leave the blocks alone
  const z = frameOf(P, i), dx = 0; // v1.88: the whole slide frame
  const d = el('div', layerClass(act) + (live ? ' sva-live' : '') + (att >= 0 ? ' sva-att-on' : ''));
  if(act.lay >= 3) d.style.cssText = yrStyle3(act);
  d.innerHTML = att >= 0 ? attemptHTML(act, z.w, z.h, dx, states, att, live) : layerHTML(act, z.w, z.h, dx, states, live);
  d.dataset.sig = sig;
  if(old) old.replaceWith(d); else P.stage.slideEl.appendChild(d);
  if(live) wire(P, d, i, act);
}
// v1.87 Attempt view: 'uv|<row>' in the slide's reveal set = that sentence is on its own (so the console's copy shows it too).
function attGet(P, i, act){
  for(const k of C.flipped(P, i)) if(typeof k === 'string' && k.startsWith('uv|')){ const r = +k.slice(3); if(r >= 0 && r < act.rows.length) return r; }
  return -1;
}
function attSet(P, i, r){
  const f = C.flipped(P, i);
  for(const k of [...f]) if(typeof k === 'string' && k.startsWith('uv|')) f.delete(k);
  if(r >= 0) f.add('uv|' + r);
  C.applyVisibility(P); C.buildOverlay(P);
}
function commit(P, i, d){
  const act = actOf(P, i); if(!act) return;
  // Record the signature first so the redraw from applyVisibility leaves the (animating) blocks alone.
  const states = readStates(P, i, act);
  // A row that just solved itself (or was just un-solved) must be redrawn, so leave the signature stale for that.
  const flagsChanged = states.some((s, k) => { const el = d.querySelector(`.sva-row[data-r="${k}"]`); return !!el && !!s && (s.flag === 's' || s.flag === 'r') !== (el.classList.contains('ok') || el.classList.contains('rev')); });
  if(!flagsChanged) d.dataset.sig = JSON.stringify(states.map(s => s ? s.order.join(',') + s.flag : '')) + 'L';
  C.applyVisibility(P); C.buildOverlay(P);
}
function rowOrder(rowEl){ return [...rowEl.querySelectorAll('.sva-b')].map(b => +b.dataset.i); }
function stateOf(P, i, act, r){ return readStates(P, i, act)[r] || { order:act.rows[r].jum.slice(), flag:'' }; }
// FLIP: move block b to position idx among its row's blocks, sliding the others.
// v1.46.2: the slide starts from where each block is on screen (even mid-slide), not its old slot,
// so a block that moves twice in quick succession doesn't jump.
function moveBlock(bl, b, idx, sel = '.sva-b'){
  const others = [...bl.querySelectorAll(sel)].filter(x => x !== b);
  const ref = others[idx] || null;
  if((ref ? b.nextElementSibling === ref : !b.nextElementSibling) && b.parentNode === bl) return; // already there
  const br = bl.getBoundingClientRect(), s = br.width / (bl.offsetWidth || 1);
  const before = new Map(others.map(x => { const r = x.getBoundingClientRect(); return [x, [(r.left - br.left)/s, (r.top - br.top)/s]]; }));
  if(ref) bl.insertBefore(b, ref); else bl.appendChild(b);
  for(const x of others){
    const [l, t] = before.get(x), ddx = l - x.offsetLeft, ddy = t - x.offsetTop;
    if(Math.abs(ddx) < 0.5 && Math.abs(ddy) < 0.5) continue;
    x.style.transition = 'none'; x.style.transform = `translate(${ddx}px,${ddy}px)`;
    void x.offsetWidth;
    x.style.transition = ''; x.style.transform = '';
  }
}
// v1.46.2: where the dragged block b should go, from the finger position (px, py in the row's own units).
// Sortable-list rule: it only swaps with a block once the finger is past that block's middle, in the
// direction of travel, so a small wobble can't swap it back. Space before the first / after the last
// block of a line puts it there. Returns an index among the other blocks, or -1 for no change.
function dropIndex(bl, b, px, py, sel = '.sva-b'){
  const all = [...bl.querySelectorAll(sel)], others = all.filter(x => x !== b);
  // Lines (by slot position, ignoring the drag transform).
  const lines = [];
  for(const x of all){ const t = x.offsetTop, L = lines.find(l => Math.abs(l.top - t) < x.offsetHeight*0.5); if(L) L.items.push(x); else lines.push({ top:t, h:x.offsetHeight, items:[x] }); }
  if(!lines.length) return -1;
  lines.sort((a, c) => a.top - c.top);
  let line = lines[0];
  for(const l of lines) if(py >= l.top - l.h*0.3) line = l; // the lowest line the finger has reached
  const its = line.items.sort((a, c) => a.offsetLeft - c.offsetLeft);
  const first = its[0], last = its[its.length - 1];
  const before = x => others.indexOf(x), after = x => others.indexOf(x) + 1;
  if(px < first.offsetLeft) return first === b ? -1 : before(first);
  if(px > last.offsetLeft + last.offsetWidth) return last === b ? -1 : after(last);
  const X = its.find(x => px >= x.offsetLeft && px <= x.offsetLeft + x.offsetWidth);
  if(!X || X === b) return -1;
  const mid = X.offsetLeft + X.offsetWidth/2, xi = all.indexOf(X), bi = all.indexOf(b);
  if(xi > bi && px > mid) return after(X);
  if(xi < bi && px < mid) return before(X);
  return -1;
}
function wire(P, d, i, act){
  let g = null; // { b, row, bl, pid, x, y, gx, gy, s, live }
  const local = (bl, cx, cy) => { const r = bl.getBoundingClientRect(), s = r.width / (bl.offsetWidth || 1); return { x:(cx - r.left)/s, y:(cy - r.top)/s, s }; };
  const clearSel = () => { $$('.sva-b.sel', d).forEach(x => x.classList.remove('sel')); d._sel = null; };
  d.addEventListener('pointerdown', e => {
    if(e.button > 0) return;
    const b = e.target.closest('.sva-b'); if(!b) return;
    const row = b.closest('.sva-row'); if(!row || row.classList.contains('ok') || row.classList.contains('rev')) return;
    e.stopPropagation();
    const bl = b.parentNode, p = local(bl, e.clientX, e.clientY);
    g = { b, row, bl, pid:e.pointerId, x:e.clientX, y:e.clientY, gx:p.x - b.offsetLeft, gy:p.y - b.offsetTop, live:false };
    try{ b.setPointerCapture(e.pointerId); }catch(_){}
  });
  const move = e => {
    if(!g || e.pointerId !== g.pid) return;
    if(!g.live){
      if(Math.hypot(e.clientX - g.x, e.clientY - g.y) < 7) return;
      g.live = true; d._drag = true; clearSel();
      g.b.classList.add('sva-drag');
    }
    e.preventDefault();
    const p = local(g.bl, e.clientX, e.clientY), b = g.b;
    const idx = dropIndex(g.bl, b, p.x, p.y);
    if(idx >= 0) moveBlock(g.bl, b, idx);
    b.style.transform = `translate(${p.x - g.gx - b.offsetLeft}px,${p.y - g.gy - b.offsetTop}px)`;
  };
  const up = e => {
    if(!g || e.pointerId !== g.pid) return;
    const t = g; g = null;
    const r = +t.row.dataset.r;
    if(t.live){
      d._drag = false;
      t.b.classList.remove('sva-drag'); t.b.classList.add('sva-drop');
      t.b.style.transform = '';
      setTimeout(() => t.b.classList.remove('sva-drop'), 220);
      const st = stateOf(P, i, act, r);
      writeState(P, i, r, rowOrder(t.row), st.flag === 'r' ? '' : st.flag);
      autoSolve(P, i, act, r);
      commit(P, i, d);
      return;
    }
    if(e.type !== 'pointerup') return;
    // Tap: pick a block, then tap where it should go.
    const s = d._sel;
    if(s && s === t.b){ clearSel(); return; }
    if(s && s.parentNode === t.bl){
      // The picked block takes the tapped block's place; the blocks between slide along one.
      moveBlock(t.bl, s, [...t.bl.querySelectorAll('.sva-b')].indexOf(t.b));
      clearSel();
      writeState(P, i, r, rowOrder(t.row), '');
      autoSolve(P, i, act, r);
      commit(P, i, d);
      return;
    }
    clearSel(); t.b.classList.add('sel'); d._sel = t.b;
  };
  d.addEventListener('pointermove', move);
  d.addEventListener('pointerup', up);
  d.addEventListener('pointercancel', up);
  d.addEventListener('click', e => {
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    e.stopPropagation();
    const a = btn.dataset.a, row = btn.closest('.sva-row'), r = row ? +row.dataset.r : -1;
    if(a === 'attempt'){ const sts = readStates(P, i, act); const first = act.rows.findIndex((x, k) => !sts[k] || !sts[k].flag); attSet(P, i, first < 0 ? 0 : first); return; } // v1.87
    if(a.startsWith('att-')){
      const cur = attGet(P, i, act);
      if(a === 'att-back') attSet(P, i, -1);
      else if(a === 'att-prev') attSet(P, i, cur > 0 ? cur - 1 : -1);
      else if(a === 'att-next') attSet(P, i, cur + 1 < act.rows.length ? cur + 1 : -1);
      else if(a === 'att-reveal' && cur >= 0) toggleReveal(P, i, act, cur);
      return;
    }
    if(a === 'check') check(P, i, act, r, d);
    else if(a === 'reveal') toggleReveal(P, i, act, r);
    else if(a === 'shuffle') shuffleAll(P, i, act);
    else if(a === 'reset') resetAll(P, i, act);
  });
}
// v1.87 (look 3): a sentence that is all in the right order locks itself, with its capital and full stop (as Check did).
function autoSolve(P, i, act, r){
  if(act.lay < 3) return;
  const st = readStates(P, i, act)[r], row = act.rows[r];
  if(st && !st.flag && solved(row, st.order)) writeState(P, i, r, [...Array(row.tl.length).keys()], 's');
}
function check(P, i, act, r, d){
  const st = stateOf(P, i, act, r), row = act.rows[r];
  const order = readStates(P, i, act)[r] ? st.order : row.jum.slice();
  if(solved(row, order)){
    writeState(P, i, r, [...Array(row.tl.length).keys()], 's');
    C.applyVisibility(P); C.buildOverlay(P);
    return;
  }
  const el2 = d.querySelector(`.sva-row[data-r="${r}"]`); if(!el2) return;
  el2.classList.remove('no'); void el2.offsetWidth; el2.classList.add('no');
  setTimeout(() => el2.classList.remove('no'), 950);
}
// Reveal / put back. P.actBack keeps the order a row had before it was revealed.
function backMap(P){ if(!P.actBack) P.actBack = new Map(); return P.actBack; }
function revealRow(P, i, act, r){
  const st = stateOf(P, i, act, r);
  if(st.flag) return false;
  backMap(P).set(i + '|' + r, st.order.slice());
  writeState(P, i, r, [...Array(act.rows[r].tl.length).keys()], 'r');
  return true;
}
function unrevealRow(P, i, act, r){
  const back = backMap(P).get(i + '|' + r) || act.rows[r].jum.slice();
  backMap(P).delete(i + '|' + r);
  writeState(P, i, r, back, '');
}
function toggleReveal(P, i, act, r){
  const st = stateOf(P, i, act, r);
  if(st.flag === 'r') unrevealRow(P, i, act, r); else if(!st.flag) revealRow(P, i, act, r);
  C.applyVisibility(P); C.buildOverlay(P);
}
function shuffleAll(P, i, act){
  const sts = readStates(P, i, act);
  act.rows.forEach((row, r) => { const s = sts[r]; if(s && s.flag === 's') return; writeState(P, i, r, jumble(row.tl), ''); backMap(P).delete(i + '|' + r); });
  C.applyVisibility(P); C.buildOverlay(P);
}
function resetAll(P, i, act){
  act.rows.forEach((row, r) => { writeState(P, i, r, null); backMap(P).delete(i + '|' + r); });
  C.applyVisibility(P); C.buildOverlay(P);
}
/* ---- translation slides, presenting (v1.48): 'ta|<row>' in the reveal set = that answer showing ---- */
// v1.88: 'tc|<row>|<chunk>' = that chunk of the question is showing its answer (dragging along the question); a row whose chunks all show counts as shown.
function tChunks(P, i, act){
  const f = C.flipped(P, i);
  return act.rows.map((row, r) => new Set((row.pairs || []).map((p, k) => k).filter(k => f.has('tc|' + r + '|' + k))));
}
function tShown(P, i, act){
  const f = C.flipped(P, i), cs = tChunks(P, i, act);
  return act.rows.map((row, r) => f.has('ta|' + r) || (!!row.pairs && cs[r].size === row.pairs.length));
}
function tSet(P, i, r, on){
  const f = C.flipped(P, i);
  for(const k of [...f]) if(typeof k === 'string' && k.startsWith('tc|' + r + '|')) f.delete(k);
  if(on) f.add('ta|' + r); else f.delete('ta|' + r);
}
function tsync(P, i, act, old){
  const live = !P.mirror && !act.ans, shown = tShown(P, i, act), chunks = tChunks(P, i, act);
  const sig = 'T' + shown.map(Number).join('') + (live ? 'L' : '') + chunks.map(s => [...s].join('.')).join('|');
  if(old && old.dataset.sig === sig && old.isConnected) return;
  if(old && old._drag) return; // dragging along a question: leave it alone
  const z = frameOf(P, i), dx = 0; // v1.88: the whole slide frame
  const d = el('div', layerClass(act) + (live ? ' sva-live' : ''));
  if(act.yr) d.style.cssText = yrStyle3(act);
  d.innerHTML = tlayerHTML(act, z.w, z.h, dx, shown, live, chunks);
  d.dataset.sig = sig;
  // Answers that have just appeared fade in from left to right, in word order.
  if(old) d.querySelectorAll('.sva-row').forEach(row => {
    const orow = old.querySelector(`.sva-row[data-r="${row.dataset.r}"]`), wasRev = !!orow && orow.classList.contains('rev');
    let n = 0;
    row.querySelectorAll('.svt-ch.on').forEach(c => {
      const oc = orow && orow.querySelector(`.svt-ch[data-k="${c.dataset.k}"]`);
      if(oc && (wasRev || oc.classList.contains('on'))) return;
      c.classList.add('svt-fade');
      c.querySelectorAll('.svt-ca .svt-w').forEach(w => w.style.setProperty('--dl', Math.min(n++ * 0.16, 2.4) + 's'));
    });
  });
  if(old) old.replaceWith(d); else P.stage.slideEl.appendChild(d);
  if(live) wireChunks(P, i, act, d);
  if(live) d.addEventListener('click', e => {
    const btn = e.target.closest('button[data-a]'); if(!btn) return;
    e.stopPropagation();
    const a = btn.dataset.a, row = btn.closest('.sva-row'), r = row ? +row.dataset.r : -1;
    const now = tShown(P, i, act);
    if(a === 'treveal' && r >= 0) tSet(P, i, r, !now[r]);
    else if(a === 'tshowall') act.rows.forEach((x, k) => tSet(P, i, k, true));
    else if(a === 'thideall') act.rows.forEach((x, k) => tSet(P, i, k, false));
    C.applyVisibility(P); C.buildOverlay(P);
  });
}
// Tap a chunk of the question: it turns into its answer, one word at a time (tsync fades the words in, left to right). Tap it again to
// put the question back. Rows without chunk pairs (older slides, typed sentences) use the eye as before.
function wireChunks(P, i, act, d){
  d.addEventListener('pointerdown', e => { if(e.target.closest('.svt-chs')) e.stopPropagation(); });
  d.addEventListener('click', e => {
    const c = e.target.closest('.svt-chs .svt-ch'); if(!c) return;
    const row = c.closest('.sva-row'); if(!row) return;
    e.stopPropagation();
    const f = C.flipped(P, i), key = 'tc|' + row.dataset.r + '|' + c.dataset.k;
    if(f.has(key)) f.delete(key); else f.add(key);
    C.applyVisibility(P); C.buildOverlay(P);
  });
}
function tstep(P, i, act, d){
  if(act.ans) return false;
  const shown = tShown(P, i, act);
  if(d > 0){ const r = shown.indexOf(false); if(r < 0) return false; tSet(P, i, r, true); }
  else { const r = shown.lastIndexOf(true); if(r < 0) return false; tSet(P, i, r, false); }
  C.applyVisibility(P); C.buildOverlay(P);
  return true;
}

// Keyboard / clicker: forward reveals the next row not solved or revealed; back puts the last revealed one back.
function step(P, d){
  if(!P || P.mirror) return false;
  const i = curKey(P), act = actOf(P, i); if(!act) return false;
  if(isT(act)) return tstep(P, i, act, d);
  if(act.type === 'gapfill') return window.SVGap ? SVGap.step(P, i, act, d) : false;
  if(act.type === 'sbcols') return window.SVCols ? SVCols.step(P, i, act, d) : false;
  if(act.lay >= 3){ // v1.87: in the Attempt view the clicker / arrow keys move between sentences
    const cur = attGet(P, i, act);
    if(cur >= 0){ attSet(P, i, d > 0 ? (cur + 1 < act.rows.length ? cur + 1 : -1) : (cur > 0 ? cur - 1 : -1)); return true; }
  }
  const sts = readStates(P, i, act);
  if(d > 0){
    const r = act.rows.findIndex((row, r) => !sts[r] || !sts[r].flag);
    if(r < 0) return false;
    revealRow(P, i, act, r);
  } else {
    let r = -1; for(let k = act.rows.length - 1; k >= 0; k--) if(sts[k] && sts[k].flag === 'r'){ r = k; break; }
    if(r < 0) return false;
    unrevealRow(P, i, act, r);
  }
  C.applyVisibility(P); C.buildOverlay(P);
  return true;
}

/* ================= the picker (editor) ================= */
let PK = null;
function itemAt(doc, c, g, i){ const col = doc.cols[c]; return col && col.groups[g] && col.groups[g][i] || null; }
// A sentence's picks: Map 'c-g' → i. Sorted by column, then group.
function picksOf(s){ return [...s.entries()].map(([k, i]) => { const [c, g] = k.split('-').map(Number); return [c, g, i]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]); }
function sentRow(doc, s){
  const p = picksOf(s), items = p.map(([c, g, i]) => itemAt(doc, c, g, i)).filter(Boolean);
  return items.length ? makeRow(items, p, doc.lang) : null;
}
// Columns split into groups (positive / negative…) used with different groups in one sentence.
function mixesGroups(doc, s){
  const gs = new Set();
  for(const [c, g] of picksOf(s)) if(doc.cols[c] && doc.cols[c].groups.length > 1) gs.add(g);
  const splitCols = new Set(picksOf(s).filter(([c]) => doc.cols[c] && doc.cols[c].groups.length > 1).map(([c]) => c));
  return gs.size > 1 && splitCols.size > 1;
}
// opts.tool (v1.47, Tools → Sentence Unjumble): 1–5 sentences, a random generator (number, columns, group,
// re-roll one), opts.label for the go button, opts.onCancel, opts.random = fill at random when a builder is set.
// v1.48: opts.kind 'translate' (Translation slides, Hungry Translations): sentences as text with a direction
// each ('tl' / 'en' = the language pupils write in; opts.noDir hides it) and a pencil to type your own words.
function openPicker(opts){
  closePicker();
  const kind = opts.kind === 'translate' ? 'translate' : 'unjumble';
  const back = el('div', 'svap-back' + (opts.tool ? ' svap-tool-on' : '') + (kind === 'translate' ? ' svap-tr-on' : ''));
  back.innerHTML = `<div class="svap"><div class="svap-h">
      <div class="svap-t"><b>${esc(opts.title || (kind === 'translate' ? 'Translation' : 'Sentence unjumble'))}</b><span class="svap-sb"></span></div>
      <button class="svap-btn" data-a="change">${ico('sb', 'svap-i')}Change builder</button>
      <button class="svap-btn" data-a="cancel">${opts.tool ? 'Back' : 'Cancel'}</button>
      <button class="svap-btn go" data-a="done"></button>
    </div>
    <div class="svap-body"><div class="svap-sheet"><div class="svap-scale"></div></div><div class="svap-side"></div></div></div>`;
  document.body.appendChild(back);
  PK = { back, opts, kind, x:null, doc:null, cur:0, sents:[...Array(N_ROWS)].map(() => new Map()), fit:null, n:N_ROWS, off:new Set(), grp:'any',
    to:Array(N_ROWS).fill(opts.to === 'en' ? 'en' : 'tl'), typed:Array(N_ROWS).fill(null), ed:-1, arm:-1, armT:0 };
  back.addEventListener('click', onPickClick);
  back.addEventListener('input', onPickInput);
  PK.ro = new ResizeObserver(() => scaleSheet()); PK.ro.observe($('.svap-sheet', back));
  document.addEventListener('keydown', onPickKey, true);
  return PK;
}
function closePicker(){ if(!PK) return; clearTimeout(PK.armT); PK.ro.disconnect(); PK.back.remove(); document.removeEventListener('keydown', onPickKey, true); PK = null; }
function cancelPicker(){ const cb = PK && PK.opts.onCancel; closePicker(); if(cb) cb(); }
// The editor's keys (Delete, Ctrl+Z…) are kept away while the picker is open.
function onPickKey(e){
  if(!PK) return;
  const typing = e.target.closest && e.target.closest('input,textarea');
  if(!typing) e.stopPropagation();
  if(e.key === 'Escape'){ e.preventDefault(); if(typing && PK.ed >= 0){ PK.ed = -1; paintPick(); } else if(!$('.sbp-back')) cancelPicker(); }
  else if(/^[1-5]$/.test(e.key) && !typing && +e.key <= PK.n){ PK.cur = +e.key - 1; paintPick(); }
}
function setBuilder(x, rows){
  const K = window.SBCore;
  PK.x = x; PK.doc = x.doc;
  PK.fit = K.fitPaper(x.doc, K.PAPERS.slide, { say:false }); K.clearMeasure();
  $('.svap-scale', PK.back).innerHTML = K.sheetHTML(x.doc, K.PAPERS.slide, PK.fit.L, 'both', { fill:true, say:false });
  $('.svap-sb', PK.back).textContent = K.displayTitle(x.doc);
  PK.sents = [...Array(N_ROWS)].map(() => new Map());
  PK.off = new Set(); PK.grp = 'any'; PK.typed = Array(N_ROWS).fill(null); PK.ed = -1;
  if(PK.opts.tool || PK.kind === 'translate' || PK.kind === 'unjumble') PK.n = rows && rows.length ? Math.min(N_ROWS, rows.length) : (PK.opts.n || PK.n);
  if(rows) rows.forEach((row, r) => {
    if(r >= N_ROWS) return;
    for(const [c, g, i] of (row.src || [])) if(itemAt(x.doc, c, g, i)) PK.sents[r].set(c + '-' + g, i);
    if(PK.kind === 'translate'){ PK.to[r] = row.to === 'en' ? 'en' : 'tl'; if(row.ed || !(row.src || []).length) PK.typed[r] = { tl:row.tl || '', en:row.en || '' }; }
    if(PK.kind === 'unjumble' && row.own) PK.typed[r] = { tl:row.own.tl, en:row.own.en };
  });
  const empty = n => !PK.sents[n].size && !PK.typed[n];
  PK.cur = Math.max(0, PK.sents.findIndex((s, n) => empty(n))); if(PK.cur >= PK.n || PK.sents.every((s, n) => !empty(n))) PK.cur = 0;
  scaleSheet();
  if(PK.opts.tool && PK.opts.random && !rows) randomAll(); else paintPick();
}

/* ---- random sentences (Tools → Sentence Unjumble, v1.47) ---- */
const groupCount = doc => Math.max(1, ...doc.cols.map(c => c.groups.length));
const hasSplit = doc => doc.cols.some(c => c.groups.length > 1);
// Items column c offers a sentence in group g ([g, i] pairs): a column with one group goes with every group.
function candsFor(doc, c, g){
  const col = doc.cols[c], gi = col.groups.length === 1 ? 0 : g, grp = col.groups[gi] || [];
  return grp.map((it, i) => [gi, i]).filter(([, i]) => String(grp[i].tl || '').trim());
}
// Groups a random sentence can use: the one chosen, or (Any) those where the most included columns have something.
function groupsToUse(){
  const doc = PK.doc, G = groupCount(doc), all = [...Array(G).keys()];
  const score = g => doc.cols.reduce((n, col, c) => n + (!PK.off.has(c) && candsFor(doc, c, g).length ? 1 : 0), 0);
  if(PK.grp !== 'any') return score(+PK.grp) ? [+PK.grp] : [];
  const sc = all.map(score), best = Math.max(0, ...sc);
  return best ? all.filter(g => sc[g] === best) : [];
}
function randomSent(g){
  const doc = PK.doc, s = new Map();
  doc.cols.forEach((col, c) => {
    if(PK.off.has(c)) return;
    const cs = candsFor(doc, c, g); if(!cs.length) return;
    const [gi, i] = cs[Math.floor(rand() * cs.length)];
    s.set(c + '-' + gi, i);
  });
  return s;
}
const sentKey = s => { const r = sentRow(PK.doc, s); return r ? r.tl.join(' ') : ''; };
// v1.48 translation: sentence n as it will go on the slide (typed words win over the builder's).
function tRowOf(n){
  const t = PK.typed[n];
  if(t) return { tl:t.tl, en:t.en, to:PK.to[n], src:picksOf(PK.sents[n]), ed:true };
  const s = PK.sents[n], p = picksOf(s), items = p.map(([c, g, i]) => itemAt(PK.doc, c, g, i)).filter(Boolean);
  return items.length ? makeTRow(items, p, PK.to[n], PK.doc.lang) : null;
}
// The builder's words for sentence n (what the card shows when it isn't typed); null if nothing is picked.
function pickedText(n){
  const p = picksOf(PK.sents[n]), items = p.map(([c, g, i]) => itemAt(PK.doc, c, g, i)).filter(Boolean);
  return items.length ? { tl:tlSentence(items, PK.doc.lang), en:enSentence(items.map(it => it.en || '')) } : null;
}
// A random sentence in group g that isn't one of avoid (after 40 tries, the last one made).
function freshSent(g, avoid){
  let last = new Map();
  for(let t = 0; t < 40; t++){ const s = randomSent(g); last = s; if(s.size >= 2 && !avoid.has(sentKey(s))) return s; }
  return last;
}
const shuffled = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function randomAll(){
  const gs = groupsToUse();
  if(!gs.length){ paintPick(); toast('Nothing to pick from: include some columns.'); return; }
  const order = shuffled(gs), seen = new Set();
  for(let n = 0; n < N_ROWS; n++){
    if(n >= PK.n){ PK.sents[n] = new Map(); continue; }
    const s = freshSent(order[n % order.length], seen); PK.sents[n] = s; PK.typed[n] = null; seen.add(sentKey(s));
  }
  PK.cur = 0; paintPick();
}
function rollOne(n){
  const gs = groupsToUse();
  if(!gs.length){ toast('Nothing to pick from: include some columns.'); return; }
  const seen = new Set(PK.sents.slice(0, PK.n).map(sentKey));
  PK.sents[n] = freshSent(gs[Math.floor(rand() * gs.length)], seen); PK.typed[n] = null;
  if(PK.ed === n) PK.ed = -1;
  PK.cur = n; paintPick();
}
// Group buttons are labelled with the start of the group's first item in the first split column.
function groupLabel(doc, g){
  const col = doc.cols.find(c => c.groups.length > g && c.groups.length > 1), it = col && col.groups[g] && col.groups[g][0];
  const t = it ? String(it.tl || '').replace(/\s+/g, ' ').trim() : '';
  return t ? (t.length > 16 ? t.slice(0, 15).trim() + '…' : t) : 'Group ' + (g + 1);
}
function toolHTML(){
  const doc = PK.doc, G = groupCount(doc);
  const seg = (k, opts) => `<span class="svap-seg">${opts.map(([v, l]) => `<button data-${k}="${v}" class="${String(PK[k === 'n' ? 'n' : 'grp']) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</span>`;
  return `<div class="svap-tool">
    <div class="svap-tr"><span>Sentences</span>${seg('n', [1, 2, 3, 4, 5].map(n => [n, n]))}</div>
    ${hasSplit(doc) ? `<div class="svap-tr"><span>Group</span>${seg('grp', [['any', 'Any']].concat([...Array(G).keys()].map(g => [g, groupLabel(doc, g)])))}</div>` : ''}
    <button class="svap-btn go svap-rand" data-a="rand">${ico('dice', 'svap-i')}Random sentences</button>
    <p class="svap-help">Tap a column title to leave that column out (shorter sentences). Tap items to change a sentence yourself; ${ico('dice', 'svap-i svap-ii')} makes a new one.</p>
  </div>`;
}
function scaleSheet(){
  if(!PK || !PK.doc) return;
  const K = window.SBCore, host = $('.svap-sheet', PK.back), sc = $('.svap-scale', PK.back);
  const W = K.PAPERS.slide.w * K.MM, H = K.PAPERS.slide.h * K.MM, hw = host.clientWidth - 24, hh = host.clientHeight - 24;
  const k = Math.max(0.1, Math.min(hw / W, hh / H));
  sc.style.transform = `scale(${k})`; sc.style.left = Math.round((host.clientWidth - W*k)/2) + 'px'; sc.style.top = Math.round((host.clientHeight - H*k)/2) + 'px';
}
function paintPick(){
  if(!PK || !PK.doc) return;
  const doc = PK.doc, K = window.SBCore;
  // Items: background in the colour of every sentence that uses them.
  $$('.svap .sb-h').forEach(e => e.classList.toggle('pk-off', PK.off.has(+e.dataset.c)));
  $$('.svap .sb-it').forEach(e => {
    const c = +e.dataset.c, g = +e.dataset.g, i = +e.dataset.i, key = c + '-' + g;
    e.classList.toggle('pk-off', PK.off.has(c));
    const by = PK.sents.map((s, n) => n < PK.n && s.get(key) === i ? n : -1).filter(n => n >= 0);
    e.classList.toggle('pk', by.length > 0);
    e.classList.toggle('pk-cur', by.includes(PK.cur));
    e.style.background = !by.length ? '' : by.length === 1 ? PICK[by[0]] : `linear-gradient(135deg, ${by.map((n, j) => `${PICK[n]} ${j*100/by.length}% ${(j + 1)*100/by.length}%`).join(', ')})`;
    // Other groups of a split column dim once this sentence uses a group there (still tappable).
    const cur = PK.sents[PK.cur], gUsed = picksOf(cur).filter(([cc]) => doc.cols[cc] && doc.cols[cc].groups.length > 1 && cc !== c).map(p => p[1]);
    e.classList.toggle('pk-dim', doc.cols[c] && doc.cols[c].groups.length > 1 && gUsed.length > 0 && !gUsed.includes(g) && !by.includes(PK.cur));
  });
  const side = $('.svap-side', PK.back);
  if(PK.kind === 'translate'){ side.innerHTML = tSideHTML(); goButton(); return; }
  if(PK.kind === 'unjumble' && !PK.opts.tool){ side.innerHTML = uSideHTML(); goButton(); return; }
  const seen = new Map();
  let h = PK.opts.tool ? toolHTML() : `<p class="svap-help">Pick a colour, then tap one item in each column you want. Tap an item again to take it off. Columns can be skipped.</p>`;
  PK.sents.forEach((s, n) => {
    if(n >= PK.n) return;
    const row = sentRow(doc, s), on = n === PK.cur;
    const warn = [];
    if(row){
      const t = row.tl.join(' ');
      if(seen.has(t)) warn.push(`Same as sentence ${seen.get(t) + 1}`); else seen.set(t, n);
      if(s.size < 2) warn.push('Needs at least 2 items');
      else if(row.tl.length < MIN_BLOCKS) warn.push(`Only ${row.tl.length} blocks: too few words to split further`);
      if(mixesGroups(doc, s)) warn.push('Mixes groups (e.g. positive and negative)');
      if(PK.opts.tool && row.tl.length > LONG_BLOCKS) warn.push(`${row.tl.length} blocks: long for the board. Leave a column out (tap its title) or re-roll.`);
    }
    h += `<div class="svap-s${on ? ' on' : ''}" data-s="${n}" style="--c:${PICK[n]}">
      <div class="svap-sh"><span class="svap-dot">${n + 1}</span><span class="svap-sl">${row ? row.tl.length + ' blocks' : on ? 'Tap items in the builder' : 'Empty'}</span>${PK.opts.tool ? `<button class="svap-clr" data-roll="${n}" title="A new random sentence">${ico('dice', 'svap-i')}</button>` : ''}${s.size ? `<button class="svap-clr" data-clr="${n}" title="Clear this sentence">${ico('x', 'svap-i')}</button>` : ''}</div>`
      + (row ? `<div class="svap-chunks">${row.tl.map(t => `<span>${esc(t)}</span>`).join('')}</div><div class="svap-en">${esc(row.en)}</div>` : '')
      + warn.map(w => `<div class="svap-w">${esc(w)}</div>`).join('') + `</div>`;
  });
  side.innerHTML = h;
  goButton();
}
function goButton(){
  const ready = readyRows();
  const go = $('[data-a=done]', PK.back);
  go.textContent = PK.opts.label || (PK.opts.edit ? 'Save sentences' : PK.kind === 'translate' ? 'Insert slide' : 'Insert 2 slides');
  go.disabled = !ready.ok;
  go.title = ready.ok ? '' : ready.why;
}
/* ---- the picker's side panel for translation (v1.48) ---- */
function tSideHTML(){
  const doc = PK.doc, L = LANG(doc.lang).name, noDir = !!PK.opts.noDir;
  const seg = (attr, opts, on) => `<span class="svap-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${on(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</span>`;
  let h = PK.opts.tool ? toolHTML() : `<div class="svap-tool">
    <div class="svap-tr"><span>Sentences</span>${seg('n', [1, 2, 3, 4, 5].map(n => [n, n]), v => PK.n === v)}</div>
    ${noDir ? '' : `<div class="svap-tr"><span>Into</span>${seg('toall', [['tl', L], ['en', 'English']], v => PK.to.slice(0, PK.n).every(t => t === v))}</div>`}
    <p class="svap-help">Pick a colour, then tap one item in each column. Columns can be skipped. ${ico('pen', 'svap-i svap-ii')} types your own words (${esc(L)} and English).</p>
  </div>`;
  const seen = new Map();
  for(let n = 0; n < PK.n; n++){
    const s = PK.sents[n], row = tRowOf(n), on = n === PK.cur, typed = PK.typed[n], editing = PK.ed === n;
    const warn = [];
    if(row && !editing){
      const t = row.tl.trim();
      if(t && seen.has(t)) warn.push(`Same as sentence ${seen.get(t) + 1}`); else if(t) seen.set(t, n);
      if(typed){ if(!typed.tl.trim() || !typed.en.trim()) warn.push(`Type both the ${L} and the English`); }
      else if(s.size < 2) warn.push('Needs at least 2 items');
      if(mixesGroups(doc, s) && !typed) warn.push('Mixes groups (e.g. positive and negative)');
    }
    const label = typed ? 'Your own words' : row ? s.size + ' item' + (s.size === 1 ? '' : 's') : on ? 'Tap items in the builder' : 'Empty';
    h += `<div class="svap-s${on ? ' on' : ''}${typed ? ' typed' : ''}" data-s="${n}" style="--c:${PICK[n]}">
      <div class="svap-sh"><span class="svap-dot">${n + 1}</span><span class="svap-sl">${label}</span>`
      + (noDir ? '' : `<button class="svap-dir" data-dir="${n}" title="Change which way this one goes">${esc(tTag({ to:PK.to[n] }, doc.lang))}</button>`)
      + (PK.opts.tool ? `<button class="svap-clr" data-roll="${n}" title="A new random sentence">${ico('dice', 'svap-i')}</button>` : '')
      + `<button class="svap-clr${editing ? ' on' : ''}" data-edit="${n}" title="${editing ? 'Done typing' : 'Type your own words'}">${ico(editing ? 'check' : 'pen', 'svap-i')}</button>`
      + (s.size || typed ? `<button class="svap-clr" data-clr="${n}" title="Clear this sentence">${ico('x', 'svap-i')}</button>` : '') + `</div>`;
    if(editing){
      const v = typed || { tl:'', en:'' };
      h += `<label class="svap-lab">${esc(L)}</label><textarea class="svap-in" data-in="tl" data-n="${n}" rows="2" spellcheck="false">${esc(v.tl)}</textarea>
        <label class="svap-lab">English</label><textarea class="svap-in" data-in="en" data-n="${n}" rows="2" spellcheck="false">${esc(v.en)}</textarea>
        <div class="svap-edh">${s.size ? 'Tapping builder words for this sentence replaces what you type.' : ''}<button class="svap-btn go svap-edone" data-edit="${n}">Done</button></div>`;
    } else if(row){
      h += `<div class="svap-tls">${esc(row.tl)}</div><div class="svap-en">${esc(row.en)}</div>`;
    }
    h += warn.map(w => `<div class="svap-w">${esc(w)}</div>`).join('') + `</div>`;
  }
  return h;
}
// v1.50 unjumble: the side panel. Own words per sentence (pencil), builder picks otherwise.
function uSideHTML(){
  const doc = PK.doc, L = LANG(doc.lang).name;
  const seg = (attr, opts, on) => `<span class="svap-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${on(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</span>`;
  let h = `<div class="svap-tool">
    <div class="svap-tr"><span>Sentences</span>${seg('n', [1, 2, 3, 4, 5].map(n => [n, n]), v => PK.n === v)}</div>
    <p class="svap-help">Pick a colour, then tap one item in each column. Columns can be skipped. ${ico('pen', 'svap-i svap-ii')} types your own words (${esc(L)} and English). Each word you type becomes one block.</p>
  </div>`;
  const seen = new Map();
  for(let n = 0; n < PK.n; n++){
    const s = PK.sents[n], on = n === PK.cur, typed = PK.typed[n], editing = PK.ed === n;
    const txt = typed || pickedText(n);
    const warn = [];
    if(txt && !editing){
      const t = txt.tl.trim();
      if(t && seen.has(t)) warn.push(`Same as sentence ${seen.get(t) + 1}`); else if(t) seen.set(t, n);
      if(typed){
        if(!typed.tl.trim() || !typed.en.trim()) warn.push(`Type both the ${L} and the English`);
        else { const r = makeOwnRow(typed, []); if(r && r.tl.length > LONG_BLOCKS) warn.push(`${r.tl.length} blocks: long for the board. Shorten the sentence.`); }
      }
      else if(s.size < 2) warn.push('Needs at least 2 items');
      else {
        const r = sentRow(doc, s);
        if(r && r.tl.length < MIN_BLOCKS) warn.push(`Only ${r.tl.length} blocks: too few words to split further`);
        if(mixesGroups(doc, s)) warn.push('Mixes groups (e.g. positive and negative)');
      }
    }
    const label = typed ? 'Your own words' : s.size ? s.size + ' item' + (s.size === 1 ? '' : 's') : on ? 'Tap items in the builder' : 'Empty';
    h += `<div class="svap-s${on ? ' on' : ''}${typed ? ' typed' : ''}" data-s="${n}" style="--c:${PICK[n]}">
      <div class="svap-sh"><span class="svap-dot">${n + 1}</span><span class="svap-sl">${label}</span>`
      + `<button class="svap-clr${editing ? ' on' : ''}" data-edit="${n}" title="${editing ? 'Done typing' : 'Type your own words'}">${ico(editing ? 'check' : 'pen', 'svap-i')}</button>`
      + (s.size || typed ? `<button class="svap-clr" data-clr="${n}" title="Clear this sentence">${ico('x', 'svap-i')}</button>` : '') + `</div>`;
    if(editing){
      const v = typed || { tl:'', en:'' };
      h += `<label class="svap-lab">${esc(L)}</label><textarea class="svap-in" data-in="tl" data-n="${n}" rows="2" spellcheck="false">${esc(v.tl)}</textarea>
        <label class="svap-lab">English</label><textarea class="svap-in" data-in="en" data-n="${n}" rows="2" spellcheck="false">${esc(v.en)}</textarea>
        <div class="svap-edh">${s.size ? 'Tap builder words to put them in at the cursor.' : ''}<button class="svap-btn go svap-edone" data-edit="${n}">Done</button></div>`;
    } else if(txt){
      h += `<div class="svap-tls">${esc(txt.tl)}</div><div class="svap-en">${esc(txt.en)}</div>`;
    }
    h += warn.map(w => `<div class="svap-w">${esc(w)}</div>`).join('') + `</div>`;
  }
  return h;
}
// v1.50: put text in a text box at its cursor, with a space either side where one is needed.
function putIn(ta, text){
  if(!ta || !text) return;
  const v = ta.value, a = ta.selectionStart ?? v.length, b = ta.selectionEnd ?? a;
  const pre = v.slice(0, a), post = v.slice(b);
  const lead = pre && !/\s$/.test(pre) ? ' ' : '';
  const tail = post && !/^[\s,.;:!?)]/.test(post) ? ' ' : '';
  ta.value = pre + lead + text + tail + post;
  const pos = (pre + lead + text).length;
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles:true }));
}
// Leaving the text boxes: typed words that match the builder's sentence exactly aren't "your own" any more.
function closeEdit(){
  const n = PK.ed; if(n < 0) return;
  PK.ed = -1;
  const t = PK.typed[n]; if(!t) return;
  t.tl = t.tl.replace(/\s+/g, ' ').trim(); t.en = t.en.replace(/\s+/g, ' ').trim();
  const gen = pickedText(n);
  if((gen && gen.tl === t.tl && gen.en === t.en) || (!t.tl && !t.en)) PK.typed[n] = null;
}
function onPickInput(e){
  const ta = e.target.closest && e.target.closest('textarea[data-in]'); if(!ta || !PK) return;
  const n = +ta.dataset.n;
  if(!PK.typed[n]){ const r = tRowOf(n); PK.typed[n] = { tl:r ? r.tl : '', en:r ? r.en : '' }; }
  PK.typed[n][ta.dataset.in] = ta.value;
  goButton();
}
function readyRows(){
  const rows = [];
  if(PK.kind === 'translate'){
    const L = LANG(PK.doc.lang).name;
    for(let n = 0; n < PK.n; n++){
      const t = PK.typed[n];
      if(t){ if(!t.tl.trim() || !t.en.trim()) return { ok:false, why:`Sentence ${n + 1}: type both the ${L} and the English` }; }
      else if(PK.sents[n].size < 2) return { ok:false, why:`Sentence ${n + 1} needs at least 2 items` };
      const r = tRowOf(n); r.tl = r.tl.replace(/\s+/g, ' ').trim(); r.en = r.en.replace(/\s+/g, ' ').trim();
      rows.push(r);
    }
    return { ok:true, rows };
  }
  for(const [n, s] of PK.sents.entries()){
    if(n >= PK.n) break;
    const t = PK.typed[n];
    if(t){ // v1.50: your own words (and the builder's picks, kept for Edit sentences)
      if(!t.tl.trim() || !t.en.trim()) return { ok:false, why:`Sentence ${n + 1}: type both the ${LANG(PK.doc.lang).name} and the English` };
      if(t.tl.trim().split(/\s+/).length < 2) return { ok:false, why:`Sentence ${n + 1} needs at least 2 words` };
      rows.push(makeOwnRow(t, picksOf(s)));
      continue;
    }
    if(s.size < 2) return { ok:false, why:`Sentence ${n + 1} needs at least 2 items` };
    rows.push(sentRow(PK.doc, s));
  }
  return { ok:true, rows };
}
function onPickClick(e){
  if(!PK) return;
  if(e.target.closest('textarea, .svap-lab')) return; // typing your own words
  const it = e.target.closest('.sb-it');
  if(it && PK.doc){
    const c = +it.dataset.c, g = +it.dataset.g, i = +it.dataset.i, s = PK.sents[PK.cur], key = c + '-' + g;
    if(PK.off.has(c)){ toast('That column is left out: tap its title to put it back.'); return; }
    if(PK.kind === 'unjumble' && !PK.opts.tool && PK.typed[PK.cur] && PK.ed === PK.cur){
      // v1.50: while typing your own words, a builder item goes in at the cursor (no second tap, nothing replaced).
      const item = itemAt(PK.doc, c, g, i), n = PK.cur;
      if(item){
        putIn($(`textarea[data-n="${n}"][data-in="tl"]`, PK.back), String(item.tl || '').replace(/\s+/g, ' ').trim());
        putIn($(`textarea[data-n="${n}"][data-in="en"]`, PK.back), String(item.en || '').replace(/\s+/g, ' ').trim());
      }
      return;
    }
    if(PK.typed[PK.cur]){
      // v1.48: typed words are replaced by builder words only on a second tap.
      if(PK.arm !== PK.cur){
        PK.arm = PK.cur; clearTimeout(PK.armT); PK.armT = setTimeout(() => { if(PK) PK.arm = -1; }, 4000);
        toast(`Sentence ${PK.cur + 1} has your own words. Tap again to replace them with the builder's.`);
        return;
      }
      PK.arm = -1; clearTimeout(PK.armT); PK.typed[PK.cur] = null; if(PK.ed === PK.cur) PK.ed = -1;
    }
    if(s.get(key) === i) s.delete(key); else s.set(key, i);
    paintPick(); return;
  }
  const ed = e.target.closest('[data-edit]');
  if(ed){
    const n = +ed.dataset.edit;
    if(PK.ed === n){ closeEdit(); paintPick(); return; }
    closeEdit(); PK.cur = n; PK.ed = n;
    if(!PK.typed[n]){ const r = tRowOf(n); PK.typed[n] = { tl:r ? r.tl : '', en:r ? r.en : '' }; }
    paintPick();
    const ta = $(`textarea[data-n="${n}"][data-in="tl"]`, PK.back); if(ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    return;
  }
  const dir = e.target.closest('[data-dir]');
  if(dir){ const n = +dir.dataset.dir; PK.to[n] = PK.to[n] === 'en' ? 'tl' : 'en'; PK.cur = n; paintPick(); return; }
  const ta2 = e.target.closest('[data-toall]');
  if(ta2){ PK.to = PK.to.map(() => ta2.dataset.toall); paintPick(); return; }
  if(PK.ed >= 0 && !e.target.closest(`[data-s="${PK.ed}"]`)){ closeEdit(); if(!e.target.closest('button, [data-s], .sb-h')){ paintPick(); return; } }
  const hd = PK.opts.tool && PK.doc && e.target.closest('.sb-h');
  if(hd){
    const c = +hd.dataset.c;
    if(PK.off.has(c)) PK.off.delete(c);
    else { PK.off.add(c); PK.sents.forEach(s => { for(const k of [...s.keys()]) if(+k.split('-')[0] === c) s.delete(k); }); }
    paintPick(); return;
  }
  const nb = e.target.closest('[data-n]');
  if(nb){ PK.n = +nb.dataset.n; if(PK.cur >= PK.n) PK.cur = PK.n - 1; if(PK.ed >= PK.n) PK.ed = -1; if(PK.opts.tool) for(let n = 0; n < PK.n; n++) if(PK.sents[n].size < 2 && !PK.typed[n] && PK.sents.slice(0, PK.n).some(x => x.size)) { const gs = groupsToUse(); if(gs.length) PK.sents[n] = freshSent(gs[Math.floor(rand() * gs.length)], new Set(PK.sents.slice(0, PK.n).map(sentKey))); } paintPick(); return; }
  const gb = e.target.closest('[data-grp]');
  if(gb){ PK.grp = gb.dataset.grp; randomAll(); return; }
  const rb = e.target.closest('[data-roll]');
  if(rb){ e.stopPropagation(); rollOne(+rb.dataset.roll); return; }
  const clr = e.target.closest('[data-clr]');
  if(clr){ const n = +clr.dataset.clr; PK.sents[n].clear(); PK.typed[n] = null; if(PK.ed === n) PK.ed = -1; PK.cur = n; paintPick(); return; }
  const card = e.target.closest('[data-s]');
  if(card){ if(PK.ed === +card.dataset.s) return; PK.cur = +card.dataset.s; paintPick(); return; }
  const b = e.target.closest('[data-a]'); if(!b) return;
  if(b.dataset.a === 'cancel') cancelPicker();
  else if(b.dataset.a === 'rand') randomAll();
  else if(b.dataset.a === 'change') chooseBuilder(PK.opts.year, x => { if(PK) setBuilder(x); });
  else if(b.dataset.a === 'done'){
    closeEdit();
    const r = readyRows(); if(!r.ok){ paintPick(); toast(r.why); return; }
    const x = PK.x, K = window.SBCore, done = PK.opts.onDone;
    const meta = { lang:x.doc.lang, q:{ tl:x.doc.q.tl, en:x.doc.q.en }, sb:{ year:x.loc.year, term:x.loc.term, name:x.loc.name, title:K.displayTitle(x.doc) } };
    closePicker();
    done(r.rows, meta);
  }
}
function chooseBuilder(year, onPick, onCancel){
  if(!window.SVSentence || !SVSentence.choose){ toast('The Sentence Builder files aren\'t loaded.'); return; }
  SVSentence.choose({ year, onPick, onCancel });
}

/* ================= editor hooks ================= */
const H_TITLE = 'Sentence Unjumble';
// v1.46.3 layout (act.lay = 2): smaller title higher up, rows start just under it. Older activity slides
// (no lay) keep the v1.46 title (36pt at 5%) and rows at 16.5% until Edit sentences / New jumble upgrades them.
const LAY2 = { size:28, y:0.022, rows:0.125, btnTop:0.03 };
const T_TITLE = 'Translation';
function headerObj(E, dx, id, title){
  const W = E.v.base.size().w, Hh = E.v.base.size().h;
  const k = { size:LAY2.size }, line = Math.ceil(k.size*1.2 + 8);
  let html = window.PPTX.newTextHtml('Arial', { size:k.size }).replace('<span style="', '<span style="font-weight:700;').replace('>​</span>', '>' + (title || H_TITLE) + '</span>');
  return { id:id || uid(), x:Math.round((W + 2*dx)*0.045), y:Math.round(Hh*LAY2.y), w:Math.round(W*0.55), h:line, html }; // v1.88: 4.5% of the whole frame, as the rows are laid out
}
// The title every activity slide starts with (Sentence Unjumble, Gap Fill, "French Translation"): bold 36, the year group's dark colour, top left,
// lined up with where the activity's content starts (xf: that left edge as a fraction of the slide's whole frame). An ordinary text box, so it can be edited.
const TITLE_SIZE = 36;
function titleObj(E, dx, title, yr, xf){
  const W = E.v.base.size().w, Hh = E.v.base.size().h, line = Math.ceil(TITLE_SIZE*1.2 + 8);
  const col = (YR3[String(yr)] || YR3.none)[0];
  const html = window.PPTX.newTextHtml('Arial', { size:TITLE_SIZE, color:col, bold:true }).replace('>​</span>', '>' + esc(title) + '</span>');
  return { id:uid(), x:Math.round((W + 2*dx)*xf), y:Math.round(Hh*0.012), w:Math.round(W*0.6), h:line, html };
}
// Bring an activity's slides up to the current layout: the title is swapped for the new one if it's still
// where v1.46 put it (one you've moved or restyled is left alone, and so is the layout).
function upgradeLayout(E, gid){
  const Hh = E.v.base.size().h;
  for(const e of gidEntries(E.l, gid)){
    if(e.src.act.lay >= 2 || isT(e.src.act)) continue;
    const h = E.l.hides && E.l.hides.pptx && E.l.hides.pptx[e.k];
    const t = h && (h.added || []).find(o => o.html && o.html.includes(H_TITLE));
    if(t && Math.abs(t.y - Math.round(Hh*0.05)) > 2) continue;
    if(t){ const n = headerObj(E, E.v.dx(e.k) || 0, t.id); t.y = n.y; t.h = n.h; t.html = n.html; }
    e.src.act.lay = 2;
  }
}
// The lesson's year group: from its theme (its Design → Themes choice, else its year folder, e.g. Year 9/…), else from a label like "9A…".
function lessonYear(E){
  const k = C.themeKey ? C.themeKey(E.l) : null;
  if(['7', '8', '9', '10', '11'].includes(k)) return Number(k);
  return C.yearOf ? C.yearOf(E.l.label) : null;
}
// Insert → Activity → Sentence unjumble.
function insertUnjumble(E){
  if(E.mode !== 'pptx'){ toast('Activities can only go into the PowerPoint version.', true); return; }
  const year = lessonYear(E);
  chooseBuilder(year, x => {
    openPicker({ year, onDone:(rows, meta) => {
      const gid = uid();
      // v1.87: look 3: a white slide, no title, the year group's colours. yr is kept so the slides look the same wherever they're shown.
      const yrN = year >= 7 && year <= 11 ? String(year) : 'none';
      const base = Object.assign({ type:'unjumble', v:1, lay:3, yr:yrN, ttl:true, gid, rows }, meta); // ttl: the title is a text box on the slide, not the old pill
      const ks = [C.newSlideKey(E.l)]; let k2; do k2 = C.newSlideKey(E.l); while(k2 === ks[0]); ks.push(k2);
      const ents = [false, true].map((en, n) => ({ k:ks[n], src:{ blank:true, act:Object.assign(clone(base), { en }) } }));
      C.slideOp(E, list => {
        let at = list.findIndex(e => e.k === E.i); at = at < 0 ? list.length : at + 1;
        list.splice(at, 0, ...ents);
        for(const e of ents) E.l.hides[E.mode][e.k] = { obj:{}, covers:[], added:[titleObj(E, E.v.dx(e.k) || 0, H_TITLE, yrN, 0.04)], bg:'#FFFFFF' };
        E.i = ents[0].k; E.selS = new Set(ents.map(e => e.k)); E.anchorS = ents[0].k; E.sel = null; E.selCover = null;
      });
      toast('Added: Sentence Unjumble, without and with English');
    } });
    setBuilder(x);
  });
}
// Insert → Activity → Translation (v1.48): the same steps, one slide "Translation" (v1.48.3; was two, the second
// with the answers: revealing now swaps each question for its answer, and Show all does the answers slide's job).
function insertTranslation(E){
  if(E.mode !== 'pptx'){ toast('Activities can only go into the PowerPoint version.', true); return; }
  const year = lessonYear(E);
  chooseBuilder(year, x => {
    openPicker({ kind:'translate', year, onDone:(rows, meta) => {
      const gid = uid();
      const to = rows.every(r => r.to === 'en') ? 'en' : 'tl';
      const yrN = year >= 7 && year <= 11 ? String(year) : 'none';
      const base = Object.assign({ type:'translate', v:1, lay:2, yr:yrN, gid, to, rows }, meta);
      const ents = [{ k:C.newSlideKey(E.l), src:{ blank:true, act:Object.assign(clone(base), { ans:false }) } }];
      C.slideOp(E, list => {
        let at = list.findIndex(e => e.k === E.i); at = at < 0 ? list.length : at + 1;
        list.splice(at, 0, ...ents);
        for(const e of ents) E.l.hides[E.mode][e.k] = { obj:{}, covers:[], added:[titleObj(E, E.v.dx(e.k) || 0, LANG(base.lang).name + ' ' + T_TITLE, yrN, 0.035)] };
        E.i = ents[0].k; E.selS = new Set(ents.map(e => e.k)); E.anchorS = ents[0].k; E.sel = null; E.selCover = null;
      });
      toast('Added: Translation');
    } });
    setBuilder(x);
  });
}
// Every slide in the lesson (both versions) that belongs to activity gid.
function gidEntries(l, gid){
  const out = [];
  for(const m of ['pptx', 'pdf']) for(const e of ((l.slides && l.slides[m]) || [])) if(e.src && e.src.act && e.src.act.gid === gid) out.push(e);
  return out;
}
function curAct(E){ const e = E.v.ent(E.i); return e && e.src && e.src.act ? e.src.act : null; }
async function editSentences(E){
  const act = curAct(E); if(!act) return;
  if(act.type === 'gapfill'){ if(window.SVGap) SVGap.edit(E); return; }
  if(act.type === 'sbcols'){ if(window.SVCols) SVCols.edit(E); return; }
  let list;
  try{ list = await SVSentence.list(); }catch(err){ toast("Couldn't read the Sentence Builders folder: " + err.message, true); return; }
  const sb = act.sb || {};
  const x = list.find(x => x.loc.year === sb.year && x.loc.term === sb.term && x.loc.name === sb.name)
    || list.find(x => window.SBCore.displayTitle(x.doc) === sb.title && x.doc.lang === act.lang);
  const year = lessonYear(E);
  const opts = { year, edit:true, kind:isT(act) ? 'translate' : 'unjumble', to:act.to, onDone:(rows, meta) => {
    const n = gidEntries(E.l, act.gid).filter(e => !e.del).length;
    C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) Object.assign(e.src.act, clone(meta), { rows:clone(rows) }); upgradeLayout(E, act.gid); });
    toast(n > 1 ? 'Sentences saved (both slides)' : 'Sentences saved');
  } };
  if(x){ openPicker(opts); setBuilder(x, act.rows); }
  else {
    toast(`“${sb.title || 'The builder'}” isn't in the Sentence Builders folder any more: choose one`, true);
    chooseBuilder(year, y => { openPicker(opts); setBuilder(y); });
  }
}
function newJumble(E){
  const act = curAct(E); if(!act) return;
  if(act.type === 'gapfill'){ if(window.SVGap) SVGap.shuffleBank(E); return; }
  if(act.type === 'sbcols') return;
  const rows = act.rows.map(r => Object.assign({}, r, { jum:jumble(r.tl) }));
  C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.rows = clone(rows); upgradeLayout(E, act.gid); });
  toast('New jumble (both slides)');
}
// Bigger / smaller text in the unjumble sentences: act.fs scales the automatic size (both slides); lines wrap onto more rows as needed.
function textSize(E, dir){
  const act = curAct(E); if(!act || act.type !== 'unjumble') return;
  const fs = Math.max(0.5, Math.min(2, Math.round(((act.fs || 1) + dir*0.1)*10)/10));
  C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.fs = fs; });
}
// More / fewer chunks in the unjumble sentences (both slides): + splits each sentence's longest multi-word chunk in two (at the best word gap);
// − joins the two neighbouring chunks that are shortest together. A sentence keeps at least 2 chunks. The English phrases follow along.
function splitRow(row){
  let j = -1;
  row.tl.forEach((t, i) => { if(t.trim().split(/\s+/).length > 1 && (j < 0 || t.length > row.tl[j].length)) j = i; });
  const s = j < 0 ? null : splitChunk(row.tl[j]); if(!s) return false;
  row.tl.splice(j, 1, s[0], s[1]);
  if(row.ep) row.ep.forEach(p => { p.b = p.b.flatMap(x => x < j ? [x] : x === j ? [j, j + 1] : [x + 1]); });
  row.jum = jumble(row.tl);
  return true;
}
function joinRow(row){
  if(row.tl.length < 3) return false;
  let j = 0;
  for(let i = 1; i < row.tl.length - 1; i++) if(row.tl[i].length + row.tl[i + 1].length < row.tl[j].length + row.tl[j + 1].length) j = i;
  row.tl.splice(j, 2, row.tl[j] + ' ' + row.tl[j + 1]);
  if(row.ep) row.ep.forEach(p => { p.b = [...new Set(p.b.map(x => x > j ? x - 1 : x))]; });
  row.jum = jumble(row.tl);
  return true;
}
function chunkCount(E, dir){
  const act = curAct(E); if(!act || act.type !== 'unjumble') return;
  const rows = clone(act.rows);
  if(!rows.map(r => dir > 0 ? splitRow(r) : joinRow(r)).some(Boolean)){ toast(dir > 0 ? 'Every chunk is a single word already' : 'Each sentence needs at least two chunks', true); return; }
  C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.rows = clone(rows); upgradeLayout(E, act.gid); });
}
function activityMenu(E, anchor){
  C.openMenu(anchor, [{ label:'Sentence unjumble', run:() => insertUnjumble(E) }, { label:'Translation', run:() => insertTranslation(E) }]
    .concat(window.SVGap ? [{ label:'Gap fill', run:() => SVGap.insert(E) }] : [])
    .concat(window.SVCols ? [{ label:'Sentence builder columns', run:() => SVCols.insert(E) }] : []));
}
// Edit text (v1.48, translation slides): type over the TL and the English of each sentence, change its direction,
// add (up to 5) or take out sentences. No builder needed. Rows changed here are marked ed:true.
function editText(E){
  const act = curAct(E); if(!isT(act)) return;
  const L = LANG(act.lang).name;
  let rows = act.rows.map(r => Object.assign({}, r, { tl0:r.tl, en0:r.en }));
  const rowHTML = (r, n) => `<div class="svte-r" data-n="${n}">
      <span class="svte-num">${n + 1}</span>
      <button class="btn svte-dir" data-a="dir" title="Change which way this one goes">${esc(tTag(r, act.lang))}</button>
      <div class="svte-f"><label>${esc(L)}</label><textarea data-in="tl" rows="2" spellcheck="false">${esc(r.tl)}</textarea></div>
      <div class="svte-f"><label>English</label><textarea data-in="en" rows="2" spellcheck="false">${esc(r.en)}</textarea></div>
      <button class="btn svte-x" data-a="del" title="Take this sentence out" ${rows.length < 2 ? 'disabled' : ''}>${ico('x', 'svap-i')}</button></div>`;
  C.modal(`<h2>Edit text: Translation</h2><p class="svte-help">Change any words in the ${esc(L)} or the English ${gidEntries(E.l, act.gid).filter(e => !e.del).length > 1 ? ' (the answers slide updates too)' : ''}. The arrow button changes which language pupils write in.</p>
    <div class="svte-rows"></div><div class="svte-add"></div>
    <div class="foot"><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="save">Save</button></div>`, (m, close) => {
    m.classList.add('svte');
    const box = $('.svte-rows', m), add = $('.svte-add', m);
    const read = () => { $$('.svte-r', box).forEach(r => { const n = +r.dataset.n; rows[n].tl = $('[data-in=tl]', r).value; rows[n].en = $('[data-in=en]', r).value; }); };
    const paintRows = () => {
      box.innerHTML = rows.map(rowHTML).join('');
      add.innerHTML = rows.length < N_ROWS ? `<button class="btn" data-a="add">${ico('plus', 'svap-i')} Add a sentence</button>` : '';
    };
    paintRows();
    m.addEventListener('keydown', e => e.stopPropagation());
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if(!b || b.disabled) return;
      const a = b.dataset.a, r = b.closest('.svte-r'), n = r ? +r.dataset.n : -1;
      if(a === 'cancel'){ close(); return; }
      read();
      if(a === 'dir'){ rows[n].to = rows[n].to === 'en' ? 'tl' : 'en'; paintRows(); }
      else if(a === 'del'){ rows.splice(n, 1); paintRows(); }
      else if(a === 'add'){ rows.push({ tl:'', en:'', to:rows.length ? rows[rows.length - 1].to : 'tl', src:[], ed:true }); paintRows(); const t = $$('.svte-r [data-in=tl]', box).pop(); if(t) t.focus(); }
      else if(a === 'save'){
        const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
        const out = [];
        for(const [k, x] of rows.entries()){
          const tl = clean(x.tl), en = clean(x.en);
          if(!tl && !en) continue;
          if(!tl || !en){ toast(`Sentence ${k + 1}: type both the ${L} and the English`, true); return; }
          out.push({ tl, en, to:x.to === 'en' ? 'en' : 'tl', src:x.src || [], ed:!!x.ed || x.tl0 !== tl || x.en0 !== en });
        }
        if(!out.length){ toast('Keep at least one sentence.', true); return; }
        const n = gidEntries(E.l, act.gid).filter(e => !e.del).length;
        C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.rows = clone(out); });
        close(); toast(n > 1 ? 'Sentences saved (both slides)' : 'Sentences saved');
      }
    });
  });
}

// Edit text (v1.50, unjumble): type any words in the target language and the English, or add (up to 5) / take out
// sentences. A sentence whose text is unchanged keeps its builder picks and its jumble; a changed one becomes
// your own words (one block per word), with its picks kept for Edit sentences.
function editUText(E){
  const act = curAct(E); if(!act || act.type !== 'unjumble') return;
  const L = LANG(act.lang).name;
  const rows = act.rows.map(r => { const t = ownText(r); return { tl:t.tl, en:t.en, tl0:t.tl, en0:t.en, src:r.src || [], orig:r }; });
  const rowHTML = (r, n) => `<div class="svte-r" data-n="${n}">
      <span class="svte-num">${n + 1}</span>
      <div class="svte-f"><label>${esc(L)}</label><textarea data-in="tl" rows="2" spellcheck="false">${esc(r.tl)}</textarea></div>
      <div class="svte-f"><label>English</label><textarea data-in="en" rows="2" spellcheck="false">${esc(r.en)}</textarea></div>
      <button class="btn svte-x" data-a="del" title="Take this sentence out" ${rows.length < 2 ? 'disabled' : ''}>${ico('x', 'svap-i')}</button></div>`;
  const both = gidEntries(E.l, act.gid).filter(e => !e.del).length > 1;
  C.modal(`<h2>Edit text: Sentence unjumble</h2><p class="svte-help">Type any words in the ${esc(L)} or the English${both ? ' (both slides update)' : ''}. Each word becomes one block. Words are not limited to the sentence builder.</p>
    <div class="svte-rows"></div><div class="svte-add"></div>
    <div class="foot"><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="save">Save</button></div>`, (m, close) => {
    m.classList.add('svte');
    const box = $('.svte-rows', m), add = $('.svte-add', m);
    const read = () => { $$('.svte-r', box).forEach(r => { const n = +r.dataset.n; rows[n].tl = $('[data-in=tl]', r).value; rows[n].en = $('[data-in=en]', r).value; }); };
    const paintRows = () => {
      box.innerHTML = rows.map(rowHTML).join('');
      add.innerHTML = rows.length < N_ROWS ? `<button class="btn" data-a="add">${ico('plus', 'svap-i')} Add a sentence</button>` : '';
    };
    paintRows();
    m.addEventListener('keydown', e => e.stopPropagation());
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if(!b || b.disabled) return;
      const a = b.dataset.a, r = b.closest('.svte-r'), n = r ? +r.dataset.n : -1;
      if(a === 'cancel'){ close(); return; }
      read();
      if(a === 'del'){ rows.splice(n, 1); paintRows(); }
      else if(a === 'add'){ rows.push({ tl:'', en:'', tl0:'', en0:'', src:[], orig:null }); paintRows(); const t = $$('.svte-r [data-in=tl]', box).pop(); if(t) t.focus(); }
      else if(a === 'save'){
        const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
        const out = [];
        for(const [k, x] of rows.entries()){
          const tl = clean(x.tl), en = clean(x.en);
          if(!tl && !en) continue;
          if(!tl || !en){ toast(`Sentence ${k + 1}: type both the ${L} and the English`, true); return; }
          if(x.orig && tl === x.tl0 && en === x.en0){ out.push(x.orig); continue; }
          const row = makeOwnRow({ tl, en }, x.src);
          if(!row){ toast(`Sentence ${k + 1}: type some ${L} words`, true); return; }
          out.push(row);
        }
        if(!out.length){ toast('Keep at least one sentence.', true); return; }
        const n = gidEntries(E.l, act.gid).filter(e => !e.del).length;
        C.slideOp(E, () => { for(const e of gidEntries(E.l, act.gid)) e.src.act.rows = clone(out); });
        close(); toast(n > 1 ? 'Sentences saved (both slides)' : 'Sentences saved');
      }
    });
  });
}

/* ================= styles ================= */
const CSS = `
.sva{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;-webkit-user-select:none;user-select:none}
.sva-row{position:absolute;display:block}
.sva-num{position:absolute;left:0;top:50%;transform:translateY(-50%);border-radius:50%;background:#26262c;color:#fff;font-weight:700;display:grid;place-items:center;line-height:1}
.sva-tray{position:absolute;top:0;bottom:0;border-radius:.45em;background:#f1f2f6;border:.07em solid #d3d6df;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding-left:.45em;padding-top:.1em;padding-bottom:.1em}
.sva-en{font-size:.82em;color:#3a3a44;line-height:1.15;margin:0 0 .18em .1em;font-weight:400}
.sva-bl{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:${GAP*0.5}em ${GAP}em;line-height:1.1}
.sva-b{position:relative;background:#fff;color:#111114;font-weight:700;padding:${PADY}em ${PADX}em;border:${BORD}em solid #2b2b33;border-radius:.32em;box-shadow:0 .09em 0 #2b2b33;white-space:nowrap;touch-action:none;transition:transform .18s ease}
.sva-live .sva-b,.sva-live button{pointer-events:auto}
.sva-live .sva-b{cursor:grab}
.sva-live .sva-b.sva-drag{transition:none;z-index:5;cursor:grabbing;box-shadow:0 .25em .6em rgba(0,0,0,.28);background:#fffbe0}
.sva-live .sva-b.sva-drop{transition:transform .2s ease}
.sva-live .sva-b.sel{background:#FFE94D;box-shadow:0 0 0 .14em #F5B700,0 .09em 0 #2b2b33}
.sva-row.ok .sva-tray{background:#dff5d8;border-color:#7cc96b}
.sva-row.ok .sva-b{border-color:#2f8a1f;box-shadow:0 .09em 0 #2f8a1f;background:#f3fff0}
.sva-row.ok .sva-num{background:#2f8a1f}
.sva-row.rev .sva-tray{background:#fff4d2;border-color:#e9b81e}
.sva-row.rev .sva-b{border-color:#b98a00;box-shadow:0 .09em 0 #b98a00}
.sva-live .sva-row.ok .sva-b,.sva-live .sva-row.rev .sva-b{cursor:default}
.sva-row.no .sva-tray{animation:sva-shake .5s;background:#ffe0e0;border-color:#e06666}
@keyframes sva-shake{0%,100%{transform:none}20%,60%{transform:translateX(-.35em)}40%,80%{transform:translateX(.35em)}}
.sva-ctl{position:absolute;top:50%;transform:translateY(-50%);display:flex;flex-direction:column}
.sva-ctl button{border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;padding:0;color:#fff;touch-action:manipulation}
.sva-ck{background:#2f8a1f}
.sva-rv{background:#5b5b66}
.sva-rv.on{background:#b98a00}
.sva-i{width:58%;height:58%;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.sva-top{position:absolute;display:flex;gap:.6em}
.sva-top button{height:100%;padding:0 1em;border-radius:999px;border:.12em solid #c9ccd6;background:#fff;color:#33333b;font:600 1em/1 Arial,sans-serif;display:flex;align-items:center;gap:.45em;cursor:pointer}
.sva-top .sva-i{width:1.35em;height:1.35em;stroke-width:2.2}
/* look 3 (act.lay >= 3, v1.87): white slide, blocks in the year group's pale colour, English in a box, the Attempt view */
.sva3 .sva-num{background:var(--yr)}
.sva3 .sva-pill{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 1.1em;border-radius:999px;background:var(--yr);color:#fff;font-weight:700;white-space:nowrap;line-height:1}
.sva3 .sva-fr{position:absolute;top:0;bottom:0;display:flex;align-items:center}
.sva3 .sva-bl{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:${GAP*0.65}em ${GAP}em;line-height:1.1}
.sva3 .sva-b{position:relative;background:var(--yrs);color:#111114;font-weight:700;padding:${PADY3}em ${PADX3}em;border:0;border-radius:.55em;box-shadow:none;white-space:nowrap;touch-action:none;transition:transform .18s ease}
.sva3.sva-live .sva-b{cursor:grab}
.sva3.sva-live .sva-b.sva-drag{cursor:grabbing;box-shadow:0 .25em .6em rgba(0,0,0,.22)}
.sva3 .sva-row.ok .sva-b,.sva3 .sva-row.rev .sva-b{background:var(--yr);color:#fff;cursor:default;border:0;box-shadow:none}
.sva3 .sva-enbox{position:absolute;top:0;bottom:0;display:flex;align-items:center;box-sizing:border-box;padding:0 .7em;border-radius:.7em;background:#f3f4f7;color:#2b2b33;line-height:1.25}
.sva3 .sva-enbox.big{bottom:auto;padding:.2em 1em;justify-content:center;text-align:center}
.sva3 .sva-ep{font-weight:400;color:#5a5b66;transition:color .25s}
.sva3 .sva-ep.on{font-weight:700;color:var(--yr)}
.sva-att{position:absolute;top:0;bottom:0;background:#fff;font-family:Arial,'Liberation Sans',Helvetica,sans-serif}
.sva-att-t{position:absolute;display:flex;align-items:center;font-weight:700;color:var(--yr)}
.sva-att .sva-row{position:absolute}
.sva-navs{position:absolute;display:flex;justify-content:space-between}
.sva-navs button,.sva-att .sva-top button{height:100%;padding:0 1em;border-radius:999px;border:.12em solid #c9ccd6;background:#fff;color:#33333b;font:600 1em/1 Arial,sans-serif;display:flex;align-items:center;gap:.45em;cursor:pointer}
.sva-navs button:disabled{opacity:.35;cursor:default}
.sva-navs .sva-i{width:1.35em;height:1.35em;stroke-width:2.2}
.stage-frame.blurred .sva-live{visibility:hidden}

.svap-back{position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:14px}
.svap{background:#1c1c1f;color:#f2f2f4;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:min(1500px,98vw);height:min(900px,96vh);display:flex;flex-direction:column;overflow:hidden;-webkit-user-select:none;user-select:none}
.svap-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #2e2e34}
.svap-t{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;font-size:18px;white-space:nowrap;overflow:hidden}
.svap-t b{font-weight:600}
.svap-sb{color:#a9a9b3;font-size:15px;overflow:hidden;text-overflow:ellipsis}
.svap-btn{height:40px;padding:0 14px;border-radius:10px;border:0;background:#2a2a2f;color:inherit;font:inherit;font-size:15px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
.svap-btn:hover{background:#34343a}
.svap-btn.go{background:#F5B700;color:#111;font-weight:600}
.svap-btn.go:hover{background:#ffc928}
.svap-btn[disabled]{opacity:.45;cursor:default}
.svap-i{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.svap-body{flex:1;min-height:0;display:flex}
.svap-sheet{flex:1;min-width:0;position:relative;overflow:hidden;background:#3a3a40}
.svap-scale{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 4px 18px rgba(0,0,0,.4)}
.svap .sb-it{cursor:pointer;border-radius:.28em;transition:background-color .12s,opacity .12s}
.svap .sb-it:hover{box-shadow:0 0 0 .14em #9aa0b4}
.svap .sb-it.pk{box-shadow:0 0 0 .2em rgba(0,0,0,0)}
.svap .sb-it.pk-cur{box-shadow:0 0 0 .16em #111114}
.svap .sb-it.pk-dim{opacity:.35}
.svap-side{width:360px;flex:none;overflow:auto;padding:10px 12px 16px;display:flex;flex-direction:column;gap:8px}
.svap-help{margin:2px 2px 4px;color:#a9a9b3;font-size:13.5px;line-height:1.4}
.svap-s{border:2px solid #33333a;border-radius:14px;padding:8px 10px;background:#25252a;cursor:pointer}
.svap-s.on{border-color:var(--c);background:#2c2c32}
.svap-sh{display:flex;align-items:center;gap:8px}
.svap-dot{width:26px;height:26px;border-radius:50%;background:var(--c);color:#111;font-weight:700;display:grid;place-items:center;font-size:14px;flex:none}
.svap-sl{flex:1;font-size:14px;color:#c9c9d1}
.svap-clr{width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:#a9a9b3;display:grid;place-items:center;cursor:pointer}
.svap-clr:hover{background:#3a3a42;color:#fff}
.svap-chunks{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.svap-chunks span{background:#fff;color:#111;font-weight:700;font-size:13.5px;padding:2px 7px;border-radius:6px;border:1.5px solid #2b2b33;font-family:Arial,sans-serif}
.svap-en{margin-top:6px;color:#bdbdc6;font-size:13px;line-height:1.35}
.svap-w{margin-top:5px;color:#ffb38a;font-size:12.5px}
.svap-tool{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:#25252a;border:2px solid #33333a}
.svap-tr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.svap-tr>span:first-child{width:72px;color:#c9c9d1;font-size:14px}
.svap-seg{display:flex;flex-wrap:wrap;gap:4px;flex:1}
.svap-seg button{min-width:36px;height:34px;padding:0 10px;border-radius:9px;border:0;background:#34343a;color:#e9e9ee;font:inherit;font-size:14px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svap-seg button.on{background:#F5B700;color:#111;font-weight:600}
.svap-rand{justify-content:center}
.svap-ii{width:14px;height:14px;vertical-align:-2px}
.svap-tool .svap-help{margin:0}
.svap-tool-on .svap .sb-h{cursor:pointer}
.svap .sb-h.pk-off{text-decoration:line-through;opacity:.45}
.svap .sb-it.pk-off{opacity:.18;cursor:not-allowed}
/* translation (v1.48) */
.svt-tray{position:absolute;top:0;bottom:0;border-radius:.45em;background:#f1f2f6;border:.07em solid #d3d6df;box-sizing:border-box;display:flex;align-items:center;gap:.45em;padding:.08em 0 .08em .45em}
.svt-tag{flex:none;width:5.2em;font-size:.6em;font-weight:700;text-align:center;border-radius:.6em;padding:.3em 0;background:#26262c;color:#fff;letter-spacing:.02em;white-space:nowrap}
.svt-tag.en{background:#1f5fa8}
.svt-txt{flex:1;min-width:0;line-height:${T_LH}}
.svt-p{font-weight:700;color:#111114}
.svt-a{margin-top:${T_GAP}em;font-size:${T_ANS}em;font-weight:400;color:#14532d;visibility:hidden}
.svt-ans .svt-a,.svt-row.rev .svt-a{visibility:visible}
.svt-chs{font-weight:700;touch-action:manipulation;-webkit-user-select:none;user-select:none;cursor:pointer;pointer-events:auto}
.svt-ch{display:inline-grid;vertical-align:top}
.svt-ch>span{grid-area:1/1;transition:opacity .3s}
.svt-cp{color:#111114}
.svt-ca{color:#7a4b00;opacity:0}
.svt-ch.on .svt-cp{opacity:0}.svt-ch.on .svt-ca{opacity:1}
.svt-yr .svt-tray{background:var(--yrs);border-color:var(--yrs)}
.svt-yr .svt-tag,.svt-yr .svt-tag.en{background:var(--yr)}
.svt-yr .sva-num{background:var(--yr)}
.svt-yr .svt-ca,.svt-yr .svt-row.rev .svt-a{color:var(--yr)}
.svt-yr .svt-row.rev .svt-tray{background:var(--yrs);border-color:var(--yr)}
.svt-chr{font-weight:700}
.svt-chr .svt-cp{display:none}
@keyframes svtIn{from{opacity:0}to{opacity:1}}
.svt-fade .svt-ca .svt-w{animation:svtIn .4s ease both;animation-delay:var(--dl,0s)}
.svt-chs .svt-ca{display:none}
.svt-chs .svt-ch.on .svt-ca{display:inline}
.svt-chs .svt-ch.on .svt-cp{display:none}
.svt-row.rev .svt-tray{background:#fff4d2;border-color:#e9b81e}
.svt-row.rev .svt-a{font-weight:700;color:#7a4b00}
.svt .sva-ctl{gap:0}
.svt-one .svt-a{display:none;margin-top:0;font-size:1em;font-weight:700}
.svt-one .svt-row.rev .svt-p{display:none}
.svt-one .svt-row.rev .svt-a{display:block;visibility:visible}
.svap-dir{height:30px;padding:0 9px;border-radius:8px;border:0;background:#34343a;color:#e9e9ee;font:600 12.5px/1 Arial,sans-serif;cursor:pointer;white-space:nowrap}
.svap-dir:hover{background:#44444c}
.svap-clr.on{background:#F5B700;color:#111}
.svap-tls{margin-top:7px;color:#fff;font-weight:700;font-size:14.5px;line-height:1.35;font-family:Arial,sans-serif}
.svap-s.typed .svap-sl{color:#F5B700}
.svap-lab{display:block;margin:8px 2px 3px;color:#a9a9b3;font-size:12.5px}
.svap-in{width:100%;box-sizing:border-box;resize:vertical;min-height:44px;border-radius:9px;border:1.5px solid #44444c;background:#141417;color:#fff;font:600 14.5px/1.35 Arial,sans-serif;padding:6px 8px}
.svap-in:focus{outline:none;border-color:var(--c)}
.svap-edh{display:flex;align-items:center;gap:8px;margin-top:8px;color:#a9a9b3;font-size:12px;line-height:1.3}
.svap-edh .svap-edone{margin-left:auto;height:32px}
.modal.svte{width:min(980px,96vw);max-height:92vh;overflow:auto}
.svte-help{margin-top:0}
.svte-rows{display:flex;flex-direction:column;gap:10px;margin:12px 0}
.svte-r{display:grid;grid-template-columns:28px 92px 1fr 1fr 40px;gap:10px;align-items:center}
.svte-num{width:28px;height:28px;border-radius:50%;background:#26262c;color:#fff;font-weight:700;display:grid;place-items:center}
.svte-dir{padding:0 8px;white-space:nowrap}
.svte-f label{display:block;font-size:12.5px;opacity:.7;margin-bottom:3px}
.svte-f textarea{width:100%;box-sizing:border-box;resize:vertical;font:15px/1.35 Arial,sans-serif;padding:6px 8px;border-radius:8px;border:1px solid #c9ccd6}
.svte-x{width:40px;padding:0;display:grid;place-items:center}
.svte .svap-i{stroke:currentColor}
.svte-add{margin-bottom:6px}
.svte-add .btn{display:inline-flex;align-items:center;gap:6px}
`;
const st = document.createElement('style'); st.id = 'sv-activities-css'; st.textContent = CSS; document.head.appendChild(st);

window.SVAct = { CSS, paint, sync, step, insertUnjumble, insertTranslation, editSentences, textSize, chunkCount, titleObj, editText: E => (curAct(E) && curAct(E).type === 'unjumble' ? editUText : editText)(E), newJumble, activityMenu, curAct,
  // v1.47: the picker and block helpers for the Tools box version (unjumble.js).
  picker:{ open:openPicker, setBuilder, close:closePicker, get open_(){ return !!PK; } },
  _:{ makeRow, toBlocks, splitChunk, jumble, solved, geom, blockText, rowText, moveBlock, dropIndex, capFirst, makeTRow, tlSentence, tPrompt, tAnswer, tgeom },
  // v1.48: every Translation activity in a lesson (one per gid, slides not deleted), for Hungry Translations.
  translations(l){
    const out = [], seen = new Set();
    for(const m of ['pptx', 'pdf']) for(const e of ((l && l.slides && l.slides[m]) || [])){
      const a = e && !e.del && e.src && e.src.act;
      if(!isT(a) || seen.has(a.gid) || !Array.isArray(a.rows) || !a.rows.length) continue;
      seen.add(a.gid); out.push(clone(a));
    }
    return out;
  } };
})();
