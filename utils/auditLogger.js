// path: utils/auditLogger.js
import logger from './logger.js';

/**
 * Structured audit logger for important events (message in/out, ai calls, orders).
 * Uses main logger but provides consistent fields.
 */

function logEvent(type, payload = {}) {
  logger.info(`audit:${type}`, { audit: true, type, payload });
}

export default { logEvent };
