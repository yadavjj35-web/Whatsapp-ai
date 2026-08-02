// path: /agents/ConversationAgent.js
/**
 * ConversationAgent
 * - Role: interpret open text commands or messages and propose actions
 * - Tools: All relevant (via toolRegistry)
 */

import logger from '../utils/logger.js';
import memoryManager from '../memory/memoryManager.js';
import prompts from '../prompts/agentPromptBuilder.js';

const AGENT_NAME = 'ConversationAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Interprets free-form conversation and routes to relevant agents/tools',
  allowedTools: ['wooTools', 'crmTools', 'notificationTools', 'analyticsTools'],

  async execute(task, tools, context = {}) {
    const { type, input } = task;
    logger.info('ConversationAgent executing', { taskId: task.id, type });

    if (type === 'interpret_and_route') {
      // Simple heuristics: if message contains buy intent, call SalesAgent via orchestrator/taskPlanner externally
      const text = input.text || '';
      // Save context
      await memoryManager.conversationMemory.saveAgentMemory(task.id, { text });
      let action = 'noop';
      if (/buy|price|available|stock|order|purchase/i.test(text)) action = 'recommendation';
      if (/help|support|return|refund/i.test(text)) action = 'support';
      return { summary: 'Interpreted intent', intent: action, text };
    }

    return { summary: 'Unsupported Conversation task' };
  }
};

export default Agent;
