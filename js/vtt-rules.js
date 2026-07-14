(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_RULES = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const DEFENCE_KEYS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    const QUICK_ACTION_SEARCH_DICE = Object.freeze([20, 12, 10, 8, 6, 4, 100]);
    const SHEET_STAT_NAMES = Object.freeze({
        str: 'Strength',
        dex: 'Dexterity',
        con: 'Constitution',
        int: 'Intelligence',
        wis: 'Wisdom',
        cha: 'Charisma'
    });
    const SHEET_SKILLS_MAP = Object.freeze({
        'acrobatics': 'dex',
        'animal handling': 'wis',
        'arcana': 'int',
        'athletics': 'str',
        'deception': 'cha',
        'history': 'int',
        'insight': 'wis',
        'intimidation': 'cha',
        'investigation': 'int',
        'medicine': 'wis',
        'nature': 'int',
        'perception': 'wis',
        'performance': 'cha',
        'persuasion': 'cha',
        'religion': 'int',
        'sleight of hand': 'dex',
        'stealth': 'dex',
        'survival': 'wis'
    });

    const toNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const hasValue = (value) => value !== null && value !== undefined && value !== '';
    const normalizeSearchText = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const toTitleCaseWords = (value = '') => String(value || '').replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );

    const requireFunction = (deps, key) => {
        if (typeof deps[key] !== 'function') {
            throw new TypeError(`RTF_VTT_RULES.create requires deps.${key} to be a function.`);
        }
        return deps[key];
    };

    const create = (deps = {}) => {
        if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
            throw new TypeError('RTF_VTT_RULES.create requires a dependency object.');
        }

        const buildId = requireFunction(deps, 'buildId');
        const toImageUrl = requireFunction(deps, 'toImageUrl');

        const normalizeDefences = (value) => {
            const source = value && typeof value === 'object' ? value : {};
            const out = {};
            DEFENCE_KEYS.forEach((key) => {
                const raw = source[key];
                out[key] = raw === null || raw === undefined || raw === ''
                    ? null
                    : clamp(Math.round(toNumber(raw, 0)), 0, 99);
            });
            return out;
        };

        const parsePlayerHp = (rawValue) => {
            const text = String(rawValue || '').trim();
            if (!text) return { hpCurrent: null, hpMax: null };
            if (text.includes('/')) {
                const parts = text.split('/');
                const hpMax = clamp(Math.round(toNumber(parts[0], 0)), 0, 999999);
                const hpCurrent = clamp(Math.round(toNumber(parts[1], hpMax)), 0, 999999);
                return { hpCurrent, hpMax };
            }
            const numeric = clamp(Math.round(toNumber(text, 0)), 0, 999999);
            return { hpCurrent: numeric, hpMax: numeric };
        };

        const getSheetMod = (character, stat) => Math.floor(
            ((character && character.stats && character.stats[stat] ? Number(character.stats[stat].val) : 10) - 10) / 2
        );

        const getSheetPB = (character) => Math.floor(
            ((character && character.meta ? parseInt(character.meta.level, 10) : 1) - 1) / 4
        ) + 2;

        const getSheetSkillMiscBonus = (character, skillName) => {
            const raw = character && character.skillMisc
                ? String(character.skillMisc[skillName] || '').trim().toLowerCase()
                : '';
            if (!raw) return 0;
            if (DEFENCE_KEYS.includes(raw)) return getSheetMod(character, raw);
            return parseInt(raw, 10) || 0;
        };

        const getSheetSkillBonus = (character, skillName) => {
            const skill = String(skillName || '').trim().toLowerCase();
            const stat = character && character.skillOverrides && character.skillOverrides[skill]
                ? character.skillOverrides[skill]
                : SHEET_SKILLS_MAP[skill];
            if (!stat) return 0;
            const profLevel = character && character.skills && Number.isFinite(Number(character.skills[skill]))
                ? Number(character.skills[skill])
                : 0;
            return getSheetMod(character, stat)
                + (profLevel * getSheetPB(character))
                + getSheetSkillMiscBonus(character, skill);
        };

        const getSheetArmorClass = (character) => {
            const ac = character && character.ac && typeof character.ac === 'object' ? character.ac : {};
            const bonuses = Array.isArray(ac.bonuses) ? ac.bonuses : [];
            const bonusTotal = bonuses.reduce((sum, bonus) => (
                bonus && bonus.active ? sum + Math.round(toNumber(bonus.val, 0)) : sum
            ), 0);
            if (String(ac.mode || 'std') === 'custom') {
                const stat1 = DEFENCE_KEYS.includes(String(ac.customStat1 || '').trim())
                    ? String(ac.customStat1).trim()
                    : 'dex';
                const stat2 = DEFENCE_KEYS.includes(String(ac.customStat2 || '').trim())
                    ? String(ac.customStat2).trim()
                    : '';
                return clamp(Math.round(
                    10 + getSheetMod(character, stat1) + (stat2 ? getSheetMod(character, stat2) : 0) + bonusTotal
                ), 0, 99);
            }
            const rawDex = getSheetMod(character, 'dex');
            const dexCap = Number.isFinite(Number(ac.dexCap)) ? Number(ac.dexCap) : 100;
            const effectiveDex = dexCap === 100 ? rawDex : (dexCap === 0 ? 0 : Math.min(rawDex, dexCap));
            return clamp(Math.round(toNumber(ac.base, 10) + effectiveDex + bonusTotal), 0, 99);
        };

        const getSheetDefences = (character) => DEFENCE_KEYS.reduce((out, stat) => {
            const statRow = character && character.stats && character.stats[stat]
                ? character.stats[stat]
                : { val: 10, save: false };
            const saveBonus = getSheetMod(character, stat) + (statRow.save ? getSheetPB(character) : 0);
            out[stat] = clamp(Math.round(11 + saveBonus), 0, 99);
            return out;
        }, {});

        const getSheetStealthRoll = (character) => {
            const raw = character && character.meta ? character.meta.stealthRoll : null;
            if (raw === null || raw === undefined || raw === '') return null;
            return clamp(Math.round(toNumber(raw, 0)), 0, 99);
        };

        const buildSheetActionItem = (options = {}) => {
            const action = options.action && typeof options.action === 'object' ? options.action : null;
            const key = String(options.key || '').trim();
            if (!action || !key) return null;
            const label = String(options.label || action.label || 'Action').trim() || 'Action';
            const summary = String(options.summary || action.summary || '').trim();
            const category = String(options.category || 'Action').trim() || 'Action';
            const detail = String(options.detail || '').trim();
            const priority = Number.isFinite(options.priority) ? Number(options.priority) : 0;
            return {
                key,
                label,
                summary,
                category,
                detail,
                priority,
                action: { ...action, label, summary },
                searchText: normalizeSearchText([
                    label,
                    summary,
                    category,
                    detail,
                    options.searchTerms || ''
                ].join(' '))
            };
        };

        const buildSheetCodeActionItem = (options = {}) => buildSheetActionItem({
            ...options,
            action: {
                kind: 'code',
                code: String(options.code || '').trim(),
                label: options.label || 'Action',
                summary: options.summary || ''
            }
        });

        const buildSheetActionCatalog = (character) => {
            if (!character || typeof character !== 'object') return [];
            const items = [];
            items.push(buildSheetCodeActionItem({
                key: 'core:initiative',
                category: 'Core',
                code: 'rollInitiative()',
                label: 'Initiative',
                summary: 'Roll initiative from the sheet',
                priority: 1300,
                searchTerms: 'initiative init combat turn order'
            }));
            DEFENCE_KEYS.forEach((stat) => {
                const fullName = SHEET_STAT_NAMES[stat] || stat.toUpperCase();
                items.push(buildSheetCodeActionItem({
                    key: `check:${stat}`,
                    category: 'Check',
                    code: `rollCheck('${stat}')`,
                    label: `${fullName} Check`,
                    summary: `d20 + ${fullName}`,
                    detail: fullName,
                    priority: 900,
                    searchTerms: `${stat} ${fullName} ability check`
                }));
                items.push(buildSheetCodeActionItem({
                    key: `save:${stat}`,
                    category: 'Save',
                    code: `rollSave('${stat}')`,
                    label: `${fullName} Save`,
                    summary: `d20 + ${fullName} save`,
                    detail: fullName,
                    priority: 880,
                    searchTerms: `${stat} ${fullName} saving throw save`
                }));
            });
            Object.keys(SHEET_SKILLS_MAP).forEach((skillName) => {
                const ability = SHEET_SKILLS_MAP[skillName];
                items.push(buildSheetCodeActionItem({
                    key: `skill:${skillName}`,
                    category: 'Skill',
                    code: `rollSkill('${skillName}')`,
                    label: toTitleCaseWords(skillName),
                    summary: `${SHEET_STAT_NAMES[ability] || ability.toUpperCase()} skill check`,
                    detail: SHEET_STAT_NAMES[ability] || ability.toUpperCase(),
                    priority: skillName === 'perception' ? 1120 : (skillName === 'stealth' ? 1110 : 840),
                    searchTerms: `${skillName} ${ability} skill check`
                }));
            });
            (Array.isArray(character.attacks) ? character.attacks : []).forEach((attack, idx) => {
                const name = String(attack && attack.name || '').trim() || `Attack ${idx + 1}`;
                const damage = String(attack && attack.dmg || '').trim();
                items.push(buildSheetCodeActionItem({
                    key: `attack:atk:${idx}`,
                    category: 'Attack',
                    code: `rollAttack(${idx})`,
                    label: `Atk: ${name}`,
                    summary: 'Attack roll',
                    detail: damage || 'Attack',
                    priority: 760,
                    searchTerms: `${name} attack weapon hit ${damage} ${attack && attack.desc ? attack.desc : ''}`
                }));
                items.push(buildSheetCodeActionItem({
                    key: `attack:dmg:${idx}`,
                    category: 'Damage',
                    code: `rollDamage(${idx})`,
                    label: `Dmg: ${name}`,
                    summary: damage ? `Roll damage - ${damage}` : 'Roll damage',
                    detail: damage || 'Damage',
                    priority: 750,
                    searchTerms: `${name} damage ${damage} ${attack && attack.desc ? attack.desc : ''}`
                }));
            });
            (Array.isArray(character.resources) ? character.resources : []).forEach((resource, idx) => {
                if (!resource || !resource.rCheck) return;
                const name = String(resource.name || '').trim() || `Resource ${idx + 1}`;
                const formula = String(resource.rFormula || '1d6').trim() || '1d6';
                items.push(buildSheetCodeActionItem({
                    key: `resource:recharge:${idx}`,
                    category: 'Recharge',
                    code: `rollResRecharge(${idx})`,
                    label: `Recharge: ${name}`,
                    summary: `Roll recharge - ${formula}`,
                    detail: formula,
                    priority: 700,
                    searchTerms: `${name} recharge resource ${formula}`
                }));
            });
            (Array.isArray(character.spellbook) ? character.spellbook : []).forEach((spell, idx) => {
                const spellName = String(spell && spell.name || '').trim();
                if (!spellName) return;
                const level = Math.max(0, Math.min(9, parseInt(spell.lvl, 10) || 0));
                const levelText = level === 0 ? 'Cantrip' : `Level ${level}`;
                items.push(buildSheetActionItem({
                    key: `spell:cast:${idx}`,
                    category: 'Spell',
                    label: `Cast: ${spellName}`,
                    summary: `Cast from spellbook - ${levelText}`,
                    detail: levelText,
                    priority: 620,
                    searchTerms: `${spellName} ${levelText} ${spell.school || ''} ${spell.classes || ''} ${spell.damageFormula || ''} ${spell.description || ''}`,
                    action: { kind: 'spell', castMode: 'normal', spellName, spellIndex: idx }
                }));
                if (spell.ritual) {
                    items.push(buildSheetActionItem({
                        key: `spell:ritual:${idx}`,
                        category: 'Ritual',
                        label: `Ritual: ${spellName}`,
                        summary: `Ritual cast - ${levelText}`,
                        detail: levelText,
                        priority: 610,
                        searchTerms: `${spellName} ritual ${levelText}`,
                        action: { kind: 'spell', castMode: 'ritual', spellName, spellIndex: idx }
                    }));
                }
            });
            QUICK_ACTION_SEARCH_DICE.forEach((sides) => {
                items.push(buildSheetCodeActionItem({
                    key: `die:${sides}`,
                    category: 'Die',
                    code: `rollDie(${sides}, 0, 'd${sides}', ${sides === 20 ? 'true' : 'false'}, 'check')`,
                    label: `d${sides}`,
                    summary: 'Standard die roll',
                    detail: sides === 20 ? 'Supports ADV/DIS' : 'Single die',
                    priority: 420,
                    searchTerms: `d${sides} die dice`
                }));
            });
            return items.filter(Boolean);
        };

        const abilityModFromScore = (score) => Math.floor((Math.round(toNumber(score, 10)) - 10) / 2);

        const formatSignedBonus = (value) => {
            const clean = Math.round(toNumber(value, 0));
            return clean >= 0 ? `+${clean}` : String(clean);
        };

        const normalizeMonsterRollKeyPart = (value = '') => normalizeSearchText(value).replace(/\s+/g, '-') || 'roll';

        const normalizeMonsterAction = (action) => {
            const source = action && typeof action === 'object' ? action : {};
            const name = String(source.name || '').trim();
            const desc = String(source.desc || '').trim();
            if (!name && !desc) return null;
            const attackMatch = desc.match(/Attack Roll:\s*([+-]\s*\d+)/i)
                || desc.match(/(?:Melee|Ranged)\s+Attack[^:]*:\s*([+-]\s*\d+)/i);
            const saveMatch = desc.match(/([A-Za-z]+)\s+Saving Throw:\s*DC\s*(\d+)/i);
            const hitDamageMatch = desc.match(/Hit:\s*\d+\s*\(([^)]+)\)\s*([A-Za-z]+)?\s*damage/i);
            const failureDamageMatch = desc.match(/Failure:\s*\d+\s*\(([^)]+)\)\s*([A-Za-z]+)?\s*damage/i);
            const damageFormula = String(source.damageFormula || '').trim() || (String(source.damage_dice || '').trim()
                ? `${source.damage_dice}${Number.isFinite(Number(source.damage_bonus)) && Number(source.damage_bonus)
                    ? ` ${Number(source.damage_bonus) >= 0 ? '+' : '-'} ${Math.abs(Number(source.damage_bonus))}`
                    : ''}`
                : (hitDamageMatch ? hitDamageMatch[1].trim() : (failureDamageMatch ? failureDamageMatch[1].trim() : '')));
            return {
                name: name || 'Action',
                desc,
                attackBonus: attackMatch
                    ? Math.round(toNumber(attackMatch[1].replace(/\s+/g, ''), 0))
                    : (hasValue(source.attackBonus) ? Math.round(toNumber(source.attackBonus, 0)) : null),
                saveAbility: saveMatch
                    ? saveMatch[1].slice(0, 3).toLowerCase()
                    : String(source.saveAbility || '').trim(),
                saveDc: saveMatch
                    ? Math.round(toNumber(saveMatch[2], 0))
                    : (hasValue(source.saveDc) ? Math.round(toNumber(source.saveDc, 0)) : null),
                damageFormula,
                damageType: hitDamageMatch && hitDamageMatch[2]
                    ? hitDamageMatch[2]
                    : (failureDamageMatch && failureDamageMatch[2] ? failureDamageMatch[2] : '')
            };
        };

        const normalizeMonsterRecord = (monster, id = '') => {
            const source = monster && typeof monster === 'object' ? monster : {};
            const slug = String(source.slug || id || source.name || '').trim();
            const name = String(source.name || slug || 'Monster').trim() || 'Monster';
            const sourceAbilities = source.abilities && typeof source.abilities === 'object' ? source.abilities : {};
            const abilities = {
                str: Math.round(toNumber(hasValue(source.strength) ? source.strength : sourceAbilities.str, 10)),
                dex: Math.round(toNumber(hasValue(source.dexterity) ? source.dexterity : sourceAbilities.dex, 10)),
                con: Math.round(toNumber(hasValue(source.constitution) ? source.constitution : sourceAbilities.con, 10)),
                int: Math.round(toNumber(hasValue(source.intelligence) ? source.intelligence : sourceAbilities.int, 10)),
                wis: Math.round(toNumber(hasValue(source.wisdom) ? source.wisdom : sourceAbilities.wis, 10)),
                cha: Math.round(toNumber(hasValue(source.charisma) ? source.charisma : sourceAbilities.cha, 10))
            };
            const sourceSaves = source.saves && typeof source.saves === 'object' ? source.saves : {};
            const saves = {};
            DEFENCE_KEYS.forEach((key) => {
                const fullName = SHEET_STAT_NAMES[key] ? SHEET_STAT_NAMES[key].toLowerCase() : '';
                const raw = fullName && hasValue(source[`${fullName}_save`])
                    ? source[`${fullName}_save`]
                    : sourceSaves[key];
                if (hasValue(raw)) saves[key] = Math.round(toNumber(raw, 0));
            });
            const sourceSkills = source.skills && typeof source.skills === 'object' ? source.skills : {};
            const skills = {};
            Object.keys(SHEET_SKILLS_MAP).forEach((skillName) => {
                const sourceKey = skillName.replace(/\s+/g, '_');
                const raw = hasValue(source[sourceKey]) ? source[sourceKey] : sourceSkills[skillName];
                if (hasValue(raw)) skills[skillName] = Math.round(toNumber(raw, 0));
            });
            const actions = [
                ...(Array.isArray(source.actions) ? source.actions : []),
                ...(Array.isArray(source.bonus_actions) ? source.bonus_actions : []),
                ...(Array.isArray(source.reactions) ? source.reactions : []),
                ...(Array.isArray(source.legendary_actions) ? source.legendary_actions : [])
            ].map(normalizeMonsterAction).filter(Boolean);
            const rawHitPoints = hasValue(source.hit_points) ? source.hit_points : source.hitPoints;
            const rawArmorClass = hasValue(source.armor_class) ? source.armor_class : source.armorClass;
            const hitPoints = Number.isFinite(Number(rawHitPoints)) ? Math.round(Number(rawHitPoints)) : null;
            const armorClass = Number.isFinite(Number(rawArmorClass)) ? Math.round(Number(rawArmorClass)) : null;
            const passiveMatch = String(source.senses || '').match(/Passive Perception\s*(\d+)/i);
            const perception = Number.isFinite(Number(source.perception)) ? Math.round(Number(source.perception)) : null;
            const passivePerception = passiveMatch
                ? Math.round(toNumber(passiveMatch[1], 10))
                : (hasValue(source.passivePerception)
                    ? Math.round(toNumber(source.passivePerception, 10))
                    : (perception !== null ? 10 + perception : null));
            return {
                id: slug || buildId('monster'),
                name,
                slug,
                size: String(source.size || '').trim(),
                type: String(source.type || '').trim(),
                challengeRating: String(source.challenge_rating || source.challengeRating || '').trim(),
                armorClass,
                hitPoints,
                hitDice: String(source.hit_dice || source.hitDice || '').trim(),
                initiative: hasValue(source.initiative)
                    ? Math.round(toNumber(source.initiative, abilityModFromScore(abilities.dex)))
                    : abilityModFromScore(abilities.dex),
                abilities,
                saves,
                skills,
                passivePerception,
                senses: String(source.senses || '').trim(),
                languages: String(source.languages || '').trim(),
                actions
            };
        };

        const normalizeMonsterDirectory = (payload) => {
            const records = payload && typeof payload === 'object'
                ? Object.entries(payload).filter(([key, value]) => key !== '_info' && value && typeof value === 'object')
                : [];
            return records
                .map(([key, value]) => normalizeMonsterRecord(value, key))
                .sort((left, right) => left.name.localeCompare(right.name));
        };

        const getMonsterSizeCells = (monster) => {
            const size = String(monster && monster.size || '').trim().toLowerCase();
            if (size === 'huge') return 3;
            if (size === 'gargantuan') return 4;
            if (size === 'large') return 2;
            return 1;
        };

        const findMonsterById = (directory, monsterId) => {
            const targetId = String(monsterId || '').trim();
            if (!targetId || !Array.isArray(directory)) return null;
            return directory.find((monster) => String(monster && monster.id || '') === targetId) || null;
        };

        const filterMonsterDirectory = (directory, query = '', limit = 8) => {
            const cleanQuery = normalizeSearchText(query);
            const monsters = Array.isArray(directory) ? directory : [];
            const matched = cleanQuery
                ? monsters.filter((monster) => normalizeSearchText([
                    monster && monster.name,
                    monster && monster.type,
                    monster && monster.size,
                    monster && monster.challengeRating
                ].join(' ')).includes(cleanQuery))
                : monsters;
            return matched.slice(0, Math.max(1, limit));
        };

        const findMonsterForAssignmentQuery = (directory, query = '', selectedId = '') => {
            const selected = findMonsterById(directory, selectedId);
            if (selected) return selected;
            const cleanQuery = normalizeSearchText(query);
            if (!cleanQuery) return null;
            const monsters = Array.isArray(directory) ? directory : [];
            return monsters.find((monster) => normalizeSearchText(monster && monster.name) === cleanQuery)
                || filterMonsterDirectory(monsters, query, 1)[0]
                || null;
        };

        const buildTokenFromPlayer = (player) => {
            const hp = parsePlayerHp(player && player.hp);
            return {
                id: buildId('token'),
                label: String(player && player.name || 'Player').trim() || 'Player',
                side: 'player',
                imageUrl: '',
                x: 0,
                y: 0,
                w: 1,
                h: 1,
                sourceType: 'player',
                sourceId: String(player && player.id || '').trim(),
                moveAccess: 'player',
                hpCurrent: hp.hpCurrent,
                hpMax: hp.hpMax,
                ac: Number.isFinite(Number(player && player.ac)) ? clamp(Math.round(Number(player.ac)), 0, 99) : null,
                passivePerception: Number.isFinite(Number(player && player.pp)) ? clamp(Math.round(Number(player.pp)), 0, 99) : null,
                defences: normalizeDefences(null),
                conditions: [],
                triggers: [],
                proximityPromptStates: [],
                hidden: false,
                stealthRoll: null,
                vision: {
                    enabled: true,
                    facingDeg: 0,
                    arcDeg: 90,
                    baseRangeCells: 6,
                    passivePerception: 10
                }
            };
        };

        const buildTokenFromNPC = (npc) => {
            const hp = parsePlayerHp(npc && npc.hp);
            return {
                id: buildId('token'),
                label: String(npc && npc.name || 'NPC').trim() || 'NPC',
                side: 'neutral',
                imageUrl: toImageUrl(npc && npc.imageUrl),
                x: 0,
                y: 0,
                w: 1,
                h: 1,
                sourceType: 'npc',
                sourceId: String(npc && npc.id || '').trim(),
                moveAccess: 'dm',
                hpCurrent: hp.hpCurrent,
                hpMax: hp.hpMax,
                ac: Number.isFinite(Number(npc && npc.ac)) ? clamp(Math.round(Number(npc.ac)), 0, 99) : null,
                passivePerception: Number.isFinite(Number(npc && npc.pp)) ? clamp(Math.round(Number(npc.pp)), 0, 99) : null,
                defences: normalizeDefences(npc && npc.defences),
                conditions: [],
                triggers: [],
                proximityPromptStates: [],
                hidden: false,
                stealthRoll: null,
                vision: {
                    enabled: true,
                    facingDeg: 0,
                    arcDeg: 90,
                    baseRangeCells: 6,
                    passivePerception: 10
                }
            };
        };

        const buildTokenFromMonster = (monster) => {
            const statBlock = normalizeMonsterRecord(monster, monster && monster.id);
            const sizeCells = getMonsterSizeCells(statBlock);
            return {
                id: buildId('token'),
                label: statBlock.name,
                side: 'enemy',
                imageUrl: '',
                x: 0,
                y: 0,
                w: sizeCells,
                h: sizeCells,
                sourceType: 'monster',
                sourceId: String(statBlock.id || '').trim(),
                moveAccess: 'dm',
                hpCurrent: statBlock.hitPoints,
                hpMax: statBlock.hitPoints,
                ac: statBlock.armorClass,
                passivePerception: statBlock.passivePerception,
                defences: normalizeDefences(statBlock.saves),
                monster: statBlock,
                conditions: [],
                triggers: [],
                proximityPromptStates: [],
                hidden: false,
                stealthRoll: null,
                vision: {
                    enabled: true,
                    facingDeg: 0,
                    arcDeg: 90,
                    baseRangeCells: 6,
                    passivePerception: statBlock.passivePerception || 10
                }
            };
        };

        const buildCustomToken = () => ({
            id: buildId('token'),
            label: 'New Token',
            side: 'neutral',
            imageUrl: '',
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            sourceType: '',
            sourceId: '',
            moveAccess: 'dm',
            hpCurrent: null,
            hpMax: null,
            ac: null,
            passivePerception: null,
            defences: normalizeDefences(null),
            conditions: [],
            triggers: [],
            proximityPromptStates: [],
            hidden: false,
            stealthRoll: null,
            vision: {
                enabled: true,
                facingDeg: 0,
                arcDeg: 90,
                baseRangeCells: 6,
                passivePerception: 10
            }
        });

        const applyMonsterStatBlockToToken = (token, monster, options = {}) => {
            if (!token || !monster) return false;
            const opts = options && typeof options === 'object' ? options : {};
            const statBlock = normalizeMonsterRecord(monster, monster.id || monster.slug || monster.name);
            token.sourceType = 'monster';
            token.sourceId = String(statBlock.id || '').trim();
            token.monster = statBlock;
            if (opts.rename) token.label = statBlock.name;
            if (opts.resize) {
                const sizeCells = getMonsterSizeCells(statBlock);
                token.w = sizeCells;
                token.h = sizeCells;
            }
            if (opts.stats !== false) {
                token.hpCurrent = statBlock.hitPoints;
                token.hpMax = statBlock.hitPoints;
                token.ac = statBlock.armorClass;
                token.passivePerception = statBlock.passivePerception;
                token.defences = normalizeDefences(statBlock.saves);
                if (!token.vision || typeof token.vision !== 'object') {
                    token.vision = {
                        enabled: true,
                        facingDeg: 0,
                        arcDeg: 90,
                        baseRangeCells: 6,
                        passivePerception: 10
                    };
                }
                token.vision.passivePerception = statBlock.passivePerception || 10;
            }
            return true;
        };

        const getMonsterRollOverrides = (token) => (
            token && token.monsterRollOverrides && typeof token.monsterRollOverrides === 'object'
                ? token.monsterRollOverrides
                : {}
        );

        const applyMonsterRollOverride = (token, preset) => {
            if (!preset || !preset.key) return preset;
            const override = getMonsterRollOverrides(token)[preset.key];
            if (!override || typeof override !== 'object') return preset;
            const label = String(override.label || '').trim();
            const formula = String(override.formula || '').trim();
            const type = String(override.type || '').trim();
            const detail = String(override.detail || '').trim();
            return {
                ...preset,
                baseLabel: preset.baseLabel || preset.label,
                baseFormula: preset.baseFormula || preset.formula,
                baseType: preset.baseType || preset.type,
                baseDetail: preset.baseDetail || preset.detail || '',
                label: label || preset.label,
                formula: formula || preset.formula,
                type: type || preset.type,
                detail: detail || preset.detail || '',
                override,
                hasOverride: true
            };
        };

        const updateMonsterRollOverrideForToken = (draft, tokenId, presetKey, override) => {
            const targetTokenId = String(tokenId || '').trim();
            const targetPresetKey = String(presetKey || '').trim();
            if (!draft || !Array.isArray(draft.scenes) || !targetTokenId || !targetPresetKey) return false;
            for (const scene of draft.scenes) {
                if (!scene || !Array.isArray(scene.tokens)) continue;
                const token = scene.tokens.find((entry) => String(entry && entry.id || '').trim() === targetTokenId);
                if (!token) continue;
                if (!token.monsterRollOverrides || typeof token.monsterRollOverrides !== 'object') {
                    token.monsterRollOverrides = {};
                }
                if (override && Object.keys(override).length) token.monsterRollOverrides[targetPresetKey] = override;
                else delete token.monsterRollOverrides[targetPresetKey];
                return true;
            }
            return false;
        };

        const resolveMonsterForToken = (token, monsterOrResolver = null) => {
            if (!token) return null;
            if (token.monster && typeof token.monster === 'object') {
                return normalizeMonsterRecord(token.monster, token.monster.id || token.sourceId || token.label);
            }
            if (String(token.sourceType || '').trim() !== 'monster') return null;
            if (typeof monsterOrResolver === 'function') {
                return monsterOrResolver(token.sourceId) || null;
            }
            if (Array.isArray(monsterOrResolver)) {
                return findMonsterById(monsterOrResolver, token.sourceId);
            }
            if (monsterOrResolver && typeof monsterOrResolver === 'object') {
                return normalizeMonsterRecord(
                    monsterOrResolver,
                    monsterOrResolver.id || monsterOrResolver.slug || token.sourceId || token.label
                );
            }
            return null;
        };

        const getMonsterStatBlockForToken = (token, monsterOrResolver = null) => (
            resolveMonsterForToken(token, monsterOrResolver)
        );

        const buildMonsterRollPresets = (token, monsterOrResolver = null) => {
            const monster = getMonsterStatBlockForToken(token, monsterOrResolver);
            if (!monster) return [];
            const presets = [];
            presets.push({
                key: 'core:initiative',
                label: 'Initiative',
                baseLabel: 'Initiative',
                formula: `1d20 ${formatSignedBonus(monster.initiative)}`,
                baseFormula: `1d20 ${formatSignedBonus(monster.initiative)}`,
                category: 'Core',
                type: 'check',
                baseType: 'check',
                detail: '',
                baseDetail: ''
            });
            DEFENCE_KEYS.forEach((key) => {
                const score = monster.abilities && Number.isFinite(Number(monster.abilities[key]))
                    ? Number(monster.abilities[key])
                    : 10;
                const abilityMod = abilityModFromScore(score);
                const saveBonus = monster.saves && hasValue(monster.saves[key])
                    ? monster.saves[key]
                    : abilityMod;
                const label = SHEET_STAT_NAMES[key] || key.toUpperCase();
                presets.push({
                    key: `check:${key}`,
                    label: `${label} Check`,
                    baseLabel: `${label} Check`,
                    formula: `1d20 ${formatSignedBonus(abilityMod)}`,
                    baseFormula: `1d20 ${formatSignedBonus(abilityMod)}`,
                    category: 'Checks',
                    type: 'check',
                    baseType: 'check',
                    detail: '',
                    baseDetail: ''
                });
                presets.push({
                    key: `save:${key}`,
                    label: `${label} Save`,
                    baseLabel: `${label} Save`,
                    formula: `1d20 ${formatSignedBonus(saveBonus)}`,
                    baseFormula: `1d20 ${formatSignedBonus(saveBonus)}`,
                    category: 'Saves',
                    type: 'save',
                    baseType: 'save',
                    detail: '',
                    baseDetail: ''
                });
            });
            Object.entries(monster.skills || {}).forEach(([skillName, bonus]) => {
                const label = toTitleCaseWords(skillName);
                presets.push({
                    key: `skill:${normalizeMonsterRollKeyPart(skillName)}`,
                    label,
                    baseLabel: label,
                    formula: `1d20 ${formatSignedBonus(bonus)}`,
                    baseFormula: `1d20 ${formatSignedBonus(bonus)}`,
                    category: 'Skills',
                    type: 'check',
                    baseType: 'check',
                    detail: '',
                    baseDetail: ''
                });
            });
            (Array.isArray(monster.actions) ? monster.actions : []).forEach((action, actionIdx) => {
                const actionKey = `action:${actionIdx}:${normalizeMonsterRollKeyPart(action.name)}`;
                if (hasValue(action.attackBonus)) {
                    const label = `${action.name} Attack`;
                    const formula = `1d20 ${formatSignedBonus(action.attackBonus)}`;
                    presets.push({
                        key: `${actionKey}:attack`,
                        label,
                        baseLabel: label,
                        formula,
                        baseFormula: formula,
                        category: 'Actions',
                        type: 'atk',
                        baseType: 'atk',
                        detail: action.desc || '',
                        baseDetail: action.desc || ''
                    });
                }
                if (String(action.damageFormula || '').trim()) {
                    const label = `${action.name} Damage`;
                    const formula = String(action.damageFormula || '').trim();
                    presets.push({
                        key: `${actionKey}:damage`,
                        label,
                        baseLabel: label,
                        formula,
                        baseFormula: formula,
                        category: 'Actions',
                        type: 'dmg',
                        baseType: 'dmg',
                        detail: action.damageType ? `${action.damageType} damage` : (action.desc || ''),
                        baseDetail: action.damageType ? `${action.damageType} damage` : (action.desc || '')
                    });
                }
            });
            return presets
                .filter((preset) => preset && preset.key && preset.label && preset.formula)
                .map((preset) => applyMonsterRollOverride(token, preset))
                .slice(0, 48);
        };

        const filterMonsterRollPresets = (presets = [], query = '') => {
            const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
            if (!tokens.length) return presets;
            return (Array.isArray(presets) ? presets : []).filter((preset) => {
                const haystack = normalizeSearchText([
                    preset && preset.label,
                    preset && preset.baseLabel,
                    preset && preset.category,
                    preset && preset.formula,
                    preset && preset.type
                ].join(' '));
                return tokens.every((token) => haystack.includes(token));
            });
        };

        return Object.freeze({
            DEFENCE_KEYS,
            QUICK_ACTION_SEARCH_DICE,
            SHEET_STAT_NAMES,
            SHEET_SKILLS_MAP,
            normalizeSearchText,
            toTitleCaseWords,
            normalizeDefences,
            parsePlayerHp,
            getSheetMod,
            getSheetPB,
            getSheetSkillMiscBonus,
            getSheetSkillBonus,
            getSheetArmorClass,
            getSheetDefences,
            getSheetStealthRoll,
            buildSheetActionItem,
            buildSheetCodeActionItem,
            buildSheetActionCatalog,
            abilityModFromScore,
            formatSignedBonus,
            normalizeMonsterRollKeyPart,
            normalizeMonsterAction,
            normalizeMonsterRecord,
            normalizeMonsterDirectory,
            getMonsterSizeCells,
            findMonsterById,
            filterMonsterDirectory,
            findMonsterForAssignmentQuery,
            buildTokenFromPlayer,
            buildTokenFromNPC,
            buildTokenFromMonster,
            buildCustomToken,
            applyMonsterStatBlockToToken,
            getMonsterRollOverrides,
            applyMonsterRollOverride,
            updateMonsterRollOverrideForToken,
            getMonsterStatBlockForToken,
            buildMonsterRollPresets,
            filterMonsterRollPresets
        });
    };

    return Object.freeze({ create });
}));
