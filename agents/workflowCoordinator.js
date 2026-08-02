// path: /agents/workflowCoordinator.js
/**
 * Workflow Coordinator
 * - Tracks workflows started by Orchestrator
 * - Stores state in-memory with optional hooks to persistent storage (future)
 * - Basic API: registerWorkflow, markTaskStarted/Succeeded/Failed, markWorkflowCompleted/Failed
 */

import EventEmitter from 'events';
import logger from '../utils/logger.js';

class WorkflowCoordinator extends EventEmitter {
  constructor() {
    super();
    this.workflows = new Map(); // id -> { context, plan, tasks: {taskId: state}, status }
  }

  async registerWorkflow(id, { context, plan }) {
    this.workflows.set(id, { id, context, plan, status: 'running', tasks: {}, createdAt: new Date() });
    logger.info('Workflow registered', { id });
    this.emit('workflow:registered', id);
    return id;
  }

  markTaskStarted(workflowId, task) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.tasks[task.id] = { status: 'running', startedAt: new Date() };
    this.emit('task:started', { workflowId, taskId: task.id });
  }

  markTaskSucceeded(workflowId, task, result) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.tasks[task.id] = { status: 'succeeded', result, finishedAt: new Date() };
    this.emit('task:succeeded', { workflowId, taskId: task.id, result });
  }

  markTaskFailed(workflowId, task, error) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.tasks[task.id] = { status: 'failed', error: (error && error.message) || error, finishedAt: new Date() };
    this.emit('task:failed', { workflowId, taskId: task.id, error });
  }

  async markWorkflowCompleted(id, result) {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.status = 'completed';
      wf.result = result;
      wf.completedAt = new Date();
      this.emit('workflow:completed', { id, result });
      logger.info('Workflow completed', { id });
    }
  }

  async markWorkflowFailed(id, reason) {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.status = 'failed';
      wf.failedAt = new Date();
      wf.failureReason = reason;
      this.emit('workflow:failed', { id, reason });
      logger.warn('Workflow failed', { id, reason });
    }
  }

  getWorkflow(id) {
    return this.workflows.get(id);
  }

  listActive() {
    return Array.from(this.workflows.values()).filter((w) => w.status === 'running');
  }
}

const workflowCoordinator = new WorkflowCoordinator();
export default workflowCoordinator;
