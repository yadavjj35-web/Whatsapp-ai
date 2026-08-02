// path: /owner/commandParser.js
/**
 * Owner Command Parser
 * - Parse text commands from owner into structured commands
 * - Uses simple rule-based parsing suitable for enterprise commands.
 */

import logger from '../utils/logger.js';

async function parse(commandText) {
  const text = (commandText || '').trim();
  const lower = text.toLowerCase();

  // Basic patterns
  if (/^(show|get).*(today|today's).*sales/i.test(text) || /sales report/i.test(lower)) {
    return { action: 'generate_report', payload: { timeframe: 'today', metrics: ['revenue', 'orders'] } };
  }

  if (/search product|find product|lookup product/i.test(lower)) {
    const q = text.match(/search product (.+)/i) || text.match(/find product (.+)/i);
    return { action: 'product_search', payload: { query: q ? q[1] : '' } };
  }

  if (/start campaign|launch campaign/i.test(lower)) {
    return { action: 'start_campaign', payload: { campaignName: text.replace(/start campaign/i, '').trim() } };
  }

  if (/low stock|find low stock/i.test(lower)) {
    return { action: 'find_low_stock', payload: {} };
  }

  if (/generate invoice|create invoice/i.test(lower)) {
    const match = text.match(/invoice for order (\d+)/i);
    return { action: 'generate_invoice', payload: { orderId: match ? match[1] : null } };
  }

  // Default: return generic interpret command
  logger.info('Owner commandParser fallback', { text });
  return { action: 'interpret', payload: { text } };
}

export default { parse };
