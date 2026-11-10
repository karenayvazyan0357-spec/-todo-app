/* Перетаскивание задач (Pointer Events): работает мышью, пальцем и пером.
   Порядок меняем только в ручном режиме сортировки, чтобы не спорить с фильтрами. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var refs = {};
  var drag = null;

  function init(elements) {
    refs = elements || {};
    if (!refs.list) return;
    refs.list.addEventListener('pointerdown', onPointerDown);
    global.document.addEventListener('pointermove', onPointerMove, { passive: false });
    global.document.addEventListener('pointerup', onPointerUp);
    global.document.addEventListener('pointercancel', onPointerCancel);
    global.document.addEventListener('keydown', onKeyDown);
  }

  function isEnabled() {
    return !!(App.store && App.store.get().settings.sort === 'manual');
  }

  function visibleTaskNodes() {
    return Array.prototype.slice.call(refs.list.querySelectorAll('.task')).filter(function (node) {
      return !node.classList.contains('is-leaving');
    });
  }

  function clearDropMarks() {
    visibleTaskNodes().forEach(function (node) {
      node.classList.remove('is-drop-before', 'is-drop-after');
    });
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var grip = event.target.closest('[data-action="grip"]');
    if (!grip || !refs.list.contains(grip) || !isEnabled()) return;
    var item = grip.closest('.task');
    if (!item || visibleTaskNodes().length < 2) return;

    drag = {
      pointerId: event.pointerId,
      grip: grip,
      item: item,
      taskId: item.dataset.id,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      active: false,
      target: null,
      placeAfter: false,
      raf: 0
    };

    // Иначе браузер начнёт выделять текст вместо перетаскивания.
    event.preventDefault();
    try {
      grip.setPointerCapture(event.pointerId);
    } catch (error) {
      /* некоторые браузеры не поддерживают захват — работаем без него */
    }
  }

  function activate() {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.item.classList.add('is-dragging');
    document.body.classList.add('is-dragging-task');
    App.ui.announce('Перетаскивание начато. Отпустите, чтобы переместить задачу.');
    tick();
  }

  function updateTarget(pointerY) {
    if (!drag) return;
    var candidates = visibleTaskNodes().filter(function (node) {
      return node !== drag.item;
    });

    var target = null;
    for (var i = 0; i < candidates.length; i += 1) {
      var rect = candidates[i].getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        target = candidates[i];
        break;
      }
    }

    var placeAfter = false;
    if (!target) {
      target = candidates[candidates.length - 1] || null;
      placeAfter = true;
    }

    clearDropMarks();
    if (target) target.classList.add(placeAfter ? 'is-drop-after' : 'is-drop-before');
    drag.target = target;
    drag.placeAfter = placeAfter;
  }

  function tick() {
    if (!drag || !drag.active) return;
    var margin = 96;
    var delta = 0;
    if (drag.lastY < margin) delta = -Math.ceil((margin - drag.lastY) / 6);
    else if (drag.lastY > global.innerHeight - margin) delta = Math.ceil((drag.lastY - (global.innerHeight - margin)) / 6);

    if (delta && typeof global.scrollBy === 'function') {
      global.scrollBy(0, delta);
      updateTarget(drag.lastY);
    }
    drag.raf = global.requestAnimationFrame(tick);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastY = event.clientY;

    if (!drag.active) {
      var movedX = Math.abs(event.clientX - drag.startX);
      var movedY = Math.abs(event.clientY - drag.startY);
      if (movedX < 5 && movedY < 5) return;
      activate();
    }

    event.preventDefault();
    updateTarget(event.clientY);
  }

  function finish(commit) {
    if (!drag) return;
    var current = drag;
    drag = null;

    current.item.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-task');
    clearDropMarks();
    if (current.raf) global.cancelAnimationFrame(current.raf);
    try {
      current.grip.releasePointerCapture(current.pointerId);
    } catch (error) {
      /* захват уже снят */
    }

    if (!current.active) {
      current.grip.focus();
      return;
    }

    if (!commit || !current.target) return;

    var moved = App.store.actions.moveTaskRelative(current.taskId, current.target.dataset.id, current.placeAfter);
    if (moved) {
      App.ui.announce('Задача перемещена.');
      if (typeof refs.onMoved === 'function') refs.onMoved(current.taskId);
    }
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finish(true);
  }

  function onPointerCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finish(false);
  }

  function onKeyDown(event) {
    if (!drag) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    finish(false);
  }

  App.dnd = { init: init };
})(window);
