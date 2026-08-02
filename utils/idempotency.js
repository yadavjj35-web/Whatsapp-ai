// path: utils/idempotency.js
/**
 * Idempotency utilities using Redis (ioredis)
 *
 * Exports:
 *  - tryReserveKey(key, ttlMs) => { reserved: true, value } or { reserved: false, existingValue }
 *  - setProcessed(key, result, ttlMs) => store processed result (JSON)
 *  - getProcessed(key) => processed result or null
 *  - releaseKey(key) => delete reservation
 *
 * Usage pattern for idempotent handlers:
 *  const { reserved } = await tryReserveKey(key, 5*60*1000);
 *  if (!reserved) {
 *    // get processed result if available
 *    const prev = await getProcessedResult(key)
 *    return prev || 409
 *  }
 *  // process and then setProcessed(key, result)
 *
 * Implementation details:
 *  - Reservation key: `idem:lock:{key}`
 *  - Processed result key: `idem:res:{key}`
 *  - Reservation uses SET NX PX to atomically acquire lock
 */

import crypto from 'crypto';
import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';
import { canonicalize } from '../queue/queueUtils.js';

const LOCK_PREFIX = process.env.IDEMPOTENCY_LOCK_PREFIX || 'idem:lock:';
const RES_PREFIX = process.env.IDEMPOTENCY_RESULT_PREFIX || 'idem:res:';

/**
 * Compute safe redis key for business id
 */
function redisKeyForLock(key) {
  return `${LOCK_PREFIX}${String(key)}`;
}
function redisKeyForResult(key) {
  return `${RES_PREFIX}${String(key)}`;
}

/**
 * Try to reserve an idempotency key.
 * Returns { reserved: true, value } if acquired, otherwise { reserved: false, existingValue }
 */
export async function tryReserveKey(key, ttlMs = 5 * 60 * 1000) {
  if (!key) throw new Error('key required');
  const redis = redisClient.getRedis();
  const lockKey = redisKeyForLock(key);
  const value = `${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
  const ttl = Math.max(1000, Number(ttlMs || 5 * 60 * 1000));
  try {
    // SET lockKey value NX PX ttl
    const res = await redis.set(lockKey, value, 'PX', ttl, 'NX');
    if (res === 'OK' || res === true) {
      return { reserved: true, value };
    } else {
      // already exists; return existing value
      const existingValue = await redis.get(lockKey);
      return { reserved: false, existingValue };
    }
  } catch (err) {
    logger.error('tryReserveKey failed', { key, error: err.message });
    throw err;
  }
}

/**
 * Release reservation lock (best-effort).
 */
export async function releaseKey(key) {
  if (!key) return false;
  const redis = redisClient.getRedis();
  const lockKey = redisKeyForLock(key);
  try {
    await redis.del(lockKey);
    return true;
  } catch (err) {
    logger.warn('releaseKey failed', { key, error: err.message });
    return false;
  }
}

/**
 * Store processed result atomically; sets both result key and removes lock
 * result is JSON-serializable.
 */
export async function setProcessed(key, result, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  if (!key) throw new Error('key required');
  const redis = redisClient.getRedis();
  const resultKey = redisKeyForResult(key);
  const lockKey = redisKeyForLock(key);
  const payload = {
    result,
    recordedAt: Date.now()
  };
  const value = JSON.stringify(payload);
  const ttl = Math.max(1000, Number(ttlMs));
  try {
    // multi: set result with PX and del lock
    const multi = redis.multi();
    multi.set(resultKey, value, 'PX', ttl);
    multi.del(lockKey);
    await multi.exec();
    return payload;
  } catch (err) {
    logger.error('setProcessed failed', { key, error: err.message });
    throw err;
  }
}

/**
 * Get processed result if exists
 */
export async function getProcessed(key) {
  if (!key) return null;
  const redis = redisClient.getRedis();
  const resultKey = redisKeyForResult(key);
  try {
    const raw = await redis.get(resultKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { result: raw, recordedAt: null };
    }
  } catch (err) {
    logger.warn('getProcessed failed', { key, error: err.message });
    return null;
  }
}

/**
 * Generate deterministic idempotency key for payload:
 *  - prefix: business domain prefix (string)
 *  - payload: object or string
 *
 * Uses canonicalize() to ensure stable ordering and sha256 to produce short key.
 */
export function generateIdempotencyKey(prefix = 'idem', payload = {}) {
  const canonical = canonicalize(payload);
  const h = crypto.createHash('sha256').update(canonical).digest('hex');
  return `${prefix}:${h}`;
}

export default {
  tryReserveKey,
  releaseKey,
  setProcessed,
  getProcessed,
  generateIdempotencyKey
};
