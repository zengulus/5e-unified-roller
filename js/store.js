(function (global) {
    const STORE_KEY = 'ravnica_unified_v1';
    const LEGACY_HUB_KEY = 'ravnicaHubV3_2';
    const LEGACY_BOARD_KEY = 'invBoardData';
    const DIRTY_SCOPES_KEY = 'ravnica_sync_dirty_scopes_v1';
    const SCOPE_BASELINES_KEY = 'ravnica_sync_scope_baselines_v1';
    const VTT_NPC_REFRESH_META_KEY = 'rtf_vtt_npc_refresh_meta_v1';

    const SYNC_CONFIG_KEY = 'ravnica_sync_config_v1';
    const SYNC_STATUS_EVENT = 'rtf-sync-status';
    const SYNC_CONFLICT_EVENT = 'rtf-sync-conflict';
    const STORE_UPDATED_EVENT = 'rtf-store-updated';
    const LEAD_STORAGE_KEY = 'rtf_lead_queue_v1';
    const VTT_LOCAL_PREFS_KEY = 'rtf_vtt_local_prefs_v1';
    const PREP_PROCEDURE_STATE_KEY = 'rtf_prep_procedure_state_v1';
    const CLOCKS_STORAGE_KEY = 'rtf_clocks_page_v1';
    const HEAT_SYNC_KEY = 'rtf_timeline_auto_heat';
    const HQ_LOCAL_STORAGE_KEY = 'task_force_hq_v1';
    const AUTO_CONNECT_CANCEL_KEY = 'rtf_sync_autoconnect_cancelled';
    const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const SHARED_SUPABASE_CLIENT_CACHE_KEY = '__RTF_SHARED_SUPABASE_CLIENT_CACHE__';
    const STORE_DEBUG = false;
    const BOARD_CODEC_MODULE_CACHE_KEY = '__RTF_BOARD_CODEC_MODULE_CACHE__';
    const VTT_CODEC_MODULE_CACHE_KEY = '__RTF_VTT_CODEC_MODULE_CACHE__';
    const BOARD_CHECKPOINT_FORMAT = 'yjs-board-update-v1';
    const VTT_CHECKPOINT_FORMAT = 'yjs-vtt-update-v1';

    const FALLBACK_GUILDS = [
        "Azorius",
        "Boros",
        "Dimir",
        "Golgari",
        "Gruul",
        "Izzet",
        "Orzhov",
        "Rakdos",
        "Selesnya",
        "Simic",
        "Guildless"
    ];

    const normalizeGuildName = (value) => String(value || '').trim();
    const logInfo = (...args) => {
        if (!STORE_DEBUG) return;
        console.log(...args);
    };
    const stableStringify = (value) => {
        if (value === null || value === undefined) return '';
        try {
            return JSON.stringify(value);
        } catch (err) {
            return '';
        }
    };
    const isExternalStoreUpdateSource = (value) => value === 'remote' || value === 'storage';
    const AUTH_SESSION_CACHE_MS = 30000;
    const getSharedSupabaseClientCache = () => {
        if (global[SHARED_SUPABASE_CLIENT_CACHE_KEY] instanceof Map) return global[SHARED_SUPABASE_CLIENT_CACHE_KEY];
        const cache = new Map();
        global[SHARED_SUPABASE_CLIENT_CACHE_KEY] = cache;
        return cache;
    };
    const buildSupabaseClientOptions = () => ({
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    const getSharedSupabaseClient = (supabaseLib, supabaseUrl, anonKey) => {
        const cache = getSharedSupabaseClientCache();
        const clientKey = `${supabaseUrl}|${anonKey}`;
        if (cache.has(clientKey)) return cache.get(clientKey);
        const client = supabaseLib.createClient(supabaseUrl, anonKey, buildSupabaseClientOptions());
        cache.set(clientKey, client);
        return client;
    };
    const importCachedModule = (globalKey, path) => {
        if (global[globalKey] && typeof global[globalKey].then === 'function') return global[globalKey];
        global[globalKey] = import(path).catch((err) => {
            try {
                delete global[globalKey];
            } catch (deleteErr) { }
            throw err;
        });
        return global[globalKey];
    };
    const isEncodedRoomCheckpointPayload = (value, format) => !!(
        value
        && typeof value === 'object'
        && String(value.format || '').trim() === format
        && typeof value.update === 'string'
    );

    const dedupeGuildNames = (source) => {
        const seen = new Set();
        const out = [];
        (Array.isArray(source) ? source : []).forEach((entry) => {
            const name = normalizeGuildName(entry);
            if (!name) return;
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(name);
        });
        return out;
    };

    const resolveDefaultGuildList = () => {
        if (typeof global.getRTFGuilds === 'function') {
            const byHelper = dedupeGuildNames(global.getRTFGuilds({ includeGuildless: true }));
            if (byHelper.length) return byHelper;
        }
        if (global.RTF_DATA && Array.isArray(global.RTF_DATA.guilds)) {
            const byData = dedupeGuildNames(global.RTF_DATA.guilds);
            if (byData.length) return byData;
        }
        if (Array.isArray(global.PRELOADED_GUILDS)) {
            const byPreload = dedupeGuildNames(global.PRELOADED_GUILDS);
            if (byPreload.length) return byPreload;
        }
        return FALLBACK_GUILDS.slice();
    };

    const buildRepMapFromGuilds = (guilds) => {
        const rep = Object.create(null);
        dedupeGuildNames(guilds).forEach((guild) => {
            if (guild === '__proto__' || guild === 'prototype' || guild === 'constructor') return;
            rep[guild] = 0;
        });
        if (!Object.keys(rep).length) rep[FALLBACK_GUILDS[0]] = 0;
        return rep;
    };

    const createDefaultHQState = () => {
        const baseId = 'floor_' + Math.random().toString(36).slice(2, 7);
        return {
            grid: { cols: 26, rows: 18, cell: 48 },
            snapToGrid: true,
            floors: [{ id: baseId, name: 'Street Level', rooms: [] }],
            activeFloorId: baseId
        };
    };

    const createDefaultLedgerState = () => ({
        entries: [],
        ui: {
            filter: 'all',
            search: '',
            sort: 'updated_desc'
        }
    });

    const DEFAULT_BOARD_STATE = {
        name: "UNNAMED CASE",
        nodes: [],
        connections: []
    };
    const DEFAULT_VTT_CELL_PX = 70;
    const VTT_ZONE_CATEGORY_META = Object.freeze({
        evidence: { label: 'Evidence', color: '#39b66b', defaultTitle: 'Evidence Zone' },
        clue: { label: 'Clue', color: '#58d4f7', defaultTitle: 'Clue Pin' },
        poi: { label: 'Point Of Interest', color: '#9b7cff', defaultTitle: 'Point Of Interest' },
        danger: { label: 'Danger', color: '#d85b5b', defaultTitle: 'Danger Zone' },
        objective: { label: 'Objective', color: '#f0b357', defaultTitle: 'Objective Zone' },
        exit: { label: 'Exit', color: '#70d98b', defaultTitle: 'Exit' },
        sound: { label: 'Sound', color: '#d6b4ff', defaultTitle: 'Sound Source' },
        cover: { label: 'Cover', color: '#7aa2f7', defaultTitle: 'Cover' },
        difficult: { label: 'Difficult Terrain', color: '#c9a45f', defaultTitle: 'Difficult Terrain' },
        obscured: { label: 'Obscured', color: '#8aa0aa', defaultTitle: 'Obscured Area' },
        hazard: { label: 'Hazard', color: '#f07178', defaultTitle: 'Hazard' },
        safe: { label: 'Safe Zone', color: '#5fd38d', defaultTitle: 'Safe Zone' },
        info: { label: 'Info', color: '#4f8dff', defaultTitle: 'Info Zone' },
        other: { label: 'Other', color: '#8f9aa8', defaultTitle: 'Zone' }
    });
    const DEFAULT_VTT_ZONE_CATEGORY = 'evidence';
    const getVTTZoneCategoryMeta = (category) => {
        const key = String(category || '').trim().toLowerCase();
        return VTT_ZONE_CATEGORY_META[key] || VTT_ZONE_CATEGORY_META[DEFAULT_VTT_ZONE_CATEGORY];
    };
    const normalizeVTTZoneCategory = (value, fallback = DEFAULT_VTT_ZONE_CATEGORY) => {
        const key = String(value || '').trim().toLowerCase();
        return VTT_ZONE_CATEGORY_META[key] ? key : fallback;
    };
    const VTT_TOKEN_COORD_PRECISION = 1000;
    const MIN_VTT_MAP_SCALE = 0.25;
    const MAX_VTT_MAP_SCALE = 4;
    function createDefaultVTTState() {
        return {
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
                    clocks: [],
                    pings: [],
                    fog: []
                }
            ],
            initiative: {
                entries: [],
                round: 1,
                activeEntryId: ''
            }
        };
    }
    const VTT_TOKEN_SIDES = new Set(['player', 'ally', 'enemy', 'neutral']);
    const VTT_TOKEN_MOVE_ACCESS = new Set(['dm', 'player']);
    const VTT_DEFENCE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const DEFAULT_CAMPAIGN_META_BOARD_STATE = {
        name: 'CAMPAIGN META BOARD',
        nodes: [],
        connections: []
    };
    const createDefaultCampaignMetaState = () => ({
        board: { ...DEFAULT_CAMPAIGN_META_BOARD_STATE },
        events: []
    });
    const DEFAULT_CASE_NAME = 'Primary Case';
    const DEFAULT_CAMPAIGN_SCOPE_NAME = 'Main Campaign';
    const DEFAULT_CAMPAIGN_SCOPE_ID = 'scope_primary';
    const CAMPAIGN_SCOPE_STATUSES = new Set(['planned', 'active', 'resolved']);
    const SYNC_SCOPE_GLOBAL = 'state';
    const SYNC_SCOPE_CASES_META = 'cases.meta';
    const SYNC_BACKEND_LEGACY = 'legacy';
    const SYNC_BACKEND_LEGACY_MIRROR = 'legacy_mirror';
    const SYNC_BACKEND_NORMALIZED = 'normalized';

    const DEFAULT_STATE = {
        meta: { version: 1, created: Date.now(), updated: 0, syncRevision: 0, scopeUpdated: {} },
        campaign: {
            rep: buildRepMapFromGuilds(resolveDefaultGuildList()),
            heat: 0,
            cognitiveRisk: 0,
            players: [],
            npcs: [],
            locations: [],
            requisitions: [],
            events: [],
            encounters: [],
            ledger: createDefaultLedgerState(),
            case: { title: "", guilds: "", goal: "", clock: "", obstacles: "", setPiece: "" }
        },
        board: { ...DEFAULT_BOARD_STATE },
        cases: {
            activeCaseId: 'case_primary',
            items: [
                {
                    id: 'case_primary',
                    name: DEFAULT_CASE_NAME,
                    board: { ...DEFAULT_BOARD_STATE },
                    events: [],
                    leads: [],
                    vtt: createDefaultVTTState()
                }
            ]
        },
        campaignContext: {
            activeScopeId: DEFAULT_CAMPAIGN_SCOPE_ID,
            scopes: [
                {
                    id: DEFAULT_CAMPAIGN_SCOPE_ID,
                    name: DEFAULT_CAMPAIGN_SCOPE_NAME,
                    description: '',
                    activeCaseId: 'case_primary',
                    caseOrder: ['case_primary'],
                    caseStatus: {
                        case_primary: 'active'
                    },
                    boardRefs: []
                }
            ]
        },
        campaignMeta: createDefaultCampaignMetaState(),
        hq: createDefaultHQState()
    };

    const DEFAULT_SYNC_CONFIG = {
        enabled: false,
        autoConnect: true,
        supabaseUrl: '',
        anonKey: '',
        campaignId: '',
        profileName: '',
        loginEmail: '',
        loginPassword: '',
        collabRelayUrl: '',
        backendMode: SYNC_BACKEND_LEGACY,
        schema: 'public',
        tableName: 'rtf_campaign_state',
        boardRoomsTable: 'rtf_board_rooms',
        boardHistoryTable: 'rtf_board_room_history',
        normalizedCoreTable: 'rtf_campaign_core',
        normalizedHQTable: 'rtf_campaign_hq',
        normalizedCaseStateTable: 'rtf_case_state',
        normalizedCaseBoardsTable: 'rtf_case_boards',
        normalizedCaseEventsTable: 'rtf_case_events',
        normalizedScopeVersionsTable: 'rtf_sync_scope_versions',
        normalizedPlayersTable: 'rtf_campaign_players',
        normalizedNPCsTable: 'rtf_campaign_npcs',
        normalizedLocationsTable: 'rtf_campaign_locations',
        normalizedRequisitionsTable: 'rtf_campaign_requisitions',
        normalizedEncountersTable: 'rtf_campaign_encounters',
        syncDelayMs: 1000,
        reconcileIntervalMs: 60000,
        presenceHeartbeatMs: 3000,
        lockTtlMs: 20000
    };
    const AUTO_SYNC_BOOT_DELAY_MS = 180;
    const NON_YJS_AUTO_SAVE_DELAY_MS = 3000;

    const REQUISITION_STATUSES = new Set(['Pending', 'Approved', 'In Transit', 'Delivered', 'Denied']);
    const REQUISITION_PRIORITIES = new Set(['Routine', 'Tactical', 'Emergency']);
    const ENCOUNTER_TIERS = new Set(['Routine', 'Standard', 'Elite', 'Boss']);
    const IMPACT_SEVERITIES = new Set(['low', 'moderate', 'high', 'critical']);
    const IMPACT_SCOPES = new Set(['local', 'district', 'guildwide', 'citywide']);
    const RELIABILITY_LEVELS = new Set(['unknown', 'rumored', 'corroborated', 'verified']);
    const LEDGER_STATUSES = new Set(['stable', 'contested', 'collapsed', 'resolved']);
    const LEDGER_SOURCE_TYPES = new Set(['event', 'theory', 'clue', 'npc', 'location', 'requisition', 'case', 'other']);
    const LEAD_TYPES = new Set(['npc', 'location', 'clue', 'event', 'requisition', 'theory', 'other']);
    const LEAD_STATUSES = new Set(['open', 'blocked', 'resolved', 'dead-end']);

    const deepClone = (value) => JSON.parse(JSON.stringify(value));

    const toNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const toNonNegativeInt = (value, fallback = 0) => {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, parsed);
    };

    const toTimestamp = (value, fallback = 0) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return fallback;
    };

    const toIsoString = (value, fallback = '') => {
        const parsed = toTimestamp(value, 0);
        if (!parsed) return fallback;
        try {
            return new Date(parsed).toISOString();
        } catch (err) {
            return fallback;
        }
    };

    const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
        if (value === null || value === undefined) return fallback;
        return String(value).slice(0, maxLen);
    };
    const toImageUrl = (value) => {
        const candidate = toTrimmedString(value, '', 4000).trim();
        if (!candidate) return '';

        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(candidate)) {
            return candidate;
        }

        try {
            const baseHref = global.location && typeof global.location.href === 'string'
                ? global.location.href
                : undefined;
            const parsed = baseHref ? new URL(candidate, baseHref) : new URL(candidate);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:' || parsed.protocol === 'blob:') {
                return parsed.href;
            }
        } catch (err) {
            return '';
        }

        return '';
    };
    const toSharedVTTMediaUrl = (value) => {
        const candidate = toTrimmedString(value, '', 4000).trim();
        if (!candidate) return '';

        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(candidate)) {
            return candidate;
        }

        try {
            const baseHref = global.location && typeof global.location.href === 'string'
                ? global.location.href
                : undefined;
            const parsed = baseHref ? new URL(candidate, baseHref) : new URL(candidate);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return parsed.href;
            }
        } catch (err) {
            return '';
        }

        return '';
    };

    const toBoolean = (value) => !!value;

    const clampPercent = (value, fallback = 50) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(fallback)));
        return Math.max(0, Math.min(100, Math.round(parsed)));
    };

    const clampMapScale = (value, fallback = 1) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return Math.max(MIN_VTT_MAP_SCALE, Math.min(MAX_VTT_MAP_SCALE, fallback));
        return Math.max(MIN_VTT_MAP_SCALE, Math.min(MAX_VTT_MAP_SCALE, Math.round(parsed * 1000) / 1000));
    };

    const normalizeEnumToken = (value) => String(value || '').trim().toLowerCase();
    const sanitizeImpactSeverity = (value, fallback = 'moderate') => {
        const token = normalizeEnumToken(value);
        return IMPACT_SEVERITIES.has(token) ? token : fallback;
    };
    const sanitizeImpactScope = (value, fallback = 'local') => {
        const token = normalizeEnumToken(value);
        return IMPACT_SCOPES.has(token) ? token : fallback;
    };
    const sanitizeReliability = (value, fallback = 'unknown') => {
        const token = normalizeEnumToken(value);
        return RELIABILITY_LEVELS.has(token) ? token : fallback;
    };
    const sanitizeLedgerStatus = (value, fallback = 'stable') => {
        const token = normalizeEnumToken(value);
        return LEDGER_STATUSES.has(token) ? token : fallback;
    };
    const sanitizeLedgerSourceType = (value, fallback = 'other') => {
        const token = normalizeEnumToken(value);
        const normalized = (token === 'manual')
            ? 'other'
            : (token === 'person' ? 'npc' : token);
        if (LEDGER_SOURCE_TYPES.has(normalized)) return normalized;
        return LEDGER_SOURCE_TYPES.has(fallback) ? fallback : 'other';
    };
    const sanitizeAttributionBy = (value, fallback = '') => toTrimmedString(value, fallback, 120).trim();
    const sanitizeAttributionAt = (value, fallback = '') => toIsoString(value, fallback);

    const buildEntityId = (prefix = 'entry', index = 0, bump = 0) => {
        const cleanPrefix = String(prefix || 'entry')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 12) || 'entry';
        const indexToken = Math.max(0, toNonNegativeInt(index, 0)).toString(36);
        const bumpToken = Math.max(0, toNonNegativeInt(bump, 0)).toString(36);
        return `${cleanPrefix}_${Date.now().toString(36)}_${indexToken}${Math.random().toString(36).slice(2, 7)}${bump ? '_' + bumpToken : ''}`;
    };

    const sanitizePatch = (raw, schema) => {
        const source = raw && typeof raw === 'object' ? raw : null;
        if (!source || !schema || typeof schema !== 'object') return null;

        const out = {};
        Object.keys(schema).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(source, key)) return;
            const sanitizer = schema[key];
            if (typeof sanitizer !== 'function') return;
            out[key] = sanitizer(source[key]);
        });

        return Object.keys(out).length ? out : null;
    };

    const sanitizeIdentifier = (value, fallback) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return fallback;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
        return fallback;
    };

    const sanitizeCampaignId = (value) => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!raw) return '';
        return raw.replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 80);
    };

    const sanitizeProfileName = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        return raw.slice(0, 48);
    };

    const sanitizeCase = (caseData) => {
        const base = DEFAULT_STATE.campaign.case;
        const source = caseData && typeof caseData === 'object' ? caseData : {};
        return {
            title: typeof source.title === 'string' ? source.title : base.title,
            guilds: typeof source.guilds === 'string' ? source.guilds : base.guilds,
            goal: typeof source.goal === 'string' ? source.goal : base.goal,
            clock: typeof source.clock === 'string' ? source.clock : base.clock,
            obstacles: typeof source.obstacles === 'string' ? source.obstacles : base.obstacles,
            setPiece: typeof source.setPiece === 'string' ? source.setPiece : base.setPiece
        };
    };

    const sanitizeRep = (rep) => {
        const source = rep && typeof rep === 'object' ? rep : {};
        const mergedKeys = [
            ...Object.keys(DEFAULT_STATE.campaign.rep),
            ...resolveDefaultGuildList(),
            ...Object.keys(source)
        ];
        const normalized = buildRepMapFromGuilds(mergedKeys);
        Object.keys(normalized).forEach((guild) => {
            const fallback = toNumber(DEFAULT_STATE.campaign.rep[guild], 0);
            normalized[guild] = toNumber(source[guild], fallback);
        });
        return normalized;
    };

    const sanitizePlayerHp = (value, fallback = '10') => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.min(999999, Math.round(value)));
        }
        return toTrimmedString(value, fallback, 40);
    };

    const sanitizePlayer = (player, idx = 0) => {
        const source = player && typeof player === 'object' ? player : {};
        const fallbackId = buildEntityId('player', idx);
        return {
            id: toTrimmedString(source.id, fallbackId, 80).trim() || fallbackId,
            name: toTrimmedString(source.name || 'New Agent', 'New Agent', 160),
            sheetKey: toTrimmedString(source.sheetKey, '', 120).trim(),
            ac: Math.max(0, Math.min(999, Math.round(toNumber(source.ac, 10)))),
            init: Math.max(-99, Math.min(999, Math.round(toNumber(source.init, 0)))),
            hp: sanitizePlayerHp(source.hp, '10'),
            pp: Math.max(0, Math.min(999, Math.round(toNumber(source.pp, 10)))),
            dc: Math.max(0, Math.min(999, Math.round(toNumber(source.dc, 10)))),
            dp: Math.max(0, Math.min(4, Math.round(toNumber(source.dp, 2)))),
            projectClock: Math.max(0, Math.min(6, Math.round(toNumber(source.projectClock, 0)))),
            projectName: toTrimmedString(source.projectName, '', 240),
            projectReward: toTrimmedString(source.projectReward, '', 240),
            imageUrl: toSharedVTTMediaUrl(source.imageUrl)
        };
    };

    const sanitizeCampaign = (campaign) => {
        const source = campaign && typeof campaign === 'object' ? campaign : {};
        return {
            rep: sanitizeRep(source.rep),
            heat: toNumber(source.heat, 0),
            cognitiveRisk: toNumber(source.cognitiveRisk, 0),
            players: Array.isArray(source.players) ? source.players.map((entry, idx) => sanitizePlayer(entry, idx)) : [],
            npcs: Array.isArray(source.npcs) ? source.npcs : [],
            locations: Array.isArray(source.locations) ? source.locations : [],
            requisitions: Array.isArray(source.requisitions) ? source.requisitions : [],
            events: sanitizeEventList(source.events),
            encounters: Array.isArray(source.encounters) ? source.encounters : [],
            ledger: sanitizeLedgerState(source.ledger),
            case: sanitizeCase(source.case)
        };
    };

    const sanitizeVTTDefences = (value) => {
        const source = value && typeof value === 'object' ? value : {};
        const out = {};
        VTT_DEFENCE_KEYS.forEach((key) => {
            const raw = source[key];
            if (raw === null || raw === undefined || raw === '') {
                out[key] = null;
                return;
            }
            out[key] = Math.max(0, Math.min(99, Math.round(toNumber(raw, 0))));
        });
        return out;
    };

    const sanitizeVTTVision = (vision) => {
        const source = vision && typeof vision === 'object' ? vision : {};
        return {
            enabled: source.enabled !== undefined ? !!source.enabled : true,
            facingDeg: Math.round(toNumber(source.facingDeg, 0)),
            arcDeg: Math.max(0, Math.min(360, Math.round(toNumber(source.arcDeg, 90)))),
            baseRangeCells: Math.max(0, Math.min(999, Math.round(toNumber(source.baseRangeCells, 6)))),
            passivePerception: Math.max(0, Math.min(99, Math.round(toNumber(source.passivePerception, 10))))
        };
    };

    const sanitizeVTTConditions = (conditions) => (
        Array.isArray(conditions)
            ? conditions
                .map((entry) => toTrimmedString(entry, '', 80).trim())
                .filter(Boolean)
                .slice(0, 24)
            : []
    );

    const sanitizeVTTColor = (value, fallback = '#4f8dff') => {
        const clean = toTrimmedString(value, fallback, 20).trim();
        return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean : fallback;
    };

    const sanitizeVTTTokenMoodEmoji = (value) => toTrimmedString(value, '', 16).trim();
    const sanitizeVTTTokenMoodLabel = (value) => toTrimmedString(value, '', 40).trim();

    const sanitizeVTTGrid = (grid) => {
        const source = grid && typeof grid === 'object' ? grid : {};
        return {
            cellPx: Math.max(24, Math.min(240, Math.round(toNumber(source.cellPx, DEFAULT_VTT_CELL_PX)))),
            offsetX: Math.round(toNumber(source.offsetX, 0)),
            offsetY: Math.round(toNumber(source.offsetY, 0)),
            cellDistance: Math.max(1, Math.min(1000, Math.round(toNumber(source.cellDistance, 5))))
        };
    };

    const sanitizeVTTTokenCoordinate = (value, fallback = 0) => {
        const parsed = toNumber(value, fallback);
        return Math.max(0, Math.round(parsed * VTT_TOKEN_COORD_PRECISION) / VTT_TOKEN_COORD_PRECISION);
    };

    const sanitizeVTTTokenMoveAccess = (value, fallback = 'dm') => {
        const clean = toTrimmedString(value, fallback, 20).trim().toLowerCase();
        return VTT_TOKEN_MOVE_ACCESS.has(clean) ? clean : (fallback === 'player' ? 'player' : 'dm');
    };

    const sanitizeVTTMonsterRollOverrides = (value) => {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return Object.entries(source).slice(0, 80).reduce((acc, [rawKey, rawOverride]) => {
            const key = toTrimmedString(rawKey, '', 160).trim();
            const override = rawOverride && typeof rawOverride === 'object' && !Array.isArray(rawOverride) ? rawOverride : {};
            if (!key) return acc;
            const label = toTrimmedString(override.label, '', 160).trim();
            const formula = toTrimmedString(override.formula, '', 160).trim();
            const type = toTrimmedString(override.type, '', 30).trim();
            const detail = toTrimmedString(override.detail, '', 1000).trim();
            if (!label && !formula && !type && !detail) return acc;
            acc[key] = { label, formula, type, detail };
            return acc;
        }, {});
    };

    const sanitizeVTTToken = (token, idx = 0) => {
        const source = token && typeof token === 'object' ? token : {};
        const id = toTrimmedString(source.id, `token_${idx + 1}`, 120).trim() || `token_${idx + 1}`;
        const cleanSide = toTrimmedString(source.side, 'neutral', 20).trim().toLowerCase();
        const cleanSourceType = toTrimmedString(source.sourceType, '', 40).trim();
        const hasHpCurrent = source.hpCurrent !== null && source.hpCurrent !== undefined && source.hpCurrent !== '';
        const hasHpMax = source.hpMax !== null && source.hpMax !== undefined && source.hpMax !== '';
        const hasAc = source.ac !== null && source.ac !== undefined && source.ac !== '';
        const hasPassivePerception = source.passivePerception !== null && source.passivePerception !== undefined && source.passivePerception !== '';
        const rawStealthRoll = source.stealthRoll !== undefined ? source.stealthRoll : source.stealthDc;
        const hasStealthRoll = rawStealthRoll !== null && rawStealthRoll !== undefined && rawStealthRoll !== '';
        return {
            id,
            label: toTrimmedString(source.label, `Token ${idx + 1}`, 160).trim() || `Token ${idx + 1}`,
            side: VTT_TOKEN_SIDES.has(cleanSide) ? cleanSide : 'neutral',
            imageUrl: toSharedVTTMediaUrl(source.imageUrl),
            x: sanitizeVTTTokenCoordinate(source.x, idx * 2),
            y: sanitizeVTTTokenCoordinate(source.y, 0),
            w: Math.max(1, Math.round(toNumber(source.w, 1))),
            h: Math.max(1, Math.round(toNumber(source.h, 1))),
            sourceType: cleanSourceType,
            sourceId: toTrimmedString(source.sourceId, '', 120).trim(),
            moveAccess: sanitizeVTTTokenMoveAccess(source.moveAccess, cleanSourceType === 'player' ? 'player' : 'dm'),
            hpCurrent: hasHpCurrent ? Math.max(0, Math.min(999999, Math.round(toNumber(source.hpCurrent, 0)))) : null,
            hpMax: hasHpMax ? Math.max(0, Math.min(999999, Math.round(toNumber(source.hpMax, 0)))) : null,
            ac: hasAc ? Math.max(0, Math.min(99, Math.round(toNumber(source.ac, 0)))) : null,
            passivePerception: hasPassivePerception ? Math.max(0, Math.min(99, Math.round(toNumber(source.passivePerception, 10)))) : null,
            defences: sanitizeVTTDefences(source.defences),
            conditions: sanitizeVTTConditions(source.conditions),
            moodEmoji: sanitizeVTTTokenMoodEmoji(source.moodEmoji),
            moodLabel: sanitizeVTTTokenMoodLabel(source.moodLabel),
            hidden: !!source.hidden,
            stealthRoll: hasStealthRoll ? Math.max(0, Math.min(99, Math.round(toNumber(rawStealthRoll, 10)))) : null,
            vision: sanitizeVTTVision(source.vision),
            monsterRollOverrides: sanitizeVTTMonsterRollOverrides(source.monsterRollOverrides)
        };
    };

    const buildVTTFogCellId = (col, row) => `fog_${Math.round(toNumber(col, 0))}_${Math.round(toNumber(row, 0))}`;

    const sanitizeVTTFogCell = (cell, idx = 0) => {
        const source = cell && typeof cell === 'object' ? cell : {};
        const col = Math.round(toNumber(source.col, 0));
        const row = Math.round(toNumber(source.row, 0));
        return {
            id: toTrimmedString(source.id, buildVTTFogCellId(col, row) || `fog_${idx + 1}`, 120).trim() || buildVTTFogCellId(col, row) || `fog_${idx + 1}`,
            col,
            row
        };
    };

    const sanitizeVTTFogMask = (mask, idx = 0) => {
        const source = mask && typeof mask === 'object' ? mask : {};
        return {
            id: toTrimmedString(source.id, `fog_${idx + 1}`, 120).trim() || `fog_${idx + 1}`,
            x: Math.round(toNumber(source.x, 0)),
            y: Math.round(toNumber(source.y, 0)),
            w: Math.max(1, Math.round(toNumber(source.w, 1))),
            h: Math.max(1, Math.round(toNumber(source.h, 1)))
        };
    };

    const sanitizeVTTFogEntries = (entries, grid, legacyScaleFactor = 1) => {
        if (!Array.isArray(entries) || !entries.length) return [];
        const cellPx = Math.max(1, toNumber(grid && grid.cellPx, DEFAULT_VTT_CELL_PX));
        const offsetX = Math.round(toNumber(grid && grid.offsetX, 0));
        const offsetY = Math.round(toNumber(grid && grid.offsetY, 0));
        const cells = new Map();
        entries.forEach((entry, entryIdx) => {
            const source = entry && typeof entry === 'object' ? entry : {};
            if (source.col !== undefined || source.row !== undefined) {
                const cell = sanitizeVTTFogCell(source, entryIdx);
                cells.set(`${cell.col},${cell.row}`, {
                    ...cell,
                    id: buildVTTFogCellId(cell.col, cell.row)
                });
                return;
            }
            const mask = sanitizeVTTFogMask(source, entryIdx);
            const scaledMask = {
                ...mask,
                x: Math.round(mask.x * legacyScaleFactor),
                y: Math.round(mask.y * legacyScaleFactor),
                w: Math.max(1, Math.round(mask.w * legacyScaleFactor)),
                h: Math.max(1, Math.round(mask.h * legacyScaleFactor))
            };
            const left = Math.round((scaledMask.x - offsetX) / cellPx);
            const top = Math.round((scaledMask.y - offsetY) / cellPx);
            const widthCells = Math.max(1, Math.round(Math.max(1, scaledMask.w) / cellPx));
            const heightCells = Math.max(1, Math.round(Math.max(1, scaledMask.h) / cellPx));
            for (let row = top; row < top + heightCells; row += 1) {
                for (let col = left; col < left + widthCells; col += 1) {
                    cells.set(`${col},${row}`, {
                        id: buildVTTFogCellId(col, row),
                        col,
                        row
                    });
                }
            }
        });
        return Array.from(cells.values()).sort((left, right) => left.row - right.row || left.col - right.col);
    };

    const sanitizeVTTTemplate = (template, idx = 0) => {
        const source = template && typeof template === 'object' ? template : {};
        const kind = toTrimmedString(source.kind, 'circle', 20).trim().toLowerCase() === 'cone' ? 'cone' : 'circle';
        return {
            id: toTrimmedString(source.id, `template_${idx + 1}`, 120).trim() || `template_${idx + 1}`,
            kind,
            x: sanitizeVTTTokenCoordinate(source.x, 0.5),
            y: sanitizeVTTTokenCoordinate(source.y, 0.5),
            sizeCells: Math.max(1, Math.min(99, Math.round(toNumber(source.sizeCells, 4)))),
            angleDeg: Math.round(toNumber(source.angleDeg, 0)),
            expiresAt: Math.max(0, Math.round(toNumber(source.expiresAt, 0)))
        };
    };

    const sanitizeVTTEvidenceNote = (note, idx = 0) => {
        const source = note && typeof note === 'object' ? note : {};
        const category = normalizeVTTZoneCategory(source.category);
        const categoryMeta = getVTTZoneCategoryMeta(category);
        const highlightColor = categoryMeta.color;
        const defaultTitle = categoryMeta.defaultTitle || 'Zone';
        return {
            id: toTrimmedString(source.id, `evidence_${idx + 1}`, 120).trim() || `evidence_${idx + 1}`,
            category,
            title: toTrimmedString(source.title, defaultTitle, 160).trim() || defaultTitle,
            body: toTrimmedString(source.body, '', 6000).trim(),
            x: Math.round(toNumber(source.x, 0)),
            y: Math.round(toNumber(source.y, 0)),
            w: Math.max(1, Math.round(toNumber(source.w, 1))),
            h: Math.max(1, Math.round(toNumber(source.h, 1))),
            hidden: source.hidden !== undefined ? !!source.hidden : !(source.visibleToPlayers !== undefined ? !!source.visibleToPlayers : true),
            highlightColor
        };
    };

    const sanitizeVTTClock = (clock, idx = 0) => {
        const source = clock && typeof clock === 'object' ? clock : {};
        const id = toTrimmedString(source.id, `clock_${idx + 1}`, 120).trim() || `clock_${idx + 1}`;
        const max = Math.max(1, Math.min(20, Math.round(toNumber(source.max, 4))));
        const current = Math.max(0, Math.min(max, Math.round(toNumber(source.current, 0))));
        return {
            id,
            title: toTrimmedString(source.title, `Clock ${idx + 1}`, 120).trim() || `Clock ${idx + 1}`,
            current,
            max,
            hidden: !!source.hidden,
            color: sanitizeVTTColor(source.color, '#f0b357'),
            note: toTrimmedString(source.note, '', 240).trim()
        };
    };

    const sanitizeVTTPing = (ping, idx = 0) => {
        const source = ping && typeof ping === 'object' ? ping : {};
        return {
            id: toTrimmedString(source.id, `ping_${idx + 1}`, 120).trim() || `ping_${idx + 1}`,
            x: Math.round(toNumber(source.x, 0)),
            y: Math.round(toNumber(source.y, 0)),
            label: toTrimmedString(source.label, 'Ping', 80).trim() || 'Ping',
            color: sanitizeVTTColor(source.color, '#4f8dff'),
            createdAt: Math.max(0, Math.round(toNumber(source.createdAt, 0))),
            expiresAt: Math.max(0, Math.round(toNumber(source.expiresAt, 0)))
        };
    };

    const sanitizeVTTScene = (scene, idx = 0) => {
        const source = scene && typeof scene === 'object' ? scene : {};
        const id = toTrimmedString(source.id, `scene_${idx + 1}`, 120).trim() || `scene_${idx + 1}`;
        const legacyGrid = sanitizeVTTGrid(source.grid);
        const legacyScaleFactor = clampMapScale(DEFAULT_VTT_CELL_PX / Math.max(24, legacyGrid.cellPx || DEFAULT_VTT_CELL_PX), 1);
        const baseScale = clampMapScale(source.mapScale, 1);
        return {
            id,
            name: toTrimmedString(source.name, `Scene ${idx + 1}`, 160).trim() || `Scene ${idx + 1}`,
            mapImageUrl: toSharedVTTMediaUrl(source.mapImageUrl),
            mapScale: clampMapScale(baseScale * legacyScaleFactor, legacyScaleFactor),
            grid: {
                cellPx: DEFAULT_VTT_CELL_PX,
                offsetX: Math.round(legacyGrid.offsetX * legacyScaleFactor),
                offsetY: Math.round(legacyGrid.offsetY * legacyScaleFactor),
                cellDistance: legacyGrid.cellDistance
            },
            stealthMode: !!source.stealthMode,
            tokens: Array.isArray(source.tokens) ? source.tokens.map((tokenEntry, tokenIdx) => sanitizeVTTToken(tokenEntry, tokenIdx)) : [],
            templates: Array.isArray(source.templates) ? source.templates.map((templateEntry, templateIdx) => sanitizeVTTTemplate(templateEntry, templateIdx)) : [],
            evidenceNotes: Array.isArray(source.evidenceNotes)
                ? source.evidenceNotes.map((noteEntry, noteIdx) => {
                    const note = sanitizeVTTEvidenceNote(noteEntry, noteIdx);
                    return {
                        ...note,
                        x: Math.round(note.x * legacyScaleFactor),
                        y: Math.round(note.y * legacyScaleFactor),
                        w: Math.max(1, Math.round(note.w * legacyScaleFactor)),
                        h: Math.max(1, Math.round(note.h * legacyScaleFactor))
                    };
                })
                : [],
            clocks: Array.isArray(source.clocks)
                ? source.clocks.map((clockEntry, clockIdx) => sanitizeVTTClock(clockEntry, clockIdx))
                : [],
            pings: Array.isArray(source.pings)
                ? source.pings.map((pingEntry, pingIdx) => sanitizeVTTPing(pingEntry, pingIdx)).slice(-24)
                : [],
            fog: sanitizeVTTFogEntries(source.fog, {
                cellPx: DEFAULT_VTT_CELL_PX,
                offsetX: Math.round(legacyGrid.offsetX * legacyScaleFactor),
                offsetY: Math.round(legacyGrid.offsetY * legacyScaleFactor)
            }, legacyScaleFactor)
        };
    };

    const sanitizeVTTInitiativeEntry = (entry, idx = 0) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const id = toTrimmedString(source.id, `init_${idx + 1}`, 120).trim() || `init_${idx + 1}`;
        const cleanSide = toTrimmedString(source.side, 'neutral', 20).trim().toLowerCase();
        const hasHpCurrent = source.hpCurrent !== null && source.hpCurrent !== undefined && source.hpCurrent !== '';
        const hasHpMax = source.hpMax !== null && source.hpMax !== undefined && source.hpMax !== '';
        const hasAc = source.ac !== null && source.ac !== undefined && source.ac !== '';
        const hasPassivePerception = source.passivePerception !== null && source.passivePerception !== undefined && source.passivePerception !== '';
        const rawStealthRoll = source.stealthRoll !== undefined ? source.stealthRoll : source.stealthDc;
        const hasStealthRoll = rawStealthRoll !== null && rawStealthRoll !== undefined && rawStealthRoll !== '';
        return {
            id,
            name: toTrimmedString(source.name, `Combatant ${idx + 1}`, 160).trim() || `Combatant ${idx + 1}`,
            linkedTokenId: toTrimmedString(source.linkedTokenId, '', 120).trim(),
            side: VTT_TOKEN_SIDES.has(cleanSide) ? cleanSide : 'neutral',
            imageUrl: toSharedVTTMediaUrl(source.imageUrl),
            sourceType: toTrimmedString(source.sourceType, '', 40).trim(),
            sourceId: toTrimmedString(source.sourceId, '', 120).trim(),
            total: Math.max(-999, Math.min(999, Math.round(toNumber(source.total, 0)))),
            tie: Math.max(0, Math.min(99, Math.round(toNumber(source.tie, 10)))),
            hpCurrent: hasHpCurrent ? Math.max(0, Math.min(999999, Math.round(toNumber(source.hpCurrent, 0)))) : null,
            hpMax: hasHpMax ? Math.max(0, Math.min(999999, Math.round(toNumber(source.hpMax, 0)))) : null,
            ac: hasAc ? Math.max(0, Math.min(99, Math.round(toNumber(source.ac, 0)))) : null,
            passivePerception: hasPassivePerception ? Math.max(0, Math.min(99, Math.round(toNumber(source.passivePerception, 10)))) : null,
            stealthRoll: hasStealthRoll ? Math.max(0, Math.min(99, Math.round(toNumber(rawStealthRoll, 10)))) : null,
            defences: sanitizeVTTDefences(source.defences),
            reactionUsed: !!source.reactionUsed,
            concentrating: !!source.concentrating,
            hidden: !!source.hidden,
            conditions: sanitizeVTTConditions(source.conditions)
        };
    };

    const sortVTTInitiativeEntries = (entries) => {
        if (!Array.isArray(entries)) return;
        entries.sort((left, right) =>
            (Number(right && right.total || 0) - Number(left && left.total || 0))
            || (Number(right && right.tie || 0) - Number(left && left.tie || 0))
            || String(left && left.name || '').localeCompare(String(right && right.name || ''))
        );
    };

    const sanitizeVTTState = (value) => {
        const base = createDefaultVTTState();
        const source = value && typeof value === 'object' ? value : {};
        const scenes = Array.isArray(source.scenes) && source.scenes.length
            ? source.scenes.map((sceneEntry, idx) => sanitizeVTTScene(sceneEntry, idx))
            : base.scenes;
        const activeSceneIdRaw = toTrimmedString(source.activeSceneId, scenes[0] && scenes[0].id ? scenes[0].id : 'scene_1', 120).trim();
        const entries = Array.isArray(source.initiative && source.initiative.entries)
            ? source.initiative.entries.map((entry, idx) => sanitizeVTTInitiativeEntry(entry, idx))
            : [];
        const activeEntryIdRaw = toTrimmedString(source.initiative && source.initiative.activeEntryId, '', 120).trim();
        return {
            updatedAt: Math.max(0, toNonNegativeInt(source.updatedAt, base.updatedAt)),
            activeSceneId: scenes.some((scene) => scene.id === activeSceneIdRaw) ? activeSceneIdRaw : scenes[0].id,
            scenes,
            initiative: {
                entries,
                round: Math.max(1, Math.min(100000, Math.round(toNumber(source.initiative && source.initiative.round, 1)))),
                activeEntryId: entries.some((entry) => entry.id === activeEntryIdRaw) ? activeEntryIdRaw : ''
            }
        };
    };

    const sanitizeBoard = (board) => {
        const source = board && typeof board === 'object' ? board : {};
        const clean = {
            name: typeof source.name === 'string' && source.name ? source.name : DEFAULT_BOARD_STATE.name,
            nodes: Array.isArray(source.nodes) ? source.nodes : [],
            connections: Array.isArray(source.connections) ? source.connections : []
        };
        const updatedAt = Math.max(0, parseInt(source.updatedAt, 10) || 0);
        const scope = String(source.scope || '').trim().toLowerCase();
        const caseId = typeof source.caseId === 'string' ? source.caseId.trim() : '';
        if (updatedAt) clean.updatedAt = updatedAt;
        if (scope === 'campaign' || scope === 'case') clean.scope = scope;
        if (caseId) clean.caseId = caseId;
        return clean;
    };
    const sanitizeBoardHistoryReason = (value, fallback = 'snapshot') => {
        const clean = toTrimmedString(value, fallback, 80).trim().toLowerCase();
        return clean || fallback;
    };
    const buildBoardRoomId = (scope = 'case', caseId = 'case_primary') => {
        const cleanScope = String(scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
        if (cleanScope === 'campaign') return 'campaign:meta';
        return `case:${sanitizeCaseId(caseId, 'case_primary')}`;
    };
    const buildBoardRoomLabel = (scope = 'case', caseId = '', fallbackName = '') => {
        const cleanScope = String(scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
        if (cleanScope === 'campaign') return 'Campaign Meta Board';
        const cleanName = sanitizeCaseName(fallbackName, '');
        if (cleanName) return `Case Board: ${cleanName}`;
        return `Case Board: ${sanitizeCaseId(caseId, 'case_primary')}`;
    };
    const buildBoardRoomChannelName = (campaignId, roomId) => `rtf-board-${campaignId}-${roomId}`;
    const buildVTTRoomId = (caseId = 'case_primary') => `vtt:case:${sanitizeCaseId(caseId, 'case_primary')}`;
    const buildVTTRoomChannelName = (campaignId, roomId) => `rtf-vtt-${campaignId}-${roomId}`;
    const compareRoomSnapshotVersion = (leftRevision, leftUpdatedBy, rightRevision, rightUpdatedBy) => {
        const cleanLeftRevision = Math.max(0, toNonNegativeInt(leftRevision, 0));
        const cleanRightRevision = Math.max(0, toNonNegativeInt(rightRevision, 0));
        if (cleanLeftRevision !== cleanRightRevision) return cleanLeftRevision - cleanRightRevision;
        const cleanLeftUpdatedBy = toTrimmedString(leftUpdatedBy, '', 120).trim();
        const cleanRightUpdatedBy = toTrimmedString(rightUpdatedBy, '', 120).trim();
        if (cleanLeftUpdatedBy && cleanRightUpdatedBy) {
            return cleanLeftUpdatedBy.localeCompare(cleanRightUpdatedBy);
        }
        if (cleanLeftUpdatedBy) return 1;
        if (cleanRightUpdatedBy) return -1;
        return 0;
    };
    const decodeBoardRoomCheckpointPayload = async (payload, scope = 'case', caseId = '') => {
        if (!isEncodedRoomCheckpointPayload(payload, BOARD_CHECKPOINT_FORMAT)) return sanitizeBoard(payload);
        try {
            const module = await importCachedModule(BOARD_CODEC_MODULE_CACHE_KEY, './board-collab.js');
            if (module && typeof module.decodeBoardCheckpointToSnapshot === 'function') {
                return sanitizeBoard(module.decodeBoardCheckpointToSnapshot(payload, { scope, caseId }));
            }
        } catch (err) {
            console.warn('RTF_STORE: Failed importing board checkpoint codec', err);
        }
        return sanitizeBoard(null);
    };
    const encodeBoardRoomCheckpointPayload = async (payload, scope = 'case', caseId = '') => {
        if (isEncodedRoomCheckpointPayload(payload, BOARD_CHECKPOINT_FORMAT)) return payload;
        try {
            const module = await importCachedModule(BOARD_CODEC_MODULE_CACHE_KEY, './board-collab.js');
            if (module && typeof module.exportBoardCheckpointFromSnapshot === 'function') {
                return module.exportBoardCheckpointFromSnapshot(payload, scope, caseId);
            }
        } catch (err) {
            console.warn('RTF_STORE: Failed importing board checkpoint encoder', err);
        }
        return null;
    };
    const decodeVTTRoomCheckpointPayload = async (payload, caseId = '') => {
        if (!isEncodedRoomCheckpointPayload(payload, VTT_CHECKPOINT_FORMAT)) return sanitizeVTTState(payload);
        try {
            const module = await importCachedModule(VTT_CODEC_MODULE_CACHE_KEY, './vtt-collab.js');
            if (module && typeof module.decodeVTTCheckpointToSnapshot === 'function') {
                return sanitizeVTTState(module.decodeVTTCheckpointToSnapshot(payload, sanitizeVTTState));
            }
        } catch (err) {
            console.warn('RTF_STORE: Failed importing VTT checkpoint codec', err);
        }
        return sanitizeVTTState(null);
    };
    const encodeVTTRoomCheckpointPayload = async (payload) => {
        if (isEncodedRoomCheckpointPayload(payload, VTT_CHECKPOINT_FORMAT)) return payload;
        try {
            const module = await importCachedModule(VTT_CODEC_MODULE_CACHE_KEY, './vtt-collab.js');
            if (module && typeof module.exportVTTCheckpointFromSnapshot === 'function') {
                return module.exportVTTCheckpointFromSnapshot(payload, sanitizeVTTState);
            }
        } catch (err) {
            console.warn('RTF_STORE: Failed importing VTT checkpoint encoder', err);
        }
        return null;
    };
    const deleteIndexedDbDatabase = (name) => new Promise((resolve) => {
        if (!name || typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.deleteDatabase !== 'function') {
            resolve({ ok: false, reason: 'unavailable' });
            return;
        }
        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve({ ok: true });
            request.onerror = () => resolve({
                ok: false,
                reason: 'delete-failed',
                error: request.error && request.error.message ? request.error.message : 'IndexedDB delete failed.'
            });
            request.onblocked = () => resolve({
                ok: false,
                reason: 'blocked',
                error: 'IndexedDB delete blocked by another open tab.'
            });
        } catch (err) {
            resolve({
                ok: false,
                reason: 'delete-failed',
                error: err && err.message ? err.message : 'IndexedDB delete failed.'
            });
        }
    });
    const sanitizeCampaignMeta = (meta) => {
        const source = meta && typeof meta === 'object' ? meta : {};
        const defaults = createDefaultCampaignMetaState();
        return {
            board: sanitizeBoard({
                ...defaults.board,
                ...(source.board && typeof source.board === 'object' ? source.board : {})
            }),
            events: sanitizeEventList(source.events)
        };
    };

    const sanitizeCaseId = (value, fallback = 'case') => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const cleaned = raw
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);
        if (cleaned) return cleaned;
        return sanitizeCaseId(fallback, 'case_primary');
    };

    const sanitizeCaseName = (value, fallback = DEFAULT_CASE_NAME) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || fallback;
    };
    const sanitizeCampaignScopeStatus = (value, fallback = 'planned') => {
        const token = String(value || '').trim().toLowerCase();
        if (CAMPAIGN_SCOPE_STATUSES.has(token)) return token;
        return CAMPAIGN_SCOPE_STATUSES.has(fallback) ? fallback : 'planned';
    };
    const sanitizeScopeId = (value, fallback = DEFAULT_CAMPAIGN_SCOPE_ID) => {
        const raw = sanitizeCaseId(value, fallback);
        return raw.startsWith('scope_') ? raw : `scope_${raw}`;
    };
    const sanitizeScopeRefId = (value, fallback = 'scope-ref') => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (raw) return sanitizeCaseId(raw, fallback || 'scope-ref');
        const fallbackRaw = typeof fallback === 'string' ? fallback.trim() : '';
        if (!fallbackRaw) return '';
        return sanitizeCaseId(fallbackRaw, 'scope-ref');
    };
    const sanitizeCaseIdOptional = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return '';
        return sanitizeCaseId(raw, 'case_primary');
    };
    const sanitizeVTTRolePreference = (value) => value === 'dm' ? 'dm' : 'player';
    const sanitizeVTTLocalPrefsEntry = (source) => {
        const base = source && typeof source === 'object' ? source : {};
        return {
            role: sanitizeVTTRolePreference(base.role)
        };
    };
    const parseVTTLocalPrefsMap = () => {
        try {
            const raw = localStorage.getItem(VTT_LOCAL_PREFS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            if (!parsed || typeof parsed !== 'object') return {};
            const clean = {};
            Object.keys(parsed).forEach((caseId) => {
                const safeCaseId = sanitizeCaseIdOptional(caseId);
                if (!safeCaseId) return;
                clean[safeCaseId] = sanitizeVTTLocalPrefsEntry(parsed[caseId]);
            });
            return clean;
        } catch (err) {
            return {};
        }
    };
    const normalizeCampaignScopeCaseState = (scope, preferredActiveCaseId = '') => {
        const source = scope && typeof scope === 'object' ? scope : {};
        const orderRaw = Array.isArray(source.caseOrder) ? source.caseOrder : [];
        const seen = new Set();
        const caseOrder = [];
        orderRaw.forEach((entry) => {
            const caseId = sanitizeCaseIdOptional(entry);
            if (!caseId || seen.has(caseId)) return;
            seen.add(caseId);
            caseOrder.push(caseId);
        });

        const statusSource = source.caseStatus && typeof source.caseStatus === 'object'
            ? source.caseStatus
            : {};
        const activeCandidates = [];
        const caseStatus = Object.create(null);
        caseOrder.forEach((caseId) => {
            const token = sanitizeCampaignScopeStatus(statusSource[caseId], 'planned');
            if (token === 'active') activeCandidates.push(caseId);
            caseStatus[caseId] = token === 'active' ? 'planned' : token;
        });

        const preferred = sanitizeCaseIdOptional(preferredActiveCaseId);
        const explicitActive = sanitizeCaseIdOptional(source.activeCaseId);
        let activeCaseId = '';
        if (preferred && caseOrder.includes(preferred)) {
            activeCaseId = preferred;
        } else if (explicitActive && caseOrder.includes(explicitActive)) {
            activeCaseId = explicitActive;
        } else if (activeCandidates.length) {
            activeCaseId = activeCandidates[0];
        } else {
            activeCaseId = caseOrder[0] || '';
        }

        if (activeCaseId) caseStatus[activeCaseId] = 'active';
        return { caseOrder, caseStatus, activeCaseId };
    };
    const sanitizeCampaignContext = (context, casesState) => {
        const source = context && typeof context === 'object' ? context : {};
        const caseItems = (casesState && Array.isArray(casesState.items)) ? casesState.items : [];
        const caseIds = caseItems
            .map((entry) => sanitizeCaseIdOptional(entry && entry.id))
            .filter(Boolean);
        const caseNameById = new Map();
        caseItems.forEach((entry) => {
            const id = sanitizeCaseIdOptional(entry && entry.id);
            if (!id) return;
            caseNameById.set(id, sanitizeCaseName(entry && entry.name, DEFAULT_CASE_NAME));
        });

        const fallbackCaseId = sanitizeCaseIdOptional(casesState && casesState.activeCaseId)
            || caseIds[0]
            || 'case_primary';
        const listRaw = Array.isArray(source.scopes) ? source.scopes : [];
        const scopes = [];
        const seenScopeIds = new Set();

        listRaw.forEach((entry, idx) => {
            const row = entry && typeof entry === 'object' ? entry : {};
            let id = sanitizeScopeId(row.id, idx === 0 ? DEFAULT_CAMPAIGN_SCOPE_ID : `scope_${idx + 1}`);
            if (seenScopeIds.has(id)) {
                let suffix = 2;
                while (seenScopeIds.has(`${id}_${suffix}`)) suffix += 1;
                id = `${id}_${suffix}`;
            }
            seenScopeIds.add(id);

            const caseOrderRaw = Array.isArray(row.caseOrder)
                ? row.caseOrder
                : (Array.isArray(row.cases) ? row.cases : []);
            const seenCaseIds = new Set();
            const caseOrder = [];
            caseOrderRaw.forEach((caseIdEntry) => {
                const caseId = sanitizeCaseIdOptional(caseIdEntry);
                if (!caseId || seenCaseIds.has(caseId)) return;
                if (!caseNameById.has(caseId)) return;
                seenCaseIds.add(caseId);
                caseOrder.push(caseId);
            });
            if (!caseOrder.length && fallbackCaseId) caseOrder.push(fallbackCaseId);
            if (!caseOrder.length && caseIds.length) caseOrder.push(caseIds[0]);

            const caseStatusSource = row.caseStatus && typeof row.caseStatus === 'object' ? row.caseStatus : {};
            const requestedActiveCaseId = sanitizeCaseIdOptional(row.activeCaseId)
                || caseOrder[0]
                || fallbackCaseId;
            const normalizedScopeCases = normalizeCampaignScopeCaseState({
                caseOrder,
                caseStatus: caseStatusSource,
                activeCaseId: requestedActiveCaseId
            }, requestedActiveCaseId);
            const activeCaseId = normalizedScopeCases.activeCaseId || (caseOrder[0] || fallbackCaseId);

            const boardRefsRaw = Array.isArray(row.boardRefs) ? row.boardRefs : [];
            const boardRefs = [];
            const seenRefIds = new Set();
            boardRefsRaw.forEach((refEntry, refIdx) => {
                const ref = refEntry && typeof refEntry === 'object' ? refEntry : {};
                const caseId = sanitizeCaseIdOptional(ref.caseId);
                if (!caseId || !caseNameById.has(caseId)) return;
                let refId = sanitizeScopeRefId(ref.id, `scope_ref_${refIdx + 1}`);
                if (seenRefIds.has(refId)) {
                    let bump = 2;
                    while (seenRefIds.has(`${refId}_${bump}`)) bump += 1;
                    refId = `${refId}_${bump}`;
                }
                seenRefIds.add(refId);
                boardRefs.push({
                    id: refId,
                    caseId,
                    label: toTrimmedString(ref.label, caseNameById.get(caseId) || caseId, 120).trim()
                        || caseNameById.get(caseId)
                        || caseId,
                    note: toTrimmedString(ref.note, '', 400).trim()
                });
            });

            scopes.push({
                id,
                name: sanitizeCaseName(row.name, idx === 0 ? DEFAULT_CAMPAIGN_SCOPE_NAME : `Scope ${idx + 1}`),
                description: toTrimmedString(row.description, '', 500).trim(),
                activeCaseId,
                caseOrder: normalizedScopeCases.caseOrder,
                caseStatus: normalizedScopeCases.caseStatus,
                boardRefs
            });
        });

        if (!scopes.length) {
            const caseOrder = caseIds.length ? caseIds.slice() : [fallbackCaseId];
            const requestedActiveCaseId = caseOrder.includes(fallbackCaseId) ? fallbackCaseId : caseOrder[0];
            const normalizedScopeCases = normalizeCampaignScopeCaseState({
                caseOrder,
                caseStatus: {},
                activeCaseId: requestedActiveCaseId
            }, requestedActiveCaseId);
            scopes.push({
                id: DEFAULT_CAMPAIGN_SCOPE_ID,
                name: DEFAULT_CAMPAIGN_SCOPE_NAME,
                description: '',
                activeCaseId: normalizedScopeCases.activeCaseId,
                caseOrder: normalizedScopeCases.caseOrder,
                caseStatus: normalizedScopeCases.caseStatus,
                boardRefs: []
            });
        }

        const requestedActiveScopeId = sanitizeScopeId(source.activeScopeId, scopes[0].id);
        const activeScopeId = scopes.some((entry) => entry.id === requestedActiveScopeId)
            ? requestedActiveScopeId
            : scopes[0].id;

        return {
            activeScopeId,
            scopes
        };
    };

    const sanitizeLedgerUI = (value) => {
        const source = value && typeof value === 'object' ? value : {};
        const base = createDefaultLedgerState().ui;
        return {
            filter: toTrimmedString(source.filter, base.filter, 48).trim() || base.filter,
            search: toTrimmedString(source.search, base.search, 160).trim(),
            sort: toTrimmedString(source.sort, base.sort, 48).trim() || base.sort
        };
    };
    const sanitizeLedgerEntry = (entry, index = 0) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const fallbackId = buildEntityId('ledger', index);
        const createdAt = sanitizeAttributionAt(source.createdAt, new Date().toISOString()) || new Date().toISOString();
        const changedAt = sanitizeAttributionAt(source.lastChangedAt, createdAt) || createdAt;
        return {
            id: toTrimmedString(source.id, fallbackId, 80).trim() || fallbackId,
            caseId: sanitizeCaseId(source.caseId, 'case_primary'),
            statement: toTrimmedString(source.statement, '', 1200).trim(),
            status: sanitizeLedgerStatus(source.status, 'stable'),
            sourceType: sanitizeLedgerSourceType(source.sourceType, 'other'),
            sourceId: toTrimmedString(source.sourceId, '', 120).trim(),
            certainty: clampPercent(source.certainty, 100),
            tags: toTrimmedString(source.tags, '', 1200),
            notes: toTrimmedString(source.notes, '', 4000),
            lastChangedBy: sanitizeAttributionBy(source.lastChangedBy, ''),
            lastChangedAt: changedAt,
            createdAt
        };
    };
    const sanitizeLedgerState = (value) => {
        const source = value && typeof value === 'object' ? value : {};
        const base = createDefaultLedgerState();
        const entries = Array.isArray(source.entries)
            ? source.entries
                .map((entry, idx) => sanitizeLedgerEntry(entry, idx))
                .filter((entry) => !!entry.statement)
            : base.entries.slice();
        return {
            entries,
            ui: sanitizeLedgerUI(source.ui)
        };
    };
    const normalizeClueTimelineEventTitle = (title, kind) => {
        const cleanKind = toTrimmedString(kind, '', 80).trim().toLowerCase();
        const rawTitle = toTrimmedString(title, '', 240).trim();
        if (cleanKind !== 'clue-discovered') return rawTitle;
        const clueTitle = rawTitle.replace(/^(?:clue\s+discovered|clue)\s*:\s*/i, '').trim() || 'Untitled Clue';
        return `Clue: ${clueTitle}`;
    };
    const sanitizeEventSortOrder = (value, fallback = 0) => {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        const fallbackParsed = parseInt(fallback, 10);
        return Number.isFinite(fallbackParsed) && fallbackParsed >= 0 ? fallbackParsed : 0;
    };
    const compareEventsByStoredOrder = (left, right) => {
        const leftHasOrder = Number.isFinite(parseInt(left && left.sortOrder, 10));
        const rightHasOrder = Number.isFinite(parseInt(right && right.sortOrder, 10));
        if (leftHasOrder && rightHasOrder) {
            const orderDiff = sanitizeEventSortOrder(left.sortOrder, 0) - sanitizeEventSortOrder(right.sortOrder, 0);
            if (orderDiff) return orderDiff;
        } else if (leftHasOrder !== rightHasOrder) {
            return leftHasOrder ? -1 : 1;
        }

        const leftCreated = Date.parse(left && left.created || '') || 0;
        const rightCreated = Date.parse(right && right.created || '') || 0;
        if (leftCreated !== rightCreated) return leftCreated - rightCreated;

        return String(left && left.id || '').localeCompare(String(right && right.id || ''));
    };
    const sanitizeEvent = (event, index = 0) => {
        const source = event && typeof event === 'object' ? event : {};
        const { dueAt: _legacyDueAt, entityImpacts: _legacyEntityImpacts, ...sourceWithoutLegacyEventFields } = source;
        const fallbackId = buildEntityId('event', index);
        const createdAt = sanitizeAttributionAt(source.created, new Date().toISOString()) || new Date().toISOString();
        const changedAt = sanitizeAttributionAt(source.lastChangedAt, createdAt) || createdAt;
        const kind = toTrimmedString(source.kind, '', 80);
        return {
            ...sourceWithoutLegacyEventFields,
            id: toTrimmedString(source.id, fallbackId, 80).trim() || fallbackId,
            title: normalizeClueTimelineEventTitle(source.title, kind),
            focus: toTrimmedString(source.focus, '', 240),
            heatDelta: toTrimmedString(source.heatDelta, '', 12),
            tags: toTrimmedString(source.tags, '', 2000),
            imageUrl: toImageUrl(source.imageUrl),
            highlights: toTrimmedString(source.highlights, '', 6000),
            fallout: toTrimmedString(source.fallout, '', 6000),
            followUp: toTrimmedString(source.followUp, '', 6000),
            source: toTrimmedString(source.source, '', 80),
            kind,
            resolved: toBoolean(source.resolved),
            created: createdAt,
            impactSeverity: sanitizeImpactSeverity(source.impactSeverity, 'moderate'),
            impactScope: sanitizeImpactScope(source.impactScope, 'local'),
            certainty: clampPercent(source.certainty, 50),
            lastChangedBy: sanitizeAttributionBy(source.lastChangedBy, ''),
            lastChangedAt: changedAt,
            caseId: sanitizeCaseId(source.caseId, 'case_primary'),
            sortOrder: sanitizeEventSortOrder(source.sortOrder, index)
        };
    };
    const sanitizeEventList = (events) => (
        Array.isArray(events)
            ? events
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry, idx) => sanitizeEvent(entry, idx))
            : []
    );
    const sanitizeLeadType = (value, fallback = 'other') => {
        const token = normalizeEnumToken(value);
        return LEAD_TYPES.has(token) ? token : fallback;
    };
    const sanitizeLeadStatus = (value, fallback = 'open') => {
        const token = normalizeEnumToken(value);
        return LEAD_STATUSES.has(token) ? token : fallback;
    };
    const sanitizeLeadVotes = (votes) => {
        const source = votes && typeof votes === 'object' ? votes : {};
        const out = {};
        Object.keys(source).forEach((key) => {
            const name = toTrimmedString(key, '', 60).trim();
            if (!name) return;
            const voteToken = normalizeEnumToken(source[key]);
            if (voteToken !== 'hot' && voteToken !== 'cold' && voteToken !== 'dead-end') return;
            out[name] = voteToken;
        });
        return out;
    };
    const sanitizeLead = (lead, index = 0) => {
        const source = lead && typeof lead === 'object' ? lead : {};
        const nowIso = new Date().toISOString();
        const fallbackId = buildEntityId('lead', index);
        const createdAt = sanitizeAttributionAt(source.created, nowIso) || nowIso;
        const updatedAt = sanitizeAttributionAt(source.updated, createdAt) || createdAt;
        return {
            id: toTrimmedString(source.id, fallbackId, 80).trim() || fallbackId,
            type: sanitizeLeadType(source.type, 'other'),
            targetId: toTrimmedString(source.targetId, '', 120).trim(),
            title: toTrimmedString(source.title, '', 180).trim() || `Lead ${index + 1}`,
            question: toTrimmedString(source.question, '', 500).trim(),
            nextStep: toTrimmedString(source.nextStep, '', 500).trim(),
            status: sanitizeLeadStatus(source.status, 'open'),
            votes: sanitizeLeadVotes(source.votes),
            created: createdAt,
            updated: updatedAt
        };
    };
    const sanitizeLeadList = (leads) => (
        Array.isArray(leads)
            ? leads
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry, idx) => sanitizeLead(entry, idx))
            : []
    );

    const sanitizeCases = (cases, campaign, board) => {
        const source = cases && typeof cases === 'object' ? cases : {};
        const baseCampaign = campaign && typeof campaign === 'object' ? campaign : {};
        const legacyCase = baseCampaign.case && typeof baseCampaign.case === 'object' ? baseCampaign.case : {};
        const legacyCaseTitle = sanitizeCaseName(legacyCase.title || '', DEFAULT_CASE_NAME);

        const legacySeed = {
            id: 'case_primary',
            name: legacyCaseTitle,
            board: sanitizeBoard(board),
            events: sanitizeEventList(baseCampaign.events),
            leads: [],
            vtt: createDefaultVTTState()
        };

        const listRaw = Array.isArray(source.items) ? source.items
            : (Array.isArray(source.list) ? source.list : []);
        const startingList = listRaw.length ? listRaw : [legacySeed];

        const seen = new Set();
        const items = [];

        startingList.forEach((entry, idx) => {
            const row = entry && typeof entry === 'object' ? entry : {};
            const fallbackId = idx === 0 ? 'case_primary' : `case_${idx + 1}`;
            let id = sanitizeCaseId(row.id, fallbackId);
            if (seen.has(id)) {
                let suffix = 2;
                while (seen.has(`${id}_${suffix}`)) suffix += 1;
                id = `${id}_${suffix}`;
            }
            seen.add(id);

            const fallbackName = idx === 0 ? legacyCaseTitle : `Case ${idx + 1}`;
            const normalized = {
                id,
                name: sanitizeCaseName(row.name, fallbackName),
                board: sanitizeBoard(row.board),
                events: sanitizeEventList(row.events),
                leads: sanitizeLeadList(row.leads),
                vtt: sanitizeVTTState(row.vtt)
            };
            items.push(normalized);
        });

        if (!items.length) {
            items.push({
                id: 'case_primary',
                name: legacyCaseTitle,
                board: sanitizeBoard(null),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            });
        }

        const activeRaw = sanitizeCaseId(source.activeCaseId, items[0].id);
        const activeCaseId = items.some((item) => item.id === activeRaw) ? activeRaw : items[0].id;
        return { activeCaseId, items };
    };

    const sanitizeHQ = (hq) => {
        const base = createDefaultHQState();
        const source = hq && typeof hq === 'object' ? hq : {};
        const gridSource = source.grid && typeof source.grid === 'object' ? source.grid : {};
        const grid = {
            cols: Math.max(6, toNonNegativeInt(gridSource.cols, base.grid.cols)),
            rows: Math.max(6, toNonNegativeInt(gridSource.rows, base.grid.rows)),
            cell: Math.max(24, toNonNegativeInt(gridSource.cell, base.grid.cell))
        };

        const floors = Array.isArray(source.floors)
            ? source.floors
                .filter(floor => floor && typeof floor === 'object')
                .map((floor, idx) => ({
                    id: (typeof floor.id === 'string' && floor.id) ? floor.id : `floor_${idx}_${Math.random().toString(36).slice(2, 7)}`,
                    name: (typeof floor.name === 'string' && floor.name) ? floor.name : `Level ${idx + 1}`,
                    rooms: Array.isArray(floor.rooms) ? floor.rooms : []
                }))
            : deepClone(base.floors);

        if (!floors.length) floors.push(...deepClone(base.floors));
        const activeFloorId = floors.some(f => f.id === source.activeFloorId) ? source.activeFloorId : floors[0].id;
        const maxJuniorOperatives = toNonNegativeInt(source.maxJuniorOperatives, 0);

        return {
            grid,
            snapToGrid: source.snapToGrid !== undefined ? !!source.snapToGrid : base.snapToGrid,
            floors,
            activeFloorId,
            maxJuniorOperatives
        };
    };

    const sanitizeScopeUpdatedMap = (value) => {
        const source = value && typeof value === 'object' ? value : {};
        const out = Object.create(null);
        Object.keys(source).forEach((key) => {
            const scope = String(key || '').trim();
            if (!scope) return;
            if (!/^[a-z0-9_.-]+$/i.test(scope)) return;
            if (scope === '__proto__' || scope === 'prototype' || scope === 'constructor') return;
            out[scope] = toTimestamp(source[key], 0);
        });
        return out;
    };

    const sanitizeState = (state) => {
        const source = state && typeof state === 'object' ? state : {};
        const defaultMeta = deepClone(DEFAULT_STATE.meta);
        const sourceMeta = source.meta && typeof source.meta === 'object' ? source.meta : {};
        const version = toNonNegativeInt(sourceMeta.version, 1) || 1;
        const created = toTimestamp(sourceMeta.created, defaultMeta.created);
        const updated = toTimestamp(sourceMeta.updated, 0);
        const syncRevision = toNonNegativeInt(sourceMeta.syncRevision, 0);
        const scopeUpdated = sanitizeScopeUpdatedMap(sourceMeta.scopeUpdated);

        const cleanCases = sanitizeCases(source.cases, source.campaign, source.board);
        return {
            meta: { ...defaultMeta, ...sourceMeta, version, created, updated, syncRevision, scopeUpdated },
            campaign: sanitizeCampaign(source.campaign),
            board: sanitizeBoard(source.board),
            cases: cleanCases,
            campaignContext: sanitizeCampaignContext(source.campaignContext, cleanCases),
            campaignMeta: sanitizeCampaignMeta(source.campaignMeta),
            hq: sanitizeHQ(source.hq)
        };
    };

    const normalizeScopeToken = (scope) => {
        const raw = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
        if (!raw) return SYNC_SCOPE_GLOBAL;
        if (raw === 'all') return SYNC_SCOPE_GLOBAL;
        if (!/^[a-z0-9_.-]+$/.test(raw)) return SYNC_SCOPE_GLOBAL;
        return raw;
    };

    const normalizeScopeList = (scopeOrList) => {
        const source = Array.isArray(scopeOrList) ? scopeOrList : [scopeOrList];
        const out = [];
        const seen = new Set();
        source.forEach((entry) => {
            const scope = normalizeScopeToken(entry);
            if (seen.has(scope)) return;
            seen.add(scope);
            out.push(scope);
        });
        if (!out.length) out.push(SYNC_SCOPE_GLOBAL);
        return out;
    };
    const isRoomBackedScope = (scopeToken) => {
        const scope = normalizeScopeToken(scopeToken);
        if (scope === 'campaign.meta.board') return true;
        if (/^cases\.[a-z0-9_-]+\.board$/.test(scope)) return true;
        if (/^cases\.[a-z0-9_-]+\.vtt(?:$|\.)/.test(scope)) return true;
        return false;
    };
    const filterCloudSyncScopes = (scopeOrList) => normalizeScopeList(scopeOrList)
        .filter((scope) => !isRoomBackedScope(scope));
    const hasBoardContent = (boardState) => {
        const board = sanitizeBoard(boardState);
        return !!(
            (Array.isArray(board.nodes) && board.nodes.length)
            || (Array.isArray(board.connections) && board.connections.length)
            || toNonNegativeInt(board.updatedAt, 0) > 0
        );
    };
    const hasVTTContent = (vttState) => {
        const vtt = sanitizeVTTState(vttState);
        const scenes = Array.isArray(vtt.scenes) ? vtt.scenes : [];
        const hasSceneContent = scenes.some((scene) => (
            (Array.isArray(scene && scene.tokens) && scene.tokens.length)
            || (Array.isArray(scene && scene.templates) && scene.templates.length)
            || (Array.isArray(scene && scene.evidenceNotes) && scene.evidenceNotes.length)
            || (Array.isArray(scene && scene.clocks) && scene.clocks.length)
            || (Array.isArray(scene && scene.fog) && scene.fog.length)
            || !!toTrimmedString(scene && scene.mapImageUrl, '', 4000).trim()
            || !!toTrimmedString(scene && scene.name, '', 160).trim()
        ));
        const initiative = vtt && vtt.initiative && typeof vtt.initiative === 'object' ? vtt.initiative : {};
        return !!(
            hasSceneContent
            || (Array.isArray(initiative.entries) && initiative.entries.length)
            || toNonNegativeInt(vtt.updatedAt, 0) > 0
            || toTrimmedString(initiative.activeEntryId, '', 120).trim()
            || Math.max(1, Math.round(toNumber(initiative.round, 1))) > 1
        );
    };

    const ENTITY_SCOPE_ORDER_TOKEN = '__order';
    const CAMPAIGN_ENTITY_SCOPE_PREFIXES = Object.freeze({
        players: 'campaign.players',
        npcs: 'campaign.npcs',
        locations: 'campaign.locations',
        requisitions: 'campaign.requisitions',
        encounters: 'campaign.encounters'
    });
    const normalizeEntityScopeId = (value) => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!raw) return '';
        return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 80);
    };
    const buildEntityOrderScope = (scopePrefix) => `${scopePrefix}.${ENTITY_SCOPE_ORDER_TOKEN}`;
    const buildEntityScope = (scopePrefix, entityId) => {
        const id = normalizeEntityScopeId(entityId);
        if (!id || id === ENTITY_SCOPE_ORDER_TOKEN) return '';
        return `${scopePrefix}.${id}`;
    };
    const buildCampaignEntityScope = (key, entityId) => {
        const scopePrefix = CAMPAIGN_ENTITY_SCOPE_PREFIXES[key];
        if (!scopePrefix) return '';
        return buildEntityScope(scopePrefix, entityId);
    };
    const buildPlayerEntityScope = (playerId) => buildCampaignEntityScope('players', playerId);
    const buildNPCEntityScope = (npcId) => buildCampaignEntityScope('npcs', npcId);
    const buildLocationEntityScope = (locationId) => buildCampaignEntityScope('locations', locationId);
    const buildRequisitionEntityScope = (requisitionId) => buildCampaignEntityScope('requisitions', requisitionId);
    const buildEncounterEntityScope = (encounterId) => buildCampaignEntityScope('encounters', encounterId);
    const CAMPAIGN_META_EVENTS_SCOPE_PREFIX = 'campaign.meta.events';
    const buildCaseEventsScopePrefix = (caseId) => `cases.${sanitizeCaseId(caseId, 'case_primary')}.events`;
    const buildCaseEventEntityScope = (caseId, eventId) => buildEntityScope(buildCaseEventsScopePrefix(caseId), eventId);
    const buildCaseEventOrderScope = (caseId) => buildEntityOrderScope(buildCaseEventsScopePrefix(caseId));
    const buildCaseVTTInitiativeEntriesScopePrefix = (caseId) => `cases.${sanitizeCaseId(caseId, 'case_primary')}.vtt.initiative.entries`;
    const buildCaseVTTInitiativeActiveScope = (caseId) => `cases.${sanitizeCaseId(caseId, 'case_primary')}.vtt.initiative.active`;
    const buildVTTInitiativeEntryScopeId = (entry) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const sourceType = normalizeEntityScopeId(source.sourceType);
        const sourceId = normalizeEntityScopeId(source.sourceId);
        if (sourceType && sourceId) return normalizeEntityScopeId(`${sourceType}_${sourceId}`);
        const linkedTokenId = normalizeEntityScopeId(source.linkedTokenId);
        if (linkedTokenId) return normalizeEntityScopeId(`token_${linkedTokenId}`);
        const entryId = normalizeEntityScopeId(source.id);
        return entryId ? normalizeEntityScopeId(`entry_${entryId}`) : '';
    };
    const buildCaseVTTInitiativeEntryScope = (caseId, entryOrScopeId) => {
        const scopeId = typeof entryOrScopeId === 'string'
            ? normalizeEntityScopeId(entryOrScopeId)
            : buildVTTInitiativeEntryScopeId(entryOrScopeId);
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return '';
        return buildEntityScope(buildCaseVTTInitiativeEntriesScopePrefix(caseId), scopeId);
    };
    const buildCampaignMetaEventEntityScope = (eventId) => buildEntityScope(CAMPAIGN_META_EVENTS_SCOPE_PREFIX, eventId);
    const buildCampaignMetaEventOrderScope = () => buildEntityOrderScope(CAMPAIGN_META_EVENTS_SCOPE_PREFIX);
    const parseGranularNormalizedLwwScope = (scopeToken) => {
        const scope = normalizeScopeToken(scopeToken);

        const campaignEntityMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)\.([a-z0-9_-]+)$/);
        if (campaignEntityMatch) {
            const entityId = normalizeEntityScopeId(campaignEntityMatch[2]);
            if (!entityId || entityId === ENTITY_SCOPE_ORDER_TOKEN) return null;
            return {
                scope,
                kind: 'campaign-entity',
                key: campaignEntityMatch[1],
                entityId
            };
        }

        const campaignMetaEventMatch = scope.match(/^campaign\.meta\.events\.([a-z0-9_-]+)$/);
        if (campaignMetaEventMatch) {
            const eventId = normalizeEntityScopeId(campaignMetaEventMatch[1]);
            if (!eventId || eventId === ENTITY_SCOPE_ORDER_TOKEN) return null;
            return {
                scope,
                kind: 'campaign-meta-event',
                eventId
            };
        }

        const caseEventMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events\.([a-z0-9_-]+)$/);
        if (caseEventMatch) {
            const caseId = sanitizeCaseId(caseEventMatch[1], 'case_primary');
            const eventId = normalizeEntityScopeId(caseEventMatch[2]);
            if (!eventId || eventId === ENTITY_SCOPE_ORDER_TOKEN) return null;
            return {
                scope,
                kind: 'case-event',
                caseId,
                eventId
            };
        }

        const caseVTTInitiativeEntryMatch = scope.match(/^cases\.([a-z0-9_-]+)\.vtt\.initiative\.entries\.([a-z0-9_-]+)$/);
        if (caseVTTInitiativeEntryMatch) {
            const caseId = sanitizeCaseId(caseVTTInitiativeEntryMatch[1], 'case_primary');
            const entryScopeId = normalizeEntityScopeId(caseVTTInitiativeEntryMatch[2]);
            if (!entryScopeId || entryScopeId === ENTITY_SCOPE_ORDER_TOKEN) return null;
            return {
                scope,
                kind: 'case-vtt-initiative-entry',
                caseId,
                entryScopeId
            };
        }

        const caseVTTInitiativeActiveMatch = scope.match(/^cases\.([a-z0-9_-]+)\.vtt\.initiative\.active$/);
        if (caseVTTInitiativeActiveMatch) {
            return {
                scope,
                kind: 'case-vtt-initiative-active',
                caseId: sanitizeCaseId(caseVTTInitiativeActiveMatch[1], 'case_primary')
            };
        }

        return null;
    };
    const isGranularNormalizedLwwScope = (scopeToken) => !!parseGranularNormalizedLwwScope(scopeToken);
    const isProtectedConflictScope = (scopeToken) => !isGranularNormalizedLwwScope(scopeToken);
    const findEntityIndexByScopeId = (list, scopeId) => {
        if (!Array.isArray(list) || !scopeId) return -1;
        return list.findIndex((entry) => normalizeEntityScopeId(entry && entry.id) === scopeId);
    };
    const findVTTInitiativeEntryIndexByScopeId = (list, scopeId) => {
        const cleanScopeId = normalizeEntityScopeId(scopeId);
        if (!Array.isArray(list) || !cleanScopeId) return -1;
        return list.findIndex((entry) => buildVTTInitiativeEntryScopeId(entry) === cleanScopeId);
    };
    const addEntityScopesToSnapshot = (map, scopePrefix, sourceList) => {
        const list = Array.isArray(sourceList) ? sourceList : [];
        const scopeIds = [];
        const seenScopeIds = new Set();
        let fallbackToBroadScope = false;

        list.forEach((entry) => {
            const scope = buildEntityScope(scopePrefix, entry && entry.id);
            if (!scope) {
                fallbackToBroadScope = true;
                return;
            }
            const scopeId = scope.slice((scopePrefix + '.').length);
            if (!scopeId || seenScopeIds.has(scopeId)) {
                fallbackToBroadScope = true;
                return;
            }
            seenScopeIds.add(scopeId);
            scopeIds.push(scopeId);
            map.set(scope, entry);
        });

        map.set(buildEntityOrderScope(scopePrefix), scopeIds);
        if (fallbackToBroadScope) map.set(scopePrefix, list);
    };
    const applyEntityScopeFromSourceList = (targetList, sourceList, scopeId) => {
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
        const targetIdx = findEntityIndexByScopeId(targetList, scopeId);
        const sourceIdx = findEntityIndexByScopeId(sourceList, scopeId);

        if (sourceIdx >= 0) {
            const sourceEntry = deepClone(sourceList[sourceIdx]);
            if (targetIdx >= 0) targetList[targetIdx] = sourceEntry;
            else targetList.push(sourceEntry);
            return;
        }
        if (targetIdx >= 0) targetList.splice(targetIdx, 1);
    };
    const applyEntityOrderScopeFromSourceList = (targetList, sourceList) => {
        const desiredOrder = [];
        const desiredSet = new Set();
        sourceList.forEach((entry) => {
            const id = normalizeEntityScopeId(entry && entry.id);
            if (!id || desiredSet.has(id)) return;
            desiredSet.add(id);
            desiredOrder.push(id);
        });
        if (!desiredOrder.length) return;

        const targetById = new Map();
        const extras = [];
        targetList.forEach((entry) => {
            const id = normalizeEntityScopeId(entry && entry.id);
            if (!id || !desiredSet.has(id) || targetById.has(id)) {
                extras.push(entry);
                return;
            }
            targetById.set(id, entry);
        });

        const sourceById = new Map();
        sourceList.forEach((entry) => {
            const id = normalizeEntityScopeId(entry && entry.id);
            if (!id || sourceById.has(id)) return;
            sourceById.set(id, entry);
        });

        const ordered = [];
        desiredOrder.forEach((id) => {
            if (targetById.has(id)) {
                ordered.push(targetById.get(id));
                return;
            }
            const sourceEntry = sourceById.get(id);
            if (sourceEntry) ordered.push(deepClone(sourceEntry));
        });

        targetList.splice(0, targetList.length, ...ordered, ...extras);
    };
    const getCampaignEntityList = (state, key) => {
        if (!state.campaign || typeof state.campaign !== 'object') state.campaign = sanitizeCampaign(null);
        if (!Array.isArray(state.campaign[key])) state.campaign[key] = [];
        return state.campaign[key];
    };
    const applyCampaignEntityScopeFromSource = (targetState, sourceState, key, scopeId) => {
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
        const targetList = getCampaignEntityList(targetState, key);
        const sourceList = getCampaignEntityList(sourceState, key);
        applyEntityScopeFromSourceList(targetList, sourceList, scopeId);
    };
    const applyCampaignEntityOrderScopeFromSource = (targetState, sourceState, key) => {
        const targetList = getCampaignEntityList(targetState, key);
        const sourceList = getCampaignEntityList(sourceState, key);
        applyEntityOrderScopeFromSourceList(targetList, sourceList);
    };
    const applyCaseEventEntityScopeFromSource = (targetState, sourceState, caseId, scopeId) => {
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
        const cleanCaseId = sanitizeCaseId(caseId, 'case_primary');
        const targetCase = ensureCaseForScope(targetState, sourceState, cleanCaseId);
        if (!targetCase) return;
        if (!Array.isArray(targetCase.events)) targetCase.events = [];
        const sourceCase = getCaseById(sourceState, cleanCaseId);
        const sourceEvents = Array.isArray(sourceCase && sourceCase.events) ? sourceCase.events : [];
        applyEntityScopeFromSourceList(targetCase.events, sourceEvents, scopeId);
    };
    const applyCaseEventOrderScopeFromSource = (targetState, sourceState, caseId) => {
        const cleanCaseId = sanitizeCaseId(caseId, 'case_primary');
        const targetCase = ensureCaseForScope(targetState, sourceState, cleanCaseId);
        if (!targetCase) return;
        if (!Array.isArray(targetCase.events)) targetCase.events = [];
        const sourceCase = getCaseById(sourceState, cleanCaseId);
        const sourceEvents = Array.isArray(sourceCase && sourceCase.events) ? sourceCase.events : [];
        applyEntityOrderScopeFromSourceList(targetCase.events, sourceEvents);
    };
    const applyCaseVTTInitiativeEntryScopeFromSource = (targetState, sourceState, caseId, scopeId) => {
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
        const cleanCaseId = sanitizeCaseId(caseId, 'case_primary');
        const targetCase = ensureCaseForScope(targetState, sourceState, cleanCaseId);
        if (!targetCase) return;
        targetCase.vtt = sanitizeVTTState(targetCase.vtt);

        const sourceCase = getCaseById(sourceState, cleanCaseId);
        const sourceVTT = sanitizeVTTState(sourceCase && sourceCase.vtt);
        const targetEntries = Array.isArray(targetCase.vtt && targetCase.vtt.initiative && targetCase.vtt.initiative.entries)
            ? targetCase.vtt.initiative.entries
            : [];
        const sourceEntries = Array.isArray(sourceVTT && sourceVTT.initiative && sourceVTT.initiative.entries)
            ? sourceVTT.initiative.entries
            : [];
        const targetIdx = findVTTInitiativeEntryIndexByScopeId(targetEntries, scopeId);
        const sourceIdx = findVTTInitiativeEntryIndexByScopeId(sourceEntries, scopeId);

        if (sourceIdx >= 0) {
            const nextEntry = sanitizeVTTInitiativeEntry(sourceEntries[sourceIdx], sourceIdx);
            if (targetIdx >= 0) targetEntries[targetIdx] = nextEntry;
            else targetEntries.push(nextEntry);
            sortVTTInitiativeEntries(targetEntries);
        } else if (targetIdx >= 0) {
            const removed = targetEntries.splice(targetIdx, 1)[0];
            if (removed && targetCase.vtt && targetCase.vtt.initiative && targetCase.vtt.initiative.activeEntryId === removed.id) {
                targetCase.vtt.initiative.activeEntryId = targetEntries[0] ? targetEntries[0].id : '';
            }
        }
    };
    const applyCaseVTTInitiativeActiveScopeFromSource = (targetState, sourceState, caseId) => {
        const cleanCaseId = sanitizeCaseId(caseId, 'case_primary');
        const targetCase = ensureCaseForScope(targetState, sourceState, cleanCaseId);
        if (!targetCase) return;
        targetCase.vtt = sanitizeVTTState(targetCase.vtt);

        const sourceCase = getCaseById(sourceState, cleanCaseId);
        const sourceVTT = sanitizeVTTState(sourceCase && sourceCase.vtt);
        const targetEntries = Array.isArray(targetCase.vtt && targetCase.vtt.initiative && targetCase.vtt.initiative.entries)
            ? targetCase.vtt.initiative.entries
            : [];
        const sourceActiveId = sourceVTT && sourceVTT.initiative
            ? toTrimmedString(sourceVTT.initiative.activeEntryId, '', 120).trim()
            : '';
        targetCase.vtt.initiative.activeEntryId = sourceActiveId && targetEntries.some((entry) => entry && entry.id === sourceActiveId)
            ? sourceActiveId
            : '';
    };
    const getCampaignMetaEventsList = (state) => {
        if (!state.campaignMeta || typeof state.campaignMeta !== 'object') {
            state.campaignMeta = sanitizeCampaignMeta(null);
        }
        if (!Array.isArray(state.campaignMeta.events)) state.campaignMeta.events = [];
        return state.campaignMeta.events;
    };
    const applyCampaignMetaEventEntityScopeFromSource = (targetState, sourceState, scopeId) => {
        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
        const targetEvents = getCampaignMetaEventsList(targetState);
        const sourceEvents = getCampaignMetaEventsList(sourceState);
        applyEntityScopeFromSourceList(targetEvents, sourceEvents, scopeId);
    };
    const applyCampaignMetaEventOrderScopeFromSource = (targetState, sourceState) => {
        const targetEvents = getCampaignMetaEventsList(targetState);
        const sourceEvents = getCampaignMetaEventsList(sourceState);
        applyEntityOrderScopeFromSourceList(targetEvents, sourceEvents);
    };

    const parseStoredDirtyScopes = () => {
        try {
            const raw = localStorage.getItem(DIRTY_SCOPES_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const cleaned = parsed.filter((entry) => typeof entry === 'string' && /^[a-z0-9_.-]+$/i.test(entry.trim()));
            if (!cleaned.length) return [];
            const filtered = filterCloudSyncScopes(cleaned);
            return filtered.length ? filtered : [];
        } catch (err) {
            console.warn('RTF_STORE: Failed to parse dirty scopes cache', err);
            return [];
        }
    };
    const parseStoredScopeBaselines = () => {
        try {
            const raw = localStorage.getItem(SCOPE_BASELINES_KEY);
            if (!raw) return new Map();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return new Map();

            const map = new Map();
            Object.keys(parsed).forEach((scopeToken) => {
                const scope = normalizeScopeToken(scopeToken);
                if (!isGranularNormalizedLwwScope(scope)) return;

                const row = parsed[scopeToken];
                if (!row || typeof row !== 'object') return;
                map.set(scope, {
                    revision: toNonNegativeInt(row.revision, 0),
                    updatedAt: toTimestamp(row.updatedAt, 0),
                    exists: row.exists !== false,
                    signature: typeof row.signature === 'string' ? row.signature : ''
                });
            });
            return map;
        } catch (err) {
            console.warn('RTF_STORE: Failed to parse scope baselines cache', err);
            return new Map();
        }
    };

    const readJsonStorage = (key, fallback = null) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed === undefined ? fallback : parsed;
        } catch (err) {
            return fallback;
        }
    };

    const scopesOverlap = (leftScope, rightScope) => {
        const left = normalizeScopeToken(leftScope);
        const right = normalizeScopeToken(rightScope);
        if (left === SYNC_SCOPE_GLOBAL || right === SYNC_SCOPE_GLOBAL) return true;
        if (left === right) return true;
        if (left === SYNC_SCOPE_CASES_META && right.startsWith('cases.')) return true;
        if (right === SYNC_SCOPE_CASES_META && left.startsWith('cases.')) return true;
        if (left.startsWith(`${right}.`)) return true;
        if (right.startsWith(`${left}.`)) return true;
        return false;
    };

    const buildCasesMetaSnapshot = (state) => {
        const sourceCases = state && state.cases && Array.isArray(state.cases.items) ? state.cases.items : [];
        return {
            activeCaseId: state && state.cases ? state.cases.activeCaseId : 'case_primary',
            items: sourceCases.map((entry) => ({
                id: entry && entry.id ? entry.id : '',
                name: entry && entry.name ? entry.name : DEFAULT_CASE_NAME
            }))
        };
    };

    const buildScopeSnapshot = (state) => {
        const clean = stripLocalOnlyFieldsForCloud(state);
        const map = new Map();
        map.set('campaign.rep', clean.campaign.rep);
        map.set('campaign.heat', clean.campaign.heat);
        map.set('campaign.cognitiveRisk', clean.campaign.cognitiveRisk);
        addEntityScopesToSnapshot(map, CAMPAIGN_ENTITY_SCOPE_PREFIXES.players, clean.campaign.players);
        addEntityScopesToSnapshot(map, CAMPAIGN_ENTITY_SCOPE_PREFIXES.npcs, clean.campaign.npcs);
        addEntityScopesToSnapshot(map, CAMPAIGN_ENTITY_SCOPE_PREFIXES.locations, clean.campaign.locations);
        addEntityScopesToSnapshot(map, CAMPAIGN_ENTITY_SCOPE_PREFIXES.requisitions, clean.campaign.requisitions);
        addEntityScopesToSnapshot(map, CAMPAIGN_ENTITY_SCOPE_PREFIXES.encounters, clean.campaign.encounters);
        map.set('campaign.ledger', sanitizeLedgerState(clean.campaign.ledger));
        map.set('campaign.case', clean.campaign.case);
        map.set('campaign.context', clean.campaignContext);
        addEntityScopesToSnapshot(map, CAMPAIGN_META_EVENTS_SCOPE_PREFIX, sanitizeEventList(clean.campaignMeta && clean.campaignMeta.events));
        map.set(SYNC_SCOPE_CASES_META, buildCasesMetaSnapshot(clean));
        map.set('hq', clean.hq);
        (clean.cases.items || []).forEach((entry) => {
            if (!entry || !entry.id) return;
            addEntityScopesToSnapshot(map, buildCaseEventsScopePrefix(entry.id), sanitizeEventList(entry.events));
            map.set(`cases.${entry.id}.leads`, sanitizeLeadList(entry.leads));
        });
        return map;
    };

    const getChangedScopes = (fromState, toState) => {
        const before = buildScopeSnapshot(fromState);
        const after = buildScopeSnapshot(toState);
        const keys = new Set([...before.keys(), ...after.keys()]);
        const changed = [];
        keys.forEach((key) => {
            const left = before.has(key) ? JSON.stringify(before.get(key)) : '';
            const right = after.has(key) ? JSON.stringify(after.get(key)) : '';
            if (left !== right) changed.push(key);
        });
        return changed;
    };

    const getOverlappingScopes = (localScopes, remoteScopes) => {
        const local = normalizeScopeList(localScopes);
        const remote = normalizeScopeList(remoteScopes);
        const overlap = [];
        local.forEach((scope) => {
            if (remote.some((remoteScope) => scopesOverlap(scope, remoteScope))) {
                overlap.push(scope);
            }
        });
        return overlap;
    };

    const getCaseById = (state, caseId) => {
        if (!state || !state.cases || !Array.isArray(state.cases.items)) return null;
        return state.cases.items.find((entry) => entry && entry.id === caseId) || null;
    };
    const hasGranularNormalizedScopeInState = (state, scopeToken) => {
        const parsed = parseGranularNormalizedLwwScope(scopeToken);
        if (!parsed) return false;

        if (parsed.kind === 'campaign-entity') {
            const list = state && state.campaign && Array.isArray(state.campaign[parsed.key])
                ? state.campaign[parsed.key]
                : [];
            return findEntityIndexByScopeId(list, parsed.entityId) >= 0;
        }

        if (parsed.kind === 'campaign-meta-event') {
            const meta = state && state.campaignMeta && typeof state.campaignMeta === 'object'
                ? state.campaignMeta
                : null;
            const list = meta && Array.isArray(meta.events) ? meta.events : [];
            return findEntityIndexByScopeId(list, parsed.eventId) >= 0;
        }

        if (parsed.kind === 'case-event') {
            const entry = getCaseById(state, parsed.caseId);
            const list = entry && Array.isArray(entry.events) ? entry.events : [];
            return findEntityIndexByScopeId(list, parsed.eventId) >= 0;
        }

        if (parsed.kind === 'case-vtt-initiative-entry') {
            const entry = getCaseById(state, parsed.caseId);
            const list = entry && entry.vtt && entry.vtt.initiative && Array.isArray(entry.vtt.initiative.entries)
                ? entry.vtt.initiative.entries
                : [];
            return findVTTInitiativeEntryIndexByScopeId(list, parsed.entryScopeId) >= 0;
        }

        if (parsed.kind === 'case-vtt-initiative-active') {
            const entry = getCaseById(state, parsed.caseId);
            const initiative = entry && entry.vtt && entry.vtt.initiative && typeof entry.vtt.initiative === 'object'
                ? entry.vtt.initiative
                : null;
            const activeEntryId = initiative ? toTrimmedString(initiative.activeEntryId, '', 120).trim() : '';
            return !!activeEntryId;
        }

        return false;
    };

    const ensureCaseForScope = (targetState, sourceState, caseId) => {
        let targetCase = getCaseById(targetState, caseId);
        if (targetCase) return targetCase;
        const sourceCase = getCaseById(sourceState, caseId);
        if (sourceCase) {
            targetCase = deepClone(sourceCase);
        } else {
            targetCase = {
                id: caseId,
                name: sanitizeCaseName(caseId, DEFAULT_CASE_NAME),
                board: sanitizeBoard(null),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            };
        }
        targetState.cases.items.push(targetCase);
        return targetCase;
    };

    const applyCasesMetaFromSource = (targetState, sourceState) => {
        const sourceMeta = buildCasesMetaSnapshot(sourceState);
        const nextItems = [];
        sourceMeta.items.forEach((entry) => {
            if (!entry || !entry.id) return;
            const existingTarget = getCaseById(targetState, entry.id);
            if (existingTarget) {
                nextItems.push({
                    ...existingTarget,
                    name: sanitizeCaseName(entry.name, existingTarget.name || DEFAULT_CASE_NAME)
                });
                return;
            }
            const sourceCase = getCaseById(sourceState, entry.id);
            if (sourceCase) {
                nextItems.push(deepClone(sourceCase));
                return;
            }
            nextItems.push({
                id: entry.id,
                name: sanitizeCaseName(entry.name, DEFAULT_CASE_NAME),
                board: sanitizeBoard(null),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            });
        });

        if (!nextItems.length) {
            nextItems.push({
                id: 'case_primary',
                name: DEFAULT_CASE_NAME,
                board: sanitizeBoard(null),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            });
        }

        targetState.cases.items = nextItems;
        if (!targetState.cases.items.some((entry) => entry.id === sourceMeta.activeCaseId)) {
            targetState.cases.activeCaseId = targetState.cases.items[0].id;
            return;
        }
        targetState.cases.activeCaseId = sourceMeta.activeCaseId;
    };

    const applyScopeFromSource = (targetState, sourceState, scopeToken) => {
        const scope = normalizeScopeToken(scopeToken);
        if (scope === SYNC_SCOPE_GLOBAL) {
            const clean = sanitizeState(sourceState);
            targetState.meta = clean.meta;
            targetState.campaign = clean.campaign;
            targetState.cases = clean.cases;
            targetState.board = clean.board;
            targetState.campaignContext = clean.campaignContext;
            targetState.campaignMeta = clean.campaignMeta;
            targetState.hq = clean.hq;
            return;
        }

        if (scope === 'campaign') {
            targetState.campaign = deepClone(sourceState.campaign);
            targetState.campaignContext = deepClone(sourceState.campaignContext);
            targetState.campaignMeta = deepClone(sourceState.campaignMeta);
            return;
        }

        if (scope === 'campaign.context') {
            targetState.campaignContext = deepClone(sourceState.campaignContext);
            return;
        }

        if (scope === 'campaign.meta') {
            targetState.campaignMeta = sanitizeCampaignMeta(sourceState.campaignMeta);
            return;
        }

        const campaignMetaEventOrderScopeMatch = scope.match(/^campaign\.meta\.events\.__order$/);
        if (campaignMetaEventOrderScopeMatch) {
            applyCampaignMetaEventOrderScopeFromSource(targetState, sourceState);
            return;
        }

        const campaignMetaEventEntityScopeMatch = scope.match(/^campaign\.meta\.events\.([a-z0-9_-]+)$/);
        if (campaignMetaEventEntityScopeMatch) {
            const scopeId = campaignMetaEventEntityScopeMatch[1];
            if (scopeId !== ENTITY_SCOPE_ORDER_TOKEN) applyCampaignMetaEventEntityScopeFromSource(targetState, sourceState, scopeId);
            return;
        }

        if (scope === 'campaign.meta.board') {
            if (!targetState.campaignMeta || typeof targetState.campaignMeta !== 'object') targetState.campaignMeta = sanitizeCampaignMeta(null);
            targetState.campaignMeta.board = sanitizeCampaignMeta(sourceState.campaignMeta).board;
            return;
        }

        if (scope === 'campaign.meta.events') {
            if (!targetState.campaignMeta || typeof targetState.campaignMeta !== 'object') targetState.campaignMeta = sanitizeCampaignMeta(null);
            targetState.campaignMeta.events = sanitizeCampaignMeta(sourceState.campaignMeta).events;
            return;
        }

        const campaignOrderScopeMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)\.__order$/);
        if (campaignOrderScopeMatch) {
            const key = campaignOrderScopeMatch[1];
            applyCampaignEntityOrderScopeFromSource(targetState, sourceState, key);
            return;
        }

        const campaignEntityScopeMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)\.([a-z0-9_-]+)$/);
        if (campaignEntityScopeMatch) {
            const key = campaignEntityScopeMatch[1];
            const scopeId = campaignEntityScopeMatch[2];
            if (scopeId !== ENTITY_SCOPE_ORDER_TOKEN) applyCampaignEntityScopeFromSource(targetState, sourceState, key, scopeId);
            return;
        }

        if (scope.startsWith('campaign.')) {
            const key = scope.slice('campaign.'.length);
            if (Object.prototype.hasOwnProperty.call(sourceState.campaign, key)) {
                targetState.campaign[key] = deepClone(sourceState.campaign[key]);
            }
            return;
        }

        if (scope === 'hq') {
            targetState.hq = deepClone(sourceState.hq);
            return;
        }

        if (scope === 'cases') {
            targetState.cases = deepClone(sourceState.cases);
            targetState.board = deepClone(sourceState.board);
            targetState.campaign.events = deepClone(sourceState.campaign.events);
            return;
        }

        if (scope === SYNC_SCOPE_CASES_META) {
            applyCasesMetaFromSource(targetState, sourceState);
            return;
        }

        const caseEventOrderScopeMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events\.__order$/);
        if (caseEventOrderScopeMatch) {
            const caseId = sanitizeCaseId(caseEventOrderScopeMatch[1], 'case_primary');
            applyCaseEventOrderScopeFromSource(targetState, sourceState, caseId);
            return;
        }

        const caseEventEntityScopeMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events\.([a-z0-9_-]+)$/);
        if (caseEventEntityScopeMatch) {
            const caseId = sanitizeCaseId(caseEventEntityScopeMatch[1], 'case_primary');
            const scopeId = caseEventEntityScopeMatch[2];
            if (scopeId !== ENTITY_SCOPE_ORDER_TOKEN) applyCaseEventEntityScopeFromSource(targetState, sourceState, caseId, scopeId);
            return;
        }

        const caseVTTInitiativeEntryScopeMatch = scope.match(/^cases\.([a-z0-9_-]+)\.vtt\.initiative\.entries\.([a-z0-9_-]+)$/);
        if (caseVTTInitiativeEntryScopeMatch) {
            const caseId = sanitizeCaseId(caseVTTInitiativeEntryScopeMatch[1], 'case_primary');
            const scopeId = caseVTTInitiativeEntryScopeMatch[2];
            if (scopeId !== ENTITY_SCOPE_ORDER_TOKEN) applyCaseVTTInitiativeEntryScopeFromSource(targetState, sourceState, caseId, scopeId);
            return;
        }

        const caseVTTInitiativeActiveScopeMatch = scope.match(/^cases\.([a-z0-9_-]+)\.vtt\.initiative\.active$/);
        if (caseVTTInitiativeActiveScopeMatch) {
            const caseId = sanitizeCaseId(caseVTTInitiativeActiveScopeMatch[1], 'case_primary');
            applyCaseVTTInitiativeActiveScopeFromSource(targetState, sourceState, caseId);
            return;
        }

        const caseFieldMatch = scope.match(/^cases\.([a-z0-9_-]+)\.(board|events|name|leads|vtt)$/);
        if (caseFieldMatch) {
            const caseId = caseFieldMatch[1];
            const field = caseFieldMatch[2];
            const targetCase = ensureCaseForScope(targetState, sourceState, caseId);
            const sourceCase = getCaseById(sourceState, caseId) || {
                id: caseId,
                name: targetCase.name || DEFAULT_CASE_NAME,
                board: sanitizeBoard(null),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            };
            if (field === 'board') targetCase.board = deepClone(sourceCase.board);
            if (field === 'events') targetCase.events = deepClone(sourceCase.events);
            if (field === 'name') targetCase.name = sanitizeCaseName(sourceCase.name, targetCase.name || DEFAULT_CASE_NAME);
            if (field === 'leads') targetCase.leads = sanitizeLeadList(sourceCase.leads);
            if (field === 'vtt') targetCase.vtt = sanitizeVTTState(sourceCase.vtt);
            return;
        }

        const caseWholeMatch = scope.match(/^cases\.([a-z0-9_-]+)$/);
        if (caseWholeMatch) {
            const caseId = caseWholeMatch[1];
            const sourceCase = getCaseById(sourceState, caseId);
            if (!sourceCase) return;
            const targetCase = ensureCaseForScope(targetState, sourceState, caseId);
            targetCase.name = sanitizeCaseName(sourceCase.name, targetCase.name || DEFAULT_CASE_NAME);
            targetCase.board = deepClone(sourceCase.board);
            targetCase.events = deepClone(sourceCase.events);
            targetCase.leads = sanitizeLeadList(sourceCase.leads);
            targetCase.vtt = sanitizeVTTState(sourceCase.vtt);
            return;
        }

        if (scope === 'board') {
            targetState.board = deepClone(sourceState.board);
        }
    };

    const mergeStateByScopes = (baseState, sourceState, scopes) => {
        const base = sanitizeState(baseState);
        const source = sanitizeState(sourceState);
        const scopeList = normalizeScopeList(scopes);
        if (scopeList.includes(SYNC_SCOPE_GLOBAL)) return source;

        scopeList.forEach((scope) => {
            applyScopeFromSource(base, source, scope);
        });

        const clean = sanitizeState(base);
        const active = clean.cases.items.find((entry) => entry && entry.id === clean.cases.activeCaseId) || clean.cases.items[0];
        if (active) {
            clean.board = active.board;
            clean.campaign.events = active.events;
        }
        return clean;
    };

    const isFiniteNum = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed);
    };

    const buildLocalOnlyBoardLayoutMap = (state) => {
        const perCaseLayouts = new Map();
        const sourceCases = state && state.cases && Array.isArray(state.cases.items) ? state.cases.items : [];

        sourceCases.forEach((caseEntry) => {
            if (!caseEntry || !caseEntry.id || !caseEntry.board || !Array.isArray(caseEntry.board.nodes)) return;
            const layout = new Map();
            caseEntry.board.nodes.forEach((node) => {
                if (!node || !node.id) return;
                if (!isFiniteNum(node.x) || !isFiniteNum(node.y)) return;
                layout.set(node.id, { x: Number(node.x), y: Number(node.y) });
            });
            perCaseLayouts.set(caseEntry.id, layout);
        });

        if (!perCaseLayouts.size) {
            const fallback = new Map();
            const source = state && state.board && Array.isArray(state.board.nodes) ? state.board.nodes : [];
            source.forEach((node) => {
                if (!node || !node.id) return;
                if (!isFiniteNum(node.x) || !isFiniteNum(node.y)) return;
                fallback.set(node.id, { x: Number(node.x), y: Number(node.y) });
            });
            perCaseLayouts.set('case_primary', fallback);
        }

        return perCaseLayouts;
    };

    const applyBoardLayout = (boardState, layoutMap) => {
        const board = sanitizeBoard(boardState);
        const layout = layoutMap instanceof Map ? layoutMap : new Map();

        board.nodes = board.nodes.map((node, idx) => {
            const base = node && typeof node === 'object' ? { ...node } : {};
            const local = base.id ? layout.get(base.id) : null;

            if (local) {
                base.x = local.x;
                base.y = local.y;
                return base;
            }

            if (!isFiniteNum(base.x)) base.x = 120 + (idx % 6) * 240;
            else base.x = Number(base.x);
            if (!isFiniteNum(base.y)) base.y = 120 + Math.floor(idx / 6) * 150;
            else base.y = Number(base.y);
            return base;
        });

        return board;
    };

    const stripBoardNodeLocalFields = (boardState) => {
        const board = sanitizeBoard(boardState);
        board.nodes = board.nodes.map((node) => {
            if (!node || typeof node !== 'object') return node;
            const copy = { ...node };
            delete copy.x;
            delete copy.y;
            return copy;
        });
        return board;
    };

    const mergeRemoteBoardWithLocalLayout = (remoteState, localState) => {
        const merged = sanitizeState(remoteState);
        const localLayouts = buildLocalOnlyBoardLayoutMap(localState);
        const localCampaignMeta = sanitizeCampaignMeta(localState && localState.campaignMeta);
        const remoteCampaignMeta = sanitizeCampaignMeta(merged.campaignMeta);

        merged.campaignMeta = sanitizeCampaignMeta({
            ...remoteCampaignMeta,
            board: hasBoardContent(localCampaignMeta.board)
                ? sanitizeBoard(localCampaignMeta.board)
                : sanitizeBoard(remoteCampaignMeta.board)
        });

        if (merged.cases && Array.isArray(merged.cases.items)) {
            merged.cases.items = merged.cases.items.map((caseEntry) => {
                const localCase = getCaseById(localState, caseEntry.id);
                const localLayout = localLayouts.get(caseEntry.id) || new Map();
                const localBoard = localCase && localCase.board ? localCase.board : null;
                const remoteBoard = caseEntry && caseEntry.board ? caseEntry.board : null;
                const selectedBoard = hasBoardContent(localBoard) ? localBoard : remoteBoard;
                const localVTT = localCase && localCase.vtt ? localCase.vtt : null;
                const remoteVTT = caseEntry && caseEntry.vtt ? caseEntry.vtt : null;
                return {
                    ...caseEntry,
                    board: applyBoardLayout(selectedBoard, localLayout),
                    vtt: hasVTTContent(localVTT) ? sanitizeVTTState(localVTT) : sanitizeVTTState(remoteVTT)
                };
            });

            const activeCase = merged.cases.items.find((item) => item.id === merged.cases.activeCaseId) || merged.cases.items[0];
            if (activeCase) merged.board = activeCase.board;
            return merged;
        }

        const fallbackLayout = localLayouts.get('case_primary') || new Map();
        merged.board = applyBoardLayout(merged.board, fallbackLayout);
        return merged;
    };

    const stripLocalOnlyFieldsForCloud = (state) => {
        const cloud = sanitizeState(state);
        if (cloud.campaign && typeof cloud.campaign === 'object') {
            cloud.campaign.events = [];
        }
        if (cloud.campaignMeta && typeof cloud.campaignMeta === 'object') {
            delete cloud.campaignMeta.board;
        }
        if (cloud.cases && Array.isArray(cloud.cases.items)) {
            cloud.cases.items = cloud.cases.items.map((caseEntry) => {
                const nextEntry = { ...caseEntry };
                delete nextEntry.board;
                delete nextEntry.vtt;
                return nextEntry;
            });
            delete cloud.board;
            return cloud;
        }

        delete cloud.board;
        return cloud;
    };

    const parseStoredSyncConfig = () => {
        try {
            const raw = localStorage.getItem(SYNC_CONFIG_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (err) {
            console.warn('RTF_STORE: Failed to parse sync config', err);
            return null;
        }
    };

    const sanitizeSyncBackendMode = (value) => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (raw === SYNC_BACKEND_NORMALIZED || raw === 'norm' || raw === 'normalized-only') return SYNC_BACKEND_NORMALIZED;
        if (raw === SYNC_BACKEND_LEGACY_MIRROR || raw === 'legacy+mirror' || raw === 'legacy-mirror' || raw === 'mirror' || raw === 'dualwrite') {
            return SYNC_BACKEND_LEGACY_MIRROR;
        }
        return SYNC_BACKEND_LEGACY;
    };

    const sanitizeSyncConfig = (config) => {
        const source = config && typeof config === 'object' ? config : {};
        return {
            enabled: !!source.enabled,
            autoConnect: source.autoConnect !== false,
            supabaseUrl: typeof source.supabaseUrl === 'string' ? source.supabaseUrl.trim() : '',
            anonKey: typeof source.anonKey === 'string' ? source.anonKey.trim() : '',
            campaignId: sanitizeCampaignId(source.campaignId),
            profileName: sanitizeProfileName(source.profileName),
            loginEmail: typeof source.loginEmail === 'string' ? source.loginEmail.trim() : '',
            loginPassword: typeof source.loginPassword === 'string' ? source.loginPassword : '',
            collabRelayUrl: typeof source.collabRelayUrl === 'string' ? source.collabRelayUrl.trim() : '',
            backendMode: sanitizeSyncBackendMode(source.backendMode),
            schema: sanitizeIdentifier(source.schema, DEFAULT_SYNC_CONFIG.schema),
            tableName: sanitizeIdentifier(source.tableName, DEFAULT_SYNC_CONFIG.tableName),
            boardRoomsTable: sanitizeIdentifier(source.boardRoomsTable, DEFAULT_SYNC_CONFIG.boardRoomsTable),
            boardHistoryTable: sanitizeIdentifier(source.boardHistoryTable, DEFAULT_SYNC_CONFIG.boardHistoryTable),
            normalizedCoreTable: sanitizeIdentifier(source.normalizedCoreTable, DEFAULT_SYNC_CONFIG.normalizedCoreTable),
            normalizedHQTable: sanitizeIdentifier(source.normalizedHQTable, DEFAULT_SYNC_CONFIG.normalizedHQTable),
            normalizedCaseStateTable: sanitizeIdentifier(source.normalizedCaseStateTable, DEFAULT_SYNC_CONFIG.normalizedCaseStateTable),
            normalizedCaseBoardsTable: sanitizeIdentifier(source.normalizedCaseBoardsTable, DEFAULT_SYNC_CONFIG.normalizedCaseBoardsTable),
            normalizedCaseEventsTable: sanitizeIdentifier(source.normalizedCaseEventsTable, DEFAULT_SYNC_CONFIG.normalizedCaseEventsTable),
            normalizedScopeVersionsTable: sanitizeIdentifier(source.normalizedScopeVersionsTable, DEFAULT_SYNC_CONFIG.normalizedScopeVersionsTable),
            normalizedPlayersTable: sanitizeIdentifier(source.normalizedPlayersTable, DEFAULT_SYNC_CONFIG.normalizedPlayersTable),
            normalizedNPCsTable: sanitizeIdentifier(source.normalizedNPCsTable, DEFAULT_SYNC_CONFIG.normalizedNPCsTable),
            normalizedLocationsTable: sanitizeIdentifier(source.normalizedLocationsTable, DEFAULT_SYNC_CONFIG.normalizedLocationsTable),
            normalizedRequisitionsTable: sanitizeIdentifier(source.normalizedRequisitionsTable, DEFAULT_SYNC_CONFIG.normalizedRequisitionsTable),
            normalizedEncountersTable: sanitizeIdentifier(source.normalizedEncountersTable, DEFAULT_SYNC_CONFIG.normalizedEncountersTable),
            syncDelayMs: Math.max(1000, toNonNegativeInt(source.syncDelayMs, DEFAULT_SYNC_CONFIG.syncDelayMs) || DEFAULT_SYNC_CONFIG.syncDelayMs),
            reconcileIntervalMs: Math.max(60000, toNonNegativeInt(source.reconcileIntervalMs, DEFAULT_SYNC_CONFIG.reconcileIntervalMs) || DEFAULT_SYNC_CONFIG.reconcileIntervalMs),
            presenceHeartbeatMs: Math.max(3000, toNonNegativeInt(source.presenceHeartbeatMs, DEFAULT_SYNC_CONFIG.presenceHeartbeatMs) || DEFAULT_SYNC_CONFIG.presenceHeartbeatMs),
            lockTtlMs: Math.max(5000, toNonNegativeInt(source.lockTtlMs, DEFAULT_SYNC_CONFIG.lockTtlMs) || DEFAULT_SYNC_CONFIG.lockTtlMs)
        };
    };

    const getMergedSyncConfig = () => {
        const boot = global.RTF_SYNC_BOOTSTRAP && typeof global.RTF_SYNC_BOOTSTRAP === 'object' ? global.RTF_SYNC_BOOTSTRAP : null;
        const stored = parseStoredSyncConfig();
        return sanitizeSyncConfig({ ...DEFAULT_SYNC_CONFIG, ...(boot || {}), ...(stored || {}) });
    };

    const shouldAutoConnectOnThisPage = () => {
        const body = global.document && global.document.body ? global.document.body : null;
        return !!(body && body.dataset && body.dataset.syncAutoconnect === '1');
    };

    const isVTTPage = () => {
        try {
            return /\/vtt\.html$/i.test(String(global.location && global.location.pathname || ''));
        } catch (err) {
            return false;
        }
    };

    const isBoardPage = () => {
        try {
            return /\/(?:board|campaign-board)\.html$/i.test(String(global.location && global.location.pathname || ''));
        } catch (err) {
            return false;
        }
    };

    const isYjsCollabPage = () => isBoardPage() || isVTTPage();

    const coerceAutoConnectBackendMode = (config) => {
        const clean = sanitizeSyncConfig(config);
        if (!clean.enabled || !clean.autoConnect) {
            return { config: clean, changed: false };
        }
        if (clean.backendMode !== SYNC_BACKEND_LEGACY) {
            return { config: clean, changed: false };
        }
        return {
            config: { ...clean, backendMode: SYNC_BACKEND_NORMALIZED },
            changed: true
        };
    };

    class Store {
        constructor() {
            this.state = deepClone(DEFAULT_STATE);
            const coercedSyncConfig = coerceAutoConnectBackendMode(getMergedSyncConfig());

            this.sync = {
                config: coercedSyncConfig.config,
                client: null,
                channel: null,
                clientKey: '',
                instanceId: 'client_' + Math.random().toString(36).slice(2, 10),
                pushTimer: null,
                reconcileTimer: null,
                presenceTimer: null,
                presenceTrackingInFlight: false,
                pushInFlight: false,
                pushQueued: false,
                normalizedPullTimer: null,
                normalizedPendingScopes: new Set(),
                normalizedPendingScopeMeta: new Map(),
                lastRemoteSeenAt: 0,
                lastPushAt: 0,
                lastPullAt: 0,
                userId: '',
                authCheckedAt: 0,
                authPromise: null,
                supabaseLoadPromise: null,
                lastCloudStateSig: '',
                localDirtyScopes: new Set(parseStoredDirtyScopes()),
                scopeBaselines: parseStoredScopeBaselines(),
                lastSyncedState: sanitizeState(this.state),
                lastKnownRemoteRevision: 0,
                pendingConflict: null,
                localSoftLocks: new Map(),
                remoteSoftLocks: new Map(),
                remotePeers: new Map(),
                hadStoredStateAtBoot: false,
                lastForegroundPullAt: 0,
                autoSyncBootTimer: null,
                roomHydrationInflight: new Map(),
                roomHydrationSeenAt: new Map(),
                queryCache: new Map()
            };

            if (coercedSyncConfig.changed) {
                try {
                    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.sync.config));
                } catch (err) {
                    console.warn('RTF_STORE: Failed to persist migrated sync backend mode', err);
                }
            }

            this.isApplyingRemote = false;
            this.syncStatusListeners = new Set();

            this.syncStatus = {
                mode: this.sync.config.enabled ? 'idle' : 'disabled',
                message: this.sync.config.enabled ? 'Cloud sync is signed out or standing by until needed.' : 'Cloud sync is disabled.',
                enabled: this.sync.config.enabled,
                connected: false,
                campaignId: this.sync.config.campaignId,
                profileName: this.sync.config.profileName,
                backendMode: this.sync.config.backendMode,
                userId: '',
                pendingPush: false,
                lastPushAt: null,
                lastPullAt: null,
                lastError: '',
                localRevision: 0,
                remoteRevision: 0,
                revisionMode: 'optimistic',
                dirtyScopes: 0,
                presencePeers: 0,
                activeRemoteLocks: 0,
                pendingConflict: false,
                conflictScopes: [],
                updatedAt: Date.now()
            };

            this.onStorageSyncEvent = this.onStorageSyncEvent.bind(this);
            this.onWindowFocus = this.onWindowFocus.bind(this);
            this.onDocumentVisibilityChange = this.onDocumentVisibilityChange.bind(this);
            if (typeof global.addEventListener === 'function') {
                global.addEventListener('storage', this.onStorageSyncEvent);
                global.addEventListener('focus', this.onWindowFocus);
            }
            if (global.document && typeof global.document.addEventListener === 'function') {
                global.document.addEventListener('visibilitychange', this.onDocumentVisibilityChange);
            }

            this.load();
            this.updateSyncStatus({});

            if (this.sync.config.enabled && this.sync.config.autoConnect && shouldAutoConnectOnThisPage()) {
                this.scheduleAutoSyncBoot();
            }
        }

        hasLiveSyncConnection() {
            return !!this.sync.channel;
        }

        isAutoSyncEnabledOnPage() {
            return !!(this.sync.config
                && this.sync.config.enabled
                && this.sync.config.autoConnect
                && shouldAutoConnectOnThisPage());
        }

        canAutoPushCloud(reason = 'scheduled') {
            if (!this.sync.config || !this.sync.config.enabled) return false;
            if (this.hasLiveSyncConnection()) return true;
            if (!isYjsCollabPage() && shouldAutoConnectOnThisPage()) {
                return !!(this.sync.config.supabaseUrl && this.sync.config.anonKey && this.sync.config.campaignId);
            }
            return false;
        }

        scheduleAutoSyncBoot() {
            if (!this.isAutoSyncEnabledOnPage()) return;
            if (this.sync.autoSyncBootTimer) clearTimeout(this.sync.autoSyncBootTimer);
            this.sync.autoSyncBootTimer = setTimeout(() => {
                this.sync.autoSyncBootTimer = null;
                this.ensureCloudAccess({
                    silent: true,
                    requirePageSync: true
                }).then((result) => {
                    if (!result || !result.ok) return;
                    this.updateSyncStatus({
                        mode: 'idle',
                        connected: false,
                        enabled: true,
                        userId: result.userId || this.sync.userId || '',
                        campaignId: this.sync.config.campaignId,
                        profileName: this.sync.config.profileName,
                        message: result.userId
                            ? 'Signed in. Cloud sync will fetch or push only when needed.'
                            : 'Cloud sync is standing by until needed.',
                        lastError: ''
                    });
                }).catch(() => { });
            }, AUTO_SYNC_BOOT_DELAY_MS);
        }

        onStorageSyncEvent(event) {
            if (!event || event.key !== STORE_KEY) return;
            if (!event.newValue || event.newValue === event.oldValue) return;

            try {
                const parsed = JSON.parse(event.newValue);
                if (!parsed || typeof parsed !== 'object') return;

                const updatedAt = toTimestamp(parsed.meta && parsed.meta.updated, Date.now());
                const revision = toNonNegativeInt(parsed.meta && parsed.meta.syncRevision, 0);
                const applied = this.applyRemoteState(parsed, {
                    source: 'storage',
                    updatedAt,
                    revision,
                    clearDirty: true
                });
                if (!applied) return;

                this.sync.lastPullAt = Date.now();
                this.updateSyncStatus({
                    lastPullAt: this.sync.lastPullAt,
                    lastError: ''
                });
            } catch (err) {
                console.warn('RTF_STORE: Failed to apply cross-tab storage update', err);
            }
        }

        onWindowFocus() {
            this.scheduleForegroundPull('focus');
        }

        onDocumentVisibilityChange() {
            if (!global.document || global.document.visibilityState !== 'visible') return;
            this.scheduleForegroundPull('visibility');
        }

        scheduleForegroundPull(reason = 'foreground') {
            if (!this.hasLiveSyncConnection()) return;
            const now = Date.now();
            const minInterval = 2000;
            if (now - toTimestamp(this.sync.lastForegroundPullAt, 0) < minInterval) return;
            this.sync.lastForegroundPullAt = now;
            this.pullFromCloud({
                force: false,
                silent: true,
                reason,
                requirePageSync: true
            }).catch(() => { });
        }

        persistScopeBaselines() {
            try {
                const payload = {};
                if (this.sync.scopeBaselines && this.sync.scopeBaselines.size) {
                    this.sync.scopeBaselines.forEach((baseline, scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (!isGranularNormalizedLwwScope(scope) || !baseline || typeof baseline !== 'object') return;
                        payload[scope] = {
                            revision: toNonNegativeInt(baseline.revision, 0),
                            updatedAt: toTimestamp(baseline.updatedAt, 0),
                            exists: baseline.exists !== false,
                            signature: typeof baseline.signature === 'string' ? baseline.signature : ''
                        };
                    });
                }
                if (!Object.keys(payload).length) {
                    localStorage.removeItem(SCOPE_BASELINES_KEY);
                    return;
                }
                localStorage.setItem(SCOPE_BASELINES_KEY, JSON.stringify(payload));
            } catch (err) {
                console.warn('RTF_STORE: Failed to persist scope baselines cache', err);
            }
        }

        getScopeBaseline(scopeToken) {
            const scope = normalizeScopeToken(scopeToken);
            if (!isGranularNormalizedLwwScope(scope) || !this.sync.scopeBaselines) return null;
            const baseline = this.sync.scopeBaselines.get(scope);
            if (!baseline || typeof baseline !== 'object') return null;
            return {
                revision: toNonNegativeInt(baseline.revision, 0),
                updatedAt: toTimestamp(baseline.updatedAt, 0),
                exists: baseline.exists !== false,
                signature: typeof baseline.signature === 'string' ? baseline.signature : ''
            };
        }

        setScopeBaseline(scopeToken, baseline) {
            const scope = normalizeScopeToken(scopeToken);
            if (!isGranularNormalizedLwwScope(scope)) return false;
            if (!this.sync.scopeBaselines) this.sync.scopeBaselines = new Map();
            if (!baseline || typeof baseline !== 'object') {
                this.sync.scopeBaselines.delete(scope);
                return true;
            }
            this.sync.scopeBaselines.set(scope, {
                revision: toNonNegativeInt(baseline.revision, 0),
                updatedAt: toTimestamp(baseline.updatedAt, 0),
                exists: baseline.exists !== false,
                signature: typeof baseline.signature === 'string' ? baseline.signature : ''
            });
            return true;
        }

        replaceLocalDirtyScopes(scopes, timestamp = Date.now()) {
            const list = Array.isArray(scopes) ? filterCloudSyncScopes(scopes) : [];
            this.clearLocalDirtyScopes();
            if (list.length) this.markLocalDirtyScopes(list, timestamp);
            return list;
        }

        recordScopeUpdated(scopes, timestamp = Date.now()) {
            if (!this.state.meta || typeof this.state.meta !== 'object') {
                this.state.meta = deepClone(DEFAULT_STATE.meta);
            }
            if (!this.state.meta.scopeUpdated || typeof this.state.meta.scopeUpdated !== 'object') {
                this.state.meta.scopeUpdated = {};
            }
            normalizeScopeList(scopes).forEach((scope) => {
                this.state.meta.scopeUpdated[scope] = timestamp;
            });
        }

        getNormalizedRemoteScopeMeta(remoteRow, scopeToken) {
            const scope = normalizeScopeToken(scopeToken);
            if (!isGranularNormalizedLwwScope(scope)) return null;

            const directMeta = remoteRow && remoteRow.scopeMeta instanceof Map
                ? remoteRow.scopeMeta.get(scope)
                : null;
            if (directMeta && typeof directMeta === 'object') {
                return {
                    revision: toNonNegativeInt(directMeta.revision, 0),
                    updatedAt: toTimestamp(directMeta.updatedAt, 0),
                    exists: directMeta.exists !== false,
                    signature: typeof directMeta.signature === 'string' ? directMeta.signature : ''
                };
            }

            const remoteSnapshot = remoteRow && remoteRow.state ? buildScopeSnapshot(remoteRow.state) : null;

            return {
                revision: toNonNegativeInt(remoteRow && remoteRow.revision, 0),
                updatedAt: toTimestamp(remoteRow && remoteRow.updatedAt, 0),
                exists: !!(remoteSnapshot && remoteSnapshot.has(scope)),
                signature: remoteSnapshot && remoteSnapshot.has(scope)
                    ? JSON.stringify(remoteSnapshot.get(scope))
                    : ''
            };
        }

        didRemoteGranularScopeChangeSinceBaseline(scopeToken, remoteRow, explicitBaseline = null) {
            const scope = normalizeScopeToken(scopeToken);
            if (!isGranularNormalizedLwwScope(scope)) return false;
            const baseline = explicitBaseline && typeof explicitBaseline === 'object'
                ? {
                    revision: toNonNegativeInt(explicitBaseline.revision, 0),
                    updatedAt: toTimestamp(explicitBaseline.updatedAt, 0),
                    exists: explicitBaseline.exists !== false,
                    signature: typeof explicitBaseline.signature === 'string' ? explicitBaseline.signature : ''
                }
                : this.getScopeBaseline(scope);
            if (!baseline) return false;

            const remoteMeta = this.getNormalizedRemoteScopeMeta(remoteRow, scope);
            if (!remoteMeta) return false;
            if ((baseline.exists !== false) !== (remoteMeta.exists !== false)) return true;
            if (!remoteMeta.exists && !baseline.exists) return false;
            if ((baseline.signature || remoteMeta.signature) && baseline.signature !== remoteMeta.signature) return true;
            return toNonNegativeInt(remoteMeta.revision, 0) > toNonNegativeInt(baseline.revision, 0);
        }

        syncScopeBaselinesFromRemoteRow(remoteRow, scopes = null, options = {}) {
            if (!this.isNormalizedReadMode()) return;
            const opts = options && typeof options === 'object' ? options : {};
            const skipDirtyScopes = !!opts.skipDirtyScopes;
            const currentDirty = skipDirtyScopes && this.sync.localDirtyScopes
                ? new Set(this.sync.localDirtyScopes)
                : null;

            const requestedScopes = Array.isArray(scopes)
                ? scopes.slice()
                : (scopes ? [scopes] : null);
            const scopeSet = new Set();
            if (requestedScopes && requestedScopes.length) {
                requestedScopes.forEach((scopeToken) => {
                    const scope = normalizeScopeToken(scopeToken);
                    if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                });
            } else {
                if (this.sync.scopeBaselines) {
                    this.sync.scopeBaselines.forEach((_row, scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                    });
                }
                if (remoteRow && remoteRow.scopeMeta instanceof Map) {
                    remoteRow.scopeMeta.forEach((_row, scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                    });
                }
                if ((!remoteRow || !(remoteRow.scopeMeta instanceof Map)) && remoteRow && remoteRow.state) {
                    buildScopeSnapshot(remoteRow.state).forEach((_value, scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                    });
                }
            }

            scopeSet.forEach((scope) => {
                if (currentDirty && currentDirty.has(scope)) return;
                const meta = this.getNormalizedRemoteScopeMeta(remoteRow, scope);
                if (!meta) return;
                this.setScopeBaseline(scope, meta);
            });
            this.persistScopeBaselines();
        }

        syncScopeBaselinesFromLocalState(scopes = null, meta = {}) {
            if (!this.isNormalizedReadMode()) return;
            const opts = meta && typeof meta === 'object' ? meta : {};
            const revision = toNonNegativeInt(
                opts.revision,
                toNonNegativeInt(this.state && this.state.meta && this.state.meta.syncRevision, 0)
            );
            const updatedAt = toTimestamp(
                opts.updatedAt,
                toTimestamp(this.state && this.state.meta && this.state.meta.updated, Date.now())
            );

            const requestedScopes = Array.isArray(scopes)
                ? scopes.slice()
                : (scopes ? [scopes] : null);
            const scopeSet = new Set();
            if (requestedScopes && requestedScopes.length) {
                requestedScopes.forEach((scopeToken) => {
                    const scope = normalizeScopeToken(scopeToken);
                    if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                });
            } else {
                if (this.sync.scopeBaselines) {
                    this.sync.scopeBaselines.forEach((_row, scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                    });
                }
                buildScopeSnapshot(this.state).forEach((_value, scopeToken) => {
                    const scope = normalizeScopeToken(scopeToken);
                    if (isGranularNormalizedLwwScope(scope)) scopeSet.add(scope);
                });
            }

            const snapshot = buildScopeSnapshot(this.state);

            scopeSet.forEach((scope) => {
                this.setScopeBaseline(scope, {
                    revision,
                    updatedAt,
                    exists: snapshot.has(scope),
                    signature: snapshot.has(scope) ? JSON.stringify(snapshot.get(scope)) : ''
                });
            });
            this.persistScopeBaselines();
        }

        ensureCaseStateIntegrity() {
            if (!this.state || typeof this.state !== 'object') {
                this.state = sanitizeState(null);
            }
            if (!this.state.campaign || typeof this.state.campaign !== 'object') {
                this.state.campaign = sanitizeCampaign(null);
            }
            if (!this.state.campaignMeta || typeof this.state.campaignMeta !== 'object') {
                this.state.campaignMeta = sanitizeCampaignMeta(this.state.campaignMeta);
            } else {
                this.state.campaignMeta = sanitizeCampaignMeta(this.state.campaignMeta);
            }

            const cases = this.state.cases;
            if (!cases || !Array.isArray(cases.items) || !cases.items.length) {
                this.state.cases = sanitizeCases(this.state.cases, this.state.campaign, this.state.board);
            }

            if (!this.state.cases.items.some((entry) => entry && entry.id === this.state.cases.activeCaseId)) {
                this.state.cases.activeCaseId = this.state.cases.items[0].id;
            }
            if (!this.state.campaignContext || typeof this.state.campaignContext !== 'object') {
                this.state.campaignContext = sanitizeCampaignContext(this.state.campaignContext, this.state.cases);
            }

            return this.state.cases;
        }

        ensureCampaignMetaIntegrity() {
            this.ensureCaseStateIntegrity();
            this.state.campaignMeta = sanitizeCampaignMeta(this.state.campaignMeta);
            return this.state.campaignMeta;
        }

        ensureCampaignContextIntegrity() {
            const cases = this.ensureCaseStateIntegrity();
            this.state.campaignContext = sanitizeCampaignContext(this.state.campaignContext, cases);
            return this.state.campaignContext;
        }

        normalizeCampaignScopeCaseState(scope, preferredActiveCaseId = '') {
            if (!scope || typeof scope !== 'object') {
                return { caseOrder: [], caseStatus: {}, activeCaseId: '' };
            }
            const normalized = normalizeCampaignScopeCaseState(scope, preferredActiveCaseId);
            scope.caseOrder = normalized.caseOrder;
            scope.caseStatus = normalized.caseStatus;
            scope.activeCaseId = normalized.activeCaseId;
            return normalized;
        }

        getCaseEntry(caseId = null, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const createIfMissing = !!opts.createIfMissing;
            const strict = !!opts.strict;
            const cases = this.ensureCaseStateIntegrity();
            const desiredId = sanitizeCaseId(caseId || cases.activeCaseId, cases.activeCaseId);
            let entry = cases.items.find((item) => item && item.id === desiredId);

            if (!entry && createIfMissing) {
                const prettyName = sanitizeCaseName(String(desiredId || '').replace(/[-_]+/g, ' '), DEFAULT_CASE_NAME);
                entry = {
                    id: desiredId,
                    name: prettyName,
                    board: sanitizeBoard({ name: prettyName }),
                    events: [],
                    leads: [],
                    vtt: createDefaultVTTState()
                };
                cases.items.push(entry);
            }

            if (!entry && strict) return null;
            if (!entry) entry = cases.items.find((item) => item && item.id === cases.activeCaseId) || cases.items[0];
            if (!entry.board || typeof entry.board !== 'object') entry.board = sanitizeBoard(null);
            if (!Array.isArray(entry.events)) entry.events = [];
            if (!Array.isArray(entry.leads)) entry.leads = [];
            entry.vtt = sanitizeVTTState(entry.vtt);
            return entry || null;
        }

        syncActiveCaseLegacyState() {
            const active = this.getCaseEntry();
            if (!active) return;
            // Backward compatibility: legacy state paths mirror current active case.
            this.state.board = active.board;
            this.state.campaign.events = active.events;
        }

        getCases() {
            const cases = this.ensureCaseStateIntegrity();
            return cases.items.map((entry) => ({
                id: entry.id,
                name: entry.name
            }));
        }

        getActiveCaseId() {
            const cases = this.ensureCaseStateIntegrity();
            return cases.activeCaseId;
        }

        getActiveCase() {
            const active = this.getCaseEntry();
            return active ? deepClone({ id: active.id, name: active.name }) : null;
        }

        getCampaignScopeEntry(scopeId = null, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const strict = !!opts.strict;
            const createIfMissing = !!opts.createIfMissing;
            const context = this.ensureCampaignContextIntegrity();
            const desiredId = sanitizeScopeId(scopeId || context.activeScopeId, context.activeScopeId);
            let entry = context.scopes.find((item) => item && item.id === desiredId);

            if (!entry && createIfMissing) {
                const cases = this.ensureCaseStateIntegrity();
                const caseOrder = cases.items.map((item) => item && item.id).filter(Boolean);
                const activeCaseId = caseOrder.includes(cases.activeCaseId) ? cases.activeCaseId : (caseOrder[0] || 'case_primary');
                entry = {
                    id: desiredId,
                    name: sanitizeCaseName(String(desiredId || '').replace(/[-_]+/g, ' '), DEFAULT_CAMPAIGN_SCOPE_NAME),
                    description: '',
                    activeCaseId,
                    caseOrder,
                    caseStatus: {},
                    boardRefs: []
                };
                this.normalizeCampaignScopeCaseState(entry, activeCaseId);
                context.scopes.push(entry);
            }

            if (!entry && strict) return null;
            if (!entry) entry = context.scopes.find((item) => item && item.id === context.activeScopeId) || context.scopes[0];
            return entry || null;
        }

        getCampaignScopes() {
            const context = this.ensureCampaignContextIntegrity();
            return context.scopes.map((entry) => ({
                id: entry.id,
                name: entry.name,
                description: entry.description,
                activeCaseId: entry.activeCaseId,
                caseOrder: Array.isArray(entry.caseOrder) ? entry.caseOrder.slice() : [],
                caseStatus: deepClone(entry.caseStatus && typeof entry.caseStatus === 'object' ? entry.caseStatus : {}),
                boardRefs: Array.isArray(entry.boardRefs) ? deepClone(entry.boardRefs) : []
            }));
        }

        getActiveCampaignScopeId() {
            const context = this.ensureCampaignContextIntegrity();
            return context.activeScopeId;
        }

        getActiveCampaignScope() {
            const scope = this.getCampaignScopeEntry();
            return scope ? deepClone(scope) : null;
        }

        setActiveCampaignScope(scopeId, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const syncCase = opts.syncCase !== false;
            const context = this.ensureCampaignContextIntegrity();
            const targetId = sanitizeScopeId(scopeId, context.activeScopeId);
            const target = context.scopes.find((entry) => entry && entry.id === targetId);
            if (!target) return false;
            this.normalizeCampaignScopeCaseState(target, target.activeCaseId);
            const changed = context.activeScopeId !== targetId;
            if (changed) context.activeScopeId = targetId;

            let caseChanged = false;
            if (syncCase) {
                const cases = this.ensureCaseStateIntegrity();
                const nextCaseId = sanitizeCaseIdOptional(target.activeCaseId) || sanitizeCaseIdOptional(target.caseOrder && target.caseOrder[0]);
                if (nextCaseId && cases.items.some((entry) => entry && entry.id === nextCaseId) && cases.activeCaseId !== nextCaseId) {
                    cases.activeCaseId = nextCaseId;
                    caseChanged = true;
                }
            }

            if (!changed && !caseChanged) return true;
            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return true;
        }

        createCampaignScope(name = '', options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const syncCase = opts.syncCase !== false;
            const context = this.ensureCampaignContextIntegrity();
            const cases = this.ensureCaseStateIntegrity();
            const cleanName = sanitizeCaseName(name, 'New Scope');
            const baseId = sanitizeScopeId(cleanName, 'scope');
            let id = baseId;
            let suffix = 2;
            while (context.scopes.some((entry) => entry && entry.id === id)) {
                id = `${baseId}_${suffix}`;
                suffix += 1;
            }

            const seen = new Set();
            const orderSeed = Array.isArray(opts.caseOrder) ? opts.caseOrder : cases.items.map((entry) => entry && entry.id);
            const caseOrder = [];
            orderSeed.forEach((entry) => {
                const caseId = sanitizeCaseIdOptional(entry);
                if (!caseId || seen.has(caseId)) return;
                if (!cases.items.some((item) => item && item.id === caseId)) return;
                seen.add(caseId);
                caseOrder.push(caseId);
            });
            if (!caseOrder.length) caseOrder.push(cases.activeCaseId);
            const activeCaseId = sanitizeCaseIdOptional(opts.activeCaseId)
                || (caseOrder.includes(cases.activeCaseId) ? cases.activeCaseId : caseOrder[0]);
            const scopeEntry = {
                id,
                name: cleanName,
                description: toTrimmedString(opts.description, '', 500).trim(),
                activeCaseId,
                caseOrder,
                caseStatus: {},
                boardRefs: []
            };
            this.normalizeCampaignScopeCaseState(scopeEntry, activeCaseId);
            context.scopes.push(scopeEntry);
            context.activeScopeId = id;

            let caseChanged = false;
            if (syncCase && activeCaseId && cases.activeCaseId !== activeCaseId) {
                cases.activeCaseId = activeCaseId;
                caseChanged = true;
            }

            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return id;
        }

        renameCampaignScope(scopeId, nextName) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const prevName = target.name;
            const cleanName = sanitizeCaseName(nextName, prevName);
            if (cleanName === prevName) return true;
            target.name = cleanName;
            this.save({ scope: 'campaign.context' });
            return true;
        }

        deleteCampaignScope(scopeId, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const syncCase = opts.syncCase !== false;
            const context = this.ensureCampaignContextIntegrity();
            if (context.scopes.length <= 1) return false;
            const targetId = sanitizeScopeId(scopeId, context.activeScopeId);
            const idx = context.scopes.findIndex((entry) => entry && entry.id === targetId);
            if (idx < 0) return false;
            const wasActive = context.activeScopeId === targetId;
            context.scopes.splice(idx, 1);
            if (!context.scopes.some((entry) => entry && entry.id === context.activeScopeId)) {
                const fallback = context.scopes[Math.max(0, idx - 1)] || context.scopes[0];
                context.activeScopeId = fallback ? fallback.id : DEFAULT_CAMPAIGN_SCOPE_ID;
            }

            let caseChanged = false;
            if (wasActive && syncCase) {
                const cases = this.ensureCaseStateIntegrity();
                const nextScope = this.getCampaignScopeEntry(context.activeScopeId, { strict: true }) || context.scopes[0];
                const nextCaseId = sanitizeCaseIdOptional(nextScope && nextScope.activeCaseId)
                    || sanitizeCaseIdOptional(nextScope && Array.isArray(nextScope.caseOrder) ? nextScope.caseOrder[0] : '');
                if (nextCaseId && cases.items.some((entry) => entry && entry.id === nextCaseId) && cases.activeCaseId !== nextCaseId) {
                    cases.activeCaseId = nextCaseId;
                    caseChanged = true;
                }
            }

            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return true;
        }

        setCampaignScopeCaseOrder(scopeId, caseOrder = [], options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const syncCase = opts.syncCase !== false;
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const cases = this.ensureCaseStateIntegrity();
            const seen = new Set();
            const nextOrder = [];
            (Array.isArray(caseOrder) ? caseOrder : []).forEach((entry) => {
                const caseId = sanitizeCaseIdOptional(entry);
                if (!caseId || seen.has(caseId)) return;
                if (!cases.items.some((item) => item && item.id === caseId)) return;
                seen.add(caseId);
                nextOrder.push(caseId);
            });
            if (!nextOrder.length) return false;

            target.caseOrder = nextOrder;
            const prevStatus = target.caseStatus && typeof target.caseStatus === 'object' ? target.caseStatus : {};
            const nextStatus = Object.create(null);
            nextOrder.forEach((caseId) => {
                nextStatus[caseId] = sanitizeCampaignScopeStatus(prevStatus[caseId], 'planned');
            });
            target.caseStatus = nextStatus;
            this.normalizeCampaignScopeCaseState(target, target.activeCaseId);
            if (Array.isArray(target.boardRefs)) {
                target.boardRefs = target.boardRefs.filter((ref) => ref && nextOrder.includes(String(ref.caseId || '')));
            }

            let caseChanged = false;
            const context = this.ensureCampaignContextIntegrity();
            const liveScope = context.scopes.find((entry) => entry && entry.id === target.id) || target;
            const liveActiveCaseId = sanitizeCaseIdOptional(liveScope && liveScope.activeCaseId);
            if (syncCase && context.activeScopeId === target.id && liveActiveCaseId && cases.activeCaseId !== liveActiveCaseId) {
                cases.activeCaseId = liveActiveCaseId;
                caseChanged = true;
            }

            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return true;
        }

        moveCampaignScopeCase(scopeId, caseId, delta = 0, options = {}) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const order = Array.isArray(target.caseOrder) ? target.caseOrder.slice() : [];
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            const idx = order.findIndex((entry) => entry === cleanCaseId);
            if (idx < 0) return false;
            const nextIdx = Math.max(0, Math.min(order.length - 1, idx + Number(delta || 0)));
            if (nextIdx === idx) return true;
            const [moved] = order.splice(idx, 1);
            order.splice(nextIdx, 0, moved);
            return this.setCampaignScopeCaseOrder(target.id, order, options);
        }

        addCaseToCampaignScope(scopeId, caseId, options = {}) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            if (!cleanCaseId) return false;
            const cases = this.ensureCaseStateIntegrity();
            if (!cases.items.some((entry) => entry && entry.id === cleanCaseId)) return false;
            if (Array.isArray(target.caseOrder) && target.caseOrder.includes(cleanCaseId)) return true;
            const nextOrder = Array.isArray(target.caseOrder) ? target.caseOrder.slice() : [];
            nextOrder.push(cleanCaseId);
            return this.setCampaignScopeCaseOrder(target.id, nextOrder, options);
        }

        removeCaseFromCampaignScope(scopeId, caseId, options = {}) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            if (!cleanCaseId) return false;
            const nextOrder = (Array.isArray(target.caseOrder) ? target.caseOrder : []).filter((entry) => entry !== cleanCaseId);
            if (!nextOrder.length) return false;
            return this.setCampaignScopeCaseOrder(target.id, nextOrder, options);
        }

        setCampaignScopeCaseStatus(scopeId, caseId, status) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            if (!cleanCaseId) return false;
            const cases = this.ensureCaseStateIntegrity();
            if (!cases.items.some((entry) => entry && entry.id === cleanCaseId)) return false;
            if (!Array.isArray(target.caseOrder)) target.caseOrder = [];
            if (!target.caseOrder.includes(cleanCaseId)) {
                target.caseOrder.push(cleanCaseId);
            }
            const prev = target.caseStatus && typeof target.caseStatus === 'object' ? target.caseStatus : {};
            target.caseStatus = { ...prev };
            target.caseStatus[cleanCaseId] = sanitizeCampaignScopeStatus(status, target.caseStatus[cleanCaseId] || 'planned');
            let preferredActiveCaseId = target.activeCaseId;
            if (target.caseStatus[cleanCaseId] === 'active') {
                preferredActiveCaseId = cleanCaseId;
            } else if (target.activeCaseId === cleanCaseId) {
                const order = Array.isArray(target.caseOrder) ? target.caseOrder : [];
                const firstPlanned = order.find((id) => {
                    if (id === cleanCaseId) return false;
                    return sanitizeCampaignScopeStatus(target.caseStatus[id], 'planned') !== 'resolved';
                });
                const firstOther = order.find((id) => id !== cleanCaseId);
                preferredActiveCaseId = firstPlanned || firstOther || cleanCaseId;
            }

            this.normalizeCampaignScopeCaseState(target, preferredActiveCaseId);

            let caseChanged = false;
            const context = this.ensureCampaignContextIntegrity();
            const liveScope = context.scopes.find((entry) => entry && entry.id === target.id) || target;
            const liveActiveCaseId = sanitizeCaseIdOptional(liveScope && liveScope.activeCaseId);
            if (context.activeScopeId === target.id && liveActiveCaseId && cases.activeCaseId !== liveActiveCaseId) {
                cases.activeCaseId = liveActiveCaseId;
                caseChanged = true;
            }

            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return true;
        }

        setCampaignScopeActiveCase(scopeId, caseId, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const syncCase = opts.syncCase !== false;
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return false;
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            if (!cleanCaseId) return false;
            const cases = this.ensureCaseStateIntegrity();
            if (!cases.items.some((entry) => entry && entry.id === cleanCaseId)) return false;
            if (!Array.isArray(target.caseOrder)) target.caseOrder = [];
            if (!target.caseOrder.includes(cleanCaseId)) {
                target.caseOrder.push(cleanCaseId);
            }
            const nextStatus = target.caseStatus && typeof target.caseStatus === 'object' ? target.caseStatus : {};
            target.caseStatus = { ...nextStatus, [cleanCaseId]: 'active' };
            this.normalizeCampaignScopeCaseState(target, cleanCaseId);

            let caseChanged = false;
            const context = this.ensureCampaignContextIntegrity();
            const liveScope = context.scopes.find((entry) => entry && entry.id === target.id) || target;
            const liveActiveCaseId = sanitizeCaseIdOptional(liveScope && liveScope.activeCaseId);
            if (syncCase && context.activeScopeId === target.id) {
                if (liveActiveCaseId && cases.items.some((entry) => entry && entry.id === liveActiveCaseId) && cases.activeCaseId !== liveActiveCaseId) {
                    cases.activeCaseId = liveActiveCaseId;
                    caseChanged = true;
                }
            }

            this.syncActiveCaseLegacyState();
            const scopes = ['campaign.context'];
            if (caseChanged) scopes.push(SYNC_SCOPE_CASES_META);
            this.save({ scope: scopes });
            return true;
        }

        addCampaignScopeBoardRef(scopeId, caseId, details = {}) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target) return null;
            const cleanCaseId = sanitizeCaseIdOptional(caseId);
            if (!cleanCaseId) return null;
            const cases = this.ensureCaseStateIntegrity();
            const caseEntry = cases.items.find((entry) => entry && entry.id === cleanCaseId);
            if (!caseEntry) return null;
            if (!Array.isArray(target.boardRefs)) target.boardRefs = [];
            const existing = target.boardRefs.find((entry) => entry && String(entry.caseId || '') === cleanCaseId);
            if (existing) {
                if (details && typeof details === 'object') {
                    if (Object.prototype.hasOwnProperty.call(details, 'label')) {
                        existing.label = toTrimmedString(details.label, existing.label || caseEntry.name || cleanCaseId, 120).trim()
                            || existing.label
                            || caseEntry.name
                            || cleanCaseId;
                    }
                    if (Object.prototype.hasOwnProperty.call(details, 'note')) {
                        existing.note = toTrimmedString(details.note, existing.note || '', 400).trim();
                    }
                }
                this.save({ scope: 'campaign.context' });
                return deepClone(existing);
            }

            const idBase = sanitizeScopeRefId(details && details.id, `scope_ref_${target.boardRefs.length + 1}`);
            let refId = idBase;
            let bump = 2;
            while (target.boardRefs.some((entry) => entry && entry.id === refId)) {
                refId = `${idBase}_${bump}`;
                bump += 1;
            }

            const record = {
                id: refId,
                caseId: cleanCaseId,
                label: toTrimmedString(details && details.label, caseEntry.name || cleanCaseId, 120).trim() || caseEntry.name || cleanCaseId,
                note: toTrimmedString(details && details.note, '', 400).trim()
            };
            target.boardRefs.push(record);
            this.save({ scope: 'campaign.context' });
            return deepClone(record);
        }

        removeCampaignScopeBoardRef(scopeId, refId) {
            const target = this.getCampaignScopeEntry(scopeId, { strict: true });
            if (!target || !Array.isArray(target.boardRefs)) return false;
            const cleanRefId = sanitizeScopeRefId(refId, '');
            if (!cleanRefId) return false;
            const idx = target.boardRefs.findIndex((entry) => entry && String(entry.id || '') === cleanRefId);
            if (idx < 0) return false;
            target.boardRefs.splice(idx, 1);
            this.save({ scope: 'campaign.context' });
            return true;
        }

        createCase(name = '') {
            const cases = this.ensureCaseStateIntegrity();
            const cleanName = sanitizeCaseName(name, 'New Case');
            const baseId = sanitizeCaseId(cleanName, 'case');
            let id = baseId;
            let suffix = 2;
            while (cases.items.some((entry) => entry && entry.id === id)) {
                id = `${baseId}_${suffix}`;
                suffix += 1;
            }

            const entry = {
                id,
                name: cleanName,
                board: sanitizeBoard({ name: cleanName }),
                events: [],
                leads: [],
                vtt: createDefaultVTTState()
            };
            cases.items.push(entry);
            cases.activeCaseId = id;
            const activeScope = this.getCampaignScopeEntry(null, { strict: true });
            if (activeScope) {
                if (!Array.isArray(activeScope.caseOrder)) activeScope.caseOrder = [];
                if (!activeScope.caseOrder.includes(id)) activeScope.caseOrder.push(id);
                activeScope.activeCaseId = id;
                if (!activeScope.caseStatus || typeof activeScope.caseStatus !== 'object') activeScope.caseStatus = {};
                activeScope.caseStatus[id] = 'planned';
                this.normalizeCampaignScopeCaseState(activeScope, id);
            }
            this.syncActiveCaseLegacyState();
            this.save({ scope: [SYNC_SCOPE_CASES_META, 'campaign.context', `cases.${id}.board`, buildCaseEventOrderScope(id)] });
            return id;
        }

        renameCase(caseId, nextName) {
            const target = this.getCaseEntry(caseId, { strict: true });
            if (!target) return false;
            const prevName = target.name;
            const cleanName = sanitizeCaseName(nextName, prevName);
            target.name = cleanName;
            if (!target.board || typeof target.board !== 'object') {
                target.board = sanitizeBoard({ name: cleanName });
            } else {
                const boardName = typeof target.board.name === 'string' ? target.board.name.trim() : '';
                if (!boardName || boardName === prevName || boardName === DEFAULT_BOARD_STATE.name) {
                    target.board.name = cleanName;
                }
            }
            const context = this.ensureCampaignContextIntegrity();
            context.scopes.forEach((scope) => {
                if (!scope || typeof scope !== 'object') return;
                if (Array.isArray(scope.boardRefs)) {
                    scope.boardRefs.forEach((ref) => {
                        if (!ref || String(ref.caseId || '') !== target.id) return;
                        const currentLabel = String(ref.label || '').trim();
                        if (!currentLabel || currentLabel === prevName) {
                            ref.label = cleanName;
                        }
                    });
                }
            });
            this.syncActiveCaseLegacyState();
            this.save({ scope: [SYNC_SCOPE_CASES_META, 'campaign.context'] });
            return true;
        }

        deleteCase(caseId) {
            const cases = this.ensureCaseStateIntegrity();
            if (cases.items.length <= 1) return false;
            const targetId = sanitizeCaseId(caseId, cases.activeCaseId);
            const idx = cases.items.findIndex((entry) => entry && entry.id === targetId);
            if (idx < 0) return false;
            cases.items.splice(idx, 1);
            if (!cases.items.some((entry) => entry.id === cases.activeCaseId)) {
                cases.activeCaseId = cases.items[Math.max(0, idx - 1)].id;
            }
            this.ensureCampaignContextIntegrity();
            this.syncActiveCaseLegacyState();
            this.save({ scope: [SYNC_SCOPE_CASES_META, 'campaign.context'] });
            return true;
        }

        setActiveCase(caseId) {
            const cases = this.ensureCaseStateIntegrity();
            const targetId = sanitizeCaseId(caseId, cases.activeCaseId);
            const exists = cases.items.some((entry) => entry && entry.id === targetId);
            if (!exists) return false;
            if (cases.activeCaseId === targetId) return true;
            cases.activeCaseId = targetId;
            const activeScope = this.getCampaignScopeEntry(null, { strict: true });
            if (activeScope) {
                if (!Array.isArray(activeScope.caseOrder)) activeScope.caseOrder = [];
                if (!activeScope.caseOrder.includes(targetId)) activeScope.caseOrder.push(targetId);
                activeScope.activeCaseId = targetId;
                if (!activeScope.caseStatus || typeof activeScope.caseStatus !== 'object') activeScope.caseStatus = {};
                activeScope.caseStatus[targetId] = 'planned';
                this.normalizeCampaignScopeCaseState(activeScope, targetId);
            }
            this.syncActiveCaseLegacyState();
            this.save({ scope: [SYNC_SCOPE_CASES_META, 'campaign.context'] });
            return true;
        }

        load() {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                this.sync.hadStoredStateAtBoot = !!raw;
                if (raw) {
                    const loaded = JSON.parse(raw);
                    this.state = sanitizeState(loaded);
                    logInfo("RTF_STORE: Loaded unified data.");
                } else {
                    logInfo("RTF_STORE: No unified data found. Attempting migration...");
                    this.migrate();
                }

                this.state = sanitizeState(this.state);
                this.ensureCampaignEntityIds(false);
                this.syncActiveCaseLegacyState();
                if (this.ingestPreloadedData()) {
                    const dirtyBeforeSeed = this.sync.localDirtyScopes
                        ? new Set(this.sync.localDirtyScopes)
                        : new Set();
                    // Preloaded seed data should persist locally but not be treated as unsynced user edits.
                    this.save({ scope: 'campaign', skipCloud: true });
                    const dirtyAfterSeed = this.sync.localDirtyScopes
                        ? Array.from(this.sync.localDirtyScopes.values())
                        : [];
                    const seededScopes = dirtyAfterSeed.filter((scope) => !dirtyBeforeSeed.has(scope));
                    this.clearLocalDirtyScopes(seededScopes.length ? seededScopes : 'campaign');
                }
                this.sync.lastSyncedState = sanitizeState(this.state);
                this.sync.lastKnownRemoteRevision = toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0);
                if (this.isNormalizedReadMode()
                    && (!this.sync.localDirtyScopes || !this.sync.localDirtyScopes.size)
                    && (!this.sync.scopeBaselines || !this.sync.scopeBaselines.size)) {
                    this.syncScopeBaselinesFromLocalState(null, {
                        revision: this.sync.lastKnownRemoteRevision,
                        updatedAt: toTimestamp(this.state.meta && this.state.meta.updated, 0)
                    });
                }
            } catch (e) {
                console.error("RTF_STORE: Load failed", e);
                this.sync.hadStoredStateAtBoot = false;
                this.state = sanitizeState(null);
                this.syncActiveCaseLegacyState();
                this.sync.lastSyncedState = sanitizeState(this.state);
                this.sync.lastKnownRemoteRevision = 0;
            }
        }

        ingestPreloadedData() {
            let changed = false;

            if (window.PRELOADED_NPCS && Array.isArray(window.PRELOADED_NPCS)) {
                const normalizeNPCField = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
                const buildNPCSignature = (npc) => [
                    normalizeNPCField(npc && npc.name),
                    normalizeNPCField(npc && npc.guild),
                    normalizeNPCField(npc && npc.wants),
                    normalizeNPCField(npc && npc.leverage),
                    normalizeNPCField(npc && npc.notes)
                ].join('|');
                const preloadedSignatures = new Set(window.PRELOADED_NPCS.map(buildNPCSignature));

                // Backfill source markers for existing exact preloaded records.
                this.state.campaign.npcs.forEach((npc) => {
                    if (!npc || typeof npc !== 'object') return;
                    if (npc.__rtfSource) return;
                    if (preloadedSignatures.has(buildNPCSignature(npc))) {
                        npc.__rtfSource = 'preloaded';
                        changed = true;
                    }
                });

                const existingNames = new Set(this.state.campaign.npcs.map(n => n.name));
                let count = 0;
                window.PRELOADED_NPCS.forEach(n => {
                    if (!existingNames.has(n.name)) {
                        this.state.campaign.npcs.push({ ...n, __rtfSource: 'preloaded' });
                        existingNames.add(n.name);
                        count++;
                    }
                });
                if (count > 0) {
                    logInfo(`RTF_STORE: Seeded ${count} NPCs.`);
                    changed = true;
                }
            }

            if (window.PRELOADED_LOCATIONS && Array.isArray(window.PRELOADED_LOCATIONS)) {
                const existingNames = new Set(this.state.campaign.locations.map(l => l.name));
                let count = 0;
                window.PRELOADED_LOCATIONS.forEach(l => {
                    if (!existingNames.has(l.name)) {
                        this.state.campaign.locations.push({ ...l });
                        existingNames.add(l.name);
                        count++;
                    }
                });
                if (count > 0) {
                    logInfo(`RTF_STORE: Seeded ${count} Locations.`);
                    changed = true;
                }
            }

            return changed;
        }

        applyLoadedPreloads() {
            const dirtyBeforeSeed = this.sync.localDirtyScopes
                ? new Set(this.sync.localDirtyScopes)
                : new Set();
            const changed = this.ingestPreloadedData();
            if (!changed) return false;
            this.save({ scope: 'campaign', skipCloud: true });
            const dirtyAfterSeed = this.sync.localDirtyScopes
                ? Array.from(this.sync.localDirtyScopes.values())
                : [];
            const seededScopes = dirtyAfterSeed.filter((scope) => !dirtyBeforeSeed.has(scope));
            this.clearLocalDirtyScopes(seededScopes.length ? seededScopes : 'campaign');
            this.sync.lastSyncedState = sanitizeState(this.state);
            return true;
        }

        getMutationAuthor() {
            const profileName = sanitizeAttributionBy(this.sync && this.sync.config ? this.sync.config.profileName : '', '');
            if (profileName) return profileName;
            const userId = sanitizeAttributionBy(this.sync ? this.sync.userId : '', '');
            if (userId) return userId;
            const instanceId = sanitizeAttributionBy(this.sync ? this.sync.instanceId : '', '');
            if (instanceId) return instanceId;
            return 'local';
        }

        getMutationStamp(nowIso = '') {
            const at = sanitizeAttributionAt(nowIso, new Date().toISOString()) || new Date().toISOString();
            return {
                lastChangedBy: this.getMutationAuthor(),
                lastChangedAt: at
            };
        }

        stampRecordAttribution(record, stamp = null) {
            if (!record || typeof record !== 'object') return false;
            const nextStamp = stamp && typeof stamp === 'object' ? stamp : this.getMutationStamp();
            record.lastChangedBy = sanitizeAttributionBy(nextStamp.lastChangedBy, this.getMutationAuthor());
            record.lastChangedAt = sanitizeAttributionAt(nextStamp.lastChangedAt, new Date().toISOString()) || new Date().toISOString();
            return true;
        }

        stampCampaignEntityByScope(key, scopeId, stamp) {
            if (!this.state || !this.state.campaign || !Array.isArray(this.state.campaign[key])) return;
            const list = this.state.campaign[key];
            if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                list.forEach((entry) => this.stampRecordAttribution(entry, stamp));
                return;
            }
            const idx = findEntityIndexByScopeId(list, scopeId);
            if (idx >= 0) this.stampRecordAttribution(list[idx], stamp);
        }

        stampCaseEventsByScope(caseId, scopeId, stamp) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true, strict: false });
            if (!entry || !Array.isArray(entry.events)) return;
            if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                entry.events.forEach((eventEntry) => this.stampRecordAttribution(eventEntry, stamp));
                return;
            }
            const idx = findEntityIndexByScopeId(entry.events, scopeId);
            if (idx >= 0) this.stampRecordAttribution(entry.events[idx], stamp);
        }

        stampCampaignMetaEventsByScope(scopeId, stamp) {
            const meta = this.ensureCampaignMetaIntegrity();
            const list = Array.isArray(meta && meta.events) ? meta.events : [];
            if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                list.forEach((eventEntry) => this.stampRecordAttribution(eventEntry, stamp));
                return;
            }
            const idx = findEntityIndexByScopeId(list, scopeId);
            if (idx >= 0) this.stampRecordAttribution(list[idx], stamp);
        }

        applyScopeAttribution(scopes) {
            const stamp = this.getMutationStamp();
            normalizeScopeList(scopes).forEach((scope) => {
                const campaignMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)(?:\.([a-z0-9_-]+))?$/);
                if (campaignMatch) {
                    const key = campaignMatch[1];
                    const scopeId = campaignMatch[2] || '';
                    this.stampCampaignEntityByScope(key, scopeId, stamp);
                    return;
                }

                const caseEventMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events(?:\.([a-z0-9_-]+))?$/);
                if (caseEventMatch) {
                    const caseId = sanitizeCaseId(caseEventMatch[1], 'case_primary');
                    const scopeId = caseEventMatch[2] || '';
                    this.stampCaseEventsByScope(caseId, scopeId, stamp);
                    return;
                }

                const campaignMetaEventMatch = scope.match(/^campaign\.meta\.events(?:\.([a-z0-9_-]+))?$/);
                if (campaignMetaEventMatch) {
                    const scopeId = campaignMetaEventMatch[1] || '';
                    this.stampCampaignMetaEventsByScope(scopeId, stamp);
                }
            });
        }

        save(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const skipCloud = !!opts.skipCloud;
            const skipEvent = !!opts.skipEvent;
            let scopes = normalizeScopeList(opts.scope || SYNC_SCOPE_GLOBAL);

            try {
                const idRepair = this.ensureCampaignEntityIds(false);
                if (idRepair && Array.isArray(idRepair.scopes) && idRepair.scopes.length) {
                    scopes = normalizeScopeList([...scopes, ...idRepair.scopes]);
                }
                this.syncActiveCaseLegacyState();
                this.applyScopeAttribution(scopes);
                const now = Date.now();
                this.state.meta.updated = now;
                this.recordScopeUpdated(scopes, now);
                const cloudScopes = this.markLocalDirtyScopes(scopes, now);
                if (cloudScopes.length) this.touchSoftLockScopes(cloudScopes);
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));

                if (!skipCloud && !this.isApplyingRemote && cloudScopes.length) {
                    if (this.canAutoPushCloud('local-save')) {
                        this.scheduleCloudPush('local-save');
                    } else {
                        this.updateSyncStatus({
                            pendingPush: true,
                            mode: this.sync.config.enabled ? 'idle' : this.syncStatus.mode,
                            connected: this.hasLiveSyncConnection(),
                            message: this.sync.userId
                                ? 'Editing. Autosave will run after 3 seconds of inactivity.'
                                : this.syncStatus.message
                        });
                    }
                }
                if (!skipEvent) this.broadcastStoreUpdate('local', { scopes });
            } catch (e) {
                console.error("RTF_STORE: Save failed", e);
            }
        }

        migrate() {
            let migrated = false;

            const hubRaw = localStorage.getItem(LEGACY_HUB_KEY);
            if (hubRaw) {
                try {
                    const hubData = JSON.parse(hubRaw);
                    if (hubData && typeof hubData === 'object') {
                        if (Object.prototype.hasOwnProperty.call(hubData, 'rep')) this.state.campaign.rep = hubData.rep;
                        if (Object.prototype.hasOwnProperty.call(hubData, 'heat')) this.state.campaign.heat = hubData.heat;
                        if (Object.prototype.hasOwnProperty.call(hubData, 'cognitiveRisk')) this.state.campaign.cognitiveRisk = hubData.cognitiveRisk;
                        if (Object.prototype.hasOwnProperty.call(hubData, 'players')) this.state.campaign.players = hubData.players;
                        if (Object.prototype.hasOwnProperty.call(hubData, 'case')) this.state.campaign.case = hubData.case;
                        migrated = true;
                        logInfo("RTF_STORE: Migrated Hub data.");
                    }
                } catch (e) {
                    console.warn("Migration error (Hub):", e);
                }
            }

            const boardRaw = localStorage.getItem(LEGACY_BOARD_KEY);
            if (boardRaw) {
                try {
                    const boardData = JSON.parse(boardRaw);
                    if (boardData && typeof boardData === 'object') {
                        if (Object.prototype.hasOwnProperty.call(boardData, 'name')) this.state.board.name = boardData.name;
                        if (Object.prototype.hasOwnProperty.call(boardData, 'nodes')) this.state.board.nodes = boardData.nodes;
                        if (Object.prototype.hasOwnProperty.call(boardData, 'connections')) this.state.board.connections = boardData.connections;
                        migrated = true;
                        logInfo("RTF_STORE: Migrated Board data.");
                    }
                } catch (e) {
                    console.warn("Migration error (Board):", e);
                }
            }

            if (migrated) {
                this.state.cases = sanitizeCases(null, this.state.campaign, this.state.board);
                this.syncActiveCaseLegacyState();
                this.save({ scope: SYNC_SCOPE_GLOBAL });
            }
        }

        export() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state));
            const downloadAnchorNode = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `ravnica_unified_backup_${date}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }

        import() {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.onchange = e => {
                    const target = e && e.target ? e.target : null;
                    const file = target && target.files && target.files[0] ? target.files[0] : null;
                    if (!file) {
                        resolve(false);
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = event => {
                        try {
                            const payload = event && event.target ? event.target.result : '';
                            if (typeof payload !== 'string') {
                                alert("Invalid JSON file");
                                resolve(false);
                                return;
                            }
                            const loaded = JSON.parse(payload);
                            if (!loaded || typeof loaded !== 'object') {
                                alert("Invalid format: Expected JSON object.");
                                resolve(false);
                                return;
                            }

                            const hasKnownRoot = ['meta', 'campaign', 'board', 'cases', 'hq'].some(key => Object.prototype.hasOwnProperty.call(loaded, key));
                            if (!hasKnownRoot) {
                                alert("Invalid format: Missing campaign/case/board data.");
                                resolve(false);
                                return;
                            }

                            this.state = sanitizeState(loaded);
                            this.ensureCampaignEntityIds(false);
                            this.save({ scope: SYNC_SCOPE_GLOBAL });
                            resolve(true);
                        } catch (err) {
                            console.error(err);
                            alert("Invalid JSON file");
                            resolve(false);
                        }
                    };
                    reader.onerror = () => {
                        alert("File reading failed.");
                        resolve(false);
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        resetCampaignData() {
            this.cancelCloudPush();
            this.clearSyncConfig({ disconnect: false });
            this.disconnectSync('disabled').catch(() => { });

            this.state = sanitizeState(DEFAULT_STATE);
            this.ensureCampaignEntityIds(false);
            this.syncActiveCaseLegacyState();
            this.state.meta.updated = Date.now();
            this.state.meta.syncRevision = 0;
            this.state.meta.scopeUpdated = {};

            this.sync.localDirtyScopes = new Set();
            this.sync.scopeBaselines = new Map();
            this.sync.lastSyncedState = sanitizeState(this.state);
            this.sync.lastKnownRemoteRevision = 0;
            this.sync.lastCloudStateSig = '';
            this.sync.lastRemoteSeenAt = 0;
            this.sync.lastPushAt = 0;
            this.sync.lastPullAt = 0;
            this.sync.pendingConflict = null;
            this.sync.localSoftLocks = new Map();
            this.sync.remoteSoftLocks = new Map();
            this.sync.remotePeers = new Map();

            [
                LEGACY_HUB_KEY,
                LEGACY_BOARD_KEY,
                LEAD_STORAGE_KEY,
                PREP_PROCEDURE_STATE_KEY,
                CLOCKS_STORAGE_KEY,
                DIRTY_SCOPES_KEY,
                SCOPE_BASELINES_KEY,
                HEAT_SYNC_KEY,
                HQ_LOCAL_STORAGE_KEY,
                AUTO_CONNECT_CANCEL_KEY
            ].forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch (err) {
                    console.warn(`RTF_STORE: Failed clearing ${key}`, err);
                }
            });

            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch (err) {
                console.error('RTF_STORE: Failed resetting campaign data', err);
                return false;
            }

            this.updateSyncStatus({
                mode: 'disabled',
                enabled: false,
                connected: false,
                campaignId: '',
                profileName: '',
                backendMode: this.sync.config.backendMode,
                pendingPush: false,
                lastPushAt: null,
                lastPullAt: null,
                lastError: '',
                message: 'Cloud sync is disabled.'
            });
            this.broadcastStoreUpdate('local', { scopes: [SYNC_SCOPE_GLOBAL], reason: 'reset' });
            return true;
        }

        // Sync Configuration + Status
        getSyncConfig() {
            return deepClone(this.sync.config);
        }

        setSyncConfig(configPatch, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const merge = opts.merge !== false;
            const reconnect = opts.reconnect !== false;

            const base = merge ? this.sync.config : DEFAULT_SYNC_CONFIG;
            const sanitized = sanitizeSyncConfig({ ...base, ...(configPatch || {}) });
            const next = coerceAutoConnectBackendMode(sanitized).config;

            this.sync.config = next;
            try {
                localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(next));
            } catch (err) {
                console.warn('RTF_STORE: Failed to persist sync config', err);
            }

            this.updateSyncStatus({
                enabled: next.enabled,
                campaignId: next.campaignId,
                profileName: next.profileName,
                backendMode: next.backendMode
            });
            if (this.hasLiveSyncConnection()) this.startReconcileLoop();

            if (reconnect) {
                if (next.enabled) {
                    if (this.hasLiveSyncConnection()) {
                        this.connectSync({ explicit: true }).catch((err) => {
                            this.updateSyncStatus({
                                mode: 'error',
                                connected: false,
                                message: 'Sync connect failed.',
                                lastError: err && err.message ? err.message : String(err)
                            });
                        });
                    } else if (next.autoConnect && shouldAutoConnectOnThisPage()) {
                        this.scheduleAutoSyncBoot();
                    }
                } else {
                    this.disconnectSync('disabled').catch(() => { });
                }
            }

            return this.getSyncConfig();
        }

        clearSyncConfig(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const disconnect = opts.disconnect !== false;

            try {
                localStorage.removeItem(SYNC_CONFIG_KEY);
            } catch (err) {
                console.warn('RTF_STORE: Failed clearing sync config', err);
            }

            this.sync.config = sanitizeSyncConfig(DEFAULT_SYNC_CONFIG);
            this.sync.pendingConflict = null;
            this.updateSyncStatus({
                mode: 'disabled',
                enabled: false,
                connected: false,
                campaignId: '',
                profileName: '',
                backendMode: this.sync.config.backendMode,
                message: 'Cloud sync is disabled.'
            });

            if (disconnect) {
                this.disconnectSync('disabled').catch(() => { });
            }
        }

        getSyncStatus() {
            return deepClone(this.syncStatus);
        }

        onSyncStatus(listener) {
            if (typeof listener !== 'function') return () => { };
            this.syncStatusListeners.add(listener);
            try {
                listener(this.getSyncStatus());
            } catch (err) {
                console.warn('RTF_STORE: sync status listener failed', err);
            }
            return () => {
                this.syncStatusListeners.delete(listener);
            };
        }

        emitSyncStatus() {
            const snap = this.getSyncStatus();
            this.syncStatusListeners.forEach((fn) => {
                try {
                    fn(snap);
                } catch (err) {
                    console.warn('RTF_STORE: sync status listener failed', err);
                }
            });

            if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
                global.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: snap }));
            }
        }

        updateSyncStatus(patch) {
            const hasConnectedPatch = !!(patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'connected'));
            const derived = {
                connected: this.hasLiveSyncConnection(),
                localRevision: toNonNegativeInt(this.state && this.state.meta ? this.state.meta.syncRevision : 0, 0),
                remoteRevision: toNonNegativeInt(this.sync.lastKnownRemoteRevision, 0),
                dirtyScopes: this.sync.localDirtyScopes ? this.sync.localDirtyScopes.size : 0,
                presencePeers: this.sync.remotePeers ? this.sync.remotePeers.size : 0,
                activeRemoteLocks: this.sync.remoteSoftLocks ? this.sync.remoteSoftLocks.size : 0,
                pendingConflict: !!this.sync.pendingConflict,
                conflictScopes: this.sync.pendingConflict && Array.isArray(this.sync.pendingConflict.overlappingScopes)
                    ? this.sync.pendingConflict.overlappingScopes.slice()
                    : []
            };
            this.syncStatus = {
                ...this.syncStatus,
                ...derived,
                ...(patch || {}),
                connected: hasConnectedPatch ? !!patch.connected : derived.connected,
                updatedAt: Date.now()
            };
            this.emitSyncStatus();
        }

        getDirtyScopesSnapshot(scopes = null) {
            if (!this.sync.localDirtyScopes) this.sync.localDirtyScopes = new Set();
            if (scopes === null || scopes === undefined) {
                const current = Array.from(this.sync.localDirtyScopes.values());
                return current.length ? current : [SYNC_SCOPE_GLOBAL];
            }
            const filtered = filterCloudSyncScopes(scopes);
            return filtered.length ? filtered : [];
        }

        persistDirtyScopes() {
            try {
                const list = this.sync.localDirtyScopes
                    ? Array.from(this.sync.localDirtyScopes.values())
                    : [];
                if (!list.length) {
                    localStorage.removeItem(DIRTY_SCOPES_KEY);
                    return;
                }
                localStorage.setItem(DIRTY_SCOPES_KEY, JSON.stringify(normalizeScopeList(list)));
            } catch (err) {
                console.warn('RTF_STORE: Failed to persist dirty scopes cache', err);
            }
        }

        markLocalDirtyScopes(scopes, timestamp = Date.now()) {
            if (!this.sync.localDirtyScopes) this.sync.localDirtyScopes = new Set();
            const list = filterCloudSyncScopes(scopes);
            this.recordScopeUpdated(scopes, timestamp);
            list.forEach((scope) => {
                this.sync.localDirtyScopes.add(scope);
            });
            this.persistDirtyScopes();
            return list;
        }

        clearLocalDirtyScopes(scopes = null) {
            if (!this.sync.localDirtyScopes) this.sync.localDirtyScopes = new Set();
            if (scopes === null || scopes === undefined) {
                this.sync.localDirtyScopes.clear();
                this.persistDirtyScopes();
                return;
            }
            normalizeScopeList(scopes).forEach((scope) => {
                this.sync.localDirtyScopes.delete(scope);
            });
            this.persistDirtyScopes();
        }

        getLatestDirtyScopeUpdatedAt(scopes = null) {
            const dirtyScopes = Array.isArray(scopes) ? normalizeScopeList(scopes) : this.getDirtyScopesSnapshot();
            const scopeUpdated = this.state
                && this.state.meta
                && this.state.meta.scopeUpdated
                && typeof this.state.meta.scopeUpdated === 'object'
                ? this.state.meta.scopeUpdated
                : {};
            let latest = 0;
            dirtyScopes.forEach((scope) => {
                const ts = toTimestamp(scopeUpdated[scope], 0);
                if (ts > latest) latest = ts;
            });
            if (!latest) latest = toTimestamp(this.state && this.state.meta && this.state.meta.updated, 0);
            return latest;
        }

        clearExpiredSoftLocks(now = Date.now()) {
            if (!this.sync.localSoftLocks) this.sync.localSoftLocks = new Map();
            const expired = [];
            this.sync.localSoftLocks.forEach((expiresAt, scope) => {
                if (!Number.isFinite(expiresAt) || expiresAt <= now) expired.push(scope);
            });
            expired.forEach((scope) => this.sync.localSoftLocks.delete(scope));
        }

        serializeLocalSoftLocks() {
            this.clearExpiredSoftLocks();
            const out = {};
            this.sync.localSoftLocks.forEach((expiresAt, scope) => {
                if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
                out[scope] = expiresAt;
            });
            return out;
        }

        touchSoftLockScopes(scopes, ttlMs = null) {
            if (!this.hasLiveSyncConnection()) return;
            if (!this.sync.localSoftLocks) this.sync.localSoftLocks = new Map();
            const ttl = Math.max(5000, toNonNegativeInt(ttlMs, this.sync.config.lockTtlMs) || this.sync.config.lockTtlMs);
            const expiresAt = Date.now() + ttl;
            normalizeScopeList(scopes).forEach((scope) => {
                if (!scope || scope === SYNC_SCOPE_GLOBAL) return;
                this.sync.localSoftLocks.set(scope, expiresAt);
            });
            this.clearExpiredSoftLocks();
            this.refreshPresenceTracking().catch(() => { });
        }

        getRemoteLockConflicts(scopes) {
            if (!this.sync.remoteSoftLocks || !this.sync.remoteSoftLocks.size) return [];
            const checkScopes = normalizeScopeList(scopes);
            const now = Date.now();
            const conflicts = [];
            this.sync.remoteSoftLocks.forEach((lock, lockScope) => {
                if (!lock || !lock.scope || !Number.isFinite(lock.expiresAt)) return;
                if (lock.expiresAt <= now) return;
                if (checkScopes.some((scope) => scopesOverlap(scope, lockScope))) {
                    conflicts.push({
                        scope: lock.scope,
                        byInstance: lock.instanceId,
                        byProfile: lock.profileName || '',
                        expiresAt: lock.expiresAt
                    });
                }
            });
            return conflicts;
        }

        handlePresenceState(presenceState) {
            const raw = presenceState && typeof presenceState === 'object' ? presenceState : {};
            const peers = new Map();
            const locks = new Map();
            const now = Date.now();

            Object.keys(raw).forEach((presenceKey) => {
                const entries = Array.isArray(raw[presenceKey]) ? raw[presenceKey] : [];
                entries.forEach((entry) => {
                    if (!entry || typeof entry !== 'object') return;
                    const instanceId = typeof entry.instanceId === 'string' ? entry.instanceId : '';
                    if (!instanceId || instanceId === this.sync.instanceId) return;
                    peers.set(instanceId, {
                        instanceId,
                        userId: typeof entry.userId === 'string' ? entry.userId : '',
                        profileName: typeof entry.profileName === 'string' ? entry.profileName : '',
                        seenAt: now
                    });

                    const lockMap = entry.locks && typeof entry.locks === 'object' ? entry.locks : {};
                    Object.keys(lockMap).forEach((scopeToken) => {
                        const scope = normalizeScopeToken(scopeToken);
                        if (!scope || scope === SYNC_SCOPE_GLOBAL) return;
                        const expiresAt = toTimestamp(lockMap[scopeToken], 0);
                        if (!expiresAt || expiresAt <= now) return;
                        const existing = locks.get(scope);
                        if (!existing || expiresAt > existing.expiresAt) {
                            locks.set(scope, {
                                scope,
                                instanceId,
                                profileName: typeof entry.profileName === 'string' ? entry.profileName : '',
                                expiresAt
                            });
                        }
                    });
                });
            });

            this.sync.remotePeers = peers;
            this.sync.remoteSoftLocks = locks;
            this.updateSyncStatus({});
        }

        async refreshPresenceTracking() {
            if (!this.sync.channel || typeof this.sync.channel.track !== 'function') return;
            if (this.sync.presenceTrackingInFlight) return;
            this.sync.presenceTrackingInFlight = true;
            try {
                const payload = {
                    instanceId: this.sync.instanceId,
                    userId: this.sync.userId || '',
                    profileName: this.sync.config.profileName || '',
                    ts: Date.now(),
                    locks: this.serializeLocalSoftLocks()
                };
                await this.sync.channel.track(payload);
            } catch (err) {
                console.warn('RTF_STORE: Presence track failed', err);
            } finally {
                this.sync.presenceTrackingInFlight = false;
            }
        }

        startReconcileLoop() {
            this.stopReconcileLoop();
            if (!this.hasLiveSyncConnection()) return;
            const presenceEvery = Math.max(3000, toNonNegativeInt(this.sync.config.presenceHeartbeatMs, DEFAULT_SYNC_CONFIG.presenceHeartbeatMs));

            this.sync.presenceTimer = setInterval(() => {
                this.clearExpiredSoftLocks();
                this.refreshPresenceTracking().catch(() => { });
            }, presenceEvery);
        }

        stopReconcileLoop() {
            if (this.sync.reconcileTimer) {
                clearInterval(this.sync.reconcileTimer);
                this.sync.reconcileTimer = null;
            }
            if (this.sync.presenceTimer) {
                clearInterval(this.sync.presenceTimer);
                this.sync.presenceTimer = null;
            }
        }

        isNormalizedReadMode() {
            return this.sync.config.backendMode === SYNC_BACKEND_NORMALIZED;
        }

        isNormalizedMirrorMode() {
            return this.sync.config.backendMode === SYNC_BACKEND_LEGACY_MIRROR;
        }

        getNormalizedTables() {
            const cfg = this.sync.config;
            return {
                core: cfg.normalizedCoreTable,
                hq: cfg.normalizedHQTable,
                caseState: cfg.normalizedCaseStateTable,
                caseBoards: cfg.normalizedCaseBoardsTable,
                caseEvents: cfg.normalizedCaseEventsTable,
                scopeVersions: cfg.normalizedScopeVersionsTable,
                players: cfg.normalizedPlayersTable,
                npcs: cfg.normalizedNPCsTable,
                locations: cfg.normalizedLocationsTable,
                requisitions: cfg.normalizedRequisitionsTable,
                encounters: cfg.normalizedEncountersTable
            };
        }

        getRealtimeTableTargets() {
            if (this.isNormalizedReadMode()) {
                const tableName = this.sync.config.normalizedScopeVersionsTable;
                return tableName ? [tableName] : [];
            }
            return [this.sync.config.tableName];
        }

        clearNormalizedRealtimePull(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            if (this.sync.normalizedPullTimer) {
                clearTimeout(this.sync.normalizedPullTimer);
                this.sync.normalizedPullTimer = null;
            }
            if (opts.clearScopes !== false && this.sync.normalizedPendingScopes instanceof Set) {
                this.sync.normalizedPendingScopes.clear();
            }
            if (opts.clearMeta !== false && this.sync.normalizedPendingScopeMeta instanceof Map) {
                this.sync.normalizedPendingScopeMeta.clear();
            }
        }

        normalizeRealtimeScopeMeta(entry) {
            if (!entry || typeof entry !== 'object') return null;
            const scope = normalizeScopeToken(entry.scope);
            if (!scope || scope === SYNC_SCOPE_GLOBAL || isRoomBackedScope(scope)) return null;
            return {
                scope,
                exists: entry.exists !== false,
                revision: toNonNegativeInt(entry.revision, 0),
                updated_at: toIsoString(entry.updated_at, '') || '',
                updated_by: toTrimmedString(entry.updated_by, '', 120),
                updated_by_name: toTrimmedString(entry.updated_by_name, '', 120)
            };
        }

        scheduleNormalizedRealtimePull(scopes = null) {
            if (!this.isNormalizedReadMode()) return;
            if (!(this.sync.normalizedPendingScopes instanceof Set)) {
                this.sync.normalizedPendingScopes = new Set();
            }
            if (!(this.sync.normalizedPendingScopeMeta instanceof Map)) {
                this.sync.normalizedPendingScopeMeta = new Map();
            }
            const entries = Array.isArray(scopes)
                ? scopes
                : (scopes ? [scopes] : []);
            entries.forEach((entry) => {
                const meta = this.normalizeRealtimeScopeMeta(entry);
                const scope = meta
                    ? meta.scope
                    : normalizeScopeToken(entry);
                if (!scope || scope === SYNC_SCOPE_GLOBAL || isRoomBackedScope(scope)) return;
                this.sync.normalizedPendingScopes.add(scope);
                if (meta) this.sync.normalizedPendingScopeMeta.set(scope, meta);
            });
            this.clearNormalizedRealtimePull({ clearScopes: false, clearMeta: false });
            this.sync.normalizedPullTimer = setTimeout(() => {
                this.sync.normalizedPullTimer = null;
                if (!this.hasLiveSyncConnection()) return;
                const pendingScopes = this.sync.normalizedPendingScopes instanceof Set
                    ? Array.from(this.sync.normalizedPendingScopes.values())
                    : [];
                if (this.sync.normalizedPendingScopes instanceof Set) this.sync.normalizedPendingScopes.clear();
                const pendingScopeMeta = this.sync.normalizedPendingScopeMeta instanceof Map
                    ? Array.from(this.sync.normalizedPendingScopeMeta.values())
                    : [];
                if (this.sync.normalizedPendingScopeMeta instanceof Map) this.sync.normalizedPendingScopeMeta.clear();
                if (!pendingScopes.length) {
                    this.pullFromCloud({ force: false, silent: true }).catch(() => { });
                    return;
                }
                this.pullFromCloudNormalizedScopes(pendingScopes, {
                    force: false,
                    silent: true,
                    scopeVersionRows: pendingScopeMeta
                }).catch(() => {
                    this.pullFromCloud({ force: false, silent: true }).catch(() => { });
                });
            }, 350);
        }

        async fetchNormalizedSingle(tableName) {
            const result = await this.sync.client
                .from(tableName)
                .select('payload,revision,updated_at,updated_by,updated_by_name')
                .eq('campaign_id', this.sync.config.campaignId)
                .maybeSingle();
            if (result.error) {
                const code = result.error.code || '';
                if (code === 'PGRST116') return { ok: true, data: null };
                return {
                    ok: false,
                    error: result.error.message || `Cloud read failed for ${tableName}.`
                };
            }
            return { ok: true, data: result.data || null };
        }

        async fetchNormalizedList(tableName, selectCols, order = null, filters = null) {
            let query = this.sync.client
                .from(tableName)
                .select(selectCols)
                .eq('campaign_id', this.sync.config.campaignId);
            const filterList = Array.isArray(filters) ? filters : [];
            filterList.forEach((filter) => {
                if (!filter || !filter.column) return;
                if (Array.isArray(filter.in) && filter.in.length) {
                    query = query.in(filter.column, filter.in);
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(filter, 'value')) {
                    query = query.eq(filter.column, filter.value);
                }
            });
            if (order && order.column) {
                query = query.order(order.column, { ascending: order.ascending !== false });
            }
            const result = await query;
            if (result.error) {
                return {
                    ok: false,
                    error: result.error.message || `Cloud read failed for ${tableName}.`
                };
            }
            return { ok: true, data: Array.isArray(result.data) ? result.data : [] };
        }

        extractRowMeta(rows) {
            const list = Array.isArray(rows) ? rows : [rows];
            const out = [];
            list.forEach((row) => {
                if (!row || typeof row !== 'object') return;
                out.push({
                    revision: toNonNegativeInt(row.revision, 0),
                    updatedAt: toTimestamp(row.updated_at, 0),
                    updatedAtRaw: typeof row.updated_at === 'string' ? row.updated_at : '',
                    updatedBy: toTrimmedString(row.updated_by, '', 120),
                    updatedByName: toTrimmedString(row.updated_by_name, '', 120)
                });
            });
            return out;
        }

        ensureEntityId(payload, fallbackId, key) {
            const source = payload && typeof payload === 'object' ? payload : {};
            const out = { ...source };
            const nextId = toTrimmedString(source[key] || fallbackId, fallbackId, 80);
            out[key] = nextId;
            return out;
        }

        composeNormalizedState(snapshot) {
            const base = sanitizeState(null);
            const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
            const core = source.core || null;
            const hq = source.hq || null;
            const caseStateRows = Array.isArray(source.caseStateRows) ? source.caseStateRows : [];
            const boardRows = Array.isArray(source.boardRows) ? source.boardRows : [];
            const eventRows = Array.isArray(source.eventRows) ? source.eventRows : [];
            const playerRows = Array.isArray(source.playerRows) ? source.playerRows : [];
            const npcRows = Array.isArray(source.npcRows) ? source.npcRows : [];
            const locationRows = Array.isArray(source.locationRows) ? source.locationRows : [];
            const requisitionRows = Array.isArray(source.requisitionRows) ? source.requisitionRows : [];
            const encounterRows = Array.isArray(source.encounterRows) ? source.encounterRows : [];

            if (core && core.payload && typeof core.payload === 'object') {
                const payload = core.payload;
                if (Object.prototype.hasOwnProperty.call(payload, 'rep')) base.campaign.rep = sanitizeRep(payload.rep);
                if (Object.prototype.hasOwnProperty.call(payload, 'heat')) base.campaign.heat = toNumber(payload.heat, 0);
                if (Object.prototype.hasOwnProperty.call(payload, 'cognitiveRisk')) base.campaign.cognitiveRisk = toNumber(payload.cognitiveRisk, 0);
                if (Object.prototype.hasOwnProperty.call(payload, 'ledger')) base.campaign.ledger = sanitizeLedgerState(payload.ledger);
                if (Object.prototype.hasOwnProperty.call(payload, 'case')) base.campaign.case = sanitizeCase(payload.case);
                if (Object.prototype.hasOwnProperty.call(payload, 'context')) base.campaignContext = sanitizeCampaignContext(payload.context, base.cases);
                if (Object.prototype.hasOwnProperty.call(payload, 'meta')) base.campaignMeta = sanitizeCampaignMeta(payload.meta);
            }

            if (hq && hq.payload && typeof hq.payload === 'object') {
                base.hq = sanitizeHQ(hq.payload);
            }

            base.campaign.players = playerRows.map((row) =>
                this.ensureEntityId(row && row.payload, toTrimmedString(row && row.player_id, buildEntityId('player'), 80), 'id')
            );
            base.campaign.npcs = npcRows.map((row) =>
                this.ensureEntityId(row && row.payload, toTrimmedString(row && row.npc_id, buildEntityId('npc'), 80), 'id')
            );
            base.campaign.locations = locationRows.map((row) =>
                this.ensureEntityId(row && row.payload, toTrimmedString(row && row.location_id, buildEntityId('loc'), 80), 'id')
            );
            base.campaign.requisitions = requisitionRows.map((row) =>
                this.ensureEntityId(row && row.payload, toTrimmedString(row && row.requisition_id, buildEntityId('req'), 80), 'id')
            );
            base.campaign.encounters = encounterRows.map((row) =>
                this.ensureEntityId(row && row.payload, toTrimmedString(row && row.encounter_id, buildEntityId('enc'), 80), 'id')
            );

            const caseOrder = [];
            const caseMap = new Map();
            caseStateRows.forEach((row) => {
                const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                const caseName = sanitizeCaseName(row && row.case_name ? row.case_name : payload.name, DEFAULT_CASE_NAME);
                caseOrder.push(caseId);
                caseMap.set(caseId, {
                    id: caseId,
                    name: caseName,
                    board: sanitizeBoard({ name: caseName }),
                    events: [],
                    leads: sanitizeLeadList(payload.leads),
                    vtt: sanitizeVTTState(payload.vtt)
                });
            });

            boardRows.forEach((row) => {
                const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                if (!caseMap.has(caseId)) {
                    caseMap.set(caseId, {
                        id: caseId,
                        name: DEFAULT_CASE_NAME,
                        board: sanitizeBoard(null),
                        events: [],
                        leads: [],
                        vtt: createDefaultVTTState()
                    });
                    caseOrder.push(caseId);
                }
                const entry = caseMap.get(caseId);
                entry.board = sanitizeBoard(row && row.payload ? row.payload : null);
                if (!entry.board.name) entry.board.name = entry.name || DEFAULT_CASE_NAME;
            });

            const eventBuckets = new Map();
            eventRows.forEach((row) => {
                const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                const normalized = {
                    ...payload,
                    id: toTrimmedString(payload.id || (row && row.event_id), buildEntityId('event'), 80),
                    caseId
                };
                if (!eventBuckets.has(caseId)) eventBuckets.set(caseId, []);
                eventBuckets.get(caseId).push(normalized);
            });

            eventBuckets.forEach((events, caseId) => {
                if (!caseMap.has(caseId)) {
                    caseMap.set(caseId, {
                        id: caseId,
                        name: DEFAULT_CASE_NAME,
                        board: sanitizeBoard(null),
                        events: [],
                        leads: [],
                        vtt: createDefaultVTTState()
                    });
                    caseOrder.push(caseId);
                }
                const entry = caseMap.get(caseId);
                entry.events = sanitizeEventList(events.slice().sort(compareEventsByStoredOrder));
            });

            let activeCaseId = '';
            caseStateRows.some((row) => {
                if (row && row.is_active) {
                    activeCaseId = sanitizeCaseId(row.case_id, '');
                    return true;
                }
                return false;
            });

            const orderedItems = [];
            const seen = new Set();
            caseOrder.forEach((id) => {
                if (!caseMap.has(id) || seen.has(id)) return;
                orderedItems.push(caseMap.get(id));
                seen.add(id);
            });
            caseMap.forEach((entry, id) => {
                if (seen.has(id)) return;
                orderedItems.push(entry);
            });

            const cases = sanitizeCases({
                activeCaseId: activeCaseId || (orderedItems[0] && orderedItems[0].id) || 'case_primary',
                items: orderedItems
            }, base.campaign, base.board);
            base.cases = cases;
            const active = cases.items.find((entry) => entry.id === cases.activeCaseId) || cases.items[0];
            base.board = active ? active.board : sanitizeBoard(null);
            base.campaign.events = active ? active.events : [];

            return sanitizeState(base);
        }

        applyNormalizedCoreRowToState(targetState, row) {
            if (!row || !row.payload || typeof row.payload !== 'object') return;
            const payload = row.payload;
            if (Object.prototype.hasOwnProperty.call(payload, 'rep')) targetState.campaign.rep = sanitizeRep(payload.rep);
            if (Object.prototype.hasOwnProperty.call(payload, 'heat')) targetState.campaign.heat = toNumber(payload.heat, 0);
            if (Object.prototype.hasOwnProperty.call(payload, 'cognitiveRisk')) targetState.campaign.cognitiveRisk = toNumber(payload.cognitiveRisk, 0);
            if (Object.prototype.hasOwnProperty.call(payload, 'ledger')) targetState.campaign.ledger = sanitizeLedgerState(payload.ledger);
            if (Object.prototype.hasOwnProperty.call(payload, 'case')) targetState.campaign.case = sanitizeCase(payload.case);
            if (Object.prototype.hasOwnProperty.call(payload, 'context')) targetState.campaignContext = sanitizeCampaignContext(payload.context, targetState.cases);
            if (Object.prototype.hasOwnProperty.call(payload, 'meta')) {
                const currentMeta = sanitizeCampaignMeta(targetState.campaignMeta);
                const nextMeta = sanitizeCampaignMeta(payload.meta);
                targetState.campaignMeta = sanitizeCampaignMeta({
                    ...currentMeta,
                    ...nextMeta,
                    board: currentMeta.board
                });
            }
        }

        buildNormalizedTargetedFetchPlan(scopes) {
            const campaignEntityPlanMap = {
                players: { allKey: 'fetchPlayersAll', idSet: 'playerIds' },
                npcs: { allKey: 'fetchNPCsAll', idSet: 'npcIds' },
                locations: { allKey: 'fetchLocationsAll', idSet: 'locationIds' },
                requisitions: { allKey: 'fetchRequisitionsAll', idSet: 'requisitionIds' },
                encounters: { allKey: 'fetchEncountersAll', idSet: 'encounterIds' }
            };
            const plan = {
                fetchCore: false,
                fetchHQ: false,
                fetchAllCaseState: false,
                fetchAllCaseEvents: false,
                caseStateIds: new Set(),
                caseEventIds: new Set(),
                granularCaseEventIds: new Map(),
                fetchPlayersAll: false,
                fetchNPCsAll: false,
                fetchLocationsAll: false,
                fetchRequisitionsAll: false,
                fetchEncountersAll: false,
                playerIds: new Set(),
                npcIds: new Set(),
                locationIds: new Set(),
                requisitionIds: new Set(),
                encounterIds: new Set()
            };
            const addGranularCaseEvent = (caseId, eventScopeId) => {
                const cleanCaseId = sanitizeCaseId(caseId, 'case_primary');
                const cleanEventId = normalizeEntityScopeId(eventScopeId);
                if (!cleanEventId || cleanEventId === ENTITY_SCOPE_ORDER_TOKEN) return;
                if (!plan.granularCaseEventIds.has(cleanCaseId)) plan.granularCaseEventIds.set(cleanCaseId, new Set());
                plan.granularCaseEventIds.get(cleanCaseId).add(cleanEventId);
            };
            const addEntityId = (set, scopeId) => {
                const cleanId = normalizeEntityScopeId(scopeId);
                if (!cleanId || cleanId === ENTITY_SCOPE_ORDER_TOKEN) return;
                set.add(cleanId);
            };

            normalizeScopeList(scopes).forEach((scope) => {
                if (!scope || scope === SYNC_SCOPE_GLOBAL) {
                    plan.fetchCore = true;
                    plan.fetchHQ = true;
                    plan.fetchAllCaseState = true;
                    plan.fetchAllCaseEvents = true;
                    plan.fetchPlayersAll = true;
                    plan.fetchNPCsAll = true;
                    plan.fetchLocationsAll = true;
                    plan.fetchRequisitionsAll = true;
                    plan.fetchEncountersAll = true;
                    return;
                }
                if (isRoomBackedScope(scope)) return;

                if (scope === 'campaign' || scope === 'campaign.context' || scope === 'campaign.case' || scope === 'campaign.heat'
                    || scope === 'campaign.rep' || scope === 'campaign.cognitiveRisk' || scope === 'campaign.ledger'
                    || scope === 'campaign.meta' || scope.startsWith('campaign.meta.')) {
                    plan.fetchCore = true;
                    return;
                }
                const campaignEntityMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)(?:\.([a-z0-9_-]+))?$/);
                if (campaignEntityMatch) {
                    const key = campaignEntityMatch[1];
                    const scopeId = campaignEntityMatch[2] || '';
                    const cfg = campaignEntityPlanMap[key];
                    if (!cfg) return;
                    if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                        plan[cfg.allKey] = true;
                    } else if (plan[cfg.idSet] instanceof Set) {
                        addEntityId(plan[cfg.idSet], scopeId);
                    }
                    return;
                }
                if (scope === 'hq') {
                    plan.fetchHQ = true;
                    return;
                }
                if (scope === 'cases' || scope === SYNC_SCOPE_CASES_META) {
                    plan.fetchAllCaseState = true;
                    return;
                }
                const caseEventMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events(?:\.([a-z0-9_-]+))?$/);
                if (caseEventMatch) {
                    const caseId = sanitizeCaseId(caseEventMatch[1], 'case_primary');
                    const scopeId = caseEventMatch[2] || '';
                    if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                        plan.caseEventIds.add(caseId);
                    } else {
                        addGranularCaseEvent(caseId, scopeId);
                    }
                    return;
                }
                const caseFieldMatch = scope.match(/^cases\.([a-z0-9_-]+)(?:\.(name|leads|events))?$/);
                if (caseFieldMatch) {
                    const caseId = sanitizeCaseId(caseFieldMatch[1], 'case_primary');
                    const field = caseFieldMatch[2] || '';
                    if (!field || field === 'name' || field === 'leads') {
                        plan.caseStateIds.add(caseId);
                    }
                    if (!field || field === 'events') {
                        plan.caseEventIds.add(caseId);
                    }
                }
            });

            if (plan.fetchAllCaseEvents) {
                plan.caseEventIds.clear();
                plan.granularCaseEventIds.clear();
            } else if (plan.caseEventIds.size) {
                plan.caseEventIds.forEach((caseId) => plan.granularCaseEventIds.delete(caseId));
            }
            if (plan.fetchPlayersAll) plan.playerIds.clear();
            if (plan.fetchNPCsAll) plan.npcIds.clear();
            if (plan.fetchLocationsAll) plan.locationIds.clear();
            if (plan.fetchRequisitionsAll) plan.requisitionIds.clear();
            if (plan.fetchEncountersAll) plan.encounterIds.clear();

            return plan;
        }

        async fetchNormalizedScopedRows(scopes) {
            const tables = this.getNormalizedTables();
            const plan = this.buildNormalizedTargetedFetchPlan(scopes);
            const queries = [];
            const pushQuery = (key, promise) => queries.push({ key, promise });

            if (plan.fetchCore) pushQuery('core', this.fetchNormalizedSingle(tables.core));
            if (plan.fetchHQ) pushQuery('hq', this.fetchNormalizedSingle(tables.hq));
            if (plan.fetchAllCaseState) {
                pushQuery('caseStateRows', this.fetchNormalizedList(
                    tables.caseState,
                    'case_id,case_name,is_active,sort_order,payload,revision,updated_at,updated_by,updated_by_name',
                    { column: 'sort_order', ascending: true }
                ));
            } else if (plan.caseStateIds.size) {
                pushQuery('caseStateRows', this.fetchNormalizedList(
                    tables.caseState,
                    'case_id,case_name,is_active,sort_order,payload,revision,updated_at,updated_by,updated_by_name',
                    { column: 'sort_order', ascending: true },
                    [{ column: 'case_id', in: Array.from(plan.caseStateIds.values()) }]
                ));
            }
            if (plan.fetchAllCaseEvents) {
                pushQuery('eventRows', this.fetchNormalizedList(
                    tables.caseEvents,
                    'case_id,event_id,payload,revision,updated_at,updated_by,updated_by_name',
                    { column: 'event_id', ascending: true }
                ));
            } else {
                const targetedCaseIds = new Set(plan.caseEventIds);
                if (plan.granularCaseEventIds instanceof Map) {
                    plan.granularCaseEventIds.forEach((_set, caseId) => targetedCaseIds.add(caseId));
                }
                if (targetedCaseIds.size) {
                pushQuery('eventRows', this.fetchNormalizedList(
                    tables.caseEvents,
                    'case_id,event_id,payload,revision,updated_at,updated_by,updated_by_name',
                    { column: 'event_id', ascending: true },
                    [{ column: 'case_id', in: Array.from(targetedCaseIds.values()) }]
                ));
                }
            }
            if (plan.fetchPlayersAll) pushQuery('playerRows', this.fetchNormalizedList(tables.players, 'player_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'player_id', ascending: true }));
            else if (plan.playerIds.size) pushQuery('playerRows', this.fetchNormalizedList(tables.players, 'player_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'player_id', ascending: true }, [{ column: 'player_id', in: Array.from(plan.playerIds.values()) }]));
            if (plan.fetchNPCsAll) pushQuery('npcRows', this.fetchNormalizedList(tables.npcs, 'npc_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'npc_id', ascending: true }));
            else if (plan.npcIds.size) pushQuery('npcRows', this.fetchNormalizedList(tables.npcs, 'npc_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'npc_id', ascending: true }, [{ column: 'npc_id', in: Array.from(plan.npcIds.values()) }]));
            if (plan.fetchLocationsAll) pushQuery('locationRows', this.fetchNormalizedList(tables.locations, 'location_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'location_id', ascending: true }));
            else if (plan.locationIds.size) pushQuery('locationRows', this.fetchNormalizedList(tables.locations, 'location_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'location_id', ascending: true }, [{ column: 'location_id', in: Array.from(plan.locationIds.values()) }]));
            if (plan.fetchRequisitionsAll) pushQuery('requisitionRows', this.fetchNormalizedList(tables.requisitions, 'requisition_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'requisition_id', ascending: true }));
            else if (plan.requisitionIds.size) pushQuery('requisitionRows', this.fetchNormalizedList(tables.requisitions, 'requisition_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'requisition_id', ascending: true }, [{ column: 'requisition_id', in: Array.from(plan.requisitionIds.values()) }]));
            if (plan.fetchEncountersAll) pushQuery('encounterRows', this.fetchNormalizedList(tables.encounters, 'encounter_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'encounter_id', ascending: true }));
            else if (plan.encounterIds.size) pushQuery('encounterRows', this.fetchNormalizedList(tables.encounters, 'encounter_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'encounter_id', ascending: true }, [{ column: 'encounter_id', in: Array.from(plan.encounterIds.values()) }]));

            const settled = await Promise.all(queries.map(async (entry) => ({
                key: entry.key,
                result: await entry.promise
            })));
            const failing = settled.find((entry) => !entry.result.ok);
            if (failing) {
                return {
                    ok: false,
                    error: failing.result.error || 'Targeted normalized read failed.'
                };
            }

            const snapshot = { plan };
            settled.forEach((entry) => {
                snapshot[entry.key] = entry.result.data || null;
            });
            return { ok: true, snapshot };
        }

        buildNormalizedScopeVersionMap(rows) {
            const versionMap = new Map();
            (Array.isArray(rows) ? rows : []).forEach((entry) => {
                const row = this.normalizeRealtimeScopeMeta(entry);
                if (!row) return;
                versionMap.set(row.scope, row);
            });
            return versionMap;
        }

        buildNormalizedRemoteRowFromScopedSnapshot(remoteBase, scopes, snapshot, versionMap = new Map()) {
            const composed = this.applyNormalizedScopedSnapshot(remoteBase, scopes, snapshot, versionMap);
            const scopeSnapshot = buildScopeSnapshot(composed.state);
            const scopeMeta = new Map();
            normalizeScopeList(scopes).forEach((scope) => {
                if (!isGranularNormalizedLwwScope(scope)) return;
                const row = versionMap.get(scope);
                scopeMeta.set(scope, {
                    revision: toNonNegativeInt(row && row.revision, composed.revision),
                    updatedAt: toTimestamp(row && row.updated_at, composed.updatedAt),
                    exists: row ? row.exists !== false : scopeSnapshot.has(scope),
                    signature: scopeSnapshot.has(scope) ? JSON.stringify(scopeSnapshot.get(scope)) : ''
                });
            });
            return {
                state: composed.state,
                revision: toNonNegativeInt(composed.revision, 0),
                updatedAt: toTimestamp(composed.updatedAt, Date.now()),
                updatedBy: composed.updatedBy || '',
                updatedByName: composed.updatedByName || '',
                scopeMeta
            };
        }

        async fetchNormalizedScopeVersionRowsSince(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const tables = this.getNormalizedTables();
            if (!tables.scopeVersions) {
                return { ok: false, reason: 'missing-table', error: 'Scope versions table unavailable.' };
            }

            const sinceRevision = Math.max(0, toNonNegativeInt(
                opts.sinceRevision,
                toNonNegativeInt(this.sync.lastKnownRemoteRevision, 0)
            ));
            const sinceUpdatedAt = toTimestamp(opts.sinceUpdatedAt, toTimestamp(this.sync.lastRemoteSeenAt, 0));
            const allowFullScan = opts.allowFullScan === true;
            let query = this.sync.client
                .from(tables.scopeVersions)
                .select('scope,exists,revision,updated_at,updated_by,updated_by_name')
                .eq('campaign_id', this.sync.config.campaignId);

            if (sinceRevision > 0) {
                query = query.gt('revision', sinceRevision);
            } else if (sinceUpdatedAt > 0) {
                query = query.gt('updated_at', new Date(sinceUpdatedAt).toISOString());
            } else if (!allowFullScan) {
                return { ok: true, reason: 'unknown-baseline', data: null };
            }

            query = query
                .order('revision', { ascending: true })
                .order('updated_at', { ascending: true });

            const result = await query;
            if (result.error) {
                const message = result.error.message || 'Scope version read failed.';
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        message: 'Cloud read failed.',
                        lastError: message
                    });
                }
                return { ok: false, reason: 'error', error: message };
            }

            return {
                ok: true,
                reason: 'rows',
                data: Array.isArray(result.data) ? result.data : []
            };
        }

        async fetchCloudRowNormalizedDelta(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const remoteBase = sanitizeState(opts.remoteBase || this.sync.lastSyncedState || this.state);
            const versionRowsResult = Array.isArray(opts.scopeVersionRows)
                ? { ok: true, reason: 'provided', data: opts.scopeVersionRows }
                : await this.fetchNormalizedScopeVersionRowsSince({
                    silent,
                    sinceRevision: opts.sinceRevision,
                    sinceUpdatedAt: opts.sinceUpdatedAt,
                    allowFullScan: opts.allowFullScan === true
                });

            if (!versionRowsResult.ok) return versionRowsResult;
            if (!versionRowsResult.data) {
                return this.fetchCloudRowNormalized({ silent });
            }

            const versionMap = this.buildNormalizedScopeVersionMap(versionRowsResult.data);
            const changedScopes = Array.from(versionMap.keys());
            if (!changedScopes.length) {
                const baselineRevision = Math.max(
                    toNonNegativeInt(remoteBase && remoteBase.meta && remoteBase.meta.syncRevision, 0),
                    Math.max(0, toNonNegativeInt(opts.sinceRevision, 0))
                );
                const baselineUpdatedAt = toTimestamp(remoteBase && remoteBase.meta && remoteBase.meta.updated, 0);
                if (!baselineRevision && !baselineUpdatedAt && !this.sync.lastPullAt && !this.sync.lastKnownRemoteRevision) {
                    return { ok: true, reason: 'empty', row: null, changedScopes: [], scopeVersionRows: [] };
                }
                return {
                    ok: true,
                    reason: 'up-to-date',
                    row: {
                        state: remoteBase,
                        revision: baselineRevision,
                        updatedAt: baselineUpdatedAt,
                        updatedAtRaw: baselineUpdatedAt ? new Date(baselineUpdatedAt).toISOString() : '',
                        updatedBy: '',
                        updatedByName: '',
                        scopeMeta: new Map()
                    },
                    changedScopes: [],
                    scopeVersionRows: []
                };
            }

            const scopedFetch = await this.fetchNormalizedScopedRows(changedScopes);
            if (!scopedFetch.ok) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        message: 'Cloud read failed.',
                        lastError: scopedFetch.error || 'Targeted normalized read failed.'
                    });
                }
                return { ok: false, reason: 'error', error: scopedFetch.error || 'Targeted normalized read failed.' };
            }

            const row = this.buildNormalizedRemoteRowFromScopedSnapshot(remoteBase, changedScopes, scopedFetch.snapshot, versionMap);
            row.updatedAtRaw = row.updatedAt ? new Date(row.updatedAt).toISOString() : '';
            return {
                ok: true,
                reason: 'delta',
                row,
                changedScopes,
                scopeVersionRows: Array.from(versionMap.values())
            };
        }

        applyNormalizedScopedSnapshot(baseState, scopes, snapshot, versionMap = new Map()) {
            const remoteBase = sanitizeState(baseState);
            const sourceState = sanitizeState(remoteBase);
            const plan = snapshot && snapshot.plan ? snapshot.plan : this.buildNormalizedTargetedFetchPlan(scopes);
            const setEntityCollection = (key, rows, idColumn, fallbackPrefix) => {
                sourceState.campaign[key] = (Array.isArray(rows) ? rows : []).map((row) =>
                    this.ensureEntityId(row && row.payload, toTrimmedString(row && row[idColumn], buildEntityId(fallbackPrefix), 80), 'id')
                );
            };

            if (snapshot && snapshot.core) this.applyNormalizedCoreRowToState(sourceState, snapshot.core);
            if (snapshot && snapshot.hq && snapshot.hq.payload && typeof snapshot.hq.payload === 'object') {
                sourceState.hq = sanitizeHQ(snapshot.hq.payload);
            }
            if (plan.fetchPlayersAll && snapshot && snapshot.playerRows) setEntityCollection('players', snapshot.playerRows, 'player_id', 'player');
            if (plan.fetchNPCsAll && snapshot && snapshot.npcRows) setEntityCollection('npcs', snapshot.npcRows, 'npc_id', 'npc');
            if (plan.fetchLocationsAll && snapshot && snapshot.locationRows) setEntityCollection('locations', snapshot.locationRows, 'location_id', 'loc');
            if (plan.fetchRequisitionsAll && snapshot && snapshot.requisitionRows) setEntityCollection('requisitions', snapshot.requisitionRows, 'requisition_id', 'req');
            if (plan.fetchEncountersAll && snapshot && snapshot.encounterRows) setEntityCollection('encounters', snapshot.encounterRows, 'encounter_id', 'enc');

            const applyEntityRows = (key, rows, idColumn, idSet, fallbackPrefix) => {
                if (!(idSet instanceof Set) || !idSet.size) return;
                const existing = Array.isArray(sourceState.campaign[key]) ? sourceState.campaign[key].slice() : [];
                const byScopeId = new Map();
                (Array.isArray(rows) ? rows : []).forEach((row) => {
                    const payload = this.ensureEntityId(row && row.payload, toTrimmedString(row && row[idColumn], buildEntityId(fallbackPrefix), 80), 'id');
                    byScopeId.set(normalizeEntityScopeId(payload && payload.id), payload);
                });
                const keep = [];
                existing.forEach((entry) => {
                    const scopeId = normalizeEntityScopeId(entry && entry.id);
                    if (!scopeId || !idSet.has(scopeId)) {
                        keep.push(entry);
                        return;
                    }
                    const version = versionMap.get(`campaign.${key}.${scopeId}`);
                    if (version && version.exists === false && !byScopeId.has(scopeId)) return;
                    keep.push(byScopeId.has(scopeId) ? byScopeId.get(scopeId) : entry);
                    byScopeId.delete(scopeId);
                });
                byScopeId.forEach((entry, scopeId) => {
                    if (idSet.has(scopeId)) keep.push(entry);
                });
                sourceState.campaign[key] = keep;
            };

            applyEntityRows('players', snapshot && snapshot.playerRows, 'player_id', plan.playerIds, 'player');
            applyEntityRows('npcs', snapshot && snapshot.npcRows, 'npc_id', plan.npcIds, 'npc');
            applyEntityRows('locations', snapshot && snapshot.locationRows, 'location_id', plan.locationIds, 'loc');
            applyEntityRows('requisitions', snapshot && snapshot.requisitionRows, 'requisition_id', plan.requisitionIds, 'req');
            applyEntityRows('encounters', snapshot && snapshot.encounterRows, 'encounter_id', plan.encounterIds, 'enc');

            if (plan.fetchAllCaseState && Array.isArray(snapshot && snapshot.caseStateRows)) {
                const caseRows = snapshot.caseStateRows;
                const activeCaseId = (caseRows.find((row) => row && row.is_active) || {}).case_id || remoteBase.cases.activeCaseId;
                sourceState.cases.activeCaseId = sanitizeCaseId(activeCaseId, remoteBase.cases.activeCaseId || 'case_primary');
                sourceState.cases.items = caseRows.map((row) => {
                    const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                    const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                    const existing = getCaseById(sourceState, caseId);
                    return {
                        id: caseId,
                        name: sanitizeCaseName(row && row.case_name ? row.case_name : payload.name, existing && existing.name ? existing.name : DEFAULT_CASE_NAME),
                        board: sanitizeBoard(existing && existing.board),
                        events: sanitizeEventList(existing && existing.events),
                        leads: sanitizeLeadList(payload.leads),
                        vtt: sanitizeVTTState(existing && existing.vtt)
                    };
                });
            } else if (plan.caseStateIds.size && Array.isArray(snapshot && snapshot.caseStateRows)) {
                snapshot.caseStateRows.forEach((row) => {
                    const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                    const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                    let entry = getCaseById(sourceState, caseId);
                    if (!entry) {
                        entry = {
                            id: caseId,
                            name: DEFAULT_CASE_NAME,
                            board: sanitizeBoard(null),
                            events: [],
                            leads: [],
                            vtt: createDefaultVTTState()
                        };
                        sourceState.cases.items.push(entry);
                    }
                    entry.name = sanitizeCaseName(row && row.case_name ? row.case_name : payload.name, entry.name || DEFAULT_CASE_NAME);
                    entry.leads = sanitizeLeadList(payload.leads);
                    if (row && row.is_active) sourceState.cases.activeCaseId = caseId;
                });
                const currentItems = Array.isArray(sourceState.cases && sourceState.cases.items) ? sourceState.cases.items : [];
                sourceState.cases.items = currentItems.filter((entry) => {
                    if (!entry || !entry.id || !plan.caseStateIds.has(entry.id)) return true;
                    const scopeCandidates = [
                        `cases.${entry.id}`,
                        `cases.${entry.id}.name`,
                        `cases.${entry.id}.leads`
                    ];
                    return !scopeCandidates.some((scopeToken) => {
                        const version = versionMap.get(scopeToken);
                        return version && version.exists === false;
                    });
                });
            }

            if (plan.fetchAllCaseEvents && Array.isArray(snapshot && snapshot.eventRows)) {
                const byCase = new Map();
                snapshot.eventRows.forEach((row) => {
                    const caseId = sanitizeCaseId(row && row.case_id, 'case_primary');
                    const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                    const normalized = {
                        ...payload,
                        id: toTrimmedString(payload.id || (row && row.event_id), buildEntityId('event'), 80),
                        caseId
                    };
                    if (!byCase.has(caseId)) byCase.set(caseId, []);
                    byCase.get(caseId).push(normalized);
                });
                sourceState.cases.items.forEach((entry) => {
                    entry.events = sanitizeEventList((byCase.get(entry.id) || []).slice().sort(compareEventsByStoredOrder));
                });
            } else {
                if (plan.caseEventIds.size && Array.isArray(snapshot && snapshot.eventRows)) {
                    const targetCaseIds = new Set(plan.caseEventIds);
                    sourceState.cases.items.forEach((entry) => {
                        if (!entry || !targetCaseIds.has(entry.id)) return;
                        const rows = snapshot.eventRows.filter((row) => sanitizeCaseId(row && row.case_id, 'case_primary') === entry.id);
                        entry.events = sanitizeEventList(rows.map((row) => {
                            const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                            return {
                                ...payload,
                                id: toTrimmedString(payload.id || (row && row.event_id), buildEntityId('event'), 80),
                                caseId: entry.id
                            };
                        }).sort(compareEventsByStoredOrder));
                    });
                }
                if (plan.granularCaseEventIds instanceof Map && plan.granularCaseEventIds.size && Array.isArray(snapshot && snapshot.eventRows)) {
                    plan.granularCaseEventIds.forEach((scopeIds, caseId) => {
                        const entry = getCaseById(sourceState, caseId);
                        if (!entry) return;
                        const eventMap = new Map();
                        snapshot.eventRows
                            .filter((row) => sanitizeCaseId(row && row.case_id, 'case_primary') === caseId)
                            .forEach((row) => {
                                const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
                                const eventId = normalizeEntityScopeId(payload.id || (row && row.event_id));
                                if (!eventId) return;
                                eventMap.set(eventId, {
                                    ...payload,
                                    id: toTrimmedString(payload.id || (row && row.event_id), buildEntityId('event'), 80),
                                    caseId
                                });
                            });
                        entry.events = sanitizeEventList((Array.isArray(entry.events) ? entry.events : []).filter((eventEntry) => {
                            const eventId = normalizeEntityScopeId(eventEntry && eventEntry.id);
                            if (!eventId || !scopeIds.has(eventId)) return true;
                            const version = versionMap.get(`cases.${caseId}.events.${eventId}`);
                            return !(version && version.exists === false && !eventMap.has(eventId));
                        }));
                        entry.events = sanitizeEventList(entry.events.concat(Array.from(eventMap.values())));
                    });
                }
            }

            let maxRevision = 0;
            let maxUpdatedAt = 0;
            let maxUpdatedBy = '';
            let maxUpdatedByName = '';
            versionMap.forEach((rowMeta) => {
                const revision = toNonNegativeInt(rowMeta && rowMeta.revision, 0);
                const updatedAt = toTimestamp(rowMeta && rowMeta.updated_at, 0);
                if (revision > maxRevision) maxRevision = revision;
                if (updatedAt >= maxUpdatedAt) {
                    maxUpdatedAt = updatedAt;
                    maxUpdatedBy = toTrimmedString(rowMeta && rowMeta.updated_by, '', 120);
                    maxUpdatedByName = toTrimmedString(rowMeta && rowMeta.updated_by_name, '', 120);
                }
            });

            const nextRemoteState = sanitizeState(remoteBase);
            normalizeScopeList(scopes).forEach((scope) => {
                if (isRoomBackedScope(scope)) return;
                applyScopeFromSource(nextRemoteState, sourceState, scope);
            });
            nextRemoteState.meta.updated = maxUpdatedAt || toTimestamp(nextRemoteState.meta && nextRemoteState.meta.updated, Date.now());
            nextRemoteState.meta.syncRevision = Math.max(maxRevision, toNonNegativeInt(nextRemoteState.meta && nextRemoteState.meta.syncRevision, 0));

            return {
                state: sanitizeState(nextRemoteState),
                revision: maxRevision,
                updatedAt: maxUpdatedAt,
                updatedBy: maxUpdatedBy,
                updatedByName: maxUpdatedByName
            };
        }

        async fetchCloudRowNormalized(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const tables = this.getNormalizedTables();

            const tasks = await Promise.all([
                this.fetchNormalizedSingle(tables.core),
                this.fetchNormalizedSingle(tables.hq),
                this.fetchNormalizedList(tables.caseState, 'case_id,case_name,is_active,sort_order,payload,revision,updated_at,updated_by,updated_by_name', { column: 'sort_order', ascending: true }),
                this.fetchNormalizedList(tables.caseEvents, 'case_id,event_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'event_id', ascending: true }),
                this.fetchNormalizedList(tables.players, 'player_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'player_id', ascending: true }),
                this.fetchNormalizedList(tables.npcs, 'npc_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'npc_id', ascending: true }),
                this.fetchNormalizedList(tables.locations, 'location_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'location_id', ascending: true }),
                this.fetchNormalizedList(tables.requisitions, 'requisition_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'requisition_id', ascending: true }),
                this.fetchNormalizedList(tables.encounters, 'encounter_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'encounter_id', ascending: true })
            ]);

            const failing = tasks.find((entry) => !entry.ok);
            if (failing) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        message: 'Cloud read failed.',
                        lastError: failing.error || 'Normalized read failed.'
                    });
                }
                return {
                    ok: false,
                    reason: 'error',
                    error: failing.error || 'Normalized read failed.'
                };
            }

            const [coreRes, hqRes, caseStateRes, eventsRes, playersRes, npcsRes, locationsRes, requisitionsRes, encountersRes] = tasks;
            const rowCount =
                (coreRes.data ? 1 : 0)
                + (hqRes.data ? 1 : 0)
                + caseStateRes.data.length
                + eventsRes.data.length
                + playersRes.data.length
                + npcsRes.data.length
                + locationsRes.data.length
                + requisitionsRes.data.length
                + encountersRes.data.length;

            if (!rowCount) {
                return { ok: true, reason: 'empty', row: null };
            }

            const assembledState = this.composeNormalizedState({
                core: coreRes.data,
                hq: hqRes.data,
                caseStateRows: caseStateRes.data,
                eventRows: eventsRes.data,
                playerRows: playersRes.data,
                npcRows: npcsRes.data,
                locationRows: locationsRes.data,
                requisitionRows: requisitionsRes.data,
                encounterRows: encountersRes.data
            });
            const assembledSnapshot = buildScopeSnapshot(assembledState);
            const scopeMeta = new Map();
            const setScopeMeta = (scopeToken, rowMeta) => {
                const scope = normalizeScopeToken(scopeToken);
                if (!isGranularNormalizedLwwScope(scope)) return;
                const row = rowMeta && typeof rowMeta === 'object' ? rowMeta : {};
                scopeMeta.set(scope, {
                    revision: toNonNegativeInt(row.revision, 0),
                    updatedAt: toTimestamp(row.updated_at, 0),
                    exists: assembledSnapshot.has(scope),
                    signature: assembledSnapshot.has(scope)
                        ? JSON.stringify(assembledSnapshot.get(scope))
                        : ''
                });
            };

            playersRes.data.forEach((row) => setScopeMeta(buildPlayerEntityScope(row && row.player_id), row));
            npcsRes.data.forEach((row) => setScopeMeta(buildNPCEntityScope(row && row.npc_id), row));
            locationsRes.data.forEach((row) => setScopeMeta(buildLocationEntityScope(row && row.location_id), row));
            requisitionsRes.data.forEach((row) => setScopeMeta(buildRequisitionEntityScope(row && row.requisition_id), row));
            encountersRes.data.forEach((row) => setScopeMeta(buildEncounterEntityScope(row && row.encounter_id), row));
            eventsRes.data.forEach((row) => setScopeMeta(buildCaseEventEntityScope(row && row.case_id, row && row.event_id), row));
            if (coreRes.data) {
                assembledSnapshot.forEach((_value, scopeToken) => {
                    const scope = normalizeScopeToken(scopeToken);
                    if (!scope.startsWith('campaign.meta.events.')) return;
                    if (!isGranularNormalizedLwwScope(scope)) return;
                    setScopeMeta(scope, coreRes.data);
                });
            }

            const metaRows = [
                ...this.extractRowMeta(coreRes.data),
                ...this.extractRowMeta(hqRes.data),
                ...this.extractRowMeta(caseStateRes.data),
                ...this.extractRowMeta(eventsRes.data),
                ...this.extractRowMeta(playersRes.data),
                ...this.extractRowMeta(npcsRes.data),
                ...this.extractRowMeta(locationsRes.data),
                ...this.extractRowMeta(requisitionsRes.data),
                ...this.extractRowMeta(encountersRes.data)
            ];

            let remoteRevision = 0;
            let remoteUpdatedAt = 0;
            let remoteUpdatedAtRaw = '';
            let remoteUpdatedBy = '';
            let remoteUpdatedByName = '';
            metaRows.forEach((meta) => {
                if (!meta) return;
                if (meta.revision > remoteRevision) remoteRevision = meta.revision;
                if (meta.updatedAt >= remoteUpdatedAt) {
                    remoteUpdatedAt = meta.updatedAt;
                    remoteUpdatedAtRaw = meta.updatedAtRaw;
                    remoteUpdatedBy = meta.updatedBy;
                    remoteUpdatedByName = meta.updatedByName;
                }
            });

            assembledState.meta.updated = remoteUpdatedAt || assembledState.meta.updated;
            assembledState.meta.syncRevision = remoteRevision || assembledState.meta.syncRevision;

            return {
                ok: true,
                reason: 'row',
                row: {
                    state: sanitizeState(assembledState),
                    revision: toNonNegativeInt(assembledState.meta.syncRevision, remoteRevision),
                    updatedAt: toTimestamp(assembledState.meta.updated, remoteUpdatedAt),
                    updatedAtRaw: remoteUpdatedAtRaw,
                    updatedBy: remoteUpdatedBy,
                    updatedByName: remoteUpdatedByName,
                    scopeMeta
                }
            };
        }

        async fetchCloudRow(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;

            if (!this.sync.client) {
                return { ok: false, reason: 'not-connected' };
            }

            if (this.isNormalizedReadMode()) {
                return this.fetchCloudRowNormalized(opts);
            }

            const config = this.sync.config;
            const result = await this.sync.client
                .from(config.tableName)
                .select('state,updated_at,updated_by,updated_by_name')
                .eq('campaign_id', config.campaignId)
                .maybeSingle();

            if (result.error) {
                const code = result.error.code || '';
                if (code === 'PGRST116') {
                    return { ok: true, reason: 'empty', row: null };
                }
                const message = result.error.message || 'Cloud read failed.';
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        message: 'Cloud read failed.',
                        lastError: message
                    });
                }
                return { ok: false, reason: 'error', error: message };
            }

            const data = result.data;
            if (!data || !data.state) {
                return { ok: true, reason: 'empty', row: null };
            }

            const cleanState = sanitizeState(data.state);
            const revision = toNonNegativeInt(cleanState.meta && cleanState.meta.syncRevision, 0);
            return {
                ok: true,
                reason: 'row',
                row: {
                    state: cleanState,
                    revision,
                    updatedAt: toTimestamp(data.updated_at, 0),
                    updatedAtRaw: typeof data.updated_at === 'string' ? data.updated_at : '',
                    updatedBy: data.updated_by || '',
                    updatedByName: data.updated_by_name || ''
                }
            };
        }

        buildNormalizedDirtyScopeResolution(remoteRow, localScopes) {
            const remoteState = sanitizeState(remoteRow && remoteRow.state ? remoteRow.state : null);
            const baseline = sanitizeState(this.sync.lastSyncedState || remoteState);
            const dirtyScopes = this.getDirtyScopesSnapshot(localScopes);
            const remoteChangedScopes = getChangedScopes(baseline, remoteState);
            const overlappingScopeSet = new Set(getOverlappingScopes(dirtyScopes, remoteChangedScopes));
            const remoteChangedScopeSet = new Set(remoteChangedScopes);
            const remoteResolvedScopes = [];
            const protectedOverlapScopes = [];
            const retainedDirtyScopes = [];

            dirtyScopes.forEach((scope) => {
                if (!overlappingScopeSet.has(scope)) {
                    retainedDirtyScopes.push(scope);
                    return;
                }
                if (isGranularNormalizedLwwScope(scope)
                    && remoteChangedScopeSet.has(scope)
                    && this.didRemoteGranularScopeChangeSinceBaseline(scope, remoteRow)) {
                    remoteResolvedScopes.push(scope);
                    return;
                }
                protectedOverlapScopes.push(scope);
                retainedDirtyScopes.push(scope);
            });

            const mergeBase = mergeRemoteBoardWithLocalLayout(remoteState, this.state);
            const mergedState = retainedDirtyScopes.length
                ? mergeStateByScopes(mergeBase, this.state, retainedDirtyScopes)
                : mergeBase;
            return {
                dirtyScopes,
                remoteChangedScopes,
                remoteResolvedScopes,
                protectedOverlapScopes,
                retainedDirtyScopes,
                mergedState
            };
        }

        buildNormalizedPushScopeFilter(remoteRow, dirtyScopes) {
            const scopeList = Array.isArray(dirtyScopes)
                ? (dirtyScopes.length ? normalizeScopeList(dirtyScopes) : [])
                : this.getDirtyScopesSnapshot(dirtyScopes);
            const remainingDirtyScopes = [];
            const remoteWinScopes = [];
            const syncedScopes = [];

            scopeList.forEach((scope) => {
                if (!isGranularNormalizedLwwScope(scope)) {
                    remainingDirtyScopes.push(scope);
                    return;
                }

                const baseline = this.getScopeBaseline(scope);
                if (!baseline) {
                    remainingDirtyScopes.push(scope);
                    return;
                }

                const localExists = hasGranularNormalizedScopeInState(this.state, scope);
                const remoteMeta = this.getNormalizedRemoteScopeMeta(remoteRow, scope);
                if (!remoteMeta) {
                    remainingDirtyScopes.push(scope);
                    return;
                }

                const remoteChanged = this.didRemoteGranularScopeChangeSinceBaseline(scope, remoteRow, baseline);
                if (!localExists) {
                    if (!remoteMeta.exists) {
                        syncedScopes.push(scope);
                        return;
                    }
                    if (remoteChanged) {
                        remoteWinScopes.push(scope);
                        return;
                    }
                    remainingDirtyScopes.push(scope);
                    return;
                }

                if (!baseline.exists && remoteMeta.exists) {
                    remoteWinScopes.push(scope);
                    return;
                }
                if (remoteChanged) {
                    remoteWinScopes.push(scope);
                    return;
                }

                remainingDirtyScopes.push(scope);
            });

            return {
                remainingDirtyScopes,
                remoteWinScopes,
                syncedScopes,
                resolvedScopes: [...remoteWinScopes, ...syncedScopes]
            };
        }

        applyMergedRemoteState(remoteRow, dirtyScopes, reason = 'auto-merge', options = {}) {
            if (!remoteRow || !remoteRow.state) return false;
            const opts = options && typeof options === 'object' ? options : {};
            const retainedDirtyScopes = Array.isArray(dirtyScopes)
                ? (dirtyScopes.length ? normalizeScopeList(dirtyScopes) : [])
                : this.getDirtyScopesSnapshot(dirtyScopes);
            const remoteState = sanitizeState(remoteRow.state);
            const remoteRevision = toNonNegativeInt(remoteRow.revision, 0);
            const remoteUpdatedAt = toTimestamp(remoteRow.updatedAt, 0);
            const mergeBase = mergeRemoteBoardWithLocalLayout(remoteState, this.state);
            const mergedState = opts.mergedState
                ? sanitizeState(opts.mergedState)
                : (retainedDirtyScopes.length
                    ? mergeStateByScopes(mergeBase, this.state, retainedDirtyScopes)
                    : mergeBase);
            const localStamp = Date.now();

            this.state = sanitizeState(mergedState);
            this.syncActiveCaseLegacyState();
            this.ensureCampaignEntityIds(false);
            this.state.meta.updated = localStamp;
            this.state.meta.syncRevision = remoteRevision || toNonNegativeInt(this.state.meta.syncRevision, 0);
            this.replaceLocalDirtyScopes(retainedDirtyScopes, localStamp);
            this.sync.lastKnownRemoteRevision = Math.max(this.sync.lastKnownRemoteRevision, remoteRevision);
            if (remoteUpdatedAt > this.sync.lastRemoteSeenAt) this.sync.lastRemoteSeenAt = remoteUpdatedAt;
            this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(remoteState));
            this.sync.lastSyncedState = sanitizeState(remoteState);

            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch (writeErr) {
                console.warn('RTF_STORE: Failed writing merged local state', writeErr);
            }

            this.syncScopeBaselinesFromRemoteRow(remoteRow, null, { skipDirtyScopes: true });
            if (opts.clearPendingConflict !== false
                && this.sync.pendingConflict
                && remoteRevision >= toNonNegativeInt(this.sync.pendingConflict.remoteRevision, 0)) {
                this.sync.pendingConflict = null;
            }

            const broadcastSource = opts.broadcastSource || (retainedDirtyScopes.length ? 'local' : 'remote');
            this.broadcastStoreUpdate(broadcastSource, {
                reason,
                scopes: retainedDirtyScopes,
                updatedAt: remoteUpdatedAt,
                updatedBy: remoteRow.updatedBy || '',
                revision: remoteRevision
            });

            if (opts.schedulePush !== false && retainedDirtyScopes.length) {
                this.scheduleCloudPush(reason);
            }
            if (!opts.skipStatus) {
                this.updateSyncStatus({
                    mode: 'ready',
                    connected: this.hasLiveSyncConnection(),
                    pendingPush: !!retainedDirtyScopes.length,
                    message: opts.message || (retainedDirtyScopes.length
                        ? 'Merged remote changes with remaining local edits.'
                        : 'Applied latest cloud state.')
                });
            }
            return true;
        }

        buildConflictRecord(remoteRow, localScopes, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const remoteState = sanitizeState(remoteRow && remoteRow.state ? remoteRow.state : null);
            const localState = sanitizeState(this.state);
            const baseline = sanitizeState(this.sync.lastSyncedState || remoteState);
            const dirtyScopes = Array.isArray(opts.dirtyScopes)
                ? (opts.dirtyScopes.length ? normalizeScopeList(opts.dirtyScopes) : [])
                : this.getDirtyScopesSnapshot(localScopes);
            const remoteChangedScopes = Array.isArray(opts.remoteChangedScopes)
                ? (opts.remoteChangedScopes.length ? normalizeScopeList(opts.remoteChangedScopes) : [])
                : getChangedScopes(baseline, remoteState);
            const overlappingScopes = Array.isArray(opts.overlappingScopes)
                ? (opts.overlappingScopes.length ? normalizeScopeList(opts.overlappingScopes) : [])
                : getOverlappingScopes(dirtyScopes, remoteChangedScopes);
            const mergedState = opts.mergedState
                ? sanitizeState(opts.mergedState)
                : mergeStateByScopes(mergeRemoteBoardWithLocalLayout(remoteState, localState), localState, dirtyScopes);
            return {
                id: `conf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                createdAt: Date.now(),
                dirtyScopes,
                remoteChangedScopes,
                overlappingScopes,
                remoteRevision: toNonNegativeInt(remoteRow && remoteRow.revision, 0),
                localRevision: toNonNegativeInt(localState.meta && localState.meta.syncRevision, 0),
                remoteUpdatedAt: toTimestamp(remoteRow && remoteRow.updatedAt, 0),
                remoteUpdatedAtRaw: remoteRow && remoteRow.updatedAtRaw ? remoteRow.updatedAtRaw : '',
                remoteUpdatedBy: remoteRow && remoteRow.updatedBy ? remoteRow.updatedBy : '',
                remoteUpdatedByName: remoteRow && remoteRow.updatedByName ? remoteRow.updatedByName : '',
                mergedState,
                remoteState,
                remoteScopeMeta: opts.remoteScopeMeta || (remoteRow && remoteRow.scopeMeta ? remoteRow.scopeMeta : null)
            };
        }

        adoptMergedConflictState(conflict, reason = 'auto-merge') {
            if (!conflict || !conflict.mergedState) return false;
            return this.applyMergedRemoteState({
                state: conflict.remoteState,
                revision: conflict.remoteRevision,
                updatedAt: conflict.remoteUpdatedAt,
                updatedAtRaw: conflict.remoteUpdatedAtRaw,
                updatedBy: conflict.remoteUpdatedBy,
                updatedByName: conflict.remoteUpdatedByName,
                scopeMeta: conflict.remoteScopeMeta || null
            }, Array.isArray(conflict.dirtyScopes) ? conflict.dirtyScopes : [], reason, {
                mergedState: conflict.mergedState,
                message: 'Merged non-overlapping remote changes with local edits.'
            });
        }

        getPendingConflict() {
            const conflict = this.sync.pendingConflict;
            if (!conflict) return null;
            return {
                id: conflict.id,
                createdAt: conflict.createdAt,
                dirtyScopes: deepClone(conflict.dirtyScopes),
                remoteChangedScopes: deepClone(conflict.remoteChangedScopes),
                overlappingScopes: deepClone(conflict.overlappingScopes),
                remoteRevision: conflict.remoteRevision,
                localRevision: conflict.localRevision,
                remoteUpdatedAt: conflict.remoteUpdatedAt,
                remoteUpdatedBy: conflict.remoteUpdatedBy,
                remoteUpdatedByName: conflict.remoteUpdatedByName
            };
        }

        setPendingConflict(conflict) {
            if (!conflict) return null;
            this.sync.pendingConflict = conflict;
            const summary = this.getPendingConflict();
            this.updateSyncStatus({
                mode: 'conflict',
                message: 'Protected shared scopes changed while you were editing. Resolve the conflict before pushing.',
                pendingPush: false
            });
            if (summary && typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
                global.dispatchEvent(new CustomEvent(SYNC_CONFLICT_EVENT, { detail: summary }));
            }
            return summary;
        }

        clearPendingConflict(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            this.sync.pendingConflict = null;
            if (opts.keepStatus) return;
            this.updateSyncStatus({
                mode: this.syncStatus.connected ? 'ready' : this.syncStatus.mode,
                message: opts.message || this.syncStatus.message
            });
        }

        async resolvePendingConflict(action = 'accept-remote') {
            const conflict = this.sync.pendingConflict;
            if (!conflict) return { ok: false, reason: 'no-conflict' };

            if (action === 'accept-remote') {
                const applied = this.applyRemoteState(conflict.remoteState, {
                    source: 'conflict-accept',
                    updatedAt: conflict.remoteUpdatedAt,
                    updatedBy: conflict.remoteUpdatedBy,
                    revision: conflict.remoteRevision,
                    force: true
                });
                this.clearLocalDirtyScopes();
                this.clearPendingConflict({ message: 'Accepted remote state.' });
                return { ok: true, action, applied };
            }

            if (action === 'keep-local') {
                const dirtyScopes = conflict.dirtyScopes && conflict.dirtyScopes.length ? conflict.dirtyScopes : [SYNC_SCOPE_GLOBAL];
                this.state = sanitizeState(conflict.mergedState);
                this.syncActiveCaseLegacyState();
                this.ensureCampaignEntityIds(false);
                this.markLocalDirtyScopes(dirtyScopes, Date.now());
                this.save({ skipCloud: true, scope: dirtyScopes });
                this.sync.lastKnownRemoteRevision = toNonNegativeInt(conflict.remoteRevision, this.sync.lastKnownRemoteRevision);
                this.sync.pendingConflict = null;
                const pushed = await this.pushToCloud({
                    reason: 'resolve-conflict',
                    silent: false,
                    force: true,
                    baseRevision: this.sync.lastKnownRemoteRevision,
                    scopes: dirtyScopes,
                    attempt: 0
                });
                if (pushed.ok) {
                    this.clearPendingConflict({ message: 'Merged local changes and pushed to cloud.' });
                    return { ok: true, action, pushed: true };
                }
                if (pushed.reason !== 'conflict') {
                    this.setPendingConflict(conflict);
                }
                return pushed;
            }

            return { ok: false, reason: 'unknown-action' };
        }

        async loadSupabaseLibrary() {
            if (global.supabase && typeof global.supabase.createClient === 'function') {
                return global.supabase;
            }
            if (this.sync.supabaseLoadPromise) {
                return this.sync.supabaseLoadPromise;
            }

            this.sync.supabaseLoadPromise = new Promise((resolve, reject) => {
                if (!global.document || !document.head) {
                    reject(new Error('Document context unavailable.'));
                    return;
                }

                const onReady = () => {
                    if (global.supabase && typeof global.supabase.createClient === 'function') resolve(global.supabase);
                    else reject(new Error('Supabase client library not available after load.'));
                };

                const existing = document.querySelector('script[data-rtf-supabase="1"]');
                if (existing) {
                    if (global.supabase && typeof global.supabase.createClient === 'function') {
                        resolve(global.supabase);
                    } else {
                        existing.addEventListener('load', onReady, { once: true });
                        existing.addEventListener('error', () => reject(new Error('Failed to load Supabase library.')), { once: true });
                    }
                    return;
                }

                const script = document.createElement('script');
                script.src = SUPABASE_CDN_URL;
                script.async = true;
                script.dataset.rtfSupabase = '1';
                script.onload = onReady;
                script.onerror = () => reject(new Error('Failed to load Supabase library.'));
                document.head.appendChild(script);
            });

            return this.sync.supabaseLoadPromise;
        }

        async ensureCloudAccess(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const explicit = opts.explicit === true;
            const silent = !!opts.silent;
            const requirePageSync = opts.requirePageSync === true;
            const coerced = coerceAutoConnectBackendMode(this.sync.config);
            if (coerced.changed) {
                this.sync.config = coerced.config;
                try {
                    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(coerced.config));
                } catch (err) {
                    console.warn('RTF_STORE: Failed to persist coerced sync backend mode', err);
                }
            }

            const config = this.sync.config;
            if (!config.enabled) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'disabled',
                        connected: false,
                        enabled: false,
                        message: 'Cloud sync is disabled.',
                        pendingPush: false
                    });
                }
                return { ok: false, reason: 'disabled' };
            }

            if (!config.supabaseUrl || !config.anonKey || !config.campaignId) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: false,
                        enabled: true,
                        message: 'Missing sync config: URL, anon key, or campaign ID.',
                        lastError: 'Missing required sync config.'
                    });
                }
                return { ok: false, reason: 'missing-config' };
            }

            if (requirePageSync && !explicit && !shouldAutoConnectOnThisPage()) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'idle',
                        connected: this.hasLiveSyncConnection(),
                        enabled: true,
                        campaignId: config.campaignId,
                        profileName: config.profileName,
                        message: this.sync.userId
                            ? 'Signed in. Cloud sync will fetch or push only when needed.'
                            : 'Cloud sync is standing by until needed.',
                        pendingPush: false,
                        lastError: ''
                    });
                }
                return { ok: false, reason: 'page-blocked' };
            }

            try {
                await this.ensureSupabaseClient(config);

                const authResult = await this.ensureSyncUser();
                if (!authResult.ok) {
                    if (!silent) {
                        this.updateSyncStatus({
                            mode: 'auth_required',
                            connected: this.hasLiveSyncConnection(),
                            userId: '',
                            message: authResult.message || 'Authentication required for sync.',
                            lastError: authResult.message || 'Authentication required.'
                        });
                    }
                    return { ok: false, reason: 'auth-required', error: authResult.message || 'Authentication required.' };
                }

                this.sync.userId = authResult.userId || '';
                if (!silent) {
                    const liveConnected = this.hasLiveSyncConnection();
                    this.updateSyncStatus({
                        mode: liveConnected ? 'ready' : 'idle',
                        connected: liveConnected,
                        enabled: true,
                        userId: this.sync.userId,
                        campaignId: config.campaignId,
                        profileName: config.profileName,
                        message: liveConnected
                            ? 'Connected to cloud sync.'
                            : 'Authorized for cloud sync.',
                        lastError: ''
                    });
                }
                return {
                    ok: true,
                    client: this.sync.client,
                    config,
                    userId: this.sync.userId || '',
                    profileName: config.profileName || ''
                };
            } catch (err) {
                const msg = err && err.message ? err.message : String(err);
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: this.hasLiveSyncConnection(),
                        message: 'Failed to reach cloud sync.',
                        lastError: msg
                    });
                }
                return { ok: false, reason: 'error', error: msg };
            }
        }

        async connectSync(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const explicit = opts.explicit === true;
            const coerced = coerceAutoConnectBackendMode(this.sync.config);
            if (coerced.changed) {
                this.sync.config = coerced.config;
                try {
                    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(coerced.config));
                } catch (err) {
                    console.warn('RTF_STORE: Failed to persist coerced sync backend mode', err);
                }
            }

            const config = this.sync.config;
            if (!config.enabled) {
                this.updateSyncStatus({
                    mode: 'disabled',
                    connected: false,
                    enabled: false,
                    message: 'Cloud sync is disabled.',
                    pendingPush: false
                });
                return { ok: false, reason: 'disabled' };
            }

            if (!config.supabaseUrl || !config.anonKey || !config.campaignId) {
                this.updateSyncStatus({
                    mode: 'error',
                    connected: false,
                    enabled: true,
                    message: 'Missing sync config: URL, anon key, or campaign ID.',
                    lastError: 'Missing required sync config.'
                });
                return { ok: false, reason: 'missing-config' };
            }

            if (!explicit && !shouldAutoConnectOnThisPage()) {
                this.updateSyncStatus({
                    mode: 'idle',
                    connected: false,
                    enabled: true,
                    campaignId: config.campaignId,
                    profileName: config.profileName,
                    message: this.sync.userId
                        ? 'Signed in. Full cloud sync will connect only when you ask for it.'
                        : 'Full cloud sync is standing by until you ask for it.',
                    pendingPush: false,
                    lastError: ''
                });
                return { ok: false, reason: 'page-blocked' };
            }

            this.updateSyncStatus({
                mode: 'connecting',
                enabled: true,
                connected: false,
                campaignId: config.campaignId,
                profileName: config.profileName,
                message: 'Connecting to Supabase...',
                lastError: ''
            });

            try {
                await this.ensureSupabaseClient(config);

                const authResult = await this.ensureSyncUser();
                if (!authResult.ok) {
                    this.updateSyncStatus({
                        mode: 'auth_required',
                        connected: false,
                        userId: '',
                        message: authResult.message || 'Authentication required for sync.',
                        lastError: authResult.message || 'Authentication required.'
                    });
                    return { ok: false, reason: 'auth-required' };
                }

                this.sync.userId = authResult.userId || '';
                await this.subscribeRealtime();
                this.clearPendingConflict({ keepStatus: true });
                this.startReconcileLoop();

                this.updateSyncStatus({
                    mode: 'ready',
                    connected: true,
                    userId: this.sync.userId,
                    revisionMode: 'optimistic',
                    message: 'Connected to cloud sync.'
                });

                const shouldForceInitialPull = !this.sync.hadStoredStateAtBoot && !this.sync.lastPullAt;
                const pull = await this.pullFromCloud({ force: shouldForceInitialPull, silent: true, skipAccessCheck: true });
                if (!pull.ok && pull.reason !== 'conflict') {
                    throw new Error(pull.error || 'Initial cloud pull failed.');
                }
                if (!pull.ok && pull.reason === 'conflict') {
                    this.updateSyncStatus({
                        mode: 'conflict',
                        message: 'Connected. Protected shared-scope conflict detected with local edits.'
                    });
                }
                if (pull.ok && pull.applied) {
                    this.updateSyncStatus({ message: 'Connected. Pulled latest cloud state.' });
                }
                if (pull.ok && pull.reason === 'empty') {
                    this.scheduleCloudPush('seed-cloud');
                    this.updateSyncStatus({ message: 'Connected. No cloud row yet; pending first push.' });
                }

                return { ok: true };
            } catch (err) {
                const msg = err && err.message ? err.message : String(err);
                this.updateSyncStatus({
                    mode: 'error',
                    connected: false,
                    message: 'Failed to connect sync.',
                    lastError: msg
                });
                return { ok: false, reason: 'error', error: msg };
            }
        }

        async ensureBoardCollabClient() {
            const config = sanitizeSyncConfig(this.sync && this.sync.config ? this.sync.config : getMergedSyncConfig());
            if (!config.enabled) return { ok: false, reason: 'disabled', config };
            if (!config.supabaseUrl || !config.anonKey || !config.campaignId) {
                return { ok: false, reason: 'missing-config', config };
            }

            try {
                await this.ensureSupabaseClient(config);
            } catch (err) {
                return {
                    ok: false,
                    reason: 'client-unavailable',
                    error: err && err.message ? err.message : 'Supabase client unavailable.',
                    config
                };
            }

            const authResult = await this.ensureSyncUser();
            if (!authResult.ok) {
                return {
                    ok: false,
                    reason: 'auth-required',
                    error: authResult.message || 'Authentication required for board collaboration.',
                    config
                };
            }

            this.sync.userId = authResult.userId || '';

            return {
                ok: true,
                client: this.sync.client,
                config: sanitizeSyncConfig(this.sync.config),
                instanceId: this.sync.instanceId,
                userId: this.sync.userId || '',
                profileName: this.sync.config && this.sync.config.profileName ? this.sync.config.profileName : '',
                syncConnected: this.hasLiveSyncConnection()
            };
        }

        async ensureSupabaseClient(config) {
            const cleanConfig = sanitizeSyncConfig(config);
            const clientKey = `${cleanConfig.supabaseUrl}|${cleanConfig.anonKey}`;
            const previousClientKey = this.sync.clientKey;

            if (this.sync.client && this.sync.clientKey === clientKey) {
                return {
                    client: this.sync.client,
                    clientKey
                };
            }

            if (this.sync.channel && this.sync.clientKey && this.sync.clientKey !== clientKey) {
                await this.disconnectSync('reconfigure');
            }

            const supabaseLib = await this.loadSupabaseLibrary();
            this.sync.client = getSharedSupabaseClient(supabaseLib, cleanConfig.supabaseUrl, cleanConfig.anonKey);
            this.sync.clientKey = clientKey;
            if (!this.sync.userId || (previousClientKey && previousClientKey !== clientKey)) this.sync.userId = '';

            return {
                client: this.sync.client,
                clientKey
            };
        }

        async ensureRealtimeCollabClient() {
            return this.ensureBoardCollabClient();
        }

        buildSyncQueryCacheKey(prefix, suffix = '') {
            const campaignId = this.sync && this.sync.config && this.sync.config.campaignId
                ? this.sync.config.campaignId
                : '';
            return `${prefix}:${campaignId}:${suffix || ''}`;
        }

        readSyncQueryCache(key, ttlMs, loader, options = {}) {
            if (!key || typeof loader !== 'function') return Promise.resolve(null);
            if (!(this.sync.queryCache instanceof Map)) this.sync.queryCache = new Map();
            const opts = options && typeof options === 'object' ? options : {};
            const force = !!opts.force;
            const ttl = Math.max(0, toNonNegativeInt(ttlMs, 0));
            const cached = this.sync.queryCache.get(key);
            const now = Date.now();
            if (!force && cached) {
                if (cached.promise) return cached.promise;
                if (Object.prototype.hasOwnProperty.call(cached, 'value')
                    && (!ttl || (now - toTimestamp(cached.fetchedAt, 0)) < ttl)) {
                    return Promise.resolve(deepClone(cached.value));
                }
            }

            const promise = Promise.resolve()
                .then(() => loader())
                .then((value) => {
                    if (value && typeof value === 'object' && value.ok === false) {
                        this.sync.queryCache.delete(key);
                        return value;
                    }
                    this.sync.queryCache.set(key, {
                        value: deepClone(value),
                        fetchedAt: Date.now()
                    });
                    return deepClone(value);
                })
                .catch((err) => {
                    const active = this.sync.queryCache.get(key);
                    if (active && active.promise === promise) this.sync.queryCache.delete(key);
                    throw err;
                });

            this.sync.queryCache.set(key, { promise });
            return promise;
        }

        setSyncQueryCacheValue(key, value) {
            if (!key) return;
            if (!(this.sync.queryCache instanceof Map)) this.sync.queryCache = new Map();
            this.sync.queryCache.set(key, {
                value: deepClone(value),
                fetchedAt: Date.now()
            });
        }

        invalidateSyncQueryCache(keyOrPrefix, options = {}) {
            if (!(this.sync.queryCache instanceof Map) || !keyOrPrefix) return;
            const opts = options && typeof options === 'object' ? options : {};
            const usePrefix = !!opts.prefix;
            Array.from(this.sync.queryCache.keys()).forEach((key) => {
                if ((usePrefix && key.startsWith(keyOrPrefix)) || (!usePrefix && key === keyOrPrefix)) {
                    this.sync.queryCache.delete(key);
                }
            });
        }

        getBoardRoomSnapshotCacheKey(options = {}) {
            const target = this.resolveBoardRoomTarget(options);
            return this.buildSyncQueryCacheKey('board-room', target.roomId);
        }

        getBoardRoomHistoryCachePrefix(options = {}) {
            const target = this.resolveBoardRoomTarget(options);
            return this.buildSyncQueryCacheKey('board-history', `${target.roomId}:`);
        }

        getBoardRoomHistoryCacheKey(options = {}) {
            const target = this.resolveBoardRoomTarget(options);
            const limit = Math.max(1, Math.min(100, toNonNegativeInt(options && options.limit, 25) || 25));
            return this.buildSyncQueryCacheKey('board-history', `${target.roomId}:${limit}`);
        }

        getVTTRoomSnapshotCacheKey(options = {}) {
            const target = this.resolveVTTRoomTarget(options);
            return this.buildSyncQueryCacheKey('vtt-room', target.roomId);
        }

        resolveBoardRoomTarget(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const caseId = scope === 'campaign' ? '' : sanitizeCaseId(opts.caseId, this.getActiveCaseId());
            const roomId = toTrimmedString(opts.roomId, '', 160).trim() || buildBoardRoomId(scope, caseId);
            const label = scope === 'campaign'
                ? buildBoardRoomLabel('campaign')
                : buildBoardRoomLabel(scope, caseId, (this.getCaseEntry(caseId, { createIfMissing: true }) || {}).name || '');
            return {
                scope,
                caseId,
                roomId,
                label
            };
        }

        getBoardRoomStateSnapshot(options = {}) {
            const target = this.resolveBoardRoomTarget(options);
            return target.scope === 'campaign'
                ? sanitizeBoard(this.getCampaignMetaBoard())
                : sanitizeBoard(this.getBoard(target.caseId));
        }

        resolveVTTRoomTarget(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const caseId = sanitizeCaseId(opts.caseId, this.getActiveCaseId());
            const roomId = toTrimmedString(opts.roomId, '', 160).trim() || buildVTTRoomId(caseId);
            return {
                scope: 'case',
                caseId,
                roomId,
                label: `Case VTT: ${(this.getCaseEntry(caseId, { createIfMissing: true }) || {}).name || caseId}`
            };
        }

        getVTTRoomStateSnapshot(options = {}) {
            const target = this.resolveVTTRoomTarget(options);
            return sanitizeVTTState(this.getVTTState(target.caseId));
        }

        async loadVTTRoomSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveVTTRoomTarget(opts);
            const cacheKey = this.getVTTRoomSnapshotCacheKey(target);
            return this.readSyncQueryCache(cacheKey, 5000, async () => {
                const ensured = await this.ensureRealtimeCollabClient();
                if (!ensured.ok) return ensured;

                const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
                const selectCols = 'room_id,board_scope,case_id,payload,revision,updated_at,updated_by,updated_by_name';

                const result = await ensured.client
                    .from(tableName)
                    .select(selectCols)
                    .eq('campaign_id', ensured.config.campaignId)
                    .eq('room_id', target.roomId)
                    .maybeSingle();

                if (result.error) {
                    return {
                        ok: false,
                        reason: 'read-failed',
                        error: result.error.message || `Failed reading ${tableName}.`
                    };
                }

                if (!result.data) {
                    return {
                        ok: true,
                        snapshot: null,
                        roomId: target.roomId,
                        scope: target.scope,
                        caseId: target.caseId
                    };
                }

                const decodedPayload = await decodeVTTRoomCheckpointPayload(
                    result.data.payload,
                    result.data.case_id ? sanitizeCaseId(result.data.case_id, target.caseId || 'case_primary') : target.caseId
                );

                return {
                    ok: true,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    snapshot: {
                        roomId: String(result.data.room_id || target.roomId),
                        scope: 'case',
                        caseId: result.data.case_id ? sanitizeCaseId(result.data.case_id, target.caseId || 'case_primary') : target.caseId,
                        payload: sanitizeVTTState({
                            ...decodedPayload,
                            updatedAt: Date.parse(result.data.updated_at || '') || toNonNegativeInt(result.data.revision, 0)
                        }),
                        revision: toNonNegativeInt(result.data.revision, 0),
                        updatedAt: toIsoString(result.data.updated_at, ''),
                        updatedBy: toTrimmedString(result.data.updated_by, '', 120),
                        updatedByName: toTrimmedString(result.data.updated_by_name, '', 120)
                    }
                };
            }, { force: !!opts.force });
        }

        async saveVTTRoomSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveVTTRoomTarget(opts);
            const ensured = await this.ensureRealtimeCollabClient();
            if (!ensured.ok) return ensured;

            const revision = Math.max(1, toNonNegativeInt(opts.revision, Date.now()) || Date.now());
            const updatedAt = toIsoString(opts.updatedAt, '') || new Date().toISOString();
            const snapshotPayload = sanitizeVTTState({
                ...(opts.payload && typeof opts.payload === 'object' ? opts.payload : {}),
                updatedAt: Date.parse(updatedAt) || revision
            });
            const checkpointPayload = isEncodedRoomCheckpointPayload(opts.checkpointPayload, VTT_CHECKPOINT_FORMAT)
                ? opts.checkpointPayload
                : (await encodeVTTRoomCheckpointPayload(snapshotPayload));
            const payload = checkpointPayload || snapshotPayload;
            const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
            const selectCols = 'room_id,board_scope,case_id,payload,revision,updated_at,updated_by,updated_by_name';
            const createOnly = !!opts.createOnly;
            const hasPreviousRevision = Object.prototype.hasOwnProperty.call(opts, 'previousRevision');
            const previousRevision = Math.max(0, toNonNegativeInt(opts.previousRevision, 0));
            const readCurrentRow = () => ensured.client
                .from(tableName)
                .select(selectCols)
                .eq('campaign_id', ensured.config.campaignId)
                .eq('room_id', target.roomId)
                .maybeSingle();
            const buildSnapshotFromRow = async (data) => ({
                roomId: String(data && data.room_id || target.roomId),
                scope: 'case',
                caseId: data && data.case_id ? sanitizeCaseId(data.case_id, target.caseId || 'case_primary') : target.caseId,
                payload: sanitizeVTTState({
                    ...(await decodeVTTRoomCheckpointPayload(data && data.payload, data && data.case_id ? sanitizeCaseId(data.case_id, target.caseId || 'case_primary') : target.caseId)),
                    updatedAt: Date.parse(data && data.updated_at || '') || toNonNegativeInt(data && data.revision, 0)
                }),
                revision: toNonNegativeInt(data && data.revision, 0),
                updatedAt: toIsoString(data && data.updated_at, ''),
                updatedBy: toTrimmedString(data && data.updated_by, '', 120),
                updatedByName: toTrimmedString(data && data.updated_by_name, '', 120)
            });
            const buildStaleResult = async (data, fallbackError = 'A newer live VTT snapshot already exists.') => {
                const snapshot = await buildSnapshotFromRow(data);
                return {
                    ok: false,
                    reason: 'stale',
                    error: fallbackError,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    revision: snapshot.revision,
                    updatedAt: snapshot.updatedAt,
                    updatedBy: snapshot.updatedBy,
                    updatedByName: snapshot.updatedByName,
                    snapshot
                };
            };

            const row = {
                campaign_id: ensured.config.campaignId,
                room_id: target.roomId,
                board_scope: target.scope,
                case_id: target.caseId,
                payload,
                revision,
                updated_at: updatedAt,
                updated_by: toTrimmedString(opts.updatedBy, ensured.instanceId, 120),
                updated_by_user: Object.prototype.hasOwnProperty.call(opts, 'updatedByUser')
                    ? (opts.updatedByUser || null)
                    : (ensured.userId || null),
                updated_by_name: Object.prototype.hasOwnProperty.call(opts, 'updatedByName')
                    ? (opts.updatedByName || null)
                    : (ensured.profileName || null)
            };

            if (!createOnly) {
                if (hasPreviousRevision) {
                    let optimisticResult = null;
                    if (previousRevision > 0) {
                        optimisticResult = await ensured.client
                            .from(tableName)
                            .update(row)
                            .eq('campaign_id', ensured.config.campaignId)
                            .eq('room_id', target.roomId)
                            .eq('revision', previousRevision)
                            .select('revision,updated_at')
                            .maybeSingle();
                        if (!optimisticResult.error && optimisticResult.data) {
                            const response = {
                                ok: true,
                                roomId: target.roomId,
                                scope: target.scope,
                                caseId: target.caseId,
                                revision: toNonNegativeInt(optimisticResult.data && optimisticResult.data.revision, revision),
                                updatedAt: toIsoString(optimisticResult.data && optimisticResult.data.updated_at, updatedAt) || updatedAt
                            };
                            this.setSyncQueryCacheValue(this.getVTTRoomSnapshotCacheKey(target), {
                                ok: true,
                                roomId: target.roomId,
                                scope: target.scope,
                                caseId: target.caseId,
                                snapshot: {
                                    roomId: target.roomId,
                                    scope: 'case',
                                    caseId: target.caseId,
                                    payload: snapshotPayload,
                                    revision: response.revision,
                                    updatedAt: response.updatedAt,
                                    updatedBy: row.updated_by || '',
                                    updatedByName: row.updated_by_name || ''
                                }
                            });
                            return response;
                        }
                        if (optimisticResult.error && optimisticResult.error.code !== 'PGRST116') {
                            return {
                                ok: false,
                                reason: 'write-failed',
                                error: optimisticResult.error.message || `Failed writing ${tableName}.`
                            };
                        }
                    } else {
                        optimisticResult = await ensured.client
                            .from(tableName)
                            .insert(row)
                            .select('revision,updated_at')
                            .single();
                        if (!optimisticResult.error) {
                            const response = {
                                ok: true,
                                roomId: target.roomId,
                                scope: target.scope,
                                caseId: target.caseId,
                                revision: toNonNegativeInt(optimisticResult.data && optimisticResult.data.revision, revision),
                                updatedAt: toIsoString(optimisticResult.data && optimisticResult.data.updated_at, updatedAt) || updatedAt
                            };
                            this.setSyncQueryCacheValue(this.getVTTRoomSnapshotCacheKey(target), {
                                ok: true,
                                roomId: target.roomId,
                                scope: target.scope,
                                caseId: target.caseId,
                                snapshot: {
                                    roomId: target.roomId,
                                    scope: 'case',
                                    caseId: target.caseId,
                                    payload: snapshotPayload,
                                    revision: response.revision,
                                    updatedAt: response.updatedAt,
                                    updatedBy: row.updated_by || '',
                                    updatedByName: row.updated_by_name || ''
                                }
                            });
                            return response;
                        }
                        if (optimisticResult.error.code !== '23505') {
                            return {
                                ok: false,
                                reason: 'write-failed',
                                error: optimisticResult.error.message || `Failed writing ${tableName}.`
                            };
                        }
                    }

                    const latest = await readCurrentRow();
                    if (latest.error) {
                        return {
                            ok: false,
                            reason: 'read-failed',
                            error: latest.error.message || `Failed reading ${tableName}.`
                        };
                    }
                    if (latest.data) return buildStaleResult(latest.data);
                    return {
                        ok: false,
                        reason: 'write-conflict',
                        error: 'Live VTT snapshot write conflicted with another update.'
                    };
                }

                const existing = await readCurrentRow();

                if (existing.error) {
                    return {
                        ok: false,
                        reason: 'read-failed',
                        error: existing.error.message || `Failed reading ${tableName}.`
                    };
                }

                if (existing.data && compareRoomSnapshotVersion(existing.data.revision, existing.data.updated_by, revision, row.updated_by) > 0) {
                    return buildStaleResult(existing.data);
                }
                const writeQuery = existing.data
                    ? ensured.client
                        .from(tableName)
                        .update(row)
                        .eq('campaign_id', ensured.config.campaignId)
                        .eq('room_id', target.roomId)
                        .eq('revision', toNonNegativeInt(existing.data.revision, 0))
                        .select('revision,updated_at')
                        .maybeSingle()
                    : ensured.client
                        .from(tableName)
                        .insert(row)
                        .select('revision,updated_at')
                        .single();
                const result = await writeQuery;

                if (result.error) {
                    if (!existing.data && result.error.code === '23505') {
                        const latest = await readCurrentRow();
                        if (latest.error) {
                            return {
                                ok: false,
                                reason: 'read-failed',
                                error: latest.error.message || `Failed reading ${tableName}.`
                            };
                        }
                        if (latest.data) return buildStaleResult(latest.data);
                    }
                    return {
                        ok: false,
                        reason: 'write-failed',
                        error: result.error.message || `Failed writing ${tableName}.`
                    };
                }

                if (existing.data && !result.data) {
                    const latest = await readCurrentRow();
                    if (latest.error) {
                        return {
                            ok: false,
                            reason: 'read-failed',
                            error: latest.error.message || `Failed reading ${tableName}.`
                        };
                    }
                    if (latest.data) return buildStaleResult(latest.data);
                    return {
                        ok: false,
                        reason: 'write-conflict',
                        error: 'Live VTT snapshot write conflicted with another update.'
                    };
                }

                const response = {
                    ok: true,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    revision: toNonNegativeInt(result.data && result.data.revision, revision),
                    updatedAt: toIsoString(result.data && result.data.updated_at, updatedAt) || updatedAt
                };
                this.setSyncQueryCacheValue(this.getVTTRoomSnapshotCacheKey(target), {
                    ok: true,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    snapshot: {
                        roomId: target.roomId,
                        scope: 'case',
                        caseId: target.caseId,
                        payload: snapshotPayload,
                        revision: response.revision,
                        updatedAt: response.updatedAt,
                        updatedBy: row.updated_by || '',
                        updatedByName: row.updated_by_name || ''
                    }
                });
                return response;
            }

            const result = await ensured.client
                .from(tableName)
                .insert(row)
                .select('revision,updated_at')
                .single();

            if (result.error) {
                if (createOnly && result.error.code === '23505') {
                    return {
                        ok: false,
                        reason: 'exists',
                        error: result.error.message || `${tableName} row already exists.`
                    };
                }
                return {
                    ok: false,
                    reason: 'write-failed',
                    error: result.error.message || `Failed writing ${tableName}.`
                };
            }

            const response = {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                revision: toNonNegativeInt(result.data && result.data.revision, revision),
                updatedAt: toIsoString(result.data && result.data.updated_at, updatedAt) || updatedAt
            };
            this.setSyncQueryCacheValue(this.getVTTRoomSnapshotCacheKey(target), {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                snapshot: {
                    roomId: target.roomId,
                    scope: 'case',
                    caseId: target.caseId,
                    payload: snapshotPayload,
                    revision: response.revision,
                    updatedAt: response.updatedAt,
                    updatedBy: row.updated_by || '',
                    updatedByName: row.updated_by_name || ''
                }
            });
            return response;
        }

        async sendBoardRoomAdminEvent(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const eventName = toTrimmedString(opts.event, '', 80).trim();
            if (!eventName) return { ok: false, reason: 'missing-event' };

            const target = this.resolveBoardRoomTarget(opts);
            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const channelName = buildBoardRoomChannelName(ensured.config.campaignId, target.roomId);
            const channel = ensured.client.channel(channelName, {
                config: {
                    broadcast: { self: true }
                }
            });

            try {
                await new Promise((resolve, reject) => {
                    let settled = false;
                    const timeout = setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            reject(new Error('Board admin broadcast timed out.'));
                        }
                    }, 10000);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            if (!settled) {
                                settled = true;
                                resolve();
                            }
                            return;
                        }
                        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                            clearTimeout(timeout);
                            if (!settled) {
                                settled = true;
                                reject(new Error(`Board admin channel status: ${status}`));
                            }
                        }
                    });
                });

                const payload = {
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    sentAt: new Date().toISOString(),
                    sentBy: this.sync.instanceId,
                    sentByUser: this.sync.userId || null,
                    sentByName: this.sync.config && this.sync.config.profileName ? this.sync.config.profileName : '',
                    ...(opts.payload && typeof opts.payload === 'object' ? opts.payload : {})
                };

                await channel.send({
                    type: 'broadcast',
                    event: eventName,
                    payload
                });

                return {
                    ok: true,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId
                };
            } catch (err) {
                return {
                    ok: false,
                    reason: 'broadcast-failed',
                    error: err && err.message ? err.message : 'Board admin broadcast failed.'
                };
            } finally {
                try {
                    await ensured.client.removeChannel(channel);
                } catch (err) { }
            }
        }

        async appendBoardRoomHistorySnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const tableName = ensured.config.boardHistoryTable || DEFAULT_SYNC_CONFIG.boardHistoryTable;
            const checkpointPayload = isEncodedRoomCheckpointPayload(opts.checkpointPayload, BOARD_CHECKPOINT_FORMAT)
                ? opts.checkpointPayload
                : (await encodeBoardRoomCheckpointPayload(sanitizeBoard(opts.payload), target.scope, target.caseId || ''));
            const snapshotPayload = sanitizeBoard(opts.payload);
            const payload = checkpointPayload || snapshotPayload;
            const revision = Math.max(1, toNonNegativeInt(opts.revision, Date.now()) || Date.now());
            const capturedAt = toIsoString(opts.capturedAt, '') || new Date().toISOString();
            const row = {
                campaign_id: ensured.config.campaignId,
                room_id: target.roomId,
                board_scope: target.scope,
                case_id: target.scope === 'campaign' ? null : target.caseId,
                payload,
                revision,
                reason: sanitizeBoardHistoryReason(opts.reason, 'snapshot'),
                captured_at: capturedAt,
                captured_by: toTrimmedString(opts.capturedBy, ensured.instanceId, 120),
                captured_by_user: Object.prototype.hasOwnProperty.call(opts, 'capturedByUser')
                    ? (opts.capturedByUser || null)
                    : (ensured.userId || null),
                captured_by_name: Object.prototype.hasOwnProperty.call(opts, 'capturedByName')
                    ? (opts.capturedByName || null)
                    : (ensured.profileName || null)
            };

            const result = await ensured.client
                .from(tableName)
                .insert(row)
                .select('id,captured_at')
                .single();

            if (result.error) {
                return {
                    ok: false,
                    reason: 'history-write-failed',
                    error: result.error.message || `Failed writing ${tableName}.`
                };
            }

            const response = {
                ok: true,
                id: toNonNegativeInt(result.data && result.data.id, 0),
                capturedAt: toIsoString(result.data && result.data.captured_at, capturedAt) || capturedAt,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId
            };
            this.invalidateSyncQueryCache(this.getBoardRoomHistoryCachePrefix(target), { prefix: true });
            return response;
        }

        async listBoardRoomHistory(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const cacheKey = this.getBoardRoomHistoryCacheKey({ ...target, limit: opts.limit });
            return this.readSyncQueryCache(cacheKey, 5000, async () => {
                const ensured = await this.ensureBoardCollabClient();
                if (!ensured.ok) return ensured;

                const limit = Math.max(1, Math.min(100, toNonNegativeInt(opts.limit, 25) || 25));
                const tableName = ensured.config.boardHistoryTable || DEFAULT_SYNC_CONFIG.boardHistoryTable;
                const selectCols = 'id,room_id,board_scope,case_id,payload,revision,reason,captured_at,captured_by,captured_by_name';
                const result = await ensured.client
                    .from(tableName)
                    .select(selectCols)
                    .eq('campaign_id', ensured.config.campaignId)
                    .eq('room_id', target.roomId)
                    .order('captured_at', { ascending: false })
                    .limit(limit);

                if (result.error) {
                    return {
                        ok: false,
                        reason: 'history-read-failed',
                        error: result.error.message || `Failed reading ${tableName}.`
                    };
                }

                const history = Array.isArray(result.data) ? await Promise.all(result.data.map(async (row) => {
                    const payload = await decodeBoardRoomCheckpointPayload(
                        row && row.payload ? row.payload : null,
                        String(row && row.board_scope || target.scope).trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                        row && row.case_id ? sanitizeCaseId(row.case_id, target.caseId || 'case_primary') : ''
                    );
                    return {
                        id: toNonNegativeInt(row && row.id, 0),
                        roomId: toTrimmedString(row && row.room_id, target.roomId, 160).trim() || target.roomId,
                        scope: String(row && row.board_scope || target.scope).trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                        caseId: row && row.case_id ? sanitizeCaseId(row.case_id, target.caseId || 'case_primary') : '',
                        payload,
                        revision: toNonNegativeInt(row && row.revision, 0),
                        reason: sanitizeBoardHistoryReason(row && row.reason, 'snapshot'),
                        capturedAt: toIsoString(row && row.captured_at, ''),
                        capturedBy: toTrimmedString(row && row.captured_by, '', 120),
                        capturedByName: toTrimmedString(row && row.captured_by_name, '', 120),
                        nodeCount: Array.isArray(payload.nodes) ? payload.nodes.length : 0,
                        connectionCount: Array.isArray(payload.connections) ? payload.connections.length : 0
                    };
                })) : [];

                return {
                    ok: true,
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    history
                };
            }, { force: !!opts.force });
        }

        async loadBoardRoomSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const roomId = toTrimmedString(opts.roomId, '', 160).trim();
            if (!roomId) return { ok: false, reason: 'missing-room-id' };
            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const caseId = scope === 'campaign' ? '' : sanitizeCaseId(opts.caseId, this.getActiveCaseId());
            const target = { roomId, scope, caseId };
            const cacheKey = this.getBoardRoomSnapshotCacheKey(target);
            return this.readSyncQueryCache(cacheKey, 5000, async () => {
                const ensured = await this.ensureBoardCollabClient();
                if (!ensured.ok) return ensured;

                const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
                const selectCols = 'room_id,board_scope,case_id,payload,revision,updated_at,updated_by,updated_by_name';

                const result = await ensured.client
                    .from(tableName)
                    .select(selectCols)
                    .eq('campaign_id', ensured.config.campaignId)
                    .eq('room_id', roomId)
                    .maybeSingle();

                if (result.error) {
                    return {
                        ok: false,
                        reason: 'read-failed',
                        error: result.error.message || `Failed reading ${tableName}.`
                    };
                }

                if (!result.data) {
                    return {
                        ok: true,
                        snapshot: null,
                        roomId,
                        scope,
                        caseId
                    };
                }

                const decodedPayload = await decodeBoardRoomCheckpointPayload(
                    result.data.payload,
                    String(result.data.board_scope || scope || 'case').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                    result.data.case_id ? sanitizeCaseId(result.data.case_id, caseId || 'case_primary') : ''
                );

                return {
                    ok: true,
                    roomId,
                    scope,
                    caseId,
                    snapshot: {
                        roomId: String(result.data.room_id || roomId),
                        scope: String(result.data.board_scope || scope || 'case').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                        caseId: result.data.case_id ? sanitizeCaseId(result.data.case_id, caseId || 'case_primary') : '',
                        payload: sanitizeBoard({
                            ...decodedPayload,
                            updatedAt: Date.parse(result.data.updated_at || '') || toNonNegativeInt(result.data.revision, 0)
                        }),
                        revision: toNonNegativeInt(result.data.revision, 0),
                        updatedAt: toIsoString(result.data.updated_at, ''),
                        updatedBy: toTrimmedString(result.data.updated_by, '', 120),
                        updatedByName: toTrimmedString(result.data.updated_by_name, '', 120)
                    }
                };
            }, { force: !!opts.force });
        }

	        async saveBoardRoomSnapshot(options = {}) {
	            const opts = options && typeof options === 'object' ? options : {};
	            const roomId = toTrimmedString(opts.roomId, '', 160).trim();
	            if (!roomId) return { ok: false, reason: 'missing-room-id' };

            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const caseId = scope === 'campaign' ? null : sanitizeCaseId(opts.caseId, this.getActiveCaseId());
            const checkpointPayload = isEncodedRoomCheckpointPayload(opts.checkpointPayload, BOARD_CHECKPOINT_FORMAT)
                ? opts.checkpointPayload
                : (await encodeBoardRoomCheckpointPayload(sanitizeBoard(opts.payload), scope, caseId || ''));
            const snapshotPayload = sanitizeBoard(opts.payload);
            const payload = checkpointPayload || snapshotPayload;
            const revision = Math.max(1, toNonNegativeInt(opts.revision, Date.now()) || Date.now());
            const updatedAt = toIsoString(opts.updatedAt, '') || new Date().toISOString();
	            const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
	            const selectCols = 'room_id,board_scope,case_id,payload,revision,updated_at,updated_by,updated_by_name';
	            const createOnly = !!opts.createOnly;
                const hasPreviousRevision = Object.prototype.hasOwnProperty.call(opts, 'previousRevision');
                const previousRevision = Math.max(0, toNonNegativeInt(opts.previousRevision, 0));
	            const readCurrentRow = () => ensured.client
	                .from(tableName)
	                .select(selectCols)
	                .eq('campaign_id', ensured.config.campaignId)
	                .eq('room_id', roomId)
	                .maybeSingle();
	            const buildSnapshotFromRow = async (data) => ({
	                roomId: String(data && data.room_id || roomId),
	                scope: String(data && data.board_scope || scope || 'case').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
	                caseId: data && data.case_id ? sanitizeCaseId(data.case_id, caseId || 'case_primary') : (caseId || ''),
	                payload: sanitizeBoard({
                        ...(await decodeBoardRoomCheckpointPayload(
                            data && data.payload,
                            String(data && data.board_scope || scope || 'case').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                            data && data.case_id ? sanitizeCaseId(data.case_id, caseId || 'case_primary') : ''
                        )),
                        updatedAt: Date.parse(data && data.updated_at || '') || toNonNegativeInt(data && data.revision, 0)
                    }),
	                revision: toNonNegativeInt(data && data.revision, 0),
	                updatedAt: toIsoString(data && data.updated_at, ''),
	                updatedBy: toTrimmedString(data && data.updated_by, '', 120),
	                updatedByName: toTrimmedString(data && data.updated_by_name, '', 120)
	            });
	            const buildStaleResult = async (data, fallbackError = 'A newer live room snapshot already exists.') => {
	                const snapshot = await buildSnapshotFromRow(data);
	                return {
	                    ok: false,
	                    reason: 'stale',
	                    error: fallbackError,
	                    roomId,
	                    scope,
	                    caseId: caseId || '',
	                    revision: snapshot.revision,
	                    updatedAt: snapshot.updatedAt,
	                    updatedBy: snapshot.updatedBy,
	                    updatedByName: snapshot.updatedByName,
	                    snapshot
	                };
	            };

	            const row = {
	                campaign_id: ensured.config.campaignId,
	                room_id: roomId,
                board_scope: scope,
                case_id: caseId,
                payload,
                revision,
                updated_at: updatedAt,
                updated_by: toTrimmedString(opts.updatedBy, ensured.instanceId, 120),
                updated_by_user: Object.prototype.hasOwnProperty.call(opts, 'updatedByUser')
                    ? (opts.updatedByUser || null)
                    : (ensured.userId || null),
                updated_by_name: Object.prototype.hasOwnProperty.call(opts, 'updatedByName')
                    ? (opts.updatedByName || null)
                    : (ensured.profileName || null)
	            };

	            if (!createOnly) {
                    if (hasPreviousRevision) {
                        let optimisticResult = null;
                        if (previousRevision > 0) {
                            optimisticResult = await ensured.client
                                .from(tableName)
                                .update(row)
                                .eq('campaign_id', ensured.config.campaignId)
                                .eq('room_id', roomId)
                                .eq('revision', previousRevision)
                                .select('revision,updated_at')
                                .maybeSingle();
                            if (!optimisticResult.error && optimisticResult.data) {
                                const response = {
                                    ok: true,
                                    roomId,
                                    scope,
                                    caseId: caseId || '',
                                    revision: toNonNegativeInt(optimisticResult.data && optimisticResult.data.revision, revision),
                                    updatedAt: toIsoString(optimisticResult.data && optimisticResult.data.updated_at, updatedAt) || updatedAt
                                };
                                this.setSyncQueryCacheValue(this.getBoardRoomSnapshotCacheKey({ roomId, scope, caseId }), {
                                    ok: true,
                                    roomId,
                                    scope,
                                    caseId: caseId || '',
                                    snapshot: {
                                        roomId,
                                        scope,
                                        caseId: caseId || '',
                                        payload: snapshotPayload,
                                        revision: response.revision,
                                        updatedAt: response.updatedAt,
                                        updatedBy: row.updated_by || '',
                                        updatedByName: row.updated_by_name || ''
                                    }
                                });
                                return response;
                            }
                            if (optimisticResult.error && optimisticResult.error.code !== 'PGRST116') {
                                return {
                                    ok: false,
                                    reason: 'write-failed',
                                    error: optimisticResult.error.message || `Failed writing ${tableName}.`
                                };
                            }
                        } else {
                            optimisticResult = await ensured.client
                                .from(tableName)
                                .insert(row)
                                .select('revision,updated_at')
                                .single();
                            if (!optimisticResult.error) {
                                const response = {
                                    ok: true,
                                    roomId,
                                    scope,
                                    caseId: caseId || '',
                                    revision: toNonNegativeInt(optimisticResult.data && optimisticResult.data.revision, revision),
                                    updatedAt: toIsoString(optimisticResult.data && optimisticResult.data.updated_at, updatedAt) || updatedAt
                                };
                                this.setSyncQueryCacheValue(this.getBoardRoomSnapshotCacheKey({ roomId, scope, caseId }), {
                                    ok: true,
                                    roomId,
                                    scope,
                                    caseId: caseId || '',
                                    snapshot: {
                                        roomId,
                                        scope,
                                        caseId: caseId || '',
                                        payload: snapshotPayload,
                                        revision: response.revision,
                                        updatedAt: response.updatedAt,
                                        updatedBy: row.updated_by || '',
                                        updatedByName: row.updated_by_name || ''
                                    }
                                });
                                return response;
                            }
                            if (optimisticResult.error.code !== '23505') {
                                return {
                                    ok: false,
                                    reason: 'write-failed',
                                    error: optimisticResult.error.message || `Failed writing ${tableName}.`
                                };
                            }
                        }

                        const latest = await readCurrentRow();
                        if (latest.error) {
                            return {
                                ok: false,
                                reason: 'read-failed',
                                error: latest.error.message || `Failed reading ${tableName}.`
                            };
                        }
                        if (latest.data) return buildStaleResult(latest.data);
                        return {
                            ok: false,
                            reason: 'write-conflict',
                            error: 'Live room snapshot write conflicted with another update.'
                        };
                    }

	                const existing = await readCurrentRow();

	                if (existing.error) {
	                    return {
	                        ok: false,
                        reason: 'read-failed',
                        error: existing.error.message || `Failed reading ${tableName}.`
	                    };
	                }

	                if (existing.data && compareRoomSnapshotVersion(existing.data.revision, existing.data.updated_by, revision, row.updated_by) > 0) {
	                    return buildStaleResult(existing.data);
	                }
	                const writeQuery = existing.data
	                    ? ensured.client
	                        .from(tableName)
	                        .update(row)
	                        .eq('campaign_id', ensured.config.campaignId)
	                        .eq('room_id', roomId)
	                        .eq('revision', toNonNegativeInt(existing.data.revision, 0))
	                        .select('revision,updated_at')
	                        .maybeSingle()
	                    : ensured.client
	                        .from(tableName)
	                        .insert(row)
	                        .select('revision,updated_at')
	                        .single();
	                const result = await writeQuery;

	                if (result.error) {
	                    if (!existing.data && result.error.code === '23505') {
	                        const latest = await readCurrentRow();
	                        if (latest.error) {
	                            return {
	                                ok: false,
	                                reason: 'read-failed',
	                                error: latest.error.message || `Failed reading ${tableName}.`
	                            };
	                        }
	                        if (latest.data) return buildStaleResult(latest.data);
	                    }
	                    return {
	                        ok: false,
	                        reason: 'write-failed',
	                        error: result.error.message || `Failed writing ${tableName}.`
	                    };
	                }

	                if (existing.data && !result.data) {
	                    const latest = await readCurrentRow();
	                    if (latest.error) {
	                        return {
	                            ok: false,
	                            reason: 'read-failed',
	                            error: latest.error.message || `Failed reading ${tableName}.`
	                        };
	                    }
	                    if (latest.data) return buildStaleResult(latest.data);
	                    return {
	                        ok: false,
	                        reason: 'write-conflict',
	                        error: 'Live room snapshot write conflicted with another update.'
	                    };
	                }

	                const response = {
	                    ok: true,
	                    roomId,
	                    scope,
	                    caseId: caseId || '',
	                    revision: toNonNegativeInt(result.data && result.data.revision, revision),
	                    updatedAt: toIsoString(result.data && result.data.updated_at, updatedAt) || updatedAt
	                };
                    this.setSyncQueryCacheValue(this.getBoardRoomSnapshotCacheKey({ roomId, scope, caseId }), {
                        ok: true,
                        roomId,
                        scope,
                        caseId: caseId || '',
                        snapshot: {
                            roomId,
                            scope,
                            caseId: caseId || '',
                            payload: snapshotPayload,
                            revision: response.revision,
                            updatedAt: response.updatedAt,
                            updatedBy: row.updated_by || '',
                            updatedByName: row.updated_by_name || ''
                        }
                    });
	                return response;
	            }

	            const result = await ensured.client
	                .from(tableName)
	                .insert(row)
	                .select('revision,updated_at')
	                .single();

	            if (result.error) {
	                if (createOnly && result.error.code === '23505') {
	                    return {
	                        ok: false,
	                        reason: 'exists',
	                        error: result.error.message || `${tableName} row already exists.`
	                    };
	                }
	                return {
	                    ok: false,
	                    reason: 'write-failed',
	                    error: result.error.message || `Failed writing ${tableName}.`
	                };
	            }

	            const response = {
	                ok: true,
	                roomId,
	                scope,
	                caseId: caseId || '',
	                revision: toNonNegativeInt(result.data && result.data.revision, revision),
	                updatedAt: toIsoString(result.data && result.data.updated_at, updatedAt) || updatedAt
	            };
                this.setSyncQueryCacheValue(this.getBoardRoomSnapshotCacheKey({ roomId, scope, caseId }), {
                    ok: true,
                    roomId,
                    scope,
                    caseId: caseId || '',
                    snapshot: {
                        roomId,
                        scope,
                        caseId: caseId || '',
                        payload: snapshotPayload,
                        revision: response.revision,
                        updatedAt: response.updatedAt,
                        updatedBy: row.updated_by || '',
                        updatedByName: row.updated_by_name || ''
                    }
                });
	            return response;
	        }

        async restoreBoardRoomHistoryEntry(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const historyId = Math.max(0, toNonNegativeInt(opts.historyId, 0) || 0);
            if (!historyId) return { ok: false, reason: 'missing-history-id' };

            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const tableName = ensured.config.boardHistoryTable || DEFAULT_SYNC_CONFIG.boardHistoryTable;
            const result = await ensured.client
                .from(tableName)
                .select('id,payload,revision,reason,captured_at')
                .eq('campaign_id', ensured.config.campaignId)
                .eq('room_id', target.roomId)
                .eq('id', historyId)
                .maybeSingle();

            if (result.error) {
                return {
                    ok: false,
                    reason: 'history-read-failed',
                    error: result.error.message || `Failed reading ${tableName}.`
                };
            }
            if (!result.data) return { ok: false, reason: 'missing-history-entry' };

            return this.promoteBoardRoomStateToLive({
                ...target,
                payload: sanitizeBoard(result.data.payload),
                reason: sanitizeBoardHistoryReason(opts.reason, `restore:${historyId}`),
                historyReason: sanitizeBoardHistoryReason(opts.historyReason, `restore:${historyId}`)
            });
        }

        async promoteBoardRoomStateToLive(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const payload = sanitizeBoard(
                Object.prototype.hasOwnProperty.call(opts, 'payload')
                    ? opts.payload
                    : this.getBoardRoomStateSnapshot(target)
            );
            const reason = sanitizeBoardHistoryReason(opts.reason || opts.historyReason, 'admin-promote');
            const stamp = Date.now();
            const updatedAt = new Date(stamp).toISOString();

            const saved = await this.saveBoardRoomSnapshot({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                payload,
                revision: Math.max(stamp, toNonNegativeInt(opts.revision, stamp) || stamp),
                updatedAt,
                updatedBy: this.sync.instanceId,
                updatedByUser: this.sync.userId || null,
                updatedByName: this.sync.config && this.sync.config.profileName ? this.sync.config.profileName : null
            });
            if (!saved.ok) return saved;

            const history = await this.appendBoardRoomHistorySnapshot({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                payload,
                revision: saved.revision || stamp,
                capturedAt: saved.updatedAt || updatedAt,
                reason
            });

            if (target.scope === 'campaign') {
                this.updateCampaignMetaBoard(payload);
            } else {
                this.updateBoard(payload, target.caseId);
            }

            const broadcast = await this.sendBoardRoomAdminEvent({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                event: 'admin-apply-snapshot',
                payload: {
                    payload,
                    revision: saved.revision || stamp,
                    updatedAt: saved.updatedAt || updatedAt,
                    reason
                }
            });

            return {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                revision: saved.revision || stamp,
                updatedAt: saved.updatedAt || updatedAt,
                historyId: history && history.ok ? history.id : 0,
                historyError: history && !history.ok ? (history.error || history.reason || '') : '',
                broadcastOk: !!(broadcast && broadcast.ok),
                broadcastError: broadcast && !broadcast.ok ? (broadcast.error || broadcast.reason || '') : ''
            };
        }

        async bustBoardRoom(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const live = await this.loadBoardRoomSnapshot(target);
            let history = null;

            if (live.ok && live.snapshot) {
                history = await this.appendBoardRoomHistorySnapshot({
                    roomId: target.roomId,
                    scope: target.scope,
                    caseId: target.caseId,
                    payload: live.snapshot.payload,
                    revision: live.snapshot.revision || Date.now(),
                    capturedAt: live.snapshot.updatedAt || new Date().toISOString(),
                    reason: sanitizeBoardHistoryReason(opts.historyReason, 'bust')
                });
            }

            const broadcast = await this.sendBoardRoomAdminEvent({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                event: 'admin-bust',
                payload: {
                    bustId: `bust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                    reason: sanitizeBoardHistoryReason(opts.reason, 'bust')
                }
            });

            if (broadcast && broadcast.ok) {
                await new Promise((resolve) => setTimeout(resolve, 350));
            }

            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
            const result = await ensured.client
                .from(tableName)
                .delete()
                .eq('campaign_id', ensured.config.campaignId)
                .eq('room_id', target.roomId);

            if (result.error) {
                return {
                    ok: false,
                    reason: 'delete-failed',
                    error: result.error.message || `Failed deleting ${tableName}.`,
                    historyOk: !!(history && history.ok),
                    broadcastOk: !!(broadcast && broadcast.ok)
                };
            }

            const response = {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                historyOk: !!(history && history.ok),
                historyId: history && history.ok ? history.id : 0,
                historyError: history && !history.ok ? (history.error || history.reason || '') : '',
                broadcastOk: !!(broadcast && broadcast.ok),
                broadcastError: broadcast && !broadcast.ok ? (broadcast.error || broadcast.reason || '') : ''
            };
            this.setSyncQueryCacheValue(this.getBoardRoomSnapshotCacheKey(target), {
                ok: true,
                snapshot: null,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId
            });
            return response;
        }

        async clearBoardRoomLocalState(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
            const emptyPayload = target.scope === 'campaign'
                ? sanitizeBoard({
                    name: (this.getCampaignMetaBoard() && this.getCampaignMetaBoard().name) || DEFAULT_CAMPAIGN_META_BOARD_STATE.name,
                    nodes: [],
                    connections: []
                })
                : sanitizeBoard({
                    name: ((this.getCaseEntry(target.caseId, { createIfMissing: true }) || {}).name) || DEFAULT_CASE_NAME,
                    nodes: [],
                    connections: []
                });

            this.mirrorBoardSnapshotToState({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                payload: emptyPayload
            });

            if (target.scope !== 'campaign' && target.caseId === this.getActiveCaseId()) {
                try {
                    localStorage.removeItem(LEGACY_BOARD_KEY);
                } catch (err) { }
            }

            const cfg = sanitizeSyncConfig(this.sync && this.sync.config ? this.sync.config : getMergedSyncConfig());
            const dbName = cfg.campaignId ? `rtf-board-room-${cfg.campaignId}-${target.roomId}` : '';
            const deleted = await deleteIndexedDbDatabase(dbName);

            return {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                cacheCleared: !!(deleted && deleted.ok),
                cacheError: deleted && !deleted.ok ? (deleted.error || deleted.reason || '') : ''
            };
        }

        async disconnectSync(reason = 'manual') {
            if (this.sync.autoSyncBootTimer) {
                clearTimeout(this.sync.autoSyncBootTimer);
                this.sync.autoSyncBootTimer = null;
            }
            this.cancelCloudPush();
            this.stopReconcileLoop();
            this.clearNormalizedRealtimePull();

            if (this.sync.channel && this.sync.client) {
                try {
                    if (typeof this.sync.channel.untrack === 'function') {
                        try { await this.sync.channel.untrack(); } catch (err) { }
                    }
                    await this.sync.client.removeChannel(this.sync.channel);
                } catch (err) {
                    console.warn('RTF_STORE: Failed removing sync channel', err);
                }
            }
            this.sync.channel = null;
            this.sync.pushInFlight = false;
            this.sync.pushQueued = false;
            this.sync.remotePeers = new Map();
            this.sync.remoteSoftLocks = new Map();
            this.sync.localSoftLocks = new Map();
            this.sync.pendingConflict = null;
            this.sync.normalizedPendingScopes = new Set();
            this.sync.normalizedPendingScopeMeta = new Map();
            this.sync.authPromise = null;
            this.sync.roomHydrationInflight = new Map();
            this.sync.roomHydrationSeenAt = new Map();
            this.sync.queryCache = new Map();

            if (reason === 'disabled') {
                this.updateSyncStatus({
                    mode: 'disabled',
                    connected: false,
                    pendingPush: false,
                    message: 'Cloud sync is disabled.'
                });
            } else if (reason === 'manual') {
                this.updateSyncStatus({
                    mode: 'idle',
                    connected: false,
                    pendingPush: false,
                    message: 'Cloud sync disconnected.'
                });
            } else if (reason !== 'reconfigure') {
                this.updateSyncStatus({
                    mode: 'idle',
                    connected: false,
                    pendingPush: false
                });
            }
        }

        async ensureSyncUser() {
            if (!this.sync.client) return { ok: false, message: 'Supabase client unavailable.' };
            const now = Date.now();
            if (this.sync.userId && (now - toTimestamp(this.sync.authCheckedAt, 0)) < AUTH_SESSION_CACHE_MS) {
                return { ok: true, userId: this.sync.userId };
            }
            if (this.sync.authPromise) return this.sync.authPromise;

            this.sync.authPromise = (async () => {
                const sessionResult = await this.sync.client.auth.getSession();
                const existingSession = sessionResult && sessionResult.data ? sessionResult.data.session : null;
                const loginEmail = this.sync.config && this.sync.config.loginEmail ? this.sync.config.loginEmail : '';
                const loginPassword = this.sync.config && this.sync.config.loginPassword ? this.sync.config.loginPassword : '';
                if (loginEmail && loginPassword) {
                    const existingEmail = existingSession && existingSession.user && existingSession.user.email
                        ? String(existingSession.user.email).trim().toLowerCase()
                        : '';
                    if (existingSession && existingSession.user && existingSession.user.id
                        && existingEmail === loginEmail.toLowerCase()) {
                        this.sync.userId = existingSession.user.id;
                        this.sync.authCheckedAt = Date.now();
                        return { ok: true, userId: existingSession.user.id };
                    }

                    const passwordResult = await this.sync.client.auth.signInWithPassword({
                        email: loginEmail,
                        password: loginPassword
                    });
                    if (passwordResult.error) {
                        return {
                            ok: false,
                            message: passwordResult.error.message || 'Player login failed.'
                        };
                    }
                    const passwordSession = passwordResult.data ? passwordResult.data.session : null;
                    if (passwordSession && passwordSession.user && passwordSession.user.id) {
                        this.sync.userId = passwordSession.user.id;
                        this.sync.authCheckedAt = Date.now();
                        return { ok: true, userId: passwordSession.user.id };
                    }
                    return { ok: false, message: 'No authenticated user session.' };
                }

                if (existingSession && existingSession.user && existingSession.user.id) {
                    this.sync.userId = existingSession.user.id;
                    this.sync.authCheckedAt = Date.now();
                    return { ok: true, userId: existingSession.user.id };
                }

                const anonResult = await this.sync.client.auth.signInAnonymously({
                    options: {
                        data: this.sync.config.profileName ? { profile_name: this.sync.config.profileName } : {}
                    }
                });

                if (anonResult.error) {
                    return {
                        ok: false,
                        message: anonResult.error.message || 'Anonymous auth failed.'
                    };
                }

                const session = anonResult.data ? anonResult.data.session : null;
                if (session && session.user && session.user.id) {
                    this.sync.userId = session.user.id;
                    this.sync.authCheckedAt = Date.now();
                    return { ok: true, userId: session.user.id };
                }

                return { ok: false, message: 'No authenticated user session.' };
            })().catch((err) => {
                return {
                    ok: false,
                    message: err && err.message ? err.message : 'Auth failed.'
                };
            }).finally(() => {
                this.sync.authPromise = null;
            });

            return this.sync.authPromise;
        }

        async requestMagicLink(email) {
            if (!this.sync.client) return { ok: false, error: 'Supabase client unavailable.' };
            const cleanEmail = typeof email === 'string' ? email.trim() : '';
            if (!cleanEmail) return { ok: false, error: 'Email required.' };

            const options = {};
            if (global.location && global.location.href) {
                options.emailRedirectTo = global.location.href;
            }

            const result = await this.sync.client.auth.signInWithOtp({ email: cleanEmail, options });
            if (result.error) {
                return { ok: false, error: result.error.message || 'Magic link request failed.' };
            }

            return { ok: true };
        }

        async signInWithPassword(email, password, profileName = '') {
            const cleanEmail = typeof email === 'string' ? email.trim() : '';
            const cleanPassword = typeof password === 'string' ? password : '';
            if (!cleanEmail || !cleanPassword) return { ok: false, error: 'Email and password required.' };

            const config = sanitizeSyncConfig(this.sync && this.sync.config ? this.sync.config : getMergedSyncConfig());
            if (!config.supabaseUrl || !config.anonKey) return { ok: false, error: 'Supabase URL and anon key required.' };

            const cleanName = sanitizeProfileName(profileName);
            this.setSyncConfig({
                ...(cleanName ? { profileName: cleanName } : {}),
                loginEmail: cleanEmail,
                loginPassword: cleanPassword
            }, { reconnect: false });

            try {
                await this.ensureSupabaseClient(config);
                const result = await this.sync.client.auth.signInWithPassword({
                    email: cleanEmail,
                    password: cleanPassword
                });
                if (result.error) return { ok: false, error: result.error.message || 'Password sign-in failed.' };

                const session = result.data ? result.data.session : null;
                if (!session || !session.user || !session.user.id) return { ok: false, error: 'No authenticated user session.' };
                this.sync.userId = session.user.id;
                this.sync.authCheckedAt = Date.now();
                this.sync.authPromise = null;
                this.updateSyncStatus({
                    mode: 'idle',
                    connected: false,
                    enabled: this.sync.config.enabled,
                    userId: this.sync.userId,
                    campaignId: this.sync.config.campaignId,
                    profileName: this.sync.config.profileName,
                    message: 'Signed in. Cloud sync will fetch or push only when needed.'
                });
                return { ok: true, userId: this.sync.userId };
            } catch (err) {
                return { ok: false, error: err && err.message ? err.message : 'Password sign-in failed.' };
            }
        }

        async signInAnonymously(profileName = '') {
            const patch = {};
            const cleanName = sanitizeProfileName(profileName);
            if (cleanName) patch.profileName = cleanName;
            if (Object.keys(patch).length) this.setSyncConfig(patch, { reconnect: false });
            return this.connectSync({ explicit: true });
        }

        async signOutSyncUser() {
            if (!this.sync.client) return { ok: false, error: 'Supabase client unavailable.' };
            const result = await this.sync.client.auth.signOut();
            await this.disconnectSync('manual');
            if (result.error) {
                return { ok: false, error: result.error.message || 'Sign out failed.' };
            }
            this.sync.userId = '';
            this.sync.authCheckedAt = 0;
            this.sync.authPromise = null;
            this.updateSyncStatus({
                mode: this.sync.config.enabled ? 'idle' : 'disabled',
                connected: false,
                userId: '',
                message: this.sync.config.enabled ? 'Signed out from cloud sync.' : 'Cloud sync is disabled.'
            });
            return { ok: true };
        }

        async subscribeRealtime() {
            if (!this.sync.client) throw new Error('Supabase client unavailable.');

            if (this.sync.channel) {
                try {
                    await this.sync.client.removeChannel(this.sync.channel);
                } catch (err) {
                    console.warn('RTF_STORE: Failed replacing sync channel', err);
                }
            }

            const config = this.sync.config;
            const channelName = `rtf-sync-${config.campaignId}-${this.sync.instanceId}`;
            const filter = `campaign_id=eq.${config.campaignId}`;
            const channel = this.sync.client.channel(channelName);
            const realtimeTables = this.getRealtimeTableTargets();
            realtimeTables.forEach((tableName) => {
                channel.on('postgres_changes', {
                    event: '*',
                    schema: config.schema,
                    table: tableName,
                    filter
                }, (payload) => {
                    this.handleRealtimePayload(payload);
                });
            });

            channel.on('presence', { event: 'sync' }, () => {
                const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
                this.handlePresenceState(state);
            });
            channel.on('presence', { event: 'join' }, () => {
                const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
                this.handlePresenceState(state);
            });
            channel.on('presence', { event: 'leave' }, () => {
                const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
                this.handlePresenceState(state);
            });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Realtime subscription timed out.'));
                }, 10000);

                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timeout);
                        resolve();
                        return;
                    }
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        clearTimeout(timeout);
                        reject(new Error(`Realtime channel status: ${status}`));
                    }
                });
            });

            this.sync.channel = channel;
            await this.refreshPresenceTracking();
            const currentPresence = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
            this.handlePresenceState(currentPresence);
        }

        handleRealtimePayload(payload) {
            if (this.isNormalizedReadMode()) {
                const row = payload && (payload.new || payload.old) ? (payload.new || payload.old) : null;
                if (!row) return;
                const updatedByNormalized = row.updated_by || '';
                if (updatedByNormalized && updatedByNormalized === this.sync.instanceId) return;
                const normalizedRevision = toNonNegativeInt(row.revision, 0);
                if (normalizedRevision > this.sync.lastKnownRemoteRevision) {
                    this.sync.lastKnownRemoteRevision = normalizedRevision;
                    this.updateSyncStatus({
                        connected: this.hasLiveSyncConnection(),
                        message: this.sync.pendingConflict
                            ? this.syncStatus.message
                            : 'Shared update detected. Catching up.'
                    });
                }
                const scope = normalizeScopeToken(row.scope);
                if (!scope || scope === SYNC_SCOPE_GLOBAL || isRoomBackedScope(scope)) return;
                this.scheduleNormalizedRealtimePull([row]);
                return;
            }
            const row = payload && payload.new ? payload.new : null;
            if (!row) return;
            if (!row.state) return;

            const updatedAt = toTimestamp(row.updated_at, Date.now());
            const updatedBy = row.updated_by || '';
            const remoteState = sanitizeState(row.state);
            const remoteRevision = toNonNegativeInt(remoteState.meta && remoteState.meta.syncRevision, 0);

            if (updatedBy && updatedBy === this.sync.instanceId) return;
            if (remoteRevision && remoteRevision <= this.sync.lastKnownRemoteRevision && updatedAt <= this.sync.lastRemoteSeenAt) return;
            if (!remoteRevision && updatedAt && updatedAt <= this.sync.lastRemoteSeenAt) return;

            this.sync.lastRemoteSeenAt = updatedAt;
            this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(remoteState));
            const localRevision = toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0);
            const hasLocalDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
            if (hasLocalDirty && remoteRevision > localRevision) {
                const conflict = this.buildConflictRecord({
                    state: remoteState,
                    revision: remoteRevision,
                    updatedAt,
                    updatedAtRaw: row.updated_at || '',
                    updatedBy,
                    updatedByName: row.updated_by_name || ''
                }, this.getDirtyScopesSnapshot());
                if (conflict.overlappingScopes.length) {
                    this.setPendingConflict(conflict);
                    return;
                }
                this.adoptMergedConflictState(conflict, 'auto-merge-realtime');
                return;
            }
            const applied = this.applyRemoteState(remoteState, {
                source: 'realtime',
                updatedAt,
                updatedBy,
                revision: remoteRevision
            });

            if (applied) {
                this.updateSyncStatus({
                    mode: 'ready',
                    connected: this.hasLiveSyncConnection(),
                    message: 'Remote update received.'
                });
            }
        }

        async pullFromCloudNormalizedScopes(scopes, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const force = !!opts.force;
            const changedScopes = filterCloudSyncScopes(scopes);
            if (!changedScopes.length) {
                return { ok: true, reason: 'no-scopes', applied: false };
            }
            if (!this.sync.client) {
                return { ok: false, reason: 'not-connected' };
            }

            const hasLocalDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
            const dirtyScopes = hasLocalDirty ? this.getDirtyScopesSnapshot() : [];
            if (!force && dirtyScopes.some((localScope) => changedScopes.some((remoteScope) => scopesOverlap(localScope, remoteScope)))) {
                return this.pullFromCloud({ ...opts, force: false, silent });
            }

            const tables = this.getNormalizedTables();
            const versionMap = this.buildNormalizedScopeVersionMap(opts.scopeVersionRows);
            const missingScopeRows = changedScopes.filter((scope) => !versionMap.has(scope));
            if (missingScopeRows.length) {
                const versionRowsResult = await this.fetchNormalizedList(
                    tables.scopeVersions,
                    'scope,exists,revision,updated_at,updated_by,updated_by_name',
                    { column: 'updated_at', ascending: false },
                    [{ column: 'scope', in: missingScopeRows }]
                );
                if (!versionRowsResult.ok) {
                    if (!silent) {
                        this.updateSyncStatus({
                            mode: 'error',
                            message: 'Cloud read failed.',
                            lastError: versionRowsResult.error || 'Scope version read failed.'
                        });
                    }
                    return { ok: false, reason: 'error', error: versionRowsResult.error || 'Scope version read failed.' };
                }
                (Array.isArray(versionRowsResult.data) ? versionRowsResult.data : []).forEach((row) => {
                    const scope = normalizeScopeToken(row && row.scope);
                    if (!scope) return;
                    versionMap.set(scope, row);
                });
            }

            const scopedFetch = await this.fetchNormalizedScopedRows(changedScopes);
            if (!scopedFetch.ok) {
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        message: 'Cloud read failed.',
                        lastError: scopedFetch.error || 'Targeted normalized read failed.'
                    });
                }
                return { ok: false, reason: 'error', error: scopedFetch.error || 'Targeted normalized read failed.' };
            }

            const remoteBase = sanitizeState(this.sync.lastSyncedState || this.state);
            const remoteRow = this.buildNormalizedRemoteRowFromScopedSnapshot(remoteBase, changedScopes, scopedFetch.snapshot, versionMap);
            const applied = this.applyMergedRemoteState(remoteRow, dirtyScopes, 'realtime-scoped', {
                clearPendingConflict: false,
                schedulePush: !!dirtyScopes.length
            });
            this.sync.lastPullAt = Date.now();
            this.sync.lastKnownRemoteRevision = Math.max(this.sync.lastKnownRemoteRevision, toNonNegativeInt(remoteRow.revision, 0));
            if (applied) {
                this.updateSyncStatus({
                    lastPullAt: this.sync.lastPullAt,
                    mode: 'ready',
                    connected: this.hasLiveSyncConnection(),
                    pendingPush: !!dirtyScopes.length,
                    message: dirtyScopes.length
                        ? 'Applied scoped cloud updates with local edits preserved.'
                        : 'Applied scoped cloud updates.',
                    lastError: ''
                });
            }
            return { ok: true, reason: applied ? 'applied' : 'skipped', applied };
        }

        scheduleCloudPush(reason = 'scheduled') {
            if (!this.sync.config.enabled) return;
            if (!this.canAutoPushCloud(reason)) {
                this.updateSyncStatus({
                    pendingPush: !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size),
                    connected: this.hasLiveSyncConnection(),
                    mode: this.sync.config.enabled ? 'idle' : this.syncStatus.mode,
                    message: this.sync.userId
                        ? 'Editing. Autosave will run after 3 seconds of inactivity.'
                        : this.syncStatus.message
                });
                return;
            }

            if (this.sync.pushTimer) clearTimeout(this.sync.pushTimer);
            const pushDelayMs = isYjsCollabPage()
                ? this.sync.config.syncDelayMs
                : NON_YJS_AUTO_SAVE_DELAY_MS;
            this.sync.pushTimer = setTimeout(() => {
                this.sync.pushTimer = null;

                this.pushToCloud({
                    reason,
                    silent: true,
                    requirePageSync: !this.hasLiveSyncConnection()
                }).then((result) => {
                    if (!result || result.ok !== false) return;

                    const stillDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
                    const reasonText = String(result.reason || 'error');

                    if (reasonText === 'queued') {
                        this.updateSyncStatus({
                            pendingPush: true,
                            connected: this.hasLiveSyncConnection(),
                            message: 'Cloud push is queued.'
                        });
                        return;
                    }

                    if (reasonText === 'conflict') {
                        this.updateSyncStatus({
                            mode: 'conflict',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: stillDirty,
                            message: 'The latest shared version needs review.',
                            lastError: ''
                        });
                        return;
                    }

                    if (reasonText === 'locked') {
                        this.updateSyncStatus({
                            mode: 'locked',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: true,
                            message: 'Another player is actively editing one of these scopes.',
                            lastError: ''
                        });
                        return;
                    }

                    if (reasonText === 'auth-required') {
                        this.updateSyncStatus({
                            mode: 'auth_required',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: stillDirty,
                            message: 'Authentication is required before autosave can finish.',
                            lastError: result.error || 'Authentication required.'
                        });
                        return;
                    }

                    if (reasonText === 'missing-config') {
                        this.updateSyncStatus({
                            mode: 'error',
                            connected: false,
                            pendingPush: stillDirty,
                            message: 'Missing sync config: URL, anon key, or campaign ID.',
                            lastError: result.error || 'Missing required sync config.'
                        });
                        return;
                    }

                    if (reasonText === 'page-blocked') {
                        this.updateSyncStatus({
                            mode: 'idle',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: stillDirty,
                            message: 'Local edits are waiting, but this page is not allowed to autosync.',
                            lastError: ''
                        });
                        return;
                    }

                    this.updateSyncStatus({
                        mode: 'error',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: stillDirty,
                        message: 'Cloud push failed.',
                        lastError: result.error || `Cloud push failed: ${reasonText}`
                    });
                }).catch((err) => {
                    const stillDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: stillDirty,
                        message: 'Cloud push failed.',
                        lastError: err && err.message ? err.message : String(err)
                    });
                });
            }, pushDelayMs);

            this.updateSyncStatus({
                pendingPush: true,
                mode: 'editing',
                message: isYjsCollabPage()
                    ? 'Saving board collaboration snapshot.'
                    : 'Editing. Autosave will run after 3 seconds of inactivity.'
            });
        }

        cancelCloudPush() {
            if (this.sync.pushTimer) {
                clearTimeout(this.sync.pushTimer);
                this.sync.pushTimer = null;
            }
            this.updateSyncStatus({ pendingPush: false });
        }

        buildNormalizedScopePlan(scopes, state) {
            const cleanState = sanitizeState(state);
            const scopeList = normalizeScopeList(scopes);
            const caseIds = Array.isArray(cleanState.cases && cleanState.cases.items)
                ? cleanState.cases.items.map((entry) => entry && entry.id).filter(Boolean)
                : [];
            const writeAll = scopeList.some((scope) => scope === SYNC_SCOPE_GLOBAL);

            const plan = {
                writeCore: writeAll,
                writeHQ: writeAll,
                writePlayers: writeAll,
                writeNPCs: writeAll,
                writeLocations: writeAll,
                writeRequisitions: writeAll,
                writeEncounters: writeAll,
                writeCaseState: writeAll,
                writeAllCaseEvents: writeAll,
                playerIds: new Set(),
                npcIds: new Set(),
                locationIds: new Set(),
                requisitionIds: new Set(),
                encounterIds: new Set(),
                caseEvents: new Set(),
                caseEventIds: new Map()
            };

            const campaignEntityPlanConfig = {
                players: { writeKey: 'writePlayers', idSet: plan.playerIds },
                npcs: { writeKey: 'writeNPCs', idSet: plan.npcIds },
                locations: { writeKey: 'writeLocations', idSet: plan.locationIds },
                requisitions: { writeKey: 'writeRequisitions', idSet: plan.requisitionIds },
                encounters: { writeKey: 'writeEncounters', idSet: plan.encounterIds }
            };

            const markCampaignAll = () => {
                plan.writeCore = true;
                plan.writePlayers = true;
                plan.writeNPCs = true;
                plan.writeLocations = true;
                plan.writeRequisitions = true;
                plan.writeEncounters = true;
            };
            const addScopedEntityId = (set, scopeIdToken) => {
                const id = normalizeEntityScopeId(scopeIdToken);
                if (!id || id === ENTITY_SCOPE_ORDER_TOKEN) return;
                set.add(id);
            };
            const addCaseEventScopeId = (caseId, scopeIdToken) => {
                const id = normalizeEntityScopeId(scopeIdToken);
                if (!id || id === ENTITY_SCOPE_ORDER_TOKEN) return;
                if (!plan.caseEventIds.has(caseId)) plan.caseEventIds.set(caseId, new Set());
                plan.caseEventIds.get(caseId).add(id);
            };

            scopeList.forEach((scope) => {
                if (scope === SYNC_SCOPE_GLOBAL) return;
                if (isRoomBackedScope(scope)) return;
                if (scope === 'campaign' || scope.startsWith('campaign.')) {
                    if (scope === 'campaign') {
                        markCampaignAll();
                        return;
                    }
                    if (scope === 'campaign.heat'
                        || scope === 'campaign.cognitiveRisk'
                        || scope === 'campaign.rep'
                        || scope === 'campaign.case'
                        || scope === 'campaign.ledger'
                        || scope === 'campaign.context'
                        || scope === 'campaign.meta'
                        || scope.startsWith('campaign.meta.')) {
                        plan.writeCore = true;
                    }
                    const campaignEntityMatch = scope.match(/^campaign\.(players|npcs|locations|requisitions|encounters)(?:\.([a-z0-9_-]+))?$/);
                    if (campaignEntityMatch) {
                        const key = campaignEntityMatch[1];
                        const scopeId = campaignEntityMatch[2] || '';
                        const cfg = campaignEntityPlanConfig[key];
                        if (!cfg) return;
                        if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                            plan[cfg.writeKey] = true;
                            return;
                        }
                        addScopedEntityId(cfg.idSet, scopeId);
                    }
                    return;
                }
                if (scope === 'hq') {
                    plan.writeHQ = true;
                    return;
                }
                if (scope === 'cases' || scope === SYNC_SCOPE_CASES_META) {
                    plan.writeCaseState = true;
                    return;
                }
                const caseEventScopeMatch = scope.match(/^cases\.([a-z0-9_-]+)\.events\.([a-z0-9_-]+)$/);
                if (caseEventScopeMatch) {
                    const caseId = sanitizeCaseId(caseEventScopeMatch[1], 'case_primary');
                    const scopeId = caseEventScopeMatch[2];
                    if (scopeId === ENTITY_SCOPE_ORDER_TOKEN) {
                        plan.caseEvents.add(caseId);
                        return;
                    }
                    addCaseEventScopeId(caseId, scopeId);
                    return;
                }
                const caseFieldMatch = scope.match(/^cases\.([a-z0-9_-]+)\.(events|name|leads)$/);
                if (caseFieldMatch) {
                    const caseId = sanitizeCaseId(caseFieldMatch[1], 'case_primary');
                    const field = caseFieldMatch[2];
                    if (field === 'events') plan.caseEvents.add(caseId);
                    if (field === 'name' || field === 'leads') plan.writeCaseState = true;
                    return;
                }
                const caseWholeMatch = scope.match(/^cases\.([a-z0-9_-]+)$/);
                if (caseWholeMatch) {
                    const caseId = sanitizeCaseId(caseWholeMatch[1], 'case_primary');
                    plan.writeCaseState = true;
                    plan.caseEvents.add(caseId);
                }
            });

            if (plan.writePlayers) plan.playerIds.clear();
            if (plan.writeNPCs) plan.npcIds.clear();
            if (plan.writeLocations) plan.locationIds.clear();
            if (plan.writeRequisitions) plan.requisitionIds.clear();
            if (plan.writeEncounters) plan.encounterIds.clear();

            if (plan.writeAllCaseEvents) {
                caseIds.forEach((id) => plan.caseEvents.add(id));
                plan.caseEventIds.clear();
            }
            if (plan.caseEvents.size && plan.caseEventIds.size) {
                plan.caseEvents.forEach((caseId) => {
                    plan.caseEventIds.delete(caseId);
                });
            }
            if (plan.writeCaseState) {
                caseIds.forEach((id) => {
                    if (scopeList.some((scope) => scope === 'cases' || scope === SYNC_SCOPE_CASES_META)) {
                        // cases.meta affects active case/order/name only; board/event payload stays scoped separately.
                        return;
                    }
                    if (plan.writeAllCaseEvents) plan.caseEvents.add(id);
                });
            }

            return plan;
        }

        buildNormalizedWriteMeta(state, meta = {}) {
            const updatedAt = toTimestamp(meta.updatedAt, toTimestamp(state && state.meta && state.meta.updated, Date.now()));
            return {
                revision: toNonNegativeInt(state && state.meta && state.meta.syncRevision, 0),
                updated_at: new Date(updatedAt || Date.now()).toISOString(),
                updated_by: toTrimmedString(meta.updatedBy, this.sync.instanceId, 120),
                updated_by_user: Object.prototype.hasOwnProperty.call(meta, 'updatedByUser') ? (meta.updatedByUser || null) : (this.sync.userId || null),
                updated_by_name: Object.prototype.hasOwnProperty.call(meta, 'updatedByName') ? (meta.updatedByName || null) : (this.sync.config.profileName || null)
            };
        }

        getLastSyncedCampaignEntityIds(key) {
            const synced = sanitizeState(this.sync && this.sync.lastSyncedState ? this.sync.lastSyncedState : null);
            const list = synced && synced.campaign && Array.isArray(synced.campaign[key]) ? synced.campaign[key] : [];
            return list
                .map((entry) => toTrimmedString(entry && entry.id, '', 80))
                .filter(Boolean);
        }

        getLastSyncedCaseIds() {
            const synced = sanitizeState(this.sync && this.sync.lastSyncedState ? this.sync.lastSyncedState : null);
            const items = synced && synced.cases && Array.isArray(synced.cases.items) ? synced.cases.items : [];
            return items
                .map((entry) => sanitizeCaseId(entry && entry.id, ''))
                .filter(Boolean);
        }

        getLastSyncedCaseEventIds(caseId) {
            const targetCaseId = sanitizeCaseId(caseId, '');
            if (!targetCaseId) return [];
            const synced = sanitizeState(this.sync && this.sync.lastSyncedState ? this.sync.lastSyncedState : null);
            const items = synced && synced.cases && Array.isArray(synced.cases.items) ? synced.cases.items : [];
            const entry = items.find((item) => sanitizeCaseId(item && item.id, '') === targetCaseId);
            const events = entry && Array.isArray(entry.events) ? entry.events : [];
            return events
                .map((event) => toTrimmedString(event && event.id, '', 80))
                .filter(Boolean);
        }

        async replaceEntityCollection(tableName, idColumn, sourceItems, writeMeta) {
            const campaignId = this.sync.config.campaignId;
            const list = Array.isArray(sourceItems) ? sourceItems : [];
            const rows = [];
            const localIds = new Set();
            list.forEach((item, idx) => {
                if (!item || typeof item !== 'object') return;
                const fallback = buildEntityId(idColumn.replace(/_id$/i, ''), idx);
                const id = toTrimmedString(item.id, fallback, 80);
                const payload = { ...item, id };
                localIds.add(id);
                rows.push({
                    campaign_id: campaignId,
                    [idColumn]: id,
                    payload,
                    ...writeMeta
                });
            });

            const keyByIdColumn = {
                player_id: 'players',
                npc_id: 'npcs',
                location_id: 'locations',
                requisition_id: 'requisitions',
                encounter_id: 'encounters'
            };
            const existingIds = keyByIdColumn[idColumn]
                ? this.getLastSyncedCampaignEntityIds(keyByIdColumn[idColumn])
                : [];
            const toDelete = existingIds.filter((id) => !localIds.has(id));

            if (rows.length) {
                const upsert = await this.sync.client
                    .from(tableName)
                    .upsert(rows, { onConflict: `campaign_id,${idColumn}` });
                if (upsert.error) {
                    return { ok: false, error: upsert.error.message || `Failed writing ${tableName}.` };
                }
            }

            if (toDelete.length) {
                const del = await this.sync.client
                    .from(tableName)
                    .delete()
                    .eq('campaign_id', campaignId)
                    .in(idColumn, toDelete);
                if (del.error) {
                    return { ok: false, error: del.error.message || `Failed deleting from ${tableName}.` };
                }
            }
            return { ok: true };
        }

        buildScopedEntityRowMap(sourceItems, fallbackPrefix = 'entity') {
            const list = Array.isArray(sourceItems) ? sourceItems : [];
            const byScopeId = new Map();
            list.forEach((item, idx) => {
                if (!item || typeof item !== 'object') return;
                const fallback = buildEntityId(fallbackPrefix, idx);
                const id = toTrimmedString(item.id, fallback, 80);
                const scopeId = normalizeEntityScopeId(id);
                if (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN) return;
                if (byScopeId.has(scopeId)) return;
                byScopeId.set(scopeId, {
                    id,
                    payload: { ...item, id }
                });
            });
            return byScopeId;
        }

        async resolveDeleteIdsByScope(tableName, idColumn, scopeIds, filters = []) {
            const campaignId = this.sync.config.campaignId;
            const desiredScopeIds = Array.isArray(scopeIds) ? scopeIds : [];
            if (!desiredScopeIds.length) return { ok: true, ids: [] };

            let query = this.sync.client
                .from(tableName)
                .select(idColumn)
                .eq('campaign_id', campaignId);

            const filterList = Array.isArray(filters) ? filters : [];
            filterList.forEach((entry) => {
                if (!entry || !entry.column) return;
                query = query.eq(entry.column, entry.value);
            });

            const existing = await query;
            if (existing.error) {
                return {
                    ok: false,
                    error: existing.error.message || `Failed reading ${tableName}.`
                };
            }

            const desiredSet = new Set(desiredScopeIds);
            const deleteIds = new Set();
            (Array.isArray(existing.data) ? existing.data : []).forEach((row) => {
                const id = toTrimmedString(row && row[idColumn], '', 80);
                const scopeId = normalizeEntityScopeId(id);
                if (!scopeId || !desiredSet.has(scopeId)) return;
                deleteIds.add(id);
            });
            return { ok: true, ids: Array.from(deleteIds.values()) };
        }

        async syncEntityRowsByScopeIds(tableName, idColumn, sourceItems, scopeIds, writeMeta) {
            const campaignId = this.sync.config.campaignId;
            const requestedScopeIds = Array.from(scopeIds || [])
                .map((scopeId) => normalizeEntityScopeId(scopeId))
                .filter((scopeId) => !!scopeId && scopeId !== ENTITY_SCOPE_ORDER_TOKEN);
            if (!requestedScopeIds.length) return { ok: true };

            const fallbackPrefix = idColumn.replace(/_id$/i, '');
            const byScopeId = this.buildScopedEntityRowMap(sourceItems, fallbackPrefix);
            const rows = [];
            const missingScopeIds = [];

            requestedScopeIds.forEach((scopeId) => {
                const row = byScopeId.get(scopeId);
                if (!row) {
                    missingScopeIds.push(scopeId);
                    return;
                }
                rows.push({
                    campaign_id: campaignId,
                    [idColumn]: row.id,
                    payload: row.payload,
                    ...writeMeta
                });
            });

            if (rows.length) {
                const upsert = await this.sync.client
                    .from(tableName)
                    .upsert(rows, { onConflict: `campaign_id,${idColumn}` });
                if (upsert.error) {
                    return { ok: false, error: upsert.error.message || `Failed writing ${tableName}.` };
                }
            }

            if (missingScopeIds.length) {
                const deleteLookup = await this.resolveDeleteIdsByScope(tableName, idColumn, missingScopeIds);
                if (!deleteLookup.ok) return deleteLookup;
                if (deleteLookup.ids.length) {
                    const del = await this.sync.client
                        .from(tableName)
                        .delete()
                        .eq('campaign_id', campaignId)
                        .in(idColumn, deleteLookup.ids);
                    if (del.error) {
                        return { ok: false, error: del.error.message || `Failed deleting from ${tableName}.` };
                    }
                }
            }
            return { ok: true };
        }

        async syncCaseStateRows(state, writeMeta) {
            const tables = this.getNormalizedTables();
            const campaignId = this.sync.config.campaignId;
            const cases = Array.isArray(state && state.cases && state.cases.items) ? state.cases.items : [];
            const activeCaseId = toTrimmedString(state && state.cases && state.cases.activeCaseId, 'case_primary', 80);

            const rows = cases.map((entry, idx) => {
                const caseId = sanitizeCaseId(entry && entry.id, `case_${idx + 1}`);
                const caseName = sanitizeCaseName(entry && entry.name, DEFAULT_CASE_NAME);
                return {
                    campaign_id: campaignId,
                    case_id: caseId,
                    case_name: caseName,
                    is_active: caseId === activeCaseId,
                    sort_order: idx,
                    payload: {
                        name: caseName,
                        leads: sanitizeLeadList(entry && entry.leads)
                    },
                    ...writeMeta
                };
            });
            if (!rows.length) {
                rows.push({
                    campaign_id: campaignId,
                    case_id: 'case_primary',
                    case_name: DEFAULT_CASE_NAME,
                    is_active: true,
                    sort_order: 0,
                    payload: { name: DEFAULT_CASE_NAME, leads: [] },
                    ...writeMeta
                });
            }

            const localCaseIds = new Set(rows.map((row) => row.case_id));
            const existingCaseIds = this.getLastSyncedCaseIds();
            const toDelete = existingCaseIds.filter((id) => !localCaseIds.has(id));

            const upsert = await this.sync.client
                .from(tables.caseState)
                .upsert(rows, { onConflict: 'campaign_id,case_id' });
            if (upsert.error) {
                return { ok: false, error: upsert.error.message || 'Failed writing case state.' };
            }

            if (toDelete.length) {
                const [delEvents, delCases] = await Promise.all([
                    this.sync.client.from(tables.caseEvents).delete().eq('campaign_id', campaignId).in('case_id', toDelete),
                    this.sync.client.from(tables.caseState).delete().eq('campaign_id', campaignId).in('case_id', toDelete)
                ]);
                if (delEvents.error) return { ok: false, error: delEvents.error.message || 'Failed pruning case events.' };
                if (delCases.error) return { ok: false, error: delCases.error.message || 'Failed pruning case state.' };
            }
            return { ok: true };
        }

        async syncCaseBoardsRows(state, caseIds, writeMeta) {
            const tables = this.getNormalizedTables();
            const campaignId = this.sync.config.campaignId;
            const cases = Array.isArray(state && state.cases && state.cases.items) ? state.cases.items : [];
            const byId = new Map();
            cases.forEach((entry) => {
                if (!entry || !entry.id) return;
                byId.set(entry.id, entry);
            });
            const rows = [];
            caseIds.forEach((caseId) => {
                const entry = byId.get(caseId);
                if (!entry) return;
                rows.push({
                    campaign_id: campaignId,
                    case_id: caseId,
                    payload: sanitizeBoard(entry.board || { name: entry.name || DEFAULT_CASE_NAME }),
                    ...writeMeta
                });
            });
            if (!rows.length) return { ok: true };
            const upsert = await this.sync.client
                .from(tables.caseBoards)
                .upsert(rows, { onConflict: 'campaign_id,case_id' });
            if (upsert.error) {
                return { ok: false, error: upsert.error.message || 'Failed writing case boards.' };
            }
            return { ok: true };
        }

        async syncCaseEventsRows(state, caseIds, writeMeta) {
            const tables = this.getNormalizedTables();
            const campaignId = this.sync.config.campaignId;
            const cases = Array.isArray(state && state.cases && state.cases.items) ? state.cases.items : [];
            const byId = new Map();
            cases.forEach((entry) => {
                if (!entry || !entry.id) return;
                byId.set(entry.id, entry);
            });

            for (const caseId of caseIds) {
                const entry = byId.get(caseId);
                const events = Array.isArray(entry && entry.events) ? entry.events : [];
                const normalizedRows = [];
                const localIds = new Set();
                events.forEach((event, idx) => {
                    if (!event || typeof event !== 'object') return;
                    const fallback = buildEntityId('event', idx);
                    const eventId = toTrimmedString(event.id, fallback, 80);
                    const payload = { ...event, id: eventId, caseId };
                    localIds.add(eventId);
                    normalizedRows.push({
                        campaign_id: campaignId,
                        case_id: caseId,
                        event_id: eventId,
                        payload,
                        ...writeMeta
                    });
                });

                const existingIds = this.getLastSyncedCaseEventIds(caseId);
                const toDelete = existingIds.filter((id) => !localIds.has(id));

                if (normalizedRows.length) {
                    const upsert = await this.sync.client
                        .from(tables.caseEvents)
                        .upsert(normalizedRows, { onConflict: 'campaign_id,case_id,event_id' });
                    if (upsert.error) {
                        return { ok: false, error: upsert.error.message || `Failed writing events for ${caseId}.` };
                    }
                }

                if (toDelete.length) {
                    const del = await this.sync.client
                        .from(tables.caseEvents)
                        .delete()
                        .eq('campaign_id', campaignId)
                        .eq('case_id', caseId)
                        .in('event_id', toDelete);
                    if (del.error) {
                        return { ok: false, error: del.error.message || `Failed deleting events for ${caseId}.` };
                    }
                }
            }

            return { ok: true };
        }

        async syncCaseEventRowsByScopeIds(state, caseEventScopeMap, writeMeta) {
            const tables = this.getNormalizedTables();
            const campaignId = this.sync.config.campaignId;
            const cases = Array.isArray(state && state.cases && state.cases.items) ? state.cases.items : [];
            const byCaseId = new Map();
            cases.forEach((entry) => {
                if (!entry || !entry.id) return;
                byCaseId.set(entry.id, entry);
            });

            const entries = caseEventScopeMap instanceof Map
                ? Array.from(caseEventScopeMap.entries())
                : [];

            for (const [rawCaseId, rawScopeIdSet] of entries) {
                const caseId = sanitizeCaseId(rawCaseId, 'case_primary');
                const requestedScopeIds = Array.from(rawScopeIdSet || [])
                    .map((scopeId) => normalizeEntityScopeId(scopeId))
                    .filter((scopeId) => !!scopeId && scopeId !== ENTITY_SCOPE_ORDER_TOKEN);
                if (!requestedScopeIds.length) continue;

                const caseEntry = byCaseId.get(caseId);
                const events = Array.isArray(caseEntry && caseEntry.events) ? caseEntry.events : [];
                const byScopeId = this.buildScopedEntityRowMap(events, 'event');
                const rows = [];
                const missingScopeIds = [];

                requestedScopeIds.forEach((scopeId) => {
                    const row = byScopeId.get(scopeId);
                    if (!row) {
                        missingScopeIds.push(scopeId);
                        return;
                    }
                    rows.push({
                        campaign_id: campaignId,
                        case_id: caseId,
                        event_id: row.id,
                        payload: { ...row.payload, caseId },
                        ...writeMeta
                    });
                });

                if (rows.length) {
                    const upsert = await this.sync.client
                        .from(tables.caseEvents)
                        .upsert(rows, { onConflict: 'campaign_id,case_id,event_id' });
                    if (upsert.error) {
                        return { ok: false, error: upsert.error.message || `Failed writing events for ${caseId}.` };
                    }
                }

                if (missingScopeIds.length) {
                    const deleteLookup = await this.resolveDeleteIdsByScope(
                        tables.caseEvents,
                        'event_id',
                        missingScopeIds,
                        [{ column: 'case_id', value: caseId }]
                    );
                    if (!deleteLookup.ok) return deleteLookup;
                    if (deleteLookup.ids.length) {
                        const del = await this.sync.client
                            .from(tables.caseEvents)
                            .delete()
                            .eq('campaign_id', campaignId)
                            .eq('case_id', caseId)
                            .in('event_id', deleteLookup.ids);
                        if (del.error) {
                            return { ok: false, error: del.error.message || `Failed deleting events for ${caseId}.` };
                        }
                    }
                }
            }

            return { ok: true };
        }

        async writeNormalizedScopeVersions(scopes, state, writeMeta) {
            const tables = this.getNormalizedTables();
            const tableName = tables.scopeVersions;
            if (!tableName) return { ok: true };

            const campaignId = this.sync.config.campaignId;
            const scopeSnapshot = buildScopeSnapshot(state);
            const rows = filterCloudSyncScopes(scopes).map((scopeToken) => {
                const scope = normalizeScopeToken(scopeToken);
                if (!scope || scope === SYNC_SCOPE_GLOBAL) return null;
                return {
                    campaign_id: campaignId,
                    scope,
                    exists: scopeSnapshot.has(scope),
                    revision: toNonNegativeInt(writeMeta && writeMeta.revision, 0),
                    updated_at: writeMeta && writeMeta.updated_at ? writeMeta.updated_at : new Date().toISOString(),
                    updated_by: toTrimmedString(writeMeta && writeMeta.updated_by, this.sync.instanceId, 120),
                    updated_by_user: Object.prototype.hasOwnProperty.call(writeMeta || {}, 'updated_by_user')
                        ? (writeMeta.updated_by_user || null)
                        : (this.sync.userId || null),
                    updated_by_name: Object.prototype.hasOwnProperty.call(writeMeta || {}, 'updated_by_name')
                        ? (writeMeta.updated_by_name || null)
                        : (this.sync.config.profileName || null)
                };
            }).filter(Boolean);
            if (!rows.length) return { ok: true };

            const upsert = await this.sync.client
                .from(tableName)
                .upsert(rows, { onConflict: 'campaign_id,scope' });
            if (upsert.error) {
                return { ok: false, error: upsert.error.message || `Failed writing ${tableName}.` };
            }
            return { ok: true };
        }

        async writeNormalizedStateByScopes(state, scopes, meta = {}) {
            if (!this.sync.client) {
                return { ok: false, error: 'Not connected.' };
            }

            const cleanState = sanitizeState(state);
            const plan = this.buildNormalizedScopePlan(scopes, cleanState);
            const writeMeta = this.buildNormalizedWriteMeta(cleanState, meta);
            const tables = this.getNormalizedTables();
            const campaignId = this.sync.config.campaignId;
            const caseIds = Array.isArray(cleanState.cases && cleanState.cases.items)
                ? cleanState.cases.items.map((entry) => entry && entry.id).filter(Boolean)
                : [];

            if (plan.writeCore) {
                const corePayload = {
                    rep: cleanState.campaign.rep,
                    heat: cleanState.campaign.heat,
                    cognitiveRisk: cleanState.campaign.cognitiveRisk,
                    ledger: sanitizeLedgerState(cleanState.campaign.ledger),
                    case: cleanState.campaign.case,
                    context: cleanState.campaignContext,
                    meta: sanitizeCampaignMeta(cleanState.campaignMeta)
                };
                const coreUpsert = await this.sync.client
                    .from(tables.core)
                    .upsert([{
                        campaign_id: campaignId,
                        payload: corePayload,
                        ...writeMeta
                    }], { onConflict: 'campaign_id' });
                if (coreUpsert.error) return { ok: false, error: coreUpsert.error.message || 'Failed writing campaign core.' };
            }

            if (plan.writeHQ) {
                const hqUpsert = await this.sync.client
                    .from(tables.hq)
                    .upsert([{
                        campaign_id: campaignId,
                        payload: cleanState.hq || {},
                        ...writeMeta
                    }], { onConflict: 'campaign_id' });
                if (hqUpsert.error) return { ok: false, error: hqUpsert.error.message || 'Failed writing HQ state.' };
            }

            if (plan.writeCaseState) {
                const caseStateResult = await this.syncCaseStateRows(cleanState, writeMeta);
                if (!caseStateResult.ok) return caseStateResult;
            }

            if (plan.writePlayers) {
                const result = await this.replaceEntityCollection(tables.players, 'player_id', cleanState.campaign.players, writeMeta);
                if (!result.ok) return result;
            } else if (plan.playerIds.size) {
                const result = await this.syncEntityRowsByScopeIds(tables.players, 'player_id', cleanState.campaign.players, plan.playerIds, writeMeta);
                if (!result.ok) return result;
            }
            if (plan.writeNPCs) {
                const result = await this.replaceEntityCollection(tables.npcs, 'npc_id', cleanState.campaign.npcs, writeMeta);
                if (!result.ok) return result;
            } else if (plan.npcIds.size) {
                const result = await this.syncEntityRowsByScopeIds(tables.npcs, 'npc_id', cleanState.campaign.npcs, plan.npcIds, writeMeta);
                if (!result.ok) return result;
            }
            if (plan.writeLocations) {
                const result = await this.replaceEntityCollection(tables.locations, 'location_id', cleanState.campaign.locations, writeMeta);
                if (!result.ok) return result;
            } else if (plan.locationIds.size) {
                const result = await this.syncEntityRowsByScopeIds(tables.locations, 'location_id', cleanState.campaign.locations, plan.locationIds, writeMeta);
                if (!result.ok) return result;
            }
            if (plan.writeRequisitions) {
                const result = await this.replaceEntityCollection(tables.requisitions, 'requisition_id', cleanState.campaign.requisitions, writeMeta);
                if (!result.ok) return result;
            } else if (plan.requisitionIds.size) {
                const result = await this.syncEntityRowsByScopeIds(tables.requisitions, 'requisition_id', cleanState.campaign.requisitions, plan.requisitionIds, writeMeta);
                if (!result.ok) return result;
            }
            if (plan.writeEncounters) {
                const result = await this.replaceEntityCollection(tables.encounters, 'encounter_id', cleanState.campaign.encounters, writeMeta);
                if (!result.ok) return result;
            } else if (plan.encounterIds.size) {
                const result = await this.syncEntityRowsByScopeIds(tables.encounters, 'encounter_id', cleanState.campaign.encounters, plan.encounterIds, writeMeta);
                if (!result.ok) return result;
            }

            const eventIds = plan.writeAllCaseEvents ? caseIds : Array.from(plan.caseEvents.values());
            if (eventIds.length) {
                const eventResult = await this.syncCaseEventsRows(cleanState, eventIds, writeMeta);
                if (!eventResult.ok) return eventResult;
            }
            if (plan.caseEventIds.size) {
                const eventResult = await this.syncCaseEventRowsByScopeIds(cleanState, plan.caseEventIds, writeMeta);
                if (!eventResult.ok) return eventResult;
            }

            const scopeVersionResult = await this.writeNormalizedScopeVersions(scopes, cleanState, writeMeta);
            if (!scopeVersionResult.ok) return scopeVersionResult;

            return { ok: true };
        }

        async pushToCloudNormalized(options = {}, precomputedDirtyScopes = null) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const force = !!opts.force;
            const startAttempt = toNonNegativeInt(opts.attempt, 0);
            let dirtyScopes = precomputedDirtyScopes || this.getDirtyScopesSnapshot(opts.scopes);

            if (!this.sync.client) {
                return { ok: false, reason: 'not-connected' };
            }

            if (this.sync.pushInFlight) {
                this.sync.pushQueued = true;
                this.updateSyncStatus({ pendingPush: true });
                return { ok: false, reason: 'queued' };
            }

            this.sync.pushInFlight = true;
            this.cancelCloudPush();

            try {
                let baseRevision = toNonNegativeInt(
                    opts.baseRevision !== undefined ? opts.baseRevision : (this.state.meta && this.state.meta.syncRevision),
                    toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0)
                );

                for (let attempt = startAttempt; attempt <= 2; attempt += 1) {
                    this.touchSoftLockScopes(dirtyScopes);
                    const blockingLockScopes = dirtyScopes.filter((scope) => isProtectedConflictScope(scope));
                    const lockConflicts = blockingLockScopes.length ? this.getRemoteLockConflicts(blockingLockScopes) : [];
                    if (lockConflicts.length && !force) {
                        this.updateSyncStatus({
                            mode: 'locked',
                            pendingPush: true,
                            message: 'Another player is actively editing one of these scopes.',
                            lastError: ''
                        });
                        return { ok: false, reason: 'locked', locks: lockConflicts };
                    }

                    const fetched = await this.fetchCloudRowNormalizedDelta({
                        silent: true,
                        sinceRevision: baseRevision
                    });
                    if (!fetched.ok) return fetched;
                    const remoteRow = fetched.row;
                    const remoteRevision = remoteRow ? toNonNegativeInt(remoteRow.revision, 0) : 0;
                    if (remoteRow && remoteRow.state) {
                        this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(remoteRow.state));
                    }

                    const pushFilter = this.buildNormalizedPushScopeFilter(remoteRow, dirtyScopes);
                    if (pushFilter.resolvedScopes.length) {
                        if (remoteRow && remoteRow.state) {
                            this.applyMergedRemoteState(remoteRow, pushFilter.remainingDirtyScopes, 'push-filter-remote', {
                                schedulePush: false,
                                clearPendingConflict: false,
                                skipStatus: true
                            });
                        } else {
                            this.replaceLocalDirtyScopes(pushFilter.remainingDirtyScopes, Date.now());
                            this.syncScopeBaselinesFromRemoteRow(remoteRow, pushFilter.resolvedScopes, { skipDirtyScopes: false });
                        }
                        dirtyScopes = pushFilter.remainingDirtyScopes;
                        baseRevision = Math.max(baseRevision, remoteRevision);

                        if (!dirtyScopes.length) {
                            this.clearPendingConflict({ keepStatus: true });
                            this.updateSyncStatus({
                                mode: 'ready',
                                connected: this.hasLiveSyncConnection(),
                                pendingPush: false,
                                message: pushFilter.remoteWinScopes.length
                                    ? 'Kept newer remote row updates.'
                                    : 'Cloud already reflects those row deletions.',
                                lastError: ''
                            });
                            return {
                                ok: true,
                                reason: pushFilter.remoteWinScopes.length ? 'remote-win' : 'already-synced'
                            };
                        }
                    }

                    if (remoteRow && remoteRevision > baseRevision) {
                        const resolution = this.buildNormalizedDirtyScopeResolution(remoteRow, dirtyScopes);
                        const conflict = this.buildConflictRecord(remoteRow, dirtyScopes, {
                            dirtyScopes: resolution.retainedDirtyScopes,
                            remoteChangedScopes: resolution.remoteChangedScopes,
                            overlappingScopes: resolution.protectedOverlapScopes,
                            mergedState: resolution.mergedState,
                            remoteScopeMeta: remoteRow.scopeMeta || null
                        });
                        if (!resolution.protectedOverlapScopes.length) {
                            this.applyMergedRemoteState(remoteRow, resolution.retainedDirtyScopes, 'auto-merge-push', {
                                mergedState: resolution.mergedState,
                                schedulePush: false,
                                clearPendingConflict: false,
                                skipStatus: true
                            });
                            dirtyScopes = resolution.retainedDirtyScopes;
                            baseRevision = conflict.remoteRevision;
                            if (!dirtyScopes.length) {
                                this.clearPendingConflict({ keepStatus: true });
                                this.updateSyncStatus({
                                    mode: 'ready',
                                    connected: this.hasLiveSyncConnection(),
                                    pendingPush: false,
                                    message: 'Kept newer remote row updates.',
                                    lastError: ''
                                });
                                return { ok: true, reason: 'remote-win' };
                            }
                            if (attempt < 2) continue;
                        } else {
                            this.applyMergedRemoteState(remoteRow, resolution.retainedDirtyScopes, 'push-conflict-refresh', {
                                mergedState: resolution.mergedState,
                                schedulePush: false,
                                clearPendingConflict: false,
                                skipStatus: true
                            });
                            this.setPendingConflict(conflict);
                            return { ok: false, reason: 'conflict', conflict: this.getPendingConflict() };
                        }
                    }

                    const mergedForCloud = remoteRow
                        ? mergeStateByScopes(remoteRow.state, this.state, dirtyScopes)
                        : sanitizeState(this.state);
                    const payloadState = stripLocalOnlyFieldsForCloud(mergedForCloud);
                    const nextSig = JSON.stringify(payloadState);
                    const hasLocalDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
                    if (nextSig === this.sync.lastCloudStateSig && !hasLocalDirty) {
                        this.updateSyncStatus({
                            mode: 'ready',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: false
                        });
                        return { ok: true, reason: 'no-change' };
                    }

                    const nextRevision = Math.max(baseRevision, remoteRevision) + 1;
                    const updatedAt = Date.now();
                    payloadState.meta.updated = updatedAt;
                    payloadState.meta.syncRevision = nextRevision;
                    payloadState.meta.scopeUpdated = sanitizeScopeUpdatedMap(this.state.meta && this.state.meta.scopeUpdated);

                    this.state.meta.updated = updatedAt;
                    this.state.meta.syncRevision = nextRevision;
                    this.sync.lastKnownRemoteRevision = nextRevision;

                    const write = await this.writeNormalizedStateByScopes(payloadState, dirtyScopes, {
                        updatedAt,
                        updatedBy: this.sync.instanceId,
                        updatedByUser: this.sync.userId || null,
                        updatedByName: this.sync.config.profileName || null
                    });
                    if (!write.ok) {
                        const message = write.error || 'Cloud push failed.';
                        if (!silent) {
                            this.updateSyncStatus({
                                mode: 'error',
                                connected: this.hasLiveSyncConnection(),
                                pendingPush: false,
                                message: 'Cloud push failed.',
                                lastError: message
                            });
                        }
                        return { ok: false, reason: 'error', error: message };
                    }

                    try {
                        localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                    } catch (writeErr) {
                        console.warn('RTF_STORE: Failed updating local timestamp after cloud push', writeErr);
                    }

                    this.clearLocalDirtyScopes(dirtyScopes);
                    this.syncScopeBaselinesFromLocalState(dirtyScopes, { revision: nextRevision, updatedAt });
                    this.sync.lastPushAt = Date.now();
                    this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(payloadState));
                    this.sync.lastSyncedState = sanitizeState(this.state);
                    this.clearPendingConflict({ keepStatus: true });
                    if (updatedAt > this.sync.lastRemoteSeenAt) this.sync.lastRemoteSeenAt = updatedAt;

                    this.updateSyncStatus({
                        mode: 'ready',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: false,
                        lastPushAt: this.sync.lastPushAt,
                        message: 'Cloud sync updated.',
                        lastError: ''
                    });

                    return { ok: true, revision: nextRevision };
                }

                return { ok: false, reason: 'conflict' };
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: false,
                        message: 'Cloud push failed.',
                        lastError: message
                    });
                }
                return { ok: false, reason: 'error', error: message };
            } finally {
                this.sync.pushInFlight = false;
                if (this.sync.pushQueued) {
                    this.sync.pushQueued = false;
                    this.scheduleCloudPush('queued');
                }
            }
        }

        async pullFromCloud(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const force = !!opts.force;
            const silent = !!opts.silent;
            const access = opts.skipAccessCheck
                ? { ok: !!this.sync.client }
                : await this.ensureCloudAccess({
                    explicit: opts.explicit === true,
                    silent,
                    requirePageSync: opts.requirePageSync === true
                });

            if (!access.ok) {
                return access.reason === 'disabled' || access.reason === 'missing-config' || access.reason === 'page-blocked'
                    ? { ok: false, reason: access.reason, error: access.error || '' }
                    : { ok: false, reason: access.reason || 'not-connected', error: access.error || '' };
            }

            const fetched = (this.isNormalizedReadMode() && !force)
                ? await this.fetchCloudRowNormalizedDelta({ silent })
                : await this.fetchCloudRow({ silent });
            if (!fetched.ok) {
                return fetched;
            }

            if (!fetched.row) {
                return { ok: true, reason: 'empty', applied: false };
            }
            const row = fetched.row;

            this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(row.state));

            const remoteUpdatedAt = toTimestamp(row.updatedAt, 0);
            const remoteRevision = toNonNegativeInt(row.revision, 0);
            const localRevision = toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0);
            const localUpdatedAt = toTimestamp(this.state.meta.updated, 0);
            const hasLocalDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
            const localIsOlder = (remoteRevision > localRevision)
                || (remoteRevision === localRevision && remoteUpdatedAt > localUpdatedAt);
            const dirtyScopes = hasLocalDirty ? this.getDirtyScopesSnapshot() : [];
            if (!force && hasLocalDirty && localIsOlder) {
                if (this.isNormalizedReadMode()) {
                    const resolution = this.buildNormalizedDirtyScopeResolution(row, dirtyScopes);
                    const shouldApplyResolution = !!resolution.remoteChangedScopes.length || !!resolution.remoteResolvedScopes.length;
                    const conflict = this.buildConflictRecord(row, dirtyScopes, {
                        dirtyScopes: resolution.retainedDirtyScopes,
                        remoteChangedScopes: resolution.remoteChangedScopes,
                        overlappingScopes: resolution.protectedOverlapScopes,
                        mergedState: resolution.mergedState,
                        remoteScopeMeta: row.scopeMeta || null
                    });

                    if (shouldApplyResolution) {
                        this.applyMergedRemoteState(row, resolution.retainedDirtyScopes, 'auto-merge-pull', {
                            mergedState: resolution.mergedState,
                            schedulePush: !resolution.protectedOverlapScopes.length,
                            clearPendingConflict: false,
                            skipStatus: !!resolution.protectedOverlapScopes.length,
                            message: resolution.retainedDirtyScopes.length
                                ? 'Merged latest cloud state with remaining local edits.'
                                : 'Applied latest cloud state.'
                        });
                    }

                    if (resolution.protectedOverlapScopes.length) {
                        this.setPendingConflict(conflict);
                        this.sync.lastPullAt = Date.now();
                        return { ok: false, reason: 'conflict', conflict: this.getPendingConflict() };
                    }

                    if (shouldApplyResolution) {
                        this.sync.lastPullAt = Date.now();
                        return {
                            ok: true,
                            reason: resolution.retainedDirtyScopes.length ? 'merged' : 'applied-remote-win',
                            applied: !resolution.retainedDirtyScopes.length,
                            merged: !!resolution.retainedDirtyScopes.length
                        };
                    }
                }

                const latestDirtyAt = this.getLatestDirtyScopeUpdatedAt(dirtyScopes);
                const localDirtyIsOlder = !!latestDirtyAt && !!remoteUpdatedAt && latestDirtyAt <= remoteUpdatedAt;
                if (localDirtyIsOlder) {
                    const appliedStale = this.applyRemoteState(row.state, {
                        source: 'pull-stale-local',
                        updatedAt: remoteUpdatedAt,
                        updatedBy: row.updatedBy,
                        revision: remoteRevision,
                        force: true,
                        scopeMeta: row.scopeMeta || null
                    });
                    if (appliedStale) {
                        this.sync.lastPullAt = Date.now();
                        this.updateSyncStatus({
                            lastPullAt: this.sync.lastPullAt,
                            mode: 'ready',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: false,
                            message: 'Pulled latest cloud state (local was older).'
                        });
                    }
                    return { ok: true, reason: appliedStale ? 'applied-stale-local' : 'skipped-stale-local', applied: appliedStale };
                }

                const conflict = this.buildConflictRecord(row, dirtyScopes);
                if (conflict.overlappingScopes.length) {
                    this.setPendingConflict(conflict);
                    return { ok: false, reason: 'conflict', conflict: this.getPendingConflict() };
                }
                this.adoptMergedConflictState(conflict, 'auto-merge-pull');
                this.sync.lastPullAt = Date.now();
                return { ok: true, reason: 'merged', applied: false, merged: true };
            }
            const shouldApply = force || localIsOlder;

            if (!shouldApply) {
                if (hasLocalDirty && (localRevision > remoteRevision || localUpdatedAt > remoteUpdatedAt)) {
                    this.scheduleCloudPush('catch-up');
                }
                this.sync.lastPullAt = Date.now();
                this.sync.lastKnownRemoteRevision = Math.max(this.sync.lastKnownRemoteRevision, remoteRevision);
                this.updateSyncStatus({
                    lastPullAt: this.sync.lastPullAt,
                    mode: 'ready',
                    connected: this.hasLiveSyncConnection(),
                    pendingPush: false
                });
                return { ok: true, reason: 'up-to-date', applied: false };
            }

            const applied = this.applyRemoteState(row.state, {
                source: 'pull',
                updatedAt: remoteUpdatedAt,
                updatedBy: row.updatedBy,
                revision: remoteRevision,
                scopeMeta: row.scopeMeta || null,
                force
            });

            if (applied) {
                this.sync.lastPullAt = Date.now();
                this.updateSyncStatus({
                    lastPullAt: this.sync.lastPullAt,
                    mode: 'ready',
                    connected: this.hasLiveSyncConnection(),
                    pendingPush: false,
                    message: 'Pulled latest cloud state.'
                });
            }

            return { ok: true, reason: applied ? 'applied' : 'skipped', applied };
        }

        async pushToCloud(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const force = !!opts.force;
            const startAttempt = toNonNegativeInt(opts.attempt, 0);
            const dirtyScopes = this.getDirtyScopesSnapshot(opts.scopes);
            const access = await this.ensureCloudAccess({
                explicit: opts.explicit === true,
                silent,
                requirePageSync: opts.requirePageSync === true
            });
            if (!access.ok) {
                return { ok: false, reason: access.reason || 'not-connected', error: access.error || '' };
            }

            if (this.isNormalizedReadMode()) {
                return this.pushToCloudNormalized(opts, dirtyScopes);
            }

            if (this.sync.pushInFlight) {
                this.sync.pushQueued = true;
                this.updateSyncStatus({ pendingPush: true });
                return { ok: false, reason: 'queued' };
            }

            this.sync.pushInFlight = true;
            this.cancelCloudPush();

            try {
                const config = this.sync.config;
                let baseRevision = toNonNegativeInt(
                    opts.baseRevision !== undefined ? opts.baseRevision : (this.state.meta && this.state.meta.syncRevision),
                    toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0)
                );

                for (let attempt = startAttempt; attempt <= 2; attempt += 1) {
                    this.touchSoftLockScopes(dirtyScopes);
                    const lockConflicts = this.getRemoteLockConflicts(dirtyScopes);
                    if (lockConflicts.length && !force) {
                        this.updateSyncStatus({
                            mode: 'locked',
                            pendingPush: true,
                            message: 'Another player is actively editing one of these scopes.',
                            lastError: ''
                        });
                        return { ok: false, reason: 'locked', locks: lockConflicts };
                    }

                    const fetched = await this.fetchCloudRow({ silent: true });
                    if (!fetched.ok) return fetched;
                    const remoteRow = fetched.row;
                    const remoteRevision = remoteRow ? toNonNegativeInt(remoteRow.revision, 0) : 0;

                    if (remoteRow && remoteRevision > baseRevision) {
                        const conflict = this.buildConflictRecord(remoteRow, dirtyScopes);
                        if (!conflict.overlappingScopes.length && attempt < 2) {
                            this.state = sanitizeState(conflict.mergedState);
                            this.syncActiveCaseLegacyState();
                            this.ensureCampaignEntityIds(false);
                            this.markLocalDirtyScopes(dirtyScopes, Date.now());
                            try {
                                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                            } catch (writeErr) {
                                console.warn('RTF_STORE: Failed writing merged local state', writeErr);
                            }
                            baseRevision = conflict.remoteRevision;
                            continue;
                        }
                        this.setPendingConflict(conflict);
                        return { ok: false, reason: 'conflict', conflict: this.getPendingConflict() };
                    }

                    // Build cloud payload additively: keep remote scopes we did not edit locally.
                    const mergedForCloud = remoteRow
                        ? mergeStateByScopes(remoteRow.state, this.state, dirtyScopes)
                        : sanitizeState(this.state);
                    const payloadState = stripLocalOnlyFieldsForCloud(mergedForCloud);
                    const nextSig = JSON.stringify(payloadState);
                    const hasLocalDirty = !!(this.sync.localDirtyScopes && this.sync.localDirtyScopes.size);
                    if (nextSig === this.sync.lastCloudStateSig && !hasLocalDirty) {
                        this.updateSyncStatus({
                            mode: 'ready',
                            connected: this.hasLiveSyncConnection(),
                            pendingPush: false
                        });
                        return { ok: true, reason: 'no-change' };
                    }

                    const nextRevision = Math.max(baseRevision, remoteRevision) + 1;
                    const updatedAt = Date.now();
                    payloadState.meta.updated = updatedAt;
                    payloadState.meta.syncRevision = nextRevision;
                    payloadState.meta.scopeUpdated = sanitizeScopeUpdatedMap(this.state.meta && this.state.meta.scopeUpdated);

                    this.state.meta.updated = updatedAt;
                    this.state.meta.syncRevision = nextRevision;
                    this.sync.lastKnownRemoteRevision = nextRevision;

                    const rowPayload = {
                        campaign_id: config.campaignId,
                        state: payloadState,
                        updated_at: new Date(updatedAt).toISOString(),
                        updated_by: this.sync.instanceId,
                        updated_by_user: this.sync.userId || null,
                        updated_by_name: config.profileName || null
                    };

                    let result = null;
                    let written = null;
                    if (remoteRow) {
                        result = await this.sync.client
                            .from(config.tableName)
                            .update(rowPayload)
                            .eq('campaign_id', config.campaignId)
                            .eq('updated_at', remoteRow.updatedAtRaw)
                            .select('state,updated_at,updated_by,updated_by_name');
                        if (result.error) {
                            const message = result.error.message || 'Cloud push failed.';
                            if (!silent) {
                                this.updateSyncStatus({
                                    mode: 'error',
                                    connected: this.hasLiveSyncConnection(),
                                    pendingPush: false,
                                    message: 'Cloud push failed.',
                                    lastError: message
                                });
                            }
                            return { ok: false, reason: 'error', error: message };
                        }
                        if (Array.isArray(result.data) && result.data.length) written = result.data[0];
                        else if (result.data && typeof result.data === 'object') written = result.data;
                    } else {
                        result = await this.sync.client
                            .from(config.tableName)
                            .insert(rowPayload)
                            .select('state,updated_at,updated_by,updated_by_name')
                            .maybeSingle();
                        if (result.error) {
                            const code = result.error.code || '';
                            if (code !== '23505') {
                                const message = result.error.message || 'Cloud push failed.';
                                if (!silent) {
                                    this.updateSyncStatus({
                                        mode: 'error',
                                        connected: this.hasLiveSyncConnection(),
                                        pendingPush: false,
                                        message: 'Cloud push failed.',
                                        lastError: message
                                    });
                                }
                                return { ok: false, reason: 'error', error: message };
                            }
                        } else {
                            written = result.data;
                        }
                    }

                    if (!written) {
                        const latest = await this.fetchCloudRow({ silent: true });
                        if (!latest.ok) return latest;
                        if (!latest.row) return { ok: false, reason: 'conflict' };
                        const conflict = this.buildConflictRecord(latest.row, dirtyScopes);
                        if (!conflict.overlappingScopes.length && attempt < 2) {
                            this.state = sanitizeState(conflict.mergedState);
                            this.syncActiveCaseLegacyState();
                            this.ensureCampaignEntityIds(false);
                            this.markLocalDirtyScopes(dirtyScopes, Date.now());
                            try {
                                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                            } catch (writeErr) {
                                console.warn('RTF_STORE: Failed writing merged local state', writeErr);
                            }
                            baseRevision = conflict.remoteRevision;
                            continue;
                        }
                        this.setPendingConflict(conflict);
                        return { ok: false, reason: 'conflict', conflict: this.getPendingConflict() };
                    }

                    try {
                        localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                    } catch (writeErr) {
                        console.warn('RTF_STORE: Failed updating local timestamp after cloud push', writeErr);
                    }

                    this.clearLocalDirtyScopes(dirtyScopes);
                    this.sync.lastPushAt = Date.now();
                    this.sync.lastCloudStateSig = JSON.stringify(stripLocalOnlyFieldsForCloud(payloadState));
                    this.sync.lastSyncedState = sanitizeState(this.state);
                    this.clearPendingConflict({ keepStatus: true });
                    const seenAt = toTimestamp(written.updated_at, this.sync.lastPushAt);
                    if (seenAt > this.sync.lastRemoteSeenAt) this.sync.lastRemoteSeenAt = seenAt;

                    this.updateSyncStatus({
                        mode: 'ready',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: false,
                        lastPushAt: this.sync.lastPushAt,
                        message: 'Cloud sync updated.',
                        lastError: ''
                    });

                    if (this.isNormalizedMirrorMode()) {
                        this.writeNormalizedStateByScopes(payloadState, dirtyScopes, {
                            updatedAt,
                            updatedBy: this.sync.instanceId,
                            updatedByUser: this.sync.userId || null,
                            updatedByName: config.profileName || null
                        }).catch((mirrorErr) => {
                            console.warn('RTF_STORE: Normalized mirror write failed', mirrorErr);
                        });
                    }

                    return { ok: true, revision: nextRevision };
                }

                return { ok: false, reason: 'conflict' };
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                if (!silent) {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: this.hasLiveSyncConnection(),
                        pendingPush: false,
                        message: 'Cloud push failed.',
                        lastError: message
                    });
                }
                return { ok: false, reason: 'error', error: message };
            } finally {
                this.sync.pushInFlight = false;
                if (this.sync.pushQueued) {
                    this.sync.pushQueued = false;
                    this.scheduleCloudPush('queued');
                }
            }
        }

        applyRemoteState(remoteState, meta = {}) {
            const cleaned = mergeRemoteBoardWithLocalLayout(remoteState, this.state);
            const localUpdated = toTimestamp(this.state.meta.updated, 0);
            const remoteUpdated = toTimestamp(meta.updatedAt, toTimestamp(cleaned.meta.updated, Date.now()));
            const localRevision = toNonNegativeInt(this.state.meta && this.state.meta.syncRevision, 0);
            const remoteRevision = toNonNegativeInt(meta.revision, toNonNegativeInt(cleaned.meta && cleaned.meta.syncRevision, 0));

            if (!meta.force && remoteRevision && remoteRevision < localRevision) return false;
            const shouldApplyByRevision = remoteRevision ? remoteRevision > localRevision : false;
            if (!meta.force && !shouldApplyByRevision && remoteUpdated <= localUpdated) return false;

            this.isApplyingRemote = true;
            cleaned.meta.updated = remoteUpdated;
            cleaned.meta.syncRevision = remoteRevision || toNonNegativeInt(cleaned.meta.syncRevision, 0);
            this.state = cleaned;
            this.ensureCampaignEntityIds(false);
            this.syncActiveCaseLegacyState();

            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch (err) {
                console.error('RTF_STORE: Failed writing remote state locally', err);
            }

            this.isApplyingRemote = false;
            this.sync.lastKnownRemoteRevision = Math.max(this.sync.lastKnownRemoteRevision, toNonNegativeInt(this.state.meta.syncRevision, 0));
            this.sync.lastSyncedState = sanitizeState(this.state);
            if (meta.clearDirty !== false) this.clearLocalDirtyScopes();
            if (meta.scopeMeta || this.isNormalizedReadMode()) {
                this.syncScopeBaselinesFromRemoteRow({
                    state: sanitizeState(remoteState),
                    revision: remoteRevision,
                    updatedAt: remoteUpdated,
                    updatedBy: meta.updatedBy || '',
                    scopeMeta: meta.scopeMeta || null
                }, null, { skipDirtyScopes: false });
            }
            if (this.sync.pendingConflict && remoteRevision >= toNonNegativeInt(this.sync.pendingConflict.remoteRevision, 0)) {
                this.sync.pendingConflict = null;
            }
            this.broadcastStoreUpdate(meta.source || 'remote', {
                updatedAt: remoteUpdated,
                updatedBy: meta.updatedBy || '',
                revision: toNonNegativeInt(this.state.meta.syncRevision, 0)
            });
            return true;
        }

        broadcastStoreUpdate(source = 'local', meta = {}) {
            const payload = meta && typeof meta === 'object' ? meta : {};
            const detail = {
                ...payload,
                source,
                timestamp: Date.now()
            };

            if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
                global.dispatchEvent(new CustomEvent(STORE_UPDATED_EVENT, { detail }));
            }

            if (isExternalStoreUpdateSource(source)) this.refreshKnownViews();
        }

        refreshKnownViews() {
            const handlers = ['render', 'renderRequisitions', 'renderTimeline', 'renderEncounters', 'renderCaseSwitcher', 'renderLedger'];
            handlers.forEach((name) => {
                const fn = global[name];
                if (typeof fn === 'function') {
                    try {
                        fn();
                    } catch (err) {
                        console.warn(`RTF_STORE: failed refreshing ${name}`, err);
                    }
                }
            });
        }

        // --- Helper Accessors ---
        addPlayer(player) {
            const source = player && typeof player === 'object' ? player : {};
            const generatedId = 'player_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
            const playerId = toTrimmedString(source.id || generatedId, generatedId, 80);
            this.state.campaign.players.push(sanitizePlayer({
                id: playerId,
                name: toTrimmedString(source.name || 'New Agent', 'New Agent', 160),
                ac: Math.max(0, Math.min(999, Math.round(toNumber(source.ac, 10)))),
                init: Math.max(-99, Math.min(999, Math.round(toNumber(source.init, 0)))),
                hp: sanitizePlayerHp(source.hp, '10'),
                pp: Math.max(0, Math.min(999, Math.round(toNumber(source.pp, 10)))),
                dc: Math.max(0, Math.min(999, Math.round(toNumber(source.dc, 10)))),
                dp: Math.max(0, Math.min(4, Math.round(toNumber(source.dp, 2)))),
                projectClock: Math.max(0, Math.min(6, Math.round(toNumber(source.projectClock, 0)))),
                projectName: toTrimmedString(source.projectName, '', 240),
                projectReward: toTrimmedString(source.projectReward, '', 240),
                imageUrl: toSharedVTTMediaUrl(source.imageUrl)
            }, this.state.campaign.players.length));
            const scope = buildPlayerEntityScope(playerId);
            this.save({
                scope: [
                    scope || CAMPAIGN_ENTITY_SCOPE_PREFIXES.players,
                    buildEntityOrderScope(CAMPAIGN_ENTITY_SCOPE_PREFIXES.players)
                ]
            });
        }

        updatePlayer(id, updates) {
            const list = this.getPlayers();
            const idx = list.findIndex((player) => player && player.id === id);
            if (idx < 0) return null;

            const patch = sanitizePatch(updates, {
                name: (v) => toTrimmedString(v || 'New Agent', 'New Agent', 160),
                sheetKey: (v) => toTrimmedString(v, '', 120).trim(),
                ac: (v) => Math.max(0, Math.min(999, Math.round(toNumber(v, list[idx].ac ?? 10)))),
                init: (v) => Math.max(-99, Math.min(999, Math.round(toNumber(v, list[idx].init ?? 0)))),
                hp: (v) => sanitizePlayerHp(v, list[idx].hp ?? '10'),
                pp: (v) => Math.max(0, Math.min(999, Math.round(toNumber(v, list[idx].pp ?? 10)))),
                dc: (v) => Math.max(0, Math.min(999, Math.round(toNumber(v, list[idx].dc ?? 10)))),
                dp: (v) => Math.max(0, Math.min(4, Math.round(toNumber(v, list[idx].dp ?? 2)))),
                projectClock: (v) => Math.max(0, Math.min(6, Math.round(toNumber(v, list[idx].projectClock ?? 0)))),
                projectName: (v) => toTrimmedString(v, '', 240),
                projectReward: (v) => toTrimmedString(v, '', 240),
                imageUrl: (v) => toSharedVTTMediaUrl(v)
            });
            if (!patch) return deepClone(list[idx]);

            list[idx] = sanitizePlayer({
                ...list[idx],
                ...patch
            }, idx);

            const scope = buildPlayerEntityScope(id);
            this.save({ scope: scope || CAMPAIGN_ENTITY_SCOPE_PREFIXES.players });
            return deepClone(list[idx]);
        }

        addNPC(npc) {
            const source = npc && typeof npc === 'object' ? { ...npc } : {};
            const fallbackId = buildEntityId('npc');
            source.id = toTrimmedString(source.id, fallbackId, 80);
            if (Object.prototype.hasOwnProperty.call(source, 'imageUrl')) {
                source.imageUrl = toImageUrl(source.imageUrl);
            }
            const stamp = this.getMutationStamp();
            source.lastChangedBy = stamp.lastChangedBy;
            source.lastChangedAt = stamp.lastChangedAt;
            this.state.campaign.npcs.push(source);
            const scope = buildNPCEntityScope(source.id);
            this.save({ scope: scope || 'campaign.npcs' });
        }

        ensurePlayerIds(persist = true) {
            if (!this.state.campaign || !Array.isArray(this.state.campaign.players)) {
                return { mutated: false, scopes: [] };
            }
            let mutated = false;
            const touchedScopes = new Set();
            const seenIds = new Set();
            const seenScopeIds = new Set();
            this.state.campaign.players.forEach((p, idx) => {
                if (!p || typeof p !== 'object') return;

                let candidate = toTrimmedString(p.id, '', 80).trim();
                let scopeId = normalizeEntityScopeId(candidate);
                if (!candidate || !scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN || seenIds.has(candidate) || seenScopeIds.has(scopeId)) {
                    let bump = 0;
                    do {
                        candidate = buildEntityId('player', idx, bump);
                        scopeId = normalizeEntityScopeId(candidate);
                        bump += 1;
                    } while (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN || seenIds.has(candidate) || seenScopeIds.has(scopeId));
                }

                if (p.id !== candidate) {
                    p.id = candidate;
                    mutated = true;
                    const scope = buildPlayerEntityScope(candidate);
                    if (scope) touchedScopes.add(scope);
                }

                seenIds.add(candidate);
                seenScopeIds.add(scopeId);
            });

            if (mutated && persist) {
                try {
                    const scopes = Array.from(touchedScopes.values());
                    this.save({ scope: scopes.length ? scopes : 'campaign.players' });
                } catch (err) {
                    console.warn('RTF_STORE: Failed to persist player IDs', err);
                }
            }
            return { mutated, scopes: Array.from(touchedScopes.values()) };
        }

        ensureCampaignEntityIds(persist = true) {
            const playerIdResult = this.ensurePlayerIds(false);
            if (!this.state.campaign || typeof this.state.campaign !== 'object') {
                return { mutated: false, scopes: [] };
            }

            let mutated = !!(playerIdResult && playerIdResult.mutated);
            const touchedScopes = new Set(playerIdResult && Array.isArray(playerIdResult.scopes) ? playerIdResult.scopes : []);
            const ensureListIds = (list, prefix, scopeBuilder = null) => {
                if (!Array.isArray(list)) return;
                const seen = new Set();
                const seenScopeIds = new Set();

                list.forEach((entry, idx) => {
                    if (!entry || typeof entry !== 'object') return;

                    let candidate = toTrimmedString(entry.id, '', 80).trim();
                    let scopeId = normalizeEntityScopeId(candidate);
                    if (candidate && scopeId && scopeId !== ENTITY_SCOPE_ORDER_TOKEN && !seen.has(candidate) && !seenScopeIds.has(scopeId)) {
                        if (entry.id !== candidate) {
                            entry.id = candidate;
                            mutated = true;
                            if (typeof scopeBuilder === 'function') {
                                const scope = scopeBuilder(candidate);
                                if (scope) touchedScopes.add(scope);
                            }
                        }
                        seen.add(candidate);
                        seenScopeIds.add(scopeId);
                        return;
                    }

                    let bump = 0;
                    do {
                        candidate = buildEntityId(prefix, idx, bump);
                        scopeId = normalizeEntityScopeId(candidate);
                        bump += 1;
                    } while (!scopeId || scopeId === ENTITY_SCOPE_ORDER_TOKEN || seen.has(candidate) || seenScopeIds.has(scopeId));

                    entry.id = candidate;
                    seen.add(candidate);
                    seenScopeIds.add(scopeId);
                    mutated = true;
                    if (typeof scopeBuilder === 'function') {
                        const scope = scopeBuilder(candidate);
                        if (scope) touchedScopes.add(scope);
                    }
                });
            };

            ensureListIds(this.state.campaign.npcs, 'npc', buildNPCEntityScope);
            ensureListIds(this.state.campaign.locations, 'loc', buildLocationEntityScope);
            ensureListIds(this.state.campaign.requisitions, 'req', buildRequisitionEntityScope);
            ensureListIds(this.state.campaign.encounters, 'enc', buildEncounterEntityScope);
            this.state.campaignMeta = sanitizeCampaignMeta(this.state.campaignMeta);
            ensureListIds(this.state.campaignMeta.events, 'event', buildCampaignMetaEventEntityScope);

            if (mutated && persist) {
                try {
                    const scopes = Array.from(touchedScopes.values());
                    this.save({
                        scope: scopes.length
                            ? scopes
                            : ['campaign.players', 'campaign.npcs', 'campaign.locations', 'campaign.requisitions', 'campaign.encounters', CAMPAIGN_META_EVENTS_SCOPE_PREFIX]
                    });
                } catch (err) {
                    console.warn('RTF_STORE: Failed to persist campaign entity IDs', err);
                }
            }
            return { mutated, scopes: Array.from(touchedScopes.values()) };
        }

        getPlayers() {
            if (!this.state.campaign.players) this.state.campaign.players = [];
            return this.state.campaign.players;
        }

        async refreshNPCDirectoryForVTT(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const force = !!opts.force;
            const ttlMs = Math.max(0, toNonNegativeInt(opts.ttlMs, 5 * 60 * 1000));
            const config = sanitizeSyncConfig(this.sync && this.sync.config ? this.sync.config : getMergedSyncConfig());
            if (!config.enabled || !config.supabaseUrl || !config.anonKey || !config.campaignId) {
                return { ok: false, reason: 'missing-config', count: this.getNPCs().length };
            }

            const cacheKey = `${VTT_NPC_REFRESH_META_KEY}:${config.campaignId}`;
            const now = Date.now();
            if (!force && ttlMs > 0) {
                try {
                    const raw = localStorage.getItem(cacheKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        const fetchedAt = toTimestamp(parsed && parsed.fetchedAt, 0);
                        if (fetchedAt && (now - fetchedAt) < ttlMs) {
                            return { ok: true, reason: 'cached', count: this.getNPCs().length, fetchedAt };
                        }
                    }
                } catch (err) { }
            }

            const tableName = config.normalizedNPCsTable || DEFAULT_SYNC_CONFIG.normalizedNPCsTable;
            const url = new URL(`/rest/v1/${tableName}`, config.supabaseUrl);
            url.searchParams.set('select', 'npc_id,payload,revision,updated_at,updated_by,updated_by_name');
            url.searchParams.set('campaign_id', `eq.${config.campaignId}`);
            url.searchParams.set('order', 'npc_id.asc');

            let response;
            try {
                response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        apikey: config.anonKey,
                        Authorization: `Bearer ${config.anonKey}`,
                        Accept: 'application/json'
                    },
                    cache: 'no-store'
                });
            } catch (err) {
                return {
                    ok: false,
                    reason: 'network-error',
                    error: err && err.message ? err.message : 'NPC refresh failed.',
                    count: this.getNPCs().length
                };
            }

            if (!response.ok) {
                let message = `NPC refresh failed (${response.status}).`;
                try {
                    const errorPayload = await response.json();
                    if (errorPayload && errorPayload.message) message = String(errorPayload.message);
                } catch (err) { }
                return { ok: false, reason: 'http-error', error: message, count: this.getNPCs().length };
            }

            let rows = [];
            try {
                const payload = await response.json();
                rows = Array.isArray(payload) ? payload : [];
            } catch (err) {
                return { ok: false, reason: 'parse-error', error: 'NPC refresh returned invalid JSON.', count: this.getNPCs().length };
            }

            const existing = Array.isArray(this.state.campaign && this.state.campaign.npcs)
                ? this.state.campaign.npcs.slice()
                : [];
            const remoteIds = new Set();
            const remoteNPCs = rows.map((row) => {
                const npcId = toTrimmedString(row && row.npc_id, buildEntityId('npc'), 80);
                const payload = this.ensureEntityId(row && row.payload, npcId, 'id');
                payload.__rtfSource = 'cloud';
                remoteIds.add(normalizeEntityScopeId(payload && payload.id));
                return payload;
            });
            const merged = existing.filter((npc) => {
                const scopeId = normalizeEntityScopeId(npc && npc.id);
                if (!scopeId) return true;
                if (npc && npc.__rtfSource === 'cloud' && !remoteIds.has(scopeId)) return false;
                return !remoteIds.has(scopeId);
            });
            merged.push(...remoteNPCs);
            this.state.campaign.npcs = merged;

            try {
                localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: now, count: remoteNPCs.length }));
            } catch (err) { }

            this.save({ scope: 'campaign.npcs', skipCloud: true });
            this.clearLocalDirtyScopes(['campaign.npcs', buildEntityOrderScope(CAMPAIGN_ENTITY_SCOPE_PREFIXES.npcs)]);
            this.sync.lastSyncedState = sanitizeState(this.state);
            this.broadcastStoreUpdate('local', {
                scopes: ['campaign.npcs'],
                reason: 'vtt-npc-refresh'
            });

            return {
                ok: true,
                reason: 'refreshed',
                count: this.getNPCs().length,
                remoteCount: remoteNPCs.length,
                fetchedAt: now
            };
        }

        getNPCs() {
            return this.state.campaign.npcs || [];
        }

        getLocations() {
            return this.state.campaign.locations || [];
        }

        getLedgerState() {
            if (!this.state.campaign || typeof this.state.campaign !== 'object') {
                this.state.campaign = sanitizeCampaign(null);
            }
            this.state.campaign.ledger = sanitizeLedgerState(this.state.campaign.ledger);
            return this.state.campaign.ledger;
        }

        getLedgerEntries(caseId = null) {
            const ledger = this.getLedgerState();
            const list = Array.isArray(ledger.entries) ? ledger.entries : [];
            if (!caseId) return list;
            const cleanCaseId = sanitizeCaseId(caseId, this.getActiveCaseId());
            return list.filter((entry) => entry && entry.caseId === cleanCaseId);
        }

        addLedgerEntry(entry) {
            const ledger = this.getLedgerState();
            const source = entry && typeof entry === 'object' ? entry : {};
            const caseId = sanitizeCaseId(source.caseId, this.getActiveCaseId());
            const nowIso = new Date().toISOString();
            const stamp = this.getMutationStamp(nowIso);
            const normalized = sanitizeLedgerEntry({
                ...source,
                caseId,
                createdAt: sanitizeAttributionAt(source.createdAt, nowIso) || nowIso,
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            }, ledger.entries.length);
            if (!normalized.statement) return '';
            ledger.entries.push(normalized);
            this.save({ scope: 'campaign.ledger' });
            return normalized.id;
        }

        updateLedgerEntry(id, updates) {
            const ledger = this.getLedgerState();
            const list = Array.isArray(ledger.entries) ? ledger.entries : [];
            const targetId = toTrimmedString(id, '', 80).trim();
            if (!targetId) return;
            const idx = list.findIndex((entry) => String(entry && entry.id || '') === targetId);
            if (idx < 0) return;
            const patch = sanitizePatch(updates, {
                caseId: (v) => sanitizeCaseId(v, list[idx].caseId || this.getActiveCaseId()),
                statement: (v) => toTrimmedString(v, '', 1200).trim(),
                sourceType: (v) => sanitizeLedgerSourceType(v, list[idx].sourceType || 'other'),
                sourceId: (v) => toTrimmedString(v, '', 120).trim(),
                tags: (v) => toTrimmedString(v, '', 1200),
                notes: (v) => toTrimmedString(v, '', 4000),
                createdAt: (v) => sanitizeAttributionAt(v, list[idx].createdAt || '')
            });
            if (!patch) return;
            const stamp = this.getMutationStamp();
            const current = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
            const next = sanitizeLedgerEntry({
                ...current,
                ...patch,
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            }, idx);
            if (!next.statement) return;
            list[idx] = next;
            this.save({ scope: 'campaign.ledger' });
        }

        deleteLedgerEntry(id) {
            const ledger = this.getLedgerState();
            const list = Array.isArray(ledger.entries) ? ledger.entries : [];
            const targetId = toTrimmedString(id, '', 80).trim();
            if (!targetId) return;
            const idx = list.findIndex((entry) => String(entry && entry.id || '') === targetId);
            if (idx < 0) return;
            list.splice(idx, 1);
            this.save({ scope: 'campaign.ledger' });
        }

        updateLedgerUI(patch) {
            const ledger = this.getLedgerState();
            const updates = patch && typeof patch === 'object' ? patch : {};
            ledger.ui = sanitizeLedgerUI({ ...(ledger.ui || {}), ...updates });
            this.save({ scope: 'campaign.ledger' });
        }

        getStableLedgerEntries(caseId = null) {
            return this.getLedgerEntries(caseId).filter((entry) => entry && entry.status === 'stable');
        }

        getStableFacts(caseId = null) {
            const facts = [];
            const seen = new Set();
            this.getStableLedgerEntries(caseId).forEach((entry) => {
                const statement = toTrimmedString(entry && entry.statement, '', 1200).trim();
                if (!statement) return;
                const key = statement.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                facts.push(statement);
            });
            return facts;
        }

        // Requisitions
        getRequisitions() {
            return this.state.campaign.requisitions || [];
        }

        addRequisition(req) {
            const source = req && typeof req === 'object' ? req : {};
            const stamp = this.getMutationStamp();
            const sanitized = {
                id: toTrimmedString(source.id || ('req_' + Date.now()), 'req_' + Date.now(), 80),
                item: toTrimmedString(source.item, '', 240),
                requester: toTrimmedString(source.requester, '', 160),
                guild: toTrimmedString(source.guild, '', 120),
                priority: REQUISITION_PRIORITIES.has(toTrimmedString(source.priority, '', 40))
                    ? toTrimmedString(source.priority, 'Routine', 40)
                    : 'Routine',
                status: REQUISITION_STATUSES.has(toTrimmedString(source.status, '', 40))
                    ? toTrimmedString(source.status, 'Pending', 40)
                    : 'Pending',
                value: toTrimmedString(source.value, '', 120),
                imageUrl: toImageUrl(source.imageUrl),
                purpose: toTrimmedString(source.purpose, '', 4000),
                notes: toTrimmedString(source.notes, '', 4000),
                tags: toTrimmedString(source.tags, '', 4000),
                created: sanitizeAttributionAt(source.created, new Date().toISOString()) || new Date().toISOString(),
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            };
            this.getRequisitions().push(sanitized);
            const scope = buildRequisitionEntityScope(sanitized.id);
            this.save({ scope: scope || 'campaign.requisitions' });
            return sanitized.id;
        }

        updateRequisition(id, updates) {
            const list = this.getRequisitions();
            const idx = list.findIndex(r => r.id === id);
            if (idx >= 0) {
                const patch = sanitizePatch(updates, {
                    item: (v) => toTrimmedString(v, '', 240),
                    requester: (v) => toTrimmedString(v, '', 160),
                    guild: (v) => toTrimmedString(v, '', 120),
                    priority: (v) => {
                        const normalized = toTrimmedString(v, '', 40);
                        return REQUISITION_PRIORITIES.has(normalized) ? normalized : 'Routine';
                    },
                    status: (v) => {
                        const normalized = toTrimmedString(v, '', 40);
                        return REQUISITION_STATUSES.has(normalized) ? normalized : 'Pending';
                    },
                    value: (v) => toTrimmedString(v, '', 120),
                    imageUrl: (v) => toImageUrl(v),
                    purpose: (v) => toTrimmedString(v, '', 4000),
                    notes: (v) => toTrimmedString(v, '', 4000),
                    tags: (v) => toTrimmedString(v, '', 4000),
                    created: (v) => sanitizeAttributionAt(v, list[idx].created || '')
                });
                if (!patch) return;
                const stamp = this.getMutationStamp();
                list[idx] = {
                    ...list[idx],
                    ...patch,
                    lastChangedBy: stamp.lastChangedBy,
                    lastChangedAt: stamp.lastChangedAt
                };
                const scope = buildRequisitionEntityScope(id);
                this.save({ scope: scope || 'campaign.requisitions' });
            }
        }

        deleteRequisition(id) {
            const list = this.getRequisitions();
            const idx = list.findIndex(r => r.id === id);
            if (idx >= 0) {
                list.splice(idx, 1);
                const scope = buildRequisitionEntityScope(id);
                this.save({ scope: scope || 'campaign.requisitions' });
            }
        }

        // Campaign Meta Timeline + Board
        getCampaignMetaEvents() {
            const meta = this.ensureCampaignMetaIntegrity();
            return meta.events;
        }

        addCampaignMetaEvent(evt) {
            const source = evt && typeof evt === 'object' ? evt : {};
            const events = this.getCampaignMetaEvents();
            const stamp = this.getMutationStamp();
            const safeEvent = sanitizeEvent({
                ...source,
                caseId: 'campaign_meta',
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            }, events.length);
            events.push(safeEvent);
            const scope = buildCampaignMetaEventEntityScope(safeEvent.id);
            this.save({ scope: scope || CAMPAIGN_META_EVENTS_SCOPE_PREFIX });
            return safeEvent.id;
        }

        updateCampaignMetaEvent(id, updates) {
            const list = this.getCampaignMetaEvents();
            const idx = list.findIndex((entry) => entry && entry.id === id);
            if (idx < 0) return;
            const patch = sanitizePatch(updates, {
                title: (v) => toTrimmedString(v, '', 240),
                focus: (v) => toTrimmedString(v, '', 240),
                heatDelta: (v) => toTrimmedString(v, '', 12),
                tags: (v) => toTrimmedString(v, '', 2000),
                imageUrl: (v) => toImageUrl(v),
                highlights: (v) => toTrimmedString(v, '', 6000),
                fallout: (v) => toTrimmedString(v, '', 6000),
                followUp: (v) => toTrimmedString(v, '', 6000),
                source: (v) => toTrimmedString(v, '', 80),
                kind: (v) => toTrimmedString(v, '', 80),
                resolved: (v) => toBoolean(v),
                created: (v) => sanitizeAttributionAt(v, list[idx].created || ''),
                impactSeverity: (v) => sanitizeImpactSeverity(v, list[idx].impactSeverity || 'moderate'),
                impactScope: (v) => sanitizeImpactScope(v, list[idx].impactScope || 'local'),
                certainty: (v) => clampPercent(v, list[idx].certainty)
            });
            if (!patch) return;
            const stamp = this.getMutationStamp();
            list[idx] = sanitizeEvent({
                ...list[idx],
                ...patch,
                caseId: 'campaign_meta',
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            }, idx);
            const eventId = toTrimmedString(list[idx].id || id, toTrimmedString(id, '', 80), 80);
            const scope = buildCampaignMetaEventEntityScope(eventId);
            this.save({ scope: scope || CAMPAIGN_META_EVENTS_SCOPE_PREFIX });
        }

        deleteCampaignMetaEvent(id) {
            const list = this.getCampaignMetaEvents();
            const idx = list.findIndex((entry) => entry && entry.id === id);
            if (idx < 0) return;
            const deleted = list[idx];
            const eventId = toTrimmedString(deleted && deleted.id ? deleted.id : id, toTrimmedString(id, '', 80), 80);
            list.splice(idx, 1);
            const scope = buildCampaignMetaEventEntityScope(eventId);
            this.save({ scope: scope || CAMPAIGN_META_EVENTS_SCOPE_PREFIX });
        }

        queueRoomHydration(key, loader) {
            if (!key || typeof loader !== 'function') return null;
            if (!(this.sync.roomHydrationInflight instanceof Map)) this.sync.roomHydrationInflight = new Map();
            if (!(this.sync.roomHydrationSeenAt instanceof Map)) this.sync.roomHydrationSeenAt = new Map();
            if (this.sync.roomHydrationInflight.has(key)) return this.sync.roomHydrationInflight.get(key);
            const lastSeenAt = toTimestamp(this.sync.roomHydrationSeenAt.get(key), 0);
            const now = Date.now();
            if (now - lastSeenAt < 15000) return null;
            this.sync.roomHydrationSeenAt.set(key, now);
            const promise = Promise.resolve()
                .then(() => loader())
                .catch((err) => {
                    console.warn('RTF_STORE: Room hydration failed', err);
                    return null;
                })
                .finally(() => {
                    if (this.sync.roomHydrationInflight instanceof Map) {
                        this.sync.roomHydrationInflight.delete(key);
                    }
                });
            this.sync.roomHydrationInflight.set(key, promise);
            return promise;
        }

        maybeHydrateBoardRoom(options = {}) {
            const cfg = this.sync && this.sync.config ? this.sync.config : null;
            if (!cfg || !cfg.enabled || !cfg.supabaseUrl || !cfg.anonKey || !cfg.campaignId) return null;
            if (isBoardPage()) return null;
            const target = this.resolveBoardRoomTarget(options);
            const key = `board:${target.scope}:${target.caseId || 'campaign'}`;
            return this.queueRoomHydration(key, async () => {
                const result = await this.loadBoardRoomSnapshot(target);
                if (!result || !result.ok || !result.snapshot) return result;
                this.mirrorBoardSnapshotToState({
                    roomId: result.roomId,
                    scope: result.snapshot.scope || target.scope,
                    caseId: result.snapshot.caseId || target.caseId,
                    payload: result.snapshot.payload,
                    updatedAt: result.snapshot.updatedAt,
                    source: 'room-hydrate'
                });
                return result;
            });
        }

        maybeHydrateVTTRoom(caseId = null) {
            const cfg = this.sync && this.sync.config ? this.sync.config : null;
            if (!cfg || !cfg.enabled || !cfg.supabaseUrl || !cfg.anonKey || !cfg.campaignId) return null;
            if (isVTTPage()) return null;
            const target = this.resolveVTTRoomTarget({ caseId });
            const key = `vtt:${target.caseId}`;
            return this.queueRoomHydration(key, async () => {
                const result = await this.loadVTTRoomSnapshot(target);
                if (!result || !result.ok || !result.snapshot) return result;
                this.mirrorVTTSnapshotToState({
                    roomId: result.roomId,
                    caseId: result.snapshot.caseId || target.caseId,
                    payload: result.snapshot.payload,
                    updatedAt: result.snapshot.updatedAt,
                    source: 'room-hydrate'
                });
                return result;
            });
        }

        getCampaignMetaBoard() {
            const meta = this.ensureCampaignMetaIntegrity();
            meta.board = sanitizeBoard(meta.board);
            this.maybeHydrateBoardRoom({ scope: 'campaign' });
            return meta.board;
        }

        updateCampaignMetaBoard(boardState, options = {}) {
            const meta = this.ensureCampaignMetaIntegrity();
            const opts = options && typeof options === 'object' ? options : {};
            meta.board = sanitizeBoard(boardState);
            this.save({
                scope: 'campaign.meta.board',
                skipCloud: !!opts.skipCloud,
                skipEvent: !!opts.skipEvent
            });
        }

        clearCampaignMetaBoard() {
            const meta = this.ensureCampaignMetaIntegrity();
            meta.board = sanitizeBoard(DEFAULT_CAMPAIGN_META_BOARD_STATE);
            this.save({ scope: 'campaign.meta.board' });
        }

        getLeads(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return [];
            entry.leads = sanitizeLeadList(entry.leads);
            return entry.leads;
        }

        setLeads(leads, caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return [];
            entry.leads = sanitizeLeadList(leads);
            this.syncActiveCaseLegacyState();
            this.save({ scope: `cases.${entry.id}.leads` });
            return deepClone(entry.leads);
        }

        // Mission Events
        getEvents(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            return entry ? entry.events : [];
        }

        addEvent(evt, caseId = null) {
            const source = evt && typeof evt === 'object' ? evt : {};
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return '';
            const stamp = this.getMutationStamp();
            const safeEvent = sanitizeEvent({
                ...source,
                caseId: entry.id,
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            }, entry.events.length);
            entry.events.push(safeEvent);
            this.syncActiveCaseLegacyState();
            const scope = buildCaseEventEntityScope(entry.id, safeEvent.id);
            this.save({ scope: scope || `cases.${entry.id}.events` });
            return safeEvent.id;
        }

        updateEvent(id, updates, caseId = null) {
            const list = this.getEvents(caseId);
            const idx = list.findIndex(e => e.id === id);
            if (idx >= 0) {
                const patch = sanitizePatch(updates, {
                    title: (v) => toTrimmedString(v, '', 240),
                    focus: (v) => toTrimmedString(v, '', 240),
                    heatDelta: (v) => toTrimmedString(v, '', 12),
                    tags: (v) => toTrimmedString(v, '', 2000),
                    imageUrl: (v) => toImageUrl(v),
                    highlights: (v) => toTrimmedString(v, '', 6000),
                    fallout: (v) => toTrimmedString(v, '', 6000),
                    followUp: (v) => toTrimmedString(v, '', 6000),
                    source: (v) => toTrimmedString(v, '', 80),
                    kind: (v) => toTrimmedString(v, '', 80),
                    resolved: (v) => toBoolean(v),
                    created: (v) => sanitizeAttributionAt(v, list[idx].created || ''),
                    impactSeverity: (v) => sanitizeImpactSeverity(v, list[idx].impactSeverity || 'moderate'),
                    impactScope: (v) => sanitizeImpactScope(v, list[idx].impactScope || 'local'),
                    certainty: (v) => clampPercent(v, list[idx].certainty)
                });
                if (!patch) return;
                const activeCase = this.getCaseEntry(caseId);
                const scopeId = activeCase && activeCase.id ? activeCase.id : this.getActiveCaseId();
                const stamp = this.getMutationStamp();
                list[idx] = sanitizeEvent({
                    ...list[idx],
                    ...patch,
                    caseId: scopeId,
                    lastChangedBy: stamp.lastChangedBy,
                    lastChangedAt: stamp.lastChangedAt
                }, idx);
                this.syncActiveCaseLegacyState();
                const eventId = toTrimmedString(list[idx].id || id, toTrimmedString(id, '', 80), 80);
                const scope = buildCaseEventEntityScope(scopeId, eventId);
                this.save({ scope: scope || `cases.${scopeId}.events` });
            }
        }

        deleteEvent(id, caseId = null) {
            const list = this.getEvents(caseId);
            const idx = list.findIndex(e => e.id === id);
            if (idx >= 0) {
                const deleted = list[idx];
                const eventId = toTrimmedString(deleted && deleted.id ? deleted.id : id, toTrimmedString(id, '', 80), 80);
                list.splice(idx, 1);
                this.syncActiveCaseLegacyState();
                const activeCase = this.getCaseEntry(caseId);
                const scopeId = activeCase && activeCase.id ? activeCase.id : this.getActiveCaseId();
                const scope = buildCaseEventEntityScope(scopeId, eventId);
                this.save({ scope: scope || `cases.${scopeId}.events` });
            }
        }

        // Encounter Recipes
        getEncounters() {
            return this.state.campaign.encounters || [];
        }

        addEncounter(enc) {
            const source = enc && typeof enc === 'object' ? enc : {};
            const stamp = this.getMutationStamp();
            const safeEncounter = {
                id: toTrimmedString(source.id || ('enc_' + Date.now()), 'enc_' + Date.now(), 80),
                title: toTrimmedString(source.title, '', 240),
                tier: ENCOUNTER_TIERS.has(toTrimmedString(source.tier, '', 40))
                    ? toTrimmedString(source.tier, 'Routine', 40)
                    : 'Routine',
                location: toTrimmedString(source.location, '', 240),
                objective: toTrimmedString(source.objective, '', 2000),
                opposition: toTrimmedString(source.opposition, '', 6000),
                hazards: toTrimmedString(source.hazards, '', 6000),
                beats: toTrimmedString(source.beats, '', 6000),
                rewards: toTrimmedString(source.rewards, '', 6000),
                notes: toTrimmedString(source.notes, '', 6000),
                created: sanitizeAttributionAt(source.created, new Date().toISOString()) || new Date().toISOString(),
                lastChangedBy: stamp.lastChangedBy,
                lastChangedAt: stamp.lastChangedAt
            };
            this.getEncounters().push(safeEncounter);
            const scope = buildEncounterEntityScope(safeEncounter.id);
            this.save({ scope: scope || 'campaign.encounters' });
            return safeEncounter.id;
        }

        updateEncounter(id, updates) {
            const list = this.getEncounters();
            const idx = list.findIndex(e => e.id === id);
            if (idx >= 0) {
                const patch = sanitizePatch(updates, {
                    title: (v) => toTrimmedString(v, '', 240),
                    tier: (v) => {
                        const normalized = toTrimmedString(v, '', 40);
                        return ENCOUNTER_TIERS.has(normalized) ? normalized : 'Routine';
                    },
                    location: (v) => toTrimmedString(v, '', 240),
                    objective: (v) => toTrimmedString(v, '', 2000),
                    opposition: (v) => toTrimmedString(v, '', 6000),
                    hazards: (v) => toTrimmedString(v, '', 6000),
                    beats: (v) => toTrimmedString(v, '', 6000),
                    rewards: (v) => toTrimmedString(v, '', 6000),
                    notes: (v) => toTrimmedString(v, '', 6000),
                    created: (v) => sanitizeAttributionAt(v, list[idx].created || '')
                });
                if (!patch) return;
                const stamp = this.getMutationStamp();
                list[idx] = {
                    ...list[idx],
                    ...patch,
                    lastChangedBy: stamp.lastChangedBy,
                    lastChangedAt: stamp.lastChangedAt
                };
                const scope = buildEncounterEntityScope(id);
                this.save({ scope: scope || 'campaign.encounters' });
            }
        }

        deleteEncounter(id) {
            const list = this.getEncounters();
            const idx = list.findIndex(e => e.id === id);
            if (idx >= 0) {
                list.splice(idx, 1);
                const scope = buildEncounterEntityScope(id);
                this.save({ scope: scope || 'campaign.encounters' });
            }
        }

        getVTTState(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return sanitizeVTTState(null);
            entry.vtt = sanitizeVTTState(entry.vtt);
            this.maybeHydrateVTTRoom(entry.id);
            return entry.vtt;
        }

        getVTTStateUpdatedAt(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry || !this.state || !this.state.meta || !this.state.meta.scopeUpdated) return 0;
            const scope = `cases.${entry.id}.vtt`;
            return Math.max(0, toNonNegativeInt(this.state.meta.scopeUpdated[scope], 0));
        }

        getVTTLocalPrefsStorageKey() {
            return VTT_LOCAL_PREFS_KEY;
        }

        getVTTLocalRole(caseId = null) {
            const targetCaseId = sanitizeCaseId(caseId, this.getActiveCaseId());
            const prefsMap = parseVTTLocalPrefsMap();
            const entry = prefsMap[targetCaseId];
            return sanitizeVTTRolePreference(entry && entry.role);
        }

        setVTTLocalRole(role, caseId = null) {
            const targetCaseId = sanitizeCaseId(caseId, this.getActiveCaseId());
            const prefsMap = parseVTTLocalPrefsMap();
            const next = sanitizeVTTLocalPrefsEntry({ role });
            if (next.role === 'player') delete prefsMap[targetCaseId];
            else prefsMap[targetCaseId] = next;
            try {
                localStorage.setItem(VTT_LOCAL_PREFS_KEY, JSON.stringify(prefsMap));
            } catch (err) {
                console.warn('RTF_STORE: Failed to persist local VTT role preference', err);
            }
            return next.role;
        }

        normalizeVTTStateSnapshot(vttState) {
            return sanitizeVTTState(vttState);
        }

        upsertVTTInitiativeEntry(entryInput, caseId = null, options = {}) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return sanitizeVTTState(null);

            const opts = options && typeof options === 'object' ? options : {};
            const nextVTT = sanitizeVTTState(entry.vtt);
            nextVTT.updatedAt = Math.max(0, toNonNegativeInt(opts.updatedAt, Date.now()) || Date.now());
            const nextEntry = sanitizeVTTInitiativeEntry(entryInput, nextVTT.initiative.entries.length);
            const entryScope = buildCaseVTTInitiativeEntryScope(entry.id, nextEntry);
            const targetScopeId = buildVTTInitiativeEntryScopeId(nextEntry);

            if (!entryScope || !targetScopeId) {
                const fallbackIdx = nextVTT.initiative.entries.findIndex((candidate) => String(candidate && candidate.id || '') === String(nextEntry.id || ''));
                if (fallbackIdx >= 0) nextVTT.initiative.entries[fallbackIdx] = nextEntry;
                else nextVTT.initiative.entries.push(nextEntry);
                sortVTTInitiativeEntries(nextVTT.initiative.entries);
                if (opts.setActiveIfEmpty !== false && !nextVTT.initiative.activeEntryId && nextVTT.initiative.entries[0]) {
                    nextVTT.initiative.activeEntryId = nextVTT.initiative.entries[0].id;
                }
                entry.vtt = sanitizeVTTState(nextVTT);
                this.save({ scope: `cases.${entry.id}.vtt` });
                return entry.vtt;
            }

            const existingIdx = findVTTInitiativeEntryIndexByScopeId(nextVTT.initiative.entries, targetScopeId);
            if (existingIdx >= 0) nextVTT.initiative.entries[existingIdx] = nextEntry;
            else nextVTT.initiative.entries.push(nextEntry);
            sortVTTInitiativeEntries(nextVTT.initiative.entries);

            const scopes = [entryScope];
            if (opts.setActiveIfEmpty !== false && !nextVTT.initiative.activeEntryId && nextVTT.initiative.entries[0]) {
                nextVTT.initiative.activeEntryId = nextVTT.initiative.entries[0].id;
                scopes.push(buildCaseVTTInitiativeActiveScope(entry.id));
            }

            entry.vtt = sanitizeVTTState(nextVTT);
            this.save({ scope: scopes });
            return entry.vtt;
        }

        updateVTTState(vttState, caseId = null, options = {}) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return sanitizeVTTState(null);
            const opts = options && typeof options === 'object' ? options : {};
            const nextUpdatedAt = Math.max(
                0,
                toNonNegativeInt(
                    Object.prototype.hasOwnProperty.call(opts, 'updatedAt')
                        ? opts.updatedAt
                        : Date.now(),
                    Date.now()
                ) || Date.now()
            );
            entry.vtt = sanitizeVTTState({
                ...(vttState && typeof vttState === 'object' ? vttState : {}),
                updatedAt: nextUpdatedAt
            });
            this.save({
                scope: `cases.${entry.id}.vtt`,
                skipCloud: !!opts.skipCloud,
                skipEvent: !!opts.skipEvent
            });
            return entry.vtt;
        }

        getBoard(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return sanitizeBoard(null);
            entry.board = sanitizeBoard(entry.board);
            this.maybeHydrateBoardRoom({ scope: 'case', caseId: entry.id });
            if (!caseId || entry.id === this.getActiveCaseId()) this.syncActiveCaseLegacyState();
            return entry.board;
        }

        updateBoard(boardState, caseId = null, options = {}) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return;
            const opts = options && typeof options === 'object' ? options : {};
            entry.board = sanitizeBoard(boardState);
            this.syncActiveCaseLegacyState();
            this.save({
                scope: `cases.${entry.id}.board`,
                skipCloud: !!opts.skipCloud,
                skipEvent: !!opts.skipEvent
            });
        }

        clearBoard(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return;
            entry.board = sanitizeBoard(null);
            this.syncActiveCaseLegacyState();
            this.save({ scope: `cases.${entry.id}.board` });
        }

        mirrorBoardSnapshotToState(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const clean = sanitizeBoard(opts.payload);
            const scopes = [];

            if (scope === 'campaign') {
                const meta = this.ensureCampaignMetaIntegrity();
                meta.board = clean;
                scopes.push('campaign.meta.board');
            } else {
                const entry = this.getCaseEntry(opts.caseId, { createIfMissing: true });
                if (!entry) return false;
                entry.board = clean;
                scopes.push(`cases.${entry.id}.board`);
            }

            this.syncActiveCaseLegacyState();

            try {
                const now = toTimestamp(opts.updatedAt, Date.now()) || Date.now();
                if (!this.state.meta || typeof this.state.meta !== 'object') {
                    this.state.meta = { version: 1, created: now, updated: now, syncRevision: 0, scopeUpdated: {} };
                }
                if (!this.state.meta.scopeUpdated || typeof this.state.meta.scopeUpdated !== 'object') {
                    this.state.meta.scopeUpdated = {};
                }
                this.state.meta.updated = now;
                scopes.forEach((scopeToken) => {
                    this.state.meta.scopeUpdated[scopeToken] = now;
                });
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                this.broadcastStoreUpdate(opts.source || 'board-collab', {
                    scopes,
                    roomId: toTrimmedString(opts.roomId, '', 160).trim()
                });
                return true;
            } catch (err) {
                console.warn('RTF_STORE: Failed mirroring board collaboration snapshot', err);
                return false;
            }
        }

        mirrorVTTSnapshotToState(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveVTTRoomTarget(opts);
            const clean = sanitizeVTTState(opts.payload);
            const entry = this.getCaseEntry(target.caseId, { createIfMissing: true });
            if (!entry) return false;

            const current = sanitizeVTTState(entry.vtt);
            if (stableStringify(current) === stableStringify(clean)) return false;

            entry.vtt = clean;
            const scopes = [`cases.${entry.id}.vtt`];

            try {
                const now = toTimestamp(opts.updatedAt, Date.now()) || Date.now();
                if (!this.state.meta || typeof this.state.meta !== 'object') {
                    this.state.meta = { version: 1, created: now, updated: now, syncRevision: 0, scopeUpdated: {} };
                }
                if (!this.state.meta.scopeUpdated || typeof this.state.meta.scopeUpdated !== 'object') {
                    this.state.meta.scopeUpdated = {};
                }
                this.state.meta.updated = now;
                scopes.forEach((scopeToken) => {
                    this.state.meta.scopeUpdated[scopeToken] = now;
                });
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                this.broadcastStoreUpdate(opts.source || 'vtt-collab', {
                    scopes,
                    roomId: target.roomId
                });
                return true;
            } catch (err) {
                console.warn('RTF_STORE: Failed mirroring VTT collaboration snapshot', err);
                return false;
            }
        }

        buildLLMSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const mode = String(opts.mode || 'compact').trim().toLowerCase() === 'full' ? 'full' : 'compact';
            const target = String(opts.target || opts.scope || 'campaign').trim().toLowerCase() === 'case' ? 'case' : 'campaign';
            const includeGM = !!opts.includeGM;
            const includeSheets = !!opts.includeSheets;
            const state = sanitizeState(this.state);
            const campaign = state.campaign || sanitizeCampaign(null);
            let activeCaseId = state.cases && state.cases.activeCaseId ? state.cases.activeCaseId : 'case_primary';
            const cases = Array.isArray(state.cases && state.cases.items) ? state.cases.items : [];
            const activeCaseEntry = cases.find((entry) => sanitizeCaseId(entry && entry.id, '') === sanitizeCaseId(activeCaseId, 'case_primary')) || cases[0] || null;
            if (activeCaseEntry && activeCaseEntry.id) activeCaseId = sanitizeCaseId(activeCaseEntry.id, activeCaseId);
            const snapshotCases = (target === 'case' && activeCaseEntry) ? [activeCaseEntry] : cases;
            const nowIso = new Date().toISOString();

            const mapTheories = (board) => {
                const nodes = Array.isArray(board && board.nodes) ? board.nodes : [];
                const theories = [];
                nodes.forEach((node) => {
                    if (!node || typeof node !== 'object') return;
                    if (String(node.type || '').toLowerCase() !== 'theory') return;
                    const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
                    const theoryStatus = normalizeEnumToken(meta.theoryStatus);
                    theories.push({
                        id: toTrimmedString(node.id, '', 120),
                        title: toTrimmedString(node.title, 'Theory', 240),
                        certainty: clampPercent(meta.certainty !== undefined ? meta.certainty : meta.confidence, 50),
                        reliability: sanitizeReliability(meta.reliability, 'unknown'),
                        status: (theoryStatus === 'confirmed' || theoryStatus === 'disproven') ? theoryStatus : 'unproven',
                        lastChangedBy: sanitizeAttributionBy(meta.lastChangedBy, ''),
                        lastChangedAt: sanitizeAttributionAt(meta.lastChangedAt, '')
                    });
                });
                return mode === 'compact' ? theories.slice(0, 12) : theories;
            };

            const eventFromSnapshot = (eventEntry) => {
                const baseEvent = sanitizeEvent(eventEntry, 0);
                const event = { ...baseEvent };
                delete event.impactSeverity;
                delete event.impactScope;
                delete event.certainty;
                delete event.lastChangedBy;
                delete event.lastChangedAt;
                delete event.created;
                if (mode === 'full') {
                    return event;
                }
                return {
                    id: event.id,
                    title: event.title,
                    resolved: !!event.resolved,
                    heatDelta: event.heatDelta,
                    focus: event.focus,
                    tags: event.tags,
                    highlights: toTrimmedString(event.highlights, '', 800),
                    fallout: toTrimmedString(event.fallout, '', 800),
                    followUp: toTrimmedString(event.followUp, '', 800)
                };
            };

            const caseItems = snapshotCases.map((caseEntry) => {
                const entry = caseEntry && typeof caseEntry === 'object' ? caseEntry : {};
                const board = sanitizeBoard(entry.board);
                const events = sanitizeEventList(entry.events).map((event) => ({
                    ...event,
                    caseId: sanitizeCaseId(event.caseId || entry.id, entry.id || activeCaseId)
                }));
                const orderedEvents = events.slice();
                const unresolvedIds = orderedEvents
                    .filter((event) => !event.resolved)
                    .slice(-25)
                    .map((event) => event.id);
                const remainingSlots = Math.max(0, 25 - unresolvedIds.length);
                const resolvedIds = remainingSlots > 0
                    ? orderedEvents
                        .filter((event) => event.resolved)
                        .slice(-remainingSlots)
                        .map((event) => event.id)
                    : [];
                const compactEventIds = new Set(unresolvedIds.concat(resolvedIds));
                const compactEvents = orderedEvents.filter((event) => compactEventIds.has(event.id));
                return {
                    id: sanitizeCaseId(entry.id, 'case_primary'),
                    name: sanitizeCaseName(entry.name, DEFAULT_CASE_NAME),
                    events: (mode === 'full' ? orderedEvents : compactEvents).map(eventFromSnapshot),
                    boardSummary: {
                        nodes: Array.isArray(board.nodes) ? board.nodes.length : 0,
                        connections: Array.isArray(board.connections) ? board.connections.length : 0,
                        theories: mapTheories(board)
                    }
                };
            });

            const allEvents = caseItems.flatMap((entry) => Array.isArray(entry.events) ? entry.events.map((event) => ({
                ...event,
                caseId: entry.id,
                caseName: entry.name
            })) : []);
            const openEvents = allEvents.filter((event) => !event.resolved);
            const activeConsequences = openEvents.filter((event) => {
                const heat = parseInt(event.heatDelta, 10);
                return (!Number.isNaN(heat) && heat !== 0) || !!toTrimmedString(event.fallout, '', 800);
            });

            const ledger = sanitizeLedgerState(campaign.ledger);
            const ledgerSourceEntries = target === 'case'
                ? ledger.entries.filter((entry) => String(entry && entry.caseId || '') === activeCaseId)
                : ledger.entries;
            const stableFacts = target === 'case' ? this.getStableFacts(activeCaseId) : this.getStableFacts();
            const compactLedgerEntries = ledgerSourceEntries
                .filter((entry) => entry.status === 'stable' || entry.status === 'contested')
                .map((entry) => ({
                    id: entry.id,
                    caseId: entry.caseId,
                    statement: entry.statement,
                    status: entry.status,
                    sourceType: entry.sourceType,
                    sourceId: entry.sourceId,
                    certainty: entry.certainty,
                    tags: entry.tags,
                    lastChangedBy: entry.lastChangedBy,
                    lastChangedAt: entry.lastChangedAt
                }));
            const ledgerEntries = mode === 'full' ? ledgerSourceEntries : compactLedgerEntries;

            const compactEntity = (list, mapper) => {
                const source = Array.isArray(list) ? list : [];
                return source.map((entry) => mapper(entry && typeof entry === 'object' ? entry : {}));
            };

            const entities = mode === 'full'
                ? {
                    players: deepClone(Array.isArray(campaign.players) ? campaign.players : []),
                    npcs: deepClone(Array.isArray(campaign.npcs) ? campaign.npcs : []),
                    locations: deepClone(Array.isArray(campaign.locations) ? campaign.locations : []),
                    requisitions: deepClone(Array.isArray(campaign.requisitions) ? campaign.requisitions : []),
                    encounters: deepClone(Array.isArray(campaign.encounters) ? campaign.encounters : [])
                }
                : {
                    players: compactEntity(campaign.players, (entry) => ({
                        id: toTrimmedString(entry.id, '', 80),
                        name: toTrimmedString(entry.name, '', 160),
                        sheetKey: toTrimmedString(entry.sheetKey, '', 120),
                        dp: toNumber(entry.dp, 0),
                        hp: entry.hp,
                        ac: toNumber(entry.ac, 0),
                        init: toNumber(entry.init, 0),
                        pp: toNumber(entry.pp, 0),
                        dc: toNumber(entry.dc, 0)
                    })),
                    npcs: compactEntity(campaign.npcs, (entry) => ({
                        id: toTrimmedString(entry.id, '', 80),
                        name: toTrimmedString(entry.name, '', 160),
                        guild: toTrimmedString(entry.guild, '', 120),
                        wants: toTrimmedString(entry.wants, '', 200),
                        trust: toNumber(entry.trust, 2),
                        stigma: toNumber(entry.stigma, 0),
                        lastChangedBy: sanitizeAttributionBy(entry.lastChangedBy, ''),
                        lastChangedAt: sanitizeAttributionAt(entry.lastChangedAt, '')
                    })),
                    locations: compactEntity(campaign.locations, (entry) => ({
                        id: toTrimmedString(entry.id, '', 80),
                        name: toTrimmedString(entry.name, '', 160),
                        district: toTrimmedString(entry.district, '', 120),
                        trust: toNumber(entry.trust, 2),
                        stigma: toNumber(entry.stigma, 0),
                        lastChangedBy: sanitizeAttributionBy(entry.lastChangedBy, ''),
                        lastChangedAt: sanitizeAttributionAt(entry.lastChangedAt, '')
                    })),
                    requisitions: compactEntity(campaign.requisitions, (entry) => ({
                        id: toTrimmedString(entry.id, '', 80),
                        item: toTrimmedString(entry.item, '', 240),
                        status: toTrimmedString(entry.status, '', 80),
                        priority: toTrimmedString(entry.priority, '', 80),
                        requester: toTrimmedString(entry.requester, '', 160),
                        lastChangedBy: sanitizeAttributionBy(entry.lastChangedBy, ''),
                        lastChangedAt: sanitizeAttributionAt(entry.lastChangedAt, '')
                    })),
                    encounters: compactEntity(campaign.encounters, (entry) => ({
                        id: toTrimmedString(entry.id, '', 80),
                        title: toTrimmedString(entry.title, '', 240),
                        tier: toTrimmedString(entry.tier, '', 80),
                        location: toTrimmedString(entry.location, '', 240),
                        lastChangedBy: sanitizeAttributionBy(entry.lastChangedBy, ''),
                        lastChangedAt: sanitizeAttributionAt(entry.lastChangedAt, '')
                    }))
                };

            const leadCases = {};
            caseItems.forEach((entry) => {
                if (!entry || !entry.id) return;
                const leads = sanitizeLeadList(entry.leads);
                if (!leads.length) return;
                leadCases[entry.id] = leads;
            });
            if (!Object.keys(leadCases).length) {
                const leadStore = readJsonStorage(LEAD_STORAGE_KEY, {});
                const legacyLeadCases = leadStore && typeof leadStore === 'object' ? leadStore : {};
                Object.keys(legacyLeadCases).forEach((key) => {
                    const caseId = sanitizeCaseId(key, '');
                    if (!caseId) return;
                    const leads = sanitizeLeadList(legacyLeadCases[key]);
                    if (!leads.length) return;
                    leadCases[caseId] = leads;
                });
            }
            const filteredLeadCases = target === 'case'
                ? (leadCases[activeCaseId] ? { [activeCaseId]: leadCases[activeCaseId] } : {})
                : leadCases;
            const prepProcedureState = readJsonStorage(PREP_PROCEDURE_STATE_KEY, null) || {
                prep: { filled: 0, total: 4 },
                procedure: { filled: 0, total: 4 },
                tokens: { count: 0, max: 6 }
            };
            const clocksState = readJsonStorage(CLOCKS_STORAGE_KEY, []);
            const timelineAutoHeatSync = localStorage.getItem(HEAT_SYNC_KEY) !== 'false';

            const pressure = [];
            if (toNumber(campaign.heat, 0) >= 3) pressure.push('Heat in complication range (3-5).');
            if (toNumber(campaign.heat, 0) >= 6) pressure.push('Heat critical: hard constraints active.');
            if (toNumber(campaign.cognitiveRisk, 0) >= 2) pressure.push('Cognitive risk drift is active.');
            if (!pressure.length) pressure.push('World pressure currently stable.');

            const immediateComplications = [];
            if (activeConsequences.length) immediateComplications.push('Open events with heat or fallout are active.');
            if (!immediateComplications.length) immediateComplications.push('No urgent complications flagged.');

            const openThreads = openEvents
                .slice(0, mode === 'full' ? 50 : 12)
                .map((event) => toTrimmedString(event.title, '', 240))
                .filter(Boolean);

            const attributionRecords = [];
            const pushAttribution = (kind, record, titleField = 'title') => {
                if (!record || typeof record !== 'object') return;
                const lastChangedAt = sanitizeAttributionAt(record.lastChangedAt, '');
                const lastChangedBy = sanitizeAttributionBy(record.lastChangedBy, '');
                if (!lastChangedAt && !lastChangedBy) return;
                attributionRecords.push({
                    kind,
                    id: toTrimmedString(record.id, '', 120),
                    title: toTrimmedString(record[titleField], '', 240),
                    lastChangedBy,
                    lastChangedAt
                });
            };

            caseItems.forEach((entry) => {
                (entry.events || []).forEach((event) => pushAttribution('event', event, 'title'));
                const theories = entry.boardSummary && Array.isArray(entry.boardSummary.theories) ? entry.boardSummary.theories : [];
                theories.forEach((theory) => pushAttribution('theory', theory, 'title'));
            });
            ledger.entries.forEach((entry) => pushAttribution('ledger', entry, 'statement'));
            (campaign.requisitions || []).forEach((entry) => pushAttribution('requisition', entry, 'item'));
            (campaign.encounters || []).forEach((entry) => pushAttribution('encounter', entry, 'title'));
            (campaign.npcs || []).forEach((entry) => pushAttribution('npc', entry, 'name'));
            (campaign.locations || []).forEach((entry) => pushAttribution('location', entry, 'name'));

            attributionRecords.sort((left, right) => toTimestamp(right.lastChangedAt, 0) - toTimestamp(left.lastChangedAt, 0));
            const attributionByActor = {};
            attributionRecords.forEach((record) => {
                const key = record.lastChangedBy || 'unknown';
                attributionByActor[key] = (attributionByActor[key] || 0) + 1;
            });

            const snapshot = {
                schema: 'rtf_llm_snapshot_v2',
                generatedAt: nowIso,
                source: {
                    mode,
                    target,
                    activeCaseId,
                    appVersion: toTrimmedString(global.RTF_APP_VERSION || 'local-dev', 'local-dev', 80)
                },
                campaign: {
                    heat: toNumber(campaign.heat, 0),
                    cognitiveRisk: toNumber(campaign.cognitiveRisk, 0),
                    rep: sanitizeRep(campaign.rep),
                    caseTemplate: sanitizeCase(campaign.case)
                },
                cases: {
                    activeCaseId,
                    items: caseItems
                },
                entities,
                ledger: {
                    entries: ledgerEntries,
                    stableFacts
                },
                sidecar: {
                    leadsByCase: filteredLeadCases,
                    prepProcedure: prepProcedureState,
                    clocks: mode === 'full' ? (Array.isArray(clocksState) ? clocksState : []) : (Array.isArray(clocksState) ? clocksState.slice(0, 25) : []),
                    timelineAutoHeatSync
                },
                signals: {
                    worldPressure: pressure,
                    immediateComplications,
                    openThreads,
                    active_consequences: activeConsequences.map((event) => ({
                        id: event.id,
                        title: event.title,
                        caseId: event.caseId,
                        heatDelta: event.heatDelta,
                        fallout: toTrimmedString(event.fallout, '', 240)
                    }))
                },
                attributionSummary: {
                    totalRecords: attributionRecords.length,
                    byActor: attributionByActor,
                    latest: attributionRecords.slice(0, mode === 'full' ? 30 : 10)
                },
                llmHints: {
                    writingGoal: 'prose consequences + situational descriptions',
                    focusWindow: 'next scene to next session'
                }
            };

            if (includeGM || includeSheets) {
                snapshot.optional = {};
                if (includeGM) {
                    const gmState = readJsonStorage('gmDashboardData', null);
                    snapshot.optional.gm = gmState ? { available: true, data: gmState } : { available: false, data: {} };
                }
                if (includeSheets) {
                    snapshot.optional.sheets = { available: false, data: [] };
                }
            }

            return snapshot;
        }

        exportLLMSnapshot(options = {}) {
            const snapshot = this.buildLLMSnapshot(options);
            const target = snapshot && snapshot.source ? snapshot.source.target : 'campaign';
            const mode = snapshot && snapshot.source ? snapshot.source.mode : 'compact';
            const date = new Date().toISOString().slice(0, 10);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `rtf_llm_snapshot_v2_${target}_${mode}_${date}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            return snapshot;
        }

        getHQLayout() {
            this.state.hq = sanitizeHQ(this.state.hq);
            return deepClone(this.state.hq);
        }

        updateHQLayout(hqState) {
            this.state.hq = sanitizeHQ(hqState);
            this.save({ scope: 'hq' });
        }
    }

    global.RTF_STORE = new Store();

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
