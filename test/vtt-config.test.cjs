'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const vttConfig = require('../js/vtt-config.js');

const EXPECTED_CONSTANT_KEYS = [
    'DEFAULT_EVIDENCE_NOTE_CATEGORY',
    'DEFAULT_EVIDENCE_NOTE_COLOR',
    'DEFAULT_TOOL_SIZE_CELLS',
    'DEFAULT_VTT_CELL_PX',
    'DEFAULT_WORLD_SIZE',
    'DEFENCE_KEYS',
    'DM_UNLOCK_PHRASE',
    'DRAG_SYNC_INTERVAL_MS',
    'EVIDENCE_NOTE_CATEGORY_META',
    'EVIDENCE_NOTE_CHIP_ESTIMATED_CHAR_WIDTH_PX',
    'EVIDENCE_NOTE_CHIP_ESTIMATED_PADDING_PX',
    'EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX',
    'EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX',
    'EVIDENCE_NOTE_SHAPE_OPTIONS',
    'EVIDENCE_NOTE_SHAPE_PIN',
    'EVIDENCE_NOTE_SHAPE_ZONE',
    'FOG_EDGE_OVERDRAW_PX',
    'FOG_REVEAL_SHIMMER_MS',
    'GM_STORAGE_KEY',
    'GUILDLESS_LABEL_PATTERN',
    'GUILDLESS_TOKEN_BUCKET',
    'GUILDLESS_TOKEN_FOLDER',
    'GUILDLESS_TOKEN_MAX',
    'GUILDLESS_TOKEN_MIN',
    'LIVE_STATUS_DROPOUT_GRACE_MS',
    'LOCAL_DRAG_TWEEN_SUPPRESS_MS',
    'MAX_VTT_MAP_SCALE',
    'MIN_VTT_MAP_SCALE',
    'MONSTER_ASSIGN_RESULT_LIMIT',
    'MONSTER_SEARCH_RESULT_LIMIT',
    'MOOD_EMOJI_OPTIONS',
    'MOVE_ACCESS_OPTIONS',
    'MUSIC_TENSION_LEVELS',
    'PING_SHARED_LIFETIME_MS',
    'PING_VARIANT_OPTIONS',
    'PROCESSED_INIT_STORAGE_PREFIX',
    'PROXIMITY_TRIGGER_SETTLE_MS',
    'QUICK_ACTION_SEARCH_RESULT_LIMIT',
    'REMOTE_TOKEN_TWEEN_MS',
    'ROLL_ACTION_GUARD_MS',
    'SCENE_VIEW_LOCAL',
    'SCENE_VIEW_SHARED',
    'SHEET_STORAGE_KEY',
    'SIDE_OPTIONS',
    'SRD_MONSTER_DATA_URL',
    'STAGE_TOOL_DOUBLE_PRESS_PX',
    'STEALTH_STATUS_DETECTED',
    'STEALTH_STATUS_UNSEEN',
    'STORE_UPDATED_EVENT',
    'TEMPLATE_HOLD_PERSIST_MS',
    'TEMPLATE_KIND_CIRCLE',
    'TEMPLATE_KIND_CONE',
    'TEMPLATE_SHARED_LIFETIME_MS',
    'TOKEN_CLICK_MOVE_PX',
    'TOKEN_COORD_PRECISION',
    'TOKEN_DOUBLE_CLICK_MS',
    'TOKEN_DROP_PULSE_MS',
    'TOKEN_HP_FLASH_MS',
    'TOKEN_PORTRAIT_PREVIEW_MS',
    'TOOL_MODE_CIRCLE',
    'TOOL_MODE_CONE',
    'TOOL_MODE_FOG',
    'TOOL_MODE_FOG_REMOVE',
    'TOOL_MODE_NAVIGATE',
    'TOOL_MODE_NOTE',
    'TOOL_MODE_PING',
    'TOOL_MODE_RULER',
    'TOUCH_CONTEXT_HOLD_MS',
    'TOUCH_CONTEXT_MOVE_PX',
    'TRACKER_INITIATIVE_QUEUE_KEY',
    'UI_PREFS_STORAGE_PREFIX'
].sort();

