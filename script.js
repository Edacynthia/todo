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
  var THEME_KEY = 'riso-todo.theme';
  var MAX_TITLE = 140;
  var MAX_TAGS = 6;
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
    themeToggle: document.getElementById('themeToggle'),
    themeGlyph: document.getElementById('themeGlyph'),
    themeText: document.getElementById('themeText'),
    todayLabel: document.getElementById('todayLabel'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastAction: document.getElementById('toastAction'),
    live: document.getElementById('liveRegion')
  };

  var tasks = [];          // master list, order === "My order" sort
  var filter = 'all';      // all | active | done
  var query = '';
  var sort = 'manual';
  var lastDeleted = null;  // { task, index } for the undo toast
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

    document.addEventListener('keydown', function (event) {
      var node = event.target;
      var typing = node instanceof Element &&
        (node.tagName === 'INPUT' || node.tagName === 'SELECT' ||
         node.tagName === 'TEXTAREA' || node.isContentEditable);

      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        el.search.focus();
      } else if (event.key === 'Escape' && node === el.search) {
        if (el.search.value) {
          el.search.value = '';
          query = '';
          render();
        } else {
          el.search.blur();
        }
      }
    });

    // Keep the relative "due in …" chips honest, and follow other tabs.
    window.setInterval(function () {
      if (document.visibilityState === 'visible') refreshTimeChips();
    }, 30000);

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) return;
      load();
      render();
    });
  }

  /* ---------- start ---------- */

  function init() {
    initTheme();
    el.todayLabel.textContent = shortDate(new Date());
    load();
    bindEvents();
    render();
    el.title.focus();
  }

  init();




})();
