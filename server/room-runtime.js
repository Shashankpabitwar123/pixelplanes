import crypto from 'node:crypto';
import {
  ROOM_RESPAWN_DELAY_MS,
  ROOM_TICK_SECONDS,
  ROOM_WEAPON_RULES,
  advanceRoomProjectile,
  createRoomBulletProjectile,
  createRoomInput,
  createRoomPlayerState,
  createRoomRocketProjectile,
  projectileHitsPlayer,
  simulateRoomPlane,
} from '../src/game/room-simulation.js';
import { planesCollide } from '../src/game/mechanics.js';

export const ROOM_SERVER_TICK_MS = 1000 / 60;
export const ROOM_SERVER_SNAPSHOT_MS = 50;

function finiteInteger(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function createRuntimePlayer({ id, spawnX, resumeToken }) {
  return {
    id,
    spawnX,
    resumeToken,
    state: createRoomPlayerState(spawnX),
    input: createRoomInput(),
    lastInputSeq: 0,
    lastRocketPress: 0,
    weapons: {
      ammo: ROOM_WEAPON_RULES.maxBullets,
      rockets: ROOM_WEAPON_RULES.maxRockets,
      bulletLastFiredAt: 0,
      rocketLastFiredAt: 0,
      reloadAt: 0,
    },
    connected: true,
    disconnectedAt: 0,
  };
}

export function acceptRoomInput(player, payload = {}) {
  const seq = finiteInteger(payload.seq, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!seq || seq <= player.lastInputSeq) return false;
  const requestedInput = payload.input && typeof payload.input === 'object' ? payload.input : {};
  // A rocket press is a monotonic event number. One accepted input can launch
  // at most one rocket; accepting the full number prevents a delayed packet
  // from being replayed as several launches on later movement updates.
  const rocketPress = finiteInteger(requestedInput.rocketPress, player.input.rocketPress, 0, Number.MAX_SAFE_INTEGER);
  player.input = createRoomInput({ ...requestedInput, rocketPress });
  player.lastInputSeq = seq;
  return true;
}

function forceCrash(player, now, impact = 1.2) {
  if (player.state.crashed) return false;
  player.state = {
    ...player.state,
    crashed: true,
    crashTime: now,
    crashImpact: Math.max(0.75, Math.min(1.8, impact)),
    damage: Math.max(2, player.state.damage ?? 0),
    thrust: 0,
    throttle: 0,
    turnRate: 0,
    vx: 0,
    vy: 0,
  };
  player.input = createRoomInput();
  return true;
}

function resetRuntimePlayer(player) {
  player.state = createRoomPlayerState(player.spawnX);
  player.input = createRoomInput();
  player.lastRocketPress = 0;
  player.weapons = {
    ammo: ROOM_WEAPON_RULES.maxBullets,
    rockets: ROOM_WEAPON_RULES.maxRockets,
    bulletLastFiredAt: 0,
    rocketLastFiredAt: 0,
    reloadAt: 0,
  };
}

function refreshAmmo(player, now) {
  if (player.weapons.reloadAt && now >= player.weapons.reloadAt) {
    player.weapons.ammo = ROOM_WEAPON_RULES.maxBullets;
    player.weapons.reloadAt = 0;
  }
}

function tryFireWeapons(room, player, now, events) {
  if (player.state.crashed) return;
  const weapons = player.weapons;
  refreshAmmo(player, now);

  if (
    player.input.fire &&
    weapons.ammo > 0 &&
    now - weapons.bulletLastFiredAt >= ROOM_WEAPON_RULES.bulletCooldownMs
  ) {
    weapons.bulletLastFiredAt = now;
    weapons.ammo -= 1;
    if (!weapons.reloadAt) weapons.reloadAt = now + ROOM_WEAPON_RULES.bulletReloadMs;
    const projectile = createRoomBulletProjectile(player.id, player.state, now, crypto.randomUUID());
    room.projectiles.set(projectile.id, projectile);
    events.push({ type: 'projectile_spawned', playerId: player.id, projectile });
  }

  if (player.input.rocketPress > player.lastRocketPress) {
    player.lastRocketPress = player.input.rocketPress;
    if (
      weapons.rockets > 0 &&
      now - weapons.rocketLastFiredAt >= ROOM_WEAPON_RULES.rocketCooldownMs
    ) {
      const mountPoint = weapons.rockets === ROOM_WEAPON_RULES.maxRockets
        ? { x: 0.34, y: 0.8 }
        : { x: 0.52, y: 0.73 };
      weapons.rocketLastFiredAt = now;
      weapons.rockets -= 1;
      const projectile = createRoomRocketProjectile(player.id, player.state, now, crypto.randomUUID(), mountPoint);
      room.projectiles.set(projectile.id, projectile);
      events.push({ type: 'projectile_spawned', playerId: player.id, projectile });
    }
  }
}

function applyProjectileHit(room, projectile, target, now, events) {
  const attacker = room.players.get(projectile.ownerId);
  if (!attacker || target.id === attacker.id || target.state.crashed) return false;
  const weapon = projectile.weapon;
  const killed = weapon === 'rocket' || (target.state.damage ?? 0) >= 1;
  if (killed) {
    forceCrash(target, now, weapon === 'rocket' ? 1.72 : 1.18);
    attacker.kills = Math.max(0, (Number(attacker.kills) || 0) + 1);
  } else {
    target.state = { ...target.state, damage: 1 };
  }
  events.push({
    type: 'player_hit',
    targetId: target.id,
    attackerId: attacker.id,
    projectileId: projectile.id,
    weapon,
    damage: target.state.damage,
    killed,
  });
  return true;
}

function stepProjectiles(room, now, events) {
  const targets = Array.from(room.players.values())
    .filter((player) => player.connected && !player.state.crashed)
    .map((player) => ({ id: player.id, state: player.state }));

  for (const [projectileId, projectile] of room.projectiles.entries()) {
    const rocketTargets = targets.filter((target) => target.id !== projectile.ownerId);
    const { projectile: nextProjectile, segment } = advanceRoomProjectile(projectile, now, rocketTargets);
    if (!nextProjectile) {
      room.projectiles.delete(projectileId);
      continue;
    }
    const target = targets.find((candidate) =>
      candidate.id !== nextProjectile.ownerId && projectileHitsPlayer(segment, nextProjectile, candidate.state),
    );
    if (target) {
      const runtimeTarget = room.players.get(target.id);
      if (runtimeTarget) applyProjectileHit(room, nextProjectile, runtimeTarget, now, events);
      room.projectiles.delete(projectileId);
      continue;
    }
    room.projectiles.set(projectileId, nextProjectile);
  }
}

function stepPlayerCollisions(room, now, events) {
  const players = Array.from(room.players.values()).filter((player) => player.connected && !player.state.crashed);
  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      const playerA = players[first];
      const playerB = players[second];
      if (!planesCollide(playerA.state, playerB.state)) continue;
      const impact = Math.max(1.1, Math.hypot(playerA.state.vx - playerB.state.vx, playerA.state.vy - playerB.state.vy) / 28);
      const crashedA = forceCrash(playerA, now, impact);
      const crashedB = forceCrash(playerB, now, impact);
      if (crashedA) events.push({ type: 'player_crashed', playerId: playerA.id, selfCrash: false, cause: 'collision' });
      if (crashedB) events.push({ type: 'player_crashed', playerId: playerB.id, selfCrash: false, cause: 'collision' });
    }
  }
}

