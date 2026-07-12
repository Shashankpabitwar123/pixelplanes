import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const WORLD_WIDTH = 700;
const WORLD_HEIGHT = 400;
const START_X = 350;
const FUEL_SECONDS = 20;
const FUEL_GAUGE_EMPTY_ANGLE = -180;
const FUEL_GAUGE_SWEEP = 180;
const FUEL_GAUGE_ZONE_SIZE = FUEL_GAUGE_SWEEP / 4;
const MAX_BULLETS = 7;
const BULLET_RELOAD_MS = 7000;
const BULLET_COOLDOWN_MS = 120;
const BULLET_LIFETIME_MS = 1200;
const BULLET_RANGE = 102;
const BULLET_FLIGHT_SECONDS = BULLET_LIFETIME_MS / 1000;
const BULLET_MUZZLE_POINT = { x: 0.051, y: 0.505 };
const AIM_GUIDE_DOT_COUNT = 4;
const AIM_GUIDE_FIRST_DOT_DISTANCE = 2.25;
const AIM_GUIDE_DOT_SPACING = 1.18;
const DAMAGE_SMOKE_LIFETIME_MS = 1450;
const DAMAGE_SMOKE_INTERVAL_MS = 95;
const DAMAGE_SMOKE_MAX_PARTICLES = 28;
const MAX_ROCKETS = 2;
const ROCKET_COOLDOWN_MS = 520;
const ROCKET_LIFETIME_MS = 12000;
const ROCKET_RANGE = 640;
const ROCKET_HOMING_MS = 4000;
const ROCKET_IMPACT_MS = 650;
const ROCKET_SPEED = ROCKET_RANGE / (ROCKET_LIFETIME_MS / 1000);
const ROCKET_TURN_RATE = 340;
const PLANE_SPRITE_ASPECT = 935 / 1620;
const BOT_COUNT = 4;
const BOT_START_X = START_X + 118;
const BOT_SPAWN_MARGIN = 44;
const BOT_RESPAWN_MIN_GAP = 120;
const BOT_WAKE_DISTANCE = 96;
const BOT_FORGET_DISTANCE = 118;
const BOT_AVOID_DISTANCE = 42;
const BOT_MIN_FIRE_DISTANCE = 34;
const BOT_BULLET_COOLDOWN_MS = 280;
const BOT_BULLET_RELOAD_MS = BULLET_RELOAD_MS;
const MUSIC_TRACKS = [
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

const HIGH_SCORE_STORAGE_KEY = 'bitplanes-high-score';
const ROOM_MAX_PLAYERS = 6;

function readStoredHighScore() {
  try {
    const stored = Number.parseInt(window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? '0', 10);
    return Number.isFinite(stored) ? Math.max(0, stored) : 0;
  } catch {
    return 0;
  }
}

const PLANE_COLOR_ASSETS = {
  blue: {
    label: 'Blue',
    staticSrc: '/assets/exact-plane.png',
    noPropSrc: '/assets/exact-plane-no-prop.png',
  },
  red: {
    label: 'Red',
    staticSrc: '/assets/exact-plane-red.png',
    noPropSrc: '/assets/exact-plane-no-prop-red.png',
  },
  yellow: {
    label: 'Yellow',
    staticSrc: '/assets/exact-plane-yellow.png',
    noPropSrc: '/assets/exact-plane-no-prop-yellow.png',
  },
  purple: {
    label: 'Purple',
    staticSrc: '/assets/exact-plane-purple.png',
    noPropSrc: '/assets/exact-plane-no-prop-purple.png',
  },
  green: {
    label: 'Green',
    staticSrc: '/assets/exact-plane-green.png',
    noPropSrc: '/assets/exact-plane-no-prop-green.png',
  },
  cyan: {
    label: 'Cyan',
    staticSrc: '/assets/exact-plane-cyan.png',
    noPropSrc: '/assets/exact-plane-no-prop-cyan.png',
  },
};

const PLANE_COLOR_IDS = ['blue', 'red', 'yellow', 'purple', 'green', 'cyan'];
const PLANE_COLOR_OPTIONS = PLANE_COLOR_IDS.map((id) => ({ id, ...PLANE_COLOR_ASSETS[id] }));

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function pickRoomPlaneColor() {
  return PLANE_COLOR_IDS[Math.floor(Math.random() * PLANE_COLOR_IDS.length)];
}

const PLANE_LIGHT_COMBOS = {
  classic: {
    label: 'Red and green',
    front: '#ff1f33',
    back: '#2cff65',
    frontGlow: 'rgba(255, 31, 51, 0.98)',
    frontGlowSoft: 'rgba(255, 31, 51, 0.72)',
    frontGlowWide: 'rgba(255, 31, 51, 0.44)',
    backGlow: 'rgba(44, 255, 101, 0.98)',
    backGlowSoft: 'rgba(44, 255, 101, 0.72)',
    backGlowWide: 'rgba(44, 255, 101, 0.44)',
  },
  amberCyan: {
    label: 'Amber and cyan',
    front: '#ffb21f',
    back: '#25e6ff',
    frontGlow: 'rgba(255, 178, 31, 0.98)',
    frontGlowSoft: 'rgba(255, 178, 31, 0.72)',
    frontGlowWide: 'rgba(255, 178, 31, 0.44)',
    backGlow: 'rgba(37, 230, 255, 0.98)',
    backGlowSoft: 'rgba(37, 230, 255, 0.72)',
    backGlowWide: 'rgba(37, 230, 255, 0.44)',
  },
  violetLime: {
    label: 'Violet and lime',
    front: '#b95cff',
    back: '#d7ff38',
    frontGlow: 'rgba(185, 92, 255, 0.98)',
    frontGlowSoft: 'rgba(185, 92, 255, 0.72)',
    frontGlowWide: 'rgba(185, 92, 255, 0.44)',
    backGlow: 'rgba(215, 255, 56, 0.98)',
    backGlowSoft: 'rgba(215, 255, 56, 0.72)',
    backGlowWide: 'rgba(215, 255, 56, 0.44)',
  },
  botYellow: {
    label: 'Yellow and yellow',
    front: '#ffe53a',
    back: '#ffe53a',
    frontGlow: 'rgba(255, 229, 58, 0.98)',
    frontGlowSoft: 'rgba(255, 229, 58, 0.72)',
    frontGlowWide: 'rgba(255, 201, 31, 0.48)',
    backGlow: 'rgba(255, 229, 58, 0.98)',
    backGlowSoft: 'rgba(255, 229, 58, 0.72)',
    backGlowWide: 'rgba(255, 201, 31, 0.48)',
  },
};

const PLANE_LIGHT_OPTIONS = ['classic', 'amberCyan', 'violetLime'].map((id) => ({ id, ...PLANE_LIGHT_COMBOS[id] }));

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

const clouds = Array.from({ length: 56 }, (_, index) => ({
  x: 4 + index * (WORLD_WIDTH - 10) / 56 + (seededRandom(index + 11) - 0.5) * 9,
  y: 34 + seededRandom(index + 101) * 260,
  s: 0.72 + seededRandom(index + 211) * 0.62,
  speed: 86 + Math.floor(seededRandom(index + 307) * 44),
  variant: Math.floor(seededRandom(index + 409) * 3),
})).sort((a, b) => a.x - b.x);

const fogBanks = Array.from({ length: 68 }, (_, index) => ({
  x: 2 + index * (WORLD_WIDTH - 4) / 68 + (seededRandom(index + 801) - 0.5) * 8,
  y: 9 + seededRandom(index + 1801) * 145,
  s: 0.75 + seededRandom(index + 2801) * 1.2,
  opacity: 0.28 + seededRandom(index + 3801) * 0.36,
  speed: 10 + seededRandom(index + 4801) * 12,
  delay: `${-(seededRandom(index + 5801) * 9).toFixed(2)}s`,
})).sort((a, b) => a.x - b.x);

const rainDrops = Array.from({ length: 150 }, (_, index) => ({
  id: index,
  left: seededRandom(index + 6101) * 100,
  top: seededRandom(index + 7101) * 108 - 8,
  length: 14 + seededRandom(index + 8101) * 26,
  opacity: 0.28 + seededRandom(index + 9101) * 0.44,
  duration: 420 + seededRandom(index + 10101) * 340,
  delay: `${-(seededRandom(index + 11101) * 1.2).toFixed(2)}s`,
}));

const stars = Array.from({ length: 720 }, (_, index) => ({
  id: index,
  x: 3 + seededRandom(index + 701) * (WORLD_WIDTH - 6),
  y: 52 + seededRandom(index + 1701) * (WORLD_HEIGHT - 68),
  size: 0.8 + seededRandom(index + 2701) * 1.35,
  delay: `${-(seededRandom(index + 3701) * 4).toFixed(2)}s`,
}));

const cows = [
  { delay: -1.8, duration: 44, graze: 'early' },
  { delay: -1.1, duration: 49, graze: 'late' },
  { delay: -0.4, duration: 55 },
  { delay: -23.5, duration: 62, graze: 'mid' },
  { delay: -42, duration: 52, graze: 'late' },
  { delay: -41.2, duration: 59, graze: 'early' },
  { delay: -59, duration: 64 },
  { delay: -68, duration: 58 },
  { delay: -78, duration: 61, graze: 'mid' },
  { delay: -79, duration: 63 },
];

const grassPlants = [
  { x: 4.8, s: 0.95 },
  { x: 5.7, s: 0.64 },
  { x: 16.3, s: 0.74 },
  { x: 16.9, s: 0.48 },
  { x: 22.4, s: 0.5 },
  { x: 36.2, s: 0.42 },
  { x: 50.2, s: 0.92 },
  { x: 50.8, s: 0.56 },
  { x: 51.4, s: 0.38 },
  { x: 63.1, s: 0.46 },
  { x: 76.2, s: 0.82 },
  { x: 76.8, s: 0.5 },
  { x: 96.7, s: 0.9 },
  { x: 97.4, s: 0.44 },
];

const grassPlantOffsets = Array.from({ length: 13 }, (_, index) => index * 55);
const mapGrassPlants = grassPlantOffsets.flatMap((offset) =>
  grassPlants
    .map((plant) => ({ ...plant, x: plant.x + offset }))
    .filter((plant) => plant.x < WORLD_WIDTH - 4),
);
const cowOffsets = Array.from({ length: 18 }, (_, index) => index * 34);

const hutPlacements = Array.from({ length: 20 }, (_, index) => ({
  x: 28 + index * 34 + (index % 3) * 4,
  variant: ['low', 'small', 'tall', 'small', 'low'][index % 5],
}));

const hayPlacements = Array.from({ length: 14 }, (_, index) => ({
  x: 18 + index * 49 + (index % 2) * 8,
  type: index % 2 === 0 ? 'bale' : 'roll',
  width: 4,
}));

const fuelTankPlacements = [52, 148, 286, 394, 520, 650];
const fuelStationZones = fuelTankPlacements.map((x) => ({ x: x - 0.4, width: 4.8, height: 9.2 }));

const hayObstacles = hayPlacements.map(({ x, type }) => ({ x, type }));

const planeModel = {
  widthVw: 3.8,
  heightVh: 2.1,
  visualOffsetX: -50,
  visualOffsetY: -50,
  groundPoints: [
    { x: 0.12, y: 0.99 },
    { x: 0.2, y: 0.93 },
    { x: 0.94, y: 0.5 },
  ],
  tirePoints: [
    { x: 0.11, y: 1.02 },
    { x: 0.2, y: 0.98 },
    { x: 0.94, y: 0.58 },
  ],
  bodyGroundPoints: [
    { x: 0.02, y: 0.57 },
    { x: 0.16, y: 0.82 },
    { x: 0.46, y: 0.76 },
    { x: 0.76, y: 0.64 },
    { x: 0.99, y: 0.49 },
  ],
  hitPoints: [
    { x: 0.02, y: 0.53 },
    { x: 0.16, y: 0.9 },
    { x: 0.44, y: 0.73 },
    { x: 0.74, y: 0.63 },
    { x: 0.97, y: 0.45 },
    { x: 0.55, y: 0.26 },
  ],
};

function createInitialPlaneState() {
  return {
    x: START_X,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 16,
    turnRate: 0,
    thrust: 0,
    throttle: 0,
    airborne: false,
    hasLifted: false,
    crashed: false,
    crashTime: 0,
    crashImpact: 1,
    damage: 0,
    fuel: FUEL_SECONDS,
  };
}

function getRandomBotSpawnX(previousX = null, avoidXValues = []) {
  const minX = BOT_SPAWN_MARGIN;
  const maxX = WORLD_WIDTH - BOT_SPAWN_MARGIN;
  let x = BOT_START_X;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    x = minX + Math.random() * (maxX - minX);
    const farFromPrevious = previousX == null || Math.abs(x - previousX) >= BOT_RESPAWN_MIN_GAP;
    const farFromOtherBots = avoidXValues.every((avoidX) => Math.abs(x - avoidX) >= BOT_RESPAWN_MIN_GAP * 0.65);
    if (farFromPrevious && farFromOtherBots) return x;
  }
  return previousX == null || previousX < WORLD_WIDTH / 2 ? maxX - Math.random() * 80 : minX + Math.random() * 80;
}

