// path: /crm/customerManager.js
/**
 * Customer Manager
 */

import Customer from '../models/Customer.js';
import logger from '../utils/logger.js';

async function getCustomer(phone) {
  return Customer.findOne({ phone });
}

async function upsertCustomer(data) {
  return Customer.findOneAndUpdate({ phone: data.phone }, { $set: data }, { upsert: true, new: true });
}

export default { getCustomer, upsertCustomer };
