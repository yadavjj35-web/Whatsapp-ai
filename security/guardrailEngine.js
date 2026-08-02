// path: /security/guardrailEngine.js
/**
 * Guardrail Engine
 * - Enforces high-level AI safety policies and filters outputs before public release
 */

import logger from '../utils/logger.js';

function filterSensitive(text) {
  if (!text) return text;
  // Basic redaction patterns (emails, CC numbers) - production: use robust PII detection
  return text.replace(/\b\d{12,19}\b/g, '[REDACTED]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]');
}

function enforce(agentName, artifact) {
  // artifact could be message or action - sanitize
  const sanitized = typeof artifact === 'string' ? filterSensitive(artifact) : artifact;
  logger.info('guardrail enforcement', { agentName });
  return sanitized;
}

export default { enforce, filterSensitive };
