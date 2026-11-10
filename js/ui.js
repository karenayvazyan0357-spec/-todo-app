/* Небольшой слой интерфейсных уведомлений: тосты и вежливые объявления для скринридеров. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var refs = {};
  var stateByNode = new Map();
  var MAX_TOASTS = 3;
  var DEFAULT_DURATION = 6000;

  function init(elements) {
    refs = elements || {};
  }

  /** aria-live: сначала чистим, потом пишем — иначе повторный текст не озвучится. */
  function announce(message) {
    if (!refs.live || !message) return;
    refs.live.textContent = '';
    global.setTimeout(function () {
      if (refs.live) refs.live.textContent = message;
    }, 50);
  }

  function dismiss(node) {    var entry = stateByNode.get(node);
    if (entry) {
      clearTimeout(entry.timer);
      stateByNode.delete(node);
    }
    if (!node.isConnected || node.classList.contains('is-leaving')) return;
    node.classList.add('is-leaving');
    global.setTimeout(function () {
      node.remove();
    }, 200);
  }

  /**
   * Тосты: обычные сообщения живут 6 секунд, важные — дольше.
   * Наведение и фокус ставят таймер на паузу, чтобы успеть прочитать.
   */
  function toast(message, options) {
    options = options || {};
    if (!refs.toasts || !message) return null;

    while (refs.toasts.children.length >= MAX_TOASTS) {
      dismiss(refs.toasts.children[0]);
      if (refs.toasts.children.length >= MAX_TOASTS) refs.toasts.children[0].remove();
    }

    var node = document.createElement('div');
    node.className = 'toast' + (options.variant === 'warn' ? ' toast--warn' : '');
    node.setAttribute('role', 'group');

    var text = document.createElement('p');
    text.className = 'toast__text';
    text.textContent = message;
    node.appendChild(text);

    if (options.actionLabel) {
      var action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast__action';
      action.textContent = options.actionLabel;
      action.addEventListener(
        'click',
        function () {
          if (typeof options.onAction === 'function') options.onAction();
          dismiss(node);
        },
        { once: true }
      );
      node.appendChild(action);
    }

    var duration = options.duration == null ? DEFAULT_DURATION : options.duration;
    var entry = { timer: 0 };
    stateByNode.set(node, entry);

    function schedule() {
      if (!duration) return;
      clearTimeout(entry.timer);
      entry.timer = global.setTimeout(function () {
        dismiss(node);
      }, duration);
    }

    node.addEventListener('pointerenter', function () {
      clearTimeout(entry.timer);
    });
    node.addEventListener('pointerleave', schedule);
    node.addEventListener('focusin', function () {
      clearTimeout(entry.timer);
    });
    node.addEventListener('focusout', schedule);

    refs.toasts.appendChild(node);
    schedule();

    return {
      element: node,
      dismiss: function () {
        dismiss(node);
      }
    };
  }

  App.ui = {
    init: init,
    announce: announce,
    toast: toast
  };
})(window);
