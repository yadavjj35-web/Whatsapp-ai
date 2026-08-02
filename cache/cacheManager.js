// path: cache/cacheManager.js
/**
 * cache/cacheManager.js
 *
 * Redis-backed cache with in-memory LRU fallback.
 *
 * Exports:
 *  - get(key)
 *  - set(key, value, ttlMs)
 *  - del(key)
 *  - clear()
 *
 * Behavior:
 *  - If Redis is available (redisClient.getRedis()), operations use Redis.
 *  - If Redis is unavailable or an operation fails, falls back to in-memory cache.
 *  - In-memory cache is a simple LRU using Map (size-limited).
 */

import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';

const FALLBACK_MAX_ENTRIES = Number(process.env.CACHE_FALLBACK_MAX_ENTRIES || 5000);
const FALLBACK_TTL_MS = Number(process.env.CACHE_FALLBACK_TTL_MS || 1000 * 60 * 60);

class LRUCache {
  constructor(maxEntries = FALLBACK_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.map = new Map(); // key => { value, expiresAt }
  }

  _ensureLimit() {
    while (this.map.size > this.maxEntries) {
      // evict oldest (first key)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // refresh LRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = FALLBACK_TTL_MS) {
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt });
    this._ensureLimit();
    return true;
  }

  del(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

const fallback = new LRUCache(FALLBACK_MAX_ENTRIES);

/**
 * Try to use Redis if available; fall back to local LRU on failure.
 */
export async function get(key) {
  try {
    const redis = redisClient.getRedis();
    if (redis) {
      const raw = await redis.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return raw;
      }
    }
  } catch (err) {
    logger.warn('cache/get using fallback due to Redis error', { error: err.message });
  }
  return fallback.get(key);
}

export async function set(key, value, ttlMs = FALLBACK_TTL_MS) {
  try {
    const redis = redisClient.getRedis();
    if (redis) {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlMs && ttlMs > 0) {
        await redis.set(key, str, 'PX', Number(ttlMs));
      } else {
        await redis.set(key, str);
      }
      return true;
    }
  } catch (err) {
    logger.warn('cache/set using fallback due to Redis error', { error: err.message });
  }
  return fallback.set(key, value, ttlMs);
}

export async function del(key) {
  try {
    const redis = redisClient.getRedis();
    if (redis) {
      await redis.del(key);
      return true;
    }
  } catch (err) {
    logger.warn('cache/del using fallback due to Redis error', { error: err.message });
  }
  return fallback.del(key);
}

export function clear() {
  try {
    const redis = redisClient.getRedis();
    if (redis) {
      // best-effort: avoid clearing entire redis in multi-tenant environment
      // so do nothing for redis mode
    }
  } catch (err) {
    // fallback clear
    fallback.clear();
  }
  return true;
}

export default { get, set, del, clear };
