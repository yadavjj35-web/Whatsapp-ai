// path: /prompts/agentPromptBuilder.js
/**
 * Agent Prompt Builder
 * - Returns prompts for individual agents
 */

import salesPrompt from './salesPrompt.js';
import supportPrompt from './supportPrompt.js';
import ownerPrompt from './ownerPrompt.js';

function salesPromptBuilder() {
  return salesPrompt();
}

function supportPromptBuilder() {
  return supportPrompt();
}

function agentPrompt(type = 'general') {
  if (type === 'woo') return `You are a WooCommerce agent. Use live WooCommerce APIs.`;
  return `You are an agent for type: ${type}`;
}

export default {
  salesPrompt: salesPromptBuilder,
  supportPrompt: supportPromptBuilder,
  agentPrompt,
  ownerPrompt: ownerPrompt
};
