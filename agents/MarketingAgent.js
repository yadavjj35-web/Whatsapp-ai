// path: /agents/MarketingAgent.js
/**
 * MarketingAgent
 * - Role: create campaigns, schedule messages, aggregate analytics
 * - Tools: notificationTools, analyticsTools, n8n (via integrations)
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'MarketingAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Handles marketing automation, campaign generation and triggers',
  allowedTools: ['notificationTools', 'analyticsTools', 'n8n'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('MarketingAgent executing', { taskId: task.id, type });

    if (type === 'start_campaign') {
      const campaign = input.campaign || {};
      const res = await tools.analyticsTools.createCampaignMetrics(campaign).catch(() => null);
      // Trigger via n8n workflow if configured
      if (tools.n8n && input.workflowId) {
        await tools.n8n.triggerWorkflow(input.workflowId, { campaign });
      }
      return { summary: 'Campaign initiated', campaign, metrics: res };
    }

    return { summary: 'Unsupported Marketing task' };
  }
};

export default Agent;
