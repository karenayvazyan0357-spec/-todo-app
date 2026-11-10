/* Схема данных: лимиты, валидация, мягкая починка и миграция версий.
   Два режима: sanitizeSnapshot — терпимый (для чтения своего хранилища),
   validateSnapshot — строгий (для импорта чужого файла). */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var VERSION = 2;
  var INBOX_ID = 'inbox';

  var LIMITS = {
    title: 200,
    listName: 40,
    tag: 24,
    tags: 8,
    subtaskTitle: 120,
    subtasks: 50,
    tasks: 5000,
    lists: 50,
    importBytes: 2 * 1024 * 1024
  };

  var THEMES = ['light', 'dark', 'system'];
  var FILTERS = ['all', 'active', 'done', 'overdue', 'today'];
  var SORTS = ['manual', 'due', 'priority', 'created'];
  var LIST_COLORS = ['#c0603a', '#b08832', '#7d8f3e', '#3f8a7a', '#52708c', '#9a5f7c'];
  var PRIORITY_LABELS = { 0: 'Нет', 1: 'Низкий', 2: 'Средний', 3: 'Высокий' };

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidId(value) {
    // Только безопасный для селекторов и атрибутов набор.
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }

  function isTimestamp(value) {
    return typeof value === 'string' && value.length <= 40 && !isNaN(Date.parse(value));
  }

  function isValidColor(value) {
    return value === 'neutral' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
  }

  function isValidPriority(value) {
    return value === 0 || value === 1 || value === 2 || value === 3;
  }

  function priorityLabel(value) {
    return PRIORITY_LABELS[value] || PRIORITY_LABELS[0];
  }

  function clampPriority(value) {
    return isValidPriority(value) ? value : 0;
  }

  /** Терпимая нормализация тегов (используется и при вводе, и при импорте). */
  function normalizeTags(raw) {
    var result = [];
    var seen = {};
    var source = Array.isArray(raw) ? raw : [];
    source.forEach(function (item) {
      var tag = App.util.cleanText(item, LIMITS.tag).replace(/^#+/, '');
      if (!tag || seen[tag.toLowerCase()] || result.length >= LIMITS.tags) return;
      seen[tag.toLowerCase()] = true;
      result.push(tag);
    });
    return result;
  }

  function normalizeSubtasks(raw, createId) {
    var result = [];
    var source = Array.isArray(raw) ? raw : [];
    source.slice(0, LIMITS.subtasks).forEach(function (item) {
      if (!isPlainObject(item)) return;
      var title = App.util.cleanText(item.title, LIMITS.subtaskTitle);
      if (!title) return;
      result.push({
        id: isValidId(item.id) ? item.id : (createId || App.util.createId)('s_'),
        title: title,
        done: item.done === true
      });
    });
    return result;
  }

  function createDefaultState(now) {
    var stamp = (now || new Date()).toISOString();
    return {
      version: VERSION,
      lists: [{ id: INBOX_ID, name: 'Входящие', color: 'neutral', createdAt: stamp }],
      tasks: [],
      settings: { theme: 'system', listId: INBOX_ID, filter: 'all', sort: 'manual' }
    };
  }

  function defaultSettings() {
    return { theme: 'system', listId: INBOX_ID, filter: 'all', sort: 'manual' };
  }

  /** v1 → v2: раньше не было подзадач и порядка, приоритет был строкой. */
  function migrateFromV1(raw) {
    var stamp = new Date().toISOString();
    var priorityMap = { none: 0, low: 1, medium: 2, high: 3, 1: 1, 2: 2, 3: 3 };

    var lists = Array.isArray(raw.lists)
      ? raw.lists.map(function (list) {
          if (!isPlainObject(list)) return list;
          return {
            id: list.id,
            name: typeof list.name === 'string' ? list.name : list.title,
            color: isValidColor(list.color) ? list.color : 'neutral',
            createdAt: isTimestamp(list.createdAt) ? list.createdAt : stamp
          };
        })
      : raw.lists;

    var tasks = Array.isArray(raw.tasks)
      ? raw.tasks.map(function (task, index) {
          if (!isPlainObject(task)) return task;
          var priority = task.priority;
          if (typeof priority === 'string') priority = priorityMap[priority.toLowerCase()];
          return {
            id: task.id,
            title: typeof task.title === 'string' ? task.title : task.text,
            done: task.done === true || task.completed === true,
            createdAt: isTimestamp(task.createdAt) ? task.createdAt : stamp,
            completedAt: isTimestamp(task.completedAt) ? task.completedAt : null,
            due: App.util.isISODate(task.due) ? task.due : null,
            priority: clampPriority(priority),
            listId: typeof task.listId === 'string' ? task.listId : INBOX_ID,
            tags: normalizeTags(task.tags),
            subtasks: normalizeSubtasks(task.subtasks),
            order: typeof task.order === 'number' && isFinite(task.order) ? task.order : index
          };
        })
      : raw.tasks;

    var settings = isPlainObject(raw.settings) ? raw.settings : {};

    return {
      version: VERSION,
      lists: lists,
      tasks: tasks,
      settings: {
        theme: settings.theme,
        listId: settings.listId,
        filter: settings.filter,
        sort: settings.sort
      }
    };
  }

  /** Возвращает мигрированный объект или null, если версия не поддерживается. */
  function migrate(raw) {
    if (!isPlainObject(raw)) return null;
    var version = typeof raw.version === 'number' ? raw.version : Number(raw.version);
    if (!isFinite(version)) version = 1;
    if (version < 1 || version > VERSION) return null;
    if (version === VERSION) return raw;
    var migrated = migrateFromV1(raw);
    migrated.version = VERSION;
    return migrated;
  }

  function normalizeList(item, fallbackStamp) {
    if (!isPlainObject(item)) return null;
    if (!isValidId(item.id)) return null;
    var name = typeof item.name === 'string' ? App.util.cleanText(item.name, LIMITS.listName) : '';
    if (!name) return null;
    return {
      id: item.id,
      name: name,
      color: isValidColor(item.color) ? item.color : 'neutral',
      createdAt: isTimestamp(item.createdAt) ? item.createdAt : fallbackStamp
    };
  }

  function normalizeTask(item, index, listsById, stamp) {
    if (!isPlainObject(item)) return null;
    if (!isValidId(item.id)) return null;
    var title = typeof item.title === 'string' ? App.util.cleanText(item.title, LIMITS.title) : '';
    if (!title) return null;
    return {
      id: item.id,
      title: title,
      done: item.done === true,
      createdAt: isTimestamp(item.createdAt) ? item.createdAt : stamp,
      completedAt: isTimestamp(item.completedAt) ? item.completedAt : null,
      due: App.util.isISODate(item.due) ? item.due : null,
      priority: clampPriority(item.priority),
      listId: listsById[item.listId] ? item.listId : INBOX_ID,
      tags: normalizeTags(item.tags),
      subtasks: normalizeSubtasks(item.subtasks),
      order: typeof item.order === 'number' && isFinite(item.order) ? item.order : index
    };
  }

  function normalizeSettings(raw, listsById) {
    var settings = defaultSettings();
    if (!isPlainObject(raw)) return settings;
    if (THEMES.indexOf(raw.theme) !== -1) settings.theme = raw.theme;
    if (FILTERS.indexOf(raw.filter) !== -1) settings.filter = raw.filter;
    if (SORTS.indexOf(raw.sort) !== -1) settings.sort = raw.sort;
    if (typeof raw.listId === 'string' && listsById[raw.listId]) settings.listId = raw.listId;
    return settings;
  }

  /**
   * Мягкое чтение: битые записи отбрасываем, остальное чиним.
   * Так одно испорченное поле не убивает весь список.
   */
  function sanitizeSnapshot(raw, now) {
    if (!isPlainObject(raw)) return { ok: false, reason: 'invalid-root' };
    var stamp = (now || new Date()).toISOString();
    var lists = [];
    var listsById = {};

    if (Array.isArray(raw.lists)) {
      raw.lists.slice(0, LIMITS.lists).forEach(function (item) {
        var list = normalizeList(item, stamp);
        if (!list || listsById[list.id]) return;
        listsById[list.id] = list;
        lists.push(list);
      });
    }

    if (!listsById[INBOX_ID]) {
      var inbox = { id: INBOX_ID, name: 'Входящие', color: 'neutral', createdAt: stamp };
      listsById[INBOX_ID] = inbox;
      lists.unshift(inbox);
    } else {
      // «Входящие» — системный список: имя и цвет не даём менять.
      listsById[INBOX_ID].name = 'Входящие';
      listsById[INBOX_ID].color = 'neutral';
    }

    var tasks = [];
    var seenIds = {};
    var sourceTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    var dropped = 0;
    var repaired = false;

    sourceTasks.slice(0, LIMITS.tasks).forEach(function (item, index) {
      var task = normalizeTask(item, index, listsById, stamp);
      if (!task || seenIds[task.id]) {
        dropped += 1;
        return;
      }
      seenIds[task.id] = true;
      tasks.push(task);
    });

    if (sourceTasks.length > LIMITS.tasks) {
      dropped += sourceTasks.length - LIMITS.tasks;
    }

    var hasSettings = isPlainObject(raw.settings);
    if (!hasSettings || raw.version !== VERSION) repaired = true;

    return {
      ok: true,
      state: {
        version: VERSION,
        lists: lists,
        tasks: tasks,
        settings: normalizeSettings(raw.settings, listsById)
      },
      dropped: dropped,
      repaired: repaired || dropped > 0
    };
  }

  /** Строгая проверка импортируемого файла. Возвращает либо state, либо список ошибок. */
  function validateSnapshot(raw) {
    var errors = [];
    var lists = [];
    var listsById = {};
    var tasks = [];
    var tasksById = {};
    var stamp = new Date().toISOString();

    function fail(message) {
      if (errors.length < 12) errors.push(message);
    }

    function readList(item, index) {
      var where = 'Список №' + (index + 1);
      if (!isPlainObject(item)) return fail(where + ': ожидается объект.');
      if (!isValidId(item.id)) {
        return fail(where + ': поле «id» должно состоять из латиницы, цифр, «-» или «_».');
      }
      if (item.color != null && !isValidColor(item.color)) {
        return fail(where + ': цвет «' + String(item.color) + '» не из палитры.');
      }
      var name = typeof item.name === 'string' ? App.util.cleanText(item.name, LIMITS.listName) : '';
      if (!name) return fail(where + ': название не может быть пустым.');
      if (listsById[item.id]) return fail(where + ': повторяющийся id «' + item.id + '».');
      if (!isTimestamp(item.createdAt)) return fail(where + ': поле «createdAt» должно быть датой в ISO.');
      var list = {
        id: item.id,
        name: name,
        color: item.color == null ? 'neutral' : item.color,
        createdAt: item.createdAt
      };
      listsById[list.id] = list;
      lists.push(list);
    }

    function readTask(item, index) {
      var where = 'Задача №' + (index + 1);
      if (!isPlainObject(item)) return fail(where + ': ожидается объект.');
      if (!isValidId(item.id)) {
        return fail(where + ': поле «id» должно состоять из латиницы, цифр, «-» или «_».');
      }
      if (tasksById[item.id]) return fail(where + ': повторяющийся id «' + item.id + '».');
      if (typeof item.title !== 'string') return fail(where + ': поле «title» должно быть строкой.');
      var title = App.util.cleanText(item.title, LIMITS.title);
      if (!title) return fail(where + ': название не может быть пустым.');
      if (typeof item.done !== 'boolean') return fail(where + ': поле «done» должно быть true или false.');
      if (!isTimestamp(item.createdAt)) return fail(where + ': поле «createdAt» должно быть датой в ISO.');
      if (item.completedAt != null && !isTimestamp(item.completedAt)) {
        return fail(where + ': поле «completedAt» должно быть датой или null.');
      }
      if (item.due != null && !App.util.isISODate(item.due)) {
        return fail(where + ': срок должен быть датой вида 2026-02-25 или null.');
      }
      if (!isValidPriority(item.priority)) {
        return fail(where + ': приоритет должен быть числом 0–3.');
      }
      if (typeof item.listId !== 'string' || !listsById[item.listId]) {
        return fail(where + ': список «' + String(item.listId) + '» не найден.');
      }
      if (!Array.isArray(item.tags) || item.tags.length > LIMITS.tags) {
        return fail(where + ': тегов должно быть не больше ' + LIMITS.tags + '.');
      }
      var tagsOk = item.tags.every(function (tag) {
        return typeof tag === 'string' && App.util.cleanText(tag, LIMITS.tag).length > 0 && tag.trim().length <= LIMITS.tag;
      });
      if (!tagsOk) return fail(where + ': теги должны быть короткими строками.');
      if (!Array.isArray(item.subtasks) || item.subtasks.length > LIMITS.subtasks) {
        return fail(where + ': подзадач должно быть не больше ' + LIMITS.subtasks + '.');
      }
      var subtasksOk = item.subtasks.every(function (subtask) {
        return (
          isPlainObject(subtask) &&
          isValidId(subtask.id) &&
          typeof subtask.title === 'string' &&
          App.util.cleanText(subtask.title, LIMITS.subtaskTitle).length > 0 &&
          typeof subtask.done === 'boolean'
        );
      });
      if (!subtasksOk) return fail(where + ': у подзадач нужны уникальные id, title и done.');
      var subtaskIds = {};
      var subtasksUnique = item.subtasks.every(function (subtask) {
        if (subtaskIds[subtask.id]) return false;
        subtaskIds[subtask.id] = true;
        return true;
      });
      if (!subtasksUnique) return fail(where + ': id подзадач не должны повторяться.');
      if (typeof item.order !== 'number' || !isFinite(item.order)) {
        return fail(where + ': поле «order» должно быть числом.');
      }

      tasksById[item.id] = true;
      tasks.push({
        id: item.id,
        title: title,
        done: item.done,
        createdAt: item.createdAt,
        completedAt: item.completedAt || null,
        due: item.due || null,
        priority: item.priority,
        listId: item.listId,
        tags: normalizeTags(item.tags),
        subtasks: normalizeSubtasks(item.subtasks),
        order: item.order
      });
    }

    if (!isPlainObject(raw)) return { ok: false, errors: ['Корень файла должен быть JSON-объектом.'] };
    if (raw.version !== VERSION) {
      return { ok: false, errors: ['Неизвестная версия данных: ожидается ' + VERSION + '.'] };
    }
    if (!Array.isArray(raw.lists)) return { ok: false, errors: ['Поле «lists» должно быть массивом.'] };
    if (raw.lists.length === 0) return { ok: false, errors: ['В файле нет ни одного списка.'] };
    if (raw.lists.length > LIMITS.lists) {
      return { ok: false, errors: ['Слишком много списков: максимум ' + LIMITS.lists + '.'] };
    }
    raw.lists.forEach(readList);

    if (!Array.isArray(raw.tasks)) return { ok: false, errors: ['Поле «tasks» должно быть массивом.'] };
    if (raw.tasks.length > LIMITS.tasks) {
      return { ok: false, errors: ['Слишком много задач: максимум ' + LIMITS.tasks + '.'] };
    }
    raw.tasks.forEach(readTask);

    if (raw.settings != null && !isPlainObject(raw.settings)) {
      return { ok: false, errors: ['Поле «settings» должно быть объектом.'] };
    }

    if (errors.length) {
      return { ok: false, errors: errors };
    }

    if (!listsById[INBOX_ID]) {
      lists.unshift({ id: INBOX_ID, name: 'Входящие', color: 'neutral', createdAt: stamp });
      listsById[INBOX_ID] = lists[0];
    } else {
      listsById[INBOX_ID].name = 'Входящие';
      listsById[INBOX_ID].color = 'neutral';
    }

    var settings = normalizeSettings(raw.settings, listsById);
    // Импорт не должен уводить пользователя в несуществующий список.
    if (!listsById[settings.listId]) settings.listId = INBOX_ID;

    return {
      ok: true,
      state: { version: VERSION, lists: lists, tasks: tasks, settings: settings },
      dropped: 0
    };
  }

  App.schema = {
    VERSION: VERSION,
    INBOX_ID: INBOX_ID,
    LIMITS: LIMITS,
    THEMES: THEMES,
    FILTERS: FILTERS,
    SORTS: SORTS,
    LIST_COLORS: LIST_COLORS,
    PRIORITY_LABELS: PRIORITY_LABELS,
    isPlainObject: isPlainObject,
    isValidId: isValidId,
    isValidColor: isValidColor,
    isValidPriority: isValidPriority,
    isTimestamp: isTimestamp,
    priorityLabel: priorityLabel,
    normalizeTags: normalizeTags,
    normalizeSubtasks: normalizeSubtasks,
    createDefaultState: createDefaultState,
    migrate: migrate,
    sanitizeSnapshot: sanitizeSnapshot,
    validateSnapshot: validateSnapshot
  };
})(window);
