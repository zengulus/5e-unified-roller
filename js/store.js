(function (global) {
    const STORE_KEY = 'ravnica_unified_v1';
    const LEGACY_HUB_KEY = 'ravnicaHubV3_2';
    const LEGACY_BOARD_KEY = 'invBoardData';
    const DIRTY_SCOPES_KEY = 'ravnica_sync_dirty_scopes_v1';
    const SCOPE_BASELINES_KEY = 'ravnica_sync_scope_baselines_v1';

    const SYNC_CONFIG_KEY = 'ravnica_sync_config_v1';
    const SYNC_STATUS_EVENT = 'rtf-sync-status';
    const SYNC_CONFLICT_EVENT = 'rtf-sync-conflict';
    const STORE_UPDATED_EVENT = 'rtf-store-updated';
    const LEAD_STORAGE_KEY = 'rtf_lead_queue_v1';
    const PREP_PROCEDURE_STATE_KEY = 'rtf_prep_procedure_state_v1';
    const CLOCKS_STORAGE_KEY = 'rtf_clocks_page_v1';
    const HEAT_SYNC_KEY = 'rtf_timeline_auto_heat';
    const HQ_LOCAL_STORAGE_KEY = 'task_force_hq_v1';
    const AUTO_CONNECT_CANCEL_KEY = 'rtf_sync_autoconnect_cancelled';
    const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const STORE_DEBUG = false;

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
    const isExternalStoreUpdateSource = (value) => value === 'remote' || value === 'storage';

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
                    leads: []
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
        normalizedPlayersTable: 'rtf_campaign_players',
        normalizedNPCsTable: 'rtf_campaign_npcs',
        normalizedLocationsTable: 'rtf_campaign_locations',
        normalizedRequisitionsTable: 'rtf_campaign_requisitions',
        normalizedEncountersTable: 'rtf_campaign_encounters',
        syncDelayMs: 350,
        reconcileIntervalMs: 5000,
        presenceHeartbeatMs: 3000,
        lockTtlMs: 20000
    };

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

    const toBoolean = (value) => !!value;

    const clampPercent = (value, fallback = 50) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(fallback)));
        return Math.max(0, Math.min(100, Math.round(parsed)));
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

    const sanitizeCampaign = (campaign) => {
        const source = campaign && typeof campaign === 'object' ? campaign : {};
        return {
            rep: sanitizeRep(source.rep),
            heat: toNumber(source.heat, 0),
            cognitiveRisk: toNumber(source.cognitiveRisk, 0),
            players: Array.isArray(source.players) ? source.players : [],
            npcs: Array.isArray(source.npcs) ? source.npcs : [],
            locations: Array.isArray(source.locations) ? source.locations : [],
            requisitions: Array.isArray(source.requisitions) ? source.requisitions : [],
            events: sanitizeEventList(source.events),
            encounters: Array.isArray(source.encounters) ? source.encounters : [],
            ledger: sanitizeLedgerState(source.ledger),
            case: sanitizeCase(source.case)
        };
    };

    const sanitizeBoard = (board) => {
        const source = board && typeof board === 'object' ? board : {};
        return {
            name: typeof source.name === 'string' && source.name ? source.name : DEFAULT_BOARD_STATE.name,
            nodes: Array.isArray(source.nodes) ? source.nodes : [],
            connections: Array.isArray(source.connections) ? source.connections : []
        };
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
    const sanitizeEvent = (event, index = 0) => {
        const source = event && typeof event === 'object' ? event : {};
        const { dueAt: _legacyDueAt, entityImpacts: _legacyEntityImpacts, ...sourceWithoutLegacyEventFields } = source;
        const fallbackId = buildEntityId('event', index);
        const createdAt = sanitizeAttributionAt(source.created, new Date().toISOString()) || new Date().toISOString();
        const changedAt = sanitizeAttributionAt(source.lastChangedAt, createdAt) || createdAt;
        return {
            ...sourceWithoutLegacyEventFields,
            id: toTrimmedString(source.id, fallbackId, 80).trim() || fallbackId,
            title: toTrimmedString(source.title, '', 240),
            focus: toTrimmedString(source.focus, '', 240),
            heatDelta: toTrimmedString(source.heatDelta, '', 12),
            tags: toTrimmedString(source.tags, '', 2000),
            imageUrl: toImageUrl(source.imageUrl),
            highlights: toTrimmedString(source.highlights, '', 6000),
            fallout: toTrimmedString(source.fallout, '', 6000),
            followUp: toTrimmedString(source.followUp, '', 6000),
            source: toTrimmedString(source.source, '', 80),
            kind: toTrimmedString(source.kind, '', 80),
            resolved: toBoolean(source.resolved),
            created: createdAt,
            impactSeverity: sanitizeImpactSeverity(source.impactSeverity, 'moderate'),
            impactScope: sanitizeImpactScope(source.impactScope, 'local'),
            certainty: clampPercent(source.certainty, 50),
            lastChangedBy: sanitizeAttributionBy(source.lastChangedBy, ''),
            lastChangedAt: changedAt,
            caseId: sanitizeCaseId(source.caseId, 'case_primary')
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
            leads: []
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
                leads: sanitizeLeadList(row.leads)
            };
            items.push(normalized);
        });

        if (!items.length) {
            items.push({
                id: 'case_primary',
                name: legacyCaseTitle,
                board: sanitizeBoard(null),
                events: [],
                leads: []
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

        return null;
    };
    const isGranularNormalizedLwwScope = (scopeToken) => !!parseGranularNormalizedLwwScope(scopeToken);
    const isProtectedConflictScope = (scopeToken) => !isGranularNormalizedLwwScope(scopeToken);
    const findEntityIndexByScopeId = (list, scopeId) => {
        if (!Array.isArray(list) || !scopeId) return -1;
        return list.findIndex((entry) => normalizeEntityScopeId(entry && entry.id) === scopeId);
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
            return normalizeScopeList(cleaned);
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
        map.set('campaign.meta.board', stripBoardNodeLocalFields(clean.campaignMeta && clean.campaignMeta.board));
        addEntityScopesToSnapshot(map, CAMPAIGN_META_EVENTS_SCOPE_PREFIX, sanitizeEventList(clean.campaignMeta && clean.campaignMeta.events));
        map.set(SYNC_SCOPE_CASES_META, buildCasesMetaSnapshot(clean));
        map.set('hq', clean.hq);
        (clean.cases.items || []).forEach((entry) => {
            if (!entry || !entry.id) return;
            map.set(`cases.${entry.id}.board`, stripBoardNodeLocalFields(entry.board));
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
                leads: []
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
                leads: []
            });
        });

        if (!nextItems.length) {
            nextItems.push({
                id: 'case_primary',
                name: DEFAULT_CASE_NAME,
                board: sanitizeBoard(null),
                events: [],
                leads: []
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

        const caseFieldMatch = scope.match(/^cases\.([a-z0-9_-]+)\.(board|events|name|leads)$/);
        if (caseFieldMatch) {
            const caseId = caseFieldMatch[1];
            const field = caseFieldMatch[2];
            const targetCase = ensureCaseForScope(targetState, sourceState, caseId);
            const sourceCase = getCaseById(sourceState, caseId) || {
                id: caseId,
                name: targetCase.name || DEFAULT_CASE_NAME,
                board: sanitizeBoard(null),
                events: [],
                leads: []
            };
            if (field === 'board') targetCase.board = deepClone(sourceCase.board);
            if (field === 'events') targetCase.events = deepClone(sourceCase.events);
            if (field === 'name') targetCase.name = sanitizeCaseName(sourceCase.name, targetCase.name || DEFAULT_CASE_NAME);
            if (field === 'leads') targetCase.leads = sanitizeLeadList(sourceCase.leads);
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

        if (merged.cases && Array.isArray(merged.cases.items)) {
            merged.cases.items = merged.cases.items.map((caseEntry) => {
                const localLayout = localLayouts.get(caseEntry.id) || new Map();
                return {
                    ...caseEntry,
                    board: applyBoardLayout(caseEntry.board, localLayout)
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
        if (cloud.cases && Array.isArray(cloud.cases.items)) {
            cloud.cases.items = cloud.cases.items.map((caseEntry) => ({
                ...caseEntry,
                board: stripBoardNodeLocalFields(caseEntry.board)
            }));
            const activeCase = cloud.cases.items.find((item) => item.id === cloud.cases.activeCaseId) || cloud.cases.items[0];
            if (activeCase) cloud.board = activeCase.board;
            return cloud;
        }

        cloud.board = stripBoardNodeLocalFields(cloud.board);
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
            normalizedPlayersTable: sanitizeIdentifier(source.normalizedPlayersTable, DEFAULT_SYNC_CONFIG.normalizedPlayersTable),
            normalizedNPCsTable: sanitizeIdentifier(source.normalizedNPCsTable, DEFAULT_SYNC_CONFIG.normalizedNPCsTable),
            normalizedLocationsTable: sanitizeIdentifier(source.normalizedLocationsTable, DEFAULT_SYNC_CONFIG.normalizedLocationsTable),
            normalizedRequisitionsTable: sanitizeIdentifier(source.normalizedRequisitionsTable, DEFAULT_SYNC_CONFIG.normalizedRequisitionsTable),
            normalizedEncountersTable: sanitizeIdentifier(source.normalizedEncountersTable, DEFAULT_SYNC_CONFIG.normalizedEncountersTable),
            syncDelayMs: Math.max(250, toNonNegativeInt(source.syncDelayMs, DEFAULT_SYNC_CONFIG.syncDelayMs) || DEFAULT_SYNC_CONFIG.syncDelayMs),
            reconcileIntervalMs: Math.max(5000, toNonNegativeInt(source.reconcileIntervalMs, DEFAULT_SYNC_CONFIG.reconcileIntervalMs) || DEFAULT_SYNC_CONFIG.reconcileIntervalMs),
            presenceHeartbeatMs: Math.max(3000, toNonNegativeInt(source.presenceHeartbeatMs, DEFAULT_SYNC_CONFIG.presenceHeartbeatMs) || DEFAULT_SYNC_CONFIG.presenceHeartbeatMs),
            lockTtlMs: Math.max(5000, toNonNegativeInt(source.lockTtlMs, DEFAULT_SYNC_CONFIG.lockTtlMs) || DEFAULT_SYNC_CONFIG.lockTtlMs)
        };
    };

    const getMergedSyncConfig = () => {
        const boot = global.RTF_SYNC_BOOTSTRAP && typeof global.RTF_SYNC_BOOTSTRAP === 'object' ? global.RTF_SYNC_BOOTSTRAP : null;
        const stored = parseStoredSyncConfig();
        return sanitizeSyncConfig({ ...DEFAULT_SYNC_CONFIG, ...(boot || {}), ...(stored || {}) });
    };

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
                lastRemoteSeenAt: 0,
                lastPushAt: 0,
                lastPullAt: 0,
                userId: '',
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
                lastForegroundPullAt: 0
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
                message: this.sync.config.enabled ? 'Cloud sync is configured but not connected.' : 'Cloud sync is disabled.',
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

            if (this.sync.config.enabled && this.sync.config.autoConnect) {
                this.connectSync().catch((err) => {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: false,
                        message: 'Sync connect failed.',
                        lastError: err && err.message ? err.message : String(err)
                    });
                });
            }
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
            if (!this.syncStatus.connected || !this.isNormalizedReadMode()) return;
            const now = Date.now();
            if (now - toTimestamp(this.sync.lastForegroundPullAt, 0) < 2000) return;
            this.sync.lastForegroundPullAt = now;
            this.pullFromCloud({ force: false, silent: true, reason }).catch(() => { });
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
            const list = Array.isArray(scopes) ? normalizeScopeList(scopes) : [];
            this.clearLocalDirtyScopes();
            if (list.length) this.markLocalDirtyScopes(list, timestamp);
            return list;
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
                    leads: []
                };
                cases.items.push(entry);
            }

            if (!entry && strict) return null;
            if (!entry) entry = cases.items.find((item) => item && item.id === cases.activeCaseId) || cases.items[0];
            if (!entry.board || typeof entry.board !== 'object') entry.board = sanitizeBoard(null);
            if (!Array.isArray(entry.events)) entry.events = [];
            if (!Array.isArray(entry.leads)) entry.leads = [];
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
                leads: []
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
                this.markLocalDirtyScopes(scopes, now);
                this.touchSoftLockScopes(scopes);
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));

                if (!skipCloud && !this.isApplyingRemote) this.scheduleCloudPush('local-save');
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
            if (this.syncStatus.connected) this.startReconcileLoop();

            if (reconnect) {
                if (next.enabled) {
                    this.connectSync().catch((err) => {
                        this.updateSyncStatus({
                            mode: 'error',
                            connected: false,
                            message: 'Sync connect failed.',
                            lastError: err && err.message ? err.message : String(err)
                        });
                    });
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
            const derived = {
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
            return normalizeScopeList(scopes);
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
            if (!this.state.meta || typeof this.state.meta !== 'object') {
                this.state.meta = deepClone(DEFAULT_STATE.meta);
            }
            if (!this.state.meta.scopeUpdated || typeof this.state.meta.scopeUpdated !== 'object') {
                this.state.meta.scopeUpdated = {};
            }
            const list = normalizeScopeList(scopes);
            list.forEach((scope) => {
                this.sync.localDirtyScopes.add(scope);
                this.state.meta.scopeUpdated[scope] = timestamp;
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
            if (!this.syncStatus.connected) return;
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
            if (!this.syncStatus.connected) return;
            const reconcileEvery = Math.max(5000, toNonNegativeInt(this.sync.config.reconcileIntervalMs, DEFAULT_SYNC_CONFIG.reconcileIntervalMs));
            const presenceEvery = Math.max(3000, toNonNegativeInt(this.sync.config.presenceHeartbeatMs, DEFAULT_SYNC_CONFIG.presenceHeartbeatMs));

            this.sync.reconcileTimer = setInterval(() => {
                if (!this.syncStatus.connected) return;
                this.pullFromCloud({ silent: true, force: false }).catch(() => { });
            }, reconcileEvery);

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
                players: cfg.normalizedPlayersTable,
                npcs: cfg.normalizedNPCsTable,
                locations: cfg.normalizedLocationsTable,
                requisitions: cfg.normalizedRequisitionsTable,
                encounters: cfg.normalizedEncountersTable
            };
        }

        getRealtimeTableTargets() {
            if (this.isNormalizedReadMode()) {
                const tables = Object.values(this.getNormalizedTables());
                return Array.from(new Set(tables.filter(Boolean)));
            }
            return [this.sync.config.tableName];
        }

        clearNormalizedRealtimePull() {
            if (this.sync.normalizedPullTimer) {
                clearTimeout(this.sync.normalizedPullTimer);
                this.sync.normalizedPullTimer = null;
            }
        }

        scheduleNormalizedRealtimePull() {
            if (!this.isNormalizedReadMode()) return;
            this.clearNormalizedRealtimePull();
            this.sync.normalizedPullTimer = setTimeout(() => {
                this.sync.normalizedPullTimer = null;
                if (!this.syncStatus.connected) return;
                this.pullFromCloud({ force: false, silent: true }).catch(() => { });
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

        async fetchNormalizedList(tableName, selectCols, order = null) {
            let query = this.sync.client
                .from(tableName)
                .select(selectCols)
                .eq('campaign_id', this.sync.config.campaignId);
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
                    leads: sanitizeLeadList(payload.leads)
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
                        leads: []
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
                        leads: []
                    });
                    caseOrder.push(caseId);
                }
                const entry = caseMap.get(caseId);
                entry.events = sanitizeEventList(events);
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

        async fetchCloudRowNormalized(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const tables = this.getNormalizedTables();

            const tasks = await Promise.all([
                this.fetchNormalizedSingle(tables.core),
                this.fetchNormalizedSingle(tables.hq),
                this.fetchNormalizedList(tables.caseState, 'case_id,case_name,is_active,sort_order,payload,revision,updated_at,updated_by,updated_by_name', { column: 'sort_order', ascending: true }),
                this.fetchNormalizedList(tables.caseBoards, 'case_id,payload,revision,updated_at,updated_by,updated_by_name', { column: 'case_id', ascending: true }),
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

            const [coreRes, hqRes, caseStateRes, boardsRes, eventsRes, playersRes, npcsRes, locationsRes, requisitionsRes, encountersRes] = tasks;
            const rowCount =
                (coreRes.data ? 1 : 0)
                + (hqRes.data ? 1 : 0)
                + caseStateRes.data.length
                + boardsRes.data.length
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
                boardRows: boardsRes.data,
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
                ...this.extractRowMeta(boardsRes.data),
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

            if (!this.sync.client || !this.syncStatus.connected) {
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
                    connected: true,
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

        async connectSync() {
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
                const supabaseLib = await this.loadSupabaseLibrary();
                const clientKey = `${config.supabaseUrl}|${config.anonKey}`;

                if (!this.sync.client || this.sync.clientKey !== clientKey) {
                    await this.disconnectSync('reconfigure');
                    this.sync.client = supabaseLib.createClient(config.supabaseUrl, config.anonKey, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    });
                    this.sync.clientKey = clientKey;
                }

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
                const pull = await this.pullFromCloud({ force: shouldForceInitialPull, silent: true });
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
                const supabaseLib = await this.loadSupabaseLibrary();
                const clientKey = `${config.supabaseUrl}|${config.anonKey}`;

                if (!this.sync.client || this.sync.clientKey !== clientKey) {
                    await this.disconnectSync('reconfigure');
                    this.sync.client = supabaseLib.createClient(config.supabaseUrl, config.anonKey, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    });
                    this.sync.clientKey = clientKey;
                    this.sync.userId = '';
                }
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
                syncConnected: !!this.syncStatus.connected
            };
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
            const payload = sanitizeBoard(opts.payload);
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

            return {
                ok: true,
                id: toNonNegativeInt(result.data && result.data.id, 0),
                capturedAt: toIsoString(result.data && result.data.captured_at, capturedAt) || capturedAt,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId
            };
        }

        async listBoardRoomHistory(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const target = this.resolveBoardRoomTarget(opts);
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

            const history = Array.isArray(result.data) ? result.data.map((row) => {
                const payload = sanitizeBoard(row && row.payload ? row.payload : null);
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
            }) : [];

            return {
                ok: true,
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                history
            };
        }

        async loadBoardRoomSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const roomId = toTrimmedString(opts.roomId, '', 160).trim();
            if (!roomId) return { ok: false, reason: 'missing-room-id' };

            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const caseId = scope === 'campaign' ? '' : sanitizeCaseId(opts.caseId, this.getActiveCaseId());
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

            return {
                ok: true,
                roomId,
                scope,
                caseId,
                snapshot: {
                    roomId: String(result.data.room_id || roomId),
                    scope: String(result.data.board_scope || scope || 'case').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case',
                    caseId: result.data.case_id ? sanitizeCaseId(result.data.case_id, caseId || 'case_primary') : '',
                    payload: sanitizeBoard(result.data.payload),
                    revision: toNonNegativeInt(result.data.revision, 0),
                    updatedAt: toIsoString(result.data.updated_at, ''),
                    updatedBy: toTrimmedString(result.data.updated_by, '', 120),
                    updatedByName: toTrimmedString(result.data.updated_by_name, '', 120)
                }
            };
        }

        async saveBoardRoomSnapshot(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const roomId = toTrimmedString(opts.roomId, '', 160).trim();
            if (!roomId) return { ok: false, reason: 'missing-room-id' };

            const ensured = await this.ensureBoardCollabClient();
            if (!ensured.ok) return ensured;

            const scope = String(opts.scope || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
            const caseId = scope === 'campaign' ? null : sanitizeCaseId(opts.caseId, this.getActiveCaseId());
            const payload = sanitizeBoard(opts.payload);
            const revision = Math.max(1, toNonNegativeInt(opts.revision, Date.now()) || Date.now());
            const updatedAt = toIsoString(opts.updatedAt, '') || new Date().toISOString();
            const tableName = ensured.config.boardRoomsTable || DEFAULT_SYNC_CONFIG.boardRoomsTable;
            const createOnly = !!opts.createOnly;

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

            const query = createOnly
                ? ensured.client
                    .from(tableName)
                    .insert(row)
                    .select('revision,updated_at')
                    .single()
                : ensured.client
                    .from(tableName)
                    .upsert(row, { onConflict: 'campaign_id,room_id' })
                    .select('revision,updated_at')
                    .single();

            const result = await query;

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

            return {
                ok: true,
                roomId,
                scope,
                caseId: caseId || '',
                revision: toNonNegativeInt(result.data && result.data.revision, revision),
                updatedAt: toIsoString(result.data && result.data.updated_at, updatedAt) || updatedAt
            };
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

            this.mirrorBoardSnapshotToState({
                roomId: target.roomId,
                scope: target.scope,
                caseId: target.caseId,
                payload
            });

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

            return {
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

            try {
                const sessionResult = await this.sync.client.auth.getSession();
                const existingSession = sessionResult && sessionResult.data ? sessionResult.data.session : null;
                if (existingSession && existingSession.user && existingSession.user.id) {
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
                    return { ok: true, userId: session.user.id };
                }

                return { ok: false, message: 'No authenticated user session.' };
            } catch (err) {
                return {
                    ok: false,
                    message: err && err.message ? err.message : 'Auth failed.'
                };
            }
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

        async signInAnonymously(profileName = '') {
            const patch = {};
            const cleanName = sanitizeProfileName(profileName);
            if (cleanName) patch.profileName = cleanName;
            if (Object.keys(patch).length) this.setSyncConfig(patch, { reconnect: false });
            return this.connectSync();
        }

        async signOutSyncUser() {
            if (!this.sync.client) return { ok: false, error: 'Supabase client unavailable.' };
            const result = await this.sync.client.auth.signOut();
            await this.disconnectSync('manual');
            if (result.error) {
                return { ok: false, error: result.error.message || 'Sign out failed.' };
            }
            this.sync.userId = '';
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
            const row = payload && payload.new ? payload.new : null;
            if (!row) return;

            if (this.isNormalizedReadMode()) {
                const updatedByNormalized = row.updated_by || '';
                if (updatedByNormalized && updatedByNormalized === this.sync.instanceId) return;
                const normalizedRevision = toNonNegativeInt(row.revision, 0);
                if (normalizedRevision > this.sync.lastKnownRemoteRevision) {
                    this.sync.lastKnownRemoteRevision = normalizedRevision;
                    this.updateSyncStatus({
                        connected: true,
                        message: this.sync.pendingConflict
                            ? this.syncStatus.message
                            : 'Shared update detected. Catching up.'
                    });
                }
                this.scheduleNormalizedRealtimePull();
                return;
            }
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
                    connected: true,
                    message: 'Remote update received.'
                });
            }
        }

        scheduleCloudPush(reason = 'scheduled') {
            if (!this.sync.config.enabled || !this.syncStatus.connected || !this.sync.client) return;

            if (this.sync.pushTimer) clearTimeout(this.sync.pushTimer);
            this.sync.pushTimer = setTimeout(() => {
                this.sync.pushTimer = null;
                this.pushToCloud({ reason, silent: true }).catch((err) => {
                    this.updateSyncStatus({
                        mode: 'error',
                        connected: false,
                        pendingPush: false,
                        message: 'Cloud push failed.',
                        lastError: err && err.message ? err.message : String(err)
                    });
                });
            }, this.sync.config.syncDelayMs);

            this.updateSyncStatus({
                pendingPush: true
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
                writeAllCaseBoards: writeAll,
                writeAllCaseEvents: writeAll,
                playerIds: new Set(),
                npcIds: new Set(),
                locationIds: new Set(),
                requisitionIds: new Set(),
                encounterIds: new Set(),
                caseBoards: new Set(),
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
                const caseFieldMatch = scope.match(/^cases\.([a-z0-9_-]+)\.(board|events|name|leads)$/);
                if (caseFieldMatch) {
                    const caseId = sanitizeCaseId(caseFieldMatch[1], 'case_primary');
                    const field = caseFieldMatch[2];
                    if (field === 'board') plan.caseBoards.add(caseId);
                    if (field === 'events') plan.caseEvents.add(caseId);
                    if (field === 'name' || field === 'leads') plan.writeCaseState = true;
                    return;
                }
                const caseWholeMatch = scope.match(/^cases\.([a-z0-9_-]+)$/);
                if (caseWholeMatch) {
                    const caseId = sanitizeCaseId(caseWholeMatch[1], 'case_primary');
                    plan.writeCaseState = true;
                    plan.caseBoards.add(caseId);
                    plan.caseEvents.add(caseId);
                }
            });

            if (plan.writePlayers) plan.playerIds.clear();
            if (plan.writeNPCs) plan.npcIds.clear();
            if (plan.writeLocations) plan.locationIds.clear();
            if (plan.writeRequisitions) plan.requisitionIds.clear();
            if (plan.writeEncounters) plan.encounterIds.clear();

            if (plan.writeAllCaseBoards) {
                caseIds.forEach((id) => plan.caseBoards.add(id));
            }
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
                    if (!plan.writeAllCaseBoards && scopeList.some((scope) => scope === 'cases' || scope === SYNC_SCOPE_CASES_META)) {
                        // cases.meta affects active case/order/name only; board/event payload stays scoped separately.
                        return;
                    }
                    if (plan.writeAllCaseBoards) plan.caseBoards.add(id);
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

            const existing = await this.sync.client
                .from(tableName)
                .select(idColumn)
                .eq('campaign_id', campaignId);
            if (existing.error) {
                return { ok: false, error: existing.error.message || `Failed reading ${tableName}.` };
            }

            const existingIds = (Array.isArray(existing.data) ? existing.data : [])
                .map((row) => toTrimmedString(row && row[idColumn], '', 80))
                .filter(Boolean);
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

            const existing = await this.sync.client
                .from(tables.caseState)
                .select('case_id')
                .eq('campaign_id', campaignId);
            if (existing.error) {
                return { ok: false, error: existing.error.message || 'Failed reading case state.' };
            }

            const localCaseIds = new Set(rows.map((row) => row.case_id));
            const existingCaseIds = (Array.isArray(existing.data) ? existing.data : [])
                .map((row) => sanitizeCaseId(row && row.case_id, ''))
                .filter(Boolean);
            const toDelete = existingCaseIds.filter((id) => !localCaseIds.has(id));

            const upsert = await this.sync.client
                .from(tables.caseState)
                .upsert(rows, { onConflict: 'campaign_id,case_id' });
            if (upsert.error) {
                return { ok: false, error: upsert.error.message || 'Failed writing case state.' };
            }

            if (toDelete.length) {
                const [delEvents, delBoards, delCases] = await Promise.all([
                    this.sync.client.from(tables.caseEvents).delete().eq('campaign_id', campaignId).in('case_id', toDelete),
                    this.sync.client.from(tables.caseBoards).delete().eq('campaign_id', campaignId).in('case_id', toDelete),
                    this.sync.client.from(tables.caseState).delete().eq('campaign_id', campaignId).in('case_id', toDelete)
                ]);
                if (delEvents.error) return { ok: false, error: delEvents.error.message || 'Failed pruning case events.' };
                if (delBoards.error) return { ok: false, error: delBoards.error.message || 'Failed pruning case boards.' };
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

                const existing = await this.sync.client
                    .from(tables.caseEvents)
                    .select('event_id')
                    .eq('campaign_id', campaignId)
                    .eq('case_id', caseId);
                if (existing.error) {
                    return { ok: false, error: existing.error.message || `Failed reading events for ${caseId}.` };
                }
                const existingIds = (Array.isArray(existing.data) ? existing.data : [])
                    .map((row) => toTrimmedString(row && row.event_id, '', 80))
                    .filter(Boolean);
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

        async writeNormalizedStateByScopes(state, scopes, meta = {}) {
            if (!this.sync.client || !this.syncStatus.connected) {
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

            const boardIds = plan.writeAllCaseBoards ? caseIds : Array.from(plan.caseBoards.values());
            if (boardIds.length) {
                const boardResult = await this.syncCaseBoardsRows(cleanState, boardIds, writeMeta);
                if (!boardResult.ok) return boardResult;
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

            return { ok: true };
        }

        async pushToCloudNormalized(options = {}, precomputedDirtyScopes = null) {
            const opts = options && typeof options === 'object' ? options : {};
            const silent = !!opts.silent;
            const force = !!opts.force;
            const startAttempt = toNonNegativeInt(opts.attempt, 0);
            let dirtyScopes = precomputedDirtyScopes || this.getDirtyScopesSnapshot(opts.scopes);

            if (!this.sync.client || !this.syncStatus.connected) {
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

                    const fetched = await this.fetchCloudRowNormalized({ silent: true });
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
                                connected: true,
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
                                    connected: true,
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
                            connected: true,
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
                                connected: false,
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
                        connected: true,
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
                        connected: false,
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

            if (!this.sync.client || !this.syncStatus.connected) {
                return { ok: false, reason: 'not-connected' };
            }

            const fetched = await this.fetchCloudRow({ silent });
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
                            connected: true,
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
                if (localRevision > remoteRevision || localUpdatedAt > remoteUpdatedAt) {
                    this.scheduleCloudPush('catch-up');
                }
                this.sync.lastPullAt = Date.now();
                this.sync.lastKnownRemoteRevision = Math.max(this.sync.lastKnownRemoteRevision, remoteRevision);
                this.updateSyncStatus({
                    lastPullAt: this.sync.lastPullAt,
                    mode: 'ready',
                    connected: true,
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
                    connected: true,
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

            if (!this.sync.client || !this.syncStatus.connected) {
                return { ok: false, reason: 'not-connected' };
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
                            connected: true,
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
                                    connected: false,
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
                                        connected: false,
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
                        connected: true,
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
                        connected: false,
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
            const rawHp = source.hp;
            const safeHp = (typeof rawHp === 'number' && Number.isFinite(rawHp))
                ? Math.max(0, Math.min(999999, Math.round(rawHp)))
                : toTrimmedString(rawHp, '10', 40);

            const playerId = toTrimmedString(source.id || generatedId, generatedId, 80);
            this.state.campaign.players.push({
                id: playerId,
                name: toTrimmedString(source.name || 'New Agent', 'New Agent', 160),
                ac: Math.max(0, Math.min(999, Math.round(toNumber(source.ac, 10)))),
                init: Math.max(-99, Math.min(999, Math.round(toNumber(source.init, 0)))),
                hp: safeHp,
                pp: Math.max(0, Math.min(999, Math.round(toNumber(source.pp, 10)))),
                dc: Math.max(0, Math.min(999, Math.round(toNumber(source.dc, 10)))),
                dp: Math.max(0, Math.min(4, Math.round(toNumber(source.dp, 2)))),
                projectClock: Math.max(0, Math.min(6, Math.round(toNumber(source.projectClock, 0)))),
                projectName: toTrimmedString(source.projectName, '', 240),
                projectReward: toTrimmedString(source.projectReward, '', 240)
            });
            const scope = buildPlayerEntityScope(playerId);
            this.save({
                scope: [
                    scope || CAMPAIGN_ENTITY_SCOPE_PREFIXES.players,
                    buildEntityOrderScope(CAMPAIGN_ENTITY_SCOPE_PREFIXES.players)
                ]
            });
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

        getCampaignMetaBoard() {
            const meta = this.ensureCampaignMetaIntegrity();
            meta.board = sanitizeBoard(meta.board);
            return meta.board;
        }

        updateCampaignMetaBoard(boardState) {
            const meta = this.ensureCampaignMetaIntegrity();
            meta.board = sanitizeBoard(boardState);
            this.save({ scope: 'campaign.meta.board' });
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

        getBoard(caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return sanitizeBoard(null);
            entry.board = sanitizeBoard(entry.board);
            if (!caseId || entry.id === this.getActiveCaseId()) this.syncActiveCaseLegacyState();
            return entry.board;
        }

        updateBoard(boardState, caseId = null) {
            const entry = this.getCaseEntry(caseId, { createIfMissing: true });
            if (!entry) return;
            entry.board = sanitizeBoard(boardState);
            this.syncActiveCaseLegacyState();
            this.save({ scope: `cases.${entry.id}.board` });
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
                const now = Date.now();
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
                this.broadcastStoreUpdate('board-collab', {
                    scopes,
                    roomId: toTrimmedString(opts.roomId, '', 160).trim()
                });
                return true;
            } catch (err) {
                console.warn('RTF_STORE: Failed mirroring board collaboration snapshot', err);
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
                const event = sanitizeEvent(eventEntry, 0);
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
                    impactSeverity: event.impactSeverity,
                    impactScope: event.impactScope,
                    certainty: event.certainty,
                    lastChangedBy: event.lastChangedBy,
                    lastChangedAt: event.lastChangedAt,
                    highlights: toTrimmedString(event.highlights, '', 800),
                    fallout: toTrimmedString(event.fallout, '', 800),
                    followUp: toTrimmedString(event.followUp, '', 800),
                    created: event.created
                };
            };

            const caseItems = snapshotCases.map((caseEntry) => {
                const entry = caseEntry && typeof caseEntry === 'object' ? caseEntry : {};
                const board = sanitizeBoard(entry.board);
                const events = sanitizeEventList(entry.events).map((event) => ({
                    ...event,
                    caseId: sanitizeCaseId(event.caseId || entry.id, entry.id || activeCaseId)
                }));
                const sortedEvents = events.slice().sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
                const compactEvents = sortedEvents
                    .sort((left, right) => {
                        if (!!left.resolved === !!right.resolved) return String(right.created || '').localeCompare(String(left.created || ''));
                        return left.resolved ? 1 : -1;
                    })
                    .slice(0, 25)
                    .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
                return {
                    id: sanitizeCaseId(entry.id, 'case_primary'),
                    name: sanitizeCaseName(entry.name, DEFAULT_CASE_NAME),
                    events: (mode === 'full' ? sortedEvents : compactEvents).map(eventFromSnapshot),
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
            const highImpactOpen = openEvents.filter((event) => event.impactSeverity === 'high' || event.impactSeverity === 'critical');
            const lowCertHighImpact = highImpactOpen.filter((event) => clampPercent(event.certainty, 50) <= 45);

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
            if (highImpactOpen.length) immediateComplications.push('High-impact unresolved events are active.');
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
                    high_impact_open: highImpactOpen.map((event) => ({
                        id: event.id,
                        title: event.title,
                        caseId: event.caseId,
                        impactSeverity: event.impactSeverity,
                        impactScope: event.impactScope
                    })),
                    low_certainty_high_impact: lowCertHighImpact.map((event) => ({
                        id: event.id,
                        title: event.title,
                        caseId: event.caseId,
                        certainty: clampPercent(event.certainty, 50),
                        impactSeverity: event.impactSeverity
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
