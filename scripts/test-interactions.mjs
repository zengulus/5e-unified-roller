import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${host}`);
        const target = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/tools.html' : url.pathname)}`);
        if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Forbidden');
        const body = await readFile(target);
        res.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve); });
const base = `http://${host}:${server.address().port}`;
const browser = await chromium.launch({ headless: true, chromiumSandbox: false });

async function withPage(name, run) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
        localStorage.setItem('rtf_connect_import_bust_v1', 'connect-login-required-20260428a');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        await run(page);
        assert.deepEqual(errors, [], `${name} emitted page errors`);
        console.log(`ok   ${name}`);
    } finally {
        await context.close();
    }
}

try {
    await withPage('character save and Hit Die workflow', async (page) => {
        await page.goto(`${base}/index.html`);
        await page.locator('#charName').fill('Regression Agent');
        await page.locator('#hpCurr').fill('1');
        await page.locator('#hpMax').fill('20');
        await page.locator('#hdDie').fill('d8');
        await page.locator('#hdCurr').fill('1');
        await page.locator('#hdMax').fill('1');
        await page.locator('.btn-roll-hd').click();
        assert.equal(await page.locator('#hdCurr').inputValue(), '0');
        assert.ok(Number(await page.locator('#hpCurr').inputValue()) >= 1);
        await page.reload();
        assert.equal(await page.locator('#charName').inputValue(), 'Regression Agent');
        assert.equal(await page.locator('#hdCurr').inputValue(), '0');
    });

    await withPage('GM initiative session workflow', async (page) => {
        await page.goto(`${base}/gm.html`);
        for (const [name, initiative] of [['Agent One', '18'], ['Agent Two', '12']]) {
            await page.locator('#addName').fill(name);
            await page.locator('#addInit').fill(initiative);
            await page.locator('#addDex').fill('14');
            await page.locator('#addHP').fill('20');
            await page.getByRole('button', { name: 'Add', exact: true }).click();
        }
        await page.getByRole('button', { name: /Next Turn/ }).click();
        await page.getByRole('button', { name: /Next Turn/ }).click();
        assert.equal((await page.locator('#combatList').innerText()).includes('Agent One'), true);
        assert.equal(await page.locator('#roundVal').innerText(), '2');
        await page.reload();
        assert.match(await page.locator('#combatList').innerText(), /Agent Two/);
    });

    await withPage('roster create and search workflow', async (page) => {
        await page.goto(`${base}/roster.html`);
        await page.getByRole('button', { name: /Add NPC/ }).click();
        await page.locator('#npcName').fill('Test Informant');
        await page.locator('#npcWants').fill('A safe route');
        await page.locator('#npcSaveBtn').click();
        await page.locator('#searchFilter').fill('Test Informant');
        assert.match(await page.locator('#npcList').innerText(), /Test Informant/);
    });

    await withPage('VTT DM password workflow', async (page) => {
        await page.goto(`${base}/vtt.html`);
        await page.locator('#vtt-role-toggle').click({ force: true });
        assert.equal(await page.locator('#vtt-dm-unlock-modal').isVisible(), true);
        await page.locator('#vtt-dm-unlock-input').fill('wrong');
        await page.locator('#vtt-dm-unlock-form').evaluate((form) => form.requestSubmit());
        assert.equal(await page.locator('#vtt-dm-unlock-error').isVisible(), true);
        await page.locator('#vtt-dm-unlock-input').fill('setDMMode');
        await page.locator('#vtt-dm-unlock-form').evaluate((form) => form.requestSubmit());
        assert.equal(await page.locator('#vtt-dm-unlock-modal').isHidden(), true);
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');

        await page.locator('[data-action="create-scene"]').first().evaluate((button) => button.click());
        assert.equal(await page.locator('#vtt-scene-list [data-scene-picker="local"] option').count(), 2);

        await page.locator('[data-action="open-vtt-panel"][data-panel="combat"]').first().evaluate((button) => button.click());
        await page.getByRole('button', { name: 'New Clock' }).click();
        assert.match(await page.locator('#vtt-clock-list').innerText(), /Clock 1/);

        await page.evaluate(() => {
            const store = window.RTF_STORE;
            const caseId = store.getActiveCaseId();
            const state = structuredClone(store.getVTTState(caseId));
            state.initiative = {
                round: 1,
                activeEntryId: 'init_fast',
                entries: [
                    { id: 'init_fast', name: 'Fast', total: 18, tie: 12 },
                    { id: 'init_slow', name: 'Slow', total: 10, tie: 10 }
                ]
            };
            store.updateVTTState(state, caseId);
        });
        await page.locator('#vtt-initiative-list .vtt-entry').first().click();
        await page.locator('#vtt-initiative-list [data-action="edit-entry"]').first().click();
        await page.getByRole('button', { name: 'Move Down' }).click();
        assert.deepEqual(await page.locator('#vtt-initiative-list .vtt-entry-name').allTextContents(), ['Slow', 'Fast']);
        await page.getByRole('button', { name: 'Use Reaction' }).click();
        assert.deepEqual(await page.locator('#vtt-initiative-list .vtt-entry-name').allTextContents(), ['Slow', 'Fast']);

        await page.reload();
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');
        assert.deepEqual(await page.locator('#vtt-initiative-list .vtt-entry-name').allTextContents(), ['Slow', 'Fast']);
        assert.deepEqual(await page.evaluate(() => {
            const snapshot = window.RTF_STORE.normalizeVTTStateSnapshot({
                initiative: { entries: [{ id: 'init_packet', submissionId: 'roll_packet', submittedAt: 1234 }] }
            });
            const entry = snapshot.initiative.entries[0];
            return [entry.submissionId, entry.submittedAt];
        }), ['roll_packet', 1234]);

        await page.getByRole('button', { name: 'Reset to Round 1' }).click();
        assert.equal(await page.locator('#vtt-round-pill').textContent(), 'Round 1');

        const primaryCaseId = await page.evaluate(() => window.RTF_STORE.getActiveCaseId());
        const secondCaseId = await page.evaluate(() => window.RTF_STORE.createCase('Second Case'));
        await page.waitForFunction((caseId) => document.querySelector(`#vtt-scene-list [data-active-case-id="${caseId}"]`), secondCaseId);
        assert.equal(await page.locator('#vtt-scene-list [data-scene-picker="local"] option').count(), 1);
        await page.evaluate((caseId) => window.RTF_STORE.setActiveCase(caseId), primaryCaseId);
        await page.waitForFunction((caseId) => document.querySelector(`#vtt-scene-list [data-active-case-id="${caseId}"]`), primaryCaseId);
        assert.equal(await page.locator('#vtt-scene-list [data-scene-picker="local"] option').count(), 2);
    });
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}

console.log('Interaction workflows passed: 4');
