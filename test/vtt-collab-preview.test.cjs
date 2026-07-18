const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const workspaceRoot = path.join(__dirname, '..');

const toDataModuleUrl = (source) => (
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const loadCollabModule = async () => {
    const modulePath = path.join(workspaceRoot, 'js', 'vtt-collab.js');
    let source = fs.readFileSync(modulePath, 'utf8');

    source = source.replace(
        /from ['"](\.\/vendor\/[^'"]+)['"]/g,
        (_match, relativePath) => `from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(modulePath), relativePath)).href)}`
    );

    const relayStubUrl = toDataModuleUrl(
        'export const createCollabRelayChannel = () => { throw new Error("relay creation is outside this unit test"); };'
    );
    source = source.replace(
        /from ['"]\.\/collab-relay-client\.js[^'"]*['"]/,
        `from ${JSON.stringify(relayStubUrl)}`
    );

    return import(toDataModuleUrl(source));
};

const collabModulePromise = loadCollabModule();

const buildSeedSnapshot = () => ({
    updatedAt: 0,
    activeSceneId: 'scene_one',
    scenes: [{
        id: 'scene_one',
        tokens: [{ id: 'token_one', x: 1, y: 2 }]
    }],
    initiative: { round: 1, activeEntryId: '', entries: [] }
});

const createPersistenceSpy = () => {
    const calls = {
        mirrors: [],
        saves: []
    };
    return {
        calls,
        store: {
            mirrorVTTSnapshotToState: (request) => calls.mirrors.push(request),
            saveVTTRoomSnapshot: async (request) => {
                calls.saves.push(request);
                return { ok: true };
            }
        }
    };
};

const observeDocument = (session) => {
    const counts = { updates: 0, transactions: 0 };
    session.doc.on('update', () => {
        counts.updates += 1;
    });
    session.doc.on('afterTransaction', () => {
        counts.transactions += 1;
    });
    return counts;
};

test('collaboration checkpoints preserve encounter ownership and clock cadence', async () => {
    const { exportVTTCheckpointFromSnapshot, decodeVTTCheckpointToSnapshot } = await collabModulePromise;
    const snapshot = buildSeedSnapshot();
    snapshot.scenes[0].clocks = [{
        id: 'clock_round',
        title: 'Reinforcements',
        current: 2,
        max: 6,
        hidden: false,
        cadence: 'round'
    }];
    snapshot.initiative = {
        entries: [{ id: 'entry_one', name: 'Hero', total: 18, tie: 14 }],
        round: 3,
        activeEntryId: 'entry_one',
        encounterActive: true,
        sceneId: 'scene_one',
        startedAt: 1784342400000
    };

    const coerceSnapshot = (value) => structuredClone(value);
    const checkpoint = exportVTTCheckpointFromSnapshot(snapshot, coerceSnapshot);
    const decoded = decodeVTTCheckpointToSnapshot(checkpoint, coerceSnapshot);

    assert.equal(decoded.scenes[0].clocks[0].cadence, 'round');
    assert.equal(decoded.initiative.round, 3);
    assert.equal(decoded.initiative.entries[0].id, 'entry_one');
    assert.equal(decoded.initiative.activeEntryId, 'entry_one');
    assert.equal(decoded.initiative.encounterActive, true);
    assert.equal(decoded.initiative.sceneId, 'scene_one');
    assert.equal(decoded.initiative.startedAt, 1784342400000);
});

test('non-final token previews send only the compact event without Y.Doc or persistence writes', async (t) => {
    const { VTTCollabSession } = await collabModulePromise;
    const persistence = createPersistenceSpy();
    const session = new VTTCollabSession({
        roomId: 'room_one',
        store: persistence.store,
        getSeedPayload: buildSeedSnapshot
    });
    const outbound = [];
    const persistenceSchedules = { mirror: 0, cloud: 0 };
    const fixedNow = 1784342400123;

    t.after(() => {
        session.awareness.destroy();
        session.doc.destroy();
    });

    session.instanceId = 'sender_one';
    session.connected = true;
    session.ready = true;
    session.canLoadColdSnapshot = true;
    session.channel = {
        send: async (packet) => {
            outbound.push(packet);
            return 'ok';
        }
    };
    session.scheduleMirror = () => {
        persistenceSchedules.mirror += 1;
    };
    session.scheduleCloudFlush = () => {
        persistenceSchedules.cloud += 1;
    };

    const beforeDoc = session.doc.toJSON();
    const beforeLastSnapshot = session.lastSnapshot;
    const beforePendingSnapshot = session.pendingSnapshot;
    const documentCounts = observeDocument(session);
    session.doc.on('update', session.handleDocUpdate);
    session.doc.on('afterTransaction', session.handleAfterTransaction);
    t.mock.method(Date, 'now', () => fixedNow);

    const result = await session.previewTokenPositions([
        {
            sceneId: ' scene_one ',
            tokenId: ' token_one ',
            x: 1.23456,
            y: 4.56789,
            snapshot: 'must-not-cross-the-wire'
        },
        { sceneId: '', tokenId: 'ignored', x: 99, y: 99 }
    ]);

    assert.deepEqual(result, { ok: true, reason: 'preview-sent' });
    assert.deepEqual(outbound, [{
        type: 'broadcast',
        event: 'vtt-token-position-preview',
        payload: {
            changes: [{
                sceneId: 'scene_one',
                tokenId: 'token_one',
                x: 1.235,
                y: 4.568
            }],
            sentBy: 'sender_one',
            sentAt: fixedNow
        }
    }]);
    assert.deepEqual(session.doc.toJSON(), beforeDoc);
    assert.deepEqual(documentCounts, { updates: 0, transactions: 0 });
    assert.equal(session.lastSnapshot, beforeLastSnapshot);
    assert.equal(session.pendingSnapshot, beforePendingSnapshot);
    assert.equal(session.isDirty, false);
    assert.deepEqual(persistenceSchedules, { mirror: 0, cloud: 0 });
    assert.deepEqual(persistence.calls, { mirrors: [], saves: [] });
    assert.equal(session.pendingMirrorTimer, null);
    assert.equal(session.pendingFlushTimer, null);
});

test('received token previews dispatch sanitized positions with ephemeral metadata only', async (t) => {
    const { VTTCollabSession } = await collabModulePromise;
    const persistence = createPersistenceSpy();
    const applied = [];
    const session = new VTTCollabSession({
        roomId: 'room_one',
        store: persistence.store,
        getSeedPayload: buildSeedSnapshot,
        applyPositionChanges: (changes, meta) => applied.push({ changes, meta })
    });
    const persistenceSchedules = { mirror: 0, cloud: 0 };

    t.after(() => {
        session.awareness.destroy();
        session.doc.destroy();
    });

    session.instanceId = 'receiver_one';
    session.ready = true;
    session.canLoadColdSnapshot = true;
    session.scheduleMirror = () => {
        persistenceSchedules.mirror += 1;
    };
    session.scheduleCloudFlush = () => {
        persistenceSchedules.cloud += 1;
    };

    const beforeDoc = session.doc.toJSON();
    const documentCounts = observeDocument(session);
    session.doc.on('afterTransaction', session.handleAfterTransaction);

    session.handleTokenPositionPreviewMessage({
        changes: [
            { sceneId: 'scene_one', tokenId: 'token_one', x: 8.7654, y: -5 },
            { sceneId: 'scene_one', tokenId: '', x: 3, y: 4 }
        ],
        sentBy: 'sender_one',
        sentAt: 1784342400456,
        snapshot: { mustNotBeApplied: true }
    });

    assert.equal(applied.length, 1);
    assert.deepEqual(applied[0].changes, [{
        sceneId: 'scene_one',
        tokenId: 'token_one',
        x: 8.765,
        y: 0
    }]);
    assert.equal(applied[0].meta.origin, session.originPositionPreview);
    assert.equal(applied[0].meta.ephemeral, true);
    assert.equal(applied[0].meta.sentAt, 1784342400456);
    assert.equal(Object.hasOwn(applied[0].meta, 'snapshot'), false);
    assert.deepEqual(session.doc.toJSON(), beforeDoc);
    assert.deepEqual(documentCounts, { updates: 0, transactions: 0 });
    assert.deepEqual(persistenceSchedules, { mirror: 0, cloud: 0 });
    assert.deepEqual(persistence.calls, { mirrors: [], saves: [] });

    session.handleTokenPositionPreviewMessage({
        changes: [{ sceneId: 'scene_one', tokenId: 'token_one', x: 1, y: 2 }],
        sentBy: 'sender_one',
        sentAt: 1784342400700,
        settled: true
    });
    assert.equal(applied.length, 2);
    assert.equal(applied[1].meta.settled, true, 'a final preview can explicitly clear transient drag styling');

    session.handleTokenPositionPreviewMessage({
        changes: [{ sceneId: 'scene_one', tokenId: 'token_one', x: 12, y: 13 }],
        sentBy: 'receiver_one',
        sentAt: 1784342400789
    });
    assert.equal(applied.length, 2, 'the relay echo must not reapply the sender\'s own preview');
});

test('final token drop uses one narrow Y.Doc transaction and one deferred checkpoint schedule', async (t) => {
    const { VTTCollabSession } = await collabModulePromise;
    const persistence = createPersistenceSpy();
    const localDispatches = { snapshots: 0, positions: 0 };
    const session = new VTTCollabSession({
        roomId: 'room_one',
        store: persistence.store,
        getSeedPayload: buildSeedSnapshot,
        applySnapshot: () => {
            localDispatches.snapshots += 1;
        },
        applyPositionChanges: () => {
            localDispatches.positions += 1;
        }
    });
    const schedules = { mirror: 0, cloud: [] };
    const outbound = [];
    let reconciles = 0;
    let eagerFlushes = 0;

    t.after(() => {
        session.awareness.destroy();
        session.doc.destroy();
    });

    session.flushSnapshotNow = async () => {
        eagerFlushes += 1;
        return { ok: true };
    };
    await session.forceAuthoritativeSnapshot(buildSeedSnapshot());
    eagerFlushes = 0;
    session.lastSnapshot = session.coerceSnapshot(buildSeedSnapshot());
    session.pendingSnapshot = session.lastSnapshot;
    session.instanceId = 'sender_one';
    session.connected = true;
    session.ready = true;
    session.scheduleMirror = () => {
        schedules.mirror += 1;
    };
    session.scheduleCloudFlush = (options = {}) => {
        schedules.cloud.push({ ...options });
    };
    session.requestPeerReconcile = () => {
        reconciles += 1;
    };
    session.refreshPresenceTracking = async () => {};
    session.sendBroadcast = async (event, payload) => {
        outbound.push({ event, payload });
        return true;
    };

    const documentCounts = observeDocument(session);
    session.doc.on('update', session.handleDocUpdate);
    session.doc.on('afterTransaction', session.handleAfterTransaction);
    const beforeDropSnapshot = session.lastSnapshot;
    const beforeDropInitiative = beforeDropSnapshot.initiative;

    const result = await session.updateTokenPositions([{
        sceneId: 'scene_one',
        tokenId: 'token_one',
        x: 7.25,
        y: 8.5
    }], { flushNow: true });

    assert.deepEqual(result, {
        ok: true,
        changes: [{ sceneId: 'scene_one', tokenId: 'token_one', x: 7.25, y: 8.5 }]
    });
    assert.deepEqual(documentCounts, { updates: 1, transactions: 1 });
    assert.deepEqual(outbound.map((entry) => entry.event), ['y-sync'], 'the Yjs delta is the only immediate live-room update');
    assert.deepEqual(outbound[0].payload.positionChanges, [{
        sceneId: 'scene_one',
        tokenId: 'token_one',
        x: 7.25,
        y: 8.5
    }], 'the Yjs packet carries a compact hint so peers can take the same position fast path');
    assert.deepEqual(schedules, {
        mirror: 0,
        cloud: [{ forceCompatibilityMirror: true }]
    });
    assert.equal(schedules.mirror, 0, 'the deferred checkpoint replaces a redundant full local-store mirror on every drop');
    assert.equal(eagerFlushes, 0, 'drop schedules its checkpoint instead of flushing a snapshot inline');
    assert.equal(reconciles, 0, 'periodic Yjs reconciliation replaces a redundant bounce on every drop');
    assert.deepEqual(localDispatches, { snapshots: 0, positions: 0 }, 'the originating client does not reapply its own final drop');
    assert.deepEqual(persistence.calls, { mirrors: [], saves: [] }, 'drop does not synchronously persist a whole snapshot');
    assert.notEqual(session.lastSnapshot, beforeDropSnapshot);
    assert.equal(
        session.lastSnapshot.initiative,
        beforeDropInitiative,
        'the position fast path structurally shares untouched snapshot branches instead of serializing the whole Y.Doc'
    );
    assert.equal(session.pendingSnapshot, session.lastSnapshot);
    assert.deepEqual(
        session.getSnapshot().scenes[0].tokens[0],
        { id: 'token_one', x: 7.25, y: 8.5 }
    );
});

test('remote final drops reuse the compact position fast path without serializing or mirroring the full snapshot', async (t) => {
    const { VTTCollabSession } = await collabModulePromise;
    const sender = new VTTCollabSession({
        roomId: 'room_fast_path_sender',
        store: createPersistenceSpy().store,
        getSeedPayload: buildSeedSnapshot
    });
    const remoteDispatches = { snapshots: 0, positions: [] };
    const receiver = new VTTCollabSession({
        roomId: 'room_fast_path_receiver',
        store: createPersistenceSpy().store,
        getSeedPayload: buildSeedSnapshot,
        applySnapshot: () => {
            remoteDispatches.snapshots += 1;
        },
        applyPositionChanges: (changes) => {
            remoteDispatches.positions.push(changes);
        }
    });
    const outbound = [];
    const receiverSchedules = { mirror: 0, cloud: 0 };

    t.after(() => {
        sender.awareness.destroy();
        sender.doc.destroy();
        receiver.awareness.destroy();
        receiver.doc.destroy();
    });

    await sender.forceAuthoritativeSnapshot(buildSeedSnapshot());
    await receiver.forceAuthoritativeSnapshot(buildSeedSnapshot());
    sender.connected = true;
    sender.ready = true;
    sender.sendBroadcast = async (event, payload) => {
        outbound.push({ event, payload });
        return true;
    };
    sender.scheduleMirror = () => {};
    sender.scheduleCloudFlush = () => {};
    sender.doc.on('update', sender.handleDocUpdate);
    sender.doc.on('afterTransaction', sender.handleAfterTransaction);
    receiver.ready = true;
    receiver.scheduleMirror = () => {
        receiverSchedules.mirror += 1;
    };
    receiver.scheduleCloudFlush = () => {
        receiverSchedules.cloud += 1;
    };
    receiver.doc.on('afterTransaction', receiver.handleAfterTransaction);
    const beforeInitiative = receiver.lastSnapshot.initiative;

    await sender.updateTokenPositions([{
        sceneId: 'scene_one',
        tokenId: 'token_one',
        x: 11,
        y: 12
    }]);
    const syncPacket = outbound.find((entry) => entry.event === 'y-sync');
    assert.ok(syncPacket);
    receiver.handleSyncMessage(syncPacket.payload);

    assert.deepEqual(remoteDispatches, {
        snapshots: 0,
        positions: [[{ sceneId: 'scene_one', tokenId: 'token_one', x: 11, y: 12 }]]
    });
    assert.deepEqual(receiverSchedules, { mirror: 0, cloud: 0 });
    assert.equal(receiver.lastSnapshot.initiative, beforeInitiative, 'untouched branches stay structurally shared on peers');
    assert.deepEqual(receiver.getSnapshot().scenes[0].tokens[0], { id: 'token_one', x: 11, y: 12 });
});
