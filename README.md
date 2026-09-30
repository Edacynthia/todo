# Riso Todo — a pretty little task ledger

A small, dependency-free **todo + notes** app built with **plain HTML, CSS and vanilla
JavaScript**. No build step, no frameworks, no network requests — open `index.html`
and it runs. There is a **Tasks** tab and a **Notes** tab, and a one-click
**Load sample data** button if you just want to see it filled in.

## Run it

- **Quickest:** double-click `index.html` (works straight from the file system).
- **Most reliable (recommended, so `localStorage` has a real origin):**

  ```bash
  cd "HNG 15"
  python -m http.server 8000
  # then open http://localhost:8000
  ```

## Files

| File | What's inside |
| --- | --- |
| `index.html` | Semantic markup, tab bar, both views, forms, toolbars, empty states, `<template>`s, toast and an ARIA live region |
| `styles.css` | The "riso print" look: paper/ink themes, hard offset shadows, dotted backdrop, note colours, animations |
| `script.js` | All behaviour in one IIFE: state, rendering, storage, drag-and-drop, tabs, keyboard support |
| `README.md` | This file — features, shortcuts, storage keys |
| `AGENTS.md` | Conventions and the definition of done for anyone changing the code |
| `tests/` | Dev-only checks: a static lint and a jsdom behaviour harness (`cd tests && npm install && npm test`) |


## Features

- **Add tasks** with a title, due date, priority (low / medium / high) and comma-separated tags.
- **Complete tasks** with an animated tick and a hand-drawn strike-through.
- **Edit inline** — double-click a title or press <kbd>Enter</kbd> on it; <kbd>Esc</kbd> cancels.
- **Delete with undo** — the card animates out and a toast offers a one-click restore.
- **Filters & search** — All / Active / Done, plus free-text search across titles and tags.
  Click any `#tag` chip to filter by it.
- **Sorting** — your own drag order, due soonest, priority, newest first, or A → Z.
- **Drag to reorder** by the dotted handle, or <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd> with the keyboard.
- **Due-date intelligence** — "Today", "due in 3 hours", "2 days overdue", with an overdue flag.
- **Progress panel** — open/done/overdue counts and an animated completion bar.
- **Paper ⇄ ink themes** — follows your OS preference, then remembers your choice.
- **Load sample data** — one click fills the app with five example tasks and three
  notes (it never duplicates: click again and it says so).
- **Notes tab** — a second view for the scraps that are not tasks yet:
  - optional title (falls back to the first line of the body), body text with line
    breaks kept, a live word count and an "edited 5 mins ago" stamp;
  - five paper colours, picked when you create or edit a note;
  - **pin** the important ones so they float to the top of the pile;
  - filter All / Pinned, search titles and bodies, sort by recently edited,
    newest or A → Z;
  - edit inline (colour included) and delete with the same undo toast as tasks.
- **Offline persistence** in `localStorage`, with corrupt or hand-edited data repaired on load,
  plus cross-tab sync via the `storage` event.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>/</kbd> | Jump to the search box of the tab you are on |
| <kbd>←</kbd> <kbd>→</kbd> | Switch between the Tasks and Notes tabs |
| <kbd>Enter</kbd> | Add the task (in the form) / rename (on a title) |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Save a note from the note body |
| <kbd>Esc</kbd> | Cancel an edit / clear and leave the search box |
| <kbd>F2</kbd> | Edit the focused task title or note |
| <kbd>Alt</kbd> + <kbd>↑</kbd> <kbd>↓</kbd> | Move the focused task up or down |
| <kbd>Delete</kbd> | Delete the focused task or note |

## Storage keys

- `riso-todo.tasks.v1` — the task array
- `riso-todo.notes.v1` — the note array
- `riso-todo.theme` — `paper` or `ink`
- `riso-todo.view` — the tab you were last on (`tasks` or `notes`)

Task cards carry `data-testid` hooks (`test-todo-card`, `test-todo-title`, `test-todo-complete-toggle`,
`test-todo-priority`, `test-todo-status`, `test-todo-due-date`, `test-todo-time-remaining`,
`test-todo-overdue-indicator`, `test-todo-tags`, `test-todo-edit-button`, `test-todo-delete-button`)
so the UI can be driven by automated tests.

Notes expose their own hooks (`test-note-card`, `test-note-title`, `test-note-body`,
`test-note-pin`, `test-note-stamp`, `test-note-count`, `test-note-edit-button`,
`test-note-delete-button`) and the top bar carries `test-load-sample`, so the whole UI
can be driven by automated tests.

## Dev checks

The app itself has no dependencies; `tests/` holds optional dev-only checks:

```bash
cd tests
npm install     # installs jsdom (the only dev dependency)
npm test        # static lint, then the jsdom behaviour harness
```

Expect `12 passed, 0 failed` from the lint and `149 passed, 0 failed` from the
harness. `tests/README.md` explains what each check covers, and `AGENTS.md` holds
the conventions and the full definition of done.

## Accessibility notes

Focus outlines are kept, everything is reachable by keyboard, controls carry labels and
`aria-pressed` / `aria-checked` state, changes are announced through a live region, and all
animation is disabled under `prefers-reduced-motion: reduce`.
