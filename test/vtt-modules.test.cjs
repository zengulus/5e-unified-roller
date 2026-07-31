const test = require('node:test');
const assert = require('node:assert/strict');

const geometryFactory = require('../js/vtt-geometry.js');
const markupFactory = require('../js/vtt-markup.js');
const proximityFactory = require('../js/vtt-proximity.js');
const rulesFactory = require('../js/vtt-rules.js');

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeAngleDeg = (value) => {
    const angle = Math.round(toNumber(value, 0)) % 360;
    return angle < 0 ? angle + 360 : angle;
};
const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const normalizeCoordinate = (value, fallback = 0) => Math.max(0, Math.round(toNumber(value, fallback) * 1000) / 1000);
const getSceneCellPx = (scene) => Math.max(1, toNumber(scene && scene.grid && scene.grid.cellPx, 70));
const getHexColorRgbString = (value, fallback = '#4f8dff') => {
    const clean = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    const parsed = parseInt(clean.slice(1), 16);
    return `${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}`;
};

const scene = {
    id: 'scene_test',
    grid: { cellPx: 10, offsetX: 0, offsetY: 0, cellDistance: 5 },
    tokens: [],
    templates: [],
    evidenceNotes: [],
    fog: []
};
const state = { scenes: [scene], initiative: { entries: [] } };
const rules = rulesFactory.create({
    buildId: (prefix) => `${prefix}_test`,
    toImageUrl: (value) => String(value || '').trim()
});

