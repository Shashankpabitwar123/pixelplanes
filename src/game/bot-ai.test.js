import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_SKILL_PROFILES,
  findBotCollisionThreat,
  getBotAimPoint,
  getBotFlightTuning,
  getBotGroundThreat,
  selectBotCombatTarget,
} from './bot-ai.js';
import { createSoloGameRules, FUEL_SECONDS } from './config.js';

test('personal-game defaults are one Easy bot and 60-second fuel without changing room fuel', () => {
  const rules = createSoloGameRules();

  assert.equal(rules.botCount, 1);
  assert.equal(rules.botDifficulty, 1);
  assert.equal(rules.fuelSeconds, 60);
  assert.equal(FUEL_SECONDS, 30);
});

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

test('five bots distribute opening targets instead of all focusing the player', () => {
  const tuning = getBotFlightTuning({ botDifficulty: 3 });
  const selectedKeys = [];

  for (let botIndex = 0; botIndex < 5; botIndex += 1) {
    const bot = { x: 50, y: 50, angle: 0 };
    const candidates = [{
      key: 'player',
      type: 'player',
      state: { x: 60, y: 50, damage: 0 },
      distance: 10,
    }];
    for (let otherIndex = 0; otherIndex < 5; otherIndex += 1) {
      if (otherIndex === botIndex) continue;
      candidates.push({
        key: `bot:${otherIndex}`,
        type: 'bot',
        index: otherIndex,
        state: { x: 60, y: 50, damage: 0 },
        distance: 10,
      });
    }

    const selected = selectBotCombatTarget(
      bot,
      candidates,
      { key: null, lockedUntil: 0 },
      0,
      botIndex,
      tuning,
    );
    selectedKeys.push(selected.key);
  }

  assert.deepEqual(selectedKeys, ['bot:1', 'bot:2', 'bot:3', 'bot:4', 'player']);
});

test('a bot keeps a target lock and then retaliates against a recent attacker', () => {
  const tuning = getBotFlightTuning({ botDifficulty: 3 });
  const bot = { x: 40, y: 40, angle: 0 };
  const candidates = [
    { key: 'bot:1', type: 'bot', index: 1, state: { x: 55, y: 40 }, distance: 15 },
    { key: 'bot:2', type: 'bot', index: 2, state: { x: 58, y: 40 }, distance: 18 },
    { key: 'player', type: 'player', state: { x: 60, y: 40 }, distance: 20 },
  ];
  const targetState = {
    key: 'bot:1',
    lockedUntil: 5000,
    retaliationKey: 'bot:2',
    retaliationAt: 700,
  };

  const beforeReaction = selectBotCombatTarget(bot, candidates, targetState, 850, 0, tuning);
  const afterReaction = selectBotCombatTarget(bot, candidates, targetState, 1000, 0, tuning);

  assert.equal(beforeReaction.key, 'bot:1');
  assert.equal(beforeReaction.reason, 'locked');
  assert.equal(afterReaction.key, 'bot:2');
  assert.equal(afterReaction.reason, 'retaliation');
});
