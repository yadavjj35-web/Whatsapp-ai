// path: controllers/chatController.js
import aiConversationEngine from '../services/aiConversationEngine.js';
import salesFlowManager from '../services/salesFlowManager.js';
import whatsappService from '../services/whatsappService.js';
import logger from '../utils/logger.js';
import recommendationEngine from '../services/recommendationEngine.js';

/**
 * Endpoints for programmatic chat actions:
 * - POST /api/v1/chat/reply : generate AI reply for a given phone & last message
 * - POST /api/v1/chat/send : send a text message via WhatsApp
 */

export async function generateAiReply(req, res, next) {
  const { phone, lastUserMessage, conversationHistory = [], liveWooData = '' } = req.body;
  if (!phone || !lastUserMessage) return res.status(400).json({ success: false, error: 'Missing phone or lastUserMessage' });

  try {
    // Save user message to conversation
    await salesFlowManager.addConversationMessage(phone, 'user', lastUserMessage);

    // Optionally get recommendations if user asked for product suggestions
    let wooData = liveWooData;
    if (/recommend|suggest|looking for|show me/i.test(lastUserMessage)) {
      const recs = await recommendationEngine.recommend({ keywords: lastUserMessage, limit: 3 });
      wooData = JSON.stringify(recs, null, 2);
    }

    const reply = await aiConversationEngine.generateReply({ phone, lastUserMessage, conversationHistory, liveWooData: wooData });
    // Save AI reply
    await salesFlowManager.addConversationMessage(phone, 'assistant', reply);

    return res.json({ success: true, reply });
  } catch (err) {
    logger.error('generateAiReply error', err);
    return next(err);
  }
}

export async function sendText(req, res, next) {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ success: false, error: 'Missing phone or text' });

  try {
    const result = await whatsappService.sendTextMessage(phone, text);
    // Save to message log is handled in whatsappService or separate logger
    return res.json({ success: true, result });
  } catch (err) {
    logger.error('sendText error', err);
    return next(err);
  }
}
