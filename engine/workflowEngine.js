// path: /engine/workflowEngine.js
/**
 * Workflow Engine
 * - Orchestrates execution of multi-step workflows with state and retry
 */

import executionQueue from './executionQueue.js';
import stateMachine from './stateMachine.js';
import retryManager from './retryManager.js';
import errorRecovery from './errorRecovery.js';
import logger from '../utils/logger.js';

async function start(workflow) {
  // workflow: { id, tasks: [] }
  logger.info('WorkflowEngine starting', { workflowId: workflow.id });
  stateMachine.initialize(workflow);
  for (const task of workflow.tasks) {
    await executionQueue.enqueue(async () => {
      try {
        stateMachine.transition(task.id, 'running');
        await workflow.executeTask(task);
        stateMachine.transition(task.id, 'succeeded');
      } catch (err) {
        logger.error('WorkflowEngine task error', { taskId: task.id, error: err.message });
        const recovered = await retryManager.retry(() => workflow.executeTask(task));
        if (!recovered) {
          stateMachine.transition(task.id, 'failed');
          await errorRecovery.handle(task, err);
        }
      }
    });
  }
  return true;
}

export default { start };
