// path: middleware/authApiKey.js
import logger from '../utils/logger.js';

const API_KEYS = (process.env.API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);

/**
 * Simple API key middleware. Set API_KEYS as comma-separated list in environment.
 * For production, use a store and rotateable keys.
 */
export default function authApiKey(req, res, next) {
  const key = req.header('x-api-key') || req.query.api_key;
  if (!key) {
    return res.status(401).json({ success: false, error: 'Missing API key' });
  }
  if (!API_KEYS.length) {
    logger.warn('No API_KEYS configured; bypassing key check (not recommended in production)');
    return next();
  }
  if (!API_KEYS.includes(key)) {
    return res.status(403).json({ success: false, error: 'Invalid API key' });
  }
  return next();
}
