// path: utils/aiRateLimiter.js
/**
 * AI Rate Limiter (per-tenant token bucket using Redis)
 *
 * Purpose:
 *  - Limit token usage per tenant/owner to avoid runaway costs
 *  - Track token spend and block LLM calls when quota exceeded
 *
 * Behavior:
 *  - Uses Redis INCRBY to count tokens consumed within a window
 *  - Config via env:
 *    - AI_RATE_LIMIT_TOKENS (default 1000000 tokens per window)
 *    - AI_RATE_LIMIT_WINDOW_SEC (default 86400 seconds = 1 day)
 *
 * Exports:
 *  - allowConsume(ownerId, tokensRequested) => { allowed: boolean, remaining, resetAt }
 *  - consume(ownerId, tokens) => increments and returns new count
 *  - getUsage(ownerId) => { used, remaining, resetAt }
 *
 * Note:
 *  - For multi-process usage, Redis is sufficient
 */

import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';

const TOKENS = Number(process.env.AI_RATE_LIMIT_TOKENS || 1_000_000);
const WINDOW = Number(process.env.AI_RATE_LIMIT_WINDOW_SEC || 86400);
const PREFIX = process.env.AI_RATE_LIMIT_PREFIX || 'aiquota:';

function keyForOwner(ownerId) {
  return `${PREFIX}${ownerId || 'global'}`;
}

/**
 * Get token usage and remaining
 */
export async function getUsage(ownerId) {
  const redis = redisClient.getRedis();
  const key = keyForOwner(ownerId);
  const used = Number((await redis.get(key)) || 0);
  // Get TTL for reset
  const ttl = await redis.ttl(key);
  const resetAt = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + WINDOW * 1000;
  return { used, remaining: Math.max(0, TOKENS - used), resetAt };
}

/**
 * Attempt to reserve tokens (non-atomic check+set avoided)
 * We use INCRBY and set expire when first created
 */
export async function consume(ownerId, tokens = 1) {
  const redis = redisClient.getRedis();
  const key = keyForOwner(ownerId);
  const ttl = await redis.ttl(key);
  const multi = redis.multi();
  multi.incrby(key, tokens);
  if (ttl === -2 || ttl === -1) {
    multi.expire(key, WINDOW);
  }
  const [[, newValue]] = await multi.exec();
  const used = Number(newValue);
  const remaining = Math.max(0, TOKENS - used);
  const resetTtl = await redis.ttl(key);
  const resetAt = Date.now() + (resetTtl > 0 ? resetTtl * 1000 : WINDOW * 1000);
  return { used, remaining, resetAt };
}

/**
 * Check if allowed before consuming (reads current value)
 */
export async function allowConsume(ownerId, tokens = 1) {
  const { used, remaining, resetAt } = await getUsage(ownerId);
  return { allowed: remaining >= tokens, used, remaining, resetAt };
}

export default { getUsage, consume, allowConsume };
