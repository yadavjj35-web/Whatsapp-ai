// path: /agents/NotificationAgent.js
/**
 * NotificationAgent
 * - Role: centralize notifications across channels
 * - Tools: notificationTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'NotificationAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Sends notifications through configured channels',
  allowedTools: ['notificationTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('NotificationAgent executing', { taskId: task.id, type });

    if (type === 'send_multichannel') {
      const { channels = ['whatsapp'], to, message } = input;
      const results = {};
      for (const ch of channels) {
        if (ch === 'whatsapp' && tools.notificationTools.whatsapp) {
          results.whatsapp = await tools.notificationTools.whatsapp({ to, text: message });
        }
        if (ch === 'email' && tools.notificationTools.email) {
          results.email = await tools.notificationTools.email({ to: input.email, subject: input.subject, html: message });
        }
      }
      return { summary: 'Notifications sent', results };
    }

    return { summary: 'Unsupported Notification task' };
  }
};

export default Agent;
