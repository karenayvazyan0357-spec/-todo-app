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

    /** Возврат удалённой задачи из тоста «Отменить» — без зависимости от стека отмены. */
    function restoreTask(task, index) {
      if (!task || !schema.isValidId(task.id) || findTask(task.id)) return null;
      // Если список успели удалить, задача возвращается во «Входящие».
      if (!findList(task.listId)) {
        task.listId = schema.INBOX_ID;
        task.order = nextOrderFor(schema.INBOX_ID);
      }
      var target = typeof index === 'number' ? Math.min(Math.max(index, 0), state.tasks.length) : state.tasks.length;
      state.tasks.splice(target, 0, task);

      pushUndo('Задача восстановлена', function () {
        var currentIndex = findTaskIndex(task.id);
        if (currentIndex !== -1) state.tasks.splice(currentIndex, 1);
      });
      emit('task:restore');
      return task;
    }

    // ——— Действия со списками ———

    function addList(name, color) {
      var cleanName = util.cleanText(name, LIMITS.listName);
      if (!cleanName || state.lists.length >= LIMITS.lists) return null;
      var fallbackColor = schema.LIST_COLORS[(state.lists.length - 1) % schema.LIST_COLORS.length];
      var list = {
        id: createId('l_'),
        name: cleanName,
        color: schema.isValidColor(color) ? color : fallbackColor,
        createdAt: stamp()
      };

      state.lists.push(list);
      pushUndo('Создан список', function () {
        var index = state.lists.indexOf(list);
        if (index !== -1) state.lists.splice(index, 1);
        state.tasks.forEach(function (task) {
          if (task.listId === list.id) task.listId = schema.INBOX_ID;
        });
        if (state.settings.listId === list.id) state.settings.listId = schema.INBOX_ID;
      });
      emit('list:add');
      return list;
    }

    function renameList(id, name) {
      if (id === schema.INBOX_ID) return null;
      var list = findList(id);
      var cleanName = util.cleanText(name, LIMITS.listName);
      if (!list || !cleanName) return null;
      if (list.name === cleanName) return list;

      var before = list.name;
      list.name = cleanName;
      pushUndo('Список переименован', function () {
        var current = findList(id);
        if (current) current.name = before;
      });
      emit('list:update');
      return list;
    }

    function setListColor(id, color) {
      if (id === schema.INBOX_ID) return null;
      var list = findList(id);
      if (!list || !schema.isValidColor(color)) return null;
      if (list.color === color) return list;

      var before = list.color;
      list.color = color;
      pushUndo('Цвет списка изменён', function () {
        var current = findList(id);
        if (current) current.color = before;
      });
      emit('list:update');
      return list;
    }

    /** Задачи удаляемого списка переезжают во «Входящие», чтобы не пропасть. */
    function deleteList(id) {
      if (id === schema.INBOX_ID) return null;
      var index = -1;
      for (var i = 0; i < state.lists.length; i += 1) {
        if (state.lists[i].id === id) index = i;
      }
      if (index === -1) return null;

      var list = state.lists[index];
      var affected = state.tasks.filter(function (task) {
        return task.listId === id;
      });
      var inboxMin = null;
      state.tasks.forEach(function (task) {
        if (task.listId !== schema.INBOX_ID) return;
        if (inboxMin === null || task.order < inboxMin) inboxMin = task.order;
      });
      var basis = inboxMin === null ? 0 : inboxMin;
      var moved = [];

      affected.forEach(function (task, order) {
        moved.push({ id: task.id, order: task.order });
        task.listId = schema.INBOX_ID;
        // Сохраняем взаимный порядок перенесённых задач.
        task.order = basis - affected.length + order;
      });

      state.lists.splice(index, 1);
      if (state.settings.listId === id) state.settings.listId = schema.INBOX_ID;

      pushUndo('Удалён список', function () {
        if (findList(id)) return;
        state.lists.splice(Math.min(index, state.lists.length), 0, list);
        moved.forEach(function (entry) {
          var task = findTask(entry.id);
          if (!task) return;
          task.listId = id;
          task.order = entry.order;
        });
      });
      emit('list:delete');
      return list;
    }

    // ——— Действия с подзадачами ———

    function addSubtask(taskId, title) {
      var task = findTask(taskId);
      if (!task || task.subtasks.length >= LIMITS.subtasks) return null;
      var clean = util.cleanText(title, LIMITS.subtaskTitle);
      if (!clean) return null;

      var subtasks = copySubtasks(task.subtasks);
      subtasks.push({ id: createId('s_'), title: clean, done: false });
      return updateTask(taskId, { subtasks: subtasks });
    }

    function toggleSubtask(taskId, subtaskId) {
      var task = findTask(taskId);
      if (!task) return null;
      var found = false;
      var subtasks = copySubtasks(task.subtasks).map(function (subtask) {
        if (subtask.id !== subtaskId) return subtask;
        found = true;
        subtask.done = !subtask.done;
        return subtask;
      });
      return found ? updateTask(taskId, { subtasks: subtasks }) : null;
    }

    function deleteSubtask(taskId, subtaskId) {
      var task = findTask(taskId);
      if (!task) return null;
      var subtasks = copySubtasks(task.subtasks).filter(function (subtask) {
        return subtask.id !== subtaskId;
      });
      if (subtasks.length === task.subtasks.length) return null;
      return updateTask(taskId, { subtasks: subtasks });
    }

    // ——— Ручной порядок ———

    function compareOrder(a, b) {
      return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    }

    function orderedTasksOfList(listId) {
      return state.tasks
        .filter(function (task) {
          return task.listId === listId;
        })
        .sort(compareOrder);
    }

    function orderSnapshot() {
      return state.tasks.map(function (task) {
        return { id: task.id, order: task.order };
      });
    }

    function restoreOrders(snapshot) {
      snapshot.forEach(function (entry) {
        var task = findTask(entry.id);
        if (task) task.order = entry.order;
      });
    }

    function renumber(tasks) {
      tasks.forEach(function (task, index) {
        task.order = index + 1;
      });
    }

    function persistOrder(before, label) {
      pushUndo(label, function () {
        restoreOrders(before);
      });
      emit('task:reorder');
    }

    /** Сдвиг на одну позицию — доступная альтернатива перетаскиванию. */
    function moveTaskBy(id, delta) {
      var task = findTask(id);
      if (!task || !delta) return null;
      var ordered = orderedTasksOfList(task.listId);
      var index = ordered.indexOf(task);
      var next = index + delta;
      if (index === -1 || next < 0 || next >= ordered.length) return null;

      var before = orderSnapshot();
      ordered.splice(index, 1);
      ordered.splice(next, 0, task);
      renumber(ordered);
      persistOrder(before, delta < 0 ? 'Задача поднята' : 'Задача опущена');
      return task;
    }

    /** Перестановка относительно другой задачи — для drag and drop. */
    function moveTaskRelative(id, targetId, placeAfter) {
      var task = findTask(id);
      var target = findTask(targetId);
      if (!task || !target || task.id === target.id || task.listId !== target.listId) return null;

      var ordered = orderedTasksOfList(task.listId);
      var beforeIds = ordered
        .map(function (item) {
          return item.id;
        })
        .join('\u0001');
      var without = ordered.filter(function (item) {
        return item.id !== task.id;
      });
      var targetIndex = without.indexOf(target);
      if (targetIndex === -1) return null;

      without.splice(targetIndex + (placeAfter ? 1 : 0), 0, task);
      var afterIds = without
        .map(function (item) {
          return item.id;
        })
        .join('\u0001');
      if (beforeIds === afterIds) return task;

      var before = orderSnapshot();
      renumber(without);
      persistOrder(before, 'Порядок изменён');
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

    /** Импорт: подменяем состояние, но оставляем возможность отменить через Ctrl+Z. */
    function importState(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.lists)) return null;
      var previous = state;
      state = snapshot;
      clearUndo();
      pushUndo('Данные импортированы', function () {
        state = previous;
      });
      emit('state:import');
      return state;
    }

    return {
      get: get,
      subscribe: subscribe,
      init: init,
      replace: replace,
      importState: importState,
      canUndo: canUndo,
      undo: undo,
      actions: {
        addTask: addTask,
        toggleTask: toggleTask,
        updateTask: updateTask,
        deleteTask: deleteTask,
        restoreTask: restoreTask,
        addList: addList,
        renameList: renameList,
        setListColor: setListColor,
        deleteList: deleteList,
        addSubtask: addSubtask,
        toggleSubtask: toggleSubtask,
        deleteSubtask: deleteSubtask,
        moveTaskBy: moveTaskBy,
        moveTaskRelative: moveTaskRelative,
        setSettings: setSettings
      }
    };
  };
})(window);
