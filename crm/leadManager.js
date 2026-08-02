// path: /crm/leadManager.js
/**
 * CRM Lead Manager
 * - Manage leads with basic persistence via existing models
 */

import Lead from '../models/Lead.js';
import logger from '../utils/logger.js';

async function getOrCreateLead({ phone, source }) {
  const existing = await Lead.findOne({ phone });
  if (existing) return existing;
  const created = await Lead.create({ phone, source });
  logger.info('Lead created', { phone });
  return created;
}

async function updateLead(phone, updates = {}) {
  return Lead.findOneAndUpdate({ phone }, { $set: updates }, { new: true });
}

export default { getOrCreateLead, updateLead };
