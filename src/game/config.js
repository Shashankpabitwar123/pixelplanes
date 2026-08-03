export const WORLD_WIDTH = 700;

export const WORLD_HEIGHT = 400;

export const START_X = 350;

export const FUEL_SECONDS = 30;

export const FUEL_GAUGE_EMPTY_ANGLE = -180;

export const FUEL_GAUGE_SWEEP = 180;

export const FUEL_GAUGE_ZONE_SIZE = FUEL_GAUGE_SWEEP / 4;

export const MAX_BULLETS = 7;

export const BULLET_RELOAD_MS = 7000;

export const BULLET_COOLDOWN_MS = 60;

export const BULLET_LIFETIME_MS = 1200;

export const BULLET_RANGE = 102;

export const BULLET_FLIGHT_SECONDS = BULLET_LIFETIME_MS / 1000;

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

export const ROCKET_RANGE = 640;

export const ROCKET_HOMING_MS = 2000;

export const ROCKET_DETECTION_RANGE = 90;

export const ROCKET_IMPACT_MS = 650;

export const ROCKET_SPEED = ROCKET_RANGE / (ROCKET_LIFETIME_MS / 1000);

export const ROCKET_TURN_RATE = 340;

export const PLANE_SPRITE_ASPECT = 935 / 1620;

export const BOT_COUNT = 4;

export const BOT_START_X = START_X + 118;

export const BOT_SPAWN_MARGIN = 44;

export const BOT_RESPAWN_MIN_GAP = 120;

export const BOT_WAKE_DISTANCE = 96;

export const BOT_FORGET_DISTANCE = 118;

export const BOT_AVOID_DISTANCE = 42;

export const BOT_MIN_FIRE_DISTANCE = 34;

export const BOT_BULLET_COOLDOWN_MS = 280;

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

export const MULTIPLAYER_WS_URL = import.meta.env.VITE_WS_URL || '';

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
  (import.meta.env.VITE_API_URL || multiplayerApiUrlFromWsUrl()).replace(/\/$/, '');

const DEFAULT_RTC_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function parseRtcIceServers() {
  const raw = import.meta.env.VITE_RTC_ICE_SERVERS;
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
