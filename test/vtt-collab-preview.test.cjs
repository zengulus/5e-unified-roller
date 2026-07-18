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
