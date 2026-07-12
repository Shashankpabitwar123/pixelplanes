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
const HIT_DEDUPE_TTL_MS = 20_000;
const WORLD_WIDTH = 700;
const WORLD_HEIGHT = 400;

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

function finiteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function sanitizePlaneState(state = {}) {
  return {
    x: finiteNumber(state.x, 350, 0, WORLD_WIDTH),
    y: finiteNumber(state.y, 0, 0, WORLD_HEIGHT),
    vx: finiteNumber(state.vx, 0, -120, 120),
    vy: finiteNumber(state.vy, 0, -120, 120),
    angle: finiteNumber(state.angle, 16, -720, 720),
    thrust: finiteNumber(state.thrust, 0, 0, 1),
    throttle: finiteNumber(state.throttle, 0, 0, 1),
    crashed: Boolean(state.crashed),
    damage: finiteNumber(state.damage, 0, 0, 2),
    fuel: finiteNumber(state.fuel, 20, 0, 20),
  };
}

function sanitizeProjectile(projectile = {}, ownerId, weapon) {
  const isRocket = weapon === 'rocket';
  return {
    id: String(projectile.id || crypto.randomUUID()).slice(0, 96),
    ownerId,
    weapon,
    x: finiteNumber(projectile.x, 0, 0, WORLD_WIDTH),
    y: finiteNumber(projectile.y, 0, 0, WORLD_HEIGHT),
    previousX: finiteNumber(projectile.previousX ?? projectile.x, projectile.x, 0, WORLD_WIDTH),
    previousY: finiteNumber(projectile.previousY ?? projectile.y, projectile.y, 0, WORLD_HEIGHT),
    renderX: finiteNumber(projectile.renderX ?? projectile.x, 0, 0, WORLD_WIDTH),
    renderY: finiteNumber(projectile.renderY ?? projectile.y, 0, 0, WORLD_HEIGHT),
    dx: finiteNumber(projectile.dx, 0, -240, 240),
    dy: finiteNumber(projectile.dy, 0, -240, 240),
    vx: finiteNumber(projectile.vx, 0, -140, 140),
    vy: finiteNumber(projectile.vy, 0, -140, 140),
    angle: finiteNumber(projectile.angle, 0, -720, 720),
    radius: finiteNumber(projectile.radius, isRocket ? 2.25 : 1.05, 0.2, 4),
    groundHit: Boolean(projectile.groundHit),
    life: finiteNumber(projectile.life, isRocket ? 12000 : 1200, 80, isRocket ? 12000 : 2200),
    unit: projectile.unit === 'world' ? 'world' : 'world',
    createdAt: Date.now(),
  };
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
    damage: player.damage || 0,
    alive: player.alive !== false,
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
    hitProjectiles: new Map(),
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
    damage: 0,
    alive: true,
    state: null,
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
    damage: 0,
    alive: true,
    state: null,
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
  for (const player of room.players.values()) {
    player.kills = 0;
    player.damage = 0;
    player.alive = true;
    player.state = null;
  }
  room.hitProjectiles.clear();
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
  const player = room.players.get(playerId);
  if (!player) return;
  const state = sanitizePlaneState(payload.state);
  player.state = state;
  player.damage = state.damage;
  player.alive = !state.crashed && state.damage < 2;
  const message = {
    type: 'remote_player_state',
    playerId,
    state,
    at: Date.now(),
  };
  for (const [peerId, peer] of room.sockets.entries()) {
    if (peerId !== playerId) send(peer, message);
  }
}

function relayProjectile(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  const weapon = payload.weapon === 'rocket' ? 'rocket' : 'bullet';
  const projectile = sanitizeProjectile(payload.projectile, playerId, weapon);
  const message = {
    type: 'room_projectile',
    playerId,
    projectile,
    at: Date.now(),
  };
  for (const [peerId, peer] of room.sockets.entries()) {
    if (peerId !== playerId) send(peer, message);
  }
}

function pruneHitDedupe(room) {
  const now = Date.now();
  for (const [projectileId, timestamp] of room.hitProjectiles.entries()) {
    if (now - timestamp > HIT_DEDUPE_TTL_MS) {
      room.hitProjectiles.delete(projectileId);
    }
  }
}

function registerPlayerHit(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId: attackerId } = current;
  const targetId = String(payload.targetId || '');
  const target = room.players.get(targetId);
  const attacker = room.players.get(attackerId);
  if (!target || !attacker || targetId === attackerId) return;

  pruneHitDedupe(room);
  const projectileId = String(payload.projectileId || crypto.randomUUID()).slice(0, 96);
  if (room.hitProjectiles.has(projectileId)) return;
  room.hitProjectiles.set(projectileId, Date.now());

  const weapon = payload.weapon === 'rocket' || payload.weapon === 'collision' ? payload.weapon : 'bullet';
  const previousDamage = Math.max(0, Math.min(2, Number(target.damage) || 0));
  const killed = weapon === 'rocket' || weapon === 'collision' || previousDamage >= 1;
  target.damage = killed ? 2 : 1;
  target.alive = !killed;
  if (target.state) {
    target.state = { ...target.state, damage: target.damage, crashed: killed };
  }
  if (killed) {
    attacker.kills = Math.max(-99, Math.min(999, (Number(attacker.kills) || 0) + 1));
  }

  const hitMessage = {
    type: 'player_hit',
    targetId,
    attackerId,
    projectileId,
    weapon,
    damage: target.damage,
    killed,
    at: Date.now(),
  };
  for (const peer of room.sockets.values()) {
    send(peer, hitMessage);
  }
  logRoomEvent(room.code, killed ? 'player_killed' : 'player_damaged', {
    targetId,
    attackerId,
    weapon,
  });
  broadcastRoomState(room);
}

function registerPlayerCrash(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  const player = room.players.get(playerId);
  if (!player) return;

  player.damage = 2;
  player.alive = false;
  if (player.state) {
    player.state = { ...player.state, crashed: true, damage: 2 };
  }
  if (payload.selfCrash !== false) {
    player.kills = Math.max(-99, Math.min(999, (Number(player.kills) || 0) - 1));
  }
  for (const peer of room.sockets.values()) {
    send(peer, {
      type: 'player_crashed',
      playerId,
      selfCrash: payload.selfCrash !== false,
      at: Date.now(),
    });
  }
  broadcastRoomState(room);
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
    case 'fire_projectile':
      relayProjectile(socket, message);
      break;
    case 'player_hit':
      registerPlayerHit(socket, message);
      break;
    case 'player_crashed':
      registerPlayerCrash(socket, message);
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

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '/', 'http://localhost');
  if (pathname !== '/rooms') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (webSocket) => {
    wss.emit('connection', webSocket, request);
  });
});

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
