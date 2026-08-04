import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROOM_SERVER_TICK_MS,
  acceptRoomInput,
  createRuntimePlayer,
  stepAuthoritativeRoom,
} from './room-runtime.js';
import { FUEL_SECONDS, MAX_BULLETS, MAX_ROCKETS } from '../src/game/config.js';
import { ROOM_RESPAWN_DELAY_MS } from '../src/game/room-simulation.js';

function createTestRoom(players = []) {
  return {
    started: true,
    players: new Map(players.map((player) => [player.id, player])),
    projectiles: new Map(),
  };
}

test('room input accepts only newer input sequences and never accepts a client position', () => {
  const player = createRuntimePlayer({ id: 'pilot-a', spawnX: 350, resumeToken: 'resume-a' });
  const startingX = player.state.x;

  assert.equal(acceptRoomInput(player, {
    seq: 1,
    input: { power: true, x: 1, y: 399, fuel: 999 },
  }), true);
  assert.equal(player.state.x, startingX);
  assert.equal(player.input.power, true);
  assert.equal(acceptRoomInput(player, { seq: 1, input: { power: false } }), false);
  assert.equal(player.input.power, true);
});

test('authoritative simulation consumes fuel from held thrust', () => {
  const player = createRuntimePlayer({ id: 'pilot-a', spawnX: 350, resumeToken: 'resume-a' });
  const room = createTestRoom([player]);
  acceptRoomInput(player, { seq: 1, input: { power: true } });
  const startAt = 1_000_000;
  for (let tick = 0; tick < 120; tick += 1) {
    stepAuthoritativeRoom(room, startAt + tick * ROOM_SERVER_TICK_MS);
  }

  assert.ok(player.state.fuel < FUEL_SECONDS);
  assert.ok(Math.abs(player.state.vx) > 0);
});

test('server owns burst ammo, reload, and rocket inventory', () => {
  const player = createRuntimePlayer({ id: 'pilot-a', spawnX: 350, resumeToken: 'resume-a' });
  const room = createTestRoom([player]);
  const startAt = 2_000_000;
  acceptRoomInput(player, { seq: 1, input: { fire: true, rocketPress: 1 } });

  for (let shot = 0; shot < MAX_BULLETS; shot += 1) {
    stepAuthoritativeRoom(room, startAt + shot * 60);
  }

  assert.equal(player.weapons.ammo, 0);
  assert.equal(player.weapons.rockets, MAX_ROCKETS - 1);
  assert.ok(player.weapons.reloadAt > startAt);
  assert.equal(room.projectiles.size, MAX_BULLETS + 1);
});

test('a delayed rocket event cannot replay as extra launches', () => {
  const player = createRuntimePlayer({ id: 'pilot-a', spawnX: 350, resumeToken: 'resume-a' });
  const room = createTestRoom([player]);
  const startAt = 2_500_000;
  acceptRoomInput(player, { seq: 1, input: { rocketPress: 8 } });
  stepAuthoritativeRoom(room, startAt);
  assert.equal(player.weapons.rockets, MAX_ROCKETS - 1);

  acceptRoomInput(player, { seq: 2, input: { power: true, rocketPress: 8 } });
  stepAuthoritativeRoom(room, startAt + 1000);
  assert.equal(player.weapons.rockets, MAX_ROCKETS - 1);
});

test('server crashes overlapping planes and respawns them on its own clock', () => {
  const first = createRuntimePlayer({ id: 'pilot-a', spawnX: 350, resumeToken: 'resume-a' });
  const second = createRuntimePlayer({ id: 'pilot-b', spawnX: 390, resumeToken: 'resume-b' });
  second.state = { ...second.state, x: first.state.x };
  const room = createTestRoom([first, second]);
  const crashedAt = 3_000_000;
  const collisionEvents = stepAuthoritativeRoom(room, crashedAt);

  assert.equal(first.state.crashed, true);
  assert.equal(second.state.crashed, true);
  assert.equal(collisionEvents.filter((event) => event.type === 'player_crashed').length, 2);

  stepAuthoritativeRoom(room, crashedAt + ROOM_RESPAWN_DELAY_MS + 1);
  assert.equal(first.state.crashed, false);
  assert.equal(second.state.crashed, false);
  assert.equal(first.weapons.ammo, MAX_BULLETS);
  assert.equal(second.weapons.rockets, MAX_ROCKETS);
});
