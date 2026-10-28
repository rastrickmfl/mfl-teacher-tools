/* =====================================================================
   Slideshow Viewer — Sentence Builder presenter (v1.42, 2026-10-15; respelling pop-out v1.77; Mindreader v1.43; bigger one-language text v1.45; joined columns v1.59)
   Loaded after sb-core.js (window.SBCore) and app.js (window.SVHost, SVCore).
   Opened from the Tools box (Sentence Builder) or the console's Tools menu.

   Gallery: every .sb.json in Sentence Builders/Year N/<half-term>/ (made in
   builder.html). Opens on the year of the lesson being presented, with the
   current half-term first; Year / language filters and a search (search
   looks across all years). v1.64: filter tabs (sb-core filterRows) — Year,
   French/Spanish (preset from the class code: Fr → French, Sp → Spanish),
   half-term (All by default; the current one has a dot), and Foundation /
   Higher for Years 10–11; the same tabs are on the Settings page. In the dual-screen pupil window the list comes
   from the console (rpc 'sbList' in dual.js), which has the folder.

   Presenter: fills the whole screen. The builder is drawn live with the
   editor's 16:9 slide layout (SBCore.fitPaper on PAPERS.slide), scaled to
   the window. A small tab at the bottom shows the tool bar (hides itself
   after 12 s):
     <Language> / English / Pronunciation  switches. At least one language
        stays on. (v1.45) Switching a language off leaves its line out and
        re-fits the builder, so the other language comes out bigger (up to
        PAPERS.slide.one = 36pt, never smaller than with both). Items move;
        question bar and column titles keep the two-language size. English on
        its own is bold at full size (not 85%) and has no pronunciation lines.
        If it can't fit any bigger, the two-language layout is kept with the
        line blanked in place (the old way).
        Pronunciation = silent-letter greying, and (v1.77) the respelling
        pop-out: with Pronunciation on, tapping a chunk that has respellings
        shows them in a pop-out (each tricky word with its respelling under
        it) instead of highlighting it; chunks without respellings still
        highlight. Tap anywhere, or Esc, to close it. Respellings are never
        drawn on the builder itself (or printed). Shown only if the builder
        has silent letters or respellings; on at the start unless it has
        respellings, so taps highlight until it's switched on.
     Random sentence  one item per column, staying in one group (row) where
        columns are split; columns that span all groups go with any group.
        (v1.59) Joined columns (one title, no line between) count as one column.
        Hidden items are never picked. Quick shuffle, settling column by
        column left to right; the rest is greyed out. Again = new sentence.
     A− / A+ (v1.60)  whole builder one pt smaller / bigger (stops at the smallest size and the largest that fits). Resets when a builder opens.
     Clear  highlights, random sentence and hidden items.   Show all  hidden items back (highlights kept).
     Builders (back to the gallery) · Close.
   Taps on the builder:
     item          highlight. Colour = order within that column: 1st yellow,
                   2nd pale blue, 3rd pale green, 4th pale orange (max 4).
                   Tap again to clear it; the next tap fills the free colour.
     long-press    hide the item (grey striped box). Tap a hidden item to
                   show it again.
     column title  hide the whole column / show it again.
   Keys: Esc close · R random · C clear · M Mindreader. The keyboard / clicker
   don't change slides while it's open. Nothing is saved: it all resets when a
   builder is opened or the lesson is left.

   Mindreader (v1.43): the bar's Mindreader button → Easy / Hard. A secret
   sentence is picked like Random sentence (one group where columns are split,
   never a hidden item) and not shown. A pupil guesses; the teacher taps one
   word per column (tap again to unselect, tap another to change). Columns
   with only one item showing are green from the start and don't count. Once
   every counting column has a word, a ~3 s mind-reading takeover runs, then
   "Two matches / out of 4". Tap (or 4 s) to go on:
     Easy  correct words lock green; wrong ones flash red, then clear.
     Hard  nothing is marked; the whole guess clears.
   All correct → "Mind read!" with the number of guesses; the sentence stays
   green. Bar: Reveal answer · New secret · Exit. C clears the current guess;
   highlights, random sentence and hiding are off while it runs. Esc steps
   back (result → Mindreader off → close).
   Teacher's Choice (v1.44, dual screen only; greyed out otherwise): the
   teacher screen shows the builder (pickOnConsole) to tap the secret
   sentence and Start Easy / Start Hard; the panel shows the crystal ball
   ("Thinking of a sentence…", Cancel) until then. New secret asks again.
   Reveal answer pressed on the teacher screen's replica marks the answer
   there only (dashed gold outline, REP_CSS; press again to unmark) and the
   round carries on; pressed on the panel it reveals it on both and ends.
   ===================================================================== */
