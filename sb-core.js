/* Sentence Builders — shared core (v0.4, 2026-10-15)
   Used by the editor (builder.html → builder.js) and the presenter in the Slideshow Viewer
   (index.html → sb-present.js). The house style, the document model, the sheet renderer and auto-fit
   live here so a builder looks the same in print, in the slide image and on the board.
   Classic script (no modules: the pages are opened from the OneDrive folder). Exposes window.SBCore. */
(function(){
'use strict';
const VERSION = '0.7';
const SB_DIR = 'Sentence Builders', BIN_DIR = '.Bin', UNCAT = 'Uncategorised';
const YEARS = [7,8,9,10,11];
// 'Other' is no longer a half-term in the lists (2026-10-21). Builders that aren't filed in a year and half-term go in UNCAT.
const TERMS = ['1 - Autumn 1','2 - Autumn 2','3 - Spring 1','4 - Spring 2','5 - Summer 1','6 - Summer 2'];
// Where a builder's file goes: its year and half-term, or Uncategorised (year and term null).
const placeOf = d => d.uncat ? { year:null, term:null } : { year:d.year, term:d.term };
const LANGS = { fr:{ name:'French', short:'FR' }, es:{ name:'Spanish', short:'ES' } };
const MM = 96/25.4, PT = 96/72;
// Paper: size in mm, margin in mm, font range in pt. min = accessibility floor (11pt A5, 12pt A4).
// auto = the largest size Auto will use, so sparse builders don't come out huge and builders look alike.
// one = the largest size when only one language is showing (presenter only; slide).
const PAPERS = {
  A5:     { key:'A5',     label:'A5',        w:210,    h:148,   m:6, min:11, max:16, auto:14 },
  A4:     { key:'A4',     label:'A4',        w:297,    h:210,   m:8, min:12, max:18, auto:16 },
  A4fold: { key:'A4fold', label:'A4 folded', w:297,    h:210,   m:8, min:12, max:18, auto:14 },
  slide:  { key:'slide',  label:'Slide',     w:338.67, h:190.5, m:4, min:12, max:28, auto:28, one:36 },
};
const SIZES = [11,12,13,14,15,16,17,18];
const GMAX = 2.6; // most space (em) between items when a column has room to spread out
// A column is only split into sub-columns (auto) when every item in it is this short or shorter (characters).
// Long phrases shrink the text instead, so they aren't broken into two columns (reading order stays intact).
const SHORT_ITEM = 18;
// 16:9 slide (Auto size only): text shrinks first. Columns split into sub-columns only once the text would go below this size.
const SLIDE_SPLIT_FLOOR = 16;
const EN_RATIO = 0.85; // English, pronunciation and column titles: 85% of the text size (floor: paper minimum)
const VERSIONS = { both:'Both languages', tl:'@ only', en:'English only', lines:'@ + lines', gaps:'Gaps' };
// s = silent letters (grey). Only offered on the target language.
const COLOURS = { r:'Red', b:'Blue', g:'Green', p:'Purple', s:'Silent' };

/* The sheet's look (house style). Used on screen, in print and inside the slide image. */
const SHEET_CSS = `
.sb-page{box-sizing:border-box;background:#fff;color:#000;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;display:flex;flex-direction:column;line-height:1.18;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sb-page *{box-sizing:border-box}
.sb{border-collapse:collapse;width:100%;table-layout:auto}
.sb.fixed{table-layout:fixed}
.sb th,.sb td{border:0.3mm solid #000;text-align:center;vertical-align:middle}
.sb-q{background:#000;color:#fff;font-weight:bold;padding:0.35em 0.6em}
.sb-q .qen{font-weight:normal;color:#e4e4e4;margin-left:0.4em}
.sb-h{background:#e6e6e6;font-weight:normal;padding:0.25em 0.4em}
.sb td{padding:0.3em 0.35em;height:1px}
.sb td.join{border-right:0}
.sb td.join-r{border-left:0}
.sb-cell{display:flex;justify-content:space-around;align-items:stretch;gap:1.2em;height:100%}
/* A sub-column is never narrower than its longest one-line item, so words can't spill into the next one. */
.sb-sub{display:flex;flex-direction:column;align-items:stretch;justify-content:center}
/* Spacing between items: at least --gap (set by auto-fit); columns with spare room spread out, up to --gmax, and stay centred. */
.sb-sp{flex:1 1 0;min-height:var(--gap,0.55em);max-height:var(--gmax,2.6em)}
.sb-it{text-align:center}
.sb-it .tl{font-weight:bold;display:block;position:relative}
.sb-it .tl,.sb-it .en{text-wrap:balance}
.sb-it .nw{white-space:nowrap}
.sb-it .en{display:block;position:relative;font-size:var(--enf,1em)}
.sb-it .c-r{color:#c00000}.sb-it .c-b{color:#0047b3}.sb-it .c-g{color:#00792a}.sb-it .c-p{color:#7030a0}.sb-it .c-s{color:#6b6b6b}
.sb-it .en .c-r,.sb-it .en .c-b,.sb-it .en .c-g,.sb-it .en .c-p{font-weight:bold}
.sb-it .say{display:block;color:#b34700;text-wrap:balance;font-size:var(--enf,1em)}
/* v0.6: respellings are never printed or put in the slide image; they're shown in the presenter's pop-out (sb-present.js).
   Editor preview only, in Respellings mode: words that have a respelling get a dotted underline. */
.sb-it .pw.hl{text-decoration:underline dotted #b34700;text-decoration-thickness:0.12em;text-underline-offset:0.2em}
/* One language only (presenter): English on its own is bold, at the full text size (--enf is set to it). */
.only-en .sb-it .en{font-weight:bold}
/* One language only: the other language's lines are removed (not just hidden), so they don't leave uneven gaps between items. */
.v-tl .sb-it .en,.v-en .sb-it .tl,.v-en .sb-it .say{display:none}
.v-lines .sb-it .en,.v-gaps .sb-it.gap .tl,.v-gaps .sb-it.gap .say{visibility:hidden}
.v-lines .sb-it .en::after,.v-gaps .sb-it.gap .tl::after{content:'';visibility:visible;position:absolute;left:6%;right:6%;bottom:0.05em;border-bottom:0.25mm solid #666}
.sb-empty{color:transparent}
`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 10);
const fileSafe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled sentence builder';
const lname = d => LANGS[d.lang] ? LANGS[d.lang].name : 'French';
const TIERS = { F:'Foundation', H:'Higher' };
const hasTier = y => +y >= 10; // tiers only mean anything in Years 10–11
// Language from a class code: "9B/Fr2" → fr, "8C/Sp1" → es. Anything else (Form, extras) → '' (Both).
function langOf(label){ const s = String(label || ''); return /\b(fr\d*|french)\b/i.test(s) ? 'fr' : /\b(sp\d*|spanish)\b/i.test(s) ? 'es' : ''; }
const termShort = t => t.replace(/^\d - /, '');
// f = { q, lang, year, term, tier }. A search looks across every year, half-term and tier (the language still applies).
// The tier filter only narrows Years 10–11; builders with no tier are for both, so they always show.
function builderMatches(x, f){
  if(f.lang && x.doc.lang !== f.lang) return false;
  const q = (f.q || '').trim().toLowerCase();
  if(q) return (displayTitle(x.doc) + ' ' + x.doc.q.tl + ' ' + x.doc.q.en + ' ' + (x.loc.name || '')).toLowerCase().includes(q);
  if(f.year && x.loc.year !== f.year) return false;
  if(f.term && x.loc.term !== f.term) return false;
  if(f.tier && hasTier(x.loc.year) && x.doc.tier && x.doc.tier !== f.tier) return false;
  return true;
}
const filterBuilders = (list, f) => (list || []).filter(x => builderMatches(x, f));
const byTitle = (a, b) => displayTitle(a.doc).localeCompare(displayTitle(b.doc), 'en', { numeric:true, sensitivity:'base' });
// Filter tab rows shared by the Settings page and the lesson gallery. c = { chip, sep } class names.
// Counts: years within the language; half-terms within language + year; tiers within language + year + half-term.
function filterRows(list, f, c){
  const L = list ? list.filter(x => !f.lang || x.doc.lang === f.lang) : null, now = currentTerm();
  const chip = (attr, val, on, label, count, extra) => `<button type="button" class="${c.chip}${on ? ' on' : ''}${extra || ''}" ${attr}="${esc(String(val))}">${label}${L && count != null ? `<em>${count}</em>` : ''}</button>`;
  const sep = `<span class="${c.sep}"></span>`;
  const inYear = L ? L.filter(x => !f.year || x.loc.year === f.year) : null;
  const inTerm = inYear ? inYear.filter(x => !f.term || x.loc.term === f.term) : null;
  const years = chip('data-fy', '', !f.year, 'All years') + YEARS.map(y => chip('data-fy', y, f.year === y, 'Year ' + y, L && L.filter(x => x.loc.year === y).length)).join('');
  const langs = [['', 'Both'], ['fr', 'French'], ['es', 'Spanish']].map(([k, l]) => chip('data-fl', k, f.lang === k, l)).join('');
  const terms = chip('data-ft', '', !f.term, 'All half-terms') + TERMS.map(t => chip('data-ft', t, f.term === t, esc(termShort(t)), inYear && inYear.filter(x => x.loc.term === t).length, t === now ? ' now' : '')).join('');
  const tiers = hasTier(f.year) ? chip('data-fi', '', !f.tier, 'Both tiers') + Object.keys(TIERS).map(k => chip('data-fi', k, f.tier === k, TIERS[k], inTerm && inTerm.filter(x => !x.doc.tier || x.doc.tier === k).length)).join('') : '';
  return { top: years + sep + langs, terms, tiers };
}
// Applies a filter tab press (button with data-fy / data-fl / data-ft / data-fi / data-fclear) to f. Returns false if b isn't one.
function applyFilter(f, b){
  const d = b.dataset;
  if(d.fclear !== undefined){ f.year = null; f.term = ''; f.tier = ''; f.lang = ''; f.q = ''; return true; }
  if(d.fy !== undefined){ f.year = d.fy ? +d.fy : null; if(!hasTier(f.year)) f.tier = ''; }
  else if(d.fl !== undefined) f.lang = d.fl;
  else if(d.ft !== undefined) f.term = d.ft;
  else if(d.fi !== undefined) f.tier = d.fi;
  else return false;
  f.q = ''; // a search ignores the tabs, so pressing one ends the search
  return true;
}
// "No Spanish sentence builders for Year 8 · Spring 1 (Higher) yet."
function emptyText(f){
  if((f.q || '').trim()) return 'Nothing matches.';
  const bits = [f.year ? 'Year ' + f.year : '', f.term ? termShort(f.term) : ''].filter(Boolean).join(' · ');
  return `No ${f.lang ? LANGS[f.lang].name + ' ' : ''}sentence builders${bits ? ' for ' + bits : ''}${f.tier && hasTier(f.year) ? ' (' + TIERS[f.tier] + ')' : ''} yet.`;
}
function currentTerm(){ const m = new Date().getMonth() + 1; return TERMS[{9:0,10:0,11:1,12:1,1:2,2:2,3:3,4:4,5:4,6:5,7:5,8:0}[m]]; }
/* ================= document model ================= */
function newDoc(){
  return { v:1, lang:'fr', year:7, term:currentTerm(), tier:'', title:'', q:{ tl:'', en:'' }, paper:'auto', size:'auto', cols:[], updated:Date.now() };
}
function newCol(title){ return { id:uid(), title:title || '', sub:'auto', width:null, groups:[[]] }; }
function newItem(tl, en){ return { tl:tl || '', en:en || '', say:'', marks:[] }; }
function normalise(d){
  d.v = 1; d.lang = LANGS[d.lang] ? d.lang : 'fr'; d.year = YEARS.includes(+d.year) ? +d.year : 7;
  if(!TERMS.includes(d.term)) d.term = 'Other';
  // Tier (Years 10–11): '' = both, 'F', 'H'. Files from before v0.5 have none: read it from the title once ("…(Foundation, trial)").
  if(!['', 'F', 'H'].includes(d.tier)) d.tier = hasTier(d.year) ? (/\bhigher\b/i.test(d.title || '') ? 'H' : /\bfoundation\b/i.test(d.title || '') ? 'F' : '') : '';
  d.q = d.q || { tl:'', en:'' }; d.paper = d.paper || 'auto'; d.cols = d.cols || [];
  d.size = SIZES.includes(+d.size) ? +d.size : 'auto';
  d.cols.forEach(c => { c.id = c.id || uid(); c.sub = c.sub || 'auto'; if(c.width === undefined) c.width = null; c.joinNext = !!c.joinNext;
    c.groups = (c.groups && c.groups.length ? c.groups : [[]]).map(g => g.map(it => {
      const o = Object.assign({ tl:it.tl || '', en:it.en || '', say:it.say || '', marks:it.marks || [] }, it.gap ? { gap:true } : {});
      // Per-word respellings. Items with no phon are left as they were.
      if(Array.isArray(it.phon)) o.phon = normalisePhon(it.phon, o.tl.length);
      return o; })); });
  return d;
}
/* ================= per-word respellings ================= */
// An entry is { s, e, p, on }: a character range in tl (one word, a liaison pair or a joined word), its respelling, and whether it shows.
function normalisePhon(list, len){
  return (Array.isArray(list) ? list : []).filter(p => p && Number.isInteger(+p.s) && Number.isInteger(+p.e) && +p.s >= 0 && +p.e > +p.s && +p.e <= len)
    .map(p => ({ s:+p.s, e:+p.e, p:String(p.p == null ? '' : p.p), on:!!p.on }));
}
// Keeps entries lined up after tl changed: the old range [p0, oldEnd) became [p0, newEnd). Entries that the edit covered stretch to fit it.
function shiftPhon(list, p0, oldEnd, newEnd){
  const delta = newEnd - oldEnd, out = [];
  (list || []).forEach(x => {
    const s = x.s <= p0 ? x.s : (x.s >= oldEnd ? x.s + delta : p0);
    const e = x.e <= p0 ? x.e : (x.e >= oldEnd ? x.e + delta : newEnd);
    if(e > s) out.push({ s, e, p:x.p, on:x.on });
  });
  return out;
}
// First place the word occurs in tl that no existing entry covers. null if there is none.
function phonFind(tl, word, list){
  if(!word) return null;
  for(let i = tl.indexOf(word); i !== -1; i = tl.indexOf(word, i + 1)){
    const e = i + word.length;
    if(!(list || []).some(x => i < x.e && x.s < e)) return { s:i, e };
  }
  return null;
}
const groupCount = d => Math.max(1, ...d.cols.map(c => c.groups.length));
const itemCount = c => c.groups.reduce((n, g) => n + g.length, 0);
// Columns as the reader sees them: a column with joinNext and the one after it are one unit (one title, no line between).
// Returns arrays of column indices, e.g. [[0], [1, 2], [3]]. Same pairing as the table layout in sheetHTML.
const unitsOf = d => { const out = [], n = d.cols.length; for(let i = 0; i < n;){ if(d.cols[i].joinNext && i < n - 1){ out.push([i, i + 1]); i += 2; } else { out.push([i]); i++; } } return out; };
const hasSay = d => d.cols.some(c => c.groups.some(g => g.some(it => it.say && it.say.trim())));
const displayTitle = d => d.title.trim() || d.q.en.trim() || d.q.tl.trim() || 'Untitled sentence builder';
/* Colour marks are stored as character ranges; edit them as a per-character array. */
function marksToArr(marks, lang, len){ const a = new Array(len).fill(''); (marks || []).filter(m => m.lang === lang).forEach(m => { for(let i = Math.max(0, m.s); i < Math.min(len, m.e); i++) a[i] = m.c; }); return a; }
function richText(text, marks, lang){
  const a = marksToArr(marks, lang, text.length); let out = '', i = 0;
  while(i < text.length){ const c = a[i]; let j = i; while(j < text.length && a[j] === c) j++;
    const seg = esc(text.slice(i, j)); out += c ? `<span class="c-${c}">${seg}</span>` : seg; i = j; }
  return out;
}
/* ================= sheet rendering ================= */
// L = { font (pt), subs: [n per column], widths: [% per column] | null, gap (em) }
function chunk(items, n){ const out = [], per = Math.ceil(items.length / n); for(let i = 0; i < n; i++) out.push(items.slice(i*per, (i+1)*per)); return out.filter(x => x.length); }
function richRange(text, marks, s, e){
  return richText(text.slice(s, e), (marks || []).map(m => Object.assign({}, m, { s:m.s - s, e:m.e - s })), 'tl');
}
// Entries that are valid and do not overlap, in order of position. k = index in it.phon.
function phonList(it, len){
  const out = [];
  (it.phon || []).forEach((p, k) => { if(p && p.e > p.s && p.s >= 0 && p.e <= len && !out.some(x => p.s < x.p.e && x.p.s < p.e)) out.push({ p, k }); });
  return out.sort((a, b) => a.p.s - b.p.s);
}
// The target-language line. opts.hl (editor preview, Respellings mode): each respelled word is wrapped in
// .pw.hl (data-p = entry index) so it shows a dotted underline. Takes no space, so the layout is unchanged.
function tlHTML(it, opts){
  if(!opts.hl || !it.phon || !it.phon.length) return richText(it.tl, it.marks, 'tl');
  const text = it.tl, ents = phonList(it, text.length);
  let out = '', pos = 0;
  ents.forEach(({ p, k }) => {
    out += richRange(text, it.marks, pos, p.s);
    out += `<span class="pw hl" data-p="${k}">${richRange(text, it.marks, p.s, p.e)}</span>`;
    pos = p.e;
  });
  return out + richRange(text, it.marks, pos, text.length);
}
// Presenter pop-out: the chunk split into plain runs and respelled words, in order. [{ t, p? }] (p = respelling).
function phonSegments(it){
  const text = it.tl || '', out = []; let pos = 0;
  phonList(it, text.length).forEach(({ p }) => {
    if(!String(p.p || '').trim()) return;
    if(p.s > pos) out.push({ t:text.slice(pos, p.s), s:pos });
    out.push({ t:text.slice(p.s, p.e), s:p.s, p:String(p.p).trim() });
    pos = p.e;
  });
  if(pos < text.length) out.push({ t:text.slice(pos), s:pos });
  return out;
}
const itemHasPhon = it => phonList(it, (it.tl || '').length).some(x => String(x.p.p || '').trim());
function itemHTML(it, ci, gi, ii, opts){
  // Items wrap only when their column is narrower than they are (see planWidths).
  const nw = () => '';
  // Pronunciation line (only when switched on, and only for items that have one) sits between the two languages.
  // Shown in quote marks ("devwah"); any quotes typed in the box are removed first so they aren't doubled.
  const sayT = String(it.say || '').trim().replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s]+$/g, '');
  // opts.only = 'tl' | 'en': the other language's line (and, for English only, the pronunciation) is left out altogether.
  const only = opts.only;
  const say = opts.say && sayT && only !== 'en' ? `<span class="say${nw(sayT + '  ')}">“${esc(sayT)}”</span>` : '';
  const tl = only === 'en' ? '' : `<span class="tl${nw(it.tl)}" data-l="tl">${tlHTML(it, opts) || '&nbsp;'}</span>`;
  const en = only === 'tl' ? '' : `<span class="en${nw(it.en)}" data-l="en">${richText(it.en, it.marks, 'en') || '&nbsp;'}</span>`;
  return `<div class="sb-it${it.gap ? ' gap' : ''}" data-c="${ci}" data-g="${gi}" data-i="${ii}">${tl}${say}${en}</div>`;
}
function cellHTML(col, ci, gi, sub, opts){
  const items = col.groups[gi] || [];
  if(!items.length) return `<div class="sb-cell sb-empty">&nbsp;</div>`;
  const idx = items.map((it, ii) => ({ it, ii }));
  return `<div class="sb-cell">` + chunk(idx, Math.max(1, Math.min(sub, items.length))).map(part => `<div class="sb-sub">${part.map(x => itemHTML(x.it, ci, gi, x.ii, opts)).join('<div class="sb-sp"></div>')}</div>`).join('') + `</div>`;
}
function sheetHTML(d, paper, L, version, opts){
  opts = opts || {};
  // English (and pronunciation) at 85% of the target language, never below the paper's minimum.
  // opts.only (presenter, one language showing): English on its own is full size. opts.head = text size (pt) the
  // question bar and column titles keep (the two-language size), so only the items grow.
  const G = groupCount(d), f = L.font, small = x => Math.max(paper.min, Math.round(x * EN_RATIO * 2) / 2);
  const only = opts.only || '', hd = opts.head || f, hf = small(hd), enf = only === 'en' ? f : small(f);
  const cols = d.cols.length ? d.cols : [newCol('')];
  let h = `<div class="sb-page v-${version}${only ? ' only-' + only : ''}" style="width:${paper.w}mm;height:${opts.autoHeight ? 'auto' : paper.h + 'mm'};padding:${paper.m}mm;font-size:${f}pt;--enf:${enf}pt;--gap:${L.gap}em;--gmax:${Math.max(L.gap, GMAX)}em">`;
  h += `<table class="sb${L.widths ? ' fixed' : ''}"${opts.fill ? ' style="height:100%"' : ''}>`;
  if(L.widths) h += '<colgroup>' + L.widths.map(w => `<col style="width:${w}%">`).join('') + '</colgroup>';
  h += `<thead><tr><th class="sb-q" colspan="${cols.length}"${hd !== f ? ` style="font-size:${hd}pt"` : ''}>${esc(d.q.tl) || '&nbsp;'}<span class="qen">${esc(d.q.en)}</span></th></tr>`;
  // A column with joinNext shares its title with the next column (one centred title) and has no line between the two.
  const joinR = ci => ci > 0 && !!cols[ci-1].joinNext && !joinR(ci-1);
  const joinL = ci => !!cols[ci].joinNext && !joinR(ci) && ci < cols.length - 1;
  h += `<tr>` + cols.map((c, ci) => {
    if(joinR(ci)) return '';
    const jl = joinL(ci), title = c.title || (jl ? cols[ci+1].title : '');
    return `<th class="sb-h" data-c="${ci}"${jl ? ' colspan="2"' : ''} style="font-size:${hf}pt">${esc(title) || '&nbsp;'}</th>`;
  }).join('') + `</tr></thead><tbody>`;
  for(let g = 0; g < G; g++){
    h += '<tr>';
    cols.forEach((c, ci) => {
      const spans = c.groups.length === 1 && G > 1;
      if(spans && g > 0) return;
      const cls = joinL(ci) ? ' class="join"' : joinR(ci) ? ' class="join-r"' : '';
      h += `<td${cls}${spans ? ` rowspan="${G}"` : ''}>${cellHTML(c, ci, g, L.subs[ci] || 1, opts)}</td>`;
    });
    h += '</tr>';
  }
  return h + '</tbody></table></div>';
}

