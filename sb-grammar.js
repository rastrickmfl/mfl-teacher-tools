/* Slideshow Viewer — sentence builder grammar (v1.58, 2026-10-17)
   Classic script (no modules: the page is opened from the OneDrive folder). Exposes window.SBGrammar.

   When activities join builder items into a sentence they used to put a space between them and nothing
   else, so 'il n'y a pas de' + 'une piscine' came out as 'il n'y a pas de une piscine'. This file applies
   the rules in  Sentence Builders/grammar-rules.json  to each pair of neighbouring items.

   - Rules are data; this file only knows the rule kinds: negative-de, contraction, elision, drop-article.
   - The rules file is read whenever the builder list is loaded (sb-present.js loadList). On the pupil
     window linked to a teacher screen it is asked for through dual.js (rpc 'sbRules').
   - No rules file / a broken one → items are joined as before (a warning in the console).
   - Per-item switches in a .sb.json item (optional, typed by hand or by the extractor):
       "gram": false   → no rule touches the join before or after this item
       "neg": "d’œufs" → exactly what follows a negative for this item (replaces the automatic form)
   - Words moved by a rule (de / d' / au / qu' …) go with the FOLLOWING item, so in the unjumble the
     noun block carries them: 'il n'y a pas' | 'd'église'. The one exception: after 'pas de' + consonant
     the 'de' stays where the builder wrote it ('il n'y a pas de' | 'piscine').
   - English is not changed. */
(function(){
'use strict';
const FILE = 'grammar-rules.json';
let RULES = null, loadedFrom = '', loading = null;
const C = () => window.SVCore;

/* ---- loading ---- */
async function readFile(){
  const c = C();
  if(c && c.PUPIL && window.SVDual && SVDual.link && SVDual.link.sbRules) return SVDual.link.sbRules();
  const dir = c && c.FsStore && c.FsStore.dir;
  if(!dir) return null;
  return readFrom(dir);
}
// dir = the Slideshow Viewer folder. Returns the file's text, or null if it isn't there.
async function readFrom(dir){
  try{
    const sb = await dir.getDirectoryHandle((window.SBCore && SBCore.SB_DIR) || 'Sentence Builders');
    return await (await (await sb.getFileHandle(FILE)).getFile()).text();
  }catch(e){ return null; }
}
async function load(){
  if(loading) return loading;
  loading = (async () => {
    try{
      const text = await readFile();
      if(text == null){ if(!RULES) console.warn('SBGrammar: ' + FILE + ' not found; sentences are joined without grammar rules.'); return RULES; }
      setRules(JSON.parse(text), FILE);
    }catch(e){ console.warn('SBGrammar: could not read ' + FILE + ' (' + e.message + '); keeping the rules already loaded.'); }
    return RULES;
  })();
  try{ return await loading; } finally { loading = null; }
}
function setRules(json, from){ RULES = compile(json); loadedFrom = from || 'set'; return RULES; }

/* ---- compiling ---- */
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const APOS = '[’\']';
const rx = (list, flags) => (list || []).map(s => { try{ return new RegExp(s, flags || 'iu'); }catch(e){ console.warn('SBGrammar: bad pattern', s, e.message); return null; } }).filter(Boolean);
// An article at the start of the next item: 'une piscine', 'de l’eau', 'l’' needs no space after it.
function articleRx(arts, cs){
  const alts = arts.slice().sort((a, b) => b.length - a.length).map(a => /[’']$/.test(a) ? esc(a.replace(/[’']$/, '')) + APOS + '\\s*' : esc(a) + '\\s+');
  return new RegExp('^(?:' + alts.join('|') + ')', cs ? 'u' : 'iu');
}
function compile(json){
  const out = {};
  for(const lang of Object.keys(json || {})){
    const L = json[lang]; if(!L || typeof L !== 'object' || !Array.isArray(L.rules)) continue;
    const info = {
      apos: L.apostrophe || '’',
      vowels: new Set((L.vowels || 'aeiouàâäéèêëîïôöûùüœæ').split('')),
      hAsp: new Set((L.hAspire || []).map(w => w.toLowerCase())),
      vowelEx: new Set((L.vowelExceptions || []).map(w => w.toLowerCase())),
      yVow: new Set((L.yVowels || []).map(w => w.toLowerCase())),
      rules: []
    };
    for(const r of L.rules){
      if(!r || r.on === false) continue;
      const cs = !!r.caseSensitive, fl = cs ? 'u' : 'iu';
      if(r.kind === 'negative-de'){
        const neg = (r.negators || []).map(esc).join('|');
        info.rules.push({ id:r.id, kind:r.kind,
          deEnd: new RegExp('(?:^|\\s+)d(?:e|' + APOS + ')$', 'iu'),
          bareNeg: new RegExp('(?:^|\\s)(?:' + neg + ')$', 'iu'),
          deNeg: new RegExp('(?:^|\\s)(?:' + neg + ')\\s+d(?:e|' + APOS + ')$', 'iu'),
          art: articleRx(r.articles || [], false),
          exL: rx(r.exceptLeft), exR: rx(r.exceptRight) });
      } else if(r.kind === 'contraction'){
        info.rules.push({ id:r.id, kind:r.kind, exL: rx(r.exceptLeft),
          pairs: (r.pairs || []).map(p => ({
            left: new RegExp('(?:^|\\s+)' + esc(p.left) + '$', fl),
            right: new RegExp('^' + esc(p.right) + '\\s+', fl),
            out: p.out })) });
      } else if(r.kind === 'elision'){
        const words = Object.entries(r.words || {}).map(([w, v]) => {
          const o = typeof v === 'string' ? { out:v } : v;
          return { left: new RegExp('(?:^|\\s+)' + esc(w) + '$', fl), out:o.out, before: o.before ? new Set(o.before.map(x => x.toLowerCase())) : null };
        });
        info.rules.push({ id:r.id, kind:r.kind, words });
      } else if(r.kind === 'drop-article'){
        info.rules.push({ id:r.id, kind:r.kind, left: rx(r.left, fl), art: articleRx(r.articles || [], cs) });
      } else console.warn('SBGrammar: unknown rule kind', r.kind);
    }
    out[lang] = info;
  }
  return out;
}