(function(){
'use strict';
const K = window.SBCore;
if(!K) return;
const { richText, itemHasPhon, phonSegments } = K;
const { esc, LANGS, TERMS, YEARS, TIERS, hasTier, langOf, termShort, filterBuilders, byTitle, filterRows, applyFilter, emptyText, MM, PAPERS, groupCount, unitsOf, hasSay, displayTitle, fitPaper, sheetHTML, clearMeasure, currentTerm, listBuilders } = K;
const H = () => window.SVHost, C = () => window.SVCore;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function rand(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
const pick = arr => arr[Math.floor(rand() * arr.length)];
const toast = m => { const h = H(); if(h && h.toast) h.toast(m); };

const IC = iconMap({
  sb: 'brick-wall', x: 'x', up: 'chevron-up', down: 'chevron-down',
  back: 'chevron-left', dice: 'dices', eraser: 'eraser', eye: 'eye',
  search: 'search', refresh: 'rotate-cw', ball: 'brain', shuffle: 'shuffle',
  key: 'key-round',
});
const icon = (n, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- styles (also given to the dual-screen console replica: dual.js REP_CSS) ---------------- */
const HL = ['#FFE94D', '#A9D8FF', '#B5EBAA', '#FFC98A']; // yellow, pale blue, pale green, pale orange
// v1.88: the gallery, tool bar and Mindreader cards follow the editor's Light / Dark setting (Auto = the computer's); .sbp-lt is their light look.
const lightUI = () => {
  let t = ''; try{ t = localStorage.getItem('sv_editor_theme') || ''; }catch(e){}
  return t === 'light' || (t !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
};
const LT = () => lightUI() ? ' sbp-lt' : '';
const CSS = `
.sbp-back{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px}
.sbp-gal{background:#1c1c1f;color:#f2f2f4;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:min(1120px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;overflow:hidden;font-family:inherit;-webkit-user-select:none;user-select:none;touch-action:manipulation}
.sbp-gal .ico,.sbp .ico{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.sbp-gal .ico .f,.sbp .ico .f{fill:currentColor;stroke:none}
.sbp-gh{display:flex;align-items:center;gap:12px;padding:16px 18px 10px}
.sbp-gh h2{margin:0;font-size:22px;font-weight:600;flex:1}
.sbp-ib{width:44px;height:44px;border-radius:12px;border:0;background:#2a2a2f;color:inherit;display:grid;place-items:center;cursor:pointer}
.sbp-ib:hover{background:#34343a}
.sbp-filt{display:flex;flex-direction:column;gap:8px;padding:0 18px 12px;border-bottom:1px solid #2e2e34}
.sbp-frow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sbp-chip{height:40px;padding:0 14px;border-radius:999px;border:1px solid #3a3a42;background:transparent;color:#d6d6dc;font:inherit;font-size:15px;cursor:pointer}
.sbp-chip.on{background:#f2f2f4;color:#111;border-color:#f2f2f4;font-weight:600}
.sbp-chip em{font-style:normal;opacity:.6;margin-left:4px}
.sbp-chip.now::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#FFE94D;margin-right:7px;vertical-align:middle}
.sbp-tier{font-size:11px;font-weight:600;padding:2px 6px;border-radius:5px;background:#3a3a42;color:#e6e6ea}
.sbp-sep{width:1px;height:26px;background:#3a3a42;margin:0 4px}
.sbp-search{flex:1;min-width:180px;display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:999px;background:#2a2a2f;color:#aaa}
.sbp-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#f2f2f4;font:inherit;font-size:15px}
.sbp-gb{flex:1;overflow:auto;padding:6px 18px 20px}
.sbp-sec{margin:14px 0 8px;font-size:14px;font-weight:600;color:#a9a9b3;text-transform:uppercase;letter-spacing:.04em}
.sbp-sec b{color:#FFE94D;font-weight:600;text-transform:none;letter-spacing:0;margin-left:6px}
.sbp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.sbp-card{text-align:left;border:1px solid #33333a;background:#25252a;color:inherit;border-radius:14px;padding:12px 14px;cursor:pointer;font:inherit;display:flex;flex-direction:column;gap:6px;min-height:96px}
.sbp-card:hover{background:#2e2e34;border-color:#4a4a52}
.sbp-card .t{font-size:16px;font-weight:600;line-height:1.25}
.sbp-card .q{font-size:14px;color:#bdbdc6;line-height:1.3}
.sbp-card .m{margin-top:auto;font-size:13px;color:#8e8e98;display:flex;gap:8px;align-items:center}
.sbp-lang{font-size:11px;font-weight:700;padding:2px 6px;border-radius:5px;background:#3d5afe;color:#fff}
.sbp-lang.es{background:#e0592a}
.sbp-msg{padding:40px 10px;text-align:center;color:#a9a9b3;font-size:16px;line-height:1.5}
.sbp-msg button{margin-top:12px}

.sbp{position:fixed;inset:0;z-index:121;background:#fff;overflow:hidden;-webkit-user-select:none;user-select:none;touch-action:manipulation}
.sbp-scale{position:absolute;left:0;top:0;transform-origin:0 0}
.sbp .sb-it{cursor:pointer;border-radius:.28em;transition:background-color .12s,box-shadow .12s,opacity .2s}
/* v1.77 respelling pop-out (Pronunciation on, tap a chunk). Sizes in vmin so the class can read it from the back. */
.sbp-pp{position:absolute;z-index:6;max-width:86vw;background:#fff;color:#000;border:.35vmin solid #e07b00;border-radius:2vmin;box-shadow:0 1.2vmin 4vmin rgba(0,0,0,.28);padding:2.2vmin 3vmin 2.4vmin;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;pointer-events:auto;animation:sbp-pp-in .16s ease-out}
@keyframes sbp-pp-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
.sbp-pp .pp-line{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;column-gap:.25em;row-gap:1.2vmin;font-size:6.4vmin;font-weight:bold;line-height:1.1}
.sbp-pp .pp-w{display:inline-flex;flex-direction:column;align-items:center}
.sbp-pp .pp-r{font-size:.72em;font-weight:bold;color:#b34700;margin-top:.15em;white-space:nowrap;letter-spacing:.02em}
.sbp-pp .pp-r::before{content:'“'}.sbp-pp .pp-r::after{content:'”'}
.sbp-pp .pp-t{white-space:nowrap}
.sbp-pp .c-r{color:#c00000}.sbp-pp .c-b{color:#0047b3}.sbp-pp .c-g{color:#00792a}.sbp-pp .c-p{color:#7030a0}.sbp-pp .c-s{color:#6b6b6b}
.sbp-pp .pp-en{margin-top:1.6vmin;text-align:center;font-size:3.6vmin;color:#444}
.sbp .sb-it.pp-on{box-shadow:0 0 0 .2em #e07b00}
.sbp .sb-it.hl1,.sbp .sb-it.flick{background:${HL[0]};box-shadow:0 0 0 .2em ${HL[0]}}
.sbp .sb-it.hl2{background:${HL[1]};box-shadow:0 0 0 .2em ${HL[1]}}
.sbp .sb-it.hl3{background:${HL[2]};box-shadow:0 0 0 .2em ${HL[2]}}
.sbp .sb-it.hl4{background:${HL[3]};box-shadow:0 0 0 .2em ${HL[3]}}
.sbp .sb-it.flick,.sbp.busy .sb-it{transition:none}
.sbp.rand .sb-it:not(.pick):not(.flick){opacity:.16}
.sbp .sb-it.hid{background:repeating-linear-gradient(135deg,#ececec 0 .45em,#dcdcdc .45em .9em);box-shadow:0 0 0 .2em #e4e4e4}
.sbp .sb-it.hid>*{visibility:hidden}
.sbp .sb-h{cursor:pointer}
.sbp .sb-h.hidc{background:#c4c4c4;color:#555}
.sbp.no-tl .sb-it .tl{visibility:hidden}
.sbp.no-tl .sb-q{color:transparent}
.sbp.no-tl .sb-q .qen{color:#e4e4e4}
.sbp.no-en .sb-it .en,.sbp.no-en .sb-q .qen{visibility:hidden}
.sbp.no-sil .sb-it .c-s{color:inherit}
.sbp.no-sil .sb-it .c-s[data-u=r]{color:#c00000}.sbp.no-sil .sb-it .c-s[data-u=b]{color:#0047b3}.sbp.no-sil .sb-it .c-s[data-u=g]{color:#00792a}.sbp.no-sil .sb-it .c-s[data-u=p]{color:#7030a0}
.sbp-tab{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:64px;height:30px;border-radius:999px;border:0;background:rgba(30,30,34,.28);color:#fff;display:grid;place-items:center;cursor:pointer;z-index:3}
.sbp-tab:hover{background:rgba(30,30,34,.55)}
.sbp-tab .ico{width:20px;height:20px}
.sbp.bar-on .sbp-tab{bottom:84px;background:rgba(30,30,34,.55)}
.sbp-bar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:8px;border-radius:18px;background:#1c1c1f;color:#f2f2f4;box-shadow:0 10px 36px rgba(0,0,0,.45);z-index:3;max-width:calc(100vw - 24px);overflow-x:auto;font-size:15px}
.sbp-bar[hidden]{display:none}
.sbp-b{height:52px;min-width:52px;padding:0 14px;border-radius:12px;border:0;background:#2a2a2f;color:inherit;font:inherit;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;white-space:nowrap}
.sbp-b:hover{background:#34343a}
.sbp-b.tg{background:transparent;border:2px solid #3a3a42;color:#9a9aa3}
.sbp-b.tg.on{background:#f2f2f4;border-color:#f2f2f4;color:#111}
.sbp-b.go{background:#F5B700;color:#111;font-weight:600}
.sbp-b.go:hover{background:#ffc928}
.sbp-b.icn{padding:0}
.sbp-bsep{width:1px;height:32px;background:#3a3a42;margin:0 4px;flex:none}

/* Mindreader */
.sbp.mind .sb-it.mr-sel{background:${HL[0]};box-shadow:0 0 0 .2em ${HL[0]}}
.sbp.mind .sb-it.mr-ok{background:#86DE76;box-shadow:0 0 0 .2em #86DE76}
.sbp.mind .sb-it.mr-bad{background:#FF8B8B;box-shadow:0 0 0 .2em #FF8B8B;animation:sbp-shake .45s}
.sbp.mind .sb-it.mr-dim{opacity:.22;cursor:default}
.sbp.mind .sb-h{cursor:default}
@keyframes sbp-shake{0%,100%{transform:none}25%{transform:translateX(-.18em)}75%{transform:translateX(.18em)}}
.sbp-mrtag{display:flex;align-items:center;gap:8px;height:52px;padding:0 14px;border-radius:12px;background:#3b1d6e;color:#e9dcff;font-weight:600;white-space:nowrap}
.sbp-mrtag small{font-weight:500;opacity:.75;font-size:14px}
.sbp-b.mr{background:#6d3fd1;color:#fff}
.sbp-b.mr:hover{background:#7f52e0}
.sbp-mrc{position:absolute;inset:0;z-index:6;background:rgba(10,4,24,.6);display:grid;place-items:center;padding:16px}
.sbp-mrc-card{background:#1c1c1f;color:#f2f2f4;border-radius:22px;padding:26px 26px 20px;width:min(780px,94vw);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.sbp-mrc-card .ico{width:40px;height:40px;color:#b896ff;stroke-width:1.6}
.sbp-mrc-card h3{margin:6px 0 4px;font-size:26px}
.sbp-mrc-card p{margin:0 0 18px;color:#bdbdc6;font-size:16px;line-height:1.4}
.sbp-mrc-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px}
.sbp-mrc-b.t b{color:#c9a8ff}
.sbp-mrc-b[disabled]{opacity:.45;cursor:default}
.sbp-mrc-b[disabled]:hover{background:#2a2a2f}
.sbp-mrc-b{border:0;border-radius:16px;padding:18px 12px;background:#2a2a2f;color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px;align-items:center}
.sbp-mrc-b:hover{background:#34343a}
.sbp-mrc-b b{font-size:22px}
.sbp-mrc-b span{font-size:14px;color:#a9a9b3}
.sbp-mrc-b.e b{color:#86DE76}
.sbp-mrc-b.h b{color:#ff9d6b}
.sbp-mrc .sbp-b{margin:0 auto}

.sbp-mr{position:absolute;inset:0;z-index:7;overflow:hidden;display:grid;place-items:center;cursor:default;color:#fff;
  background:radial-gradient(ellipse at 50% 45%,#3a1677 0,#1d0a42 45%,#08020f 100%);animation:sbp-in .45s ease-out both}
.sbp-mr.out{animation:sbp-out .3s ease-in both}
@keyframes sbp-in{from{opacity:0}to{opacity:1}}
@keyframes sbp-out{to{opacity:0}}
.sbp-mr .st{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;background:#fff;box-shadow:0 0 6px 2px rgba(210,180,255,.8);opacity:0;animation:sbp-tw var(--d) ease-in-out var(--w) infinite}
@keyframes sbp-tw{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:1;transform:scale(1)}}
.sbp-mr .ring{position:absolute;left:50%;top:44%;width:30vmin;height:30vmin;margin:-15vmin 0 0 -15vmin;border-radius:50%;border:.5vmin solid rgba(190,150,255,.55);opacity:0;animation:sbp-ring 1.8s ease-out infinite}
.sbp-mr .ring:nth-child(2){animation-delay:.6s}.sbp-mr .ring:nth-child(3){animation-delay:1.2s}
@keyframes sbp-ring{0%{transform:scale(.9);opacity:.9}100%{transform:scale(3.2);opacity:0}}
.sbp-mr .orb{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;transition:transform .5s cubic-bezier(.5,-0.4,.4,1.4),opacity .4s}
.sbp-mr .ball{position:relative;width:30vmin;height:30vmin;border-radius:50%;overflow:hidden;
  background:radial-gradient(circle at 34% 28%,#fff 0,#eadbff 7%,#a77bff 26%,#5a24c4 55%,#22094f 100%);
  box-shadow:0 0 6vmin 1.5vmin rgba(160,110,255,.65),inset 0 -2vmin 4vmin rgba(0,0,0,.45);animation:sbp-glow 1.1s ease-in-out infinite alternate}
@keyframes sbp-glow{from{box-shadow:0 0 4vmin 1vmin rgba(160,110,255,.5),inset 0 -2vmin 4vmin rgba(0,0,0,.45)}to{box-shadow:0 0 10vmin 3vmin rgba(200,150,255,.85),inset 0 -2vmin 4vmin rgba(0,0,0,.45)}}
.sbp-mr .mist{position:absolute;inset:-30%;background:conic-gradient(from 0deg,transparent 0,rgba(255,255,255,.55) 12%,transparent 25%,rgba(255,170,240,.45) 42%,transparent 55%,rgba(150,220,255,.5) 72%,transparent 85%);filter:blur(2.2vmin);mix-blend-mode:screen;animation:sbp-spin 2.2s linear infinite}
.sbp-mr .mist.b{animation-duration:3.4s;animation-direction:reverse;opacity:.7}
@keyframes sbp-spin{to{transform:rotate(360deg)}}
.sbp-mr .shine{position:absolute;left:18%;top:12%;width:26%;height:16%;border-radius:50%;background:rgba(255,255,255,.7);filter:blur(.8vmin);transform:rotate(-30deg)}
.sbp-mr .base{width:20vmin;height:6vmin;margin-top:-1.4vmin;background:linear-gradient(#5b3a1e,#2e1a0b);clip-path:polygon(14% 0,86% 0,100% 100%,0 100%);border-radius:0 0 1vmin 1vmin}
.sbp-mr .say{position:absolute;left:0;right:0;top:74%;text-align:center;font-size:5.4vmin;font-weight:600;letter-spacing:.06em;color:#e3d2ff;text-shadow:0 0 2vmin rgba(180,130,255,.9);transition:opacity .3s}
.sbp-mr .say i{font-style:normal;animation:sbp-dot 1.2s infinite}
.sbp-mr .say i:nth-child(2){animation-delay:.2s}.sbp-mr .say i:nth-child(3){animation-delay:.4s}
@keyframes sbp-dot{0%,100%{opacity:.15}50%{opacity:1}}
.sbp-mr .flash{position:absolute;left:50%;top:44%;width:10vmin;height:10vmin;margin:-5vmin 0 0 -5vmin;border-radius:50%;background:#fff;opacity:0;pointer-events:none}
.sbp-mr .res{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%) scale(.6);opacity:0;text-align:center;pointer-events:none}
.sbp-mr .res .n{font-size:13vmin;font-weight:800;line-height:1.05;text-shadow:0 0 4vmin rgba(180,130,255,.95),0 .6vmin 0 rgba(0,0,0,.35)}
.sbp-mr .res .o{margin-top:1.6vmin;font-size:4.6vmin;color:#d8c6ff}
.sbp-mr .res .tap{margin-top:5vmin;font-size:2.6vmin;color:#a48fd0;letter-spacing:.05em}
.sbp-mr.res-on{cursor:pointer}
.sbp-mr.res-on .ring{animation:none;opacity:0}
.sbp-mr.res-on .orb{transform:translate(-50%,-50%) scale(.2);opacity:0}
.sbp-mr.res-on .say{opacity:0}
.sbp-mr.res-on .flash{animation:sbp-flash .7s ease-out both}
.sbp-mr.res-on .res{animation:sbp-pop .55s cubic-bezier(.3,1.6,.5,1) .12s both}
@keyframes sbp-flash{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(30)}}
@keyframes sbp-pop{to{opacity:1;transform:translateY(-50%) scale(1)}}
.sbp-mr.win{background:radial-gradient(ellipse at 50% 50%,#4a2a00 0,#2a1050 50%,#08020f 100%)}
.sbp-mr.win .res .n{color:#FFD24A;text-shadow:0 0 5vmin rgba(255,200,60,.9),0 .6vmin 0 rgba(0,0,0,.35)}
.sbp-mr.win .st{background:#FFE58A;box-shadow:0 0 8px 3px rgba(255,210,90,.9)}
.sbp-mr.win .st{animation-duration:calc(var(--d) * .5)}
.sbp-mr .mr-cancel{position:absolute;left:50%;bottom:5vmin;transform:translateX(-50%);background:rgba(255,255,255,.12);color:#e9dcff}
.sbp-mr .mr-cancel:hover{background:rgba(255,255,255,.2)}

/* Teacher's Choice picker (teacher console window) */
.sbp.sbp-pick{background:#141417;display:flex;flex-direction:column;z-index:300}
.sbp-pk-top{display:flex;align-items:center;gap:12px;padding:12px 18px;color:#f2f2f4;font-size:17px}
.sbp-pk-top .grow{flex:1}
.sbp-pk-top b{color:#c9a8ff}
.sbp-pk-top .ico{color:#c9a8ff}
.sbp-pk-note{color:#9a9aa3;font-size:14px}
.sbp-pk-stage{position:relative;flex:1;min-height:0;margin:0 18px;border-radius:12px;overflow:hidden;background:#fff}
.sbp-pk-foot{display:flex;align-items:center;gap:8px;padding:12px 18px;color:#f2f2f4}
.sbp-pk-count{flex:1;text-align:center;color:#bdbdc6;font-size:16px}
.sbp-pick .sbp-b[disabled]{opacity:.4;cursor:default}
.sbp-pick .sb-it.pk-dim{opacity:.35}

/* Light look (v1.88): the editor's light neutrals (#FFF panel, #F1F1F4 pills, #1B1B19 ink) */
.sbp-lt .sbp-gal,.sbp-lt .sbp-bar,.sbp-lt .sbp-mrc-card{background:#fff;color:#1b1b19;box-shadow:0 10px 36px rgba(0,0,0,.2)}
.sbp-lt .sbp-ib,.sbp-lt .sbp-b,.sbp-lt .sbp-mrc-b,.sbp-lt .sbp-search{background:#f1f1f4;color:#1b1b19}
.sbp-lt .sbp-ib:hover,.sbp-lt .sbp-b:hover,.sbp-lt .sbp-mrc-b:hover{background:#e7e7ec}
.sbp-lt .sbp-b.go{background:#F5B700;color:#111}.sbp-lt .sbp-b.go:hover{background:#ffc928}
.sbp-lt .sbp-b.mr{background:#6d3fd1;color:#fff}.sbp-lt .sbp-b.mr:hover{background:#7f52e0}
.sbp-lt .sbp-filt{border-bottom-color:#ebebef}
.sbp-lt .sbp-chip{border-color:#dedee4;color:#4a4944}
.sbp-lt .sbp-chip.on{background:#1b1b19;color:#fff;border-color:#1b1b19}
.sbp-lt .sbp-tier{background:#e7e7ec;color:#4a4944}
.sbp-lt .sbp-sep,.sbp-lt .sbp-bsep{background:#dedee4}
.sbp-lt .sbp-search{color:#6b6a64}.sbp-lt .sbp-search input{color:#1b1b19}
.sbp-lt .sbp-sec{color:#6b6a64}.sbp-lt .sbp-sec b{color:#8a6d00}
.sbp-lt .sbp-card{border-color:#dedee4;background:#f7f7f8}
.sbp-lt .sbp-card:hover{background:#ececf0;border-color:#c9c9d1}
.sbp-lt .sbp-card .q{color:#4a4944}.sbp-lt .sbp-card .m{color:#6b6a64}
.sbp-lt .sbp-msg{color:#6b6a64}
.sbp-lt .sbp-b.tg{background:transparent;border-color:#dedee4;color:#6b6a64}
.sbp-lt .sbp-b.tg.on{background:#1b1b19;border-color:#1b1b19;color:#fff}
.sbp-lt .sbp-mrc-card p{color:#4a4944}.sbp-lt .sbp-mrc-b span{color:#6b6a64}
.sbp-lt .sbp-mrc-b.t b{color:#6d3fd1}.sbp-lt .sbp-mrc-b.e b{color:#1c7a10}.sbp-lt .sbp-mrc-b.h b{color:#c2410c}
.sbp-lt .sbp-mrc-b[disabled]:hover{background:#f1f1f4}
.sbp-lt .sbp-tab,.sbp-lt.sbp.bar-on .sbp-tab{background:rgba(30,30,34,.28)}
.sbp.sbp-lt.sbp-pick{background:#f1f1f4}
.sbp-lt .sbp-pk-top,.sbp-lt .sbp-pk-foot{color:#1b1b19}
.sbp-lt .sbp-pk-top b,.sbp-lt .sbp-pk-top .ico{color:#6d3fd1}
.sbp-lt .sbp-pk-note{color:#6b6a64}.sbp-lt .sbp-pk-count{color:#4a4944}
@media (prefers-reduced-motion: reduce){.sbp-mr *,.sbp-mr{animation:none !important;transition:none !important}.sbp-mr.res-on .res{opacity:1;transform:translateY(-50%)}.sbp-mr .st{opacity:.6}}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { id:'sbp-css', textContent:CSS }));

// Only in the teacher console's replica (dual.js adds it to REP_CSS): Reveal answer pressed there marks the answer for the teacher alone.
const REP_CSS = `.sbp.mind .sb-it.mr-peek{outline:.24em dashed #F5B700;outline-offset:.14em;box-shadow:0 0 0 .2em rgba(245,183,0,.35)}`;

/* ---------------- loading the builders ---------------- */
let LIST = null, loading = null;
async function loadList(force){
  if(LIST && !force) return LIST;
  if(loading) return loading;
  loading = (async () => {
    const c = C();
    let out;
    if(c && c.PUPIL && window.SVDual && SVDual.link && SVDual.link.sbList) out = await SVDual.link.sbList();
    else {
      const dir = c && c.FsStore && c.FsStore.dir;
      if(!dir) throw new Error('The Slideshow Viewer folder isn\'t connected.');
      out = await listBuilders(dir);
    }
    LIST = out.map(x => Object.assign(x, { doc:K.normalise(x.doc) }));
    if(window.SBGrammar) await SBGrammar.load(); // v1.58: grammar-rules.json is re-read with the list
    return LIST;
  })();
  try{ return await loading; } finally { loading = null; }
}

/* ---------------- gallery ---------------- */
let gal = null; // { back, card, f:{ q, lang, year, term, tier }, err }
function lessonYear(){
  const h = H(), c = C(), l = h && h.lesson;
  const k = l && c && c.themeKey ? c.themeKey(l) : null; // the theme's year (Design → Themes, or the year folder), else the label's
  return ['7', '8', '9', '10', '11'].includes(k) ? Number(k) : l && c && c.yearOf ? c.yearOf(l.label) : null;
}
// v1.64: French or Spanish from the lesson's class code (Fr / Sp); Both if it has neither.
function lessonLang(){ const h = H(); const l = h && h.lesson; return l ? langOf(l.label) : ''; }
// opts (v1.46, Activities): { year, lang, onPick(x), onCancel() } = choose a builder instead of presenting it.
function open(opts){
  opts = opts && typeof opts === 'object' && !(opts instanceof Event) ? opts : {};
  closeGallery();
  const back = el('div', 'sbp-back' + LT()), card = el('div', 'sbp-gal');
  back.appendChild(card); document.body.appendChild(back);
  back.addEventListener('pointerdown', e => { if(e.target === back) closeGallery(); });
  const y = opts.year != null ? opts.year : lessonYear();
  const lang = opts.lang != null ? opts.lang : lessonLang();
  gal = { back, card, f:{ year:YEARS.includes(y) ? y : null, lang:LANGS[lang] ? lang : '', term:'', tier:'', q:'' }, err:'', busy:true, onPick:opts.onPick || null, onCancel:opts.onCancel || null };
  card.addEventListener('click', onGalClick);
  card.addEventListener('input', e => { if(e.target.matches('[data-q]')){ gal.f.q = e.target.value; paintBody(); } });
  paintGallery();
  loadList().then(() => { if(gal){ gal.busy = false; paintGallery(); } }).catch(e => { if(gal){ gal.busy = false; gal.err = e.message || String(e); paintGallery(); } });
}
function closeGallery(){ if(gal){ const g = gal; gal = null; g.back.remove(); if(g.onCancel && !g.picked) g.onCancel(); } }
const filtered = () => filterBuilders(LIST, gal.f);
function paintGallery(){
  if(!gal) return;
  const r = filterRows(LIST, gal.f, { chip:'sbp-chip', sep:'sbp-sep' });
  gal.card.innerHTML = `<div class="sbp-gh">${icon('sb')}<h2>${gal.onPick ? 'Choose a sentence builder' : 'Sentence Builders'}</h2>
      <button class="sbp-ib" data-a="refresh" title="Refresh">${icon('refresh')}</button>
      <button class="sbp-ib" data-a="close" title="Close">${icon('x')}</button></div>
    <div class="sbp-filt">
      <div class="sbp-frow">${r.top}<label class="sbp-search">${icon('search')}<input type="text" data-q placeholder="Search everything" value="${esc(gal.f.q)}"></label></div>
      <div class="sbp-frow">${r.terms}</div>
      ${r.tiers ? `<div class="sbp-frow">${r.tiers}</div>` : ''}
    </div><div class="sbp-gb"></div>`;
  paintBody();
}
function paintBody(){
  const body = gal && $('.sbp-gb', gal.card); if(!body) return;
  if(gal.busy){ body.innerHTML = `<div class="sbp-msg">Loading…</div>`; return; }
  if(gal.err){ body.innerHTML = `<div class="sbp-msg">Couldn't read the Sentence Builders folder.<br>${esc(gal.err)}</div>`; return; }
  if(!LIST.length){ body.innerHTML = `<div class="sbp-msg">No sentence builders yet. Make them in <b>Settings → Sentence builders</b>.</div>`; return; }
  const items = filtered();
  if(!items.length){ body.innerHTML = `<div class="sbp-msg">${esc(emptyText(gal.f))}<br><button class="sbp-chip" data-fclear>Show everything</button></div>`; return; }
  const now = currentTerm(), order = [now].concat(TERMS.filter(t => t !== now));
  let h = '';
  YEARS.forEach(y => {
    const yi = items.filter(x => x.loc.year === y); if(!yi.length) return;
    order.forEach(t => {
      const ti = yi.filter(x => x.loc.term === t).sort(byTitle); if(!ti.length) return;
      h += `<div class="sbp-sec">Year ${y} · ${esc(t.replace(/^\d - /, ''))}${t === now && t !== 'Other' ? '<b>this half-term</b>' : ''}</div><div class="sbp-cards">`
        + ti.map(x => { const d = x.doc, k = LIST.indexOf(x);
          return `<button class="sbp-card" data-open="${k}"><span class="t">${esc(displayTitle(d))}</span>${d.q.tl ? `<span class="q">${esc(d.q.tl)}</span>` : ''}<span class="m"><span class="sbp-lang ${d.lang}">${LANGS[d.lang].short}</span>${hasTier(x.loc.year) && d.tier ? `<span class="sbp-tier">${TIERS[d.tier]}</span>` : ''}${d.cols.length} column${d.cols.length === 1 ? '' : 's'}</span></button>`; }).join('')
        + '</div>';
    });
  });
  body.innerHTML = h;
}
function onGalClick(e){
  const b = e.target.closest('button'); if(!b || !gal) return;
  if(b.dataset.a === 'close') return closeGallery();
  if(b.dataset.a === 'refresh'){ gal.busy = true; gal.err = ''; paintBody(); loadList(true).then(() => { if(gal){ gal.busy = false; paintGallery(); } }).catch(er => { if(gal){ gal.busy = false; gal.err = er.message; paintGallery(); } }); return; }
  if(applyFilter(gal.f, b)) return paintGallery();
  if(b.dataset.open !== undefined){ const x = LIST[+b.dataset.open]; if(x){ const g = gal; g.picked = true; closeGallery(); if(g.onPick) g.onPick(x); else present(x); } }
}

/* ---------------- presenter ---------------- */
let P = null; // { x, d, root, scale, show:{tl,en,say}, canSay, hl:[Map key→slot], hid:Set, rand:bool, busy, barT, lp }
const ikey = (c, g, i) => `${c}-${g}-${i}`;
// (v1.59) Joined columns are one unit: one random pick, one Mindreader column, one Teacher's Choice tap, one title hide.
// A unit is its column indices (from sb-core's unitsOf); the first index stands for the unit in the Mindreader and picker maps.
const unitOf = (d, c) => unitsOf(d).find(u => u.includes(c)) || [c];
const colKeysOf = (d, c) => { const col = d.cols[c]; if(!col) return []; const out = []; col.groups.forEach((g, gi) => g.forEach((it, ii) => out.push(ikey(c, gi, ii)))); return out; };
const unitKeysOf = (d, c) => unitOf(d, c).flatMap(cc => colKeysOf(d, cc));
function present(x){
  closePresenter();
  const d = x.doc;
  const anyPhon = d.cols.some(c => c.groups.some(g => g.some(it => itemHasPhon(it))));
  const canSay = hasSay(d) || anyPhon || d.cols.some(c => c.groups.some(g => g.some(it => (it.marks || []).some(m => m.c === 's'))));
  const root = el('div', 'sbp' + LT());
  root.innerHTML = `<div class="sbp-scale"></div><button class="sbp-tab" data-a="bar" title="Tools">${icon('up')}</button><div class="sbp-bar" hidden></div>`;
  document.body.appendChild(root);
  P = { x, d, root, scale:$('.sbp-scale', root), show:{ tl:true, en:true, say:canSay && !hasSay(d) && !anyPhon }, canSay, fits:{}, auto:{}, size:null, fit:null, hl:d.cols.map(() => new Map()), hid:new Set(), rand:false, busy:false, barT:null, lp:null, mr:null, chooser:null, pp:null };
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onDown);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => root.addEventListener(t, cancelLP));
  root.addEventListener('pointermove', e => { if(P && P.lp && Math.hypot(e.clientX - P.lp.x, e.clientY - P.lp.y) > 12) cancelLP(); });
  draw(); paintBar();
  // Work out the one-language layouts shortly after opening, so switching a language off mid-lesson is instant.
  setTimeout(() => { if(!P || P.d !== d || P.busy) return; const say = P.show.say && hasSay(d); fitFor(say, 'tl'); fitFor(say, 'en'); }, 700);
}
function closePresenter(){ if(!P) return; clearTimeout(P.barT); cancelLP(); endRound(); closePhon(); P.root.remove(); P = null; }
function closeAll(){ closeGallery(); closePresenter(); }

// Lay the builder out for 16:9 (re-fitted when pronunciation lines come and go, or one language is switched off)
// and scale it to the window. Fits are kept per combination (P.fits) so switching back is instant.
// The size Auto picks, with no + / − (P.auto, cached per combination).
function autoFit(say, only){
  const key = (say ? 's' : '') + (only || 'both');
  if(!P.auto[key]){
    const d = P.d, paper = PAPERS.slide;
    if(!only) P.auto[key] = fitPaper(d, paper, { say });
    else {
      // English only drops the pronunciation lines, so its floor is the two-language size without them.
      const base = autoFit(only === 'en' ? false : say, null), f = fitPaper(d, paper, { say:only === 'en' ? false : say, only, head:base.L.font, floor:base.L.font });
      P.auto[key] = f.ok && f.L.font > base.L.font ? Object.assign(f, { only, head:base.L.font }) : null;
    }
    clearMeasure();
  }
  return P.auto[key];
}
// v1.60 font size +/−: P.size is the two-language text size the teacher picked (null = Auto). A one-language view keeps
// its Auto bonus over the two-language size (one-language Auto size minus two-language Auto size).
function fitFor(say, only){
  if(P.size == null) return autoFit(say, only);
  const key = (say ? 's' : '') + (only || 'both') + '@' + P.size;
  if(!P.fits[key]){
    const d = P.d, paper = PAPERS.slide;
    if(!only) P.fits[key] = fitPaper(d, paper, { say, hi:P.size });
    else {
      const s1 = only === 'en' ? false : say, one = autoFit(s1, only), bonus = one ? one.L.font - autoFit(s1, null).L.font : 0;
      const base = fitFor(s1, null), f = fitPaper(d, paper, { say:s1, only, head:base.L.font, floor:base.L.font, hi:P.size + bonus });
      P.fits[key] = f.ok && f.L.font > base.L.font ? Object.assign(f, { only, head:base.L.font }) : null;
    }
    clearMeasure();
  }
  return P.fits[key];
}
// + / −: one pt per press from the two-language size on screen. Stops at the paper's smallest size and at the
// largest size that still fits. Not while a random sentence is shuffling.
function resize(dir){
  if(P.busy) return;
  const say = P.show.say && hasSay(P.d), base = fitFor(say, null).L.font, want = base + dir;
  if(want > PAPERS.slide.one) return toast('Largest text size.');
  if(want < PAPERS.slide.min) return toast('Smallest text size.');
  P.size = want;
  const f = fitFor(say, null);
  if(!f.ok || f.L.font < want){
    P.size = f.ok && f.L.font > base ? f.L.font : base;
    if(dir > 0) toast('That is the largest size that fits.');
  }
  draw(); paintBar();
}
function draw(){
  closePhon();
  const d = P.d, paper = PAPERS.slide, say = P.show.say && hasSay(d);
  const only = P.show.tl && P.show.en ? null : P.show.tl ? 'tl' : 'en';
  // One language: the bigger re-fit if there is one, else the two-language layout with the other line blanked.
  const one = only && fitFor(say, only);
  P.fit = one || fitFor(say, null);
  P.scale.innerHTML = sheetHTML(d, paper, P.fit.L, 'both', one ? { fill:true, say:only === 'en' ? false : say, only, head:one.head } : { fill:true, say });
  // With Pronunciation off, a silent letter takes the colour of the letters just before it (c'étai|t stays purple).
  $$('.sb-it .c-s', P.scale).forEach(s => { const p = s.previousSibling, m = p && p.nodeType === 1 && /\bc-([rbgp])\b/.exec(p.className); if(m) s.dataset.u = m[1]; });
  decorate(); rescale();
}
function rescale(){
  if(!P) return;
  const W = PAPERS.slide.w * MM, Hh = PAPERS.slide.h * MM, k = Math.min(innerWidth / W, innerHeight / Hh);
  P.scale.style.transform = `scale(${k})`;
  P.scale.style.left = Math.round((innerWidth - W * k) / 2) + 'px';
  P.scale.style.top = Math.round((innerHeight - Hh * k) / 2) + 'px';
}
// Highlights, hidden items, random picks and language switches as classes on the drawn sheet.
function decorate(){
  const r = P.root;
  r.classList.toggle('no-tl', !P.show.tl);
  r.classList.toggle('no-en', !P.show.en);
  r.classList.toggle('no-sil', !P.show.say);
  r.classList.toggle('rand', P.rand);
  r.classList.toggle('busy', P.busy);
  const m = P.mr, done = m && m.phase === 'done';
  r.classList.toggle('mind', !!m);
  $$('.sb-it', P.scale).forEach(e => {
    const c = +e.dataset.c, k = ikey(c, e.dataset.g, e.dataset.i), slot = P.hl[c] && P.hl[c].get(k);
    e.classList.remove('hl1', 'hl2', 'hl3', 'hl4', 'flick');
    if(slot) e.classList.add('hl' + slot);
    e.classList.toggle('pick', P.rand && !!slot);
    e.classList.toggle('hid', P.hid.has(k));
    // Mindreader: the secret is only ever marked once its column (unit) is known (single item, locked in Easy, or the end).
    const u = unitOf(P.d, c)[0];
    const sec = !!m && m.secret.get(u) === k, known = !!m && (done || m.fixed.has(u) || m.locked.has(u));
    e.classList.toggle('mr-ok', known && sec);
    e.classList.toggle('mr-sel', !!m && !known && m.sel.get(u) === k);
    e.classList.toggle('mr-bad', !!m && m.bad.has(k));
    e.classList.toggle('mr-dim', !!m && (m.off.has(u) || (known && !sec)));
    e.classList.toggle('mr-peek', !!m && m.peek && sec && !known);
  });
  $$('.sb-h[data-c]', P.scale).forEach(th => { const ks = unitKeysOf(P.d, +th.dataset.c); th.classList.toggle('hidc', ks.length > 0 && ks.every(k => P.hid.has(k))); });
}

/* tool bar */
function paintBar(){
  const b = $('.sbp-bar', P.root), on = !b.hidden;
  P.root.classList.toggle('bar-on', on);
  $('.sbp-tab', P.root).innerHTML = icon(on ? 'down' : 'up');
  if(!on) return;
  const L = LANGS[P.d.lang].name, m = P.mr;
  const langs = `<button class="sbp-b tg ${P.show.tl ? 'on' : ''}" data-a="tl">${L}</button>
    <button class="sbp-b tg ${P.show.en ? 'on' : ''}" data-a="en">English</button>
    ${P.canSay ? `<button class="sbp-b tg ${P.show.say ? 'on' : ''}" data-a="say">Pronunciation</button>` : ''}
    <span class="sbp-bsep"></span>
    <button class="sbp-b icn" data-a="smaller" title="Smaller text">A−</button><button class="sbp-b icn" data-a="bigger" title="Bigger text">A+</button>
    <span class="sbp-bsep"></span>`;
  const tail = `<span class="sbp-bsep"></span>
    <button class="sbp-b" data-a="gallery" title="Choose another sentence builder">${icon('sb')}Builders</button>
    <button class="sbp-b icn" data-a="close" title="Close">${icon('x')}</button>`;
  if(m){
    const g = m.guesses, state = m.phase === 'choosing' ? 'choosing…' : m.phase === 'done' ? (m.won ? `read in ${g} guess${g === 1 ? '' : 'es'}` : 'answer shown') : `guess ${g + 1}`;
    const label = (m.src === 'teacher' ? "Teacher's Choice" + (m.mode ? ' · ' : '') : '') + (m.mode ? (m.mode === 'easy' ? 'Easy' : 'Hard') : '');
    b.innerHTML = langs + `<span class="sbp-mrtag">${icon('ball')}Mindreader · ${label} <small>${state}</small></span>
      ${m.phase === 'done' ? '' : `<button class="sbp-b" data-a="mr-reveal">${icon('key')}Reveal answer</button>`}
      <button class="sbp-b ${m.phase === 'done' ? 'mr' : ''}" data-a="mr-new">${icon('shuffle')}New secret</button>
      <button class="sbp-b" data-a="mr-exit">${icon('x')}Exit Mindreader</button>` + tail;
    return;
  }
  b.innerHTML = langs + `<button class="sbp-b go" data-a="random">${icon('dice')}Random sentence</button>
    <button class="sbp-b mr" data-a="mind">${icon('ball')}Mindreader</button>
    <button class="sbp-b" data-a="clear">${icon('eraser')}Clear</button>
    ${P.hid.size ? `<button class="sbp-b" data-a="showall">${icon('eye')}Show all (${P.hid.size})</button>` : ''}` + tail;
}
function setBar(on){ const b = $('.sbp-bar', P.root); b.hidden = !on; paintBar(); bump(); }
// The bar hides itself 12 s after it was last used.
function bump(){ clearTimeout(P.barT); if(!$('.sbp-bar', P.root).hidden) P.barT = setTimeout(() => { if(P) setBar(false); }, 12000); }

function onClick(e){
  if(!P) return;
  if(P.skipClick){ P.skipClick = false; return; }
  if(P.chooser && e.target === P.chooser) return closeChooser();
  const b = e.target.closest('[data-a]');
  if(b) return act(b.dataset.a);
  // Respelling pop-out: any tap closes it; a tap on another chunk with respellings opens that one instead.
  if(P.pp){ if(e.target.closest('.sbp-pp')) return closePhon(); const was = P.pp.key, it0 = e.target.closest('.sb-it'); closePhon();
    if(!it0 || ikey(+it0.dataset.c, it0.dataset.g, it0.dataset.i) === was) return;
    if(!phonTap(it0)) return; return; }
  if(P.busy) return;
  if(P.mr){ const it = e.target.closest('.sb-it'); if(it) mindTap(+it.dataset.c, ikey(+it.dataset.c, it.dataset.g, it.dataset.i)); return; }
  const th = e.target.closest('.sb-h[data-c]');
  if(th) return toggleColumn(+th.dataset.c);
  const it = e.target.closest('.sb-it');
  if(it && phonTap(it)) return;
  if(it) return tapItem(+it.dataset.c, ikey(+it.dataset.c, it.dataset.g, it.dataset.i));
}
/* respelling pop-out (v1.77) */
// With Pronunciation on, a chunk that has respellings shows them instead of highlighting. Returns true if it did.
function phonTap(itEl){
  if(!P || !P.show.say || P.mr || P.busy || !P.show.tl) return false;
  const c = +itEl.dataset.c, g = +itEl.dataset.g, i = +itEl.dataset.i, k = ikey(c, g, i);
  const item = P.d.cols[c] && P.d.cols[c].groups[g] && P.d.cols[c].groups[g][i];
  if(!item || P.hid.has(k) || !itemHasPhon(item)) return false;
  showPhon(itEl, item, k); return true;
}
function showPhon(itEl, item, k){
  closePhon();
  // Words in order; a respelled word gets its respelling under it. Punctuation stays with the word it touches.
  const shift = (s0, len) => (item.marks || []).map(m => Object.assign({}, m, { s:m.s - s0, e:m.e - s0 })).filter(m => m.e > 0 && m.s < len);
  const rt = (t, s0) => richText(t, shift(s0, t.length), 'tl');
  const toks = []; let joined = false;
  phonSegments(item).forEach(x => {
    if(x.p){ if(joined && toks.length && !toks[toks.length - 1].p){ const last = toks.pop(); toks.push({ t:last.t + rt(x.t, x.s), p:x.p }); } else toks.push({ t:rt(x.t, x.s), p:x.p }); joined = true; return; }
    let pos = x.s;
    x.t.split(/(\s+)/).forEach(part => {
      if(!part){ return; }
      if(/^\s+$/.test(part)){ joined = false; pos += part.length; return; }
      const h = rt(part, pos); pos += part.length;
      if(joined && toks.length) toks[toks.length - 1].t += h; else toks.push({ t:h });
      joined = true;
    });
  });
  const body = toks.map(x => x.p ? `<span class="pp-w"><span class="pp-t">${x.t}</span><span class="pp-r">${esc(x.p)}</span></span>` : `<span class="pp-w"><span class="pp-t">${x.t}</span></span>`).join('');
  const box = el('div', 'sbp-pp', `<div class="pp-line">${body}</div>${P.show.en && item.en ? `<div class="pp-en">${esc(item.en)}</div>` : ''}`);
  P.root.appendChild(box); itEl.classList.add('pp-on');
  // Above the chunk if there's room, otherwise below; kept inside the screen.
  const r = itEl.getBoundingClientRect(), b = box.getBoundingClientRect(), gap = Math.max(10, innerHeight * 0.015);
  const above = r.top - b.height - gap > 8;
  box.style.left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - b.width / 2, innerWidth - b.width - 8))) + 'px';
  box.style.top = Math.round(above ? r.top - b.height - gap : Math.min(r.bottom + gap, innerHeight - b.height - 8)) + 'px';
  P.pp = { el:box, key:k, item:itEl };
}
function closePhon(){ if(P && P.pp){ P.pp.el.remove(); if(P.pp.item) P.pp.item.classList.remove('pp-on'); P.pp = null; } }
// Action buttons put the bar away once pressed; the language / Pronunciation switches leave it open.
const HIDE_BAR = new Set(['random', 'mind', 'mr-easy', 'mr-hard', 'mr-teach', 'mr-cancel', 'mr-reveal', 'mr-new', 'mr-exit', 'clear', 'showall']);
function act(a){
  doAct(a);
  if(P && HIDE_BAR.has(a) && !$('.sbp-bar', P.root).hidden) setBar(false);
}
function doAct(a){
  bump();
  switch(a){
    case 'bar': return setBar($('.sbp-bar', P.root).hidden);
    case 'tl': case 'en': {
      const other = a === 'tl' ? 'en' : 'tl';
      if(P.show[a] && !P.show[other]) return toast('Keep one language showing.');
      P.show[a] = !P.show[a]; draw(); return paintBar();
    }
    case 'say': P.show.say = !P.show.say; draw(); if(P.show.say && P.d.cols.some(c => c.groups.some(g => g.some(it => itemHasPhon(it))))) toast('Tap a chunk to see its pronunciation.'); return paintBar();
    case 'bigger': return resize(1);
    case 'smaller': return resize(-1);
    case 'random': if(P.mr) return; return randomSentence();
    case 'mind': return mindChoose();
    case 'mr-easy': case 'mr-hard': return startMind(a === 'mr-easy' ? 'easy' : 'hard');
    case 'mr-cancel': return closeChooser();
    case 'mr-go': return mindNext();
    case 'mr-teach': return startTeacher();
    // Pressed on the teacher screen's replica (dual.js replays it with SVDual.fromDesk set): marked there only.
    case 'mr-reveal': return window.SVDual && SVDual.fromDesk ? mindPeek() : mindReveal();
    case 'mr-new': return newSecret();
    case 'mr-exit': return mindExit();
    case 'clear': if(P.busy) return; if(P.mr) return mindClearGuess(); P.hl = P.d.cols.map(() => new Map()); P.rand = false; P.hid.clear(); decorate(); return paintBar();
    case 'showall': P.hid.clear(); decorate(); return paintBar();
    case 'gallery': closePresenter(); return open();
    case 'close': return closePresenter();
  }
}
function tapItem(c, k){
  if(P.hid.has(k)){ P.hid.delete(k); decorate(); return paintBar(); }
  if(P.rand){ P.rand = false; } // the random sentence's picks stay highlighted
  const m = P.hl[c];
  if(m.has(k)) m.delete(k);
  else {
    const used = new Set(m.values()), slot = [1, 2, 3, 4].find(s => !used.has(s));
    if(!slot) return toast('Up to four highlights in a column. Tap one to clear it.');
    m.set(k, slot);
  }
  decorate();
}
function toggleColumn(c){
  const keys = unitKeysOf(P.d, c); if(!keys.length) return;
  const all = keys.every(k => P.hid.has(k));
  keys.forEach(k => { if(all) P.hid.delete(k); else { P.hid.add(k); P.hl[+k.split('-')[0]].delete(k); } });
  decorate(); paintBar();
}
// Long-press an item to hide it.
function onDown(e){
  if(!P || P.busy || P.mr) return;
  const it = e.target.closest('.sb-it'); if(!it || it.classList.contains('hid')) return;
  cancelLP();
  const c = +it.dataset.c, k = ikey(c, it.dataset.g, it.dataset.i);
  P.lp = { x:e.clientX, y:e.clientY, t:setTimeout(() => { if(!P) return; P.lp = null; P.hid.add(k); P.hl[c].delete(k); P.skipClick = true; decorate(); paintBar(); }, 550) };
}
function cancelLP(){ if(P && P.lp){ clearTimeout(P.lp.t); P.lp = null; } }

/* random sentence */
// Items in column c that a sentence in group (row) g can use; a column with one group spans every row. Hidden items left out.
function cands(c, g){
  const d = P.d, G = groupCount(d), col = d.cols[c], gi = col.groups.length === 1 && G > 1 ? 0 : g;
  return (col.groups[gi] || []).map((it, ii) => ikey(c, gi, ii)).filter(k => !P.hid.has(k));
}
// Items a unit (one column, or joined columns) can use in group g.
const ucands = (u, g) => u.flatMap(c => cands(c, g));
// A group (row) where the most units have something to pick from (null if none).
function bestGroup(){
  const d = P.d, G = groupCount(d), units = unitsOf(d);
  const scores = Array.from({ length:G }, (_, g) => units.reduce((n, u) => n + (ucands(u, g).length ? 1 : 0), 0)), best = Math.max(0, ...scores);
  return best ? pick(scores.map((s, i) => s === best ? i : -1).filter(i => i >= 0)) : null;
}
function randomSentence(){
  if(P.busy) return;
  const d = P.d, g = bestGroup();
  if(g == null) return toast('Nothing to pick from: show some items first.');
  // One pick per unit: joined columns share one pick, drawn from both halves.
  const units = unitsOf(d).map(u => ({ u, keys:ucands(u, g) })).filter(x => x.keys.length);
  P.hl = d.cols.map(() => new Map()); P.rand = true; P.busy = true; decorate();
  const elOf = k => { const [c, gg, i] = k.split('-'); return $(`.sb-it[data-c="${c}"][data-g="${gg}"][data-i="${i}"]`, P.scale); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let left = units.length;
  units.forEach((x, n) => {
    const fin = pick(x.keys), fc = +fin.split('-')[0];
    const settle = () => {
      if(!P) return;
      clearInterval(x.iv); x.u.forEach(c => $$(`.sb-it.flick[data-c="${c}"]`, P.scale).forEach(e => e.classList.remove('flick')));
      P.hl[fc].set(fin, 1); const e = elOf(fin); if(e) e.classList.add('hl1', 'pick');
      if(--left === 0){ P.busy = false; decorate(); }
    };
    if(reduce || x.keys.length === 1){ setTimeout(settle, reduce ? 0 : 300 + n * 200); return; }
    let last = null;
    x.iv = setInterval(() => {
      if(!P) return clearInterval(x.iv);
      if(last) last.classList.remove('flick');
      const opts = x.keys.length > 1 && last ? x.keys.filter(k => elOf(k) !== last) : x.keys;
      last = elOf(pick(opts)); if(last) last.classList.add('flick');
    }, 85);
    setTimeout(settle, 650 + n * 260);
  });
}

/* ---------------- Mindreader ---------------- */
// P.mr = { src:'app'|'teacher', mode, secret:Map col→key, counted:[col], fixed:Set col (one item: green, not counted), off:Set col (not in the sentence),
//          sel:Map col→key (this guess), locked:Set col (Easy: guessed right), bad:Set key (red flash), peek (answer marked on the teacher screen only),
//          guesses, phase ('choosing' | 'pick' | 'reading' | 'result' | 'done'), won, ov, t }
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const matchWords = n => `${NUMW[n] || n} match${n === 1 ? '' : 'es'}`;
const teacherLinked = () => !!(window.SVDual && SVDual.teacherLinked);
const STARS = () => Array.from({ length:44 }, () => `<span class="st" style="--x:${(rand() * 100).toFixed(1)}%;--y:${(rand() * 100).toFixed(1)}%;--s:${(2 + rand() * 4).toFixed(1)}px;--d:${(1.2 + rand() * 1.8).toFixed(2)}s;--w:${(rand() * 1.5).toFixed(2)}s"></span>`).join('');
const ORB = `<span class="ring"></span><span class="ring"></span><span class="ring"></span>
    <div class="orb"><div class="ball"><span class="mist"></span><span class="mist b"></span><span class="shine"></span></div><div class="base"></div></div>`;

function mindChoose(){
  if(P.busy) return;
  closeChooser();
  const tl = teacherLinked();
  const ov = el('div', 'sbp-mrc', `<div class="sbp-mrc-card">${icon('ball')}<h3>Mindreader</h3>
    <p>A secret sentence is chosen. A pupil guesses it; tap their word in each column.</p>
    <div class="sbp-mrc-row"><button class="sbp-mrc-b e" data-a="mr-easy"><b>Easy</b><span>Correct words turn green</span></button>
    <button class="sbp-mrc-b h" data-a="mr-hard"><b>Hard</b><span>Only the number of matches</span></button>
    <button class="sbp-mrc-b t" data-a="mr-teach" ${tl ? '' : 'disabled'}><b>Teacher's Choice</b><span>${tl ? 'Choose the sentence on the teacher screen' : 'Needs the teacher screen (Dual screen)'}</span></button></div>
    <button class="sbp-b" data-a="mr-cancel">Cancel</button></div>`);
  P.root.appendChild(ov); P.chooser = ov;
}
function closeChooser(){ if(P && P.chooser){ P.chooser.remove(); P.chooser = null; } }

// Which columns count, given the secret: one item showing in the whole column = green from the start, not counted; no secret word = not in the sentence.
// Mindreader works per unit (joined columns count once), keyed by the unit's first column.
function classify(secret){
  const counted = [], fixed = new Set(), off = new Set();
  unitsOf(P.d).forEach(([c]) => {
    if(!secret.has(c)){ off.add(c); return; }
    if(unitKeysOf(P.d, c).filter(k => !P.hid.has(k)).length === 1) fixed.add(c); else counted.push(c);
  });
  return { counted, fixed, off };
}
function newMind(src, mode, secret){
  return Object.assign({ src, mode, secret, sel:new Map(), locked:new Set(), bad:new Set(), peek:false, guesses:0, phase:'pick', won:false, ov:null, t:null }, classify(secret));
}
// Stop whatever round is running (and the teacher screen's picker, if it's waiting).
function endRound(){
  const m = P.mr; if(!m) return;
  clearTimeout(m.t); dropOverlay(m);
  if(m.phase === 'choosing'){ m.phase = 'gone'; try{ SVDual.link.sbPickEnd(); }catch(e){} }
}
function startMind(mode){
  closeChooser(); endRound();
  const d = P.d, g = bestGroup(), secret = new Map();
  if(g != null) unitsOf(d).forEach(u => { const ks = ucands(u, g); if(ks.length) secret.set(u[0], pick(ks)); });
  const m = newMind('app', mode, secret);
  if(!m.counted.length){ P.mr = null; P.busy = false; decorate(); paintBar(); return toast('Mindreader needs a column with more than one word showing.'); }
  P.hl = d.cols.map(() => new Map()); P.rand = false; P.busy = false;
  P.mr = m;
  decorate(); paintBar();
}
// Teacher's Choice: the teacher screen shows the builder to pick the sentence (and Easy / Hard); the panel shows the crystal ball meanwhile.
async function startTeacher(){
  closeChooser(); endRound();
  if(!teacherLinked()){ P.mr = null; P.busy = false; decorate(); paintBar(); return toast("Teacher's Choice needs the teacher screen (Dual screen)."); }
  P.hl = P.d.cols.map(() => new Map()); P.rand = false;
  const m = P.mr = newMind('teacher', null, new Map());
  m.phase = 'choosing'; P.busy = true;
  m.ov = el('div', 'sbp-mr think', `${STARS()}${ORB}<div class="say">Thinking of a sentence<i>.</i><i>.</i><i>.</i></div><button class="sbp-b mr-cancel" data-a="mr-exit">Cancel</button>`);
  P.root.appendChild(m.ov);
  decorate(); paintBar();
  let r;
  try{ r = await SVDual.link.sbPick({ doc:P.d, hid:[...P.hid], say:P.show.say }); }
  catch(e){ if(P && P.mr === m && m.phase === 'choosing'){ m.phase = 'gone'; mindExit(); toast((e && e.message) || 'The teacher screen did not answer.'); } return; }
  if(!P || P.mr !== m || m.phase !== 'choosing') return;
  if(!r){ m.phase = 'gone'; mindExit(); return toast("Teacher's Choice cancelled."); }
  const secret = new Map((r.keys || []).filter(([c, k]) => P.d.cols[c] && unitKeysOf(P.d, c).includes(k) && !P.hid.has(k)));
  const n = newMind('teacher', r.mode === 'hard' ? 'hard' : 'easy', secret);
  if(!n.counted.length){ m.phase = 'gone'; mindExit(); return toast('Mindreader needs a column with more than one word showing.'); }
  dropOverlay(m); P.busy = false;
  P.mr = n;
  decorate(); paintBar();
}
function newSecret(){ const m = P.mr; if(!m) return; if(m.src === 'teacher') startTeacher(); else startMind(m.mode); }
function mindTap(cc, k){
  const m = P.mr, c = unitOf(P.d, cc)[0];
  if(m.phase !== 'pick' || P.hid.has(k) || !m.counted.includes(c) || m.locked.has(c)) return;
  if(m.bad.size) m.bad.clear();
  if(m.sel.get(c) === k) m.sel.delete(c); else m.sel.set(c, k);
  clearTimeout(m.t);
  decorate();
  // Every counting column has a word: read the mind (a short pause so the last tap is seen; a change in the pause cancels it).
  if(m.counted.every(u => m.locked.has(u) || m.sel.has(u))) m.t = setTimeout(() => { if(P && P.mr === m && m.phase === 'pick') mindRead(); }, 600);
}
function mindClearGuess(){ const m = P.mr; if(m.phase !== 'pick') return; clearTimeout(m.t); m.sel.clear(); m.bad.clear(); decorate(); }

function mindRead(){
  const m = P.mr;
  m.phase = 'reading'; P.busy = true; m.guesses++;
  const n = m.counted.filter(c => m.locked.has(c) || m.sel.get(c) === m.secret.get(c)).length;
  m.last = { n, all:n === m.counted.length };
  const ov = el('div', 'sbp-mr', `${STARS()}${ORB}<div class="say">Reading minds<i>.</i><i>.</i><i>.</i></div><span class="flash"></span><div class="res"></div>`);
  ov.dataset.a = 'mr-go';
  P.root.appendChild(ov); m.ov = ov;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  m.t = setTimeout(() => mindResult(m), reduce ? 700 : 3000);
}
function mindResult(m){
  if(!P || P.mr !== m || !m.ov) return;
  m.phase = 'result';
  const { n, all } = m.last, N = m.counted.length, g = m.guesses;
  $('.res', m.ov).innerHTML = all
    ? `<div class="n">Mind read!</div><div class="o">${N === 1 ? 'The match' : `All ${N} matches`} in ${g} guess${g === 1 ? '' : 'es'}</div><div class="tap">Tap to see the sentence</div>`
    : `<div class="n">${matchWords(n)}</div><div class="o">out of ${N}</div><div class="tap">Tap to continue</div>`;
  m.ov.classList.toggle('win', all);
  m.ov.classList.add('res-on');
  if(!all) m.t = setTimeout(() => { if(P && P.mr === m && m.phase === 'result') mindNext(); }, 4000);
}
function dropOverlay(m){ if(!m.ov) return; const o = m.ov; m.ov = null; o.removeAttribute('data-a'); o.classList.add('out'); setTimeout(() => o.remove(), 320); }
// After the result: Easy keeps the right words (green) and flashes the wrong ones red; Hard clears the guess.
function mindNext(){
  const m = P && P.mr; if(!m || m.phase !== 'result') return;
  clearTimeout(m.t); dropOverlay(m); P.busy = false;
  if(m.last.all){ m.phase = 'done'; m.won = true; m.sel.clear(); decorate(); return paintBar(); }
  m.phase = 'pick';
  if(m.mode === 'easy') m.sel.forEach((k, c) => { if(k === m.secret.get(c)) m.locked.add(c); else m.bad.add(k); });
  m.sel.clear(); decorate(); paintBar();
  if(m.bad.size) m.t = setTimeout(() => { if(P && P.mr === m && m.bad.size){ m.bad.clear(); decorate(); } }, 1000);
}
// Reveal answer pressed on the panel: shown to everyone, round over.
function mindReveal(){
  const m = P.mr; if(!m || m.phase === 'done' || m.phase === 'choosing') return;
  clearTimeout(m.t); dropOverlay(m); P.busy = false;
  m.phase = 'done'; m.won = false; m.peek = false; m.sel.clear(); m.bad.clear();
  decorate(); paintBar();
}
// Reveal answer pressed on the teacher screen (the replica): marked there only (REP_CSS), the round carries on. Press again to unmark.
function mindPeek(){
  const m = P.mr; if(!m || m.phase === 'done' || m.phase === 'choosing') return;
  m.peek = !m.peek; decorate();
}
function mindExit(){
  if(!P.mr) return;
  endRound();
  P.mr = null; P.busy = false; decorate(); paintBar();
}

/* ---------------- Teacher's Choice picker (runs in the teacher console window) ----------------
   dual.js: the pupil window asks with rpc 'sbPick' { doc, hid, say } (no time limit); the console calls
   pickOnConsole(), which resolves { mode:'easy'|'hard', keys:[[col, key], …] } or null (Cancel).
   'sbPickEnd' from the pupil window (cancelled there, builder closed) calls cancelPick(). */
let TP = null; // { root, d, hid, sel:Map, need:[col], res, fit }
function pickOnConsole(req){
  cancelPick();
  return new Promise(res => {
    const d = K.normalise(req.doc), hid = new Set(req.hid || []), say = !!req.say && hasSay(d);
    const root = el('div', 'sbp sbp-pick' + (req.say ? '' : ' no-sil') + LT());
    root.innerHTML = `<div class="sbp-pk-top">${icon('ball')}<div class="grow"><b>Teacher's Choice</b> · tap one word in each column for the secret sentence</div><span class="sbp-pk-note">Pupils see the crystal ball until you start.</span></div>
      <div class="sbp-pk-stage"><div class="sbp-scale"></div></div>
      <div class="sbp-pk-foot"><button class="sbp-b" data-k="cancel">Cancel</button><span class="sbp-pk-count"></span>
        <button class="sbp-b go" data-k="easy">Start Easy</button><button class="sbp-b go" data-k="hard">Start Hard</button></div>`;
    document.body.appendChild(root);
    // One choice per unit (joined columns count once); a unit is keyed by its first column.
    const keysOf = c => unitKeysOf(d, c);
    const need = [], sel = new Map();
    unitsOf(d).forEach(([c]) => { const vis = keysOf(c).filter(k => !hid.has(k)); if(vis.length) need.push(c); if(vis.length === 1) sel.set(c, vis[0]); });
    TP = { root, d, hid, sel, need, res, fit:fitPaper(d, PAPERS.slide, { say }) };
    clearMeasure();
    const sc = $('.sbp-scale', root);
    sc.innerHTML = sheetHTML(d, PAPERS.slide, TP.fit.L, 'both', { fill:true, say });
    $$('.sb-it .c-s', sc).forEach(s => { const p = s.previousSibling, m = p && p.nodeType === 1 && /\bc-([rbgp])\b/.exec(p.className); if(m) s.dataset.u = m[1]; });
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if(b){ if(b.disabled) return; if(b.dataset.k === 'cancel') return finishPick(null); return finishPick({ mode:b.dataset.k, keys:[...TP.sel] }); }
      const it = e.target.closest('.sb-it'); if(!it) return;
      const c = unitOf(d, +it.dataset.c)[0], k = ikey(+it.dataset.c, it.dataset.g, it.dataset.i);
      if(TP.hid.has(k)) return;
      if(TP.sel.get(c) === k){ if(keysOf(c).filter(x => !TP.hid.has(x)).length > 1) TP.sel.delete(c); }
      else TP.sel.set(c, k);
      paintPick();
    });
    paintPick(); placePick();
  });
}
function paintPick(){
  if(!TP) return;
  $$('.sb-it', TP.root).forEach(e => {
    const c = unitOf(TP.d, +e.dataset.c)[0], k = ikey(+e.dataset.c, e.dataset.g, e.dataset.i), on = TP.sel.get(c) === k;
    e.classList.toggle('hl1', on);
    e.classList.toggle('hid', TP.hid.has(k));
    e.classList.toggle('pk-dim', TP.sel.has(c) && !on && !TP.hid.has(k));
  });
  const done = TP.need.filter(c => TP.sel.has(c)).length, all = done === TP.need.length;
  $('.sbp-pk-count', TP.root).textContent = all ? 'Sentence chosen: start Easy or Hard' : `${done} of ${TP.need.length} columns chosen`;
  $$('[data-k=easy],[data-k=hard]', TP.root).forEach(b => { b.disabled = !all; });
}
function placePick(){
  if(!TP) return;
  const st = $('.sbp-pk-stage', TP.root), sc = $('.sbp-scale', TP.root), r = st.getBoundingClientRect();
  const W = PAPERS.slide.w * MM, Hh = PAPERS.slide.h * MM, k = Math.min(r.width / W, r.height / Hh);
  sc.style.transform = `scale(${k})`;
  sc.style.left = Math.round((r.width - W * k) / 2) + 'px';
  sc.style.top = Math.round((r.height - Hh * k) / 2) + 'px';
}
function finishPick(v){ if(!TP) return; const t = TP; TP = null; t.root.remove(); t.res(v); }
function cancelPick(){ finishPick(null); }

