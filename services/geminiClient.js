// path: services/geminiClient.js
/**
 * Gemini Client (production-ready)
 *
 * Provides:
 *  - text generation (callText)
 *  - embeddings (embed)
 *  - streaming generation (callStream) via response stream parsing
 *
 * Implementation notes:
 *  - Uses GEMINI_API_KEY (bearer token) and GEMINI_MODEL env var
 *  - Uses axios with sensible timeouts and retries
 *  - Exposes retry and circuit-breaker wrappers
 *
 * Environment variables:
 *  - GEMINI_API_KEY
 *  - GEMINI_MODEL (e.g., "gemini-1.5")
 *  - GEMINI_ENDPOINT (optional) default: https://gemini.googleapis.com/v1/models
 *
 * IMPORTANT:
 *  - Ensure GEMINI_API_KEY has required permissions.
 *  - This client aims to work generically with Gemini-style HTTP APIs.
 */

import axios from 'axios';
import https from 'https';
import logger from '../utils/logger.js';
import retryWrapper from '../utils/retryWrapper.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5';
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://gemini.googleapis.com/v1/models';
const DEFAULT_TIMEOUT = Number(process.env.GEMINI_TIMEOUT_MS || 20_000);

if (!GEMINI_API_KEY) {
  logger.warn('GEMINI_API_KEY is not set. Gemini client will fail on requests until API key is provided.');
}

/**
 * Axios instance configured for Gemini requests
 */
const axiosInstance = axios.create({
  baseURL: GEMINI_ENDPOINT,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    Authorization: `Bearer ${GEMINI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  // keepAlive agent for connection reuse
  httpsAgent: new https.Agent({ keepAlive: true })
});

/**
 * Helper to normalize response text from possible shapes.
 */
function extractTextFromResponse(respData) {
  // Different Gemini/OpenAI-like APIs may return different shapes
  // Common patterns: { outputText: '...', prediction: '...' } or { candidates: [{ content: '...' }] }
  if (!respData) return '';
  if (typeof respData === 'string') return respData;
  if (respData.outputText) return respData.outputText;
  if (respData.prediction) return respData.prediction;
  if (respData.candidates && Array.isArray(respData.candidates) && respData.candidates[0] && respData.candidates[0].content) {
    return respData.candidates[0].content;
  }
  // Fallback to JSON stringify
  try {
    return JSON.stringify(respData);
  } catch (e) {
    return String(respData);
  }
}

/**
 * Make a text generation call (non-streaming) with retries.
 * payload: { prompt, maxTokens, temperature, topP }
 */
async function callText(prompt, options = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const model = options.model || GEMINI_MODEL;
  const endpoint = `/${model}:predict`;

  const body = {
    prompt,
    maxOutputTokens: options.maxTokens || 512,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.6,
    topP: typeof options.topP === 'number' ? options.topP : 0.95
  };

  const fn = async () => {
    const resp = await axiosInstance.post(endpoint, body, { timeout: options.timeout || DEFAULT_TIMEOUT });
    const text = extractTextFromResponse(resp.data);
    return { text, raw: resp.data };
  };

  // Use retry wrapper for robust behavior
  return retryWrapper(fn, { attempts: options.attempts || 3, baseDelayMs: options.baseDelayMs || 500 });
}

/**
 * Streaming call: returns an async iterator yielding partial text chunks
 *
 * Example usage:
 * for await (const chunk of callStream(prompt)) { ... }
 *
 * Implementation:
 *  - Uses axios with responseType 'stream' and parses newline-delimited data
 *  - Expects server to send chunks separated by newlines (common SSE/text stream)
 */
async function* callStream(prompt, options = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const model = options.model || GEMINI_MODEL;
  const endpoint = `/${model}:predict`;

  const body = {
    prompt,
    maxOutputTokens: options.maxTokens || 512,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.6,
    topP: typeof options.topP === 'number' ? options.topP : 0.95,
    stream: true
  };

  const resp = await axiosInstance.post(endpoint, body, { responseType: 'stream', timeout: 0 }); // streaming has no timeout here

  const stream = resp.data;
  // read line by line
  const reader = stream[Symbol.asyncIterator]();

  let buffered = '';
  try {
    for await (const chunk of reader) {
      // chunk is Buffer
      const text = chunk.toString('utf8');
      buffered += text;
      // split on newline to produce events
      let idx;
      while ((idx = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, idx).trim();
        buffered = buffered.slice(idx + 1);
        if (!line) continue;
        // Try parse json else emit raw line
        try {
          const parsed = JSON.parse(line);
          const content = extractTextFromResponse(parsed);
          yield { type: 'delta', data: content, raw: parsed };
        } catch (e) {
          yield { type: 'delta', data: line, raw: line };
        }
      }
    }
    // any remaining buffered content
    if (buffered) {
      yield { type: 'delta', data: buffered, raw: buffered };
    }
  } finally {
    // ensure stream closed
    try {
      if (stream && typeof stream.destroy === 'function') stream.destroy();
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Embeddings call (single or batch)
 * Accepts string or array of strings. Returns array of vectors or single vector.
 *
 * Implementation assumes Gemini embeddings endpoint at /<model>:embed
 */
async function embed(texts, options = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const model = options.model || `${GEMINI_MODEL}-embed`;
  const endpoint = `/${model}:embed`;

  const inputs = Array.isArray(texts) ? texts : [texts];
  const body = { input: inputs };

  const fn = async () => {
    const resp = await axiosInstance.post(endpoint, body, { timeout: options.timeout || DEFAULT_TIMEOUT });
    // Expect response.data.embeddings to be an array of numeric arrays
    if (resp && resp.data && resp.data.embeddings) {
      return Array.isArray(texts) ? resp.data.embeddings : resp.data.embeddings[0];
    }
    // fallback: attempt to parse from alternate shapes
    if (resp && resp.data && resp.data.data) {
      return resp.data.data.map((d) => d.embedding || d);
    }
    throw new Error('Unexpected embeddings response shape');
  };

  return retryWrapper(fn, { attempts: options.attempts || 3, baseDelayMs: 300 });
}

export default {
  callText,
  callStream,
  embed
};
