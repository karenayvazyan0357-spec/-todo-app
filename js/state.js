/* Состояние и действия. Всё изменение данных идёт через функции ниже,
   а подписчики (сохранение + рендер) узнают об этом через единый emit. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var schema = App.schema;
  var util = App.util;
  var LIMITS = schema.LIMITS;
  var MAX_UNDO = 30;

  App.createStore = function createStore(deps) {
    deps = deps || {};
    var nowFn = deps.now || function () {
      return new Date();
    };
    var createId = deps.createId || util.createId;

    var state = schema.createDefaultState(nowFn());
    var listeners = [];
    var undoStack = [];

    function currentDate() {
      var value = nowFn();
      return value instanceof Date ? value : new Date(value);
    }

    function stamp() {
      return currentDate().toISOString();
    }

    function get() {
      return state;
    }

    function subscribe(listener) {
      listeners.push(listener);
      return function unsubscribe() {
        var index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      };
    }

    function emit(reason) {
      listeners.slice().forEach(function (listener) {
        listener(reason);
      });
    }

    function findTask(id) {
      for (var i = 0; i < state.tasks.length; i += 1) {
        if (state.tasks[i].id === id) return state.tasks[i];
      }
      return null;
    }

    function findTaskIndex(id) {
      for (var i = 0; i < state.tasks.length; i += 1) {
        if (state.tasks[i].id === id) return i;
      }
      return -1;
    }

    function findList(id) {
      for (var i = 0; i < state.lists.length; i += 1) {
        if (state.lists[i].id === id) return state.lists[i];
      }
      return null;
    }

    function pushUndo(label, restore) {
      undoStack.push({ label: label, restore: restore });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    function clearUndo() {
      undoStack.length = 0;
    }

    function canUndo() {
      return undoStack.length > 0;
    }

    function undo() {
      var entry = undoStack.pop();
      if (!entry) return null;
      entry.restore();
      emit('undo');
      return entry;
    }

    function resolveListId(requested) {
      if (findList(requested)) return requested;
      if (findList(state.settings.listId)) return state.settings.listId;
      return schema.INBOX_ID;
    }

    /** Новые задачи сверху: сразу видно, что добавление сработало. */
    function nextOrderFor(listId) {
      var min = null;
      state.tasks.forEach(function (task) {
        if (task.listId !== listId) return;
        if (min === null || task.order < min) min = task.order;
      });
      return min === null ? 0 : min - 1;
    }

    function copySubtasks(subtasks) {
      return subtasks.map(function (subtask) {
        return { id: subtask.id, title: subtask.title, done: subtask.done };
      });
    }

    // ——— Действия с задачами ———

    function addTask(input) {
      input = input || {};
      var title = util.cleanText(input.title, LIMITS.title);
      if (!title) return null;

      var listId = resolveListId(input.listId);
      var task = {
        id: createId('t_'),
        title: title,
        done: false,
        createdAt: stamp(),
        completedAt: null,
        due: util.isISODate(input.due) ? input.due : null,
        priority: schema.isValidPriority(input.priority) ? input.priority : 0,
        listId: listId,
        tags: schema.normalizeTags(input.tags),
        subtasks: schema.normalizeSubtasks(input.subtasks, createId),
        order: nextOrderFor(listId)
      };

      state.tasks.push(task);
      pushUndo('Добавлена задача', function () {
        var index = findTaskIndex(task.id);
        if (index !== -1) state.tasks.splice(index, 1);
      });
      emit('task:add');
      return task;
    }

    function toggleTask(id) {
      var task = findTask(id);
      if (!task) return null;
      var beforeDone = task.done;
      var beforeCompletedAt = task.completedAt;

      task.done = !task.done;
      task.completedAt = task.done ? stamp() : null;

      pushUndo(task.done ? 'Задача выполнена' : 'Задача снова активна', function () {
        var current = findTask(id);
        if (!current) return;
        current.done = beforeDone;
        current.completedAt = beforeCompletedAt;
      });
      emit('task:toggle');
      return task;
    }

    /** Правка разрешённых полей. Пустое название не сохраняем — возвращаем null. */
    function updateTask(id, patch) {
      var task = findTask(id);
      if (!task || !patch) return null;
      var before = {};
      var changed = false;

      if ('title' in patch) {
        var title = util.cleanText(patch.title, LIMITS.title);
        if (!title) return null;
        if (title !== task.title) {
          before.title = task.title;
          task.title = title;
          changed = true;
        }
      }

      if ('due' in patch) {
        var due = util.isISODate(patch.due) ? patch.due : null;
        if (due !== task.due) {
          before.due = task.due;
          task.due = due;
          changed = true;
        }
      }

      if ('priority' in patch) {
        var priority = schema.isValidPriority(patch.priority) ? patch.priority : 0;
        if (priority !== task.priority) {
          before.priority = task.priority;
          task.priority = priority;
          changed = true;
        }
      }

      if ('listId' in patch && findList(patch.listId) && patch.listId !== task.listId) {
        before.listId = task.listId;
        before.order = task.order;
        task.listId = patch.listId;
        task.order = nextOrderFor(patch.listId);
        changed = true;
      }

      if ('tags' in patch) {
        var tags = schema.normalizeTags(patch.tags);
        if (tags.join('\u0001') !== task.tags.join('\u0001')) {
          before.tags = task.tags.slice();
          task.tags = tags;
          changed = true;
        }
      }

      if ('subtasks' in patch) {
        var subtasks = schema.normalizeSubtasks(patch.subtasks, createId);
        if (JSON.stringify(subtasks) !== JSON.stringify(task.subtasks)) {
          before.subtasks = copySubtasks(task.subtasks);
          task.subtasks = subtasks;
          changed = true;
        }
      }

      if (!changed) return task;

      pushUndo('Изменена задача', function () {
        var current = findTask(id);
        if (!current) return;
        Object.keys(before).forEach(function (key) {
          current[key] = before[key];
        });
      });
      emit('task:update');
      return task;
    }

    function deleteTask(id) {
      var index = findTaskIndex(id);
      if (index === -1) return null;
      var task = state.tasks[index];
      state.tasks.splice(index, 1);

      pushUndo('Задача удалена', function () {
        if (findTask(task.id)) return;
        var target = Math.min(index, state.tasks.length);
        state.tasks.splice(target, 0, task);
      });
      emit('task:delete');
      return task;
    }

    // ——— Настройки (тема, выбранный список, фильтры) ———

    function setSettings(patch) {
      if (!patch) return;
      var settings = state.settings;
      var changed = false;

      if (schema.THEMES.indexOf(patch.theme) !== -1 && settings.theme !== patch.theme) {
        settings.theme = patch.theme;
        changed = true;
      }
      if (schema.FILTERS.indexOf(patch.filter) !== -1 && settings.filter !== patch.filter) {
        settings.filter = patch.filter;
        changed = true;
      }
      if (schema.SORTS.indexOf(patch.sort) !== -1 && settings.sort !== patch.sort) {
        settings.sort = patch.sort;
        changed = true;
      }
      if (typeof patch.listId === 'string' && findList(patch.listId) && settings.listId !== patch.listId) {
        settings.listId = patch.listId;
        changed = true;
      }

      if (changed) emit('settings');
    }

    function init(snapshot) {
      state = snapshot;
      clearUndo();
    }

    function replace(snapshot, reason) {
      state = snapshot;
      clearUndo();
      emit(reason || 'state:replace');
    }

    return {
      get: get,
      subscribe: subscribe,
      init: init,
      replace: replace,
      canUndo: canUndo,
      undo: undo,
      actions: {
        addTask: addTask,
        toggleTask: toggleTask,
        updateTask: updateTask,
        deleteTask: deleteTask,
        setSettings: setSettings
      }
    };
  };
})(window);
