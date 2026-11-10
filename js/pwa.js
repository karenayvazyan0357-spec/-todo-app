/* Регистрация service worker. На file:// и без поддержки просто ничего не делаем,
   чтобы приложение открывалось двойным кликом и не падало. */
(function (global) {
  'use strict';

  if (!global.navigator || !('serviceWorker' in global.navigator)) return;
  if (global.location.protocol !== 'http:' && global.location.protocol !== 'https:') return;

  var hadController = !!global.navigator.serviceWorker.controller;
  var refreshing = false;

  global.navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || refreshing) return;
    refreshing = true;
    var App = global.TodoApp;
    if (App && App.ui) {
      App.ui.toast('Доступна новая версия приложения', {
        actionLabel: 'Обновить',
        duration: 12000,
        onAction: function () {
          global.location.reload();
        }
      });
    } else {
      global.location.reload();
    }
  });

  global.addEventListener('load', function () {
    global.navigator.serviceWorker.register('sw.js').catch(function (error) {
      // Офлайн-режим не включится, но приложение продолжит работать.
      if (global.console && global.console.warn) global.console.warn('Service worker не зарегистрирован:', error);
    });
  });
})(window);
