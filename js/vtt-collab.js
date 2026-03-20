const LOCAL_MIRROR_DELAY_MS = 120;
const CLOUD_FLUSH_DELAY_MS = 1000;
const DEFAULT_VTT_CELL_PX = 70;
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

const pickPeerColor = (seed = '') => {
    let hash = 0;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
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
            tokens: [],
            fog: []
        }
    ],
    initiative: {
        entries: [],
        round: 1,
        activeEntryId: ''
    }
});

const sanitizePositionChange = (entry) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const sceneId = toTrimmedString(source.sceneId, '', 120).trim();
    const tokenId = toTrimmedString(source.tokenId, '', 120).trim();
    if (!sceneId || !tokenId) return null;
    return {
        sceneId,
        tokenId,
        x: Math.max(0, Math.round(toFiniteNumber(source.x, 0))),
        y: Math.max(0, Math.round(toFiniteNumber(source.y, 0)))
    };
};

const applyTokenPositionChanges = (snapshot, changes, coerceSnapshot) => {
    const clean = coerceSnapshot(snapshot);
    const next = deepClone(clean);
    const applied = [];

    (Array.isArray(changes) ? changes : []).forEach((change) => {
        const cleanChange = sanitizePositionChange(change);
        if (!cleanChange) return;
        const scene = Array.isArray(next.scenes)
            ? next.scenes.find((entry) => entry && entry.id === cleanChange.sceneId)
            : null;
        if (!scene || !Array.isArray(scene.tokens)) return;
        const token = scene.tokens.find((entry) => entry && entry.id === cleanChange.tokenId);
        if (!token) return;
        if (token.x === cleanChange.x && token.y === cleanChange.y) return;
        token.x = cleanChange.x;
        token.y = cleanChange.y;
        applied.push(cleanChange);
    });

    return {
        snapshot: applied.length ? coerceSnapshot(next) : clean,
        applied
    };
};

