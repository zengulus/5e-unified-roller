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

const DEFAULT_CASE_ID = 'case_primary';
const DEFAULT_CASE_NAME = 'UNNAMED CASE';
const DEFAULT_CAMPAIGN_NAME = 'CAMPAIGN META BOARD';
const CURSOR_PRECISION = 10;
const LOCAL_MIRROR_DELAY_MS = 120;
const CLOUD_FLUSH_DELAY_MS = 1000;
const HISTORY_CAPTURE_MIN_INTERVAL_MS = 12000;
const BOARD_ADMIN_EVENT_APPLY_SNAPSHOT = 'admin-apply-snapshot';
const BOARD_ADMIN_EVENT_BUST = 'admin-bust';
const BOARD_SYNC_EVENT_REQUEST_SNAPSHOT = 'board-snapshot-request';
const BOARD_SYNC_EVENT_SNAPSHOT = 'board-snapshot';
const BOARD_SYNC_EVENT_POSITION_CHANGES = 'board-node-positions';
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

const toIsoString = (value, fallback = '') => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        try {
            return new Date(value).toISOString();
        } catch (err) {
            return fallback;
        }
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) {
            try {
                return new Date(parsed).toISOString();
            } catch (err) {
                return fallback;
            }
        }
    }
    return fallback;
};

const normalizeScope = (value) => String(value || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';

const sanitizeCaseId = (value, fallback = DEFAULT_CASE_ID) => {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const cleaned = raw
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return cleaned || fallback;
};

const buildDefaultSnapshot = (scope = 'case', caseId = DEFAULT_CASE_ID) => ({
    name: scope === 'campaign' ? DEFAULT_CAMPAIGN_NAME : DEFAULT_CASE_NAME,
    scope: normalizeScope(scope),
    caseId: normalizeScope(scope) === 'campaign' ? '' : sanitizeCaseId(caseId, DEFAULT_CASE_ID),
    updatedAt: 0,
    nodes: [],
    connections: []
});

const sanitizeNodeMeta = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        return null;
    }
};

const buildSnapshotNodeFallbackMap = (snapshot) => {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
    const map = new Map();

    rawNodes.forEach((node, index) => {
        const row = node && typeof node === 'object' ? node : {};
        const fallbackId = `node_${index + 1}`;
        const id = toTrimmedString(row.id, fallbackId, 120).trim() || fallbackId;
        if (!id) return;
        map.set(id, row);
    });

    return map;
};

const sanitizeNodeRecord = (node, index = 0, fallbackNode = null) => {
    const source = node && typeof node === 'object' ? node : {};
    const previous = fallbackNode && typeof fallbackNode === 'object' ? fallbackNode : {};
    const fallbackId = toTrimmedString(previous.id, `node_${index + 1}`, 120).trim() || `node_${index + 1}`;
    const normalizedType = toTrimmedString(source.type, '', 40).trim().toLowerCase()
        || toTrimmedString(previous.type, '', 40).trim().toLowerCase();
    return {
        id: toTrimmedString(source.id, fallbackId, 120).trim() || fallbackId,
        type: normalizedType || 'note',
        x: Math.round(toFiniteNumber(source.x, toFiniteNumber(previous.x, 0))),
        y: Math.round(toFiniteNumber(source.y, toFiniteNumber(previous.y, 0))),
        title: toTrimmedString(
            source.title,
            toTrimmedString(previous.title, '', 1000),
            1000
        ),
        body: toTrimmedString(
            source.body,
            toTrimmedString(previous.body, '', 24000),
            24000
        ),
        meta: sanitizeNodeMeta(
            Object.prototype.hasOwnProperty.call(source, 'meta')
                ? source.meta
                : previous.meta
        )
    };
};

const sanitizeConnectionRecord = (conn, index = 0) => {
    const source = conn && typeof conn === 'object' ? conn : {};
    const fallbackId = `conn_${index + 1}`;
    return {
        id: toTrimmedString(source.id, fallbackId, 120).trim() || fallbackId,
        from: toTrimmedString(source.from, '', 120).trim(),
        to: toTrimmedString(source.to, '', 120).trim(),
        fromPort: toTrimmedString(source.fromPort, 'auto', 20).trim() || 'auto',
        toPort: toTrimmedString(source.toPort, 'auto', 20).trim() || 'auto',
        portPinned: !!source.portPinned,
        label: toTrimmedString(source.label, '', 4000),
        arrowLeft: Math.max(0, Math.min(2, parseInt(source.arrowLeft, 10) || 0)),
        arrowRight: Math.max(0, Math.min(2, parseInt(source.arrowRight, 10) || 0)),
        relationshipLogged: !!source.relationshipLogged,
        colorIndex: Math.max(0, parseInt(source.colorIndex, 10) || 0),
        theoryRelation: toTrimmedString(source.theoryRelation, '', 40).trim()
    };
};

const sanitizeBoardSnapshot = (payload, defaults = {}, fallbackSnapshot = null) => {
    const source = payload && typeof payload === 'object' ? payload : {};
    const fallbackNodeMap = buildSnapshotNodeFallbackMap(fallbackSnapshot);
    const scope = normalizeScope(source.scope || defaults.scope || 'case');
    const caseId = scope === 'campaign'
        ? ''
        : sanitizeCaseId(source.caseId || defaults.caseId, DEFAULT_CASE_ID);
    return {
        name: toTrimmedString(
            source.name,
            scope === 'campaign' ? DEFAULT_CAMPAIGN_NAME : DEFAULT_CASE_NAME,
            240
        ).trim() || (scope === 'campaign' ? DEFAULT_CAMPAIGN_NAME : DEFAULT_CASE_NAME),
        scope,
        caseId,
        updatedAt: Math.max(0, parseInt(source.updatedAt, 10) || parseInt(defaults.updatedAt, 10) || 0),
        nodes: Array.isArray(source.nodes)
            ? source.nodes.map((node, idx) => {
                const sourceNode = node && typeof node === 'object' ? node : {};
                const sourceId = toTrimmedString(sourceNode.id, '', 120).trim();
                const fallbackNode = sourceId && fallbackNodeMap.has(sourceId)
                    ? fallbackNodeMap.get(sourceId)
                    : null;
                return sanitizeNodeRecord(node, idx, fallbackNode);
            })
            : [],
        connections: Array.isArray(source.connections)
            ? source.connections
                .map((conn, idx) => sanitizeConnectionRecord(conn, idx))
                .filter((conn) => conn.from && conn.to)
            : []
    };
};

const hasBoardContent = (snapshot) => {
    const clean = sanitizeBoardSnapshot(snapshot);
    return clean.nodes.length > 0
        || clean.connections.length > 0
        || (clean.name && clean.name !== DEFAULT_CASE_NAME && clean.name !== DEFAULT_CAMPAIGN_NAME);
};

const cloneJson = (value, fallback = null) => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        return fallback;
    }
};

const stableStringify = (value) => {
    if (value === null || value === undefined) return '';
    try {
        return JSON.stringify(value);
    } catch (err) {
        return '';
    }
};

const compareRevisionMeta = (leftRevision, leftSource, rightRevision, rightSource) => {
    const cleanLeftRevision = Math.max(0, Math.round(toFiniteNumber(leftRevision, 0)));
    const cleanRightRevision = Math.max(0, Math.round(toFiniteNumber(rightRevision, 0)));
    if (cleanLeftRevision !== cleanRightRevision) return cleanLeftRevision - cleanRightRevision;
    const cleanLeftSource = toTrimmedString(leftSource, '', 120).trim();
    const cleanRightSource = toTrimmedString(rightSource, '', 120).trim();
    if (cleanLeftSource && cleanRightSource) return cleanLeftSource.localeCompare(cleanRightSource);
    if (cleanLeftSource) return 1;
    if (cleanRightSource) return -1;
    return 0;
};

