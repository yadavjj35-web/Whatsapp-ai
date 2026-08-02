// path: /agents/toolRouter.js
/**
 * Tool Router
 * - Receives a task and selects the correct agent or tool to execute it
 * - Agents should be implemented per module in /agents and tools in /tools
 *
 * Responsibilities:
 * - Validate task schema
 * - Enforce permissions/guardrails
 * - Call agent's execute or tool's call method
 */

import logger from '../utils/logger.js';
import agentRegistry from './agentRegistry.js';
import toolRegistry from '../tools/toolRegistry.js';
import security from '../security/permissionEngine.js';

async function routeTask(task = {}, context = {}) {
  if (!task || !task.agent || !task.type) throw new Error('Invalid task');

  // Authorization check - ensure orchestrator or owner has permission to run agent
  const allowed = security.isAgentAllowed(task.agent);
  if (!allowed) throw new Error(`Agent ${task.agent} is not allowed by security policy`);

  // Load agent
  const agent = agentRegistry.getAgent(task.agent);
  if (!agent) throw new Error(`Agent ${task.agent} not registered`);

  // Agent may declare allowed tools; inject tool caller
  const tools = toolRegistry.createToolContext({ agentName: task.agent });

  // Execute via agent method
  if (typeof agent.execute !== 'function') {
    throw new Error(`Agent ${task.agent} missing execute() method`);
  }

  // Agent executes with (task, tools, context)
  const result = await agent.execute(task, tools, context);

  // ToolRouter can also log or transform
  logger.info('ToolRouter executed task', { taskId: task.id, agent: task.agent, resultSummary: result && result.summary ? result.summary : null });

  return result;
}

export default { routeTask };
