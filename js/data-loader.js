(function (global) {
    const CACHE_VERSION = '20260408a';
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CACHE_KEY_PREFIX = 'rtf-preload-cache-v1:';
    const SCRIPT_LOADS = new Map();
    const DATASETS = Object.freeze({
        npcs: {
            globalKey: 'PRELOADED_NPCS',
            scriptPath: 'js/data-npcs.js'
        },
        locations: {
            globalKey: 'PRELOADED_LOCATIONS',
            scriptPath: 'js/data-locations.js'
        }
    });

    const now = () => Date.now();

    function getCacheKey(name) {
        return `${CACHE_KEY_PREFIX}${name}`;
    }

    function cloneData(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function readCache(name) {
        const key = getCacheKey(name);
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== CACHE_VERSION) return null;
            if (!Array.isArray(parsed.data)) return null;
            const savedAt = Number(parsed.savedAt || 0);
            if (!Number.isFinite(savedAt) || (now() - savedAt) > CACHE_TTL_MS) return null;
            return cloneData(parsed.data);
        } catch (err) {
            return null;
        }
    }

    function writeCache(name, data) {
        if (!Array.isArray(data)) return false;
        try {
            localStorage.setItem(getCacheKey(name), JSON.stringify({
                version: CACHE_VERSION,
                savedAt: now(),
                data: cloneData(data)
            }));
            return true;
        } catch (err) {
            return false;
        }
    }

    function applyCachedData(name) {
        const dataset = DATASETS[name];
        if (!dataset) return false;
        if (Array.isArray(global[dataset.globalKey]) && global[dataset.globalKey].length) return true;
        const cached = readCache(name);
        if (!cached) return false;
        global[dataset.globalKey] = cached;
        return true;
    }

    function hydrateCachedData() {
        Object.keys(DATASETS).forEach((name) => {
            applyCachedData(name);
        });
    }

    function loadScript(scriptPath) {
        const normalizedPath = String(scriptPath || '').trim();
        if (!normalizedPath) return Promise.reject(new Error('Missing script path.'));
        if (SCRIPT_LOADS.has(normalizedPath)) return SCRIPT_LOADS.get(normalizedPath);
        const existing = document.querySelector(`script[src="${normalizedPath}"]`);
        if (existing) {
            const resolved = Promise.resolve(existing);
            SCRIPT_LOADS.set(normalizedPath, resolved);
            return resolved;
        }
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = normalizedPath;
            script.async = true;
            script.onload = () => resolve(script);
            script.onerror = () => reject(new Error(`Failed to load ${normalizedPath}.`));
            document.head.appendChild(script);
        });
        SCRIPT_LOADS.set(normalizedPath, promise);
        return promise;
    }

    async function ensureDataset(name) {
        const dataset = DATASETS[name];
        if (!dataset) throw new Error(`Unknown dataset: ${name}`);
        if (!applyCachedData(name)) {
            await loadScript(dataset.scriptPath);
        }
        const loaded = global[dataset.globalKey];
        if (!Array.isArray(loaded)) {
            throw new Error(`Dataset ${name} did not register ${dataset.globalKey}.`);
        }
        writeCache(name, loaded);
        if (global.RTF_STORE && typeof global.RTF_STORE.applyLoadedPreloads === 'function') {
            global.RTF_STORE.applyLoadedPreloads();
        }
        return loaded;
    }

    async function ensureDatasets(names = []) {
        const requested = Array.isArray(names) ? names : [names];
        for (const name of requested) {
            await ensureDataset(name);
        }
        return requested.map((name) => {
            const dataset = DATASETS[name];
            return dataset ? cloneData(global[dataset.globalKey] || []) : [];
        });
    }

    hydrateCachedData();

    global.RTF_DATA_LOADER = {
        hydrateCachedData,
        ensureDataset,
        ensureDatasets
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
