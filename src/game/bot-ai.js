import {
  ACTIVE_GAMEPLAY_PACING,
  BOT_BULLET_COOLDOWN_MS,
  BULLET_LIFETIME_MS,
  BULLET_FLIGHT_SECONDS,
  BULLET_RANGE,
} from './config.js';

const clampValue = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const BOT_SKILL_LABELS = Object.freeze(['Easy', 'Standard', 'Hard']);

// Difficulty changes decision quality, not health or the player's physics.
// Every profile uses the same collision rules and weapon damage; stronger bots
// win through awareness, prediction, accuracy, and defensive flying.
export const BOT_SKILL_PROFILES = Object.freeze([
  Object.freeze({
    level: 1,
    label: 'Easy',
    wakeDistance: 70,
    forgetDistance: 94,
    decisionIntervalMs: 460,
    pursuitLeadFactor: 0.42,
    movementScale: 0.78,
    speedScale: 0.86,
    responseScale: 0.72,
    bulletCooldownScale: 2.3,
    aimLeadFactor: 0.34,
    aimWobbleDegrees: 9,
    aimWobblePeriodMs: 720,
    fireAimError: 19,
    fireMinDistance: 5,
    fireMaxDistance: 86,
    combatWeaveStrength: 0,
    combatWeavePeriodMs: 1800,
    evasionDurationMs: 280,
    evasionStrength: 8,
    targetLockMs: 3400,
    targetRotationMs: 6400,
    targetJudgmentNoise: 0.25,
    finishTargetBias: 0.04,
    retaliationDelayMs: 520,
    retaliationMemoryMs: 900,
    collisionLookAheadSeconds: 0.42,
    collisionClearance: 4.8,
    collisionSidestep: 15,
    groundLookAheadSeconds: 0.72,
    groundEmergencyClearance: 1,
    groundRecoveryAltitude: 18,
  }),
  Object.freeze({
    level: 2,
    label: 'Standard',
    wakeDistance: 98,
    forgetDistance: 124,
    decisionIntervalMs: 210,
    pursuitLeadFactor: 0.8,
    movementScale: 1,
    speedScale: 1,
    responseScale: 1,
    bulletCooldownScale: 1,
    aimLeadFactor: 0.78,
    aimWobbleDegrees: 3.2,
    aimWobblePeriodMs: 940,
    fireAimError: 9,
    fireMinDistance: 3.5,
    fireMaxDistance: 106,
    combatWeaveStrength: 5,
    combatWeavePeriodMs: 1450,
    evasionDurationMs: 950,
    evasionStrength: 24,
    targetLockMs: 2100,
    targetRotationMs: 4800,
    targetJudgmentNoise: 0.12,
    finishTargetBias: 0.15,
    retaliationDelayMs: 220,
    retaliationMemoryMs: 1600,
    collisionLookAheadSeconds: 0.64,
    collisionClearance: 5.2,
    collisionSidestep: 21,
    groundLookAheadSeconds: 1.02,
    groundEmergencyClearance: 1.05,
    groundRecoveryAltitude: 23,
  }),
  Object.freeze({
    level: 3,
    label: 'Hard',
    wakeDistance: 116,
    forgetDistance: 146,
    decisionIntervalMs: 125,
    pursuitLeadFactor: 0.92,
    movementScale: 1.12,
    speedScale: 1.05,
    responseScale: 1.14,
    bulletCooldownScale: 0.72,
    aimLeadFactor: 0.92,
    aimWobbleDegrees: 1.35,
    aimWobblePeriodMs: 1080,
    fireAimError: 5.5,
    fireMinDistance: 3,
    fireMaxDistance: 116,
    combatWeaveStrength: 8.5,
    combatWeavePeriodMs: 1260,
    evasionDurationMs: 1380,
    evasionStrength: 34,
    targetLockMs: 1500,
    targetRotationMs: 4000,
    targetJudgmentNoise: 0.07,
    finishTargetBias: 0.22,
    retaliationDelayMs: 120,
    retaliationMemoryMs: 2100,
    collisionLookAheadSeconds: 0.78,
    collisionClearance: 5.4,
    collisionSidestep: 24,
    groundLookAheadSeconds: 1.18,
    groundEmergencyClearance: 1.1,
    groundRecoveryAltitude: 26,
  }),

]);

