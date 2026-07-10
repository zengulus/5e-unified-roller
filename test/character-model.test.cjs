const test = require('node:test');
const assert = require('node:assert/strict');
const Character = require('../js/character-model.js');

test('ability modifiers and proficiency bonuses follow 5e progression', () => {
    assert.equal(Character.getModifier(8), -1);
    assert.equal(Character.getModifier(20), 5);
    assert.deepEqual([1, 5, 9, 13, 17, 20].map(Character.getProficiencyBonus), [2, 3, 4, 5, 6, 6]);
});

test('auto HP uses maximum first level and rounded-up average later levels', () => {
    assert.equal(Character.calculateAutoHpMax(1, 'd8', 14, 0), 10);
    assert.equal(Character.calculateAutoHpMax(5, 'd8', 14, 0), 38);
});

test('standard AC respects armor dexterity caps', () => {
    assert.equal(Character.calculateStandardAC(12, 18, 2, 1), 15);
    assert.equal(Character.calculateStandardAC(10, 8, 0, 0), 10);
});
