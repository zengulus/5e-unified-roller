(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_ACTIONS_SELECTION = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTIONS = new Set([
            "add-visible-tokens-to-initiative",
            "add-token-to-initiative",
            "assign-entry-selected-token",
            "clear-entry-roster-owner",
            "clone-token",
            "delete-token",
            "edit-entry",
            "move-entry-down",
            "move-entry-up",
            "next-turn",
            "prev-turn",
            "remove-entry",
            "reset-initiative-round",
            "select-evidence-note",
            "select-entry",
            "select-token",
            "set-token-size",
            "toggle-concentration",
            "toggle-reaction",
            "start-encounter",
            "end-encounter"
    ]);

    const create = (deps = {}) => {
        const state = deps.state;
        const {
            activateEvidenceNoteSelection,
            activateTokenSelection,
            addVisibleTokensToInitiative,
            addTokenToInitiative,
            advanceTurn,
            assignSelectedEntryToToken,
            canDeleteLiveVTTState,
            cloneTokenById,
            endEncounter,
            focusViewOnToken,
            getActiveScene,
            isDM,
            openInitiativeDetail,
            removeEntry,
            removeInitiativeEntriesForToken,
            renderInitiativeDetail,
            renderInitiativeList,
            renderStage,
            renderTokenInspector,
            reorderEntry,
            resetInitiativeToRoundOne,
            setInitiativeEntryRosterOwner,
            showTokenPortraitPreview,
            startEncounter,
            syncTokenSelectionFromEntry,
            toNumber,
            updateSelectedEntry,
            updateSelectedToken,
            withDraft
        } = deps;

        const handle = (actionEl, action, id) => {
            if (action === 'select-token') {
                const token = activateTokenSelection(id);
                const suppressPreview = token
                    && String(token.id || '').trim() === state.suppressedTokenPreviewClickId
                    && Date.now() <= state.suppressedTokenPreviewClickUntil;
                if (token && !suppressPreview) showTokenPortraitPreview(token.id);
                if (suppressPreview) {
                    state.suppressedTokenPreviewClickId = '';
                    state.suppressedTokenPreviewClickUntil = 0;
                }
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderStage();
                return;
            }

            if (action === 'delete-token') {
                if (!canDeleteLiveVTTState('delete-token')) return;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene || !Array.isArray(scene.tokens)) return;
                    const removedToken = scene.tokens.find((token) => token.id === id);
                    if (!removedToken) return;
                    scene.tokens = scene.tokens.filter((token) => token.id !== id);
                    removeInitiativeEntriesForToken(draft, removedToken);
                    if (state.selectedTokenId === id) state.selectedTokenId = '';
                    if (state.previewTokenId === id) state.previewTokenId = '';
                });
                return;
            }

            if (action === 'clone-token') {
                cloneTokenById(id || state.selectedTokenId);
                return;
            }

            if (action === 'set-token-size') {
                const size = Math.max(1, Math.round(toNumber(actionEl.dataset.size, 1)));
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    token.w = size;
                    token.h = size;
                });
                return;
            }

            if (action === 'add-token-to-initiative') {
                addTokenToInitiative(id || state.selectedTokenId);
                return;
            }

            if (action === 'add-visible-tokens-to-initiative') {
                addVisibleTokensToInitiative();
                return;
            }

            if (action === 'start-encounter') {
                startEncounter();
                return;
            }

            if (action === 'end-encounter') {
                endEncounter();
                return;
            }

            if (action === 'prev-turn') {
                advanceTurn(-1);
                return;
            }

            if (action === 'next-turn') {
                advanceTurn(1);
                return;
            }

            if (action === 'reset-initiative-round') {
                resetInitiativeToRoundOne();
                return;
            }

            if (action === 'select-entry') {
                state.selectedEntryId = id;
                state.selectedEvidenceNoteId = '';
                if (state.initiativeDetailState && state.initiativeDetailState.entryId !== id) {
                    state.initiativeDetailState = null;
                }
                const linkedToken = typeof syncTokenSelectionFromEntry === 'function'
                    ? syncTokenSelectionFromEntry(id)
                    : null;
                if (linkedToken && typeof focusViewOnToken === 'function') focusViewOnToken(linkedToken);
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderStage();
                return;
            }

            if (action === 'select-evidence-note') {
                if (typeof activateEvidenceNoteSelection !== 'function' || !activateEvidenceNoteSelection(id)) return;
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderStage();
                return;
            }

            if (action === 'edit-entry') {
                if (!isDM()) return;
                state.selectedEntryId = id || state.selectedEntryId;
                if (!state.selectedEntryId) return;
                const rect = actionEl.getBoundingClientRect ? actionEl.getBoundingClientRect() : null;
                openInitiativeDetail(
                    state.selectedEntryId,
                    rect ? Math.round(rect.right) : window.innerWidth / 2,
                    rect ? Math.round(rect.top) : window.innerHeight / 2
                );
                renderInitiativeList();
                renderInitiativeDetail();
                return;
            }

            if (action === 'remove-entry') {
                removeEntry(id);
                return;
            }

            if (action === 'move-entry-up') {
                reorderEntry(id, -1);
                return;
            }

            if (action === 'move-entry-down') {
                reorderEntry(id, 1);
                return;
            }

            if (action === 'toggle-reaction') {
                state.selectedEntryId = id || state.selectedEntryId;
                updateSelectedEntry((entry) => {
                    entry.reactionUsed = !entry.reactionUsed;
                });
                return;
            }

            if (action === 'toggle-concentration') {
                state.selectedEntryId = id || state.selectedEntryId;
                updateSelectedEntry((entry) => {
                    entry.concentrating = !entry.concentrating;
                });
                return;
            }

            if (action === 'assign-entry-selected-token') {
                state.selectedEntryId = id || state.selectedEntryId;
                if (!state.selectedEntryId || !state.selectedTokenId) return;
                assignSelectedEntryToToken(state.selectedTokenId);
                return;
            }

            if (action === 'clear-entry-roster-owner') {
                state.selectedEntryId = id || state.selectedEntryId;
                if (!state.selectedEntryId) return;
                setInitiativeEntryRosterOwner(state.selectedEntryId, '');
            }
        };

        return Object.freeze({
            handle,
            handles: (action) => ACTIONS.has(action)
        });
    };

    return Object.freeze({ create });
}));
