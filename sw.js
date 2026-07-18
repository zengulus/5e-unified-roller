const CACHE_NAME = 'ravnica-tools-v21';
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
    './vtt.html',
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
    './css/vtt.css',
    './js/board.js',
    './js/board-collab.js',
    './js/character-model.js',
    './js/clocks.js',
    './js/clue.js',
    './js/data-loader.js',
    './js/data-clue.js',
    './js/data-guilds.js',
    './js/data-setting.js',
    './js/data.js',
    './js/delegated-handler.js',
    './js/dice.js',
    './js/data-migrations.js',
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
    './js/soft-delete.js',
    './js/store.js',
    './js/supabase-transport.js',
    './js/sw-register.js',
    './js/timeline.js',
    './js/tools.js',
    './js/ui.js',
    './js/vector-field.js',
    './js/vtt-config.js',
    './js/vtt-dom.js',
    './js/vtt-inspector-markup.js',
    './js/vtt-runtime-state.js',
    './js/vtt-collab.js',
    './js/vtt-fog-unified.js',
    './js/vtt-field-router.js',
    './js/vtt-actions-rolls.js',
    './js/vtt-actions-scenes.js',
    './js/vtt-actions-selection.js',
    './js/vtt-actions-table.js',
    './js/vtt-black-moon.js',
    './js/vtt-geometry.js',
    './js/vtt-markup.js',
    './js/vtt-proximity.js',
    './js/vtt-rolls.js',
    './js/vtt-rules.js',
    './js/vtt-session.js',
    './js/vtt-stage-input.js',
    './js/vtt-stage-view.js',
    './js/vtt.js',
    './js/collab-relay-client.js',
    './js/vendor/lib0/array.js',
    './js/vendor/lib0/binary.js',
    './js/vendor/lib0/buffer.js',
    './js/vendor/lib0/conditions.js',
    './js/vendor/lib0/decoding.js',
    './js/vendor/lib0/dom.js',
    './js/vendor/lib0/encoding.js',
    './js/vendor/lib0/environment.js',
    './js/vendor/lib0/error.js',
    './js/vendor/lib0/eventloop.js',
    './js/vendor/lib0/function.js',
    './js/vendor/lib0/indexeddb.js',
    './js/vendor/lib0/iterator.js',
    './js/vendor/lib0/json.js',
    './js/vendor/lib0/logging.common.js',
    './js/vendor/lib0/logging.js',
    './js/vendor/lib0/map.js',
    './js/vendor/lib0/math.js',
    './js/vendor/lib0/metric.js',
    './js/vendor/lib0/number.js',
    './js/vendor/lib0/object.js',
    './js/vendor/lib0/observable.js',
    './js/vendor/lib0/pair.js',
    './js/vendor/lib0/prng.js',
    './js/vendor/lib0/prng/Xoroshiro128plus.js',
    './js/vendor/lib0/prng/Xorshift32.js',
    './js/vendor/lib0/promise.js',
    './js/vendor/lib0/random.js',
    './js/vendor/lib0/schema.js',
    './js/vendor/lib0/set.js',
    './js/vendor/lib0/storage.js',
    './js/vendor/lib0/string.js',
    './js/vendor/lib0/symbol.js',
    './js/vendor/lib0/time.js',
    './js/vendor/lib0/trait/equality.js',
    './js/vendor/lib0/webcrypto.js',
    './js/vendor/y-indexeddb/y-indexeddb.js',
    './js/vendor/y-protocols/awareness.js',
    './js/vendor/y-protocols/sync.js',
    './js/vendor/yjs/yjs.mjs',
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
            const cached = await cache.match(event.request, { ignoreSearch: true });
            if (cached) return cached;

            if (event.request.mode === 'navigate') {
                const fallback = await cache.match('./tools.html');
                if (fallback) return fallback;
            }
            throw err;
        }
    })());
});
