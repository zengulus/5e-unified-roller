const test = require('node:test');
const assert = require('node:assert/strict');

const sessionFactory = require('../js/vtt-session.js');

const buildSnapshot = (sceneId = 'scene_one') => ({
    activeSceneId: sceneId,
    scenes: [{ id: sceneId, tokens: [], fog: [] }],
    initiative: { round: 1, activeEntryId: '', entries: [] }
});

const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const waitFor = async (predicate, message) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(message);
};

const createFakeSession = (caseId, name = caseId) => {
    const calls = { destroy: 0, authorityChanged: 0 };
    return {
        calls,
        session: {
            caseId,
            roomId: `room:${caseId}`,
            isActive: () => true,
            getStatus: () => ({
                state: 'live',
                connected: true,
                transportConnected: true,
                detail: `${name} connected`,
                peerCount: 0
            }),
            destroy: async () => {
                calls.destroy += 1;
            },
            handleAuthorityChanged: () => {
                calls.authorityChanged += 1;
            }
        }
    };
};

const createHarness = () => {
    const model = {
        role: 'player',
        activeCaseId: 'case_one',
        caseTransitionId: 1,
        stateCaseId: 'case_one',
        snapshot: buildSnapshot(),
        initialLoadPending: false,
        collabReady: Promise.resolve({ createSession: async () => null })
    };
    const calls = {
        applyPositionChanges: [],
        applySnapshots: [],
        clearPendingRemoteSnapshot: 0,
        fitView: 0,
        normalizeSelections: 0,
        processInitiativeQueue: 0,
        renders: 0,
        syncChips: []
    };
    const syncConfig = {
        enabled: true,
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        campaignId: 'campaign-one',
        collabRelayUrl: 'wss://relay.example.test'
    };
    const store = {
        getSyncConfig: () => syncConfig,
        getSyncStatus: () => ({ connected: true, pendingPush: false }),
        getVTTState: () => model.snapshot,
        loadVTTRoomSnapshot: async ({ caseId }) => ({
            ok: true,
            snapshot: {
                payload: buildSnapshot(`${caseId}_scene`),
                updatedAt: '2026-07-14T00:00:00.000Z'
            }
        }),
        mirrorVTTSnapshotToState: () => { }
    };
    const state = {
        getRole: () => model.role,
        getCaseTransitionId: () => model.caseTransitionId,
        getStateCaseId: () => model.stateCaseId,
        setStateCaseId: (caseId) => {
            model.stateCaseId = caseId;
        },
        getSnapshot: () => model.snapshot,
        setSnapshot: (snapshot) => {
            model.snapshot = snapshot;
        },
        isInitialLoadPending: () => model.initialLoadPending,
        setInitialLoadPending: (pending) => {
            model.initialLoadPending = pending;
        },
        readSharedSnapshot: () => model.snapshot,
        ensureRosterPresentation: (snapshot) => ({ snapshot }),
        persistSnapshot: (snapshot) => snapshot,
        syncRosterPresentation: () => { },
        coerceFog: () => false,
        clearPendingRemoteSnapshot: () => {
            calls.clearPendingRemoteSnapshot += 1;
        },
        applyRemoteSnapshot: (snapshot, caseId) => {
            calls.applySnapshots.push({ snapshot, caseId });
        },
        applyRemotePositionChanges: (changes, meta, caseId) => {
            calls.applyPositionChanges.push({ changes, meta, caseId });
        }
    };
    const storePort = {
        getStore: () => store,
        getActiveCaseId: () => model.activeCaseId,
        getRoomId: (caseId) => `room:${caseId}`,
        getCollabReady: () => model.collabReady
    };
    const ui = {
        setSyncChip: (status) => calls.syncChips.push(status),
        getSyncChipState: () => {
            const current = calls.syncChips.at(-1);
            return current ? current.state : 'local';
        },
        setActiveSceneLabel: () => { },
        normalizeSelections: () => {
            calls.normalizeSelections += 1;
        },
        render: () => {
            calls.renders += 1;
        },
        fitViewToWorld: () => {
            calls.fitView += 1;
        },
        processInitiativeQueue: () => {
            calls.processInitiativeQueue += 1;
        },
        closeAdminMenus: () => { },
        confirm: () => true,
        alert: () => { },
        bindSyncRetry: () => { }
    };

    return {
        model,
        calls,
        state,
        store,
        storePort,
        ui,
        options: {
            state,
            store: storePort,
            ui,
            defaultSnapshot: buildSnapshot('blank_scene')
        }
    };
};

