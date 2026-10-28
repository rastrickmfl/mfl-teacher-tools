# Sentence Builder Extractor — rules

Read this whole file before extracting anything. It is the single source of rules for turning an existing sentence builder (PPTX / PDF / PNG / DOCX) into a `.sb.json` file that opens in the Sentence Builder editor (`builder.html`).

These rules are maintained from the *Slideshow Viewer - Web App* project, alongside the editor's spec. If something here conflicts with what `builder.js` actually does, `builder.js` wins: say so in the report.

Last updated: 2026-10-17.

---

## 1. Where things are

- App folder: `Planner/Slideshow Viewer - Web App/`
- Editor code: `builder.js` (read the top: constants, `newDoc`, `normalise`). Don't edit any app code from the extractor.
- Output: `Sentence Builders/Year <7–11>/<half-term>/<Title>.sb.json`
  - Half-term folders, exactly: `1 - Autumn 1`, `2 - Autumn 2`, `3 - Spring 1`, `4 - Spring 2`, `5 - Summer 1`, `6 - Summer 2`, `Other`
  - Create the folder if it doesn't exist. The editor finds files by scanning these folders; there is no index to update.
- Good reference file (silent letters already marked): `Sentence Builders/Year 10/Other/SB2 What did you do in town recently (KS4 trial).sb.json`

## 2. Workflow

1. **Extract** the text from the source.
   - Normalise all extracted text to Unicode NFC (`unicodedata.normalize('NFC', s)`) before anything else, so each accented letter is one character and mark indices line up.
   - PPTX: read tables and text boxes in order (python-pptx). Note any colour, bold and italic on runs.
   - DOCX: tables first, then paragraphs.
   - PDF: text layer first (`pdftotext -layout`); if it is a scan or the layout is unclear, render the page and read the image.
   - PNG/JPG: read the image. Check accents and small words especially carefully; list anything you are unsure of as a question (step 3).
   - A source with several sentence builders (e.g. one per slide, or Higher and Foundation) becomes **separate builders**.
   - Several source files in one chat: finish one file completely (questions, write, report) before starting the next.
2. **Work out the structure**: question (target language + English), columns with their titles, items (TL + EN) in source order, groups (e.g. positive / negative rows split by a line or a gap). Group *n* of every split column lines up as row *n*. A column with one group spans all rows.
3. **Ask questions BEFORE writing any file** (see §3). Do not create the file until they are answered.
4. **Build the JSON** (§6), apply silent letters (§4), colours (§5) and phonetics (§6a).
5. **Check** (§7), then **write the file** into the right folder.
6. **Report** (§8).

## 3. Questions before generating (required)

The teacher may have had a reason for the original wording, so every proposed change is a **yes/no decision for the teacher**, never a silent fix.

- Use the interactive question tool (AskUserQuestion), **one question per suggested change**, up to 4 per call; keep calling until all are answered.
  - Question: quote the item and the column, e.g. *Column "Opinion", item 3: "il y a une bonne discipline"*, plus one short line on why.
  - Options: **"Change to: …" (Recommended)** first, then **"Keep as it is"**. Add a second fix option only if there are two real alternatives.
- Ask about: spelling, accents, grammar/agreement, wrong or unnatural French/Spanish, English translations that don't match, inconsistent punctuation between items, missing opening ¿ or ¡ in Spanish, and anything you couldn't read clearly in an image.
- Do **not** ask about: house-style things the tool decides (font, size, layout, paper, bold), curly vs straight apostrophes (always use ’), or the conventions below.
- Also ask (same tool) if:
  - a builder of the same title already exists in that folder: **Replace** or **Save as a copy**; for a copy, ask the teacher for the new title;
  - an item in the source is italic or otherwise marked as different (it may mean challenge/extension; the tool has no italics);
  - the source contains things the tool can't hold (pictures, sound icons, notes): say they will be left out; no answer needed unless it matters.
- Don't ask about year/half-term: take it from the file name, folder or slide content; if it isn't clear, use `Other` and say so in the report.
- If there's nothing to ask, go straight to writing.

## 4. Silent letters (colour mark `s`, target language only)

Judge each word **in its phrase**, not from rules alone. These conventions keep every builder consistent:

**Grey (mark as silent):**
- Silent final consonants: dernie**r**, moi**s**, tem**ps**, affreu**x**, étai**t**, sui**s**, croi**s**, beaucou**p**, alle**z**, e**t**, e**st**, chez → che**z**.
- Plural/verb endings: chose**s**, tu parle**s** (grey the **s**, not the e), ils parl**ent** (grey all of *ent* on 3rd person plural verbs only).
- Final consonant of short words before a consonant or at the end: le**s**, de**s**, me**s**, se**s** (but see liaison).
- Silent *h*: **h**abiter, **h**ôpital, **h**eureux, t**h**é. Not the *h* in *ch* / *ph*.
- Final *t* in *-ent* adverbs/nouns/adjectives where the vowel is nasal: souven**t**, conten**t**, commen**t** (only the *t*).

