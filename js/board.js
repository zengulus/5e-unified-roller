// --- CONFIGURATION ---
const CONFIG = {
    PHYSICS_STEPS: 2,
    GRAVITY: 0.6,
    ANCHOR_OUTSET: 2,
    SEGMENT_LENGTH: 24,
    POINTS_COUNT: 7,
    SLEEP_THRESHOLD: 0.1,
    MAX_CONNECTIONS: 2000,
    VIEW_SCALE_MIN: 0.2,
    VIEW_SCALE_MAX: 3,
    BASE_THICKNESS: 3.5,
    SHADOW_THICKNESS: 6,
    MAX_STRETCH: 15,
};

// --- GLOBAL STATE ---
const container = document.getElementById('board-container');
const groupContainer = document.getElementById('group-container');
const labelContainer = document.getElementById('string-label-container');
const canvas = document.getElementById('connection-layer');
const ctx = canvas.getContext('2d'); // Transparent background

const contextMenu = document.getElementById('context-menu');

// Data Models
let nodes = [];
let connections = [];

// Physics Buffer: [x, y, oldx, oldy, STRESS]
const STRIDE = 5;
const BYTES_PER_CONN = CONFIG.POINTS_COUNT * STRIDE;
const physicsBuffer = new Float32Array(CONFIG.MAX_CONNECTIONS * CONFIG.POINTS_COUNT * STRIDE);
const sleepState = new Uint8Array(CONFIG.MAX_CONNECTIONS);

// Fast Lookups
const connToIndex = new Map();
const nodeGraph = new Map();
let allocatedCount = 0;

// View & Interaction
let view = { x: 0, y: 0, scale: 1 };
let nodeCache = new Map();
let draggedNode = null;
let draggedNodeFollowers = [];
let dragStart = { x: 0, y: 0, nodeX: 0, nodeY: 0 };
let isConnecting = false;
let connectStart = { id: null, port: null, x: 0, y: 0 };
let focusMode = false;
let panMode = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let isHydratingBoard = false;
let lastSavedCaseName = 'UNNAMED CASE';
let lastOptimizeSnapshot = null;
const MOBILE_BREAKPOINT_PX = 900;
const coarsePointerQuery = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(pointer: coarse)')
    : null;
let mobileMode = false;
let mobileHandlersBound = false;
let keyboardShortcutAlertTimer = null;

const touchState = {
    dragTouchId: null,
    panTouchId: null,
    pinchIds: null,
    pinchDist: 0,
    lastClientX: 0,
    lastClientY: 0
};

const sanitizeText = (text = '') => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const sanitizeMultiline = (text = '') => sanitizeText(text).replace(/\n/g, '<br>');
const delegatedHandlerEvents = ['click', 'change', 'input', 'dragstart'];
const delegatedHandlerCache = new Map();
let delegatedHandlersBound = false;
const LEGACY_BOARD_KEY = 'invBoardData';
const NODE_TYPE_LABELS = {
    person: 'Person',
    location: 'Location',
    clue: 'Clue',
    theory: 'Theory',
    note: 'Note',
    group: 'Group Box',
    event: 'Event',
    requisition: 'Requisition'
};
const NODE_TYPE_ICONS = {
    person: '👤',
    location: '📍',
    clue: '🔍',
    theory: '🧠',
    note: '📝',
    group: '🗂️',
    event: '🕰️',
    requisition: '📦',
    azorius: '⚖️',
    boros: '⚔️',
    dimir: '👁️',
    golgari: '🍄',
    gruul: '🔥',
    izzet: '⚡',
    orzhov: '💰',
    rakdos: '🎪',
    selesnya: '🌳',
    simic: '🧬'
};
const CONNECTION_COLOR_PALETTE = [
    { name: 'Neutral', hex: '#f5f7fb' },
    { name: 'Red', hex: '#ff5e57' },
    { name: 'Blue', hex: '#4ea3ff' },
    { name: 'Green', hex: '#53d37c' },
    { name: 'Amber', hex: '#f3c34f' },
    { name: 'Violet', hex: '#b691ff' }
];
const IMAGE_EDITABLE_NODE_TYPES = new Set(['person', 'location', 'clue', 'event', 'requisition']);
const EDGE_CONNECT_ZONE_PX = 18;
const BOARD_LINK_FLASH_MS = 2200;
const BOARD_CROSSLINK_TYPES = new Set(['npc', 'location', 'timeline-event', 'requisition', 'case']);
const ENCOUNTER_DRAFT_STORAGE_PREFIX = 'rtf_encounter_draft_';
const LEAD_STORAGE_KEY = 'rtf_lead_queue_v1';
const BOARD_VIEW_SCOPE = String(window.RTF_VIEW_SCOPE || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
const THEORY_RELATIONS = ['supports', 'contradicts', 'related'];
const THEORY_STATUSES = new Set(['unproven', 'confirmed', 'disproven']);
const RELIABILITY_LEVELS = new Set(['unknown', 'rumored', 'corroborated', 'verified']);
const RELIABILITY_ORDER = ['unknown', 'rumored', 'corroborated', 'verified'];
const RELIABILITY_LABELS = {
    unknown: 'Unknown',
    rumored: 'Rumored',
    corroborated: 'Corroborated',
    verified: 'Verified'
};
const LEAD_STATUS_LABELS = {
    open: 'Open',
    blocked: 'Blocked',
    resolved: 'Resolved',
    'dead-end': 'Dead End'
};
const LEDGER_STATUS_LABELS = {
    stable: 'Pinned Fact',
    contested: 'Needs Review',
    collapsed: 'Needs Review',
    resolved: 'Resolved'
};
const LEDGER_SOURCE_LABELS = {
    manual: 'Manual',
    event: 'Timeline Event',
    theory: 'Board Theory',
    clue: 'Board Clue',
    case: 'Campaign Case',
    npc: 'Manual',
    location: 'Manual',
    requisition: 'Manual'
};
const NARRATIVE_META_NODE_TYPES = new Set(['clue', 'theory', 'event']);
const NARRATIVE_CERTAINTY_NODE_TYPES = new Set(['clue']);
const NARRATIVE_RELIABILITY_NODE_TYPES = new Set(['clue', 'theory']);
const TRUST_LEVEL_LABELS = ['Hostile', 'Wary', 'Neutral', 'Trusted', 'Loyal'];
const STIGMA_LEVEL_LABELS = ['Clean', 'Rumored', 'Noticed', 'Marked', 'Burned'];
const GROUP_NODE_DEFAULT_WIDTH = 460;
const GROUP_NODE_DEFAULT_HEIGHT = 300;
const GROUP_NODE_MIN_WIDTH = 220;
const GROUP_NODE_MIN_HEIGHT = 150;
const GROUP_NODE_MAX_WIDTH = 2200;
const GROUP_NODE_MAX_HEIGHT = 1600;
const KEYBOARD_ZOOM_STEP = 1.14;
const SHORTCUT_ALERT_VISIBLE_MS = 1400;
const SHORTCUT_KEYS = Object.freeze({
    pan: 'P',
    zoomIn: '+',
    zoomOut: '-'
});

function getDelegatedHandlerFn(code) {
    if (!delegatedHandlerCache.has(code)) {
        delegatedHandlerCache.set(code, window.RTF_DELEGATED_HANDLER.compile(code));
    }
    return delegatedHandlerCache.get(code);
}

function runDelegatedHandler(el, attrName, event) {
    const code = el.getAttribute(attrName);
    if (!code) return;

    try {
        const result = getDelegatedHandlerFn(code).call(el, event);
        if (result === false) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
    catch (err) {
        console.error(`Delegated handler failed for ${attrName}:`, code, err);
    }
}

function handleDelegatedDataEvent(event) {
    const attrName = `data-on${event.type}`;
    let node = event.target instanceof Element ? event.target : null;

    while (node) {
        if (node.hasAttribute(attrName)) {
            runDelegatedHandler(node, attrName, event);
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
}

function bindDelegatedDataHandlers() {
    if (delegatedHandlersBound) return;
    delegatedHandlersBound = true;
    delegatedHandlerEvents.forEach((eventName) => {
        document.addEventListener(eventName, handleDelegatedDataEvent);
    });
}

function isMobileInteractionMode() {
    return window.innerWidth <= MOBILE_BREAKPOINT_PX || !!(coarsePointerQuery && coarsePointerQuery.matches);
}

function applyMobileModeClass() {
    mobileMode = isMobileInteractionMode();
    document.body.classList.toggle('mobile-board', mobileMode);
}

function findTouchByIdentifier(touches, identifier) {
    if (!touches || identifier === null || identifier === undefined) return null;
    for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === identifier) return touches[i];
    }
    return null;
}

function getTouchDistance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function getTouchMidpoint(a, b) {
    return {
        x: (a.clientX + b.clientX) * 0.5,
        y: (a.clientY + b.clientY) * 0.5
    };
}

function isEditableTouchTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, button, a, [contenteditable="true"], .label-input');
}

function isTouchUIArea(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('.toolbar-scroll-wrapper, .popup-menu, .hero-header, #toolbar-toggle, .context-menu, .string-label');
}

function isTypingElement(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    if (typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], .label-input');
}

function isTypingContextTarget(target) {
    if (isTypingElement(target)) return true;
    return isTypingElement(document.activeElement);
}

function showShortcutAlert(message) {
    if (!message) return;
    let alertEl = document.getElementById('board-shortcut-alert');
    if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.id = 'board-shortcut-alert';
        alertEl.className = 'board-shortcut-alert';
        alertEl.setAttribute('role', 'status');
        alertEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(alertEl);
    }
    alertEl.textContent = message;
    alertEl.classList.add('is-visible');
    if (keyboardShortcutAlertTimer) {
        clearTimeout(keyboardShortcutAlertTimer);
    }
    keyboardShortcutAlertTimer = setTimeout(() => {
        alertEl.classList.remove('is-visible');
    }, SHORTCUT_ALERT_VISIBLE_MS);
}

function normalizeCaseName(name) {
    const cleaned = String(name || '').replace(/\s+/g, ' ').trim();
    return cleaned || 'UNNAMED CASE';
}

function sanitizeImageUrl(url = '') {
    const candidate = String(url || '').trim();
    if (!candidate) return '';

    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(candidate)) {
        return candidate;
    }

    try {
        const parsed = new URL(candidate, window.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:' || parsed.protocol === 'blob:') {
            return parsed.href;
        }
    } catch (err) {
        return '';
    }

    return '';
}

function isCampaignBoardView() {
    return BOARD_VIEW_SCOPE === 'campaign';
}

function getBoardScopeLabel() {
    return isCampaignBoardView() ? 'Campaign' : 'Case';
}

function getBoardActiveCaseId(store = window.RTF_STORE) {
    if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
    return String(store.getActiveCaseId() || 'case_primary');
}

function getBoardTimelineEvents(store = window.RTF_STORE, caseId = null) {
    if (!store) return [];
    if (isCampaignBoardView() && typeof store.getCampaignMetaEvents === 'function') {
        return store.getCampaignMetaEvents();
    }
    if (typeof store.getEvents === 'function') {
        return store.getEvents(caseId);
    }
    const campaign = store.state && store.state.campaign ? store.state.campaign : null;
    return Array.isArray(campaign && campaign.events) ? campaign.events : [];
}

function addBoardTimelineEvent(store, payload, caseId = null) {
    if (!store) return '';
    if (isCampaignBoardView() && typeof store.addCampaignMetaEvent === 'function') {
        return store.addCampaignMetaEvent(payload);
    }
    if (typeof store.addEvent === 'function') {
        return store.addEvent(payload, caseId || null);
    }
    return '';
}

function updateBoardTimelineEvent(store, eventId, updates, caseId = null) {
    if (!store || !eventId) return;
    if (isCampaignBoardView() && typeof store.updateCampaignMetaEvent === 'function') {
        store.updateCampaignMetaEvent(eventId, updates);
        return;
    }
    if (typeof store.updateEvent === 'function') {
        store.updateEvent(eventId, updates, caseId || null);
    }
}

function clampConnectionColorIndex(index) {
    const parsed = Number(index);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    if (parsed >= CONNECTION_COLOR_PALETTE.length) return 0;
    return parsed;
}

function getConnectionColorConfig(conn) {
    const index = clampConnectionColorIndex(conn && conn.colorIndex);
    return CONNECTION_COLOR_PALETTE[index];
}

function hexToRgba(hex, alpha = 1) {
    const clean = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(255,255,255,${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function getCaseName() {
    const el = document.getElementById('caseName');
    return normalizeCaseName(el ? el.innerText : 'UNNAMED CASE');
}

function sanitizeNodeMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const clean = {};
    Object.keys(meta).forEach((key) => {
        const value = meta[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            clean[key] = value;
        }
    });
    return Object.keys(clean).length ? clean : null;
}

function setNodeMeta(el, meta) {
    if (!el) return;
    const clean = sanitizeNodeMeta(meta);
    if (!clean) {
        delete el.dataset.meta;
        applyNoteVariantClass(el, null);
        return;
    }
    el.dataset.meta = JSON.stringify(clean);
    applyNoteVariantClass(el, clean);
}

function getNodeMeta(el) {
    if (!el || !el.dataset || !el.dataset.meta) return null;
    try {
        return sanitizeNodeMeta(JSON.parse(el.dataset.meta));
    } catch (err) {
        return null;
    }
}

function getNodeTypeFromEl(el) {
    if (!el || !el.classList) return '';
    const cls = Array.from(el.classList).find(c => c.startsWith('type-')) || '';
    return cls.replace('type-', '');
}

function getNoteVariantFromMeta(meta) {
    const sourceType = String(meta && meta.sourceType || '').trim().toLowerCase();
    if (sourceType === 'lead') return 'lead';
    if (sourceType === 'ledger') return 'ledger';
    return 'freeform';
}

function cleanupLegacyNoteBreaks(html = '') {
    let clean = String(html || '');
    clean = clean.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
    clean = clean.replace(/^(?:\s|<br\s*\/?>)+/i, '');
    clean = clean.replace(/(?:\s|<br\s*\/?>)+$/i, '');
    return clean;
}

function normalizeLegacyLeadNoteBody(html = '') {
    let clean = String(html || '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Target ID\s*:?\s*<\/strong>\s*(?:<br\s*\/?>\s*)?[^<\s]+(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Target ID\s*:?\s*<\/strong>(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?Target ID\s*:?\s*[^\s<]+(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Linked Record\s*:?\s*<\/strong>\s*(?:<br\s*\/?>\s*)?[^<\s]+(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Linked Record\s*:?\s*<\/strong>(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?Linked Record\s*:?\s*[^\s<]+(?=(?:<br\s*\/?>|$))/gi, '');
    return cleanupLegacyNoteBreaks(clean);
}

function normalizeLegacyLedgerNoteBody(html = '') {
    let clean = String(html || '');
    clean = clean.replace(/(<strong>\s*Source\s*:?\s*<\/strong>\s*(?:<br\s*\/?>\s*)?)([a-z0-9_-]+)\s*:[^<\s]+/gi, '$1$2');
    clean = clean.replace(/(Source\s*:?\s*)([a-z0-9_-]+)\s*:[^\s<]+/gi, '$1$2');
    return cleanupLegacyNoteBreaks(clean);
}

function normalizeLegacyEventNodeBody(html = '') {
    let clean = String(html || '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Certainty\s*:?\s*<\/strong>\s*[^<]*(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?<strong>\s*Reliability\s*:?\s*<\/strong>\s*[^<]*(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?Certainty\s*:?\s*[^<\s]+%?(?=(?:<br\s*\/?>|$))/gi, '');
    clean = clean.replace(/(?:<br\s*\/?>\s*)?Reliability\s*:?\s*[^\s<]+(?=(?:<br\s*\/?>|$))/gi, '');
    return cleanupLegacyNoteBreaks(clean);
}

function normalizeNoteNodeContent(content = {}) {
    const source = content && typeof content === 'object' ? content : {};
    const normalized = { ...source };
    const metaSource = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
    let title = String(source.title || 'Note');
    let body = String(source.body || '');
    let sourceType = String(metaSource.sourceType || '').trim().toLowerCase();

    if (!sourceType) {
        if (/^lead\s*:/i.test(title)) sourceType = 'lead';
        else if (/^ledger\s*:/i.test(title)) sourceType = 'ledger';
    }

    if (sourceType === 'lead') {
        title = title.replace(/^lead\s*:\s*/i, '').trim() || 'Untitled Lead';
        body = normalizeLegacyLeadNoteBody(body);
    } else if (sourceType === 'ledger') {
        title = title.replace(/^ledger\s*:\s*/i, '').trim() || 'Ledger Entry';
        body = normalizeLegacyLedgerNoteBody(body);
    }

    if (sourceType) metaSource.sourceType = sourceType;

    normalized.title = title;
    normalized.body = body;
    normalized.meta = metaSource;
    return normalized;
}

function normalizeEventNodeContent(content = {}) {
    const source = content && typeof content === 'object' ? content : {};
    const normalized = { ...source };
    const metaSource = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
    delete metaSource.certainty;
    delete metaSource.reliability;
    normalized.body = normalizeLegacyEventNodeBody(source.body || '');
    normalized.meta = metaSource;
    return normalized;
}

function applyNoteVariantClass(nodeEl, meta) {
    if (!nodeEl || !nodeEl.classList || !nodeEl.classList.contains('type-note')) return;
    const variant = getNoteVariantFromMeta(meta);
    Array.from(nodeEl.classList)
        .filter((cls) => cls.startsWith('note-variant-'))
        .forEach((cls) => nodeEl.classList.remove(cls));
    nodeEl.classList.add(`note-variant-${variant}`);
}

function isGroupNodeType(type) {
    return String(type || '').toLowerCase() === 'group';
}

function isGroupNodeEl(el) {
    return isGroupNodeType(getNodeTypeFromEl(el));
}

function clampGroupNodeDimension(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
}

function getGroupNodeSizeFromMeta(meta) {
    const source = meta && typeof meta === 'object' ? meta : {};
    const widthValue = Object.prototype.hasOwnProperty.call(source, 'groupW')
        ? source.groupW
        : source.groupWidth;
    const heightValue = Object.prototype.hasOwnProperty.call(source, 'groupH')
        ? source.groupH
        : source.groupHeight;
    return {
        width: clampGroupNodeDimension(widthValue, GROUP_NODE_DEFAULT_WIDTH, GROUP_NODE_MIN_WIDTH, GROUP_NODE_MAX_WIDTH),
        height: clampGroupNodeDimension(heightValue, GROUP_NODE_DEFAULT_HEIGHT, GROUP_NODE_MIN_HEIGHT, GROUP_NODE_MAX_HEIGHT)
    };
}

function syncGroupNodeMeta(nodeEl) {
    if (!isGroupNodeEl(nodeEl)) return;
    const baseMeta = getNodeMeta(nodeEl) || {};
    const nextMeta = {
        ...baseMeta,
        groupW: clampGroupNodeDimension(nodeEl.offsetWidth, GROUP_NODE_DEFAULT_WIDTH, GROUP_NODE_MIN_WIDTH, GROUP_NODE_MAX_WIDTH),
        groupH: clampGroupNodeDimension(nodeEl.offsetHeight, GROUP_NODE_DEFAULT_HEIGHT, GROUP_NODE_MIN_HEIGHT, GROUP_NODE_MAX_HEIGHT)
    };
    setNodeMeta(nodeEl, nextMeta);
}

function collectGroupedFollowerNodes(groupNodeEl) {
    if (!groupNodeEl) return [];
    const groupLeft = groupNodeEl.offsetLeft;
    const groupTop = groupNodeEl.offsetTop;
    const groupRight = groupLeft + groupNodeEl.offsetWidth;
    const groupBottom = groupTop + groupNodeEl.offsetHeight;
    const followers = [];

    document.querySelectorAll('.node').forEach((nodeEl) => {
        if (!nodeEl || nodeEl === groupNodeEl) return;
        const width = nodeEl.offsetWidth || 0;
        const height = nodeEl.offsetHeight || 0;
        const cx = nodeEl.offsetLeft + (width * 0.5);
        const cy = nodeEl.offsetTop + (height * 0.5);
        if (cx >= groupLeft && cx <= groupRight && cy >= groupTop && cy <= groupBottom) {
            followers.push({
                id: nodeEl.id,
                el: nodeEl,
                startX: nodeEl.offsetLeft,
                startY: nodeEl.offsetTop
            });
        }
    });

    return followers;
}

function canNodeTypesConnect(fromType, toType) {
    return !isGroupNodeType(fromType) && !isGroupNodeType(toType);
}

function getNodeSummary(nodeId) {
    const el = document.getElementById(nodeId);
    if (!el) return null;
    const type = getNodeTypeFromEl(el);
    const titleEl = el.querySelector('.node-title');
    const bodyEl = el.querySelector('.node-body');
    return {
        id: nodeId,
        type,
        title: (titleEl ? titleEl.innerText : type.toUpperCase()).trim() || type.toUpperCase(),
        bodyText: (bodyEl ? bodyEl.innerText : '').trim(),
        meta: getNodeMeta(el)
    };
}

function getNodeLinkCount(nodeId) {
    let count = 0;
    for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        if (conn.from === nodeId || conn.to === nodeId) count++;
    }
    return count;
}

function getNodeTypeLabel(type) {
    return NODE_TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Node');
}

function getClosestEdgeFromLocalPoint(localX, localY, width, height, thresholdPx = EDGE_CONNECT_ZONE_PX) {
    if (!Number.isFinite(localX) || !Number.isFinite(localY) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (localX < 0 || localY < 0 || localX > width || localY > height) return null;

    const distances = [
        { edge: 'top', d: localY },
        { edge: 'bottom', d: height - localY },
        { edge: 'left', d: localX },
        { edge: 'right', d: width - localX }
    ];
    distances.sort((a, b) => a.d - b.d);
    if (distances[0].d > thresholdPx) return null;
    return distances[0].edge;
}

function getEdgeTargetElement(nodeEl) {
    if (!nodeEl) return null;
    return nodeEl.querySelector('[data-edge-target]') || nodeEl;
}

function getNodeEdgeFromEvent(event, nodeEl, thresholdPx = EDGE_CONNECT_ZONE_PX) {
    if (!event || !nodeEl || typeof nodeEl.getBoundingClientRect !== 'function') return null;
    const edgeTarget = getEdgeTargetElement(nodeEl) || nodeEl;
    const rect = edgeTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return getClosestEdgeFromLocalPoint(localX, localY, rect.width, rect.height, thresholdPx);
}

const VALID_CONNECTION_PORTS = new Set(['auto', 'top', 'right', 'bottom', 'left']);

function normalizeConnectionPort(port) {
    const candidate = typeof port === 'string' ? port : 'auto';
    return VALID_CONNECTION_PORTS.has(candidate) ? candidate : 'auto';
}

function getPortFromEventTarget(target) {
    if (!target || typeof target.closest !== 'function') return 'auto';
    const portEl = target.closest('.port[data-port]');
    if (!portEl || !portEl.dataset) return 'auto';
    return normalizeConnectionPort(portEl.dataset.port);
}

function normalizeTheoryStatus(value) {
    const clean = String(value || '').trim().toLowerCase();
    return THEORY_STATUSES.has(clean) ? clean : 'unproven';
}

function normalizeTheoryRelation(value) {
    const clean = String(value || '').trim().toLowerCase();
    return THEORY_RELATIONS.includes(clean) ? clean : 'supports';
}

function normalizeReliability(value) {
    const clean = String(value || '').trim().toLowerCase();
    return RELIABILITY_LEVELS.has(clean) ? clean : 'unknown';
}

function clampPercent(value, fallback = 50) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function clampTrackIndex(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(4, parsed));
}

function getTheoryStatusLabel(status) {
    const clean = normalizeTheoryStatus(status);
    if (clean === 'confirmed') return 'Confirmed';
    if (clean === 'disproven') return 'Disproven';
    return 'Unproven';
}

function getTheoryRelationLabel(relation) {
    const clean = normalizeTheoryRelation(relation);
    if (clean === 'contradicts') return 'Contradicts';
    if (clean === 'related') return 'Related';
    return 'Supports';
}

function getReliabilityLabel(value) {
    const clean = normalizeReliability(value);
    return RELIABILITY_LABELS[clean] || 'Unknown';
}

function getReliabilityPercent(value) {
    const maxIdx = Math.max(1, RELIABILITY_ORDER.length - 1);
    const idx = reliabilityToIndex(value);
    return Math.round((idx / maxIdx) * 100);
}

function reliabilityToIndex(value) {
    const clean = normalizeReliability(value);
    const idx = RELIABILITY_ORDER.indexOf(clean);
    return idx >= 0 ? idx : 0;
}

function reliabilityFromIndex(value) {
    const idx = Number.parseInt(value, 10);
    const bounded = Number.isFinite(idx) ? Math.max(0, Math.min(RELIABILITY_ORDER.length - 1, idx)) : 0;
    return RELIABILITY_ORDER[bounded] || RELIABILITY_ORDER[0];
}

function getBoardMutationStamp() {
    const store = window.RTF_STORE;
    if (store && typeof store.getMutationStamp === 'function') {
        const stamp = store.getMutationStamp();
        return {
            lastChangedBy: String(stamp && stamp.lastChangedBy || 'local'),
            lastChangedAt: String(stamp && stamp.lastChangedAt || new Date().toISOString())
        };
    }
    return {
        lastChangedBy: 'local',
        lastChangedAt: new Date().toISOString()
    };
}

function stampNodeMeta(meta) {
    const base = meta && typeof meta === 'object' ? meta : {};
    const stamp = getBoardMutationStamp();
    return {
        ...base,
        lastChangedBy: stamp.lastChangedBy,
        lastChangedAt: stamp.lastChangedAt
    };
}

function ensureNarrativeNodeMeta(nodeEl) {
    if (!nodeEl || !nodeEl.classList) return null;
    const type = getNodeTypeFromEl(nodeEl);
    if (!NARRATIVE_META_NODE_TYPES.has(type)) return null;

    const baseMeta = getNodeMeta(nodeEl) || {};
    const clean = { ...baseMeta };
    if (type === 'theory') {
        clean.sourceType = String(clean.sourceType || 'theory');
        clean.theoryStatus = normalizeTheoryStatus(clean.theoryStatus);
        clean.confidence = clampPercent(baseMeta.confidence, 50);
        delete clean.certainty;
    } else if (NARRATIVE_CERTAINTY_NODE_TYPES.has(type)) {
        clean.certainty = clampPercent(baseMeta.certainty, 50);
    } else if (Object.prototype.hasOwnProperty.call(clean, 'certainty')) {
        delete clean.certainty;
    }
    if (NARRATIVE_RELIABILITY_NODE_TYPES.has(type)) {
        clean.reliability = normalizeReliability(baseMeta.reliability);
    } else if (Object.prototype.hasOwnProperty.call(clean, 'reliability')) {
        delete clean.reliability;
    }
    setNodeMeta(nodeEl, clean);
    return clean;
}

function syncNodeNarrativeMetaDisplay(nodeEl) {
    if (!nodeEl || !nodeEl.classList) return;
    const type = getNodeTypeFromEl(nodeEl);
    if (!NARRATIVE_META_NODE_TYPES.has(type)) return;
    const meta = ensureNarrativeNodeMeta(nodeEl);
    if (!meta) return;
    const slot = nodeEl.querySelector('[data-node-meta-badges]');
    if (!slot) return;
    const pills = [];
    if (NARRATIVE_CERTAINTY_NODE_TYPES.has(type)) {
        const certainty = clampPercent(meta.certainty, 50);
        pills.push(`<span class="node-meta-pill">Certainty ${certainty}%</span>`);
    }
    if (NARRATIVE_RELIABILITY_NODE_TYPES.has(type)) {
        const reliabilityKey = normalizeReliability(meta.reliability);
        const reliabilityLabel = getReliabilityLabel(reliabilityKey);
        const reliabilityPercent = getReliabilityPercent(reliabilityKey);
        pills.push(`
            <div class="node-meta-bar node-meta-reliability" data-reliability="${sanitizeText(reliabilityKey)}">
                <span class="node-meta-bar-label">Reliability</span>
                <span class="node-meta-bar-value">${sanitizeText(reliabilityLabel)}</span>
                <div class="node-meta-track">
                    <div class="node-meta-fill" style="width:${reliabilityPercent}%"></div>
                </div>
            </div>
        `);
    }
    slot.innerHTML = pills.join('');
}

function persistLinkedNodeNarrativeMeta(nodeEl) {
    if (!nodeEl || !window.RTF_STORE) return;
    const type = getNodeTypeFromEl(nodeEl);
    if (!NARRATIVE_CERTAINTY_NODE_TYPES.has(type)) return;
    const meta = ensureNarrativeNodeMeta(nodeEl);
    if (!meta) return;
    const store = window.RTF_STORE;
    if (String(meta.sourceType || '') !== 'timeline-event') return;
    const eventId = String(meta.eventId || '').trim();
    if (!eventId) return;
    const caseId = String(meta.caseId || '').trim();
    updateBoardTimelineEvent(store, eventId, { certainty: clampPercent(meta.certainty, 50) }, caseId || null);
}

function readLeadStorage() {
    try {
        const raw = localStorage.getItem(LEAD_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return {};
    }
}

function writeLeadStorage(next) {
    const clean = next && typeof next === 'object' ? next : {};
    localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(clean));
}

function getActiveLeadCaseId() {
    if (isCampaignBoardView()) return 'campaign_meta';
    if (window.RTF_STORE && typeof window.RTF_STORE.getActiveCaseId === 'function') {
        return String(window.RTF_STORE.getActiveCaseId() || 'case_primary');
    }
    return 'case_primary';
}

function isTheoryNodeId(nodeId) {
    const nodeEl = document.getElementById(nodeId);
    return !!(nodeEl && nodeEl.classList && nodeEl.classList.contains('type-theory'));
}

function findConnectionBetween(nodeAId, nodeBId) {
    return connections.find((c) =>
        (c.from === nodeAId && c.to === nodeBId) ||
        (c.from === nodeBId && c.to === nodeAId)
    ) || null;
}

function createConnectionBetweenNodes(fromNodeId, toNodeId, fromPort = null, toPort = null) {
    if (!fromNodeId || !toNodeId) return false;
    if (fromNodeId === toNodeId) return false;
    const fromNodeEl = document.getElementById(fromNodeId);
    const toNodeEl = document.getElementById(toNodeId);
    if (!canNodeTypesConnect(getNodeTypeFromEl(fromNodeEl), getNodeTypeFromEl(toNodeEl))) return false;
    const normalizedFromPort = normalizeConnectionPort(fromPort);
    const normalizedToPort = normalizeConnectionPort(toPort);

    const existing = findConnectionBetween(fromNodeId, toNodeId);
    if (existing) {
        const sameDirection = existing.from === fromNodeId;
        const nextFromPort = sameDirection ? normalizedFromPort : normalizedToPort;
        const nextToPort = sameDirection ? normalizedToPort : normalizedFromPort;
        const hasChanged = existing.fromPort !== nextFromPort || existing.toPort !== nextToPort;

        if (hasChanged) {
            existing.fromPort = nextFromPort;
            existing.toPort = nextToPort;
            existing.portPinned = nextFromPort !== 'auto' || nextToPort !== 'auto';
            resetConnectionPhysicsFromNodeCache();
            saveBoard();
        }

        return hasChanged;
    }

    const fromLinksBefore = getNodeLinkCount(fromNodeId);
    const toLinksBefore = getNodeLinkCount(toNodeId);
    const touchesTheory = isTheoryNodeId(fromNodeId) || isTheoryNodeId(toNodeId);
    const initialTheoryRelation = touchesTheory ? 'supports' : '';

    const newConn = {
        id: 'conn_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        from: fromNodeId,
        to: toNodeId,
        fromPort: normalizedFromPort,
        toPort: normalizedToPort,
        portPinned: normalizedFromPort !== 'auto' || normalizedToPort !== 'auto',
        label: touchesTheory ? getTheoryRelationLabel(initialTheoryRelation) : '',
        arrowLeft: 0,
        arrowRight: 0,
        relationshipLogged: false,
        colorIndex: 0,
        theoryRelation: initialTheoryRelation
    };

    connections.push(newConn);
    registerConnection(newConn);

    const fromSummary = getNodeSummary(fromNodeId);
    const toSummary = getNodeSummary(toNodeId);
    if (fromLinksBefore === 0) logNodeConnectedToCase(fromSummary, toSummary);
    if (toLinksBefore === 0) logNodeConnectedToCase(toSummary, fromSummary);

    saveBoard();
    return true;
}

function getHeatDeltaFromNode(summary) {
    if (!summary) return null;
    const metaHeat = summary.meta && summary.meta.heatDelta;
    const parsedMeta = Number(metaHeat);
    if (Number.isFinite(parsedMeta)) return parsedMeta;

    const match = (summary.bodyText || '').match(/\bHeat\s*:?\s*([+-]?\d+)/i);
    if (!match) return null;
    const parsedBody = Number(match[1]);
    return Number.isFinite(parsedBody) ? parsedBody : null;
}

function logBoardTimeline(entry, options = {}) {
    if (isExternalBoardMode()) return;
    const logger = window.RTF_SESSION_LOG;
    if (!logger || typeof logger.logMajorEvent !== 'function') return;
    const details = entry && typeof entry === 'object' ? entry : {};
    const kind = details.kind || 'board';
    // Keep case-board timeline noise low: only clue discoveries from this board.
    if (kind !== 'clue-discovered') return;
    const tags = Array.isArray(details.tags) ? details.tags : [];

    const mergedOptions = isCampaignBoardView()
        ? { ...options, scope: 'campaign' }
        : options;
    logger.logMajorEvent({
        title: details.title || `${getBoardScopeLabel()} Board Event`,
        focus: getCaseName(),
        heatDelta: details.heatDelta,
        tags: ['auto', isCampaignBoardView() ? 'campaign-board' : 'case-board', ...tags],
        highlights: details.highlights || '',
        fallout: details.fallout || '',
        followUp: details.followUp || '',
        source: 'board',
        kind
    }, mergedOptions);
}

function getSourceDescriptor(meta) {
    if (!meta || !meta.sourceType) return '';
    const type = String(meta.sourceType);
    if (type === 'npc') return ' from NPC roster';
    if (type === 'location') return ' from locations database';
    if (type === 'timeline-event') return ' from mission timeline';
    if (type === 'requisition') return ' from requisitions';
    if (type === 'case') return ' from campaign scope';
    if (type === 'guild') return ' from guild reference';
    return '';
}

function logNodeAddedToBoard(summary) {
    if (!summary || summary.type !== 'clue') return;
    const sourceSuffix = getSourceDescriptor(summary.meta);
    const sourceTag = summary.meta && summary.meta.sourceType ? [String(summary.meta.sourceType)] : [];
    logBoardTimeline({
        title: 'Clue Discovery Logged',
        kind: 'clue-discovered',
        tags: ['clue-discovery', ...sourceTag],
        highlights: `${summary.title}${sourceSuffix}.`
    }, { dedupeKey: `board:clue-discovery:${summary.id}` });
}

function logNodeConnectedToCase(summary, otherSummary) {
    if (!summary) return;
    const typeLabel = getNodeTypeLabel(summary.type);
    const otherTitle = otherSummary ? otherSummary.title : 'another node';
    logBoardTimeline({
        title: `${typeLabel} Connected to ${getBoardScopeLabel()}`,
        kind: 'node-linked',
        tags: ['node-link', summary.type],
        highlights: `${summary.title} linked with ${otherTitle}.`
    }, { dedupeKey: `board:first-link:${summary.id}` });

    if (summary.type !== 'event') return;

    logBoardTimeline({
        title: `Timeline Event Linked to ${getBoardScopeLabel()}`,
        kind: 'timeline-event-linked',
        tags: ['event-link'],
        highlights: `${summary.title} linked to the active ${getBoardScopeLabel().toLowerCase()} graph.`
    }, { dedupeKey: `board:event-link:${summary.id}` });

    const heat = getHeatDeltaFromNode(summary);
    if (heat === null || heat === 0) return;

    logBoardTimeline({
        title: 'Heat-Impact Event Linked to Case',
        kind: 'heat-event-linked',
        tags: ['event-link', 'heat-impact'],
        heatDelta: heat,
        highlights: `${summary.title} carries Heat ${heat > 0 ? '+' : ''}${heat} and is now connected.`
    }, { dedupeKey: `board:event-heat-link:${summary.id}` });
}

function initCaseNameTracking() {
    const caseNameEl = document.getElementById('caseName');
    if (!caseNameEl) return;
    caseNameEl.addEventListener('blur', () => saveBoard());
    caseNameEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        caseNameEl.blur();
    });
}

function sanitizeRichText(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['BR', 'STRONG', 'B', 'EM', 'I', 'U', 'DIV', 'P', 'SPAN']);

    const cleanNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return document.createTextNode(node.textContent || '');
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return document.createTextNode('');
        }

        const tag = node.tagName.toUpperCase();
        if (!allowed.has(tag)) {
            const fragment = document.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => fragment.appendChild(cleanNode(child)));
            return fragment;
        }

        const clean = document.createElement(tag.toLowerCase());
        Array.from(node.childNodes).forEach(child => clean.appendChild(cleanNode(child)));
        return clean;
    };

    const wrapper = document.createElement('div');
    Array.from(template.content.childNodes).forEach(node => wrapper.appendChild(cleanNode(node)));
    return wrapper.innerHTML;
}

function sanitizeBoardPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    return {
        name: typeof source.name === 'string' && source.name ? source.name : 'UNNAMED CASE',
        nodes: Array.isArray(source.nodes) ? source.nodes : [],
        connections: Array.isArray(source.connections) ? source.connections : []
    };
}

function getBoardHostAdapter() {
    const host = window.RTF_BOARD_HOST;
    if (!host || typeof host !== 'object') return null;
    return host;
}

function isExternalBoardMode() {
    return !!getBoardHostAdapter();
}

async function waitForExternalBoardReady() {
    const host = getBoardHostAdapter();
    if (!host || typeof host.whenReady !== 'function') return;
    try {
        await host.whenReady();
    } catch (err) {
        console.warn('External board host readiness failed', err);
    }
}

function readHostBoardPayload() {
    const host = getBoardHostAdapter();
    if (!host || typeof host.readBoard !== 'function') return null;
    try {
        return sanitizeBoardPayload(host.readBoard());
    } catch (err) {
        console.warn('External board host read failed', err);
        return null;
    }
}

function writeHostBoardPayload(payload) {
    const host = getBoardHostAdapter();
    if (!host || typeof host.writeBoard !== 'function') return false;
    const clean = sanitizeBoardPayload(payload);
    try {
        const result = host.writeBoard(clean);
        return result !== false;
    } catch (err) {
        console.warn('External board host write failed', err);
        return false;
    }
}

function readStoreBoardPayload() {
    const hostPayload = readHostBoardPayload();
    if (hostPayload) return hostPayload;
    if (!window.RTF_STORE) return null;
    if (isCampaignBoardView() && typeof window.RTF_STORE.getCampaignMetaBoard === 'function') {
        return sanitizeBoardPayload(window.RTF_STORE.getCampaignMetaBoard());
    }
    if (typeof window.RTF_STORE.getBoard === 'function') {
        return sanitizeBoardPayload(window.RTF_STORE.getBoard());
    }
    if (isCampaignBoardView() && window.RTF_STORE.state && window.RTF_STORE.state.campaignMeta && window.RTF_STORE.state.campaignMeta.board) {
        return sanitizeBoardPayload(window.RTF_STORE.state.campaignMeta.board);
    }
    if (window.RTF_STORE.state && window.RTF_STORE.state.board) {
        return sanitizeBoardPayload(window.RTF_STORE.state.board);
    }
    return null;
}

function writeStoreBoardPayload(payload) {
    if (writeHostBoardPayload(payload)) return true;
    if (!window.RTF_STORE) return false;
    const clean = sanitizeBoardPayload(payload);
    if (isCampaignBoardView() && typeof window.RTF_STORE.updateCampaignMetaBoard === 'function') {
        window.RTF_STORE.updateCampaignMetaBoard(clean);
        return true;
    }
    if (typeof window.RTF_STORE.updateBoard === 'function') {
        window.RTF_STORE.updateBoard(clean);
        return true;
    }
    if (window.RTF_STORE.state) {
        if (isCampaignBoardView()) {
            if (!window.RTF_STORE.state.campaignMeta || typeof window.RTF_STORE.state.campaignMeta !== 'object') {
                window.RTF_STORE.state.campaignMeta = { board: clean, events: [] };
            } else {
                window.RTF_STORE.state.campaignMeta.board = clean;
            }
        } else {
            window.RTF_STORE.state.board = clean;
        }
        if (typeof window.RTF_STORE.save === 'function') {
            if (isCampaignBoardView()) {
                window.RTF_STORE.save({ scope: 'campaign.meta.board' });
            } else {
                const activeCaseId = getBoardActiveCaseId(window.RTF_STORE);
                window.RTF_STORE.save({ scope: `cases.${activeCaseId}.board` });
            }
        }
        return true;
    }
    return false;
}

function readLegacyBoardPayload() {
    if (isExternalBoardMode()) return null;
    const raw = localStorage.getItem(LEGACY_BOARD_KEY);
    if (!raw) return null;
    try {
        return sanitizeBoardPayload(JSON.parse(raw));
    } catch (err) {
        console.warn('Legacy board data is corrupted', err);
        return null;
    }
}

function hasBoardContent(payload) {
    if (!payload) return false;
    if ((payload.nodes && payload.nodes.length) || (payload.connections && payload.connections.length)) return true;
    return payload.name && payload.name !== 'UNNAMED CASE' && payload.name !== 'UNNAMED';
}

function getPreferredBoardPayload() {
    const storePayload = readStoreBoardPayload();
    if (hasBoardContent(storePayload)) return storePayload;

    const legacyPayload = readLegacyBoardPayload();
    if (legacyPayload) {
        writeStoreBoardPayload(legacyPayload);
        localStorage.removeItem(LEGACY_BOARD_KEY);
        return legacyPayload;
    }

    return storePayload;
}

function pruneBoardTimelineNoise() {
    if (isExternalBoardMode()) return;
    const store = window.RTF_STORE;
    if (!store) return;

    let removed = 0;
    const touchedScopes = new Set();
    const isBoardNoiseEvent = (evt) => {
        if (!evt || typeof evt !== 'object') return false;
        const source = String(evt.source || '').trim().toLowerCase();
        const kind = String(evt.kind || '').trim();
        const tags = String(evt.tags || '').toLowerCase();
        const isBoardEvent = source === 'board' || tags.includes('case-board') || tags.includes('campaign-board');
        if (!isBoardEvent) return false;
        if (kind === 'clue-discovered') return false;
        return true;
    };

    if (isCampaignBoardView()) {
        const events = getBoardTimelineEvents(store);
        if (!Array.isArray(events) || !events.length) return;
        for (let i = events.length - 1; i >= 0; i -= 1) {
            const evt = events[i];
            if (!isBoardNoiseEvent(evt)) continue;
            const rawEventId = String(evt.id || '').trim();
            const normalizedEventId = rawEventId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
            events.splice(i, 1);
            removed += 1;
            touchedScopes.add(
                normalizedEventId
                    ? `campaign.meta.events.${normalizedEventId}`
                    : 'campaign.meta.events'
            );
        }
    } else {
        if (typeof store.getEvents !== 'function') return;
        const caseIds = (typeof store.getCases === 'function')
            ? store.getCases().map((entry) => entry && entry.id).filter(Boolean)
            : [null];
        if (!caseIds.length) caseIds.push(null);

        caseIds.forEach((caseId) => {
            const events = store.getEvents(caseId);
            if (!Array.isArray(events) || !events.length) return;
            const resolvedCaseId = caseId || getBoardActiveCaseId(store);

            for (let i = events.length - 1; i >= 0; i -= 1) {
                const evt = events[i];
                if (!isBoardNoiseEvent(evt)) continue;
                const rawEventId = String(evt.id || '').trim();
                const normalizedEventId = rawEventId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
                events.splice(i, 1);
                removed += 1;
                if (!resolvedCaseId) continue;
                touchedScopes.add(
                    normalizedEventId
                        ? `cases.${resolvedCaseId}.events.${normalizedEventId}`
                        : `cases.${resolvedCaseId}.events`
                );
            }
        });
    }

    if (removed && typeof store.save === 'function') {
        const scopes = touchedScopes.size ? Array.from(touchedScopes) : undefined;
        store.save({ scope: scopes });
    }
}

const REQUISITION_STATUSES = ["Pending", "Approved", "In Transit", "Delivered", "Denied"];
const REQUISITION_PRIORITIES = ["Routine", "Tactical", "Emergency"];
const REQUISITION_PRIORITY_WEIGHT = REQUISITION_PRIORITIES.reduce((acc, val, idx) => {
    acc[val] = idx;
    return acc;
}, {});

function setMobileToolSpawnData(el, type, data = null) {
    if (!el || !el.dataset) return;
    if (!type) {
        delete el.dataset.mobileSpawnType;
        delete el.dataset.mobileSpawnData;
        return;
    }
    el.dataset.mobileSpawnType = String(type);
    if (data && typeof data === 'object' && Object.keys(data).length) {
        el.dataset.mobileSpawnData = JSON.stringify(data);
    } else {
        delete el.dataset.mobileSpawnData;
    }
}

function parseMobileToolSpawnData(el) {
    if (!el || !el.dataset) return null;
    const type = String(el.dataset.mobileSpawnType || el.dataset.nodeType || '').trim();
    if (!type) return null;
    let data = {};
    const raw = el.dataset.mobileSpawnData;
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch (err) {
            data = {};
        }
    }
    return { type, data };
}

function handleMobileToolTapInsert(event) {
    if (!mobileMode) return;
    const target = event.target;
    const toolEl = target && typeof target.closest === 'function' ? target.closest('.tool-item') : null;
    if (!toolEl) return;
    if (toolEl.id && toolEl.id.startsWith('btn-')) return;
    if (!toolEl.closest('.toolbar') && !toolEl.closest('.popup-menu')) return;

    const config = parseMobileToolSpawnData(toolEl);
    if (!config) return;

    event.preventDefault();
    event.stopPropagation();

    const spawn = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const node = createNode(config.type, spawn.x, spawn.y, null, config.data || {});
    logNodeAddedToBoard(getNodeSummary(node.id));
    saveBoard();

    if (toolEl.closest('.popup-menu')) closePopups();
}

// --- INITIALIZATION ---
function bindMobileHandlers() {
    if (mobileHandlersBound) return;
    mobileHandlersBound = true;

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    document.addEventListener('click', handleMobileToolTapInsert);

    if (coarsePointerQuery) {
        if (typeof coarsePointerQuery.addEventListener === 'function') {
            coarsePointerQuery.addEventListener('change', applyMobileModeClass);
        } else if (typeof coarsePointerQuery.addListener === 'function') {
            coarsePointerQuery.addListener(applyMobileModeClass);
        }
    }
}

function handleBoardResize() {
    resizeCanvas();
    applyMobileModeClass();
}

function getBoardCrossLinkRequestFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const nodeId = String(params.get('nodeId') || '').trim();
    if (nodeId) return { kind: 'node', nodeId };

    const linkType = String(params.get('linkType') || '').trim().toLowerCase();
    const id = String(params.get('id') || '').trim();
    if (!linkType || !id) return null;
    if (!BOARD_CROSSLINK_TYPES.has(linkType)) return null;
    return { kind: 'cross-link', linkType, id };
}

function clearBoardCrossLinkParamsFromUrl() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    const url = new URL(window.location.href);
    let changed = false;
    ['linkType', 'id', 'nodeId'].forEach((key) => {
        if (!url.searchParams.has(key)) return;
        url.searchParams.delete(key);
        changed = true;
    });
    if (changed) window.history.replaceState({}, document.title, url.toString());
}

function findNodeBySourceReference(sourceType, sourceIdKey, sourceId) {
    if (!sourceType || !sourceIdKey || !sourceId) return null;
    const targetId = String(sourceId);
    const source = String(sourceType);
    const nodesOnBoard = Array.from(document.querySelectorAll('.node'));
    for (let i = 0; i < nodesOnBoard.length; i += 1) {
        const nodeEl = nodesOnBoard[i];
        const meta = getNodeMeta(nodeEl);
        if (!meta) continue;
        if (String(meta.sourceType || '') !== source) continue;
        if (String(meta[sourceIdKey] || '') === targetId) return nodeEl;
    }
    return null;
}

function centerViewOnNode(nodeEl) {
    if (!nodeEl) return;
    const nodeLeft = Number.parseFloat(nodeEl.style.left) || 0;
    const nodeTop = Number.parseFloat(nodeEl.style.top) || 0;
    const width = nodeEl.offsetWidth || 150;
    const height = nodeEl.offsetHeight || 90;
    const centerX = nodeLeft + (width / 2);
    const centerY = nodeTop + (height / 2);
    view.x = (window.innerWidth / 2) - centerX * view.scale;
    view.y = (window.innerHeight / 2) - centerY * view.scale;
    updateViewCSS();
}

function flashCrossLinkedNode(nodeEl) {
    if (!nodeEl) return;
    nodeEl.classList.add('board-linked-focus');
    setTimeout(() => {
        nodeEl.classList.remove('board-linked-focus');
    }, BOARD_LINK_FLASH_MS);
}

function resolveCrossLinkPayload(request) {
    const store = window.RTF_STORE;
    const campaign = store && store.state && store.state.campaign ? store.state.campaign : null;
    if (!store || !campaign || !request) return null;

    if (request.linkType === 'npc') {
        const npcs = Array.isArray(campaign.npcs) ? campaign.npcs : [];
        const npc = npcs.find((entry) => String(entry && entry.id || '') === request.id);
        if (!npc) return null;
        const payload = buildNPCNodePayload(npc);
        return { ...payload, sourceType: 'npc', sourceIdKey: 'npcId', sourceId: request.id };
    }

    if (request.linkType === 'location') {
        const locations = Array.isArray(campaign.locations) ? campaign.locations : [];
        const location = locations.find((entry) => String(entry && entry.id || '') === request.id);
        if (!location) return null;
        const payload = buildLocationNodePayload(location);
        return { ...payload, sourceType: 'location', sourceIdKey: 'locationId', sourceId: request.id };
    }

    if (request.linkType === 'timeline-event') {
        const events = getBoardTimelineEvents(store);
        const evt = events.find((entry) => String(entry && entry.id || '') === request.id);
        if (!evt) return null;
        const payload = buildEventNodePayload(evt);
        return { ...payload, sourceType: 'timeline-event', sourceIdKey: 'eventId', sourceId: request.id };
    }

    if (request.linkType === 'requisition') {
        const requisitions = (typeof store.getRequisitions === 'function')
            ? store.getRequisitions()
            : (Array.isArray(campaign.requisitions) ? campaign.requisitions : []);
        const req = requisitions.find((entry) => String(entry && entry.id || '') === request.id);
        if (!req) return null;
        const payload = buildRequisitionNodePayload(req);
        return { ...payload, sourceType: 'requisition', sourceIdKey: 'requisitionId', sourceId: request.id };
    }

    if (request.linkType === 'case') {
        const cases = store.state && store.state.cases && Array.isArray(store.state.cases.items)
            ? store.state.cases.items
            : [];
        const caseEntry = cases.find((entry) => String(entry && entry.id || '') === request.id);
        if (!caseEntry) return null;
        const activeScope = (typeof store.getActiveCampaignScope === 'function')
            ? store.getActiveCampaignScope()
            : null;
        const payload = buildCaseReferenceNodePayload(caseEntry, activeScope);
        return { ...payload, sourceType: 'case', sourceIdKey: 'caseId', sourceId: request.id };
    }

    return null;
}

function applyBoardCrossLinkFromUrl() {
    const request = getBoardCrossLinkRequestFromUrl();
    if (!request) return;
    clearBoardCrossLinkParamsFromUrl();

    if (request.kind === 'node') {
        const target = document.getElementById(request.nodeId);
        if (!target) return;
        centerViewOnNode(target);
        flashCrossLinkedNode(target);
        return;
    }

    const payload = resolveCrossLinkPayload(request);
    if (!payload) return;

    const existing = findNodeBySourceReference(payload.sourceType, payload.sourceIdKey, payload.sourceId);
    const target = existing || (() => {
        const spawn = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
        const node = createNode(payload.nodeType, spawn.x, spawn.y, null, payload.nodeData);
        logNodeAddedToBoard(getNodeSummary(node.id));
        saveBoard();
        return node;
    })();
    if (existing) {
        updateNodeImageMeta(existing, payload.nodeData && payload.nodeData.imageUrl ? payload.nodeData.imageUrl : '');
        updateNodeCache(existing.id);
        saveBoard();
    }

    centerViewOnNode(target);
    flashCrossLinkedNode(target);
}

function trimSingleLine(value, maxLen = 140) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function collectConnectedNodeIds(rootId) {
    const startId = String(rootId || '').trim();
    if (!startId) return [];
    const visited = new Set();
    const queue = [startId];

    while (queue.length) {
        const current = queue.shift();
        if (!current || visited.has(current)) continue;
        visited.add(current);

        for (let i = 0; i < connections.length; i += 1) {
            const conn = connections[i];
            if (conn.from === current && conn.to && !visited.has(conn.to)) queue.push(conn.to);
            if (conn.to === current && conn.from && !visited.has(conn.from)) queue.push(conn.from);
        }
    }

    return Array.from(visited);
}

