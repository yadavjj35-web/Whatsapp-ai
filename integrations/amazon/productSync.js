// path: /integrations/amazon/productSync.js
import amazonClient from './amazonClient.js';
import logger from '../../utils/logger.js';

async function sync(product) {
  try {
    const res = await amazonClient.syncProduct(product);
    return res;
  } catch (err) {
    logger.error('productSync error', err);
    throw err;
  }
}

export default { sync };
