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
    App.view = { query: '' };

    refs = {
      app: byId('app'),
      sidebar: byId('sidebar'),
      sidebarClose: byId('sidebarClose'),
      menuBtn: byId('menuBtn'),
      scrim: byId('scrim'),
      listNav: byId('listNav'),
      pageTitle: byId('pageTitle'),
      statTotal: byId('statTotal'),
      statTotalWord: byId('statTotalWord'),
      statDone: byId('statDone'),
      composer: byId('composer'),
      taskInput: byId('taskInput'),
      taskList: byId('taskList'),
      emptyState: byId('emptyState'),
      emptyTitle: byId('emptyTitle'),
      emptyText: byId('emptyText'),
      toasts: byId('toasts'),
      live: byId('live')
    };

    App.render.init(refs);
    App.ui.init({ toasts: refs.toasts, live: refs.live });
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

  // ——— Добавление ———

  function handleComposerSubmit(event) {
    event.preventDefault();
    var title = App.util.cleanText(refs.taskInput.value, App.schema.LIMITS.title);

    if (!title) {
      refs.composer.classList.add('is-invalid');
      refs.taskInput.focus();
      App.ui.announce('Пустую задачу добавить нельзя. Введите текст.');
      return;
    }

    var task = store.actions.addTask({ title: title });
    if (!task) return;

    refs.composer.classList.remove('is-invalid');
    refs.taskInput.value = '';
    refs.taskInput.focus();
    App.ui.announce('Добавлена задача: ' + task.title);
  }

  // ——— Задачи: клики через делегирование ———

  function findVisibleTaskIndex(id) {
    var visible = App.selectors.visibleTasks(store.get(), App.view.query, new Date());
    for (var i = 0; i < visible.length; i += 1) {
      if (visible[i].id === id) return { list: visible, index: i };
    }
    return { list: visible, index: -1 };
  }

  function focusTaskAction(taskId, action) {
    var items = refs.taskList.querySelectorAll('.task');
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].dataset.id !== taskId) continue;
      var button = items[i].querySelector('[data-action="' + action + '"]');
      if (button) {
        button.focus();
        return true;
      }
    }
    return false;
  }

  function handleTaskClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button || !refs.taskList.contains(button)) return;
    var item = button.closest('.task');
    if (!item) return;

    var taskId = item.dataset.id;
    var action = button.dataset.action;

    if (action === 'toggle') {
      var toggled = store.actions.toggleTask(taskId);
      if (toggled) {
        App.ui.announce(toggled.done ? 'Выполнено: ' + toggled.title : 'Снова в работе: ' + toggled.title);
      }
      return;
    }

    if (action === 'delete') {
      var position = findVisibleTaskIndex(taskId);
      var removed = store.actions.deleteTask(taskId);
      if (!removed) return;

      App.ui.announce('Удалена задача: ' + removed.title);
      var next = position.list[position.index + 1] || position.list[position.index - 1];
      if (!next || !focusTaskAction(next.id, 'delete')) {
        refs.taskInput.focus();
      }
    }
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
    refs.taskList.addEventListener('click', handleTaskClick);

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
