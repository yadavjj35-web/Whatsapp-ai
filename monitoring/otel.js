// path: monitoring/otel.js
/**
 * OpenTelemetry initialization for Node.js (NodeSDK)
 *
 * - Initializes tracing with auto-instrumentations (HTTP, Express, Redis, MongoDB if available)
 * - Exports `startTracing()` and `shutdownTracing()` to integrate with app lifecycle
 * - Exposes `getTracer()` helper for manual spans
 *
 * Environment variables:
 *  - OTEL_SERVICE_NAME (service name)
 *  - OTEL_EXPORTER_OTLP_ENDPOINT (OTLP HTTP endpoint, e.g., http://otel-collector:4318/v1/traces)
 *  - OTEL_ENABLED (true/false)
 *
 * Notes:
 *  - Requires @opentelemetry/sdk-node and instrumentations installed (present in package.json)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { diag, DiagConsoleLogger, DiagLogLevel, trace, getTracerProvider } from '@opentelemetry/api';
import { OTLPTraceExporter } from 'opentelemetry-exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import logger from '../utils/logger.js';

const OTEL_ENABLED = (process.env.OTEL_ENABLED || 'true').toLowerCase() === 'true';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'waai-service';
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP || '';

let sdk = null;
let started = false;

/**
 * Start OpenTelemetry SDK
 */
export async function startTracing() {
  if (!OTEL_ENABLED) {
    logger.info('OpenTelemetry disabled via OTEL_ENABLED=false');
    return;
  }
  if (started && sdk) return;

  // Enable diagnostic logs for OTel library to console in dev when requested
  const diagLevel = process.env.OTEL_DIAG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'error');
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel[diagLevel.toUpperCase()] || DiagLogLevel.ERROR);

  const exporterOptions = {};
  if (OTEL_ENDPOINT) exporterOptions.url = OTEL_ENDPOINT;

  const traceExporter = new OTLPTraceExporter(exporterOptions);

  sdk = new NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: process.env.OTEL_SERVICE_NAMESPACE || 'whatsapp-ai',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || process.env.SERVICE_VERSION || '0.0.0'
    })
  });

  try {
    await sdk.start();
    started = true;
    logger.info('OpenTelemetry SDK started', { serviceName: OTEL_SERVICE_NAME, endpoint: OTEL_ENDPOINT });
  } catch (err) {
    logger.error('Failed to start OpenTelemetry SDK', { error: err.message });
    // do not throw to avoid bringing down the app
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing({ timeoutMs = 5000 } = {}) {
  if (!started || !sdk) return;
  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry SDK shut down gracefully');
  } catch (err) {
    logger.warn('OpenTelemetry SDK shutdown error', { error: err.message });
  } finally {
    started = false;
    sdk = null;
  }
}

/**
 * Get tracer for manual spans
 */
export function getTracer(name = OTEL_SERVICE_NAME) {
  return trace.getTracer(name);
}

export default {
  startTracing,
  shutdownTracing,
  getTracer
};