function createInitialBotState(previousX = null, avoidXValues = []) {
  return {
    x: getRandomBotSpawnX(previousX, avoidXValues),
    y: 0,
    vx: 0,
    vy: 0,
    angle: 18,
    turnRate: 0,
    thrust: 0,
    throttle: 0,
    airborne: false,
    hasLifted: false,
    crashed: false,
    crashTime: 0,
    crashImpact: 1,
    damage: 0,
    engaged: false,
  };
}

function createInitialBotStates(previousStates = []) {
  const states = [];
  for (let index = 0; index < BOT_COUNT; index += 1) {
    states.push(createInitialBotState(previousStates[index]?.x, states.map((state) => state.x)));
  }
  return states;
}

function getPlanePoint(plane, point) {
  const localX = (point.x + planeModel.visualOffsetX / 100) * planeModel.widthVw;
  const localY = -(point.y + planeModel.visualOffsetY / 100) * planeModel.heightVh;
  const rad = (plane.angle * Math.PI) / 180;
  return {
    x: plane.x + localX * Math.cos(rad) - localY * Math.sin(rad),
    y: plane.y + localX * Math.sin(rad) + localY * Math.cos(rad),
  };
}

function getRenderedPlanePoint(plane, point) {
  const viewportWidth = window.innerWidth || 1440;
  const viewportHeight = window.innerHeight || 900;
  const widthPx = clamp(viewportWidth * (planeModel.widthVw / 100), 34, 72);
  const heightPx = widthPx * PLANE_SPRITE_ASPECT;
  const localX = (point.x + planeModel.visualOffsetX / 100) * widthPx;
  const localY = -(point.y + planeModel.visualOffsetY / 100) * heightPx;
  const rad = (plane.angle * Math.PI) / 180;
  return {
    x: plane.x + ((localX * Math.cos(rad) + localY * Math.sin(rad)) / viewportWidth) * 100,
    y: plane.y + ((-localX * Math.sin(rad) + localY * Math.cos(rad)) / viewportHeight) * 100,
  };
}

