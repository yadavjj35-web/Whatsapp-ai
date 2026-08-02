// path: /agents/CRMLeadAgent.js
/**
 * CRMLeadAgent
 * - Role: manage leads, qualify and update CRM pipelines
 * - Tools: crmTools, notificationTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'CRMLeadAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Manages leads in CRM and coordinates follow-ups',
  allowedTools: ['crmTools', 'notificationTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('CRMLeadAgent executing', { taskId: task.id, type });

    if (type === 'qualify_lead') {
      const lead = await tools.crmTools.getOrCreateLead(input);
      const qualification = await tools.crmTools.qualifyLead(lead.id, input.criteria);
      return { summary: 'Lead qualified', leadId: lead.id, qualification };
    }
    return { summary: 'Unsupported CRM task' };
  }
};

export default Agent;
