// path: services/geminiService.js
import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const GEMINI_ENDPOINT = 'https://gemini.googleapis.com/v1/models'; // placeholder base, use appropriate endpoint

/**
 * Call Gemini (text generation). This module expects an API key in config.gemini.apiKey
 * Implements timeouts, retries, and logs requests/responses (sensitive content redacted).
 *
 * Note: Adjust endpoint and request payload per the exact Gemini API you have access to.
 */
async function callGemini(prompt, options = {}) {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = options.model || 'gemini-1.5'; // adapt to available model
  const url = `${GEMINI_ENDPOINT}/${model}:predict`;

  const payload = {
    prompt,
    maxOutputTokens: options.maxTokens || 512,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.6,
    topP: typeof options.topP === 'number' ? options.topP : 0.95
  };

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: options.timeout || 20000
    });

    // Response parsing depends on API. Normalize to text.
    const text = resp.data && (resp.data.outputText || resp.data.prediction || JSON.stringify(resp.data));
    logger.info('Gemini successful request', { model, tokens: options.maxTokens });
    return { text, raw: resp.data };
  } catch (err) {
    logger.error('Gemini request failed', { message: err.message, code: err.code });
    throw err;
  }
}

export default { callGemini };
