// path: workflows/durableWorkflowEngine.js
/**
 * Durable Workflow Engine
 *
 * Responsibilities:
 *  - Create persistent workflow documents (models/Workflow)
 *  - Add tasks to workflows and enqueue them using queue/queueManager
 *  - Provide helpers to mark workflows completed/failed
 *  - Support recovery: resume pending tasks by enqueuing them
 *
 * Usage:
 *  const engine = new DurableWorkflowEngine();
 *  await engine.createAndStart({ workflowId, name, owner, tasks });
 *
 * Notes:
 *  - Tasks are objects: { id, type, agent, input, metadata }
 *  - Each task enqueued will be processed by workers/taskWorker.js
 */

import logger from '../utils/logger.js';
import Workflow from '../models/Workflow.js';
import queueManager from '../queue/queueManager.js';
import { generateJobId } from '../queue/queueUtils.js';
import { v4 as uuidv4 } from 'uuid';

class DurableWorkflowEngine {
  constructor(opts = {}) {
    this.queueName = opts.queueName || process.env.QUEUE_NAME_TASKS || 'tasks';
  }

  /**
   * Create a workflow document and persist it.
   * Does not enqueue tasks until startWorkflow is called (unless startImmediately true).
   *
   * options:
   *  - workflowId (optional): if not provided a UUID will be generated
   *  - name: workflow friendly name
   *  - owner: owner identifier (user/email/phone)
   *  - correlationId: external correlation (order id etc)
   *  - metadata: freeform
   *  - tasks: array of task payloads (each { id?, type, agent, input })
   *  - startImmediately: boolean -> if true, will call startWorkflow after creation
   */
  async createWorkflow(options = {}) {
    const workflowId = options.workflowId || `wf_${Date.now()}_${uuidv4()}`;
    const name = options.name || `workflow-${workflowId}`;
    const owner = options.owner || 'system';
    const correlationId = options.correlationId;
    const metadata = options.metadata || {};
    const tasks = (options.tasks || []).map((t) => ({
      id: t.id || generateJobId(t.type, workflowId, t.input || {}),
      type: t.type,
      agent: t.agent,
      input: t.input || {},
      status: 'pending'
    }));

    const wf = await Workflow.createWorkflow({ workflowId, name, owner, correlationId, metadata, tasks });
    logger.info('Workflow persisted', { workflowId, name, owner, tasksCount: tasks.length });

    if (options.startImmediately) {
      await this.startWorkflow(workflowId);
    }

    return wf;
  }

  /**
   * Start a persisted workflow by enqueuing its pending tasks.
   * Tasks already marked 'pending' will be enqueued.
   */
  async startWorkflow(workflowId) {
    const wf = await Workflow.findOne({ workflowId });
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    if (wf.status === 'running') {
      logger.warn('Workflow already running', { workflowId });
      return wf;
    }

    // mark workflow running
    wf.status = 'running';
    wf.startedAt = new Date();
    await wf.save();
    await wf.appendLog('info', 'Workflow started', { workflowId });

    // Enqueue pending tasks
    const pendingTasks = wf.tasks.filter((t) => t.status === 'pending');
    for (const task of pendingTasks) {
      const jobPayload = {
        id: task.id,
        type: task.type,
        agent: task.agent,
        input: task.input,
        workflowId
      };
      try {
        await queueManager.enqueueTask(jobPayload);
        logger.info('Enqueued task', { workflowId, taskId: task.id, taskType: task.type });
        // update attempts in workflow doc (initial attempt recorded)
        await wf.updateTask(task.id, { attempts: (task.attempts || 0) + 1, status: 'pending' });
      } catch (err) {
        logger.error('Failed to enqueue task', { workflowId, taskId: task.id, error: err.message });
        await wf.appendLog('error', 'Failed to enqueue task', { taskId: task.id, error: err.message });
      }
    }

    return wf;
  }

  /**
   * Re-enqueue a specific task (retry) — respects idempotency if jobId used previously.
   */
  async retryTask(workflowId, taskId) {
    const wf = await Workflow.findOne({ workflowId });
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);
    const task = wf.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in workflow ${workflowId}`);

    // reset task state
    task.status = 'pending';
    task.error = undefined;
    task.result = undefined;
    task.startedAt = undefined;
    task.finishedAt = undefined;
    task.attempts = (task.attempts || 0) + 1;
    await wf.save();

    // enqueue
    const jobPayload = {
      id: task.id,
      type: task.type,
      agent: task.agent,
      input: task.input,
      workflowId
    };
    await queueManager.enqueueTask(jobPayload);
    await wf.appendLog('info', 'Task retried', { taskId, workflowId });
    return wf;
  }

  /**
   * Mark workflow as completed if all tasks are succeeded, else mark failed
   */
  async checkAndFinalize(workflowId) {
    const wf = await Workflow.findOne({ workflowId });
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    const anyFailed = wf.tasks.some((t) => t.status === 'failed');
    const anyPending = wf.tasks.some((t) => t.status === 'pending' || t.status === 'running');

    if (anyFailed) {
      await wf.markFailed({ reason: 'One or more tasks failed' });
      return wf;
    }
    if (anyPending) {
      // still running
      return wf;
    }
    // all succeeded
    await wf.markCompleted({ message: 'All tasks succeeded' });
    return wf;
  }

  /**
   * Cancel a workflow: mark all non-complete tasks cancelled and set status
   */
  async cancelWorkflow(workflowId, reason = 'cancelled by user') {
    const wf = await Workflow.findOne({ workflowId });
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);
    for (const t of wf.tasks) {
      if (t.status === 'pending' || t.status === 'running') {
        t.status = 'cancelled';
        t.finishedAt = new Date();
        t.error = { message: reason };
      }
    }
    wf.status = 'cancelled';
    wf.completedAt = new Date();
    await wf.appendLog('warn', 'Workflow cancelled', { reason });
    await wf.save();
    return wf;
  }

  /**
   * Recover stale workflows on startup: re-enqueue pending tasks for workflows
   * that are in 'running' state but have tasks older than threshold without progress.
   *
   * thresholdMs: age in ms to consider a task stale (default 10 minutes)
   */
  async recoverStaleWorkflows({ thresholdMs = 10 * 60 * 1000 } = {}) {
    const cutoff = new Date(Date.now() - thresholdMs);
    const staleWorkflows = await Workflow.find({
      status: 'running',
      'tasks.startedAt': { $lte: cutoff }
    }).limit(100);

    logger.info('Recovering stale workflows', { staleCount: staleWorkflows.length });

    for (const wf of staleWorkflows) {
      for (const task of wf.tasks) {
        if ((task.status === 'running' && task.startedAt && task.startedAt <= cutoff) || task.status === 'pending') {
          // re-enqueue
          try {
            const jobPayload = {
              id: task.id,
              type: task.type,
              agent: task.agent,
              input: task.input,
              workflowId: wf.workflowId
            };
            await queueManager.enqueueTask(jobPayload);
            await wf.appendLog('info', 'Recovered and re-enqueued task', { taskId: task.id });
          } catch (err) {
            logger.error('Failed to re-enqueue stale task', { workflowId: wf.workflowId, taskId: task.id, error: err.message });
          }
        }
      }
    }

    return staleWorkflows.length;
  }
}

const engine = new DurableWorkflowEngine();
export default engine;
