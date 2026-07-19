(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_CONFIG = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const deepFreeze = (value) => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key]));
        return Object.freeze(value);
    };

    const constants = deepFreeze({
        DM_UNLOCK_PHRASE: 'setDMMode',

        UI_PREFS_STORAGE_PREFIX: 'rtf_vtt_ui_',
        PROCESSED_INIT_STORAGE_PREFIX: 'rtf_vtt_processed_init_',
        TRACKER_INITIATIVE_QUEUE_KEY: 'rtf_tracker_initiative_queue',
        SHEET_STORAGE_KEY: 'unifiedSheetData.json',
        GM_STORAGE_KEY: 'gmDashboardData',
        STORE_UPDATED_EVENT: 'rtf-store-updated',

        DEFAULT_WORLD_SIZE: { width: 2400, height: 1600 },
        DEFAULT_VTT_CELL_PX: 70,
        TOKEN_COORD_PRECISION: 1000,
        MIN_VTT_MAP_SCALE: 0.25,
        MAX_VTT_MAP_SCALE: 4,

        DRAG_SYNC_INTERVAL_MS: 180,
        REMOTE_TOKEN_TWEEN_MS: 240,
        LOCAL_DRAG_TWEEN_SUPPRESS_MS: 1200,
        TOKEN_DOUBLE_CLICK_MS: 450,
        TOKEN_PORTRAIT_PREVIEW_MS: 3000,
        TEMPLATE_HOLD_PERSIST_MS: 1000,
        TEMPLATE_SHARED_LIFETIME_MS: 5000,
        PING_SHARED_LIFETIME_MS: 4200,
        TOKEN_DROP_PULSE_MS: 720,
        TOKEN_HP_FLASH_MS: 680,
        FOG_REVEAL_SHIMMER_MS: 900,
        ROLL_ACTION_GUARD_MS: 900,
        LIVE_STATUS_DROPOUT_GRACE_MS: 5000,
        PROXIMITY_TRIGGER_SETTLE_MS: 400,
        TOUCH_CONTEXT_HOLD_MS: 420,

        TOKEN_CLICK_MOVE_PX: 5,
        STAGE_TOOL_DOUBLE_PRESS_PX: 18,
        TOUCH_CONTEXT_MOVE_PX: 14,
        FOG_EDGE_OVERDRAW_PX: 0,

        SIDE_OPTIONS: ['player', 'ally', 'enemy', 'neutral'],
        MOVE_ACCESS_OPTIONS: ['dm', 'player'],
        DEFENCE_KEYS: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
        MOOD_EMOJI_OPTIONS: ['🙂', '😠', '😰', '🤔', '😏', '😢', '😨', '😤', '🫡', '👁️', '🩸', '🏃', '🛡️', '✨'],

        TOOL_MODE_NAVIGATE: 'navigate',
        TOOL_MODE_PING: 'ping',
        TOOL_MODE_RULER: 'ruler',
        TOOL_MODE_CIRCLE: 'circle',
        TOOL_MODE_CONE: 'cone',
        TOOL_MODE_NOTE: 'note',
        TOOL_MODE_FOG: 'fog',
        TOOL_MODE_FOG_REMOVE: 'fog-remove',
        TEMPLATE_KIND_CIRCLE: 'circle',
        TEMPLATE_KIND_CONE: 'cone',
        DEFAULT_TOOL_SIZE_CELLS: 4,

        STEALTH_STATUS_DETECTED: 'detected',
        STEALTH_STATUS_UNSEEN: 'unseen',
        SCENE_VIEW_SHARED: 'shared',
        SCENE_VIEW_LOCAL: 'local',
        MUSIC_TENSION_LEVELS: ['passive', 'tense', 'active'],
        QUICK_ACTION_SEARCH_RESULT_LIMIT: 18,

        SRD_MONSTER_DATA_URL: 'monsters/dnd_srd_5_2_1__monsters.json',
        MONSTER_SEARCH_RESULT_LIMIT: 80,
        MONSTER_ASSIGN_RESULT_LIMIT: 8,

        DEFAULT_EVIDENCE_NOTE_CATEGORY: 'evidence',
        DEFAULT_EVIDENCE_NOTE_COLOR: '#39b66b',
        EVIDENCE_NOTE_SHAPE_PIN: 'pin',
        EVIDENCE_NOTE_SHAPE_ZONE: 'zone',
        EVIDENCE_NOTE_SHAPE_OPTIONS: ['pin', 'zone'],
        EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX: 26,
        EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX: 220,
        EVIDENCE_NOTE_CHIP_ESTIMATED_CHAR_WIDTH_PX: 6.8,
        EVIDENCE_NOTE_CHIP_ESTIMATED_PADDING_PX: 22,
        EVIDENCE_NOTE_CATEGORY_META: {
            evidence: { label: 'Evidence', shortLabel: 'E', color: '#39b66b', defaultTitle: 'Evidence Zone' },
            clue: { label: 'Clue', shortLabel: '?', color: '#58d4f7', defaultTitle: 'Clue Pin' },
            poi: { label: 'Point Of Interest', shortLabel: 'P', color: '#9b7cff', defaultTitle: 'Point Of Interest' },
            danger: { label: 'Danger', shortLabel: '!', color: '#d85b5b', defaultTitle: 'Danger Zone' },
            objective: { label: 'Objective', shortLabel: 'O', color: '#f0b357', defaultTitle: 'Objective Zone' },
            exit: { label: 'Exit', shortLabel: 'X', color: '#70d98b', defaultTitle: 'Exit' },
            sound: { label: 'Sound', shortLabel: '~', color: '#d6b4ff', defaultTitle: 'Sound Source' },
            cover: { label: 'Cover', shortLabel: 'C', color: '#7aa2f7', defaultTitle: 'Cover' },
            difficult: { label: 'Difficult Terrain', shortLabel: 'D', color: '#c9a45f', defaultTitle: 'Difficult Terrain' },
            obscured: { label: 'Obscured', shortLabel: 'V', color: '#8aa0aa', defaultTitle: 'Obscured Area' },
            hazard: { label: 'Hazard', shortLabel: 'H', color: '#f07178', defaultTitle: 'Hazard' },
            safe: { label: 'Safe Zone', shortLabel: '+', color: '#5fd38d', defaultTitle: 'Safe Zone' },
            info: { label: 'Info', shortLabel: 'i', color: '#4f8dff', defaultTitle: 'Info Zone' },
            other: { label: 'Other', shortLabel: '?', color: '#8f9aa8', defaultTitle: 'Zone' }
        },

        GUILDLESS_TOKEN_BUCKET: 'tokens',
        GUILDLESS_TOKEN_FOLDER: 'guildless',
        GUILDLESS_TOKEN_MIN: 1,
        GUILDLESS_TOKEN_MAX: 300,
        GUILDLESS_LABEL_PATTERN: /^guildless(?:\s+(\d+))?$/i,

        PING_VARIANT_OPTIONS: {
            attention: { label: 'Attention', color: '#4f8dff', variant: 'attention', icon: '!' },
            danger: { label: 'Danger', color: '#ff5f5f', variant: 'danger', icon: '!' },
            question: { label: 'Question', color: '#ffd35f', variant: 'question', icon: '?' },
            askRoll: { label: 'Ask To Roll', color: '#7ee787', variant: 'ask-roll', icon: '?', pickable: false }
        }
    });

    const createDefaultVTTState = () => ({
        updatedAt: 0,
        activeSceneId: 'scene_1',
        scenes: [
            {
                id: 'scene_1',
                name: 'Scene 1',
                mapImageUrl: '',
                mapScale: 1,
                grid: {
                    cellPx: constants.DEFAULT_VTT_CELL_PX,
                    offsetX: 0,
                    offsetY: 0,
                    cellDistance: 5
                },
                stealthMode: false,
                music: {
                    tension: 'passive',
                    tracks: { passive: '', tense: '', active: '' },
                    titles: { passive: '', tense: '', active: '' }
                },
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
            activeEntryId: '',
            encounterActive: false,
            sceneId: '',
            startedAt: 0
        }
    });

    return Object.freeze({ constants, createDefaultVTTState });
}));
