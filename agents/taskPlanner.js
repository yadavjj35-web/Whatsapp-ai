// path: /agents/taskPlanner.js
/**
 * Task Planner
 * - Receives an owner command and produces a plan: an array of tasks with minimal metadata
 * - Tasks include id, type, agent, input, requiresApproval flags, and priority
 *
 * This planner uses rule-based decomposition and is designed to be deterministic and auditable.
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * plan(context)
 * context: { owner, command (string), payload (object), user }
 */
async function plan(context = {}) {
  const { command = '', payload = {} } = context;
  const id = uuidv4();

  // Basic mapping of keywords to agents/tools
  const normalized = command.toLowerCase();

  // Default structure
  const plan = {
    id,
    summary: `Plan for: ${command}`,
    abortOnFailure: false,
    tasks: []
  };

  // Example rules - extensible in future
  if (/sales report|today's sales|daily sales|sales report/i.test(command)) {
    plan.tasks.push({
      id: uuidv4(),
      type: 'generate_report',
      agent: 'ReportingAgent',
      input: { timeframe: payload.timeframe || 'today', metrics: payload.metrics || ['revenue', 'orders'] },
      requiresApproval: false,
      priority: 'high'
    });
  }

  if (/search (product|products)|find product/i.test(command)) {
    plan.tasks.push({
      id: uuidv4(),
      type: 'product_search',
      agent: 'WooCommerceAgent',
      input: { query: payload.query || command.match(/search (.+)/i)?.[1] || command },
      requiresApproval: false,
      priority: 'medium'
    });
  }

  if (/low stock|restock|find low stock/i.test(command)) {
    plan.tasks.push({
      id: uuidv4(),
      type: 'inventory_audit',
      agent: 'InventoryAgent',
      input: { threshold: payload.threshold || 5 },
      requiresApproval: true,
      priority: 'high'
    });
    plan.abortOnFailure = false;
  }

  // Generic fallback: create a conversation agent task to interpret
  if (!plan.tasks.length) {
    plan.tasks.push({
      id: uuidv4(),
      type: 'interpret_and_route',
      agent: 'ConversationAgent',
      input: { text: command, payload },
      requiresApproval: false,
      priority: 'low'
    });
  }

  logger.info('TaskPlanner created plan', { planId: id, taskCount: plan.tasks.length });
  return plan;
}

export default { plan };
