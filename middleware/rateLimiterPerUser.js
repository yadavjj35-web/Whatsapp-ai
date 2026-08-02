// path: middleware/rateLimiterPerUser.js
/**
 * Rate limiter per user/tenant using rate-limiter-flexible backed by Redis.
 *
 * Behavior:
 *  - Allows config via env:
 *    - RATE_LIMIT_POINTS (default 100)
 *    - RATE_LIMIT_DURATION (secs default 60)
 *    - RATE_LIMIT_BURST (optional extra)
 *
 *  - Keying: preferred key is req.user.sub or req.user.user_id (OIDC), then apiKey header, then IP.
 *  - On blocked, responds with HTTP 429 with Retry-After header (seconds).
 *
 * Notes:
 *  - Requires redis (ioredis) instance via queue/redisClient.js
 */

import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';

const points = Number(process.env.RATE_LIMIT_POINTS || 100); // points
const duration = Number(process.env.RATE_LIMIT_DURATION || 60); // per seconds
const blockDuration = Number(process.env.RATE_LIMIT_BLOCK_DURATION || 60); // sec to block after consuming all points

const redis = redisClient.getRedis();

const limiter = new RateLimiterRedis({
  storeClient: redis,
  points,
  duration,
  blockDuration,
  keyPrefix: process.env.RATE_LIMIT_PREFIX || 'rl' // optional prefix
});

/**
 * Extract key for rate limiting
 */
function extractKey(req) {
  const authUser = req.user && (req.user.sub || req.user.user_id || req.user.email || req.user.id);
  if (authUser) return `user:${String(authUser)}`;
  const apiKey = req.headers['x-api-key'] || req.headers['x-client-key'];
  if (apiKey) return `apikey:${String(apiKey)}`;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection
