const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const workspaceRoot = path.join(__dirname, '..');

const toDataModuleUrl = (source) => (
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const loadBoardCollabModule = async () => {
    const modulePath = path.join(workspaceRoot, 'js', 'board-collab.js');
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

const boardCollabModulePromise = loadBoardCollabModule();

const buildSnapshot = () => ({
    name: 'Case Board',
    nodes: [{ id: 'node_one', type: 'clue', x: 10, y: 20, title: 'Lead', body: '', meta: null }],
    connections: []
});

test('explicit Board flushes schedule an immediate compatibility checkpoint', async (t) => {
    const { BoardCollabSession } = await boardCollabModulePromise;
    const session = new BoardCollabSession({ roomId: 'case:flush', caseId: 'case_flush' });
    const scheduled = [];

    t.after(() => {
        session.awareness.destroy();
        session.doc.destroy();
    });

    session.ready = true;
    session.scheduleCloudFlush = (options = {}) => scheduled.push({ ...options });

    const snapshot = buildSnapshot();
    await session.syncSnapshot(snapshot, {
        flushNow: true,
        forceHistory: true,
        historyReason: 'manual-save'
    });
    await session.syncSnapshot(snapshot, { flushNow: true });
    session.updateNodePositions([{ id: 'node_one', x: 40, y: 60 }], { flushNow: true });

    assert.deepEqual(scheduled, [
        {
            forceNow: true,
            forceHistory: true,
            historyReason: 'manual-save',
            forceCompatibilityMirror: true
        },
        {
            forceNow: true,
            forceHistory: false,
            historyReason: '',
            forceCompatibilityMirror: true
        },
        {
            forceNow: true,
            forceCompatibilityMirror: true
        }
    ]);
});
