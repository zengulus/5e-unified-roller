import http from 'node:http';
import { WebSocketServer } from 'ws';
import * as Y from '../js/vendor/yjs/yjs.mjs';
import * as syncProtocol from '../js/vendor/y-protocols/sync.js';
import * as encoding from '../js/vendor/lib0/encoding.js';
import * as decoding from '../js/vendor/lib0/decoding.js';

const PORT = Number.parseInt(process.env.PORT || '10000', 10) || 10000;
const HOST = process.env.HOST || '0.0.0.0';
const SERVICE_NAME = String(process.env.SERVICE_NAME || 'RTF collab relay').trim() || 'RTF collab relay';
const DEFAULT_MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_BYTES = Math.max(1024, Number.parseInt(process.env.MAX_MESSAGE_BYTES || String(DEFAULT_MAX_MESSAGE_BYTES), 10) || DEFAULT_MAX_MESSAGE_BYTES);
const ROOM_IDLE_TTL_MS = Math.max(0, Number.parseInt(process.env.ROOM_IDLE_TTL_MS || '1800000', 10) || 1800000);
const LOG_CONNECTIONS = /^(1|true|yes|on)$/i.test(String(process.env.LOG_CONNECTIONS || '').trim());
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const rooms = new Map();
const startedAt = Date.now();

const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
  if (value === null || value === undefined) return fallback;
  return String(value).slice(0, maxLen);
};

const countClients = () => Array.from(rooms.values()).reduce((sum, room) => sum + room.clients.size, 0);
const countStatefulRooms = () => Array.from(rooms.values()).filter((room) => room && room.doc instanceof Y.Doc).length;
const ageMs = (stamp) => (stamp ? Math.max(0, Date.now() - stamp) : null);
const syncMessageTypeName = (messageType) => {
  if (messageType === syncProtocol.messageYjsSyncStep1) return 'sync-step-1';
  if (messageType === syncProtocol.messageYjsSyncStep2) return 'sync-step-2';
  if (messageType === syncProtocol.messageYjsUpdate) return 'update';
  return `unknown-${messageType}`;
};

const isDocumentBearingSyncMessage = (messageType) => (
  messageType === syncProtocol.messageYjsSyncStep2
  || messageType === syncProtocol.messageYjsUpdate
);

const logEvent = (...parts) => {
  if (!LOG_CONNECTIONS) return;
  console.log('[relay]', ...parts);
};

const buildPresenceState = (room) => {
  const out = {};
  if (!room) return out;
  room.clients.forEach((client) => {
    if (!client.presence) return;
    const key = client.presenceKey || client.instanceId || 'anon';
    if (!out[key]) out[key] = [];
    out[key].push({
      ...client.presence,
      instanceId: client.instanceId,
      userId: client.userId,
      profileName: client.profileName
    });
  });
  return out;
};

const sendJson = (socket, packet) => {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify(packet));
};

const sendSerializedJson = (socket, serializedPacket) => {
  if (!socket || socket.readyState !== 1 || !serializedPacket) return;
  socket.send(serializedPacket);
};

const encodeBase64 = (bytes) => {
  if (!(bytes instanceof Uint8Array)) return '';
  return Buffer.from(bytes).toString('base64');
};

const decodeBase64 = (value) => {
  const clean = toTrimmedString(value, '', MAX_MESSAGE_BYTES).trim();
  if (!clean) return null;
  try {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  } catch {
    return null;
  }
};

const buildRoomMeta = (room) => ({
  seeded: !!(room && room.seeded),
  updateCount: Math.max(0, Number.parseInt(room && room.updateCount || 0, 10) || 0),
  syncMessageCount: Math.max(0, Number.parseInt(room && room.syncMessageCount || 0, 10) || 0),
  lastMessageType: room && room.lastMessageType ? room.lastMessageType : '',
  lastYUpdateAt: room && room.lastYUpdateAt ? room.lastYUpdateAt : 0,
  lastYSyncAt: room && room.lastYSyncAt ? room.lastYSyncAt : 0
});

