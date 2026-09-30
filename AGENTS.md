# AGENTS.md — how work gets done in this repository

This file is the operating manual for anyone (human or agent) changing Riso Todo.
Read it before editing; update it when a convention changes.

## 1. What we are building

**Riso Todo** — a small, dependency-free todo + notes web app with a "riso print"
look. It ships as three files at the repository root and must keep working when
opened straight from the file system:

| File | Responsibility |
| --- | --- |
| `index.html` | All markup: header, tab bar, both views, forms, toolbars, empty states, `<template>`s for cards, toast, ARIA live region |
| `styles.css` | All styling, organised in numbered sections (tokens → … → responsive) |
| `script.js` | All behaviour, in one IIFE, in sections (helpers → rendering → mutations → wiring → init) |
| `README.md` | User-facing docs: features, shortcuts, storage keys |
| `AGENTS.md` | This file |
| `tests/` | Dev-only checks (jsdom + static lint). Not shipped. |

## 2. Non-negotiables

1. **No runtime dependencies, no build step, no network calls.** No CDNs, no web
   fonts, no fetch. `index.html` must render with the network switched off.
2. **Keep the app files self-contained.** `tests/` may use dev dependencies; the
   app may not.
3. **`script.js` stays one IIFE** (`(function () { 'use strict'; … })()`) written
   in ES5 style — `var`, `function`, no ES modules, no classes. It must keep
   working without a bundler.
4. **Colour and geometry come from tokens.** Add new `--custom-properties` to
   `:root` *and* to `[data-theme="ink"]`; never hard-code a hex outside those
   blocks.
5. **Everything is keyboard-reachable and labelled.** Expose state with
   `aria-pressed` / `aria-checked` / `aria-selected` / `aria-live`; keep the
   global `prefers-reduced-motion` rule working.
6. **Every new interactive element gets a `data-testid`** (tasks use `test-todo-*`,
   notes use `test-note-*`, app actions use `test-*`), so the UI stays testable.
7. **Storage access always sits in `try/catch`** and the app must survive
   corrupted, hand-edited or unavailable `localStorage`.

## 3. Architecture in one screen

**State** lives in module-level variables inside the IIFE:

```js
tasks[]      { id, title, done, priority, due, tags[], createdAt, completedAt }
notes[]      { id, title, body, color, pinned, createdAt, updatedAt }
filter       'all' | 'active' | 'done'        query       task search text
sort         'manual' | 'due' | 'priority' | 'created' | 'alpha'
noteFilter   'all' | 'pinned'                 noteQuery   note search text
noteSort     'updated' | 'created' | 'alpha'   currentView 'tasks' | 'notes'
```

**Flow — always the same three steps:**

```
mutate state  →  save() / saveNotes()  →  render() / renderNotes()
```

`render()` and `renderNotes()` rebuild their list from the `<template>` clone
(no partial DOM patching). The single exception is `refreshTimeChips()`, which
runs every 30 s and patches only the due/time chips — deliberately, so an open
inline editor is not destroyed while the user is typing.

**Events** are delegated on containers (`#taskList`, `#noteList`, `#tabbar`, the
forms, the toolbars) — never bound per card. Button actions go through
`data-action` and are dispatched in `listClick()` / `noteListClick()`.

**Views** are two `role="tabpanel"` wrappers (`.view`) that use
`display: contents`, so the CSS grid in `.layout` sees the panels as its own
children and the layout never shifts when tabs switch.

**Persistence keys:** `riso-todo.tasks.v1`, `riso-todo.notes.v1`,
`riso-todo.theme`, `riso-todo.view`. A `storage` listener mirrors changes from
other tabs.


## 4. Definition of done

A change is finished only when all of these are true:

- [ ] It works by mouse **and** keyboard (`Tab`, `Enter`, `Esc`, and the existing
      shortcuts still behave).
- [ ] `cd tests && npm test` is green — static lint **12 passed, 0 failed** and
      the behaviour harness **149 passed, 0 failed** (grow both numbers, never
      shrink them).
- [ ] New behaviour has assertions in `tests/harness.js`, in the section that
      matches the feature.