test('VTT session factory validates all three explicit ports', () => {
    const harness = createHarness();

    assert.throws(() => sessionFactory.create(null), /requires an options object/);
    assert.throws(() => sessionFactory.create([]), /requires an options object/);
    assert.throws(() => sessionFactory.create({}), /requires a state port/);
    assert.throws(
        () => sessionFactory.create({ state: harness.state }),
        /requires a store port/
    );
    assert.throws(
        () => sessionFactory.create({ state: harness.state, store: harness.storePort }),
        /requires a ui port/
    );

    const incompleteState = { ...harness.state };
    delete incompleteState.applyRemoteSnapshot;
    assert.throws(
        () => sessionFactory.create({ ...harness.options, state: incompleteState }),
        /state port is missing: applyRemoteSnapshot/
    );

    const incompleteStore = { ...harness.storePort };
    delete incompleteStore.getRoomId;
    assert.throws(
        () => sessionFactory.create({ ...harness.options, store: incompleteStore }),
        /store port is missing: getRoomId/
    );

    const incompleteUi = { ...harness.ui };
    delete incompleteUi.render;
    assert.throws(
        () => sessionFactory.create({ ...harness.options, ui: incompleteUi }),
        /ui port is missing: render/
    );

    assert.equal(typeof sessionFactory.create(harness.options).init, 'function');
});

test('VTT session formats a ready peer status with its peer count', () => {
    const harness = createHarness();
    const controller = sessionFactory.create(harness.options);

    controller.setStatus({
        state: 'live',
        connected: true,
        transportConnected: true,
        peerCount: 2,
        detail: 'Ready'
    });

    assert.deepEqual(harness.calls.syncChips.at(-1), {
        state: 'live',
        label: 'Live · 2',
        detail: 'Ready',
        retryable: false
    });
});

test('VTT session destroys a collaboration result made stale by a case transition', async () => {
    const harness = createHarness();
    const deferred = createDeferred();
    const created = [];
    harness.model.collabReady = Promise.resolve({
        createSession: (options) => {
            created.push(options);
            return deferred.promise;
        }
    });
    const fake = createFakeSession('case_one', 'stale case');
    const controller = sessionFactory.create(harness.options);

    const initPromise = controller.init();
    await waitFor(() => created.length === 1, 'collaboration session creation did not start');

    harness.model.activeCaseId = 'case_two';
    harness.model.caseTransitionId += 1;
    deferred.resolve(fake.session);

    assert.equal(await initPromise, null);
    assert.equal(fake.calls.destroy, 1);
    assert.equal(controller.getTransport(), null);
    assert.equal(harness.calls.applySnapshots.length, 0);
    assert.equal(harness.calls.applyPositionChanges.length, 0);
});

test('VTT session never installs a late DM session after authority changes to player', async () => {
    const harness = createHarness();
    const dmDeferred = createDeferred();
    const playerDeferred = createDeferred();
    const createCalls = [];
    harness.model.collabReady = Promise.resolve({
        createSession: (options) => {
            createCalls.push(options);
            return createCalls.length === 1 ? dmDeferred.promise : playerDeferred.promise;
        }
    });
    const staleDm = createFakeSession('case_one', 'stale DM');
    const currentPlayer = createFakeSession('case_one', 'current player');
    const controller = sessionFactory.create(harness.options);

    harness.model.role = 'dm';
    const dmTransition = controller.handleRoleChanged('player', 'dm');
    await waitFor(() => createCalls.length === 1, 'DM collaboration session creation did not start');

    harness.model.role = 'player';
    const playerTransition = controller.handleRoleChanged('dm', 'player');
    await waitFor(() => createCalls.length === 2, 'player collaboration session creation did not start');

    playerDeferred.resolve(currentPlayer.session);
    assert.equal(await playerTransition, currentPlayer.session);
    assert.equal(controller.getTransport(), currentPlayer.session);

    dmDeferred.resolve(staleDm.session);
    assert.equal(await dmTransition, null);
    assert.equal(staleDm.calls.destroy, 1);
    assert.equal(currentPlayer.calls.destroy, 0);
    assert.equal(currentPlayer.calls.authorityChanged, 1);
    assert.equal(controller.getTransport(), currentPlayer.session);
});
