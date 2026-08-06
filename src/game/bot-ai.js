import {
  ACTIVE_GAMEPLAY_PACING,
  BOT_BULLET_COOLDOWN_MS,
  BULLET_LIFETIME_MS,
  BULLET_RANGE,
} from './config.js';

const clampValue = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const BOT_SKILL_LABELS = Object.freeze(['Easy', 'Casual', 'Standard', 'Hard', 'Ace']);

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
    collisionLookAheadSeconds: 0.42,
    collisionClearance: 4.8,
    collisionSidestep: 15,
    groundLookAheadSeconds: 0.72,
    groundEmergencyClearance: 1,
    groundRecoveryAltitude: 18,
    groundRecoveryClimbSpeed: 4.2,
  }),
  Object.freeze({
    level: 2,
    label: 'Casual',
    wakeDistance: 84,
    forgetDistance: 108,
    decisionIntervalMs: 320,
    pursuitLeadFactor: 0.62,
    movementScale: 0.9,
    speedScale: 0.93,
    responseScale: 0.86,
    bulletCooldownScale: 1.55,
    aimLeadFactor: 0.58,
    aimWobbleDegrees: 6,
    aimWobblePeriodMs: 820,
    fireAimError: 14,
    fireMinDistance: 4,
    fireMaxDistance: 96,
    combatWeaveStrength: 2.5,
    combatWeavePeriodMs: 1650,
    evasionDurationMs: 620,
    evasionStrength: 15,
    collisionLookAheadSeconds: 0.52,
    collisionClearance: 5,
    collisionSidestep: 18,
    groundLookAheadSeconds: 0.88,
    groundEmergencyClearance: 1,
    groundRecoveryAltitude: 20,
    groundRecoveryClimbSpeed: 4.8,
  }),
  Object.freeze({
    level: 3,
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
    collisionLookAheadSeconds: 0.64,
    collisionClearance: 5.2,
    collisionSidestep: 21,
    groundLookAheadSeconds: 1.02,
    groundEmergencyClearance: 1.05,
    groundRecoveryAltitude: 23,
    groundRecoveryClimbSpeed: 5.5,
  }),
  Object.freeze({
    level: 4,
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
    collisionLookAheadSeconds: 0.78,
    collisionClearance: 5.4,
    collisionSidestep: 24,
    groundLookAheadSeconds: 1.18,
    groundEmergencyClearance: 1.1,
    groundRecoveryAltitude: 26,
    groundRecoveryClimbSpeed: 6.2,
  }),
  Object.freeze({
    level: 5,
    label: 'Ace',
    wakeDistance: 138,
    forgetDistance: 172,
    decisionIntervalMs: 70,
    pursuitLeadFactor: 1,
    movementScale: 1.24,
    speedScale: 1.1,
    responseScale: 1.28,
    bulletCooldownScale: 0.52,
    aimLeadFactor: 1,
    aimWobbleDegrees: 0.35,
    aimWobblePeriodMs: 1250,
    fireAimError: 2.8,
    fireMinDistance: 2.5,
    fireMaxDistance: 120,
    combatWeaveStrength: 12,
    combatWeavePeriodMs: 1080,
    evasionDurationMs: 1850,
    evasionStrength: 46,
    collisionLookAheadSeconds: 0.92,
    collisionClearance: 5.6,
    collisionSidestep: 27,
    groundLookAheadSeconds: 1.34,
    groundEmergencyClearance: 1.15,
    groundRecoveryAltitude: 29,
    groundRecoveryClimbSpeed: 7,
  }),
]);

export function getBotSkillProfile(difficulty = 3) {
  const index = Math.round(clampValue(Number(difficulty) || 3, 1, BOT_SKILL_PROFILES.length)) - 1;
  return BOT_SKILL_PROFILES[index];
}

export function getBotFlightTuning(rules) {
  const profile = getBotSkillProfile(rules?.botDifficulty);
  const base = ACTIVE_GAMEPLAY_PACING.bot;
  return {
    ...profile,
    steeringGain: base.steeringGain * profile.movementScale,
    turnLimitBase: base.turnLimitBase * profile.movementScale,
    turnLimitSpeedBonus: base.turnLimitSpeedBonus * profile.movementScale,
    turnResponse: base.turnResponse * profile.responseScale,
    turnDamping: base.turnDamping / Math.sqrt(profile.responseScale),
    pursuitThrottleResponse: base.pursuitThrottleResponse * profile.responseScale,
    cruiseThrottleResponse: base.cruiseThrottleResponse * profile.responseScale,
    thrustResponse: base.thrustResponse * profile.responseScale,
    runwayThrust: base.runwayThrust * profile.speedScale,
    flightThrust: base.flightThrust * profile.speedScale,
    maxSpeed: base.maxSpeed * profile.speedScale,
    bulletCooldownMs: Math.round(BOT_BULLET_COOLDOWN_MS * profile.bulletCooldownScale),
    fireAimDot: Math.cos(toRadians(profile.fireAimError + 3)),
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

export function getBotAimPoint(bot, target, distance, now, botIndex, tuning) {
  const projectileSpeed = BULLET_RANGE / (BULLET_LIFETIME_MS / 1000);
  const leadTime = clampValue((distance / projectileSpeed) * tuning.aimLeadFactor, 0.08, 1.28);
  const predictedX = target.x + (target.vx ?? 0) * leadTime;
  const predictedY = target.y + (target.vy ?? 0) * leadTime + 1.1;
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
