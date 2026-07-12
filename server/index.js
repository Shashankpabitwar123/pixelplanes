import crypto from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import { AccessToken } from 'livekit-server-sdk';
import { WebSocketServer } from 'ws';

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173';
const ROOM_MAX_PLAYERS = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLANE_COLORS = ['blue', 'red', 'yellow', 'purple', 'green', 'cyan'];
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

const rooms = new Map();
const socketSessions = new WeakMap();
let dbPool = null;
let dbReady = false;

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function getDbPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
    });
  }
  return dbPool;
}

async function initDb() {
  const pool = getDbPool();
  if (!pool || dbReady) return;
  await pool.query(`
    create table if not exists room_events (
      id bigserial primary key,
      room_code text not null,
      event_type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists room_events_room_created_idx
      on room_events (room_code, created_at desc);
  `);
  dbReady = true;
}

async function logRoomEvent(roomCode, eventType, payload = {}) {
  const pool = getDbPool();
  if (!pool) return;
  try {
    await initDb();
    await pool.query(
      'insert into room_events (room_code, event_type, payload) values ($1, $2, $3::jsonb)',
      [roomCode, eventType, safeJson(payload)],
    );
  } catch (error) {
    console.warn('[db] room event skipped:', error.message);
  }
}

function generateRoomCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = Array.from({ length: 6 }, () =>
      ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
    ).join('');
    if (!rooms.has(code)) return code;
  }
  return crypto.randomUUID().slice(0, 6).toUpperCase();
}

function normalizeName(name, fallback) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 14);
  return clean || fallback;
}

function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

function pickPlaneColor(room) {
  const used = new Set(Array.from(room.players.values()).map((player) => player.color));
  const available = PLANE_COLORS.filter((color) => !used.has(color));
  const pool = available.length ? available : PLANE_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function roomForSocket(socket) {
  const session = socketSessions.get(socket);
  if (!session) return null;
  const room = rooms.get(session.roomCode);
  if (!room) return null;
  return { room, playerId: session.playerId };
}

function serializeRoom(room) {
  const players = Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    role: player.id === room.hostId ? 'Host' : 'Player',
    kills: player.kills,
    micEnabled: player.micEnabled,
    speakerEnabled: player.speakerEnabled,
    connected: room.sockets.has(player.id),
  }));

  return {
    code: room.code,
    theme: room.theme,
    hostId: room.hostId,
    maxPlayers: ROOM_MAX_PLAYERS,
    started: room.started,
    createdAt: room.createdAt,
    players,
  };
}

function broadcastRoomState(room) {
  for (const [playerId, socket] of room.sockets.entries()) {
    send(socket, {
      type: 'room_state',
      localPlayerId: playerId,
      room: serializeRoom(room),
    });
  }
}

function leaveRoom(socket, reason = 'left') {
  const session = socketSessions.get(socket);
  if (!session) return;

  const room = rooms.get(session.roomCode);
  socketSessions.delete(socket);
  if (!room) return;

  const leavingPlayer = room.players.get(session.playerId);
  room.players.delete(session.playerId);
  room.sockets.delete(session.playerId);

  if (!room.players.size) {
    rooms.delete(room.code);
    logRoomEvent(room.code, 'room_empty', { reason });
    return;
  }

  if (room.hostId === session.playerId) {
    const remaining = Array.from(room.players.keys());
    room.hostId = remaining[Math.floor(Math.random() * remaining.length)];
  }

  logRoomEvent(room.code, 'player_left', {
    reason,
    playerId: session.playerId,
    name: leavingPlayer?.name,
    hostId: room.hostId,
  });
  broadcastRoomState(room);
}

function createRoom(socket, payload) {
  leaveRoom(socket, 'new_room');

  const code = generateRoomCode();
  const room = {
    code,
    hostId: '',
    theme: normalizeTheme(payload.theme),
    players: new Map(),
    sockets: new Map(),
    started: false,
    createdAt: Date.now(),
  };

  const playerId = crypto.randomUUID();
  room.hostId = playerId;
  room.players.set(playerId, {
    id: playerId,
    name: normalizeName(payload.name, 'Player 1'),
    color: pickPlaneColor(room),
    kills: 0,
    micEnabled: payload.micEnabled !== false,
    speakerEnabled: payload.speakerEnabled !== false,
  });
  room.sockets.set(playerId, socket);
  rooms.set(code, room);
  socketSessions.set(socket, { roomCode: code, playerId });

  logRoomEvent(code, 'room_created', { hostId: playerId, theme: room.theme });
  broadcastRoomState(room);
}

function joinRoom(socket, payload) {
  leaveRoom(socket, 'join_other_room');

  const code = String(payload.code || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(socket, { type: 'room_error', message: 'Room not found.' });
    return;
  }
  if (room.players.size >= ROOM_MAX_PLAYERS) {
    send(socket, { type: 'room_error', message: 'Room is full.' });
    return;
  }
  if (room.started) {
    send(socket, { type: 'room_error', message: 'Game already started.' });
    return;
  }

  const playerId = crypto.randomUUID();
  room.players.set(playerId, {
    id: playerId,
    name: normalizeName(payload.name, `Player ${room.players.size + 1}`),
    color: pickPlaneColor(room),
    kills: 0,
    micEnabled: payload.micEnabled !== false,
    speakerEnabled: payload.speakerEnabled !== false,
  });
  room.sockets.set(playerId, socket);
  socketSessions.set(socket, { roomCode: code, playerId });

  logRoomEvent(code, 'player_joined', { playerId });
  broadcastRoomState(room);
}

