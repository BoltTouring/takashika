const CACHE_NAME = 'takashika-shell-v4';

function appUrl(path) {
    return new URL(path, self.location).toString();
}

const APP_SHELL = [
    appUrl('./'),
    appUrl('./index.html'),
    appUrl('./styles.css'),
    appUrl('./app.js'),
    appUrl('./manifest.json'),
    appUrl('./icons/app-icon.svg'),
    appUrl('./js/answer-checker.js'),
    appUrl('./js/audio-manager.js'),
    appUrl('./js/review-queue.js'),
    appUrl('./js/reviewer.js'),
    appUrl('./js/review-checkpoint.js'),
    appUrl('./js/wanikani-client.js')
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(cacheName => cacheName.startsWith('takashika-shell-') && cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match(appUrl('./index.html')).then(cached => cached || fetch(request))
        );
        return;
    }

    if (APP_SHELL.includes(url.toString())) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            return await cache.match(request) || fetch(request);
        })());
    }
});
