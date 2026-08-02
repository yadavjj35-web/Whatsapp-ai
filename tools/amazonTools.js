// path: /tools/amazonTools.js
/**
 * Amazon Tools
 * - High-level wrappers that call integrations/amazon modules
 */

import amazonClient from '../integrations/amazon/amazonClient.js';

async function syncProduct(product) {
  return amazonClient.syncProduct(product);
}

async function syncInventory(skus = []) {
  return amazonClient.syncInventory(skus);
}

async function syncOrders(params = {}) {
  return amazonClient.syncOrders(params);
}

export default { syncProduct, syncInventory, syncOrders };
