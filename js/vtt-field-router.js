(function (root, factory) {
    'use strict';

    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_FIELD_ROUTER = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const create = (deps = {}) => {
        const state = deps.state;
        const {
            DEFENCE_KEYS,
            EVIDENCE_NOTE_SHAPE_PIN,
            EVIDENCE_NOTE_SHAPE_ZONE,
            MOVE_ACCESS_OPTIONS,
            SCENE_VIEW_LOCAL,
            SCENE_VIEW_SHARED,
            SIDE_OPTIONS,
            alert,
            assignSelectedEntryToToken,
            buildEvidenceNoteFromCellBounds,
            buildMonsterAssignResultsMarkup,
            canEditInitiative,
            clamp,
            clampMapScale,
            findTokenByIdAcrossScenes,
            getActiveScene,
            getDefaultEvidenceNoteHighlightColor,
            getDefaultEvidenceNoteTitle,
            getEntryById,
            getEvidenceNoteCellBounds,
            getEvidenceNoteDisplayTitle,
            getRosterPlayerForRecord,
            getTokenById,
            handleProximityTriggerFieldChange,
            isDM,
            normalizeClockCurrent,
            normalizeClockMax,
            normalizeClockNote,
            normalizeClockTitle,
            normalizeDefences,
            normalizeEvidenceNoteBody,
            normalizeEvidenceNoteCategory,
            normalizeEvidenceNoteShape,
            normalizeEvidenceNoteTitle,
            normalizeGridCoordinate,
            normalizeHexColor,
            normalizeMoodEmoji,
            normalizeMoodLabel,
            normalizeMusicTension,
            normalizeOptionalMusicTension,
            normalizeSceneMusic,
            normalizeSelections,
            normalizeToolSizeCells,
            npcSearchInputEl,
            parseConditions,
            persistRosterPlayerImageUrl,
            render,
            renderNPCRollPopover,
            renderNPCSearchPopover,
            renderPlayerRollMenu,
            renderSceneList,
            renderSheetActionPopover,
            setInitiativeEntryRosterOwner,
            setSceneViewPreference,
            setYouTubeMusicVolume,
            switchVTTCase,
            toNumber,
            updateSceneClock,
            updateSelectedEntry,
            updateSelectedEvidenceNote,
            updateSelectedToken,
            withDraft
        } = deps;
        const {
            HTMLElement,
            HTMLInputElement,
            HTMLSelectElement,
            HTMLTextAreaElement
        } = root;

        const handleNPCSearchInput = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target !== npcSearchInputEl) return;
            state.npcSearchQuery = target.value || '';
            renderNPCSearchPopover();
        };

        const commitSceneMusicField = (target) => {
            if (!target || !(target instanceof HTMLElement)) return false;
            if (!isDM()) return false;
            if (!(target.dataset.sceneMusicField || target.dataset.sceneMusicTrack || target.dataset.sceneMusicTitle)) return false;
            const field = String(target.dataset.sceneMusicField || '').trim();
            const trackLevel = normalizeOptionalMusicTension(target.dataset.sceneMusicTrack);
            const titleLevel = normalizeOptionalMusicTension(target.dataset.sceneMusicTitle);
            return withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                scene.music = normalizeSceneMusic(scene.music);
                if (field === 'tension' && target instanceof HTMLSelectElement) {
                    scene.music.tension = normalizeMusicTension(target.value, scene.music.tension);
                    return;
                }
                if (trackLevel && target instanceof HTMLInputElement) {
                    scene.music.tracks[trackLevel] = String(target.value || '').trim().slice(0, 4000);
                    return;
                }
                if (titleLevel && target instanceof HTMLInputElement) {
                    scene.music.titles[titleLevel] = String(target.value || '').trim().slice(0, 160);
                }
            }, { reason: 'scene-music-edit' });
        };

        const handleSceneMusicEditorInput = (event) => {
            event.stopPropagation();
        };

        const handleSceneMusicEditorChange = (event) => {
            event.stopPropagation();
            commitSceneMusicField(event.target);
        };

        const handleSceneMusicEditorKeyDown = (event) => {
            if (event.key !== 'Enter') return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
            if (!(target.dataset.sceneMusicField || target.dataset.sceneMusicTrack || target.dataset.sceneMusicTitle)) return;
            event.preventDefault();
            event.stopPropagation();
            commitSceneMusicField(target);
        };

        const handleFieldChange = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target instanceof HTMLInputElement && target.dataset.youtubeVolume !== undefined) {
                setYouTubeMusicVolume(target.value);
                return;
            }
            if (target instanceof HTMLInputElement && target.dataset.toolSizeField) {
                const nextSize = normalizeToolSizeCells(target.value, state.localToolState.sizeCells);
                state.localToolState.sizeCells = nextSize;
                return;
            }
            if (target instanceof HTMLInputElement && target.dataset.playerRollSearch !== undefined) {
                state.playerRollSearchQuery = String(target.value || '');
                renderPlayerRollMenu();
                return;
            }
            if (target instanceof HTMLInputElement && target.dataset.tokenMonsterSearch !== undefined) {
                const scope = target.closest('.vtt-inspector-stack');
                const hiddenEl = scope ? scope.querySelector('[data-token-monster-id]') : null;
                const resultsEl = scope ? scope.querySelector('[data-token-monster-results]') : null;
                if (hiddenEl instanceof HTMLInputElement) hiddenEl.value = '';
                if (resultsEl instanceof HTMLElement) {
                    resultsEl.innerHTML = buildMonsterAssignResultsMarkup(target.value || '', '');
                }
                return;
            }
            if (target.dataset.proximityTriggerField !== undefined) {
                if (event.type === 'input' && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
                handleProximityTriggerFieldChange(target);
                return;
            }

            if (event.type === 'input' && target instanceof HTMLInputElement) return;
            if (event.type === 'input' && target instanceof HTMLTextAreaElement) return;

            if (target instanceof HTMLSelectElement && target.dataset.casePicker) {
                if (event.type !== 'change') return;
                if (!isDM()) return;
                const caseId = String(target.value || '').trim();
                switchVTTCase(caseId).then((switched) => {
                    if (!switched) renderSceneList();
                }).catch((err) => {
                    console.warn('VTT case switch failed', err);
                    renderSceneList();
                });
                return;
            }

            if (target instanceof HTMLSelectElement && target.dataset.scenePicker) {
                if (event.type !== 'change') return;
                const sceneId = String(target.value || '').trim();
                const scenes = state.vttState && Array.isArray(state.vttState.scenes) ? state.vttState.scenes : [];
                if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) return;
                if (target.dataset.scenePicker === 'local' && isDM()) {
                    setSceneViewPreference(SCENE_VIEW_LOCAL, sceneId);
                    state.previewTokenId = '';
                    state.fitViewOnNextMapLoad = true;
                    normalizeSelections();
                    render();
                    return;
                }
                setSceneViewPreference(SCENE_VIEW_SHARED);
                withDraft((draft) => {
                    const scene = Array.isArray(draft.scenes)
                        ? draft.scenes.find((entry) => entry.id === sceneId)
                        : null;
                    if (!scene) return;
                    draft.activeSceneId = scene.id;
                    state.previewTokenId = '';
                }, { fitView: true });
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.sheetActionSearch !== undefined) {
                state.sheetActionQuery = String(target.value || '');
                renderSheetActionPopover();
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.npcRollField) {
                if (!state.npcRollState) return;
                const field = target.dataset.npcRollField;
                if (field === 'label') state.npcRollState.label = String(target.value || '').slice(0, 120);
                if (field === 'formula') state.npcRollState.formula = String(target.value || '').slice(0, 120);
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.monsterRollFilter !== undefined) {
                if (!state.npcRollState) return;
                state.npcRollState.monsterRollQuery = String(target.value || '').slice(0, 120);
                renderNPCRollPopover();
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.sceneField) {
                const field = target.dataset.sceneField;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    if (field === 'mapImageUrl') {
                        scene[field] = String(target.value || '').trim();
                        return;
                    }
                    if (field === 'name') {
                        scene[field] = String(target.value || '').trim() || 'Scene';
                        return;
                    }
                    scene[field] = target.value;
                }, { fitView: field === 'mapImageUrl' });
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.sceneScaleField) {
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.mapScale = clampMapScale(toNumber(target.value, 100) / 100, 1);
                });
                return;
            }

            if (target instanceof HTMLInputElement && target.dataset.sceneGridField) {
                const field = target.dataset.sceneGridField;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    scene.grid[field] = Math.round(toNumber(target.value, scene.grid[field] || 0));
                });
                return;
            }

            if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement) && target.dataset.clockField) {
                if (!isDM()) return;
                const field = target.dataset.clockField;
                const clockId = String(target.dataset.id || '').trim();
                updateSceneClock(clockId, (clock) => {
                    if (field === 'title') {
                        clock.title = normalizeClockTitle(target.value, 'Scene Clock');
                        return;
                    }
                    if (field === 'note') {
                        clock.note = normalizeClockNote(target.value);
                        return;
                    }
                    if (field === 'color') {
                        clock.color = normalizeHexColor(target.value, '#f0b357');
                        return;
                    }
                    if (field === 'cadence') {
                        const cadence = String(target.value || '').trim().toLowerCase();
                        clock.cadence = cadence === 'turn' || cadence === 'round' ? cadence : 'manual';
                        return;
                    }
                    if (field === 'max') {
                        const nextMax = normalizeClockMax(target.value, clock.max || 4);
                        clock.max = nextMax;
                        clock.current = normalizeClockCurrent(clock.current, nextMax, 0);
                        return;
                    }
                    if (field === 'current') {
                        clock.current = normalizeClockCurrent(target.value, clock.max || 4, clock.current || 0);
                    }
                });
                return;
            }

            if (state.selectedEntryId && target instanceof HTMLSelectElement && target.dataset.entryTokenLink) {
                if (!canEditInitiative()) return;
                if (event.type !== 'change') return;
                const tokenId = String(target.value || '').trim();
                if (!tokenId) return;
                assignSelectedEntryToToken(tokenId);
                return;
            }

            if (state.selectedEntryId && target instanceof HTMLSelectElement && target.dataset.entryPlayerLink) {
                if (!canEditInitiative()) return;
                if (event.type !== 'change') return;
                setInitiativeEntryRosterOwner(state.selectedEntryId, String(target.value || '').trim());
                return;
            }

            if (state.selectedTokenId && target.dataset.tokenField) {
                const field = target.dataset.tokenField;
                const token = getTokenById(state.selectedTokenId);
                const rosterPlayer = getRosterPlayerForRecord(token);
                if (rosterPlayer && field === 'label') return;
                if (rosterPlayer && field === 'imageUrl') {
                    const updated = persistRosterPlayerImageUrl(token, target.value);
                    if (String(target.value || '').trim() && updated && !updated.imageUrl) {
                        alert('Please provide a valid HTTP or HTTPS image URL or data:image URL.');
                    }
                    return;
                }
                if (field === 'imageUrl' && event.type !== 'change') return;
                updateSelectedToken((token) => {
                    if (field === 'hidden' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                        token.hidden = target.checked;
                        return;
                    }
                    if (field === 'conditions' && target instanceof HTMLTextAreaElement) {
                        token.conditions = parseConditions(target.value);
                        return;
                    }
                    if (field === 'side' && target instanceof HTMLSelectElement) {
                        token.side = SIDE_OPTIONS.includes(target.value) ? target.value : 'neutral';
                        return;
                    }
                    if (field === 'moveAccess' && target instanceof HTMLSelectElement) {
                        token.moveAccess = MOVE_ACCESS_OPTIONS.includes(target.value) ? target.value : 'dm';
                        return;
                    }
                    if (field === 'imageUrl') {
                        token.imageUrl = String(target.value || '').trim();
                        return;
                    }
                    if (field === 'label') {
                        token.label = String(target.value || '').trim() || 'Token';
                        return;
                    }
                    if (field === 'moodEmoji') {
                        token.moodEmoji = normalizeMoodEmoji(target.value);
                        return;
                    }
                    if (field === 'moodLabel') {
                        token.moodLabel = normalizeMoodLabel(target.value);
                        return;
                    }
                    const nextValue = String(target.value || '').trim();
                    if (field === 'w' || field === 'h') {
                        token[field] = nextValue === '' ? 1 : Math.max(1, Math.round(toNumber(nextValue, 1)));
                        return;
                    }
                    token[field] = nextValue === '' ? null : Math.round(toNumber(nextValue, 0));
                });
                return;
            }

            if (state.selectedTokenId && target.dataset.tokenVisionField) {
                const field = target.dataset.tokenVisionField;
                updateSelectedToken((token) => {
                    if (!token.vision || typeof token.vision !== 'object') {
                        token.vision = { enabled: true, facingDeg: 0, arcDeg: 90, baseRangeCells: 6, passivePerception: 10 };
                    }
                    if (field === 'enabled' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                        token.vision.enabled = target.checked;
                        return;
                    }
                    const nextValue = String(target.value || '').trim();
                    if (field === 'arcDeg') {
                        token.vision.arcDeg = nextValue === '' ? 90 : clamp(Math.round(toNumber(nextValue, 90)), 1, 360);
                        return;
                    }
                    if (field === 'baseRangeCells') {
                        token.vision.baseRangeCells = nextValue === '' ? 0 : clamp(Math.round(toNumber(nextValue, 6)), 0, 99);
                        return;
                    }
                    token.vision[field] = nextValue === '' ? 0 : Math.round(toNumber(nextValue, 0));
                });
                return;
            }

            if (state.selectedEvidenceNoteId && target.dataset.noteField) {
                const field = target.dataset.noteField;
                updateSelectedEvidenceNote((note, draft, scene) => {
                    if (field === 'hidden' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                        note.hidden = target.checked;
                        return;
                    }
                    if (field === 'shape' && target instanceof HTMLSelectElement) {
                        const nextShape = normalizeEvidenceNoteShape(target.value, note.shape || EVIDENCE_NOTE_SHAPE_ZONE);
                        note.shape = nextShape;
                        if (nextShape === EVIDENCE_NOTE_SHAPE_PIN) {
                            const bounds = getEvidenceNoteCellBounds(scene, note);
                            const nextNote = buildEvidenceNoteFromCellBounds(scene, {
                                left: bounds ? bounds.left : 0,
                                top: bounds ? bounds.top : 0,
                                widthCells: 1,
                                heightCells: 1
                            }, note);
                            if (nextNote) Object.assign(note, nextNote);
                        }
                        return;
                    }
                    if (field === 'category' && target instanceof HTMLSelectElement) {
                        const previousCategory = normalizeEvidenceNoteCategory(note.category);
                        const nextCategory = normalizeEvidenceNoteCategory(target.value, previousCategory);
                        const previousDefaultTitle = getDefaultEvidenceNoteTitle(previousCategory);
                        const currentTitle = getEvidenceNoteDisplayTitle(note);
                        note.category = nextCategory;
                        if (!String(note.title || '').trim() || currentTitle === previousDefaultTitle) {
                            note.title = getDefaultEvidenceNoteTitle(nextCategory);
                        }
                        note.highlightColor = getDefaultEvidenceNoteHighlightColor(nextCategory);
                        return;
                    }
                    if (field === 'title') {
                        note.title = normalizeEvidenceNoteTitle(target.value, getDefaultEvidenceNoteTitle(note && note.category));
                        return;
                    }
                    if (field === 'body' && target instanceof HTMLTextAreaElement) {
                        note.body = normalizeEvidenceNoteBody(target.value);
                        return;
                    }
                    note.shape = normalizeEvidenceNoteShape(note.shape, EVIDENCE_NOTE_SHAPE_ZONE);
                    const bounds = getEvidenceNoteCellBounds(scene, note) || {
                        left: 0,
                        top: 0,
                        widthCells: 1,
                        heightCells: 1
                    };
                    const rawNextValue = toNumber(target.value, 0);
                    const nextValue = note.shape === EVIDENCE_NOTE_SHAPE_PIN
                        ? normalizeGridCoordinate(rawNextValue, 0)
                        : Math.round(rawNextValue);
                    if (field === 'gridX') bounds.left = Math.max(0, nextValue);
                    else if (field === 'gridY') bounds.top = Math.max(0, nextValue);
                    else if (field === 'cellsWide') bounds.widthCells = note.shape === EVIDENCE_NOTE_SHAPE_PIN ? 1 : Math.max(1, nextValue);
                    else if (field === 'cellsHigh') bounds.heightCells = note.shape === EVIDENCE_NOTE_SHAPE_PIN ? 1 : Math.max(1, nextValue);
                    const nextNote = buildEvidenceNoteFromCellBounds(scene, bounds, note);
                    if (nextNote) Object.assign(note, nextNote);
                });
                return;
            }

            if (state.selectedEntryId && target.dataset.entryField) {
                if (!canEditInitiative()) return;
                const field = target.dataset.entryField;
                const entry = getEntryById(state.selectedEntryId);
                const rosterPlayer = getRosterPlayerForRecord(entry) || getRosterPlayerForRecord(findTokenByIdAcrossScenes(state.vttState, entry && entry.linkedTokenId));
                if (rosterPlayer && field === 'name') return;
                updateSelectedEntry((entry) => {
                    if (field === 'name') {
                        entry.name = String(target.value || '').trim() || 'Combatant';
                        return;
                    }
                    const nextValue = String(target.value || '').trim();
                    entry[field] = nextValue === '' ? null : Math.round(toNumber(nextValue, 0));
                }, { sort: field === 'total' || field === 'tie' });
                return;
            }

            if (state.selectedEntryId && target.dataset.entryDefence) {
                if (!canEditInitiative()) return;
                const key = target.dataset.entryDefence;
                if (!DEFENCE_KEYS.includes(key)) return;
                updateSelectedEntry((entry) => {
                    if (!entry.defences || typeof entry.defences !== 'object') entry.defences = normalizeDefences(null);
                    const nextValue = String(target.value || '').trim();
                    entry.defences[key] = nextValue === '' ? null : clamp(Math.round(toNumber(nextValue, 0)), 0, 99);
                });
            }
        };

        return Object.freeze({
            handleFieldChange,
            handleNPCSearchInput,
            handleSceneMusicEditorChange,
            handleSceneMusicEditorInput,
            handleSceneMusicEditorKeyDown
        });
    };

    return Object.freeze({ create });
}));
