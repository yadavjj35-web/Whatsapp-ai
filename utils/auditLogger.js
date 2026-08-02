// path: utils/auditLogger.js
/**
 * Audit Logger
 *
 * - Convenience API to write immutable audit entries to models/AuditLog
 * - Also ships logs to remote shipper and local structured logger
 *
 * Exports:
 *  - writeAudit({ category, action, actor, actorType, message, details, correlationId })
 */

import AuditLog from '../models/AuditLog.js';
import shipper from '../logging/shipper.js';
import logger from './logger.js';

export async function writeAudit({ category, action, actor, actorType = 'system', message = '', details = {}, correlationId = null } = {}) {
  try {
    const entry = await AuditLog.write({ category, action, actor, actorType, message, details, correlationId });
    // Log locally
    logger.info('audit.entry', { category, action, actor, actorType, correlationId });
    // Ship to remote shipper (best-effort)
    try {
      if (shipper && shipper.isEnabled && shipper.isEnabled()) {
        shipper.ship({ category, action, actor, actorType, message, details, correlationId, timestamp: new Date().toISOString() });
      }
    } catch (e) {
      // don't fail the main flow
      logger.warn('audit shipper error', { error: e.message, category, action });
    }
    return entry;
  } catch (err) {
    logger.error('writeAudit failed', { error: err.message, category, action });
    throw err;
  }
}

export default { writeAudit };
