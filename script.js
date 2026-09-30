/* ============================================================
   Riso Todo — application logic (vanilla JavaScript, no deps)
   ------------------------------------------------------------
   State lives in one array of task objects and is mirrored to
   localStorage. Every mutation calls render() so the DOM always
   reflects the state.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'riso-todo.tasks.v1';
  var NOTES_KEY = 'riso-todo.notes.v1';
  var THEME_KEY = 'riso-todo.theme';
  var VIEW_KEY = 'riso-todo.view';
  var MAX_TITLE = 140;
  var MAX_TAGS = 6;
  var MAX_NOTE_TITLE = 90;
  var MAX_NOTE_BODY = 2000;
  var NOTE_COLORS = ['yellow', 'blue', 'red', 'mint', 'violet'];
  var MS_DAY = 86400000;

  var PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  var PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

  var el = {
    form: document.getElementById('taskForm'),
    title: document.getElementById('taskTitle'),
    due: document.getElementById('taskDue'),
    priority: document.getElementById('taskPriority'),
    tags: document.getElementById('taskTags'),
    formError: document.getElementById('formError'),
    list: document.getElementById('taskList'),
    template: document.getElementById('taskTemplate'),
    search: document.getElementById('searchInput'),
    sort: document.getElementById('sortSelect'),
    clearDone: document.getElementById('clearDoneBtn'),
    filterGroup: document.getElementById('filterGroup'),
    progressFill: document.getElementById('progressFill'),
    progressValue: document.getElementById('progressValue'),
    summary: document.getElementById('summaryText'),
    emptyState: document.getElementById('emptyState'),
    emptyTitle: document.getElementById('emptyTitle'),
    emptyText: document.getElementById('emptyText'),
    sampleBtn: document.getElementById('sampleBtn'),
    themeToggle: document.getElementById('themeToggle'),
    themeGlyph: document.getElementById('themeGlyph'),
    themeText: document.getElementById('themeText'),
    todayLabel: document.getElementById('todayLabel'),
    tabbar: document.getElementById('tabbar'),
    tabTasks: document.getElementById('tabTasks'),
    tabNotes: document.getElementById('tabNotes'),
    tabTasksCount: document.getElementById('tabTasksCount'),
    tabNotesCount: document.getElementById('tabNotesCount'),
    viewTasks: document.getElementById('viewTasks'),
    viewNotes: document.getElementById('viewNotes'),
    noteForm: document.getElementById('noteForm'),
    noteTitle: document.getElementById('noteTitle'),
    noteBody: document.getElementById('noteBody'),
    noteFormError: document.getElementById('noteFormError'),
    noteList: document.getElementById('noteList'),
    noteTemplate: document.getElementById('noteTemplate'),
    noteSearch: document.getElementById('noteSearch'),
    noteSort: document.getElementById('noteSortSelect'),
    noteFilterGroup: document.getElementById('noteFilterGroup'),
    notesSummary: document.getElementById('notesSummary'),
    notesEmpty: document.getElementById('notesEmpty'),
    notesEmptyTitle: document.getElementById('notesEmptyTitle'),
    notesEmptyText: document.getElementById('notesEmptyText'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastAction: document.getElementById('toastAction'),
    live: document.getElementById('liveRegion')
  };

  var tasks = [];          // master list, order === "My order" sort
  var notes = [];          // notes are independent of tasks
  var filter = 'all';      // all | active | done
  var query = '';
  var sort = 'manual';
  var noteQuery = '';
  var noteFilter = 'all';  // all | pinned
  var noteSort = 'updated';
  var currentView = 'tasks';
  var lastDeleted = null;  // { task, index } for the undo toast
  var lastDeletedNote = null; // { note, index } for the undo toast
  var toastTimer = null;
  var dragId = null;

  /* ---------- persistence ---------- */

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !raw.title.trim()) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title: raw.title.trim().slice(0, MAX_TITLE),
      done: Boolean(raw.done),
      priority: PRIORITY_LABEL[raw.priority] ? raw.priority : 'medium',
      due: typeof raw.due === 'string' && raw.due ? raw.due : null,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter(function (tag) { return typeof tag === 'string' && tag.trim(); }).slice(0, MAX_TAGS)
        : [],
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null
    };
  }

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Riso Todo: local storage is unavailable — tasks will not persist.', err);
    }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        tasks = parsed.map(normalize).filter(Boolean);
      }
    } catch (err) {
      console.warn('Riso Todo: saved tasks could not be read.', err);
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.warn('Riso Todo: tasks could not be saved.', err);
    }
  }

  function normalizeNote(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_NOTE_TITLE) : '';
    var body = typeof raw.body === 'string' ? raw.body.slice(0, MAX_NOTE_BODY) : '';
    if (!title && !body.trim()) return null;

    var created = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title: title,
      body: body,
      color: NOTE_COLORS.indexOf(raw.color) !== -1 ? raw.color : 'yellow',
      pinned: Boolean(raw.pinned),
      createdAt: created,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : created
    };
  }

  function loadNotes() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(NOTES_KEY);
    } catch (err) {
      return;
    }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        notes = parsed.map(normalizeNote).filter(Boolean);
      }
    } catch (err) {
      console.warn('Riso Todo: saved notes could not be read.', err);
    }
  }

  function saveNotes() {
    try {
      window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (err) {
      console.warn('Riso Todo: notes could not be saved.', err);
    }
  }

  /* ---------- dates ---------- */

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** "2026-09-28" -> local midnight timestamp (null when unusable). */
  function parseDue(value) {
    var parts = String(value).split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).getTime();
  }

  function formatDue(value) {
    var stamp = parseDue(value);
    if (stamp === null) return '';
    var days = Math.round((stamp - startOfToday()) / MS_DAY);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return new Date(stamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function formatRemaining(value) {
    var stamp = parseDue(value);
    if (stamp === null) return '';
    var days = Math.round((stamp - startOfToday()) / MS_DAY);

    if (days < 0) {
      var late = Math.abs(days);
      return late + (late === 1 ? ' day overdue' : ' days overdue');
    }
    if (days === 0) {
      var hoursLeft = Math.round((stamp + MS_DAY - Date.now()) / 3600000);
      if (hoursLeft <= 1) return 'due within the hour';
      return 'due in ' + hoursLeft + ' hours';
    }
    if (days === 1) return 'due tomorrow';
    if (days < 8) return 'due in ' + days + ' days';
    if (days < 31) {
      var weeks = Math.round(days / 7);
      return 'due in ' + weeks + (weeks === 1 ? ' week' : ' weeks');
    }
    var months = Math.round(days / 30);
    return 'due in ' + months + (months === 1 ? ' month' : ' months');
  }

  function shortDate(date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /** "YYYY-MM-DD" for today plus `days`, used by the sample data. */
  function offsetISO(days) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /* ---------- selectors & sorting ---------- */

  function matches(task, q) {
    if (!q) return true;
    if (task.title.toLowerCase().indexOf(q) !== -1) return true;
    return task.tags.some(function (tag) { return tag.toLowerCase().indexOf(q) !== -1; });
  }

  function visibleTasks() {
    var q = query.trim().toLowerCase();

    var list = tasks.filter(function (task) {
      if (filter === 'active' && task.done) return false;
      if (filter === 'done' && !task.done) return false;
      return matches(task, q);
    });

    if (sort === 'manual') return list;

    var copy = list.slice();
    if (sort === 'due') {
      copy.sort(function (a, b) {
        var da = a.due ? parseDue(a.due) : Infinity;
        var db = b.due ? parseDue(b.due) : Infinity;
        if (da === null) da = Infinity;
        if (db === null) db = Infinity;
        return da - db || a.createdAt - b.createdAt;
      });
    } else if (sort === 'priority') {
      copy.sort(function (a, b) {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt - b.createdAt;
      });
    } else if (sort === 'created') {
      copy.sort(function (a, b) { return b.createdAt - a.createdAt; });
    } else if (sort === 'alpha') {
      copy.sort(function (a, b) { return a.title.localeCompare(b.title); });
    }
    return copy;
  }

  function isOverdue(task) {
    if (!task.due || task.done) return false;
    var stamp = parseDue(task.due);
    return stamp !== null && stamp < startOfToday();
  }

  /* ---------- rendering ---------- */

  function createTaskNode(task) {
    var node = el.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.dataset.priority = task.priority;
    node.classList.toggle('is-done', task.done);

    var check = node.querySelector('.task__check');
    check.setAttribute('aria-checked', String(task.done));
    check.setAttribute('aria-label', task.done
      ? 'Mark "' + task.title + '" as not done'
      : 'Mark "' + task.title + '" as done');

    node.querySelector('.task__title').textContent = task.title;
    node.querySelector('.task__title').title = task.title + ' — double-click to edit';

    node.querySelector('.chip--prio').textContent = PRIORITY_LABEL[task.priority];

    var status = node.querySelector('.chip--status');
    status.textContent = task.done ? 'done' : 'pending';

    var tagList = node.querySelector('.task__tags');
    if (task.tags.length) {
      task.tags.forEach(function (tag) {
        var item = document.createElement('li');
        item.className = 'tag';
        item.dataset.tag = tag;
        item.textContent = '#' + tag;
        item.title = 'Show tasks tagged ' + tag;
        tagList.appendChild(item);
      });
    } else {
      tagList.hidden = true;
    }

    var dueChip = node.querySelector('.chip--due');
    if (task.due) {
      dueChip.textContent = formatDue(task.due);
    } else {
      dueChip.hidden = true;
    }

    paintTimeChips(task, node);
    return node;
  }

  /** Keeps the due / remaining / overdue chips in sync with "now". */
  function paintTimeChips(task, node) {
    var remaining = node.querySelector('.chip--remaining');
    var overdue = node.querySelector('.chip--overdue');
    var dueChip = node.querySelector('.chip--due');
    var late = isOverdue(task);

    if (remaining) {
      if (!task.due) {
        remaining.hidden = true;
      } else {
        remaining.hidden = false;
        remaining.textContent = task.done ? 'completed' : formatRemaining(task.due);
      }
    }
    if (dueChip) dueChip.classList.toggle('is-late', late);
    if (overdue) overdue.hidden = !late;
    node.classList.toggle('is-overdue', late);
  }

  function render() {
    var visible = visibleTasks();

    var frag = document.createDocumentFragment();
    visible.forEach(function (task) { frag.appendChild(createTaskNode(task)); });
    el.list.textContent = '';
    el.list.appendChild(frag);

    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    var active = total - done;
    var late = tasks.filter(isOverdue).length;
    var percent = total ? Math.round((done / total) * 100) : 0;

    el.progressFill.style.width = percent + '%';
    el.progressValue.textContent = percent + '% complete';

    if (!total) {
      el.summary.textContent = 'No tasks yet';
    } else {
      var summary = active + (active === 1 ? ' open task' : ' open tasks') +
        ' · ' + done + ' done';
      if (late) summary += ' · ' + late + ' overdue';
      el.summary.textContent = summary;
    }

    el.clearDone.disabled = done === 0;
    el.tabTasksCount.textContent = String(active);

    renderEmptyState(visible.length, total);
  }

  function renderEmptyState(visibleCount, total) {
    if (visibleCount > 0) {
      el.emptyState.hidden = true;
      return;
    }

    el.emptyState.hidden = false;

    if (!total) {
      el.emptyTitle.textContent = 'Nothing here yet';
      el.emptyText.textContent = 'Add your first task on the left and watch this page fill up with tiny wins.';
      return;
    }
    if (query.trim()) {
      el.emptyTitle.textContent = 'No matches for “' + query.trim() + '”';
      el.emptyText.textContent = 'Try another word, or clear the search box to see every task again.';
      return;
    }
    if (filter === 'done') {
      el.emptyTitle.textContent = 'Nothing finished yet';
      el.emptyText.textContent = 'Tick a task off and it will land here like a stamp on a finished job.';
      return;
    }
    if (filter === 'active') {
      el.emptyTitle.textContent = 'You are all caught up';
      el.emptyText.textContent = 'Every task is done. Enjoy the quiet — or start something new.';
      return;
    }
    el.emptyTitle.textContent = 'Nothing to show';
    el.emptyText.textContent = 'Adjust the filters above to see your tasks again.';
  }
  /* ---------- helpers ---------- */

  function announce(message) {
    el.live.textContent = '';
    window.setTimeout(function () { el.live.textContent = message; }, 50);
  }

  function shorten(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function reduceMotion() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function findTask(id) {
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) return tasks[i];
    }
    return null;
  }

  function taskNode(id) {
    var esc = window.CSS && window.CSS.escape ? window.CSS.escape(id) : id;
    return el.list.querySelector('.task[data-id="' + esc + '"]');
  }

  function focusTitle(id) {
    var node = taskNode(id);
    var title = node && node.querySelector('.task__title');
    if (title) title.focus();
  }

  /* ---------- mutations ---------- */

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;
    save();
    render();
    announce((task.done ? 'Completed ' : 'Reopened ') + task.title + '.');
  }

  function deleteTask(id) {
    var index = -1;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) { index = i; break; }
    }
    if (index === -1) return;

    var task = tasks.splice(index, 1)[0];
    lastDeleted = { task: task, index: index };
    save();

    var node = taskNode(id);
    var settled = false;
    var finish = function () {
      if (settled) return;
      settled = true;
      render();
      showToast('Deleted “' + shorten(task.title, 34) + '”', 'Undo', undoDelete);
    };

    if (node && !reduceMotion()) {
      node.classList.add('is-removing');
      window.setTimeout(finish, 300);
    } else {
      finish();
    }
    announce('Deleted ' + task.title + '.');
  }

  function undoDelete() {
    if (!lastDeleted) return;
    var task = lastDeleted.task;
    var index = Math.min(lastDeleted.index, tasks.length);
    lastDeleted = null;
    tasks.splice(index, 0, task);
    save();
    render();
    announce('Restored ' + task.title + '.');
  }

  function clearCompleted() {
    var done = tasks.filter(function (t) { return t.done; });
    if (!done.length) {
      announce('There is nothing finished to clear.');
      return;
    }
    tasks = tasks.filter(function (t) { return !t.done; });
    lastDeleted = null;
    save();
    render();
    showToast('Cleared ' + done.length + (done.length === 1 ? ' finished task' : ' finished tasks'), null, null);
    announce('Cleared ' + done.length + ' finished tasks.');
  }

  function startEditing(id) {
    var node = taskNode(id);
    if (!node || node.querySelector('.task__edit')) return;

    var task = findTask(id);
    var title = node.querySelector('.task__title');
    if (!task || !title) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'task__edit';
    input.value = task.title;
    input.maxLength = MAX_TITLE;
    input.setAttribute('aria-label', 'Edit task title');

    title.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    var closed = false;
    function close(commit) {
      if (closed) return;
      closed = true;

      if (commit) {
        var next = input.value.trim().replace(/\s+/g, ' ');
        if (next && next !== task.title) {
          task.title = next.slice(0, MAX_TITLE);
          save();
          announce('Renamed to ' + task.title + '.');
        }
      }
      render();
      if (commit) focusTitle(id);
    }

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    });
    input.addEventListener('blur', function () { close(true); });
  }

  /** Swaps the positions of the tasks listed in `orderedIds`, in place. */
  function reorderByIds(orderedIds) {
    var byId = {};
    tasks.forEach(function (task) { byId[task.id] = task; });

    var slots = [];
    tasks.forEach(function (task, index) {
      if (orderedIds.indexOf(task.id) !== -1) slots.push(index);
    });

    slots.forEach(function (slot, i) {
      var next = byId[orderedIds[i]];
      if (next) tasks[slot] = next;
    });
  }

  function moveTask(id, delta) {
    var order = visibleTasks().map(function (task) { return task.id; });
    var from = order.indexOf(id);
    var to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;

    var swapped = order.slice();
    var moved = swapped[from];
    swapped[from] = swapped[to];
    swapped[to] = moved;

    reorderByIds(swapped);
    setSort('manual');
    save();
    render();

    var task = findTask(id);
    announce('Moved ' + (task ? task.title : 'task') + (delta < 0 ? ' up.' : ' down.'));
    focusTitle(id);
  }

  function setSort(mode) {
    sort = mode;
    el.sort.value = mode;
  }
  /* ---------- adding tasks ---------- */

  function parseTags(value) {
    var seen = {};
    var out = [];
    String(value).split(',').forEach(function (raw) {
      var tag = raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
      if (!tag || seen[tag]) return;
      seen[tag] = true;
      out.push(tag.slice(0, 24));
    });
    return out.slice(0, MAX_TAGS);
  }

  function showFormError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
    el.title.classList.add('is-invalid');
    window.setTimeout(function () { el.title.classList.remove('is-invalid'); }, 700);
  }

  function clearFormError() {
    el.formError.hidden = true;
    el.formError.textContent = '';
    el.title.classList.remove('is-invalid');
  }

  function addTask(event) {
    event.preventDefault();

    var title = el.title.value.trim().replace(/\s+/g, ' ');
    if (!title) {
      showFormError('Give your task a name first.');
      el.title.focus();
      return;
    }

    var task = {
      id: uid(),
      title: title.slice(0, MAX_TITLE),
      done: false,
      priority: PRIORITY_LABEL[el.priority.value] ? el.priority.value : 'medium',
      due: el.due.value || null,
      tags: parseTags(el.tags.value),
      createdAt: Date.now(),
      completedAt: null
    };

    tasks.unshift(task);
    clearFormError();
    el.form.reset();
    save();
    render();
    el.title.focus();

    announce('Added ' + task.title + '. ' + tasks.filter(function (t) { return !t.done; }).length + ' still open.');
  }

  /* ---------- list interactions ---------- */

  function listClick(event) {
    var tag = event.target.closest('.tag');
    if (tag && tag.dataset.tag) {
      event.preventDefault();
      el.search.value = tag.dataset.tag;
      query = tag.dataset.tag;
      filter = 'all';
      setFilterButtons();
      render();
      announce('Filtered by tag ' + tag.dataset.tag + '.');
      return;
    }

    var button = event.target.closest('button[data-action]');
    if (!button) return;
    var card = button.closest('.task');
    if (!card) return;

    var id = card.dataset.id;
    var action = button.dataset.action;
    if (action === 'toggle') toggleTask(id);
    else if (action === 'delete') deleteTask(id);
    else if (action === 'edit') startEditing(id);
  }

  function listDblClick(event) {
    var title = event.target.closest('.task__title');
    var card = title && title.closest('.task');
    if (card) startEditing(card.dataset.id);
  }

  function listKeydown(event) {
    var title = event.target.closest('.task__title');
    var card = title && title.closest('.task');
    if (!card) return;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(card.dataset.id);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      deleteTask(card.dataset.id);
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveTask(card.dataset.id, event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  /* ---------- drag to reorder (grab the dotted handle) ---------- */

  function dragAfterElement(y) {
    var cards = Array.prototype.slice.call(el.list.querySelectorAll('.task:not(.is-dragging)'));
    var closest = { offset: -Infinity, node: null };
    cards.forEach(function (card) {
      var box = card.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset: offset, node: card };
    });
    return closest.node;
  }

  function onListPointerDown(event) {
    var card = event.target.closest('.task');
    if (!card) return;
    card.draggable = Boolean(event.target.closest('.task__grip'));
  }

  function onDragStart(event) {
    var card = event.target.closest('.task');
    if (!card || !card.draggable) return;
    dragId = card.dataset.id;
    card.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragId);
    }
  }

  function onDragOver(event) {
    if (!dragId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    var dragging = el.list.querySelector('.task.is-dragging');
    if (!dragging) return;

    var after = dragAfterElement(event.clientY);
    if (after === dragging) return;
    if (after) el.list.insertBefore(dragging, after);
    else el.list.appendChild(dragging);
  }

  function onDragEnd() {
    var dragging = el.list.querySelector('.task.is-dragging');
    dragId = null;
    if (!dragging) return;

    dragging.classList.remove('is-dragging');
    dragging.draggable = false;

    var ids = Array.prototype.map.call(el.list.children, function (child) { return child.dataset.id; });
    reorderByIds(ids);
    setSort('manual');
    save();
    render();
    announce('Task order updated.');
  }
  /* ---------- toolbar ---------- */

  function setFilterButtons() {
    var buttons = Array.prototype.slice.call(el.filterGroup.querySelectorAll('[data-filter]'));
    buttons.forEach(function (button) {
      var active = button.dataset.filter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function refreshTimeChips() {
    Array.prototype.forEach.call(el.list.children, function (node) {
      var task = findTask(node.dataset.id);
      if (task) paintTimeChips(task, node);
    });
  }

  /* ---------- toast ---------- */

  function showToast(message, actionLabel, action) {
    window.clearTimeout(toastTimer);
    el.toastText.textContent = message;

    if (actionLabel && typeof action === 'function') {
      el.toastAction.hidden = false;
      el.toastAction.textContent = actionLabel;
      el.toastAction.onclick = function () {
        hideToast();
        action();
      };
    } else {
      el.toastAction.hidden = true;
      el.toastAction.onclick = null;
    }

    el.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(hideToast, 6500);
  }

  function hideToast() {
    el.toast.classList.remove('is-visible');
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    var ink = theme === 'ink';
    document.documentElement.dataset.theme = ink ? 'ink' : 'paper';
    el.themeToggle.setAttribute('aria-pressed', String(ink));
    el.themeGlyph.textContent = ink ? '☀' : '☾';
    el.themeText.textContent = ink ? 'Paper mode' : 'Ink mode';

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', ink ? '#14110f' : '#fbf4e8');

    try { window.localStorage.setItem(THEME_KEY, ink ? 'ink' : 'paper'); } catch (err) { /* ignore */ }
  }

  function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch (err) { /* ignore */ }

    var prefersInk = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (saved === 'ink' || saved === 'paper') applyTheme(saved);
    else applyTheme(prefersInk ? 'ink' : 'paper');
  }

  /* ---------- sample data ---------- */

  var SAMPLE_TASKS = [
    { title: 'Sketch the poster layout', priority: 'high', dueOffset: 0, tags: ['design', 'print'] },
    { title: 'Mix the second riso ink layer', priority: 'medium', dueOffset: 2, tags: ['print', 'studio'] },
    { title: 'Send the invoice to Ope', priority: 'low', dueOffset: -1, tags: ['admin'] },
    { title: 'Trim the zine proofs', priority: 'medium', dueOffset: 5, tags: ['print'] },
    { title: 'Photograph the finished prints', priority: 'low', dueOffset: null, tags: ['studio'], done: true }
  ];

  var SAMPLE_NOTES = [
    {
      title: 'Ink notes',
      body: 'Riso blue + fluorescent pink is the strongest pair so far.\nOverprint shifts to violet — test it on the poster next.',
      color: 'blue',
      pinned: true
    },
    {
      title: 'Colour swatches',
      body: 'cream #fbf4e8\nriso blue #1f6feb\nposter red #ef4a2b\nmint #17ab8a\nviolet #7b5bf0',
      color: 'violet',
      pinned: false
    },
    {
      title: 'Client call',
      body: 'Ask whether the launch stays on the 12th.\nOnly two revision rounds are included — mention that early.',
      color: 'yellow',
      pinned: false
    }
  ];

  /** Adds the sample tasks/notes that are not already present (never duplicates). */
  function loadSampleData() {
    var stamp = Date.now();
    var addedTasks = 0;
    var addedNotes = 0;

    var existingTaskTitles = tasks.map(function (task) { return task.title; });
    SAMPLE_TASKS.forEach(function (sample, index) {
      if (existingTaskTitles.indexOf(sample.title) !== -1) return;
      tasks.push({
        id: uid(),
        title: sample.title,
        done: Boolean(sample.done),
        priority: sample.priority,
        due: sample.dueOffset === null || sample.dueOffset === undefined ? null : offsetISO(sample.dueOffset),
        tags: sample.tags.slice(),
        createdAt: stamp - index * 60000,
        completedAt: sample.done ? stamp : null
      });
      addedTasks++;
    });

    var existingNoteTitles = notes.map(function (note) { return note.title; });
    SAMPLE_NOTES.forEach(function (sample) {
      if (existingNoteTitles.indexOf(sample.title) !== -1) return;
      notes.unshift({
        id: uid(),
        title: sample.title,
        body: sample.body,
        color: sample.color,
        pinned: Boolean(sample.pinned),
        createdAt: stamp,
        updatedAt: stamp
      });
      addedNotes++;
    });

    if (!addedTasks && !addedNotes) {
      showToast('Sample data is already loaded', null, null);
      announce('Sample data is already loaded.');
      return;
    }

    save();
    saveNotes();
    render();
    renderNotes();

    var message = 'Loaded ' + addedTasks + (addedTasks === 1 ? ' sample task' : ' sample tasks') +
      ' and ' + addedNotes + (addedNotes === 1 ? ' sample note' : ' sample notes');
    showToast(message, null, null);
    announce(message + '.');
  }

  /* ============================================================
     Notes tab
     ============================================================ */

  function findNoteIndex(id) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id) return i;
    }
    return -1;
  }

  function findNote(id) {
    var index = findNoteIndex(id);
    return index === -1 ? null : notes[index];
  }

  function noteNode(id) {
    var esc = window.CSS && window.CSS.escape ? window.CSS.escape(id) : id;
    return el.noteList.querySelector('.note[data-id="' + esc + '"]');
  }

  /** Display title, falling back to the first line of the body. */
  function noteTitle(note) {
    if (note.title) return note.title;
    var first = String(note.body || '').split('\n')[0].trim();
    return first ? shorten(first, 46) : 'Untitled note';
  }

  function noteWordCount(note) {
    var body = String(note.body || '').trim();
    return body ? body.split(/\s+/).length : 0;
  }

  function relativeTime(stamp) {
    var diff = Date.now() - stamp;
    if (diff < 45000) return 'just now';
    var minutes = Math.round(diff / 60000);
    if (minutes < 60) return minutes + (minutes === 1 ? ' min ago' : ' mins ago');
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    return new Date(stamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function noteMatches(note, q) {
    if (!q) return true;
    return (note.title + ' ' + note.body).toLowerCase().indexOf(q) !== -1;
  }

  function visibleNotes() {
    var q = noteQuery.trim().toLowerCase();

    var list = notes.filter(function (note) {
      if (noteFilter === 'pinned' && !note.pinned) return false;
      return noteMatches(note, q);
    });

    var copy = list.slice();
    if (noteSort === 'created') {
      copy.sort(function (a, b) { return b.createdAt - a.createdAt; });
    } else if (noteSort === 'alpha') {
      copy.sort(function (a, b) { return noteTitle(a).localeCompare(noteTitle(b)); });
    } else {
      copy.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    }
    // Pinned notes float to the top; Array#sort is stable, so ties keep order.
    copy.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
    return copy;
  }

  function createNoteNode(note) {
    var node = el.noteTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = note.id;
    node.dataset.color = note.color;
    node.classList.toggle('is-pinned', note.pinned);

    var title = node.querySelector('.note__title');
    title.textContent = noteTitle(note);
    title.title = 'Double-click to edit this note';

    node.querySelector('.note__body').textContent = note.body;

    var pin = node.querySelector('.note__pin');
    pin.setAttribute('aria-pressed', String(note.pinned));
    pin.setAttribute('aria-label', note.pinned ? 'Unpin this note' : 'Pin this note');
    pin.title = note.pinned ? 'Unpin this note' : 'Pin this note';

    node.querySelector('.note__stamp').textContent = 'edited ' + relativeTime(note.updatedAt);

    var words = noteWordCount(note);
    node.querySelector('.note__count').textContent = words + (words === 1 ? ' word' : ' words');

    return node;
  }

  function renderNotes() {
    var visible = visibleNotes();

    var frag = document.createDocumentFragment();
    visible.forEach(function (note) { frag.appendChild(createNoteNode(note)); });
    el.noteList.textContent = '';
    el.noteList.appendChild(frag);

    var pinned = notes.filter(function (note) { return note.pinned; }).length;
    el.tabNotesCount.textContent = String(notes.length);

    if (!notes.length) {
      el.notesSummary.textContent = 'No notes yet';
    } else {
      el.notesSummary.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes') +
        (pinned ? ' · ' + pinned + ' pinned' : '');
    }

    renderNotesEmptyState(visible.length);
  }

  function renderNotesEmptyState(visibleCount) {
    if (visibleCount > 0) {
      el.notesEmpty.hidden = true;
      return;
    }

    el.notesEmpty.hidden = false;

    if (!notes.length) {
      el.notesEmptyTitle.textContent = 'No notes yet';
      el.notesEmptyText.textContent = 'Notes are for the scraps that are not tasks yet: sketches, links, half-formed ideas no one asked for.';
    } else if (noteQuery.trim()) {
      el.notesEmptyTitle.textContent = 'No notes match “' + noteQuery.trim() + '”';
      el.notesEmptyText.textContent = 'Try another word, or clear the search box to see every note again.';
    } else {
      el.notesEmptyTitle.textContent = 'Nothing pinned yet';
      el.notesEmptyText.textContent = 'Pin the notes you want to keep in sight — they float to the top of the pile.';
    }
  }
  function noteColorValue() {
    var checked = el.noteForm.querySelector('input[name="noteColor"]:checked');
    return checked ? checked.value : 'yellow';
  }

  function addNote(event) {
    if (event) event.preventDefault();

    var title = el.noteTitle.value.trim().replace(/\s+/g, ' ');
    var body = el.noteBody.value.replace(/\s+$/, '');

    if (!title && !body.trim()) {
      el.noteFormError.textContent = 'Write a title or a note — either one is fine.';
      el.noteFormError.hidden = false;
      el.noteBody.classList.add('is-invalid');
      window.setTimeout(function () { el.noteBody.classList.remove('is-invalid'); }, 700);
      return;
    }

    var stamp = Date.now();
    notes.unshift({
      id: uid(),
      title: title.slice(0, MAX_NOTE_TITLE),
      body: body.slice(0, MAX_NOTE_BODY),
      color: noteColorValue(),
      pinned: false,
      createdAt: stamp,
      updatedAt: stamp
    });

    el.noteFormError.hidden = true;
    el.noteFormError.textContent = '';
    el.noteForm.reset();
    saveNotes();
    renderNotes();
    el.noteTitle.focus();
    announce('Note added. ' + notes.length + (notes.length === 1 ? ' note saved.' : ' notes saved.'));
  }

  function toggleNotePin(id) {
    var note = findNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    saveNotes();
    renderNotes();
    announce('Note ' + (note.pinned ? 'pinned.' : 'unpinned.'));
  }

  function deleteNote(id) {
    var index = findNoteIndex(id);
    if (index === -1) return;

    var note = notes.splice(index, 1)[0];
    lastDeletedNote = { note: note, index: index };
    saveNotes();

    var node = noteNode(id);
    var settled = false;
    var finish = function () {
      if (settled) return;
      settled = true;
      renderNotes();
      showToast('Deleted note “' + shorten(noteTitle(note), 32) + '”', 'Undo', undoNoteDelete);
    };

    if (node && !reduceMotion()) {
      node.classList.add('is-removing');
      window.setTimeout(finish, 300);
    } else {
      finish();
    }
    announce('Note deleted.');
  }

  function undoNoteDelete() {
    if (!lastDeletedNote) return;
    var note = lastDeletedNote.note;
    var index = Math.min(lastDeletedNote.index, notes.length);
    lastDeletedNote = null;
    notes.splice(index, 0, note);
    saveNotes();
    renderNotes();
    announce('Note restored.');
  }

  function startNoteEditing(id) {
    var node = noteNode(id);
    var note = findNote(id);
    if (!node || !note || node.querySelector('.note__editor')) return;

    var chosen = note.color;
    var editor = document.createElement('div');
    editor.className = 'note__editor';

    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'input';
    titleInput.maxLength = MAX_NOTE_TITLE;
    titleInput.value = note.title;
    titleInput.placeholder = 'Title (optional)';
    titleInput.setAttribute('aria-label', 'Note title');

    var bodyArea = document.createElement('textarea');
    bodyArea.className = 'input input--area';
    bodyArea.rows = 6;
    bodyArea.maxLength = MAX_NOTE_BODY;
    bodyArea.value = note.body;
    bodyArea.placeholder = 'Note text';
    bodyArea.setAttribute('aria-label', 'Note text');

    var colors = document.createElement('div');
    colors.className = 'note__colors';
    NOTE_COLORS.forEach(function (name) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'color-dot swatch__dot--' + name + (name === chosen ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Use ' + name + ' paper');
      dot.setAttribute('aria-pressed', String(name === chosen));
      dot.addEventListener('click', function () {
        chosen = name;
        Array.prototype.forEach.call(colors.children, function (child) {
          var active = child === dot;
          child.classList.toggle('is-active', active);
          child.setAttribute('aria-pressed', String(active));
        });
      });
      colors.appendChild(dot);
    });

    var row = document.createElement('div');
    row.className = 'note__editor-row';

    var saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn--primary';
    saveButton.textContent = 'Save note';

    var cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn--ghost';
    cancelButton.textContent = 'Cancel';

    row.appendChild(saveButton);
    row.appendChild(cancelButton);
    editor.appendChild(titleInput);
    editor.appendChild(bodyArea);
    editor.appendChild(colors);
    editor.appendChild(row);

    node.textContent = '';
    node.classList.add('is-editing');
    node.appendChild(editor);
    titleInput.focus();
    titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);

    var closed = false;
    function close(commit) {
      if (closed) return;
      closed = true;

      if (commit) {
        var nextTitle = titleInput.value.trim().replace(/\s+/g, ' ');
        var nextBody = bodyArea.value.replace(/\s+$/, '');
        if (nextTitle || nextBody.trim()) {
          note.title = nextTitle.slice(0, MAX_NOTE_TITLE);
          note.body = nextBody.slice(0, MAX_NOTE_BODY);
          note.color = chosen;
          note.updatedAt = Date.now();
          saveNotes();
          announce('Note updated.');
        }
      }
      renderNotes();
      if (commit) {
        var fresh = noteNode(id);
        if (fresh) fresh.querySelector('.note__title').focus();
      }
    }

    saveButton.addEventListener('click', function () { close(true); });
    cancelButton.addEventListener('click', function () { close(false); });
    editor.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        close(true);
      }
    });
  }

  /* ---------- tab switching ---------- */

  function setView(view, options) {
    options = options || {};
    currentView = view === 'notes' ? 'notes' : 'tasks';

    [el.tabTasks, el.tabNotes].forEach(function (tab) {
      var active = tab.dataset.view === currentView;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    el.viewTasks.hidden = currentView !== 'tasks';
    el.viewNotes.hidden = currentView !== 'notes';

    try { window.localStorage.setItem(VIEW_KEY, currentView); } catch (err) { /* ignore */ }

    if (options.focusTab) {
      (currentView === 'notes' ? el.tabNotes : el.tabTasks).focus();
    }
    if (!options.silent) {
      announce(currentView === 'notes' ? 'Notes tab.' : 'Tasks tab.');
    }
  }

  function initView() {
    var saved = null;
    try { saved = window.localStorage.getItem(VIEW_KEY); } catch (err) { /* ignore */ }
    setView(saved === 'notes' ? 'notes' : 'tasks', { silent: true });
  }

  function setNoteFilterButtons() {
    var buttons = Array.prototype.slice.call(el.noteFilterGroup.querySelectorAll('[data-note-filter]'));
    buttons.forEach(function (button) {
      var active = button.dataset.noteFilter === noteFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function noteListClick(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;
    var card = button.closest('.note');
    if (!card) return;

    var id = card.dataset.id;
    var action = button.dataset.action;
    if (action === 'pin-note') toggleNotePin(id);
    else if (action === 'delete-note') deleteNote(id);
    else if (action === 'edit-note') startNoteEditing(id);
  }

  function noteListDblClick(event) {
    var title = event.target.closest('.note__title');
    var card = title && title.closest('.note');
    if (card) startNoteEditing(card.dataset.id);
  }

  function noteListKeydown(event) {
    var title = event.target.closest('.note__title');
    var card = title && title.closest('.note');
    if (!card) return;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startNoteEditing(card.dataset.id);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      deleteNote(card.dataset.id);
    }
  }

  /* ---------- wiring ---------- */


  function bindEvents() {
    el.form.addEventListener('submit', addTask);

    el.title.addEventListener('input', function () {
      if (!el.formError.hidden) clearFormError();
    });

    el.list.addEventListener('click', listClick);
    el.list.addEventListener('dblclick', listDblClick);
    el.list.addEventListener('keydown', listKeydown);
    el.list.addEventListener('pointerdown', onListPointerDown);
    el.list.addEventListener('dragstart', onDragStart);
    el.list.addEventListener('dragover', onDragOver);
    el.list.addEventListener('dragend', onDragEnd);
    el.list.addEventListener('drop', function (event) { event.preventDefault(); });

    el.search.addEventListener('input', function () {
      query = el.search.value;
      render();
    });

    el.filterGroup.addEventListener('click', function (event) {
      var button = event.target.closest('[data-filter]');
      if (!button) return;
      filter = button.dataset.filter;
      setFilterButtons();
      render();
    });

    el.sort.addEventListener('change', function () {
      setSort(el.sort.value);
      render();
      announce('Sorted by ' + el.sort.options[el.sort.selectedIndex].text + '.');
    });

    el.themeToggle.addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'ink' ? 'paper' : 'ink');
    });

    el.clearDone.addEventListener('click', clearCompleted);
    el.sampleBtn.addEventListener('click', loadSampleData);

    /* notes */
    el.noteForm.addEventListener('submit', addNote);

    el.noteTitle.addEventListener('input', function () {
      if (!el.noteFormError.hidden) {
        el.noteFormError.hidden = true;
        el.noteFormError.textContent = '';
        el.noteBody.classList.remove('is-invalid');
      }
    });

    el.noteBody.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        addNote();
      }
    });

    el.noteSearch.addEventListener('input', function () {
      noteQuery = el.noteSearch.value;
      renderNotes();
    });

    el.noteFilterGroup.addEventListener('click', function (event) {
      var button = event.target.closest('[data-note-filter]');
      if (!button) return;
      noteFilter = button.dataset.noteFilter;
      setNoteFilterButtons();
      renderNotes();
    });

    el.noteSort.addEventListener('change', function () {
      noteSort = el.noteSort.value;
      renderNotes();
      announce('Notes sorted by ' + el.noteSort.options[el.noteSort.selectedIndex].text + '.');
    });

    el.noteList.addEventListener('click', noteListClick);
    el.noteList.addEventListener('dblclick', noteListDblClick);
    el.noteList.addEventListener('keydown', noteListKeydown);

    /* tabs */
    el.tabbar.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-view]');
      if (tab) setView(tab.dataset.view);
    });

    el.tabbar.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setView(currentView === 'tasks' ? 'notes' : 'tasks', { focusTab: true });
    });

    document.addEventListener('keydown', function (event) {
      var node = event.target;
      var typing = node instanceof Element &&
        (node.tagName === 'INPUT' || node.tagName === 'SELECT' ||
         node.tagName === 'TEXTAREA' || node.isContentEditable);

      var activeSearch = currentView === 'notes' ? el.noteSearch : el.search;

      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        activeSearch.focus();
      } else if (event.key === 'Escape' && node === activeSearch) {
        if (activeSearch.value) {
          activeSearch.value = '';
          if (currentView === 'notes') {
            noteQuery = '';
            renderNotes();
          } else {
            query = '';
            render();
          }
        } else {
          activeSearch.blur();
        }
      }
    });

    // Keep the relative "due in …" chips honest, and follow other tabs.
    window.setInterval(function () {
      if (document.visibilityState === 'visible') refreshTimeChips();
    }, 30000);

    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) {
        load();
        render();
      } else if (event.key === NOTES_KEY) {
        loadNotes();
        renderNotes();
      } else if (event.key === VIEW_KEY && (event.newValue === 'notes' || event.newValue === 'tasks')) {
        setView(event.newValue, { silent: true });
      }
    });
  }

  /* ---------- start ---------- */

  function init() {
    initTheme();
    el.todayLabel.textContent = shortDate(new Date());
    load();
    loadNotes();
    initView();
    bindEvents();
    render();
    renderNotes();
    if (currentView === 'notes') el.noteTitle.focus();
    else el.title.focus();
  }

  init();




})();
