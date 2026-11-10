/* Быстрый ввод: «Купить молоко завтра !3 #дом» → текст, срок, приоритет, теги.
   Чистая функция без DOM и состояния — поэтому её легко покрыть тестами. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var util = App.util;
  var LIMITS = App.schema.LIMITS;

  var DUE_WORDS = { 'сегодня': 0, 'завтра': 1, 'послезавтра': 2 };
  var DATE_TOKEN = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/;
  var PRIORITY_TOKEN = /^!([1-3])$/;
  var TAG_TOKEN = /^#([A-Za-zА-Яа-яЁё0-9_-]{1,24})$/;

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function makeDate(year, month, day) {
    if (day < 1 || day > 31) return null;
    var iso = year + '-' + pad2(month) + '-' + pad2(day);
    return util.isISODate(iso) ? iso : null;
  }

  /** 25.12 без года: если дата уже прошла, имеется в виду следующий год. */
  function resolveDate(day, month, yearText, now, today) {
    if (month < 1 || month > 12) return null;
    if (yearText) return makeDate(Number(yearText), month, day);

    var year = now.getFullYear();
    var candidate = makeDate(year, month, day) || makeDate(year + 1, month, day);
    if (!candidate) return null;
    if (candidate < today) candidate = makeDate(year + 1, month, day) || candidate;
    return candidate;
  }

  /** Убираем хвостовую пунктуацию, чтобы «завтра,» тоже распознавалось. */
  function withoutTailPunctuation(token) {
    return token.replace(/[.,;:!?]+$/, '');
  }

  function parseQuickInput(text, now) {
    var date = now instanceof Date ? now : new Date(now || Date.now());
    var today = util.todayISO(date);
    var tokens = String(text == null ? '' : text)
      .split(/\s+/)
      .filter(Boolean);

    var titleTokens = [];
    var due = null;
    var priority = 0;
    var tags = [];
    var seenTags = {};

    tokens.forEach(function (token) {
      var stripped = withoutTailPunctuation(token);
      var lower = stripped.toLowerCase();

      if (Object.prototype.hasOwnProperty.call(DUE_WORDS, lower)) {
        due = util.shiftISODate(today, DUE_WORDS[lower]);
        return;
      }

      var dateMatch = stripped.match(DATE_TOKEN);
      if (dateMatch) {
        var iso = resolveDate(Number(dateMatch[1]), Number(dateMatch[2]), dateMatch[3], date, today);
        if (iso) {
          due = iso;
          return;
        }
      }

      var priorityMatch = stripped.match(PRIORITY_TOKEN);
      if (priorityMatch) {
        priority = Number(priorityMatch[1]);
        return;
      }

      var tagMatch = stripped.match(TAG_TOKEN);
      if (tagMatch) {
        var tag = tagMatch[1];
        var key = tag.toLowerCase();
        if (!seenTags[key] && tags.length < LIMITS.tags) {
          seenTags[key] = true;
          tags.push(tag);
        }
        return;
      }

      titleTokens.push(token);
    });

    return {
      title: util.cleanText(titleTokens.join(' '), LIMITS.title),
      due: due,
      priority: priority,
      tags: tags
    };
  }

  App.parser = { parseQuickInput: parseQuickInput };
})(window);
