import { BULLET_RANGE, BULLET_LIFETIME_MS, BULLET_FLIGHT_SECONDS, BULLET_MUZZLE_POINT } from './config.js';
import { getRenderedPlanePoint } from './mechanics.js';

// Aim direction compensates for the shooter's inherited velocity as well as
// target motion. This is a visual suggestion only; it never redirects a bullet.
export function getBulletLead(player, targets, { aspect = 1, pace = 1, maxDistance = 65, preferredIndex = -1 } = {}) {
  if (!player || player.crashed || !player.hasLifted) return null;
  const muzzle = getRenderedPlanePoint(player, BULLET_MUZZLE_POINT);
  const ratio = Math.max(0.1, aspect);
  const life = BULLET_LIFETIME_MS / 1000 / pace;
  const speed = BULLET_RANGE / life;
  const inherit = BULLET_FLIGHT_SECONDS / life;
  const rad = player.angle * Math.PI / 180;
  const candidates = [];
  targets.forEach((target, index) => {
    if (!target || target.crashed || !target.hasLifted) return;
    const rx = target.x - muzzle.x, ry = (target.y - muzzle.y) / ratio;
    const distance = Math.hypot(rx, ry);
    if (distance < 3 || distance > maxDistance || (-Math.cos(rad)*rx + Math.sin(rad)*ry)/distance < Math.cos(Math.PI/3)) return;
    const vx = target.vx - player.vx * inherit;
    const vy = (target.vy - player.vy * inherit) / ratio;
    const a = vx*vx + vy*vy - speed*speed;
    const b = 2*(rx*vx + ry*vy), c = rx*rx + ry*ry;
    const discriminant = b*b - 4*a*c;
    const roots = Math.abs(a) < 1e-8 ? (Math.abs(b)>1e-8 ? [-c/b] : []) : discriminant >= 0 ? [(-b-Math.sqrt(discriminant))/(2*a),(-b+Math.sqrt(discriminant))/(2*a)] : [];
    const time = Math.min(...roots.filter(t => t > 0 && t <= life));
    if (!Number.isFinite(time) || target.y + target.vy*time <= 1) return;
    const dx = rx + vx*time, dy = ry + vy*time;
    if ((-Math.cos(rad)*dx + Math.sin(rad)*dy)/Math.hypot(dx,dy) < Math.cos(Math.PI/3)) return;
    candidates.push({ index, x:muzzle.x+dx, y:muzzle.y+dy*ratio, time, distance });
  });
  return candidates.find(c => c.index === preferredIndex) ?? candidates.sort((a,b) => a.distance-b.distance)[0] ?? null;
}
