(function (global) {
    'use strict';

    const RELAY_ENDPOINT_PATH = '/api/discord';
    const MAX_ACCESS_TOKEN_LENGTH = 8192;
    const MAX_WEBHOOK_URL_LENGTH = 8192;
    const MAX_PROXY_BODY_BYTES = 16 * 1024;
    const MAX_EMBEDS = 10;
    const MAX_EMBED_TOTAL_CHARS = 6000;
    const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
    const DISCORD_WEBHOOK_HOSTS = new Set([
        'discord.com',
        'discordapp.com',
        'canary.discord.com',
        'ptb.discord.com'
    ]);

    const isRecord = (value) => !!value
        && typeof value === 'object'
        && !Array.isArray(value);

    const cleanText = (value, maxLength) => {
        if (typeof value !== 'string') return '';
        return value.replace(CONTROL_CHARACTERS, '').slice(0, maxLength);
    };

    const sanitizeEmbed = (source) => {
        if (!isRecord(source)) return null;
        const out = {};
        const title = cleanText(source.title, 256);
        const description = cleanText(source.description, 4096);
        if (title) out.title = title;
        if (description) out.description = description;

        const color = Number(source.color);
        if (Number.isFinite(color)) {
            out.color = Math.max(0, Math.min(0xFFFFFF, Math.trunc(color)));
        }

        if (isRecord(source.author)) {
            const name = cleanText(source.author.name, 256);
            if (name) {
                out.author = { name };
            }
        }

        if (isRecord(source.footer)) {
            const text = cleanText(source.footer.text, 2048);
            if (text) {
                out.footer = { text };
            }
        }

        return Object.keys(out).length ? out : null;
    };

    const sanitizePayload = (source) => {
        if (!isRecord(source)) {
            throw new TypeError('Discord proxy payload must be an object.');
        }

        const out = {};
        const content = cleanText(source.content, 2000);
        if (content.trim()) out.content = content;

        if (Array.isArray(source.embeds)) {
            const embeds = source.embeds
                .slice(0, MAX_EMBEDS)
                .map(sanitizeEmbed)
                .filter(Boolean);
            if (embeds.length) out.embeds = embeds;
        }

        const embedCharacters = (out.embeds || []).reduce((total, embed) => (
            total
            + (embed.author && embed.author.name ? embed.author.name.length : 0)
            + (embed.title ? embed.title.length : 0)
            + (embed.description ? embed.description.length : 0)
            + (embed.footer && embed.footer.text ? embed.footer.text.length : 0)
        ), 0);
        if (embedCharacters > MAX_EMBED_TOTAL_CHARS) {
            throw new RangeError('Discord proxy embeds are too large.');
        }

        if (!out.content && !out.embeds) {
            throw new TypeError('Discord proxy payload must include message content or an embed.');
        }
        return out;
    };

    // The relay remains the only code that contacts Discord. This check keeps
    // accidental non-Discord URLs out of the request before they reach it; the
    // relay repeats the validation because browser-side checks are not a trust
    // boundary.
    const normalizeDiscordWebhookUrl = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw || raw.length > MAX_WEBHOOK_URL_LENGTH) return '';

        try {
            const webhook = new URL(raw);
            if (webhook.protocol !== 'https:'
                || !DISCORD_WEBHOOK_HOSTS.has(webhook.hostname)
                || webhook.port
                || webhook.username
                || webhook.password
                || !/^\/api\/webhooks\/[^/]+\/[^/]+\/?$/i.test(webhook.pathname)) {
                return '';
            }
            webhook.search = '';
            webhook.hash = '';
            return webhook.toString();
        } catch (err) {
            return '';
        }
    };

    const getProxyEndpoint = () => {
        const store = global.RTF_STORE;
        if (!store || typeof store.getSyncConfig !== 'function') return '';

        let config;
        try {
            config = store.getSyncConfig();
        } catch (err) {
            return '';
        }
        const relayUrl = config && typeof config.collabRelayUrl === 'string'
            ? config.collabRelayUrl.trim()
            : '';
        if (!relayUrl) return '';

        try {
            const relay = new URL(relayUrl, global.location && global.location.href ? global.location.href : undefined);
            if (relay.protocol === 'wss:') relay.protocol = 'https:';
            if (relay.protocol !== 'https:' || !relay.hostname || relay.username || relay.password) return '';
            relay.pathname = RELAY_ENDPOINT_PATH;
            relay.search = '';
            relay.hash = '';
            return relay.toString();
        } catch (err) {
            return '';
        }
    };

    const getAccessToken = async () => {
        const store = global.RTF_STORE;
        if (!store || typeof store.getDiscordProxyAccessToken !== 'function') {
            throw new Error('Discord proxy authorization is unavailable.');
        }
        const token = await store.getDiscordProxyAccessToken();
        const clean = typeof token === 'string' ? token.trim() : '';
        if (!clean || clean.length > MAX_ACCESS_TOKEN_LENGTH || /[\r\n]/.test(clean)) {
            throw new Error('Discord proxy access token is unavailable.');
        }
        return clean;
    };

    const isConfigured = () => !!getProxyEndpoint();

    const getByteLength = (value) => {
        if (typeof global.TextEncoder === 'function') {
            return new global.TextEncoder().encode(value).byteLength;
        }
        return value.length;
    };

    const post = async (webhook, payload) => {
        const normalizedWebhook = normalizeDiscordWebhookUrl(webhook);
        if (!normalizedWebhook) {
            throw new Error('Discord proxy requires a valid HTTPS Discord webhook URL.');
        }
        const endpoint = getProxyEndpoint();
        if (!endpoint) {
            throw new Error('Discord proxy requires an HTTPS Collab Relay URL.');
        }
        if (typeof global.fetch !== 'function') {
            throw new Error('Discord proxy cannot send messages in this browser.');
        }

        const sanitizedPayload = sanitizePayload(payload);
        const body = JSON.stringify({ webhook: normalizedWebhook, payload: sanitizedPayload });
        if (getByteLength(body) > MAX_PROXY_BODY_BYTES) {
            throw new RangeError('Discord proxy payload is too large.');
        }
        const token = await getAccessToken();
        const response = await global.fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
        if (!response || !response.ok) {
            const status = Number(response && response.status || 0);
            throw new Error(status
                ? `Discord relay request failed (${status}).`
                : 'Discord relay request failed.');
        }
        return response;
    };

    global.RTF_DISCORD_PROXY = Object.freeze({
        isConfigured,
        post
    });
})(typeof window !== 'undefined' ? window : globalThis);
