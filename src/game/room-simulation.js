import {
  ACTIVE_GAMEPLAY_PACING,
  BULLET_COOLDOWN_MS,
  BULLET_FLIGHT_SECONDS,
  BULLET_LIFETIME_MS,
  BULLET_MUZZLE_POINT,
  BULLET_RANGE,
  BULLET_RELOAD_MS,
  FUEL_SECONDS,
  MAX_BULLETS,
  MAX_ROCKETS,
  ROCKET_COOLDOWN_MS,
  ROCKET_IMPACT_MS,
  ROCKET_LIFETIME_MS,
  ROCKET_SPEED,
  ROCKET_TURN_RATE,
  WORLD_WIDTH,
} from './config.js';
import {
  clamp,
  createInitialPlaneState,
  getPlaneForwardVector,
  getPlanePoint,
  getRocketSegment,
  normalizeAngle,
  planeModel,
  pointHitsHay,
  segmentHitsPlane,
  updateGuidedRocket,
} from './mechanics.js';
import { fuelStationZones, hayObstacles } from './world.js';

// Room simulation deliberately has no DOM, React, audio, or browser APIs. The
// Node room server owns this same ruleset, while the client uses it only for
// immediate local prediction.
export const ROOM_TICK_SECONDS = 1 / 60;
export const ROOM_SNAPSHOT_INTERVAL_MS = 50;
export const ROOM_RESPAWN_DELAY_MS = 1450;
export const ROOM_PLAYER_INPUT_KEYS = Object.freeze(['power', 'down', 'left', 'right', 'fire', 'light']);

const ROOM_BULLET_VERTICAL_ASPECT = 16 / 9;

export function createRoomInput(input = {}) {
  return ROOM_PLAYER_INPUT_KEYS.reduce((normalized, key) => ({
    ...normalized,
    [key]: Boolean(input[key]),
  }), {
    rocketPress: Math.max(0, Math.floor(Number(input.rocketPress) || 0)),
  });
}

export function createRoomPlayerState(spawnX) {
  return createInitialPlaneState(spawnX, FUEL_SECONDS);
}

function getPlayerFlightTuning() {
  return ACTIVE_GAMEPLAY_PACING.player;
}

function lowestPlanePoint(plane, points) {
  return Math.min(...points.map((point) => getPlanePoint(plane, point).y));
}

function crashRoomPlane(state, now, impact) {
  const next = { ...state };
  const crashLowestPoint = lowestPlanePoint(next, planeModel.groundPoints);
  if (crashLowestPoint < 0) next.y -= crashLowestPoint;
  next.crashed = true;
  next.crashTime = now;
  next.crashImpact = clamp(impact, 0.75, 1.8);
  next.thrust = 0;
  next.throttle = 0;
  next.turnRate = 0;
  next.vx = 0;
  next.vy = 0;
  return next;
}

/**
 * Deterministic standard-room flight model. This is intentionally the same
 * flight model used by the existing client, without solo/training modifiers.
 */
