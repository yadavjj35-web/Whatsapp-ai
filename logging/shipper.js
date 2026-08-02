// path: logging/shipper.js
/**
 * logging/shipper.js
 *
 * Simple HTTP log shipper with batching and exponential backoff.
 *
 * - Batches logs in memory and flushes periodically or when batch size reached.
 * - Retries with exponential backoff on transient errors.
 * - Uses axios for HTTP transport.
 *
 * Environment:
 *  - LOGSHIP_URL (destination URL)
 *  - LOGSHIP_BATCH_SIZE (default 50)
 *  - LOGSHIP_BATCH_INTERVAL_MS (default 5000)
 *  - LOGSHIP_MAX_RETRIES (default 5)
 *
 * Usage:
 *  import shipper from '../logging/shipper.js';
 *  shipper.init(); shipper.ship({ level:'info', msg:'...', meta:{} });
 */

import axios from 'axios';
import retryWrapper from '../utils/retryWrapper.js';
import logger from '../utils/logger.js';

const LOGSHIP_URL = process.env.LOGSHIP_URL || '';
const BATCH_SIZE = Number(process.env.LOGSHIP_BATCH_SIZE || 50);
const BATCH_INTERVAL_MS = Number(process.env.LOGSHIP_BATCH_INTERVAL_MS || 5000);
const MAX_RETRIES = Number(process.env.LOGSHIP_MAX_RETRIES || 5);

let queue = [];
let timer = null;
let enabled = Boolean(LOGSHIP_URL);

/**
 * Flush current queue to remote shipper
 */
async function flush() {
  if (!enabled) return;
  if (queue.length === 0) return;
  const payload = queue.splice(0, queue.length);
  const send = async () => {
    await axios.post(LOGSHIP_URL, payload, {
      timeout: Number(process.env.LOGSHIP_TIMEOUT_MS || 8000),
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    await retryWrapper(send, { attempts: MAX_RETRIES, baseDelayMs: 500 });
    // success
  } catch (err) {
    // On persistent failure, re-enqueue with an upper cap
    logger.warn('Log shipper failed to send batch, re-queueing', { error: err.message, batchSize: payload.length });
    // try to requeue preserving at most BATCH_SIZE*2 in memory
    queue = payload.concat(queue).slice(0, BATCH_SIZE * 2);
  }
}

/**
 * Start periodic flush timer
 */
function start() {
  if (!enabled) {
    logger.info('Log shipper disabled (no LOGSHIP_URL configured)');
    return;
  }
  if (timer) return;
  timer = setInterval(async () => {
    try {
      await flush();
    } catch (err) {
      // swallow
    }
  }, BATCH_INTERVAL_MS).unref();
}

/**
 * Stop shipper and flush remaining logs
 */
async function shutdown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await flush();
  } catch (err) {
    // ignore
  }
}

/**
 * Ship a single log entry (adds to batch)
 */
function ship(entry = {}) {
  if (!enabled) return false;
  try {
    const record = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    queue.push(record);
    if (queue.length >= BATCH_SIZE) {
      // flush asynchronously
      flush().catch((e) => {
        // swallow
        logger.warn('Log shipper async flush failed', { error: e.message });
      });
    }
    return true;
  } catch (err) {
    logger.warn('Log shipper failed to enqueue log', { error: err.message });
    return false;
  }
}

/**
 * Immediate send helper (no batching) - used for critical events
 */
async function sendNow(entry = {}) {
  if (!enabled) return false;
  const fn = async () => {
    await axios.post(LOGSHIP_URL, [entry], { timeout: 5000, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await retryWrapper(fn, { attempts: MAX_RETRIES, baseDelayMs: 300 });
    return true;
  } catch (err) {
    logger.warn('Log shipper sendNow failed', { error: err.message });
    return false;
  }
}

export default {
  init: start,
  shutdown,
  ship,
  sendNow,
  isEnabled: () => enabled
};
