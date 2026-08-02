// path: utils/aiUsageLogger.js
/**
 * AI Usage Logger
 *
 * Logs LLM token usage per owner/tenant and exposes helper to persist usage records.
 * Implementation writes to AuditLog and, if modelUsage collection exists, can write there.
 *
 * Exports:
 *  - logUsage({ ownerId, model, promptTokens, completionTokens, totalTokens, costEstimate, metadata })
 *  - getUsageSummary(ownerId, { since })
 *
 * Uses AuditLog model for persistence so no additional model required.
 */

import AuditLog from '../models/AuditLog.js';
import monitoring from '../monitoring/metrics.js';
import logger from '../utils/logger.js';

/**
 * logUsage: create an audit entry and increment Prometheus metrics
 */
export async function logUsage({ ownerId, model, promptTokens = 0, completionTokens = 0, totalTokens = 0, costEstimate = 0, metadata = {} } = {}) {
  try {
    // Write AuditLog entry
    const details = { model, promptTokens, completionTokens, totalTokens, costEstimate, metadata };
    await AuditLog.write({
      category: 'usage',
      action: 'ai_usage',
      actor: ownerId || 'system',
      actorType: 'user',
      message: `AI usage recorded for ${ownerId || 'unknown'}`,
      details,
      correlationId: metadata?.correlationId || null
    });

    // Update Prometheus metrics (histogram/counter)
    try {
      monitoring.registry.getSingleMetric && monitoring.registry.getSingleMetric(`${monitoring.registry.PREFIX || ''}ai_tokens_total`);
    } catch (e) {
      // ignore metric existence
    }

    // Use existing monitoring.recordJobProcessed as a generic counter for LLM calls
    monitoring.recordJobProcessed({ queue: 'llm', status: 'usage', jobName: model || 'unknown' });

    return { success: true };
  } catch (err) {
    logger.error('Failed to log AI usage', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * getUsageSummary: query AuditLog for usage entries in timeframe (since)
 */
export async function getUsageSummary(ownerId, { since = Date.now() - 7 * 24 * 3600 * 1000 } = {}) {
  const q = { category: 'usage', 'createdAt': { $gte: new Date(since) } };
  if (ownerId) q.actor = ownerId;
  const rows = await AuditLog.find(q).lean().limit(1000);
  let totalTokens = 0;
  let totalCost = 0;
  for (const r of rows) {
    const d = r.details || {};
    totalTokens += Number(d.totalTokens || 0);
    totalCost += Number(d.costEstimate || 0);
  }
  return { ownerId, since: new Date(since), totalTokens, totalCost, recordCount: rows.length };
}

export default { logUsage, getUsageSummary };
