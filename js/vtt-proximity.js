(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_PROXIMITY = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PROXIMITY_PROMPT_STATE_LIMIT = 80;
    const PROXIMITY_TRIGGER_KIND_OPTIONS = ['fiction', 'skillRoll'];
    const PROXIMITY_TRIGGER_TYPE_OPTIONS = ['enter', 'startTurnNear', 'click', 'reveal'];
    const PROXIMITY_TRIGGER_TYPE_LABELS = Object.freeze({
        enter: 'Enter Area',
        startTurnNear: 'Start Turn Nearby',
        click: 'Click',
        reveal: 'Reveal'
    });
    const PROXIMITY_TRIGGER_TARGET_OPTIONS = ['playerTokens', 'anyVisibleToken'];
    const PROXIMITY_TRIGGER_REPEAT_OPTIONS = ['oncePerToken', 'oncePerScene', 'always'];
    const PROXIMITY_TRIGGER_SKILL_OPTIONS = [
        'acrobatics',
        'animal handling',
        'perception',
        'investigation',
        'insight',
        'arcana',
        'deception',
        'stealth',
        'survival',
        'athletics',
        'intimidation',
        'medicine',
        'nature',
        'performance',
        'persuasion',
        'religion',
        'history',
        'sleight of hand'
    ];
    const PROXIMITY_TRIGGER_SKILL_LABELS = {
        'acrobatics': 'Acrobatics',
        'animal handling': 'Animal Handling',
        'arcana': 'Arcana',
        'athletics': 'Athletics',
        'deception': 'Deception',
        'history': 'History',
        'insight': 'Insight',
        'intimidation': 'Intimidation',
        'investigation': 'Investigation',
        'medicine': 'Medicine',
        'nature': 'Nature',
        'perception': 'Perception',
        'performance': 'Performance',
        'persuasion': 'Persuasion',
        'religion': 'Religion',
        'sleight of hand': 'Sleight Of Hand',
        'stealth': 'Stealth',
        'survival': 'Survival'
    };
    const createModel = (deps = {}) => {
        const {
            buildId,
            clamp,
            normalizeRollMode,
            toNumber,
            toTitleCaseWords
        } = deps;

        const normalizeProximityTriggerSkill = (value) => {
            const clean = String(value || '').trim().toLowerCase();
            if (PROXIMITY_TRIGGER_SKILL_OPTIONS.includes(clean)) return clean;
            return 'perception';
        };
        const normalizeProximityTriggerType = (value, fallback = 'enter') => {
            const clean = String(value || '').trim();
            if (PROXIMITY_TRIGGER_TYPE_OPTIONS.includes(clean)) return clean;
            return PROXIMITY_TRIGGER_TYPE_OPTIONS.includes(fallback) ? fallback : 'enter';
        };
        const getProximitySkillLabel = (value) => PROXIMITY_TRIGGER_SKILL_LABELS[normalizeProximityTriggerSkill(value)] || toTitleCaseWords(value || 'Perception');
        const normalizeProximityTrigger = (trigger, idx = 0) => {
            const source = trigger && typeof trigger === 'object' ? trigger : {};
            const kind = String(source.kind || 'skillRoll').trim();
            const triggerType = String(source.trigger || 'enter').trim();
            const target = String(source.target || 'playerTokens').trim();
            const repeat = String(source.repeat || 'oncePerToken').trim();
            const rawDc = source.dc;
            const hasDc = rawDc !== null && rawDc !== undefined && rawDc !== '';
            const fallbackId = `prompt_${idx + 1}`;
            return {
                id: String(source.id || fallbackId).trim().slice(0, 120) || fallbackId,
                enabled: source.enabled !== undefined ? !!source.enabled : true,
                trigger: normalizeProximityTriggerType(triggerType),
                radiusCells: clamp(Math.round(toNumber(source.radiusCells, 0)), 0, 24),
                target: PROXIMITY_TRIGGER_TARGET_OPTIONS.includes(target) ? target : 'playerTokens',
                repeat: PROXIMITY_TRIGGER_REPEAT_OPTIONS.includes(repeat) ? repeat : 'oncePerToken',
                kind: PROXIMITY_TRIGGER_KIND_OPTIONS.includes(kind) ? kind : 'skillRoll',
                skill: normalizeProximityTriggerSkill(source.skill),
                dc: hasDc ? clamp(Math.round(toNumber(rawDc, 10)), 1, 40) : null,
                dcVisible: !!source.dcVisible,
                revealOnSuccess: !!source.revealOnSuccess,
                clockId: String(source.clockId || '').trim().slice(0, 120),
                clockSuccessDelta: clamp(Math.round(toNumber(source.clockSuccessDelta, 0)), -20, 20),
                clockFailDelta: clamp(Math.round(toNumber(source.clockFailDelta, 0)), -20, 20),
                title: String(source.title || 'Something catches your attention').trim().slice(0, 160) || 'Something catches your attention',
                body: String(source.body || '').trim().slice(0, 800),
                successText: String(source.successText || '').trim().slice(0, 600),
                failText: String(source.failText || '').trim().slice(0, 600)
            };
        };
        const normalizeProximityTriggers = (triggers) => (
            Array.isArray(triggers)
                ? triggers.map((entry, idx) => normalizeProximityTrigger(entry, idx)).slice(0, 12)
                : []
        );
        const normalizeProximityPromptResult = (result, trigger = null) => {
            const source = result && typeof result === 'object' ? result : null;
            if (!source) return null;
            const rawSuccess = source.success;
            const rawTotal = source.total;
            const numericTotal = Number(rawTotal);
            return {
                ok: !!source.ok,
                total: Number.isFinite(numericTotal) ? Math.round(numericTotal) : String(rawTotal || '').slice(0, 40),
                formula: String(source.formula || '').slice(0, 160),
                label: String(source.label || getProximitySkillLabel(trigger && trigger.skill)).slice(0, 120),
                success: rawSuccess === true ? true : (rawSuccess === false ? false : null),
                rollMode: normalizeRollMode(source.rollMode),
                persisted: source.persisted !== undefined ? !!source.persisted : true
            };
        };
        const normalizeProximityPromptStateEntry = (entry, idx = 0) => {
            const source = entry && typeof entry === 'object' ? entry : {};
            const fallbackKey = `prompt_state_${idx + 1}`;
            const key = String(source.key || source.id || fallbackKey).trim().slice(0, 320) || fallbackKey;
            const at = Math.max(0, Math.round(toNumber(source.at, Date.now())));
            const resolvedAt = Math.max(0, Math.round(toNumber(source.resolvedAt, 0)));
            const dismissedAt = Math.max(0, Math.round(toNumber(source.dismissedAt, 0)));
            return {
                key,
                sceneId: String(source.sceneId || '').trim().slice(0, 120),
                triggerId: String(source.triggerId || '').trim().slice(0, 120),
                tokenId: String(source.tokenId || '').trim().slice(0, 120),
                at,
                resolvedAt,
                dismissed: !!source.dismissed,
                dismissedAt,
                result: normalizeProximityPromptResult(source.result)
            };
        };
        const normalizeProximityPromptStates = (states) => (
            Array.isArray(states)
                ? states.map((entry, idx) => normalizeProximityPromptStateEntry(entry, idx)).slice(-PROXIMITY_PROMPT_STATE_LIMIT)
                : []
        );
        const buildSeededProximityTrigger = (seed = 'perception') => {
            const cleanSeed = String(seed || 'perception').trim().toLowerCase();
            if (cleanSeed === 'fiction') {
                return normalizeProximityTrigger({
                    id: buildId('prompt'),
                    kind: 'fiction',
                    title: 'A detail surfaces',
                    body: 'Describe the sensory detail, clue, or pressure beat the players notice here.',
                    radiusCells: 0
                });
            }
            const skill = normalizeProximityTriggerSkill(cleanSeed);
            return normalizeProximityTrigger({
                id: buildId('prompt'),
                kind: 'skillRoll',
                skill,
                dc: 15,
                dcVisible: false,
                title: `${getProximitySkillLabel(skill)} prompt`,
                body: `Something here invites a ${getProximitySkillLabel(skill)} check.`,
                successText: 'On a success, give the player a concrete, actionable detail.',
                failText: 'On a miss, give texture or partial information without stopping play.',
                radiusCells: 0
            });
        };
        return Object.freeze({
            PROXIMITY_PROMPT_STATE_LIMIT,
            PROXIMITY_TRIGGER_KIND_OPTIONS,
            PROXIMITY_TRIGGER_TYPE_OPTIONS,
            PROXIMITY_TRIGGER_TYPE_LABELS,
            PROXIMITY_TRIGGER_TARGET_OPTIONS,
            PROXIMITY_TRIGGER_REPEAT_OPTIONS,
            PROXIMITY_TRIGGER_SKILL_OPTIONS,
            PROXIMITY_TRIGGER_SKILL_LABELS,
            normalizeProximityTriggerType,
            normalizeProximityTriggerSkill,
            getProximitySkillLabel,
            normalizeProximityTrigger,
            normalizeProximityTriggers,
            normalizeProximityPromptResult,
            normalizeProximityPromptStateEntry,
            normalizeProximityPromptStates,
            buildSeededProximityTrigger
        });
    };

    const createController = (deps = {}) => {
        const {
            canRoleMoveToken,
            collectFogCellSet,
            escapeHtml,
            getActiveCaseId,
            getActiveScene,
            getActiveSheetBundle,
            getEvidenceNoteCellBounds,
            getEvidenceNoteDisplayTitle,
            getLocalRollMode,
            getLocalView,
            getProximitySkillLabel,
            getRenderableTokenCells,
            getRollModeLabel,
            getRosterPlayerForRecord,
            getSceneById,
            getSceneCellPx,
            getSceneEvidenceNotes,
            getSheetMod,
            getSheetPB,
            getSheetSkillMiscBonus,
            getTokenById,
            getVisibleTokensForRole,
            isDragging,
            isEvidenceNoteVisibleToRole,
            isInitialLoadPending,
            isPlayer,
            normalizeClockCurrent,
            normalizeClockMax,
            normalizeProximityPromptResult,
            normalizeProximityPromptStateEntry,
            normalizeProximityPromptStates,
            normalizeProximityTrigger,
            normalizeProximityTriggers,
            normalizeProximityTriggerSkill,
            normalizeRollMode,
            postSheetDiscordRoll,
            promptStackEl,
            readJSONStorage,
            rollRawD20WithMode,
            rollSheetD20,
            scaleForZoom,
            sheetSkillsMap,
            stageEl,
            toNumber,
            withDraft
        } = deps;
        const promptStoragePrefix = String(deps.promptStoragePrefix || 'rtf_vtt_proximity_seen_');
        const proximitySettleMs = Math.max(0, Math.round(toNumber(deps.proximitySettleMs, 400)));
        const scheduleTimeout = typeof deps.setTimeout === 'function' ? deps.setTimeout : setTimeout;
        const cancelTimeout = typeof deps.clearTimeout === 'function' ? deps.clearTimeout : clearTimeout;
        let activePrompt = null;
        let lastRenderedPromptMarkup = '';
        let lastEvaluatedPositionSignature = '';
        let lastEvaluatedSceneId = '';
        let pendingPositionSignature = '';
        let proximityEvaluationTimer = 0;
        const suppressedPromptKeys = new Set();

        const buildProximityPositionSignature = (scene) => {
            const sceneId = String(scene && scene.id || '').trim();
            const tokens = getVisibleTokensForRole(scene, 'player');
            return `${sceneId}|${tokens.map((token) => [
                String(token && token.id || '').trim(),
                toNumber(token && token.x, 0),
                toNumber(token && token.y, 0),
                Math.max(1, toNumber(token && token.w, 1)),
                Math.max(1, toNumber(token && token.h, 1))
            ].join(':')).join(';')}`;
        };

        const cancelPendingProximityEvaluation = () => {
            if (proximityEvaluationTimer) cancelTimeout(proximityEvaluationTimer);
            proximityEvaluationTimer = 0;
            pendingPositionSignature = '';
        };

        const schedulePendingProximityEvaluation = () => {
            if (proximityEvaluationTimer) cancelTimeout(proximityEvaluationTimer);
            proximityEvaluationTimer = scheduleTimeout(() => {
                proximityEvaluationTimer = 0;
                if (isDragging()) {
                    schedulePendingProximityEvaluation();
                    return;
                }
                evaluateProximityTriggers({ immediate: true });
                renderProximityPrompt();
            }, proximitySettleMs);
        };

        const getProximitySeenStorageKey = () => `${promptStoragePrefix}${getActiveCaseId() || 'case'}`;
        const readProximitySeenMap = () => {
            const raw = readJSONStorage(getProximitySeenStorageKey(), {});
            return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        };
        const writeProximitySeenMap = (seenMap) => {
            try {
                localStorage.setItem(getProximitySeenStorageKey(), JSON.stringify(seenMap && typeof seenMap === 'object' ? seenMap : {}));
            } catch (err) { }
        };
        const getTokenCellRect = (token) => {
            if (!token) return null;
            const left = toNumber(token.x, 0);
            const top = toNumber(token.y, 0);
            const width = Math.max(1, toNumber(token.w, 1));
            const height = Math.max(1, toNumber(token.h, 1));
            return { left, top, right: left + width, bottom: top + height, width, height };
        };
        const getEvidenceNoteTriggerRect = (scene, note) => {
            const bounds = getEvidenceNoteCellBounds(scene, note);
            if (!bounds) return null;
            return {
                left: bounds.left,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
                width: bounds.widthCells,
                height: bounds.heightCells
            };
        };
        const doCellRectsOverlap = (left, right) => !!(
            left && right
            && left.left < right.right
            && left.right > right.left
            && left.top < right.bottom
            && left.bottom > right.top
        );
        const getCellRectDistance = (left, right) => {
            if (!left || !right) return Infinity;
            if (doCellRectsOverlap(left, right)) return 0;
            const dx = Math.max(0, right.left - left.right, left.left - right.right);
            const dy = Math.max(0, right.top - left.bottom, left.top - right.bottom);
            return Math.hypot(dx, dy);
        };
        const getCellRectCenter = (rect) => {
            if (!rect) return null;
            return {
                x: toNumber(rect.left, 0) + Math.max(1, toNumber(rect.width, 1)) / 2,
                y: toNumber(rect.top, 0) + Math.max(1, toNumber(rect.height, 1)) / 2
            };
        };
        const getCellRectCenterDistance = (left, right) => {
            const leftCenter = getCellRectCenter(left);
            const rightCenter = getCellRectCenter(right);
            if (!leftCenter || !rightCenter) return Infinity;
            return Math.hypot(rightCenter.x - leftCenter.x, rightCenter.y - leftCenter.y);
        };
        const isWithinProximityRadius = (sourceRect, targetRect, radiusCells = 0) => {
            const radius = Math.max(0, Math.round(toNumber(radiusCells, 0)));
            return radius <= 0
                ? doCellRectsOverlap(sourceRect, targetRect)
                : getCellRectDistance(sourceRect, targetRect) <= radius;
        };
        const isWithinTokenProximityRadius = (sourceRect, targetRect, radiusCells = 0) => {
            const radius = Math.max(0, Math.round(toNumber(radiusCells, 0)));
            return getCellRectCenterDistance(sourceRect, targetRect) <= radius;
        };
        const isPlayerFacingToken = (token) => {
            const side = String(token && token.side || '').trim().toLowerCase();
            const sourceType = String(token && token.sourceType || '').trim().toLowerCase();
            return side === 'player' || sourceType === 'player';
        };
        const getProximityTargetTokens = (scene, trigger, sourceToken = null) => {
            const visibleTokens = getVisibleTokensForRole(scene, 'player');
            const target = String(trigger && trigger.target || 'playerTokens').trim();
            return visibleTokens.filter((token) => {
                if (!token || (sourceToken && token.id === sourceToken.id)) return false;
                if (target === 'anyVisibleToken') return true;
                return isPlayerFacingToken(token);
            });
        };
        const getProximityPromptSeenKey = (scene, sourceKind, sourceId, trigger, token, occurrenceKey = '') => {
            const normalized = normalizeProximityTrigger(trigger);
            const tokenPart = normalized.repeat === 'oncePerScene'
                ? 'scene'
                : String(token && token.id || 'token').trim();
            const occurrencePart = normalized.trigger === 'startTurnNear' && normalized.repeat === 'always'
                ? String(occurrenceKey || 'turn').trim()
                : '';
            return [
                String(scene && scene.id || '').trim(),
                String(sourceKind || '').trim(),
                String(sourceId || '').trim(),
                normalized.id,
                tokenPart,
                occurrencePart
            ].join('|');
        };
        const getProximitySeenEntry = (seenMap, key) => {
            if (!seenMap || !key || !seenMap[key]) return null;
            const entry = seenMap[key];
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry;
            return { at: Number.isFinite(Number(entry)) ? Number(entry) : Date.now() };
        };
        const getProximityPromptStateEntry = (source, key) => {
            const cleanKey = String(key || '').trim();
            if (!source || !cleanKey) return null;
            return normalizeProximityPromptStates(source.proximityPromptStates)
                .find((entry) => entry.key === cleanKey) || null;
        };
        const getPersistedProximityResult = (source, seenMap, key, trigger) => {
            const stateEntry = getProximityPromptStateEntry(source, key);
            const stateResult = normalizeProximityPromptResult(stateEntry && stateEntry.result, trigger);
            if (stateResult) return { ...stateResult, persisted: true };
            const legacyEntry = getProximitySeenEntry(seenMap, key);
            const legacyResult = normalizeProximityPromptResult(legacyEntry && legacyEntry.result, trigger);
            return legacyResult ? { ...legacyResult, persisted: true } : null;
        };
        const isProximityPromptSeen = (source, seenMap, key, trigger) => {
            const normalized = normalizeProximityTrigger(trigger);
            if (suppressedPromptKeys.has(key)) return true;
            if (normalized.repeat === 'always') return false;
            const stateEntry = getProximityPromptStateEntry(source, key);
            if (stateEntry && stateEntry.result) return false;
            if (stateEntry) return true;
            const legacyEntry = getProximitySeenEntry(seenMap, key);
            if (legacyEntry && legacyEntry.result) return false;
            return !!legacyEntry;
        };
        const writeLocalProximityPromptState = (entry) => {
            const normalized = normalizeProximityPromptStateEntry(entry);
            if (!normalized.key) return;
            const seenMap = readProximitySeenMap();
            const previous = getProximitySeenEntry(seenMap, normalized.key) || {};
            seenMap[normalized.key] = {
                ...previous,
                ...normalized,
                at: previous.at || normalized.at || Date.now()
            };
            writeProximitySeenMap(seenMap);
        };
        const findProximityPromptSource = (scene, prompt) => {
            if (!scene || !prompt) return null;
            const sourceId = String(prompt.sourceId || '').trim();
            if (!sourceId) return null;
            if (prompt.sourceKind === 'token') {
                const tokens = Array.isArray(scene.tokens) ? scene.tokens : [];
                return tokens.find((token) => String(token && token.id || '').trim() === sourceId) || null;
            }
            if (prompt.sourceKind === 'note') {
                const notes = Array.isArray(scene.evidenceNotes) ? scene.evidenceNotes : [];
                return notes.find((note) => String(note && note.id || '').trim() === sourceId) || null;
            }
            return null;
        };
        const upsertProximityPromptState = (source, entry) => {
            if (!source || !entry || !entry.key) return false;
            const states = normalizeProximityPromptStates(source.proximityPromptStates);
            const idx = states.findIndex((candidate) => candidate.key === entry.key);
            const previous = idx >= 0 ? states[idx] : {};
            const merged = {
                ...previous,
                ...entry,
                at: previous.at || entry.at || Date.now()
            };
            if (!Object.prototype.hasOwnProperty.call(entry, 'result')) {
                merged.result = previous.result || null;
            }
            const next = normalizeProximityPromptStateEntry({
                ...merged
            }, idx >= 0 ? idx : states.length);
            if (idx >= 0) states[idx] = next;
            else states.push(next);
            source.proximityPromptStates = normalizeProximityPromptStates(states);
            return true;
        };
        const buildProximityPromptStateEntry = (prompt, patch = {}) => {
            const trigger = normalizeProximityTrigger((patch && patch.trigger) || (prompt && prompt.trigger));
            const hasResultPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'result');
            const entry = normalizeProximityPromptStateEntry({
                key: prompt && prompt.key,
                sceneId: prompt && prompt.sceneId,
                triggerId: trigger.id,
                tokenId: prompt && prompt.tokenId,
                at: Date.now(),
                ...patch,
                result: hasResultPatch ? normalizeProximityPromptResult(patch.result, trigger) : undefined
            });
            if (!hasResultPatch) delete entry.result;
            return entry;
        };
        const persistProximityPromptState = (prompt, patch = {}, options = {}) => {
            if (!prompt || !prompt.key) return false;
            const entry = buildProximityPromptStateEntry(prompt, patch);
            let wroteSourceState = false;
            const persisted = withDraft((draft) => {
                const scene = getSceneById(prompt.sceneId, draft) || getActiveScene(draft);
                const source = findProximityPromptSource(scene, prompt);
                if (!source) return;
                wroteSourceState = upsertProximityPromptState(source, entry);
            }, { reason: options.reason || 'proximity-prompt-state' });
            if (!persisted || !wroteSourceState) writeLocalProximityPromptState(entry);
            return !!(persisted && wroteSourceState);
        };
        const persistProximityPromptResult = (prompt, result, trigger) => {
            if (!prompt || !prompt.key || !result) return false;
            return persistProximityPromptState(prompt, {
                trigger,
                resolvedAt: Date.now(),
                dismissed: false,
                dismissedAt: 0,
                result
            }, { reason: 'proximity-prompt-result' });
        };
        const markProximityPromptDismissed = (prompt) => {
            if (!prompt || !prompt.key) return false;
            if (prompt.result) return false;
            return persistProximityPromptState(prompt, {
                dismissed: true,
                dismissedAt: Date.now()
            }, { reason: 'proximity-prompt-dismissed' });
        };
        const getProximitySourceAnchorCells = (scene, sourceKind, source, sourceRect = null) => {
            if (!source) return null;
            const rect = sourceRect || (sourceKind === 'note'
                ? getEvidenceNoteTriggerRect(scene, source)
                : getTokenCellRect(source));
            if (!rect) return null;
            return {
                x: toNumber(rect.left, 0) + Math.max(1, toNumber(rect.width, 1)) / 2,
                y: toNumber(rect.top, 0)
            };
        };
        const buildProximityCandidate = ({ scene, sourceKind, source, sourceRect = null, trigger, token, distance, result = null, occurrenceKey = '' }) => {
            const normalized = normalizeProximityTrigger(trigger);
            const sourceId = String(source && source.id || '').trim();
            const key = getProximityPromptSeenKey(scene, sourceKind, sourceId, normalized, token, occurrenceKey);
            const sourceAnchor = getProximitySourceAnchorCells(scene, sourceKind, source, sourceRect);
            return {
                key,
                sceneId: String(scene && scene.id || '').trim(),
                sourceKind,
                sourceId,
                sourceLabel: sourceKind === 'note'
                    ? getEvidenceNoteDisplayTitle(source)
                    : String(source && source.label || 'Token').trim(),
                tokenId: String(token && token.id || '').trim(),
                tokenLabel: String(token && token.label || 'Token').trim(),
                tokenAnchorCellX: toNumber(token && token.x, 0) + Math.max(1, toNumber(token && token.w, 1)) / 2,
                tokenAnchorCellY: toNumber(token && token.y, 0),
                sourceAnchorCellX: sourceAnchor ? sourceAnchor.x : null,
                sourceAnchorCellY: sourceAnchor ? sourceAnchor.y : null,
                distance: Number.isFinite(distance) ? distance : 0,
                occurrenceKey: String(occurrenceKey || '').trim(),
                trigger: normalized,
                result
            };
        };
        const getProximityPromptToken = (scene, prompt = activePrompt) => {
            const tokenId = String(prompt && prompt.tokenId || '').trim();
            if (!scene || !tokenId) return null;
            return getVisibleTokensForRole(scene, 'player').find((token) => String(token && token.id || '').trim() === tokenId) || null;
        };
        const canInteractWithProximityPrompt = (prompt = activePrompt) => {
            if (!isPlayer() || !prompt) return false;
            const token = getTokenById(prompt.tokenId);
            return !!(token && canRoleMoveToken(token, 'player'));
        };
        const getProximityPromptSourceToken = (scene, prompt = activePrompt) => {
            if (!scene || !prompt || prompt.sourceKind !== 'token') return null;
            const sourceId = String(prompt.sourceId || '').trim();
            if (!sourceId) return null;
            return getVisibleTokensForRole(scene, 'player').find((token) => String(token && token.id || '').trim() === sourceId) || null;
        };
        const getProximityPromptAnchorWorldPoint = (scene, prompt = activePrompt) => {
            if (!scene || !scene.grid) return null;
            const cellPx = getSceneCellPx(scene);
            const sourceToken = getProximityPromptSourceToken(scene, prompt);
            if (sourceToken) {
                const renderedCells = getRenderableTokenCells(sourceToken, scene, Date.now());
                return {
                    x: toNumber(scene.grid.offsetX, 0) + (toNumber(renderedCells.x, sourceToken.x) + Math.max(1, toNumber(sourceToken.w, 1)) / 2) * cellPx,
                    y: toNumber(scene.grid.offsetY, 0) + toNumber(renderedCells.y, sourceToken.y) * cellPx
                };
            }
            if (prompt && prompt.sourceKind === 'note') {
                const sourceNote = findProximityPromptSource(scene, prompt);
                const sourceAnchor = sourceNote ? getProximitySourceAnchorCells(scene, 'note', sourceNote) : null;
                if (sourceAnchor) {
                    return {
                        x: toNumber(scene.grid.offsetX, 0) + sourceAnchor.x * cellPx,
                        y: toNumber(scene.grid.offsetY, 0) + sourceAnchor.y * cellPx
                    };
                }
            }
            if (!Number.isFinite(Number(prompt && prompt.sourceAnchorCellX)) || !Number.isFinite(Number(prompt && prompt.sourceAnchorCellY))) return null;
            return {
                x: toNumber(scene.grid.offsetX, 0) + toNumber(prompt.sourceAnchorCellX, 0) * cellPx,
                y: toNumber(scene.grid.offsetY, 0) + toNumber(prompt.sourceAnchorCellY, 0) * cellPx
            };
        };
        const positionProximityPrompt = (scene = getActiveScene()) => {
            if (!promptStackEl || !activePrompt || promptStackEl.hidden) return false;
            const anchor = getProximityPromptAnchorWorldPoint(scene, activePrompt);
            if (!anchor) {
                promptStackEl.hidden = true;
                return false;
            }
            promptStackEl.dataset.worldLeft = String(anchor.x);
            promptStackEl.dataset.worldTop = String(anchor.y);
            promptStackEl.style.left = `${scaleForZoom(anchor.x)}px`;
            promptStackEl.style.top = `${scaleForZoom(anchor.y)}px`;
            if (stageEl) {
                const stageRect = stageEl.getBoundingClientRect();
                const anchorStageY = getLocalView().y + scaleForZoom(anchor.y);
                const useBelow = anchorStageY < Math.min(180, stageRect.height * 0.24);
                promptStackEl.dataset.placement = useBelow ? 'below' : 'above';
            } else {
                promptStackEl.dataset.placement = 'above';
            }
            return true;
        };
        const collectProximityPromptCandidatesForEvent = (scene, triggerEvent = 'enter', options = {}) => {
            if (!scene) return [];
            const cleanTriggerEvent = String(triggerEvent || 'enter').trim();
            const targetTokenId = String(options && options.targetTokenId || '').trim();
            const occurrenceKey = String(options && options.occurrenceKey || '').trim();
            const seenMap = readProximitySeenMap();
            const candidates = [];
            const visibleTokens = getVisibleTokensForRole(scene, 'player');
            const playerFogCellSet = collectFogCellSet(scene, Array.isArray(scene && scene.fog) ? scene.fog : []);
            const sourceNotes = getSceneEvidenceNotes(scene);
            const getEventTargetTokens = (trigger, sourceToken = null) => getProximityTargetTokens(scene, trigger, sourceToken)
                .filter((token) => !targetTokenId || String(token && token.id || '').trim() === targetTokenId);
            sourceNotes.forEach((note) => {
                const sourceRect = getEvidenceNoteTriggerRect(scene, note);
                if (!sourceRect) return;
                const noteVisible = isEvidenceNoteVisibleToRole(note, scene, 'player', playerFogCellSet);
                normalizeProximityTriggers(note.triggers)
                    .filter((trigger) => trigger.enabled && trigger.trigger === cleanTriggerEvent)
                    .forEach((trigger) => {
                        if (!noteVisible && !(trigger.kind === 'skillRoll' && trigger.revealOnSuccess)) return;
                        getEventTargetTokens(trigger).forEach((token) => {
                            const tokenRect = getTokenCellRect(token);
                            if (!isWithinProximityRadius(sourceRect, tokenRect, trigger.radiusCells)) return;
                            const key = getProximityPromptSeenKey(scene, 'note', note.id, trigger, token, occurrenceKey);
                            if (suppressedPromptKeys.has(key)) return;
                            const persistedResult = getPersistedProximityResult(note, seenMap, key, trigger);
                            if (persistedResult) {
                                candidates.push(buildProximityCandidate({
                                    scene,
                                    sourceKind: 'note',
                                    source: note,
                                    sourceRect,
                                    trigger,
                                    token,
                                    distance: getCellRectDistance(sourceRect, tokenRect),
                                    result: persistedResult,
                                    occurrenceKey
                                }));
                                return;
                            }
                            if (isProximityPromptSeen(note, seenMap, key, trigger)) return;
                            candidates.push(buildProximityCandidate({
                                scene,
                                sourceKind: 'note',
                                source: note,
                                sourceRect,
                                trigger,
                                token,
                                distance: getCellRectDistance(sourceRect, tokenRect),
                                occurrenceKey
                            }));
                        });
                    });
            });
            visibleTokens.forEach((sourceToken) => {
                const sourceRect = getTokenCellRect(sourceToken);
                if (!sourceRect) return;
                normalizeProximityTriggers(sourceToken.triggers)
                    .filter((trigger) => trigger.enabled && trigger.trigger === cleanTriggerEvent)
                    .forEach((trigger) => {
                        getEventTargetTokens(trigger, sourceToken).forEach((token) => {
                            const tokenRect = getTokenCellRect(token);
                            if (!isWithinTokenProximityRadius(sourceRect, tokenRect, trigger.radiusCells)) return;
                            const key = getProximityPromptSeenKey(scene, 'token', sourceToken.id, trigger, token, occurrenceKey);
                            if (suppressedPromptKeys.has(key)) return;
                            const persistedResult = getPersistedProximityResult(sourceToken, seenMap, key, trigger);
                            if (persistedResult) {
                                candidates.push(buildProximityCandidate({
                                    scene,
                                    sourceKind: 'token',
                                    source: sourceToken,
                                    sourceRect,
                                    trigger,
                                    token,
                                    distance: getCellRectCenterDistance(sourceRect, tokenRect),
                                    result: persistedResult,
                                    occurrenceKey
                                }));
                                return;
                            }
                            if (isProximityPromptSeen(sourceToken, seenMap, key, trigger)) return;
                            candidates.push(buildProximityCandidate({
                                scene,
                                sourceKind: 'token',
                                source: sourceToken,
                                sourceRect,
                                trigger,
                                token,
                                distance: getCellRectCenterDistance(sourceRect, tokenRect),
                                occurrenceKey
                            }));
                        });
                    });
            });
            return candidates.sort((left, right) => left.distance - right.distance);
        };
        const collectProximityPromptCandidates = (scene) => collectProximityPromptCandidatesForEvent(scene, 'enter');
        const collectStartTurnNearCandidates = (scene, tokenId, occurrenceKey = '') => (
            collectProximityPromptCandidatesForEvent(scene, 'startTurnNear', {
                targetTokenId: tokenId,
                occurrenceKey
            })
        );
        const isStartTurnPrompt = (prompt) => !!(
            prompt && normalizeProximityTrigger(prompt.trigger).trigger === 'startTurnNear'
        );
        const evaluateStartTurnNear = (options = {}) => {
            if (isInitialLoadPending()) return null;
            const cleanOptions = options && typeof options === 'object' ? options : {};
            const sceneId = String(cleanOptions.sceneId || '').trim();
            const tokenId = String(cleanOptions.tokenId || '').trim();
            if (!tokenId) {
                if (isStartTurnPrompt(activePrompt)) activePrompt = null;
                return null;
            }
            const scene = (sceneId ? getSceneById(sceneId) : null) || getActiveScene();
            if (!scene) return null;
            const occurrenceKey = String(
                cleanOptions.turnKey
                || cleanOptions.occurrenceKey
                || [cleanOptions.round, cleanOptions.entryId || tokenId].filter((value) => value !== undefined && value !== null && value !== '').join(':')
                || tokenId
            ).trim();
            const candidates = collectStartTurnNearCandidates(scene, tokenId, occurrenceKey);
            const nextPrompt = candidates.find((candidate) => canInteractWithProximityPrompt(candidate)) || candidates[0] || null;
            if (nextPrompt) {
                activePrompt = nextPrompt;
                return nextPrompt;
            }
            if (isStartTurnPrompt(activePrompt)) activePrompt = null;
            return null;
        };
        const evaluateProximityTriggers = (options = {}) => {
            if (isDragging()) return;
            if (isInitialLoadPending()) {
                cancelPendingProximityEvaluation();
                activePrompt = null;
                return;
            }
            const scene = getActiveScene();
            if (!scene) {
                cancelPendingProximityEvaluation();
                lastEvaluatedPositionSignature = '';
                lastEvaluatedSceneId = '';
                activePrompt = null;
                return;
            }
            const sceneId = String(scene.id || '').trim();
            const positionSignature = buildProximityPositionSignature(scene);
            const immediate = !!(options && options.immediate);
            if (lastEvaluatedSceneId && sceneId !== lastEvaluatedSceneId) {
                cancelPendingProximityEvaluation();
                lastEvaluatedPositionSignature = positionSignature;
                lastEvaluatedSceneId = sceneId;
            } else if (!immediate && lastEvaluatedPositionSignature && positionSignature !== lastEvaluatedPositionSignature) {
                if (positionSignature !== pendingPositionSignature) {
                    pendingPositionSignature = positionSignature;
                    schedulePendingProximityEvaluation();
                } else if (!proximityEvaluationTimer) {
                    schedulePendingProximityEvaluation();
                }
                return;
            } else {
                if (pendingPositionSignature) cancelPendingProximityEvaluation();
                lastEvaluatedPositionSignature = positionSignature;
                lastEvaluatedSceneId = sceneId;
            }
            if (isStartTurnPrompt(activePrompt) && activePrompt.sceneId === scene.id) {
                const source = findProximityPromptSource(scene, activePrompt);
                const token = getProximityPromptToken(scene, activePrompt);
                if (source && token) return;
                activePrompt = null;
            }
            const candidates = collectProximityPromptCandidates(scene);
            if (activePrompt && activePrompt.sceneId === scene.id) {
                const preferred = candidates.find((candidate) => canInteractWithProximityPrompt(candidate)) || null;
                const current = candidates.find((candidate) => candidate.key === activePrompt.key) || null;
                if (preferred && (!current || preferred.key !== current.key)) {
                    activePrompt = preferred;
                    return;
                }
                if (current) {
                    activePrompt = {
                        ...current,
                        result: current.result || activePrompt.result || null
                    };
                    return;
                }
                activePrompt = preferred || candidates[0] || null;
                return;
            }
            activePrompt = candidates.find((candidate) => canInteractWithProximityPrompt(candidate)) || candidates[0] || null;
        };
        const renderProximityPrompt = () => {
            if (!promptStackEl) return;
            if (isDragging()) return;
            if (!activePrompt) {
                if (lastRenderedPromptMarkup || !promptStackEl.hidden) {
                    promptStackEl.innerHTML = '';
                    promptStackEl.hidden = true;
                    lastRenderedPromptMarkup = '';
                }
                return;
            }
            const scene = getSceneById(activePrompt.sceneId) || getActiveScene();
            const prompt = activePrompt;
            const trigger = normalizeProximityTrigger(prompt.trigger);
            const isSkillRoll = trigger.kind === 'skillRoll';
            const skillLabel = getProximitySkillLabel(trigger.skill);
            const dcLabel = isSkillRoll && trigger.dc !== null && trigger.dcVisible ? `DC ${trigger.dc}` : '';
            const narratorLabel = `Narrator${dcLabel ? ` - ${dcLabel}` : ''}`;
            const rollMode = normalizeRollMode(getLocalRollMode());
            const rollModeLabel = getRollModeLabel(rollMode);
            const result = prompt.result || null;
            const resultText = result
                ? `${result.total} - ${result.formula || skillLabel}`
                : '';
            const outcomeText = result && result.success === true
                ? (trigger.successText || 'Success.')
                : (result && result.success === false ? (trigger.failText || 'Miss.') : '');
            const narratorBody = result && outcomeText ? outcomeText : trigger.body;
            const canInteract = canInteractWithProximityPrompt(prompt);
            const observerNote = canInteract || result
                ? ''
                : 'Only a linked player token in range can respond.';
            const nextMarkup = `
                <div class="vtt-proximity-prompt-card">
                    <div class="vtt-proximity-prompt-top">
                        <div>
                            <span class="vtt-proximity-eyebrow">${escapeHtml(narratorLabel)}</span>
                            <strong>${escapeHtml(trigger.title)}</strong>
                        </div>
                        ${canInteract ? '<button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="dismiss-proximity-prompt" aria-label="Dismiss proximity prompt">X</button>' : ''}
                    </div>
                    ${narratorBody ? `<div class="vtt-proximity-prompt-body">${escapeHtml(narratorBody)}</div>` : ''}
                    ${result ? `
                        <div class="vtt-proximity-prompt-result">
                            <strong>${escapeHtml(String(result.total))}</strong>
                            <span>${escapeHtml(resultText)}</span>
                        </div>
                    ` : ''}
                    ${canInteract ? `
                        <div class="vtt-proximity-prompt-actions">
                            ${isSkillRoll && !result ? `
                            <button class="vtt-chip-btn strong" type="button" data-action="resolve-proximity-roll">Roll ${escapeHtml(skillLabel)}${rollMode === 'norm' ? '' : ` (${escapeHtml(rollModeLabel)})`}</button>
                            <div class="vtt-roll-mode-toggle vtt-proximity-roll-mode-toggle" role="group" aria-label="Roll mode">
                                ${['adv', 'norm', 'dis'].map((mode) => `
                                    <button class="vtt-chip-btn" type="button" data-action="set-roll-mode" data-roll-mode="${escapeHtml(mode)}" aria-pressed="${mode === rollMode ? 'true' : 'false'}">${escapeHtml(getRollModeLabel(mode))}</button>
                                `).join('')}
                            </div>
                            ` : ''}
                            <button class="vtt-chip-btn" type="button" data-action="dismiss-proximity-prompt">${result || !isSkillRoll ? 'Done' : 'Pass'}</button>
                        </div>
                    ` : (observerNote ? `<div class="vtt-proximity-prompt-note">${escapeHtml(observerNote)}</div>` : '')}
                </div>
            `;
            if (nextMarkup !== lastRenderedPromptMarkup) {
                promptStackEl.innerHTML = nextMarkup;
                lastRenderedPromptMarkup = nextMarkup;
            }
            if (promptStackEl.hidden) promptStackEl.hidden = false;
            if (!positionProximityPrompt(scene)) {
                promptStackEl.innerHTML = '';
                promptStackEl.hidden = true;
                lastRenderedPromptMarkup = '';
            }
        };
        const dismissActiveProximityPrompt = () => {
            if (!canInteractWithProximityPrompt(activePrompt)) return false;
            if (activePrompt && activePrompt.key) {
                suppressedPromptKeys.add(activePrompt.key);
                const trigger = normalizeProximityTrigger(activePrompt.trigger);
                if (!activePrompt.result && trigger.repeat !== 'always') {
                    markProximityPromptDismissed(activePrompt);
                }
            }
            activePrompt = null;
            renderProximityPrompt();
            return true;
        };
        const rollProximitySkillCheck = (token, trigger, rollMode = getLocalRollMode()) => {
            const normalized = normalizeProximityTrigger(trigger);
            const cleanRollMode = normalizeRollMode(rollMode);
            const skill = normalizeProximityTriggerSkill(normalized.skill);
            const skillLabel = getProximitySkillLabel(skill);
            const rosterPlayer = getRosterPlayerForRecord(token);
            const bundle = getActiveSheetBundle(rosterPlayer && rosterPlayer.sheetKey);
            const character = bundle && bundle.character ? bundle.character : null;
            if (!character) {
                const roll = rollRawD20WithMode(cleanRollMode);
                return {
                    ok: true,
                    character: null,
                    label: skillLabel,
                    total: roll.total,
                    formula: roll.formula,
                    type: 'check',
                    detail: '',
                    rollMode: cleanRollMode
                };
            }
            const stat = character.skillOverrides && character.skillOverrides[skill] ? character.skillOverrides[skill] : sheetSkillsMap[skill];
            const profLevel = character.skills && Number.isFinite(Number(character.skills[skill])) ? Number(character.skills[skill]) : 0;
            const bonus = getSheetMod(character, stat) + (profLevel * getSheetPB(character)) + getSheetSkillMiscBonus(character, skill);
            return rollSheetD20(character, bonus, `${skillLabel} (${String(stat || '').toUpperCase()})`, { type: 'check', rollMode: cleanRollMode });
        };
        const applyProximityResolutionEffects = (prompt, trigger, result) => {
            const normalized = normalizeProximityTrigger(trigger);
            const success = result && result.success === true ? true : (result && result.success === false ? false : null);
            if (success === null) return false;
            const clockDelta = success ? normalized.clockSuccessDelta : normalized.clockFailDelta;
            const shouldRevealSource = success && normalized.revealOnSuccess && prompt && prompt.sourceKind === 'note';
            const shouldUpdateClock = !!normalized.clockId && !!clockDelta;
            if (!shouldRevealSource && !shouldUpdateClock) return false;
            return withDraft((draft) => {
                const scene = getSceneById(prompt && prompt.sceneId, draft) || getActiveScene(draft);
                if (!scene) return;
                if (shouldRevealSource && Array.isArray(scene.evidenceNotes)) {
                    const note = scene.evidenceNotes.find((entry) => String(entry && entry.id || '').trim() === String(prompt && prompt.sourceId || '').trim());
                    if (note) note.hidden = false;
                }
                if (shouldUpdateClock && Array.isArray(scene.clocks)) {
                    const clock = scene.clocks.find((entry) => String(entry && entry.id || '').trim() === normalized.clockId);
                    if (clock) {
                        const max = normalizeClockMax(clock.max, 4);
                        clock.max = max;
                        clock.current = normalizeClockCurrent(toNumber(clock.current, 0) + clockDelta, max, 0);
                    }
                }
            }, { reason: 'proximity-resolution-effects' });
        };
        const resolveActiveProximityRoll = () => {
            if (!activePrompt) return false;
            if (!canInteractWithProximityPrompt(activePrompt)) return false;
            const trigger = normalizeProximityTrigger(activePrompt.trigger);
            if (trigger.kind !== 'skillRoll') return false;
            const token = getTokenById(activePrompt.tokenId);
            const rollMode = normalizeRollMode(getLocalRollMode());
            const result = rollProximitySkillCheck(token, trigger, rollMode);
            const hasDc = trigger.dc !== null && trigger.dc !== undefined;
            activePrompt = {
                ...activePrompt,
                result: {
                    ok: !!(result && result.ok),
                    total: result && result.ok ? result.total : 'VTT',
                    formula: result && result.ok ? result.formula : 'No roll available',
                    label: result && result.label ? result.label : getProximitySkillLabel(trigger.skill),
                    success: result && result.ok && hasDc ? result.total >= trigger.dc : null,
                    rollMode
                }
            };
            persistProximityPromptResult(activePrompt, activePrompt.result, trigger);
            applyProximityResolutionEffects(activePrompt, trigger, activePrompt.result);
            if (result && result.ok && result.character) {
                postSheetDiscordRoll(result.character, result.label, result.total, result.formula, result.type, result.detail).catch((err) => {
                    console.warn('VTT proximity roll Discord post failed', err);
                });
            }
            renderProximityPrompt();
            return true;
        };


        const reset = ({ clearSuppressed = false } = {}) => {
            cancelPendingProximityEvaluation();
            activePrompt = null;
            lastRenderedPromptMarkup = '';
            lastEvaluatedPositionSignature = '';
            lastEvaluatedSceneId = '';
            if (clearSuppressed) suppressedPromptKeys.clear();
            if (promptStackEl) {
                promptStackEl.innerHTML = '';
                promptStackEl.hidden = true;
            }
        };

        return Object.freeze({
            dismissActiveProximityPrompt,
            evaluateProximityTriggers,
            evaluateStartTurnNear,
            getActivePrompt: () => activePrompt,
            positionProximityPrompt,
            renderProximityPrompt,
            reset,
            resolveActiveProximityRoll
        });
    };

    return Object.freeze({ createModel, createController });
}));
