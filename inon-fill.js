/* inon-fill.js (v1.93): fill-in slots for Slide Gallery templates, the answer slide, and the year-group colours of a template.
   A template slide (x in data.templates.slides) can carry:
     x.fill   = { fmt, max, label, cols, src, answer }   fmt: 'pairs' | 'duo' | 'options' | 'cats' | 'topic' | 'list'
                cols: the form's column headings; src: 'tl' | 'en' = which side of a Sentence Builder item is the question
     x.themed = true      its colours are the four TOKENS below; they become the lesson's year-group colours when it is added
     x.key / x.ver        a built-in template (seeded from inon-templates.js; an edited one has x.edited and is never overwritten)
   Text on the slide can hold slots in curly brackets, filled from the form:
     {q1} question 1        {aa1} answer 1, always shown        {a1} answer 1, answer slide only
     {qq1} question 1, answer slide only        {eq1} " = answer 1", answer slide only
     {no1} the number 1 (blank if there is no item 1)        {i1} "1)" (blank if there is no item 1)
     {s1} the Nth answer in a shuffled order (a jumbled list)        {n1} which question that shuffled answer belongs to (answer slide)
     {lt1} "A." for the Nth shuffled answer        {l1} the letter of question 1's answer in that list (answer slide)
     options: {o1A} {o1B} {o1C} the choices of question 1 (shuffled)        {c1} the letter of the right one (answer slide)
     duo:     {t1a} {t1b} the two choices of line 1 (sides shuffled)
     cats:    {w1} the Nth word (shuffled)    {cat1} the title of category 1, {cw1} its words (answer slide)
     {tl} {en}   the lesson's language and English, in that language (français / anglais or español / inglés); {langname}   French or Spanish
     topic:   {ideas}        {ans} " – Answers" on the answer slide only        {h} "Answer" (a column heading), answer slide only
   Objects (x.cfg.added[]) can carry rules the editor doesn't show:
     need:N       the object is left out when there is no item N (so a short list has no empty rows)
     ans:'only'   the object is only on the answer slide (an overlay: highlight, tick, answer text)
     rv:true      on the answer slide it starts hidden, with an eye button to reveal it
     when:[name, idx, suffix, value]   the object stays only if that slot equals value (e.g. the right option's highlight)
     btn:{dx,dy}  where its eye button sits, from the box's top-left (the editor's Reveal button position)
     spread:true  its lines (a slot value with line breaks) become separate paragraphs, so a box set to space them out does so evenly
   Anything unknown becomes empty. window.INON = { prep, parse, rows, sample, theme, tintOf, builderItems, ... }. */
