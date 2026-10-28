/* library.js — Create (v1.36) and the Lesson Library (v1.37). See claude/lesson-library-spec.md in the project.

   Create: the dashboard's Create button (top bar, or Create on an empty lesson) builds a new deck from
   'New lesson template.pptx' in the data folder (all 4 slides, in order) and puts it straight into
   a lesson slot (through attachFile(), so it's stored like a dropped deck), a Library folder, or both.

   Library folders are real folders under 'Lesson Library/' in the data folder. Fixed ones:
   Year 7 … Year 11, each with the six half-terms + Other, and a top-level Other (FIXED_FOLDERS).
   ensureFixed() puts them back if they go missing. Own subfolders can go inside any fixed folder.

   Library (v1.37, phase 2a):
   - A deck is Name.pptx and/or Name.pdf in one folder. Its key is '<folder>/<Name>' (no 'Lesson Library/', no extension).
     data.library.decks[key] = { title, added, created?, size:{ pptx, pdf }, missingSince? } records the decks the app knows.
   - A deck's master state (hides, reveals, object edits, slide order, My notes, title, language, ratio) is a lesson
     entry data.lessons['lib|' + key] with lib:key and no date, made when it's first edited, copied or saved over.
     So the editor, thumbnails, the pupil window and tidyShared() work on it as on a lesson; oldLessons() skips it.
   - scan() re-reads the folders when the panel opens, on Refresh, and when the window comes back into view. A recorded
     deck that's gone is re-linked to an unrecorded one with the same name and size (moved in File Explorer); records still
     missing after 30 days are dropped. Decks in the Library's root, a Year folder's root, or a folder that isn't inside a
     fixed one are Unsorted.
   - Lesson copies carry the master's prep (as Duplicate does: not pen marks) and remember fromLib = key.
   - Side panel on the dashboard (mountPanel, toggled from the top bar); Choose from Library (openChoose) on a slot;
     Save to / Replace from Library in a lesson's ⋯ menu; drag a deck onto a lesson slot (DRAG_TYPE, app.js drop
     handler); drop .pptx/.pdf from File Explorer onto the panel. Own subfolders and decks can be renamed and moved
     (drag onto a folder or a breadcrumb, or Move to…).

   Library file manager (v1.38, phase 2b):
   - Selection (S.sel, ids 'd:<key>' / 'f:<path>'): click a deck, Ctrl/Shift-click decks and own folders, Ctrl+A, Esc.
     Fixed folders can't be selected, copied, cut, moved, renamed or deleted, only coloured. A bar in the footer acts on it.
   - Copy / Cut / Paste (S.clip, this session only): Ctrl+C / X / V, ⋯ menus, footer Paste; Ctrl-drag = copy. A copied deck
     gets its own record, master (the source's prep, via copyPrep), colour and index entry; own folders copy with all inside.
   - Bin: files really move to 'Lesson Library/.Bin/<id>/' (walk() skips '.' folders). data.library.bin[id] =
     { kind:'deck'|'folder', name, from, at, keys:[bin keys], colors? }. Binned decks are re-keyed with rekey() to
     '.Bin/<id>/…', so records, masters, index entries and lesson copies' fromLib follow them there and back on restore.
     reconcile() leaves '.Bin/' keys alone. Delete forever / Empty bin / 30 days (purgeBin() in scan) drop the files and
     the records, masters and index entries, and clear fromLib on lesson copies.
   - Colours: a deck's in its record (R[key].color, so rekey() carries it); folders' in data.library.folderColors[path]
     (moved by moveFolder(), carried through the bin, pruned in scan()). Deck = left stripe; folder = tinted icon.
   - Search: names, folder paths and slide text (PDF text for PDF-only decks). The index is a separate file,
     'Lesson Library/.search-index.json' ({ v:1, decks:{ key:{ s:sizes, t:text } } }), loaded in scan(), moved by rekey(),
     pruned in scan(). kickIndex() indexes decks with no entry or changed sizes, a deck at a time: after a scan
     (so on panel open), and when a deck is created, added, saved or saved over as a master.

   Master updated → Pull changes (v1.86, see claude/lesson-library-spec.md):
   - prepSig(l): a short hash of what a lesson copy takes from its master (file sizes, hides/reveals/edits, My notes,
     slide order, title, language, ratio, gcSet). A lesson copy remembers fromSig (the master's at copy/pull time) and
     ownSig (its own then). Master sig ≠ fromSig → the master has changed; own sig ≠ ownSig → the lesson has its own edits.
   - Copies made before v1.86 are baselined on load (or when their master is first made), so they don't all flag at once.
   - Lessons from today on get a 'Master updated' button on the dashboard row (pullBadge); it offers Pull changes or
     Keep this version (which just moves fromSig on). Pulling = copyToLesson without its replace question: the lesson
     becomes an exact copy of the master again, its own edits and pen marks go.
   - Done on a master that changed, or Save to Library → Update the master, offers to update every upcoming copy at once.

   Uses window.SVCore from app.js. Loaded after app.js. */
