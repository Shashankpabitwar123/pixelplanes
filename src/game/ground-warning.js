import { getPlanePoint, normalizeAngle, planeModel } from './mechanics.js';

export function groundImpactDanger(plane) {
  if (!plane || plane.crashed || !plane.hasLifted || plane.vy >= -3) return false;
  const speed = Math.hypot(plane.vx, plane.vy);
  const safeApproach = speed < 44 && Math.abs(plane.vx) < 42 && -plane.vy < 19
    && Math.abs(normalizeAngle(plane.angle - 14)) < 34;
  if (safeApproach) return false;
  const clearance = Math.min(...planeModel.groundPoints.map(point => getPlanePoint(plane, point).y));
  return clearance > 0 && clearance / -plane.vy <= 1.5;
}

export function createGroundWarningTracker() {
  let active = false, safeSince = null;
  return {
    update(plane, now, enabled = true) {
      if (!enabled || !plane || plane.crashed || !plane.hasLifted) {
        active = false; safeSince = null;
      } else if (groundImpactDanger(plane)) {
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
    play() {
      if (!buffer || context?.state !== 'running' || source) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain(); gain.gain.value = 0.8; outputGain = gain;
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