(function(){
  'use strict';
  const TOKENS = { light:'#FFF2CC', tint:'#FFE699', mid:'#FFC000', dark:'#7F6000' }; // the colours a themed template is drawn in
  const LETTERS = 'ABCDEFGHIJKL';
  const esc = s=>String(s).replace(/[&<>]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  const lines = t=>String(t || '').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const cut = l=>{ const i = l.search(/=|\t/); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; };
  function seedOf(s){ let h = 2166136261; for(const ch of String(s)){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed){ let a = seed || 1; return ()=>{ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // A shuffled order of 0..n-1 that moves everything when it can (so a match-up isn't already matched).
  function order(n, rnd, moveAll = true){
    const p = Array.from({ length:n }, (_, i)=>i);
    for(let tries = 0; tries < 30; tries++){
      for(let i = n - 1; i > 0; i--){ const j = Math.floor(rnd()*(i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      if(!moveAll || n < 2 || p.every((v, i)=>v!==i)) break;
    }
    return p;
  }

  /* ---------- the form, per format ---------- */
  // cols: the form's columns (a template's fill.cols can rename them). Rows are arrays of strings.
  const formats = {
    pairs:   { cols:['Question', 'Answer'],                                 help:'question = answer',                          example:'Bonjour = Hello\nAu revoir = Goodbye' },
    duo:     { cols:['Correct', 'Incorrect'],                               help:'correct = incorrect',                        example:"Je m'appelle = Je m'apple\nBonjour = Bonjoor" },
    options: { cols:['Question', 'Right answer', 'Wrong answer', 'Wrong answer'], help:'question = right | wrong | wrong',     example:'We went = nous sommes allé(e) | nous avons allés | nous sommes allé(e)s' },
    cats:    { cols:['Word', 'Category'],                                   help:'word = category (up to 3 categories)',       example:'je poste = verbs\nfacile = adjectives\nrecevoir = infinitives' },
    topic:   { cols:['Topic', 'Translation', 'Ideas for pupils'],           help:'topic = translation',                        example:'Holidays = Les vacances' },
    list:    { cols:['Word or phrase'],                                     help:'one per line',                               example:'salut\ncoucou\nça va?' },
  };
  // The form's column headings: the template's own names, topped up from the format's if it names fewer.
  const cols = x=>{ const f = x.fill, base = formats[f.fmt].cols, own = f.cols && f.cols.length ? f.cols.slice(0, base.length) : []; return own.concat(base.slice(own.length)); };
  // Typed or pasted text (one item per line) as form rows.
  function rows(fmt, text){
    const out = [];
    const n = formats[fmt].cols.length;
    for(const l of lines(text)){
      if(fmt==='list'){ out.push([l]); continue; }
      const tabs = l.split('\t').map(s=>s.trim());            // spreadsheet rows: one cell per column
      if(tabs.length > 2 || (tabs.length===2 && fmt!=='options' && fmt!=='topic') || (tabs.length===2 && fmt==='options' && !tabs[1].includes('|'))){
        out.push(Array.from({ length:n }, (_, i)=>tabs[i] || '')); continue;
      }
      const [q, a] = cut(l);
      if(fmt==='options'){ const o = a.split('|').map(s=>s.trim()); out.push([q, o[0] || '', o[1] || '', o[2] || '']); }
      else if(fmt==='topic') out.push([q, a, '']);
      else out.push([q, a]);
    }
    return out;
  }
  // Form rows as items. out: { items, extra, cats, over, bad, extraCat }
  function parseRows(fmt, R, max){
    const out = { items:[], extra:'', cats:[], over:0, bad:0, extraCat:0 };
    const clean = (R || []).map(r=>(r || []).map(c=>String(c == null ? '' : c).trim())).filter(r=>r.some(c=>c));
    if(fmt==='topic'){
      const r = clean[0]; if(r){ out.items.push({ q:r[0] || '', a:r[1] || '' }); out.extra = r[2] || ''; if(!r[0] || !r[1]) out.bad++; }
      return out;
    }
    for(const r of clean){
      if(out.items.length >= max){ out.over++; continue; }
      if(fmt==='list'){ out.items.push({ q:r[0], a:'' }); continue; }
      if(!r[0]){ out.bad++; continue; }
      if(fmt==='options'){
        if(!r[1]) out.bad++;
        const o = [r[1] || '', r[2] || '', r[3] || ''];
        out.items.push({ q:r[0], a:o[0], opts:o });
      } else { if(!r[1]) out.bad++; out.items.push({ q:r[0], a:r[1] || '' }); }
    }
    if(fmt==='cats'){
      for(const it of out.items) if(it.a && !out.cats.includes(it.a) && out.cats.length < 3) out.cats.push(it.a);
      const kept = out.items.filter(it=>out.cats.includes(it.a));
      out.extraCat = out.items.length - kept.length; out.items = kept; // words in a 4th category (or with none) can't go in a box
    }
    return out;
  }
  const parse = (fmt, text, max)=>parseRows(fmt, rows(fmt, text), max);
  // Example rows for the gallery cards and the placeholders.
  function sample(x){
    const f = x.fill, n = Math.min(f.max || 10, 12), t = [];
    if(f.fmt==='topic') return [['Topic', 'Translation', 'idea 1, idea 2, idea 3']];
    for(let i = 1; i <= n; i++){
      if(f.fmt==='pairs') t.push([`Question ${i}`, `Answer ${i}`]);
      else if(f.fmt==='duo') t.push([`Correct ${i}`, `Wrong ${i}`]);
      else if(f.fmt==='options') t.push([`Question ${i}`, `Right ${i}`, `Wrong ${i}`, `Other ${i}`]);
      else if(f.fmt==='cats') t.push([`Word ${i}`, `Category ${(i - 1) % 3 + 1}`]);
      else t.push([`Word ${i}`]);
    }
    return t;
  }

  /* ---------- slots ---------- */
  function getter(fmt, P, answer, lang, flip){
    const I = P.items, n = I.length, rnd = rng(seedOf(I.map(i=>i.q + '|' + i.a).join('\n') + fmt));
    const perm = order(n, rnd);                            // perm[j] = item shown at shuffled place j
    const inv = []; perm.forEach((i, j)=>{ inv[i] = j; });
    const opt = I.map(()=>order(3, rnd, false));           // per question: opt[j] = which choice sits in place j (any order, so the right one can be A)
    const side = I.map(()=>rnd() < 0.5);                   // duo: true = the correct one is on the right
    const cats = P.cats;
    const only = v=>answer ? v : '';
    return (name, idx, suf)=>{
      const k = idx ? Number(idx) - 1 : -1, it = I[k];
      switch(name){
        case 'tl':  return lang==='es' ? 'español' : 'français';     // the lesson's language, in itself and in English
        case 'en':  return lang==='es' ? 'inglés' : 'anglais';
        case 'langname': return lang==='es' ? 'Spanish' : 'French';
        case 'into': return flip ? (lang==='es' ? 'Spanish' : 'French') : 'English'; // the language pupils translate into (the Word bank can go either way)
        case 'no':  return it ? String(k + 1) : '';
        case 'i':   return it ? `${k + 1})` : '';
        case 'q':   return it ? it.q : '';
        case 'qq':  return it ? only(it.q) : '';
        case 'aa':  return it ? it.a : '';
        case 'a':   return it ? only(it.a) : '';
        case 'eq':  return it && it.a ? only(' = ' + it.a) : '';
        case 'ans': return only(' – Answers');
        case 'h':   return only('Answer');
        case 's':   return k < n && k >= 0 ? I[perm[k]].a : '';
        case 'n':   return k < n && k >= 0 ? only(String(perm[k] + 1)) : '';
        case 'lt':  return k < n && k >= 0 ? LETTERS[k] + '.' : '';
        case 'l':   return it ? only(LETTERS[inv[k]]) : '';
        case 'ideas': return P.extra || '';
        case 'ideasline': return P.extra ? ' Ideas could include: ' + P.extra : ''; // the sentence is left out when there are no ideas
        case 'o': { if(!it) return ''; const j = 'ABC'.indexOf(suf); return j < 0 ? '' : it.opts[opt[k][j]] || ''; }
        case 'c': { if(!it) return ''; return 'ABC'[opt[k].indexOf(0)] || ''; }      // always the real letter: `when` rules use it (answer slide only)
        case 't': { if(!it) return ''; const right = suf==='b'; return side[k]===right ? it.q : it.a; }
        case 'k': { if(!it) return ''; const right = suf==='b'; return side[k]===right ? '✓' : ''; } // used by `when` rules
        case 'w':   return k >= 0 && k < n ? I[perm[k]].q : '';
        case 'cat': return only(cats[k] || '');
        case 'cw': { // the category's words as "4) word", one per line, in the order of their numbers in the word bank
          if(!cats[k]) return '';
          const rows = I.map((x, i)=>({ x, n:inv[i] + 1 })).filter(r=>r.x.a===cats[k]).sort((a, b)=>a.n - b.n);
          return only(rows.map(r=>`${r.n}) ${r.x.q}`).join('\n'));
        }
      }
      return '';
    };
  }
  const SLOT = /\{([a-z]+)(\d*)([a-zA-Z]?)\}/g;
  function pass(node, get){
    if(typeof node==='string') return node.replace(SLOT, (m, name, idx, suf)=>esc(get(name, idx, suf)).replace(/\n/g, '<br>')); // a value with line breaks (a category's words) stays on separate lines
    if(Array.isArray(node)) return node.map(v=>pass(v, get));
    if(node && typeof node==='object'){ const o = {}; for(const k of Object.keys(node)) o[k] = pass(node[k], get); return o; }
    return node;
  }
  const RULES = ['need', 'ans', 'rv', 'when', 'spread', 'btn'];
  // spread: a text with line breaks becomes one paragraph per line, so the box can space them out evenly (a category's answers).
  function spreadLines(html){
    const m = /^(<div[^>]*>)(<span[^>]*>)([\s\S]*)(<\/span><\/div>)$/.exec(html); if(!m) return html;
    return m[3].split('<br>').map(l=>m[1] + m[2] + l + m[4]).join('');
  }
  // The question slide's cfg (answer = false) or the answer slide's (true) for the form's rows (or typed text).
  function prep(x, input, opts){
    const lang = (opts && opts.lang) || 'fr', flip = !!(opts && opts.flip); // flip: show the answers as the questions
    const f = x.fill, max = f.max || 10;
    const P = typeof input==='string' ? parse(f.fmt, input, max) : parseRows(f.fmt, input, max);
    if(flip) P.items = P.items.map(it=>Object.assign({}, it, { q:it.a, a:it.q }));
    const make = answer=>{
      const get = getter(f.fmt, P, answer, lang, flip), live = getter(f.fmt, P, true, lang, flip);
      const src = (x.cfg.added || []), out = pass(Object.assign({}, x.cfg, { added:[] }), get);
      out.obj = Object.assign({}, out.obj);
      out.added = [];
      for(const a of src){
        if(a.need && a.need > P.items.length) continue;
        if(a.ans==='only' && !answer) continue;
        if(a.when && String(live(a.when[0], a.when[1], a.when[2]))!==String(a.when[3])) continue;
        const b = pass(a, get);
        if(a.spread && typeof b.html==='string') b.html = spreadLines(b.html);
        for(const r of RULES) delete b[r];
        if(answer && a.rv){ out.obj['n' + a.id] = 'hide'; if(a.btn){ out.btn = Object.assign({}, out.btn); out.btn['on' + a.id] = { dx:a.btn.dx, dy:a.btn.dy }; } } // btn: where its eye button sits (an offset from the box's top-left)
        out.added.push(b);
      }
      return out;
    };
    return { P, make };
  }

  /* ---------- Sentence Builder items ---------- */
  const plain = s=>String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  // Every item with both languages in a builder document (doc.cols[].groups[][]: { tl, en }), each once.
  function builderItems(doc){
    const out = [], seen = new Set();
    for(const c of (doc && doc.cols) || []) for(const g of c.groups || []) for(const it of g || []){
      const tl = plain(it.tl), en = plain(it.en); if(!tl || !en) continue;
      const key = tl.toLowerCase() + '|' + en.toLowerCase(); if(seen.has(key)) continue;
      seen.add(key); out.push({ tl, en });
    }
    return out;
  }
  // A builder's columns: [{ title, items:[{ tl, en }] }], each item once within its column.
  function builderColumns(doc){
    return ((doc && doc.cols) || []).map((c, i)=>({ title:plain(c.title) || ('Column ' + (i + 1)), items:builderItems({ cols:[c] }) }));
  }
  // Chosen builder items as form rows for a template. src 'tl': the question is the target language.
  function rowsFromBuilder(x, items){
    const f = x.fill, tlFirst = f.src!=='en';
    const q = it=>tlFirst ? it.tl : it.en, a = it=>tlFirst ? it.en : it.tl;
    if(f.fmt==='list') return items.map(it=>[it.tl]);
    if(f.fmt==='pairs' && f.dir) return items.map(it=>[it.tl, it.en]); // fill.dir: the form is always target language | English; the form's direction choice says which side pupils see
    if(f.fmt==='pairs') return items.map(it=>[q(it), a(it)]);
    if(f.fmt==='options'){
      return items.map((it, i)=>{ // the other items' answers make the wrong choices
        const pool = items.filter((_, j)=>j!==i).map(a); const rnd = rng(seedOf(q(it) + i));
        const w = []; while(w.length < 2 && pool.length){ w.push(pool.splice(Math.floor(rnd()*pool.length), 1)[0]); }
        return [q(it), a(it), w[0] || '', w[1] || ''];
      });
    }
    return null; // duo, cats, topic: not from a builder
  }
  const canBuilder = x=>!!x.fill && ['list', 'pairs', 'options'].includes(x.fill.fmt);

  /* ---------- the year group's colours ---------- */
  const hex = h=>[1, 3, 5].map(i=>parseInt(h.slice(i, i + 2), 16));
  const toHex = a=>'#' + a.map(v=>Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const blend = (a, b, t)=>{ const x = hex(a), y = hex(b); return toHex(x.map((v, i)=>v*(1 - t) + y[i]*t)); };
  // g: { d, m, l } (the lesson's dark / middle / light). The soft box colour sits between light and middle.
  const tintOf = g=>blend(g.l, g.m, 0.35);
  // The answer colours (fill, bold text, border): green, except in Year 7 whose design is green, where they are red.
  const ANSWER = { green:{ fill:'#EDF7EA', ink:'#1E6B2E', line:'#2E8B3E' }, red:{ fill:'#FBEAEA', ink:'#9B1C1C', line:'#C0392B' } };
  const answerSet = k=>String(k)==='7' ? ANSWER.red : ANSWER.green;
  function theme(cfg, g){
    const map = { [TOKENS.light]:g.l, [TOKENS.tint]:tintOf(g), [TOKENS.mid]:g.m, [TOKENS.dark]:g.d };
    const A = answerSet(g.k); if(A!==ANSWER.green) for(const p of ['fill', 'ink', 'line']) map[ANSWER.green[p].toUpperCase()] = A[p]; // the templates are drawn in green
    const re = new RegExp(Object.keys(map).join('|'), 'gi');
    const walk = n=>typeof n==='string' ? n.replace(re, m=>map[m.toUpperCase()]) : Array.isArray(n) ? n.map(walk) : n && typeof n==='object' ? Object.fromEntries(Object.entries(n).map(([k, v])=>[k, walk(v)])) : n;
    return walk(cfg);
  }

  // The slots a format understands (for the template editor's Slots… button). [slot, meaning]
  function legend(fmt){
    const L = [['{no1}', 'the number 1 (blank when there is no item 1)'], ['{i1}', 'the number with a bracket, "1)"'], ['{q1}', 'question 1']];
    const A = [['{a1}', 'answer 1: appears on the answer slide only'], ['{aa1}', 'answer 1, always shown'], ['{qq1}', 'question 1, answer slide only'], ['{eq1}', '" = answer 1", answer slide only']];
    if(fmt==='pairs') L.push(...A, ['{s1}', 'the 1st answer in a shuffled order (a jumbled list)'], ['{n1}', 'which question the 1st shuffled answer belongs to (answer slide)'], ['{lt1}', 'the letter "A." for the 1st shuffled answer'], ['{l1}', 'the letter of question 1\'s answer in the shuffled list (answer slide)']);
    if(fmt==='duo') L.push(['{t1a}  {t1b}', 'the two choices for line 1, in a mixed-up order']);
    if(fmt==='options') L.push(['{o1A}  {o1B}  {o1C}', 'the three choices for question 1, in a mixed-up order'], ['{c1}', 'the letter of the right choice']);
    if(fmt==='cats') L.push(['{w1}', 'the 1st word, in a shuffled order'], ['{cat1}', 'the title of category 1 (answer slide)'], ['{cw1}', 'the words in category 1 as "4) word", one per line, smallest number first (answer slide)']);
    if(fmt==='topic') L.push(['{aa1}', 'the translation of the topic'], ['{ideas}', 'the ideas typed for pupils'], ['{ideasline}', 'the sentence "Ideas could include: ...", or nothing when no ideas are typed']);
    L.push(['{tl}  {en}', 'français / anglais, or español / inglés, by the language of the lesson'], ['{langname}', 'French or Spanish, by the language of the lesson']);
    if(fmt==='pairs') L.push(['{into}', 'English, or French / Spanish when pupils are set to translate into the language (Word bank)']);
    L.push(['{ans}', 'the words " – Answers": put one in the title so the answer slide says so']);
    L.push(['Numbers 1, 2, 3…', 'go up to the most the template allows.']);
    L.push(['Hidden rules', 'Boxes that only show on the answer slide, start hidden behind an eye, or vanish when a row is unused are set by the template; copying or moving them keeps their rules.']);
    return L;
  }
  window.INON = { ANSWER, answerSet, TOKENS, formats, cols, rows, parse, parseRows, sample, prep, pass, getter, theme, tintOf, legend, builderItems, rowsFromBuilder, builderColumns, canBuilder, cut, lines };
})();
