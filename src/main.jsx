import { createSceneryCamera } from './game/scenery-window.js';
import { ForestLayer, Pine } from './game/scenery.jsx';
import { resumeGameAudio, setGameAudioPaused } from './game/audio-pause.js';
import { useRocketHint } from './game/use-rocket-hint.js';
import { planBotAltitude } from './game/bot-altitude.js';
import { useTraining } from './game/use-training.js';
import { TrainingHud } from './game/training-hud.jsx';
import { moveTrainingTargets } from './game/training.js';
import { flashPlaneHit } from './game/hit-feedback.js';
import { createRocketTrigger } from './game/rocket-trigger.js';
import { selectRocketTarget } from './game/rocket-guidance.js';
import { hasPredictedBulletHit } from './game/bullet-lead.js';
import { getPlayerFlightTuning, BOT_FLIGHT_TUNING } from './game/flight-tuning.js';
import { createWeatherCycle } from './game/weather.js';
import { FlightDeck } from './game/flight-deck.jsx';
import { createGroundWarningTracker, createPullUpAudio } from './game/ground-warning.js';
import { AIRBORNE_THRUST_SCALE, applyFlightForces, flightTurnAuthority, interpolateFlightState } from './game/flight.js';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { createMusicPlayer, DEFAULT_MUSIC_VOLUME, DEFAULT_MUSIC_TRACK_ID } from './game/music.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  START_X,
  FUEL_SECONDS,
  FUEL_GAUGE_EMPTY_ANGLE,
  FUEL_GAUGE_SWEEP,
  FUEL_GAUGE_ZONE_SIZE,
  ACTIVE_GAMEPLAY_PACING,
  MAX_SOLO_BOTS,
  createSoloGameRules,
  MAX_BULLETS,
  BULLET_RELOAD_MS,
  BULLET_COOLDOWN_MS,
  BULLET_LIFETIME_MS,
  BULLET_HIT_RADIUS,
  AIM_GUIDE_DOT_COUNT,
  MAX_ROCKETS,
  ROCKET_COOLDOWN_MS,
  ROCKET_DETECTION_RANGE,
  ROCKET_HOMING_MS,
  ROCKET_IMPACT_MS,
  ROCKET_LIFETIME_MS,
  BOT_SKILL_LABELS,
  getBotFlightTuning,
  selectBotCombatTarget,
  findBotCollisionThreat,
  getBotGroundThreat,
  getBotPursuitPoint,
  getBotAimPoint,
  getBotCombatOffset,
  MUSIC_TRACKS,
  HIGH_SCORE_STORAGE_KEY,
  ROOM_MAX_PLAYERS,
  ROOM_SPAWN_OFFSETS,
  MULTIPLAYER_WS_URL,
  MULTIPLAYER_REGION_WS_URLS,
  MULTIPLAYER_API_URL,
  RTC_ICE_SERVERS,
  ROOM_WEATHER_TICK_MS,
  readStoredHighScore,
  PLANE_COLOR_ASSETS,
  PLANE_COLOR_OPTIONS,
  createLocalRoomLobby,
  RoomMicIcon,
  RoomSpeakerIcon,
  PLANE_LIGHT_COMBOS,
  PLANE_LIGHT_OPTIONS,
  clouds,
  fogBanks,
  rainDrops,
  stars,
  cows,
  mapGrassPlants,
  cowOffsets,
  hutPlacements,
  hayPlacements,
  fuelTankPlacements,
  fuelStationZones,
  planeModel,
  createInitialPlaneState,
  getSyncedRoomWeather,
  getSyncedCowPottyPlan,
  createInitialBotState,
  createInitialBotStates,
  getPlanePoint,
  planesCollide,
  getProjectilePoint,
  getProjectileSegment,
  syncProjectileRenderPositions,
  setWorldTransformPosition,
  getBulletTrajectory,
  createBulletProjectile,
  getBulletGuidePoints,
  createRocketProjectile,
  updateGuidedRocket,
  updateGuidedRockets,
  getRocketSegment,
  segmentHitsPlane,
  bulletSegmentHitsPlane,
  updateDamageSmokeParticles,
  createRainAudio,
  playFlightDeckTick,
  playPlaneBulletHitSound,
  playPlaneBlastSound,
  getCameraX,
  getCameraY,
  clamp,
  normalizeAngle,
} from './game/core.jsx';

const ROOM_STATE_SEND_INTERVAL_MS = 40;
const REMOTE_INTERPOLATION_DELAY_MS = 130;
const REMOTE_MAX_INTERPOLATION_DELAY_MS = 300;
const REMOTE_MAX_PREDICTION_SECONDS = 0.22;
const REMOTE_SNAPSHOT_BUFFER_SIZE = 12;
const REMOTE_DISPLAY_SMOOTHING = 22;
const REMOTE_DISPLAY_SNAP_DISTANCE = 42;
const REMOTE_DISPLAY_MAX_DT_SECONDS = 0.06;
const ROOM_SESSION_STORAGE_KEY = 'pixelplanes-room-session-v1';
const ROOM_RECONNECT_BASE_DELAY_MS = 650;
const ROOM_RECONNECT_MAX_DELAY_MS = 8_000;
const FIELD_GUIDE_PAGE_COUNT = 6;
const GUIDE_WEATHER_REPLAY_STAGE_MS = 6000;
const GUIDE_WEATHER_REPLAY_STAGES = [
  { id: 'night', label: 'CLEAR NIGHT', rain: false, fog: false, dark: true },
  { id: 'rain', label: 'RAIN', rain: true, fog: false, dark: true },
  { id: 'fog', label: 'FOG', rain: false, fog: true, dark: true },
  { id: 'day', label: 'DAYLIGHT', rain: false, fog: false, dark: false },
];
const GUIDE_WEATHER_REPLAY_TREES = [
  { x: '-3%', width: 52, height: 98 }, { x: '8%', width: 43, height: 80 }, { x: '18%', width: 62, height: 118 },
  { x: '31%', width: 48, height: 90 }, { x: '43%', width: 68, height: 124 }, { x: '56%', width: 46, height: 86 },
  { x: '67%', width: 64, height: 116 }, { x: '80%', width: 49, height: 94 }, { x: '92%', width: 62, height: 121 }, { x: '104%', width: 45, height: 82 },
];

function getRoomConnectionMeta(status, pingMs) {
  if (status === 'connected') {
    if (!Number.isFinite(pingMs)) {
      return { tone: 'pending', label: 'Room online', detail: 'Measuring connection' };
    }
    if (pingMs <= 100) {
      return { tone: 'smooth', label: 'Smooth link', detail: `${pingMs} ms` };
    }
    if (pingMs <= 180) {
      return { tone: 'steady', label: 'Stable link', detail: `${pingMs} ms` };
    }
    return { tone: 'distance', label: 'Long-distance link', detail: `${pingMs} ms` };
  }

  if (status === 'reconnecting') {
    return { tone: 'recovering', label: 'Connection lost', detail: 'Reconnecting to your room…' };
  }
  if (status === 'restoring') {
    return { tone: 'recovering', label: 'Restoring room', detail: 'Your pilot seat is being restored…' };
  }
  if (status === 'connecting') {
    return { tone: 'pending', label: 'Connecting', detail: 'Finding the room server…' };
  }

  return { tone: 'offline', label: 'Room offline', detail: 'Return to the room lobby to join again.' };
}

