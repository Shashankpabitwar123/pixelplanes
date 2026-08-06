export const WORLD_WIDTH = 700;

export const WORLD_HEIGHT = 400;

export const START_X = 350;

export const FUEL_SECONDS = 30;

// Solo and Training rules deliberately live on the client. They must never be
// sent to a room: room games keep the shared standard ruleset.
export const BOT_COUNT = 1;

export const MAX_SOLO_BOTS = 6;

export const SOLO_GAME_RULE_DEFAULTS = Object.freeze({
  botCount: BOT_COUNT,
  botDifficulty: 1,
  flightPace: 100,
  turnPace: 100,
  bulletPace: 100,
  bulletCooldownMs: 60,
  bulletReloadSeconds: 7,
  rocketPace: 100,
  fuelSeconds: 60,
  weatherMode: 1,
});

const SOLO_GAME_RULE_LIMITS = Object.freeze({
  botCount: [1, MAX_SOLO_BOTS],
  botDifficulty: [1, 5],
  flightPace: [70, 100],
  turnPace: [65, 100],
  bulletPace: [70, 100],
  bulletCooldownMs: [45, 180],
  bulletReloadSeconds: [3, 10],
  rocketPace: [75, 100],
  fuelSeconds: [20, 60],
  weatherMode: [0, 3],
});

function clampSoloRule(value, [minimum, maximum], fallback, integer = true) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const safe = Math.min(maximum, Math.max(minimum, parsed));
  return integer ? Math.round(safe) : safe;
}

export function createSoloGameRules(overrides = {}) {
  return Object.entries(SOLO_GAME_RULE_DEFAULTS).reduce((rules, [key, fallback]) => ({
    ...rules,
    [key]: clampSoloRule(overrides[key], SOLO_GAME_RULE_LIMITS[key], fallback),
  }), {});
}

export const FUEL_GAUGE_EMPTY_ANGLE = -180;

export const FUEL_GAUGE_SWEEP = 180;

export const FUEL_GAUGE_ZONE_SIZE = FUEL_GAUGE_SWEEP / 4;

// Keep flight feel in one profile. Switching ACTIVE_GAMEPLAY_PACING to `classic`
// restores the pre-smooth-arcade motion values without touching simulation code.
export const GAMEPLAY_PACING_PRESETS = Object.freeze({
  classic: Object.freeze({
    player: Object.freeze({
      throttleRise: 0.8,
      thrustResponse: 6.2,
      turnBaseRate: 210,
      turnAuthorityRate: 165,
      turnInputResponse: 18,
      turnHeldDamping: 0.65,
      turnReleaseDamping: 3.6,
      takeoffSpeed: 14.5,
      runwayThrust: 56,
      flightThrust: 70,
      diveBoost: 1.55,
      climbBoost: 1.3,
      divePull: 40,
      poweredDivePull: 46,
      maxLevelSpeed: 42,
      maxClimbSpeed: 54.6,
      maxDiveBaseSpeed: 58.8,
      maxDiveThrustBonus: 9.2,
    }),
    bot: Object.freeze({
      steeringGain: 6.3,
      turnLimitBase: 250,
      turnLimitSpeedBonus: 130,
      turnResponse: 7.8,
      turnDamping: 0.85,
      pursuitThrottleResponse: 1.45,
      cruiseThrottleResponse: 1.1,
      thrustResponse: 5.8,
      runwayThrust: 46,
      flightThrust: 64,
      maxSpeed: 48,
    }),
    bulletLifetimeMs: 1200,
    bulletInheritedFlightSeconds: 1.2,
    botBulletCooldownMs: 280,
    rocketSpeed: 640 / 12,
  }),
  smoothArcade: Object.freeze({
    player: Object.freeze({
      throttleRise: 0.68,
      thrustResponse: 5.4,
      turnBaseRate: 160,
      turnAuthorityRate: 124,
      turnInputResponse: 14,
      turnHeldDamping: 0.85,
      turnReleaseDamping: 4.2,
      takeoffSpeed: 13.5,
      runwayThrust: 48,
      flightThrust: 60,
      diveBoost: 1.48,
      climbBoost: 1.2,
      divePull: 34,
      poweredDivePull: 39,
      maxLevelSpeed: 35,
      maxClimbSpeed: 45,
      maxDiveBaseSpeed: 50,
      maxDiveThrustBonus: 6,
    }),
    bot: Object.freeze({
      steeringGain: 5.1,
      turnLimitBase: 200,
      turnLimitSpeedBonus: 100,
      turnResponse: 6.2,
      turnDamping: 1.05,
      pursuitThrottleResponse: 1.2,
      cruiseThrottleResponse: 0.95,
      thrustResponse: 5.1,
      runwayThrust: 40,
      flightThrust: 54,
      maxSpeed: 40,
    }),
    bulletLifetimeMs: 1350,
    bulletInheritedFlightSeconds: 1.2,
    botBulletCooldownMs: 360,
    rocketSpeed: 640 / 12,
  }),
});

export const ACTIVE_GAMEPLAY_PACING = GAMEPLAY_PACING_PRESETS.smoothArcade;

export const MAX_BULLETS = 7;

