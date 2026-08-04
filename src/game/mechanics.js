import {
  AIM_GUIDE_DOT_COUNT,
  AIM_GUIDE_DOT_SPACING,
  AIM_GUIDE_FIRST_DOT_DISTANCE,
  BOT_COUNT,
  BOT_RESPAWN_MIN_GAP,
  BOT_SPAWN_MARGIN,
  BOT_START_X,
  BULLET_FLIGHT_SECONDS,
  BULLET_LIFETIME_MS,
  BULLET_MUZZLE_POINT,
  BULLET_RANGE,
  DAMAGE_SMOKE_INTERVAL_MS,
  DAMAGE_SMOKE_LIFETIME_MS,
  DAMAGE_SMOKE_MAX_PARTICLES,
  FUEL_SECONDS,
  PLANE_SPRITE_ASPECT,
  ROCKET_DETECTION_RANGE,
  ROCKET_HOMING_MS,
  ROCKET_IMPACT_MS,
  ROCKET_LIFETIME_MS,
  ROCKET_SPEED,
  ROCKET_TURN_RATE,
  START_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config.js';

export const planeModel = {
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

export function createInitialPlaneState(spawnX = START_X, fuelSeconds = FUEL_SECONDS) {
  return {
    x: spawnX,
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
    fuel: Math.max(1, Number(fuelSeconds) || FUEL_SECONDS),
    searchLightOn: false,
  };
}

export function seededWeatherUnit(seed, label, index) {
  const input = `${seed}:${label}:${index}`;
  let hash = 2166136261;
  for (let position = 0; position < input.length; position += 1) {
    hash ^= input.charCodeAt(position);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function syncedWeatherCycleActive(elapsed, seed, label, initialBase, initialRange, durationBase, durationRange, gapBase, gapRange) {
  let cursor = initialBase + seededWeatherUnit(seed, label, 0) * initialRange;
  for (let cycle = 0; cycle < 512; cycle += 1) {
    const duration = durationBase + seededWeatherUnit(seed, label, cycle * 2 + 1) * durationRange;
    if (elapsed >= cursor && elapsed < cursor + duration) return true;
    cursor += duration + gapBase + seededWeatherUnit(seed, label, cycle * 2 + 2) * gapRange;
    if (cursor > elapsed) return false;
  }
  return false;
}

export function getSyncedRoomWeather(weather, now) {
  const startedAt = Number(weather?.startedAt);
  const seed = String(weather?.seed || '');
  if (!Number.isFinite(startedAt) || !seed) return { fog: false, rain: false };
  const elapsed = Math.max(0, now - startedAt);
  return {
    fog: syncedWeatherCycleActive(elapsed, seed, 'fog', 4500, 6500, 13000, 9000, 22000, 28000),
    rain: syncedWeatherCycleActive(elapsed, seed, 'rain', 15000, 17000, 14000, 11000, 36000, 52000),
  };
}

export function getSyncedCowPottyPlan(seed, cowId, cycle) {
  const label = `cow:${cowId}`;
  const pottyStart = 0.2 + seededWeatherUnit(seed, `${label}:start`, cycle) * 0.56;
  return {
    cycle,
    active: seededWeatherUnit(seed, `${label}:active`, cycle) < 0.22,
    x: 24 + seededWeatherUnit(seed, `${label}:x`, cycle) * (WORLD_WIDTH - 70),
    start: pottyStart,
    end: pottyStart + 0.045,
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

export function createInitialBotState(previousX = null, avoidXValues = []) {
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

export function createInitialBotStates(previousStates = [], count = BOT_COUNT) {
  const states = [];
  for (let index = 0; index < count; index += 1) {
    states.push(createInitialBotState(previousStates[index]?.x, states.map((state) => state.x)));
  }
  return states;
}

export function getPlanePoint(plane, point) {
  const localX = (point.x + planeModel.visualOffsetX / 100) * planeModel.widthVw;
  const localY = -(point.y + planeModel.visualOffsetY / 100) * planeModel.heightVh;
  const rad = (plane.angle * Math.PI) / 180;
  return {
    x: plane.x + localX * Math.cos(rad) - localY * Math.sin(rad),
    y: plane.y + localX * Math.sin(rad) + localY * Math.cos(rad),
  };
}

export function getRenderedPlanePoint(plane, point) {
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

export function pointHitsPlane(point, plane, radius = 0.9) {
  if (!plane || plane.crashed) return false;
  return planeModel.hitPoints.some((hitPoint) => {
    const targetPoint = getPlanePoint(plane, hitPoint);
    const dx = (point.x - targetPoint.x) * 1.35;
    const dy = point.y - targetPoint.y;
    return Math.hypot(dx, dy) <= radius;
  });
}

export function planesCollide(planeA, planeB) {
  if (!planeA || !planeB || planeA.crashed || planeB.crashed) return false;
  return (
    planeModel.hitPoints.some((point) => pointHitsPlane(getPlanePoint(planeA, point), planeB, 0.74)) ||
    planeModel.hitPoints.some((point) => pointHitsPlane(getPlanePoint(planeB, point), planeA, 0.74))
  );
}

export function getProjectilePoint(projectile, now) {
  const progress = clamp((now - projectile.created) / projectile.life, 0, 1);
  if (projectile.unit === 'world') return getTrajectoryPoint(projectile, progress);
  const viewportWidth = window.innerWidth || 1440;
  const viewportHeight = window.innerHeight || 900;
  return {
    x: projectile.x + (projectile.dx / viewportWidth) * 100 * progress,
    y: projectile.y - (projectile.dy / viewportHeight) * 100 * progress,
  };
}

export function getProjectileSegment(projectile, now) {
  const startTime = projectile.lastHitCheck ?? projectile.created;
  const start = getProjectilePoint(projectile, startTime);
  const end = getProjectilePoint(projectile, now);
  projectile.lastHitCheck = now;
  return { start, end };
}

export function getTrajectoryPoint(trajectory, progress) {
  return {
    x: trajectory.x + trajectory.dx * progress,
    y: trajectory.y - trajectory.dy * progress,
  };
}

export function setWorldTransformPosition(element, x, y) {
  if (!element) return;
  element.style.setProperty('--world-x', `${x}vw`);
  element.style.setProperty('--world-y', `${-y}vh`);
}

export function syncProjectileRenderPositions(projectiles, now, elementRefs = null) {
  if (projectiles.length === 0) return;
  projectiles.forEach((projectile) => {
    const point = getProjectilePoint(projectile, now);
    projectile.renderX = point.x;
    projectile.renderY = point.y;
    const element = elementRefs?.get(projectile.id);
    if (element) {
      setWorldTransformPosition(element, point.x, point.y);
    }
  });
}

export function getPlaneForwardVector(plane) {
  const rad = (plane.angle * Math.PI) / 180;
  return {
    x: -Math.cos(rad),
    y: Math.sin(rad),
  };
}

function getRulePace(rules, key) {
  const value = Number(rules?.[key]);
  return Number.isFinite(value) ? Math.max(0.35, Math.min(1, value / 100)) : 1;
}

export function getBulletTrajectory(plane, rules = null) {
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
  // Bullet pace changes travel time, not range, so a slower practice setting
  // remains predictable and reaches the same aiming-guide endpoint.
  const bulletLifetimeMs = BULLET_LIFETIME_MS / getRulePace(rules, 'bulletPace');
  const travel = getGroundClippedWorldProjectile(muzzle.y, fullDx, fullDy, bulletLifetimeMs, 80);
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

export function createBulletProjectile(plane, now, idPrefix = 'bullet', trajectory = null, rules = null) {
  const resolvedTrajectory = trajectory || getBulletTrajectory(plane, rules);
  return {
    id: `${now}-${idPrefix}-${Math.random()}`,
    x: resolvedTrajectory.x,
    y: resolvedTrajectory.y,
    renderX: resolvedTrajectory.x,
    renderY: resolvedTrajectory.y,
    dx: resolvedTrajectory.dx,
    dy: resolvedTrajectory.dy,
    groundHit: resolvedTrajectory.groundHit,
    life: resolvedTrajectory.life,
    created: now,
    angle: resolvedTrajectory.angle,
    unit: 'world',
    radius: 1.05,
  };
}

export function getBulletGuidePoints(trajectory) {
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

export function createRocketProjectile(plane, now, mountPoint, idPrefix = 'rocket', rules = null) {
  const forward = getPlaneForwardVector(plane);
  const launchPoint = getPlanePoint(plane, mountPoint);
  const speed = ROCKET_SPEED * getRulePace(rules, 'rocketPace');
  return {
    id: `${now}-${idPrefix}-${Math.random()}`,
    x: launchPoint.x,
    y: launchPoint.y,
    previousX: launchPoint.x,
    previousY: launchPoint.y,
    vx: forward.x * speed,
    vy: forward.y * speed,
    speed,
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
    if (distance > ROCKET_DETECTION_RANGE) return closest;
    if (!closest || distance < closest.distance) return { ...target, distance };
    return closest;
  }, null);
}

export function updateGuidedRocket(rocket, now, targets) {
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
  const speed = rocket.speed ?? ROCKET_SPEED;
  const vx = -Math.cos(rad) * speed;
  const vy = Math.sin(rad) * speed;
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

export function updateGuidedRockets(rockets, now, targets) {
  return rockets
    .map((rocket) => updateGuidedRocket(rocket, now, targets))
    .filter((rocket) => rocket && (!rocket.groundHit || now - rocket.impactAt <= ROCKET_IMPACT_MS));
}

export function getRocketSegment(rocket) {
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

export function segmentHitsPlane(segment, plane, radius = 0.9) {
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

export function updateDamageSmokeParticles(current, plane, previousPlane, now, active, lastEmitRef) {
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

export function pointHitsHay(point, hay) {
  if (hay.type === 'roll') {
    const dx = (point.x - (hay.x + 1.05)) / 0.84;
    const dy = (point.y - 1.18) / 1.12;
    return dx * dx + dy * dy <= 1;
  }

  return point.x >= hay.x + 0.16 && point.x <= hay.x + 1.92 && point.y >= 0.06 && point.y <= 1.62;
}

export function getCameraX(x) {
  return Math.max(0, Math.min(WORLD_WIDTH - 100, x - 50));
}

export function getCameraY(y) {
  return Math.max(0, Math.min(WORLD_HEIGHT - 100, y - 44));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}
