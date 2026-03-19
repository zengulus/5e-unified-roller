(function () {
    const ROLE_STORAGE_PREFIX = 'rtf_vtt_role_';
    const UI_PREFS_STORAGE_PREFIX = 'rtf_vtt_ui_';
    const PROCESSED_INIT_STORAGE_PREFIX = 'rtf_vtt_processed_init_';
    const TRACKER_INITIATIVE_QUEUE_KEY = 'rtf_tracker_initiative_queue';
    const STORE_UPDATED_EVENT = 'rtf-store-updated';
    const DEFAULT_WORLD_SIZE = { width: 2400, height: 1600 };
    const DRAG_SYNC_INTERVAL_MS = 120;
    const SIDE_OPTIONS = ['player', 'ally', 'enemy', 'neutral'];
    const DEFENCE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    let vttState = null;
    let selectedTokenId = '';
    let selectedEntryId = '';
    let localRole = 'dm';
    let uiState = {
        settingsCollapsed: false,
        initiativeCollapsed: false
    };
    let localView = { x: 40, y: 40, zoom: 1 };
    let worldSize = { ...DEFAULT_WORLD_SIZE };
    let mapLoadState = { url: '', loaded: false };
    let dragState = null;
    let panState = null;
    let lastDragSyncAt = 0;
    let fitViewOnNextMapLoad = true;
    let unsubscribeSyncStatus = null;

    const body = document.body;
    const stageEl = document.getElementById('vtt-stage');
    const worldEl = document.getElementById('vtt-world');
    const mapImageEl = document.getElementById('vtt-map-image');
    const gridLayerEl = document.getElementById('vtt-grid-layer');
    const fogLayerEl = document.getElementById('vtt-fog-layer');
    const tokenLayerEl = document.getElementById('vtt-token-layer');
    const caseNameEl = document.getElementById('vtt-case-name');
    const syncChipEl = document.getElementById('vtt-sync-chip');
    const settingsToggleEl = document.getElementById('vtt-settings-toggle');
    const initiativeToggleEl = document.getElementById('vtt-initiative-toggle');
    const roleToggleEl = document.getElementById('vtt-role-toggle');
    const activeSceneLabelEl = document.getElementById('vtt-active-scene-label');
    const stageTitleEl = document.getElementById('vtt-stage-title');
    const roundPillEl = document.getElementById('vtt-round-pill');
    const selectionPillEl = document.getElementById('vtt-selection-pill');
    const tokenInspectorEl = document.getElementById('vtt-token-inspector');
    const initiativeListEl = document.getElementById('vtt-initiative-list');
    const initiativeDetailPanelEl = document.getElementById('vtt-initiative-detail-panel');
    const playerSpawnListEl = document.getElementById('vtt-player-spawn-list');
    const npcSpawnListEl = document.getElementById('vtt-npc-spawn-list');

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
    const getStore = () => (window.RTF_STORE && typeof window.RTF_STORE.getVTTState === 'function' ? window.RTF_STORE : null);
    const getActiveCaseId = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
        return String(store.getActiveCaseId() || 'case_primary');
    };
    const getRoleStorageKey = () => `${ROLE_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getUIPrefsStorageKey = () => `${UI_PREFS_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getProcessedInitStorageKey = () => `${PROCESSED_INIT_STORAGE_PREFIX}${getActiveCaseId()}`;
    const isDM = () => localRole === 'dm';

    const applyUIPreferences = () => {
        if (body) {
            body.dataset.settingsCollapsed = uiState.settingsCollapsed ? '1' : '0';
            body.dataset.initiativeCollapsed = uiState.initiativeCollapsed ? '1' : '0';
        }
        if (settingsToggleEl) {
            settingsToggleEl.textContent = uiState.settingsCollapsed ? 'Show Settings' : 'Hide Settings';
            settingsToggleEl.setAttribute('aria-expanded', uiState.settingsCollapsed ? 'false' : 'true');
        }
        if (initiativeToggleEl) {
            initiativeToggleEl.textContent = uiState.initiativeCollapsed ? 'Show Initiative' : 'Hide Initiative';
            initiativeToggleEl.setAttribute('aria-expanded', uiState.initiativeCollapsed ? 'false' : 'true');
        }
    };

    const loadUIPreferences = () => {
        try {
            const raw = localStorage.getItem(getUIPrefsStorageKey());
            const parsed = raw ? JSON.parse(raw) : {};
            uiState = {
                settingsCollapsed: !!(parsed && parsed.settingsCollapsed),
                initiativeCollapsed: !!(parsed && parsed.initiativeCollapsed)
            };
        } catch (err) {
            uiState = {
                settingsCollapsed: false,
                initiativeCollapsed: false
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
        return state.scenes.find((scene) => scene.id === state.activeSceneId) || state.scenes[0] || null;
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

    const withDraft = (mutator, options = {}) => {
        const store = getStore();
        if (!store) return;
        const draft = deepClone(store.getVTTState(getActiveCaseId()));
        mutator(draft);
        const saved = store.updateVTTState(draft, getActiveCaseId());
        vttState = deepClone(saved);
        normalizeSelections();
        if (options.fitView) fitViewOnNextMapLoad = true;
        render();
    };

    const normalizeSelections = () => {
        const scene = getActiveScene();
        const tokens = getVisibleTokensForRole(scene);
        const entries = vttState && vttState.initiative && Array.isArray(vttState.initiative.entries) ? vttState.initiative.entries : [];
        if (!entries.some((entry) => entry.id === selectedEntryId)) {
            selectedEntryId = entries[0] ? entries[0].id : '';
        }
        if (selectedEntryId) {
            syncTokenSelectionFromEntry(selectedEntryId, vttState, localRole);
        } else if (!tokens.some((token) => token.id === selectedTokenId)) {
            selectedTokenId = tokens[0] ? tokens[0].id : '';
        }
        if (body) body.dataset.vttRole = localRole;
    };

    const getWorldSizeForScene = (scene) => {
        if (!scene) return { ...DEFAULT_WORLD_SIZE };
        const grid = scene.grid || { cellPx: 70, offsetX: 0, offsetY: 0 };
        let width = mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded ? worldSize.width : DEFAULT_WORLD_SIZE.width;
        let height = mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded ? worldSize.height : DEFAULT_WORLD_SIZE.height;
        if (Array.isArray(scene.tokens) && scene.tokens.length) {
            scene.tokens.forEach((token) => {
                width = Math.max(width, grid.offsetX + (token.x + token.w + 4) * grid.cellPx);
                height = Math.max(height, grid.offsetY + (token.y + token.h + 4) * grid.cellPx);
            });
        }
        return {
            width: Math.max(960, Math.round(width)),
            height: Math.max(720, Math.round(height))
        };
    };

    const applyWorldTransform = () => {
        if (!worldEl) return;
        worldEl.style.transform = `translate(${localView.x}px, ${localView.y}px) scale(${localView.zoom})`;
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
        if (body) body.dataset.vttRole = localRole;
        render();
    };

    const updateSyncChip = (status) => {
        if (!syncChipEl) return;
        const source = status && status.connected
            ? (status.pendingPush ? 'Syncing' : 'Shared')
            : 'Local';
        syncChipEl.textContent = source;
    };

    const loadMapForScene = (scene) => {
        if (!scene || !mapImageEl) return;
        if (!scene.mapImageUrl) {
            mapLoadState = { url: '', loaded: false };
            worldSize = getWorldSizeForScene(scene);
            mapImageEl.removeAttribute('src');
            mapImageEl.style.display = 'none';
            if (fitViewOnNextMapLoad) fitViewToWorld();
            return;
        }

        if (mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded) return;

        mapLoadState = { url: scene.mapImageUrl, loaded: false };
        mapImageEl.src = scene.mapImageUrl;
        mapImageEl.style.display = 'block';
        const probe = new Image();
        const requestedUrl = scene.mapImageUrl;
        probe.onload = () => {
            if (!vttState) return;
            const active = getActiveScene();
            if (!active || active.mapImageUrl !== requestedUrl) return;
            worldSize = {
                width: Math.max(DEFAULT_WORLD_SIZE.width, probe.naturalWidth || DEFAULT_WORLD_SIZE.width),
                height: Math.max(DEFAULT_WORLD_SIZE.height, probe.naturalHeight || DEFAULT_WORLD_SIZE.height)
            };
            mapLoadState = { url: requestedUrl, loaded: true };
            if (fitViewOnNextMapLoad) {
                fitViewOnNextMapLoad = false;
                fitViewToWorld();
            }
            renderStage();
        };
        probe.onerror = () => {
            const active = getActiveScene();
            if (!active || active.mapImageUrl !== requestedUrl) return;
            worldSize = getWorldSizeForScene(active);
            mapLoadState = { url: requestedUrl, loaded: false };
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

        if (npcSpawnListEl) {
            const npcs = getNPCs();
            npcSpawnListEl.innerHTML = npcs.length
                ? npcs.map((npc) => `
                    <button class="vtt-token-spawn" data-action="spawn-npc" data-id="${escapeHtml(String(npc.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(npc.name || 'NPC')}</span>
                        <span class="vtt-token-spawn-meta">${escapeHtml(npc.guild || 'No guild')}</span>
                    </button>
                `).join('')
                : '<div class="vtt-empty">No NPCs in the shared store yet.</div>';
        }
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
        if (!scene || !worldEl || !gridLayerEl || !fogLayerEl || !tokenLayerEl) return;

        worldSize = getWorldSizeForScene(scene);
        worldEl.style.width = `${worldSize.width}px`;
        worldEl.style.height = `${worldSize.height}px`;
        applyWorldTransform();

        loadMapForScene(scene);
        mapImageEl.style.display = scene.mapImageUrl ? 'block' : 'none';

        gridLayerEl.style.backgroundSize = `${scene.grid.cellPx}px ${scene.grid.cellPx}px`;
        gridLayerEl.style.backgroundPosition = `${scene.grid.offsetX}px ${scene.grid.offsetY}px`;

        fogLayerEl.innerHTML = Array.isArray(scene.fog)
            ? scene.fog.map((mask) => `
                <div class="vtt-fog-mask" style="left:${mask.x}px;top:${mask.y}px;width:${mask.w}px;height:${mask.h}px;"></div>
            `).join('')
            : '';

        const visibleTokens = getVisibleTokensForRole(scene);
        const initiative = vttState && vttState.initiative ? vttState.initiative : { activeEntryId: '' };
        const activeTurnToken = getVisibleSceneTokenForEntry(getEntryById(initiative.activeEntryId), vttState, localRole);
        const focusedEntryToken = getVisibleSceneTokenForEntry(getEntryById(selectedEntryId), vttState, localRole);
        const activeTurnTokenId = activeTurnToken ? activeTurnToken.id : '';
        const focusedEntryTokenId = focusedEntryToken ? focusedEntryToken.id : '';

        tokenLayerEl.innerHTML = visibleTokens.map((token) => `
            <div class="vtt-token${token.id === selectedTokenId ? ' is-selected' : ''}${token.id === focusedEntryTokenId ? ' is-entry-linked' : ''}${token.id === activeTurnTokenId ? ' is-active-turn' : ''}${token.hidden ? ' is-hidden' : ''}"
                data-token-id="${escapeHtml(token.id)}"
                data-id="${escapeHtml(token.id)}"
                data-action="select-token"
                data-side="${escapeHtml(token.side || 'neutral')}"
                style="left:${scene.grid.offsetX + token.x * scene.grid.cellPx}px;top:${scene.grid.offsetY + token.y * scene.grid.cellPx}px;width:${token.w * scene.grid.cellPx}px;height:${token.h * scene.grid.cellPx}px;">
                ${token.imageUrl ? `<img class="vtt-token-image" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.label || 'Token')}">` : `<div class="vtt-token-initials">${escapeHtml(buildInitials(token.label))}</div>`}
                <div class="vtt-token-badge">
                    <span class="vtt-token-label">${escapeHtml(token.label || 'Token')}</span>
                    <span class="vtt-token-hp">${escapeHtml(token.hpCurrent !== null && token.hpCurrent !== undefined ? String(token.hpCurrent) : '-')}</span>
                </div>
            </div>
        `).join('');
    };

    const renderSceneControls = () => {
        const scene = getActiveScene();
        if (!scene) return;
        applyUIPreferences();
        if (caseNameEl) caseNameEl.textContent = getActiveCaseName();
        if (roleToggleEl) roleToggleEl.textContent = `Role: ${isDM() ? 'DM' : 'Player'}`;
        if (activeSceneLabelEl) activeSceneLabelEl.textContent = scene.name || 'Scene';
        if (stageTitleEl) stageTitleEl.textContent = scene.name || 'Scene';
        const mapUrlEl = document.getElementById('scene-map-url');
        const cellEl = document.getElementById('scene-grid-cell');
        const distanceEl = document.getElementById('scene-grid-distance');
        const offsetXEl = document.getElementById('scene-grid-offset-x');
        const offsetYEl = document.getElementById('scene-grid-offset-y');
        if (mapUrlEl && document.activeElement !== mapUrlEl) mapUrlEl.value = scene.mapImageUrl || '';
        if (cellEl && document.activeElement !== cellEl) cellEl.value = String(scene.grid.cellPx || 70);
        if (distanceEl && document.activeElement !== distanceEl) distanceEl.value = String(scene.grid.cellDistance || 5);
        if (offsetXEl && document.activeElement !== offsetXEl) offsetXEl.value = String(scene.grid.offsetX || 0);
        if (offsetYEl && document.activeElement !== offsetYEl) offsetYEl.value = String(scene.grid.offsetY || 0);
    };

    const render = () => {
        normalizeSelections();
        renderSceneControls();
        renderSpawnLists();
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

    const syncDraggedState = (force = false) => {
        const store = getStore();
        if (!store || !vttState) return;
        const now = Date.now();
        if (!force && now - lastDragSyncAt < DRAG_SYNC_INTERVAL_MS) return;
        const draft = deepClone(store.getVTTState(getActiveCaseId()));
        const localToken = dragState ? getTokenById(dragState.tokenId, vttState) : null;
        const scene = getActiveScene(draft);
        const idx = scene && Array.isArray(scene.tokens)
            ? scene.tokens.findIndex((token) => token.id === (dragState && dragState.tokenId))
            : -1;

        if (!localToken || !scene || idx < 0) {
            vttState = deepClone(draft);
            lastDragSyncAt = now;
            return;
        }

        scene.tokens[idx] = {
            ...scene.tokens[idx],
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

        if (action === 'zoom-in') {
            localView.zoom = clamp(localView.zoom + 0.12, 0.25, 2.2);
            applyWorldTransform();
            return;
        }
        if (action === 'zoom-out') {
            localView.zoom = clamp(localView.zoom - 0.12, 0.25, 2.2);
            applyWorldTransform();
            return;
        }
        if (action === 'zoom-reset') {
            localView.zoom = 1;
            applyWorldTransform();
            return;
        }
        if (action === 'fit-view') {
            fitViewToWorld();
            return;
        }

        if (!isDM() && action !== 'select-token' && action !== 'select-entry') return;

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

        if (action === 'step-grid-cell') {
            const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                scene.grid.cellPx = clamp(Math.round(toNumber(scene.grid.cellPx, 70) + delta), 24, 240);
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

    const handleFieldChange = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (event.type === 'input' && (target instanceof HTMLInputElement) && target.type === 'text') return;
        if (event.type === 'input' && target instanceof HTMLTextAreaElement) return;

        if (target instanceof HTMLInputElement && target.dataset.sceneField) {
            const field = target.dataset.sceneField;
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                scene[field] = field === 'mapImageUrl' ? String(target.value || '').trim() : target.value;
            }, { fitView: field === 'mapImageUrl' });
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
        const store = getStore();
        if (!store) return;
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

        const draft = deepClone(store.getVTTState(getActiveCaseId()));
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
        const saved = store.updateVTTState(draft, getActiveCaseId());
        vttState = deepClone(saved);
        markProcessedRollIds(newlyProcessed);
        normalizeSelections();
        render();
    };

    const handleStoreUpdate = () => {
        if (dragState) return;
        const store = getStore();
        if (!store) return;
        vttState = deepClone(store.getVTTState(getActiveCaseId()));
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
        if (tokenEl && isDM()) {
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token || !scene) return;
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            const anchorX = (worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - token.x;
            const anchorY = (worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - token.y;
            dragState = {
                tokenId: token.id,
                anchorX,
                anchorY
            };
            lastDragSyncAt = 0;
            selectedTokenId = token.id;
            renderTokenInspector();
            renderStage();
            event.preventDefault();
            return;
        }

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
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            token.x = Math.max(0, Math.round((worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - dragState.anchorX));
            token.y = Math.max(0, Math.round((worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - dragState.anchorY));
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
        if (dragState) {
            syncDraggedState(true);
            lastDragSyncAt = 0;
            dragState = null;
            render();
        }

        if (panState) {
            panState = null;
            if (stageEl) stageEl.classList.remove('is-panning');
        }
    };

    const bindEvents = () => {
        document.addEventListener('click', (event) => {
            const actionEl = event.target instanceof Element ? event.target.closest('[data-action]') : null;
            if (!actionEl) return;
            handleAction(actionEl);
        });
        document.addEventListener('input', handleFieldChange);
        document.addEventListener('change', handleFieldChange);
        if (stageEl) stageEl.addEventListener('pointerdown', handleStagePointerDown);
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
        processInitiativeQueue();

        if (typeof store.onSyncStatus === 'function') {
            unsubscribeSyncStatus = store.onSyncStatus(updateSyncChip);
        } else {
            updateSyncChip({ connected: false });
        }

        fitViewToWorld();
    };

    init();
})();
