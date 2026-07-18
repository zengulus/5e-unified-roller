(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_ACTIONS_ROLLS = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTIONS = new Set([
            "ask-roll-from-sheet-action",
            "cancel-ask-roll-pick",
            "cancel-ask-roll-ping",
            "cancel-monster-roll-edit",
            "close-dm-unlock",
            "close-initiative-detail",
            "close-npc-roll",
            "close-sheet-actions",
            "close-vtt-panel",
            "confirm-roster-self-link",
            "delete-proximity-trigger",
            "dismiss-proximity-prompt",
            "edit-monster-roll-preset",
            "focus-own-token",
            "open-accent-panel",
            "open-vtt-panel",
            "pause-scene-music",
            "play-scene-music",
            "player-custom-roll",
            "player-roll-from-sheet",
            "quick-sheet-action",
            "reset-monster-roll-override",
            "resolve-proximity-roll",
            "roll-ask-roll-ping",
            "roll-npc-dice",
            "roster-self-dm-mode",
            "roster-self-spectator-mode",
            "run-sheet-action",
            "save-monster-roll-override",
            "seed-proximity-trigger",
            "select-roster-self",
            "select-token-monster-assignment",
            "set-npc-roll-formula",
            "set-npc-roll-preset",
            "set-roll-mode",
            "set-sheet-action-mode",
            "start-ask-roll-pick",
            "stop-scene-music",
            "toggle-player-roll-menu",
            "toggle-player-roll-rail",
            "toggle-role",
            "toggle-spectator-role",
            "toggle-topbar-pin"
    ]);

    const create = (deps = {}) => {
        const state = deps.state;
        const {
            activateTokenSelection,
            addProximityTrigger,
            applyRollModeToD20Formula,
            applyTokenInitiativeRollToTracker,
            askRollFromSheetActionByKey,
            buildMonsterAssignResultsMarkup,
            buildMonsterRollPresets,
            buildSheetActionCatalog,
            canDeleteLiveVTTState,
            canUseSharedPlayerTools,
            cancelAskRollPickMode,
            cancelAskRollPingById,
            closeActiveVTTPanel,
            closeDMUnlockModal,
            closeInitiativeDetail,
            closeNPCRollPopover,
            closeRosterSelfModal,
            closeSheetActionPopover,
            closeViewMenu,
            deleteProximityTrigger,
            dismissActiveProximityPrompt,
            findMonsterById,
            focusViewOnToken,
            getActiveProximityPrompt,
            getActiveScene,
            getAllowedVTTPanel,
            getAskRollRequestLabelForItem,
            getLocalPlayerFocusContext,
            getPlayerRollAnchorPoint,
            getSceneById,
            getSceneMusicSummary,
            getSharedSceneId,
            getTokenById,
            gmParseComplexFormula,
            isDM,
            isPlayer,
            isRollActionGuarded,
            isSpectator,
            linkRosterSelfSelection,
            normalizeRollMode,
            openCustomRollPopover,
            openSheetActionPopover,
            postGMDiscordRoll,
            promptForDMMode,
            queueRollRequest,
            render,
            renderInitiativeDetail,
            renderInitiativeList,
            renderNPCRollPopover,
            renderPlayerRollMenu,
            renderProximityPrompt,
            renderSheetActionPopover,
            renderStage,
            renderTokenInspector,
            renderYouTubeAudioPlayer,
            resolveActiveProximityRoll,
            rollAskRollPingById,
            runSheetActionByKey,
            selectRosterSelfPlayer,
            sendYouTubeMusicCommand,
            setActiveVTTPanel,
            setAskRollPickMode,
            setRolePreference,
            stopYouTubeMusicFrame,
            toggleUIPreference,
            updateMonsterRollOverrideForToken,
            withDraft,
            youtubeAudioPlayerEl
        } = deps;

        const handle = (actionEl, action, id) => {
            if (action === 'play-scene-music') {
                const scene = getSceneById(getSharedSceneId(state.vttState), state.vttState) || getActiveScene();
                const summary = getSceneMusicSummary(scene);
                const playerKey = `${summary.tension}:${summary.videoId || 'empty'}`;
                if (!summary.videoId || String(actionEl.dataset.musicKey || '').trim() !== playerKey) return;
                const wasPaused = state.youtubeMusicState.key === playerKey && state.youtubeMusicState.status === 'paused';
                state.youtubeMusicState = { key: playerKey, status: 'playing' };
                if (wasPaused) sendYouTubeMusicCommand('playVideo');
                if (youtubeAudioPlayerEl) youtubeAudioPlayerEl.dataset.musicKey = '';
                renderYouTubeAudioPlayer(scene);
                return;
            }
            if (action === 'pause-scene-music') {
                const scene = getSceneById(getSharedSceneId(state.vttState), state.vttState) || getActiveScene();
                const summary = getSceneMusicSummary(scene);
                const playerKey = `${summary.tension}:${summary.videoId || 'empty'}`;
                if (state.youtubeMusicState.key !== playerKey || state.youtubeMusicState.status !== 'playing') return;
                sendYouTubeMusicCommand('pauseVideo');
                state.youtubeMusicState = { key: playerKey, status: 'paused' };
                if (youtubeAudioPlayerEl) youtubeAudioPlayerEl.dataset.musicKey = '';
                renderYouTubeAudioPlayer(scene);
                return;
            }
            if (action === 'stop-scene-music') {
                stopYouTubeMusicFrame();
                state.youtubeMusicState = { key: '', status: 'stopped' };
                if (youtubeAudioPlayerEl) youtubeAudioPlayerEl.dataset.musicKey = '';
                const scene = getSceneById(getSharedSceneId(state.vttState), state.vttState) || getActiveScene();
                renderYouTubeAudioPlayer(scene);
                return;
            }

            if (action === 'open-vtt-panel') {
                const panel = String(actionEl.dataset.panel || '').trim();
                const activePanel = getAllowedVTTPanel(state.uiState.activeVttPanel);
                const isDrawerTab = !!actionEl.closest('.vtt-drawer-tabs');
                const isMenuItem = !!actionEl.closest('#vtt-view-menu');
                setActiveVTTPanel(!isDrawerTab && !isMenuItem && activePanel === panel ? '' : panel, {
                    opener: actionEl,
                    focus: !isDrawerTab
                });
                closeViewMenu();
                return;
            }
            if (action === 'close-vtt-panel') {
                closeActiveVTTPanel();
                return;
            }
            if (action === 'open-accent-panel') {
                closeViewMenu();
                setActiveVTTPanel('');
                if (typeof window.triggerAccentPicker === 'function') window.triggerAccentPicker();
                return;
            }

            if (action === 'toggle-role') {
                if (isDM()) {
                    setRolePreference('player');
                } else {
                    promptForDMMode();
                }
                return;
            }
            if (action === 'toggle-spectator-role') {
                setRolePreference(isSpectator() ? 'player' : 'spectator');
                return;
            }
            if (action === 'toggle-topbar-pin') {
                toggleUIPreference('topbarCollapsed');
                return;
            }
            if (action === 'close-dm-unlock') {
                closeDMUnlockModal();
                return;
            }
            if (action === 'select-roster-self') {
                if (!isPlayer()) return;
                selectRosterSelfPlayer(id);
                return;
            }
            if (action === 'confirm-roster-self-link') {
                if (!isPlayer()) return;
                linkRosterSelfSelection();
                return;
            }
            if (action === 'roster-self-dm-mode') {
                closeRosterSelfModal({ restoreFocus: false });
                promptForDMMode();
                return;
            }
            if (action === 'roster-self-spectator-mode') {
                closeRosterSelfModal({ restoreFocus: false });
                setRolePreference('spectator');
                return;
            }
            if (action === 'close-initiative-detail') {
                closeInitiativeDetail({ restoreFocus: true });
                return;
            }
            if (action === 'close-sheet-actions') {
                closeSheetActionPopover();
                return;
            }
            if (action === 'close-npc-roll') {
                closeNPCRollPopover();
                return;
            }
            if (action === 'seed-proximity-trigger') {
                if (!isDM()) return;
                addProximityTrigger(
                    String(actionEl.dataset.ownerKind || '').trim(),
                    String(actionEl.dataset.ownerId || '').trim(),
                    String(actionEl.dataset.seed || 'perception').trim()
                );
                return;
            }
            if (action === 'delete-proximity-trigger') {
                if (!isDM()) return;
                if (!canDeleteLiveVTTState('delete-proximity-trigger')) return;
                deleteProximityTrigger(
                    String(actionEl.dataset.ownerKind || '').trim(),
                    String(actionEl.dataset.ownerId || '').trim(),
                    String(actionEl.dataset.triggerId || '').trim()
                );
                return;
            }
            if (action === 'dismiss-proximity-prompt') {
                if (!isPlayer()) return;
                dismissActiveProximityPrompt();
                return;
            }
            if (action === 'resolve-proximity-roll') {
                if (!isPlayer()) return;
                const activeProximityPrompt = getActiveProximityPrompt();
                if (isRollActionGuarded(`proximity-roll:${activeProximityPrompt && activeProximityPrompt.id || ''}:${activeProximityPrompt && activeProximityPrompt.tokenId || ''}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                resolveActiveProximityRoll();
                return;
            }
            if (action === 'toggle-player-roll-menu') {
                if (!isPlayer()) return;
                state.playerRollMenuOpen = true;
                setActiveVTTPanel('player-rolls');
                render();
                return;
            }
            if (action === 'toggle-player-roll-rail') {
                if (!isPlayer()) return;
                setActiveVTTPanel(state.uiState.activeVttPanel === 'player-rolls' ? '' : 'player-rolls');
                return;
            }
            if (action === 'set-roll-mode') {
                state.localRollMode = normalizeRollMode(actionEl.dataset.rollMode);
                renderPlayerRollMenu();
                renderProximityPrompt();
                return;
            }
            if (action === 'start-ask-roll-pick') {
                if (!isPlayer()) return;
                setAskRollPickMode(true);
                return;
            }
            if (action === 'cancel-ask-roll-pick') {
                if (!isPlayer()) return;
                cancelAskRollPickMode();
                render();
                return;
            }
            if (action === 'player-roll-from-sheet') {
                if (!isPlayer()) return;
                const point = getPlayerRollAnchorPoint();
                openSheetActionPopover(null, point.x, point.y, state.askRollPickMode ? { mode: 'request' } : {});
                render();
                return;
            }
            if (action === 'player-custom-roll') {
                if (!isPlayer()) return;
                if (state.askRollPickMode) {
                    queueRollRequest('other');
                    return;
                }
                const point = getPlayerRollAnchorPoint();
                openCustomRollPopover(null, point.x, point.y);
                render();
                return;
            }
            if (action === 'focus-own-token') {
                if (!isPlayer()) return;
                const context = getLocalPlayerFocusContext();
                if (!context.token) return;
                activateTokenSelection(context.token.id);
                focusViewOnToken(context.token);
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderStage();
                return;
            }
            if (action === 'quick-sheet-action') {
                if (!isPlayer()) return;
                if (isRollActionGuarded(`quick-sheet-action:${id}:${state.askRollPickMode ? 'ask' : 'roll'}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                if (state.askRollPickMode) {
                    const item = buildSheetActionCatalog().find((entry) => entry && entry.key === id);
                    if (item) queueRollRequest(getAskRollRequestLabelForItem(item), { actionKey: item.key });
                    return;
                }
                const point = getPlayerRollAnchorPoint();
                openSheetActionPopover(null, point.x, point.y);
                runSheetActionByKey(id);
                render();
                return;
            }
            if (action === 'ask-roll-from-sheet-action') {
                if (!isPlayer()) return;
                if (isRollActionGuarded(`ask-roll-click:${id}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                askRollFromSheetActionByKey(id);
                render();
                return;
            }
            if (action === 'roll-ask-roll-ping') {
                if (!canUseSharedPlayerTools()) return;
                if (isRollActionGuarded(`ask-ping-click:${id}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                rollAskRollPingById(id);
                return;
            }
            if (action === 'cancel-ask-roll-ping') {
                if (!canUseSharedPlayerTools()) return;
                cancelAskRollPingById(id);
                return;
            }
            if (action === 'set-sheet-action-mode') {
                if (!state.sheetActionState) return;
                state.sheetActionState.mode = String(actionEl.dataset.mode || '').trim() === 'request' ? 'request' : 'roll';
                renderSheetActionPopover();
                return;
            }
            if (action === 'run-sheet-action') {
                if (isRollActionGuarded(`run-sheet-click:${id}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                runSheetActionByKey(id);
                return;
            }
            if (action === 'set-npc-roll-formula') {
                if (!state.npcRollState) return;
                state.npcRollState.formula = String(actionEl.dataset.formula || '').trim() || '1d20';
                state.npcRollState.type = 'check';
                state.npcRollState.detail = '';
                state.npcRollState.presetKey = '';
                state.npcRollState.editingPresetKey = '';
                state.npcRollState.monsterRollQuery = '';
                renderNPCRollPopover();
                return;
            }
            if (action === 'set-npc-roll-preset') {
                if (!state.npcRollState) return;
                state.npcRollState.label = String(actionEl.dataset.label || state.npcRollState.label || 'NPC Roll').trim().slice(0, 120);
                state.npcRollState.formula = String(actionEl.dataset.formula || state.npcRollState.formula || '1d20').trim().slice(0, 120);
                state.npcRollState.type = String(actionEl.dataset.rollType || state.npcRollState.type || 'check').trim().slice(0, 20);
                state.npcRollState.detail = String(actionEl.dataset.detail || '').trim().slice(0, 1000);
                state.npcRollState.presetKey = String(actionEl.dataset.presetKey || '').trim();
                state.npcRollState.editingPresetKey = '';
                renderNPCRollPopover();
                return;
            }
            if (action === 'edit-monster-roll-preset') {
                if (!state.npcRollState) return;
                state.npcRollState.editingPresetKey = String(actionEl.dataset.presetKey || '').trim();
                renderNPCRollPopover();
                return;
            }
            if (action === 'cancel-monster-roll-edit') {
                if (!state.npcRollState) return;
                state.npcRollState.editingPresetKey = '';
                renderNPCRollPopover();
                return;
            }
            if (action === 'save-monster-roll-override') {
                if (!state.npcRollState || !isDM()) return;
                const presetKey = String(actionEl.dataset.presetKey || '').trim();
                const tokenId = String(state.npcRollState.tokenId || '').trim();
                const sourceToken = getTokenById(tokenId);
                const preset = buildMonsterRollPresets(sourceToken).find((entry) => entry && entry.key === presetKey);
                if (!preset) return;
                const scope = actionEl.closest('.vtt-monster-roll-edit');
                const labelEl = scope ? scope.querySelector('[data-monster-roll-edit-field="label"]') : null;
                const formulaEl = scope ? scope.querySelector('[data-monster-roll-edit-field="formula"]') : null;
                const nextLabel = labelEl instanceof HTMLInputElement ? String(labelEl.value || '').trim().slice(0, 120) : '';
                const nextFormula = formulaEl instanceof HTMLInputElement ? String(formulaEl.value || '').trim().slice(0, 120) : '';
                const baseLabel = String(preset.baseLabel || preset.label || '').trim();
                const baseFormula = String(preset.baseFormula || preset.formula || '').trim();
                const resolvedLabel = nextLabel || baseLabel || preset.label;
                const resolvedFormula = nextFormula || baseFormula || preset.formula;
                const override = {
                    label: resolvedLabel,
                    formula: resolvedFormula,
                    type: preset.type || preset.baseType || state.npcRollState.type || 'check',
                    detail: preset.detail || preset.baseDetail || ''
                };
                state.npcRollState.editingPresetKey = '';
                state.npcRollState.presetKey = presetKey;
                state.npcRollState.label = override.label;
                state.npcRollState.formula = override.formula;
                state.npcRollState.type = override.type;
                state.npcRollState.detail = override.detail;
                withDraft((draft) => {
                    updateMonsterRollOverrideForToken(draft, tokenId, presetKey, override);
                });
                return;
            }
            if (action === 'reset-monster-roll-override') {
                if (!state.npcRollState || !isDM()) return;
                const presetKey = String(actionEl.dataset.presetKey || '').trim();
                const tokenId = String(state.npcRollState.tokenId || '').trim();
                const sourceToken = getTokenById(tokenId);
                const preset = buildMonsterRollPresets(sourceToken).find((entry) => entry && entry.key === presetKey);
                if (!preset) return;
                state.npcRollState.editingPresetKey = '';
                state.npcRollState.presetKey = presetKey;
                state.npcRollState.label = preset.baseLabel || preset.label;
                state.npcRollState.formula = preset.baseFormula || preset.formula;
                state.npcRollState.type = preset.type || state.npcRollState.type || 'check';
                state.npcRollState.detail = preset.detail || state.npcRollState.detail || '';
                withDraft((draft) => {
                    updateMonsterRollOverrideForToken(draft, tokenId, presetKey, null);
                });
                return;
            }
            if (action === 'select-token-monster-assignment') {
                if (!isDM()) return;
                const monsterId = String(actionEl.dataset.monsterId || '').trim();
                const monster = findMonsterById(monsterId);
                const scope = actionEl.closest('.vtt-inspector-stack');
                const inputEl = scope ? scope.querySelector('[data-token-monster-search]') : null;
                const hiddenEl = scope ? scope.querySelector('[data-token-monster-id]') : null;
                const resultsEl = scope ? scope.querySelector('[data-token-monster-results]') : null;
                if (inputEl instanceof HTMLInputElement && monster) inputEl.value = monster.name || '';
                if (hiddenEl instanceof HTMLInputElement) hiddenEl.value = monsterId;
                if (resultsEl instanceof HTMLElement) resultsEl.innerHTML = buildMonsterAssignResultsMarkup(monster ? monster.name : '', monsterId);
                return;
            }
            if (action === 'roll-npc-dice') {
                if (!state.npcRollState) return;
                if (isRollActionGuarded(`npc-roll:${state.npcRollState.tokenId || ''}:${state.npcRollState.label || ''}:${state.npcRollState.formula || ''}`, actionEl instanceof HTMLButtonElement ? actionEl : null)) return;
                const rollFormula = applyRollModeToD20Formula(state.npcRollState.formula || '1d20');
                const parsed = gmParseComplexFormula(rollFormula);
                if (!parsed.text) {
                    renderNPCRollPopover({ total: 'Invalid', text: 'Use a formula like 1d20 + 3 or 2d6.' });
                    return;
                }
                const label = String(state.npcRollState.label || state.npcRollState.tokenName || 'NPC').trim() || 'NPC';
                const token = getTokenById(state.npcRollState.tokenId);
                const tokenName = String(token && token.label || state.npcRollState.tokenName || 'NPC').trim() || 'NPC';
                const isCustomRoll = String(state.npcRollState.mode || '').trim().toLowerCase() === 'custom';
                if (!isCustomRoll && String(state.npcRollState.presetKey || '').trim() === 'core:initiative' && token) {
                    applyTokenInitiativeRollToTracker(token, parsed);
                }
                renderNPCRollPopover(parsed);
                postGMDiscordRoll(tokenName, label, parsed.total, parsed.text, {
                    type: state.npcRollState.type || 'check',
                    detail: state.npcRollState.detail || ''
                }).then((sent) => {
                    if (!sent && !isCustomRoll) console.warn('VTT monster/NPC roll Discord post skipped: enable Discord integration in the GM dashboard and save a webhook URL.');
                }).catch((err) => {
                    console.warn('VTT NPC roll Discord post failed', err);
                });
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
