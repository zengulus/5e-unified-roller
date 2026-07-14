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
    }

    closest() {
        return null;
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
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
    const runtime = {
        localRole: 'dm',
        localToolState: { mode: 'navigate', sizeCells: 4 },
        localView: { x: 0, y: 0, zoom: 1 },
        playerRollMenuOpen: false,
        previewTokenId: '',
        selectedTokenId: ''
    };
    const recordClose = (name, result = false) => () => {
        calls.push(name);
        return result;
    };
    const api = {
        activateEvidenceNoteSelection: (id) => calls.push(`select-note:${id}`),
        activateTokenSelection: (id) => calls.push(`select-token:${id}`),
        cancelAskRollPickMode: recordClose('cancel-ask'),
        canRoleMoveToken: () => true,
        clampZoom: (zoom) => {
            calls.push(`clamp:${zoom}`);
            return Math.round(zoom * 1000) / 1000;
        },
        clearSpawnDrag: recordClose('clear-spawn'),
        clearTemplatePlacementState: recordClose('clear-template'),
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
        getTokenById: (id) => id === 'token_one' ? { id } : null,
        isDMUnlockModalOpen: () => false,
        isRosterSelfModalOpen: () => false,
        moveSelectedTokenByCells: () => false,
        openStageContextMenu: (x, y, options) => calls.push({ name: 'open-context', x, y, options }),
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
        screenToWorld: (x, y) => ({ x: x + 1, y: y + 2 }),
        setZoomAtPoint: (zoom, x, y) => calls.push({ name: 'zoom', zoom, x, y }),
        toNumber: (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
    };
    const input = stageInputFactory.create({
        runtime,
        api,
        dom: { body: null, initiativeListEl: null, noteLayerEl: null, stageEl },
        config: {}
    });
    return { api, calls, input, runtime, stageEl };
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
    assert.equal(usedRuntime.size, 36);
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
            options: { tokenId: 'token_one', worldPoint: { x: 41, y: 52 } }
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
