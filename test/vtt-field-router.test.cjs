const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtimeStateFactory = require('../js/vtt-runtime-state.js');

class FakeHTMLElement {
    constructor({ dataset = {}, value = '' } = {}) {
        this.dataset = { ...dataset };
        this.value = value;
        this.isContentEditable = false;
    }

    closest() {
        return null;
    }
}

class FakeHTMLInputElement extends FakeHTMLElement {
    constructor(options = {}) {
        super(options);
        this.checked = !!options.checked;
        this.type = options.type || 'text';
    }
}

class FakeHTMLSelectElement extends FakeHTMLElement { }
class FakeHTMLTextAreaElement extends FakeHTMLElement { }

const originalGlobals = new Map();
const installGlobal = (name, value) => {
    originalGlobals.set(name, Object.prototype.hasOwnProperty.call(globalThis, name)
        ? globalThis[name]
        : undefined);
    globalThis[name] = value;
};

installGlobal('HTMLElement', FakeHTMLElement);
installGlobal('HTMLInputElement', FakeHTMLInputElement);
installGlobal('HTMLSelectElement', FakeHTMLSelectElement);
installGlobal('HTMLTextAreaElement', FakeHTMLTextAreaElement);

test.after(() => {
    originalGlobals.forEach((value, name) => {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
    });
});

const fieldRouterFactory = require('../js/vtt-field-router.js');

const readWorkspaceFile = (relativePath) => fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
);

const parseObjectKeys = (source) => new Set(source
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(':', 1)[0].trim()));

const createFieldHarness = () => {
    const npcSearchInputEl = new FakeHTMLInputElement();
    const scene = { id: 'scene_one', name: 'Old Name' };
    const state = {
        fitViewOnNextMapLoad: false,
        localToolState: { sizeCells: 4 },
        npcRollState: { formula: '1d20', label: 'NPC', monsterRollQuery: '' },
        npcSearchQuery: '',
        playerRollSearchQuery: '',
        previewTokenId: '',
        selectedEntryId: '',
        selectedEvidenceNoteId: '',
        selectedTokenId: '',
        sheetActionQuery: '',
        vttState: { activeSceneId: scene.id, scenes: [scene] }
    };
    const calls = [];
    const deps = {
        state,
        npcSearchInputEl,
        getActiveScene: (draft = state.vttState) => draft.scenes.find(
            (entry) => entry.id === draft.activeSceneId
        ),
        renderNPCRollPopover: () => calls.push('render-npc-roll'),
        renderNPCSearchPopover: () => calls.push('render-npc-search'),
        renderPlayerRollMenu: () => calls.push('render-player-rolls'),
        renderSheetActionPopover: () => calls.push('render-sheet-actions'),
        withDraft: (mutate, options) => {
            calls.push({ name: 'with-draft:start', options });
            mutate(state.vttState);
            calls.push({ name: 'with-draft:end', sceneName: scene.name });
            return true;
        }
    };
    return {
        calls,
        npcSearchInputEl,
        router: fieldRouterFactory.create(deps),
        scene,
        state
    };
};

