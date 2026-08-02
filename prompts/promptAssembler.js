// path: prompts/promptAssembler.js
import SYSTEM_PROMPT from './systemPrompt.js';
import BUSINESS_RULES from './businessRules.js';

/**
 * Assemble the prompt pieces into the final prompt payload.
 * pieces: {
 *   customerProfile, conversationHistory, liveWooData, lastUserMessage, companyKnowledge (optional)
 * }
 */
export function assemblePrompt(pieces = {}) {
  const {
    customerProfile = {},
    conversationHistory = [],
    liveWooData = '',
    lastUserMessage = '',
    companyKnowledge = ''
  } = pieces;

  const profileSection = customerProfile && Object.keys(customerProfile).length
    ? `Customer profile: ${JSON.stringify(customerProfile)}`
    : '';

  const convoSection = conversationHistory && conversationHistory.length
    ? `Conversation history (most recent last):\n${conversationHistory.map((m) => `${m.role}: ${m.text}`).join('\n')}`
    : '';

  const wooSection = liveWooData ? `Live WooCommerce data:\n${liveWooData}` : '';

  const companySection = companyKnowledge ? `Company knowledge:\n${companyKnowledge}` : '';

  const finalPrompt = [
    SYSTEM_PROMPT,
    BUSINESS_RULES,
    profileSection,
    companySection,
    wooSection,
    convoSection,
    `User: ${lastUserMessage}`,
    `Assistant:`
  ]
    .filter(Boolean)
    .join('\n\n');

  return finalPrompt;
}
