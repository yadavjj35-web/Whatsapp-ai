// path: /agents/AnalyticsAgent.js
/**
 * AnalyticsAgent
 * - Role: aggregate analytics for sales, conversations, agent performance
 * - Tools: analyticsTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'AnalyticsAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Executes analytics queries and prepares dashboards/reports',
  allowedTools: ['analyticsTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('AnalyticsAgent executing', { taskId: task.id, type });

    if (type === 'sales_summary') {
      const report = await tools.analyticsTools.getSalesSummary(input.timeframe || 'today');
      return { summary: 'Sales summary', report };
    }

    if (type === 'conversation_metrics') {
      const metrics = await tools.analyticsTools.getConversationMetrics(input.timeframe || '7d');
      return { summary: 'Conversation metrics', metrics };
    }

    return { summary: 'Unsupported Analytics task' };
  }
};

export default Agent;
