const LOCAL_MIRROR_DELAY_MS = 120;
const CLOUD_FLUSH_DELAY_MS = 1000;
const DEFAULT_VTT_CELL_PX = 70;
const TOKEN_COORD_PRECISION = 1000;
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

const normalizeTokenCoordinate = (value, fallback = 0) => {
    const parsed = toFiniteNumber(value, fallback);
    return Math.max(0, Math.round(parsed * TOKEN_COORD_PRECISION) / TOKEN_COORD_PRECISION);
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
        this.connectConfig = null;
        this.connected = false;
        this.ready = false;
        this.destroyed = false;
        this.instanceId = '';
        this.userId = '';
        this.profileName = '';
        this.peerColor = '';
        this.lastSavedRevision = 0;
        this.lastSnapshotSource = '';
        this.pendingMirrorTimer = null;
        this.pendingFlushTimer = null;
        this.pendingFlushPromise = null;
        this.pendingReconnectTimer = null;
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

    async disposeChannel(channel = this.channel) {
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
        this.connectConfig = ensured.config || null;
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
        let roomSnapshotSource = '';
        const cloudRow = typeof this.store.loadVTTRoomSnapshot === 'function'
            ? await this.store.loadVTTRoomSnapshot({
                roomId: this.roomId,
                caseId: this.caseId
            })
            : { ok: false, reason: 'unsupported' };

        if (cloudRow && cloudRow.ok && cloudRow.snapshot) {
            roomSnapshot = this.coerceSnapshot(cloudRow.snapshot.payload);
            this.lastSavedRevision = Math.max(0, toNonNegativeInt(cloudRow.snapshot.revision, 0));
            roomSnapshotSource = toTrimmedString(cloudRow.snapshot.updatedBy, '', 120).trim();
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
                    roomSnapshotSource = this.instanceId;
                } else if (seeded && seeded.reason === 'exists' && typeof this.store.loadVTTRoomSnapshot === 'function') {
                    const canonical = await this.store.loadVTTRoomSnapshot({
                        roomId: this.roomId,
                        caseId: this.caseId
                    });
                    if (canonical && canonical.ok && canonical.snapshot) {
                        roomSnapshot = this.coerceSnapshot(canonical.snapshot.payload);
                        this.lastSavedRevision = Math.max(this.lastSavedRevision, canonical.snapshot.revision || 0);
                        roomSnapshotSource = toTrimmedString(canonical.snapshot.updatedBy, '', 120).trim();
                    }
                } else if (seeded && !seeded.ok) {
                    console.warn('RTF_VTT_COLLAB: Failed seeding live VTT room', seeded.error || seeded.reason);
                }
            }
        }

        this.lastSnapshot = this.coerceSnapshot(roomSnapshot || currentPayload || seedPayload);
        this.pendingSnapshot = this.lastSnapshot;
        this.applyRevisionState(this.lastSavedRevision, roomSnapshotSource || this.instanceId);

        if (stableStringify(this.lastSnapshot) !== stableStringify(currentPayload)
            && typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(this.lastSnapshot, { origin: 'remote-restore' });
        }

        try {
            await this.connectChannel(this.connectConfig);
        } catch (err) {
            console.warn('RTF_VTT_COLLAB: Channel connect failed', err);
        }

        this.ready = true;
        if (this.connected) {
            this.updateStatus({
                state: 'live',
                detail: 'Live VTT connected.',
                peerCount: this.remotePresence.size
            });
        } else {
            this.updateStatus({
                state: 'degraded',
                detail: 'Live VTT unavailable. Retrying connection...',
                peerCount: this.remotePresence.size
            });
            this.scheduleReconnect('Retrying live VTT connection...');
        }
        this.scheduleMirror();
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        return this;
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
        this.remotePresence = new Map();
        const channelName = `rtf-vtt-${config.campaignId}-${this.roomId}`;
        const channel = this.client.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: this.instanceId || undefined }
            }
        });
        this.channel = channel;

        channel.on('broadcast', { event: 'vtt-sync-request' }, ({ payload }) => {
            if (channel !== this.channel) return;
            this.handleSyncRequest(payload);
        });
        channel.on('broadcast', { event: 'vtt-snapshot' }, ({ payload }) => {
            if (channel !== this.channel) return;
            this.handleSnapshotMessage(payload);
        });
        channel.on('broadcast', { event: 'vtt-token-positions' }, ({ payload }) => {
            if (channel !== this.channel) return;
            this.handlePositionMessage(payload);
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
                        return;
                    }
                    this.scheduleReconnect(status === 'CLOSED' ? 'Rejoining live VTT...' : 'Retrying live VTT connection...');
                }
            });
        });

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
            const result = await this.channel.send({
                type: 'broadcast',
                event,
                payload
            });
            if (result && result !== 'ok') {
                throw new Error(`Broadcast returned ${result}`);
            }
        } catch (err) {
            console.warn(`RTF_VTT_COLLAB: Broadcast failed for ${event}`, err);
        }
    }

    async refreshPresenceTracking() {
        if (!this.channel || !this.connected || typeof this.channel.track !== 'function') return;
        try {
            const result = await this.channel.track(this.buildLocalPresence());
            if (result && result !== 'ok') {
                throw new Error(`Presence track returned ${result}`);
            }
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
        this.broadcastSnapshot('sync-request', { reuseRevision: true }).catch(() => { });
    }

    handleSnapshotMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const sentBy = toTrimmedString(payload.sentBy, '', 120).trim();
        if (sentBy && sentBy === this.instanceId) {
            this.applyRevisionState(payload.revision, sentBy);
            return;
        }
        if (compareRevisionMeta(payload.revision, sentBy, this.lastSavedRevision, this.lastSnapshotSource) < 0) {
            return;
        }
        const next = this.coerceSnapshot(payload.payload);
        const nextSig = stableStringify(next);
        if (!nextSig || nextSig === stableStringify(this.lastSnapshot)) {
            this.applyRevisionState(payload.revision, sentBy);
            return;
        }

        this.lastSnapshot = next;
        this.pendingSnapshot = next;
        this.applyRevisionState(payload.revision, sentBy);
        this.scheduleMirror();

        if (typeof this.options.applySnapshot === 'function') {
            this.options.applySnapshot(next, { origin: 'remote-snapshot' });
        }
    }

    handlePositionMessage(payload) {
        if (this.destroyed || !payload || typeof payload !== 'object') return;
        const sentBy = toTrimmedString(payload.sentBy, '', 120).trim();
        if (sentBy && sentBy === this.instanceId) {
            this.applyRevisionState(payload.revision, sentBy);
            return;
        }
        if (compareRevisionMeta(payload.revision, sentBy, this.lastSavedRevision, this.lastSnapshotSource) < 0) {
            return;
        }
        const changes = Array.isArray(payload.changes) ? payload.changes.map(sanitizePositionChange).filter(Boolean) : [];
        if (!changes.length) return;

        const result = applyTokenPositionChanges(this.lastSnapshot, changes, this.coerceSnapshot.bind(this));
        if (!result.applied.length) {
            this.applyRevisionState(payload.revision, sentBy);
            return;
        }

        this.lastSnapshot = result.snapshot;
        this.pendingSnapshot = result.snapshot;
        this.applyRevisionState(payload.revision, sentBy);
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
        const nextRevision = Math.max(1, this.lastSavedRevision + 1);
        this.applyRevisionState(nextRevision, this.instanceId);
        this.pendingFlushPromise = this.store.saveVTTRoomSnapshot({
            roomId: this.roomId,
            caseId: this.caseId,
            payload: snapshotToSave,
            revision: nextRevision,
            updatedAt: toIsoString(Date.now(), '') || new Date().toISOString(),
            updatedBy: this.instanceId,
            updatedByUser: this.userId || null,
            updatedByName: this.profileName || null
        }).then((result) => {
            if (result && result.ok) {
                this.applyRevisionState(result.revision || nextRevision, this.instanceId);
                return result;
            }
            if (result && result.reason === 'stale' && result.snapshot) {
                const remoteSnapshot = this.coerceSnapshot(result.snapshot.payload);
                const remoteSig = stableStringify(remoteSnapshot);
                const currentSig = stableStringify(this.lastSnapshot);
                this.lastSnapshot = remoteSnapshot;
                this.pendingSnapshot = remoteSnapshot;
                this.applyRevisionState(result.snapshot.revision, result.snapshot.updatedBy || result.updatedBy || '');
                this.scheduleMirror();
                if (remoteSig && remoteSig !== currentSig && typeof this.options.applySnapshot === 'function') {
                    this.options.applySnapshot(remoteSnapshot, { origin: 'cloud-stale-restore' });
                }
            }
            return result;
        }).finally(() => {
            this.pendingFlushPromise = null;
        });

        return this.pendingFlushPromise;
    }

    async broadcastSnapshot(reason = 'snapshot', options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const snapshot = this.coerceSnapshot(this.pendingSnapshot || this.lastSnapshot);
        const stamp = opts.reuseRevision
            ? Math.max(1, this.lastSavedRevision || 0)
            : Math.max(1, this.lastSavedRevision + 1);
        this.applyRevisionState(stamp, this.instanceId);
        await this.sendBroadcast('vtt-snapshot', {
            roomId: this.roomId,
            caseId: this.caseId,
            reason,
            revision: stamp,
            updatedAt: new Date().toISOString(),
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

        const stamp = Math.max(1, this.lastSavedRevision + 1);
        this.applyRevisionState(stamp, this.instanceId);
        this.sendBroadcast('vtt-token-positions', {
            roomId: this.roomId,
            caseId: this.caseId,
            revision: stamp,
            updatedAt: new Date().toISOString(),
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
        } else if (!this.connected) {
            this.scheduleReconnect('Rejoining live VTT...');
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
        if (this.pendingReconnectTimer) clearTimeout(this.pendingReconnectTimer);

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
