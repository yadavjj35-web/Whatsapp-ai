// path: billing/modelUsageLogger.js
/**
 * Model Usage Logger & Billing helper
 *
 * - Persists per-call usage to a dedicated Mongoose collection `ModelUsage`
 * - Provides aggregation helpers to compute cost per owner/tenant
 * - Estimation: costEstimate = tokenPricePerThousandTokens * (totalTokens / 1000)
 *
 * Exports:
 *  - recordUsage({ ownerId, model, promptTokens, completionTokens, totalTokens, costEstimate, metadata })
 *  - aggregateUsage({ ownerId, since, until })
 *
 * Notes:
 *  - This module defines its own ModelUsage schema (NEW) and uses mongoose (already in project)
 */

import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const { Schema } = mongoose;

const ModelUsageSchema = new Schema(
  {
    ownerId: { type: String, index: true },
    model: { type: String, index: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0, index: true },
    costEstimate: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

const ModelUsage = mongoose.models.ModelUsage || mongoose.model('ModelUsage', ModelUsageSchema);

/**
 * recordUsage: persist usage and write an audit log
 */
export async function recordUsage({ ownerId, model, promptTokens = 0, completionTokens = 0, totalTokens = 0, costEstimate = null, metadata = {} } = {}) {
  if (!ownerId) throw new Error('ownerId required');
  try {
    // Estimate cost if not provided
    let cost = Number(costEstimate || 0);
    if (!cost) {
      const pricePerThousand = Number(process.env.PRICE_PER_1000_TOKENS || 0.001); // default $0.001 per 1k tokens
      cost = (Number(totalTokens || (promptTokens + completionTokens)) / 1000) * pricePerThousand;
    }

    const rec = await ModelUsage.create({
      ownerId,
      model,
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || promptTokens + completionTokens,
      costEstimate: cost,
      metadata
    });

    // Audit log for billing
    await AuditLog.write({
      category: 'billing',
      action: 'model_usage_recorded',
      actor: ownerId,
      actorType: 'user',
      message: `Recorded model usage: ${rec.totalTokens} tokens`,
      details: { model, promptTokens, completionTokens, totalTokens: rec.totalTokens, costEstimate: rec.costEstimate },
      correlationId: metadata?.correlationId || null
    });

    return rec;
  } catch (err) {
    logger.error('Failed to record model usage', { error: err.message });
    throw err;
  }
}

/**
 * aggregateUsage: compute totals for owner in timeframe
 */
export async function aggregateUsage({ ownerId, since = new Date(Date.now() - 7 * 24 * 3600 * 1000), until = new Date() } = {}) {
  const match = {};
  if (ownerId) match.ownerId = ownerId;
  match.createdAt = { $gte: new Date(since), $lte: new Date(until) };

  const res = await ModelUsage.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$ownerId',
        totalTokens: { $sum: '$totalTokens' },
        totalCost: { $sum: '$costEstimate' },
        count: { $sum: 1 }
      }
    }
  ]);

  return res.length ? res[0] : { ownerId, totalTokens: 0, totalCost: 0, count: 0 };
}

export default { recordUsage, aggregateUsage, ModelUsage };
