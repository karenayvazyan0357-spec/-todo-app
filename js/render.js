/* Рендер: строит DOM по состоянию. Список задач обновляется точечно (keyed diff),
   поэтому фокус и прокрутка не теряются, а 1000 задач не перерисовываются целиком. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var util = App.util;
  var icons = App.icons;
  var schema = App.schema;
  var el = util.el;
  var setText = util.setText;

  var refs = {};
  var navNodes = new Map();
  var taskNodes = new Map();
  var motionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function currentState() {
    return App.store.get();
  }

  function view() {
    return App.view || { query: '', editingId: null, expanded: new Set() };
  }

  function init(elements) {
    refs = elements;
    navNodes.clear();
    taskNodes.clear();
  }

  function iconButton(action, iconName, label) {
    var button = el('button', 'icon-btn');
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.appendChild(icons.create(iconName, 16));
    return button;
  }

  // ——— Боковая панель ———

  function createNavItem(list) {
    var item = el('li', 'nav__item');
    item.dataset.listId = list.id;

    var button = el('button', 'nav__btn');
    button.type = 'button';
    button.dataset.action = 'select-list';
    button.dataset.listId = list.id;

    var dot = el('span', 'nav__dot');
    dot.setAttribute('aria-hidden', 'true');
    var name = el('span', 'nav__name');
    button.appendChild(dot);
    button.appendChild(name);

    var count = el('span', 'nav__count num');
    count.setAttribute('aria-hidden', 'true');

    item.appendChild(button);
    item.appendChild(count);

    if (list.id !== schema.INBOX_ID) {
      var more = iconButton('list-menu', 'more', 'Настройки списка');
      more.classList.add('nav__more');
      more.dataset.listId = list.id;
      item.appendChild(more);
    }

    return item;
  }

  function paintDot(dot, color) {
    if (color && color !== 'neutral') dot.style.backgroundColor = color;
    else dot.style.removeProperty('background-color');
  }

  function updateNavItem(item, list, counts, isActive) {
    var button = item.firstElementChild;
    var dot = button.firstElementChild;
    var name = button.lastElementChild;
    var count = item.querySelector('.nav__count');
    var more = item.querySelector('.nav__more');
    var activeCount = counts ? counts.active : 0;

    item.classList.toggle('is-active', isActive);
    if (isActive) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');

    setText(name, list.name);
    paintDot(dot, list.color);
    setText(count, String(activeCount));
    count.title = 'Активных задач: ' + activeCount;
    button.setAttribute('aria-label', list.name + ': ' + activeCount + ' ' + util.plural(activeCount, 'активная', 'активные', 'активных'));
    if (more) more.setAttribute('aria-label', 'Настройки списка «' + list.name + '»');
  }

  function renderSidebar() {
    var state = currentState();
    var counts = App.selectors.countByList(state);
    var currentId = App.selectors.currentListId(state);
    var nav = refs.listNav;
    var seen = {};

    state.lists.forEach(function (list, index) {
      var item = navNodes.get(list.id);
      if (!item) {
        item = createNavItem(list);
        navNodes.set(list.id, item);
      }
      updateNavItem(item, list, counts[list.id], list.id === currentId);
      seen[list.id] = true;

      var expected = nav.children[index] || null;
      if (item !== expected) nav.insertBefore(item, expected);
    });

    navNodes.forEach(function (item, id) {
      if (seen[id]) return;
      item.remove();
      navNodes.delete(id);
    });
  }

  // ——— Заголовок и счётчики ———

  function renderHeader() {
    var state = currentState();
    var listId = App.selectors.currentListId(state);
    var list = App.selectors.findList(state, listId);
    var tasks = App.selectors.listTasks(state, listId);
    var done = tasks.filter(function (task) {
      return task.done;
    }).length;
    var listName = list ? list.name : 'Входящие';

    setText(refs.pageTitle, listName);
    setText(refs.statTotal, String(tasks.length));
    setText(refs.statTotalWord, util.plural(tasks.length, 'задача', 'задачи', 'задач'));
    setText(refs.statDone, String(done));
    document.title = 'Задачи — ' + listName;
  }

  // ——— Панель управления: фильтры, сортировка, поиск ———

  function renderControls() {
    var state = currentState();
    var query = view().query || '';

    if (refs.filterChips) {
      var chips = refs.filterChips.querySelectorAll('[data-filter]');
      for (var i = 0; i < chips.length; i += 1) {
        var active = chips[i].dataset.filter === state.settings.filter;
        chips[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
    if (refs.sortSelect && refs.sortSelect.value !== state.settings.sort) {
      refs.sortSelect.value = state.settings.sort;
    }
    if (refs.searchClear) refs.searchClear.hidden = !query;
  }

  // ——— Задачи ———

  function taskSignature(task) {
    var expanded = view().expanded && view().expanded.has(task.id) ? 1 : 0;
    var sort = App.store ? App.store.get().settings.sort : 'manual';
    var subtasks = task.subtasks
      .map(function (subtask) {
        return subtask.id + ':' + (subtask.done ? 1 : 0) + ':' + subtask.title;
      })
      .join('\u0003');
    return [
      task.done ? 1 : 0,
      task.title,
      task.due || '',
      task.priority,
      task.listId,
      task.tags.join('\u0001'),
      task.order,
      sort,
      expanded,
      subtasks
    ].join('\u0002');
  }

  var PRIORITY_CLASS = { 1: 'low', 2: 'medium', 3: 'high' };

  function buildMeta(task) {
    var meta = el('div', 'task__meta');
    meta.dataset.role = 'meta';

    if (task.priority > 0) {
      var priority = el('span', 'badge badge--priority-' + PRIORITY_CLASS[task.priority]);
      priority.appendChild(el('span', 'badge__shape'));
      priority.appendChild(el('span', null, schema.priorityLabel(task.priority)));
      priority.title = 'Приоритет: ' + schema.priorityLabel(task.priority).toLowerCase();
      meta.appendChild(priority);
    }

    var due = util.formatDue(task.due, new Date());
    if (due) {
      var dueKind = due.kind;
      var dueLabel = due.label;
      // У выполненной задачи срок уже не «горит» — показываем просто дату.
      if (task.done && dueKind !== 'future') {
        dueKind = 'done';
        dueLabel = util.formatDateShort(task.due);
      }
      var dueBadge = el('span', 'badge badge--due-' + dueKind);
      dueBadge.appendChild(icons.create('calendar', 13));
      dueBadge.appendChild(el('span', null, dueLabel));
      dueBadge.title = due.title;
      meta.appendChild(dueBadge);
    }

    if (task.subtasks.length) {
      var doneCount = task.subtasks.filter(function (subtask) {
        return subtask.done;
      }).length;
      var expanded = view().expanded.has(task.id);
      var progress = el('button', 'badge badge--subtasks');
      progress.type = 'button';
      progress.dataset.action = 'toggle-subs';
      progress.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      progress.setAttribute('aria-controls', 'subs-' + task.id);
      progress.setAttribute('aria-label', 'Подзадачи: ' + doneCount + ' из ' + task.subtasks.length);
      progress.title = expanded ? 'Свернуть подзадачи' : 'Показать подзадачи';
      progress.appendChild(icons.create('checklist', 13));
      progress.appendChild(el('span', null, doneCount + ' из ' + task.subtasks.length));

      var track = el('span', 'task__progress');
      track.setAttribute('aria-hidden', 'true');
      var fill = el('span', 'task__progress-fill');
      fill.style.width = Math.round((doneCount / task.subtasks.length) * 100) + '%';
      track.appendChild(fill);
      progress.appendChild(track);
      meta.appendChild(progress);
    }

    if (task.tags.length) {
      var tags = el('span', 'task__tags');
      task.tags.forEach(function (tag) {
        tags.appendChild(el('span', 'task__tag', '#' + tag));
      });
      meta.appendChild(tags);
    }

    return meta;
  }

  function buildSubtaskRow(task, subtask) {
    var row = el('div', 'subtask' + (subtask.done ? ' is-done' : ''));
    row.dataset.subId = subtask.id;

    var check = el('button', 'subtask__check');
    check.type = 'button';
    check.dataset.action = 'subtask-toggle';
    check.dataset.subId = subtask.id;
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', subtask.done ? 'true' : 'false');
    check.setAttribute('aria-label', (subtask.done ? 'Снять отметку: ' : 'Отметить: ') + subtask.title);
    var box = el('span', 'subtask__box');
    box.appendChild(icons.create('check', 10));
    check.appendChild(box);

    var title = el('span', 'subtask__title', subtask.title);

    var remove = iconButton('subtask-delete', 'close', 'Удалить подзадачу: ' + subtask.title);
    remove.classList.add('subtask__delete');
    remove.dataset.subId = subtask.id;

    row.appendChild(check);
    row.appendChild(title);
    row.appendChild(remove);
    return row;
  }

  function buildSubtaskAdd() {
    var add = el('div', 'subtask-add');
    var input = el('input', 'input');
    input.type = 'text';
    input.maxLength = schema.LIMITS.subtaskTitle;
    input.placeholder = 'Добавить подзадачу';
    input.dataset.subInput = '';
    input.setAttribute('aria-label', 'Новая подзадача');
    var submit = el('button', 'btn btn--quiet', 'Добавить');
    submit.type = 'button';
    submit.dataset.action = 'subtask-add';
    add.appendChild(input);
    add.appendChild(submit);
    return add;
  }

  function fillSubs(container, task) {
    container.textContent = '';
    var expanded = view().expanded.has(task.id);
    container.hidden = !expanded;
    if (!expanded) return;

    if (!task.subtasks.length) {
      container.appendChild(el('p', 'subtasks-empty', 'Подзадач пока нет — добавьте первый шаг.'));
    } else {
      task.subtasks.forEach(function (subtask) {
        container.appendChild(buildSubtaskRow(task, subtask));
      });
    }
    container.appendChild(buildSubtaskAdd());
  }

  function createActionsBlock() {
    var actions = el('div', 'task__actions');
    actions.appendChild(iconButton('move-up', 'arrow-up', 'Поднять задачу'));
    actions.appendChild(iconButton('move-down', 'arrow-down', 'Опустить задачу'));
    actions.appendChild(iconButton('toggle-subs', 'checklist', 'Подзадачи'));
    actions.appendChild(iconButton('edit', 'pencil', 'Редактировать задачу'));
    actions.appendChild(iconButton('delete', 'trash', 'Удалить задачу'));
    return actions;
  }

  function createTaskNode(task, animate) {
    var item = el('li', 'task');
    item.dataset.id = task.id;
    if (animate) item.classList.add('task--enter');

    var row = el('div', 'task__row');

    var grip = el('button', 'task__grip');
    grip.type = 'button';
    grip.dataset.action = 'grip';
    grip.setAttribute('aria-label', 'Переставить задачу');
    grip.title = 'Перетащите мышью или пальцем; с клавиатуры — ↑ / ↓';
    grip.appendChild(icons.create('grip', 16));

    var check = el('button', 'task__check');
    check.type = 'button';
    check.dataset.action = 'toggle';
    check.setAttribute('role', 'checkbox');
    var box = el('span', 'task__box');
    box.appendChild(icons.create('check', 13));
    check.appendChild(box);

    var body = el('div', 'task__body');
    var title = el('span', 'task__title');
    title.dataset.action = 'title';
    title.title = 'Двойной клик — редактировать';
    body.appendChild(title);

    var meta = el('div', 'task__meta');
    meta.dataset.role = 'meta';
    body.appendChild(meta);

    var subs = el('div', 'task__subs');
    subs.id = 'subs-' + task.id;
    subs.dataset.role = 'subs';
    body.appendChild(subs);

    row.appendChild(grip);
    row.appendChild(check);
    row.appendChild(body);
    row.appendChild(createActionsBlock());
    item.appendChild(row);

    updateTaskNode(item, task);
    return item;
  }

  function updateTaskNode(item, task) {
    var signature = taskSignature(task);
    if (item.dataset.sig === signature) return;
    item.dataset.sig = signature;

    item.classList.toggle('is-done', task.done);

    var manualSort = currentState().settings.sort === 'manual';
    var grip = item.querySelector('.task__grip');
    grip.hidden = !manualSort;
    grip.setAttribute('aria-label', 'Переставить задачу: ' + task.title);

    var check = item.querySelector('.task__check');
    check.setAttribute('aria-checked', task.done ? 'true' : 'false');
    check.setAttribute('aria-label', (task.done ? 'Снять отметку: ' : 'Отметить: ') + task.title);

    var title = item.querySelector('.task__title');
    if (title) setText(title, task.title);

    var meta = item.querySelector('[data-role="meta"]');
    meta.textContent = '';
    var nextMeta = buildMeta(task);
    while (nextMeta.firstChild) meta.appendChild(nextMeta.firstChild);

    var subs = item.querySelector('[data-role="subs"]');
    fillSubs(subs, task);

    var actions = item.querySelector('.task__actions');
    var moveUp = actions.querySelector('[data-action="move-up"]');
    var moveDown = actions.querySelector('[data-action="move-down"]');
    moveUp.hidden = !manualSort;
    moveDown.hidden = !manualSort;
    moveUp.setAttribute('aria-label', 'Поднять: ' + task.title);
    moveDown.setAttribute('aria-label', 'Опустить: ' + task.title);

    var expand = actions.querySelector('[data-action="toggle-subs"]');
    var expanded = view().expanded.has(task.id);
    var doneCount = task.subtasks.filter(function (subtask) {
      return subtask.done;
    }).length;
    expand.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    expand.setAttribute('aria-controls', 'subs-' + task.id);
    expand.setAttribute(
      'aria-label',
      task.subtasks.length
        ? 'Подзадачи: ' + doneCount + ' из ' + task.subtasks.length + '. ' + (expanded ? 'Свернуть' : 'Показать')
        : 'Подзадачи'
    );
    expand.title = expanded ? 'Свернуть подзадачи' : 'Показать подзадачи';

    actions.querySelector('[data-action="edit"]').setAttribute('aria-label', 'Редактировать: ' + task.title);
    actions.querySelector('[data-action="delete"]').setAttribute('aria-label', 'Удалить: ' + task.title);
  }

  /** Инлайн-редактор живёт рядом с заголовком и не пересоздаётся при точечном апдейте. */
  function syncEditor(item, task) {
    var editing = view().editingId === task.id;
    var title = item.querySelector('.task__title');
    var input = item.querySelector('.task__edit-input');

    if (editing && !input) {
      input = el('input', 'task__edit-input');
      input.type = 'text';
      input.value = task.title;
      input.maxLength = schema.LIMITS.title;
      input.dataset.action = 'edit-input';
      input.setAttribute('aria-label', 'Название задачи');
      title.hidden = true;
      title.parentNode.insertBefore(input, title.nextSibling);
    } else if (!editing && input) {
      input.remove();
      title.hidden = false;
    }
  }

  function removeTaskNode(item) {
    taskNodes.delete(item.dataset.id);
    if (motionQuery.matches) {
      item.remove();
      return;
    }
    item.classList.add('is-leaving');
    global.setTimeout(function () {
      item.remove();
    }, 200);
  }

  // ——— Пустые состояния ———

  function renderEmpty() {
    var state = currentState();
    var query = (view().query || '').trim();
    var filter = state.settings.filter;
    var listId = App.selectors.currentListId(state);
    var list = App.selectors.findList(state, listId);
    var listTasks = App.selectors.listTasks(state, listId);
    var listName = list ? list.name : 'Входящие';
    var title = 'Пока пусто';
    var text = 'Добавьте первую задачу в «' + listName + '» — начните с той, что важнее всего сегодня.';

    if (query) {
      title = 'Ничего не найдено';
      text = 'По запросу «' + query.slice(0, 80) + '» задач нет. Попробуйте другие слова или сбросьте фильтр.';
    } else if (listTasks.length === 0) {
      title = 'Пока пусто';
      text = 'Добавьте первую задачу в «' + listName + '» — начните с той, что важнее всего сегодня.';
    } else if (filter === 'active') {
      title = 'Всё сделано';
      text = 'Ни одной активной задачи. Хороший момент, чтобы выдохнуть.';
    } else if (filter === 'done') {
      title = 'Пока ничего не выполнено';
      text = 'Отмечайте сделанное кружком слева — прогресс посчитается сам.';
    } else if (filter === 'overdue') {
      title = 'Просроченных нет';
      text = 'Сроки под контролем. Так держать.';
    } else if (filter === 'today') {
      title = 'На сегодня задач нет';
      text = 'Загляните в список или добавьте новую задачу со сроком «сегодня».';
    }

    setText(refs.emptyTitle, title);
    setText(refs.emptyText, text);
    if (refs.emptyReset) refs.emptyReset.hidden = !(query || filter !== 'all');
  }

  function renderTasks() {
    var state = currentState();
    var query = view().query || '';
    var visible = App.selectors.visibleTasks(state, query, new Date());
    var list = refs.taskList;
    var seen = {};
    var animate = visible.length <= 200 && !motionQuery.matches;
    list.classList.toggle('is-manual', state.settings.sort === 'manual');

    visible.forEach(function (task, index) {
      var node = taskNodes.get(task.id);
      if (!node) {
        node = createTaskNode(task, animate);
        taskNodes.set(task.id, node);
      } else {
        updateTaskNode(node, task);
      }
      syncEditor(node, task);
      seen[task.id] = true;

      var expected = list.children[index] || null;
      if (node !== expected) list.insertBefore(node, expected);
    });

    Array.prototype.slice.call(list.children).forEach(function (node) {
      if (seen[node.dataset.id] || node.classList.contains('is-leaving')) return;
      removeTaskNode(node);
    });

    var isEmpty = visible.length === 0;
    refs.taskList.hidden = isEmpty;
    refs.emptyState.hidden = !isEmpty;
    if (isEmpty) renderEmpty();
  }

  function update() {
    if (!refs.taskList || !App.store) return;
    renderSidebar();
    renderHeader();
    renderControls();
    renderTasks();
  }

  App.render = {
    init: init,
    update: update,
    taskSignature: taskSignature
  };
})(window);
