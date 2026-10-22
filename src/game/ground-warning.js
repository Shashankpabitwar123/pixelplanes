import { getPlanePoint, normalizeAngle, planeModel } from './mechanics.js';

export const GROUND_WARNING_MAX_CLEARANCE = 30;
export const GROUND_WARNING_TIME = 1.2;

const groundClearance = plane => Math.min(...planeModel.groundPoints.map(point => getPlanePoint(plane, point).y));

export function groundImpactDanger(plane, recoveryAcceleration = 0) {
  if (!plane || plane.crashed || !plane.hasLifted || plane.vy >= -3) return false;
  const speed = Math.hypot(plane.vx, plane.vy);
  const safeApproach = speed < 44 && Math.abs(plane.vx) < 42 && -plane.vy < 19
    && Math.abs(normalizeAngle(plane.angle - 14)) < 34;
  if (safeApproach) return false;
  const clearance = groundClearance(plane);
  const timeToImpact = clearance / -plane.vy;
  if (clearance <= 0 || clearance > GROUND_WARNING_MAX_CLEARANCE || timeToImpact > GROUND_WARNING_TIME) return false;
  // Suppress only a sustained recovery with ample room to arrest the descent.
  // Keep warning when impact is very close, even if the pilot starts pulling up.
  const stoppingDistance = recoveryAcceleration > 0 ? plane.vy ** 2 / (2 * recoveryAcceleration) : Infinity;
  return !(timeToImpact > 0.65 && stoppingDistance < clearance * 0.65);
}

export function createGroundWarningTracker() {
  let active = false, safeSince = null, previous = null, recoveringSince = null;
  return {
    update(plane, now, enabled = true) {
      if (!enabled || !plane || plane.crashed || !plane.hasLifted) {
        active = false; safeSince = null; previous = null; recoveringSince = null;
        return active;
      }
      const elapsed = previous ? (now - previous.now) / 1000 : 0;
      const acceleration = elapsed >= 0.05 && elapsed <= 0.25 ? (plane.vy - previous.vy) / elapsed : 0;
      if (acceleration > 3 && plane.vy < -3) recoveringSince ??= now;
      else recoveringSince = null;
      const recovery = recoveringSince !== null && now - recoveringSince >= 200 ? acceleration : 0;
      previous = { now, vy: plane.vy };
      if (groundImpactDanger(plane, recovery)) {
        active = true; safeSince = null;
      } else if (active) {
        safeSince ??= now;
        if (now - safeSince >= 400) active = false;
      }
      return active;
    },
  };
}

// Unlock on the existing Start/Training gesture, before any automatic warning.
export function createPullUpAudio() {
  let context, buffer, loading, source, outputGain;
  return {
    unlock() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ??= new AudioContext();
      void context.resume().catch(() => {});
      loading ??= fetch('/assets/audio/pull-up-pulsing.wav').then(r => {
        if (!r.ok) throw new Error('Warning audio unavailable');
        return r.arrayBuffer();
      }).then(data => context.decodeAudioData(data)).then(decoded => { buffer = decoded; }).catch(() => {});
    },
    play(volume = 1) {
      if (!buffer || context?.state !== 'running' || source) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain(); gain.gain.value = 0.8 * Math.max(0, Math.min(1, volume)); outputGain = gain;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source = null; gain.disconnect(); outputGain = null; };
      source.start();
    },
    stop() {
      if (source) { source.onended = null; source.stop(); source.disconnect(); source = null; outputGain?.disconnect(); outputGain = null; }
    },
    dispose() { this.stop(); void context?.close(); },
  };
}
