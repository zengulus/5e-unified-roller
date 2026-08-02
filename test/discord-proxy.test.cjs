const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/discord-proxy.js'), 'utf8');

const loadProxy = ({
    relayUrl = 'wss://relay.example.test/live?room=campaign-one',
    token = 'session-access-token',
    fetchImpl = async () => ({ ok: true, status: 204 })
} = {}) => {
    const store = {
        getSyncConfig: () => ({ collabRelayUrl: relayUrl }),
        getDiscordProxyAccessToken: async () => token
    };
    const window = {
        RTF_STORE: store,
        TextEncoder,
        fetch: fetchImpl,
        location: { href: 'https://app.example.test/vtt.html' }
    };
    vm.runInNewContext(source, { window, URL, Set }, { filename: 'discord-proxy.js' });
    return { proxy: window.RTF_DISCORD_PROXY, store };
};

test('Discord proxy derives its HTTPS endpoint from the configured WSS relay and forwards the validated webhook only to the relay', async () => {
    const calls = [];
    const { proxy } = loadProxy({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 204 };
        }
    });

    assert.equal(proxy.isConfigured(), true);
    const response = await proxy.post('https://discord.com/api/webhooks/1234567890/discord-token', {
        content: '  Initiative starts now.  ',
        embeds: [{
            author: { name: 'GM' },
            title: 'Round one',
            description: 'Roll initiative.',
            color: 0x4ecdc4,
            footer: { text: 'Player: Teysa' }
        }]
    });

    assert.equal(response.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://relay.example.test/api/discord');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer session-access-token');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        webhook: 'https://discord.com/api/webhooks/1234567890/discord-token',
        payload: {
            content: '  Initiative starts now.  ',
            embeds: [{
                author: { name: 'GM' },
                title: 'Round one',
                description: 'Roll initiative.',
                color: 0x4ecdc4,
                footer: { text: 'Player: Teysa' }
            }]
        }
    });
});

test('Discord proxy only treats secure relay URLs as configured', async () => {
    const { proxy } = loadProxy({ relayUrl: 'ws://localhost:10000' });

    assert.equal(proxy.isConfigured(), false);
    await assert.rejects(
        proxy.post('https://discord.com/api/webhooks/123/token', { content: 'hello' }),
        /HTTPS Collab Relay URL/
    );
});

test('Discord proxy requires a store access token and surfaces failed relay responses', async () => {
    let fetchCalls = 0;
    const noToken = loadProxy({
        token: '',
        fetchImpl: async () => {
            fetchCalls += 1;
            return { ok: true, status: 204 };
        }
    });
    await assert.rejects(
        noToken.proxy.post('https://discord.com/api/webhooks/123/token', { content: 'hello' }),
        /access token is unavailable/
    );
    assert.equal(fetchCalls, 0);

    const failed = loadProxy({
        fetchImpl: async () => ({ ok: false, status: 429 })
    });
    await assert.rejects(
        failed.proxy.post('https://discord.com/api/webhooks/123/token', { content: 'hello' }),
        /failed \(429\)/
    );
});

test('Discord proxy sanitizes disallowed payload shapes before sending', async () => {
    const calls = [];
    const { proxy } = loadProxy({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 204 };
        }
    });

    await assert.rejects(proxy.post('https://discord.com/api/webhooks/123/token', {}), /content or an embed/);
    await proxy.post('https://discord.com/api/webhooks/123/token', {
        content: 'ok\u0000',
        destination: 'https://elsewhere.example.test',
        allowed_mentions: { parse: ['everyone'] },
        tts: true,
        embeds: [{
            title: 'valid',
            description: 42,
            color: 0x1000000,
            url: 'https://elsewhere.example.test/embedded',
            image: { url: 'https://elsewhere.example.test/image.png' },
            thumbnail: { url: 'https://elsewhere.example.test/thumb.png' },
            fields: [{ name: 'field', value: 'value', inline: true }],
            author: {
                name: 'GM',
                url: 'https://elsewhere.example.test/author',
                icon_url: 'https://elsewhere.example.test/author.png'
            },
            footer: {
                text: 'Player: Teysa',
                icon_url: 'https://elsewhere.example.test/footer.png'
            }
        }]
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        webhook: 'https://discord.com/api/webhooks/123/token',
        payload: {
            content: 'ok',
            embeds: [{
                title: 'valid',
                color: 0xffffff,
                author: { name: 'GM' },
                footer: { text: 'Player: Teysa' }
            }]
        }
    });
});

test('Discord proxy rejects invalid webhook destinations before contacting the relay', async () => {
    let fetchCalls = 0;
    const { proxy } = loadProxy({
        fetchImpl: async () => {
            fetchCalls += 1;
            return { ok: true, status: 204 };
        }
    });

    for (const webhook of [
        '',
        'http://discord.com/api/webhooks/123/token',
        'https://discord.com.evil.example/api/webhooks/123/token',
        'https://discord.com:8443/api/webhooks/123/token',
        'https://discord.com/api/webhooks/123',
        'https://user:pass@discord.com/api/webhooks/123/token',
        'https://example.test/api/webhooks/123/token'
    ]) {
        await assert.rejects(
            proxy.post(webhook, { content: 'hello' }),
            /valid HTTPS Discord webhook URL/
        );
    }
    assert.equal(fetchCalls, 0);
});

test('Discord proxy strips webhook query and fragment values before forwarding', async () => {
    const calls = [];
    const { proxy } = loadProxy({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 204 };
        }
    });

    await proxy.post(
        'https://canary.discord.com/api/webhooks/123/token?wait=true#fragment',
        { content: 'hello' }
    );

    assert.equal(JSON.parse(calls[0].options.body).webhook,
        'https://canary.discord.com/api/webhooks/123/token');
});