/* ================= auto-fit ================= */
let measureHost = null;
function host(){ if(!measureHost){ measureHost = document.createElement('div'); measureHost.id = 'sb-measure'; measureHost.className = 'sb-measure'; document.body.appendChild(measureHost); } return measureHost; }
// one = { only, head } when only one language is showing (presenter); omitted otherwise.
function measure(d, paper, L, say, one){
  const h = host(); h.innerHTML = sheetHTML(d, paper, L, 'both', Object.assign({ autoHeight:true, say }, one || {}));
  const t = h.querySelector('table');
  const colH = d.cols.map(() => 0);
  t.querySelectorAll('.sb-cell').forEach(c => { const it = c.querySelector('.sb-it'); if(!it) return; const ci = +it.dataset.c; colH[ci] = Math.max(colH[ci], c.offsetHeight); });
  const ths = [...t.querySelector('tbody tr').children].map(td => td.getBoundingClientRect().width);
  // Text pushed out of its cell or sub-column (stays inside the table, so the width check alone misses it).
  const ov = [...t.querySelectorAll('.sb-cell, .sb-sub')].some(e => e.scrollWidth > e.clientWidth + 1);
  return { h:t.getBoundingClientRect().height, w:t.scrollWidth, ov, colH, colW:ths, availH:(paper.h - 2*paper.m) * MM, availW:(paper.w - 2*paper.m) * MM };
}
// Column widths for a table that is too wide at natural size. Every column that can wrap gives up the same share of its
// spare width (natural minus its narrowest, the longest word), so the squeeze is gradual and shared out. Columns set by
// hand, joined with a neighbour, or with no spare width keep their natural width.
// Returns { ok, widths } — widths in % (null = natural widths already fit). ok false = too wide even at the narrowest.
function measureCols(d, paper, L, say, one, mode){
  const h = host(); h.innerHTML = sheetHTML(d, paper, L, 'both', Object.assign({ autoHeight:true, say }, one || {}));
  const t = h.querySelector('table'); t.style.width = mode === 'max' ? 'max-content' : '1px';
  return [...t.querySelector('tbody tr').children].map(td => td.getBoundingClientRect().width);
}
function planWidths(d, paper, L, say, one){
  const avail = (paper.w - 2*paper.m) * MM, base = Object.assign({}, L, { widths:null });
  const nat = measureCols(d, paper, base, say, one, 'max'), narrow = measureCols(d, paper, base, say, one, 'min');
  const sum = a => a.reduce((x, y) => x + y, 0);
  if(!d.cols.some(c => c.width) && sum(nat) <= avail + 0.5) return { ok:true, widths:null };
  const joined = d.cols.map((c, i) => !!c.joinNext || (i > 0 && !!d.cols[i-1].joinNext));
  const pinned = d.cols.map((c, i) => !!c.width || joined[i] || nat[i] - narrow[i] < 1);
  const px = d.cols.map((c, i) => c.width ? c.width / 100 * avail : nat[i]);
  const room = avail - sum(px.filter((_, i) => pinned[i]));
  const need = sum(nat.filter((_, i) => !pinned[i])) - room;
  const slack = sum(nat.filter((_, i) => !pinned[i]).map((x, k) => x)) - sum(narrow.filter((_, i) => !pinned[i]));
  let ok = true, t = 0;
  if(need > 0){ if(slack <= 0 || need > slack + 0.5){ ok = false; t = 1; } else t = need / slack; }
  const w = d.cols.map((c, i) => pinned[i] ? px[i] : nat[i] - t * (nat[i] - narrow[i]));
  const total = sum(w);
  return { ok, widths: w.map(x => x / total * 100) };
}
const fits = (m) => m.h <= m.availH + 0.5 && m.w <= m.availW + 1 && !m.ov;
// o = { say: show pronunciation lines, size: fixed text size in pt (null = Auto),
//       only: 'tl' | 'en' (one language showing; presenter), head: pt the headers keep, floor: smallest pt to try,
//       hi: largest pt to try (presenter font size +/-) }
function fitPaper(d, paper, o){
  o = o || {};
  const maxItems = c => Math.max(0, ...c.groups.map(g => g.length));
  const shortItems = c => c.groups.every(g => g.every(it => it.tl.length <= SHORT_ITEM && it.en.length <= SHORT_ITEM));
  const say = !!o.say, one = o.only ? { only:o.only, head:o.head } : null;
  const measure_ = (d, paper, L, say) => measure(d, paper, L, say, one), plan_ = (d, paper, L, say) => planWidths(d, paper, L, say, one);
  // Auto: largest size that fits, up to paper.auto (paper.one with one language). Fixed: that size only (never below the paper's minimum).
  const fixed = o.size ? Math.min(paper.max, Math.max(paper.min, o.size)) : null;
  // o.hi (v1.60, presenter font size +/-): the largest size to try, above the Auto ceiling if need be; it still steps down to fit.
  const hi = fixed || o.hi || (one && paper.one) || paper.auto || paper.max, lo = fixed || Math.max(paper.min, o.floor || 0);
  let last = null;
  for(let f = hi; f >= lo - 0.001; f -= 0.5){
    // Slide + Auto: no sub-column splits while the text is at or above SLIDE_SPLIT_FLOOR.
    const splitOk = !(paper.key === 'slide' && !fixed) || f < SLIDE_SPLIT_FLOOR;
    const subs = d.cols.map(c => c.sub === 'auto' ? 1 : +c.sub);
    const L = { font:f, subs, gap:0.55, widths:null };
    let p = plan_(d, paper, L, say); L.widths = p.widths;
    let m = measure_(d, paper, L, say); const tried = new Set();
    while(!(p.ok && fits(m))){
      if(!p.ok) break; // too wide at the narrowest: splitting would only make it wider, so try a smaller size
      // add a sub-column to the auto column with the tallest cell (only lists long enough to give each sub-column 2+ items)
      const order = !splitOk ? [] : d.cols.map((c, i) => i).filter(i => d.cols[i].sub === 'auto' && subs[i] < 3 && maxItems(d.cols[i]) >= (subs[i] + 1) * 2 && shortItems(d.cols[i]) && !tried.has(i)).sort((a, b) => m.colH[b] - m.colH[a]);
      if(!order.length) break;
      const i = order[0]; subs[i]++;
      const Lt = Object.assign({}, L, { subs:subs.slice(), widths:null });
      const p2 = plan_(d, paper, Lt, say); Lt.widths = p2.widths;
      const m2 = measure_(d, paper, Lt, say);
      if(p2.ok && m2.h < m.h - 1 && !m2.ov){ m = m2; p = p2; L.widths = p2.widths; } else { subs[i]--; tried.add(i); }
    }
    last = { L:Object.assign({}, L, { subs:subs.slice() }), m };
    if(p.ok && fits(m)){
      // spread items out to use the spare height (clearer to read)
      for(const g of [0.75, 1, 1.3, 1.6]){ const L2 = Object.assign({}, last.L, { gap:g }); const m2 = measure_(d, paper, L2, say); if(fits(m2)) last = { L:L2, m:m2 }; else break; }
      return { ok:true, paper, L:last.L, over:0, fixed:!!fixed, asked:o.size || null };
    }
  }
  return { ok:false, paper, L:last.L, over:(last.m.h - last.m.availH) / MM, overW:(last.m.w - last.m.availW) / MM, fixed:!!fixed, asked:o.size || null };
}
// Paper choice. Auto: KS3 → A5, else A4 folded; KS4 → A4. A fixed size is tried on A5 first in the same way.
function layoutFor(d, say){
  const o = { say:!!say, size:d.size === 'auto' ? null : d.size };
  if(d.paper === 'auto'){
    if(d.year <= 9){
      const a5 = fitPaper(d, PAPERS.A5, o); if(a5.ok) return Object.assign(a5, { why:'auto' });
      const a4 = fitPaper(d, PAPERS.A4fold, o); return Object.assign(a4, { why:'a5-too-small' });
    }
    return Object.assign(fitPaper(d, PAPERS.A4, o), { why:'ks4' });
  }
  return Object.assign(fitPaper(d, PAPERS[d.paper] || PAPERS.A4, o), { why:'chosen' });
}
/* ================= storage (the viewer's folder) ================= */
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open('slideshow_viewer_fs', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function hGet(k){ try{ const db = await idb(); return await new Promise(res => { const q = db.transaction('h').objectStore('h').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }catch(e){ return null; } }
async function hSet(k, v){ try{ const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }catch(e){} }

const Store = {
  dir:null, state:'none', // none | prompt | ok | unsupported
  async restore(){
    if(typeof window.showDirectoryPicker !== 'function'){ this.state = 'unsupported'; return; }
    this.dir = await hGet('dataDir');
    if(!this.dir){ this.state = 'none'; return; }
    try{ this.state = (await this.dir.queryPermission({ mode:'readwrite' })) === 'granted' ? 'ok' : 'prompt'; }catch(e){ this.state = 'prompt'; }
  },
  async reconnect(){ this.state = (await this.dir.requestPermission({ mode:'readwrite' })) === 'granted' ? 'ok' : 'prompt'; },
  async pick(){ const d = await window.showDirectoryPicker({ id:'slideshow-viewer', mode:'readwrite' }); this.dir = d; await hSet('dataDir', d); this.state = 'ok'; },
  async root(){ return this.dir.getDirectoryHandle(SB_DIR, { create:true }); },
  async folder(year, term, create){ const r = await this.root(); if(year == null) return r.getDirectoryHandle(UNCAT, { create }); const y = await r.getDirectoryHandle('Year ' + year, { create }); return y.getDirectoryHandle(term, { create }); },
  async list(){ return listBuilders(this.dir); },
  async exists(dir, name){ try{ await dir.getFileHandle(name); return true; }catch(e){ return false; } },
  async freeName(dir, base, own){
    let n = base + '.sb.json', i = 2;
    while(n !== own && await this.exists(dir, n)) n = `${base} (${i++}).sb.json`;
    return n;
  },
  async write(dir, name, text){ const fh = await dir.getFileHandle(name, { create:true }); const w = await fh.createWritable(); await w.write(text); await w.close(); },
  async read(dir, name){ return (await (await dir.getFileHandle(name)).getFile()).text(); },
  // Last-modified time (ms) of a builder's file, or null if it isn't there.
  async mtimeOf(loc){
    try{ const d = await this.folder(loc.year, loc.term, false); return (await (await d.getFileHandle(loc.name)).getFile()).lastModified; }catch(e){ return null; }
  },
  // Saves doc. The file name is kept while typing; o.rename renames it from the title (sent when leaving the title box).
  // Moves the file if its year / half-term changed. If the file was changed or removed on another computer since it was
  // opened (loc.mtime), throws a 'Conflict' error without writing, unless o.force. Returns the new location, with its mtime.
  async save(doc, loc, o){
    o = o || {};
    const p = placeOf(doc);
    const dir = await this.folder(p.year, p.term, true);
    const same = loc && loc.year === p.year && loc.term === p.term;
    if(loc && !o.force && loc.mtime != null){
      const cur = await this.mtimeOf(loc);
      if(cur === null || cur > loc.mtime){ const e = new Error('changed on another computer'); e.name = 'Conflict'; throw e; }
    }
    const name = same && !o.rename ? loc.name : await this.freeName(dir, fileSafe(displayTitle(doc)), same ? loc.name : null);
    doc.updated = Date.now();
    // The uncat flag is only written for Uncategorised builders; the folder says where a file is.
    const body = Object.assign({}, doc); if(p.year == null) body.uncat = true; else delete body.uncat;
    await this.write(dir, name, JSON.stringify(body, null, 1));
    const mtime = await this.mtimeOf({ year:p.year, term:p.term, name });
    let warn = '';
    if(loc && !(same && loc.name === name)){
      try{ const old = await this.folder(loc.year, loc.term, false); await old.removeEntry(loc.name); }
      catch(e){ if(e.name !== 'NotFoundError') warn = `Saved, but the old copy “${loc.name}” couldn't be removed. Delete it by hand.`; }
    }
    return { year:p.year, term:p.term, name, mtime, warn };
  },
  async toBin(loc){
    const src = await this.folder(loc.year, loc.term, false), text = await this.read(src, loc.name);
    const bin = await (await this.root()).getDirectoryHandle(BIN_DIR, { create:true });
    const binName = `${Date.now()} - ${loc.year == null ? UNCAT : 'Year ' + loc.year} - ${loc.term || ''} - ${loc.name}`;
    await this.write(bin, binName, text); await src.removeEntry(loc.name);
    return binName;
  },
  async fromBin(binName, loc){
    const bin = await (await this.root()).getDirectoryHandle(BIN_DIR), text = await this.read(bin, binName);
    const dir = await this.folder(loc.year, loc.term, true), name = await this.freeName(dir, loc.name.replace(/\.sb\.json$/i, ''), null);
    await this.write(dir, name, text); await bin.removeEntry(binName);
  },
};

// Every builder in <dir>/Sentence Builders/Year N/<half-term>/ and Sentence Builders/Uncategorised/ (dir = the Slideshow Viewer folder).
// Uncategorised builders have loc.year and loc.term null and doc.uncat true. The folder decides, not the file's own fields.
async function listBuilders(dir){
  const out = []; let r;
  try{ r = await dir.getDirectoryHandle(SB_DIR); }catch(e){ return out; }
  const readFolder = async (fd, loc) => {
    for await (const [name, h] of fd.entries()){
      if(h.kind !== 'file' || !name.toLowerCase().endsWith('.sb.json')) continue;
      try{ const f = await h.getFile(); const doc = normalise(JSON.parse(await f.text())); doc.uncat = loc.year == null; out.push({ loc:Object.assign({}, loc, { name, mtime:f.lastModified }), doc, mtime:f.lastModified }); }catch(e){ console.warn('Skipped', name, e); }
    }
  };
  try{ await readFolder(await r.getDirectoryHandle(UNCAT), { year:null, term:null }); }catch(e){ /* no Uncategorised folder yet */ }
  for(const y of YEARS){
    let yd; try{ yd = await r.getDirectoryHandle('Year ' + y); }catch(e){ continue; }
    for(const t of TERMS){
      let td; try{ td = await yd.getDirectoryHandle(t); }catch(e){ continue; }
      await readFolder(td, { year:y, term:t });
    }
  }
  return out;
}
function clearMeasure(){ if(measureHost) measureHost.innerHTML = ''; }

const MEASURE_CSS = `#sb-measure{position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none}
#sb-measure .sb-cell{height:auto;align-items:center}
#sb-measure .sb-sp{max-height:var(--gap,0.55em)}
@media print{#sb-measure{display:none !important}}`;
const st = document.createElement('style'); st.id = 'sb-core-css'; st.textContent = SHEET_CSS + MEASURE_CSS; document.head.appendChild(st);

window.SBCore = { VERSION, SB_DIR, BIN_DIR, UNCAT, placeOf, YEARS, TERMS, LANGS, MM, PT, PAPERS, SIZES, GMAX, EN_RATIO, VERSIONS, COLOURS, SHEET_CSS, MEASURE_CSS,
  TIERS, hasTier, langOf, termShort, builderMatches, filterBuilders, byTitle, filterRows, applyFilter, emptyText,
  esc, clone, uid, fileSafe, lname, currentTerm, newDoc, newCol, newItem, normalise, groupCount, itemCount, unitsOf, hasSay, displayTitle,
  marksToArr, richText, chunk, itemHTML, cellHTML, sheetHTML, measure, planWidths, fits, fitPaper, layoutFor, clearMeasure,
  normalisePhon, shiftPhon, phonFind, phonSegments, itemHasPhon,
  idb, hGet, hSet, Store, listBuilders };
})();
