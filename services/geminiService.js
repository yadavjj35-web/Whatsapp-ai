// path: services/geminiService.js
/**
 * geminiService (compat wrapper)
 *
 * Migration adaptor: the previous code that used services/geminiService should now use services/geminiClient.
 * This module adapts to the older interface and adds:
 *  - rate-limiting checks (aiRateLimiter)
 *  - usage logging (aiUsageLogger)
 *  - safety wrappers (retrying already handled in geminiClient)
 */

import geminiClient from './geminiClient.js';
import aiRateLimiter from '../utils/aiRateLimiter.js';
import aiUsageLogger from '../utils/aiUsageLogger.js';
import logger from '../utils/logger.js';

/**
 * Generate text (non-streaming)
 * options: { ownerId, model, maxTokens, temperature, topP, costEstimateMeta }
 */
export async function generateText(prompt, options = {}) {
  const ownerId = options.ownerId || options.owner || 'system';
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5';

  // Check quota before calling
  const tokensBudget = Number(options.estimatedTokens || 512);
  const allow = await aiRateLimiter.allowConsume(ownerId, tokensBudget);
  if (!allow.allowed) {
    const err = new Error('AI quota exceeded');
    logger.warn('AI quota blocked request', { ownerId, model, estimatedTokens: tokensBudget });
    throw err;
  }

  // Call gemini client
  const resp = await geminiClient.callText(prompt, { model, maxTokens: options.maxTokens, temperature: options.temperature, topP: options.topP, attempts: options.attempts });

  // Log usage (best-effort): we estimate tokens by text length heuristic if precise token counts not returned
  const promptTokens = Math.ceil((prompt?.length || 0) / 4);
  const completionTokens = Math.ceil((resp.text?.length || 0) / 4);
  const totalTokens = promptTokens + completionTokens;
  try {
    // consume quota
    await aiRateLimiter.consume(ownerId, totalTokens);
    await aiUsageLogger.logUsage({
      ownerId,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costEstimate: options.costEstimate || null,
      metadata: options.costMeta || {}
    });
  } catch (e) {
    logger.warn('Failed to log AI usage or consume quota', { error: e.message });
  }

  return resp;
}

/**
 * Streaming generation wrapper: returns async iterator of deltas
 * options: { ownerId, model, maxTokens, temperature }
 */
export async function streamText(prompt, options = {}) {
  const ownerId = options.ownerId || 'system';
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5';
  // No quota pre-check for streaming (we'll tally on completion), but optionally block if owner severely over quota
  const allow = await aiRateLimiter.allowConsume(ownerId, 1);
  if (!allow.allowed) {
    throw new Error('AI quota exceeded');
  }

  const iterator = geminiClient.callStream(prompt, { model, maxTokens: options.maxTokens, temperature: options.temperature });

  // Wrap to accumulate partials and log on completion
  let accumulated = '';
  let promptTokens = Math.ceil((prompt?.length || 0) / 4);
  let completionTokens = 0;

  const asyncGenerator = (async function* () {
    for await (const chunk of iterator) {
      // chunk: { type: 'delta', data, raw }
      const textPart = String(chunk.data || '');
      accumulated += textPart;
      yield chunk;
    }
    // on completion, estimate tokens and log
  }());

  // After iteration completes, consume tokens & log — return a wrapper that the consumer can call finalizer on
  // But JS generators can't easily expose a finalizer; instead, provide a helper to finalize usage:
  asyncGenerator.finalize = async function finalize() {
    completionTokens = Math.ceil((accumulated.length || 0) / 4);
    const totalTokens = promptTokens + completionTokens;
    try {
      await aiRateLimiter.consume(ownerId, totalTokens);
      await aiUsageLogger.logUsage({ ownerId, model, promptTokens, completionTokens, totalTokens, metadata: options.metadata || {} });
    } catch (err) {
      logger.warn('Failed to finalize streaming usage', { error: err.message });
    }
  };

  return asyncGenerator;
}

/**
 * Embedding wrapper (single or batch)
 */
export async function embed(texts, options = {}) {
  const ownerId = options.ownerId || 'system';
  // Estimate cost per text low; we won't enforce quota here, but you can adapt to your billing model
  const resp = await geminiClient.embed(texts, { model: options.model });
  // Log minimal usage
  try {
    const totalTokens = Array.isArray(texts) ? texts.reduce((acc, t) => acc + Math.ceil((t?.length || 0) / 4), 0) : Math.ceil((texts?.length || 0) / 4);
    await aiUsageLogger.logUsage({ ownerId, model: options.model || process.env.GEMINI_MODEL, promptTokens: totalTokens, completionTokens: 0, totalTokens, metadata: { type: 'embedding' } });
    await aiRateLimiter.consume(ownerId, totalTokens);
  } catch (e) {
    logger.warn('Failed to log/consume embedding usage', { error: e.message });
  }
  return resp;
}

export default { generateText, streamText, embed };
