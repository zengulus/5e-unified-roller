const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rollsFactory = require('../js/vtt-rolls.js');

const normalizeSearchText = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sheetSkillsMap = {
    arcana: 'int',
    perception: 'wis',
    stealth: 'dex'
};

const rolls = rollsFactory.create({
    normalizeSearchText,
    sheetSkillsMap,
    defaultSearchLimit: 18
});

const catalog = [
    { key: 'core:initiative', label: 'Initiative', category: 'Core', priority: 1300, searchText: 'initiative init combat' },
    { key: 'skill:perception', label: 'Perception', category: 'Skill', priority: 1120, searchText: 'perception wisdom skill check' },
    { key: 'skill:stealth', label: 'Stealth', category: 'Skill', priority: 1110, searchText: 'stealth dexterity skill check' },
    { key: 'attack:atk:0', label: 'Atk: Longsword', category: 'Attack', priority: 760, searchText: 'atk longsword attack weapon perception' },
    { key: 'attack:dmg:0', label: 'Dmg: Longsword', category: 'Damage', priority: 750, searchText: 'dmg longsword damage' },
    { key: 'spell:cast:0', label: 'Cast: Detect Magic', category: 'Spell', priority: 620, searchText: 'cast detect magic spell ritual' }
];

test('VTT rolls factory validates its explicit dependencies', () => {
    assert.throws(() => rollsFactory.create(), /normalizeSearchText/);
    assert.throws(() => rollsFactory.create({ normalizeSearchText }), /sheetSkillsMap/);
});

test('VTT rolls expose a classic-script global as well as CommonJS', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/vtt-rolls.js'), 'utf8');
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'vtt-rolls.js' });
    assert.equal(typeof sandbox.RTF_VTT_ROLLS.create, 'function');
});

test('VTT rolls normalize modes and preserve the existing labels', () => {
    assert.equal(rolls.normalizeRollMode(' Advantage '), 'adv');
    assert.equal(rolls.normalizeRollMode('DISADVANTAGE'), 'dis');
    assert.equal(rolls.normalizeRollMode('other'), 'norm');
    assert.equal(rolls.getRollModeLabel('adv'), 'Adv');
    assert.equal(rolls.getRollModeLabel('dis'), 'Dis');
    assert.equal(rolls.getRollModeLabel('norm'), 'Normal');
});

test('VTT rolls apply ADV or DIS only to unmodified 1d20 terms', () => {
    assert.equal(rolls.applyRollModeToD20Formula('1d20 + 5', 'adv'), '2d20kh1 + 5');
    assert.equal(rolls.applyRollModeToD20Formula('1D20 + 1d20 - 2', 'dis'), '2d20dl1 + 2d20dl1 - 2');
    assert.equal(rolls.applyRollModeToD20Formula('1d20kh1 + 4', 'adv'), '1d20kh1 + 4');
    assert.equal(rolls.applyRollModeToD20Formula('2d20kh1 + 4', 'dis'), '2d20kh1 + 4');
    assert.equal(rolls.applyRollModeToD20Formula(' 1d20 + 3 ', 'norm'), '1d20 + 3');
    assert.equal(rolls.applyRollModeToD20Formula('', 'adv'), '');
});

test('VTT rolls search actions with current priority, prefix, and preferred-key behavior', () => {
    assert.deepEqual(
        rolls.searchSheetActions(catalog, '', { limit: 3 }).map((item) => item.key),
        ['core:initiative', 'skill:perception', 'skill:stealth']
    );
    assert.deepEqual(
        rolls.searchSheetActions(catalog, 'perception').map((item) => item.key),
        ['skill:perception', 'attack:atk:0']
    );
    assert.deepEqual(
        rolls.searchSheetActions(catalog, 'detect ritual').map((item) => item.key),
        ['spell:cast:0']
    );
    assert.deepEqual(
        rolls.searchSheetActions(catalog, '', {
            preferredKeys: ['skill:stealth', 'missing', 'core:initiative']
        }).map((item) => item.key),
        ['skill:stealth', 'core:initiative']
    );
});

