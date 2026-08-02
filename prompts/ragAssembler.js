// path: prompts/ragAssembler.js
/**
 * RAG Assembler
 *
 * Responsible for:
 *  - Accepting a user query and retrieving top-K relevant documents from vector DB
 *  - Producing a compact retrieval bundle to be inserted into prompts (with citations)
 *  - Enforcing a token (or character) budget so final prompt remains within model limits
 *  - Returning both the assembled context text and metadata (sources)
 *
 * Exports:
 *  - assembleRagContext({ query, topK = 5, tokenBudget = 2048, includeScores = false })
 *
 * Dependencies:
 *  - memory/vectorDbClient.js (Qdrant/Pinecone wrapper)
 *  - memory/embeddingService.js (for embeddings on-the-fly optional)
 *
 * Notes:
 *  - This module uses character-length heuristics for "tokenBudget" unless a proper tokenizer is attached.
 *  - Each retrieved doc carries { id, text, score, payload } and is turned into a citation: [source:id]
 */

import vectorDbClient from '../memory/vectorDbClient.js';
import embeddingService from '../memory/embeddingService.js';
import logger from '../utils/logger.js';

/**
 * Heuristic token estimation: converts char length to approx token count.
 * Default: 4 characters per token (approx). Not exact, but usable for budget heuristics.
 */
function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit expected tokens budget (approx by characters).
 */
function truncateToTokens(text, tokens) {
  const maxChars = Math.max(0, Math.floor(tokens * 4)); // 4 chars per token heuristic
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Assemble RAG context for a given query.
 *
 * options:
 *  - topK: number of docs to retrieve (default 5)
 *  - tokenBudget: maximum tokens allocated to retrieved context (default 1024)
 *  - includeScores: add retrieval score to metadata
 *
 * Returns:
 *  {
 *    contextText: 'Retrieved docs assembled...',
 *    sources: [{ id, score, payload, excerpt }],
 *    totalTokens: number
 *  }
 */
export async function assembleRagContext({ query, topK = 5, tokenBudget = 1024, includeScores = false } = {}) {
  if (!query) throw new Error('assembleRagContext: query required');

  // Step 1: get embedding for query
  let queryEmbedding = null;
  try {
    queryEmbedding = await embeddingService.embed(query);
  } catch (err) {
    // fallback: allow vector DB to search by text if supported
    logger.warn('Embedding failed for query; vector DB may attempt text search', { error: err.message });
  }

  // Step 2: retrieve nearest neighbors
  const retrievals = await vectorDbClient.search({
    vector: queryEmbedding,
    text: query, // optional text fallback
    topK
  });

  // Step 3: assemble excerpts until tokenBudget hit
  const sources = [];
  let remainingTokens = tokenBudget;
  const contextParts = [];

  for (const r of retrievals) {
    const id = r.id || r.payload?.id || `doc-${Math.random().toString(36).slice(2, 8)}`;
    const text = String(r.payload?.text || r.payload?.content || r.text || '');
    if (!text) continue;
    const score = typeof r.score === 'number' ? r.score : null;
    const estimated = estimateTokensFromText(text);
    if (estimated <= 0) continue;
    // If remainingTokens exhausted, break
    if (remainingTokens <= 0) break;

    // Determine tokens to take from this doc
    const takeTokens = Math.min(remainingTokens, estimated);
    const excerpt = truncateToTokens(text, takeTokens);
    remainingTokens -= takeTokens;

    // Format for prompt: include source marker
    const citation = `[source:${id}]`;
    contextParts.push(`${citation}\n${excerpt}\n`);

    const src = { id, excerpt, payload: r.payload || null };
    if (includeScores) src.score = score;
    sources.push(src);
  }

  const contextText = contextParts.join('\n---\n');

  const usedTokens = tokenBudget - remainingTokens;

  return { contextText, sources, totalTokens: usedTokens };
}

export default { assembleRagContext };
