// path: /memory/memoryManager.js
/**
 * Memory Manager facade
 * - Exposes conversationMemory, customerMemory and vectorMemory
 * - Central point to future RAG operations
 */

import conversationMemory from './conversationMemory.js';
import customerMemory from './customerMemory.js';
import vectorMemory from './vectorMemory.js';

export default {
  conversationMemory,
  customerMemory,
  vectorMemory
};
