import * as Y from './vendor/yjs/yjs.mjs';
import * as syncProtocol from './vendor/y-protocols/sync.js';
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate
} from './vendor/y-protocols/awareness.js';
import { IndexeddbPersistence } from './vendor/y-indexeddb/y-indexeddb.js';
import * as encoding from './vendor/lib0/encoding.js';
import * as decoding from './vendor/lib0/decoding.js';

const LOCAL_MIRROR_DELAY_MS = 120;
const CLOUD_FLUSH_DELAY_MS = 1000;
const SYNC_RECONCILE_INTERVAL_MS = 2000;
const SYNC_RECONCILE_REQUEST_EVENT = 'y-sync-request';
const DEFAULT_VTT_CELL_PX = 70;
const TOKEN_COORD_PRECISION = 1000;
const DEFAULT_CASE_ID = 'case_primary';
const VTT_DEFENCE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const PEER_COLORS = [
    '#ff8a65',
    '#4db6ac',
    '#64b5f6',
    '#ffd54f',
    '#ba68c8',
    '#81c784',
    '#f06292',
    '#90a4ae'
];

const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
    if (value === null || value === undefined) return fallback;
    return String(value).slice(0, maxLen);
};

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, parsed);
};

const toIsoString = (value, fallback = '') => {
    const parsed = typeof value === 'number' && Number.isFinite(value)
        ? value
        : (typeof value === 'string' && value.trim() ? Date.parse(value) : NaN);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    try {
        return new Date(parsed).toISOString();
    } catch (err) {
        return fallback;
    }
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const stableStringify = (value) => {
    if (value === null || value === undefined) return '';
    try {
        return JSON.stringify(value);
    } catch (err) {
        return '';
    }
};

const compareRevisionMeta = (leftRevision, leftSource, rightRevision, rightSource) => {
    const cleanLeftRevision = Math.max(0, toNonNegativeInt(leftRevision, 0));
    const cleanRightRevision = Math.max(0, toNonNegativeInt(rightRevision, 0));
    if (cleanLeftRevision !== cleanRightRevision) return cleanLeftRevision - cleanRightRevision;
    const cleanLeftSource = toTrimmedString(leftSource, '', 120).trim();
    const cleanRightSource = toTrimmedString(rightSource, '', 120).trim();
    if (cleanLeftSource && cleanRightSource) return cleanLeftSource.localeCompare(cleanRightSource);
    if (cleanLeftSource) return 1;
    if (cleanRightSource) return -1;
    return 0;
};

const hashSeed = (seed = '') => {
    let hash = 0;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
};

const pickPeerColor = (seed = '') => PEER_COLORS[Math.abs(hashSeed(seed)) % PEER_COLORS.length];

const pickRevisionSeed = (seed = '') => Math.abs(hashSeed(seed)) % 1000;

const encodeBase64 = (bytes) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

const decodeBase64 = (value) => {
    const raw = atob(String(value || ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
        out[i] = raw.charCodeAt(i);
    }
    return out;
};

const fallbackSnapshot = () => ({
    activeSceneId: 'scene_1',
    scenes: [
        {
            id: 'scene_1',
            name: 'Scene 1',
            mapImageUrl: '',
            mapScale: 1,
            grid: {
                cellPx: DEFAULT_VTT_CELL_PX,
                offsetX: 0,
                offsetY: 0,
                cellDistance: 5
            },
            stealthMode: false,
            tokens: [],
            evidenceNotes: [],
            templates: [],
            fog: []
        }
    ],
    initiative: {
        entries: [],
        round: 1,
        activeEntryId: ''
    }
});

const normalizeTokenCoordinate = (value, fallback = 0) => {
    const parsed = toFiniteNumber(value, fallback);
    return Math.max(0, Math.round(parsed * TOKEN_COORD_PRECISION) / TOKEN_COORD_PRECISION);
};

const buildSnapshotSignature = (snapshot, coerceSnapshot) => stableStringify(coerceSnapshot(snapshot));

const hasVTTContent = (snapshot, coerceSnapshot) => (
    buildSnapshotSignature(snapshot, coerceSnapshot) !== buildSnapshotSignature(fallbackSnapshot(), coerceSnapshot)
);

const chooseCanonicalSnapshot = (entries = [], fallbackEntry = null, coerceSnapshot = (value) => value) => {
    const candidates = Array.isArray(entries)
        ? entries.filter((entry) => entry && entry.snapshot)
        : [];
    if (!candidates.length) return fallbackEntry;

    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
        const next = candidates[i];
        const bestHasContent = hasVTTContent(best.snapshot, coerceSnapshot);
        const nextHasContent = hasVTTContent(next.snapshot, coerceSnapshot);
        if (nextHasContent && !bestHasContent) {
            best = next;
            continue;
        }
        if (bestHasContent && !nextHasContent) continue;
        if ((next.stamp || 0) > (best.stamp || 0)) {
            best = next;
            continue;
        }
        if ((next.stamp || 0) === (best.stamp || 0) && (next.priority || 0) > (best.priority || 0)) {
            best = next;
        }
    }

    return best;
};

const sanitizePositionChange = (entry) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const sceneId = toTrimmedString(source.sceneId, '', 120).trim();
    const tokenId = toTrimmedString(source.tokenId, '', 120).trim();
    if (!sceneId || !tokenId) return null;
    return {
        sceneId,
        tokenId,
        x: normalizeTokenCoordinate(source.x, 0),
        y: normalizeTokenCoordinate(source.y, 0)
    };
};

const buildPositionChangeKey = (sceneId = '', tokenId = '') => {
    const cleanSceneId = toTrimmedString(sceneId, '', 120).trim();
    const cleanTokenId = toTrimmedString(tokenId, '', 120).trim();
    return cleanSceneId && cleanTokenId ? `${cleanSceneId}::${cleanTokenId}` : '';
};

const sameArray = (left = [], right = []) => (
    Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((entry, idx) => entry === right[idx])
);

const buildOrderedIds = (containerMap, orderArray, maxLen = 120) => {
    const ids = [];
    const seen = new Set();
    const ordered = orderArray instanceof Y.Array ? orderArray.toArray() : [];
    ordered.forEach((entry) => {
        const token = toTrimmedString(entry, '', maxLen).trim();
        if (!token || seen.has(token)) return;
        seen.add(token);
        ids.push(token);
    });
    if (containerMap instanceof Y.Map) {
        containerMap.forEach((_, key) => {
            const token = toTrimmedString(key, '', maxLen).trim();
            if (!token || seen.has(token)) return;
            seen.add(token);
            ids.push(token);
        });
    }
    return ids;
};

const removeExtraneousMapKeys = (map, allowedKeys = new Set()) => {
    if (!(map instanceof Y.Map)) return;
    Array.from(map.keys()).forEach((key) => {
        if (!allowedKeys.has(key)) map.delete(key);
    });
};

const ensureYMapEntry = (map, id) => {
    const existing = map.get(id);
    if (existing instanceof Y.Map) return existing;
    const next = new Y.Map();
    map.set(id, next);
    return next;
};

const ensureYArrayEntry = (map, id) => {
    const existing = map.get(id);
    if (existing instanceof Y.Array) return existing;
    const next = new Y.Array();
    map.set(id, next);
    return next;
};

const getYMapEntry = (map, id) => {
    const existing = map instanceof Y.Map ? map.get(id) : null;
    return existing instanceof Y.Map ? existing : null;
};

const getYArrayEntry = (map, id) => {
    const existing = map instanceof Y.Map ? map.get(id) : null;
    return existing instanceof Y.Array ? existing : null;
};

const setYScalar = (record, key, value) => {
    if (!(record instanceof Y.Map)) return false;
    if (record.get(key) === value) return false;
    record.set(key, value);
    return true;
};

const syncYStringArray = (target, values = [], maxLen = 120) => {
    if (!(target instanceof Y.Array)) return false;
    const desired = (Array.isArray(values) ? values : [])
        .map((entry) => toTrimmedString(entry, '', maxLen).trim())
        .filter(Boolean);
    const current = target.toArray().map((entry) => toTrimmedString(entry, '', maxLen).trim()).filter(Boolean);
    if (sameArray(current, desired)) return false;
    if (current.length) target.delete(0, current.length);
    if (desired.length) target.insert(0, desired);
    return true;
};

const syncOrderedEntityCollection = (containerMap, orderArray, items, syncRecord) => {
    const ids = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item, idx) => {
        const id = toTrimmedString(item && item.id, '', 120).trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
        const record = ensureYMapEntry(containerMap, id);
        syncRecord(record, item, idx);
    });
    syncYStringArray(orderArray, ids, 120);
    Array.from(containerMap.keys()).forEach((key) => {
        if (!seen.has(String(key))) containerMap.delete(key);
    });
};

const serializeOrderedEntityCollection = (containerMap, orderArray, serializeRecord) => {
    const ids = buildOrderedIds(containerMap, orderArray, 120);
    return ids.flatMap((id, idx) => {
        const record = containerMap instanceof Y.Map ? containerMap.get(id) : null;
        return record instanceof Y.Map ? [serializeRecord(record, id, idx)] : [];
    });
};

const syncYDefencesMap = (record, key, defences) => {
    const defencesMap = ensureYMapEntry(record, key);
    VTT_DEFENCE_KEYS.forEach((defenceKey) => {
        const nextValue = Object.prototype.hasOwnProperty.call(defences || {}, defenceKey)
            ? defences[defenceKey]
            : null;
        setYScalar(defencesMap, defenceKey, nextValue === undefined ? null : nextValue);
    });
    removeExtraneousMapKeys(defencesMap, new Set(VTT_DEFENCE_KEYS));
};

const serializeYDefencesMap = (record, key) => {
    const defencesMap = getYMapEntry(record, key);
    const out = {};
    VTT_DEFENCE_KEYS.forEach((defenceKey) => {
        out[defenceKey] = defencesMap instanceof Y.Map
            ? (defencesMap.get(defenceKey) ?? null)
            : null;
    });
    return out;
};

const syncYVisionMap = (record, key, vision) => {
    const visionMap = ensureYMapEntry(record, key);
    setYScalar(visionMap, 'enabled', !!(vision && vision.enabled));
    setYScalar(visionMap, 'facingDeg', vision && vision.facingDeg !== undefined ? vision.facingDeg : 0);
    setYScalar(visionMap, 'arcDeg', vision && vision.arcDeg !== undefined ? vision.arcDeg : 90);
    setYScalar(visionMap, 'baseRangeCells', vision && vision.baseRangeCells !== undefined ? vision.baseRangeCells : 6);
    setYScalar(visionMap, 'passivePerception', vision && vision.passivePerception !== undefined ? vision.passivePerception : 10);
    removeExtraneousMapKeys(visionMap, new Set(['enabled', 'facingDeg', 'arcDeg', 'baseRangeCells', 'passivePerception']));
};

