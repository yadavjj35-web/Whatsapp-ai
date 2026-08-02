// path: /tools/crmTools.js
/**
 * CRM Tools
 * Minimal CRM wrapper for lead and ticket operations. Integrates with /crm modules.
 */

import leadManager from '../crm/leadManager.js';
import customerManager from '../crm/customerManager.js';
import pipelineManager from '../crm/pipelineManager.js';
import activityLogger from '../crm/activityLogger.js';

async function getOrCreateLead(payload) {
  return leadManager.getOrCreateLead(payload);
}

async function qualifyLead(id, criteria) {
  return pipelineManager.qualifyLead(id, criteria);
}

async function createTicket(ticket) {
  return activityLogger.createTicket(ticket);
}

async function getOrder(orderId) {
  // Attempt to fetch order from CRM activity logs (stub behavior)
  return activityLogger.getOrder(orderId);
}

async function createActivity(activity) {
  return activityLogger.logActivity(activity);
}

export default { getOrCreateLead, qualifyLead, createTicket, getOrder, createActivity };
