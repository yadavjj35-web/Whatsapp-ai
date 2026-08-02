// path: server.js
/**
 * Updated server.js (production-ready)
 *
 * Responsibilities:
 *  - Initialize DB/Redis/queues/workers/tracing/metrics
 *  - Mount new controllers (workflows, approvals, payments, admin, metrics)
 *  - Provide webhook raw-body capture for signature verification
 *  - Graceful shutdown of workers, queues, Redis, tracing, shipper
 *  - Security middlewares: helmet, cors, rate limiting, auth/rbac hooks (where appropriate)
 *
 * Notes:
 *  - Expects other modules (created/updated) to be present:
 *      - queue/redisClient.js, queue/queueManager.js, workers/taskWorker.js
 *      - monitoring/otel.js, monitoring/metrics.js
 *      - controllers/workflowController.js, controllers/approvalController.js
 *      - controllers/paymentWebhookController.js, controllers/adminApi.js
 *      - controllers/metricsController.js
 *      - auth/oidcClient.js (authMiddleware), middleware/rbac.js (rbac)
 *      - logging/shipper.js (optional)
 *
 * Usage:
 *  node server.js
 */

import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import logger from './utils/logger.js';
import redisClient from './queue/redisClient.js';
import queueManager from './queue/queueManager.js';
import taskWorker from './workers/taskWorker.js';
import otel from './monitoring/otel.js';
import metrics from './monitoring/metrics.js';
import shipper from './logging/shipper.js';
import rateLimiterPerUser from './middleware/rateLimiterPerUser.js';
import { authMiddleware } from './auth/oidcClient.js';
import rbac from './middleware/rbac.js';

// controllers (existing/updated)
import workflowController from './controllers/workflowController.js';
import approvalController from './controllers/approvalController.js';
import paymentWebhookController from './controllers/paymentWebhookController.js';
import adminApi from './controllers/adminApi.js';
import metricsController from './controllers/metricsController.js';

// existing controllers that remain (if present)
import whatsappController from './controllers/whatsappController.js';

// Create app
const app = express();
const PORT = Number(process.env.PORT || 3000);
const serverStartTimeout = Number(process.env.SERVER_START_TIMEOUT_MS || 30000);

let httpServer = null;
let workerInstance = null;
let tracingStarted = false;

/**
 * Middleware to capture raw body for webhook signature verification.
 * This must be applied before express.json() if you want rawBody for specific routes,
 * or use express.raw() at route-level. We'll capture raw for all JSON/text bodies safely.
 */
function rawBodySaver(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

// Standard middlewares
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(compression());
app.use(cookieParser());

// JSON parser with raw capture
app.use(express.json({ limit: '1mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '1mb', verify: rawBodySaver }));

// Prometheus metrics middleware
app.use(metrics.metricsMiddleware);

// Basic request logging (uses your utils/logger)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    logger.info('http.request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: dur,
      ip: req.ip
    });
  });
  next();
});

// Rate limiting per user
app.use(rateLimiterPerUser);

// Mount routes
app.use('/api/v1/workflows', workflowController);
app.use('/api/v1/approvals', approvalController);

// Payment webhooks — the controller expects express.raw at route-level, but mounting under /webhooks is fine
app.use('/webhooks', paymentWebhookController);

// WhatsApp webhook (existing), mount if exists
if (whatsappController) {
  app.use('/webhook/whatsapp', whatsappController);
}

// Admin API: protected by OIDC auth + RBAC admin role
app.use('/api/v1/admin', authMiddleware(), rbac('admin'), adminApi);

// Metrics endpoint (prometheus)
app.use('/', metricsController);