function deleteRoom(socket) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  if (room.hostId !== playerId) {
    send(socket, { type: 'room_error', message: 'Only the host can delete the room.' });
    return;
  }

  for (const peer of room.sockets.values()) {
    socketSessions.delete(peer);
    send(peer, { type: 'room_deleted' });
  }
  rooms.delete(room.code);
  logRoomEvent(room.code, 'room_deleted', { hostId: playerId });
}

function updateRoomSettings(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  if (room.hostId !== playerId) {
    send(socket, { type: 'room_error', message: 'Only the host can change room settings.' });
    return;
  }

  room.theme = normalizeTheme(payload.theme);
  logRoomEvent(room.code, 'settings_updated', { theme: room.theme });
  broadcastRoomState(room);
}

function updateAudioSettings(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const player = current.room.players.get(current.playerId);
  if (!player) return;

  player.micEnabled = payload.micEnabled !== false;
  player.speakerEnabled = payload.speakerEnabled !== false;
  broadcastRoomState(current.room);
}

function startRoom(socket) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  if (room.hostId !== playerId) {
    send(socket, { type: 'room_error', message: 'Only the host can start the match.' });
    return;
  }

  room.started = true;
  logRoomEvent(room.code, 'room_started', {
    playerCount: room.players.size,
    theme: room.theme,
  });
  for (const peer of room.sockets.values()) {
    send(peer, { type: 'room_started', room: serializeRoom(room) });
  }
}

function updateKills(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const player = current.room.players.get(current.playerId);
  if (!player) return;

  const kills = Number.parseInt(payload.kills, 10);
  player.kills = Number.isFinite(kills) ? Math.max(-99, Math.min(999, kills)) : player.kills;
  broadcastRoomState(current.room);
}

function relayPlayerState(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  const message = {
    type: 'remote_player_state',
    playerId,
    state: payload.state || {},
    at: Date.now(),
  };
  for (const [peerId, peer] of room.sockets.entries()) {
    if (peerId !== playerId) send(peer, message);
  }
}

function handleSocketMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    send(socket, { type: 'room_error', message: 'Invalid message.' });
    return;
  }

  switch (message.type) {
    case 'create_room':
      createRoom(socket, message);
      break;
    case 'join_room':
      joinRoom(socket, message);
      break;
    case 'leave_room':
      leaveRoom(socket, 'client_leave');
      send(socket, { type: 'room_left' });
      break;
    case 'delete_room':
      deleteRoom(socket);
      break;
    case 'update_room_settings':
      updateRoomSettings(socket, message);
      break;
    case 'update_audio_settings':
      updateAudioSettings(socket, message);
      break;
    case 'start_room':
      startRoom(socket);
      break;
    case 'update_kills':
      updateKills(socket, message);
      break;
    case 'player_state':
      relayPlayerState(socket, message);
      break;
    case 'ping':
      send(socket, { type: 'pong', at: Date.now() });
      break;
    default:
      send(socket, { type: 'room_error', message: `Unknown message type: ${message.type}` });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(new Error('Request too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': CLIENT_ORIGIN,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  });
  response.end(JSON.stringify(payload));
}

async function createVoiceToken(payload) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return {
      status: 501,
      payload: {
        error: 'Voice is not configured yet. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
      },
    };
  }

  const roomCode = String(payload.roomCode || '').trim().toUpperCase();
  const playerId = String(payload.playerId || '').trim();
  const room = rooms.get(roomCode);
  if (!room || !room.players.has(playerId)) {
    return { status: 404, payload: { error: 'Room player not found.' } };
  }

  const player = room.players.get(playerId);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: playerId,
    name: player.name,
    ttl: '2h',
  });
  token.addGrant({
    room: roomCode,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return {
    status: 200,
    payload: {
      url: livekitUrl,
      token: await token.toJwt(),
      roomCode,
      playerId,
    },
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, {
      ok: true,
      rooms: rooms.size,
      db: Boolean(process.env.DATABASE_URL),
      voice: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/voice/token') {
    try {
      const body = await readBody(request);
      const result = await createVoiceToken(body);
      writeJson(response, result.status, result.payload);
    } catch (error) {
      writeJson(response, 400, { error: error.message });
    }
    return;
  }

  writeJson(response, 404, { error: 'Not found.' });
});

const wss = new WebSocketServer({ server, path: '/rooms' });

wss.on('connection', (socket) => {
  send(socket, { type: 'connected', at: Date.now() });
  socket.on('message', (raw) => handleSocketMessage(socket, raw));
  socket.on('close', () => leaveRoom(socket, 'socket_close'));
  socket.on('error', () => leaveRoom(socket, 'socket_error'));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (!room.players.size || now - room.createdAt > ROOM_TTL_MS) {
      for (const peer of room.sockets.values()) {
        socketSessions.delete(peer);
        send(peer, { type: 'room_deleted' });
      }
      rooms.delete(code);
      logRoomEvent(code, 'room_expired');
    }
  }
}, 60_000).unref();

server.listen(PORT, () => {
  initDb().catch((error) => console.warn('[db] init skipped:', error.message));
  console.log(`Pixelplanes realtime server listening on ${PORT}`);
});