function extractEventHeat(summary) {
    if (!summary || typeof summary !== 'object') return 0;
    const meta = summary.meta && typeof summary.meta === 'object' ? summary.meta : null;
    if (meta && meta.heatDelta !== undefined && meta.heatDelta !== null && meta.heatDelta !== '') {
        const parsed = Number(meta.heatDelta);
        if (Number.isFinite(parsed)) return Math.abs(parsed);
    }
    const match = String(summary.bodyText || '').match(/\bheat\s*[:=]?\s*([+-]?\d+)/i);
    if (!match) return 0;
    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function inferDraftTierFromCluster(eventSummaries, clusterSize) {
    const maxHeat = eventSummaries.reduce((maxVal, summary) => Math.max(maxVal, extractEventHeat(summary)), 0);
    if (maxHeat >= 5 || clusterSize >= 10) return 'Boss';
    if (maxHeat >= 3 || clusterSize >= 7) return 'Elite';
    if (maxHeat >= 2 || clusterSize >= 4) return 'Standard';
    return 'Routine';
}

function buildEncounterDraftFromCluster(rootId) {
    const anchorId = String(rootId || '').trim();
    if (!anchorId) return null;
    const clusterIds = collectConnectedNodeIds(anchorId);
    if (!clusterIds.length) return null;

    const summaries = clusterIds
        .map((id) => getNodeSummary(id))
        .filter((summary) => summary && typeof summary === 'object');
    if (!summaries.length) return null;

    const byType = {
        person: [],
        location: [],
        clue: [],
        theory: [],
        note: [],
        event: [],
        requisition: [],
        other: []
    };

    summaries.forEach((summary) => {
        const type = String(summary.type || '');
        if (Object.prototype.hasOwnProperty.call(byType, type)) {
            byType[type].push(summary);
        } else {
            byType.other.push(summary);
        }
    });

    const anchorSummary = summaries.find((entry) => entry.id === anchorId) || summaries[0];
    const caseName = getCaseName();
    const clusterIdSet = new Set(clusterIds);
    const clusterConnections = connections.filter((conn) => clusterIdSet.has(conn.from) && clusterIdSet.has(conn.to));
    const titleById = new Map(summaries.map((summary) => [summary.id, trimSingleLine(summary.title, 90)]));

    const locationText = byType.location.length
        ? byType.location.map((entry) => trimSingleLine(entry.title, 80)).filter(Boolean).join(', ')
        : (byType.event[0] && byType.event[0].meta && byType.event[0].meta.focus
            ? trimSingleLine(byType.event[0].meta.focus, 120)
            : '');

    const objective = trimSingleLine(
        (byType.event[0] && byType.event[0].title)
        || (byType.theory[0] && `Test theory: ${byType.theory[0].title}`)
        || (byType.clue[0] && `Secure ${byType.clue[0].title}`)
        || `Resolve lead: ${anchorSummary.title}`,
        180
    );

    const opposition = byType.person.map((entry) => {
        const detail = trimSingleLine(entry.bodyText, 110);
        return detail ? `${trimSingleLine(entry.title, 80)} - ${detail}` : trimSingleLine(entry.title, 120);
    }).filter(Boolean);
    if (!opposition.length) {
        opposition.push(`Unknown hostile force tied to ${trimSingleLine(anchorSummary.title, 90)}`);
    }

    const hazards = [];
    byType.clue.forEach((entry) => {
        hazards.push(`Clue pressure: ${trimSingleLine(entry.title, 80)}${entry.bodyText ? ` - ${trimSingleLine(entry.bodyText, 90)}` : ''}`);
    });
    byType.note.forEach((entry) => {
        hazards.push(`Complication: ${trimSingleLine(entry.title, 80)}${entry.bodyText ? ` - ${trimSingleLine(entry.bodyText, 90)}` : ''}`);
    });
    byType.theory.forEach((entry) => {
        hazards.push(`Theory risk: ${trimSingleLine(entry.title, 80)} may be misleading if unverified.`);
    });
    byType.event.forEach((entry) => {
        const heat = extractEventHeat(entry);
        if (heat > 0) hazards.push(`Heat spike: ${trimSingleLine(entry.title, 90)} (${heat})`);
    });
    if (!hazards.length) {
        hazards.push(`Escalation around ${trimSingleLine(anchorSummary.title, 90)}`);
    }

    const beats = [];
    byType.event.forEach((entry) => {
        beats.push(`Beat: ${trimSingleLine(entry.title, 120)}`);
    });
    clusterConnections.forEach((conn) => {
        const label = trimSingleLine(conn.label || '', 90);
        if (!label) return;
        const from = titleById.get(conn.from) || 'Unknown';
        const to = titleById.get(conn.to) || 'Unknown';
        beats.push(`Link: ${from} -> ${to} (${label})`);
    });
    if (!beats.length) {
        beats.push(`Primary thread: ${trimSingleLine(anchorSummary.title, 120)}`);
    }

    const rewards = byType.requisition
        .map((entry) => trimSingleLine(entry.title, 90))
        .filter(Boolean)
        .map((title) => `Resource payoff: ${title}`);

    return {
        title: trimSingleLine(`${caseName}: ${anchorSummary.title}`, 180),
        tier: inferDraftTierFromCluster(byType.event, summaries.length),
        location: locationText,
        objective,
        opposition: opposition.join('\n'),
        hazards: hazards.join('\n'),
        beats: beats.join('\n'),
        rewards: rewards.join('\n'),
        notes: `Drafted from board cluster around "${trimSingleLine(anchorSummary.title, 120)}" in case "${caseName}".`
    };
}

function openEncounterDraftFromBoard(draft) {
    if (!draft || typeof draft !== 'object') return;
    const token = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const storageKey = ENCOUNTER_DRAFT_STORAGE_PREFIX + token;
    const payload = { createdAt: Date.now(), draft };

    try {
        sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
        alert('Could not prepare encounter draft.');
        return;
    }

    const url = new URL('encounters.html', window.location.href);
    url.searchParams.set('draft', token);
    url.searchParams.set('source', 'board');
    window.location.assign(url.toString());
}

function draftEncounterFromTargetNode() {
    const targetId = contextMenu && contextMenu.dataset ? contextMenu.dataset.target : '';
    const draft = buildEncounterDraftFromCluster(targetId);
    contextMenu.style.display = 'none';
    if (!draft) {
        alert('Could not draft encounter from this cluster.');
        return;
    }
    openEncounterDraftFromBoard(draft);
}

window.addEventListener('load', async () => {
    await waitForExternalBoardReady();
    bindDelegatedDataHandlers();
    applyMobileModeClass();
    bindMobileHandlers();
    pruneBoardTimelineNoise();
    resizeCanvas();
    const panBtn = document.getElementById('btn-pan');
    if (panBtn) panBtn.title = `Shortcut: ${SHORTCUT_KEYS.pan}`;
    initToolbars();
    loadBoard();
    applyBoardCrossLinkFromUrl();
    updateViewCSS();
    initCaseNameTracking();
    window.addEventListener('rtf-store-updated', handleRemoteStoreUpdate);
    requestAnimationFrame(loop);
});

window.addEventListener('resize', () => handleBoardResize());

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function handleRemoteStoreUpdate(event) {
    if (isExternalBoardMode()) return;
    if (!event || !event.detail || event.detail.source !== 'remote') return;
    loadBoard();
    renderNotePopup();
    updateViewCSS();
}

function initToolbars() {
    initGuildToolbar();
    initNPCToolbar();
    initLocationToolbar();
    initEventToolbar();
    initRequisitionToolbar();
    initNoteToolbar();
    initFormattingToolbar();
}

function initFormattingToolbar() {
    if (document.getElementById('formatting-toolbar')) return;
    const tb = document.createElement('div');
    tb.id = 'formatting-toolbar';
    tb.className = 'formatting-toolbar';
    tb.dataset.targetNodeId = '';
    tb.dataset.ignoreBlur = 'false';

    ['bold', 'italic', 'underline'].forEach(cmd => {
        const btn = document.createElement('div');
        btn.className = 'formatting-btn';
        btn.dataset.cmd = cmd;
        // Icons: B, I, U
        btn.innerHTML = cmd === 'bold' ? 'B' : cmd === 'italic' ? 'I' : 'U';
        btn.style.fontStyle = cmd === 'italic' ? 'italic' : 'normal';
        btn.style.textDecoration = cmd === 'underline' ? 'underline' : 'none';

        btn.onmousedown = (e) => {
            e.preventDefault(); // Prevent losing focus
            document.execCommand(cmd, false, null);
            saveBoard();
        };
        tb.appendChild(btn);
    });

    const meta = document.createElement('div');
    meta.className = 'formatting-meta-controls';
    meta.innerHTML = `
        <div class="formatting-meta-row" data-meta-row="confidence">
            <div class="formatting-meta-label">Confidence <span data-meta-value="confidence">50%</span></div>
            <input type="range" class="formatting-meta-slider" min="0" max="100" step="1" value="50" data-meta-slider="confidence">
        </div>
        <div class="formatting-meta-row" data-meta-row="reliability">
            <div class="formatting-meta-label">Reliability <span data-meta-value="reliability">Unknown</span></div>
            <input type="range" class="formatting-meta-slider" min="0" max="${RELIABILITY_ORDER.length - 1}" step="1" value="0" data-meta-slider="reliability">
        </div>
    `;
    tb.appendChild(meta);

    const applySliderChange = (kind, rawValue) => {
        const targetId = String(tb.dataset.targetNodeId || '');
        if (!targetId) return;
        const nodeEl = document.getElementById(targetId);
        if (!nodeEl) return;
        const type = getNodeTypeFromEl(nodeEl);
        if (kind === 'confidence') {
            if (type !== 'theory') return;
            const nextConfidence = clampPercent(rawValue, 50);
            applyNarrativeMetaUpdate(nodeEl, { confidence: nextConfidence });
            return;
        }
        if (kind === 'reliability') {
            if (!NARRATIVE_RELIABILITY_NODE_TYPES.has(type)) return;
            const nextReliability = reliabilityFromIndex(rawValue);
            applyNarrativeMetaUpdate(nodeEl, { reliability: nextReliability });
        }
    };

    meta.querySelectorAll('[data-meta-slider]').forEach((input) => {
        input.addEventListener('mousedown', (event) => {
            event.stopPropagation();
        });
        input.addEventListener('focus', () => {
            tb.dataset.ignoreBlur = 'true';
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                tb.dataset.ignoreBlur = 'false';
            }, 0);
        });
        input.addEventListener('input', () => {
            const kind = String(input.dataset.metaSlider || '');
            if (kind === 'confidence') {
                const val = clampPercent(input.value, 50);
                const valueEl = tb.querySelector('[data-meta-value="confidence"]');
                if (valueEl) valueEl.textContent = `${val}%`;
                applySliderChange(kind, val);
                return;
            }
            if (kind === 'reliability') {
                const reliability = reliabilityFromIndex(input.value);
                const valueEl = tb.querySelector('[data-meta-value="reliability"]');
                if (valueEl) valueEl.textContent = getReliabilityLabel(reliability);
                applySliderChange(kind, input.value);
            }
        });
    });

    document.body.appendChild(tb);
}

function syncFormattingToolbarMeta(nodeEl) {
    const tb = document.getElementById('formatting-toolbar');
    if (!tb) return;
    const metaControls = tb.querySelector('.formatting-meta-controls');
    const confidenceRow = tb.querySelector('[data-meta-row="confidence"]');
    const reliabilityRow = tb.querySelector('[data-meta-row="reliability"]');
    const confidenceSlider = tb.querySelector('[data-meta-slider="confidence"]');
    const reliabilitySlider = tb.querySelector('[data-meta-slider="reliability"]');
    const confidenceValue = tb.querySelector('[data-meta-value="confidence"]');
    const reliabilityValue = tb.querySelector('[data-meta-value="reliability"]');
    if (!nodeEl) {
        tb.dataset.targetNodeId = '';
        if (metaControls) metaControls.style.display = 'none';
        if (confidenceRow) confidenceRow.style.display = 'none';
        if (reliabilityRow) reliabilityRow.style.display = 'none';
        return;
    }

    tb.dataset.targetNodeId = String(nodeEl.id || '');
    const type = getNodeTypeFromEl(nodeEl);
    const meta = NARRATIVE_META_NODE_TYPES.has(type)
        ? (ensureNarrativeNodeMeta(nodeEl) || {})
        : {};

    const showConfidence = type === 'theory';
    if (confidenceRow) confidenceRow.style.display = showConfidence ? '' : 'none';
    if (showConfidence) {
        const confidence = clampPercent(meta.confidence, 50);
        if (confidenceSlider) confidenceSlider.value = String(confidence);
        if (confidenceValue) confidenceValue.textContent = `${confidence}%`;
    }

    const showReliability = NARRATIVE_RELIABILITY_NODE_TYPES.has(type);
    if (reliabilityRow) reliabilityRow.style.display = showReliability ? '' : 'none';
    if (showReliability) {
        const reliability = normalizeReliability(meta.reliability);
        const reliabilityIdx = reliabilityToIndex(reliability);
        if (reliabilitySlider) reliabilitySlider.value = String(reliabilityIdx);
        if (reliabilityValue) reliabilityValue.textContent = getReliabilityLabel(reliability);
    }
    if (metaControls) metaControls.style.display = (showConfidence || showReliability) ? 'flex' : 'none';
}

function getBoardGuildNames() {
    if (typeof window.getRTFGuilds === 'function') {
        const list = window.getRTFGuilds({ includeGuildless: true });
        if (Array.isArray(list) && list.length) return list;
    }
    if (window.RTF_DATA && Array.isArray(window.RTF_DATA.guilds) && window.RTF_DATA.guilds.length) {
        return window.RTF_DATA.guilds;
    }
    return [];
}

function getBoardGuildEntries() {
    const names = getBoardGuildNames();
    const clueGuilds = (window.RTF_DATA && window.RTF_DATA.clue && Array.isArray(window.RTF_DATA.clue.guilds))
        ? window.RTF_DATA.clue.guilds
        : [];

    const clueByName = new Map();
    clueGuilds.forEach((entry) => {
        if (!entry || !entry.name) return;
        clueByName.set(String(entry.name).trim().toLowerCase(), entry);
    });

    const seenIds = new Set();
    const out = [];
    names.forEach((name, idx) => {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        const clue = clueByName.get(cleanName.toLowerCase());
        let id = clue && clue.id ? String(clue.id).trim() : '';
        if (!id) id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!id) id = `guild-${idx + 1}`;
        if (seenIds.has(id)) id = `${id}-${idx + 1}`;
        seenIds.add(id);

        out.push({
            id,
            name: cleanName,
            icon: clue && clue.icon ? clue.icon : '🏷️'
        });
    });

    return out;
}

function buildNPCNodePayload(npc) {
    const source = npc && typeof npc === 'object' ? npc : {};
    let body = `${sanitizeText(source.guild || 'Unassigned')}`;
    const safeTrustIdx = clampTrackIndex(source.trust, 2);
    const safeStigmaIdx = clampTrackIndex(source.stigma, 0);
    body += `<br><strong>Trust:</strong> ${sanitizeText(TRUST_LEVEL_LABELS[safeTrustIdx] || 'Neutral')}`;
    body += `<br><strong>Stigma:</strong> ${sanitizeText(STIGMA_LEVEL_LABELS[safeStigmaIdx] || 'Clean')}`;
    if (source.wants) body += `<br><strong>Wants:</strong> ${sanitizeMultiline(source.wants)}`;
    if (source.leverage) body += `<br><strong>Lev:</strong> ${sanitizeMultiline(source.leverage)}`;
    if (source.notes) body += `<br><strong>Note:</strong> ${sanitizeMultiline(source.notes)}`;

    return {
        nodeType: 'person',
        nodeData: {
            title: source.name || 'Unknown NPC',
            body,
            imageUrl: source.imageUrl || '',
            meta: {
                sourceType: 'npc',
                npcId: source.id || '',
                npcName: source.name || 'Unknown NPC',
                guild: source.guild || '',
                trust: safeTrustIdx,
                stigma: safeStigmaIdx
            }
        }
    };
}

function buildLocationNodePayload(location) {
    const source = location && typeof location === 'object' ? location : {};
    let body = `${sanitizeText(source.district || '')}`;
    const safeTrustIdx = clampTrackIndex(source.trust, 2);
    const safeStigmaIdx = clampTrackIndex(source.stigma, 0);
    body += `<br><strong>Trust:</strong> ${sanitizeText(TRUST_LEVEL_LABELS[safeTrustIdx] || 'Neutral')}`;
    body += `<br><strong>Stigma:</strong> ${sanitizeText(STIGMA_LEVEL_LABELS[safeStigmaIdx] || 'Clean')}`;
    if (source.desc) body += `<br>${sanitizeMultiline(source.desc)}`;
    if (source.connections) body += `<br><strong>Connections:</strong> ${sanitizeMultiline(source.connections)}`;
    if (source.properties) body += `<br><strong>Properties:</strong> ${sanitizeMultiline(source.properties)}`;
    if (source.notes) body += `<br><strong>Note:</strong> ${sanitizeMultiline(source.notes)}`;

    return {
        nodeType: 'location',
        nodeData: {
            title: source.name || 'Location',
            body,
            imageUrl: source.imageUrl || '',
            meta: {
                sourceType: 'location',
                locationId: source.id || '',
                locationName: source.name || 'Location',
                district: source.district || '',
                trust: safeTrustIdx,
                stigma: safeStigmaIdx
            }
        }
    };
}

function buildEventNodePayload(evt) {
    const source = evt && typeof evt === 'object' ? evt : {};
    const heat = parseInt(source.heatDelta, 10);
    const severity = String(source.impactSeverity || 'moderate');
    const scope = String(source.impactScope || 'local');
    const lines = [];
    if (source.focus) lines.push(`<strong>Focus:</strong> ${sanitizeText(source.focus)}`);
    if (!isNaN(heat) && heat !== 0) lines.push(`<strong>Heat:</strong> ${heat > 0 ? '+' : ''}${heat}`);
    if (source.dueAt) {
        const dueTs = Date.parse(String(source.dueAt));
        if (Number.isFinite(dueTs)) {
            lines.push(`<strong>Due:</strong> ${sanitizeText(new Date(dueTs).toLocaleString())}`);
        }
    }
    lines.push(`<strong>Impact:</strong> ${sanitizeText(severity)} / ${sanitizeText(scope)}`);
    if (source.highlights) lines.push(`<strong>Beats:</strong><br>${sanitizeMultiline(source.highlights)}`);
    if (source.fallout) lines.push(`<strong>Fallout:</strong><br>${sanitizeMultiline(source.fallout)}`);
    if (source.followUp) lines.push(`<strong>Next:</strong> ${sanitizeMultiline(source.followUp)}`);

    return {
        nodeType: 'event',
        nodeData: {
            title: source.title || 'Event',
            body: lines.join('<br>'),
            imageUrl: source.imageUrl || '',
            meta: {
                sourceType: 'timeline-event',
                eventId: source.id || '',
                heatDelta: !isNaN(heat) ? heat : '',
                focus: source.focus || '',
                caseId: source.caseId || '',
                dueAt: source.dueAt || '',
                impactSeverity: severity,
                impactScope: scope
            }
        }
    };
}

function buildRequisitionNodePayload(req) {
    const source = req && typeof req === 'object' ? req : {};
    const lines = [];
    lines.push(`<strong>Agent:</strong> ${sanitizeText(source.requester || 'Unassigned')}`);
    if (source.status || source.priority) {
        lines.push(`<strong>Status:</strong> ${sanitizeText(source.status || 'Pending')} (${sanitizeText(source.priority || 'Routine')})`);
    }
    if (source.value) lines.push(`<strong>Value:</strong> ${sanitizeText(source.value)}`);
    if (source.purpose) lines.push(`<strong>Purpose:</strong> ${sanitizeMultiline(source.purpose)}`);
    if (source.notes) lines.push(`<strong>Notes:</strong> ${sanitizeMultiline(source.notes)}`);

    return {
        nodeType: 'requisition',
        nodeData: {
            title: source.item || 'Requisition',
            body: lines.join('<br>'),
            imageUrl: source.imageUrl || '',
            meta: {
                sourceType: 'requisition',
                requisitionId: source.id || '',
                status: source.status || 'Pending',
                priority: source.priority || 'Routine'
            }
        }
    };
}

function buildCaseReferenceNodePayload(caseEntry, scopeEntry = null) {
    const source = caseEntry && typeof caseEntry === 'object' ? caseEntry : {};
    const scope = scopeEntry && typeof scopeEntry === 'object' ? scopeEntry : null;
    const caseId = String(source.id || '').trim();
    const caseName = String(source.name || 'Case').trim() || 'Case';
    const board = source.board && typeof source.board === 'object' ? source.board : {};
    const caseEvents = Array.isArray(source.events) ? source.events : [];
    const boardNodes = Array.isArray(board.nodes) ? board.nodes.length : 0;
    const boardLinks = Array.isArray(board.connections) ? board.connections.length : 0;

    const scopeName = scope ? String(scope.name || '').trim() : '';
    const scopeCaseOrder = scope && Array.isArray(scope.caseOrder) ? scope.caseOrder : [];
    const sequence = caseId ? (scopeCaseOrder.findIndex((id) => String(id || '') === caseId) + 1) : 0;
    const statusMap = scope && scope.caseStatus && typeof scope.caseStatus === 'object' ? scope.caseStatus : {};
    const status = caseId ? String(statusMap[caseId] || '').trim().toLowerCase() : '';

    const lines = [];
    if (scopeName) lines.push(`<strong>Scope:</strong> ${sanitizeText(scopeName)}`);
    if (sequence > 0) lines.push(`<strong>Sequence:</strong> #${sequence}`);
    if (status) lines.push(`<strong>Status:</strong> ${sanitizeText(status.charAt(0).toUpperCase() + status.slice(1))}`);
    lines.push(`<strong>Timeline Events:</strong> ${caseEvents.length}`);
    lines.push(`<strong>Board Graph:</strong> ${boardNodes} nodes / ${boardLinks} links`);

    return {
        nodeType: 'note',
        nodeData: {
            title: `Case Ref: ${caseName}`.slice(0, 180),
            body: lines.join('<br>'),
            meta: {
                sourceType: 'case',
                caseId,
                caseName,
                scopeId: scope ? String(scope.id || '').trim().slice(0, 120) : '',
                scopeName: scopeName.slice(0, 160),
                caseStatus: status.slice(0, 40)
            }
        }
    };
}

function getLeadStatusLabel(status) {
    const clean = String(status || '').trim().toLowerCase();
    return LEAD_STATUS_LABELS[clean] || LEAD_STATUS_LABELS.open;
}

function getLedgerStatusLabel(status) {
    const clean = String(status || '').trim().toLowerCase();
    return LEDGER_STATUS_LABELS[clean] || LEDGER_STATUS_LABELS.stable;
}

function getLedgerSourceLabel(sourceType) {
    const clean = String(sourceType || '').trim().toLowerCase();
    return LEDGER_SOURCE_LABELS[clean] || LEDGER_SOURCE_LABELS.manual;
}

function buildFreeformNoteNodePayload() {
    return {
        nodeType: 'note',
        nodeData: {
            title: 'Freeform Note',
            body: '',
            meta: {
                sourceType: 'freeform-note'
            }
        }
    };
}

function buildLeadNoteNodePayload(lead) {
    const source = lead && typeof lead === 'object' ? lead : {};
    const titleBase = String(source.title || '').trim() || 'Untitled Lead';
    const question = String(source.question || '').trim();
    const nextStep = String(source.nextStep || '').trim();
    const targetId = String(source.targetId || '').trim();
    const type = String(source.type || 'other').trim().toLowerCase();
    const status = String(source.status || 'open').trim().toLowerCase();
    const statusLabel = getLeadStatusLabel(status);
    const typeLabel = type ? type.toUpperCase() : 'OTHER';
    const lines = [];
    lines.push(`<div><strong>Status</strong>: ${sanitizeText(statusLabel)} | <strong>Type</strong>: ${sanitizeText(typeLabel)}</div>`);
    if (question) lines.push(`<div><strong>Question</strong><br>${sanitizeMultiline(question)}</div>`);
    if (nextStep) lines.push(`<div><strong>Next Step</strong><br>${sanitizeMultiline(nextStep)}</div>`);
    if (!question && !nextStep) lines.push('<div><strong>Next Step</strong><br>Clarify this lead with a concrete action.</div>');

    return {
        nodeType: 'note',
        nodeData: {
            title: titleBase.slice(0, 180),
            body: lines.join('<br>'),
            meta: {
                sourceType: 'lead',
                leadId: String(source.id || '').trim().slice(0, 120),
                leadType: type.slice(0, 40),
                leadStatus: status.slice(0, 40),
                leadTargetId: targetId.slice(0, 120)
            }
        }
    };
}

function buildLedgerNoteNodePayload(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const statement = String(source.statement || '').trim();
    const notes = String(source.notes || '').trim();
    const status = String(source.status || 'stable').trim().toLowerCase();
    const sourceType = String(source.sourceType || 'manual').trim().toLowerCase();
    const sourceId = String(source.sourceId || '').trim();
    const certainty = clampPercent(source.certainty, 50);
    const titleBase = statement || 'Ledger Entry';
    const lines = [];
    lines.push(`<div><strong>Status</strong>: ${sanitizeText(getLedgerStatusLabel(status))} | <strong>Certainty</strong>: ${certainty}%</div>`);
    if (statement) lines.push(`<div><strong>Statement</strong><br>${sanitizeMultiline(statement)}</div>`);
    if (notes) lines.push(`<div><strong>Notes</strong><br>${sanitizeMultiline(notes)}</div>`);
    if (sourceType) lines.push(`<div><strong>Where Heard</strong>: ${sanitizeText(getLedgerSourceLabel(sourceType))}</div>`);
    if (sourceId && (sourceType === 'event' || sourceType === 'theory' || sourceType === 'clue')) {
        lines.push(`<div><strong>Linked Record</strong>: ${sanitizeText(sourceId)}</div>`);
    }

    return {
        nodeType: 'note',
        nodeData: {
            title: titleBase.slice(0, 180),
            body: lines.join('<br>'),
            meta: {
                sourceType: 'ledger',
                ledgerEntryId: String(source.id || '').trim().slice(0, 120),
                ledgerStatus: status.slice(0, 40),
                ledgerSourceType: sourceType.slice(0, 40),
                ledgerSourceId: sourceId.slice(0, 120),
                caseId: String(source.caseId || '').trim().slice(0, 120)
            }
        }
    };
}

let notePopupTab = 'freeform';
let noteLeadSearchQuery = '';
let noteLedgerSearchQuery = '';

function normalizeNoteTab(value) {
    const token = String(value || '').trim().toLowerCase();
    if (token === 'leads' || token === 'ledger') return token;
    return 'freeform';
}

function getBoardLeadEntries() {
    const caseId = getActiveLeadCaseId();
    const all = readLeadStorage();
    const list = Array.isArray(all[caseId]) ? all[caseId].slice() : [];
    list.sort((left, right) => String(right.updated || right.created || '').localeCompare(String(left.updated || left.created || '')));
    return list.slice(0, 40);
}

