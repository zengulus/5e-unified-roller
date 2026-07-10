const test = require('node:test');
const assert = require('node:assert/strict');
const Dice = require('../js/dice.js');

test('normal rolls return roll records (Hit Die regression)', () => {
    const result = Dice.coreRoll(1, 8, 'norm', {}, () => 0.5);
    assert.equal(result.total, 5);
    assert.deepEqual(result.rolls, [{ val: 5, dropped: false, originalIdx: 0 }]);
    assert.equal(result.rolls[0].val, 5);
});

test('drop-low and keep-high use the same returned records as the total', () => {
    const values = [0, 0.25, 0.5, 0.75];
    const result = Dice.coreRoll(4, 6, 'norm', { dl: 1 }, () => values.shift());
    assert.equal(result.total, 11);
    assert.equal(result.rolls.filter((roll) => roll.dropped).length, 1);
});

test('formula parser consumes the complete expression', () => {
    assert.equal(Dice.parseComplexBonus('1d6 + 2 trailing').ok, false);
    assert.equal(Dice.parseComplexBonus('1d6 +').ok, false);
    assert.equal(Dice.parseComplexBonus('1d6 2').ok, false);
});

test('formula parser enforces dice, sides, term and length limits', () => {
    assert.equal(Dice.parseComplexBonus('101d6').ok, false);
    assert.equal(Dice.parseComplexBonus('1d10001').ok, false);
    assert.equal(Dice.parseComplexBonus(`${'1+'.repeat(40)}1`).ok, false);
    assert.equal(Dice.parseComplexBonus('1'.repeat(257)).ok, false);
});

test('valid formulas preserve signs and modifiers', () => {
    const parsed = Dice.parseComplexBonus('4d6dl1 - 2 + 1d4', { random: () => 0.5 });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.total, 13);
    assert.match(parsed.text, /dl1/);
});

test('omitted dice counts are treated as one die', () => {
    const parsed = Dice.parseComplexBonus('d20 + 3', { random: () => 0 });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.total, 4);
});

test('modifier whitespace is accepted without allowing adjacent terms', () => {
    assert.equal(Dice.parseComplexBonus('2d20 kh1').ok, true);
    assert.equal(Dice.parseComplexBonus('2d20 3').ok, false);
});
