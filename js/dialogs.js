/* Диалоги: подробное редактирование задачи, управление списком и подтверждения.
   Нативный <dialog> даёт ловушку фокуса, Esc и возврат фокуса бесплатно. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var util = App.util;
  var schema = App.schema;
  var el = util.el;

  var refs = {};
  var initialized = false;
  var draft = { taskId: null, subtasks: [] };
  var listEditingId = null;
  var pendingConfirm = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function init() {
    if (initialized) return;
    refs.taskDialog = byId('taskDialog');
    refs.taskForm = byId('taskForm');
    refs.taskFormTitle = byId('taskFormTitle');
    refs.taskFormList = byId('taskFormList');
    refs.taskFormPriority = byId('taskFormPriority');
    refs.taskFormDue = byId('taskFormDue');
    refs.taskFormDueClear = byId('taskFormDueClear');
    refs.taskFormTags = byId('taskFormTags');
    refs.taskDialogSubtitle = byId('taskDialogSubtitle');
    refs.taskSubtaskList = byId('taskSubtaskList');
    refs.subtaskSummary = byId('subtaskSummary');
    refs.subtaskInput = byId('subtaskInput');
    refs.subtaskAddBtn = byId('subtaskAddBtn');

    refs.listDialog = byId('listDialog');
    refs.listForm = byId('listForm');
    refs.listDialogTitle = byId('listDialogTitle');
    refs.listFormName = byId('listFormName');
    refs.listFormColors = byId('listFormColors');
    refs.listDeleteBtn = byId('listDeleteBtn');

    refs.confirmDialog = byId('confirmDialog');
    refs.confirmTitle = byId('confirmTitle');
    refs.confirmText = byId('confirmText');
    refs.confirmOk = byId('confirmOk');
    refs.confirmCancel = byId('confirmCancel');
    refs.helpDialog = byId('helpDialog');

    refs.statsDialog = byId('statsDialog');
    refs.statsRing = byId('statsRing');
    refs.statsPercentValue = byId('statsPercentValue');
    refs.statsCaption = byId('statsCaption');
    refs.statDoneToday = byId('statDoneToday');
    refs.statDoneWeek = byId('statDoneWeek');
    refs.statTotalDone = byId('statTotalDone');
    refs.statOverdue = byId('statOverdue');

    refs.messageDialog = byId('messageDialog');
    refs.messageTitle = byId('messageTitle');
    refs.messageBody = byId('messageBody');

    if (!refs.taskDialog || !refs.listDialog || !refs.confirmDialog) return;
    initialized = true;
    bind();
  }

  function findTask(taskId) {
    var tasks = App.store.get().tasks;
    for (var i = 0; i < tasks.length; i += 1) {
      if (tasks[i].id === taskId) return tasks[i];
    }
    return null;
  }

  function focusTaskControl(taskId, action) {
    var taskList = byId('taskList');
    if (!taskList) return false;
    var items = taskList.querySelectorAll('.task');
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].dataset.id !== taskId) continue;
      var control = items[i].querySelector('[data-action="' + action + '"]');
      if (control) {
        control.focus();
        return true;
      }
    }
    var input = byId('taskInput');
    if (input) input.focus();
    return false;
  }

  function markInvalid(input, message) {
    input.classList.add('is-invalid');
    input.focus();
    App.ui.announce(message);
  }

  // ——— Задача ———

  function fillListOptions(selectedId) {
    refs.taskFormList.textContent = '';
    App.store.get().lists.forEach(function (list) {
      var option = el('option', null, list.name);
      option.value = list.id;
      option.selected = list.id === selectedId;
      refs.taskFormList.appendChild(option);
    });
  }

  function syncDueClear() {
    if (refs.taskFormDueClear) refs.taskFormDueClear.hidden = !refs.taskFormDue.value;
  }

  function renderDraftSubtasks(focusTarget) {
    var list = refs.taskSubtaskList;
    list.textContent = '';

    draft.subtasks.forEach(function (subtask, index) {
      var row = el('li', 'subtask-edit' + (subtask.done ? ' is-done' : ''));
      row.dataset.subId = subtask.id;

      var inputId = 'draft-sub-' + index;
      var checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.id = inputId;
      checkbox.checked = subtask.done;
      checkbox.dataset.draftAction = 'toggle';

      var label = el('label', 'subtask-edit__title', subtask.title);
      label.htmlFor = inputId;

      var remove = el('button', 'icon-btn subtask__delete');
      remove.type = 'button';
      remove.dataset.draftAction = 'delete';
      remove.dataset.subId = subtask.id;
      remove.setAttribute('aria-label', 'Удалить подзадачу: ' + subtask.title);
      remove.appendChild(App.icons.create('close', 14));

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(remove);
      list.appendChild(row);
    });

    var done = draft.subtasks.filter(function (subtask) {
      return subtask.done;
    }).length;
    refs.subtaskSummary.textContent = done + ' из ' + draft.subtasks.length;

    if (focusTarget === 'input') {
      refs.subtaskInput.focus();
    } else if (focusTarget) {
      var target = list.querySelector('[data-sub-id="' + focusTarget + '"] input');
      if (target) target.focus();
    }
  }

  function addDraftSubtask() {
    var title = util.cleanText(refs.subtaskInput.value, schema.LIMITS.subtaskTitle);
    if (!title) return;
    if (draft.subtasks.length >= schema.LIMITS.subtasks) {
      App.ui.announce('Больше ' + schema.LIMITS.subtasks + ' подзадач добавить нельзя.');
      return;
    }
    draft.subtasks.push({ id: util.createId('s_'), title: title, done: false });
    refs.subtaskInput.value = '';
    renderDraftSubtasks('input');
  }

  function openTask(taskId) {
    if (!initialized) return;
    var task = findTask(taskId);
    if (!task) return;

    draft.taskId = task.id;
    draft.subtasks = task.subtasks.map(function (subtask) {
      return { id: subtask.id, title: subtask.title, done: subtask.done };
    });

    fillListOptions(task.listId);
    refs.taskFormTitle.value = task.title;
    refs.taskFormTitle.classList.remove('is-invalid');
    refs.taskFormPriority.value = String(task.priority);
    refs.taskFormDue.value = task.due || '';
    syncDueClear();
    refs.taskFormTags.value = task.tags.join(', ');
    refs.taskDialogSubtitle.textContent = 'Создана ' + util.formatDateTime(task.createdAt);
    renderDraftSubtasks();

    if (!refs.taskDialog.open) refs.taskDialog.showModal();
    refs.taskFormTitle.focus();
    refs.taskFormTitle.select();
  }

  function closeTask() {
    if (refs.taskDialog.open) refs.taskDialog.close();
    var taskId = draft.taskId;
    draft.taskId = null;
    draft.subtasks = [];
    global.setTimeout(function () {
      focusTaskControl(taskId, 'edit');
    }, 0);
  }

  function saveTask(event) {
    event.preventDefault();
    if (!draft.taskId) return;

    var title = util.cleanText(refs.taskFormTitle.value, schema.LIMITS.title);
    if (!title) {
      markInvalid(refs.taskFormTitle, 'Название задачи не может быть пустым.');
      return;
    }

    var tags = refs.taskFormTags.value.split(/[\s,]+/).filter(Boolean);
    App.store.actions.updateTask(draft.taskId, {
      title: title,
      listId: refs.taskFormList.value,
      due: refs.taskFormDue.value || null,
      priority: Number(refs.taskFormPriority.value),
      tags: tags,
      subtasks: draft.subtasks
    });
    App.ui.announce('Задача сохранена: ' + title);
    closeTask();
  }

  // ——— Список ———

  function buildSwatches(selectedColor) {
    refs.listFormColors.textContent = '';
    var legend = el('legend', null, 'Цвет');
    refs.listFormColors.appendChild(legend);

    schema.LIST_COLORS.forEach(function (color, index) {
      var label = el('label', 'swatch');
      var input = el('input');
      input.type = 'radio';
      input.name = 'listColor';
      input.value = color;
      input.checked = color === selectedColor;
      input.setAttribute('aria-label', 'Цвет ' + (index + 1));
      var visual = el('span');
      visual.style.setProperty('--swatch', color);
      label.appendChild(input);
      label.appendChild(visual);
      refs.listFormColors.appendChild(label);
    });
  }

  function openList(listId) {
    if (!initialized) return;
    listEditingId = listId || null;
    var list = listId ? App.selectors.findList(App.store.get(), listId) : null;

    refs.listDialogTitle.textContent = list ? 'Настройки списка' : 'Новый список';
    refs.listFormName.value = list ? list.name : '';
    refs.listFormName.classList.remove('is-invalid');
    buildSwatches(list ? list.color : schema.LIST_COLORS[0]);
    refs.listDeleteBtn.hidden = !list;

    if (!refs.listDialog.open) refs.listDialog.showModal();
    refs.listFormName.focus();
    refs.listFormName.select();
  }

  function saveList(event) {
    event.preventDefault();
    var name = util.cleanText(refs.listFormName.value, schema.LIMITS.listName);
    if (!name) {
      markInvalid(refs.listFormName, 'Название списка не может быть пустым.');
      return;
    }

    var checked = refs.listFormColors.querySelector('input[name="listColor"]:checked');
    var color = checked ? checked.value : schema.LIST_COLORS[0];

    if (listEditingId) {
      App.store.actions.renameList(listEditingId, name);
      App.store.actions.setListColor(listEditingId, color);
      App.ui.announce('Список сохранён: ' + name);
    } else {
      var created = App.store.actions.addList(name, color);
      if (!created) {
        App.ui.announce('Не удалось создать список: проверьте название и лимит списков.');
        return;
      }
      App.store.actions.setSettings({ listId: created.id });
      App.ui.announce('Список создан: ' + name);
    }

    refs.listDialog.close();
    listEditingId = null;
  }

  function deleteCurrentList() {
    if (!listEditingId) return;
    var listId = listEditingId;
    var list = App.selectors.findList(App.store.get(), listId);
    if (!list) return;

    askConfirm({
      title: 'Удалить список?',
      text:
        'Список «' +
        list.name +
        '» исчезнет. Задачи из него не пропадут — они переместятся во «Входящие».',
      confirmLabel: 'Удалить список'
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (refs.listDialog.open) refs.listDialog.close();
      listEditingId = null;
      var removed = App.store.actions.deleteList(listId);
      if (!removed) return;
      App.ui.announce('Список удалён: ' + removed.name + '. Задачи перенесены во «Входящие».');
      global.setTimeout(function () {
        var addButton = byId('addListBtn');
        if (addButton) addButton.focus();
      }, 0);
    });
  }

  // ——— Подсказка по клавишам ———

  function openHelp() {
    if (!refs.helpDialog) return;
    if (!refs.helpDialog.open) refs.helpDialog.showModal();
    var closeButton = refs.helpDialog.querySelector('[data-close-dialog]');
    if (closeButton) closeButton.focus();
  }

  // ——— Статистика ———

  function openStats() {
    if (!refs.statsDialog) return;
    var stats = App.selectors.computeStats(App.store.get(), new Date());
    var radius = 48;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference * (1 - stats.percent / 100);

    if (refs.statsRing) {
      refs.statsRing.style.strokeDasharray = circumference.toFixed(2);
      refs.statsRing.style.strokeDashoffset = offset.toFixed(2);
      refs.statsRing.setAttribute(
        'aria-label',
        'Выполнено ' + stats.percent + ' процентов: ' + stats.done + ' из ' + stats.total + ' задач'
      );
    }
    if (refs.statsPercentValue) refs.statsPercentValue.textContent = String(stats.percent);
    if (refs.statsCaption) {
      refs.statsCaption.textContent = stats.total
        ? 'Выполнено ' + stats.done + ' из ' + stats.total + ' ' + util.plural(stats.total, 'задачи', 'задач', 'задач')
        : 'Пока нет ни одной задачи — статистика появится вместе с первой.';
    }
    if (refs.statDoneToday) refs.statDoneToday.textContent = String(stats.doneToday);
    if (refs.statDoneWeek) refs.statDoneWeek.textContent = String(stats.doneWeek);
    if (refs.statTotalDone) refs.statTotalDone.textContent = String(stats.done);
    if (refs.statOverdue) refs.statOverdue.textContent = String(stats.overdue);

    if (!refs.statsDialog.open) refs.statsDialog.showModal();
    var closeButton = refs.statsDialog.querySelector('[data-close-dialog]');
    if (closeButton) closeButton.focus();
  }

  // ——— Сообщение с подробностями ———

  function showMessage(options) {
    options = options || {};
    if (!refs.messageDialog) {
      App.ui.toast(options.title || 'Ошибка', { variant: 'warn', duration: 9000 });
      return;
    }
    refs.messageTitle.textContent = options.title || 'Сообщение';
    refs.messageBody.textContent = '';
    if (options.text) refs.messageBody.appendChild(el('p', null, options.text));

    if (options.errors && options.errors.length) {
      var list = el('ul', 'errors');
      options.errors.forEach(function (message) {
        var item = el('li', null, message);
        list.appendChild(item);
      });
      refs.messageBody.appendChild(list);
    }

    if (!refs.messageDialog.open) refs.messageDialog.showModal();
    var closeButton = refs.messageDialog.querySelector('[data-close-dialog]');
    if (closeButton) closeButton.focus();
  }

  // ——— Подтверждение ———

  function askConfirm(options) {
    options = options || {};
    if (!refs.confirmDialog) {
      return Promise.resolve(global.confirm ? global.confirm(options.text || '') : false);
    }

    return new Promise(function (resolve) {
      if (refs.confirmDialog.open) {
        resolve(false);
        return;
      }
      pendingConfirm = resolve;
      refs.confirmTitle.textContent = options.title || 'Вы уверены?';
      refs.confirmText.textContent = options.text || '';
      refs.confirmOk.textContent = options.confirmLabel || 'Подтвердить';
      refs.confirmOk.className = 'btn ' + (options.danger === false ? 'btn--primary' : 'btn--danger');
      refs.confirmDialog.returnValue = '';
      refs.confirmDialog.showModal();
      refs.confirmCancel.focus();
    });
  }

  // ——— События ———

  function bind() {
    refs.taskForm.addEventListener('submit', saveTask);
    refs.taskFormTitle.addEventListener('input', function () {
      refs.taskFormTitle.classList.remove('is-invalid');
    });
    refs.taskFormDue.addEventListener('input', syncDueClear);
    refs.taskFormDue.addEventListener('change', syncDueClear);
    refs.taskFormDueClear.addEventListener('click', function () {
      refs.taskFormDue.value = '';
      syncDueClear();
      refs.taskFormDue.focus();
    });

    refs.subtaskAddBtn.addEventListener('click', addDraftSubtask);
    refs.subtaskInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addDraftSubtask();
    });

    refs.taskSubtaskList.addEventListener('change', function (event) {
      var checkbox = event.target.closest('input[data-draft-action="toggle"]');
      if (!checkbox) return;
      var row = checkbox.closest('[data-sub-id]');
      var subtask = draft.subtasks.filter(function (item) {
        return item.id === row.dataset.subId;
      })[0];
      if (!subtask) return;
      subtask.done = checkbox.checked;
      row.classList.toggle('is-done', subtask.done);
      var done = draft.subtasks.filter(function (item) {
        return item.done;
      }).length;
      refs.subtaskSummary.textContent = done + ' из ' + draft.subtasks.length;
    });

    refs.taskSubtaskList.addEventListener('click', function (event) {
      var remove = event.target.closest('[data-draft-action="delete"]');
      if (!remove) return;
      var row = remove.closest('[data-sub-id]');
      draft.subtasks = draft.subtasks.filter(function (item) {
        return item.id !== row.dataset.subId;
      });
      renderDraftSubtasks('input');
    });

    refs.listForm.addEventListener('submit', saveList);
    refs.listFormName.addEventListener('input', function () {
      refs.listFormName.classList.remove('is-invalid');
    });
    refs.listDeleteBtn.addEventListener('click', deleteCurrentList);

    refs.taskDialog.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-dialog]')) refs.taskDialog.close();
    });
    refs.listDialog.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-dialog]')) refs.listDialog.close();
    });

    if (refs.helpDialog) {
      refs.helpDialog.addEventListener('click', function (event) {
        if (event.target.closest('[data-close-dialog]')) refs.helpDialog.close();
      });
    }

    if (refs.statsDialog) {
      refs.statsDialog.addEventListener('click', function (event) {
        if (event.target.closest('[data-close-dialog]')) refs.statsDialog.close();
      });
    }

    if (refs.messageDialog) {
      refs.messageDialog.addEventListener('click', function (event) {
        if (event.target.closest('[data-close-dialog]')) refs.messageDialog.close();
      });
    }

    refs.confirmDialog.addEventListener('close', function () {
      var resolve = pendingConfirm;
      pendingConfirm = null;
      if (resolve) resolve(refs.confirmDialog.returnValue === 'confirm');
    });
  }

  App.dialogs = {
    init: init,
    openTask: openTask,
    openList: openList,
    openHelp: openHelp,
    openStats: openStats,
    showMessage: showMessage,
    askConfirm: askConfirm
  };
})(window);
