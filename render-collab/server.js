import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number.parseInt(process.env.PORT || '10000', 10) || 10000;
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map();

const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
  if (value === null || value === undefined) return fallback;
  return String(value).slice(0, maxLen);
};

const getRoom = (roomId) => {
  const key = toTrimmedString(roomId, '', 160).trim();
  if (!key) return null;
  if (!rooms.has(key)) {
    rooms.set(key, {
      id: key,
      clients: new Set()
    });
  }
  return rooms.get(key);
};

const removeRoomIfEmpty = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.clients.size) return;
  rooms.delete(roomId);
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

const emitPresence = (room, event = 'sync') => {
  if (!room) return;
  const state = buildPresenceState(room);
  room.clients.forEach((client) => {
    sendJson(client.socket, {
      type: 'presence',
      event,
      state
    });
  });
};

const broadcastToRoom = (room, sender, packet) => {
  if (!room) return;
  room.clients.forEach((client) => {
    if (client === sender) return;
    sendJson(client.socket, packet);
  });
};

const cleanupClient = (client) => {
  if (!client || !client.roomId) return;
  const roomId = client.roomId;
  const room = rooms.get(roomId);
  client.roomId = '';
  if (!room) return;
  room.clients.delete(client);
  emitPresence(room, 'leave');
  removeRoomIfEmpty(roomId);
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      clients: Array.from(rooms.values()).reduce((sum, room) => sum + room.clients.size, 0)
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('RTF collab relay is running.\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
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
  emitPresence(room, 'join');

  socket.on('message', (raw) => {
    let packet = null;
    try {
      packet = JSON.parse(String(raw || ''));
    } catch {
      return;
    }
    if (!packet || typeof packet !== 'object') return;

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
  console.log(`RTF collab relay listening on ${HOST}:${PORT}`);
});