function pointHitsPlane(point, plane, radius = 0.9) {
  if (!plane || plane.crashed) return false;
  return planeModel.hitPoints.some((hitPoint) => {
    const targetPoint = getPlanePoint(plane, hitPoint);
    const dx = (point.x - targetPoint.x) * 1.35;
    const dy = point.y - targetPoint.y;
    return Math.hypot(dx, dy) <= radius;
  });
}

function planesCollide(planeA, planeB) {
  if (!planeA || !planeB || planeA.crashed || planeB.crashed) return false;
  return (
    planeModel.hitPoints.some((point) => pointHitsPlane(getPlanePoint(planeA, point), planeB, 0.74)) ||
    planeModel.hitPoints.some((point) => pointHitsPlane(getPlanePoint(planeB, point), planeA, 0.74))
  );
}

function getProjectilePoint(projectile, now) {
  const progress = clamp((now - projectile.created) / projectile.life, 0, 1);
  if (projectile.unit === 'world') return getTrajectoryPoint(projectile, progress);
  const viewportWidth = window.innerWidth || 1440;
  const viewportHeight = window.innerHeight || 900;
  return {
    x: projectile.x + (projectile.dx / viewportWidth) * 100 * progress,
    y: projectile.y - (projectile.dy / viewportHeight) * 100 * progress,
  };
}

function getProjectileSegment(projectile, now) {
  const startTime = projectile.lastHitCheck ?? projectile.created;
  const start = getProjectilePoint(projectile, startTime);
  const end = getProjectilePoint(projectile, now);
  projectile.lastHitCheck = now;
  return { start, end };
}

function getTrajectoryPoint(trajectory, progress) {
  return {
    x: trajectory.x + trajectory.dx * progress,
    y: trajectory.y - trajectory.dy * progress,
  };
}

function syncProjectileRenderPositions(projectiles, now, elementRefs = null) {
  if (projectiles.length === 0) return;
  projectiles.forEach((projectile) => {
    const point = getProjectilePoint(projectile, now);
    projectile.renderX = point.x;
    projectile.renderY = point.y;
    const element = elementRefs?.get(projectile.id);
    if (element) {
      element.style.left = `${point.x}vw`;
      element.style.bottom = `calc(100% - 2px + ${point.y}vh)`;
    }
  });
}

function getPlaneForwardVector(plane) {
  const rad = (plane.angle * Math.PI) / 180;
  return {
    x: -Math.cos(rad),
    y: Math.sin(rad),
  };
}

function getBulletTrajectory(plane) {
  const forward = getPlaneForwardVector(plane);
  const muzzle = getRenderedPlanePoint(plane, BULLET_MUZZLE_POINT);
  const viewportWidth = window.innerWidth || 1440;
  const viewportHeight = window.innerHeight || 900;
  const rangePx = viewportWidth * (BULLET_RANGE / 100);
  const forwardDx = (forward.x * rangePx / viewportWidth) * 100;
  const forwardDy = (-forward.y * rangePx / viewportHeight) * 100;
  const inheritedDx = (plane.vx ?? 0) * BULLET_FLIGHT_SECONDS;
  const inheritedDy = -(plane.vy ?? 0) * BULLET_FLIGHT_SECONDS;
  const fullDx = forwardDx + inheritedDx;
  const fullDy = forwardDy + inheritedDy;
  const travel = getGroundClippedWorldProjectile(muzzle.y, fullDx, fullDy, BULLET_LIFETIME_MS, 80);
  const screenDx = travel.dx * viewportWidth;
  const screenDy = travel.dy * viewportHeight;
  return {
    x: muzzle.x,
    y: muzzle.y,
    dx: travel.dx,
    dy: travel.dy,
    groundHit: travel.groundHit,
    life: travel.life,
    angle: normalizeAngle((Math.atan2(screenDy, screenDx) * 180) / Math.PI),
    unit: 'world',
  };
}

function createBulletProjectile(plane, now, idPrefix = 'bullet', trajectory = getBulletTrajectory(plane)) {
  return {
    id: `${now}-${idPrefix}-${Math.random()}`,
    x: trajectory.x,
    y: trajectory.y,
    renderX: trajectory.x,
    renderY: trajectory.y,
    dx: trajectory.dx,
    dy: trajectory.dy,
    groundHit: trajectory.groundHit,
    life: trajectory.life,
    created: now,
    angle: trajectory.angle,
    unit: 'world',
    radius: 1.05,
  };
}

function getBulletGuidePoints(trajectory) {
  const travelDistance = Math.max(0.001, Math.hypot(trajectory.dx, trajectory.dy));
  return Array.from({ length: AIM_GUIDE_DOT_COUNT }, (_, index) => {
    const dotDistance = Math.min(travelDistance, AIM_GUIDE_FIRST_DOT_DISTANCE + AIM_GUIDE_DOT_SPACING * index);
    const progress = Math.min(1, dotDistance / travelDistance);
    return getTrajectoryPoint(trajectory, progress);
  });
}

function getAngleToPoint(source, target) {
  return normalizeAngle((Math.atan2(target.y - source.y, -(target.x - source.x)) * 180) / Math.PI);
}

function createRocketProjectile(plane, now, mountPoint, idPrefix = 'rocket') {
  const forward = getPlaneForwardVector(plane);
  const launchPoint = getPlanePoint(plane, mountPoint);
  return {
    id: `${now}-${idPrefix}-${Math.random()}`,
    x: launchPoint.x,
    y: launchPoint.y,
    previousX: launchPoint.x,
    previousY: launchPoint.y,
    vx: forward.x * ROCKET_SPEED,
    vy: forward.y * ROCKET_SPEED,
    created: now,
    lastUpdate: now,
    guideUntil: now + ROCKET_HOMING_MS,
    angle: plane.angle,
    radius: 2.25,
    impact: 1.72,
  };
}

function getNearestRocketTarget(rocket, targets) {
  return targets.reduce((closest, target) => {
    if (!target?.state || target.state.crashed) return closest;
    const distance = Math.hypot(target.state.x - rocket.x, target.state.y - rocket.y);
    if (!closest || distance < closest.distance) return { ...target, distance };
    return closest;
  }, null);
}