export function getBotSkillProfile(difficulty = 2) {
  const index = Math.round(clampValue(Number(difficulty) || 2, 1, BOT_SKILL_PROFILES.length)) - 1;
  return BOT_SKILL_PROFILES[index];
}

export function getBotFlightTuning(rules, fog = false) {
  const profile = getBotSkillProfile(rules?.botDifficulty);
  const base = ACTIVE_GAMEPLAY_PACING.bot;
  return {
    ...profile,
    visibilityDistance: fog ? (rules?.weatherMode === 2 ? 45 : 65) : Infinity,
    fireMaxDistance: fog ? Math.min(profile.fireMaxDistance, rules?.weatherMode === 2 ? 45 : 65) : profile.fireMaxDistance,
    steeringGain: base.steeringGain * profile.movementScale,
    turnLimitBase: base.turnLimitBase * profile.movementScale,
    turnLimitSpeedBonus: base.turnLimitSpeedBonus * profile.movementScale,
    turnResponse: base.turnResponse * profile.responseScale,
    turnDamping: base.turnDamping / Math.sqrt(profile.responseScale),
    pursuitThrottleResponse: base.pursuitThrottleResponse * profile.responseScale,
    cruiseThrottleResponse: base.cruiseThrottleResponse * profile.responseScale,
    thrustResponse: base.thrustResponse * profile.responseScale,
    runwayThrust: base.runwayThrust * profile.speedScale,
    bulletCooldownMs: Math.round(BOT_BULLET_COOLDOWN_MS * profile.bulletCooldownScale),
    fireAimDot: Math.cos(toRadians(profile.fireAimError + 3)),
  };
}

const getCandidateKey = (candidate) => candidate.key
  ?? (candidate.type === 'player' ? 'player' : `bot:${candidate.index}`);

const getCandidateDistance = (bot, candidate) => candidate.distance
  ?? Math.max(0.1, Math.hypot(candidate.state.x - bot.x, candidate.state.y - bot.y));

const getFacingError = (bot, candidate) => {
  const dx = candidate.state.x - bot.x;
  const dy = candidate.state.y - bot.y;
  const targetAngle = (Math.atan2(dy, -dx) * 180) / Math.PI;
  const error = ((targetAngle - (bot.angle ?? 0) + 540) % 360) - 180;
  return Math.abs(error) / 180;
};

const targetNoise = (botIndex, candidateKey, targetEpoch) => {
  let hash = (botIndex + 1) * 101 + targetEpoch * 131;
  for (let index = 0; index < candidateKey.length; index += 1) {
    hash = (hash * 33 + candidateKey.charCodeAt(index)) % 104729;
  }
  return Math.sin(hash * 0.017) * 0.5 + 0.5;
};

