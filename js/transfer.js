/* Экспорт и импорт JSON. Вся проверка данных — в schema.validateSnapshot,
   здесь только файл, размер и подготовка скачивания. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var LIMITS = App.schema.LIMITS;

  function exportData(state, now) {
    try {
      var payload = {
        app: 'tasks',
        version: state.version,
        exportedAt: (now || new Date()).toISOString(),
        lists: state.lists,
        tasks: state.tasks,
        settings: state.settings
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'tasks-' + App.util.todayISO(now || new Date()) + '.json';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: 'Не удалось подготовить файл экспорта.' };
    }
  }

  /** Чистая проверка текста файла: миграция → строгая валидация. */
  function parseText(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, message: 'Файл не является корректным JSON.', errors: [] };
    }

    var migrated = App.schema.migrate(parsed);
    if (!migrated) {
      return { ok: false, message: 'Файл создан в несовместимой версии приложения.', errors: [] };
    }

    var result = App.schema.validateSnapshot(migrated);
    if (!result.ok) {
      return {
        ok: false,
        message: 'Данные не прошли проверку. Текущие задачи остались на месте.',
        errors: result.errors
      };
    }

    return { ok: true, state: result.state };
  }

  function readFile(file) {
    return new Promise(function (resolve) {
      if (!file) {
        resolve({ ok: false, message: 'Файл не выбран.', errors: [] });
        return;
      }
      if (file.size > LIMITS.importBytes) {
        resolve({
          ok: false,
          message: 'Файл слишком большой. Максимум — ' + Math.round(LIMITS.importBytes / 1024 / 1024) + ' МБ.',
          errors: []
        });
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        resolve(parseText(String(reader.result || '')));
      };
      reader.onerror = function () {
        resolve({ ok: false, message: 'Не удалось прочитать файл.', errors: [] });
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  App.transfer = {
    exportData: exportData,
    parseText: parseText,
    readFile: readFile
  };
})(window);
