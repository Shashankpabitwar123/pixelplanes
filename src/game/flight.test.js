import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRBORNE_THRUST_SCALE, applyFlightForces, flightTurnAuthority, interpolateFlightState } from './flight.js';
import { ACTIVE_GAMEPLAY_PACING } from './config.js';
import { createInitialPlaneState, getPlanePoint } from './mechanics.js';
import { simulateRoomPlane } from './room-simulation.js';
const state = (overrides = {}) => ({ ...createInitialPlaneState(350, 60), y: 150, angle: 0, airborne: true, hasLifted: true, ...overrides });
function fly(p, seconds, dt = 1 / 120, options) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    applyFlightForces(p, dt, options); p.x += p.vx * dt; p.y += p.vy * dt;
  }
  return p;
}
test('gravity at rest does not change with throttle', () => {
  const off = state(), on = state({ thrust: 1 });
  applyFlightForces(off, 1 / 120); applyFlightForces(on, 1 / 120);
  assert.equal(off.vy, on.vy);
});
test('engine-off cruise glides and gradually loses energy', () => {
  const p = fly(state({ vx: -30 }), 3);
  assert.ok(p.x < 300 && p.y < 150 && p.y > 135);
  assert.ok(Math.hypot(p.vx, p.vy) < 30);
});
test('crossing former dive and climb thresholds never cuts speed abruptly', () => {
  for (const sign of [-1, 1]) {
    const results = [8.6, 8.7].map(a => {
      const rad = sign * a * Math.PI / 180;
      const p = state({ angle: sign * a, vx: -44 * Math.cos(rad), vy: 44 * Math.sin(rad), thrust: 1 });
      applyFlightForces(p, 1 / 120); return Math.hypot(p.vx, p.vy);
    });
    assert.ok(Math.abs(results[0] - results[1]) < 0.01);
    assert.ok(results.every(v => v > 43));
  }
});
test('diving gains speed and pulling up redirects momentum', () => {
  const p = state({ angle: -35, vx: -20 * Math.cos(Math.PI / 180 * 35), vy: -20 * Math.sin(Math.PI / 180 * 35) });
  fly(p, 1); assert.ok(Math.hypot(p.vx, p.vy) > 20);
  const before = p.vy; p.angle = 10; p.thrust = 1;
  fly(p, 1); assert.ok(p.vy > before);
});
test('low-speed steering weakens and air brake cannot hover', () => {
  assert.ok(flightTurnAuthority(0) < flightTurnAuthority(30) / 4);
  const p = fly(state(), 4, 1 / 120, { brake: true });
  assert.ok(p.vy < -15 && p.y < 110);
});
test('force integration remains close at 60 and 120 Hz', () => {
  const a = fly(state({vx:-30, thrust:1, angle:14}), 4, 1/60);
  const b = fly(state({vx:-30, thrust:1, angle:14}), 4, 1/120);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y) < 0.5);
});
test('collision nose rotates upward with the visible nose', () => {
  assert.ok(getPlanePoint(state({ angle:90 }), {x:0.02,y:0.53}).y > 150);
});
test('render interpolation takes shortest angle path and never smooths crashes', () => {
  const a = state({angle:179}), b = state({x:352,angle:-179});
  const mid = interpolateFlightState(a,b,0.5);
  assert.equal(mid.x,351); assert.equal(mid.angle,180);
  b.crashed=true; assert.equal(interpolateFlightState(a,b,0.5),b);
});
test('normal held-power runway takeoff remains possible', () => {
  let p = createInitialPlaneState(350,60);
  for(let i=0;i<960;i++) p = simulateRoomPlane(p,{power:true},1/120,i*1000/120).state;
  assert.ok(!p.crashed && p.hasLifted && p.y > 20);
});

// These reproduce the reported loss of climb and sluggish cruise.
test('full power sustains moderate, steep and vertical climbs at both pace limits', () => {
  for (const pace of [0.7, 1]) for (const angle of [30, 60, 90]) {
    const p = fly(state({ vx: -20, angle, thrust: 1 }), 8, 1 / 120, {
      thrust: ACTIVE_GAMEPLAY_PACING.player.flightThrust * Math.pow(pace, 0.86) * AIRBORNE_THRUST_SCALE,
      cruiseSpeed: ACTIVE_GAMEPLAY_PACING.player.maxLevelSpeed * pace,
    });
    assert.ok(p.vy > 8 && p.y > 180, `climb failed at angle ${angle}, pace ${pace}`);
  }
});
test('default full-throttle cruise reaches a brisk continuous equilibrium', () => {
  const p = fly(state({ vx: -20, thrust: 1 }), 10);
  const speed = Math.hypot(p.vx, p.vy);
  assert.ok(speed > 45 && speed < 52, `unexpected cruise speed ${speed}`);
});
test('vertical full throttle recovers from a descent', () => {
  const p = fly(state({ vy: -12, angle: 90, thrust: 1 }), 4);
  assert.ok(p.vy > 20 && p.y > 150);
});
