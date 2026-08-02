// path: /integrations/amazon/orderSync.js
import amazonClient from './amazonClient.js';
import logger from '../../utils/logger.js';

async function sync(params = {}) {
  try {
    const res = await amazonClient.syncOrders(params);
    return res;
  } catch (err) {
    logger.error('orderSync error', err);
    throw err;
  }
}

export default { sync };
