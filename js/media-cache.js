(function (global) {
    const STORAGE_KEY = 'rtf-failed-media-v1';
    const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;
    const failures = new Map();

    function normalizeUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            return new URL(raw, global.location && global.location.href ? global.location.href : undefined).toString();
        } catch (err) {
            return '';
        }
    }

    function loadFailures() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            Object.entries(parsed).forEach(([url, stamp]) => {
                if (!url) return;
                const failedAt = Number(stamp || 0);
                if (!Number.isFinite(failedAt)) return;
                if ((Date.now() - failedAt) > FAILURE_TTL_MS) return;
                failures.set(url, failedAt);
            });
        } catch (err) {
        }
    }

    function persistFailures() {
        try {
            const payload = {};
            failures.forEach((failedAt, url) => {
                if ((Date.now() - failedAt) <= FAILURE_TTL_MS) payload[url] = failedAt;
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
        }
    }

    function pruneFailures() {
        let changed = false;
        failures.forEach((failedAt, url) => {
            if ((Date.now() - failedAt) > FAILURE_TTL_MS) {
                failures.delete(url);
                changed = true;
            }
        });
        if (changed) persistFailures();
    }

    function rememberFailure(value) {
        const url = normalizeUrl(value);
        if (!url) return false;
        failures.set(url, Date.now());
        persistFailures();
        return true;
    }

    function rememberSuccess(value) {
        const url = normalizeUrl(value);
        if (!url || !failures.has(url)) return false;
        failures.delete(url);
        persistFailures();
        return true;
    }

    function shouldAttempt(value) {
        pruneFailures();
        const url = normalizeUrl(value);
        if (!url) return false;
        return !failures.has(url);
    }

    function getUsableUrl(value) {
        const url = normalizeUrl(value);
        if (!url) return '';
        return shouldAttempt(url) ? url : '';
    }

    document.addEventListener('error', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        rememberFailure(target.currentSrc || target.src || '');
    }, true);

    document.addEventListener('load', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        rememberSuccess(target.currentSrc || target.src || '');
    }, true);

    loadFailures();
    pruneFailures();

    global.RTF_MEDIA_CACHE = {
        getUsableUrl,
        rememberFailure,
        rememberSuccess,
        shouldAttempt
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