const sendYSyncStatus = (client, room) => {
  if (!client || !room) return false;
  sendJson(client.socket, {
    type: 'broadcast',
    event: 'y-sync-status',
    payload: {
      room: buildRoomMeta(room),
      relayedBy: SERVICE_NAME
    }
  });
  return true;
};

const sendYSyncMessage = (client, encoder, room = null) => {
  if (!client || !encoder || !encoding.hasContent(encoder)) return false;
  const update = encodeBase64(encoding.toUint8Array(encoder));
  if (!update) return false;
  sendJson(client.socket, {
    type: 'broadcast',
    event: 'y-sync',
    payload: {
      update,
      room: buildRoomMeta(room),
      relayedBy: SERVICE_NAME
    }
  });
  return true;
};

const broadcastToRoom = (room, sender, packet) => {
  if (!room) return;
  // A room broadcast has identical contents for every recipient. Serialize it
  // once so the relay's CPU cost does not grow with both event rate and peers.
  const serializedPacket = JSON.stringify(packet);
  room.clients.forEach((client) => {
    if (client === sender) return;
    sendSerializedJson(client.socket, serializedPacket);
  });
};

const attachRoomDocObserver = (room) => {
  if (!room || !(room.doc instanceof Y.Doc)) return;
  room.doc.on('update', (update, origin) => {
    room.seeded = true;
    room.lastYUpdateAt = Date.now();
    room.updateCount = Math.max(0, Number.parseInt(room.updateCount || 0, 10) || 0) + 1;
    const sender = origin && typeof origin === 'object' && origin.socket ? origin : null;
    const encoder = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder, update);
    const encodedUpdate = encodeBase64(encoding.toUint8Array(encoder));
    if (!encodedUpdate) return;
    broadcastToRoom(room, sender, {
      type: 'broadcast',
      event: 'y-sync',
      payload: {
        update: encodedUpdate,
        room: buildRoomMeta(room),
        relayedBy: SERVICE_NAME
      }
    });
  });
};

const getRoom = (roomId) => {
  const key = toTrimmedString(roomId, '', 160).trim();
  if (!key) return null;
  if (!rooms.has(key)) {
    const room = {
      id: key,
      clients: new Set(),
      doc: new Y.Doc(),
      seeded: false,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      lastYUpdateAt: 0,
      lastYSyncAt: 0,
      updateCount: 0,
      syncMessageCount: 0,
      lastMessageType: ''
    };
    attachRoomDocObserver(room);
    rooms.set(key, room);
  }
  return rooms.get(key);
};

const removeRoomIfEmpty = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.clients.size) return;
  if ((Date.now() - (room.lastSeenAt || 0)) < ROOM_IDLE_TTL_MS) return;
  if (room.doc && typeof room.doc.destroy === 'function') {
    room.doc.destroy();
  }
  rooms.delete(roomId);
};

const resetRoomDoc = (room) => {
  if (!room) return;
  if (room.doc && typeof room.doc.destroy === 'function') {
    room.doc.destroy();
  }
  room.doc = new Y.Doc();
  attachRoomDocObserver(room);
  room.lastSeenAt = Date.now();
  room.seeded = false;
  room.lastYUpdateAt = 0;
  room.lastYSyncAt = 0;
  room.updateCount = 0;
  room.syncMessageCount = 0;
  room.lastMessageType = 'reset';
};

const sweepIdleRooms = () => {
  rooms.forEach((room, roomId) => {
    if (!room || room.clients.size) return;
    removeRoomIfEmpty(roomId);
  });
};