function readRoomSession() {
  try {
    const raw = window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.roomCode || !parsed?.resumeToken || !parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeRoomWebSocketUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return '';
    if (url.username || url.password || !url.pathname.endsWith('/rooms')) return '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function multiplayerApiUrlFromRoomWebSocketUrl(wsUrl) {
  const normalized = normalizeRoomWebSocketUrl(wsUrl);
  if (!normalized) return '';
  const url = new URL(normalized);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = url.pathname.replace(/\/rooms\/?$/, '');
  return url.toString().replace(/\/$/, '');
}

async function measureRoomEndpoint(wsUrl) {
  const apiUrl = multiplayerApiUrlFromRoomWebSocketUrl(wsUrl);
  if (!apiUrl) throw new Error('Invalid multiplayer endpoint.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${apiUrl}/health`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Room server is unavailable.');
    return { wsUrl, latency: performance.now() - startedAt };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function selectCreateRoomEndpoint() {
  const fallback = normalizeRoomWebSocketUrl(MULTIPLAYER_WS_URL);
  const candidates = Array.from(new Set([
    fallback,
    ...MULTIPLAYER_REGION_WS_URLS.map(normalizeRoomWebSocketUrl),
  ].filter(Boolean)));
  if (candidates.length <= 1) return fallback;

  const measurements = await Promise.allSettled(candidates.map(measureRoomEndpoint));
  const reachable = measurements
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((first, second) => first.latency - second.latency);
  return reachable[0]?.wsUrl || fallback;
}
const GAME_FRAME_PRIORITY = {
  PLAYER: 0,
  TRAINING_TARGETS: 0.05,
  ROOM_MAP_DOTS: 0.1,
  ROOM_REMOTE_PLANES: 0.2,
  ROOM_PROJECTILES: 0.3,
  BOT_START: 1,
};
const GAME_FRAME_PRIORITIES = [
  GAME_FRAME_PRIORITY.PLAYER,
  GAME_FRAME_PRIORITY.TRAINING_TARGETS,
  GAME_FRAME_PRIORITY.ROOM_MAP_DOTS,
  GAME_FRAME_PRIORITY.ROOM_REMOTE_PLANES,
  GAME_FRAME_PRIORITY.ROOM_PROJECTILES,
  ...Array.from({ length: MAX_SOLO_BOTS }, (_, index) => GAME_FRAME_PRIORITY.BOT_START + index),
];
const COW_INSTANCES = cowOffsets.flatMap((offset) =>
  cows.slice(0, 2).map((cow, index) => ({
    id: `${offset}-${index}`,
    delay: cow.delay - offset * 0.7 - index * 8,
    duration: 240 + ((offset + index * 17) % 70),
    graze: cow.graze,
    grazeAt: 28 + ((offset * 3 + index * 47) % (WORLD_WIDTH - 70)),
  })),
);

const SOLO_GAME_CONTROL_DEFINITIONS = [
  { key: 'flightPace', label: 'Flight speed', min: 0, max: 100 },
  { key: 'turnPace', label: 'Turn response', min: 0, max: 100 },
  { key: 'fuelSeconds', label: 'Fuel capacity', min: 20, max: 60 },
];

function getRulePace(rules, key) {
  const value = Number(rules?.[key]);
  return Number.isFinite(value) ? clamp(value / 100, 0, 1) : 1;
}

function getRuleFuelSeconds(rules) {
  const value = Number(rules?.fuelSeconds);
  return Number.isFinite(value) ? value : FUEL_SECONDS;
}

function getRuleBulletCooldownMs(rules) {
  const value = Number(rules?.bulletCooldownMs);
  return Number.isFinite(value) ? value : BULLET_COOLDOWN_MS;
}

function getRuleBulletReloadMs(rules) {
  const seconds = Number(rules?.bulletReloadSeconds);
  return Number.isFinite(seconds) ? seconds * 1000 : BULLET_RELOAD_MS;
}



function useMeasuredFrameRate() {
  const [frameRate, setFrameRate] = useState(0);

  useEffect(() => {
    let frame = 0;
    let lastFrameAt = 0;
    let lastPublishedAt = 0;
    const samples = [];

    const measure = (now) => {
      if (lastFrameAt) {
        const delta = now - lastFrameAt;
        if (delta > 0 && delta < 250) {
          samples.push(delta);
          if (samples.length > 120) samples.shift();
        }
      }

      if (samples.length >= 24 && now - lastPublishedAt > 850) {
        const sorted = [...samples].sort((a, b) => a - b);
        const trim = Math.floor(sorted.length * 0.1);
        const end = Math.max(trim + 1, sorted.length - trim);
        const stableSamples = sorted.slice(trim, end);
        const average = stableSamples.reduce((sum, delta) => sum + delta, 0) / stableSamples.length;
        const nextFrameRate = Math.round(1000 / average);
        setFrameRate((current) => (Math.abs(current - nextFrameRate) >= 1 ? nextFrameRate : current));
        lastPublishedAt = now;
      }

      lastFrameAt = now;
      frame = window.requestAnimationFrame(measure);
    };

    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return frameRate;
}

function getLiveKitPlayerId(identity) {
  const separator = String(identity || '').indexOf(':');
  return separator >= 0 ? String(identity).slice(separator + 1) : '';
}

function App() {
  const [theme, setTheme] = useState('dark');
  const [gameStarted, setGameStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startScreen, setStartScreen] = useState('home');
  const [gameMode, setGameMode] = useState('bots');
  const [restartSignal, setRestartSignal] = useState(0);
  const [fogActive, setFogActive] = useState(false);
  const [fogAnimationsPaused, setFogAnimationsPaused] = useState(true);
  const [rainActive, setRainActive] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [roomTheme, setRoomTheme] = useState('dark');
  const [roomPlayerName, setRoomPlayerName] = useState('');
  const [roomLobby, setRoomLobby] = useState(null);
  const [localRoomPlayerId, setLocalRoomPlayerId] = useState('');
  const [roomConnectionStatus, setRoomConnectionStatus] = useState('idle');
  const [roomRedirectRequest, setRoomRedirectRequest] = useState(null);
  const [roomPingMs, setRoomPingMs] = useState(null);
  const [roomError, setRoomError] = useState('');
  const [roomNotifications, setRoomNotifications] = useState([]);
  const [voiceStatus, setVoiceStatus] = useState('idle');
  const [voiceLevels, setVoiceLevels] = useState({});
  const [roomVoiceEnabled, setRoomVoiceEnabled] = useState(true);
  const [roomSpeakerEnabled, setRoomSpeakerEnabled] = useState(true);
  const [roomMutedPlayers, setRoomMutedPlayers] = useState({});
  const [droppings, setDroppings] = useState([]);
  const [ammoStatus, setAmmoStatus] = useState({ count: MAX_BULLETS, reloading: false });
  const [rocketCount, setRocketCount] = useState(MAX_ROCKETS);
  const [killCount, setKillCount] = useState(0);
  const [highScore, setHighScore] = useState(readStoredHighScore);
  const [fuelStationPulses, setFuelStationPulses] = useState({});
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicHintActive, setMusicHintActive] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soloGameRules, setSoloGameRules] = useState(() => createSoloGameRules());
  const [fieldGuideOpen, setFieldGuideOpen] = useState(false);
  const [fieldGuidePage, setFieldGuidePage] = useState(0);
  const [fieldGuideTurnDirection, setFieldGuideTurnDirection] = useState('next');
  const [fieldGuideTurnKey, setFieldGuideTurnKey] = useState(0);
  const [planeMenuOpen, setPlaneMenuOpen] = useState(false);
  const [planeColor, setPlaneColor] = useState('blue');
  const [planeLightCombo, setPlaneLightCombo] = useState('classic');
  const [activeTrackId, setActiveTrackId] = useState(null);
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [effectsVolume, setEffectsVolume] = useState(1);
  const [warningAudioEnabled, setWarningAudioEnabled] = useState(true);
  const [soundLevels, setSoundLevels] = useState({
    engine: 0.09,
    ammo: 0.1,
    rocket: 0.1,
    explosion: 0.1,
    rain: 0.05,
  });
  const effectiveSoundLevels = useMemo(() => ({ ...Object.fromEntries(Object.entries(soundLevels).map(([key, value]) => [key, value * effectsVolume])), master: effectsVolume }), [soundLevels, effectsVolume]);
  const [planeLightIntensity, setPlaneLightIntensity] = useState(1);
  const [shootingStars, setShootingStars] = useState([]);
  const [remoteProjectiles, setRemoteProjectiles] = useState([]);


  useLayoutEffect(() => {
    if (fogActive) setFogAnimationsPaused(false);
  }, [fogActive]);

  const measuredFrameRate = useMeasuredFrameRate();
  const worldRef = useRef(null);
  const sceneryCameraRef = useRef(null);
  if (!sceneryCameraRef.current) sceneryCameraRef.current = createSceneryCamera({ x: getCameraX(START_X), y: getCameraY(0) });
  const mapPointerRef = useRef(null);
  const mapDotRef = useRef(null);
  const mapBotDotRefs = useRef([]);
  const fuelGaugeRef = useRef(null);
  const playerStateRef = useRef(createInitialPlaneState(START_X, soloGameRules.fuelSeconds));
  const remotePlayerStatesRef = useRef({});
  const remoteProjectilesRef = useRef([]);
  const remoteProjectileElementRefs = useRef(new Map());
  const gameFrameCallbacksRef = useRef(new Map());
  const roomDamageEventIdsRef = useRef(new Set());
  const localRoomPlayerIdRef = useRef('');
  const roomInputSeqRef = useRef(0);
  const roomInputRef = useRef({ power: false, down: false, left: false, right: false, fire: false, light: false, rocketPress: 0 });
  const botStateRefs = useRef(createInitialBotStates([], MAX_SOLO_BOTS));
  const playerApiRef = useRef(null);
  const rocketHint = useRocketHint(gameStarted, gameMode);
  const training = useTraining({setPaused,paused,playerStateRef});
  const trainingTargetStatesRef = training.targetsRef;
  const trainingWeaponHits = training.view;
  const trainingWeatherCheckpoint = training.setup.current.gate;
  const trainingWeatherLessonActive = gameMode === 'training' && gameStarted && training.view.index === 7 && training.view.status === 'active';

  const botApiRefs = useRef(Array.from({ length: MAX_SOLO_BOTS }, () => ({ current: null })));
  const weatherPausedRef = useRef(paused);
  weatherPausedRef.current = paused;
  const roomSocketRef = useRef(null);
  const roomSessionRef = useRef(readRoomSession());
  const roomReconnectTimerRef = useRef(0);
  const roomReconnectAttemptsRef = useRef(0);
  const pendingRoomActionRef = useRef(null);
  const intentionalRoomDisconnectRef = useRef(false);
  const pendingRoomPingSentAtRef = useRef(0);
  const rtcPeerConnectionsRef = useRef(new Map());
  const rtcIceServersRef = useRef(RTC_ICE_SERVERS);
  const rtcIceServersPromiseRef = useRef(null);
  const liveKitRoomRef = useRef(null);
  const liveKitSdkRef = useRef(null);
  const liveKitSdkPromiseRef = useRef(null);
  const liveKitTokenRequestRef = useRef(null);
  const voiceProviderRef = useRef('idle');
  const roomServerTimeOffsetRef = useRef(0);
  const voiceAudioElementsRef = useRef(new Map());
  const localVoiceStreamRef = useRef(null);
  const localVoiceTrackRef = useRef(null);
  const voiceLevelsRef = useRef({});
  const localVoiceMeterRef = useRef({ source: '', frame: 0, cleanup: null });
  const remoteVoiceMetersRef = useRef(new Map());
  const roomVoiceEnabledRef = useRef(roomVoiceEnabled);
  const roomSpeakerEnabledRef = useRef(roomSpeakerEnabled);
  const roomMutedPlayersRef = useRef(roomMutedPlayers);
  const [groundWarning, setGroundWarning] = useState(false);
  const groundWarningTracker = useRef(createGroundWarningTracker());
  const pullUpAudioRef = useRef(null);
  if (!pullUpAudioRef.current) pullUpAudioRef.current = createPullUpAudio();
  const musicPlayerRef = useRef(null);
  if (!musicPlayerRef.current) {
    musicPlayerRef.current = createMusicPlayer({ onChange: setActiveTrackId });
  }
  const startDefaultMusic = useCallback(() => {
    pullUpAudioRef.current.unlock();
    void musicPlayerRef.current.startDefault(MUSIC_TRACKS.find((track) => track.id === DEFAULT_MUSIC_TRACK_ID));
  }, []);
  useEffect(() => {
    musicPlayerRef.current.setMuted(sfxMuted);
  }, [sfxMuted]);

  useEffect(() => {
    setGameAudioPaused(paused);
    void musicPlayerRef.current.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMusicHintActive(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const check = () => setGroundWarning(groundWarningTracker.current.update(
      playerStateRef.current, performance.now(), gameStarted && !paused,
    ));
    check();
    const timer = window.setInterval(check, 100);
    return () => window.clearInterval(timer);
  }, [gameStarted, paused, restartSignal]);
  useEffect(() => {
    const audible = groundWarning && gameStarted && !paused && !sfxMuted && warningAudioEnabled && effectsVolume > 0;
    musicPlayerRef.current.setDucked(audible);
    if (!audible) { pullUpAudioRef.current.stop(); return; }
    pullUpAudioRef.current.play(effectsVolume);
    const timer = window.setInterval(() => pullUpAudioRef.current.play(effectsVolume), 2000);
    return () => { window.clearInterval(timer); pullUpAudioRef.current.stop(); };
  }, [groundWarning, gameStarted, paused, sfxMuted, warningAudioEnabled, effectsVolume]);
  useEffect(() => () => pullUpAudioRef.current.dispose(), []);
  const rainAudioRef = useRef(null);
  const rainSoundStartTimerRef = useRef(0);
  const fuelPulseTimersRef = useRef([]);
  const roomNotificationTimersRef = useRef([]);
  const shootingStarTimersRef = useRef([]);
  const registerGameFrameCallback = useCallback((priority, callback) => {
    let callbacks = gameFrameCallbacksRef.current.get(priority);
    if (!callbacks) {
      callbacks = new Set();
      gameFrameCallbacksRef.current.set(priority, callbacks);
    }
    callbacks.add(callback);

    return () => {
      const currentCallbacks = gameFrameCallbacksRef.current.get(priority);
      if (!currentCallbacks) return;
      currentCallbacks.delete(callback);
      if (currentCallbacks.size === 0) {
        gameFrameCallbacksRef.current.delete(priority);
      }
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = (now) => {
      for (const priority of GAME_FRAME_PRIORITIES) {
        gameFrameCallbacksRef.current.get(priority)?.forEach((callback) => callback(now));
      }
      frame = window.requestAnimationFrame(update);
    };

    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const startGame = useCallback(() => {
    startDefaultMusic();
    setGameStarted(true);
    setPaused(false);
    setStartScreen('home');
    setMusicOpen(false);
    setHelpOpen(false);
    setSettingsOpen(false);
    setFieldGuideOpen(false);
    setFieldGuidePage(0);
    setPlaneMenuOpen(false);
    setKillCount(0);
  }, [startDefaultMusic]);
  const resetTrainingProgress = training.reset;
  const disconnectRoomSocket = useCallback(({ preserveSession = false } = {}) => {
    intentionalRoomDisconnectRef.current = true;
    if (roomReconnectTimerRef.current) {
      window.clearTimeout(roomReconnectTimerRef.current);
      roomReconnectTimerRef.current = 0;
    }
    if (roomSocketRef.current) {
      roomSocketRef.current.close();
      roomSocketRef.current = null;
    }
    if (!preserveSession) {
      roomSessionRef.current = null;
      try {
        window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
      } catch {
        // Session storage can be disabled by the browser.
      }
    }
    pendingRoomActionRef.current = null;
    setRoomRedirectRequest(null);
    setLocalRoomPlayerId('');
    setRoomConnectionStatus('idle');
    setRoomPingMs(null);
    pendingRoomPingSentAtRef.current = 0;
    roomInputSeqRef.current = 0;
    roomInputRef.current = { power: false, down: false, left: false, right: false, fire: false, light: false, rocketPress: 0 };
  }, []);
  const sendRoomMessage = useCallback((message) => {
    const socket = roomSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }, []);
  const sendRoomInput = useCallback((changes = {}) => {
    if (gameMode !== 'room' || !gameStarted || !localRoomPlayerIdRef.current) return false;
    const previous = roomInputRef.current;
    const { fireRocket = false, ...inputChanges } = changes;
    const next = {
      ...previous,
      ...inputChanges,
      rocketPress: previous.rocketPress + (fireRocket ? 1 : 0),
    };
    const changed = Object.keys(next).some((key) => next[key] !== previous[key]);
    if (!changed) return false;
    roomInputRef.current = next;
    roomInputSeqRef.current += 1;
    return sendRoomMessage({
      type: 'room_input',
      seq: roomInputSeqRef.current,
      input: next,
    });
  }, [gameMode, gameStarted, sendRoomMessage]);

  useEffect(() => {
    if (roomConnectionStatus !== 'connected') {
      setRoomPingMs(null);
      pendingRoomPingSentAtRef.current = 0;
      return undefined;
    }

    const sendPing = () => {
      const now = performance.now();
      const pendingSince = pendingRoomPingSentAtRef.current;
      if (pendingSince && now - pendingSince < 5000) return;
      if (pendingSince) setRoomPingMs(null);
      pendingRoomPingSentAtRef.current = now;
      if (!sendRoomMessage({ type: 'ping' })) {
        pendingRoomPingSentAtRef.current = 0;
        setRoomPingMs(null);
      }
    };

    sendPing();
    const interval = window.setInterval(sendPing, 2000);
    return () => window.clearInterval(interval);
  }, [roomConnectionStatus, sendRoomMessage]);
  const clearRoomNotifications = useCallback(() => {
    roomNotificationTimersRef.current.forEach((timeout) => window.clearTimeout(timeout));
    roomNotificationTimersRef.current = [];
    setRoomNotifications([]);
  }, []);
  const pushRoomNotification = useCallback((message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRoomNotifications((current) => [...current.slice(-2), { id, message }]);
    const timeout = window.setTimeout(() => {
      setRoomNotifications((current) => current.filter((notification) => notification.id !== id));
      roomNotificationTimersRef.current = roomNotificationTimersRef.current.filter((timer) => timer !== timeout);
    }, 3400);
    roomNotificationTimersRef.current.push(timeout);
  }, []);
  const replaceRemotePlayerStates = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(remotePlayerStatesRef.current) : updater;
    remotePlayerStatesRef.current = next;
  }, []);
  const updateRemotePlayerState = useCallback((playerId, state, serverAt = 0, sequence = 0) => {
    if (!playerId || playerId === localRoomPlayerIdRef.current) return;
    const receivedAt = performance.now();
    const current = remotePlayerStatesRef.current;
    const existing = current[playerId];
    const packetSequence = Number.isFinite(Number(sequence)) ? Number(sequence) : 0;
    if (packetSequence > 0 && Number.isFinite(existing?.seq) && existing.seq > 0 && packetSequence <= existing.seq) {
      return;
    }
    if (
      packetSequence <= 0 &&
      Number.isFinite(serverAt) &&
      serverAt > 0 &&
      Number.isFinite(existing?.serverAt) &&
      existing.serverAt > 0 &&
      serverAt < existing.serverAt
    ) {
      return;
    }
    const packetGap = existing?.at ? receivedAt - existing.at : ROOM_STATE_SEND_INTERVAL_MS;
    const gapError = Math.abs(packetGap - ROOM_STATE_SEND_INTERVAL_MS);
    const jitter = existing?.jitter == null
      ? gapError
      : existing.jitter + (gapError - existing.jitter) * 0.18;
    const nextState = {
      ...existing?.state,
      ...state,
    };
    const snapshots = [
      ...(existing?.snapshots || []),
      {
        state: nextState,
        at: receivedAt,
        serverAt,
      },
    ].slice(-REMOTE_SNAPSHOT_BUFFER_SIZE);
    const previousSnapshot = snapshots.length > 1
      ? snapshots[snapshots.length - 2]
      : null;
    current[playerId] = {
      previousState: previousSnapshot?.state || existing?.state || nextState,
      previousAt: previousSnapshot?.at || existing?.at || receivedAt,
      state: nextState,
      at: receivedAt,
      serverAt,
      seq: packetSequence || existing?.seq || 0,
      jitter,
      snapshots,
    };
  }, []);
  const replaceRemoteProjectiles = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(remoteProjectilesRef.current) : updater;
    remoteProjectilesRef.current = next;
    setRemoteProjectiles(next);
  }, []);
  const setRemoteAudioMuted = useCallback((muted) => {
    const globalMuted = Boolean(muted);
    for (const record of voiceAudioElementsRef.current.values()) {
      const element = record.element || record;
      const playerMuted = record.playerId ? Boolean(roomMutedPlayersRef.current[record.playerId]) : false;
      const shouldMute = globalMuted || playerMuted;
      element.muted = shouldMute;
      element.volume = shouldMute ? 0 : 1;
      if (!shouldMute) {
        element.play?.().catch(() => {
          setVoiceStatus('playback-blocked');
        });
      }
    }
  }, []);
  const updateVoiceLevels = useCallback((updater) => {
    setVoiceLevels((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      voiceLevelsRef.current = next;
      return next;
    });
  }, []);
  const stopRemoteVoiceMeter = useCallback((playerId) => {
    const meter = remoteVoiceMetersRef.current.get(playerId);
    if (!meter) return;
    if (meter.frame) window.cancelAnimationFrame(meter.frame);
    meter.cleanup?.();
    remoteVoiceMetersRef.current.delete(playerId);
    updateVoiceLevels((current) => {
      if (!current[playerId]) return current;
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  }, [updateVoiceLevels]);
  const stopLocalVoiceMeter = useCallback(() => {
    const meter = localVoiceMeterRef.current;
    if (meter.frame) window.cancelAnimationFrame(meter.frame);
    meter.cleanup?.();
    localVoiceMeterRef.current = { source: '', frame: 0, cleanup: null };
    const playerId = localRoomPlayerIdRef.current;
    if (playerId) {
      updateVoiceLevels((current) => ({
        ...current,
        [playerId]: { speaking: false, level: 0 },
      }));
    }
  }, [updateVoiceLevels]);

  const createTrackMeter = useCallback((track, onLevel) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!track || track.readyState !== 'live' || !AudioContextClass) return null;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    analyser.minDecibels = -72;
    analyser.maxDecibels = -18;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    context.resume?.();

    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centered = (samples[index] - 128) / 128;
        total += centered * centered;
      }
      const rms = Math.sqrt(total / samples.length);
      const level = rms < 0.006 ? 0 : rms > 0.075 ? 3 : rms > 0.028 ? 2 : 1;
      onLevel(level);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return {
      get frame() {
        return frame;
      },
      cleanup: () => {
        if (frame) window.cancelAnimationFrame(frame);
        source.disconnect();
        context.close?.();
      },
    };
  }, []);

  const startLocalVoiceMeter = useCallback((track) => {
    if (!track || track.readyState !== 'live') {
      stopLocalVoiceMeter();
      return;
    }

    stopLocalVoiceMeter();
    const meter = createTrackMeter(track, (level) => {
      const playerId = localRoomPlayerIdRef.current;
      const enabled = roomVoiceEnabledRef.current;
      const nextLevel = enabled ? level : 0;
      const nextSpeaking = nextLevel > 0;
      if (playerId) {
        updateVoiceLevels((current) => {
          const previous = current[playerId] || { speaking: false, level: 0 };
          if (previous.speaking === nextSpeaking && previous.level === nextLevel) return current;
          return {
            ...current,
            [playerId]: { speaking: nextSpeaking, level: nextLevel },
          };
        });
      }
    });

    localVoiceMeterRef.current = {
      source: 'webrtc',
      frame: meter?.frame || 0,
      cleanup: meter?.cleanup || null,
    };
  }, [createTrackMeter, stopLocalVoiceMeter, updateVoiceLevels]);

  const startRemoteVoiceMeter = useCallback((playerId, track) => {
    stopRemoteVoiceMeter(playerId);
    const meter = createTrackMeter(track, (level) => {
      const nextSpeaking = level > 0;
      updateVoiceLevels((current) => {
        const previous = current[playerId] || { speaking: false, level: 0 };
        if (previous.speaking === nextSpeaking && previous.level === level) return current;
        return {
          ...current,
          [playerId]: { speaking: nextSpeaking, level },
        };
      });
    });
    if (meter) remoteVoiceMetersRef.current.set(playerId, meter);
  }, [createTrackMeter, stopRemoteVoiceMeter, updateVoiceLevels]);

  const sendVoiceSignal = useCallback((targetId, signal) => {
    if (!targetId || targetId === localRoomPlayerIdRef.current) return false;
    return sendRoomMessage({
      type: 'voice_signal',
      targetId,
      signal,
    });
  }, [sendRoomMessage]);

  const refreshVoiceStatus = useCallback(() => {
    const peers = Array.from(rtcPeerConnectionsRef.current.values());
    if (!localRoomPlayerIdRef.current) {
      setVoiceStatus('idle');
      return;
    }
    if (!peers.length) {
      setVoiceStatus('connected');
      return;
    }
    if (peers.some((peer) => peer.connection.connectionState === 'connected')) {
      setVoiceStatus('connected');
      return;
    }
    if (peers.some((peer) => ['new', 'checking', 'connecting'].includes(peer.connection.connectionState))) {
      setVoiceStatus('connecting');
      return;
    }
    if (peers.every((peer) => ['failed', 'closed', 'disconnected'].includes(peer.connection.connectionState))) {
      setVoiceStatus('error');
    }
  }, []);

  const negotiateRtcPeer = useCallback(async (remotePlayerId, peerRecord) => {
    const peer = peerRecord || rtcPeerConnectionsRef.current.get(remotePlayerId);
    if (!peer || peer.connection.signalingState === 'closed') return;
    if (peer.negotiating || peer.connection.signalingState !== 'stable') {
      peer.needsNegotiation = true;
      return;
    }
    try {
      peer.negotiating = true;
      peer.needsNegotiation = false;
      await peer.connection.setLocalDescription();
      sendVoiceSignal(remotePlayerId, { description: peer.connection.localDescription });
    } catch (error) {
      setVoiceStatus('error');
      setRoomError(`Voice negotiation failed: ${error.message}`);
    } finally {
      peer.negotiating = false;
      if (peer.needsNegotiation && peer.connection.signalingState === 'stable') {
        window.setTimeout(() => negotiateRtcPeer(remotePlayerId, peer), 0);
      }
    }
  }, [sendVoiceSignal]);

  const unlockRoomAudio = useCallback(async () => {
    let blocked = false;
    const liveKitRoom = liveKitRoomRef.current;
    if (liveKitRoom && roomSpeakerEnabledRef.current) {
      try {
        await liveKitRoom.startAudio();
      } catch {
        blocked = true;
      }
    }
    for (const record of voiceAudioElementsRef.current.values()) {
      const element = record.element || record;
      if (element.muted || element.volume === 0) continue;
      try {
        await element.play?.();
      } catch {
        blocked = true;
      }
    }
    if (blocked && roomSpeakerEnabledRef.current) {
      setVoiceStatus('playback-blocked');
      return false;
    }
    refreshVoiceStatus();
    return true;
  }, [refreshVoiceStatus]);

  const attachRemoteAudioTrack = useCallback((playerId, track, stream) => {
    if (!playerId || !track || track.kind !== 'audio') return;
    const previous = voiceAudioElementsRef.current.get(playerId);
    if (previous) {
      previous.element.remove();
      stopRemoteVoiceMeter(playerId);
    }
    const audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    audioElement.controls = false;
    audioElement.srcObject = new MediaStream([track]);
    const shouldMute = !roomSpeakerEnabledRef.current || Boolean(roomMutedPlayersRef.current[playerId]);
    audioElement.muted = shouldMute;
    audioElement.volume = shouldMute ? 0 : 1;
    audioElement.style.display = 'none';
    voiceAudioElementsRef.current.set(playerId, {
      element: audioElement,
      playerId,
      track,
    });
    document.body.appendChild(audioElement);
    audioElement.addEventListener('canplay', () => unlockRoomAudio(), { once: true });
    track.addEventListener('unmute', () => unlockRoomAudio(), { once: true });
    startRemoteVoiceMeter(playerId, track);
    unlockRoomAudio();
  }, [startRemoteVoiceMeter, stopRemoteVoiceMeter, unlockRoomAudio]);

  const loadLiveKitSdk = useCallback(async () => {
    if (liveKitSdkRef.current) return liveKitSdkRef.current;
    if (!liveKitSdkPromiseRef.current) {
      liveKitSdkPromiseRef.current = import('livekit-client')
        .then((sdk) => {
          liveKitSdkRef.current = sdk;
          return sdk;
        })
        .finally(() => {
          liveKitSdkPromiseRef.current = null;
        });
    }
    return liveKitSdkPromiseRef.current;
  }, []);

  const attachLiveKitRemoteAudioTrack = useCallback((participant, track) => {
    if (track?.kind !== 'audio') return;
    const playerId = getLiveKitPlayerId(participant?.identity);
    const mediaTrack = track.mediaStreamTrack;
    if (!playerId || !mediaTrack) return;
    attachRemoteAudioTrack(playerId, mediaTrack);
  }, [attachRemoteAudioTrack]);

  const removeLiveKitRemoteAudioTrack = useCallback((participant, track) => {
    if (track?.kind !== 'audio') return;
    const playerId = getLiveKitPlayerId(participant?.identity);
    const record = voiceAudioElementsRef.current.get(playerId);
    if (!record || (track.mediaStreamTrack && record.track !== track.mediaStreamTrack)) return;
    record.element?.remove?.();
    voiceAudioElementsRef.current.delete(playerId);
    stopRemoteVoiceMeter(playerId);
  }, [stopRemoteVoiceMeter]);

  const requestLiveKitVoiceToken = useCallback(() => {
    if (!roomLobby?.code || !localRoomPlayerIdRef.current) return Promise.resolve(null);
    if (liveKitTokenRequestRef.current?.promise) return liveKitTokenRequestRef.current.promise;

    let resolveRequest;
    const promise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const timeout = window.setTimeout(() => {
      const pending = liveKitTokenRequestRef.current;
      if (!pending || pending.promise !== promise) return;
      liveKitTokenRequestRef.current = null;
      resolveRequest(null);
    }, 4500);
    liveKitTokenRequestRef.current = { promise, resolve: resolveRequest, timeout };
    if (!sendRoomMessage({ type: 'request_livekit_token' })) {
      window.clearTimeout(timeout);
      liveKitTokenRequestRef.current = null;
      resolveRequest(null);
    }
    return promise;
  }, [roomLobby?.code, sendRoomMessage]);

  const loadRtcIceServers = useCallback(async () => {
    if (!MULTIPLAYER_API_URL) return rtcIceServersRef.current;
    if (rtcIceServersPromiseRef.current) return rtcIceServersPromiseRef.current;

    rtcIceServersPromiseRef.current = fetch(`${MULTIPLAYER_API_URL}/voice/ice-servers`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('ICE server config unavailable.');
        const payload = await response.json();
        const iceServers = Array.isArray(payload.iceServers)
          ? payload.iceServers.filter((server) => server?.urls)
          : [];
        if (iceServers.length) {
          rtcIceServersRef.current = iceServers;
        }
        return rtcIceServersRef.current;
      })
      .catch(() => RTC_ICE_SERVERS)
      .finally(() => {
        window.setTimeout(() => {
          rtcIceServersPromiseRef.current = null;
        }, 60_000);
      });

    return rtcIceServersPromiseRef.current;
  }, []);

  const createRtcPeerConnection = useCallback((remotePlayerId) => {
    if (!remotePlayerId || remotePlayerId === localRoomPlayerIdRef.current) return null;
    const existing = rtcPeerConnectionsRef.current.get(remotePlayerId);
    if (existing && existing.connection.connectionState !== 'closed') return existing;

    const connection = new RTCPeerConnection({
      iceServers: rtcIceServersRef.current,
      iceCandidatePoolSize: 2,
    });
    const localId = localRoomPlayerIdRef.current || '';
    const audioTransceiver = connection.addTransceiver('audio', {
      direction: roomVoiceEnabledRef.current ? 'sendrecv' : 'recvonly',
    });
    if (roomVoiceEnabledRef.current && localVoiceTrackRef.current?.readyState === 'live') {
      audioTransceiver.sender.replaceTrack(localVoiceTrackRef.current).catch(() => {});
    }
    const peerRecord = {
      connection,
      audioTransceiver,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswerPending: false,
      queuedCandidates: [],
      negotiating: false,
      needsNegotiation: false,
      polite: localId > remotePlayerId,
    };
    rtcPeerConnectionsRef.current.set(remotePlayerId, peerRecord);

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      sendVoiceSignal(remotePlayerId, { candidate: event.candidate });
    });

    connection.addEventListener('track', (event) => {
      const [stream] = event.streams;
      attachRemoteAudioTrack(remotePlayerId, event.track, stream);
    });

    connection.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed'].includes(connection.connectionState)) {
        const record = voiceAudioElementsRef.current.get(remotePlayerId);
        record?.element?.remove?.();
        voiceAudioElementsRef.current.delete(remotePlayerId);
        stopRemoteVoiceMeter(remotePlayerId);
        if (connection.connectionState === 'failed') {
          connection.restartIce?.();
          negotiateRtcPeer(remotePlayerId, peerRecord);
        }
      }
      refreshVoiceStatus();
    });

    connection.addEventListener('signalingstatechange', () => {
      if (connection.signalingState === 'stable' && peerRecord.needsNegotiation) {
        negotiateRtcPeer(remotePlayerId, peerRecord);
      }
    });

    connection.addEventListener('negotiationneeded', () => {
      peerRecord.makingOffer = true;
      negotiateRtcPeer(remotePlayerId, peerRecord).finally(() => {
        peerRecord.makingOffer = false;
      });
    });

    refreshVoiceStatus();
    return peerRecord;
  }, [attachRemoteAudioTrack, negotiateRtcPeer, refreshVoiceStatus, sendVoiceSignal, stopRemoteVoiceMeter]);

  const getLocalVoiceStream = useCallback(async () => {
    const existingTrack = localVoiceTrackRef.current;
    if (localVoiceStreamRef.current && existingTrack?.readyState === 'live') return localVoiceStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone is not available in this browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const [micTrack] = stream.getAudioTracks();
    if (!micTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('No microphone track was found.');
    }
    localVoiceStreamRef.current = stream;
    localVoiceTrackRef.current = micTrack;
    startLocalVoiceMeter(micTrack);
    return stream;
  }, [startLocalVoiceMeter]);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      await getLocalVoiceStream();
      setRoomError('');
      return true;
    } catch (error) {
      setRoomError(error.message || 'Microphone permission was blocked. Allow microphone in the browser to use voice chat.');
      return false;
    }
  }, [getLocalVoiceStream]);

  const publishLocalVoiceTrack = useCallback(async () => {
    if (!roomVoiceEnabledRef.current) return null;
    const stream = await getLocalVoiceStream();
    const [track] = stream.getAudioTracks();
    const replacements = [];
    for (const [remotePlayerId, peer] of rtcPeerConnectionsRef.current.entries()) {
      peer.audioTransceiver.direction = 'sendrecv';
      replacements.push(peer.audioTransceiver.sender.replaceTrack(track));
      negotiateRtcPeer(remotePlayerId, peer);
    }
    await Promise.allSettled(replacements);
    return track;
  }, [getLocalVoiceStream, negotiateRtcPeer]);

  const unpublishLocalVoiceTrack = useCallback(() => {
    for (const [remotePlayerId, peer] of rtcPeerConnectionsRef.current.entries()) {
      peer.audioTransceiver.direction = 'recvonly';
      peer.audioTransceiver.sender.replaceTrack(null).catch(() => {});
      negotiateRtcPeer(remotePlayerId, peer);
    }
    localVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVoiceStreamRef.current = null;
    localVoiceTrackRef.current = null;
    stopLocalVoiceMeter();
  }, [negotiateRtcPeer, stopLocalVoiceMeter]);

  const removeRtcPeer = useCallback((remotePlayerId) => {
    const peer = rtcPeerConnectionsRef.current.get(remotePlayerId);
    if (peer) {
      peer.connection.onicecandidate = null;
      peer.connection.ontrack = null;
      peer.connection.close();
      rtcPeerConnectionsRef.current.delete(remotePlayerId);
    }
    const audioRecord = voiceAudioElementsRef.current.get(remotePlayerId);
    audioRecord?.element?.remove?.();
    voiceAudioElementsRef.current.delete(remotePlayerId);
    stopRemoteVoiceMeter(remotePlayerId);
    refreshVoiceStatus();
  }, [refreshVoiceStatus, stopRemoteVoiceMeter]);

  const disconnectRoomVoice = useCallback(() => {
    const pendingToken = liveKitTokenRequestRef.current;
    if (pendingToken) {
      window.clearTimeout(pendingToken.timeout);
      liveKitTokenRequestRef.current = null;
      pendingToken.resolve(null);
    }
    const liveKitRoom = liveKitRoomRef.current;
    liveKitRoomRef.current = null;
    liveKitRoom?.disconnect();
    voiceProviderRef.current = 'idle';
    localVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVoiceStreamRef.current = null;
    localVoiceTrackRef.current = null;
    stopLocalVoiceMeter();
    for (const peer of rtcPeerConnectionsRef.current.values()) {
      peer.connection.close();
    }
    rtcPeerConnectionsRef.current.clear();
    for (const record of voiceAudioElementsRef.current.values()) {
      const element = record.element || record;
      element.remove();
    }
    voiceAudioElementsRef.current.clear();
    for (const playerId of remoteVoiceMetersRef.current.keys()) {
      stopRemoteVoiceMeter(playerId);
    }
    updateVoiceLevels({});
    setVoiceStatus('idle');
  }, [stopLocalVoiceMeter, stopRemoteVoiceMeter, updateVoiceLevels]);

  const syncRoomVoicePeers = useCallback((players = roomLobby?.players || []) => {
    if (!localRoomPlayerIdRef.current || !window.RTCPeerConnection) return;
    const remoteIds = new Set(
      (players || [])
        .map((player) => player.id)
        .filter((playerId) => playerId && playerId !== localRoomPlayerIdRef.current),
    );
    for (const playerId of remoteIds) {
      createRtcPeerConnection(playerId);
    }
    for (const playerId of rtcPeerConnectionsRef.current.keys()) {
      if (!remoteIds.has(playerId)) removeRtcPeer(playerId);
    }
    refreshVoiceStatus();
  }, [createRtcPeerConnection, refreshVoiceStatus, removeRtcPeer, roomLobby?.players]);

  const connectDirectRoomVoice = useCallback(async () => {
    if (!roomLobby?.code || !localRoomPlayerId) return;
    if (!window.RTCPeerConnection) {
      setVoiceStatus('error');
      setRoomError('Voice chat is not supported in this browser.');
      return;
    }
    localRoomPlayerIdRef.current = localRoomPlayerId;
    setVoiceStatus('connecting');
    await loadRtcIceServers();
    if (roomVoiceEnabledRef.current) {
      try {
        await getLocalVoiceStream();
      } catch (error) {
        roomVoiceEnabledRef.current = false;
        setRoomVoiceEnabled(false);
        sendRoomMessage({
          type: 'update_audio_settings',
          micEnabled: false,
          speakerEnabled: roomSpeakerEnabledRef.current,
        });
        setRoomError(`Voice connected, but microphone is off: ${error.message}`);
      }
    }
    syncRoomVoicePeers(roomLobby.players);
    if (roomVoiceEnabledRef.current) {
      try {
        await publishLocalVoiceTrack();
      } catch (error) {
        roomVoiceEnabledRef.current = false;
        setRoomVoiceEnabled(false);
        sendRoomMessage({
          type: 'update_audio_settings',
          micEnabled: false,
          speakerEnabled: roomSpeakerEnabledRef.current,
        });
        setRoomError(`Voice connected, but microphone is off: ${error.message}`);
      }
    }
    setRemoteAudioMuted(!roomSpeakerEnabledRef.current);
    unlockRoomAudio();
    refreshVoiceStatus();
  }, [getLocalVoiceStream, loadRtcIceServers, localRoomPlayerId, publishLocalVoiceTrack, refreshVoiceStatus, roomLobby?.code, roomLobby?.players, sendRoomMessage, setRemoteAudioMuted, syncRoomVoicePeers, unlockRoomAudio]);

  const connectLiveKitRoomVoice = useCallback(async (issued) => {
    if (!issued?.url || !issued?.token) return false;
    if (liveKitRoomRef.current) return true;

    let sdk;
    try {
      sdk = await loadLiveKitSdk();
    } catch (error) {
      voiceProviderRef.current = 'idle';
      setVoiceStatus('error');
      setRoomError(`LiveKit voice could not load: ${error.message}`);
      return false;
    }
    const { Room, RoomEvent } = sdk;

    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    liveKitRoomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachLiveKitRemoteAudioTrack(participant, track);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      removeLiveKitRemoteAudioTrack(participant, track);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      updateVoiceLevels((current) => {
        const next = { ...current };
        Object.keys(next).forEach((playerId) => {
          if (playerId !== localRoomPlayerIdRef.current) {
            next[playerId] = { ...next[playerId], speaking: false, level: 0 };
          }
        });
        speakers.forEach((speaker) => {
          const playerId = getLiveKitPlayerId(speaker.identity);
          if (!playerId) return;
          next[playerId] = {
            speaking: true,
            level: Math.max(0.05, Number(speaker.audioLevel) || 0.6),
          };
        });
        return next;
      });
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (liveKitRoomRef.current === room) setVoiceStatus('connecting');
    });
    room.on(RoomEvent.Reconnected, () => {
      if (liveKitRoomRef.current === room) setVoiceStatus('connected');
    });
    room.on(RoomEvent.Disconnected, () => {
      if (liveKitRoomRef.current !== room) return;
      liveKitRoomRef.current = null;
      voiceProviderRef.current = 'idle';
      stopLocalVoiceMeter();
      for (const record of voiceAudioElementsRef.current.values()) {
        (record.element || record).remove?.();
      }
      voiceAudioElementsRef.current.clear();
      for (const playerId of remoteVoiceMetersRef.current.keys()) {
        stopRemoteVoiceMeter(playerId);
      }
      updateVoiceLevels({});
      setVoiceStatus('error');
      setRoomError('Voice connection ended. Rejoin the room to reconnect voice.');
    });

    try {
      await room.connect(issued.url, issued.token, { autoSubscribe: true });
      voiceProviderRef.current = 'livekit';
      if (roomVoiceEnabledRef.current) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          const localTrack = room.localParticipant
            .getTrackPublication('microphone')
            ?.track?.mediaStreamTrack;
          if (localTrack) startLocalVoiceMeter(localTrack);
        } catch (error) {
          roomVoiceEnabledRef.current = false;
          setRoomVoiceEnabled(false);
          sendRoomMessage({
            type: 'update_audio_settings',
            micEnabled: false,
            speakerEnabled: roomSpeakerEnabledRef.current,
          });
          setRoomError(`Voice connected, but microphone is off: ${error.message}`);
        }
      }
      setRemoteAudioMuted(!roomSpeakerEnabledRef.current);
      const unlocked = await unlockRoomAudio();
      if (unlocked) setVoiceStatus('connected');
      return true;
    } catch (error) {
      if (liveKitRoomRef.current === room) liveKitRoomRef.current = null;
      room.disconnect();
      voiceProviderRef.current = 'idle';
      stopLocalVoiceMeter();
      setVoiceStatus('error');
      setRoomError(`LiveKit voice connection failed: ${error.message}`);
      return false;
    }
  }, [attachLiveKitRemoteAudioTrack, loadLiveKitSdk, removeLiveKitRemoteAudioTrack, sendRoomMessage, setRemoteAudioMuted, startLocalVoiceMeter, stopLocalVoiceMeter, stopRemoteVoiceMeter, unlockRoomAudio, updateVoiceLevels]);

  const connectRoomVoice = useCallback(async () => {
    if (!roomLobby?.code || !localRoomPlayerId || liveKitRoomRef.current || voiceProviderRef.current === 'connecting') return;
    localRoomPlayerIdRef.current = localRoomPlayerId;
    voiceProviderRef.current = 'connecting';
    setVoiceStatus('connecting');
    const issued = await requestLiveKitVoiceToken();
    if (issued) {
      await connectLiveKitRoomVoice(issued);
      return;
    }
    voiceProviderRef.current = 'webrtc';
    await connectDirectRoomVoice();
  }, [connectDirectRoomVoice, connectLiveKitRoomVoice, localRoomPlayerId, requestLiveKitVoiceToken, roomLobby?.code]);

  const handleVoiceSignal = useCallback(async (fromPlayerId, signal = {}) => {
    if (!fromPlayerId || fromPlayerId === localRoomPlayerIdRef.current || !window.RTCPeerConnection) return;
    await loadRtcIceServers();
    const peer = createRtcPeerConnection(fromPlayerId);
    if (!peer) return;
    const connection = peer.connection;
    try {
      if (signal.description) {
        const description = signal.description;
        const readyForOffer = !peer.makingOffer
          && (connection.signalingState === 'stable' || peer.settingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        peer.settingRemoteAnswerPending = description.type === 'answer';
        await connection.setRemoteDescription(description);
        peer.settingRemoteAnswerPending = false;
        while (peer.queuedCandidates.length) {
          const candidate = peer.queuedCandidates.shift();
          await connection.addIceCandidate(candidate);
        }
        if (description.type === 'offer') {
          await connection.setLocalDescription();
          sendVoiceSignal(fromPlayerId, { description: connection.localDescription });
        }
      }
      if (signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (!connection.remoteDescription) {
          peer.queuedCandidates.push(candidate);
          return;
        }
        await connection.addIceCandidate(candidate);
      }
    } catch (error) {
      if (peer.ignoreOffer) return;
      setVoiceStatus('error');
      setRoomError(`Voice connection failed: ${error.message}`);
    }
  }, [createRtcPeerConnection, loadRtcIceServers, sendVoiceSignal]);
  const applyServerRoomState = useCallback((room, playerId = localRoomPlayerId) => {
    if (!room) return;
    setRoomLobby(room);
    setRoomTheme(room.theme || 'dark');
    setTheme(room.theme || 'dark');
    if (Number.isFinite(room.serverNow)) {
      roomServerTimeOffsetRef.current = room.serverNow - Date.now();
    }
    if (room.weather?.state) {
      setFogActive(Boolean(room.weather.state.fog));
      setRainActive(Boolean(room.weather.state.rain));
    }
    const effectivePlayerId = playerId || localRoomPlayerIdRef.current;
    if (effectivePlayerId) {
      localRoomPlayerIdRef.current = effectivePlayerId;
      setLocalRoomPlayerId(effectivePlayerId);
      const localPlayer = room.players?.find((player) => player.id === effectivePlayerId);
      if (localPlayer?.color) setPlaneColor(localPlayer.color);
      if (Number.isFinite(localPlayer?.kills)) {
        setKillCount(localPlayer.kills);
      }
      if (typeof localPlayer?.micEnabled === 'boolean') setRoomVoiceEnabled(localPlayer.micEnabled);
      if (typeof localPlayer?.speakerEnabled === 'boolean') setRoomSpeakerEnabled(localPlayer.speakerEnabled);
    }
    const activeRemoteIds = new Set((room.players || []).filter((player) => player.id !== effectivePlayerId).map((player) => player.id));
    replaceRemotePlayerStates((current) => {
      const next = {};
      Object.entries(current).forEach(([id, value]) => {
        if (activeRemoteIds.has(id)) next[id] = value;
      });
      return next;
    });
    setRoomError('');
    if (!room.started) {
      setStartScreen('room-waiting');
    }
  }, [replaceRemotePlayerStates]);
  const applyAuthoritativeRoomSnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    if (Number.isFinite(Number(snapshot.serverNow))) {
      roomServerTimeOffsetRef.current = Number(snapshot.serverNow) - Date.now();
    }

    const localId = localRoomPlayerIdRef.current;
    if (Number.isFinite(Number(snapshot.inputSeq))) {
      roomInputSeqRef.current = Math.max(roomInputSeqRef.current, Number(snapshot.inputSeq));
    }
    if (Number.isFinite(Number(snapshot.local?.input?.rocketPress))) {
      roomInputRef.current = {
        ...roomInputRef.current,
        rocketPress: Number(snapshot.local.input.rocketPress),
      };
    }
    for (const player of snapshot.players || []) {
      if (!player?.id || player.id === localId || !player.state) continue;
      updateRemotePlayerState(player.id, player.state, Number(snapshot.serverNow) || 0, 0);
    }

    const now = performance.now();
    const serverNow = Date.now();
    replaceRemoteProjectiles((current) => {
      const previousById = new Map(current.map((projectile) => [projectile.id, projectile]));
      return (snapshot.projectiles || [])
        .filter((projectile) => projectile?.id && projectile.ownerId !== localId)
        .map((projectile) => {
          const existing = previousById.get(projectile.id);
          const elapsed = Math.max(0, serverNow - (Number(projectile.created) || serverNow));
          const weapon = projectile.weapon === 'rocket' ? 'rocket' : 'bullet';
          return {
            ...projectile,
            weapon,
            created: existing?.created ?? now - elapsed,
            lastUpdate: now,
            guideUntil: weapon === 'rocket'
              ? now + Math.max(0, (Number(projectile.guideUntil) || serverNow) - serverNow)
              : 0,
            impact: weapon === 'rocket' ? 1.72 : 1.08,
          };
        });
    });
    playerApiRef.current?.applyAuthoritativeRoomState?.(snapshot.local);
  }, [replaceRemoteProjectiles, updateRemotePlayerState]);
  const connectRoomSocket = useCallback((requestedUrl = '', options = {}) => new Promise((resolve, reject) => {
    const restoringSession = Boolean(options.restoringSession);
    const endpoint = normalizeRoomWebSocketUrl(requestedUrl || MULTIPLAYER_WS_URL);
    if (!endpoint) {
      reject(new Error('Multiplayer server is not configured yet.'));
      return;
    }

    const existing = roomSocketRef.current;
    if (existing?.readyState === WebSocket.OPEN) {
      resolve(existing);
      return;
    }

    setRoomConnectionStatus(restoringSession ? 'restoring' : 'connecting');
    const socket = new WebSocket(endpoint);
    roomSocketRef.current = socket;
    let settled = false;

    socket.addEventListener('open', () => {
      settled = true;
      setRoomConnectionStatus('connected');
      resolve(socket);
    });
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'room_session') {
        const session = {
          roomCode: message.roomCode,
          playerId: message.playerId,
          resumeToken: message.resumeToken,
          serverUrl: normalizeRoomWebSocketUrl(message.serverUrl) || endpoint,
        };
        if (session.roomCode && session.playerId && session.resumeToken) {
          roomSessionRef.current = session;
          localRoomPlayerIdRef.current = session.playerId;
          setLocalRoomPlayerId(session.playerId);
          roomReconnectAttemptsRef.current = 0;
          setRoomConnectionStatus('connected');
          try {
            window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
          } catch {
            // Session storage can be disabled by the browser.
          }
        }
      }
      if (message.type === 'room_state') {
        applyServerRoomState(message.room, message.localPlayerId);
      }
      if (message.type === 'room_redirect') {
        const targetUrl = normalizeRoomWebSocketUrl(message.wsUrl);
        const pendingAction = pendingRoomActionRef.current;
        if (!targetUrl || !pendingAction || (message.action && pendingAction.type !== `${message.action}_room`)) {
          setRoomError('The room server gave an invalid regional route. Please try again.');
          return;
        }
        intentionalRoomDisconnectRef.current = true;
        if (roomSocketRef.current === socket) roomSocketRef.current = null;
        socket.close();
        setRoomConnectionStatus('connecting');
        setRoomRedirectRequest({ id: `${Date.now()}-${Math.random()}`, wsUrl: targetUrl, action: pendingAction });
        return;
      }
      if (message.type === 'room_resumed') {
        roomReconnectAttemptsRef.current = 0;
        setRoomConnectionStatus('connected');
        applyServerRoomState(message.room, message.localPlayerId);
        if (message.room?.started) {
          setGameMode('room');
          startGame();
        }
      }
      if (message.type === 'room_started') {
        applyServerRoomState(message.room, localRoomPlayerIdRef.current);
        setGameMode('room');
        startGame();
        setRestartSignal((signal) => signal + 1);
      }
      if (message.type === 'room_snapshot') {
        applyAuthoritativeRoomSnapshot(message);
      }
      if (message.type === 'remote_player_state') {
        if (!message.playerId || message.playerId === localRoomPlayerIdRef.current) return;
        updateRemotePlayerState(message.playerId, message.state, message.at || 0, message.seq || 0);
      }
      if (message.type === 'room_projectile') {
        const projectile = message.projectile;
        if (!projectile || projectile.ownerId === localRoomPlayerIdRef.current) return;
        const now = performance.now();
        const weapon = projectile.weapon === 'rocket' ? 'rocket' : 'bullet';
        replaceRemoteProjectiles((current) => [
          ...current,
          {
            ...projectile,
            weapon,
            created: now,
            lastUpdate: now,
            guideUntil: weapon === 'rocket' ? now + ROCKET_HOMING_MS : 0,
            impact: weapon === 'rocket' ? 1.72 : 1.08,
          },
        ]);
      }
      if (message.type === 'livekit_token') {
        const pending = liveKitTokenRequestRef.current;
        if (pending) {
          window.clearTimeout(pending.timeout);
          liveKitTokenRequestRef.current = null;
          pending.resolve(message);
        }
      }
      if (message.type === 'voice_unavailable' && message.provider === 'livekit') {
        const pending = liveKitTokenRequestRef.current;
        if (pending) {
          window.clearTimeout(pending.timeout);
          liveKitTokenRequestRef.current = null;
          pending.resolve(null);
        }
      }
      if (message.type === 'voice_signal') {
        handleVoiceSignal(message.fromPlayerId, message.signal);
      }
      if (message.type === 'pong') {
        const sentAt = pendingRoomPingSentAtRef.current;
        if (sentAt) {
          const nextPing = Math.max(0, Math.round(performance.now() - sentAt));
          setRoomPingMs(nextPing);
          pendingRoomPingSentAtRef.current = 0;
        }
      }
      if (message.type === 'player_hit') {
        const eventId = message.projectileId || `${message.attackerId}-${message.targetId}-${message.at}`;
        if (message.attackerId === localRoomPlayerIdRef.current && message.killed) {
          setKillCount((current) => Math.max(current, current + 1));
        }
        if (message.targetId === localRoomPlayerIdRef.current) {
          if (roomDamageEventIdsRef.current.has(eventId)) return;
          roomDamageEventIdsRef.current.add(eventId);
          if (message.killed || message.weapon === 'rocket' || message.weapon === 'collision') {
            playerApiRef.current?.crash?.(1.35, { selfCrash: false });
          } else {
            playerApiRef.current?.hitByBullet?.();
          }
        } else if (message.targetId) {
          replaceRemotePlayerStates((current) => {
            const target = current[message.targetId];
            if (!target) return current;
            return {
              ...current,
              [message.targetId]: {
                ...target,
                state: {
                  ...target.state,
                  damage: message.damage,
                  crashed: Boolean(message.killed),
                  thrust: message.killed ? 0 : target.state?.thrust,
                  throttle: message.killed ? 0 : target.state?.throttle,
                },
              },
            };
          });
        }
      }
      if (message.type === 'player_crashed' && message.playerId && message.playerId !== localRoomPlayerIdRef.current) {
        replaceRemotePlayerStates((current) => {
          const target = current[message.playerId];
          if (!target) return current;
          return {
            ...current,
            [message.playerId]: {
              ...target,
              state: {
                ...target.state,
                crashed: true,
                damage: 2,
                thrust: 0,
                throttle: 0,
              },
            },
          };
        });
      }
      if (message.type === 'player_left') {
        const playerName = `${message.playerName || 'A player'}`.trim() || 'A player';
        pushRoomNotification(`${playerName} left the room`);
      }
      if (message.type === 'weather_state') {
        if (Number.isFinite(message.serverNow)) {
          roomServerTimeOffsetRef.current = message.serverNow - Date.now();
        }
        const nextWeatherState = {
          fog: Boolean(message.fog),
          rain: Boolean(message.rain),
        };
        setFogActive(nextWeatherState.fog);
        setRainActive(nextWeatherState.rain);
        if (message.weather?.seed && Number.isFinite(Number(message.weather.startedAt))) {
          setRoomLobby((current) => {
            if (!current?.code) return current;
            return {
              ...current,
              serverNow: message.serverNow,
              weather: {
                ...message.weather,
                state: nextWeatherState,
              },
            };
          });
        }
      }
      if (message.type === 'room_deleted') {
        roomSessionRef.current = null;
        try {
          window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
        } catch {
          // Session storage can be disabled by the browser.
        }
        setRoomLobby(null);
        setRoomMutedPlayers({});
        replaceRemotePlayerStates({});
        replaceRemoteProjectiles([]);
        clearRoomNotifications();
        setRoomError('Room was deleted by the host.');
        setStartScreen('room');
      }
      if (message.type === 'room_left') {
        roomSessionRef.current = null;
        try {
          window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
        } catch {
          // Session storage can be disabled by the browser.
        }
        setRoomLobby(null);
        setRoomMutedPlayers({});
        replaceRemotePlayerStates({});
        replaceRemoteProjectiles([]);
        clearRoomNotifications();
        setStartScreen('room');
      }
      if (message.type === 'room_error') {
        setRoomError(message.message || 'Room error.');
        if (/session expired|room not found/i.test(message.message || '')) {
          roomSessionRef.current = null;
          try {
            window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
          } catch {
            // Session storage can be disabled by the browser.
          }
          setRoomConnectionStatus('idle');
        }
      }
    });
    socket.addEventListener('close', () => {
      const ownsSocket = roomSocketRef.current === socket;
      if (ownsSocket) {
        roomSocketRef.current = null;
      }
      if (ownsSocket) {
        const canReconnect = settled && !intentionalRoomDisconnectRef.current && Boolean(roomSessionRef.current);
        setRoomConnectionStatus(canReconnect ? 'reconnecting' : 'idle');
        setRoomPingMs(null);
        pendingRoomPingSentAtRef.current = 0;
      }
      if (!settled) {
        reject(new Error('Could not connect to multiplayer server.'));
      }
    });
    socket.addEventListener('error', () => {
      if (!settled) setRoomConnectionStatus('idle');
      setRoomPingMs(null);
      pendingRoomPingSentAtRef.current = 0;
      if (!settled) {
        reject(new Error('Could not connect to multiplayer server.'));
      }
    });
  }), [applyAuthoritativeRoomSnapshot, applyServerRoomState, clearRoomNotifications, handleVoiceSignal, localRoomPlayerId, pushRoomNotification, replaceRemotePlayerStates, replaceRemoteProjectiles, startGame, updateRemotePlayerState]);
  useEffect(() => {
    if (!roomRedirectRequest) return undefined;
    const request = roomRedirectRequest;
    setRoomRedirectRequest(null);
    let cancelled = false;
    intentionalRoomDisconnectRef.current = false;

    const followRoute = async () => {
      try {
        const socket = await connectRoomSocket(request.wsUrl, {
          restoringSession: request.action.type === 'resume_room',
        });
        if (cancelled || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(request.action));
      } catch {
        if (!cancelled) {
          setRoomError('Could not reach the room server. Please try again.');
          setRoomConnectionStatus('idle');
        }
      }
    };
    void followRoute();
    return () => {
      cancelled = true;
    };
  }, [connectRoomSocket, roomRedirectRequest]);
  useEffect(() => {
    if (roomConnectionStatus !== 'reconnecting') return undefined;
    if (!MULTIPLAYER_WS_URL) return undefined;
    const session = roomSessionRef.current;
    if (!session?.roomCode || !session?.resumeToken) {
      setRoomConnectionStatus('idle');
      return undefined;
    }
    const attempt = roomReconnectAttemptsRef.current;
    const delay = Math.min(ROOM_RECONNECT_MAX_DELAY_MS, ROOM_RECONNECT_BASE_DELAY_MS * (2 ** attempt));
    roomReconnectTimerRef.current = window.setTimeout(async () => {
      roomReconnectTimerRef.current = 0;
      roomReconnectAttemptsRef.current += 1;
      intentionalRoomDisconnectRef.current = false;
      try {
        const socket = await connectRoomSocket(session.serverUrl || MULTIPLAYER_WS_URL, { restoringSession: true });
        const action = {
          type: 'resume_room',
          code: session.roomCode,
          resumeToken: session.resumeToken,
        };
        pendingRoomActionRef.current = action;
        socket.send(JSON.stringify(action));
      } catch {
        setRoomConnectionStatus('reconnecting');
      }
    }, delay);
    return () => {
      if (roomReconnectTimerRef.current) {
        window.clearTimeout(roomReconnectTimerRef.current);
        roomReconnectTimerRef.current = 0;
      }
    };
  }, [connectRoomSocket, roomConnectionStatus]);
  useEffect(() => {
    if (MULTIPLAYER_WS_URL && roomConnectionStatus === 'idle' && roomSessionRef.current && !intentionalRoomDisconnectRef.current) {
      setRoomConnectionStatus('reconnecting');
    }
  }, [roomConnectionStatus]);
  const pauseGame = useCallback(() => {
    if (!gameStarted || (gameMode === 'training' && training.blocking)) return;
    setPaused((current) => !current);
  }, [gameStarted, gameMode, training.blocking]);
  const armBotStart = useCallback(() => {
    startDefaultMusic();
    setGameMode('bots');
    setStartScreen('bot-ready');
    setMusicOpen(false);
    setHelpOpen(false);
    setPlaneMenuOpen(false);
  }, [startDefaultMusic]);
  const armTrainingStart = () => {
    startDefaultMusic(); setGameMode('training'); setGameStarted(true); setStartScreen('home');
    setMusicOpen(false);setHelpOpen(false);setPlaneMenuOpen(false);setSettingsOpen(false);
    training.resume();
  };
  const createRoomLobby = useCallback(async () => {
    setRoomError('');
    setKillCount(0);
    setRoomMutedPlayers({});
    intentionalRoomDisconnectRef.current = false;
    roomReconnectAttemptsRef.current = 0;
    const micEnabled = roomVoiceEnabled;

    if (MULTIPLAYER_WS_URL) {
      try {
        const endpoint = await selectCreateRoomEndpoint();
        const socket = await connectRoomSocket(endpoint);
        const action = {
          type: 'create_room',
          name: roomPlayerName,
          theme: roomTheme,
          micEnabled,
          speakerEnabled: roomSpeakerEnabled,
        };
        pendingRoomActionRef.current = action;
        socket.send(JSON.stringify(action));
      } catch (error) {
        setRoomError(error.message);
      }
      return;
    }

    const localLobby = createLocalRoomLobby(roomPlayerName, roomTheme);
    localLobby.players[0].micEnabled = micEnabled;
    setPlaneColor(localLobby.players[0].color);
    setLocalRoomPlayerId('host');
    setRoomLobby(localLobby);
    setStartScreen('room-waiting');
  }, [connectRoomSocket, roomPlayerName, roomSpeakerEnabled, roomTheme, roomVoiceEnabled]);
  const joinRoomLobby = useCallback(async () => {
    setRoomError('');
    intentionalRoomDisconnectRef.current = false;
    roomReconnectAttemptsRef.current = 0;
    if (!roomCode.trim()) {
      setRoomError('Enter a room code.');
      return;
    }

    if (!MULTIPLAYER_WS_URL) {
      setRoomError('Multiplayer server is not connected yet.');
      return;
    }

    try {
      const micEnabled = roomVoiceEnabled;
      const socket = await connectRoomSocket();
      const action = {
        type: 'join_room',
        code: roomCode,
        name: roomPlayerName,
        micEnabled,
        speakerEnabled: roomSpeakerEnabled,
      };
      pendingRoomActionRef.current = action;
      socket.send(JSON.stringify(action));
    } catch (error) {
      setRoomError(error.message);
    }
  }, [connectRoomSocket, roomCode, roomPlayerName, roomSpeakerEnabled, roomVoiceEnabled]);
  const leaveRoomLobby = useCallback(() => {
    if (sendRoomMessage({ type: 'leave_room' })) {
      disconnectRoomSocket();
      disconnectRoomVoice();
      setRoomLobby(null);
      setRoomMutedPlayers({});
      clearRoomNotifications();
      setStartScreen('room');
      return;
    }

    if (!roomLobby) {
      setStartScreen('room');
      return;
    }

    const remainingPlayers = roomLobby.players.filter((player) => player.id !== 'host');
    if (!remainingPlayers.length) {
      setRoomLobby(null);
      clearRoomNotifications();
      setStartScreen('room');
      return;
    }

    const nextHost = remainingPlayers[Math.floor(Math.random() * remainingPlayers.length)];
    const nextPlayers = [
      { ...nextHost, role: 'Host' },
      ...remainingPlayers
        .filter((player) => player.id !== nextHost.id)
        .map((player) => ({ ...player, role: 'Player' })),
    ];
    setRoomLobby({ ...roomLobby, players: nextPlayers });
    clearRoomNotifications();
    setStartScreen('room');
  }, [clearRoomNotifications, disconnectRoomSocket, disconnectRoomVoice, roomLobby, sendRoomMessage]);
  const deleteRoomLobby = useCallback(() => {
    if (sendRoomMessage({ type: 'delete_room' })) {
      disconnectRoomSocket();
      disconnectRoomVoice();
    }
    setRoomLobby(null);
    setRoomMutedPlayers({});
    clearRoomNotifications();
    setStartScreen('room');
  }, [clearRoomNotifications, disconnectRoomSocket, disconnectRoomVoice, sendRoomMessage]);
  const applyRoomTheme = useCallback((nextTheme) => {
    setRoomTheme(nextTheme);
    setTheme(nextTheme);
    sendRoomMessage({ type: 'update_room_settings', theme: nextTheme });
  }, [sendRoomMessage]);
  const toggleRoomVoice = useCallback(async () => {
    if (roomVoiceEnabled) {
      roomVoiceEnabledRef.current = false;
      const liveKitRoom = liveKitRoomRef.current;
      if (liveKitRoom) {
        await liveKitRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        stopLocalVoiceMeter();
      } else {
        unpublishLocalVoiceTrack();
      }
      setRoomVoiceEnabled(false);
      sendRoomMessage({
        type: 'update_audio_settings',
        micEnabled: false,
        speakerEnabled: roomSpeakerEnabled,
      });
      return;
    }

    const liveKitRoom = liveKitRoomRef.current;
    if (liveKitRoom) {
      roomVoiceEnabledRef.current = true;
      setRoomVoiceEnabled(true);
      try {
        await liveKitRoom.localParticipant.setMicrophoneEnabled(true);
        const localTrack = liveKitRoom.localParticipant
          .getTrackPublication('microphone')
          ?.track?.mediaStreamTrack;
        if (localTrack) startLocalVoiceMeter(localTrack);
      } catch (error) {
        roomVoiceEnabledRef.current = false;
        setRoomVoiceEnabled(false);
        setVoiceStatus('error');
        setRoomError(error.message);
        return;
      }
      sendRoomMessage({
        type: 'update_audio_settings',
        micEnabled: true,
        speakerEnabled: roomSpeakerEnabled,
      });
      return;
    }

    const micAllowed = await requestMicrophonePermission();
    if (!micAllowed) return;
    roomVoiceEnabledRef.current = true;
    setRoomVoiceEnabled(true);
    try {
      await publishLocalVoiceTrack();
    } catch (error) {
      roomVoiceEnabledRef.current = false;
      setRoomVoiceEnabled(false);
      setVoiceStatus('error');
      setRoomError(error.message);
      return;
    }
    sendRoomMessage({
      type: 'update_audio_settings',
      micEnabled: true,
      speakerEnabled: roomSpeakerEnabled,
    });
  }, [publishLocalVoiceTrack, requestMicrophonePermission, roomSpeakerEnabled, roomVoiceEnabled, sendRoomMessage, startLocalVoiceMeter, stopLocalVoiceMeter, unpublishLocalVoiceTrack]);
  const toggleRoomSpeaker = useCallback(() => {
    setRoomSpeakerEnabled((enabled) => {
      const nextEnabled = !enabled;
      sendRoomMessage({
        type: 'update_audio_settings',
        micEnabled: roomVoiceEnabled,
        speakerEnabled: nextEnabled,
      });
      if (nextEnabled) {
        window.setTimeout(unlockRoomAudio, 0);
      }
      return nextEnabled;
    });
  }, [roomVoiceEnabled, sendRoomMessage, unlockRoomAudio]);
  const updateCamera = useCallback((camera) => {
    sceneryCameraRef.current.set(camera);
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${-camera.x}vw, ${camera.y}vh)`;
    }
    const mapX = Math.max(2, Math.min(98, ((camera.x + 50) / WORLD_WIDTH) * 100));
    if (mapDotRef.current) {
      mapDotRef.current.style.left = `${mapX}%`;
      mapDotRef.current.style.top = `${Math.max(2, Math.min(98, 100 - ((camera.y + 50) / WORLD_HEIGHT) * 100))}%`;
    }
    if (mapPointerRef.current) {
      const maxCameraX = WORLD_WIDTH - 100;
      const leftDistance = camera.x;
      const rightDistance = maxCameraX - camera.x;
      mapPointerRef.current.classList.toggle('map-edge-left-warning', leftDistance <= 86);
      mapPointerRef.current.classList.toggle('map-edge-right-warning', rightDistance <= 86);
      mapPointerRef.current.classList.toggle('map-edge-critical', leftDistance <= 18 || rightDistance <= 18);
    }
  }, []);
  const updateFuelGauge = useCallback((fuelLevel) => {
    if (!fuelGaugeRef.current) return;
    const level = clamp(fuelLevel, 0, 1);
    const sweepPosition = level * FUEL_GAUGE_SWEEP;
    const zone = Math.min(3, Math.max(0, Math.floor(sweepPosition / FUEL_GAUGE_ZONE_SIZE)));
    fuelGaugeRef.current.style.setProperty('--fuel-level', level);
    fuelGaugeRef.current.style.setProperty('--fuel-angle', `${FUEL_GAUGE_EMPTY_ANGLE + sweepPosition}deg`);
    fuelGaugeRef.current.classList.toggle('fuel-gauge-low', zone === 0);
    fuelGaugeRef.current.classList.remove('fuel-zone-0', 'fuel-zone-1', 'fuel-zone-2', 'fuel-zone-3');
    fuelGaugeRef.current.classList.add(`fuel-zone-${zone}`);
  }, []);
  const triggerFuelRefillFeedback = useCallback((stationIndex) => {
    setFuelStationPulses((current) => ({ ...current, [stationIndex]: Date.now() }));
    if (fuelGaugeRef.current) {
      fuelGaugeRef.current.classList.remove('fuel-gauge-refill-pulse');
      void fuelGaugeRef.current.offsetWidth;
      fuelGaugeRef.current.classList.add('fuel-gauge-refill-pulse');
    }
    const stationTimeoutId = window.setTimeout(() => {
      setFuelStationPulses((current) => {
        const next = { ...current };
        delete next[stationIndex];
        return next;
      });
      fuelPulseTimersRef.current = fuelPulseTimersRef.current.filter((timeout) => timeout !== stationTimeoutId);
    }, 1000);
    const meterTimeoutId = window.setTimeout(() => {
      fuelGaugeRef.current?.classList.remove('fuel-gauge-refill-pulse');
      fuelPulseTimersRef.current = fuelPulseTimersRef.current.filter((timeout) => timeout !== meterTimeoutId);
    }, 2000);
    fuelPulseTimersRef.current.push(stationTimeoutId, meterTimeoutId);
  }, []);
  const updateTrainingFlight = useCallback(plane => {
    if(gameMode === 'training' && gameStarted && !paused) training.observe(plane);
  },[gameMode,gameStarted,paused,training.observe]);
  const handleTrainingSafeLanding = useCallback(() => {
    if(gameMode === 'training') training.event('land');
  },[gameMode,training.event]);
  const handleFuelRefill = useCallback(index => {
    triggerFuelRefillFeedback(index);
    if(gameMode === 'training') training.event('refuel');
  },[gameMode,training.event,triggerFuelRefillFeedback]);
  const handleTrainingWeaponFired = useCallback(weapon => {
    if (weapon === 'rocket') rocketHint.learned();
    if(gameMode === 'training') training.event('shot',{weapon});
  },[gameMode,training.event,rocketHint.learned]);
  const handleTrainingTargetHit = useCallback((id,weapon) => {
    if(gameMode === 'training') training.hit(id,weapon);
  },[gameMode,training.hit]);
  const updateAmmoStatus = useCallback((nextStatus) => {
    if(gameMode === 'training') training.event('ammo',nextStatus);
    setAmmoStatus((current) =>
      current.count === nextStatus.count && current.reloading === nextStatus.reloading ? current : nextStatus,
    );
  }, [gameMode,training.event]);
  const updateRocketStatus = useCallback((nextCount) => {
    setRocketCount((current) => (current === nextCount ? current : nextCount));
  }, []);
  const sendRoomProjectile = useCallback((weapon) => {
    // The server owns every room projectile. Bullets are driven by held-fire
    // input; rocket presses are one explicit, sequenced action.
    if (weapon === 'rocket') sendRoomInput({ fireRocket: true });
  }, [sendRoomInput]);
  const recordPlayerKill = useCallback(() => {
    setKillCount((current) => {
      const next = current + 1;
      setHighScore((currentHighScore) => {
        const nextHighScore = Math.max(currentHighScore, next);
        if (nextHighScore !== currentHighScore) {
          try {
            window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(nextHighScore));
          } catch {
            // Local storage can be unavailable in private or restricted browser modes.
          }
        }
        return nextHighScore;
      });
      return next;
    });
  }, []);
  const resetCurrentKills = useCallback((options = {}) => {
    if (gameMode === 'room') return;
    setKillCount(0);
  }, [gameMode]);
  const toggleRoomPlayerMute = useCallback((playerId) => {
    setRoomMutedPlayers((current) => ({ ...current, [playerId]: !current[playerId] }));
  }, []);
  const restartGame = useCallback(() => {
    musicPlayerRef.current.restart();
    disconnectRoomSocket();
    setGameStarted(false);
    setPaused(false);
    setStartScreen('home');
    setGameMode('bots');
    resetTrainingProgress();
    setRoomLobby(null);
    setRoomMutedPlayers({});
    clearRoomNotifications();
    setMusicOpen(false);
    setHelpOpen(false);
    setPlaneMenuOpen(false);
    setDroppings([]);
    setKillCount(0);
    setFuelStationPulses({});
    fuelPulseTimersRef.current.forEach((timeout) => window.clearTimeout(timeout));
    fuelPulseTimersRef.current = [];
    fuelGaugeRef.current?.classList.remove('fuel-gauge-refill-pulse');
    setAmmoStatus({ count: MAX_BULLETS, reloading: false });
    setRocketCount(MAX_ROCKETS);
    playerStateRef.current = createInitialPlaneState(START_X, soloGameRules.fuelSeconds);
    botStateRefs.current = createInitialBotStates(botStateRefs.current, MAX_SOLO_BOTS);
    botStateRefs.current.forEach((botState, index) => {
      const dot = mapBotDotRefs.current[index];
      if (!dot) return;
      dot.style.left = `${Math.max(2, Math.min(98, (botState.x / WORLD_WIDTH) * 100))}%`;
      dot.style.top = `${Math.max(2, Math.min(98, 100 - (50 / WORLD_HEIGHT) * 100))}%`;
      dot.classList.remove('map-bot-dot-active');
    });
    updateCamera({ x: getCameraX(START_X), y: getCameraY(0) });
    updateFuelGauge(1);
    setRestartSignal((signal) => signal + 1);
  }, [clearRoomNotifications, disconnectRoomSocket, resetTrainingProgress, soloGameRules.fuelSeconds, updateCamera, updateFuelGauge]);
  const updatePlayerState = useCallback((nextState) => {
    playerStateRef.current = nextState;
    updateTrainingFlight(nextState);
  }, [updateTrainingFlight]);
  const updateBotLocator = useCallback((botIndex, botState) => {
    botStateRefs.current[botIndex] = botState;
    const dot = mapBotDotRefs.current[botIndex];
    if (!dot) return;
    dot.style.left = `${Math.max(2, Math.min(98, (botState.x / WORLD_WIDTH) * 100))}%`;
    dot.style.top = `${Math.max(2, Math.min(98, 100 - ((botState.y + 50) / WORLD_HEIGHT) * 100))}%`;
    dot.classList.toggle('map-bot-dot-active', gameMode === 'bots' && gameStarted && Boolean(botState.engaged));
  }, [gameMode, gameStarted]);
  const addDropping = useCallback((x) => {
    const id = `${Date.now()}-${Math.random()}`;
    setDroppings((items) => [...items, { id, x }]);
    window.setTimeout(() => {
      setDroppings((items) => items.filter((item) => item.id !== id));
    }, 15000);
  }, []);

  const playTrack = useCallback((track) => {
    void musicPlayerRef.current.toggle(track);
  }, []);

  const updateMusicVolume = useCallback((event) => {
    const nextVolume = Number(event.target.value) / 100;
    setMusicVolume(nextVolume);
    musicPlayerRef.current.setVolume(nextVolume);
  }, []);

  const updateSoundLevel = useCallback((kind, event) => {
    const nextLevel = Number(event.target.value) / 100;
    setSoundLevels((levels) => kind === 'combat' ? { ...levels, ammo: nextLevel, rocket: nextLevel, explosion: nextLevel } : { ...levels, [kind]: nextLevel });
    playFlightDeckTick(sfxMuted, effectsVolume);
  }, [sfxMuted, effectsVolume]);

  const updatePlaneLightIntensity = useCallback((event) => {
    setPlaneLightIntensity(Number(event.target.value) / 100);
    playFlightDeckTick(sfxMuted, effectsVolume);
  }, [sfxMuted, effectsVolume]);

  const updateSoloGameRule = useCallback((key, event) => {
    const value = Number(event.target.value);
    setSoloGameRules((current) => createSoloGameRules({ ...current, [key]: value }));
    playFlightDeckTick(sfxMuted, effectsVolume);
  }, [sfxMuted, effectsVolume]);

  const resetSoloGameRules = useCallback(() => {
    setSoloGameRules(createSoloGameRules());
    playFlightDeckTick(sfxMuted, effectsVolume);
  }, [sfxMuted, effectsVolume]);

  const openFieldGuide = useCallback(() => {
    setFieldGuidePage(0);
    setFieldGuideTurnDirection('next');
    setFieldGuideTurnKey((key) => key + 1);
    setFieldGuideOpen(true);
    setSettingsOpen(false);
  }, []);

  const turnFieldGuidePage = useCallback((direction) => {
    const nextPage = fieldGuidePage + direction;
    if (nextPage < 0 || nextPage >= FIELD_GUIDE_PAGE_COUNT) return;
    setFieldGuideTurnDirection(direction > 0 ? 'next' : 'previous');
    setFieldGuidePage(nextPage);
    setFieldGuideTurnKey((key) => key + 1);
  }, [fieldGuidePage]);

  useEffect(() => () => {
    fuelPulseTimersRef.current.forEach((timeout) => window.clearTimeout(timeout));
    roomNotificationTimersRef.current.forEach((timeout) => window.clearTimeout(timeout));
    window.clearTimeout(rainSoundStartTimerRef.current);
    rainAudioRef.current?.stop();
    rainAudioRef.current = null;
    musicPlayerRef.current.dispose();
  }, []);

  useEffect(() => {
    localRoomPlayerIdRef.current = localRoomPlayerId;
  }, [localRoomPlayerId]);

  useEffect(() => {
    roomVoiceEnabledRef.current = roomVoiceEnabled;
  }, [roomVoiceEnabled]);

  useEffect(() => {
    roomSpeakerEnabledRef.current = roomSpeakerEnabled;
  }, [roomSpeakerEnabled]);

  useEffect(() => {
    roomMutedPlayersRef.current = roomMutedPlayers;
  }, [roomMutedPlayers]);

  useEffect(() => {
    voiceLevelsRef.current = voiceLevels;
  }, [voiceLevels]);

  useEffect(() => {
    let stopped = false;
    const timers = shootingStarTimersRef.current;

    const scheduleShootingStar = () => {
      const spawnTimer = window.setTimeout(() => {
        if (stopped) return;
        const duration = 1200 + Math.random() * 620;
        const id = `${Date.now()}-${Math.random()}`;
        setShootingStars((items) => [
          ...items.slice(-3),
          {
            id,
            x: 4 + Math.random() * 68,
            y: 7 + Math.random() * 34,
            dx: 32,
            dy: 12,
            angle: 21,
            scale: 0.75 + Math.random() * 0.55,
            duration,
          },
        ]);
        const removeTimer = window.setTimeout(() => {
          setShootingStars((items) => items.filter((item) => item.id !== id));
        }, duration + 120);
        timers.push(removeTimer);
        scheduleShootingStar();
      }, 900 + Math.random() * 3300);
      timers.push(spawnTimer);
    };

    scheduleShootingStar();
    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      shootingStarTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (roomLobby?.weather && roomConnectionStatus !== 'connected') {
      const updateSyncedWeather = () => {
        const serverNow = Date.now() + roomServerTimeOffsetRef.current;
        const nextWeather = getSyncedRoomWeather(roomLobby.weather, serverNow);
        setFogActive(nextWeather.fog);
        setRainActive(nextWeather.rain);
      };
      updateSyncedWeather();
      const interval = window.setInterval(updateSyncedWeather, ROOM_WEATHER_TICK_MS);
      return () => window.clearInterval(interval);
    }

    return undefined;
  }, [roomConnectionStatus, roomLobby?.weather?.seed, roomLobby?.weather?.startedAt]);

  useEffect(() => {
    if (roomLobby?.weather) return;
    setFogActive(false); setRainActive(false); setFogAnimationsPaused(true);
    if (!gameStarted) return;
    if (trainingWeatherLessonActive) {
      setFogActive(true); setRainActive(true); setFogAnimationsPaused(false);
      return;
    }
    const cycle = createWeatherCycle(gameMode === 'training' ? 0 : soloGameRules.weatherMode);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(250, now - last); last = now;
      if (weatherPausedRef.current) return;
      const weather = cycle.advance(elapsed);
      setFogActive(weather.fog); setRainActive(weather.rain);
    }, 100);
    return () => window.clearInterval(timer);
  }, [gameMode, gameStarted, restartSignal, roomLobby?.weather, trainingWeatherLessonActive, soloGameRules.weatherMode]);

  useEffect(() => {
    window.clearTimeout(rainSoundStartTimerRef.current);
    rainSoundStartTimerRef.current = 0;
    if (!rainActive || sfxMuted || paused) {
      rainAudioRef.current?.stop();
      rainAudioRef.current = null;
      return;
    }

    rainSoundStartTimerRef.current = window.setTimeout(() => {
      if (!rainAudioRef.current) {
        rainAudioRef.current = createRainAudio();
      }
      const rainAudio = rainAudioRef.current;
      if (!rainAudio) return;
      resumeGameAudio(rainAudio.context);
      const t = rainAudio.context.currentTime;
      rainAudio.gain.cancelScheduledValues(t);
      rainAudio.gain.setTargetAtTime(0.105 * effectiveSoundLevels.rain, t, 0.38);
    }, 850);

    return () => {
      window.clearTimeout(rainSoundStartTimerRef.current);
      rainSoundStartTimerRef.current = 0;
    };
  }, [rainActive, sfxMuted, paused, effectiveSoundLevels.rain]);

  useEffect(() => {
    const resumeFromPause = (event) => {
      if (!paused || event.code !== 'Space' || (gameMode === 'training' && training.blocking)) return;
      event.preventDefault();
      event.stopPropagation();
      setPaused(false);
    };

    window.addEventListener('keydown', resumeFromPause, true);
    return () => window.removeEventListener('keydown', resumeFromPause, true);
  }, [paused,gameMode,training.blocking]);

  useEffect(() => () => {
    disconnectRoomSocket();
    disconnectRoomVoice();
  }, [disconnectRoomSocket, disconnectRoomVoice]);

  useEffect(() => {
    if (!roomLobby?.code || !localRoomPlayerId) {
      disconnectRoomVoice();
      return;
    }
    connectRoomVoice();
  }, [connectRoomVoice, disconnectRoomVoice, localRoomPlayerId, roomLobby?.code]);

  useEffect(() => {
    let cancelled = false;
    if (!roomLobby?.code || !localRoomPlayerId) return undefined;
    if (voiceProviderRef.current !== 'webrtc') return undefined;
    if (!roomVoiceEnabled) {
      unpublishLocalVoiceTrack();
      return undefined;
    }
    publishLocalVoiceTrack().catch((error) => {
      if (cancelled) return;
      roomVoiceEnabledRef.current = false;
      setRoomVoiceEnabled(false);
      setVoiceStatus('error');
      setRoomError(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [localRoomPlayerId, publishLocalVoiceTrack, roomLobby?.code, roomVoiceEnabled, unpublishLocalVoiceTrack]);

  useEffect(() => {
    setRemoteAudioMuted(!roomSpeakerEnabled);
  }, [roomMutedPlayers, roomSpeakerEnabled, setRemoteAudioMuted]);

  useEffect(() => {
    const unlock = () => unlockRoomAudio();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [unlockRoomAudio]);

  const roomPlayers = roomLobby?.players ?? [];
  const roomSlots = Array.from({ length: ROOM_MAX_PLAYERS }, (_, index) => roomPlayers[index] ?? null);
  const roomIsHost = roomLobby?.hostId ? roomLobby.hostId === localRoomPlayerId : roomPlayers[0]?.id === 'host';
  const isRoomGame = gameStarted && gameMode === 'room';
  const roomConnectionMeta = getRoomConnectionMeta(roomConnectionStatus, roomPingMs);
  const isTrainingGame = gameStarted && gameMode === 'training';
  const trainingFuelLessonActive = isTrainingGame && training.view.index === 2 && training.view.status === 'active';
  const trainingWeaponsTargetActive = isTrainingGame && [3,4,5].includes(training.view.index) && training.view.status === 'active';
  const trainingWeatherCheckpointActive = isTrainingGame && [0,7].includes(training.view.index) && training.view.status === 'active';
  const roomEnvironment = roomLobby?.weather?.seed ? roomLobby.weather : null;
  const roomPlayerIndex = roomPlayers.findIndex((player) => player.id === localRoomPlayerId);
  const roomSpawnX = isRoomGame && roomPlayerIndex >= 0
    ? START_X + ROOM_SPAWN_OFFSETS[roomPlayerIndex % ROOM_SPAWN_OFFSETS.length]
    : START_X;
  const roomLeaderboardRows = (roomPlayers.length ? roomPlayers : [{ id: 'host', name: 'Player 1', color: planeColor, role: 'Host' }])
    .map((player) => {
      const isLocalPlayer = localRoomPlayerId ? player.id === localRoomPlayerId : player.id === 'host';
      const micEnabled = isLocalPlayer ? roomVoiceEnabled : player.micEnabled !== false;
      const speakerEnabled = isLocalPlayer ? roomSpeakerEnabled : roomSpeakerEnabled && !roomMutedPlayers[player.id];
      const voiceActivity = voiceLevels[player.id] ?? { speaking: false, level: 0 };
      const voiceLevel = voiceActivity.speaking ? voiceActivity.level : 0;
      return {
        ...player,
        kills: isLocalPlayer ? killCount : player.kills ?? 0,
        isLocalPlayer,
        micEnabled,
        speakerEnabled,
        speaking: micEnabled && voiceActivity.speaking,
        voiceLevel,
      };
    })
    .sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name));
  const remoteRoomPlanes = isRoomGame
    ? roomPlayers
      .filter((player) => player.id !== localRoomPlayerId)
    : [];

  return (
    <main className={`scene scene-${theme}${paused ? ' scene-paused' : ''}${roomLobby?.weather ? '' : soloGameRules.weatherMode === 2 ? ' weather-harsh' : ' weather-normal'}${isTrainingGame ? ' scene-training' : ''}`} aria-label="PixelPlanes game world">
      <div className="sky-gradient" />
      {roomNotifications.length > 0 && (
        <div className="room-notification-stack" aria-live="polite" aria-atomic="false">
          {roomNotifications.map((notification) => (
            <div key={notification.id} className="room-notification">
              {notification.message}
            </div>
          ))}
        </div>
      )}
      {isRoomGame && roomConnectionStatus !== 'connected' && (
        <div
          className={`room-recovery-banner room-recovery-${roomConnectionMeta.tone}`}
          role="status"
          aria-live="polite"
        >
          <span className="room-recovery-light" aria-hidden="true" />
          <span>
            <strong>{roomConnectionMeta.label}</strong>
            <small>{roomConnectionMeta.detail}</small>
          </span>
        </div>
      )}

      <button
        className={`pause-toggle${paused ? ' pause-toggle-active' : ''}`}
        type="button"
        aria-label="Pause game"
        aria-pressed={paused}
        aria-disabled={!gameStarted}
        onClick={pauseGame}
      >
        <span className="pause-button-icon" aria-hidden="true">
          <i />
          <i />
        </span>
      </button>
      <button
        className="restart-toggle"
        type="button"
        aria-label="Restart game"
        onClick={restartGame}
      >
        <img src="/assets/restart-icon.png" alt="" draggable="false" aria-hidden="true" />
      </button>
      <button
        className={`music-selector${musicOpen ? ' music-selector-open' : ''}${musicHintActive ? ' music-selector-hint' : ''}`}
        type="button"
        aria-label="Select background music"
        title="Choose a song, or click the playing song to stop it"
        aria-expanded={musicOpen}
        onClick={() => {
          setMusicHintActive(false);
          setMusicOpen((open) => !open);
          setHelpOpen(false);
          setSettingsOpen(false);
          setFieldGuideOpen(false);
          setPlaneMenuOpen(false);
        }}
      >
        <img src="/assets/music-note-icon-transparent.png" alt="" draggable="false" aria-hidden="true" />
      </button>
      <button
        className={`sfx-toggle${sfxMuted ? ' sfx-muted' : ''}`}
        type="button"
        aria-label={sfxMuted ? 'Unmute all audio' : 'Mute all audio'}
        aria-pressed={sfxMuted}
        onClick={() => setSfxMuted((muted) => !muted)}
      >
        <img src="/assets/sfx-speaker-icon.svg" alt="" draggable="false" aria-hidden="true" />
      </button>
      <button
        className={`pull-up-toggle${warningAudioEnabled ? '' : ' pull-up-muted'}`}
        type="button"
        aria-label="Pull-up warning sound"
        aria-pressed={warningAudioEnabled}
        title={warningAudioEnabled ? 'Pull-up sound on — click to mute' : 'Pull-up sound off — click to enable'}
        onClick={() => setWarningAudioEnabled(enabled => !enabled)}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 45 42H3Z" fill="#ff4545" stroke="#251b26" strokeWidth="3" strokeLinejoin="round"/><path d="M24 16v12" stroke="#fff4dd" strokeWidth="5"/><path d="M24 33v4" stroke="#fff4dd" strokeWidth="5"/></svg>
        {!warningAudioEnabled && <span className="pull-up-mute-slash" aria-hidden="true" />}
      </button>
      <button
        className={`help-toggle${helpOpen ? ' help-toggle-open' : ''}`}
        type="button"
        aria-label="Show quick controls"
        aria-expanded={helpOpen}
        onClick={() => {
          setHelpOpen((open) => !open);
          setMusicOpen(false);
          setSettingsOpen(false);
          setFieldGuideOpen(false);
          setPlaneMenuOpen(false);
        }}
      >
        <img src="/assets/help-question-icon.png" alt="" draggable="false" aria-hidden="true" />
      </button>
      <button
        className={`plane-selector${planeMenuOpen ? ' plane-selector-open' : ''}`}
        type="button"
        aria-label="Choose plane color"
        aria-expanded={planeMenuOpen}
        onClick={() => {
          setPlaneMenuOpen((open) => !open);
          setMusicOpen(false);
          setHelpOpen(false);
          setSettingsOpen(false);
          setFieldGuideOpen(false);
        }}
      >
        <img
          src={PLANE_COLOR_ASSETS[planeColor].staticSrc}
          alt=""
          draggable="false"
          aria-hidden="true"
          style={{ filter: PLANE_COLOR_ASSETS[planeColor].filter || 'none' }}
        />
      </button>
      {!isRoomGame && (
        <button
          className="theme-icon-toggle"
          type="button"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <img src="/assets/theme-lightbulb-icon.svg" alt="" draggable="false" aria-hidden="true" />
        </button>
      )}
      {!isRoomGame && gameMode !== 'training' && (
        <div className="score-panel" aria-label="Kill counter and high score">
          <div className="score-row">
            <span>Kills</span>
            <strong>{killCount}</strong>
          </div>
          <div className="score-row score-high">
            <span>High</span>
            <strong>{highScore}</strong>
          </div>
        </div>
      )}
      {isRoomGame && (
        <div className="room-leaderboard" aria-label="Room leaderboard">
          <div className="room-leaderboard-title">Leaderboard</div>
          {roomLeaderboardRows.map((player, index) => (
            <div key={player.id} className="room-leaderboard-row">
              <span className="room-rank">{index + 1}</span>
              <span className="room-board-name">{player.name}</span>
              <strong className="room-board-kills">{player.kills}</strong>
              {player.isLocalPlayer ? (
                <button
                  className={`room-board-control room-board-mic${player.micEnabled ? '' : ' room-board-muted'}`}
                  type="button"
                  aria-label={player.micEnabled ? 'Turn your microphone off' : 'Turn your microphone on'}
                  aria-pressed={player.micEnabled}
                  onClick={toggleRoomVoice}
                >
                  <RoomMicIcon className="room-board-mic-icon" />
                </button>
              ) : (
                <span className="room-board-control-spacer" aria-hidden="true" />
              )}
              <button
                className={`room-board-control room-board-speaker${player.speakerEnabled ? '' : ' room-board-muted'}`}
                type="button"
                aria-label={player.isLocalPlayer
                  ? player.speakerEnabled ? 'Mute all players' : 'Unmute all players'
                  : player.speakerEnabled ? `Mute ${player.name}` : `Unmute ${player.name}`}
                aria-pressed={player.speakerEnabled}
                onClick={() => {
                  if (player.isLocalPlayer) {
                    toggleRoomSpeaker();
                  } else {
                    toggleRoomPlayerMute(player.id);
                  }
                }}
              >
                <RoomSpeakerIcon className="room-board-speaker-icon" />
              </button>
              <span className={`room-voice-bars${player.speaking ? ' room-voice-speaking' : ''}`} aria-hidden="true">
                {[1, 2, 3].map((level) => (
                  <i key={level} className={level <= player.voiceLevel ? 'voice-bar-active' : ''} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {musicOpen && (
        <div className="music-panel" aria-label="Background music panel">
          <div className="music-track-grid">
            {MUSIC_TRACKS.map((track) => (
              <button
                key={track.id}
                className={`music-track-button${activeTrackId === track.id ? ' music-track-active' : ''}`}
                type="button"
                aria-label={`Song ${track.id}`}
                aria-pressed={activeTrackId === track.id}
                onClick={() => playTrack(track)}
              >
                {track.id}
              </button>
            ))}
          </div>
          <input
            className="music-volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(musicVolume * 100)}
            aria-label="Background music volume"
            onChange={updateMusicVolume}
          />
        </div>
      )}
      {helpOpen && (
        <div className="help-panel" aria-label="Quick controls">
          <h2 className="help-title">QUICK CONTROLS</h2>
          <div className="help-rule"><kbd>W</kbd><span>Thrust</span></div>
          <div className="help-rule"><kbd>A / D</kbd><span>Turn left / right</span></div>
          <div className="help-rule"><kbd>S</kbd><span>Slow down / land</span></div>
          <div className="help-rule"><kbd>Space</kbd><span>Hold to fire bullets</span></div>
          <div className="help-rule"><kbd>R</kbd><span>Hold to aim rocket<br />Release to launch</span></div>
          <div className="help-rule"><kbd>L</kbd><span>Toggle plane light</span></div>
          <div className="help-tips">
            <p>Green aiming dots = likely bullet hit.</p>
            <p>Land at a fuel station to refill &amp; repair.</p>
          </div>
        </div>
      )}
      {planeMenuOpen && (
        <div className="plane-color-panel" aria-label="Plane color options">
          {PLANE_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`plane-color-option plane-color-${option.id}${planeColor === option.id ? ' plane-color-active' : ''}`}
              type="button"
              aria-label={`${option.label} plane`}
              aria-pressed={planeColor === option.id}
              onClick={() => setPlaneColor(option.id)}
            >
              <img
                src={option.staticSrc}
                alt=""
                draggable="false"
                aria-hidden="true"
                style={{ filter: option.filter || 'none' }}
              />
            </button>
          ))}
          <div className="plane-light-options" aria-label="Plane blinking light options">
            {PLANE_LIGHT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`plane-light-option${planeLightCombo === option.id ? ' plane-light-active' : ''}`}
                type="button"
                aria-label={`${option.label} blinking lights`}
                aria-pressed={planeLightCombo === option.id}
                onClick={() => setPlaneLightCombo(option.id)}
              >
                <span className="plane-light-swatch" style={{ '--swatch-color': option.front }} aria-hidden="true" />
                <span className="plane-light-swatch" style={{ '--swatch-color': option.back }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
      {!gameStarted && (
        <div className="start-overlay" aria-label="Game start menu">
          <div className={`start-card${startScreen === 'bot-ready' || startScreen === 'training-ready' ? ' start-card-slim' : ''}${startScreen === 'room-waiting' ? ' start-card-room-lobby' : ''}`}>
            {startScreen === 'home' && (
              <>
                <div className="start-title">PixelPlanes</div>
                <div className="start-actions start-actions-home">
                  <button className="start-option start-primary" type="button" onClick={armBotStart}>
                    Start
                  </button>
                  <button className="start-option" type="button" onClick={armTrainingStart}>
                    Training
                  </button>
                  <button className="start-option start-room-unavailable" type="button" disabled title="Multiplayer rooms are coming soon">
                    <span>Room</span>
                    <span className="room-coming-soon">Coming soon</span>
                  </button>
                </div>
                <div className="start-utility-actions" aria-label="Game settings and information">
                  <button
                    className={`start-utility-button${settingsOpen ? ' start-utility-active' : ''}`}
                    type="button"
                    aria-label="Open sound and light settings"
                    aria-expanded={settingsOpen}
                    title="Settings"
                    onClick={() => {
                      setSettingsOpen((open) => !open);
                      setFieldGuideOpen(false);
                    }}
                  >
                    <span className="start-utility-glyph start-utility-gear" aria-hidden="true">⚙︎</span>
                  </button>
                  <button
                    className={`start-utility-button${fieldGuideOpen ? ' start-utility-active' : ''}`}
                    type="button"
                    aria-label="Open the PixelPlanes field guide"
                    aria-expanded={fieldGuideOpen}
                    title="Field guide"
                    onClick={() => {
                      if (fieldGuideOpen) {
                        setFieldGuideOpen(false);
                      } else {
                        openFieldGuide();
                      }
                    }}
                  >
                    <span className="start-utility-glyph start-utility-info" aria-hidden="true">i</span>
                  </button>
                </div>
              </>
            )}
            {startScreen === 'room' && (
              <>
                <div className="start-title">Room</div>
                <div className="start-actions">
                  <button className="start-option" type="button" onClick={() => setStartScreen('join')}>
                    Join
                  </button>
                  <button className="start-option start-primary" type="button" onClick={() => {
                    setRoomLobby(null);
                    setStartScreen('create');
                  }}>
                    Create
                  </button>
                </div>
                <button className="start-back" type="button" onClick={() => setStartScreen('home')}>
                  Back
                </button>
              </>
            )}
            {(startScreen === 'bot-ready' || startScreen === 'training-ready') && (
              <div className="bot-start-prompt">
                <span>{startScreen === 'training-ready' ? 'Hold' : 'Click'}</span>
                <kbd>W</kbd>
                <span>{startScreen === 'training-ready' ? 'or' : 'thrust or'}</span>
                <kbd>↑</kbd>
                <span>{startScreen === 'training-ready' ? 'to begin lesson 1' : 'to start'}</span>
              </div>
            )}
            {startScreen === 'join' && (
              <>
                <div className="start-title">Join Room</div>
                <div className="room-join-controls">
                  <input
                    className="room-code-input room-name-input"
                    value={roomPlayerName}
                    maxLength="14"
                    placeholder="YOUR NAME"
                    aria-label="Your name"
                    onChange={(event) => setRoomPlayerName(event.target.value)}
                  />
                  <input
                    className="room-code-input"
                    value={roomCode}
                    maxLength="8"
                    placeholder="CODE"
                    aria-label="Room code"
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  />
                </div>
                {(roomError || roomConnectionStatus === 'connecting' || roomConnectionStatus === 'reconnecting' || roomConnectionStatus === 'restoring') && (
                  <div className={`room-status-line${roomError ? ' room-status-error' : ''}`}>
                    {roomError || roomConnectionMeta.detail}
                  </div>
                )}
                <div className="start-actions start-actions-single">
                  <button className="start-option start-primary" type="button" onClick={joinRoomLobby}>
                    Join
                  </button>
                </div>
                <button className="start-back" type="button" onClick={() => setStartScreen('room')}>
                  Back
                </button>
              </>
            )}
            {startScreen === 'create' && (
              <>
                <div className="start-title">Create Room</div>
                <input
                  className="room-code-input room-name-input"
                  value={roomPlayerName}
                  maxLength="14"
                  placeholder="YOUR NAME"
                  aria-label="Your player name"
                  onChange={(event) => setRoomPlayerName(event.target.value)}
                />
                <div className="room-create-controls">
                  <div className={`room-theme-switch room-theme-${roomTheme}`} aria-label="Room theme">
                    <button
                      className={`room-rule-button${roomTheme === 'dark' ? ' room-rule-active' : ''}`}
                      type="button"
                      aria-pressed={roomTheme === 'dark'}
                      onClick={() => applyRoomTheme('dark')}
                    >
                      Dark
                    </button>
                    <button
                      className={`room-rule-button${roomTheme === 'light' ? ' room-rule-active' : ''}`}
                      type="button"
                      aria-pressed={roomTheme === 'light'}
                      onClick={() => applyRoomTheme('light')}
                    >
                      Light
                    </button>
                  </div>
                  <button className="start-option start-primary" type="button" onClick={createRoomLobby}>
                    Create
                  </button>
                </div>
                {(roomError || roomConnectionStatus === 'connecting' || roomConnectionStatus === 'reconnecting' || roomConnectionStatus === 'restoring') && (
                  <div className={`room-status-line${roomError ? ' room-status-error' : ''}`}>
                    {roomError || roomConnectionMeta.detail}
                  </div>
                )}
                <button className="start-back" type="button" onClick={() => setStartScreen('room')}>
                  Back
                </button>
              </>
            )}
            {startScreen === 'room-waiting' && roomLobby && (
              <>
                <div className="room-lobby-header">
                  <div>
                    <div className="start-title">Room</div>
                    <div className="room-subtitle">Waiting for players</div>
                  </div>
                  <div className="room-count-badge" aria-label={`${roomPlayers.length} of ${ROOM_MAX_PLAYERS} players`}>
                    {roomPlayers.length}/{ROOM_MAX_PLAYERS}
                  </div>
                </div>
                <div className="room-code-card" aria-label={`Room code ${roomLobby.code}`}>
                  <span>Code</span>
                  <strong>{roomLobby.code}</strong>
                </div>
                <div className="room-settings-row">
                  <div className={`room-theme-switch room-theme-switch-compact room-theme-${roomTheme}`} aria-label="Room theme">
                    <button
                      className={`room-rule-button${roomTheme === 'dark' ? ' room-rule-active' : ''}`}
                      type="button"
                      aria-pressed={roomTheme === 'dark'}
                      onClick={() => applyRoomTheme('dark')}
                    >
                      Dark
                    </button>
                    <button
                      className={`room-rule-button${roomTheme === 'light' ? ' room-rule-active' : ''}`}
                      type="button"
                      aria-pressed={roomTheme === 'light'}
                      onClick={() => applyRoomTheme('light')}
                    >
                      Light
                    </button>
                  </div>
                  <div className="room-audio-controls">
                    <button
                      className={`room-voice-toggle${roomVoiceEnabled ? ' room-voice-enabled' : ''}`}
                      type="button"
                      aria-pressed={roomVoiceEnabled}
                      aria-label={roomVoiceEnabled ? 'Microphone enabled' : 'Microphone disabled'}
                      onClick={toggleRoomVoice}
                    >
                      <span className="room-audio-icon-wrap">
                        <RoomMicIcon className="room-voice-icon" />
                      </span>
                      <span>{roomVoiceEnabled ? 'Mic On' : 'Mic Off'}</span>
                    </button>
                    <button
                      className={`room-voice-toggle room-voice-speaker${roomSpeakerEnabled ? ' room-voice-enabled' : ''}`}
                      type="button"
                      aria-pressed={roomSpeakerEnabled}
                      aria-label={roomSpeakerEnabled ? 'Speaker enabled' : 'Speaker disabled'}
                      onClick={toggleRoomSpeaker}
                    >
                      <span className="room-audio-icon-wrap">
                        <RoomSpeakerIcon className="room-speaker-icon" />
                      </span>
                      <span>{roomSpeakerEnabled ? 'Speaker On' : 'Speaker Off'}</span>
                    </button>
                  </div>
                </div>
                <div className="room-player-grid" aria-label="Room players">
                  {roomSlots.map((player, index) => {
                    const colorAsset = player ? PLANE_COLOR_ASSETS[player.color] : null;
                    return (
                      <div key={index} className={`room-player-slot${player ? ' room-player-filled' : ' room-player-empty'}`}>
                        {player ? (
                          <>
                            <img
                              src={colorAsset.staticSrc}
                              alt=""
                              draggable="false"
                              aria-hidden="true"
                              style={{ filter: colorAsset.filter || 'none' }}
                            />
                            <div className="room-player-copy">
                              <strong>{player.name}</strong>
                              <span>{player.role} - {colorAsset.label}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="room-empty-number">{index + 1}</span>
                            <span>Waiting</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="room-lobby-actions">
                  <div className={`room-lobby-admin-actions${roomIsHost ? '' : ' room-lobby-admin-actions-single'}`}>
                    <button className="start-option room-small-action" type="button" onClick={leaveRoomLobby}>
                      Leave
                    </button>
                    {roomIsHost && (
                      <button className="start-option room-small-action room-delete-button" type="button" onClick={deleteRoomLobby}>
                        Delete Room
                      </button>
                    )}
                  </div>
                  <button
                    className="start-option start-primary"
                    type="button"
                    disabled={!roomIsHost}
                    onClick={() => {
                      if (!sendRoomMessage({ type: 'start_room' })) {
                        setGameMode('room');
                        startGame();
                      }
                    }}
                  >
                    Start
                  </button>
                </div>
              </>
            )}
          </div>
          {settingsOpen && startScreen === 'home' && (
            <FlightDeck
              theme={theme} onTheme={setTheme}
              rules={soloGameRules} onRule={updateSoloGameRule} definitions={SOLO_GAME_CONTROL_DEFINITIONS}
              musicVolume={musicVolume} onMusic={updateMusicVolume}
              effectsVolume={effectsVolume} onEffects={e => setEffectsVolume(Number(e.target.value) / 100)}
              muted={sfxMuted} onMute={() => setSfxMuted(value => !value)}
              warningEnabled={warningAudioEnabled} onWarning={() => setWarningAudioEnabled(value => !value)}
              levels={soundLevels} onLevel={updateSoundLevel} light={planeLightIntensity} onLight={updatePlaneLightIntensity}
              onClose={() => setSettingsOpen(false)}
              onReset={() => {
                resetSoloGameRules(); setTheme('dark'); setSoundLevels({ engine: 0.09, ammo: 0.1, rocket: 0.1, explosion: 0.1, rain: 0.05 });
                setEffectsVolume(1); setSfxMuted(false); setWarningAudioEnabled(true); setPlaneLightIntensity(1);
                setMusicVolume(DEFAULT_MUSIC_VOLUME); musicPlayerRef.current.setVolume(DEFAULT_MUSIC_VOLUME);
              }}
            />
          )}
          {fieldGuideOpen && startScreen === 'home' && (
            <section className="start-utility-overlay field-guide-overlay" aria-label="PixelPlanes field guide">
              <FieldGuide
                page={fieldGuidePage}
                turnDirection={fieldGuideTurnDirection}
                turnKey={fieldGuideTurnKey}
                onClose={() => setFieldGuideOpen(false)}
                onTurn={turnFieldGuidePage}
              />
            </section>
          )}
        </div>
      )}
      {paused && !(isTrainingGame && training.blocking) && (
        <div className="pause-overlay" aria-label="Game paused">
          <div className="pause-center-icon" aria-hidden="true">
            <i />
            <i />
          </div>
        </div>
      )}
      {isTrainingGame && (
        <TrainingHud training={training} player={playerStateRef.current} paused={paused} onExit={restartGame}
          onSolo={() => {restartGame();armBotStart();}}
          onPracticeBot={() => {restartGame();setSoloGameRules(r=>createSoloGameRules({...r,botCount:1,botDifficulty:1}));armBotStart();}} />
      )}

      <div
        className="frame-rate-badge"
        aria-label={`Game is running at ${measuredFrameRate || 'measuring'} frames per second`}
      >
        <strong>{measuredFrameRate || '--'}</strong>
        <span>FPS</span>
      </div>
      <div
        className={`frame-rate-badge ping-badge ping-quality-${roomConnectionMeta.tone}`}
        aria-label={roomConnectionStatus !== 'connected'
          ? roomConnectionMeta.detail
          : roomPingMs == null
            ? 'Room ping is being measured'
            : `${roomConnectionMeta.label}: ${roomPingMs} milliseconds`}
      >
        <strong>{roomPingMs == null ? '--' : roomPingMs}</strong>
        <span>MS</span>
      </div>
      <div ref={mapPointerRef} className={`map-pointer${groundWarning ? ' map-ground-warning' : ''}`} aria-label="Map position">
        {fuelTankPlacements.map((x, index) => (
          <span
            key={index}
            className="map-fuel-dot"
            style={{
              left: `${Math.max(3, Math.min(97, (x / WORLD_WIDTH) * 100))}%`,
            }}
          />
        ))}
        <TrainingTargetMapDots
          active={trainingWeaponsTargetActive}
          targets={trainingTargetStatesRef.current}
          targetsRef={trainingTargetStatesRef}
          targetsVersion={trainingWeaponHits}
          registerGameFrameCallback={registerGameFrameCallback}
        />
        {trainingWeatherCheckpointActive && trainingWeatherCheckpoint && (
          <span
            className="map-training-checkpoint-dot"
            style={{
              left: `${Math.max(3, Math.min(97, (trainingWeatherCheckpoint.x / WORLD_WIDTH) * 100))}%`,
              top: `${Math.max(3, Math.min(97, 100 - ((trainingWeatherCheckpoint.y + 50) / WORLD_HEIGHT) * 100))}%`,
            }}
          />
        )}
        {gameMode === 'bots' && botStateRefs.current.slice(0, soloGameRules.botCount).map((botState, index) => (
          <span
            key={index}
            ref={(node) => {
              mapBotDotRefs.current[index] = node;
            }}
            className="map-bot-dot"
            style={{
              left: `${Math.max(2, Math.min(98, (botState.x / WORLD_WIDTH) * 100))}%`,
              top: `${Math.max(2, Math.min(98, 100 - (50 / WORLD_HEIGHT) * 100))}%`,
            }}
          />
        ))}
        {gameMode === 'room' && roomPlayers
          .filter((player) => player.id !== localRoomPlayerId)
          .map((player) => (
            <RoomPlayerMapDot
              key={player.id}
              playerId={player.id}
              statesRef={remotePlayerStatesRef}
              registerGameFrameCallback={registerGameFrameCallback}
            />
          ))}
        <span
          ref={mapDotRef}
          className="map-pointer-dot"
          style={{
            left: `${Math.max(2, Math.min(98, ((getCameraX(START_X) + 50) / WORLD_WIDTH) * 100))}%`,
            top: `${Math.max(2, Math.min(98, 100 - (50 / WORLD_HEIGHT) * 100))}%`,
          }}
        />
        {groundWarning && (
          <div className="ground-warning-overlay" role="alert" aria-label="Terrain warning: pull up">
            <span className="ground-warning-symbol" aria-hidden="true">⚠</span>
            <strong>PULL UP!</strong>
          </div>
        )}
      </div>
      <div className="combat-hud">
        <div
          ref={fuelGaugeRef}
          className="fuel-gauge fuel-zone-3"
          style={{
            '--fuel-level': 1,
            '--fuel-angle': '0deg',
          }}
          aria-label="Fuel meter"
        >
          <span className="fuel-gauge-arc">
            <span className="fuel-segment fuel-segment-red" />
            <span className="fuel-segment fuel-segment-orange" />
            <span className="fuel-segment fuel-segment-yellow" />
            <span className="fuel-segment fuel-segment-green" />
          </span>
          <span className="fuel-gauge-needle" />
          <span className="fuel-gauge-hub" />
        </div>
        <div className="combat-hud-weapons-column">
          <BulletMeter count={ammoStatus.count} reloading={ammoStatus.reloading} />
          <RocketMeter rocketCount={rocketCount} showHint={rocketHint.visible} />
        </div>
      </div>

      <div ref={worldRef} className="world" style={{ transform: `translate(${-getCameraX(START_X)}vw, 0vh)` }}>
        <div className="stars world-stars" aria-hidden="true">
          {stars.map((star) => (
            <i
              key={star.id}
              style={{
                left: `${star.x}vw`,
                bottom: `${star.y}vh`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: star.delay,
              }}
            />
          ))}
        </div>
        <div className="shooting-stars" aria-hidden="true">
          {shootingStars.map((star) => (
            <i
              key={star.id}
              className="shooting-star"
              style={{
                left: `${getCameraX(START_X) + star.x}vw`,
                bottom: `${58 + star.y}vh`,
                '--shooting-dx': `${star.dx}vw`,
                '--shooting-dy': `${star.dy}vh`,
                '--shooting-angle': `${star.angle}deg`,
                '--shooting-scale': star.scale,
                '--shooting-duration': `${star.duration}ms`,
              }}
            />
          ))}
        </div>

        {theme === 'light' && <div className="daylight-sun" style={{ left: `${getCameraX(START_X) + 58}vw` }} aria-hidden="true" />}
        <div className="moon" style={{ left: `${START_X + 38}vw` }} aria-hidden="true" />
        <div className="cloud-layer" aria-hidden="true">
          {clouds.map((cloud, index) => (
            <Cloud key={index} {...cloud} />
          ))}
        </div>
        <div
          className={`fog-layer${fogActive ? ' fog-layer-active' : ''}${fogAnimationsPaused ? ' fog-layer-idle' : ''}`}
          aria-hidden="true"
          onTransitionEnd={(event) => {
            if (event.propertyName === 'opacity' && !fogActive) setFogAnimationsPaused(true);
          }}
        >
          {fogBanks.map((fog, index) => (
            <span
              key={index}
              className="fog-bank"
              style={{
                left: `${fog.x}vw`,
                bottom: `${fog.y}vh`,
                '--fog-scale': fog.s,
                '--fog-opacity': fog.opacity,
                '--fog-speed': `${fog.speed}s`,
                animationDelay: fog.delay,
              }}
            />
          ))}
        </div>

        <ForestLayer className="forest forest-back" rows={980} cameraRef={sceneryCameraRef} />
        <ForestLayer className="forest forest-front" rows={820} cameraRef={sceneryCameraRef} />
        <div className="map-edge-light map-edge-left" aria-hidden="true" />
        <div className="map-edge-light map-edge-right" aria-hidden="true" />

        <div className="ground-band" aria-hidden="true">
          {theme === 'dark' && STREET_LAMP_POSITIONS.map(x => <StreetLamp key={x} x={x} />)}
          {hutPlacements.map((hut, index) => (
            <Hut key={index} className={`hut hut-${hut.variant}`} variant={hut.variant} style={{ left: `${hut.x}vw` }} />
          ))}
          {fuelTankPlacements.map((x, index) => (
            <FuelTank key={index} active={Boolean(fuelStationPulses[index])} style={{ left: `${x}vw` }} />
          ))}
          {trainingFuelLessonActive && fuelTankPlacements.filter(x=>x===286).map((x, index) => (
            <div key={`training-fuel-marker-${index}`} className="training-fuel-marker" style={{ left: `${x}vw` }} aria-hidden="true">
              <span>REFUEL</span>
              <i />
            </div>
          ))}
          <TrainingPracticeTargets
            active={trainingWeaponsTargetActive}
            targets={trainingTargetStatesRef.current}
            targetsRef={trainingTargetStatesRef}
            targetsVersion={trainingWeaponHits}
            paused={paused} sessionRef={training.session}
            registerGameFrameCallback={registerGameFrameCallback}
          />
          <TrainingFogCheckpoint active={trainingWeatherCheckpointActive} checkpoint={trainingWeatherCheckpoint} />
          {hayPlacements.map((hay, index) =>
            hay.type === 'bale' ? (
              <HayBale key={index} className="hay" style={{ left: `${hay.x}vw` }} />
            ) : (
              <RollingHay key={index} className="roll" style={{ left: `${hay.x}vw` }} />
            ),
          )}
          <PlayablePlane
            key={gameMode === 'training' ? `training-${training.attempt}` : 'normal'}
            trainingSpawn={gameMode === 'training' ? training.setup.current.spawn : null}
            onMove={updateCamera}
            onFuelChange={updateFuelGauge}
            onFuelRefill={handleFuelRefill}
            onSafeLanding={handleTrainingSafeLanding}
            onTrainingTargetHit={handleTrainingTargetHit}
            onTrainingWeaponFired={handleTrainingWeaponFired}
            onKill={recordPlayerKill}
            onPlayerDeath={resetCurrentKills}
            onAmmoChange={updateAmmoStatus}
            onRocketChange={updateRocketStatus}
            onPlaneState={updatePlayerState}
            onRoomProjectile={sendRoomProjectile}
            onRoomInput={sendRoomInput}
            authoritativeRoom={gameMode === 'room'}
            roomTargetStatesRef={remotePlayerStatesRef}
            trainingTargetStatesRef={trainingTargetStatesRef}
            playerApiRef={playerApiRef}
            botStateRefs={botStateRefs}
            botApiRefs={botApiRefs}
            botTargetsActive={gameMode === 'bots'}
            gameplayRules={gameMode === 'room' ? null : soloGameRules}
            controlsEnabled={gameStarted && !paused}
            paused={paused}
            spawnX={roomSpawnX}
            restartSignal={restartSignal}
            startArmed={startScreen === 'bot-ready' || startScreen === 'training-ready'}
            onPowerStart={startGame}
            planeColor={planeColor}
            planeLightCombo={planeLightCombo}
            sfxMuted={sfxMuted}
            audioSettings={effectiveSoundLevels}
            lightIntensity={planeLightIntensity}
            fogActive={fogActive}
            registerGameFrameCallback={registerGameFrameCallback}
          />
          {remoteRoomPlanes.map((player) => (
            <RemotePlane
              key={player.id}
              player={player}
              statesRef={remotePlayerStatesRef}
              sfxMuted={sfxMuted}
              audioSettings={effectiveSoundLevels}
              fogActive={fogActive}
              registerGameFrameCallback={registerGameFrameCallback}
            />
          ))}
          <RoomProjectilesLayer
            active={isRoomGame}
            projectiles={remoteProjectiles}
            projectilesRef={remoteProjectilesRef}
            projectileElementRefs={remoteProjectileElementRefs}
            replaceProjectiles={replaceRemoteProjectiles}
            playerStateRef={playerStateRef}
            registerGameFrameCallback={registerGameFrameCallback}
          />
          {gameMode === 'bots' && botStateRefs.current.map((_, index) => (
            <BotPlane
              key={index}
              botIndex={index}
              active={gameStarted && index < soloGameRules.botCount}
              paused={paused}
              restartSignal={restartSignal}
              playerStateRef={playerStateRef}
              playerApiRef={playerApiRef}
              botStateRefs={botStateRefs}
              botApiRefs={botApiRefs}
              onBotMove={updateBotLocator}
              sfxMuted={sfxMuted}
              audioSettings={effectiveSoundLevels}
              gameplayRules={soloGameRules}
              fogActive={fogActive}
              theme={theme}
              registerGameFrameCallback={registerGameFrameCallback}
            />
          ))}
          <div className="grass-plants">
            {mapGrassPlants.map((plant, index) => (
              <GrassPlant key={index} {...plant} />
            ))}
          </div>
          <CowHerd
            syncSeed={roomEnvironment?.seed}
            syncStartedAt={roomEnvironment?.startedAt}
            serverTimeOffsetRef={roomServerTimeOffsetRef}
            onPotty={addDropping}
          />
          <div className="droppings">
            {droppings.map((dropping) => (
              <span key={dropping.id} className="potty-dropping" style={{ left: `${dropping.x}vw` }} />
            ))}
          </div>
        </div>
      </div>
      {rainActive && (
        <div key={`rain-${theme}`} className="rain-layer rain-layer-active" aria-hidden="true">
          {(soloGameRules.weatherMode === 2 && !roomLobby?.weather ? [...rainDrops, ...rainDrops.map(drop => ({ ...drop, id: `heavy-${drop.id}`, left: (drop.left + 37) % 100 }))] : rainDrops).map((drop) => (
            <i
              key={drop.id}
              style={{
                left: `${drop.left}%`,
                top: `${drop.top}%`,
                height: `${drop.length}px`,
                opacity: drop.opacity,
                '--rain-speed': `${drop.duration}ms`,
                animationDelay: drop.delay,
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function TrainingTargetMapDots({ active, targets, targetsRef, targetsVersion, registerGameFrameCallback }) {
  const dotRefs = useRef(new Map());

  useEffect(() => {
    if (!active) return undefined;
    const update = () => {
      targetsRef.current.forEach((target) => {
        const dot = dotRefs.current.get(target.id);
        if (!dot) return;
        const visible = target.active && !target.state.crashed;
        dot.style.display = visible ? '' : 'none';
        if (!visible) return;
        dot.style.left = `${Math.max(3, Math.min(97, (target.state.x / WORLD_WIDTH) * 100))}%`;
        dot.style.top = `${Math.max(3, Math.min(97, 100 - ((target.state.y + 50) / WORLD_HEIGHT) * 100))}%`;
      });
    };
    update();
    return registerGameFrameCallback(GAME_FRAME_PRIORITY.TRAINING_TARGETS, update);
  }, [active, registerGameFrameCallback, targetsRef, targetsVersion]);

  if (!active) return null;

  return targets.filter((target) => target.active && !target.state.crashed).map((target) => (
    <span
      key={target.id}
      ref={(node) => {
        if (node) dotRefs.current.set(target.id, node);
        else dotRefs.current.delete(target.id);
      }}
      className={`map-training-target-dot map-training-target-dot-${target.targetType}`}
      style={{
        left: `${Math.max(3, Math.min(97, (target.state.x / WORLD_WIDTH) * 100))}%`,
        top: `${Math.max(3, Math.min(97, 100 - ((target.state.y + 50) / WORLD_HEIGHT) * 100))}%`,
      }}
      aria-hidden="true"
    />
  ));
}

function TrainingPracticeTargets({ active, targets, targetsRef, targetsVersion, paused, sessionRef, registerGameFrameCallback }) {
  const targetRefs = useRef(new Map());

  useEffect(() => {
    if (!active) return undefined;
    const update = (now) => {
      if(paused) return;
      moveTrainingTargets(targetsRef.current,sessionRef.current.elapsed);
      targetsRef.current.forEach(target=>{
        const element=targetRefs.current.get(target.id);
        if(element) {
          element.style.transform=`translate(${target.state.x}vw, ${-target.state.y}vh)`;
          element.style.filter=now<(target.flashUntil||0)?'brightness(0) invert(1)':'';
        }
      });
    };
    update(performance.now());
    return registerGameFrameCallback(GAME_FRAME_PRIORITY.TRAINING_TARGETS, update);
  }, [active, paused, sessionRef, registerGameFrameCallback, targetsRef, targetsVersion]);

  if (!active) return null;

  return (
    <div className="training-practice-target-layer" aria-hidden="true">
      {targets.filter((target) => target.active && !target.state.crashed).map((target) => (
        <div
          key={target.id}
          ref={(node) => {
            if (node) targetRefs.current.set(target.id, node);
            else targetRefs.current.delete(target.id);
          }}
          className={`training-practice-target training-practice-target-${target.weapon} training-practice-target-${target.targetType}`}
          style={{ transform: `translate(${target.state.x}vw, ${-target.state.y}vh)` }}
        >
          <span>{target.label}</span>
          <BitPlane rocketsRemaining={0} planeColor="purple" planeLightCombo="botYellow" />
          {target.hits > 0 && <small className="academy-target-damage">DAMAGED</small>}
        </div>
      ))}
    </div>
  );
}

function TrainingFogCheckpoint({ active, checkpoint }) {
  if (!active || !checkpoint) return null;

  return (
    <div className="training-fog-checkpoint-layer" aria-hidden="true">
      <div className="training-fog-checkpoint" style={{ transform: `translate(${checkpoint.x}vw, ${-checkpoint.y}vh)` }}>
        <span>FLIGHT GATE</span>
        <i><b /><b /></i>
      </div>
    </div>
  );
}

function BulletMeter({ count, reloading }) {
  return (
    <div className={`bullet-meter${reloading ? ' bullet-meter-reloading' : ''}`} aria-label={`${count} bullets`}>
      <div className="ammo-row">
        {Array.from({ length: MAX_BULLETS }, (_, index) => (
          <span key={index} className={`ammo-bullet${index < count ? ' ammo-bullet-loaded' : ' ammo-bullet-empty'}`}>
            <i className="ammo-tip" />
            <i className="ammo-shell" />
            <i className="ammo-slot ammo-slot-small" />
            <i className="ammo-slot ammo-slot-long" />
            <i className="ammo-ring ammo-ring-top" />
            <i className="ammo-ring ammo-ring-bottom" />
          </span>
        ))}
      </div>
    </div>
  );
}

function RocketMeter({ rocketCount, showHint }) {
  return (
    <div className={`rocket-meter${showHint ? ' rocket-discovery' : ''}`} aria-label={`${rocketCount} rocket${rocketCount === 1 ? '' : 's'}`}>
      {showHint && <div className="rocket-discovery-hint" role="status"><span className="rocket-hint-title">ROCKETS READY</span><span>Hold <kbd>R</kbd> to aim</span><span className="rocket-hint-release">Release to launch</span></div>}
      <div className="rocket-meter-row" aria-hidden="true">
        {Array.from({ length: MAX_ROCKETS }, (_, index) => (
          <span key={index} className={`meter-rocket${index < rocketCount ? ' meter-rocket-loaded' : ' meter-rocket-empty'}`}>
            <i className="meter-rocket-flame" />
            <i className="meter-rocket-body" />
            <i className="meter-rocket-nose" />
            <i className="meter-rocket-band" />
            <i className="meter-rocket-fin meter-rocket-fin-top" />
            <i className="meter-rocket-fin meter-rocket-fin-bottom" />
          </span>
        ))}
      </div>
    </div>
  );
}

function FieldGuide({ page, turnDirection, turnKey, onClose, onTurn }) {
  const isFirstPage = page === 0;
  const isLastPage = page === FIELD_GUIDE_PAGE_COUNT - 1;

  return (
    <article className="field-guide-panel field-guide-newspaper" role="dialog" aria-modal="true" aria-labelledby="field-guide-title">
      <header className="field-guide-masthead">
        <div className="field-guide-stamp">VOL. 01<br />SKY EDITION</div>
        <div>
          <span className="field-guide-kicker">The PixelPlanes Gazette</span>
          <h2 id="field-guide-title">Pilot's Field Guide</h2>
          <p>Page {String(page + 1).padStart(2, '0')} - the complete picture guide to your plane, the sky, and every HUD control.</p>
        </div>
        <button className="panel-close-button field-guide-close" type="button" aria-label="Close field guide" onClick={onClose}>x</button>
      </header>
      <div className="field-guide-page-stage">
        <section key={turnKey} className={`field-guide-page field-guide-page-${turnDirection}`} aria-live="polite">
          {page === 0 && <GuideWelcomePage />}
          {page === 1 && <GuideFlightPage />}
          {page === 2 && <GuideNavigationPage />}
          {page === 3 && <GuideCombatPage />}
          {page === 4 && <GuideWeatherPage />}
          {page === 5 && <GuideRoomPage />}
        </section>
      </div>
      <footer className="field-guide-footer field-guide-navigation">
        <button className="field-guide-turn" type="button" disabled={isFirstPage} onClick={() => onTurn(-1)}>Previous</button>
        <span>PAGE {page + 1} / {FIELD_GUIDE_PAGE_COUNT}</span>
        <button className="field-guide-turn field-guide-turn-next" type="button" disabled={isLastPage} onClick={() => onTurn(1)}>Next</button>
      </footer>
    </article>
  );
}

function GazetteHeader({ issue, headline, deck }) {
  return (
    <header className="gazette-page-heading">
      <span>{issue}</span>
      <h3>{headline}</h3>
      <p>{deck}</p>
    </header>
  );
}

function PixelKey({ children, wide = false, className = '' }) {
  return <kbd className={`gazette-key${wide ? ' gazette-key-wide' : ''}${className ? ` ${className}` : ''}`}>{children}</kbd>;
}

function GuideWelcomePage() {
  return (
    <>
      <GazetteHeader
        issue="FRONT PAGE"
        headline="Welcome to PixelPlanes"
        deck="Your first briefing before the runway rolls away beneath you."
      />
      <div className="gazette-layout gazette-layout-welcome">
        <article className="gazette-story-copy gazette-lead-story">
          <p className="gazette-dropcap">P</p>
          <p><strong>PixelPlanes turns one little biplane and a wide living farm into an open sky of takeoffs, close calls, and clean landings.</strong> Every flight is shaped by momentum, gravity, fuel, and the choices you make after the wheels leave the runway.</p>
          <p>Beyond the field are changing weather, a music-filled hangar, and skies made for calm practice or a proper dogfight. Learn the feel of your plane, follow the runway lights, and make every landing count.</p>
          <p>This guide is your co-pilot, not a checklist. Turn the page when you are ready; each spread introduces one part of the cockpit, map, and sky.</p>
        </article>
        <aside className="gazette-hero-art" aria-label="Blue PixelPlanes aircraft illustration">
          <img src="/assets/exact-plane.png" alt="Blue PixelPlanes aircraft" draggable="false" />
          <span className="gazette-runway" />
          <span className="gazette-cloud-mark gazette-cloud-one" />
          <span className="gazette-cloud-mark gazette-cloud-two" />
        </aside>
      </div>
      <p className="gazette-welcome-signoff"><span>The runway awaits</span>Start gently, build speed, and let the sky teach you the rest.</p>
    </>
  );
}

function GuideFlightPage() {
  return (
    <>
      <GazetteHeader
        issue="FLIGHT DESK"
        headline="Pilot's keyboard"
        deck="Every highlighted key below is live in the cockpit. WASD and the arrow keys mirror flight movement; the remaining keys handle weapons and light."
      />
      <div className="gazette-flight-layout gazette-flight-layout-rebuilt">
        <section className="gazette-keyboard-story gazette-keyboard-story-rebuilt">
          <div className="gazette-pilot-keyboard" aria-label="Flight controls keyboard map. Highlighted keys are active controls.">
            <div className="gazette-pilot-keyboard-heading">
              <span>Keyboard map</span>
              <p>Gold keys are flight controls. The arrow cluster is a full mirror of WASD movement.</p>
            </div>
            <div className="gazette-keyboard-board" aria-hidden="true">
              <div className="gazette-qwerty-board">
                <div className="gazette-qwerty-row">
                  <PixelKey className="gazette-key-muted">Q</PixelKey><PixelKey className="gazette-key-active">W</PixelKey><PixelKey className="gazette-key-muted">E</PixelKey><PixelKey className="gazette-key-active">R</PixelKey><PixelKey className="gazette-key-muted">T</PixelKey><PixelKey className="gazette-key-muted">Y</PixelKey><PixelKey className="gazette-key-muted">U</PixelKey><PixelKey className="gazette-key-muted">I</PixelKey><PixelKey className="gazette-key-muted">O</PixelKey><PixelKey className="gazette-key-muted">P</PixelKey>
                </div>
                <div className="gazette-qwerty-row gazette-qwerty-home-row">
                  <PixelKey className="gazette-key-active">A</PixelKey><PixelKey className="gazette-key-active">S</PixelKey><PixelKey className="gazette-key-active">D</PixelKey><PixelKey className="gazette-key-muted">F</PixelKey><PixelKey className="gazette-key-muted">G</PixelKey><PixelKey className="gazette-key-muted">H</PixelKey><PixelKey className="gazette-key-muted">J</PixelKey><PixelKey className="gazette-key-muted">K</PixelKey><PixelKey className="gazette-key-active">L</PixelKey>
                </div>
                <div className="gazette-qwerty-space-row"><PixelKey wide className="gazette-key-active gazette-key-space">SPACE</PixelKey></div>
              </div>
              <div className="gazette-arrow-board">
                <span>Arrows</span>
                <div className="gazette-arrow-key-grid"><PixelKey className="gazette-key-active gazette-key-arrow-up">↑</PixelKey><PixelKey className="gazette-key-active gazette-key-arrow-left">←</PixelKey><PixelKey className="gazette-key-active gazette-key-arrow-down">↓</PixelKey><PixelKey className="gazette-key-active gazette-key-arrow-right">→</PixelKey></div>
              </div>
            </div>
          </div>
          <div className="gazette-control-list gazette-control-list-rebuilt">
            <p><PixelKey className="gazette-key-active">W</PixelKey><PixelKey className="gazette-key-active">↑</PixelKey><span><strong>Thrust.</strong> Hold to spin the propeller, build runway speed, and gain lift. From the ready prompt, it also starts your flight.</span></p>
            <p><PixelKey className="gazette-key-active">A</PixelKey><PixelKey className="gazette-key-active">←</PixelKey><span><strong>Turn left.</strong> Hold for continuous left rotation; combine it with speed to change course or loop.</span></p>
            <p><PixelKey className="gazette-key-active">D</PixelKey><PixelKey className="gazette-key-active">→</PixelKey><span><strong>Turn right.</strong> Hold for continuous right rotation; combine it with thrust to carve the sky.</span></p>
            <p><PixelKey className="gazette-key-active">S</PixelKey><PixelKey className="gazette-key-active">↓</PixelKey><span><strong>Brake / reverse.</strong> It sheds speed in the air. On the runway, hold it without thrust to reverse.</span></p>
            <p><PixelKey wide className="gazette-key-active">SPACE</PixelKey><span><strong>Burst fire.</strong> Hold to send straight bullets from the propeller shaft along the dotted aiming line.</span></p>
            <p><PixelKey className="gazette-key-active">R</PixelKey><span><strong>Rocket.</strong> Hold to show target brackets, then release to launch one of two rockets. Tap for a quick launch. It guides toward its target for {ROCKET_HOMING_MS / 1000} seconds and expires after five.</span></p>
            <p><PixelKey className="gazette-key-active">L</PixelKey><span><strong>Fog light.</strong> Press once to toggle the forward searchlight for dark or foggy air.</span></p>
          </div>
        </section>
        <aside className="gazette-flight-sketch gazette-flight-scene">
          <img
            className="gazette-flight-scene-image"
            src="/assets/guide-night-runway.png"
            alt="Bit Plane on a night runway with its fog light shining ahead"
            draggable="false"
          />
        </aside>
      </div>
      <div className="gazette-safety-strip gazette-screen-controls">
        <div className="gazette-pause-demo"><i /><i /></div>
        <p><strong>Pause — screen button.</strong> Click the orange pause control to stop the game. While paused, press <PixelKey wide className="gazette-key-active">SPACE</PixelKey> once or click it again to resume.</p>
        <div className="gazette-restart-demo" aria-hidden="true">↻</div>
        <p><strong>Restart — screen button.</strong> Click the blue restart control to end the current run and return to the start screen. In a room, it leaves that room.</p>
      </div>
    </>
  );
}

function GuideNavigationPage() {
  return (
    <>
      <GazetteHeader
        issue="LEFT CONSOLE"
        headline="Every switch on the left"
        deck="The flight deck stays close to your hand: pause, restart, music, game sound, quick rules, plane colours, day and night, plus your score."
      />
      <div className="gazette-console-layout">
        <section className="gazette-console-board">
          <div className="gazette-console-board-heading"><span>Flight deck layout</span><p>The same button positions you see during a flight.</p></div>
          <div className="gazette-console-grid" aria-label="Top-left flight deck button layout illustration">
            <div className="gazette-console-button gazette-console-pause" aria-hidden="true"><i /><b>PAUSE</b></div>
            <div className="gazette-console-button gazette-console-restart" aria-hidden="true"><img src="/assets/restart-icon.png" alt="" draggable="false" /><b>RESTART</b></div>
            <div className="gazette-console-button"><img src="/assets/music-note-icon-transparent.png" alt="" draggable="false" /><b>MUSIC</b></div>
            <div className="gazette-console-button"><img src="/assets/sfx-speaker-icon.svg" alt="" draggable="false" /><b>SOUND</b></div>
            <div className="gazette-console-button"><img src="/assets/help-question-icon.png" alt="" draggable="false" /><b>RULES</b></div>
            <div className="gazette-console-button"><img src="/assets/exact-plane.png" alt="" draggable="false" /><b>PLANE</b></div>
            <div className="gazette-console-button"><img src="/assets/theme-lightbulb-icon.svg" alt="" draggable="false" /><b>THEME</b></div>
            <div className="gazette-console-score" aria-hidden="true"><div><span>KILLS</span><strong>3</strong></div><div><span>HIGH</span><strong>6</strong></div></div>
          </div>
        </section>
        <aside className="gazette-console-popouts">
          <h4>What opens when you click</h4>
          <div className="gazette-console-music-demo" aria-label="Music panel illustration">
            <div><img src="/assets/music-note-icon-transparent.png" alt="Music note" draggable="false" /><b>MUSIC</b></div>
            <section>{Array.from({ length: 10 }, (_, index) => <span key={index} className={index === 4 ? 'gazette-console-track-active' : ''}>{index + 1}</span>)}</section>
            <i><em /></i>
          </div>
          <div className="gazette-console-plane-demo" aria-label="Plane colour and blinking light choices illustration">
            <b>PLANE + BEACONS</b>
            <div>{PLANE_COLOR_OPTIONS.map((option, index) => <img key={option.id} className={index === 0 ? 'gazette-console-plane-active' : ''} src={option.staticSrc} alt={`${option.label} plane`} draggable="false" />)}</div>
            <section>{PLANE_LIGHT_OPTIONS.map((option, index) => <span key={option.id} className={index === 0 ? 'gazette-console-light-active' : ''}><i style={{ '--console-light': option.front }} /><i style={{ '--console-light': option.back }} /></span>)}</section>
          </div>
        </aside>
      </div>
      <div className="gazette-console-guide">
        <article><div className="gazette-console-mini gazette-console-mini-pause"><i /></div><div><h4>Pause / resume</h4><p>Click the orange control to freeze a started flight. Click it again, or press <PixelKey wide>SPACE</PixelKey> while paused, to continue.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/restart-icon.png" alt="Restart" draggable="false" /></div><div><h4>Restart</h4><p>Ends the local run, resets its score and supplies, and returns you to the Start screen. In a room, it also leaves the room.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/music-note-icon-transparent.png" alt="Music" draggable="false" /></div><div><h4>Music</h4><p>Opens ten songs. Choose a number to play it, then use the slider beneath the grid to set background-music volume.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/sfx-speaker-icon.svg" alt="Speaker" draggable="false" /></div><div><h4>Game sound</h4><p>Mutes or restores all game audio, including music, sound effects, and pull-up warnings.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/help-question-icon.png" alt="Question mark" draggable="false" /></div><div><h4>Quick rules</h4><p>Opens the short in-game reference for keys, modes, landing, fuel, weapons, map dots, hits, and scoring. It does not pause the flight.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/exact-plane.png" alt="Plane" draggable="false" /></div><div><h4>Plane colours</h4><p>Opens six body colours—blue, red, yellow, purple, green, and cyan—and three blinking-beacon pairs.</p></div></article>
        <article><div className="gazette-console-mini"><img src="/assets/theme-lightbulb-icon.svg" alt="Light bulb" draggable="false" /></div><div><h4>Day / night</h4><p>Switches the world between light and dark. The moon, stars, fuel beacons, and navigation lights are strongest at night.</p></div></article>
        <article><div className="gazette-console-mini gazette-console-mini-score"><strong>3</strong><span>HIGH<br />6</span></div><div><h4>Kills / High</h4><p>Kills are your current local total and reset after a crash or restart. High keeps your best total in this browser.</p></div></article>
      </div>
      <p className="gazette-console-room-note"><strong>Room note:</strong> in multiplayer rooms the day/night bulb and local Kills / High boxes are replaced by the live room leaderboard. The other flight-deck controls remain available.</p>
    </>
  );
}

function GuideCombatPage() {
  return (
    <>
      <GazetteHeader
        issue="TOP HUD"
        headline="Read the sky. Mind the fuel."
        deck="The upper-right instruments show where everyone is, how much flight you have left, and what is ready to fire. Purple locator dots lead to fuel stations."
      />
      <div className="gazette-top-hud-layout">
        <section className="gazette-top-hud-map">
          <div className="gazette-top-hud-map-heading"><h4>Locator map</h4><div className="gazette-top-hud-performance-cards" aria-label="FPS and ping readout illustration"><div><strong>60</strong><span>FPS</span></div><div><strong>--</strong><span>MS</span></div></div></div>
          <div className="gazette-map-demo gazette-top-hud-map-demo" aria-label="Top-right locator map illustration">
            <span className="gazette-map-grid-line gazette-map-grid-a" /><span className="gazette-map-grid-line gazette-map-grid-b" />
            <span className="gazette-map-edge gazette-map-edge-left" /><span className="gazette-map-edge gazette-map-edge-right" />
            <span className="gazette-map-dot gazette-map-dot-player" /><span className="gazette-map-label gazette-map-player-label">YOU</span>
            <span className="gazette-map-dot gazette-map-dot-fuel gazette-map-fuel-one" /><span className="gazette-map-dot gazette-map-dot-fuel gazette-map-fuel-two" />
            <span className="gazette-map-dot gazette-map-dot-enemy gazette-map-enemy-one" /><span className="gazette-map-dot gazette-map-dot-enemy gazette-map-enemy-two" />
          </div>
          <div className="gazette-top-hud-legend">
            <p><i className="gazette-map-dot gazette-map-dot-player" /><span><strong>Green:</strong> your Bit Plane.</span></p>
            <p><i className="gazette-map-dot gazette-map-dot-fuel" /><span><strong>Purple:</strong> fuel station.</span></p>
            <p><i className="gazette-map-dot gazette-map-dot-enemy" /><span><strong>Red:</strong> a bot or room pilot.</span></p>
          </div>
          <p className="gazette-top-hud-edge-note"><strong>Map edge:</strong> red warning edges mean you are near the end of the world. Turn back before the full border pulses and the plane crashes.</p>
        </section>
        <section className="gazette-top-hud-resources">
          <h4>Fuel, bullets, and rockets</h4>
          <div className="gazette-top-hud-instrument-art" aria-label="Fuel, bullet, and rocket meter illustration">
            <div className="gazette-top-hud-fuel-art"><div className="gazette-fuel-gauge-demo gazette-top-hud-fuel-gauge-live" aria-hidden="true"><i /><i /><i /><i /><b /><em /></div><b>{FUEL_SECONDS} SEC FUEL</b></div>
            <div className="gazette-top-hud-ammo-art"><div>{Array.from({ length: MAX_BULLETS }, (_, index) => <i key={index} className="guide-bullet-art" />)}</div><b>{MAX_BULLETS} BULLETS</b></div>
            <div className="gazette-top-hud-rocket-art"><div><span className="guide-rocket-art" /><span className="guide-rocket-art" /></div><b>{MAX_ROCKETS} ROCKETS</b></div>
          </div>
          <div className="gazette-top-hud-rules">
            <article><span>FUEL</span><p><strong>{FUEL_SECONDS} seconds.</strong> The needle begins horizontal in green, then crosses yellow, orange, and red. At empty, the engine has no thrust.</p></article>
            <article><span>AMMO</span><p><strong>{MAX_BULLETS} shots.</strong> Hold <PixelKey wide>SPACE</PixelKey> to fire every {BULLET_COOLDOWN_MS} ms. Once any are used, the whole magazine refills after {BULLET_RELOAD_MS / 1000} seconds.</p></article>
            <article><span>ROCKETS</span><p><strong>{MAX_ROCKETS} ready.</strong> Hold <PixelKey>R</PixelKey> to aim, release to launch; brackets show the selected target ahead within {ROCKET_DETECTION_RANGE} units. The rocket accelerates and intercepts that target for {ROCKET_HOMING_MS / 1000} seconds, then expires after {ROCKET_LIFETIME_MS / 1000} seconds.</p></article>
          </div>
        </section>
      </div>
      <div className="gazette-station-spread">
        <section className="gazette-station-scene" aria-label="Fuel station at night illustration">
          <span className="gazette-station-moon" aria-hidden="true" /><span className="gazette-station-trees" aria-hidden="true" />
          <span className="gazette-station-map-dot" aria-hidden="true" />
          <div className="gazette-station-pump-wrap"><FuelTank active={false} /></div>
          <span className="gazette-station-grass" aria-hidden="true" />
          <span className="gazette-station-touch">TOUCH THE PUMP</span>
        </section>
        <section className="gazette-station-copy">
          <span>FUEL STATIONS</span>
          <h4>One purple dot can save the flight.</h4>
          <p>Fuel stations sit along the ground and appear as purple dots in the locator map. Fly down gently and touch the pump itself—there is no separate key.</p>
          <div className="gazette-station-steps">
            <p><b>1</b><span><strong>Find it.</strong> Follow a purple dot on the map to the glowing beacon.</span></p>
            <p><b>2</b><span><strong>Refuel.</strong> Contact restores the full {FUEL_SECONDS}-second tank; the station beacon flashes and the fuel gauge pulses green.</span></p>
            <p><b>3</b><span><strong>Repair.</strong> A fuel stop clears first-hit propeller damage and smoke. Bullets and rockets follow their own reload rules.</span></p>
          </div>
        </section>
      </div>
      <p className="gazette-top-hud-status-note"><strong>Flight readouts:</strong> FPS reports the frames your screen is drawing. In a room, MS is your ping to the room server—lower is faster.</p>
    </>
  );
}

function GuideWeatherPage() {
  return (
    <>
      <GazetteHeader
        issue="WEATHER DESK"
        headline="Watch the sky change."
        deck="This is a real PixelPlanes sky replay: clear night, rain, fog, then daylight. Press L or use the deck key to turn on the plane's real fog light."
      />
      <GuideWeatherReplay />
      <div className="gazette-weather-guide">
        <article>
          <span className="gazette-weather-guide-icon gazette-weather-guide-rain">///</span>
          <div><h4>Rain</h4><p>Rain fades in and out over the farm with its own softer game-sound channel. In a room, every pilot sees the same rain state.</p></div>
        </article>
        <article>
          <span className="gazette-weather-guide-icon gazette-weather-guide-fog">≈</span>
          <div><h4>Fog + light</h4><p>Fog stays low across the runway. Press <PixelKey>L</PixelKey> to toggle the forward fog light and make the air ahead easier to read.</p></div>
        </article>
        <article>
          <span className="gazette-weather-guide-icon gazette-weather-guide-theme">☼</span>
          <div><h4>Clear, night, and day</h4><p>The bulb on the left console switches between day and night. At night, the moon, stars, fuel beacons, and plane navigation lights stand out.</p></div>
        </article>
        <article>
          <span className="gazette-weather-guide-icon gazette-weather-guide-lights">••</span>
          <div><h4>Plane lights</h4><p>The plane panel chooses red/green, amber/cyan, or violet/lime beacons. The Flight Deck setting controls their brightness independently.</p></div>
        </article>
      </div>
    </>
  );
}

function GuideWeatherReplay() {
  const [stageIndex, setStageIndex] = useState(0);
  const [fogLightOn, setFogLightOn] = useState(false);
  const stage = GUIDE_WEATHER_REPLAY_STAGES[stageIndex];
  const toggleFogLight = useCallback(() => setFogLightOn((active) => !active), []);
  const replayFogBanks = fogBanks.filter((_, index) => index % 11 === 2);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStageIndex((current) => (current + 1) % GUIDE_WEATHER_REPLAY_STAGES.length);
    }, GUIDE_WEATHER_REPLAY_STAGE_MS);
    return () => window.clearTimeout(timer);
  }, [stageIndex]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isEditableTarget = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (isEditableTarget || event.repeat || event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      toggleFogLight();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFogLight]);

  return (
    <section className={`gazette-weather-replay${stage.dark ? ' scene-dark' : ''} gazette-weather-replay-${stage.id}`} aria-label={`Live PixelPlanes weather replay: ${stage.label.toLowerCase()}`}>
      <div className="gazette-weather-replay-sky">
        <div className="stars gazette-weather-replay-stars" aria-hidden="true">
          {stars.slice(0, 46).map((star) => (
            <i key={star.id} style={{ left: `${(star.x / WORLD_WIDTH) * 100}%`, bottom: `${(star.y / WORLD_HEIGHT) * 100}%`, width: `${star.size}px`, height: `${star.size}px`, animationDelay: star.delay }} />
          ))}
        </div>
        <div className="sun" aria-hidden="true" />
        <div className="moon" aria-hidden="true" />
        <div className="cloud-layer gazette-weather-replay-clouds" aria-hidden="true">
          <span className="gazette-weather-replay-cloud-one"><Cloud {...clouds[5]} /></span>
          <span className="gazette-weather-replay-cloud-two"><Cloud {...clouds[19]} /></span>
        </div>
        <div className={`fog-layer gazette-weather-replay-fog${stage.fog ? ' fog-layer-active' : ''}`} aria-hidden="true">
          {replayFogBanks.map((fog, index) => (
            <span key={index} className="fog-bank" style={{ left: `${(fog.x / WORLD_WIDTH) * 100}%`, bottom: `${(fog.y / WORLD_HEIGHT) * 100}%`, '--fog-scale': fog.s, '--fog-opacity': fog.opacity, '--fog-speed': `${fog.speed}s`, animationDelay: fog.delay }} />
          ))}
        </div>
        <div className="gazette-weather-replay-trees gazette-weather-replay-trees-back" aria-hidden="true">
          {GUIDE_WEATHER_REPLAY_TREES.map((tree, index) => <Pine key={index} index={index + 23} depth="back" style={{ left: tree.x, width: `${tree.width}px`, height: `${tree.height}px` }} />)}
        </div>
        <div className="gazette-weather-replay-trees gazette-weather-replay-trees-front" aria-hidden="true">
          {GUIDE_WEATHER_REPLAY_TREES.map((tree, index) => <Pine key={index} index={index + 51} depth="front" style={{ left: tree.x, width: `${tree.width - 5}px`, height: `${Math.max(58, tree.height - 15)}px` }} />)}
        </div>
        <Hut className="gazette-weather-replay-hut" variant="low" />
        <FuelTank className="gazette-weather-replay-fuel" active={false} />
        <div className="ground-band gazette-weather-replay-ground" aria-hidden="true" />
        <div className="gazette-weather-replay-plane" aria-hidden="true">
          <BitPlane rocketsRemaining={2} planeColor="blue" planeLightCombo="classic" lightIntensity={1} searchLightActive={fogLightOn} searchLightFog={stage.fog} propellerActive />
        </div>
        <div className="gazette-weather-replay-readout" aria-live="polite"><span>LIVE SKY</span><strong>{stage.label}</strong></div>
        <button className={`gazette-weather-replay-light-key${fogLightOn ? ' gazette-weather-replay-light-key-on' : ''}`} type="button" onClick={toggleFogLight} aria-pressed={fogLightOn} aria-label={fogLightOn ? 'Turn fog light off' : 'Turn fog light on'}>
          <PixelKey>L</PixelKey><span>{fogLightOn ? 'FOG LIGHT ON' : 'FOG LIGHT'}</span>
        </button>
      </div>
      {stage.rain && (
        <div className="rain-layer rain-layer-active gazette-weather-replay-rain" aria-hidden="true">
          {rainDrops.slice(0, 54).map((drop) => (
            <i key={drop.id} style={{ left: `${drop.left}%`, top: `${drop.top}%`, height: `${drop.length}px`, opacity: drop.opacity, '--rain-speed': `${drop.duration}ms`, animationDelay: drop.delay }} />
          ))}
        </div>
      )}
      <div className="gazette-weather-replay-caption">
        <span>REAL GAME REPLAY</span>
        <p>Clear night → rain → fog → daylight. Press <PixelKey>L</PixelKey> or click the key above at any time to use the plane's fog light.</p>
      </div>
    </section>
  );
}

function GuideRoomPage() {
  const roomDemoPilots = PLANE_COLOR_OPTIONS.slice(0, 3);

  return (
    <>
      <GazetteHeader
        issue="ROOM DISPATCH"
        headline="Six pilots. One shared sky."
        deck="Create a room or enter a code, meet in the lobby, then let the host launch one live multiplayer match."
      />
      <div className="gazette-room-layout">
        <section className="gazette-room-entry">
          <div className="gazette-room-section-intro">
            <span>1</span>
            <div>
              <h4>Choose your way in</h4>
              <p>Open <strong>Room</strong> on the start screen. A host creates the room; every other pilot joins with its code.</p>
            </div>
          </div>
          <div className="gazette-room-entry-cards" aria-label="Create and join room examples">
            <article className="gazette-room-entry-card">
              <header><b>CREATE</b><span>HOST A MATCH</span></header>
              <div className="gazette-room-field"><span>YOUR NAME</span><strong>SKY PILOT</strong></div>
              <div className="gazette-room-entry-actions">
                <div className="gazette-room-theme-demo"><b>Dark</b><span>Light</span></div>
                <strong className="gazette-room-entry-button">Create</strong>
              </div>
              <p>Choose the shared dark or light theme. Creating gives the host a six-character room code.</p>
            </article>
            <article className="gazette-room-entry-card">
              <header><b>JOIN</b><span>ENTER A CODE</span></header>
              <div className="gazette-room-field"><span>YOUR NAME</span><strong>SKY PILOT</strong></div>
              <div className="gazette-room-field gazette-room-field-code"><span>CODE</span><strong>SKY742</strong></div>
              <strong className="gazette-room-entry-button gazette-room-entry-button-wide">Join room</strong>
              <p>Enter the host's code before the match begins. A free plane colour is assigned automatically.</p>
            </article>
          </div>
        </section>
        <aside className="gazette-lobby-demo" aria-label="Room lobby illustration">
          <div className="gazette-room-lobby-header-demo">
            <div><b>ROOM</b><span>WAITING FOR PILOTS</span></div>
            <strong>3/6</strong>
          </div>
          <div className="gazette-room-code-demo"><span>CODE</span><strong>SKY742</strong></div>
          <div className="gazette-room-lobby-settings">
            <div className="gazette-room-theme-demo"><b>Dark</b><span>Light</span></div>
            <div className="gazette-room-audio-demo"><RoomMicIcon className="gazette-room-audio-icon" /><b>Mic on</b></div>
            <div className="gazette-room-audio-demo"><RoomSpeakerIcon className="gazette-room-audio-icon" /><b>Speaker on</b></div>
          </div>
          <div className="gazette-room-player-list-demo">
            {roomDemoPilots.map((option, index) => (
              <div key={option.id} className="gazette-room-player-demo">
                <img src={option.staticSrc} alt="" draggable="false" />
                <span>{index === 0 ? 'Sky Pilot · Host' : `Pilot ${index + 1} · ${option.label}`}</span>
              </div>
            ))}
            {[4, 5, 6].map((slot) => (
              <div key={slot} className="gazette-room-player-demo gazette-room-player-waiting"><b>{slot}</b><span>Waiting</span></div>
            ))}
          </div>
          <div className="gazette-room-lobby-actions-demo"><span>Leave</span><span>Delete room</span><b>Start match</b></div>
        </aside>
      </div>
      <div className="gazette-mode-strip gazette-room-mode-strip">
        <section><span className="gazette-mode-number">1</span><h4>Share the code</h4><p>The code is the invitation. A room holds from one to six pilots and cannot be joined after the match starts.</p></section>
        <section><span className="gazette-mode-number">2</span><h4>Set up in the lobby</h4><p>Check the shared dark / light theme, pilot slots, microphone, and speaker before takeoff.</p></section>
        <section><span className="gazette-mode-number">3</span><h4>Host starts the sky</h4><p>Only the current host can start or delete the room. If the host leaves, another connected pilot becomes host.</p></section>
      </div>
      <div className="gazette-leaderboard-report">
        <section className="gazette-leaderboard-demo">
          <h4>LEADERBOARD</h4>
          <p><b>1</b><span>Sky Pilot</span><strong>4</strong><i><RoomMicIcon className="gazette-room-board-icon" /></i><i><RoomSpeakerIcon className="gazette-room-board-icon" /></i><em><u /><u /><u /></em></p>
          <p><b>2</b><span>Orbit</span><strong>2</strong><i className="gazette-room-board-space" /><i><RoomSpeakerIcon className="gazette-room-board-icon" /></i><em><u /><u /><u /></em></p>
          <p><b>3</b><span>Nova</span><strong>1</strong><i className="gazette-room-board-space" /><i><RoomSpeakerIcon className="gazette-room-board-icon" /></i><em className="gazette-room-bars-idle"><u /><u /><u /></em></p>
        </section>
        <section>
          <h4>Live board, voice, and shared world</h4>
          <p>Once the host starts, the upper-left panel becomes the live leaderboard. Pilots are ranked by kills. Your row has <strong>Mic</strong> and <strong>Speaker</strong>; other rows keep an individual speaker control so you can mute one pilot.</p>
          <p>Green bars move when an enabled microphone is speaking. Turning Mic on asks the browser for microphone access. The room shares weather, cows, fuel stations, projectiles, plane lights, crashes, and respawns—so everyone sees the same match.</p>
        </section>
      </div>
      <p className="gazette-caption">Room host: set the shared theme, start the match, or delete the room. Leaving hands host control to a remaining connected pilot; a crash respawns that pilot without resetting the room.</p>
    </>
  );
}

function PlayablePlane({
  trainingSpawn,
  onMove,
  onFuelChange,
  onFuelRefill,
  onSafeLanding,
  onTrainingTargetHit,
  onTrainingWeaponFired,
  onKill,
  onPlayerDeath,
  onAmmoChange,
  onRocketChange,
  onPlaneState,
  onRoomProjectile,
  onRoomInput,
  authoritativeRoom,
  roomTargetStatesRef,
  trainingTargetStatesRef,
  playerApiRef,
  botStateRefs,
  botApiRefs,
  botTargetsActive,
  gameplayRules,
  controlsEnabled,
  paused,
  spawnX = START_X,
  restartSignal,
  startArmed,
  onPowerStart,
  planeColor,
  planeLightCombo,
  sfxMuted,
  audioSettings,
  lightIntensity,
  fogActive,
  registerGameFrameCallback,
}) {
  const keysRef = useRef(new Set());
  const planeRef = useRef(null);
  const aimGuideDotRefs = useRef([]);
  const rocketTargetBracketRef = useRef(null);
  const rocketTriggerRef = useRef(createRocketTrigger());
  const leadFogRef = useRef(fogActive);
  leadFogRef.current = fogActive;
  const blastRef = useRef(null);
  const engineAudioRef = useRef(null);
  const crashSoundRef = useRef(null);
  const sfxMutedRef = useRef(sfxMuted);
  const audioSettingsRef = useRef(audioSettings);
  const onRoomInputRef = useRef(onRoomInput);
  const onSafeLandingRef = useRef(onSafeLanding);
  const onTrainingTargetHitRef = useRef(onTrainingTargetHit);
  const onTrainingWeaponFiredRef = useRef(onTrainingWeaponFired);
  const controlsEnabledRef = useRef(controlsEnabled);
  const pausedRef = useRef(paused);
  const startArmedRef = useRef(startArmed);
  const onPowerStartRef = useRef(onPowerStart);
  const smokePreviousPlaneRef = useRef(null);
  const damageLevelRef = useRef(0);
  const damageSmokeParticlesRef = useRef([]);
  const damageSmokeLastEmitRef = useRef(0);
  const fuelRefillFeedbackRef = useRef({ stationIndex: -1, time: 0 });
  const gameplayRulesRef = useRef(gameplayRules);
  const bulletTrajectoryRef = useRef(getBulletTrajectory(createInitialPlaneState(spawnX, getRuleFuelSeconds(gameplayRules)), gameplayRules));
  const rocketCandidates = (source) => {
    const candidates = [
      ...(botTargetsActive ? botStateRefs.current.map((state,index)=>({type:'bot',index,state})) : []),
      ...(trainingTargetStatesRef?.current || []).filter(t=>t.active && t.weapon==='rocket').map(t=>({...t,type:'training-target'})),
      ...Object.entries(roomTargetStatesRef?.current || {}).map(([id,entry])=>({type:'room-player',id,state:entry?.state})),
    ];
    const range = leadFogRef.current ? (gameplayRulesRef.current?.weatherMode === 2 ? 45 : 65) : ROCKET_DETECTION_RANGE;
    return candidates.filter(t=>t.state && !t.state.crashed && Math.hypot(t.state.x-source.x,t.state.y-source.y)<=range);
  };
  const crashedRef = useRef(false);
  const ammoRef = useRef(MAX_BULLETS);
  const reloadingRef = useRef(false);
  const reloadTimerRef = useRef(null);
  const lastShotRef = useRef(0);
  const fireQueuedRef = useRef(false);
  const fireBulletRef = useRef(null);
  const crashCurrentPlaneRef = useRef(null);
  const rocketsRef = useRef(MAX_ROCKETS);
  const lastRocketRef = useRef(0);
  const projectilesRef = useRef([]);
  const rocketProjectilesRef = useRef([]);
  const projectileElementRefs = useRef(new Map());
  const projectileTimeoutsRef = useRef([]);
  const rocketTimeoutsRef = useRef([]);
  const stateRef = useRef(trainingSpawn ? {...trainingSpawn} : createInitialPlaneState(spawnX, getRuleFuelSeconds(gameplayRules)));
  useEffect(() => {
    if(trainingSpawn) {onMove({x:getCameraX(trainingSpawn.x),y:getCameraY(trainingSpawn.y)});onPlaneState(stateRef.current);onFuelChange(trainingSpawn.fuel/60);}
  }, []);
  const searchLightOnRef = useRef(false);
  const [projectiles, setProjectiles] = useState([]);
  const [rocketProjectiles, setRocketProjectiles] = useState([]);
  const [rocketsRemaining, setRocketsRemaining] = useState(MAX_ROCKETS);
  const [crashed, setCrashed] = useState(false);
  const [damageLevel, setDamageLevel] = useState(0);
  const [damageSmokeParticles, setDamageSmokeParticles] = useState([]);
  const [searchLightOn, setSearchLightOn] = useState(false);

  useEffect(() => {
    rocketTriggerRef.current.cancel();
    if (rocketTargetBracketRef.current) rocketTargetBracketRef.current.style.opacity = '0';
  }, [paused, controlsEnabled, crashed, restartSignal]);

  useEffect(() => {
    gameplayRulesRef.current = gameplayRules;
  }, [gameplayRules]);

  const handledRestartRef = useRef(restartSignal);
  useEffect(() => {
    // Callback updates (including pause/resume) must not replay an old restart.
    if (handledRestartRef.current === restartSignal) return;
    handledRestartRef.current = restartSignal;
    if (restartSignal === 0 || trainingSpawn) return;
    keysRef.current.clear();
    if (reloadTimerRef.current) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    projectileTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    projectileTimeoutsRef.current = [];
    rocketTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    rocketTimeoutsRef.current = [];
    projectilesRef.current = [];
    rocketProjectilesRef.current = [];
    projectileElementRefs.current.clear();
    const next = createInitialPlaneState(spawnX, getRuleFuelSeconds(gameplayRulesRef.current));
    stateRef.current = next;
    searchLightOnRef.current = false;
    bulletTrajectoryRef.current = getBulletTrajectory(next, gameplayRulesRef.current);
    smokePreviousPlaneRef.current = null;
    damageLevelRef.current = 0;
    damageSmokeParticlesRef.current = [];
    damageSmokeLastEmitRef.current = 0;
    fuelRefillFeedbackRef.current = { stationIndex: -1, time: 0 };
    ammoRef.current = MAX_BULLETS;
    reloadingRef.current = false;
    lastShotRef.current = 0;
    fireQueuedRef.current = false;
    rocketsRef.current = MAX_ROCKETS;
    lastRocketRef.current = 0;
    crashedRef.current = false;
    setProjectiles([]);
    setRocketProjectiles([]);
    setRocketsRemaining(MAX_ROCKETS);
    setCrashed(false);
    setDamageLevel(0);
    setDamageSmokeParticles([]);
    setSearchLightOn(false);
    onAmmoChange({ count: MAX_BULLETS, reloading: false });
    onRocketChange(MAX_ROCKETS);
    onMove({ x: getCameraX(next.x), y: getCameraY(next.y) });
    onFuelChange(1);
    onPlaneState(next);
    if (engineAudioRef.current) {
      engineAudioRef.current.master.gain.setTargetAtTime(0, engineAudioRef.current.context.currentTime, 0.025);
    }
    if (planeRef.current) {
      planeRef.current.style.transform = `translate(${next.x}vw, ${-next.y}vh) rotate(${next.angle}deg)`;
      planeRef.current.style.setProperty('--thrust', 0);
      planeRef.current.querySelector('.plane-visual')?.classList.remove('prop-spinning');
    }
  }, [restartSignal, spawnX, onAmmoChange, onRocketChange, onMove, onFuelChange, onPlaneState]);

  useEffect(() => {
    if (!playerApiRef) return undefined;
    const crashPlayer = (impact = 1.2, options = {}) => {
      const current = stateRef.current;
      if (current.crashed) return;
      const next = {
        ...current,
        crashed: true,
        crashTime: performance.now(),
        crashImpact: clamp(impact, 0.75, 1.8),
        damage: Math.max(2, current.damage ?? 0),
        thrust: 0,
        throttle: 0,
        turnRate: 0,
        vx: 0,
        vy: 0,
      };
      stateRef.current = next;
      keysRef.current.clear();
      onRoomInputRef.current?.({
        power: false,
        down: false,
        left: false,
        right: false,
        fire: false,
        light: false,
      });
      crashedRef.current = true;
      damageLevelRef.current = next.damage;
      damageSmokeParticlesRef.current = [];
      damageSmokeLastEmitRef.current = 0;
      setDamageLevel(next.damage);
      setDamageSmokeParticles([]);
      setCrashed(true);
      crashSoundRef.current?.(next.crashImpact);
      onPlayerDeath(options);
      onPlaneState(next);
      if (engineAudioRef.current) {
        engineAudioRef.current.master.gain.setTargetAtTime(0, engineAudioRef.current.context.currentTime, 0.025);
      }
    };
    crashCurrentPlaneRef.current = crashPlayer;

    playerApiRef.current = {
      playHitSound: () => {
        playPlaneBulletHitSound(engineAudioRef.current?.context, sfxMutedRef.current, audioSettingsRef.current?.ammo ?? 1);
      },
      hitByBullet: (options = {}) => {
        const current = stateRef.current;
        if (current.crashed) return;
        flashPlaneHit(planeRef.current);
        const nextDamage = (current.damage ?? 0) + 1;
        if (nextDamage >= 2) {
          crashPlayer(1.18);
          return;
        }
        const next = {
          ...current,
          damage: nextDamage,
        };
        stateRef.current = next;
        damageLevelRef.current = nextDamage;
        if (!options.skipHitSound) playPlaneBulletHitSound(engineAudioRef.current?.context, sfxMutedRef.current, audioSettingsRef.current?.ammo ?? 1);
        setDamageLevel(nextDamage);
        onPlaneState(next);
      },
      crash: crashPlayer,
      applyAuthoritativeRoomState: ({ state: serverState, weapons } = {}) => {
        if (!serverState || typeof serverState !== 'object') return;
        const current = stateRef.current;

        if (serverState.crashed) {
          if (!current.crashed) {
            crashPlayer(serverState.crashImpact || 1.35, { selfCrash: false });
          }
        } else {
          const distance = Math.hypot(
            (Number(serverState.x) || 0) - (Number(current.x) || 0),
            (Number(serverState.y) || 0) - (Number(current.y) || 0),
          );
          const needsSnap = current.crashed || distance > 8;
          const blend = needsSnap ? 1 : 0.3;
          const next = {
            ...current,
            ...serverState,
            x: (Number(current.x) || 0) + (((Number(serverState.x) || 0) - (Number(current.x) || 0)) * blend),
            y: (Number(current.y) || 0) + (((Number(serverState.y) || 0) - (Number(current.y) || 0)) * blend),
            vx: (Number(current.vx) || 0) + (((Number(serverState.vx) || 0) - (Number(current.vx) || 0)) * blend),
            vy: (Number(current.vy) || 0) + (((Number(serverState.vy) || 0) - (Number(current.vy) || 0)) * blend),
            angle: needsSnap
              ? serverState.angle
              : normalizeAngle((Number(current.angle) || 0) + normalizeAngle((Number(serverState.angle) || 0) - (Number(current.angle) || 0)) * blend),
            crashed: false,
            crashTime: 0,
          };
          stateRef.current = next;
          searchLightOnRef.current = Boolean(next.searchLightOn);
          crashedRef.current = false;
          if ((next.damage ?? 0) > damageLevelRef.current) flashPlaneHit(planeRef.current);
          damageLevelRef.current = next.damage ?? 0;
          setCrashed(false);
          setDamageLevel(next.damage ?? 0);
          setSearchLightOn(Boolean(next.searchLightOn));
          onMove({ x: getCameraX(next.x), y: getCameraY(next.y) });
          onFuelChange(next.fuel / getRuleFuelSeconds(gameplayRulesRef.current));
          onPlaneState(next);
        }

        if (weapons && typeof weapons === 'object') {
          if (Number.isFinite(Number(weapons.ammo))) {
            ammoRef.current = Number(weapons.ammo);
          }
          reloadingRef.current = Boolean(weapons.reloading);
          onAmmoChange({ count: ammoRef.current, reloading: reloadingRef.current });
          if (Number.isFinite(Number(weapons.rockets))) {
            rocketsRef.current = Number(weapons.rockets);
            setRocketsRemaining(rocketsRef.current);
            onRocketChange(rocketsRef.current);
          }
        }
      },
    };
    return () => {
      if (playerApiRef.current) playerApiRef.current = null;
      crashCurrentPlaneRef.current = null;
    };
  }, [playerApiRef, onAmmoChange, onFuelChange, onMove, onPlayerDeath, onPlaneState, onRocketChange]);

  useEffect(() => {
    sfxMutedRef.current = sfxMuted;
    if (!sfxMuted || !engineAudioRef.current) return;
    const audio = engineAudioRef.current;
    audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.025);
  }, [sfxMuted]);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  useEffect(() => {
    onRoomInputRef.current = onRoomInput;
  }, [onRoomInput]);

  useEffect(() => {
    onSafeLandingRef.current = onSafeLanding;
  }, [onSafeLanding]);

  useEffect(() => {
    onTrainingTargetHitRef.current = onTrainingTargetHit;
  }, [onTrainingTargetHit]);

  useEffect(() => {
    onTrainingWeaponFiredRef.current = onTrainingWeaponFired;
  }, [onTrainingWeaponFired]);

  useEffect(() => {
    controlsEnabledRef.current = controlsEnabled;
    if (controlsEnabled) {
      onRoomInputRef.current?.({
        power: keysRef.current.has('power'),
        down: keysRef.current.has('down'),
        left: keysRef.current.has('left'),
        right: keysRef.current.has('right'),
        fire: keysRef.current.has('fire'),
        light: searchLightOnRef.current,
      });
      return;
    }
    keysRef.current.clear();
    onRoomInputRef.current?.({
      power: false,
      down: false,
      left: false,
      right: false,
      fire: false,
      light: false,
    });
    if (engineAudioRef.current) {
      engineAudioRef.current.master.gain.setTargetAtTime(0, engineAudioRef.current.context.currentTime, 0.025);
    }
  }, [controlsEnabled]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    startArmedRef.current = startArmed;
  }, [startArmed]);

  useEffect(() => {
    onPowerStartRef.current = onPowerStart;
  }, [onPowerStart]);

  useEffect(() => {
    const ensureEngineAudio = () => {
      if (sfxMutedRef.current) return null;
      if (engineAudioRef.current) {
        resumeGameAudio(engineAudioRef.current.context);
        return engineAudioRef.current;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      const context = resumeGameAudio(new AudioContextClass());
      const master = context.createGain();
      const rotor = context.createOscillator();
      const buzz = context.createOscillator();
      const growl = context.createOscillator();
      const filter = context.createBiquadFilter();
      const distortion = context.createWaveShaper();

      rotor.type = 'sawtooth';
      buzz.type = 'square';
      growl.type = 'sawtooth';
      rotor.frequency.value = 58;
      buzz.frequency.value = 116;
      growl.frequency.value = 34;
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      filter.Q.value = 1.8;
      distortion.curve = Float32Array.from({ length: 256 }, (_, index) => {
        const x = (index / 255) * 2 - 1;
        return Math.tanh(x * 2.7);
      });
      distortion.oversample = '2x';
      master.gain.value = 0;

      rotor.connect(filter);
      buzz.connect(filter);
      growl.connect(filter);
      filter.connect(distortion);
      distortion.connect(master);
      master.connect(context.destination);
      rotor.start();
      buzz.start();
      growl.start();

      engineAudioRef.current = { context, master, rotor, buzz, growl, filter };
      return engineAudioRef.current;
    };

    const setAmmo = (count, reloading = reloadingRef.current) => {
      ammoRef.current = count;
      reloadingRef.current = reloading;
      onAmmoChange({ count, reloading });
    };

    const startReload = () => {
      if (reloadingRef.current || ammoRef.current >= MAX_BULLETS) return;
      reloadingRef.current = true;
      onAmmoChange({ count: ammoRef.current, reloading: true });
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        setAmmo(MAX_BULLETS, false);
      }, getRuleBulletReloadMs(gameplayRulesRef.current));
    };

    const playBulletSound = () => {
      if (sfxMutedRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      resumeGameAudio(context);

      const t = context.currentTime;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-9, t);
      limiter.knee.setValueAtTime(12, t);
      limiter.ratio.setValueAtTime(7, t);
      limiter.attack.setValueAtTime(0.002, t);
      limiter.release.setValueAtTime(0.11, t);
      limiter.connect(context.destination);

      const shotVolume = 3.4;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.52 * shotVolume * (audioSettingsRef.current?.ammo ?? 1), t + 0.006);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      master.connect(limiter);

      const makeNoise = (seconds, power = 2.6) => {
        const bufferLength = Math.floor(context.sampleRate * seconds);
        const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < bufferLength; index += 1) {
          const fade = 1 - index / bufferLength;
          data[index] = (Math.random() * 2 - 1) * Math.pow(fade, power);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        return source;
      };

      const muzzlePop = context.createOscillator();
      const popGain = context.createGain();
      const popFilter = context.createBiquadFilter();
      muzzlePop.type = 'sawtooth';
      muzzlePop.frequency.setValueAtTime(185, t);
      muzzlePop.frequency.exponentialRampToValueAtTime(54, t + 0.13);
      popFilter.type = 'lowpass';
      popFilter.frequency.setValueAtTime(620, t);
      popFilter.frequency.exponentialRampToValueAtTime(160, t + 0.14);
      popGain.gain.setValueAtTime(0.9, t);
      popGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      muzzlePop.connect(popFilter);
      popFilter.connect(popGain);
      popGain.connect(master);

      const crack = makeNoise(0.145, 3.7);
      const crackFilter = context.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(1850, t);
      crackFilter.frequency.exponentialRampToValueAtTime(980, t + 0.08);
      crackFilter.Q.value = 1.15;
      const crackGain = context.createGain();
      crackGain.gain.setValueAtTime(1.18, t);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(master);

      const snap = context.createOscillator();
      const snapGain = context.createGain();
      snap.type = 'square';
      snap.frequency.setValueAtTime(2550, t);
      snap.frequency.exponentialRampToValueAtTime(340, t + 0.032);
      snapGain.gain.setValueAtTime(0.34, t);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
      snap.connect(snapGain);
      snapGain.connect(master);

      const smokeTail = makeNoise(0.24, 1.55);
      const tailFilter = context.createBiquadFilter();
      tailFilter.type = 'lowpass';
      tailFilter.frequency.setValueAtTime(720, t);
      tailFilter.frequency.exponentialRampToValueAtTime(220, t + 0.22);
      const tailGain = context.createGain();
      tailGain.gain.setValueAtTime(0.42, t + 0.025);
      tailGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      smokeTail.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(master);

      muzzlePop.start(t);
      crack.start(t);
      snap.start(t);
      smokeTail.start(t + 0.018);
      muzzlePop.stop(t + 0.17);
      crack.stop(t + 0.15);
      snap.stop(t + 0.045);
      smokeTail.stop(t + 0.29);

      window.setTimeout(() => {
        master.disconnect();
        limiter.disconnect();
        if (!existing) context.close?.();
      }, 380);
    };

    const playRocketSound = () => {
      if (sfxMutedRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      resumeGameAudio(context);

      const t = context.currentTime;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-10, t);
      limiter.knee.setValueAtTime(10, t);
      limiter.ratio.setValueAtTime(6, t);
      limiter.attack.setValueAtTime(0.004, t);
      limiter.release.setValueAtTime(0.18, t);
      limiter.connect(context.destination);

      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(1.12 * (audioSettingsRef.current?.rocket ?? 1), t + 0.018);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
      master.connect(limiter);

      const makeNoise = (seconds, power = 1.85) => {
        const bufferLength = Math.floor(context.sampleRate * seconds);
        const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < bufferLength; index += 1) {
          const fade = 1 - index / bufferLength;
          data[index] = (Math.random() * 2 - 1) * Math.pow(fade, power);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        return source;
      };

      const ignition = context.createOscillator();
      const ignitionGain = context.createGain();
      ignition.type = 'sawtooth';
      ignition.frequency.setValueAtTime(68, t);
      ignition.frequency.exponentialRampToValueAtTime(138, t + 0.18);
      ignitionGain.gain.setValueAtTime(0.74, t);
      ignitionGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      ignition.connect(ignitionGain);
      ignitionGain.connect(master);

      const whoosh = makeNoise(0.62, 1.35);
      const whooshFilter = context.createBiquadFilter();
      const whooshGain = context.createGain();
      whooshFilter.type = 'bandpass';
      whooshFilter.frequency.setValueAtTime(760, t);
      whooshFilter.frequency.exponentialRampToValueAtTime(210, t + 0.55);
      whooshFilter.Q.value = 0.82;
      whooshGain.gain.setValueAtTime(1.15, t + 0.012);
      whooshGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.68);
      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(master);

      const crack = context.createOscillator();
      const crackGain = context.createGain();
      crack.type = 'square';
      crack.frequency.setValueAtTime(520, t);
      crack.frequency.exponentialRampToValueAtTime(145, t + 0.075);
      crackGain.gain.setValueAtTime(0.36, t);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      crack.connect(crackGain);
      crackGain.connect(master);

      ignition.start(t);
      whoosh.start(t + 0.01);
      crack.start(t);
      ignition.stop(t + 0.38);
      whoosh.stop(t + 0.7);
      crack.stop(t + 0.11);

      window.setTimeout(() => {
        master.disconnect();
        limiter.disconnect();
        if (!existing) context.close?.();
      }, 820);
    };

    const fireBulletFromPlane = (planeState, now) => {
      const rules = gameplayRulesRef.current;
      if (crashedRef.current || ammoRef.current <= 0 || now - lastShotRef.current < getRuleBulletCooldownMs(rules)) return;
      lastShotRef.current = now;
      playBulletSound();

      const trajectory = getBulletTrajectory(planeState, rules);
      bulletTrajectoryRef.current = trajectory;
      const projectile = createBulletProjectile(planeState, now, 'player-bullet', trajectory);
      onRoomProjectile?.('bullet', projectile);

      projectilesRef.current = [...projectilesRef.current, projectile];
      setProjectiles(projectilesRef.current);
      const bulletElement = projectileElementRefs.current.get(projectile.id);
      if (bulletElement) {
        setWorldTransformPosition(bulletElement, projectile.renderX, projectile.renderY);
      }

      const timeoutId = window.setTimeout(() => {
        projectilesRef.current = projectilesRef.current.filter((item) => item.id !== projectile.id);
        projectileElementRefs.current.delete(projectile.id);
        setProjectiles(projectilesRef.current);
        projectileTimeoutsRef.current = projectileTimeoutsRef.current.filter((timeout) => timeout !== timeoutId);
      }, projectile.life + (projectile.groundHit ? 420 : 0));
      projectileTimeoutsRef.current.push(timeoutId);

      const nextAmmo = ammoRef.current - 1;
      setAmmo(nextAmmo, reloadingRef.current);
      startReload();
      onTrainingWeaponFiredRef.current?.('bullet');
    };

    const queueBulletFire = () => {
      fireQueuedRef.current = true;
    };
    fireBulletRef.current = fireBulletFromPlane;

    const fireRocket = () => {
      const now = performance.now();
      if (pausedRef.current || !controlsEnabledRef.current || crashedRef.current || rocketsRef.current <= 0 || now - lastRocketRef.current < ROCKET_COOLDOWN_MS) return;
      lastRocketRef.current = now;
      onRoomInputRef.current?.({ fireRocket: true });
      playRocketSound();

      const mountPoint = rocketsRef.current === 2 ? { x: 0.34, y: 0.8 } : { x: 0.52, y: 0.73 };
      const rocket = createRocketProjectile(stateRef.current, now, mountPoint, 'player-rocket', gameplayRulesRef.current, rocketCandidates(stateRef.current));
      onRoomProjectile?.('rocket', rocket);

      rocketProjectilesRef.current = [...rocketProjectilesRef.current, rocket];
      setRocketProjectiles(rocketProjectilesRef.current);

      const nextRockets = rocketsRef.current - 1;
      rocketsRef.current = nextRockets;
      setRocketsRemaining(nextRockets);
      onRocketChange(nextRockets);
      onTrainingWeaponFiredRef.current?.('rocket');
    };

    crashSoundRef.current = (impact = 1) => {
      if (sfxMutedRef.current) return;
      const explosionLevel = clamp(audioSettingsRef.current?.explosion ?? 1, 0, 1);
      if (explosionLevel <= 0) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      resumeGameAudio(context);

      const t = context.currentTime;
      const crashVolume = 2.05 * explosionLevel;
      const amount = clamp(impact, 0.7, 1.8);
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-8, t);
      limiter.knee.setValueAtTime(18, t);
      limiter.ratio.setValueAtTime(8, t);
      limiter.attack.setValueAtTime(0.003, t);
      limiter.release.setValueAtTime(0.22, t);
      limiter.connect(context.destination);

      const distortion = context.createWaveShaper();
      const distortionCurve = new Float32Array(512);
      for (let index = 0; index < distortionCurve.length; index += 1) {
        const x = (index * 2) / (distortionCurve.length - 1) - 1;
        distortionCurve[index] = Math.tanh(x * 4.6);
      }
      distortion.curve = distortionCurve;
      distortion.oversample = '4x';
      distortion.connect(limiter);

      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.68 * crashVolume * amount, t + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.28);
      master.connect(distortion);

      const makeNoise = (seconds, power = 2.2) => {
        const bufferLength = Math.floor(context.sampleRate * seconds);
        const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < bufferLength; index += 1) {
          const fade = 1 - index / bufferLength;
          data[index] = (Math.random() * 2 - 1) * Math.pow(fade, power);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        return source;
      };

      const thud = context.createOscillator();
      const thudFilter = context.createBiquadFilter();
      const thudGain = context.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(122 * amount, t);
      thud.frequency.exponentialRampToValueAtTime(31, t + 0.42);
      thudFilter.type = 'lowpass';
      thudFilter.frequency.setValueAtTime(520, t);
      thudFilter.frequency.exponentialRampToValueAtTime(95, t + 0.5);
      thudGain.gain.setValueAtTime(1.25, t);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      thud.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(master);

      const impactCrack = makeNoise(0.18, 4.1);
      const impactFilter = context.createBiquadFilter();
      const impactGain = context.createGain();
      impactFilter.type = 'bandpass';
      impactFilter.frequency.setValueAtTime(2450, t);
      impactFilter.frequency.exponentialRampToValueAtTime(610, t + 0.13);
      impactFilter.Q.value = 1.9;
      impactGain.gain.setValueAtTime(1.65, t);
      impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      impactCrack.connect(impactFilter);
      impactFilter.connect(impactGain);
      impactGain.connect(master);

      const crunch = makeNoise(0.48, 2.45);
      const crunchFilter = context.createBiquadFilter();
      const crunchGain = context.createGain();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.setValueAtTime(920, t + 0.025);
      crunchFilter.frequency.exponentialRampToValueAtTime(260, t + 0.5);
      crunchFilter.Q.value = 1.25;
      crunchGain.gain.setValueAtTime(1.08, t + 0.015);
      crunchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
      crunch.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(master);

      const explosionBody = context.createOscillator();
      const explosionGain = context.createGain();
      const explosionFilter = context.createBiquadFilter();
      explosionBody.type = 'sine';
      explosionBody.frequency.setValueAtTime(82 * amount, t + 0.055);
      explosionBody.frequency.exponentialRampToValueAtTime(24, t + 0.7);
      explosionFilter.type = 'lowpass';
      explosionFilter.frequency.setValueAtTime(360, t + 0.055);
      explosionFilter.frequency.exponentialRampToValueAtTime(92, t + 0.76);
      explosionGain.gain.setValueAtTime(0.88, t + 0.055);
      explosionGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
      explosionBody.connect(explosionFilter);
      explosionFilter.connect(explosionGain);
      explosionGain.connect(master);

      const fuelBlast = makeNoise(0.68, 2.05);
      const fuelBlastFilter = context.createBiquadFilter();
      const fuelBlastGain = context.createGain();
      fuelBlastFilter.type = 'lowpass';
      fuelBlastFilter.frequency.setValueAtTime(1180, t + 0.065);
      fuelBlastFilter.frequency.exponentialRampToValueAtTime(170, t + 0.72);
      fuelBlastFilter.Q.value = 1.1;
      fuelBlastGain.gain.setValueAtTime(0.72, t + 0.065);
      fuelBlastGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.76);
      fuelBlast.connect(fuelBlastFilter);
      fuelBlastFilter.connect(fuelBlastGain);
      fuelBlastGain.connect(master);

      const debris = makeNoise(0.8, 1.55);
      const debrisFilter = context.createBiquadFilter();
      const debrisGain = context.createGain();
      debrisFilter.type = 'highpass';
      debrisFilter.frequency.setValueAtTime(2150, t);
      debrisFilter.frequency.exponentialRampToValueAtTime(760, t + 0.65);
      debrisFilter.Q.value = 0.8;
      debrisGain.gain.setValueAtTime(0.7, t + 0.025);
      debrisGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
      debris.connect(debrisFilter);
      debrisFilter.connect(debrisGain);
      debrisGain.connect(master);

      const metalFrequencies = [960, 1390, 1880, 2460];
      const metalNodes = metalFrequencies.map((frequency, index) => {
        const clang = context.createOscillator();
        const clangGain = context.createGain();
        clang.type = index % 2 === 0 ? 'sawtooth' : 'square';
        clang.frequency.setValueAtTime(frequency * amount, t + 0.006 * index);
        clang.frequency.exponentialRampToValueAtTime(frequency * 0.42, t + 0.2 + index * 0.035);
        clangGain.gain.setValueAtTime(0.24 / (index + 1), t + 0.006 * index);
        clangGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26 + index * 0.045);
        clang.connect(clangGain);
        clangGain.connect(master);
        return clang;
      });

      const scrape = context.createOscillator();
      const scrapeGain = context.createGain();
      const scrapeFilter = context.createBiquadFilter();
      scrape.type = 'sawtooth';
      scrape.frequency.setValueAtTime(3050, t + 0.035);
      scrape.frequency.exponentialRampToValueAtTime(780, t + 0.38);
      scrapeFilter.type = 'highpass';
      scrapeFilter.frequency.setValueAtTime(1150, t + 0.035);
      scrapeFilter.Q.value = 0.65;
      scrapeGain.gain.setValueAtTime(0.19, t + 0.035);
      scrapeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      scrape.connect(scrapeFilter);
      scrapeFilter.connect(scrapeGain);
      scrapeGain.connect(master);

      const smoke = makeNoise(1.05, 1.18);
      const smokeFilter = context.createBiquadFilter();
      const smokeGain = context.createGain();
      smokeFilter.type = 'lowpass';
      smokeFilter.frequency.setValueAtTime(760, t + 0.08);
      smokeFilter.frequency.exponentialRampToValueAtTime(130, t + 1.02);
      smokeFilter.Q.value = 0.7;
      smokeGain.gain.setValueAtTime(0.36, t + 0.08);
      smokeGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      smoke.connect(smokeFilter);
      smokeFilter.connect(smokeGain);
      smokeGain.connect(master);

      thud.start(t);
      impactCrack.start(t);
      crunch.start(t + 0.012);
      explosionBody.start(t + 0.055);
      fuelBlast.start(t + 0.065);
      debris.start(t + 0.02);
      scrape.start(t + 0.035);
      smoke.start(t + 0.08);
      metalNodes.forEach((node, index) => {
        node.start(t + 0.006 * index);
        node.stop(t + 0.3 + index * 0.045);
      });
      thud.stop(t + 0.58);
      impactCrack.stop(t + 0.18);
      crunch.stop(t + 0.58);
      explosionBody.stop(t + 0.8);
      fuelBlast.stop(t + 0.78);
      debris.stop(t + 0.8);
      scrape.stop(t + 0.43);
      smoke.stop(t + 1.12);

      window.setTimeout(() => {
        master.disconnect();
        distortion.disconnect();
        limiter.disconnect();
        if (!existing) context.close?.();
      }, 1450);
    };

    const keyMap = {
      w: 'power',
      ArrowUp: 'power',
      s: 'down',
      ArrowDown: 'down',
      a: 'left',
      ArrowLeft: 'left',
      d: 'right',
      ArrowRight: 'right',
      r: 'rocket',
      R: 'rocket',
      l: 'light',
      L: 'light',
    };

    const publishRoomInput = (changes = {}) => {
      onRoomInputRef.current?.({
        power: keysRef.current.has('power'),
        down: keysRef.current.has('down'),
        left: keysRef.current.has('left'),
        right: keysRef.current.has('right'),
        fire: keysRef.current.has('fire'),
        light: searchLightOnRef.current,
        ...changes,
      });
    };

    const setKey = (event, pressed) => {
      const isEditableTarget = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (isEditableTarget) {
        rocketTriggerRef.current.cancel();
        if (rocketTargetBracketRef.current) rocketTargetBracketRef.current.style.opacity = '0';
        return;
      }
      const action = event.code === 'Space' ? 'fire' : keyMap[event.key] || keyMap[event.key.toLowerCase?.()];
      if (!action) return;
      if (!controlsEnabledRef.current) {
        if (startArmedRef.current && action === 'power' && pressed) {
          event.preventDefault();
          onPowerStartRef.current?.();
          keysRef.current.add('power');
          ensureEngineAudio();
        }
        return;
      }
      event.preventDefault();
      if (action === 'fire') {
        if (pressed) {
          keysRef.current.add('fire');
          if (!event.repeat && !pausedRef.current) queueBulletFire();
        } else {
          keysRef.current.delete('fire');
        }
        publishRoomInput();
        return;
      }
      if (action === 'rocket') {
        const allowed = !pausedRef.current && !crashedRef.current && rocketsRef.current > 0;
        if (pressed) rocketTriggerRef.current.press(allowed, event.repeat);
        else {
          const shouldFire = rocketTriggerRef.current.release(allowed);
          if (rocketTargetBracketRef.current) rocketTargetBracketRef.current.style.opacity = '0';
          if (shouldFire) fireRocket();
        }
        return;
      }
      if (action === 'light') {
        if (pressed && !event.repeat) {
          setSearchLightOn((active) => {
            const nextLightOn = !active;
            searchLightOnRef.current = nextLightOn;
            stateRef.current = {
              ...stateRef.current,
              searchLightOn: nextLightOn,
            };
            onPlaneState(stateRef.current);
            publishRoomInput({ light: nextLightOn });
            return nextLightOn;
          });
        }
        return;
      }
      if (pressed) {
        keysRef.current.add(action);
        if (action === 'power') ensureEngineAudio();
      } else {
        keysRef.current.delete(action);
      }
      publishRoomInput();
    };

    const cancelRocketAim = () => {
      rocketTriggerRef.current.cancel();
      if (rocketTargetBracketRef.current) rocketTargetBracketRef.current.style.opacity = '0';
    };
    const handleVisibilityChange = () => { if (document.hidden) cancelRocketAim(); };
    const handleKeyDown = (event) => setKey(event, true);
    const handleKeyUp = (event) => setKey(event, false);
    onAmmoChange({ count: ammoRef.current, reloading: reloadingRef.current });
    onRocketChange(rocketsRef.current);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', cancelRocketAim);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', cancelRocketAim);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelRocketAim();
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      projectileTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      projectileTimeoutsRef.current = [];
      rocketTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      rocketTimeoutsRef.current = [];
      projectilesRef.current = [];
      rocketProjectilesRef.current = [];
      projectileElementRefs.current.clear();
      fireBulletRef.current = null;
      const audio = engineAudioRef.current;
      crashSoundRef.current = null;
      if (audio) {
        audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.04);
        window.setTimeout(() => audio.context.close?.(), 120);
        engineAudioRef.current = null;
      }
    };
  }, [onAmmoChange, onRocketChange, onRoomProjectile]);

  useEffect(() => {
    let last = performance.now();
    let accumulator = 0;
    let previousPhysicsState = null;
    const step = 1 / 120;

    const simulate = (current, keys, dt, now) => {
      const next = { ...current };
      const playerFlightTuning = getPlayerFlightTuning(gameplayRulesRef.current);
      const fuelCapacity = getRuleFuelSeconds(gameplayRulesRef.current);
      const preStepGroundPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
      const onRunway = !next.hasLifted && (next.y <= 0.02 || preStepGroundPoint <= 0.18);
      const powerRequested = keys.has('power') && next.fuel > 0;
      if (powerRequested) {
        next.fuel = Math.max(0, next.fuel - dt);
        next.throttle = Math.min(1, next.throttle + dt * playerFlightTuning.throttleRise);
      }
      else next.throttle = Math.max(0, next.throttle - dt * 1.35);
      if (keys.has('down')) next.throttle = Math.max(0, next.throttle - dt * 2.65);
      next.thrust += (next.throttle - next.thrust) * Math.min(1, dt * playerFlightTuning.thrustResponse);
      if (next.fuel <= 0) {
        next.throttle = 0;
        next.thrust = Math.max(0, next.thrust - dt * 12);
      }
      if (onRunway && keys.has('down') && !keys.has('power')) {
        next.throttle = 0;
        next.thrust = Math.max(0, next.thrust - dt * 9);
      }

      const elevator = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const speed = Math.hypot(next.vx, next.vy);
      const authority = flightTurnAuthority(speed, next.thrust);
      const targetTurnRate = elevator * (playerFlightTuning.turnBaseRate * 0.82) * authority;
      next.turnRate += (targetTurnRate - next.turnRate) * (1 - Math.exp(-dt * (elevator ? 10 : 14)));
      next.angle = normalizeAngle(next.angle + next.turnRate * dt);

      const rad = (next.angle * Math.PI) / 180;
      const forwardX = -Math.cos(rad);
      const forwardY = Math.sin(rad);
      const climbing = forwardY > 0.15;
      const runwaySpeed = Math.abs(next.vx);
      const takeoffReady = runwaySpeed > playerFlightTuning.takeoffSpeed && next.thrust > 0.58 && climbing;

      if (onRunway) {
        if (preStepGroundPoint < 0) next.y -= preStepGroundPoint;
        next.vy = 0;
        if (keys.has('down') && !keys.has('power')) {
          next.vx += Math.cos(rad) * 58 * dt;
          next.vx = Math.min(next.vx, 15);
        }
        if (!keys.has('left') && !keys.has('right')) {
          next.angle = normalizeAngle(next.angle + normalizeAngle(14 - next.angle) * Math.min(1, dt * 5.5));
          next.turnRate *= Math.exp(-dt * 7);
        }
      }

      // Ground handling stays assisted; airborne forces use the shared flight model.
      const updatedSpeed = Math.hypot(next.vx, next.vy);
      if (onRunway) {
        next.vx += forwardX * playerFlightTuning.runwayThrust * next.thrust * dt;
        next.vx *= Math.exp(-dt * (keys.has('down') ? 4.2 : next.thrust > 0.08 ? 0.45 : 1.25));
        next.vy = takeoffReady ? Math.max(0, forwardY * (updatedSpeed * 0.26 + next.thrust * 3.4)) : 0;
      } else {
        applyFlightForces(next, dt, { thrust: playerFlightTuning.flightThrust * AIRBORNE_THRUST_SCALE, cruiseSpeed: playerFlightTuning.maxLevelSpeed, brake: keys.has('down') });
      }

      next.x += next.vx * dt;
      next.y += next.vy * dt;

      const lowestPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
      if (lowestPoint < 0 && !next.hasLifted) {
        next.y -= lowestPoint;
        next.vy = Math.max(0, next.vy);
      }

      if (next.y > 1.2) next.airborne = true;
      if (next.y > 2.0 || (next.airborne && lowestPoint > 0.55)) next.hasLifted = true;

      const shapePoints = planeModel.hitPoints.map((point) => getPlanePoint(next, point));
      const hitWorldEdge = shapePoints.some((point) => point.x <= 0 || point.x >= WORLD_WIDTH);
      const fuelStationIndex = fuelStationZones.findIndex((station) =>
        shapePoints.some(
          (point) => point.y > 0 && point.y < station.height && point.x > station.x && point.x < station.x + station.width,
        ),
      );
      if (fuelStationIndex >= 0) {
        const hadDamage = (next.damage ?? 0) > 0;
        const shouldRefill = next.fuel < fuelCapacity - 0.05 || hadDamage;
        const lastFeedback = fuelRefillFeedbackRef.current;
        const canPulse = lastFeedback.stationIndex !== fuelStationIndex || now - lastFeedback.time > 1200;
        next.fuel = fuelCapacity;
        if (hadDamage) {
          next.damage = 0;
          damageLevelRef.current = 0;
          damageSmokeParticlesRef.current = [];
          damageSmokeLastEmitRef.current = 0;
          setDamageLevel(0);
          setDamageSmokeParticles([]);
        }
        if (shouldRefill && canPulse) {
          fuelRefillFeedbackRef.current = { stationIndex: fuelStationIndex, time: now };
          onFuelRefill(fuelStationIndex);
        }
      }
      const groundLowestPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
      const tireLowestPoint = Math.min(...planeModel.tirePoints.map((point) => getPlanePoint(next, point).y));
      const bodyLowestPoint = Math.min(...planeModel.bodyGroundPoints.map((point) => getPlanePoint(next, point).y));
      const tireContact = next.hasLifted && tireLowestPoint <= 0.05;
      const bodyStrike = next.hasLifted && bodyLowestPoint <= -0.04 && bodyLowestPoint < tireLowestPoint - 0.08;
      const hitGround = next.hasLifted && (groundLowestPoint <= 0 || tireContact || bodyStrike);
      const landingSpeed = Math.hypot(next.vx, next.vy);
      const landingAngle = Math.abs(normalizeAngle(next.angle - 14));
      const horizontalLandingSpeed = Math.abs(next.vx);
      const downwardLandingSpeed = Math.max(0, -next.vy);
      const safeLanding =
        tireContact &&
        !bodyStrike &&
        landingSpeed < 44 &&
        horizontalLandingSpeed < 42 &&
        downwardLandingSpeed < 19 &&
        landingAngle < 34;

      if (safeLanding) {
        if (tireLowestPoint < 0) next.y -= tireLowestPoint;
        next.vy = 0;
        next.vx *= 0.58;
        next.turnRate = 0;
        next.throttle = Math.min(next.throttle, 0.18);
        next.thrust = Math.min(next.thrust, 0.18);
        next.airborne = false;
        next.hasLifted = false;
        next.angle = normalizeAngle(next.angle + normalizeAngle(14 - next.angle) * 0.3);
        onSafeLandingRef.current?.(next);
      } else if (hitGround || hitWorldEdge) {
        const crashLowestPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
        if (crashLowestPoint < 0) next.y -= crashLowestPoint;
        next.crashed = true;
        next.crashTime = now;
        next.crashImpact = Math.min(1.8, Math.max(0.75, landingSpeed / 28));
        next.thrust = 0;
        next.throttle = 0;
        next.turnRate = 0;
        next.vx = 0;
        next.vy = 0;
      }

      return next;
    };

    const removeProjectile = (id) => {
      projectilesRef.current = projectilesRef.current.filter((item) => item.id !== id);
      projectileElementRefs.current.delete(id);
      setProjectiles(projectilesRef.current);
    };

    const removeRocketProjectile = (id) => {
      rocketProjectilesRef.current = rocketProjectilesRef.current.filter((item) => item.id !== id);
      setRocketProjectiles(rocketProjectilesRef.current);
    };

    const getRoomTargets = () =>
      Object.entries(roomTargetStatesRef?.current || {})
        .map(([id, entry]) => ({
          type: 'room-player',
          id,
          state: entry?.state,
        }))
        .filter((target) => target.state && !target.state.crashed);

    const getTrainingTargets = () =>
      (trainingTargetStatesRef?.current || [])
        .filter((target) => target.active && target.state && !target.state.crashed)
        .map((target) => ({
          type: 'training-target',
          id: target.id,
          weapon: target.weapon,
          radius: target.radius,
          state: target.state,
        }));

    const updatePlayerRockets = (now) => {
      if (rocketProjectilesRef.current.length === 0) return;
      const targets = botTargetsActive
        ? botStateRefs.current.map((bot, index) => ({ type: 'bot', index, state: bot }))
        : [];
      const rocketTrainingTargets = getTrainingTargets().filter((target) => target.weapon === 'rocket');
      const nextRockets = updateGuidedRockets(rocketProjectilesRef.current, now, [...targets, ...rocketTrainingTargets, ...getRoomTargets()]);
      if (nextRockets !== rocketProjectilesRef.current) {
        rocketProjectilesRef.current = nextRockets;
        setRocketProjectiles(nextRockets);
      }
    };

    const updatePlayerBulletRenders = (now) => {
      syncProjectileRenderPositions(projectilesRef.current, now, projectileElementRefs.current);
    };

    const scanTrainingHits = (now) => {
      const trainingTargets = getTrainingTargets();
      if (!trainingTargets.length) return;

      for (const projectile of projectilesRef.current) {
        const segment = getProjectileSegment(projectile, now);
        const target = trainingTargets.find((candidate) =>
          candidate.weapon === 'bullet' && bulletSegmentHitsPlane(segment, candidate.state, candidate.radius ?? projectile.radius ?? BULLET_HIT_RADIUS),
        );
        if (target) {
          removeProjectile(projectile.id);
          onTrainingTargetHitRef.current?.(target.id, 'bullet');
          break;
        }
      }

      for (const projectile of rocketProjectilesRef.current) {
        if (projectile.groundHit) continue;
        const segment = getRocketSegment(projectile);
        const target = trainingTargets.find((candidate) =>
          candidate.weapon === 'rocket' && segmentHitsPlane(segment, candidate.state, candidate.radius ?? projectile.radius ?? 2.25),
        );
        if (target) {
          removeRocketProjectile(projectile.id);
          onTrainingTargetHitRef.current?.(target.id, 'rocket');
          break;
        }
      }
    };

    const scanBotHits = (now) => {
      if (!botTargetsActive) return;
      let handledBulletHit = false;
      for (const projectile of projectilesRef.current) {
        const segment = getProjectileSegment(projectile, now);
        const hitIndex = botStateRefs.current.findIndex((bot) => bot && !bot.crashed && bulletSegmentHitsPlane(segment, bot, projectile.radius ?? BULLET_HIT_RADIUS));
        if (hitIndex >= 0) {
          handledBulletHit = true;
          removeProjectile(projectile.id);
          const hitResult = botApiRefs.current[hitIndex]?.current?.hitByBullet?.({ source: 'player' });
          if (hitResult?.killed) onKill();
        }
      }
      if (handledBulletHit) return;
      let rocketHit = null;
      let rocketHitIndex = -1;
      for (const projectile of rocketProjectilesRef.current) {
        if (projectile.groundHit) continue;
        const segment = getRocketSegment(projectile);
        rocketHitIndex = botStateRefs.current.findIndex((bot) => bot && !bot.crashed && segmentHitsPlane(segment, bot, projectile.radius ?? 2.25));
        if (rocketHitIndex >= 0) {
          rocketHit = projectile;
          break;
        }
      }
      if (rocketHit) {
        removeRocketProjectile(rocketHit.id);
        const hitResult = botApiRefs.current[rocketHitIndex]?.current?.crash?.(1.72, { source: 'player' });
        if (hitResult?.killed) onKill();
      }
    };

    const update = (now) => {
      const frameTime = Math.min((now - last) / 1000, 0.1);
      last = now;
      const keys = keysRef.current;
      let next = stateRef.current;

      if (pausedRef.current) {
        accumulator = 0;
        fireQueuedRef.current = false;
        keys.delete('fire');
        renderPlane(next);
        return;
      }

      if (next.crashed) {
        updatePlayerBulletRenders(now);
        updatePlayerRockets(now);
        scanTrainingHits(now);
        scanBotHits(now);
        if (!authoritativeRoom && now - next.crashTime > 1450) {
          next = createInitialPlaneState(spawnX, getRuleFuelSeconds(gameplayRulesRef.current));
          searchLightOnRef.current = false;
          bulletTrajectoryRef.current = getBulletTrajectory(next, gameplayRulesRef.current);
          smokePreviousPlaneRef.current = null;
          damageLevelRef.current = 0;
          damageSmokeParticlesRef.current = [];
          damageSmokeLastEmitRef.current = 0;
          fuelRefillFeedbackRef.current = { stationIndex: -1, time: 0 };
          if (reloadTimerRef.current) {
            window.clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = null;
          }
          ammoRef.current = MAX_BULLETS;
          reloadingRef.current = false;
          lastShotRef.current = 0;
          fireQueuedRef.current = false;
          rocketsRef.current = MAX_ROCKETS;
          lastRocketRef.current = 0;
          setRocketsRemaining(MAX_ROCKETS);
          onAmmoChange({ count: MAX_BULLETS, reloading: false });
          onRocketChange(MAX_ROCKETS);
          onMove({ x: getCameraX(next.x), y: getCameraY(next.y) });
          onFuelChange(next.fuel / getRuleFuelSeconds(gameplayRulesRef.current));
          onPlaneState(next);
          crashedRef.current = false;
          setDamageLevel(0);
          setDamageSmokeParticles([]);
          setCrashed(false);
          setSearchLightOn(false);
        }
        stateRef.current = next;
        renderPlane(next);
        return;
      }

      accumulator += frameTime;
      let steps = 0;
      while (accumulator >= step && steps < 12 && !next.crashed) {
        previousPhysicsState = next;
        next = simulate(next, keys, step, now);
        accumulator -= step;
        steps += 1;
      }
      if (steps >= 12) {
        accumulator = 0;
      }

      stateRef.current = next;
      next.searchLightOn = searchLightOnRef.current && !next.crashed;
      if (fireQueuedRef.current || keys.has('fire')) {
        fireQueuedRef.current = false;
        fireBulletRef.current?.(next, now);
      }
      updatePlayerBulletRenders(now);
      updatePlayerRockets(now);
      scanTrainingHits(now);
      scanBotHits(now);
      onMove({ x: getCameraX(next.x), y: getCameraY(next.y) });
      onFuelChange(next.fuel / getRuleFuelSeconds(gameplayRulesRef.current));
      onPlaneState(next);
      if (next.crashed !== crashedRef.current) {
        if (next.crashed) {
          damageLevelRef.current = Math.max(2, next.damage ?? 0);
          damageSmokeParticlesRef.current = [];
          damageSmokeLastEmitRef.current = 0;
          setDamageSmokeParticles([]);
          crashSoundRef.current?.(next.crashImpact);
          onPlayerDeath();
        }
        crashedRef.current = next.crashed;
        setCrashed(next.crashed);
      }
      renderPlane(interpolateFlightState(previousPhysicsState, next, accumulator / step));
    };

    const renderPlane = (planeState) => {
      const previousPlane = smokePreviousPlaneRef.current;
      const now = performance.now();
      const nextDamageSmokeParticles = updateDamageSmokeParticles(
        damageSmokeParticlesRef.current,
        planeState,
        previousPlane,
        now,
        damageLevelRef.current > 0 && !planeState.crashed,
        damageSmokeLastEmitRef,
      );
      if (nextDamageSmokeParticles !== damageSmokeParticlesRef.current) {
        damageSmokeParticlesRef.current = nextDamageSmokeParticles;
        setDamageSmokeParticles(nextDamageSmokeParticles);
      }
      smokePreviousPlaneRef.current = { x: planeState.x, y: planeState.y };
      if (planeRef.current) {
        planeRef.current.style.transform = `translate(${planeState.x}vw, ${-planeState.y}vh) rotate(${planeState.angle}deg)`;
        const visibleThrust = Math.max(planeState.thrust, planeState.throttle);
        planeRef.current.style.setProperty('--thrust', visibleThrust);
        const visual = planeRef.current.querySelector('.plane-visual');
        visual?.classList.toggle('prop-spinning', visibleThrust > 0.05);
        const audio = engineAudioRef.current;
        if (audio) {
          const t = audio.context.currentTime;
          const gain = planeState.crashed || pausedRef.current || sfxMutedRef.current
            ? 0
            : Math.min(0.13, visibleThrust * 0.11) * (audioSettingsRef.current?.engine ?? 1);
          audio.master.gain.setTargetAtTime(gain, t, 0.045);
          audio.rotor.frequency.setTargetAtTime(46 + visibleThrust * 96, t, 0.04);
          audio.buzz.frequency.setTargetAtTime(115 + visibleThrust * 220, t, 0.04);
          audio.growl.frequency.setTargetAtTime(29 + visibleThrust * 58, t, 0.05);
          audio.filter.frequency.setTargetAtTime(520 + visibleThrust * 1350, t, 0.06);
        }
      }
      if (rocketTargetBracketRef.current) {
        const target = rocketTriggerRef.current.held && !planeState.crashed && planeState.hasLifted && !pausedRef.current && rocketsRef.current > 0
          ? selectRocketTarget(planeState, rocketCandidates(planeState)) : null;
        rocketTargetBracketRef.current.style.opacity = target ? '1' : '0';
        if (target) setWorldTransformPosition(rocketTargetBracketRef.current, target.state.x, target.state.y);
      }
      if (aimGuideDotRefs.current.length > 0) {
        if (planeState.crashed) {
          aimGuideDotRefs.current.forEach((dot) => {
            if (dot) { dot.style.opacity = 0; dot.classList.remove('bullet-aim-dot-hit'); }
          });
        } else {
          const bulletTrajectory = getBulletTrajectory(planeState, gameplayRulesRef.current);
          bulletTrajectoryRef.current = bulletTrajectory;
          const predictedHit = !pausedRef.current && ammoRef.current > 0 && hasPredictedBulletHit(
            planeState, botTargetsActive ? botStateRefs.current : (trainingTargetStatesRef?.current || []).filter(t=>t.active&&t.weapon==='bullet').map(t=>t.state), bulletTrajectory,
            { maxDistance: leadFogRef.current && gameplayRulesRef.current?.weatherMode === 2 ? 45 : 65 },
          );
          getBulletGuidePoints(bulletTrajectory).forEach((point, index) => {
            const dot = aimGuideDotRefs.current[index];
            if (!dot) return;
            setWorldTransformPosition(dot, point.x, point.y);
            dot.style.opacity = 1;
            dot.classList.toggle('bullet-aim-dot-hit', Boolean(predictedHit));
          });
        }
      }
      if (blastRef.current) {
        blastRef.current.style.left = `${planeState.x}vw`;
        blastRef.current.style.bottom = `calc(100% - 2px + ${Math.max(0, planeState.y)}vh)`;
      }
    };

    return registerGameFrameCallback(GAME_FRAME_PRIORITY.PLAYER, update);
  }, [authoritativeRoom, spawnX, onMove, onFuelChange, onFuelRefill, onKill, onPlayerDeath, onAmmoChange, onRocketChange, onPlaneState, roomTargetStatesRef, botStateRefs, botApiRefs, botTargetsActive, registerGameFrameCallback]);

  return (
    <div className="player-plane-layer" aria-label="Playable plane">
      <div
        ref={planeRef}
        className={`player-plane${crashed ? ' plane-crashed' : ''}${damageLevel > 0 && !crashed ? ' plane-damaged' : ''}`}
        style={{
          transform: `translate(${spawnX}vw, 0vh) rotate(16deg)`,
          '--thrust': 0,
        }}
      >
        <BitPlane
          rocketsRemaining={rocketsRemaining}
          planeColor={planeColor}
          planeLightCombo={planeLightCombo}
          lightIntensity={lightIntensity}
          searchLightActive={searchLightOn && !crashed}
          searchLightFog={fogActive}
        />
      </div>
      <div className="bullet-aim-guide" aria-hidden="true">
        <i ref={rocketTargetBracketRef} className="rocket-target-bracket"><span>R</span></i>
        {Array.from({ length: AIM_GUIDE_DOT_COUNT }, (_, index) => (
          <i
            key={index}
            ref={(element) => {
              aimGuideDotRefs.current[index] = element;
            }}
            className="bullet-aim-dot"
          />
        ))}
      </div>
      <div className="damage-smoke-layer" aria-hidden="true">
        {damageSmokeParticles.map((particle) => (
          <span
            key={particle.id}
            className="damage-smoke-particle"
            style={{
              left: `${particle.x}vw`,
              bottom: `calc(100% - 2px + ${particle.y}vh)`,
              '--damage-smoke-dx': `${particle.dx}vw`,
              '--damage-smoke-dy': `${particle.dy}vh`,
              '--damage-smoke-scale': `${particle.scale}`,
              '--damage-smoke-opacity': `${particle.opacity}`,
              '--damage-smoke-life': `${particle.life}ms`,
            }}
          />
        ))}
      </div>
      <div className="bullet-projectiles" aria-hidden="true">
        {projectiles.map((projectile) => (
          <span
            key={projectile.id}
            ref={(element) => {
              if (element) projectileElementRefs.current.set(projectile.id, element);
              else projectileElementRefs.current.delete(projectile.id);
            }}
            className={`bullet-shot${projectile.groundHit ? ' bullet-ground-hit' : ''}`}
            style={{
              '--world-x': `${projectile.renderX ?? projectile.x}vw`,
              '--world-y': `${-(projectile.renderY ?? projectile.y)}vh`,
              '--bullet-angle': `${projectile.angle}deg`,
              '--bullet-life': `${projectile.life ?? BULLET_LIFETIME_MS}ms`,
            }}
          >
            <i className="bullet-core" />
            <i className="bullet-impact" />
          </span>
        ))}
      </div>
      <div className="rocket-projectiles" aria-hidden="true">
        {rocketProjectiles.map((rocket) => (
          <span
            key={rocket.id}
            className={`rocket-shot${rocket.groundHit ? ' rocket-ground-hit' : ''}`}
            style={{
              '--world-x': `${rocket.x}vw`,
              '--world-y': `${-rocket.y}vh`,
              '--rocket-angle': `${rocket.angle}deg`,
            }}
          >
            <i className="rocket-flame" />
            <i className="rocket-body" />
            <i className="rocket-nose" />
            <i className="rocket-band rocket-band-one" />
            <i className="rocket-band rocket-band-two" />
            <i className="rocket-fin rocket-fin-top" />
            <i className="rocket-fin rocket-fin-bottom" />
            <i className="rocket-impact" />
          </span>
        ))}
      </div>
      {crashed && (
        <span ref={blastRef} className="blast" aria-hidden="true">
          <i className="blast-flash" />
          <i className="blast-core" />
          <i className="blast-sparks" />
          <i className="smoke smoke-one" />
          <i className="smoke smoke-two" />
          <i className="smoke smoke-three" />
          <i className="smoke smoke-four" />
          <i className="smoke smoke-five" />
        </span>
      )}
    </div>
  );
}

function interpolateRemotePlane(entry, now) {
  const plane = entry.state;
  const previous = entry.previousState || plane;
  const previousAt = entry.previousAt || entry.at || now;
  const currentAt = entry.at || now;
  const interpolationDelay = clamp(
    REMOTE_INTERPOLATION_DELAY_MS + (entry.jitter || 0) * 2.4,
    REMOTE_INTERPOLATION_DELAY_MS,
    REMOTE_MAX_INTERPOLATION_DELAY_MS,
  );
  const renderAt = now - interpolationDelay;
  const snapshots = Array.isArray(entry.snapshots) ? entry.snapshots : [];

  if (snapshots.length >= 2) {
    if (renderAt <= snapshots[0].at) {
      return interpolatePlaneSnapshot(snapshots[0], snapshots[1], 0);
    }

    for (let index = 1; index < snapshots.length; index += 1) {
      const from = snapshots[index - 1];
      const to = snapshots[index];
      if (renderAt <= to.at) {
        const windowMs = Math.max(1, to.at - from.at);
        return interpolatePlaneSnapshot(from, to, clamp((renderAt - from.at) / windowMs, 0, 1));
      }
    }

    const latest = snapshots[snapshots.length - 1];
    const latestState = latest.state || plane;
    const predictionSeconds = clamp((renderAt - latest.at) / 1000, 0, REMOTE_MAX_PREDICTION_SECONDS);
    return {
      x: (latestState.x ?? 0) + (latestState.vx || 0) * predictionSeconds,
      y: (latestState.y ?? 0) + (latestState.vy || 0) * predictionSeconds,
      angle: latestState.angle || 0,
    };
  }

  const packetWindow = Math.max(1, currentAt - previousAt);

  if (renderAt <= currentAt && previousAt < currentAt) {
    const t = clamp((renderAt - previousAt) / packetWindow, 0, 1);
    return interpolatePlaneStates(previous, plane, t);
  }

  const predictionSeconds = clamp((renderAt - currentAt) / 1000, 0, REMOTE_MAX_PREDICTION_SECONDS);
  return {
    x: (plane.x ?? 0) + (plane.vx || 0) * predictionSeconds,
    y: (plane.y ?? 0) + (plane.vy || 0) * predictionSeconds,
    angle: plane.angle || 0,
  };
}

function interpolatePlaneSnapshot(from, to, t) {
  return interpolatePlaneStates(from?.state || {}, to?.state || from?.state || {}, t);
}

function interpolatePlaneStates(from, to, t) {
  const fromAngle = from.angle || 0;
  const angleDelta = normalizeAngle((to.angle || 0) - fromAngle);
  return {
    x: (from.x ?? 0) + ((to.x ?? 0) - (from.x ?? 0)) * t,
    y: (from.y ?? 0) + ((to.y ?? 0) - (from.y ?? 0)) * t,
    angle: normalizeAngle(fromAngle + angleDelta * t),
  };
}

function smoothRemoteDisplay(previous, target, now) {
  if (!previous) {
    return { ...target, at: now };
  }
  const distance = Math.hypot((target.x ?? 0) - (previous.x ?? 0), (target.y ?? 0) - (previous.y ?? 0));
  if (!Number.isFinite(distance) || distance > REMOTE_DISPLAY_SNAP_DISTANCE) {
    return { ...target, at: now };
  }
  const dt = clamp((now - (previous.at || now)) / 1000, 0, REMOTE_DISPLAY_MAX_DT_SECONDS);
  const alpha = 1 - Math.exp(-REMOTE_DISPLAY_SMOOTHING * dt);
  const angleDelta = normalizeAngle((target.angle || 0) - (previous.angle || 0));
  return {
    x: (previous.x ?? 0) + ((target.x ?? 0) - (previous.x ?? 0)) * alpha,
    y: (previous.y ?? 0) + ((target.y ?? 0) - (previous.y ?? 0)) * alpha,
    angle: normalizeAngle((previous.angle || 0) + angleDelta * alpha),
    at: now,
  };
}

function RoomPlayerMapDot({ playerId, statesRef, registerGameFrameCallback }) {
  const dotRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const state = statesRef.current[playerId]?.state;
      if (dotRef.current) {
        if (state) {
          dotRef.current.style.display = '';
          dotRef.current.style.left = `${Math.max(2, Math.min(98, (state.x / WORLD_WIDTH) * 100))}%`;
          dotRef.current.style.top = `${Math.max(2, Math.min(98, 100 - ((state.y + 50) / WORLD_HEIGHT) * 100))}%`;
        } else {
          dotRef.current.style.display = 'none';
        }
      }
    };
    return registerGameFrameCallback(GAME_FRAME_PRIORITY.ROOM_MAP_DOTS, update);
  }, [playerId, statesRef, registerGameFrameCallback]);

  return <span ref={dotRef} className="map-bot-dot map-room-player-dot" style={{ display: 'none' }} />;
}

function RemotePlane({ player, statesRef, sfxMuted, audioSettings, fogActive, registerGameFrameCallback }) {
  const planeRef = useRef(null);
  const blastRef = useRef(null);
  const displayRef = useRef(null);
  const crashSoundKeyRef = useRef(null);
  const sfxMutedRef = useRef(sfxMuted);
  const audioSettingsRef = useRef(audioSettings);
  const [visual, setVisual] = useState({
    visible: false,
    crashed: false,
    damaged: false,
    searchLightOn: false,
    propellerActive: false,
    thrust: 0,
  });
  const visualRef = useRef(visual);

  useEffect(() => {
    visualRef.current = visual;
  }, [visual]);

  useEffect(() => {
    sfxMutedRef.current = sfxMuted;
  }, [sfxMuted]);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  useEffect(() => {
    const update = (now) => {
      const currentEntry = statesRef.current[player.id];
      if (!currentEntry?.state) {
        displayRef.current = null;
        if (planeRef.current) planeRef.current.style.display = 'none';
        if (blastRef.current) blastRef.current.style.display = 'none';
        if (visualRef.current.visible) {
          const nextVisual = {
            visible: false,
            crashed: false,
            damaged: false,
            searchLightOn: false,
            propellerActive: false,
            thrust: 0,
          };
          visualRef.current = nextVisual;
          setVisual(nextVisual);
        }
        return;
      }
      const plane = currentEntry.state;
      const crashed = Boolean(plane.crashed);
      if (crashed) {
        const crashKey = plane.crashTime ?? 'crashed';
        if (crashSoundKeyRef.current !== crashKey) {
          crashSoundKeyRef.current = crashKey;
          playPlaneBlastSound(null, plane.crashImpact ?? 1.2, sfxMutedRef.current, audioSettingsRef.current?.explosion ?? 1);
        }
      } else {
        crashSoundKeyRef.current = null;
      }
      const targetDisplay = interpolateRemotePlane(currentEntry, now);
      if (displayRef.current?.crashed !== crashed) {
        displayRef.current = null;
      }
      const display = smoothRemoteDisplay(displayRef.current, targetDisplay, now);
      display.crashed = crashed;
      displayRef.current = display;
      const damaged = (plane.damage ?? 0) > 0 && !crashed;
      if (damaged && !visualRef.current.damaged) flashPlaneHit(planeRef.current);
      const visibleThrust = Math.max(plane.thrust || 0, plane.throttle || 0);
      if (planeRef.current) {
        planeRef.current.style.display = '';
        planeRef.current.style.transform = `translate(${display.x}vw, ${-display.y}vh) rotate(${display.angle}deg)`;
        planeRef.current.classList.toggle('plane-crashed', crashed);
        planeRef.current.classList.toggle('plane-damaged', damaged);
        planeRef.current.style.setProperty('--thrust', visibleThrust);
      }
      if (blastRef.current) {
        blastRef.current.style.display = crashed ? '' : 'none';
        blastRef.current.style.left = `${display.x}vw`;
        blastRef.current.style.bottom = `calc(100% - 2px + ${Math.max(0, display.y)}vh)`;
      }
      const nextVisual = {
        visible: true,
        crashed,
        damaged,
        searchLightOn: Boolean(plane.searchLightOn) && !crashed,
        propellerActive: visibleThrust > 0.05,
        thrust: visibleThrust,
      };
      const currentVisual = visualRef.current;
      if (
        currentVisual.visible !== nextVisual.visible ||
        currentVisual.crashed !== nextVisual.crashed ||
        currentVisual.damaged !== nextVisual.damaged ||
        currentVisual.searchLightOn !== nextVisual.searchLightOn ||
        currentVisual.propellerActive !== nextVisual.propellerActive ||
        Math.abs(currentVisual.thrust - nextVisual.thrust) > 0.18
      ) {
        visualRef.current = nextVisual;
        setVisual(nextVisual);
      }
    };
    return registerGameFrameCallback(GAME_FRAME_PRIORITY.ROOM_REMOTE_PLANES, update);
  }, [player.id, statesRef, registerGameFrameCallback]);

  const initialEntry = statesRef.current[player.id];
  const initialDisplay = initialEntry
    ? interpolateRemotePlane(initialEntry, performance.now())
    : { x: START_X, y: 0, angle: 16 };

  return (
    <div className="player-plane-layer remote-plane-layer" aria-label={`${player.name} plane`}>
      <div
        ref={planeRef}
        className={`player-plane remote-plane${visual.crashed ? ' plane-crashed' : ''}${visual.damaged ? ' plane-damaged' : ''}`}
        style={{
          display: visual.visible ? undefined : 'none',
          transform: `translate(${initialDisplay.x}vw, ${-initialDisplay.y}vh) rotate(${initialDisplay.angle}deg)`,
          '--thrust': visual.thrust,
        }}
      >
        <BitPlane
          rocketsRemaining={0}
          planeColor={player.color || 'blue'}
          planeLightCombo="classic"
          searchLightActive={visual.searchLightOn}
          searchLightFog={fogActive}
          propellerActive={visual.propellerActive}
        />
      </div>
      <span
        ref={blastRef}
        className="blast remote-blast"
        style={{
          display: visual.crashed ? undefined : 'none',
          left: `${initialDisplay.x}vw`,
          bottom: `calc(100% - 2px + ${Math.max(0, initialDisplay.y)}vh)`,
        }}
        aria-hidden="true"
      >
        <i className="blast-flash" />
        <i className="blast-core" />
        <i className="blast-sparks" />
        <i className="smoke smoke-one" />
        <i className="smoke smoke-two" />
        <i className="smoke smoke-three" />
        <i className="smoke smoke-four" />
        <i className="smoke smoke-five" />
      </span>
    </div>
  );
}

function RoomProjectilesLayer({
  active,
  projectiles,
  projectilesRef,
  projectileElementRefs,
  replaceProjectiles,
  playerStateRef,
  registerGameFrameCallback,
}) {
  useEffect(() => {
    if (!active) {
      replaceProjectiles([]);
      projectileElementRefs.current.clear();
      return undefined;
    }

    let last = performance.now();
    const update = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let changed = false;
      const playerState = playerStateRef.current;
      const nextProjectiles = [];

      for (const projectile of projectilesRef.current) {
        if (projectile.weapon === 'rocket') {
          const updated = updateGuidedRocket(projectile, now, playerState && !playerState.crashed ? [{ type: 'player', state: playerState }] : []);
          if (!updated || (updated.groundHit && now - updated.impactAt > ROCKET_IMPACT_MS)) {
            changed = true;
            projectileElementRefs.current.delete(projectile.id);
            continue;
          }
          const segment = getRocketSegment(updated);
          if (playerState && !playerState.crashed && !updated.groundHit && segmentHitsPlane(segment, playerState, updated.radius ?? 2.25)) {
            // Collision damage is decided by the room server. Keep rendering
            // until its next authoritative snapshot removes this projectile.
          }
          nextProjectiles.push(updated);
          const element = projectileElementRefs.current.get(updated.id);
          if (element) {
            setWorldTransformPosition(element, updated.x, updated.y);
            element.style.setProperty('--rocket-angle', `${updated.angle}deg`);
          }
          if (updated !== projectile) changed = true;
          continue;
        }

        const age = now - projectile.created;
        if (age > projectile.life + (projectile.groundHit ? 420 : 0)) {
          changed = true;
          projectileElementRefs.current.delete(projectile.id);
          continue;
        }
        const segment = getProjectileSegment(projectile, now);
        if (playerState && !playerState.crashed && !projectile.groundHit && bulletSegmentHitsPlane(segment, playerState, projectile.radius ?? BULLET_HIT_RADIUS)) {
          // The client never reports its own hit result to the server.
        }
        const point = getProjectilePoint(projectile, now);
        projectile.renderX = point.x;
        projectile.renderY = point.y;
        const element = projectileElementRefs.current.get(projectile.id);
        if (element) {
          setWorldTransformPosition(element, point.x, point.y);
        }
        nextProjectiles.push(projectile);
      }

      if (changed || nextProjectiles.length !== projectilesRef.current.length) {
        replaceProjectiles(nextProjectiles);
      }
    };

    const unregister = registerGameFrameCallback(GAME_FRAME_PRIORITY.ROOM_PROJECTILES, update);
    return () => {
      unregister();
      projectileElementRefs.current.clear();
    };
  }, [active, playerStateRef, projectileElementRefs, projectilesRef, replaceProjectiles, registerGameFrameCallback]);

  const bullets = projectiles.filter((projectile) => projectile.weapon !== 'rocket');
  const rockets = projectiles.filter((projectile) => projectile.weapon === 'rocket');

  if (!active) return null;

  return (
    <div className="room-projectiles-layer" aria-hidden="true">
      <div className="bullet-projectiles room-bullet-projectiles">
        {bullets.map((projectile) => (
          <span
            key={projectile.id}
            ref={(element) => {
              if (element) projectileElementRefs.current.set(projectile.id, element);
              else projectileElementRefs.current.delete(projectile.id);
            }}
            className={`bullet-shot room-bullet-shot${projectile.groundHit ? ' bullet-ground-hit' : ''}`}
            style={{
              '--world-x': `${projectile.renderX ?? projectile.x}vw`,
              '--world-y': `${-(projectile.renderY ?? projectile.y)}vh`,
              '--bullet-angle': `${projectile.angle}deg`,
              '--bullet-life': `${projectile.life ?? BULLET_LIFETIME_MS}ms`,
            }}
          >
            <i className="bullet-core" />
            <i className="bullet-impact" />
          </span>
        ))}
      </div>
      <div className="rocket-projectiles room-rocket-projectiles">
        {rockets.map((rocket) => (
          <span
            key={rocket.id}
            ref={(element) => {
              if (element) projectileElementRefs.current.set(rocket.id, element);
              else projectileElementRefs.current.delete(rocket.id);
            }}
            className={`rocket-shot room-rocket-shot${rocket.groundHit ? ' rocket-ground-hit' : ''}`}
            style={{
              '--world-x': `${rocket.x}vw`,
              '--world-y': `${-rocket.y}vh`,
              '--rocket-angle': `${rocket.angle}deg`,
            }}
          >
            <i className="rocket-flame" />
            <i className="rocket-body" />
            <i className="rocket-nose" />
            <i className="rocket-band rocket-band-one" />
            <i className="rocket-band rocket-band-two" />
            <i className="rocket-fin rocket-fin-top" />
            <i className="rocket-fin rocket-fin-bottom" />
            <i className="rocket-impact" />
          </span>
        ))}
      </div>
    </div>
  );
}

function BotPlane({ botIndex, active, paused, restartSignal, playerStateRef, playerApiRef, botStateRefs, botApiRefs, onBotMove, sfxMuted, audioSettings, gameplayRules, fogActive, theme, registerGameFrameCallback }) {
  const botRef = useRef(null);
  const fogActiveRef = useRef(fogActive);
  fogActiveRef.current = fogActive;
  const stateRef = useRef(createInitialBotState());
  const bulletsRef = useRef([]);
  const bulletElementRefs = useRef(new Map());
  const bulletTimeoutsRef = useRef([]);
  const ammoRef = useRef(MAX_BULLETS);
  const reloadingRef = useRef(false);
  const lastShotRef = useRef(0);
  const lastHitAtRef = useRef(-Infinity);
  const botDecisionRef = useRef({ nextAt: 0, mode: '', point: null });
  const botTargetRef = useRef({
    key: null,
    lockedUntil: 0,
    retaliationKey: null,
    retaliationAt: -Infinity,
  });
  const smokePreviousBotRef = useRef(null);
  const botDamageRef = useRef(0);
  const botSmokeParticlesRef = useRef([]);
  const botSmokeLastEmitRef = useRef(0);
  const audioSettingsRef = useRef(audioSettings);
  const gameplayRulesRef = useRef(gameplayRules);
  const [botBullets, setBotBullets] = useState([]);
  const [botDamage, setBotDamage] = useState(0);
  const [botSmokeParticles, setBotSmokeParticles] = useState([]);
  const [botCrashed, setBotCrashed] = useState(false);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  useEffect(() => {
    gameplayRulesRef.current = gameplayRules;
  }, [gameplayRules]);

  const crashBot = useCallback((impact = 1.2, options = {}) => {
    const current = stateRef.current;
    if (current.crashed) return { killed: false };
    const next = {
      ...current,
      crashed: true,
      crashTime: performance.now(),
      crashImpact: clamp(impact, 0.75, 1.8),
      damage: Math.max(2, current.damage ?? 0),
      thrust: 0,
      throttle: 0,
      turnRate: 0,
      vx: 0,
      vy: 0,
    };
    stateRef.current = next;
    botDamageRef.current = next.damage;
    botSmokeParticlesRef.current = [];
    botSmokeLastEmitRef.current = 0;
    setBotDamage(next.damage);
    setBotSmokeParticles([]);
    setBotCrashed(true);
    playPlaneBlastSound(null, next.crashImpact, sfxMuted, audioSettingsRef.current?.explosion ?? 1);
    onBotMove(botIndex, next);
    return { killed: options.source === 'player' };
  }, [botIndex, onBotMove, sfxMuted]);

  const damageBotByBullet = useCallback((options = {}) => {
    const current = stateRef.current;
    if (current.crashed) return { killed: false };
    flashPlaneHit(botRef.current);
    const hitAt = performance.now();
    lastHitAtRef.current = hitAt;
    const attackerKey = options.attackerKey ?? (options.source === 'player' ? 'player' : null);
    if (attackerKey) {
      botTargetRef.current.retaliationKey = attackerKey;
      botTargetRef.current.retaliationAt = hitAt;
    }
    const currentDamage = Math.max(botDamageRef.current, current.damage ?? 0);
    const nextDamage = currentDamage + 1;
    if (nextDamage >= 2) {
      return crashBot(1.18, options);
    }
    const next = {
      ...current,
      damage: nextDamage,
    };
    stateRef.current = next;
    botDamageRef.current = nextDamage;
    playPlaneBulletHitSound(null, sfxMuted, audioSettingsRef.current?.ammo ?? 1);
    setBotDamage(nextDamage);
    onBotMove(botIndex, next);
    return { killed: false };
  }, [botIndex, crashBot, onBotMove, sfxMuted]);

  useEffect(() => {
    if (!botApiRefs?.current?.[botIndex]) return undefined;
    botApiRefs.current[botIndex].current = {
      hitByBullet: damageBotByBullet,
      crash: crashBot,
    };
    return () => {
      if (botApiRefs.current[botIndex]) botApiRefs.current[botIndex].current = null;
    };
  }, [botIndex, botApiRefs, damageBotByBullet, crashBot]);

  useEffect(() => {
    const otherBotSpawnXs = botStateRefs.current
      .filter((_, index) => index !== botIndex)
      .map((botState) => botState?.x)
      .filter((x) => Number.isFinite(x));
    bulletTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    bulletTimeoutsRef.current = [];
    bulletsRef.current = [];
    bulletElementRefs.current.clear();
    ammoRef.current = MAX_BULLETS;
    reloadingRef.current = false;
    lastShotRef.current = 0;
    lastHitAtRef.current = -Infinity;
    botDecisionRef.current = { nextAt: 0, mode: '', point: null };
    botTargetRef.current = {
      key: null,
      lockedUntil: 0,
      retaliationKey: null,
      retaliationAt: -Infinity,
    };
    const nextBot = createInitialBotState(stateRef.current?.x, otherBotSpawnXs);
    if (!active) {
      nextBot.crashed = true;
      nextBot.crashTime = 0;
      nextBot.engaged = false;
    }
    stateRef.current = nextBot;
    smokePreviousBotRef.current = null;
    botDamageRef.current = 0;
    botSmokeParticlesRef.current = [];
    botSmokeLastEmitRef.current = 0;
    setBotBullets([]);
    setBotDamage(0);
    setBotSmokeParticles([]);
    setBotCrashed(!active);
    if (botRef.current) {
      botRef.current.style.transform = `translate(${nextBot.x}vw, ${-nextBot.y}vh) rotate(${nextBot.angle}deg)`;
      botRef.current.style.setProperty('--thrust', 0);
    }
    onBotMove(botIndex, nextBot);
  }, [active, restartSignal, botIndex, botStateRefs, onBotMove]);

  useEffect(() => () => {
    bulletTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    bulletElementRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let last = performance.now();
    let accumulator = 0;
    let previousPhysicsState = null;
    const step = 1 / 90;

    const removeBullet = (id) => {
      bulletsRef.current = bulletsRef.current.filter((item) => item.id !== id);
      bulletElementRefs.current.delete(id);
      setBotBullets(bulletsRef.current);
    };

    const startBulletReload = () => {
      if (reloadingRef.current || ammoRef.current >= MAX_BULLETS) return;
      reloadingRef.current = true;
      const timeoutId = window.setTimeout(() => {
        ammoRef.current = MAX_BULLETS;
        reloadingRef.current = false;
        bulletTimeoutsRef.current = bulletTimeoutsRef.current.filter((timeout) => timeout !== timeoutId);
      }, getRuleBulletReloadMs(gameplayRulesRef.current));
      bulletTimeoutsRef.current.push(timeoutId);
    };

    const fireBotBullet = (bot, now) => {
      const rules = gameplayRulesRef.current;
      const botFlightTuning = getBotFlightTuning(rules);
      if (ammoRef.current <= 0 || now - lastShotRef.current < botFlightTuning.bulletCooldownMs) return;
      lastShotRef.current = now;
      ammoRef.current -= 1;
      startBulletReload();
      const projectile = {
        ...createBulletProjectile(bot, now, 'bot-bullet', null, rules),
        impact: 1.08,
      };
      bulletsRef.current = [...bulletsRef.current, projectile];
      setBotBullets(bulletsRef.current);
      const timeoutId = window.setTimeout(() => {
        removeBullet(projectile.id);
        bulletTimeoutsRef.current = bulletTimeoutsRef.current.filter((timeout) => timeout !== timeoutId);
      }, projectile.life + (projectile.groundHit ? 420 : 0));
      bulletTimeoutsRef.current.push(timeoutId);
    };

    const getTargetCandidates = (bot) => {
      const candidates = [];
      const player = playerStateRef.current;
      if (player && !player.crashed) {
        const dx = player.x - bot.x;
        const dy = player.y - bot.y;
        candidates.push({
          key: 'player',
          type: 'player',
          state: player,
          api: playerApiRef.current,
          distance: Math.max(1, Math.hypot(dx, dy)),
          dx,
          dy,
        });
      }
      botStateRefs.current.forEach((otherBot, index) => {
        if (index === botIndex || !otherBot || otherBot.crashed) return;
        const dx = otherBot.x - bot.x;
        const dy = otherBot.y - bot.y;
        candidates.push({
          key: `bot:${index}`,
          type: 'bot',
          index,
          state: otherBot,
          api: botApiRefs.current[index]?.current,
          distance: Math.max(1, Math.hypot(dx, dy)),
          dx,
          dy,
        });
      });
      return candidates;
    };

    const getBotGroundClearance = (bot) => Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(bot, point).y));

    const damageTargetByBullet = (target) => {
      if (!target?.api) return;
      if (target.type === 'player') {
        if ((target.state.damage ?? 0) <= 0) target.api.playHitSound?.();
        target.api.hitByBullet?.({ skipHitSound: true });
        return;
      }
      target.api.hitByBullet?.({ source: 'bot', attackerKey: `bot:${botIndex}` });
    };

    const crashTarget = (target, impact) => {
      if (!target?.api) return;
      target.api.crash?.(impact);
    };

    const updateBotBulletRenders = (now) => {
      syncProjectileRenderPositions(bulletsRef.current, now, bulletElementRefs.current);
    };

    const scanProjectileHits = (now, bot) => {
      for (const projectile of bulletsRef.current) {
        const segment = getProjectileSegment(projectile, now);
        const target = getTargetCandidates(bot).find((candidate) => bulletSegmentHitsPlane(segment, candidate.state, projectile.radius ?? BULLET_HIT_RADIUS));
        if (target) {
          removeBullet(projectile.id);
          damageTargetByBullet(target);
          return;
        }
      }
    };

    const scanHits = (now, bot) => {
      const collisionTarget = getTargetCandidates(bot).find((target) => planesCollide(bot, target.state));
      if (collisionTarget) {
        if (collisionTarget.type === 'bot') {
          const dx = bot.x - collisionTarget.state.x;
          const dy = bot.y - collisionTarget.state.y;
          const rawDistance = Math.hypot(dx, dy);
          const fallbackAngle = (botIndex + 1) * 2.399;
          const awayX = rawDistance > 0.1 ? dx / rawDistance : Math.cos(fallbackAngle);
          const awayY = rawDistance > 0.1 ? dy / rawDistance : Math.sin(fallbackAngle);
          const correction = clamp(3.4 - rawDistance, 0.55, 1.8);
          // Resolve only the physical overlap. Nearby planes that are not
          // intersecting retain their original paths and may fly side by side.
          bot.x = clamp(bot.x + awayX * correction, 5, WORLD_WIDTH - 5);
          bot.y = clamp(bot.y + awayY * correction, 0.35, WORLD_HEIGHT - 10);
          bot.vx += awayX * 1.4;
          bot.vy += awayY * 1.4;
          bot.turnRate *= 0.82;
          scanProjectileHits(now, bot);
          return;
        }
        crashBot(1.8);
        crashTarget(collisionTarget, 1.8);
        return;
      }
      scanProjectileHits(now, bot);
    };

    const angleToPoint = (source, target) => {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      return normalizeAngle((Math.atan2(dy, -dx) * 180) / Math.PI);
    };

    const crashBotState = (bot, impact, now) => ({
      ...bot,
      crashed: true,
      crashTime: now,
      crashImpact: clamp(impact, 0.75, 1.8),
      damage: Math.max(2, bot.damage ?? 0),
      engaged: false,
      thrust: 0,
      throttle: 0,
      turnRate: 0,
      vx: 0,
      vy: 0,
    });

    const simulateBot = (current, dt, now) => {
      const next = { ...current };
      const botFlightTuning = getBotFlightTuning(gameplayRulesRef.current, fogActiveRef.current);
      const targetCandidates = getTargetCandidates(next);
      const targetChoice = selectBotCombatTarget(
        next,
        targetCandidates,
        botTargetRef.current,
        now,
        botIndex,
        botFlightTuning,
      );
      botTargetRef.current.key = targetChoice.key;
      botTargetRef.current.lockedUntil = targetChoice.lockedUntil;
      const closestTarget = targetChoice.target;
      const liveTarget = Boolean(closestTarget);
      const distance = closestTarget?.distance ?? Infinity;
      next.engaged = liveTarget && distance < botFlightTuning.forgetDistance;
      const altitudePlan = planBotAltitude(next, botIndex, dt, next.engaged, now);
      next.lowFlightSeconds = altitudePlan.lowFlightSeconds;
      next.altitudeRecovery = altitudePlan.altitudeRecovery;
      const pursuing = next.engaged && !altitudePlan.overridePursuit;
      const targetState = closestTarget?.state;
      const collisionThreat = findBotCollisionThreat(next, targetCandidates, botFlightTuning);
      const avoidingCollision = Boolean(collisionThreat);
      const groundClearance = getBotGroundClearance(next);
      const groundThreat = getBotGroundThreat(next, groundClearance, botFlightTuning);
      const recoveringFromGround = Boolean(groundThreat);

      const rawTarget = pursuing
        ? (distance < botFlightTuning.fireMaxDistance
          ? getBotAimPoint(next, targetState, distance, now, botIndex, botFlightTuning, (window.innerWidth || 1440) / (window.innerHeight || 900), getRulePace(gameplayRulesRef.current, 'bulletPace'))
          : getBotPursuitPoint(targetState, distance, botFlightTuning))
        : altitudePlan.target;
      const decisionMode = pursuing ? 'pursuit' : altitudePlan.overridePursuit ? 'climb' : 'roam';
      if (
        !botDecisionRef.current.point ||
        botDecisionRef.current.mode !== decisionMode ||
        now >= botDecisionRef.current.nextAt
      ) {
        botDecisionRef.current = {
          mode: decisionMode,
          point: rawTarget,
          nextAt: now + botFlightTuning.decisionIntervalMs,
        };
      }
      const target = { ...botDecisionRef.current.point };

      if (pursuing && targetState) {
        const combatOffset = getBotCombatOffset(
          next,
          targetState,
          now,
          botIndex,
          lastHitAtRef.current,
          botFlightTuning,
        );
        target.x += combatOffset.x;
        target.y += combatOffset.y;
      }

      if (avoidingCollision) {
        const threatDistance = Math.max(0.15, collisionThreat.distance);
        const awayX = -collisionThreat.dx / threatDistance;
        const awayY = -collisionThreat.dy / threatDistance;
        const side = ((botIndex + (collisionThreat.index ?? 0)) % 2 === 0) ? 1 : -1;
        const lateralX = -awayY * side;
        const lateralY = awayX * side;
        target.x = clamp(
          next.x + lateralX * botFlightTuning.collisionSidestep + awayX * 5,
          18,
          WORLD_WIDTH - 18,
        );
        target.y = clamp(
          next.y + lateralY * botFlightTuning.collisionSidestep + awayY * 5,
          4,
          WORLD_HEIGHT - 42,
        );
      }
      if (next.y > WORLD_HEIGHT - 28) target.y = Math.min(target.y, WORLD_HEIGHT - 65);
      if (next.x < 34) {
        target.x = 105;
      }
      if (next.x > WORLD_WIDTH - 34) {
        target.x = WORLD_WIDTH - 105;
      }
      if (recoveringFromGround) {
        const forwardDirection = Math.abs(next.vx) > 2 ? Math.sign(next.vx) : next.x < WORLD_WIDTH / 2 ? 1 : -1;
        target.x = clamp(next.x + forwardDirection * 44, 24, WORLD_WIDTH - 24);
        target.y = Math.max(
          target.y,
          botFlightTuning.groundRecoveryAltitude,
          next.y + botFlightTuning.groundRecoveryAltitude * 0.55,
        );
      }

      const desiredAngle = angleToPoint(next, target);
      const angleError = normalizeAngle(desiredAngle - next.angle);
      const speed = Math.hypot(next.vx, next.vy);
      const turnLimit = botFlightTuning.turnLimitBase + clamp(speed / 40, 0, 1) * botFlightTuning.turnLimitSpeedBonus;
      const targetTurnRate = clamp(angleError * botFlightTuning.steeringGain, -turnLimit, turnLimit) * 0.55 * flightTurnAuthority(speed, next.thrust);
      next.turnRate += (targetTurnRate - next.turnRate) * Math.min(1, dt * botFlightTuning.turnResponse);
      next.turnRate *= Math.exp(-dt * botFlightTuning.turnDamping);
      next.angle = normalizeAngle(next.angle + next.turnRate * dt);

      const rad = (next.angle * Math.PI) / 180;
      const forwardX = -Math.cos(rad);
      const forwardY = Math.sin(rad);
      const onRunway = !next.airborne && next.y <= 0.08;
      const targetThrottle = recoveringFromGround
        ? 0.92
        : pursuing
          ? (avoidingCollision ? 0.72 : 1)
          : altitudePlan.throttle;
      next.throttle += (targetThrottle - next.throttle) * Math.min(1, dt * (pursuing ? botFlightTuning.pursuitThrottleResponse : botFlightTuning.cruiseThrottleResponse));
      next.thrust += (next.throttle - next.thrust) * Math.min(1, dt * botFlightTuning.thrustResponse);

      if (onRunway) {
        next.y = 0;
        next.vy = 0;
        next.vx += forwardX * botFlightTuning.runwayThrust * next.thrust * dt;
        if (Math.abs(next.vx) > 10.5 && next.thrust > 0.55) {
          next.airborne = true;
          next.vy = Math.max(next.vy, 5.5 + Math.max(0, forwardY) * 8);
        }
      }

      if (next.airborne) {
        const tuning = BOT_FLIGHT_TUNING;
        applyFlightForces(next, dt, { thrust: tuning.flightThrust * AIRBORNE_THRUST_SCALE, cruiseSpeed: tuning.maxLevelSpeed });
      }

      next.x += next.vx * dt;
      next.y += next.vy * dt;

      const shapePoints = planeModel.hitPoints.map((point) => getPlanePoint(next, point));
      const groundLowestPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
      if (next.y > 2 || (next.airborne && groundLowestPoint > 0.55)) next.hasLifted = true;

      const hitWorldEdge = shapePoints.some((point) => point.x <= 0 || point.x >= WORLD_WIDTH);
      const hitGround = next.hasLifted && groundLowestPoint <= 0;
      if (hitGround || hitWorldEdge) {
        if (groundLowestPoint < 0) next.y -= groundLowestPoint;
        return crashBotState(next, Math.max(1.05, Math.hypot(next.vx, next.vy) / 28), now);
      }
      next.x = clamp(next.x, 5, WORLD_WIDTH - 5);
      next.y = clamp(next.y, 0, WORLD_HEIGHT - 10);

      if (pursuing && targetState && next.airborne && next.y > 5) {
        const aimPoint = getBotAimPoint(next, targetState, distance, now, botIndex, botFlightTuning, (window.innerWidth || 1440) / (window.innerHeight || 900), getRulePace(gameplayRulesRef.current, 'bulletPace'));
        const aimAngle = angleToPoint(next, aimPoint);
        const aimError = Math.abs(normalizeAngle(aimAngle - next.angle));
        const aimRad = (next.angle * Math.PI) / 180;
        const aimForwardX = -Math.cos(aimRad);
        const aimForwardY = Math.sin(aimRad);
        const aimLength = Math.max(1, Math.hypot(aimPoint.x - next.x, aimPoint.y - next.y));
        const targetDot = (aimForwardX * (aimPoint.x - next.x) + aimForwardY * (aimPoint.y - next.y)) / aimLength;
        if (
          targetDot > botFlightTuning.fireAimDot &&
          aimError < botFlightTuning.fireAimError &&
          distance > botFlightTuning.fireMinDistance &&
          distance < botFlightTuning.fireMaxDistance
        ) fireBotBullet(next, now);
      }

      return next;
    };

    const renderBot = (bot) => {
      const previousBot = smokePreviousBotRef.current;
      const now = performance.now();
      const nextBotSmokeParticles = updateDamageSmokeParticles(
        botSmokeParticlesRef.current,
        bot,
        previousBot,
        now,
        botDamageRef.current > 0 && !bot.crashed,
        botSmokeLastEmitRef,
      );
      if (nextBotSmokeParticles !== botSmokeParticlesRef.current) {
        botSmokeParticlesRef.current = nextBotSmokeParticles;
        setBotSmokeParticles(nextBotSmokeParticles);
      }
      smokePreviousBotRef.current = { x: bot.x, y: bot.y };
      if (!botRef.current) return;
      botRef.current.style.transform = `translate(${bot.x}vw, ${-bot.y}vh) rotate(${bot.angle}deg)`;
      botRef.current.style.setProperty('--thrust', bot.thrust);
      botRef.current.querySelector('.plane-visual')?.classList.toggle('prop-spinning', bot.thrust > 0.05);
      onBotMove(botIndex, bot);
    };

    const update = (now) => {
      const frameTime = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (paused) {
        renderBot(stateRef.current);
        return;
      }

      let next = stateRef.current;
      if (next.crashed) {
        updateBotBulletRenders(now);
        scanProjectileHits(now, next);
        if (now - next.crashTime > 1650) {
          const otherBotSpawnXs = botStateRefs.current
            .filter((_, index) => index !== botIndex)
            .map((botState) => botState?.x)
            .filter((x) => Number.isFinite(x));
          next = createInitialBotState(next.x, otherBotSpawnXs);
          stateRef.current = next;
          smokePreviousBotRef.current = null;
          botDamageRef.current = 0;
          botSmokeParticlesRef.current = [];
          botSmokeLastEmitRef.current = 0;
          ammoRef.current = MAX_BULLETS;
          reloadingRef.current = false;
          lastHitAtRef.current = -Infinity;
          botDecisionRef.current = { nextAt: 0, mode: '', point: null };
          botTargetRef.current = {
            key: null,
            lockedUntil: 0,
            retaliationKey: null,
            retaliationAt: -Infinity,
          };
          setBotDamage(0);
          setBotSmokeParticles([]);
          setBotCrashed(false);
          onBotMove(botIndex, next);
        }
        renderBot(stateRef.current);
        return;
      }

      accumulator += frameTime;
      let steps = 0;
      while (accumulator >= step && steps < 10) {
        previousPhysicsState = next;
        next = simulateBot(next, step, now);
        accumulator -= step;
        steps += 1;
      }
      if (steps >= 10) accumulator = 0;
      stateRef.current = next;
      updateBotBulletRenders(now);
      if (next.crashed) {
        botDamageRef.current = next.damage ?? 2;
        botSmokeParticlesRef.current = [];
        botSmokeLastEmitRef.current = 0;
        setBotDamage(next.damage ?? 2);
        setBotSmokeParticles([]);
        setBotCrashed(true);
        playPlaneBlastSound(null, next.crashImpact, sfxMuted, audioSettingsRef.current?.explosion ?? 1);
        renderBot(stateRef.current);
        return;
      }
      scanHits(now, next);
      renderBot(interpolateFlightState(previousPhysicsState, next, accumulator / step));
    };

    return registerGameFrameCallback(GAME_FRAME_PRIORITY.BOT_START + botIndex, update);
  }, [active, paused, botIndex, botStateRefs, botApiRefs, playerApiRef, playerStateRef, onBotMove, crashBot, sfxMuted, registerGameFrameCallback]);

  if (!active) return null;

  return (
    <div className="player-plane-layer bot-plane-layer" aria-label="Enemy bot plane">
      <div
        ref={botRef}
        className={`player-plane bot-plane${botCrashed ? ' plane-crashed' : ''}${botDamage > 0 && !botCrashed ? ' plane-damaged' : ''}`}
        style={{
          transform: `translate(${stateRef.current.x}vw, ${-stateRef.current.y}vh) rotate(${stateRef.current.angle}deg)`,
          '--thrust': 0,
        }}
      >
        <BitPlane
          rocketsRemaining={0}
          planeColor="purple"
          planeLightCombo="botYellow"
          lightIntensity={theme === 'light' ? 0 : 1}
          searchLightActive={theme !== 'light' && fogActive && !botCrashed}
          searchLightFog={fogActive}
        />
      </div>
      <div className="damage-smoke-layer bot-damage-smoke-layer" aria-hidden="true">
        {botSmokeParticles.map((particle) => (
          <span
            key={particle.id}
            className="damage-smoke-particle"
            style={{
              left: `${particle.x}vw`,
              bottom: `calc(100% - 2px + ${particle.y}vh)`,
              '--damage-smoke-dx': `${particle.dx}vw`,
              '--damage-smoke-dy': `${particle.dy}vh`,
              '--damage-smoke-scale': `${particle.scale}`,
              '--damage-smoke-opacity': `${particle.opacity}`,
              '--damage-smoke-life': `${particle.life}ms`,
            }}
          />
        ))}
      </div>
      <div className="bullet-projectiles bot-bullet-projectiles" aria-hidden="true">
        {botBullets.map((projectile) => (
          <span
            key={projectile.id}
            ref={(element) => {
              if (element) bulletElementRefs.current.set(projectile.id, element);
              else bulletElementRefs.current.delete(projectile.id);
            }}
            className={`bullet-shot bot-bullet-shot${projectile.groundHit ? ' bullet-ground-hit' : ''}`}
            style={{
              '--world-x': `${projectile.renderX ?? projectile.x}vw`,
              '--world-y': `${-(projectile.renderY ?? projectile.y)}vh`,
              '--bullet-angle': `${projectile.angle}deg`,
              '--bullet-life': `${projectile.life ?? BULLET_LIFETIME_MS}ms`,
            }}
          >
            <i className="bullet-core" />
            <i className="bullet-impact" />
          </span>
        ))}
      </div>
      {botCrashed && (
        <span
          className="blast bot-blast"
          style={{
            left: `${stateRef.current.x}vw`,
            bottom: `calc(100% - 2px + ${Math.max(0, stateRef.current.y)}vh)`,
          }}
          aria-hidden="true"
        >
          <i className="blast-flash" />
          <i className="blast-core" />
          <i className="blast-sparks" />
          <i className="smoke smoke-one" />
          <i className="smoke smoke-two" />
          <i className="smoke smoke-three" />
          <i className="smoke smoke-four" />
          <i className="smoke smoke-five" />
        </span>
      )}
    </div>
  );
}

function BitPlane({ rocketsRemaining, planeColor, planeLightCombo, lightIntensity = 1, searchLightActive = false, searchLightFog = false, propellerActive = false }) {
  const planeAssets = PLANE_COLOR_ASSETS[planeColor] || PLANE_COLOR_ASSETS.blue;
  const lightCombo = PLANE_LIGHT_COMBOS[planeLightCombo] || PLANE_LIGHT_COMBOS.classic;
  return (
    <div
      className={`plane-visual${searchLightActive ? ' search-light-active' : ''}${searchLightFog ? ' search-light-fog' : ''}${propellerActive ? ' prop-spinning' : ''}`}
      style={{
        '--plane-front-light': lightCombo.front,
        '--plane-back-light': lightCombo.back,
        '--plane-front-light-glow': lightCombo.frontGlow,
        '--plane-front-light-glow-soft': lightCombo.frontGlowSoft,
        '--plane-front-light-glow-wide': lightCombo.frontGlowWide,
        '--plane-back-light-glow': lightCombo.backGlow,
        '--plane-back-light-glow-soft': lightCombo.backGlowSoft,
        '--plane-back-light-glow-wide': lightCombo.backGlowWide,
        '--plane-light-intensity': lightIntensity,
        '--plane-body-filter': planeAssets.filter || 'none',
      }}
    >
      <span className="plane-search-light" aria-hidden="true" />
      <img className="plane-sprite plane-sprite-static" src={planeAssets.staticSrc} alt={`Left facing ${planeAssets.label.toLowerCase()} pixel biplane`} draggable="false" />
      <img className="plane-sprite plane-sprite-no-prop" src={planeAssets.noPropSrc} alt="" draggable="false" aria-hidden="true" />
      <span className="plane-propeller" aria-hidden="true" />
      <span className="plane-nav-light plane-nav-light-front" aria-hidden="true" />
      <span className="plane-nav-light plane-nav-light-back" aria-hidden="true" />
      <span className={`plane-rocket-loadout plane-rocket-one${rocketsRemaining < 2 ? ' plane-rocket-spent' : ''}`} aria-hidden="true">
        <i className="plane-rocket-tip" />
        <i className="plane-rocket-body" />
        <i className="plane-rocket-band" />
        <i className="plane-rocket-fin" />
      </span>
      <span className={`plane-rocket-loadout plane-rocket-two${rocketsRemaining < 1 ? ' plane-rocket-spent' : ''}`} aria-hidden="true">
        <i className="plane-rocket-tip" />
        <i className="plane-rocket-body" />
        <i className="plane-rocket-band" />
        <i className="plane-rocket-fin" />
      </span>
    </div>
  );
}

function Cloud({ x, y, s, speed, variant }) {
  if (variant === 1) {
    return (
      <svg className="cloud" style={{ left: `${x}vw`, bottom: `${y}vh`, '--cloud-scale': s * 1.18, '--cloud-speed': `${speed}s` }} viewBox="0 0 360 120">
        <g className="cloud-shadow">
          <ellipse cx="55" cy="81" rx="44" ry="21" />
          <ellipse cx="122" cy="62" rx="70" ry="38" />
          <ellipse cx="198" cy="77" rx="56" ry="24" />
          <ellipse cx="268" cy="76" rx="48" ry="23" />
          <ellipse cx="321" cy="82" rx="28" ry="15" />
        </g>
        <g className="cloud-body">
          <ellipse cx="50" cy="70" rx="45" ry="21" />
          <ellipse cx="105" cy="46" rx="55" ry="40" />
          <ellipse cx="155" cy="51" rx="45" ry="34" />
          <ellipse cx="212" cy="72" rx="56" ry="25" />
          <ellipse cx="268" cy="68" rx="49" ry="24" />
          <ellipse cx="321" cy="74" rx="31" ry="16" />
          <path d="M32 74c38-16 70-13 104 3 38 17 86 14 145-6 24-8 48-4 70 10-29 21-76 30-143 27C95 103 39 92 32 74z" />
        </g>
        <g className="cloud-highlight">
          <path d="M46 68c22-10 43-8 63 5" />
          <path d="M106 35c24-12 48-10 72 4" />
          <path d="M227 61c28-9 53-6 75 9" />
        </g>
      </svg>
    );
  }

  if (variant === 2) {
    return (
      <svg className="cloud" style={{ left: `${x}vw`, bottom: `${y}vh`, '--cloud-scale': s, '--cloud-speed': `${speed}s` }} viewBox="0 0 260 120">
        <g className="cloud-shadow">
          <ellipse cx="67" cy="83" rx="45" ry="24" />
          <ellipse cx="123" cy="62" rx="58" ry="41" />
          <ellipse cx="185" cy="75" rx="50" ry="28" />
          <ellipse cx="224" cy="83" rx="29" ry="17" />
        </g>
        <g className="cloud-body">
          <ellipse cx="60" cy="72" rx="48" ry="24" />
          <ellipse cx="105" cy="45" rx="52" ry="39" />
          <ellipse cx="152" cy="45" rx="42" ry="34" />
          <ellipse cx="190" cy="68" rx="52" ry="29" />
          <ellipse cx="229" cy="77" rx="29" ry="16" />
          <path d="M36 76c23-12 50-12 81 0 30 12 68 9 113-7-4 25-26 40-67 44-65 6-108-6-127-37z" />
        </g>
        <g className="cloud-highlight">
          <path d="M50 69c17-9 35-8 54 3" />
          <path d="M103 36c20-10 40-8 59 4" />
          <path d="M171 60c19-7 36-5 51 6" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="cloud" style={{ left: `${x}vw`, bottom: `${y}vh`, '--cloud-scale': s, '--cloud-speed': `${speed}s` }} viewBox="0 0 240 100">
      <g className="cloud-shadow">
        <ellipse cx="66" cy="69" rx="42" ry="23" />
        <ellipse cx="111" cy="58" rx="51" ry="31" />
        <ellipse cx="158" cy="66" rx="39" ry="24" />
        <ellipse cx="193" cy="71" rx="28" ry="17" />
      </g>
      <g className="cloud-body">
        <ellipse cx="58" cy="59" rx="46" ry="22" />
        <ellipse cx="91" cy="42" rx="41" ry="35" />
        <ellipse cx="128" cy="45" rx="33" ry="30" />
        <ellipse cx="166" cy="55" rx="45" ry="31" />
        <ellipse cx="203" cy="61" rx="32" ry="18" />
        <path d="M37 60c15-12 34-13 57-3 22 9 47 10 74-5-4 26-27 39-70 38-39-1-63-10-61-30z" />
      </g>
      <g className="cloud-highlight">
        <path d="M41 58c17-8 31-6 44 3" />
        <path d="M98 34c17-10 34-9 51 3" />
        <path d="M165 47c17-4 29-1 38 9" />
      </g>
    </svg>
  );
}

function Hut({ className, variant, style }) {
  if (variant === 'tall') {
    return (
      <svg className={className} style={style} viewBox="0 0 220 188">
        <path className="hut-shadow" d="M12 174h196v10H12z" />
        <path className="hut-dark" d="M15 72 110 7l96 66-9 12-87-60-86 59z" />
        <path className="hut-roof" d="M29 74 110 18l81 56-9 9-72-49-72 49z" />
        <path className="hut-wall" d="M38 80h144v92H38z" />
        <path className="hut-plank" d="M50 92h120M50 118h120M50 145h120" />
        <path className="hut-dark" d="M85 103h50v69H85z" />
        <path className="hut-trim" d="M86 103h49v69M86 137h49M86 103l49 69M135 103l-49 69" />
        <path className="hut-window" d="M83 48h54v31H83z" />
        <path className="hut-trim" d="M110 49v29M84 64h52" />
        <path className="hut-window" d="M47 109h29v31H47zM145 109h29v31h-29z" />
        <path className="hut-trim" d="M61 110v29M48 124h27M159 110v29M146 124h27" />
        <path className="hut-dark" d="M29 168h162v7H29z" />
        <path className="hut-pixel" d="M68 31h9v9h-9zM143 34h8v8h-8zM188 69h8v8h-8z" />
      </svg>
    );
  }

  if (variant === 'small') {
    return (
      <svg className={className} style={style} viewBox="0 0 188 132">
        <path className="hut-shadow" d="M8 120h172v9H8z" />
        <path className="hut-dark" d="M16 58 75 9l55 45h30v16h-24v49H20V69z" />
        <path className="hut-roof" d="M25 58 75 17l50 41-8 8-42-34-43 34z" />
        <path className="hut-wall" d="M31 67h99v51H31zM131 70h37v48h-37z" />
        <path className="hut-plank" d="M41 79h116M41 97h116" />
        <path className="hut-window" d="M52 80h27v26H52zM95 80h24v26H95z" />
        <path className="hut-trim" d="M65 81v24M53 93h25M107 81v24M96 93h22" />
        <path className="hut-dark" d="M69 41h30v18H69zM148 50h22v18h-22z" />
        <path className="hut-trim" d="M84 42v16M70 50h28" />
        <path className="hut-pixel" d="M140 80h18v5h-18zM144 99h20v5h-20z" />
      </svg>
    );
  }

  return (
    <svg className={className} style={style} viewBox="0 0 204 128">
      <path className="hut-shadow" d="M7 116h190v9H7z" />
      <path className="hut-dark" d="M17 49 102 11l86 39v67H17z" />
      <path className="hut-roof-blue" d="M20 44 102 7l82 37v13H20z" />
      <path className="hut-wall" d="M28 58h149v58H28z" />
      <path className="hut-plank" d="M40 70h125M40 89h125M40 108h125" />
      <path className="hut-window" d="M47 76h30v27H47zM88 76h30v27H88zM130 76h30v27h-30z" />
      <path className="hut-trim" d="M62 77v25M48 89h28M103 77v25M89 89h28M145 77v25M131 89h28" />
      <path className="hut-dark" d="M142 20h27v31h-27z" />
      <path className="hut-roof" d="M137 17h36v9h-36z" />
      <path className="hut-pixel" d="M57 31h36v5H57zM115 31h24v5h-24z" />
    </svg>
  );
}

// Stable irregular spacing; decorations never enter the collision system.
const STREET_LAMP_POSITIONS = hutPlacements
  .map((hut, index) => hut.x + 18 + (index * 7 % 9))
  .filter(x => x < WORLD_WIDTH - 8 && fuelTankPlacements.every(fuel => Math.abs(x - fuel) > 8))
  .filter((_, index) => index % 2 === 0);

function StreetLamp({ x }) {
  return <div className="street-lamp" style={{ left: `${x}vw` }}>
    <span className="street-lamp-pool" />
    <span className="street-lamp-halo" />
    <svg viewBox="0 0 56 100" shapeRendering="crispEdges">
      <path fill="#423528" d="M7 2h9v7h33v7H16v78H5V4h2z" />
      <path fill="#776044" d="M8 5h5v86H8zM16 10h29v4H16z" />
      <path fill="#9b8056" d="M8 5h2v81H8zM17 10h27v2H17z" />
      <path fill="#5c4933" d="M16 34 34 16h6L16 40z" />
      <path fill="#89704a" d="m16 32 16-16h4L16 36z" />
      <path fill="#3d3930" d="M41 8h3v13h-3zM36 24h16v22H36z" />
      <path fill="#837456" d="M39 20h10v3h3v3H35v-3h4zM35 45h18v4H35z" />
      <path fill="#b09a6c" d="M39 21h9v2h-9zM36 45h16v2H36z" />
      <path fill="#b9782c" d="M39 27h10v17H39z" />
      <path fill="#edb14e" d="M40 28h8v15h-8z" />
      <path fill="#ffcf72" d="M42 29h4v13h-4z" />
      <path fill="#48463f" d="M4 90h14v5h3v5H1v-5h3z" />
      <path fill="#777363" d="M5 91h12v4H5zM3 96h16v2H3z" />
      <path fill="#8e7955" d="M11 53h2v9h-2zM8 73h2v4H8z" />
    </svg>
  </div>;
}

function FuelTank({ style, active, className = '' }) {
  return (
    <div className={`fuel-station${active ? ' fuel-station-refill' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <span className="fuel-beacon" aria-hidden="true" />
      <svg className="fuel-tank" viewBox="0 0 118 166">
        <path className="fuel-shadow" d="M33 157h76v7H33z" />
        <path className="fuel-dark" d="M39 4h63l8 8v68H30V13z" />
        <path className="fuel-red" d="M42 11h55l7 7v57H36V20z" />
        <path className="fuel-highlight" d="M48 16h19v54H48zM80 16h17v12H80z" />
        <path className="fuel-panel-dark" d="M43 30h53v45H43z" />
        <path className="fuel-glass" d="M48 37h43v30H48z" />
        <path className="fuel-meter" d="M56 59c9-19 28-18 34 0" />
        <path className="fuel-needle" d="M72 61 86 47" />
        <path className="fuel-base" d="M38 77h62v78H38z" />
        <path className="fuel-base-light" d="M62 80h30v70H62z" />
        <path className="fuel-badge-ring" d="M54 105 70 91l19 14 7 21-17 18H57l-17-18z" />
        <path className="fuel-badge" d="M59 108 70 98l14 10 5 16-12 13H61l-12-13z" />
        <path className="fuel-drop" d="M71 111c8 9 11 14 11 20 0 7-5 11-11 11s-11-4-11-11c0-6 4-12 11-20z" />
        <path className="fuel-hose" d="M33 44h-9l-13 10v25h10v55c0 9 6 16 15 16h12" />
        <path className="fuel-nozzle" d="M6 58h18v34H8zM22 64h9v13h-9z" />
        <path className="fuel-stand" d="M37 155h73v8H37z" />
        <path className="fuel-pixel" d="M42 18h8v8h-8zM96 13h7v8h-7zM10 62h8v7h-8zM61 83h13v8H61z" />
      </svg>
    </div>
  );
}