const EXPECTED_DEFAULT_STATE = {
    updatedAt: 0,
    activeSceneId: 'scene_1',
    scenes: [{
        id: 'scene_1',
        name: 'Scene 1',
        mapImageUrl: '',
        mapScale: 1,
        grid: {
            cellPx: 70,
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
    }],
    initiative: {
        entries: [],
        round: 1,
        activeEntryId: '',
        encounterActive: false,
        sceneId: '',
        startedAt: 0
    }
};

const assertDeeplyFrozen = (value, path = 'value') => {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true, `${path} should be frozen`);
    Reflect.ownKeys(value).forEach((key) => {
        assertDeeplyFrozen(value[key], `${path}.${String(key)}`);
    });
};

test('VTT config exports the complete deeply immutable compatibility contract', () => {
    assert.deepEqual(Object.keys(vttConfig).sort(), ['constants', 'createDefaultVTTState']);
    assert.deepEqual(Object.keys(vttConfig.constants).sort(), EXPECTED_CONSTANT_KEYS);
    assert.equal(typeof vttConfig.createDefaultVTTState, 'function');
    assertDeeplyFrozen(vttConfig, 'vttConfig');

    assert.throws(() => {
        vttConfig.constants.DEFAULT_WORLD_SIZE.width = 1;
    }, TypeError);
    assert.throws(() => {
        vttConfig.constants.MUSIC_TENSION_LEVELS.push('catastrophic');
    }, TypeError);
    assert.throws(() => {
        vttConfig.constants.EVIDENCE_NOTE_CATEGORY_META.evidence.color = '#000000';
    }, TypeError);
});