function getBoardLedgerEntries() {
    const store = window.RTF_STORE;
    if (!store || typeof store.getLedgerEntries !== 'function') return [];
    const entries = store.getLedgerEntries();
    const list = Array.isArray(entries) ? entries.slice() : [];
    list.sort((left, right) => String(right.lastChangedAt || right.created || '').localeCompare(String(left.lastChangedAt || left.created || '')));
    if (isCampaignBoardView()) return list.slice(0, 40);
    const activeCaseId = getBoardActiveCaseId(store);
    const caseScoped = list.filter((entry) => String(entry && entry.caseId || 'case_primary') === activeCaseId);
    return (caseScoped.length ? caseScoped : list).slice(0, 40);
}

function createNoteSpawnTool(icon, label, submeta, payload) {
    const el = document.createElement('div');
    el.className = 'tool-item';
    el.draggable = true;
    const safeLabel = sanitizeText(label || 'Note');
    const safeSubmeta = sanitizeText(submeta || '');
    const safeIcon = sanitizeText(icon || '📝');
    el.innerHTML = `<div class="icon">${safeIcon}</div><div class="label">${safeLabel}${safeSubmeta ? `<div class="board-tool-submeta">${safeSubmeta}</div>` : ''}</div>`;
    el.ondragstart = (e) => startDragNew(e, payload.nodeType, payload.nodeData);
    setMobileToolSpawnData(el, payload.nodeType, payload.nodeData);
    return el;
}

function applyNotePopupTabState() {
    const cleanTab = normalizeNoteTab(notePopupTab);
    const tabs = Array.from(document.querySelectorAll('#note-popup [data-note-tab]'));
    const panels = Array.from(document.querySelectorAll('#note-popup [data-note-panel]'));
    tabs.forEach((tabBtn) => {
        const tabName = normalizeNoteTab(tabBtn.dataset.noteTab);
        tabBtn.classList.toggle('is-active', tabName === cleanTab);
    });
    panels.forEach((panel) => {
        const panelName = normalizeNoteTab(panel.dataset.notePanel);
        panel.classList.toggle('is-active', panelName === cleanTab);
    });
    notePopupTab = cleanTab;
}

function renderNoteFreeformList() {
    const freeformList = document.getElementById('note-freeform-list');
    if (!freeformList) return;
    freeformList.innerHTML = '';
    const freeform = buildFreeformNoteNodePayload();
    freeformList.appendChild(createNoteSpawnTool('📝', 'Freeform Note', 'Blank sticky note', freeform));
}

function renderNoteLeadList() {
    const leadList = document.getElementById('note-lead-list');
    if (!leadList) return;
    const query = String(noteLeadSearchQuery || '').trim().toLowerCase();
    const leads = getBoardLeadEntries().filter((lead) => {
        if (!query) return true;
        const haystack = `${lead && lead.title || ''} ${lead && lead.question || ''} ${lead && lead.nextStep || ''} ${lead && lead.targetId || ''} ${lead && lead.type || ''} ${lead && lead.status || ''}`.toLowerCase();
        return haystack.includes(query);
    });
    if (!leads.length) {
        leadList.innerHTML = '<div class="board-popup-empty">No leads match this search.</div>';
        return;
    }
    leadList.innerHTML = '';
    leads.forEach((lead) => {
        const payload = buildLeadNoteNodePayload(lead);
        const title = String(lead && lead.title || '').trim() || 'Untitled Lead';
        const statusLabel = getLeadStatusLabel(lead && lead.status);
        const typeLabel = String(lead && lead.type || 'other').trim().toUpperCase();
        leadList.appendChild(createNoteSpawnTool('🧭', title, `${statusLabel} • ${typeLabel}`, payload));
    });
}

function renderNoteLedgerList() {
    const ledgerList = document.getElementById('note-ledger-list');
    if (!ledgerList) return;
    const query = String(noteLedgerSearchQuery || '').trim().toLowerCase();
    const ledgerEntries = getBoardLedgerEntries().filter((entry) => {
        if (!query) return true;
        const haystack = `${entry && entry.statement || ''} ${entry && entry.notes || ''} ${entry && entry.tags || ''} ${entry && entry.sourceType || ''} ${entry && entry.sourceId || ''} ${entry && entry.status || ''}`.toLowerCase();
        return haystack.includes(query);
    });
    if (!ledgerEntries.length) {
        ledgerList.innerHTML = '<div class="board-popup-empty">No ledger entries match this search.</div>';
        return;
    }
    ledgerList.innerHTML = '';
    ledgerEntries.forEach((entry) => {
        const payload = buildLedgerNoteNodePayload(entry);
        const statement = String(entry && entry.statement || '').trim() || 'Ledger Entry';
        const statusLabel = getLedgerStatusLabel(entry && entry.status);
        const certainty = clampPercent(entry && entry.certainty, 50);
        ledgerList.appendChild(createNoteSpawnTool('📚', statement, `${statusLabel} • ${certainty}%`, payload));
    });
}

function setNotePopupTab(tabName) {
    notePopupTab = normalizeNoteTab(tabName);
    applyNotePopupTabState();
}

function setNoteLeadSearch(value) {
    noteLeadSearchQuery = String(value || '');
    renderNoteLeadList();
}

function setNoteLedgerSearch(value) {
    noteLedgerSearchQuery = String(value || '');
    renderNoteLedgerList();
}

function renderNotePopup() {
    const container = document.getElementById('note-popup');
    if (!container) return;
    container.innerHTML = `
        <div class="note-tab-row">
            <button type="button" class="note-tab-btn" data-note-tab="freeform" data-onclick="setNotePopupTab('freeform')">Freeform</button>
            <button type="button" class="note-tab-btn" data-note-tab="leads" data-onclick="setNotePopupTab('leads')">Leads</button>
            <button type="button" class="note-tab-btn" data-note-tab="ledger" data-onclick="setNotePopupTab('ledger')">Ledger</button>
        </div>
        <section class="note-tab-panel" data-note-panel="freeform">
            <div id="note-freeform-list"></div>
        </section>
        <section class="note-tab-panel" data-note-panel="leads">
            <div class="note-search-row">
                <input id="note-lead-search" class="filter-input note-search-input" type="text" placeholder="Search leads..." data-oninput="setNoteLeadSearch(this.value)">
            </div>
            <div id="note-lead-list"></div>
        </section>
        <section class="note-tab-panel" data-note-panel="ledger">
            <div class="note-search-row">
                <input id="note-ledger-search" class="filter-input note-search-input" type="text" placeholder="Search ledger..." data-oninput="setNoteLedgerSearch(this.value)">
            </div>
            <div id="note-ledger-list"></div>
        </section>
    `;

    const leadSearchEl = document.getElementById('note-lead-search');
    const ledgerSearchEl = document.getElementById('note-ledger-search');
    if (leadSearchEl) leadSearchEl.value = noteLeadSearchQuery;
    if (ledgerSearchEl) ledgerSearchEl.value = noteLedgerSearchQuery;

    renderNoteFreeformList();
    renderNoteLeadList();
    renderNoteLedgerList();
    applyNotePopupTabState();
}

function initNoteToolbar() {
    if (!document.getElementById('note-popup')) return;
    renderNotePopup();
}

function initGuildToolbar() {
    const guildContainer = document.getElementById('guild-popup');
    if (!guildContainer) return;

    guildContainer.innerHTML = '<div id="guild-list-content"></div>';
    const list = document.getElementById('guild-list-content');
    const entries = getBoardGuildEntries();

    if (!entries.length) {
        list.innerHTML = '<div class="board-popup-empty">No guild entries available.</div>';
        return;
    }

    entries.forEach(g => {
        const el = document.createElement('div');
        el.className = `tool-item g-${g.id}`;
        el.draggable = true;
        const safeName = sanitizeText(g.name);
        const safeIcon = sanitizeText(g.icon);
        const nodeData = {
            title: g.name,
            body: 'Guild',
            meta: {
                sourceType: 'guild',
                guild: g.name,
                guildId: g.id
            }
        };
        el.ondragstart = (e) => startDragNew(e, g.id, nodeData);
        setMobileToolSpawnData(el, g.id, nodeData);
        el.innerHTML = `<div class="icon">${safeIcon}</div><div class="label">${safeName}</div>`;
        list.appendChild(el);
    });
}

function initNPCToolbar() {
    const container = document.getElementById('npc-popup');
    if (!container || !window.RTF_STORE) return;

    // Create Filter UI
    container.innerHTML = `
        <div class="filter-bar">
            <input type="text" id="npc-search" class="filter-input" placeholder="Search NPCs..." data-oninput="renderNPCs()">
            <select id="npc-guild-filter" class="filter-select" data-onchange="renderNPCs()">
                <option value="">All Guilds</option>
                ${getBoardGuildNames().map(g => `<option value="${sanitizeText(g)}">${sanitizeText(g)}</option>`).join('')}
            </select>
        </div>
        <div id="npc-list-content"></div>
    `;

    renderNPCs();
}

function renderNPCs() {
    const listContainer = document.getElementById('npc-list-content');
    if (!listContainer) return;

    const searchTerm = (document.getElementById('npc-search').value || '').toLowerCase();
    const guildFilter = document.getElementById('npc-guild-filter').value;

    const npcs = window.RTF_STORE.state.campaign.npcs || [];
    listContainer.innerHTML = '';

    const filtered = npcs.filter(npc => {
        const trust = TRUST_LEVEL_LABELS[clampTrackIndex(npc.trust, 2)] || '';
        const stigma = STIGMA_LEVEL_LABELS[clampTrackIndex(npc.stigma, 0)] || '';
        const text = `${npc.name} ${npc.wants || ''} ${npc.leverage || ''} ${npc.notes || ''} ${npc.guild || ''} ${trust} ${stigma}`.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        const matchesGuild = !guildFilter || (npc.guild && npc.guild.includes(guildFilter));
        return matchesSearch && matchesGuild;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="board-popup-empty">No NPCs found.</div>';
        return;
    }

    filtered.forEach(npc => {
        const el = document.createElement('div');
        el.className = 'tool-item';
        el.draggable = true;
        const payload = buildNPCNodePayload(npc);
        el.ondragstart = (e) => startDragNew(e, payload.nodeType, payload.nodeData);
        setMobileToolSpawnData(el, payload.nodeType, payload.nodeData);
        el.innerHTML = `<div class="icon">👤</div><div class="label">${sanitizeText(npc.name)}</div>`;
        listContainer.appendChild(el);
    });
}

function initLocationToolbar() {
    const container = document.getElementById('location-popup');
    if (!container || !window.RTF_STORE) return;

    // Create Filter UI
    container.innerHTML = `
        <div class="filter-bar">
            <input type="text" id="loc-search" class="filter-input" placeholder="Search Places..." data-oninput="renderLocations()">
            <select id="loc-guild-filter" class="filter-select" data-onchange="renderLocations()">
                <option value="">All Districts</option>
                ${getBoardGuildNames().map(g => `<option value="${sanitizeText(g)}">${sanitizeText(g)}</option>`).join('')}
            </select>
        </div>
        <div id="loc-list-content"></div>
    `;

    renderLocations();
}

function renderLocations() {
    const listContainer = document.getElementById('loc-list-content');
    if (!listContainer) return;

    const searchTerm = (document.getElementById('loc-search').value || '').toLowerCase();
    const guildFilter = document.getElementById('loc-guild-filter').value;

    const locs = window.RTF_STORE.state.campaign.locations || [];
    listContainer.innerHTML = '';

    const filtered = locs.filter(loc => {
        const trust = TRUST_LEVEL_LABELS[clampTrackIndex(loc.trust, 2)] || '';
        const stigma = STIGMA_LEVEL_LABELS[clampTrackIndex(loc.stigma, 0)] || '';
        const text = `${loc.name} ${loc.district || ''} ${loc.desc || ''} ${loc.notes || ''} ${loc.connections || ''} ${loc.properties || ''} ${trust} ${stigma}`.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        // Location "District" is essentially the Guild
        const matchesGuild = !guildFilter || (loc.district && loc.district.includes(guildFilter));
        return matchesSearch && matchesGuild;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="board-popup-empty">No Locations found.</div>';
        return;
    }

    filtered.forEach(loc => {
        const el = document.createElement('div');
        el.className = 'tool-item';
        el.draggable = true;
        const payload = buildLocationNodePayload(loc);
        el.ondragstart = (e) => startDragNew(e, payload.nodeType, payload.nodeData);
        setMobileToolSpawnData(el, payload.nodeType, payload.nodeData);
        el.innerHTML = `<div class="icon">📍</div><div class="label">${sanitizeText(loc.name)}</div>`;
        listContainer.appendChild(el);
    });
}

function initEventToolbar() {
    const container = document.getElementById('event-popup');
    if (!container || !window.RTF_STORE) return;

    container.innerHTML = `
        <div class="filter-bar">
            <input type="text" id="event-search-board" class="filter-input" placeholder="Search events..." data-oninput="renderBoardEvents()">
            <select id="event-focus-board" class="filter-select" data-onchange="renderBoardEvents()">
                <option value="">All Focuses</option>
            </select>
        </div>
        <div id="event-list-content"></div>
    `;

    renderBoardEvents();
}

function renderBoardEvents() {
    const listContainer = document.getElementById('event-list-content');
    if (!listContainer || !window.RTF_STORE) return;

    const searchTerm = (document.getElementById('event-search-board').value || '').toLowerCase();
    const focusFilterEl = document.getElementById('event-focus-board');

    const events = (getBoardTimelineEvents(window.RTF_STORE) || []).slice();
    const focuses = Array.from(new Set(events.map(e => e.focus).filter(Boolean))).sort();
    if (focusFilterEl) {
        const previouslySelected = focusFilterEl.value;
        focusFilterEl.innerHTML = '<option value="">All Focuses</option>' + focuses.map(f => `<option value="${sanitizeText(f)}">${sanitizeText(f)}</option>`).join('');
        if (focuses.includes(previouslySelected)) focusFilterEl.value = previouslySelected;
    }

    const filtered = events.filter(evt => {
        const text = `${evt.title || ''} ${evt.focus || ''} ${evt.highlights || ''} ${evt.fallout || ''} ${evt.followUp || ''}`.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        const focusMatch = focusFilterEl && focusFilterEl.value ? evt.focus === focusFilterEl.value : true;
        return matchesSearch && focusMatch;
    }).sort((a, b) => (b.created || '').localeCompare(a.created || ''));

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="board-popup-empty">No events logged.</div>';
        return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(evt => {
        const el = document.createElement('div');
        el.className = 'tool-item';
        el.draggable = true;
        const title = sanitizeText(evt.title || 'Event');
        const focus = sanitizeText(evt.focus || '');
        const heat = parseInt(evt.heatDelta, 10);
        const meta = focus ? focus : '';
        const heatBadge = !isNaN(heat) && heat !== 0
            ? `<span class="board-event-heat-badge ${heat > 0 ? 'is-positive' : 'is-negative'}">${heat > 0 ? '+' : ''}${heat} Heat</span>`
            : '';
        el.innerHTML = `<div class="icon">🕰️</div><div class="label">${title}${heatBadge}${meta ? `<div class="board-tool-submeta">${meta}</div>` : ''}</div>`;
        const payload = buildEventNodePayload(evt);
        el.ondragstart = (e) => startDragNew(e, payload.nodeType, payload.nodeData);
        setMobileToolSpawnData(el, payload.nodeType, payload.nodeData);
        listContainer.appendChild(el);
    });
}

function initRequisitionToolbar() {
    const container = document.getElementById('req-popup');
    if (!container || !window.RTF_STORE) return;

    container.innerHTML = `
        <div class="filter-bar">
            <input type="text" id="req-search-board" class="filter-input" placeholder="Search requisitions..." data-oninput="renderBoardRequisitions()">
            <select id="req-status-board" class="filter-select" data-onchange="renderBoardRequisitions()">
                <option value="">All Statuses</option>
                ${REQUISITION_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
        </div>
        <div id="req-list-content"></div>
    `;

    renderBoardRequisitions();
}

function renderBoardRequisitions() {
    const listContainer = document.getElementById('req-list-content');
    if (!listContainer || !window.RTF_STORE) return;

    const searchTerm = (document.getElementById('req-search-board').value || '').toLowerCase();
    const statusFilter = document.getElementById('req-status-board').value;

    const requisitions = (window.RTF_STORE.getRequisitions ? window.RTF_STORE.getRequisitions() : (window.RTF_STORE.state.campaign.requisitions || [])).slice();
    const filtered = requisitions.filter(req => {
        const text = `${req.item || ''} ${req.requester || ''} ${req.purpose || ''} ${req.notes || ''}`.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        const matchesStatus = statusFilter ? req.status === statusFilter : true;
        return matchesSearch && matchesStatus;
    }).sort((a, b) => {
        const pDiff = (REQUISITION_PRIORITY_WEIGHT[a.priority || 'Routine'] || 0) - (REQUISITION_PRIORITY_WEIGHT[b.priority || 'Routine'] || 0);
        if (pDiff !== 0) return pDiff;
        return (a.created || '').localeCompare(b.created || '');
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="board-popup-empty">No requisitions logged.</div>';
        return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(req => {
        const el = document.createElement('div');
        el.className = 'tool-item';
        el.draggable = true;
        const title = sanitizeText(req.item || 'Requisition');
        const sub = `${sanitizeText(req.requester || 'Unassigned')}${req.priority ? ' • ' + sanitizeText(req.priority) : ''}`;
        el.innerHTML = `<div class="icon">📦</div><div class="label">${title}<div class="board-tool-submeta">${sub}</div></div>`;
        const payload = buildRequisitionNodePayload(req);
        el.ondragstart = (e) => startDragNew(e, payload.nodeType, payload.nodeData);
        setMobileToolSpawnData(el, payload.nodeType, payload.nodeData);
        listContainer.appendChild(el);
    });
}

// --- CORE LOOPS ---

function loop() {
    updatePhysics();
    drawLayer();
    requestAnimationFrame(loop);
}

function updatePhysics() {
    const len = connections.length;

    for (let cIdx = 0; cIdx < len; cIdx++) {
        const conn = connections[cIdx];
        const bufferIdx = connToIndex.get(conn.id);

        if (sleepState[bufferIdx] === 0) continue;

        const c1 = nodeCache.get(conn.from);
        const c2 = nodeCache.get(conn.to);
        if (!c1 || !c2) continue;

        const basePtr = bufferIdx * BYTES_PER_CONN;

        // 1. Pin Endpoints.
        // Keep auto anchors stable from node-to-node direction; using rope-point
        // hints can drag anchors downward as the rope sags.
        const endpoints = getConnectionEndpointPositions(c1, c2, conn);
        const p1 = endpoints.from;
        const p2 = endpoints.to;

        physicsBuffer[basePtr] = p1.x;
        physicsBuffer[basePtr + 1] = p1.y;

        const lastPtr = basePtr + (CONFIG.POINTS_COUNT - 1) * STRIDE;
        physicsBuffer[lastPtr] = p2.x;
        physicsBuffer[lastPtr + 1] = p2.y;

        // 2. Verlet Integration
        let totalMotion = 0;

        for (let i = 1; i < CONFIG.POINTS_COUNT - 1; i++) {
            const ptr = basePtr + i * STRIDE;
            const x = physicsBuffer[ptr];
            const y = physicsBuffer[ptr + 1];
            const ox = physicsBuffer[ptr + 2];
            const oy = physicsBuffer[ptr + 3];

            const vx = (x - ox) * 0.90;
            const vy = (y - oy) * 0.90;

            physicsBuffer[ptr + 2] = x;
            physicsBuffer[ptr + 3] = y;

            physicsBuffer[ptr] = x + vx;
            physicsBuffer[ptr + 1] = y + vy + CONFIG.GRAVITY;

            totalMotion += Math.abs(vx) + Math.abs(vy);
        }

        // 3. Constraints
        let maxStress = 0;
        const stepCount = len > 140 ? 1 : CONFIG.PHYSICS_STEPS;

        for (let step = 0; step < stepCount; step++) {
            for (let i = 0; i < CONFIG.POINTS_COUNT - 1; i++) {
                const ptrA = basePtr + i * STRIDE;
                const ptrB = basePtr + (i + 1) * STRIDE;

                const x1 = physicsBuffer[ptrA];
                const y1 = physicsBuffer[ptrA + 1];
                const x2 = physicsBuffer[ptrB];
                const y2 = physicsBuffer[ptrB + 1];

                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.hypot(dx, dy);

                if (dist === 0) continue;

                const stress = Math.max(0, dist - CONFIG.SEGMENT_LENGTH);
                if (stress > maxStress) maxStress = stress;

                const diff = (dist - CONFIG.SEGMENT_LENGTH) / dist;
                const offsetX = dx * 0.5 * diff;
                const offsetY = dy * 0.5 * diff;

                if (i !== 0) {
                    physicsBuffer[ptrA] += offsetX;
                    physicsBuffer[ptrA + 1] += offsetY;
                }
                if ((i + 1) !== CONFIG.POINTS_COUNT - 1) {
                    physicsBuffer[ptrB] -= offsetX;
                    physicsBuffer[ptrB + 1] -= offsetY;
                }
            }
        }

        physicsBuffer[basePtr + 4] = maxStress;

        if (totalMotion < CONFIG.SLEEP_THRESHOLD) {
            sleepState[bufferIdx] = 0;
        }
    }
}

function drawLayer() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pad = 150;
    const viewL = -view.x / view.scale - pad;
    const viewT = -view.y / view.scale - pad;
    const viewR = (canvas.width - view.x) / view.scale + pad;
    const viewB = (canvas.height - view.y) / view.scale + pad;

    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    if (isConnecting) {
        ctx.beginPath();
        const startNode = nodeCache.get(connectStart.id);
        const rawStartPos = (connectStart.port && connectStart.port !== 'auto')
            ? getPortPos(startNode, connectStart.port)
            : (startNode
                ? getRectEdgePointTowards(startNode, { x: connectStart.currentX, y: connectStart.currentY })
                : { x: connectStart.x || 0, y: connectStart.y || 0 });
        const startPos = startNode
            ? offsetAnchorOutward(startNode, rawStartPos, { x: connectStart.currentX, y: connectStart.currentY })
            : rawStartPos;
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(connectStart.currentX, connectStart.currentY);
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const len = connections.length;
    const renderRopeDetail = len <= 140;

    // --- PASS 1: SHADOWS ---
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = CONFIG.SHADOW_THICKNESS;

    for (let i = 0; i < len; i++) {
        const conn = connections[i];
        if (focusMode && isBlurred(conn)) continue;

        const bIdx = connToIndex.get(conn.id);
        const base = bIdx * BYTES_PER_CONN;

        // Culling
        const p0x = physicsBuffer[base];
        const lastPtr = base + (CONFIG.POINTS_COUNT - 1) * STRIDE;
        const pNx = physicsBuffer[lastPtr];

        const minX = Math.min(p0x, pNx);
        const maxX = Math.max(p0x, pNx);
        if (maxX < viewL || minX > viewR) continue;
        const p0y = physicsBuffer[base + 1];
        const pNy = physicsBuffer[lastPtr + 1];
        const minY = Math.min(p0y, pNy);
        const maxY = Math.max(p0y, pNy);
        if (maxY < viewT || minY > viewB) continue;

        const off = 2;
        ctx.moveTo(p0x + off, p0y + off);
        for (let pt = 1; pt < CONFIG.POINTS_COUNT - 1; pt++) {
            const ptr = base + pt * STRIDE;
            const nextPtr = base + (pt + 1) * STRIDE;
            const x = physicsBuffer[ptr] + off;
            const y = physicsBuffer[ptr + 1] + off;
            const nx = physicsBuffer[nextPtr] + off;
            const ny = physicsBuffer[nextPtr + 1] + off;
            const xc = (x + nx) / 2;
            const yc = (y + ny) / 2;
            ctx.quadraticCurveTo(x, y, xc, yc);
        }
        ctx.lineTo(pNx + off, pNy + off);
    }
    ctx.stroke();

    // --- PASS 2: WIRES ---
    for (let i = 0; i < len; i++) {
        const conn = connections[i];

        let alpha = 1;
        if (focusMode && isBlurred(conn)) alpha = 0.1;
        ctx.globalAlpha = alpha;
        if (alpha < 0.05) continue;

        const bIdx = connToIndex.get(conn.id);
        const base = bIdx * BYTES_PER_CONN;
        const p0x = physicsBuffer[base];
        const lastPtr = base + (CONFIG.POINTS_COUNT - 1) * STRIDE;
        const pNx = physicsBuffer[lastPtr];

        if (Math.max(p0x, pNx) < viewL || Math.min(p0x, pNx) > viewR) continue;

        const stress = physicsBuffer[base + 4];
        const color = getConnectionColorConfig(conn).hex;
        ctx.strokeStyle = color;
        const ropeWidth = CONFIG.BASE_THICKNESS + Math.min(1.1, stress * 0.04);
        ctx.lineWidth = ropeWidth;
        ctx.shadowColor = hexToRgba(color, 0.45);
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.beginPath();
        ctx.moveTo(p0x, physicsBuffer[base + 1]);

        for (let pt = 1; pt < CONFIG.POINTS_COUNT - 1; pt++) {
            const ptr = base + pt * STRIDE;
            const nextPtr = base + (pt + 1) * STRIDE;
            const x = physicsBuffer[ptr];
            const y = physicsBuffer[ptr + 1];
            const nx = physicsBuffer[nextPtr];
            const ny = physicsBuffer[nextPtr + 1];
            const xc = (x + nx) / 2;
            const yc = (y + ny) / 2;
            ctx.quadraticCurveTo(x, y, xc, yc);
        }

        ctx.lineTo(pNx, physicsBuffer[lastPtr + 1]);
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (renderRopeDetail && alpha > 0.14) {
            // Cosmetic rope detail masks lower simulation point density.
            ctx.lineWidth = Math.max(1, ropeWidth * 0.4);
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.stroke();

            ctx.lineWidth = Math.max(0.8, ropeWidth * 0.22);
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.stroke();
            ctx.setLineDash([]);
        }

        updateLabelPos(conn, base, alpha);
        if (conn.arrowLeft || conn.arrowRight) drawArrows(ctx, conn, base, color);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

function isBlurred(conn) {
    const n1 = document.getElementById(conn.from);
    const n2 = document.getElementById(conn.to);
    return (!n1 || !n2 || n1.classList.contains('blurred') || n2.classList.contains('blurred'));
}

function updateLabelPos(conn, basePtr, alpha) {
    const mid = Math.floor(CONFIG.POINTS_COUNT / 2);
    const ptr = basePtr + mid * STRIDE;
    const x = physicsBuffer[ptr];
    const y = physicsBuffer[ptr + 1];

    let el = document.getElementById('lbl_' + conn.id);
    const isEditing = el && el.querySelector('.label-input') === document.activeElement;
    const hasCustomColor = clampConnectionColorIndex(conn.colorIndex) !== 0;

    if ((conn.label || isEditing || hasCustomColor) && alpha > 0.1) {
        if (!el) el = createLabelDOM(conn);
        if (el) {
            syncConnectionLabelColor(conn, el, el.querySelector('.wax-btn'));
            syncConnectionArrowButtons(conn, el);
        }
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.display = 'flex';
        el.style.opacity = alpha;
    } else if (el) {
        el.style.display = 'none';
    }
}

function drawArrows(ctx, conn, basePtr, color) {
    if (CONFIG.POINTS_COUNT < 3) return;

    const drawHead = (idx, rev) => {
        const pIdx = basePtr + idx * STRIDE;
        const prevIdx = basePtr + (idx - 1) * STRIDE;
        const nextIdx = basePtr + (idx + 1) * STRIDE;
        const px = physicsBuffer[pIdx];
        const py = physicsBuffer[pIdx + 1];

        const mx = physicsBuffer[nextIdx] - physicsBuffer[prevIdx];
        const my = physicsBuffer[nextIdx + 1] - physicsBuffer[prevIdx + 1];
        let angle = Math.atan2(my, mx);
        if (rev) angle += Math.PI;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-8, -5);
        ctx.lineTo(8, 0);
        ctx.lineTo(-8, 5);
        ctx.fillStyle = color || '#f1c40f';
        ctx.fill();
        ctx.restore();
    };

    const leftIdx = getArrowSampleIndex('left');
    const rightIdx = getArrowSampleIndex('right');

    if (conn.arrowLeft) drawHead(leftIdx, conn.arrowLeft === 1);
    if (conn.arrowRight) drawHead(rightIdx, conn.arrowRight === 1);
}

function getArrowSampleIndex(side) {
    const isLeft = side === 'left';
    const t = isLeft ? 0.25 : 0.75;
    return Math.max(1, Math.min(CONFIG.POINTS_COUNT - 2, Math.floor((CONFIG.POINTS_COUNT - 1) * t)));
}

function angleToArrowGlyph(angle) {
    if (!Number.isFinite(angle)) return '→';
    const dirs = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const full = Math.PI * 2;
    let a = angle % full;
    if (a < 0) a += full;
    const idx = Math.round(a / (Math.PI / 4)) % 8;
    return dirs[idx];
}

function getConnectionFlowAngle(conn, side) {
    const bIdx = connToIndex.get(conn.id);
    if (bIdx !== undefined) {
        const basePtr = bIdx * BYTES_PER_CONN;
        const idx = getArrowSampleIndex(side);
        const prev = Math.max(0, idx - 1);
        const next = Math.min(CONFIG.POINTS_COUNT - 1, idx + 1);
        const prevPtr = basePtr + prev * STRIDE;
        const nextPtr = basePtr + next * STRIDE;
        const dx = physicsBuffer[nextPtr] - physicsBuffer[prevPtr];
        const dy = physicsBuffer[nextPtr + 1] - physicsBuffer[prevPtr + 1];
        if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) {
            return Math.atan2(dy, dx);
        }
    }

    const fromNode = nodeCache.get(conn.from);
    const toNode = nodeCache.get(conn.to);
    if (fromNode && toNode) {
        const fromCenter = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 };
        const toCenter = { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 };
        return Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);
    }

    return 0;
}

function getArrowButtonGlyph(conn, side) {
    const value = side === 'left' ? (conn.arrowLeft || 0) : (conn.arrowRight || 0);
    if (!value) return '—';
    let angle = getConnectionFlowAngle(conn, side);
    if (value === 1) angle += Math.PI;
    return angleToArrowGlyph(angle);
}

function syncConnectionArrowButtons(conn, labelEl) {
    if (!labelEl) return;
    const leftBtn = labelEl.querySelector('.arrow-left');
    const rightBtn = labelEl.querySelector('.arrow-right');

    if (leftBtn) {
        leftBtn.classList.toggle('active', !!conn.arrowLeft);
        leftBtn.innerText = getArrowButtonGlyph(conn, 'left');
    }
    if (rightBtn) {
        rightBtn.classList.toggle('active', !!conn.arrowRight);
        rightBtn.innerText = getArrowButtonGlyph(conn, 'right');
    }
}

// --- DATA MANAGEMENT ---

function registerConnection(conn) {
    if (allocatedCount >= CONFIG.MAX_CONNECTIONS) return;

    let idx = allocatedCount++;
    connToIndex.set(conn.id, idx);
    sleepState[idx] = 1;

    const c1 = nodeCache.get(conn.from);
    const c2 = nodeCache.get(conn.to);

    if (c1 && c2) {
        const endpoints = getConnectionEndpointPositions(c1, c2, conn);
        const p1 = endpoints.from;
        const p2 = endpoints.to;
        const base = idx * BYTES_PER_CONN;

        for (let i = 0; i < CONFIG.POINTS_COUNT; i++) {
            const t = i / (CONFIG.POINTS_COUNT - 1);
            const x = p1.x + (p2.x - p1.x) * t;
            const y = p1.y + (p2.y - p1.y) * t;

            const ptr = base + i * STRIDE;
            physicsBuffer[ptr] = x;
            physicsBuffer[ptr + 1] = y;
            physicsBuffer[ptr + 2] = x;
            physicsBuffer[ptr + 3] = y;
            physicsBuffer[ptr + 4] = 0;
        }
    }

    if (!nodeGraph.has(conn.from)) nodeGraph.set(conn.from, new Set());
    if (!nodeGraph.has(conn.to)) nodeGraph.set(conn.to, new Set());
    nodeGraph.get(conn.from).add(conn.id);
    nodeGraph.get(conn.to).add(conn.id);
}

function wakeConnected(nodeId) {
    const set = nodeGraph.get(nodeId);
    if (set) {
        set.forEach(connId => {
            const idx = connToIndex.get(connId);
            if (idx !== undefined) sleepState[idx] = 1;
        });
    }
}

// --- DOM & INTERACTION ---

function getPortPos(nodeData, port) {
    if (!nodeData) return { x: 0, y: 0 };
    const { x, y, w, h } = nodeData;
    if (port === 'top') return { x: x + w / 2, y: y };
    if (port === 'bottom') return { x: x + w / 2, y: y + h };
    if (port === 'left') return { x: x, y: y + h / 2 };
    if (port === 'right') return { x: x + w, y: y + h / 2 };
    return { x: x + w / 2, y: y + h / 2 };
}

function getRectEdgePointTowards(nodeData, targetPoint) {
    if (!nodeData) {
        return {
            x: targetPoint && Number.isFinite(targetPoint.x) ? targetPoint.x : 0,
            y: targetPoint && Number.isFinite(targetPoint.y) ? targetPoint.y : 0
        };
    }
    const { x, y, w, h } = nodeData;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hw = w / 2;
    const hh = h / 2;

    const dx = (targetPoint.x - cx);
    const dy = (targetPoint.y - cy);

    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
        return { x: cx + hw, y: cy };
    }

    if (Math.abs(dx) < 0.0001) {
        return { x: cx, y: cy + (dy > 0 ? hh : -hh) };
    }

    if (Math.abs(dy) < 0.0001) {
        return { x: cx + (dx > 0 ? hw : -hw), y: cy };
    }

    const tx = hw / Math.abs(dx);
    const ty = hh / Math.abs(dy);
    const t = Math.min(tx, ty);

    return {
        x: cx + dx * t,
        y: cy + dy * t
    };
}

function isFinitePoint(point) {
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function offsetAnchorOutward(nodeData, point, fallbackDirectionPoint = null, distance = CONFIG.ANCHOR_OUTSET) {
    if (!nodeData || !isFinitePoint(point) || !Number.isFinite(distance) || distance <= 0) return point;

    const cx = nodeData.x + nodeData.w / 2;
    const cy = nodeData.y + nodeData.h / 2;
    let dx = point.x - cx;
    let dy = point.y - cy;

    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001 && isFinitePoint(fallbackDirectionPoint)) {
        dx = fallbackDirectionPoint.x - cx;
        dy = fallbackDirectionPoint.y - cy;
    }

    const mag = Math.hypot(dx, dy);
    if (mag < 0.0001) return point;

    return {
        x: point.x + (dx / mag) * distance,
        y: point.y + (dy / mag) * distance
    };
}

function getConnectionEndpointPositions(nodeFrom, nodeTo, conn = null, hintTargets = null) {
    if (!nodeFrom || !nodeTo) {
        return { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } };
    }

    const fromPort = conn && typeof conn.fromPort === 'string' ? conn.fromPort : 'auto';
    const toPort = conn && typeof conn.toPort === 'string' ? conn.toPort : 'auto';

    const fromCenter = { x: nodeFrom.x + nodeFrom.w / 2, y: nodeFrom.y + nodeFrom.h / 2 };
    const toCenter = { x: nodeTo.x + nodeTo.w / 2, y: nodeTo.y + nodeTo.h / 2 };
    const hintFromTarget = hintTargets && isFinitePoint(hintTargets.fromTarget) ? hintTargets.fromTarget : null;
    const hintToTarget = hintTargets && isFinitePoint(hintTargets.toTarget) ? hintTargets.toTarget : null;
    const fromTarget = hintFromTarget || toCenter;
    const toTarget = hintToTarget || fromCenter;

    const fromRaw = fromPort === 'auto'
        ? getRectEdgePointTowards(nodeFrom, fromTarget)
        : getPortPos(nodeFrom, fromPort);
    const toRaw = toPort === 'auto'
        ? getRectEdgePointTowards(nodeTo, toTarget)
        : getPortPos(nodeTo, toPort);

    return {
        from: offsetAnchorOutward(nodeFrom, fromRaw, fromTarget),
        to: offsetAnchorOutward(nodeTo, toRaw, toTarget)
    };
}

