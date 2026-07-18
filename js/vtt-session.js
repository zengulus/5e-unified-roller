(function (root, factory) {
    'use strict';

    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_SESSION = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
    'use strict';

    const REQUIRED_STATE_PORT = Object.freeze([
        'getRole',
        'getCaseTransitionId',
        'getStateCaseId',
        'setStateCaseId',
        'getSnapshot',
        'setSnapshot',
        'isInitialLoadPending',
        'setInitialLoadPending',
        'readSharedSnapshot',
        'ensureRosterPresentation',
        'persistSnapshot',
        'syncRosterPresentation',
        'coerceFog',
        'clearPendingRemoteSnapshot',
        'applyRemoteSnapshot',
        'applyRemotePositionChanges'
    ]);
    const REQUIRED_STORE_PORT = Object.freeze([
        'getStore',
        'getActiveCaseId',
        'getRoomId',
        'getCollabReady'
    ]);
    const REQUIRED_UI_PORT = Object.freeze([
        'setSyncChip',
        'getSyncChipState',
        'setActiveSceneLabel',
        'normalizeSelections',
        'render',
        'fitViewToWorld',
        'processInitiativeQueue',
        'closeAdminMenus',
        'confirm',
        'alert',
        'bindSyncRetry'
    ]);

    const validatePort = (port, name, requiredMethods) => {
        if (!port || typeof port !== 'object' || Array.isArray(port)) {
            throw new TypeError(`RTF_VTT_SESSION.create requires a ${name} port.`);
        }
        const missing = requiredMethods.filter((method) => typeof port[method] !== 'function');
        if (missing.length) {
            throw new TypeError(`RTF_VTT_SESSION.create ${name} port is missing: ${missing.join(', ')}`);
        }
    };

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const toNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const create = (options = {}) => {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('RTF_VTT_SESSION.create requires an options object.');
        }

        const state = options.state;
        const storePort = options.store;
        const ui = options.ui;
        validatePort(state, 'state', REQUIRED_STATE_PORT);
        validatePort(storePort, 'store', REQUIRED_STORE_PORT);
        validatePort(ui, 'ui', REQUIRED_UI_PORT);

        const defaultSnapshot = clone(options.defaultSnapshot || {
            activeSceneId: '',
            scenes: [],
            initiative: {
                round: 1,
                activeEntryId: '',
                entries: [],
                encounterActive: false,
                sceneId: '',
                startedAt: 0
            }
        });
        const liveStatusDropoutGraceMs = Math.max(0, Math.round(toNumber(options.liveStatusDropoutGraceMs, 5000)));
        const schedule = typeof options.setTimeout === 'function'
            ? options.setTimeout
            : (root && typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : setTimeout);
        const cancelSchedule = typeof options.clearTimeout === 'function'
            ? options.clearTimeout
            : (root && typeof root.clearTimeout === 'function' ? root.clearTimeout.bind(root) : clearTimeout);

        let collabSession = null;
        let collabSessionAuthorityTransitionId = -1;
        let collabInitPromise = null;
        let collabInitCaseId = '';
        let initialRoomRecoveryPromise = null;
        let authorityTransitionId = 0;
        let collabPendingStatus = null;
        let collabDropoutStartedAt = 0;
        let collabDropoutTimer = 0;
        let lastStableLiveSyncChipLabel = '';

        const getStore = () => storePort.getStore();
        const getActiveCaseId = () => String(storePort.getActiveCaseId() || 'case_primary');
        const getRoomId = (caseId = getActiveCaseId()) => String(storePort.getRoomId(caseId) || '').trim();
        const getRole = () => String(state.getRole() || 'player').trim().toLowerCase();
        const isDM = () => getRole() === 'dm';

        const getStatus = () => (
            collabSession && typeof collabSession.getStatus === 'function'
                ? collabSession.getStatus()
                : null
        );

        const isReady = () => {
            if (!(collabSession && typeof collabSession.isActive === 'function' && collabSession.isActive())) return false;
            const status = getStatus();
            return !!(status && status.connected && status.transportConnected);
        };

        const isInitializing = () => !!collabInitPromise;
        const getTransport = () => collabSession;
        const getPendingStatus = () => collabPendingStatus;

        const setSyncChipState = ({ state: chipState = 'local', label = 'Local', detail = '', retryable = false } = {}) => {
            ui.setSyncChip({
                state: chipState,
                label,
                detail: detail || label,
                retryable: !!retryable
            });
        };

        const clearCollabDropoutTimer = () => {
            if (!collabDropoutTimer) return;
            cancelSchedule(collabDropoutTimer);
            collabDropoutTimer = 0;
        };

        const setStatus = (status = {}) => {
            const source = status && typeof status === 'object' ? status : {};
            collabPendingStatus = source;
            const statusState = source.state === 'live'
                ? 'live'
                : (source.state === 'connecting'
                    ? 'connecting'
                    : (source.state === 'reconnecting'
                        ? 'reconnecting'
                        : (source.state === 'degraded' ? 'degraded' : 'local')));
            const peerCount = Number.isFinite(source.peerCount) ? Math.max(0, source.peerCount) : 0;
            const detail = String(source.detail || '').trim();
            let label = 'Local';
            if (statusState === 'live') {
                label = peerCount > 0 ? `Live · ${peerCount}` : 'Live';
                lastStableLiveSyncChipLabel = label;
                collabDropoutStartedAt = 0;
                clearCollabDropoutTimer();
            } else if (statusState === 'connecting') {
                label = 'Connecting';
            } else if (statusState === 'reconnecting') {
                label = 'Reconnecting';
            } else if (statusState === 'degraded') {
                label = 'Degraded';
            }

            if (statusState === 'local') {
                collabDropoutStartedAt = 0;
                lastStableLiveSyncChipLabel = '';
                clearCollabDropoutTimer();
            } else if (statusState !== 'live' && statusState !== 'degraded' && lastStableLiveSyncChipLabel) {
                const now = Date.now();
                if (!collabDropoutStartedAt) collabDropoutStartedAt = now;
                const elapsedMs = Math.max(0, now - collabDropoutStartedAt);
                const remainingMs = liveStatusDropoutGraceMs - elapsedMs;
                if (remainingMs > 0) {
                    if (!collabDropoutTimer) {
                        collabDropoutTimer = schedule(() => {
                            collabDropoutTimer = 0;
                            if (collabPendingStatus) setStatus(collabPendingStatus);
                        }, remainingMs);
                    }
                    setSyncChipState({
                        state: 'live',
                        label: lastStableLiveSyncChipLabel,
                        detail: detail || lastStableLiveSyncChipLabel,
                        retryable: false
                    });
                    return;
                }
                clearCollabDropoutTimer();
                label = statusState === 'reconnecting' ? 'Reconnecting' : 'Connecting';
            }
            setSyncChipState({
                state: statusState,
                label,
                detail: detail || label,
                retryable: statusState === 'local' || statusState === 'degraded'
            });
        };

        const updateStoreStatus = (status) => {
            const hasActiveCollabSession = !!(collabSession
                && (typeof collabSession.isActive !== 'function' || collabSession.isActive()));
            if (hasActiveCollabSession || collabInitPromise) return;
            const source = status && status.connected
                ? (status.pendingPush ? 'Syncing' : 'Shared')
                : 'Local';
            const detail = source === 'Syncing'
                ? 'Shared VTT sync is pushing updates.'
                : (source === 'Shared'
                    ? 'Shared VTT sync is connected through the store.'
                    : 'VTT is running locally on this browser.');
            setSyncChipState({
                state: source.toLowerCase(),
                label: source,
                detail,
                retryable: false
            });
        };

        const hasLiveConfig = () => {
            const store = getStore();
            if (!store || typeof store.getSyncConfig !== 'function') return false;
            const config = store.getSyncConfig();
            return !!(config
                && config.enabled
                && config.supabaseUrl
                && config.anonKey
                && config.campaignId
                && String(config.collabRelayUrl || '').trim());
        };

        const hasSupabaseConfig = () => {
            const store = getStore();
            if (!store || typeof store.getSyncConfig !== 'function') return false;
            const config = store.getSyncConfig();
            return !!(config
                && config.enabled
                && config.supabaseUrl
                && config.anonKey
                && config.campaignId);
        };

        const readLocalInitialSnapshot = (store, caseId) => {
            if (!store || typeof store.getVTTState !== 'function') return clone(defaultSnapshot);
            return clone(store.getVTTState(caseId) || defaultSnapshot);
        };

        const loadInitialSnapshot = async (requestedCaseId = getActiveCaseId()) => {
            const activeCaseId = String(requestedCaseId || getActiveCaseId()).trim() || getActiveCaseId();
            const store = getStore();
            if (!store) return clone(defaultSnapshot);

            if (!hasSupabaseConfig() || typeof store.loadVTTRoomSnapshot !== 'function') {
                setStatus({
                    state: 'local',
                    detail: 'PostgreSQL sync is not configured. Using case-local VTT state.',
                    peerCount: 0
                });
                ui.setActiveSceneLabel('Scene: Loading local VTT...');
                return readLocalInitialSnapshot(store, activeCaseId);
            }

            const roomId = getRoomId(activeCaseId);
            setStatus({
                state: 'connecting',
                detail: isDM()
                    ? 'GM is loading the saved VTT room before seeding Render.'
                    : 'Checking saved VTT room before loading the scene.',
                peerCount: 0
            });
            ui.setActiveSceneLabel(isDM()
                ? 'Scene: Loading GM saved VTT...'
                : 'Scene: Checking saved VTT...');

            try {
                const result = await store.loadVTTRoomSnapshot({
                    roomId,
                    caseId: activeCaseId,
                    force: true
                });
                if (result && result.ok && result.snapshot && result.snapshot.payload) {
                    const payload = clone(result.snapshot.payload);
                    if (typeof store.mirrorVTTSnapshotToState === 'function') {
                        store.mirrorVTTSnapshotToState({
                            roomId,
                            caseId: activeCaseId,
                            payload,
                            updatedAt: result.snapshot.updatedAt,
                            source: 'vtt-room-preflight'
                        });
                    }
                    return payload;
                }
                if (result && result.ok && !result.snapshot) {
                    setStatus({
                        state: 'degraded',
                        detail: 'No PostgreSQL VTT snapshot exists for this room yet. Starting a new blank room.',
                        peerCount: 0
                    });
                    ui.setActiveSceneLabel('Scene: No PostgreSQL VTT snapshot');
                    return clone(defaultSnapshot);
                }
                if (result && !result.ok) {
                    console.warn('VTT Supabase preflight failed', result.error || result.reason || result);
                    setStatus({
                        state: 'degraded',
                        detail: result.error || 'PostgreSQL VTT snapshot check failed. VTT state was not loaded.',
                        peerCount: 0
                    });
                }
            } catch (err) {
                console.warn('VTT Supabase preflight failed', err);
                setStatus({
                    state: 'degraded',
                    detail: err && err.message ? err.message : 'PostgreSQL VTT snapshot check failed. VTT state was not loaded.',
                    peerCount: 0
                });
            }

            return null;
        };

        const initCollab = async () => {
            const sessionCaseId = getActiveCaseId();
            const sessionTransitionId = state.getCaseTransitionId();
            const sessionAuthorityTransitionId = authorityTransitionId;
            const sessionRole = getRole();
            const isCurrentSessionRequest = () => (
                sessionCaseId === getActiveCaseId()
                && sessionTransitionId === state.getCaseTransitionId()
                && sessionAuthorityTransitionId === authorityTransitionId
                && sessionRole === getRole()
            );
            if (collabSession
                && collabSession.caseId === sessionCaseId
                && collabSessionAuthorityTransitionId === sessionAuthorityTransitionId
                && (typeof collabSession.isActive !== 'function' || collabSession.isActive())) {
                return collabSession;
            }
            if (collabInitPromise && collabInitCaseId === sessionCaseId) return collabInitPromise;
            if (collabInitPromise && collabInitCaseId !== sessionCaseId) {
                collabInitPromise = null;
                collabInitCaseId = '';
            }
            const store = getStore();
            const collabReady = storePort.getCollabReady();
            if (!store || !collabReady || typeof collabReady.then !== 'function') {
                setStatus({
                    state: 'local',
                    detail: 'Shared sync is off. VTT changes stay on this device.',
                    peerCount: 0
                });
                return null;
            }
            if (!hasLiveConfig()) {
                updateStoreStatus(store && typeof store.getSyncStatus === 'function' ? store.getSyncStatus() : { connected: false });
                return null;
            }

            setStatus({
                state: 'connecting',
                detail: 'Connecting live VTT...',
                peerCount: 0
            });

            const initPromise = Promise.resolve(collabReady)
                .then((api) => {
                    if (!api || typeof api.createSession !== 'function') return null;
                    return api.createSession({
                        store,
                        roomId: getRoomId(sessionCaseId),
                        caseId: sessionCaseId,
                        preferCloudRoomSnapshot: sessionRole !== 'dm',
                        canSaveRoom: () => sessionRole === 'dm' && isCurrentSessionRequest(),
                        canSeedRelayRoom: () => sessionRole === 'dm' && isCurrentSessionRequest(),
                        canLoadColdSnapshot: () => sessionRole === 'dm' && isCurrentSessionRequest(),
                        getSeedPayload: () => sessionRole === 'dm'
                            ? (state.readSharedSnapshot() || clone(defaultSnapshot))
                            : clone(defaultSnapshot),
                        getCurrentPayload: () => sessionRole === 'dm'
                            ? (state.readSharedSnapshot() || clone(defaultSnapshot))
                            : clone(defaultSnapshot),
                        applySnapshot: (payload) => {
                            if (isCurrentSessionRequest()) state.applyRemoteSnapshot(payload, sessionCaseId);
                        },
                        applyPositionChanges: (changes, meta) => {
                            if (isCurrentSessionRequest()) state.applyRemotePositionChanges(changes, meta, sessionCaseId);
                        },
                        onStatusChange: (status) => {
                            if (isCurrentSessionRequest()) setStatus(status);
                        }
                    });
                })
                .then((session) => {
                    if (!isCurrentSessionRequest()) {
                        if (session && typeof session.destroy === 'function') session.destroy().catch(() => { });
                        return null;
                    }
                    if (!session || (typeof session.isActive === 'function' && !session.isActive())) {
                        collabSession = null;
                        updateStoreStatus(store && typeof store.getSyncStatus === 'function' ? store.getSyncStatus() : { connected: false });
                        return null;
                    }
                    collabSession = session;
                    collabSessionAuthorityTransitionId = sessionAuthorityTransitionId;
                    setStatus(session.getStatus ? session.getStatus() : {
                        state: 'live',
                        detail: 'Live VTT connected.',
                        peerCount: 0
                    });
                    return session;
                })
                .catch((err) => {
                    console.warn('VTT collaboration init failed', err);
                    if (!isCurrentSessionRequest()) return null;
                    collabSession = null;
                    collabSessionAuthorityTransitionId = -1;
                    setStatus({
                        state: 'degraded',
                        detail: 'Live VTT unavailable. Shared VTT mirror still works.',
                        peerCount: 0
                    });
                    return null;
                })
                .finally(() => {
                    if (collabInitPromise === initPromise) {
                        collabInitPromise = null;
                        collabInitCaseId = '';
                    }
                });

            collabInitPromise = initPromise;
            collabInitCaseId = sessionCaseId;
            return initPromise;
        };

        const handleAuthorityRoleChange = async (previousRole, nextRole, transitionId) => {
            if (previousRole === nextRole || !hasLiveConfig()) return null;
            const store = getStore();
            if (!store) return null;
            const isCurrentTransition = () => transitionId === authorityTransitionId && getRole() === nextRole;

            setStatus({
                state: 'connecting',
                detail: nextRole === 'dm'
                    ? 'GM mode enabled. Loading the saved VTT room before seeding Render.'
                    : 'Player mode enabled. Waiting for the GM live VTT room.',
                peerCount: 0
            });

            const sessionToDestroy = collabSession;
            if (sessionToDestroy && typeof sessionToDestroy.destroy === 'function') {
                try {
                    await sessionToDestroy.destroy();
                } catch (err) {
                    console.warn('VTT collaboration role session teardown failed', err);
                }
            }
            if (!isCurrentTransition()) return null;
            if (collabSession === sessionToDestroy) collabSession = null;
            if (!collabSession) collabSessionAuthorityTransitionId = -1;
            collabInitPromise = null;
            collabInitCaseId = '';
            state.clearPendingRemoteSnapshot();

            if (nextRole === 'dm') {
                const activeCaseId = getActiveCaseId();
                let snapshot = await loadInitialSnapshot(activeCaseId);
                if (!snapshot && isCurrentTransition()) {
                    setStatus({
                        state: 'connecting',
                        detail: 'GM room preflight was not ready. Retrying automatically.',
                        peerCount: 0
                    });
                    await new Promise((resolve) => schedule(resolve, 250));
                    if (isCurrentTransition()) snapshot = await loadInitialSnapshot(activeCaseId);
                }
                if (!isCurrentTransition()) return null;
                if (!snapshot) {
                    state.setSnapshot(null);
                    state.setStateCaseId(activeCaseId);
                    state.setInitialLoadPending(true);
                    ui.normalizeSelections();
                    ui.render();
                    return null;
                }
                const fogMigrated = state.coerceFog(snapshot);
                let synced = state.ensureRosterPresentation(snapshot, {
                    persist: true,
                    reason: fogMigrated ? 'fog-mask-migration' : 'roster-player-presentation-sync'
                }).snapshot;
                if (fogMigrated) {
                    const saved = state.persistSnapshot(synced, {
                        reason: 'fog-mask-migration',
                        baseSnapshot: null
                    });
                    synced = clone(saved || synced);
                }
                state.setSnapshot(clone(synced));
                state.setStateCaseId(activeCaseId);
                state.setInitialLoadPending(false);
                ui.normalizeSelections();
                ui.render();
            } else {
                state.setSnapshot(clone(defaultSnapshot));
                state.setStateCaseId(getActiveCaseId());
                state.setInitialLoadPending(true);
                state.clearPendingRemoteSnapshot();
                ui.normalizeSelections();
                ui.render();
            }

            let session = await initCollab();
            if (!session && isCurrentTransition()) {
                await new Promise((resolve) => schedule(resolve, 250));
                if (isCurrentTransition()) session = await initCollab();
            }
            if (!isCurrentTransition()) {
                if (session && session === collabSession && typeof session.destroy === 'function') {
                    try {
                        await session.destroy();
                    } catch (err) {
                        console.warn('VTT collaboration stale role session teardown failed', err);
                    }
                    if (collabSession === session) collabSession = null;
                }
                return null;
            }
            if (session && typeof session.handleAuthorityChanged === 'function') {
                session.handleAuthorityChanged();
            }
            return session;
        };

        const handleRoleChanged = (previousRole, nextRole) => {
            if (collabSession && typeof collabSession.handleSavePermissionChanged === 'function') {
                collabSession.handleSavePermissionChanged();
            }
            if (previousRole === nextRole || !hasLiveConfig()) return Promise.resolve(collabSession);
            const transitionId = ++authorityTransitionId;
            const requestedRole = nextRole;
            return handleAuthorityRoleChange(previousRole, requestedRole, transitionId).catch((err) => {
                if (transitionId !== authorityTransitionId || getRole() !== requestedRole) return null;
                console.warn('VTT collaboration role authority refresh failed', err);
                setStatus({
                    state: 'degraded',
                    detail: err && err.message ? err.message : 'Live VTT role refresh failed.',
                    peerCount: 0,
                    retryable: true
                });
                return null;
            });
        };

        const refreshRoomIfNeeded = async (requestedCaseId = getActiveCaseId(), transitionId = state.getCaseTransitionId()) => {
            const expectedCaseId = String(requestedCaseId || getActiveCaseId()).trim();
            if (!expectedCaseId || expectedCaseId !== getActiveCaseId() || transitionId !== state.getCaseTransitionId()) return null;
            if (!collabSession) return initCollab();
            const expectedRoomId = getRoomId(expectedCaseId);
            if (collabSession.roomId === expectedRoomId && collabSession.caseId === expectedCaseId) {
                return collabSession;
            }

            setStatus({
                state: 'connecting',
                detail: 'Switching live VTT room...',
                peerCount: 0
            });

            try {
                if (typeof collabSession.destroy === 'function') await collabSession.destroy();
            } catch (err) {
                console.warn('VTT collaboration room refresh failed', err);
            }

            collabSession = null;
            collabInitPromise = null;
            collabInitCaseId = '';
            state.clearPendingRemoteSnapshot();
            const store = getStore();
            if (store) {
                const nextSnapshot = await loadInitialSnapshot(expectedCaseId);
                if (expectedCaseId !== getActiveCaseId() || transitionId !== state.getCaseTransitionId()) return null;
                if (nextSnapshot) {
                    state.setSnapshot(state.ensureRosterPresentation(nextSnapshot, { reason: 'roster-player-presentation-sync' }).snapshot);
                    state.setStateCaseId(expectedCaseId);
                    ui.normalizeSelections();
                    ui.render();
                } else {
                    state.setSnapshot(null);
                    state.setStateCaseId(expectedCaseId);
                    state.setInitialLoadPending(true);
                    ui.normalizeSelections();
                    return null;
                }
            }
            return initCollab();
        };

        const initWithRetry = async (attempts = 3, delayMs = 400) => {
            const maxAttempts = Math.max(1, Math.round(toNumber(attempts, 3)));
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const session = await initCollab();
                if (session) return session;
                if (!hasLiveConfig() || attempt >= maxAttempts - 1) return null;
                await new Promise((resolve) => schedule(resolve, delayMs));
            }
            return null;
        };

        const recoverInitialRoomIfNeeded = async () => {
            if (!state.isInitialLoadPending() || state.getSnapshot() || initialRoomRecoveryPromise) {
                return initialRoomRecoveryPromise;
            }
            const store = getStore();
            if (!store) return null;
            const caseId = getActiveCaseId();
            const caseTransitionId = state.getCaseTransitionId();
            const requestedAuthorityTransitionId = authorityTransitionId;
            const requestedRole = getRole();
            const isCurrentRequest = () => (
                caseId === getActiveCaseId()
                && caseTransitionId === state.getCaseTransitionId()
                && requestedAuthorityTransitionId === authorityTransitionId
                && requestedRole === getRole()
            );

            const recoveryPromise = (async () => {
                setStatus({
                    state: 'connecting',
                    detail: 'Cloud access is ready. Retrying the initial VTT room load.',
                    peerCount: 0
                });
                const snapshot = await loadInitialSnapshot(caseId);
                if (!snapshot || !isCurrentRequest()) return null;
                const fogMigrated = state.coerceFog(snapshot);
                const synced = state.ensureRosterPresentation(snapshot, {
                    persist: isDM(),
                    reason: fogMigrated ? 'fog-mask-migration' : 'roster-player-presentation-sync'
                }).snapshot;
                state.setSnapshot(clone(synced));
                state.setStateCaseId(caseId);
                state.setInitialLoadPending(false);
                ui.normalizeSelections();
                ui.render();
                const session = await initWithRetry();
                if (session && isCurrentRequest()) ui.processInitiativeQueue();
                ui.fitViewToWorld();
                return session;
            })().finally(() => {
                if (initialRoomRecoveryPromise === recoveryPromise) initialRoomRecoveryPromise = null;
            });
            initialRoomRecoveryPromise = recoveryPromise;
            return recoveryPromise;
        };

        const handleStoreStatus = (status) => {
            updateStoreStatus(status);
            if (status && status.connected && state.isInitialLoadPending() && !state.getSnapshot()) {
                recoverInitialRoomIfNeeded().catch((err) => {
                    console.warn('Initial VTT room recovery failed', err);
                });
            }
        };

        const retryConnection = async () => {
            if (!hasLiveConfig()) {
                setStatus({
                    state: 'local',
                    detail: 'Shared sync is not configured for live VTT on this browser.',
                    peerCount: 0
                });
                return null;
            }
            if (String(ui.getSyncChipState() || '') === 'connecting') return null;

            setStatus({
                state: 'connecting',
                detail: 'Retrying live VTT connection...',
                peerCount: 0
            });

            if (collabSession && typeof collabSession.destroy === 'function') {
                try {
                    await collabSession.destroy();
                } catch (err) {
                    console.warn('VTT collaboration retry cleanup failed', err);
                }
            }

            collabSession = null;
            collabInitPromise = null;
            collabInitCaseId = '';
            state.clearPendingRemoteSnapshot();

            if (state.isInitialLoadPending() || !state.getSnapshot()) {
                const activeCaseId = getActiveCaseId();
                const snapshot = await loadInitialSnapshot(activeCaseId);
                if (!snapshot) return null;
                state.setSnapshot(state.ensureRosterPresentation(snapshot, {
                    persist: isDM(),
                    reason: 'roster-player-presentation-sync'
                }).snapshot);
                state.setStateCaseId(activeCaseId);
                state.setInitialLoadPending(false);
                ui.normalizeSelections();
                ui.render();
            }

            return initCollab();
        };

        const forceAuthoritative = async () => {
            if (!isDM()) return false;
            const ok = ui.confirm(
                'Force this DM browser as the authoritative VTT state?\n\n'
                + 'This publishes exactly what this browser currently shows as the durable VTT snapshot players will pick up next time they open the table.'
            );
            if (!ok) return false;

            ui.closeAdminMenus();
            setSyncChipState({
                state: 'connecting',
                label: 'Forcing...',
                detail: 'Publishing this DM VTT snapshot as authoritative.',
                retryable: false
            });

            const store = getStore();
            if (!store) throw new Error('Shared store is unavailable.');

            const activeCaseId = getActiveCaseId();
            const roomId = getRoomId(activeCaseId);
            if (!state.getSnapshot() || state.getStateCaseId() !== activeCaseId) {
                throw new Error('VTT state for this case has not loaded yet.');
            }
            const snapshot = clone(state.getSnapshot());
            state.syncRosterPresentation(snapshot);
            state.coerceFog(snapshot);
            snapshot.updatedAt = Date.now();

            let result = null;
            const session = await initCollab();
            if (session && typeof session.forceAuthoritativeSnapshot === 'function') {
                result = await session.forceAuthoritativeSnapshot(snapshot, { reason: 'dm-authoritative' });
                state.setSnapshot(clone(session.getSnapshot ? session.getSnapshot() : snapshot));
                state.setStateCaseId(activeCaseId);
            } else {
                result = {
                    ok: false,
                    reason: 'room-unavailable',
                    error: 'Live VTT room is not available, so the DM snapshot was not saved to Supabase.'
                };
            }

            if (!result || !result.ok) {
                throw new Error(result && (result.error || result.reason) ? (result.error || result.reason) : 'Failed to publish the DM VTT snapshot.');
            }

            ui.normalizeSelections();
            ui.render();
            setSyncChipState({
                state: 'live',
                label: 'Forced',
                detail: `DM VTT snapshot is authoritative for room ${roomId}.`,
                retryable: false
            });
            ui.alert('DM VTT snapshot is now authoritative.');
            return true;
        };

        const bustLiveCache = async () => {
            if (!isDM()) return false;
            const ok = ui.confirm(
                'Bust the warm live VTT cache for this case?\n\n'
                + 'This resets the Render live-room cache without deleting the durable snapshot. Use Force DM Authoritative to publish prep for the next player session.'
            );
            if (!ok) return false;

            ui.closeAdminMenus();
            setSyncChipState({
                state: 'degraded',
                label: 'Busting...',
                detail: 'Busting the live VTT room cache.',
                retryable: false
            });

            const activeCaseId = getActiveCaseId();
            const roomId = getRoomId(activeCaseId);
            const store = getStore();
            const session = isReady() ? collabSession : await initCollab();
            let relayResult = null;
            if (session && typeof session.bustLiveRoomCache === 'function') {
                relayResult = await session.bustLiveRoomCache({ reason: 'dm-cache-bust' });
            }
            if (store && typeof store.invalidateSyncQueryCache === 'function' && typeof store.getVTTRoomSnapshotCacheKey === 'function') {
                store.invalidateSyncQueryCache(store.getVTTRoomSnapshotCacheKey({ caseId: activeCaseId, roomId }));
            }
            setStatus({
                state: 'degraded',
                detail: `Warm VTT cache busted for ${roomId}. Durable snapshots were left intact.`,
                peerCount: relayResult && relayResult.broadcastOk ? 0 : undefined
            });
            ui.alert('Warm VTT cache busted. The durable VTT snapshot was not deleted.');
            return true;
        };

        const reportAdminActionError = (err, fallback = 'VTT admin action failed.') => {
            const message = err && err.message ? err.message : fallback;
            console.warn(fallback, err);
            setStatus({
                state: 'degraded',
                detail: message,
                peerCount: 0
            });
            ui.alert(message);
        };

        const bindSyncActions = () => {
            ui.bindSyncRetry(() => retryConnection().catch((err) => {
                console.warn('VTT collaboration retry failed', err);
            }));
        };

        const destroy = async () => {
            authorityTransitionId += 1;
            clearCollabDropoutTimer();
            initialRoomRecoveryPromise = null;
            collabInitPromise = null;
            collabInitCaseId = '';
            const session = collabSession;
            collabSession = null;
            collabSessionAuthorityTransitionId = -1;
            if (session && typeof session.destroy === 'function') await session.destroy();
        };

        return Object.freeze({
            getTransport,
            getStatus,
            getPendingStatus,
            isReady,
            isInitializing,
            hasLiveConfig,
            hasSupabaseConfig,
            setStatus,
            updateStoreStatus,
            loadInitialSnapshot,
            handleRoleChanged,
            init: initCollab,
            refreshRoomIfNeeded,
            initWithRetry,
            recoverInitialRoomIfNeeded,
            handleStoreStatus,
            retryConnection,
            forceAuthoritative,
            bustLiveCache,
            reportAdminActionError,
            bindSyncActions,
            destroy
        });
    };

    return Object.freeze({ create });
}));
