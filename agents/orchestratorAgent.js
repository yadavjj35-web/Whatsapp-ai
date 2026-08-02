// path: agents/orchestratorAgent.js
/**
 * Orchestrator Agent
 *
 * Responsible for:
 *  - Accepting high-level tasks/requests and turning them into durable workflows
 *  - Creating Workflow documents (models/Workflow)
 *  - Enqueuing tasks via queue/queueManager
 *  - Exposing an API for other services to start/cancel/inspect workflows
 *
 * The orchestrator uses the DurableWorkflowEngine (workflows/durableWorkflowEngine.js).
 */

import logger from '../utils/logger.js';
import engine from '../workflows/durableWorkflowEngine.js';
import Workflow from '../models/Workflow.js';
import queueManager from '../queue/queueManager.js';

class OrchestratorAgent {
  /**
   * Create and optionally start a new workflow.
   * options:
   *  - name, owner, correlationId, metadata, tasks: [{ id?, type, agent, input }]
   *  - startImmediately (default true)
   */
  async createAndStartWorkflow(options = {}) {
    if (!options || !Array.isArray(options.tasks) || options.tasks.length === 0) {
      throw new Error('createAndStartWorkflow requires tasks array');
    }
    const wf = await engine.createWorkflow({ ...options, startImmediately: false });
    if (options.startImmediately !== false) {
      await engine.startWorkflow(wf.workflowId);
    }
    logger.info('Orchestrator created workflow', { workflowId: wf.workflowId, tasks: wf.tasks.length });
    return wf;
  }

  /**
   * Enqueue a single task directly (without workflow persistence).
   * Useful for ad-hoc tasks.
   */
  async enqueueTask(task) {
    if (!task || !task.type || !task.agent) throw new Error('task must include type and agent');
    const payload = {
      id: task.id,
      type: task.type,
      agent: task.agent,
      input: task.input,
      metadata: task.metadata || {}
    };
    const res = await queueManager.enqueueTask(payload);
    logger.debug('Orchestrator enqueued ad-hoc task', { taskId: payload.id, queue: res.queueName });
    return res;
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId, reason = 'cancelled by orchestrator') {
    const wf = await engine.cancelWorkflow(workflowId, reason);
    logger.info('Orchestrator cancelled workflow', { workflowId, reason });
    return wf;
  }

  /**
   * Inspect workflow
   */
  async getWorkflow(workflowId) {
    const wf = await Workflow.findOne({ workflowId }).lean();
    return wf;
  }

  /**
   * Recover and resume in-progress workflows (delegates to engine.recoverStaleWorkflows)
   */
  async recoverStale({ thresholdMs } = {}) {
    const count = await engine.recoverStaleWorkflows({ thresholdMs });
    logger.info('Orchestrator recovered stale workflows', { recoveredCount: count });
    return count;
  }
}

const orchestrator = new OrchestratorAgent();
export default orchestrator;