const serializeYVisionMap = (record, key) => {
    const visionMap = getYMapEntry(record, key);
    return {
        enabled: !!(visionMap instanceof Y.Map ? visionMap.get('enabled') : true),
        facingDeg: visionMap instanceof Y.Map ? visionMap.get('facingDeg') : 0,
        arcDeg: visionMap instanceof Y.Map ? visionMap.get('arcDeg') : 90,
        baseRangeCells: visionMap instanceof Y.Map ? visionMap.get('baseRangeCells') : 6,
        passivePerception: visionMap instanceof Y.Map ? visionMap.get('passivePerception') : 10
    };
};

const syncYGridMap = (record, key, grid) => {
    const gridMap = ensureYMapEntry(record, key);
    setYScalar(gridMap, 'cellPx', grid && grid.cellPx !== undefined ? grid.cellPx : DEFAULT_VTT_CELL_PX);
    setYScalar(gridMap, 'offsetX', grid && grid.offsetX !== undefined ? grid.offsetX : 0);
    setYScalar(gridMap, 'offsetY', grid && grid.offsetY !== undefined ? grid.offsetY : 0);
    setYScalar(gridMap, 'cellDistance', grid && grid.cellDistance !== undefined ? grid.cellDistance : 5);
    removeExtraneousMapKeys(gridMap, new Set(['cellPx', 'offsetX', 'offsetY', 'cellDistance']));
};

const serializeYGridMap = (record, key) => {
    const gridMap = getYMapEntry(record, key);
    return {
        cellPx: gridMap instanceof Y.Map ? gridMap.get('cellPx') : DEFAULT_VTT_CELL_PX,
        offsetX: gridMap instanceof Y.Map ? gridMap.get('offsetX') : 0,
        offsetY: gridMap instanceof Y.Map ? gridMap.get('offsetY') : 0,
        cellDistance: gridMap instanceof Y.Map ? gridMap.get('cellDistance') : 5
    };
};

const syncYTokenRecord = (record, token) => {
    const source = token && typeof token === 'object' ? token : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'label', source.label || '');
    setYScalar(record, 'side', source.side || 'neutral');
    setYScalar(record, 'imageUrl', source.imageUrl || '');
    setYScalar(record, 'x', source.x);
    setYScalar(record, 'y', source.y);
    setYScalar(record, 'w', source.w);
    setYScalar(record, 'h', source.h);
    setYScalar(record, 'sourceType', source.sourceType || '');
    setYScalar(record, 'sourceId', source.sourceId || '');
    setYScalar(record, 'moveAccess', source.moveAccess || 'dm');
    setYScalar(record, 'hpCurrent', source.hpCurrent ?? null);
    setYScalar(record, 'hpMax', source.hpMax ?? null);
    setYScalar(record, 'ac', source.ac ?? null);
    setYScalar(record, 'passivePerception', source.passivePerception ?? null);
    setYScalar(record, 'hidden', !!source.hidden);
    setYScalar(record, 'stealthRoll', source.stealthRoll ?? null);
    syncYDefencesMap(record, 'defences', source.defences || {});
    syncYStringArray(ensureYArrayEntry(record, 'conditions'), Array.isArray(source.conditions) ? source.conditions.slice(0, 24) : [], 80);
    syncYVisionMap(record, 'vision', source.vision || {});
    removeExtraneousMapKeys(record, new Set([
        'id', 'label', 'side', 'imageUrl', 'x', 'y', 'w', 'h',
        'sourceType', 'sourceId', 'moveAccess', 'hpCurrent', 'hpMax',
        'ac', 'passivePerception', 'hidden', 'stealthRoll',
        'defences', 'conditions', 'vision'
    ]));
};

const serializeYTokenRecord = (record, tokenId) => ({
    id: toTrimmedString(record.get('id'), tokenId, 120).trim() || tokenId,
    label: toTrimmedString(record.get('label'), '', 160),
    side: toTrimmedString(record.get('side'), 'neutral', 20),
    imageUrl: toTrimmedString(record.get('imageUrl'), '', 4000),
    x: record.get('x'),
    y: record.get('y'),
    w: record.get('w'),
    h: record.get('h'),
    sourceType: toTrimmedString(record.get('sourceType'), '', 40),
    sourceId: toTrimmedString(record.get('sourceId'), '', 120),
    moveAccess: toTrimmedString(record.get('moveAccess'), 'dm', 20),
    hpCurrent: record.get('hpCurrent') ?? null,
    hpMax: record.get('hpMax') ?? null,
    ac: record.get('ac') ?? null,
    passivePerception: record.get('passivePerception') ?? null,
    defences: serializeYDefencesMap(record, 'defences'),
    conditions: getYArrayEntry(record, 'conditions') instanceof Y.Array
        ? getYArrayEntry(record, 'conditions').toArray()
        : [],
    hidden: !!record.get('hidden'),
    stealthRoll: record.get('stealthRoll') ?? null,
    vision: serializeYVisionMap(record, 'vision')
});

const syncYTemplateRecord = (record, template) => {
    const source = template && typeof template === 'object' ? template : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'kind', source.kind || 'circle');
    setYScalar(record, 'x', source.x);
    setYScalar(record, 'y', source.y);
    setYScalar(record, 'sizeCells', source.sizeCells);
    setYScalar(record, 'angleDeg', source.angleDeg);
    setYScalar(record, 'expiresAt', source.expiresAt);
    removeExtraneousMapKeys(record, new Set(['id', 'kind', 'x', 'y', 'sizeCells', 'angleDeg', 'expiresAt']));
};

const serializeYTemplateRecord = (record, templateId) => ({
    id: toTrimmedString(record.get('id'), templateId, 120).trim() || templateId,
    kind: toTrimmedString(record.get('kind'), 'circle', 20),
    x: record.get('x'),
    y: record.get('y'),
    sizeCells: record.get('sizeCells'),
    angleDeg: record.get('angleDeg'),
    expiresAt: record.get('expiresAt')
});

const syncYEvidenceNoteRecord = (record, note) => {
    const source = note && typeof note === 'object' ? note : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'category', source.category || 'evidence');
    setYScalar(record, 'title', source.title || '');
    setYScalar(record, 'body', source.body || '');
    setYScalar(record, 'x', source.x);
    setYScalar(record, 'y', source.y);
    setYScalar(record, 'w', source.w);
    setYScalar(record, 'h', source.h);
    setYScalar(record, 'hidden', !!source.hidden);
    setYScalar(record, 'highlightColor', source.highlightColor || '');
    removeExtraneousMapKeys(record, new Set(['id', 'category', 'title', 'body', 'x', 'y', 'w', 'h', 'hidden', 'highlightColor']));
};

const serializeYEvidenceNoteRecord = (record, noteId) => ({
    id: toTrimmedString(record.get('id'), noteId, 120).trim() || noteId,
    category: toTrimmedString(record.get('category'), 'evidence', 20),
    title: toTrimmedString(record.get('title'), '', 160),
    body: toTrimmedString(record.get('body'), '', 6000),
    x: record.get('x'),
    y: record.get('y'),
    w: record.get('w'),
    h: record.get('h'),
    hidden: !!record.get('hidden'),
    highlightColor: toTrimmedString(record.get('highlightColor'), '', 20)
});

const syncYFogRecord = (record, fog) => {
    const source = fog && typeof fog === 'object' ? fog : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'x', source.x);
    setYScalar(record, 'y', source.y);
    setYScalar(record, 'w', source.w);
    setYScalar(record, 'h', source.h);
    removeExtraneousMapKeys(record, new Set(['id', 'x', 'y', 'w', 'h']));
};

const serializeYFogRecord = (record, fogId) => ({
    id: toTrimmedString(record.get('id'), fogId, 120).trim() || fogId,
    x: record.get('x'),
    y: record.get('y'),
    w: record.get('w'),
    h: record.get('h')
});

const syncYSceneRecord = (record, scene) => {
    const source = scene && typeof scene === 'object' ? scene : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'name', source.name || '');
    setYScalar(record, 'mapImageUrl', source.mapImageUrl || '');
    setYScalar(record, 'mapScale', source.mapScale);
    setYScalar(record, 'stealthMode', !!source.stealthMode);
    syncYGridMap(record, 'grid', source.grid || {});
    syncOrderedEntityCollection(
        ensureYMapEntry(record, 'tokens'),
        ensureYArrayEntry(record, 'tokenOrder'),
        source.tokens,
        syncYTokenRecord
    );
    syncOrderedEntityCollection(
        ensureYMapEntry(record, 'templates'),
        ensureYArrayEntry(record, 'templateOrder'),
        source.templates,
        syncYTemplateRecord
    );
    syncOrderedEntityCollection(
        ensureYMapEntry(record, 'evidenceNotes'),
        ensureYArrayEntry(record, 'evidenceOrder'),
        source.evidenceNotes,
        syncYEvidenceNoteRecord
    );
    syncOrderedEntityCollection(
        ensureYMapEntry(record, 'fog'),
        ensureYArrayEntry(record, 'fogOrder'),
        source.fog,
        syncYFogRecord
    );
    removeExtraneousMapKeys(record, new Set([
        'id', 'name', 'mapImageUrl', 'mapScale', 'stealthMode',
        'grid', 'tokens', 'tokenOrder', 'templates', 'templateOrder',
        'evidenceNotes', 'evidenceOrder', 'fog', 'fogOrder'
    ]));
};

const serializeYSceneRecord = (record, sceneId) => ({
    id: toTrimmedString(record.get('id'), sceneId, 120).trim() || sceneId,
    name: toTrimmedString(record.get('name'), '', 160),
    mapImageUrl: toTrimmedString(record.get('mapImageUrl'), '', 4000),
    mapScale: record.get('mapScale'),
    grid: serializeYGridMap(record, 'grid'),
    stealthMode: !!record.get('stealthMode'),
    tokens: serializeOrderedEntityCollection(getYMapEntry(record, 'tokens'), getYArrayEntry(record, 'tokenOrder'), serializeYTokenRecord),
    templates: serializeOrderedEntityCollection(getYMapEntry(record, 'templates'), getYArrayEntry(record, 'templateOrder'), serializeYTemplateRecord),
    evidenceNotes: serializeOrderedEntityCollection(getYMapEntry(record, 'evidenceNotes'), getYArrayEntry(record, 'evidenceOrder'), serializeYEvidenceNoteRecord),
    fog: serializeOrderedEntityCollection(getYMapEntry(record, 'fog'), getYArrayEntry(record, 'fogOrder'), serializeYFogRecord)
});

