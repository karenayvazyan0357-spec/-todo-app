/* Утилиты: даты, текст, DOM-хелперы. Чистые функции — их удобно тестировать и переиспользовать. */
(function (global) {
  'use strict';

  var App = (global.TodoApp = global.TodoApp || {});
  var DAY_MS = 86400000;
  var LOCALE = 'ru-RU';

  // Форматтеры создаём один раз: Intl дорогой при частом вызове.
  var fmtDateLong = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  var fmtDateShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
  var fmtDateShortYear = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  var fmtDateTime = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var pluralRules = new Intl.PluralRules(LOCALE);

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  /** Локальная дата в формате ISO (YYYY-MM-DD) без сдвига часового пояса. */
  function toISODate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function todayISO(now) {
    return toISODate(now || new Date());
  }

  function isISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-');
    var date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return date.getFullYear() === +parts[0] && date.getMonth() === +parts[1] - 1 && date.getDate() === +parts[2];
  }

  /** Полдень выбранного дня: так переход на летнее время не сдвигает дату. */
  function fromISODate(value) {
    var parts = value.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0, 0);
  }

  function shiftISODate(value, days) {
    var date = fromISODate(value);
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function utcKey(value) {
    var parts = value.split('-');
    return Date.UTC(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function daysBetween(from, to) {
    return Math.round((utcKey(to) - utcKey(from)) / DAY_MS);
  }

  function formatDateLong(value) {
    return fmtDateLong.format(fromISODate(value));
  }

  /** Короткая подпись даты — для выполненных задач, где не нужен акцент на сроке. */
  function formatDateShort(value) {
    if (!isISODate(value)) return '';
    var date = fromISODate(value);
    var now = new Date();
    return date.getFullYear() === now.getFullYear() ? fmtDateShort.format(date) : fmtDateShortYear.format(date);
  }

  function formatDateTime(isoString) {
    var date = new Date(isoString);
    return isNaN(date.getTime()) ? '' : fmtDateTime.format(date);
  }

  /**
   * Подпись к сроку. Возвращает и «настроение» (kind), чтобы стилизовать просрочку отдельно.
   * Пример: { kind: 'overdue', label: 'Просрочено на 3 дн.', title: 'Срок: 7 февраля 2026 г.' }
   */
  function formatDue(due, now) {
    if (!isISODate(due)) return null;
    var today = todayISO(now);
    var diff = daysBetween(today, due);
    var date = fromISODate(due);
    var kind;
    var label;

    if (diff < 0) {
      kind = 'overdue';
      label = 'Просрочено на ' + Math.abs(diff) + ' дн.';
    } else if (diff === 0) {
      kind = 'today';
      label = 'Сегодня';
    } else if (diff === 1) {
      kind = 'tomorrow';
      label = 'Завтра';
    } else {
      kind = 'future';
      label = date.getFullYear() === (now || new Date()).getFullYear() ? fmtDateShort.format(date) : fmtDateShortYear.format(date);
    }

    return { kind: kind, label: label, title: 'Срок: ' + fmtDateLong.format(date), date: due };
  }

  /** Склонение по правилам русского языка: plural(3, 'задача', 'задачи', 'задач'). */
  function plural(count, one, few, many) {
    var form = pluralRules.select(count);
    if (form === 'one') return one;
    if (form === 'few') return few;
    return many;
  }

  function nowISOString(now) {
    return (now || new Date()).toISOString();
  }

  /** Обрезаем, схлопываем пробелы и отбрасываем управляющие символы. */
  function cleanText(value, maxLength) {
    var text = value == null ? '' : String(value);
    text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return maxLength ? text.slice(0, maxLength) : text;
  }

  function createId(prefix) {
    var random;
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      random = global.crypto.randomUUID();
    } else {
      random = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    return (prefix || '') + random;
  }

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
  }

  /** Короткий конструктор элемента: textContent вместо innerHTML — безопасно по умолчанию. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  App.util = {
    DAY_MS: DAY_MS,
    LOCALE: LOCALE,
    toISODate: toISODate,
    todayISO: todayISO,
    isISODate: isISODate,
    fromISODate: fromISODate,
    shiftISODate: shiftISODate,
    daysBetween: daysBetween,
    formatDateLong: formatDateLong,
    formatDateShort: formatDateShort,
    formatDateTime: formatDateTime,
    formatDue: formatDue,
    plural: plural,
    nowISOString: nowISOString,
    cleanText: cleanText,
    createId: createId,
    debounce: debounce,
    isEditableTarget: isEditableTarget,
    el: el,
    setText: setText
  };
})(window);
