/* starter-content.js: copies the Sentence Builders and Waypoints that ship with the app into the user's data folder.
   The list of files is starter-content.json (made by tools/make-starter-manifest.ps1).
   Runs once per data folder when the app opens it. A marker file, '.starter-content.json', records what was copied, so:
   - a file the user has since changed, moved or deleted is never copied again;
   - a file already in the data folder is never overwritten;
   - files added in a later version of the app are copied the next time.
   Needs the app to be served over http(s): browsers block fetch() from a page opened as a file, so nothing happens then. */
(function(){
'use strict';

const MANIFEST = 'starter-content.json', MARKER = '.starter-content.json';

async function dirAt(root, parts, create){
  let d = root;
  for(const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
async function exists(root, path){
  const parts = path.split('/'), name = parts.pop();
  try{ const d = await dirAt(root, parts, false); await d.getFileHandle(name); return true; }catch(e){ return false; }
}
async function readMarker(root){
  try{ return JSON.parse(await (await (await root.getFileHandle(MARKER)).getFile()).text()); }catch(e){ return null; }
}

async function seed(root){
  if(!root || !/^https?:$/.test(location.protocol)) return 0;
  let man;
  try{ const r = await fetch(MANIFEST, { cache:'no-cache' }); if(!r.ok) return 0; man = await r.json(); }catch(e){ return 0; }
  if(!man || !Array.isArray(man.files)) return 0;
  const marker = await readMarker(root) || { version:0, files:[] };
  if(marker.version === man.version) return 0;
  const done = new Set(marker.files);
  let copied = 0;
  for(const path of man.files){
    if(done.has(path)) continue;
    try{
      if(!(await exists(root, path))){
        const r = await fetch(path.split('/').map(encodeURIComponent).join('/'));
        if(!r.ok) throw new Error(r.status);
        const blob = await r.blob();
        const parts = path.split('/'), name = parts.pop();
        const fh = await (await dirAt(root, parts, true)).getFileHandle(name, { create:true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
        copied++;
      }
      done.add(path);
    }catch(e){ console.warn('Starter content: could not copy', path, e); }
  }
  try{
    const w = await (await root.getFileHandle(MARKER, { create:true })).createWritable();
    await w.write(JSON.stringify({ version:man.version, files:[...done] })); await w.close();
  }catch(e){ console.warn('Starter content: could not write the marker file', e); }
  return copied;
}

window.SVStarter = { seed };
})();