test('VTT config preserves exact mode, shape, category, and ping vocabulary', () => {
    const { constants } = vttConfig;

    assert.deepEqual([
        constants.TOOL_MODE_NAVIGATE,
        constants.TOOL_MODE_PING,
        constants.TOOL_MODE_RULER,
        constants.TOOL_MODE_CIRCLE,
        constants.TOOL_MODE_CONE,
        constants.TOOL_MODE_NOTE,
        constants.TOOL_MODE_FOG,
        constants.TOOL_MODE_FOG_REMOVE
    ], ['navigate', 'ping', 'ruler', 'circle', 'cone', 'note', 'fog', 'fog-remove']);
    assert.deepEqual(
        [constants.TEMPLATE_KIND_CIRCLE, constants.TEMPLATE_KIND_CONE],
        ['circle', 'cone']
    );
    assert.deepEqual(constants.EVIDENCE_NOTE_SHAPE_OPTIONS, ['pin', 'zone']);
    assert.equal(constants.EVIDENCE_NOTE_SHAPE_PIN, 'pin');
    assert.equal(constants.EVIDENCE_NOTE_SHAPE_ZONE, 'zone');
    assert.deepEqual(constants.SIDE_OPTIONS, ['player', 'ally', 'enemy', 'neutral']);
    assert.deepEqual(constants.MOVE_ACCESS_OPTIONS, ['dm', 'player']);
    assert.deepEqual(constants.DEFENCE_KEYS, ['str', 'dex', 'con', 'int', 'wis', 'cha']);
    assert.deepEqual(constants.MUSIC_TENSION_LEVELS, ['passive', 'tense', 'active']);

    assert.deepEqual(Object.keys(constants.EVIDENCE_NOTE_CATEGORY_META), [
        'evidence', 'clue', 'poi', 'danger', 'objective', 'exit', 'sound',
        'cover', 'difficult', 'obscured', 'hazard', 'safe', 'info', 'other'
    ]);
    Object.values(constants.EVIDENCE_NOTE_CATEGORY_META).forEach((category) => {
        assert.deepEqual(Object.keys(category).sort(), ['color', 'defaultTitle', 'label', 'shortLabel']);
        assert.match(category.color, /^#[0-9a-f]{6}$/i);
        assert.ok(category.label);
        assert.ok(category.shortLabel);
        assert.ok(category.defaultTitle);
    });

    assert.deepEqual(constants.PING_VARIANT_OPTIONS, {
        attention: { label: 'Attention', color: '#4f8dff', variant: 'attention', icon: '!' },
        danger: { label: 'Danger', color: '#ff5f5f', variant: 'danger', icon: '!' },
        question: { label: 'Question', color: '#ffd35f', variant: 'question', icon: '?' },
        askRoll: { label: 'Ask To Roll', color: '#7ee787', variant: 'ask-roll', icon: '?', pickable: false }
    });
    assert.equal(constants.GUILDLESS_LABEL_PATTERN.test('Guildless 42'), true);
    assert.equal(constants.GUILDLESS_LABEL_PATTERN.test('guildless scout'), false);
});

test('VTT config numeric values obey world, timing, interaction, and limit invariants', () => {
    const { constants } = vttConfig;
    const numericKeys = EXPECTED_CONSTANT_KEYS.filter((key) => typeof constants[key] === 'number');
    numericKeys.forEach((key) => {
        assert.equal(Number.isFinite(constants[key]), true, `${key} should be finite`);
        assert.ok(constants[key] >= 0, `${key} should be non-negative`);
    });

    assert.ok(constants.DEFAULT_WORLD_SIZE.width > 0);
    assert.ok(constants.DEFAULT_WORLD_SIZE.height > 0);
    assert.ok(constants.DEFAULT_VTT_CELL_PX > 0);
    assert.ok(Number.isInteger(constants.TOKEN_COORD_PRECISION));
    assert.ok(constants.TOKEN_COORD_PRECISION > 0);
    assert.ok(constants.MIN_VTT_MAP_SCALE > 0);
    assert.ok(constants.MIN_VTT_MAP_SCALE < 1);
    assert.ok(constants.MAX_VTT_MAP_SCALE > 1);
    assert.ok(constants.MIN_VTT_MAP_SCALE < constants.MAX_VTT_MAP_SCALE);

    assert.ok(constants.DRAG_SYNC_INTERVAL_MS < constants.REMOTE_TOKEN_TWEEN_MS);
    assert.ok(constants.TEMPLATE_HOLD_PERSIST_MS < constants.TEMPLATE_SHARED_LIFETIME_MS);
    assert.ok(constants.TOKEN_CLICK_MOVE_PX < constants.STAGE_TOOL_DOUBLE_PRESS_PX);
    assert.ok(constants.TOUCH_CONTEXT_MOVE_PX < constants.STAGE_TOOL_DOUBLE_PRESS_PX);
    assert.ok(constants.EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX < constants.EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX);
    assert.ok(constants.GUILDLESS_TOKEN_MIN <= constants.GUILDLESS_TOKEN_MAX);

    [
        constants.DEFAULT_TOOL_SIZE_CELLS,
        constants.QUICK_ACTION_SEARCH_RESULT_LIMIT,
        constants.MONSTER_SEARCH_RESULT_LIMIT,
        constants.MONSTER_ASSIGN_RESULT_LIMIT,
        constants.GUILDLESS_TOKEN_MIN,
        constants.GUILDLESS_TOKEN_MAX
    ].forEach((value) => {
        assert.ok(Number.isInteger(value));
        assert.ok(value > 0);
    });
});

test('createDefaultVTTState returns fresh independent snapshots with the expected schema', () => {
    const first = vttConfig.createDefaultVTTState();
    const second = vttConfig.createDefaultVTTState();

    assert.deepEqual(first, EXPECTED_DEFAULT_STATE);
    assert.deepEqual(second, EXPECTED_DEFAULT_STATE);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.scenes, second.scenes);
    assert.notStrictEqual(first.scenes[0], second.scenes[0]);
    assert.notStrictEqual(first.scenes[0].grid, second.scenes[0].grid);
    assert.notStrictEqual(first.scenes[0].music, second.scenes[0].music);
    assert.notStrictEqual(first.scenes[0].music.tracks, second.scenes[0].music.tracks);
    assert.notStrictEqual(first.initiative, second.initiative);

    first.activeSceneId = 'scene_changed';
    first.scenes[0].grid.cellPx = 140;
    first.scenes[0].music.tracks.active = 'battle.mp3';
    first.scenes[0].tokens.push({ id: 'token_one' });
    first.initiative.entries.push({ id: 'token_one' });

    assert.deepEqual(second, EXPECTED_DEFAULT_STATE);
    assert.deepEqual(vttConfig.createDefaultVTTState(), EXPECTED_DEFAULT_STATE);
});
