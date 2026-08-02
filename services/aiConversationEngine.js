// path: services/aiConversationEngine.js
/**
 * AI Conversation Engine
 *
 * - Handles conversational requests: memory retrieval (RAG), prompt assembly, LLM call, response persist.
 * - Exposes:
 *   - handleUserMessage({ ownerId, phone, text, context })
 *
 * Flow:
 *  1. Index or retrieve context via memory/memoryManager and prompts/ragAssembler
 *  2. Build prompt (system + context + user message)
 *  3. Call geminiService.generateText or streamText
 *  4. Persist response to conversationMemory and log usage
 */

import ragAssembler from '../prompts/ragAssembler.js';
import memoryManager from '../memory/memoryManager.js';
import geminiService from './geminiService.js';
import conversationMemory from '../memory/conversationMemory.js';
import logger from '../utils/logger.js';
import aiUsageLogger from '../utils/aiUsageLogger.js';

export async function handleUserMessage({ ownerId, phone, text, topK = 5, tokenBudget = 1024, modelOptions = {} } = {}) {
  if (!phone || !text) throw new Error('phone and text required');

  // 1. Persist incoming message
  try {
    await conversationMemory.appendMessage(phone, 'user', text, { ownerId });
  } catch (e) {
    logger.warn('Failed to persist incoming conversation message', { phone, error: e.message });
  }

  // 2. Retrieve RAG context
  let contextBundle = { contextText: '', sources: [], totalTokens: 0 };
  try {
    contextBundle = await ragAssembler.assembleRagContext({ query: text, topK, tokenBudget });
  } catch (e) {
    logger.warn('RAG assembler failed, proceeding without context', { error: e.message });
  }

  // 3. Build prompt (simple pattern: system + context + user)
  const systemPrompt = process.env.SYSTEM_PROMPT || 'You are a helpful assistant.';
  const contextText = contextBundle.contextText ? `Context:\n${contextBundle.contextText}\n\n` : '';
  const prompt = `${systemPrompt}\n\n${contextText}User: ${text}\nAssistant:`;

  // 4. Call LLM
  let response = null;
  try {
    const resp = await geminiService.generateText(prompt, { ownerId, maxTokens: modelOptions.maxTokens || 512, temperature: modelOptions.temperature || 0.4 });
    response = resp.text || '';
  } catch (err) {
    logger.error('LLM generation failed', { error: err.message, phone, ownerId });
    // send fallback
    response = process.env.LLM_FALLBACK_RESPONSE || 'Sorry, I am unable to respond right now.';
  }

  // 5. Persist assistant response
  try {
    await conversationMemory.appendMessage(phone, 'assistant', response, { sources: contextBundle.sources });
  } catch (e) {
    logger.warn('Failed to persist assistant response', { phone, error: e.message });
  }

  // 6. Log usage (aiUsageLogger called inside geminiService, but add an audit)
  try {
    await aiUsageLogger.logUsage({ ownerId, model: modelOptions.model || process.env.GEMINI_MODEL, totalTokens: contextBundle.totalTokens });
  } catch (e) {
    // not fatal
  }

  return { reply: response, sources: contextBundle.sources };
}

export default { handleUserMessage };
