// path: /integrations/amazon/inventorySync.js
import amazonClient from './amazonClient.js';
import logger from '../../utils/logger.js';

async function sync(skus = []) {
  try {
    const res = await amazonClient.syncInventory(skus);
    return res;
  } catch (err) {
    logger.error('inventorySync error', err);
    throw err;
  }
}

export default { sync };
