(function (global) {
    'use strict';

    const DISCORD_WEBHOOK_HOSTS = new Set([
        'discord.com',
        'discordapp.com',
        'canary.discord.com',
        'ptb.discord.com'
    ]);
    const FORM_ID = 'rtf-discord-webhook-form';
    let submissionSequence = 0;

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

    const escapeHTMLAttribute = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[character]));

    const submitPayloadForm = (url, payloadJSON) => {
        const document = global.document;
        if (!document || !document.body || typeof document.createElement !== 'function') {
            throw new Error('Discord webhook sending is unavailable in this browser.');
        }

        // A normal form navigation is not a CORS fetch. Keep it inside a
        // no-referrer srcdoc frame so the VTT URL is not sent to Discord.
        const targetName = `rtf-discord-webhook-${Date.now()}-${++submissionSequence}`;
        const frame = document.createElement('iframe');
        if (!('srcdoc' in frame)) {
            throw new Error('Discord webhook sending is unavailable in this browser.');
        }
        frame.name = targetName;
        frame.hidden = true;
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        let submitted = false;
        frame.onload = () => {
            if (submitted) return;
            const form = frame.contentDocument && frame.contentDocument.getElementById(FORM_ID);
            if (!form || typeof form.submit !== 'function') return;
            submitted = true;
            frame.onload = null;
            form.submit();
        };
        frame.srcdoc = [
            '<!doctype html><meta name="referrer" content="no-referrer">',
            `<form id="${FORM_ID}" method="post" action="${escapeHTMLAttribute(url)}" enctype="multipart/form-data">`,
            `<input type="hidden" name="payload_json" value="${escapeHTMLAttribute(payloadJSON)}">`,
            '</form>'
        ].join('');

        try {
            document.body.append(frame);
        } catch (error) {
            frame.remove();
            throw error;
        }

        // Leave the request target alive long enough for the nested form to
        // begin its navigation, then reclaim the inert DOM node.
        if (typeof global.setTimeout === 'function') {
            global.setTimeout(() => {
                frame.onload = null;
                frame.remove();
            }, 30000);
        }
    };

    // Discord accepts multipart requests with the JSON message in payload_json.
    // A form navigation avoids Firefox's cross-site fetch path entirely. Its
    // response is intentionally not exposed, so this remains best-effort.
    const post = async (webhook, payload) => {
        const url = normalizeDiscordWebhookUrl(webhook);
        if (!url) throw new Error('Discord webhook URL is invalid.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new TypeError('Discord webhook payload must be an object.');
        }
        const payloadJSON = JSON.stringify(payload);
        submitPayloadForm(url, payloadJSON);
        return Object.freeze({ queued: true, verified: false });
    };

    global.RTF_DISCORD_WEBHOOK = Object.freeze({ post });
})(typeof window !== 'undefined' ? window : globalThis);
