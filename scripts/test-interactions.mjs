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
    const filter = String(process.env.TEST_FILTER || '').trim().toLowerCase();
    if (filter && !name.toLowerCase().includes(filter)) return;
    const context = await browser.newContext(contextOptions);
    await context.addInitScript(() => {
        localStorage.setItem('rtf_connect_import_bust_v1', 'connect-login-required-20260428a');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
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
        await page.locator('#vtt-player-rolls-btn').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'the Actions launcher should toggle its panel closed');
        await page.locator('#vtt-player-rolls-btn').click();
        await page.locator('#vtt-player-measure-btn').click();
        await page.waitForTimeout(25);
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'vtt-player-measure-btn', 'outside dismissal must not steal focus from the chosen command');
        await page.locator('#vtt-player-measure-btn').click();
        await page.locator('#vtt-player-rolls-btn').click();
        await page.locator('#vtt-stage').click({ position: { x: 20, y: 180 } });
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'clicking the map should close Player Actions completely');
        await page.waitForTimeout(250);
        assert.equal(await page.locator('#vtt-player-roll-panel').isHidden(), true);
        await page.locator('#vtt-player-rolls-btn').click();
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

        await page.evaluate(() => {
            localStorage.setItem('rtf_vtt_ui_case_primary', JSON.stringify({
                activeVttPanel: 'setup',
                scenePanelCollapsed: true,
                spawnPanelCollapsed: true,
                inspectorPanelCollapsed: true
            }));
        });
        await page.reload();
        await page.waitForFunction(() => document.body?.dataset.vttRole === 'dm');
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'open panels must not persist across reloads');

        await page.setViewportSize({ width: 900, height: 800 });
        await page.locator('#vtt-dm-dock [data-panel="setup"]').click();
        await page.waitForTimeout(250);
        const narrowStageBox = await page.locator('#vtt-stage').boundingBox();
        const narrowDockButtonBoxes = await page.locator('#vtt-dm-dock .vtt-dock-btn:visible').evaluateAll((buttons) => (
            buttons.map((button) => {
                const rect = button.getBoundingClientRect();
                return { left: rect.left, right: rect.right };
            })
        ));
        assert.equal(narrowDockButtonBoxes.length > 0, true);
        assert.equal(narrowDockButtonBoxes.every((box) => box.left >= narrowStageBox.x - 1 && box.right <= narrowStageBox.x + narrowStageBox.width + 1), true, 'drawer reflow must keep every dock command reachable at narrow desktop widths');
        await page.locator('#vtt-settings-rail-tab').click();
        await page.waitForTimeout(250);
        await page.setViewportSize({ width: 1280, height: 720 });

        const closedStageWidth = (await page.locator('#vtt-stage').boundingBox()).width;
        const readStageWorldCenter = () => page.evaluate(() => {
            const stage = document.querySelector('#vtt-stage').getBoundingClientRect();
            const worldTransform = new DOMMatrix(getComputedStyle(document.querySelector('#vtt-world')).transform);
            const zoom = Math.max(0.01, Number.parseFloat(document.querySelector('#vtt-stage-zoom-reset').textContent) / 100);
            return [(stage.width / 2 - worldTransform.m41) / zoom, (stage.height / 2 - worldTransform.m42) / zoom];
        });
        const closedWorldCenter = await readStageWorldCenter();
        const scenePanelButton = page.locator('#vtt-dm-dock [data-panel="setup"]');
        await scenePanelButton.click();
        await page.waitForTimeout(50);
        await scenePanelButton.click();
        await page.waitForTimeout(300);
        const rapidToggleWorldCenter = await readStageWorldCenter();
        assert.ok(
            Math.abs(rapidToggleWorldCenter[0] - closedWorldCenter[0]) <= 1
                && Math.abs(rapidToggleWorldCenter[1] - closedWorldCenter[1]) <= 1,
            'rapid drawer toggles should preserve the original map focal point'
        );
        await scenePanelButton.click();
        await page.waitForTimeout(250);
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'setup');
        assert.equal(await page.locator('#vtt-scene-panel-body').isVisible(), true, 'legacy collapsed preferences must not hide panel bodies');
        assert.ok((await page.locator('#vtt-stage').boundingBox()).width < closedStageWidth, 'an open drawer should reserve usable map space');
        const openWorldCenter = await readStageWorldCenter();
        assert.ok(
            Math.abs(openWorldCenter[0] - closedWorldCenter[0]) <= 1 && Math.abs(openWorldCenter[1] - closedWorldCenter[1]) <= 1,
            `drawer reflow should preserve the map focal point (${closedWorldCenter.join(',')} -> ${openWorldCenter.join(',')})`
        );
        await page.locator('.vtt-drawer-tabs [data-panel="spawn"]').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'spawn');
        assert.equal(await page.locator('#vtt-spawn-panel').isVisible(), true);
        assert.equal(await page.locator('.vtt-drawer-tabs [data-panel="spawn"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-panel')), 'spawn', 'switching workspace tabs should keep focus on the chosen tab');
        await page.locator('.vtt-drawer-tabs [data-panel="inspector"]').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'inspector');
        await page.locator('#vtt-settings-rail-tab').click();
        await page.waitForTimeout(25);
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-panel')), 'setup', 'closing should restore its launcher focus');

        await page.locator('#vtt-dm-dock [data-panel="inspector"]').click();
        const rolePeer = await page.context().newPage();
        try {
            await rolePeer.goto(`${base}/vtt.html`);
            await rolePeer.evaluate(() => window.RTF_STORE.setVTTLocalRole('player', window.RTF_STORE.getActiveCaseId()));
            await page.waitForFunction(() => document.body.dataset.vttRole === 'player');
            assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'a cross-tab role change must clear an incompatible local drawer');
            await rolePeer.evaluate(() => window.RTF_STORE.setVTTLocalRole('dm', window.RTF_STORE.getActiveCaseId()));
            await page.waitForFunction(() => document.body.dataset.vttRole === 'dm');
            assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'restoring the role must not resurrect a transient drawer');
        } finally {
            await rolePeer.close();
        }

        const compactCombatOpen = page.locator('.vtt-initiative-expand');
        assert.equal(await page.locator('.vtt-combat-drawer-bar').isHidden(), true);
        await compactCombatOpen.click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'combat');
        assert.equal(await page.locator('.vtt-combat-drawer-bar').isVisible(), true);
        await page.locator('#vtt-initiative-rail-tab').click();
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('vtt-initiative-expand')), true, 'collapsing Combat should return focus to its compact Open control');

        const dmMenuButton = page.locator('#vtt-dm-dock [data-vtt-master-menu-toggle]');
        await compactCombatOpen.click();
        await dmMenuButton.click();
        await page.locator('#vtt-view-menu [data-panel="combat"]').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'combat', 'choosing an already-open panel from Menu should keep it open');
        await page.locator('#vtt-initiative-rail-tab').click();
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-vtt-master-menu-toggle')), true);

        await dmMenuButton.click();
        await page.getByRole('button', { name: 'Diagnostics' }).click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'admin');
        assert.equal(await page.locator('#vtt-admin-panel').isVisible(), true);
        await page.locator('#vtt-admin-panel .vtt-drawer-close').click();
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-vtt-master-menu-toggle')), true, 'menu-launched drawers should restore focus to the visible Menu button');

        await page.locator('#vtt-tools-menu-toggle').click();
        await page.locator('#vtt-tool-size-input').fill('6');
        assert.equal(await page.locator('#vtt-tools-menu').isVisible(), true, 'interacting with Draw controls must keep the popover open');
        await page.locator('#vtt-stage').click({ position: { x: closedStageWidth / 2, y: 180 } });
        assert.equal(await page.locator('#vtt-tools-menu').isHidden(), true, 'clicking the map should dismiss Draw controls');

        await page.locator('#vtt-dm-dock [data-panel="spawn"]').click();
        const customSpawnRow = page.locator('#vtt-player-spawn-list [data-spawn-kind="custom"]');
        const tokenCountBeforeDrag = await page.locator('.vtt-token').count();
        const customSpawnBox = await customSpawnRow.boundingBox();
        const spawnStageBox = await page.locator('#vtt-stage').boundingBox();
        await page.mouse.move(customSpawnBox.x + customSpawnBox.width / 2, customSpawnBox.y + customSpawnBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(spawnStageBox.x + spawnStageBox.width * 0.45, spawnStageBox.y + spawnStageBox.height * 0.4, { steps: 4 });
        await page.mouse.up();
        assert.equal(await page.locator('.vtt-token').count(), tokenCountBeforeDrag + 1, 'dragging an Add row onto the usable map should place one token');

        const tokenCountBeforeAddClick = await page.locator('.vtt-token').count();
        await customSpawnRow.click();
        assert.equal(await page.locator('.vtt-token').count(), tokenCountBeforeAddClick, 'a click on a draggable row must not drop behind the drawer');
        assert.equal(await page.locator('#vtt-quick-spawn-menu').isVisible(), true);
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'spawn', 'Quick Spawn should stay anchored to the open Add workspace');
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#vtt-quick-spawn-menu')), true, 'Quick Spawn should move keyboard focus into its actions');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(25);
        assert.equal(await page.locator('#vtt-quick-spawn-menu').isHidden(), true);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-spawn-kind')), 'custom', 'Escape should return focus to the Quick Spawn launcher');
        await customSpawnRow.click();
        await page.locator('#vtt-quick-spawn-menu [data-action="quick-spawn-custom"]').click();
        await page.locator('#vtt-settings-rail-tab').click();
        await page.waitForTimeout(250);
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
        await page.locator('[data-action="show-scene-everyone"]').first().evaluate((button) => button.click());
        assert.equal(await page.locator('.vtt-scene-summary-eyebrow').textContent(), 'Shared Scene');

        await page.locator('[data-action="open-vtt-panel"][data-panel="combat"]').first().evaluate((button) => button.click());
        await page.getByRole('tab', { name: 'Clocks' }).click();
        await page.getByRole('button', { name: 'New Clock' }).click();
        assert.match(await page.locator('#vtt-clock-list').innerText(), /Clock 1/);
        assert.match(await page.locator('#vtt-clock-list').innerText(), /Private draft/);
        assert.equal(await page.locator('#vtt-clock-list [data-clock-field="title"]').evaluate((input) => input === document.activeElement), true);
        const clockDescription = 'The ward breaks when this clock fills.';
        await page.locator('#vtt-clock-list [data-clock-field="note"]').fill(clockDescription);
        await page.locator('#vtt-clock-list [data-clock-field="note"]').press('Tab');
        const describedClock = page.locator('#vtt-clock-list .vtt-clock').first();
        assert.equal(await describedClock.getAttribute('title'), clockDescription);
        assert.equal(await describedClock.getAttribute('aria-describedby'), 'vtt-clock-description-0');
        await page.locator('#vtt-initiative-panel .vtt-drawer-close').click();
        assert.equal(await describedClock.locator('.vtt-clock-note').isHidden(), true);
        await describedClock.hover();
        assert.equal(await describedClock.locator('.vtt-clock-note').isVisible(), true);
        await page.locator('#vtt-initiative-panel [data-action="open-vtt-panel"]').click();
        await page.getByRole('tab', { name: 'Turns' }).click();

        await page.evaluate(() => {
            const store = window.RTF_STORE;
            const caseId = store.getActiveCaseId();
            const state = structuredClone(store.getVTTState(caseId));
            const encounterScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
            encounterScene.tokens = [
                {
                    id: 'token_turn_trigger', label: 'Warning sigil', side: 'enemy', sourceType: 'custom',
                    x: 2, y: 2, w: 1, h: 1, hidden: false,
                    triggers: [{
                        id: 'trigger_start_turn', enabled: true, trigger: 'startTurnNear', radiusCells: 4,
                        target: 'anyVisibleToken', repeat: 'always', kind: 'fiction',
                        title: 'The warning sigil flares', body: 'A start-of-turn prompt is active.'
                    }]
                },
                {
                    id: 'token_turn_target', label: 'Fast token', side: 'player', sourceType: 'player',
                    x: 3, y: 2, w: 1, h: 1, hidden: false, moveAccess: 'player'
                }
            ];
            encounterScene.clocks = [
                { id: 'clock_manual', title: 'Manual', current: 0, max: 4, hidden: false, cadence: 'manual' },
                { id: 'clock_turn', title: 'Turn cadence', current: 0, max: 4, hidden: false, cadence: 'turn' },
                { id: 'clock_round', title: 'Round cadence', current: 0, max: 4, hidden: false, cadence: 'round' }
            ];
            state.initiative = {
                round: 1,
                activeEntryId: '',
                encounterActive: false,
                sceneId: '',
                startedAt: 0,
                entries: [
                    { id: 'init_fast', name: 'Fast', total: 18, tie: 12, reactionUsed: true, linkedTokenId: 'token_turn_target' },
                    { id: 'init_slow', name: 'Slow', total: 10, tie: 10, reactionUsed: true }
                ]
            };
            store.updateVTTState(state, caseId);
        });
        assert.equal(await page.locator('#vtt-current-turn-label').textContent(), 'Encounter ready');
        await page.getByRole('button', { name: 'Start Encounter' }).click();
        assert.deepEqual(await page.evaluate(() => {
            const initiative = window.RTF_STORE.getVTTState().initiative;
            return [initiative.encounterActive, initiative.round, initiative.activeEntryId, !!initiative.sceneId];
        }), [true, 1, 'init_fast', true]);
        assert.match(await page.locator('#vtt-proximity-prompt-stack').innerText(), /The warning sigil flares/);
        await page.getByRole('button', { name: 'Next turn' }).click();
        assert.equal(await page.locator('#vtt-proximity-prompt-stack').isHidden(), true, 'an unlinked next turn should clear the previous turn prompt');
        assert.deepEqual(await page.evaluate(() => {
            const state = window.RTF_STORE.getVTTState();
            const clocks = state.scenes.find((scene) => scene.id === state.initiative.sceneId).clocks;
            return [
                state.initiative.round,
                state.initiative.activeEntryId,
                state.initiative.entries.find((entry) => entry.id === 'init_slow').reactionUsed,
                clocks.find((clock) => clock.id === 'clock_manual').current,
                clocks.find((clock) => clock.id === 'clock_turn').current,
                clocks.find((clock) => clock.id === 'clock_round').current
            ];
        }), [1, 'init_slow', false, 0, 1, 0]);
        await page.getByRole('button', { name: 'Next turn' }).click();
        assert.deepEqual(await page.evaluate(() => {
            const state = window.RTF_STORE.getVTTState();
            const clocks = state.scenes.find((scene) => scene.id === state.initiative.sceneId).clocks;
            return [
                state.initiative.round,
                state.initiative.activeEntryId,
                state.initiative.entries.find((entry) => entry.id === 'init_fast').reactionUsed,
                clocks.find((clock) => clock.id === 'clock_manual').current,
                clocks.find((clock) => clock.id === 'clock_turn').current,
                clocks.find((clock) => clock.id === 'clock_round').current
            ];
        }), [2, 'init_fast', false, 0, 2, 1]);
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
        await page.waitForFunction(() => document.body?.dataset.vttRole === 'dm');
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');
        assert.deepEqual(await page.locator('#vtt-initiative-list .vtt-entry-name').allTextContents(), ['Slow', 'Fast']);
        assert.deepEqual(await page.evaluate(() => {
            const snapshot = window.RTF_STORE.normalizeVTTStateSnapshot({
                initiative: { entries: [{ id: 'init_packet', submissionId: 'roll_packet', submittedAt: 1234 }] }
            });
            const entry = snapshot.initiative.entries[0];
            return [entry.submissionId, entry.submittedAt];
        }), ['roll_packet', 1234]);

        await page.locator('#vtt-dm-dock [data-panel="combat"]').click();
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Reset to Round 1' }).click();
        assert.equal(await page.locator('#vtt-round-pill').getAttribute('aria-label'), 'Round 1');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'End Encounter' }).click();
        assert.deepEqual(await page.evaluate(() => {
            const initiative = window.RTF_STORE.getVTTState().initiative;
            return [initiative.encounterActive, initiative.activeEntryId, initiative.sceneId, initiative.entries.length];
        }), [false, '', '', 2]);

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

        if (await page.locator('.vtt-combat-drawer-bar').isVisible()) {
            await page.locator('#vtt-initiative-rail-tab').click();
        }
        await page.evaluate(() => {
            const store = window.RTF_STORE;
            const caseId = store.getActiveCaseId();
            const state = structuredClone(store.getVTTState(caseId));
            state.initiative = {
                ...state.initiative,
                encounterActive: true,
                sceneId: state.activeSceneId,
                startedAt: Date.now(),
                activeEntryId: 'init_hidden_current',
                entries: [
                    { id: 'init_public_before', name: 'Public Before', total: 14, tie: 14 },
                    { id: 'init_hidden_current', name: 'Veiled Current', total: 13, tie: 13, hidden: true },
                    { id: 'init_hidden_between', name: 'Veiled Interruption', total: 12, tie: 12, hidden: true },
                    { id: 'init_public_next', name: 'Public Next', total: 11, tie: 11 }
                ]
            };
            store.updateVTTState(state, caseId);
        });
        await page.waitForTimeout(50);
        await page.locator('#vtt-dm-dock [data-panel="combat"]').click();
        await page.locator('#vtt-dm-dock [data-vtt-master-menu-toggle]').click();
        await page.locator('#vtt-role-toggle').click();
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'player');
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'combat');
        assert.equal(await page.locator('#vtt-current-turn-label').textContent(), 'Hidden combatant');
        assert.equal(await page.locator('#vtt-next-turn-label').textContent(), 'Next visible · Public Next');
        assert.equal(await page.locator('#vtt-initiative-list .vtt-entry-redacted').count(), 1);
        assert.equal(await page.locator('#vtt-initiative-list').innerText().then((text) => text.includes('Veiled Current') || text.includes('Veiled Interruption')), false);
        assert.match(await page.locator('#vtt-initiative-list .vtt-entry', { hasText: 'Public Next' }).innerText(), /Next visible/);
        await page.locator('#vtt-initiative-rail-tab').click();
        await page.waitForTimeout(25);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'vtt-player-combat-btn', 'role changes should remap Combat focus to the visible launcher');

        await page.locator('#vtt-player-dock [data-vtt-master-menu-toggle]').click();
        await page.locator('#vtt-role-toggle').click();
        await page.locator('#vtt-dm-unlock-input').fill('setDMMode');
        await page.locator('#vtt-dm-unlock-form').evaluate((form) => form.requestSubmit());
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'dm');

        await page.locator('#vtt-dm-dock [data-panel="inspector"]').click();
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), 'inspector');
        await page.locator('#vtt-dm-dock [data-vtt-master-menu-toggle]').click();
        await page.locator('#vtt-role-toggle').click();
        await page.waitForTimeout(200);
        assert.equal(await page.locator('body').getAttribute('data-vtt-role'), 'player');
        assert.equal(await page.locator('body').getAttribute('data-active-vtt-panel'), '', 'role changes must not leave an invisible DM drawer active');
        assert.equal(await page.locator('#vtt-settings-panel').isHidden(), true);
        assert.ok((await page.locator('#vtt-stage').boundingBox()).width >= closedStageWidth - 1, 'closing a role-incompatible drawer should return the map space');
    });
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}

console.log('Interaction workflows passed: 6');
