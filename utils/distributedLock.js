// path: utils/distributedLock.js
/**
 * distributedLock.js
 *
 * Redlock-based distributed locking utilities for cross-process critical sections.
 *
 * Exports:
 *  - acquireLock(resource, ttlMs) -> returns lock object { resource, value, extend, unlock }
 *  - withLock(resource, ttlMs, asyncFn) -> convenience wrapper to run asyncFn under lock
 *
 * Requirements:
 *  - queue/redisClient.js must provide ioredis instance via getRedis()
 *
 * Production notes:
 *  - Uses redlock (v6+) for locks
 *  - Provides safe unlock and extend helpers
 */

import Redlock from 'redlock';
import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';

let redlockInstance = null;

function getRedlock() {
  if (redlockInstance) return redlockInstance;
  const client = redisClient.getRedis();
  // redlock expects an array of clients
  redlockInstance = new Redlock([client], {
    // recommended retry settings
    retryCount: Number(process.env.REDLOCK_RETRY_COUNT || 3),
    retryDelay: Number(process.env.REDLOCK_RETRY_DELAY_MS || 200),
    retryJitter: Number(process.env.REDLOCK_RETRY_JITTER_MS || 100)
  });
  // Optional: handle error events
  redlockInstance.on('clientError', (err) => {
    logger.error('Redlock client error', { error: err && err.message });
  });
  return redlockInstance;
}

export async function acquireLock(resource, ttlMs = 30000) {
  if (!resource) throw new Error('resource required for lock');
  const redlock = getRedlock();
  try {
    const lock = await redlock.acquire([resource], Number(ttlMs));
    // attach helpers
    lock.extendLock = async (extraMs) => {
      try {
        const newLock = await lock.extend(Number(extraMs || ttlMs));
        return newLock;
      } catch (err) {
        logger.warn('Failed to extend lock', { resource, error: err.message });
        throw err;
      }
    };
    lock.safeUnlock = async () => {
      try {
        await lock.release();
      } catch (err) {
        logger.warn('Failed to release lock', { resource, error: err.message });
      }
    };
    return lock;
  } catch (err) {
    // Could not acquire lock
    logger.debug('Failed to acquire distributed lock', { resource, error: err.message });
    throw err;
  }
}

/**
 * Convenience wrapper to run an async function under a lock
 * - Acquires lock on resource, executes asyncFn, releases lock.
 * - Throws if lock cannot be acquired.
 */
export async function withLock(resource, ttlMs, asyncFn) {
  const lock = await acquireLock(resource, ttlMs);
  try {
    const result = await asyncFn();
    await lock.safeUnlock();
    return result;
  } catch (err) {
    try {
      await lock.safeUnlock();
    } catch (uerr) {
      // ignore
    }
    throw err;
  }
}

export default { acquireLock, withLock };