function updateGuidedRocket(rocket, now, targets) {
  if (rocket.groundHit) return rocket;
  const age = now - rocket.created;
  const dt = clamp((now - (rocket.lastUpdate ?? rocket.created)) / 1000, 0, 0.05);
  if (age >= ROCKET_LIFETIME_MS) return null;
  let nextAngle = rocket.angle;
  if (now <= rocket.guideUntil) {
    const target = getNearestRocketTarget(rocket, targets);
    if (target) {
      const desiredAngle = getAngleToPoint(rocket, target.state);
      const maxTurn = ROCKET_TURN_RATE * dt;
      nextAngle = normalizeAngle(nextAngle + clamp(normalizeAngle(desiredAngle - nextAngle), -maxTurn, maxTurn));
    }
  }
  const rad = (nextAngle * Math.PI) / 180;
  const vx = -Math.cos(rad) * ROCKET_SPEED;
  const vy = Math.sin(rad) * ROCKET_SPEED;
  const nextX = rocket.x + vx * dt;
  const nextY = rocket.y + vy * dt;
  if (nextY <= 0 || nextX <= 0 || nextX >= WORLD_WIDTH) {
    return {
      ...rocket,
      x: clamp(nextX, 0, WORLD_WIDTH),
      y: Math.max(0, nextY),
      previousX: rocket.x,
      previousY: rocket.y,
      vx: 0,
      vy: 0,
      angle: nextAngle,
      groundHit: true,
      impactAt: now,
      lastUpdate: now,
    };
  }
  return {
    ...rocket,
    x: nextX,
    y: nextY,
    previousX: rocket.x,
    previousY: rocket.y,
    vx,
    vy,
    angle: nextAngle,
    lastUpdate: now,
  };
}

function updateGuidedRockets(rockets, now, targets) {
  return rockets
    .map((rocket) => updateGuidedRocket(rocket, now, targets))
    .filter((rocket) => rocket && (!rocket.groundHit || now - rocket.impactAt <= ROCKET_IMPACT_MS));
}

function getRocketSegment(rocket) {
  return {
    start: { x: rocket.previousX ?? rocket.x, y: rocket.previousY ?? rocket.y },
    end: { x: rocket.x, y: rocket.y },
  };
}

function distanceToSegment(point, start, end) {
  const scaledPoint = { x: point.x * 1.35, y: point.y };
  const scaledStart = { x: start.x * 1.35, y: start.y };
  const scaledEnd = { x: end.x * 1.35, y: end.y };
  const dx = scaledEnd.x - scaledStart.x;
  const dy = scaledEnd.y - scaledStart.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(scaledPoint.x - scaledStart.x, scaledPoint.y - scaledStart.y);
  const t = clamp(((scaledPoint.x - scaledStart.x) * dx + (scaledPoint.y - scaledStart.y) * dy) / lengthSq, 0, 1);
  const closestX = scaledStart.x + dx * t;
  const closestY = scaledStart.y + dy * t;
  return Math.hypot(scaledPoint.x - closestX, scaledPoint.y - closestY);
}

function segmentHitsPlane(segment, plane, radius = 0.9) {
  if (!plane || plane.crashed) return false;
  return planeModel.hitPoints.some((hitPoint) => distanceToSegment(getPlanePoint(plane, hitPoint), segment.start, segment.end) <= radius);
}

function getDamageSmokeVector(plane, previousPlane = null) {
  const rad = (plane.angle * Math.PI) / 180;
  const speed = Math.hypot(plane.vx, plane.vy);
  const deltaX = previousPlane ? plane.x - previousPlane.x : 0;
  const deltaY = previousPlane ? plane.y - previousPlane.y : 0;
  const moved = Math.hypot(deltaX, deltaY);
  const groundLowestPoint = Math.min(...planeModel.groundPoints.map((point) => getPlanePoint(plane, point).y));
  const restingOnGround = speed < 1.3 && (groundLowestPoint <= 0.28 || plane.y <= 0.35);
  if (restingOnGround) {
    return {
      dx: 0,
      dy: -8.4,
    };
  }
  const trailX = moved > 0.002 ? -deltaX : speed > 1.4 ? -plane.vx : Math.cos(rad);
  const trailY = moved > 0.002 ? deltaY : speed > 1.4 ? plane.vy : -Math.sin(rad);
  const sourceLength = Math.max(0.001, Math.hypot(trailX, trailY));
  const strength = clamp(speed * 0.24 + 5.4, 7, 16);
  return {
    dx: (trailX / sourceLength) * strength,
    dy: (trailY / sourceLength) * strength,
  };
}

function createDamageSmokeParticles(plane, previousPlane, now) {
  const source = getRenderedPlanePoint(plane, BULLET_MUZZLE_POINT);
  const vector = getDamageSmokeVector(plane, previousPlane);
  return [0, 1].map((index) => {
    const spread = index === 0 ? -0.34 : 0.34;
    return {
      id: `${now}-damage-smoke-${index}-${Math.random()}`,
      x: source.x + (Math.random() - 0.5) * 0.24,
      y: source.y + (Math.random() - 0.5) * 0.18,
      dx: vector.dx + (Math.random() - 0.5) * 1.1,
      dy: vector.dy + spread + (Math.random() - 0.5) * 0.9,
      scale: 0.86 + Math.random() * 0.58,
      opacity: 0.46 + Math.random() * 0.22,
      life: DAMAGE_SMOKE_LIFETIME_MS + Math.random() * 280,
      created: now,
    };
  });
}

function updateDamageSmokeParticles(current, plane, previousPlane, now, active, lastEmitRef) {
  let changed = false;
  let next = current.filter((particle) => now - particle.created < particle.life);
  if (next.length !== current.length) changed = true;
  if (active && now - lastEmitRef.current > DAMAGE_SMOKE_INTERVAL_MS) {
    lastEmitRef.current = now;
    next = [...next, ...createDamageSmokeParticles(plane, previousPlane, now)].slice(-DAMAGE_SMOKE_MAX_PARTICLES);
    changed = true;
  }
  return changed ? next : current;
}

function createRainAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  context.resume?.();
  const duration = 2.4;
  const bufferLength = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < bufferLength; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const textureFilter = context.createBiquadFilter();
  const master = context.createGain();

  source.buffer = buffer;
  source.loop = true;
  highpass.type = 'highpass';
  highpass.frequency.value = 420;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3600;
  textureFilter.type = 'peaking';
  textureFilter.frequency.value = 1450;
  textureFilter.Q.value = 0.72;
  textureFilter.gain.value = 2.1;
  master.gain.value = 0.0001;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(textureFilter);
  textureFilter.connect(master);
  master.connect(context.destination);
  source.start();
  let stopped = false;

  return {
    context,
    gain: master.gain,
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
      try {
        source.stop(t + 0.58);
      } catch {
        // The rain source may already be stopped during rapid weather toggles.
      }
      window.setTimeout(() => {
        master.disconnect();
        textureFilter.disconnect();
        lowpass.disconnect();
        highpass.disconnect();
        context.close?.();
      }, 700);
    },
  };
}

