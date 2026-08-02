// path: queue/redisClient.js
/**
 * Redis client (ioredis) factory and health utilities.
 *
 * Production-ready Redis client with support for:
 *  - Single node (REDIS_URL)
 *  - Sentinel (REDIS_SENTINEL_MASTER_NAME + REDIS_SENTINELS)
 *  - Cluster (REDIS_CLUSTER_NODES)
 *  - TLS (REDIS_TLS=true)
 *
 * Behavior & features:
 *  - Exports a singleton Redis client (ioredis) instance via getRedis()
 *  - Exposes ready/healthy check promises and a graceful shutdown helper
 *  - Emits well-structured events for lifecycle monitoring
 *  - Integrates basic telemetry hooks (logger) and reconnection/backoff handling
 *
 * Environment variables used:
 *  - REDIS_URL (e.g., redis://:password@host:6379/0)
 *  - REDIS_SENTINELS (comma-separated host:port pairs, e.g., "10.0.0.5:26379,10.0.0.6:26379")
 *  - REDIS_SENTINEL_MASTER_NAME (name of sentinel master)
 *  - REDIS_CLUSTER_NODES (comma-separated host:port, used for cluster mode)
 *  - REDIS_TLS (true|false) to enable TLS for connections
 *  - REDIS_PASSWORD (optional)
 *
 * Notes:
 *  - This module intentionally avoids printing sensitive connection details in logs.
 *  - It is built for Node 20+ and ES modules usage.
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import logger from '../utils/logger.js';

const emitter = new EventEmitter();

let redisInstance = null;
let readyPromise = null;

/**
 * Build Redis connection options based on environment variables.
 */
function buildRedisOptions() {
  const opts = {
    // common options
    maxRetriesPerRequest: null, // allow client-side reconnect logic
    enableReadyCheck: true,
    lazyConnect: false,
    // automatic reconnection strategy
    reconnectOnError: (err) => {
      // Let the client reconnect for connection errors; return true to reconnect
      // For some errors (like AUTH failure) we may not want to reconnect automatically
      logger.warn('Redis reconnectOnError triggered', { message: err.message });
      return true;
    },
    // retryStrategy picks the reconnect delay (ms)
    // using quadratic backoff with cap
    retryStrategy: (times) => {
      const base = 50;
      const delay = Math.min(base * Math.pow(2, Math.min(times, 8)), 2000);
      return delay;
    }
  };

  // if password given as env var, set it (avoid logging)
  if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;

  // TLS option
  if ((process.env.REDIS_TLS || '').toLowerCase() === 'true') {
    opts.tls = { rejectUnauthorized: true };
  }

  return opts;
}

/**
 * Create a single-node Redis client.
 */
function createStandaloneClient(url, opts) {
  logger.info('Initializing standalone Redis client');
  return new Redis(url, opts);
}

/**
 * Create a sentinel-backed Redis client.
 * REDIS_SENTINEL_MASTER_NAME must be set along with REDIS_SENTINELS.
 * Example: REDIS_SENTINELS="10.0.0.5:26379,10.0.0.6:26379"
 */
function createSentinelClient(sentinelsCsv, masterName, opts) {
  logger.info('Initializing sentinel Redis client', { masterName });
  const sentinels = sentinelsCsv.split(',').map((s) => {
    const [host, port] = s.trim().split(':');
    return { host, port: Number(port || 26379) };
  });
  const sentinelOpts = {
    sentinels,
    name: masterName,
    sentinelRetryStrategy(times) {
      // basic sentinel retry strategy (ms)
      const delay = Math.min(100 + times * 50, 1000);
      return delay;
    },
    ...opts
  };
  return new Redis(sentinelOpts);
}

/**
 * Create a cluster-backed Redis client.
 * REDIS_CLUSTER_NODES: "10.0.0.1:6379,10.0.0.2:6379"
 */
function createClusterClient(nodesCsv, opts) {
  logger.info('Initializing Redis Cluster client');
  const nodes = nodesCsv.split(',').map((s) => {
    const [host, port] = s.trim().split(':');
    return { host, port: Number(port || 6379) };
  });
  // ioredis accepts array of nodes for cluster mode
  return new Redis.Cluster(nodes, {
    slotsRefreshTimeout: 2000,
    redisOptions: opts
  });
}

