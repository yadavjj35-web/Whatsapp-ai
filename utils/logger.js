// path: utils/logger.js
/**
 * Structured logger (Pino-based) with integration points:
 *  - request-aware express middleware (adds requestId & traceId)
 *  - child logger creation
 *  - optional remote shipper integration (logging/shipper.js)
 *  - automatic correlation id extraction from headers
 *
 * Production considerations:
 *  - JSON logs, minimal synchronous overhead
 *  - Do not log sensitive fields; masking helper provided
 *  - Exports a default logger and middleware for Express
 */

import pino from 'pino';
import crypto from 'crypto';
import shipper from '../logging/shipper.js';
import { getTracer } from '../monitoring/otel.js';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = process.env.SERVICE_NAME || process.env.npm_package_name || 'whatsapp-ai';

const logger = pino({
  level: LOG_LEVEL,
  base: {
    pid: false,
    hostname: false,
    service: SERVICE_NAME
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

/**
 * Generate a request id (if not provided by upstream)
 */
export function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Extract trace id from incoming request (supports W3C traceparent or x-b3 headers)
 */
export function extractTraceId(req = {}) {
  // W3C traceparent header: "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
  const tp = req.headers?.traceparent || req.headers?.Traceparent || req.headers?.['x-request-id'];
  if (!tp) return null;
  if (tp.includes('-')) {
    const parts = tp.split('-');
    if (parts.length >= 3) return parts[1];
  }
  return String(tp).slice(0, 32);
}

/**
 * Mask sensitive fields in objects (basic)
 */
export function maskSensitive(obj, fields = ['authorization', 'password', 'token', 'apiKey', 'api_key', 'secret']) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(copy, f)) copy[f] = '[REDACTED]';
  }
  return copy;
}

/**
 * Express middleware to attach a child logger to req.logger and set request context
 */
export function requestLoggerMiddleware(opts = {}) {
  return (req, res, next) => {
    try {
      const reqId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || generateRequestId();
      const traceId = extractTraceId(req) || (getTracer ? getTracer().instrumentationScope?.name : null);
      const child = logger.child({
        reqId,
        traceId,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      // attach to request
      req.logger = child;
      res.setHeader('X-Request-Id', reqId);

      // on finish log concise info
      res.on('finish', () => {
        child.info({ statusCode: res.statusCode, durationMs: Date.now() - (req._startTime || Date.now()) }, 'request.finish');
      });

      // minimal start time
      req._startTime = Date.now();
    } catch (err) {
      // fallback to root logger
      logger.warn('requestLoggerMiddleware failed to initialize child logger', { error: err.message });
    } finally {
      next();
    }
  };
}

/**
 * Ship critical log entries to remote shipper (best-effort, non-blocking)
 */
function shipLogWhenCritical(level, msg, meta = {}) {
  try {
    if (!shipper || !shipper.isEnabled || !shipper.isEnabled()) return;
    const entry = {
      level,
      message: msg,
      meta,
      timestamp: new Date().toISOString()
    };
    shipper.ship(entry);
  } catch (e) {
    // swallow; do not impact application logic
  }
}

/**
 * Convenience wrappers that also trigger shipper for high-severity logs
 */
export function info(msg, meta = {}) {
  logger.info(meta, msg);
}
export function warn(msg, meta = {}) {
  logger.warn(meta, msg);
  shipLogWhenCritical('warn', msg, meta);
}
export function error(msg, meta = {}) {
  logger.error(meta, msg);
  shipLogWhenCritical('error', msg, meta);
}
export function debug(msg, meta = {}) {
  logger.debug(meta, msg);
}

/**
 * Create a child logger with contextual bindings
 */
export function childLogger(bindings = {}) {
  return logger.child(bindings);
}

export default Object.assign(logger, {
  requestLoggerMiddleware,
  generateRequestId,
  extractTraceId,
  maskSensitive,
  childLogger,
  info,
  warn,
  error,
  debug
});
