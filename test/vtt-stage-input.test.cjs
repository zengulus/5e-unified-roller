const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtimeStateFactory = require('../js/vtt-runtime-state.js');

class FakeNode {
    constructor() {
        this.parentElement = null;
    }
}

class FakeElement extends FakeNode {
    constructor({ attributes = {}, dataset = {} } = {}) {
        super();
        this.attributes = { ...attributes };
        this.dataset = { ...dataset };
        this.isContentEditable = false;
        this.style = {
            setProperty(name, value) {
                this[name] = value;
            }
        };
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => classes.add(name)),
            contains: (name) => classes.has(name),
            remove: (...names) => names.forEach((name) => classes.delete(name))
        };
    }

    closest() {
        return null;
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
    }

    querySelector() {
        return null;
    }
}

class FakeHTMLElement extends FakeElement { }
class FakeHTMLInputElement extends FakeHTMLElement { }
class FakeHTMLTextAreaElement extends FakeHTMLElement { }
class FakeHTMLSelectElement extends FakeHTMLElement { }

const originalGlobals = new Map();
const installGlobal = (name, value) => {
    originalGlobals.set(name, Object.prototype.hasOwnProperty.call(globalThis, name)
        ? globalThis[name]
        : undefined);
    globalThis[name] = value;
};

installGlobal('Node', FakeNode);
installGlobal('Element', FakeElement);
installGlobal('HTMLElement', FakeHTMLElement);
installGlobal('HTMLInputElement', FakeHTMLInputElement);
installGlobal('HTMLTextAreaElement', FakeHTMLTextAreaElement);
installGlobal('HTMLSelectElement', FakeHTMLSelectElement);
installGlobal('CSS', { escape: (value) => String(value) });
installGlobal('document', {
    activeElement: null,
    elementsFromPoint: () => []
});

test.after(() => {
    originalGlobals.forEach((value, name) => {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
    });
});

const stageInputFactory = require('../js/vtt-stage-input.js');

const readWorkspaceFile = (relativePath) => fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
);

const parseObjectKeys = (source) => new Set(source
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(':', 1)[0].trim()));

const getDestructuredKeys = (source, dependencyName) => {
    const match = source.match(new RegExp(
        `const \\{([^}]*)\\}\\s*=\\s*deps\\.${dependencyName};`
    ));
    assert.ok(match, `stage input declares its ${dependencyName} contract`);
    return parseObjectKeys(match[1]);
};

