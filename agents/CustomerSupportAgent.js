// path: /agents/CustomerSupportAgent.js
/**
 * CustomerSupportAgent
 * - Role: handle customer support queries, gather details, escalate to human/owner if needed
 * - Allowed tools: crmTools, notificationTools, wooTools
 */

import logger from '../utils/logger.js';
import prompts from '../prompts/agentPromptBuilder.js';
import memoryManager from '../memory/memoryManager.js';

const AGENT_NAME = 'CustomerSupportAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Handles customer support interactions and escalations',
  allowedTools: ['crmTools', 'notificationTools', 'wooTools'],
  prompt: prompts.supportPrompt(),
  guardrails: {
    privacy: true,
    escalateOnRefund: true
  },

  async execute(task, tools, context = {}) {
    const { type, input } = task;
    logger.info('CustomerSupportAgent executing', { taskId: task.id, type });

    if (type === 'handle_ticket') {
      // Try to find order info
      const { orderId, phone } = input;
      let order = null;
      if (orderId && tools.crmTools && tools.crmTools.getOrder) {
        order = await tools.crmTools.getOrder(orderId).catch(() => null);
      }

      // Create a ticket in CRM
      const ticket = await tools.crmTools.createTicket({ phone, order, issue: input.issue });
      await memoryManager.conversationMemory.saveAgentMemory(task.id, { ticket });

      // Send acknowledgement
      if (tools.notificationTools && phone) {
        await tools.notificationTools.whatsapp({ to: phone, text: `We received your support request. Ticket #${ticket.id}` });
      }

      return { summary: 'Ticket created', ticket };
    }

    return { summary: 'No action', reason: 'Unsupported task type' };
  }
};

export default Agent;
