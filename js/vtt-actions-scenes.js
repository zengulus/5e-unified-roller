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
            getActiveScene,
            getContextSpawnWorldPoint,
            getSharedSceneId,
            getViewedSceneId,
            isDM,
            normalizeSelections,
            openQuickSpawnMenu,
            render,
            setSceneViewPreference,
            spawnTokenFromDescriptor,
            stageEl,
            toNumber,
            withDraft
        } = deps;

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
                if (!canDeleteLiveVTTState('delete-current-scene')) return;
                const targetSceneId = getViewedSceneId(state.vttState, state.localRole);
                if (!targetSceneId) return;
                const viewedSceneId = getViewedSceneId(state.vttState, state.localRole);
                const sharedSceneId = getSharedSceneId(state.vttState);
                withDraft((draft) => {
                    if (!Array.isArray(draft.scenes) || draft.scenes.length <= 1) return;
                    const idx = draft.scenes.findIndex((entry) => entry.id === targetSceneId);
                    if (idx < 0) return;
                    const wasActive = draft.activeSceneId === targetSceneId;
                    const wasViewed = viewedSceneId === targetSceneId;
                    draft.scenes.splice(idx, 1);
                    if (!draft.scenes.length) {
                        const nextScene = buildSceneRecord(draft.scenes);
                        draft.scenes.push(nextScene);
                    }
                    if (wasActive) {
                        const fallbackScene = draft.scenes[Math.max(0, idx - 1)] || draft.scenes[0];
                        draft.activeSceneId = fallbackScene ? fallbackScene.id : '';
                    }
                    if (wasViewed || wasActive || targetSceneId === sharedSceneId) {
                        setSceneViewPreference(SCENE_VIEW_SHARED);
                    }
                    state.previewTokenId = '';
                }, { fitView: true });
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
                if (!canDeleteLiveVTTState('delete-scene')) return;
                const viewedSceneId = getViewedSceneId(state.vttState, state.localRole);
                const sharedSceneId = getSharedSceneId(state.vttState);
                withDraft((draft) => {
                    if (!Array.isArray(draft.scenes) || draft.scenes.length <= 1) return;
                    const idx = draft.scenes.findIndex((entry) => entry.id === id);
                    if (idx < 0) return;
                    const wasActive = draft.activeSceneId === id;
                    const wasViewed = viewedSceneId === id;
                    draft.scenes.splice(idx, 1);
                    if (!draft.scenes.length) {
                        const nextScene = buildSceneRecord(draft.scenes);
                        draft.scenes.push(nextScene);
                    }
                    if (wasActive) {
                        const fallbackScene = draft.scenes[Math.max(0, idx - 1)] || draft.scenes[0];
                        draft.activeSceneId = fallbackScene ? fallbackScene.id : '';
                    }
                    if (wasViewed || wasActive || id === sharedSceneId) {
                        setSceneViewPreference(SCENE_VIEW_SHARED);
                    }
                    state.previewTokenId = '';
                }, { fitView: true });
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