function playPlaneBulletHitSound(existingContext = null, muted = false) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = existingContext && existingContext.state !== 'closed' ? existingContext : AudioContextClass ? new AudioContextClass() : null;
  if (!context) return;
  context.resume?.();

  const t = context.currentTime;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-11, t);
  limiter.knee.setValueAtTime(10, t);
  limiter.ratio.setValueAtTime(7, t);
  limiter.attack.setValueAtTime(0.002, t);
  limiter.release.setValueAtTime(0.12, t);
  limiter.connect(context.destination);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(1.45, t + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  master.connect(limiter);

  const makeNoise = (seconds, power = 2.4) => {
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

  const metalPing = context.createOscillator();
  const pingGain = context.createGain();
  const pingFilter = context.createBiquadFilter();
  metalPing.type = 'triangle';
  metalPing.frequency.setValueAtTime(980, t);
  metalPing.frequency.exponentialRampToValueAtTime(420, t + 0.1);
  pingFilter.type = 'bandpass';
  pingFilter.frequency.setValueAtTime(1240, t);
  pingFilter.Q.value = 4.4;
  pingGain.gain.setValueAtTime(0.32, t);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  metalPing.connect(pingFilter);
  pingFilter.connect(pingGain);
  pingGain.connect(master);

  const punch = context.createOscillator();
  const punchGain = context.createGain();
  const punchFilter = context.createBiquadFilter();
  punch.type = 'sawtooth';
  punch.frequency.setValueAtTime(210, t);
  punch.frequency.exponentialRampToValueAtTime(54, t + 0.14);
  punchFilter.type = 'lowpass';
  punchFilter.frequency.setValueAtTime(740, t);
  punchFilter.frequency.exponentialRampToValueAtTime(130, t + 0.16);
  punchGain.gain.setValueAtTime(0.82, t);
  punchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  punch.connect(punchFilter);
  punchFilter.connect(punchGain);
  punchGain.connect(master);

  const grit = makeNoise(0.16, 2.9);
  const gritFilter = context.createBiquadFilter();
  const gritGain = context.createGain();
  gritFilter.type = 'bandpass';
  gritFilter.frequency.setValueAtTime(2100, t);
  gritFilter.frequency.exponentialRampToValueAtTime(760, t + 0.09);
  gritFilter.Q.value = 1.3;
  gritGain.gain.setValueAtTime(1.05, t);
  gritGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  grit.connect(gritFilter);
  gritFilter.connect(gritGain);
  gritGain.connect(master);

  metalPing.start(t);
  punch.start(t);
  grit.start(t);
  metalPing.stop(t + 0.2);
  punch.stop(t + 0.13);
  grit.stop(t + 0.2);

  window.setTimeout(() => {
    master.disconnect();
    limiter.disconnect();
    if (context !== existingContext) context.close?.();
  }, 430);
}

function playPlaneBlastSound(existingContext = null, impact = 1, muted = false) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = existingContext && existingContext.state !== 'closed' ? existingContext : AudioContextClass ? new AudioContextClass() : null;
  if (!context) return;
  context.resume?.();

  const t = context.currentTime;
  const amount = clamp(impact, 0.75, 1.8);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-9, t);
  limiter.knee.setValueAtTime(16, t);
  limiter.ratio.setValueAtTime(8, t);
  limiter.attack.setValueAtTime(0.003, t);
  limiter.release.setValueAtTime(0.22, t);
  limiter.connect(context.destination);

  const distortion = context.createWaveShaper();
  const curve = new Float32Array(384);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(x * 4.2);
  }
  distortion.curve = curve;
  distortion.oversample = '4x';
  distortion.connect(limiter);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(1.32 * amount, t + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 1.06);
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

  const boom = context.createOscillator();
  const boomGain = context.createGain();
  const boomFilter = context.createBiquadFilter();
  boom.type = 'triangle';
  boom.frequency.setValueAtTime(96 * amount, t);
  boom.frequency.exponentialRampToValueAtTime(26, t + 0.48);
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(520, t);
  boomFilter.frequency.exponentialRampToValueAtTime(96, t + 0.54);
  boomGain.gain.setValueAtTime(1.1, t);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
  boom.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(master);

  const crack = makeNoise(0.2, 4.1);
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(2400, t);
  crackFilter.frequency.exponentialRampToValueAtTime(640, t + 0.16);
  crackFilter.Q.value = 1.7;
  crackGain.gain.setValueAtTime(1.35, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);

  const rumble = makeNoise(0.78, 1.7);
  const rumbleFilter = context.createBiquadFilter();
  const rumbleGain = context.createGain();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(820, t + 0.04);
  rumbleFilter.frequency.exponentialRampToValueAtTime(135, t + 0.82);
  rumbleGain.gain.setValueAtTime(0.72, t + 0.04);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(master);

  const metalFrequencies = [840, 1320, 1960];
  const metalNodes = metalFrequencies.map((frequency, index) => {
    const clang = context.createOscillator();
    const clangGain = context.createGain();
    clang.type = index % 2 ? 'square' : 'sawtooth';
    clang.frequency.setValueAtTime(frequency * amount, t + 0.008 * index);
    clang.frequency.exponentialRampToValueAtTime(frequency * 0.36, t + 0.24 + index * 0.03);
    clangGain.gain.setValueAtTime(0.22 / (index + 1), t + 0.008 * index);
    clangGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28 + index * 0.04);
    clang.connect(clangGain);
    clangGain.connect(master);
    return clang;
  });

  boom.start(t);
  crack.start(t);
  rumble.start(t + 0.04);
  metalNodes.forEach((node, index) => {
    node.start(t + 0.008 * index);
    node.stop(t + 0.32 + index * 0.04);
  });
  boom.stop(t + 0.62);
  crack.stop(t + 0.22);
  rumble.stop(t + 0.94);

  window.setTimeout(() => {
    master.disconnect();
    distortion.disconnect();
    limiter.disconnect();
    if (context !== existingContext) context.close?.();
  }, 1180);
}

function getGroundClippedWorldProjectile(startYVh, dxVw, dyVh, fullLifeMs, minLifeMs) {
  const groundHit = dyVh > 0 && Math.max(0, startYVh) <= dyVh;
  const ratio = groundHit ? clamp(Math.max(0, startYVh) / dyVh, 0, 1) : 1;
  return {
    dx: dxVw * ratio,
    dy: dyVh * ratio,
    groundHit,
    life: groundHit ? Math.max(minLifeMs, fullLifeMs * ratio) : fullLifeMs,
  };
}

function pointHitsHay(point, hay) {
  if (hay.type === 'roll') {
    const dx = (point.x - (hay.x + 1.05)) / 0.84;
    const dy = (point.y - 1.18) / 1.12;
    return dx * dx + dy * dy <= 1;
  }

  return point.x >= hay.x + 0.16 && point.x <= hay.x + 1.92 && point.y >= 0.06 && point.y <= 1.62;
}

function getCameraX(x) {
  return Math.max(0, Math.min(WORLD_WIDTH - 100, x - 50));
}

