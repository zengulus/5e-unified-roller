const CACHE_NAME = 'ravnica-tools-v5';
const SHELL_ASSETS = [
    './',
    './tools.html',
    './index.html',
    './hub.html'
];
const LIVE_FETCH_DESTINATIONS = new Set(['document', 'script', 'style', 'worker', 'sharedworker']);

function shouldBypassHttpCache(request, url) {
    if (!request || !url) return false;
    if (request.mode === 'navigate') return true;
    if (LIVE_FETCH_DESTINATIONS.has(request.destination)) return true;
    return /\.(?:html|css|js|json|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (!event.request || event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const fetchOptions = shouldBypassHttpCache(event.request, url)
                ? { cache: 'no-store' }
                : undefined;
            const networkResponse = fetchOptions
                ? await fetch(event.request, fetchOptions)
                : await fetch(event.request);
            if (
                networkResponse &&
                networkResponse.status === 200 &&
                (networkResponse.type === 'basic' || networkResponse.type === 'default')
            ) {
                cache.put(event.request, networkResponse.clone()).catch(() => { });
            }
            return networkResponse;
        } catch (err) {
            const cached = await cache.match(event.request);
            if (cached) return cached;

            if (event.request.mode === 'navigate') {
                const fallback = await cache.match('./tools.html');
                if (fallback) return fallback;
            }
            throw err;
        }
    })());
});
