# Riso Todo — a pretty little task ledger

A small, dependency-free todo app built with **plain HTML, CSS and vanilla JavaScript**.
No build step, no frameworks, no network requests — open `index.html` and it runs.

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
| `index.html` | Semantic markup, the compose form, toolbar, task `<template>`, toast and an ARIA live region |
| `styles.css` | The "riso print" look: paper/ink themes, hard offset shadows, dotted backdrop, animations |
| `script.js` | All behaviour in one IIFE: state, rendering, storage, drag-and-drop, keyboard support |

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
- **Offline persistence** in `localStorage`, with corrupt or hand-edited data repaired on load,
  plus cross-tab sync via the `storage` event.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>/</kbd> | Jump to the search box |
| <kbd>Enter</kbd> | Add the task (in the form) / rename (on a title) |
| <kbd>Esc</kbd> | Cancel an edit / clear and leave the search box |
| <kbd>F2</kbd> | Edit the focused task title |
| <kbd>Alt</kbd> + <kbd>↑</kbd> <kbd>↓</kbd> | Move the focused task up or down |
| <kbd>Delete</kbd> | Delete the focused task |

## Storage keys

- `riso-todo.tasks.v1` — the task array
- `riso-todo.theme` — `paper` or `ink`

Task cards carry `data-testid` hooks (`test-todo-card`, `test-todo-title`, `test-todo-complete-toggle`,
`test-todo-priority`, `test-todo-status`, `test-todo-due-date`, `test-todo-time-remaining`,
`test-todo-overdue-indicator`, `test-todo-tags`, `test-todo-edit-button`, `test-todo-delete-button`)
so the UI can be driven by automated tests.

## Accessibility notes

Focus outlines are kept, everything is reachable by keyboard, controls carry labels and
`aria-pressed` / `aria-checked` state, changes are announced through a live region, and all
animation is disabled under `prefers-reduced-motion: reduce`.
