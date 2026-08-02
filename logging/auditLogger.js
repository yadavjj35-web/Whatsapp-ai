// path: /logging/auditLogger.js
/**
 * Enterprise Audit Logger
 */

import logger from '../utils/logger.js';

function audit(eventType, payload = {}) {
  logger.info(`AUDIT:${eventType}`, { audit: true, payload });
}

export default { audit };
