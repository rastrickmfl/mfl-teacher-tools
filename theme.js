/* theme.js: v1.89 light / dark for the whole app. Loaded in <head> so the page never flashes the wrong look.
   One choice ('light', 'dark' or 'auto' = match the computer) kept on this computer under sv_editor_theme, the same key the editor's own
   light / dark button uses, so the two always agree. Puts data-app-theme on <html> (darkmode.css reads it). */
(function(){
  const KEY = 'sv_editor_theme', mq = matchMedia('(prefers-color-scheme: dark)');
  const pref = ()=>{ try{ const t = localStorage.getItem(KEY); return t==='light' || t==='dark' ? t : 'auto'; }catch(e){ return 'auto'; } };
  const now = ()=>{ const t = pref(); return t==='auto' ? (mq.matches ? 'dark' : 'light') : t; };
  function apply(){
    document.documentElement.dataset.appTheme = now();
    const ed = document.querySelector('.editor'); // keep an open editor in step
    if(ed && ed.dataset.theme !== now()) ed.dataset.theme = now();
    for(const b of document.querySelectorAll('[data-theme-toggle]')) b.setAttribute('aria-pressed', now()==='dark' ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('sv-theme', { detail:{ pref:pref(), now:now() } }));
  }
  function set(v){ try{ localStorage.setItem(KEY, v); }catch(e){} apply(); }
  mq.addEventListener('change', apply);
  window.addEventListener('storage', e=>{ if(e.key===KEY) apply(); });
  window.SVTheme = { pref, now, set, apply };
  apply();
})();