// Health endpoint
app.get('/health', async (req, res) => {
  try {
    // Redis health
    const redisHealth = await redisClient.checkRedisHealth().catch((e) => ({ ok: false, reason: e.message }));
    // Mongo health (mongoose)
    let mongoState = 'unknown';
    try {
      // lazy import to avoid circular require
      const mongoose = (await import('mongoose')).default;
      const readyState = mongoose.connection.readyState; // 1 = connected
      mongoState = readyState === 1 ? 'connected' : `state_${readyState}`;
    } catch (e) {
      mongoState = `error:${e.message}`;
    }

    // Queue metrics
    let queueMetrics = {};
    try {
      queueMetrics = await queueManager.getQueueMetrics();
    } catch (e) {
      queueMetrics = { error: e.message };
    }

    const status = {
      redis: redisHealth,
      mongo: mongoState,
      queues: queueMetrics,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    const ok = (redisHealth && redisHealth.ok) || false;
    res.status(ok ? 200 : 500).json({ success: ok, status });
  } catch (err) {
    logger.error('Health check failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Startup sequence:
 *  - init tracing
 *  - init redis/queue
 *  - start worker(s)
 *  - start HTTP server
 */
async function start() {
  try {
    logger.info('Server starting - initializing observability and infra');

    // Start OpenTelemetry (non-blocking)
    try {
      await otel.startTracing();
      tracingStarted = true;
    } catch (err) {
      logger.warn('OTel start failure', { error: err.message });
    }

    // Start shipper if configured
    try {
      shipper.init && shipper.init();
    } catch (e) {
      logger.warn('Log shipper init failed', { error: e.message });
    }

    // Initialize Redis connection and wait until ready
    try {
      redisClient.initRedis();
      await redisClient.waitUntilReady();
      logger.info('Redis ready');
    } catch (err) {
      logger.error('Redis initialization failed', { error: err.message });
      throw err;
    }

    // Warm up queue manager (ensure scheduler created)
    try {
      queueManager.createQueue(); // default queue
      logger.info('Queue manager initialized');
    } catch (err) {
      logger.error('Queue manager init failed', { error: err.message });
      throw err;
    }

    // Start worker for tasks
    try {
      workerInstance = taskWorker.startWorker();
      logger.info('Task worker started');
    } catch (err) {
      logger.error('Worker startup failed', { error: err.message });
      throw err;
    }

    // Start HTTP server
    httpServer = http.createServer(app);
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Server start timed out')), serverStartTimeout);
      httpServer.listen(PORT, () => {
        clearTimeout(to);
        logger.info('Server listening', { port: PORT });
        resolve();
      });
    });

    // Graceful shutdown handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err && (err.stack || err.message) });
      // Attempt graceful shutdown, then exit
      shutdown().finally(() => process.exit(1));
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason: String(reason) });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    // Ensure process exits if failed to start
    await shutdown();
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown initiated');

  // Stop accepting new connections
  try {
    if (httpServer) {
      logger.info('Closing HTTP server');
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
        // also set a safety timeout
        setTimeout(resolve, 10_000).unref();
      });
    }
  } catch (err) {
    logger.warn('Error closing HTTP server', { error: err.message });
  }

  // Stop worker
  try {
    if (workerInstance && typeof workerInstance.shutdown === 'function') {
      logger.info('Shutting down worker');
      await workerInstance.shutdown({ timeoutMs: Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || 30000) });
    }
  } catch (err) {
    logger.warn('Worker shutdown error', { error: err.message });
  }

  // Shutdown queue managers (schedulers)
  try {
    await queueManager.shutdownAll({ timeoutMs: Number(process.env.QUEUE_SHUTDOWN_TIMEOUT_MS || 30000) });
  } catch (err) {
    logger.warn('Queue manager shutdown error', { error: err.message });
  }

  // Shutdown Redis
  try {
    await redisClient.shutdownRedis();
  } catch (err) {
    logger.warn('Redis shutdown error', { error: err.message });
  }

  // Shutdown shipper
  try {
    if (shipper && typeof shipper.shutdown === 'function') {
      await shipper.shutdown();
    }
  } catch (err) {
    logger.warn('Log shipper shutdown error', { error: err.message });
  }

  // Shutdown tracing
  try {
    if (tracingStarted) {
      await otel.shutdownTracing();
    }
  } catch (err) {
    logger.warn('Tracing shutdown error', { error: err.message });
  }

  logger.info('Shutdown complete');
  // allow process to exit naturally
}

/**
 * If executed directly, start the server
 */
if (import.meta.url === `file://${process.cwd()}/${path.basename(process.argv[1] || 'server.js')}` || process.argv[1] && process.argv[1].endsWith('server.js')) {
  // Top-level start
  start().catch((e) => {
    logger.error('Fatal startup error', { error: e.message });
    process.exit(1);
  });
}

export default app;
