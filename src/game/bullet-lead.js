import { bulletSegmentHitsPlane } from './mechanics.js';

// Test the actual, uncorrected bullet path against moving targets. Subtracting
// target motion turns this into the same swept collision test used by bullets.
// Prediction assumes current velocity and orientation; a later turn can miss.
export function hasPredictedBulletHit(player, targets, trajectory, { maxDistance = 65 } = {}) {
  if (!player || player.crashed || !player.hasLifted || !trajectory || trajectory.life <= 0) return false;
  const aspect = (window.innerWidth || 1440) / (window.innerHeight || 900);
  const rad = player.angle * Math.PI / 180;
  return targets.some(target => {
    if (!target || target.crashed || !target.hasLifted) return false;
    const dx = target.x - trajectory.x, dy = (target.y - trajectory.y) / aspect;
    const distance = Math.hypot(dx, dy);
    if (distance < 3 || distance > maxDistance || (-Math.cos(rad)*dx + Math.sin(rad)*dy)/distance < 0.5) return false;
    const life = trajectory.life / 1000;
    // Do not predict a hit beyond either the bullet's ground impact or the
    // target reaching ground level.
    const duration = target.vy < 0 ? Math.min(life, Math.max(0, target.y / -target.vy)) : life;
    if (duration <= 0) return false;
    const fraction = duration / life;
    return bulletSegmentHitsPlane({
      start: { x: trajectory.x, y: trajectory.y },
      end: {
        x: trajectory.x + trajectory.dx * fraction - target.vx * duration,
        y: trajectory.y - trajectory.dy * fraction - target.vy * duration,
      },
    }, target);
  });
}
