const test = require('node:test');
const assert = require('node:assert/strict');

const inspectorMarkupFactory = require('../js/vtt-inspector-markup.js');
const { constants: config } = require('../js/vtt-config.js');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeTrigger = (trigger = {}) => ({
    id: 'trigger_1',
    enabled: true,
    title: 'Notice something',
    kind: 'fiction',
    skill: 'perception',
    radiusCells: 2,
    target: 'playerTokens',
    repeat: 'oncePerToken',
    dc: null,
    dcVisible: false,
    revealOnSuccess: false,
    clockId: '',
    clockSuccessDelta: 0,
    clockFailDelta: 0,
    body: '',
    successText: '',
    failText: '',
    ...trigger
});

class FakeInspectorNode {
    constructor(tagName, attributes = {}, ownerDocument = null) {
        this.tagName = String(tagName || '').toUpperCase();
        this.attributes = new Map(Object.entries(attributes));
        this.ownerDocument = ownerDocument;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
}

class FakeInspectorControl extends FakeInspectorNode {
    constructor(tagName, attributes, ownerDocument) {
        super(tagName, attributes, ownerDocument);
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectionDirection = 'none';
        this.focusOptions = null;
        this.restoredSelection = null;
    }

    focus(options) {
        this.focusOptions = options;
        this.ownerDocument.activeElement = this;
    }

    setSelectionRange(start, end, direction) {
        this.selectionStart = start;
        this.selectionEnd = end;
        this.selectionDirection = direction;
        this.restoredSelection = { start, end, direction };
    }
}

class FakeInspectorSection extends FakeInspectorNode {
    constructor(attributes, ownerDocument) {
        super('details', attributes, ownerDocument);
        this.open = Object.hasOwn(attributes, 'open');
    }
}

const parseTestAttributes = (source = '') => {
    const attributes = {};
    String(source).replace(/([\w:-]+)(?:="([^"]*)")?/g, (_match, name, value) => {
        attributes[name] = value === undefined ? '' : value;
        return '';
    });
    return attributes;
};

class FakeInspectorPopover {
    constructor(ownerDocument) {
        this.ownerDocument = ownerDocument;
        this.attributes = new Map();
        this.hidden = true;
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.sections = [];
        this.controls = [];
        this._innerHTML = '';
    }

    set innerHTML(markup) {
        this._innerHTML = String(markup || '');
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.sections = Array.from(this._innerHTML.matchAll(/<details\b([^>]*)>/g))
            .map((match) => new FakeInspectorSection(parseTestAttributes(match[1]), this.ownerDocument));
        this.controls = Array.from(this._innerHTML.matchAll(/<(input|select|textarea)\b([^>]*)>/g))
            .map((match) => new FakeInspectorControl(match[1], parseTestAttributes(match[2]), this.ownerDocument));
    }

