import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVEKIT_TOKEN_TTL_SECONDS,
  createLiveKitIdentity,
  createLiveKitRoomName,
  createLiveKitVoiceToken,
  readLiveKitConfig,
} from './livekit-auth.js';

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

test('LiveKit config only accepts complete secure server configuration', () => {
  assert.equal(readLiveKitConfig({ LIVEKIT_URL: 'https://voice.example.com', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret' }), null);
  assert.equal(readLiveKitConfig({ LIVEKIT_URL: 'wss://voice.example.com', LIVEKIT_API_KEY: 'key' }), null);
  assert.deepEqual(readLiveKitConfig({
    LIVEKIT_URL: 'wss://voice.example.com/',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
  }), {
    url: 'wss://voice.example.com',
    apiKey: 'key',
    apiSecret: 'secret',
  });
});

test('LiveKit room tokens are scoped to one room and one participant', async () => {
  const issued = await createLiveKitVoiceToken({
    config: { url: 'wss://voice.example.com', apiKey: 'api-key', apiSecret: 'api-secret' },
    roomCode: 'qp7qqb',
    playerId: 'pilot-123',
    playerName: 'Test Pilot',
  });
  const payload = decodePayload(issued.token);

  assert.equal(issued.roomName, createLiveKitRoomName('QP7QQB'));
  assert.equal(issued.identity, createLiveKitIdentity('QP7QQB', 'pilot-123'));
  assert.equal(payload.sub, 'QP7QQB:pilot-123');
  assert.equal(payload.name, 'Test Pilot');
  assert.deepEqual(payload.video, {
    roomJoin: true,
    room: 'pixelplanes-QP7QQB',
    canPublish: true,
    canPublishSources: ['microphone'],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  assert.ok(payload.exp - payload.nbf <= LIVEKIT_TOKEN_TTL_SECONDS + 1);
});