const handleYSyncBroadcast = (room, sender, payload) => {
  if (!room || !(room.doc instanceof Y.Doc) || !sender || !payload || typeof payload !== 'object') return;
  const update = decodeBase64(payload.update);
  if (!update) return;

  let incomingMessageType = -1;
  try {
    const probeDecoder = decoding.createDecoder(update);
    incomingMessageType = decoding.readVarUint(probeDecoder);
  } catch (err) {
    console.warn('[relay] y-sync decode failed', err);
    return;
  }

  const isGmSeed = payload.seed === true && toTrimmedString(payload.seedAuthority, '', 20).trim() === 'gm';
  if (!room.seeded && isDocumentBearingSyncMessage(incomingMessageType) && !isGmSeed) {
    console.warn('[relay] rejected non-GM y-sync update for unseeded room', room.id);
    room.lastYSyncAt = Date.now();
    room.syncMessageCount = Math.max(0, Number.parseInt(room.syncMessageCount || 0, 10) || 0) + 1;
    room.lastMessageType = `rejected-${syncMessageTypeName(incomingMessageType)}`;
    sendYSyncStatus(sender, room);
    return;
  }

  const decoder = decoding.createDecoder(update);
  const replyEncoder = encoding.createEncoder();
  let messageType = -1;
  let applyFailed = false;
  try {
    messageType = syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, sender, (error) => {
      applyFailed = true;
      console.warn('[relay] y-sync apply failed', error);
    });
  } catch (err) {
    console.warn('[relay] y-sync decode failed', err);
    return;
  }

  if (applyFailed) return;

  room.lastYSyncAt = Date.now();
  room.syncMessageCount = Math.max(0, Number.parseInt(room.syncMessageCount || 0, 10) || 0) + 1;
  room.lastMessageType = syncMessageTypeName(messageType);
  if (messageType === syncProtocol.messageYjsUpdate) {
    logEvent('y-update', room.id, `seeded=${room.seeded ? 'true' : 'false'}`, `updates=${room.updateCount}`, `sync=${room.syncMessageCount}`);
  }

  sendYSyncMessage(sender, replyEncoder, room);
  sendYSyncStatus(sender, room);

  // Applied document updates are relayed by attachRoomDocObserver. Rebroadcasting
  // the inbound packet here would deliver the same update twice.
  if (messageType === syncProtocol.messageYjsSyncStep1) {
    const requestEncoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(requestEncoder, room.doc);
    sendYSyncMessage(sender, requestEncoder, room);
  }
};

const emitPresence = (room, event = 'sync') => {
  if (!room) return;
  const state = buildPresenceState(room);
  const serializedPacket = JSON.stringify({
    type: 'presence',
    event,
    state
  });
  room.clients.forEach((client) => {
    sendSerializedJson(client.socket, serializedPacket);
  });
};

const cleanupClient = (client) => {
  if (!client || !client.roomId) return;
  const roomId = client.roomId;
  const room = rooms.get(roomId);
  client.roomId = '';
  if (!room) return;
  room.clients.delete(client);
  room.lastSeenAt = Date.now();
  emitPresence(room, 'leave');
  removeRoomIfEmpty(roomId);
  logEvent('disconnect', roomId, `clients=${room.clients.size}`);
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const now = Date.now();
    const roomDiagnostics = Array.from(rooms.values()).map((room) => ({
      id: room.id,
      clientCount: room.clients.size,
      seeded: !!room.seeded,
      updateCount: Math.max(0, Number.parseInt(room.updateCount || 0, 10) || 0),
      syncMessageCount: Math.max(0, Number.parseInt(room.syncMessageCount || 0, 10) || 0),
      lastMessageType: room.lastMessageType || '',
      createdAt: room.createdAt || 0,
      lastSeenAt: room.lastSeenAt || 0,
      lastYUpdateAt: room.lastYUpdateAt || 0,
      lastYSyncAt: room.lastYSyncAt || 0,
      ageMs: Math.max(0, now - (room.createdAt || now)),
      lastSeenAgeMs: ageMs(room.lastSeenAt),
      lastYUpdateAgeMs: ageMs(room.lastYUpdateAt),
      lastYSyncAgeMs: ageMs(room.lastYSyncAt)
    }));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      service: SERVICE_NAME,
      rooms: rooms.size,
      statefulRooms: countStatefulRooms(),
      clients: countClients(),
      roomIds: Array.from(rooms.keys()).slice(0, 20),
      roomDiagnostics,
      startedAt,
      uptimeSeconds: Math.floor(process.uptime())
    }));
    return;
  }
  if (req.url === '/' || req.url === '/info') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      service: SERVICE_NAME,
      transport: 'websocket',
      healthcheck: '/healthz',
      websocketQuery: {
        roomId: 'required',
        campaignId: 'optional',
        instanceId: 'optional',
        presenceKey: 'optional',
        scope: 'optional',
        caseId: 'optional'
      },
      allowedOrigins: Array.from(ALLOWED_ORIGINS),
      maxMessageBytes: MAX_MESSAGE_BYTES
    }, null, 2));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not-found' }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

