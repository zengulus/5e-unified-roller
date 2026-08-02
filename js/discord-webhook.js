(function (global) {
    'use strict';

    const DISCORD_WEBHOOK_HOSTS = new Set([
        'discord.com',
        'discordapp.com',
        'canary.discord.com',
        'ptb.discord.com'
    ]);

    const normalizeDiscordWebhookUrl = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return '';

        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:'
                || !DISCORD_WEBHOOK_HOSTS.has(url.hostname)
                || url.port
                || url.username
                || url.password
                || !/^\/api\/webhooks\/[^/]+\/[^/]+\/?$/i.test(url.pathname)) {
                return '';
            }
            url.search = '';
            url.hash = '';
            return url.toString();
        } catch (error) {
            return '';
        }
    };

    // Discord accepts multipart requests with the JSON message in payload_json.
    // FormData keeps this a CORS-safelisted request, so browsers can submit it
    // directly without a relay. The opaque response cannot be inspected.
    const post = async (webhook, payload) => {
        const url = normalizeDiscordWebhookUrl(webhook);
        if (!url) throw new Error('Discord webhook URL is invalid.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new TypeError('Discord webhook payload must be an object.');
        }
        if (typeof global.FormData !== 'function') {
            throw new Error('Discord webhook sending is unavailable in this browser.');
        }
        if (typeof global.fetch !== 'function') {
            throw new Error('Discord webhook sending is unavailable in this browser.');
        }

        const body = new global.FormData();
        body.append('payload_json', JSON.stringify(payload));

        await global.fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });

        // no-cors responses are opaque, so resolving only confirms that the
        // browser submitted the request; Discord's HTTP status is unavailable.
        return Object.freeze({ queued: true, verified: false });
    };

    global.RTF_DISCORD_WEBHOOK = Object.freeze({ post });
})(typeof window !== 'undefined' ? window : globalThis);
