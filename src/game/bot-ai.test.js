import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_SKILL_PROFILES,
  findBotCollisionThreat,
  getBotAimPoint,
  getBotFlightTuning,
  getBotGroundThreat,
} from './bot-ai.js';

test('the five bot skill profiles scale combat ability in order', () => {
  assert.deepEqual(BOT_SKILL_PROFILES.map((profile) => profile.label), [
    'Easy',
    'Casual',
    'Standard',
    'Hard',
    'Ace',
  ]);

  const tunings = BOT_SKILL_PROFILES.map((_, index) => getBotFlightTuning({ botDifficulty: index + 1 }));
  for (let index = 1; index < tunings.length; index += 1) {
    assert.ok(tunings[index].wakeDistance > tunings[index - 1].wakeDistance);
    assert.ok(tunings[index].decisionIntervalMs < tunings[index - 1].decisionIntervalMs);
    assert.ok(tunings[index].bulletCooldownMs < tunings[index - 1].bulletCooldownMs);
    assert.ok(tunings[index].aimWobbleDegrees < tunings[index - 1].aimWobbleDegrees);
    assert.ok(tunings[index].evasionStrength > tunings[index - 1].evasionStrength);
    assert.ok(tunings[index].maxSpeed > tunings[index - 1].maxSpeed);
  }
});

test('nearby parallel and separating planes do not create an avoidance bubble', () => {
  const tuning = getBotFlightTuning({ botDifficulty: 3 });
  const bot = { x: 20, y: 30, vx: 10, vy: 0 };
  const parallel = [{ state: { x: 23, y: 31, vx: 10, vy: 0 } }];
  const separating = [{ state: { x: 25, y: 30, vx: 16, vy: 0 } }];

  assert.equal(findBotCollisionThreat(bot, parallel, tuning), null);
  assert.equal(findBotCollisionThreat(bot, separating, tuning), null);
});

test('a genuine near-future collision course creates a short avoidance response', () => {
  const tuning = getBotFlightTuning({ botDifficulty: 3 });
  const bot = { x: 20, y: 30, vx: 10, vy: 0 };
  const headOn = [{ type: 'bot', index: 1, state: { x: 30, y: 30, vx: -10, vy: 0 } }];
  const threat = findBotCollisionThreat(bot, headOn, tuning);

  assert.ok(threat);
  assert.ok(threat.timeToClosest > 0);
  assert.ok(threat.predictedClearance < tuning.collisionClearance);
});

test('low level flight is allowed but a descending impact path triggers recovery', () => {
  const tuning = getBotFlightTuning({ botDifficulty: 3 });
  const lowAndLevel = { airborne: true, hasLifted: true, vx: 18, vy: 0, angle: 0 };
  const descending = { airborne: true, hasLifted: true, vx: 18, vy: -12, angle: -18 };

  assert.equal(getBotGroundThreat(lowAndLevel, 3, tuning), null);
  assert.ok(getBotGroundThreat(descending, 6, tuning));
});

test('Ace aim has substantially less intentional wobble than Easy aim', () => {
  const bot = { x: 10, y: 40 };
  const target = { x: 90, y: 40, vx: 0, vy: 0 };
  const easyAim = getBotAimPoint(bot, target, 80, 500, 0, getBotFlightTuning({ botDifficulty: 1 }));
  const aceAim = getBotAimPoint(bot, target, 80, 500, 0, getBotFlightTuning({ botDifficulty: 5 }));
  const expectedY = target.y + 1.1;

  assert.ok(Math.abs(easyAim.y - expectedY) > Math.abs(aceAim.y - expectedY) * 8);
});