// Free-for-all targeting: each bot evaluates the player and every other living
// bot. A rotating preference distributes the opening fights, while distance,
// firing angle, damage, retaliation, and skill decide when targets change.
export function selectBotCombatTarget(bot, candidates, targetState, now, botIndex, tuning) {
  const livingCandidates = candidates
    .filter((candidate) => candidate?.state && !candidate.state.crashed)
    .map((candidate) => ({
      ...candidate,
      key: getCandidateKey(candidate),
      distance: getCandidateDistance(bot, candidate),
    })).filter(candidate => candidate.distance <= (tuning.visibilityDistance ?? Infinity));
  const current = livingCandidates.find((candidate) => candidate.key === targetState?.key);
  const retaliation = livingCandidates.find((candidate) => candidate.key === targetState?.retaliationKey);
  const retaliationAge = now - (targetState?.retaliationAt ?? -Infinity);
  const retaliationReady = retaliation
    && retaliation.distance <= tuning.forgetDistance
    && retaliationAge >= tuning.retaliationDelayMs
    && retaliationAge <= tuning.retaliationMemoryMs;

  if (retaliationReady && retaliation.key !== current?.key) {
    return {
      target: retaliation,
      key: retaliation.key,
      lockedUntil: now + tuning.targetLockMs,
      reason: 'retaliation',
    };
  }

  if (
    current
    && current.distance <= tuning.forgetDistance
    && now < (targetState?.lockedUntil ?? 0)
  ) {
    return {
      target: current,
      key: current.key,
      lockedUntil: targetState.lockedUntil,
      reason: 'locked',
    };
  }

  const visibleCandidates = livingCandidates.filter((candidate) => (
    candidate.distance <= tuning.wakeDistance
    || (candidate.key === current?.key && candidate.distance <= tuning.forgetDistance)
  ));
  if (visibleCandidates.length === 0) {
    return { target: null, key: null, lockedUntil: 0, reason: 'roam' };
  }

  const orderedCandidates = [...visibleCandidates].sort((left, right) => left.key.localeCompare(right.key));
  const targetEpoch = Math.floor(now / tuning.targetRotationMs);
  const preferredIndex = (botIndex + targetEpoch) % orderedCandidates.length;
  const scoredCandidates = orderedCandidates.map((candidate, index) => {
    const distanceScore = clampValue(candidate.distance / tuning.wakeDistance, 0, 1) * 0.62;
    const facingScore = getFacingError(bot, candidate) * 0.18;
    const preferenceDistance = Math.min(
      (index - preferredIndex + orderedCandidates.length) % orderedCandidates.length,
      (preferredIndex - index + orderedCandidates.length) % orderedCandidates.length,
    );
    const distributionScore = orderedCandidates.length > 1
      ? (preferenceDistance / (orderedCandidates.length - 1)) * 0.24
      : 0;
    const damagedScore = -clampValue((candidate.state.damage ?? 0) / 2, 0, 1) * tuning.finishTargetBias;
    const judgmentError = targetNoise(botIndex, candidate.key, targetEpoch) * tuning.targetJudgmentNoise;
    return {
      candidate,
      score: distanceScore + facingScore + distributionScore + damagedScore + judgmentError,
    };
  });
  scoredCandidates.sort((left, right) => left.score - right.score || left.candidate.key.localeCompare(right.candidate.key));
  const selected = scoredCandidates[0].candidate;
  return {
    target: selected,
    key: selected.key,
    lockedUntil: now + tuning.targetLockMs,
    reason: current?.key === selected.key ? 'reacquired' : 'opportunity',
  };
}

// Only a predicted intersection creates an avoidance response. Merely being
// close, flying parallel, or moving apart never creates an invisible bubble.
export function findBotCollisionThreat(bot, candidates, tuning) {
  let threat = null;
  for (const candidate of candidates) {
    const dx = candidate.state.x - bot.x;
    const dy = candidate.state.y - bot.y;
    const distance = Math.max(0.1, Math.hypot(dx, dy));
    const relativeVx = (candidate.state.vx ?? 0) - (bot.vx ?? 0);
    const relativeVy = (candidate.state.vy ?? 0) - (bot.vy ?? 0);
    const relativeSpeedSquared = relativeVx * relativeVx + relativeVy * relativeVy;
    if (relativeSpeedSquared < 0.01) continue;

    const relativeDot = dx * relativeVx + dy * relativeVy;
    const timeToClosest = -relativeDot / relativeSpeedSquared;
    const closingSpeed = -(relativeDot / distance);
    if (closingSpeed <= 0.6 || timeToClosest <= 0 || timeToClosest > tuning.collisionLookAheadSeconds) continue;

    const predictedDx = dx + relativeVx * timeToClosest;
    const predictedDy = dy + relativeVy * timeToClosest;
    const predictedClearance = Math.hypot(predictedDx, predictedDy);
    if (predictedClearance >= tuning.collisionClearance) continue;

    const urgency = timeToClosest + (predictedClearance / tuning.collisionClearance) * 0.2;
    if (!threat || urgency < threat.urgency) {
      threat = {
        ...candidate,
        dx,
        dy,
        distance,
        closingSpeed,
        timeToClosest,
        predictedClearance,
        urgency,
      };
    }
  }
  return threat;
}

