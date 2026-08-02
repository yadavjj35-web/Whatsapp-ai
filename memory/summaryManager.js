// path: memory/summaryManager.js
/**
 * Summary Manager
 *
 * Coordinates conversation summarization and storage into conversation memory.
 * Uses summarizerService and conversationMemory (existing) to persist summaries.
 *
 * Exports:
 *  - createOrUpdateConversationSummary({ phone, conversationArray })
 *  - getConversationSummary(phone)
 *
 * This module depends on:
 *  - services/summarizerService.js
 *  - memory/conversationMemory.js (existing)
 *
 * Security:
 *  - Avoid storing full raw PII in summary; conversationMemory.saveAgentMemory is used for traceability
 */

import summarizerService from '../services/summarizerService.js';
import conversationMemory from './conversationMemory.js';
import logger from '../utils/logger.js';

async function createOrUpdateConversationSummary({ phone, conversation }, opts = {}) {
  if (!phone) throw new Error('phone required');
  if (!conversation) throw new Error('conversation required');

  try {
    const { summary, messageCount } = await summarizerService.summarizeConversation(conversation, opts);
    // Persist summary via conversationMemory.saveAgentMemory as system note
    const saved = await conversationMemory.saveAgentMemory(`summary-${phone}-${Date.now()}`, { phone, summary, messageCount, createdAt: new Date() });
    // Also return the summary
    await conversationMemory.appendMessage(phone, 'system', `Summary: ${summary}`, { summary: true, messageCount });
    return { summary, saved: !!saved };
  } catch (err) {
    logger.error('Failed to create conversation summary', { phone, error: err.message });
    throw err;
  }
}

async function getConversationSummary(phone) {
  if (!phone) throw new Error('phone required');
  // Try to find latest system message that contains a summary
  const convo = await conversationMemory.getConversation(phone);
  if (!convo) return null;
  // Search messages for system entries with meta.taskId like summary
  const msgs = convo.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'system' && typeof m.text === 'string' && m.text.startsWith('Summary:')) {
      return { summary: m.text.replace(/^Summary:\s*/i, ''), timestamp: m.timestamp || m.meta?.firstSeenAt || null };
    }
  }
  return null;
}

export default { createOrUpdateConversationSummary, getConversationSummary };
