// path: /crm/activityLogger.js
/**
 * Activity Logger
 * - Logs CRM activities; minimal implementation using DB or external systems.
 */

import logger from '../utils/logger.js';
import OrderRecord from '../models/OrderRecord.js';

async function createTicket({ phone, order, issue }) {
  // Simulate ticket creation and return ticket id
  const ticket = { id: `T-${Date.now()}`, phone, orderId: order?.id, issue, createdAt: new Date() };
  logger.info('CRM ticket created', { ticket });
  return ticket;
}

async function getOrder(orderId) {
  return OrderRecord.findOne({ wooOrderId: orderId });
}

async function logActivity(activity) {
  logger.info('CRM activity logged', { activity });
  return { success: true, loggedAt: new Date() };
}

export default { createTicket, getOrder, logActivity };
