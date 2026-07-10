(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RTF_DICE = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LIMITS = Object.freeze({
        maxFormulaLength: 256,
        maxTerms: 40,
        maxDicePerTerm: 100,
        maxDiceTotal: 500,
        maxSides: 10000,
        maxFlatBonus: 1000000,
        maxRerollThreshold: 9999
    });

    function integerInRange(value, label, min, max) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
            throw new RangeError(`${label} must be an integer from ${min} to ${max}.`);
        }
        return parsed;
    }

    function normalizeModifiers(mods, count, sides) {
        const source = mods && typeof mods === 'object' ? mods : {};
        const normalized = {
            r: integerInRange(source.r || 0, 'Reroll threshold', 0, Math.min(LIMITS.maxRerollThreshold, sides - 1)),
            dl: integerInRange(source.dl || 0, 'Drop-low count', 0, count),
            kh: integerInRange(source.kh || 0, 'Keep-high count', 0, count)
        };
        return normalized;
    }

    function coreRoll(count, sides, mode = 'norm', mods = {}, random = Math.random) {
        const safeCount = integerInRange(count, 'Dice count', 1, LIMITS.maxDicePerTerm);
        const safeSides = integerInRange(sides, 'Die sides', 2, LIMITS.maxSides);
        if (!['norm', 'adv', 'dis'].includes(mode)) throw new RangeError('Roll mode must be norm, adv, or dis.');
        if (typeof random !== 'function') throw new TypeError('Random source must be a function.');
        const safeMods = normalizeModifiers(mods, safeCount, safeSides);
        let rolls = [];
        let total = 0;
        let isCrit = false;
        let isFail = false;
        let formula = '';

        const rollOne = () => Math.floor(random() * safeSides) + 1;
        if (safeCount === 1 && safeSides === 20 && mode !== 'norm') {
            const r1 = rollOne();
            const r2 = rollOne();
            const chosen = mode === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2);
            rolls = [
                { val: r1, dropped: r1 !== chosen || (r1 === r2 && mode === 'dis'), originalIdx: 0 },
                { val: r2, dropped: r2 !== chosen || (r1 === r2 && mode === 'adv'), originalIdx: 1 }
            ];
            total = chosen;
            formula = `[${r1}, ${r2}] (${mode === 'adv' ? 'High' : 'Low'})`;
            isCrit = total === 20;
            isFail = total === 1;
        } else {
            rolls = Array.from({ length: safeCount }, (_, originalIdx) => {
                let val = rollOne();
                let attempts = 0;
                while (val <= safeMods.r && attempts < 50) {
                    val = rollOne();
                    attempts += 1;
                }
                return { val, dropped: false, originalIdx };
            });

            if (safeMods.dl > 0 || safeMods.kh > 0) {
                const sorted = [...rolls].sort((a, b) => a.val - b.val || a.originalIdx - b.originalIdx);
                const dropCount = Math.max(safeMods.dl, safeMods.kh > 0 ? safeCount - safeMods.kh : 0);
                sorted.slice(0, dropCount).forEach((roll) => { roll.dropped = true; });
            }

            total = rolls.reduce((sum, roll) => sum + (roll.dropped ? 0 : roll.val), 0);
            formula = `[${rolls.map((roll) => roll.dropped ? `~~${roll.val}~~` : roll.val).join('+')}]`;
            if (safeCount === 1 && safeSides === 20) {
                isCrit = total === 20;
                isFail = total === 1;
            }
        }

        return { total, rolls, formula, isCrit, isFail };
    }

    function parseModifierSequence(source, count, sides) {
        const mods = { r: 0, dl: 0, kh: 0 };
        let cursor = 0;
        while (cursor < source.length) {
            const match = /^(r|dl|d|kh|k)(\d+)/i.exec(source.slice(cursor));
            if (!match) throw new SyntaxError(`Invalid dice modifier near "${source.slice(cursor)}".`);
            const value = Number(match[2]);
            const key = match[1].toLowerCase();
            if (key === 'r') mods.r = value;
            else if (key === 'dl' || key === 'd') mods.dl = value;
            else mods.kh = value;
            cursor += match[0].length;
        }
        return normalizeModifiers(mods, count, sides);
    }

    function parseRollModifiers(str, options = {}) {
        const count = options.count || LIMITS.maxDicePerTerm;
        const sides = options.sides || LIMITS.maxSides;
        return parseModifierSequence(String(str || '').trim(), count, sides);
    }

    function invalidResult(error) {
        return { ok: false, total: 0, text: '', error: error instanceof Error ? error.message : String(error) };
    }

    function parseComplexBonus(input, options = {}) {
        const source = String(input || '').trim();
        if (!source) return { ok: true, total: 0, text: '', terms: [] };
        if (source.length > LIMITS.maxFormulaLength) {
            return invalidResult(new RangeError(`Formula exceeds ${LIMITS.maxFormulaLength} characters.`));
        }

        const random = typeof options.random === 'function' ? options.random : Math.random;
        let cursor = 0;
        let totalDice = 0;
        const terms = [];

        try {
            while (cursor < source.length) {
                while (/\s/.test(source[cursor] || '')) cursor += 1;
                if (cursor >= source.length) break;

                let sign = 1;
                if (source[cursor] === '+' || source[cursor] === '-') {
                    sign = source[cursor] === '-' ? -1 : 1;
                    cursor += 1;
                    while (/\s/.test(source[cursor] || '')) cursor += 1;
                } else if (terms.length > 0) {
                    throw new SyntaxError(`Expected + or - at character ${cursor + 1}.`);
                }

                const numberMatch = /^(\d+)/.exec(source.slice(cursor));
                const countOmitted = (source[cursor] || '').toLowerCase() === 'd';
                if (!numberMatch && !countOmitted) throw new SyntaxError(`Expected a number at character ${cursor + 1}.`);
                const firstNumber = numberMatch ? Number(numberMatch[1]) : 1;
                if (numberMatch) cursor += numberMatch[0].length;

                if ((source[cursor] || '').toLowerCase() === 'd') {
                    cursor += 1;
                    const sidesMatch = /^(\d+)/.exec(source.slice(cursor));
                    if (!sidesMatch) throw new SyntaxError(`Expected die sides at character ${cursor + 1}.`);
                    const sides = Number(sidesMatch[1]);
                    cursor += sidesMatch[0].length;
                    const afterSides = cursor;
                    while (/\s/.test(source[cursor] || '')) cursor += 1;
                    const modifierMatch = /^(?:(?:r|dl|d|kh|k)\d+)*/i.exec(source.slice(cursor));
                    const modifierText = modifierMatch ? modifierMatch[0] : '';
                    if (modifierText) cursor += modifierText.length;
                    else cursor = afterSides;

                    const count = integerInRange(firstNumber, 'Dice count', 1, LIMITS.maxDicePerTerm);
                    integerInRange(sides, 'Die sides', 2, LIMITS.maxSides);
                    totalDice += count;
                    if (totalDice > LIMITS.maxDiceTotal) throw new RangeError(`Formula exceeds ${LIMITS.maxDiceTotal} total dice.`);
                    const mods = parseModifierSequence(modifierText, count, sides);
                    const result = coreRoll(count, sides, 'norm', mods, random);
                    terms.push({ kind: 'dice', sign, count, sides, modifiers: modifierText, result });
                } else {
                    integerInRange(firstNumber, 'Flat bonus', 0, LIMITS.maxFlatBonus);
                    terms.push({ kind: 'flat', sign, value: firstNumber });
                }

                if (terms.length > LIMITS.maxTerms) throw new RangeError(`Formula exceeds ${LIMITS.maxTerms} terms.`);
                if (cursor < source.length && !/[+\-\s]/.test(source[cursor])) {
                    throw new SyntaxError(`Unexpected text at character ${cursor + 1}.`);
                }
            }

            if (!terms.length) throw new SyntaxError('Formula contains no terms.');
            const parts = [];
            let total = 0;
            terms.forEach((term, index) => {
                const value = term.kind === 'dice' ? term.result.total : term.value;
                const display = term.kind === 'dice' ? `${term.result.formula}${term.modifiers}` : String(term.value);
                total += value * term.sign;
                if (index === 0) parts.push(term.sign < 0 ? `-${display}` : display);
                else parts.push(`${term.sign < 0 ? '-' : '+'} ${display}`);
            });
            return { ok: true, total, text: parts.join(' '), terms };
        } catch (error) {
            return invalidResult(error);
        }
    }

    return Object.freeze({ LIMITS, coreRoll, parseRollModifiers, parseComplexBonus });
}));
