// path: /tools/inventoryTools.js
/**
 * Inventory Tools - uses Woo and Amazon integrations to determine low stock and suggestions
 */

import wooService from '../services/wooService.js';
import amazonClient from '../integrations/amazon/amazonClient.js';
import logger from '../utils/logger.js';

async function findLowStock({ threshold = 5 } = {}) {
  try {
    // Simple approach: fetch recent products and filter
    const products = await wooService.searchProducts('', { perPage: 50, page: 1 }).catch(() => []);
    const low = (products || []).filter((p) => p.stock_quantity !== null && p.stock_quantity <= threshold).map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stock_quantity
    }));
    return low;
  } catch (err) {
    logger.error('inventoryTools.findLowStock error', err);
    throw err;
  }
}

export default { findLowStock };