const syncYInitiativeEntryRecord = (record, entry) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    setYScalar(record, 'id', toTrimmedString(source.id, '', 120).trim());
    setYScalar(record, 'name', source.name || '');
    setYScalar(record, 'linkedTokenId', source.linkedTokenId || '');
    setYScalar(record, 'side', source.side || 'neutral');
    setYScalar(record, 'imageUrl', source.imageUrl || '');
    setYScalar(record, 'sourceType', source.sourceType || '');
    setYScalar(record, 'sourceId', source.sourceId || '');
    setYScalar(record, 'total', source.total);
    setYScalar(record, 'tie', source.tie);
    setYScalar(record, 'hpCurrent', source.hpCurrent ?? null);
    setYScalar(record, 'hpMax', source.hpMax ?? null);
    setYScalar(record, 'ac', source.ac ?? null);
    setYScalar(record, 'passivePerception', source.passivePerception ?? null);
    setYScalar(record, 'stealthRoll', source.stealthRoll ?? null);
    setYScalar(record, 'reactionUsed', !!source.reactionUsed);
    setYScalar(record, 'concentrating', !!source.concentrating);
    setYScalar(record, 'hidden', !!source.hidden);
    syncYDefencesMap(record, 'defences', source.defences || {});
    syncYStringArray(ensureYArrayEntry(record, 'conditions'), Array.isArray(source.conditions) ? source.conditions.slice(0, 24) : [], 80);
    removeExtraneousMapKeys(record, new Set([
        'id', 'name', 'linkedTokenId', 'side', 'imageUrl', 'sourceType',
        'sourceId', 'total', 'tie', 'hpCurrent', 'hpMax', 'ac',
        'passivePerception', 'stealthRoll', 'reactionUsed', 'concentrating',
        'hidden', 'defences', 'conditions'
    ]));
};

const serializeYInitiativeEntryRecord = (record, entryId) => ({
    id: toTrimmedString(record.get('id'), entryId, 120).trim() || entryId,
    name: toTrimmedString(record.get('name'), '', 160),
    linkedTokenId: toTrimmedString(record.get('linkedTokenId'), '', 120),
    side: toTrimmedString(record.get('side'), 'neutral', 20),
    imageUrl: toTrimmedString(record.get('imageUrl'), '', 4000),
    sourceType: toTrimmedString(record.get('sourceType'), '', 40),
    sourceId: toTrimmedString(record.get('sourceId'), '', 120),
    total: record.get('total'),
    tie: record.get('tie'),
    hpCurrent: record.get('hpCurrent') ?? null,
    hpMax: record.get('hpMax') ?? null,
    ac: record.get('ac') ?? null,
    passivePerception: record.get('passivePerception') ?? null,
    stealthRoll: record.get('stealthRoll') ?? null,
    defences: serializeYDefencesMap(record, 'defences'),
    reactionUsed: !!record.get('reactionUsed'),
    concentrating: !!record.get('concentrating'),
    hidden: !!record.get('hidden'),
    conditions: getYArrayEntry(record, 'conditions') instanceof Y.Array
        ? getYArrayEntry(record, 'conditions').toArray()
        : []
});

const uniqueOrderedIds = (items = [], maxLen = 120) => {
    const ids = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const id = toTrimmedString(item && item.id, '', maxLen).trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    });
    return ids;
};

const patchYScalar = (record, key, baseValue, nextValue) => {
    if (baseValue === nextValue) return false;
    return setYScalar(record, key, nextValue);
};

const patchYStringArray = (target, baseValues = [], nextValues = [], maxLen = 120) => {
    const base = (Array.isArray(baseValues) ? baseValues : [])
        .map((entry) => toTrimmedString(entry, '', maxLen).trim())
        .filter(Boolean);
    const next = (Array.isArray(nextValues) ? nextValues : [])
        .map((entry) => toTrimmedString(entry, '', maxLen).trim())
        .filter(Boolean);
    if (sameArray(base, next)) return false;
    return syncYStringArray(target, next, maxLen);
};

const patchYDefencesMap = (record, key, baseDefences = {}, nextDefences = {}) => {
    if (stableStringify(baseDefences || {}) === stableStringify(nextDefences || {})) return false;
    syncYDefencesMap(record, key, nextDefences || {});
    return true;
};

const patchYVisionMap = (record, key, baseVision = {}, nextVision = {}) => {
    if (stableStringify(baseVision || {}) === stableStringify(nextVision || {})) return false;
    syncYVisionMap(record, key, nextVision || {});
    return true;
};

const patchYGridMap = (record, key, baseGrid = {}, nextGrid = {}) => {
    if (stableStringify(baseGrid || {}) === stableStringify(nextGrid || {})) return false;
    syncYGridMap(record, key, nextGrid || {});
    return true;
};

const patchYTokenRecord = (record, baseToken = {}, nextToken = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseToken.id, nextToken.id) || mutated;
    mutated = patchYScalar(record, 'label', baseToken.label, nextToken.label) || mutated;
    mutated = patchYScalar(record, 'side', baseToken.side, nextToken.side) || mutated;
    mutated = patchYScalar(record, 'imageUrl', baseToken.imageUrl, nextToken.imageUrl) || mutated;
    mutated = patchYScalar(record, 'x', baseToken.x, nextToken.x) || mutated;
    mutated = patchYScalar(record, 'y', baseToken.y, nextToken.y) || mutated;
    mutated = patchYScalar(record, 'w', baseToken.w, nextToken.w) || mutated;
    mutated = patchYScalar(record, 'h', baseToken.h, nextToken.h) || mutated;
    mutated = patchYScalar(record, 'sourceType', baseToken.sourceType, nextToken.sourceType) || mutated;
    mutated = patchYScalar(record, 'sourceId', baseToken.sourceId, nextToken.sourceId) || mutated;
    mutated = patchYScalar(record, 'moveAccess', baseToken.moveAccess, nextToken.moveAccess) || mutated;
    mutated = patchYScalar(record, 'hpCurrent', baseToken.hpCurrent, nextToken.hpCurrent) || mutated;
    mutated = patchYScalar(record, 'hpMax', baseToken.hpMax, nextToken.hpMax) || mutated;
    mutated = patchYScalar(record, 'ac', baseToken.ac, nextToken.ac) || mutated;
    mutated = patchYScalar(record, 'passivePerception', baseToken.passivePerception, nextToken.passivePerception) || mutated;
    mutated = patchYScalar(record, 'hidden', !!baseToken.hidden, !!nextToken.hidden) || mutated;
    mutated = patchYScalar(record, 'stealthRoll', baseToken.stealthRoll, nextToken.stealthRoll) || mutated;
    mutated = patchYDefencesMap(record, 'defences', baseToken.defences || {}, nextToken.defences || {}) || mutated;
    mutated = patchYStringArray(
        ensureYArrayEntry(record, 'conditions'),
        baseToken.conditions || [],
        nextToken.conditions || [],
        80
    ) || mutated;
    mutated = patchYVisionMap(record, 'vision', baseToken.vision || {}, nextToken.vision || {}) || mutated;
    return mutated;
};

const patchYTemplateRecord = (record, baseTemplate = {}, nextTemplate = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseTemplate.id, nextTemplate.id) || mutated;
    mutated = patchYScalar(record, 'kind', baseTemplate.kind, nextTemplate.kind) || mutated;
    mutated = patchYScalar(record, 'x', baseTemplate.x, nextTemplate.x) || mutated;
    mutated = patchYScalar(record, 'y', baseTemplate.y, nextTemplate.y) || mutated;
    mutated = patchYScalar(record, 'sizeCells', baseTemplate.sizeCells, nextTemplate.sizeCells) || mutated;
    mutated = patchYScalar(record, 'angleDeg', baseTemplate.angleDeg, nextTemplate.angleDeg) || mutated;
    mutated = patchYScalar(record, 'expiresAt', baseTemplate.expiresAt, nextTemplate.expiresAt) || mutated;
    return mutated;
};

const patchYEvidenceNoteRecord = (record, baseNote = {}, nextNote = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseNote.id, nextNote.id) || mutated;
    mutated = patchYScalar(record, 'category', baseNote.category, nextNote.category) || mutated;
    mutated = patchYScalar(record, 'title', baseNote.title, nextNote.title) || mutated;
    mutated = patchYScalar(record, 'body', baseNote.body, nextNote.body) || mutated;
    mutated = patchYScalar(record, 'x', baseNote.x, nextNote.x) || mutated;
    mutated = patchYScalar(record, 'y', baseNote.y, nextNote.y) || mutated;
    mutated = patchYScalar(record, 'w', baseNote.w, nextNote.w) || mutated;
    mutated = patchYScalar(record, 'h', baseNote.h, nextNote.h) || mutated;
    mutated = patchYScalar(record, 'hidden', !!baseNote.hidden, !!nextNote.hidden) || mutated;
    mutated = patchYScalar(record, 'highlightColor', baseNote.highlightColor, nextNote.highlightColor) || mutated;
    return mutated;
};

const patchYFogRecord = (record, baseFog = {}, nextFog = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseFog.id, nextFog.id) || mutated;
    mutated = patchYScalar(record, 'x', baseFog.x, nextFog.x) || mutated;
    mutated = patchYScalar(record, 'y', baseFog.y, nextFog.y) || mutated;
    mutated = patchYScalar(record, 'w', baseFog.w, nextFog.w) || mutated;
    mutated = patchYScalar(record, 'h', baseFog.h, nextFog.h) || mutated;
    return mutated;
};

const mergeOrderForPatch = (currentIds = [], baseIds = [], nextIds = []) => {
    const desired = [];
    const seen = new Set();
    (Array.isArray(nextIds) ? nextIds : []).forEach((id) => {
        const cleanId = toTrimmedString(id, '', 120).trim();
        if (!cleanId || seen.has(cleanId)) return;
        seen.add(cleanId);
        desired.push(cleanId);
    });
    const baseSet = new Set(
        (Array.isArray(baseIds) ? baseIds : [])
            .map((id) => toTrimmedString(id, '', 120).trim())
            .filter(Boolean)
    );
    const extras = [];
    (Array.isArray(currentIds) ? currentIds : []).forEach((id) => {
        const cleanId = toTrimmedString(id, '', 120).trim();
        if (!cleanId || seen.has(cleanId) || baseSet.has(cleanId)) return;
        seen.add(cleanId);
        extras.push(cleanId);
    });
    return desired.concat(extras);
};

const patchOrderedEntityCollection = ({
    containerMap,
    orderArray,
    baseItems,
    nextItems,
    syncRecord,
    patchRecord
}) => {
    const baseList = Array.isArray(baseItems) ? baseItems : [];
    const nextList = Array.isArray(nextItems) ? nextItems : [];
    const baseMap = new Map(uniqueOrderedIds(baseList).map((id) => [
        id,
        baseList.find((item) => toTrimmedString(item && item.id, '', 120).trim() === id)
    ]));
    const nextMap = new Map(uniqueOrderedIds(nextList).map((id) => [
        id,
        nextList.find((item) => toTrimmedString(item && item.id, '', 120).trim() === id)
    ]));
    let mutated = false;

    baseMap.forEach((_, id) => {
        if (nextMap.has(id) || !(containerMap instanceof Y.Map) || !containerMap.has(id)) return;
        containerMap.delete(id);
        mutated = true;
    });

    nextMap.forEach((nextItem, id) => {
        if (!(containerMap instanceof Y.Map)) return;
        const existing = containerMap.get(id);
        const baseItem = baseMap.get(id);
        if (!(existing instanceof Y.Map)) {
            const record = ensureYMapEntry(containerMap, id);
            syncRecord(record, nextItem);
            mutated = true;
            return;
        }
        if (!baseItem) {
            syncRecord(existing, nextItem);
            mutated = true;
            return;
        }
        mutated = patchRecord(existing, baseItem, nextItem) || mutated;
    });

    const baseOrder = uniqueOrderedIds(baseList);
    const nextOrder = uniqueOrderedIds(nextList);
    if (!sameArray(baseOrder, nextOrder)) {
        const currentOrder = buildOrderedIds(containerMap, orderArray, 120);
        const mergedOrder = mergeOrderForPatch(currentOrder, baseOrder, nextOrder);
        mutated = syncYStringArray(orderArray, mergedOrder, 120) || mutated;
    }

    return mutated;
};

