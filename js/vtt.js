(function () {
    const DM_UNLOCK_PHRASE = 'setDMMode';
    const UI_PREFS_STORAGE_PREFIX = 'rtf_vtt_ui_';
    const PROCESSED_INIT_STORAGE_PREFIX = 'rtf_vtt_processed_init_';
    const TRACKER_INITIATIVE_QUEUE_KEY = 'rtf_tracker_initiative_queue';
    const STORE_UPDATED_EVENT = 'rtf-store-updated';
    const DEFAULT_WORLD_SIZE = { width: 2400, height: 1600 };
    const DRAG_SYNC_INTERVAL_MS = 120;
    const REMOTE_TOKEN_TWEEN_MS = 180;
    const TOKEN_DOUBLE_CLICK_MS = 320;
    const SIDE_OPTIONS = ['player', 'ally', 'enemy', 'neutral'];
    const MOVE_ACCESS_OPTIONS = ['dm', 'player'];
    const DEFENCE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const TOOL_MODE_NAVIGATE = 'navigate';
    const TOOL_MODE_RULER = 'ruler';
    const TOOL_MODE_CIRCLE = 'circle';
    const TOOL_MODE_CONE = 'cone';
    const TOOL_MODE_NOTE = 'note';
    const TOOL_MODE_FOG = 'fog';
    const TOOL_MODE_FOG_REMOVE = 'fog-remove';
    const TEMPLATE_KIND_CIRCLE = 'circle';
    const TEMPLATE_KIND_CONE = 'cone';
    const DEFAULT_TOOL_SIZE_CELLS = 4;
    const DEFAULT_TEMPLATE_CONE_ARC_DEG = 53.13010235415598;
    const TEMPLATE_HOLD_PERSIST_MS = 1000;
    const TEMPLATE_SHARED_LIFETIME_MS = 5000;
    const LIVE_STATUS_DROPOUT_GRACE_MS = 5000;
    const TOUCH_CONTEXT_HOLD_MS = 420;
    const TOUCH_CONTEXT_MOVE_PX = 14;
    const STEALTH_STATUS_DETECTED = 'detected';
    const STEALTH_STATUS_UNSEEN = 'unseen';
    const SCENE_VIEW_SHARED = 'shared';
    const SCENE_VIEW_LOCAL = 'local';
    const DEFAULT_VTT_CELL_PX = 70;
    const DEFAULT_EVIDENCE_NOTE_CATEGORY = 'evidence';
    const DEFAULT_EVIDENCE_NOTE_COLOR = '#39b66b';
    const EVIDENCE_NOTE_CATEGORY_META = Object.freeze({
        evidence: { label: 'Evidence', shortLabel: 'E', color: '#39b66b', defaultTitle: 'Evidence Zone' },
        danger: { label: 'Danger', shortLabel: '!', color: '#d85b5b', defaultTitle: 'Danger Zone' },
        info: { label: 'Info', shortLabel: 'i', color: '#4f8dff', defaultTitle: 'Info Zone' },
        objective: { label: 'Objective', shortLabel: 'O', color: '#f0b357', defaultTitle: 'Objective Zone' },
        other: { label: 'Other', shortLabel: '?', color: '#8f9aa8', defaultTitle: 'Zone' }
    });
    const TOKEN_COORD_PRECISION = 1000;
    const MIN_VTT_MAP_SCALE = 0.25;
    const MAX_VTT_MAP_SCALE = 4;
    const GUILDLESS_TOKEN_BUCKET = 'tokens';
    const GUILDLESS_TOKEN_FOLDER = 'guildless';
    const GUILDLESS_TOKEN_MIN = 1;
    const GUILDLESS_TOKEN_MAX = 300;
    const DEFAULT_VTT_STATE = {
        updatedAt: 0,
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
                stealthMode: false,
                tokens: [],
                templates: [],
                evidenceNotes: [],
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
    let selectedTemplateId = '';
    let selectedEvidenceNoteId = '';
    let localRole = 'player';
    let uiState = {
        settingsCollapsed: false,
        initiativeCollapsed: false,
        scenePanelCollapsed: false,
        spawnPanelCollapsed: false,
        inspectorPanelCollapsed: false,
        showGrid: true,
        showTokenNames: true,
        sceneViewMode: SCENE_VIEW_SHARED,
        localSceneId: ''
    };
    let npcSearchOpen = false;
    let npcSearchState = null;
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
    let vttCollabPendingStatus = null;
    let vttCollabDropoutStartedAt = 0;
    let vttCollabDropoutTimer = 0;
    let lastStableLiveSyncChipLabel = '';
    let pendingRemoteVTTSnapshot = null;
    let spawnDragState = null;
    let quickSpawnMenuState = null;
    let tokenInspectorState = null;
    let initiativeDetailState = null;
    let navMenuOpen = false;
    let viewMenuOpen = false;
    let toolsMenuOpen = false;
    let dmUnlockReturnFocusEl = null;
    let lastTokenPointerDownId = '';
    let lastTokenPointerDownAt = 0;
    let remoteTokenTweens = new Map();
    let remoteTokenTweenFrame = 0;
    let localToolState = { mode: TOOL_MODE_NAVIGATE, sizeCells: DEFAULT_TOOL_SIZE_CELLS };
    let templatePlacementState = null;
    let templateRotateState = null;
    let visionConeRotateState = null;
    let rulerState = null;
    let fogPlacementState = null;
    let evidenceNotePlacementState = null;
    let pendingTouchContextState = null;
    let templateExpiryTimer = 0;

    const body = document.body;
    const stageEl = document.getElementById('vtt-stage');
    const mapWorldEl = document.getElementById('vtt-map-world');
    const worldEl = document.getElementById('vtt-world');
    const stageGridEl = document.getElementById('vtt-stage-grid');
    const mapImageEl = document.getElementById('vtt-map-image');
    const gridLayerEl = document.getElementById('vtt-grid-layer');
    const fogLayerEl = document.getElementById('vtt-fog-layer');
    const noteLayerEl = document.getElementById('vtt-note-layer');
    const templateLayerEl = document.getElementById('vtt-template-layer');
    const tokenLayerEl = document.getElementById('vtt-token-layer');
    const visionLayerEl = document.getElementById('vtt-vision-layer');
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
    const inspectorPanelEl = document.getElementById('vtt-inspector-panel');
    const tokenInspectorPopoverEl = document.getElementById('vtt-token-inspector-popover');
    const initiativeListEl = document.getElementById('vtt-initiative-list');
    const initiativeDetailPanelEl = document.getElementById('vtt-initiative-detail-panel');
    const sceneListEl = document.getElementById('vtt-scene-list');
    const playerSpawnListEl = document.getElementById('vtt-player-spawn-list');
    const npcSearchToggleEl = document.getElementById('vtt-npc-search-toggle');
    const npcSearchPopoverEl = document.getElementById('vtt-npc-search-popover');
    const npcSearchInputEl = document.getElementById('vtt-npc-search-input');
    const npcSearchListEl = document.getElementById('vtt-npc-search-list');
    const quickSpawnMenuEl = document.getElementById('vtt-quick-spawn-menu');
    const spawnGhostEl = document.getElementById('vtt-spawn-ghost');
    const navMenuToggleEl = document.getElementById('vtt-nav-menu-toggle');
    const navMenuEl = document.getElementById('vtt-nav-menu');
    const toolsMenuToggleEl = document.getElementById('vtt-tools-menu-toggle');
    const toolsMenuEl = document.getElementById('vtt-tools-menu');
    const rulerToggleEl = document.getElementById('vtt-ruler-toggle');
    const toolModeNavigateEl = document.getElementById('vtt-tool-mode-navigate');
    const toolModeCircleEl = document.getElementById('vtt-tool-mode-circle');
    const toolModeConeEl = document.getElementById('vtt-tool-mode-cone');
    const toolModeNoteEl = document.getElementById('vtt-tool-mode-note');
    const toolModeFogEl = document.getElementById('vtt-tool-mode-fog');
    const toolModeFogRemoveEl = document.getElementById('vtt-tool-mode-fog-remove');
    const toolSizeInputEl = document.getElementById('vtt-tool-size-input');
    const stealthModeToggleEl = document.getElementById('vtt-stealth-mode-toggle');
    const clearFogButtonEl = document.getElementById('vtt-clear-fog');
    const accentButtonEl = document.getElementById('vtt-accent-btn');
    const accentPickerEl = document.getElementById('accent-picker-input');
    const viewMenuToggleEl = document.getElementById('vtt-view-menu-toggle');
    const viewMenuEl = document.getElementById('vtt-view-menu');
    const gridToggleEl = document.getElementById('vtt-grid-toggle');
    const sidebarEl = document.getElementById('vtt-settings-panel');
    const dmUnlockModalEl = document.getElementById('vtt-dm-unlock-modal');
    const dmUnlockFormEl = document.getElementById('vtt-dm-unlock-form');
    const dmUnlockInputEl = document.getElementById('vtt-dm-unlock-input');
    const dmUnlockErrorEl = document.getElementById('vtt-dm-unlock-error');

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
    const hasValue = (value) => value !== null && value !== undefined && value !== '';
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
    const toSharedTokenImageUrl = (value) => {
        const raw = toImageUrl(value);
        if (!raw) return '';
        return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) ? raw : '';
    };
    const getUsableMediaUrl = (value) => {
        const raw = toImageUrl(value);
        if (!raw) return '';
        if (window.RTF_MEDIA_CACHE && typeof window.RTF_MEDIA_CACHE.getUsableUrl === 'function') {
            return window.RTF_MEDIA_CACHE.getUsableUrl(raw);
        }
        return raw;
    };
    const trimTrailingSlashes = (value = '') => String(value || '').replace(/\/+$/, '');
    const randomIntInclusive = (min, max) => {
        const safeMin = Math.min(min, max);
        const safeMax = Math.max(min, max);
        return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
    };
    const getConfiguredSupabaseUrl = () => {
        const store = getStore();
        if (!store || typeof store.getSyncConfig !== 'function') return '';
        const config = store.getSyncConfig();
        return trimTrailingSlashes(config && config.supabaseUrl ? config.supabaseUrl : '');
    };
    const buildSupabasePublicObjectUrl = (bucket, assetPath) => {
        const baseUrl = getConfiguredSupabaseUrl();
        const cleanBucket = String(bucket || '').trim().replace(/^\/+|\/+$/g, '');
        const cleanPath = String(assetPath || '').trim().replace(/^\/+/, '');
        if (!baseUrl || !cleanBucket || !cleanPath) return '';
        try {
            return new URL(`/storage/v1/object/public/${cleanBucket}/${cleanPath}`, `${baseUrl}/`).toString();
        } catch (err) {
            return '';
        }
    };
    const buildGuildlessImageUrl = () => {
        const imageNumber = randomIntInclusive(GUILDLESS_TOKEN_MIN, GUILDLESS_TOKEN_MAX);
        return buildSupabasePublicObjectUrl(GUILDLESS_TOKEN_BUCKET, `${GUILDLESS_TOKEN_FOLDER}/${imageNumber}.png`);
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
        const clonedTemplates = deepClone(Array.isArray(source && source.templates) ? source.templates : []).map((template) => ({
            ...template,
            id: buildId('template')
        }));
        const clonedEvidenceNotes = deepClone(Array.isArray(source && source.evidenceNotes) ? source.evidenceNotes : []).map((note) => ({
            ...note,
            id: buildId('evidence')
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
            stealthMode: !!(source && source.stealthMode),
            tokens: clonedTokens,
            templates: clonedTemplates,
            evidenceNotes: clonedEvidenceNotes,
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
        const hasCurrent = hasValue(current);
        const hasMax = hasValue(max);
        if (!hasCurrent && !hasMax) return 'HP -';
        if (hasCurrent && hasMax) return `HP ${current}/${max}`;
        if (hasCurrent) return `HP ${current}`;
        return `HP -/${max}`;
    };
    const normalizeStealthRoll = (value, fallback = null) => {
        if (!hasValue(value)) return fallback;
        return clamp(Math.round(toNumber(value, 0)), 0, 99);
    };
    const getTokenStealthRoll = (token) => normalizeStealthRoll(
        token && token.stealthRoll !== undefined ? token.stealthRoll : token && token.stealthDc,
        null
    );
    const getEntryStealthRoll = (entry) => normalizeStealthRoll(
        entry && entry.stealthRoll !== undefined ? entry.stealthRoll : entry && entry.stealthDc,
        null
    );
    const getVisionPassivePerception = (token) => {
        if (hasValue(token && token.passivePerception)) {
            return clamp(Math.round(toNumber(token.passivePerception, 10)), 0, 99);
        }
        if (hasValue(token && token.vision && token.vision.passivePerception)) {
            return clamp(Math.round(toNumber(token.vision.passivePerception, 10)), 0, 99);
        }
        return 10;
    };
    const getTokenDamageFraction = (token) => {
        if (!token) return 0;
        const hpCurrent = Number(token.hpCurrent);
        const hpMax = Number(token.hpMax);
        if (!Number.isFinite(hpCurrent) || !Number.isFinite(hpMax) || hpMax <= 0) return 0;
        const ratio = clamp(hpCurrent / hpMax, 0, 1);
        return Math.round((1 - ratio) * 1000) / 1000;
    };
    const isTokenBloodied = (token) => {
        if (!token) return false;
        if (String(token.sourceType || '').trim().toLowerCase() !== 'npc') return false;
        const hpCurrent = Number(token.hpCurrent);
        const hpMax = Number(token.hpMax);
        if (!Number.isFinite(hpCurrent) || !Number.isFinite(hpMax) || hpMax <= 0) return false;
        return hpCurrent <= hpMax / 2;
    };
    const getTokenCenterInCells = (token) => ({
        x: normalizeTokenCoordinate(toNumber(token && token.x, 0) + Math.max(1, toNumber(token && token.w, 1)) / 2, 0.5),
        y: normalizeTokenCoordinate(toNumber(token && token.y, 0) + Math.max(1, toNumber(token && token.h, 1)) / 2, 0.5)
    });
    const getTokenFootprintPoints = (token) => {
        if (!token) return [];
        const width = Math.max(1, toNumber(token.w, 1));
        const height = Math.max(1, toNumber(token.h, 1));
        const x = toNumber(token.x, 0);
        const y = toNumber(token.y, 0);
        return [
            { x: x + width / 2, y: y + height / 2 },
            { x: x, y: y },
            { x: x + width / 2, y: y },
            { x: x + width, y: y },
            { x: x, y: y + height / 2 },
            { x: x + width, y: y + height / 2 },
            { x: x, y: y + height },
            { x: x + width / 2, y: y + height },
            { x: x + width, y: y + height }
        ];
    };
    const getTemplateWorldPoint = (scene, point) => {
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        return {
            x: offsetX + toNumber(point && point.x, 0) * cellPx,
            y: offsetY + toNumber(point && point.y, 0) * cellPx
        };
    };
    const getConeHalfWidthPx = (lengthPx, arcDeg) => {
        const clampedArc = clamp(toNumber(arcDeg, 60), 1, 170);
        return Math.max(1, lengthPx * Math.tan((clampedArc / 2) * Math.PI / 180));
    };
    const getConeWorldVertices = (originPoint, lengthPx, angleDeg, arcDeg) => {
        const radians = normalizeAngleDeg(angleDeg) * Math.PI / 180;
        const axisX = Math.cos(radians);
        const axisY = Math.sin(radians);
        const perpX = -axisY;
        const perpY = axisX;
        const halfWidth = getConeHalfWidthPx(lengthPx, arcDeg);
        return [
            { x: originPoint.x, y: originPoint.y },
            { x: originPoint.x + axisX * lengthPx - perpX * halfWidth, y: originPoint.y + axisY * lengthPx - perpY * halfWidth },
            { x: originPoint.x + axisX * lengthPx + perpX * halfWidth, y: originPoint.y + axisY * lengthPx + perpY * halfWidth }
        ];
    };
    const getPointAtAngle = (originX, originY, radius, angleDeg) => {
        const radians = normalizeAngleDeg(angleDeg) * Math.PI / 180;
        return {
            x: originX + Math.cos(radians) * radius,
            y: originY + Math.sin(radians) * radius
        };
    };
    const getAreaTemplateWorldGeometry = (template, scene) => {
        if (!template || !scene) return null;
        const sizePx = Math.max(1, normalizeToolSizeCells(template.sizeCells, DEFAULT_TOOL_SIZE_CELLS) * getSceneCellPx(scene));
        const anchor = getTemplateWorldPoint(scene, template);
        if (String(template.kind || TEMPLATE_KIND_CIRCLE) === TEMPLATE_KIND_CONE) {
            const halfWidth = sizePx / 2;
            return {
                kind: TEMPLATE_KIND_CONE,
                left: anchor.x,
                top: anchor.y - halfWidth,
                width: sizePx,
                height: halfWidth * 2,
                rotationDeg: normalizeAngleDeg(template.angleDeg)
            };
        }
        return {
            kind: TEMPLATE_KIND_CIRCLE,
            left: anchor.x - sizePx,
            top: anchor.y - sizePx,
            width: sizePx * 2,
            height: sizePx * 2,
            rotationDeg: 0
        };
    };
    const getAreaTemplateWorldBounds = (template, scene) => {
        const geometry = getAreaTemplateWorldGeometry(template, scene);
        if (!geometry) return null;
        if (geometry.kind === TEMPLATE_KIND_CIRCLE) {
            return {
                minX: geometry.left,
                minY: geometry.top,
                maxX: geometry.left + geometry.width,
                maxY: geometry.top + geometry.height
            };
        }
        const anchor = getTemplateWorldPoint(scene, template);
        const vertices = getConeWorldVertices(anchor, geometry.width, geometry.rotationDeg, DEFAULT_TEMPLATE_CONE_ARC_DEG);
        return {
            minX: Math.min(...vertices.map((point) => point.x)),
            minY: Math.min(...vertices.map((point) => point.y)),
            maxX: Math.max(...vertices.map((point) => point.x)),
            maxY: Math.max(...vertices.map((point) => point.y))
        };
    };
    const buildAreaTemplate = (kind, scene, worldPoint, options = {}) => {
        if (!scene || !worldPoint) return null;
        const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
        return {
            id: buildId('template'),
            kind: kind === TEMPLATE_KIND_CONE ? TEMPLATE_KIND_CONE : TEMPLATE_KIND_CIRCLE,
            x: anchor.x,
            y: anchor.y,
            sizeCells: normalizeToolSizeCells(options.sizeCells, localToolState.sizeCells),
            angleDeg: normalizeAngleDeg(options.angleDeg)
        };
    };
    const getRenderableSceneTemplates = (scene, now = Date.now()) => {
        if (!scene || !Array.isArray(scene.templates)) return [];
        return scene.templates.filter((template) => toNumber(template && template.expiresAt, 0) > now);
    };
    const queueSharedTransientTemplate = (template) => {
        if (!template) return;
        const payload = {
            ...template,
            expiresAt: Date.now() + TEMPLATE_SHARED_LIFETIME_MS
        };
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            if (!Array.isArray(scene.templates)) scene.templates = [];
            scene.templates.push(payload);
        });
    };
    const scheduleTemplateExpiryRender = (scene) => {
        if (templateExpiryTimer) {
            window.clearTimeout(templateExpiryTimer);
            templateExpiryTimer = 0;
        }
        const templates = getRenderableSceneTemplates(scene);
        if (!templates.length) return;
        const nextExpiry = Math.min(...templates.map((template) => Math.max(0, toNumber(template && template.expiresAt, 0))));
        if (!Number.isFinite(nextExpiry) || nextExpiry <= 0) return;
        const delay = Math.max(0, nextExpiry - Date.now() + 32);
        templateExpiryTimer = window.setTimeout(() => {
            templateExpiryTimer = 0;
            renderStage();
        }, delay);
    };
    const getTemplateAngleFromWorldPoint = (scene, template, worldPoint) => {
        if (!scene || !template || !worldPoint) return 0;
        const origin = getTemplateWorldPoint(scene, template);
        return normalizeAngleDeg(Math.atan2(worldPoint.y - origin.y, worldPoint.x - origin.x) * 180 / Math.PI);
    };
    const snapWorldPointToFogCorner = (scene, worldPoint) => {
        if (!scene || !worldPoint) return { x: 0, y: 0 };
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        return {
            x: Math.round((toNumber(worldPoint.x, offsetX) - offsetX) / cellPx) * cellPx + offsetX,
            y: Math.round((toNumber(worldPoint.y, offsetY) - offsetY) / cellPx) * cellPx + offsetY
        };
    };
    const buildFogMaskFromWorldPoints = (scene, startWorldPoint, endWorldPoint, id = buildId('fog')) => {
        if (!scene || !startWorldPoint || !endWorldPoint) return null;
        const cellPx = getSceneCellPx(scene);
        const start = snapWorldPointToFogCorner(scene, startWorldPoint);
        const end = snapWorldPointToFogCorner(scene, endWorldPoint);
        const left = Math.min(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const width = Math.max(cellPx, Math.abs(end.x - start.x));
        const height = Math.max(cellPx, Math.abs(end.y - start.y));
        return {
            id: String(id || buildId('fog')).trim() || buildId('fog'),
            x: Math.round(left),
            y: Math.round(top),
            w: Math.max(1, Math.round(width)),
            h: Math.max(1, Math.round(height))
        };
    };
    const buildFogCellKey = (col, row) => `${Math.round(toNumber(col, 0))},${Math.round(toNumber(row, 0))}`;
    const parseFogCellKey = (key) => {
        const parts = String(key || '').split(',');
        return {
            col: Math.round(toNumber(parts[0], 0)),
            row: Math.round(toNumber(parts[1], 0))
        };
    };
    const getFogMaskCellBounds = (scene, mask) => {
        if (!scene || !mask) return null;
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const left = Math.round((toNumber(mask.x, offsetX) - offsetX) / cellPx);
        const top = Math.round((toNumber(mask.y, offsetY) - offsetY) / cellPx);
        const widthCells = Math.max(1, Math.round(Math.max(1, toNumber(mask.w, cellPx)) / cellPx));
        const heightCells = Math.max(1, Math.round(Math.max(1, toNumber(mask.h, cellPx)) / cellPx));
        return {
            left,
            top,
            right: left + widthCells,
            bottom: top + heightCells
        };
    };
    const mutateFogCellSetForMask = (cellSet, scene, mask, add = true) => {
        if (!(cellSet instanceof Set) || !scene || !mask) return cellSet;
        const bounds = getFogMaskCellBounds(scene, mask);
        if (!bounds) return cellSet;
        for (let row = bounds.top; row < bounds.bottom; row += 1) {
            for (let col = bounds.left; col < bounds.right; col += 1) {
                const key = buildFogCellKey(col, row);
                if (add) cellSet.add(key);
                else cellSet.delete(key);
            }
        }
        return cellSet;
    };
    const collectFogCellSet = (scene, masks = []) => {
        const cellSet = new Set();
        if (!scene || !Array.isArray(masks)) return cellSet;
        masks.forEach((mask) => {
            mutateFogCellSetForMask(cellSet, scene, mask, true);
        });
        return cellSet;
    };
    const buildFogMasksFromCellSet = (scene, cellSet) => {
        if (!scene || !(cellSet instanceof Set) || !cellSet.size) return [];
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const rows = new Map();
        cellSet.forEach((key) => {
            const parsed = parseFogCellKey(key);
            if (!rows.has(parsed.row)) rows.set(parsed.row, []);
            rows.get(parsed.row).push(parsed.col);
        });
        const sortedRows = Array.from(rows.keys()).sort((left, right) => left - right);
        const finalized = [];
        let openRects = new Map();
        let prevRow = null;

        sortedRows.forEach((row) => {
            const cols = Array.from(new Set(rows.get(row) || [])).sort((left, right) => left - right);
            const runs = [];
            let runStart = null;
            let runEnd = null;
            cols.forEach((col) => {
                if (runStart === null) {
                    runStart = col;
                    runEnd = col + 1;
                    return;
                }
                if (col === runEnd) {
                    runEnd = col + 1;
                    return;
                }
                runs.push({ left: runStart, right: runEnd });
                runStart = col;
                runEnd = col + 1;
            });
            if (runStart !== null && runEnd !== null) runs.push({ left: runStart, right: runEnd });

            const canContinue = prevRow !== null && row === prevRow + 1;
            const nextOpenRects = new Map();
            runs.forEach((run) => {
                const runKey = `${run.left}:${run.right}`;
                if (canContinue && openRects.has(runKey)) {
                    const existingRect = openRects.get(runKey);
                    existingRect.bottom = row + 1;
                    nextOpenRects.set(runKey, existingRect);
                    openRects.delete(runKey);
                    return;
                }
                nextOpenRects.set(runKey, {
                    left: run.left,
                    right: run.right,
                    top: row,
                    bottom: row + 1
                });
            });

            openRects.forEach((rect) => {
                finalized.push(rect);
            });
            openRects = nextOpenRects;
            prevRow = row;
        });

        openRects.forEach((rect) => {
            finalized.push(rect);
        });

        return finalized.map((rect) => ({
            id: buildId('fog'),
            x: Math.round(offsetX + rect.left * cellPx),
            y: Math.round(offsetY + rect.top * cellPx),
            w: Math.max(1, Math.round((rect.right - rect.left) * cellPx)),
            h: Math.max(1, Math.round((rect.bottom - rect.top) * cellPx))
        }));
    };
    const applyFogMaskMutation = (scene, mask, mode = 'add') => {
        if (!scene || !mask) return Array.isArray(scene && scene.fog) ? scene.fog.slice() : [];
        const cellSet = collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
        mutateFogCellSetForMask(cellSet, scene, mask, mode !== 'remove');
        return buildFogMasksFromCellSet(scene, cellSet);
    };
    const findFogMaskIndexAtWorldPoint = (scene, worldPoint) => {
        if (!scene || !worldPoint || !Array.isArray(scene.fog)) return -1;
        const worldX = toNumber(worldPoint.x, -1);
        const worldY = toNumber(worldPoint.y, -1);
        for (let idx = scene.fog.length - 1; idx >= 0; idx -= 1) {
            const mask = scene.fog[idx];
            const left = toNumber(mask && mask.x, 0);
            const top = toNumber(mask && mask.y, 0);
            const width = Math.max(1, toNumber(mask && mask.w, 1));
            const height = Math.max(1, toNumber(mask && mask.h, 1));
            if (worldX >= left && worldX <= left + width && worldY >= top && worldY <= top + height) return idx;
        }
        return -1;
    };
    const buildFogMaskMarkup = (mask, className = '') => {
        if (!mask) return '';
        return `
            <div class="vtt-fog-mask${className ? ` ${className}` : ''}"
                data-world-left="${escapeHtml(String(mask.x))}"
                data-world-top="${escapeHtml(String(mask.y))}"
                data-world-width="${escapeHtml(String(mask.w))}"
                data-world-height="${escapeHtml(String(mask.h))}"></div>
        `;
    };
    const getEvidenceNoteCategoryConfig = (category) => {
        const key = String(category || '').trim().toLowerCase();
        return EVIDENCE_NOTE_CATEGORY_META[key] || EVIDENCE_NOTE_CATEGORY_META[DEFAULT_EVIDENCE_NOTE_CATEGORY];
    };
    const normalizeEvidenceNoteCategory = (value, fallback = DEFAULT_EVIDENCE_NOTE_CATEGORY) => {
        const key = String(value || '').trim().toLowerCase();
        return EVIDENCE_NOTE_CATEGORY_META[key] ? key : fallback;
    };
    const getEvidenceNoteCategoryLabel = (category) => getEvidenceNoteCategoryConfig(category).label;
    const getEvidenceNoteCategoryShortLabel = (category) => getEvidenceNoteCategoryConfig(category).shortLabel;
    const getDefaultEvidenceNoteTitle = (category = DEFAULT_EVIDENCE_NOTE_CATEGORY) => getEvidenceNoteCategoryConfig(category).defaultTitle || 'Zone';
    const getDefaultEvidenceNoteHighlightColor = (category = DEFAULT_EVIDENCE_NOTE_CATEGORY) => getEvidenceNoteCategoryConfig(category).color || DEFAULT_EVIDENCE_NOTE_COLOR;
    const normalizeEvidenceNoteTitle = (value, fallback = getDefaultEvidenceNoteTitle()) => {
        const clean = String(value || '').trim().slice(0, 160);
        return clean || fallback;
    };
    const EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX = 26;
    const EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX = 220;
    const EVIDENCE_NOTE_CHIP_ESTIMATED_CHAR_WIDTH_PX = 6.8;
    const EVIDENCE_NOTE_CHIP_ESTIMATED_PADDING_PX = 22;
    const normalizeEvidenceNoteBody = (value) => String(value || '').trim().slice(0, 6000);
    const getEvidenceNoteHighlightColor = (note) => {
        const category = normalizeEvidenceNoteCategory(note && note.category);
        return getDefaultEvidenceNoteHighlightColor(category);
    };
    const getEvidenceNoteHighlightRgb = (note) => {
        const hex = getEvidenceNoteHighlightColor(note);
        const clean = hex.slice(1);
        const normalized = clean.length === 3
            ? clean.split('').map((char) => char + char).join('')
            : clean;
        const value = parseInt(normalized, 16);
        if (!Number.isFinite(value)) return '255, 215, 120';
        return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
    };
    const getEvidenceNoteDisplayTitle = (note) => {
        const category = normalizeEvidenceNoteCategory(note && note.category);
        return normalizeEvidenceNoteTitle(note && note.title, getDefaultEvidenceNoteTitle(category));
    };
    const getSceneEvidenceNotes = (scene) => (Array.isArray(scene && scene.evidenceNotes) ? scene.evidenceNotes : []);
    const buildEvidenceNoteFromCellBounds = (scene, bounds, source = {}) => {
        if (!scene || !bounds) return null;
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const category = normalizeEvidenceNoteCategory(source.category);
        const defaultTitle = getDefaultEvidenceNoteTitle(category);
        const left = Math.round(toNumber(bounds.left, 0));
        const top = Math.round(toNumber(bounds.top, 0));
        const widthCells = Math.max(1, Math.round(toNumber(bounds.widthCells, 1)));
        const heightCells = Math.max(1, Math.round(toNumber(bounds.heightCells, 1)));
        return {
            id: String(source.id || buildId('evidence')).trim() || buildId('evidence'),
            category,
            title: normalizeEvidenceNoteTitle(source.title, defaultTitle),
            body: normalizeEvidenceNoteBody(source.body),
            hidden: source.hidden !== undefined ? !!source.hidden : !(source.visibleToPlayers !== undefined ? !!source.visibleToPlayers : true),
            highlightColor: getDefaultEvidenceNoteHighlightColor(category),
            x: Math.round(offsetX + left * cellPx),
            y: Math.round(offsetY + top * cellPx),
            w: Math.max(1, Math.round(widthCells * cellPx)),
            h: Math.max(1, Math.round(heightCells * cellPx))
        };
    };
    const buildEvidenceNoteFromWorldPoints = (scene, startWorldPoint, endWorldPoint, id = buildId('evidence'), source = {}) => {
        if (!scene || !startWorldPoint || !endWorldPoint) return null;
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const start = snapWorldPointToFogCorner(scene, startWorldPoint);
        const end = snapWorldPointToFogCorner(scene, endWorldPoint);
        const startCol = Math.round((start.x - offsetX) / cellPx);
        const startRow = Math.round((start.y - offsetY) / cellPx);
        const endCol = Math.round((end.x - offsetX) / cellPx);
        const endRow = Math.round((end.y - offsetY) / cellPx);
        return buildEvidenceNoteFromCellBounds(scene, {
            left: Math.min(startCol, endCol),
            top: Math.min(startRow, endRow),
            widthCells: Math.max(1, Math.abs(endCol - startCol)),
            heightCells: Math.max(1, Math.abs(endRow - startRow))
        }, {
            ...source,
            id
        });
    };
    const getEvidenceNoteCellBounds = (scene, note) => {
        if (!scene || !note) return null;
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const left = Math.round((toNumber(note.x, offsetX) - offsetX) / cellPx);
        const top = Math.round((toNumber(note.y, offsetY) - offsetY) / cellPx);
        const widthCells = Math.max(1, Math.round(Math.max(1, toNumber(note.w, cellPx)) / cellPx));
        const heightCells = Math.max(1, Math.round(Math.max(1, toNumber(note.h, cellPx)) / cellPx));
        return {
            left,
            top,
            widthCells,
            heightCells,
            right: left + widthCells,
            bottom: top + heightCells
        };
    };
    const isEvidenceNoteCoveredByFog = (scene, note, fogCellSet = null) => {
        if (!scene || !note) return false;
        const cellSet = fogCellSet instanceof Set ? fogCellSet : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
        if (!cellSet.size) return false;
        const bounds = getEvidenceNoteCellBounds(scene, note);
        if (!bounds) return false;
        for (let row = bounds.top; row < bounds.bottom; row += 1) {
            for (let col = bounds.left; col < bounds.right; col += 1) {
                if (!cellSet.has(buildFogCellKey(col, row))) return false;
            }
        }
        return true;
    };
    const isEvidenceNoteVisibleToRole = (note, scene, role = localRole, fogCellSet = null) => {
        if (!note) return false;
        if (role === 'dm') return true;
        if (note.hidden) return false;
        return !isEvidenceNoteCoveredByFog(scene, note, fogCellSet);
    };
    const getVisibleEvidenceNotesForRole = (scene, role = localRole) => {
        const notes = getSceneEvidenceNotes(scene);
        if (role === 'dm') return notes;
        const fogCellSet = collectFogCellSet(scene, Array.isArray(scene && scene.fog) ? scene.fog : []);
        return notes.filter((note) => isEvidenceNoteVisibleToRole(note, scene, role, fogCellSet));
    };
    const getEvidenceNoteById = (noteId, state = vttState, role = localRole) => {
        const targetId = String(noteId || '').trim();
        if (!targetId) return null;
        const scene = getActiveScene(state);
        if (!scene) return null;
        return getVisibleEvidenceNotesForRole(scene, role).find((note) => String(note && note.id || '').trim() === targetId) || null;
    };
    const buildEvidenceNoteExcerpt = (note, maxLength = 96) => {
        const body = String(note && note.body || '').replace(/\s+/g, ' ').trim();
        if (!body) return '';
        if (body.length <= maxLength) return body;
        return `${body.slice(0, Math.max(1, maxLength - 1)).trimEnd()}...`;
    };
    const buildEvidenceNoteAreaLabel = (note, scene) => {
        const bounds = getEvidenceNoteCellBounds(scene, note);
        if (!bounds) return '1 x 1 sq';
        return `${bounds.widthCells} x ${bounds.heightCells} sq`;
    };
    const applyEvidenceNoteChipPresentation = (noteEl) => {
        if (!(noteEl instanceof HTMLElement)) return;
        const titleEl = noteEl.querySelector('.vtt-map-note-title');
        if (!(titleEl instanceof HTMLElement)) return;
        const fullTitle = normalizeEvidenceNoteTitle(
            noteEl.dataset.noteTitle,
            getDefaultEvidenceNoteTitle(noteEl.dataset.noteCategory)
        );
        const noteWidthPx = Math.max(1, Math.round(noteEl.offsetWidth || toNumber(noteEl.dataset.worldWidth, 1) * localView.zoom));
        const availableWidthPx = clamp(noteWidthPx - 14, EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX, EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX);
        const estimatedTitleWidthPx = Math.max(
            EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX,
            Math.round(fullTitle.length * EVIDENCE_NOTE_CHIP_ESTIMATED_CHAR_WIDTH_PX + EVIDENCE_NOTE_CHIP_ESTIMATED_PADDING_PX)
        );
        const collapsed = estimatedTitleWidthPx > availableWidthPx;
        noteEl.classList.toggle('is-icon-only', collapsed);
        noteEl.style.setProperty('--vtt-note-chip-max-width', `${collapsed ? EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX : availableWidthPx}px`);
        titleEl.textContent = fullTitle;
        titleEl.dataset.noteCategoryShort = getEvidenceNoteCategoryShortLabel(noteEl.dataset.noteCategory);
        titleEl.setAttribute('aria-label', fullTitle);
        titleEl.title = fullTitle;
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
    const activateTokenSelection = (tokenId) => {
        const token = getTokenById(tokenId);
        if (!token) return null;
        selectedTokenId = token.id;
        selectedTemplateId = '';
        selectedEvidenceNoteId = '';
        visionConeRotateState = null;
        const linkedEntry = findEntryForToken(token.id);
        selectedEntryId = linkedEntry ? linkedEntry.id : '';
        return token;
    };
    const activateEvidenceNoteSelection = (noteId) => {
        const note = getEvidenceNoteById(noteId);
        if (!note) return null;
        selectedEvidenceNoteId = note.id;
        selectedTokenId = '';
        selectedEntryId = '';
        selectedTemplateId = '';
        previewTokenId = '';
        visionConeRotateState = null;
        return note;
    };
    const beginTouchContextInteraction = (event, scene, worldPoint) => {
        if (!canUseTouchContextActions(event)) return false;
        const pointerType = String(event && event.pointerType || '').toLowerCase();
        if (!isDM() || localToolState.mode !== TOOL_MODE_NAVIGATE) return false;
        clearPendingTouchContext();
        const targetEl = getEventTargetElement(event);
        const tokenEl = targetEl ? targetEl.closest('.vtt-token') : null;
        if (tokenEl) {
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token) return false;
            const canMoveToken = canRoleMoveToken(token, localRole);
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
                originX: localView.x,
                originY: localView.y,
                triggered: false,
                timer: 0
            };
            state.timer = window.setTimeout(() => {
                if (pendingTouchContextState !== state) return;
                state.triggered = true;
                previewTokenId = '';
                activateTokenSelection(state.tokenId);
                openTokenInspectorPopover(state.tokenId, state.clientX, state.clientY);
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
            originX: localView.x,
            originY: localView.y,
            worldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
            triggered: false,
            timer: 0
        };
        state.timer = window.setTimeout(() => {
            if (pendingTouchContextState !== state) return;
            state.triggered = true;
            previewTokenId = '';
            openQuickSpawnMenu(state.clientX, state.clientY);
            render();
        }, TOUCH_CONTEXT_HOLD_MS);
        pendingTouchContextState = state;
        return true;
    };
    const getVisionConeRangeCells = (token) => {
        const baseRange = Math.max(0, Math.round(toNumber(token && token.vision && token.vision.baseRangeCells, 6)));
        const passivePerception = getVisionPassivePerception(token);
        return Math.max(0, baseRange + Math.max(0, Math.floor((passivePerception - 10) / 2)));
    };
    const getVisionConeArcDeg = (token) => clamp(toNumber(token && token.vision && token.vision.arcDeg, 90), 1, 360);
    const getTokenVisionFacingDeg = (token) => normalizeAngleDeg(token && token.vision && token.vision.facingDeg);
    const getVisionConeGeometry = (token, scene, sceneSize = getWorldSizeForScene(scene)) => {
        if (!token || !scene || !token.vision || !token.vision.enabled) return null;
        const side = String(token.side || '').trim().toLowerCase();
        if (side !== 'enemy' && side !== 'neutral') return null;
        const rangeCells = getVisionConeRangeCells(token);
        if (!rangeCells) return null;
        const origin = getTemplateWorldPoint(scene, getTokenCenterInCells(token));
        const radiusPx = rangeCells * getSceneCellPx(scene);
        return {
            left: 0,
            top: 0,
            width: Math.max(1, Math.round(toNumber(sceneSize && sceneSize.width, DEFAULT_WORLD_SIZE.width))),
            height: Math.max(1, Math.round(toNumber(sceneSize && sceneSize.height, DEFAULT_WORLD_SIZE.height))),
            centerX: origin.x,
            centerY: origin.y,
            radiusPx,
            facingDeg: getTokenVisionFacingDeg(token),
            arcDeg: getVisionConeArcDeg(token)
        };
    };
    const isCellPointInsideVisionCone = (point, token) => {
        if (!point || !token || !token.vision || !token.vision.enabled) return false;
        const origin = getTokenCenterInCells(token);
        const dx = toNumber(point.x, 0) - origin.x;
        const dy = toNumber(point.y, 0) - origin.y;
        const distance = Math.hypot(dx, dy);
        const rangeCells = getVisionConeRangeCells(token);
        if (distance > rangeCells || !rangeCells) return false;
        const angle = normalizeAngleDeg(Math.atan2(dy, dx) * 180 / Math.PI);
        const facing = normalizeAngleDeg(token.vision.facingDeg);
        const delta = Math.abs((((angle - facing) + 540) % 360) - 180);
        return delta <= getVisionConeArcDeg(token) / 2;
    };
    const getStealthVisionTargetSummary = (token, scene, state = vttState) => {
        const summary = { detectedIds: [], unseenIds: [] };
        if (!token || !scene || !state || !Array.isArray(scene.tokens)) return summary;
        const enemyPassivePerception = getVisionPassivePerception(token);
        scene.tokens.forEach((candidate) => {
            if (!candidate || candidate.id === token.id) return;
            const side = String(candidate.side || '').trim().toLowerCase();
            if (side !== 'player' && side !== 'ally') return;
            const intersectsCone = getTokenFootprintPoints(candidate).some((point) => isCellPointInsideVisionCone(point, token));
            if (!intersectsCone) return;
            const stealthRoll = getTokenStealthRoll(candidate);
            if (stealthRoll !== null && stealthRoll > enemyPassivePerception) {
                summary.unseenIds.push(candidate.id);
                return;
            }
            summary.detectedIds.push(candidate.id);
        });
        return summary;
    };
    const buildStealthStatusMap = (scene, state = vttState) => {
        const statuses = new Map();
        if (!scene || !scene.stealthMode || !Array.isArray(scene.tokens)) return statuses;
        scene.tokens.forEach((token) => {
            const side = String(token && token.side || '').trim().toLowerCase();
            if (side !== 'enemy' && side !== 'neutral') return;
            if (isTokenHiddenForRole(token, scene, 'player')) return;
            const summary = getStealthVisionTargetSummary(token, scene, state);
            summary.unseenIds.forEach((tokenId) => {
                if (!statuses.has(tokenId)) statuses.set(tokenId, STEALTH_STATUS_UNSEEN);
            });
            summary.detectedIds.forEach((tokenId) => {
                statuses.set(tokenId, STEALTH_STATUS_DETECTED);
            });
        });
        return statuses;
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
    const getUIPrefsStorageKey = () => `${UI_PREFS_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getProcessedInitStorageKey = () => `${PROCESSED_INIT_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getRolePrefsStorageKey = () => {
        const store = getStore();
        return store && typeof store.getVTTLocalPrefsStorageKey === 'function'
            ? String(store.getVTTLocalPrefsStorageKey() || '').trim()
            : '';
    };
    const isVTTCollabReady = () => !!(vttCollabSession && typeof vttCollabSession.isActive === 'function' && vttCollabSession.isActive());
    const getVTTCollabStatus = () => (
        vttCollabSession && typeof vttCollabSession.getStatus === 'function'
            ? vttCollabSession.getStatus()
            : null
    );
    const isDM = () => localRole === 'dm';
    const closeNPCSearch = ({ clearQuery = false } = {}) => {
        npcSearchOpen = false;
        npcSearchState = null;
        if (clearQuery) npcSearchQuery = '';
    };
    const normalizeToolMode = (value) => {
        const token = String(value || '').trim().toLowerCase();
        if (token === TOOL_MODE_RULER || token === TOOL_MODE_CIRCLE || token === TOOL_MODE_CONE || token === TOOL_MODE_NOTE || token === TOOL_MODE_FOG || token === TOOL_MODE_FOG_REMOVE) return token;
        return TOOL_MODE_NAVIGATE;
    };
    const normalizeToolSizeCells = (value, fallback = DEFAULT_TOOL_SIZE_CELLS) => clamp(Math.round(toNumber(value, fallback)), 1, 99);
    const normalizeAngleDeg = (value) => {
        const parsed = Math.round(toNumber(value, 0));
        const result = parsed % 360;
        return result < 0 ? result + 360 : result;
    };
    const getSceneCellPx = (scene) => Math.max(1, toNumber(scene && scene.grid && scene.grid.cellPx, DEFAULT_VTT_CELL_PX));
    const snapTemplateCenterCellCoordinate = (value) => Math.max(0.5, Math.round(toNumber(value, 0.5) - 0.5) + 0.5);
    const snapTemplateIntersectionCellCoordinate = (value) => Math.max(0, Math.round(toNumber(value, 0)));
    const snapWorldPointToTemplateAnchor = (scene, worldPoint) => {
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const rawX = (toNumber(worldPoint && worldPoint.x, 0) - offsetX) / cellPx;
        const rawY = (toNumber(worldPoint && worldPoint.y, 0) - offsetY) / cellPx;
        const centerAnchor = {
            x: snapTemplateCenterCellCoordinate(rawX),
            y: snapTemplateCenterCellCoordinate(rawY)
        };
        const intersectionAnchor = {
            x: snapTemplateIntersectionCellCoordinate(rawX),
            y: snapTemplateIntersectionCellCoordinate(rawY)
        };
        const centerDistanceSq = Math.pow(rawX - centerAnchor.x, 2) + Math.pow(rawY - centerAnchor.y, 2);
        const intersectionDistanceSq = Math.pow(rawX - intersectionAnchor.x, 2) + Math.pow(rawY - intersectionAnchor.y, 2);
        if (intersectionDistanceSq < centerDistanceSq) {
            return intersectionAnchor;
        }
        return {
            x: centerAnchor.x,
            y: centerAnchor.y
        };
    };
    const getTemplateById = (templateId, state = vttState) => {
        const scene = getActiveScene(state);
        if (!scene || !Array.isArray(scene.templates)) return null;
        return scene.templates.find((template) => String(template && template.id || '').trim() === String(templateId || '').trim()) || null;
    };
    const buildRemoteTokenTweenKey = (sceneId, tokenId) => `${String(sceneId || '').trim()}::${String(tokenId || '').trim()}`;
    const easeRemoteTokenTween = (progress) => 1 - Math.pow(1 - clamp(progress, 0, 1), 3);
    const normalizeRemoteTokenFacingDeg = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        return normalizeAngleDeg(parsed);
    };
    const getAngleTweenDeltaDeg = (fromDeg, toDeg) => {
        if (fromDeg === null || toDeg === null) return 0;
        return (((toDeg - fromDeg) + 540) % 360) - 180;
    };
    const pruneRemoteTokenTweens = (now = Date.now()) => {
        for (const [key, tween] of remoteTokenTweens.entries()) {
            if (!tween || !Number.isFinite(tween.startedAt) || !Number.isFinite(tween.durationMs)) {
                remoteTokenTweens.delete(key);
                continue;
            }
            if (now >= tween.startedAt + tween.durationMs) {
                remoteTokenTweens.delete(key);
            }
        }
    };
    const hasActiveSceneRemoteTweens = (sceneId = getViewedSceneId(vttState, localRole), now = Date.now()) => {
        const targetSceneId = String(sceneId || '').trim();
        if (!targetSceneId) return false;
        for (const tween of remoteTokenTweens.values()) {
            if (!tween || tween.sceneId !== targetSceneId) continue;
            if (now < tween.startedAt + tween.durationMs) return true;
        }
        return false;
    };
    const scheduleRemoteTokenTweenRender = () => {
        if (remoteTokenTweenFrame || !hasActiveSceneRemoteTweens()) return;
        remoteTokenTweenFrame = window.requestAnimationFrame(() => {
            remoteTokenTweenFrame = 0;
            pruneRemoteTokenTweens();
            renderStage();
            if (hasActiveSceneRemoteTweens()) scheduleRemoteTokenTweenRender();
        });
    };
    const queueRemoteTokenTween = (sceneId, tokenId, fromX, fromY, toX, toY, fromFacingDegRaw = null, toFacingDegRaw = null) => {
        const cleanSceneId = String(sceneId || '').trim();
        const cleanTokenId = String(tokenId || '').trim();
        if (!cleanSceneId || !cleanTokenId) return;
        const tweenKey = buildRemoteTokenTweenKey(cleanSceneId, cleanTokenId);
        const fromFacingDeg = normalizeRemoteTokenFacingDeg(fromFacingDegRaw);
        const toFacingDeg = normalizeRemoteTokenFacingDeg(toFacingDegRaw);
        const facingDelta = Math.abs(getAngleTweenDeltaDeg(fromFacingDeg, toFacingDeg));
        if (fromX === toX && fromY === toY && facingDelta <= 0.001) {
            remoteTokenTweens.delete(tweenKey);
            return;
        }
        remoteTokenTweens.set(tweenKey, {
            sceneId: cleanSceneId,
            tokenId: cleanTokenId,
            fromX,
            fromY,
            toX,
            toY,
            fromFacingDeg,
            toFacingDeg,
            startedAt: Date.now(),
            durationMs: REMOTE_TOKEN_TWEEN_MS
        });
        scheduleRemoteTokenTweenRender();
    };
    const queueRemoteTweensFromSnapshots = (previousState, nextState) => {
        if (!previousState || !nextState || !Array.isArray(previousState.scenes) || !Array.isArray(nextState.scenes)) return;
        const previousScenes = new Map(previousState.scenes.map((scene) => [String(scene && scene.id || '').trim(), scene]));
        nextState.scenes.forEach((scene) => {
            const cleanSceneId = String(scene && scene.id || '').trim();
            if (!cleanSceneId || !scene || !Array.isArray(scene.tokens)) return;
            const previousScene = previousScenes.get(cleanSceneId);
            if (!previousScene || !Array.isArray(previousScene.tokens)) return;
            const previousTokens = new Map(previousScene.tokens.map((token) => [String(token && token.id || '').trim(), token]));
            scene.tokens.forEach((token) => {
                const previousToken = previousTokens.get(String(token && token.id || '').trim());
                if (!previousToken || !token) return;
                const fromX = normalizeTokenCoordinate(previousToken.x, token.x);
                const fromY = normalizeTokenCoordinate(previousToken.y, token.y);
                const toX = normalizeTokenCoordinate(token.x, fromX);
                const toY = normalizeTokenCoordinate(token.y, fromY);
                const fromFacingDeg = previousToken.vision && previousToken.vision.facingDeg;
                const toFacingDeg = token.vision && token.vision.facingDeg;
                queueRemoteTokenTween(cleanSceneId, token.id, fromX, fromY, toX, toY, fromFacingDeg, toFacingDeg);
            });
        });
    };
    const getRenderableTokenCells = (token, scene, now = Date.now()) => {
        if (!token || !scene) return { x: 0, y: 0 };
        if (dragState && String(dragState.tokenId || '').trim() === String(token.id || '').trim()) {
            return {
                x: normalizeTokenCoordinate(token.x, 0),
                y: normalizeTokenCoordinate(token.y, 0)
            };
        }
        const tweenKey = buildRemoteTokenTweenKey(scene.id, token.id);
        const tween = remoteTokenTweens.get(tweenKey);
        if (!tween || now >= tween.startedAt + tween.durationMs) {
            if (tween) remoteTokenTweens.delete(tweenKey);
            return {
                x: normalizeTokenCoordinate(token.x, 0),
                y: normalizeTokenCoordinate(token.y, 0)
            };
        }
        const progress = easeRemoteTokenTween((now - tween.startedAt) / tween.durationMs);
        return {
            x: Math.round((tween.fromX + (tween.toX - tween.fromX) * progress) * TOKEN_COORD_PRECISION) / TOKEN_COORD_PRECISION,
            y: Math.round((tween.fromY + (tween.toY - tween.fromY) * progress) * TOKEN_COORD_PRECISION) / TOKEN_COORD_PRECISION
        };
    };
    const getRenderableTokenFacingDeg = (token, scene, now = Date.now()) => {
        if (!token || !scene || !token.vision) return getTokenVisionFacingDeg(token);
        const tweenKey = buildRemoteTokenTweenKey(scene.id, token.id);
        const tween = remoteTokenTweens.get(tweenKey);
        if (!tween || now >= tween.startedAt + tween.durationMs || tween.fromFacingDeg === null || tween.toFacingDeg === null) {
            return getTokenVisionFacingDeg(token);
        }
        const progress = easeRemoteTokenTween((now - tween.startedAt) / tween.durationMs);
        return normalizeAngleDeg(tween.fromFacingDeg + getAngleTweenDeltaDeg(tween.fromFacingDeg, tween.toFacingDeg) * progress);
    };
    const getRenderableVisionToken = (token, scene, now = Date.now()) => {
        if (!token || !token.vision) return token;
        if (visionConeRotateState && visionConeRotateState.tokenId === token.id) {
            return {
                ...token,
                vision: {
                    ...(token.vision || {}),
                    facingDeg: visionConeRotateState.angleDeg
                }
            };
        }
        return {
            ...token,
            vision: {
                ...(token.vision || {}),
                facingDeg: getRenderableTokenFacingDeg(token, scene, now)
            }
        };
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
    const deleteTemplateById = (templateId) => {
        const targetId = String(templateId || '').trim();
        if (!targetId) return false;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.templates)) return;
            scene.templates = scene.templates.filter((template) => String(template && template.id || '').trim() !== targetId);
            if (selectedTemplateId === targetId) selectedTemplateId = '';
            if (templateRotateState && templateRotateState.templateId === targetId) templateRotateState = null;
        });
        return true;
    };
    const clearTemplatePlacementState = () => {
        if (!templatePlacementState && !templateRotateState && !visionConeRotateState && !rulerState && !fogPlacementState && !evidenceNotePlacementState) return false;
        templatePlacementState = null;
        templateRotateState = null;
        visionConeRotateState = null;
        rulerState = null;
        fogPlacementState = null;
        evidenceNotePlacementState = null;
        return true;
    };
    const setToolMode = (mode) => {
        clearTemplatePlacementState();
        localToolState.mode = normalizeToolMode(mode);
    };
    const closeToolsMenu = () => {
        if (!toolsMenuOpen) return false;
        toolsMenuOpen = false;
        renderToolsMenu();
        return true;
    };

    const renderNavMenu = () => {
        if (navMenuEl) navMenuEl.hidden = !navMenuOpen;
        if (navMenuToggleEl) navMenuToggleEl.setAttribute('aria-expanded', navMenuOpen ? 'true' : 'false');
    };

    const renderViewMenu = () => {
        if (viewMenuEl) viewMenuEl.hidden = !viewMenuOpen;
        if (viewMenuToggleEl) viewMenuToggleEl.setAttribute('aria-expanded', viewMenuOpen ? 'true' : 'false');
    };

    const renderToolsMenu = () => {
        if (toolsMenuEl) toolsMenuEl.hidden = !toolsMenuOpen;
        if (toolsMenuToggleEl) toolsMenuToggleEl.setAttribute('aria-expanded', toolsMenuOpen ? 'true' : 'false');
        if (rulerToggleEl) rulerToggleEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_RULER ? 'true' : 'false');
        if (toolModeNavigateEl) toolModeNavigateEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_NAVIGATE ? 'true' : 'false');
        if (toolModeCircleEl) toolModeCircleEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_CIRCLE ? 'true' : 'false');
        if (toolModeConeEl) toolModeConeEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_CONE ? 'true' : 'false');
        if (toolModeNoteEl) {
            toolModeNoteEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_NOTE ? 'true' : 'false');
            toolModeNoteEl.disabled = !isDM();
        }
        if (toolModeFogEl) {
            toolModeFogEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_FOG ? 'true' : 'false');
            toolModeFogEl.disabled = !isDM();
        }
        if (toolModeFogRemoveEl) {
            toolModeFogRemoveEl.setAttribute('aria-pressed', localToolState.mode === TOOL_MODE_FOG_REMOVE ? 'true' : 'false');
            toolModeFogRemoveEl.disabled = !isDM();
        }
        if (toolSizeInputEl && document.activeElement !== toolSizeInputEl) {
            toolSizeInputEl.value = String(localToolState.sizeCells);
        }
        if (toolSizeInputEl) {
            const dragAreaModeActive = localToolState.mode === TOOL_MODE_FOG || localToolState.mode === TOOL_MODE_FOG_REMOVE || localToolState.mode === TOOL_MODE_NOTE;
            toolSizeInputEl.disabled = dragAreaModeActive;
            toolSizeInputEl.title = dragAreaModeActive ? 'Fog and Zone tools use drag area selection on the scene grid.' : '';
        }
        if (stealthModeToggleEl) {
            const scene = getActiveScene();
            const enabled = !!(scene && scene.stealthMode);
            stealthModeToggleEl.textContent = `Sight Cones: ${enabled ? 'On' : 'Off'}`;
            stealthModeToggleEl.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            stealthModeToggleEl.disabled = !isDM();
        }
        if (clearFogButtonEl) {
            const scene = getActiveScene();
            const fogCount = scene && Array.isArray(scene.fog) ? scene.fog.length : 0;
            clearFogButtonEl.disabled = !isDM() || fogCount === 0;
            clearFogButtonEl.textContent = fogCount > 0 ? `Clear Fog (${fogCount})` : 'Clear Fog';
        }
        if (body) body.dataset.toolMode = localToolState.mode;
    };

    const positionNPCSearchPopover = () => {
        if (!npcSearchPopoverEl || npcSearchPopoverEl.hidden) return;
        const margin = 12;
        const gap = 8;
        const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
        const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
        const maxWidth = Math.max(0, viewportWidth - margin * 2);
        const maxHeight = Math.max(0, viewportHeight - margin * 2);

        npcSearchPopoverEl.style.right = 'auto';
        npcSearchPopoverEl.style.maxWidth = `${Math.round(maxWidth)}px`;
        npcSearchPopoverEl.style.maxHeight = `${Math.round(maxHeight)}px`;

        const popoverWidth = Math.max(0, Math.min(npcSearchPopoverEl.offsetWidth || maxWidth, maxWidth));
        const popoverHeight = npcSearchPopoverEl.offsetHeight || 0;
        let left = margin;
        let top = margin;

        if (npcSearchState) {
            left = npcSearchState.clientX + 14;
            top = npcSearchState.clientY + 14;
            if (left + popoverWidth > viewportWidth - margin) {
                left = Math.max(margin, npcSearchState.clientX - popoverWidth - 14);
            }
            if (top + popoverHeight > viewportHeight - margin) {
                top = Math.max(margin, viewportHeight - popoverHeight - margin);
            }
        } else if (npcSearchToggleEl) {
            const toggleRect = npcSearchToggleEl.getBoundingClientRect();
            left = toggleRect.right - popoverWidth;
            left = clamp(left, margin, Math.max(margin, viewportWidth - popoverWidth - margin));

            top = toggleRect.bottom + gap;
            if (top + popoverHeight > viewportHeight - margin) {
                const aboveTop = toggleRect.top - popoverHeight - gap;
                top = aboveTop >= margin
                    ? aboveTop
                    : Math.max(margin, viewportHeight - popoverHeight - margin);
            }
        }

        npcSearchPopoverEl.style.left = `${Math.round(left)}px`;
        npcSearchPopoverEl.style.top = `${Math.round(top)}px`;
    };

    const positionTokenInspectorPopover = () => {
        if (!tokenInspectorPopoverEl || tokenInspectorPopoverEl.hidden || !tokenInspectorState) return;
        const width = tokenInspectorPopoverEl.offsetWidth || 420;
        const height = tokenInspectorPopoverEl.offsetHeight || 520;
        const margin = 12;
        let left = tokenInspectorState.clientX + 14;
        let top = tokenInspectorState.clientY + 14;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, tokenInspectorState.clientX - width - 14);
        }
        if (top + height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - height - margin);
        }
        tokenInspectorPopoverEl.style.left = `${Math.round(left)}px`;
        tokenInspectorPopoverEl.style.top = `${Math.round(top)}px`;
    };

    const closeInitiativeDetail = () => {
        if (!initiativeDetailState && (!initiativeDetailPanelEl || initiativeDetailPanelEl.hidden)) return false;
        initiativeDetailState = null;
        if (initiativeDetailPanelEl) initiativeDetailPanelEl.hidden = true;
        return true;
    };

    const openInitiativeDetail = (entryId, clientX, clientY) => {
        const targetId = String(entryId || '').trim();
        if (!targetId || !isDM()) return false;
        selectedEntryId = targetId;
        initiativeDetailState = {
            entryId: targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        return true;
    };

    const positionInitiativeDetail = () => {
        if (!initiativeDetailPanelEl || initiativeDetailPanelEl.hidden || !initiativeDetailState) return;
        const width = initiativeDetailPanelEl.offsetWidth || 360;
        const height = initiativeDetailPanelEl.offsetHeight || 420;
        const margin = 12;
        let left = initiativeDetailState.clientX + 14;
        let top = initiativeDetailState.clientY + 14;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, initiativeDetailState.clientX - width - 14);
        }
        if (top + height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - height - margin);
        }
        initiativeDetailPanelEl.style.left = `${Math.round(left)}px`;
        initiativeDetailPanelEl.style.top = `${Math.round(top)}px`;
    };

    const applyUIPreferences = () => {
        if (body) {
            body.dataset.settingsCollapsed = uiState.settingsCollapsed ? '1' : '0';
            body.dataset.initiativeCollapsed = uiState.initiativeCollapsed ? '1' : '0';
            body.dataset.scenePanelCollapsed = uiState.scenePanelCollapsed ? '1' : '0';
            body.dataset.spawnPanelCollapsed = uiState.spawnPanelCollapsed ? '1' : '0';
            body.dataset.inspectorPanelCollapsed = uiState.inspectorPanelCollapsed ? '1' : '0';
            body.dataset.gridHidden = uiState.showGrid ? '0' : '1';
            body.dataset.tokenNamesHidden = uiState.showTokenNames ? '0' : '1';
        }
        if (settingsToggleEl) {
            settingsToggleEl.textContent = `Sidebar: ${uiState.settingsCollapsed ? 'Off' : 'On'}`;
            settingsToggleEl.setAttribute('aria-pressed', uiState.settingsCollapsed ? 'false' : 'true');
            settingsToggleEl.disabled = !isDM();
        }
        if (initiativeToggleEl) {
            initiativeToggleEl.textContent = `Initiative: ${uiState.initiativeCollapsed ? 'Off' : 'On'}`;
            initiativeToggleEl.setAttribute('aria-pressed', uiState.initiativeCollapsed ? 'false' : 'true');
        }
        if (scenePanelToggleEl) {
            scenePanelToggleEl.textContent = `Scene Panel: ${uiState.scenePanelCollapsed ? 'Off' : 'On'}`;
            scenePanelToggleEl.setAttribute('aria-pressed', uiState.scenePanelCollapsed ? 'false' : 'true');
            scenePanelToggleEl.disabled = !isDM();
        }
        if (spawnPanelToggleEl) {
            spawnPanelToggleEl.textContent = `Spawn Panel: ${uiState.spawnPanelCollapsed ? 'Off' : 'On'}`;
            spawnPanelToggleEl.setAttribute('aria-pressed', uiState.spawnPanelCollapsed ? 'false' : 'true');
            spawnPanelToggleEl.disabled = !isDM();
        }
        if (inspectorPanelToggleEl) {
            inspectorPanelToggleEl.textContent = `Inspector: ${uiState.inspectorPanelCollapsed ? 'Off' : 'On'}`;
            inspectorPanelToggleEl.setAttribute('aria-pressed', uiState.inspectorPanelCollapsed ? 'false' : 'true');
        }
        if (tokenNamesToggleEl) {
            tokenNamesToggleEl.textContent = `Token Names: ${uiState.showTokenNames ? 'On' : 'Off'}`;
            tokenNamesToggleEl.setAttribute('aria-pressed', uiState.showTokenNames ? 'true' : 'false');
        }
        if (gridToggleEl) {
            gridToggleEl.textContent = `Grid: ${uiState.showGrid ? 'On' : 'Off'}`;
            gridToggleEl.setAttribute('aria-pressed', uiState.showGrid ? 'true' : 'false');
        }
        renderViewMenu();
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
                showGrid: parsed && parsed.showGrid !== undefined ? !!parsed.showGrid : true,
                showTokenNames: parsed && parsed.showTokenNames !== undefined ? !!parsed.showTokenNames : true,
                sceneViewMode: SCENE_VIEW_SHARED,
                localSceneId: ''
            };
        } catch (err) {
            uiState = {
                settingsCollapsed: false,
                initiativeCollapsed: false,
                scenePanelCollapsed: false,
                spawnPanelCollapsed: false,
                inspectorPanelCollapsed: false,
                showGrid: true,
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

    const isUsingLocalSceneView = (_state = vttState, _role = localRole) => false;

    const getViewedSceneId = (state = vttState, _role = localRole) => getSharedSceneId(state);

    const setSceneViewPreference = (_mode, _sceneId = '') => {
        uiState.sceneViewMode = SCENE_VIEW_SHARED;
        uiState.localSceneId = '';
        persistUIPreferences();
    };
    const canEditInitiative = () => isDM();

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

    const findPlayerById = (playerId) => {
        const targetId = String(playerId || '').trim();
        if (!targetId) return null;
        return getPlayers().find((player) => String(player && player.id || '') === targetId) || null;
    };

    const getNPCs = () => {
        const store = getStore();
        return store && typeof store.getNPCs === 'function' ? store.getNPCs() : [];
    };

    const normalizeMoveAccess = (value, fallback = 'dm') => {
        const clean = String(value || fallback || 'dm').trim().toLowerCase();
        return clean === 'player' ? 'player' : 'dm';
    };

    const getRosterPlayerForRecord = (record) => {
        const source = record && typeof record === 'object' ? record : null;
        if (!source) return null;
        if (String(source.sourceType || '').trim() === 'player') {
            return findPlayerById(source.sourceId);
        }
        return null;
    };

    const syncTokenRosterIdentity = (token, player) => {
        if (!token || !player) return false;
        const nextLabel = String(player.name || 'Player').trim() || 'Player';
        const nextImageUrl = toSharedTokenImageUrl(player.imageUrl);
        let mutated = false;
        if (token.label !== nextLabel) {
            token.label = nextLabel;
            mutated = true;
        }
        if ((token.imageUrl || '') !== nextImageUrl) {
            token.imageUrl = nextImageUrl;
            mutated = true;
        }
        return mutated;
    };

    const syncEntryRosterIdentity = (entry, player) => {
        if (!entry || !player) return false;
        const nextName = String(player.name || 'Player').trim() || 'Player';
        const nextImageUrl = toSharedTokenImageUrl(player.imageUrl);
        let mutated = false;
        if (entry.name !== nextName) {
            entry.name = nextName;
            mutated = true;
        }
        if ((entry.imageUrl || '') !== nextImageUrl) {
            entry.imageUrl = nextImageUrl;
            mutated = true;
        }
        if (entry.sourceType !== 'player') {
            entry.sourceType = 'player';
            mutated = true;
        }
        const nextSourceId = String(player.id || '').trim();
        if ((entry.sourceId || '') !== nextSourceId) {
            entry.sourceId = nextSourceId;
            mutated = true;
        }
        return mutated;
    };

    const syncRosterLinkedPlayerPresentation = (state = vttState) => {
        if (!state || !Array.isArray(state.scenes) || !state.initiative || !Array.isArray(state.initiative.entries)) return false;
        const players = getPlayers();
        if (!players.length) return false;
        const playersById = new Map(players.map((player) => [String(player && player.id || '').trim(), player]).filter(([id]) => !!id));
        if (!playersById.size) return false;

        let mutated = false;
        const playerByTokenId = new Map();
        state.scenes.forEach((scene) => {
            if (!scene || !Array.isArray(scene.tokens)) return;
            scene.tokens.forEach((token) => {
                const player = playersById.get(String(token && token.sourceId || '').trim());
                if (!player || String(token && token.sourceType || '').trim() !== 'player') return;
                if (syncTokenRosterIdentity(token, player)) mutated = true;
                playerByTokenId.set(String(token.id || '').trim(), player);
            });
        });

        state.initiative.entries.forEach((entry) => {
            const linkedPlayer = playersById.get(String(entry && entry.sourceId || '').trim())
                || playerByTokenId.get(String(entry && entry.linkedTokenId || '').trim())
                || null;
            if (!linkedPlayer) return;
            if (syncEntryRosterIdentity(entry, linkedPlayer)) mutated = true;
        });

        if (mutated && Array.isArray(state.initiative.entries)) {
            sortInitiativeEntries(state.initiative.entries);
        }
        return mutated;
    };

    const canRoleMoveToken = (token, role = localRole) => {
        if (!token) return false;
        if (role === 'dm') return true;
        return normalizeMoveAccess(token.moveAccess, token.sourceType === 'player' ? 'player' : 'dm') === 'player';
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
            imageUrl: toSharedTokenImageUrl(player && player.imageUrl),
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            sourceType: 'player',
            sourceId: String(player && player.id || '').trim(),
            moveAccess: 'player',
            hpCurrent: hp.hpCurrent,
            hpMax: hp.hpMax,
            ac: Number.isFinite(Number(player && player.ac)) ? clamp(Math.round(Number(player.ac)), 0, 99) : null,
            passivePerception: Number.isFinite(Number(player && player.pp)) ? clamp(Math.round(Number(player.pp)), 0, 99) : null,
            defences: normalizeDefences(null),
            conditions: [],
            hidden: false,
            stealthRoll: null,
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
            moveAccess: 'dm',
            hpCurrent: hp.hpCurrent,
            hpMax: hp.hpMax,
            ac: Number.isFinite(Number(npc && npc.ac)) ? clamp(Math.round(Number(npc.ac)), 0, 99) : null,
            passivePerception: Number.isFinite(Number(npc && npc.pp)) ? clamp(Math.round(Number(npc.pp)), 0, 99) : null,
            defences: normalizeDefences(npc && npc.defences),
            conditions: [],
            hidden: false,
            stealthRoll: null,
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
        moveAccess: 'dm',
        hpCurrent: null,
        hpMax: null,
        ac: null,
        passivePerception: null,
        defences: normalizeDefences(null),
        conditions: [],
        hidden: false,
        stealthRoll: null,
        vision: {
            enabled: true,
            facingDeg: 0,
            arcDeg: 90,
            baseRangeCells: 6,
            passivePerception: 10
        }
    });

    const GUILDLESS_LABEL_PATTERN = /^guildless(?:\s+(\d+))?$/i;

    const getNextGuildlessTokenNumber = (scene) => {
        if (!scene || !Array.isArray(scene.tokens)) return 1;
        let maxGuildlessNumber = 0;
        scene.tokens.forEach((token) => {
            const label = String(token && token.label || '').trim();
            const match = label.match(GUILDLESS_LABEL_PATTERN);
            if (!match) return;
            const nextNumber = match[1] ? Math.max(1, Math.round(toNumber(match[1], 1))) : 1;
            if (nextNumber > maxGuildlessNumber) maxGuildlessNumber = nextNumber;
        });
        return maxGuildlessNumber + 1;
    };

    const buildGuildlessTokenLabel = (scene = null) => `Guildless ${getNextGuildlessTokenNumber(scene)}`;

    const buildGuildlessToken = (label = 'Guildless') => ({
        ...buildCustomToken(),
        label,
        imageUrl: buildGuildlessImageUrl()
    });

    const findSpawnSource = (kind, id = '') => {
        const sourceId = String(id || '').trim();
        if (kind === 'player') {
            return getPlayers().find((entry) => String(entry && entry.id || '') === sourceId) || null;
        }
        if (kind === 'npc') {
            return getNPCs().find((entry) => String(entry && entry.id || '') === sourceId) || null;
        }
        if (kind === 'guildless') {
            return { name: 'Guildless' };
        }
        if (kind === 'custom') {
            return { name: 'Custom Token' };
        }
        return null;
    };

    const getSpawnDescriptorLabel = (kind, id = '') => {
        if (kind === 'guildless') return buildGuildlessTokenLabel(getActiveScene(vttState));
        const source = findSpawnSource(kind, id);
        if (source && source.name) return String(source.name).trim() || 'Token';
        if (kind === 'player') return 'Player';
        if (kind === 'npc') return 'NPC';
        return 'Custom Token';
    };

    const buildTokenFromSpawnDescriptor = (kind, id = '') => {
        if (kind === 'player') {
            const player = findSpawnSource('player', id);
            return player ? buildTokenFromPlayer(player) : null;
        }
        if (kind === 'npc') {
            const npc = findSpawnSource('npc', id);
            return npc ? buildTokenFromNPC(npc) : null;
        }
        if (kind === 'guildless') {
            return buildGuildlessToken();
        }
        if (kind === 'custom') {
            return buildCustomToken();
        }
        return null;
    };

    const positionTokenAtWorldPoint = (token, scene, worldPoint) => {
        if (!token || !scene || !scene.grid || !worldPoint) return token;
        const cellPx = Math.max(1, toNumber(scene.grid.cellPx, DEFAULT_VTT_CELL_PX));
        const offsetX = toNumber(scene.grid.offsetX, 0);
        const offsetY = toNumber(scene.grid.offsetY, 0);
        const tokenWidth = Math.max(1, toNumber(token.w, 1));
        const tokenHeight = Math.max(1, toNumber(token.h, 1));
        const cellX = (toNumber(worldPoint.x, 0) - offsetX) / cellPx;
        const cellY = (toNumber(worldPoint.y, 0) - offsetY) / cellPx;
        token.x = normalizeTokenCoordinate(cellX - tokenWidth / 2, token.x);
        token.y = normalizeTokenCoordinate(cellY - tokenHeight / 2, token.y);
        return token;
    };

    const cloneTokenRecord = (token) => {
        if (!token) return null;
        const clone = deepClone(token);
        clone.id = buildId('token');
        clone.x = normalizeTokenCoordinate(toNumber(token.x, 0) + 1, toNumber(token.x, 0));
        clone.y = normalizeTokenCoordinate(toNumber(token.y, 0) + 1, toNumber(token.y, 0));
        clone.sourceType = '';
        clone.sourceId = '';
        return clone;
    };

    const cloneTokenById = (tokenId) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId) return false;
        let clonedTokenId = '';
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const sourceToken = scene.tokens.find((entry) => String(entry && entry.id || '').trim() === targetId);
            if (!sourceToken) return;
            const clonedToken = cloneTokenRecord(sourceToken);
            if (!clonedToken) return;
            if (GUILDLESS_LABEL_PATTERN.test(String(sourceToken.label || '').trim())) {
                clonedToken.label = buildGuildlessTokenLabel(scene);
            }
            scene.tokens.push(clonedToken);
            clonedTokenId = clonedToken.id;
            selectedTokenId = clonedToken.id;
            selectedEntryId = '';
            selectedEvidenceNoteId = '';
            if (tokenInspectorState && tokenInspectorState.kind === 'token' && tokenInspectorState.targetId === targetId) {
                tokenInspectorState = {
                    ...tokenInspectorState,
                    targetId: clonedToken.id,
                    tokenId: clonedToken.id
                };
            }
        });
        return !!clonedTokenId;
    };

    const spawnTokenFromDescriptor = (kind, id = '', worldPoint = null) => {
        const nextToken = buildTokenFromSpawnDescriptor(kind, id);
        if (!nextToken) return false;
        if (kind === 'npc') closeNPCSearch({ clearQuery: true });
        else closeNPCSearch();
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            const token = deepClone(nextToken);
            if (kind === 'guildless') {
                token.label = buildGuildlessTokenLabel(scene);
            }
            if (worldPoint) {
                positionTokenAtWorldPoint(token, scene, worldPoint);
            } else {
                const existingCount = Array.isArray(scene.tokens) ? scene.tokens.length : 0;
                token.x = existingCount * 2;
                token.y = 0;
            }
            scene.tokens.push(token);
            selectedTokenId = token.id;
            selectedEvidenceNoteId = '';
            quickSpawnMenuState = null;
        });
        return true;
    };

    const createEvidenceNoteAtWorldPoint = (worldPoint = null, options = {}) => {
        if (!isDM()) return false;
        const opts = options && typeof options === 'object' ? options : {};
        const safeWorldPoint = worldPoint && Number.isFinite(Number(worldPoint.x)) && Number.isFinite(Number(worldPoint.y))
            ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
            : getContextSpawnWorldPoint();
        if (!safeWorldPoint) return false;
        let createdNoteId = '';
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            if (!Array.isArray(scene.evidenceNotes)) scene.evidenceNotes = [];
            const note = buildEvidenceNoteFromWorldPoints(scene, safeWorldPoint, safeWorldPoint);
            if (!note) return;
            scene.evidenceNotes.push(note);
            createdNoteId = note.id;
            selectedEvidenceNoteId = note.id;
            selectedTokenId = '';
            selectedEntryId = '';
            quickSpawnMenuState = null;
        });
        if (!createdNoteId) return false;
        if (opts.openPopover !== false) {
            openEvidenceNoteInspectorPopover(createdNoteId, opts.clientX, opts.clientY);
            render();
        }
        return true;
    };

    const spawnAllPlayersAtWorldPoint = (worldPoint = null) => {
        const players = getPlayers().filter(Boolean);
        if (!players.length) return false;
        closeNPCSearch();
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            if (!Array.isArray(scene.tokens)) scene.tokens = [];
            const safeWorldPoint = worldPoint && typeof worldPoint === 'object'
                ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
                : null;
            const cellPx = Math.max(1, toNumber(scene && scene.grid && scene.grid.cellPx, DEFAULT_VTT_CELL_PX));
            const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(players.length))));
            const columnCenter = (columns - 1) / 2;
            let firstTokenId = '';

            players.forEach((player, idx) => {
                const token = buildTokenFromPlayer(player);
                if (!token) return;
                if (safeWorldPoint) {
                    const col = idx % columns;
                    const row = Math.floor(idx / columns);
                    positionTokenAtWorldPoint(token, scene, {
                        x: safeWorldPoint.x + (col - columnCenter) * cellPx * 2,
                        y: safeWorldPoint.y + row * cellPx * 2
                    });
                } else {
                    const existingCount = Array.isArray(scene.tokens) ? scene.tokens.length : 0;
                    token.x = existingCount * 2;
                    token.y = 0;
                }
                scene.tokens.push(token);
                if (!firstTokenId) firstTokenId = token.id;
            });

            selectedTokenId = firstTokenId;
            selectedEntryId = '';
            selectedEvidenceNoteId = '';
            quickSpawnMenuState = null;
        });
        return true;
    };

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
        stealthRoll: getTokenStealthRoll(token),
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
        stealthRoll: getTokenStealthRoll(token),
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

    const findSceneForTokenId = (state, tokenId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        const targetId = String(tokenId || '').trim();
        if (!targetId) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            if (scene.tokens.some((token) => String(token && token.id || '').trim() === targetId)) {
                return scene;
            }
        }
        return null;
    };

    const hasAnyDefenceValues = (defences) => DEFENCE_KEYS.some((key) => hasValue(defences && defences[key]));

    const getAssignedTokenForEntry = (entry, state = vttState) => {
        if (!entry) return null;
        const linkedToken = findTokenByIdAcrossScenes(state, entry.linkedTokenId);
        if (linkedToken) return linkedToken;
        if (entry.sourceType && entry.sourceId) {
            return findTokenAcrossScenes(state, entry.sourceType, entry.sourceId);
        }
        return null;
    };

    const buildTokenAssignmentLabel = (token, scene, state = vttState) => {
        if (!token) return 'Unlinked';
        const cleanScene = scene || findSceneForTokenId(state, token.id);
        const sceneName = cleanScene && cleanScene.name ? cleanScene.name : 'Scene';
        const roleBits = [];
        const activeScene = getActiveScene(state);
        const sharedSceneId = getSharedSceneId(state);
        if (activeScene && cleanScene && cleanScene.id === activeScene.id) roleBits.push('current');
        if (cleanScene && cleanScene.id === sharedSceneId) roleBits.push('players');
        const meta = roleBits.length ? ` (${roleBits.join(', ')})` : '';
        return `${String(token.label || 'Token').trim() || 'Token'} - ${sceneName}${meta}`;
    };

    const getInitiativeTokenAssignmentOptions = (state = vttState) => {
        if (!state || !Array.isArray(state.scenes)) return [];
        const activeScene = getActiveScene(state);
        const sharedSceneId = getSharedSceneId(state);
        const options = [];
        state.scenes.forEach((scene, sceneIdx) => {
            if (!scene || !Array.isArray(scene.tokens)) return;
            scene.tokens.forEach((token, tokenIdx) => {
                if (!token || !token.id) return;
                const sceneName = String(scene.name || 'Scene').trim() || 'Scene';
                const tokenName = String(token.label || 'Token').trim() || 'Token';
                const tags = [];
                if (activeScene && scene.id === activeScene.id) tags.push('current');
                if (scene.id === sharedSceneId) tags.push('players');
                if (token.sourceType) tags.push(String(token.sourceType).trim());
                options.push({
                    tokenId: String(token.id),
                    label: `${tokenName} - ${sceneName}${tags.length ? ` (${tags.join(', ')})` : ''}`,
                    sortScene: scene.id === (activeScene && activeScene.id) ? -1 : sceneIdx,
                    sortToken: tokenIdx,
                    sortLabel: tokenName.toLowerCase()
                });
            });
        });
        return options.sort((left, right) =>
            (left.sortScene - right.sortScene)
            || left.sortLabel.localeCompare(right.sortLabel)
            || (left.sortToken - right.sortToken)
        );
    };

    const persistSheetIdentityForLinkedPlayer = (entry, token) => {
        if (!entry || !token) return false;
        if (String(entry.sourceType || '').trim() !== 'sheet') return false;
        const sheetKey = String(entry.sourceId || '').trim();
        if (!sheetKey) return false;
        const rosterPlayer = getRosterPlayerForRecord(token);
        const store = getStore();
        if (!rosterPlayer || !store || typeof store.getPlayers !== 'function' || typeof store.save !== 'function') return false;
        const players = Array.isArray(store.getPlayers()) ? store.getPlayers() : [];
        const target = players.find((player) => String(player && player.id || '').trim() === String(rosterPlayer.id || '').trim());
        if (!target) return false;
        if (String(target.sheetKey || '').trim() === sheetKey) return false;
        target.sheetKey = sheetKey;
        store.save({ scope: `campaign.players.${target.id}` });
        return true;
    };

    const persistRosterPlayerImageUrl = (token, rawValue) => {
        if (!token) return null;
        const rosterPlayer = getRosterPlayerForRecord(token);
        const store = getStore();
        if (!rosterPlayer || !store || typeof store.getPlayers !== 'function' || typeof store.save !== 'function') return null;

        if (typeof store.updatePlayer === 'function') {
            return store.updatePlayer(String(rosterPlayer.id || '').trim(), { imageUrl: rawValue });
        }

        const players = Array.isArray(store.getPlayers()) ? store.getPlayers() : [];
        const target = players.find((player) => String(player && player.id || '').trim() === String(rosterPlayer.id || '').trim());
        if (!target) return null;
        target.imageUrl = toSharedTokenImageUrl(rawValue);
        store.save({ scope: `campaign.players.${target.id}` });
        return { ...target };
    };

    const linkInitiativeEntryToToken = (entry, token) => {
        if (!entry || !token) return entry;
        const next = {
            ...entry,
            linkedTokenId: token.id,
            side: token.side || entry.side || 'neutral',
            imageUrl: token.imageUrl || entry.imageUrl || '',
            sourceType: token.sourceType || entry.sourceType || '',
            sourceId: token.sourceId || entry.sourceId || '',
            hidden: !!token.hidden
        };
        const rosterPlayer = getRosterPlayerForRecord(token);
        const tokenStealthRoll = getTokenStealthRoll(token);
        const tokenDefences = normalizeDefences(token.defences);
        const entryStealthRoll = getEntryStealthRoll(next);

        if (rosterPlayer) {
            syncTokenRosterIdentity(token, rosterPlayer);
            syncEntryRosterIdentity(next, rosterPlayer);
        } else if (!hasValue(next.name)) {
            next.name = String(token.label || 'Combatant').trim() || 'Combatant';
        }

        if (!hasValue(next.hpCurrent) && hasValue(token.hpCurrent)) next.hpCurrent = token.hpCurrent;
        if (!hasValue(next.hpMax) && hasValue(token.hpMax)) next.hpMax = token.hpMax;
        if (!hasValue(next.ac) && hasValue(token.ac)) next.ac = token.ac;
        if (!hasValue(next.passivePerception) && hasValue(token.passivePerception)) next.passivePerception = token.passivePerception;
        if (entryStealthRoll === null && tokenStealthRoll !== null) next.stealthRoll = tokenStealthRoll;
        if (!hasAnyDefenceValues(next.defences) && hasAnyDefenceValues(tokenDefences)) next.defences = tokenDefences;
        if ((!Array.isArray(next.conditions) || !next.conditions.length) && Array.isArray(token.conditions) && token.conditions.length) {
            next.conditions = token.conditions.slice(0, 24);
        }

        if (!rosterPlayer && hasValue(next.name)) {
            token.label = String(next.name || token.label || 'Token').trim() || 'Token';
        }
        if (hasValue(next.hpCurrent)) token.hpCurrent = next.hpCurrent;
        if (hasValue(next.hpMax)) token.hpMax = next.hpMax;
        if (hasValue(next.ac)) token.ac = next.ac;
        if (hasValue(next.passivePerception)) token.passivePerception = next.passivePerception;
        if (getEntryStealthRoll(next) !== null) token.stealthRoll = getEntryStealthRoll(next);
        if (hasAnyDefenceValues(next.defences)) token.defences = normalizeDefences(next.defences);
        if (Array.isArray(next.conditions) && next.conditions.length) token.conditions = next.conditions.slice(0, 24);

        return next;
    };

    const getTokenWorldRect = (token, scene) => {
        if (!token || !scene || !scene.grid) return null;
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene.grid.offsetX, 0);
        const offsetY = toNumber(scene.grid.offsetY, 0);
        const left = offsetX + normalizeTokenCoordinate(token.x, 0) * cellPx;
        const top = offsetY + normalizeTokenCoordinate(token.y, 0) * cellPx;
        const width = Math.max(1, toNumber(token.w, 1) * cellPx);
        const height = Math.max(1, toNumber(token.h, 1) * cellPx);
        return {
            left,
            top,
            right: left + width,
            bottom: top + height
        };
    };

    const doWorldRectsOverlap = (leftRect, rightRect) => {
        if (!leftRect || !rightRect) return false;
        return leftRect.left < rightRect.right
            && leftRect.right > rightRect.left
            && leftRect.top < rightRect.bottom
            && leftRect.bottom > rightRect.top;
    };

    const isTokenUnderFog = (scene, token) => {
        if (!scene || !token || !Array.isArray(scene.fog) || !scene.fog.length) return false;
        const tokenRect = getTokenWorldRect(token, scene);
        if (!tokenRect) return false;
        return scene.fog.some((mask) => doWorldRectsOverlap(tokenRect, {
            left: toNumber(mask && mask.x, 0),
            top: toNumber(mask && mask.y, 0),
            right: toNumber(mask && mask.x, 0) + Math.max(1, toNumber(mask && mask.w, 1)),
            bottom: toNumber(mask && mask.y, 0) + Math.max(1, toNumber(mask && mask.h, 1))
        }));
    };

    const isTokenHiddenForRole = (token, scene, role = localRole) => {
        if (role === 'dm') return false;
        return !!(token && (token.hidden || isTokenUnderFog(scene, token)));
    };

    const getSceneTokenForEntry = (scene, entry) => {
        if (!scene || !Array.isArray(scene.tokens) || !entry) return null;
        const linkedId = String(entry.linkedTokenId || '').trim();
        if (linkedId) {
            const linkedToken = scene.tokens.find((token) => token.id === linkedId);
            if (linkedToken) return linkedToken;
        }
        const sourceType = String(entry.sourceType || '').trim();
        const sourceId = String(entry.sourceId || '').trim();
        if (!sourceType || !sourceId) return null;
        return scene.tokens.find((token) =>
            String(token && token.sourceType || '') === sourceType
            && String(token && token.sourceId || '') === sourceId
        ) || null;
    };

    const isEntryHiddenForRole = (entry, state = vttState, role = localRole) => {
        if (!entry) return true;
        if (role === 'dm') return false;
        if (entry.hidden) return true;
        const scene = getActiveScene(state);
        const linkedToken = getSceneTokenForEntry(scene, entry);
        return !!(linkedToken && isTokenHiddenForRole(linkedToken, scene, role));
    };

    const getVisibleTokensForRole = (scene, role = localRole) => {
        if (!scene || !Array.isArray(scene.tokens)) return [];
        if (role === 'dm') return scene.tokens;
        return scene.tokens.filter((token) => !isTokenHiddenForRole(token, scene, role));
    };

    const getVisibleInitiativeEntriesForRole = (state = vttState, role = localRole) => {
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        if (role === 'dm') return entries;
        return entries.filter((entry) => !isEntryHiddenForRole(entry, state, role));
    };

    const getVisibleSceneTokenForEntry = (entry, state = vttState, role = localRole) => {
        if (!entry) return null;
        const scene = getActiveScene(state);
        const linkedToken = getSceneTokenForEntry(scene, entry);
        if (!linkedToken) return null;
        if (role !== 'dm' && isTokenHiddenForRole(linkedToken, scene, role)) return null;
        return linkedToken;
    };

    const syncTokenSelectionFromEntry = (entryId, state = vttState, role = localRole) => {
        const entry = getEntryById(entryId, state);
        const token = getVisibleSceneTokenForEntry(entry, state, role);
        selectedTokenId = token ? token.id : '';
        if (token) selectedEvidenceNoteId = '';
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

    function sortInitiativeEntries(entries) {
        entries.sort((left, right) =>
            (right.total - left.total)
            || (right.tie - left.tie)
            || String(left.name || '').localeCompare(String(right.name || ''))
        );
    }

    const readSharedVTTSnapshot = (options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const shouldSyncRosterPresentation = opts.syncRosterPresentation !== false;
        const useStoreOnly = !!opts.useStoreOnly;
        const store = getStore();
        if (!store) return null;
        if (!useStoreOnly && isVTTCollabReady() && typeof vttCollabSession.getSnapshot === 'function') {
            try {
                const snapshot = deepClone(vttCollabSession.getSnapshot());
                if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
                return snapshot;
            } catch (err) {
                console.warn('VTT collaboration snapshot read failed', err);
            }
        }
        if (!useStoreOnly && vttCollabInitPromise && vttState) {
            const snapshot = deepClone(vttState);
            if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
            return snapshot;
        }
        const snapshot = deepClone(store.getVTTState(getActiveCaseId()));
        if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
        return snapshot;
    };

    const isRelevantVTTStoreScope = (scope, caseId) => {
        const cleanScope = String(scope || '').trim();
        const cleanCaseId = String(caseId || '').trim();
        if (!cleanScope || !cleanCaseId) return false;
        return cleanScope === `cases.${cleanCaseId}.vtt`
            || cleanScope.startsWith(`cases.${cleanCaseId}.vtt.`);
    };

    const shouldBridgeStoreUpdateToVTTCollab = (detail, caseId) => {
        const meta = detail && typeof detail === 'object' ? detail : {};
        const source = String(meta.source || '').trim().toLowerCase();
        if (source === 'vtt-collab' || source === 'board-collab') return false;
        const scopes = Array.isArray(meta.scopes) ? meta.scopes : [];
        const isLocalSource = source === 'local' || !source;
        if (scopes.length) {
            return isLocalSource && scopes.some((scope) => isRelevantVTTStoreScope(scope, caseId));
        }
        return isLocalSource;
    };

    const ensureRosterLinkedPlayerPresentationPersisted = (snapshot, options = {}) => {
        if (!snapshot) return { snapshot, mutated: false };
        const opts = options && typeof options === 'object' ? options : {};
        const baseSnapshot = opts.persist === false ? null : deepClone(snapshot);
        const mutated = syncRosterLinkedPlayerPresentation(snapshot);
        if (!mutated) return { snapshot, mutated: false };
        if (opts.persist === false) return { snapshot, mutated: true };
        const saved = persistSharedVTTSnapshot(snapshot, {
            ...opts,
            baseSnapshot,
            reason: opts.reason || 'roster-player-presentation-sync'
        });
        return {
            snapshot: deepClone(saved || snapshot),
            mutated: true
        };
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
        const baseSnapshot = deepClone(draft);
        mutator(draft);
        const saved = persistSharedVTTSnapshot(draft, {
            ...options,
            baseSnapshot
        });
        vttState = deepClone(saved || draft);
        syncRosterLinkedPlayerPresentation(vttState);
        normalizeSelections();
        if (options.fitView) fitViewOnNextMapLoad = true;
        render();
    };

    const normalizeSelections = () => {
        const scene = getActiveScene();
        const tokens = getVisibleTokensForRole(scene);
        const visibleEvidenceNotes = getVisibleEvidenceNotesForRole(scene);
        const visibleEntries = getVisibleInitiativeEntriesForRole(vttState, localRole);
        if (!visibleEntries.some((entry) => entry.id === selectedEntryId)) {
            const activeEntryId = vttState && vttState.initiative ? String(vttState.initiative.activeEntryId || '').trim() : '';
            selectedEntryId = visibleEntries.some((entry) => entry.id === activeEntryId)
                ? activeEntryId
                : (visibleEntries[0] ? visibleEntries[0].id : '');
        }
        if (!tokens.some((token) => token.id === selectedTokenId)) {
            selectedTokenId = '';
        }
        if (!visibleEvidenceNotes.some((note) => note.id === selectedEvidenceNoteId)) {
            selectedEvidenceNoteId = '';
        }
        if (!tokens.some((token) => token.id === previewTokenId && token.imageUrl)) {
            previewTokenId = '';
        }
        if (!isDM()) {
            tokenInspectorState = null;
        } else if (tokenInspectorState) {
            const popoverTargetId = String(tokenInspectorState.targetId || tokenInspectorState.tokenId || '').trim();
            if (!popoverTargetId) {
                tokenInspectorState = null;
            } else if (tokenInspectorState.kind === 'note') {
                if (!visibleEvidenceNotes.some((note) => note.id === popoverTargetId)) tokenInspectorState = null;
            } else if (!tokens.some((token) => token.id === popoverTargetId)) {
                tokenInspectorState = null;
            }
        }
        selectedTemplateId = '';
        if (templatePlacementState && (!scene || templatePlacementState.sceneId !== scene.id)) {
            templatePlacementState = null;
        }
        templateRotateState = null;
        if (visionConeRotateState && (!scene || visionConeRotateState.sceneId !== scene.id || !tokens.some((token) => token.id === visionConeRotateState.tokenId))) {
            visionConeRotateState = null;
        }
        if (rulerState && (!scene || rulerState.sceneId !== scene.id)) {
            rulerState = null;
        }
        if (evidenceNotePlacementState && (!scene || evidenceNotePlacementState.sceneId !== scene.id)) {
            evidenceNotePlacementState = null;
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
        if (Array.isArray(scene.evidenceNotes) && scene.evidenceNotes.length) {
            scene.evidenceNotes.forEach((note) => {
                width = Math.max(width, toNumber(note && note.x, 0) + Math.max(1, toNumber(note && note.w, grid.cellPx)) + grid.cellPx * 2);
                height = Math.max(height, toNumber(note && note.y, 0) + Math.max(1, toNumber(note && note.h, grid.cellPx)) + grid.cellPx * 2);
            });
        }
        return {
            width: Math.max(1, Math.round(width)),
            height: Math.max(1, Math.round(height))
        };
    };

    const scaleForZoom = (value) => Math.max(0, Math.round(value * localView.zoom * 1000) / 1000);

    const applyRenderedWorldGeometry = (scene = getActiveScene()) => {
        if (!scene || !mapWorldEl || !worldEl || !mapImageEl || !fogLayerEl || !noteLayerEl || !templateLayerEl || !tokenLayerEl || !visionLayerEl) return;
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

        noteLayerEl.querySelectorAll('.vtt-map-note').forEach((noteEl) => {
            if (!(noteEl instanceof HTMLElement)) return;
            noteEl.style.left = `${scaleForZoom(toNumber(noteEl.dataset.worldLeft, 0))}px`;
            noteEl.style.top = `${scaleForZoom(toNumber(noteEl.dataset.worldTop, 0))}px`;
            noteEl.style.width = `${scaleForZoom(toNumber(noteEl.dataset.worldWidth, 0))}px`;
            noteEl.style.height = `${scaleForZoom(toNumber(noteEl.dataset.worldHeight, 0))}px`;
            applyEvidenceNoteChipPresentation(noteEl);
        });

        templateLayerEl.querySelectorAll('.vtt-overlay-item').forEach((itemEl) => {
            if (!(itemEl instanceof HTMLElement)) return;
            itemEl.style.left = `${scaleForZoom(toNumber(itemEl.dataset.worldLeft, 0))}px`;
            itemEl.style.top = `${scaleForZoom(toNumber(itemEl.dataset.worldTop, 0))}px`;
            itemEl.style.width = `${scaleForZoom(toNumber(itemEl.dataset.worldWidth, 0))}px`;
            itemEl.style.height = `${scaleForZoom(toNumber(itemEl.dataset.worldHeight, 0))}px`;
            if (itemEl.dataset.worldRotation !== undefined) {
                itemEl.style.transform = `rotate(${toNumber(itemEl.dataset.worldRotation, 0)}deg)`;
            }
        });

        visionLayerEl.querySelectorAll('.vtt-overlay-item').forEach((itemEl) => {
            if (!(itemEl instanceof HTMLElement)) return;
            itemEl.style.left = `${scaleForZoom(toNumber(itemEl.dataset.worldLeft, 0))}px`;
            itemEl.style.top = `${scaleForZoom(toNumber(itemEl.dataset.worldTop, 0))}px`;
            itemEl.style.width = `${scaleForZoom(toNumber(itemEl.dataset.worldWidth, 0))}px`;
            itemEl.style.height = `${scaleForZoom(toNumber(itemEl.dataset.worldHeight, 0))}px`;
            if (itemEl.dataset.worldRotation !== undefined) {
                itemEl.style.transform = `rotate(${toNumber(itemEl.dataset.worldRotation, 0)}deg)`;
            }
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

    const isClientPointInsideStage = (clientX, clientY) => {
        if (!stageEl) return false;
        const rect = stageEl.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    };

    const closeQuickSpawnMenu = () => {
        if (!quickSpawnMenuState) return false;
        quickSpawnMenuState = null;
        renderQuickSpawnMenu();
        return true;
    };

    const getContextSpawnWorldPoint = () => {
        if (quickSpawnMenuState && quickSpawnMenuState.worldPoint) return quickSpawnMenuState.worldPoint;
        if (npcSearchState && npcSearchState.worldPoint) return npcSearchState.worldPoint;
        return null;
    };

    const closeViewMenu = () => {
        if (!viewMenuOpen) return false;
        viewMenuOpen = false;
        renderViewMenu();
        return true;
    };

    const closeNavMenu = () => {
        if (!navMenuOpen) return false;
        navMenuOpen = false;
        renderNavMenu();
        return true;
    };

    const openNPCSearchAt = (clientX, clientY, worldPoint = null) => {
        if (!isDM()) return false;
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        npcSearchOpen = true;
        npcSearchState = {
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2)),
            worldPoint: worldPoint && Number.isFinite(Number(worldPoint.x)) && Number.isFinite(Number(worldPoint.y))
                ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
                : null
        };
        renderNPCSearchPopover();
        if (npcSearchInputEl) {
            window.requestAnimationFrame(() => {
                npcSearchInputEl.focus();
                npcSearchInputEl.select();
            });
        }
        return true;
    };

    const closeTokenInspectorPopover = () => {
        if (!tokenInspectorState && (!tokenInspectorPopoverEl || tokenInspectorPopoverEl.hidden)) return false;
        tokenInspectorState = null;
        if (tokenInspectorPopoverEl) tokenInspectorPopoverEl.hidden = true;
        return true;
    };

    const openTokenInspectorPopover = (tokenId, clientX, clientY) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId || !isDM()) return false;
        closeQuickSpawnMenu();
        closeNPCSearch();
        closeInitiativeDetail();
        tokenInspectorState = {
            kind: 'token',
            targetId,
            tokenId: targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        return true;
    };

    const openEvidenceNoteInspectorPopover = (noteId, clientX, clientY) => {
        const targetId = String(noteId || '').trim();
        if (!targetId || !isDM()) return false;
        closeQuickSpawnMenu();
        closeNPCSearch();
        closeInitiativeDetail();
        tokenInspectorState = {
            kind: 'note',
            targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        return true;
    };

    const openQuickSpawnMenu = (clientX, clientY) => {
        if (!stageEl || !isDM()) return false;
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        const rect = stageEl.getBoundingClientRect();
        quickSpawnMenuState = {
            worldPoint: screenToWorld(clientX, clientY),
            clientX: Math.round(clientX),
            clientY: Math.round(clientY),
            stageX: Math.round(clientX - rect.left),
            stageY: Math.round(clientY - rect.top)
        };
        renderQuickSpawnMenu();
        return true;
    };

    const clearSpawnDrag = () => {
        if (!spawnDragState) return false;
        spawnDragState = null;
        renderSpawnGhost();
        return true;
    };

    const beginSpawnDrag = (event, kind, id = '') => {
        if (!event || !isDM()) return false;
        const source = findSpawnSource(kind, id);
        if (!source && kind !== 'custom') return false;
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        spawnDragState = {
            pointerId: event.pointerId,
            kind,
            id: String(id || '').trim(),
            label: getSpawnDescriptorLabel(kind, id),
            clientX: event.clientX,
            clientY: event.clientY,
            overStage: isClientPointInsideStage(event.clientX, event.clientY)
        };
        previewTokenId = '';
        renderSpawnGhost();
        return true;
    };

    const loadRolePreference = () => {
        const store = getStore();
        if (store && typeof store.getVTTLocalRole === 'function') {
            localRole = store.getVTTLocalRole(getActiveCaseId()) === 'dm' ? 'dm' : 'player';
        } else {
            localRole = 'player';
        }
        if (body) body.dataset.vttRole = localRole;
    };

    const setRolePreference = (role) => {
        localRole = role === 'player' ? 'player' : 'dm';
        const store = getStore();
        if (store && typeof store.setVTTLocalRole === 'function') {
            localRole = store.setVTTLocalRole(localRole, getActiveCaseId()) === 'dm' ? 'dm' : 'player';
        }
        if (localRole !== 'dm') {
            if (localToolState.mode === TOOL_MODE_FOG || localToolState.mode === TOOL_MODE_FOG_REMOVE || localToolState.mode === TOOL_MODE_NOTE) {
                localToolState.mode = TOOL_MODE_NAVIGATE;
            }
            closeNPCSearch();
            quickSpawnMenuState = null;
            closeTokenInspectorPopover();
            clearSpawnDrag();
            closeInitiativeDetail();
        }
        clearPendingTouchContext();
        closeViewMenu();
        closeToolsMenu();
        clearTemplatePlacementState();
        if (body) body.dataset.vttRole = localRole;
        render();
    };

    const isDMUnlockModalOpen = () => !!(dmUnlockModalEl && !dmUnlockModalEl.hidden);

    const closeDMUnlockModal = ({ restoreFocus = true } = {}) => {
        if (!dmUnlockModalEl) return false;
        if (dmUnlockInputEl) dmUnlockInputEl.value = '';
        if (dmUnlockErrorEl) {
            dmUnlockErrorEl.hidden = true;
            dmUnlockErrorEl.textContent = 'That password was not accepted.';
        }
        if (dmUnlockModalEl.hidden) return false;
        dmUnlockModalEl.hidden = true;
        if (restoreFocus && dmUnlockReturnFocusEl && typeof dmUnlockReturnFocusEl.focus === 'function') {
            dmUnlockReturnFocusEl.focus();
        }
        dmUnlockReturnFocusEl = null;
        return true;
    };

    const openDMUnlockModal = () => {
        if (!dmUnlockModalEl || !dmUnlockInputEl) return false;
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        clearSpawnDrag();
        clearTemplatePlacementState();
        dmUnlockReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : roleToggleEl;
        dmUnlockModalEl.hidden = false;
        if (dmUnlockErrorEl) {
            dmUnlockErrorEl.hidden = true;
            dmUnlockErrorEl.textContent = 'That password was not accepted.';
        }
        dmUnlockInputEl.value = '';
        window.requestAnimationFrame(() => {
            dmUnlockInputEl.focus();
            dmUnlockInputEl.select();
        });
        return true;
    };

    const submitDMUnlockModal = () => {
        if (!dmUnlockInputEl) return false;
        if (String(dmUnlockInputEl.value || '').trim() !== DM_UNLOCK_PHRASE) {
            if (dmUnlockErrorEl) {
                dmUnlockErrorEl.textContent = 'That password was not accepted.';
                dmUnlockErrorEl.hidden = false;
            }
            dmUnlockInputEl.focus();
            dmUnlockInputEl.select();
            return false;
        }
        closeDMUnlockModal({ restoreFocus: false });
        setRolePreference('dm');
        return true;
    };

    const promptForDMMode = () => {
        return openDMUnlockModal();
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

    const clearVTTCollabDropoutTimer = () => {
        if (!vttCollabDropoutTimer) return;
        clearTimeout(vttCollabDropoutTimer);
        vttCollabDropoutTimer = 0;
    };

    const scheduleVTTCollabDropoutRefresh = (delayMs) => {
        if (vttCollabDropoutTimer || !Number.isFinite(delayMs) || delayMs <= 0) return;
        vttCollabDropoutTimer = window.setTimeout(() => {
            vttCollabDropoutTimer = 0;
            if (vttCollabPendingStatus) {
                setVTTCollabStatus(vttCollabPendingStatus);
            }
        }, delayMs);
    };

    const updateStoreSyncChip = (status) => {
        const hasActiveCollabSession = !!(vttCollabSession
            && (typeof vttCollabSession.isActive !== 'function' || vttCollabSession.isActive()));
        if (hasActiveCollabSession || vttCollabInitPromise) return;
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
        vttCollabPendingStatus = source;
        const state = source.state === 'live'
            ? 'live'
            : (source.state === 'connecting'
                ? 'connecting'
                : (source.state === 'degraded' ? 'degraded' : 'local'));
        const peerCount = Number.isFinite(source.peerCount) ? Math.max(0, source.peerCount) : 0;
        const detail = String(source.detail || '').trim();
        let label = 'Local';
        if (state === 'live') {
            label = peerCount > 0 ? `Live · ${peerCount}` : 'Live';
            lastStableLiveSyncChipLabel = label;
            vttCollabDropoutStartedAt = 0;
            clearVTTCollabDropoutTimer();
        } else if (state === 'connecting') {
            label = 'Live...';
        } else if (state === 'degraded') {
            label = 'Live Off';
        }

        if (state === 'local') {
            vttCollabDropoutStartedAt = 0;
            lastStableLiveSyncChipLabel = '';
            clearVTTCollabDropoutTimer();
        } else if (state !== 'live' && lastStableLiveSyncChipLabel) {
            const now = Date.now();
            if (!vttCollabDropoutStartedAt) {
                vttCollabDropoutStartedAt = now;
            }
            const elapsedMs = Math.max(0, now - vttCollabDropoutStartedAt);
            const remainingMs = LIVE_STATUS_DROPOUT_GRACE_MS - elapsedMs;
            if (remainingMs > 0) {
                scheduleVTTCollabDropoutRefresh(remainingMs);
                setSyncChipState({
                    state: 'live',
                    label: lastStableLiveSyncChipLabel,
                    detail: detail || lastStableLiveSyncChipLabel,
                    retryable: false
                });
                return;
            }
            clearVTTCollabDropoutTimer();
            label = 'Live...';
        }
        setSyncChipState({
            state,
            label,
            detail: detail || label,
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
            && config.campaignId
            && String(config.collabRelayUrl || '').trim());
    };

    const applyVTTCollabSnapshot = (payload) => {
        const store = getStore();
        const clean = store && typeof store.normalizeVTTStateSnapshot === 'function'
            ? store.normalizeVTTStateSnapshot(payload)
            : deepClone(payload);
        if (dragState) {
            syncRosterLinkedPlayerPresentation(clean);
            pendingRemoteVTTSnapshot = clean;
            return;
        }
        const synced = ensureRosterLinkedPlayerPresentationPersisted(clean, { reason: 'roster-player-presentation-sync' });
        queueRemoteTweensFromSnapshots(vttState, clean);
        pendingRemoteVTTSnapshot = null;
        vttState = deepClone(synced.snapshot);
        normalizeSelections();
        render();
    };

    const applyPendingRemoteVTTSnapshot = () => {
        if (dragState || !pendingRemoteVTTSnapshot) return false;
        const sessionSnapshot = isVTTCollabReady() && typeof vttCollabSession.getSnapshot === 'function'
            ? vttCollabSession.getSnapshot()
            : null;
        const nextSnapshot = sessionSnapshot ? deepClone(sessionSnapshot) : pendingRemoteVTTSnapshot;
        queueRemoteTweensFromSnapshots(vttState, nextSnapshot);
        const synced = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, { reason: 'roster-player-presentation-sync' });
        vttState = deepClone(synced.snapshot);
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
                syncRosterLinkedPlayerPresentation(pendingRemoteVTTSnapshot);
            }
            return;
        }
        if (meta && meta.snapshot) {
            const store = getStore();
            const nextSnapshot = store && typeof store.normalizeVTTStateSnapshot === 'function'
                ? store.normalizeVTTStateSnapshot(meta.snapshot)
                : meta.snapshot;
            queueRemoteTweensFromSnapshots(vttState, nextSnapshot);
            const synced = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, { reason: 'roster-player-presentation-sync' });
            vttState = deepClone(synced.snapshot);
            normalizeSelections();
            renderStage();
            positionTokenInspectorPopover();
            positionInitiativeDetail();
            return;
        }
        if (!vttState) return;
        const sceneMap = new Map(
            Array.isArray(vttState.scenes)
                ? vttState.scenes.map((scene) => [scene.id, scene])
                : []
        );
        let mutated = false;
        const queuedTweens = [];
        (Array.isArray(changes) ? changes : []).forEach((change) => {
            const scene = sceneMap.get(String(change && change.sceneId || '').trim());
            if (!scene || !Array.isArray(scene.tokens)) return;
            const token = scene.tokens.find((entry) => entry && entry.id === String(change && change.tokenId || '').trim());
            if (!token) return;
            const fromX = normalizeTokenCoordinate(token.x, token.x);
            const fromY = normalizeTokenCoordinate(token.y, token.y);
            const nextX = normalizeTokenCoordinate(change.x, token.x);
            const nextY = normalizeTokenCoordinate(change.y, token.y);
            if (token.x === nextX && token.y === nextY) return;
            token.x = nextX;
            token.y = nextY;
            mutated = true;
            queuedTweens.push({ sceneId: scene.id, tokenId: token.id, fromX, fromY, toX: nextX, toY: nextY });
        });
        if (!mutated) return;
        queuedTweens.forEach((tween) => {
            queueRemoteTokenTween(tween.sceneId, tween.tokenId, tween.fromX, tween.fromY, tween.toX, tween.toY);
        });
        normalizeSelections();
        renderStage();
        positionTokenInspectorPopover();
        positionInitiativeDetail();
    };

    const initVTTCollab = async () => {
        if (vttCollabSession && (typeof vttCollabSession.isActive !== 'function' || vttCollabSession.isActive())) {
            return vttCollabSession;
        }
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

        const initPromise = Promise.resolve(window.RTF_VTT_COLLAB_READY)
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
            })
            .finally(() => {
                if (vttCollabInitPromise === initPromise) {
                    vttCollabInitPromise = null;
                }
            });

        vttCollabInitPromise = initPromise;
        return initPromise;
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
            const nextSnapshot = readSharedVTTSnapshot({ syncRosterPresentation: false }) || deepClone(store.getVTTState(expectedCaseId));
            vttState = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, { reason: 'roster-player-presentation-sync' }).snapshot;
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

    const bindAccentControls = () => {
        if (accentButtonEl && accentButtonEl.dataset.bound !== '1') {
            accentButtonEl.dataset.bound = '1';
            accentButtonEl.addEventListener('click', () => {
                if (typeof window.triggerAccentPicker === 'function') window.triggerAccentPicker();
            });
        }
        if (accentPickerEl && accentPickerEl.dataset.bound !== '1') {
            accentPickerEl.dataset.bound = '1';
            accentPickerEl.addEventListener('change', (event) => {
                const value = event.target && 'value' in event.target ? event.target.value : '';
                if (typeof window.setAccentColor === 'function') window.setAccentColor(value);
            });
        }
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

        const requestedUrl = getUsableMediaUrl(scene.mapImageUrl);
        if (!requestedUrl) {
            mapSize = { width: 0, height: 0 };
            mapLoadState = { url: String(scene.mapImageUrl || ''), loaded: false };
            worldSize = getWorldSizeForScene(scene);
            mapImageEl.removeAttribute('src');
            mapImageEl.style.width = '0px';
            mapImageEl.style.height = '0px';
            mapImageEl.style.display = 'none';
            renderStage();
            return;
        }

        if (mapLoadState.url === requestedUrl && mapLoadState.loaded) return;

        mapSize = { width: 0, height: 0 };
        mapLoadState = { url: requestedUrl, loaded: false };
        mapImageEl.src = requestedUrl;
        mapImageEl.style.display = 'none';
        const probe = new Image();
        probe.onload = () => {
            if (window.RTF_MEDIA_CACHE && typeof window.RTF_MEDIA_CACHE.rememberSuccess === 'function') {
                window.RTF_MEDIA_CACHE.rememberSuccess(requestedUrl);
            }
            if (!vttState) return;
            const active = getActiveScene();
            if (!active || getUsableMediaUrl(active.mapImageUrl) !== requestedUrl) return;
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
            if (window.RTF_MEDIA_CACHE && typeof window.RTF_MEDIA_CACHE.rememberFailure === 'function') {
                window.RTF_MEDIA_CACHE.rememberFailure(requestedUrl);
            }
            const active = getActiveScene();
            if (!active || getUsableMediaUrl(active.mapImageUrl) !== requestedUrl) return;
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
            playerSpawnListEl.innerHTML = [
                `
                    <button class="vtt-token-spawn" type="button" data-spawn-kind="custom">
                        <span class="vtt-token-spawn-name">Custom Token</span>
                        <span class="vtt-token-spawn-meta">Drag onto the stage</span>
                    </button>
                `,
                ...players.map((player) => `
                    <button class="vtt-token-spawn" type="button" data-spawn-kind="player" data-id="${escapeHtml(String(player.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(player.name || 'Player')}</span>
                        <span class="vtt-token-spawn-meta">Drag onto the stage · AC ${escapeHtml(String(player.ac ?? '-'))} · PP ${escapeHtml(String(player.pp ?? '-'))}</span>
                    </button>
                `),
                players.length ? '' : '<div class="vtt-empty">No players in the shared store yet.</div>'
            ].join('');
        }
    };

    const renderNPCSearchPopover = () => {
        if (!npcSearchPopoverEl || !npcSearchListEl) return;
        const isOpen = npcSearchOpen && isDM();
        if (npcSearchToggleEl) npcSearchToggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
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
                    <button class="vtt-token-spawn" type="button" data-action="spawn-npc" data-id="${escapeHtml(String(npc.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(npc.name || 'NPC')}</span>
                        <span class="vtt-token-spawn-meta">${escapeHtml(npcSearchState && npcSearchState.worldPoint ? 'Spawn here' : 'Spawn token')}${npc.guild ? ` · ${escapeHtml(npc.guild)}` : ''}</span>
                    </button>
                `).join('')
                : `<div class="vtt-empty">${query ? 'No NPCs match that search.' : 'No NPCs in the shared store yet.'}</div>`;
        positionNPCSearchPopover();
    };

    const renderQuickSpawnMenu = () => {
        if (!quickSpawnMenuEl) return;
        if (!quickSpawnMenuState || !isDM() || !stageEl) {
            quickSpawnMenuEl.hidden = true;
            quickSpawnMenuEl.innerHTML = '';
            return;
        }

        const players = getPlayers();
        const playerCount = players.length;
        quickSpawnMenuEl.hidden = false;
        quickSpawnMenuEl.innerHTML = `
            <div class="vtt-quick-spawn-title">Quick Spawn</div>
            <div class="vtt-quick-spawn-list">
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-all-players"${playerCount ? '' : ' disabled'}>
                    <span class="vtt-token-spawn-name">Spawn All Players</span>
                    <span class="vtt-token-spawn-meta">${playerCount ? `Spawn ${playerCount} rostered player${playerCount === 1 ? '' : 's'} here` : 'No rostered players yet'}</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-custom">
                    <span class="vtt-token-spawn-name">Custom Token</span>
                    <span class="vtt-token-spawn-meta">Spawn here</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-evidence-note">
                    <span class="vtt-token-spawn-name">Zone Indicator</span>
                    <span class="vtt-token-spawn-meta">Create a 1x1 zone here and open it</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-open-npc-search">
                    <span class="vtt-token-spawn-name">NPC Search Here</span>
                    <span class="vtt-token-spawn-meta">Search the roster and spawn at this spot</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-guildless">
                    <span class="vtt-token-spawn-name">Spawn Guildless</span>
                    <span class="vtt-token-spawn-meta">Spawn here</span>
                </button>
            </div>
        `;

        const stageRect = stageEl.getBoundingClientRect();
        const menuWidth = quickSpawnMenuEl.offsetWidth || 280;
        const menuHeight = quickSpawnMenuEl.offsetHeight || 0;
        const left = clamp(quickSpawnMenuState.stageX, 12, Math.max(12, stageRect.width - menuWidth - 12));
        const top = clamp(quickSpawnMenuState.stageY, 12, Math.max(12, stageRect.height - menuHeight - 12));
        quickSpawnMenuEl.style.left = `${left}px`;
        quickSpawnMenuEl.style.top = `${top}px`;
    };

    const renderSpawnGhost = () => {
        if (!spawnGhostEl) return;
        if (!spawnDragState || !isDM()) {
            spawnGhostEl.hidden = true;
            spawnGhostEl.innerHTML = '';
            if (body) body.dataset.spawnDragging = '0';
            return;
        }
        spawnGhostEl.hidden = false;
        spawnGhostEl.dataset.overStage = spawnDragState.overStage ? 'true' : 'false';
        spawnGhostEl.style.left = `${Math.round(spawnDragState.clientX + 18)}px`;
        spawnGhostEl.style.top = `${Math.round(spawnDragState.clientY + 18)}px`;
        spawnGhostEl.innerHTML = `
            <div class="vtt-spawn-ghost-name">${escapeHtml(spawnDragState.label || 'Token')}</div>
            <div class="vtt-spawn-ghost-meta">${spawnDragState.overStage ? 'Release to spawn' : 'Drag onto the stage'}</div>
        `;
        if (body) body.dataset.spawnDragging = '1';
    };

    const describeScene = (scene) => {
        const tokenCount = scene && Array.isArray(scene.tokens) ? scene.tokens.length : 0;
        const evidenceNoteCount = scene && Array.isArray(scene.evidenceNotes) ? scene.evidenceNotes.length : 0;
        return `${scene && scene.mapImageUrl ? 'Map linked' : 'No map'} - ${tokenCount} token${tokenCount === 1 ? '' : 's'} - ${evidenceNoteCount} zone${evidenceNoteCount === 1 ? '' : 's'}`;
    };

    const renderSceneList = () => {
        if (!sceneListEl) return;
        const scenes = vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [];
        const sharedSceneId = getSharedSceneId(vttState);
        const viewedSceneId = getViewedSceneId(vttState, localRole);
        const sharedScene = getSceneById(sharedSceneId, vttState);
        const viewedScene = getSceneById(viewedSceneId, vttState) || scenes[0] || null;
        const routeNote = `DM scene selection is authoritative. Players follow ${sharedScene && sharedScene.name ? sharedScene.name : 'the shared scene'} immediately.`;
        sceneListEl.innerHTML = scenes.length
            ? `
                <div class="vtt-scene-manager">
                    <div class="vtt-scene-select-grid">
                        <label class="vtt-field vtt-field-tight vtt-scene-select-field">
                            <span>Scene</span>
                            <select data-scene-picker="shared">
                                ${scenes.map((scene) => `
                                    <option value="${escapeHtml(scene.id)}"${scene.id === sharedSceneId ? ' selected' : ''}>${escapeHtml(scene.name || 'Scene')}</option>
                                `).join('')}
                            </select>
                        </label>
                    </div>
                    <div class="vtt-scene-summary-card">
                        <div class="vtt-scene-summary-top">
                            <div class="vtt-scene-summary-copy">
                                <span class="vtt-scene-summary-eyebrow">Current Scene</span>
                                <strong class="vtt-scene-summary-title">${escapeHtml(sharedScene && sharedScene.name ? sharedScene.name : (viewedScene && viewedScene.name ? viewedScene.name : 'Scene'))}</strong>
                                <span class="vtt-scene-summary-meta">${escapeHtml(describeScene(viewedScene))}</span>
                            </div>
                            <div class="vtt-scene-tag-row">
                                <span class="vtt-scene-tag">Shared</span>
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

    const buildDMTokenInspectorContent = (token) => {
        const rosterPlayer = getRosterPlayerForRecord(token);
        const isRosterManagedPlayer = !!rosterPlayer;
        const imageUrlValue = isRosterManagedPlayer
            ? String(rosterPlayer.imageUrl || token.imageUrl || '').trim()
            : String(token.imageUrl || '').trim();
        const supportsSightCone = !!(token && (token.side === 'enemy' || token.side === 'neutral'));
        return `
            <div class="vtt-inspector-stack">
                <label class="vtt-field">
                    <span>Label</span>
                    <input class="vtt-inspector-input" type="text" ${isRosterManagedPlayer ? 'readonly' : 'data-token-field="label"'} value="${escapeHtml(token.label)}">
                </label>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Side</span>
                        <select class="vtt-inspector-select" data-token-field="side">
                            ${SIDE_OPTIONS.map((side) => `<option value="${side}"${token.side === side ? ' selected' : ''}>${side}</option>`).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Movement</span>
                        <select class="vtt-inspector-select" data-token-field="moveAccess">
                            <option value="dm"${normalizeMoveAccess(token.moveAccess, 'dm') === 'dm' ? ' selected' : ''}>DM Only</option>
                            <option value="player"${normalizeMoveAccess(token.moveAccess, token.sourceType === 'player' ? 'player' : 'dm') === 'player' ? ' selected' : ''}>Players Can Move</option>
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Image URL</span>
                        <input class="vtt-inspector-input" type="text" data-token-field="imageUrl" value="${escapeHtml(imageUrlValue)}">
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
                        <span>Stealth Roll</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="stealthRoll" value="${getTokenStealthRoll(token) ?? ''}">
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
                <div class="vtt-subhead">Quick Actions</div>
                <div class="vtt-chip-row vtt-inspector-quick-row">
                    <button class="vtt-chip-btn" data-action="token-adjust-hp" data-id="${escapeHtml(token.id)}" data-delta="-5">-5 HP</button>
                    <button class="vtt-chip-btn" data-action="token-adjust-hp" data-id="${escapeHtml(token.id)}" data-delta="+5">+5 HP</button>
                    <button class="vtt-chip-btn" data-action="token-set-bloodied" data-id="${escapeHtml(token.id)}">Bloodied</button>
                    <button class="vtt-chip-btn" data-action="token-set-full-hp" data-id="${escapeHtml(token.id)}">Full HP</button>
                </div>
                <div class="vtt-chip-row vtt-inspector-quick-row">
                    <button class="vtt-chip-btn" data-action="toggle-token-hidden-quick" data-id="${escapeHtml(token.id)}">${token.hidden ? 'Reveal' : 'Hide'}</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Prone">Prone</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Stunned">Stunned</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Poisoned">Poisoned</button>
                    <button class="vtt-chip-btn" data-action="token-clear-conditions" data-id="${escapeHtml(token.id)}">Clear Cond</button>
                </div>
                <label class="vtt-inspector-check">
                    <input type="checkbox" data-token-field="hidden"${token.hidden ? ' checked' : ''}>
                    <span>Hidden In Player Mode</span>
                </label>
                <label class="vtt-field">
                    <span>Conditions</span>
                    <textarea class="vtt-inspector-textarea" data-token-field="conditions">${escapeHtml(serializeConditions(token.conditions))}</textarea>
                </label>
                ${supportsSightCone ? `
                    <div class="vtt-subhead">Sight Cone</div>
                    <div class="vtt-inspector-grid">
                        <label class="vtt-inspector-check">
                            <input type="checkbox" data-token-vision-field="enabled"${token.vision && token.vision.enabled ? ' checked' : ''}>
                            <span>Enabled</span>
                        </label>
                        <label class="vtt-field">
                            <span>Facing</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="facingDeg" value="${escapeHtml(String(token.vision && token.vision.facingDeg !== undefined ? token.vision.facingDeg : 0))}">
                        </label>
                        <label class="vtt-field">
                            <span>Angle</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="arcDeg" min="1" max="360" value="${escapeHtml(String(token.vision && token.vision.arcDeg !== undefined ? token.vision.arcDeg : 90))}">
                        </label>
                        <label class="vtt-field">
                            <span>Range</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="baseRangeCells" min="0" max="99" value="${escapeHtml(String(token.vision && token.vision.baseRangeCells !== undefined ? token.vision.baseRangeCells : 6))}">
                        </label>
                    </div>
                ` : ''}
                ${isRosterManagedPlayer ? '<div class="vtt-detail-note">Player token name stays synced from the roster. Updating portrait here also updates that roster entry.</div>' : ''}
                <div class="vtt-inspector-actions">
                    <button class="vtt-inline-btn" data-action="clone-token" data-id="${escapeHtml(token.id)}">Clone Token</button>
                    <button class="vtt-inline-btn" data-action="add-token-to-initiative" data-id="${escapeHtml(token.id)}">Add To Initiative</button>
                    <button class="vtt-inline-btn danger" data-action="delete-token" data-id="${escapeHtml(token.id)}">Delete Token</button>
                </div>
            </div>
        `;
    };

    const buildDMEvidenceNoteInspectorContent = (note, scene) => {
        const bounds = getEvidenceNoteCellBounds(scene, note) || {
            left: 0,
            top: 0,
            widthCells: 1,
            heightCells: 1
        };
        const category = normalizeEvidenceNoteCategory(note && note.category);
        return `
            <div class="vtt-inspector-stack">
                <label class="vtt-field">
                    <span>Title</span>
                    <input class="vtt-inspector-input" type="text" data-note-field="title" value="${escapeHtml(getEvidenceNoteDisplayTitle(note))}">
                </label>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Category</span>
                        <select class="vtt-inspector-select" data-note-field="category">
                            ${Object.entries(EVIDENCE_NOTE_CATEGORY_META).map(([value, meta]) => `
                                <option value="${escapeHtml(value)}"${category === value ? ' selected' : ''}>${escapeHtml(meta.label)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Grid X</span>
                        <input class="vtt-inspector-input" type="number" data-note-field="gridX" value="${escapeHtml(String(bounds.left))}">
                    </label>
                    <label class="vtt-field">
                        <span>Grid Y</span>
                        <input class="vtt-inspector-input" type="number" data-note-field="gridY" value="${escapeHtml(String(bounds.top))}">
                    </label>
                    <label class="vtt-field">
                        <span>Cells Wide</span>
                        <input class="vtt-inspector-input" type="number" min="1" data-note-field="cellsWide" value="${escapeHtml(String(bounds.widthCells))}">
                    </label>
                    <label class="vtt-field">
                        <span>Cells High</span>
                        <input class="vtt-inspector-input" type="number" min="1" data-note-field="cellsHigh" value="${escapeHtml(String(bounds.heightCells))}">
                    </label>
                </div>
                <label class="vtt-field">
                    <span>Details</span>
                    <textarea class="vtt-inspector-textarea" data-note-field="body" placeholder="What should this zone communicate?">${escapeHtml(note.body || '')}</textarea>
                </label>
                <label class="vtt-inspector-check">
                    <input type="checkbox" data-note-field="hidden"${note.hidden ? ' checked' : ''}>
                    <span>Hidden In Player Mode</span>
                </label>
                <div class="vtt-detail-note">
                    ${note.hidden
                        ? 'DM-only zones stay hidden until you reveal them.'
                        : 'Revealed zones still stay hidden from players while their tagged area is fully covered by fog.'}
                </div>
                <div class="vtt-inspector-actions">
                    <button class="vtt-inline-btn" data-action="toggle-evidence-hidden-quick" data-id="${escapeHtml(String(note.id || ''))}">${note.hidden ? 'Reveal To Players' : 'Hide From Players'}</button>
                    <button class="vtt-inline-btn danger" data-action="delete-evidence-note" data-id="${escapeHtml(String(note.id || ''))}">Delete Zone</button>
                </div>
            </div>
        `;
    };

    const buildEvidenceNoteViewerContent = (note, scene) => `
        <div class="vtt-inspector-stack">
            <div class="vtt-subhead">Zone Indicator</div>
            <div class="vtt-chip-row">
                <span class="vtt-panel-pill">${escapeHtml(getEvidenceNoteCategoryLabel(note && note.category))}</span>
                <span class="vtt-panel-pill">${escapeHtml(buildEvidenceNoteAreaLabel(note, scene))}</span>
            </div>
            <div class="vtt-note-view-body">${escapeHtml(note && note.body ? note.body : 'No zone details shared yet.')}</div>
        </div>
    `;

    const renderTokenInspector = () => {
        const token = getTokenById(selectedTokenId);
        const scene = getActiveScene();
        const note = getEvidenceNoteById(selectedEvidenceNoteId);
        if (!selectionPillEl || !tokenInspectorEl) return;
        if (!isDM() && token && token.hidden) {
            selectionPillEl.textContent = 'No Selection';
            tokenInspectorEl.innerHTML = '<div class="vtt-empty">Select a visible token or zone on the map to inspect it.</div>';
            return;
        }
        if (note && !token) {
            selectionPillEl.textContent = getEvidenceNoteDisplayTitle(note);
            tokenInspectorEl.innerHTML = isDM() && tokenInspectorState && tokenInspectorState.kind === 'note' && tokenInspectorState.targetId === note.id
                ? `
                    <div class="vtt-inspector-stack">
                        <div class="vtt-detail-note">Editing ${escapeHtml(getEvidenceNoteDisplayTitle(note))} in the floating inspector. Right-click another zone to move it, or press Escape to close it.</div>
                    </div>
                `
                : (isDM()
                    ? buildDMEvidenceNoteInspectorContent(note, scene)
                    : buildEvidenceNoteViewerContent(note, scene));
            return;
        }
        selectionPillEl.textContent = token ? token.label : 'No Selection';
        if (!token) {
            tokenInspectorEl.innerHTML = isDM()
                ? '<div class="vtt-empty">Right-click a token or zone to edit it near your cursor, or click a zone to edit the tagged map area here.</div>'
                : '<div class="vtt-empty">Select a token or zone on the map to inspect it.</div>';
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

        tokenInspectorEl.innerHTML = tokenInspectorState && tokenInspectorState.kind === 'token' && tokenInspectorState.targetId === token.id
            ? `
                <div class="vtt-inspector-stack">
                    <div class="vtt-defence-chip-row">
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">AC</span><strong>${escapeHtml(String(token.ac ?? '-'))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">HP</span><strong>${escapeHtml(serializeHp(token.hpCurrent, token.hpMax).replace('HP ', ''))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">PP</span><strong>${escapeHtml(String(token.passivePerception ?? '-'))}</strong></div>
                    </div>
                    <div class="vtt-detail-note">Editing ${escapeHtml(token.label)} in the floating inspector. Right-click another token to move it, or press Escape to close it.</div>
                </div>
            `
            : `
                <div class="vtt-inspector-stack">
                    <div class="vtt-defence-chip-row">
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">AC</span><strong>${escapeHtml(String(token.ac ?? '-'))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">HP</span><strong>${escapeHtml(serializeHp(token.hpCurrent, token.hpMax).replace('HP ', ''))}</strong></div>
                        <div class="vtt-defence-chip"><span class="vtt-inspector-label">PP</span><strong>${escapeHtml(String(token.passivePerception ?? '-'))}</strong></div>
                    </div>
                    <div class="vtt-detail-note">Right-click ${escapeHtml(token.label)} on the map to edit it at your cursor. Shift-right-click still previews token art.</div>
                </div>
            `;
    };

    const renderTokenInspectorPopover = () => {
        if (!tokenInspectorPopoverEl) return;
        const activePopoverKind = tokenInspectorState && tokenInspectorState.kind === 'note' ? 'note' : 'token';
        const activePopoverId = tokenInspectorState
            ? String(tokenInspectorState.targetId || tokenInspectorState.tokenId || '').trim()
            : '';
        const scene = getActiveScene();
        const token = activePopoverKind === 'token' ? getTokenById(activePopoverId) : null;
        const note = activePopoverKind === 'note' ? getEvidenceNoteById(activePopoverId) : null;
        if (!tokenInspectorState || !isDM() || (!token && !note)) {
            tokenInspectorPopoverEl.hidden = true;
            return;
        }
        tokenInspectorPopoverEl.innerHTML = activePopoverKind === 'note'
            ? `
                <div class="vtt-panel-head vtt-popover-head">
                    <h2>Zone Indicator</h2>
                    <div class="vtt-panel-head-actions">
                        <span class="vtt-panel-pill">${escapeHtml(note ? getEvidenceNoteDisplayTitle(note) : getDefaultEvidenceNoteTitle())}</span>
                        <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-token-inspector" aria-label="Close zone inspector">X</button>
                    </div>
                </div>
                ${buildDMEvidenceNoteInspectorContent(note, scene)}
            `
            : `
                <div class="vtt-panel-head vtt-popover-head">
                    <h2>Token Inspector</h2>
                    <div class="vtt-panel-head-actions">
                        <span class="vtt-panel-pill">${escapeHtml(token.label || 'Token')}</span>
                        <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-token-inspector" aria-label="Close token inspector">X</button>
                    </div>
                </div>
                ${buildDMTokenInspectorContent(token)}
            `;
        tokenInspectorPopoverEl.hidden = false;
        positionTokenInspectorPopover();
    };

    const renderInitiativeList = () => {
        if (!initiativeListEl || !roundPillEl) return;
        const initiative = vttState && vttState.initiative ? vttState.initiative : { entries: [], round: 1, activeEntryId: '' };
        const visibleEntries = getVisibleInitiativeEntriesForRole(vttState, localRole);
        roundPillEl.textContent = `Round ${initiative.round || 1}`;
        if (!Array.isArray(initiative.entries) || !initiative.entries.length) {
            initiativeListEl.innerHTML = '<div class="vtt-empty">No combatants yet. Add a token to initiative or roll from the Character Sheet.</div>';
            return;
        }
        if (!visibleEntries.length) {
            initiativeListEl.innerHTML = '<div class="vtt-empty">No visible combatants right now.</div>';
            return;
        }

        initiativeListEl.innerHTML = visibleEntries.map((entry) => {
            const isHiddenToPlayers = isEntryHiddenForRole(entry, vttState, 'player');
            return `
            <div class="vtt-entry${entry.id === selectedEntryId ? ' is-selected' : ''}${entry.id === initiative.activeEntryId ? ' is-active-turn' : ''}${isHiddenToPlayers ? ' is-hidden' : ''}" data-action="select-entry" data-id="${escapeHtml(entry.id)}">
                <div class="vtt-entry-line">
                    <div class="vtt-entry-primary">
                        <div class="vtt-entry-name">${escapeHtml(entry.name || 'Combatant')}</div>
                        <div class="vtt-entry-meta vtt-entry-meta-inline">
                            <span class="vtt-entry-tag">Tie ${escapeHtml(String(entry.tie ?? 10))}</span>
                            ${isHiddenToPlayers ? '<span class="vtt-entry-tag">Hidden</span>' : ''}
                            ${entry.reactionUsed ? '<span class="vtt-entry-tag">Reaction Used</span>' : ''}
                            ${entry.concentrating ? '<span class="vtt-entry-tag">Concentrating</span>' : ''}
                        </div>
                    </div>
                    <div class="vtt-entry-top-actions">
                        <div class="vtt-entry-score">${escapeHtml(String(entry.total ?? 0))}</div>
                        ${isDM() ? `<button class="vtt-inline-btn vtt-inline-btn-icon danger" data-action="remove-entry" data-id="${escapeHtml(entry.id)}" aria-label="Remove from initiative" title="Remove from initiative">X</button>` : ''}
                    </div>
                </div>
            </div>
        `;
        }).join('');
    };

    const renderInitiativeDetail = () => {
        if (!initiativeDetailPanelEl) return;
        const activePopoverId = initiativeDetailState && initiativeDetailState.entryId ? initiativeDetailState.entryId : '';
        const entry = getEntryById(activePopoverId);
        const assignedToken = getAssignedTokenForEntry(entry, vttState);
        const assignedTokenScene = assignedToken ? findSceneForTokenId(vttState, assignedToken.id) : null;
        const assignmentSummary = assignedToken
            ? buildTokenAssignmentLabel(assignedToken, assignedTokenScene, vttState)
            : (entry && entry.linkedTokenId ? `Missing token (${entry.linkedTokenId})` : 'Unlinked');
        const tokenAssignmentOptions = getInitiativeTokenAssignmentOptions(vttState);
        const rosterPlayer = getRosterPlayerForRecord(entry) || getRosterPlayerForRecord(findTokenByIdAcrossScenes(vttState, entry && entry.linkedTokenId));
        const isRosterManagedPlayer = !!rosterPlayer;
        if (!entry || !initiativeDetailState || !isDM()) {
            initiativeDetailPanelEl.hidden = true;
            return;
        }
        initiativeDetailPanelEl.innerHTML = `
            <div class="vtt-panel-head vtt-popover-head">
                <h2>Entry Details</h2>
                <div class="vtt-panel-head-actions">
                    <span class="vtt-panel-pill">${escapeHtml(entry.name || 'Combatant')}</span>
                    <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-initiative-detail" aria-label="Close entry details">X</button>
                </div>
            </div>
            <div class="vtt-entry-detail-stack">
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="toggle-reaction" data-id="${escapeHtml(entry.id)}">${entry.reactionUsed ? 'Reset Reaction' : 'Use Reaction'}</button>
                    <button class="vtt-inline-btn" data-action="toggle-concentration" data-id="${escapeHtml(entry.id)}">${entry.concentrating ? 'Drop Concentration' : 'Concentrating'}</button>
                </div>
                <div class="vtt-entry-detail-grid">
                    <label class="vtt-field">
                        <span>Name</span>
                        <input class="vtt-entry-input" type="text" ${isRosterManagedPlayer ? 'readonly' : 'data-entry-field="name"'} value="${escapeHtml(entry.name || '')}">
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
                        <span>Stealth Roll</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="stealthRoll" value="${getEntryStealthRoll(entry) ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>AC</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="ac" value="${entry.ac ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Linked Token</span>
                        <input class="vtt-entry-input" type="text" value="${escapeHtml(assignmentSummary)}" readonly>
                    </label>
                    <label class="vtt-field">
                        <span>Assign To Token</span>
                        <select class="vtt-entry-input" data-entry-token-link="1">
                            <option value="">Choose token...</option>
                            ${tokenAssignmentOptions.map((option) => `
                                <option value="${escapeHtml(option.tokenId)}"${assignedToken && option.tokenId === assignedToken.id ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                            `).join('')}
                        </select>
                    </label>
                </div>
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="assign-entry-selected-token" data-id="${escapeHtml(entry.id)}"${selectedTokenId ? '' : ' disabled'}>${selectedTokenId ? 'Assign Selected Token' : 'Select A Token On The Map'}</button>
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
                ${isRosterManagedPlayer ? '<div class="vtt-detail-note">Player initiative names and portraits stay synced to the Hub roster.</div>' : ''}
                <div class="vtt-detail-note">Assigning a player or NPC token also stores its roster identity, so matching spawns in other scenes can resolve this entry automatically.</div>
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="move-entry-up" data-id="${escapeHtml(entry.id)}">Move Up</button>
                    <button class="vtt-inline-btn" data-action="move-entry-down" data-id="${escapeHtml(entry.id)}">Move Down</button>
                    <button class="vtt-inline-btn danger" data-action="remove-entry" data-id="${escapeHtml(entry.id)}">Remove</button>
                </div>
            </div>
        `;
        initiativeDetailPanelEl.hidden = false;
        positionInitiativeDetail();
    };

    const buildVisionConeMarkup = (token, scene, sceneSize = worldSize, now = Date.now()) => {
        const renderedToken = getRenderableVisionToken(token, scene, now);
        const geometry = getVisionConeGeometry(renderedToken, scene, sceneSize);
        if (!geometry) return '';
        const targetSummary = getStealthVisionTargetSummary(renderedToken, scene, vttState);
        const hasDetectedTargets = targetSummary.detectedIds.length > 0;
        const hasUnseenTargets = targetSummary.unseenIds.length > 0;
        const fill = hasDetectedTargets
            ? 'rgba(255, 102, 102, 0.24)'
            : (hasUnseenTargets ? 'rgba(255, 211, 102, 0.24)' : 'rgba(94, 176, 255, 0.22)');
        const stroke = hasDetectedTargets
            ? 'rgba(255, 132, 132, 0.82)'
            : (hasUnseenTargets ? 'rgba(255, 227, 163, 0.88)' : 'rgba(122, 194, 255, 0.78)');
        const classes = ['vtt-overlay-item', 'vtt-vision-cone'];
        const arcDeg = clamp(toNumber(geometry.arcDeg, 90), 1, 360);
        const facingDeg = normalizeAngleDeg(toNumber(geometry.facingDeg, 0));
        const centerX = toNumber(geometry.centerX, 0);
        const centerY = toNumber(geometry.centerY, 0);
        const radiusPx = Math.max(1, toNumber(geometry.radiusPx, 0));
        const handleGuidePoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg);
        const shapeMarkup = arcDeg >= 359.5
            ? `
                <circle cx="${centerX.toFixed(3)}" cy="${centerY.toFixed(3)}" r="${radiusPx.toFixed(3)}"
                    fill="${fill}"
                    stroke="${stroke}"
                    stroke-width="8"
                    vector-effect="non-scaling-stroke"></circle>
            `
            : (() => {
                const startPoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg - arcDeg / 2);
                const endPoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg + arcDeg / 2);
                const largeArcFlag = arcDeg > 180 ? 1 : 0;
                const path = [
                    `M ${centerX.toFixed(3)} ${centerY.toFixed(3)}`,
                    `L ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)}`,
                    `A ${radiusPx.toFixed(3)} ${radiusPx.toFixed(3)} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)}`,
                    'Z'
                ].join(' ');
                return `
                    <path d="${path}"
                        fill="${fill}"
                        stroke="${stroke}"
                        stroke-width="8"
                        vector-effect="non-scaling-stroke"></path>
                `;
            })();
        if (visionConeRotateState && visionConeRotateState.tokenId === token.id) classes.push('is-rotating');
        const guideMarkup = selectedTokenId === token.id && canRoleMoveToken(token)
            ? `
                <line class="vtt-vision-cone-guide"
                    x1="${centerX.toFixed(3)}"
                    y1="${centerY.toFixed(3)}"
                    x2="${handleGuidePoint.x.toFixed(3)}"
                    y2="${handleGuidePoint.y.toFixed(3)}"
                    vector-effect="non-scaling-stroke"></line>
            `
            : '';
        return `
            <div class="${classes.join(' ')}"
                data-token-id="${escapeHtml(String(token.id || ''))}"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}">
                <svg viewBox="0 0 ${escapeHtml(String(geometry.width))} ${escapeHtml(String(geometry.height))}" preserveAspectRatio="none" aria-hidden="true">
                    ${shapeMarkup}
                    ${guideMarkup}
                </svg>
            </div>
        `;
    };

    const buildVisionConeHandleMarkup = (token, scene, sceneSize = worldSize, now = Date.now()) => {
        if (!isDM() || selectedTokenId !== token.id) return '';
        const renderedToken = getRenderableVisionToken(token, scene, now);
        const geometry = getVisionConeGeometry(renderedToken, scene, sceneSize);
        if (!geometry) return '';
        const handleOffsetPx = 18 / Math.max(0.25, localView.zoom);
        const handlePoint = getPointAtAngle(
            toNumber(geometry.centerX, 0),
            toNumber(geometry.centerY, 0),
            Math.max(1, toNumber(geometry.radiusPx, 0)) + handleOffsetPx,
            normalizeAngleDeg(toNumber(geometry.facingDeg, 0))
        );
        const leftPercent = geometry.width ? (handlePoint.x / geometry.width) * 100 : 0;
        const topPercent = geometry.height ? (handlePoint.y / geometry.height) * 100 : 0;
        return `
            <div class="vtt-overlay-item vtt-vision-handle-overlay"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}">
                <button class="vtt-template-rotate-handle vtt-vision-cone-rotate-handle" type="button"
                    data-token-id="${escapeHtml(String(token.id || ''))}"
                    style="left:${escapeHtml(String(leftPercent))}%;top:${escapeHtml(String(topPercent))}%;"
                    aria-label="Rotate sight cone"></button>
            </div>
        `;
    };

    const buildAreaTemplateMarkup = (template, scene, { preview = false, transient = false } = {}) => {
        const geometry = getAreaTemplateWorldGeometry(template, scene);
        if (!geometry) return '';
        const classes = [
            'vtt-overlay-item',
            'vtt-area-template',
            template.kind === TEMPLATE_KIND_CONE ? 'is-cone' : 'is-circle'
        ];
        if (preview) classes.push('is-preview');
        if (transient) classes.push('is-transient');
        const shapeMarkup = template.kind === TEMPLATE_KIND_CONE
            ? `
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points="0,50 100,0 100,100"
                        fill="rgba(255, 211, 102, 0.2)"
                        stroke="rgba(255, 227, 163, 0.84)"
                        stroke-width="1.8"></polygon>
                </svg>
            `
            : `
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <circle cx="50" cy="50" r="48"
                        fill="rgba(255, 211, 102, 0.18)"
                        stroke="rgba(255, 227, 163, 0.84)"
                        stroke-width="2"></circle>
                </svg>
            `;
        return `
            <div class="${classes.join(' ')}"
                data-template-id="${escapeHtml(String(template.id || ''))}"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}"
                data-world-rotation="${escapeHtml(String(geometry.rotationDeg))}">
                ${shapeMarkup}
            </div>
        `;
    };

    const buildEvidenceNoteMarkup = (note, scene, { preview = false, selected = false } = {}) => {
        if (!note || !scene) return '';
        const classes = ['vtt-overlay-item', 'vtt-map-note'];
        if (preview) classes.push('is-preview');
        if (selected) classes.push('is-selected');
        if (note.hidden) classes.push('is-hidden');
        const category = normalizeEvidenceNoteCategory(note.category);
        const categoryLabel = getEvidenceNoteCategoryLabel(category);
        const displayTitle = getEvidenceNoteDisplayTitle(note);
        const description = String(note && note.body || '').trim();
        const areaLabel = buildEvidenceNoteAreaLabel(note, scene);
        const highlightColor = getEvidenceNoteHighlightColor(note);
        const highlightRgb = getEvidenceNoteHighlightRgb(note);
        const kicker = note.hidden ? `DM Only · ${categoryLabel}` : categoryLabel;
        return `
            <div class="${classes.join(' ')}"
                data-note-id="${escapeHtml(String(note.id || ''))}"
                data-note-category="${escapeHtml(category)}"
                data-note-title="${escapeHtml(displayTitle)}"
                data-world-left="${escapeHtml(String(note.x || 0))}"
                data-world-top="${escapeHtml(String(note.y || 0))}"
                data-world-width="${escapeHtml(String(note.w || 1))}"
                data-world-height="${escapeHtml(String(note.h || 1))}"
                style="--vtt-note-color:${escapeHtml(highlightColor)};--vtt-note-rgb:${escapeHtml(highlightRgb)};">
                <div class="vtt-map-note-chip">
                    <span class="vtt-map-note-kicker">${escapeHtml(kicker)}</span>
                    <strong class="vtt-map-note-title" data-note-category-short="${escapeHtml(getEvidenceNoteCategoryShortLabel(category))}">${escapeHtml(displayTitle)}</strong>
                    <span class="vtt-map-note-body">${escapeHtml(description || 'No zone details shared yet.')}</span>
                    <span class="vtt-map-note-meta">${escapeHtml(areaLabel)}</span>
                </div>
            </div>
        `;
    };

    const buildRulerMarkup = (scene) => {
        if (!scene || !rulerState || !rulerState.dragging || rulerState.sceneId !== scene.id || !rulerState.start || !rulerState.end) return '';
        const start = getTemplateWorldPoint(scene, rulerState.start);
        const end = getTemplateWorldPoint(scene, rulerState.end);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distanceCells = Math.hypot(toNumber(rulerState.end.x, 0) - toNumber(rulerState.start.x, 0), toNumber(rulerState.end.y, 0) - toNumber(rulerState.start.y, 0));
        const distanceFeet = Math.round(distanceCells * Math.max(1, toNumber(scene.grid && scene.grid.cellDistance, 5)));
        const label = `${Number.isInteger(distanceCells) ? distanceCells : Math.round(distanceCells * 10) / 10} sq · ${distanceFeet} ft`;
        return `
            <div class="vtt-overlay-item vtt-ruler-line"
                data-world-left="${escapeHtml(String(start.x))}"
                data-world-top="${escapeHtml(String(start.y - 10))}"
                data-world-width="${escapeHtml(String(Math.max(1, Math.hypot(dx, dy))))}"
                data-world-height="20"
                data-world-rotation="${escapeHtml(String(normalizeAngleDeg(Math.atan2(dy, dx) * 180 / Math.PI)))}">
                <div class="vtt-ruler-label">${escapeHtml(label)}</div>
            </div>
        `;
    };

    const renderVisionLayer = (scene, visibleTokens, sceneSize = worldSize, now = Date.now()) => {
        if (!visionLayerEl) return;
        const showStealthCones = !!(scene && scene.stealthMode);
        const handleMarkup = showStealthCones
            ? visibleTokens
                .filter((token) => {
                    const side = String(token && token.side || '').trim().toLowerCase();
                    return side === 'enemy' || side === 'neutral';
                })
                .map((token) => buildVisionConeHandleMarkup(token, scene, sceneSize, now))
                .join('')
            : '';
        visionLayerEl.innerHTML = handleMarkup;
    };

    const renderTemplateLayer = (scene, visibleTokens, sceneSize = worldSize, now = Date.now()) => {
        if (!templateLayerEl) return;
        const showStealthCones = !!(scene && scene.stealthMode);
        const visibleTemplates = getRenderableSceneTemplates(scene);
        const visionMarkup = showStealthCones
            ? visibleTokens
                .filter((token) => {
                    const side = String(token && token.side || '').trim().toLowerCase();
                    return side === 'enemy' || side === 'neutral';
                })
                .map((token) => buildVisionConeMarkup(token, scene, sceneSize, now))
                .join('')
            : '';
        const templateMarkup = visibleTemplates.map((template) => buildAreaTemplateMarkup(template, scene, { transient: true })).join('');
        const previewMarkup = templatePlacementState && templatePlacementState.sceneId === scene.id && templatePlacementState.template
            ? buildAreaTemplateMarkup(templatePlacementState.template, scene, { preview: true })
            : '';
        const rulerMarkup = buildRulerMarkup(scene);
        templateLayerEl.innerHTML = `${visionMarkup}${templateMarkup}${previewMarkup}${rulerMarkup}`;
        scheduleTemplateExpiryRender(scene);
    };

    const renderStage = () => {
        const scene = getActiveScene();
        if (!scene || !mapWorldEl || !worldEl || !gridLayerEl || !fogLayerEl || !noteLayerEl || !templateLayerEl || !tokenLayerEl || !visionLayerEl) return;

        loadMapForScene(scene);
        worldSize = getWorldSizeForScene(scene);
        const mapDisplaySize = getLoadedMapSizeForScene(scene);
        mapImageEl.style.display = mapDisplaySize.width && mapDisplaySize.height ? 'block' : 'none';

        const fogMarkup = Array.isArray(scene.fog) ? scene.fog.map((mask) => buildFogMaskMarkup(mask)).join('') : '';
        const fogPreviewMarkup = fogPlacementState && fogPlacementState.sceneId === scene.id && fogPlacementState.mask
            ? buildFogMaskMarkup(fogPlacementState.mask, fogPlacementState.mode === 'remove' ? 'is-remove-preview' : 'is-preview')
            : '';
        fogLayerEl.innerHTML = `${fogMarkup}${fogPreviewMarkup}`;

        const visibleEvidenceNotes = getVisibleEvidenceNotesForRole(scene);
        const evidenceMarkup = visibleEvidenceNotes
            .map((note) => buildEvidenceNoteMarkup(note, scene, { selected: note.id === selectedEvidenceNoteId }))
            .join('');
        const evidencePreviewMarkup = evidenceNotePlacementState && evidenceNotePlacementState.sceneId === scene.id && evidenceNotePlacementState.note
            ? buildEvidenceNoteMarkup(evidenceNotePlacementState.note, scene, { preview: true, selected: true })
            : '';
        noteLayerEl.innerHTML = `${evidenceMarkup}${evidencePreviewMarkup}`;

        const visibleTokens = getVisibleTokensForRole(scene);
        const initiative = vttState && vttState.initiative ? vttState.initiative : { activeEntryId: '' };
        const activeTurnToken = getVisibleSceneTokenForEntry(getEntryById(initiative.activeEntryId), vttState, localRole);
        const focusedEntryToken = getVisibleSceneTokenForEntry(getEntryById(selectedEntryId), vttState, localRole);
        const activeTurnTokenId = activeTurnToken ? activeTurnToken.id : '';
        const focusedEntryTokenId = focusedEntryToken ? focusedEntryToken.id : '';
        const stealthStatusMap = buildStealthStatusMap(scene, vttState);
        const renderTime = Date.now();

        renderTemplateLayer(scene, visibleTokens, worldSize, renderTime);

        tokenLayerEl.innerHTML = visibleTokens.map((token) => {
            const renderedCells = getRenderableTokenCells(token, scene, renderTime);
            const usableImageUrl = getUsableMediaUrl(token.imageUrl);
            const stealthStatus = String(stealthStatusMap.get(token.id) || '').trim();
            const isBloodied = isTokenBloodied(token);
            const isHiddenToPlayers = !!token.hidden || isTokenUnderFog(scene, token);
            return `
                <div class="vtt-token${usableImageUrl ? ' has-image' : ''}${token.id === selectedTokenId ? ' is-selected' : ''}${token.id === focusedEntryTokenId ? ' is-entry-linked' : ''}${token.id === activeTurnTokenId ? ' is-active-turn' : ''}${isHiddenToPlayers ? ' is-hidden' : ''}${token.id === previewTokenId ? ' is-preview-open' : ''}${stealthStatus === STEALTH_STATUS_DETECTED ? ' is-stealth-detected' : ''}${stealthStatus === STEALTH_STATUS_UNSEEN ? ' is-stealth-unseen' : ''}"
                    data-token-id="${escapeHtml(token.id)}"
                    data-id="${escapeHtml(token.id)}"
                    data-action="select-token"
                    data-side="${escapeHtml(token.side || 'neutral')}"
                    data-stealth-status="${escapeHtml(stealthStatus)}"
                    data-bloodied="${isBloodied ? '1' : '0'}"
                    data-world-left="${escapeHtml(String(scene.grid.offsetX + renderedCells.x * scene.grid.cellPx))}"
                    data-world-top="${escapeHtml(String(scene.grid.offsetY + renderedCells.y * scene.grid.cellPx))}"
                    data-world-width="${escapeHtml(String(token.w * scene.grid.cellPx))}"
                    data-world-height="${escapeHtml(String(token.h * scene.grid.cellPx))}"
                    style="--vtt-token-damage:${getTokenDamageFraction(token)};">
                    <div class="vtt-token-face">
                        ${usableImageUrl ? `<img class="vtt-token-image" src="${escapeHtml(usableImageUrl)}" alt="${escapeHtml(token.label || 'Token')}" draggable="false">` : `<div class="vtt-token-initials">${escapeHtml(buildInitials(token.label))}</div>`}
                    </div>
                    ${usableImageUrl ? `<div class="vtt-token-hover-card"><img class="vtt-token-hover-image" src="${escapeHtml(usableImageUrl)}" alt="${escapeHtml(token.label || 'Token')} portrait" draggable="false"></div>` : ''}
                    <div class="vtt-token-subtitle">${escapeHtml(token.label || 'Token')}</div>
                </div>
            `;
        }).join('');

        renderVisionLayer(scene, visibleTokens, worldSize, renderTime);

        applyRenderedWorldGeometry(scene);
        if (hasActiveSceneRemoteTweens(scene.id, renderTime)) scheduleRemoteTokenTweenRender();
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
        const toolMeta = localToolState.mode === TOOL_MODE_RULER
            ? 'Ruler active: click and hold on the stage to measure squares and feet.'
            : (localToolState.mode === TOOL_MODE_CIRCLE
                ? `Circle tool active: click and hold to preview a ${localToolState.sizeCells}-square radius circle. Origins snap to the nearest square center or grid intersection. Hold for a moment to leave a 5-second shared marker.`
                : (localToolState.mode === TOOL_MODE_CONE
                    ? `Cone tool active: click and hold to preview a ${localToolState.sizeCells}-square cone. Origins snap to the nearest square center or grid intersection. Hold for a moment to leave a 5-second shared marker.`
                    : (localToolState.mode === TOOL_MODE_NOTE
                        ? 'Zone tool active: drag a rectangle on the map to pin a category-coded zone to that area. Zones can be shared to players or kept DM-only.'
                    : (localToolState.mode === TOOL_MODE_FOG
                        ? 'Fog tool active: tap or drag on the map to add hidden rectangles. Tokens under fog are hidden from players.'
                        : (localToolState.mode === TOOL_MODE_FOG_REMOVE
                            ? 'Unfog tool active: tap or drag on the map to remove fog rectangles from that area.'
                    : (isDM()
                        ? 'Drag empty space to pan. Scroll or pinch to zoom. Drag tokens freely. Drag roster entries onto the stage to spawn them. Right-click empty space for quick spawn and NPC search at that spot. Right-click a token to open the inspector at that spot. Touch: long-press empty space for quick spawn or long-press a token for the inspector. Shift-right-click a token image to preview it. Double-click a token to snap it to the grid. Arrow keys move the selected token by one cell.'
                        : 'Drag empty space to pan. Scroll or pinch to zoom. Drag tokens freely. Drag roster entries onto the stage to spawn them. Double-click a token to snap it to the grid. Click zones to read them. Arrow keys move the selected token by one cell. Right-click a token image to preview it.'))))));
        const stealthMeta = scene.stealthMode ? 'Stealth mode is on: enemy and neutral sight cones are visible.' : 'Stealth mode is off.';
        applyUIPreferences();
        renderToolsMenu();
        renderSceneList();
        if (caseNameEl) caseNameEl.textContent = getActiveCaseName();
        if (roleToggleEl) roleToggleEl.textContent = isDM() ? 'Leave DM' : 'DM Mode';
        if (activeSceneLabelEl) activeSceneLabelEl.textContent = `Scene: ${sharedScene.name || 'Scene'}`;
        if (stageTitleEl) stageTitleEl.textContent = scene.name || 'Scene';
        if (stageMetaEl) {
            stageMetaEl.textContent = `${toolMeta} ${stealthMeta}`;
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
        renderNavMenu();
        renderViewMenu();
        renderToolsMenu();
        renderSpawnLists();
        renderNPCSearchPopover();
        renderStage();
        renderQuickSpawnMenu();
        renderTokenInspector();
        renderTokenInspectorPopover();
        renderInitiativeList();
        renderInitiativeDetail();
        renderSpawnGhost();
    };

    const updateSelectedEvidenceNote = (mutator) => {
        if (!selectedEvidenceNoteId) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.evidenceNotes)) return;
            const idx = scene.evidenceNotes.findIndex((note) => String(note && note.id || '').trim() === selectedEvidenceNoteId);
            if (idx < 0) return;
            mutator(scene.evidenceNotes[idx], draft, scene);
        });
    };

    const updateSelectedToken = (mutator) => {
        if (!selectedTokenId) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const idx = scene.tokens.findIndex((token) => token.id === selectedTokenId);
            if (idx < 0) return;
            mutator(scene.tokens[idx], draft);
            const rosterPlayer = getRosterPlayerForRecord(scene.tokens[idx]);
            if (rosterPlayer) syncTokenRosterIdentity(scene.tokens[idx], rosterPlayer);
            draft.initiative.entries = draft.initiative.entries.map((entry) => {
                const matchesLinkedToken = entry.linkedTokenId === selectedTokenId;
                const matchesSourceIdentity = !!(
                    scene.tokens[idx].sourceType
                    && scene.tokens[idx].sourceId
                    && entry.sourceType === scene.tokens[idx].sourceType
                    && entry.sourceId === scene.tokens[idx].sourceId
                );
                if (matchesLinkedToken || matchesSourceIdentity) return syncInitiativeEntryFromToken(entry, scene.tokens[idx]);
                return entry;
            });
            sortInitiativeEntries(draft.initiative.entries);
        });
    };

    const updateSelectedEntry = (mutator) => {
        if (!canEditInitiative()) return;
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
                if (!getRosterPlayerForRecord(linkedToken)) {
                    linkedToken.label = entries[idx].name || linkedToken.label;
                } else {
                    syncTokenRosterIdentity(linkedToken, getRosterPlayerForRecord(linkedToken));
                    syncEntryRosterIdentity(entries[idx], getRosterPlayerForRecord(linkedToken));
                }
                linkedToken.passivePerception = entries[idx].passivePerception;
                linkedToken.stealthRoll = getEntryStealthRoll(entries[idx]);
                linkedToken.defences = normalizeDefences(entries[idx].defences);
            }
            sortInitiativeEntries(entries);
        });
    };

    const deleteEvidenceNoteById = (noteId) => {
        const targetId = String(noteId || '').trim();
        if (!targetId) return false;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.evidenceNotes)) return;
            scene.evidenceNotes = scene.evidenceNotes.filter((note) => String(note && note.id || '').trim() !== targetId);
            if (selectedEvidenceNoteId === targetId) selectedEvidenceNoteId = '';
            if (tokenInspectorState && tokenInspectorState.kind === 'note' && tokenInspectorState.targetId === targetId) {
                tokenInspectorState = null;
            }
        });
        return true;
    };

    const assignSelectedEntryToToken = (tokenId) => {
        if (!canEditInitiative()) return false;
        const targetTokenId = String(tokenId || '').trim();
        if (!selectedEntryId || !targetTokenId) return false;
        let assigned = false;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => String(entry && entry.id || '').trim() === String(selectedEntryId || '').trim());
            if (idx < 0) return;
            const token = findTokenByIdAcrossScenes(draft, targetTokenId);
            if (!token) return;
            persistSheetIdentityForLinkedPlayer(entries[idx], token);
            entries[idx] = linkInitiativeEntryToToken(entries[idx], token);
            selectedTokenId = token.id;
            selectedEvidenceNoteId = '';
            assigned = true;
            sortInitiativeEntries(entries);
        });
        return assigned;
    };

    const findReplacementTokenForIdentity = (state, removedToken) => {
        const sourceType = String(removedToken && removedToken.sourceType || '').trim();
        const sourceId = String(removedToken && removedToken.sourceId || '').trim();
        const removedTokenId = String(removedToken && removedToken.id || '').trim();
        if (!sourceType || !sourceId || !state || !Array.isArray(state.scenes)) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const replacement = scene.tokens.find((token) =>
                String(token && token.id || '').trim() !== removedTokenId
                && String(token && token.sourceType || '').trim() === sourceType
                && String(token && token.sourceId || '').trim() === sourceId
            );
            if (replacement) return replacement;
        }
        return null;
    };

    const removeInitiativeEntriesForToken = (draft, removedToken) => {
        if (!draft || !draft.initiative || !Array.isArray(draft.initiative.entries) || !removedToken) return;
        const replacementToken = findReplacementTokenForIdentity(draft, removedToken);
        const removedEntryIds = new Set();
        draft.initiative.entries = draft.initiative.entries.flatMap((entry) => {
            const matchesLinkedToken = String(entry && entry.linkedTokenId || '').trim() === String(removedToken.id || '').trim();
            const matchesSource = !!(
                removedToken.sourceType
                && removedToken.sourceId
                && String(entry && entry.sourceType || '').trim() === String(removedToken.sourceType || '').trim()
                && String(entry && entry.sourceId || '').trim() === String(removedToken.sourceId || '').trim()
            );
            if (!matchesLinkedToken && !matchesSource) return [entry];
            if (replacementToken) return [syncInitiativeEntryFromToken(entry, replacementToken)];
            removedEntryIds.add(String(entry && entry.id || '').trim());
            return [];
        });

        if (removedEntryIds.has(String(draft.initiative.activeEntryId || '').trim())) {
            draft.initiative.activeEntryId = draft.initiative.entries[0] ? draft.initiative.entries[0].id : '';
        }
        if (removedEntryIds.has(String(selectedEntryId || '').trim())) {
            selectedEntryId = draft.initiative.activeEntryId || '';
        }
    };

    const addTokenToInitiative = (tokenId) => {
        if (!canEditInitiative()) return;
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
                selectedEntryId = nextEntry.id;
            }
            sortInitiativeEntries(entries);
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
        if (!force) return;
        const now = Date.now();
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
            }], { flushNow: true })).catch((err) => {
                console.warn('VTT collaboration drag sync failed', err);
            });
            if (typeof vttCollabSession.getSnapshot === 'function') {
                vttState = deepClone(vttCollabSession.getSnapshot());
                syncRosterLinkedPlayerPresentation(vttState);
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
            syncRosterLinkedPlayerPresentation(vttState);
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
        syncRosterLinkedPlayerPresentation(vttState);
        lastDragSyncAt = now;
    };

    const advanceTurn = (direction) => {
        if (!canEditInitiative()) return;
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
        if (!canEditInitiative()) return;
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
        if (!canEditInitiative()) return;
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
            if (initiativeDetailState && initiativeDetailState.entryId === removed.id) initiativeDetailState = null;
        });
    };

    const handleAction = (actionEl) => {
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        const id = String(actionEl.dataset.id || '').trim();

        if (action === 'toggle-role') {
            if (isDM()) {
                setRolePreference('player');
            } else {
                promptForDMMode();
            }
            return;
        }
        if (action === 'close-dm-unlock') {
            closeDMUnlockModal();
            return;
        }
        if (action === 'close-initiative-detail') {
            closeInitiativeDetail();
            return;
        }
        if (action === 'toggle-nav-menu') {
            navMenuOpen = !navMenuOpen;
            if (navMenuOpen) {
                viewMenuOpen = false;
                toolsMenuOpen = false;
            }
            renderNavMenu();
            renderViewMenu();
            renderToolsMenu();
            return;
        }
        if (action === 'toggle-view-menu') {
            viewMenuOpen = !viewMenuOpen;
            if (viewMenuOpen) {
                navMenuOpen = false;
                toolsMenuOpen = false;
            }
            renderNavMenu();
            renderViewMenu();
            renderToolsMenu();
            return;
        }
        if (action === 'toggle-tools-menu') {
            toolsMenuOpen = !toolsMenuOpen;
            if (toolsMenuOpen) {
                navMenuOpen = false;
                viewMenuOpen = false;
            }
            renderNavMenu();
            renderViewMenu();
            renderToolsMenu();
            return;
        }
        if (action === 'toggle-ruler-mode') {
            setToolMode(localToolState.mode === TOOL_MODE_RULER ? TOOL_MODE_NAVIGATE : TOOL_MODE_RULER);
            render();
            return;
        }
        if (action === 'set-tool-mode') {
            const nextMode = normalizeToolMode(actionEl.dataset.toolMode);
            if (nextMode === TOOL_MODE_NOTE && !isDM()) return;
            if ((nextMode === TOOL_MODE_FOG || nextMode === TOOL_MODE_FOG_REMOVE) && !isDM()) return;
            setToolMode(nextMode);
            render();
            return;
        }
        if (action === 'open-quick-spawn') {
            if (!isDM() || !stageEl) return;
            const rect = stageEl.getBoundingClientRect();
            openQuickSpawnMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
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
        if (action === 'clear-scene-fog') {
            if (!isDM()) return;
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene) return;
                scene.fog = [];
            });
            return;
        }
        if (action === 'toggle-evidence-hidden-quick') {
            if (!isDM()) return;
            selectedEvidenceNoteId = id || selectedEvidenceNoteId;
            updateSelectedEvidenceNote((note) => {
                note.hidden = !note.hidden;
            });
            return;
        }
        if (action === 'delete-evidence-note') {
            if (!isDM()) return;
            deleteEvidenceNoteById(id || selectedEvidenceNoteId);
            return;
        }
        if (action === 'token-adjust-hp') {
            selectedTokenId = id || selectedTokenId;
            const delta = Math.round(toNumber(actionEl.dataset.delta, 0));
            updateSelectedToken((token) => {
                const currentHp = Number.isFinite(Number(token.hpCurrent)) ? Math.round(Number(token.hpCurrent)) : 0;
                const maxHp = Number.isFinite(Number(token.hpMax)) ? Math.max(0, Math.round(Number(token.hpMax))) : null;
                const nextHp = Math.max(0, currentHp + delta);
                token.hpCurrent = maxHp !== null ? Math.min(nextHp, maxHp) : nextHp;
                if (maxHp !== null && token.hpMax === null) token.hpMax = maxHp;
            });
            return;
        }
        if (action === 'token-set-bloodied') {
            selectedTokenId = id || selectedTokenId;
            updateSelectedToken((token) => {
                const maxHp = Number.isFinite(Number(token.hpMax)) ? Math.max(0, Math.round(Number(token.hpMax))) : null;
                if (maxHp === null || maxHp <= 0) return;
                token.hpCurrent = maxHp <= 1 ? 1 : Math.max(1, Math.floor(maxHp / 2));
            });
            return;
        }
        if (action === 'token-set-full-hp') {
            selectedTokenId = id || selectedTokenId;
            updateSelectedToken((token) => {
                const maxHp = Number.isFinite(Number(token.hpMax)) ? Math.max(0, Math.round(Number(token.hpMax))) : null;
                if (maxHp === null) return;
                token.hpCurrent = maxHp;
            });
            return;
        }
        if (action === 'toggle-token-hidden-quick') {
            selectedTokenId = id || selectedTokenId;
            updateSelectedToken((token) => {
                token.hidden = !token.hidden;
            });
            return;
        }
        if (action === 'token-apply-condition') {
            selectedTokenId = id || selectedTokenId;
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
            selectedTokenId = id || selectedTokenId;
            updateSelectedToken((token) => {
                token.conditions = [];
            });
            return;
        }
        if (action === 'quick-spawn-custom') {
            if (!quickSpawnMenuState) return;
            spawnTokenFromDescriptor('custom', '', quickSpawnMenuState.worldPoint);
            return;
        }
        if (action === 'quick-spawn-all-players') {
            if (!quickSpawnMenuState) return;
            spawnAllPlayersAtWorldPoint(quickSpawnMenuState.worldPoint);
            return;
        }
        if (action === 'quick-spawn-guildless') {
            if (!quickSpawnMenuState) return;
            spawnTokenFromDescriptor('guildless', '', quickSpawnMenuState.worldPoint);
            return;
        }
        if (action === 'quick-spawn-evidence-note') {
            if (!quickSpawnMenuState) return;
            createEvidenceNoteAtWorldPoint(quickSpawnMenuState.worldPoint, {
                clientX: quickSpawnMenuState.clientX,
                clientY: quickSpawnMenuState.clientY
            });
            return;
        }
        if (action === 'quick-spawn-player') {
            if (!quickSpawnMenuState) return;
            spawnTokenFromDescriptor('player', id, quickSpawnMenuState.worldPoint);
            return;
        }
        if (action === 'quick-spawn-npc') {
            if (!quickSpawnMenuState) return;
            spawnTokenFromDescriptor('npc', id, quickSpawnMenuState.worldPoint);
            return;
        }
        if (action === 'quick-spawn-open-npc-search') {
            if (!quickSpawnMenuState) return;
            const anchorClientX = quickSpawnMenuState.clientX;
            const anchorClientY = quickSpawnMenuState.clientY;
            const worldPoint = quickSpawnMenuState.worldPoint || null;
            closeQuickSpawnMenu();
            openNPCSearchAt(anchorClientX, anchorClientY, worldPoint);
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
            if (npcSearchOpen) {
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

        if (!isDM() && action !== 'select-token' && action !== 'select-entry') return;

        if (action === 'clone-current-scene') {
            const sourceScene = getActiveScene(vttState);
            if (!sourceScene) return;
            const nextScene = buildSceneRecord(vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [], sourceScene);
            setSceneViewPreference(SCENE_VIEW_SHARED);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                draft.activeSceneId = nextScene.id;
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
                if (wasViewed || wasActive || targetSceneId === sharedSceneId) {
                    setSceneViewPreference(SCENE_VIEW_SHARED);
                }
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'create-scene') {
            const nextScene = buildSceneRecord(vttState && Array.isArray(vttState.scenes) ? vttState.scenes : []);
            setSceneViewPreference(SCENE_VIEW_SHARED);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                draft.activeSceneId = nextScene.id;
                previewTokenId = '';
            }, { fitView: true });
            return;
        }

        if (action === 'view-scene-local') {
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
            setSceneViewPreference(SCENE_VIEW_SHARED);
            withDraft((draft) => {
                if (!Array.isArray(draft.scenes)) draft.scenes = [];
                draft.scenes.push(nextScene);
                draft.activeSceneId = nextScene.id;
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
                if (wasViewed || wasActive || id === sharedSceneId) {
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
            if (!stageEl) return;
            const rect = stageEl.getBoundingClientRect();
            openQuickSpawnMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
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

        if (action === 'select-token') {
            activateTokenSelection(id);
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
                const removedToken = scene.tokens.find((token) => token.id === id);
                if (!removedToken) return;
                scene.tokens = scene.tokens.filter((token) => token.id !== id);
                removeInitiativeEntriesForToken(draft, removedToken);
                if (selectedTokenId === id) selectedTokenId = '';
                if (previewTokenId === id) previewTokenId = '';
            });
            return;
        }

        if (action === 'clone-token') {
            cloneTokenById(id || selectedTokenId);
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
            selectedEvidenceNoteId = '';
            if (initiativeDetailState && initiativeDetailState.entryId !== id) {
                initiativeDetailState = null;
            }
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
            return;
        }

        if (action === 'assign-entry-selected-token') {
            selectedEntryId = id || selectedEntryId;
            if (!selectedEntryId || !selectedTokenId) return;
            assignSelectedEntryToToken(selectedTokenId);
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
        if (target instanceof HTMLInputElement && target.dataset.toolSizeField) {
            const nextSize = normalizeToolSizeCells(target.value, localToolState.sizeCells);
            localToolState.sizeCells = nextSize;
            renderToolsMenu();
            return;
        }
        if (event.type === 'input' && target instanceof HTMLInputElement) return;
        if (event.type === 'input' && target instanceof HTMLTextAreaElement) return;

        if (target instanceof HTMLSelectElement && target.dataset.scenePicker) {
            if (event.type !== 'change') return;
            const sceneId = String(target.value || '').trim();
            const scenes = vttState && Array.isArray(vttState.scenes) ? vttState.scenes : [];
            if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) return;
            setSceneViewPreference(SCENE_VIEW_SHARED);
            withDraft((draft) => {
                const scene = Array.isArray(draft.scenes)
                    ? draft.scenes.find((entry) => entry.id === sceneId)
                    : null;
                if (!scene) return;
                draft.activeSceneId = scene.id;
                previewTokenId = '';
            }, { fitView: true });
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

        if (selectedEntryId && target instanceof HTMLSelectElement && target.dataset.entryTokenLink) {
            if (!canEditInitiative()) return;
            if (event.type !== 'change') return;
            const tokenId = String(target.value || '').trim();
            if (!tokenId) return;
            assignSelectedEntryToToken(tokenId);
            return;
        }

        if (selectedTokenId && target.dataset.tokenField) {
            const field = target.dataset.tokenField;
            const token = getTokenById(selectedTokenId);
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
                const nextValue = String(target.value || '').trim();
                if (field === 'w' || field === 'h') {
                    token[field] = nextValue === '' ? 1 : Math.max(1, Math.round(toNumber(nextValue, 1)));
                    return;
                }
                token[field] = nextValue === '' ? null : Math.round(toNumber(nextValue, 0));
            });
            return;
        }

        if (selectedTokenId && target.dataset.tokenVisionField) {
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

        if (selectedEvidenceNoteId && target.dataset.noteField) {
            const field = target.dataset.noteField;
            updateSelectedEvidenceNote((note, draft, scene) => {
                if (field === 'hidden' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                    note.hidden = target.checked;
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
                const bounds = getEvidenceNoteCellBounds(scene, note) || {
                    left: 0,
                    top: 0,
                    widthCells: 1,
                    heightCells: 1
                };
                const nextValue = Math.round(toNumber(target.value, 0));
                if (field === 'gridX') bounds.left = Math.max(0, nextValue);
                else if (field === 'gridY') bounds.top = Math.max(0, nextValue);
                else if (field === 'cellsWide') bounds.widthCells = Math.max(1, nextValue);
                else if (field === 'cellsHigh') bounds.heightCells = Math.max(1, nextValue);
                const nextNote = buildEvidenceNoteFromCellBounds(scene, bounds, note);
                if (nextNote) Object.assign(note, nextNote);
            });
            return;
        }

        if (selectedEntryId && target.dataset.entryField) {
            if (!canEditInitiative()) return;
            const field = target.dataset.entryField;
            const entry = getEntryById(selectedEntryId);
            const rosterPlayer = getRosterPlayerForRecord(entry) || getRosterPlayerForRecord(findTokenByIdAcrossScenes(vttState, entry && entry.linkedTokenId));
            if (rosterPlayer && field === 'name') return;
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

    const sanitizeQueueEntry = (raw) => {
        const source = raw && typeof raw === 'object' ? raw : null;
        if (!source) return null;
        const rollId = String(source.rollId || '').trim();
        const name = String(source.name || '').trim();
        if (!rollId || !name) return null;
        const defences = normalizeDefences(source.defences);
        const rawStealthRoll = source.stealthRoll !== undefined ? source.stealthRoll : source.stealthDc;
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
            stealthRoll: rawStealthRoll === null || rawStealthRoll === undefined || rawStealthRoll === '' ? null : clamp(Math.round(toNumber(rawStealthRoll, 0)), 0, 99),
            defences
        };
    };

    const processInitiativeQueue = () => {
        if (!canEditInitiative()) return;
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
        const baseSnapshot = deepClone(draft);
        let mutated = false;
        const newlyProcessed = [];

        pendingEntries.forEach((packet) => {
            const linkedToken = packet.sourceType && packet.sourceId
                ? findTokenAcrossScenes(draft, packet.sourceType, packet.sourceId)
                : null;
            const entries = draft.initiative.entries;
            const allowNameFallback = !(packet.sourceType && packet.sourceId);
            const idx = entries.findIndex((entry) =>
                (packet.sourceType && packet.sourceId && entry.sourceType === packet.sourceType && entry.sourceId === packet.sourceId)
                || (allowNameFallback && String(entry.name || '').toLowerCase() === packet.name.toLowerCase())
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
                    stealthRoll: packet.stealthRoll !== null ? packet.stealthRoll : (base.stealthRoll ?? null),
                    defences: normalizeDefences(packet.defences && Object.values(packet.defences).some((value) => value !== null) ? packet.defences : base.defences),
                    linkedTokenId: linkedToken ? linkedToken.id : base.linkedTokenId,
                    sourceType: packet.sourceType || base.sourceType,
                    sourceId: packet.sourceId || base.sourceId
                };
                if (linkedToken && packet.stealthRoll !== null) linkedToken.stealthRoll = packet.stealthRoll;
                selectedEntryId = entries[idx].id;
            } else {
                const deterministicEntryId = packet.sourceType && packet.sourceId
                    ? String(`init_${packet.sourceType}_${packet.sourceId}`).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 120)
                    : '';
                const seed = linkedToken ? buildInitiativeEntryFromToken(linkedToken) : {
                    id: deterministicEntryId || buildId('init'),
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
                    stealthRoll: null,
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
                    stealthRoll: packet.stealthRoll !== null ? packet.stealthRoll : (seed.stealthRoll ?? null),
                    defences: normalizeDefences(packet.defences)
                };
                if (linkedToken && packet.stealthRoll !== null) linkedToken.stealthRoll = packet.stealthRoll;
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
        const saved = persistSharedVTTSnapshot(draft, {
            reason: 'initiative-queue',
            baseSnapshot
        });
        vttState = deepClone(saved || draft);
        syncRosterLinkedPlayerPresentation(vttState);
        markProcessedRollIds(newlyProcessed);
        normalizeSelections();
        render();
    };

    const handleStoreUpdate = (event) => {
        const store = getStore();
        if (!store) return;
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        const activeCaseId = getActiveCaseId();
        loadRolePreference();
        if (vttCollabSession && (vttCollabSession.caseId !== activeCaseId || vttCollabSession.roomId !== getVTTCollabRoomId(activeCaseId))) {
            refreshVTTCollabRoomIfNeeded().catch((err) => {
                console.warn('VTT collaboration room refresh failed', err);
            });
            return;
        }
        if (isVTTCollabReady()) {
            const isExternalSource = ['remote', 'storage', 'realtime'].includes(String(detail.source || '').trim().toLowerCase());
            const scopedUpdate = Array.isArray(detail.scopes) ? detail.scopes : [];
            const externalScopeMatchesActiveVTT = !scopedUpdate.length
                || scopedUpdate.some((scope) => isRelevantVTTStoreScope(scope, activeCaseId));
            const shouldBridgeExternalStoreSnapshot = isExternalSource && externalScopeMatchesActiveVTT;
            if ((shouldBridgeStoreUpdateToVTTCollab(detail, activeCaseId) || shouldBridgeExternalStoreSnapshot)
                && typeof vttCollabSession.applySharedStoreSnapshot === 'function') {
                const storeSnapshot = readSharedVTTSnapshot({
                    syncRosterPresentation: false,
                    useStoreOnly: true
                }) || deepClone(store.getVTTState(activeCaseId));
                const bridged = vttCollabSession.applySharedStoreSnapshot(storeSnapshot, {
                    source: detail.source || '',
                    scopeUpdatedAt: typeof store.getVTTStateUpdatedAt === 'function'
                        ? store.getVTTStateUpdatedAt(activeCaseId)
                        : 0,
                    reason: detail.source === 'storage' || detail.source === 'remote'
                        ? 'external-store'
                        : 'shared-store',
                    origin: shouldBridgeExternalStoreSnapshot ? 'remote-restore' : ''
                });
                if (bridged) return;
            }
            if (dragState) {
                if (syncRosterLinkedPlayerPresentation(vttState)) {
                    normalizeSelections();
                    render();
                }
                return;
            }
            const synced = ensureRosterLinkedPlayerPresentationPersisted(
                vttState || readSharedVTTSnapshot({ syncRosterPresentation: false }) || deepClone(store.getVTTState(activeCaseId)),
                { reason: 'roster-player-presentation-sync' }
            );
            if (synced.mutated) {
                vttState = synced.snapshot;
                normalizeSelections();
                render();
            }
            return;
        }
        if (dragState) {
            if (syncRosterLinkedPlayerPresentation(vttState)) {
                normalizeSelections();
                render();
            }
            return;
        }
        const nextSnapshot = ensureRosterLinkedPlayerPresentationPersisted(
            readSharedVTTSnapshot({ syncRosterPresentation: false }) || deepClone(store.getVTTState(activeCaseId)),
            { reason: 'roster-player-presentation-sync' }
        ).snapshot;
        queueRemoteTweensFromSnapshots(vttState, nextSnapshot);
        vttState = nextSnapshot;
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
        if (event.key && event.key === getRolePrefsStorageKey()) {
            loadRolePreference();
            render();
        }
    };

    const handleStagePointerDown = (event) => {
        const targetEl = getEventTargetElement(event);
        if (!targetEl) return;
        if (event.button !== 0) return;
        if (targetEl.closest('#vtt-quick-spawn-menu')) return;
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();

        const scene = getActiveScene();
        if (!scene) return;
        const worldPoint = screenToWorld(event.clientX, event.clientY);
        const noteEl = getEvidenceNoteElementAtClientPoint(event.clientX, event.clientY, targetEl);
        if (noteEl && localToolState.mode === TOOL_MODE_NAVIGATE) {
            const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
            if (!activateEvidenceNoteSelection(noteId)) return;
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }
        if (beginTouchContextInteraction(event, scene, worldPoint)) {
            event.preventDefault();
            return;
        }
        const visionRotateHandleEl = getVisionConeRotateHandleElementAtClientPoint(event.clientX, event.clientY, targetEl);
        if (visionRotateHandleEl) {
            const tokenId = String(visionRotateHandleEl.getAttribute('data-token-id') || '').trim();
            const token = getTokenById(tokenId);
            if (!isDM() || !token) return;
            selectedTokenId = token.id;
            selectedTemplateId = '';
            selectedEvidenceNoteId = '';
            selectedEntryId = '';
            previewTokenId = '';
            templatePlacementState = null;
            templateRotateState = null;
            rulerState = null;
            visionConeRotateState = {
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
            selectedTemplateId = template.id;
            selectedTokenId = '';
            selectedEvidenceNoteId = '';
            selectedEntryId = '';
            previewTokenId = '';
            templatePlacementState = null;
            visionConeRotateState = null;
            rulerState = null;
            templateRotateState = {
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
            selectedTemplateId = String(templateEl.getAttribute('data-template-id') || '').trim();
            selectedTokenId = '';
            selectedEvidenceNoteId = '';
            selectedEntryId = '';
            previewTokenId = '';
            visionConeRotateState = null;
            renderTokenInspector();
            renderInitiativeList();
            renderInitiativeDetail();
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }

        if ((localToolState.mode === TOOL_MODE_FOG || localToolState.mode === TOOL_MODE_FOG_REMOVE) && isDM()) {
            const initialMask = buildFogMaskFromWorldPoints(scene, worldPoint, worldPoint);
            if (!initialMask) return;
            fogPlacementState = {
                sceneId: scene.id,
                mode: localToolState.mode === TOOL_MODE_FOG_REMOVE ? 'remove' : 'add',
                startWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                currentWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                mask: initialMask
            };
            selectedEvidenceNoteId = '';
            evidenceNotePlacementState = null;
            templatePlacementState = null;
            templateRotateState = null;
            visionConeRotateState = null;
            rulerState = null;
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }

        if (localToolState.mode === TOOL_MODE_NOTE && isDM()) {
            const initialNote = buildEvidenceNoteFromWorldPoints(scene, worldPoint, worldPoint);
            if (!initialNote) return;
            evidenceNotePlacementState = {
                sceneId: scene.id,
                startWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                currentWorldPoint: { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) },
                note: initialNote
            };
            selectedEvidenceNoteId = '';
            templatePlacementState = null;
            templateRotateState = null;
            visionConeRotateState = null;
            rulerState = null;
            fogPlacementState = null;
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }

        if (localToolState.mode === TOOL_MODE_CIRCLE) {
            const template = buildAreaTemplate(TEMPLATE_KIND_CIRCLE, scene, worldPoint, { sizeCells: localToolState.sizeCells });
            if (!template) return;
            templatePlacementState = {
                sceneId: scene.id,
                template,
                startedAt: Date.now()
            };
            templateRotateState = null;
            visionConeRotateState = null;
            rulerState = null;
            renderStage();
            event.preventDefault();
            return;
        }

        if (localToolState.mode === TOOL_MODE_CONE) {
            const template = buildAreaTemplate(TEMPLATE_KIND_CONE, scene, worldPoint, { sizeCells: localToolState.sizeCells });
            if (!template) return;
            templatePlacementState = {
                sceneId: scene.id,
                template,
                startedAt: Date.now()
            };
            templateRotateState = null;
            visionConeRotateState = null;
            rulerState = null;
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }

        if (localToolState.mode === TOOL_MODE_RULER) {
            const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
            rulerState = { sceneId: scene.id, start: anchor, end: anchor, dragging: true };
            templatePlacementState = null;
            templateRotateState = null;
            visionConeRotateState = null;
            renderToolsMenu();
            renderStage();
            event.preventDefault();
            return;
        }

        const tokenEl = targetEl.closest('.vtt-token');
        if (tokenEl) {
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token) return;
            const canMoveToken = canRoleMoveToken(token, localRole);
            const now = Date.now();
            const isDoublePress = lastTokenPointerDownId === token.id && now - lastTokenPointerDownAt <= TOKEN_DOUBLE_CLICK_MS;
            lastTokenPointerDownId = token.id;
            lastTokenPointerDownAt = now;
            activateTokenSelection(token.id);
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderToolsMenu();
            if (isDoublePress && canMoveToken) {
                lastTokenPointerDownId = '';
                lastTokenPointerDownAt = 0;
                event.preventDefault();
                snapTokenToGrid(token.id);
                return;
            }
            if (!canMoveToken) {
                renderStage();
                event.preventDefault();
                return;
            }
            const anchorX = (worldPoint.x - scene.grid.offsetX) / scene.grid.cellPx - token.x;
            const anchorY = (worldPoint.y - scene.grid.offsetY) / scene.grid.cellPx - token.y;
            remoteTokenTweens.delete(buildRemoteTokenTweenKey(scene.id, token.id));
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
        if (localToolState.mode === TOOL_MODE_NAVIGATE && selectedEvidenceNoteId) {
            selectedEvidenceNoteId = '';
            renderTokenInspector();
            renderInitiativeList();
            renderInitiativeDetail();
            renderToolsMenu();
            renderStage();
        }
        if (selectedTemplateId) {
            selectedTemplateId = '';
            renderToolsMenu();
            renderStage();
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
        if (spawnDragState) {
            spawnDragState.clientX = event.clientX;
            spawnDragState.clientY = event.clientY;
            spawnDragState.overStage = isClientPointInsideStage(event.clientX, event.clientY);
            renderSpawnGhost();
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
                dragState = {
                    tokenId: pending.tokenId,
                    anchorX: pending.anchorX,
                    anchorY: pending.anchorY
                };
                const scene = getActiveScene();
                if (scene) remoteTokenTweens.delete(buildRemoteTokenTweenKey(scene.id, pending.tokenId));
                lastDragSyncAt = 0;
                renderStage();
                return;
            }
            panState = {
                startClientX: pending.clientX,
                startClientY: pending.clientY,
                originX: pending.originX,
                originY: pending.originY
            };
            if (stageEl) stageEl.classList.add('is-panning');
            return;
        }
        if (fogPlacementState) {
            const scene = getActiveScene();
            if (!scene || fogPlacementState.sceneId !== scene.id) {
                fogPlacementState = null;
                renderStage();
                return;
            }
            fogPlacementState.currentWorldPoint = screenToWorld(event.clientX, event.clientY);
            fogPlacementState.mask = buildFogMaskFromWorldPoints(
                scene,
                fogPlacementState.startWorldPoint,
                fogPlacementState.currentWorldPoint,
                fogPlacementState.mask && fogPlacementState.mask.id
            );
            renderStage();
            return;
        }
        if (evidenceNotePlacementState) {
            const scene = getActiveScene();
            if (!scene || evidenceNotePlacementState.sceneId !== scene.id) {
                evidenceNotePlacementState = null;
                renderStage();
                return;
            }
            evidenceNotePlacementState.currentWorldPoint = screenToWorld(event.clientX, event.clientY);
            evidenceNotePlacementState.note = buildEvidenceNoteFromWorldPoints(
                scene,
                evidenceNotePlacementState.startWorldPoint,
                evidenceNotePlacementState.currentWorldPoint,
                evidenceNotePlacementState.note && evidenceNotePlacementState.note.id,
                evidenceNotePlacementState.note || {}
            );
            renderStage();
            return;
        }
        if (templatePlacementState) {
            const scene = getActiveScene();
            if (!scene || !templatePlacementState.template) return;
            const worldPoint = screenToWorld(event.clientX, event.clientY);
            if (templatePlacementState.template.kind === TEMPLATE_KIND_CIRCLE) {
                const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
                templatePlacementState.template.x = anchor.x;
                templatePlacementState.template.y = anchor.y;
            } else {
                templatePlacementState.template.angleDeg = getTemplateAngleFromWorldPoint(scene, templatePlacementState.template, worldPoint);
            }
            renderStage();
            return;
        }
        if (templateRotateState) {
            const scene = getActiveScene();
            const template = getTemplateById(templateRotateState.templateId);
            if (!scene || !template || template.kind !== TEMPLATE_KIND_CONE) {
                templateRotateState = null;
                renderStage();
                return;
            }
            templateRotateState.angleDeg = getTemplateAngleFromWorldPoint(scene, template, screenToWorld(event.clientX, event.clientY));
            renderStage();
            return;
        }
        if (visionConeRotateState) {
            const scene = getActiveScene();
            const token = getTokenById(visionConeRotateState.tokenId);
            if (!isDM() || !scene || !token) {
                visionConeRotateState = null;
                renderStage();
                return;
            }
            visionConeRotateState.angleDeg = getTemplateAngleFromWorldPoint(scene, getTokenCenterInCells(token), screenToWorld(event.clientX, event.clientY));
            renderStage();
            return;
        }
        if (rulerState && rulerState.dragging) {
            const scene = getActiveScene();
            if (!scene) return;
            rulerState.end = snapWorldPointToTemplateAnchor(scene, screenToWorld(event.clientX, event.clientY));
            renderStage();
            return;
        }
        if (dragState) {
            const scene = getActiveScene();
            if (!scene) return;
            const token = getTokenById(dragState.tokenId);
            if (!token || !canRoleMoveToken(token, localRole)) return;
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

    const handlePointerUp = (event) => {
        if (spawnDragState) {
            const shouldSpawn = isDM() && event && isClientPointInsideStage(event.clientX, event.clientY);
            const nextWorldPoint = shouldSpawn ? screenToWorld(event.clientX, event.clientY) : null;
            const descriptor = { kind: spawnDragState.kind, id: spawnDragState.id };
            clearSpawnDrag();
            if (shouldSpawn) {
                spawnTokenFromDescriptor(descriptor.kind, descriptor.id, nextWorldPoint);
            }
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
        if (fogPlacementState) {
            const pendingFog = { ...fogPlacementState };
            fogPlacementState = null;
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
                scene.fog = applyFogMaskMutation(scene, mask, pendingFog.mode === 'remove' ? 'remove' : 'add');
            });
            return;
        }
        if (evidenceNotePlacementState) {
            const pendingNote = { ...evidenceNotePlacementState };
            evidenceNotePlacementState = null;
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
                selectedEvidenceNoteId = note.id;
                selectedTokenId = '';
                selectedEntryId = '';
            });
            return;
        }
        if (templatePlacementState) {
            const pendingTemplateState = templatePlacementState;
            templatePlacementState = null;
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
        if (templateRotateState) {
            if (event && event.type === 'pointercancel') {
                templateRotateState = null;
                renderStage();
                return;
            }
            const pendingRotation = { ...templateRotateState };
            templateRotateState = null;
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene || !Array.isArray(scene.templates)) return;
                const template = scene.templates.find((entry) => entry && entry.id === pendingRotation.templateId);
                if (!template) return;
                template.angleDeg = normalizeAngleDeg(pendingRotation.angleDeg);
                selectedTemplateId = template.id;
                selectedEvidenceNoteId = '';
            });
            return;
        }
        if (visionConeRotateState) {
            if (event && event.type === 'pointercancel') {
                visionConeRotateState = null;
                renderStage();
                return;
            }
            const pendingRotation = { ...visionConeRotateState };
            visionConeRotateState = null;
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
                selectedTokenId = token.id;
                selectedEvidenceNoteId = '';
            });
            return;
        }
        let appliedRemoteSnapshot = false;
        if (dragState) {
            syncDraggedState(true);
            lastDragSyncAt = 0;
            dragState = null;
            appliedRemoteSnapshot = applyPendingRemoteVTTSnapshot();
            if (!appliedRemoteSnapshot) render();
        }
        if (rulerState && rulerState.dragging) {
            rulerState = null;
            renderStage();
        }

        if (panState) {
            panState = null;
            if (stageEl) stageEl.classList.remove('is-panning');
        }
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

        if (npcSearchOpen && !targetEl.closest('.vtt-popover-anchor') && !targetEl.closest('#vtt-npc-search-popover')) {
            closeNPCSearch();
            needsRender = true;
        }

        if (quickSpawnMenuState && !targetEl.closest('#vtt-quick-spawn-menu')) {
            quickSpawnMenuState = null;
            needsRender = true;
        }
        if (navMenuOpen && !targetEl.closest('.vtt-topbar-nav')) {
            navMenuOpen = false;
            needsRender = true;
        }
        if (viewMenuOpen && !targetEl.closest('.vtt-topbar-menu')) {
            viewMenuOpen = false;
            needsRender = true;
        }
        if (toolsMenuOpen && !targetEl.closest('.vtt-topbar-tools')) {
            toolsMenuOpen = false;
            needsRender = true;
        }
        if (initiativeDetailState && !targetEl.closest('#vtt-initiative-detail-panel') && !targetEl.closest('.vtt-entry')) {
            initiativeDetailState = null;
            needsRender = true;
        }
        if (tokenInspectorState
            && !targetEl.closest('#vtt-token-inspector-popover')
            && !targetEl.closest('.vtt-token')
            && !targetEl.closest('.vtt-map-note')) {
            tokenInspectorState = null;
            needsRender = true;
        }

        if (previewTokenId && !targetEl.closest('.vtt-token')) {
            previewTokenId = '';
            needsRender = true;
        }

        if (needsRender) render();
    };

    const handleStageWheel = (event) => {
        if (!stageEl) return;
        if (event.target instanceof Element && event.target.closest('#vtt-quick-spawn-menu')) return;
        event.preventDefault();
        const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (!Number.isFinite(dominantDelta) || dominantDelta === 0) return;
        const factor = Math.exp(-dominantDelta * 0.0015);
        const nextZoom = clampZoom(localView.zoom * factor);
        if (nextZoom === localView.zoom) return;
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
        const noteEl = getEvidenceNoteElementAtClientPoint(event.clientX, event.clientY, targetEl);
        if (noteEl) {
            const noteId = String(noteEl.getAttribute('data-note-id') || '').trim();
            if (!noteId) return;
            event.preventDefault();
            activateEvidenceNoteSelection(noteId);
            if (isDM()) {
                previewTokenId = '';
                openEvidenceNoteInspectorPopover(noteId, event.clientX, event.clientY);
            } else {
                closeTokenInspectorPopover();
            }
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderTokenInspectorPopover();
            renderToolsMenu();
            renderStage();
            return;
        }
        const tokenEl = targetEl.closest('.vtt-token');
        if (tokenEl) {
            const token = getTokenById(String(tokenEl.getAttribute('data-token-id') || ''));
            if (!token) return;

            event.preventDefault();
            activateTokenSelection(token.id);
            if (isDM()) {
                if (event.shiftKey && token.imageUrl) {
                    previewTokenId = previewTokenId === token.id ? '' : token.id;
                } else {
                    previewTokenId = '';
                    openTokenInspectorPopover(token.id, event.clientX, event.clientY);
                }
            } else if (token.imageUrl) {
                previewTokenId = previewTokenId === token.id ? '' : token.id;
            } else if (previewTokenId) {
                previewTokenId = '';
            }
            renderInitiativeList();
            renderInitiativeDetail();
            renderTokenInspector();
            renderTokenInspectorPopover();
            renderToolsMenu();
            renderStage();
            return;
        }
        if (localToolState.mode !== TOOL_MODE_NAVIGATE) {
            event.preventDefault();
            return;
        }
        if (previewTokenId) previewTokenId = '';
        if (!isDM()) {
            renderStage();
            return;
        }
        event.preventDefault();
        openQuickSpawnMenu(event.clientX, event.clientY);
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
        const target = event.target;
        if (
            target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || (target instanceof HTMLElement && target.isContentEditable)
        ) {
            return;
        }
        if (event.key === 'Escape') {
            const closedMenu = closeQuickSpawnMenu();
            const closedNavMenu = closeNavMenu();
            const closedViewMenu = closeViewMenu();
            const closedToolsMenu = closeToolsMenu();
            const clearedSpawn = clearSpawnDrag();
            const clearedTemplatePlacement = clearTemplatePlacementState();
            const closedInitiativeDetail = closeInitiativeDetail();
            const closedTokenInspector = closeTokenInspectorPopover();
            if (previewTokenId) {
                previewTokenId = '';
                renderStage();
                event.preventDefault();
            } else if (closedMenu || closedNavMenu || closedViewMenu || closedToolsMenu || clearedSpawn || clearedTemplatePlacement || closedInitiativeDetail || closedTokenInspector) {
                render();
                event.preventDefault();
            }
            return;
        }
        if (!selectedTokenId || event.defaultPrevented) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const selectedToken = getTokenById(selectedTokenId);
        if (!selectedToken || !canRoleMoveToken(selectedToken, localRole)) return;

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
        bindAccentControls();
        document.addEventListener('click', (event) => {
            const actionEl = event.target instanceof Element ? event.target.closest('[data-action]') : null;
            if (!actionEl) return;
            handleAction(actionEl);
        });
        document.addEventListener('pointerdown', handleDocumentPointerDown);
        document.addEventListener('keydown', handleDocumentKeyDown);
        document.addEventListener('input', handleFieldChange);
        document.addEventListener('change', handleFieldChange);
        if (dmUnlockFormEl) {
            dmUnlockFormEl.addEventListener('submit', (event) => {
                event.preventDefault();
                submitDMUnlockModal();
            });
        }
        if (npcSearchInputEl) npcSearchInputEl.addEventListener('input', handleNPCSearchInput);
        if (mapImageEl) mapImageEl.draggable = false;
        if (stageEl) stageEl.addEventListener('pointerdown', handleStagePointerDown);
        if (stageEl) stageEl.addEventListener('wheel', handleStageWheel, { passive: false });
        if (stageEl) stageEl.addEventListener('dragstart', handleStageDragStart);
        if (stageEl) stageEl.addEventListener('contextmenu', handleStageContextMenu);
        if (initiativeListEl) initiativeListEl.addEventListener('contextmenu', handleInitiativeContextMenu);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener(STORE_UPDATED_EVENT, handleStoreUpdate);
        window.addEventListener('storage', handleStorageEvent);
        window.addEventListener('resize', () => {
            if (fitViewOnNextMapLoad) {
                fitViewToWorld();
                renderQuickSpawnMenu();
                positionNPCSearchPopover();
                positionTokenInspectorPopover();
                positionInitiativeDetail();
                return;
            }
            applyWorldTransform();
            renderQuickSpawnMenu();
            renderSpawnGhost();
            positionNPCSearchPopover();
            positionTokenInspectorPopover();
            positionInitiativeDetail();
        });
        window.addEventListener('scroll', positionNPCSearchPopover, { passive: true });
        window.addEventListener('scroll', positionTokenInspectorPopover, { passive: true });
        if (sidebarEl) sidebarEl.addEventListener('scroll', positionNPCSearchPopover, { passive: true });
    };

    const init = async () => {
        const store = getStore();
        if (!store) {
            if (syncChipEl) syncChipEl.textContent = 'Unavailable';
            return;
        }

        if (window.RTF_DATA_LOADER && typeof window.RTF_DATA_LOADER.ensureDatasets === 'function') {
            try {
                await window.RTF_DATA_LOADER.ensureDatasets(['npcs']);
            } catch (err) {
                console.warn('Failed loading VTT preload datasets', err);
            }
        }

        bindEvents();
        loadRolePreference();
        loadUIPreferences();
        const initialSnapshot = readSharedVTTSnapshot({ syncRosterPresentation: false }) || deepClone(store.getVTTState(getActiveCaseId()));
        vttState = ensureRosterLinkedPlayerPresentationPersisted(initialSnapshot, { reason: 'roster-player-presentation-sync' }).snapshot;
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
