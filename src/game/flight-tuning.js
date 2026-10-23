import { ACTIVE_GAMEPLAY_PACING } from './config.js';

// 70 is the original flight feel. Values above it boost only the player.
function handlingScale(value, minimum, maximum) {
  const parsed = Number(value ?? 70);
  const meter = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 70;
  return meter <= 70 ? minimum + (1 - minimum) * meter / 70 : 1 + (maximum - 1) * (meter - 70) / 30;
}

export function getPlayerFlightTuning(rules) {
  const flightPace = handlingScale(rules?.flightPace, 0.7, 1.4);
  const turnPace = handlingScale(rules?.turnPace, 0.65, 1.3);
  const accelerationPace = Math.pow(flightPace, 0.86);
  const responsePace = 0.8 + flightPace * 0.2;
  const base = ACTIVE_GAMEPLAY_PACING.player;
  return {
    ...base,
    throttleRise: base.throttleRise * responsePace,
    thrustResponse: base.thrustResponse * responsePace,
    turnBaseRate: base.turnBaseRate * turnPace,
    turnAuthorityRate: base.turnAuthorityRate * turnPace,
    turnInputResponse: base.turnInputResponse * (0.82 + turnPace * 0.18),
    runwayThrust: base.runwayThrust * accelerationPace,
    flightThrust: base.flightThrust * accelerationPace,
    takeoffSpeed: base.takeoffSpeed * Math.sqrt(flightPace),
    maxLevelSpeed: base.maxLevelSpeed * flightPace,
    maxClimbSpeed: base.maxClimbSpeed * flightPace,
    maxDiveBaseSpeed: base.maxDiveBaseSpeed * flightPace,
    maxDiveThrustBonus: base.maxDiveThrustBonus * flightPace,
  };
}

// Fixed bot airspeed on the same meter as the player; independent of player settings.
export const BOT_FLIGHT_TUNING = Object.freeze(getPlayerFlightTuning({ flightPace: 50 }));
