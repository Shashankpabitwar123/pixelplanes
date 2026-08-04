import { createClient } from 'redis';

const DIRECTORY_PREFIX = 'pixelplanes:room:';
const DIRECTORY_TTL_SECONDS = 6 * 60 * 60;

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeRegionId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function normalizePublicWsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return '';
    if (url.username || url.password) return '';
    url.pathname = url.pathname.replace(/\/$/, '') || '/rooms';
    if (!url.pathname.endsWith('/rooms')) return '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function readRegionalRoomsConfig(env = process.env) {
  const requested = enabled(env.REGIONAL_ROOMS_ENABLED);
  const regionId = normalizeRegionId(env.REGION_ID);
  const publicWsUrl = normalizePublicWsUrl(env.PUBLIC_WS_URL);
  const redisUrl = String(env.REDIS_URL || '').trim();
  const configured = Boolean(regionId && publicWsUrl && redisUrl);

  return {
    requested,
    enabled: requested && configured,
    regionId,
    publicWsUrl,
    redisUrl,
    configurationError: requested && !configured
      ? 'REGIONAL_ROOMS_ENABLED requires REGION_ID, PUBLIC_WS_URL, and REDIS_URL.'
      : '',
  };
}

export function createRoomOwnerRecord({ code, config, createdAt = Date.now() }) {
  return {
    code: String(code || '').trim().toUpperCase(),
    regionId: config.regionId,
    wsUrl: config.publicWsUrl,
    createdAt: Number(createdAt) || Date.now(),
  };
}

export function roomOwnerKey(code) {
  return `${DIRECTORY_PREFIX}${String(code || '').trim().toUpperCase()}`;
}

function parseOwnerRecord(value) {
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    if (!record?.code || !record?.regionId || !normalizePublicWsUrl(record.wsUrl)) return null;
    return {
      code: String(record.code).toUpperCase(),
      regionId: normalizeRegionId(record.regionId),
      wsUrl: normalizePublicWsUrl(record.wsUrl),
      createdAt: Number(record.createdAt) || 0,
    };
  } catch {
    return null;
  }
}

export class RoomDirectory {
  constructor(config, { clientFactory = createClient, logger = console } = {}) {
    this.config = config;
    this.clientFactory = clientFactory;
    this.logger = logger;
    this.client = null;
    this.ready = false;
    this.connecting = null;
  }

  get required() {
    return this.config.requested;
  }

  get active() {
    return this.config.enabled && this.ready;
  }

  async connect() {
    if (!this.config.enabled || this.ready) return this.ready;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const client = this.clientFactory({ url: this.config.redisUrl });
      client.on?.('error', (error) => {
        this.ready = false;
        this.logger.warn?.('[directory] Redis connection error:', error.message);
      });
      try {
        await client.connect();
        this.client = client;
        this.ready = true;
      } catch (error) {
        this.ready = false;
        this.client = null;
        this.logger.warn?.('[directory] Redis unavailable:', error.message);
        try {
          await client.disconnect?.();
        } catch {
          // The connection never completed or is already closed.
        }
      } finally {
        this.connecting = null;
      }
      return this.ready;
    })();
    return this.connecting;
  }

  async claim(code, owner) {
    if (!this.active) return false;
    const result = await this.client.set(
      roomOwnerKey(code),
      JSON.stringify(owner),
      { NX: true, EX: DIRECTORY_TTL_SECONDS },
    );
    return result === 'OK';
  }

  async find(code) {
    if (!this.active) return null;
    return parseOwnerRecord(await this.client.get(roomOwnerKey(code)));
  }

  async refresh(code, owner) {
    if (!this.active) return false;
    const key = roomOwnerKey(code);
    const existing = parseOwnerRecord(await this.client.get(key));
    if (!existing || existing.regionId !== owner.regionId || existing.wsUrl !== owner.wsUrl) return false;
    await this.client.expire(key, DIRECTORY_TTL_SECONDS);
    return true;
  }

  async remove(code, owner) {
    if (!this.active) return false;
    const key = roomOwnerKey(code);
    const existing = parseOwnerRecord(await this.client.get(key));
    if (!existing || existing.regionId !== owner.regionId || existing.wsUrl !== owner.wsUrl) return false;
    await this.client.del(key);
    return true;
  }

  async close() {
    this.ready = false;
    if (this.client?.isOpen) await this.client.quit();
  }
}
