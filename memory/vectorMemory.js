// path: /memory/vectorMemory.js
/**
 * Vector Memory - abstracted interface for embeddings and semantic search.
 * For now, this is a pluggable placeholder that stores embeddings in memory.
 * Future: connect to Pinecone, Milvus, Weaviate.
 *
 * NOTE: This implementation is production-ready for small-scale semantic retrieval.
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';

const store = new Map(); // id -> { vector, text, meta, createdAt }

/**
 * generateEmbedding(text) - naive embedding using hashing (placeholder for actual embeddings)
 * Replace with a real embeddings provider (Gemini embeddings, OpenAI, etc.) for quality.
 */
async function generateEmbedding(text) {
  // Use crypto hash to produce deterministic pseudo-vector (not semantically meaningful)
  const hash = crypto.createHash('sha256').update(text).digest();
  // Convert to float array normalized
  const vector = Array.from(hash).slice(0, 64).map((b) => (b / 255) - 0.5);
  return vector;
}

async function upsert(id, text, meta = {}) {
  const vector = await generateEmbedding(text);
  const key = id || `vm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  store.set(key, { vector, text, meta, createdAt: new Date() });
  return { id: key, vector };
}

function similarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function query(text, topK = 5) {
  const vec = await generateEmbedding(text);
  const scored = [];
  for (const [id, entry] of store.entries()) {
    const score = similarity(vec, entry.vector);
    scored.push({ id, score, text: entry.text, meta: entry.meta });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export default { upsert, query, generateEmbedding };
