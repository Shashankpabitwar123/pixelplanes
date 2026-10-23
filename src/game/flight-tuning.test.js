import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlayerFlightTuning, BOT_FLIGHT_TUNING } from './flight-tuning.js';
import { ACTIVE_GAMEPLAY_PACING, createSoloGameRules } from './config.js';
import { applyFlightForces, AIRBORNE_THRUST_SCALE } from './flight.js';

test('new solo defaults apply while room fallback preserves the original profile', () => {
  const rules = createSoloGameRules();
  assert.equal(rules.flightPace, 60);
  assert.equal(rules.turnPace, 100);
  assert.deepEqual(getPlayerFlightTuning(rules), getPlayerFlightTuning({flightPace:60,turnPace:100}));
  assert.ok(getPlayerFlightTuning(rules).maxLevelSpeed < ACTIVE_GAMEPLAY_PACING.player.maxLevelSpeed);
  assert.equal(getPlayerFlightTuning(rules).turnBaseRate, ACTIVE_GAMEPLAY_PACING.player.turnBaseRate * 1.3);
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
test('bot airborne physics use the fixed 40 profile', () => {
  const source = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  const botPhysics = source.slice(source.indexOf('if (next.airborne) {', source.indexOf('function BotPlane')));
  assert.match(botPhysics, /const tuning = BOT_FLIGHT_TUNING;/);
  assert.doesNotMatch(botPhysics, /getPlayerFlightTuning\(gameplayRulesRef.current\)/);
});

test('bots fly slower at full power and retain enough thrust to climb', () => {
  const cruise = tuning => {
    const plane = {vx:-30, vy:0, angle:0, thrust:1};
    for (let i=0; i<3600; i++) applyFlightForces(plane,1/120,{thrust:tuning.flightThrust*AIRBORNE_THRUST_SCALE,cruiseSpeed:tuning.maxLevelSpeed});
    return Math.hypot(plane.vx,plane.vy);
  };
  assert.deepEqual(BOT_FLIGHT_TUNING,getPlayerFlightTuning({flightPace:40}));
  assert.ok(cruise(BOT_FLIGHT_TUNING) < cruise(getPlayerFlightTuning()) * .95);
  const climbing = {vx:0,vy:0,angle:90,thrust:1};
  for(let i=0;i<600;i++) applyFlightForces(climbing,1/120,{thrust:BOT_FLIGHT_TUNING.flightThrust*AIRBORNE_THRUST_SCALE,cruiseSpeed:BOT_FLIGHT_TUNING.maxLevelSpeed});
  assert.ok(climbing.vy > 0);
});
