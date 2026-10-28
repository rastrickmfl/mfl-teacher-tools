# Build report: MFL Teacher Tools version 1

Date: 2026-10-28. Built from the Web App source folder (read-only; nothing in it was changed) following the build brief.

## Files copied, by folder

| Folder | Files |
|---|---|
| Repo root: application code | 50 (38 JS, 10 CSS, 2 HTML) |
| `Sentence Builders/` | 45 (43 `.sb.json`, `grammar-rules.json`, `EXTRACTOR-RULES.md`) |
| `vendor/` | 6 |
| `Waypoints/` | 8 (PNG) |
| **Total copied from source** | **109** |

Added by the build (not copied from source): `README.md` (new), `NOTICE`, `LICENSES/Apache-2.0.txt`, `Geist-LICENSE.txt` (copied from the Planner root), `NEEDS_REVIEW.md`, `BUILD_REPORT.md`.

## Files and folders excluded or removed

- `Sync/` (all of it), `viewer-data.json`, `viewer-data.json.1.crswap`
- All `Backup ...` folders and `Backup Don't Delete/`
- `Lessons/`, `Lesson Library/`, `Test Lesson.pptx`, `New lesson template.pptx`
- `clipboard-test.html`, `icon-contact-sheet.html`, `icon-contact-sheet.png`
- `Mission Impossible.mp3`, `sounds/alarm.mp3` (the `sounds/` folder)
- `ribbon-redesign-spec.md` (design note, not copied)
- `Waypoints/.Bin/` (1 image) and `Sentence Builders/.Bin/` (3 files): deleted-item bins
- One Spanish sentence builder (Year 8, Autumn 2, "Where do you live") left out because it contains the school's locality; see `NEEDS_REVIEW.md` item 7
- `sw.js`: named in the brief but not present in the source
- Original `README.md`: replaced by a new one

## Edits made, by file

| File | Change |
|---|---|
| `pptx-export.js` | Header comment: staff first name replaced with "the teacher" |
| `year-colours.js` | Header comment: school name removed ("the year-group colours") |
| `tally.js` | Staff surname in a comment and as the Beat the Teacher team label replaced with "the teacher" / "Teacher" (not listed in the brief; see `NEEDS_REVIEW.md` item 6) |
| `app.js` | `SERIES` set to an empty array (code that reads it unchanged); YouTube privacy-mode iframe removed, online videos now open the link in a window; link-opening code at the "Open in window" button left as it was |
| `tools.js` | Alarm sound code and its doc comment removed (pop-up kept); Mission Impossible removed from the Tools menu |
| `dual.js` | Mission Impossible removed from the dual-screen sidebar |
| `README.md` | Rewritten (section 7) |
| `index.html` | Unchanged: `docx-preview` is in use (check below), jsPDF is not loaded here |
| `waypoints.js` | Unchanged: no sound references found |

## Licence files added

- `NOTICE` (all components, with MIT and ISC texts and pointers)
- `LICENSES/Apache-2.0.txt` (pdf.js)
- `Geist-LICENSE.txt` (next to `fonts.css`)
- Vendored file headers left intact. `vendor/docx-preview.min.js` has no licence yet (see `NEEDS_REVIEW.md` item 1).

## Check results (section 8)

1. **Personal data scan.** Names/organisation words: only hits were the staff surname in `tally.js` (fixed) and the school locality in one sentence builder (file left out). After the fixes: zero hits outside vendored files. UK postcode pattern: hits in 7 JS and 2 CSS files were checked and are all hex colour codes, not postcodes (`activities.js`, `chance.js`, `gapfill.js`, `pptx-render.js`, `ribbon.css`, `sb-present.js`, `splat.js`, `styles.css`, `unjumble.js`). Phone pattern: the one non-vendor hit (`sb-export.js` line 70) is a run of zeros; vendor hits are numeric constants in library code. The `@` character appears in CSS at-rules and JS (decorators, strings, template text) in many files and in licence headers of vendored libraries (`jspdf.umd.min.js`, `pdf.min.js`, `pdf.worker.min.js`, `docx-preview.min.js`). No email address found outside vendor licence headers.
2. **Name scan.** Staff first name and surname: zero hits in the working tree and across the new commits' history (the repo's older "Initial commit" is separate, see `NEEDS_REVIEW.md` item 8).
3. **Removed-item references.** Remaining hits and why: `SERIES` and `seriesFor` in `app.js` (the now-empty series code); `youtube` in `app.js` (the link-opening code, no embed) and `pptx-render.js` (renders online-video placeholders); `docx-preview` in `index.html`, `printcentre.js` (in use); `Mission Impossible` and `.mp3` in `mission.js`, plus Mission styles in `styles.css` and a comment in `dual.js` (code left dormant, see `NEEDS_REVIEW.md` item 3); `docx-preview` also named in `NOTICE`. No `alarm.mp3`, `sounds/` or `icon-contact-sheet` references remain in code (`alarm` as a word is the Clock's alarm feature).
4. **Credential scan.** Hits are the words "secret" in the Mindreader game description and in `connect4.js` (game mechanics, not values). No passwords, API keys or tokens.
5. **Run check.** Served locally and opened in the in-app browser: the page loaded, no console errors, and all 53 script, stylesheet and vendor requests returned 200. The app then shows a "Choose folder" screen that needs a native folder picker, so the slideshow viewer, Waypoints menu, print and dual screen were **not exercised**. Please test by hand.
6. **Broken links.** Every script and stylesheet in `index.html` and `builder.html` exists in the repo (confirmed by the 200 responses for `index.html`; `builder.html` references only files that are present).

## Needs review

See `NEEDS_REVIEW.md` in this repository (13 items). Main ones: `docx-preview` licence; jsPDF kept because the Printing Centre needs it; `mission.js` still shipped but unreachable; the older initial commit still has a school email address as author.

## Commits

1. `e88d621` Add application code and content with version 1 edits
2. `92138b0` Add third-party licences and NOTICE
3. `5292bb1` Rewrite README for version 1
4. Add review notes and build report (this file; the hash is in `git log`)

The edits were made before the first commit so the staff names never entered the new history.