const proximityModel = proximityFactory.createModel({
    buildId: (prefix) => `${prefix}_test`,
    clamp,
    normalizeRollMode: (value) => ['adv', 'dis'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'norm',
    toNumber,
    toTitleCaseWords: (value) => String(value || '').replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
});

const geometry = geometryFactory.create({
    buildId: (prefix) => `${prefix}_test`,
    clamp,
    escapeHtml,
    getHexColorRgbString,
    getLocalRole: () => 'dm',
    getLocalToolSizeCells: () => 4,
    getSceneCellPx,
    getTokenStealthRoll: (token) => token && token.stealthRoll !== undefined ? token.stealthRoll : null,
    getVisionPassivePerception: (token) => toNumber(token && token.passivePerception, 10),
    getVTTState: () => state,
    getWorldSize: () => ({ width: 800, height: 600 }),
    getWorldSizeForScene: () => ({ width: 800, height: 600 }),
    normalizeAngleDeg,
    normalizeGridCoordinate: normalizeCoordinate,
    normalizeProximityPromptStates: (entries) => Array.isArray(entries) ? entries : [],
    normalizeProximityTriggers: (entries) => Array.isArray(entries) ? entries : [],
    normalizeTokenCoordinate: normalizeCoordinate,
    normalizeToolSizeCells: (value, fallback = 4) => clamp(Math.round(toNumber(value, fallback)), 1, 99),
    normalizeWorldCoordinate: (value, fallback = 0) => Math.round(toNumber(value, fallback) * 1000) / 1000,
    snapWorldPointToTemplateAnchor: (targetScene, point) => {
        const cellPx = getSceneCellPx(targetScene);
        const offsetX = toNumber(targetScene && targetScene.grid && targetScene.grid.offsetX, 0);
        const offsetY = toNumber(targetScene && targetScene.grid && targetScene.grid.offsetY, 0);
        const rawX = (toNumber(point && point.x, 0) - offsetX) / cellPx;
        const rawY = (toNumber(point && point.y, 0) - offsetY) / cellPx;
        const center = {
            x: Math.max(0.5, Math.round(rawX - 0.5) + 0.5),
            y: Math.max(0.5, Math.round(rawY - 0.5) + 0.5)
        };
        const intersection = {
            x: Math.max(0, Math.round(rawX)),
            y: Math.max(0, Math.round(rawY))
        };
        const centerDistance = Math.pow(rawX - center.x, 2) + Math.pow(rawY - center.y, 2);
        const intersectionDistance = Math.pow(rawX - intersection.x, 2) + Math.pow(rawY - intersection.y, 2);
        return intersectionDistance < centerDistance ? intersection : center;
    },
    toNumber
});

test('VTT geometry applies and removes fog as normalized cells', () => {
    const targetScene = { ...scene, fog: [] };
    const mask = geometry.buildFogMaskFromWorldPoints(targetScene, { x: 1, y: 1 }, { x: 15, y: 5 }, 'fog_drag');
    assert.deepEqual(mask, { id: 'fog_drag', x: 0, y: 0, w: 20, h: 10 });

    targetScene.fog = geometry.applyFogMaskMutation(targetScene, mask, 'add');
    assert.deepEqual(targetScene.fog, [
        { id: 'fog_0_0', col: 0, row: 0 },
        { id: 'fog_1_0', col: 1, row: 0 }
    ]);
    assert.deepEqual(geometry.applyFogMaskMutation(targetScene, mask, 'remove'), []);
});

test('VTT geometry reuses precomputed fog cells across role visibility checks', () => {
    const targetScene = {
        ...scene,
        fog: [{ id: 'fog_0_0', col: 0, row: 0 }],
        evidenceNotes: [{ id: 'note', hidden: false, shape: 'zone', x: 0, y: 0, w: 10, h: 10 }],
        tokens: [
            { id: 'covered', side: 'player', x: 0, y: 0, w: 1, h: 1 },
            { id: 'clear', side: 'player', x: 2, y: 0, w: 1, h: 1 }
        ]
    };
    const precomputedFogCells = new Set(['2,0']);

    assert.equal(geometry.isTokenUnderFog(targetScene, targetScene.tokens[0]), true);
    assert.equal(geometry.isTokenUnderFog(targetScene, targetScene.tokens[0], precomputedFogCells), false);
    assert.equal(geometry.isTokenHiddenForRole(targetScene.tokens[1], targetScene, 'player', precomputedFogCells), true);
    assert.deepEqual(
        geometry.getVisibleTokensForRole(targetScene, 'player', precomputedFogCells).map((token) => token.id),
        ['covered']
    );
    assert.deepEqual(
        geometry.getVisibleEvidenceNotesForRole(targetScene, 'player', precomputedFogCells).map((note) => note.id),
        ['note']
    );
});

test('VTT rules build sheet actions without storage or controller state', () => {
    const character = {
        meta: { level: 5 },
        stats: {
            str: { val: 16, save: true },
            dex: { val: 14 },
            con: { val: 12 },
            int: { val: 10 },
            wis: { val: 12 },
            cha: { val: 8 }
        },
        skills: { perception: 1 },
        attacks: [{ name: 'Longsword', dmg: '1d8 + 3' }],
        resources: [{ name: 'Breath', rCheck: true, rFormula: '1d6' }],
        spellbook: [{ name: 'Light', lvl: 0, ritual: true }]
    };
    const catalog = rules.buildSheetActionCatalog(character);
    assert.ok(catalog.some((entry) => entry.key === 'core:initiative'));
    assert.ok(catalog.some((entry) => entry.key === 'attack:atk:0'));
    assert.ok(catalog.some((entry) => entry.key === 'resource:recharge:0'));
    assert.ok(catalog.some((entry) => entry.key === 'spell:cast:0'));
    assert.ok(catalog.some((entry) => entry.key === 'spell:ritual:0'));
    assert.equal(rules.getSheetSkillBonus(character, 'perception'), 4);
    assert.deepEqual(rules.parsePlayerHp('10/8'), { hpCurrent: 8, hpMax: 10 });
});

test('VTT rules normalize monster stat blocks and produce roll presets', () => {
    const monster = rules.normalizeMonsterRecord({
        name: 'Test Drake',
        dexterity: 14,
        hit_points: 27,
        armor_class: 15,
        wisdom_save: 4,
        perception: 3,
        senses: 'darkvision 60 ft., Passive Perception 13',
        actions: [{
            name: 'Bite',
            desc: 'Melee Attack: +5 to hit. Hit: 8 (1d10 + 3) piercing damage.'
        }],
        bonus_actions: [{ name: 'Rush', desc: 'The drake moves up to its speed.' }],
        reactions: [{ name: 'Deflect', desc: 'The drake adds 2 to its AC.' }]
    }, 'test-drake');
    const token = rules.buildTokenFromMonster(monster);
    const sourceOnlyToken = {
        id: 'source_only',
        sourceType: 'monster',
        sourceId: monster.id,
        monsterRollOverrides: {
            'core:initiative': { label: 'Ambush', formula: '1d20 + 9' }
        }
    };
    const presets = rules.buildMonsterRollPresets(sourceOnlyToken, [monster]);
    assert.equal(token.hpCurrent, 27);
    assert.equal(token.ac, 15);
    assert.equal(monster.saves.wis, 4);
    assert.equal(monster.skills.perception, 3);
    assert.equal(monster.actions.length, 3);
    assert.ok(presets.some((entry) => entry.key === 'core:initiative' && entry.label === 'Ambush' && entry.formula === '1d20 + 9'));
    assert.ok(presets.some((entry) => entry.key.endsWith(':attack') && entry.formula === '1d20 +5'));
    assert.ok(presets.some((entry) => entry.key.endsWith(':damage') && entry.formula === '1d10 + 3'));

    const assigned = rules.buildCustomToken();
    assert.equal(rules.applyMonsterStatBlockToToken(assigned, monster, { rename: true, resize: true }), true);
    assert.equal(assigned.label, 'Test Drake');
    assert.equal(assigned.hpMax, 27);

    const draft = { scenes: [{ tokens: [sourceOnlyToken] }] };
    assert.equal(rules.updateMonsterRollOverrideForToken(draft, sourceOnlyToken.id, 'check:dex', { formula: '1d20 + 7' }), true);
    assert.equal(sourceOnlyToken.monsterRollOverrides['check:dex'].formula, '1d20 + 7');
});

test('VTT proximity owns trigger schema normalization and prompt selection state', () => {
    const trigger = proximityModel.normalizeProximityTrigger({
        id: 'investigate',
        kind: 'unknown',
        trigger: 'unknown',
        target: 'unknown',
        repeat: 'unknown',
        skill: 'INVESTIGATION',
        radiusCells: 200,
        dc: 99,
        clockSuccessDelta: 30,
        clockFailDelta: -30
    });
    assert.equal(trigger.kind, 'skillRoll');
    assert.equal(trigger.trigger, 'enter');
    assert.equal(trigger.target, 'playerTokens');
    assert.equal(trigger.repeat, 'oncePerToken');
    assert.equal(trigger.skill, 'investigation');
    assert.equal(trigger.radiusCells, 24);
    assert.equal(trigger.dc, 40);
    assert.equal(trigger.clockSuccessDelta, 20);
    assert.equal(trigger.clockFailDelta, -20);

    assert.equal(proximityModel.normalizeProximityTriggers(Array.from({ length: 20 }, () => trigger)).length, 12);
    assert.equal(proximityModel.normalizeProximityPromptStates(Array.from({ length: 100 }, (_, idx) => ({ key: `key_${idx}` }))).length, 80);
    assert.equal(proximityModel.buildSeededProximityTrigger('fiction').kind, 'fiction');
    assert.equal(proximityModel.buildSeededProximityTrigger('stealth').skill, 'stealth');
});

test('VTT proximity controller evaluates and renders an in-range player prompt', () => {
    let promptMarkup = '';
    let promptMarkupWrites = 0;
    const scheduledEvaluations = [];
    const promptStackEl = {
        hidden: true,
        dataset: {},
        style: {},
        get innerHTML() {
            return promptMarkup;
        },
        set innerHTML(value) {
            promptMarkupWrites += 1;
            promptMarkup = value;
        }
    };
    const targetScene = {
        id: 'scene_prompt',
        grid: { cellPx: 10, offsetX: 0, offsetY: 0 },
        fog: [],
        evidenceNotes: [{
            id: 'note_prompt',
            title: 'Scratched sigil',
            triggers: [{ id: 'notice', kind: 'fiction', trigger: 'enter', title: 'A sigil catches your eye' }]
        }],
        tokens: [{ id: 'hero', side: 'player', x: 0, y: 0, w: 1, h: 1 }]
    };
    const controller = proximityFactory.createController({
        ...proximityModel,
        canRoleMoveToken: () => true,
        collectFogCellSet: () => new Set(),
        escapeHtml,
        getActiveCaseId: () => 'case_test',
        getActiveScene: () => targetScene,
        getActiveSheetBundle: () => null,
        getEvidenceNoteCellBounds: () => ({ left: 0, top: 0, right: 1, bottom: 1, widthCells: 1, heightCells: 1 }),
        getEvidenceNoteDisplayTitle: (note) => note.title,
        getLocalRollMode: () => 'norm',
        getLocalView: () => ({ x: 0, y: 0, zoom: 1 }),
        getRenderableTokenCells: (token) => token,
        getRollModeLabel: () => 'Normal',
        getRosterPlayerForRecord: () => null,
        getSceneById: () => targetScene,
        getSceneCellPx,
        getSceneEvidenceNotes: (currentScene) => currentScene.evidenceNotes,
        getSheetMod: () => 0,
        getSheetPB: () => 2,
        getSheetSkillMiscBonus: () => 0,
        getTokenById: (id) => targetScene.tokens.find((token) => token.id === id),
        getVisibleTokensForRole: (currentScene) => currentScene.tokens,
        isDragging: () => false,
        isEvidenceNoteVisibleToRole: () => true,
        isInitialLoadPending: () => false,
        isPlayer: () => true,
        normalizeClockCurrent: (value) => value,
        normalizeClockMax: (value) => value,
        normalizeRollMode: (value) => ['adv', 'dis'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'norm',
        postSheetDiscordRoll: async () => true,
        setTimeout: (callback) => {
            scheduledEvaluations.push(callback);
            return scheduledEvaluations.length;
        },
        clearTimeout: () => {},
        promptStackEl,
        readJSONStorage: () => ({}),
        rollRawD20WithMode: () => ({ total: 10, formula: '1d20' }),
        rollSheetD20: () => ({ ok: true, total: 10, formula: '1d20' }),
        scaleForZoom: (value) => value,
        sheetSkillsMap: {},
        stageEl: { getBoundingClientRect: () => ({ height: 600 }) },
        toNumber,
        withDraft: () => false
    });

    controller.evaluateProximityTriggers();
    assert.equal(controller.getActivePrompt().sourceId, 'note_prompt');
    controller.renderProximityPrompt();
    assert.equal(promptStackEl.hidden, false);
    assert.match(promptStackEl.innerHTML, /A sigil catches your eye/);
    assert.equal(promptMarkupWrites, 1);

    controller.evaluateProximityTriggers();
    controller.renderProximityPrompt();
    assert.equal(promptMarkupWrites, 1, 'an unchanged prompt is repositioned without rebuilding its DOM');

    targetScene.tokens[0].x = 5;
    controller.evaluateProximityTriggers();
    controller.renderProximityPrompt();
    assert.equal(promptMarkupWrites, 1, 'movement keeps the current prompt stable during the settle window');
    assert.equal(scheduledEvaluations.length, 1);

    scheduledEvaluations[0]();
    assert.equal(promptStackEl.hidden, true);
    assert.equal(promptMarkupWrites, 2, 'the prompt is removed once after movement settles');
});

test('VTT proximity controller evaluates start-turn-near once per turn occurrence', () => {
    const promptStackEl = { hidden: true, innerHTML: '', dataset: {}, style: {} };
    const targetScene = {
        id: 'scene_turn_prompt',
        grid: { cellPx: 10, offsetX: 0, offsetY: 0 },
        fog: [],
        evidenceNotes: [{
            id: 'note_hazard',
            title: 'Arcane pressure plate',
            triggers: [{
                id: 'turn_hazard',
                kind: 'skillRoll',
                trigger: 'startTurnNear',
                repeat: 'always',
                target: 'playerTokens',
                radiusCells: 1,
                title: 'The plate flares'
            }]
        }],
        tokens: [
            { id: 'hero', side: 'player', x: 2, y: 0, w: 1, h: 1 },
            { id: 'bystander', side: 'player', x: 2, y: 0, w: 1, h: 1 }
        ]
    };
    const controller = proximityFactory.createController({
        ...proximityModel,
        canRoleMoveToken: () => true,
        collectFogCellSet: () => new Set(),
        escapeHtml,
        getActiveCaseId: () => 'case_test',
        getActiveScene: () => targetScene,
        getActiveSheetBundle: () => null,
        getEvidenceNoteCellBounds: () => ({ left: 0, top: 0, right: 1, bottom: 1, widthCells: 1, heightCells: 1 }),
        getEvidenceNoteDisplayTitle: (note) => note.title,
        getLocalRollMode: () => 'norm',
        getLocalView: () => ({ x: 0, y: 0, zoom: 1 }),
        getRenderableTokenCells: (token) => token,
        getRollModeLabel: () => 'Normal',
        getRosterPlayerForRecord: () => null,
        getSceneById: (id) => id === targetScene.id ? targetScene : null,
        getSceneCellPx,
        getSceneEvidenceNotes: (currentScene) => currentScene.evidenceNotes,
        getSheetMod: () => 0,
        getSheetPB: () => 2,
        getSheetSkillMiscBonus: () => 0,
        getTokenById: (id) => targetScene.tokens.find((token) => token.id === id),
        getVisibleTokensForRole: (currentScene) => currentScene.tokens,
        isDragging: () => false,
        isEvidenceNoteVisibleToRole: () => true,
        isInitialLoadPending: () => false,
        isPlayer: () => true,
        normalizeClockCurrent: (value) => value,
        normalizeClockMax: (value) => value,
        normalizeRollMode: (value) => ['adv', 'dis'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'norm',
        postSheetDiscordRoll: async () => true,
        promptStackEl,
        readJSONStorage: () => ({}),
        rollRawD20WithMode: () => ({ total: 10, formula: '1d20' }),
        rollSheetD20: () => ({ ok: true, total: 10, formula: '1d20' }),
        scaleForZoom: (value) => value,
        sheetSkillsMap: {},
        stageEl: { getBoundingClientRect: () => ({ height: 600 }) },
        toNumber,
        withDraft: () => false
    });

    controller.evaluateProximityTriggers();
    assert.equal(controller.getActivePrompt(), null, 'movement evaluation ignores turn-only triggers');

    const firstPrompt = controller.evaluateStartTurnNear({
        sceneId: targetScene.id,
        tokenId: 'hero',
        entryId: 'entry_hero',
        round: 1
    });
    assert.equal(firstPrompt.tokenId, 'hero');
    assert.equal(firstPrompt.trigger.trigger, 'startTurnNear');
    assert.match(firstPrompt.key, /\|1:entry_hero$/);

    controller.evaluateProximityTriggers();
    assert.equal(controller.getActivePrompt().key, firstPrompt.key, 'ordinary renders preserve the turn prompt');
    assert.equal(controller.dismissActiveProximityPrompt(), true);
    assert.equal(controller.evaluateStartTurnNear({ sceneId: targetScene.id, tokenId: 'hero', entryId: 'entry_hero', round: 1 }), null);

    const nextRoundPrompt = controller.evaluateStartTurnNear({
        sceneId: targetScene.id,
        tokenId: 'hero',
        entryId: 'entry_hero',
        round: 2
    });
    assert.ok(nextRoundPrompt);
    assert.notEqual(nextRoundPrompt.key, firstPrompt.key);

    assert.equal(controller.evaluateStartTurnNear({ sceneId: targetScene.id, tokenId: '' }), null);
    assert.equal(controller.getActivePrompt(), null, 'an unlinked next combatant clears the previous turn prompt');
});

test('VTT geometry keeps evidence and stealth calculations independent of the controller', () => {
    const targetScene = {
        ...scene,
        stealthMode: true,
        fog: [],
        tokens: [
            { id: 'watcher', side: 'enemy', x: 0, y: 0, w: 1, h: 1, passivePerception: 12, vision: { enabled: true, facingDeg: 0, arcDeg: 90, baseRangeCells: 6 } },
            { id: 'hero', side: 'player', x: 2, y: 0, w: 1, h: 1, stealthRoll: 10 }
        ]
    };
    const note = geometry.buildEvidenceNoteFromWorldPoints(targetScene, { x: 12, y: 18 }, { x: 12, y: 18 }, 'evidence_test');
    assert.equal(note.shape, 'pin');
    assert.equal(note.id, 'evidence_test');
    assert.equal(geometry.buildStealthStatusMap(targetScene).get('hero'), 'detected');
    assert.equal(geometry.buildStealthStatusMap(targetScene, state, new Set(['0,0'])).has('hero'), false);
});

test('VTT stealth cone summaries ignore concealed peer tokens but retain the local fogged token', () => {
    const targetScene = {
        ...scene,
        stealthMode: true,
        fog: [
            { id: 'fog_1_0', col: 1, row: 0 },
            { id: 'fog_3_0', col: 3, row: 0 }
        ],
        tokens: [
            { id: 'watcher', side: 'enemy', x: 0, y: 0, w: 1, h: 1, passivePerception: 12, vision: { enabled: true, facingDeg: 0, arcDeg: 90, baseRangeCells: 6 } },
            { id: 'own_fogged', side: 'player', x: 1, y: 0, w: 1, h: 1, stealthRoll: 20 },
            { id: 'hidden_peer', side: 'ally', x: 2, y: 0, w: 1, h: 1, hidden: true, stealthRoll: 10 },
            { id: 'fogged_peer', side: 'player', x: 3, y: 0, w: 1, h: 1, stealthRoll: 10 }
        ]
    };
    const fogCellSet = geometry.collectFogCellSet(targetScene, targetScene.fog);
    const visibility = {
        role: 'player',
        fogCellSet,
        visibleTokenIds: new Set(['own_fogged'])
    };

    assert.deepEqual(
        geometry.getStealthVisionTargetSummary(targetScene.tokens[0], targetScene, state, visibility),
        { detectedIds: [], unseenIds: ['own_fogged'] }
    );
    assert.deepEqual(
        Array.from(geometry.buildStealthStatusMap(targetScene, state, fogCellSet, visibility).entries()),
        [['own_fogged', 'unseen']]
    );

    const markup = markupFactory.create({
        escapeHtml,
        toNumber,
        clamp,
        normalizeAngleDeg,
        getPointAtAngle: geometry.getPointAtAngle,
        normalizeClockMax: (value, fallback = 4) => clamp(Math.round(toNumber(value, fallback)), 1, 20),
        normalizeClockCurrent: (value, max, fallback = 0) => clamp(Math.round(toNumber(value, fallback)), 0, max),
        getVisionConeGeometry: geometry.getVisionConeGeometry,
        getStealthVisionTargetSummary: geometry.getStealthVisionTargetSummary,
        getAreaTemplateWorldGeometry: geometry.getAreaTemplateWorldGeometry,
        getAskRollRequestFromPing: () => null,
        getSceneCellPx,
        normalizeHexColor: (value, fallback = '#4f8dff') => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback,
        getHexColorRgbString,
        normalizePingVariant: (value) => String(value || 'attention'),
        isEvidenceNotePin: geometry.isEvidenceNotePin,
        normalizeEvidenceNoteCategory: geometry.normalizeEvidenceNoteCategory,
        getEvidenceNoteCategoryLabel: geometry.getEvidenceNoteCategoryLabel,
        getEvidenceNoteDisplayTitle: geometry.getEvidenceNoteDisplayTitle,
        buildEvidenceNoteAreaLabel: geometry.buildEvidenceNoteAreaLabel,
        getEvidenceNoteHighlightColor: geometry.getEvidenceNoteHighlightColor,
        getEvidenceNoteHighlightRgb: geometry.getEvidenceNoteHighlightRgb,
        normalizeEvidenceNoteShape: geometry.normalizeEvidenceNoteShape,
        getEvidenceNoteCategoryShortLabel: geometry.getEvidenceNoteCategoryShortLabel,
        getTemplateWorldPoint: geometry.getTemplateWorldPoint,
        pingVariantOptions: { attention: { icon: '!' } }
    });
    assert.match(
        markup.buildVisionConeMarkup(targetScene.tokens[0], targetScene, { width: 800, height: 600 }, { state, ...visibility }),
        /rgba\(255, 211, 102, 0\.24\)/,
        'the visible local token is unseen, while concealed peers cannot turn the cone red'
    );
});

test('VTT markup builders render deterministic overlays from explicit state', () => {
    const markup = markupFactory.create({
        escapeHtml,
        toNumber,
        clamp,
        normalizeAngleDeg,
        getPointAtAngle: geometry.getPointAtAngle,
        normalizeClockMax: (value, fallback = 4) => clamp(Math.round(toNumber(value, fallback)), 1, 20),
        normalizeClockCurrent: (value, max, fallback = 0) => clamp(Math.round(toNumber(value, fallback)), 0, max),
        getVisionConeGeometry: geometry.getVisionConeGeometry,
        getStealthVisionTargetSummary: geometry.getStealthVisionTargetSummary,
        getAreaTemplateWorldGeometry: geometry.getAreaTemplateWorldGeometry,
        getAskRollRequestFromPing: () => null,
        getSceneCellPx,
        normalizeHexColor: (value, fallback = '#4f8dff') => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback,
        getHexColorRgbString,
        normalizePingVariant: (value) => String(value || 'attention'),
        isEvidenceNotePin: geometry.isEvidenceNotePin,
        normalizeEvidenceNoteCategory: geometry.normalizeEvidenceNoteCategory,
        getEvidenceNoteCategoryLabel: geometry.getEvidenceNoteCategoryLabel,
        getEvidenceNoteDisplayTitle: geometry.getEvidenceNoteDisplayTitle,
        buildEvidenceNoteAreaLabel: geometry.buildEvidenceNoteAreaLabel,
        getEvidenceNoteHighlightColor: geometry.getEvidenceNoteHighlightColor,
        getEvidenceNoteHighlightRgb: geometry.getEvidenceNoteHighlightRgb,
        normalizeEvidenceNoteShape: geometry.normalizeEvidenceNoteShape,
        getEvidenceNoteCategoryShortLabel: geometry.getEvidenceNoteCategoryShortLabel,
        getTemplateWorldPoint: geometry.getTemplateWorldPoint,
        pingVariantOptions: { attention: { icon: '!' } }
    });

    assert.match(markup.buildClockPieMarkup({ max: 4, current: 2 }), /2\/4/);
    assert.match(markup.buildClockPieMarkup({ max: 4, current: 2 }), /180deg/);
    assert.match(markup.buildAreaTemplateMarkup({ id: 'template_test', kind: 'circle', x: 2, y: 2, sizeCells: 3 }, scene), /data-template-id="template_test"/);
    assert.match(markup.buildRulerMarkup(scene, {
        dragging: true,
        sceneId: scene.id,
        start: { x: 0, y: 0 },
        end: { x: 3, y: 4 }
    }), /5 sq · 25 ft/);

    assert.match(markup.buildPingMarkup({ id: 'ping_test', x: 20, y: 30, variant: 'attention' }, scene), /vtt-ping-core/);
    assert.match(markup.buildAskRollMarkup(
        { id: 'ask_test', x: 20, y: 30, color: '#7ee787' },
        scene,
        { label: 'Perception' },
        { canRoll: true, canCancel: true }
    ), /data-action="roll-ask-roll-ping"/);

    const evidence = geometry.buildEvidenceNoteFromWorldPoints(scene, { x: 12, y: 18 }, { x: 12, y: 18 }, 'evidence_markup');
    assert.match(markup.buildEvidenceNoteMarkup(evidence, scene, {
        activeProximityPrompt: { sourceKind: 'note', sourceId: evidence.id }
    }), /is-proximity-source/);

    const watcher = {
        id: 'watcher_markup',
        side: 'enemy',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        passivePerception: 12,
        vision: { enabled: true, facingDeg: 0, arcDeg: 90, baseRangeCells: 6 }
    };
    assert.match(markup.buildVisionConeMarkup(watcher, scene, { width: 800, height: 600 }, {
        state,
        selectedTokenId: watcher.id,
        canMoveToken: true,
        targetSummary: { detectedIds: ['hero'], unseenIds: [] }
    }), /vtt-vision-cone-guide/);
    assert.match(markup.buildVisionConeHandleMarkup(watcher, scene, { width: 800, height: 600 }, {
        isDM: true,
        selectedTokenId: watcher.id,
        zoom: 1
    }), /vtt-vision-cone-rotate-handle/);
});
