// path: memory/chunker.js
/**
 * memory/chunker.js
 *
 * Utility to chunk long documents / conversation histories into smaller passages for embeddings and vector DB indexing.
 *
 * Features:
 *  - Chunk by approximate token (character) size (configurable)
 *  - Preserve sentence boundaries when possible
 *  - Return metadata for each chunk: { id, text, start, end, chars }
 *
 * Exports:
 *  - chunkText(text, { chunkSize = 1000, overlap = 200 }) -> array of chunks
 *
 * Implementation notes:
 *  - Uses character-based heuristics (chars ~ tokens * 4). Replace with proper tokenizer (tiktoken) if available.
 */

function splitIntoSentences(text) {
  // Minimal sentence splitter using punctuation. Not perfect, but useful for chunk boundaries.
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chunk text preserving sentence boundaries and overlapping context.
 *
 * chunkSize, overlap measured in characters.
 */
export function chunkText(text, { chunkSize = 1000, overlap = 200 } = {}) {
  if (!text) return [];
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= chunkSize) {
    return [{ id: `chunk-0`, text: normalized, start: 0, end: normalized.length, chars: normalized.length }];
  }

  const sentences = splitIntoSentences(normalized);
  const chunks = [];
  let buffer = '';
  let startIdx = 0;
  let chunkIndex = 0;

  for (const s of sentences) {
    if (buffer.length + s.length + 1 <= chunkSize) {
      buffer = buffer ? `${buffer} ${s}` : s;
      continue;
    }

    // flush current buffer as a chunk
    if (buffer.length > 0) {
      const chunkText = buffer.trim();
      const endIdx = startIdx + chunkText.length;
      chunks.push({ id: `chunk-${chunkIndex}`, text: chunkText, start: startIdx, end: endIdx, chars: chunkText.length });
      chunkIndex += 1;

      // setup next buffer with overlap from end of chunk
      const overlapText = chunkText.slice(-overlap);
      buffer = overlapText + ' ' + s;
      startIdx = endIdx - overlapText.length;
    } else {
      // sentence longer than chunk size; force-break
      const piece = s.slice(0, chunkSize);
      const endIdx = startIdx + piece.length;
      chunks.push({ id: `chunk-${chunkIndex}`, text: piece, start: startIdx, end: endIdx, chars: piece.length });
      chunkIndex += 1;
      buffer = s.slice(chunkSize);
      startIdx = endIdx;
    }
  }

  // flush remaining buffer
  if (buffer && buffer.trim().length > 0) {
    const chunkText = buffer.trim();
    const endIdx = startIdx + chunkText.length;
    chunks.push({ id: `chunk-${chunkIndex}`, text: chunkText, start: startIdx, end: endIdx, chars: chunkText.length });
  }

  return chunks;
}

/**
 * chunkDocument helper: splits and creates unique ids per doc.
 * meta: { docId, namespace }
 */
export function chunkDocument(docText, meta = {}, opts = {}) {
  const chunks = chunkText(docText, opts);
  return chunks.map((c, idx) => {
    const id = `${meta.docId || 'doc'}:${idx}`;
    return { id, text: c.text, meta: { ...meta, start: c.start, end: c.end } };
  });
}

export default { chunkText, chunkDocument };