function getCameraY(y) {
  return Math.max(0, Math.min(WORLD_HEIGHT - 100, y - 44));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function App() {
  const [theme, setTheme] = useState('dark');
  const [gameStarted, setGameStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startScreen, setStartScreen] = useState('home');
  const [gameMode, setGameMode] = useState('bots');
  const [restartSignal, setRestartSignal] = useState(0);
  const [fogActive, setFogActive] = useState(false);
  const [rainActive, setRainActive] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [roomTheme, setRoomTheme] = useState('dark');
  const [roomPlayerName, setRoomPlayerName] = useState('');
  const [roomLobby, setRoomLobby] = useState(null);
  const [droppings, setDroppings] = useState([]);
  const [ammoStatus, setAmmoStatus] = useState({ count: MAX_BULLETS, reloading: false });
  const [rocketCount, setRocketCount] = useState(MAX_ROCKETS);
  const [killCount, setKillCount] = useState(0);
  const [highScore, setHighScore] = useState(readStoredHighScore);
  const [fuelStationPulses, setFuelStationPulses] = useState({});
  const [musicOpen, setMusicOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [planeMenuOpen, setPlaneMenuOpen] = useState(false);
  const [planeColor, setPlaneColor] = useState('blue');
  const [planeLightCombo, setPlaneLightCombo] = useState('classic');
  const [activeTrackId, setActiveTrackId] = useState(null);
  const [musicVolume, setMusicVolume] = useState(0.32);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [shootingStars, setShootingStars] = useState([]);
  const worldRef = useRef(null);
  const mapPointerRef = useRef(null);
  const mapDotRef = useRef(null);
  const mapBotDotRefs = useRef([]);
  const fuelGaugeRef = useRef(null);
  const playerStateRef = useRef(createInitialPlaneState());
  const botStateRefs = useRef(createInitialBotStates());
  const playerApiRef = useRef(null);
  const botApiRefs = useRef(Array.from({ length: BOT_COUNT }, () => ({ current: null })));
  const musicAudioRef = useRef(null);
  const rainAudioRef = useRef(null);
  const rainSoundStartTimerRef = useRef(0);
  const fuelPulseTimersRef = useRef([]);
  const shootingStarTimersRef = useRef([]);
  const startGame = useCallback(() => {
    setGameStarted(true);
    setPaused(false);
    setStartScreen('home');
    setMusicOpen(false);
    setHelpOpen(false);
    setPlaneMenuOpen(false);
    setKillCount(0);
  }, []);
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
  const createRoomLobby = useCallback(() => {
    const hostName = roomPlayerName.trim() || 'Player 1';
    const hostColor = pickRoomPlaneColor();
    setPlaneColor(hostColor);
    setRoomLobby({
      code: generateRoomCode(),
      players: [
        {
          id: 'host',
          name: hostName,
          color: hostColor,
          role: 'Host',
        },
      ],
    });
    setStartScreen('room-waiting');
  }, [roomPlayerName]);
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
  const resetCurrentKills = useCallback(() => {
    setKillCount(0);
  }, []);
  const restartGame = useCallback(() => {
    setGameStarted(false);
    setPaused(false);
    setStartScreen('home');
    setGameMode('bots');
    setRoomLobby(null);
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
  }, [updateCamera, updateFuelGauge]);
  const updatePlayerState = useCallback((nextState) => {
    playerStateRef.current = nextState;
  }, []);
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

  useEffect(() => () => {
    fuelPulseTimersRef.current.forEach((timeout) => window.clearTimeout(timeout));
    window.clearTimeout(rainSoundStartTimerRef.current);
    rainAudioRef.current?.stop();
    rainAudioRef.current = null;
    if (!musicAudioRef.current) return;
    musicAudioRef.current.pause();
    musicAudioRef.current.src = '';
  }, []);

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
  }, []);

  useEffect(() => {
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
  }, []);

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
      rainAudio.gain.setTargetAtTime(0.105, t, 0.38);
    }, 850);

    return () => {
      window.clearTimeout(rainSoundStartTimerRef.current);
      rainSoundStartTimerRef.current = 0;
    };
  }, [rainActive, sfxMuted]);

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

  const roomPlayers = roomLobby?.players ?? [];
  const roomSlots = Array.from({ length: ROOM_MAX_PLAYERS }, (_, index) => roomPlayers[index] ?? null);

  return (
    <main className={`scene scene-${theme}${paused ? ' scene-paused' : ''}`} aria-label="Animated Bitplanes background">
      <div className="sky-gradient" />

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
      <button
        className="theme-icon-toggle"
        type="button"
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        <img src="/assets/theme-lightbulb-icon.svg" alt="" draggable="false" aria-hidden="true" />
      </button>
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
          <div className="help-rule"><kbd>Space</kbd><span>Bullets</span></div>
          <div className="help-rule"><kbd>R</kbd><span>Rockets</span></div>
          <div className="help-rule"><kbd>L</kbd><span>Front light for fog.</span></div>
          <div className="help-rule help-note"><kbd>Start</kbd><span>Bots fight you and each other.</span></div>
          <div className="help-rule"><kbd>Train</kbd><span>No bots. Practice flying.</span></div>
          <div className="help-rule"><kbd>Land</kbd><span>Touch grass softly on wheels.</span></div>
          <div className="help-rule help-note"><i className="help-fuel-dot" /><span>Purple dots are fuel stations</span></div>
          <div className="help-rule"><i className="help-enemy-dot" /><span>Red dots are enemy bots</span></div>
          <div className="help-rule help-note"><kbd>Fuel</kbd><span>20 seconds. Station refills and repairs.</span></div>
          <div className="help-rule"><kbd>Ammo</kbd><span>Bullets refill every 7 seconds.</span></div>
          <div className="help-rule"><kbd>Rocket</kbd><span>Tracks nearest target for 4 seconds.</span></div>
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
                <input
                  className="room-code-input"
                  value={roomCode}
                  maxLength="8"
                  placeholder="CODE"
                  aria-label="Room code"
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                />
                <div className="start-actions">
                  <button className="start-option" type="button" onClick={() => setStartScreen('room')}>
                    Back
                  </button>
                  <button className="start-option start-primary" type="button" onClick={() => {
                    setGameMode('room');
                    startGame();
                  }}>
                    Join
                  </button>
                </div>
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
                      onClick={() => {
                        setRoomTheme('dark');
                        setTheme('dark');
                      }}
                    >
                      Dark
                    </button>
                    <button
                      className={`room-rule-button${roomTheme === 'light' ? ' room-rule-active' : ''}`}
                      type="button"
                      aria-pressed={roomTheme === 'light'}
                      onClick={() => {
                        setRoomTheme('light');
                        setTheme('light');
                      }}
                    >
                      Light
                    </button>
                  </div>
                  <button className="start-option start-primary" type="button" onClick={createRoomLobby}>
                    Create
                  </button>
                </div>
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
                <div className="room-rule-row" aria-label="Room theme">
                  <button
                    className={`room-rule-button${roomTheme === 'dark' ? ' room-rule-active' : ''}`}
                    type="button"
                    aria-pressed={roomTheme === 'dark'}
                    onClick={() => {
                      setRoomTheme('dark');
                      setTheme('dark');
                    }}
                  >
                    Dark
                  </button>
                  <button
                    className={`room-rule-button${roomTheme === 'light' ? ' room-rule-active' : ''}`}
                    type="button"
                    aria-pressed={roomTheme === 'light'}
                    onClick={() => {
                      setRoomTheme('light');
                      setTheme('light');
                    }}
                  >
                    Light
                  </button>
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
                <div className="start-actions">
                  <button className="start-option" type="button" onClick={() => {
                    setRoomLobby(null);
                    setStartScreen('room');
                  }}>
                    Leave
                  </button>
                  <button className="start-option start-primary" type="button" disabled>
                    Start
                  </button>
                </div>
              </>
            )}
          </div>
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
        <span
          ref={mapDotRef}
          className="map-pointer-dot"
          style={{
            left: `${Math.max(2, Math.min(98, ((getCameraX(START_X) + 50) / WORLD_WIDTH) * 100))}%`,
            top: `${Math.max(2, Math.min(98, 100 - (50 / WORLD_HEIGHT) * 100))}%`,
          }}
        />
      </div>
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
      <BulletMeter count={ammoStatus.count} reloading={ammoStatus.reloading} rocketCount={rocketCount} />

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
        <div className={`fog-layer${fogActive ? ' fog-layer-active' : ''}`} aria-hidden="true">
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
            playerApiRef={playerApiRef}
            botStateRefs={botStateRefs}
            botApiRefs={botApiRefs}
            controlsEnabled={gameStarted && !paused}
            paused={paused}
            restartSignal={restartSignal}
            startArmed={startScreen === 'bot-ready' || startScreen === 'training-ready'}
            onPowerStart={startGame}
            planeColor={planeColor}
            planeLightCombo={planeLightCombo}
            sfxMuted={sfxMuted}
            fogActive={fogActive}
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
              fogActive={fogActive}
            />
          ))}
          <div className="grass-plants">
            {mapGrassPlants.map((plant, index) => (
              <GrassPlant key={index} {...plant} />
            ))}
          </div>
          <div className="cows">
            {cowOffsets.flatMap((offset) =>
              cows.slice(0, 2).map((cow, index) => (
                <Cow
                  key={`${offset}-${index}`}
                  {...cow}
                  duration={240 + ((offset + index * 17) % 70)}
                  delay={cow.delay - offset * 0.7 - index * 8}
                  grazeAt={28 + ((offset * 3 + index * 47) % (WORLD_WIDTH - 70))}
                  onPotty={addDropping}
                />
              )),
            )}
          </div>
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

