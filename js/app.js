/* Точка сборки: связывает состояние, хранилище, рендер и события.
   Обработчики навешаны на контейнеры (делегирование), а не на каждую задачу. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var store = null;
  var refs = {};
  var warnedSave = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function boot() {
    var loaded = App.storage.load(new Date());

    store = App.createStore();
    App.store = store;
    store.init(loaded.state);
    App.view = { query: '', editingId: null, expanded: new Set() };

    refs = {
      app: byId('app'),
      main: byId('main'),
      sidebar: byId('sidebar'),
      sidebarClose: byId('sidebarClose'),
      menuBtn: byId('menuBtn'),
      scrim: byId('scrim'),
      listNav: byId('listNav'),
      addListBtn: byId('addListBtn'),
      pageTitle: byId('pageTitle'),
      statTotal: byId('statTotal'),
      statTotalWord: byId('statTotalWord'),
      statDone: byId('statDone'),
      searchInput: byId('searchInput'),
      searchClear: byId('searchClear'),
      filterChips: byId('filterChips'),
      sortSelect: byId('sortSelect'),
      composer: byId('composer'),
      taskInput: byId('taskInput'),
      taskList: byId('taskList'),
      emptyState: byId('emptyState'),
      emptyTitle: byId('emptyTitle'),
      emptyText: byId('emptyText'),
      emptyReset: byId('emptyReset'),
      toasts: byId('toasts'),
      live: byId('live')
    };

    App.render.init(refs);
    App.ui.init({ toasts: refs.toasts, live: refs.live });
    App.dialogs.init();
    store.subscribe(handleChange);
    bindEvents();
    App.render.update('init');

    if (loaded.warning) {
      App.ui.toast(loaded.warning, { variant: 'warn', duration: 10000 });
    }
  }

  function handleChange() {
    var result = App.storage.save(store.get());
    App.render.update('change');
    if (!result.ok && !warnedSave) {
      warnedSave = true;
      App.ui.toast(result.error, { variant: 'warn', duration: 10000 });
    }
  }

  // ——— Утилиты работы с DOM задач ———

  function taskElement(taskId) {
    var items = refs.taskList.querySelectorAll('.task');
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].dataset.id === taskId) return items[i];
    }
    return null;
  }

  function focusTaskAction(taskId, action) {
    var item = taskElement(taskId);
    if (!item) return false;
    var control = item.querySelector('[data-action="' + action + '"]');
    if (!control) return false;
    control.focus();
    return true;
  }

  function focusSubtask(taskId, subtaskId) {
    var item = taskElement(taskId);
    if (!item) return false;
    var control = item.querySelector('[data-action="subtask-toggle"][data-sub-id="' + subtaskId + '"]');
    if (!control) return false;
    control.focus();
    return true;
  }

  function focusSubtaskInput(taskId) {
    var item = taskElement(taskId);
    if (!item) return false;
    var input = item.querySelector('[data-sub-input]');
    if (!input) return false;
    input.focus();
    return true;
  }

  function findVisibleTaskIndex(taskId) {
    var visible = App.selectors.visibleTasks(store.get(), App.view.query, new Date());
    for (var i = 0; i < visible.length; i += 1) {
      if (visible[i].id === taskId) return { list: visible, index: i };
    }
    return { list: visible, index: -1 };
  }

  function getTask(taskId) {
    var tasks = store.get().tasks;
    for (var i = 0; i < tasks.length; i += 1) {
      if (tasks[i].id === taskId) return tasks[i];
    }
    return null;
  }

  // ——— Добавление ———

  function ensureTaskVisible() {
    if (App.view.query) {
      App.view.query = '';
      if (refs.searchInput) refs.searchInput.value = '';
      if (refs.searchClear) refs.searchClear.hidden = true;
    }
    if (store.get().settings.filter !== 'all') {
      store.actions.setSettings({ filter: 'all' });
    }
  }

  function handleComposerSubmit(event) {
    event.preventDefault();
    var title = App.util.cleanText(refs.taskInput.value, App.schema.LIMITS.title);

    if (!title) {
      refs.composer.classList.add('is-invalid');
      refs.taskInput.focus();
      App.ui.announce('Пустую задачу добавить нельзя. Введите текст.');
      return;
    }

    ensureTaskVisible();
    var task = store.actions.addTask({ title: title });
    if (!task) return;

    refs.composer.classList.remove('is-invalid');
    refs.taskInput.value = '';
    refs.taskInput.focus();
    App.ui.announce('Добавлена задача: ' + task.title);
  }

  // ——— Инлайн-редактирование ———

  function startInlineEdit(taskId) {
    if (App.view.editingId === taskId) return;
    App.view.editingId = taskId;
    App.render.update('edit-start');
    var item = taskElement(taskId);
    var input = item && item.querySelector('.task__edit-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function commitInlineEdit(taskId, input, options) {
    options = options || {};
    if (!input.isConnected) return;
    if (App.view.editingId !== taskId) return;

    var value = App.util.cleanText(input.value, App.schema.LIMITS.title);
    var task = getTask(taskId);
    App.view.editingId = null;

    if (options.cancel) {
      // Ничего не меняем — просто выходим из режима правки.
    } else if (!value) {
      App.ui.announce('Название не может быть пустым — оставили прежнее.');
    } else if (task && value !== task.title) {
      store.actions.updateTask(taskId, { title: value });
      App.ui.announce('Задача переименована: ' + value);
    }

    App.render.update('edit-end');

    if (!options.fromBlur) {
      if (!focusTaskAction(taskId, 'edit')) refs.taskInput.focus();
    }
  }

  // ——— Действия в карточке задачи ———

  function toggleExpanded(taskId) {
    var expanded = App.view.expanded;
    if (expanded.has(taskId)) expanded.delete(taskId);
    else expanded.add(taskId);
    App.render.update('expand');
    focusTaskAction(taskId, 'toggle-subs');
  }

  function addSubtaskFromCard(taskId, item) {
    var input = item.querySelector('[data-sub-input]');
    if (!input) return;
    var title = App.util.cleanText(input.value, App.schema.LIMITS.subtaskTitle);
    var started = store.actions.addSubtask(taskId, title);
    if (!started) {
      input.focus();
      return;
    }
    focusSubtaskInput(taskId);
    App.ui.announce('Подзадача добавлена: ' + title);
  }

  function deleteTaskWithFocus(taskId) {
    var position = findVisibleTaskIndex(taskId);
    var removed = store.actions.deleteTask(taskId);
    if (!removed) return;
    App.ui.announce('Удалена задача: ' + removed.title);
    var next = position.list[position.index + 1] || position.list[position.index - 1];
    if (!next || !focusTaskAction(next.id, 'delete')) {
      refs.taskInput.focus();
    }
  }

  function handleTaskListClick(event) {
    var trigger = event.target.closest('[data-action]');
    if (!trigger || !refs.taskList.contains(trigger)) return;
    var item = trigger.closest('.task');
    if (!item) return;

    var taskId = item.dataset.id;
    var action = trigger.dataset.action;

    if (action === 'toggle') {
      var toggled = store.actions.toggleTask(taskId);
      if (toggled) {
        App.ui.announce(toggled.done ? 'Выполнено: ' + toggled.title : 'Снова в работе: ' + toggled.title);
      }
      return;
    }

    if (action === 'delete') {
      deleteTaskWithFocus(taskId);
      return;
    }

    if (action === 'edit') {
      App.dialogs.openTask(taskId);
      return;
    }

    if (action === 'toggle-subs') {
      toggleExpanded(taskId);
      return;
    }

    if (action === 'subtask-toggle') {
      var task = store.actions.toggleSubtask(taskId, trigger.dataset.subId);
      if (!task) return;
      var done = task.subtasks.filter(function (subtask) {
        return subtask.done;
      }).length;
      App.ui.announce('Подзадачи: ' + done + ' из ' + task.subtasks.length);
      focusSubtask(taskId, trigger.dataset.subId);
      return;
    }

    if (action === 'subtask-delete') {
      var updated = store.actions.deleteSubtask(taskId, trigger.dataset.subId);
      if (!updated) return;
      App.ui.announce('Подзадача удалена.');
      focusSubtaskInput(taskId);
      return;
    }

    if (action === 'subtask-add') {
      addSubtaskFromCard(taskId, item);
    }
  }

  function handleTaskListKeydown(event) {
    var target = event.target;

    if (target.matches('[data-sub-input]')) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var item = target.closest('.task');
      if (item) addSubtaskFromCard(item.dataset.id, item);
      return;
    }

    if (!target.matches('.task__edit-input')) return;
    var taskItem = target.closest('.task');
    if (!taskItem) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      commitInlineEdit(taskItem.dataset.id, target, {});
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      commitInlineEdit(taskItem.dataset.id, target, { cancel: true });
    }
  }

  function handleTaskListFocusOut(event) {
    var target = event.target;
    if (!target.matches || !target.matches('.task__edit-input')) return;
    var item = target.closest('.task');
    if (!item) return;
    commitInlineEdit(item.dataset.id, target, { fromBlur: true });
  }

  // ——— Поиск и фильтры ———

  function clearSearch() {
    App.view.query = '';
    if (refs.searchInput) refs.searchInput.value = '';
    if (refs.searchClear) refs.searchClear.hidden = true;
  }

  function handleSearchInput() {
    var value = refs.searchInput.value;
    if (refs.searchClear) refs.searchClear.hidden = !value;
    App.view.query = value;
    App.render.update('search');
  }

  function resetFilters() {
    clearSearch();
    store.actions.setSettings({ filter: 'all' });
    App.render.update('reset');
    if (refs.searchInput) refs.searchInput.focus();
  }

  // ——— Мобильное меню ———

  function isNavOpen() {
    return refs.app.classList.contains('is-nav-open');
  }

  function setNavOpen(open, returnFocus) {
    if (!refs.app) return;
    refs.app.classList.toggle('is-nav-open', open);
    refs.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    refs.scrim.hidden = !open;
    document.body.classList.toggle('is-locked', open);
    if (refs.main) refs.main.inert = open;
    if (open) {
      refs.sidebarClose.focus();
    } else if (returnFocus) {
      refs.menuBtn.focus();
    }
  }

  function bindEvents() {
    refs.composer.addEventListener('submit', handleComposerSubmit);
    refs.taskInput.addEventListener('input', function () {
      refs.composer.classList.remove('is-invalid');
    });

    refs.taskList.addEventListener('click', handleTaskListClick);
    refs.taskList.addEventListener('keydown', handleTaskListKeydown);
    refs.taskList.addEventListener('focusout', handleTaskListFocusOut);
    refs.taskList.addEventListener('dblclick', function (event) {
      var title = event.target.closest('.task__title');
      if (!title) return;
      var item = title.closest('.task');
      if (item) startInlineEdit(item.dataset.id);
    });

    refs.searchInput.addEventListener('input', handleSearchInput);
    refs.searchClear.addEventListener('click', function () {
      clearSearch();
      App.render.update('search-clear');
      refs.searchInput.focus();
    });

    refs.filterChips.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-filter]');
      if (!chip) return;
      store.actions.setSettings({ filter: chip.dataset.filter });
      App.ui.announce('Фильтр: ' + chip.textContent);
    });

    refs.sortSelect.addEventListener('change', function () {
      store.actions.setSettings({ sort: refs.sortSelect.value });
      App.ui.announce('Сортировка: ' + refs.sortSelect.options[refs.sortSelect.selectedIndex].text);
    });

    refs.emptyReset.addEventListener('click', resetFilters);

    refs.listNav.addEventListener('click', function (event) {
      var more = event.target.closest('[data-action="list-menu"]');
      if (more) {
        App.dialogs.openList(more.dataset.listId);
        return;
      }
      var select = event.target.closest('[data-action="select-list"]');
      if (!select) return;

      var wasOpen = isNavOpen();
      if (wasOpen) setNavOpen(false, false);
      store.actions.setSettings({ listId: select.dataset.listId });
      if (App.view.query) clearSearch();
      App.render.update('list-select');
      if (wasOpen && refs.main) refs.main.focus();
    });

    refs.addListBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      App.dialogs.openList(null);
    });

    refs.menuBtn.addEventListener('click', function () {
      setNavOpen(true);
    });
    refs.sidebarClose.addEventListener('click', function () {
      setNavOpen(false, true);
    });
    refs.scrim.addEventListener('click', function () {
      setNavOpen(false, true);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isNavOpen()) setNavOpen(false, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
