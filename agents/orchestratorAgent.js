// path: /agents/orchestratorAgent.js
/**
 * Central AI Executive - Orchestrator Agent
 * Responsibilities:
 * - Accept high-level owner commands
 * - Break tasks into smaller tasks using taskPlanner
 * - Route tasks to appropriate agents via toolRouter
 * - Monitor progress via workflowCoordinator
 * - Aggregate results and return final output
 *
 * This module exposes a single class OrchestratorAgent with an async `execute` method.
 */

import EventEmitter from 'events';
import logger from '../utils/logger.js';
import taskPlanner from './taskPlanner.js';
import toolRouter from './toolRouter.js';
import workflowCoordinator from './workflowCoordinator.js';

class OrchestratorAgent extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.name = 'orchestrator';
    this.description = 'Central AI Executive responsible for decomposing and routing tasks to agents';
    this.timeoutMs = opts.timeoutMs || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Execute a high-level task.
   * @param {Object} context - { owner, command, payload, user }
   * @returns {Object} result - aggregated result
   */
  async execute(context = {}) {
    const start = Date.now();
    const id = `orch-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    logger.info('Orchestrator starting execution', { id, context: { command: context.command } });

    try {
      // 1. Plan tasks
      const plan = await taskPlanner.plan(context);
      logger.info('TaskPlanner produced plan', { id, planSummary: plan.summary || null });

      // 2. Route tasks to tools/agents
      const tasks = plan.tasks || [];
      const results = [];

      // Register with workflow coordinator for tracking
      await workflowCoordinator.registerWorkflow(id, { context, plan });

      for (const task of tasks) {
        // check for cancellation or approval requirements
        workflowCoordinator.markTaskStarted(id, task);

        try {
          const result = await toolRouter.routeTask(task, { orchestratorId: id });
          results.push({ taskId: task.id, success: true, result });
          workflowCoordinator.markTaskSucceeded(id, task, result);
        } catch (err) {
          logger.error('ToolRouter task error', { id, taskId: task.id, error: err.message });
          results.push({ taskId: task.id, success: false, error: err.message });
          workflowCoordinator.markTaskFailed(id, task, err);
          // Decide whether to continue or abort based on plan policy
          if (plan.abortOnFailure) {
            throw new Error(`Aborting plan due to task failure: ${task.id}`);
          }
        }
      }

      // 3. Aggregate
      const finalResult = { id, command: context.command, results, durationMs: Date.now() - start };

      await workflowCoordinator.markWorkflowCompleted(id, finalResult);
      logger.info('Orchestrator completed execution', { id, durationMs: finalResult.durationMs });

      return finalResult;
    } catch (err) {
      logger.error('Orchestrator execution error', { id, error: err.message });
      await workflowCoordinator.markWorkflowFailed(id, { error: err.message });
      throw err;
    }
  }
}

const orchestrator = new OrchestratorAgent();
export default orchestrator;
