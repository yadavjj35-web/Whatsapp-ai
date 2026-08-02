// path: /crm/pipelineManager.js
/**
 * Pipeline Manager
 * - Basic lead qualification operations
 */

import Lead from '../models/Lead.js';
import logger from '../utils/logger.js';

async function qualifyLead(leadId, criteria = {}) {
  const lead = await Lead.findByIdAndUpdate(leadId, { status: 'qualified', lastActivityAt: new Date() }, { new: true });
  return lead;
}

export default { qualifyLead };
