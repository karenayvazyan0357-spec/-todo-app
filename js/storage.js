/* Хранилище: единственная точка работы с localStorage. Любая ошибка — не повод падать. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var KEY = 'todo-app:v2';
  var THEME_KEY = 'todo-app:theme';
  var CORRUPT_PREFIX = 'todo-app:v2:corrupt-';
  var status = { available: true, checked: false, lastError: '' };

  function backend() {
    return global.localStorage;
  }

  function describeError(error) {
    if (!error) return 'Неизвестная ошибка хранилища.';
    var isQuota = error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22;
    if (isQuota) {
      return 'Не хватает места в хранилище — последние изменения могут не сохраниться.';
    }
    return 'Хранилище браузера недоступно. Задачи сохранятся только до закрытия вкладки.';
  }

  /** Один раз проверяем, можно ли писать: Safari на file:// умеет бросать SecurityError. */
  function probe() {
    if (status.checked) return status.available;
    status.checked = true;
    try {
      var store = backend();
      store.setItem('todo-app:probe', '1');
      store.removeItem('todo-app:probe');
      status.available = true;
      status.lastError = '';
    } catch (error) {
      status.available = false;
      status.lastError = describeError(error);
    }
    return status.available;
  }

  /** Повреждённые данные не удаляем, а откладываем под отдельный ключ. */
  function quarantine(raw, now) {
    try {
      var stamp = new Date(now || Date.now()).toISOString().replace(/[:.]/g, '-');
      var key = CORRUPT_PREFIX + stamp;
      backend().setItem(key, raw);
      return key;
    } catch (error) {
      return '';
    }
  }

  function defaultState(now) {
    return App.schema.createDefaultState(now ? new Date(now) : new Date());
  }

  function warningForDropped(count) {
    var word = App.util.plural(count, 'запись', 'записи', 'записей');
    return 'Не удалось прочитать ' + count + ' ' + word + ' из сохранения — они были повреждены.';
  }

  /**
   * Читает состояние. Всегда возвращает рабочий state и, если что-то пошло не так,
   * человеческое предупреждение для тоста.
   */
  function load(now) {
    var stamp = now ? new Date(now) : new Date();
    probe();

    var raw;
    try {
      raw = backend().getItem(KEY);
    } catch (error) {
      status.available = false;
      status.lastError = describeError(error);
      return { state: defaultState(stamp), warning: status.lastError };
    }

    if (!raw) {
      return { state: defaultState(stamp), warning: status.available ? '' : status.lastError };
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      var backupKey = quarantine(raw, stamp);
      return {
        state: defaultState(stamp),
        warning:
          'Сохранение повреждено' + (backupKey ? ' (копия отложена)' : '') + '. Начали с чистого списка.'
      };
    }

    var migrated = App.schema.migrate(parsed);
    if (!migrated) {
      quarantine(raw, stamp);
      return {
        state: defaultState(stamp),
        warning: 'Формат сохранения не поддерживается. Начали с чистого списка, старые данные отложены.'
      };
    }

    var result = App.schema.sanitizeSnapshot(migrated, stamp);
    if (!result.ok) {
      quarantine(raw, stamp);
      return { state: defaultState(stamp), warning: 'Не удалось прочитать сохранение. Начали с чистого списка.' };
    }

    var warning = '';
    if (result.dropped > 0) warning = warningForDropped(result.dropped);
    else if (!status.available) warning = status.lastError;

    return { state: result.state, warning: warning };
  }

  function save(snapshot) {
    try {
      backend().setItem(KEY, JSON.stringify(snapshot));
      return { ok: true };
    } catch (error) {
      status.lastError = describeError(error);
      return { ok: false, error: status.lastError };
    }
  }

  /** Зеркало темы для inline-скрипта: он не должен парсить всё состояние до отрисовки. */
  function saveTheme(theme) {
    try {
      backend().setItem(THEME_KEY, theme);
      return true;
    } catch (error) {
      return false;
    }
  }

  App.storage = {
    KEY: KEY,
    load: load,
    save: save,
    saveTheme: saveTheme
  };
})(window);