class VTTCollabSession {
    constructor(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        this.options = opts;
        this.roomId = toTrimmedString(opts.roomId, '', 160).trim();
        this.caseId = toTrimmedString(opts.caseId, 'case_primary', 120).trim() || 'case_primary';
        this.store = opts.store || null;
        this.client = null;
        this.channel = null;
        this.connected = false;
        this.ready = false;
        this.destroyed = false;
        this.instanceId = '';
        this.userId = '';
        this.profileName = '';
        this.peerColor = '';
        this.lastSavedRevision = 0;
        this.pendingMirrorTimer = null;
        this.pendingFlushTimer = null;
        this.pendingFlushPromise = null;
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

    buildLocalPresence() {
        return {
            instanceId: this.instanceId,
            userId: this.userId || '',
            profileName: this.profileName || 'Player',
            color: this.peerColor,
            roomId: this.roomId,
            caseId: this.caseId,
            activeSceneId: this.lastSnapshot && this.lastSnapshot.activeSceneId
                ? String(this.lastSnapshot.activeSceneId)
                : '',
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
        this.instanceId = toTrimmedString(ensured.instanceId, '', 120).trim();
        this.userId = toTrimmedString(ensured.userId, '', 120).trim();
        this.profileName = toTrimmedString(ensured.profileName, '', 120).trim();
        this.peerColor = pickPeerColor(this.instanceId || this.profileName || this.roomId);

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

        let roomSnapshot = null;
        const cloudRow = typeof this.store.loadVTTRoomSnapshot === 'function'
            ? await this.store.loadVTTRoomSnapshot({
                roomId: this.roomId,
                caseId: this.caseId
            })
            : { ok: false, reason: 'unsupported' };

        if (cloudRow && cloudRow.ok && cloudRow.snapshot) {
            roomSnapshot = this.coerceSnapshot(cloudRow.snapshot.payload);
            this.lastSavedRevision = Math.max(0, toNonNegativeInt(cloudRow.snapshot.revision, 0));
        } else {
            roomSnapshot = currentPayload;
            if (typeof this.store.saveVTTRoomSnapshot === 'function') {
                const seedStamp = Date.now();
                const seeded = await this.store.saveVTTRoomSnapshot({
                    roomId: this.roomId,
                    caseId: this.caseId,
                    payload: roomSnapshot,
                    revision: seedStamp,
                    updatedAt: new Date(seedStamp).toISOString(),
                    updatedBy: this.instanceId,
                    updatedByUser: this.userId || null,
                    updatedByName: this.profileName || null,
                    createOnly: true
                });
                if (seeded && seeded.ok) {
                    this.lastSavedRevision = Math.max(this.lastSavedRevision, seedStamp, seeded.revision || 0);
                } else if (seeded && seeded.reason === 'exists' && typeof this.store.loadVTTRoomSnapshot === 'function') {
                    const canonical = await this.store.loadVTTRoomSnapshot({
                        roomId: this.roomId,
                        caseId: this.caseId
                    });
                    if (canonical && canonical.ok && canonical.snapshot) {
                        roomSnapshot = this.coerceSnapshot(canonical.snapshot.payload);
                        this.lastSavedRevision = Math.max(this.lastSavedRevision, canonical.snapshot.revision || 0);
                    }
                } else if (seeded && !seeded.ok) {
                    console.warn('RTF_VTT_COLLAB: Failed seeding live VTT room', seeded.error || seeded.reason);
                }
            }
        }

        this.lastSnapshot = this.coerceSnapshot(roomSnapshot || currentPayload || seedPayload);
        this.pendingSnapshot = this.lastSnapshot;

        if (stableStringify(this.lastSnapshot) !== stableStringify(currentPayload)
            && typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(this.lastSnapshot, { origin: 'remote-restore' });
        }

        try {
            await this.connectChannel(ensured.config);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Channel connect failed', err);
            this.updateStatus({
                state: 'degraded',
                detail: 'Live VTT unavailable. Shared VTT mirror still works.',
                peerCount: this.remotePresence.size
            });
        }

        this.ready = true;
        this.updateStatus({
            state: this.connected ? 'live' : 'degraded',
            detail: this.connected ? 'Live VTT connected.' : 'Live VTT unavailable. Shared VTT mirror still works.',
            peerCount: this.remotePresence.size
        });
        this.scheduleMirror();
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        return this;
    }

    async connectChannel(config) {
        if (!this.client || !config) return;
        const channelName = `rtf-vtt-${config.campaignId}-${this.roomId}`;
        const channel = this.client.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: this.instanceId || undefined }
            }
        });

        channel.on('broadcast', { event: 'vtt-sync-request' }, ({ payload }) => {
            this.handleSyncRequest(payload);
        });
        channel.on('broadcast', { event: 'vtt-snapshot' }, ({ payload }) => {
            this.handleSnapshotMessage(payload);
        });
        channel.on('broadcast', { event: 'vtt-token-positions' }, ({ payload }) => {
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
            detail: 'Joining live VTT room...',
            peerCount: this.remotePresence.size
        });

        await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
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
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    this.connected = true;
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
                    }
                }
            });
        });

        this.channel = channel;
        await this.refreshPresenceTracking();
        await this.sendBroadcast('vtt-sync-request', {
            roomId: this.roomId,
            caseId: this.caseId,
            requester: this.instanceId
        });
        this.handlePresenceState(typeof channel.presenceState === 'function' ? channel.presenceState() : {});
    }

    async sendBroadcast(event, payload) {
        if (!this.channel || !this.connected || typeof this.channel.send !== 'function') return;
        try {
            await this.channel.send({
                type: 'broadcast',
                event,
                payload
            });
        } catch (err) {
            console.warn(`RTF_VTT_COLLAB: Broadcast failed for ${event}`, err);
        }
    }

    async refreshPresenceTracking() {
        if (!this.channel || !this.connected || typeof this.channel.track !== 'function') return;
        try {
            await this.channel.track(this.buildLocalPresence());
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Presence track failed', err);
        }
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
        this.updateStatus({
            peerCount: peers.size,
            detail: this.connected
                ? (peers.size
                    ? `Live VTT connected with ${peers.size} other ${peers.size === 1 ? 'player' : 'players'}.`
                    : 'Live VTT connected. Only you are here.')
                : this.status.detail
        });
    }

    handleSyncRequest(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const requester = toTrimmedString(payload.requester, '', 120).trim();
        if (!requester || requester === this.instanceId) return;
        this.broadcastSnapshot('sync-request').catch(() => { });
    }

    handleSnapshotMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const next = this.coerceSnapshot(payload.payload);
        const nextSig = stableStringify(next);
        if (!nextSig || nextSig === stableStringify(this.lastSnapshot)) {
            this.lastSavedRevision = Math.max(this.lastSavedRevision, toNonNegativeInt(payload.revision, 0));
            return;
        }

        this.lastSnapshot = next;
        this.pendingSnapshot = next;
        this.lastSavedRevision = Math.max(this.lastSavedRevision, toNonNegativeInt(payload.revision, 0));
        this.scheduleMirror();

        if (typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(next, { origin: 'remote-snapshot' });
        }
    }

    handlePositionMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const changes = Array.isArray(payload.changes) ? payload.changes.map(sanitizePositionChange).filter(Boolean) : [];
        if (!changes.length) return;

        const result = applyTokenPositionChanges(this.lastSnapshot, changes, this.coerceSnapshot.bind(this));
        if (!result.applied.length) {
            this.lastSavedRevision = Math.max(this.lastSavedRevision, toNonNegativeInt(payload.revision, 0));
            return;
        }

        this.lastSnapshot = result.snapshot;
        this.pendingSnapshot = result.snapshot;
        this.lastSavedRevision = Math.max(this.lastSavedRevision, toNonNegativeInt(payload.revision, 0));
        this.scheduleMirror();

        if (typeof this.options.applyPositionChanges === 'function') {
            this.options.applyPositionChanges(result.applied, {
                origin: 'remote-position',
                snapshot: this.getSnapshot()
            });
        }
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

    scheduleMirror() {
        if (!this.ready || this.destroyed) return;
        if (this.pendingMirrorTimer) clearTimeout(this.pendingMirrorTimer);
        this.pendingMirrorTimer = setTimeout(() => {
            this.pendingMirrorTimer = null;
            if (!this.pendingSnapshot || typeof this.store.mirrorVTTSnapshotToState !== 'function') return;
            this.store.mirrorVTTSnapshotToState({
                roomId: this.roomId,
                caseId: this.caseId,
                payload: this.pendingSnapshot
            });
        }, LOCAL_MIRROR_DELAY_MS);
    }

    scheduleCloudFlush() {
        if (!this.ready || this.destroyed || typeof this.store.saveVTTRoomSnapshot !== 'function') return;
        if (this.pendingFlushTimer) clearTimeout(this.pendingFlushTimer);
        this.pendingFlushTimer = setTimeout(() => {
            this.pendingFlushTimer = null;
            this.flushSnapshotNow().catch((err) => {
                console.warn('RTF_VTT_COLLAB: Scheduled flush failed', err);
            });
        }, CLOUD_FLUSH_DELAY_MS);
    }

    async flushSnapshotNow() {
        if (this.pendingFlushPromise) return this.pendingFlushPromise;
        if (!this.pendingSnapshot || typeof this.store.saveVTTRoomSnapshot !== 'function') {
            return { ok: false, reason: 'no-snapshot' };
        }

        const snapshotToSave = this.coerceSnapshot(this.pendingSnapshot);
        this.pendingFlushPromise = this.store.saveVTTRoomSnapshot({
            roomId: this.roomId,
            caseId: this.caseId,
            payload: snapshotToSave,
            revision: Math.max(Date.now(), this.lastSavedRevision + 1),
            updatedAt: toIsoString(Date.now(), '') || new Date().toISOString(),
            updatedBy: this.instanceId,
            updatedByUser: this.userId || null,
            updatedByName: this.profileName || null
        }).then((result) => {
            if (result && result.ok) {
                this.lastSavedRevision = Math.max(this.lastSavedRevision, result.revision || 0);
            }
            return result;
        }).finally(() => {
            this.pendingFlushPromise = null;
        });

        return this.pendingFlushPromise;
    }

    async broadcastSnapshot(reason = 'snapshot') {
        const snapshot = this.coerceSnapshot(this.pendingSnapshot || this.lastSnapshot);
        const stamp = Math.max(Date.now(), this.lastSavedRevision + 1);
        await this.sendBroadcast('vtt-snapshot', {
            roomId: this.roomId,
            caseId: this.caseId,
            reason,
            revision: stamp,
            updatedAt: new Date(stamp).toISOString(),
            sentBy: this.instanceId,
            sentByUser: this.userId || null,
            sentByName: this.profileName || '',
            payload: snapshot
        });
    }

    syncSnapshot(payload, options = {}) {
        const next = this.coerceSnapshot(payload);
        if (stableStringify(next) === stableStringify(this.lastSnapshot)) {
            if (options && options.flushNow) {
                return this.flushSnapshotNow();
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }

        this.lastSnapshot = next;
        this.pendingSnapshot = next;
        if (this.ready) {
            this.scheduleMirror();
            this.scheduleCloudFlush();
            this.refreshPresenceTracking().catch(() => { });
        }
        this.broadcastSnapshot(options && options.reason ? options.reason : 'local-snapshot').catch(() => { });
        if (options && options.flushNow) {
            return this.flushSnapshotNow();
        }
        return Promise.resolve({ ok: true });
    }

    updateTokenPositions(changes, options = {}) {
        const result = applyTokenPositionChanges(this.lastSnapshot, changes, this.coerceSnapshot.bind(this));
        if (!result.applied.length) {
            if (options && options.flushNow) {
                return this.flushSnapshotNow();
            }
            return Promise.resolve({ ok: true, reason: 'unchanged' });
        }

        this.lastSnapshot = result.snapshot;
        this.pendingSnapshot = result.snapshot;
        if (this.ready) {
            this.scheduleMirror();
            this.scheduleCloudFlush();
            this.refreshPresenceTracking().catch(() => { });
        }

        const stamp = Math.max(Date.now(), this.lastSavedRevision + 1);
        this.sendBroadcast('vtt-token-positions', {
            roomId: this.roomId,
            caseId: this.caseId,
            revision: stamp,
            updatedAt: new Date(stamp).toISOString(),
            sentBy: this.instanceId,
            sentByUser: this.userId || null,
            sentByName: this.profileName || '',
            changes: result.applied
        }).catch(() => { });

        if (options && options.flushNow) {
            return this.flushSnapshotNow();
        }
        return Promise.resolve({ ok: true, changes: result.applied });
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.flushSnapshotNow().catch(() => { });
        } else {
            this.refreshPresenceTracking().catch(() => { });
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

        if (this.channel && this.client) {
            try {
                if (typeof this.channel.untrack === 'function') {
                    try { await this.channel.untrack(); } catch (err) { }
                }
                await this.client.removeChannel(this.channel);
            } catch (err) {
                console.warn('RTF_VTT_COLLAB: Failed removing channel', err);
            }
        }
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
