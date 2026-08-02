// path: queue/queueUtils.js
/**
 * queue/queueUtils.js
 *
 * Utility helpers for job id generation, job options, and idempotency helpers used
 * by the queue/queueManager and workers.
 *
 * Production-ready:
 *  - Deterministic job id generation using SHA256 of canonical payload
 *  - Default job options tuned for enterprise usage with exponential backoff
 *  - Safe canonical JSON serializer (stable key ordering)
 *
 * Exports:
 *  - generateJobId(jobName, workflowId, payload) -> deterministic string id
 *  - defaultJobOptions() -> default BullMQ job options object
 *  - canonicalize(obj) -> stable JSON string used for hashing
 *  - computeHash(value) -> hex SHA256 hash
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';

const DEFAULT_ATTEMPTS = Number(process.env.QUEUE_DEFAULT_ATTEMPTS || 5);
const DEFAULT_BACKOFF_BASE_MS = Number(process.env.QUEUE_BACKOFF_BASE_MS || 200); // base for exponential backoff
const DEFAULT_JOB_TIMEOUT_MS = Number(process.env.QUEUE_JOB_TIMEOUT_MS || 1000 * 60 * 5); // 5 minutes
const DEFAULT_REMOVE_ON_COMPLETE_KEEP = Number(process.env.QUEUE_REMOVE_ON_COMPLETE_KEEP || 1000); // keep last 1000 completed

/**
 * Stable canonicalization of an object to JSON with sorted keys.
 * Avoids non-deterministic key order from JSON.stringify.
 * Handles primitives and nested objects/arrays.
 */
export function canonicalize(obj) {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);

  function sortKeys(value) {
    if (Array.isArray(value)) {
      return `[${value.map((v) => sortKeys(v)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      const parts = keys.map((k) => `${JSON.stringify(k)}:${sortKeys(value[k])}`);
      return `{${parts.join(',')}}`;
    }
    return JSON.stringify(value);
  }

  try {
    return sortKeys(obj);
  } catch (err) {
    // Fallback: best-effort stringify
    logger.warn('canonicalize fallback to JSON.stringify due to error', { message: err.message });
    return JSON.stringify(obj);
  }
}

/**
 * Compute SHA256 hash of an input (string or buffer).
 * Returns hex digest.
 */
export function computeHash(input) {
  const hash = crypto.createHash('sha256');
  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    hash.update(input);
  } else {
    hash.update(canonicalize(input));
  }
  return hash.digest('hex');
}

/**
 * Generate a deterministic job ID given jobName, optional workflowId and payload.
 * This ensures idempotency across retries and duplicate submissions if same inputs provided.
 *
 * Example usage:
 *   const jobId = generateJobId('recommend', workflowId, { query: 'shirt', user: '+1555' });
 */
export function generateJobId(jobName, workflowId = '', payload = {}) {
  // Build canonical string
  const parts = [String(jobName)];
  if (workflowId) parts.push(String(workflowId));
  try {
    const payloadCanonical = canonicalize(payload);
    parts.push(payloadCanonical);
  } catch (err) {
    parts.push(String(payload || ''));
  }
  const combined = parts.join('|');
  // Compute a short hash (sha256), then return e.g. jobName:sha256prefix
  const digest = computeHash(combined);
  const prefix = String(jobName).replace(/\s+/g, '_').toLowerCase();
  return `${prefix}:${digest}`;
}

/**
 * Default job options used by BullMQ jobs in this platform.
 * Includes:
 *  - attempts (retry count)
 *  - backoff (exponential) with base
 *  - timeout (ms)
 *  - removeOnComplete (keep limited number)
 */
export function defaultJobOptions() {
  const attempts = DEFAULT_ATTEMPTS;
  const backoff = {
    type: 'exponential',
    delay: DEFAULT_BACKOFF_BASE_MS
  };
  const timeout = DEFAULT_JOB_TIMEOUT_MS;
  const removeOnComplete = { age: undefined, count: DEFAULT_REMOVE_ON_COMPLETE_KEEP };
  // removeOnFail: keep failed jobs for investigation (do not remove automatically)
  const removeOnFail = false;

  return {
    attempts,
    backoff,
    timeout,
    removeOnComplete,
    removeOnFail
  };
}

/**
 * Helper to produce a short, human-friendly job summary string (for logs).
 */
export function jobSummary(jobName, jobId, workflowId) {
  let s = `${jobName}`;
  if (workflowId) s += ` [wf:${workflowId}]`;
  if (jobId) s += ` id:${jobId.slice(0, 10)}`;
  return s;
}

export default {
  canonicalize,
  computeHash,
  generateJobId,
  defaultJobOptions,
  jobSummary
};
