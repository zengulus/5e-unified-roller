(function () {
    const ROLE_STORAGE_PREFIX = 'rtf_vtt_role_';
    const UI_PREFS_STORAGE_PREFIX = 'rtf_vtt_ui_';
    const PROCESSED_INIT_STORAGE_PREFIX = 'rtf_vtt_processed_init_';
    const TRACKER_INITIATIVE_QUEUE_KEY = 'rtf_tracker_initiative_queue';
    const STORE_UPDATED_EVENT = 'rtf-store-updated';
    const DEFAULT_WORLD_SIZE = { width: 2400, height: 1600 };
    const DRAG_SYNC_INTERVAL_MS = 120;
    const TOKEN_DOUBLE_CLICK_MS = 320;
    const SIDE_OPTIONS = ['player', 'ally', 'enemy', 'neutral'];
    const DEFENCE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const SCENE_VIEW_SHARED = 'shared';
    const SCENE_VIEW_LOCAL = 'local';
    const DEFAULT_VTT_CELL_PX = 70;
    const TOKEN_COORD_PRECISION = 1000;
    const MIN_VTT_MAP_SCALE = 0.25;
    const MAX_VTT_MAP_SCALE = 4;
    const DEFAULT_VTT_STATE = {
        activeSceneId: 'scene_1',
        scenes: [
            {
                id: 'scene_1',
                name: 'Scene 1',
                mapImageUrl: '',
                mapScale: 1,
                grid: {
                    cellPx: DEFAULT_VTT_CELL_PX,
                    offsetX: 0,
                    offsetY: 0,
                    cellDistance: 5
                },
                tokens: [],
                fog: []
            }
        ],
        initiative: {
            entries: [],
            round: 1,
            activeEntryId: ''
        }
    };

    let vttState = null;
    let selectedTokenId = '';
    let selectedEntryId = '';
    let localRole = 'dm';
    let uiState = {
        settingsCollapsed: false,
        initiativeCollapsed: false,
        scenePanelCollapsed: false,
        spawnPanelCollapsed: false,
        inspectorPanelCollapsed: false,
        showTokenNames: true,
        sceneViewMode: SCENE_VIEW_SHARED,
        localSceneId: ''
    };
    let npcSearchOpen = false;
    let npcSearchQuery = '';
    let previewTokenId = '';
    let localView = { x: 40, y: 40, zoom: 1 };
    let worldSize = { ...DEFAULT_WORLD_SIZE };
    let mapSize = { width: 0, height: 0 };
    let mapLoadState = { url: '', loaded: false };
    let dragState = null;
    let panState = null;
    let lastDragSyncAt = 0;
    let fitViewOnNextMapLoad = true;
    let unsubscribeSyncStatus = null;
    let vttCollabSession = null;
    let vttCollabInitPromise = null;
    let pendingRemoteVTTSnapshot = null;
    let lastTokenPointerDownId = '';
    let lastTokenPointerDownAt = 0;

    const body = document.body;
    const stageEl = document.getElementById('vtt-stage');
    const mapWorldEl = document.getElementById('vtt-map-world');
    const worldEl = document.getElementById('vtt-world');
    const stageGridEl = document.getElementById('vtt-stage-grid');
    const mapImageEl = document.getElementById('vtt-map-image');
    const gridLayerEl = document.getElementById('vtt-grid-layer');
    const fogLayerEl = document.getElementById('vtt-fog-layer');
    const tokenLayerEl = document.getElementById('vtt-token-layer');
    const caseNameEl = document.getElementById('vtt-case-name');
    const syncChipEl = document.getElementById('vtt-sync-chip');
    const settingsToggleEl = document.getElementById('vtt-settings-toggle');
    const initiativeToggleEl = document.getElementById('vtt-initiative-toggle');
    const scenePanelToggleEl = document.getElementById('vtt-scene-panel-toggle');
    const spawnPanelToggleEl = document.getElementById('vtt-spawn-panel-toggle');
    const inspectorPanelToggleEl = document.getElementById('vtt-inspector-panel-toggle');
    const roleToggleEl = document.getElementById('vtt-role-toggle');
    const tokenNamesToggleEl = document.getElementById('vtt-token-names-toggle');
    const zoomResetEl = document.querySelector('[data-action="zoom-reset"]');
    const activeSceneLabelEl = document.getElementById('vtt-active-scene-label');
    const stageTitleEl = document.getElementById('vtt-stage-title');
    const stageMetaEl = document.getElementById('vtt-stage-meta');
    const roundPillEl = document.getElementById('vtt-round-pill');
    const selectionPillEl = document.getElementById('vtt-selection-pill');
    const tokenInspectorEl = document.getElementById('vtt-token-inspector');
    const initiativeListEl = document.getElementById('vtt-initiative-list');
    const initiativeDetailPanelEl = document.getElementById('vtt-initiative-detail-panel');
    const sceneListEl = document.getElementById('vtt-scene-list');
    const playerSpawnListEl = document.getElementById('vtt-player-spawn-list');
    const npcSearchToggleEl = document.getElementById('vtt-npc-search-toggle');
    const npcSearchPopoverEl = document.getElementById('vtt-npc-search-popover');
    const npcSearchInputEl = document.getElementById('vtt-npc-search-input');
    const npcSearchListEl = document.getElementById('vtt-npc-search-list');

    const escapeHtml = (value = '') => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const deepClone = (value) => JSON.parse(JSON.stringify(value));
    const toNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const clampMapScale = (value, fallback = 1) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return clamp(Math.round(fallback * 1000) / 1000, MIN_VTT_MAP_SCALE, MAX_VTT_MAP_SCALE);
        return clamp(Math.round(parsed * 1000) / 1000, MIN_VTT_MAP_SCALE, MAX_VTT_MAP_SCALE);
    };
    const normalizeTokenCoordinate = (value, fallback = 0) => {
        const parsed = toNumber(value, fallback);
        return Math.max(0, Math.round(parsed * TOKEN_COORD_PRECISION) / TOKEN_COORD_PRECISION);
    };
    const snapTokenCoordinate = (value, fallback = 0) => {
        const safe = normalizeTokenCoordinate(value, fallback);
        const base = Math.floor(safe);
        return safe - base > 0.5 ? base + 1 : base;
    };
    const clampZoom = (value) => clamp(Math.round(value * 1000) / 1000, 0.25, 2.2);
    const positiveModulo = (value, divisor) => {
        if (!divisor) return 0;
        const result = value % divisor;
        return result < 0 ? result + divisor : result;
    };
    const toImageUrl = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^data:image\//i.test(raw)) return raw;
        try {
            return new URL(raw, window.location.href).toString();
        } catch (err) {
            return '';
        }
    };
    const buildId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const buildInitials = (label = '') => {
        const words = String(label || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
    };
    const buildSceneRecord = (scenes, sourceScene = null) => {
        const source = sourceScene && typeof sourceScene === 'object' ? sourceScene : null;
        const nextSceneNumber = (Array.isArray(scenes) ? scenes.length : 0) + 1;
        const nextName = source
            ? `${String(source.name || 'Scene').trim() || 'Scene'} Copy`
            : `Scene ${nextSceneNumber}`;
        const clonedTokens = deepClone(Array.isArray(source && source.tokens) ? source.tokens : []).map((token) => ({
            ...token,
            id: buildId('token')
        }));
        return {
            id: buildId('scene'),
            name: nextName,
            mapImageUrl: source ? String(source.mapImageUrl || '') : '',
            mapScale: source ? clampMapScale(source.mapScale, 1) : 1,
            grid: deepClone(source && source.grid ? source.grid : {
                cellPx: DEFAULT_VTT_CELL_PX,
                offsetX: 0,
                offsetY: 0,
                cellDistance: 5
            }),
            tokens: clonedTokens,
            fog: deepClone(Array.isArray(source && source.fog) ? source.fog : [])
        };
    };
    const serializeConditions = (conditions) => (Array.isArray(conditions) ? conditions.join(', ') : '');
    const parseConditions = (value) => String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 24);
    const serializeHp = (current, max) => {
        const hasCurrent = current !== null && current !== undefined && current !== '';
        const hasMax = max !== null && max !== undefined && max !== '';
        if (!hasCurrent && !hasMax) return 'HP -';
        if (hasCurrent && hasMax) return `HP ${current}/${max}`;
        if (hasCurrent) return `HP ${current}`;
        return `HP -/${max}`;
    };
    const getTokenGrayscale = (token) => {
        if (!token) return 0;
        const hpCurrent = Number(token.hpCurrent);
        const hpMax = Number(token.hpMax);
        if (!Number.isFinite(hpCurrent) || !Number.isFinite(hpMax) || hpMax <= 0) return 0;
        const ratio = clamp(hpCurrent / hpMax, 0, 1);
        return Math.round((1 - ratio) * 1000) / 1000;
    };
    const getStore = () => (window.RTF_STORE && typeof window.RTF_STORE.getVTTState === 'function' ? window.RTF_STORE : null);
    const getActiveCaseId = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
        return String(store.getActiveCaseId() || 'case_primary');
    };
    const getVTTCollabRoomId = (caseId = getActiveCaseId()) => {
        const store = getStore();
        if (store && typeof store.resolveVTTRoomTarget === 'function') {
            const target = store.resolveVTTRoomTarget({ caseId });
            return String(target && target.roomId || '').trim() || `vtt:case:${String(caseId || 'case_primary').trim() || 'case_primary'}`;
        }
        return `vtt:case:${String(caseId || 'case_primary').trim() || 'case_primary'}`;
    };
    const getRoleStorageKey = () => `${ROLE_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getUIPrefsStorageKey = () => `${UI_PREFS_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getProcessedInitStorageKey = () => `${PROCESSED_INIT_STORAGE_PREFIX}${getActiveCaseId()}`;
    const isVTTCollabReady = () => !!(vttCollabSession && typeof vttCollabSession.isActive === 'function' && vttCollabSession.isActive());
    const isDM = () => localRole === 'dm';
    const closeNPCSearch = ({ clearQuery = false } = {}) => {
        npcSearchOpen = false;
        if (clearQuery) npcSearchQuery = '';
    };

    const applyUIPreferences = () => {
        if (body) {
            body.dataset.settingsCollapsed = uiState.settingsCollapsed ? '1' : '0';
            body.dataset.initiativeCollapsed = uiState.initiativeCollapsed ? '1' : '0';
            body.dataset.scenePanelCollapsed = uiState.scenePanelCollapsed ? '1' : '0';
            body.dataset.spawnPanelCollapsed = uiState.spawnPanelCollapsed ? '1' : '0';
            body.dataset.inspectorPanelCollapsed = uiState.inspectorPanelCollapsed ? '1' : '0';
            body.dataset.tokenNamesHidden = uiState.showTokenNames ? '0' : '1';
        }
        if (settingsToggleEl) {
            settingsToggleEl.textContent = uiState.settingsCollapsed ? 'Show Settings' : 'Hide Settings';
            settingsToggleEl.setAttribute('aria-expanded', uiState.settingsCollapsed ? 'false' : 'true');
        }
        if (initiativeToggleEl) {
            initiativeToggleEl.textContent = uiState.initiativeCollapsed ? 'Show Initiative' : 'Hide Initiative';
            initiativeToggleEl.setAttribute('aria-expanded', uiState.initiativeCollapsed ? 'false' : 'true');
        }
        if (scenePanelToggleEl) {
            scenePanelToggleEl.textContent = uiState.scenePanelCollapsed ? 'Show' : 'Hide';
            scenePanelToggleEl.setAttribute('aria-expanded', uiState.scenePanelCollapsed ? 'false' : 'true');
        }
        if (spawnPanelToggleEl) {
            spawnPanelToggleEl.textContent = uiState.spawnPanelCollapsed ? 'Show' : 'Hide';
            spawnPanelToggleEl.setAttribute('aria-expanded', uiState.spawnPanelCollapsed ? 'false' : 'true');
        }
        if (inspectorPanelToggleEl) {
            inspectorPanelToggleEl.textContent = uiState.inspectorPanelCollapsed ? 'Show' : 'Hide';
            inspectorPanelToggleEl.setAttribute('aria-expanded', uiState.inspectorPanelCollapsed ? 'false' : 'true');
        }
        if (tokenNamesToggleEl) {
            tokenNamesToggleEl.textContent = uiState.showTokenNames ? 'Hide Names' : 'Show Names';
            tokenNamesToggleEl.setAttribute('aria-pressed', uiState.showTokenNames ? 'true' : 'false');
        }
    };

    const loadUIPreferences = () => {
        try {
            const raw = localStorage.getItem(getUIPrefsStorageKey());
            const parsed = raw ? JSON.parse(raw) : {};
            uiState = {
                settingsCollapsed: !!(parsed && parsed.settingsCollapsed),
                initiativeCollapsed: !!(parsed && parsed.initiativeCollapsed),
                scenePanelCollapsed: !!(parsed && parsed.scenePanelCollapsed),
                spawnPanelCollapsed: !!(parsed && parsed.spawnPanelCollapsed),
                inspectorPanelCollapsed: !!(parsed && parsed.inspectorPanelCollapsed),
                showTokenNames: parsed && parsed.showTokenNames !== undefined ? !!parsed.showTokenNames : true,
                sceneViewMode: parsed && parsed.sceneViewMode === SCENE_VIEW_LOCAL ? SCENE_VIEW_LOCAL : SCENE_VIEW_SHARED,
                localSceneId: String(parsed && parsed.localSceneId || '').trim()
            };
        } catch (err) {
            uiState = {
                settingsCollapsed: false,
                initiativeCollapsed: false,
                scenePanelCollapsed: false,
                spawnPanelCollapsed: false,
                inspectorPanelCollapsed: false,
                showTokenNames: true,
                sceneViewMode: SCENE_VIEW_SHARED,
                localSceneId: ''
            };
        }
        applyUIPreferences();
    };

    const persistUIPreferences = () => {
        try {
            localStorage.setItem(getUIPrefsStorageKey(), JSON.stringify(uiState));
        } catch (err) {
            // Ignore local-only preference persistence failures.
        }
    };

    const toggleUIPreference = (key) => {
        uiState[key] = !uiState[key];
        persistUIPreferences();
        applyUIPreferences();
        window.requestAnimationFrame(() => {
            applyWorldTransform();
        });
    };

    const getActiveScene = (state = vttState) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return null;
        const viewedSceneId = getViewedSceneId(state);
        return state.scenes.find((scene) => scene.id === viewedSceneId) || state.scenes[0] || null;
    };

    const getSceneById = (sceneId, state = vttState) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return null;
        const targetId = String(sceneId || '').trim();
        if (!targetId) return null;
        return state.scenes.find((scene) => scene.id === targetId) || null;
    };

    const getSceneMapScale = (scene) => clampMapScale(scene && scene.mapScale, 1);

    const getSharedSceneId = (state = vttState) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return '';
        const preferredId = String(state.activeSceneId || '').trim();
        return state.scenes.some((scene) => scene.id === preferredId)
            ? preferredId
            : String(state.scenes[0] && state.scenes[0].id || '').trim();
    };

    const isUsingLocalSceneView = (state = vttState, role = localRole) => {
        if (role !== 'dm' || !state || !Array.isArray(state.scenes) || !state.scenes.length) return false;
        if (uiState.sceneViewMode !== SCENE_VIEW_LOCAL) return false;
        const localSceneId = String(uiState.localSceneId || '').trim();
        return !!localSceneId && state.scenes.some((scene) => scene.id === localSceneId);
    };

    const getViewedSceneId = (state = vttState, role = localRole) => {
        const sharedSceneId = getSharedSceneId(state);
        if (!sharedSceneId) return '';
        if (!isUsingLocalSceneView(state, role)) return sharedSceneId;
        return String(uiState.localSceneId || '').trim() || sharedSceneId;
    };

    const setSceneViewPreference = (mode, sceneId = '') => {
        uiState.sceneViewMode = mode === SCENE_VIEW_LOCAL ? SCENE_VIEW_LOCAL : SCENE_VIEW_SHARED;
        uiState.localSceneId = uiState.sceneViewMode === SCENE_VIEW_LOCAL ? String(sceneId || '').trim() : '';
        persistUIPreferences();
    };

    const getTokenById = (tokenId, state = vttState) => {
        const scene = getActiveScene(state);
        if (!scene || !Array.isArray(scene.tokens)) return null;
        return scene.tokens.find((token) => token.id === tokenId) || null;
    };

    const getEntryById = (entryId, state = vttState) => {
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        return entries.find((entry) => entry.id === entryId) || null;
    };

    const getPlayers = () => {
        const store = getStore();
        return store && typeof store.getPlayers === 'function' ? store.getPlayers() : [];
    };

    const getNPCs = () => {
        const store = getStore();
        return store && typeof store.getNPCs === 'function' ? store.getNPCs() : [];
    };

    const getActiveCaseName = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCase !== 'function') return 'Primary Case';
        const active = store.getActiveCase();
        return active && active.name ? active.name : 'Primary Case';
    };

    const readProcessedRollIds = () => {
        try {
            const raw = localStorage.getItem(getProcessedInitStorageKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '')).filter(Boolean) : [];
        } catch (err) {
            return [];
        }
    };

    const markProcessedRollIds = (rollIds) => {
        const existing = new Set(readProcessedRollIds());
        (Array.isArray(rollIds) ? rollIds : [rollIds]).forEach((entry) => {
            const token = String(entry || '').trim();
            if (token) existing.add(token);
        });
        const next = Array.from(existing.values()).slice(-500);
        localStorage.setItem(getProcessedInitStorageKey(), JSON.stringify(next));
    };

    const normalizeDefences = (value) => {
        const source = value && typeof value === 'object' ? value : {};
        const out = {};
        DEFENCE_KEYS.forEach((key) => {
            const raw = source[key];
            out[key] = raw === null || raw === undefined || raw === '' ? null : clamp(Math.round(toNumber(raw, 0)), 0, 99);
        });
        return out;
    };

    const parsePlayerHp = (rawValue) => {
        const text = String(rawValue || '').trim();
        if (!text) return { hpCurrent: null, hpMax: null };
        if (text.includes('/')) {
            const parts = text.split('/');
            const hpMax = clamp(Math.round(toNumber(parts[0], 0)), 0, 999999);
            const hpCurrent = clamp(Math.round(toNumber(parts[1], hpMax)), 0, 999999);
            return { hpCurrent, hpMax };
        }
        const numeric = clamp(Math.round(toNumber(text, 0)), 0, 999999);
        return { hpCurrent: numeric, hpMax: numeric };
    };

    const buildTokenFromPlayer = (player) => {
        const hp = parsePlayerHp(player && player.hp);
        return {
            id: buildId('token'),
            label: String(player && player.name || 'Player').trim() || 'Player',
            side: 'player',
            imageUrl: toImageUrl(player && player.imageUrl),
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            sourceType: 'player',
            sourceId: String(player && player.id || '').trim(),
            hpCurrent: hp.hpCurrent,
            hpMax: hp.hpMax,
            ac: Number.isFinite(Number(player && player.ac)) ? clamp(Math.round(Number(player.ac)), 0, 99) : null,
            passivePerception: Number.isFinite(Number(player && player.pp)) ? clamp(Math.round(Number(player.pp)), 0, 99) : null,
            defences: normalizeDefences(null),
            conditions: [],
            hidden: false,
            stealthDc: null,
            vision: {
                enabled: true,
                facingDeg: 0,
                arcDeg: 90,
                baseRangeCells: 6,
                passivePerception: 10
            }
        };
    };

    const buildTokenFromNPC = (npc) => {
        const hp = parsePlayerHp(npc && npc.hp);
        return {
            id: buildId('token'),
            label: String(npc && npc.name || 'NPC').trim() || 'NPC',
            side: 'neutral',
            imageUrl: toImageUrl(npc && npc.imageUrl),
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            sourceType: 'npc',
            sourceId: String(npc && npc.id || '').trim(),
            hpCurrent: hp.hpCurrent,
            hpMax: hp.hpMax,
            ac: Number.isFinite(Number(npc && npc.ac)) ? clamp(Math.round(Number(npc.ac)), 0, 99) : null,
            passivePerception: Number.isFinite(Number(npc && npc.pp)) ? clamp(Math.round(Number(npc.pp)), 0, 99) : null,
            defences: normalizeDefences(npc && npc.defences),
            conditions: [],
            hidden: false,
            stealthDc: null,
            vision: {
                enabled: true,
                facingDeg: 0,
                arcDeg: 90,
                baseRangeCells: 6,
                passivePerception: 10
            }
        };
    };

    const buildCustomToken = () => ({
        id: buildId('token'),
        label: 'New Token',
        side: 'neutral',
        imageUrl: '',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        sourceType: '',
        sourceId: '',
        hpCurrent: null,
        hpMax: null,
        ac: null,
        passivePerception: null,
        defences: normalizeDefences(null),
        conditions: [],
        hidden: false,
        stealthDc: null,
        vision: {
            enabled: true,
            facingDeg: 0,
            arcDeg: 90,
            baseRangeCells: 6,
            passivePerception: 10
        }
    });

    const syncInitiativeEntryFromToken = (entry, token) => ({
        ...entry,
        name: token.label,
        linkedTokenId: token.id,
        side: token.side,
        imageUrl: token.imageUrl || '',
        sourceType: token.sourceType || entry.sourceType || '',
        sourceId: token.sourceId || entry.sourceId || '',
        hpCurrent: token.hpCurrent,
        hpMax: token.hpMax,
        ac: token.ac,
        passivePerception: token.passivePerception,
        defences: normalizeDefences(token.defences),
        hidden: !!token.hidden,
        conditions: Array.isArray(token.conditions) ? token.conditions.slice(0, 24) : []
    });

    const buildInitiativeEntryFromToken = (token) => ({
        id: buildId('init'),
        name: token.label,
        linkedTokenId: token.id,
        side: token.side,
        imageUrl: token.imageUrl || '',
        sourceType: token.sourceType || '',
        sourceId: token.sourceId || '',
        total: 0,
        tie: 10,
        hpCurrent: token.hpCurrent,
        hpMax: token.hpMax,
        ac: token.ac,
        passivePerception: token.passivePerception,
        defences: normalizeDefences(token.defences),
        reactionUsed: false,
        concentrating: false,
        hidden: !!token.hidden,
        conditions: Array.isArray(token.conditions) ? token.conditions.slice(0, 24) : []
    });

    const findTokenAcrossScenes = (state, sourceType, sourceId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const found = scene.tokens.find((token) =>
                String(token && token.sourceType || '') === String(sourceType || '')
                && String(token && token.sourceId || '') === String(sourceId || '')
            );
            if (found) return found;
        }
        return null;
    };

    const findTokenByIdAcrossScenes = (state, tokenId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        const targetId = String(tokenId || '').trim();
        if (!targetId) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const found = scene.tokens.find((token) => String(token && token.id || '') === targetId);
            if (found) return found;
        }
        return null;
    };

    const getVisibleTokensForRole = (scene, role = localRole) => {
        if (!scene || !Array.isArray(scene.tokens)) return [];
        if (role === 'dm') return scene.tokens;
        return scene.tokens.filter((token) => !token.hidden);
    };

    const getVisibleSceneTokenForEntry = (entry, state = vttState, role = localRole) => {
        if (!entry) return null;
        const scene = getActiveScene(state);
        const visibleTokens = getVisibleTokensForRole(scene, role);
        if (!visibleTokens.length) return null;
        const linkedId = String(entry.linkedTokenId || '').trim();
        if (linkedId) {
            const linkedToken = visibleTokens.find((token) => token.id === linkedId);
            if (linkedToken) return linkedToken;
        }
        const sourceType = String(entry.sourceType || '').trim();
        const sourceId = String(entry.sourceId || '').trim();
        if (!sourceType || !sourceId) return null;
        return visibleTokens.find((token) =>
            String(token && token.sourceType || '') === sourceType
            && String(token && token.sourceId || '') === sourceId
        ) || null;
    };

    const syncTokenSelectionFromEntry = (entryId, state = vttState, role = localRole) => {
        const entry = getEntryById(entryId, state);
        const token = getVisibleSceneTokenForEntry(entry, state, role);
        selectedTokenId = token ? token.id : '';
        return token;
    };

    const findEntryForToken = (tokenId, state = vttState) => {
        const token = getTokenById(tokenId, state);
        if (!token) return null;
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        return entries.find((entry) =>
            entry.linkedTokenId === token.id
            || (
                token.sourceType
                && token.sourceId
                && String(entry && entry.sourceType || '') === String(token.sourceType || '')
                && String(entry && entry.sourceId || '') === String(token.sourceId || '')
            )
        ) || null;
    };

    const sortInitiativeEntries = (entries) => {
        entries.sort((left, right) =>
            (right.total - left.total)
            || (right.tie - left.tie)
            || String(left.name || '').localeCompare(String(right.name || ''))
        );
    };

    const readSharedVTTSnapshot = () => {
        const store = getStore();
        if (!store) return null;
        if (isVTTCollabReady() && typeof vttCollabSession.getSnapshot === 'function') {
            try {
                return deepClone(vttCollabSession.getSnapshot());
            } catch (err) {
                console.warn('VTT collaboration snapshot read failed', err);
            }
        }
        return deepClone(store.getVTTState(getActiveCaseId()));
    };

    const persistSharedVTTSnapshot = (payload, options = {}) => {
        const store = getStore();
        if (!store) return null;
        if (isVTTCollabReady() && typeof vttCollabSession.syncSnapshot === 'function') {
            Promise.resolve(vttCollabSession.syncSnapshot(payload, options)).catch((err) => {
                console.warn('VTT collaboration snapshot sync failed', err);
            });
            return typeof vttCollabSession.getSnapshot === 'function'
                ? deepClone(vttCollabSession.getSnapshot())
                : deepClone(payload);
        }
        return deepClone(store.updateVTTState(payload, getActiveCaseId()));
    };

    const withDraft = (mutator, options = {}) => {
        const draft = readSharedVTTSnapshot();
        if (!draft) return;
        mutator(draft);
        const saved = persistSharedVTTSnapshot(draft, options);
        vttState = deepClone(saved || draft);
        normalizeSelections();
        if (options.fitView) fitViewOnNextMapLoad = true;
        render();
    };

    const normalizeSelections = () => {
        const scene = getActiveScene();
        const tokens = getVisibleTokensForRole(scene);
        const entries = vttState && vttState.initiative && Array.isArray(vttState.initiative.entries) ? vttState.initiative.entries : [];
        if (isDM() && uiState.sceneViewMode === SCENE_VIEW_LOCAL) {
            const viewedSceneId = getViewedSceneId(vttState, localRole);
            const sharedSceneId = getSharedSceneId(vttState);
            if (!viewedSceneId || viewedSceneId === sharedSceneId) {
                uiState.sceneViewMode = SCENE_VIEW_SHARED;
                uiState.localSceneId = '';
                persistUIPreferences();
            }
        }
        if (!entries.some((entry) => entry.id === selectedEntryId)) {
            selectedEntryId = entries[0] ? entries[0].id : '';
        }
        if (selectedEntryId) {
            syncTokenSelectionFromEntry(selectedEntryId, vttState, localRole);
        } else if (!tokens.some((token) => token.id === selectedTokenId)) {
            selectedTokenId = tokens[0] ? tokens[0].id : '';
        }
        if (!tokens.some((token) => token.id === previewTokenId && token.imageUrl)) {
            previewTokenId = '';
        }
        if (body) {
            body.dataset.vttRole = localRole;
            body.dataset.sceneViewMode = isUsingLocalSceneView(vttState, localRole) ? SCENE_VIEW_LOCAL : SCENE_VIEW_SHARED;
        }
    };

    const getLoadedMapSizeForScene = (scene) => {
        if (!scene || !scene.mapImageUrl) return { width: 0, height: 0 };
        if (mapLoadState.url !== scene.mapImageUrl || !mapLoadState.loaded) return { width: 0, height: 0 };
        const scale = getSceneMapScale(scene);
        return {
            width: Math.max(0, Math.round((mapSize.width || 0) * scale)),
            height: Math.max(0, Math.round((mapSize.height || 0) * scale))
        };
    };

    const getWorldSizeForScene = (scene) => {
        if (!scene) return { ...DEFAULT_WORLD_SIZE };
        const grid = scene.grid || { cellPx: DEFAULT_VTT_CELL_PX, offsetX: 0, offsetY: 0 };
        const loadedMapSize = getLoadedMapSizeForScene(scene);
        let width = loadedMapSize.width || 0;
        let height = loadedMapSize.height || 0;
        const hasTokens = Array.isArray(scene.tokens) && scene.tokens.length;
        if ((scene.mapImageUrl && !loadedMapSize.width) || (!scene.mapImageUrl && !hasTokens)) {
            width = Math.max(width, DEFAULT_WORLD_SIZE.width);
            height = Math.max(height, DEFAULT_WORLD_SIZE.height);
        }
        if (Array.isArray(scene.tokens) && scene.tokens.length) {
            scene.tokens.forEach((token) => {
                width = Math.max(width, grid.offsetX + (token.x + token.w + 4) * grid.cellPx);
                height = Math.max(height, grid.offsetY + (token.y + token.h + 4) * grid.cellPx);
            });
        }
        return {
            width: Math.max(1, Math.round(width)),
            height: Math.max(1, Math.round(height))
        };
    };

    const scaleForZoom = (value) => Math.max(0, Math.round(value * localView.zoom * 1000) / 1000);

    const applyRenderedWorldGeometry = (scene = getActiveScene()) => {
        if (!scene || !mapWorldEl || !worldEl || !mapImageEl || !fogLayerEl || !tokenLayerEl) return;
        const mapDisplaySize = getLoadedMapSizeForScene(scene);
        const scaledMapWidth = scaleForZoom(mapDisplaySize.width || 0);
        const scaledMapHeight = scaleForZoom(mapDisplaySize.height || 0);
        mapWorldEl.style.width = `${scaledMapWidth}px`;
        mapWorldEl.style.height = `${scaledMapHeight}px`;
        mapImageEl.style.width = `${scaledMapWidth}px`;
        mapImageEl.style.height = `${scaledMapHeight}px`;
        worldEl.style.width = `${scaleForZoom(worldSize.width)}px`;
        worldEl.style.height = `${scaleForZoom(worldSize.height)}px`;

        fogLayerEl.querySelectorAll('.vtt-fog-mask').forEach((maskEl) => {
            if (!(maskEl instanceof HTMLElement)) return;
            maskEl.style.left = `${scaleForZoom(toNumber(maskEl.dataset.worldLeft, 0))}px`;
            maskEl.style.top = `${scaleForZoom(toNumber(maskEl.dataset.worldTop, 0))}px`;
            maskEl.style.width = `${scaleForZoom(toNumber(maskEl.dataset.worldWidth, 0))}px`;
            maskEl.style.height = `${scaleForZoom(toNumber(maskEl.dataset.worldHeight, 0))}px`;
        });

        tokenLayerEl.querySelectorAll('.vtt-token').forEach((tokenEl) => {
            if (!(tokenEl instanceof HTMLElement)) return;
            tokenEl.style.left = `${scaleForZoom(toNumber(tokenEl.dataset.worldLeft, 0))}px`;
            tokenEl.style.top = `${scaleForZoom(toNumber(tokenEl.dataset.worldTop, 0))}px`;
            tokenEl.style.width = `${scaleForZoom(toNumber(tokenEl.dataset.worldWidth, 0))}px`;
            tokenEl.style.height = `${scaleForZoom(toNumber(tokenEl.dataset.worldHeight, 0))}px`;
            tokenEl.style.setProperty('--vtt-token-font-scale', String(clamp(localView.zoom, 0.9, 1.9)));
        });
    };

    const applyWorldTransform = (scene = getActiveScene()) => {
        if (zoomResetEl) {
            zoomResetEl.textContent = `${Math.round(localView.zoom * 100)}%`;
        }
        if (mapWorldEl) {
            mapWorldEl.style.transform = `translate(${localView.x}px, ${localView.y}px)`;
        }
        if (!worldEl) return;
        worldEl.style.transform = `translate(${localView.x}px, ${localView.y}px)`;
        renderStageGrid(scene);
    };

    const setZoomAtPoint = (nextZoom, clientX, clientY) => {
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const clampedZoom = clampZoom(nextZoom);
        const stageX = clientX - rect.left;
        const stageY = clientY - rect.top;
        const worldX = (stageX - localView.x) / localView.zoom;
        const worldY = (stageY - localView.y) / localView.zoom;
        localView.zoom = clampedZoom;
        localView.x = Math.round(stageX - worldX * clampedZoom);
        localView.y = Math.round(stageY - worldY * clampedZoom);
        applyRenderedWorldGeometry();
        applyWorldTransform();
    };

    const setZoomAroundStageCenter = (nextZoom) => {
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        setZoomAtPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    const renderStageGrid = (scene = getActiveScene()) => {
        if (!stageGridEl || !scene || !scene.grid) return;
        const cellSize = Math.max(8, Math.round(scene.grid.cellPx * localView.zoom * 1000) / 1000);
        const offsetX = positiveModulo(localView.x + scene.grid.offsetX * localView.zoom, cellSize);
        const offsetY = positiveModulo(localView.y + scene.grid.offsetY * localView.zoom, cellSize);
        stageGridEl.style.backgroundSize = `${cellSize}px ${cellSize}px`;
        stageGridEl.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    };

    const fitViewToWorld = () => {
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const padding = 36;
        const zoom = clamp(
            Math.min(
                (rect.width - padding * 2) / Math.max(1, worldSize.width),
                (rect.height - padding * 2) / Math.max(1, worldSize.height)
            ),
            0.25,
            1.8
        );
        localView.zoom = zoom;
        localView.x = Math.round((rect.width - worldSize.width * zoom) / 2);
        localView.y = Math.round((rect.height - worldSize.height * zoom) / 2);
        applyRenderedWorldGeometry();
        applyWorldTransform();
    };

    const screenToWorld = (clientX, clientY) => {
        const rect = stageEl.getBoundingClientRect();
        return {
            x: (clientX - rect.left - localView.x) / localView.zoom,
            y: (clientY - rect.top - localView.y) / localView.zoom
        };
    };

    const loadRolePreference = () => {
        const raw = localStorage.getItem(getRoleStorageKey());
        localRole = raw === 'player' ? 'player' : 'dm';
        if (body) body.dataset.vttRole = localRole;
    };

    const setRolePreference = (role) => {
        localRole = role === 'player' ? 'player' : 'dm';
        localStorage.setItem(getRoleStorageKey(), localRole);
        if (localRole !== 'dm') {
            closeNPCSearch();
        }
        if (body) body.dataset.vttRole = localRole;
        render();
    };

    const setSyncChipState = ({ state = 'local', label = 'Local', detail = '', retryable = false } = {}) => {
        if (!syncChipEl) return;
        syncChipEl.dataset.state = state;
        syncChipEl.dataset.retryable = retryable ? 'true' : 'false';
        syncChipEl.textContent = label;
        syncChipEl.title = detail || label;
        syncChipEl.setAttribute('aria-label', detail || label);
        syncChipEl.setAttribute('role', retryable ? 'button' : 'status');
        syncChipEl.tabIndex = retryable ? 0 : -1;
    };

    const updateStoreSyncChip = (status) => {
        if (vttCollabSession || vttCollabInitPromise) return;
        const source = status && status.connected
            ? (status.pendingPush ? 'Syncing' : 'Shared')
            : 'Local';
        const detail = source === 'Syncing'
            ? 'Shared VTT sync is pushing updates.'
            : (source === 'Shared'
                ? 'Shared VTT sync is connected through the store.'
                : 'VTT is running locally on this browser.');
        setSyncChipState({
            state: source.toLowerCase(),
            label: source,
            detail,
            retryable: false
        });
    };

    const setVTTCollabStatus = (status = {}) => {
        const source = status && typeof status === 'object' ? status : {};
        const state = source.state === 'live'
            ? 'live'
            : (source.state === 'connecting'
                ? 'connecting'
                : (source.state === 'degraded' ? 'degraded' : 'local'));
        const peerCount = Number.isFinite(source.peerCount) ? Math.max(0, source.peerCount) : 0;
        let label = 'Local';
        if (state === 'live') {
            label = peerCount > 0 ? `Live · ${peerCount}` : 'Live';
        } else if (state === 'connecting') {
            label = 'Live...';
        } else if (state === 'degraded') {
            label = 'Live Off';
        }
        setSyncChipState({
            state,
            label,
            detail: String(source.detail || '').trim() || label,
            retryable: state === 'local' || state === 'degraded'
        });
    };

    const hasLiveVTTConfig = () => {
        const store = getStore();
        if (!store || typeof store.getSyncConfig !== 'function') return false;
        const config = store.getSyncConfig();
        return !!(config
            && config.enabled
            && config.supabaseUrl
            && config.anonKey
            && config.campaignId);
    };

    const applyVTTCollabSnapshot = (payload) => {
        const store = getStore();
        const clean = store && typeof store.normalizeVTTStateSnapshot === 'function'
            ? store.normalizeVTTStateSnapshot(payload)
            : deepClone(payload);
        if (dragState) {
            pendingRemoteVTTSnapshot = clean;
            return;
        }
        pendingRemoteVTTSnapshot = null;
        vttState = deepClone(clean);
        normalizeSelections();
        render();
    };

    const applyPendingRemoteVTTSnapshot = () => {
        if (dragState || !pendingRemoteVTTSnapshot) return false;
        vttState = deepClone(pendingRemoteVTTSnapshot);
        pendingRemoteVTTSnapshot = null;
        normalizeSelections();
        render();
        return true;
    };

    const applyVTTCollabPositionChanges = (changes = [], meta = {}) => {
        if (dragState) {
            if (meta && meta.snapshot) {
                const store = getStore();
                pendingRemoteVTTSnapshot = store && typeof store.normalizeVTTStateSnapshot === 'function'
                    ? store.normalizeVTTStateSnapshot(meta.snapshot)
                    : deepClone(meta.snapshot);
            }
            return;
        }
        if (meta && meta.snapshot) {
            const store = getStore();
            vttState = deepClone(
                store && typeof store.normalizeVTTStateSnapshot === 'function'
                    ? store.normalizeVTTStateSnapshot(meta.snapshot)
                    : meta.snapshot
            );
            normalizeSelections();
            renderStage();
            return;
        }
        if (!vttState) return;
        const sceneMap = new Map(
            Array.isArray(vttState.scenes)
                ? vttState.scenes.map((scene) => [scene.id, scene])
                : []
        );
        let mutated = false;
        (Array.isArray(changes) ? changes : []).forEach((change) => {
            const scene = sceneMap.get(String(change && change.sceneId || '').trim());
            if (!scene || !Array.isArray(scene.tokens)) return;
            const token = scene.tokens.find((entry) => entry && entry.id === String(change && change.tokenId || '').trim());
            if (!token) return;
            const nextX = normalizeTokenCoordinate(change.x, token.x);
            const nextY = normalizeTokenCoordinate(change.y, token.y);
            if (token.x === nextX && token.y === nextY) return;
            token.x = nextX;
            token.y = nextY;
            mutated = true;
        });
        if (!mutated) return;
        normalizeSelections();
        renderStage();
    };

    const initVTTCollab = async () => {
        if (vttCollabInitPromise) return vttCollabInitPromise;
        const store = getStore();
        if (!store || !window.RTF_VTT_COLLAB_READY || typeof window.RTF_VTT_COLLAB_READY.then !== 'function') {
            setVTTCollabStatus({
                state: 'local',
                detail: 'Shared sync is off. VTT changes stay on this device.',
                peerCount: 0
            });
            return null;
        }
        if (!hasLiveVTTConfig()) {
            updateStoreSyncChip(store && typeof store.getSyncStatus === 'function' ? store.getSyncStatus() : { connected: false });
            return null;
        }

        setVTTCollabStatus({
            state: 'connecting',
            detail: 'Connecting live VTT...',
            peerCount: 0
        });

        vttCollabInitPromise = Promise.resolve(window.RTF_VTT_COLLAB_READY)
            .then((api) => {
                if (!api || typeof api.createSession !== 'function') return null;
                return api.createSession({
                    store,
                    roomId: getVTTCollabRoomId(),
                    caseId: getActiveCaseId(),
                    getSeedPayload: () => readSharedVTTSnapshot() || deepClone(DEFAULT_VTT_STATE),
                    getCurrentPayload: () => readSharedVTTSnapshot() || deepClone(DEFAULT_VTT_STATE),
                    applySnapshot: (payload) => applyVTTCollabSnapshot(payload),
                    applyPositionChanges: (changes, meta) => applyVTTCollabPositionChanges(changes, meta),
                    onStatusChange: (status) => setVTTCollabStatus(status)
                });
            })
            .then((session) => {
                if (!session || (typeof session.isActive === 'function' && !session.isActive())) {
                    vttCollabSession = null;
                    updateStoreSyncChip(store && typeof store.getSyncStatus === 'function' ? store.getSyncStatus() : { connected: false });
                    return null;
                }
                vttCollabSession = session;
                setVTTCollabStatus(session.getStatus ? session.getStatus() : {
                    state: 'live',
                    detail: 'Live VTT connected.',
                    peerCount: 0
                });
                return session;
            })
            .catch((err) => {
                console.warn('VTT collaboration init failed', err);
                vttCollabSession = null;
                setVTTCollabStatus({
                    state: 'degraded',
                    detail: 'Live VTT unavailable. Shared VTT mirror still works.',
                    peerCount: 0
                });
                return null;
            });

        return vttCollabInitPromise;
    };

    const refreshVTTCollabRoomIfNeeded = async () => {
        if (!vttCollabSession) return initVTTCollab();
        const expectedCaseId = getActiveCaseId();
        const expectedRoomId = getVTTCollabRoomId(expectedCaseId);
        if (vttCollabSession.roomId === expectedRoomId && vttCollabSession.caseId === expectedCaseId) {
            return vttCollabSession;
        }

        setVTTCollabStatus({
            state: 'connecting',
            detail: 'Switching live VTT room...',
            peerCount: 0
        });

        try {
            if (typeof vttCollabSession.destroy === 'function') {
                await vttCollabSession.destroy();
            }
        } catch (err) {
            console.warn('VTT collaboration room refresh failed', err);
        }

        vttCollabSession = null;
        vttCollabInitPromise = null;
        pendingRemoteVTTSnapshot = null;
        const store = getStore();
        if (store) {
            vttState = deepClone(store.getVTTState(expectedCaseId));
            normalizeSelections();
            render();
        }
        return initVTTCollab();
    };

    const retryVTTCollabConnection = async () => {
        if (!hasLiveVTTConfig()) {
            setVTTCollabStatus({
                state: 'local',
                detail: 'Shared sync is not configured for live VTT on this browser.',
                peerCount: 0
            });
            return null;
        }
        if (syncChipEl && String(syncChipEl.dataset.state || '') === 'connecting') {
            return null;
        }

        setVTTCollabStatus({
            state: 'connecting',
            detail: 'Retrying live VTT connection...',
            peerCount: 0
        });

        if (vttCollabSession && typeof vttCollabSession.destroy === 'function') {
            try {
                await vttCollabSession.destroy();
            } catch (err) {
                console.warn('VTT collaboration retry cleanup failed', err);
            }
        }

        vttCollabSession = null;
        vttCollabInitPromise = null;
        pendingRemoteVTTSnapshot = null;

        const store = getStore();
        if (store && typeof store.connectSync === 'function') {
            try {
                await store.connectSync();
            } catch (err) {
                console.warn('VTT collaboration retry sync connect failed', err);
            }
        }

        return initVTTCollab();
    };

    const bindSyncChipActions = () => {
        if (!syncChipEl || syncChipEl.dataset.bound === '1') return;
        syncChipEl.dataset.bound = '1';

        syncChipEl.addEventListener('click', () => {
            if (syncChipEl.dataset.retryable !== 'true') return;
            retryVTTCollabConnection().catch((err) => {
                console.warn('VTT collaboration retry failed', err);
            });
        });

        syncChipEl.addEventListener('keydown', (event) => {
            if (syncChipEl.dataset.retryable !== 'true') return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            retryVTTCollabConnection().catch((err) => {
                console.warn('VTT collaboration retry failed', err);
            });
        });
    };

    const loadMapForScene = (scene) => {
        if (!scene || !mapImageEl) return;
        if (!scene.mapImageUrl) {
            mapSize = { width: 0, height: 0 };
            mapLoadState = { url: '', loaded: false };
            worldSize = getWorldSizeForScene(scene);
            mapImageEl.removeAttribute('src');
            mapImageEl.style.width = '0px';
            mapImageEl.style.height = '0px';
            mapImageEl.style.display = 'none';
            if (fitViewOnNextMapLoad) {
                fitViewOnNextMapLoad = false;
                fitViewToWorld();
            }
            return;
        }

        if (mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded) return;

        mapSize = { width: 0, height: 0 };
        mapLoadState = { url: scene.mapImageUrl, loaded: false };
        mapImageEl.src = scene.mapImageUrl;
        mapImageEl.style.display = 'none';
        const probe = new Image();
        const requestedUrl = scene.mapImageUrl;
        probe.onload = () => {
            if (!vttState) return;
            const active = getActiveScene();
            if (!active || active.mapImageUrl !== requestedUrl) return;
            mapSize = {
                width: Math.max(1, Math.round(probe.naturalWidth || 1)),
                height: Math.max(1, Math.round(probe.naturalHeight || 1))
            };
            mapLoadState = { url: requestedUrl, loaded: true };
            worldSize = getWorldSizeForScene(active);
            mapImageEl.style.display = 'block';
            if (fitViewOnNextMapLoad) {
                fitViewOnNextMapLoad = false;
                fitViewToWorld();
            }
            renderStage();
        };
        probe.onerror = () => {
            const active = getActiveScene();
            if (!active || active.mapImageUrl !== requestedUrl) return;
            mapSize = { width: 0, height: 0 };
            worldSize = getWorldSizeForScene(active);
            mapLoadState = { url: requestedUrl, loaded: false };
            mapImageEl.removeAttribute('src');
            mapImageEl.style.width = '0px';
            mapImageEl.style.height = '0px';
            mapImageEl.style.display = 'none';
            if (fitViewOnNextMapLoad) {
                fitViewOnNextMapLoad = false;
                fitViewToWorld();
            }
            renderStage();
        };
        probe.src = requestedUrl;
    };

    const renderSpawnLists = () => {
        if (playerSpawnListEl) {
            const players = getPlayers();
            playerSpawnListEl.innerHTML = players.length
                ? players.map((player) => `
                    <button class="vtt-token-spawn" data-action="spawn-player" data-id="${escapeHtml(String(player.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(player.name || 'Player')}</span>
                        <span class="vtt-token-spawn-meta">AC ${escapeHtml(String(player.ac ?? '-'))} · PP ${escapeHtml(String(player.pp ?? '-'))}</span>
                    </button>
                `).join('')
                : '<div class="vtt-empty">No players in the shared store yet.</div>';
        }
    };

    const renderNPCSearchPopover = () => {
        if (!npcSearchToggleEl || !npcSearchPopoverEl || !npcSearchListEl) return;
        const isOpen = npcSearchOpen && isDM();
        npcSearchToggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        npcSearchPopoverEl.hidden = !isOpen;

        if (npcSearchInputEl && document.activeElement !== npcSearchInputEl) {
            npcSearchInputEl.value = npcSearchQuery;
        }

        if (!isOpen) return;

        const query = npcSearchQuery.trim().toLowerCase();
        const npcs = getNPCs().filter((npc) => {
            if (!query) return true;
            const name = String(npc && npc.name || '').toLowerCase();
            const guild = String(npc && npc.guild || '').toLowerCase();
            return name.includes(query) || guild.includes(query);
        });

        npcSearchListEl.innerHTML = npcs.length
                ? npcs.map((npc) => `
                    <button class="vtt-token-spawn" data-action="spawn-npc" data-id="${escapeHtml(String(npc.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(npc.name || 'NPC')}</span>
                        <span class="vtt-token-spawn-meta">${escapeHtml(npc.guild || 'No guild')}</span>
                    </button>
                `).join('')
                : `<div class="vtt-empty">${query ? 'No NPCs match that search.' : 'No NPCs in the shared store yet.'}</div>`;
    };

    const describeScene = (scene) => {
        const tokenCount = scene && Array.isArray(scene.tokens) ? scene.tokens.length : 0;
        return `${scene && scene.mapImageUrl ? 'Map linked' : 'No map'} - ${tokenCount} token${tokenCount === 1 ? '' : 's'}`;
    };

    const renderSceneList = () => {
        if (!sceneListEl) return;
        const scenes = vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [];
        const sharedSceneId = getSharedSceneId(vttState);
        const viewedSceneId = getViewedSceneId(vttState, localRole);
        const usingLocalView = isUsingLocalSceneView(vttState, localRole);
        const sharedScene = getSceneById(sharedSceneId, vttState);
        const viewedScene = getSceneById(viewedSceneId, vttState) || scenes[0] || null;
        const routeNote = viewedScene && sharedScene && viewedScene.id !== sharedScene.id
            ? `DM is previewing ${viewedScene.name || 'this scene'}. Players stay on ${sharedScene.name || 'the shared scene'} until Player Location changes.`
            : `DM and players are both on ${sharedScene && sharedScene.name ? sharedScene.name : 'the shared scene'}. Change Player Location to move everyone.`;
        sceneListEl.innerHTML = scenes.length
            ? `
                <div class="vtt-scene-manager">
                    <div class="vtt-scene-select-grid">
                        <label class="vtt-field vtt-field-tight vtt-scene-select-field">
                            <span>DM Location</span>
                            <select data-scene-picker="dm">
                                ${scenes.map((scene) => `
                                    <option value="${escapeHtml(scene.id)}"${scene.id === viewedSceneId ? ' selected' : ''}>${escapeHtml(scene.name || 'Scene')}</option>
                                `).join('')}
                            </select>
                        </label>
                        <label class="vtt-field vtt-field-tight vtt-scene-select-field">
                            <span>Player Location</span>
                            <select data-scene-picker="shared">
                                ${scenes.map((scene) => `
                                    <option value="${escapeHtml(scene.id)}"${scene.id === sharedSceneId ? ' selected' : ''}>${escapeHtml(scene.name || 'Scene')}</option>
                                `).join('')}
                            </select>
                        </label>
                    </div>
                    <div class="vtt-scene-summary-card${usingLocalView && viewedScene && sharedScene && viewedScene.id !== sharedScene.id ? ' is-dm-local' : ''}">
                        <div class="vtt-scene-summary-top">
                            <div class="vtt-scene-summary-copy">
                                <span class="vtt-scene-summary-eyebrow">Current DM Scene</span>
                                <strong class="vtt-scene-summary-title">${escapeHtml(viewedScene && viewedScene.name ? viewedScene.name : 'Scene')}</strong>
                                <span class="vtt-scene-summary-meta">${escapeHtml(describeScene(viewedScene))}</span>
                            </div>
                            <div class="vtt-scene-tag-row">
                                <span class="vtt-scene-tag">${usingLocalView && viewedScene && sharedScene && viewedScene.id !== sharedScene.id ? 'DM Private' : 'Shared'}</span>
                                <span class="vtt-scene-tag">${scenes.length} Scene${scenes.length === 1 ? '' : 's'}</span>
                            </div>
                        </div>
                        <div class="vtt-scene-summary-note">${escapeHtml(routeNote)}</div>
                        <div class="vtt-scene-action-row">
                            <button class="vtt-chip-btn" data-action="clone-current-scene"${viewedScene ? '' : ' disabled'}>Clone Current</button>
                            <button class="vtt-chip-btn danger" data-action="delete-current-scene"${scenes.length <= 1 || !viewedScene ? ' disabled' : ''}>Delete Current</button>
                        </div>
                    </div>
                </div>
            `
            : '<div class="vtt-empty">No scenes yet.</div>';
    };

    const renderTokenInspector = () => {
        const token = getTokenById(selectedTokenId);
        if (!selectionPillEl || !tokenInspectorEl) return;
        if (!isDM() && token && token.hidden) {
            selectionPillEl.textContent = 'No Token';
            tokenInspectorEl.innerHTML = '<div class="vtt-empty">Select a visible token on the map to inspect it.</div>';
            return;
        }
        selectionPillEl.textContent = token ? token.label : 'No Token';
        if (!token) {
            tokenInspectorEl.innerHTML = '<div class="vtt-empty">Select a token on the map to inspect it.</div>';
            return;
        }

        if (!isDM()) {
            tokenInspectorEl.innerHTML = `
                <div class="vtt-inspector-stack">
                    <div class="vtt-defence-chip-row">
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">AC</span><strong>${escapeHtml(String(token.ac ?? '-'))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">HP</span><strong>${escapeHtml(serializeHp(token.hpCurrent, token.hpMax).replace('HP ', ''))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">PP</span><strong>${escapeHtml(String(token.passivePerception ?? '-'))}</strong></div>
                    </div>
                    <div class="vtt-detail-note">${escapeHtml(token.label)} is selected. DM-only editing controls are hidden in Player mode.</div>
                </div>
            `;
            return;
        }

        tokenInspectorEl.innerHTML = `
            <div class="vtt-inspector-stack">
                <label class="vtt-field">
                    <span>Label</span>
                    <input class="vtt-inspector-input" type="text" data-token-field="label" value="${escapeHtml(token.label)}">
                </label>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Side</span>
                        <select class="vtt-inspector-select" data-token-field="side">
                            ${SIDE_OPTIONS.map((side) => `<option value="${side}"${token.side === side ? ' selected' : ''}>${side}</option>`).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Image URL</span>
                        <input class="vtt-inspector-input" type="text" data-token-field="imageUrl" value="${escapeHtml(token.imageUrl || '')}">
                    </label>
                    <label class="vtt-field">
                        <span>HP Current</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="hpCurrent" value="${token.hpCurrent ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>HP Max</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="hpMax" value="${token.hpMax ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>AC</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="ac" value="${token.ac ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Passive Perception</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="passivePerception" value="${token.passivePerception ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Width</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="w" min="1" value="${escapeHtml(String(token.w || 1))}">
                    </label>
                    <label class="vtt-field">
                        <span>Height</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="h" min="1" value="${escapeHtml(String(token.h || 1))}">
                    </label>
                </div>
                <div class="vtt-chip-row">
                    <button class="vtt-chip-btn" data-action="set-token-size" data-id="${escapeHtml(token.id)}" data-size="1">1x1</button>
                    <button class="vtt-chip-btn" data-action="set-token-size" data-id="${escapeHtml(token.id)}" data-size="2">2x2</button>
                </div>
                <label class="vtt-inspector-check">
                    <input type="checkbox" data-token-field="hidden"${token.hidden ? ' checked' : ''}>
                    <span>Hidden In Player Mode</span>
                </label>
                <label class="vtt-field">
                    <span>Conditions</span>
                    <textarea class="vtt-inspector-textarea" data-token-field="conditions">${escapeHtml(serializeConditions(token.conditions))}</textarea>
                </label>
                <div class="vtt-inspector-actions">
                    <button class="vtt-inline-btn" data-action="add-token-to-initiative" data-id="${escapeHtml(token.id)}">Add To Initiative</button>
                    <button class="vtt-inline-btn danger" data-action="delete-token" data-id="${escapeHtml(token.id)}">Delete Token</button>
                </div>
            </div>
        `;
    };

    const renderInitiativeList = () => {
        if (!initiativeListEl || !roundPillEl) return;
        const initiative = vttState && vttState.initiative ? vttState.initiative : { entries: [], round: 1, activeEntryId: '' };
        roundPillEl.textContent = `Round ${initiative.round || 1}`;
        if (!Array.isArray(initiative.entries) || !initiative.entries.length) {
            initiativeListEl.innerHTML = '<div class="vtt-empty">No combatants yet. Add a token to initiative or roll from the Character Sheet.</div>';
            return;
        }

        initiativeListEl.innerHTML = initiative.entries.map((entry) => `
            <div class="vtt-entry${entry.id === selectedEntryId ? ' is-selected' : ''}${entry.id === initiative.activeEntryId ? ' is-active-turn' : ''}" data-action="select-entry" data-id="${escapeHtml(entry.id)}">
                <div class="vtt-entry-top">
                    <div class="vtt-entry-name">${escapeHtml(entry.name || 'Combatant')}</div>
                    <div class="vtt-entry-score">${escapeHtml(String(entry.total ?? 0))}</div>
                </div>
                <div class="vtt-entry-meta">
                    <span class="vtt-entry-tag">Tie ${escapeHtml(String(entry.tie ?? 10))}</span>
                    <span class="vtt-entry-tag">${escapeHtml(serializeHp(entry.hpCurrent, entry.hpMax))}</span>
                    ${entry.id === initiative.activeEntryId ? '<span class="vtt-entry-tag">Active Turn</span>' : ''}
                    ${entry.reactionUsed ? '<span class="vtt-entry-tag">Reaction Used</span>' : ''}
                    ${entry.concentrating ? '<span class="vtt-entry-tag">Concentrating</span>' : ''}
                </div>
                ${isDM() ? `
                    <div class="vtt-entry-actions">
                        <button class="vtt-inline-btn" data-action="toggle-reaction" data-id="${escapeHtml(entry.id)}">${entry.reactionUsed ? 'Reset Reaction' : 'Use Reaction'}</button>
                        <button class="vtt-inline-btn" data-action="toggle-concentration" data-id="${escapeHtml(entry.id)}">${entry.concentrating ? 'Drop Concentration' : 'Concentrating'}</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    };

    const renderInitiativeDetail = () => {
        if (!initiativeDetailPanelEl) return;
        const entry = getEntryById(selectedEntryId);
        if (!entry) {
            initiativeDetailPanelEl.innerHTML = '<div class="vtt-empty">Select an initiative entry to inspect it.</div>';
            return;
        }

        if (!isDM()) {
            initiativeDetailPanelEl.innerHTML = '<div class="vtt-empty">DM-only initiative details are hidden in Player mode.</div>';
            return;
        }

        initiativeDetailPanelEl.innerHTML = `
            <div class="vtt-panel-head">
                <h2>Entry Details</h2>
                <span class="vtt-panel-pill">${escapeHtml(entry.name || 'Combatant')}</span>
            </div>
            <div class="vtt-entry-detail-stack">
                <div class="vtt-entry-detail-grid">
                    <label class="vtt-field">
                        <span>Name</span>
                        <input class="vtt-entry-input" type="text" data-entry-field="name" value="${escapeHtml(entry.name || '')}">
                    </label>
                    <label class="vtt-field">
                        <span>Initiative</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="total" value="${escapeHtml(String(entry.total ?? 0))}">
                    </label>
                    <label class="vtt-field">
                        <span>Tie</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="tie" value="${escapeHtml(String(entry.tie ?? 10))}">
                    </label>
                    <label class="vtt-field">
                        <span>Passive Perception</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="passivePerception" value="${entry.passivePerception ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>AC</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="ac" value="${entry.ac ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>HP</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="hpCurrent" value="${entry.hpCurrent ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>HP Max</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="hpMax" value="${entry.hpMax ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Linked Token</span>
                        <input class="vtt-entry-input" type="text" value="${escapeHtml(entry.linkedTokenId || 'Unlinked')}" readonly>
                    </label>
                </div>
                <div>
                    <div class="vtt-subhead">Defences</div>
                    <div class="vtt-defence-grid">
                        ${DEFENCE_KEYS.map((key) => `
                            <label class="vtt-field">
                                <span>${key.toUpperCase()}</span>
                                <input class="vtt-entry-input" type="number" data-entry-defence="${key}" value="${entry.defences && entry.defences[key] !== null ? entry.defences[key] : ''}">
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="move-entry-up" data-id="${escapeHtml(entry.id)}">Move Up</button>
                    <button class="vtt-inline-btn" data-action="move-entry-down" data-id="${escapeHtml(entry.id)}">Move Down</button>
                    <button class="vtt-inline-btn danger" data-action="remove-entry" data-id="${escapeHtml(entry.id)}">Remove</button>
                </div>
            </div>
        `;
    };

    const renderStage = () => {
        const scene = getActiveScene();
        if (!scene || !mapWorldEl || !worldEl || !gridLayerEl || !fogLayerEl || !tokenLayerEl) return;

        loadMapForScene(scene);
        worldSize = getWorldSizeForScene(scene);
        const mapDisplaySize = getLoadedMapSizeForScene(scene);
        mapImageEl.style.display = mapDisplaySize.width && mapDisplaySize.height ? 'block' : 'none';

        fogLayerEl.innerHTML = Array.isArray(scene.fog)
            ? scene.fog.map((mask) => `
                <div class="vtt-fog-mask"
                    data-world-left="${escapeHtml(String(mask.x))}"
                    data-world-top="${escapeHtml(String(mask.y))}"
                    data-world-width="${escapeHtml(String(mask.w))}"
                    data-world-height="${escapeHtml(String(mask.h))}"></div>
            `).join('')
            : '';

        const visibleTokens = getVisibleTokensForRole(scene);
        const initiative = vttState && vttState.initiative ? vttState.initiative : { activeEntryId: '' };
        const activeTurnToken = getVisibleSceneTokenForEntry(getEntryById(initiative.activeEntryId), vttState, localRole);
        const focusedEntryToken = getVisibleSceneTokenForEntry(getEntryById(selectedEntryId), vttState, localRole);
        const activeTurnTokenId = activeTurnToken ? activeTurnToken.id : '';
        const focusedEntryTokenId = focusedEntryToken ? focusedEntryToken.id : '';

        tokenLayerEl.innerHTML = visibleTokens.map((token) => `
            <div class="vtt-token${token.imageUrl ? ' has-image' : ''}${token.id === selectedTokenId ? ' is-selected' : ''}${token.id === focusedEntryTokenId ? ' is-entry-linked' : ''}${token.id === activeTurnTokenId ? ' is-active-turn' : ''}${token.hidden ? ' is-hidden' : ''}${token.id === previewTokenId ? ' is-preview-open' : ''}"
                data-token-id="${escapeHtml(token.id)}"
                data-id="${escapeHtml(token.id)}"
                data-action="select-token"
                data-side="${escapeHtml(token.side || 'neutral')}"
                data-world-left="${escapeHtml(String(scene.grid.offsetX + token.x * scene.grid.cellPx))}"
                data-world-top="${escapeHtml(String(scene.grid.offsetY + token.y * scene.grid.cellPx))}"
                data-world-width="${escapeHtml(String(token.w * scene.grid.cellPx))}"
                data-world-height="${escapeHtml(String(token.h * scene.grid.cellPx))}"
                style="--vtt-token-grayscale:${getTokenGrayscale(token)};">
                <div class="vtt-token-face">
                    ${token.imageUrl ? `<img class="vtt-token-image" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.label || 'Token')}" draggable="false">` : `<div class="vtt-token-initials">${escapeHtml(buildInitials(token.label))}</div>`}
                </div>
                ${token.imageUrl ? `<div class="vtt-token-hover-card"><img class="vtt-token-hover-image" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.label || 'Token')} portrait" draggable="false"></div>` : ''}
                <div class="vtt-token-subtitle">${escapeHtml(token.label || 'Token')}</div>
            </div>
        `).join('');

        applyRenderedWorldGeometry(scene);
        if (fitViewOnNextMapLoad && scene.mapImageUrl && mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded) {
            fitViewOnNextMapLoad = false;
            fitViewToWorld();
        } else {
            applyWorldTransform(scene);
        }
    };

    const renderSceneControls = () => {
        const scene = getActiveScene();
        if (!scene) return;
        const sharedScene = getSceneById(getSharedSceneId(vttState), vttState) || scene;
        const usingLocalView = isUsingLocalSceneView(vttState, localRole);
        const baseStageMeta = 'Drag empty space to pan. Two-finger scroll pans. Pinch or Ctrl-scroll zooms. Drag tokens freely. Double-click a token to snap it to the grid. Arrow keys move the selected token by one cell. Right-click a token image to preview it.';
        applyUIPreferences();
        renderSceneList();
        if (caseNameEl) caseNameEl.textContent = getActiveCaseName();
        if (roleToggleEl) roleToggleEl.textContent = `Role: ${isDM() ? 'DM' : 'Player'}`;
        if (activeSceneLabelEl) activeSceneLabelEl.textContent = `Players: ${sharedScene.name || 'Scene'}`;
        if (stageTitleEl) stageTitleEl.textContent = scene.name || 'Scene';
        if (stageMetaEl) {
            stageMetaEl.textContent = isDM() && usingLocalView && sharedScene.id !== scene.id
                ? `DM is previewing ${scene.name || 'this scene'} while players stay on ${sharedScene.name || 'the shared scene'}. ${baseStageMeta}`
                : baseStageMeta;
        }
        const sceneNameEl = document.getElementById('scene-name');
        const mapUrlEl = document.getElementById('scene-map-url');
        const scaleEl = document.getElementById('scene-map-scale');
        const distanceEl = document.getElementById('scene-grid-distance');
        const offsetXEl = document.getElementById('scene-grid-offset-x');
        const offsetYEl = document.getElementById('scene-grid-offset-y');
        if (sceneNameEl && document.activeElement !== sceneNameEl) sceneNameEl.value = scene.name || '';
        if (mapUrlEl && document.activeElement !== mapUrlEl) mapUrlEl.value = scene.mapImageUrl || '';
        if (scaleEl && document.activeElement !== scaleEl) scaleEl.value = String(Math.round(getSceneMapScale(scene) * 100));
        if (distanceEl && document.activeElement !== distanceEl) distanceEl.value = String(scene.grid.cellDistance || 5);
        if (offsetXEl && document.activeElement !== offsetXEl) offsetXEl.value = String(scene.grid.offsetX || 0);
        if (offsetYEl && document.activeElement !== offsetYEl) offsetYEl.value = String(scene.grid.offsetY || 0);
    };

    const render = () => {
        normalizeSelections();
        renderSceneControls();
        renderSpawnLists();
        renderNPCSearchPopover();
        renderStage();
        renderTokenInspector();
        renderInitiativeList();
        renderInitiativeDetail();
    };

    const updateSelectedToken = (mutator) => {
        if (!selectedTokenId) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const idx = scene.tokens.findIndex((token) => token.id === selectedTokenId);
            if (idx < 0) return;
            mutator(scene.tokens[idx], draft);
            draft.initiative.entries = draft.initiative.entries.map((entry) => {
                if (entry.linkedTokenId === selectedTokenId) return syncInitiativeEntryFromToken(entry, scene.tokens[idx]);
                return entry;
            });
        });
    };

    const updateSelectedEntry = (mutator) => {
        if (!selectedEntryId) return;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === selectedEntryId);
            if (idx < 0) return;
            mutator(entries[idx], draft);
            const linkedToken = findTokenByIdAcrossScenes(draft, entries[idx].linkedTokenId)
                || (
                    entries[idx].sourceType && entries[idx].sourceId
                        ? findTokenAcrossScenes(draft, entries[idx].sourceType, entries[idx].sourceId)
                        : null
                );
            if (linkedToken) {
                entries[idx].linkedTokenId = linkedToken.id;
                linkedToken.hpCurrent = entries[idx].hpCurrent;
                linkedToken.hpMax = entries[idx].hpMax;
                linkedToken.ac = entries[idx].ac;
                linkedToken.label = entries[idx].name || linkedToken.label;
                linkedToken.passivePerception = entries[idx].passivePerception;
                linkedToken.defences = normalizeDefences(entries[idx].defences);
            }
        });
    };

    const addTokenToInitiative = (tokenId) => {
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const token = scene.tokens.find((entry) => entry.id === tokenId);
            if (!token) return;
            const entries = draft.initiative.entries;
            const existingIdx = entries.findIndex((entry) =>
                entry.linkedTokenId === token.id
                || (token.sourceType && token.sourceId && entry.sourceType === token.sourceType && entry.sourceId === token.sourceId)
            );
            if (existingIdx >= 0) {
                entries[existingIdx] = syncInitiativeEntryFromToken(entries[existingIdx], token);
                selectedEntryId = entries[existingIdx].id;
            } else {
                const nextEntry = buildInitiativeEntryFromToken(token);
                entries.push(nextEntry);
                sortInitiativeEntries(entries);
                selectedEntryId = nextEntry.id;
            }
            if (!draft.initiative.activeEntryId && entries[0]) draft.initiative.activeEntryId = entries[0].id;
        });
    };

    const snapTokenToGrid = (tokenId) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId) return;
        const token = getTokenById(targetId);
        if (!token) return;
        const nextX = snapTokenCoordinate(token.x, token.x);
        const nextY = snapTokenCoordinate(token.y, token.y);
        if (token.x === nextX && token.y === nextY) return;

        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const draftToken = scene.tokens.find((entry) => entry && entry.id === targetId);
            if (!draftToken) return;
            draftToken.x = nextX;
            draftToken.y = nextY;
        });
    };

    const moveSelectedTokenByCells = (deltaX, deltaY) => {
        if (!selectedTokenId) return false;
        const token = getTokenById(selectedTokenId);
        if (!token) return false;
        const nextX = Math.max(0, snapTokenCoordinate(token.x, token.x) + deltaX);
        const nextY = Math.max(0, snapTokenCoordinate(token.y, token.y) + deltaY);
        if (token.x === nextX && token.y === nextY) return false;

        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const draftToken = scene.tokens.find((entry) => entry && entry.id === selectedTokenId);
            if (!draftToken) return;
            draftToken.x = nextX;
            draftToken.y = nextY;
        });
        return true;
    };

    const syncDraggedState = (force = false) => {
        const store = getStore();
        if (!store || !vttState) return;
        const now = Date.now();
        if (!force && now - lastDragSyncAt < DRAG_SYNC_INTERVAL_MS) return;
        const localToken = dragState ? getTokenById(dragState.tokenId, vttState) : null;
        const scene = getActiveScene(vttState);

        if (!localToken || !scene) {
            vttState = readSharedVTTSnapshot() || deepClone(vttState);
            lastDragSyncAt = now;
            return;
        }

        if (isVTTCollabReady() && typeof vttCollabSession.updateTokenPositions === 'function') {
            Promise.resolve(vttCollabSession.updateTokenPositions([{
                sceneId: scene.id,
                tokenId: localToken.id,
                x: localToken.x,
                y: localToken.y
            }], { flushNow: force })).catch((err) => {
                console.warn('VTT collaboration drag sync failed', err);
            });
            if (typeof vttCollabSession.getSnapshot === 'function') {
                vttState = deepClone(vttCollabSession.getSnapshot());
            }
            lastDragSyncAt = now;
            return;
        }

        const draft = deepClone(store.getVTTState(getActiveCaseId()));
        const draftScene = getActiveScene(draft);
        const idx = draftScene && Array.isArray(draftScene.tokens)
            ? draftScene.tokens.findIndex((token) => token.id === (dragState && dragState.tokenId))
            : -1;
        if (!draftScene || idx < 0) {
            vttState = deepClone(draft);
            lastDragSyncAt = now;
            return;
        }

        draftScene.tokens[idx] = {
            ...draftScene.tokens[idx],
            x: localToken.x,
            y: localToken.y
        };

        const saved = store.updateVTTState(draft, getActiveCaseId());
        vttState = deepClone(saved);
        lastDragSyncAt = now;
    };

    const advanceTurn = (direction) => {
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            if (!entries.length) {
                draft.initiative.activeEntryId = '';
                draft.initiative.round = 1;
                return;
            }
            const currentIdx = entries.findIndex((entry) => entry.id === draft.initiative.activeEntryId);
            const safeIdx = currentIdx >= 0 ? currentIdx : 0;
            if (direction > 0) {
                const nextIdx = (safeIdx + 1) % entries.length;
                if (safeIdx === entries.length - 1) draft.initiative.round += 1;
                draft.initiative.activeEntryId = entries[nextIdx].id;
                return;
            }
            const prevIdx = (safeIdx - 1 + entries.length) % entries.length;
            if (safeIdx === 0) draft.initiative.round = Math.max(1, (draft.initiative.round || 1) - 1);
            draft.initiative.activeEntryId = entries[prevIdx].id;
        });
    };

    const reorderEntry = (entryId, delta) => {
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === entryId);
            if (idx < 0) return;
            const nextIdx = clamp(idx + delta, 0, entries.length - 1);
            if (nextIdx === idx) return;
            const [row] = entries.splice(idx, 1);
            entries.splice(nextIdx, 0, row);
        });
    };

    const removeEntry = (entryId) => {
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === entryId);
            if (idx < 0) return;
            const removed = entries[idx];
            entries.splice(idx, 1);
            if (draft.initiative.activeEntryId === removed.id) {
                draft.initiative.activeEntryId = entries[idx] ? entries[idx].id : (entries[idx - 1] ? entries[idx - 1].id : '');
            }
            if (selectedEntryId === removed.id) selectedEntryId = draft.initiative.activeEntryId || '';
        });
    };

    const handleAction = (actionEl) => {
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        const id = String(actionEl.dataset.id || '').trim();

        if (action === 'toggle-role') {
            setRolePreference(isDM() ? 'player' : 'dm');
            return;
        }
        if (action === 'toggle-settings') {
            toggleUIPreference('settingsCollapsed');
            return;
        }
        if (action === 'toggle-initiative') {
            toggleUIPreference('initiativeCollapsed');
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
        if (action === 'toggle-token-names') {
            toggleUIPreference('showTokenNames');
            return;
        }

        if (action === 'zoom-in') {
            setZoomAroundStageCenter(localView.zoom + 0.12);
            return;
        }
        if (action === 'zoom-out') {
            setZoomAroundStageCenter(localView.zoom - 0.12);
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

        if (action === 'toggle-npc-search') {
            if (!isDM()) return;
            npcSearchOpen = !npcSearchOpen;
            renderNPCSearchPopover();
            if (npcSearchOpen && npcSearchInputEl) {
                window.requestAnimationFrame(() => {
                    npcSearchInputEl.focus();
                    npcSearchInputEl.select();
                });
            }
            return;
        }

        if (!isDM() && action !== 'select-token' && action !== 'select-entry') return;

        if (action === 'clone-current-scene') {
            const sourceScene = getActiveScene(vttState);
            if (!sourceScene) return;
            const nextScene = buildSceneRecord(vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [], sourceScene);
            setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'delete-current-scene') {
            const targetSceneId = getViewedSceneId(vttState, localRole);
            if (!targetSceneId) return;
            const viewedSceneId = getViewedSceneId(vttState, localRole);
            const sharedSceneId = getSharedSceneId(vttState);
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
                if (wasViewed && !wasActive) {
                    const fallbackScene = draft.scenes[Math.max(0, idx - 1)] || draft.scenes[0];
                    setSceneViewPreference(SCENE_VIEW_LOCAL, fallbackScene ? fallbackScene.id : getSharedSceneId(draft));
                } else if (wasActive || targetSceneId === sharedSceneId) {
                    setSceneViewPreference(SCENE_VIEW_SHARED);
                }
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'create-scene') {
            const nextScene = buildSceneRecord(vttState && Array.isArray(vttState.scenes) ? vttState.scenes : []);
            setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'view-scene-local') {
            setSceneViewPreference(SCENE_VIEW_LOCAL, id);
            previewTokenId = '';
            fitViewOnNextMapLoad = true;
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
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'duplicate-scene') {
            const sourceScene = Array.isArray(vttState && vttState.scenes)
                ? vttState.scenes.find((entry) => entry.id === id) || getActiveScene(vttState)
                : null;
            const nextScene = buildSceneRecord(vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [], sourceScene);
            setSceneViewPreference(SCENE_VIEW_LOCAL, nextScene.id);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'delete-scene') {
            const viewedSceneId = getViewedSceneId(vttState, localRole);
            const sharedSceneId = getSharedSceneId(vttState);
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
                if (wasViewed && !wasActive) {
                    const fallbackScene = draft.scenes[Math.max(0, idx - 1)] || draft.scenes[0];
                    setSceneViewPreference(SCENE_VIEW_LOCAL, fallbackScene ? fallbackScene.id : getSharedSceneId(draft));
                } else if (wasActive || id === sharedSceneId) {
                    setSceneViewPreference(SCENE_VIEW_SHARED);
                }
                previewTokenId = '';
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
            closeNPCSearch();
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                const token = buildCustomToken();
                const existingCount = Array.isArray(scene.tokens) ? scene.tokens.length : 0;
                token.x = existingCount * 2;
                scene.tokens.push(token);
                selectedTokenId = token.id;
            });
            return;
        }

        if (action === 'spawn-player') {
            const player = getPlayers().find((entry) => String(entry && entry.id || '') === id);
            if (!player) return;
            closeNPCSearch();
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                const token = buildTokenFromPlayer(player);
                token.x = (scene.tokens || []).length * 2;
                scene.tokens.push(token);
                selectedTokenId = token.id;
            });
            return;
        }

        if (action === 'spawn-npc') {
            const npc = getNPCs().find((entry) => String(entry && entry.id || '') === id);
            if (!npc) return;
            closeNPCSearch({ clearQuery: true });
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                const token = buildTokenFromNPC(npc);
                token.x = (scene.tokens || []).length * 2;
                scene.tokens.push(token);
                selectedTokenId = token.id;
            });
            return;
        }

        if (action === 'select-token') {
            selectedTokenId = id;
            const linkedEntry = findEntryForToken(id);
            selectedEntryId = linkedEntry ? linkedEntry.id : '';
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderStage();
            return;
        }

        if (action === 'delete-token') {
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene || !Array.isArray(scene.tokens)) return;
                scene.tokens = scene.tokens.filter((token) => token.id !== id);
                draft.initiative.entries = draft.initiative.entries.map((entry) => {
                    if (entry.linkedTokenId !== id) return entry;
                    return { ...entry, linkedTokenId: '' };
                });
                if (selectedTokenId === id) selectedTokenId = '';
                if (previewTokenId === id) previewTokenId = '';
            });
            return;
        }

        if (action === 'set-token-size') {
            const size = Math.max(1, Math.round(toNumber(actionEl.dataset.size, 1)));
            selectedTokenId = id || selectedTokenId;
            updateSelectedToken((token) => {
                token.w = size;
                token.h = size;
            });
            return;
        }

        if (action === 'add-token-to-initiative') {
            addTokenToInitiative(id || selectedTokenId);
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

        if (action === 'select-entry') {
            selectedEntryId = id;
            syncTokenSelectionFromEntry(id);
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderStage();
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
            selectedEntryId = id || selectedEntryId;
            updateSelectedEntry((entry) => {
                entry.reactionUsed = !entry.reactionUsed;
            });
            return;
        }

        if (action === 'toggle-concentration') {
            selectedEntryId = id || selectedEntryId;
            updateSelectedEntry((entry) => {
                entry.concentrating = !entry.concentrating;
            });
        }
    };

    const handleNPCSearchInput = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target !== npcSearchInputEl) return;
        npcSearchQuery = target.value || '';
        renderNPCSearchPopover();
    };

    const handleFieldChange = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (event.type === 'input' && target instanceof HTMLInputElement) return;
        if (event.type === 'input' && target instanceof HTMLTextAreaElement) return;

        if (target instanceof HTMLSelectElement && target.dataset.scenePicker) {
            if (event.type !== 'change') return;
            const sceneId = String(target.value || '').trim();
            const scenes = vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [];
            if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) return;

            if (target.dataset.scenePicker === 'dm') {
                const sharedSceneId = getSharedSceneId(vttState);
                if (sceneId === sharedSceneId) {
                    setSceneViewPreference(SCENE_VIEW_SHARED);
                } else {
                    setSceneViewPreference(SCENE_VIEW_LOCAL, sceneId);
                }
                previewTokenId = '';
                fitViewOnNextMapLoad = true;
                render();
                return;
            }

            const shouldFit = !isUsingLocalSceneView(vttState, localRole) || getViewedSceneId(vttState, localRole) === sceneId;
            withDraft((draft) => {
                const scene = Array.isArray(draft.scenes)
                    ? draft.scenes.find((entry) => entry.id === sceneId)
                    : null;
                if (!scene) return;
                draft.activeSceneId = scene.id;
                previewTokenId = '';
            }, { fitView: shouldFit });
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

        if (selectedTokenId && target.dataset.tokenField) {
            const field = target.dataset.tokenField;
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
                if (field === 'imageUrl') {
                    token.imageUrl = String(target.value || '').trim();
                    return;
                }
                if (field === 'label') {
                    token.label = String(target.value || '').trim() || 'Token';
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

        if (selectedEntryId && target.dataset.entryField) {
            const field = target.dataset.entryField;
            updateSelectedEntry((entry) => {
                if (field === 'name') {
                    entry.name = String(target.value || '').trim() || 'Combatant';
                    return;
                }
                const nextValue = String(target.value || '').trim();
                entry[field] = nextValue === '' ? null : Math.round(toNumber(nextValue, 0));
            });
            return;
        }

        if (selectedEntryId && target.dataset.entryDefence) {
            const key = target.dataset.entryDefence;
            if (!DEFENCE_KEYS.includes(key)) return;
            updateSelectedEntry((entry) => {
                if (!entry.defences || typeof entry.defences !== 'object') entry.defences = normalizeDefences(null);
                const nextValue = String(target.value || '').trim();
                entry.defences[key] = nextValue === '' ? null : clamp(Math.round(toNumber(nextValue, 0)), 0, 99);
            });
        }
    };

    const sanitizeQueueEntry = (raw) => {
        const source = raw && typeof raw === 'object' ? raw : null;
        if (!source) return null;
        const rollId = String(source.rollId || '').trim();
        const name = String(source.name || '').trim();
        if (!rollId || !name) return null;
        const defences = normalizeDefences(source.defences);
        return {
            rollId,
            sourceType: String(source.source || source.sourceType || 'sheet').trim() || 'sheet',
            sourceId: String(source.sourceId || '').trim(),
            name,
            total: Math.round(toNumber(source.total, 0)),
            tie: clamp(Math.round(toNumber(source.tie, 10)), 0, 99),
            ac: source.ac === null || source.ac === undefined || source.ac === '' ? null : clamp(Math.round(toNumber(source.ac, 0)), 0, 99),
            hpCurrent: source.hp === null || source.hp === undefined || source.hp === '' ? null : clamp(Math.round(toNumber(source.hp, 0)), 0, 999999),
            hpMax: source.maxHp === null || source.maxHp === undefined || source.maxHp === '' ? null : clamp(Math.round(toNumber(source.maxHp, 0)), 0, 999999),
            passivePerception: source.passivePerception === null || source.passivePerception === undefined || source.passivePerception === '' ? null : clamp(Math.round(toNumber(source.passivePerception, 10)), 0, 99),
            defences
        };
    };

    const processInitiativeQueue = () => {
        let parsed = [];
        try {
            const raw = localStorage.getItem(TRACKER_INITIATIVE_QUEUE_KEY);
            const queue = raw ? JSON.parse(raw) : [];
            if (Array.isArray(queue)) parsed = queue;
        } catch (err) {
            parsed = [];
        }
        if (!parsed.length) return;

        const processed = new Set(readProcessedRollIds());
        const pendingEntries = parsed.map(sanitizeQueueEntry).filter(Boolean).filter((entry) => !processed.has(entry.rollId));
        if (!pendingEntries.length) return;

        const draft = readSharedVTTSnapshot();
        if (!draft) return;
        let mutated = false;
        const newlyProcessed = [];

        pendingEntries.forEach((packet) => {
            const linkedToken = packet.sourceType && packet.sourceId
                ? findTokenAcrossScenes(draft, packet.sourceType, packet.sourceId)
                : null;
            const entries = draft.initiative.entries;
            const idx = entries.findIndex((entry) =>
                (packet.sourceType && packet.sourceId && entry.sourceType === packet.sourceType && entry.sourceId === packet.sourceId)
                || String(entry.name || '').toLowerCase() === packet.name.toLowerCase()
            );
            if (idx >= 0) {
                const base = linkedToken ? syncInitiativeEntryFromToken(entries[idx], linkedToken) : { ...entries[idx] };
                entries[idx] = {
                    ...base,
                    name: packet.name || base.name,
                    total: packet.total,
                    tie: packet.tie,
                    ac: packet.ac !== null ? packet.ac : base.ac,
                    hpCurrent: packet.hpCurrent !== null ? packet.hpCurrent : base.hpCurrent,
                    hpMax: packet.hpMax !== null ? packet.hpMax : base.hpMax,
                    passivePerception: packet.passivePerception !== null ? packet.passivePerception : base.passivePerception,
                    defences: normalizeDefences(packet.defences && Object.values(packet.defences).some((value) => value !== null) ? packet.defences : base.defences),
                    linkedTokenId: linkedToken ? linkedToken.id : base.linkedTokenId,
                    sourceType: packet.sourceType || base.sourceType,
                    sourceId: packet.sourceId || base.sourceId
                };
                selectedEntryId = entries[idx].id;
            } else {
                const seed = linkedToken ? buildInitiativeEntryFromToken(linkedToken) : {
                    id: buildId('init'),
                    name: packet.name,
                    linkedTokenId: linkedToken ? linkedToken.id : '',
                    side: linkedToken ? linkedToken.side : 'player',
                    imageUrl: linkedToken ? linkedToken.imageUrl || '' : '',
                    sourceType: packet.sourceType,
                    sourceId: packet.sourceId,
                    total: 0,
                    tie: 10,
                    hpCurrent: null,
                    hpMax: null,
                    ac: null,
                    passivePerception: null,
                    defences: normalizeDefences(null),
                    reactionUsed: false,
                    concentrating: false,
                    hidden: false,
                    conditions: []
                };
                const nextEntry = {
                    ...seed,
                    name: packet.name || seed.name,
                    total: packet.total,
                    tie: packet.tie,
                    ac: packet.ac !== null ? packet.ac : seed.ac,
                    hpCurrent: packet.hpCurrent !== null ? packet.hpCurrent : seed.hpCurrent,
                    hpMax: packet.hpMax !== null ? packet.hpMax : seed.hpMax,
                    passivePerception: packet.passivePerception !== null ? packet.passivePerception : seed.passivePerception,
                    defences: normalizeDefences(packet.defences)
                };
                entries.push(nextEntry);
                selectedEntryId = nextEntry.id;
            }
            mutated = true;
            newlyProcessed.push(packet.rollId);
        });

        if (!mutated) return;
        sortInitiativeEntries(draft.initiative.entries);
        if (!draft.initiative.activeEntryId && draft.initiative.entries[0]) {
            draft.initiative.activeEntryId = draft.initiative.entries[0].id;
        }
        const saved = persistSharedVTTSnapshot(draft, { reason: 'initiative-queue' });
        vttState = deepClone(saved || draft);
        markProcessedRollIds(newlyProcessed);
        normalizeSelections();
        render();
    };

    const handleStoreUpdate = () => {
        const store = getStore();
        if (!store) return;
        const activeCaseId = getActiveCaseId();
        if (vttCollabSession && (vttCollabSession.caseId !== activeCaseId || vttCollabSession.roomId !== getVTTCollabRoomId(activeCaseId))) {
            refreshVTTCollabRoomIfNeeded().catch((err) => {
                console.warn('VTT collaboration room refresh failed', err);
            });
            return;
        }
        if (isVTTCollabReady() || dragState) return;
        vttState = deepClone(store.getVTTState(activeCaseId));
        normalizeSelections();
        render();
    };

    const handleStorageEvent = (event) => {
        if (!event) return;
        if (event.key === TRACKER_INITIATIVE_QUEUE_KEY) {
            processInitiativeQueue();
            return;
        }
        if (event.key === getUIPrefsStorageKey()) {
            loadUIPreferences();
            return;
        }
        if (event.key === getRoleStorageKey()) {
            loadRolePreference();
            render();
        }
    };

    const handleStagePointerDown = (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.button !== 0) return;

        const tokenEl = event.target.closest('.vtt-token');
        const scene = getActiveScene();
        if (tokenEl) {
            if (!isDM()) return;
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token || !scene) return;
            const now = Date.now();
            const isDoublePress = lastTokenPointerDownId === token.id && now - lastTokenPointerDownAt <= TOKEN_DOUBLE_CLICK_MS;
            lastTokenPointerDownId = token.id;
            lastTokenPointerDownAt = now;
            selectedTokenId = token.id;
            const linkedEntry = findEntryForToken(token.id);
            selectedEntryId = linkedEntry ? linkedEntry.id : '';
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            if (isDoublePress) {
                lastTokenPointerDownId = '';
                lastTokenPointerDownAt = 0;
                event.preventDefault();
                snapTokenToGrid(token.id);
                return;
            }
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            const anchorX = (worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - token.x;
            const anchorY = (worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - token.y;
            dragState = {
                tokenId: token.id,
                anchorX,
                anchorY
            };
            lastDragSyncAt = 0;
            renderStage();
            event.preventDefault();
            return;
        }

        lastTokenPointerDownId = '';
        lastTokenPointerDownAt = 0;

        panState = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            originX: localView.x,
            originY: localView.y
        };
        if (stageEl) stageEl.classList.add('is-panning');
    };

    const handlePointerMove = (event) => {
        if (dragState && isDM()) {
            const scene = getActiveScene();
            if (!scene) return;
            const token = getTokenById(dragState.tokenId);
            if (!token) return;
            lastTokenPointerDownId = '';
            lastTokenPointerDownAt = 0;
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            token.x = normalizeTokenCoordinate((worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - dragState.anchorX, token.x);
            token.y = normalizeTokenCoordinate((worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - dragState.anchorY, token.y);
            renderStage();
            syncDraggedState(false);
            return;
        }

        if (panState) {
            localView.x = Math.round(panState.originX + (event.clientX - panState.startClientX));
            localView.y = Math.round(panState.originY + (event.clientY - panState.startClientY));
            applyWorldTransform();
        }
    };

    const handlePointerUp = () => {
        let appliedRemoteSnapshot = false;
        if (dragState) {
            syncDraggedState(true);
            lastDragSyncAt = 0;
            dragState = null;
            appliedRemoteSnapshot = applyPendingRemoteVTTSnapshot();
            if (!appliedRemoteSnapshot) render();
        }

        if (panState) {
            panState = null;
            if (stageEl) stageEl.classList.remove('is-panning');
        }
    };

    const handleDocumentPointerDown = (event) => {
        if (!(event.target instanceof Element)) return;
        let needsRender = false;

        if (npcSearchOpen && !event.target.closest('.vtt-popover-anchor')) {
            closeNPCSearch();
            needsRender = true;
        }

        if (previewTokenId && !event.target.closest('.vtt-token')) {
            previewTokenId = '';
            needsRender = true;
        }

        if (needsRender) render();
    };

    const handleStageWheel = (event) => {
        if (!stageEl) return;
        event.preventDefault();
        if (!event.ctrlKey && !event.metaKey) {
            localView.x = Math.round(localView.x - event.deltaX);
            localView.y = Math.round(localView.y - event.deltaY);
            applyWorldTransform();
            return;
        }
        const factor = Math.exp(-event.deltaY * 0.0015);
        const nextZoom = clampZoom(localView.zoom * factor);
        if (nextZoom === localView.zoom) return;
        setZoomAtPoint(nextZoom, event.clientX, event.clientY);
    };

    const handleStageContextMenu = (event) => {
        if (!(event.target instanceof Element)) return;
        const tokenEl = event.target.closest('.vtt-token');
        if (!tokenEl) {
            if (previewTokenId) {
                previewTokenId = '';
                renderStage();
            }
            return;
        }

        const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
        if (!token || !token.imageUrl) {
            if (previewTokenId) {
                previewTokenId = '';
                renderStage();
            }
            return;
        }

        event.preventDefault();
        previewTokenId = previewTokenId === token.id ? '' : token.id;
        selectedTokenId = token.id;
        const linkedEntry = findEntryForToken(token.id);
        selectedEntryId = linkedEntry ? linkedEntry.id : '';
        renderInitiativeList();
        renderInitiativeDetail();
        renderTokenInspector();
        renderStage();
    };

    const handleDocumentKeyDown = (event) => {
        if (!isDM() || !selectedTokenId || event.defaultPrevented) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (
            target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || (target instanceof HTMLElement && target.isContentEditable)
        ) {
            return;
        }

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

    const bindEvents = () => {
        bindSyncChipActions();
        document.addEventListener('click', (event) => {
            const actionEl = event.target instanceof Element ? event.target.closest('[data-action]') : null;
            if (!actionEl) return;
            handleAction(actionEl);
        });
        document.addEventListener('pointerdown', handleDocumentPointerDown);
        document.addEventListener('keydown', handleDocumentKeyDown);
        document.addEventListener('input', handleFieldChange);
        document.addEventListener('change', handleFieldChange);
        if (npcSearchInputEl) npcSearchInputEl.addEventListener('input', handleNPCSearchInput);
        if (stageEl) stageEl.addEventListener('pointerdown', handleStagePointerDown);
        if (stageEl) stageEl.addEventListener('wheel', handleStageWheel, { passive: false });
        if (stageEl) stageEl.addEventListener('contextmenu', handleStageContextMenu);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        window.addEventListener(STORE_UPDATED_EVENT, handleStoreUpdate);
        window.addEventListener('storage', handleStorageEvent);
        window.addEventListener('resize', () => {
            if (fitViewOnNextMapLoad) {
                fitViewToWorld();
                return;
            }
            applyWorldTransform();
        });
    };

    const init = () => {
        const store = getStore();
        if (!store) {
            if (syncChipEl) syncChipEl.textContent = 'Unavailable';
            return;
        }

        bindEvents();
        loadRolePreference();
        loadUIPreferences();
        vttState = deepClone(store.getVTTState(getActiveCaseId()));
        normalizeSelections();
        render();
        initVTTCollab().catch((err) => {
            console.warn('VTT collaboration init failed', err);
        }).finally(() => {
            processInitiativeQueue();
        });

        if (typeof store.onSyncStatus === 'function') {
            unsubscribeSyncStatus = store.onSyncStatus(updateStoreSyncChip);
        } else {
            updateStoreSyncChip({ connected: false });
        }

        fitViewToWorld();
    };

    init();
})();
