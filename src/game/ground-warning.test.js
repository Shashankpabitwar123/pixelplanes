import test from 'node:test';
import assert from 'node:assert/strict';
import { groundImpactDanger, createGroundWarningTracker } from './ground-warning.js';
const dive = { x: 100, y: 25, vx: -30, vy: -25, angle: -45, hasLifted: true, crashed: false };
test('warns for an imminent fast ground impact, not distant descent or low level flight', () => {
  assert.equal(groundImpactDanger(dive), true);
  assert.equal(groundImpactDanger({ ...dive, y: 100 }), false);
  assert.equal(groundImpactDanger({ ...dive, y: 5, vy: 0 }), false);
  assert.equal(groundImpactDanger({ ...dive, vy: 5 }), false);
});
test('safe landing approach, runway, and crashed planes do not warn', () => {
  assert.equal(groundImpactDanger({ ...dive, y: 5, vx: -20, vy: -5, angle: 14 }), false);
  assert.equal(groundImpactDanger({ ...dive, hasLifted: false }), false);
  assert.equal(groundImpactDanger({ ...dive, crashed: true }), false);
});
test('recovery uses hysteresis, while pause and crash clear immediately', () => {
  const tracker = createGroundWarningTracker();
  assert.equal(tracker.update(dive, 0), true);
  assert.equal(tracker.update({ ...dive, vy: 5 }, 100), true);
  assert.equal(tracker.update({ ...dive, vy: 5 }, 499), true);
  assert.equal(tracker.update({ ...dive, vy: 5 }, 500), false);
  assert.equal(tracker.update(dive, 600), true);
  assert.equal(tracker.update(dive, 700, false), false);
  assert.equal(tracker.update(dive, 800), true);
  assert.equal(tracker.update({ ...dive, crashed: true }, 900), false);
});
test('recorded warning never overlaps and can stop immediately', async () => {
  const { createPullUpAudio } = await import('./ground-warning.js');
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  let starts = 0, stops = 0, gain;
  globalThis.window = { AudioContext: class {
    state = 'running';
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({}); }
    createGain() { gain = {}; return { gain, connect() {}, disconnect() {} }; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() { starts++; }, stop() { stops++; } }; }
  } };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  try {
    const audio = createPullUpAudio();
    audio.unlock();
    await new Promise(resolve => setImmediate(resolve));
    audio.play(0.25); audio.play(0.25);
    assert.equal(gain.value, 0.2);
    assert.equal(starts, 1);
    audio.stop(); assert.equal(stops, 1);
    audio.play(); assert.equal(starts, 2);
    audio.dispose(); assert.equal(stops, 2);
  } finally { globalThis.window = oldWindow; globalThis.fetch = oldFetch; }
});

test('fast high-altitude dives stay quiet even with short time to impact', () => {
  assert.equal(groundImpactDanger({ ...dive, y: 65, vy: -80 }), false);
  assert.equal(groundImpactDanger({ ...dive, y: 29, vy: -40 }), true);
  assert.equal(groundImpactDanger({ ...dive, y: 29, vy: -20 }), false);
});
test('recovery needs room to stop and cannot silence a last-second impact', () => {
  assert.equal(groundImpactDanger(dive, 40), false);
  assert.equal(groundImpactDanger(dive, 5), true);
  assert.equal(groundImpactDanger({ ...dive, y: 8 }, 100), true);
});
test('tracker requires sustained recovery and warns again when recovery stops', () => {
  const tracker = createGroundWarningTracker();
  assert.equal(tracker.update(dive, 0), true);
  for(let t=100;t<=700;t+=100) tracker.update({...dive, vy:-25+t/50}, t);
  assert.equal(tracker.update({...dive, vy:-9},800),false);
  assert.equal(tracker.update(dive,900),true);
});