export function simulateRoomPlane(current, rawInput, dt = ROOM_TICK_SECONDS, now = Date.now()) {
  const input = createRoomInput(rawInput);
  const next = { ...current };
  const tuning = getPlayerFlightTuning();
  const events = [];
  const preStepGroundPoint = lowestPlanePoint(next, planeModel.groundPoints);
  const onRunway = !next.hasLifted && (next.y <= 0.02 || preStepGroundPoint <= 0.18);
  const powerRequested = input.power && next.fuel > 0;

  if (powerRequested) {
    next.fuel = Math.max(0, next.fuel - dt);
    next.throttle = Math.min(1, next.throttle + dt * tuning.throttleRise);
  } else {
    next.throttle = Math.max(0, next.throttle - dt * 1.35);
  }
  if (input.down) next.throttle = Math.max(0, next.throttle - dt * 2.65);
  next.thrust += (next.throttle - next.thrust) * Math.min(1, dt * tuning.thrustResponse);
  if (next.fuel <= 0) {
    next.throttle = 0;
    next.thrust = Math.max(0, next.thrust - dt * 12);
  }
  if (onRunway && input.down && !input.power) {
    next.throttle = 0;
    next.thrust = Math.max(0, next.thrust - dt * 9);
  }

  const elevator = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const speed = Math.hypot(next.vx, next.vy);
  const speedAuthority = clamp(speed / 18, 0, 1);
  const groundAuthority = onRunway ? clamp(Math.abs(next.vx) / 8 + next.thrust * 0.55, 0.28, 0.95) : 1;
  const turnAuthority = clamp(0.35 + speedAuthority * 0.75 + next.thrust * 0.42, 0.38, 1.45) * groundAuthority;
  const targetTurnRate = elevator * (tuning.turnBaseRate + turnAuthority * tuning.turnAuthorityRate);
  next.turnRate += (targetTurnRate - next.turnRate) * Math.min(1, dt * (elevator ? tuning.turnInputResponse : 10));
  next.turnRate *= Math.exp(-dt * (elevator ? tuning.turnHeldDamping : tuning.turnReleaseDamping));
  next.angle = normalizeAngle(next.angle + next.turnRate * dt);

  const rad = (next.angle * Math.PI) / 180;
  const forwardX = -Math.cos(rad);
  const forwardY = Math.sin(rad);
  const normalX = -Math.sin(rad);
  const normalY = Math.cos(rad);
  const diving = forwardY < -0.15;
  const climbing = forwardY > 0.15;
  const runwaySpeed = Math.abs(next.vx);
  const takeoffReady = runwaySpeed > tuning.takeoffSpeed && next.thrust > 0.58 && climbing;

  if (onRunway) {
    if (preStepGroundPoint < 0) next.y -= preStepGroundPoint;
    next.vy = 0;
    if (input.down && !input.power) {
      next.vx += Math.cos(rad) * 58 * dt;
      next.vx = Math.min(next.vx, 15);
    }
    if (!input.left && !input.right) {
      next.angle = normalizeAngle(next.angle + normalizeAngle(14 - next.angle) * Math.min(1, dt * 5.5));
      next.turnRate *= Math.exp(-dt * 7);
    }
  }

  const thrustForce = onRunway ? tuning.runwayThrust : tuning.flightThrust;
  const thrustBoost = diving ? tuning.diveBoost : climbing ? tuning.climbBoost : 1;
  next.vx += forwardX * thrustForce * next.thrust * thrustBoost * dt;
  if (!onRunway || takeoffReady) {
    next.vy += forwardY * thrustForce * next.thrust * thrustBoost * dt;
    if (diving) next.vy -= Math.abs(forwardY) * next.thrust * tuning.divePull * dt;
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
  if (poweredDive && !onRunway) next.vy -= Math.abs(forwardY) * next.thrust * tuning.poweredDivePull * dt;
  if (input.down) {
    const brake = Math.exp(-dt * (onRunway ? 4.2 : 2.4));
    next.vx *= brake;
    next.vy *= brake;
  }

  const cappedSpeed = Math.hypot(next.vx, next.vy);
  const maxSpeed = diving
    ? tuning.maxDiveBaseSpeed + next.thrust * tuning.maxDiveThrustBonus
    : climbing ? tuning.maxClimbSpeed : tuning.maxLevelSpeed;
  if (cappedSpeed > maxSpeed) {
    const cap = maxSpeed / cappedSpeed;
    next.vx *= cap;
    next.vy *= cap;
  }
  if (onRunway) {
    next.vy = Math.max(0, next.vy);
    next.vx *= Math.exp(-dt * (next.thrust > 0.08 ? 0.45 : 1.25));
    if (takeoffReady) next.vy = Math.max(next.vy, forwardY * (updatedSpeed * 0.26 + next.thrust * 3.4));
  }

  next.x += next.vx * dt;
  next.y += next.vy * dt;
  const lowestPoint = lowestPlanePoint(next, planeModel.groundPoints);
  if (lowestPoint < 0 && !next.hasLifted) {
    next.y -= lowestPoint;
    next.vy = Math.max(0, next.vy);
  }
  if (next.y > 1.2) next.airborne = true;
  if (next.y > 2 || (next.airborne && lowestPoint > 0.55)) next.hasLifted = true;

  const shapePoints = planeModel.hitPoints.map((point) => getPlanePoint(next, point));
  const hitHay = hayObstacles.some((hay) => shapePoints.some((point) => pointHitsHay(point, hay)));
  const hitWorldEdge = shapePoints.some((point) => point.x <= 0 || point.x >= WORLD_WIDTH);
  const fuelStationIndex = fuelStationZones.findIndex((station) =>
    shapePoints.some((point) => point.y > 0 && point.y < station.height && point.x > station.x && point.x < station.x + station.width),
  );
  if (fuelStationIndex >= 0) {
    const hadDamage = (next.damage ?? 0) > 0;
    const refilled = next.fuel < FUEL_SECONDS - 0.05 || hadDamage;
    next.fuel = FUEL_SECONDS;
    if (hadDamage) next.damage = 0;
    if (refilled) events.push({ type: 'fuel_refilled', stationIndex: fuelStationIndex });
  }

  const groundLowestPoint = lowestPlanePoint(next, planeModel.groundPoints);
  const tireLowestPoint = lowestPlanePoint(next, planeModel.tirePoints);
  const bodyLowestPoint = lowestPlanePoint(next, planeModel.bodyGroundPoints);
  const tireContact = next.hasLifted && tireLowestPoint <= 0.05;
  const bodyStrike = next.hasLifted && bodyLowestPoint <= -0.04 && bodyLowestPoint < tireLowestPoint - 0.08;
  const hitGround = next.hasLifted && (groundLowestPoint <= 0 || tireContact || bodyStrike);
  const landingSpeed = Math.hypot(next.vx, next.vy);
  const landingAngle = Math.abs(normalizeAngle(next.angle - 14));
  const horizontalLandingSpeed = Math.abs(next.vx);
  const downwardLandingSpeed = Math.max(0, -next.vy);
  const safeLanding = tireContact && !bodyStrike && landingSpeed < 44 && horizontalLandingSpeed < 42 && downwardLandingSpeed < 19 && landingAngle < 34;

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
    events.push({ type: 'safe_landing' });
  } else if (hitGround || hitHay || hitWorldEdge) {
    events.push({ type: 'crashed', cause: hitHay ? 'hay' : hitWorldEdge ? 'edge' : 'ground' });
    return { state: crashRoomPlane(next, now, landingSpeed / 28), events };
  }

  next.searchLightOn = input.light;
  return { state: next, events };
}

