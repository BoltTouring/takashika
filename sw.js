const CACHE_NAME = 'takashika-shell-v2';

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
    appUrl('./js/wanikani-client.js')
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(cacheName => cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
        );
        await self.clients.claim();
    })());
});

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const networkFetch = fetch(request)
        .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);

    return cached || networkFetch;
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(appUrl('./index.html')))
        );
        return;
    }

    if (APP_SHELL.includes(url.toString())) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
