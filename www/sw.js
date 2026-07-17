const CACHE_NAME = 'cat-drop-v123'; // bumped: add diagnostics (Sentry SDK + black box) — observe-only, no gameplay change
const AUDIO_FILES = [
  'bgm.wav', 'bgm_mystic.wav', 'bgm_rapper.wav', 'bgm_zombie.wav', 'bgm_vampire.wav', 'bgm_oldman.wav',
  'drop.wav', 'merge.wav', 'game_over.wav', 'dev_egg.wav',
  'drop_mystic.wav', 'merge_mystic.wav', 'game_over_mystic.wav',
  'drop_rapper.wav', 'merge_rapper.wav', 'game_over_rapper.wav',
  'drop_zombie.wav', 'merge_zombie.wav', 'game_over_zombie.wav',
  'drop_vampire.wav', 'merge_vampire.wav', 'game_over_vampire.wav',
  'drop_oldman.wav', 'merge_oldman.wav', 'game_over_oldman.wav',
].map(f => './assets/audio/' + f);

const SPRITE_FILES = [
  ...Array.from({length: 11}, (_, i) => `./assets/sprites/cat_${i+1}.png`),
  './assets/sprites/skin_rapper.png',
  './assets/sprites/skin_zombie.png',
  './assets/sprites/skin_vampire.png',
  './assets/sprites/skin_bard.png',
  './assets/sprites/skin_oldman.png',
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
  './js/cloud_save.js',
  './manifest.json',
  './assets/dev-cat-peek-peace.png',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  ...AUDIO_FILES,
  ...SPRITE_FILES  // BUG-008 fix: кэшируем спрайты при установке — игра работает оффлайн
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
