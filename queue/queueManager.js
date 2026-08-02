// path: queue/queueManager.js
/**
 * BullMQ Queue Manager
 *
 * Provides a production-ready wrapper around BullMQ for:
 *  - Creating named queues
 *  - Scheduling jobs
 *  - Enqueueing tasks with idempotency and job options
 *  - Exposing metrics and graceful shutdown
 *
 * Relies on queue/redisClient.js for a shared Redis connection (ioredis).
 *
 * Environment variables:
 *  - QUEUE_NAME_TASKS (default: 'tasks')
 *  - QUEUE_DEFAULT_ATTEMPTS (default: 5)
 *  - QUEUE_CONCURRENCY (worker concurrency - used by workers)
 *  - QUEUE_PREFIX (optional namespace prefix)
 */

import { Queue, QueueScheduler } from 'bullmq';
import crypto from 'crypto';
import redisClient from './redisClient.js';
import logger from '../utils/logger.js';
import { generateJobId, defaultJobOptions } from './queueUtils.js';

const DEFAULT_TASK_QUEUE = process.env.QUEUE_NAME_TASKS || 'tasks';
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'waai'; // namespace prefix for multiple environments

// hold created queues & schedulers to allow shutdown
const queues = new Map();
const schedulers = new Map();

/**
 * Build BullMQ queue with common options
 */
function createQueue(queueName = DEFAULT_TASK_QUEUE) {
  const qualifiedName = `${QUEUE_PREFIX}:${queueName}`;
  if (queues.has(qualifiedName)) return queues.get(qualifiedName);

  const connection = redisClient.getRedis();
  const queue = new Queue(qualifiedName, {
    connection,
    defaultJobOptions: defaultJobOptions()
  });

  // Create a scheduler for delayed jobs, retries, stuck jobs handling
  const scheduler = new QueueScheduler(qualifiedName, { connection });

  queues.set(qualifiedName, queue);
  schedulers.set(qualifiedName, scheduler);

  // Log creation
  logger.info('Queue created', { queue: qualifiedName });

  return queue;
}

/**
 * Enqueue a task (job) into a named queue
 *
 * taskData: { id, type, agent, input, workflowId, metadata }
 * opts: optional job options override
 */
async function enqueueTask(taskData = {}, opts = {}) {
  if (!taskData || !taskData.type) {
    throw new Error('Invalid taskData: missing type');
  }
  const queue = createQueue(DEFAULT_TASK_QUEUE);
  const jobName = String(taskData.type);
  // generate deterministic jobId if id provided else based on content
  const jobId = taskData.id || generateJobId(jobName, taskData.workflowId || '', taskData.input || {});
  const jobOptions = { ...defaultJobOptions(), ...opts };

  // Avoid duplicate jobs by jobId -- BullMQ will ensure idempotency by jobId uniqueness
  logger.debug('Enqueueing task', { jobName, jobId, workflowId: taskData.workflowId });

  const job = await queue.add(jobName, taskData, { jobId, ...jobOptions });

  logger.info('Task enqueued', { jobName, jobId, queue: queue.name });
  return { jobId: job.id, queueName: queue.name };
}

/**
 * Schedule a delayed task
 */
async function scheduleTask(taskData = {}, delayMs = 0, opts = {}) {
  const delay = Math.max(0, Number(delayMs) || 0);
  const effectiveOpts = { ...opts, delay };
  return enqueueTask(taskData, effectiveOpts);
}

/**
 * Get queue metrics (counts)
 */
async function getQueueMetrics(queueName = DEFAULT_TASK_QUEUE) {
  const qualifiedName = `${QUEUE_PREFIX}:${queueName}`;
  const queue = queues.get(qualifiedName) || createQueue(queueName);
  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    return { name: qualifiedName, counts };
  } catch (err) {
    logger.error('Failed to fetch queue metrics', { queue: qualifiedName, error: err.message });
    throw err;
  }
}

/**
 * Graceful shutdown of queues and schedulers
 */
async function shutdownAll({ timeoutMs = 30000 } = {}) {
  logger.info('Shutting down queues and schedulers');
  const tasks = [];

  for (const [qname, queue] of queues.entries()) {
    try {
      tasks.push(queue.close());
    } catch (e) {
      logger.warn('Error closing queue', { qname, message: e.message });
    }
  }

  for (const [sname, scheduler] of schedulers.entries()) {
    try {
      tasks.push(scheduler.close());
    } catch (e) {
      logger.warn('Error closing scheduler', { sname, message: e.message });
    }
  }

  // Wait for tasks to complete up to timeout
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);

  queues.clear();
  schedulers.clear();
  logger.info('Queues & schedulers shutdown complete');
}

export default {
  createQueue,
  enqueueTask,
  scheduleTask,
  getQueueMetrics,
  shutdownAll
};
