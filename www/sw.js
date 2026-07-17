const CACHE_NAME = 'cat-drop-v144'; // 6 чиптюн-паков + диагностика (Sentry/чёрный ящик)
const CORE_AUDIO_FILES = [
  './assets/audio/bgm.wav',
  './assets/audio/drop.wav',
  './assets/audio/merge.wav',
  './assets/audio/game_over.wav',
];

const CORE_SPRITE_FILES = [
  ...Array.from({length: 4}, (_, i) => `./assets/sprites/cat_${i+1}.png`),
  './assets/sprites/needle.png',
];

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './js/matter.min.js',
  './js/sentry.min.js',
  './js/diagnostics.js',
  './js/diagnostics_watchdogs.js',
  './js/game.js',
  './js/game_modes.js',
  './js/state.js',
  './js/sprite.js',
  './js/responsive.js',
  './js/telegram.js',
  './js/physics.js',
  './js/audio.js',
  './js/play_games.js',
  './js/cloud_save.js',
  './manifest.json',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  ...CORE_AUDIO_FILES,
  ...CORE_SPRITE_FILES
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // We only want to cache GET requests
    if (event.request.method !== 'GET') return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put('./index.html', responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                return caches.match('./index.html').then(cachedResponse => cachedResponse || caches.match('./'));
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Return from cache if available
            if (cachedResponse) {
                return cachedResponse;
            }

            // Otherwise fetch from network
            return fetch(event.request).then(networkResponse => {
                // Check if valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Cache the newly fetched asset (sprites, sounds, etc) dynamically!
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(err => {
                console.error('Fetch failed, offline mode:', err);
                // In a real app we might return an offline fallback page here
            });
        })
    );
});
