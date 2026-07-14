const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtimeStateFactory = require('../js/vtt-runtime-state.js');

const actionGroups = [
    {
        name: 'rolls',
        controllerName: 'Rolls',
        expectedActionCount: 43,
        factory: require('../js/vtt-actions-rolls.js')
    },
    {
        name: 'table',
        controllerName: 'Table',
        expectedActionCount: 62,
        factory: require('../js/vtt-actions-table.js')
    },
    {
        name: 'scenes',
        controllerName: 'Scenes',
        expectedActionCount: 14,
        factory: require('../js/vtt-actions-scenes.js')
    },
    {
        name: 'selection',
        controllerName: 'Selection',
        expectedActionCount: 17,
        factory: require('../js/vtt-actions-selection.js')
    }
];

const readWorkspaceFile = (relativePath) => fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
);

const getActionNames = (groupName) => {
    const source = readWorkspaceFile(`js/vtt-actions-${groupName}.js`);
    const match = source.match(/const ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(match, `${groupName} exposes a static action ownership set`);
    return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
};

const getModuleDependencyNames = (groupName) => {
    const source = readWorkspaceFile(`js/vtt-actions-${groupName}.js`);
    const match = source.match(/const \{([\s\S]*?)\}\s*=\s*deps;/);
    assert.ok(match, `${groupName} has an explicit dependency list`);
    return new Set([
        'state',
        ...match[1].split(',').map((entry) => entry.trim()).filter(Boolean)
    ]);
};

const getControllerDependencyNames = (source, controllerName) => {
    const pattern = new RegExp(
        `const vtt${controllerName}Actions = vtt${controllerName}ActionFactory\\.create\\(\\{([\\s\\S]*?)\\n    \\}\\);`
    );
    const match = source.match(pattern);
    assert.ok(match, `${controllerName} action dependencies are wired in vtt.js`);
    return new Set(match[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.split(':', 1)[0].trim()));
};

test('VTT action ownership is complete, exclusive, and rejects unknown actions', () => {
    const instances = actionGroups.map((group) => ({
        ...group,
        actions: getActionNames(group.name),
        instance: group.factory.create({})
    }));
    const allActions = instances.flatMap((group) => group.actions);

    assert.equal(allActions.length, 136);
    instances.forEach((group) => {
        assert.equal(group.actions.length, group.expectedActionCount, `${group.name} action count`);
        assert.equal(new Set(group.actions).size, group.actions.length, `${group.name} has no duplicate entries`);
    });

    allActions.forEach((action) => {
        const owners = instances.filter((group) => group.instance.handles(action));
        assert.deepEqual(owners.map((group) => group.name), [
            instances.find((group) => group.actions.includes(action)).name
        ], `${action} has exactly one owner`);
    });

    instances.forEach((group) => {
        assert.equal(group.instance.handles('not-a-real-vtt-action'), false);
        assert.equal(group.instance.handles(''), false);
    });
});

test('VTT action modules receive every declared dependency and runtime state field', () => {
    const controllerSource = readWorkspaceFile('js/vtt.js');
    assert.match(
        controllerSource,
        /const vttActionState = runtimeState\.ports\.actions;/,
        'vtt.js binds action modules to the centralized action port'
    );
    const exposedState = new Set(Object.keys(runtimeStateFactory.PORT_MAPS.actions));
    const usedStateAcrossGroups = new Set();

    actionGroups.forEach((group) => {
        const moduleDependencies = getModuleDependencyNames(group.name);
        const controllerDependencies = getControllerDependencyNames(controllerSource, group.controllerName);
        assert.deepEqual(
            [...controllerDependencies].sort(),
            [...moduleDependencies].sort(),
            `${group.name} dependency wiring matches its module contract`
        );

        const moduleSource = readWorkspaceFile(`js/vtt-actions-${group.name}.js`);
        const usedState = new Set(
            [...moduleSource.matchAll(/\bstate\.([A-Za-z_$][\w$]*)/g)].map((entry) => entry[1])
        );
        usedState.forEach((key) => usedStateAcrossGroups.add(key));
        const missingState = [...usedState].filter((key) => !exposedState.has(key));
        assert.deepEqual(missingState, [], `${group.name} state reads and writes use the action port`);
    });

    assert.deepEqual(
        [...exposedState].sort(),
        [...usedStateAcrossGroups].sort(),
        'the action port exactly matches action-module state reads and writes'
    );
});

test('roll actions normalize mode before rendering dependent roll views', () => {
    const calls = [];
    const state = { localRollMode: 'norm' };
    const actions = actionGroups[0].factory.create({
        state,
        normalizeRollMode: (value) => {
            calls.push(`normalize:${value}`);
            return 'adv';
        },
        renderPlayerRollMenu: () => calls.push(`player:${state.localRollMode}`),
        renderProximityPrompt: () => calls.push(`proximity:${state.localRollMode}`)
    });

    actions.handle({ dataset: { rollMode: 'advantage' } }, 'set-roll-mode', '');

    assert.equal(state.localRollMode, 'adv');
    assert.deepEqual(calls, [
        'normalize:advantage',
        'player:adv',
        'proximity:adv'
    ]);
});

test('table actions clear request state before changing the active ping tool', () => {
    const calls = [];
    const state = {
        askRollPickMode: true,
        pendingAskRollRequest: { label: 'Perception' },
        localPingVariant: 'attention'
    };
    const tableGroup = actionGroups.find((group) => group.name === 'table');
    const actions = tableGroup.factory.create({
        state,
        TOOL_MODE_PING: 'ping',
        isSpectator: () => false,
        normalizePingVariant: (value) => {
            calls.push(`normalize:${value}:${state.askRollPickMode}:${state.pendingAskRollRequest}`);
            return 'question';
        },
        setToolMode: (mode) => calls.push(`tool:${mode}:${state.localPingVariant}`),
        render: () => calls.push(`render:${state.localPingVariant}`)
    });

    actions.handle({ dataset: { pingVariant: 'question' } }, 'set-ping-mode', '');

    assert.equal(state.askRollPickMode, false);
    assert.equal(state.pendingAskRollRequest, null);
    assert.equal(state.localPingVariant, 'question');
    assert.deepEqual(calls, [
        'normalize:question:false:null',
        'tool:ping:question',
        'render:question'
    ]);
});

test('scene actions create, select, and fit a scene inside one draft mutation', () => {
    const calls = [];
    const originalScene = { id: 'scene_one' };
    const createdScene = { id: 'scene_two' };
    const state = {
        vttState: { activeSceneId: 'scene_one', scenes: [originalScene] },
        previewTokenId: 'token_preview'
    };
    let mutationOptions = null;
    const scenesGroup = actionGroups.find((group) => group.name === 'scenes');
    const actions = scenesGroup.factory.create({
        state,
        SCENE_VIEW_LOCAL: 'local',
        buildSceneRecord: (scenes) => {
            calls.push(`build:${scenes.length}`);
            return createdScene;
        },
        isDM: () => {
            calls.push('role:dm');
            return true;
        },
        setSceneViewPreference: (mode, sceneId) => {
            calls.push(`view:${mode}:${sceneId}:${state.previewTokenId}`);
        },
        withDraft: (mutate, options) => {
            calls.push('draft:start');
            mutate(state.vttState);
            mutationOptions = options;
            calls.push(`draft:end:${state.vttState.scenes.length}:${state.previewTokenId}`);
        }
    });

    actions.handle({ dataset: {} }, 'create-scene', '');

    assert.deepEqual(state.vttState.scenes, [originalScene, createdScene]);
    assert.equal(state.previewTokenId, '');
    assert.deepEqual(mutationOptions, { fitView: true });
    assert.deepEqual(calls, [
        'build:1',
        'draft:start',
        'role:dm',
        'view:local:scene_two:token_preview',
        'draft:end:2:'
    ]);
});

test('selection actions commit entry selection before rendering all dependent views', () => {
    const calls = [];
    const state = {
        selectedEntryId: 'entry_old',
        selectedEvidenceNoteId: 'note_one',
        initiativeDetailState: { entryId: 'entry_old' }
    };
    const selectionGroup = actionGroups.find((group) => group.name === 'selection');
    const recordRender = (name) => () => calls.push(
        `${name}:${state.selectedEntryId}:${state.selectedEvidenceNoteId}:${state.initiativeDetailState}`
    );
    const actions = selectionGroup.factory.create({
        state,
        renderInitiativeList: recordRender('list'),
        renderInitiativeDetail: recordRender('detail'),
        renderTokenInspector: recordRender('inspector'),
        renderStage: recordRender('stage')
    });

    actions.handle({ dataset: {} }, 'select-entry', 'entry_new');

    assert.equal(state.selectedEntryId, 'entry_new');
    assert.equal(state.selectedEvidenceNoteId, '');
    assert.equal(state.initiativeDetailState, null);
    assert.deepEqual(calls, [
        'list:entry_new::null',
        'detail:entry_new::null',
        'inspector:entry_new::null',
        'stage:entry_new::null'
    ]);
});