export function stepAuthoritativeRoom(room, now = Date.now()) {
  if (!room.started) return [];
  const events = [];
  for (const player of room.players.values()) {
    if (!player.connected) continue;
    if (player.state.crashed) {
      if (now - player.state.crashTime >= ROOM_RESPAWN_DELAY_MS) {
        resetRuntimePlayer(player);
        events.push({ type: 'player_respawned', playerId: player.id });
      }
      continue;
    }
    const result = simulateRoomPlane(player.state, player.input, ROOM_TICK_SECONDS, now);
    player.state = result.state;
    for (const event of result.events) {
      if (event.type === 'crashed') {
        events.push({ type: 'player_crashed', playerId: player.id, selfCrash: true, cause: event.cause });
      }
      if (event.type === 'fuel_refilled') events.push({ ...event, playerId: player.id });
    }
    tryFireWeapons(room, player, now, events);
  }
  stepPlayerCollisions(room, now, events);
  stepProjectiles(room, now, events);
  return events;
}

export function resetAuthoritativeRoom(room) {
  room.projectiles.clear();
  for (const player of room.players.values()) {
    resetRuntimePlayer(player);
  }
}

function serializeState(state) {
  return {
    x: state.x,
    y: state.y,
    vx: state.vx,
    vy: state.vy,
    angle: state.angle,
    turnRate: state.turnRate,
    thrust: state.thrust,
    throttle: state.throttle,
    airborne: Boolean(state.airborne),
    hasLifted: Boolean(state.hasLifted),
    crashed: Boolean(state.crashed),
    crashTime: state.crashTime,
    crashImpact: state.crashImpact,
    damage: state.damage,
    fuel: state.fuel,
    searchLightOn: Boolean(state.searchLightOn),
  };
}

export function createRoomSnapshot(room, localPlayerId, serverNow = Date.now()) {
  const localPlayer = room.players.get(localPlayerId);
  if (!localPlayer) return null;
  return {
    type: 'room_snapshot',
    serverNow,
    inputSeq: localPlayer.lastInputSeq,
    local: {
      state: serializeState(localPlayer.state),
      input: {
        rocketPress: localPlayer.lastRocketPress,
      },
      weapons: {
        ammo: localPlayer.weapons.ammo,
        rockets: localPlayer.weapons.rockets,
        reloading: Boolean(localPlayer.weapons.reloadAt),
      },
    },
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      state: serializeState(player.state),
      connected: player.connected,
    })),
    projectiles: Array.from(room.projectiles.values()).map((projectile) => ({ ...projectile })),
  };
}
