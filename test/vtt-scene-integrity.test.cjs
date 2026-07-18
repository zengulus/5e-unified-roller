const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scenesActionFactory = require('../js/vtt-actions-scenes.js');

const readWorkspaceFile = (relativePath) => fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
);

const loadBuildSceneRecord = () => {
    const source = readWorkspaceFile('js/vtt.js');
    const start = source.indexOf('    const buildSceneRecord =');
    const end = source.indexOf('\n    const serializeConditions', start);
    assert.ok(start >= 0 && end > start, 'buildSceneRecord remains a directly testable declaration');
    const declaration = source.slice(start, end).trim();
    const buildCounts = new Map();
    const buildId = (prefix) => {
        const next = (buildCounts.get(prefix) || 0) + 1;
        buildCounts.set(prefix, next);
        return `${prefix}_copy_${next}`;
    };
    return Function(
        'deepClone',
        'buildId',
        'clampMapScale',
        'normalizeSceneMusic',
        'C',
        `'use strict'; ${declaration}; return buildSceneRecord;`
    )(
        (value) => JSON.parse(JSON.stringify(value)),
        buildId,
        (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
        (value) => value || { url: '', volume: 1 },
        { DEFAULT_VTT_CELL_PX: 70 }
    );
};

test('cloning a scene remaps token and evidence trigger clock references', () => {
    const buildSceneRecord = loadBuildSceneRecord();
    const sourceScene = {
        id: 'scene_source',
        name: 'Vault',
        grid: { cellPx: 70, offsetX: 0, offsetY: 0, cellDistance: 5 },
        clocks: [
            { id: 'clock_alarm', title: 'Alarm' },
            { id: 'clock_escape', title: 'Escape' }
        ],
        tokens: [{
            id: 'token_guard',
            triggers: [
                { id: 'trigger_alarm', clockId: 'clock_alarm', clockSuccessDelta: 2, clockFailDelta: -1 },
                { id: 'trigger_dangling', clockId: 'clock_missing', clockSuccessDelta: 3, clockFailDelta: -2 },
                { id: 'trigger_fiction', clockId: '', body: 'No clock effect' }
            ]
        }],
        evidenceNotes: [{
            id: 'note_rune',
            triggers: [{ id: 'trigger_escape', clockId: 'clock_escape', clockSuccessDelta: 1, clockFailDelta: 0 }]
        }]
    };

    const clone = buildSceneRecord([sourceScene], sourceScene);
    const clonedAlarmId = clone.clocks.find((clock) => clock.title === 'Alarm').id;
    const clonedEscapeId = clone.clocks.find((clock) => clock.title === 'Escape').id;

    assert.notEqual(clonedAlarmId, 'clock_alarm');
    assert.notEqual(clonedEscapeId, 'clock_escape');
    assert.equal(clone.tokens[0].triggers[0].clockId, clonedAlarmId);
    assert.equal(clone.tokens[0].triggers[0].clockSuccessDelta, 2);
    assert.equal(clone.evidenceNotes[0].triggers[0].clockId, clonedEscapeId);
    assert.deepEqual(clone.tokens[0].triggers[1], {
        id: 'trigger_dangling',
        clockId: '',
        clockSuccessDelta: 0,
        clockFailDelta: 0
    });
    assert.equal(clone.tokens[0].triggers[2].clockId, '');
    assert.equal(sourceScene.tokens[0].triggers[0].clockId, 'clock_alarm', 'source scene is not mutated');
    assert.equal(sourceScene.tokens[0].triggers[1].clockId, 'clock_missing');
});

test('deleting an encounter scene reconciles combatants, ends the encounter, and clears scene selections', () => {
    const deletedScene = {
        id: 'scene_deleted',
        name: 'Vault',
        tokens: [
            { id: 'token_player_old', sourceType: 'player', sourceId: 'player_one' },
            { id: 'token_guard', sourceType: 'npc', sourceId: 'guard_one' },
            { id: 'token_custom' }
        ],
        evidenceNotes: [{ id: 'note_deleted' }],
        clocks: [{ id: 'clock_deleted' }]
    };
    const remainingScene = {
        id: 'scene_remaining',
        name: 'Street',
        tokens: [{ id: 'token_player_new', sourceType: 'player', sourceId: 'player_one' }],
        evidenceNotes: [],
        clocks: []
    };
    const state = {
        combatClockEditorId: 'clock_deleted',
        initiativeDetailState: { entryId: 'entry_guard' },
        localRole: 'dm',
        previewTokenId: 'token_player_old',
        selectedClockId: 'clock_deleted',
        selectedEntryId: 'entry_guard',
        selectedEvidenceNoteId: 'note_deleted',
        selectedTokenId: 'token_guard',
        vttState: {
            activeSceneId: deletedScene.id,
            scenes: [deletedScene, remainingScene],
            initiative: {
                entries: [
                    { id: 'entry_player', linkedTokenId: 'token_player_old', sourceType: 'player', sourceId: 'player_one' },
                    { id: 'entry_guard', linkedTokenId: 'token_guard', sourceType: 'npc', sourceId: 'guard_one' },
                    { id: 'entry_custom', linkedTokenId: 'token_custom' },
                    { id: 'entry_manual', linkedTokenId: '', sourceType: '', sourceId: '' }
                ],
                round: 4,
                activeEntryId: 'entry_guard',
                encounterActive: true,
                sceneId: deletedScene.id,
                startedAt: 12345
            }
        }
    };
    const confirmCalls = [];
    const removedTokenCalls = [];
    const viewCalls = [];
    let mutationOptions = null;
    const actions = scenesActionFactory.create({
        state,
        SCENE_VIEW_SHARED: 'shared',
        buildSceneRecord: () => ({ id: 'unused_fallback' }),
        canDeleteLiveVTTState: () => true,
        confirmSceneDeletion: (scene, impact) => {
            confirmCalls.push({ scene, impact });
            return true;
        },
        getSharedSceneId: (snapshot) => snapshot.activeSceneId,
        getViewedSceneId: (snapshot) => snapshot.activeSceneId,
        removeInitiativeEntriesForToken: (draft, removedToken) => {
            assert.equal(draft.scenes.some((scene) => scene.id === deletedScene.id), false, 'scene is removed before replacement lookup');
            removedTokenCalls.push(removedToken.id);
            const replacement = draft.scenes.flatMap((scene) => scene.tokens || []).find((token) => (
                token.sourceType
                && token.sourceId
                && token.sourceType === removedToken.sourceType
                && token.sourceId === removedToken.sourceId
            ));
            const removedEntryIds = new Set();
            draft.initiative.entries = draft.initiative.entries.flatMap((entry) => {
                const matches = entry.linkedTokenId === removedToken.id || !!(
                    removedToken.sourceType
                    && removedToken.sourceId
                    && entry.sourceType === removedToken.sourceType
                    && entry.sourceId === removedToken.sourceId
                );
                if (!matches) return [entry];
                if (replacement) return [{ ...entry, linkedTokenId: replacement.id }];
                removedEntryIds.add(entry.id);
                return [];
            });
            if (removedEntryIds.has(draft.initiative.activeEntryId)) {
                draft.initiative.activeEntryId = draft.initiative.entries[0] ? draft.initiative.entries[0].id : '';
            }
        },
        setSceneViewPreference: (mode) => viewCalls.push(mode),
        withDraft: (mutator, options) => {
            mutator(state.vttState);
            mutationOptions = options;
        }
    });

    actions.handle({ dataset: {} }, 'delete-scene', deletedScene.id);

    assert.deepEqual(state.vttState.scenes.map((scene) => scene.id), [remainingScene.id]);
    assert.deepEqual(removedTokenCalls, ['token_player_old', 'token_guard', 'token_custom']);
    assert.deepEqual(state.vttState.initiative.entries.map((entry) => entry.id), ['entry_player', 'entry_manual']);
    assert.equal(state.vttState.initiative.entries[0].linkedTokenId, 'token_player_new');
    assert.deepEqual({
        encounterActive: state.vttState.initiative.encounterActive,
        sceneId: state.vttState.initiative.sceneId,
        startedAt: state.vttState.initiative.startedAt,
        round: state.vttState.initiative.round,
        activeEntryId: state.vttState.initiative.activeEntryId
    }, {
        encounterActive: false,
        sceneId: '',
        startedAt: 0,
        round: 1,
        activeEntryId: ''
    });
    assert.equal(state.vttState.activeSceneId, remainingScene.id);
    assert.equal(state.selectedEntryId, '');
    assert.equal(state.initiativeDetailState, null);
    assert.equal(state.selectedTokenId, '');
    assert.equal(state.selectedEvidenceNoteId, '');
    assert.equal(state.selectedClockId, '');
    assert.equal(state.combatClockEditorId, '');
    assert.equal(state.previewTokenId, '');
    assert.deepEqual(confirmCalls.map(({ scene, impact }) => ({ sceneId: scene.id, impact })), [{
        sceneId: deletedScene.id,
        impact: { endsEncounter: true, initiativeEntryCount: 3, tokenCount: 3 }
    }]);
    assert.deepEqual(viewCalls, ['shared']);
    assert.deepEqual(mutationOptions, { fitView: true });
});

test('scene deletion confirmation can cancel without opening a draft mutation', () => {
    const deletedScene = { id: 'scene_deleted', name: 'Vault', tokens: [] };
    const remainingScene = { id: 'scene_remaining', name: 'Street', tokens: [] };
    const state = {
        localRole: 'dm',
        vttState: {
            activeSceneId: deletedScene.id,
            scenes: [deletedScene, remainingScene],
            initiative: { entries: [], encounterActive: false, sceneId: '' }
        }
    };
    let draftCalls = 0;
    const actions = scenesActionFactory.create({
        state,
        canDeleteLiveVTTState: () => true,
        confirmSceneDeletion: () => false,
        getViewedSceneId: () => deletedScene.id,
        withDraft: () => { draftCalls += 1; }
    });

    actions.handle({ dataset: {} }, 'delete-current-scene', '');

    assert.equal(draftCalls, 0);
    assert.deepEqual(state.vttState.scenes, [deletedScene, remainingScene]);
});
