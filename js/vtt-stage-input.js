(function (root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.RTF_VTT_STAGE_INPUT = api;
}(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
    'use strict';

    const create = (deps) => {
        if (!deps || typeof deps !== 'object' || !deps.runtime || !deps.api || !deps.dom) {
            throw new TypeError('RTF_VTT_STAGE_INPUT.create requires runtime, api, and dom dependencies.');
        }

        const runtime = deps.runtime;
        const {
            PING_VARIANT_OPTIONS,
            activateEvidenceNoteSelection,
            activateTokenSelection,
            addFogRevealBurst,
            applyFogMaskMutation,
            applyPendingRemoteVTTSnapshot,
            applyWorldTransform,
            beginSpawnDrag,
            buildAreaTemplate,
            buildEvidenceNoteFromWorldPoints,
            buildFogMaskFromWorldPoints,
            buildRemoteTokenTweenKey,
            canMutateLiveVTTState,
            canRoleMoveToken,
            canUseSharedPlayerTools,
            cancelAskRollPickMode,
            clampZoom,
            clearSpawnDrag,
            clearTemplatePlacementState,
            clearTokenPortraitPreview,
            clearTransientDrawerState,
            closeActiveVTTPanel,
            closeDMUnlockModal,
            closeInitiativeDetail,
            closeNPCRollPopover,
            closeNPCSearch,
            closeNavMenu,
            closeQuickSpawnMenu,
            closeSheetActionPopover,
            closeStageContextMenu,
            closeTokenInspectorPopover,
            closeToolsMenu,
            closeViewMenu,
            getActiveScene,
            getEvidenceNoteById,
            getLocalPlayerFocusContext,
            getPingVariantOptions,
            getSceneCellPx,
            getTemplateAngleFromWorldPoint,
            getTemplateById,
            getTokenById,
            getTokenCenterInCells,
            isClientPointInsideStage,
            isDM,
            isDMUnlockModalOpen,
            isEvidenceNotePin,
            isRosterSelfModalOpen,
            markTokenVisualEffect,
            moveSelectedTokenByCells,
            normalizeAngleDeg,
            normalizeTokenCoordinate,
            openEvidenceNoteInspectorPopover,
            openInitiativeDetail,
            openStageContextMenu,
            openTokenInspectorPopover,
            queueSharedPing,
            queueSharedTransientTemplate,
            rememberRecentLocalDragDrop,
            remoteTokenTweens,
            render,
            renderInitiativeDetail,
            renderInitiativeList,
            renderNPCRollPopover,
            renderSheetActionPopover,
            renderSpawnGhost,
            renderStage,
            renderStageContextMenu,
            renderTokenInspector,
            renderTokenInspectorPopover,
            renderToolsMenu,
            scaleForZoom,
            screenToWorld,
            setToolMode,
            setZoomAtPoint,
            showTokenPortraitPreview,
            snapTokenToGrid,
            snapWorldPointToTemplateAnchor,
            spawnTokenFromDescriptor,
            suppressLocalDragTween,
            syncDraggedState,
            toNumber,
            withDraft
        } = deps.api;
        const { body, initiativeListEl, noteLayerEl, stageEl } = deps.dom;
        const {
            STAGE_TOOL_DOUBLE_PRESS_PX,
            TEMPLATE_HOLD_PERSIST_MS,
            TEMPLATE_KIND_CIRCLE,
            TEMPLATE_KIND_CONE,
            TOKEN_CLICK_MOVE_PX,
            TOKEN_DOUBLE_CLICK_MS,
            TOKEN_DROP_PULSE_MS,
            TOOL_MODE_CIRCLE,
            TOOL_MODE_CONE,
            TOOL_MODE_FOG,
            TOOL_MODE_FOG_REMOVE,
            TOOL_MODE_NAVIGATE,
            TOOL_MODE_NOTE,
            TOOL_MODE_PING,
            TOOL_MODE_RULER,
            TOUCH_CONTEXT_HOLD_MS,
            TOUCH_CONTEXT_MOVE_PX
        } = deps.config;

        const window = root;
        const document = root.document;
        const Element = root.Element;
        const Node = root.Node;
        const HTMLElement = root.HTMLElement;
        const HTMLInputElement = root.HTMLInputElement;
        const HTMLTextAreaElement = root.HTMLTextAreaElement;
        const HTMLSelectElement = root.HTMLSelectElement;
        const CSS = root.CSS;

        let lastTokenPointerDownState = null;
        let lastEvidenceNotePointerDownState = null;
        let pendingTouchContextState = null;
        let interactionRenderFrame = 0;

        const scheduleInteractionRender = () => {
            if (interactionRenderFrame) return;
            if (typeof window.requestAnimationFrame !== 'function') {
                renderStage();
                return;
            }
            interactionRenderFrame = window.requestAnimationFrame(() => {
                interactionRenderFrame = 0;
                renderStage();
            });
        };

        const cancelInteractionRender = () => {
            if (!interactionRenderFrame) return;
            if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(interactionRenderFrame);
            interactionRenderFrame = 0;
        };

        const getEventTargetElement = (event) => {
            const target = event && event.target;
            if (target instanceof Element) return target;
            if (target instanceof Node) return target.parentElement;
            return null;
        };
        const getEvidenceNoteElementAtClientPoint = (clientX, clientY, target = null) => {
            if (target instanceof Element) {
                const directMatch = target.closest('.vtt-map-note');
                if (directMatch) return directMatch;
            }
            if (typeof document.elementsFromPoint !== 'function') return null;
            const hitElements = document.elementsFromPoint(clientX, clientY);
            for (const hitEl of hitElements) {
                if (!(hitEl instanceof Element)) continue;
                const noteEl = hitEl.closest('.vtt-map-note');
                if (noteEl) return noteEl;
            }
            return null;
        };
        const getTokenElementAtClientPoint = (clientX, clientY, target = null) => {
            if (target instanceof Element) {
                const directMatch = target.closest('.vtt-token');
                if (directMatch) return directMatch;
            }
            if (typeof document.elementsFromPoint !== 'function') return null;
            const hitElements = document.elementsFromPoint(clientX, clientY);
            for (const hitEl of hitElements) {
                if (!(hitEl instanceof Element)) continue;
                const tokenEl = hitEl.closest('.vtt-token');
                if (tokenEl) return tokenEl;
            }
            return null;
        };
        const getTemplateElementAtClientPoint = (clientX, clientY, target = null) => {
            if (target instanceof Element) {
                const directMatch = target.closest('.vtt-area-template');
                if (directMatch) return directMatch;
            }
            if (typeof document.elementsFromPoint !== 'function') return null;
            const hitElements = document.elementsFromPoint(clientX, clientY);
            for (const hitEl of hitElements) {
                if (!(hitEl instanceof Element)) continue;
                const templateEl = hitEl.closest('.vtt-area-template');
                if (templateEl) return templateEl;
            }
            return null;
        };
        const getVisionConeRotateHandleElementAtClientPoint = (clientX, clientY, target = null) => {
            if (target instanceof Element) {
                const directMatch = target.closest('.vtt-vision-cone-rotate-handle');
                if (directMatch) return directMatch;
            }
            if (typeof document.elementsFromPoint !== 'function') return null;
            const hitElements = document.elementsFromPoint(clientX, clientY);
            for (const hitEl of hitElements) {
                if (!(hitEl instanceof Element)) continue;
                const handleEl = hitEl.closest('.vtt-vision-cone-rotate-handle');
                if (handleEl) return handleEl;
            }
            return null;
        };
        const clearPendingTouchContext = () => {
            if (!pendingTouchContextState) return null;
            if (pendingTouchContextState.timer) {
                window.clearTimeout(pendingTouchContextState.timer);
            }
            const snapshot = pendingTouchContextState;
            pendingTouchContextState = null;
            return snapshot;
        };
        const canUseTouchContextActions = (event) => {
            if (!event || event.button !== 0 || event.isPrimary === false) return false;
            const pointerType = String(event.pointerType || '').toLowerCase();
            if (pointerType === 'touch') return true;
            if (pointerType !== 'pen') return false;
            const maxTouchPoints = Number.isFinite(Number(window.navigator && window.navigator.maxTouchPoints))
                ? Number(window.navigator.maxTouchPoints)
                : 0;
            const hasCoarsePointer = typeof window.matchMedia === 'function'
                && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches);
            return hasCoarsePointer || maxTouchPoints > 0;
        };
        const beginTouchContextInteraction = (event, scene, worldPoint) => {
            if (!canUseTouchContextActions(event)) return false;
            const pointerType = String(event && event.pointerType || '').toLowerCase();
            if (runtime.localToolState.mode !== TOOL_MODE_NAVIGATE) return false;
            clearPendingTouchContext();
            const targetEl = getEventTargetElement(event);
            const tokenEl = targetEl ? targetEl.closest('.vtt-token') : null;
            if (tokenEl) {
                const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
                if (!token) return false;
                const canMoveToken = canRoleMoveToken(token, runtime.localRole);
                const state = {
                    pointerId: event.pointerId,
                    pointerType,
                    sceneId: scene.id,
                    targetKind: 'token',
                    tokenId: token.id,
                    clientX: Math.round(event.clientX),
                    clientY: Math.round(event.clientY),
                    anchorX: (worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - token.x,
                    anchorY: (worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - token.y,
                    canMoveToken,
                    originX: runtime.localView.x,
                    originY: runtime.localView.y,
                    triggered: false,
                    timer: 0
                };
                state.timer = window.setTimeout(() => {
                    if (pendingTouchContextState !== state) return;
                    state.triggered = true;
                    runtime.previewTokenId = '';
                    activateTokenSelection(state.tokenId);
                    openStageContextMenu(state.clientX, state.clientY, {
                        tokenId: state.tokenId,
                        worldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                        source: 'touch'
                    });
                    render();
                }, TOUCH_CONTEXT_HOLD_MS);
                pendingTouchContextState = state;
                activateTokenSelection(token.id);
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderToolsMenu();
                renderStage();
                return true;
            }
            const state = {
                pointerId: event.pointerId,
                pointerType,
                sceneId: scene.id,
                targetKind: 'stage',
                clientX: Math.round(event.clientX),
                clientY: Math.round(event.clientY),
                originX: runtime.localView.x,
                originY: runtime.localView.y,
                worldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                triggered: false,
                timer: 0
            };
            state.timer = window.setTimeout(() => {
                if (pendingTouchContextState !== state) return;
                state.triggered = true;
                runtime.previewTokenId = '';
                openStageContextMenu(state.clientX, state.clientY, {
                    worldPoint: state.worldPoint,
                    source: 'touch'
                });
                render();
            }, TOUCH_CONTEXT_HOLD_MS);
            pendingTouchContextState = state;
            return true;
        };
        const beginTokenPointerInteraction = (event, scene, worldPoint, tokenEl) => {
            if (!tokenEl) return false;
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token) return false;
            const canMoveToken = canRoleMoveToken(token, runtime.localRole);
            const now = Date.now();
            const previousPress = lastTokenPointerDownState;
            const isDoublePress = !!(
                previousPress
                && previousPress.tokenId === token.id
                && now - previousPress.at <= TOKEN_DOUBLE_CLICK_MS
                && Math.hypot(event.clientX - previousPress.clientX, event.clientY - previousPress.clientY) <= STAGE_TOOL_DOUBLE_PRESS_PX
            );
            lastTokenPointerDownState = {
                tokenId: token.id,
                at: now,
                clientX: event.clientX,
                clientY: event.clientY
            };
            activateTokenSelection(token.id);
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderToolsMenu();
            if (isDoublePress && isDM()) {
                lastTokenPointerDownState = null;
                runtime.previewTokenId = '';
                openTokenInspectorPopover(token.id, event.clientX, event.clientY);
                renderTokenInspectorPopover();
                renderStage();
                return true;
            }
            if (isDoublePress && canMoveToken) {
                lastTokenPointerDownState = null;
                snapTokenToGrid(token.id);
                return true;
            }
            if (!canMoveToken) {
                showTokenPortraitPreview(token.id);
                renderStage();
                return true;
            }
            if (!canMutateLiveVTTState('token-drag-start')) {
                renderStage();
                return true;
            }
            const anchorX = (worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - token.x;
            const anchorY = (worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - token.y;
            remoteTokenTweens.delete(buildRemoteTokenTweenKey(scene.id, token.id));
            runtime.dragState = {
                tokenId: token.id,
                anchorX,
                anchorY,
                startClientX: event.clientX,
                startClientY: event.clientY,
                moved: false
            };
            runtime.lastDragSyncAt = 0;
            renderStage();
            return true;
        };
    
        const beginEvidenceNotePointerInteraction = (event, scene, worldPoint, noteEl) => {
            if (!isDM() || !scene || !noteEl || runtime.localToolState.mode !== TOOL_MODE_NAVIGATE) return false;
            if (window.matchMedia('(max-width: 860px)').matches) return false;
            const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
            const note = getEvidenceNoteById(noteId);
            if (!note) return false;
            const now = Date.now();
            const previousPress = lastEvidenceNotePointerDownState;
            const isDoublePress = !!(
                previousPress
                && previousPress.noteId === note.id
                && now - previousPress.at <= TOKEN_DOUBLE_CLICK_MS
                && Math.hypot(event.clientX - previousPress.clientX, event.clientY - previousPress.clientY) <= STAGE_TOOL_DOUBLE_PRESS_PX
            );
            lastEvidenceNotePointerDownState = {
                noteId: note.id,
                at: now,
                clientX: event.clientX,
                clientY: event.clientY
            };
            if (isDoublePress) {
                lastEvidenceNotePointerDownState = null;
                runtime.evidenceNoteDragState = null;
                openEvidenceNoteInspectorPopover(note.id, event.clientX, event.clientY);
                renderTokenInspectorPopover();
                renderStage();
                return true;
            }
            if (!canMutateLiveVTTState('evidence-note-drag-start')) return false;
            runtime.evidenceNoteDragState = {
                sceneId: scene.id,
                noteId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldPoint: { x: worldPoint.x, y: worldPoint.y },
                originX: toNumber(note.x, 0),
                originY: toNumber(note.y, 0),
                previewX: toNumber(note.x, 0),
                previewY: toNumber(note.y, 0),
                width: Math.max(1, toNumber(note.w, 1)),
                height: Math.max(1, toNumber(note.h, 1)),
                isPin: isEvidenceNotePin(note),
                moved: false
            };
            return true;
        };
    
        const previewEvidenceNoteDrag = (event) => {
            const state = runtime.evidenceNoteDragState;
            const scene = getActiveScene();
            if (!state || !scene || state.sceneId !== scene.id) return false;
            const moveDistance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
            if (!state.moved && moveDistance <= TOKEN_CLICK_MOVE_PX) return true;
            state.moved = true;
            lastEvidenceNotePointerDownState = null;
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene.grid && scene.grid.offsetY, 0);
            const rawX = state.originX + worldPoint.x - state.startWorldPoint.x;
            const rawY = state.originY + worldPoint.y - state.startWorldPoint.y;
            state.previewX = offsetX + Math.round((rawX - offsetX) / cellPx) * cellPx;
            state.previewY = offsetY + Math.round((rawY - offsetY) / cellPx) * cellPx;
            const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(state.noteId) : state.noteId.replace(/"/g, '\\"');
            const currentEl = noteLayerEl ? noteLayerEl.querySelector(`.vtt-map-note[data-note-id="${escapedId}"]`) : null;
            if (currentEl instanceof HTMLElement) {
                const worldLeft = state.isPin ? state.previewX - state.width / 2 : state.previewX;
                const worldTop = state.isPin ? state.previewY - state.height / 2 : state.previewY;
                currentEl.style.left = `${scaleForZoom(worldLeft)}px`;
                currentEl.style.top = `${scaleForZoom(worldTop)}px`;
                currentEl.classList.add('is-dragging');
            }
            return true;
        };

        const previewTokenDrag = (scene, token) => {
            if (!stageEl || !scene || !scene.grid || !token) return false;
            const tokenId = String(token.id || '').trim();
            if (!tokenId) return false;
            const escapedId = typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(tokenId)
                : tokenId.replace(/"/g, '\\"');
            const tokenEl = stageEl.querySelector(`.vtt-token[data-token-id="${escapedId}"]`);
            if (!(tokenEl instanceof HTMLElement)) return false;
            const cellPx = getSceneCellPx(scene);
            const worldLeft = toNumber(scene.grid.offsetX, 0) + normalizeTokenCoordinate(token.x, 0) * cellPx;
            const worldTop = toNumber(scene.grid.offsetY, 0) + normalizeTokenCoordinate(token.y, 0) * cellPx;
            tokenEl.dataset.worldLeft = String(worldLeft);
            tokenEl.dataset.worldTop = String(worldTop);
            tokenEl.style.left = `${scaleForZoom(worldLeft)}px`;
            tokenEl.style.top = `${scaleForZoom(worldTop)}px`;
            tokenEl.classList.add('is-dragging');
            return true;
        };
    
        const handleStagePointerDown = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;
            if (event.button !== 0) return;
            if (targetEl.closest('#vtt-quick-spawn-menu')) return;
            if (targetEl.closest('#vtt-stage-context-menu')) return;
            if (targetEl.closest('.vtt-ask-roll-marker')) return;
            if (targetEl.closest('.vtt-ping')) return;
            closeQuickSpawnMenu();
            closeStageContextMenu();
            closeTokenInspectorPopover();
    
            const scene = getActiveScene();
            if (!scene) return;
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            if (runtime.localToolState.mode === TOOL_MODE_PING) {
                if (!canUseSharedPlayerTools()) return;
                if (runtime.pendingAskRollRequest) {
                    const context = getLocalPlayerFocusContext();
                    const name = context.linkedPlayer && context.linkedPlayer.name
                        ? String(context.linkedPlayer.name).trim()
                        : 'Player';
                    queueSharedPing(scene, worldPoint, {
                        ...PING_VARIANT_OPTIONS.askRoll,
                        label: `${name} asks: ${runtime.pendingAskRollRequest.label}`.slice(0, 80),
                        askRoll: runtime.pendingAskRollRequest
                    });
                    runtime.pendingAskRollRequest = null;
                    setToolMode(TOOL_MODE_NAVIGATE);
                    render();
                } else {
                    queueSharedPing(scene, worldPoint, getPingVariantOptions(event));
                    setToolMode(TOOL_MODE_NAVIGATE);
                    render();
                }
                event.preventDefault();
                return;
            }
            if (beginTouchContextInteraction(event, scene, worldPoint)) {
                event.preventDefault();
                return;
            }
            const tokenElAtPoint = runtime.localToolState.mode === TOOL_MODE_NAVIGATE
                ? getTokenElementAtClientPoint(event.clientX, event.clientY, targetEl)
                : null;
            if (tokenElAtPoint && beginTokenPointerInteraction(event, scene, worldPoint, tokenElAtPoint)) {
                event.preventDefault();
                return;
            }
            const noteEl = getEvidenceNoteElementAtClientPoint(event.clientX, event.clientY, targetEl);
            if (noteEl && runtime.localToolState.mode === TOOL_MODE_NAVIGATE) {
                const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
                if (!activateEvidenceNoteSelection(noteId)) return;
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderToolsMenu();
                renderStage();
                const renderedNoteEl = getEvidenceNoteElementAtClientPoint(event.clientX, event.clientY, targetEl);
                beginEvidenceNotePointerInteraction(event, scene, worldPoint, renderedNoteEl || noteEl);
                event.preventDefault();
                return;
            }
            const visionRotateHandleEl = getVisionConeRotateHandleElementAtClientPoint(event.clientX, event.clientY, targetEl);
            if (visionRotateHandleEl) {
                const tokenId = String(visionRotateHandleEl.getAttribute('data-token-id') || '').trim();
                const token = getTokenById(tokenId);
                if (!isDM() || !token) return;
                runtime.selectedTokenId = token.id;
                runtime.selectedTemplateId = '';
                runtime.selectedEvidenceNoteId = '';
                runtime.selectedEntryId = '';
                runtime.previewTokenId = '';
                runtime.templatePlacementState = null;
                runtime.templateRotateState = null;
                runtime.rulerState = null;
                runtime.visionConeRotateState = {
                    sceneId: scene.id,
                    tokenId: token.id,
                    angleDeg: getTemplateAngleFromWorldPoint(scene, getTokenCenterInCells(token), worldPoint)
                };
                renderTokenInspector();
                renderInitiativeList();
                renderInitiativeDetail();
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
            const rotateHandleEl = targetEl.closest('.vtt-template-rotate-handle');
            if (rotateHandleEl) {
                const templateId = String(rotateHandleEl.getAttribute('data-template-id') || '').trim();
                const template = getTemplateById(templateId);
                if (!template || template.kind !== TEMPLATE_KIND_CONE) return;
                runtime.selectedTemplateId = template.id;
                runtime.selectedTokenId = '';
                runtime.selectedEvidenceNoteId = '';
                runtime.selectedEntryId = '';
                runtime.previewTokenId = '';
                runtime.templatePlacementState = null;
                runtime.visionConeRotateState = null;
                runtime.rulerState = null;
                runtime.templateRotateState = {
                    sceneId: scene.id,
                    templateId: template.id,
                    angleDeg: getTemplateAngleFromWorldPoint(scene, template, worldPoint)
                };
                renderTokenInspector();
                renderInitiativeList();
                renderInitiativeDetail();
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            const templateEl = targetEl.closest('.vtt-area-template');
            if (templateEl) {
                runtime.selectedTemplateId = String(templateEl.getAttribute('data-template-id') || '').trim();
                runtime.selectedTokenId = '';
                runtime.selectedEvidenceNoteId = '';
                runtime.selectedEntryId = '';
                runtime.previewTokenId = '';
                runtime.visionConeRotateState = null;
                renderTokenInspector();
                renderInitiativeList();
                renderInitiativeDetail();
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            if ((runtime.localToolState.mode === TOOL_MODE_FOG || runtime.localToolState.mode === TOOL_MODE_FOG_REMOVE) && isDM()) {
                const initialMask = buildFogMaskFromWorldPoints(scene, worldPoint, worldPoint);
                if (!initialMask) return;
    
                runtime.fogPlacementState = {
                    sceneId: scene.id,
                    mode: runtime.localToolState.mode === TOOL_MODE_FOG_REMOVE ? 'remove' : 'add',
                    startWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                    currentWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                    mask: initialMask
                };
    
                runtime.evidenceNotePlacementState = null;
                runtime.templatePlacementState = null;
                runtime.templateRotateState = null;
                runtime.visionConeRotateState = null;
                runtime.rulerState = null;
    
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            if (runtime.localToolState.mode === TOOL_MODE_NOTE && isDM()) {
                const initialNote = buildEvidenceNoteFromWorldPoints(scene, worldPoint, worldPoint);
                if (!initialNote) return;
                runtime.evidenceNotePlacementState = {
                    sceneId: scene.id,
                    startWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                    currentWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                    note: initialNote
                };
                runtime.selectedEvidenceNoteId = '';
                runtime.templatePlacementState = null;
                runtime.templateRotateState = null;
                runtime.visionConeRotateState = null;
                runtime.rulerState = null;
                runtime.fogPlacementState = null;
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            if (runtime.localToolState.mode === TOOL_MODE_CIRCLE) {
                if (!canUseSharedPlayerTools()) return;
                const template = buildAreaTemplate(TEMPLATE_KIND_CIRCLE, scene, worldPoint, { sizeCells: runtime.localToolState.sizeCells });
                if (!template) return;
                runtime.templatePlacementState = {
                    sceneId: scene.id,
                    template,
                    startedAt: Date.now()
                };
                runtime.templateRotateState = null;
                runtime.visionConeRotateState = null;
                runtime.rulerState = null;
                renderStage();
                event.preventDefault();
                return;
            }
    
            if (runtime.localToolState.mode === TOOL_MODE_CONE) {
                if (!canUseSharedPlayerTools()) return;
                const template = buildAreaTemplate(TEMPLATE_KIND_CONE, scene, worldPoint, { sizeCells: runtime.localToolState.sizeCells });
                if (!template) return;
                runtime.templatePlacementState = {
                    sceneId: scene.id,
                    template,
                    startedAt: Date.now()
                };
                runtime.templateRotateState = null;
                runtime.visionConeRotateState = null;
                runtime.rulerState = null;
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            if (runtime.localToolState.mode === TOOL_MODE_RULER) {
                const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
                runtime.rulerState = { sceneId: scene.id, start: anchor, end: anchor, dragging: true };
                runtime.templatePlacementState = null;
                runtime.templateRotateState = null;
                runtime.visionConeRotateState = null;
                renderToolsMenu();
                renderStage();
                event.preventDefault();
                return;
            }
    
            lastTokenPointerDownState = null;
            lastEvidenceNotePointerDownState = null;
            if (runtime.localToolState.mode === TOOL_MODE_NAVIGATE && runtime.selectedEvidenceNoteId) {
                runtime.selectedEvidenceNoteId = '';
                renderTokenInspector();
                renderInitiativeList();
                renderInitiativeDetail();
                renderToolsMenu();
                renderStage();
            }
            if (runtime.selectedTemplateId) {
                runtime.selectedTemplateId = '';
                renderToolsMenu();
                renderStage();
            }
    
            runtime.panState = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                originX: runtime.localView.x,
                originY: runtime.localView.y
            };
            if (stageEl) stageEl.classList.add('is-panning');
        };
    
        const handlePointerMove = (event) => {
            if (runtime.spawnDragState) {
                runtime.spawnDragState.clientX = event.clientX;
                runtime.spawnDragState.clientY = event.clientY;
                runtime.spawnDragState.overStage = isClientPointInsideStage(event.clientX, event.clientY);
                renderSpawnGhost();
                return;
            }
            if (runtime.evidenceNoteDragState) {
                previewEvidenceNoteDrag(event);
                return;
            }
            if (pendingTouchContextState && event.pointerId === pendingTouchContextState.pointerId) {
                if (pendingTouchContextState.triggered) return;
                const moveDistance = Math.hypot(event.clientX - pendingTouchContextState.clientX, event.clientY - pendingTouchContextState.clientY);
                if (moveDistance < TOUCH_CONTEXT_MOVE_PX) return;
                const pending = clearPendingTouchContext();
                if (!pending) return;
                if (pending.targetKind === 'token') {
                    if (!pending.canMoveToken) {
                        renderStage();
                        return;
                    }
                    if (!canMutateLiveVTTState('token-touch-drag-start')) {
                        renderStage();
                        return;
                    }
                    runtime.dragState = {
                        tokenId: pending.tokenId,
                        anchorX: pending.anchorX,
                        anchorY: pending.anchorY,
                        startClientX: pending.clientX,
                        startClientY: pending.clientY,
                        moved: true
                    };
                    const scene = getActiveScene();
                    if (scene) remoteTokenTweens.delete(buildRemoteTokenTweenKey(scene.id, pending.tokenId));
                    runtime.lastDragSyncAt = 0;
                    renderStage();
                    return;
                }
                runtime.panState = {
                    startClientX: pending.clientX,
                    startClientY: pending.clientY,
                    originX: pending.originX,
                    originY: pending.originY
                };
                if (stageEl) stageEl.classList.add('is-panning');
                return;
            }
            if (runtime.fogPlacementState) {
                const scene = getActiveScene();
                if (!scene || runtime.fogPlacementState.sceneId !== scene.id) {
                    runtime.fogPlacementState = null;
                    renderStage();
                    return;
                }
                runtime.fogPlacementState.currentWorldPoint = screenToWorld(event.clientX, event.clientY);
                runtime.fogPlacementState.mask = buildFogMaskFromWorldPoints(
                    scene,
                    runtime.fogPlacementState.startWorldPoint,
                    runtime.fogPlacementState.currentWorldPoint,
                    runtime.fogPlacementState.mask && runtime.fogPlacementState.mask.id
                );
                scheduleInteractionRender();
                return;
            }
            if (runtime.evidenceNotePlacementState) {
                const scene = getActiveScene();
                if (!scene || runtime.evidenceNotePlacementState.sceneId !== scene.id) {
                    runtime.evidenceNotePlacementState = null;
                    renderStage();
                    return;
                }
                runtime.evidenceNotePlacementState.currentWorldPoint = screenToWorld(event.clientX, event.clientY);
                runtime.evidenceNotePlacementState.note = buildEvidenceNoteFromWorldPoints(
                    scene,
                    runtime.evidenceNotePlacementState.startWorldPoint,
                    runtime.evidenceNotePlacementState.currentWorldPoint,
                    runtime.evidenceNotePlacementState.note && runtime.evidenceNotePlacementState.note.id,
                    runtime.evidenceNotePlacementState.note || {}
                );
                scheduleInteractionRender();
                return;
            }
            if (runtime.templatePlacementState) {
                const scene = getActiveScene();
                if (!scene || !runtime.templatePlacementState.template) return;
                const worldPoint = screenToWorld(event.clientX, event.clientY);
                if (runtime.templatePlacementState.template.kind === TEMPLATE_KIND_CIRCLE) {
                    const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
                    runtime.templatePlacementState.template.x = anchor.x;
                    runtime.templatePlacementState.template.y = anchor.y;
                } else {
                    runtime.templatePlacementState.template.angleDeg = getTemplateAngleFromWorldPoint(scene, runtime.templatePlacementState.template, worldPoint);
                }
                scheduleInteractionRender();
                return;
            }
            if (runtime.templateRotateState) {
                const scene = getActiveScene();
                const template = getTemplateById(runtime.templateRotateState.templateId);
                if (!scene || !template || template.kind !== TEMPLATE_KIND_CONE) {
                    runtime.templateRotateState = null;
                    renderStage();
                    return;
                }
                runtime.templateRotateState.angleDeg = getTemplateAngleFromWorldPoint(scene, template, screenToWorld(event.clientX, event.clientY));
                scheduleInteractionRender();
                return;
            }
            if (runtime.visionConeRotateState) {
                const scene = getActiveScene();
                const token = getTokenById(runtime.visionConeRotateState.tokenId);
                if (!isDM() || !scene || !token) {
                    runtime.visionConeRotateState = null;
                    renderStage();
                    return;
                }
                runtime.visionConeRotateState.angleDeg = getTemplateAngleFromWorldPoint(scene, getTokenCenterInCells(token), screenToWorld(event.clientX, event.clientY));
                scheduleInteractionRender();
                return;
            }
            if (runtime.rulerState && runtime.rulerState.dragging) {
                const scene = getActiveScene();
                if (!scene) return;
                runtime.rulerState.end = snapWorldPointToTemplateAnchor(scene, screenToWorld(event.clientX, event.clientY));
                scheduleInteractionRender();
                return;
            }
            if (runtime.dragState) {
                const scene = getActiveScene();
                if (!scene) return;
                const token = getTokenById(runtime.dragState.tokenId);
                if (!token || !canRoleMoveToken(token, runtime.localRole)) return;
                const worldPoint = screenToWorld(event.clientX, event.clientY);
                if (!runtime.dragState.moved) {
                    const moveDistance = Math.hypot(
                        event.clientX - toNumber(runtime.dragState.startClientX, event.clientX),
                        event.clientY - toNumber(runtime.dragState.startClientY, event.clientY)
                    );
                    if (moveDistance <= TOKEN_CLICK_MOVE_PX) return;
                    runtime.dragState.moved = true;
                    lastTokenPointerDownState = null;
                }
                token.x = normalizeTokenCoordinate((worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - runtime.dragState.anchorX, token.x);
                token.y = normalizeTokenCoordinate((worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - runtime.dragState.anchorY, token.y);
                if (!previewTokenDrag(scene, token)) renderStage();
                syncDraggedState(false);
                return;
            }
    
            if (runtime.panState) {
                runtime.localView.x = Math.round(runtime.panState.originX + (event.clientX - runtime.panState.startClientX));
                runtime.localView.y = Math.round(runtime.panState.originY + (event.clientY - runtime.panState.startClientY));
                applyWorldTransform();
            }
        };
    
        const handlePointerUp = (event) => {
            cancelInteractionRender();
            if (runtime.spawnDragState) {
                const shouldSpawn = isDM() && event && isClientPointInsideStage(event.clientX, event.clientY);
                const nextWorldPoint = shouldSpawn ? screenToWorld(event.clientX, event.clientY) : null;
                const descriptor = { kind: runtime.spawnDragState.kind, id: runtime.spawnDragState.id };
                clearSpawnDrag();
                if (shouldSpawn) {
                    spawnTokenFromDescriptor(descriptor.kind, descriptor.id, nextWorldPoint);
                }
                return;
            }
            if (runtime.evidenceNoteDragState) {
                const completed = { ...runtime.evidenceNoteDragState };
                runtime.evidenceNoteDragState = null;
                if (!event || event.type === 'pointercancel' || !completed.moved) {
                    renderStage();
                    return;
                }
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene || scene.id !== completed.sceneId || !Array.isArray(scene.evidenceNotes)) return;
                    const note = scene.evidenceNotes.find((entry) => String(entry && entry.id || '').trim() === completed.noteId);
                    if (!note) return;
                    note.x = completed.previewX;
                    note.y = completed.previewY;
                    runtime.selectedEvidenceNoteId = note.id;
                });
                return;
            }
            if (pendingTouchContextState && event && event.pointerId === pendingTouchContextState.pointerId) {
                const pending = clearPendingTouchContext();
                if (!pending) return;
                if (!pending.triggered && pending.targetKind === 'token') {
                    renderTokenInspector();
                    renderInitiativeList();
                    renderInitiativeDetail();
                    renderStage();
                }
                return;
            }
            if (runtime.fogPlacementState) {
                const pendingFog = { ...runtime.fogPlacementState };
                runtime.fogPlacementState = null;
                if (event && event.type === 'pointercancel') {
                    renderStage();
                    return;
                }
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    if (!Array.isArray(scene.fog)) scene.fog = [];
                    const mask = buildFogMaskFromWorldPoints(
                        scene,
                        pendingFog.startWorldPoint,
                        pendingFog.currentWorldPoint || pendingFog.startWorldPoint,
                        pendingFog.mask && pendingFog.mask.id
                    );
                    if (!mask) return;
                    if (pendingFog.mode === 'remove') addFogRevealBurst(scene, mask);
                    scene.fog = applyFogMaskMutation(scene, mask, pendingFog.mode === 'remove' ? 'remove' : 'add');
                });
                return;
            }
            if (runtime.evidenceNotePlacementState) {
                const pendingNote = { ...runtime.evidenceNotePlacementState };
                runtime.evidenceNotePlacementState = null;
                if (event && event.type === 'pointercancel') {
                    renderStage();
                    return;
                }
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene) return;
                    if (!Array.isArray(scene.evidenceNotes)) scene.evidenceNotes = [];
                    const note = buildEvidenceNoteFromWorldPoints(
                        scene,
                        pendingNote.startWorldPoint,
                        pendingNote.currentWorldPoint || pendingNote.startWorldPoint,
                        pendingNote.note && pendingNote.note.id,
                        pendingNote.note || {}
                    );
                    if (!note) return;
                    scene.evidenceNotes.push(note);
                    runtime.selectedEvidenceNoteId = note.id;
                    runtime.selectedTokenId = '';
                    runtime.selectedEntryId = '';
                });
                return;
            }
            if (runtime.templatePlacementState) {
                const pendingTemplateState = runtime.templatePlacementState;
                runtime.templatePlacementState = null;
                if (event && event.type === 'pointercancel') {
                    renderStage();
                    return;
                }
                if (pendingTemplateState && pendingTemplateState.template && Date.now() - toNumber(pendingTemplateState.startedAt, 0) >= TEMPLATE_HOLD_PERSIST_MS) {
                    queueSharedTransientTemplate({ ...pendingTemplateState.template });
                    return;
                }
                renderStage();
                return;
            }
            if (runtime.templateRotateState) {
                if (event && event.type === 'pointercancel') {
                    runtime.templateRotateState = null;
                    renderStage();
                    return;
                }
                const pendingRotation = { ...runtime.templateRotateState };
                runtime.templateRotateState = null;
                withDraft((draft) => {
                    const scene = getActiveScene(draft);
                    if (!scene || !Array.isArray(scene.templates)) return;
                    const template = scene.templates.find((entry) => entry && entry.id === pendingRotation.templateId);
                    if (!template) return;
                    template.angleDeg = normalizeAngleDeg(pendingRotation.angleDeg);
                    runtime.selectedTemplateId = template.id;
                    runtime.selectedEvidenceNoteId = '';
                });
                return;
            }
            if (runtime.visionConeRotateState) {
                if (event && event.type === 'pointercancel') {
                    runtime.visionConeRotateState = null;
                    renderStage();
                    return;
                }
                const pendingRotation = { ...runtime.visionConeRotateState };
                runtime.visionConeRotateState = null;
                withDraft((draft) => {
                    if (!isDM()) return;
                    const scene = getActiveScene(draft);
                    if (!scene || !Array.isArray(scene.tokens)) return;
                    const token = scene.tokens.find((entry) => entry && entry.id === pendingRotation.tokenId);
                    if (!token) return;
                    if (!token.vision || typeof token.vision !== 'object') {
                        token.vision = { enabled: true, facingDeg: 0, arcDeg: 90, baseRangeCells: 6, passivePerception: 10 };
                    }
                    token.vision.facingDeg = normalizeAngleDeg(pendingRotation.angleDeg);
                    runtime.selectedTokenId = token.id;
                    runtime.selectedEvidenceNoteId = '';
                });
                return;
            }
            let appliedRemoteSnapshot = false;
            if (runtime.dragState) {
                const completedDragState = { ...runtime.dragState };
                const completedDragSceneId = getActiveScene(runtime.vttState) ? getActiveScene(runtime.vttState).id : '';
                if (event && !completedDragState.moved) {
                    const moveDistance = Math.hypot(
                        event.clientX - toNumber(completedDragState.startClientX, event.clientX),
                        event.clientY - toNumber(completedDragState.startClientY, event.clientY)
                    );
                    completedDragState.moved = moveDistance > TOKEN_CLICK_MOVE_PX;
                }
                if (completedDragState.moved) {
                    suppressLocalDragTween(completedDragSceneId, completedDragState.tokenId);
                    const completedToken = getTokenById(completedDragState.tokenId, runtime.vttState);
                    if (completedToken) {
                        rememberRecentLocalDragDrop(completedDragSceneId, completedDragState.tokenId, completedToken.x, completedToken.y);
                    }
                    markTokenVisualEffect(completedDragState.tokenId, 'drop-pulse', TOKEN_DROP_PULSE_MS);
                    syncDraggedState(true);
                }
                runtime.lastDragSyncAt = 0;
                runtime.dragState = null;
                if (!completedDragState.moved) {
                    showTokenPortraitPreview(completedDragState.tokenId);
                } else {
                    runtime.suppressedTokenPreviewClickId = String(completedDragState.tokenId || '').trim();
                    runtime.suppressedTokenPreviewClickUntil = Date.now() + 500;
                    clearTokenPortraitPreview();
                }
                appliedRemoteSnapshot = applyPendingRemoteVTTSnapshot();
                if (!appliedRemoteSnapshot) render();
            }
            if (runtime.rulerState && runtime.rulerState.dragging) {
                runtime.rulerState = null;
                renderStage();
            }
    
            if (runtime.panState) {
                runtime.panState = null;
                if (stageEl) stageEl.classList.remove('is-panning');
            }
        };

        const handleStageDoubleClick = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl || runtime.localToolState.mode !== TOOL_MODE_NAVIGATE) return;
            const tokenEl = getTokenElementAtClientPoint(event.clientX, event.clientY, targetEl);
            if (!tokenEl) return;
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token) return;
            activateTokenSelection(token.id);
            lastTokenPointerDownState = null;
            runtime.dragState = null;
            runtime.previewTokenId = '';
            if (isDM()) {
                openTokenInspectorPopover(token.id, event.clientX, event.clientY);
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderTokenInspectorPopover();
                renderToolsMenu();
                renderStage();
            } else if (canRoleMoveToken(token, runtime.localRole)) {
                snapTokenToGrid(token.id);
            }
            event.preventDefault();
        };
    
        const handleDocumentPointerDown = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;
            const spawnEl = event.button === 0 ? targetEl.closest('[data-spawn-kind]') : null;
            if (spawnEl instanceof HTMLElement) {
                const kind = String(spawnEl.dataset.spawnKind || '').trim();
                const id = String(spawnEl.dataset.id || '').trim();
                if (beginSpawnDrag(event, kind, id)) {
                    event.preventDefault();
                    return;
                }
            }
            let needsRender = false;
    
            if (runtime.npcSearchOpen && !targetEl.closest('.vtt-popover-anchor') && !targetEl.closest('#vtt-npc-search-popover')) {
                closeNPCSearch();
                needsRender = true;
            }
    
            if (runtime.stageContextMenuState && !targetEl.closest('#vtt-stage-context-menu')) {
                runtime.stageContextMenuState = null;
                needsRender = true;
            }
            if (runtime.quickSpawnMenuState && !targetEl.closest('#vtt-quick-spawn-menu')) {
                runtime.quickSpawnMenuState = null;
                needsRender = true;
            }
            if (runtime.viewMenuOpen && !targetEl.closest('#vtt-view-menu') && !targetEl.closest('[data-vtt-master-menu-toggle]')) {
                runtime.viewMenuOpen = false;
                needsRender = true;
            }
            if (runtime.toolsMenuOpen && !targetEl.closest('.vtt-topbar-tools')) {
                runtime.toolsMenuOpen = false;
                needsRender = true;
            }
            if (runtime.playerRollMenuOpen
                && !targetEl.closest('#vtt-player-roll-panel')
                && !targetEl.closest('#vtt-sheet-action-popover')
                && !targetEl.closest('#vtt-npc-roll-popover')) {
                runtime.playerRollMenuOpen = false;
                needsRender = true;
            }
            if (runtime.initiativeDetailState && !targetEl.closest('#vtt-initiative-detail-panel') && !targetEl.closest('.vtt-entry')) {
                runtime.initiativeDetailState = null;
                needsRender = true;
            }
            if (runtime.tokenInspectorState
                && !targetEl.closest('#vtt-token-inspector-popover')
                && !targetEl.closest('.vtt-token')
                && !targetEl.closest('.vtt-map-note')) {
                runtime.tokenInspectorState = null;
                needsRender = true;
            }
            if (runtime.sheetActionState
                && !targetEl.closest('#vtt-sheet-action-popover')
                && !targetEl.closest('.vtt-token')) {
                runtime.sheetActionState = null;
                runtime.sheetActionQuery = '';
                needsRender = true;
            }
            if (runtime.npcRollState
                && !targetEl.closest('#vtt-npc-roll-popover')
                && !targetEl.closest('.vtt-token')) {
                runtime.npcRollState = null;
                needsRender = true;
            }
    
            if (runtime.previewTokenId && !targetEl.closest('.vtt-token')) {
                runtime.previewTokenId = '';
                needsRender = true;
            }
    
            if (needsRender) render();
        };
    
        const handleStageWheel = (event) => {
            if (!stageEl) return;
            if (event.target instanceof Element && event.target.closest('#vtt-quick-spawn-menu')) return;
            const absX = Math.abs(event.deltaX);
            const absY = Math.abs(event.deltaY);
            if (absX > absY * 1.2 && !event.ctrlKey) return;
            const dominantDelta = absY >= absX ? event.deltaY : event.deltaX;
            if (!Number.isFinite(dominantDelta) || dominantDelta === 0) return;
            event.preventDefault();
            const sensitivity = event.ctrlKey ? 0.0016 : 0.00085;
            const factor = Math.exp(-dominantDelta * sensitivity);
            const nextZoom = clampZoom(runtime.localView.zoom * factor);
            if (nextZoom === runtime.localView.zoom) return;
            setZoomAtPoint(nextZoom, event.clientX, event.clientY);
        };
    
        const handleStageDragStart = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl || !stageEl || !targetEl.closest('#vtt-stage')) return;
            event.preventDefault();
        };
    
        const handleStageContextMenu = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;
            if (targetEl.closest('#vtt-quick-spawn-menu')) return;
            const tokenEl = targetEl.closest('.vtt-token');
            const token = tokenEl ? getTokenById(String(tokenEl.getAttribute('data-token-id') || '')) : null;
            const noteEl = getEvidenceNoteElementAtClientPoint(event.clientX, event.clientY, targetEl);
            if (noteEl) {
                const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
                if (!noteId) return;
                event.preventDefault();
                activateEvidenceNoteSelection(noteId);
                runtime.previewTokenId = '';
                openStageContextMenu(event.clientX, event.clientY, {
                    noteId,
                    worldPoint: screenToWorld(event.clientX, event.clientY),
                    altKey: !!event.altKey,
                    shiftKey: !!event.shiftKey
                });
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderTokenInspectorPopover();
                renderStageContextMenu();
                renderToolsMenu();
                renderStage();
                return;
            }
            if (tokenEl) {
                if (!token) return;
    
                event.preventDefault();
                activateTokenSelection(token.id);
                runtime.previewTokenId = '';
                openStageContextMenu(event.clientX, event.clientY, {
                    tokenId: token.id,
                    worldPoint: screenToWorld(event.clientX, event.clientY),
                    altKey: !!event.altKey,
                    shiftKey: !!event.shiftKey
                });
                renderInitiativeList();
                renderInitiativeDetail();
                renderTokenInspector();
                renderTokenInspectorPopover();
                renderSheetActionPopover();
                renderNPCRollPopover();
                renderStageContextMenu();
                renderToolsMenu();
                renderStage();
                return;
            }
            if (runtime.previewTokenId) runtime.previewTokenId = '';
            event.preventDefault();
            openStageContextMenu(event.clientX, event.clientY, {
                worldPoint: screenToWorld(event.clientX, event.clientY),
                altKey: !!event.altKey,
                shiftKey: !!event.shiftKey
            });
            renderStage();
        };
    
        const handleInitiativeContextMenu = (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;
            if (targetEl.closest('#vtt-initiative-detail-panel')) return;
            const entryEl = targetEl.closest('.vtt-entry');
            if (!entryEl) return;
            if (!isDM()) return;
            const entryId = String(entryEl.getAttribute('data-id') || entryEl.getAttribute('data-entry-id') || '').trim();
            if (!entryId) return;
            event.preventDefault();
            openInitiativeDetail(entryId, event.clientX, event.clientY);
            renderInitiativeList();
            renderInitiativeDetail();
        };
    
        const handleDocumentKeyDown = (event) => {
            if (isDMUnlockModalOpen()) {
                if (event.key === 'Escape') {
                    closeDMUnlockModal();
                    event.preventDefault();
                }
                return;
            }
            if (isRosterSelfModalOpen()) {
                if (event.key === 'Escape') event.preventDefault();
                return;
            }
            const target = event.target;
            const isEditableTarget = (
                target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || target instanceof HTMLSelectElement
                || (target instanceof HTMLElement && target.isContentEditable)
            );
            const isKeyboardContextRequest = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
            if (isKeyboardContextRequest && !isEditableTarget && target instanceof HTMLElement) {
                const tokenEl = target.closest('.vtt-token');
                const noteEl = target.closest('.vtt-map-note');
                const isStageTarget = target === stageEl;
                if (tokenEl || noteEl || isStageTarget) {
                    const targetRect = (tokenEl || noteEl || stageEl).getBoundingClientRect();
                    const clientX = Math.round(targetRect.left + targetRect.width / 2);
                    const clientY = Math.round(targetRect.top + targetRect.height / 2);
                    const contextOptions = {
                        worldPoint: screenToWorld(clientX, clientY),
                        source: 'keyboard',
                        altKey: false,
                        shiftKey: false
                    };
                    if (tokenEl) {
                        const tokenId = String(tokenEl.getAttribute('data-token-id') || '').trim();
                        if (tokenId) {
                            activateTokenSelection(tokenId);
                            contextOptions.tokenId = tokenId;
                        }
                    } else if (noteEl) {
                        const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
                        if (noteId) {
                            activateEvidenceNoteSelection(noteId);
                            contextOptions.noteId = noteId;
                        }
                    }
                    openStageContextMenu(clientX, clientY, contextOptions);
                    renderInitiativeList();
                    renderInitiativeDetail();
                    renderTokenInspector();
                    renderTokenInspectorPopover();
                    renderStage();
                    const focusFirstContextAction = () => {
                        const firstAction = root.document && root.document.querySelector
                            ? root.document.querySelector('#vtt-stage-context-menu .vtt-stage-context-item')
                            : null;
                        if (firstAction && typeof firstAction.focus === 'function') firstAction.focus();
                    };
                    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(focusFirstContextAction);
                    else focusFirstContextAction();
                    event.preventDefault();
                    return;
                }
            }
            if (event.key === 'Escape') {
                const exitedActiveTool = runtime.localToolState.mode !== TOOL_MODE_NAVIGATE;
                const clearedTransientDrawerState = clearTransientDrawerState();
                const cancelledAskRollPick = cancelAskRollPickMode();
                const closedMenu = closeQuickSpawnMenu();
                const closedNavMenu = closeNavMenu();
                const closedViewMenu = closeViewMenu();
                const closedToolsMenu = closeToolsMenu();
                const closedStageContext = closeStageContextMenu();
                const clearedSpawn = clearSpawnDrag();
                const clearedTemplatePlacement = clearTemplatePlacementState();
                const closedVTTPanel = closeActiveVTTPanel();
                const closedInitiativeDetail = closeInitiativeDetail();
                const closedTokenInspector = closeTokenInspectorPopover();
                const closedSheetActions = closeSheetActionPopover();
                const closedNPCRoll = closeNPCRollPopover();
                const closedPlayerRollMenu = runtime.playerRollMenuOpen;
                runtime.playerRollMenuOpen = false;
                if (exitedActiveTool) setToolMode(TOOL_MODE_NAVIGATE);
                if (runtime.previewTokenId) {
                    runtime.previewTokenId = '';
                    renderStage();
                    event.preventDefault();
                } else if (exitedActiveTool || clearedTransientDrawerState || cancelledAskRollPick || closedMenu || closedNavMenu || closedViewMenu || closedToolsMenu || closedStageContext || clearedSpawn || clearedTemplatePlacement || closedVTTPanel || closedInitiativeDetail || closedTokenInspector || closedSheetActions || closedNPCRoll || closedPlayerRollMenu) {
                    render();
                    event.preventDefault();
                }
                return;
            }
            if (
                isEditableTarget
            ) {
                return;
            }
            const isStageKeyboardContext = target === document.body
                || target === stageEl
                || (target instanceof HTMLElement && !!target.closest('.vtt-token'));
            if (!isStageKeyboardContext) return;
            if (!runtime.selectedTokenId || event.defaultPrevented) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const selectedToken = getTokenById(runtime.selectedTokenId);
            if (!selectedToken || !canRoleMoveToken(selectedToken, runtime.localRole)) return;
    
            let deltaX = 0;
            let deltaY = 0;
            if (event.key === 'ArrowLeft') deltaX = -1;
            else if (event.key === 'ArrowRight') deltaX = 1;
            else if (event.key === 'ArrowUp') deltaY = -1;
            else if (event.key === 'ArrowDown') deltaY = 1;
            else return;
    
            if (!moveSelectedTokenByCells(deltaX, deltaY)) return;
            event.preventDefault();
        };
    

        const resetPressHistory = () => {
            lastTokenPointerDownState = null;
            lastEvidenceNotePointerDownState = null;
        };

        return Object.freeze({
            clearPendingTouchContext,
            handleDocumentKeyDown,
            handleDocumentPointerDown,
            handleInitiativeContextMenu,
            handlePointerMove,
            handlePointerUp,
            handleStageContextMenu,
            handleStageDoubleClick,
            handleStageDragStart,
            handleStagePointerDown,
            handleStageWheel,
            resetPressHistory
        });
    };

    return Object.freeze({ create });
}));
