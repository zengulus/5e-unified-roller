(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_RUNTIME_STATE = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTION_PORT = Object.freeze({
        askRollPickMode: ['stage', 'tool', 'askRollPickMode'],
        combatClockEditorId: ['ui', 'combat', 'clockEditorId'],
        fitViewOnNextMapLoad: ['stage', 'view', 'fitOnNextMapLoad'],
        initiativeDetailState: ['ui', 'overlays', 'initiativeDetail'],
        localPingVariant: ['stage', 'tool', 'pingVariant'],
        localRole: ['session', 'role'],
        localRollMode: ['ui', 'playerRoll', 'mode'],
        localToolState: ['stage', 'tool', 'current'],
        localView: Object.freeze({ path: ['stage', 'view', 'local'], readOnly: true }),
        npcRollState: ['ui', 'overlays', 'npcRoll'],
        npcSearchOpen: ['ui', 'npcSearch', 'open'],
        pendingAskRollRequest: ['stage', 'tool', 'pendingAskRollRequest'],
        playerRollMenuOpen: ['ui', 'playerRoll', 'menuOpen'],
        previewTokenId: ['stage', 'preview', 'tokenId'],
        quickSpawnMenuState: ['ui', 'overlays', 'quickSpawn'],
        selectedClockId: ['stage', 'selection', 'clockId'],
        selectedEntryId: ['stage', 'selection', 'entryId'],
        selectedEvidenceNoteId: ['stage', 'selection', 'evidenceNoteId'],
        selectedTokenId: ['stage', 'selection', 'tokenId'],
        sheetActionState: ['ui', 'overlays', 'sheetAction'],
        stageContextMenuState: ['ui', 'overlays', 'stageContextMenu'],
        suppressedTokenPreviewClickId: ['stage', 'preview', 'suppressedClickId'],
        suppressedTokenPreviewClickUntil: ['stage', 'preview', 'suppressedClickUntil'],
        toolsMenuOpen: ['ui', 'menus', 'toolsOpen'],
        uiState: ['ui', 'preferences'],
        viewMenuOpen: ['ui', 'menus', 'viewOpen'],
        vttState: ['session', 'snapshot'],
        youtubeMusicState: ['ui', 'music', 'commandState']
    });

    const FIELD_PORT = Object.freeze({
        fitViewOnNextMapLoad: ['stage', 'view', 'fitOnNextMapLoad'],
        localToolState: ['stage', 'tool', 'current'],
        npcRollState: ['ui', 'overlays', 'npcRoll'],
        npcSearchQuery: ['ui', 'npcSearch', 'query'],
        playerRollSearchQuery: ['ui', 'queries', 'playerRoll'],
        previewTokenId: ['stage', 'preview', 'tokenId'],
        selectedEntryId: ['stage', 'selection', 'entryId'],
        selectedEvidenceNoteId: ['stage', 'selection', 'evidenceNoteId'],
        selectedTokenId: ['stage', 'selection', 'tokenId'],
        sheetActionQuery: ['ui', 'queries', 'sheetAction'],
        vttState: ['session', 'snapshot']
    });

    const STAGE_INPUT_PORT = Object.freeze({
        annotationPlacementState: ['stage', 'placement', 'annotation'],
        dragState: ['stage', 'pointer', 'drag'],
        evidenceNoteDragState: ['stage', 'placement', 'evidenceNoteDrag'],
        evidenceNotePlacementState: ['stage', 'placement', 'evidenceNote'],
        fogPlacementState: ['stage', 'placement', 'fog'],
        initiativeDetailState: ['ui', 'overlays', 'initiativeDetail'],
        lastDragSyncAt: ['stage', 'pointer', 'lastDragSyncAt'],
        localRole: ['session', 'role'],
        localToolState: ['stage', 'tool', 'current'],
        localView: Object.freeze({ path: ['stage', 'view', 'local'], readOnly: true }),
        npcRollState: ['ui', 'overlays', 'npcRoll'],
        npcSearchOpen: ['ui', 'npcSearch', 'open'],
        panState: ['stage', 'pointer', 'pan'],
        pendingAskRollRequest: ['stage', 'tool', 'pendingAskRollRequest'],
        playerRollMenuOpen: ['ui', 'playerRoll', 'menuOpen'],
        previewTokenId: ['stage', 'preview', 'tokenId'],
        quickSpawnMenuState: ['ui', 'overlays', 'quickSpawn'],
        rulerState: ['stage', 'placement', 'ruler'],
        selectedEntryId: ['stage', 'selection', 'entryId'],
        selectedEvidenceNoteId: ['stage', 'selection', 'evidenceNoteId'],
        selectedTemplateId: ['stage', 'selection', 'templateId'],
        selectedTokenId: ['stage', 'selection', 'tokenId'],
        sheetActionQuery: ['ui', 'queries', 'sheetAction'],
        sheetActionState: ['ui', 'overlays', 'sheetAction'],
        spawnDragState: ['stage', 'pointer', 'spawnDrag'],
        stageContextMenuState: ['ui', 'overlays', 'stageContextMenu'],
        suppressedTokenPreviewClickId: ['stage', 'preview', 'suppressedClickId'],
        suppressedTokenPreviewClickUntil: ['stage', 'preview', 'suppressedClickUntil'],
        templatePlacementState: ['stage', 'placement', 'template'],
        templateRotateState: ['stage', 'placement', 'templateRotate'],
        tokenInspectorState: ['ui', 'overlays', 'tokenInspector'],
        toolsMenuOpen: ['ui', 'menus', 'toolsOpen'],
        viewMenuOpen: ['ui', 'menus', 'viewOpen'],
        visionConeRotateState: ['stage', 'placement', 'visionConeRotate'],
        vttState: ['session', 'snapshot']
    });

    const PORT_MAPS = Object.freeze({
        actions: ACTION_PORT,
        fields: FIELD_PORT,
        stageInput: STAGE_INPUT_PORT
    });

    const getPathDefinition = (definition) => Array.isArray(definition)
        ? { path: definition, readOnly: false }
        : definition;

    const resolvePathOwner = (state, path) => path
        .slice(0, -1)
        .reduce((owner, key) => owner[key], state);

    const createPort = (state, portName) => {
        const map = PORT_MAPS[portName];
        if (!map) throw new TypeError(`Unknown VTT runtime state port: ${portName}`);
        const descriptors = Object.fromEntries(Object.entries(map).map(([key, rawDefinition]) => {
            const definition = getPathDefinition(rawDefinition);
            const path = definition.path;
            const property = path[path.length - 1];
            const descriptor = {
                enumerable: true,
                get: () => resolvePathOwner(state, path)[property]
            };
            if (!definition.readOnly) {
                descriptor.set = (value) => {
                    resolvePathOwner(state, path)[property] = value;
                };
            }
            return [key, descriptor];
        }));
        return Object.defineProperties({}, descriptors);
    };

    const create = (options = {}) => {
        const defaultWorldSize = options.defaultWorldSize && typeof options.defaultWorldSize === 'object'
            ? options.defaultWorldSize
            : { width: 2400, height: 1600 };
        const sceneViewMode = String(options.sceneViewMode || 'shared');
        const toolMode = String(options.toolMode || 'navigate');
        const parsedToolSize = Math.round(Number(options.toolSizeCells));
        const toolSizeCells = Number.isFinite(parsedToolSize) && parsedToolSize > 0 ? parsedToolSize : 4;

        const state = {
            session: {
                snapshot: null,
                role: 'player',
                initialLoadPending: true,
                caseTransitionId: 0,
                stateCaseId: '',
                pendingCaseId: '',
                pendingRemoteSnapshot: null
            },
            stage: {
                selection: {
                    tokenId: '',
                    entryId: '',
                    templateId: '',
                    evidenceNoteId: '',
                    clockId: ''
                },
                preview: {
                    tokenId: '',
                    timerId: 0,
                    suppressedClickId: '',
                    suppressedClickUntil: 0
                },
                view: {
                    local: { x: 40, y: 40, zoom: 1 },
                    world: { ...defaultWorldSize },
                    fitOnNextMapLoad: true
                },
                pointer: {
                    drag: null,
                    pan: null,
                    lastDragSyncAt: 0,
                    spawnDrag: null
                },
                tool: {
                    current: { mode: toolMode, sizeCells: toolSizeCells },
                    pingVariant: 'attention',
                    askRollPickMode: false,
                    pendingAskRollRequest: null
                },
                placement: {
                    annotation: null,
                    template: null,
                    templateRotate: null,
                    visionConeRotate: null,
                    ruler: null,
                    fog: null,
                    evidenceNote: null,
                    evidenceNoteDrag: null
                }
            },
            ui: {
                combat: { view: 'turns', clockEditorId: '' },
                preferences: {
                    topbarCollapsed: true,
                    showGrid: true,
                    showTokenNames: true,
                    sceneViewMode,
                    localSceneId: '',
                    activeVttPanel: ''
                },
                npcSearch: { open: false, state: null, query: '' },
                overlays: {
                    quickSpawn: null,
                    stageContextMenu: null,
                    tokenInspector: null,
                    initiativeDetail: null,
                    sheetAction: null,
                    npcRoll: null
                },
                queries: { sheetAction: '', playerRoll: '' },
                playerRoll: { menuOpen: false, lastResult: null, mode: 'norm' },
                music: { commandState: { key: '', status: 'stopped' }, volume: 70 },
                menus: { viewOpen: false, toolsOpen: false },
                modals: {
                    dmUnlock: { returnFocusEl: null },
                    rosterSelf: { returnFocusEl: null, selectedId: '', error: '', mapLinkMode: false }
                }
            },
            resources: {
                stageView: null,
                stageInput: null,
                sessionController: null,
                sessionControllerPromise: null,
                unsubscribeSyncStatus: null,
                npcSearch: { loading: false, refreshPromise: null },
                monsters: { directory: [], loading: false, promise: null },
                remoteTokenTweens: new Map(),
                tokenImageRetryKeys: new Map(),
                playerImageUrlsAtLoad: new Map(),
                rollActionGuard: new Map()
            }
        };

        state.ports = Object.freeze({
            actions: createPort(state, 'actions'),
            fields: createPort(state, 'fields'),
            stageInput: createPort(state, 'stageInput')
        });
        return state;
    };

    return Object.freeze({ create, createPort, PORT_MAPS });
}));
