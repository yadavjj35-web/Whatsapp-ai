// path: prompts/promptRegistry.js
/**
 * Prompt Registry
 *
 * Centralized prompt templates and retrieval for agents.
 * Ensures prompts are versioned and selectable by agent or intent.
 *
 * Exports:
 *  - getPrompt({ agentName, intent, variant })
 *  - registerPrompt({ key, template, meta })
 *
 * This registry references existing prompt modules where available
 * to maintain backwards compatibility.
 */

import salesPrompt from './salesPrompt.js';
import supportPrompt from './supportPrompt.js';
import ownerPrompt from './ownerPrompt.js';
import agentPromptBuilder from './agentPromptBuilder.js';
import systemPromptBuilder from './systemPromptBuilder.js';

const registry = new Map();

// Bootstrapping known prompts
registry.set('system.default', { key: 'system.default', template: systemPromptBuilder.build ? systemPromptBuilder.build() : '', meta: { role: 'system' } });
registry.set('prompt.sales.v1', { key: 'prompt.sales.v1', template: salesPrompt(), meta: { role: 'sales' } });
registry.set('prompt.support.v1', { key: 'prompt.support.v1', template: supportPrompt(), meta: { role: 'support' } });
registry.set('prompt.owner.v1', { key: 'prompt.owner.v1', template: ownerPrompt(), meta: { role: 'owner' } });

/**
 * Register a custom prompt
 */
export function registerPrompt({ key, template, meta = {} } = {}) {
  if (!key || !template) throw new Error('registerPrompt: key and template required');
  registry.set(key, { key, template, meta });
  return registry.get(key);
}

/**
 * Get prompt by agentName or intent fallback
 */
export function getPrompt({ agentName, intent, variant } = {}) {
  if (agentName) {
    // common mapping heuristics
    if (agentName.toLowerCase().includes('sales')) return registry.get('prompt.sales.v1').template;
    if (agentName.toLowerCase().includes('support')) return registry.get('prompt.support.v1').template;
    if (agentName === 'OwnerAssistantAgent') return registry.get('prompt.owner.v1').template;
  }
  if (intent) {
    // try to map intent to prompt
    const key = `prompt.${intent}.${variant || 'v1'}`;
    if (registry.has(key)) return registry.get(key).template;
  }
  // fallback to system prompt builder
  if (registry.has('system.default')) return registry.get('system.default').template;
  return '';
}

export default {
  registerPrompt,
  getPrompt,
  registry
};
