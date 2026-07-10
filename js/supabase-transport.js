(function (global) {
    'use strict';

    const CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const clients = new Map();
    let libraryPromise = null;

    function clientOptions() {
        return { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } };
    }

    function getClient(supabaseLib, supabaseUrl, anonKey) {
        if (!supabaseLib || typeof supabaseLib.createClient !== 'function') throw new TypeError('Supabase library is unavailable.');
        const key = `${supabaseUrl}|${anonKey}`;
        if (!clients.has(key)) clients.set(key, supabaseLib.createClient(supabaseUrl, anonKey, clientOptions()));
        return clients.get(key);
    }

    function loadLibrary() {
        if (global.supabase && typeof global.supabase.createClient === 'function') return Promise.resolve(global.supabase);
        if (libraryPromise) return libraryPromise;
        libraryPromise = new Promise((resolve, reject) => {
            if (!global.document || !document.head) {
                reject(new Error('Document context unavailable.'));
                return;
            }
            const onReady = () => {
                if (global.supabase && typeof global.supabase.createClient === 'function') resolve(global.supabase);
                else reject(new Error('Supabase client library not available after load.'));
            };
            const existing = document.querySelector('script[data-rtf-supabase="1"]');
            if (existing) {
                existing.addEventListener('load', onReady, { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load Supabase library.')), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = CDN_URL;
            script.async = true;
            script.dataset.rtfSupabase = '1';
            script.onload = onReady;
            script.onerror = () => reject(new Error('Failed to load Supabase library.'));
            document.head.appendChild(script);
        }).catch((error) => {
            libraryPromise = null;
            throw error;
        });
        return libraryPromise;
    }

    global.RTF_SUPABASE_TRANSPORT = Object.freeze({ loadLibrary, getClient });
}(window));