export function getBotGroundThreat(bot, groundClearance, tuning) {
  if (!bot.airborne || !bot.hasLifted) return null;
  const speed = Math.hypot(bot.vx ?? 0, bot.vy ?? 0);
  const noseDescent = Math.max(0, -Math.sin(toRadians(bot.angle ?? 0))) * Math.max(3, speed * 0.32);
  const descentSpeed = Math.max(0, -(bot.vy ?? 0), noseDescent);
  const emergency = groundClearance < tuning.groundEmergencyClearance;
  if (!emergency && descentSpeed < 1.2) return null;
  const timeToGround = groundClearance / Math.max(0.1, descentSpeed);
  if (!emergency && timeToGround > tuning.groundLookAheadSeconds) return null;
  return { emergency, descentSpeed, timeToGround };
}

export function getBotPursuitPoint(target, distance, tuning) {
  const leadTime = clampValue((distance / 46) * tuning.pursuitLeadFactor, 0.16, 1.9);
  return {
    x: target.x + (target.vx ?? 0) * leadTime,
    y: target.y + (target.vy ?? 0) * leadTime + 2.2,
  };
}

export function getBotAimPoint(bot, target, distance, now, botIndex, tuning, aspect = 1, pace = 1) {
  const life = BULLET_LIFETIME_MS / 1000 / pace;
  const projectileSpeed = BULLET_RANGE / life;
  const ratio = Math.max(0.1, aspect);
  const inheritedX = (bot.vx ?? 0) * BULLET_FLIGHT_SECONDS / life;
  const inheritedY = (bot.vy ?? 0) * BULLET_FLIGHT_SECONDS / life;
  // Match the projectile's viewport aspect and inherited aircraft momentum.
  const rx = target.x - bot.x, ry = (target.y + 1.1 - bot.y) / ratio;
  const vx = (target.vx ?? 0) - inheritedX;
  const vy = ((target.vy ?? 0) - inheritedY) / ratio;
  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
  const b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  const discriminant = b * b - 4 * a * c;
  let intercept = distance / projectileSpeed;
  if (Math.abs(a) < 1e-8 && b < 0) intercept = -c / b;
  else if (Math.abs(a) >= 1e-8 && discriminant >= 0) {
    const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(t => t > 0);
    if (roots.length) intercept = Math.min(...roots);
  }
  const leadTime = clampValue(intercept * tuning.aimLeadFactor, 0, life);
  const predictedX = target.x + vx * leadTime;
  const predictedY = bot.y + ry + vy * leadTime;
  const dx = predictedX - bot.x;
  const dy = predictedY - bot.y;
  const length = Math.max(0.1, Math.hypot(dx, dy));
  const wobblePhase = now / tuning.aimWobblePeriodMs + botIndex * 1.83;
  const wobbleDistance = Math.tan(toRadians(Math.sin(wobblePhase) * tuning.aimWobbleDegrees)) * length;
  return {
    x: predictedX + (-dy / length) * wobbleDistance,
    y: predictedY + (dx / length) * wobbleDistance,
  };
}

export function getBotCombatOffset(bot, target, now, botIndex, lastHitAt, tuning) {
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const distance = Math.max(0.1, Math.hypot(dx, dy));
  const perpendicularX = -dy / distance;
  const perpendicularY = dx / distance;
  const weave = Math.sin(now / tuning.combatWeavePeriodMs + botIndex * 2.17) * tuning.combatWeaveStrength;
  const hitAge = now - lastHitAt;
  const evading = hitAge >= 0 && hitAge < tuning.evasionDurationMs;
  if (!evading) return { x: perpendicularX * weave, y: perpendicularY * weave, evading: false };

  const evasionProgress = 1 - hitAge / tuning.evasionDurationMs;
  const evasionSide = (botIndex + Math.floor(lastHitAt / 250)) % 2 === 0 ? 1 : -1;
  const evasion = tuning.evasionStrength * (0.35 + evasionProgress * 0.65) * evasionSide;
  return {
    x: perpendicularX * (weave + evasion),
    y: perpendicularY * (weave + evasion) + tuning.evasionStrength * 0.12,
    evading: true,
  };
}