(function(){
  'use strict';
  const C = window.SVCore;
  const { store, FsStore, Planner, dayRows, attachFile, safeName, yearOf, modal, confirmBox, toast, showLoading, hideLoading,
    saveNow, esc, icon, iso, addDays, mondayOf, today, DAY_NAMES, MON_NAMES, $ } = C;
  const LIB_DIR = 'Lesson Library';
  const TEMPLATE = 'New lesson template.pptx';
  const YEARS = [7, 8, 9, 10, 11];
  const TERMS = ['1 - Autumn 1', '2 - Autumn 2', '3 - Spring 1', '4 - Spring 2', '5 - Summer 1', '6 - Summer 2', 'Other'];
  const FIXED_FOLDERS = (()=>{ const out = []; for(const y of YEARS){ out.push(`Year ${y}`); for(const t of TERMS) out.push(`Year ${y}/${t}`); } out.push('Other'); return out; })();

  // Only the main window with a real OneDrive folder can write decks (not the pupil window or ?test).
  function canCreate(){ return !C.PUPIL && !C.TEST && store===FsStore && !!store.dir; }

  // Rough half-term from the date (index into TERMS). Only a default for the folder picker.
  function halfTermOf(d){
    const m = d.getMonth(), day = d.getDate();
    if(m===8 || m===9) return 0;          // Sep–Oct
    if(m===10 || m===11) return 1;        // Nov–Dec
    if(m===0 || m===1) return 2;          // Jan–Feb
    if(m===2 || (m===3 && day<15)) return 3; // Mar – mid Apr
    if(m===3 || m===4) return 4;          // mid Apr – May
    return 5;                             // Jun–Aug
  }
  function defaultFolder(meta, d){
    const y = meta ? yearOf(meta.label) : null;
    return YEARS.includes(y) ? `Year ${y}/${TERMS[halfTermOf(d || today())]}` : 'Other';
  }

  async function dirAt(path, create){
    let d = await store.dir.getDirectoryHandle(LIB_DIR, { create });
    for(const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
    return d;
  }
  // Puts back any fixed folder that's missing (also if renamed or deleted in File Explorer).
  async function ensureFixed(){ for(const p of FIXED_FOLDERS) await dirAt(p, true); }
  async function existsIn(dir, name){ try{ await dir.getFileHandle(name); return true; }catch(e){ return false; } }
  async function uniqueIn(dir, base){
    const dot = base.lastIndexOf('.'), stem = base.slice(0, dot), ext = base.slice(dot);
    let n = base, k = 2;
    while(await existsIn(dir, n)) n = `${stem} (${k++})${ext}`;
    return n;
  }
  // A minimal one-slide, 16:9, blank deck, used when the data folder has no template.
  async function blankDeck(){
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const rels = list=>X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map(([id, type, target])=>`<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('') + '</Relationships>';
    const tree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
    const clr = (n, v)=>`<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
    const fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    const ln = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
    const theme = X + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Blank"><a:themeElements><a:clrScheme name="Blank">`
      + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
      + clr('dk2', '1F2937') + clr('lt2', 'F3F4F6') + clr('accent1', '4F5BD5') + clr('accent2', '1E9E5A') + clr('accent3', 'E0701A') + clr('accent4', '7B3FB5') + clr('accent5', '2F5BEA') + clr('accent6', 'D99A00') + clr('hlink', '2F5BEA') + clr('folHlink', '7B3FB5')
      + '</a:clrScheme><a:fontScheme name="Blank"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
      + `<a:fmtScheme name="Blank"><a:fillStyleLst>${fills}${fills}${fills}</a:fillStyleLst><a:lnStyleLst>${ln}${ln}${ln}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fills}${fills}${fills}</a:bgFillStyleLst></a:fmtScheme>`
      + '</a:themeElements></a:theme>';
    const z = new JSZip();
    z.file('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
      + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
      + '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
      + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
    z.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
    z.file('ppt/presentation.xml', X + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    z.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'theme', 'theme/theme1.xml']]));
    z.file('ppt/slideMasters/slideMaster1.xml', X + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${tree}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
    z.file('ppt/slideLayouts/slideLayout1.xml', X + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
    z.file('ppt/slides/slide1.xml', X + `<p:sld ${NS}><p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    z.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]));
    z.file('ppt/theme/theme1.xml', theme);
    const blob = await z.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    blob.blank = true;
    return blob;
  }
  // The data folder's template if it has one, otherwise an empty deck.
  async function templateFile(){
    try{ return await (await store.dir.getFileHandle(TEMPLATE)).getFile(); }
    catch(e){ return blankDeck(); }
  }
  async function writeToLibrary(folder, fileName, blob){
    await ensureFixed();
    const dir = await dirAt(folder, true);
    const name = await uniqueIn(dir, fileName);
    const fh = await dir.getFileHandle(name, { create:true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
    return `${LIB_DIR}/${folder}/${name}`;
  }

  // Lesson slots in the selected week (Mon–Fri, not holidays), grouped by day.
  function weekSlots(){
    const data = C.data, mon = mondayOf(C.selDate), out = [];
    for(let n = 0; n < 5; n++){
      const d = addDays(mon, n);
      if(Planner.holiday(d)) continue;
      for(const r of dayRows(d)) if(r.kind!=='slim') out.push({ d, meta:r.meta, has:!!(data.lessons[r.meta.id] && data.lessons[r.meta.id].mode) });
    }
    return out;
  }
  function pickDefault(slots, meta){
    if(meta){ const i = slots.findIndex(s=>s.meta.id===meta.id); if(i>=0) return i; }
    const ds = iso(C.selDate), isToday = ds===iso(today());
    const nowM = new Date().getHours()*60 + new Date().getMinutes();
    const toM = t=>{ const [h, m] = String(t || '0:0').split(':').map(Number); return h*60 + (m || 0); };
    const day = slots.map((s, i)=>({ s, i })).filter(x=>iso(x.s.d)===ds && !x.s.has && x.s.meta.label);
    const ahead = isToday ? day.filter(x=>!x.s.meta.start || toM(x.s.meta.end)>nowM) : day;
    const hit = ahead.find(x=>yearOf(x.s.meta.label)) || ahead[0] || day[0];
    return hit ? hit.i : (slots.length ? 0 : -1);
  }

  function folderOptions(sel){
    let h = '';
    for(const y of YEARS){
      h += `<optgroup label="Year ${y}">` + TERMS.map(t=>{ const p = `Year ${y}/${t}`; return `<option value="${esc(p)}" ${p===sel?'selected':''}>Year ${y} › ${esc(t)}</option>`; }).join('') + '</optgroup>';
    }
    return h + `<optgroup label="Other"><option value="Other" ${sel==='Other'?'selected':''}>Other (Form, assemblies, intervention)</option></optgroup>`;
  }
  function slotOptions(slots, sel){
    let h = '', cur = '';
    slots.forEach((s, i)=>{
      const key = iso(s.d);
      if(key!==cur){ if(cur) h += '</optgroup>'; cur = key; h += `<optgroup label="${esc(DAY_NAMES[s.d.getDay()])} ${s.d.getDate()} ${esc(MON_NAMES[s.d.getMonth()])}">`; }
      const m = s.meta;
      h += `<option value="${i}" ${i===sel?'selected':''}>${esc(m.period)} · ${esc(m.label)}${m.start ? ` (${esc(m.start)})` : ''}${s.has ? ' · replaces its deck' : ''}</option>`;
    });
    return h + (cur ? '</optgroup>' : '');
  }

  function openCreate(meta){
    if(!canCreate()){ toast('Create needs the OneDrive folder connected. Go Home and reconnect.', true); return; }
    const slots = weekSlots();
    const si = pickDefault(slots, meta);
    const startFolder = defaultFolder(si>=0 ? slots[si].meta : null, si>=0 ? slots[si].d : C.selDate);
    modal(`<h2>Create a lesson</h2><p>A new empty deck. If <b>${esc(TEMPLATE)}</b> is in your data folder, the deck starts from that instead.</p>
      <label class="cr-lbl" for="cr-name">Name</label>
      <input type="text" id="cr-name" maxlength="120" placeholder="e.g. Lesson 13 - Expansion">
      <div class="cr-dest ${si>=0 ? 'on' : 'off'}" data-cr="lesson">
        <label class="cr-check"><input type="checkbox" data-cr-on="lesson" ${si>=0 ? 'checked' : 'disabled'}><span><b>Put it in a lesson</b><small>${si>=0 ? 'This week' : 'No lessons on your timetable this week'}</small></span></label>
        ${si>=0 ? `<select data-cr-slot>${slotOptions(slots, si)}</select>` : ''}
      </div>
      <div class="cr-dest ${si>=0 ? 'off' : 'on'}" data-cr="lib">
        <label class="cr-check"><input type="checkbox" data-cr-on="lib" ${si>=0 ? '' : 'checked'}><span><b>Save to the Lesson Library</b><small>The master copy. Lessons get their own copy.</small></span></label>
        <select data-cr-folder>${folderOptions(startFolder)}</select>
      </div>
      <div class="cr-dest on" data-cr="wp">
        <label class="cr-lbl" for="cr-wp-lang">Waypoint</label>
        <div class="cr-wp-row"><select id="cr-wp-lang" data-cr-wplang><option value="">No Waypoint</option><option value="fr">French</option><option value="es">Spanish</option></select>
        <select data-cr-wpyear><option value="">Year…</option>${YEARS.map(y=>`<option value="${y}">Year ${y}</option>`).join('')}</select></div>
        <small>Goes on the template's 'INSERT WAYPOINT HERE' slide, for this half-term.</small>
      </div>
      <div class="cr-err" aria-live="polite"></div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${icon('plus')}Create</button></div>`, (m, close)=>{
      const inp = $('#cr-name', m), err = $('.cr-err', m);
      const onL = $('[data-cr-on=lesson]', m), onB = $('[data-cr-on=lib]', m);
      const slotSel = $('[data-cr-slot]', m), folderSel = $('[data-cr-folder]', m);
      let folderTouched = false, wpYearTouched = false;
      const wpYear = $('[data-cr-wpyear]', m);
      // The Waypoint's year follows the destination (Library folder or lesson slot) until it is changed by hand.
      const followYear = (folder, slotInfo)=>{ if(wpYearTouched) return; const y = slotInfo ? yearOf(slotInfo.meta.label) : (/^Year (\d+)\//.exec(folder || '') || [])[1]; wpYear.value = y ? String(Number(y)) : ''; };
      wpYear.value = si>=0 ? String(yearOf(slots[si].meta.label) || '') : (/^Year (\d+)\//.exec(startFolder) || [])[1] || '';
      wpYear.onchange = ()=>{ wpYearTouched = true; };
      const sync = ()=>{
        $('[data-cr=lesson]', m).classList.toggle('on', onL.checked); $('[data-cr=lesson]', m).classList.toggle('off', !onL.checked);
        $('[data-cr=lib]', m).classList.toggle('on', onB.checked); $('[data-cr=lib]', m).classList.toggle('off', !onB.checked);
        if(slotSel) slotSel.disabled = !onL.checked;
        folderSel.disabled = !onB.checked;
        err.textContent = '';
      };
      onL.onchange = sync; onB.onchange = sync;
      folderSel.onchange = ()=>{ folderTouched = true; followYear(folderSel.value, null); };
      if(slotSel) slotSel.onchange = ()=>{ if(!folderTouched){ const s = slots[+slotSel.value]; folderSel.innerHTML = folderOptions(defaultFolder(s.meta, s.d)); } followYear(null, slots[+slotSel.value]); };
      sync();
      let busy = false;
      const ok = async ()=>{
        if(busy) return;
        const name = safeName(inp.value);
        if(!name){ err.textContent = 'Give the lesson a name.'; inp.focus(); return; }
        if(!onL.checked && !onB.checked){ err.textContent = 'Choose a lesson, the Library, or both.'; return; }
        const slot = onL.checked && slotSel ? slots[+slotSel.value] : null;
        const folder = onB.checked ? folderSel.value : null;
        if(slot && slot.has && !(await confirmBox('Replace this lesson’s deck?', `${slot.meta.label} already has a deck. Its copy, hides and annotations will be deleted.`, 'Replace', true))) return;
        // Waypoint (2026-10-24): language and year from the picker; half-term from the Library folder, else today.
        const lang = $('[data-cr-wplang]', m).value, wpY = Number(wpYear.value) || null;
        if(lang && !wpY){ err.textContent = 'Choose the Waypoint’s year, or set it to No Waypoint.'; wpYear.focus(); return; }
        const ft = folder && /^Year \d+\/(.+)$/.exec(folder), term = ft && TERMS.includes(ft[1]) ? ft[1] : halfTermOf(new Date());
        const wp = lang && wpY ? { lang, year:wpY, term } : null;
        busy = true; close();
        await create(name, slot, folder, wp);
      };
      $('[data-a=ok]', m).onclick = ok; $('[data-a=no]', m).onclick = close;
      inp.onkeydown = e=>{ if(e.key==='Enter') ok(); };
      inp.focus();
    });
  }

  // The template with this half-term's Waypoint on its marker slide, or null (missing Waypoint or slide: warned, lesson still made).
  async function waypointTemplate(tpl, wp){
    if(!window.SBWaypoints) return null;
    const label = `${wp.lang==='fr' ? 'French' : 'Spanish'} Year ${wp.year} ${wp.term}`;
    const pic = await SBWaypoints.getWaypoint(wp.lang, wp.year, wp.term);
    if(!pic){ toast(`No Waypoint yet for ${label}. The lesson was made without it: add it from Insert → Waypoint.`, true); return null; }
    const out = await SBWaypoints.fillTemplate(tpl, pic);
    if(!out) toast("The template has no 'INSERT WAYPOINT HERE' slide, so the Waypoint wasn't added.", true);
    return out;
  }

  async function create(name, slot, folder, wp){
    const fileName = name + '.pptx';
    let libPath = null, libKey = null;
    try{
      showLoading('Creating ' + fileName + '…');
      const tpl = await templateFile();
      if(wp && tpl.blank) toast('An empty deck has no Waypoint slide: add the Waypoint from Insert → Waypoint.', true);
      const filled = wp && !tpl.blank ? await waypointTemplate(tpl, wp) : null;
      const file = new File([await (filled || tpl).arrayBuffer()], fileName, { type:tpl.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      if(folder){
        libPath = await writeToLibrary(folder, fileName, file);
        const data = C.data;
        data.library = data.library && typeof data.library==='object' ? data.library : {};
        data.library.decks = data.library.decks || {};
        libKey = keyOfPath(libPath);
        decksRec()[libKey] = { title:name, added:Date.now(), created:true, size:{ pptx:file.size } };
        await saveNow();
      }
      hideLoading();
      if(slot) await attachFile(file, slot.meta); // stores the lesson copy, saves and redraws the dashboard
      if(slot && libKey && C.data.lessons[slot.meta.id]){ C.data.lessons[slot.meta.id].fromLib = libKey; C.saveSoon(); }
      if(libKey){ S.stale = true; if(S.open) refresh(); else kickIndex(); }
      const where = folder ? `Lesson Library › ${folder.replace('/', ' › ')}` : '';
      if(slot && folder) toast(`Created in ${slot.meta.label} and ${where}`);
      else if(folder) toast(`Created in ${where}`);
    }catch(e){
      hideLoading(); console.error(e);
      toast(`Couldn't create ${fileName}: ${e.message}` + (libPath ? ` (the Library copy was saved)` : ''), true);
    }
  }


  /* =====================================================================================
     Lesson Library (v1.37, phase 2a)
     ===================================================================================== */
  const DRAG_TYPE = 'application/x-sv-libdeck', FOLDER_TYPE = 'application/x-sv-libfolder';
  const EXTS = ['pptx', 'pdf'];
  const MISSING_DAYS = 30;
  const TOP_FIXED = [...YEARS.map(y=>`Year ${y}`), 'Other'];
  const lsGet = k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsSet = (k, v)=>{ try{ localStorage.setItem(k, v); }catch(e){} };
  // S.cwd: folder path inside Lesson Library ('' = the top, UNSORTED = the Unsorted list).
  const UNSORTED = ':unsorted'; // ':' can't be in a Windows folder name
  const BIN = ':bin';         // S.cwd for the Bin view
  const BIN_DIR = '.Bin', BIN_DAYS = 30;
  const INDEX_FILE = '.search-index.json';
  const PALETTE = [['Red','#E5484D'], ['Orange','#F76B15'], ['Amber','#E2A000'], ['Green','#30A46C'], ['Teal','#12A594'], ['Blue','#0090FF'], ['Purple','#8E4EC6'], ['Pink','#D6409F']];
  const S = { open: lsGet('sv_lib_open')==='1', cwd: lsGet('sv_lib_cwd') || '', tree:null, stale:true, scanning:null, thumbs:new Map(), drag:null, io:null,
    sel:new Set(), anchor:null, clip:null, q:'', focus:false, idx:null, idxTimer:null, indexing:null, idxDone:0, idxTotal:0,
    full:false, pv:null, pvPos:0, pvTok:0, pvThumbs:new Map(), treeOpen:new Set(), returnFull:false }; // v1.85: the full Library page
  const isBinKey = k=>String(k).startsWith(BIN_DIR + '/');
  const clone = o=>JSON.parse(JSON.stringify(o || {}));
  const masterId = key=>'lib|' + key;
  const master = key=>C.data.lessons[masterId(key)] || null;
  const parentOf = p=>p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const baseOf = p=>p.slice(p.lastIndexOf('/') + 1);
  const crumbText = p=>p.split('/').join(' › ');
  const extOf = n=>{ const m = /\.(pptx|pdf)$/i.exec(n); return m ? m[1].toLowerCase() : null; };
  const stemOf = n=>n.replace(/\.(pptx|pdf)$/i, '');
  const pathOf = (key, ext)=>`${LIB_DIR}/${key}.${ext}`;
  function keyOfPath(p){ return String(p).replace(/^Lesson Library\//, '').replace(/\.(pptx|pdf)$/i, ''); }
  function libData(){ const d = C.data; if(!d.library || typeof d.library!=='object') d.library = {}; return d.library; }
  function decksRec(){ const L = libData(); if(!L.decks || typeof L.decks!=='object') L.decks = {}; return L.decks; }
  function binRec(){ const L = libData(); if(!L.bin || typeof L.bin!=='object') L.bin = {}; return L.bin; }
  function folderColors(){ const L = libData(); if(!L.folderColors || typeof L.folderColors!=='object') L.folderColors = {}; return L.folderColors; }
  // Moves the colours of a folder and everything under it to another path (to = null: drops them).
  function recolorTree(from, to){
    const FC = folderColors();
    for(const k of Object.keys(FC)) if(k===from || k.startsWith(from + '/')){ const v = FC[k]; delete FC[k]; if(to!=null) FC[to + k.slice(from.length)] = v; }
  }
  function dateOf(s){ const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : today(); }
  const SV = iconMap({
    book: 'book-open',
    folder: 'folder',
    folderPlus: 'folder-plus',
    inbox: 'inbox',
    refresh: 'rotate-cw',
    chev: 'chevron-right',
    bin: 'trash-2',
    search: 'search',
    copy: 'copy',
    cut: 'scissors',
    paste: 'clipboard',
    move: 'folder-input',
    palette: 'palette',
    deck: 'presentation',
    restore: 'undo-2',
  });
  const svg = (n, cls='ico')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${SV[n]}</svg>`;

  // ---------- where things may go ----------
  const topOf = p=>p.split('/')[0];
  const inFixed = p=>!!p && TOP_FIXED.includes(topOf(p));
  const isYearRoot = p=>/^Year \d+$/.test(p);
  // Decks live in a half-term folder, a Year's or the top Other, or an own subfolder inside a fixed folder.
  function canHoldDecks(p){ return inFixed(p) && !isYearRoot(p); }
  // Own subfolders can be made inside any fixed folder (and inside own subfolders).
  function canHoldFolders(p){ return inFixed(p); }
  function isFixed(p){ return FIXED_FOLDERS.includes(p); }

  // ---------- file system ----------
  async function libRoot(){ return store.dir.getDirectoryHandle(LIB_DIR, { create:true }); }
  async function dirOf(path, create){ let d = await libRoot(); for(const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create:!!create }); return d; }
  async function hasEntry(dir, name, kind){ try{ if(kind==='dir') await dir.getDirectoryHandle(name); else await dir.getFileHandle(name); return true; }catch(e){ return false; } }
  // A name for a deck that's free for both .pptx and .pdf in dir.
  async function freeStem(dir, stem){
    let n = stem, k = 2;
    while((await hasEntry(dir, n + '.pptx')) || (await hasEntry(dir, n + '.pdf'))) n = `${stem} (${k++})`;
    return n;
  }
  async function freeFolder(dir, name){ let n = name, k = 2; while(await hasEntry(dir, n, 'dir')) n = `${name} (${k++})`; return n; }
  async function writeFile(dir, name, blob){ const fh = await dir.getFileHandle(name, { create:true }); const w = await fh.createWritable(); await w.write(blob); await w.close(); }
  // Moves (or renames) a file or folder. Uses move() where Edge supports it, else copies and removes the original.
  async function moveEntry(src, name, dst, newName, kind){
    if(src===dst && name.toLowerCase()===newName.toLowerCase() && name!==newName){ // case-only rename on Windows
      const tmp = `${newName}.~sv${Date.now()}`;
      await moveEntry(src, name, src, tmp, kind); return moveEntry(src, tmp, dst, newName, kind);
    }
    const h = kind==='dir' ? await src.getDirectoryHandle(name) : await src.getFileHandle(name);
    if(typeof h.move==='function'){ try{ await h.move(dst, newName); return; }catch(e){ /* not supported here: copy instead */ } }
    if(kind==='dir'){
      const nd = await dst.getDirectoryHandle(newName, { create:true });
      for await (const [n, ch] of h.entries()) await moveEntry(h, n, nd, n, ch.kind==='directory' ? 'dir' : 'file');
      await src.removeEntry(name, { recursive:true });
    } else {
      await writeFile(dst, newName, await h.getFile());
      await src.removeEntry(name);
    }
  }

  // ---------- scan + reconcile ----------
  function sortFolders(paths){
    const rank = p=>{ const b = baseOf(p), par = parentOf(p);
      if(!par){ const i = TOP_FIXED.indexOf(b); return i>=0 ? i : 99; }
      if(isYearRoot(par)){ const i = TERMS.indexOf(b); return i>=0 ? i : 50; }
      return 50; };
    return paths.sort((a, b)=>rank(a) - rank(b) || baseOf(a).localeCompare(baseOf(b), undefined, { numeric:true, sensitivity:'base' }));
  }
  async function walk(){
    const folders = new Map(), decks = new Map();
    const addFolder = p=>{ if(!folders.has(p)) folders.set(p, { path:p, name:p ? baseOf(p) : 'Lesson Library', subs:[], decks:[], count:0 }); return folders.get(p); };
    addFolder('');
    const go = async (dir, path, depth)=>{
      for await (const [name, h] of dir.entries()){
        if(h.kind==='directory'){
          if(depth > 8 || name.startsWith('.')) continue;
          const p = path ? `${path}/${name}` : name;
          addFolder(p); folders.get(path).subs.push(p);
          await go(h, p, depth + 1);
        } else {
          const ext = extOf(name); if(!ext || name.startsWith('~$')) continue;
          const stem = stemOf(name), key = path ? `${path}/${stem}` : stem;
          let f; try{ f = await h.getFile(); }catch(e){ continue; }
          if(!decks.has(key)){ decks.set(key, { key, folder:path, stem, files:{} }); folders.get(path).decks.push(key); }
          decks.get(key).files[ext] = { name, size:f.size, path:pathOf(key, ext) };
        }
      }
    };
    await go(await libRoot(), '', 0);
    for(const f of folders.values()){ sortFolders(f.subs); f.decks.sort((a, b)=>decks.get(a).stem.localeCompare(decks.get(b).stem, undefined, { numeric:true, sensitivity:'base' })); }
    for(const d of decks.values()){
      d.unsorted = !canHoldDecks(d.folder);
      if(!d.unsorted) for(let p = d.folder; p; p = parentOf(p)) if(folders.has(p)) folders.get(p).count++;
    }
    return { folders, decks, unsorted:[...decks.values()].filter(d=>d.unsorted).map(d=>d.key) };
  }
  // Re-keys a deck (moved / renamed): its record, its master and any lesson copies that point to it.
  function rekey(oldKey, newKey, deckFiles){
    if(oldKey===newKey) return;
    for(const t of EXTS){ C.deckCache.delete(pathOf(oldKey, t)); C.deckCache.delete(pathOf(newKey, t)); }
    const R = decksRec();
    if(R[oldKey]){ R[newKey] = R[oldKey]; delete R[oldKey]; }
    const m = master(oldKey);
    if(m){
      delete C.data.lessons[m.id];
      m.id = masterId(newKey); m.lib = newKey;
      for(const t of EXTS) if(m.files[t]){ C.deckCache.delete(m.files[t].path); m.files[t].path = pathOf(newKey, t); m.files[t].name = (deckFiles && deckFiles[t] && deckFiles[t].name) || baseOf(newKey) + '.' + t; }
      C.data.lessons[m.id] = m;
    }
    for(const l of Object.values(C.data.lessons)) if(l.fromLib===oldKey) l.fromLib = newKey;
    const th = S.thumbs.get(oldKey); S.thumbs.delete(oldKey); if(th) S.thumbs.set(newKey, th);
    if(S.idx && S.idx[oldKey]){ S.idx[newKey] = S.idx[oldKey]; delete S.idx[oldKey]; saveIndexSoon(); }
    const was = 'd:' + oldKey; if(S.sel.delete(was)) S.sel.add('d:' + newKey);
  }
  // Keeps a master's file list in step with what's on disk (a PDF added in File Explorer, a deck saved again in PowerPoint).
  function syncMaster(d){
    const m = master(d.key); if(!m) return false;
    let changed = false;
    for(const t of EXTS){
      const f = d.files[t], have = m.files[t];
      if(f && (!have || have.path!==f.path || have.size!==f.size)){ if(have) C.deckCache.delete(have.path); m.files[t] = { path:f.path, name:f.name, size:f.size, added:(have && have.added) || Date.now() }; S.thumbs.delete(d.key); changed = true; }
      if(!f && have){ C.deckCache.delete(have.path); delete m.files[t]; changed = true; }
    }
    if(changed && (!m.mode || !m.files[m.mode])) m.mode = m.files.pptx ? 'pptx' : m.files.pdf ? 'pdf' : null;
    return changed;
  }
  function reconcile(tree){
    const R = decksRec(), now = Date.now();
    let changed = false;
    // Phase 1 recorded full paths ('Lesson Library/…/Name.pptx').
    for(const k of Object.keys(R)) if(/\.(pptx|pdf)$/i.test(k) || k.startsWith(LIB_DIR + '/')){ const nk = keyOfPath(k); if(!R[nk]) R[nk] = R[k]; delete R[k]; changed = true; }
    const unrecorded = new Set([...tree.decks.keys()].filter(k=>!R[k]));
    for(const k of Object.keys(R)){
      if(isBinKey(k)) continue; // in the Bin: purgeBin() looks after these
      if(tree.decks.has(k)){ if(R[k].missingSince){ delete R[k].missingSince; changed = true; } continue; }
      // Gone: look for the same deck (name and sizes) somewhere else.
      const r = R[k], size = r.size || {}, stem = baseOf(k).toLowerCase();
      const hits = [...unrecorded].filter(u=>{
        const d = tree.decks.get(u); if(d.stem.toLowerCase()!==stem) return false;
        const types = EXTS.filter(t=>size[t]!=null && d.files[t]);
        return types.length && types.every(t=>d.files[t].size===size[t]);
      });
      if(hits.length===1){ rekey(k, hits[0], tree.decks.get(hits[0]).files); unrecorded.delete(hits[0]); changed = true; continue; }
      if(!r.missingSince){ r.missingSince = now; changed = true; }
      else if(now - r.missingSince > MISSING_DAYS*864e5){ delete R[k]; delete C.data.lessons[masterId(k)]; changed = true; }
    }
    for(const d of tree.decks.values()){
      const size = {}; for(const t of EXTS) if(d.files[t]) size[t] = d.files[t].size;
      if(!R[d.key]){ R[d.key] = { title:d.stem, added:now, size }; changed = true; }
      else if(JSON.stringify(R[d.key].size || {})!==JSON.stringify(size)){ // saved again in PowerPoint, or a PDF added
        R[d.key].size = size; changed = true;
        for(const t of EXTS) C.deckCache.delete(pathOf(d.key, t));
        S.thumbs.delete(d.key);
      }
      if(syncMaster(d)) changed = true;
    }
    return changed;
  }
  // Re-reads the folders. A change made while a scan is running (S.stale) gets another scan after it.
  function scan(){
    if(S.scanning) return S.stale ? S.scanning.catch(()=>{}).then(()=>scan()) : S.scanning;
    S.stale = false;
    S.scanning = (async()=>{
      try{
        await ensureFixed();
        await loadIndex();
        let changed = await purgeBin();
        const tree = await walk();
        if(reconcile(tree)) changed = true;
        if(prune(tree)) changed = true;
        if(changed) C.saveSoon();
        S.tree = tree;
        for(const id of [...S.sel]) if(!(id[0]==='d' ? tree.decks.has(id.slice(2)) : tree.folders.has(id.slice(2)))) S.sel.delete(id);
        if(S.cwd===BIN) return tree;
        if(S.cwd!==UNSORTED && !tree.folders.has(S.cwd)) S.cwd = '';
        if(S.cwd===UNSORTED && !tree.unsorted.length) S.cwd = '';
        return tree;
      } finally { S.scanning = null; }
    })();
    return S.scanning;
  }
  async function refresh(){
    try{ await scan(); }catch(e){ console.error(e); toast("Couldn't read the Lesson Library: " + e.message, true); }
    renderPanel();
    kickIndex();
  }
  // Drops folder colours and index entries for things that are no longer there (bin keys stay while their entry does).
  function prune(tree){
    let changed = false;
    const FC = folderColors();
    for(const k of Object.keys(FC)) if(!tree.folders.has(k)){ delete FC[k]; changed = true; }
    if(S.idx){
      const binned = new Set(); for(const b of Object.values(binRec())) for(const k of b.keys || []) binned.add(k);
      let gone = false;
      for(const k of Object.keys(S.idx)) if(isBinKey(k) ? !binned.has(k) : !tree.decks.has(k)){ delete S.idx[k]; gone = true; }
      if(gone) saveIndexSoon();
    }
    return changed;
  }
  async function tree(){ return S.tree && !S.stale ? S.tree : scan(); }

  // ---------- masters ----------
  async function ensureMaster(key){
    const t = await tree(), d = t.decks.get(key);
    if(!d) throw new Error('That deck is no longer in the Library');
    let m = master(key);
    if(m){ syncMaster(d); return m; }
    m = C.ensureLesson({ id:masterId(key), date:'', slotId:'', label:'Lesson Library', start:'', end:'', period:'' });
    m.lib = key; m.files = {};
    for(const t2 of EXTS) if(d.files[t2]) m.files[t2] = { path:d.files[t2].path, name:d.files[t2].name, size:d.files[t2].size, added:Date.now() };
    m.mode = m.files.pptx ? 'pptx' : 'pdf';
    try{
      for(const t2 of EXTS) if(m.files[t2]){
        const v = await C.getDeck(m, t2);
        m.slideCount[t2] = v.base.count;
        if(t2==='pptx') C.applyAnimations(m, v);
      }
    }catch(e){ delete C.data.lessons[m.id]; throw e; }
    baseline(key); // copies made before this master existed (Create → lesson + Library) start up to date
    return m;
  }
  // The prep a lesson copy carries (as Duplicate: not pen marks, last slide or Printer Stack). types: which of pptx/pdf.
  function copyPrep(from, to, types){
    for(const t of types){ to.hides[t] = clone(from.hides[t]); to.myNotes[t] = clone(from.myNotes[t]); if(from.slideCount[t]!=null) to.slideCount[t] = from.slideCount[t];
      if(from.slides && from.slides[t]){ to.slides = to.slides || {}; to.slides[t] = clone(from.slides[t]); } else if(to.slides){ delete to.slides[t]; if(!Object.keys(to.slides).length) to.slides = undefined; } }
    to.title = from.title || ''; to.lang = from.lang;
    if(types.includes('pptx')){ if(from.ratio) to.ratio = from.ratio; else delete to.ratio; if(from.theme) to.theme = from.theme; else delete to.theme; }
    if(from.gcSet) to.gcSet = from.gcSet; else delete to.gcSet;
    if(from.print) to.print = clone(from.print); else delete to.print;
  }

  // ---------- Library → lesson ----------
  // opts.pull (v1.86): updating a copy from its master; no replace question, no redraw or toast (the caller does those).
  async function copyToLesson(key, meta, opts){
    opts = opts || {};
    const old = C.data.lessons[meta.id];
    const t = await tree(), d = t.decks.get(key);
    if(!d){ toast('That deck is no longer in the Library.', true); return false; }
    if(!opts.pull && old && old.mode && !(await confirmBox('Replace this lesson’s deck?', `${meta.label} already has “${C.lessonTitle(old)}”. Its copy, hides, notes and pen marks will be replaced.`, 'Replace', true))) return false;
    showLoading(opts.pull ? `Updating ${meta.label} from “${d.stem}”…` : `Copying ${d.stem} into ${meta.label}…`);
    try{
      const m = await ensureMaster(key);
      const l = C.ensureLesson(meta);
      for(const t2 of EXTS) if(l.files[t2]){ await store.deleteDeck(l.files[t2].path); C.deckCache.delete(l.files[t2].path); }
      l.files = {};
      const types = EXTS.filter(t2=>m.files[t2]);
      for(const t2 of types){
        const file = await store.readDeck(m.files[t2].path);
        const name = await C.uniqueName(safeName(`${meta.date} ${meta.period} ${meta.label} - ${m.files[t2].name}`));
        const p = await store.writeDeck(name, file);
        l.files[t2] = { path:p, name:m.files[t2].name, size:file.size, added:Date.now() };
      }
      l.hides = { pptx:{}, pdf:{} }; l.myNotes = { pptx:{}, pdf:{} }; l.slideCount = {}; l.slides = undefined;
      copyPrep(m, l, types);
      l.mode = m.mode && l.files[m.mode] ? m.mode : types[0]; l.lastSlide = 0;
      l.ink = { pptx:{}, pdf:{} };
      delete l.printCode; delete l.stack;
      l.fromLib = key; stampCopy(l, m);
      await saveNow();
      hideLoading();
      if(opts.pull) return true;
      if(fullOpen()) renderFull(); else C.renderDashboard();
      toast(`Copied “${d.stem}” into ${meta.label}`);
      return true;
    }catch(e){ hideLoading(); console.error(e); toast(opts.pull ? `Couldn't update ${meta.label}: ${e.message}` : `Couldn't copy ${d.stem}: ${e.message}`, true); return false; }
  }
  function dropOnSlot(key, meta){ if(canCreate()) copyToLesson(key, meta); }

  // ---------- lesson → Library ----------
  function folderList(filter){
    const out = [], t = S.tree;
    const go = p=>{ const f = t.folders.get(p); if(!f) return; for(const s of f.subs){ if(inFixed(s) && filter(s)) out.push(s); go(s); } };
    go('');
    return out;
  }
  // <option>s grouped by top folder: Year 7 › 1 - Autumn 1 › My folder.
  function folderSelect(list, sel){
    let h = '', cur = null;
    for(const p of list){
      const top = topOf(p), rest = p.split('/').slice(1).join(' › ');
      if(top!==cur){ if(cur!==null) h += '</optgroup>'; cur = top; h += `<optgroup label="${esc(top)}">`; }
      const label = rest || (top==='Other' ? 'Other (Form, assemblies, intervention)' : `${top} (top)`);
      h += `<option value="${esc(p)}" ${p===sel ? 'selected' : ''}>${esc(label)}</option>`;
    }
    return h + (cur!==null ? '</optgroup>' : '');
  }
  async function openSave(l){
    if(!canCreate()) return;
    try{ await tree(); }catch(e){ toast("Couldn't read the Lesson Library: " + e.message, true); return; }
    const linked = l.fromLib && S.tree.decks.has(l.fromLib) ? l.fromLib : null;
    const types = EXTS.filter(t=>l.files[t]);
    const list = folderList(canHoldDecks);
    const def = linked ? S.tree.decks.get(linked).folder : (list.includes(defaultFolder({ label:l.label }, dateOf(l.date))) ? defaultFolder({ label:l.label }, dateOf(l.date)) : 'Other');
    modal(`<h2>Save to the Lesson Library</h2><p><b>${esc(C.lessonTitle(l))}</b> · ${types.map(t=>t==='pptx' ? 'PowerPoint' : 'PDF').join(' + ')}, with its hides, reveals, edits and My notes. Pen marks aren't saved.</p>
      ${linked ? `<div class="cr-dest on" data-ls="upd"><label class="cr-check"><input type="radio" name="ls-how" value="upd" checked><span><b>Update the master</b><small>${esc(crumbText(linked))}. Lesson copies already made don't change.</small></span></label></div>
      <div class="cr-dest off" data-ls="new"><label class="cr-check"><input type="radio" name="ls-how" value="new"><span><b>Save as a new deck</b><small>Leaves the master as it is.</small></span></label>` : '<div data-ls="new">'}
        <div class="ls-new"><label class="cr-lbl" for="ls-name">Name</label><input type="text" id="ls-name" maxlength="120" value="${esc(C.lessonTitle(l))}">
        <label class="cr-lbl" for="ls-folder">Folder</label><select id="ls-folder" class="lb-select">${folderSelect(list, def)}</select></div>
      </div>
      <div class="cr-err" aria-live="polite"></div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Save</button></div>`, (m, close)=>{
      const err = $('.cr-err', m), inp = $('#ls-name', m), sel = $('#ls-folder', m);
      const how = ()=>{ const r = m.querySelector('input[name=ls-how]:checked'); return r ? r.value : 'new'; };
      const sync = ()=>{ const h = how(); m.querySelectorAll('[data-ls]').forEach(x=>{ if(!linked) return; x.classList.toggle('on', x.dataset.ls===h); x.classList.toggle('off', x.dataset.ls!==h); }); inp.disabled = sel.disabled = h==='upd'; };
      m.querySelectorAll('input[name=ls-how]').forEach(r=>r.onchange = sync); sync();
      let busy = false;
      const ok = async ()=>{
        if(busy) return;
        if(how()==='upd'){ busy = true; close(); await saveOver(l, linked); return; }
        const name = safeName(inp.value);
        if(!name){ err.textContent = 'Give the deck a name.'; inp.focus(); return; }
        busy = true; close(); await saveNew(l, name, sel.value);
      };
      $('[data-a=ok]', m).onclick = ok; $('[data-a=no]', m).onclick = close;
      if(inp) inp.onkeydown = e=>{ if(e.key==='Enter') ok(); };
    });
  }
  async function saveNew(l, name, folder){
    showLoading(`Saving ${name} to the Library…`);
    try{
      const dir = await dirOf(folder, true), stem = await freeStem(dir, name), key = `${folder}/${stem}`;
      const types = EXTS.filter(t=>l.files[t]), size = {};
      for(const t of types){ const f = await store.readDeck(l.files[t].path); await writeFile(dir, `${stem}.${t}`, f); size[t] = f.size; }
      decksRec()[key] = { title:stem, added:Date.now(), size };
      const m = C.ensureLesson({ id:masterId(key), date:'', slotId:'', label:'Lesson Library', start:'', end:'', period:'' });
      m.lib = key; m.files = {};
      for(const t of types) m.files[t] = { path:pathOf(key, t), name:`${stem}.${t}`, size:size[t], added:Date.now() };
      copyPrep(l, m, types);
      m.mode = l.mode && m.files[l.mode] ? l.mode : types[0];
      l.fromLib = key; stampCopy(l, m);
      await saveNow();
      hideLoading();
      S.stale = true; S.cwd = folder; await refreshIfOpen(); kickIndex();
      toast(`Saved to Lesson Library › ${crumbText(folder)}${stem!==name ? ` as “${stem}”` : ''}`);
    }catch(e){ hideLoading(); console.error(e); toast(`Couldn't save to the Library: ${e.message}`, true); }
  }
  async function saveOver(l, key){
    showLoading('Updating the master…');
    try{
      const m = await ensureMaster(key), folder = parentOf(key), stem = baseOf(key), dir = await dirOf(folder, false);
      const types = EXTS.filter(t=>l.files[t]), R = decksRec();
      R[key] = R[key] || { title:stem, added:Date.now() }; R[key].size = R[key].size || {};
      for(const t of types){
        const f = await store.readDeck(l.files[t].path);
        await writeFile(dir, `${stem}.${t}`, f);
        if(m.files[t]) C.deckCache.delete(m.files[t].path);
        m.files[t] = { path:pathOf(key, t), name:`${stem}.${t}`, size:f.size, added:Date.now() };
        R[key].size[t] = f.size;
      }
      copyPrep(l, m, types);
      m.mode = l.mode && m.files[l.mode] ? l.mode : types[0];
      stampCopy(l, m); // this lesson is the master now; other copies will show 'Master updated'
      S.thumbs.delete(key);
      if(S.idx) delete S.idx[key]; // re-read its slide text
      await saveNow();
      hideLoading();
      S.stale = true; await refreshIfOpen(); kickIndex();
      toast(`Updated “${stem}” in the Library`);
      offerPullAll(key, l.id);
    }catch(e){ hideLoading(); console.error(e); toast(`Couldn't update the master: ${e.message}`, true); }
  }
  async function refreshIfOpen(){ if((S.open && C.view && C.view.name==='dash') || fullOpen()) await refresh(); }

  // ---------- File Explorer → Library ----------
  async function importFiles(folder, fileList){
    const files = [...fileList];
    const bad = files.filter(f=>!extOf(f.name));
    const ok = files.filter(f=>extOf(f.name));
    if(!canHoldDecks(folder)){ toast(isYearRoot(folder) ? 'Open a half-term folder (or Other) first, then drop the files there.' : 'Open a folder first, then drop the files there.', true); return; }
    if(!ok.length){ toast(bad.some(f=>/\.ppt$/i.test(f.name)) ? "Old .ppt files can't be read. Open it in PowerPoint and Save As .pptx." : 'Drop .pptx or .pdf files.', true); return; }
    showLoading(`Adding ${ok.length} file${ok.length>1 ? 's' : ''} to the Library…`);
    let added = 0;
    try{
      const dir = await dirOf(folder, true), groups = new Map();
      for(const f of ok){ const st = safeName(stemOf(f.name)) || 'Deck'; if(!groups.has(st)) groups.set(st, {}); groups.get(st)[extOf(f.name)] = f; }
      for(const [st, g] of groups){
        const stem = await freeStem(dir, st), key = `${folder}/${stem}`, size = {};
        for(const t of EXTS) if(g[t]){ await writeFile(dir, `${stem}.${t}`, g[t]); size[t] = g[t].size; }
        decksRec()[key] = { title:stem, added:Date.now(), size };
        added++;
      }
      await saveNow();
      toast(`Added ${added} deck${added>1 ? 's' : ''} to ${crumbText(folder)}` + (bad.length ? ` · ${bad.length} file${bad.length>1 ? 's' : ''} skipped (not .pptx / .pdf)` : ''));
    }catch(e){ console.error(e); toast(`Couldn't add the files${added ? ` (${added} added)` : ''}: ${e.message}`, true); }
    finally{ hideLoading(); }
    S.stale = true; await refresh();
  }

  // ---------- rename / move / new folder ----------
  async function moveDeck(key, toFolder, newStem){
    const t = await tree(), d = t.decks.get(key); if(!d) throw new Error('That deck is no longer in the Library');
    const src = await dirOf(d.folder, false), dst = await dirOf(toFolder, true);
    const sameDir = d.folder===toFolder;
    let stem = newStem || d.stem;
    if(!(sameDir && stem.toLowerCase()===d.stem.toLowerCase())){
      if(newStem && sameDir){ if((await hasEntry(dst, stem + '.pptx')) || (await hasEntry(dst, stem + '.pdf'))) throw new Error(`There's already a deck called “${stem}” here`); }
      else stem = await freeStem(dst, stem);
    }
    const files = {};
    for(const x of EXTS) if(d.files[x]){ await moveEntry(src, d.files[x].name, sameDir ? src : dst, `${stem}.${x}`, 'file'); files[x] = { name:`${stem}.${x}` }; }
    const nk = `${toFolder}/${stem}`;
    rekey(key, nk, files);
    const R = decksRec(); if(R[nk]) R[nk].title = stem;
    await saveNow();
    return nk;
  }
  async function moveFolder(path, toParent, newName){
    const name = newName || baseOf(path), from = parentOf(path);
    const src = await dirOf(from, false), dst = await dirOf(toParent, true);
    let target = name;
    if(from===toParent){ if(name!==baseOf(path) && name.toLowerCase()!==baseOf(path).toLowerCase() && await hasEntry(dst, name, 'dir')) throw new Error(`There's already a folder called “${name}” here`); }
    else target = await freeFolder(dst, name);
    await moveEntry(src, baseOf(path), from===toParent ? src : dst, target, 'dir');
    const np = toParent ? `${toParent}/${target}` : target;
    for(const k of [...S.tree.decks.keys()]) if(k.startsWith(path + '/')){ const nk = np + k.slice(path.length); const d = S.tree.decks.get(k); const files = {}; for(const x of EXTS) if(d.files[x]) files[x] = { name:d.files[x].name }; rekey(k, nk, files); }
    if(S.cwd===path || S.cwd.startsWith(path + '/')) S.cwd = np + S.cwd.slice(path.length);
    recolorTree(path, np);
    if(S.sel.delete('f:' + path)) S.sel.add('f:' + np);
    await saveNow();
    return np;
  }
  async function run(label, fn){
    showLoading(label);
    try{ await fn(); }catch(e){ console.error(e); toast(e.message, true); }
    finally{ hideLoading(); S.stale = true; await refresh(); }
  }
  function askName(title, hint, value, okLabel){
    return new Promise(res=>{
      modal(`<h2>${esc(title)}</h2>${hint ? `<p>${esc(hint)}</p>` : ''}<input type="text" maxlength="120" value="${esc(value || '')}"><div class="cr-err" aria-live="polite"></div>
        <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">${esc(okLabel)}</button></div>`, (m, close)=>{
        const inp = m.querySelector('input'), err = $('.cr-err', m);
        const ok = ()=>{ const v = safeName(inp.value); if(!v){ err.textContent = 'Type a name.'; return; } close(); res(v); };
        $('[data-a=ok]', m).onclick = ok; $('[data-a=no]', m).onclick = ()=>{ close(); res(null); };
        inp.onkeydown = e=>{ if(e.key==='Enter') ok(); if(e.key==='Escape'){ close(); res(null); } };
        inp.focus(); inp.select();
      });
    });
  }
  async function newFolder(parent){
    if(!canHoldFolders(parent)) return;
    const name = await askName('New folder', `Inside ${crumbText(parent)}.`, '', 'Create'); if(!name) return;
    await run('Creating folder…', async ()=>{
      const dir = await dirOf(parent, true);
      if(await hasEntry(dir, name, 'dir')) throw new Error(`There's already a folder called “${name}” here`);
      await dir.getDirectoryHandle(name, { create:true });
      S.cwd = `${parent}/${name}`;
    });
  }
  async function renameDeck(key){
    const d = S.tree.decks.get(key); if(!d) return;
    const name = await askName('Rename deck', d.files.pptx && d.files.pdf ? 'Renames both the PowerPoint and the PDF.' : '', d.stem, 'Rename');
    if(!name || name===d.stem) return;
    await run('Renaming…', ()=>moveDeck(key, d.folder, name));
  }
  async function renameFolder(path){
    const name = await askName('Rename folder', '', baseOf(path), 'Rename');
    if(!name || name===baseOf(path)) return;
    if(isFixed(`${parentOf(path)}/${name}`.replace(/^\//, ''))){ toast(`“${name}” is one of the fixed folders. Pick another name.`, true); return; }
    await run('Renaming folder…', ()=>moveFolder(path, parentOf(path), name));
  }
  // ---------- items (selection, clipboard): 'd:<key>' for a deck, 'f:<path>' for an own folder ----------
  const idKind = id=>id[0]==='d' ? 'deck' : 'folder';
  const idWhat = id=>id.slice(2);
  const idName = id=>baseOf(idWhat(id));
  function itemsLabel(items){ return items.length===1 ? `“${idName(items[0])}”` : `${items.length} items`; }
  function itemExists(id){ const t = S.tree; return !!t && (idKind(id)==='deck' ? t.decks.has(idWhat(id)) : t.folders.has(idWhat(id)) && !isFixed(idWhat(id))); }
  // Can this item go into folder `to`? copy: a copy may land in the folder it's already in.
  function fitsIn(id, to, copy){
    const w = idWhat(id);
    if(idKind(id)==='deck'){ const d = S.tree.decks.get(w); return !!d && canHoldDecks(to) && (copy || d.folder!==to); }
    return canHoldFolders(to) && !isFixed(w) && to!==w && !to.startsWith(w + '/') && (copy || parentOf(w)!==to);
  }
  // Somewhere for every item to go, and nothing going inside itself.
  function canTake(items, to, copy){
    if(to==null || !items.length) return false;
    if(items.some(id=>idKind(id)==='folder' && (to===idWhat(id) || to.startsWith(idWhat(id) + '/')))) return false;
    return items.some(id=>fitsIn(id, to, copy)) && items.every(id=>idKind(id)==='deck' ? canHoldDecks(to) : canHoldFolders(to));
  }

  function openMoveTo(items){
    items = items.filter(itemExists); if(!items.length) return;
    const decks = items.some(id=>idKind(id)==='deck');
    const list = folderList(p=>(decks ? canHoldDecks(p) : canHoldFolders(p)) && canTake(items, p, false));
    if(!list.length){ toast('There’s nowhere else for that to go.', true); return; }
    const first = items[0], cur = idKind(first)==='deck' ? (S.tree.decks.get(idWhat(first)) || {}).folder : parentOf(idWhat(first));
    const single = items.length===1;
    modal(`<h2>Move to…</h2><p><b>${esc(single ? idName(first) : items.length + ' items')}</b>${single && idKind(first)==='folder' ? ' and everything in it' : ''}.</p>
      <select class="lb-select">${folderSelect(list, list.includes(cur) ? cur : list[0])}</select>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Move</button></div>`, (m, close)=>{
      $('[data-a=no]', m).onclick = close;
      $('[data-a=ok]', m).onclick = ()=>{ const to = m.querySelector('select').value; close(); moveMany(items, to); };
    });
  }
  function moveMany(items, to){
    items = items.filter(id=>itemExists(id) && fitsIn(id, to, false));
    if(!items.length) return;
    return run(items.length>1 ? `Moving ${items.length} items…` : 'Moving…', async ()=>{
      let n = 0;
      for(const id of items){
        if(idKind(id)==='deck') await moveDeck(idWhat(id), to);
        else await moveFolder(idWhat(id), to);
        n++;
      }
      toast(`Moved ${n>1 ? n + ' items ' : ''}to ${crumbText(to)}`);
    });
  }

  // ---------- copy ----------
  // A new master for a copy, with the source's prep (only if the source has one: otherwise ensureMaster() makes it later).
  function cloneMaster(fromKey, toKey, files){
    const m = master(fromKey); if(!m) return;
    const nm = C.ensureLesson({ id:masterId(toKey), date:'', slotId:'', label:'Lesson Library', start:'', end:'', period:'' });
    nm.lib = toKey; nm.files = {};
    const types = EXTS.filter(t=>m.files[t] && files[t]);
    for(const t of types) nm.files[t] = { path:pathOf(toKey, t), name:files[t].name, size:files[t].size, added:Date.now() };
    copyPrep(m, nm, types);
    nm.mode = m.mode && nm.files[m.mode] ? m.mode : types[0];
  }
  function cloneRecord(fromKey, toKey, files){
    const R = decksRec(), src = R[fromKey] || {}, size = {};
    for(const t of EXTS) if(files[t]) size[t] = files[t].size;
    R[toKey] = { title:baseOf(toKey), added:Date.now(), size };
    if(src.color) R[toKey].color = src.color;
    if(S.idx && S.idx[fromKey]){ S.idx[toKey] = clone(S.idx[fromKey]); saveIndexSoon(); }
    cloneMaster(fromKey, toKey, files);
  }
  async function copyDeck(key, toFolder){
    const d = S.tree.decks.get(key); if(!d) throw new Error(`“${baseOf(key)}” is no longer in the Library`);
    const src = await dirOf(d.folder, false), dst = await dirOf(toFolder, true);
    const stem = await freeStem(dst, d.stem), files = {};
    for(const t of EXTS) if(d.files[t]){
      const f = await (await src.getFileHandle(d.files[t].name)).getFile();
      await writeFile(dst, `${stem}.${t}`, f);
      files[t] = { name:`${stem}.${t}`, size:f.size };
    }
    const nk = `${toFolder}/${stem}`;
    cloneRecord(key, nk, files);
    return nk;
  }
  async function copyDir(src, dst){
    for await (const [n, h] of src.entries()){
      if(h.kind==='directory'){ if(n.startsWith('.')) continue; await copyDir(h, await dst.getDirectoryHandle(n, { create:true })); }
      else if(!n.startsWith('~$')) await writeFile(dst, n, await h.getFile());
    }
  }
  async function copyFolder(path, toParent){
    const src = await dirOf(path, false), dst = await dirOf(toParent, true);
    const name = await freeFolder(dst, baseOf(path));
    await copyDir(src, await dst.getDirectoryHandle(name, { create:true }));
    const np = `${toParent}/${name}`;
    for(const [k, d] of S.tree.decks) if(k.startsWith(path + '/')){
      const files = {}; for(const t of EXTS) if(d.files[t]) files[t] = { name:d.files[t].name, size:d.files[t].size };
      cloneRecord(k, np + k.slice(path.length), files);
    }
    const FC = folderColors();
    for(const k of Object.keys(FC)) if(k===path || k.startsWith(path + '/')) FC[np + k.slice(path.length)] = FC[k];
    return np;
  }
  function copyMany(items, to){
    items = items.filter(id=>itemExists(id) && fitsIn(id, to, true));
    if(!items.length) return;
    return run(items.length>1 ? `Copying ${items.length} items…` : 'Copying…', async ()=>{
      const made = [];
      for(const id of items) made.push(idKind(id)==='deck' ? 'd:' + await copyDeck(idWhat(id), to) : 'f:' + await copyFolder(idWhat(id), to));
      await saveNow();
      if(to===S.cwd && !S.q){ S.sel = new Set(made); S.anchor = made[made.length - 1]; }
      toast(`Copied ${made.length>1 ? made.length + ' items' : itemsLabel(items)} to ${crumbText(to)}`);
      kickIndex();
    });
  }

  // ---------- clipboard ----------
  function setClip(items, cut){
    items = items.filter(itemExists); if(!items.length) return;
    S.clip = { cut:!!cut, items };
    toast(`${cut ? 'Cut' : 'Copied'} ${itemsLabel(items)}. Open a folder and Paste (Ctrl+V).`);
    renderPanel();
  }
  function canPaste(to){ return !!S.clip && to!==UNSORTED && to!==BIN && canTake(S.clip.items.filter(itemExists), to, !S.clip.cut); }
  async function paste(to){
    if(!canPaste(to)) return;
    const { cut, items } = S.clip;
    if(cut){ S.clip = null; await moveMany(items, to); }
    else await copyMany(items, to);
  }

  // ---------- Bin ----------
  async function binRoot(){ return (await libRoot()).getDirectoryHandle(BIN_DIR, { create:true }); }
  const binId = ()=>'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Into the Bin: the files move to .Bin/<id>/, and everything keyed by the deck follows them (rekey).
  async function binDeck(key){
    const d = S.tree.decks.get(key); if(!d) throw new Error(`“${baseOf(key)}” is no longer in the Library`);
    const id = binId(), src = await dirOf(d.folder, false), bdir = await (await binRoot()).getDirectoryHandle(id, { create:true });
    const files = {};
    for(const t of EXTS) if(d.files[t]){ await moveEntry(src, d.files[t].name, bdir, `${d.stem}.${t}`, 'file'); files[t] = { name:`${d.stem}.${t}` }; }
    const bk = `${BIN_DIR}/${id}/${d.stem}`;
    rekey(key, bk, files);
    binRec()[id] = { kind:'deck', name:d.stem, from:d.folder, at:Date.now(), keys:[bk] };
    S.sel.delete('d:' + bk);
    return id;
  }
  async function binFolder(path){
    if(isFixed(path) || !inFixed(path)) throw new Error('The fixed folders can’t be deleted');
    const id = binId(), name = baseOf(path), bdir = await (await binRoot()).getDirectoryHandle(id, { create:true });
    await moveEntry(await dirOf(parentOf(path), false), name, bdir, name, 'dir');
    const keys = [];
    for(const [k, d] of [...S.tree.decks]) if(k.startsWith(path + '/')){
      const bk = `${BIN_DIR}/${id}/${name}` + k.slice(path.length), files = {};
      for(const t of EXTS) if(d.files[t]) files[t] = { name:d.files[t].name };
      rekey(k, bk, files); keys.push(bk);
    }
    const FC = folderColors(), colors = {};
    for(const k of Object.keys(FC)) if(k===path || k.startsWith(path + '/')){ colors[k.slice(path.length)] = FC[k]; delete FC[k]; }
    binRec()[id] = { kind:'folder', name, from:parentOf(path), at:Date.now(), keys, ...(Object.keys(colors).length ? { colors } : {}) };
    if(S.cwd===path || S.cwd.startsWith(path + '/')) S.cwd = parentOf(path);
    S.sel.delete('f:' + path);
    return id;
  }
  // Back where it came from (the folder is made again if it's gone); " (2)" if the name's been taken since.
  async function restoreOne(id){
    const b = binRec()[id]; if(!b) return null;
    const bdir = await (await binRoot()).getDirectoryHandle(id);
    const dst = await dirOf(b.from, true);
    if(b.kind==='deck'){
      const stem = await freeStem(dst, b.name), files = {};
      for(const t of EXTS) if(await hasEntry(bdir, `${b.name}.${t}`)){ await moveEntry(bdir, `${b.name}.${t}`, dst, `${stem}.${t}`, 'file'); files[t] = { name:`${stem}.${t}` }; }
      const nk = b.from ? `${b.from}/${stem}` : stem;
      for(const k of b.keys) rekey(k, nk, files);
      const R = decksRec(); if(R[nk]) R[nk].title = stem;
    } else {
      const target = await freeFolder(dst, b.name);
      await moveEntry(bdir, b.name, dst, target, 'dir');
      const np = `${b.from}/${target}`, base = `${BIN_DIR}/${id}/${b.name}`;
      for(const k of b.keys){ const m = master(k), files = {}; if(m) for(const t of EXTS) if(m.files[t]) files[t] = { name:m.files[t].name }; rekey(k, np + k.slice(base.length), files); }
      if(b.colors){ const FC = folderColors(); for(const [rel, c] of Object.entries(b.colors)) FC[np + rel] = c; }
    }
    delete binRec()[id];
    try{ await (await binRoot()).removeEntry(id, { recursive:true }); }catch(e){}
    return b;
  }
  // Records, masters and index entries of a bin item go; lesson copies made from it keep their files but lose the link.
  function forgetBinned(b){
    const R = decksRec();
    for(const k of b.keys || []){
      delete R[k];
      const m = master(k);
      if(m){ for(const t of EXTS) if(m.files[t]) C.deckCache.delete(m.files[t].path); delete C.data.lessons[m.id]; }
      if(S.idx && S.idx[k]){ delete S.idx[k]; saveIndexSoon(); }
      for(const l of Object.values(C.data.lessons)) if(l.fromLib===k) delete l.fromLib;
    }
  }
  async function deleteForever(id){
    const b = binRec()[id]; if(!b) return;
    try{ await (await binRoot()).removeEntry(id, { recursive:true }); }catch(e){ if(e && e.name!=='NotFoundError') throw e; }
    forgetBinned(b);
    delete binRec()[id];
  }
  // In scan(): items over 30 days old go for good; items whose folder was deleted in File Explorer are forgotten.
  async function purgeBin(){
    const B = binRec(), ids = Object.keys(B); if(!ids.length) return false;
    let root; try{ root = await (await libRoot()).getDirectoryHandle(BIN_DIR); }catch(e){ root = null; }
    const now = Date.now();
    for(const id of ids){
      if(!root || !(await hasEntry(root, id, 'dir'))){ forgetBinned(B[id]); delete B[id]; continue; }
      if(now - B[id].at > BIN_DAYS*864e5){ try{ await deleteForever(id); }catch(e){ console.warn('purgeBin', e); } }
    }
    return true;
  }
  async function deleteMany(items){
    items = items.filter(itemExists); if(!items.length) return;
    const ids = [];
    await run(items.length>1 ? `Moving ${items.length} items to the Bin…` : 'Moving to the Bin…', async ()=>{
      try{ for(const id of items) ids.push(idKind(id)==='deck' ? await binDeck(idWhat(id)) : await binFolder(idWhat(id))); }
      finally{ if(ids.length) await saveNow(); }
      if(S.clip){ S.clip.items = S.clip.items.filter(id=>!items.includes(id)); if(!S.clip.items.length) S.clip = null; }
    });
    if(ids.length) undoToast(`${ids.length>1 ? ids.length + ' items' : itemsLabel(items)} moved to the Bin`, ()=>restoreMany(ids));
  }
  function restoreMany(ids){
    return run('Restoring…', async ()=>{
      const back = [];
      try{ for(const id of ids){ const b = await restoreOne(id); if(b) back.push(b); } }
      finally{ await saveNow(); }
      if(back.length) toast(back.length>1 ? `Restored ${back.length} items` : `Restored “${back[0].name}” to ${crumbText(back[0].from) || 'Lesson Library'}`);
    });
  }
  async function emptyBin(){
    const ids = Object.keys(binRec()); if(!ids.length) return;
    if(!(await confirmBox('Empty the Bin?', `${ids.length} item${ids.length>1 ? 's' : ''} will be deleted for good. Lesson copies made from them are kept.`, 'Empty bin', true))) return;
    await run('Emptying the Bin…', async ()=>{ try{ for(const id of ids) await deleteForever(id); } finally{ await saveNow(); } });
  }
  async function deleteForeverAsk(id){
    const b = binRec()[id]; if(!b) return;
    if(!(await confirmBox('Delete for good?', `“${b.name}”${b.kind==='folder' ? ' and everything in it' : ''} will be deleted. This can’t be undone.`, 'Delete', true))) return;
    await run('Deleting…', async ()=>{ await deleteForever(id); await saveNow(); });
  }
  // A toast with Undo (app.js's toast() has no buttons). A later toast() replaces it.
  function undoToast(msg, undo){
    const old = $('.toast'); if(old) old.remove();
    const t = document.createElement('div'); t.className = 'toast lb-undo';
    t.innerHTML = `<span>${esc(msg)}</span><button type="button">Undo</button>`;
    let done = false;
    t.querySelector('button').onclick = ()=>{ if(done) return; done = true; t.remove(); undo(); };
    document.body.appendChild(t);
    setTimeout(()=>{ done = true; t.remove(); }, 8000);
  }

  // ---------- colours ----------
  function colorOf(id){ return idKind(id)==='deck' ? ((decksRec()[idWhat(id)] || {}).color || '') : (folderColors()[idWhat(id)] || ''); }
  function setColor(items, c){
    const R = decksRec(), FC = folderColors();
    for(const id of items){
      const w = idWhat(id);
      if(idKind(id)==='deck'){ if(!R[w]) continue; if(c) R[w].color = c; else delete R[w].color; }
      else if(c) FC[w] = c; else delete FC[w];
    }
    C.saveSoon(); renderPanel();
  }
  // Swatches + custom + clear, as a menu (closed like one). items may include fixed folders ('f:Year 7').
  function openColours(anchor, items){
    C.closeMenus();
    const cur = items.length===1 ? colorOf(items[0]) : '';
    const m = document.createElement('div'); m.className = 'menu lb-colours';
    m.innerHTML = `<div class="lb-sw">${PALETTE.map(([n, c])=>`<button type="button" class="lb-swatch${cur.toLowerCase()===c.toLowerCase() ? ' on' : ''}" data-c="${c}" title="${n}" style="--lb-c:${c}"></button>`).join('')}</div>
      <label class="lb-custom"><input type="color" value="${esc(cur || '#2F5BEA')}"><span>Custom…</span></label>
      <button type="button" class="lb-clear" data-c="">Clear colour</button>`;
    m.addEventListener('click', e=>{ const b = e.target.closest('[data-c]'); if(!b) return; e.stopPropagation(); C.closeMenus(); setColor(items, b.dataset.c); });
    m.querySelector('input').addEventListener('change', e=>{ C.closeMenus(); setColor(items, e.target.value); });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
    m.style.top = (r.bottom + 4 + mh > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
  }

  // ---------- search index (Lesson Library/.search-index.json) ----------
  async function loadIndex(){
    if(S.idx) return;
    try{ const fh = await (await libRoot()).getFileHandle(INDEX_FILE); const j = JSON.parse(await (await fh.getFile()).text()); S.idx = j && j.decks && typeof j.decks==='object' ? j.decks : {}; }
    catch(e){ S.idx = {}; }
  }
  function saveIndexSoon(){
    if(!S.idx || !canCreate()) return;
    clearTimeout(S.idxTimer);
    S.idxTimer = setTimeout(async ()=>{
      try{ await writeFile(await libRoot(), INDEX_FILE, new Blob([JSON.stringify({ v:1, decks:S.idx })], { type:'application/json' })); }
      catch(e){ console.warn('Library search index not saved', e); }
    }, 1500);
  }
  const sizesOf = d=>{ const s = {}; for(const t of EXTS) if(d.files[t]) s[t] = d.files[t].size; return s; };
  function needsIndex(d){ const e = S.idx && S.idx[d.key]; return !e || JSON.stringify(e.s || {})!==JSON.stringify(sizesOf(d)); }
  const unxml = s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, c)=>{ c = c.toLowerCase(); return c==='amp' ? '&' : c==='lt' ? '<' : c==='gt' ? '>' : c==='quot' ? '"' : c==='apos' ? "'" : String.fromCodePoint(c[1]==='x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)); });
  const MAX_TEXT = 30000;
  // Slide text of a .pptx (every <a:t>, slide by slide), else the text layer of a PDF.
  async function deckText(d){
    if(d.files.pptx){
      const zip = await JSZip.loadAsync(await (await store.readDeck(d.files.pptx.path)).arrayBuffer());
      const names = Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b)=>parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
      const out = [];
      for(const n of names){
        const xml = await zip.file(n).async('string');
        for(const p of xml.split(/<\/a:p>/)){ const parts = []; p.replace(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g, (m, t)=>{ parts.push(unxml(t)); return m; }); if(parts.length) out.push(parts.join('')); }
        if(out.join(' ').length > MAX_TEXT) break;
      }
      return out.join(' · ').replace(/\s+/g, ' ').slice(0, MAX_TEXT);
    }
    if(d.files.pdf && window.pdfjsLib){
      const doc = await pdfjsLib.getDocument({ data:new Uint8Array(await (await store.readDeck(d.files.pdf.path)).arrayBuffer()), isEvalSupported:false }).promise;
      let s = '';
      try{ for(let i = 1; i <= Math.min(doc.numPages, 80) && s.length < MAX_TEXT; i++){ const tc = await (await doc.getPage(i)).getTextContent(); s += tc.items.map(x=>x.str).join(' ') + ' · '; } }
      finally{ try{ doc.destroy(); }catch(e){} }
      return s.replace(/\s+/g, ' ').slice(0, MAX_TEXT);
    }
    return '';
  }
  // Indexes decks with no entry (or whose files have changed size), one at a time. Pauses while presenting.
  function kickIndex(){
    if(!canCreate()) return;
    if(S.indexing){ S.idxAgain = true; return; } // runs again when this pass ends
    S.idxAgain = false;
    S.indexing = (async()=>{
      try{
        await loadIndex(); const t = await tree();
        const queue = [...t.decks.values()].filter(needsIndex);
        S.idxDone = 0; S.idxTotal = queue.length;
        for(const d of queue){
          if(C.view && C.view.name==='present') break;
          if(!S.tree || !S.tree.decks.has(d.key)) continue; // moved or gone since
          let text = '';
          try{ text = await deckText(d); }catch(e){ console.warn('Library index: couldn’t read', d.key, e); }
          if(S.idx && S.tree.decks.has(d.key)){ S.idx[d.key] = { s:sizesOf(S.tree.decks.get(d.key)), t:text }; saveIndexSoon(); }
          S.idxDone++; showIndexing();
          await new Promise(r=>setTimeout(r, 40));
        }
      }catch(e){ console.warn('Library index', e); }
      finally{ S.indexing = null; S.idxTotal = 0; showIndexing(); if(S.q) renderPanel(); if(S.idxAgain) setTimeout(kickIndex, 0); }
    })();
  }
  function showIndexing(){
    const h = $('.lb-panel [data-lb-hint]'); if(!h) return;
    if(S.indexing && S.idxTotal) h.textContent = `Indexing slide text ${S.idxDone}/${S.idxTotal}…`;
    else h.textContent = h.dataset.lbHint || '';
  }

  // ---------- search ----------
  const fold = s=>String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const folded = new WeakMap(); // index entry -> folded text
  function search(q){
    const terms = fold(q).split(/\s+/).filter(Boolean), t = S.tree;
    if(!terms.length || !t) return { folders:[], decks:[] };
    const all = h=>terms.every(x=>h.includes(x));
    const folders = [...t.folders.keys()].filter(p=>p && inFixed(p) && all(fold(crumbText(p)))).slice(0, 50);
    const decks = [];
    for(const d of t.decks.values()){
      const name = fold(d.stem), path = fold(crumbText(d.folder));
      const e = S.idx && S.idx[d.key];
      let txt = ''; if(e && e.t){ txt = folded.get(e); if(txt==null){ txt = fold(e.t); folded.set(e, txt); } }
      if(!all(name + ' ' + path + ' ' + txt)) continue;
      const rank = all(name) ? 0 : all(name + ' ' + path) ? 1 : 2;
      let snip = '';
      if(rank===2){ const x = terms.find(z=>!name.includes(z) && !path.includes(z)) || terms[0]; const i = txt.indexOf(x); if(i>=0){ const a = Math.max(0, i - 30); snip = (a ? '…' : '') + e.t.slice(a, i + x.length + 40) + '…'; } }
      decks.push({ key:d.key, rank, snip });
    }
    decks.sort((a, b)=>a.rank - b.rank || baseOf(a.key).localeCompare(baseOf(b.key), undefined, { numeric:true, sensitivity:'base' }));
    return { folders, decks:decks.slice(0, 200), more:decks.length > 200 };
  }

  // ---------- editing a master ----------
  async function openMaster(key){
    showLoading('Opening the master…');
    try{ await ensureMaster(key); await saveNow(); }
    catch(e){ hideLoading(); toast(`Couldn't open it: ${e.message}`, true); return; }
    hideLoading();
    S.thumbs.delete(key);
    S.returnFull = fullOpen(); if(S.returnFull) S.full = false;
    if(S.based!==C.data){ S.based = C.data; baseline(); }
    S.editSig = { key, sig:prepSig(master(key)) }; // v1.86: to offer updating lesson copies on Done
    C.openEditor(masterId(key));
  }
  function backFromEditor(l){
    const es = S.editSig; S.editSig = null;
    if(l && l.lib){ S.thumbs.delete(l.lib); const f = parentOf(l.lib); if(S.tree && S.tree.folders.has(f)) S.cwd = f; }
    if(S.returnFull){ S.returnFull = false; S.pv = l && l.lib ? l.lib : S.pv; openFull(); }
    else { S.open = true; lsSet('sv_lib_open', '1'); C.renderDashboard(); }
    if(l && l.lib && es && es.key===l.lib && prepSig(l)!==es.sig) offerPullAll(l.lib);
  }

  // ---------- v1.85: the full Library page (the header's Library button) ----------
  // The same panel as the dashboard's side panel (.lb-panel, so search, selection, drag, menus and keys all work),
  // drawn as a page: a folder tree on the left (folders there take drops), the decks as a grid, and a preview.
  function fullOpen(){ return S.full && !!C.view && C.view.name==='library'; }
  function openFull(){
    if(!canCreate()){ toast('The Library needs the OneDrive folder connected. Go Home and reconnect.', true); return; }
    S.full = true; S.sel.clear(); S.anchor = null; S.drag = null; document.body.classList.remove('lb-dragging');
    C.view = { name:'library' };
    document.body.classList.remove('presenting');
    renderFull();
    window.scrollTo({ top:0 });
    if(!S.tree || S.stale) refresh(); else kickIndex();
  }
  function closeFull(quiet){
    S.full = false; S.drag = null; if(S.io) S.io.disconnect();
    if(!quiet) C.renderDashboard();
  }
  function renderFull(){
    if(!fullOpen()) return;
    const app = $('#app');
    app.innerHTML = `${C.appHeader('library')}<div class="lb-panel lb-full lbf"></div>`;
    const p = app.querySelector('.lbf');
    skeleton(p); wirePanel(p);
    C.updatePill();
    if(S.tree) renderPanel(); else p.querySelector('.lb-body').innerHTML = '<p class="lb-empty">Checking the Library…</p>';
  }
  function pickFiles(){
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pptx,.pdf';
    inp.onchange = ()=>{ const f = [...inp.files]; if(f.length) importFiles(S.cwd, f); };
    inp.click();
  }
  const termName = n=>String(n).replace(/^\d+\s*-\s*/, '');
  function renderTree(p){
    const box = p.querySelector('.lbf-tree'); if(!box || !S.tree) return;
    const t = S.tree, cwd = S.q ? null : S.cwd;
    if(cwd && cwd!==UNSORTED && cwd!==BIN) S.treeOpen.add(cwd.split('/')[0]);
    const kids = path=>{ const f = t.folders.get(path); return f ? f.subs.filter(inFixed) : []; };
    const node = (path, depth)=>{
      const f = t.folders.get(path); if(!f) return '';
      const subs = kids(path), c = folderColors()[path] || '';
      const open = depth===0 ? S.treeOpen.has(path) : (cwd===path || (cwd || '').startsWith(path + '/'));
      const caret = depth===0 && subs.length ? `<button class="lbf-car${open ? ' open' : ''}" data-lb="tree-toggle" data-path="${esc(path)}" title="${open ? 'Close' : 'Open'}" aria-expanded="${open}">${svg('chev')}</button>` : '<span class="lbf-car-sp"></span>';
      const label = depth===1 && isFixed(path) ? termName(f.name) : f.name;
      let h = `<div class="lbf-node d${Math.min(depth, 3)}${path===cwd ? ' on' : ''}${c ? ' has-c' : ''}"${colorStyle(c)} data-lb-open="${esc(path)}" data-lb-fold="${esc(path)}" title="${esc(crumbText(path))}">${caret}${svg('folder')}<span class="lb-fname">${esc(label)}</span>${f.count ? `<span class="lb-count">${f.count}</span>` : ''}</div>`;
      if(open) h += subs.map(s2=>node(s2, depth + 1)).join('');
      return h;
    };
    let h = `<div class="lbf-node d0${cwd==='' ? ' on' : ''}" data-lb-open="" data-lb-fold=""><span class="lbf-car-sp"></span>${svg('book')}<span class="lb-fname">Lesson Library</span></div>`;
    h += TOP_FIXED.map(f=>node(f, 0)).join('');
    h += '<hr>';
    if(t.unsorted.length) h += `<div class="lbf-node d0${cwd===UNSORTED ? ' on' : ''}" data-lb-open="${UNSORTED}"><span class="lbf-car-sp"></span>${svg('inbox')}<span class="lb-fname">Unsorted</span><span class="lb-count warn">${t.unsorted.length}</span></div>`;
    const nb = Object.keys(binRec()).length;
    h += `<div class="lbf-node d0${cwd===BIN ? ' on' : ''}" data-lb-open="${BIN}"><span class="lbf-car-sp"></span>${svg('bin')}<span class="lb-fname">Bin</span>${nb ? `<span class="lb-count">${nb}</span>` : ''}</div>`;
    if(cwd!==UNSORTED && cwd!==BIN && cwd!=null && canHoldFolders(cwd)) h += `<div class="lbf-tree-f"><button class="btn sm" data-lb="new-folder">${svg('folderPlus')}New folder</button></div>`;
    box.innerHTML = h;
  }
  // Which deck the preview shows: the one last clicked, else a selected deck.
  function pvKey(){
    if(!S.tree) return null;
    if(S.pv && S.tree.decks.has(S.pv)) return S.pv;
    const id = [...S.sel].find(x=>idKind(x)==='deck');
    return id && S.tree.decks.has(idWhat(id)) ? idWhat(id) : null;
  }
  const whenOf = l=>{ const d = C.fromIso(l.date); return `${DAY_NAMES[d.getDay()].slice(0,3)} ${d.getDate()} ${MON_NAMES[d.getMonth()]}${l.period ? ' · ' + l.period : ''}`; };
  function scheduledHTML(key){
    const t = iso(today());
    const ls = Object.values(C.data.lessons).filter(l=>l.fromLib===key && l.date && l.date>=t)
      .sort((a, b)=>(a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    if(!ls.length) return '<p class="lbf-none">Not in any lesson from today on. Use Put in a lesson, or drag it onto a lesson from the dashboard.</p>';
    return ls.slice(0, 8).map(l=>`<div class="lbf-sl">${C.pillHTML(l.label || 'Lesson')}<span>${esc(whenOf(l))}</span></div>`).join('')
      + (ls.length > 8 ? `<p class="lbf-none">and ${ls.length - 8} more</p>` : '');
  }
  async function renderPv(p){
    const box = p.querySelector('.lbf-pv'); if(!box) return;
    const key = pvKey();
    if(!key){ box.innerHTML = `<div class="lbf-pv-empty">${svg('deck')}<p>Click a deck to preview it.</p><p>Double-click to edit its master.</p></div>`; return; }
    const d = S.tree.decks.get(key), m = master(key), l = m || pseudo(d);
    const hc = m ? C.hideCount(m, m.mode) : 0, sc = (m && m.slideCount && m.slideCount[m.mode]) || 0;
    const meta = [d.folder ? crumbText(d.folder).replace(/› \d+\s*-\s*/g, '› ') : 'Lesson Library', sc ? `${sc} slide${sc>1 ? 's' : ''}` : '', hc ? `${hc} reveal${hc>1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    box.innerHTML = `<div class="lbf-pv-h"><b>${esc(d.stem)}</b><span>${esc(meta)}</span></div>
      <div class="lbf-stage"></div><div class="dpv-strip lbf-strip"></div>
      <div class="lbf-nav"><button class="icon-btn" data-lb="pv-prev" aria-label="Previous slide" disabled>${icon('left')}</button><span class="lbf-n">…</span><button class="icon-btn" data-lb="pv-next" aria-label="Next slide" disabled>${icon('right')}</button>
        <span class="grow"></span><button class="btn" data-lb="edit" data-key="${esc(key)}" title="Edit the master">${icon('edit')}Edit</button><button class="btn primary" data-lb="put-in" data-key="${esc(key)}">${icon('plus')}Put in a lesson</button></div>
      <div class="lbf-sched"><h3>On the timetable</h3>${scheduledHTML(key)}</div>`;
    const tok = ++S.pvTok, stage = box.querySelector('.lbf-stage');
    try{
      const v = await C.getDeck(l, l.mode);
      if(tok!==S.pvTok || !stage.isConnected) return;
      const order = C.presentOrder(v);
      if(!order.length){ stage.innerHTML = '<div class="dpv-err">No slides.</div>'; return; }
      S.pvPos = Math.max(0, Math.min(S.pvPos, order.length - 1));
      const k = order[S.pvPos], sz = v.size(k), w = Math.max(160, Math.floor(stage.clientWidth));
      stage.style.height = Math.round(w * sz.h / sz.w) + 'px'; stage.innerHTML = '';
      C.mountThumb(stage, v, k, w, l, l.mode);
      box.querySelector('.lbf-n').textContent = `${S.pvPos + 1} / ${order.length}`;
      box.querySelector('[data-lb=pv-prev]').disabled = S.pvPos<=0;
      box.querySelector('[data-lb=pv-next]').disabled = S.pvPos>=order.length - 1;
      const strip = box.querySelector('.lbf-strip'), N = Math.min(6, order.length);
      if(N<2){ strip.hidden = true; return; }
      const start = Math.max(0, Math.min(S.pvPos - 2, order.length - N)), tw = Math.max(40, Math.floor((strip.clientWidth - 40) / 6));
      if(S.pvThumbs.size > 120) S.pvThumbs.clear();
      for(let i = start; i < start + N; i++){
        const b = document.createElement('button'); b.className = 'dpv-th' + (i===S.pvPos ? ' on' : ''); b.dataset.lb = 'pv-go'; b.dataset.p = i; b.title = `Slide ${i + 1}`; b.style.width = tw + 'px';
        const ck = `${key}|${order[i]}|${tw}|${hc}`;
        let t = S.pvThumbs.get(ck);
        if(!t){ t = C.thumbEl(v, order[i], tw, l, l.mode); S.pvThumbs.set(ck, t); b.appendChild(t); if(window.PPTX && PPTX.fitText) PPTX.fitText(t); }
        else b.appendChild(t);
        strip.appendChild(b);
      }
    }catch(e){ if(tok===S.pvTok && stage.isConnected) stage.innerHTML = `<div class="dpv-err">Couldn't open this deck: ${esc(e.message)}</div>`; }
  }

  // ---------- drawing (panel and Choose dialog) ----------
  function rowState(id){ return (S.sel.has(id) ? ' sel' : '') + (S.clip && S.clip.cut && S.clip.items.includes(id) ? ' lb-cut' : ''); }
  const colorStyle = c=>c ? ` style="--lb-c:${esc(c)}"` : '';
  // opt.path: show the folder it's in (search results); opt.snip: matching slide text.
  function deckRowHTML(key, pick, opt){
    opt = opt || {};
    const d = S.tree.decks.get(key), m = master(key), id = 'd:' + key, c = (decksRec()[key] || {}).color || '';
    const hc = m ? C.hideCount(m, m.mode) : 0, sc = (m && m.slideCount && m.slideCount[m.mode]) || 0;
    // v1.85: slides and reveals, as the editor calls them
    const tags = EXTS.filter(t=>d.files[t]).map(t=>`<span class="tag">${t==='pptx' ? 'PPT' : 'PDF'}</span>`).join('') + (sc ? `<span class="tag">${sc} slide${sc>1 ? 's' : ''}</span>` : '') + (hc ? `<span class="tag accent">${hc} reveal${hc>1 ? 's' : ''}</span>` : '');
    const where = d.unsorted ? `<span class="lb-where">${esc(d.folder ? crumbText(d.folder) : 'Lesson Library')}</span>` : opt.path ? `<span class="lb-path">${esc(crumbText(d.folder))}</span>` : '';
    const snip = opt.snip ? `<span class="lb-snip">${esc(opt.snip)}</span>` : '';
    return `<div class="lb-deck${pick ? '' : rowState(id)}${c ? ' has-c' : ''}"${colorStyle(c)} data-lb-deck="${esc(key)}" ${pick ? '' : `data-lb-item="${esc(id)}" draggable="true"`} title="${pick ? 'Copy into the lesson' : 'Drag onto a lesson to copy it there. Ctrl-drag onto a folder to copy.'}">
      <div class="lb-thumb" data-lb-thumb="${esc(key)}"></div>
      <div class="lb-dmeta"><span class="lb-dname">${esc(d.stem)}</span><span class="lb-tags">${tags}</span>${where}${snip}</div>
      ${pick ? '' : `<button class="icon-btn" data-lb="deck-more" data-key="${esc(key)}" title="More (Edit the master, Put in a lesson…)">${icon('more')}</button>`}
    </div>`;
  }
  function folderRowHTML(p, pick, opt){
    opt = opt || {};
    const f = S.tree.folders.get(p), own = !isFixed(p) && inFixed(p), id = 'f:' + p, c = folderColors()[p] || '';
    const label = opt.path ? crumbText(p) : f.name;
    return `<div class="lb-folder${own ? ' own' : ''}${own && !pick ? rowState(id) : ''}${c ? ' has-c' : ''}"${colorStyle(c)} data-lb-open="${esc(p)}" data-lb-fold="${esc(p)}" ${own && !pick ? `data-lb-item="${esc(id)}" draggable="true"` : ''}>
      ${svg('folder')}<span class="lb-fname">${esc(label)}</span>${f.count ? `<span class="lb-count">${f.count}</span>` : ''}
      ${pick ? svg('chev', 'ico lb-chev') : own ? `<button class="icon-btn" data-lb="fold-more" data-path="${esc(p)}" title="More">${icon('more')}</button>`
        : `<button class="icon-btn lb-hov" data-lb="fold-more" data-path="${esc(p)}" title="Colour">${icon('more')}</button>${svg('chev', 'ico lb-chev')}`}
    </div>`;
  }
  function crumbsHTML(cwd){
    const parts = cwd===UNSORTED || cwd===BIN ? [] : cwd.split('/').filter(Boolean);
    let h = `<button class="lb-crumb" data-lb-open="" data-lb-fold="">Library</button>`, acc = '';
    for(const p of parts){ acc = acc ? `${acc}/${p}` : p; h += `<span class="lb-sep">›</span><button class="lb-crumb" data-lb-open="${esc(acc)}" data-lb-fold="${esc(acc)}">${esc(p)}</button>`; }
    if(cwd===UNSORTED) h += `<span class="lb-sep">›</span><span class="lb-crumb cur">Unsorted</span>`;
    if(cwd===BIN) h += `<span class="lb-sep">›</span><span class="lb-crumb cur">Bin</span>`;
    return h;
  }
  const dayWord = ms=>{ const d = new Date(ms); return `${d.getDate()} ${MON_NAMES[d.getMonth()]}`; };
  function binHTML(){
    const list = Object.entries(binRec()).sort((a, b)=>b[1].at - a[1].at);
    if(!list.length) return `<p class="lb-empty">The Bin is empty. Deleted decks and folders stay here for ${BIN_DAYS} days.</p>`;
    return `<p class="lb-note">Deleted decks and folders, kept for ${BIN_DAYS} days. Restore puts them back where they were.</p>` + list.map(([id, b])=>{
      const left = Math.max(0, BIN_DAYS - Math.floor((Date.now() - b.at)/864e5));
      const n = b.kind==='folder' ? b.keys.length : 0;
      return `<div class="lb-binrow" data-lb-bin="${esc(id)}">${svg(b.kind==='folder' ? 'folder' : 'deck')}
        <div class="lb-dmeta"><span class="lb-dname">${esc(b.name)}</span><span class="lb-path">From ${esc(crumbText(b.from) || 'Lesson Library')}${b.kind==='folder' ? ` · ${n} deck${n===1 ? '' : 's'}` : ''}</span><span class="lb-path">Deleted ${esc(dayWord(b.at))} · ${left ? `${left} day${left===1 ? '' : 's'} left` : 'goes today'}</span></div>
        <button class="btn sm" data-lb="restore" data-id="${esc(id)}">${svg('restore')}Restore</button><button class="icon-btn" data-lb="bin-more" data-id="${esc(id)}" title="More">${icon('more')}</button>
      </div>`;
    }).join('');
  }
  function listHTML(cwd, pick){
    const t = S.tree;
    if(cwd===BIN && !pick) return binHTML();
    if(cwd===UNSORTED){
      return `<p class="lb-note">Decks in a place they can't be kept: the Library's top, a Year folder's top, or a folder that isn't one of the fixed ones. ${pick ? '' : 'Drag them into a folder (or ⋯ › Move to…).'}</p>` + t.unsorted.map(k=>deckRowHTML(k, pick)).join('');
    }
    const f = t.folders.get(cwd); if(!f) return '';
    let h = '';
    if(!cwd && t.unsorted.length) h += `<div class="lb-folder lb-unsorted" data-lb-open="${UNSORTED}">${svg('inbox')}<span class="lb-fname">Unsorted</span><span class="lb-count warn">${t.unsorted.length}</span>${svg('chev', 'ico lb-chev')}</div>`;
    const subs = cwd ? f.subs.filter(inFixed) : f.subs.filter(p=>TOP_FIXED.includes(p));
    h += subs.map(p=>folderRowHTML(p, pick)).join('');
    const decks = f.decks.filter(k=>!t.decks.get(k).unsorted);
    h += decks.map(k=>deckRowHTML(k, pick)).join('');
    if(!cwd && !pick){ const n = Object.keys(binRec()).length; h += `<div class="lb-folder lb-bin" data-lb-open="${BIN}">${svg('bin')}<span class="lb-fname">Bin</span>${n ? `<span class="lb-count">${n}</span>` : ''}${svg('chev', 'ico lb-chev')}</div>`; }
    if(!subs.length && !decks.length) h += `<p class="lb-empty">${canHoldDecks(cwd) ? (pick ? 'No decks here yet.' : 'No decks here yet. Drop .pptx or .pdf files from File Explorer here, or use Save to Library on a lesson.') : 'Empty.'}</p>`;
    return h;
  }
  function resultsHTML(q){
    const r = search(q);
    if(!r.folders.length && !r.decks.length) return `<p class="lb-empty">Nothing found for “${esc(q)}”.${S.indexing ? ' Slide text is still being indexed.' : ''}</p>`;
    return r.folders.map(p=>folderRowHTML(p, false, { path:true })).join('') + r.decks.map(x=>deckRowHTML(x.key, false, { path:true, snip:x.snip })).join('')
      + (r.more ? `<p class="lb-note">Showing the first 200. Add another word to narrow it down.</p>` : '');
  }
  function pseudo(d){
    const files = {}; for(const t of EXTS) if(d.files[t]) files[t] = { path:d.files[t].path, name:d.files[t].name };
    return { id:'libthumb|' + d.key, files, mode:files.pptx ? 'pptx' : 'pdf', hides:{ pptx:{}, pdf:{} }, ink:{ pptx:{}, pdf:{} }, myNotes:{ pptx:{}, pdf:{} }, slideCount:{}, lang:'fr', title:'' };
  }
  async function loadThumb(holder){
    const key = holder.dataset.lbThumb;
    const w = holder.closest('.lb-full') ? Math.max(140, Math.round(holder.clientWidth || 220)) : Math.max(72, Math.round(holder.clientWidth || 120));
    const had = S.thumbs.get(key);
    if(had && had.w===w){ holder.appendChild(had.node); return; }
    const d = S.tree && S.tree.decks.get(key); if(!d) return;
    const l = master(key) || pseudo(d);
    try{
      const v = await C.getDeck(l, l.mode);
      if(holder.firstChild) return;
      const first = v.keys.find(k=>!v.isHidden(k)) ?? v.keys[0]; if(first==null) return;
      const node = C.mountThumb(holder, v, first, w, l, l.mode);
      S.thumbs.set(key, { w, node });
    }catch(e){ holder.title = "Couldn't open this deck: " + e.message; holder.classList.add('bad'); }
  }
  function watchThumbs(root){
    if(S.io) S.io.disconnect();
    S.io = new IntersectionObserver(es=>{ for(const e of es) if(e.isIntersecting){ S.io.unobserve(e.target); loadThumb(e.target); } }, { root, rootMargin:'200px' });
    root.querySelectorAll('[data-lb-thumb]').forEach(h=>S.io.observe(h));
  }

  // ---------- the side panel ----------
  // v1.84: icon only (dashboard redesign).
  function topButton(){ return `<button class="dtb${S.open ? ' lb-on' : ''}" data-a="library" title="Lesson Library" aria-label="Lesson Library" aria-pressed="${S.open ? 'true' : 'false'}">${svg('book')}</button>`; }
  function toggle(){
    S.open = !S.open; lsSet('sv_lib_open', S.open ? '1' : '0');
    if(S.open) S.stale = true; // re-check on open
    C.renderDashboard();
  }
  function mountPanel(){
    const dash = $('.dash'); if(!dash) return;
    const on = S.open && canCreate();
    S.drag = null; S.redraw = false; document.body.classList.remove('lb-dragging'); // a new panel: any drag from the old one is over
    dash.classList.toggle('lib-on', on);
    if(!on) return;
    const p = document.createElement('aside');
    p.className = 'lb-panel'; p.setAttribute('aria-label', 'Lesson Library');
    dash.parentElement.appendChild(p);
    skeleton(p);
    wirePanel(p);
    if(S.tree) renderPanel();
    if(!S.tree || S.stale){ if(!S.tree) p.querySelector('.lb-body').innerHTML = '<p class="lb-empty">Checking the Library…</p>'; refresh(); }
  }
  function headHTML(){ return `<div class="lb-head">${svg('book')}<b>Lesson Library</b><span class="grow"></span><button class="btn sm ghost" data-nav="library" title="Open the Library as a page: folders, a grid of decks and a preview">Open full library</button><button class="icon-btn" data-lb="refresh" title="Check the folders again">${svg('refresh')}</button><button class="icon-btn" data-lb="close" title="Close the Library">${icon('x')}</button></div>`; }
  // Head, search box, crumbs, list, footer. The search box is kept across redraws so typing isn't interrupted.
  function skeleton(p){
    const searchHTML = `<div class="lb-search">${svg('search')}<input type="search" placeholder="Search names and slide text" aria-label="Search the Library" value="${esc(S.q)}"><button class="icon-btn" data-lb="search-clear" title="Clear the search"${S.q ? '' : ' hidden'}>${icon('x')}</button></div>`;
    if(p.classList.contains('lb-full')){
      p.innerHTML = `<aside class="lbf-tree" aria-label="Folders"></aside>
        <section class="lbf-main"><div class="lbf-tools"><nav class="lb-crumbs"></nav>${searchHTML}<button class="icon-btn" data-lb="refresh" title="Check the folders again">${svg('refresh')}</button><button class="btn" data-lb="add-files" title="Add .pptx or .pdf files to this folder">${lucideSvg('upload', 'ico')}Add decks</button></div>
          <div class="lb-foot"></div><div class="lb-body"></div></section>
        <aside class="lbf-pv" aria-label="Preview"></aside>`;
    } else p.innerHTML = `${headHTML()}
      ${searchHTML}
      <div class="lb-years"></div><nav class="lb-crumbs"></nav><div class="lb-body"></div><div class="lb-foot"></div>`;
    const inp = p.querySelector('.lb-search input');
    let tm = null;
    inp.addEventListener('input', ()=>{ clearTimeout(tm); tm = setTimeout(()=>{ const q = inp.value.trim(); if(q===S.q) return; S.q = q; S.sel.clear(); S.anchor = null; renderPanel(); }, 160); });
    inp.addEventListener('keydown', e=>{ if(e.key==='Escape'){ e.preventDefault(); clearSearch(); } });
  }
  function clearSearch(){
    S.q = ''; const inp = $('.lb-panel .lb-search input'); if(inp) inp.value = '';
    S.sel.clear(); S.anchor = null; renderPanel();
  }
  function footHTML(){
    const cwd = S.cwd;
    if(S.sel.size > (S.full ? 1 : 0) && (cwd!==BIN || S.q)){ // v1.85: on the full page the bar is for 2 or more (one deck: its ⋯ menu and the preview)
      const n = S.sel.size;
      return `<span class="lb-selcount">${n} selected</span><span class="grow"></span>
        <button class="${S.full ? 'btn sm' : 'icon-btn'}" data-lb="sel-copy" title="Copy (Ctrl+C)">${svg('copy')}${S.full ? 'Copy' : ''}</button><button class="${S.full ? 'btn sm' : 'icon-btn'}" data-lb="sel-cut" title="Cut (Ctrl+X)">${svg('cut')}${S.full ? 'Cut' : ''}</button>
        <button class="${S.full ? 'btn sm' : 'icon-btn'}" data-lb="sel-move" title="Move to…">${svg('move')}${S.full ? 'Move to…' : ''}</button><button class="${S.full ? 'btn sm' : 'icon-btn'}" data-lb="sel-colour" title="Colour">${svg('palette')}${S.full ? 'Colour' : ''}</button>
        <button class="${S.full ? 'btn sm' : 'icon-btn'} lb-danger" data-lb="sel-delete" title="Delete (to the Bin)">${svg('bin')}${S.full ? 'Delete' : ''}</button><button class="icon-btn" data-lb="sel-clear" title="Clear the selection (Esc)">${icon('x')}</button>`;
    }
    if(S.q) return `<span class="lb-hint" data-lb-hint="Click a result to go to its folder · Ctrl/Shift-click to select">Click a result to go to its folder · Ctrl/Shift-click to select</span>`;
    if(cwd===BIN) return Object.keys(binRec()).length ? `<button class="btn sm danger" data-lb="empty-bin">${svg('bin')}Empty bin</button><span class="lb-hint" data-lb-hint=""></span>` : '<span class="lb-hint" data-lb-hint=""></span>';
    const holds = cwd!==UNSORTED && canHoldDecks(cwd);
    const hint = S.full ? (holds ? 'Drag decks onto a folder to move them · Ctrl-click to select several · drop .pptx / .pdf files here' : 'Drag decks onto a folder to move them · Ctrl-click to select several') : holds ? 'Drop .pptx / .pdf files here' : cwd ? '' : 'Drag a deck onto a lesson to copy it';
    return `${cwd!==UNSORTED && canHoldFolders(cwd) ? `<button class="btn sm" data-lb="new-folder">${svg('folderPlus')}New folder</button>` : ''}
      ${canPaste(cwd) ? `<button class="btn sm" data-lb="paste" title="Paste (Ctrl+V)">${svg('paste')}Paste${S.clip.items.length>1 ? ` ${S.clip.items.length}` : ''}</button>` : ''}
      <span class="lb-hint" data-lb-hint="${esc(hint)}">${esc(hint)}</span>`;
  }
  function renderPanel(){
    const p = $('.lb-panel'); if(!p || !S.tree) return;
    if(S.drag){ S.redraw = true; return; } // redrawing mid-drag would cancel it: wait for dragend
    if(!p.querySelector('.lb-search')) skeleton(p);
    const body = p.querySelector('.lb-body'), scroll = body.scrollTop || 0;
    const cwd = S.cwd;
    lsSet('sv_lib_cwd', cwd===UNSORTED || cwd===BIN ? '' : cwd);
    p.querySelector('.lb-search [data-lb=search-clear]').hidden = !S.q;
    p.querySelector('.lb-crumbs').innerHTML = S.q ? `<button class="lb-crumb" data-lb="search-clear">Library</button><span class="lb-sep">›</span><span class="lb-crumb cur">Search</span>` : crumbsHTML(cwd);
    if(!S.q && cwd!==UNSORTED && cwd!==BIN) body.dataset.lbFold = cwd; else delete body.dataset.lbFold;
    body.innerHTML = S.q ? resultsHTML(S.q) : listHTML(cwd, false);
    p.querySelector('.lb-foot').innerHTML = footHTML();
    p.classList.toggle('lb-has-sel', S.sel.size > (S.full ? 1 : 0));
    body.scrollTop = scroll;
    watchThumbs(body);
    showIndexing();
    const yrs = p.querySelector('.lb-years');
    if(yrs){ const top = S.q ? null : (cwd || '').split('/')[0]; yrs.innerHTML = TOP_FIXED.map(f=>`<button class="lb-yr${f===top ? ' on' : ''}" data-lb-open="${esc(f)}" data-lb-fold="${esc(f)}">${esc(f)}</button>`).join(''); }
    if(p.classList.contains('lb-full')){ renderTree(p); renderPv(p); }
  }
  // Just the selection marks and the footer (no redraw, so thumbnails and a double-click survive).
  function renderSel(){
    const p = $('.lb-panel'); if(!p) return;
    p.querySelectorAll('.lb-body [data-lb-item]').forEach(r=>r.classList.toggle('sel', S.sel.has(r.dataset.lbItem)));
    p.querySelector('.lb-foot').innerHTML = footHTML();
    p.classList.toggle('lb-has-sel', S.sel.size > (S.full ? 1 : 0));
    showIndexing();
  }
  function go(cwd){
    S.cwd = cwd; S.sel.clear(); S.anchor = null;
    if(S.q){ S.q = ''; const inp = $('.lb-panel .lb-search input'); if(inp) inp.value = ''; }
    renderPanel();
  }
  const selItems = ()=>[...S.sel].filter(itemExists);
  // A row's ⋯: the whole selection if the row is part of a bigger one.
  const itemsFor = id=>S.sel.has(id) && S.sel.size>1 ? selItems() : [id];
  function multiMenu(anchor, items){
    C.openMenu(anchor, [
      { label:`Copy ${items.length} items`, run:()=>setClip(items, false) },
      { label:'Cut', run:()=>setClip(items, true) },
      { label:'Move to…', run:()=>openMoveTo(items) },
      { label:'Colour…', run:()=>openColours(anchor, items) },
      '-',
      { label:`Delete ${items.length} items`, danger:true, run:()=>deleteMany(items) },
    ]);
  }
  // v1.67: Export to PowerPoint (pptx-export.js) works on the master's prep, made first if it isn't there yet.
  async function exportMaster(key){
    let m;
    try{ m = await ensureMaster(key); await C.saveNow(); }
    catch(e){ toast("Couldn't export: " + e.message, true); return; }
    SVExport.open(m.id);
  }
  function deckMenu(anchor, key){
    const d = S.tree.decks.get(key); if(!d) return;
    const id = 'd:' + key, items = itemsFor(id);
    if(items.length>1) return multiMenu(anchor, items);
    C.openMenu(anchor, [
      { label:'Edit the master', run:()=>openMaster(key) },
      { label:'Put in a lesson…', run:()=>openPutIn(key) },
      ...(window.SVExport && d.files.pptx ? [{ label:'Export to PowerPoint…', run:()=>exportMaster(key) }] : []), // v1.67
      '-',
      { label:'Copy', run:()=>setClip([id], false) },
      { label:'Cut', run:()=>setClip([id], true) },
      { label:'Rename…', run:()=>renameDeck(key) },
      { label:'Move to…', run:()=>openMoveTo([id]) },
      { label:'Colour…', run:()=>openColours(anchor, [id]) },
      '-',
      { label:'Delete', danger:true, run:()=>deleteMany([id]) },
    ]);
  }
  function folderMenu(anchor, path){
    const id = 'f:' + path, pasteIn = canPaste(path) ? [{ label:'Paste into this folder', run:()=>paste(path) }] : [];
    if(isFixed(path)) return C.openMenu(anchor, [...pasteIn, { label:'Colour…', run:()=>openColours(anchor, [id]) }]);
    const items = itemsFor(id);
    if(items.length>1) return multiMenu(anchor, items);
    C.openMenu(anchor, [
      { label:'Copy', run:()=>setClip([id], false) },
      { label:'Cut', run:()=>setClip([id], true) },
      ...pasteIn,
      { label:'Rename…', run:()=>renameFolder(path) },
      { label:'Move to…', run:()=>openMoveTo([id]) },
      { label:'Colour…', run:()=>openColours(anchor, [id]) },
      '-',
      { label:'Delete', danger:true, run:()=>deleteMany([id]) },
    ]);
  }
  function binMenu(anchor, id){
    C.openMenu(anchor, [
      { label:'Restore', run:()=>restoreMany([id]) },
      { label:'Delete for good…', danger:true, run:()=>deleteForeverAsk(id) },
    ]);
  }
  // Pick a lesson slot this week for a Library deck (the touch-friendly way to "drag onto a lesson").
  function openPutIn(key){
    const slots = weekSlots(); if(!slots.length){ toast('No lessons on your timetable this week.', true); return; }
    const si = pickDefault(slots, null);
    modal(`<h2>Put in a lesson</h2><p><b>${esc(baseOf(key))}</b> is copied with its hides, reveals and My notes. The master doesn't change.</p>
      <select class="lb-select">${slotOptions(slots, si)}</select>
      <div class="foot"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Copy into lesson</button></div>`, (m, close)=>{
      $('[data-a=no]', m).onclick = close;
      $('[data-a=ok]', m).onclick = ()=>{ const s = slots[+m.querySelector('select').value]; close(); copyToLesson(key, s.meta); };
    });
  }
  function selectRange(p, id){
    const rows = [...p.querySelectorAll('.lb-body [data-lb-item]')].map(r=>r.dataset.lbItem);
    let i = rows.indexOf(S.anchor); const j = rows.indexOf(id);
    if(i<0) i = j;
    S.sel = new Set(rows.slice(Math.min(i, j), Math.max(i, j) + 1));
  }
  // From a search result to the deck in its folder, selected.
  function reveal(key){
    const d = S.tree.decks.get(key); if(!d) return;
    S.q = ''; const inp = $('.lb-panel .lb-search input'); if(inp) inp.value = '';
    S.cwd = d.unsorted ? UNSORTED : d.folder;
    S.sel = new Set(['d:' + key]); S.anchor = 'd:' + key; S.pv = null; S.pvPos = 0;
    renderPanel();
    const row = [...document.querySelectorAll('.lb-panel .lb-body [data-lb-item]')].find(r=>r.dataset.lbItem==='d:' + key);
    if(row) row.scrollIntoView({ block:'nearest' });
  }
  function wirePanel(p){
    p.addEventListener('click', e=>{
      const b = e.target.closest('[data-lb]');
      if(b){
        e.stopPropagation();
        const a = b.dataset.lb, sel = selItems();
        if(a==='close') return toggle();
        if(a==='tree-toggle'){ const f = b.dataset.path; if(S.treeOpen.has(f)) S.treeOpen.delete(f); else S.treeOpen.add(f); return renderTree(p); }
        if(a==='put-in') return openPutIn(b.dataset.key);
        if(a==='pv-prev'){ S.pvPos = Math.max(0, S.pvPos - 1); return renderPv(p); }
        if(a==='pv-next'){ S.pvPos++; return renderPv(p); }
        if(a==='pv-go'){ S.pvPos = Number(b.dataset.p) || 0; return renderPv(p); }
        if(a==='add-files') return pickFiles();
        if(a==='refresh'){ S.stale = true; S.thumbs.clear(); C.deckCache && [...C.deckCache.keys()].filter(C.isLibPath).forEach(k=>C.deckCache.delete(k)); return refresh(); }
        if(a==='search-clear') return clearSearch();
        if(a==='new-folder') return newFolder(S.cwd);
        if(a==='paste') return paste(S.cwd);
        if(a==='edit') return openMaster(b.dataset.key);
        if(a==='deck-more') return deckMenu(b, b.dataset.key);
        if(a==='fold-more') return folderMenu(b, b.dataset.path);
        if(a==='bin-more') return binMenu(b, b.dataset.id);
        if(a==='restore') return restoreMany([b.dataset.id]);
        if(a==='empty-bin') return emptyBin();
        if(a==='sel-copy') return setClip(sel, false);
        if(a==='sel-cut') return setClip(sel, true);
        if(a==='sel-move') return openMoveTo(sel);
        if(a==='sel-colour') return openColours(b, sel);
        if(a==='sel-delete') return deleteMany(sel);
        if(a==='sel-clear'){ S.sel.clear(); S.anchor = null; return renderSel(); }
        return;
      }
      const row = e.target.closest('[data-lb-item]');
      if(row){
        const id = row.dataset.lbItem;
        if(e.ctrlKey || e.metaKey){ if(S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); S.anchor = id; return renderSel(); }
        if(e.shiftKey){ selectRange(p, id); return renderSel(); }
        if(idKind(id)==='deck'){
          if(S.q) return reveal(idWhat(id));
          S.sel = new Set([id]); S.anchor = id;
          if(S.full && S.pv!==idWhat(id)){ S.pv = idWhat(id); S.pvPos = 0; renderPv(p); }
          return renderSel();
        }
      }
      const o = e.target.closest('[data-lb-open]'); if(o) return go(o.dataset.lbOpen);
      if(e.target.closest('.lb-body') && S.sel.size){ S.sel.clear(); S.anchor = null; renderSel(); }
    });
    p.addEventListener('dblclick', e=>{ const d = e.target.closest('[data-lb-deck]'); if(d && !e.target.closest('[data-lb]')) openMaster(d.dataset.lbDeck); });
    p.addEventListener('contextmenu', e=>{
      if(e.target.closest('input')) return;
      const bin = e.target.closest('[data-lb-bin]');
      if(bin){ e.preventDefault(); return binMenu(bin, bin.dataset.lbBin); }
      const row = e.target.closest('[data-lb-item]'), fixed = !row && e.target.closest('.lb-body .lb-folder[data-lb-fold]');
      if(fixed){ e.preventDefault(); return folderMenu(fixed, fixed.dataset.lbFold); }
      if(!row) return;
      e.preventDefault();
      const id = row.dataset.lbItem;
      if(!S.sel.has(id)){ S.sel = new Set([id]); S.anchor = id; renderSel(); }
      if(idKind(id)==='deck') deckMenu(row, idWhat(id)); else folderMenu(row, idWhat(id));
    });
    p.addEventListener('dragstart', e=>{
      const row = e.target.closest('[data-lb-item]'); if(!row) return;
      const id = row.dataset.lbItem;
      if(!S.sel.has(id)){ S.sel = new Set([id]); S.anchor = id; renderSel(); }
      const items = selItems();
      S.drag = { items };
      if(items.length===1 && idKind(items[0])==='deck'){ // one deck: can also go onto a lesson slot
        e.dataTransfer.setData(DRAG_TYPE, idWhat(items[0]));
        document.body.classList.add('lb-dragging');
      } else e.dataTransfer.setData(FOLDER_TYPE, JSON.stringify(items));
      e.dataTransfer.setData('text/plain', items.map(idName).join(', '));
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    p.addEventListener('dragend', ()=>{ clearOver(); endDrag(); });
    const targetOf = e=>{ const t = e.target.closest('[data-lb-fold]'); return t ? t.dataset.lbFold : null; };
    const copying = e=>e.ctrlKey || e.altKey;
    const accepts = (e, to)=>{
      if(to==null) return false;
      const types = [...e.dataTransfer.types];
      if(types.includes('Files') && !S.drag) return canHoldDecks(to);
      if(S.drag) return canTake(S.drag.items, to, copying(e));
      return false;
    };
    const clearOver = ()=>p.querySelectorAll('.lb-over').forEach(x=>x.classList.remove('lb-over'));
    p.addEventListener('dragover', e=>{
      const to = targetOf(e); clearOver();
      if(!accepts(e, to)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = S.drag && !copying(e) ? 'move' : 'copy';
      const t = e.target.closest('[data-lb-fold]'); if(t) t.classList.add('lb-over');
    });
    p.addEventListener('dragleave', e=>{ if(!p.contains(e.relatedTarget)) clearOver(); });
    p.addEventListener('drop', e=>{
      const to = targetOf(e); clearOver();
      if(!accepts(e, to)){ if([...e.dataTransfer.types].includes('Files')) e.preventDefault(); return; }
      e.preventDefault(); e.stopPropagation();
      const drag = S.drag, copy = copying(e); S.drag = null; document.body.classList.remove('lb-dragging');
      if(drag) return copy ? copyMany(drag.items, to) : moveMany(drag.items, to);
      if(e.dataTransfer.files && e.dataTransfer.files.length) importFiles(to, e.dataTransfer.files);
    });
  }
  function endDrag(){ S.drag = null; document.body.classList.remove('lb-dragging'); if(S.redraw){ S.redraw = false; renderPanel(); } }
  // A drop anywhere ends a panel drag, even if the dragged row has gone (dragend doesn't reach the page then).
  window.addEventListener('drop', ()=>{ if(S.drag) setTimeout(endDrag, 0); }, true);
  // Coming back to the window: pick up anything changed in File Explorer.
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState!=='visible' || !canCreate() || !C.view || !((S.open && C.view.name==='dash') || fullOpen())) return;
    setTimeout(()=>{ if($('.lb-panel')){ S.stale = true; refresh(); } }, 400); // after app.js redraws the dashboard
  });
  // Keyboard: only after a click in the panel (so Ctrl+C / Ctrl+A elsewhere on the dashboard behave as usual).
  document.addEventListener('pointerdown', e=>{ if(e.target.closest && e.target.closest('.menu, .modal-back')) return; S.focus = !!(e.target.closest && e.target.closest('.lb-panel')); }, true);
  document.addEventListener('keydown', e=>{
    if(!S.focus || !S.tree || !C.view || !((S.open && C.view.name==='dash') || fullOpen()) || $('.modal-back') || !$('.lb-panel')) return;
    if(e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if(k==='escape'){
      if(S.sel.size){ e.preventDefault(); S.sel.clear(); S.anchor = null; renderSel(); }
      else if(S.clip){ e.preventDefault(); S.clip = null; renderPanel(); }
      else if(S.q){ e.preventDefault(); clearSearch(); }
      return;
    }
    if(S.cwd===BIN && !S.q) return;
    const sel = selItems();
    if(mod && k==='a'){ e.preventDefault(); S.sel = new Set([...document.querySelectorAll('.lb-panel .lb-body [data-lb-item]')].map(r=>r.dataset.lbItem)); return renderSel(); }
    if(mod && k==='c' && sel.length){ e.preventDefault(); return setClip(sel, false); }
    if(mod && k==='x' && sel.length){ e.preventDefault(); return setClip(sel, true); }
    if(mod && k==='v'){ if(!S.q && canPaste(S.cwd)){ e.preventDefault(); paste(S.cwd); } return; }
    if(e.key==='Delete' && sel.length){ e.preventDefault(); return deleteMany(sel); }
    if(e.key==='F2' && sel.length===1){ e.preventDefault(); return idKind(sel[0])==='deck' ? renameDeck(idWhat(sel[0])) : renameFolder(idWhat(sel[0])); }
  });

  // ---------- Choose from Library (on a lesson slot) ----------
  async function openChoose(meta){
    if(!canCreate()){ toast('The Library needs the OneDrive folder connected. Go Home and reconnect.', true); return; }
    showLoading('Opening the Library…');
    try{ S.stale = true; await scan(); }catch(e){ hideLoading(); toast("Couldn't read the Lesson Library: " + e.message, true); return; }
    hideLoading();
    let cwd = defaultFolder(meta, dateOf(meta.date));
    if(!S.tree.folders.has(cwd)) cwd = 'Other';
    modal(`<h2>Choose from the Library</h2><p>For <b>${esc(meta.label)}</b>. The lesson gets a copy, with the master's hides, reveals and My notes.</p>
      <nav class="lb-crumbs"></nav><div class="lb-pick lb-body"></div>
      <div class="foot"><button class="btn" data-a="no">Cancel</button></div>`, (m, close)=>{
      m.classList.add('lb-modal');
      const body = $('.lb-pick', m), nav = $('.lb-crumbs', m);
      const draw = ()=>{ nav.innerHTML = crumbsHTML(cwd); body.innerHTML = listHTML(cwd, true); body.scrollTop = 0; watchThumbs(body); };
      m.addEventListener('click', e=>{
        const o = e.target.closest('[data-lb-open]'); if(o){ cwd = o.dataset.lbOpen; draw(); return; }
        const d = e.target.closest('[data-lb-deck]'); if(d){ close(); copyToLesson(d.dataset.lbDeck, meta); }
      });
      $('[data-a=no]', m).onclick = close;
      draw();
    });
  }
  // ---------- v1.86: Master updated → Pull changes ----------
  function hash(str){ let h = 0x811c9dc5; for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  function prepSig(l){
    if(!l) return '';
    const types = EXTS.filter(t=>l.files && l.files[t]), pick = (o, t)=>(o && o[t]) || {};
    return hash(JSON.stringify({ f:types.map(t=>[t, l.files[t].size]), h:types.map(t=>pick(l.hides, t)), n:types.map(t=>pick(l.myNotes, t)),
      s:types.map(t=>(l.slides && l.slides[t]) || null), ti:l.title || '', la:l.lang || '', r:types.includes('pptx') ? (l.ratio || '') : '', g:l.gcSet || '' }));
  }
  function stampCopy(l, m){ l.fromSig = prepSig(m); l.ownSig = prepSig(l); }
  // Copies with no stamp yet (made before v1.86, or before their master existed) are taken as up to date.
  function baseline(key){
    let n = 0;
    for(const l of Object.values(C.data.lessons)){
      if(l.lib || !l.fromLib || (key && l.fromLib!==key) || l.fromSig!=null) continue;
      const m = master(l.fromLib); if(!m) continue;
      stampCopy(l, m); n++;
    }
    if(n) C.saveSoon();
  }
  const upcoming = l=>!!l.date && l.date >= iso(today());
  const inkOf = l=>EXTS.reduce((n, t)=>n + Object.values((l.ink && l.ink[t]) || {}).filter(a=>a && a.length).length, 0);
  // null, or { key, stem, edited, ink } when the lesson's master has changed since its copy was made.
  function pullState(l){
    if(!canCreate() || !l || l.lib || !l.mode || !l.fromLib || isBinKey(l.fromLib) || !upcoming(l)) return null;
    if(S.based!==C.data){ S.based = C.data; baseline(); } // once per data load: copies made before v1.86 start up to date
    const m = master(l.fromLib); if(!m || !m.mode) return null;
    if(l.fromSig==null){ stampCopy(l, m); C.saveSoon(); return null; }
    if(prepSig(m)===l.fromSig) return null;
    return { key:l.fromLib, stem:baseOf(l.fromLib), edited:prepSig(l)!==l.ownSig, ink:inkOf(l) };
  }
  // The button on a dashboard row (app.js rowHTML).
  function pullBadge(l){
    const st = pullState(l); if(!st) return '';
    return `<button class="dr-upd" data-a="lib-pull" data-id="${esc(l.id)}" title="“${esc(st.stem)}” has changed in the Library since this copy was made">${svg('refresh')}Master updated</button>`;
  }
  const metaOf = l=>({ id:l.id, date:l.date, slotId:l.slotId, label:l.label, start:l.start, end:l.end, period:l.period });
  const lossText = st=>[st.edited ? 'its own changes to hides, reveals or My notes' : '', st.ink ? `pen marks on ${st.ink} slide${st.ink>1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
  function openPull(id){
    const l = C.data.lessons[id], st = pullState(l);
    if(!st){ C.renderDashboard(); return; }
    const loss = lossText(st);
    modal(`<h2>Master updated</h2><p>“${esc(st.stem)}” has changed in the Lesson Library since ${esc(l.label)}’s copy was made.</p>
      <p>Pulling the changes makes this lesson an exact copy of the master again: deck, hides, reveals and My notes.</p>
      ${loss ? `<p class="lp-warn">This lesson has ${esc(loss)}, which will be lost.</p>` : ''}
      <div class="foot"><button class="btn" data-a="no">Cancel</button><span class="grow"></span><button class="btn" data-a="keep" title="Stop showing this until the master changes again">Keep this version</button><button class="btn primary" data-a="ok">Pull changes</button></div>`, (m, close)=>{
      $('[data-a=no]', m).onclick = close;
      $('[data-a=keep]', m).onclick = ()=>{ close(); const mm = master(st.key); if(mm){ l.fromSig = prepSig(mm); C.saveSoon(); } C.renderDashboard(); toast('Kept this lesson’s version'); };
      $('[data-a=ok]', m).onclick = async ()=>{ close(); if(await copyToLesson(st.key, metaOf(l), { pull:true })){ C.renderDashboard(); toast(`${l.label} now matches “${st.stem}”`); } };
    });
  }
  // After a master changes: offer to update its upcoming copies (not `skip`, the lesson it was saved from).
  function offerPullAll(key, skip){
    const ls = Object.values(C.data.lessons).filter(l=>l.fromLib===key && l.id!==skip && pullState(l))
      .sort((a, b)=>(a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    if(!ls.length) return;
    const rows = ls.map((l, i)=>{ const loss = lossText(pullState(l));
      return `<label class="cr-check lp-row"><input type="checkbox" data-i="${i}" checked><span><b>${esc(l.label)} · ${esc(whenOf(l))}</b>${loss ? `<small class="lp-warn">Has ${esc(loss)}, which will be lost</small>` : ''}</span></label>`; }).join('');
    modal(`<h2>Update upcoming lessons?</h2><p>${ls.length===1 ? 'One upcoming lesson uses' : `${ls.length} upcoming lessons use`} a copy of “${esc(baseOf(key))}”. Updating makes each an exact copy of the master again.</p>
      <div class="lp-list">${rows}</div>
      <div class="foot"><button class="btn" data-a="no" title="They'll show 'Master updated' on the dashboard">Not now</button><button class="btn primary" data-a="ok">Update</button></div>`, (m, close)=>{
      const boxes = [...m.querySelectorAll('input[data-i]')], ok = $('[data-a=ok]', m);
      const sync = ()=>{ const n = boxes.filter(b=>b.checked).length; ok.disabled = !n; ok.textContent = n ? `Update ${n} lesson${n>1 ? 's' : ''}` : 'Update'; };
      boxes.forEach(b=>b.onchange = sync); sync();
      $('[data-a=no]', m).onclick = close;
      ok.onclick = async ()=>{
        const pick = boxes.filter(b=>b.checked).map(b=>ls[Number(b.dataset.i)]); close();
        let n = 0; for(const l of pick) if(await copyToLesson(key, metaOf(l), { pull:true })) n++;
        if(fullOpen()) renderFull(); else if(C.view && C.view.name==='dash') C.renderDashboard();
        if(n) toast(`Updated ${n} lesson${n>1 ? 's' : ''} from “${baseOf(key)}”`);
      };
    });
  }

  // Extra items for a lesson's ⋯ menu on the dashboard.
  function lessonMenu(l, meta){
    if(!canCreate() || l.lib) return [];
    return ['-', { label:'Save to Lesson Library…', run:()=>openSave(l) }, { label:'Replace from Library…', run:()=>openChoose(meta) }];
  }

  window.SVLibrary = { canCreate, openCreate, ensureFixed, FIXED_FOLDERS, LIB_DIR, TEMPLATE, halfTermOf, DRAG_TYPE,
    topButton, toggle, mountPanel, isOpen:()=>S.open && canCreate(), openChoose, dropOnSlot, lessonMenu, backFromEditor, openSave, scan,
    openFull, closeFull, fullOpen, renderFull, // v1.85
    pullBadge, openPull, // v1.86
    copyToLesson }; // demo.js
  // If the dashboard was drawn before this file loaded, draw it again so the Create / Library buttons show.
  if(C.view && C.view.name==='dash') C.renderDashboard();
})();
