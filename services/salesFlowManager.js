// path: services/salesFlowManager.js
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Lead from '../models/Lead.js';
import logger from '../utils/logger.js';

/**
 * Manages simple sales flow state transitions. This is a lightweight state manager
 * interacting with Customer, Lead and Conversation models.
 */

async function updateLeadStatus(phone, status, notes) {
  try {
    const lead = await Lead.findOneAndUpdate(
      { phone },
      { $set: { status, lastActivityAt: new Date(), ...(notes ? { $push: { notes } } : {}) } },
      { upsert: true, new: true }
    );
    return lead;
  } catch (err) {
    logger.error('updateLeadStatus error', err);
    throw err;
  }
}

async function addConversationMessage(phone, role, text, meta) {
  try {
    let convo = await Conversation.findOne({ customerPhone: phone });
    if (!convo) {
      convo = await Conversation.create({ customerPhone: phone, messages: [] });
    }
    convo.messages.push({ role, text, meta, timestamp: new Date() });
    convo.lastUpdated = new Date();
    await convo.save();

    // update customer's lastConversationAt
    await Customer.findOneAndUpdate({ phone }, { $set: { lastConversationAt: new Date() }, $addToSet: { conversationIds: convo._id } }, { upsert: true });

    return convo;
  } catch (err) {
    logger.error('addConversationMessage error', err);
    throw err;
  }
}

export default { updateLeadStatus, addConversationMessage };
