import crypto from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { createLiveKitVoiceToken, readLiveKitConfig } from './livekit-auth.js';
import { createRoomOwnerRecord, readRegionalRoomsConfig, RoomDirectory } from './room-directory.js';
import {
  ROOM_SERVER_SNAPSHOT_MS,
  ROOM_SERVER_TICK_MS,
  acceptRoomInput,
  createRoomSnapshot,
  createRuntimePlayer,
  resetAuthoritativeRoom,
  stepAuthoritativeRoom,
} from './room-runtime.js';

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173';
const ROOM_MAX_PLAYERS = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLANE_COLORS = ['blue', 'red', 'yellow', 'purple', 'green', 'cyan'];
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_RECONNECT_GRACE_MS = 30_000;
const ROOM_WEATHER_STATE_INTERVAL_MS = 500;
const ROOM_DIRECTORY_HEARTBEAT_MS = 30_000;
const SOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_VOLATILE_SOCKET_BUFFER_BYTES = 256 * 1024;
const MAX_SOCKET_MESSAGE_BYTES = 16 * 1024;
const MAX_SOCKET_MESSAGES_PER_SECOND = 90;
const MAX_SOCKET_RATE_VIOLATIONS = 4;
const ROOM_SPAWN_OFFSETS = [-84, -50, -17, 17, 50, 84];
const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
const VOLATILE_MESSAGE_TYPES = new Set(['weather_state', 'room_snapshot']);

const rooms = new Map();
const socketSessions = new WeakMap();
const regionalRoomsConfig = readRegionalRoomsConfig();
const roomDirectory = new RoomDirectory(regionalRoomsConfig);
let dbPool = null;
let dbReady = false;

function regionalRoutingIsUnavailable() {
  return roomDirectory.required && !roomDirectory.active;
}

function getLocalRoomOwner(code, createdAt) {
  return createRoomOwnerRecord({ code, config: regionalRoomsConfig, createdAt });
}

function ownerIsLocal(owner) {
  return Boolean(
    owner &&
    owner.regionId === regionalRoomsConfig.regionId &&
    owner.wsUrl === regionalRoomsConfig.publicWsUrl,
  );
}

function logDirectoryFailure(operation, error) {
  console.warn(`[directory] ${operation} skipped:`, error.message);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function parseUrlList(raw, fallback = []) {
  const urls = String(raw || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  return urls.length ? urls : fallback;
}

function normalizeIceServer(server) {
  if (!server || typeof server !== 'object') return null;
  const urls = Array.isArray(server.urls)
    ? server.urls.map((url) => String(url || '').trim()).filter(Boolean)
    : String(server.urls || '').trim();
  if (!urls || (Array.isArray(urls) && !urls.length)) return null;

  const normalized = { urls };
  if (server.username) normalized.username = String(server.username);
  if (server.credential) normalized.credential = String(server.credential);
  return normalized;
}

function readJsonIceServers() {
  const raw = process.env.RTC_ICE_SERVERS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const servers = parsed.map(normalizeIceServer).filter(Boolean);
    return servers.length ? servers : null;
  } catch {
    return null;
  }
}

function createTurnServer() {
  const turnUrls = parseUrlList(process.env.TURN_URLS);
  if (!turnUrls.length) return null;

  const sharedSecret = process.env.TURN_SHARED_SECRET;
  if (sharedSecret) {
    const ttlSeconds = Number.parseInt(process.env.TURN_TTL_SECONDS || '86400', 10);
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(300, Math.min(604800, ttlSeconds || 86400));
    const username = `${expiresAt}:pixelplanes`;
    const credential = crypto
      .createHmac('sha1', sharedSecret)
      .update(username)
      .digest('base64');
    return { urls: turnUrls, username, credential };
  }

  if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    return {
      urls: turnUrls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    };
  }

  return { urls: turnUrls };
}

function getRtcIceServers() {
  const jsonServers = readJsonIceServers();
  if (jsonServers) return jsonServers;

  const stunUrls = parseUrlList(process.env.STUN_URLS, DEFAULT_STUN_URLS);
  const servers = [{ urls: stunUrls }];
  const turnServer = createTurnServer();
  if (turnServer) servers.push(turnServer);
  return servers;
}

function hasTurnServer(iceServers = getRtcIceServers()) {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => String(url || '').startsWith('turn:') || String(url || '').startsWith('turns:'));
  });
}

function getCorsOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return CLIENT_ORIGIN;
  const allowedOrigins = new Set([CLIENT_ORIGIN, ...parseUrlList(process.env.CLIENT_ORIGINS)]);
  if (allowedOrigins.has(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return CLIENT_ORIGIN;
}

function isAllowedSocketOrigin(request) {
  const origin = String(request.headers.origin || '');
  if (!origin) return process.env.NODE_ENV !== 'production';
  const allowedOrigins = new Set([CLIENT_ORIGIN, ...parseUrlList(process.env.CLIENT_ORIGINS)]);
  return allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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

function createRoomWeather(startedAt = Date.now()) {
  return {
    seed: crypto.randomBytes(8).toString('hex'),
    startedAt,
  };
}

function ensureRoomWeather(room) {
  if (!room.weather) room.weather = createRoomWeather(room.createdAt);
  return room.weather;
}

function seededWeatherUnit(seed, label, index) {
  const input = `${seed}:${label}:${index}`;
  let hash = 2166136261;
  for (let position = 0; position < input.length; position += 1) {
    hash ^= input.charCodeAt(position);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function syncedWeatherCycleActive(elapsed, seed, label, initialBase, initialRange, durationBase, durationRange, gapBase, gapRange) {
  let cursor = initialBase + seededWeatherUnit(seed, label, 0) * initialRange;
  for (let cycle = 0; cycle < 512; cycle += 1) {
    const duration = durationBase + seededWeatherUnit(seed, label, cycle * 2 + 1) * durationRange;
    if (elapsed >= cursor && elapsed < cursor + duration) return true;
    cursor += duration + gapBase + seededWeatherUnit(seed, label, cycle * 2 + 2) * gapRange;
    if (cursor > elapsed) return false;
  }
  return false;
}

function getSyncedRoomWeather(weather, now = Date.now()) {
  const startedAt = Number(weather?.startedAt);
  const seed = String(weather?.seed || '');
  if (!Number.isFinite(startedAt) || !seed) return { fog: false, rain: false };
  const elapsed = Math.max(0, now - startedAt);
  return {
    fog: syncedWeatherCycleActive(elapsed, seed, 'fog', 4500, 6500, 13000, 9000, 22000, 28000),
    rain: syncedWeatherCycleActive(elapsed, seed, 'rain', 15000, 17000, 14000, 11000, 36000, 52000),
  };
}

function serializeWeather(room, now = Date.now()) {
  const weather = ensureRoomWeather(room);
  return {
    ...weather,
    state: getSyncedRoomWeather(weather, now),
  };
}

function pickPlaneColor(room) {
  const used = new Set(Array.from(room.players.values()).map((player) => player.color));
  const available = PLANE_COLORS.filter((color) => !used.has(color));
  const pool = available.length ? available : PLANE_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (
    VOLATILE_MESSAGE_TYPES.has(message?.type) &&
    socket.bufferedAmount > MAX_VOLATILE_SOCKET_BUFFER_BYTES
  ) {
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

function roomForSocket(socket) {
  const session = socketSessions.get(socket);
  if (!session) return null;
  const room = rooms.get(session.roomCode);
  if (!room) return null;
  return { room, playerId: session.playerId };
}

function serializeRoom(room) {
  const now = Date.now();
  const players = Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    role: player.id === room.hostId ? 'Host' : 'Player',
    kills: player.kills,
    damage: player.state?.damage || 0,
    alive: !player.state?.crashed,
    micEnabled: player.micEnabled,
    speakerEnabled: player.speakerEnabled,
    connected: Boolean(player.connected && room.sockets.has(player.id)),
  }));

  return {
    code: room.code,
    theme: room.theme,
    hostId: room.hostId,
    maxPlayers: ROOM_MAX_PLAYERS,
    started: room.started,
    createdAt: room.createdAt,
    serverNow: now,
    weather: serializeWeather(room, now),
    regionId: regionalRoomsConfig.enabled ? regionalRoomsConfig.regionId : undefined,
    players,
  };
}

function broadcastRoomWeatherState(room, now = Date.now()) {
  if (!room.sockets.size) return;
  const weather = ensureRoomWeather(room);
  const state = getSyncedRoomWeather(weather, now);
  for (const peer of room.sockets.values()) {
    send(peer, {
      type: 'weather_state',
      serverNow: now,
      weather,
      fog: state.fog,
      rain: state.rain,
    });
  }
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

function broadcastRoomSnapshots(room, now = Date.now()) {
  if (!room.started || !room.sockets.size) return;
  for (const [playerId, socket] of room.sockets.entries()) {
    const snapshot = createRoomSnapshot(room, playerId, now);
    if (snapshot) send(socket, snapshot);
  }
}

function processAuthoritativeRoomEvents(room, events, now) {
  let roomStateChanged = false;
  for (const event of events) {
    if (event.type === 'player_hit') {
      for (const socket of room.sockets.values()) {
        send(socket, { ...event, at: now });
      }
      logRoomEvent(room.code, event.killed ? 'player_killed' : 'player_damaged', event);
      roomStateChanged = true;
      continue;
    }
    if (event.type === 'player_crashed') {
      for (const socket of room.sockets.values()) {
        send(socket, { ...event, at: now });
      }
      logRoomEvent(room.code, 'player_crashed', event);
      roomStateChanged = true;
      continue;
    }
    if (event.type === 'fuel_refilled') {
      const playerSocket = room.sockets.get(event.playerId);
      if (playerSocket) send(playerSocket, { ...event, at: now });
    }
  }
  if (roomStateChanged) broadcastRoomState(room);
}

function createRoomPlayer(room, payload, fallbackName) {
  const playerId = crypto.randomUUID();
  const runtime = createRuntimePlayer({
    id: playerId,
    spawnX: 350 + (ROOM_SPAWN_OFFSETS[room.players.size] ?? 0),
    resumeToken: crypto.randomUUID(),
  });
  return {
    ...runtime,
    id: playerId,
    name: normalizeName(payload.name, fallbackName),
    color: pickPlaneColor(room),
    kills: 0,
    micEnabled: payload.micEnabled !== false,
    speakerEnabled: payload.speakerEnabled !== false,
  };
}

function announceSession(socket, room, player) {
  send(socket, {
    type: 'room_session',
    roomCode: room.code,
    playerId: player.id,
    resumeToken: player.resumeToken,
    expiresInMs: ROOM_RECONNECT_GRACE_MS,
    serverUrl: regionalRoomsConfig.enabled ? regionalRoomsConfig.publicWsUrl : undefined,
  });
}

async function releaseDirectoryRoom(room) {
  if (!roomDirectory.active) return;
  try {
    await roomDirectory.remove(room.code, getLocalRoomOwner(room.code, room.createdAt));
  } catch (error) {
    logDirectoryFailure('remove room', error);
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
    void releaseDirectoryRoom(room);
    logRoomEvent(room.code, 'room_empty', { reason });
    return;
  }

  if (room.hostId === session.playerId) {
    const remaining = Array.from(room.players.values())
      .filter((player) => player.connected)
      .map((player) => player.id);
    const fallback = Array.from(room.players.keys());
    const pool = remaining.length ? remaining : fallback;
    room.hostId = pool[Math.floor(Math.random() * pool.length)] || '';
  }

  for (const peerSocket of room.sockets.values()) {
    send(peerSocket, {
      type: 'player_left',
      playerId: session.playerId,
      playerName: leavingPlayer?.name || 'A player',
      reason,
    });
  }

  logRoomEvent(room.code, 'player_left', {
    reason,
    playerId: session.playerId,
    name: leavingPlayer?.name,
    hostId: room.hostId,
  });
  broadcastRoomState(room);
}

function disconnectRoom(socket, reason = 'socket_close') {
  const session = socketSessions.get(socket);
  if (!session) return;

  const room = rooms.get(session.roomCode);
  socketSessions.delete(socket);
  if (!room) return;

  const player = room.players.get(session.playerId);
  room.sockets.delete(session.playerId);
  if (!player) return;
  player.connected = false;
  player.disconnectedAt = Date.now();
  player.input = { power: false, down: false, left: false, right: false, fire: false, light: Boolean(player.state?.searchLightOn), rocketPress: player.lastRocketPress };
  if (room.hostId === player.id) {
    room.hostId = Array.from(room.players.values()).find((candidate) => candidate.id !== player.id && candidate.connected)?.id
      || room.hostId;
  }
  room.lastActivityAt = Date.now();
  logRoomEvent(room.code, 'player_disconnected', { playerId: player.id, reason });
  for (const peerSocket of room.sockets.values()) {
    send(peerSocket, { type: 'player_disconnected', playerId: player.id, reason });
  }
  broadcastRoomState(room);
}

async function resumeRoom(socket, payload) {
  const code = String(payload.code || '').trim().toUpperCase();
  const resumeToken = String(payload.resumeToken || '');
  if (regionalRoutingIsUnavailable()) {
    send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
    return;
  }
  if (roomDirectory.active) {
    try {
      const owner = await roomDirectory.find(code);
      if (owner && !ownerIsLocal(owner)) {
        send(socket, { type: 'room_redirect', wsUrl: owner.wsUrl, code, action: 'resume' });
        return;
      }
    } catch (error) {
      logDirectoryFailure('resolve room for resume', error);
      send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
      return;
    }
  }
  const room = rooms.get(code);
  const player = room && Array.from(room.players.values()).find((candidate) => candidate.resumeToken === resumeToken);
  if (!room || !player || player.connected || Date.now() - (player.disconnectedAt || 0) > ROOM_RECONNECT_GRACE_MS) {
    send(socket, { type: 'room_error', message: 'That room session expired. Rejoin from the lobby.' });
    return;
  }
  leaveRoom(socket, 'resume_other_room');
  player.connected = true;
  player.disconnectedAt = 0;
  room.sockets.set(player.id, socket);
  room.lastActivityAt = Date.now();
  socketSessions.set(socket, { roomCode: room.code, playerId: player.id });
  announceSession(socket, room, player);
  send(socket, { type: 'room_resumed', room: serializeRoom(room), localPlayerId: player.id });
  logRoomEvent(room.code, 'player_reconnected', { playerId: player.id });
  broadcastRoomState(room);
}

async function createRoom(socket, payload) {
  leaveRoom(socket, 'new_room');

  if (regionalRoutingIsUnavailable()) {
    send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
    return;
  }

  let code = '';
  let directoryClaimed = false;
  if (roomDirectory.active) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateRoomCode();
      try {
        if (await roomDirectory.claim(candidate, getLocalRoomOwner(candidate))) {
          code = candidate;
          directoryClaimed = true;
          break;
        }
      } catch (error) {
        logDirectoryFailure('claim room', error);
        send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
        return;
      }
    }
    if (!directoryClaimed) {
      send(socket, { type: 'room_error', message: 'Could not reserve a room code. Please try again.' });
      return;
    }
  } else {
    code = generateRoomCode();
  }
  const room = {
    code,
    hostId: '',
    theme: normalizeTheme(payload.theme),
    players: new Map(),
    sockets: new Map(),
    projectiles: new Map(),
    started: false,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    lastSnapshotAt: 0,
  };
  room.weather = createRoomWeather(room.createdAt);

  const player = createRoomPlayer(room, payload, 'Player 1');
  room.hostId = player.id;
  room.players.set(player.id, player);
  room.sockets.set(player.id, socket);
  rooms.set(code, room);
  socketSessions.set(socket, { roomCode: code, playerId: player.id });

  announceSession(socket, room, player);
  logRoomEvent(code, 'room_created', { hostId: player.id, theme: room.theme });
  broadcastRoomState(room);
}

async function joinRoom(socket, payload) {
  leaveRoom(socket, 'join_other_room');

  const code = String(payload.code || '').trim().toUpperCase();
  if (regionalRoutingIsUnavailable()) {
    send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
    return;
  }
  if (roomDirectory.active) {
    try {
      const owner = await roomDirectory.find(code);
      if (!owner) {
        send(socket, { type: 'room_error', message: 'Room not found.' });
        return;
      }
      if (!ownerIsLocal(owner)) {
        send(socket, { type: 'room_redirect', wsUrl: owner.wsUrl, code, action: 'join' });
        return;
      }
    } catch (error) {
      logDirectoryFailure('resolve room for join', error);
      send(socket, { type: 'room_error', message: 'Regional room routing is temporarily unavailable. Please try again shortly.' });
      return;
    }
  }
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

  const player = createRoomPlayer(room, payload, `Player ${room.players.size + 1}`);
  room.players.set(player.id, player);
  room.sockets.set(player.id, socket);
  room.lastActivityAt = Date.now();
  socketSessions.set(socket, { roomCode: code, playerId: player.id });

  announceSession(socket, room, player);
  logRoomEvent(code, 'player_joined', { playerId: player.id });
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
  void releaseDirectoryRoom(room);
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

async function issueLiveKitVoiceToken(socket) {
  const current = roomForSocket(socket);
  const liveKitConfig = readLiveKitConfig();
  if (!current || !liveKitConfig) {
    send(socket, { type: 'voice_unavailable', provider: 'livekit' });
    return;
  }
  const player = current.room.players.get(current.playerId);
  if (!player || !player.connected || current.room.sockets.get(current.playerId) !== socket) {
    send(socket, { type: 'voice_unavailable', provider: 'livekit' });
    return;
  }

  try {
    const issued = await createLiveKitVoiceToken({
      config: liveKitConfig,
      roomCode: current.room.code,
      playerId: current.playerId,
      playerName: player.name,
    });
    send(socket, { type: 'livekit_token', provider: 'livekit', ...issued });
  } catch (error) {
    console.warn('[livekit] token issuance failed:', error.message);
    send(socket, { type: 'voice_unavailable', provider: 'livekit' });
  }
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
  room.weather = createRoomWeather(Date.now());
  resetAuthoritativeRoom(room);
  for (const player of room.players.values()) {
    player.kills = 0;
  }
  room.lastActivityAt = Date.now();
  logRoomEvent(room.code, 'room_started', {
    playerCount: room.players.size,
    theme: room.theme,
  });
  for (const peer of room.sockets.values()) {
    send(peer, { type: 'room_started', room: serializeRoom(room) });
  }
}

function receiveRoomInput(socket, payload) {
  const current = roomForSocket(socket);
  if (!current || !current.room.started) return;
  const player = current.room.players.get(current.playerId);
  if (!player || !player.connected) return;
  if (!acceptRoomInput(player, payload)) return;
  current.room.lastActivityAt = Date.now();
}

function relayVoiceSignal(socket, payload) {
  const current = roomForSocket(socket);
  if (!current) return;
  const { room, playerId } = current;
  const targetId = String(payload.targetId || '');
  if (!targetId || targetId === playerId || !room.players.has(targetId)) return;

  const targetSocket = room.sockets.get(targetId);
  if (!targetSocket) return;
  send(targetSocket, {
    type: 'voice_signal',
    fromPlayerId: playerId,
    signal: payload.signal || {},
    at: Date.now(),
  });
}

function acceptSocketMessage(socket, raw) {
  const size = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw));
  if (size > MAX_SOCKET_MESSAGE_BYTES) return false;
  const now = Date.now();
  const rate = socket.messageRate || { startedAt: now, count: 0, violations: 0 };
  if (now - rate.startedAt >= 1000) {
    rate.startedAt = now;
    rate.count = 0;
  }
  rate.count += 1;
  if (rate.count > MAX_SOCKET_MESSAGES_PER_SECOND) {
    rate.violations += 1;
    socket.messageRate = rate;
    if (rate.violations >= MAX_SOCKET_RATE_VIOLATIONS) socket.close(1008, 'Too many messages');
    return false;
  }
  socket.messageRate = rate;
  return true;
}

async function handleSocketMessage(socket, raw) {
  if (!acceptSocketMessage(socket, raw)) {
    send(socket, { type: 'room_error', message: 'Message rate or size limit reached.' });
    return;
  }
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    send(socket, { type: 'room_error', message: 'Invalid message.' });
    return;
  }

  switch (message.type) {
    case 'create_room':
      await createRoom(socket, message);
      break;
    case 'join_room':
      await joinRoom(socket, message);
      break;
    case 'resume_room':
      await resumeRoom(socket, message);
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
    case 'request_livekit_token':
      issueLiveKitVoiceToken(socket);
      break;
    case 'start_room':
      startRoom(socket);
      break;
    case 'room_input':
      receiveRoomInput(socket, message);
      break;
    case 'voice_signal':
      relayVoiceSignal(socket, message);
      break;
    case 'ping':
      send(socket, { type: 'pong', at: Date.now() });
      break;
    default:
      send(socket, { type: 'room_error', message: `Unknown message type: ${message.type}` });
  }
}