function updateNodeCache(id) {
    const el = document.getElementById(id);
    if (el) {
        const edgeTarget = getEdgeTargetElement(el) || el;
        const outerX = el.offsetLeft;
        const outerY = el.offsetTop;
        const outerW = el.offsetWidth;
        const outerH = el.offsetHeight;

        let relLeft = 0;
        let relTop = 0;
        let anchorW = outerW;
        let anchorH = outerH;
        let anchorX = outerX;
        let anchorY = outerY;

        if (edgeTarget !== el) {
            relLeft = edgeTarget.offsetLeft;
            relTop = edgeTarget.offsetTop;
            anchorW = edgeTarget.offsetWidth;
            anchorH = edgeTarget.offsetHeight;
            anchorX = outerX + relLeft;
            anchorY = outerY + relTop;
        }

        const data = {
            x: anchorX,
            y: anchorY,
            w: anchorW,
            h: anchorH,
            relX: relLeft,
            relY: relTop,
            layoutW: outerW,
            layoutH: outerH
        };
        nodeCache.set(id, data);

        // Keep visual port markers aligned to the same edge-target used by connection logic.
        el.style.setProperty('--port-center-x', `${relLeft + anchorW / 2}px`);
        el.style.setProperty('--port-middle-y', `${relTop + anchorH / 2}px`);
        el.style.setProperty('--port-top-y', `${relTop - 6}px`);
        el.style.setProperty('--port-bottom-y', `${relTop + anchorH - 6}px`);
        el.style.setProperty('--port-left-x', `${relLeft - 6}px`);
        el.style.setProperty('--port-right-x', `${relLeft + anchorW - 6}px`);

        wakeConnected(id);
    } else {
        nodeCache.delete(id);
    }
}

function startDragNode(e, el) {
    if (el.classList.contains('editing') || (e.button !== undefined && e.button !== 0)) return;
    draggedNode = el;
    draggedNodeFollowers = isGroupNodeEl(el) ? collectGroupedFollowerNodes(el) : [];

    const worldPos = screenToWorld(e.clientX, e.clientY);
    dragStart.x = worldPos.x;
    dragStart.y = worldPos.y;
    dragStart.nodeX = el.offsetLeft;
    dragStart.nodeY = el.offsetTop;

    updateNodeCache(el.id);
    el.style.willChange = 'transform';
    el.style.pointerEvents = 'none';
}

function updateDraggedNodeFromClient(clientX, clientY) {
    if (!draggedNode) return;
    const worldPos = screenToWorld(clientX, clientY);
    const dx = worldPos.x - dragStart.x;
    const dy = worldPos.y - dragStart.y;
    draggedNode.style.transform = `translate(${dx}px, ${dy}px)`;

    if (draggedNodeFollowers.length) {
        for (let i = 0; i < draggedNodeFollowers.length; i += 1) {
            const follower = draggedNodeFollowers[i];
            if (!follower || !follower.el) continue;
            follower.el.style.transform = `translate(${dx}px, ${dy}px)`;
            const followerCache = nodeCache.get(follower.id);
            if (followerCache) {
                followerCache.x = follower.startX + dx + (followerCache.relX || 0);
                followerCache.y = follower.startY + dy + (followerCache.relY || 0);
            }
            wakeConnected(follower.id);
        }
    }

    const newX = dragStart.nodeX + dx;
    const newY = dragStart.nodeY + dy;
    const cache = nodeCache.get(draggedNode.id);
    if (cache) {
        cache.x = newX + (cache.relX || 0);
        cache.y = newY + (cache.relY || 0);
    }
    wakeConnected(draggedNode.id);
}

function finalizeDraggedNode(clientX, clientY, options = {}) {
    if (!draggedNode) return;
    const opts = options && typeof options === 'object' ? options : {};
    const allowConnection = opts.allowConnection !== false;
    const explicitDropTarget = opts.dropTarget || null;
    const worldPos = screenToWorld(clientX, clientY);
    const dx = worldPos.x - dragStart.x;
    const dy = worldPos.y - dragStart.y;

    const finalX = dragStart.nodeX + dx;
    const finalY = dragStart.nodeY + dy;

    const sourceNode = draggedNode;
    const sourceNodeId = sourceNode.id;
    const sourceNodeType = getNodeTypeFromEl(sourceNode);
    sourceNode.style.pointerEvents = '';

    let dropNode = null;
    if (explicitDropTarget && typeof explicitDropTarget.closest === 'function') {
        dropNode = explicitDropTarget.closest('.node');
    }
    if (!dropNode) {
        const dropEl = document.elementFromPoint(clientX, clientY);
        if (dropEl && typeof dropEl.closest === 'function') {
            dropNode = dropEl.closest('.node');
        }
    }

    const draggedDistance = Math.hypot(dx, dy);
    const dropNodeType = dropNode ? getNodeTypeFromEl(dropNode) : '';
    const canCreateConnection = allowConnection &&
        draggedDistance > 8 &&
        dropNode &&
        dropNode.id !== sourceNodeId &&
        canNodeTypesConnect(sourceNodeType, dropNodeType);

    if (canCreateConnection) {
        sourceNode.style.left = dragStart.nodeX + 'px';
        sourceNode.style.top = dragStart.nodeY + 'px';
        sourceNode.style.transform = 'none';
        sourceNode.style.willChange = 'auto';
        updateNodeCache(sourceNodeId);
        if (draggedNodeFollowers.length) {
            for (let i = 0; i < draggedNodeFollowers.length; i += 1) {
                const follower = draggedNodeFollowers[i];
                if (!follower || !follower.el) continue;
                follower.el.style.left = follower.startX + 'px';
                follower.el.style.top = follower.startY + 'px';
                follower.el.style.transform = 'none';
                updateNodeCache(follower.id);
            }
        }
        createConnectionBetweenNodes(sourceNodeId, dropNode.id);
    } else {
        sourceNode.style.left = finalX + 'px';
        sourceNode.style.top = finalY + 'px';
        sourceNode.style.transform = 'none';
        sourceNode.style.willChange = 'auto';
        updateNodeCache(sourceNodeId);
        if (draggedNodeFollowers.length) {
            for (let i = 0; i < draggedNodeFollowers.length; i += 1) {
                const follower = draggedNodeFollowers[i];
                if (!follower || !follower.el) continue;
                follower.el.style.left = (follower.startX + dx) + 'px';
                follower.el.style.top = (follower.startY + dy) + 'px';
                follower.el.style.transform = 'none';
                updateNodeCache(follower.id);
            }
        }
        if (isGroupNodeType(sourceNodeType)) syncGroupNodeMeta(sourceNode);
        saveBoard();
    }

    draggedNode = null;
    draggedNodeFollowers = [];
}

function handleTouchStart(event) {
    if (!mobileMode) return;
    if (!event.touches || !event.touches.length) return;

    if (event.touches.length >= 2) {
        if (draggedNode || isTouchUIArea(event.target)) return;
        const touchA = event.touches[0];
        const touchB = event.touches[1];
        touchState.pinchIds = [touchA.identifier, touchB.identifier];
        touchState.pinchDist = getTouchDistance(touchA, touchB);
        touchState.panTouchId = null;
        touchState.dragTouchId = null;
        isPanning = false;
        document.body.style.cursor = panMode ? 'grab' : 'default';
        event.preventDefault();
        return;
    }

    const touch = event.touches[0];
    const target = event.target;
    const node = target && typeof target.closest === 'function' ? target.closest('.node') : null;

    if (node && !node.classList.contains('editing') && !isEditableTouchTarget(target)) {
        startDragNode({ button: 0, clientX: touch.clientX, clientY: touch.clientY }, node);
        touchState.dragTouchId = touch.identifier;
        touchState.lastClientX = touch.clientX;
        touchState.lastClientY = touch.clientY;
        event.preventDefault();
        return;
    }

    if (isTouchUIArea(target)) return;

    touchState.panTouchId = touch.identifier;
    panStart = { x: touch.clientX, y: touch.clientY };
    isPanning = true;
    document.body.style.cursor = 'grabbing';
    event.preventDefault();
}

function handleTouchMove(event) {
    if (!mobileMode) return;

    if (touchState.pinchIds && touchState.pinchIds.length === 2) {
        const touchA = findTouchByIdentifier(event.touches, touchState.pinchIds[0]);
        const touchB = findTouchByIdentifier(event.touches, touchState.pinchIds[1]);
        if (!touchA || !touchB) return;

        const distance = getTouchDistance(touchA, touchB);
        if (!distance || !touchState.pinchDist) return;

        const midpoint = getTouchMidpoint(touchA, touchB);
        const factor = distance / touchState.pinchDist;
        if (!Number.isFinite(factor) || factor === 0) return;

        const worldX = (midpoint.x - view.x) / view.scale;
        const worldY = (midpoint.y - view.y) / view.scale;
        const nextScale = Math.max(CONFIG.VIEW_SCALE_MIN, Math.min(view.scale * factor, CONFIG.VIEW_SCALE_MAX));
        view.scale = nextScale;
        view.x = midpoint.x - worldX * view.scale;
        view.y = midpoint.y - worldY * view.scale;
        touchState.pinchDist = distance;
        updateViewCSS();
        event.preventDefault();
        return;
    }

    if (touchState.dragTouchId !== null && draggedNode) {
        const touch = findTouchByIdentifier(event.touches, touchState.dragTouchId);
        if (!touch) return;
        updateDraggedNodeFromClient(touch.clientX, touch.clientY);
        touchState.lastClientX = touch.clientX;
        touchState.lastClientY = touch.clientY;
        event.preventDefault();
        return;
    }

    if (touchState.panTouchId !== null && isPanning) {
        const touch = findTouchByIdentifier(event.touches, touchState.panTouchId);
        if (!touch) return;
        view.x += touch.clientX - panStart.x;
        view.y += touch.clientY - panStart.y;
        panStart = { x: touch.clientX, y: touch.clientY };
        updateViewCSS();
        event.preventDefault();
    }
}

function handleTouchEnd(event) {
    if (!mobileMode) return;

    if (touchState.pinchIds && event.touches.length < 2) {
        touchState.pinchIds = null;
        touchState.pinchDist = 0;
    }

    if (touchState.dragTouchId !== null) {
        const stillActive = findTouchByIdentifier(event.touches, touchState.dragTouchId);
        if (!stillActive) {
            const endedTouch = findTouchByIdentifier(event.changedTouches, touchState.dragTouchId);
            const endX = endedTouch ? endedTouch.clientX : touchState.lastClientX;
            const endY = endedTouch ? endedTouch.clientY : touchState.lastClientY;
            finalizeDraggedNode(endX, endY, { allowConnection: true });
            touchState.dragTouchId = null;
            event.preventDefault();
        }
    }

    if (touchState.panTouchId !== null) {
        const stillPanning = findTouchByIdentifier(event.touches, touchState.panTouchId);
        if (!stillPanning) {
            touchState.panTouchId = null;
            isPanning = false;
            document.body.style.cursor = panMode ? 'grab' : 'default';
        }
    }
}

document.addEventListener('mousemove', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (draggedNode) {
        updateDraggedNodeFromClient(e.clientX, e.clientY);
    }

    if (isConnecting) {
        connectStart.currentX = worldPos.x;
        connectStart.currentY = worldPos.y;
    }

    if (isPanning) {
        view.x += e.clientX - panStart.x;
        view.y += e.clientY - panStart.y;
        panStart = { x: e.clientX, y: e.clientY };
        updateViewCSS();
    }
});

document.addEventListener('mouseup', (e) => {
    if (draggedNode) {
        finalizeDraggedNode(e.clientX, e.clientY, {
            allowConnection: !e.altKey,
            dropTarget: e.target
        });
    } else {
        const targetEl = e.target && typeof e.target.closest === 'function'
            ? e.target.closest('.node.type-group')
            : null;
        if (targetEl) {
            syncGroupNodeMeta(targetEl);
            saveBoard();
        }
    }
    if (isConnecting) {
        if (e.target && typeof e.target.closest === 'function') {
            const node = e.target.closest('.node');
            if (node) {
                const targetPort = e.altKey ? getPortFromEventTarget(e.target) : 'auto';
                completeConnection(node, targetPort);
            }
        }
        isConnecting = false;
    }
    if (isPanning) {
        isPanning = false;
        document.body.style.cursor = panMode ? "grab" : "default";
    }
});

function createNodeMarkup(type, content = {}) {
    const title = sanitizeText(content.title || type.toUpperCase());
    const bodyHtml = sanitizeRichText(content.body || '');
    const icon = NODE_TYPE_ICONS[type] || '❓';
    const withTitle = `<div class="node-title">${title}</div>`;

    if (type === 'person') {
        return `
            <div class="node-bust-media node-media-shell" data-image-slot="portrait">
                <div class="node-media-fallback">${icon}</div>
            </div>
            <div class="node-bust-base" data-edge-target>
                ${withTitle}
                <div class="node-body">${bodyHtml}</div>
            </div>
        `;
    }

    if (type === 'location') {
        return `
            <div class="node-postcard-photo node-media-shell" data-image-slot="photo">
                <div class="node-media-fallback">${icon}</div>
                <div class="node-title-strip">${withTitle}</div>
            </div>
            <div class="node-body">${bodyHtml}</div>
        `;
    }

    if (type === 'clue') {
        return `
            <div class="node-evidence-stage">
                <div class="node-clue-media node-media-shell node-media-contain" data-image-slot="evidence">
                    <div class="node-media-fallback">${icon}</div>
                </div>
                <div class="evidence-tag">${withTitle}</div>
            </div>
            <div class="node-meta-badges" data-node-meta-badges></div>
            <div class="node-body">${bodyHtml}</div>
        `;
    }

    if (type === 'theory') {
        return `
            <div class="node-theory-head">
                ${withTitle}
                <div class="theory-status-pill" data-theory-status>Unproven</div>
            </div>
            <div class="theory-confidence-wrap">
                <div class="theory-confidence-label">Confidence <span data-theory-confidence>50%</span></div>
                <div class="theory-confidence-track">
                    <div class="theory-confidence-fill" data-theory-fill></div>
                </div>
            </div>
            <div class="node-meta-badges" data-node-meta-badges></div>
            <div class="node-body">${bodyHtml}</div>
        `;
    }

    if (type === 'note') {
        const variant = getNoteVariantFromMeta(content && content.meta);
        if (variant === 'freeform') {
            return `
                <div class="sticky-sheet" data-edge-target>
                    ${withTitle}
                    <div class="node-body">${bodyHtml}</div>
                </div>
            `;
        }
        const variantLabel = variant === 'lead' ? 'Lead Brief' : 'Ledger Record';
        const variantClass = variant === 'lead' ? 'note-card-lead' : 'note-card-ledger';
        return `
            <div class="note-card ${variantClass}" data-edge-target>
                <div class="note-kind">${variantLabel}</div>
                ${withTitle}
                <div class="node-body">${bodyHtml}</div>
            </div>
        `;
    }

    if (type === 'group') {
        return `
            <div class="group-tag">
                ${withTitle}
            </div>
            <div class="group-hint">Drag this box to move enclosed nodes together.</div>
            <div class="group-body node-body">${bodyHtml}</div>
        `;
    }

    if (type === 'event') {
        return `
            <div class="node-timestamp-header">
                <div class="timestamp-caption">TIMESTAMP</div>
                ${withTitle}
            </div>
            <div class="node-timestamp-media node-media-shell node-media-contain" data-image-slot="timeline">
                <div class="node-media-fallback">${icon}</div>
            </div>
            <div class="node-meta-badges" data-node-meta-badges></div>
            <div class="node-body">${bodyHtml}</div>
        `;
    }

    if (type === 'requisition') {
        return `
            <div class="invoice-watermark" aria-hidden="true">[CONFIDENTIAL]</div>
            <div class="node-requisition-media node-media-shell node-media-contain" data-image-slot="asset">
                <div class="node-media-fallback">${icon}</div>
            </div>
            ${withTitle}
            <div class="node-body">${bodyHtml}</div>
        `;
    }

    return `
        <div class="node-header">
            ${withTitle}
            <div class="node-icon">${icon}</div>
        </div>
        <div class="node-body">${bodyHtml}</div>
    `;
}

function ensureTheoryNodeMeta(nodeEl) {
    if (!nodeEl || !nodeEl.classList || !nodeEl.classList.contains('type-theory')) return null;
    const baseMeta = getNodeMeta(nodeEl) || {};
    const confidence = clampPercent(baseMeta.confidence, 50);
    const clean = {
        ...baseMeta,
        sourceType: String(baseMeta.sourceType || 'theory'),
        theoryStatus: normalizeTheoryStatus(baseMeta.theoryStatus),
        confidence,
        reliability: normalizeReliability(baseMeta.reliability)
    };
    delete clean.certainty;
    setNodeMeta(nodeEl, clean);
    return clean;
}