export const BULLET_RELOAD_MS = 7000;

export const BULLET_COOLDOWN_MS = 60;

export const BULLET_LIFETIME_MS = ACTIVE_GAMEPLAY_PACING.bulletLifetimeMs;

export const BULLET_RANGE = 102;

// Keep the original inherited-velocity distance while extending visual travel time.
export const BULLET_FLIGHT_SECONDS = ACTIVE_GAMEPLAY_PACING.bulletInheritedFlightSeconds;

export const BULLET_MUZZLE_POINT = { x: 0.051, y: 0.505 };

export const AIM_GUIDE_DOT_COUNT = 4;

export const AIM_GUIDE_FIRST_DOT_DISTANCE = 2.25;

export const AIM_GUIDE_DOT_SPACING = 1.18;

export const DAMAGE_SMOKE_LIFETIME_MS = 1450;

export const DAMAGE_SMOKE_INTERVAL_MS = 95;

export const DAMAGE_SMOKE_MAX_PARTICLES = 28;

export const MAX_ROCKETS = 2;

export const ROCKET_COOLDOWN_MS = 520;

export const ROCKET_LIFETIME_MS = 5000;

// Rocket homing and five-second expiry stay unchanged; this profile intentionally keeps rocket speed stable.
export const ROCKET_SPEED = ACTIVE_GAMEPLAY_PACING.rocketSpeed;

export const ROCKET_RANGE = ROCKET_SPEED * (ROCKET_LIFETIME_MS / 1000);

export const ROCKET_HOMING_MS = 2000;

export const ROCKET_DETECTION_RANGE = 90;

export const ROCKET_IMPACT_MS = 650;

export const ROCKET_TURN_RATE = 340;

export const PLANE_SPRITE_ASPECT = 935 / 1620;

export const BOT_START_X = START_X + 118;

export const BOT_SPAWN_MARGIN = 44;

export const BOT_RESPAWN_MIN_GAP = 120;

export const BOT_BULLET_COOLDOWN_MS = ACTIVE_GAMEPLAY_PACING.botBulletCooldownMs;

export const BOT_BULLET_RELOAD_MS = BULLET_RELOAD_MS;

export const MUSIC_TRACKS = [
  'alisiabeats-titanium-170190.mp3',
  'kulakovka-deep-house-273895.mp3',
  'the-mountain-deep-house-483808.mp3',
  '34910776-for-her-chill-upbeat-summel-travel-vlog-and-ig-music-royalty-free-use-202298.mp3',
  'monume-house-519225.mp3',
  'sunset-house-grooves-deep-house-sunset-538759.mp3',
  'antipodeanwriter-chilliwave-hourglass-12179.mp3',
  'dariocoiro-lluvia-en-el-balcon-496768.mp3',
  'pink_sound-neon-nocturne-background-slap-house-music-for-video-short-version-562689.mp3',
  'sunset-house-grooves-deep-house-sunset-538759-1.mp3',
].map((file, index) => ({
  id: index + 1,
  file,
  src: `/assets/music/${file}`,
}));

export const HIGH_SCORE_STORAGE_KEY = 'bitplanes-high-score';

export const ROOM_MAX_PLAYERS = 6;

export const ROOM_SPAWN_OFFSETS = [-84, -50, -17, 17, 50, 84];

// The room simulator is imported by the Node authoritative server as well as
// the Vite client. Node has no `import.meta.env`, so read Vite values only when
// that object exists.
const viteEnv = import.meta.env ?? {};

export const MULTIPLAYER_WS_URL = viteEnv.VITE_WS_URL || '';

function normalizeMultiplayerWsUrl(value) {
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

function parseMultiplayerRegionUrls() {
  const raw = viteEnv.VITE_MULTIPLAYER_REGIONS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed) ? parsed : [];
    return Array.from(new Set(values.map(normalizeMultiplayerWsUrl).filter(Boolean)));
  } catch {
    return [];
  }
}

// Public endpoints only. This variable is intentionally safe to expose through
// Vite and is used solely to pick the closest server when creating a new room.
export const MULTIPLAYER_REGION_WS_URLS = parseMultiplayerRegionUrls();

function multiplayerApiUrlFromWsUrl() {
  if (!MULTIPLAYER_WS_URL) return '';
  try {
    const url = new URL(MULTIPLAYER_WS_URL);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace(/\/rooms\/?$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export const MULTIPLAYER_API_URL =
  (viteEnv.VITE_API_URL || multiplayerApiUrlFromWsUrl()).replace(/\/$/, '');

const DEFAULT_RTC_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function parseRtcIceServers() {
  const raw = viteEnv.VITE_RTC_ICE_SERVERS;
  if (!raw) return DEFAULT_RTC_ICE_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_RTC_ICE_SERVERS;
  } catch {
    return DEFAULT_RTC_ICE_SERVERS;
  }
}

export const RTC_ICE_SERVERS = parseRtcIceServers();

export const ROOM_WEATHER_TICK_MS = 1000;

export function readStoredHighScore() {
  try {
    const stored = Number.parseInt(window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? '0', 10);
    return Number.isFinite(stored) ? Math.max(0, stored) : 0;
  } catch {
    return 0;
  }
}