**Leave black:**
- **Liaison**: a consonant normally silent but sounded before a vowel (*les amis*, *vous avez*, *c'est un*, *mes amis*, *très intéressant*). Greying it would teach the wrong sound. For *est* before a vowel, leave the whole word black (no grey *s*).
- **Final -e** (*semaine*, *dernière*, *grande*): it tells pupils the consonant before it is sounded. Same for *-e* inside *-es* (only the *s* is grey).
- **Mute *e* inside a word** (*samedi*, *acheter*, *maintenant*): depends on accent and speed.
- Consonants that are pronounced: CaReFuL finals (*avec, sur, neuf, sel*), *bus, fils, sens, ours, mars, sept, huit* (alone), *plus* meaning "more" at the end of a phrase, *tous* as a pronoun.
- *-er* when sounded: *hiver, mer, cher, fier, hier*.
- English text, column titles, and the question (they can't take marks anyway).

**Spanish:** grey only silent ***h*** (*hay, hacer, ahora*) and the ***u*** in *que, qui, gue, gui* (not *güe/güi*).

If a word is genuinely ambiguous in context (e.g. *plus*, *tous*, *est* vs *l'Est*), choose from the sentence's meaning; if still unsure, leave it black and list it in the report.

## 5. Colours (red `r`, blue `b`, green `g`, purple `p`)

- No automatic gender colouring.
- Copy a colour from the source **only** when the source clearly uses it for one of: gender (le/la, masc/fem endings), a tense, or one key chunk. Use the nearest of red/blue/green/purple.
- Don't copy decorative colours, highlighted backgrounds, or inconsistent one-offs. List what was copied and what was dropped in the report.
- Colour marks on English (`lang:'en'`) are fine when the source colours the English to match; they print bold.

## 6. File format (`.sb.json`, v1)

```json
{
  "v": 1,
  "lang": "fr",
  "year": 10,
  "term": "3 - Spring 1",
  "title": "Positive and negative aspects of school (Higher)",
  "q": { "tl": "Qu’est-ce que tu penses de ton collège ?", "en": "What do you think of your school?" },
  "paper": "auto",
  "size": "auto",
  "cols": [
    {
      "id": "a1b2c3d4",
      "title": "Opinion",
      "sub": "auto",
      "width": null,
      "groups": [
        [
          { "tl": "Le mois dernier", "en": "Last month", "say": "",
            "marks": [ { "lang": "tl", "s": 6, "e": 7, "c": "s" }, { "lang": "tl", "s": 14, "e": 15, "c": "s" } ] }
        ]
      ]
    }
  ],
  "updated": 1792090322646
}
```

- `lang`: `fr` or `es`. `year`: 7–11 (number). `term`: one of the folder names in §1.
- `title`: the file name without `.sb.json`. Use the source's SB title if it has a meaningful one (e.g. "SB2 Where do you live"), otherwise the English question. Add "(Higher)" / "(Foundation)" when there are both. Don't add "(trial)". Remove `\ / : * ? " < > |`.
- `paper`, `size`, `sub`: always `"auto"`; `width`: `null`. Layout is the tool's job.
- `id`: 8 random lowercase letters/digits, unique per column.
- `say`: `""` always. Pronunciation lives in `phon` (§6a), not `say`.
- `gap`: leave out (gap versions are set in the tool).
- `marks`: `s` = start index, `e` = end index (exclusive), counted in characters of that item's `tl` or `en` string (JavaScript string indices; for NFC-normalised French/Spanish text these equal Python `str` indices). No overlapping marks on the same letters.
- `updated`: current time in milliseconds.
- Text: use ’ (curly apostrophe) throughout; a space before `?` and `!` in French if the source does so consistently, otherwise follow the source; keep `(e)` agreement brackets as in the source.
- Column titles and the English stay in English; no extra punctuation added.

## 6a. Phonetics (`phon`)

Every target-language word gets an English-style respelling, written at import. The teacher switches them on in the editor.

- Each item gets a `phon` array: `[ { "s": 0, "e": 8, "p": "dair-NYAY", "on": false } ]`.
- **Entries:** one per word; one per liaison pair (both words in one entry); one per joined word (*qu’est-ce*, *t’as*). Entries never overlap.
- `s`, `e`: character range in `tl`, same convention as `marks` (`e` exclusive). An entry may span a space.
- `p`: respelling in the phrase context. Hyphenated syllables; the stressed syllable in CAPITALS. Single-syllable unstressed words (*je*, *le*, *de*, *que*) stay in lower case. Silent letters are included (*dernier* → `dair-NYAY`).
- Examples: *qu’est-ce* → `kess`; *t’as* → `tah`; *suis allé* (liaison) → `sweeze allay`.
- `on`: always `false` on import.
- English text, column titles and the question get no `phon`.
- Don't ask the teacher yes/no about respellings (§3). If one is doubtful, list it in the report (§8).

## 7. Checks before writing

Run these in code, not by eye:
- JSON parses; every item has `tl`, `en`, `say`, `marks`.
- All text is NFC (`unicodedata.is_normalized('NFC', s)`).
- Every mark: `0 <= s < e <= len(text)`, `c` in `r b g p s`, and `s` marks only on `lang:"tl"`.
- Every `phon` entry: `0 <= s < e <= len(tl)`, no overlaps, `p` non-empty, `on` is `false`; any respelling with more than one syllable has a CAPITALISED stressed syllable.
- Print each silent mark as the word with the marked letters in brackets (e.g. `dernie[r]`, `[h]abiter`) and read through the list once for mistakes.
- Item counts per column match the source.
- Every agreed correction is applied; every "keep" is unchanged.

## 8. Report (short)

- File(s) written, with folder.
- Corrections made / kept as is.
- Silent letters: count, plus any words left black because of doubt.
- Colours copied / dropped.
- Phonetics: number of `phon` entries; doubtful respellings listed (not asked).
- Anything left out (pictures, notes) and any year/half-term guess.
- Last line: *Open it in the Sentence Builder editor and check the silent letters and page fit before printing.*