function syncTheoryNodeDisplay(nodeEl) {
    if (!nodeEl || !nodeEl.classList || !nodeEl.classList.contains('type-theory')) return;
    const meta = ensureTheoryNodeMeta(nodeEl);
    if (!meta) return;
    const statusEl = nodeEl.querySelector('[data-theory-status]');
    const confidenceEl = nodeEl.querySelector('[data-theory-confidence]');
    const fillEl = nodeEl.querySelector('[data-theory-fill]');
    const status = normalizeTheoryStatus(meta.theoryStatus);
    const confidence = clampPercent(meta.confidence, 50);

    nodeEl.classList.remove('theory-unproven', 'theory-confirmed', 'theory-disproven');
    nodeEl.classList.add(`theory-${status}`);
    if (statusEl) statusEl.textContent = getTheoryStatusLabel(status);
    if (confidenceEl) confidenceEl.textContent = `${confidence}%`;
    if (fillEl) fillEl.style.width = `${confidence}%`;
    syncNodeNarrativeMetaDisplay(nodeEl);
}

function applyNodeImage(nodeEl, imageUrl = '') {
    if (!nodeEl) return;
    const clean = sanitizeImageUrl(imageUrl);
    const slots = nodeEl.querySelectorAll('[data-image-slot]');
    if (!slots.length) return;

    slots.forEach((slot) => {
        if (clean) {
            slot.classList.add('has-image');
            slot.style.backgroundImage = `url("${clean}")`;
        } else {
            slot.classList.remove('has-image');
            slot.style.removeProperty('background-image');
        }
    });
}

function updateNodeImageMeta(nodeEl, imageUrl = '') {
    if (!nodeEl) return;
    const existing = getNodeMeta(nodeEl) || {};
    const clean = sanitizeImageUrl(imageUrl);
    if (clean) {
        existing.imageUrl = clean;
    } else {
        delete existing.imageUrl;
    }
    setNodeMeta(nodeEl, existing);
    applyNodeImage(nodeEl, clean);
}

function createNode(type, x, y, id = null, content = {}) {
    const nodeId = id || 'node_' + Date.now();
    const nodeType = String(type || '').toLowerCase();
    const safeContent = (nodeType === 'note')
        ? normalizeNoteNodeContent(content)
        : (nodeType === 'event')
            ? normalizeEventNodeContent(content)
            : (content && typeof content === 'object' ? { ...content } : {});
    let safeMeta = sanitizeNodeMeta(safeContent.meta);
    let groupSize = null;
    if (isGroupNodeType(type)) {
        groupSize = getGroupNodeSizeFromMeta(safeMeta);
        safeMeta = {
            ...(safeMeta || {}),
            groupW: groupSize.width,
            groupH: groupSize.height
        };
    }
    const requestedImageUrl = sanitizeImageUrl(safeContent.imageUrl || (safeMeta && safeMeta.imageUrl) || '');
    if (requestedImageUrl) {
        safeMeta = { ...(safeMeta || {}), imageUrl: requestedImageUrl };
    } else if (safeMeta && Object.prototype.hasOwnProperty.call(safeMeta, 'imageUrl')) {
        delete safeMeta.imageUrl;
        if (!Object.keys(safeMeta).length) safeMeta = null;
    }

    const nodeEl = document.createElement('div');
    nodeEl.className = `node type-${type}`;
    nodeEl.id = nodeId;
    nodeEl.style.left = (x - 75) + 'px';
    nodeEl.style.top = (y - 40) + 'px';
    if (groupSize) {
        nodeEl.style.width = `${groupSize.width}px`;
        nodeEl.style.height = `${groupSize.height}px`;
    }

    nodeEl.innerHTML = `
        <div class="port top" data-port="top"></div><div class="port bottom" data-port="bottom"></div>
        <div class="port left" data-port="left"></div><div class="port right" data-port="right"></div>
        ${createNodeMarkup(type, safeContent)}
    `;

    nodeEl.querySelectorAll('.port[data-port]').forEach((portEl) => {
        portEl.onmousedown = (evt) => {
            if (panMode || evt.button !== 0 || !evt.altKey) return;
            const pinnedPort = normalizeConnectionPort(portEl.dataset.port);
            if (pinnedPort === 'auto') return;
            startConnectionDrag(evt, nodeEl, pinnedPort);
        };
    });

    nodeEl.onmousedown = (e) => {
        if (e.button === 2 && e.shiftKey) {
            showContextMenu(e, nodeEl);
            return;
        }

        if (panMode || e.button !== 0) return;
        if (isGroupNodeEl(nodeEl)) {
            startDragNode(e, nodeEl);
            return;
        }

        const sourcePort = e.altKey ? getPortFromEventTarget(e.target) : 'auto';
        if (sourcePort !== 'auto') {
            startConnectionDrag(e, nodeEl, sourcePort);
            return;
        }

        if (getNodeEdgeFromEvent(e, nodeEl)) {
            // Edge drags default to auto edge intersection.
            startConnectionDrag(e, nodeEl, 'auto');
            return;
        }

        startDragNode(e, nodeEl);
    };
    nodeEl.oncontextmenu = (e) => showContextMenu(e, nodeEl);

    const targetLayer = (isGroupNodeType(type) && groupContainer) ? groupContainer : container;
    targetLayer.appendChild(nodeEl);
    setNodeMeta(nodeEl, safeMeta);
    if (type === 'theory') {
        ensureTheoryNodeMeta(nodeEl);
        syncTheoryNodeDisplay(nodeEl);
    } else if (NARRATIVE_META_NODE_TYPES.has(type)) {
        ensureNarrativeNodeMeta(nodeEl);
        syncNodeNarrativeMetaDisplay(nodeEl);
    }
    applyNodeImage(nodeEl, requestedImageUrl);
    updateNodeCache(nodeId);
    const finalMeta = getNodeMeta(nodeEl);

    // Ensure node is tracked in global state (both for new and loaded nodes)
    nodes.push({
        id: nodeId,
        type,
        x: x - 75,
        y: y - 40,
        title: safeContent.title || type.toUpperCase(),
        meta: finalMeta
    });

    return nodeEl;
}

function startConnectionDrag(e, node, port) {
    e.stopPropagation();
    e.preventDefault();
    isConnecting = true;
    const wp = screenToWorld(e.clientX, e.clientY);
    connectStart = {
        id: node.id,
        port: normalizeConnectionPort(port),
        x: wp.x,
        y: wp.y,
        currentX: wp.x,
        currentY: wp.y
    };
}

function syncPortPreviewState(isAltHeld) {
    document.body.classList.toggle('show-ports', !!isAltHeld);
}

function completeConnection(targetNode, targetPort) {
    if (!targetNode || !connectStart || !connectStart.id) return;
    createConnectionBetweenNodes(connectStart.id, targetNode.id, connectStart.port, targetPort);
}

function syncConnectionLabelColor(conn, labelEl, waxBtn = null) {
    const color = getConnectionColorConfig(conn);
    if (labelEl) {
        labelEl.style.setProperty('--string-color', color.hex);
        labelEl.style.setProperty('--string-glow', hexToRgba(color.hex, 0.45));
    }
    if (waxBtn) {
        waxBtn.style.background = color.hex;
        waxBtn.title = `Wax Seal: ${color.name}`;
    }
}

function connectionTouchesTheory(conn) {
    if (!conn) return false;
    return isTheoryNodeId(conn.from) || isTheoryNodeId(conn.to);
}

function createLabelDOM(conn) {
    conn.colorIndex = clampConnectionColorIndex(conn.colorIndex);
    if (connectionTouchesTheory(conn)) {
        conn.theoryRelation = normalizeTheoryRelation(conn.theoryRelation);
        if (!String(conn.label || '').trim()) {
            conn.label = getTheoryRelationLabel(conn.theoryRelation);
        }
    }

    const el = document.createElement('div');
    el.id = 'lbl_' + conn.id;
    el.className = 'string-label';
    el.style.position = 'absolute';
    el.style.left = '0'; el.style.top = '0';

    const btnL = document.createElement('div');
    btnL.className = `arrow-btn arrow-left ${conn.arrowLeft ? 'active' : ''}`;
    btnL.onclick = (e) => {
        e.stopPropagation();
        conn.arrowLeft = ((conn.arrowLeft || 0) + 1) % 3;
        syncConnectionArrowButtons(conn, el);
        saveBoard();
    };

    const waxBtn = document.createElement('button');
    waxBtn.type = 'button';
    waxBtn.className = 'wax-btn';
    waxBtn.innerText = '◉';
    waxBtn.onmousedown = (e) => e.stopPropagation();
    waxBtn.onclick = (e) => {
        e.stopPropagation();
        conn.colorIndex = (clampConnectionColorIndex(conn.colorIndex) + 1) % CONNECTION_COLOR_PALETTE.length;
        syncConnectionLabelColor(conn, el, waxBtn);
        saveBoard();
    };

    const input = document.createElement('div');
    input.className = 'label-input';
    input.contentEditable = true;
    input.innerText = conn.label || "";
    input.oninput = (e) => {
        const previousLabel = (conn.label || '').trim();
        const nextLabel = (e.target.innerText || '').trim();
        conn.label = e.target.innerText;
        if (connectionTouchesTheory(conn)) {
            const lowered = nextLabel.toLowerCase();
            if (lowered.includes('contradict')) conn.theoryRelation = 'contradicts';
            else if (lowered.includes('relat')) conn.theoryRelation = 'related';
            else if (lowered.includes('support')) conn.theoryRelation = 'supports';
        }

        if (!conn.relationshipLogged && !previousLabel && nextLabel) {
            conn.relationshipLogged = true;
            const fromSummary = getNodeSummary(conn.from);
            const toSummary = getNodeSummary(conn.to);
            const fromTitle = fromSummary ? fromSummary.title : 'Unknown';
            const toTitle = toSummary ? toSummary.title : 'Unknown';
            logBoardTimeline({
                title: 'Case Relationship Named',
                kind: 'relationship-named',
                tags: ['relationship', 'connection'],
                highlights: `${fromTitle} ↔ ${toTitle}: ${nextLabel}`
            }, { dedupeKey: `board:relationship:${conn.id}` });
        }

        saveBoard();
    };
    input.onmousedown = (e) => e.stopPropagation();

    const btnR = document.createElement('div');
    btnR.className = `arrow-btn arrow-right ${conn.arrowRight ? 'active' : ''}`;
    btnR.onclick = (e) => {
        e.stopPropagation();
        conn.arrowRight = ((conn.arrowRight || 0) + 1) % 3;
        syncConnectionArrowButtons(conn, el);
        saveBoard();
    };

    syncConnectionLabelColor(conn, el, waxBtn);
    const controls = document.createElement('div');
    controls.className = 'string-controls';
    controls.append(btnL, waxBtn);

    if (connectionTouchesTheory(conn)) {
        const relationBtn = document.createElement('button');
        relationBtn.type = 'button';
        relationBtn.className = 'relation-btn';
        const updateRelationBtn = () => {
            relationBtn.textContent = getTheoryRelationLabel(conn.theoryRelation);
            relationBtn.title = `Theory link: ${getTheoryRelationLabel(conn.theoryRelation)}`;
        };
        relationBtn.onmousedown = (e) => e.stopPropagation();
        relationBtn.onclick = (e) => {
            e.stopPropagation();
            const current = normalizeTheoryRelation(conn.theoryRelation);
            const idx = THEORY_RELATIONS.indexOf(current);
            const next = THEORY_RELATIONS[(idx + 1) % THEORY_RELATIONS.length];
            conn.theoryRelation = next;
            const nextLabel = getTheoryRelationLabel(next);
            const normalizedCurrentLabel = getTheoryRelationLabel(current);
            if (!String(conn.label || '').trim() || String(conn.label || '').trim() === normalizedCurrentLabel) {
                conn.label = nextLabel;
                input.innerText = nextLabel;
            }
            updateRelationBtn();
            saveBoard();
        };
        updateRelationBtn();
        controls.append(relationBtn);
    }

    controls.append(btnR);
    el.append(controls, input);
    syncConnectionArrowButtons(conn, el);
    labelContainer.appendChild(el);
    return el;
}

function screenToWorld(x, y) {
    return { x: (x - view.x) / view.scale, y: (y - view.y) / view.scale };
}

function zoomViewAtClientPoint(clientX, clientY, factor) {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    const wx = (clientX - view.x) / view.scale;
    const wy = (clientY - view.y) / view.scale;
    const nextScale = Math.max(CONFIG.VIEW_SCALE_MIN, Math.min(view.scale * factor, CONFIG.VIEW_SCALE_MAX));
    if (!Number.isFinite(nextScale)) return false;
    view.scale = nextScale;
    view.x = clientX - wx * view.scale;
    view.y = clientY - wy * view.scale;
    updateViewCSS();
    return true;
}

function handleBoardShortcutKeydown(event) {
    if (!event || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingContextTarget(event.target)) return;
    if (event.repeat) return;

    const key = String(event.key || '');
    const lower = key.toLowerCase();
    const isZoomIn = key === '+' || key === '=' || event.code === 'NumpadAdd';
    const isZoomOut = key === '-' || key === '_' || event.code === 'NumpadSubtract';

    if (isZoomIn || isZoomOut) {
        event.preventDefault();
        const zoomFactor = isZoomIn ? KEYBOARD_ZOOM_STEP : (1 / KEYBOARD_ZOOM_STEP);
        zoomViewAtClientPoint(window.innerWidth * 0.5, window.innerHeight * 0.5, zoomFactor);
        showShortcutAlert(`${isZoomIn ? 'Zoom In' : 'Zoom Out'} (${isZoomIn ? SHORTCUT_KEYS.zoomIn : SHORTCUT_KEYS.zoomOut}) - ${Math.round(view.scale * 100)}%`);
        return;
    }

    if (lower === 'p') {
        event.preventDefault();
        togglePanMode();
        showShortcutAlert(`Pan Mode ${panMode ? 'ON' : 'OFF'} (${SHORTCUT_KEYS.pan})`);
    }
}

function updateViewCSS() {
    const t = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    if (groupContainer) groupContainer.style.transform = t;
    container.style.transform = t;
    labelContainer.style.transform = t;
}

function toggleToolbar() {
    const wrapper = document.getElementById('toolbar-wrapper');
    const toggle = document.getElementById('toolbar-toggle');
    if (!wrapper || !toggle) return;
    const willHide = !wrapper.classList.contains('toolbar-hidden');
    wrapper.classList.toggle('toolbar-hidden', willHide);
    toggle.innerText = willHide ? 'Show Toolbar' : 'Hide Toolbar';
}

function togglePanMode() {
    panMode = !panMode;
    const btn = document.getElementById('btn-pan');
    if (btn) {
        btn.innerText = panMode ? "🖐️ Pan: ON" : "🖐️ Pan: OFF";
        btn.style.background = panMode ? "var(--gold)" : "";
        btn.style.color = panMode ? "#000" : "";
        btn.title = `Shortcut: ${SHORTCUT_KEYS.pan}`;
        document.body.style.cursor = panMode ? "grab" : "default";
    }
}

document.addEventListener('wheel', (e) => {
    if (e.target.closest('.toolbar-scroll-wrapper') || e.target.closest('.popup-menu')) return;
    e.preventDefault();
    const d = e.deltaY > 0 ? -1 : 1;
    const f = d * 0.1;
    const mx = e.clientX, my = e.clientY;
    const wx = (mx - view.x) / view.scale;
    const wy = (my - view.y) / view.scale;

    view.scale = Math.max(CONFIG.VIEW_SCALE_MIN, Math.min(view.scale + f, CONFIG.VIEW_SCALE_MAX));
    view.x = mx - wx * view.scale;
    view.y = my - wy * view.scale;
    updateViewCSS();
}, { passive: false });

document.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (panMode && e.button === 0 && !e.target.closest('.node'))) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        document.body.style.cursor = "grabbing";
        e.preventDefault();
    }
});

document.addEventListener('keydown', (e) => {
    syncPortPreviewState(e.altKey);
    handleBoardShortcutKeydown(e);
});

document.addEventListener('keyup', (e) => {
    syncPortPreviewState(e.altKey);
});

window.addEventListener('blur', () => {
    syncPortPreviewState(false);
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncPortPreviewState(false);
});

function saveBoard() {
    const caseNameEl = document.getElementById('caseName');
    const caseName = normalizeCaseName(caseNameEl ? caseNameEl.innerText : 'UNNAMED CASE');
    if (caseNameEl && caseNameEl.innerText !== caseName) caseNameEl.innerText = caseName;

    if (!isHydratingBoard && lastSavedCaseName && caseName !== lastSavedCaseName) {
        logBoardTimeline({
            title: isCampaignBoardView() ? 'Campaign Board Renamed' : 'Case File Renamed',
            kind: isCampaignBoardView() ? 'campaign-board-rename' : 'case-rename',
            tags: [isCampaignBoardView() ? 'campaign-board-name' : 'case-name'],
            highlights: `"${lastSavedCaseName}" renamed to "${caseName}".`
        }, { dedupeKey: `board:case-rename:${lastSavedCaseName}->${caseName}` });
    }
    lastSavedCaseName = caseName;

    const nodeData = Array.from(document.querySelectorAll('.node')).map(el => {
        const nodeType = getNodeTypeFromEl(el);
        let nodeMeta = getNodeMeta(el);
        if (isGroupNodeType(nodeType)) {
            syncGroupNodeMeta(el);
            nodeMeta = getNodeMeta(el);
        }
        return {
            id: el.id,
            type: nodeType,
            x: parseInt(el.style.left, 10),
            y: parseInt(el.style.top, 10),
            title: el.querySelector('.node-title').innerText,
            body: el.querySelector('.node-body').innerHTML,
            meta: nodeMeta
        };
    });

    const data = {
        name: caseName,
        nodes: nodeData,
        connections: connections.map(c => ({
            id: c.id, from: c.from, to: c.to, fromPort: c.fromPort, toPort: c.toPort,
            portPinned: !!c.portPinned,
            label: c.label, arrowLeft: c.arrowLeft, arrowRight: c.arrowRight,
            relationshipLogged: !!c.relationshipLogged,
            colorIndex: clampConnectionColorIndex(c.colorIndex),
            theoryRelation: c.theoryRelation ? normalizeTheoryRelation(c.theoryRelation) : ''
        }))
    };
    if (!writeStoreBoardPayload(data)) {
        localStorage.setItem(LEGACY_BOARD_KEY, JSON.stringify(sanitizeBoardPayload(data)));
    }
}

function loadBoard(options = {}, payloadOverride = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const data = payloadOverride ? sanitizeBoardPayload(payloadOverride) : getPreferredBoardPayload();
    if (!data) return;
    const caseName = normalizeCaseName(data.name || (isCampaignBoardView() ? 'CAMPAIGN META BOARD' : 'UNNAMED CASE'));
    document.getElementById('caseName').innerText = caseName;
    lastSavedCaseName = caseName;

    if (groupContainer) groupContainer.innerHTML = '';
    container.innerHTML = '';
    labelContainer.innerHTML = '';
    nodeCache.clear();
    nodeGraph.clear();
    connToIndex.clear();
    allocatedCount = 0;
    nodes = [];
    connections = [];
    if (!opts.preserveOptimizeSnapshot) {
        lastOptimizeSnapshot = null;
        updateUndoOptimizeMenuState();
    }

    isHydratingBoard = true;
    try {
        (data.nodes || []).forEach(n => {
            createNode(n.type, n.x + 75, n.y + 40, n.id, { title: n.title, body: n.body, meta: n.meta });
        });
    } finally {
        isHydratingBoard = false;
    }

    (data.connections || []).forEach(c => {
        if (!c.id) c.id = 'conn_' + Date.now() + Math.random();
        const isPinned = !!c.portPinned;
        const hydratedFromPort = isPinned ? normalizeConnectionPort(c.fromPort) : 'auto';
        const hydratedToPort = isPinned ? normalizeConnectionPort(c.toPort) : 'auto';
        const touchesTheory = isTheoryNodeId(c.from) || isTheoryNodeId(c.to);
        const inferredRelation = touchesTheory
            ? normalizeTheoryRelation(c.theoryRelation || (String(c.label || '').toLowerCase().includes('contradict') ? 'contradicts' : 'supports'))
            : '';
        const hydrated = {
            ...c,
            fromPort: hydratedFromPort,
            toPort: hydratedToPort,
            portPinned: isPinned && (hydratedFromPort !== 'auto' || hydratedToPort !== 'auto'),
            relationshipLogged: !!c.relationshipLogged,
            colorIndex: clampConnectionColorIndex(c.colorIndex),
            theoryRelation: inferredRelation
        };
        if (touchesTheory && !String(hydrated.label || '').trim()) {
            hydrated.label = getTheoryRelationLabel(inferredRelation);
        }
        connections.push(hydrated);
        registerConnection(hydrated);
    });
}

function clearBoard() {
    if (confirm("Clear board?")) {
        lastOptimizeSnapshot = null;
        updateUndoOptimizeMenuState();
        if (isExternalBoardMode()) {
            writeStoreBoardPayload({ name: "My Story", nodes: [], connections: [] });
            loadBoard();
            updateViewCSS();
            return;
        }
        if (window.RTF_STORE && isCampaignBoardView() && typeof window.RTF_STORE.clearCampaignMetaBoard === 'function') {
            window.RTF_STORE.clearCampaignMetaBoard();
        } else if (window.RTF_STORE && typeof window.RTF_STORE.clearBoard === 'function') {
            window.RTF_STORE.clearBoard();
        } else if (!writeStoreBoardPayload({ name: isCampaignBoardView() ? "CAMPAIGN META BOARD" : "UNNAMED CASE", nodes: [], connections: [] })) {
            localStorage.removeItem(LEGACY_BOARD_KEY);
        }
        localStorage.removeItem(LEGACY_BOARD_KEY);
        location.reload();
    }
}

function showContextMenu(e, node) {
    e.preventDefault();
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.dataset.target = node.id;

    const type = getNodeTypeFromEl(node);
    const meta = getNodeMeta(node) || {};
    const isTheory = type === 'theory';
    const isLedgerNote = type === 'note' && String(meta.sourceType || '').trim().toLowerCase() === 'ledger';
    const supportsNarrativeMeta = NARRATIVE_META_NODE_TYPES.has(type);
    const supportsCertainty = NARRATIVE_CERTAINTY_NODE_TYPES.has(type);
    if (supportsNarrativeMeta) {
        ensureNarrativeNodeMeta(node);
        syncNodeNarrativeMetaDisplay(node);
    }
    const setImageItem = document.getElementById('menu-set-image');
    const setCertaintyItem = document.getElementById('menu-set-node-certainty');
    const addLedgerItem = document.getElementById('menu-add-ledger');
    const theoryConfirmedItem = document.getElementById('menu-mark-theory-confirmed');
    const theoryDisprovenItem = document.getElementById('menu-mark-theory-disproven');
    const createLeadItem = document.getElementById('menu-create-lead');
    if (setImageItem) {
        setImageItem.style.display = IMAGE_EDITABLE_NODE_TYPES.has(type) ? 'block' : 'none';
    }
    if (setCertaintyItem) setCertaintyItem.style.display = supportsCertainty ? 'block' : 'none';
    if (addLedgerItem) addLedgerItem.style.display = (type !== 'group' && !isLedgerNote) ? 'block' : 'none';
    if (theoryConfirmedItem) theoryConfirmedItem.style.display = isTheory ? 'block' : 'none';
    if (theoryDisprovenItem) theoryDisprovenItem.style.display = isTheory ? 'block' : 'none';
    if (createLeadItem) createLeadItem.style.display = isCampaignBoardView() ? 'none' : 'block';
    const draftItem = document.getElementById('menu-draft-encounter');
    if (draftItem) {
        draftItem.style.display = e.shiftKey ? 'block' : 'none';
    }
    updateUndoOptimizeMenuState();
}

function updateUndoOptimizeMenuState() {
    const undoItem = document.getElementById('menu-undo-optimize');
    if (!undoItem) return;
    const enabled = !!lastOptimizeSnapshot;
    undoItem.classList.toggle('disabled', !enabled);
    undoItem.title = enabled
        ? 'Restore layout from before the most recent optimize.'
        : 'No optimize snapshot available yet.';
}
window.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) contextMenu.style.display = 'none';
    if (!e.target.closest('.popup-menu') && !e.target.closest('.tool-item')) closePopups();
});

// Explicitly expose to window to avoid scope issues
window.togglePopup = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'note-popup') renderNotePopup();

    // Close others
    document.querySelectorAll('.popup-menu').forEach(p => {
        if (p.id !== id) p.classList.remove('active');
    });

    el.classList.toggle('active');
};

function closePopups() {
    document.querySelectorAll('.popup-menu').forEach(p => p.classList.remove('active'));
}

function setTargetNodeImageUrl() {
    const id = contextMenu.dataset.target;
    const el = id ? document.getElementById(id) : null;
    if (!el) {
        contextMenu.style.display = 'none';
        return;
    }
    const type = getNodeTypeFromEl(el);
    if (!IMAGE_EDITABLE_NODE_TYPES.has(type)) {
        contextMenu.style.display = 'none';
        return;
    }

    const meta = getNodeMeta(el) || {};
    const current = typeof meta.imageUrl === 'string' ? meta.imageUrl : '';
    const imageLabel = type === 'person'
        ? 'portrait'
        : (type === 'location'
            ? 'location image'
            : (type === 'event'
                ? 'event image'
                : (type === 'requisition' ? 'requisition image' : 'clue image')));
    const nextRaw = prompt(`Set ${imageLabel} URL (blank clears image):`, current);
    if (nextRaw === null) {
        contextMenu.style.display = 'none';
        return;
    }

    const trimmed = String(nextRaw).trim();
    if (trimmed && !sanitizeImageUrl(trimmed)) {
        alert('Please provide a valid image URL.');
        return;
    }

    updateNodeImageMeta(el, trimmed);
    persistLinkedNodeImageUrl(el, trimmed);
    updateNodeCache(el.id);
    saveBoard();
    contextMenu.style.display = 'none';
}

function getContextTargetNode() {
    const id = contextMenu && contextMenu.dataset ? contextMenu.dataset.target : '';
    if (!id) return null;
    return document.getElementById(id);
}

function applyNarrativeMetaUpdate(nodeEl, updates = {}) {
    if (!nodeEl || !nodeEl.classList) return false;
    const type = getNodeTypeFromEl(nodeEl);
    if (!NARRATIVE_META_NODE_TYPES.has(type)) return false;
    const base = ensureNarrativeNodeMeta(nodeEl) || {};
    const patch = updates && typeof updates === 'object' ? updates : {};
    const next = {
        ...base,
        ...patch
    };
    if (type === 'theory') {
        delete next.certainty;
    } else if (NARRATIVE_CERTAINTY_NODE_TYPES.has(type)) {
        next.certainty = clampPercent(next.certainty, 50);
    } else {
        delete next.certainty;
    }
    if (NARRATIVE_RELIABILITY_NODE_TYPES.has(type)) {
        next.reliability = normalizeReliability(next.reliability);
    } else {
        delete next.reliability;
    }
    if (type === 'theory') {
        next.sourceType = String(next.sourceType || 'theory');
        next.theoryStatus = normalizeTheoryStatus(next.theoryStatus);
        next.confidence = clampPercent(next.confidence, 50);
    }
    setNodeMeta(nodeEl, stampNodeMeta(next));
    if (type === 'theory') syncTheoryNodeDisplay(nodeEl);
    else syncNodeNarrativeMetaDisplay(nodeEl);
    updateNodeCache(nodeEl.id);
    saveBoard();
    persistLinkedNodeNarrativeMeta(nodeEl);
    return true;
}

