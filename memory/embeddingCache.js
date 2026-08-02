// path: memory/embeddingCache.js
/**
 * Simple in-memory embedding cache with TTL and size limit.
 *
 * Purpose:
 *  - Avoid repeated embedding calls for identical doc chunks within TTL
 *  - Reduce cost and latency for frequent identical retrievals
 *
 * Production-ready notes:
 *  - Uses Map for fast access and a priority eviction policy (LRU-like)
 *  - Should be complemented by a distributed cache (Redis) in multi-process deployments
 *
 * Exports:
 *  - get(key)
 *  - set(key, vector, ttlMs)
 *  - del(key)
 *  - clear()
 */

const DEFAULT_TTL_MS = Number(process.env.EMBEDDING_CACHE_TTL_MS || 1000 * 60 * 60); // 1 hour
const DEFAULT_MAX_ENTRIES = Number(process.env.EMBEDDING_CACHE_MAX_ENTRIES || 10000);

class EmbeddingCache {
  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.map = new Map(); // key -> { value, expiresAt }
  }

  _ensureLimit() {
    while (this.map.size > this.maxEntries) {
      // evict oldest entry (Map preserves insertion order)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // LRU behavior: refresh insertion order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = DEFAULT_TTL_MS) {
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt });
    this._ensureLimit();
    return true;
  }

  del(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  size() {
    return this.map.size;
  }
}

const embeddingCache = new EmbeddingCache(DEFAULT_MAX_ENTRIES);

export default embeddingCache;
