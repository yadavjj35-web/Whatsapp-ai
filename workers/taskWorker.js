// path: workers/taskWorker.js
/**
 * workers/taskWorker.js
 *
 * BullMQ Worker that consumes 'tasks' queue, executes tasks using the
 * agent toolRouter / agentRegistry, and updates workflow persistence.
 *
 * Responsibilities:
 *  - Claim job and set progress
 *  - Validate job payload
 *  - Execute via agentRegistry/toolRouter
 *  - Update Workflow model with task status/result
 *  - Emit structured logs and audit events
 *  - Handle retries, failures, and dead-letter handling
 *
 * Requirements:
 *  - Requires queue/redisClient.js and queue/queueManager.js to be initialized
 *  - Requires agents/toolRouter.js and agents/agentRegistry.js to be present
 *  - Requires models/Workflow.js for persistence
 *
 * Environment variables:
 *  - WORKER_CONCURRENCY (default 4)
 *  - QUEUE_NAME_TASKS (default 'tasks')
 *  - WORKER_LOCK_TTL_MS (default 60000)
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

const QUEUE_NAME_TASKS = process.env.QUEUE_NAME_TASKS || 'tasks';
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'waai';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 4);
const WORKER_LOCK_TTL_MS = Number(process.env.WORKER_LOCK_TTL_MS || 60000);

const qualifiedQueueName = `${QUEUE_PREFIX}:${QUEUE_NAME_TASKS}`;

/**
 * Execute a single job
 */
async function executeJob(job) {
  const jobId = job.id;
  const jobName = job.name;
  const payload = job.data || {};
  const workflowId = payload.workflowId || null;
  const taskId = payload.id || uuidv4();

  const summary = jobSummary(jobName, jobId, workflowId);
  logger.info('Worker picked job', { summary });

  // Basic validation
  if (!payload || !payload.type || !payload.agent) {
    const err = new Error('Invalid job payload: missing type or agent');
    logger.error('Invalid job payload', { jobId, payload });
    throw err;
  }

  const agentName = payload.agent;

  // Load agent
  const agent = agentRegistry.getAgent(agentName);
  if (!agent) {
    const err = new Error(`Agent not registered: ${agentName}`);
    logger.error('Agent not found', { agentName, jobId });
    // Update workflow if attached
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.appendLog('error', 'Agent not found', { agentName, jobId });
          await wf.updateTask(taskId, { status: 'failed', error: `Agent ${agentName} not found`, finishedAt: new Date() });
        }
      } catch (e) {
        logger.warn('Failed to update workflow for missing agent', { workflowId, error: e.message });
      }
    }
    throw err;
  }

  // Create tools context for the agent
  const tools = toolRegistry.createToolContext({ agentName });

  // Update workflow task -> running
  if (workflowId) {
    try {
      const wf = await Workflow.findOne({ workflowId });
      if (wf) {
        await wf.updateTask(taskId, { status: 'running', startedAt: new Date() });
        await wf.appendLog('info', 'Task started', { taskId, agentName, jobId });
      }
    } catch (err) {
      logger.warn('Failed to mark task running in workflow', { workflowId, taskId, error: err.message });
    }
  }

  // Execute agent with a timeout monitored at application level if needed
  let result = null;
  try {
    // Agent execute() should be async and handle its own errors
    if (typeof agent.execute !== 'function') {
      throw new Error(`Agent ${agentName} missing execute()`);
    }

    // Allow agent.execute to receive task payload, tools, and job meta
    result = await agent.execute(payload, tools, { jobId, taskId, workflowId });

    logger.info('Agent execution succeeded', { agentName, taskId, jobId, workflowId });

    // Update workflow with success
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.updateTask(taskId, { status: 'succeeded', result, finishedAt: new Date() });
          await wf.appendLog('info', 'Task succeeded', { taskId, agentName, jobId });
        }
      } catch (err) {
        logger.warn('Failed to persist task success to workflow', { workflowId, taskId, error: err.message });
      }
    }

    return result;
  } catch (err) {
    logger.error('Agent execution failed', { agentName, taskId, jobId, workflowId, error: err && (err.message || String(err)) });

    // Update workflow with failure
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.updateTask(taskId, { status: 'failed', error: { message: err.message || String(err), stack: err.stack }, finishedAt: new Date() });
          await wf.appendLog('error', 'Task failed', { taskId, agentName, jobId, error: err.message });
        }
      } catch (e) {
        logger.warn('Failed to persist task failure to workflow', { workflowId, taskId, error: e.message });
      }
    }

    // Rethrow to allow BullMQ to handle attempts/backoff
    throw err;
  }
}

/**
 * Create and start the worker instance.
 * Returns the Worker instance.
 */
function startWorker() {
  logger.info('Starting task worker', { queue: qualifiedQueueName, concurrency: CONCURRENCY });

  const connection = redisClient.getRedis();

  const worker = new Worker(
    qualifiedQueueName,
    async (job) => {
      // job processor
      // Update job progress at start
      try {
        await job.updateProgress({ status: 'started', ts: Date.now() });
      } catch (e) {
        // non-fatal
      }
      const result = await executeJob(job);
      try {
        await job.updateProgress({ status: 'finished', ts: Date.now() });
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

  // Worker event handlers for observability and logging
  worker.on('active', (job) => {
    logger.info('Job active', { id: job.id, name: job.name, queue: qualifiedQueueName });
  });

  worker.on('completed', (job, returnvalue) => {
    logger.info('Job completed', { id: job.id, name: job.name, queue: qualifiedQueueName });
  });

  worker.on('failed', async (job, err) => {
    logger.error('Job failed', { id: job?.id, name: job?.name, queue: qualifiedQueueName, error: err?.message });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: qualifiedQueueName, error: err?.message });
  });

  // Ensure graceful shutdown when requested
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

  // Attach shutdown helper for external orchestrator
  worker.shutdown = shutdown;

  return worker;
}

export default {
  startWorker
};
