/* Riso Todo — behaviour test harness.
 *
 * Boots the real index.html + script.js inside jsdom and drives the app the way
 * a user would (clicks, typing, keyboard shortcuts), then asserts on the DOM and
 * on localStorage. No build step and no browser required.
 *
 *   node harness.js [project-dir]      (defaults to the repository root)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIR = process.argv[2] || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');

let pass = 0;
const failures = [];

/* Shell output redirection is unreliable in this environment, so the harness
   keeps its own copy of the report and writes it to report.txt on exit. */
const lines = [];
const origLog = console.log;
console.log = function () {
  const line = Array.prototype.join.call(arguments, ' ');
  lines.push(line);
  origLog(line);
};
process.on('exit', function () {
  try { fs.writeFileSync(path.join(__dirname, 'harness-report.txt'), lines.join('\n') + '\n'); } catch (e) { /* ignore */ }
});

function check(label, condition, extra) {
  if (condition) { pass++; console.log('  PASS  ' + label); }
  else { failures.push(label + (extra ? ' -> ' + extra : '')); console.log('  FAIL  ' + label + (extra ? ' -> ' + extra : '')); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.warn = () => {};
  w.eval(js);
  return { dom, w, d: w.document };
}

function iso(daysFromToday) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addTask(w, opts) {
  const d = w.document;
  d.getElementById('taskTitle').value = opts.title;
  d.getElementById('taskDue').value = opts.due || '';
  d.getElementById('taskPriority').value = opts.priority || 'medium';
  d.getElementById('taskTags').value = opts.tags || '';
  d.getElementById('taskForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

const cards = d => Array.from(d.getElementById('taskList').children);
const noteCards = d => Array.from(d.getElementById('noteList').children);
const text = (d, sel) => (d.querySelector(sel) || {}).textContent;
const store = w => JSON.parse(w.localStorage.getItem('riso-todo.tasks.v1') || '[]');
const noteStore = w => JSON.parse(w.localStorage.getItem('riso-todo.notes.v1') || '[]');

function addNote(w, opts) {
  const d = w.document;
  d.getElementById('noteTitle').value = opts.title || '';
  d.getElementById('noteBody').value = opts.body || '';
  const color = opts.color || 'yellow';
  d.querySelectorAll('input[name="noteColor"]').forEach(r => { r.checked = r.value === color; });
  d.getElementById('noteForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

function typeNoteSearch(w, value) {
  const d = w.document;
  const box = d.getElementById('noteSearch');
  box.value = value;
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
}


(async function run() {
  console.log('\n== boot & empty state ==');
  let { w, d } = boot();
  check('theme attribute defaults to paper/ink', ['paper', 'ink'].includes(d.documentElement.dataset.theme));
  check('today label is filled', d.getElementById('todayLabel').textContent.length > 5, d.getElementById('todayLabel').textContent);
  check('no task cards at start', cards(d).length === 0);
  check('empty state visible', d.getElementById('emptyState').hidden === false);
  check('empty title text', d.getElementById('emptyTitle').textContent === 'Nothing here yet');
  check('progress reads 0%', d.getElementById('progressValue').textContent.startsWith('0%'));
  check('clear-done is disabled', d.getElementById('clearDoneBtn').disabled === true);

  console.log('\n== validation (blank title) ==');
  addTask(w, { title: '   ' });
  check('no card added for blank title', cards(d).length === 0);
  check('form error shown', d.getElementById('formError').hidden === false, d.getElementById('formError').textContent);
  check('input flagged invalid', d.getElementById('taskTitle').classList.contains('is-invalid'));

  console.log('\n== add a full task ==');
  addTask(w, { title: 'Sketch the   poster layout', due: iso(2), priority: 'high', tags: '#Design, deep work, design' });
  check('one card rendered', cards(d).length === 1);
  let card = cards(d)[0];
  check('card data-priority=high', card.dataset.priority === 'high');
  check('title whitespace collapsed', text(d, '.task__title') === 'Sketch the poster layout', text(d, '.task__title'));
  check('priority chip', text(d, '.chip--prio') === 'High');
  check('status chip', text(d, '.chip--status') === 'pending');
  check('due chip', text(d, '.chip--due') === new Date(Date.now() + 2 * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), text(d, '.chip--due'));
  check('remaining chip', text(d, '.chip--remaining') === 'due in 2 days', text(d, '.chip--remaining'));
  check('duplicate + hashed tags cleaned', card.querySelectorAll('.tag').length === 2, Array.from(card.querySelectorAll('.tag')).map(t => t.textContent).join('|'));
  check('test-ids present', !!card.querySelector('[data-testid="test-todo-title"]') && !!card.querySelector('[data-testid="test-todo-delete-button"]'));
  check('form was reset', d.getElementById('taskTitle').value === '' && d.getElementById('taskPriority').value === 'medium');
  check('saved to localStorage', store(w).length === 1);
  check('summary text', d.getElementById('summaryText').textContent === '1 open task · 0 done', d.getElementById('summaryText').textContent);
  console.log('\n== toggle complete ==');
  card.querySelector('[data-action="toggle"]').click();
  card = cards(d)[0];
  check('is-done class applied', card.classList.contains('is-done'));
  check('aria-checked=true', card.querySelector('.task__check').getAttribute('aria-checked') === 'true');
  check('status chip = done', text(d, '.chip--status') === 'done');
  check('remaining chip = completed', text(d, '.chip--remaining') === 'completed');
  check('progress updated', d.getElementById('progressValue').textContent === '100% complete', d.getElementById('progressValue').textContent);
  check('clear-done enabled again', d.getElementById('clearDoneBtn').disabled === false);

  console.log('\n== filters ==');
  d.querySelector('[data-filter="done"]').click();
  check('done filter shows 1', cards(d).length === 1);
  d.querySelector('[data-filter="active"]').click();
  check('active filter shows 0', cards(d).length === 0);
  check('active empty title', d.getElementById('emptyTitle').textContent === 'You are all caught up');
  check('aria-pressed set', d.querySelector('[data-filter="active"]').getAttribute('aria-pressed') === 'true');
  d.querySelector('[data-filter="all"]').click();
  check('all filter shows 1', cards(d).length === 1);

  console.log('\n== search + tag filter ==');
  const search = d.getElementById('searchInput');
  const typeSearch = value => { search.value = value; search.dispatchEvent(new w.Event('input', { bubbles: true })); };
  typeSearch('zzz');
  check('search hides everything', cards(d).length === 0);
  check('no-match empty title', d.getElementById('emptyTitle').textContent.includes('No matches'), d.getElementById('emptyTitle').textContent);
  typeSearch('deep');
  check('tag search matches', cards(d).length === 1);
  typeSearch('');
  check('clearing search restores', cards(d).length === 1);
  d.querySelector('.tag').click();
  check('clicking a tag filters by it', cards(d).length === 1 && search.value === 'design', search.value + ' / ' + cards(d).length);
  typeSearch('');

  console.log('\n== second (overdue) task + sorting ==');
  addTask(w, { title: 'Post the reel', due: iso(-3), priority: 'low' });
  check('two cards', cards(d).length === 2);
  const overdueCard = cards(d).find(c => c.textContent.includes('Post the reel'));
  check('overdue flag shown', overdueCard.querySelector('[data-testid="test-todo-overdue-indicator"]').hidden === false);
  check('is-overdue class', overdueCard.classList.contains('is-overdue'));
  check('due chip flagged late', overdueCard.querySelector('.chip--due').classList.contains('is-late'));
  check('overdue summary', d.getElementById('summaryText').textContent.includes('1 overdue'), d.getElementById('summaryText').textContent);
  check('new task sits on top (manual order)', cards(d)[0].textContent.includes('Post the reel'));
  const sortPick = value => {
    d.getElementById('sortSelect').value = value;
    d.getElementById('sortSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  sortPick('priority');
  check('priority sort puts High first', cards(d)[0].textContent.includes('Sketch the poster'));
  sortPick('due');
  check('due sort puts the overdue task first', cards(d)[0].textContent.includes('Post the reel'));
  sortPick('alpha');
  check('A->Z sort', cards(d)[0].textContent.includes('Post the reel'));
  sortPick('manual');

  console.log('\n== inline edit ==');
  const target = cards(d).find(c => c.textContent.includes('Post the reel'));
  target.querySelector('[data-action="edit"]').click();
  let editor = d.querySelector('.task__edit');
  check('editor opened with current title', !!editor && editor.value === 'Post the reel');
  editor.value = 'Post the reel + captions';
  editor.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  check('title updated in DOM', cards(d).some(c => c.textContent.includes('Post the reel + captions')));
  check('no editor left open', d.querySelector('.task__edit') === null);
  check('rename persisted', store(w).some(t => t.title === 'Post the reel + captions'));
  const escTarget = cards(d).find(c => c.textContent.includes('Sketch the poster'));
  escTarget.querySelector('[data-action="edit"]').click();
  editor = d.querySelector('.task__edit');
  editor.value = 'Should not stick';
  editor.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  check('Escape cancels the edit', !cards(d).some(c => c.textContent.includes('Should not stick')));

  console.log('\n== keyboard reorder (Alt + ArrowUp) ==');
  const lastTitleEl = cards(d)[1].querySelector('.task__title');
  const lastTitle = lastTitleEl.textContent;
  lastTitleEl.focus();
  lastTitleEl.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
  check('item moved up', cards(d)[0].querySelector('.task__title').textContent === lastTitle, cards(d).map(c => c.querySelector('.task__title').textContent).join(' | '));
  check('order persisted', store(w)[0].title === lastTitle);
  console.log('\n== delete + undo ==');
  const before = cards(d).length;
  const doomed = cards(d).find(c => c.textContent.includes('Post the reel + captions'));
  doomed.querySelector('[data-action="delete"]').click();
  check('removed from state immediately', store(w).length === before - 1);
  check('card still in DOM during the exit animation', cards(d).length === before && doomed.classList.contains('is-removing'));
  await wait(380);
  check('list re-rendered after animation', cards(d).length === before - 1, String(cards(d).length));
  check('toast visible', d.getElementById('toast').classList.contains('is-visible'));
  check('toast mentions the task', d.getElementById('toastText').textContent.includes('Post the reel + captions'), d.getElementById('toastText').textContent);
  d.getElementById('toastAction').click();
  check('undo restores the task', cards(d).length === before, String(cards(d).length));
  check('undo restores the original position', cards(d)[1].querySelector('.task__title').textContent === 'Post the reel + captions', cards(d).map(c => c.querySelector('.task__title').textContent).join(' | '));
  check('toast hidden after undo', d.getElementById('toast').classList.contains('is-visible') === false);

  console.log('\n== clear completed ==');
  const openBefore = store(w).filter(t => !t.done).length;
  d.getElementById('clearDoneBtn').click();
  check('done tasks removed', store(w).filter(t => t.done).length === 0);
  check('open tasks kept', store(w).length === openBefore, store(w).length + ' vs ' + openBefore);
  check('toast shows the clear message', d.getElementById('toastText').textContent.startsWith('Cleared'), d.getElementById('toastText').textContent);
  check('undo button hidden for clear-all', d.getElementById('toastAction').hidden === true);

  console.log('\n== theme toggle ==');
  const startTheme = d.documentElement.dataset.theme;
  d.getElementById('themeToggle').click();
  const nextTheme = d.documentElement.dataset.theme;
  check('theme switched', nextTheme !== startTheme, startTheme + ' -> ' + nextTheme);
  check('theme persisted', w.localStorage.getItem('riso-todo.theme') === nextTheme);
  check('toggle label + aria updated', d.getElementById('themeToggle').getAttribute('aria-pressed') === String(nextTheme === 'ink'), d.getElementById('themeText').textContent);

  console.log('\n== notes tab: switching ==');
  check('tasks tab active by default', d.getElementById('tabTasks').getAttribute('aria-selected') === 'true');
  check('tasks view shown, notes hidden', d.getElementById('viewTasks').hidden === false && d.getElementById('viewNotes').hidden === true);
  d.getElementById('tabNotes').click();
  check('notes view shown after click', d.getElementById('viewNotes').hidden === false && d.getElementById('viewTasks').hidden === true);
  check('notes tab marked selected', d.getElementById('tabNotes').getAttribute('aria-selected') === 'true' && d.getElementById('tabTasks').getAttribute('aria-selected') === 'false');
  check('roving tabindex updated', d.getElementById('tabNotes').tabIndex === 0 && d.getElementById('tabTasks').tabIndex === -1);
  check('active tab remembered', w.localStorage.getItem('riso-todo.view') === 'notes');
  check('task tab badge shows open tasks', d.getElementById('tabTasksCount').textContent === String(store(w).filter(t => !t.done).length), d.getElementById('tabTasksCount').textContent);
  d.getElementById('tabNotes').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  check('ArrowLeft switches back to tasks', d.getElementById('viewTasks').hidden === false && w.localStorage.getItem('riso-todo.view') === 'tasks');
  d.getElementById('tabNotes').click();

  console.log('\n== notes: empty state + validation ==');
  check('notes list starts empty', noteCards(d).length === 0);
  check('notes empty state visible', d.getElementById('notesEmpty').hidden === false);
  check('notes summary text', d.getElementById('notesSummary').textContent === 'No notes yet', d.getElementById('notesSummary').textContent);
  addNote(w, { title: '   ', body: '   ' });
  check('whitespace-only note rejected', noteCards(d).length === 0);
  check('note form error shown', d.getElementById('noteFormError').hidden === false, d.getElementById('noteFormError').textContent);

  console.log('\n== notes: add ==');
  addNote(w, { title: '  Palette   ideas  ', body: 'Cream\nRiso blue\nPoster red', color: 'blue' });
  check('one note card', noteCards(d).length === 1);
  let note = noteCards(d)[0];
  check('note colour applied', note.dataset.color === 'blue', note.dataset.color);
  check('note title trimmed', text(d, '.note__title') === 'Palette ideas', text(d, '.note__title'));
  check('note body keeps line breaks', text(d, '.note__body').indexOf('\n') !== -1, JSON.stringify(text(d, '.note__body')));
  check('note word count', text(d, '.note__count') === '5 words', text(d, '.note__count'));
  check('note stamp is relative', text(d, '.note__stamp') === 'edited just now', text(d, '.note__stamp'));
  check('note saved to storage', noteStore(w).length === 1 && noteStore(w)[0].color === 'blue');
  check('note test ids present', !!note.querySelector('[data-testid="test-note-pin"]') && !!note.querySelector('[data-testid="test-note-delete-button"]'));
  check('note count badge', d.getElementById('tabNotesCount').textContent === '1');
  check('note form reset to yellow paper', d.querySelector('input[name="noteColor"]:checked').value === 'yellow');
  check('notes did not touch the task list', cards(d).length === store(w).length, cards(d).length + ' vs ' + store(w).length);

  console.log('\n== notes: title falls back to the first body line ==');
  addNote(w, { body: 'Riso ink: use less, let the paper speak', color: 'mint' });
  check('two notes', noteCards(d).length === 2);
  const untitled = noteCards(d).find(c => c.dataset.color === 'mint');
  check('body used as the display title', untitled.querySelector('.note__title').textContent === 'Riso ink: use less, let the paper speak', untitled.querySelector('.note__title').textContent);
  check('stored title stays empty', noteStore(w).find(n => n.color === 'mint').title === '');

  console.log('\n== notes: pin ==');
  const pinButton = untitled.querySelector('[data-action="pin-note"]');
  pinButton.click();
  check('pin state persisted', noteStore(w).find(n => n.color === 'mint').pinned === true);
  check('pinned note floats to the top', noteCards(d)[0].dataset.color === 'mint', noteCards(d).map(c => c.dataset.color).join('|'));
  check('pin button marked pressed', noteCards(d)[0].querySelector('.note__pin').getAttribute('aria-pressed') === 'true');
  check('summary mentions pinned notes', d.getElementById('notesSummary').textContent === '2 notes · 1 pinned', d.getElementById('notesSummary').textContent);
  d.querySelector('[data-note-filter="pinned"]').click();
  check('pinned filter shows only pinned', noteCards(d).length === 1 && noteCards(d)[0].dataset.color === 'mint');
  d.querySelector('[data-note-filter="all"]').click();
  check('all filter restores both', noteCards(d).length === 2);
  check('all filter pressed state', d.querySelector('[data-note-filter="all"]').getAttribute('aria-pressed') === 'true');

  console.log('\n== notes: search + sort ==');
  typeNoteSearch(w, 'poster');
  check('search matches note body', noteCards(d).length === 1 && noteCards(d)[0].dataset.color === 'blue', String(noteCards(d).length));
  typeNoteSearch(w, 'zzz');
  check('no-match empty state shown', noteCards(d).length === 0 && d.getElementById('notesEmpty').hidden === false);
  check('no-match copy mentions the query', d.getElementById('notesEmptyTitle').textContent.indexOf('No notes match') === 0, d.getElementById('notesEmptyTitle').textContent);
  typeNoteSearch(w, '');
  check('clearing the note search restores', noteCards(d).length === 2);
  const pickNoteSort = value => {
    d.getElementById('noteSortSelect').value = value;
    d.getElementById('noteSortSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  pickNoteSort('alpha');
  check('A->Z keeps the pinned note on top', noteCards(d)[0].dataset.color === 'mint' && noteCards(d)[1].querySelector('.note__title').textContent === 'Palette ideas', noteCards(d).map(c => c.querySelector('.note__title').textContent).join('|'));
  noteCards(d)[0].querySelector('[data-action="pin-note"]').click();
  check('A->Z applies once nothing is pinned', noteCards(d).map(c => c.querySelector('.note__title').textContent).join('|') === 'Palette ideas|Riso ink: use less, let the paper speak', noteCards(d).map(c => c.querySelector('.note__title').textContent).join('|'));
  noteCards(d).find(c => c.dataset.color === 'mint').querySelector('[data-action="pin-note"]').click();
  pickNoteSort('created');
  check('created sort keeps the newest first', noteCards(d)[0].dataset.color === 'mint', noteCards(d)[0].dataset.color);
  pickNoteSort('updated');

  console.log('\n== notes: inline edit ==');
  const editTarget = noteCards(d).find(c => c.dataset.color === 'blue');
  editTarget.querySelector('[data-action="edit-note"]').click();
  let noteEditor = d.querySelector('.note__editor');
  check('editor opened', !!noteEditor && !!noteEditor.querySelector('input') && !!noteEditor.querySelector('textarea'));
  check('editor prefilled with the title', noteEditor.querySelector('input').value === 'Palette ideas');
  check('editor prefilled with the body', noteEditor.querySelector('textarea').value.indexOf('Riso blue') !== -1);
  check('editor offers five colour dots', noteEditor.querySelectorAll('.color-dot').length === 5);
  noteEditor.querySelector('input').value = 'Palette ideas (final)';
  noteEditor.querySelector('textarea').value = 'Cream\nRiso blue\nPoster red\nPaper white';
  noteEditor.querySelector('.color-dot.swatch__dot--red').click();
  noteEditor.querySelector('.btn.btn--primary').click();
  check('note title saved', noteStore(w).some(n => n.title === 'Palette ideas (final)'));
  check('note colour saved from the editor', noteStore(w).find(n => n.title === 'Palette ideas (final)').color === 'red');
  check('note body saved', noteStore(w).find(n => n.title === 'Palette ideas (final)').body.split('\n').length === 4);
  check('editor closed after saving', d.querySelector('.note__editor') === null);
  check('card shows the new colour', noteCards(d).some(c => c.dataset.color === 'red'));

  const cancelTarget = noteCards(d).find(c => c.dataset.color === 'mint');
  cancelTarget.querySelector('[data-action="edit-note"]').click();
  noteEditor = d.querySelector('.note__editor');
  noteEditor.querySelector('input').value = 'Should not stick';
  noteEditor.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  check('Escape cancels the note edit', !noteStore(w).some(n => n.title === 'Should not stick'));
  check('both notes still rendered', noteCards(d).length === 2);

  console.log('\n== notes: delete + undo ==');
  const notesBefore = noteCards(d).length;
  const noteDoomed = noteCards(d).find(c => c.dataset.color === 'red');
  noteDoomed.querySelector('[data-action="delete-note"]').click();
  check('note removed from storage at once', noteStore(w).length === notesBefore - 1);
  check('note animates out', noteDoomed.classList.contains('is-removing'));
  await wait(380);
  check('note list re-rendered', noteCards(d).length === notesBefore - 1, String(noteCards(d).length));
  check('toast announces the deleted note', d.getElementById('toastText').textContent.indexOf('Deleted note') === 0, d.getElementById('toastText').textContent);
  d.getElementById('toastAction').click();
  check('undo restores the note', noteCards(d).length === notesBefore && noteStore(w).length === notesBefore, String(noteStore(w).length));

  console.log('\n== notes: keyboard shortcuts ==');
  const noteSearchBox = d.getElementById('noteSearch');
  noteSearchBox.blur();
  d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  check('/ focuses the notes search box', d.activeElement === noteSearchBox, d.activeElement ? (d.activeElement.id || d.activeElement.tagName) : 'none');
  const bodyArea = d.getElementById('noteBody');
  bodyArea.value = 'Added with the keyboard shortcut';
  bodyArea.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  check('Ctrl+Enter in the textarea saves the note', noteStore(w).length === notesBefore + 1, String(noteStore(w).length));

  console.log('\n== load sample data ==');
  const dom5 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom5.window.console.warn = () => {};
  dom5.window.eval(js);
  const w5 = dom5.window;
  const d5 = w5.document;
  const sampleBtn = d5.getElementById('sampleBtn');
  check('sample button exists with a test id', !!sampleBtn && sampleBtn.getAttribute('data-testid') === 'test-load-sample');
  sampleBtn.click();
  const sampleTasks = JSON.parse(w5.localStorage.getItem('riso-todo.tasks.v1') || '[]');
  const sampleNotes = JSON.parse(w5.localStorage.getItem('riso-todo.notes.v1') || '[]');
  check('five sample tasks loaded', sampleTasks.length === 5, String(sampleTasks.length));
  check('three sample notes loaded', sampleNotes.length === 3, String(sampleNotes.length));
  check('sample tasks rendered', d5.getElementById('taskList').children.length === 5, String(d5.getElementById('taskList').children.length));
  check('sample notes rendered', d5.getElementById('noteList').children.length === 3, String(d5.getElementById('noteList').children.length));
  check('sample tasks have real due dates', sampleTasks.every(t => t.due === null || /^\d{4}-\d{2}-\d{2}$/.test(t.due)));
  check('one sample task is already done', sampleTasks.filter(t => t.done).length === 1);
  check('sample notes keep their colours', sampleNotes.map(n => n.color).sort().join(',') === 'blue,violet,yellow', sampleNotes.map(n => n.color).join(','));
  check('one sample note is pinned', sampleNotes.filter(n => n.pinned).length === 1);
  check('sample toast explains what happened', d5.getElementById('toastText').textContent === 'Loaded 5 sample tasks and 3 sample notes', d5.getElementById('toastText').textContent);
  check('tab badges reflect the samples', d5.getElementById('tabTasksCount').textContent === '4' && d5.getElementById('tabNotesCount').textContent === '3', d5.getElementById('tabTasksCount').textContent + '/' + d5.getElementById('tabNotesCount').textContent);
  check('sample overdue task is flagged', !!d5.querySelector('#taskList .is-overdue'));
  sampleBtn.click();
  check('clicking twice does not duplicate', JSON.parse(w5.localStorage.getItem('riso-todo.tasks.v1')).length === 5 && JSON.parse(w5.localStorage.getItem('riso-todo.notes.v1')).length === 3);
  check('second click explains itself', d5.getElementById('toastText').textContent === 'Sample data is already loaded', d5.getElementById('toastText').textContent);
  d5.querySelector('#taskList [data-action="delete"]').click();
  check('sample tasks behave like normal tasks', JSON.parse(w5.localStorage.getItem('riso-todo.tasks.v1')).length === 4);

  console.log('\n== persistence across a fresh page load ==');
  const stored = w.localStorage.getItem('riso-todo.tasks.v1');
  const dom2 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.console.warn = () => {};
  dom2.window.localStorage.setItem('riso-todo.tasks.v1', stored);
  dom2.window.localStorage.setItem('riso-todo.theme', nextTheme);
  dom2.window.eval(js);
  const d2 = dom2.window.document;
  check('tasks restored on reload', d2.getElementById('taskList').children.length === JSON.parse(stored).length, d2.getElementById('taskList').children.length + ' vs ' + JSON.parse(stored).length);
  check('theme restored on reload', d2.documentElement.dataset.theme === nextTheme);

  console.log('\n== resilience ==');
  const dom3 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom3.window.console.warn = () => {};
  dom3.window.localStorage.setItem('riso-todo.tasks.v1', '{{{not json');
  dom3.window.eval(js);
  check('corrupt storage does not crash the app', dom3.window.document.getElementById('taskList').children.length === 0);
  const dom4 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom4.window.console.warn = () => {};
  dom4.window.localStorage.setItem('riso-todo.tasks.v1', JSON.stringify([
    null, 42, { title: '   ' }, { title: 'Good one', priority: 'nonsense', tags: 'not-an-array', due: 99, done: 'yes' }
  ]));
  dom4.window.eval(js);
  const cards4 = dom4.window.document.getElementById('taskList').children;
  check('junk entries filtered out and one task salvaged', cards4.length === 1, String(cards4.length));
  check('salvaged task got a safe fallback priority', cards4.length === 1 && cards4[0].dataset.priority === 'medium', cards4.length ? cards4[0].dataset.priority : 'n/a');
  check('missing due date hides the time chips', cards4.length === 1 && cards4[0].querySelector('.chip--due').hidden === true);

  console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log(' - ' + f); });
    process.exit(1);
  }
  process.exit(0);


})().catch(function (err) {
  console.log('HARNESS ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
