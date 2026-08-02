// path: /agents/FollowUpAgent.js
/**
 * FollowUpAgent
 * - Role: schedule and send follow-ups, nurture leads
 * - Tools: crmTools, notificationTools, n8n
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'FollowUpAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Schedules and executes follow-up sequences for leads/customers',
  allowedTools: ['crmTools', 'notificationTools', 'n8n'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('FollowUpAgent executing', { taskId: task.id, type });

    if (type === 'create_followup') {
      const sequence = input.sequence || [];
      // Save to CRM and schedule via n8n
      const lead = await tools.crmTools.getOrCreateLead({ phone: input.phone });
      const workflowId = await tools.n8n?.createFollowUpWorkflow?.(lead.id, sequence);
      return { summary: 'Follow-up created', leadId: lead.id, workflowId };
    }

    return { summary: 'Unsupported FollowUp task' };
  }
};

export default Agent;