/* ---------------- keys, resizing, lesson changes ---------------- */

window.addEventListener('keydown', e => {
  if(TP){ e.stopPropagation(); if(e.key === 'Escape'){ e.preventDefault(); cancelPick(); } return; } // the picker on the teacher screen
  if(!P && !gal) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.key === 'F11') return;
  const typing = e.target && e.target.closest && e.target.closest('input,textarea');
  e.stopPropagation(); // the keyboard / clicker don't change slides underneath
  if(typing){ if(e.key === 'Escape'){ e.preventDefault(); closeGallery(); } return; }
  if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown',' ','Enter','Home','End','Backspace'].includes(e.key)) e.preventDefault();
  const m = P && P.mr;
  // The clicker / Space / Enter move on from a Mindreader result.
  if(!gal && m && m.phase === 'result' && ['ArrowRight','ArrowDown','PageDown',' ','Enter','Escape'].includes(e.key)){ e.preventDefault(); mindNext(); return; }
  if(e.key === 'Escape'){
    e.preventDefault();
    if(gal) closeGallery();
    else if(P && P.chooser) closeChooser();
    else if(P && P.pp) closePhon();
    else if(m) mindExit();
    else closePresenter();
    return;
  }
  if(!P || gal) return;
  const k = e.key.toLowerCase();
  if(k === 'r') act('random');
  else if(k === 'c') act('clear');
  else if(k === 'm' && !m) act('mind');
}, true);
window.addEventListener('resize', () => { closePhon(); rescale(); placePick(); });
window.addEventListener('sv:leave', closeAll);
window.addEventListener('sv:present', e => { if(!(e.detail && e.detail.resume)) closeAll(); });

window.SVSentence = { open, close:closeAll, choose:open, list:()=>loadList(true), CSS, REP_CSS, pickOnConsole, cancelPick, get open_(){ return !!(P || gal); }, get state(){ return P; }, reload(){ LIST = null; } };
})();