const createStageHarness = () => {
    const calls = [];
    const stageEl = new FakeHTMLElement();
    const token = { id: 'token_one', x: 1, y: 2, w: 1, h: 1 };
    const scene = {
        id: 'scene_one',
        grid: { cellPx: 10, offsetX: 0, offsetY: 0 },
        tokens: [token]
    };
    const vttState = { activeSceneId: scene.id, scenes: [scene] };
    const runtime = {
        localRole: 'dm',
        localToolState: { mode: 'navigate', sizeCells: 4 },
        localView: { x: 0, y: 0, zoom: 1 },
        playerRollMenuOpen: false,
        previewTokenId: '',
        selectedTokenId: '',
        vttState
    };
    const recordClose = (name, result = false) => () => {
        calls.push(name);
        return result;
    };
    const api = {
        activateEvidenceNoteSelection: (id) => calls.push(`select-note:${id}`),
        activateTokenSelection: (id) => calls.push(`select-token:${id}`),
        applyPendingRemoteVTTSnapshot: () => {
            calls.push('apply-remote');
            return false;
        },
        buildRemoteTokenTweenKey: (sceneId, tokenId) => `${sceneId}:${tokenId}`,
        cancelAskRollPickMode: recordClose('cancel-ask'),
        canMutateLiveVTTState: () => true,
        canRoleMoveToken: () => true,
        clampZoom: (zoom) => {
            calls.push(`clamp:${zoom}`);
            return Math.round(zoom * 1000) / 1000;
        },
        clearSpawnDrag: recordClose('clear-spawn'),
        clearTemplatePlacementState: recordClose('clear-template'),
        clearTokenPortraitPreview: () => calls.push('clear-preview'),
        clearTransientDrawerState: recordClose('clear-transient'),
        closeActiveVTTPanel: recordClose('close-panel'),
        closeDMUnlockModal: recordClose('close-dm-unlock'),
        closeInitiativeDetail: recordClose('close-initiative'),
        closeNPCRollPopover: recordClose('close-npc-roll'),
        closeNavMenu: recordClose('close-nav'),
        closeQuickSpawnMenu: recordClose('close-quick-spawn'),
        closeSheetActionPopover: recordClose('close-sheet'),
        closeStageContextMenu: recordClose('close-context'),
        closeTokenInspectorPopover: recordClose('close-inspector'),
        closeToolsMenu: recordClose('close-tools'),
        closeViewMenu: recordClose('close-view'),
        getActiveScene: (state = vttState) => {
            const scenes = state && Array.isArray(state.scenes) ? state.scenes : [];
            return scenes.find((entry) => entry.id === state.activeSceneId) || scenes[0] || null;
        },
        getSceneCellPx: (targetScene) => Number(targetScene && targetScene.grid && targetScene.grid.cellPx) || 10,
        getTokenById: (id) => id === token.id ? token : null,
        isDM: () => runtime.localRole === 'dm',
        isDMUnlockModalOpen: () => false,
        isRosterSelfModalOpen: () => false,
        markTokenVisualEffect: (id, kind, duration) => calls.push(`effect:${id}:${kind}:${duration}`),
        moveSelectedTokenByCells: () => false,
        normalizeTokenCoordinate: (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 1000) / 1000) : fallback;
        },
        openStageContextMenu: (x, y, options) => calls.push({ name: 'open-context', x, y, options }),
        openTokenInspectorPopover: (id, x, y) => calls.push({ name: 'open-inspector', id, x, y }),
        rememberRecentLocalDragDrop: (sceneId, tokenId, x, y) => calls.push(`remember:${sceneId}:${tokenId}:${x}:${y}`),
        remoteTokenTweens: new Map(),
        render: () => calls.push('render'),
        renderInitiativeDetail: () => calls.push('render-detail'),
        renderInitiativeList: () => calls.push('render-list'),
        renderNPCRollPopover: () => calls.push('render-npc-roll'),
        renderSheetActionPopover: () => calls.push('render-sheet'),
        renderStage: () => calls.push('render-stage'),
        renderStageContextMenu: () => calls.push('render-context'),
        renderTokenInspector: () => calls.push('render-inspector'),
        renderTokenInspectorPopover: () => calls.push('render-inspector-popover'),
        renderToolsMenu: () => calls.push('render-tools'),
        scaleForZoom: (value) => value,
        screenToWorld: (x, y) => ({ x: x + 1, y: y + 2 }),
        setZoomAtPoint: (zoom, x, y) => calls.push({ name: 'zoom', zoom, x, y }),
        showTokenPortraitPreview: (id) => calls.push(`show-preview:${id}`),
        snapTokenToGrid: (id) => calls.push(`snap:${id}`),
        suppressLocalDragTween: (sceneId, tokenId) => calls.push(`suppress:${sceneId}:${tokenId}`),
        syncDraggedState: (force) => calls.push(`sync:${force}`),
        toNumber: (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
    };
    const input = stageInputFactory.create({
        runtime,
        api,
        dom: { body: null, initiativeListEl: null, noteLayerEl: null, stageEl },
        config: {
            STAGE_TOOL_DOUBLE_PRESS_PX: 18,
            TOKEN_CLICK_MOVE_PX: 5,
            TOKEN_DOUBLE_CLICK_MS: 500,
            TOKEN_DROP_PULSE_MS: 720,
            TOOL_MODE_NAVIGATE: 'navigate'
        }
    });
    return { api, calls, input, runtime, scene, stageEl, token, vttState };
};

const createTokenElement = (tokenId = 'token_one') => {
    const tokenEl = new FakeHTMLElement({
        attributes: { 'data-token-id': tokenId },
        dataset: { tokenId }
    });
    tokenEl.closest = (selector) => selector === '.vtt-token' ? tokenEl : null;
    return tokenEl;
};

test('VTT stage input validates its required top-level dependency ports', () => {
    assert.throws(
        () => stageInputFactory.create(),
        /requires runtime, api, and dom dependencies/
    );
    assert.throws(
        () => stageInputFactory.create({ runtime: {}, api: {} }),
        /requires runtime, api, and dom dependencies/
    );
    assert.throws(
        () => stageInputFactory.create({ runtime: {}, api: {}, dom: {} }),
        TypeError
    );
    assert.equal(typeof stageInputFactory.create({
        runtime: {},
        api: {},
        dom: {},
        config: {}
    }).handleStageWheel, 'function');
});