    get innerHTML() {
        return this._innerHTML;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    querySelectorAll(selector) {
        return selector === 'details[data-inspector-section]' ? this.sections : this.controls;
    }

    contains(node) {
        return this.sections.includes(node) || this.controls.includes(node);
    }
}

const createHarness = (overrides = {}) => {
    let lazyLoadCalls = 0;
    const monsterResources = overrides.monsterResources || { loading: false };
    const monsterDirectory = overrides.monsterDirectory || [];
    const dom = overrides.dom || {
        selectionPillEl: { textContent: '' },
        tokenInspectorEl: { innerHTML: '' },
        tokenInspectorPopoverEl: { hidden: true, innerHTML: '' }
    };
    const deps = {
        buildEvidenceNoteAreaLabel: () => '2 x 3 cells',
        buildMonsterAssignResultsMarkup: (query, selectedId) => `<results query="${escapeHtml(query)}" selected="${escapeHtml(selectedId)}"></results>`,
        ensureMonsterDirectory: () => {
            lazyLoadCalls += 1;
            return Promise.resolve(monsterDirectory);
        },
        escapeHtml,
        getActiveScene: () => ({ id: 'scene_1' }),
        getDefaultEvidenceNoteTitle: () => 'Evidence Zone',
        getEvidenceNoteById: () => null,
        getEvidenceNoteCategoryLabel: (category) => category === 'clue' ? 'Clue' : 'Evidence',
        getEvidenceNoteCellBounds: () => ({ left: 3, top: 4, widthCells: 2, heightCells: 3 }),
        getEvidenceNoteCellPoint: () => ({ x: 3.125, y: 4.75 }),
        getEvidenceNoteDisplayTitle: (note) => String(note && note.title || 'Evidence Zone'),
        getEvidenceNoteShapeLabel: (note) => note && note.shape === 'pin' ? 'Pin' : 'Zone',
        getMonsterDirectory: () => monsterDirectory,
        getMonsterStatBlockForToken: () => null,
        getProximitySkillLabel: (skill) => skill.charAt(0).toUpperCase() + skill.slice(1),
        getRosterPlayerForRecord: () => null,
        getSceneClocks: () => [{ id: 'clock_1', title: 'Alarm & Doom' }],
        getSelectedEvidenceNoteId: () => '',
        getSelectedTokenId: () => '',
        getTokenById: () => null,
        getTokenStealthRoll: (token) => token && token.stealthRoll !== undefined ? token.stealthRoll : null,
        hasValue: (value) => value !== null && value !== undefined && value !== '',
        normalizeEvidenceNoteCategory: (category) => category || 'evidence',
        normalizeEvidenceNoteShape: (shape, fallback) => ['pin', 'zone'].includes(shape) ? shape : fallback,
        normalizeMoodEmoji: (value) => String(value || '').trim(),
        normalizeMoodLabel: (value) => String(value || '').trim(),
        normalizeMoveAccess: (value, fallback) => ['dm', 'player'].includes(value) ? value : fallback,
        normalizeProximityTrigger: normalizeTrigger,
        normalizeProximityTriggers: (triggers) => Array.isArray(triggers) ? triggers.map(normalizeTrigger) : [],
        positionTokenInspectorPopover: () => {},
        serializeConditions: (conditions) => Array.isArray(conditions) ? conditions.join(', ') : '',
        serializeHp: (current, max) => `HP ${current ?? '-'}/${max ?? '-'}`,
        isDM: () => true,
        proximityTriggerSkillOptions: ['perception', 'investigation', 'insight', 'arcana', 'stealth'],
        monsterResources,
        getInspectorState: () => null,
        dom,
        config,
        ...overrides.deps
    };
    return {
        api: inspectorMarkupFactory.create(deps),
        deps,
        dom,
        getLazyLoadCalls: () => lazyLoadCalls
    };
};

test('inspector markup validates its explicit factory contract', () => {
    assert.throws(
        () => inspectorMarkupFactory.create(),
        /requires a dependency object/
    );

    const { deps } = createHarness();
    const missingFunction = { ...deps };
    delete missingFunction.serializeConditions;
    assert.throws(
        () => inspectorMarkupFactory.create(missingFunction),
        /missing function dependencies: serializeConditions/
    );

    assert.throws(
        () => inspectorMarkupFactory.create({ ...deps, proximityTriggerSkillOptions: null }),
        /proximityTriggerSkillOptions to be an array/
    );
    assert.throws(
        () => inspectorMarkupFactory.create({ ...deps, config: { ...config, EVIDENCE_NOTE_CATEGORY_META: null } }),
        /config is missing EVIDENCE_NOTE_CATEGORY_META/
    );
});

test('proximity markup preserves owner attributes, skill fields, clocks, and note reveal controls', () => {
    const { api } = createHarness();
    assert.equal(api.buildProximityTriggerFieldAttrs('note', 'note<&', { id: 'trigger"1' }, 'title'), `
        data-proximity-trigger-field="title"
        data-owner-kind="note"
        data-owner-id="note&lt;&amp;"
        data-trigger-id="trigger&quot;1"
    `);

    const seedMarkup = api.buildProximityTriggerSeedButtons('token', 'token_1');
    assert.equal((seedMarkup.match(/data-action="seed-proximity-trigger"/g) || []).length, 6);
    assert.match(seedMarkup, /data-seed="perception">Perception<\/button>/);
    assert.match(seedMarkup, /data-seed="fiction">Fiction<\/button>/);

    const editorMarkup = api.buildProximityTriggerEditor('note', 'note_1', [{
        id: 'trigger_1',
        kind: 'skillRoll',
        skill: 'investigation',
        dc: 14,
        dcVisible: true,
        revealOnSuccess: true,
        clockId: 'clock_1',
        clockSuccessDelta: 2,
        clockFailDelta: -1,
        body: 'Inspect <runes>',
        successText: 'Found it',
        failText: 'Missed it'
    }]);
    assert.match(editorMarkup, /option value="investigation" selected>Investigation/);
    assert.match(editorMarkup, /value="clock_1" selected>Alarm &amp; Doom/);
    assert.match(editorMarkup, /data-proximity-trigger-field="revealOnSuccess"[\s\S]* checked/);
    assert.match(editorMarkup, /data-proximity-trigger-field="clockSuccessDelta"[\s\S]*value="2"/);
    assert.match(editorMarkup, />Inspect &lt;runes&gt;<\/textarea>/);
});

test('token inspector preserves controls and lazily starts an unloaded monster directory', () => {
    const harness = createHarness();
    const markup = harness.api.buildDMTokenInspectorContent({
        id: 'token<&',
        label: 'Goblin <Scout>',
        side: 'enemy',
        sourceType: 'monster',
        moveAccess: 'dm',
        imageUrl: 'https://example.test/goblin?a=1&b=2',
        moodEmoji: '👁️',
        moodLabel: 'Watching & waiting',
        hpCurrent: 0,
        hpMax: 12,
        ac: 14,
        passivePerception: 9,
        stealthRoll: 16,
        w: 1,
        h: 1,
        hidden: true,
        conditions: ['Prone', 'Poisoned'],
        vision: { enabled: true, facingDeg: 45, arcDeg: 90, baseRangeCells: 6 },
        triggers: []
    });

    assert.equal(harness.getLazyLoadCalls(), 1);
    assert.match(markup, /value="Goblin &lt;Scout&gt;"/);
    assert.match(markup, /value="Watching &amp; waiting"/);
    assert.match(markup, /data-action="token-adjust-hp"[\s\S]*data-delta="-5">-5 HP/);
    assert.match(markup, /data-action="token-set-bloodied"[\s\S]*>Bloodied/);
    assert.match(markup, /data-token-monster-search[\s\S]* disabled>/);
    assert.match(markup, /data-token-vision-field="enabled" checked/);
    assert.match(markup, />Prone, Poisoned<\/textarea>/);
    assert.match(markup, /data-action="toggle-token-hidden-quick"[\s\S]*>Reveal<\/button>/);
});

test('token inspector does not duplicate a monster load already in progress', () => {
    const harness = createHarness({ monsterResources: { loading: true } });
    harness.api.buildDMTokenInspectorContent({
        id: 'token_1',
        label: 'Loading token',
        side: 'neutral',
        moveAccess: 'dm',
        w: 1,
        h: 1,
        conditions: [],
        triggers: []
    });
    assert.equal(harness.getLazyLoadCalls(), 0);
});

test('evidence note editor and viewer preserve pin coordinates, visibility copy, and escaping', () => {
    const { api } = createHarness();
    const note = {
        id: 'note_1',
        title: 'Clue <One>',
        shape: 'pin',
        category: 'clue',
        body: 'Look & listen',
        hidden: true,
        triggers: []
    };
    const scene = { id: 'scene_1' };
    const editorMarkup = api.buildDMEvidenceNoteInspectorContent(note, scene);
    assert.match(editorMarkup, /value="Clue &lt;One&gt;"/);
    assert.match(editorMarkup, /option value="pin" selected/);
    assert.match(editorMarkup, /option value="clue" selected>Clue/);
    assert.match(editorMarkup, /step="0\.001" data-note-field="gridX" value="3\.125"/);
    assert.doesNotMatch(editorMarkup, /Cells Wide/);
    assert.match(editorMarkup, />Look &amp; listen<\/textarea>/);
    assert.match(editorMarkup, /DM-only pins stay hidden until you reveal them/);
    assert.match(editorMarkup, />Reveal To Players<\/button>/);

    const viewerMarkup = api.buildEvidenceNoteViewerContent(note, scene);
    assert.match(viewerMarkup, />Pin Indicator</);
    assert.match(viewerMarkup, />Clue<\/span>/);
    assert.match(viewerMarkup, />2 x 3 cells<\/span>/);
    assert.match(viewerMarkup, />Look &amp; listen<\/div>/);
});

test('player inspector hides a selected hidden token without exposing edit controls', () => {
    const token = { id: 'token_hidden', label: 'Secret <Token>', hidden: true };
    const harness = createHarness({
        deps: {
            getSelectedTokenId: () => token.id,
            getTokenById: (id) => id === token.id ? token : null,
            isDM: () => false
        }
    });

    harness.api.renderTokenInspector();
    assert.equal(harness.dom.selectionPillEl.textContent, 'No Selection');
    assert.match(harness.dom.tokenInspectorEl.innerHTML, /Select a visible token or zone/);
    assert.doesNotMatch(harness.dom.tokenInspectorEl.innerHTML, /data-token-field/);
});

test('DM inspector popover renders the selected token and positions once', () => {
    const token = {
        id: 'token_1',
        label: 'Goblin <Scout>',
        side: 'enemy',
        moveAccess: 'dm',
        w: 1,
        h: 1,
        conditions: [],
        triggers: []
    };
    let positionCalls = 0;
    const harness = createHarness({
        monsterResources: { loading: true },
        deps: {
            getInspectorState: () => ({ kind: 'token', targetId: token.id }),
            getTokenById: (id) => id === token.id ? token : null,
            positionTokenInspectorPopover: () => { positionCalls += 1; }
        }
    });

    harness.api.renderTokenInspectorPopover();
    assert.equal(harness.dom.tokenInspectorPopoverEl.hidden, false);
    assert.match(harness.dom.tokenInspectorPopoverEl.innerHTML, /Token Inspector/);
    assert.match(harness.dom.tokenInspectorPopoverEl.innerHTML, /Goblin &lt;Scout&gt;/);
    assert.equal(positionCalls, 1);
});

test('DM token inspector popover preserves accordions, scroll, focus, and caret across rerenders', () => {
    const token = {
        id: 'token_1',
        label: 'Goblin Scout',
        side: 'enemy',
        moveAccess: 'dm',
        moodLabel: 'Watching closely',
        w: 1,
        h: 1,
        conditions: [],
        triggers: []
    };
    const ownerDocument = { activeElement: null };
    const popover = new FakeInspectorPopover(ownerDocument);
    let positionSnapshot = null;
    const harness = createHarness({
        monsterResources: { loading: true },
        dom: {
            selectionPillEl: { textContent: '' },
            tokenInspectorEl: { innerHTML: '' },
            tokenInspectorPopoverEl: popover
        },
        deps: {
            getInspectorState: () => ({ kind: 'token', targetId: token.id }),
            getTokenById: (id) => id === token.id ? token : null,
            positionTokenInspectorPopover: () => {
                positionSnapshot = Object.fromEntries(popover.sections.map((section) => [
                    section.getAttribute('data-inspector-section'),
                    section.open
                ]));
            }
        }
    });

    harness.api.renderTokenInspectorPopover();
    const identitySection = popover.sections.find((section) => section.getAttribute('data-inspector-section') === 'identity');
    const statsSection = popover.sections.find((section) => section.getAttribute('data-inspector-section') === 'stats');
    identitySection.open = false;
    statsSection.open = true;
    popover.scrollTop = 237;
    popover.scrollLeft = 4;

    const moodField = popover.controls.find((control) => control.getAttribute('data-token-field') === 'moodLabel');
    moodField.selectionStart = 3;
    moodField.selectionEnd = 11;
    moodField.selectionDirection = 'backward';
    ownerDocument.activeElement = moodField;

    harness.api.renderTokenInspectorPopover();

    const restoredMoodField = popover.controls.find((control) => control.getAttribute('data-token-field') === 'moodLabel');
    assert.notEqual(restoredMoodField, moodField);
    assert.equal(ownerDocument.activeElement, restoredMoodField);
    assert.deepEqual(restoredMoodField.focusOptions, { preventScroll: true });
    assert.deepEqual(restoredMoodField.restoredSelection, { start: 3, end: 11, direction: 'backward' });
    assert.equal(popover.scrollTop, 237);
    assert.equal(popover.scrollLeft, 4);
    assert.equal(positionSnapshot.identity, false, 'restored accordion state should be applied before positioning');
    assert.equal(positionSnapshot.stats, true, 'the expanded section should remain expanded during positioning');
});