const patchYSceneRecord = (record, baseScene = {}, nextScene = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseScene.id, nextScene.id) || mutated;
    mutated = patchYScalar(record, 'name', baseScene.name, nextScene.name) || mutated;
    mutated = patchYScalar(record, 'mapImageUrl', baseScene.mapImageUrl, nextScene.mapImageUrl) || mutated;
    mutated = patchYScalar(record, 'mapScale', baseScene.mapScale, nextScene.mapScale) || mutated;
    mutated = patchYScalar(record, 'stealthMode', !!baseScene.stealthMode, !!nextScene.stealthMode) || mutated;
    mutated = patchYGridMap(record, 'grid', baseScene.grid || {}, nextScene.grid || {}) || mutated;
    mutated = patchOrderedEntityCollection({
        containerMap: ensureYMapEntry(record, 'tokens'),
        orderArray: ensureYArrayEntry(record, 'tokenOrder'),
        baseItems: baseScene.tokens || [],
        nextItems: nextScene.tokens || [],
        syncRecord: syncYTokenRecord,
        patchRecord: patchYTokenRecord
    }) || mutated;
    mutated = patchOrderedEntityCollection({
        containerMap: ensureYMapEntry(record, 'templates'),
        orderArray: ensureYArrayEntry(record, 'templateOrder'),
        baseItems: baseScene.templates || [],
        nextItems: nextScene.templates || [],
        syncRecord: syncYTemplateRecord,
        patchRecord: patchYTemplateRecord
    }) || mutated;
    mutated = patchOrderedEntityCollection({
        containerMap: ensureYMapEntry(record, 'evidenceNotes'),
        orderArray: ensureYArrayEntry(record, 'evidenceOrder'),
        baseItems: baseScene.evidenceNotes || [],
        nextItems: nextScene.evidenceNotes || [],
        syncRecord: syncYEvidenceNoteRecord,
        patchRecord: patchYEvidenceNoteRecord
    }) || mutated;
    mutated = patchOrderedEntityCollection({
        containerMap: ensureYMapEntry(record, 'fog'),
        orderArray: ensureYArrayEntry(record, 'fogOrder'),
        baseItems: baseScene.fog || [],
        nextItems: nextScene.fog || [],
        syncRecord: syncYFogRecord,
        patchRecord: patchYFogRecord
    }) || mutated;
    return mutated;
};

const patchYInitiativeEntryRecord = (record, baseEntry = {}, nextEntry = {}) => {
    let mutated = false;
    mutated = patchYScalar(record, 'id', baseEntry.id, nextEntry.id) || mutated;
    mutated = patchYScalar(record, 'name', baseEntry.name, nextEntry.name) || mutated;
    mutated = patchYScalar(record, 'linkedTokenId', baseEntry.linkedTokenId, nextEntry.linkedTokenId) || mutated;
    mutated = patchYScalar(record, 'side', baseEntry.side, nextEntry.side) || mutated;
    mutated = patchYScalar(record, 'imageUrl', baseEntry.imageUrl, nextEntry.imageUrl) || mutated;
    mutated = patchYScalar(record, 'sourceType', baseEntry.sourceType, nextEntry.sourceType) || mutated;
    mutated = patchYScalar(record, 'sourceId', baseEntry.sourceId, nextEntry.sourceId) || mutated;
    mutated = patchYScalar(record, 'total', baseEntry.total, nextEntry.total) || mutated;
    mutated = patchYScalar(record, 'tie', baseEntry.tie, nextEntry.tie) || mutated;
    mutated = patchYScalar(record, 'hpCurrent', baseEntry.hpCurrent, nextEntry.hpCurrent) || mutated;
    mutated = patchYScalar(record, 'hpMax', baseEntry.hpMax, nextEntry.hpMax) || mutated;
    mutated = patchYScalar(record, 'ac', baseEntry.ac, nextEntry.ac) || mutated;
    mutated = patchYScalar(record, 'passivePerception', baseEntry.passivePerception, nextEntry.passivePerception) || mutated;
    mutated = patchYScalar(record, 'stealthRoll', baseEntry.stealthRoll, nextEntry.stealthRoll) || mutated;
    mutated = patchYScalar(record, 'reactionUsed', !!baseEntry.reactionUsed, !!nextEntry.reactionUsed) || mutated;
    mutated = patchYScalar(record, 'concentrating', !!baseEntry.concentrating, !!nextEntry.concentrating) || mutated;
    mutated = patchYScalar(record, 'hidden', !!baseEntry.hidden, !!nextEntry.hidden) || mutated;
    mutated = patchYDefencesMap(record, 'defences', baseEntry.defences || {}, nextEntry.defences || {}) || mutated;
    mutated = patchYStringArray(
        ensureYArrayEntry(record, 'conditions'),
        baseEntry.conditions || [],
        nextEntry.conditions || [],
        80
    ) || mutated;
    return mutated;
};

const applySnapshotToDoc = (doc, payload, coerceSnapshot, origin, stamp = Date.now()) => {
    const clean = coerceSnapshot(payload);
    const metaMap = doc.getMap('meta');
    const scenesMap = doc.getMap('scenes');
    const sceneOrder = doc.getArray('sceneOrder');
    const initiativeMeta = doc.getMap('initiativeMeta');
    const initiativeEntries = doc.getMap('initiativeEntries');
    const initiativeOrder = doc.getArray('initiativeOrder');

    doc.transact(() => {
        setYScalar(metaMap, 'activeSceneId', toTrimmedString(clean.activeSceneId, '', 120).trim());
        setYScalar(metaMap, 'updatedAt', Math.max(0, toNonNegativeInt(stamp, Date.now()) || Date.now()));
        syncOrderedEntityCollection(scenesMap, sceneOrder, clean.scenes, syncYSceneRecord);
        syncOrderedEntityCollection(initiativeEntries, initiativeOrder, clean.initiative.entries, syncYInitiativeEntryRecord);
        setYScalar(initiativeMeta, 'round', Math.max(1, toNonNegativeInt(clean.initiative.round, 1) || 1));
        setYScalar(initiativeMeta, 'activeEntryId', toTrimmedString(clean.initiative.activeEntryId, '', 120).trim());
        removeExtraneousMapKeys(initiativeMeta, new Set(['round', 'activeEntryId']));
        removeExtraneousMapKeys(metaMap, new Set(['activeSceneId', 'updatedAt']));
    }, origin);
};

const applySnapshotDeltaToDoc = (doc, baseSnapshot, nextSnapshot, coerceSnapshot, origin, stamp = Date.now()) => {
    const base = coerceSnapshot(baseSnapshot);
    const next = coerceSnapshot(nextSnapshot);
    const metaMap = doc.getMap('meta');
    const scenesMap = doc.getMap('scenes');
    const sceneOrder = doc.getArray('sceneOrder');
    const initiativeMeta = doc.getMap('initiativeMeta');
    const initiativeEntries = doc.getMap('initiativeEntries');
    const initiativeOrder = doc.getArray('initiativeOrder');
    const baseScenes = Array.isArray(base.scenes) ? base.scenes : [];
    const nextScenes = Array.isArray(next.scenes) ? next.scenes : [];
    const baseSceneMap = new Map(uniqueOrderedIds(baseScenes).map((id) => [
        id,
        baseScenes.find((scene) => toTrimmedString(scene && scene.id, '', 120).trim() === id)
    ]));
    const nextSceneMap = new Map(uniqueOrderedIds(nextScenes).map((id) => [
        id,
        nextScenes.find((scene) => toTrimmedString(scene && scene.id, '', 120).trim() === id)
    ]));
    let mutated = false;

    doc.transact(() => {
        mutated = patchYScalar(
            metaMap,
            'activeSceneId',
            toTrimmedString(base.activeSceneId, '', 120).trim(),
            toTrimmedString(next.activeSceneId, '', 120).trim()
        ) || mutated;

        baseSceneMap.forEach((_, sceneId) => {
            if (nextSceneMap.has(sceneId) || !scenesMap.has(sceneId)) return;
            scenesMap.delete(sceneId);
            mutated = true;
        });

        nextSceneMap.forEach((nextScene, sceneId) => {
            const existing = scenesMap.get(sceneId);
            const baseScene = baseSceneMap.get(sceneId);
            if (!(existing instanceof Y.Map)) {
                const record = ensureYMapEntry(scenesMap, sceneId);
                syncYSceneRecord(record, nextScene);
                mutated = true;
                return;
            }
            if (!baseScene) {
                syncYSceneRecord(existing, nextScene);
                mutated = true;
                return;
            }
            mutated = patchYSceneRecord(existing, baseScene, nextScene) || mutated;
        });

        const baseSceneOrder = uniqueOrderedIds(baseScenes);
        const nextSceneOrder = uniqueOrderedIds(nextScenes);
        if (!sameArray(baseSceneOrder, nextSceneOrder)) {
            const mergedSceneOrder = mergeOrderForPatch(
                buildOrderedIds(scenesMap, sceneOrder, 120),
                baseSceneOrder,
                nextSceneOrder
            );
            mutated = syncYStringArray(sceneOrder, mergedSceneOrder, 120) || mutated;
        }

        const baseInitiativeEntries = Array.isArray(base.initiative && base.initiative.entries) ? base.initiative.entries : [];
        const nextInitiativeEntries = Array.isArray(next.initiative && next.initiative.entries) ? next.initiative.entries : [];
        mutated = patchOrderedEntityCollection({
            containerMap: initiativeEntries,
            orderArray: initiativeOrder,
            baseItems: baseInitiativeEntries,
            nextItems: nextInitiativeEntries,
            syncRecord: syncYInitiativeEntryRecord,
            patchRecord: patchYInitiativeEntryRecord
        }) || mutated;

        mutated = patchYScalar(
            initiativeMeta,
            'round',
            Math.max(1, toNonNegativeInt(base.initiative && base.initiative.round, 1) || 1),
            Math.max(1, toNonNegativeInt(next.initiative && next.initiative.round, 1) || 1)
        ) || mutated;
        mutated = patchYScalar(
            initiativeMeta,
            'activeEntryId',
            toTrimmedString(base.initiative && base.initiative.activeEntryId, '', 120).trim(),
            toTrimmedString(next.initiative && next.initiative.activeEntryId, '', 120).trim()
        ) || mutated;

        if (mutated) {
            setYScalar(metaMap, 'updatedAt', Math.max(0, toNonNegativeInt(stamp, Date.now()) || Date.now()));
        }
    }, origin);

    return mutated;
};

