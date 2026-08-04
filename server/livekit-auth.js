import { AccessToken, TrackSource } from 'livekit-server-sdk';

export const LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60;

function readSecureWebSocketUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'wss:') return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function readLiveKitConfig(env = process.env) {
  const url = readSecureWebSocketUrl(env.LIVEKIT_URL);
  const apiKey = String(env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function createLiveKitRoomName(roomCode) {
  return `pixelplanes-${String(roomCode || '').trim().toUpperCase()}`;
}

export function createLiveKitIdentity(roomCode, playerId) {
  return `${String(roomCode || '').trim().toUpperCase()}:${String(playerId || '').trim()}`;
}

export async function createLiveKitVoiceToken({ config, roomCode, playerId, playerName }) {
  if (!config?.url || !config.apiKey || !config.apiSecret) {
    throw new Error('LiveKit voice is not configured.');
  }

  const roomName = createLiveKitRoomName(roomCode);
  const identity = createLiveKitIdentity(roomCode, playerId);
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: String(playerName || 'Pilot').slice(0, 64),
    ttl: `${LIVEKIT_TOKEN_TTL_SECONDS}s`,
    metadata: JSON.stringify({ roomCode: String(roomCode || '').toUpperCase(), playerId: String(playerId || '') }),
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });

  return {
    url: config.url,
    token: await token.toJwt(),
    roomName,
    identity,
    expiresInSeconds: LIVEKIT_TOKEN_TTL_SECONDS,
  };
}