test('VTT stage input wiring supplies every API, DOM, config, and runtime field', () => {
    const moduleSource = readWorkspaceFile('js/vtt-stage-input.js');
    const controllerSource = readWorkspaceFile('js/vtt.js');
    const required = {
        api: getDestructuredKeys(moduleSource, 'api'),
        dom: getDestructuredKeys(moduleSource, 'dom'),
        config: getDestructuredKeys(moduleSource, 'config')
    };
    assert.deepEqual(
        { api: required.api.size, dom: required.dom.size, config: required.config.size },
        { api: 82, dom: 4, config: 17 }
    );

    const createMatch = controllerSource.match(
        /resources\.stageInput = vttStageInputFactory\.create\(\{([\s\S]*?)\n    \}\);/
    );
    assert.ok(createMatch, 'vtt.js creates the stage input module');
    const createBlock = createMatch[1];
    assert.match(createBlock, /runtime:\s*vttStageInputRuntime/);
    assert.match(
        controllerSource,
        /const vttStageInputRuntime = runtimeState\.ports\.stageInput;/,
        'vtt.js binds stage input to the centralized stage-input port'
    );
    const wiredMatches = {
        api: createBlock.match(/api:\s*\{([\s\S]*?)\n        \},\n        dom:/),
        dom: createBlock.match(/dom:\s*\{([\s\S]*?)\n        \},\n        config:/),
        config: createBlock.match(/config:\s*\{([\s\S]*?)\n        \}/)
    };
    Object.entries(required).forEach(([name, keys]) => {
        assert.ok(wiredMatches[name], `vtt.js wires stage ${name}`);
        assert.deepEqual(
            [...parseObjectKeys(wiredMatches[name][1])].sort(),
            [...keys].sort(),
            `stage ${name} wiring matches its destructured contract`
        );
    });

    const exposedRuntime = new Set(Object.keys(runtimeStateFactory.PORT_MAPS.stageInput));
    const usedRuntime = new Set(
        [...moduleSource.matchAll(/\bruntime\.([A-Za-z_$][\w$]*)/g)].map((entry) => entry[1])
    );
    assert.equal(usedRuntime.size, 34);
    assert.deepEqual(
        [...exposedRuntime].sort(),
        [...usedRuntime].sort(),
        'the stage-input port exactly matches stage runtime reads and writes'
    );
});

test('VTT stage wheel zooms vertical input and ignores ordinary horizontal scrolling', () => {
    const harness = createStageHarness();
    let prevented = 0;

    harness.input.handleStageWheel({
        target: harness.stageEl,
        deltaX: 0,
        deltaY: 120,
        ctrlKey: false,
        clientX: 320,
        clientY: 180,
        preventDefault: () => {
            prevented += 1;
        }
    });

    assert.equal(prevented, 1);
    assert.equal(harness.calls[0].startsWith('clamp:'), true);
    assert.deepEqual(harness.calls[1], {
        name: 'zoom',
        zoom: 0.903,
        x: 320,
        y: 180
    });

    harness.calls.length = 0;
    harness.input.handleStageWheel({
        target: harness.stageEl,
        deltaX: 100,
        deltaY: 10,
        ctrlKey: false,
        clientX: 10,
        clientY: 20,
        preventDefault: () => {
            prevented += 1;
        }
    });
    assert.deepEqual(harness.calls, []);
    assert.equal(prevented, 1);
});

test('VTT stage context selection opens the token menu before dependent renders', () => {
    const harness = createStageHarness();
    const tokenEl = new FakeHTMLElement({ attributes: { 'data-token-id': 'token_one' } });
    tokenEl.closest = (selector) => selector === '.vtt-token' ? tokenEl : null;
    harness.runtime.previewTokenId = 'preview_token';
    let prevented = 0;

    harness.input.handleStageContextMenu({
        target: tokenEl,
        clientX: 40,
        clientY: 50,
        preventDefault: () => {
            prevented += 1;
        }
    });

    assert.equal(prevented, 1);
    assert.equal(harness.runtime.previewTokenId, '');
    assert.deepEqual(harness.calls, [
        'select-token:token_one',
        {
            name: 'open-context',
            x: 40,
            y: 50,
            options: { tokenId: 'token_one', worldPoint: { x: 41, y: 52 }, altKey: false, shiftKey: false }
        },
        'render-list',
        'render-detail',
        'render-inspector',
        'render-inspector-popover',
        'render-sheet',
        'render-npc-roll',
        'render-context',
        'render-tools',
        'render-stage'
    ]);
});

test('VTT Escape closes transient input state and clears portrait preview', () => {
    const harness = createStageHarness();
    harness.runtime.playerRollMenuOpen = true;
    harness.runtime.previewTokenId = 'preview_token';
    let prevented = 0;

    harness.input.handleDocumentKeyDown({
        target: harness.stageEl,
        key: 'Escape',
        preventDefault: () => {
            prevented += 1;
        }
    });

    assert.equal(prevented, 1);
    assert.equal(harness.runtime.playerRollMenuOpen, false);
    assert.equal(harness.runtime.previewTokenId, '');
    assert.deepEqual(harness.calls, [
        'clear-transient',
        'cancel-ask',
        'close-quick-spawn',
        'close-nav',
        'close-view',
        'close-tools',
        'close-context',
        'clear-spawn',
        'clear-template',
        'close-panel',
        'close-initiative',
        'close-inspector',
        'close-sheet',
        'close-npc-roll',
        'render-stage'
    ]);
});