const buildSnapshotSignature = (snapshot) => {
    const clean = sanitizeBoardSnapshot(snapshot);
    return stableStringify({
        name: clean.name,
        scope: clean.scope,
        caseId: clean.caseId,
        nodes: clean.nodes,
        connections: clean.connections
    });
};

const getSnapshotStamp = (snapshot, fallback = 0) => {
    const clean = sanitizeBoardSnapshot(snapshot);
    return Math.max(
        0,
        parseInt(clean.updatedAt, 10) || 0,
        parseInt(fallback, 10) || 0
    );
};

const chooseCanonicalSnapshot = (entries = [], fallbackEntry = null) => {
    const candidates = Array.isArray(entries)
        ? entries.filter((entry) => entry && entry.snapshot)
        : [];
    if (!candidates.length) return fallbackEntry;

    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
        const next = candidates[i];
        const bestHasContent = hasBoardContent(best.snapshot);
        const nextHasContent = hasBoardContent(next.snapshot);
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

const roundCursor = (value) => Math.round(toFiniteNumber(value, 0) * CURSOR_PRECISION) / CURSOR_PRECISION;

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

const pickPeerColor = (seed = '') => {
    let hash = 0;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
};

const syncYTextValue = (target, nextValue) => {
    const desired = toTrimmedString(nextValue, '', 24000);
    const current = target.toString();
    if (current === desired) return false;
    if (current.length) target.delete(0, current.length);
    if (desired) target.insert(0, desired);
    return true;
};

const ensureYMapEntry = (map, id) => {
    const existing = map.get(id);
    if (existing instanceof Y.Map) return existing;
    const next = new Y.Map();
    map.set(id, next);
    return next;
};

const ensureYTextEntry = (record, key) => {
    const existing = record.get(key);
    if (existing instanceof Y.Text) return existing;
    const next = new Y.Text();
    record.set(key, next);
    return next;
};

const applySnapshotToDoc = (doc, payload, scope, caseId, origin, stamp = Date.now()) => {
    const clean = sanitizeBoardSnapshot(payload, { scope, caseId });
    const metaMap = doc.getMap('meta');
    const nodeMap = doc.getMap('nodes');
    const connectionMap = doc.getMap('connections');

    doc.transact(() => {
        metaMap.set('name', clean.name);
        metaMap.set('scope', clean.scope);
        metaMap.set('caseId', clean.caseId || '');
        metaMap.set('updatedAt', stamp);

        const nextNodeIds = new Set();
        clean.nodes.forEach((node) => {
            nextNodeIds.add(node.id);
            const record = ensureYMapEntry(nodeMap, node.id);
            record.set('id', node.id);
            record.set('type', node.type);
            record.set('x', node.x);
            record.set('y', node.y);
            record.set('meta', cloneJson(node.meta, null));
            syncYTextValue(ensureYTextEntry(record, 'title'), node.title || '');
            syncYTextValue(ensureYTextEntry(record, 'body'), node.body || '');
        });

        Array.from(nodeMap.keys()).forEach((nodeId) => {
            if (!nextNodeIds.has(nodeId)) nodeMap.delete(nodeId);
        });

        const nextConnectionIds = new Set();
        clean.connections.forEach((conn) => {
            nextConnectionIds.add(conn.id);
            const record = ensureYMapEntry(connectionMap, conn.id);
            record.set('id', conn.id);
            record.set('from', conn.from);
            record.set('to', conn.to);
            record.set('fromPort', conn.fromPort);
            record.set('toPort', conn.toPort);
            record.set('portPinned', !!conn.portPinned);
            record.set('label', conn.label || '');
            record.set('arrowLeft', conn.arrowLeft || 0);
            record.set('arrowRight', conn.arrowRight || 0);
            record.set('relationshipLogged', !!conn.relationshipLogged);
            record.set('colorIndex', conn.colorIndex || 0);
            record.set('theoryRelation', conn.theoryRelation || '');
        });

        Array.from(connectionMap.keys()).forEach((connId) => {
            if (!nextConnectionIds.has(connId)) connectionMap.delete(connId);
        });
    }, origin);
};

const applyPositionChangesToDoc = (doc, changes, origin, stamp = Date.now()) => {
    if (!Array.isArray(changes) || !changes.length) return false;
    const nodeMap = doc.getMap('nodes');
    const metaMap = doc.getMap('meta');
    let mutated = false;

    doc.transact(() => {
        changes.forEach((change) => {
            if (!change || typeof change !== 'object') return;
            const id = toTrimmedString(change.id, '', 120).trim();
            if (!id || !nodeMap.has(id)) return;
            const record = ensureYMapEntry(nodeMap, id);
            const nextX = Math.round(toFiniteNumber(change.x, 0));
            const nextY = Math.round(toFiniteNumber(change.y, 0));
            if (record.get('x') !== nextX) {
                record.set('x', nextX);
                mutated = true;
            }
            if (record.get('y') !== nextY) {
                record.set('y', nextY);
                mutated = true;
            }
        });
        if (mutated) metaMap.set('updatedAt', stamp);
    }, origin);

    return mutated;
};

const serializeDocSnapshot = (doc, fallbackScope = 'case', fallbackCaseId = DEFAULT_CASE_ID) => {
    const metaMap = doc.getMap('meta');
    const nodeMap = doc.getMap('nodes');
    const connectionMap = doc.getMap('connections');
    const scope = normalizeScope(metaMap.get('scope') || fallbackScope);
    const caseId = scope === 'campaign'
        ? ''
        : sanitizeCaseId(metaMap.get('caseId') || fallbackCaseId, DEFAULT_CASE_ID);

    const nodes = [];
    nodeMap.forEach((record, id) => {
        if (!(record instanceof Y.Map)) return;
        const title = record.get('title');
        const body = record.get('body');
        nodes.push({
            id,
            type: toTrimmedString(record.get('type'), 'note', 40).trim().toLowerCase() || 'note',
            x: Math.round(toFiniteNumber(record.get('x'), 0)),
            y: Math.round(toFiniteNumber(record.get('y'), 0)),
            title: title instanceof Y.Text ? title.toString() : toTrimmedString(title, '', 1000),
            body: body instanceof Y.Text ? body.toString() : toTrimmedString(body, '', 24000),
            meta: cloneJson(record.get('meta'), null)
        });
    });

    const connections = [];
    connectionMap.forEach((record, id) => {
        if (!(record instanceof Y.Map)) return;
        connections.push({
            id,
            from: toTrimmedString(record.get('from'), '', 120).trim(),
            to: toTrimmedString(record.get('to'), '', 120).trim(),
            fromPort: toTrimmedString(record.get('fromPort'), 'auto', 20).trim() || 'auto',
            toPort: toTrimmedString(record.get('toPort'), 'auto', 20).trim() || 'auto',
            portPinned: !!record.get('portPinned'),
            label: toTrimmedString(record.get('label'), '', 4000),
            arrowLeft: Math.max(0, Math.min(2, parseInt(record.get('arrowLeft'), 10) || 0)),
            arrowRight: Math.max(0, Math.min(2, parseInt(record.get('arrowRight'), 10) || 0)),
            relationshipLogged: !!record.get('relationshipLogged'),
            colorIndex: Math.max(0, parseInt(record.get('colorIndex'), 10) || 0),
            theoryRelation: toTrimmedString(record.get('theoryRelation'), '', 40).trim()
        });
    });

    return {
        name: toTrimmedString(
            metaMap.get('name'),
            scope === 'campaign' ? DEFAULT_CAMPAIGN_NAME : DEFAULT_CASE_NAME,
            240
        ).trim() || (scope === 'campaign' ? DEFAULT_CAMPAIGN_NAME : DEFAULT_CASE_NAME),
        scope,
        caseId,
        updatedAt: Math.max(0, parseInt(metaMap.get('updatedAt'), 10) || 0),
        nodes,
        connections
    };
};

const diffBoardSnapshots = (previous, next) => {
    const left = sanitizeBoardSnapshot(previous);
    const right = sanitizeBoardSnapshot(next);
    if (left.name !== right.name || left.scope !== right.scope || left.caseId !== right.caseId) {
        return { structural: true, positions: [] };
    }

    if (left.connections.length !== right.connections.length) {
        return { structural: true, positions: [] };
    }

    const leftConnections = new Map(left.connections.map((entry) => [entry.id, stableStringify(entry)]));
    for (let i = 0; i < right.connections.length; i += 1) {
        const entry = right.connections[i];
        if (!leftConnections.has(entry.id) || leftConnections.get(entry.id) !== stableStringify(entry)) {
            return { structural: true, positions: [] };
        }
    }

    if (left.nodes.length !== right.nodes.length) {
        return { structural: true, positions: [] };
    }

    const leftNodes = new Map(left.nodes.map((entry) => [entry.id, entry]));
    const positions = [];
    for (let i = 0; i < right.nodes.length; i += 1) {
        const entry = right.nodes[i];
        const prior = leftNodes.get(entry.id);
        if (!prior) return { structural: true, positions: [] };

        if (prior.type !== entry.type
            || prior.title !== entry.title
            || prior.body !== entry.body
            || stableStringify(prior.meta) !== stableStringify(entry.meta)) {
            return { structural: true, positions: [] };
        }

        if (prior.x !== entry.x || prior.y !== entry.y) {
            positions.push({ id: entry.id, x: entry.x, y: entry.y });
        }
    }

    return { structural: false, positions };
};

class BoardCollabSession {
    constructor(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        this.options = opts;
        this.scope = normalizeScope(opts.scope);
        this.caseId = this.scope === 'campaign' ? '' : sanitizeCaseId(opts.caseId, DEFAULT_CASE_ID);
        this.roomId = toTrimmedString(opts.roomId, '', 160).trim();
        this.store = opts.store || null;
        this.doc = new Y.Doc();
        this.metaMap = this.doc.getMap('meta');
        this.nodeMap = this.doc.getMap('nodes');
        this.connectionMap = this.doc.getMap('connections');
        this.awareness = new Awareness(this.doc);
        this.persistence = null;
        this.client = null;
        this.channel = null;
        this.connected = false;
        this.ready = false;
        this.destroyed = false;
        this.instanceId = '';
        this.userId = '';
        this.profileName = '';
        this.peerColor = '';
        this.indexedDbName = '';
        this.lastSavedRevision = 0;
        this.lastSnapshotSource = '';
        this.pendingMirrorTimer = null;
        this.pendingFlushTimer = null;
        this.pendingFlushPromise = null;
        this.pendingSnapshot = null;
        this.remotePresence = new Map();
        this.lastHistorySignature = '';
        this.lastSharedStoreSignature = '';
        this.lastHistoryCapturedAt = 0;
        this.initialCloudFlushRequired = false;
        this.requestedPeerSnapshot = false;
        this.receivedPeerSnapshot = false;
        this.roomResetRequired = false;
        this.status = {
            state: 'local',
            detail: 'Shared sync is unavailable on this page.',
            peerCount: 0,
            connected: false,
            ready: false
        };

        this.originBootstrap = { kind: 'board-collab-bootstrap' };
        this.originLocalSnapshot = { kind: 'board-collab-local-snapshot' };
        this.originPosition = { kind: 'board-collab-local-position' };
        this.originRemoteSync = { kind: 'board-collab-remote-sync' };
        this.originRemoteRestore = { kind: 'board-collab-remote-restore' };
        this.originSharedStore = { kind: 'board-collab-shared-store' };
        this.originManualFlush = { kind: 'board-collab-manual-flush' };

        this.lastSnapshot = buildDefaultSnapshot(this.scope, this.caseId);

        this.handleDocUpdate = this.handleDocUpdate.bind(this);
        this.handleAfterTransaction = this.handleAfterTransaction.bind(this);
        this.handleAwarenessUpdate = this.handleAwarenessUpdate.bind(this);
        this.handleAwarenessChange = this.handleAwarenessChange.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }

    static async create(options = {}) {
        const session = new BoardCollabSession(options);
        await session.init();
        return session;
    }

    applyRevisionState(revision, sourceId = '') {
        const cleanRevision = Math.max(0, Math.round(toFiniteNumber(revision, 0)));
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

    async init() {
        if (!this.roomId || !this.store || typeof this.store.ensureBoardCollabClient !== 'function') {
            this.updateStatus({
                state: 'local',
                detail: 'Shared sync is unavailable on this page.',
                peerCount: 0
            });
            return this;
        }

        this.updateStatus({
            state: 'connecting',
            detail: 'Connecting live board...',
            peerCount: 0
        });

        const ensured = await this.store.ensureBoardCollabClient();
        if (!ensured.ok || !ensured.client) {
            this.updateStatus({
                state: 'local',
                detail: 'Shared sync is off. Board changes stay on this device.',
                peerCount: 0
            });
            return this;
        }

        this.client = ensured.client;
        this.instanceId = toTrimmedString(ensured.instanceId, '', 120).trim();
        this.userId = toTrimmedString(ensured.userId, '', 120).trim();
        this.profileName = toTrimmedString(ensured.profileName, '', 120).trim();
        this.peerColor = pickPeerColor(this.instanceId || this.profileName || this.roomId);
        this.indexedDbName = `rtf-board-room-${ensured.config.campaignId}-${this.roomId}`;

        this.doc.on('update', this.handleDocUpdate);
        this.doc.on('afterTransaction', this.handleAfterTransaction);
        this.awareness.on('update', this.handleAwarenessUpdate);
        this.awareness.on('change', this.handleAwarenessChange);
        this.awareness.setLocalState({
            user: this.buildLocalUserState(),
            cursor: null,
            selection: { nodeIds: [] },
            dragging: null,
            editing: null
        });

        this.persistence = new IndexeddbPersistence(this.indexedDbName, this.doc);
        try {
            await this.persistence.whenSynced;
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: IndexedDB sync failed', err);
        }

        const currentDocSnapshot = serializeDocSnapshot(this.doc, this.scope, this.caseId);
        const localDocPayload = sanitizeBoardSnapshot(currentDocSnapshot, {
            scope: this.scope,
            caseId: this.caseId
        });
        const seedPayload = sanitizeBoardSnapshot(
            typeof this.options.getSeedPayload === 'function'
                ? this.options.getSeedPayload()
                : buildDefaultSnapshot(this.scope, this.caseId),
            { scope: this.scope, caseId: this.caseId },
            localDocPayload
        );
        const livePayload = sanitizeBoardSnapshot(
            typeof this.options.getCurrentPayload === 'function'
                ? this.options.getCurrentPayload()
                : seedPayload,
            { scope: this.scope, caseId: this.caseId },
            localDocPayload
        );
        const livePayloadSig = buildSnapshotSignature(livePayload);
        this.lastSharedStoreSignature = livePayloadSig;
        const livePayloadHasContent = hasBoardContent(livePayload);

        const cloudRow = await this.store.loadBoardRoomSnapshot({
            roomId: this.roomId,
            scope: this.scope,
            caseId: this.caseId
        });
        let roomSnapshotSource = '';

        if (cloudRow.ok && cloudRow.snapshot) {
            const roomPayload = sanitizeBoardSnapshot(cloudRow.snapshot.payload, {
                scope: this.scope,
                caseId: this.caseId
            }, livePayloadHasContent ? livePayload : localDocPayload);
            const roomPayloadSig = buildSnapshotSignature(roomPayload);
            const localDocSig = buildSnapshotSignature(localDocPayload);
            const cloudUpdatedAt = Date.parse(cloudRow.snapshot.updatedAt || '') || cloudRow.snapshot.revision || 0;
            const localUpdatedAt = Math.max(0, localDocPayload.updatedAt || 0);
            this.lastSavedRevision = Math.max(0, cloudRow.snapshot.revision || 0);
            roomSnapshotSource = toTrimmedString(cloudRow.snapshot.updatedBy, '', 120).trim();
            const canonical = chooseCanonicalSnapshot([
                {
                    kind: 'room',
                    snapshot: roomPayload,
                    stamp: getSnapshotStamp(roomPayload, cloudUpdatedAt),
                    priority: 30
                },
                {
                    kind: 'local-doc',
                    snapshot: localDocPayload,
                    stamp: getSnapshotStamp(localDocPayload, localUpdatedAt),
                    priority: 20
                },
                {
                    kind: 'live-store',
                    snapshot: livePayload,
                    stamp: getSnapshotStamp(livePayload),
                    priority: 10
                }
            ], {
                kind: 'room',
                snapshot: roomPayload,
                stamp: getSnapshotStamp(roomPayload, cloudUpdatedAt),
                priority: 30
            });

            const canonicalPayload = canonical && canonical.snapshot ? canonical.snapshot : roomPayload;
            const canonicalSig = buildSnapshotSignature(canonicalPayload);
            const canonicalStamp = canonical && Number.isFinite(canonical.stamp) ? canonical.stamp : (cloudUpdatedAt || Date.now());
            const canonicalOrigin = canonical && canonical.kind === 'room'
                ? this.originRemoteRestore
                : this.originBootstrap;

            if (!hasBoardContent(localDocPayload) || localDocSig !== canonicalSig) {
                applySnapshotToDoc(
                    this.doc,
                    canonicalPayload,
                    this.scope,
                    this.caseId,
                    canonicalOrigin,
                    canonicalStamp || Date.now()
                );
            }

            if (canonical && canonical.kind !== 'room' && roomPayloadSig !== canonicalSig) {
                this.initialCloudFlushRequired = true;
            } else {
                this.persistSnapshotToSharedState(roomPayload, roomPayloadSig);
            }
        } else if (cloudRow.ok) {
            const canonicalSeed = sanitizeBoardSnapshot(
                hasBoardContent(livePayload)
                    ? livePayload
                    : (hasBoardContent(seedPayload) ? seedPayload : localDocPayload),
                { scope: this.scope, caseId: this.caseId },
                localDocPayload
            );
            const canonicalSeedSig = buildSnapshotSignature(canonicalSeed);
            const localDocSig = buildSnapshotSignature(localDocPayload);
            const seedStamp = Math.max(Date.now(), canonicalSeed.updatedAt || 0);

            if (!hasBoardContent(localDocPayload) || localDocSig !== canonicalSeedSig) {
                applySnapshotToDoc(this.doc, canonicalSeed, this.scope, this.caseId, this.originBootstrap, seedStamp);
            }

            const seeded = await this.store.saveBoardRoomSnapshot({
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId,
                payload: canonicalSeed,
                revision: seedStamp,
                updatedAt: new Date(seedStamp).toISOString(),
                updatedBy: this.instanceId,
                updatedByUser: this.userId || null,
                updatedByName: this.profileName || null,
                createOnly: true
            });

            if (seeded.ok && typeof this.store.appendBoardRoomHistorySnapshot === 'function') {
                const seedHistory = await this.store.appendBoardRoomHistorySnapshot({
                    roomId: this.roomId,
                    scope: this.scope,
                    caseId: this.caseId,
                    payload: canonicalSeed,
                    revision: seeded.revision || seedStamp,
                    capturedAt: seeded.updatedAt || new Date(seedStamp).toISOString(),
                    reason: 'seed'
                });
                if (seedHistory && seedHistory.ok) {
                    this.lastHistoryCapturedAt = Date.now();
                    this.lastHistorySignature = canonicalSeedSig;
                }
            }
            this.persistSnapshotToSharedState(canonicalSeed, canonicalSeedSig);
            if (seeded.ok) roomSnapshotSource = this.instanceId;

            if (!seeded.ok && seeded.reason !== 'exists') {
                console.warn('RTF_BOARD_COLLAB: Failed seeding board room', seeded.error || seeded.reason);
            }

            const canonicalRoom = await this.store.loadBoardRoomSnapshot({
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId
            });

            if (canonicalRoom.ok && canonicalRoom.snapshot) {
                const roomUpdatedAt = Date.parse(canonicalRoom.snapshot.updatedAt || '') || canonicalRoom.snapshot.revision || seedStamp;
                const roomPayload = sanitizeBoardSnapshot(canonicalRoom.snapshot.payload, {
                    scope: this.scope,
                    caseId: this.caseId
                }, canonicalSeed);
                this.lastSavedRevision = Math.max(0, canonicalRoom.snapshot.revision || 0);
                roomSnapshotSource = toTrimmedString(canonicalRoom.snapshot.updatedBy, '', 120).trim();
                if (buildSnapshotSignature(roomPayload) !== buildSnapshotSignature(serializeDocSnapshot(this.doc, this.scope, this.caseId))) {
                    applySnapshotToDoc(
                        this.doc,
                        roomPayload,
                        this.scope,
                        this.caseId,
                        this.originRemoteRestore,
                        roomUpdatedAt
                    );
                }
            }
        } else if (!hasBoardContent(localDocPayload)) {
            applySnapshotToDoc(this.doc, seedPayload, this.scope, this.caseId, this.originBootstrap, Date.now());
        }

        this.lastSnapshot = sanitizeBoardSnapshot(serializeDocSnapshot(this.doc, this.scope, this.caseId), {
            scope: this.scope,
            caseId: this.caseId
        });
        this.pendingSnapshot = this.lastSnapshot;
        this.applyRevisionState(this.lastSavedRevision, roomSnapshotSource || this.instanceId);
        if (!this.lastHistorySignature) this.lastHistorySignature = buildSnapshotSignature(this.lastSnapshot);

        if (buildSnapshotSignature(this.lastSnapshot) !== livePayloadSig
            && typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(this.lastSnapshot, { origin: this.originRemoteRestore });
        }

        try {
            await this.connectChannel(ensured.config);
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Channel connect failed', err);
            this.updateStatus({
                state: 'degraded',
                detail: 'Live board unavailable. Local board still works.',
                peerCount: this.remotePresence.size
            });
        }

        this.ready = true;
        this.updateStatus({
            state: this.connected ? 'live' : 'degraded',
            detail: this.connected ? 'Live board connected.' : 'Live board unavailable. Local board still works.',
            peerCount: this.remotePresence.size
        });
        this.scheduleMirror();
        if (this.initialCloudFlushRequired) {
            this.initialCloudFlushRequired = false;
            this.scheduleCloudFlush();
        }
        this.renderRemoteState();
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        return this;
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
                console.warn('RTF_BOARD_COLLAB: Status callback failed', err);
            }
        }
    }

    buildLocalUserState() {
        return {
            instanceId: this.instanceId,
            userId: this.userId,
            profileName: this.profileName || 'Player',
            color: this.peerColor
        };
    }

    buildPresenceLocks() {
        const editing = this.awareness.getLocalState() && this.awareness.getLocalState().editing;
        if (!editing || !editing.nodeId) return [];
        return [`board.${this.roomId}.node.${editing.nodeId}.text`];
    }

    async connectChannel(config) {
        if (!this.client || !config) return;
        const channelName = `rtf-board-${config.campaignId}-${this.roomId}`;
        const channel = this.client.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: this.instanceId || undefined }
            }
        });

        channel.on('broadcast', { event: 'y-sync' }, ({ payload }) => {
            if (!payload || !payload.update) return;
            this.handleSyncMessage(payload.update);
        });

        channel.on('broadcast', { event: 'y-awareness' }, ({ payload }) => {
            if (!payload || !payload.update) return;
            this.handleAwarenessMessage(payload.update);
        });
        channel.on('broadcast', { event: BOARD_ADMIN_EVENT_APPLY_SNAPSHOT }, ({ payload }) => {
            this.handleAdminSnapshotMessage(payload);
        });
        channel.on('broadcast', { event: BOARD_ADMIN_EVENT_BUST }, ({ payload }) => {
            this.handleAdminBustMessage(payload);
        });
        channel.on('broadcast', { event: BOARD_SYNC_EVENT_REQUEST_SNAPSHOT }, ({ payload }) => {
            this.handleSnapshotRequestMessage(payload);
        });
        channel.on('broadcast', { event: BOARD_SYNC_EVENT_SNAPSHOT }, ({ payload }) => {
            this.handleSnapshotMessage(payload);
        });
        channel.on('broadcast', { event: BOARD_SYNC_EVENT_POSITION_CHANGES }, ({ payload }) => {
            this.handlePositionMessage(payload);
        });

        const onPresence = () => {
            const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
            this.handlePresenceState(state);
        };
        channel.on('presence', { event: 'sync' }, onPresence);
        channel.on('presence', { event: 'join' }, onPresence);
        channel.on('presence', { event: 'leave' }, onPresence);

        this.updateStatus({
            state: 'connecting',
            detail: 'Joining live board room...',
            peerCount: this.remotePresence.size
        });

        await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                this.connected = false;
                this.updateStatus({
                    state: 'degraded',
                    detail: 'Live board timed out while joining.',
                    peerCount: this.remotePresence.size
                });
                if (!settled) {
                    settled = true;
                    reject(new Error('Board collaboration channel timed out.'));
                }
            }, 10000);
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.updateStatus({
                        state: 'live',
                        detail: 'Live board connected.',
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
                    this.updateStatus({
                        state: 'degraded',
                        detail: status === 'CLOSED'
                            ? 'Live board disconnected.'
                            : 'Live board is unavailable right now.',
                        peerCount: this.remotePresence.size
                    });
                    if (!settled) {
                        settled = true;
                        reject(new Error(`Board collaboration channel status: ${status}`));
                    }
                }
            });
        });

        this.channel = channel;
        await this.refreshPresenceTracking();
        this.broadcastLocalAwareness();
        this.sendSyncStep1();
        this.handlePresenceState(typeof channel.presenceState === 'function' ? channel.presenceState() : {});
    }

    async sendBroadcast(event, payload) {
        if (!this.channel || !this.connected || typeof this.channel.send !== 'function') return;
        try {
            const result = await this.channel.send({
                type: 'broadcast',
                event,
                payload
            });
            if (result && result !== 'ok') {
                throw new Error(`Broadcast returned ${result}`);
            }
        } catch (err) {
            console.warn(`RTF_BOARD_COLLAB: Broadcast failed for ${event}`, err);
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
            console.warn('RTF_BOARD_COLLAB: Invalid sync payload', err);
            return;
        }

        const decoder = decoding.createDecoder(update);
        const encoder = encoding.createEncoder();
        try {
            syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.originRemoteSync, (error) => {
                console.warn('RTF_BOARD_COLLAB: Sync message failed', error);
            });
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Sync decode failed', err);
            return;
        }

        if (encoding.hasContent(encoder)) {
            this.sendBroadcast('y-sync', { update: encodeBase64(encoding.toUint8Array(encoder)) });
        }
    }

    broadcastLocalAwareness(clientIds = [this.awareness.clientID]) {
        const update = encodeAwarenessUpdate(this.awareness, clientIds);
        this.sendBroadcast('y-awareness', { update: encodeBase64(update) });
    }

    handleAwarenessMessage(encoded) {
        try {
            applyAwarenessUpdate(this.awareness, decodeBase64(encoded), this);
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Awareness decode failed', err);
        }
    }

    handleAwarenessUpdate({ added, updated, removed }, origin) {
        if (this.destroyed) return;
        if (origin !== 'local') {
            this.renderRemoteState();
            return;
        }

        const changed = [...added, ...updated, ...removed];
        if (!changed.length) return;
        this.broadcastLocalAwareness(changed);
        this.renderRemoteState();
    }

    handleAwarenessChange() {
        if (this.destroyed) return;
        this.renderRemoteState();
    }

    handleAdminSnapshotMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const nextPayload = sanitizeBoardSnapshot(payload.payload, {
            scope: this.scope,
            caseId: this.caseId
        }, this.pendingSnapshot || this.lastSnapshot);
        const stamp = Date.parse(payload.updatedAt || '') || toFiniteNumber(payload.revision, Date.now()) || Date.now();
        this.roomResetRequired = false;
        applySnapshotToDoc(
            this.doc,
            nextPayload,
            this.scope,
            this.caseId,
            this.originRemoteRestore,
            stamp
        );
        this.applyRevisionState(payload.revision, payload.sentBy || payload.updatedBy || '');
        this.lastHistorySignature = buildSnapshotSignature(nextPayload);
        this.lastHistoryCapturedAt = Date.now();
        this.updateStatus({
            state: this.connected ? 'live' : 'degraded',
            detail: this.connected ? 'Live board updated by admin.' : 'Board snapshot restored by admin.',
            peerCount: this.remotePresence.size
        });
    }

    handleAdminBustMessage(payload) {
        if (this.destroyed) return;
        this.roomResetRequired = true;
        this.connected = false;
        if (this.pendingFlushTimer) {
            clearTimeout(this.pendingFlushTimer);
            this.pendingFlushTimer = null;
        }
        this.pendingFlushPromise = null;
        const reason = payload && payload.reason ? String(payload.reason) : 'reset';
        this.updateStatus({
            state: 'degraded',
            detail: `Live room was reset by admin (${reason}). Reload from a clean browser or restore a snapshot.`,
            peerCount: this.remotePresence.size
        });
    }

    requestPeerSnapshotIfNeeded(force = false) {
        if (this.destroyed || !this.connected) return;
        if (!force && (this.requestedPeerSnapshot || !this.remotePresence.size)) return;
        this.requestedPeerSnapshot = true;
        this.sendBroadcast(BOARD_SYNC_EVENT_REQUEST_SNAPSHOT, {
            roomId: this.roomId,
            scope: this.scope,
            caseId: this.caseId,
            requestedBy: this.instanceId,
            requestedAt: Date.now()
        });
    }

    handleSnapshotRequestMessage(payload) {
        if (this.destroyed || !this.connected || !payload || typeof payload !== 'object') return;
        const requestedBy = toTrimmedString(payload.requestedBy, '', 120).trim();
        if (requestedBy && requestedBy === this.instanceId) return;
        const snapshot = this.getSnapshot();
        const signature = buildSnapshotSignature(snapshot);
        if (!signature) return;
        const revision = Math.max(1, this.lastSavedRevision || 0);
        this.applyRevisionState(revision, this.instanceId);
        const stamp = Math.max(Date.now(), snapshot.updatedAt || 0);
        this.sendBroadcast(BOARD_SYNC_EVENT_SNAPSHOT, {
            roomId: this.roomId,
            scope: this.scope,
            caseId: this.caseId,
            requestedBy,
            sentBy: this.instanceId,
            revision,
            updatedAt: new Date(stamp).toISOString(),
            signature,
            payload: snapshot
        });
    }

    handleSnapshotMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const sentBy = toTrimmedString(payload.sentBy, '', 120).trim();
        if (!sentBy || sentBy === this.instanceId) return;
        const requestedBy = toTrimmedString(payload.requestedBy, '', 120).trim();
        if (requestedBy && requestedBy !== this.instanceId) return;
        if (compareRevisionMeta(payload.revision, sentBy, this.lastSavedRevision, this.lastSnapshotSource) < 0) return;
        const nextPayload = sanitizeBoardSnapshot(payload.payload, {
            scope: this.scope,
            caseId: this.caseId
        }, this.pendingSnapshot || this.lastSnapshot);
        const nextSig = buildSnapshotSignature(nextPayload);
        if (!nextSig) return;
        const currentSig = buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot);
        this.receivedPeerSnapshot = true;
        if (nextSig === currentSig) {
            this.applyRevisionState(payload.revision, sentBy);
            return;
        }
        const stamp = Date.parse(payload.updatedAt || '') || toFiniteNumber(payload.revision, Date.now()) || Date.now();
        applySnapshotToDoc(
            this.doc,
            nextPayload,
            this.scope,
            this.caseId,
            this.originRemoteRestore,
            stamp
        );
        this.applyRevisionState(payload.revision, sentBy);
    }

    handlePositionMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const sentBy = toTrimmedString(payload.sentBy, '', 120).trim();
        if (sentBy && sentBy === this.instanceId) return;
        if (compareRevisionMeta(payload.revision, sentBy, this.lastSavedRevision, this.lastSnapshotSource) < 0) return;
        const changes = Array.isArray(payload.changes)
            ? payload.changes
                .map((entry) => {
                    if (!entry || typeof entry !== 'object') return null;
                    const id = toTrimmedString(entry.id, '', 120).trim();
                    if (!id) return null;
                    const x = Math.round(toFiniteNumber(entry.x, NaN));
                    const y = Math.round(toFiniteNumber(entry.y, NaN));
                    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                    return { id, x, y };
                })
                .filter(Boolean)
            : [];
        if (!changes.length) return;
        const stamp = Date.parse(payload.updatedAt || '') || toFiniteNumber(payload.revision, Date.now()) || Date.now();
        const changed = applyPositionChangesToDoc(this.doc, changes, this.originRemoteSync, stamp);
        this.applyRevisionState(payload.revision, sentBy);
        if (!changed) return;
    }

    handlePresenceState(state) {
        const raw = state && typeof state === 'object' ? state : {};
        const peers = new Map();

        Object.keys(raw).forEach((presenceKey) => {
            const entries = Array.isArray(raw[presenceKey]) ? raw[presenceKey] : [];
            entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') return;
                const instanceId = toTrimmedString(entry.instanceId, '', 120).trim();
                if (!instanceId || instanceId === this.instanceId) return;
                const locks = Array.isArray(entry.locks)
                    ? entry.locks.map((lock) => toTrimmedString(lock, '', 240).trim()).filter(Boolean)
                    : [];
                peers.set(instanceId, {
                    instanceId,
                    profileName: toTrimmedString(entry.profileName, '', 120).trim(),
                    color: toTrimmedString(entry.color, '', 40).trim() || pickPeerColor(instanceId),
                    locks,
                    ts: Math.max(0, parseInt(entry.ts, 10) || 0)
                });
            });
        });

        this.remotePresence = peers;
        this.updateStatus({
            peerCount: peers.size,
            detail: this.roomResetRequired
                ? this.status.detail
                : this.connected
                ? (peers.size
                    ? `Live board connected with ${peers.size} other ${peers.size === 1 ? 'player' : 'players'}.`
                    : 'Live board connected. Only you are here.')
                : this.status.detail
        });
        if (peers.size && !this.receivedPeerSnapshot) {
            this.requestPeerSnapshotIfNeeded();
        }
        this.renderRemoteState();
    }

    async refreshPresenceTracking() {
        if (!this.channel || !this.connected || typeof this.channel.track !== 'function') return;
        try {
            const result = await this.channel.track({
                instanceId: this.instanceId,
                userId: this.userId || '',
                profileName: this.profileName || '',
                color: this.peerColor,
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId || '',
                locks: this.buildPresenceLocks(),
                ts: Date.now()
            });
            if (result && result !== 'ok') {
                throw new Error(`Presence track returned ${result}`);
            }
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Presence track failed', err);
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
        const next = sanitizeBoardSnapshot(serializeDocSnapshot(this.doc, this.scope, this.caseId), {
            scope: this.scope,
            caseId: this.caseId
        });
        const diff = diffBoardSnapshots(this.lastSnapshot, next);
        const origin = transaction ? transaction.origin : null;
        this.lastSnapshot = next;
        this.pendingSnapshot = next;

        if (this.ready) {
            this.scheduleMirror();
            const shouldQueueCloudFlush = !this.roomResetRequired && (
                !origin
                || origin === this.originLocalSnapshot
                || origin === this.originSharedStore
                || origin === this.originManualFlush
            );
            if (shouldQueueCloudFlush) {
                this.scheduleCloudFlush();
            }
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

        this.renderRemoteState();
    }

    scheduleMirror() {
        if (!this.ready || this.destroyed) return;
        if (this.pendingMirrorTimer) clearTimeout(this.pendingMirrorTimer);
        this.pendingMirrorTimer = setTimeout(() => {
            this.pendingMirrorTimer = null;
            if (!this.pendingSnapshot || typeof this.store.mirrorBoardSnapshotToState !== 'function') return;
            this.store.mirrorBoardSnapshotToState({
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId,
                payload: this.pendingSnapshot
            });
        }, LOCAL_MIRROR_DELAY_MS);
    }

    scheduleCloudFlush() {
        if (this.roomResetRequired || !this.ready || this.destroyed || typeof this.store.saveBoardRoomSnapshot !== 'function') return;
        if (this.pendingFlushTimer) clearTimeout(this.pendingFlushTimer);
        this.pendingFlushTimer = setTimeout(() => {
            this.pendingFlushTimer = null;
            this.flushSnapshotNow().catch((err) => {
                console.warn('RTF_BOARD_COLLAB: Scheduled flush failed', err);
            });
        }, CLOUD_FLUSH_DELAY_MS);
    }

    persistSnapshotToSharedState(snapshot, signature = '') {
        if (!snapshot || !this.store) return false;
        const snapshotSig = signature || buildSnapshotSignature(snapshot);
        if (!snapshotSig || snapshotSig === this.lastSharedStoreSignature) return false;
        try {
            if (this.scope === 'campaign' && typeof this.store.updateCampaignMetaBoard === 'function') {
                this.store.updateCampaignMetaBoard(snapshot);
                this.lastSharedStoreSignature = snapshotSig;
                return true;
            }
            if (typeof this.store.updateBoard === 'function') {
                this.store.updateBoard(snapshot, this.caseId);
                this.lastSharedStoreSignature = snapshotSig;
                return true;
            }
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Shared store snapshot persist failed', err);
        }
        return false;
    }

    async flushSnapshotNow(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        if (this.pendingFlushPromise) return this.pendingFlushPromise;
        if (this.roomResetRequired) {
            return { ok: false, reason: 'room-reset-required' };
        }
        if (!this.pendingSnapshot || typeof this.store.saveBoardRoomSnapshot !== 'function') {
            return { ok: false, reason: 'no-snapshot' };
        }

        const snapshotToSave = sanitizeBoardSnapshot(this.pendingSnapshot, {
            scope: this.scope,
            caseId: this.caseId
        });
        const snapshotSig = buildSnapshotSignature(snapshotToSave);
        const shouldCaptureHistory = !!(
            typeof this.store.appendBoardRoomHistorySnapshot === 'function'
            && snapshotSig
            && snapshotSig !== this.lastHistorySignature
            && (opts.forceHistory || !this.lastHistoryCapturedAt || (Date.now() - this.lastHistoryCapturedAt) >= HISTORY_CAPTURE_MIN_INTERVAL_MS)
        );
        const nextRevision = Math.max(1, this.lastSavedRevision + 1);
        this.applyRevisionState(nextRevision, this.instanceId);

        this.pendingFlushPromise = this.store.saveBoardRoomSnapshot({
            roomId: this.roomId,
            scope: this.scope,
            caseId: this.caseId,
            payload: snapshotToSave,
            revision: nextRevision,
            updatedAt: new Date(Math.max(Date.now(), snapshotToSave.updatedAt || 0)).toISOString(),
            updatedBy: this.instanceId,
            updatedByUser: this.userId || null,
            updatedByName: this.profileName || null
        }).then((result) => {
            if (result && result.ok) {
                this.applyRevisionState(result.revision || nextRevision, this.instanceId);
                this.persistSnapshotToSharedState(snapshotToSave, snapshotSig);
            }
            if (result && result.reason === 'stale' && result.snapshot) {
                const remoteSnapshot = sanitizeBoardSnapshot(result.snapshot.payload, {
                    scope: this.scope,
                    caseId: this.caseId
                }, this.pendingSnapshot || this.lastSnapshot);
                const remoteSig = buildSnapshotSignature(remoteSnapshot);
                const currentSig = buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot);
                this.applyRevisionState(result.snapshot.revision, result.snapshot.updatedBy || result.updatedBy || '');
                this.persistSnapshotToSharedState(remoteSnapshot, remoteSig);
                if (remoteSig && remoteSig !== currentSig) {
                    const stamp = Date.parse(result.snapshot.updatedAt || '') || toFiniteNumber(result.snapshot.revision, Date.now()) || Date.now();
                    applySnapshotToDoc(
                        this.doc,
                        remoteSnapshot,
                        this.scope,
                        this.caseId,
                        this.originRemoteRestore,
                        stamp
                    );
                }
            }
            if (!result || !result.ok || !shouldCaptureHistory) return result;
            return this.store.appendBoardRoomHistorySnapshot({
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId,
                payload: snapshotToSave,
                revision: result.revision || Date.now(),
                capturedAt: result.updatedAt || new Date().toISOString(),
                reason: opts.historyReason || (opts.forceHistory ? 'manual' : 'autosave'),
                capturedBy: this.instanceId,
                capturedByUser: this.userId || null,
                capturedByName: this.profileName || null
            }).then((historyResult) => {
                if (historyResult && historyResult.ok) {
                    this.lastHistorySignature = snapshotSig;
                    this.lastHistoryCapturedAt = Date.now();
                }
                return {
                    ...result,
                    historyId: historyResult && historyResult.ok ? historyResult.id : 0,
                    historyError: historyResult && !historyResult.ok ? (historyResult.error || historyResult.reason || '') : ''
                };
            });
        }).finally(() => {
            this.pendingFlushPromise = null;
        });

        return this.pendingFlushPromise;
    }

    getSnapshot() {
        return sanitizeBoardSnapshot(this.pendingSnapshot || this.lastSnapshot, {
            scope: this.scope,
            caseId: this.caseId
        });
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
        return !!this.ready && !this.roomResetRequired;
    }

    syncSnapshot(payload, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const next = sanitizeBoardSnapshot(payload, {
            scope: this.scope,
            caseId: this.caseId
        }, this.pendingSnapshot || this.lastSnapshot);
        const nextSig = buildSnapshotSignature(next);
        if (opts.sharedStatePersisted && nextSig) {
            this.lastSharedStoreSignature = nextSig;
        }
        if (nextSig && nextSig === buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot)) {
            if (opts.flushNow) {
                return this.flushSnapshotNow({
                    forceHistory: !!opts.forceHistory,
                    historyReason: opts.historyReason || ''
                });
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }
        const stamp = Date.now();
        applySnapshotToDoc(this.doc, next, this.scope, this.caseId, this.originLocalSnapshot, stamp);
        if (opts.flushNow) {
            return this.flushSnapshotNow({
                forceHistory: !!opts.forceHistory,
                historyReason: opts.historyReason || ''
            });
        }
        return Promise.resolve({ ok: true });
    }

    applySharedStoreSnapshot(payload, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const next = sanitizeBoardSnapshot(payload, {
            scope: this.scope,
            caseId: this.caseId
        }, this.pendingSnapshot || this.lastSnapshot);
        const nextSig = buildSnapshotSignature(next);
        if (nextSig) this.lastSharedStoreSignature = nextSig;
        if (nextSig && nextSig === buildSnapshotSignature(this.pendingSnapshot || this.lastSnapshot)) {
            return false;
        }
        const stamp = Math.max(Date.now(), next.updatedAt || 0);
        applySnapshotToDoc(this.doc, next, this.scope, this.caseId, this.originSharedStore, stamp);
        if (opts.flushNow) {
            this.flushSnapshotNow({
                forceHistory: !!opts.forceHistory,
                historyReason: opts.historyReason || 'shared-store'
            }).catch((err) => {
                console.warn('RTF_BOARD_COLLAB: Shared-store flush failed', err);
            });
        }
        return true;
    }

    updateNodePositions(changes, options = {}) {
        const list = Array.isArray(changes) ? changes : [];
        if (!list.length) return;
        const stamp = Date.now();
        if (!applyPositionChangesToDoc(this.doc, list, this.originPosition, stamp)) return;
        const opts = options && typeof options === 'object' ? options : {};
        const normalizedChanges = list
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const id = toTrimmedString(entry.id, '', 120).trim();
                if (!id) return null;
                const x = Math.round(toFiniteNumber(entry.x, NaN));
                const y = Math.round(toFiniteNumber(entry.y, NaN));
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return { id, x, y };
            })
            .filter(Boolean);
        if (normalizedChanges.length) {
            const revision = Math.max(1, this.lastSavedRevision + 1);
            this.applyRevisionState(revision, this.instanceId);
            this.sendBroadcast(BOARD_SYNC_EVENT_POSITION_CHANGES, {
                roomId: this.roomId,
                scope: this.scope,
                caseId: this.caseId,
                revision,
                updatedAt: new Date(stamp).toISOString(),
                sentBy: this.instanceId,
                sentByUser: this.userId || null,
                sentByName: this.profileName || '',
                changes: normalizedChanges
            }).catch(() => { });
        }
        if (opts.flushNow) {
            this.flushSnapshotNow().catch((err) => {
                console.warn('RTF_BOARD_COLLAB: Position flush failed', err);
            });
        }
    }

    setCursor(cursor) {
        const clean = cursor && typeof cursor === 'object'
            ? { x: roundCursor(cursor.x), y: roundCursor(cursor.y) }
            : null;
        this.awareness.setLocalStateField('cursor', clean);
    }

    setSelection(nodeIds = []) {
        const ids = Array.isArray(nodeIds)
            ? Array.from(new Set(nodeIds.map((entry) => toTrimmedString(entry, '', 120).trim()).filter(Boolean)))
            : [];
        this.awareness.setLocalStateField('selection', { nodeIds: ids });
    }

    setDragging(dragging = null) {
        if (!dragging || typeof dragging !== 'object' || !dragging.nodeId) {
            this.awareness.setLocalStateField('dragging', null);
            return;
        }
        this.awareness.setLocalStateField('dragging', {
            nodeId: toTrimmedString(dragging.nodeId, '', 120).trim(),
            x: roundCursor(dragging.x),
            y: roundCursor(dragging.y)
        });
    }

    setEditing(editing = null) {
        if (!editing || typeof editing !== 'object' || !editing.nodeId) {
            this.awareness.setLocalStateField('editing', null);
            this.refreshPresenceTracking().catch(() => { });
            return;
        }
        this.awareness.setLocalStateField('editing', {
            nodeId: toTrimmedString(editing.nodeId, '', 120).trim(),
            field: editing.field === 'body' ? 'body' : 'title'
        });
        this.refreshPresenceTracking().catch(() => { });
    }

    getRemoteTextLock(nodeId = '') {
        const cleanId = toTrimmedString(nodeId, '', 120).trim();
        if (!cleanId) return null;
        const targetLock = `board.${this.roomId}.node.${cleanId}.text`;
        for (const peer of this.remotePresence.values()) {
            if (!peer || !Array.isArray(peer.locks)) continue;
            if (peer.locks.includes(targetLock)) {
                return {
                    instanceId: peer.instanceId,
                    profileName: peer.profileName || 'Another player',
                    color: peer.color || pickPeerColor(peer.instanceId)
                };
            }
        }
        return null;
    }

    getRemotePeerStates() {
        const out = [];
        const states = this.awareness.getStates();
        states.forEach((state, clientId) => {
            if (!state || clientId === this.awareness.clientID) return;
            const user = state.user && typeof state.user === 'object' ? state.user : {};
            const instanceId = toTrimmedString(user.instanceId, String(clientId), 120).trim() || String(clientId);
            const presence = this.remotePresence.get(instanceId) || null;
            out.push({
                clientId,
                instanceId,
                profileName: toTrimmedString(user.profileName, presence && presence.profileName ? presence.profileName : 'Player', 120).trim() || 'Player',
                color: toTrimmedString(user.color, presence && presence.color ? presence.color : pickPeerColor(instanceId), 40).trim()
                    || pickPeerColor(instanceId),
                cursor: state.cursor && typeof state.cursor === 'object'
                    ? { x: toFiniteNumber(state.cursor.x, 0), y: toFiniteNumber(state.cursor.y, 0) }
                    : null,
                selection: state.selection && Array.isArray(state.selection.nodeIds)
                    ? state.selection.nodeIds.map((entry) => toTrimmedString(entry, '', 120).trim()).filter(Boolean)
                    : [],
                dragging: state.dragging && typeof state.dragging === 'object' && state.dragging.nodeId
                    ? {
                        nodeId: toTrimmedString(state.dragging.nodeId, '', 120).trim(),
                        x: toFiniteNumber(state.dragging.x, 0),
                        y: toFiniteNumber(state.dragging.y, 0)
                    }
                    : null,
                editing: state.editing && typeof state.editing === 'object' && state.editing.nodeId
                    ? {
                        nodeId: toTrimmedString(state.editing.nodeId, '', 120).trim(),
                        field: state.editing.field === 'body' ? 'body' : 'title'
                    }
                    : null
            });
        });
        return out;
    }

    ensureCursorLayer() {
        let layer = document.getElementById('board-cursor-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'board-cursor-layer';
            layer.className = 'board-cursor-layer';
            document.body.appendChild(layer);
        }
        return layer;
    }

    renderRemoteCursors() {
        const layer = this.ensureCursorLayer();
        const peers = this.getRemotePeerStates();
        const seen = new Set();
        peers.forEach((peer) => {
            if (!peer.cursor) return;
            const screen = typeof this.options.worldToScreen === 'function'
                ? this.options.worldToScreen(peer.cursor)
                : null;
            if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
            const cursorId = `board-remote-cursor-${peer.instanceId}`;
            let cursorEl = document.getElementById(cursorId);
            if (!cursorEl) {
                cursorEl = document.createElement('div');
                cursorEl.id = cursorId;
                cursorEl.className = 'board-remote-cursor';
                cursorEl.innerHTML = `
                    <div class="board-remote-cursor-dot"></div>
                    <div class="board-remote-cursor-label"></div>
                `;
                layer.appendChild(cursorEl);
            }
            cursorEl.style.setProperty('--peer-color', peer.color);
            cursorEl.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
            const labelEl = cursorEl.querySelector('.board-remote-cursor-label');
            if (labelEl) {
                let label = peer.profileName;
                if (peer.dragging && peer.dragging.nodeId) label += ' dragging';
                else if (peer.editing && peer.editing.nodeId) label += ' editing';
                labelEl.textContent = label;
            }
            seen.add(cursorId);
        });

        Array.from(layer.children).forEach((child) => {
            if (!seen.has(child.id)) child.remove();
        });
    }

    syncRemoteNodeDecorations() {
        document.querySelectorAll('.node.remote-selected, .node.remote-editing, .node.remote-dragging').forEach((nodeEl) => {
            nodeEl.classList.remove('remote-selected', 'remote-editing', 'remote-dragging');
            nodeEl.style.removeProperty('--remote-peer-color');
            nodeEl.removeAttribute('data-remote-selected-by');
            nodeEl.removeAttribute('data-remote-editing-by');
        });

        const peers = this.getRemotePeerStates();
        const selectedByNode = new Map();
        const editingByNode = new Map();
        const draggingNodeIds = new Set();

        peers.forEach((peer) => {
            peer.selection.forEach((nodeId) => {
                if (!selectedByNode.has(nodeId)) selectedByNode.set(nodeId, peer);
            });
            if (peer.editing && peer.editing.nodeId && !editingByNode.has(peer.editing.nodeId)) {
                editingByNode.set(peer.editing.nodeId, peer);
            }
            if (peer.dragging && peer.dragging.nodeId) draggingNodeIds.add(peer.dragging.nodeId);
        });

        selectedByNode.forEach((peer, nodeId) => {
            const el = document.getElementById(nodeId);
            if (!el) return;
            el.classList.add('remote-selected');
            el.style.setProperty('--remote-peer-color', peer.color);
            el.setAttribute('data-remote-selected-by', peer.profileName);
        });

        editingByNode.forEach((peer, nodeId) => {
            const el = document.getElementById(nodeId);
            if (!el) return;
            el.classList.add('remote-editing');
            el.style.setProperty('--remote-peer-color', peer.color);
            el.setAttribute('data-remote-editing-by', peer.profileName);
        });

        draggingNodeIds.forEach((nodeId) => {
            const el = document.getElementById(nodeId);
            if (!el) return;
            el.classList.add('remote-dragging');
        });
    }

    renderRemoteState() {
        if (this.destroyed) return;
        this.renderRemoteCursors();
        this.syncRemoteNodeDecorations();
    }

    handleVisibilityChange() {
        if (!document.hidden) return;
        this.flushSnapshotNow().catch(() => { });
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

        try {
            await this.flushSnapshotNow();
        } catch (err) {
            console.warn('RTF_BOARD_COLLAB: Final flush failed', err);
        }

        try {
            this.awareness.setLocalState(null);
        } catch (err) { }

        this.connected = false;
        this.ready = false;
        this.updateStatus({
            state: 'local',
            detail: 'Live board disconnected.',
            peerCount: 0
        });

        if (this.channel && this.client) {
            try {
                if (typeof this.channel.untrack === 'function') {
                    try { await this.channel.untrack(); } catch (err) { }
                }
                await this.client.removeChannel(this.channel);
            } catch (err) {
                console.warn('RTF_BOARD_COLLAB: Failed removing channel', err);
            }
        }

        if (this.persistence && typeof this.persistence.destroy === 'function') {
            try {
                await this.persistence.destroy();
            } catch (err) { }
        }

        this.awareness.off('update', this.handleAwarenessUpdate);
        this.awareness.off('change', this.handleAwarenessChange);
        this.doc.off('update', this.handleDocUpdate);
        this.doc.off('afterTransaction', this.handleAfterTransaction);
        this.doc.destroy();
        const layer = document.getElementById('board-cursor-layer');
        if (layer) layer.remove();
    }
}

const api = {
    createSession(options = {}) {
        return BoardCollabSession.create(options);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.RTF_BOARD_COLLAB = api;
}

export { BoardCollabSession };
export default api;
