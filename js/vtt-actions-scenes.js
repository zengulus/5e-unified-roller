(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_ACTIONS_SCENES = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTIONS = new Set([
            "add-custom-token",
            "clone-current-scene",
            "create-scene",
            "delete-current-scene",
            "delete-scene",
            "duplicate-scene",
            "nudge-grid",
            "reset-grid-offset",
            "show-scene-everyone",
            "spawn-monster",
            "spawn-npc",
            "spawn-player",
            "step-map-scale",
            "view-scene-local"
    ]);

    const create = (deps = {}) => {
        const state = deps.state;
        const {
            SCENE_VIEW_LOCAL,
            SCENE_VIEW_SHARED,
            buildSceneRecord,
            canDeleteLiveVTTState,
            clampMapScale,
            confirmSceneDeletion,
            getActiveScene,
            getContextSpawnWorldPoint,
            getSharedSceneId,
            getViewedSceneId,
            isDM,
            normalizeSelections,
            openQuickSpawnMenu,
            removeInitiativeEntriesForToken,
            render,
            setSceneViewPreference,
            spawnTokenFromDescriptor,
            stageEl,
            toNumber,
            withDraft
        } = deps;

        const getSceneDeletionImpact = (snapshot, scene) => {
            const initiative = snapshot && snapshot.initiative && typeof snapshot.initiative === 'object'
                ? snapshot.initiative
                : {};
            const sceneId = String(scene && scene.id || '').trim();
            const tokens = Array.isArray(scene && scene.tokens) ? scene.tokens : [];
            const tokenIds = new Set(tokens.map((token) => String(token && token.id || '').trim()).filter(Boolean));
            const sourceKeys = new Set(tokens.map((token) => {
                const sourceType = String(token && token.sourceType || '').trim();
                const sourceId = String(token && token.sourceId || '').trim();
                return sourceType && sourceId ? `${sourceType}\u0000${sourceId}` : '';
            }).filter(Boolean));
            const entries = Array.isArray(initiative.entries) ? initiative.entries : [];
            const initiativeEntryCount = entries.filter((entry) => {
                const linkedTokenId = String(entry && entry.linkedTokenId || '').trim();
                if (linkedTokenId && tokenIds.has(linkedTokenId)) return true;
                const sourceType = String(entry && entry.sourceType || '').trim();
                const sourceId = String(entry && entry.sourceId || '').trim();
                return !!(sourceType && sourceId && sourceKeys.has(`${sourceType}\u0000${sourceId}`));
            }).length;
            return {
                endsEncounter: !!(
                    initiative.encounterActive
                    && sceneId
                    && String(initiative.sceneId || '').trim() === sceneId
                ),
                initiativeEntryCount,
                tokenCount: tokens.length
            };
        };

        const endEncounterScopedToDeletedScene = (draft, sceneId) => {
            const initiative = draft && draft.initiative && typeof draft.initiative === 'object'
                ? draft.initiative
                : null;
            const targetSceneId = String(sceneId || '').trim();
            if (!initiative || !targetSceneId || String(initiative.sceneId || '').trim() !== targetSceneId) return false;
            const endedActiveEncounter = !!initiative.encounterActive;
            initiative.encounterActive = false;
            initiative.sceneId = '';
            initiative.startedAt = 0;
            if (endedActiveEncounter) {
                initiative.activeEntryId = '';
                initiative.round = 1;
            }
            return endedActiveEncounter;
        };

        const cleanDeletedSceneSelections = (draft, removedScene, endedActiveEncounter) => {
            const removedTokenIds = new Set((Array.isArray(removedScene && removedScene.tokens) ? removedScene.tokens : [])
                .map((token) => String(token && token.id || '').trim()).filter(Boolean));
            const removedNoteIds = new Set((Array.isArray(removedScene && removedScene.evidenceNotes) ? removedScene.evidenceNotes : [])
                .map((note) => String(note && note.id || '').trim()).filter(Boolean));
            const removedClockIds = new Set((Array.isArray(removedScene && removedScene.clocks) ? removedScene.clocks : [])
                .map((clock) => String(clock && clock.id || '').trim()).filter(Boolean));
            if (removedTokenIds.has(String(state.selectedTokenId || '').trim())) state.selectedTokenId = '';
            if (removedNoteIds.has(String(state.selectedEvidenceNoteId || '').trim())) state.selectedEvidenceNoteId = '';
            if (removedClockIds.has(String(state.selectedClockId || '').trim())) state.selectedClockId = '';
            if (removedClockIds.has(String(state.combatClockEditorId || '').trim())) state.combatClockEditorId = '';

            const initiative = draft && draft.initiative && typeof draft.initiative === 'object' ? draft.initiative : {};
            const entryIds = new Set((Array.isArray(initiative.entries) ? initiative.entries : [])
                .map((entry) => String(entry && entry.id || '').trim()).filter(Boolean));
            if (endedActiveEncounter) {
                state.selectedEntryId = '';
                state.initiativeDetailState = null;
                return;
            }
            if (!entryIds.has(String(state.selectedEntryId || '').trim())) {
                const activeEntryId = String(initiative.activeEntryId || '').trim();
                state.selectedEntryId = entryIds.has(activeEntryId) ? activeEntryId : '';
            }
            const detailEntryId = String(state.initiativeDetailState && state.initiativeDetailState.entryId || '').trim();
            if (detailEntryId && !entryIds.has(detailEntryId)) state.initiativeDetailState = null;
        };

        const deleteSceneById = (targetSceneId, reason) => {
            if (!canDeleteLiveVTTState(reason)) return;
            const cleanSceneId = String(targetSceneId || '').trim();
            const currentScenes = Array.isArray(state.vttState && state.vttState.scenes) ? state.vttState.scenes : [];
            if (!cleanSceneId || currentScenes.length <= 1) return;
            const currentScene = currentScenes.find((scene) => String(scene && scene.id || '').trim() === cleanSceneId);
            if (!currentScene) return;
            const deletionImpact = getSceneDeletionImpact(state.vttState, currentScene);
            if (typeof confirmSceneDeletion === 'function' && !confirmSceneDeletion(currentScene, deletionImpact)) return;

            const viewedSceneId = getViewedSceneId(state.vttState, state.localRole);
            const sharedSceneId = getSharedSceneId(state.vttState);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes) || draft.scenes.length <= 1) return;
                const idx = draft.scenes.findIndex((entry) => String(entry && entry.id || '').trim() === cleanSceneId);
                if (idx < 0) return;
                const removedScene = draft.scenes[idx];
                const wasActive = draft.activeSceneId === cleanSceneId;
                const wasViewed = viewedSceneId === cleanSceneId;
                draft.scenes.splice(idx, 1);
                if (typeof removeInitiativeEntriesForToken === 'function') {
                    (Array.isArray(removedScene && removedScene.tokens) ? removedScene.tokens : []).forEach((token) => {
                        removeInitiativeEntriesForToken(draft, token);
                    });
                }
                const endedActiveEncounter = endEncounterScopedToDeletedScene(draft, cleanSceneId);
                cleanDeletedSceneSelections(draft, removedScene, endedActiveEncounter);
                if (!draft.scenes.length) {
                    const nextScene = buildSceneRecord(draft.scenes);
                    draft.scenes.push(nextScene);
                }
                if (wasActive) {
                    const fallbackScene = draft.scenes[Math.max(0, idx - 1)] || draft.scenes[0];
                    draft.activeSceneId = fallbackScene ? fallbackScene.id : '';
                }
                if (wasViewed || wasActive || cleanSceneId === sharedSceneId) {
                    setSceneViewPreference(SCENE_VIEW_SHARED);
                }
                state.previewTokenId = '';
            }, { fitView: true });
        };

        const handle = (actionEl, action, id) => {
            if (action === 'clone-current-scene') {
                const sourceScene = getActiveScene(state.vttState);
                if (!sourceScene) return;
                const nextScene = buildSceneRecord(state.vttState && Array.isArray(state.vttState.scenes) ? state.vttState.scenes : [], sourceScene);
                withDraft((draft) => {
                    if (!Array.isArray(draft.scenes)) draft.scenes = [];
                    draft.scenes.push(nextScene);
                    if (isDM()) setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
                    else draft.activeSceneId = nextScene.id;
                    state.previewTokenId = '';
                }, { fitView: true });
                return;
            }

            if (action === 'delete-current-scene') {
                const targetSceneId = getViewedSceneId(state.vttState, state.localRole);
                deleteSceneById(targetSceneId, 'delete-current-scene');
                return;
            }

            if (action === 'create-scene') {
                const nextScene = buildSceneRecord(state.vttState && Array.isArray(state.vttState.scenes) ? state.vttState.scenes : []);
                withDraft((draft) => {
                    if (!Array.isArray(draft.scenes)) draft.scenes = [];
                    draft.scenes.push(nextScene);
                    if (isDM()) setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
                    else draft.activeSceneId = nextScene.id;
                    state.previewTokenId = '';
                }, { fitView: true });
                return;
            }

            if (action === 'view-scene-local') {
                const scene = Array.isArray(state.vttState && state.vttState.scenes)
                    ? state.vttState.scenes.find((entry) => entry.id === id)
                    : null;
                if (!scene) return;
                setSceneViewPreference(SCENE_VIEW_LOCAL, scene.id);
                state.previewTokenId = '';
                state.fitViewOnNextMapLoad = true;
                normalizeSelections();
                render();
                return;
            }

            if (action === 'show-scene-everyone') {
                setSceneViewPreference(SCENE_VIEW_SHARED);
                withDraft((draft) => {
                    const scene = Array.isArray(draft.scenes)
                        ? draft.scenes.find((entry) => entry.id === id)
                        : null;
                    if (!scene) return;
                    draft.activeSceneId = scene.id;
                    state.previewTokenId = '';
                }, { fitView: true });
                return;
            }

            if (action === 'duplicate-scene') {
                const sourceScene = Array.isArray(state.vttState && state.vttState.scenes)
                    ? state.vttState.scenes.find((entry) => entry.id === id) || getActiveScene(state.vttState)
                    : null;
                const nextScene = buildSceneRecord(state.vttState && Array.isArray(state.vttState.scenes) ? state.vttState.scenes : [], sourceScene);
                withDraft((draft) => {
                    if (!Array.isArray(draft.scenes)) draft.scenes = [];
                    draft.scenes.push(nextScene);
                    if (isDM()) setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
                    else draft.activeSceneId = nextScene.id;
                    state.previewTokenId = '';
                }, { fitView: true });
                return;
            }

            if (action === 'delete-scene') {
                deleteSceneById(id, 'delete-scene');
                return;
            }

            if (action === 'nudge-grid') {
                const axis = actionEl.dataset.axis === 'y' ? 'offsetY' : 'offsetX';
                const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.grid[axis] = Math.round(toNumber(scene.grid[axis], 0) + delta);
                });
                return;
            }

            if (action === 'step-map-scale') {
                const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.mapScale = clampMapScale((toNumber(scene.mapScale, 1) * 100 + delta) / 100, 1);
                });
                return;
            }

            if (action === 'reset-grid-offset') {
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.grid.offsetX = 0;
                    scene.grid.offsetY = 0;
                });
                return;
            }

            if (action === 'add-custom-token') {
                if (!stageEl) return;
                const rect = stageEl.getBoundingClientRect();
                openQuickSpawnMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, {
                    focus: true,
                    returnFocusEl: actionEl
                });
                return;
            }

            if (action === 'spawn-player') {
                spawnTokenFromDescriptor('player', id, getContextSpawnWorldPoint());
                return;
            }

            if (action === 'spawn-npc') {
                spawnTokenFromDescriptor('npc', id, getContextSpawnWorldPoint());
                return;
            }

            if (action === 'spawn-monster') {
                spawnTokenFromDescriptor('monster', id, getContextSpawnWorldPoint());
                return;
            }

        };

        return Object.freeze({
            handle,
            handles: (action) => ACTIONS.has(action)
        });
    };

    return Object.freeze({ create });
}));