test('VTT token jitter stays a click and preserves the following double press', () => {
    const harness = createStageHarness();
    const tokenEl = createTokenElement();
    harness.stageEl.querySelector = () => tokenEl;

    harness.input.handleStagePointerDown({
        target: tokenEl,
        button: 0,
        clientX: 10,
        clientY: 20,
        preventDefault() { }
    });
    harness.calls.length = 0;

    harness.input.handlePointerMove({
        target: tokenEl,
        clientX: 12,
        clientY: 21
    });

    assert.deepEqual(
        { x: harness.token.x, y: harness.token.y },
        { x: 1, y: 2 },
        'movement inside the click threshold must not alter the token'
    );
    assert.deepEqual(harness.calls, [], 'click jitter must not render or sync drag state');

    harness.input.handlePointerUp({
        target: tokenEl,
        type: 'pointerup',
        clientX: 12,
        clientY: 21
    });
    assert.equal(harness.calls.some((call) => String(call).startsWith('sync:')), false);
    harness.calls.length = 0;

    let prevented = 0;
    harness.input.handleStagePointerDown({
        target: tokenEl,
        button: 0,
        clientX: 12,
        clientY: 21,
        preventDefault: () => {
            prevented += 1;
        }
    });

    assert.equal(prevented, 1);
    assert.deepEqual(
        harness.calls.find((call) => call && call.name === 'open-inspector'),
        { name: 'open-inspector', id: 'token_one', x: 12, y: 21 },
        'the second nearby press should retain the DM token-inspector gesture'
    );
    assert.equal(harness.runtime.dragState, null);
});

test('VTT token drag previews only the dragged DOM node and force-syncs on drop', () => {
    const harness = createStageHarness();
    const tokenEl = createTokenElement();
    harness.stageEl.querySelector = () => tokenEl;

    harness.input.handleStagePointerDown({
        target: tokenEl,
        button: 0,
        clientX: 10,
        clientY: 20,
        preventDefault() { }
    });
    harness.calls.length = 0;

    harness.input.handlePointerMove({
        target: tokenEl,
        clientX: 30,
        clientY: 40
    });

    assert.deepEqual({ x: harness.token.x, y: harness.token.y }, { x: 3, y: 4 });
    assert.equal(tokenEl.dataset.worldLeft, '30');
    assert.equal(tokenEl.dataset.worldTop, '40');
    assert.equal(tokenEl.style.left, '0px');
    assert.equal(tokenEl.style.top, '0px');
    assert.equal(tokenEl.style.transform, 'translate3d(30px, 40px, 0)');
    assert.equal(tokenEl.classList.contains('is-dragging'), true);
    assert.equal(harness.calls.includes('render-stage'), false, 'pointermove must avoid a full-stage render');
    assert.deepEqual(harness.calls, ['sync:false']);

    harness.calls.length = 0;
    harness.input.handlePointerUp({
        target: tokenEl,
        type: 'pointerup',
        clientX: 30,
        clientY: 40
    });

    assert.equal(harness.runtime.dragState, null);
    assert.ok(harness.calls.includes('sync:true'), 'drop must force the final shared position sync');
    assert.ok(harness.calls.includes('remember:scene_one:token_one:3:4'));
    assert.ok(harness.calls.includes('effect:token_one:drop-pulse:720'));
});

test('VTT native token double click opens the DM inspector and is wired on the stage', () => {
    const harness = createStageHarness();
    const tokenEl = createTokenElement();
    harness.runtime.dragState = { tokenId: 'token_one', moved: false };
    harness.runtime.previewTokenId = 'token_one';
    let prevented = 0;

    harness.input.handleStageDoubleClick({
        target: tokenEl,
        clientX: 44,
        clientY: 55,
        preventDefault: () => {
            prevented += 1;
        }
    });

    assert.equal(prevented, 1);
    assert.equal(harness.runtime.dragState, null);
    assert.equal(harness.runtime.previewTokenId, '');
    assert.deepEqual(
        harness.calls.find((call) => call && call.name === 'open-inspector'),
        { name: 'open-inspector', id: 'token_one', x: 44, y: 55 }
    );
    assert.ok(harness.calls.includes('render-inspector-popover'));
    assert.match(
        readWorkspaceFile('js/vtt.js'),
        /dom\.stageEl\.addEventListener\('dblclick', handleStageDoubleClick\)/,
        'the stage must bind the native double-click handler'
    );
});
