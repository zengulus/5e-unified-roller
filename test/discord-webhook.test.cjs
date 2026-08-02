const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/discord-webhook.js'), 'utf8');

class FakeFormData {
    constructor() {
        this.entries = [];
    }

    append(name, value) {
        this.entries.push([name, value]);
    }
}

const loadSender = ({
    fetchImpl = async () => ({ ok: false, status: 0, type: 'opaque' }),
    FormDataImpl = FakeFormData
} = {}) => {
    const window = {
        fetch: fetchImpl,
        FormData: FormDataImpl
    };
    vm.runInNewContext(source, { window, URL }, { filename: 'discord-webhook.js' });
    return window.RTF_DISCORD_WEBHOOK;
};

test('Discord webhook sender uses a no-cors multipart payload request', async () => {
    const calls = [];
    const sender = loadSender({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: false, status: 0, type: 'opaque' };
        }
    });

    const result = await sender.post(' https://discord.com/api/webhooks/123/token ', {
        content: 'Initiative starts now.',
        embeds: [{ title: 'Round one' }]
    });

    assert.equal(result.queued, true);
    assert.equal(result.verified, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://discord.com/api/webhooks/123/token');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.mode, 'no-cors');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(Object.hasOwn(calls[0].options, 'headers'), false);
    assert.deepEqual(calls[0].options.body.entries, [[
        'payload_json',
        JSON.stringify({
            content: 'Initiative starts now.',
            embeds: [{ title: 'Round one' }]
        })
    ]]);
});

test('Discord webhook sender surfaces setup and network failures', async () => {
    const sender = loadSender({
        fetchImpl: async () => {
            throw new Error('offline');
        }
    });

    await assert.rejects(
        sender.post('', { content: 'hello' }),
        /webhook URL is invalid/
    );
    await assert.rejects(
        sender.post('https://discord.com/api/webhooks/123/token', null),
        /payload must be an object/
    );
    await assert.rejects(
        sender.post('https://discord.com/api/webhooks/123/token', { content: 'hello' }),
        /offline/
    );
});

test('Discord webhook sender rejects non-Discord destinations and strips URL extras', async () => {
    const calls = [];
    const sender = loadSender({
        fetchImpl: async (url) => {
            calls.push(url);
            return { ok: false, status: 0, type: 'opaque' };
        }
    });

    for (const url of [
        'http://discord.com/api/webhooks/123/token',
        'https://discord.com.evil.example/api/webhooks/123/token',
        'https://discord.com/api/webhooks/123',
        'https://user:pass@discord.com/api/webhooks/123/token',
        'https://example.test/api/webhooks/123/token'
    ]) {
        await assert.rejects(sender.post(url, { content: 'hello' }), /webhook URL is invalid/);
    }
    assert.equal(calls.length, 0);

    await sender.post('https://ptb.discord.com/api/webhooks/123/token?wait=true#ignored', { content: 'hello' });
    assert.deepEqual(calls, ['https://ptb.discord.com/api/webhooks/123/token']);
});

test('Discord-enabled pages load the shared sender before their page code', () => {
    for (const [page, script] of [
        ['index.html', 'js/index.js'],
        ['gm.html', 'js/gm.js'],
        ['vtt.html', 'js/vtt.js']
    ]) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        assert.ok(html.indexOf('js/discord-webhook.js') !== -1, `${page} loads the webhook sender`);
        assert.ok(
            html.indexOf('js/discord-webhook.js') < html.indexOf(script),
            `${page} loads the webhook sender before ${script}`
        );
    }
});