function writeJson(request, response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': getCorsOrigin(request),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeJson(request, response, 204, {});
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    const iceServers = getRtcIceServers();
    writeJson(request, response, 200, {
      ok: true,
      rooms: rooms.size,
      db: Boolean(process.env.DATABASE_URL),
      voice: readLiveKitConfig() ? 'livekit' : 'webrtc-fallback',
      livekit: Boolean(readLiveKitConfig()),
      turn: hasTurnServer(iceServers),
      region: {
        id: regionalRoomsConfig.regionId || 'single-region',
        routing: roomDirectory.required ? (roomDirectory.active ? 'ready' : 'unavailable') : 'disabled',
      },
    });
    return;
  }

  if (request.method === 'GET' && request.url === '/voice/ice-servers') {
    const iceServers = getRtcIceServers();
    writeJson(request, response, 200, {
      iceServers,
      turn: hasTurnServer(iceServers),
      ttlSeconds: Number.parseInt(process.env.TURN_TTL_SECONDS || '86400', 10),
    });
    return;
  }

  writeJson(request, response, 404, { error: 'Not found.' });
});

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  maxPayload: MAX_SOCKET_MESSAGE_BYTES,
});

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '/', 'http://localhost');
  if (pathname !== '/rooms') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!isAllowedSocketOrigin(request)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (webSocket) => {
    wss.emit('connection', webSocket, request);
  });
});

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.messageRate = { startedAt: Date.now(), count: 0, violations: 0 };
  socket._socket?.setNoDelay?.(true);
  socket.on('pong', () => {
    socket.isAlive = true;
  });
  send(socket, { type: 'connected', at: Date.now() });
  socket.messageChain = Promise.resolve();
  socket.on('message', (raw) => {
    socket.messageChain = socket.messageChain
      .then(() => handleSocketMessage(socket, raw))
      .catch((error) => {
        console.warn('[rooms] message handling failed:', error.message);
        send(socket, { type: 'room_error', message: 'The room server could not process that request.' });
      });
  });
  socket.on('close', () => disconnectRoom(socket, 'socket_close'));
  socket.on('error', () => disconnectRoom(socket, 'socket_error'));
});

setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      leaveRoom(socket, 'heartbeat_timeout');
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, SOCKET_HEARTBEAT_INTERVAL_MS).unref();

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    for (const [playerId, player] of room.players.entries()) {
      if (player.connected || now - (player.disconnectedAt || now) < ROOM_RECONNECT_GRACE_MS) continue;
      room.players.delete(playerId);
      if (room.hostId === playerId) {
        room.hostId = Array.from(room.players.values()).find((candidate) => candidate.connected)?.id
          || Array.from(room.players.keys())[0]
          || '';
      }
      for (const peer of room.sockets.values()) {
        send(peer, { type: 'player_left', playerId, playerName: player.name, reason: 'reconnect_expired' });
      }
      logRoomEvent(room.code, 'player_left', { playerId, reason: 'reconnect_expired' });
    }
    if (!room.players.size || (!room.started && now - (room.lastActivityAt || room.createdAt) > ROOM_TTL_MS)) {
      for (const peer of room.sockets.values()) {
        socketSessions.delete(peer);
        send(peer, { type: 'room_deleted' });
      }
      rooms.delete(code);
      void releaseDirectoryRoom(room);
      logRoomEvent(code, 'room_expired');
    } else {
      broadcastRoomState(room);
    }
  }
}, 60_000).unref();

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.started) continue;
    const events = stepAuthoritativeRoom(room, now);
    processAuthoritativeRoomEvents(room, events, now);
    if (now - room.lastSnapshotAt >= ROOM_SERVER_SNAPSHOT_MS) {
      room.lastSnapshotAt = now;
      broadcastRoomSnapshots(room, now);
    }
  }
}, ROOM_SERVER_TICK_MS).unref();

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    broadcastRoomWeatherState(room, now);
  }
}, ROOM_WEATHER_STATE_INTERVAL_MS).unref();

setInterval(() => {
  if (!roomDirectory.active) return;
  for (const room of rooms.values()) {
    roomDirectory
      .refresh(room.code, getLocalRoomOwner(room.code, room.createdAt))
      .catch((error) => logDirectoryFailure('refresh room lease', error));
  }
}, ROOM_DIRECTORY_HEARTBEAT_MS).unref();

server.listen(PORT, () => {
  initDb().catch((error) => console.warn('[db] init skipped:', error.message));
  if (regionalRoomsConfig.configurationError) {
    console.warn(`[directory] ${regionalRoomsConfig.configurationError}`);
  } else if (regionalRoomsConfig.enabled) {
    roomDirectory.connect().then((ready) => {
      if (ready) console.log(`[directory] regional room routing ready for ${regionalRoomsConfig.regionId}`);
    });
  }
  console.log(`Pixelplanes realtime server listening on ${PORT}`);
});
