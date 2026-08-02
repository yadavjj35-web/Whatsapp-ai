// path: /prompts/promptRouter.js
/**
 * Prompt Router
 * - Chooses which prompt template to use for a given agent/task
 */

import agentPromptBuilder from './agentPromptBuilder.js';

function getPromptForAgent(agentName, context = {}) {
  // Map agent names to prompts
  if (agentName === 'SalesAgent') return agentPromptBuilder.salesPrompt();
  if (agentName === 'CustomerSupportAgent') return agentPromptBuilder.supportPrompt();
  if (agentName === 'OwnerAssistantAgent') return agentPromptBuilder.ownerPrompt();
  return agentPromptBuilder.agentPrompt(agentName);
}

export default { getPromptForAgent };
