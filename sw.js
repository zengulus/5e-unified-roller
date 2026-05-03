const CACHE_NAME = 'ravnica-tools-v11';
const SHELL_ASSETS = [
    './',
    './manifest.json',
    './icon.svg',
    './board.html',
    './campaign-board.html',
    './campaign-timeline.html',
    './clocks.html',
    './clue.html',
    './dm-screen.html',
    './encounters.html',
    './gm.html',
    './hq.html',
    './hub.html',
    './index.html',
    './leads.html',
    './ledger.html',
    './locations.html',
    './player-dashboard.html',
    './prep-procedure.html',
    './requisitions.html',
    './roster.html',
    './timeline.html',
    './tools.html',
    './css/board.css',
    './css/clocks.css',
    './css/clue.css',
    './css/dm-screen.css',
    './css/encounters.css',
    './css/gm.css',
    './css/hq.css',
    './css/hub-page.css',
    './css/hub.css',
    './css/index.css',
    './css/ledger.css',
    './css/locations.css',
    './css/player-dashboard.css',
    './css/player-nav.css',
    './css/prep-procedure.css',
    './css/requisitions.css',
    './css/roster.css',
    './css/theme.css',
    './css/timeline.css',
    './css/tools-page.css',
    './css/tools.css',
    './js/board.js',
    './js/board-collab.js',
    './js/clocks.js',
    './js/clue.js',
    './js/config.js',
    './js/core.js',
    './js/data-loader.js',
    './js/creator.js',
    './js/data-clue.js',
    './js/data-guilds.js',
    './js/data-setting.js',
    './js/data.js',
    './js/delegated-handler.js',
    './js/dice.js',
    './js/dm-screen.js',
    './js/encounters.js',
    './js/gm.js',
    './js/hq.js',
    './js/hub.js',
    './js/importer.js',
    './js/index.js',
    './js/leads.js',
    './js/ledger.js',
    './js/locations.js',
    './js/media-cache.js',
    './js/my-story-board-bridge.js',
    './js/pdf.min.js',
    './js/pdf.worker.min.js',
    './js/player-dashboard.js',
    './js/player-nav.js',
    './js/prep-procedure.js',
    './js/requisitions.js',
    './js/roster.js',
    './js/session-log.js',
    './js/sheet.js',
    './js/soft-delete.js',
    './js/store.js',
    './js/sw-register.js',
    './js/timeline.js',
    './js/tools.js',
    './js/ui.js',
    './js/vector-field.js',
    './js/srd-5.2-spells.json'
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