function setTargetNodeCertainty() {
    const nodeEl = getContextTargetNode();
    if (!nodeEl) {
        contextMenu.style.display = 'none';
        return;
    }
    const type = getNodeTypeFromEl(nodeEl);
    if (!NARRATIVE_CERTAINTY_NODE_TYPES.has(type)) {
        contextMenu.style.display = 'none';
        return;
    }
    const meta = ensureNarrativeNodeMeta(nodeEl) || {};
    const current = clampPercent(meta.certainty, 50);
    const nextRaw = prompt('Set certainty (0-100):', String(current));
    if (nextRaw === null) {
        contextMenu.style.display = 'none';
        return;
    }
    const nextValue = clampPercent(nextRaw, current);
    applyNarrativeMetaUpdate(nodeEl, { certainty: nextValue });
    contextMenu.style.display = 'none';
}

function addTargetNodeToLedger() {
    const nodeEl = getContextTargetNode();
    if (!nodeEl) {
        contextMenu.style.display = 'none';
        return;
    }
    const type = getNodeTypeFromEl(nodeEl);
    if (type === 'group') {
        contextMenu.style.display = 'none';
        return;
    }
    const existingMeta = getNodeMeta(nodeEl) || {};
    if (type === 'note' && String(existingMeta.sourceType || '').trim().toLowerCase() === 'ledger') {
        contextMenu.style.display = 'none';
        alert('This node already represents a ledger entry.');
        return;
    }
    const store = window.RTF_STORE;
    if (!store || typeof store.addLedgerEntry !== 'function') {
        alert('Ledger is not available in this build.');
        contextMenu.style.display = 'none';
        return;
    }

    const summary = getNodeSummary(nodeEl.id);
    if (!summary) {
        contextMenu.style.display = 'none';
        return;
    }
    const meta = NARRATIVE_META_NODE_TYPES.has(type)
        ? (ensureNarrativeNodeMeta(nodeEl) || {})
        : (getNodeMeta(nodeEl) || {});
    const defaultStatement = String(summary.title || '').trim() || `Board ${type}`;
    const statementRaw = prompt('Ledger statement:', defaultStatement);
    if (statementRaw === null) {
        contextMenu.style.display = 'none';
        return;
    }
    const statement = String(statementRaw || '').trim();
    if (!statement) {
        alert('Statement is required.');
        return;
    }

    let sourceType = 'manual';
    let sourceId = '';
    let provenanceContext = '';
    const metaSourceType = String(meta.sourceType || '').trim().toLowerCase();

    if (type === 'theory') {
        sourceType = 'theory';
        sourceId = String(summary.id || '').trim();
    } else if (type === 'clue') {
        sourceType = 'clue';
        sourceId = String(summary.id || '').trim();
    } else if (type === 'event') {
        sourceType = 'event';
        sourceId = String(summary.id || '').trim();
        if (metaSourceType === 'timeline-event' && meta.eventId) {
            sourceId = String(meta.eventId || '').trim();
        }
    } else if (metaSourceType === 'npc') {
        const npcLabel = String(meta.npcName || meta.npcId || 'Unknown NPC').trim();
        provenanceContext = `Heard from NPC: ${npcLabel}`;
    } else if (metaSourceType === 'location') {
        const locationLabel = String(meta.locationName || meta.locationId || 'Unknown Location').trim();
        provenanceContext = `Observed at location: ${locationLabel}`;
    } else if (metaSourceType === 'requisition') {
        const requisitionLabel = String(meta.requisitionId || meta.requisitionItem || 'Unknown Requisition').trim();
        provenanceContext = `Recorded from requisition: ${requisitionLabel}`;
    } else if (metaSourceType === 'lead') {
        const leadType = String(meta.leadType || '').trim().toLowerCase();
        const leadTargetId = String(meta.leadTargetId || '').trim();
        if (leadTargetId) {
            if (leadType === 'event') {
                sourceType = 'event';
                sourceId = leadTargetId;
            } else if (leadType === 'npc') {
                provenanceContext = `Lead witness target: NPC ${leadTargetId}`;
            } else if (leadType === 'location') {
                provenanceContext = `Lead site target: Location ${leadTargetId}`;
            } else if (leadType === 'requisition') {
                provenanceContext = `Lead record target: Requisition ${leadTargetId}`;
            }
        }
    }
    const caseId = String(meta.caseId || (typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : 'case_primary'));
    const certainty = clampPercent(
        meta.certainty !== undefined ? meta.certainty : (meta.confidence !== undefined ? meta.confidence : 50),
        50
    );
    const noteParts = [];
    if (provenanceContext) noteParts.push(provenanceContext);
    const summaryNotes = String(summary.bodyText || '').trim();
    if (summaryNotes) noteParts.push(summaryNotes);
    const notes = noteParts.join('\n\n').slice(0, 600);
    const tagSeed = String(summary.type || type || 'board').toLowerCase();
    const entryId = store.addLedgerEntry({
        caseId,
        statement,
        status: 'stable',
        sourceType,
        sourceId,
        certainty,
        tags: `board,${tagSeed}`,
        notes
    });
    if (!entryId) {
        alert('Could not add ledger entry (statement may be empty).');
        return;
    }
    contextMenu.style.display = 'none';
    alert('Added to Ledger.');
}

function logTheoryStatusEvent(nodeEl, status) {
    const store = window.RTF_STORE;
    if (!store || !nodeEl) return;
    const summary = getNodeSummary(nodeEl.id);
    const theoryTitle = summary ? summary.title : 'Theory';
    const statusLabel = getTheoryStatusLabel(status);
    const boardDescriptor = isCampaignBoardView() ? 'campaign board' : 'case board';
    const highlights = `${theoryTitle} marked ${statusLabel.toLowerCase()} on the ${boardDescriptor}.`;
    addBoardTimelineEvent(store, {
        id: `event_theory_${status}_${Date.now().toString(36)}`,
        title: `Theory ${statusLabel}: ${theoryTitle}`,
        focus: getCaseName(),
        heatDelta: '',
        tags: `theory,board,${status}`,
        highlights,
        fallout: '',
        followUp: '',
        source: 'board',
        kind: `theory-${status}`,
        resolved: status === 'disproven',
        created: new Date().toISOString()
    }, getBoardActiveCaseId(store));
}

function markTargetTheory(status) {
    const cleanStatus = normalizeTheoryStatus(status);
    const nodeEl = getContextTargetNode();
    if (!nodeEl || !nodeEl.classList.contains('type-theory')) {
        contextMenu.style.display = 'none';
        return;
    }
    const meta = ensureTheoryNodeMeta(nodeEl) || {};
    applyNarrativeMetaUpdate(nodeEl, {
        sourceType: 'theory',
        confidence: clampPercent(meta.confidence, 50),
        theoryStatus: cleanStatus
    });
    logTheoryStatusEvent(nodeEl, cleanStatus);
    contextMenu.style.display = 'none';
}

function createLeadFromTargetNode() {
    if (isCampaignBoardView()) {
        alert('Lead Queue is case-scoped. Open the case board to create leads.');
        contextMenu.style.display = 'none';
        return;
    }
    const nodeEl = getContextTargetNode();
    if (!nodeEl) return;
    const summary = getNodeSummary(nodeEl.id);
    if (!summary) {
        contextMenu.style.display = 'none';
        return;
    }
    const meta = summary.meta && typeof summary.meta === 'object' ? summary.meta : {};
    let leadType = 'other';
    let targetId = summary.id;
    if (meta.sourceType === 'npc' && meta.npcId) {
        leadType = 'npc';
        targetId = String(meta.npcId);
    } else if (meta.sourceType === 'location' && meta.locationId) {
        leadType = 'location';
        targetId = String(meta.locationId);
    } else if (meta.sourceType === 'timeline-event' && meta.eventId) {
        leadType = 'event';
        targetId = String(meta.eventId);
    } else if (meta.sourceType === 'requisition' && meta.requisitionId) {
        leadType = 'requisition';
        targetId = String(meta.requisitionId);
    } else if (summary.type === 'clue') {
        leadType = 'clue';
    } else if (summary.type === 'theory') {
        leadType = 'theory';
    }

    const typeHints = {
        npc: 'Interview this contact and verify motive.',
        location: 'Run surveillance and identify traffic patterns.',
        event: 'Pull linked evidence and interview witnesses.',
        requisition: 'Secure the requested asset for this thread.',
        clue: 'Cross-reference this clue against active suspects.',
        theory: 'Test this theory with one falsifiable scene action.',
        other: 'Choose one concrete scene action to pursue this lead.'
    };

    const storeObj = readLeadStorage();
    const caseId = getActiveLeadCaseId();
    const list = Array.isArray(storeObj[caseId]) ? storeObj[caseId] : [];
    list.push({
        id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        type: leadType,
        targetId,
        title: summary.title || 'New Lead',
        question: leadType === 'theory'
            ? `Is "${summary.title}" actually true?`
            : `What does "${summary.title}" reveal?`,
        nextStep: typeHints[leadType] || typeHints.other,
        status: 'open',
        votes: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString()
    });
    storeObj[caseId] = list;
    writeLeadStorage(storeObj);
    alert(`Lead created for ${summary.title}.`);
    contextMenu.style.display = 'none';
}

function persistLinkedNodeImageUrl(nodeEl, imageUrl = '') {
    if (!nodeEl || !window.RTF_STORE) return;
    const meta = getNodeMeta(nodeEl) || {};
    const store = window.RTF_STORE;
    const clean = sanitizeImageUrl(imageUrl);

    if (meta.sourceType === 'npc') {
        const campaign = store.state && store.state.campaign ? store.state.campaign : null;
        const list = campaign && Array.isArray(campaign.npcs) ? campaign.npcs : [];
        const rawNpcId = String(meta.npcId || '').trim();
        const target = list.find((entry) => String(entry && entry.id || '') === rawNpcId);
        if (!target) return;
        if (clean) target.imageUrl = clean;
        else delete target.imageUrl;
        if (typeof store.save === 'function') {
            const normalizedId = rawNpcId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
            const scope = normalizedId ? `campaign.npcs.${normalizedId}` : 'campaign.npcs';
            store.save({ scope });
        }
        return;
    }

    if (meta.sourceType === 'location') {
        const campaign = store.state && store.state.campaign ? store.state.campaign : null;
        const list = campaign && Array.isArray(campaign.locations) ? campaign.locations : [];
        const rawLocationId = String(meta.locationId || '').trim();
        const target = list.find((entry) => String(entry && entry.id || '') === rawLocationId);
        if (!target) return;
        if (clean) target.imageUrl = clean;
        else delete target.imageUrl;
        if (typeof store.save === 'function') {
            const normalizedId = rawLocationId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
            const scope = normalizedId ? `campaign.locations.${normalizedId}` : 'campaign.locations';
            store.save({ scope });
        }
        return;
    }

    if (meta.sourceType === 'timeline-event') {
        const eventId = String(meta.eventId || '').trim();
        if (!eventId) return;
        let caseId = String(meta.caseId || '').trim();
        if (!caseId) {
            if (!isCampaignBoardView()) {
                const cases = store.state && store.state.cases && Array.isArray(store.state.cases.items)
                    ? store.state.cases.items
                    : [];
                const ownerCase = cases.find((entry) => {
                    const events = entry && Array.isArray(entry.events) ? entry.events : [];
                    return events.some((evt) => String(evt && evt.id || '') === eventId);
                });
                caseId = ownerCase && ownerCase.id ? String(ownerCase.id) : '';
            }
        }
        updateBoardTimelineEvent(store, eventId, { imageUrl: clean }, caseId || null);
        return;
    }

    if (meta.sourceType === 'requisition' && typeof store.updateRequisition === 'function') {
        const requisitionId = String(meta.requisitionId || '').trim();
        if (!requisitionId) return;
        store.updateRequisition(requisitionId, { imageUrl: clean });
    }
}

function editTargetNode() {
    const el = document.getElementById(contextMenu.dataset.target);
    if (!el) return;
    el.classList.add('editing');
    const t = el.querySelector('.node-title');
    const b = el.querySelector('.node-body');
    t.contentEditable = b.contentEditable = true;
    t.focus();

    // Show Formatting Toolbar
    const tb = document.getElementById('formatting-toolbar');
    if (tb) {
        syncFormattingToolbarMeta(el);
        tb.style.display = 'flex';
        // Position to the right of the node
        const rect = el.getBoundingClientRect();
        tb.style.left = (rect.right + 10) + 'px';
        tb.style.top = rect.top + 'px';
    }

    const handleKey = (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b': e.preventDefault(); document.execCommand('bold'); saveBoard(); break;
                case 'i': e.preventDefault(); document.execCommand('italic'); saveBoard(); break;
                case 'u': e.preventDefault(); document.execCommand('underline'); saveBoard(); break;
            }
        }
    };

    t.addEventListener('keydown', handleKey);
    b.addEventListener('keydown', handleKey);

    let closed = false;
    let toolbarFocusOutHandler = null;
    const finishEditing = () => {
        if (closed) return;
        closed = true;
        t.contentEditable = b.contentEditable = false;
        el.classList.remove('editing');
        t.removeEventListener('keydown', handleKey);
        b.removeEventListener('keydown', handleKey);
        if (tb) {
            if (toolbarFocusOutHandler) tb.removeEventListener('focusout', toolbarFocusOutHandler);
            tb.style.display = 'none';
            syncFormattingToolbarMeta(null);
        }
        updateNodeCache(el.id);
        saveBoard();
    };

    const end = () => {
        // slight delay to allow button clicks to register before blur hides everything
        setTimeout(() => {
            if (closed) return;
            const active = document.activeElement;
            const isFocusedInToolbar = !!(tb && active && tb.contains(active));
            if (tb && tb.dataset.ignoreBlur === 'true') return;
            if (active !== t && active !== b && !isFocusedInToolbar) {
                finishEditing();
            }
        }, 50);
    };

    if (tb) {
        toolbarFocusOutHandler = () => {
            setTimeout(() => {
                if (closed) return;
                const active = document.activeElement;
                if (active === t || active === b) return;
                if (active && tb.contains(active)) return;
                if (tb.dataset.ignoreBlur === 'true') return;
                finishEditing();
            }, 50);
        };
        tb.addEventListener('focusout', toolbarFocusOutHandler);
    }

    t.onblur = end;
    b.onblur = end;

    contextMenu.style.display = 'none';
}

function deleteTargetNode() {
    const id = contextMenu.dataset.target;
    if (!id) return;
    const summary = getNodeSummary(id);
    const linksBeforeDelete = getNodeLinkCount(id);
    if (summary && linksBeforeDelete > 0) {
        const plural = linksBeforeDelete === 1 ? '' : 's';
        logBoardTimeline({
            title: `${getNodeTypeLabel(summary.type)} Thread Removed`,
            kind: 'node-removed',
            tags: ['node-remove', summary.type],
            highlights: `${summary.title} removed from active case map (${linksBeforeDelete} link${plural}).`
        }, { dedupeKey: `board:remove:${id}` });
    }

    const el = document.getElementById(id);
    if (el) el.remove();

    connections = connections.filter(c => {
        if (c.from === id || c.to === id) {
            const lbl = document.getElementById('lbl_' + c.id);
            if (lbl) lbl.remove();
            return false;
        }
        return true;
    });
    saveBoard();
    loadBoard();
    contextMenu.style.display = 'none';
}

function centerAndOptimize() {
    const id = contextMenu.dataset.target;
    if (!id) return;
    lastOptimizeSnapshot = captureLayoutSnapshot();
    updateUndoOptimizeMenuState();
    optimizeLayout(id);
    contextMenu.style.display = 'none';
}

function undoLastOptimize() {
    if (!lastOptimizeSnapshot) {
        contextMenu.style.display = 'none';
        return;
    }

    const snapshot = lastOptimizeSnapshot;
    lastOptimizeSnapshot = null;
    updateUndoOptimizeMenuState();
    applyLayoutSnapshot(snapshot);
    contextMenu.style.display = 'none';
}

function captureLayoutSnapshot() {
    const nodePositions = Array.from(document.querySelectorAll('.node')).map((el) => ({
        id: el.id,
        x: Number.isFinite(parseInt(el.style.left, 10)) ? parseInt(el.style.left, 10) : el.offsetLeft,
        y: Number.isFinite(parseInt(el.style.top, 10)) ? parseInt(el.style.top, 10) : el.offsetTop
    }));

    return {
        nodePositions,
        view: {
            x: view.x,
            y: view.y,
            scale: view.scale
        }
    };
}

function resetConnectionPhysicsFromNodeCache() {
    connections.forEach((conn) => {
        const n1 = nodeCache.get(conn.from);
        const n2 = nodeCache.get(conn.to);
        if (!n1 || !n2) return;

        const idx = connToIndex.get(conn.id);
        if (idx === undefined) return;

        sleepState[idx] = 1;
        const endpoints = getConnectionEndpointPositions(n1, n2, conn);
        const p1 = endpoints.from;
        const p2 = endpoints.to;
        const base = idx * BYTES_PER_CONN;

        for (let i = 0; i < CONFIG.POINTS_COUNT; i++) {
            const t = i / (CONFIG.POINTS_COUNT - 1);
            const px = p1.x + (p2.x - p1.x) * t;
            const py = p1.y + (p2.y - p1.y) * t;
            const ptr = base + i * STRIDE;
            physicsBuffer[ptr] = px;
            physicsBuffer[ptr + 1] = py;
            physicsBuffer[ptr + 2] = px;
            physicsBuffer[ptr + 3] = py;
            physicsBuffer[ptr + 4] = 0;
        }
    });
}

function applyLayoutSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.nodePositions)) return;

    const byId = new Map(snapshot.nodePositions.map((entry) => [entry.id, entry]));
    byId.forEach((entry, id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.left = `${entry.x}px`;
        el.style.top = `${entry.y}px`;
        updateNodeCache(id);
    });

    const snapView = snapshot.view || {};
    if (Number.isFinite(snapView.scale)) {
        view.scale = Math.max(CONFIG.VIEW_SCALE_MIN, Math.min(snapView.scale, CONFIG.VIEW_SCALE_MAX));
    }
    if (Number.isFinite(snapView.x)) view.x = snapView.x;
    if (Number.isFinite(snapView.y)) view.y = snapView.y;
    updateViewCSS();

    resetConnectionPhysicsFromNodeCache();
    saveBoard();
}

function optimizeLayout(centerId) {
    if (!centerId) { console.error("optimizeLayout: No Center ID"); return; }
    const centerEl = document.getElementById(centerId);
    if (!centerEl) { console.error("optimizeLayout: Node not found", centerId); return; }

    const nodeIds = Array.from(document.querySelectorAll('.node')).map((el) => el.id).filter(Boolean);
    if (!nodeIds.length) return;

    const nodeIdSet = new Set(nodeIds);
    if (!nodeIdSet.has(centerId)) { console.error("optimizeLayout: Node not on board", centerId); return; }

    const nodeMetrics = buildLayoutNodeMetrics(nodeIds);
    const clusters = getConnectedComponents(nodeIds, connections);

    let mainClusterIndex = clusters.findIndex((cluster) => cluster.includes(centerId));
    if (mainClusterIndex < 0) mainClusterIndex = 0;
    const mainCluster = clusters[mainClusterIndex] || [centerId];
    const otherClusters = clusters.filter((_, idx) => idx !== mainClusterIndex);

    const centerMetrics = nodeMetrics.get(centerId) || {
        x: centerEl.offsetLeft || 0,
        y: centerEl.offsetTop || 0,
        w: centerEl.offsetWidth || 180,
        h: centerEl.offsetHeight || 120
    };
    const originX = centerMetrics.x;
    const originY = centerMetrics.y;

    const mainLayout = layoutCluster(mainCluster, centerId, nodeMetrics, connections);
    const finalPositions = new Map();
    mainLayout.forEach((pos, id) => {
        finalPositions.set(id, {
            x: Math.round(pos.x + originX),
            y: Math.round(pos.y + originY)
        });
    });

    const placedRects = [];
    const mainRect = getClusterRect(mainCluster, finalPositions, nodeMetrics, 36);
    if (mainRect) placedRects.push(mainRect);

    const boardCenter = {
        x: originX + centerMetrics.w * 0.5,
        y: originY + centerMetrics.h * 0.5
    };

    otherClusters.forEach((cluster, clusterIndex) => {
        cluster.forEach((id) => {
            const metric = nodeMetrics.get(id);
            if (!metric) return;
            finalPositions.set(id, { x: metric.x, y: metric.y });
        });

        const currentRect = getClusterRect(cluster, finalPositions, nodeMetrics, 36);
        if (!currentRect) return;

        const resolved = nudgeClusterAwayFromObstacles(
            cluster,
            currentRect,
            placedRects,
            finalPositions,
            boardCenter,
            clusterIndex
        );
        placedRects.push(resolved);
    });

    finalPositions.forEach((pos, id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.left = `${Math.round(pos.x)}px`;
        el.style.top = `${Math.round(pos.y)}px`;
        updateNodeCache(id);
    });

    const centerFinal = finalPositions.get(centerId) || { x: originX, y: originY };
    const centerWidth = centerMetrics.w || centerEl.offsetWidth || 180;
    const centerHeight = centerMetrics.h || centerEl.offsetHeight || 120;
    view.x = window.innerWidth * 0.5 - (centerFinal.x + centerWidth * 0.5) * view.scale;
    view.y = window.innerHeight * 0.5 - (centerFinal.y + centerHeight * 0.5) * view.scale;
    updateViewCSS();

    saveBoard();
    resetConnectionPhysicsFromNodeCache();
}

// --- LAYOUT HELPERS ---

function buildLayoutNodeMetrics(nodeIds) {
    const metrics = new Map();
    (Array.isArray(nodeIds) ? nodeIds : []).forEach((id) => {
        if (!id) return;
        updateNodeCache(id);
        const cached = nodeCache.get(id);
        const fallbackEl = document.getElementById(id);
        if (!fallbackEl && !cached) return;
        const x = cached ? cached.x - (cached.relX || 0) : (fallbackEl ? fallbackEl.offsetLeft : 0);
        const y = cached ? cached.y - (cached.relY || 0) : (fallbackEl ? fallbackEl.offsetTop : 0);
        const w = cached ? (cached.layoutW || cached.w || 220) : (fallbackEl ? fallbackEl.offsetWidth : 220);
        const h = cached ? (cached.layoutH || cached.h || 140) : (fallbackEl ? fallbackEl.offsetHeight : 140);
        metrics.set(id, { x, y, w: Math.max(40, w), h: Math.max(30, h) });
    });
    return metrics;
}

function getConnectedComponents(nodeIds, allConns) {
    const visited = new Set();
    const clusters = [];

    const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [];
    const idSet = new Set(ids);

    const adj = new Map();
    ids.forEach((id) => adj.set(id, []));
    (Array.isArray(allConns) ? allConns : []).forEach((conn) => {
        if (!conn || !idSet.has(conn.from) || !idSet.has(conn.to)) return;
        adj.get(conn.from).push(conn.to);
        adj.get(conn.to).push(conn.from);
    });

    ids.forEach((id) => {
        if (visited.has(id)) return;

        const cluster = [];
        const queue = [id];
        visited.add(id);

        while (queue.length > 0) {
            const currId = queue.shift();
            if (!currId) continue;
            cluster.push(currId);

            const neighbors = adj.get(currId) || [];
            neighbors.forEach((nid) => {
                if (!visited.has(nid)) {
                    visited.add(nid);
                    queue.push(nid);
                }
            });
        }
        clusters.push(cluster);
    });
    return clusters;
}

