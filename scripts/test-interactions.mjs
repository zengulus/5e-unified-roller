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

async function withPage(name, run, contextOptions = {}) {
    const context = await browser.newContext(contextOptions);
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

    await withPage('VTT desktop shell workflow', async (page) => {
        await page.goto(`${base}/vtt.html`);
        assert.equal(await page.locator('.vtt-mobile-unsupported').isHidden(), true);
        assert.equal(await page.evaluate(() => matchMedia('(any-hover: hover) and (any-pointer: fine)').matches), true);
        assert.equal(await page.evaluate(() => {
            const hit = document.elementFromPoint(100, 200);
            return !!(hit && hit.closest('#vtt-stage'));
        }), true, 'closed VTT drawers must not intercept map input');

        const menuTab = page.locator('#vtt-topbar-tab');
        assert.equal(await menuTab.isVisible(), true);
        assert.equal(await page.locator('body').getAttribute('data-topbar-collapsed'), '1');
        await menuTab.click();
        assert.equal(await page.locator('body').getAttribute('data-topbar-collapsed'), '0');
        await menuTab.click();
        assert.equal(await page.locator('body').getAttribute('data-topbar-collapsed'), '1');
        assert.equal(await page.locator('#accent-picker-input').getAttribute('tabindex'), '-1');

        await page.locator('#vtt-player-rolls-btn').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'player-rolls');
        assert.equal(await page.locator('#vtt-player-roll-panel').isVisible(), true);
        await page.locator('#vtt-player-roll-rail-tab').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '');

        const stageBox = await page.locator('#vtt-stage').boundingBox();
        assert.ok(stageBox, 'VTT stage must have a pointer target');
        const stagePoint = {
            x: Math.round(stageBox.x + stageBox.width * 0.55),
            y: Math.round(stageBox.y + stageBox.height * 0.55)
        };
        const transformBeforeWheel = await page.locator('#vtt-map-world').getAttribute('style');
        await page.mouse.move(stagePoint.x, stagePoint.y);
        await page.mouse.wheel(0, -180);
        await page.waitForTimeout(50);
        assert.notEqual(await page.locator('#vtt-map-world').getAttribute('style'), transformBeforeWheel, 'wheel input must update the stage transform');
        await page.locator('#vtt-stage').focus();
        await page.keyboard.press('Shift+F10');
        assert.equal(await page.locator('#vtt-stage-context-menu').isVisible(), true, 'keyboard context-menu input must open stage actions');
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#vtt-stage-context-menu')), true, 'keyboard context actions must receive focus');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'vtt-stage', 'closing keyboard context actions must restore stage focus');
        await page.mouse.click(stagePoint.x, stagePoint.y, { button: 'right' });
        assert.equal(await page.locator('#vtt-stage-context-menu').isVisible(), true, 'right click must open the stage context menu');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#vtt-stage-context-menu').isHidden(), true, 'Escape must close the stage context menu');
    });

    await withPage('VTT mobile support notice', async (page) => {
        await page.goto(`${base}/vtt.html`);
        const notice = page.locator('.vtt-mobile-unsupported');
        assert.equal(await notice.isVisible(), true);
        assert.match(await notice.innerText(), /not supported on mobile/i);
        assert.equal(await page.locator('#vtt-stage').isHidden(), true);
        await page.setViewportSize({ width: 932, height: 430 });
        assert.equal(await notice.isVisible(), true);
        assert.equal(await page.locator('#vtt-stage').isHidden(), true);
    }, {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    });

    await withPage('VTT DM password workflow', async (page) => {
        await page.goto(`${base}/vtt.html`);
        await page.locator('[data-vtt-master-menu-toggle]:visible').click();
        await page.locator('#vtt-role-toggle').click();
        assert.equal(await page.locator('#vtt-dm-unlock-modal').isVisible(), true);
        await page.locator('#vtt-dm-unlock-input').fill('wrong');
        await page.locator('#vtt-dm-unlock-form').evaluate((form) => form.requestSubmit());
        assert.equal(await page.locator('#vtt-dm-unlock-error').isVisible(), true);
        await page.locator('#vtt-dm-unlock-input').fill('setDMMode');
        await page.locator('#vtt-dm-unlock-form').evaluate((form) => form.requestSubmit());
        assert.equal(await page.locator('#vtt-dm-unlock-modal').isHidden(), true);
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');

        await page.locator('#vtt-dm-dock [data-action="open-quick-spawn"]').click();
        await page.locator('#vtt-quick-spawn-menu [data-action="quick-spawn-custom"]').click();
        const spawnedToken = page.locator('.vtt-token').first();
        const tokenBox = await spawnedToken.boundingBox();
        assert.ok(tokenBox, 'spawned token must have a drag target');
        const tokenPositionBeforeJitter = await page.evaluate(() => {
            const token = window.RTF_STORE.getVTTState().scenes[0].tokens[0];
            return [token.x, token.y];
        });
        const tokenCenter = {
            x: tokenBox.x + tokenBox.width / 2,
            y: tokenBox.y + tokenBox.height / 2
        };
        await page.mouse.move(tokenCenter.x, tokenCenter.y);
        await page.mouse.down();
        await page.mouse.move(tokenCenter.x + 2, tokenCenter.y + 2);
        await page.mouse.up();
        assert.deepEqual(await page.evaluate(() => {
            const token = window.RTF_STORE.getVTTState().scenes[0].tokens[0];
            return [token.x, token.y];
        }), tokenPositionBeforeJitter, 'sub-threshold pointer jitter must not drag the token');
        await spawnedToken.click({ button: 'right' });
        assert.equal(await page.getByRole('button', { name: 'Custom roll (any dice)' }).isVisible(), true);
        assert.equal(await page.getByRole('button', { name: 'Token inspector' }).isVisible(), true);
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            const store = window.RTF_STORE;
            const state = structuredClone(store.getVTTState());
            state.scenes[0].tokens[0].sourceType = 'player';
            store.updateVTTState(state);
        });
        await page.waitForTimeout(50);
        await spawnedToken.click({ button: 'right' });
        assert.equal(await page.getByRole('button', { name: 'Roll from character sheet' }).isVisible(), true);
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            const store = window.RTF_STORE;
            const state = structuredClone(store.getVTTState());
            state.scenes[0].tokens[0].sourceType = 'monster';
            state.scenes[0].tokens[0].side = 'enemy';
            store.updateVTTState(state);
        });
        await page.waitForTimeout(50);
        await spawnedToken.click({ button: 'right' });
        assert.equal(await page.getByRole('button', { name: 'Roll stat block / NPC' }).isVisible(), true);
        await page.keyboard.press('Escape');
        await spawnedToken.dblclick();
        const inspector = page.locator('#vtt-token-inspector-popover');
        await inspector.getByText('Combat Actions', { exact: true }).click();
        assert.equal(await inspector.getByRole('button', { name: '-5 HP' }).isDisabled(), true);
        assert.equal(await inspector.getByRole('button', { name: '+5 HP' }).isDisabled(), true);
        assert.equal(await inspector.getByRole('button', { name: 'Bloodied' }).isDisabled(), true);
        assert.equal(await inspector.getByRole('button', { name: 'Full HP' }).isDisabled(), true);
        assert.deepEqual(await page.evaluate(() => {
            const token = window.RTF_STORE.getVTTState().scenes[0].tokens[0];
            return [token.hpCurrent, token.hpMax];
        }), [null, null]);

        await inspector.getByText('Stats & Size', { exact: true }).click();
        await inspector.locator('[data-token-field="hpCurrent"]').fill('8');
        await inspector.locator('[data-token-field="hpCurrent"]').press('Tab');
        assert.equal(await inspector.locator('[data-inspector-section="stats"]').getAttribute('open'), '');
        await inspector.locator('[data-token-field="hpMax"]').fill('10');
        await inspector.locator('[data-token-field="hpMax"]').press('Tab');
        assert.equal(await inspector.locator('[data-inspector-section="stats"]').getAttribute('open'), '');
        await inspector.getByRole('button', { name: '-5 HP' }).click();
        assert.equal(await page.evaluate(() => window.RTF_STORE.getVTTState().scenes[0].tokens[0].hpCurrent), 3);
        await inspector.getByRole('button', { name: '+5 HP' }).click();
        assert.equal(await page.evaluate(() => window.RTF_STORE.getVTTState().scenes[0].tokens[0].hpCurrent), 8);
        await inspector.getByRole('button', { name: 'Bloodied' }).click();
        assert.equal(await page.evaluate(() => window.RTF_STORE.getVTTState().scenes[0].tokens[0].hpCurrent), 5);
        await inspector.getByRole('button', { name: 'Full HP' }).click();
        assert.equal(await page.evaluate(() => window.RTF_STORE.getVTTState().scenes[0].tokens[0].hpCurrent), 10);
        await inspector.getByRole('button', { name: 'Close token inspector' }).click();

        await page.locator('[data-action="create-scene"]').first().evaluate((button) => button.click());
        assert.equal(await page.locator('#vtt-scene-list [data-scene-picker="local"] option').count(), 2);
        assert.match(await page.locator('#vtt-stage-title').textContent(), /^Preview:/);
        assert.match(await page.locator('#vtt-stage-meta').textContent(), /Players see/);
        assert.equal(await page.locator('.vtt-scene-summary-eyebrow').textContent(), 'DM Preview');
        assert.equal(
            await page.locator('.vtt-scene-summary-title').textContent(),
            (await page.locator('#vtt-stage-title').textContent()).replace(/^Preview:\s*/, '')
        );

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
        await page.locator('#vtt-initiative-list .vtt-entry').first().focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(25);
        assert.equal(await page.locator('#vtt-initiative-list .vtt-entry').first().getAttribute('tabindex'), '0');
        assert.match(await page.locator('#vtt-initiative-list .vtt-entry').first().getAttribute('class'), /is-selected/);
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

        const sourceStageTitle = await page.locator('#vtt-stage-title').textContent();
        await page.evaluate(() => {
            const store = window.RTF_STORE;
            store.getSyncConfig = () => ({
                enabled: true,
                supabaseUrl: 'https://forced-preflight-failure.invalid',
                anonKey: 'test-key',
                campaignId: 'test-campaign'
            });
            store.loadVTTRoomSnapshot = async () => ({
                ok: false,
                error: 'Forced VTT preflight failure'
            });
        });
        await page.locator('[data-case-picker="active"]').evaluate((select, caseId) => {
            select.value = caseId;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, secondCaseId);
        await page.waitForFunction((caseId) => (
            window.RTF_STORE.getActiveCaseId() === caseId
            && document.querySelector('[data-case-picker="active"]')?.value === caseId
        ), primaryCaseId);
        assert.equal(await page.locator('#vtt-stage-title').textContent(), sourceStageTitle);
        assert.match(await page.locator('#vtt-sync-chip').getAttribute('aria-label'), /Forced VTT preflight failure/);
    });
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}

console.log('Interaction workflows passed: 6');