function CowHerd({ syncSeed, syncStartedAt, serverTimeOffsetRef, onPotty }) {
  const cowElementRefs = useRef(new Map());

  const setCowElement = useCallback((cowId, element) => {
    if (element) cowElementRefs.current.set(cowId, element);
    else cowElementRefs.current.delete(cowId);
  }, []);

  useEffect(() => {
    let frame = 0;
    const syncedStartedAt = Number(syncStartedAt);
    const synced = Boolean(syncSeed) && Number.isFinite(syncedStartedAt);
    const localStartedAt = performance.now() / 1000;
    const pottyPlans = new Map();
    const pottyActive = new Map();

    const update = (now) => {
      const sharedElapsed = synced
        ? (Date.now() + (serverTimeOffsetRef?.current || 0) - syncedStartedAt) / 1000
        : now / 1000 - localStartedAt;

      for (const cow of COW_INSTANCES) {
        const elapsed = sharedElapsed - cow.delay;
        const cycle = Math.floor(elapsed / cow.duration);
        const progress = ((elapsed % cow.duration) + cow.duration) % cow.duration / cow.duration;
        let pottyPlan = pottyPlans.get(cow.id);

        if (!pottyPlan || pottyPlan.cycle !== cycle) {
          pottyPlan = synced
            ? getSyncedCowPottyPlan(syncSeed, cow.id, cycle)
            : (() => {
                const pottyStart = 0.2 + Math.random() * 0.56;
                return {
                  cycle,
                  active: Math.random() < 0.22,
                  x: 24 + Math.random() * (WORLD_WIDTH - 70),
                  start: pottyStart,
                  end: pottyStart + 2 / cow.duration,
                };
              })();
          // Plans use normalized cycle time; keep the pause at two real seconds.
          pottyPlan.end = pottyPlan.start + 2 / cow.duration;
          pottyPlans.set(cow.id, pottyPlan);
        }

        const motion = getCowMotion(progress, cow.graze, pottyPlan, cow.grazeAt);
        const isPottying = Boolean(motion.potty);
        if (isPottying && !pottyActive.get(cow.id)) onPotty(motion.x);
        pottyActive.set(cow.id, isPottying);

        const cowElement = cowElementRefs.current.get(cow.id);
        if (!cowElement) continue;
        cowElement.style.transform = `translateX(${motion.x}vw)`;
        const className = `cow${motion.eating ? ' cow-eating' : isPottying ? ' cow-pottying' : ' cow-walking'}`;
        if (cowElement.className !== className) cowElement.className = className;
      }

      frame = requestAnimationFrame(update);
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [onPotty, serverTimeOffsetRef, syncSeed, syncStartedAt]);

  return (
    <div className="cows">
      {COW_INSTANCES.map((cow) => (
        <Cow key={cow.id} cowId={cow.id} setCowElement={setCowElement} />
      ))}
    </div>
  );
}

function Cow({ cowId, setCowElement }) {
  return (
    <div ref={(element) => setCowElement(cowId, element)} className="cow cow-walking" style={{ transform: 'translateX(-14vw)' }}>
      <svg viewBox="0 0 90 52">
        <g className="cow-core">
          <ellipse className="cow-body" cx="43" cy="27" rx="29" ry="16" />
          <g className="cow-head-wrap">
            <circle className="cow-head" cx="72" cy="21" r="11" />
            <circle cx="76" cy="19" r="2" fill="#111" />
            <g className="chew-mouth">
              <path className="chew-jaw" d="M78 25c3 4 8 4 11 0" />
              <path className="chew-teeth" d="M81 26v4M85 27v4" />
            </g>
            <path d="M68 11 63 3M78 11l6-7" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
        <path className="cow-spot" d="M23 19c7-9 20-4 17 7-3 10-18 8-17-7z" />
        <path className="cow-spot" d="M49 25c5-6 14-4 14 4 0 9-13 9-14-4z" />
        <path className="leg leg-a" d="M24 38v11M57 38v11" />
        <path className="leg leg-b" d="M40 39v10M67 34v13" />
        <path className="cow-tail" d="M14 25C5 22 5 16 13 14" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function getCowMotion(progress, graze, pottyPlan, grazeAt = 60) {
  if (pottyPlan.active && progress >= pottyPlan.start && progress <= pottyPlan.end) {
    return { x: pottyPlan.x, eating: false, potty: true };
  }

  if (pottyPlan.active && progress > pottyPlan.end) {
    return { x: pottyPlan.x + ((progress - pottyPlan.end) / (1 - pottyPlan.end)) * (WORLD_WIDTH + 14 - pottyPlan.x), eating: false };
  }

  if (pottyPlan.active && progress < pottyPlan.start) {
    return { x: -14 + (progress / pottyPlan.start) * (pottyPlan.x + 14), eating: false };
  }

  const grazeStart = Math.max(0.08, Math.min(0.78, (grazeAt + 14) / (WORLD_WIDTH + 28)));
  const grazeEnd = grazeStart + (graze ? 0.055 : 0);
  if (graze && progress >= grazeStart && progress <= grazeEnd) {
    return { x: grazeAt, eating: true };
  }
  if (graze && progress > grazeEnd) {
    return { x: grazeAt + ((progress - grazeEnd) / (1 - grazeEnd)) * (WORLD_WIDTH + 14 - grazeAt), eating: false };
  }
  if (graze && progress < grazeStart) {
    return { x: -14 + (progress / grazeStart) * (grazeAt + 14), eating: false };
  }

  return { x: -14 + progress * (WORLD_WIDTH + 28), eating: false };
}

function GrassPlant({ x, s }) {
  return (
    <svg className="grass-plant" style={{ left: `${x}vw`, '--plant-scale': s }} viewBox="0 0 22 30">
      <path d="M11 29C10 17 10 9 12 2" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" />
      <path d="M11 28C8 19 5 13 2 9M11 28c4-8 7-14 11-18" fill="none" stroke="#55d83f" strokeWidth="3" strokeLinecap="round" />
      <path d="M11 27c-1-6 1-11 5-16" fill="none" stroke="#9cff59" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HayBale({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 112 62">
      <path fill="#9a5d16" d="M12 36h91v14c0 6-7 9-16 9H23c-8 0-14-4-14-10V38z" />
      <path fill="#e8a01f" d="M9 32c0-18 21-28 54-27 30 1 43 12 43 30 0 11-10 17-49 17-35 0-48-7-48-20z" />
      <path fill="#f8c248" d="M19 22c15-10 49-12 78-2M16 32c22 7 56 7 82 0M28 13c-1 14 2 25-4 39M50 8c-4 16 3 30-2 45M80 10c-2 14 5 25 0 42" stroke="#b76b13" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 44h84M22 52h69" stroke="#6b3b11" strokeWidth="4" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}

function RollingHay({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="22" fill="#e59e28" />
      <circle cx="28" cy="28" r="13" fill="none" stroke="#c97913" strokeWidth="5" />
      <path d="M14 29c12-9 22-10 31-2M21 12c3 15 2 28-7 36M37 11c-12 12-15 24-8 36" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

createRoot(document.getElementById('root')).render(<App />);
