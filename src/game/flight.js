// World coordinates: x right, y up; angle zero faces left.
// Arcade units, not aircraft engineering units. Lift is perpendicular to airspeed.
export const FLIGHT_GRAVITY = 14.2;
// Full power must exceed gravity even at the lowest flight-pace setting.
// Keep drag continuous: extra power increases cruise speed without a hard cap.
export const AIRBORNE_THRUST_SCALE = 0.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function flightTurnAuthority(speed, thrust = 0) {
  return 0.12 + 0.88 * clamp(speed / 24, 0, 1) + 0.08 * thrust;
}

export function applyFlightForces(plane, dt, { thrust = 30, cruiseSpeed = 35, brake = false } = {}) {
  const rad = plane.angle * Math.PI / 180;
  const fx = -Math.cos(rad), fy = Math.sin(rad);
  const speed = Math.hypot(plane.vx, plane.vy);
  const ux = speed > 0.001 ? plane.vx / speed : fx;
  const uy = speed > 0.001 ? plane.vy / speed : fy;
  const alignment = ux * fx + uy * fy;
  const aoa = Math.atan2(-(ux * Math.sin(rad) + uy * Math.cos(rad)), alignment);
  // Smooth stall: authority fades as the nose moves away from the airflow.
  const attached = Math.exp(-Math.pow(Math.abs(aoa) / 0.85, 4));
  const coefficient = (0.015 + 0.12 * Math.sin(2 * aoa)) * attached;
  const lift = 70 * Math.tanh(speed * speed * coefficient / 70);
  const cruise = Math.max(20, cruiseSpeed);
  const dragRate = 0.04 + 0.00025 * speed * speed * Math.pow(35 / cruise, 3)
    + 0.35 * Math.sin(aoa) ** 2 + (brake ? 0.28 : 0);
  plane.vx += (fx * thrust * plane.thrust + uy * lift) * dt;
  plane.vy += (fy * thrust * plane.thrust - ux * lift - FLIGHT_GRAVITY) * dt;
  const drag = Math.exp(-dragRate * dt);
  plane.vx *= drag;
  plane.vy *= drag;
}

// Render between completed fixed steps; gameplay always uses the current state.
export function interpolateFlightState(previous, current, alpha) {
  if (!previous || current.crashed) return current;
  const t = clamp(alpha, 0, 1);
  const angleDelta = ((current.angle - previous.angle + 540) % 360) - 180;
  return { ...current, x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t, angle: previous.angle + angleDelta * t };
}
