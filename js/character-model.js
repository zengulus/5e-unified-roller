(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RTF_CHARACTER_MODEL = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STATS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    const SKILLS = Object.freeze({
        'acrobatics': 'dex', 'animal handling': 'wis', 'arcana': 'int', 'athletics': 'str',
        'deception': 'cha', 'history': 'int', 'insight': 'wis', 'intimidation': 'cha',
        'investigation': 'int', 'medicine': 'wis', 'nature': 'int', 'perception': 'wis',
        'performance': 'cha', 'persuasion': 'cha', 'religion': 'int', 'sleight of hand': 'dex',
        'stealth': 'dex', 'survival': 'wis'
    });
    const SPELL_SLOTS = Object.freeze({
        full: [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]],
        pact: [[1], [2], [2], [2], [2], [2], [2], [2], [2], [2], [3], [3], [3], [3], [3], [3], [4], [4], [4], [4]]
    });

    function getModifier(score) {
        const value = Number(score);
        return Math.floor(((Number.isFinite(value) ? value : 10) - 10) / 2);
    }

    function getProficiencyBonus(level) {
        const safeLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
        return Math.ceil(safeLevel / 4) + 1;
    }

    function parseHitDieSides(value, fallback = 8) {
        const parsed = Number.parseInt(String(value || '').replace(/\D/g, ''), 10);
        return Math.max(2, Math.min(1000, parsed || fallback));
    }

    function calculateAutoHpMax(level, hitDieSides, constitution, bonusPerLevel = 0) {
        const safeLevel = Math.max(1, Math.min(20, Number.parseInt(level, 10) || 1));
        const sides = parseHitDieSides(hitDieSides, 8);
        const conMod = getModifier(Number.parseInt(constitution, 10) || 10);
        const bonus = Math.max(-100, Math.min(100, Number.parseInt(bonusPerLevel, 10) || 0));
        const average = Math.floor(sides / 2) + 1;
        return Math.max(1, sides + conMod + bonus + ((safeLevel - 1) * (average + conMod + bonus)));
    }

    function calculateStandardAC(base, dexterityScore, dexCap = 100, bonus = 0) {
        const rawDex = getModifier(dexterityScore);
        const cap = Number(dexCap);
        const effectiveDex = cap === 100 || !Number.isFinite(cap) ? rawDex : (cap === 0 ? 0 : Math.min(rawDex, cap));
        return (Number.parseInt(base, 10) || 10) + effectiveDex + (Number.parseInt(bonus, 10) || 0);
    }

    return Object.freeze({ STATS, SKILLS, SPELL_SLOTS, getModifier, getProficiencyBonus, parseHitDieSides, calculateAutoHpMax, calculateStandardAC });
}));
