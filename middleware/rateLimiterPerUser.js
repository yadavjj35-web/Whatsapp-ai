// path: middleware/rateLimiterPerUser.js
/**
 * Rate limiter per user/tenant using rate-limiter-flexible backed by Redis.
 *
 * Behavior:
 *  - Allows config via env:
 *    - RATE_LIMIT_POINTS (default 100)
 *    - RATE_LIMIT_DURATION (secs default 60)
 *    - RATE_LIMIT_BLOCK_DURATION (secs default 60)
 *  - Keying: preferred key is req.user.sub or req.user.user_id (OIDC), then apiKey header, then IP.
 *  - On blocked, responds with HTTP 429 with Retry-After header (seconds).
 *
 * Requires:
 *  - queue/redisClient.js (ioredis instance)
 */

import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';

const POINTS = Number(process.env.RATE_LIMIT_POINTS || 100);
const DURATION = Number(process.env.RATE_LIMIT_DURATION || 60); // seconds
const BLOCK_DURATION = Number(process.env.RATE_LIMIT_BLOCK_DURATION || 60); // seconds
const KEY_PREFIX = process.env.RATE_LIMIT_PREFIX || 'rl';

/**
 * Initialize limiter using Redis client from redisClient.getRedis()
 */
function initLimiter() {
  const redis = redisClient.getRedis();
  return new RateLimiterRedis({
    storeClient: redis,
    points: POINTS,
    duration: DURATION,
    blockDuration: BLOCK_DURATION,
    keyPrefix: KEY_PREFIX
  });
}

const limiter = initLimiter();

/**
 * Extract a stable key for rate limiting
 * Priority: req.user.sub / req.user.user_id / req.user.email -> x-api-key -> ip
 */
function extractKey(req) {
  try {
    const user = req.user;
    if (user) {
      const uid = user.sub || user.user_id || user.id || user.email;
      if (uid) return `user:${String(uid)}`;
    }
    // API key fallback
    const apiKey = req.headers['x-api-key'] || req.headers['x-client-key'];
    if (apiKey) return `apikey:${String(apiKey)}`;
    // IP fallback
    const ip = (req.ip && String(req.ip)) || (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null) || req.connection?.remoteAddress || 'unknown';
    return `ip:${String(ip)}`;
  } catch (err) {
    logger.error('Error extracting rate limit key', { error: err.message });
    return `ip:unknown`;
  }
}

/**
 * Middleware factory: optionally accept override points/duration for specific routes
 */
export function rateLimiterPerUser(options = {}) {
  const pointsOverride = options.points || POINTS;
  const durationOverride = options.duration || DURATION;
  const blockDurationOverride = options.blockDuration || BLOCK_DURATION;

  // If overrides are different, create a dedicated limiter instance
  const useCustomLimiter =
    pointsOverride !== POINTS || durationOverride !== DURATION || blockDurationOverride !== BLOCK_DURATION;

  const theLimiter = useCustomLimiter
    ? new RateLimiterRedis({
        storeClient: redisClient.getRedis(),
        points: pointsOverride,
        duration: durationOverride,
        blockDuration: blockDurationOverride,
        keyPrefix: KEY_PREFIX
      })
    : limiter;

  return async function (req, res, next) {
    const key = extractKey(req);
    try {
      const rlRes = await theLimiter.consume(key, 1);
      // set rate limit headers
      res.setHeader('X-RateLimit-Limit', String(pointsOverride));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, Math.floor(rlRes.remainingPoints))));
      res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + Math.ceil(rlRes.msBeforeNext / 1000)));
      return next();
    } catch (rejRes) {
      // rejRes instanceof Error or object with msBeforeNext
      const ms = (rejRes && (rejRes.msBeforeNext || rejRes.msBeforeNext === 0 ? Number(rejRes.msBeforeNext) : null)) ?? null;
      const retryAfter = ms !== null ? Math.ceil(ms / 1000) : blockDurationOverride;
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(pointsOverride));
      res.setHeader('X-RateLimit-Remaining', '0');
      logger.warn('Rate limit exceeded', { key, retryAfter });
      return res.status(429).json({ success: false, error: 'Too Many Requests', retryAfter });
    }
  };
}

export default rateLimiterPerUser();
