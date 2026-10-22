// Solo bot navigation only: steering goals, not changes to flight forces.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const CRUISE_HEIGHTS = [65, 95, 130, 165, 80, 115];

export function planBotAltitude(bot, index, dt, pursuing, now) {
  const cruise = CRUISE_HEIGHTS[index % CRUISE_HEIGHTS.length];
  const lowTime = bot.y < 28 ? (bot.lowFlightSeconds ?? 0) + dt : 0;
  let climbing = bot.altitudeRecovery ?? true;
  // Give a low fight time to develop, then regain some height for another pass.
  if (lowTime > 12 + index * 1.5) climbing = true;
  const recoveryHeight = Math.min(cruise, 65);
  if (bot.y >= recoveryHeight) climbing = false;
  const direction = Math.abs(bot.vx) > 1 ? Math.sign(bot.vx) : bot.x < 350 ? 1 : -1;
  const desiredHeight = climbing ? recoveryHeight + 12 : cruise + Math.sin(now / 6500 + index * 1.7) * 8;
  // Bound the requested climb angle; retain enough forward speed to generate lift.
  const climb = clamp((desiredHeight - bot.y) * 0.6 - bot.vy * 1.2 + 12, -35, 52);
  return {
    lowFlightSeconds: climbing ? 0 : lowTime,
    altitudeRecovery: climbing,
    overridePursuit: climbing,
    target: {x: clamp(bot.x + direction * 85, 34, 666), y: clamp(bot.y + climb, 12, 335)},
    throttle: climbing || (!pursuing && desiredHeight - bot.y > 12) ? 1 : 0.82,
  };
}
