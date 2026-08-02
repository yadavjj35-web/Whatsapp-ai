// path: monitoring/metrics.js
/**
 * Prometheus metrics setup using prom-client
 *
 * - Exposes registry, common metrics, and Express middleware to instrument HTTP requests.
 * - Provides helpers to register custom metrics.
 *
 * Environment:
 *  - METRICS_PREFIX (optional)
 *  - METRICS_DEFAULT_BUCKETS (optional, comma-separated)
 *
 * Usage:
 *  - import metrics from '../monitoring/metrics.js'
 *  - app.use(metrics.metricsMiddleware)
 *  - GET /metrics -> metrics.getMetrics() (controller exposes it)
 */

import client from 'prom-client';
import logger from '../utils/logger.js';

const registry = new client.Registry();

const METRICS_PREFIX = process.env.METRICS_PREFIX || 'waai_';
const DEFAULT_BUCKETS = (process.env.METRICS_HISTOGRAM_BUCKETS || '0.005,0.01,0.05,0.1,0.5,1,2,5').split(',').map(Number);

// Build some standard metrics
const httpRequestDuration = new client.Histogram({
  name: `${METRICS_PREFIX}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: DEFAULT_BUCKETS
});

const httpRequestCounter = new client.Counter({
  name: `${METRICS_PREFIX}http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const jobCounter = new client.Counter({
  name: `${METRICS_PREFIX}jobs_processed_total`,
  help: 'Total number of queue jobs processed',
  labelNames: ['queue', 'status', 'jobName']
});

const queueWaitingGauge = new client.Gauge({
  name: `${METRICS_PREFIX}queue_jobs_waiting`,
  help: 'Number of jobs waiting in queue',
  labelNames: ['queue']
});

// Register metrics
registry.registerMetric(httpRequestDuration);
registry.registerMetric(httpRequestCounter);
registry.registerMetric(jobCounter);
registry.registerMetric(queueWaitingGauge);

// Default metrics (process, gc)
client.collectDefaultMetrics({ register: registry });

/**
 * Express middleware to measure requests
 * Use after route mounting to capture route in req.route.path if available.
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime();
  const route = (req.route && req.route.path) || req.path || 'unknown';

  res.on('finish', () => {
    const delta = process.hrtime(start);
    const seconds = delta[0] + delta[1] / 1e9;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    try {
      httpRequestDuration.observe(labels, seconds);
      httpRequestCounter.inc(labels, 1);
    } catch (err) {
      // ignore metric errors
    }
  });

  return next();
}

/**
 * Expose registry metrics as a string (prometheus format).
 */
export async function getMetrics() {
  try {
    return await registry.metrics();
  } catch (err) {
    logger.error('Failed to collect metrics', { error: err.message });
    throw err;
  }
}

/**
 * Helpers to update job metrics
 */
export function recordJobProcessed({ queue = 'tasks', status = 'completed', jobName = 'unknown' } = {}) {
  try {
    jobCounter.inc({ queue, status, jobName });
  } catch (err) {
    // ignore
  }
}

export function setQueueWaiting(queue, count) {
  try {
    queueWaitingGauge.set({ queue }, Number(count));
  } catch (err) {
    // ignore
  }
}

export function registerMetric(metric) {
  registry.registerMetric(metric);
  return metric;
}

export default {
  registry,
  metricsMiddleware,
  getMetrics,
  recordJobProcessed,
  setQueueWaiting,
  registerMetric
};
