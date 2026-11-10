/* Рендер: строит DOM по состоянию. Список задач обновляется точечно (keyed diff),
   поэтому фокус и прокрутка не теряются, а 1000 задач не перерисовываются целиком. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var util = App.util;
  var icons = App.icons;
  var el = util.el;
  var setText = util.setText;

  var refs = {};
  var navNodes = new Map();
  var taskNodes = new Map();
  var motionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function currentState() {
    return App.store.get();
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

    item.classList.toggle('is-active', isActive);
    if (isActive) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');

    setText(name, list.name);
    paintDot(dot, list.color);
    setText(count, String(counts ? counts.active : 0));
    button.setAttribute('aria-label', list.name + ': ' + (counts ? counts.active : 0) + ' активных');
    count.title = 'Активных задач: ' + (counts ? counts.active : 0);
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

  // ——— Задачи ———

  function taskSignature(task) {
    return [task.done ? 1 : 0, task.title, task.due || '', task.priority, task.listId, task.tags.join('\u0001'), task.order].join(
      '\u0002'
    );
  }

  function createTaskNode(task, animate) {
    var item = el('li', 'task');
    item.dataset.id = task.id;
    if (animate) item.classList.add('task--enter');

    var row = el('div', 'task__row');

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

    var actions = el('div', 'task__actions');
    actions.appendChild(iconButton('delete', 'trash', 'Удалить задачу'));

    row.appendChild(check);
    row.appendChild(body);
    row.appendChild(actions);
    item.appendChild(row);

    updateTaskNode(item, task);
    return item;
  }

  function updateTaskNode(item, task) {
    var signature = taskSignature(task);
    if (item.dataset.sig === signature) return;
    item.dataset.sig = signature;

    item.classList.toggle('is-done', task.done);

    var check = item.querySelector('.task__check');
    check.setAttribute('aria-checked', task.done ? 'true' : 'false');
    check.setAttribute('aria-label', (task.done ? 'Снять отметку: ' : 'Отметить: ') + task.title);

    var title = item.querySelector('.task__title');
    setText(title, task.title);

    var deleteButton = item.querySelector('[data-action="delete"]');
    if (deleteButton) deleteButton.setAttribute('aria-label', 'Удалить: ' + task.title);
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

  function renderEmpty() {
    var state = currentState();
    var list = App.selectors.findList(state, App.selectors.currentListId(state));
    setText(refs.emptyTitle, 'Пока пусто');
    setText(refs.emptyText, 'Добавьте первую задачу в «' + (list ? list.name : 'Входящие') + '» — начните с той, что важнее всего сегодня.');
  }

  function renderTasks() {
    var state = currentState();
    var query = App.view && App.view.query ? App.view.query : '';
    var visible = App.selectors.visibleTasks(state, query, new Date());
    var list = refs.taskList;
    var seen = {};
    var animate = visible.length <= 200 && !motionQuery.matches;

    visible.forEach(function (task, index) {
      var node = taskNodes.get(task.id);
      if (!node) {
        node = createTaskNode(task, animate);
        taskNodes.set(task.id, node);
      } else {
        updateTaskNode(node, task);
      }
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
    renderTasks();
  }

  App.render = {
    init: init,
    update: update,
    taskSignature: taskSignature
  };
})(window);
