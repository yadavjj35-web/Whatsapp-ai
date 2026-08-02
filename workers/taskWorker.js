// path: workers/taskWorker.js
/**
 * workers/taskWorker.js (updated)
 *
 * Adds audit logging on job success/failure using utils/auditLogger.
 * Assumes agentRegistry, toolRegistry, Workflow model already present.
 */

import { Worker } from 'bullmq';
import redisClient from '../queue/redisClient.js';
import queueManager from '../queue/queueManager.js';
import logger from '../utils/logger.js';
import agentRegistry from '../agents/agentRegistry.js';
import toolRegistry from '../tools/toolRegistry.js';
import Workflow from '../models/Workflow.js';
import { jobSummary } from '../queue/queueUtils.js';
import { v4 as uuidv4 } from 'uuid';
import auditLogger from '../utils/auditLogger.js';

const QUEUE_NAME_TASKS = process.env.QUEUE_NAME_TASKS || 'tasks';
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'waai';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 4);
const WORKER_LOCK_TTL_MS = Number(process.env.WORKER_LOCK_TTL_MS || 60000);

const qualifiedQueueName = `${QUEUE_PREFIX}:${QUEUE_NAME_TASKS}`;

async function executeJob(job) {
  const jobId = job.id;
  const jobName = job.name;
  const payload = job.data || {};
  const workflowId = payload.workflowId || null;
  const taskId = payload.id || uuidv4();

  const summary = jobSummary(jobName, jobId, workflowId);
  logger.info('Worker picked job', { summary });

  if (!payload || !payload.type || !payload.agent) {
    const err = new Error('Invalid job payload: missing type or agent');
    logger.error('Invalid job payload', { jobId, payload });
    throw err;
  }

  const agent = agentRegistry.getAgent(payload.agent);
  if (!agent) {
    const err = new Error(`Agent not registered: ${payload.agent}`);
    logger.error('Agent not found', { agentName: payload.agent, jobId });
    // update workflow
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.updateTask(taskId, { status: 'failed', error: `Agent ${payload.agent} not found`, finishedAt: new Date() });
          await wf.appendLog('error', 'Agent not found', { taskId, jobId });
          await auditLogger.writeAudit({ category: 'workflow', action: 'task_agent_missing', actor: 'worker', message: `Agent ${payload.agent} not found`, details: { workflowId, taskId, jobId }, correlationId: workflowId });
        }
      } catch (e) {
        logger.warn('Failed to update workflow for missing agent', { workflowId, error: e.message });
      }
    }
    throw err;
  }

  const tools = await toolRegistry.createToolContext({ agentName: payload.agent });

  if (workflowId) {
    try {
      const wf = await Workflow.findOne({ workflowId });
      if (wf) {
        await wf.updateTask(taskId, { status: 'running', startedAt: new Date() });
        await wf.appendLog('info', 'Task started', { taskId, agent: payload.agent, jobId });
      }
    } catch (err) {
      logger.warn('Failed to mark task running in workflow', { workflowId, taskId, error: err.message });
    }
  }

  try {
    const result = await agent.execute(payload, tools, { jobId, taskId, workflowId });

    // success updates
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.updateTask(taskId, { status: 'succeeded', result, finishedAt: new Date() });
          await wf.appendLog('info', 'Task succeeded', { taskId, agent: payload.agent, jobId });
        }
      } catch (err) {
        logger.warn('Failed to persist task success to workflow', { workflowId, taskId, error: err.message });
      }
    }

    // Audit entry
    try {
      await auditLogger.writeAudit({
        category: 'workflow',
        action: 'task_succeeded',
        actor: `agent:${payload.agent}`,
        actorType: 'agent',
        message: `Task ${taskId} succeeded`,
        details: { jobId, workflowId, taskId, result },
        correlationId: workflowId
      });
    } catch (e) {
      // ignore
    }

    return result;
  } catch (err) {
    logger.error('Agent execution failed', { agent: payload.agent, taskId, jobId, workflowId, error: err && (err.message || String(err)) });

    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.updateTask(taskId, { status: 'failed', error: { message: err.message || String(err), stack: err.stack }, finishedAt: new Date() });
          await wf.appendLog('error', 'Task failed', { taskId, agent: payload.agent, jobId, error: err.message });
        }
      } catch (e) {
        logger.warn('Failed to persist task failure to workflow', { workflowId, taskId, error: e.message });
      }
    }

    // Audit failure
    try {
      await auditLogger.writeAudit({
        category: 'workflow',
        action: 'task_failed',
        actor: `agent:${payload.agent}`,
        actorType: 'agent',
        message: `Task ${taskId} failed`,
        details: { jobId, workflowId, taskId, error: err && (err.message || String(err)) },
        correlationId: workflowId
      });
    } catch (e) {
      // ignore
    }

    throw err;
  }
}

function startWorker() {
  logger.info('Starting task worker', { queue: qualifiedQueueName, concurrency: CONCURRENCY });
  const connection = redisClient.getRedis();

  const worker = new Worker(
    qualifiedQueueName,
    async (job) => {
      try {
        await job.updateProgress({ status: 'started', ts: Date.now() }).catch(() => {});
      } catch (e) {
        // ignore
      }
      const result = await executeJob(job);
      try {
        await job.updateProgress({ status: 'finished', ts: Date.now() }).catch(() => {});
      } catch (e) {
        // ignore
      }
      return result;
    },
    {
      connection,
      concurrency: CONCURRENCY,
      lockDuration: WORKER_LOCK_TTL_MS
    }
  );

  worker.on('active', (job) => logger.info('Job active', { id: job.id, name: job.name, queue: qualifiedQueueName }));
  worker.on('completed', (job) => logger.info('Job completed', { id: job.id, name: job.name, queue: qualifiedQueueName }));
  worker.on('failed', async (job, err) => {
    logger.error('Job failed', { id: job?.id, name: job?.name, queue: qualifiedQueueName, error: err?.message });
  });
  worker.on('error', (err) => logger.error('Worker error', { queue: qualifiedQueueName, error: err?.message }));

  async function shutdown({ timeoutMs = 30000 } = {}) {
    logger.info('Shutting down worker', { queue: qualifiedQueueName });
    try {
      await worker.close();
      logger.info('Worker closed');
    } catch (err) {
      logger.error('Error closing worker', { error: err.message });
      try {
        await worker.disconnect();
      } catch (e) {
        logger.warn('Worker disconnect failed', { error: e.message });
      }
    }
  }

  worker.shutdown = shutdown;
  return worker;
}

export default {
  startWorker
};
