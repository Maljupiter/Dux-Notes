# Dux Notes

Dux Notes is a local-first desktop notes app built with Electron, React, PDF.js and pdf-lib.

It runs as its own desktop window, stores notes locally, works offline after setup, and supports PDFs, blank notebooks, pen/highlighter, editable text, images, shapes, a study calendar, scratch notes and flashcards.

## Mac setup, easiest path

Put this folder somewhere safe, for example Downloads or Documents.

Run these two commands once:

```bash
npm install
npm run build:mac
```

After the build finishes, open the `release` folder. You will see a Dux Notes `.dmg` installer.

Open the `.dmg`, then drag **Dux Notes** into **Applications**.

From then on, launch it like a normal Mac app:

```text
Applications > Dux Notes
```

You do not need Terminal again after that.

## Even easier Mac build option

You can also double-click:

```text
BUILD_MAC_APP.command
```

That script runs the install and Mac build steps, then opens the `release` folder.

If macOS blocks it because it was downloaded from the internet, right-click the file, choose **Open**, then approve it once.

## Development mode

Use this only if you are editing the app code:

```bash
npm install
npm run dev
```

## Build installers

Mac:

```bash
npm run build:mac
```

Windows or Linux on the matching computer:

```bash
npm run dist
```

## Current features

- Import PDFs and write over them.
- Create blank notebooks with ruled, plain, or grid paper.
- Retained editable elements: pen strokes, highlighter strokes, text boxes, images, and shapes.
- Select, move, delete, resize images, resize text, lasso select, many built-in shapes, and undo/redo.
- Export PDFs with an editable `.localnotes.json` sidecar file.
- Re-import exported PDFs with editable notes when the sidecar file is kept beside the PDF.
- Local-only storage. No cloud sync.
- Real folder mapping through the desktop app.
- Themes, labels, folders, trash, page thumbnails, continuous scrolling, study schedule planner, scratchpad, and flashcards.
- Free local study schedule generator.
- Free local flashcard generator using a built-in HSC and general-study question bank.

## Important editable export note

To re-import an exported PDF with editable elements, keep the exported `.pdf` and `.pdf.localnotes.json` files together in the same folder.

Example:

```text
your-notes.pdf
your-notes.pdf.localnotes.json
```
