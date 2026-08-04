import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomOwnerRecord, readRegionalRoomsConfig, roomOwnerKey } from './room-directory.js';

test('regional rooms remain disabled unless explicitly and completely configured', () => {
  const disabled = readRegionalRoomsConfig({});
  assert.equal(disabled.requested, false);
  assert.equal(disabled.enabled, false);

  const incomplete = readRegionalRoomsConfig({ REGIONAL_ROOMS_ENABLED: 'true', REGION_ID: 'us-east' });
  assert.equal(incomplete.requested, true);
  assert.equal(incomplete.enabled, false);
  assert.match(incomplete.configurationError, /PUBLIC_WS_URL/);
});

test('regional room configuration accepts only a public room websocket URL', () => {
  const config = readRegionalRoomsConfig({
    REGIONAL_ROOMS_ENABLED: 'true',
    REGION_ID: 'US East',
    PUBLIC_WS_URL: 'wss://realtime-us.example.com/rooms',
    REDIS_URL: 'rediss://user:secret@cache.example.com:6379',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.regionId, 'us-east');
  assert.equal(config.publicWsUrl, 'wss://realtime-us.example.com/rooms');

  const invalid = readRegionalRoomsConfig({
    REGIONAL_ROOMS_ENABLED: 'true',
    REGION_ID: 'us-east',
    PUBLIC_WS_URL: 'https://realtime-us.example.com/rooms',
    REDIS_URL: 'redis://cache.example.com:6379',
  });
  assert.equal(invalid.enabled, false);
});

test('room owner records are deterministic and namespaced', () => {
  const config = readRegionalRoomsConfig({
    REGIONAL_ROOMS_ENABLED: 'true',
    REGION_ID: 'eu',
    PUBLIC_WS_URL: 'wss://realtime-eu.example.com/rooms',
    REDIS_URL: 'redis://cache.example.com:6379',
  });
  assert.deepEqual(createRoomOwnerRecord({ code: ' qp7qqb ', config, createdAt: 42 }), {
    code: 'QP7QQB',
    regionId: 'eu',
    wsUrl: 'wss://realtime-eu.example.com/rooms',
    createdAt: 42,
  });
  assert.equal(roomOwnerKey('qp7qqb'), 'pixelplanes:room:QP7QQB');
});
