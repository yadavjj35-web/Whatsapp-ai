// path: /memory/customerMemory.js
/**
 * Customer Memory
 * - Read and write customer-level memory (long-term)
 * - Uses Customer model (do NOT modify)
 */

import Customer from '../models/Customer.js';
import logger from '../utils/logger.js';

async function getCustomerByPhone(phone) {
  return Customer.findOne({ phone }).lean();
}

async function upsertCustomer(phone, data = {}) {
  return Customer.findOneAndUpdate({ phone }, { $set: { ...data, phone } }, { upsert: true, new: true });
}

async function addInterestedProduct(phone, productId) {
  return Customer.findOneAndUpdate({ phone }, { $addToSet: { interestedProducts: productId }, $set: { lastConversationAt: new Date() } }, { upsert: true, new: true });
}

export default { getCustomerByPhone, upsertCustomer, addInterestedProduct };