/* ---- helpers ---- */
// The first word of t, lower case, letters only ('(super)marché' → 'supermarché', 'hôpital,' → 'hôpital').
const firstWord = t => (String(t).trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^\p{L}’'-]/gu, '').replace(/[’'].*$/, '');
const plainForm = w => [w, w.replace(/[sx]$/, '')];
function vowelStart(info, t){
  const w = firstWord(t); if(!w) return false;
  if(info.vowelEx.has(w)) return false;
  const ch = w[0];
  if(ch === 'h') return !plainForm(w).some(x => info.hAsp.has(x));
  if(ch === 'y') return info.yVow.has(w);
  return info.vowels.has(ch);
}
const anyTest = (list, s) => list.some(r => r.test(s));

/* ---- one pair ---- */
// a, b: neighbouring items' text; ia, ib: the items (for "gram" / "neg"). Returns { a, b } (a may become '').
function pair(a, b, lang, ia, ib){
  a = String(a || ''); b = String(b || '');
  const info = RULES && RULES[lang];
  if(!info || !a.trim() || !b.trim()) return { a, b };
  if((ia && ia.gram === false) || (ib && ib.gram === false)) return { a, b };
  a = a.replace(/\s+$/, ''); b = b.replace(/^\s+/, '');
  const f0 = /\p{L}/u.exec(a), capStart = !!(f0 && f0[0] !== f0[0].toLowerCase());
  for(const r of info.rules){
    if(r.kind === 'negative-de'){
      if(anyTest(r.exL, a)) continue;
      const hasDe = r.deNeg.test(a), bare = !hasDe && r.bareNeg.test(a);
      if(!hasDe && !bare) continue;
      if(ib && typeof ib.neg === 'string' && ib.neg.trim()){
        // The builder says exactly what follows the negative: take any 'de' off the end of a.
        if(hasDe) a = a.replace(r.deEnd, '');
        b = ib.neg.trim();
        continue;
      }
      const m = r.art.exec(b);
      if(!m || anyTest(r.exR, b)) continue;
      const noun = b.slice(m[0].length);
      if(!noun.trim()) continue;
      if(vowelStart(info, noun)){ if(hasDe) a = a.replace(r.deEnd, ''); b = 'd' + info.apos + noun; }
      else if(hasDe){ a = a.replace(r.deEnd, ' de').trim(); b = noun; } // 'pas d’' + consonant → 'pas de'
      else b = 'de ' + noun;
    } else if(r.kind === 'contraction'){
      if(anyTest(r.exL, a)) continue;
      for(const p of r.pairs){
        if(!p.left.test(a)) continue;
        const m = p.right.exec(b); if(!m) continue;
        a = a.replace(p.left, ''); b = p.out + ' ' + b.slice(m[0].length);
        break;
      }
    } else if(r.kind === 'elision'){
      if(!vowelStart(info, b)) continue;
      const fw = firstWord(b);
      for(const w of r.words){
        if(!w.left.test(a)) continue;
        if(w.before && !w.before.has(fw)) continue;
        a = a.replace(w.left, ''); b = w.out + b;
        break;
      }
    } else if(r.kind === 'drop-article'){
      if(!anyTest(r.left, a)) continue;
      const m = r.art.exec(b); if(m && b.slice(m[0].length).trim()) b = b.slice(m[0].length);
    }
  }
  a = a.trim(); b = b.trim();
  // A whole item moved onto the next one ('Je' + 'habite' → 'J’habite'): keep its capital letter.
  if(!a && capStart) b = b.replace(/\p{L}/u, ch => ch.toUpperCase());
  return { a, b };
}

/* ---- a whole sentence ---- */
// items: builder items in sentence order. Returns one string per item (some may be '' when a rule
// moved a whole item onto the next one, e.g. an item that was only 'je').
function chunks(items, lang){
  const its = (items || []).map(it => it || {});
  const t = its.map(it => String(it.tl || '').replace(/\s+/g, ' ').trim());
  if(!RULES || !RULES[lang]) return t;
  let prev = -1;
  for(let i = 0; i < t.length; i++){
    if(!t[i]) continue;
    if(prev >= 0){ const r = pair(t[prev], t[i], lang, its[prev], its[i]); t[prev] = r.a; t[i] = r.b; }
    if(t[i]) prev = i;
  }
  return t;
}
const sentence = (items, lang) => chunks(items, lang).filter(Boolean).join(' ').replace(/\s+([,.])/g, '$1');

window.SBGrammar = { VERSION:'1.58', FILE, load, readFrom, setRules, pair, chunks, sentence,
  get loaded(){ return !!RULES; }, get from(){ return loadedFrom; }, get rules(){ return RULES; } };
})();
