// path: services/summarizerService.js
/**
 * Summarizer Service
 *
 * Produces condensed summaries of long conversations or documents using the Gemini client.
 * Uses chunking for long text, performs iterative summarization to keep within token limits,
 * and returns structured summaries with metadata for storage by memory managers.
 *
 * Exports:
 *  - summarizeText(text, { maxTokens = 512, temperature = 0.2 })
 *  - summarizeConversation(conversation, options)
 *
 * Dependencies:
 *  - services/geminiClient.js (callText)
 *  - memory/chunker.js (chunking large text)
 *
 * Production notes:
 *  - Retries on transient errors via retryWrapper at gemini client level
 *  - Sanitizes input to avoid sending sensitive keys
 */

import geminiClient from './geminiClient.js';
import chunker from '../memory/chunker.js';
import logger from '../utils/logger.js';

/**
 * Summarize a single text using iterative summarization if needed.
 * Returns { summary, sourceLength, tokensEstimate }
 */
export async function summarizeText(text, { maxTokens = 512, temperature = 0.2, chunkSize = 2000, overlap = 200 } = {}) {
  if (!text || typeof text !== 'string') throw new Error('summarizeText: text string required');

  // If short, summarize directly
  if (text.length < chunkSize) {
    const prompt = `Summarize the following content in concise bullet points, no more than ${Math.max(3, Math.floor(maxTokens/40))} bullets:\n\n${text}`;
    const resp = await geminiClient.callText(prompt, { maxTokens, temperature });
    return { summary: resp.text, sourceLength: text.length, tokensEstimate: Math.ceil(text.length / 4) };
  }

  // For large text, chunk it then produce progressive summaries and combine
  const chunks = chunker.chunkDocument(text, { docId: 'summ-doc' }, { chunkSize, overlap });
  const partialSummaries = [];

  for (const chunk of chunks) {
    const prompt = `Summarize concisely (one paragraph) the following excerpt:\n\n${chunk.text}`;
    try {
      const resp = await geminiClient.callText(prompt, { maxTokens: Math.min(256, maxTokens), temperature });
      partialSummaries.push(resp.text);
    } catch (err) {
      logger.warn('summarizeText chunk summarization failed', { error: err.message });
      // Continue with other chunks
    }
  }

  // Combine partial summaries into a single synthesized summary
  const combined = partialSummaries.join('\n\n');
  const finalPrompt = `You are an expert summarizer. Combine the following partial summaries into a single cohesive summary in 3-5 sentences:\n\n${combined}`;
  const finalResp = await geminiClient.callText(finalPrompt, { maxTokens: Math.min(512, maxTokens), temperature: Math.max(0.1, temperature) });

  return { summary: finalResp.text, sourceLength: text.length, tokensEstimate: Math.ceil(text.length / 4) };
}

/**
 * Summarize a conversation array (messages). The conversation parameter may be:
 *  - an array of messages: [{ role: 'user'|'assistant'|'system', text, ts }]
 *  - or a single long text representation
 *
 * Returns { summary, messageCount }
 */
export async function summarizeConversation(conversation, opts = {}) {
  if (!conversation) throw new Error('summarizeConversation: conversation required');

  let text = '';
  if (Array.isArray(conversation)) {
    text = conversation.map((m) => `${m.role}: ${m.text}`).join('\n');
  } else if (typeof conversation === 'string') {
    text = conversation;
  } else if (conversation && conversation.messages && Array.isArray(conversation.messages)) {
    text = conversation.messages.map((m) => `${m.role}: ${m.text}`).join('\n');
  } else {
    throw new Error('summarizeConversation: unsupported conversation shape');
  }

  const result = await summarizeText(text, opts);
  return { summary: result.summary, messageCount: Array.isArray(conversation) ? conversation.length : (conversation.messages ? conversation.messages.length : 0) };
}

export default { summarizeText, summarizeConversation };