const serializeDocSnapshot = (doc, coerceSnapshot) => {
    const metaMap = doc.getMap('meta');
    const scenesMap = doc.getMap('scenes');
    const sceneOrder = doc.getArray('sceneOrder');
    const initiativeMeta = doc.getMap('initiativeMeta');
    const initiativeEntries = doc.getMap('initiativeEntries');
    const initiativeOrder = doc.getArray('initiativeOrder');
    const scenes = serializeOrderedEntityCollection(scenesMap, sceneOrder, serializeYSceneRecord);
    const activeSceneId = toTrimmedString(
        metaMap.get('activeSceneId'),
        scenes[0] && scenes[0].id ? scenes[0].id : 'scene_1',
        120
    ).trim() || (scenes[0] && scenes[0].id ? scenes[0].id : 'scene_1');
    return coerceSnapshot({
        activeSceneId,
        scenes,
        initiative: {
            entries: serializeOrderedEntityCollection(initiativeEntries, initiativeOrder, serializeYInitiativeEntryRecord),
            round: initiativeMeta.get('round'),
            activeEntryId: toTrimmedString(initiativeMeta.get('activeEntryId'), '', 120).trim()
        }
    });
};

const getDocUpdatedAt = (doc) => {
    const metaMap = doc.getMap('meta');
    return Math.max(0, toNonNegativeInt(metaMap.get('updatedAt'), 0));
};

const applyTokenPositionChangesToDoc = (doc, changes, origin, stamp = Date.now()) => {
    const metaMap = doc.getMap('meta');
    const scenesMap = doc.getMap('scenes');
    const applied = [];

    doc.transact(() => {
        (Array.isArray(changes) ? changes : []).forEach((entry) => {
            const change = sanitizePositionChange(entry);
            if (!change) return;
            const sceneRecord = scenesMap.get(change.sceneId);
            if (!(sceneRecord instanceof Y.Map)) return;
            const tokensMap = getYMapEntry(sceneRecord, 'tokens');
            if (!(tokensMap instanceof Y.Map)) return;
            const tokenRecord = tokensMap.get(change.tokenId);
            if (!(tokenRecord instanceof Y.Map)) return;
            const nextX = normalizeTokenCoordinate(change.x, tokenRecord.get('x'));
            const nextY = normalizeTokenCoordinate(change.y, tokenRecord.get('y'));
            const currentX = normalizeTokenCoordinate(tokenRecord.get('x'), nextX);
            const currentY = normalizeTokenCoordinate(tokenRecord.get('y'), nextY);
            if (currentX === nextX && currentY === nextY) return;
            setYScalar(tokenRecord, 'x', nextX);
            setYScalar(tokenRecord, 'y', nextY);
            applied.push({
                sceneId: change.sceneId,
                tokenId: change.tokenId,
                x: nextX,
                y: nextY
            });
        });
        if (applied.length) {
            setYScalar(metaMap, 'updatedAt', Math.max(0, toNonNegativeInt(stamp, Date.now()) || Date.now()));
        }
    }, origin);

    return applied;
};

const compareOrderedIdLists = (left = [], right = []) => (
    left.length === right.length
    && left.every((entry, idx) => entry === right[idx])
);

const compareOrderedEntityCollections = (left = [], right = []) => {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let i = 0; i < right.length; i += 1) {
        const next = right[i];
        const previous = left[i];
        if (!previous || !next || previous.id !== next.id) return false;
        if (stableStringify(previous) !== stableStringify(next)) return false;
    }
    return true;
};

const diffVTTSnapshots = (previousSnapshot, nextSnapshot, coerceSnapshot) => {
    const previous = coerceSnapshot(previousSnapshot);
    const next = coerceSnapshot(nextSnapshot);
    if (previous.activeSceneId !== next.activeSceneId) {
        return { structural: true, positions: [] };
    }

    const previousEntries = Array.isArray(previous.initiative && previous.initiative.entries) ? previous.initiative.entries : [];
    const nextEntries = Array.isArray(next.initiative && next.initiative.entries) ? next.initiative.entries : [];
    if ((previous.initiative && previous.initiative.round) !== (next.initiative && next.initiative.round)
        || String(previous.initiative && previous.initiative.activeEntryId || '') !== String(next.initiative && next.initiative.activeEntryId || '')
        || !compareOrderedEntityCollections(previousEntries, nextEntries)) {
        return { structural: true, positions: [] };
    }

    const previousScenes = Array.isArray(previous.scenes) ? previous.scenes : [];
    const nextScenes = Array.isArray(next.scenes) ? next.scenes : [];
    const previousSceneIds = previousScenes.map((scene) => String(scene && scene.id || '').trim()).filter(Boolean);
    const nextSceneIds = nextScenes.map((scene) => String(scene && scene.id || '').trim()).filter(Boolean);
    if (!compareOrderedIdLists(previousSceneIds, nextSceneIds)) {
        return { structural: true, positions: [] };
    }

    const previousSceneMap = new Map(previousScenes.map((scene) => [String(scene && scene.id || '').trim(), scene]));
    const positions = [];

    for (let i = 0; i < nextScenes.length; i += 1) {
        const scene = nextScenes[i];
        const sceneId = String(scene && scene.id || '').trim();
        const previousScene = previousSceneMap.get(sceneId);
        if (!previousScene) return { structural: true, positions: [] };
        const sceneComparable = {
            id: sceneId,
            name: scene && scene.name,
            mapImageUrl: scene && scene.mapImageUrl,
            mapScale: scene && scene.mapScale,
            grid: scene && scene.grid,
            stealthMode: !!(scene && scene.stealthMode)
        };
        const previousSceneComparable = {
            id: sceneId,
            name: previousScene && previousScene.name,
            mapImageUrl: previousScene && previousScene.mapImageUrl,
            mapScale: previousScene && previousScene.mapScale,
            grid: previousScene && previousScene.grid,
            stealthMode: !!(previousScene && previousScene.stealthMode)
        };
        if (stableStringify(previousSceneComparable) !== stableStringify(sceneComparable)) {
            return { structural: true, positions: [] };
        }
        if (!compareOrderedEntityCollections(previousScene && previousScene.templates || [], scene && scene.templates || [])
            || !compareOrderedEntityCollections(previousScene && previousScene.evidenceNotes || [], scene && scene.evidenceNotes || [])
            || !compareOrderedEntityCollections(previousScene && previousScene.fog || [], scene && scene.fog || [])) {
            return { structural: true, positions: [] };
        }

        const previousTokens = Array.isArray(previousScene && previousScene.tokens) ? previousScene.tokens : [];
        const nextTokens = Array.isArray(scene && scene.tokens) ? scene.tokens : [];
        const previousTokenIds = previousTokens.map((token) => String(token && token.id || '').trim()).filter(Boolean);
        const nextTokenIds = nextTokens.map((token) => String(token && token.id || '').trim()).filter(Boolean);
        if (!compareOrderedIdLists(previousTokenIds, nextTokenIds)) {
            return { structural: true, positions: [] };
        }
        const previousTokenMap = new Map(previousTokens.map((token) => [String(token && token.id || '').trim(), token]));
        for (let tokenIdx = 0; tokenIdx < nextTokens.length; tokenIdx += 1) {
            const token = nextTokens[tokenIdx];
            const tokenId = String(token && token.id || '').trim();
            const previousToken = previousTokenMap.get(tokenId);
            if (!previousToken) return { structural: true, positions: [] };
            const previousComparable = { ...previousToken };
            const nextComparable = { ...token };
            delete previousComparable.x;
            delete previousComparable.y;
            delete nextComparable.x;
            delete nextComparable.y;
            if (stableStringify(previousComparable) !== stableStringify(nextComparable)) {
                return { structural: true, positions: [] };
            }
            const previousX = normalizeTokenCoordinate(previousToken.x, 0);
            const previousY = normalizeTokenCoordinate(previousToken.y, 0);
            const nextX = normalizeTokenCoordinate(token.x, previousX);
            const nextY = normalizeTokenCoordinate(token.y, previousY);
            if (previousX !== nextX || previousY !== nextY) {
                positions.push({
                    sceneId,
                    tokenId,
                    x: nextX,
                    y: nextY
                });
            }
        }
    }

    return {
        structural: false,
        positions
    };
};

class VTTCollabSession {
    constructor(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        this.options = opts;
        this.roomId = toTrimmedString(opts.roomId, '', 160).trim();
        this.caseId = toTrimmedString(opts.caseId, DEFAULT_CASE_ID, 120).trim() || DEFAULT_CASE_ID;
        this.store = opts.store || null;
        this.doc = new Y.Doc();
        this.awareness = new Awareness(this.doc);
        this.persistence = null;
        this.client = null;
        this.channel = null;
        this.connectConfig = null;
        this.connected = false;
        this.ready = false;
        this.destroyed = false;
        this.instanceId = '';
        this.userId = '';
        this.profileName = '';
        this.peerColor = '';
        this.instanceRevisionSeed = 0;
        this.indexedDbName = '';
        this.lastSavedRevision = 0;
        this.lastSnapshotSource = '';
        this.lastSharedStoreSignature = '';
        this.lastCloudSnapshotSignature = '';
        this.lastTrackedPresenceKey = '';
        this.pendingMirrorTimer = null;
        this.pendingFlushTimer = null;
        this.pendingFlushPromise = null;
        this.pendingReadyFlush = false;
        this.pendingReconnectTimer = null;
        this.periodicSyncTimer = null;
        this.flushQueuedWhilePending = false;
        this.reconnectAttempts = 0;
        this.pendingSnapshot = null;
        this.lastSnapshot = this.coerceSnapshot(
            typeof this.options.getSeedPayload === 'function'
                ? this.options.getSeedPayload()
                : fallbackSnapshot()
        );
        this.remotePresence = new Map();
        this.status = {
            state: 'local',
            detail: 'Shared sync is unavailable on this page.',
            peerCount: 0,
            connected: false,
            ready: false
        };

        this.originBootstrap = { kind: 'vtt-collab-bootstrap' };
        this.originLocalSnapshot = { kind: 'vtt-collab-local-snapshot' };
        this.originPosition = { kind: 'vtt-collab-local-position' };
        this.originRemoteSync = { kind: 'vtt-collab-remote-sync' };
        this.originRemoteRestore = { kind: 'vtt-collab-remote-restore' };
        this.originSharedStore = { kind: 'vtt-collab-shared-store' };
        this.originManualFlush = { kind: 'vtt-collab-manual-flush' };

        this.handleDocUpdate = this.handleDocUpdate.bind(this);
        this.handleAfterTransaction = this.handleAfterTransaction.bind(this);
        this.handleAwarenessUpdate = this.handleAwarenessUpdate.bind(this);
        this.handleAwarenessChange = this.handleAwarenessChange.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }

    static async create(options = {}) {
        const session = new VTTCollabSession(options);
        await session.init();
        return session;
    }

    coerceSnapshot(payload) {
        if (this.store && typeof this.store.normalizeVTTStateSnapshot === 'function') {
            try {
                return this.store.normalizeVTTStateSnapshot(payload);
            } catch (err) {
                console.warn('RTF_VTT_COLLAB: Store snapshot normalization failed', err);
            }
        }
        return deepClone(payload && typeof payload === 'object' ? payload : fallbackSnapshot());
    }

