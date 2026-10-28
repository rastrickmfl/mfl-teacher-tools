/* demo.js: test mode, for showing the app to teachers before they use it themselves.
   "Enter test mode" on the start screen (or index.html?demo) builds a made-up data folder in the browser's private storage (OPFS),
   never the user's real folder, and opens the dashboard on it:
   - a timetable of eight classes (7A1, 7B1, 8A1, 8B1, 9A1, 9B1: two lessons a week; 10A, 11A: three), free periods as PPA;
   - 30 made-up pupils in each class;
   - one master deck, 'Lesson Library/Other/Demo lesson.pptx' (copied from demo/Demo lesson.pptx), and a copy of it in every
     timetabled lesson of this week and next, linked to the master: edit the master and the lessons show 'Master updated';
   - no Waypoints (starter-content.js is told to leave them out).
   Nothing is kept: the private folder is emptied on entry and the start screen comes back on refresh.
   Needs the app to be served over http(s) (fetch of the deck and starter files). Uses window.SVCore and SVLibrary. */
(function(){
  'use strict';
  const C = window.SVCore;
  if(!C || C.PUPIL) return;

  const DIR = 'demo';                       // folder inside the browser's private storage
  const DECK_URL = 'demo/Demo lesson.pptx';
  const DECK_KEY = 'Other/Demo lesson';     // its Lesson Library key
  const WEEKS = 2;                          // this week and next

  // Monday to Friday; the rows are P1, P2, P3, Form, P4, P5 (Form left empty). 'PPA' fills the gaps.
  const GRID = {
    1: ['7A1', '8B1', '9A1', '', '10A', 'PPA'],
    2: ['11A', '7B1', '8A1', '', 'PPA', '9B1'],
    3: ['PPA', '10A', '9A1', '', '7A1', '11A'],
    4: ['8A1', 'PPA', '9B1', '', '11A', '7B1'],
    5: ['10A', 'PPA', '8B1', '', 'PPA', 'PPA'],
  };
  const CLASSES = ['7A1', '7B1', '8A1', '8B1', '9A1', '9B1', '10A', '11A'];

  const FIRST = ['Aaliyah', 'Aiden', 'Alfie', 'Amara', 'Amelia', 'Archie', 'Aria', 'Arlo', 'Chloe', 'Daisy', 'Daniel', 'Darcy', 'Elena', 'Ella', 'Ellis', 'Emily', 'Ethan', 'Evie', 'Felix', 'Freya',
    'George', 'Grace', 'Hannah', 'Harry', 'Hugo', 'Imogen', 'Isaac', 'Isla', 'Jack', 'Jasmine', 'Jessica', 'Joshua', 'Kai', 'Layla', 'Leo', 'Lily', 'Logan', 'Lucy', 'Maisie', 'Mason',
    'Maya', 'Mia', 'Mohammed', 'Nathan', 'Noah', 'Nora', 'Olivia', 'Oscar', 'Owen', 'Poppy', 'Rosie', 'Ruby', 'Ryan', 'Sam', 'Sara', 'Sophie', 'Theo', 'Tyler', 'Willow', 'Zara'];

  // A small seeded generator, so the same class always gets the same pupils.
  function rng(seed){ let a = seed >>> 0; return ()=>{ a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pupils(label, n){
    const rand = rng([...label].reduce((s, ch)=>s * 31 + ch.charCodeAt(0), 7)), seen = new Set(), out = [];
    while(out.length < n){
      const first = FIRST[Math.floor(rand() * FIRST.length)], last = String.fromCharCode(65 + Math.floor(rand() * 26));
      if(seen.has(first + last)) continue;
      seen.add(first + last);
      out.push({ id:'p' + label.toLowerCase() + out.length, first, last });
    }
    return out.sort((a, b)=>a.first.localeCompare(b.first) || a.last.localeCompare(b.last));
  }

  async function dirAt(root, path){ let d = root; for(const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create:true }); return d; }

  function bar(){
    if(document.querySelector('.demo-bar')) return;
    const st = document.createElement('style');
    st.textContent = '.demo-bar{position:fixed;left:12px;bottom:12px;z-index:900;display:flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:#fff4d6;color:#6b4a00;border:1px solid #e2b93b;font:600 12px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}'
      + '.demo-bar button{border:0;border-radius:999px;padding:6px 10px;background:#fff;color:#6b4a00;font:600 12px/1 system-ui,sans-serif;cursor:pointer;border:1px solid #e2b93b}.demo-bar button:hover{background:#ffe9a8}'
      + 'body.presenting .demo-bar{display:none}';
    document.head.appendChild(st);
    const b = document.createElement('div'); b.className = 'demo-bar';
    b.innerHTML = '<span>TEST MODE</span><button data-d="reset" title="Start again with fresh sample data">Reset</button><button data-d="exit" title="Back to the start screen">Exit</button>';
    b.onclick = e=>{
      const k = e.target.dataset && e.target.dataset.d;
      if(k==='reset') location.href = location.pathname + '?demo';
      if(k==='exit') location.href = location.pathname;
    };
    document.body.appendChild(b);
  }

  let entering = false;
  async function enter(){
    if(entering) return;
    if(!/^https?:$/.test(location.protocol) || !(navigator.storage && navigator.storage.getDirectory)){
      C.toast('Test mode needs the app opened from its web address in Edge or Chrome, not as a file.', true); return;
    }
    entering = true; window.SV_DEMO = true;
    C.showLoading('Setting up test mode…');
    try{
      const root = await navigator.storage.getDirectory();
      try{ await root.removeEntry(DIR, { recursive:true }); }catch(e){}
      const dir = await root.getDirectoryHandle(DIR, { create:true });
      SBCore.Store.dir = dir; SBCore.Store.state = 'ok'; // the data folder is the private one

      if(window.SVStarter) await SVStarter.seed(dir, { skip:p=>/^Waypoints\//.test(p) });

      const res = await fetch(DECK_URL);
      if(!res.ok) throw new Error('The sample lesson is missing (' + res.status + ')');
      const deck = await res.blob();
      const lib = await dirAt(dir, 'Lesson Library/Other');
      const w = await (await lib.getFileHandle('Demo lesson.pptx', { create:true })).createWritable(); await w.write(deck); await w.close();

      const classes = {};
      for(const c of CLASSES) classes[c] = { pupils:pupils(c, 30) };
      const zero = { 1:0, 2:0, 3:0, 4:0, 5:0 };
      await C.startDemo({ timetable:{ grid:GRID, p2Time:zero, formTime:zero }, classes });

      await SVLibrary.scan();
      const mon = C.mondayOf(C.selDate);
      for(let n = 0; n < 5 * WEEKS; n++){
        const d = C.addDays(mon, n + Math.floor(n / 5) * 2);
        for(const r of C.dayRows(d)){
          if(r.kind!=='lesson') continue;
          C.showLoading(`Setting up test mode… ${C.iso(d)} ${r.meta.label}`);
          await SVLibrary.copyToLesson(DECK_KEY, r.meta, { pull:true });
        }
      }
      C.renderDashboard();
      bar();
    }catch(e){
      console.error(e); window.SV_DEMO = false;
      C.toast("Couldn't set up test mode: " + e.message, true);
    }finally{ C.hideLoading(); entering = false; }
  }

  window.SVDemo = { enter };
})();
