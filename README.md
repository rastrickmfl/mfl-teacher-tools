# MFL Teacher Tools

A lesson slideshow viewer and set of teacher tools for MFL (modern foreign languages) lessons. It runs entirely in the browser.

## Running it

Open `index.html` in a browser (Edge or Chrome work best). No server is needed for basic use. Note that the starter Sentence Builders and Waypoints (see below) are only copied into your data folder when the app is served over http, because browsers block the page from reading its own files when it is opened straight from disk.

To serve the folder locally instead, run any static file server from the repository folder, for example:

```
python -m http.server 8000
```

then visit `http://localhost:8000/`.

## Features in version 1

- **Open a deck.** Drop a `.pptx` or `.pdf` file to present it.
- **Presenting.** Slides, pen, clicker support and slide navigation.
- **Reveals.** Objects that are hidden at the start of a slide can be revealed during the lesson.
- **Pen marks.** Drawn on the slide while presenting.
- **Slide editor.** A full PowerPoint-style editor with templates and galleries, plus quick live changes (pen and reveal toggles, basic text editing). Decks open as imported; a year group's colours are applied only if you choose them in the editor's Design tab.
- **Timetable and class lists.** Type your class codes into a Monday to Friday grid of P1 to P5 plus Form (Settings → Timetable). P2 and Form each have two possible times, set by the class code's year group: 8 and 10 start at 09:55 (P2) and 12:10 (Form); 7, 9 and 11 start at 10:10 (P2) and 12:50 (Form). A code with no year group gets a choice of the two. Class codes you have already typed are suggested in the other boxes, and a form typed on Monday fills Tuesday to Friday (you can change any day). Each filled-in class code is tinted, with the same colour wherever the class appears; Form boxes are not coloured. Each new class code gets a class list in Settings → Classes, where you can paste in the class's names.
- **Clock.** Timer, stopwatch and alarms (alarms last only while the tab is open), with a display-mode toggle.
- **Games.** Game of Chance, Beat the Teacher (the class plays against the teacher), Bob Up, Hungry Translations, Splat, Noughts & Crosses, Connect 4 and Sentence Unjumble.
- **Sentence Builder.** Presenter mode and Mindreader, with ready-made sentence builders in `Sentence Builders/`.
- **Waypoints.** The Waypoints menu, with images in `Waypoints/`.
- **Whiteboards.**
- **Printing.** 2x2 handouts and single slides, and the Printing Centre.
- **Dual screen.** A separate pupil window.

## Where data is stored

On your own computer only. The first time you open the app it asks you to choose a data folder; lesson decks, settings, pen marks, Waypoints and Sentence Builders are saved in that folder, and the browser remembers which folder you chose. A browser that supports folder access is needed (Edge or Chrome). Nothing is sent to a server. This repository contains no data: no class lists, timetables or pupil information. The `Sentence Builders/` and `Waypoints/` folders here are starter content. When the app is served over http, it copies them into your data folder the first time it opens that folder (it never overwrites a file you already have, and never puts back one you have changed or deleted). Your own Sentence Builders and Waypoints, and any edits you make, live in your data folder. When you open the app straight from disk, copy these two folders into your data folder by hand instead. A new lesson starts as an empty deck; templates are not included in version 1.

## Not included in version 1

- Online video (links to online video open in a separate window instead).
- Sounds (these will be added later).
- The icon contact sheet.
- Any timetable or class data. Type in your own class codes in the app; importing a timetable file is not offered.

## Licences

Third-party components (pdf.js, JSZip, html2canvas, jsPDF, Lucide icons and the Geist font) keep their own licences. See [`NOTICE`](NOTICE) for the full list and licence texts.