/**
 * Initialize singleton Redis client based on environment detection.
 */
function initRedis() {
  if (redisInstance) return redisInstance;

  const opts = buildRedisOptions();

  try {
    // Priority order: REDIS_CLUSTER_NODES -> REDIS_SENTINELS -> REDIS_URL
    if (process.env.REDIS_CLUSTER_NODES) {
      redisInstance = createClusterClient(process.env.REDIS_CLUSTER_NODES, opts);
    } else if (process.env.REDIS_SENTINELS && process.env.REDIS_SENTINEL_MASTER_NAME) {
      redisInstance = createSentinelClient(process.env.REDIS_SENTINELS, process.env.REDIS_SENTINEL_MASTER_NAME, opts);
    } else if (process.env.REDIS_URL) {
      redisInstance = createStandaloneClient(process.env.REDIS_URL, opts);
    } else {
      // Fallback: attempt localhost
      const defaultUrl = 'redis://127.0.0.1:6379';
      logger.warn('No Redis configuration found in environment; falling back to localhost', { defaultUrl });
      redisInstance = createStandaloneClient(defaultUrl, opts);
    }
  } catch (err) {
    logger.error('Failed to initialize Redis client', { error: err && err.message });
    throw err;
  }

  // Wire events for observability
  redisInstance.on('connect', () => {
    logger.info('Redis client connecting');
    emitter.emit('connecting');
  });

  redisInstance.on('ready', () => {
    logger.info('Redis client ready');
    emitter.emit('ready');
  });

  redisInstance.on('error', (err) => {
    // Don't log sensitive connection details; log only message and stack
    logger.error('Redis error', { error: err && (err.message || String(err)) });
    emitter.emit('error', err);
  });

  redisInstance.on('close', () => {
    logger.warn('Redis connection closed');
    emitter.emit('close');
  });

  redisInstance.on('end', () => {
    logger.warn('Redis connection ended');
    emitter.emit('end');
  });

  // Provide a ready Promise for startup sequences
  readyPromise = (async () => {
    // Wait until the client is ready or a timeout occurs
    const timeoutMs = Number(process.env.REDIS_READY_TIMEOUT_MS || 15000);
    let resolved = false;
    return await new Promise((resolve, reject) => {
      const onReady = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(true);
        }
      };
      const onError = (err) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(err);
        }
      };
      function cleanup() {
        redisInstance.removeListener('ready', onReady);
        redisInstance.removeListener('error', onError);
      }
      redisInstance.once('ready', onReady);
      redisInstance.once('error', onError);
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          const err = new Error(`Redis ready timeout after ${timeoutMs}ms`);
          logger.error(err.message);
          reject(err);
        }
      }, timeoutMs).unref();
    });
  })();

  return redisInstance;
}

/**
 * Public accessors
 */
function getRedis() {
  if (!redisInstance) return initRedis();
  return redisInstance;
}

async function waitUntilReady() {
  if (!readyPromise) {
    // If not initialized yet, init and then wait
    initRedis();
  }
  return readyPromise;
}

/**
 * Graceful shutdown helper
 */
async function shutdownRedis({ timeoutMs = 10000 } = {}) {
  if (!redisInstance) return;
  try {
    // Stop accepting new commands, wait for pending commands
    await redisInstance.quit();
    // Node redis may still have background tasks; ensure a timeout
    return;
  } catch (err) {
    logger.warn('Redis quit failed, trying disconnect', { message: err.message });
    try {
      redisInstance.disconnect();
    } catch (e) {
      // ignore
    }
  } finally {
    // clear instance reference
    redisInstance = null;
  }
}

/**
 * Health check
 */
async function checkRedisHealth() {
  try {
    const client = getRedis();
    if (!client) return { ok: false, reason: 'no-client' };
    // ping with timeout
    const pingPromise = client.ping();
    const timeout = Number(process.env.REDIS_HEALTH_TIMEOUT_MS || 2000);
    const res = await Promise.race([
      pingPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping-timeout')), timeout))
    ]);
    return { ok: res === 'PONG' || res === 'pong', details: res };
  } catch (err) {
    return { ok: false, reason: err.message || String(err) };
  }
}

/**
 * Exports
 */
export default {
  initRedis,
  getRedis,
  waitUntilReady,
  shutdownRedis,
  checkRedisHealth,
  events: emitter
};
