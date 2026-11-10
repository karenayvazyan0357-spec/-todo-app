/* Селекторы: чистые функции поверх состояния. Фильтры, сортировки и статистика.
   Держим их отдельно от хранилища — так их легко тестировать. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var schema = App.schema;
  var util = App.util;

  function findList(state, listId) {
    for (var i = 0; i < state.lists.length; i += 1) {
      if (state.lists[i].id === listId) return state.lists[i];
    }
    return null;
  }

  function currentListId(state) {
    return findList(state, state.settings.listId) ? state.settings.listId : schema.INBOX_ID;
  }

  function listTasks(state, listId) {
    return state.tasks.filter(function (task) {
      return task.listId === listId;
    });
  }

  function matchesFilter(task, filter, now) {
    var today = util.todayISO(now);
    switch (filter) {
      case 'active':
        return !task.done;
      case 'done':
        return task.done;
      case 'overdue':
        return !task.done && !!task.due && task.due < today;
      case 'today':
        return !task.done && task.due === today;
      default:
        return true;
    }
  }

  function matchesQuery(task, query) {
    if (!query) return true;
    var needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (task.title.toLowerCase().indexOf(needle) !== -1) return true;
    return task.tags.some(function (tag) {
      return tag.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function compareDue(a, b) {
    if (a.due === b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }

  function sorted(tasks, sort) {
    var copy = tasks.slice();
    copy.sort(function (a, b) {
      if (sort === 'due') {
        return compareDue(a, b) || b.priority - a.priority || a.order - b.order;
      }
      if (sort === 'priority') {
        return b.priority - a.priority || compareDue(a, b) || b.createdAt.localeCompare(a.createdAt);
      }
      if (sort === 'created') {
        return b.createdAt.localeCompare(a.createdAt) || a.order - b.order;
      }
      return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    });
    return copy;
  }

  /** Задачи текущего списка после поиска, фильтра и сортировки. */
  function visibleTasks(state, query, now) {
    var listId = currentListId(state);
    var filter = state.settings.filter;
    var tasks = state.tasks.filter(function (task) {
      return task.listId === listId && matchesFilter(task, filter, now) && matchesQuery(task, query);
    });
    return sorted(tasks, state.settings.sort);
  }

  /** Счётчики для боковой панели: считаем только активные и всего. */
  function countByList(state) {
    var result = {};
    state.lists.forEach(function (list) {
      result[list.id] = { total: 0, active: 0 };
    });
    state.tasks.forEach(function (task) {
      var bucket = result[task.listId];
      if (!bucket) return;
      bucket.total += 1;
      if (!task.done) bucket.active += 1;
    });
    return result;
  }

  function doneOnDate(task, isoDate) {
    if (!task.done || !task.completedAt) return false;
    var date = new Date(task.completedAt);
    if (isNaN(date.getTime())) return false;
    return util.toISODate(date) === isoDate;
  }

  function computeStats(state, now) {
    var today = util.todayISO(now);
    var weekStart = util.shiftISODate(today, -6);
    var stats = {
      total: state.tasks.length,
      done: 0,
      active: 0,
      doneToday: 0,
      doneWeek: 0,
      overdue: 0,
      dueToday: 0,
      percent: 0
    };

    state.tasks.forEach(function (task) {
      if (task.done) {
        stats.done += 1;
        var completed = task.completedAt ? util.toISODate(new Date(task.completedAt)) : '';
        if (completed === today) stats.doneToday += 1;
        if (completed && completed >= weekStart && completed <= today) stats.doneWeek += 1;
      } else {
        stats.active += 1;
        if (task.due && task.due < today) stats.overdue += 1;
        if (task.due === today) stats.dueToday += 1;
      }
    });

    if (stats.total > 0) {
      stats.percent = Math.round((stats.done / stats.total) * 100);
    }

    return stats;
  }

  /** Сколько задач видно при текущих фильтрах — для живых подписей. */
  function visibleCount(state, query, now) {
    return visibleTasks(state, query, now).length;
  }

  App.selectors = {
    findList: findList,
    currentListId: currentListId,
    listTasks: listTasks,
    matchesFilter: matchesFilter,
    matchesQuery: matchesQuery,
    sorted: sorted,
    visibleTasks: visibleTasks,
    visibleCount: visibleCount,
    countByList: countByList,
    computeStats: computeStats
  };
})(window);