if (ROOM_IDLE_TTL_MS > 0) {
  setInterval(sweepIdleRooms, Math.min(ROOM_IDLE_TTL_MS, 60000)).unref();
}

wss.on('connection', (socket, req) => {
  const origin = toTrimmedString(req.headers.origin, '', 4000).trim();
  if (ALLOWED_ORIGINS.size && (!origin || !ALLOWED_ORIGINS.has(origin))) {
    socket.close(1008, 'origin-not-allowed');
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const roomId = toTrimmedString(url.searchParams.get('roomId'), '', 160).trim();
  const room = getRoom(roomId);

  if (!room) {
    socket.close(1008, 'missing-room');
    return;
  }

  const client = {
    socket,
    roomId: room.id,
    campaignId: toTrimmedString(url.searchParams.get('campaignId'), '', 160).trim(),
    instanceId: toTrimmedString(url.searchParams.get('instanceId'), '', 120).trim(),
    presenceKey: toTrimmedString(url.searchParams.get('presenceKey'), '', 120).trim(),
    profileName: '',
    userId: '',
    presence: null
  };
  room.clients.add(client);
  room.lastSeenAt = Date.now();
  emitPresence(room, 'join');
  logEvent('connect', room.id, `clients=${room.clients.size}`, origin ? `origin=${origin}` : 'origin=unknown');

  socket.on('message', (raw) => {
    let packet = null;
    try {
      packet = JSON.parse(String(raw || ''));
    } catch {
      return;
    }
    if (!packet || typeof packet !== 'object') return;

    room.lastSeenAt = Date.now();

    if (packet.type === 'ping') {
      sendJson(socket, {
        type: 'pong',
        ts: packet.ts || 0,
        serverTs: Date.now()
      });
      return;
    }

    if (packet.type === 'join') {
      const payload = packet.payload && typeof packet.payload === 'object' ? packet.payload : {};
      client.instanceId = toTrimmedString(payload.instanceId, client.instanceId, 120).trim();
      client.presenceKey = toTrimmedString(payload.presenceKey, client.presenceKey || client.instanceId, 120).trim();
      return;
    }

    if (packet.type === 'track') {
      const payload = packet.payload && typeof packet.payload === 'object' ? packet.payload : {};
      client.profileName = toTrimmedString(payload.profileName, client.profileName, 120).trim();
      client.userId = toTrimmedString(payload.userId, client.userId, 120).trim();
      client.presence = { ...payload };
      emitPresence(room, 'sync');
      return;
    }

    if (packet.type === 'untrack') {
      client.presence = null;
      emitPresence(room, 'sync');
      return;
    }

    if (packet.type === 'broadcast') {
      const event = toTrimmedString(packet.event, '', 80).trim();
      if (!event) return;
      if (event === 'admin-bust'
        || event === 'admin-apply-snapshot'
        || event === 'vtt-admin-bust'
        || event === 'vtt-admin-apply-snapshot') {
        resetRoomDoc(room);
      }
      if (event === 'y-sync') {
        handleYSyncBroadcast(room, client, packet.payload);
        return;
      }
      broadcastToRoom(room, client, {
        type: 'broadcast',
        event,
        payload: packet.payload && typeof packet.payload === 'object' ? packet.payload : {}
      });
    }
  });

  socket.on('close', () => {
    cleanupClient(client);
  });
  socket.on('error', () => {
    cleanupClient(client);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`${SERVICE_NAME} listening on ${HOST}:${PORT}`);
  if (ALLOWED_ORIGINS.size) {
    console.log(`Allowed websocket origins: ${Array.from(ALLOWED_ORIGINS).join(', ')}`);
  }
});
