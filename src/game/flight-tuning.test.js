import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlayerFlightTuning } from './flight-tuning.js';
import { ACTIVE_GAMEPLAY_PACING, createSoloGameRules } from './config.js';
import { applyFlightForces, AIRBORNE_THRUST_SCALE } from './flight.js';

test('70 defaults and room fallback preserve the original flight profile exactly', () => {
  const rules = createSoloGameRules();
  assert.equal(rules.flightPace, 70);
  assert.equal(rules.turnPace, 70);
  assert.deepEqual(getPlayerFlightTuning(rules), ACTIVE_GAMEPLAY_PACING.player);
  assert.deepEqual(getPlayerFlightTuning(null), ACTIVE_GAMEPLAY_PACING.player);
});
test('speed and turn boosts work independently and remain bounded', () => {
  const base = getPlayerFlightTuning();
  const speed = getPlayerFlightTuning({ flightPace: 100 });
  const turn = getPlayerFlightTuning({ turnPace: 100 });
  assert.equal(speed.turnBaseRate, base.turnBaseRate);
  assert.equal(turn.flightThrust, base.flightThrust);
  assert.equal(turn.turnBaseRate, base.turnBaseRate * 1.3);
  assert.ok(speed.flightThrust > base.flightThrust);
  assert.deepEqual(getPlayerFlightTuning({flightPace: 1000}), speed);
  const cruise = tuning => {
    const plane = {vx:-30, vy:0, angle:0, thrust:1};
    for(let i=0;i<3600;i++) applyFlightForces(plane,1/120,{thrust:tuning.flightThrust*AIRBORNE_THRUST_SCALE,cruiseSpeed:tuning.maxLevelSpeed});
    return Math.hypot(plane.vx,plane.vy);
  };
  assert.ok(cruise(speed) > cruise(base) * 1.3);
  assert.ok(cruise(speed) < cruise(base) * 1.6);
});
test('bot airborne physics use the fixed base profile', () => {
  const source = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  const botPhysics = source.slice(source.indexOf('if (next.airborne) {', source.indexOf('function BotPlane')));
  assert.match(botPhysics, /const tuning = ACTIVE_GAMEPLAY_PACING.player;/);
  assert.doesNotMatch(botPhysics, /getPlayerFlightTuning\(gameplayRulesRef.current\)/);
});
