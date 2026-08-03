import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  START_X,
  FUEL_SECONDS,
  FUEL_GAUGE_EMPTY_ANGLE,
  FUEL_GAUGE_SWEEP,
  FUEL_GAUGE_ZONE_SIZE,
  MAX_BULLETS,
  BULLET_RELOAD_MS,
  BULLET_COOLDOWN_MS,
  BULLET_LIFETIME_MS,
  AIM_GUIDE_DOT_COUNT,
  MAX_ROCKETS,
  ROCKET_COOLDOWN_MS,
  ROCKET_DETECTION_RANGE,
  ROCKET_HOMING_MS,
  ROCKET_IMPACT_MS,
  ROCKET_LIFETIME_MS,
  BOT_COUNT,
  BOT_WAKE_DISTANCE,
  BOT_FORGET_DISTANCE,
  BOT_AVOID_DISTANCE,
  BOT_MIN_FIRE_DISTANCE,
  BOT_BULLET_COOLDOWN_MS,
  BOT_BULLET_RELOAD_MS,
  MUSIC_TRACKS,
  HIGH_SCORE_STORAGE_KEY,
  ROOM_MAX_PLAYERS,
  ROOM_SPAWN_OFFSETS,
  MULTIPLAYER_WS_URL,
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
  hayObstacles,
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
  updateDamageSmokeParticles,
  createRainAudio,
  playPlaneBulletHitSound,
  playPlaneBlastSound,
  pointHitsHay,
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
const RTC_STATE_CHANNEL_LABEL = 'pixelplanes-state';
const RTC_STATE_CHANNEL_MAX_BUFFERED_BYTES = 64 * 1024;
const FIELD_GUIDE_PAGE_COUNT = 6;
const GAME_FRAME_PRIORITY = {
  PLAYER: 0,
  ROOM_MAP_DOTS: 0.1,
  ROOM_REMOTE_PLANES: 0.2,
  ROOM_PROJECTILES: 0.3,
  BOT_START: 1,
};
const GAME_FRAME_PRIORITIES = [
  GAME_FRAME_PRIORITY.PLAYER,
  GAME_FRAME_PRIORITY.ROOM_MAP_DOTS,
  GAME_FRAME_PRIORITY.ROOM_REMOTE_PLANES,
  GAME_FRAME_PRIORITY.ROOM_PROJECTILES,
  ...Array.from({ length: BOT_COUNT }, (_, index) => GAME_FRAME_PRIORITY.BOT_START + index),
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fieldGuideOpen, setFieldGuideOpen] = useState(false);
  const [fieldGuidePage, setFieldGuidePage] = useState(0);
  const [fieldGuideTurnDirection, setFieldGuideTurnDirection] = useState('next');
  const [fieldGuideTurnKey, setFieldGuideTurnKey] = useState(0);
  const [planeMenuOpen, setPlaneMenuOpen] = useState(false);
  const [planeColor, setPlaneColor] = useState('blue');
  const [planeLightCombo, setPlaneLightCombo] = useState('classic');
  const [activeTrackId, setActiveTrackId] = useState(null);
  const [musicVolume, setMusicVolume] = useState(0.32);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [soundLevels, setSoundLevels] = useState({
    engine: 0.05,
    ammo: 0.1,
    rocket: 0.1,
    explosion: 0.1,
    rain: 0.05,
  });
  const [planeLightIntensity, setPlaneLightIntensity] = useState(1);
  const [shootingStars, setShootingStars] = useState([]);
  const [remoteProjectiles, setRemoteProjectiles] = useState([]);

  useLayoutEffect(() => {
    if (fogActive) setFogAnimationsPaused(false);
  }, [fogActive]);

  const measuredFrameRate = useMeasuredFrameRate();
  const worldRef = useRef(null);
  const mapPointerRef = useRef(null);
  const mapDotRef = useRef(null);
  const mapBotDotRefs = useRef([]);
  const fuelGaugeRef = useRef(null);
  const playerStateRef = useRef(createInitialPlaneState());
  const remotePlayerStatesRef = useRef({});
  const remoteProjectilesRef = useRef([]);
  const remoteProjectileElementRefs = useRef(new Map());
  const gameFrameCallbacksRef = useRef(new Map());
  const roomDamageEventIdsRef = useRef(new Set());
  const localRoomPlayerIdRef = useRef('');
  const lastRoomStateSentRef = useRef(0);
  const roomStateSeqRef = useRef(0);
  const botStateRefs = useRef(createInitialBotStates());
  const playerApiRef = useRef(null);
  const botApiRefs = useRef(Array.from({ length: BOT_COUNT }, () => ({ current: null })));
  const roomSocketRef = useRef(null);
  const pendingRoomPingSentAtRef = useRef(0);
  const rtcPeerConnectionsRef = useRef(new Map());
  const rtcIceServersRef = useRef(RTC_ICE_SERVERS);
  const rtcIceServersPromiseRef = useRef(null);
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
  const musicAudioRef = useRef(null);
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
  }, []);
  const disconnectRoomSocket = useCallback(() => {
    if (roomSocketRef.current) {
      roomSocketRef.current.close();
      roomSocketRef.current = null;
    }
    setLocalRoomPlayerId('');
    setRoomConnectionStatus('idle');
    setRoomPingMs(null);
    pendingRoomPingSentAtRef.current = 0;
    roomStateSeqRef.current = 0;
  }, []);
  const sendRoomMessage = useCallback((message) => {
    const socket = roomSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }, []);
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

  const setupRtcStateChannel = useCallback((remotePlayerId, peerRecord, channel) => {
    if (!remotePlayerId || !peerRecord || !channel) return;
    peerRecord.stateChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data || '{}'));
      } catch {
        return;
      }
      if (message.type !== 'player_state' || !message.state) return;
      updateRemotePlayerState(remotePlayerId, message.state, 0, message.seq || 0);
    });
  }, [updateRemotePlayerState]);

  const sendRoomStateDataChannel = useCallback((state, seq) => {
    if (gameMode !== 'room' || !gameStarted) return false;
    let sent = false;
    const message = JSON.stringify({
      type: 'player_state',
      state,
      seq,
    });
    for (const peer of rtcPeerConnectionsRef.current.values()) {
      const channel = peer.stateChannel;
      if (
        channel?.readyState === 'open' &&
        channel.bufferedAmount < RTC_STATE_CHANNEL_MAX_BUFFERED_BYTES
      ) {
        channel.send(message);
        sent = true;
      }
    }
    return sent;
  }, [gameMode, gameStarted]);

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
      stateChannel: null,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswerPending: false,
      queuedCandidates: [],
      negotiating: false,
      needsNegotiation: false,
      polite: localId > remotePlayerId,
    };
    rtcPeerConnectionsRef.current.set(remotePlayerId, peerRecord);

    if (localId < remotePlayerId) {
      setupRtcStateChannel(
        remotePlayerId,
        peerRecord,
        connection.createDataChannel(RTC_STATE_CHANNEL_LABEL, {
          ordered: false,
          maxRetransmits: 0,
        }),
      );
    }

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      sendVoiceSignal(remotePlayerId, { candidate: event.candidate });
    });

    connection.addEventListener('datachannel', (event) => {
      if (event.channel?.label !== RTC_STATE_CHANNEL_LABEL) return;
      setupRtcStateChannel(remotePlayerId, peerRecord, event.channel);
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
  }, [attachRemoteAudioTrack, negotiateRtcPeer, refreshVoiceStatus, sendVoiceSignal, setupRtcStateChannel, stopRemoteVoiceMeter]);

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

  const connectRoomVoice = useCallback(async () => {
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
  const connectRoomSocket = useCallback(() => new Promise((resolve, reject) => {
    if (!MULTIPLAYER_WS_URL) {
      reject(new Error('Multiplayer server is not configured yet.'));
      return;
    }

    const existing = roomSocketRef.current;
    if (existing?.readyState === WebSocket.OPEN) {
      resolve(existing);
      return;
    }

    setRoomConnectionStatus('connecting');
    const socket = new WebSocket(MULTIPLAYER_WS_URL);
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

      if (message.type === 'room_state') {
        applyServerRoomState(message.room, message.localPlayerId);
      }
      if (message.type === 'room_started') {
        applyServerRoomState(message.room, localRoomPlayerIdRef.current);
        setGameMode('room');
        startGame();
        setRestartSignal((signal) => signal + 1);
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
        setRoomLobby(null);
        setRoomMutedPlayers({});
        replaceRemotePlayerStates({});
        replaceRemoteProjectiles([]);
        clearRoomNotifications();
        setRoomError('Room was deleted by the host.');
        setStartScreen('room');
      }
      if (message.type === 'room_left') {
        setRoomLobby(null);
        setRoomMutedPlayers({});
        replaceRemotePlayerStates({});
        replaceRemoteProjectiles([]);
        clearRoomNotifications();
        setStartScreen('room');
      }
      if (message.type === 'room_error') {
        setRoomError(message.message || 'Room error.');
      }
    });
    socket.addEventListener('close', () => {
      if (roomSocketRef.current === socket) {
        roomSocketRef.current = null;
      }
      setRoomConnectionStatus('idle');
      setRoomPingMs(null);
      pendingRoomPingSentAtRef.current = 0;
      if (!settled) {
        reject(new Error('Could not connect to multiplayer server.'));
      }
    });
    socket.addEventListener('error', () => {
      setRoomConnectionStatus('idle');
      setRoomPingMs(null);
      pendingRoomPingSentAtRef.current = 0;
      if (!settled) {
        reject(new Error('Could not connect to multiplayer server.'));
      }
    });
  }), [applyServerRoomState, clearRoomNotifications, handleVoiceSignal, localRoomPlayerId, pushRoomNotification, replaceRemotePlayerStates, replaceRemoteProjectiles, startGame, updateRemotePlayerState]);
  const pauseGame = useCallback(() => {
    if (!gameStarted) return;
    setPaused((current) => !current);
  }, [gameStarted]);
  const armBotStart = useCallback(() => {
    setGameMode('bots');
    setStartScreen('bot-ready');
    setMusicOpen(false);
    setHelpOpen(false);
    setPlaneMenuOpen(false);
  }, []);
  const armTrainingStart = useCallback(() => {
    setGameMode('training');
    setStartScreen('training-ready');
    setMusicOpen(false);
    setHelpOpen(false);
    setPlaneMenuOpen(false);
  }, []);
  const createRoomLobby = useCallback(async () => {
    setRoomError('');
    setKillCount(0);
    setRoomMutedPlayers({});
    const micEnabled = roomVoiceEnabled;

    if (MULTIPLAYER_WS_URL) {
      try {
        const socket = await connectRoomSocket();
        socket.send(JSON.stringify({
          type: 'create_room',
          name: roomPlayerName,
          theme: roomTheme,
          micEnabled,
          speakerEnabled: roomSpeakerEnabled,
        }));
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
      socket.send(JSON.stringify({
        type: 'join_room',
        code: roomCode,
        name: roomPlayerName,
        micEnabled,
        speakerEnabled: roomSpeakerEnabled,
      }));
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
      unpublishLocalVoiceTrack();
      setRoomVoiceEnabled(false);
      sendRoomMessage({
        type: 'update_audio_settings',
        micEnabled: false,
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
  }, [publishLocalVoiceTrack, requestMicrophonePermission, roomSpeakerEnabled, roomVoiceEnabled, sendRoomMessage, unpublishLocalVoiceTrack]);
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
  const updateAmmoStatus = useCallback((nextStatus) => {
    setAmmoStatus((current) =>
      current.count === nextStatus.count && current.reloading === nextStatus.reloading ? current : nextStatus,
    );
  }, []);
  const updateRocketStatus = useCallback((nextCount) => {
    setRocketCount((current) => (current === nextCount ? current : nextCount));
  }, []);
  const sendRoomProjectile = useCallback((weapon, projectile) => {
    if (gameMode !== 'room' || !gameStarted || !localRoomPlayerIdRef.current) return;
    sendRoomMessage({
      type: 'fire_projectile',
      weapon,
      projectile,
    });
  }, [gameMode, gameStarted, sendRoomMessage]);
  const sendRoomHit = useCallback(({ targetId, projectileId, weapon }) => {
    if (gameMode !== 'room' || !gameStarted || !targetId || !projectileId) return;
    sendRoomMessage({
      type: 'player_hit',
      targetId,
      projectileId,
      weapon,
    });
  }, [gameMode, gameStarted, sendRoomMessage]);
  const sendRoomCrash = useCallback((options = {}) => {
    if (gameMode !== 'room' || !gameStarted || !localRoomPlayerIdRef.current) return;
    sendRoomMessage({
      type: 'player_crashed',
      selfCrash: options.selfCrash !== false,
    });
  }, [gameMode, gameStarted, sendRoomMessage]);
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
    if (gameMode === 'room') {
      if (options.selfCrash !== false) {
        sendRoomMessage({ type: 'player_crashed', selfCrash: true });
      }
      return;
    }
    setKillCount(0);
  }, [gameMode, sendRoomMessage]);
  const toggleRoomPlayerMute = useCallback((playerId) => {
    setRoomMutedPlayers((current) => ({ ...current, [playerId]: !current[playerId] }));
  }, []);
  const restartGame = useCallback(() => {
    disconnectRoomSocket();
    setGameStarted(false);
    setPaused(false);
    setStartScreen('home');
    setGameMode('bots');
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
    playerStateRef.current = createInitialPlaneState();
    botStateRefs.current = createInitialBotStates(botStateRefs.current);
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
  }, [clearRoomNotifications, disconnectRoomSocket, updateCamera, updateFuelGauge]);
  const updatePlayerState = useCallback((nextState) => {
    playerStateRef.current = nextState;
    if (gameMode !== 'room' || !gameStarted || !localRoomPlayerIdRef.current) return;
    const now = performance.now();
    if (now - lastRoomStateSentRef.current < ROOM_STATE_SEND_INTERVAL_MS) return;
    lastRoomStateSentRef.current = now;
    roomStateSeqRef.current += 1;
    const seq = roomStateSeqRef.current;
    sendRoomStateDataChannel(nextState, seq);
    sendRoomMessage({
      type: 'player_state',
      state: nextState,
      seq,
    });
  }, [gameMode, gameStarted, sendRoomMessage, sendRoomStateDataChannel]);
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
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
      musicAudioRef.current.loop = true;
    }
    const audio = musicAudioRef.current;
    const currentSrc = new URL(audio.src || window.location.href, window.location.href).pathname;
    if (activeTrackId === track.id && !audio.paused) {
      audio.pause();
      setActiveTrackId(null);
      return;
    }
    if (currentSrc !== track.src) audio.src = track.src;
    audio.volume = musicVolume;
    audio.play().then(() => setActiveTrackId(track.id)).catch(() => setActiveTrackId(track.id));
  }, [activeTrackId, musicVolume]);

  const updateMusicVolume = useCallback((event) => {
    const nextVolume = Number(event.target.value) / 100;
    setMusicVolume(nextVolume);
    if (musicAudioRef.current) musicAudioRef.current.volume = nextVolume;
  }, []);

  const updateSoundLevel = useCallback((kind, event) => {
    const nextLevel = Number(event.target.value) / 100;
    setSoundLevels((levels) => ({ ...levels, [kind]: nextLevel }));
  }, []);

  const updatePlaneLightIntensity = useCallback((event) => {
    setPlaneLightIntensity(Number(event.target.value) / 100);
  }, []);

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
    if (!musicAudioRef.current) return;
    musicAudioRef.current.pause();
    musicAudioRef.current.src = '';
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
    if (roomLobby?.weather) return undefined;
    let stopped = false;
    let timer = 0;

    const scheduleFog = (delay) => {
      timer = window.setTimeout(() => {
        if (stopped) return;
        setFogActive(true);
        timer = window.setTimeout(() => {
          if (stopped) return;
          setFogActive(false);
          scheduleFog(22000 + Math.random() * 28000);
        }, 13000 + Math.random() * 9000);
      }, delay);
    };

    scheduleFog(4500 + Math.random() * 6500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [roomLobby?.weather]);

  useEffect(() => {
    if (roomLobby?.weather) return undefined;
    let stopped = false;
    let timer = 0;

    const scheduleRain = (delay) => {
      timer = window.setTimeout(() => {
        if (stopped) return;
        setRainActive(true);
        timer = window.setTimeout(() => {
          if (stopped) return;
          setRainActive(false);
          scheduleRain(36000 + Math.random() * 52000);
        }, 14000 + Math.random() * 11000);
      }, delay);
    };

    scheduleRain(15000 + Math.random() * 17000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [roomLobby?.weather]);

  useEffect(() => {
    window.clearTimeout(rainSoundStartTimerRef.current);
    rainSoundStartTimerRef.current = 0;
    if (!rainActive || sfxMuted) {
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
      rainAudio.context.resume?.();
      const t = rainAudio.context.currentTime;
      rainAudio.gain.cancelScheduledValues(t);
      rainAudio.gain.setTargetAtTime(0.105 * soundLevels.rain, t, 0.38);
    }, 850);

    return () => {
      window.clearTimeout(rainSoundStartTimerRef.current);
      rainSoundStartTimerRef.current = 0;
    };
  }, [rainActive, sfxMuted, soundLevels.rain]);

  useEffect(() => {
    const resumeFromPause = (event) => {
      if (!paused || event.code !== 'Space') return;
      event.preventDefault();
      event.stopPropagation();
      setPaused(false);
    };

    window.addEventListener('keydown', resumeFromPause, true);
    return () => window.removeEventListener('keydown', resumeFromPause, true);
  }, [paused]);

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

  useEffect(() => {
    if (gameMode !== 'room' || !gameStarted) return;
    sendRoomMessage({ type: 'update_kills', kills: killCount });
  }, [gameMode, gameStarted, killCount, sendRoomMessage]);

  const roomPlayers = roomLobby?.players ?? [];
  const roomSlots = Array.from({ length: ROOM_MAX_PLAYERS }, (_, index) => roomPlayers[index] ?? null);
  const roomIsHost = roomLobby?.hostId ? roomLobby.hostId === localRoomPlayerId : roomPlayers[0]?.id === 'host';
  const isRoomGame = gameStarted && gameMode === 'room';
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
    <main className={`scene scene-${theme}${paused ? ' scene-paused' : ''}`} aria-label="Animated Bitplanes background">
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
        className={`music-selector${musicOpen ? ' music-selector-open' : ''}`}
        type="button"
        aria-label="Select background music"
        aria-expanded={musicOpen}
        onClick={() => {
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
        aria-label={sfxMuted ? 'Turn game sounds on' : 'Turn game sounds off'}
        aria-pressed={sfxMuted}
        onClick={() => setSfxMuted((muted) => !muted)}
      >
        <img src="/assets/sfx-speaker-icon.svg" alt="" draggable="false" aria-hidden="true" />
      </button>
      <button
        className={`help-toggle${helpOpen ? ' help-toggle-open' : ''}`}
        type="button"
        aria-label="Show game rules"
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
      {!isRoomGame && (
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
        <div className="help-panel" aria-label="Game rules">
          <div className="help-rule"><kbd>W</kbd><span>Thrust</span></div>
          <div className="help-rule"><kbd>A</kbd><span>Turn left</span></div>
          <div className="help-rule"><kbd>D</kbd><span>Turn right</span></div>
          <div className="help-rule"><kbd>S</kbd><span>Slow / land</span></div>
          <div className="help-rule"><kbd>Space</kbd><span>Hold for burst fire</span></div>
          <div className="help-rule"><kbd>R</kbd><span>Rockets</span></div>
          <div className="help-rule"><kbd>L</kbd><span>Front light for fog.</span></div>
          <div className="help-rule help-note"><kbd>Start</kbd><span>Bots fight you and each other.</span></div>
          <div className="help-rule"><kbd>Train</kbd><span>No bots. Practice flying.</span></div>
          <div className="help-rule"><kbd>Land</kbd><span>Touch grass softly on wheels.</span></div>
          <div className="help-rule help-note"><i className="help-fuel-dot" /><span>Purple dots are fuel stations</span></div>
          <div className="help-rule"><i className="help-enemy-dot" /><span>Red dots are enemy bots</span></div>
          <div className="help-rule help-note"><kbd>Fuel</kbd><span>{FUEL_SECONDS} seconds. Station refills and repairs.</span></div>
          <div className="help-rule"><kbd>Ammo</kbd><span>Bullets refill every 7 seconds.</span></div>
          <div className="help-rule"><kbd>Rocket</kbd><span>Tracks targets within {ROCKET_DETECTION_RANGE} units for {ROCKET_HOMING_MS / 1000} seconds; expires after {ROCKET_LIFETIME_MS / 1000} seconds.</span></div>
          <div className="help-rule"><kbd>Hit</kbd><span>First hit smokes, second hit blasts.</span></div>
          <div className="help-rule"><kbd>Score</kbd><span>Kills reset on death. High score stays.</span></div>
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
                <div className="start-title">Bit Planes</div>
                <div className="start-actions start-actions-home">
                  <button className="start-option start-primary" type="button" onClick={armBotStart}>
                    Start
                  </button>
                  <button className="start-option" type="button" onClick={armTrainingStart}>
                    Training
                  </button>
                  <button className="start-option" type="button" onClick={() => setStartScreen('room')}>
                    Room
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
                    aria-label="Open the Bit Planes field guide"
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
                <span>Click</span>
                <kbd>W</kbd>
                <span>thrust or</span>
                <kbd>↑</kbd>
                <span>to start</span>
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
                {(roomError || roomConnectionStatus === 'connecting') && (
                  <div className={`room-status-line${roomError ? ' room-status-error' : ''}`}>
                    {roomError || 'Connecting...'}
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
                {(roomError || roomConnectionStatus === 'connecting') && (
                  <div className={`room-status-line${roomError ? ' room-status-error' : ''}`}>
                    {roomError || 'Connecting...'}
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
            <section className="start-utility-overlay flight-deck-overlay" aria-label="Flight deck sound settings">
              <div className="flight-deck-panel" role="dialog" aria-modal="true" aria-labelledby="flight-deck-title">
                <div className="flight-deck-heading">
                  <h2 id="flight-deck-title">Flight deck</h2>
                  <button className="flight-deck-close" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
                </div>
                <div className="flight-deck-controls">
                  {[
                    ['engine', 'Propeller'],
                    ['ammo', 'Ammo'],
                    ['rocket', 'Rockets'],
                    ['explosion', 'Explosion'],
                    ['rain', 'Rain'],
                  ].map(([kind, label]) => (
                    <label className="flight-deck-control" key={kind}>
                      <span>{label}</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(soundLevels[kind] * 100)}
                        aria-label={`${label} volume`}
                        onChange={(event) => updateSoundLevel(kind, event)}
                      />
                      <output>{Math.round(soundLevels[kind] * 100)}%</output>
                    </label>
                  ))}
                  <label className="flight-deck-control flight-deck-lights">
                    <span>Plane lights</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(planeLightIntensity * 100)}
                      aria-label="Plane blinking light intensity"
                      onChange={updatePlaneLightIntensity}
                    />
                    <output>{Math.round(planeLightIntensity * 100)}%</output>
                  </label>
                </div>
              </div>
            </section>
          )}
          {fieldGuideOpen && startScreen === 'home' && (
            <section className="start-utility-overlay field-guide-overlay" aria-label="Bit Planes field guide">
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
      {paused && (
        <div className="pause-overlay" aria-label="Game paused">
          <div className="pause-center-icon" aria-hidden="true">
            <i />
            <i />
          </div>
        </div>
      )}

      <div
        className="frame-rate-badge"
        aria-label={`Game is running at ${measuredFrameRate || 'measuring'} frames per second`}
      >
        <strong>{measuredFrameRate || '--'}</strong>
        <span>FPS</span>
      </div>
      <div
        className="frame-rate-badge ping-badge"
        aria-label={roomPingMs == null ? 'Room ping is not available' : `Room ping is ${roomPingMs} milliseconds`}
      >
        <strong>{roomPingMs == null ? '--' : roomPingMs}</strong>
        <span>MS</span>
      </div>
      <div ref={mapPointerRef} className="map-pointer" aria-label="Map position">
        {fuelTankPlacements.map((x, index) => (
          <span
            key={index}
            className="map-fuel-dot"
            style={{
              left: `${Math.max(3, Math.min(97, (x / WORLD_WIDTH) * 100))}%`,
            }}
          />
        ))}
        {gameMode === 'bots' && botStateRefs.current.map((botState, index) => (
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
          <RocketMeter rocketCount={rocketCount} />
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
        <div className="sun" style={{ left: `${START_X + 36}vw` }} aria-hidden="true" />
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

        <ForestLayer className="forest forest-back" rows={980} />
        <ForestLayer className="forest forest-front" rows={820} />
        <div className="map-edge-light map-edge-left" aria-hidden="true" />
        <div className="map-edge-light map-edge-right" aria-hidden="true" />

        <div className="ground-band" aria-hidden="true">
          {hutPlacements.map((hut, index) => (
            <Hut key={index} className={`hut hut-${hut.variant}`} variant={hut.variant} style={{ left: `${hut.x}vw` }} />
          ))}
          {fuelTankPlacements.map((x, index) => (
            <FuelTank key={index} active={Boolean(fuelStationPulses[index])} style={{ left: `${x}vw` }} />
          ))}
          {hayPlacements.map((hay, index) =>
            hay.type === 'bale' ? (
              <HayBale key={index} className="hay" style={{ left: `${hay.x}vw` }} />
            ) : (
              <RollingHay key={index} className="roll" style={{ left: `${hay.x}vw` }} />
            ),
          )}
          <PlayablePlane
            onMove={updateCamera}
            onFuelChange={updateFuelGauge}
            onFuelRefill={triggerFuelRefillFeedback}
            onKill={recordPlayerKill}
            onPlayerDeath={resetCurrentKills}
            onAmmoChange={updateAmmoStatus}
            onRocketChange={updateRocketStatus}
            onPlaneState={updatePlayerState}
            onRoomProjectile={sendRoomProjectile}
            onRoomHit={sendRoomHit}
            onRoomCrash={sendRoomCrash}
            roomTargetStatesRef={remotePlayerStatesRef}
            playerApiRef={playerApiRef}
            botStateRefs={botStateRefs}
            botApiRefs={botApiRefs}
            botTargetsActive={gameMode === 'bots'}
            controlsEnabled={gameStarted && !paused}
            paused={paused}
            spawnX={roomSpawnX}
            restartSignal={restartSignal}
            startArmed={startScreen === 'bot-ready' || startScreen === 'training-ready'}
            onPowerStart={startGame}
            planeColor={planeColor}
            planeLightCombo={planeLightCombo}
            sfxMuted={sfxMuted}
            audioSettings={soundLevels}
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
              audioSettings={soundLevels}
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
            localPlayerId={localRoomPlayerId}
            sendRoomMessage={sendRoomMessage}
            registerGameFrameCallback={registerGameFrameCallback}
          />
          {gameMode === 'bots' && botStateRefs.current.map((_, index) => (
            <BotPlane
              key={index}
              botIndex={index}
              active={gameStarted}
              paused={paused}
              restartSignal={restartSignal}
              playerStateRef={playerStateRef}
              playerApiRef={playerApiRef}
              botStateRefs={botStateRefs}
              botApiRefs={botApiRefs}
              onBotMove={updateBotLocator}
              sfxMuted={sfxMuted}
              audioSettings={soundLevels}
              fogActive={fogActive}
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
              <span key={dropping.id} className="potty-dropping" style={{ left: `${dropping.x}%` }} />
            ))}
          </div>
        </div>
      </div>
      {rainActive && (
        <div key={`rain-${theme}`} className="rain-layer rain-layer-active" aria-hidden="true">
          {rainDrops.map((drop) => (
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

function RocketMeter({ rocketCount }) {
  return (
    <div className="rocket-meter" aria-label={`${rocketCount} rockets`}>
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
          <span className="field-guide-kicker">The Bit Planes Gazette</span>
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

function PixelKey({ children, wide = false }) {
  return <kbd className={`gazette-key${wide ? ' gazette-key-wide' : ''}`}>{children}</kbd>;
}

function GuideWelcomePage() {
  return (
    <>
      <GazetteHeader
        issue="FRONT PAGE"
        headline="Welcome to Bit Planes"
        deck="A complete visual report before your first takeoff. Choose a sky, tune your tools, then fly."
      />
      <div className="gazette-layout gazette-layout-welcome">
        <article className="gazette-story-copy gazette-lead-story">
          <p className="gazette-dropcap">B</p>
          <p><strong>Bit Planes is a flying dogfight over one long living map.</strong> Your plane has real momentum, gravity, fuel, landing gear, weapons, weather, music, and a full room mode. The farm stays behind the action: cows walk, grass grows, huts sit behind the runway, and fuel beacons mark safe stops.</p>
          <p>The upper-left controls are always available on the start screen. Use the green gear for sound and beacon settings. Use the green information button to reopen this newspaper. The song note opens background music; the speaker controls game sound; the light bulb switches day and night; the plane button selects your body color and beacon pair.</p>
        </article>
        <aside className="gazette-hero-art" aria-label="Blue Bit Plane illustration">
          <img src="/assets/exact-plane.png" alt="Blue Bit Plane" draggable="false" />
          <span className="gazette-runway" />
          <span className="gazette-hay-bale" />
          <span className="gazette-cloud-mark gazette-cloud-one" />
          <span className="gazette-cloud-mark gazette-cloud-two" />
        </aside>
      </div>
      <div className="gazette-mode-strip">
        <section>
          <span className="gazette-mode-number">1</span>
          <h4>Start</h4>
          <p>Fight four roaming bots. Kills build your score until you crash.</p>
        </section>
        <section>
          <span className="gazette-mode-number">2</span>
          <h4>Training</h4>
          <p>Fly alone. Practice landing, refueling, rockets, music, and weather.</p>
        </section>
        <section>
          <span className="gazette-mode-number">3</span>
          <h4>Room</h4>
          <p>Create or join a six-pilot room with a name and code.</p>
        </section>
      </div>
      <div className="gazette-utility-row" aria-label="Utility button illustrations">
        <div><i className="gazette-utility-icon gazette-utility-settings" aria-hidden="true">*</i><span>Settings</span></div>
        <div><i className="gazette-utility-icon gazette-utility-info" aria-hidden="true">i</i><span>Field guide</span></div>
        <div><i className="gazette-utility-icon gazette-utility-note" aria-hidden="true">♪</i><span>Music</span></div>
        <div><i className="gazette-utility-icon gazette-utility-speaker" aria-hidden="true">))</i><span>Game sound</span></div>
        <div><i className="gazette-utility-icon gazette-utility-help" aria-hidden="true">?</i><span>Quick controls</span></div>
        <div><i className="gazette-utility-icon gazette-utility-plane" aria-hidden="true">&gt;</i><span>Plane colors</span></div>
        <div><i className="gazette-utility-icon gazette-utility-bulb" aria-hidden="true">!</i><span>Day / night</span></div>
      </div>
      <p className="gazette-caption">Start opens after a short launch prompt: hold the thrust key to wake the engine and enter the sky.</p>
    </>
  );
}

function GuideFlightPage() {
  return (
    <>
      <GazetteHeader
        issue="FLIGHT DESK"
        headline="Every key has a job"
        deck="The keyboard diagrams below match the plane controls. Hold thrust to build speed; turning is free and continuous."
      />
      <div className="gazette-flight-layout">
        <section className="gazette-keyboard-story">
          <div className="gazette-keyboard" aria-label="Flight controls keyboard illustration">
            <div className="gazette-keyboard-row"><PixelKey>W</PixelKey><PixelKey wide>UP</PixelKey></div>
            <div className="gazette-keyboard-row"><PixelKey>A</PixelKey><PixelKey>S</PixelKey><PixelKey>D</PixelKey><PixelKey>LEFT</PixelKey><PixelKey>DOWN</PixelKey><PixelKey>RIGHT</PixelKey></div>
            <div className="gazette-keyboard-row"><PixelKey wide>SPACE</PixelKey><PixelKey>R</PixelKey><PixelKey>L</PixelKey></div>
          </div>
          <div className="gazette-control-list">
            <p><PixelKey>W</PixelKey><PixelKey>UP</PixelKey><span><strong>Thrust.</strong> Hold to turn the propeller, build speed, and gain lift. Release it and thrust falls to zero.</span></p>
            <p><PixelKey>A</PixelKey><PixelKey>LEFT</PixelKey><span><strong>Turn left.</strong> Rotates the whole plane without a fixed wheel pivot.</span></p>
            <p><PixelKey>D</PixelKey><PixelKey>RIGHT</PixelKey><span><strong>Turn right.</strong> Combine it with thrust for full loops.</span></p>
            <p><PixelKey>S</PixelKey><PixelKey>DOWN</PixelKey><span><strong>Slow / land.</strong> Reduces speed in the air; on the runway it reverses the plane.</span></p>
            <p><PixelKey wide>SPACE</PixelKey><span><strong>Hold for burst fire.</strong> Bullets fire from the propeller shaft along the dotted aiming line.</span></p>
            <p><PixelKey>R</PixelKey><span><strong>Rockets.</strong> Launches one of the two homing rockets.</span></p>
            <p><PixelKey>L</PixelKey><span><strong>Fog light.</strong> Shows a cone ahead of your propeller.</span></p>
          </div>
        </section>
        <aside className="gazette-flight-sketch">
          <img src="/assets/exact-plane.png" alt="Bit Plane with its flight path" draggable="false" />
          <span className="gazette-flight-vector gazette-flight-vector-thrust">THRUST</span>
          <span className="gazette-flight-vector gazette-flight-vector-gravity">GRAVITY</span>
          <span className="gazette-dotted-aim"><i /><i /><i /><i /></span>
          <span className="gazette-runway" />
          <p><strong>Takeoff:</strong> build runway speed before lift. A soft wheel-first landing is safe; a steep or fast collision is not.</p>
        </aside>
      </div>
      <div className="gazette-safety-strip">
        <div className="gazette-pause-demo"><i /><i /></div>
        <p><strong>Pause:</strong> click the orange pause button. The center pause disc appears. Press <PixelKey wide>SPACE</PixelKey> or click the button again to resume.</p>
        <div className="gazette-restart-demo" aria-hidden="true">↻</div>
        <p><strong>Restart:</strong> the blue restart button resets your local flight, fuel, bullets, and rockets without deleting the room.</p>
      </div>
    </>
  );
}

function GuideNavigationPage() {
  return (
    <>
      <GazetteHeader
        issue="NAVIGATION REPORT"
        headline="Read the whole map at a glance"
        deck="The pale gray locator in the upper right is the map. Its dots and alert edges tell you where to fly next."
      />
      <div className="gazette-navigation-layout">
        <section className="gazette-map-report">
          <div className="gazette-map-demo" aria-label="Map locator dot legend illustration">
            <span className="gazette-map-grid-line gazette-map-grid-a" /><span className="gazette-map-grid-line gazette-map-grid-b" />
            <span className="gazette-map-edge gazette-map-edge-left" /><span className="gazette-map-edge gazette-map-edge-right" />
            <span className="gazette-map-dot gazette-map-dot-player" /><span className="gazette-map-label gazette-map-player-label">YOU</span>
            <span className="gazette-map-dot gazette-map-dot-fuel gazette-map-fuel-one" /><span className="gazette-map-dot gazette-map-dot-fuel gazette-map-fuel-two" />
            <span className="gazette-map-dot gazette-map-dot-enemy gazette-map-enemy-one" /><span className="gazette-map-dot gazette-map-dot-enemy gazette-map-enemy-two" />
          </div>
          <div className="gazette-map-legend">
            <p><i className="gazette-map-dot gazette-map-dot-player" /><span><strong>Green dot:</strong> your Bit Plane.</span></p>
            <p><i className="gazette-map-dot gazette-map-dot-fuel" /><span><strong>Purple dots:</strong> fuel stations.</span></p>
            <p><i className="gazette-map-dot gazette-map-dot-enemy" /><span><strong>Red dots:</strong> bots or other room pilots.</span></p>
            <p><i className="gazette-map-edge-sample" /><span><strong>Red edge:</strong> you are close to the map border. When the full border pulses, turn back or crash.</span></p>
          </div>
        </section>
        <aside className="gazette-hud-report">
          <div className="gazette-performance-demo">
            <div><strong>60</strong><span>FPS</span></div>
            <div><strong>48</strong><span>MS</span></div>
          </div>
          <p><strong>FPS box:</strong> the measured frames currently drawn by your screen. The game uses the browser's animation frame, so it follows the display as closely as the device allows.</p>
          <p><strong>MS box:</strong> multiplayer ping to the room server. Lower milliseconds mean faster room updates.</p>
          <div className="gazette-edge-scene" aria-hidden="true"><span className="gazette-tree-row" /><span className="gazette-edge-glow" /><img src="/assets/exact-plane.png" alt="" draggable="false" /></div>
          <p><strong>World limits:</strong> the forest fades and a red edge glow appears at both map ends. The plane cannot pass either side.</p>
        </aside>
      </div>
      <div className="gazette-aim-note"><span className="gazette-dotted-aim"><i /><i /><i /><i /></span><p><strong>White dotted path:</strong> always shows the straight bullet trajectory from the nose shaft before you fire.</p></div>
    </>
  );
}

function GuideCombatPage() {
  return (
    <>
      <GazetteHeader
        issue="COMBAT AND FUEL"
        headline="Keep the needle green. Keep the sky clear."
        deck="Fuel, ammo, rockets, damage, landing, and scoring all sit in the top HUD."
      />
      <div className="gazette-combat-grid">
        <section className="gazette-fuel-report">
          <div className="gazette-fuel-gauge-demo" aria-hidden="true"><i /><i /><i /><i /><b /><em /></div>
          <h4>{FUEL_SECONDS}-second fuel tank</h4>
          <p>The needle starts horizontal in the green zone, then crosses yellow, orange, and red. A red pulse around the gauge means the engine will soon stop.</p>
          <div className="gazette-fuel-tank-wrap"><FuelTank active={false} /></div>
          <p><strong>Fuel station:</strong> touch the pump itself to refill all fuel. Its beacon and your fuel box pulse green for two seconds. It also repairs the first-hit propeller damage.</p>
        </section>
        <section className="gazette-weapons-report">
          <div className="gazette-ammo-demo" aria-label={`${MAX_BULLETS} bullet meter illustration`}>
            {Array.from({ length: MAX_BULLETS }, (_, index) => <i key={index} className="guide-bullet-art" />)}
          </div>
          <h4>{MAX_BULLETS} bullets</h4>
          <p>Hold <PixelKey wide>SPACE</PixelKey> to burst-fire. Each bullet is straight, leaves the propeller shaft, stops when it hits ground, and refills every seven seconds even when the magazine is partly used.</p>
          <div className="gazette-rockets-demo" aria-label="Two rocket meter illustration"><span className="guide-rocket-art" /><span className="guide-rocket-art" /></div>
          <h4>Two rockets</h4>
          <p>Press <PixelKey>R</PixelKey>. A rocket homes toward the nearest target within {ROCKET_DETECTION_RANGE} units for {ROCKET_HOMING_MS / 1000} seconds. No target? It travels straight ahead, and expires after {ROCKET_LIFETIME_MS / 1000} seconds. Rockets explode on planes or ground.</p>
        </section>
      </div>
      <div className="gazette-damage-report">
        <div className="gazette-damage-planes"><img src="/assets/exact-plane.png" alt="Player plane" draggable="false" /><span className="gazette-hit-one">HIT 1</span><span className="gazette-smoke-puffs"><i /><i /><i /></span><img src="/assets/exact-plane-purple.png" alt="Enemy plane" draggable="false" /><span className="gazette-hit-two">HIT 2</span><span className="gazette-blast-mark">*</span></div>
        <div>
          <h4>Damage, crashes, and score</h4>
          <p><strong>First bullet hit:</strong> propeller smoke begins. <strong>Second bullet hit:</strong> the plane blasts. You also crash on hay, hard ground impacts, the map edge, or another plane. A gentle wheel-first runway landing is safe.</p>
          <p>Bot mode shows <strong>Kills</strong> and <strong>High Score</strong>. A kill counts when your final hit destroys the plane. If you crash yourself, one kill is deducted. Death restores your fuel, bullets, and rockets, then respawns you.</p>
        </div>
      </div>
    </>
  );
}

function GuideWeatherPage() {
  return (
    <>
      <GazetteHeader
        issue="ATMOSPHERE AND AUDIO"
        headline="Tune the night. Cut through the fog."
        deck="Weather makes the field feel alive; the left-side tools keep every sound, light, and song under your control."
      />
      <div className="gazette-weather-layout">
        <section className="gazette-weather-scene">
          <span className="gazette-moon-demo" /><span className="gazette-rain-demo"><i /><i /><i /><i /><i /></span>
          <span className="gazette-fog-demo" /><span className="gazette-fog-demo gazette-fog-demo-two" />
          <img src="/assets/exact-plane.png" alt="Bit Plane using its fog light" draggable="false" />
          <span className="gazette-light-cone" />
          <span className="gazette-beacon-demo gazette-beacon-front" /><span className="gazette-beacon-demo gazette-beacon-back" />
        </section>
        <section className="gazette-weather-copy">
          <h4>Day, night, rain, and fog</h4>
          <p>The bulb button switches the whole world between light and dark mode. In dark mode, the moon, stars, fuel beacons, and plane navigation lights become visible.</p>
          <p>Fog stays low over the farm. Press <PixelKey>L</PixelKey> to project the cone light in front of the plane and reveal what is ahead. Rain starts and fades with its own softer sound.</p>
          <p>Clouds, trees, huts, grass, hay, moving cows, the sun, moon, stars, and occasional shooting stars make up the living background. Hay is scenery until a plane physically collides with it.</p>
          <p>Your plane has two pulsing beacons. The plane selector changes body color, and offers red/green, amber/cyan, or violet/lime beacon pairs. The settings panel controls their intensity.</p>
        </section>
      </div>
      <div className="gazette-audio-report">
        <section className="gazette-music-panel-demo"><img src="/assets/music-note-icon-transparent.png" alt="Music note" draggable="false" /><div>{Array.from({ length: 10 }, (_, index) => <span key={index}>{index + 1}</span>)}</div><b>VOLUME</b><i /></section>
        <section>
          <h4>Music and game sound</h4>
          <p>The note button opens ten songs and the music volume slider. The speaker button mutes or restores engine, bullets, rockets, rain, crashes, and hit sounds without stopping the game.</p>
          <p>The green gear opens individual sliders for propeller, ammo, rocket, rain, and plane beacon brightness. Music keeps its own slider in the song panel.</p>
        </section>
      </div>
    </>
  );
}

function GuideRoomPage() {
  return (
    <>
      <GazetteHeader
        issue="ROOM DISPATCH"
        headline="Share one sky with six pilots"
        deck="Room mode turns the map into a live match: shared weather, shared cows, names, voice, scores, and respawns."
      />
      <div className="gazette-room-layout">
        <section className="gazette-room-flow">
          <div className="gazette-room-step"><span>1</span><div><h4>Create</h4><p>Type your name, choose dark or light, and receive a six-character room code. The host can start with one to six players.</p></div></div>
          <div className="gazette-room-step"><span>2</span><div><h4>Join</h4><p>Enter your name on the left and the code on the right. Every joining pilot is assigned one of six body colors.</p></div></div>
          <div className="gazette-room-step"><span>3</span><div><h4>Fly together</h4><p>Weather, fog, rain, cows, fuel stations, projectiles, plane lights, deaths, and respawns are shared inside the same room.</p></div></div>
        </section>
        <aside className="gazette-lobby-demo" aria-label="Room lobby illustration">
          <div className="gazette-room-code-demo"><span>CODE</span><strong>SKY742</strong></div>
          <div className="gazette-room-theme-demo"><b>Dark</b><span>Light</span></div>
          {PLANE_COLOR_OPTIONS.slice(0, 6).map((option, index) => (
            <div key={option.id} className="gazette-room-player-demo"><img src={option.staticSrc} alt="" draggable="false" /><span>{index === 0 ? 'Host pilot' : `Pilot ${index + 1}`}</span></div>
          ))}
        </aside>
      </div>
      <div className="gazette-leaderboard-report">
        <section className="gazette-leaderboard-demo">
          <h4>LEADERBOARD</h4>
          <p><b>1</b><span>Player One</span><strong>4</strong><i className="gazette-mic-demo">M</i><i className="gazette-speaker-demo">S</i><em><u /><u /><u /></em></p>
          <p><b>2</b><span>Player Two</span><strong>2</strong><i className="gazette-speaker-demo">S</i><em><u /><u /><u /></em></p>
        </section>
        <section>
          <h4>Voice, score, and room rules</h4>
          <p>In the lobby, use <strong>Mic</strong> and <strong>Speaker</strong> controls before starting. In the live leaderboard, your own row has mic and speaker controls. Other pilots show speaker only, so you can mute an individual player without changing their microphone.</p>
          <p>Green voice bars react to microphone volume. Higher kills rise in the leaderboard. When a pilot leaves, everyone receives a message. A plane death respawns that pilot; it does not reload or reset the room.</p>
        </section>
      </div>
      <p className="gazette-caption">Room host: change the room theme, start the match, leave, or delete the room. If the host leaves normally, another player becomes host.</p>
    </>
  );
}

function PlayablePlane({
  onMove,
  onFuelChange,
  onFuelRefill,
  onKill,
  onPlayerDeath,
  onAmmoChange,
  onRocketChange,
  onPlaneState,
  onRoomProjectile,
  onRoomHit,
  onRoomCrash,
  roomTargetStatesRef,
  playerApiRef,
  botStateRefs,
  botApiRefs,
  botTargetsActive,
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
  const blastRef = useRef(null);
  const engineAudioRef = useRef(null);
  const crashSoundRef = useRef(null);
  const sfxMutedRef = useRef(sfxMuted);
  const audioSettingsRef = useRef(audioSettings);
  const controlsEnabledRef = useRef(controlsEnabled);
  const pausedRef = useRef(paused);
  const startArmedRef = useRef(startArmed);
  const onPowerStartRef = useRef(onPowerStart);
  const smokePreviousPlaneRef = useRef(null);
  const damageLevelRef = useRef(0);
  const damageSmokeParticlesRef = useRef([]);
  const damageSmokeLastEmitRef = useRef(0);
  const fuelRefillFeedbackRef = useRef({ stationIndex: -1, time: 0 });
  const bulletTrajectoryRef = useRef(getBulletTrajectory(createInitialPlaneState(spawnX)));
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
  const stateRef = useRef(createInitialPlaneState(spawnX));
  const searchLightOnRef = useRef(false);
  const [projectiles, setProjectiles] = useState([]);
  const [rocketProjectiles, setRocketProjectiles] = useState([]);
  const [rocketsRemaining, setRocketsRemaining] = useState(MAX_ROCKETS);
  const [crashed, setCrashed] = useState(false);
  const [damageLevel, setDamageLevel] = useState(0);
  const [damageSmokeParticles, setDamageSmokeParticles] = useState([]);
  const [searchLightOn, setSearchLightOn] = useState(false);

  useEffect(() => {
    if (restartSignal === 0) return;
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
    const next = createInitialPlaneState(spawnX);
    stateRef.current = next;
    searchLightOnRef.current = false;
    bulletTrajectoryRef.current = getBulletTrajectory(next);
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
        playPlaneBulletHitSound(engineAudioRef.current?.context, sfxMutedRef.current);
      },
      hitByBullet: (options = {}) => {
        const current = stateRef.current;
        if (current.crashed) return;
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
        if (!options.skipHitSound) playPlaneBulletHitSound(engineAudioRef.current?.context, sfxMutedRef.current);
        setDamageLevel(nextDamage);
        onPlaneState(next);
      },
      crash: crashPlayer,
    };
    return () => {
      if (playerApiRef.current) playerApiRef.current = null;
      crashCurrentPlaneRef.current = null;
    };
  }, [playerApiRef, onPlayerDeath, onPlaneState]);

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
    controlsEnabledRef.current = controlsEnabled;
    if (controlsEnabled) return;
    keysRef.current.clear();
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
        engineAudioRef.current.context.resume?.();
        return engineAudioRef.current;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      const context = new AudioContextClass();
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
      }, BULLET_RELOAD_MS);
    };

    const playBulletSound = () => {
      if (sfxMutedRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      context.resume?.();

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
      context.resume?.();

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
      if (crashedRef.current || ammoRef.current <= 0 || now - lastShotRef.current < BULLET_COOLDOWN_MS) return;
      lastShotRef.current = now;
      playBulletSound();

      const trajectory = getBulletTrajectory(planeState);
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
    };

    const queueBulletFire = () => {
      fireQueuedRef.current = true;
    };
    fireBulletRef.current = fireBulletFromPlane;

    const fireRocket = () => {
      const now = performance.now();
      if (crashedRef.current || rocketsRef.current <= 0 || now - lastRocketRef.current < ROCKET_COOLDOWN_MS) return;
      lastRocketRef.current = now;
      playRocketSound();

      const mountPoint = rocketsRef.current === 2 ? { x: 0.34, y: 0.8 } : { x: 0.52, y: 0.73 };
      const rocket = createRocketProjectile(stateRef.current, now, mountPoint, 'player-rocket');
      onRoomProjectile?.('rocket', rocket);

      rocketProjectilesRef.current = [...rocketProjectilesRef.current, rocket];
      setRocketProjectiles(rocketProjectilesRef.current);

      const nextRockets = rocketsRef.current - 1;
      rocketsRef.current = nextRockets;
      setRocketsRemaining(nextRockets);
      onRocketChange(nextRockets);
    };

    crashSoundRef.current = (impact = 1) => {
      if (sfxMutedRef.current) return;
      const explosionLevel = clamp(audioSettingsRef.current?.explosion ?? 1, 0, 1);
      if (explosionLevel <= 0) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      context.resume?.();

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

    const setKey = (event, pressed) => {
      const isEditableTarget = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (isEditableTarget) return;
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
        return;
      }
      if (action === 'rocket') {
        if (pressed && !event.repeat) fireRocket();
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
    };

    const handleKeyDown = (event) => setKey(event, true);
    const handleKeyUp = (event) => setKey(event, false);
    onAmmoChange({ count: ammoRef.current, reloading: reloadingRef.current });
    onRocketChange(rocketsRef.current);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
    const step = 1 / 120;

    const simulate = (current, keys, dt, now) => {
      const next = { ...current };
      const preStepGroundPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(next, point).y));
      const onRunway = !next.hasLifted && (next.y <= 0.02 || preStepGroundPoint <= 0.18);
      const powerRequested = keys.has('power') && next.fuel > 0;
      if (powerRequested) {
        next.fuel = Math.max(0, next.fuel - dt);
        next.throttle = Math.min(1, next.throttle + dt * 0.8);
      }
      else next.throttle = Math.max(0, next.throttle - dt * 1.35);
      if (keys.has('down')) next.throttle = Math.max(0, next.throttle - dt * 2.65);
      next.thrust += (next.throttle - next.thrust) * Math.min(1, dt * 6.2);
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
      const speedAuthority = clamp(speed / 18, 0, 1);
      const groundAuthority = onRunway ? clamp(Math.abs(next.vx) / 8 + next.thrust * 0.55, 0.28, 0.95) : 1;
      const turnAuthority = clamp(0.35 + speedAuthority * 0.75 + next.thrust * 0.42, 0.38, 1.45) * groundAuthority;
      const targetTurnRate = elevator * (210 + turnAuthority * 165);

      next.turnRate += (targetTurnRate - next.turnRate) * Math.min(1, dt * (elevator ? 18 : 10));
      next.turnRate *= Math.exp(-dt * (elevator ? 0.65 : 3.6));
      next.angle = normalizeAngle(next.angle + next.turnRate * dt);

      const rad = (next.angle * Math.PI) / 180;
      const forwardX = -Math.cos(rad);
      const forwardY = Math.sin(rad);
      const normalX = -Math.sin(rad);
      const normalY = Math.cos(rad);
      const diving = forwardY < -0.15;
      const climbing = forwardY > 0.15;
      const runwaySpeed = Math.abs(next.vx);
      const takeoffReady = runwaySpeed > 14.5 && next.thrust > 0.58 && climbing;

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

      const thrustForce = onRunway ? 56 : 70;
      const thrustBoost = diving ? 1.55 : climbing ? 1.3 : 1;
      next.vx += forwardX * thrustForce * next.thrust * thrustBoost * dt;
      if (!onRunway || takeoffReady) {
        next.vy += forwardY * thrustForce * next.thrust * thrustBoost * dt;
        if (diving) {
          next.vy -= Math.abs(forwardY) * next.thrust * 40 * dt;
        }
      }

      const updatedSpeed = Math.max(0.001, Math.hypot(next.vx, next.vy));
      const velocityX = next.vx / updatedSpeed;
      const velocityY = next.vy / updatedSpeed;
      const alignment = clamp(velocityX * forwardX + velocityY * forwardY, -1, 1);
      const slip = Math.abs(forwardX * velocityY - forwardY * velocityX);
      const liftAuthority = clamp((alignment + 0.2) / 1.2, 0, 1);
      const liftForce = Math.min(42, updatedSpeed * 0.34 * liftAuthority * Math.min(1, slip * 1.7));
      const effectiveLiftForce = liftForce * (diving ? (next.thrust > 0.08 ? 0.16 : 0.45) : 1);
      const propWashLift = diving ? 0 : next.thrust * Math.max(0, normalY) * 2.5;

      if (!onRunway || takeoffReady) {
        next.vx += normalX * effectiveLiftForce * dt;
        next.vy += normalY * (effectiveLiftForce + propWashLift) * dt;
      }

      const gravity = diving ? 20 + next.thrust * 14 : 13.5 + (1 - next.thrust) * 13.5;
      next.vy -= gravity * dt;

      const poweredDive = diving && next.thrust > 0.05;
      const dragBase = poweredDive ? 0.012 + updatedSpeed * 0.0022 : 0.018 + updatedSpeed * 0.0038;
      const slipDrag = slip * slip * (poweredDive ? 0.18 : 0.38);
      const drag = Math.exp(-(dragBase + slipDrag) * dt);
      next.vx *= drag;
      next.vy *= drag;

      if (poweredDive && !onRunway) {
        next.vy -= Math.abs(forwardY) * next.thrust * 46 * dt;
      }

      if (keys.has('down')) {
        const brake = Math.exp(-dt * (onRunway ? 4.2 : 2.4));
        next.vx *= brake;
        next.vy *= brake;
      }

      const cappedSpeed = Math.hypot(next.vx, next.vy);
      const maxSpeed = diving ? 58.8 + next.thrust * 9.2 : climbing ? 54.6 : 42;
      if (cappedSpeed > maxSpeed) {
        const cap = maxSpeed / cappedSpeed;
        next.vx *= cap;
        next.vy *= cap;
      }

      if (onRunway) {
        next.vy = Math.max(0, next.vy);
        next.vx *= Math.exp(-dt * (next.thrust > 0.08 ? 0.45 : 1.25));
        if (takeoffReady) {
          next.vy = Math.max(next.vy, forwardY * (updatedSpeed * 0.26 + next.thrust * 3.4));
        }
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
      const hitHay = hayObstacles.some((hay) => shapePoints.some((point) => pointHitsHay(point, hay)));
      const hitWorldEdge = shapePoints.some((point) => point.x <= 0 || point.x >= WORLD_WIDTH);
      const fuelStationIndex = fuelStationZones.findIndex((station) =>
        shapePoints.some(
          (point) => point.y > 0 && point.y < station.height && point.x > station.x && point.x < station.x + station.width,
        ),
      );
      if (fuelStationIndex >= 0) {
        const hadDamage = (next.damage ?? 0) > 0;
        const shouldRefill = next.fuel < FUEL_SECONDS - 0.05 || hadDamage;
        const lastFeedback = fuelRefillFeedbackRef.current;
        const canPulse = lastFeedback.stationIndex !== fuelStationIndex || now - lastFeedback.time > 1200;
        next.fuel = FUEL_SECONDS;
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
      } else if (hitGround || hitHay || hitWorldEdge) {
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

    const updatePlayerRockets = (now) => {
      if (rocketProjectilesRef.current.length === 0) return;
      const targets = botTargetsActive
        ? botStateRefs.current.map((bot, index) => ({ type: 'bot', index, state: bot }))
        : [];
      const nextRockets = updateGuidedRockets(rocketProjectilesRef.current, now, [...targets, ...getRoomTargets()]);
      if (nextRockets !== rocketProjectilesRef.current) {
        rocketProjectilesRef.current = nextRockets;
        setRocketProjectiles(nextRockets);
      }
    };

    const updatePlayerBulletRenders = (now) => {
      syncProjectileRenderPositions(projectilesRef.current, now, projectileElementRefs.current);
    };

    const scanRoomHits = (now, planeState) => {
      const roomTargets = getRoomTargets();
      if (!roomTargets.length) return;

      if (!planeState.crashed) {
        const collisionTarget = roomTargets.find((target) => planesCollide(planeState, target.state));
        if (collisionTarget) {
          const projectileId = `collision-${collisionTarget.id}-${Math.round(now)}`;
          onRoomHit?.({ targetId: collisionTarget.id, projectileId, weapon: 'collision' });
          onRoomCrash?.({ selfCrash: false });
          crashCurrentPlaneRef.current?.(1.8, { selfCrash: false });
          return;
        }
      }

      for (const projectile of projectilesRef.current) {
        const segment = getProjectileSegment(projectile, now);
        const target = roomTargets.find((candidate) => segmentHitsPlane(segment, candidate.state, projectile.radius ?? 1.05));
        if (target) {
          removeProjectile(projectile.id);
          onRoomHit?.({ targetId: target.id, projectileId: projectile.id, weapon: 'bullet' });
          return;
        }
      }

      for (const projectile of rocketProjectilesRef.current) {
        if (projectile.groundHit) continue;
        const segment = getRocketSegment(projectile);
        const target = roomTargets.find((candidate) => segmentHitsPlane(segment, candidate.state, projectile.radius ?? 2.25));
        if (target) {
          removeRocketProjectile(projectile.id);
          onRoomHit?.({ targetId: target.id, projectileId: projectile.id, weapon: 'rocket' });
          return;
        }
      }
    };

    const scanBotHits = (now) => {
      if (!botTargetsActive) return;
      let handledBulletHit = false;
      for (const projectile of projectilesRef.current) {
        const segment = getProjectileSegment(projectile, now);
        const hitIndex = botStateRefs.current.findIndex((bot) => bot && !bot.crashed && segmentHitsPlane(segment, bot, projectile.radius ?? 1.05));
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
      const frameTime = Math.min((now - last) / 1000, 0.05);
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
        scanBotHits(now);
        scanRoomHits(now, next);
        if (now - next.crashTime > 1450) {
          next = createInitialPlaneState(spawnX);
          searchLightOnRef.current = false;
          bulletTrajectoryRef.current = getBulletTrajectory(next);
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
          onFuelChange(next.fuel / FUEL_SECONDS);
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
      while (accumulator >= step && steps < 8 && !next.crashed) {
        next = simulate(next, keys, step, now);
        accumulator -= step;
        steps += 1;
      }
      if (steps >= 8) {
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
      scanBotHits(now);
      scanRoomHits(now, next);
      onMove({ x: getCameraX(next.x), y: getCameraY(next.y) });
      onFuelChange(next.fuel / FUEL_SECONDS);
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
      renderPlane(next);
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
          const gain = planeState.crashed || sfxMutedRef.current
            ? 0
            : Math.min(0.13, visibleThrust * 0.11) * (audioSettingsRef.current?.engine ?? 1);
          audio.master.gain.setTargetAtTime(gain, t, 0.045);
          audio.rotor.frequency.setTargetAtTime(46 + visibleThrust * 96, t, 0.04);
          audio.buzz.frequency.setTargetAtTime(115 + visibleThrust * 220, t, 0.04);
          audio.growl.frequency.setTargetAtTime(29 + visibleThrust * 58, t, 0.05);
          audio.filter.frequency.setTargetAtTime(520 + visibleThrust * 1350, t, 0.06);
        }
      }
      if (aimGuideDotRefs.current.length > 0) {
        if (planeState.crashed) {
          aimGuideDotRefs.current.forEach((dot) => {
            if (dot) dot.style.opacity = 0;
          });
        } else {
          const bulletTrajectory = getBulletTrajectory(planeState);
          bulletTrajectoryRef.current = bulletTrajectory;
          getBulletGuidePoints(bulletTrajectory).forEach((point, index) => {
            const dot = aimGuideDotRefs.current[index];
            if (!dot) return;
            setWorldTransformPosition(dot, point.x, point.y);
            dot.style.opacity = 1;
          });
        }
      }
      if (blastRef.current) {
        blastRef.current.style.left = `${planeState.x}vw`;
        blastRef.current.style.bottom = `calc(100% - 2px + ${Math.max(0, planeState.y)}vh)`;
      }
    };

    return registerGameFrameCallback(GAME_FRAME_PRIORITY.PLAYER, update);
  }, [spawnX, onMove, onFuelChange, onFuelRefill, onKill, onPlayerDeath, onAmmoChange, onRocketChange, onPlaneState, onRoomHit, onRoomCrash, roomTargetStatesRef, botStateRefs, botApiRefs, botTargetsActive, registerGameFrameCallback]);

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
  localPlayerId,
  sendRoomMessage,
  registerGameFrameCallback,
}) {
  useEffect(() => {
    if (!active) {
      replaceProjectiles([]);
      projectileElementRefs.current.clear();
      return undefined;
    }

    let last = performance.now();
    const localHitIds = new Set();

    const removeProjectile = (id) => {
      replaceProjectiles((current) => current.filter((projectile) => projectile.id !== id));
      projectileElementRefs.current.delete(id);
    };

    const reportLocalHit = (projectile, weapon) => {
      if (!localPlayerId || localHitIds.has(projectile.id)) return;
      localHitIds.add(projectile.id);
      sendRoomMessage({
        type: 'player_hit',
        targetId: localPlayerId,
        projectileId: projectile.id,
        weapon,
      });
    };

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
            reportLocalHit(updated, 'rocket');
            projectileElementRefs.current.delete(projectile.id);
            changed = true;
            continue;
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
        if (playerState && !playerState.crashed && !projectile.groundHit && segmentHitsPlane(segment, playerState, projectile.radius ?? 1.05)) {
          reportLocalHit(projectile, 'bullet');
          projectileElementRefs.current.delete(projectile.id);
          changed = true;
          continue;
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
  }, [active, localPlayerId, playerStateRef, projectileElementRefs, projectilesRef, replaceProjectiles, sendRoomMessage, registerGameFrameCallback]);

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

function BotPlane({ botIndex, active, paused, restartSignal, playerStateRef, playerApiRef, botStateRefs, botApiRefs, onBotMove, sfxMuted, audioSettings, fogActive, registerGameFrameCallback }) {
  const botRef = useRef(null);
  const stateRef = useRef(createInitialBotState());
  const bulletsRef = useRef([]);
  const bulletElementRefs = useRef(new Map());
  const bulletTimeoutsRef = useRef([]);
  const ammoRef = useRef(MAX_BULLETS);
  const reloadingRef = useRef(false);
  const lastShotRef = useRef(0);
  const smokePreviousBotRef = useRef(null);
  const botDamageRef = useRef(0);
  const botSmokeParticlesRef = useRef([]);
  const botSmokeLastEmitRef = useRef(0);
  const audioSettingsRef = useRef(audioSettings);
  const [botBullets, setBotBullets] = useState([]);
  const [botDamage, setBotDamage] = useState(0);
  const [botSmokeParticles, setBotSmokeParticles] = useState([]);
  const [botCrashed, setBotCrashed] = useState(false);

  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

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
    playPlaneBulletHitSound(null, sfxMuted);
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
    const nextBot = createInitialBotState(stateRef.current?.x, otherBotSpawnXs);
    stateRef.current = nextBot;
    smokePreviousBotRef.current = null;
    botDamageRef.current = 0;
    botSmokeParticlesRef.current = [];
    botSmokeLastEmitRef.current = 0;
    setBotBullets([]);
    setBotDamage(0);
    setBotSmokeParticles([]);
    setBotCrashed(false);
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
      }, BOT_BULLET_RELOAD_MS);
      bulletTimeoutsRef.current.push(timeoutId);
    };

    const fireBotBullet = (bot, now) => {
      if (ammoRef.current <= 0 || now - lastShotRef.current < BOT_BULLET_COOLDOWN_MS) return;
      lastShotRef.current = now;
      ammoRef.current -= 1;
      startBulletReload();
      const projectile = {
        ...createBulletProjectile(bot, now, 'bot-bullet'),
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

    const getClosestTarget = (bot) =>
      getTargetCandidates(bot).reduce((closest, target) => (!closest || target.distance < closest.distance ? target : closest), null);

    const damageTargetByBullet = (target) => {
      if (!target?.api) return;
      if (target.type === 'player') {
        if ((target.state.damage ?? 0) <= 0) target.api.playHitSound?.();
        target.api.hitByBullet?.({ skipHitSound: true });
        return;
      }
      target.api.hitByBullet?.();
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
        const target = getTargetCandidates(bot).find((candidate) => segmentHitsPlane(segment, candidate.state, projectile.radius ?? 1.05));
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
      const closestTarget = getClosestTarget(next);
      const liveTarget = Boolean(closestTarget);
      const distance = closestTarget?.distance ?? Infinity;
      if (liveTarget && !next.engaged && distance <= BOT_WAKE_DISTANCE) next.engaged = true;
      if ((!liveTarget || distance >= BOT_FORGET_DISTANCE) && next.engaged) next.engaged = false;
      const pursuing = liveTarget && next.engaged;
      const targetState = closestTarget?.state;
      const targetDx = closestTarget?.dx ?? 1;
      const targetDy = closestTarget?.dy ?? 0;
      const botToTargetX = targetDx / Math.max(1, distance);
      const botToTargetY = targetDy / Math.max(1, distance);
      const closingSpeed = targetState ? (next.vx - targetState.vx) * botToTargetX + (next.vy - targetState.vy) * botToTargetY : 0;
      const avoidingTarget = pursuing && distance < BOT_AVOID_DISTANCE;

      const leadTime = pursuing ? clamp(distance / 46, 0.45, 2.15) : 1;
      const roamDirection = Math.abs(next.vx) > 1 ? Math.sign(next.vx) : next.x < WORLD_WIDTH / 2 ? 1 : -1;
      const roamPhase = now / 1900 + next.x * 0.025;
      const target = pursuing
        ? {
            x: targetState.x + targetState.vx * leadTime,
            y: targetState.y + targetState.vy * leadTime + 2.6,
          }
        : {
            x: clamp(next.x + roamDirection * (74 + Math.sin(roamPhase) * 16), 34, WORLD_WIDTH - 34),
            y: clamp(next.y + Math.sin(roamPhase) * 30 + 6, 30, WORLD_HEIGHT - 65),
          };

      if (avoidingTarget) {
        target.x = next.x - botToTargetX * 72;
        target.y = clamp(next.y - botToTargetY * 46 + 20, 28, WORLD_HEIGHT - 65);
        if (target.x < 26) target.x = next.x + 72;
        if (target.x > WORLD_WIDTH - 26) target.x = next.x - 72;
      } else if (pursuing && distance < 28) {
        target.y += 16;
        target.x += next.x < targetState.x ? -18 : 18;
      }
      if (next.y < 13) target.y = Math.max(target.y, 32);
      if (next.y > WORLD_HEIGHT - 28) target.y = Math.min(target.y, WORLD_HEIGHT - 65);
      if (next.x < 34) {
        target.x = 105;
        target.y = Math.max(target.y, 38);
      }
      if (next.x > WORLD_WIDTH - 34) {
        target.x = WORLD_WIDTH - 105;
        target.y = Math.max(target.y, 38);
      }

      const desiredAngle = angleToPoint(next, target);
      const angleError = normalizeAngle(desiredAngle - next.angle);
      const speed = Math.hypot(next.vx, next.vy);
      const turnLimit = 250 + clamp(speed / 40, 0, 1) * 130;
      const targetTurnRate = clamp(angleError * 6.3, -turnLimit, turnLimit);
      next.turnRate += (targetTurnRate - next.turnRate) * Math.min(1, dt * 7.8);
      next.turnRate *= Math.exp(-dt * 0.85);
      next.angle = normalizeAngle(next.angle + next.turnRate * dt);

      const rad = (next.angle * Math.PI) / 180;
      const forwardX = -Math.cos(rad);
      const forwardY = Math.sin(rad);
      const normalX = -Math.sin(rad);
      const normalY = Math.cos(rad);
      const onRunway = !next.airborne && next.y <= 0.08;
      const targetThrottle = pursuing ? (avoidingTarget && closingSpeed > 0 ? 0.34 : 1) : 0.56;
      next.throttle += (targetThrottle - next.throttle) * Math.min(1, dt * (pursuing ? 1.45 : 1.1));
      next.thrust += (next.throttle - next.thrust) * Math.min(1, dt * 5.8);

      if (onRunway) {
        next.y = 0;
        next.vy = 0;
        next.vx += forwardX * 46 * next.thrust * dt;
        if (Math.abs(next.vx) > 10.5 && next.thrust > 0.55) {
          next.airborne = true;
          next.vy = Math.max(next.vy, 5.5 + Math.max(0, forwardY) * 8);
        }
      }

      if (next.airborne) {
        const thrustForce = 64;
        next.vx += forwardX * thrustForce * next.thrust * dt;
        next.vy += forwardY * thrustForce * next.thrust * dt;
        const updatedSpeed = Math.max(0.001, Math.hypot(next.vx, next.vy));
        const velocityX = next.vx / updatedSpeed;
        const velocityY = next.vy / updatedSpeed;
        const alignment = clamp(velocityX * forwardX + velocityY * forwardY, -1, 1);
        const slip = Math.abs(forwardX * velocityY - forwardY * velocityX);
        const liftAuthority = clamp((alignment + 0.25) / 1.25, 0, 1);
        const liftForce = Math.min(44, updatedSpeed * 0.38 * liftAuthority * Math.min(1, slip * 1.75));
        next.vx += normalX * liftForce * dt;
        next.vy += normalY * liftForce * dt;
        next.vy -= 14.2 * dt;
        const drag = Math.exp(-(0.018 + updatedSpeed * 0.0032 + slip * slip * 0.28) * dt);
        next.vx *= drag;
        next.vy *= drag;
      }

      const cappedSpeed = Math.hypot(next.vx, next.vy);
      const maxSpeed = 48;
      if (cappedSpeed > maxSpeed) {
        const cap = maxSpeed / cappedSpeed;
        next.vx *= cap;
        next.vy *= cap;
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
        const aimAngle = angleToPoint(next, { x: targetState.x + targetState.vx * 0.75, y: targetState.y + targetState.vy * 0.65 + 1.2 });
        const aimError = Math.abs(normalizeAngle(aimAngle - next.angle));
        const aimRad = (next.angle * Math.PI) / 180;
        const aimForwardX = -Math.cos(aimRad);
        const aimForwardY = Math.sin(aimRad);
        const targetLength = Math.max(1, Math.hypot(targetState.x - next.x, targetState.y - next.y));
        const targetDot = (aimForwardX * (targetState.x - next.x) + aimForwardY * (targetState.y - next.y)) / targetLength;
        if (targetDot > 0.68 && aimError < 11 && distance > BOT_MIN_FIRE_DISTANCE && distance < 120) fireBotBullet(next, now);
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
      const frameTime = Math.min((now - last) / 1000, 0.05);
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
      while (accumulator >= step && steps < 6) {
        next = simulateBot(next, step, now);
        accumulator -= step;
        steps += 1;
      }
      if (steps >= 6) accumulator = 0;
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
      renderBot(stateRef.current);
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
          searchLightActive={fogActive && !botCrashed}
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

function ForestLayer({ className, rows }) {
  const depth = className.includes('front') ? 'front' : 'back';

  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Pine key={index} index={index} depth={depth} />
      ))}
    </div>
  );
}

function Pine({ index, depth }) {
  const left = (index * 0.72 + (index % 7) * 0.22 + (index % 3) * 0.16) % WORLD_WIDTH;
  const sizeNoise = ((index * 23) % 100) / 100;
  const height = depth === 'front' ? 94 + sizeNoise * 82 : 72 + sizeNoise * 60;
  const width = depth === 'front' ? 54 + sizeNoise * 26 : 44 + sizeNoise * 18;

  return (
    <svg className="pine" style={{ left: `${left}vw`, width: `${width}px`, height: `${height}px` }} viewBox="0 0 70 160">
      <path d="M35 2 13 48h14L8 84h18L3 126h26v30h12v-30h26L44 84h18L43 48h14L35 2z" />
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

function FuelTank({ style, active }) {
  return (
    <div className={`fuel-station${active ? ' fuel-station-refill' : ''}`} style={style}>
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
                  end: pottyStart + 0.045,
                };
              })();
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
