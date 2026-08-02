// path: services/aiConversationEngine.js
import logger from '../utils/logger.js';
import geminiService from './geminiService.js';
import { assemblePrompt } from '../prompts/promptAssembler.js';
import MessageLog from '../models/MessageLog.js';
import Customer from '../models/Customer.js';

/**
 * Compose prompt using assembler, call Gemini, log AI request and response, and return generated text.
 * conversationHistory is expected as array of { role: 'user'|'assistant', text: '...' }
 */
async function generateReply({ phone, lastUserMessage, conversationHistory = [], liveWooData = '', companyKnowledge = '', customerProfile = {} } = {}) {
  // Ensure we have up-to-date customer profile
  let profile = customerProfile;
  try {
    if (!profile || !Object.keys(profile).length) {
      profile = (await Customer.findOne({ phone }))?.toObject() || {};
    }
  } catch (err) {
    logger.warn('Failed to fetch customer profile', { phone, err: err.message });
  }

  const prompt = assemblePrompt({
    customerProfile: profile,
    conversationHistory,
    liveWooData,
    lastUserMessage,
    companyKnowledge
  });

  // Log the AI request (without storing prompt if it contains PII/sensitive data — keep minimal)
  await MessageLog.create({
    messageId: `ai-request-${Date.now()}`,
    from: phone || 'system',
    direction: 'outbound',
    type: 'ai_request',
    body: { lastUserMessage, truncatedPrompt: prompt.slice(0, 2000) },
    metadata: { model: 'gemini' }
  });

  // Call Gemini
  const resp = await geminiService.callGemini(prompt, { maxTokens: 512 });
  const text = resp.text || 'Sorry, something went wrong while generating a response.';

  // Log the AI response
  await MessageLog.create({
    messageId: `ai-response-${Date.now()}`,
    from: phone || 'system',
    direction: 'outbound',
    type: 'ai_response',
    body: { text: text.slice(0, 10000) },
    metadata: { raw: resp.raw }
  });

  return text;
}

export default { generateReply };
