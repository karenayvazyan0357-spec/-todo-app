/* Service worker: офлайн-оболочка.
   HTML — network-first, чтобы пользователь не застревал на старой версии.
   Остальные файлы — cache-first: они неизменяемы в пределах версии кэша. */
'use strict';

var CACHE_PREFIX = 'todo-shell-';
var CACHE_NAME = CACHE_PREFIX + 'v1.0.0';
var OFFLINE_URL = './index.html';

var SHELL = [
  './',
  './index.html',
  './tests.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './js/util.js',
  './js/icons.js',
  './js/schema.js',
  './js/storage.js',
  './js/selectors.js',
  './js/state.js',
  './js/ui.js',
  './js/parser.js',
  './js/render.js',
  './js/dialogs.js',
  './js/dnd.js',
  './js/transfer.js',
  './js/fx.js',
  './js/pwa.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, при офлайне — кэш.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Статика: кэш, а при промахе — сеть с записью в кэш.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
