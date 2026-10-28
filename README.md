# MFL Teacher Tools

A lesson slideshow viewer and set of teacher tools for MFL (modern foreign languages) lessons. It runs entirely in the browser.

## Running it

Open `index.html` in a browser (Edge or Chrome work best). No server is needed for basic use.

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
- **Slide editor.** A full PowerPoint-style editor with templates and galleries, plus quick live changes (pen and reveal toggles, basic text editing).
- **Clock.** Timer, stopwatch and alarms (alarms last only while the tab is open), with a display-mode toggle.
- **Games.** Game of Chance, Beat the Teacher (the class plays against the teacher), Bob Up, Hungry Translations, Splat, Noughts & Crosses, Connect 4 and Sentence Unjumble.
- **Sentence Builder.** Presenter mode and Mindreader, with ready-made sentence builders in `Sentence Builders/`.
- **Waypoints.** The Waypoints menu, with images in `Waypoints/`.
- **Whiteboards.**
- **Printing.** 2x2 handouts and single slides, and the Printing Centre.
- **Dual screen.** A separate pupil window.

## Where data is stored

On your own computer only. The first time you open the app it asks you to choose a data folder; lesson decks, settings, pen marks, Waypoints and Sentence Builders are saved in that folder, and the browser remembers which folder you chose. A browser that supports folder access is needed (Edge or Chrome). Nothing is sent to a server. This repository contains no data: no class lists, timetables or pupil information. The `Sentence Builders/` and `Waypoints/` folders here are starter content; copy them into your data folder to use them. A new lesson also needs a `New lesson template.pptx` in your data folder, which is not included in version 1.

## Not included in version 1

- Online video (links to online video open in a separate window instead).
- Sounds (these will be added later).
- The icon contact sheet.
- Any timetable or class data. Add your own timetable slots in the app.

## Licences

Third-party components (pdf.js, JSZip, html2canvas, jsPDF, Lucide icons and the Geist font) keep their own licences. See [`NOTICE`](NOTICE) for the full list and licence texts.
