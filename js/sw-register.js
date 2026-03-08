(function () {
    'use strict';

    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const protocol = String(window.location && window.location.protocol ? window.location.protocol : '');
    if (protocol !== 'https:' && protocol !== 'http:') return;

    let hasReloadedForUpdate = false;
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadControllerAtLoad || hasReloadedForUpdate) return;
        hasReloadedForUpdate = true;
        window.location.reload();
    });

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js', {
                updateViaCache: 'none'
            });

            const updateRegistration = () => registration.update().catch((err) => {
                console.warn('Service worker update check failed:', err);
            });

            updateRegistration();

            window.addEventListener('focus', updateRegistration);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') updateRegistration();
            });
        } catch (err) {
            console.warn('Service worker registration failed:', err);
        }
    });
})();