function groundClippedTrajectory(startY, dx, dy, life, minLife = 80) {
  const groundHit = dy > 0 && Math.max(0, startY) <= dy;
  const ratio = groundHit ? clamp(Math.max(0, startY) / dy, 0, 1) : 1;
  return {
    dx: dx * ratio,
    dy: dy * ratio,
    groundHit,
    life: groundHit ? Math.max(minLife, life * ratio) : life,
  };
}

export function createRoomBulletProjectile(ownerId, plane, now, id) {
  const forward = getPlaneForwardVector(plane);
  const muzzle = getPlanePoint(plane, BULLET_MUZZLE_POINT);
  const fullDx = forward.x * BULLET_RANGE + plane.vx * BULLET_FLIGHT_SECONDS;
  const fullDy = -(forward.y * BULLET_RANGE * ROOM_BULLET_VERTICAL_ASPECT + plane.vy * BULLET_FLIGHT_SECONDS);
  const travel = groundClippedTrajectory(muzzle.y, fullDx, fullDy, BULLET_LIFETIME_MS);
  return {
    id,
    ownerId,
    weapon: 'bullet',
    x: muzzle.x,
    y: muzzle.y,
    dx: travel.dx,
    dy: travel.dy,
    life: travel.life,
    groundHit: travel.groundHit,
    radius: 1.05,
    created: now,
    lastUpdate: now,
    unit: 'world',
    angle: normalizeAngle((Math.atan2(travel.dy, travel.dx) * 180) / Math.PI),
  };
}

export function createRoomRocketProjectile(ownerId, plane, now, id, mountPoint) {
  const forward = getPlaneForwardVector(plane);
  const launchPoint = getPlanePoint(plane, mountPoint);
  return {
    id,
    ownerId,
    weapon: 'rocket',
    x: launchPoint.x,
    y: launchPoint.y,
    previousX: launchPoint.x,
    previousY: launchPoint.y,
    vx: forward.x * ROCKET_SPEED,
    vy: forward.y * ROCKET_SPEED,
    speed: ROCKET_SPEED,
    created: now,
    lastUpdate: now,
    guideUntil: now + 2000,
    angle: plane.angle,
    radius: 2.25,
    impact: 1.72,
  };
}

export function advanceRoomProjectile(projectile, now, targets = []) {
  if (projectile.weapon === 'rocket') {
    const next = updateGuidedRocket(projectile, now, targets);
    if (!next || (next.groundHit && now - next.impactAt > ROCKET_IMPACT_MS)) return { projectile: null, segment: null };
    return { projectile: next, segment: getRocketSegment(next) };
  }

  const age = now - projectile.created;
  if (age >= projectile.life) return { projectile: null, segment: null };
  const previousAt = Math.min(now, Math.max(projectile.created, projectile.lastUpdate ?? projectile.created));
  const previousProgress = clamp((previousAt - projectile.created) / projectile.life, 0, 1);
  const progress = clamp(age / projectile.life, 0, 1);
  const start = { x: projectile.x + projectile.dx * previousProgress, y: projectile.y - projectile.dy * previousProgress };
  const end = { x: projectile.x + projectile.dx * progress, y: projectile.y - projectile.dy * progress };
  return {
    projectile: {
      ...projectile,
      renderX: end.x,
      renderY: end.y,
      lastUpdate: now,
    },
    segment: { start, end },
  };
}

export function projectileHitsPlayer(segment, projectile, playerState) {
  return Boolean(segment && playerState && !playerState.crashed && segmentHitsPlane(segment, playerState, projectile.radius ?? 1.05));
}

export const ROOM_WEAPON_RULES = Object.freeze({
  bulletCooldownMs: BULLET_COOLDOWN_MS,
  bulletReloadMs: BULLET_RELOAD_MS,
  rocketCooldownMs: ROCKET_COOLDOWN_MS,
  maxBullets: MAX_BULLETS,
  maxRockets: MAX_ROCKETS,
  rocketLifetimeMs: ROCKET_LIFETIME_MS,
  rocketTurnRate: ROCKET_TURN_RATE,
});
