// path: /prompts/systemPromptBuilder.js
/**
 * System Prompt Builder
 * - Composes modular prompt fragments into final prompt package
 * - Avoids huge monolithic prompts by allowing composed building blocks
 */

import SYSTEM_PROMPT from './systemPrompt.js';
import BUSINESS_RULES from './businessRules.js';

function build({ agentPrompt = '', customerProfile = '', conversationSummary = '', liveData = '' } = {}) {
  const parts = [
    SYSTEM_PROMPT,
    BUSINESS_RULES,
    agentPrompt,
    customerProfile ? `Customer Profile:\n${customerProfile}` : '',
    conversationSummary ? `Conversation Summary:\n${conversationSummary}` : '',
    liveData ? `Live Data:\n${liveData}` : ''
  ].filter(Boolean);

  return parts.join('\n\n');
}

export default { build };
