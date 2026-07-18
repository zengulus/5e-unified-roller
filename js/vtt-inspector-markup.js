(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_INSPECTOR_MARKUP = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const REQUIRED_FUNCTION_DEPENDENCIES = Object.freeze([
        'buildEvidenceNoteAreaLabel',
        'buildMonsterAssignResultsMarkup',
        'ensureMonsterDirectory',
        'escapeHtml',
        'getActiveScene',
        'getDefaultEvidenceNoteTitle',
        'getEvidenceNoteById',
        'getEvidenceNoteCategoryLabel',
        'getEvidenceNoteCellBounds',
        'getEvidenceNoteCellPoint',
        'getEvidenceNoteDisplayTitle',
        'getEvidenceNoteShapeLabel',
        'getMonsterDirectory',
        'getMonsterStatBlockForToken',
        'getProximitySkillLabel',
        'getRosterPlayerForRecord',
        'getSceneClocks',
        'getSelectedEvidenceNoteId',
        'getSelectedTokenId',
        'getTokenById',
        'getTokenStealthRoll',
        'hasValue',
        'normalizeEvidenceNoteCategory',
        'normalizeEvidenceNoteShape',
        'normalizeMoodEmoji',
        'normalizeMoodLabel',
        'normalizeMoveAccess',
        'normalizeProximityTrigger',
        'normalizeProximityTriggers',
        'positionTokenInspectorPopover',
        'serializeConditions',
        'serializeHp',
        'isDM'
    ]);

    const REQUIRED_ARRAY_CONFIG = Object.freeze([
        'MOOD_EMOJI_OPTIONS',
        'SIDE_OPTIONS'
    ]);

    const REQUIRED_STRING_CONFIG = Object.freeze([
        'EVIDENCE_NOTE_SHAPE_PIN',
        'EVIDENCE_NOTE_SHAPE_ZONE'
    ]);

    const INSPECTOR_SECTION_SELECTOR = 'details[data-inspector-section]';
    const INSPECTOR_FOCUS_ATTRIBUTES = Object.freeze([
        'data-token-field',
        'data-token-vision-field',
        'data-token-monster-search',
        'data-token-monster-id',
        'data-token-monster-option',
        'data-note-field',
        'data-proximity-trigger-field'
    ]);
    const INSPECTOR_FOCUS_CONTEXT_ATTRIBUTES = Object.freeze([
        'data-owner-kind',
        'data-owner-id',
        'data-trigger-id'
    ]);
    const INSPECTOR_FOCUS_SELECTOR = INSPECTOR_FOCUS_ATTRIBUTES
        .map((attribute) => `[${attribute}]`)
        .join(',');
    const PROXIMITY_TRIGGER_EVENT_OPTIONS = Object.freeze([
        Object.freeze({ value: 'enter', label: 'Enter Area' }),
        Object.freeze({ value: 'startTurnNear', label: 'Start Turn Nearby' })
    ]);
    const PROXIMITY_TRIGGER_LEGACY_EVENT_LABELS = Object.freeze({
        click: 'Click (legacy)',
        reveal: 'Reveal (legacy)'
    });

    const validateDependencies = (deps) => {
        if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires a dependency object.');
        }
        const missingFunctions = REQUIRED_FUNCTION_DEPENDENCIES.filter((name) => typeof deps[name] !== 'function');
        if (missingFunctions.length) {
            throw new TypeError(`RTF_VTT_INSPECTOR_MARKUP.create is missing function dependencies: ${missingFunctions.join(', ')}`);
        }
        if (!Array.isArray(deps.proximityTriggerSkillOptions)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires deps.proximityTriggerSkillOptions to be an array.');
        }
        if (!deps.monsterResources || typeof deps.monsterResources !== 'object' || Array.isArray(deps.monsterResources)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires deps.monsterResources.');
        }
        if (!deps.dom || typeof deps.dom !== 'object' || Array.isArray(deps.dom)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires deps.dom.');
        }
        if (typeof deps.getInspectorState !== 'function') {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires deps.getInspectorState.');
        }
        if (!deps.config || typeof deps.config !== 'object' || Array.isArray(deps.config)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create requires deps.config.');
        }
        const missingArrayConfig = REQUIRED_ARRAY_CONFIG.filter((name) => !Array.isArray(deps.config[name]));
        if (missingArrayConfig.length) {
            throw new TypeError(`RTF_VTT_INSPECTOR_MARKUP.create config is missing arrays: ${missingArrayConfig.join(', ')}`);
        }
        const missingStringConfig = REQUIRED_STRING_CONFIG.filter((name) => typeof deps.config[name] !== 'string');
        if (missingStringConfig.length) {
            throw new TypeError(`RTF_VTT_INSPECTOR_MARKUP.create config is missing strings: ${missingStringConfig.join(', ')}`);
        }
        if (!deps.config.EVIDENCE_NOTE_CATEGORY_META
            || typeof deps.config.EVIDENCE_NOTE_CATEGORY_META !== 'object'
            || Array.isArray(deps.config.EVIDENCE_NOTE_CATEGORY_META)) {
            throw new TypeError('RTF_VTT_INSPECTOR_MARKUP.create config is missing EVIDENCE_NOTE_CATEGORY_META.');
        }
    };

    const create = (deps) => {
        validateDependencies(deps);

        const {
            buildEvidenceNoteAreaLabel,
            buildMonsterAssignResultsMarkup,
            ensureMonsterDirectory,
            escapeHtml,
            getActiveScene,
            getDefaultEvidenceNoteTitle,
            getEvidenceNoteById,
            getEvidenceNoteCategoryLabel,
            getEvidenceNoteCellBounds,
            getEvidenceNoteCellPoint,
            getEvidenceNoteDisplayTitle,
            getEvidenceNoteShapeLabel,
            getMonsterDirectory,
            getMonsterStatBlockForToken,
            getProximitySkillLabel,
            getRosterPlayerForRecord,
            getSceneClocks,
            getSelectedEvidenceNoteId,
            getSelectedTokenId,
            getTokenById,
            getTokenStealthRoll,
            hasValue,
            normalizeEvidenceNoteCategory,
            normalizeEvidenceNoteShape,
            normalizeMoodEmoji,
            normalizeMoodLabel,
            normalizeMoveAccess,
            normalizeProximityTrigger,
            normalizeProximityTriggers,
            positionTokenInspectorPopover,
            serializeConditions,
            serializeHp,
            isDM,
            proximityTriggerSkillOptions,
            monsterResources,
            getInspectorState,
            dom,
            config
        } = deps;

        const buildProximityTriggerSeedButtons = (ownerKind, ownerId) => `
        <div class="vtt-chip-row vtt-proximity-seeds">
            ${['perception', 'investigation', 'insight', 'arcana', 'stealth'].map((skill) => `
                <button class="vtt-chip-btn" type="button"
                    data-action="seed-proximity-trigger"
                    data-owner-kind="${escapeHtml(ownerKind)}"
                    data-owner-id="${escapeHtml(ownerId)}"
                    data-seed="${escapeHtml(skill)}">${escapeHtml(getProximitySkillLabel(skill))}</button>
            `).join('')}
            <button class="vtt-chip-btn" type="button"
                data-action="seed-proximity-trigger"
                data-owner-kind="${escapeHtml(ownerKind)}"
                data-owner-id="${escapeHtml(ownerId)}"
                data-seed="fiction">Fiction</button>
        </div>
    `;

        const buildProximityTriggerFieldAttrs = (ownerKind, ownerId, trigger, field) => `
        data-proximity-trigger-field="${escapeHtml(field)}"
        data-owner-kind="${escapeHtml(ownerKind)}"
        data-owner-id="${escapeHtml(ownerId)}"
        data-trigger-id="${escapeHtml(trigger.id)}"
    `;

        const buildProximityTriggerEditorRow = (ownerKind, ownerId, trigger) => {
            const normalized = normalizeProximityTrigger(trigger);
            const isSkillRoll = normalized.kind === 'skillRoll';
            const sceneClocks = getSceneClocks(getActiveScene());
            const hasClock = !!normalized.clockId;
            const triggerEventOptions = PROXIMITY_TRIGGER_EVENT_OPTIONS.some((option) => option.value === normalized.trigger)
                ? PROXIMITY_TRIGGER_EVENT_OPTIONS
                : [
                    ...PROXIMITY_TRIGGER_EVENT_OPTIONS,
                    {
                        value: normalized.trigger,
                        label: PROXIMITY_TRIGGER_LEGACY_EVENT_LABELS[normalized.trigger] || 'Legacy Event'
                    }
                ];
            return `
            <div class="vtt-proximity-trigger-row" data-trigger-id="${escapeHtml(normalized.id)}">
                <div class="vtt-proximity-trigger-head">
                    <label class="vtt-inspector-check">
                        <input type="checkbox" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'enabled')} ${normalized.enabled ? ' checked' : ''}>
                        <span>Enabled</span>
                    </label>
                    <button class="vtt-inline-btn danger" type="button"
                        data-action="delete-proximity-trigger"
                        data-owner-kind="${escapeHtml(ownerKind)}"
                        data-owner-id="${escapeHtml(ownerId)}"
                        data-trigger-id="${escapeHtml(normalized.id)}">Delete</button>
                </div>
                <label class="vtt-field">
                    <span>Prompt</span>
                    <input class="vtt-inspector-input" type="text" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'title')} value="${escapeHtml(normalized.title)}">
                </label>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>When</span>
                        <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'trigger')}>
                            ${triggerEventOptions.map((option) => `
                                <option value="${escapeHtml(option.value)}"${normalized.trigger === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Kind</span>
                        <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'kind')}>
                            <option value="skillRoll"${isSkillRoll ? ' selected' : ''}>Skill Roll</option>
                            <option value="fiction"${normalized.kind === 'fiction' ? ' selected' : ''}>Fiction</option>
                        </select>
                    </label>
                    ${isSkillRoll ? `
                        <label class="vtt-field">
                            <span>Skill</span>
                            <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'skill')}>
                                ${proximityTriggerSkillOptions.map((skill) => `
                                    <option value="${escapeHtml(skill)}"${normalized.skill === skill ? ' selected' : ''}>${escapeHtml(getProximitySkillLabel(skill))}</option>
                                `).join('')}
                            </select>
                        </label>
                    ` : ''}
                    <label class="vtt-field">
                        <span>Radius</span>
                        <input class="vtt-inspector-input" type="number" min="0" max="24" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'radiusCells')} value="${escapeHtml(String(normalized.radiusCells))}">
                    </label>
                    <label class="vtt-field">
                        <span>Target</span>
                        <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'target')}>
                            <option value="playerTokens"${normalized.target === 'playerTokens' ? ' selected' : ''}>Player Tokens</option>
                            <option value="anyVisibleToken"${normalized.target === 'anyVisibleToken' ? ' selected' : ''}>Any Visible Token</option>
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Repeat</span>
                        <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'repeat')}>
                            <option value="oncePerToken"${normalized.repeat === 'oncePerToken' ? ' selected' : ''}>Once / Token</option>
                            <option value="oncePerScene"${normalized.repeat === 'oncePerScene' ? ' selected' : ''}>Once / Scene</option>
                            <option value="always"${normalized.repeat === 'always' ? ' selected' : ''}>Always</option>
                        </select>
                    </label>
                    ${isSkillRoll ? `
                        <label class="vtt-field">
                            <span>DC</span>
                            <input class="vtt-inspector-input" type="number" min="1" max="40" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'dc')} value="${normalized.dc === null ? '' : escapeHtml(String(normalized.dc))}">
                        </label>
                        <label class="vtt-inspector-check">
                            <input type="checkbox" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'dcVisible')} ${normalized.dcVisible ? ' checked' : ''}>
                            <span>Show DC</span>
                        </label>
                        ${ownerKind === 'note' ? `
                            <label class="vtt-inspector-check">
                                <input type="checkbox" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'revealOnSuccess')} ${normalized.revealOnSuccess ? ' checked' : ''}>
                                <span>Reveal marker on pass</span>
                            </label>
                        ` : ''}
                        <label class="vtt-field">
                            <span>Clock</span>
                            <select class="vtt-inspector-select" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'clockId')}>
                                <option value=""${hasClock ? '' : ' selected'}>No Clock</option>
                                ${sceneClocks.map((clock) => `
                                    <option value="${escapeHtml(String(clock.id || ''))}"${normalized.clockId === String(clock.id || '') ? ' selected' : ''}>${escapeHtml(clock.title || 'Scene Clock')}</option>
                                `).join('')}
                            </select>
                        </label>
                        ${hasClock ? `
                            <label class="vtt-field">
                                <span>Pass Delta</span>
                                <input class="vtt-inspector-input" type="number" min="-20" max="20" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'clockSuccessDelta')} value="${escapeHtml(String(normalized.clockSuccessDelta))}">
                            </label>
                            <label class="vtt-field">
                                <span>Miss Delta</span>
                                <input class="vtt-inspector-input" type="number" min="-20" max="20" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'clockFailDelta')} value="${escapeHtml(String(normalized.clockFailDelta))}">
                            </label>
                        ` : ''}
                    ` : ''}
                </div>
                ${normalized.trigger === 'startTurnNear' ? '<div class="vtt-detail-note">Runs when an eligible initiative-linked token starts its turn within this radius.</div>' : ''}
                <label class="vtt-field">
                    <span>Fiction</span>
                    <textarea class="vtt-inspector-textarea vtt-proximity-textarea" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'body')}>${escapeHtml(normalized.body)}</textarea>
                </label>
                ${isSkillRoll ? `
                    <div class="vtt-inspector-grid">
                        <label class="vtt-field">
                            <span>Success</span>
                            <textarea class="vtt-inspector-textarea vtt-proximity-textarea" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'successText')}>${escapeHtml(normalized.successText)}</textarea>
                        </label>
                        <label class="vtt-field">
                            <span>Miss</span>
                            <textarea class="vtt-inspector-textarea vtt-proximity-textarea" ${buildProximityTriggerFieldAttrs(ownerKind, ownerId, normalized, 'failText')}>${escapeHtml(normalized.failText)}</textarea>
                        </label>
                    </div>
                ` : ''}
            </div>
        `;
        };

        const buildProximityTriggerEditor = (ownerKind, ownerId, triggers = []) => {
            const normalized = normalizeProximityTriggers(triggers);
            return `
            <div class="vtt-proximity-editor">
                ${buildProximityTriggerSeedButtons(ownerKind, ownerId)}
                ${normalized.length
                    ? normalized.map((trigger) => buildProximityTriggerEditorRow(ownerKind, ownerId, trigger)).join('')
                    : '<div class="vtt-empty">No proximity prompts yet.</div>'}
            </div>
        `;
        };

        const getInspectorPopoverTarget = (popover) => ({
            kind: String(popover && typeof popover.getAttribute === 'function'
                ? popover.getAttribute('data-inspector-kind') || ''
                : ''),
            id: String(popover && typeof popover.getAttribute === 'function'
                ? popover.getAttribute('data-inspector-target-id') || ''
                : '')
        });

        const setInspectorPopoverTarget = (popover, kind = '', id = '') => {
            if (!popover || typeof popover.setAttribute !== 'function') return;
            if (!kind || !id) {
                if (typeof popover.removeAttribute === 'function') {
                    popover.removeAttribute('data-inspector-kind');
                    popover.removeAttribute('data-inspector-target-id');
                }
                return;
            }
            popover.setAttribute('data-inspector-kind', kind);
            popover.setAttribute('data-inspector-target-id', id);
        };

        const captureInspectorControlState = (popover) => {
            const ownerDocument = popover && popover.ownerDocument
                ? popover.ownerDocument
                : (typeof document !== 'undefined' ? document : null);
            const activeElement = ownerDocument ? ownerDocument.activeElement : null;
            if (!activeElement || !popover || typeof popover.contains !== 'function' || !popover.contains(activeElement)) {
                return null;
            }
            if (typeof activeElement.hasAttribute !== 'function' || typeof activeElement.getAttribute !== 'function') {
                return null;
            }
            const identity = INSPECTOR_FOCUS_ATTRIBUTES
                .filter((attribute) => activeElement.hasAttribute(attribute))
                .map((attribute) => [attribute, String(activeElement.getAttribute(attribute) || '')]);
            if (!identity.length) return null;
            INSPECTOR_FOCUS_CONTEXT_ATTRIBUTES.forEach((attribute) => {
                if (activeElement.hasAttribute(attribute)) {
                    identity.push([attribute, String(activeElement.getAttribute(attribute) || '')]);
                }
            });
            const selectionStart = Number.isInteger(activeElement.selectionStart)
                ? activeElement.selectionStart
                : null;
            const selectionEnd = Number.isInteger(activeElement.selectionEnd)
                ? activeElement.selectionEnd
                : null;
            return {
                tagName: String(activeElement.tagName || '').toLowerCase(),
                identity,
                selectionStart,
                selectionEnd,
                selectionDirection: typeof activeElement.selectionDirection === 'string'
                    ? activeElement.selectionDirection
                    : undefined
            };
        };

        const captureInspectorPopoverState = (popover, kind, id) => {
            if (!popover || popover.hidden) return null;
            const renderedTarget = getInspectorPopoverTarget(popover);
            if (renderedTarget.kind !== kind || renderedTarget.id !== id) return null;
            const sections = typeof popover.querySelectorAll === 'function'
                ? Array.from(popover.querySelectorAll(INSPECTOR_SECTION_SELECTOR))
                : [];
            return {
                sections: sections.map((section) => [
                    String(section.getAttribute('data-inspector-section') || ''),
                    !!section.open
                ]).filter(([sectionId]) => !!sectionId),
                scrollTop: Number.isFinite(popover.scrollTop) ? popover.scrollTop : 0,
                scrollLeft: Number.isFinite(popover.scrollLeft) ? popover.scrollLeft : 0,
                control: captureInspectorControlState(popover)
            };
        };

        const restoreInspectorPopoverSections = (popover, savedState) => {
            if (!popover || !savedState || !savedState.sections || typeof popover.querySelectorAll !== 'function') return;
            const sectionState = new Map(savedState.sections);
            Array.from(popover.querySelectorAll(INSPECTOR_SECTION_SELECTOR)).forEach((section) => {
                const sectionId = String(section.getAttribute('data-inspector-section') || '');
                if (sectionState.has(sectionId)) section.open = sectionState.get(sectionId);
            });
        };

        const restoreInspectorPopoverFocusAndScroll = (popover, savedState) => {
            if (!popover || !savedState) return;
            const controlState = savedState.control;
            if (controlState && typeof popover.querySelectorAll === 'function') {
                const control = Array.from(popover.querySelectorAll(INSPECTOR_FOCUS_SELECTOR)).find((candidate) => {
                    if (String(candidate.tagName || '').toLowerCase() !== controlState.tagName) return false;
                    return controlState.identity.every(([attribute, value]) => (
                        typeof candidate.hasAttribute === 'function'
                        && candidate.hasAttribute(attribute)
                        && String(candidate.getAttribute(attribute) || '') === value
                    ));
                });
                if (control && typeof control.focus === 'function') {
                    try {
                        control.focus({ preventScroll: true });
                    } catch (_err) {
                        control.focus();
                    }
                    if (controlState.selectionStart !== null
                        && controlState.selectionEnd !== null
                        && typeof control.setSelectionRange === 'function') {
                        try {
                            control.setSelectionRange(
                                controlState.selectionStart,
                                controlState.selectionEnd,
                                controlState.selectionDirection
                            );
                        } catch (_err) {
                            // Number inputs and a few browser-specific controls do not expose a text selection.
                        }
                    }
                }
            }
            popover.scrollTop = savedState.scrollTop;
            popover.scrollLeft = savedState.scrollLeft;
        };

        const buildDMTokenInspectorContent = (token) => {
            const rosterPlayer = getRosterPlayerForRecord(token);
            const isRosterManagedPlayer = !!rosterPlayer;
            const hasCurrentHp = hasValue(token && token.hpCurrent) && Number.isFinite(Number(token.hpCurrent));
            const hasMaxHp = hasValue(token && token.hpMax) && Number.isFinite(Number(token.hpMax));
            const hasPositiveMaxHp = hasMaxHp && Number(token.hpMax) > 0;
            const imageUrlValue = isRosterManagedPlayer
                ? String(rosterPlayer.imageUrl || '').trim()
                : String(token.imageUrl || '').trim();
            const supportsSightCone = !!(token && (token.side === 'enemy' || token.side === 'neutral'));
            const moodEmoji = normalizeMoodEmoji(token && token.moodEmoji);
            const moodLabel = normalizeMoodLabel(token && token.moodLabel);
            const monster = getMonsterStatBlockForToken(token);
            const monsterMeta = monster
                ? [
                    monster.size,
                    monster.type,
                    monster.challengeRating ? `CR ${monster.challengeRating}` : '',
                    monster.hitDice ? `HD ${monster.hitDice}` : ''
                ].filter(Boolean).join(' · ')
                : '';
            const moodOptions = config.MOOD_EMOJI_OPTIONS.includes(moodEmoji) || !moodEmoji
                ? config.MOOD_EMOJI_OPTIONS
                : [moodEmoji, ...config.MOOD_EMOJI_OPTIONS];
            const monsters = getMonsterDirectory();
            if (!monsters.length && !monsterResources.loading) {
                ensureMonsterDirectory().catch((err) => {
                    console.warn('Failed loading monster selector data', err);
                });
            }
            const selectedMonsterId = monster ? String(monster.id || '').trim() : '';
            const monsterAssignQuery = monster ? String(monster.name || '').trim() : '';
            return `
            <div class="vtt-inspector-stack">
                <details class="vtt-inspector-section" data-inspector-section="identity" open>
                    <summary>Identity & Appearance</summary>
                    <div class="vtt-inspector-section-body">
                <label class="vtt-field">
                    <span>Label</span>
                    <input class="vtt-inspector-input" type="text" ${isRosterManagedPlayer ? 'readonly' : 'data-token-field="label"'} value="${escapeHtml(token.label)}">
                </label>
                <div class="vtt-subhead">Hover Mood</div>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Emoji</span>
                        <select class="vtt-inspector-select" data-token-field="moodEmoji">
                            <option value=""${moodEmoji ? '' : ' selected'}>None</option>
                            ${moodOptions.map((emoji) => `<option value="${escapeHtml(emoji)}"${moodEmoji === emoji ? ' selected' : ''}>${escapeHtml(emoji)}</option>`).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Word</span>
                        <input class="vtt-inspector-input" type="text" data-token-field="moodLabel" value="${escapeHtml(moodLabel)}" placeholder="Suspicious">
                    </label>
                </div>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Side</span>
                        <select class="vtt-inspector-select" data-token-field="side">
                            ${config.SIDE_OPTIONS.map((side) => `<option value="${side}"${token.side === side ? ' selected' : ''}>${side}</option>`).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Movement</span>
                        <select class="vtt-inspector-select" data-token-field="moveAccess">
                            <option value="dm"${normalizeMoveAccess(token.moveAccess, 'dm') === 'dm' ? ' selected' : ''}>DM Only</option>
                            <option value="player"${normalizeMoveAccess(token.moveAccess, token.sourceType === 'player' ? 'player' : 'dm') === 'player' ? ' selected' : ''}>Players Can Move</option>
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Image URL</span>
                        <input class="vtt-inspector-input" type="text" data-token-field="imageUrl" value="${escapeHtml(imageUrlValue)}">
                    </label>
                </div>
                    </div>
                </details>
                <details class="vtt-inspector-section" data-inspector-section="stats">
                    <summary>Stats & Size</summary>
                    <div class="vtt-inspector-section-body">
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>HP Current</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="hpCurrent" value="${token.hpCurrent ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>HP Max</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="hpMax" value="${token.hpMax ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>AC</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="ac" value="${token.ac ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Passive Perception</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="passivePerception" value="${token.passivePerception ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Stealth Roll</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="stealthRoll" value="${getTokenStealthRoll(token) ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Width</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="w" min="1" value="${escapeHtml(String(token.w || 1))}">
                    </label>
                    <label class="vtt-field">
                        <span>Height</span>
                        <input class="vtt-inspector-input" type="number" data-token-field="h" min="1" value="${escapeHtml(String(token.h || 1))}">
                    </label>
                </div>
                <div class="vtt-chip-row">
                    <button class="vtt-chip-btn" data-action="token-retry-image" data-id="${escapeHtml(token.id)}" data-image-url="${escapeHtml(imageUrlValue)}"${imageUrlValue ? '' : ' disabled'}>Retry Image</button>
                    <button class="vtt-chip-btn" data-action="set-token-size" data-id="${escapeHtml(token.id)}" data-size="1">1x1</button>
                    <button class="vtt-chip-btn" data-action="set-token-size" data-id="${escapeHtml(token.id)}" data-size="2">2x2</button>
                </div>
                    </div>
                </details>
                <details class="vtt-inspector-section" data-inspector-section="combat">
                    <summary>Combat Actions</summary>
                    <div class="vtt-inspector-section-body">
                <div class="vtt-subhead">Quick Actions</div>
                <div class="vtt-chip-row vtt-inspector-quick-row">
                    <button class="vtt-chip-btn" data-action="token-adjust-hp" data-id="${escapeHtml(token.id)}" data-delta="-5"${hasCurrentHp ? '' : ' disabled'}>-5 HP</button>
                    <button class="vtt-chip-btn" data-action="token-adjust-hp" data-id="${escapeHtml(token.id)}" data-delta="+5"${hasCurrentHp ? '' : ' disabled'}>+5 HP</button>
                    <button class="vtt-chip-btn" data-action="token-set-bloodied" data-id="${escapeHtml(token.id)}"${hasPositiveMaxHp ? '' : ' disabled'}>Bloodied</button>
                    <button class="vtt-chip-btn" data-action="token-set-full-hp" data-id="${escapeHtml(token.id)}"${hasMaxHp ? '' : ' disabled'}>Full HP</button>
                </div>
                <div class="vtt-chip-row vtt-inspector-quick-row">
                    <button class="vtt-chip-btn" data-action="toggle-token-hidden-quick" data-id="${escapeHtml(token.id)}">${token.hidden ? 'Reveal' : 'Hide'}</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Prone">Prone</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Stunned">Stunned</button>
                    <button class="vtt-chip-btn" data-action="token-apply-condition" data-id="${escapeHtml(token.id)}" data-condition="Poisoned">Poisoned</button>
                    <button class="vtt-chip-btn" data-action="token-clear-conditions" data-id="${escapeHtml(token.id)}">Clear Cond</button>
                </div>
                    </div>
                </details>
                <details class="vtt-inspector-section" data-inspector-section="automation">
                    <summary>Automation</summary>
                    <div class="vtt-inspector-section-body">
                <div class="vtt-subhead">Proximity Prompts</div>
                ${buildProximityTriggerEditor('token', token.id, token.triggers)}
                    </div>
                </details>
                <details class="vtt-inspector-section" data-inspector-section="monster">
                    <summary>Monster & Stat Block</summary>
                    <div class="vtt-inspector-section-body">
                ${monster ? `
                    <div class="vtt-subhead">Monster</div>
                    <div class="vtt-detail-note">${escapeHtml(monsterMeta || monster.name)}. Right-click the token and choose Roll stat block / NPC for checks, saves, attacks, and damage.</div>
                ` : ''}
                <div class="vtt-subhead">Assign Monster</div>
                <label class="vtt-field">
                    <span>SRD Stat Block</span>
                    <input class="vtt-inspector-input" type="search" data-token-monster-search placeholder="Filter monsters..." value="${escapeHtml(monsterAssignQuery)}"${monsterResources.loading || !monsters.length ? ' disabled' : ''}>
                    <input type="hidden" data-token-monster-id value="${escapeHtml(selectedMonsterId)}">
                </label>
                <div class="vtt-monster-assign-results" data-token-monster-results>
                    ${buildMonsterAssignResultsMarkup(monsterAssignQuery, selectedMonsterId)}
                </div>
                <div class="vtt-inspector-grid">
                    <label class="vtt-inspector-check">
                        <input type="checkbox" data-token-monster-option="stats" checked>
                        <span>Apply HP / AC / saves</span>
                    </label>
                    <label class="vtt-inspector-check">
                        <input type="checkbox" data-token-monster-option="rename">
                        <span>Rename token</span>
                    </label>
                    <label class="vtt-inspector-check">
                        <input type="checkbox" data-token-monster-option="resize">
                        <span>Resize token</span>
                    </label>
                </div>
                <div class="vtt-chip-row">
                    <button class="vtt-chip-btn strong" type="button" data-action="assign-token-monster" data-id="${escapeHtml(token.id)}"${monsters.length ? '' : ' disabled'}>Assign Monster</button>
                    <button class="vtt-chip-btn" type="button" data-action="clear-token-monster" data-id="${escapeHtml(token.id)}"${monster ? '' : ' disabled'}>Clear Monster</button>
                </div>
                    </div>
                </details>
                <details class="vtt-inspector-section" data-inspector-section="advanced">
                    <summary>Visibility & Advanced</summary>
                    <div class="vtt-inspector-section-body">
                <label class="vtt-inspector-check">
                    <input type="checkbox" data-token-field="hidden"${token.hidden ? ' checked' : ''}>
                    <span>Hidden In Player Mode</span>
                </label>
                <label class="vtt-field">
                    <span>Conditions</span>
                    <textarea class="vtt-inspector-textarea" data-token-field="conditions">${escapeHtml(serializeConditions(token.conditions))}</textarea>
                </label>
                ${supportsSightCone ? `
                    <div class="vtt-subhead">Sight Cone</div>
                    <div class="vtt-inspector-grid">
                        <label class="vtt-inspector-check">
                            <input type="checkbox" data-token-vision-field="enabled"${token.vision && token.vision.enabled ? ' checked' : ''}>
                            <span>Enabled</span>
                        </label>
                        <label class="vtt-field">
                            <span>Facing</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="facingDeg" value="${escapeHtml(String(token.vision && token.vision.facingDeg !== undefined ? token.vision.facingDeg : 0))}">
                        </label>
                        <label class="vtt-field">
                            <span>Angle</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="arcDeg" min="1" max="360" value="${escapeHtml(String(token.vision && token.vision.arcDeg !== undefined ? token.vision.arcDeg : 90))}">
                        </label>
                        <label class="vtt-field">
                            <span>Range</span>
                            <input class="vtt-inspector-input" type="number" data-token-vision-field="baseRangeCells" min="0" max="99" value="${escapeHtml(String(token.vision && token.vision.baseRangeCells !== undefined ? token.vision.baseRangeCells : 6))}">
                        </label>
                    </div>
                ` : ''}
                ${isRosterManagedPlayer ? '<div class="vtt-detail-note">Player token name stays synced from the roster. Updating portrait here also updates that roster entry.</div>' : ''}
                    </div>
                </details>
                <div class="vtt-inspector-actions">
                    <button class="vtt-inline-btn" data-action="clone-token" data-id="${escapeHtml(token.id)}">Clone Token</button>
                    <button class="vtt-inline-btn" data-action="add-token-to-initiative" data-id="${escapeHtml(token.id)}">Add To Initiative</button>
                    <button class="vtt-inline-btn danger" data-action="delete-token" data-id="${escapeHtml(token.id)}">Delete Token</button>
                </div>
            </div>
        `;
        };

        const buildDMEvidenceNoteInspectorContent = (note, scene) => {
            const bounds = getEvidenceNoteCellBounds(scene, note) || {
                left: 0,
                top: 0,
                widthCells: 1,
                heightCells: 1
            };
            const category = normalizeEvidenceNoteCategory(note && note.category);
            const shape = normalizeEvidenceNoteShape(note && note.shape, config.EVIDENCE_NOTE_SHAPE_ZONE);
            const pinPoint = shape === config.EVIDENCE_NOTE_SHAPE_PIN ? getEvidenceNoteCellPoint(scene, note) : null;
            const displayGridX = pinPoint ? pinPoint.x : bounds.left;
            const displayGridY = pinPoint ? pinPoint.y : bounds.top;
            const shapeLabel = getEvidenceNoteShapeLabel(note);
            return `
            <div class="vtt-inspector-stack">
                <label class="vtt-field">
                    <span>Title</span>
                    <input class="vtt-inspector-input" type="text" data-note-field="title" value="${escapeHtml(getEvidenceNoteDisplayTitle(note))}">
                </label>
                <div class="vtt-inspector-grid">
                    <label class="vtt-field">
                        <span>Shape</span>
                        <select class="vtt-inspector-select" data-note-field="shape">
                            <option value="pin"${shape === config.EVIDENCE_NOTE_SHAPE_PIN ? ' selected' : ''}>Pin</option>
                            <option value="zone"${shape === config.EVIDENCE_NOTE_SHAPE_ZONE ? ' selected' : ''}>Zone</option>
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Category</span>
                        <select class="vtt-inspector-select" data-note-field="category">
                            ${Object.entries(config.EVIDENCE_NOTE_CATEGORY_META).map(([value, meta]) => `
                                <option value="${escapeHtml(value)}"${category === value ? ' selected' : ''}>${escapeHtml(meta.label)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Grid X</span>
                        <input class="vtt-inspector-input" type="number" ${shape === config.EVIDENCE_NOTE_SHAPE_PIN ? 'step="0.001"' : 'step="1"'} data-note-field="gridX" value="${escapeHtml(String(displayGridX))}">
                    </label>
                    <label class="vtt-field">
                        <span>Grid Y</span>
                        <input class="vtt-inspector-input" type="number" ${shape === config.EVIDENCE_NOTE_SHAPE_PIN ? 'step="0.001"' : 'step="1"'} data-note-field="gridY" value="${escapeHtml(String(displayGridY))}">
                    </label>
                    ${shape === config.EVIDENCE_NOTE_SHAPE_ZONE ? `
                        <label class="vtt-field">
                            <span>Cells Wide</span>
                            <input class="vtt-inspector-input" type="number" min="1" data-note-field="cellsWide" value="${escapeHtml(String(bounds.widthCells))}">
                        </label>
                        <label class="vtt-field">
                            <span>Cells High</span>
                            <input class="vtt-inspector-input" type="number" min="1" data-note-field="cellsHigh" value="${escapeHtml(String(bounds.heightCells))}">
                        </label>
                    ` : ''}
                </div>
                <label class="vtt-field">
                    <span>Details</span>
                    <textarea class="vtt-inspector-textarea" data-note-field="body" placeholder="What should this ${shapeLabel.toLowerCase()} communicate?">${escapeHtml(note.body || '')}</textarea>
                </label>
                <label class="vtt-inspector-check">
                    <input type="checkbox" data-note-field="hidden"${note.hidden ? ' checked' : ''}>
                    <span>Hidden In Player Mode</span>
                </label>
                <div class="vtt-detail-note">
                    ${note.hidden
                        ? `DM-only ${shapeLabel.toLowerCase()}s stay hidden until you reveal them.`
                        : `Revealed ${shapeLabel.toLowerCase()}s still stay hidden from players while their tagged area is fully covered by fog.`}
                </div>
                <div class="vtt-subhead">Proximity Prompts</div>
                ${buildProximityTriggerEditor('note', String(note.id || ''), note.triggers)}
                <div class="vtt-inspector-actions">
                    <button class="vtt-inline-btn" data-action="toggle-evidence-hidden-quick" data-id="${escapeHtml(String(note.id || ''))}">${note.hidden ? 'Reveal To Players' : 'Hide From Players'}</button>
                    <button class="vtt-inline-btn danger" data-action="delete-evidence-note" data-id="${escapeHtml(String(note.id || ''))}">Delete ${shapeLabel}</button>
                </div>
            </div>
        `;
        };

        const buildEvidenceNoteViewerContent = (note, scene) => `
        <div class="vtt-inspector-stack">
            <div class="vtt-subhead">${escapeHtml(getEvidenceNoteShapeLabel(note))} Indicator</div>
            <div class="vtt-chip-row">
                <span class="vtt-panel-pill">${escapeHtml(getEvidenceNoteCategoryLabel(note && note.category))}</span>
                <span class="vtt-panel-pill">${escapeHtml(buildEvidenceNoteAreaLabel(note, scene))}</span>
            </div>
            <div class="vtt-note-view-body">${escapeHtml(note && note.body ? note.body : 'No marker details shared yet.')}</div>
        </div>
    `;

        const buildTokenDefenceSummary = (token, detail) => `
            <div class="vtt-inspector-stack">
                <div class="vtt-defence-chip-row">
                    <div class="vtt-defence-chip"><span class="vtt-inspector-label">AC</span><strong>${escapeHtml(String(token.ac ?? '-'))}</strong></div>
                    <div class="vtt-defence-chip"><span class="vtt-inspector-label">HP</span><strong>${escapeHtml(serializeHp(token.hpCurrent, token.hpMax).replace('HP ', ''))}</strong></div>
                    <div class="vtt-defence-chip"><span class="vtt-inspector-label">PP</span><strong>${escapeHtml(String(token.passivePerception ?? '-'))}</strong></div>
                </div>
                <div class="vtt-detail-note">${detail}</div>
            </div>
        `;

        const renderTokenInspector = () => {
            const token = getTokenById(getSelectedTokenId());
            const scene = getActiveScene();
            const note = getEvidenceNoteById(getSelectedEvidenceNoteId());
            const inspectorState = getInspectorState();
            if (!dom.selectionPillEl || !dom.tokenInspectorEl) return;
            if (!isDM() && token && token.hidden) {
                dom.selectionPillEl.textContent = 'No Selection';
                dom.tokenInspectorEl.innerHTML = '<div class="vtt-empty">Select a visible token or zone on the map to inspect it.</div>';
                return;
            }
            if (note && !token) {
                dom.selectionPillEl.textContent = getEvidenceNoteDisplayTitle(note);
                dom.tokenInspectorEl.innerHTML = isDM()
                    && inspectorState
                    && inspectorState.kind === 'note'
                    && inspectorState.targetId === note.id
                    ? `
                        <div class="vtt-inspector-stack">
                            <div class="vtt-detail-note">Editing ${escapeHtml(getEvidenceNoteDisplayTitle(note))} in the floating inspector. Right-click another zone to move it, or press Escape to close it.</div>
                        </div>
                    `
                    : (isDM()
                        ? buildDMEvidenceNoteInspectorContent(note, scene)
                        : buildEvidenceNoteViewerContent(note, scene));
                return;
            }
            dom.selectionPillEl.textContent = token ? token.label : 'No Selection';
            if (!token) {
                dom.tokenInspectorEl.innerHTML = isDM()
                    ? '<div class="vtt-empty">Right-click a token, pin, or zone to edit it near your cursor, or click a map marker to edit it here.</div>'
                    : '<div class="vtt-empty">Select a token, pin, or zone on the map to inspect it.</div>';
                return;
            }

            if (!isDM()) {
                dom.tokenInspectorEl.innerHTML = buildTokenDefenceSummary(
                    token,
                    `${escapeHtml(token.label)} is selected. DM-only editing controls are hidden in Player mode.`
                );
                return;
            }

            dom.tokenInspectorEl.innerHTML = inspectorState
                && inspectorState.kind === 'token'
                && inspectorState.targetId === token.id
                ? buildTokenDefenceSummary(
                    token,
                    `Editing ${escapeHtml(token.label)} in the floating inspector. Right-click another token to move it, or press Escape to close it.`
                )
                : buildTokenDefenceSummary(
                    token,
                    `Double-click ${escapeHtml(token.label)} on the map to edit it at your cursor.`
                );
        };

        const renderTokenInspectorPopover = () => {
            if (!dom.tokenInspectorPopoverEl) return;
            const inspectorState = getInspectorState();
            const activePopoverKind = inspectorState && inspectorState.kind === 'note' ? 'note' : 'token';
            const activePopoverId = inspectorState
                ? String(inspectorState.targetId || inspectorState.tokenId || '').trim()
                : '';
            const scene = getActiveScene();
            const token = activePopoverKind === 'token' ? getTokenById(activePopoverId) : null;
            const note = activePopoverKind === 'note' ? getEvidenceNoteById(activePopoverId) : null;
            if (!inspectorState || !isDM() || (!token && !note)) {
                dom.tokenInspectorPopoverEl.hidden = true;
                setInspectorPopoverTarget(dom.tokenInspectorPopoverEl);
                return;
            }
            const savedPopoverState = captureInspectorPopoverState(
                dom.tokenInspectorPopoverEl,
                activePopoverKind,
                activePopoverId
            );
            dom.tokenInspectorPopoverEl.innerHTML = activePopoverKind === 'note'
                ? `
                    <div class="vtt-panel-head vtt-popover-head">
                        <h2>${escapeHtml(note ? getEvidenceNoteShapeLabel(note) : 'Zone')} Indicator</h2>
                        <div class="vtt-panel-head-actions">
                            <span class="vtt-panel-pill">${escapeHtml(note ? getEvidenceNoteDisplayTitle(note) : getDefaultEvidenceNoteTitle())}</span>
                            <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-token-inspector" aria-label="Close zone inspector">X</button>
                        </div>
                    </div>
                    ${buildDMEvidenceNoteInspectorContent(note, scene)}
                `
                : `
                    <div class="vtt-panel-head vtt-popover-head">
                        <h2>Token Inspector</h2>
                        <div class="vtt-panel-head-actions">
                            <span class="vtt-panel-pill">${escapeHtml(token.label || 'Token')}</span>
                            <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-token-inspector" aria-label="Close token inspector">X</button>
                        </div>
                    </div>
                    ${buildDMTokenInspectorContent(token)}
                `;
            setInspectorPopoverTarget(dom.tokenInspectorPopoverEl, activePopoverKind, activePopoverId);
            restoreInspectorPopoverSections(dom.tokenInspectorPopoverEl, savedPopoverState);
            if (typeof dom.tokenInspectorPopoverEl.setAttribute === 'function') {
                dom.tokenInspectorPopoverEl.setAttribute('role', 'dialog');
                dom.tokenInspectorPopoverEl.setAttribute('aria-label', activePopoverKind === 'note' ? 'Zone inspector' : 'Token inspector');
            }
            dom.tokenInspectorPopoverEl.hidden = false;
            positionTokenInspectorPopover();
            restoreInspectorPopoverFocusAndScroll(dom.tokenInspectorPopoverEl, savedPopoverState);
        };

        return Object.freeze({
            buildProximityTriggerSeedButtons,
            buildProximityTriggerFieldAttrs,
            buildProximityTriggerEditorRow,
            buildProximityTriggerEditor,
            buildDMTokenInspectorContent,
            buildDMEvidenceNoteInspectorContent,
            buildEvidenceNoteViewerContent,
            renderTokenInspector,
            renderTokenInspectorPopover
        });
    };

    return Object.freeze({ create });
}));
