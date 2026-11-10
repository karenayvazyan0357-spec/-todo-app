/* Компактный праздник на canvas: срабатывает, когда в списке не осталось активных задач.
   Уважает prefers-reduced-motion и не создаёт лишних узлов в DOM. */
(function (global) {
  'use strict';

  var App = global.TodoApp;
  var LIGHT_COLORS = ['#a83c22', '#c0603a', '#7d8f3e', '#3f8a7a', '#b08832'];
  var DARK_COLORS = ['#f0794f', '#ffb199', '#e8b45e', '#7fc4b4', '#c9d6a8'];
  var motionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var canvas = null;
  var ctx = null;
  var particles = [];
  var frameId = 0;
  var dpr = 1;
  var viewport = { width: 0, height: 0 };

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    viewport.width = global.innerWidth;
    viewport.height = global.innerHeight;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
  }

  function init(element) {
    canvas = element || null;
    if (!canvas || typeof canvas.getContext !== 'function') {
      canvas = null;
      return;
    }
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
  }

  function spawn() {
    var colors = document.documentElement.dataset.theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    var count = Math.min(90, Math.max(36, Math.round(viewport.width / 14)));
    particles = [];

    for (var i = 0; i < count; i += 1) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      var speed = 6 + Math.random() * 7;
      particles.push({
        x: viewport.width / 2 + (Math.random() - 0.5) * viewport.width * 0.3,
        y: viewport.height * 0.36 + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5,
        color: colors[i % colors.length],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.25,
        life: 0,
        ttl: 70 + Math.random() * 40
      });
    }
  }

  function draw() {
    var width = viewport.width;
    var height = viewport.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var alive = 0;
    for (var i = 0; i < particles.length; i += 1) {
      var particle = particles[i];
      particle.life += 1;
      particle.vy += 0.22;
      particle.vx *= 0.995;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.spin;

      if (particle.y > height + 24 || particle.life > particle.ttl) continue;
      alive += 1;

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = Math.max(0, 1 - particle.life / particle.ttl);
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 6, particle.size, particle.size / 3);
      ctx.restore();
    }

    if (alive > 0) {
      frameId = global.requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, width, height);
      particles = [];
      frameId = 0;
    }
  }

  function celebrate() {
    if (!ctx || motionQuery.matches) return;
    resize();
    if (frameId) global.cancelAnimationFrame(frameId);
    spawn();
    frameId = global.requestAnimationFrame(draw);
  }

  App.fx = {
    init: init,
    celebrate: celebrate
  };
})(window);
