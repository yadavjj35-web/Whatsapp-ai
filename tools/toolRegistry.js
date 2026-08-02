// path: /tools/toolRegistry.js
/**
 * Tool Registry
 * - Maintains available tools and creates tool contexts for agents
 * - Each tool group (wooTools, amazonTools, etc.) must be registered here
 */

import logger from '../utils/logger.js';
import wooTools from './wooTools.js';
import amazonTools from './amazonTools.js';
import crmTools from './crmTools.js';
import analyticsTools from './analyticsTools.js';
import notificationTools from './notificationTools.js';
import paymentTools from './paymentTools.js';
import inventoryTools from './inventoryTools.js';
import n8nTools from './n8nTools.js';

const availableTools = {
  wooTools,
  amazonTools,
  crmTools,
  analyticsTools,
  notificationTools,
  paymentTools,
  inventoryTools,
  n8n: n8nTools
};

function createToolContext({ agentName } = {}) {
  // Return a limited view of tools for the agent. Future: enforce allowedTools list
  return availableTools;
}

function registerTool(name, impl) {
  if (!name || !impl) throw new Error('Invalid tool registration');
  availableTools[name] = impl;
  logger.info('Tool registered', { name });
}

export default { createToolContext, registerTool, availableTools };
