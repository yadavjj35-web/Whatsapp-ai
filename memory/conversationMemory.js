// path: /memory/conversationMemory.js
/**
 * Conversation Memory
 * - Stores and retrieves conversation snippets and summaries
 * - Uses existing Conversation model from /models (do NOT modify models)
 */

import Conversation from '../models/Conversation.js';
import logger from '../utils/logger.js';

async function getConversation(phone) {
  return Conversation.findOne({ customerPhone: phone }).lean();
}

async function appendMessage(phone, role, text, meta = {}) {
  const convo = await Conversation.findOneAndUpdate({ customerPhone: phone }, { $push: { messages: { role, text, meta, timestamp: new Date() } }, $set: { lastUpdated: new Date() } }, { upsert: true, new: true });
  return convo;
}

async function saveAgentMemory(taskId, payload = {}) {
  // Save as a system message in conversationMemory for traceability
  try {
    // optional: associate by phone if provided
    const phone = payload.phone;
    if (phone) {
      await appendMessage(phone, 'system', JSON.stringify({ taskId, payload: payload }), { taskId });
    }
    // fallback: log
    logger.info('ConversationMemory saved', { taskId, note: Object.keys(payload).length });
    return true;
  } catch (err) {
    logger.error('ConversationMemory.saveAgentMemory error', err);
    return false;
  }
}

export default { getConversation, appendMessage, saveAgentMemory };
