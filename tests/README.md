# Riso Todo — dev checks

The app in the repository root is dependency-free: plain HTML, CSS and JavaScript.
These checks are **dev-only tooling**; nothing here is shipped to the browser.

```bash
cd tests
npm install          # installs jsdom (the only dev dependency)
npm test             # lint first, then the behaviour harness
```

Or run one at a time:

```bash
node lint.js         # static consistency checks (fast, no DOM)
node harness.js      # boots index.html in jsdom and drives the UI
```

Both scripts print `PASS`/`FAIL` per assertion and exit non-zero on failure. They
also drop a plain-text copy of their output next to themselves
(`lint-report.txt`, `harness-report.txt`) — handy when stdout is being piped
somewhere unreliable.

## `lint.js` — static consistency

| Check | Why it matters |
| --- | --- |
| CSS braces/parens balanced | Catches a half-written rule before it silently kills the rest of the file |
| Every `var(--token)` is defined | A typo'd custom property silently renders as "nothing" |
| Every class has styling | Stops a renamed class from quietly losing its look |
| Every `getElementById` id exists in the HTML | Catches a renamed element the runtime tests may never touch |
| `data-*` hooks agree across HTML/CSS/JS | Keeps `dataset.foo` ↔ `data-foo` ↔ `[data-foo]` in sync |
| Every `data-action` is handled in JS | A button in the template that does nothing |
| `data-testid`s present on cards | Guarantees the documented test hooks stay available |

## `harness.js` — behaviour

Runs the real `index.html` with the real `script.js` inside jsdom, then drives the
app through the DOM: submit the forms, click buttons, dispatch keyboard events,
inspect `localStorage`. It covers the empty states, validation, adding, editing,
completing, deleting with undo, filters, search, tag filtering, all sort modes,
drag/keyboard reorder, due-date labels and overdue flags, theme switching, tab
switching, note colours/pinning, the sample-data button, persistence across a
reload, and resilience against corrupt or hand-edited storage.

Adding a feature? Add assertions to `harness.js` in the matching section. The
harness deliberately uses fresh `JSDOM` instances (`boot()`, `dom2`…`dom5`) so
each scenario starts from a known state.

> Note: the harness calls `process.exit()` at the end, because the app's
> `setInterval` would otherwise keep the jsdom window alive forever.
