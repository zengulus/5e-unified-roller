(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_ACTIONS_TABLE = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTIONS = new Set([
            "add-scene-clock",
            "assign-token-monster",
            "bust-vtt-cache",
            "bust-vtt-roster-associations",
            "clear-scene-fog",
            "clear-token-monster",
            "clock-step",
            "close-token-inspector",
            "context-custom-roll",
            "context-make-roll",
            "context-note-delete",
            "context-note-duplicate",
            "context-note-inspector",
            "context-note-toggle-hidden",
            "context-npc-search",
            "context-ping",
            "context-preview-token",
            "context-quick-spawn",
            "context-roll-from-sheet",
            "context-roll-stat-block",
            "context-set-tool",
            "context-token-inspector",
            "delete-clock",
            "delete-evidence-note",
            "fit-view",
            "force-vtt-authoritative",
            "open-global-settings",
            "open-global-sync",
            "open-quick-spawn",
            "quick-spawn-all-players",
            "quick-spawn-custom",
            "quick-spawn-evidence-note",
            "quick-spawn-guildless",
            "quick-spawn-npc",
            "quick-spawn-open-npc-search",
            "quick-spawn-player",
            "set-ping-mode",
            "set-tool-mode",
            "toggle-clock-hidden",
            "toggle-evidence-hidden-quick",
            "toggle-grid",
            "toggle-initiative",
            "toggle-inspector-panel",
            "toggle-npc-search",
            "toggle-ruler-mode",
            "toggle-scene-panel",
            "toggle-settings",
            "toggle-spawn-panel",
            "toggle-stealth-mode",
            "toggle-token-hidden-quick",
            "toggle-token-names",
            "toggle-tools-menu",
            "toggle-view-menu",
            "token-adjust-hp",
            "token-apply-condition",
            "token-clear-conditions",
            "token-retry-image",
            "token-set-bloodied",
            "token-set-full-hp",
            "zoom-in",
            "zoom-out",
            "zoom-reset"
    ]);

    const create = (deps = {}) => {
        const state = deps.state;
        const {
            EVIDENCE_NOTE_SHAPE_PIN,
            TOOL_MODE_FOG,
            TOOL_MODE_FOG_REMOVE,
            TOOL_MODE_NAVIGATE,
            TOOL_MODE_NOTE,
            TOOL_MODE_PING,
            TOOL_MODE_RULER,
            applyMonsterStatBlockToToken,
            buildId,
            bustAllVTTRosterAssociations,
            bustVTTLiveCache,
            canDeleteLiveVTTState,
            canUseSharedPlayerTools,
            clearTokenPortraitPreview,
            closeNPCSearch,
            closeQuickSpawnMenu,
            closeStageContextMenu,
            closeTokenInspectorPopover,
            closeViewMenu,
            createEvidenceNoteAtWorldPoint,
            deleteEvidenceNoteById,
            duplicateEvidenceNoteById,
            findMonsterForAssignmentQuery,
            fitViewToWorld,
            forceDMVTTAuthoritative,
            getActiveScene,
            getCanonicalTokenImageUrl,
            getLocalPlayerFocusContext,
            getPingVariantOptions,
            getRosterPlayerForRecord,
            getStageContextWorldPoint,
            getTokenById,
            hasValue,
            isDM,
            isNPCRollTarget,
            isPlayer,
            isSpectator,
            normalizeClockCurrent,
            normalizeClockMax,
            normalizePingVariant,
            normalizeToolMode,
            npcSearchToggleEl,
            openCustomRollPopover,
            openEvidenceNoteInspectorPopover,
            openNPCRollPopover,
            openNPCSearchAt,
            openQuickSpawnMenu,
            openSheetActionPopover,
            openTokenInspectorPopover,
            queueSharedPing,
            render,
            renderNPCSearchPopover,
            renderStage,
            renderTokenInspector,
            renderTokenInspectorPopover,
            renderToolsMenu,
            renderViewMenu,
            reportVTTAdminActionError,
            setActiveVTTPanel,
            setToolMode,
            setZoomAroundStageCenter,
            showTokenPortraitPreview,
            spawnAllPlayersAtWorldPoint,
            spawnTokenFromDescriptor,
            stageEl,
            toImageUrl,
            toNumber,
            toggleUIPreference,
            tokenImageRetryKeys,
            updateSceneClock,
            updateSelectedEvidenceNote,
            updateSelectedToken,
            withDraft
        } = deps;

        const handle = (actionEl, action, id) => {
            if (action === 'context-ping') {
                if (!canUseSharedPlayerTools()) return;
                const scene = getActiveScene();
                const worldPoint = getStageContextWorldPoint();
                const pingOptions = getPingVariantOptions(state.stageContextMenuState);
                closeStageContextMenu();
                if (scene && worldPoint) queueSharedPing(scene, worldPoint, pingOptions);
                render();
                return;
            }
            if (action === 'context-roll-from-sheet') {
                if (!isDM() && !(isPlayer() && canUseSharedPlayerTools())) return;
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                const token = menuState && menuState.tokenId ? getTokenById(menuState.tokenId) : null;
                const localContext = isPlayer() ? getLocalPlayerFocusContext() : null;
                const tokenPlayerId = String(getRosterPlayerForRecord(token) && getRosterPlayerForRecord(token).id || '').trim();
                const isOwnToken = !!(localContext && localContext.playerId && tokenPlayerId && tokenPlayerId === localContext.playerId);
                const rollToken = isDM()
                    ? (token && String(token.sourceType || '').trim().toLowerCase() === 'player' ? token : null)
                    : (isOwnToken ? token : null);
                closeStageContextMenu();
                openSheetActionPopover(rollToken, menuState ? menuState.clientX : window.innerWidth / 2, menuState ? menuState.clientY : window.innerHeight / 2);
                render();
                return;
            }
            if (action === 'context-custom-roll') {
                if (!isDM() && !(isPlayer() && canUseSharedPlayerTools())) return;
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                const token = menuState && menuState.tokenId ? getTokenById(menuState.tokenId) : null;
                const localContext = isPlayer() ? getLocalPlayerFocusContext() : null;
                const tokenPlayerId = String(getRosterPlayerForRecord(token) && getRosterPlayerForRecord(token).id || '').trim();
                const isOwnToken = !!(localContext && localContext.playerId && tokenPlayerId && tokenPlayerId === localContext.playerId);
                const rollToken = isDM() ? token : (isOwnToken ? token : null);
                closeStageContextMenu();
                openCustomRollPopover(rollToken, menuState ? menuState.clientX : window.innerWidth / 2, menuState ? menuState.clientY : window.innerHeight / 2);
                render();
                return;
            }
            if (action === 'context-roll-stat-block' || action === 'context-make-roll') {
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                const token = menuState && menuState.tokenId ? getTokenById(menuState.tokenId) : null;
                closeStageContextMenu();
                if (token && isDM() && isNPCRollTarget(token)) openNPCRollPopover(token, menuState.clientX, menuState.clientY);
                render();
                return;
            }
            if (action === 'context-token-inspector') {
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                closeStageContextMenu();
                if (menuState && menuState.tokenId) openTokenInspectorPopover(menuState.tokenId, menuState.clientX, menuState.clientY);
                render();
                return;
            }
            if (action === 'context-note-inspector') {
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                closeStageContextMenu();
                if (menuState && menuState.noteId) openEvidenceNoteInspectorPopover(menuState.noteId, menuState.clientX, menuState.clientY);
                render();
                return;
            }
            if (action === 'context-note-toggle-hidden') {
                const noteId = state.stageContextMenuState ? String(state.stageContextMenuState.noteId || '').trim() : '';
                closeStageContextMenu();
                if (!noteId || !isDM()) return;
                state.selectedEvidenceNoteId = noteId;
                updateSelectedEvidenceNote((note) => {
                    note.hidden = !note.hidden;
                });
                return;
            }
            if (action === 'context-note-duplicate') {
                const noteId = state.stageContextMenuState ? String(state.stageContextMenuState.noteId || '').trim() : '';
                closeStageContextMenu();
                if (noteId) duplicateEvidenceNoteById(noteId);
                return;
            }
            if (action === 'context-note-delete') {
                const noteId = state.stageContextMenuState ? String(state.stageContextMenuState.noteId || '').trim() : '';
                closeStageContextMenu();
                if (noteId) deleteEvidenceNoteById(noteId);
                return;
            }
            if (action === 'context-preview-token') {
                const tokenId = state.stageContextMenuState ? String(state.stageContextMenuState.tokenId || '').trim() : '';
                closeStageContextMenu();
                if (state.previewTokenId === tokenId) {
                    clearTokenPortraitPreview();
                } else {
                    showTokenPortraitPreview(tokenId);
                }
                render();
                return;
            }
            if (action === 'context-set-tool') {
                const nextMode = normalizeToolMode(actionEl.dataset.toolMode);
                if (isSpectator() && ![TOOL_MODE_NAVIGATE, TOOL_MODE_RULER].includes(nextMode)) return;
                if (nextMode === TOOL_MODE_NOTE && !isDM()) return;
                if ((nextMode === TOOL_MODE_FOG || nextMode === TOOL_MODE_FOG_REMOVE) && !isDM()) return;
                closeStageContextMenu();
                setToolMode(nextMode);
                render();
                return;
            }
            if (action === 'context-quick-spawn') {
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                closeStageContextMenu();
                if (menuState) openQuickSpawnMenu(menuState.clientX, menuState.clientY);
                render();
                return;
            }
            if (action === 'context-npc-search') {
                const menuState = state.stageContextMenuState ? { ...state.stageContextMenuState } : null;
                closeStageContextMenu();
                if (menuState) openNPCSearchAt(menuState.clientX, menuState.clientY, menuState.worldPoint);
                render();
                return;
            }
            if (action === 'toggle-view-menu') {
                state.viewMenuOpen = !state.viewMenuOpen;
                if (state.viewMenuOpen) {
                    state.toolsMenuOpen = false;
                }
                renderViewMenu();
                renderToolsMenu();
                return;
            }
            if (action === 'open-global-sync' || action === 'open-global-settings') {
                const globalMenuButton = document.querySelector(
                    action === 'open-global-sync' ? '.hero-menu-sync' : '.hero-menu-gear'
                );
                closeViewMenu();
                renderViewMenu();
                if (globalMenuButton instanceof HTMLElement) globalMenuButton.click();
                return;
            }
            if (action === 'toggle-tools-menu') {
                setActiveVTTPanel(state.uiState.activeVttPanel === 'dm-tools' ? '' : 'dm-tools');
                state.viewMenuOpen = false;
                renderViewMenu();
                renderToolsMenu();
                return;
            }
            if (action === 'toggle-ruler-mode') {
                setToolMode(state.localToolState.mode === TOOL_MODE_RULER ? TOOL_MODE_NAVIGATE : TOOL_MODE_RULER);
                render();
                return;
            }
            if (action === 'set-ping-mode') {
                if (isSpectator()) return;
                state.askRollPickMode = false;
                state.pendingAskRollRequest = null;
                state.localPingVariant = normalizePingVariant(actionEl.dataset.pingVariant);
                setToolMode(TOOL_MODE_PING);
                render();
                return;
            }
            if (action === 'set-tool-mode') {
                const nextMode = normalizeToolMode(actionEl.dataset.toolMode);
                if (isSpectator() && ![TOOL_MODE_NAVIGATE, TOOL_MODE_RULER].includes(nextMode)) return;
                if (nextMode === TOOL_MODE_NOTE && !isDM()) return;
                if ((nextMode === TOOL_MODE_FOG || nextMode === TOOL_MODE_FOG_REMOVE) && !isDM()) return;
                closeViewMenu();
                setToolMode(nextMode);
                render();
                return;
            }
            if (action === 'open-quick-spawn') {
                if (!isDM() || !stageEl) return;
                setActiveVTTPanel('');
                const rect = stageEl.getBoundingClientRect();
                openQuickSpawnMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return;
            }
            if (action === 'toggle-settings') {
                if (!isDM()) return;
                setActiveVTTPanel(state.uiState.activeVttPanel === 'setup' ? '' : 'setup');
                return;
            }
            if (action === 'toggle-initiative') {
                setActiveVTTPanel(state.uiState.activeVttPanel === 'combat' ? '' : 'combat');
                return;
            }
            if (action === 'toggle-scene-panel') {
                toggleUIPreference('scenePanelCollapsed');
                return;
            }
            if (action === 'toggle-spawn-panel') {
                toggleUIPreference('spawnPanelCollapsed');
                return;
            }
            if (action === 'toggle-inspector-panel') {
                toggleUIPreference('inspectorPanelCollapsed');
                return;
            }
            if (action === 'close-token-inspector') {
                closeTokenInspectorPopover();
                renderTokenInspectorPopover();
                renderTokenInspector();
                return;
            }
            if (action === 'toggle-token-names') {
                toggleUIPreference('showTokenNames');
                return;
            }
            if (action === 'toggle-grid') {
                toggleUIPreference('showGrid');
                return;
            }
            if (action === 'force-vtt-authoritative') {
                forceDMVTTAuthoritative().catch((err) => reportVTTAdminActionError(err, 'Failed to force the DM VTT snapshot.'));
                return;
            }
            if (action === 'bust-vtt-roster-associations') {
                if (!isDM()) return;
                bustAllVTTRosterAssociations();
                return;
            }
            if (action === 'bust-vtt-cache') {
                bustVTTLiveCache().catch((err) => reportVTTAdminActionError(err, 'Failed to bust the VTT cache.'));
                return;
            }
            if (action === 'clear-scene-fog') {
                if (!isDM()) return;
                if (!canDeleteLiveVTTState('clear-scene-fog')) return;
                closeStageContextMenu();
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.fog = [];
                });
                return;
            }
            if (action === 'add-scene-clock') {
                if (!isDM()) return;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    if (!Array.isArray(scene.clocks)) scene.clocks = [];
                    const nextNumber = scene.clocks.length + 1;
                    const clock = {
                        id: buildId('clock'),
                        title: `Clock ${nextNumber}`,
                        current: 0,
                        max: 4,
                        hidden: false,
                        color: '#f0b357',
                        note: ''
                    };
                    scene.clocks.push(clock);
                    state.selectedClockId = clock.id;
                });
                return;
            }
            if (action === 'clock-step') {
                if (!isDM()) return;
                const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
                updateSceneClock(id, (clock) => {
                    const max = normalizeClockMax(clock.max, 4);
                    clock.max = max;
                    clock.current = normalizeClockCurrent(toNumber(clock.current, 0) + delta, max, 0);
                });
                return;
            }
            if (action === 'toggle-clock-hidden') {
                if (!isDM()) return;
                updateSceneClock(id, (clock) => {
                    clock.hidden = !clock.hidden;
                });
                return;
            }
            if (action === 'delete-clock') {
                if (!isDM()) return;
                if (!canDeleteLiveVTTState('delete-clock')) return;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene || !Array.isArray(scene.clocks)) return;
                    scene.clocks = scene.clocks.filter((clock) => String(clock && clock.id || '').trim() !== id);
                    if (state.selectedClockId === id) state.selectedClockId = '';
                });
                return;
            }
            if (action === 'toggle-evidence-hidden-quick') {
                if (!isDM()) return;
                state.selectedEvidenceNoteId = id || state.selectedEvidenceNoteId;
                updateSelectedEvidenceNote((note) => {
                    note.hidden = !note.hidden;
                });
                return;
            }
            if (action === 'delete-evidence-note') {
                if (!isDM()) return;
                if (!canDeleteLiveVTTState('delete-evidence-note')) return;
                deleteEvidenceNoteById(id || state.selectedEvidenceNoteId);
                return;
            }
            if (action === 'token-adjust-hp') {
                state.selectedTokenId = id || state.selectedTokenId;
                const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
                updateSelectedToken((token) => {
                    if (!hasValue(token.hpCurrent) || !Number.isFinite(Number(token.hpCurrent))) return;
                    const currentHp = Math.round(Number(token.hpCurrent));
                    const maxHp = hasValue(token.hpMax) && Number.isFinite(Number(token.hpMax))
                        ? Math.max(0, Math.round(Number(token.hpMax)))
                        : null;
                    const nextHp = Math.max(0, currentHp + delta);
                    token.hpCurrent = maxHp !== null ? Math.min(nextHp, maxHp) : nextHp;
                });
                return;
            }
            if (action === 'token-set-bloodied') {
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    const maxHp = hasValue(token.hpMax) && Number.isFinite(Number(token.hpMax))
                        ? Math.max(0, Math.round(Number(token.hpMax)))
                        : null;
                    if (maxHp === null || maxHp <= 0) return;
                    token.hpCurrent = maxHp <= 1 ? 1 : Math.max(1, Math.floor(maxHp / 2));
                });
                return;
            }
            if (action === 'token-set-full-hp') {
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    const maxHp = hasValue(token.hpMax) && Number.isFinite(Number(token.hpMax))
                        ? Math.max(0, Math.round(Number(token.hpMax)))
                        : null;
                    if (maxHp === null) return;
                    token.hpCurrent = maxHp;
                });
                return;
            }
            if (action === 'toggle-token-hidden-quick') {
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    token.hidden = !token.hidden;
                });
                return;
            }
            if (action === 'token-apply-condition') {
                state.selectedTokenId = id || state.selectedTokenId;
                const conditionName = String(actionEl.dataset.condition || '').trim();
                if (!conditionName) return;
                updateSelectedToken((token) => {
                    if (!Array.isArray(token.conditions)) token.conditions = [];
                    if (token.conditions.some((entry) => String(entry || '').trim().toLowerCase() === conditionName.toLowerCase())) return;
                    token.conditions.push(conditionName);
                    token.conditions = token.conditions.slice(0, 24);
                });
                return;
            }
            if (action === 'token-clear-conditions') {
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    token.conditions = [];
                });
                return;
            }
            if (action === 'assign-token-monster') {
                if (!isDM()) return;
                state.selectedTokenId = id || state.selectedTokenId;
                const scope = actionEl.closest('.vtt-inspector-stack');
                const inputEl = scope ? scope.querySelector('[data-token-monster-search]') : null;
                const hiddenEl = scope ? scope.querySelector('[data-token-monster-id]') : null;
                const query = inputEl instanceof HTMLInputElement ? String(inputEl.value || '').trim() : '';
                const monsterId = hiddenEl instanceof HTMLInputElement ? String(hiddenEl.value || '').trim() : '';
                const monster = findMonsterForAssignmentQuery(query, monsterId);
                if (!monster) return;
                const isChecked = (name) => {
                    const input = scope ? scope.querySelector(`[data-token-monster-option="${name}"]`) : null;
                    return input instanceof HTMLInputElement ? input.checked : false;
                };
                updateSelectedToken((token) => {
                    applyMonsterStatBlockToToken(token, monster, {
                        stats: isChecked('stats'),
                        rename: isChecked('rename'),
                        resize: isChecked('resize')
                    });
                });
                return;
            }
            if (action === 'clear-token-monster') {
                if (!isDM()) return;
                state.selectedTokenId = id || state.selectedTokenId;
                updateSelectedToken((token) => {
                    if (String(token.sourceType || '').trim() === 'monster') {
                        token.sourceType = '';
                        token.sourceId = '';
                    }
                    delete token.monster;
                });
                return;
            }
            if (action === 'token-retry-image') {
                state.selectedTokenId = id || state.selectedTokenId;
                const token = getTokenById(state.selectedTokenId);
                const imageUrl = toImageUrl(actionEl.dataset.imageUrl || getCanonicalTokenImageUrl(token));
                if (imageUrl && window.RTF_MEDIA_CACHE && typeof window.RTF_MEDIA_CACHE.rememberSuccess === 'function') {
                    window.RTF_MEDIA_CACHE.rememberSuccess(imageUrl);
                }
                if (state.selectedTokenId) tokenImageRetryKeys.set(state.selectedTokenId, String(Date.now()));
                renderStage();
                renderTokenInspector();
                return;
            }
            if (action === 'quick-spawn-custom') {
                if (!state.quickSpawnMenuState) return;
                spawnTokenFromDescriptor('custom', '', state.quickSpawnMenuState.worldPoint);
                return;
            }
            if (action === 'quick-spawn-all-players') {
                if (!state.quickSpawnMenuState) return;
                spawnAllPlayersAtWorldPoint(state.quickSpawnMenuState.worldPoint);
                return;
            }
            if (action === 'quick-spawn-guildless') {
                if (!state.quickSpawnMenuState) return;
                spawnTokenFromDescriptor('guildless', '', state.quickSpawnMenuState.worldPoint);
                return;
            }
            if (action === 'quick-spawn-evidence-note') {
                if (!state.quickSpawnMenuState) return;
                createEvidenceNoteAtWorldPoint(state.quickSpawnMenuState.worldPoint, {
                    clientX: state.quickSpawnMenuState.clientX,
                    clientY: state.quickSpawnMenuState.clientY,
                    shape: actionEl.dataset.shape || EVIDENCE_NOTE_SHAPE_PIN
                });
                return;
            }
            if (action === 'quick-spawn-player') {
                if (!state.quickSpawnMenuState) return;
                spawnTokenFromDescriptor('player', id, state.quickSpawnMenuState.worldPoint);
                return;
            }
            if (action === 'quick-spawn-npc') {
                if (!state.quickSpawnMenuState) return;
                spawnTokenFromDescriptor('npc', id, state.quickSpawnMenuState.worldPoint);
                return;
            }
            if (action === 'quick-spawn-open-npc-search') {
                if (!state.quickSpawnMenuState) return;
                const anchorClientX = state.quickSpawnMenuState.clientX;
                const anchorClientY = state.quickSpawnMenuState.clientY;
                const worldPoint = state.quickSpawnMenuState.worldPoint || null;
                closeQuickSpawnMenu();
                openNPCSearchAt(anchorClientX, anchorClientY, worldPoint);
                return;
            }

            if (action === 'zoom-in') {
                setZoomAroundStageCenter(state.localView.zoom + 0.12);
                return;
            }
            if (action === 'zoom-out') {
                setZoomAroundStageCenter(state.localView.zoom - 0.12);
                return;
            }
            if (action === 'zoom-reset') {
                setZoomAroundStageCenter(1);
                return;
            }
            if (action === 'fit-view') {
                fitViewToWorld();
                return;
            }
            if (action === 'toggle-stealth-mode') {
                if (!isDM()) return;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.stealthMode = !scene.stealthMode;
                });
                return;
            }

            if (action === 'toggle-npc-search') {
                if (!isDM()) return;
                if (state.npcSearchOpen) {
                    closeNPCSearch();
                    renderNPCSearchPopover();
                    return;
                }
                const rect = npcSearchToggleEl ? npcSearchToggleEl.getBoundingClientRect() : null;
                openNPCSearchAt(
                    rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                    rect ? rect.bottom : window.innerHeight / 2,
                    null
                );
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