- [ ] Any new class, id, `var(--token)` or `data-*` hook is picked up by
      `tests/lint.js` automatically — if lint complains, the code is wrong, not
      the lint.
- [ ] The state round-trips: add → reload → still there; corrupt the JSON by hand
      → the app still boots.
- [ ] `README.md` is updated (features, shortcuts, storage keys); this file is
      updated if a convention changed.
- [ ] No new runtime dependency, no build step, no network call.

## 5. Commands

```bash
# one-time setup for the dev checks
cd tests && npm install

# the full gate (lint, then behaviour)
npm test                  # => "12 passed, 0 failed" then "149 passed, 0 failed"

# individually
node tests/lint.js        # fast, static, no DOM
node tests/harness.js     # boots the real index.html in jsdom

# run the app
python -m http.server 8000     # from the repo root, then open localhost:8000
```

Both test scripts exit non-zero on failure and also write their output to
`tests/lint-report.txt` / `tests/harness-report.txt` (both git-ignored) — handy when
stdout is being piped somewhere unreliable.

## 6. How to add work — the loop

1. **Read first.** Open the matching section of `index.html`, `script.js` and
   `styles.css`. Keep the existing section order; add new code to the right
   section rather than tacking it onto the end of a file.
2. **Model it.** Extend the state shape, then `normalizeTask` / `normalizeNote`,
   then `load`/`save` — old data must keep loading.
3. **Render it.** Put static structure in the `<template>`, clone it in
   `create*Node()`, and fill it with `node.querySelector(...)`.
4. **Wire it.** Register listeners in `bindEvents()`; route button clicks through
   a `data-action` branch in the list click handler.
5. **Style it.** Add rules in the correct numbered CSS section, give new tokens an
   ink-theme value, and add a rule to the right `@media` block if the layout needs
   it (task cards collapse to one column below 620 px; notes collapse
   automatically via `auto-fill`).
6. **Prove it.** Add assertions to `tests/harness.js` (use a fresh `boot()` or
   `dom2`…`dom5` instance when the scenario needs clean storage).
7. **Gate it.** `npm test`, then commit. Suggested message style:
   `Add notes tab with pins and colours` / `Fix Clear done button not wired up`.

## 7. Gotchas (learned the hard way)

- `[hidden] { display: none !important; }` in the reset is **load-bearing**:
  `.panel`, `.chip` and `.tag` set `display: flex`, which would otherwise beat the
  user-agent style for `hidden`.
- Wrap tab panels with `display: contents`; putting grid columns on a wrapper
  would change the existing `.layout` grid.
- `<template>` clones: always scope lookups to the cloned node — a
  `document.querySelector` would return the *first* card instead.
- Deleting animates the card out and re-renders on a timer: guard the callback
  with a `settled` flag so it cannot fire twice.
- "Pinned notes float to the top" needs a *stable* sort: lift pinned notes with a
  second `sort()` **after** the main sort (ES2019+ guarantees stability), rather
  than folding it into one comparator.
- `Array#sort` mutates: sort a `slice()` so the master list keeps "My order".
- Keyboard reordering uses `reorderByIds()`, which swaps items into the slots of
  the *visible* subset, so filtered-out items keep their place.
- **Shell traps in this workspace:**
  - never write `2>nul` — a POSIX shell creates a real file named `nul`, which git
    can never index (hence the `nul` entry in `.gitignore`);
  - never redirect a `node` process's stdout — the wrapper reports
    `stdout is not a tty` and the process dies; the test scripts write their own
    report files instead;
  - paths with spaces (`HNG 15`) need quoting in every command.
- jsdom keeps the app's `setInterval` alive forever, which is why
  `tests/harness.js` ends with an explicit `process.exit()`.

## 8. Backlog / next ideas

- Export / import the whole app state as JSON.
- Drag-to-reorder notes (tasks already have it) and note ↔ task linking.
- A print stylesheet, so a task list can go on actual paper.
- Optional PWA manifest for offline use.
- A Playwright smoke test for what jsdom cannot verify: real layout,
  `display: contents`, `-webkit-line-clamp` and hover states.

`tests/lint-report.txt` / `tests/harness-report.txt` (git-ignored).
