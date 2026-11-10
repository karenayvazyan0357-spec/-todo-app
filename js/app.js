/* Точка сборки: связывает состояние, хранилище, рендер и события.
   Обработчики навешаны на контейнеры (делегирование), а не на каждую задачу. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var store = null;
  var refs = {};
  var warnedSave = false;
  var appliedThemeMode = null;
  var DEFAULT_HINT = 'Enter — добавить. Подсказки: «завтра», «!3», «#дом».';
  var systemTheme = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

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
      helpBtn: byId('helpBtn'),
      statsBtn: byId('statsBtn'),
      exportBtn: byId('exportBtn'),
      importBtn: byId('importBtn'),
      importInput: byId('importInput'),
      themeSelect: byId('themeSelect'),
      celebration: byId('celebration'),
      pageTitle: byId('pageTitle'),
      statTotal: byId('statTotal'),
      statTotalWord: byId('statTotalWord'),
      statDone: byId('statDone'),
      searchInput: byId('searchInput'),
      searchClear: byId('searchClear'),
      filterChips: byId('filterChips'),
      sortSelect: byId('sortSelect'),
      composer: byId('composer'),
      composerHint: byId('composerHint'),
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
    App.fx.init(refs.celebration);
    store.subscribe(handleChange);
    bindEvents();
    App.dnd.init({
      list: refs.taskList,
      onMoved: function (taskId) {
        focusTaskAction(taskId, 'grip');
      }
    });
    applyTheme();
    App.render.update('init');
    updateComposerHint();
    listenSystemTheme();

    if (loaded.warning) {
      App.ui.toast(loaded.warning, { variant: 'warn', duration: 10000 });
    }
  }

  function handleChange(reason) {
    if (reason === 'state:sync') {
      App.render.update('sync');
      applyTheme();
      return;
    }
    var result = App.storage.save(store.get());
    App.render.update(reason);
    applyTheme();
    if (!result.ok && !warnedSave) {
      warnedSave = true;
      App.ui.toast(result.error, { variant: 'warn', duration: 10000 });
    }
  }

  // ——— Тема ———

  function applyTheme() {
    var mode = store.get().settings.theme;
    var systemDark = systemTheme ? systemTheme.matches : false;
    var resolved = mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';
    var root = document.documentElement;

    if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    var color = resolved === 'dark' ? '#141210' : '#faf8f5';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', color);

    // Зеркало для inline-скрипта в <head>: он не должен ждать загрузки состояния.
    if (mode !== appliedThemeMode) {
      App.storage.saveTheme(mode);
      appliedThemeMode = mode;
    }
    if (refs.themeSelect && refs.themeSelect.value !== mode) refs.themeSelect.value = mode;
  }

  function listenSystemTheme() {
    if (!systemTheme) return;
    var handler = function () {
      if (store.get().settings.theme === 'system') applyTheme();
    };
    if (typeof systemTheme.addEventListener === 'function') systemTheme.addEventListener('change', handler);
    else if (typeof systemTheme.addListener === 'function') systemTheme.addListener(handler);
  }

  // ——— Экспорт и импорт ———

  function summaryOf(state) {
    var taskCount = state.tasks.length;
    var listCount = state.lists.length;
    return (
      taskCount +
      ' ' +
      App.util.plural(taskCount, 'задача', 'задачи', 'задач') +
      ', ' +
      listCount +
      ' ' +
      App.util.plural(listCount, 'список', 'списка', 'списков')
    );
  }

  function handleExport() {
    var result = App.transfer.exportData(store.get());
    if (!result.ok) {
      App.ui.toast(result.error, { variant: 'warn', duration: 8000 });
      return;
    }
    App.ui.toast('Экспорт скачан: файл с задачами.', { duration: 5000 });
  }

  function handleImportClick() {
    refs.importInput.value = '';
    refs.importInput.click();
  }

  async function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    var result = await App.transfer.readFile(file);
    if (!result.ok) {
      App.dialogs.showMessage({
        title: 'Импорт не удался',
        text: result.message,
        errors: result.errors
      });
      return;
    }

    var confirmed = await App.dialogs.askConfirm({
      title: 'Заменить данные?',
      text:
        'В файле: ' +
        summaryOf(result.state) +
        '. Сейчас: ' +
        summaryOf(store.get()) +
        '. Текущие данные будут заменены — отменить можно через Ctrl+Z.',
      confirmLabel: 'Импортировать',
      danger: false
    });
    if (!confirmed) return;

    App.view.query = '';
    App.view.editingId = null;
    App.view.expanded = new Set();
    if (refs.searchInput) refs.searchInput.value = '';
    if (refs.searchClear) refs.searchClear.hidden = true;

    store.actions.importState(result.state);
    scrollToTop();
    if (refs.main) refs.main.focus();
    App.ui.toast('Импортировано: ' + summaryOf(result.state) + '.', { duration: 6000 });
    App.ui.announce('Данные импортированы. Можно отменить через Ctrl+Z.');
  }

  function handleStorageSync(event) {
    if (!event || event.key !== App.storage.KEY || !event.newValue) return;
    var loaded = App.storage.load(new Date());
    if (loaded.warning) {
      App.ui.toast(loaded.warning, { variant: 'warn', duration: 9000 });
      return;
    }
    store.replace(loaded.state, 'state:sync');
    App.ui.toast('Список обновлён в другой вкладке', { duration: 3000 });
  }

  // ——— Утилиты работы с DOM задач ———

  function taskElement(taskId) {
    var items = refs.taskList.querySelectorAll('.task');
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].classList.contains('is-leaving')) continue;
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

  function isCurrentListComplete() {
    var currentId = App.selectors.currentListId(store.get());
    var listTasks = App.selectors.listTasks(store.get(), currentId);
    return (
      listTasks.length > 0 &&
      listTasks.every(function (task) {
        return task.done;
      })
    );
  }

  // ——— Быстрый ввод ———

  function describeParsed(parsed) {
    var parts = [];
    if (parsed.due) {
      var due = App.util.formatDue(parsed.due, new Date());
      if (due) parts.push('срок: ' + due.label.toLowerCase());
    }
    if (parsed.priority) parts.push('приоритет: ' + App.schema.priorityLabel(parsed.priority).toLowerCase());
    if (parsed.tags.length) {
      parts.push(
        'теги: ' +
          parsed.tags
            .map(function (tag) {
              return '#' + tag;
            })
            .join(', ')
      );
    }
    return parts;
  }

  function updateComposerHint() {
    if (!refs.composerHint) return;
    var raw = refs.taskInput.value;
    if (!raw.trim()) {
      refs.composerHint.textContent = DEFAULT_HINT;
      return;
    }
    var parsed = App.parser.parseQuickInput(raw, new Date());
    var parts = describeParsed(parsed);
    refs.composerHint.textContent = parts.length ? 'Будет добавлено: ' + parts.join(' · ') : DEFAULT_HINT;
  }

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
    var parsed = App.parser.parseQuickInput(refs.taskInput.value, new Date());

    if (!parsed.title) {
      refs.composer.classList.add('is-invalid');
      refs.taskInput.focus();
      App.ui.announce(
        refs.taskInput.value.trim()
          ? 'Добавьте название задачи. Только срок, приоритет и теги сохранить нельзя.'
          : 'Пустую задачу добавить нельзя. Введите текст.'
      );
      return;
    }

    ensureTaskVisible();
    var task = store.actions.addTask({
      title: parsed.title,
      due: parsed.due,
      priority: parsed.priority,
      tags: parsed.tags,
      listId: store.get().settings.listId
    });
    if (!task) return;

    var extras = describeParsed(parsed);
    refs.composer.classList.remove('is-invalid');
    refs.taskInput.value = '';
    updateComposerHint();
    refs.taskInput.focus();
    App.ui.announce('Добавлена задача: ' + task.title + (extras.length ? '. ' + extras.join(', ') : ''));
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
    var task = getTask(taskId);
    if (task && task.subtasks.length >= App.schema.LIMITS.subtasks) {
      App.ui.announce('К задаче можно добавить не больше ' + App.schema.LIMITS.subtasks + ' подзадач.');
      input.focus();
      return;
    }
    var title = App.util.cleanText(input.value, App.schema.LIMITS.subtaskTitle);
    if (!title) {
      App.ui.announce('Введите текст подзадачи.');
      input.focus();
      return;
    }
    var started = store.actions.addSubtask(taskId, title);
    if (!started) {
      input.focus();
      return;
    }
    focusSubtaskInput(taskId);
    App.ui.announce('Подзадача добавлена: ' + title);
  }

  function moveTask(taskId, delta, focusAction) {
    if (store.get().settings.sort !== 'manual') {
      App.ui.announce('Ручной порядок выключен. Выберите сортировку «Вручную».');
      return;
    }
    var moved = store.actions.moveTaskBy(taskId, delta);
    var action = focusAction || (delta < 0 ? 'move-up' : 'move-down');
    if (!moved) {
      App.ui.announce(delta < 0 ? 'Задача уже первая.' : 'Задача уже последняя.');
    } else {
      App.ui.announce(delta < 0 ? 'Задача поднята выше.' : 'Задача опущена ниже.');
    }
    focusTaskAction(taskId, action);
  }

  function deleteTaskWithFocus(taskId) {
    var position = findVisibleTaskIndex(taskId);
    var task = getTask(taskId);
    var index = task ? store.get().tasks.indexOf(task) : -1;
    var removed = store.actions.deleteTask(taskId);
    if (!removed) return;

    App.ui.announce('Удалена задача: ' + removed.title + '. Отменить можно в уведомлении или через Ctrl+Z.');
    App.ui.toast('Задача удалена', {
      actionLabel: 'Отменить',
      duration: 6000,
      onAction: function () {
        var restored = store.actions.restoreTask(removed, index);
        if (!restored) return;
        App.ui.announce('Удаление отменено: ' + restored.title);
        focusTaskAction(restored.id, 'delete');
      }
    });

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
      var wasComplete = isCurrentListComplete();
      var visiblePosition = findVisibleTaskIndex(taskId);
      var toggled = store.actions.toggleTask(taskId);
      if (toggled) {
        if (toggled.done && !wasComplete && isCurrentListComplete()) App.fx.celebrate();
        App.ui.announce(toggled.done ? 'Выполнено: ' + toggled.title : 'Снова в работе: ' + toggled.title);

        // При активном фильтре отмеченная задача исчезает — уводим фокус на соседнюю.
        var stillVisible = App.selectors.visibleTasks(store.get(), App.view.query, new Date()).some(function (item) {
          return item.id === taskId;
        });
        if (!stillVisible) {
          var remaining = App.selectors.visibleTasks(store.get(), App.view.query, new Date());
          var neighbour = remaining[visiblePosition.index] || remaining[visiblePosition.index - 1];
          if (!neighbour || !focusTaskAction(neighbour.id, 'toggle')) refs.taskInput.focus();
        }
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

    if (action === 'move-up' || action === 'move-down') {
      moveTask(taskId, action === 'move-up' ? -1 : 1);
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

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      var altItem = target.closest('.task');
      if (!altItem || App.util.isEditableTarget(target)) return;
      event.preventDefault();
      moveTask(altItem.dataset.id, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    var grip = target.closest('[data-action="grip"]');
    if (grip && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      var gripItem = grip.closest('.task');
      event.preventDefault();
      if (gripItem) moveTask(gripItem.dataset.id, event.key === 'ArrowUp' ? -1 : 1, 'grip');
      return;
    }

    if (target.matches('[data-sub-input]')) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var subItem = target.closest('.task');
      if (subItem) addSubtaskFromCard(subItem.dataset.id, subItem);
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

  function scrollToTop() {
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
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

  // ——— Отмена и горячие клавиши ———

  function handleUndo() {
    if (!store.canUndo()) {
      App.ui.announce('Нечего отменять.');
      return;
    }
    var entry = store.undo();
    if (entry) App.ui.announce('Отменено: ' + entry.label.toLowerCase() + '.');
  }

  function isDialogOpen() {
    return !!document.querySelector('dialog[open]');
  }

  function focusComposer() {
    if (isNavOpen()) setNavOpen(false, false);
    refs.taskInput.focus();
    refs.taskInput.select();
  }

  function focusSearch() {
    if (isNavOpen()) setNavOpen(false, false);
    refs.searchInput.focus();
    refs.searchInput.select();
  }

  function handleEscape() {
    if (isDialogOpen()) return;
    if (isNavOpen()) {
      setNavOpen(false, true);
      return;
    }
    if (App.view.editingId) return;

    var active = document.activeElement;
    if (active === refs.searchInput) {
      if (App.view.query || store.get().settings.filter !== 'all') {
        resetFilters();
        App.ui.announce('Фильтры сброшены.');
      } else {
        active.blur();
      }
      return;
    }
    if (App.util.isEditableTarget(active)) {
      active.blur();
      return;
    }
    if (App.view.query || store.get().settings.filter !== 'all') {
      resetFilters();
      App.ui.announce('Фильтры сброшены.');
    }
  }

  function handleGlobalKeydown(event) {
    if (isDialogOpen()) return;

    var editable = App.util.isEditableTarget(event.target);
    var mod = event.ctrlKey || event.metaKey;

    if (mod && !event.shiftKey && (event.code === 'KeyZ' || String(event.key).toLowerCase() === 'z')) {
      if (editable) return;
      event.preventDefault();
      handleUndo();
      return;
    }

    if (event.key === 'Escape') {
      handleEscape();
      return;
    }

    if (editable || mod || event.altKey) return;

    if (event.code === 'KeyN') {
      event.preventDefault();
      focusComposer();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      App.dialogs.openHelp();
      return;
    }

    if (event.key === '/' || (event.code === 'Slash' && !event.shiftKey)) {
      event.preventDefault();
      focusSearch();
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
      updateComposerHint();
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
      scrollToTop();
      App.render.update('list-select');
      if (wasOpen && refs.main) refs.main.focus();
    });

    refs.addListBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      App.dialogs.openList(null);
    });

    refs.helpBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      App.dialogs.openHelp();
    });

    refs.statsBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      App.dialogs.openStats();
    });

    refs.exportBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      handleExport();
    });

    refs.importBtn.addEventListener('click', function () {
      if (isNavOpen()) setNavOpen(false, false);
      handleImportClick();
    });
    refs.importInput.addEventListener('change', handleImportFile);

    refs.themeSelect.addEventListener('change', function () {
      store.actions.setSettings({ theme: refs.themeSelect.value });
      applyTheme();
      var labels = { system: 'Системная', light: 'Светлая', dark: 'Тёмная' };
      App.ui.announce('Тема: ' + labels[refs.themeSelect.value]);
    });

    global.addEventListener('storage', handleStorageSync);

    refs.menuBtn.addEventListener('click', function () {
      setNavOpen(true);
    });
    refs.sidebarClose.addEventListener('click', function () {
      setNavOpen(false, true);
    });
    refs.scrim.addEventListener('click', function () {
      setNavOpen(false, true);
    });

    document.addEventListener('keydown', handleGlobalKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
