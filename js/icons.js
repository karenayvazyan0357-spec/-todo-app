/* Иконки: один визуальный стиль (тонкая обводка 1.7), только встроенный SVG. */
(function (global) {
  'use strict';

  var App = (global.TodoApp = global.TodoApp || {});
  var NS = 'http://www.w3.org/2000/svg';

  var shapes = {
    check: [['path', { d: 'M4.8 12.4 9.4 17 19.2 6.8' }]],
    plus: [['path', { d: 'M12 5.5v13M5.5 12h13' }]],
    search: [['circle', { cx: 11, cy: 11, r: 6.4 }], ['path', { d: 'm15.9 15.9 4.4 4.4' }]],
    close: [['path', { d: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5' }]],
    menu: [['path', { d: 'M4 7h16M4 12h16M4 17h16' }]],
    trash: [['path', { d: 'M4.5 7h15M9.2 7V4.8h5.6V7M6.8 7l.7 12.2h9l.7-12.2M10.2 10.8v5.6M13.8 10.8v5.6' }]],
    pencil: [['path', { d: 'M4 20h4.2L19.6 8.6a2.1 2.1 0 0 0-3-3L5 17.2V20ZM14.6 6.6l3 3' }]],
    grip: [
      ['circle', { cx: 9, cy: 6, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 9, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 9, cy: 18, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 15, cy: 6, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 15, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 15, cy: 18, r: 1.5, fill: 'currentColor', stroke: 'none' }]
    ],
    'arrow-up': [['path', { d: 'M12 19V5M6 11l6-6 6 6' }]],
    'arrow-down': [['path', { d: 'M12 5v14M6 13l6 6 6-6' }]],
    calendar: [
      ['rect', { x: 4, y: 6, width: 16, height: 14, rx: 2 }],
      ['path', { d: 'M4 10.5h16M8.5 4v4M15.5 4v4' }]
    ],
    tag: [
      ['path', { d: 'M4.5 11.2V5.2a.8.8 0 0 1 .8-.8h6l8.2 8.2a1.4 1.4 0 0 1 0 2l-5.2 5.2a1.4 1.4 0 0 1-2 0Z' }],
      ['circle', { cx: 8.6, cy: 8.6, r: 1.1 }]
    ],
    checklist: [
      ['path', { d: 'M10 6.5h9M10 12h9M10 17.5h9' }],
      ['path', { d: 'm4 6.5 1.4 1.4L7.6 5M4 12l1.4 1.4L7.6 10.5M4 17.5l1.4 1.4L7.6 16' }]
    ],
    chart: [['path', { d: 'M4 20h16M7 16V9M12 16V5M17 16v-4' }]],
    download: [['path', { d: 'M12 4v10M7.5 10.2 12 14.7l4.5-4.5M5 19h14' }]],
    upload: [['path', { d: 'M12 15V5M7.5 8.8 12 4.3l4.5 4.5M5 19h14' }]],
    keyboard: [
      ['rect', { x: 3.5, y: 6, width: 17, height: 12, rx: 2 }],
      ['path', { d: 'M7 10h.01M10.3 10h.01M13.6 10h.01M17 10h.01M8 14h8' }]
    ],
    list: [['path', { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' }]],
    more: [
      ['circle', { cx: 5.5, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 18.5, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }]
    ],
    lines: [['path', { d: 'M4 7.5h16M4 12h10M4 16.5h16' }]],
    undo: [['path', { d: 'M4 9h9.5a5.5 5.5 0 1 1 0 11H8M4 9l4-4M4 9l4 4' }]]
  };

  /** Создаёт SVG-иконку. Декоративную прячем от скринридеров. */
  function create(name, size) {
    var svg = document.createElementNS(NS, 'svg');
    var box = size || 18;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', box);
    svg.setAttribute('height', box);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    var parts = shapes[name];
    if (!parts) return svg;

    parts.forEach(function (part) {
      var node = document.createElementNS(NS, part[0]);
      Object.keys(part[1]).forEach(function (attribute) {
        node.setAttribute(attribute, part[1][attribute]);
      });
      svg.appendChild(node);
    });

    return svg;
  }

  App.icons = { create: create, names: Object.keys(shapes) };
})(window);
