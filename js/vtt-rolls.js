(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_ROLLS = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const requireFunction = (deps, key) => {
        if (typeof deps[key] !== 'function') {
            throw new TypeError(`RTF_VTT_ROLLS.create requires deps.${key} to be a function.`);
        }
        return deps[key];
    };

    const requireObject = (deps, key) => {
        const value = deps[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError(`RTF_VTT_ROLLS.create requires deps.${key} to be an object.`);
        }
        return value;
    };

    const create = (deps = {}) => {
        if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
            throw new TypeError('RTF_VTT_ROLLS.create requires a dependency object.');
        }

        const normalizeSearchText = requireFunction(deps, 'normalizeSearchText');
        const sheetSkillsMap = Object.freeze({ ...requireObject(deps, 'sheetSkillsMap') });
        const parsedLimit = Math.round(Number(deps.defaultSearchLimit));
        const defaultSearchLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 18;

        const normalizeRollMode = (value) => {
            const clean = String(value || '').trim().toLowerCase();
            if (clean === 'adv' || clean === 'advantage') return 'adv';
            if (clean === 'dis' || clean === 'disadvantage') return 'dis';
            return 'norm';
        };

        const getRollModeLabel = (mode = 'norm') => {
            const clean = normalizeRollMode(mode);
            if (clean === 'adv') return 'Adv';
            if (clean === 'dis') return 'Dis';
            return 'Normal';
        };

        const applyRollModeToD20Formula = (formula, mode = 'norm') => {
            const cleanMode = normalizeRollMode(mode);
            const source = String(formula || '').trim();
            if (!source || cleanMode === 'norm') return source;
            return source.replace(
                /\b1d20\b(?!\s*(?:kh|k|dl|d|r)\d*)/gi,
                cleanMode === 'adv' ? '2d20kh1' : '2d20dl1'
            );
        };

        const normalizeCatalog = (catalog) => (Array.isArray(catalog) ? catalog.filter(Boolean) : []);

        const getSearchLimit = (value) => {
            const parsed = Math.round(Number(value));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSearchLimit;
        };

        const getActionSearchScore = (item, tokens) => (
            (Number.isFinite(item && item.priority) ? item.priority : 0)
            + (tokens.some((token) => normalizeSearchText(item && item.label).startsWith(token)) ? 100 : 0)
        );

        const searchSheetActions = (catalog, query = '', options = {}) => {
            const items = normalizeCatalog(catalog);
            const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
            const opts = options && typeof options === 'object' ? options : {};
            const limit = getSearchLimit(opts.limit);

            if (!tokens.length && Array.isArray(opts.preferredKeys)) {
                return opts.preferredKeys
                    .map((key) => items.find((item) => item && item.key === key))
                    .filter(Boolean)
                    .slice(0, limit);
            }

            return items
                .filter((item) => {
                    if (!tokens.length) return true;
                    const searchText = String(item && item.searchText || '');
                    return tokens.every((token) => searchText.includes(token));
                })
                .sort((left, right) => {
                    const scoreLeft = getActionSearchScore(left, tokens);
                    const scoreRight = getActionSearchScore(right, tokens);
                    if (scoreLeft !== scoreRight) return scoreRight - scoreLeft;
                    return String(left && left.label || '').localeCompare(String(right && right.label || ''));
                })
                .slice(0, limit);
        };

        const getFocusQuickRollKeys = (catalog) => {
            const items = normalizeCatalog(catalog);
            const hasKey = (key) => items.some((item) => item && item.key === key);
            const attack = items.find((item) => item && item.category === 'Attack');
            const damage = items.find((item) => item && item.category === 'Damage');
            return [
                hasKey('core:initiative') ? 'core:initiative' : '',
                hasKey('skill:perception') ? 'skill:perception' : '',
                hasKey('skill:stealth') ? 'skill:stealth' : '',
                attack ? attack.key : '',
                damage ? damage.key : ''
            ].filter(Boolean);
        };

        const getQuickRollRequestActionKey = (label) => {
            const clean = String(label || '').trim().toLowerCase();
            if (!clean || clean === 'custom' || clean === 'other') return '';
            if (clean === 'initiative') return 'core:initiative';
            if (sheetSkillsMap[clean]) return `skill:${clean}`;
            return '';
        };

        const getAskRollRequestLabelForItem = (item) => {
            if (!item) return 'that';
            const label = String(item.label || '').replace(/^(Atk|Dmg):\s*/i, '').trim() || 'that';
            const category = String(item.category || '').trim();
            return category && !/^core$/i.test(category)
                ? `${category}: ${label}`
                : label;
        };

        const getRollRequestActionKey = (request = {}, catalog = []) => {
            const items = normalizeCatalog(catalog);
            const directKey = String(request && request.actionKey || '').trim();
            if (directKey && items.some((item) => item && item.key === directKey)) return directKey;
            const quickKey = getQuickRollRequestActionKey(request && request.label);
            if (quickKey && items.some((item) => item && item.key === quickKey)) return quickKey;
            const cleanLabel = normalizeSearchText(request && request.label);
            if (!cleanLabel) return '';
            const exact = items.find((item) => normalizeSearchText(item && item.label) === cleanLabel);
            if (exact) return exact.key;
            const contained = items.find((item) => {
                const text = normalizeSearchText(`${item && item.category || ''} ${item && item.label || ''}`);
                return text === cleanLabel || text.includes(cleanLabel);
            });
            return contained ? contained.key : '';
        };

        const getAskRollRequestFromPing = (ping) => {
            if (!ping || typeof ping !== 'object') return null;
            if (ping.askRoll && typeof ping.askRoll === 'object') {
                const label = String(ping.askRoll.label || '').trim().replace(/\s+/g, ' ').slice(0, 48);
                if (!label) return null;
                return {
                    label,
                    actionKey: String(ping.askRoll.actionKey || '').trim().slice(0, 120),
                    ownerPlayerId: String(ping.askRoll.ownerPlayerId || '').trim().slice(0, 120),
                    ownerSheetKey: String(ping.askRoll.ownerSheetKey || '').trim().slice(0, 160),
                    ownerName: String(ping.askRoll.ownerName || '').trim().replace(/\s+/g, ' ').slice(0, 80)
                };
            }
            const variant = String(ping.variant || '').trim().toLowerCase();
            const rawLabel = String(ping.label || '').trim();
            const looksLikeLegacyAskRoll = variant === 'ask-roll'
                || variant === 'roll-request'
                || /\basks:\s*/i.test(rawLabel)
                || /\broll\s+/i.test(rawLabel);
            if (!looksLikeLegacyAskRoll) return null;
            const ownerMatch = rawLabel.match(/^(.*?)\basks:\s*/i);
            const ownerName = ownerMatch ? String(ownerMatch[1] || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
            const label = rawLabel
                .replace(/^.*?\basks:\s*/i, '')
                .replace(/^.*?\broll\s+/i, '')
                .replace(/\?+$/g, '')
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 48);
            return {
                label: label || 'Roll?',
                actionKey: '',
                ownerPlayerId: '',
                ownerSheetKey: '',
                ownerName
            };
        };

        const normalizeOwnerName = (value) => normalizeSearchText(
            String(value || '').replace(/\s+/g, ' ').trim()
        );

        const isAskRollOwner = (request = {}, context = {}) => {
            const ownerPlayerId = String(request && request.ownerPlayerId || '').trim();
            if (ownerPlayerId) return ownerPlayerId === String(context && context.playerId || '').trim();
            const ownerSheetKey = String(request && request.ownerSheetKey || '').trim();
            if (ownerSheetKey) {
                return ownerSheetKey === String(context && context.identity && context.identity.sheetKey || '').trim();
            }
            const ownerName = normalizeOwnerName(request && request.ownerName);
            if (!ownerName) return false;
            const localNames = [
                context && context.linkedPlayer && context.linkedPlayer.name,
                context && context.identity && context.identity.characterName
            ].map(normalizeOwnerName).filter(Boolean);
            return localNames.includes(ownerName);
        };

        const buildAskRollRequest = (label, options = {}, context = {}) => {
            const cleanLabel = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 48);
            if (!cleanLabel) return null;
            const opts = options && typeof options === 'object' ? options : {};
            const ownerName = context && context.linkedPlayer && context.linkedPlayer.name
                ? String(context.linkedPlayer.name).trim()
                : String(context && context.identity && context.identity.characterName || '').trim();
            return {
                label: cleanLabel,
                actionKey: String(opts.actionKey || getQuickRollRequestActionKey(cleanLabel) || '').trim(),
                ownerPlayerId: String(context && context.playerId || '').trim(),
                ownerSheetKey: String(context && context.identity && context.identity.sheetKey || '').trim(),
                ownerName
            };
        };

        const isInitiativeSheetAction = (item) => {
            const action = item && item.action ? item.action : {};
            return String(item && item.key || '').trim() === 'core:initiative'
                || String(action.code || '').trim() === 'rollInitiative()'
                || String(item && item.label || '').trim().toLowerCase() === 'initiative';
        };

        return Object.freeze({
            normalizeRollMode,
            getRollModeLabel,
            applyRollModeToD20Formula,
            searchSheetActions,
            getFocusQuickRollKeys,
            getQuickRollRequestActionKey,
            getAskRollRequestLabelForItem,
            getRollRequestActionKey,
            getAskRollRequestFromPing,
            normalizeOwnerName,
            isAskRollOwner,
            buildAskRollRequest,
            isInitiativeSheetAction
        });
    };

    return Object.freeze({ create });
}));
