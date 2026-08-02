const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/discord-webhook.js'), 'utf8');

const loadSender = ({
    document = null,
    setTimeoutImpl = () => 0
} = {}) => {
    const window = {
        document,
        setTimeout: setTimeoutImpl
    };
    vm.runInNewContext(source, { window, URL }, { filename: 'discord-webhook.js' });
    return window.RTF_DISCORD_WEBHOOK;
};

const createFakeDocument = () => {
    const created = [];
    const body = {
        children: [],
        append(...nodes) {
            nodes.forEach((node) => {
                node.parentNode = body;
                body.children.push(node);
            });
        }
    };
    const createElement = (tagName) => {
        const node = {
            tagName: String(tagName || '').toUpperCase(),
            attributes: new Map(),
            children: [],
            hidden: false,
            parentNode: null,
            srcdoc: '',
            append(...children) {
                children.forEach((child) => {
                    child.parentNode = node;
                    node.children.push(child);
                });
            },
            setAttribute(name, value) {
                node.attributes.set(name, String(value));
            },
            remove() {
                if (!node.parentNode) return;
                const index = node.parentNode.children.indexOf(node);
                if (index >= 0) node.parentNode.children.splice(index, 1);
                node.parentNode = null;
            }
        };
        created.push(node);
        return node;
    };
    return { body, createElement, created };
};

test('Discord webhook sender submits a cross-origin multipart form without fetch', async () => {
    const document = createFakeDocument();
    const scheduled = [];
    const sender = loadSender({
        document,
        setTimeoutImpl: (callback, delay) => {
            scheduled.push({ callback, delay });
            return scheduled.length;
        }
    });

    const result = await sender.post(' https://discord.com/api/webhooks/123/token ', {
        content: 'Initiative starts now.',
        embeds: [{ title: 'Round one' }]
    });

    assert.equal(result.queued, true);
    assert.equal(result.verified, false);
    const [frame] = document.body.children;
    assert.equal(frame.tagName, 'IFRAME');
    assert.match(frame.name, /^rtf-discord-webhook-/);
    assert.match(frame.srcdoc, /<meta name="referrer" content="no-referrer">/);
    assert.match(frame.srcdoc, /<form method="post" action="https:\/\/discord\.com\/api\/webhooks\/123\/token" enctype="multipart\/form-data">/);
    assert.match(frame.srcdoc, /<input type="hidden" name="payload_json"/);
    assert.match(frame.srcdoc, /<\/form><script>document\.forms\[0\]\.submit\(\)<\/script>$/);
    const payloadJSON = JSON.stringify({
        content: 'Initiative starts now.',
        embeds: [{ title: 'Round one' }]
    });
    assert.ok(frame.srcdoc.includes(`value="${payloadJSON.replace(/"/g, '&quot;')}"`));
    assert.deepEqual(scheduled.map((entry) => entry.delay), [30000]);

    scheduled[0].callback();
    assert.equal(document.body.children.length, 0);
});

test('Discord webhook sender surfaces setup failures', async () => {
    const sender = loadSender();

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
        /unavailable in this browser/
    );
});

test('Discord webhook sender escapes payload text before placing it in iframe markup', async () => {
    const document = createFakeDocument();
    const sender = loadSender({ document });
    const content = '</script><script>window.webhookPayloadWasInjected = true</script>';

    await sender.post('https://discord.com/api/webhooks/123/token', { content });

    const markup = document.body.children[0].srcdoc;
    assert.equal(markup.includes(content), false);
    assert.ok(markup.includes('&lt;/script&gt;&lt;script&gt;window.webhookPayloadWasInjected = true&lt;/script&gt;'));
});

test('Discord webhook sender rejects non-Discord destinations and strips URL extras', async () => {
    const document = createFakeDocument();
    const sender = loadSender({ document });

    for (const url of [
        'http://discord.com/api/webhooks/123/token',
        'https://discord.com.evil.example/api/webhooks/123/token',
        'https://discord.com/api/webhooks/123',
        'https://user:pass@discord.com/api/webhooks/123/token',
        'https://example.test/api/webhooks/123/token'
    ]) {
        await assert.rejects(sender.post(url, { content: 'hello' }), /webhook URL is invalid/);
    }
    assert.equal(document.body.children.length, 0);

    await sender.post('https://ptb.discord.com/api/webhooks/123/token?wait=true#ignored', { content: 'hello' });
    assert.match(document.body.children[0].srcdoc, /action="https:\/\/ptb\.discord\.com\/api\/webhooks\/123\/token"/);
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
