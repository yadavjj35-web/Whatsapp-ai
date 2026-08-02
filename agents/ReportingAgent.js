// path: /agents/ReportingAgent.js
/**
 * ReportingAgent
 * - Role: produce reports (sales, inventory, performance)
 * - Tools: analyticsTools, crmTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'ReportingAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Generates business reports',
  allowedTools: ['analyticsTools', 'crmTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('ReportingAgent executing', { taskId: task.id, type });

    if (type === 'generate_report') {
      const report = await tools.analyticsTools.generateReport(input);
      return { summary: 'Report generated', report };
    }

    return { summary: 'Unsupported Reporting task' };
  }
};

export default Agent;