test('VTT field-router wiring supplies every dependency and state field', () => {
    const moduleSource = readWorkspaceFile('js/vtt-field-router.js');
    const controllerSource = readWorkspaceFile('js/vtt.js');
    const dependencyMatch = moduleSource.match(/const \{([\s\S]*?)\}\s*=\s*deps;/);
    assert.ok(dependencyMatch, 'field router declares explicit dependencies');
    const requiredDependencies = new Set([
        'state',
        ...dependencyMatch[1].split(',').map((entry) => entry.trim()).filter(Boolean)
    ]);
    assert.equal(requiredDependencies.size, 63);

    const wiringMatch = controllerSource.match(
        /const vttFieldRouter = vttFieldRouterFactory\.create\(\{([\s\S]*?)\n    \}\);/
    );
    assert.ok(wiringMatch, 'vtt.js creates the field router');
    assert.deepEqual(
        [...parseObjectKeys(wiringMatch[1])].sort(),
        [...requiredDependencies].sort(),
        'field-router wiring matches its destructured contract'
    );

    assert.match(
        controllerSource,
        /const vttFieldRouterState = runtimeState\.ports\.fields;/,
        'vtt.js binds the field router to the centralized field port'
    );
    const exposedState = new Set(Object.keys(runtimeStateFactory.PORT_MAPS.fields));
    const usedState = new Set(
        [...moduleSource.matchAll(/\bstate\.([A-Za-z_$][\w$]*)/g)].map((entry) => entry[1])
    );
    assert.equal(usedState.size, 11);
    assert.deepEqual(
        [...exposedState].sort(),
        [...usedState].sort(),
        'the field port exactly matches field-router state reads and writes'
    );
});

test('VTT field router updates NPC search only for its bound input', () => {
    const harness = createFieldHarness();
    harness.npcSearchInputEl.value = 'goblin boss';

    harness.router.handleNPCSearchInput({ target: harness.npcSearchInputEl });

    assert.equal(harness.state.npcSearchQuery, 'goblin boss');
    assert.deepEqual(harness.calls, ['render-npc-search']);

    harness.calls.length = 0;
    harness.router.handleNPCSearchInput({
        target: new FakeHTMLInputElement({ value: 'ignored' })
    });
    assert.equal(harness.state.npcSearchQuery, 'goblin boss');
    assert.deepEqual(harness.calls, []);
});

test('VTT field router routes player, sheet, and NPC roll search fields', () => {
    const harness = createFieldHarness();

    harness.router.handleFieldChange({
        type: 'input',
        target: new FakeHTMLInputElement({
            dataset: { playerRollSearch: '' },
            value: 'stealth'
        })
    });
    harness.router.handleFieldChange({
        type: 'change',
        target: new FakeHTMLInputElement({
            dataset: { sheetActionSearch: '' },
            value: 'wisdom save'
        })
    });
    harness.router.handleFieldChange({
        type: 'change',
        target: new FakeHTMLInputElement({
            dataset: { monsterRollFilter: '' },
            value: 'recharge'
        })
    });
    harness.router.handleFieldChange({
        type: 'change',
        target: new FakeHTMLInputElement({
            dataset: { npcRollField: 'formula' },
            value: '2d6 + 3'
        })
    });

    assert.equal(harness.state.playerRollSearchQuery, 'stealth');
    assert.equal(harness.state.sheetActionQuery, 'wisdom save');
    assert.equal(harness.state.npcRollState.monsterRollQuery, 'recharge');
    assert.equal(harness.state.npcRollState.formula, '2d6 + 3');
    assert.deepEqual(harness.calls, [
        'render-player-rolls',
        'render-sheet-actions',
        'render-npc-roll'
    ]);
});

test('VTT field router persists a scene-name change through one draft mutation', () => {
    const harness = createFieldHarness();

    harness.router.handleFieldChange({
        type: 'change',
        target: new FakeHTMLInputElement({
            dataset: { sceneField: 'name' },
            value: '  New Scene Name  '
        })
    });

    assert.equal(harness.scene.name, 'New Scene Name');
    assert.deepEqual(harness.calls, [
        { name: 'with-draft:start', options: { fitView: false } },
        { name: 'with-draft:end', sceneName: 'New Scene Name' }
    ]);
});

test('VTT field router ignores unknown elements without mutating state', () => {
    const harness = createFieldHarness();
    const before = JSON.parse(JSON.stringify(harness.state));

    harness.router.handleFieldChange({
        type: 'change',
        target: new FakeHTMLElement({ dataset: { unknownField: 'value' }, value: 'ignored' })
    });

    assert.deepEqual(harness.state, before);
    assert.deepEqual(harness.calls, []);
});
