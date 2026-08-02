// path: /agents/OwnerAssistantAgent.js
/**
 * OwnerAssistantAgent
 * - Role: interpret owner commands, provide summaries and approvals
 * - Tools: crmTools, analyticsTools, notificationTools, n8n
 */

import logger from '../utils/logger.js';
import prompts from '../prompts/agentPromptBuilder.js';

const AGENT_NAME = 'OwnerAssistantAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Assist the owner with commands, approvals and summaries',
  allowedTools: ['crmTools', 'analyticsTools', 'notificationTools', 'n8n'],
  prompt: prompts.ownerPrompt(),

  async execute(task, tools, context = {}) {
    const { type, input } = task;
    logger.info('OwnerAssistantAgent executing', { taskId: task.id, type });

    if (type === 'summarize_sales') {
      const report = await tools.analyticsTools.getSalesSummary(input.timeframe || 'today');
      return { summary: 'Sales summary prepared', report };
    }

    if (type === 'request_approval') {
      // Persist approval request via CRM or workflow
      const approval = await tools.n8n?.triggerApproval?.(input) || { status: 'pending' };
      return { summary: 'Approval requested', approval };
    }

    return { summary: 'Unsupported OwnerAssistant task' };
  }
};

export default Agent;