    updateStatus(next = {}) {
        const patch = next && typeof next === 'object' ? next : {};
        const peerCount = Number.isFinite(patch.peerCount) ? Math.max(0, patch.peerCount) : this.remotePresence.size;
        this.status = {
            ...this.status,
            ...patch,
            peerCount,
            connected: !!this.connected,
            ready: !!this.ready
        };
        if (typeof this.options.onStatusChange === 'function') {
            try {
                this.options.onStatusChange({ ...this.status });
            } catch (err) {
                console.warn('RTF_VTT_COLLAB: Status callback failed', err);
            }
        }
    }

    applyRevisionState(revision, sourceId = '') {
        const cleanRevision = Math.max(0, toNonNegativeInt(revision, 0));
        const cleanSource = toTrimmedString(sourceId, '', 120).trim();
        if (compareRevisionMeta(cleanRevision, cleanSource, this.lastSavedRevision, this.lastSnapshotSource) < 0) {
            return false;
        }
        this.lastSavedRevision = cleanRevision;
        if (cleanSource || !this.lastSnapshotSource) {
            this.lastSnapshotSource = cleanSource;
        }
        return true;
    }

    nextLocalRevision() {
        const wallClockRevision = (Math.max(0, Date.now()) * 1000) + Math.max(0, toNonNegativeInt(this.instanceRevisionSeed, 0));
        return Math.max(1, wallClockRevision, this.lastSavedRevision + 1);
    }

    getSharedStoreUpdatedAt() {
        if (this.store && typeof this.store.getVTTStateUpdatedAt === 'function') {
            return Math.max(0, toNonNegativeInt(this.store.getVTTStateUpdatedAt(this.caseId), 0));
        }
        try {
            const scope = `cases.${this.caseId}.vtt`;
            const meta = this.store && this.store.state && this.store.state.meta && this.store.state.meta.scopeUpdated;
            return Math.max(0, toNonNegativeInt(meta && meta[scope], 0));
        } catch (err) {
            return 0;
        }
    }

    buildLocalPresence() {
        const snapshot = this.pendingSnapshot || this.lastSnapshot;
        return {
            instanceId: this.instanceId,
            userId: this.userId || '',
            profileName: this.profileName || 'Player',
            color: this.peerColor,
            roomId: this.roomId,
            caseId: this.caseId,
            activeSceneId: snapshot && snapshot.activeSceneId ? String(snapshot.activeSceneId) : '',
            ts: Date.now()
        };
    }

    async init() {
        if (!this.roomId || !this.store || typeof this.store.ensureRealtimeCollabClient !== 'function') {
            this.updateStatus({
                state: 'local',
                detail: 'Shared sync is unavailable on this page.',
                peerCount: 0
            });
            return this;
        }

        this.updateStatus({
            state: 'connecting',
            detail: 'Connecting live VTT...',
            peerCount: 0
        });

        const ensured = await this.store.ensureRealtimeCollabClient();
        if (!ensured.ok || !ensured.client) {
            this.updateStatus({
                state: 'local',
                detail: 'Shared sync is off. VTT changes stay on this device.',
                peerCount: 0
            });
            return this;
        }

        this.client = ensured.client;
        this.connectConfig = ensured.config || null;
        this.instanceId = toTrimmedString(ensured.instanceId, '', 120).trim();
        this.userId = toTrimmedString(ensured.userId, '', 120).trim();
        this.profileName = toTrimmedString(ensured.profileName, '', 120).trim();
        this.peerColor = pickPeerColor(this.instanceId || this.profileName || this.roomId);
        this.instanceRevisionSeed = pickRevisionSeed(this.instanceId || this.userId || this.profileName || this.roomId);
        this.indexedDbName = `rtf-vtt-room-${ensured.config.campaignId}-${this.roomId}`;

        this.doc.on('update', this.handleDocUpdate);
        this.doc.on('afterTransaction', this.handleAfterTransaction);
        this.awareness.on('update', this.handleAwarenessUpdate);
        this.awareness.on('change', this.handleAwarenessChange);
        this.awareness.setLocalState({
            user: this.buildLocalPresence()
        });

        this.persistence = new IndexeddbPersistence(this.indexedDbName, this.doc);
        try {
            await this.persistence.whenSynced;
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: IndexedDB sync failed', err);
        }

        const localDocPayload = serializeDocSnapshot(this.doc, this.coerceSnapshot.bind(this));
        const localDocStamp = getDocUpdatedAt(this.doc);
        const seedPayload = this.coerceSnapshot(
            typeof this.options.getSeedPayload === 'function'
                ? this.options.getSeedPayload()
                : fallbackSnapshot()
        );
        const currentPayload = this.coerceSnapshot(
            typeof this.options.getCurrentPayload === 'function'
                ? this.options.getCurrentPayload()
                : seedPayload
        );
        const livePayloadSig = buildSnapshotSignature(currentPayload, this.coerceSnapshot.bind(this));
        this.lastSharedStoreSignature = livePayloadSig;

        let roomSnapshotSource = '';
        const cloudRow = typeof this.store.loadVTTRoomSnapshot === 'function'
            ? await this.store.loadVTTRoomSnapshot({
                roomId: this.roomId,
                caseId: this.caseId
            })
            : { ok: false, reason: 'unsupported' };

        if (cloudRow && cloudRow.ok && cloudRow.snapshot) {
            const roomPayload = this.coerceSnapshot(cloudRow.snapshot.payload);
            const roomPayloadSig = buildSnapshotSignature(roomPayload, this.coerceSnapshot.bind(this));
            const localDocSig = buildSnapshotSignature(localDocPayload, this.coerceSnapshot.bind(this));
            const cloudStamp = Date.parse(cloudRow.snapshot.updatedAt || '') || toNonNegativeInt(cloudRow.snapshot.revision, 0);
            this.lastSavedRevision = Math.max(0, toNonNegativeInt(cloudRow.snapshot.revision, 0));
            roomSnapshotSource = toTrimmedString(cloudRow.snapshot.updatedBy, '', 120).trim();
            this.lastCloudSnapshotSignature = roomPayloadSig;

            if (!hasVTTContent(localDocPayload, this.coerceSnapshot.bind(this)) || localDocSig !== roomPayloadSig) {
                applySnapshotToDoc(
                    this.doc,
                    roomPayload,
                    this.coerceSnapshot.bind(this),
                    this.originRemoteRestore,
                    cloudStamp || Date.now()
                );
            }
            this.pendingReadyFlush = false;
            this.persistSnapshotToSharedState(roomPayload, roomPayloadSig);
        } else {
            const liveStoreStamp = this.getSharedStoreUpdatedAt();
            const canonicalSeed = chooseCanonicalSnapshot([
                { kind: 'live-store', snapshot: currentPayload, stamp: liveStoreStamp, priority: 30 },
                { kind: 'local-doc', snapshot: localDocPayload, stamp: localDocStamp, priority: 20 },
                { kind: 'seed', snapshot: seedPayload, stamp: 0, priority: 10 }
            ], {
                kind: 'seed',
                snapshot: seedPayload,
                stamp: 0,
                priority: 10
            }, this.coerceSnapshot.bind(this));
            const canonicalPayload = this.coerceSnapshot(canonicalSeed && canonicalSeed.snapshot ? canonicalSeed.snapshot : seedPayload);
            const canonicalSig = buildSnapshotSignature(canonicalPayload, this.coerceSnapshot.bind(this));
            const localDocSig = buildSnapshotSignature(localDocPayload, this.coerceSnapshot.bind(this));
            const seedStamp = Math.max(Date.now(), canonicalSeed && canonicalSeed.stamp ? canonicalSeed.stamp : 0);

            if (!hasVTTContent(localDocPayload, this.coerceSnapshot.bind(this)) || localDocSig !== canonicalSig) {
                applySnapshotToDoc(this.doc, canonicalPayload, this.coerceSnapshot.bind(this), this.originBootstrap, seedStamp);
            }

            if (typeof this.store.saveVTTRoomSnapshot === 'function') {
                const seeded = await this.store.saveVTTRoomSnapshot({
                    roomId: this.roomId,
                    caseId: this.caseId,
                    payload: canonicalPayload,
                    revision: seedStamp,
                    updatedAt: new Date(seedStamp).toISOString(),
                    updatedBy: this.instanceId,
                    updatedByUser: this.userId || null,
                    updatedByName: this.profileName || null,
                    createOnly: true
                });
                this.persistSnapshotToSharedState(canonicalPayload, canonicalSig);
                if (seeded && seeded.ok) {
                    this.lastSavedRevision = Math.max(this.lastSavedRevision, seedStamp, seeded.revision || 0);
                    this.lastCloudSnapshotSignature = canonicalSig;
                    roomSnapshotSource = this.instanceId;
                } else if (seeded && seeded.reason === 'exists' && typeof this.store.loadVTTRoomSnapshot === 'function') {
                    const canonicalRoom = await this.store.loadVTTRoomSnapshot({
                        roomId: this.roomId,
                        caseId: this.caseId
                    });
                    if (canonicalRoom && canonicalRoom.ok && canonicalRoom.snapshot) {
                        const roomPayload = this.coerceSnapshot(canonicalRoom.snapshot.payload);
                        const roomPayloadSig = buildSnapshotSignature(roomPayload, this.coerceSnapshot.bind(this));
                        const roomUpdatedAt = Date.parse(canonicalRoom.snapshot.updatedAt || '') || toNonNegativeInt(canonicalRoom.snapshot.revision, seedStamp);
                        this.lastSavedRevision = Math.max(this.lastSavedRevision, canonicalRoom.snapshot.revision || 0);
                        this.lastCloudSnapshotSignature = roomPayloadSig;
                        roomSnapshotSource = toTrimmedString(canonicalRoom.snapshot.updatedBy, '', 120).trim();
                        if (roomPayloadSig !== buildSnapshotSignature(serializeDocSnapshot(this.doc, this.coerceSnapshot.bind(this)), this.coerceSnapshot.bind(this))) {
                            applySnapshotToDoc(this.doc, roomPayload, this.coerceSnapshot.bind(this), this.originRemoteRestore, roomUpdatedAt);
                        }
                    }
                } else if (seeded && !seeded.ok) {
                    this.pendingReadyFlush = true;
                    console.warn('RTF_VTT_COLLAB: Failed seeding live VTT room', seeded.error || seeded.reason);
                }
            }
        }

        this.lastSnapshot = serializeDocSnapshot(this.doc, this.coerceSnapshot.bind(this));
        this.pendingSnapshot = this.lastSnapshot;
        this.applyRevisionState(this.lastSavedRevision, roomSnapshotSource || this.instanceId);

        if (buildSnapshotSignature(this.lastSnapshot, this.coerceSnapshot.bind(this)) !== livePayloadSig
            && typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(this.lastSnapshot, { origin: this.originRemoteRestore });
        }

        try {
            await this.connectChannel(this.connectConfig);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Channel connect failed', err);
        }

        this.ready = true;
        if (this.pendingReadyFlush) {
            this.scheduleCloudFlush();
        }
        this.updateStatus({
            state: this.connected ? 'live' : 'degraded',
            detail: this.connected ? 'Live VTT connected.' : 'Live VTT unavailable. Retrying connection...',
            peerCount: this.remotePresence.size
        });
        if (!this.connected) {
            this.scheduleReconnect('Retrying live VTT connection...');
        }
        this.scheduleMirror();
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        return this;
    }