function BulletMeter({ count, reloading, rocketCount }) {
  return (
    <>
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
  playerApiRef,
  botStateRefs,
  botApiRefs,
  controlsEnabled,
  paused,
  restartSignal,
  startArmed,
  onPowerStart,
  planeColor,
  planeLightCombo,
  sfxMuted,
  fogActive,
}) {
  const keysRef = useRef(new Set());
  const planeRef = useRef(null);
  const aimGuideDotRefs = useRef([]);
  const blastRef = useRef(null);
  const engineAudioRef = useRef(null);
  const crashSoundRef = useRef(null);
  const sfxMutedRef = useRef(sfxMuted);
  const controlsEnabledRef = useRef(controlsEnabled);
  const pausedRef = useRef(paused);
  const startArmedRef = useRef(startArmed);
  const onPowerStartRef = useRef(onPowerStart);
  const smokePreviousPlaneRef = useRef(null);
  const damageLevelRef = useRef(0);
  const damageSmokeParticlesRef = useRef([]);
  const damageSmokeLastEmitRef = useRef(0);
  const fuelRefillFeedbackRef = useRef({ stationIndex: -1, time: 0 });
  const bulletTrajectoryRef = useRef(getBulletTrajectory(createInitialPlaneState()));
  const crashedRef = useRef(false);
  const ammoRef = useRef(MAX_BULLETS);
  const reloadingRef = useRef(false);
  const reloadTimerRef = useRef(null);
  const lastShotRef = useRef(0);
  const fireQueuedRef = useRef(false);
  const fireBulletRef = useRef(null);
  const rocketsRef = useRef(MAX_ROCKETS);
  const lastRocketRef = useRef(0);
  const projectilesRef = useRef([]);
  const rocketProjectilesRef = useRef([]);
  const projectileElementRefs = useRef(new Map());
  const projectileTimeoutsRef = useRef([]);
  const rocketTimeoutsRef = useRef([]);
  const stateRef = useRef(createInitialPlaneState());
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
    const next = createInitialPlaneState();
    stateRef.current = next;
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
  }, [restartSignal, onAmmoChange, onRocketChange, onMove, onFuelChange, onPlaneState]);

  useEffect(() => {
    if (!playerApiRef) return undefined;
    const crashPlayer = (impact = 1.2) => {
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
      onPlayerDeath();
      onPlaneState(next);
      if (engineAudioRef.current) {
        engineAudioRef.current.master.gain.setTargetAtTime(0, engineAudioRef.current.context.currentTime, 0.025);
      }
    };

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
    };
  }, [playerApiRef, onPlayerDeath, onPlaneState]);

  useEffect(() => {
    sfxMutedRef.current = sfxMuted;
    if (!sfxMuted || !engineAudioRef.current) return;
    const audio = engineAudioRef.current;
    audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.025);
  }, [sfxMuted]);

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
      master.gain.exponentialRampToValueAtTime(0.52 * shotVolume, t + 0.006);
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
      master.gain.exponentialRampToValueAtTime(1.12, t + 0.018);
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

      projectilesRef.current = [...projectilesRef.current, projectile];
      setProjectiles(projectilesRef.current);
      const bulletElement = projectileElementRefs.current.get(projectile.id);
      if (bulletElement) {
        bulletElement.style.left = `${projectile.renderX}vw`;
        bulletElement.style.bottom = `calc(100% - 2px + ${projectile.renderY}vh)`;
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

      rocketProjectilesRef.current = [...rocketProjectilesRef.current, rocket];
      setRocketProjectiles(rocketProjectilesRef.current);

      const nextRockets = rocketsRef.current - 1;
      rocketsRef.current = nextRockets;
      setRocketsRemaining(nextRockets);
      onRocketChange(nextRockets);
    };

    crashSoundRef.current = (impact = 1) => {
      if (sfxMutedRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const existing = engineAudioRef.current?.context;
      const context = existing && existing.state !== 'closed' ? existing : AudioContextClass ? new AudioContextClass() : null;
      if (!context) return;
      context.resume?.();

      const t = context.currentTime;
      const crashVolume = 2.05;
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
        if (pressed && !event.repeat && !pausedRef.current) queueBulletFire();
        return;
      }
      if (action === 'rocket') {
        if (pressed && !event.repeat) fireRocket();
        return;
      }
      if (action === 'light') {
        if (pressed && !event.repeat) setSearchLightOn((active) => !active);
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
  }, [onAmmoChange, onRocketChange]);

  useEffect(() => {
    let frame = 0;
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

    const updatePlayerRockets = (now) => {
      if (rocketProjectilesRef.current.length === 0) return;
      const targets = botStateRefs.current.map((bot, index) => ({ type: 'bot', index, state: bot }));
      const nextRockets = updateGuidedRockets(rocketProjectilesRef.current, now, targets);
      if (nextRockets !== rocketProjectilesRef.current) {
        rocketProjectilesRef.current = nextRockets;
        setRocketProjectiles(nextRockets);
      }
    };

    const updatePlayerBulletRenders = (now) => {
      syncProjectileRenderPositions(projectilesRef.current, now, projectileElementRefs.current);
    };

    const scanBotHits = (now) => {
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
        renderPlane(next);
        frame = requestAnimationFrame(update);
        return;
      }

      if (next.crashed) {
        if (now - next.crashTime > 1450) {
          next = createInitialPlaneState();
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
          projectileTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
          projectileTimeoutsRef.current = [];
          rocketTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
          rocketTimeoutsRef.current = [];
          projectilesRef.current = [];
          rocketProjectilesRef.current = [];
          projectileElementRefs.current.clear();
          ammoRef.current = MAX_BULLETS;
          reloadingRef.current = false;
          lastShotRef.current = 0;
          fireQueuedRef.current = false;
          rocketsRef.current = MAX_ROCKETS;
          lastRocketRef.current = 0;
          setProjectiles([]);
          setRocketProjectiles([]);
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
        }
        stateRef.current = next;
        renderPlane(next);
        frame = requestAnimationFrame(update);
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
      if (fireQueuedRef.current) {
        fireQueuedRef.current = false;
        fireBulletRef.current?.(next, now);
      }
      updatePlayerBulletRenders(now);
      updatePlayerRockets(now);
      scanBotHits(now);
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
      frame = requestAnimationFrame(update);
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
          const gain = planeState.crashed || sfxMutedRef.current ? 0 : Math.min(0.13, visibleThrust * 0.11);
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
            dot.style.left = `${point.x}vw`;
            dot.style.bottom = `calc(100% - 2px + ${point.y}vh)`;
            dot.style.opacity = 1;
          });
        }
      }
      if (blastRef.current) {
        blastRef.current.style.left = `${planeState.x}vw`;
        blastRef.current.style.bottom = `calc(100% - 2px + ${Math.max(0, planeState.y)}vh)`;
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [onMove, onFuelChange, onFuelRefill, onKill, onPlayerDeath, onAmmoChange, onRocketChange, onPlaneState, botStateRefs, botApiRefs]);

  return (
    <div className="player-plane-layer" aria-label="Playable plane">
      <div
        ref={planeRef}
        className={`player-plane${crashed ? ' plane-crashed' : ''}${damageLevel > 0 && !crashed ? ' plane-damaged' : ''}`}
        style={{
          transform: `translate(${START_X}vw, 0vh) rotate(16deg)`,
          '--thrust': 0,
        }}
      >
        <BitPlane
          rocketsRemaining={rocketsRemaining}
          planeColor={planeColor}
          planeLightCombo={planeLightCombo}
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
              left: `${projectile.renderX ?? projectile.x}vw`,
              bottom: `calc(100% - 2px + ${projectile.renderY ?? projectile.y}vh)`,
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
              left: `${rocket.x}vw`,
              bottom: `calc(100% - 2px + ${rocket.y}vh)`,
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

function BotPlane({ botIndex, active, paused, restartSignal, playerStateRef, playerApiRef, botStateRefs, botApiRefs, onBotMove, sfxMuted, fogActive }) {
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
  const [botBullets, setBotBullets] = useState([]);
  const [botDamage, setBotDamage] = useState(0);
  const [botSmokeParticles, setBotSmokeParticles] = useState([]);
  const [botCrashed, setBotCrashed] = useState(false);

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
    playPlaneBlastSound(null, next.crashImpact, sfxMuted);
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
    let frame = 0;
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

    const scanHits = (now, bot) => {
      const collisionTarget = getTargetCandidates(bot).find((target) => planesCollide(bot, target.state));
      if (collisionTarget) {
        crashBot(1.8);
        crashTarget(collisionTarget, 1.8);
        return;
      }
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
        frame = requestAnimationFrame(update);
        return;
      }

      let next = stateRef.current;
      if (next.crashed) {
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
        frame = requestAnimationFrame(update);
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
        playPlaneBlastSound(null, next.crashImpact, sfxMuted);
        renderBot(stateRef.current);
        frame = requestAnimationFrame(update);
        return;
      }
      scanHits(now, next);
      renderBot(stateRef.current);
      frame = requestAnimationFrame(update);
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [active, paused, botIndex, botStateRefs, botApiRefs, playerApiRef, playerStateRef, onBotMove, crashBot, sfxMuted]);

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
              left: `${projectile.renderX ?? projectile.x}vw`,
              bottom: `calc(100% - 2px + ${projectile.renderY ?? projectile.y}vh)`,
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

function BitPlane({ rocketsRemaining, planeColor, planeLightCombo, searchLightActive = false, searchLightFog = false }) {
  const planeAssets = PLANE_COLOR_ASSETS[planeColor] || PLANE_COLOR_ASSETS.blue;
  const lightCombo = PLANE_LIGHT_COMBOS[planeLightCombo] || PLANE_LIGHT_COMBOS.classic;
  return (
    <div
      className={`plane-visual${searchLightActive ? ' search-light-active' : ''}${searchLightFog ? ' search-light-fog' : ''}`}
      style={{
        '--plane-front-light': lightCombo.front,
        '--plane-back-light': lightCombo.back,
        '--plane-front-light-glow': lightCombo.frontGlow,
        '--plane-front-light-glow-soft': lightCombo.frontGlowSoft,
        '--plane-front-light-glow-wide': lightCombo.frontGlowWide,
        '--plane-back-light-glow': lightCombo.backGlow,
        '--plane-back-light-glow-soft': lightCombo.backGlowSoft,
        '--plane-back-light-glow-wide': lightCombo.backGlowWide,
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

function Cow({ delay, duration, graze, grazeAt, onPotty }) {
  const [motion, setMotion] = useState({ x: -14, eating: false });
  const pottyActiveRef = useRef(false);
  const pottyPlanRef = useRef({ cycle: null, active: false, x: 0, start: 0, end: 0 });

  useEffect(() => {
    let frame = 0;
    const start = performance.now() / 1000;

    const update = () => {
      const elapsed = performance.now() / 1000 - start - delay;
      const cycle = Math.floor(elapsed / duration);
      const progress = ((elapsed % duration) + duration) % duration / duration;
      if (pottyPlanRef.current.cycle !== cycle) {
        const pottyStart = 0.2 + Math.random() * 0.56;
        pottyPlanRef.current = {
          cycle,
          active: Math.random() < 0.22,
          x: 24 + Math.random() * (WORLD_WIDTH - 70),
          start: pottyStart,
          end: pottyStart + 0.045,
        };
      }
      const nextMotion = getCowMotion(progress, graze, pottyPlanRef.current, grazeAt);
      if (nextMotion.potty && !pottyActiveRef.current) {
        onPotty(nextMotion.x);
      }
      pottyActiveRef.current = Boolean(nextMotion.potty);
      setMotion(nextMotion);
      frame = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, graze, grazeAt, onPotty]);

  return (
    <div className={`cow${motion.eating ? ' cow-eating' : motion.potty ? ' cow-pottying' : ' cow-walking'}`} style={{ transform: `translateX(${motion.x}vw)` }}>
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