test('VTT rolls derive the existing focus and quick-request keys', () => {
    assert.deepEqual(rolls.getFocusQuickRollKeys(catalog), [
        'core:initiative',
        'skill:perception',
        'skill:stealth',
        'attack:atk:0',
        'attack:dmg:0'
    ]);
    assert.equal(rolls.getQuickRollRequestActionKey('Initiative'), 'core:initiative');
    assert.equal(rolls.getQuickRollRequestActionKey(' Perception '), 'skill:perception');
    assert.equal(rolls.getQuickRollRequestActionKey('other'), '');
    assert.equal(rolls.getQuickRollRequestActionKey('Longsword'), '');
});

test('VTT rolls format request labels and resolve requests against a catalog', () => {
    assert.equal(rolls.getAskRollRequestLabelForItem(catalog[0]), 'Initiative');
    assert.equal(rolls.getAskRollRequestLabelForItem(catalog[3]), 'Attack: Longsword');
    assert.equal(rolls.getAskRollRequestLabelForItem(catalog[4]), 'Damage: Longsword');
    assert.equal(rolls.getAskRollRequestLabelForItem(null), 'that');

    assert.equal(rolls.getRollRequestActionKey({ actionKey: 'attack:atk:0' }, catalog), 'attack:atk:0');
    assert.equal(rolls.getRollRequestActionKey({ actionKey: 'missing', label: 'Perception' }, catalog), 'skill:perception');
    assert.equal(rolls.getRollRequestActionKey({ label: 'Cast: Detect Magic' }, catalog), 'spell:cast:0');
    assert.equal(rolls.getRollRequestActionKey({ label: 'Detect Magic' }, catalog), 'spell:cast:0');
    assert.equal(rolls.getRollRequestActionKey({ label: 'Unknown Roll' }, catalog), '');
});

test('VTT rolls parse structured and legacy ask-roll pings', () => {
    assert.deepEqual(rolls.getAskRollRequestFromPing({
        askRoll: {
            label: '  Wisdom   Save  ',
            actionKey: 'save:wis',
            ownerPlayerId: 'player_1',
            ownerSheetKey: 'sheet_1',
            ownerName: '  Aurelia   Stone '
        }
    }), {
        label: 'Wisdom Save',
        actionKey: 'save:wis',
        ownerPlayerId: 'player_1',
        ownerSheetKey: 'sheet_1',
        ownerName: 'Aurelia Stone'
    });

    assert.deepEqual(rolls.getAskRollRequestFromPing({
        variant: 'attention',
        label: 'Aurelia asks: roll Perception?'
    }), {
        label: 'Perception',
        actionKey: '',
        ownerPlayerId: '',
        ownerSheetKey: '',
        ownerName: 'Aurelia'
    });
    assert.equal(rolls.getAskRollRequestFromPing({ variant: 'attention', label: 'Look here' }), null);
    assert.equal(rolls.getAskRollRequestFromPing({ askRoll: { label: '   ' } }), null);
});

test('VTT rolls build and match owner-scoped ask-roll requests', () => {
    const context = {
        playerId: 'player_1',
        linkedPlayer: { name: 'Aurelia Stone' },
        identity: { sheetKey: 'sheet_1', characterName: 'Aurelia' }
    };
    const request = rolls.buildAskRollRequest('  Perception  ', {}, context);
    assert.deepEqual(request, {
        label: 'Perception',
        actionKey: 'skill:perception',
        ownerPlayerId: 'player_1',
        ownerSheetKey: 'sheet_1',
        ownerName: 'Aurelia Stone'
    });
    assert.equal(rolls.buildAskRollRequest('   ', {}, context), null);
    assert.equal(rolls.isAskRollOwner(request, context), true);
    assert.equal(rolls.isAskRollOwner({ ownerPlayerId: 'another', ownerSheetKey: 'sheet_1' }, context), false);
    assert.equal(rolls.isAskRollOwner({ ownerSheetKey: 'sheet_1' }, context), true);
    assert.equal(rolls.isAskRollOwner({ ownerName: ' aurelia   stone ' }, context), true);
    assert.equal(rolls.isAskRollOwner({ ownerName: '' }, context), false);
});

test('VTT rolls identify initiative sheet actions through all legacy forms', () => {
    assert.equal(rolls.isInitiativeSheetAction({ key: 'core:initiative' }), true);
    assert.equal(rolls.isInitiativeSheetAction({ action: { code: 'rollInitiative()' } }), true);
    assert.equal(rolls.isInitiativeSheetAction({ label: 'Initiative' }), true);
    assert.equal(rolls.isInitiativeSheetAction({ key: 'skill:perception', label: 'Perception' }), false);
});