    async disposeChannel(channel = this.channel) {
        this.stopPeriodicSync();
        if (!channel || !this.client) return;
        try {
            if (typeof channel.untrack === 'function') {
                try { await channel.untrack(); } catch (err) { }
            }
            await this.client.removeChannel(channel);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Failed removing channel', err);
        } finally {
            if (this.channel === channel) {
                this.channel = null;
            }
        }
    }

    scheduleReconnect(detail = 'Reconnecting live VTT...') {
        if (this.destroyed || this.connected || !this.connectConfig || this.pendingReconnectTimer) return;
        const delayMs = Math.min(8000, 1200 * Math.max(1, this.reconnectAttempts + 1));
        this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 6);
        this.updateStatus({
            state: 'connecting',
            detail,
            peerCount: this.remotePresence.size
        });
        this.pendingReconnectTimer = setTimeout(() => {
            this.pendingReconnectTimer = null;
            this.connectChannel(this.connectConfig).catch((err) => {
                console.warn('RTF_VTT_COLLAB: Reconnect failed', err);
                this.connected = false;
                this.updateStatus({
                    state: 'degraded',
                    detail: 'Live VTT is unavailable right now. Retrying...',
                    peerCount: this.remotePresence.size
                });
                this.scheduleReconnect('Retrying live VTT connection...');
            });
        }, delayMs);
    }

    startPeriodicSync() {
        if (this.periodicSyncTimer) clearInterval(this.periodicSyncTimer);
        this.periodicSyncTimer = setInterval(() => {
            if (this.destroyed || !this.connected || !this.ready) return;
            if (!this.remotePresence.size) return;
            this.sendSyncStep1();
        }, SYNC_RECONCILE_INTERVAL_MS);
    }

    stopPeriodicSync() {
        if (!this.periodicSyncTimer) return;
        clearInterval(this.periodicSyncTimer);
        this.periodicSyncTimer = null;
    }

    async connectChannel(config) {
        if (!this.client || !config) return;
        if (this.pendingReconnectTimer) {
            clearTimeout(this.pendingReconnectTimer);
            this.pendingReconnectTimer = null;
        }
        if (this.channel) {
            await this.disposeChannel(this.channel);
        }

        this.connected = false;
        this.stopPeriodicSync();
        this.remotePresence = new Map();
        const channelName = `rtf-vtt-${config.campaignId}-${this.roomId}`;
        const channel = this.client.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: this.instanceId || undefined }
            }
        });
        this.channel = channel;

        channel.on('broadcast', { event: 'y-sync' }, ({ payload }) => {
            if (channel !== this.channel || !payload || !payload.update) return;
            this.handleSyncMessage(payload.update);
        });
        channel.on('broadcast', { event: 'y-awareness' }, ({ payload }) => {
            if (channel !== this.channel || !payload || !payload.update) return;
            this.handleAwarenessMessage(payload.update);
        });
        channel.on('broadcast', { event: SYNC_RECONCILE_REQUEST_EVENT }, ({ payload }) => {
            if (channel !== this.channel) return;
            this.handleSyncRequestMessage(payload);
        });

        const onPresence = () => {
            if (channel !== this.channel) return;
            const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
            this.handlePresenceState(state);
        };
        channel.on('presence', { event: 'sync' }, onPresence);
        channel.on('presence', { event: 'join' }, onPresence);
        channel.on('presence', { event: 'leave' }, onPresence);

        this.updateStatus({
            state: 'connecting',
            detail: 'Joining live VTT room...',
            peerCount: this.remotePresence.size
        });

        await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (channel !== this.channel) return;
                this.connected = false;
                this.updateStatus({
                    state: 'degraded',
                    detail: 'Live VTT timed out while joining.',
                    peerCount: this.remotePresence.size
                });
                if (!settled) {
                    settled = true;
                    reject(new Error('VTT collaboration channel timed out.'));
                }
            }, 10000);

            channel.subscribe((status) => {
                if (channel !== this.channel) return;
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.startPeriodicSync();
                    this.updateStatus({
                        state: 'live',
                        detail: 'Live VTT connected.',
                        peerCount: this.remotePresence.size
                    });
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                    return;
                }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout);
                    this.connected = false;
                    this.stopPeriodicSync();
                    this.updateStatus({
                        state: 'degraded',
                        detail: status === 'CLOSED'
                            ? 'Live VTT disconnected.'
                            : 'Live VTT is unavailable right now.',
                        peerCount: this.remotePresence.size
                    });
                    if (!settled) {
                        settled = true;
                        reject(new Error(`VTT collaboration channel status: ${status}`));
                        return;
                    }
                    this.scheduleReconnect(status === 'CLOSED' ? 'Rejoining live VTT...' : 'Retrying live VTT connection...');
                }
            });
        });

        await this.refreshPresenceTracking({ force: true });
        this.broadcastLocalAwareness();
        this.sendSyncStep1();
        this.handlePresenceState(typeof channel.presenceState === 'function' ? channel.presenceState() : {});
    }

    async sendBroadcast(event, payload) {
        if (!this.channel || !this.connected || typeof this.channel.send !== 'function') return false;
        try {
            const result = await this.channel.send({
                type: 'broadcast',
                event,
                payload
            });
            if (result && result !== 'ok') {
                throw new Error(`Broadcast returned ${result}`);
            }
            return true;
        } catch (err) {
            console.warn(`RTF_VTT_COLLAB: Broadcast failed for ${event}`, err);
            return false;
        }
    }

    sendSyncStep1() {
        const encoder = encoding.createEncoder();
        syncProtocol.writeSyncStep1(encoder, this.doc);
        this.sendBroadcast('y-sync', { update: encodeBase64(encoding.toUint8Array(encoder)) });
    }

    handleSyncMessage(encoded) {
        let update;
        try {
            update = decodeBase64(encoded);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Invalid sync payload', err);
            return;
        }

        const decoder = decoding.createDecoder(update);
        const encoder = encoding.createEncoder();
        try {
            syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.originRemoteSync, (error) => {
                console.warn('RTF_VTT_COLLAB: Sync message failed', error);
            });
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Sync decode failed', err);
            return;
        }

        if (encoding.hasContent(encoder)) {
            this.sendBroadcast('y-sync', { update: encodeBase64(encoding.toUint8Array(encoder)) });
        }
    }

    requestPeerReconcile(reason = 'manual') {
        if (this.destroyed || !this.connected || !this.remotePresence.size) return;
        this.sendBroadcast(SYNC_RECONCILE_REQUEST_EVENT, {
            requestedBy: this.instanceId,
            requestedAt: Date.now(),
            reason: toTrimmedString(reason, 'manual', 40).trim() || 'manual'
        });
    }

    handleSyncRequestMessage(payload) {
        if (this.destroyed || !this.connected || !payload || typeof payload !== 'object') return;
        const requestedBy = toTrimmedString(payload.requestedBy, '', 120).trim();
        if (requestedBy && requestedBy === this.instanceId) return;
        this.sendSyncStep1();
    }

    broadcastLocalAwareness(clientIds = [this.awareness.clientID]) {
        const update = encodeAwarenessUpdate(this.awareness, clientIds);
        this.sendBroadcast('y-awareness', { update: encodeBase64(update) });
    }

    handleAwarenessMessage(encoded) {
        try {
            applyAwarenessUpdate(this.awareness, decodeBase64(encoded), this);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Awareness decode failed', err);
        }
    }

    handleAwarenessUpdate({ added, updated, removed }, origin) {
        if (this.destroyed || origin !== 'local') return;
        const changed = [...added, ...updated, ...removed];
        if (!changed.length) return;
        this.broadcastLocalAwareness(changed);
    }

    handleAwarenessChange() {
        if (this.destroyed) return;
    }

    handlePresenceState(state) {
        const raw = state && typeof state === 'object' ? state : {};
        const previousPeerCount = this.remotePresence.size;
        const peers = new Map();

        Object.keys(raw).forEach((presenceKey) => {
            const entries = Array.isArray(raw[presenceKey]) ? raw[presenceKey] : [];
            entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') return;
                const instanceId = toTrimmedString(entry.instanceId, '', 120).trim();
                if (!instanceId || instanceId === this.instanceId) return;
                peers.set(instanceId, {
                    instanceId,
                    profileName: toTrimmedString(entry.profileName, '', 120).trim() || 'Player',
                    color: toTrimmedString(entry.color, '', 40).trim() || pickPeerColor(instanceId),
                    activeSceneId: toTrimmedString(entry.activeSceneId, '', 120).trim(),
                    ts: Math.max(0, parseInt(entry.ts, 10) || 0)
                });
            });
        });

        this.remotePresence = peers;
        if (this.connected && peers.size && peers.size !== previousPeerCount) {
            this.sendSyncStep1();
        }
        this.updateStatus({
            peerCount: peers.size,
            detail: this.connected
                ? (peers.size
                    ? `Live VTT connected with ${peers.size} other ${peers.size === 1 ? 'player' : 'players'}.`
                    : 'Live VTT connected. Only you are here.')
                : this.status.detail
        });
    }

    async refreshPresenceTracking(options = {}) {
        if (!this.channel || !this.connected || typeof this.channel.track !== 'function') return;
        const opts = options && typeof options === 'object' ? options : {};
        const presence = this.buildLocalPresence();
        const presenceKey = `${presence.activeSceneId || ''}`;
        if (!opts.force && presenceKey === this.lastTrackedPresenceKey) return;
        try {
            const result = await this.channel.track(presence);
            if (result && result !== 'ok') {
                throw new Error(`Presence track returned ${result}`);
            }
            this.lastTrackedPresenceKey = presenceKey;
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Presence track failed', err);
        }
    }

    handleDocUpdate(update, origin) {
        if (this.destroyed || !this.connected) return;
        if (origin === this.originRemoteSync) return;
        const encoder = encoding.createEncoder();
        syncProtocol.writeUpdate(encoder, update);
        this.sendBroadcast('y-sync', { update: encodeBase64(encoding.toUint8Array(encoder)) });
    }

    handleAfterTransaction(transaction) {
        const next = serializeDocSnapshot(this.doc, this.coerceSnapshot.bind(this));
        const diff = diffVTTSnapshots(this.lastSnapshot, next, this.coerceSnapshot.bind(this));
        const origin = transaction ? transaction.origin : null;
        this.lastSnapshot = next;
        this.pendingSnapshot = next;

        if (this.ready) {
            this.scheduleMirror();
            const shouldQueueCloudFlush = !origin
                || origin === this.originLocalSnapshot
                || origin === this.originPosition
                || origin === this.originRemoteRestore
                || origin === this.originSharedStore
                || origin === this.originManualFlush;
            if (shouldQueueCloudFlush) {
                this.scheduleCloudFlush();
            }
            this.refreshPresenceTracking().catch(() => { });
        }

        const shouldDispatchSnapshot = origin !== this.originBootstrap
            && origin !== this.originLocalSnapshot
            && origin !== this.originPosition
            && origin !== this.originManualFlush;

        if (shouldDispatchSnapshot) {
            if (!diff.structural && diff.positions.length && typeof this.options.applyPositionChanges === 'function') {
                this.options.applyPositionChanges(diff.positions, { origin, snapshot: next });
            } else if ((diff.structural || diff.positions.length) && typeof this.options.applySnapshot === 'function') {
                this.options.applySnapshot(next, { origin });
            }
        }
    }

    scheduleMirror() {
        if (!this.ready || this.destroyed) return;
        if (this.pendingMirrorTimer) clearTimeout(this.pendingMirrorTimer);
        this.pendingMirrorTimer = setTimeout(() => {
            this.pendingMirrorTimer = null;
            if (!this.store || !this.pendingSnapshot || typeof this.store.mirrorVTTSnapshotToState !== 'function') return;
            this.store.mirrorVTTSnapshotToState({
                roomId: this.roomId,
                caseId: this.caseId,
                payload: this.pendingSnapshot
            });
        }, LOCAL_MIRROR_DELAY_MS);
    }

    scheduleCloudFlush() {
        if (this.destroyed || !this.store || typeof this.store.saveVTTRoomSnapshot !== 'function') return;
        if (!this.ready) {
            this.pendingReadyFlush = true;
            return;
        }
        this.pendingReadyFlush = false;
        if (this.pendingFlushTimer) clearTimeout(this.pendingFlushTimer);
        this.pendingFlushTimer = setTimeout(() => {
            this.pendingFlushTimer = null;
            this.flushSnapshotNow().catch((err) => {
                console.warn('RTF_VTT_COLLAB: Scheduled flush failed', err);
            });
        }, CLOUD_FLUSH_DELAY_MS);
    }

    persistSnapshotToSharedState(snapshot, signature = '') {
        if (!snapshot || !this.store || typeof this.store.updateVTTState !== 'function') return false;
        const snapshotSig = signature || buildSnapshotSignature(snapshot, this.coerceSnapshot.bind(this));
        if (!snapshotSig || snapshotSig === this.lastSharedStoreSignature) return false;
        try {
            this.store.updateVTTState(snapshot, this.caseId);
            this.lastSharedStoreSignature = snapshotSig;
            return true;
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Shared store snapshot persist failed', err);
            return false;
        }
    }

    async flushSnapshotNow() {
        if (this.pendingFlushPromise) {
            this.flushQueuedWhilePending = true;
            return this.pendingFlushPromise;
        }
        if (!this.store || !this.pendingSnapshot || typeof this.store.saveVTTRoomSnapshot !== 'function') {
            return { ok: false, reason: 'no-snapshot' };
        }

        const snapshotToSave = this.getSnapshot();
        const snapshotSig = buildSnapshotSignature(snapshotToSave, this.coerceSnapshot.bind(this));
        if (snapshotSig && snapshotSig === this.lastCloudSnapshotSignature) {
            this.pendingReadyFlush = false;
            return { ok: true, reason: 'unchanged' };
        }

        const nextRevision = this.nextLocalRevision();
        this.flushQueuedWhilePending = false;
        this.applyRevisionState(nextRevision, this.instanceId);
        this.pendingFlushPromise = this.store.saveVTTRoomSnapshot({
            roomId: this.roomId,
            caseId: this.caseId,
            payload: snapshotToSave,
            revision: nextRevision,
            updatedAt: toIsoString(getDocUpdatedAt(this.doc), '') || new Date().toISOString(),
            updatedBy: this.instanceId,
            updatedByUser: this.userId || null,
            updatedByName: this.profileName || null
        }).then((result) => {
            if (result && result.ok) {
                this.applyRevisionState(result.revision || nextRevision, this.instanceId);
                if (snapshotSig) this.lastCloudSnapshotSignature = snapshotSig;
                this.pendingReadyFlush = false;
                this.persistSnapshotToSharedState(snapshotToSave, snapshotSig);
                return result;
            }
            if (result && result.reason === 'stale' && result.snapshot) {
                const remoteSnapshot = this.coerceSnapshot(result.snapshot.payload);
                const remoteSig = buildSnapshotSignature(remoteSnapshot, this.coerceSnapshot.bind(this));
                const currentSig = buildSnapshotSignature(this.getSnapshot(), this.coerceSnapshot.bind(this));
                this.applyRevisionState(result.snapshot.revision, result.snapshot.updatedBy || result.updatedBy || '');
                if (remoteSig) this.lastCloudSnapshotSignature = remoteSig;
                this.persistSnapshotToSharedState(remoteSnapshot, remoteSig);
                if (remoteSig !== currentSig) {
                    this.flushQueuedWhilePending = true;
                    this.pendingReadyFlush = true;
                } else {
                    this.pendingReadyFlush = false;
                }
            }
            return result;
        }).finally(() => {
            this.pendingFlushPromise = null;
            if (this.destroyed || !this.ready) return;
            if (this.flushQueuedWhilePending) {
                this.flushQueuedWhilePending = false;
                queueMicrotask(() => {
                    this.flushSnapshotNow().catch((err) => {
                        console.warn('RTF_VTT_COLLAB: Follow-up flush failed', err);
                    });
                });
                return;
            }
            if (this.pendingReadyFlush) {
                this.scheduleCloudFlush();
            }
        });

        return this.pendingFlushPromise;
    }

    getSnapshot() {
        return this.coerceSnapshot(this.pendingSnapshot || this.lastSnapshot);
    }

    getStatus() {
        return {
            ...this.status,
            peerCount: this.remotePresence.size,
            connected: !!this.connected,
            ready: !!this.ready
        };
    }

    isActive() {
        return !!this.ready && !this.destroyed;
    }

    syncSnapshot(payload, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const base = Object.prototype.hasOwnProperty.call(opts, 'baseSnapshot')
            ? this.coerceSnapshot(opts.baseSnapshot)
            : null;
        const next = this.coerceSnapshot(payload);
        const nextSig = buildSnapshotSignature(next, this.coerceSnapshot.bind(this));
        if (opts.sharedStatePersisted && nextSig) {
            this.lastSharedStoreSignature = nextSig;
        }
        if (base && nextSig === buildSnapshotSignature(base, this.coerceSnapshot.bind(this))) {
            if (opts.flushNow) {
                return this.flushSnapshotNow();
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }
        const currentSig = buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot, this.coerceSnapshot.bind(this));
        if (nextSig === currentSig) {
            if (opts.flushNow) {
                return this.flushSnapshotNow();
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }
        if (base) {
            const patched = applySnapshotDeltaToDoc(
                this.doc,
                base,
                next,
                this.coerceSnapshot.bind(this),
                this.originLocalSnapshot,
                Date.now()
            );
            if (!patched) {
                if (opts.flushNow) {
                    return this.flushSnapshotNow();
                }
                return Promise.resolve({ ok: true, reason: 'unchanged' });
            }
        } else {
            applySnapshotToDoc(this.doc, next, this.coerceSnapshot.bind(this), this.originLocalSnapshot, Date.now());
        }
        if (opts.flushNow) {
            return this.flushSnapshotNow();
        }
        return Promise.resolve({ ok: true });
    }

    applySharedStoreSnapshot(payload, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const source = toTrimmedString(opts.source, '', 40).trim().toLowerCase();
        const allowExternal = !!opts.allowExternal;
        if ((source === 'remote' || source === 'storage' || source === 'realtime') && !allowExternal && !opts.force) {
            return false;
        }
        const next = this.coerceSnapshot(payload);
        const nextSig = buildSnapshotSignature(next, this.coerceSnapshot.bind(this));
        const currentSig = buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot, this.coerceSnapshot.bind(this));
        if (nextSig === currentSig) {
            return false;
        }
        const scopeUpdatedAt = Math.max(0, toNonNegativeInt(opts.scopeUpdatedAt, 0));
        const currentStamp = getDocUpdatedAt(this.doc);
        if (!opts.force && scopeUpdatedAt && currentStamp && scopeUpdatedAt < currentStamp) {
            return false;
        }
        if (nextSig) this.lastSharedStoreSignature = nextSig;
        const applyOrigin = opts.origin === 'remote-restore'
            ? this.originRemoteRestore
            : this.originSharedStore;
        applySnapshotToDoc(
            this.doc,
            next,
            this.coerceSnapshot.bind(this),
            applyOrigin,
            Math.max(Date.now(), scopeUpdatedAt || this.getSharedStoreUpdatedAt())
        );
        if (opts.flushNow) {
            this.flushSnapshotNow().catch((err) => {
                console.warn('RTF_VTT_COLLAB: Shared-store flush failed', err);
            });
        }
        return true;
    }

    updateTokenPositions(changes, options = {}) {
        const applied = applyTokenPositionChangesToDoc(this.doc, changes, this.originPosition, Date.now());
        if (!applied.length) {
            if (options && options.flushNow) {
                return this.flushSnapshotNow();
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }
        if (options && options.flushNow) {
            this.requestPeerReconcile('token-drop');
            return this.flushSnapshotNow();
        }
        return Promise.resolve({ ok: true, changes: applied });
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.flushSnapshotNow().catch(() => { });
        } else if (!this.connected) {
            this.scheduleReconnect('Rejoining live VTT...');
        } else {
            this.sendSyncStep1();
            this.refreshPresenceTracking({ force: true }).catch(() => { });
        }
    }

    handleBeforeUnload() {
        this.flushSnapshotNow().catch(() => { });
    }

    async destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        if (this.pendingMirrorTimer) clearTimeout(this.pendingMirrorTimer);
        if (this.pendingFlushTimer) clearTimeout(this.pendingFlushTimer);
        if (this.pendingReconnectTimer) clearTimeout(this.pendingReconnectTimer);
        this.stopPeriodicSync();

        try {
            await this.flushSnapshotNow();
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Final flush failed', err);
        }

        this.connected = false;
        this.ready = false;
        this.updateStatus({
            state: 'local',
            detail: 'Live VTT disconnected.',
            peerCount: 0
        });

        await this.disposeChannel(this.channel);
        if (this.persistence && typeof this.persistence.destroy === 'function') {
            try {
                await this.persistence.destroy();
            } catch (err) { }
        }
        this.doc.off('update', this.handleDocUpdate);
        this.doc.off('afterTransaction', this.handleAfterTransaction);
        this.awareness.off('update', this.handleAwarenessUpdate);
        this.awareness.off('change', this.handleAwarenessChange);
    }
}

const api = {
    createSession(options = {}) {
        return VTTCollabSession.create(options);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.RTF_VTT_COLLAB = api;
}

export { VTTCollabSession };
export default api;
