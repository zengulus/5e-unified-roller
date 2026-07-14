const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeStateFactory = require('../js/vtt-runtime-state.js');

const sortedKeys = (value) => Object.keys(value).sort();

test('VTT runtime state factory creates the isolated default groups and resource maps', () => {
    const defaultWorldSize = { width: 3200, height: 1800 };
    const state = runtimeStateFactory.create({
        defaultWorldSize,
        sceneViewMode: 'local',
        toolMode: 'fog',
        toolSizeCells: 6
    });

    assert.deepEqual(sortedKeys(state), ['ports', 'resources', 'session', 'stage', 'ui']);
    assert.deepEqual(sortedKeys(state.session), [
        'caseTransitionId',
        'initialLoadPending',
        'pendingCaseId',
        'pendingRemoteSnapshot',
        'role',
        'snapshot',
        'stateCaseId'
    ]);
    assert.deepEqual(sortedKeys(state.stage), [
        'placement',
        'pointer',
        'preview',
        'selection',
        'tool',
        'view'
    ]);
    assert.deepEqual(sortedKeys(state.ui), [
        'menus',
        'modals',
        'music',
        'npcSearch',
        'overlays',
        'playerRoll',
        'preferences',
        'queries'
    ]);
    assert.deepEqual(sortedKeys(state.resources), [
        'monsters',
        'npcSearch',
        'playerImageUrlsAtLoad',
        'remoteTokenTweens',
        'rollActionGuard',
        'sessionController',
        'sessionControllerPromise',
        'stageInput',
        'stageView',
        'tokenImageRetryKeys',
        'unsubscribeSyncStatus'
    ]);

    assert.deepEqual(state.session, {
        snapshot: null,
        role: 'player',
        initialLoadPending: true,
        caseTransitionId: 0,
        stateCaseId: '',
        pendingCaseId: '',
        pendingRemoteSnapshot: null
    });
    assert.deepEqual(state.stage.selection, {
        tokenId: '',
        entryId: '',
        templateId: '',
        evidenceNoteId: '',
        clockId: ''
    });
    assert.deepEqual(state.stage.view, {
        local: { x: 40, y: 40, zoom: 1 },
        world: { width: 3200, height: 1800 },
        fitOnNextMapLoad: true
    });
    assert.deepEqual(state.stage.tool, {
        current: { mode: 'fog', sizeCells: 6 },
        pingVariant: 'attention',
        askRollPickMode: false,
        pendingAskRollRequest: null
    });
    assert.equal(state.ui.preferences.sceneViewMode, 'local');
    assert.deepEqual(state.ui.music, {
        commandState: { key: '', status: 'stopped' },
        volume: 70
    });

    assert.ok(state.resources.remoteTokenTweens instanceof Map);
    assert.ok(state.resources.tokenImageRetryKeys instanceof Map);
    assert.ok(state.resources.playerImageUrlsAtLoad instanceof Map);
    assert.ok(state.resources.rollActionGuard instanceof Map);
    assert.equal(state.resources.remoteTokenTweens.size, 0);
    assert.notStrictEqual(state.stage.view.world, defaultWorldSize);

    assert.deepEqual(runtimeStateFactory.create().stage.view.world, {
        width: 2400,
        height: 1600
    });
});

test('VTT runtime state ports expose exactly their exported map keys', () => {
    const state = runtimeStateFactory.create();

    assert.deepEqual(sortedKeys(state.ports), sortedKeys(runtimeStateFactory.PORT_MAPS));
    Object.entries(runtimeStateFactory.PORT_MAPS).forEach(([portName, portMap]) => {
        assert.deepEqual(
            sortedKeys(state.ports[portName]),
            sortedKeys(portMap),
            `${portName} port matches its exported map`
        );
    });
});

test('VTT runtime state ports keep shared fields live across every consumer', () => {
    const state = runtimeStateFactory.create();
    const { actions, fields, stageInput } = state.ports;
    const snapshot = { activeSceneId: 'scene_one' };
    const tool = { mode: 'ruler', sizeCells: 8 };

    actions.selectedTokenId = 'token_one';
    assert.equal(fields.selectedTokenId, 'token_one');
    assert.equal(stageInput.selectedTokenId, 'token_one');
    assert.equal(state.stage.selection.tokenId, 'token_one');

    fields.selectedEntryId = 'entry_one';
    assert.equal(actions.selectedEntryId, 'entry_one');
    assert.equal(stageInput.selectedEntryId, 'entry_one');

    stageInput.localToolState = tool;
    assert.strictEqual(actions.localToolState, tool);
    assert.strictEqual(fields.localToolState, tool);
    assert.strictEqual(state.stage.tool.current, tool);

    fields.vttState = snapshot;
    assert.strictEqual(actions.vttState, snapshot);
    assert.strictEqual(stageInput.vttState, snapshot);
    assert.strictEqual(state.session.snapshot, snapshot);

    actions.npcRollState = { tokenId: 'npc_one' };
    assert.deepEqual(fields.npcRollState, { tokenId: 'npc_one' });
    assert.deepEqual(stageInput.npcRollState, { tokenId: 'npc_one' });
});

test('VTT runtime state ports protect the local view reference but allow view updates', () => {
    const state = runtimeStateFactory.create();
    const { actions, stageInput } = state.ports;
    const descriptor = Object.getOwnPropertyDescriptor(actions, 'localView');

    assert.equal(descriptor.set, undefined);
    assert.strictEqual(actions.localView, state.stage.view.local);
    assert.strictEqual(stageInput.localView, state.stage.view.local);
    assert.equal(Reflect.set(actions, 'localView', { x: 0, y: 0, zoom: 2 }), false);
    assert.strictEqual(actions.localView, state.stage.view.local);

    actions.localView.x = 125;
    stageInput.localView.zoom = 1.75;
    assert.deepEqual(state.stage.view.local, { x: 125, y: 40, zoom: 1.75 });
});

test('VTT runtime state factory returns independent state instances', () => {
    const first = runtimeStateFactory.create();
    const second = runtimeStateFactory.create();

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.session, second.session);
    assert.notStrictEqual(first.stage.view.local, second.stage.view.local);
    assert.notStrictEqual(first.ui.preferences, second.ui.preferences);
    assert.notStrictEqual(
        first.resources.remoteTokenTweens,
        second.resources.remoteTokenTweens
    );

    first.ports.actions.selectedTokenId = 'token_first';
    first.ports.actions.localView.x = 999;
    first.ui.preferences.showGrid = false;
    first.resources.remoteTokenTweens.set('token_first', { x: 10 });

    assert.equal(second.ports.actions.selectedTokenId, '');
    assert.equal(second.ports.actions.localView.x, 40);
    assert.equal(second.ui.preferences.showGrid, true);
    assert.equal(second.resources.remoteTokenTweens.size, 0);
});
