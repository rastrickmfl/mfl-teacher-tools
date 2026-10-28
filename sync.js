/* Slideshow Viewer — working on several computers (v1.52, 2026-10-16)

   The app is opened from the OneDrive folder on more than one computer (home
   laptop, office PC, classroom PC). OneDrive copies files between them but has
   no idea what is inside, so this file keeps one computer from undoing another's
   work:

   1. merge3: before viewer-data.json is written, if it changed on disk since this
      window last read or wrote it (another computer saved), the two versions are
      merged item by item against the version both started from. Only what this
      window changed is written over; everything else keeps the other computer's
      version. A clash on the very same item (both changed one slide's pen marks)
      keeps this window's.
   2. absorb: OneDrive's own conflict copies (viewer-data-<COMPUTER>.json) are
      merged in, additive only (missing awards, AP lesson records, Box of Four,
      absences, picks, pupils, this week's lessons and print jobs), then moved to
      Sync/Conflict copies.
   3. Achievement points live in Sync/Points/points-<computer id>.json, one file
      per computer, so two computers never write the same file. A computer's file
      holds the awards it made (or adopted from the old shared list) and the ids
      of any awards it deleted; everyone reads every file.

   Classic script (no modules): pages opened from a file block ES modules. */
(function(){
'use strict';
const isObj = v => !!v && typeof v==='object' && !Array.isArray(v);
const same = (a, b) => a===b || JSON.stringify(a)===JSON.stringify(b);
const isIdList = a => Array.isArray(a) && a.every(x=>isObj(x) && x.id!=null && x.id!=='');
// Kept out of the merge of viewer-data.json: points have their own files.
const TOP_SKIP = new Set(['points', 'version']);

/* Three-way merge, in place on mine (object identity is kept wherever possible, so
   a lesson being presented keeps the same object). Returns how many items were
   taken from theirs. */
function merge3(mine, base, theirs, top = true){
  let n = 0;
  if(!isObj(mine) || !isObj(theirs)) return 0;
  const b0 = isObj(base) ? base : {};
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b0)]);
  for(const k of keys){
    if(top && TOP_SKIP.has(k)) continue;
    const m = mine[k], b = b0[k], t = theirs[k];
    if(same(t, b) || same(m, t)) continue;          // they changed nothing here, or both agree
    if(isObj(m) && isObj(t)){ n += merge3(m, b, t, false); continue; } // look inside
    if(same(m, b)){                                 // only they changed it
      if(t===undefined) delete mine[k]; else mine[k] = t;
      n++; continue;
    }
    if(Array.isArray(m) && Array.isArray(t) && (m.length || t.length) && isIdList(m) && isIdList(t)){
      const r = mergeIdList(m, Array.isArray(b) ? b : [], t);
      if(r.n){ mine[k] = r.list; n += r.n; }
      continue;
    }
    // Both changed the same value: keep mine.
  }
  return n;
}
// Lists of { id, … } records: merged record by record.
function mergeIdList(m, b, t){
  const B = new Map(b.filter(isObj).map(x=>[x.id, x])), M = new Map(m.map(x=>[x.id, x])), T = new Map(t.map(x=>[x.id, x]));
  const out = []; let n = 0;
  for(const x of m){
    const bx = B.get(x.id), tx = T.get(x.id);
    if(tx===undefined){ if(bx!==undefined && same(x, bx)){ n++; continue; } out.push(x); continue; } // they deleted it (unless I changed it)
    if(same(x, bx) && !same(tx, bx)){ out.push(tx); n++; } else out.push(x);
  }
  for(const x of t){
    if(M.has(x.id)) continue;
    const bx = B.get(x.id);
    if(bx!==undefined && same(x, bx)) continue;     // I deleted it
    out.push(x); n++;                               // theirs is new (or they changed one I deleted)
  }
  return { list:out, n };
}

/* Conflict copy → main, adding only what is missing. mondayIso: the first day of
   this week (older lessons and print jobs are left alone, as the dashboard clears them). */
function absorb(main, copy, mondayIso){
  if(!isObj(main) || !isObj(copy)) return 0;
  let n = 0;
  const addKeys = (k, keep) => {
    const src = copy[k]; if(!isObj(src)) return;
    const dst = isObj(main[k]) ? main[k] : (main[k] = {});
    for(const [id, v] of Object.entries(src)) if(!(id in dst) && (!keep || keep(v, id))){ dst[id] = v; n++; }
  };
  const addIds = (k, keep) => {
    const src = copy[k]; if(!isIdList(src)) return;
    const dst = Array.isArray(main[k]) ? main[k] : (main[k] = []);
    const have = new Set(dst.map(x=>x && x.id));
    for(const x of src) if(!have.has(x.id) && (!keep || keep(x))){ dst.push(x); n++; }
  };
  for(const k of ['apLessons', 'apLogged', 'box4', 'absent', 'picks']) addKeys(k);
  addKeys('lessons', l=>isObj(l) && (l.lib || String(l.date || '') >= mondayIso));
  addIds('printJobs', j=>String(j.day || '') >= mondayIso);
  addIds('ideas');
  addIds('gcSets');
  if(isObj(copy.classes)){
    if(!isObj(main.classes)) main.classes = {};
    for(const [c, rec] of Object.entries(copy.classes)){
      if(!isObj(rec)) continue;
      const mine = main.classes[c];
      if(!mine){ main.classes[c] = rec; n++; continue; }
      if(isIdList(rec.pupils) && Array.isArray(mine.pupils)){
        const have = new Set(mine.pupils.map(p=>p && p.id));
        for(const p of rec.pupils) if(!have.has(p.id)){ mine.pupils.push(p); n++; }
      }
    }
  }
  return n;
}

// viewer-data.json as written: everything except the points.
function mainText(d){
  const o = {};
  for(const k of Object.keys(d || {})) if(k!=='points') o[k] = d[k];
  return JSON.stringify(o);
}
function newId(){ return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }

window.SVSync = { merge3, mergeIdList, absorb, mainText, same, newId };
})();