function layoutCluster(clusterNodeIds, rootId, nodeMetrics, allConns) {
    const positions = new Map();
    const cluster = Array.isArray(clusterNodeIds) ? clusterNodeIds.filter(Boolean) : [];
    if (!cluster.length) return positions;

    if (!cluster.includes(rootId)) rootId = cluster[0];

    const clusterSet = new Set(cluster);
    const adj = new Map();
    cluster.forEach((id) => adj.set(id, []));
    (Array.isArray(allConns) ? allConns : []).forEach((conn) => {
        if (!conn || !clusterSet.has(conn.from) || !clusterSet.has(conn.to)) return;
        adj.get(conn.from).push(conn.to);
        adj.get(conn.to).push(conn.from);
    });

    const rootMetric = nodeMetrics.get(rootId) || { x: 0, y: 0, w: 220, h: 140 };
    const rootCenterX = rootMetric.x + rootMetric.w * 0.5;
    const rootCenterY = rootMetric.y + rootMetric.h * 0.5;

    const distances = new Map([[rootId, 0]]);
    const bfsQueue = [rootId];
    while (bfsQueue.length) {
        const current = bfsQueue.shift();
        const nextDist = (distances.get(current) || 0) + 1;
        const neighbors = adj.get(current) || [];
        neighbors.forEach((neighborId) => {
            if (distances.has(neighborId)) return;
            distances.set(neighborId, nextDist);
            bfsQueue.push(neighborId);
        });
    }

    let maxDist = 0;
    distances.forEach((distVal) => { if (distVal > maxDist) maxDist = distVal; });
    cluster.forEach((id) => {
        if (!distances.has(id)) {
            maxDist += 1;
            distances.set(id, maxDist);
        }
    });

    const groups = [];
    distances.forEach((distVal, id) => {
        if (!groups[distVal]) groups[distVal] = [];
        groups[distVal].push(id);
    });

    positions.set(rootId, { x: 0, y: 0 });

    const layerRadius = [0];
    const layerHalfSize = [Math.max(rootMetric.w, rootMetric.h) * 0.5];
    const NODE_GAP = 88;
    const LAYER_GAP = 170;

    for (let distLayer = 1; distLayer < groups.length; distLayer++) {
        const layerNodes = groups[distLayer];
        if (!layerNodes || !layerNodes.length) continue;

        layerNodes.sort((leftId, rightId) => {
            const leftMetric = nodeMetrics.get(leftId) || rootMetric;
            const rightMetric = nodeMetrics.get(rightId) || rootMetric;
            const leftAngle = Math.atan2(
                (leftMetric.y + leftMetric.h * 0.5) - rootCenterY,
                (leftMetric.x + leftMetric.w * 0.5) - rootCenterX
            );
            const rightAngle = Math.atan2(
                (rightMetric.y + rightMetric.h * 0.5) - rootCenterY,
                (rightMetric.x + rightMetric.w * 0.5) - rootCenterX
            );
            return leftAngle - rightAngle;
        });

        const previousRadius = layerRadius[distLayer - 1] || 0;
        const previousHalf = layerHalfSize[distLayer - 1] || 120;
        let maxHalf = 0;
        let requiredArc = 0;
        layerNodes.forEach((id) => {
            const metric = nodeMetrics.get(id) || { w: 220, h: 140 };
            maxHalf = Math.max(maxHalf, Math.max(metric.w, metric.h) * 0.5);
            requiredArc += metric.w + NODE_GAP;
        });

        let radius = Math.max(
            previousRadius + previousHalf + maxHalf + LAYER_GAP,
            distLayer * 260,
            requiredArc / (2 * Math.PI)
        );
        if (!Number.isFinite(radius) || radius <= 0) radius = distLayer * 260;

        const parentAngles = [];
        layerNodes.forEach((id) => {
            const parentIds = (adj.get(id) || []).filter((pid) => (distances.get(pid) || 0) === distLayer - 1);
            if (!parentIds.length) return;
            let sumX = 0;
            let sumY = 0;
            let counted = 0;
            parentIds.forEach((parentId) => {
                const parentPos = positions.get(parentId);
                const parentMetric = nodeMetrics.get(parentId) || { w: 220, h: 140 };
                if (!parentPos) return;
                sumX += parentPos.x + parentMetric.w * 0.5;
                sumY += parentPos.y + parentMetric.h * 0.5;
                counted += 1;
            });
            if (!counted) return;
            parentAngles.push(Math.atan2(sumY / counted, sumX / counted));
        });

        let baseAngle = -Math.PI * 0.5;
        if (parentAngles.length) {
            let dirX = 0;
            let dirY = 0;
            parentAngles.forEach((angle) => {
                dirX += Math.cos(angle);
                dirY += Math.sin(angle);
            });
            if (Math.abs(dirX) > 0.0001 || Math.abs(dirY) > 0.0001) {
                baseAngle = Math.atan2(dirY, dirX);
            }
        }

        const totalArc = layerNodes.reduce((sum, id) => {
            const metric = nodeMetrics.get(id) || { w: 220 };
            return sum + metric.w + NODE_GAP;
        }, 0);
        const maxArc = Math.PI * 2 * radius;
        if (totalArc > maxArc && totalArc > 0) {
            radius = totalArc / (Math.PI * 2);
        }

        let angleCursor = baseAngle - (totalArc / Math.max(radius, 1)) * 0.5;
        layerNodes.forEach((id) => {
            const metric = nodeMetrics.get(id) || { w: 220, h: 140 };
            const arcSpan = (metric.w + NODE_GAP) / Math.max(radius, 1);
            const angle = angleCursor + arcSpan * 0.5;
            const centerX = Math.cos(angle) * radius;
            const centerY = Math.sin(angle) * radius;
            positions.set(id, {
                x: centerX - metric.w * 0.5,
                y: centerY - metric.h * 0.5
            });
            angleCursor += arcSpan;
        });

        layerRadius[distLayer] = radius;
        layerHalfSize[distLayer] = maxHalf;
    }

    const idealPositions = new Map();
    positions.forEach((pos, id) => {
        idealPositions.set(id, { x: pos.x, y: pos.y });
    });

    const idList = cluster.slice();
    const getMetric = (id) => nodeMetrics.get(id) || { w: 220, h: 140 };
    const getCenter = (id) => {
        const metric = getMetric(id);
        const pos = positions.get(id) || { x: 0, y: 0 };
        return {
            x: pos.x + metric.w * 0.5,
            y: pos.y + metric.h * 0.5
        };
    };
    const getRect = (id, padding = 0) => {
        const metric = getMetric(id);
        const pos = positions.get(id) || { x: 0, y: 0 };
        return {
            left: pos.x - padding,
            top: pos.y - padding,
            right: pos.x + metric.w + padding,
            bottom: pos.y + metric.h + padding
        };
    };
    const pointInRect = (point, rect) => (
        point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
    const cross = (a, b, c) => ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
    const onSegment = (a, b, c, eps = 0.0001) => (
        Math.min(a.x, c.x) - eps <= b.x && b.x <= Math.max(a.x, c.x) + eps
        && Math.min(a.y, c.y) - eps <= b.y && b.y <= Math.max(a.y, c.y) + eps
    );
    const segmentsIntersect = (p1, p2, q1, q2) => {
        const eps = 0.0001;
        const d1 = cross(p1, p2, q1);
        const d2 = cross(p1, p2, q2);
        const d3 = cross(q1, q2, p1);
        const d4 = cross(q1, q2, p2);

        if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps))
            && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
            return true;
        }

        if (Math.abs(d1) <= eps && onSegment(p1, q1, p2, eps)) return true;
        if (Math.abs(d2) <= eps && onSegment(p1, q2, p2, eps)) return true;
        if (Math.abs(d3) <= eps && onSegment(q1, p1, q2, eps)) return true;
        if (Math.abs(d4) <= eps && onSegment(q1, p2, q2, eps)) return true;
        return false;
    };
    const segmentIntersectsRect = (a, b, rect) => {
        if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
        const corners = [
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.top },
            { x: rect.right, y: rect.bottom },
            { x: rect.left, y: rect.bottom }
        ];
        return segmentsIntersect(a, b, corners[0], corners[1])
            || segmentsIntersect(a, b, corners[1], corners[2])
            || segmentsIntersect(a, b, corners[2], corners[3])
            || segmentsIntersect(a, b, corners[3], corners[0]);
    };
    const projectPointOnSegment = (point, a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const denom = (dx * dx) + (dy * dy);
        if (denom < 0.0001) return { x: a.x, y: a.y };
        let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / denom;
        t = Math.max(0, Math.min(1, t));
        return {
            x: a.x + (dx * t),
            y: a.y + (dy * t)
        };
    };
    const distancePointToSegment = (point, a, b) => {
        const proj = projectPointOnSegment(point, a, b);
        return Math.hypot(point.x - proj.x, point.y - proj.y);
    };
    const applyForce = (forces, id, fx, fy) => {
        if (id === rootId) return;
        const force = forces.get(id);
        if (!force) return;
        force.x += fx;
        force.y += fy;
    };

    const edges = [];
    const edgeKeys = new Set();
    cluster.forEach((id) => {
        const neighbors = adj.get(id) || [];
        neighbors.forEach((nid) => {
            const left = String(id);
            const right = String(nid);
            const key = left < right ? `${left}|${right}` : `${right}|${left}`;
            if (edgeKeys.has(key)) return;
            edgeKeys.add(key);
            edges.push({ a: left < right ? id : nid, b: left < right ? nid : id });
        });
    });

    const averageNodeSpan = Math.max(120, Math.round(cluster.reduce((sum, id) => {
        const metric = getMetric(id);
        return sum + Math.max(metric.w, metric.h);
    }, 0) / Math.max(1, cluster.length)));
    const idealEdgeLength = Math.max(140, Math.min(260, Math.round((averageNodeSpan * 0.95) + 40)));

    const crossingPairs = [];
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const e1 = edges[i];
            const e2 = edges[j];
            if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
            crossingPairs.push([i, j]);
        }
    }
    const EDGE_PAIR_BUDGET = 12000;
    const pairStride = crossingPairs.length > EDGE_PAIR_BUDGET
        ? Math.max(1, Math.ceil(crossingPairs.length / EDGE_PAIR_BUDGET))
        : 1;

    const ITERATIONS = 180;
    const NODE_OVERLAP_PADDING = 26;
    const NODE_EDGE_PADDING = 28;
    for (let iter = 0; iter < ITERATIONS; iter++) {
        const cooling = 1 - (iter / ITERATIONS);
        const forceStep = 20 * (0.45 + cooling);
        const springStrength = 0.032 * (0.55 + cooling * 0.45);
        const idealPull = 0.02 * cooling;
        const repulseBase = 65000;
        const crossingPush = 24 * (0.5 + cooling);
        const forces = new Map();
        idList.forEach((id) => forces.set(id, { x: 0, y: 0 }));

        for (let i = 0; i < idList.length; i++) {
            const leftId = idList[i];
            const leftMetric = getMetric(leftId);
            const leftCenter = getCenter(leftId);

            for (let j = i + 1; j < idList.length; j++) {
                const rightId = idList[j];
                const rightMetric = getMetric(rightId);
                const rightCenter = getCenter(rightId);
                let dx = rightCenter.x - leftCenter.x;
                let dy = rightCenter.y - leftCenter.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) {
                    const hash = Math.abs(hashString(`${leftId}:${rightId}`)) % 360;
                    const angle = (hash / 180) * Math.PI;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }
                const ux = dx / dist;
                const uy = dy / dist;
                const preferred = ((leftMetric.w + rightMetric.w) * 0.5) + 46;
                const overlap = preferred - dist;

                if (overlap > 0) {
                    const push = overlap * 0.9;
                    applyForce(forces, leftId, -ux * push, -uy * push);
                    applyForce(forces, rightId, ux * push, uy * push);
                } else {
                    const push = Math.min(3.6, repulseBase / Math.max(1, dist * dist));
                    applyForce(forces, leftId, -ux * push, -uy * push);
                    applyForce(forces, rightId, ux * push, uy * push);
                }
            }
        }

        edges.forEach((edge) => {
            const centerA = getCenter(edge.a);
            const centerB = getCenter(edge.b);
            let dx = centerB.x - centerA.x;
            let dy = centerB.y - centerA.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 0.0001) {
                dx = 1;
                dy = 0;
                dist = 1;
            }
            const ux = dx / dist;
            const uy = dy / dist;
            const delta = dist - idealEdgeLength;
            const pull = delta * springStrength;
            applyForce(forces, edge.a, ux * pull, uy * pull);
            applyForce(forces, edge.b, -ux * pull, -uy * pull);
        });

        const crossingOffset = pairStride > 1 ? (iter % pairStride) : 0;
        for (let idx = crossingOffset; idx < crossingPairs.length; idx += pairStride) {
            const pair = crossingPairs[idx];
            if (!pair) continue;
            const edgeA = edges[pair[0]];
            const edgeB = edges[pair[1]];
            if (!edgeA || !edgeB) continue;
            const a1 = getCenter(edgeA.a);
            const a2 = getCenter(edgeA.b);
            const b1 = getCenter(edgeB.a);
            const b2 = getCenter(edgeB.b);
            if (!segmentsIntersect(a1, a2, b1, b2)) continue;

            const midA = { x: (a1.x + a2.x) * 0.5, y: (a1.y + a2.y) * 0.5 };
            const midB = { x: (b1.x + b2.x) * 0.5, y: (b1.y + b2.y) * 0.5 };
            [edgeA.a, edgeA.b].forEach((id) => {
                const center = getCenter(id);
                let dx = center.x - midB.x;
                let dy = center.y - midB.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) {
                    const hash = Math.abs(hashString(`${id}:cross-a:${iter}`)) % 360;
                    const angle = (hash / 180) * Math.PI;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }
                applyForce(forces, id, (dx / dist) * crossingPush, (dy / dist) * crossingPush);
            });
            [edgeB.a, edgeB.b].forEach((id) => {
                const center = getCenter(id);
                let dx = center.x - midA.x;
                let dy = center.y - midA.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) {
                    const hash = Math.abs(hashString(`${id}:cross-b:${iter}`)) % 360;
                    const angle = (hash / 180) * Math.PI;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }
                applyForce(forces, id, (dx / dist) * crossingPush, (dy / dist) * crossingPush);
            });
        }

        idList.forEach((id) => {
            if (id === rootId) return;
            const nodeCenter = getCenter(id);
            const nodeRect = getRect(id, NODE_EDGE_PADDING);
            edges.forEach((edge) => {
                if (edge.a === id || edge.b === id) return;
                const edgeA = getCenter(edge.a);
                const edgeB = getCenter(edge.b);
                const hitsNode = segmentIntersectsRect(edgeA, edgeB, nodeRect);
                const edgeDist = distancePointToSegment(nodeCenter, edgeA, edgeB);
                if (!hitsNode && edgeDist >= NODE_EDGE_PADDING) return;

                const nearest = projectPointOnSegment(nodeCenter, edgeA, edgeB);
                let dx = nodeCenter.x - nearest.x;
                let dy = nodeCenter.y - nearest.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) {
                    const hash = Math.abs(hashString(`${id}:edge:${edge.a}:${edge.b}`)) % 360;
                    const angle = (hash / 180) * Math.PI;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }
                const depth = hitsNode
                    ? NODE_EDGE_PADDING + 10
                    : Math.max(0, NODE_EDGE_PADDING - edgeDist);
                const push = (depth * 0.85 * (0.6 + cooling * 0.4)) + (hitsNode ? 4 : 0);
                const ux = dx / dist;
                const uy = dy / dist;
                applyForce(forces, id, ux * push, uy * push);
                applyForce(forces, edge.a, -ux * push * 0.35, -uy * push * 0.35);
                applyForce(forces, edge.b, -ux * push * 0.35, -uy * push * 0.35);
            });
        });

        let moved = false;
        idList.forEach((id) => {
            if (id === rootId) return;
            const pos = positions.get(id);
            const ideal = idealPositions.get(id);
            const force = forces.get(id);
            if (!pos || !ideal || !force) return;

            force.x += (ideal.x - pos.x) * idealPull;
            force.y += (ideal.y - pos.y) * idealPull;

            const stepX = Math.max(-forceStep, Math.min(forceStep, force.x));
            const stepY = Math.max(-forceStep, Math.min(forceStep, force.y));
            if (Math.abs(stepX) > 0.01 || Math.abs(stepY) > 0.01) moved = true;
            pos.x += stepX;
            pos.y += stepY;
            pos.x *= 0.997;
            pos.y *= 0.997;
        });

        for (let i = 0; i < idList.length; i++) {
            const leftId = idList[i];
            for (let j = i + 1; j < idList.length; j++) {
                const rightId = idList[j];
                const leftRect = getRect(leftId, NODE_OVERLAP_PADDING);
                const rightRect = getRect(rightId, NODE_OVERLAP_PADDING);
                const overlapX = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
                const overlapY = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
                if (overlapX <= 0 || overlapY <= 0) continue;

                const leftCenter = getCenter(leftId);
                const rightCenter = getCenter(rightId);
                const dirX = rightCenter.x >= leftCenter.x ? 1 : -1;
                const dirY = rightCenter.y >= leftCenter.y ? 1 : -1;
                const pushX = overlapX * 0.52;
                const pushY = overlapY * 0.52;

                if (overlapX < overlapY) {
                    if (leftId === rootId) {
                        const rightPos = positions.get(rightId);
                        if (rightPos) rightPos.x += dirX * pushX * 2;
                    } else if (rightId === rootId) {
                        const leftPos = positions.get(leftId);
                        if (leftPos) leftPos.x -= dirX * pushX * 2;
                    } else {
                        const leftPos = positions.get(leftId);
                        const rightPos = positions.get(rightId);
                        if (leftPos) leftPos.x -= dirX * pushX;
                        if (rightPos) rightPos.x += dirX * pushX;
                    }
                } else {
                    if (leftId === rootId) {
                        const rightPos = positions.get(rightId);
                        if (rightPos) rightPos.y += dirY * pushY * 2;
                    } else if (rightId === rootId) {
                        const leftPos = positions.get(leftId);
                        if (leftPos) leftPos.y -= dirY * pushY * 2;
                    } else {
                        const leftPos = positions.get(leftId);
                        const rightPos = positions.get(rightId);
                        if (leftPos) leftPos.y -= dirY * pushY;
                        if (rightPos) rightPos.y += dirY * pushY;
                    }
                }
                moved = true;
            }
        }

        positions.set(rootId, { x: 0, y: 0 });
        if (!moved && iter > 24) break;
    }

    const EDGE_TIGHTEN_PASSES = 20;
    for (let pass = 0; pass < EDGE_TIGHTEN_PASSES; pass++) {
        let changed = false;
        let crossingChanged = false;
        const maxLen = idealEdgeLength * 1.12;
        const minLen = idealEdgeLength * 0.55;

        edges.forEach((edge) => {
            const centerA = getCenter(edge.a);
            const centerB = getCenter(edge.b);
            let dx = centerB.x - centerA.x;
            let dy = centerB.y - centerA.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 0.0001) {
                dx = 1;
                dy = 0;
                dist = 1;
            }
            const ux = dx / dist;
            const uy = dy / dist;

            if (dist > maxLen) {
                const pull = (dist - maxLen) * 0.42;
                const leftPos = positions.get(edge.a);
                const rightPos = positions.get(edge.b);
                if (edge.a !== rootId && leftPos) {
                    leftPos.x += ux * pull;
                    leftPos.y += uy * pull;
                }
                if (edge.b !== rootId && rightPos) {
                    rightPos.x -= ux * pull;
                    rightPos.y -= uy * pull;
                }
                changed = true;
            } else if (dist < minLen) {
                const push = (minLen - dist) * 0.38;
                const leftPos = positions.get(edge.a);
                const rightPos = positions.get(edge.b);
                if (edge.a !== rootId && leftPos) {
                    leftPos.x -= ux * push;
                    leftPos.y -= uy * push;
                }
                if (edge.b !== rootId && rightPos) {
                    rightPos.x += ux * push;
                    rightPos.y += uy * push;
                }
                changed = true;
            }
        });

        crossingPairs.forEach((pair) => {
            const edgeA = edges[pair[0]];
            const edgeB = edges[pair[1]];
            if (!edgeA || !edgeB) return;
            const a1 = getCenter(edgeA.a);
            const a2 = getCenter(edgeA.b);
            const b1 = getCenter(edgeB.a);
            const b2 = getCenter(edgeB.b);
            if (!segmentsIntersect(a1, a2, b1, b2)) return;

            const midA = { x: (a1.x + a2.x) * 0.5, y: (a1.y + a2.y) * 0.5 };
            const midB = { x: (b1.x + b2.x) * 0.5, y: (b1.y + b2.y) * 0.5 };
            const uncrossPush = 8;

            [edgeA.a, edgeA.b].forEach((id) => {
                if (id === rootId) return;
                const pos = positions.get(id);
                const center = getCenter(id);
                if (!pos) return;
                let dx = center.x - midB.x;
                let dy = center.y - midB.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) dist = 1;
                pos.x += (dx / dist) * uncrossPush;
                pos.y += (dy / dist) * uncrossPush;
            });
            [edgeB.a, edgeB.b].forEach((id) => {
                if (id === rootId) return;
                const pos = positions.get(id);
                const center = getCenter(id);
                if (!pos) return;
                let dx = center.x - midA.x;
                let dy = center.y - midA.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.0001) dist = 1;
                pos.x += (dx / dist) * uncrossPush;
                pos.y += (dy / dist) * uncrossPush;
            });
            crossingChanged = true;
        });

        positions.set(rootId, { x: 0, y: 0 });
        if (!changed && !crossingChanged) break;
    }

    positions.forEach((pos, id) => {
        positions.set(id, { x: Math.round(pos.x), y: Math.round(pos.y) });
    });
    return positions;
}

function getClusterRect(clusterIds, positions, nodeMetrics, padding = 0) {
    if (!Array.isArray(clusterIds) || !clusterIds.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    clusterIds.forEach((id) => {
        const pos = positions.get(id);
        const metric = nodeMetrics.get(id);
        if (!pos || !metric) return;
        minX = Math.min(minX, pos.x - padding);
        minY = Math.min(minY, pos.y - padding);
        maxX = Math.max(maxX, pos.x + metric.w + padding);
        maxY = Math.max(maxY, pos.y + metric.h + padding);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY
    };
}

function rectsOverlap(a, b) {
    if (!a || !b) return false;
    return !(a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top);
}

function shiftRect(rect, dx, dy) {
    return {
        left: rect.left + dx,
        top: rect.top + dy,
        right: rect.right + dx,
        bottom: rect.bottom + dy
    };
}

function hashString(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function nudgeClusterAwayFromObstacles(clusterIds, currentRect, obstacles, positions, boardCenter, seed = 0) {
    const obstacleList = Array.isArray(obstacles) ? obstacles : [];
    const hasCollision = (rect) => obstacleList.some((obs) => rectsOverlap(rect, obs));
    if (!hasCollision(currentRect)) return currentRect;

    const clusterCenterX = (currentRect.left + currentRect.right) * 0.5;
    const clusterCenterY = (currentRect.top + currentRect.bottom) * 0.5;
    let dirX = clusterCenterX - (boardCenter ? boardCenter.x : clusterCenterX);
    let dirY = clusterCenterY - (boardCenter ? boardCenter.y : clusterCenterY);

    if (Math.abs(dirX) < 0.0001 && Math.abs(dirY) < 0.0001) {
        const angle = ((Math.abs(hashString(`cluster:${seed}`)) % 360) / 180) * Math.PI;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
    }

    const baseMag = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / baseMag;
    const uy = dirY / baseMag;
    const tx = -uy;
    const ty = ux;
    const STEP = 140;
    const MAX_RING = 26;

    let bestDx = 0;
    let bestDy = 0;
    let bestRect = currentRect;
    let placed = false;

    for (let ring = 1; ring <= MAX_RING && !placed; ring++) {
        const radial = ring * STEP;
        for (let lane = -2; lane <= 2; lane++) {
            const lateral = lane * STEP * 0.7;
            const dx = Math.round(ux * radial + tx * lateral);
            const dy = Math.round(uy * radial + ty * lateral);
            const candidateRect = shiftRect(currentRect, dx, dy);
            if (hasCollision(candidateRect)) continue;
            bestDx = dx;
            bestDy = dy;
            bestRect = candidateRect;
            placed = true;
            break;
        }
    }

    if (!placed) {
        bestDx = Math.round(ux * STEP * MAX_RING);
        bestDy = Math.round(uy * STEP * MAX_RING);
        bestRect = shiftRect(currentRect, bestDx, bestDy);
    }

    if (bestDx || bestDy) {
        clusterIds.forEach((id) => {
            const pos = positions.get(id);
            if (!pos) return;
            positions.set(id, { x: pos.x + bestDx, y: pos.y + bestDy });
        });
    }

    return bestRect;
}

function startDragNew(e, type, data = {}) {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, data }));
    e.dataTransfer.effectAllowed = 'copy';
}
document.body.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
};
document.body.ondrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (raw) {
        try {
            const payload = JSON.parse(raw);
            const wp = screenToWorld(e.clientX, e.clientY);
            const node = createNode(payload.type, wp.x, wp.y, null, payload.data);
            logNodeAddedToBoard(getNodeSummary(node.id));
            saveBoard();
        } catch (err) {
            console.error("Drop failed", err);
        }
    } else {
        // Fallback for simple types?
        const type = e.dataTransfer.getData('text/plain');
        if (type) {
            const wp = screenToWorld(e.clientX, e.clientY);
            const node = createNode(type, wp.x, wp.y);
            logNodeAddedToBoard(getNodeSummary(node.id));
            saveBoard();
        }
    }
};

// HIT TEST HELPER
function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function getEventTargetElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Node && target.parentElement) return target.parentElement;
    return null;
}

function clearBoardFocusMode() {
    focusMode = false;
    document.body.classList.remove('focus-active');
    document.querySelectorAll('.node').forEach((el) => {
        el.classList.remove('blurred');
        el.classList.remove('focused');
    });
}

function applyBoardFocusMode(nodeEl) {
    if (!nodeEl) return;
    focusMode = true;
    document.body.classList.add('focus-active');
    document.querySelectorAll('.node').forEach((el) => {
        el.classList.add('blurred');
        el.classList.remove('focused');
    });
    nodeEl.classList.remove('blurred');
    nodeEl.classList.add('focused');

    // Unblur immediate neighbors for local context without changing the selected focal node.
    const neighborIds = new Set();
    connections.forEach((conn) => {
        if (conn.from === nodeEl.id) neighborIds.add(conn.to);
        if (conn.to === nodeEl.id) neighborIds.add(conn.from);
    });
    neighborIds.forEach((neighborId) => {
        const neighborEl = document.getElementById(neighborId);
        if (!neighborEl) return;
        neighborEl.classList.remove('blurred');
    });
}

// RESTORED HIT TEST
document.addEventListener('dblclick', (e) => {
    const targetEl = getEventTargetElement(e.target);
    if (!targetEl) return;

    if (targetEl.closest('input, textarea, select, button, .label-input, [contenteditable="true"]')) return;

    const n = targetEl.closest('.node');
    if (n) {
        applyBoardFocusMode(n);
        return;
    }

    // HIT TEST STRINGS
    const worldPos = screenToWorld(e.clientX, e.clientY);
    let bestDist = 20; // threshold
    let foundConn = null;

    const len = connections.length;
    for (let i = 0; i < len; i++) {
        const conn = connections[i];
        const bIdx = connToIndex.get(conn.id);
        if (bIdx === undefined) continue;

        const base = bIdx * BYTES_PER_CONN;

        // Iterate segments
        for (let j = 0; j < CONFIG.POINTS_COUNT - 1; j++) {
            const p1Idx = base + j * STRIDE;
            const p2Idx = base + (j + 1) * STRIDE;

            const p1 = { x: physicsBuffer[p1Idx], y: physicsBuffer[p1Idx + 1] };
            const p2 = { x: physicsBuffer[p2Idx], y: physicsBuffer[p2Idx + 1] };

            const d = distToSegment(worldPos, p1, p2);
            if (d < bestDist) {
                bestDist = d;
                foundConn = conn;
            }
        }
    }

    if (foundConn) {
        if (!foundConn.label) {
            foundConn.label = "Note";
            saveBoard();
        }
    } else {
        // RESET FOCUS
        clearBoardFocusMode();
    }
});

function spawnBoardNodeAtViewport(type = 'note', nodeData = {}) {
    const wp = screenToWorld(window.innerWidth * 0.5, window.innerHeight * 0.5);
    const payload = nodeData && typeof nodeData === 'object' ? nodeData : {};
    const node = createNode(String(type || 'note'), wp.x, wp.y, null, payload);
    if (!node) return null;
    logNodeAddedToBoard(getNodeSummary(node.id));
    saveBoard();
    return node.id;
}

window.RTF_BOARD_EMBED_API = {
    loadExternal(payload) {
        loadBoard({}, sanitizeBoardPayload(payload));
        updateViewCSS();
    },
    getSnapshot() {
        saveBoard();
        const snapshot = readStoreBoardPayload();
        return sanitizeBoardPayload(snapshot || { name: getCaseName(), nodes: [], connections: [] });
    },
    spawnNode(type, nodeData = {}) {
        return spawnBoardNodeAtViewport(type, nodeData);
    },
    refresh() {
        handleBoardResize();
    }
};

// Expose filter functions to window for HTML event handlers
window.renderNPCs = renderNPCs;
window.renderLocations = renderLocations;
window.renderBoardEvents = renderBoardEvents;
window.renderBoardRequisitions = renderBoardRequisitions;
window.draftEncounterFromTargetNode = draftEncounterFromTargetNode;
window.createLeadFromTargetNode = createLeadFromTargetNode;
window.setTargetNodeCertainty = setTargetNodeCertainty;
window.addTargetNodeToLedger = addTargetNodeToLedger;
window.markTargetTheory = markTargetTheory;
