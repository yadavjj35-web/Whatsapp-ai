// path: /agents/SalesAgent.js
/**
 * SalesAgent
 * - Role: product recommendation, cross-sell, upsell, close deals
 * - Allowed tools: wooTools, notificationTools, crmTools, paymentTools
 * - Contains prompt, guardrails, memory hooks
 */

import logger from '../utils/logger.js';
import prompts from '../prompts/agentPromptBuilder.js';
import memoryManager from '../memory/memoryManager.js';

const AGENT_NAME = 'SalesAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Agent focused on sales recommendations, upsell and cross-sell',
  allowedTools: ['wooTools', 'crmTools', 'notificationTools', 'paymentTools'],
  prompt: prompts.salesPrompt(),
  guardrails: {
    doNotFabricate: true,
    confirmPriceFromWoo: true
  },

  /**
   * Execute a task assigned to SalesAgent
   * task: { id, type, input }
   * tools: created from toolRegistry
   */
  async execute(task, tools, context = {}) {
    const { type, input } = task;
    logger.info('SalesAgent executing task', { taskId: task.id, type, input });

    // Basic implementations for common task types
    if (type === 'product_search' || type === 'recommend_products') {
      // Use wooTools.search
      const results = await tools.wooTools.search({ q: input.query || input.keywords || '' , limit: input.limit || 3 });
      // Persist in memory
      await memoryManager.conversationMemory.saveAgentMemory(task.id, { results });
      return { summary: `Found ${results.length} products`, products: results };
    }

    if (type === 'create_offer') {
      // Create a WhatsApp message with suggested products
      const recs = input.recommendations || [];
      const message = `Recommended products:\n${recs.map((r) => `- ${r.name} (${r.price})`).join('\n')}`;
      // Optionally send notification
      if (tools.notificationTools && input.notifyTo) {
        await tools.notificationTools.whatsapp({ to: input.notifyTo, text: message });
      }
      return { summary: 'Offer created and sent', message };
    }

    // Fallback: intent interpretation via prompt is handled elsewhere
    return { summary: 'No action taken', reason: `Unsupported SalesAgent task type: ${type}` };
  }
};

export default Agent;
