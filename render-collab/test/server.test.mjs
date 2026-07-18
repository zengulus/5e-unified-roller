import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as Y from '../../js/vendor/yjs/yjs.mjs';
import * as syncProtocol from '../../js/vendor/y-protocols/sync.js';
import * as encoding from '../../js/vendor/lib0/encoding.js';
import * as decoding from '../../js/vendor/lib0/decoding.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(testDir, '..', 'server.js');

const extractDeclaration = (source, name, nextName) => {
  const startMarker = `const ${name} =`;
  const endMarker = `\n\nconst ${nextName} =`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Could not find ${name} in render-collab/server.js`);
  assert.notEqual(end, -1, `Could not find the end of ${name} in render-collab/server.js`);
  return source.slice(start, end).trim();
};

const encodeBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const decodeBase64 = (value) => new Uint8Array(Buffer.from(String(value || ''), 'base64'));
const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
  if (value === null || value === undefined) return fallback;
  return String(value).slice(0, maxLen);
};
const isDocumentBearingSyncMessage = (messageType) => (
  messageType === syncProtocol.messageYjsSyncStep2
  || messageType === syncProtocol.messageYjsUpdate
);
const syncMessageTypeName = (messageType) => {
  if (messageType === syncProtocol.messageYjsSyncStep1) return 'sync-step-1';
  if (messageType === syncProtocol.messageYjsSyncStep2) return 'sync-step-2';
  if (messageType === syncProtocol.messageYjsUpdate) return 'update';
  return `unknown-${messageType}`;
};
const buildRoomMeta = (room) => ({
  seeded: !!room.seeded,
  updateCount: room.updateCount || 0,
  syncMessageCount: room.syncMessageCount || 0,
  lastMessageType: room.lastMessageType || ''
});

const buildUpdateMessage = (doc) => {
  const encoder = encoding.createEncoder();
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  return encodeBase64(encoding.toUint8Array(encoder));
};

test('relay doc observer broadcasts one packet for one inbound document update', async () => {
  const source = await readFile(serverPath, 'utf8');
  const observerDeclaration = extractDeclaration(source, 'attachRoomDocObserver', 'getRoom');
  const handlerDeclaration = extractDeclaration(source, 'handleYSyncBroadcast', 'emitPresence');
  const deliveries = [];

  const broadcastToRoom = (room, sender, packet) => {
    room.clients.forEach((client) => {
      if (client !== sender) deliveries.push({ client, packet });
    });
  };

  const createRelayFunctions = Function(
    'Y',
    'syncProtocol',
    'encoding',
    'decoding',
    'encodeBase64',
    'decodeBase64',
    'toTrimmedString',
    'isDocumentBearingSyncMessage',
    'syncMessageTypeName',
    'buildRoomMeta',
    'broadcastToRoom',
    'sendYSyncMessage',
    'sendYSyncStatus',
    'logEvent',
    'SERVICE_NAME',
    `'use strict';\n${observerDeclaration}\n${handlerDeclaration}\nreturn { attachRoomDocObserver, handleYSyncBroadcast };`
  );
  const relay = createRelayFunctions(
    Y,
    syncProtocol,
    encoding,
    decoding,
    encodeBase64,
    decodeBase64,
    toTrimmedString,
    isDocumentBearingSyncMessage,
    syncMessageTypeName,
    buildRoomMeta,
    broadcastToRoom,
    () => false,
    () => false,
    () => {},
    'RTF relay test'
  );

  const sender = { socket: {}, instanceId: 'sender' };
  const receiver = { socket: {}, instanceId: 'receiver' };
  const room = {
    id: 'duplicate-update-test',
    clients: new Set([sender, receiver]),
    doc: new Y.Doc(),
    seeded: false,
    lastYUpdateAt: 0,
    lastYSyncAt: 0,
    updateCount: 0,
    syncMessageCount: 0,
    lastMessageType: ''
  };
  relay.attachRoomDocObserver(room);

  const sourceDoc = new Y.Doc();
  sourceDoc.getMap('state').set('value', 'delivered-once');
  relay.handleYSyncBroadcast(room, sender, {
    update: buildUpdateMessage(sourceDoc),
    seed: true,
    seedAuthority: 'gm'
  });

  assert.equal(deliveries.length, 1, 'one inbound document update must be relayed once');
  assert.equal(deliveries[0].client, receiver);
  assert.equal(deliveries[0].packet.event, 'y-sync');
  assert.equal(room.seeded, true);
  assert.equal(room.updateCount, 1);
  assert.equal(room.syncMessageCount, 1);

  const receivedBytes = decodeBase64(deliveries[0].packet.payload.update);
  const receiverDoc = new Y.Doc();
  let applyError = null;
  const messageType = syncProtocol.readSyncMessage(
    decoding.createDecoder(receivedBytes),
    encoding.createEncoder(),
    receiverDoc,
    null,
    (err) => { applyError = err; }
  );
  assert.equal(applyError, null);
  assert.equal(messageType, syncProtocol.messageYjsUpdate);
  assert.equal(receiverDoc.getMap('state').get('value'), 'delivered-once');
});
